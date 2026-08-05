#!/usr/bin/env python
"""Decimate a survey point cloud OR a CAD mesh into a web-ready particle set.

Usage:
    python scripts/decimate-pointcloud.py <input> <output.json> [--name "Label"] [--points 12000] [--up auto|y|z]

Scan readers: .e57 (pye57), .pts (ASCII x y z [i r g b], streamed), .ply
(ascii or binary_little_endian, x/y/z floats). XYZ only.

Mesh readers (trimesh): .glb .gltf .obj .stl -- the Revit/SolidWorks entry
point (export the model to one of these first). The surface is sampled
area-weighted and each point carries an RGB from the mesh's material,
texture, or vertex color. glTF is Y-up; scan space is Z-up; --up auto
converts glb/gltf and trusts everything else (override if an OBJ/STL
comes in Y-up).

Pipeline: read/sample -> voxel-grid downsample to the target count ->
(scans only: radius-percentile outlier clip) -> center + uniform scale ->
shuffle -> quantize xyz to int16 -> base64.

Output JSON: {"name": str, "n": int, "data": base64 Int16 xyz triplets,
"rgb": base64 Uint8 rgb triplets (mesh bakes only)}. Decoded client-side
into Float32 particle targets. A 12k-point building is ~96 KB on the wire
before gzip (~132 KB with color).
"""
import argparse
import base64
import os
import sys

import numpy as np

CAP = 8_000_000  # max points held in memory before voxel pass


def read_e57(path):
    import pye57
    e57 = pye57.E57(path)
    count = e57.scan_count
    per_scan = max(1, CAP // max(count, 1))
    chunks = []
    for i in range(count):
        d = e57.read_scan(i, ignore_missing_fields=True)
        xyz = np.column_stack([d["cartesianX"], d["cartesianY"], d["cartesianZ"]])
        if len(xyz) > per_scan:
            xyz = xyz[np.random.default_rng(7).choice(len(xyz), per_scan, replace=False)]
        chunks.append(xyz.astype(np.float64))
        print("  scan %d/%d: kept %d pts" % (i + 1, count, len(xyz)), flush=True)
    return np.vstack(chunks)


def read_pts(path):
    est_lines = max(1, os.path.getsize(path) // 40)
    stride = max(1, est_lines // CAP)
    pts = []
    with open(path, "r", errors="ignore") as f:
        for i, line in enumerate(f):
            if i % stride:
                continue
            parts = line.split()
            if len(parts) < 3:
                continue
            try:
                pts.append((float(parts[0]), float(parts[1]), float(parts[2])))
            except ValueError:
                continue
            if len(pts) >= CAP:
                break
    return np.asarray(pts, dtype=np.float64)


def read_ply(path):
    with open(path, "rb") as f:
        header = []
        while True:
            line = f.readline().decode("ascii", errors="ignore").strip()
            header.append(line)
            if line == "end_header":
                break
        fmt = next(l.split()[1] for l in header if l.startswith("format"))
        n = int(next(l.split()[2] for l in header if l.startswith("element vertex")))
        props = [l.split() for l in header if l.startswith("property") and "list" not in l]
        names = [p[2] for p in props]
        typemap = {"float": "f4", "float32": "f4", "double": "f8", "float64": "f8",
                   "uchar": "u1", "uint8": "u1", "char": "i1", "int8": "i1",
                   "short": "i2", "ushort": "u2", "int": "i4", "uint": "u4"}
        if fmt == "ascii":
            ix = [names.index(a) for a in ("x", "y", "z")]
            pts = []
            for _ in range(n):
                parts = f.readline().split()
                pts.append([float(parts[i]) for i in ix])
            return np.asarray(pts, dtype=np.float64)
        if fmt != "binary_little_endian":
            raise SystemExit("unsupported ply format: " + fmt)
        dt = np.dtype([(p[2], typemap[p[1]]) for p in props])
        arr = np.frombuffer(f.read(n * dt.itemsize), dtype=dt, count=n)
        return np.column_stack([arr["x"], arr["y"], arr["z"]]).astype(np.float64)


def face_colors(m, fidx):
    """RGB (float 0-255) for each sampled face of a mesh.

    Order matters. A CAD exporter typically writes ONE flat PBR material
    per body with the appearance color in baseColorFactor and no texture
    image at all; trimesh reports that as kind == "texture", and calling
    to_color() on it discards the factor and hands back default gray.
    That silently flattened a whole SolidWorks assembly to one color, so
    the untextured-material case is checked explicitly."""
    fallback = np.full((len(fidx), 3), 180.0)
    try:
        vis = m.visual
        kind = getattr(vis, "kind", None)
        if kind == "vertex":
            vcol = np.asarray(vis.vertex_colors, dtype=np.float64)[:, :3]
            return vcol[m.faces[fidx]].mean(axis=1)
        if kind == "face":
            return np.asarray(vis.face_colors, dtype=np.float64)[fidx][:, :3]
        mat = getattr(vis, "material", None)
        has_image = any(getattr(mat, a, None) is not None
                        for a in ("baseColorTexture", "image", "emissiveTexture"))
        if kind == "texture" and has_image:
            vcol = np.asarray(vis.to_color().vertex_colors, dtype=np.float64)[:, :3]
            return vcol[m.faces[fidx]].mean(axis=1)
        flat = getattr(mat, "main_color", None)
        if flat is None:
            flat = getattr(mat, "baseColorFactor", None)
        if flat is None:
            flat = getattr(mat, "diffuse", None)
        if flat is not None:
            return np.tile(np.asarray(flat, dtype=np.float64)[:3], (len(fidx), 1))
    except Exception:
        pass
    return fallback


def mesh_label(m):
    """Best-effort identity for a mesh: material name plus node name."""
    parts = []
    mat = getattr(m.visual, "material", None)
    if mat is not None and getattr(mat, "name", None):
        parts.append(mat.name)
    node = m.metadata.get("name") or m.metadata.get("node")
    if node:
        parts.append(str(node))
    return " / ".join(parts)


def read_mesh(path, want, drop_terms=()):
    """Area-weighted surface sampling of a CAD mesh -> (xyz, rgb uint8).
    Oversamples 4x; the voxel pass downstream evens out the density.
    drop_terms: case-insensitive substrings; any mesh whose material or
    node name matches is excluded (site/topo/entourage in Revit exports
    otherwise eat the point budget -- a lawn has more area than a house)."""
    import trimesh
    loaded = trimesh.load(path)
    meshes = loaded.dump() if isinstance(loaded, trimesh.Scene) else [loaded]
    meshes = [m for m in meshes if isinstance(m, trimesh.Trimesh) and len(m.faces)]
    if drop_terms:
        kept = []
        for m in meshes:
            label = mesh_label(m).lower()
            if any(t in label for t in drop_terms):
                print("  dropping mesh: %s" % (mesh_label(m) or "(unnamed)"), flush=True)
            else:
                kept.append(m)
        meshes = kept
    if not meshes:
        raise SystemExit("no triangle geometry in " + path)
    areas = np.array([m.area for m in meshes], dtype=np.float64)
    total = float(areas.sum())
    n_over = want * 4
    pts_chunks, rgb_chunks = [], []
    for m, area in zip(meshes, areas):
        n = int(round(n_over * area / total))
        if n < 1:
            continue
        samples, fidx = trimesh.sample.sample_surface(m, n, seed=7)
        col = face_colors(m, fidx)
        pts_chunks.append(np.asarray(samples, dtype=np.float64))
        rgb_chunks.append(col)
    pts = np.vstack(pts_chunks)
    rgb = np.clip(np.round(np.vstack(rgb_chunks)), 0, 255).astype(np.uint8)
    print("  sampled %d pts across %d meshes" % (len(pts), len(meshes)), flush=True)
    return pts, rgb


def read_xyzrgb(path):
    """Plain-text colored point set: whitespace-separated 'x y z [r g b]'
    per line. This is what the Revit surface sampler emits (feet, Z-up,
    RGB 0-255). Returns (xyz float64, rgb uint8 or None)."""
    arr = np.loadtxt(path)
    if arr.ndim == 1:
        arr = arr.reshape(1, -1)
    pts = arr[:, :3].astype(np.float64)
    rgb = None
    if arr.shape[1] >= 6:
        rgb = np.clip(np.round(arr[:, 3:6]), 0, 255).astype(np.uint8)
    return pts, rgb


def yup_to_zup(pts):
    """glTF Y-up right-handed -> scan-space Z-up: (x, y, z) -> (x, -z, y)."""
    return np.column_stack([pts[:, 0], -pts[:, 2], pts[:, 1]])


def voxel_indices(pts, target):
    lo = pts.min(axis=0)
    span = pts.max(axis=0) - lo
    v = float(np.linalg.norm(span)) / 120.0
    idx = np.arange(len(pts))
    for _ in range(14):
        keys = np.floor((pts - lo) / v).astype(np.int64)
        h = keys[:, 0] + (keys[:, 1] << 21) + (keys[:, 2] << 42)
        _, idx = np.unique(h, return_index=True)
        n = len(idx)
        if n > target * 1.12:
            v *= (n / target) ** (1.0 / 3.0) * 1.03
        elif n < target * 0.88:
            v /= ((target / max(n, 1)) ** (1.0 / 3.0)) * 1.03
        else:
            break
    return np.sort(idx)


def voxel_downsample(pts, target):
    return pts[voxel_indices(pts, target)]


def outlier_indices(pts, keep=0.995):
    c = pts.mean(axis=0)
    r = np.linalg.norm(pts - c, axis=1)
    return np.flatnonzero(r <= np.quantile(r, keep))


def clip_outliers(pts, keep=0.995):
    return pts[outlier_indices(pts, keep)]


def robust_indices(pts):
    """Iteratively shed distant stray geometry (mis-registered scan
    setups, reflections, range noise -- or in CAD exports, sprawling
    low-area elements like curbs and fences) until the max radius is
    commensurate with the median. A single stray cluster otherwise eats
    the int16 quantization range and crushes the building into a
    corner/slab."""
    keep = np.arange(len(pts))
    cur = pts
    for _ in range(10):
        c = cur.mean(axis=0)
        r = np.linalg.norm(cur - c, axis=1)
        med = np.median(r)
        if med <= 0 or r.max() <= 3.5 * med:
            break
        sel = r <= np.quantile(r, 0.985)
        keep = keep[sel]
        cur = pts[keep]
    return keep


def robust_clip(pts):
    return pts[robust_indices(pts)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--name", default=None)
    ap.add_argument("--points", type=int, default=12000)
    ap.add_argument("--up", choices=["auto", "y", "z"], default="auto",
                    help="input up axis; auto = y for glb/gltf, z otherwise")
    ap.add_argument("--drop", default="",
                    help="comma-separated name substrings; matching meshes are excluded (e.g. site,topo,grass)")
    args = ap.parse_args()

    ext = os.path.splitext(args.input)[1].lower()
    print("reading %s ..." % args.input, flush=True)
    rgb = None
    if ext in (".glb", ".gltf", ".obj", ".stl", ".txt", ".xyz", ".xyzrgb"):
        if ext in (".glb", ".gltf", ".obj", ".stl"):
            drop = tuple(t.strip().lower() for t in args.drop.split(",") if t.strip())
            pts, rgb = read_mesh(args.input, args.points, drop)
            up = args.up if args.up != "auto" else ("y" if ext in (".glb", ".gltf") else "z")
        else:
            # colored text point set (Revit sampler output): already points,
            # feet, Z-up -- no surface sampling, no axis flip by default
            pts, rgb = read_xyzrgb(args.input)
            up = args.up if args.up != "auto" else "z"
            print("  loaded %d colored points" % len(pts), flush=True)
        if up == "y":
            pts = yup_to_zup(pts)
        keep = np.isfinite(pts).all(axis=1)
        pts = pts[keep]
        if rgb is not None:
            rgb = rgb[keep]
        # CAD/scan alike: sprawl (curbs, wires, stray survey-origin points)
        # reaches far past the building at negligible density and would eat
        # the int16 quantization range, so clip radius, voxel, clip again --
        # all index-based so rgb rides along
        for step in (robust_indices, lambda p: voxel_indices(p, args.points), robust_indices):
            idx = step(pts)
            pts = pts[idx]
            if rgb is not None:
                rgb = rgb[idx]
    else:
        if ext == ".e57":
            pts = read_e57(args.input)
        elif ext == ".pts":
            pts = read_pts(args.input)
        elif ext == ".ply":
            pts = read_ply(args.input)
        else:
            raise SystemExit("unsupported extension: " + ext)
        pts = pts[np.isfinite(pts).all(axis=1)]
        print("loaded %d pts; voxel downsampling to ~%d ..." % (len(pts), args.points), flush=True)
        pts = robust_clip(pts)
        pts = clip_outliers(pts)
        pts = voxel_downsample(pts, args.points)
        pts = robust_clip(pts)
        pts = clip_outliers(pts, 0.999)
    print("decimated to %d pts" % len(pts), flush=True)

    center = pts.mean(axis=0)
    pts = pts - center
    scale = 32767.0 / np.abs(pts).max()
    q = np.clip(np.round(pts * scale), -32767, 32767).astype("<i2")

    rng = np.random.default_rng(7)
    perm = rng.permutation(len(q))
    q = q[perm]
    if rgb is not None:
        rgb = rgb[perm]

    name = args.name or os.path.splitext(os.path.basename(args.input))[0]
    out = {
        "name": name,
        "n": int(len(q)),
        "data": base64.b64encode(q.tobytes()).decode("ascii"),
    }
    if rgb is not None:
        out["rgb"] = base64.b64encode(rgb.tobytes()).decode("ascii")
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w") as f:
        import json
        json.dump(out, f)
        f.write("\n")  # repo pre-commit end-of-file-fixer expects this
    print("wrote %s (%.0f KB, %d pts)" % (args.output, os.path.getsize(args.output) / 1024, len(q)), flush=True)


if __name__ == "__main__":
    main()
