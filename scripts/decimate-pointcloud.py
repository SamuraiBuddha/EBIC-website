#!/usr/bin/env python
"""Decimate a survey point cloud into a compact web-ready particle set.

Usage:
    python scripts/decimate-pointcloud.py <input> <output.json> [--name "Label"] [--points 12000]

Readers: .e57 (pye57), .pts (ASCII x y z [i r g b], streamed), .ply
(ascii or binary_little_endian, x/y/z floats).

Pipeline: stride-subsample to a workable size -> voxel-grid downsample to
the target count -> radius-percentile outlier clip -> center + uniform
scale -> shuffle -> quantize to int16 -> base64.

Output JSON: {"name": str, "n": int, "data": base64 Int16 xyz triplets}
Decoded client-side into a Float32 particle target array. A 12k-point
building is ~96 KB on the wire before gzip.
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


def voxel_downsample(pts, target):
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
    return pts[np.sort(idx)]


def clip_outliers(pts, keep=0.995):
    c = pts.mean(axis=0)
    r = np.linalg.norm(pts - c, axis=1)
    return pts[r <= np.quantile(r, keep)]


def robust_clip(pts):
    """Iteratively shed distant stray clusters (mis-registered setups,
    reflections, range noise) until the max radius is commensurate with
    the median. A single stray cluster otherwise eats the int16
    quantization range and crushes the actual building into a corner."""
    for _ in range(10):
        c = pts.mean(axis=0)
        r = np.linalg.norm(pts - c, axis=1)
        med = np.median(r)
        if med <= 0 or r.max() <= 3.5 * med:
            break
        pts = pts[r <= np.quantile(r, 0.985)]
    return pts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--name", default=None)
    ap.add_argument("--points", type=int, default=12000)
    args = ap.parse_args()

    ext = os.path.splitext(args.input)[1].lower()
    print("reading %s ..." % args.input, flush=True)
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
    q = q[rng.permutation(len(q))]

    name = args.name or os.path.splitext(os.path.basename(args.input))[0]
    out = {
        "name": name,
        "n": int(len(q)),
        "data": base64.b64encode(q.tobytes()).decode("ascii"),
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w") as f:
        import json
        json.dump(out, f)
    print("wrote %s (%.0f KB, %d pts)" % (args.output, os.path.getsize(args.output) / 1024, len(q)), flush=True)


if __name__ == "__main__":
    main()
