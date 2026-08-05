/* =====================================================================
   EBIC particle stage -- reusable engine
   =====================================================================
   Real EBIC survey point clouds and BIM/CAD geometry, decimated by
   scripts/decimate-pointcloud.py to ~12k points each, rendered as a
   swirling particle field that materializes into the scanned object.

   Two backends behind one simulation: a premultiplied-colour batched
   Canvas2D path, and a WebGL2 path that reproduces the same math in the
   vertex shader. No external dependencies. ASCII source. Reduced-motion
   safe.

   Extracted from showcase/index.html so the full-screen showcase page and
   the compact homepage hero band run the same engine instead of two
   diverging copies.

   Usage:
     EBICParticles({
       root:       element containing .p-cloud (and optionally .p-hud,
                   .p-hint, .p-loading),
       cloudDir:   path to assets/clouds/ from THIS page,
       storageKey: localStorage key for tuning (lab pages only),
       params:     overrides for the baked defaults, e.g. { points: 14000 },
       lab:        build the Galaxy Lab tuning panel (expects #lab markup),
       wheelZoom:  capture the scroll wheel for zoom. Leave false on any
                   page the visitor needs to scroll past.
     });
   ===================================================================== */

window.EBICParticles = function (opts) {
  "use strict";
  opts = opts || {};
  var REDUCED = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var FINE = window.matchMedia &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* Clouds baked by scripts/decimate-pointcloud.py. Fetched in order;
     missing files are skipped, so newly baked buildings join the
     rotation automatically. */
  var MANIFEST = [
    "coastalglass", "atlanta", "whitney", "ebko", "homeaddition",
    "lunarrover", "speakerbox", "polywell", "carproject", "nastybaggers"
  ];
  /* Optional local-only extras (assets/clouds/local/manifest.json, git
     ignored): datasets we may demo but must not publish. Absent in the
     deployed site, so the fetch simply 404s and is skipped. */
  var CLOUD_DIR = opts.cloudDir || "assets/clouds/";
  var LOCAL_MANIFEST = CLOUD_DIR + "local/manifest.json";

  var root = opts.root;
  if (!root) { throw new Error("EBICParticles: opts.root is required"); }
  var canvas = root.querySelector(".p-cloud");
  var hud = root.querySelector(".p-hud");
  var loading = root.querySelector(".p-loading");
  var hint = root.querySelector(".p-hint");
  if (!canvas || !canvas.getContext) { return; }
  var ctx = canvas.getContext("2d");

  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0;

  /* tunable parameters -- driven by the control panel, persisted to
     localStorage. Multipliers are relative to the baked-in defaults. */
  var DEFAULTS = {
    renderer: 0, points: 22000, shape: 0, bodySize: 1.0, thickness: 1.0, gravity: 0.0,
    rotSpeed: 1.0, swirlSpeed: 1.0, coalesce: 1.0, particleSize: 1.0,
    coreSize: 1.0, hazeReach: 1.0, glow: 1.0,
    twinkleRate: 1.0, twinkleSpeed: 1.0, twinkleSize: 1.0
  };
  for (var ok in (opts.params || {})) { DEFAULTS[ok] = opts.params[ok]; }
  var STORE = opts.storageKey || "ebicGalaxy";
  var P;
  /* Only the tuning lab persists overrides; a page without the lab always
     starts from the caller's params so a stale localStorage blob from the
     showcase cannot silently restyle the homepage hero. */
  try { P = opts.lab ? (JSON.parse(localStorage.getItem(STORE)) || {}) : {}; } catch (e) { P = {}; }
  for (var dk in DEFAULTS) { if (typeof P[dk] !== "number") { P[dk] = DEFAULTS[dk]; } }
  /* URL override: ?gl=1 forces WebGL, ?gl=0 forces Canvas2D */
  var glq = (location.search.match(/[?&]gl=([01])/) || [])[1];
  if (glq === "1") { P.renderer = 0; } else if (glq === "0") { P.renderer = 1; }

  var SHAPE_DISC = 0, SHAPE_SPHERE = 1, SHAPE_TOROID = 2;
  var SPARK_BASE_RATE = 55;   /* twinkles/sec at twinkleRate 1 */
  var SPARK_BASE_LIFE = 1.1;  /* decay seconds at twinkleSpeed 1 */

  var POOL = 0;
  var swirl, target, galCol, bldCol, sparkP, sparkH;
  var sparkAcc = 0, hasRGB = false;

  /* ---------- WebGL2 (Tier 2 GPU-compute) renderer state ---------- */
  var MAXP = 40000;               /* GL buffer capacity == Points slider max */
  var GL = null;                  /* handles, programs, buffers, uniform locs */
  var glOK = false, useGL = false, glcanvas = null;

  function alloc(n) {
    POOL = n;
    swirl = new Float32Array(POOL * 4);  /* r01, angle0, angSpeed, u01 */
    target = new Float32Array(POOL * 3); /* current model, unit coords */
    galCol = new Uint8Array(POOL * 3);   /* galaxy travel color, by radius */
    bldCol = new Uint8Array(POOL * 3);   /* model color: baked rgb or ramp */
    sparkP = new Float32Array(POOL);     /* crystal-sparkle phase, 1 -> 0 */
    sparkH = new Float32Array(POOL);     /* crystal-sparkle hue, 0..1 */
  }

  /* additive draw batched by premultiplied color: in "lighter" mode a
     particle contributes (r*a, g*a, b*a), so premultiplying folds alpha
     into the color and every particle sharing a quantized premult color
     is one fillStyle set + a run of fillRects, instead of a per-particle
     rgba string. That is the whole ballgame for the point ceiling. */
  var bkX = [], bkY = [], bkS = [], bkStyle = [], inUse = [], used = [];
  /* sparkle-spike draw list (collected in the loop, drawn last) */
  var spX = [], spY = [], spL = [], spSz = [], spR = [], spG = [], spB = [];
  /* fps meter */
  var fpsFrames = 0, fpsClock = 0, fpsVal = 0, fpsEl = null;
  function bucketStyle(key) {
    if (bkStyle[key]) { return bkStyle[key]; }
    var r = ((key >> 10) & 31) * 8 + 4;
    var g = ((key >> 5) & 31) * 8 + 4;
    var b = (key & 31) * 8 + 4;
    return (bkStyle[key] = "rgb(" + r + "," + g + "," + b + ")");
  }

  var clouds = [];
  var current = -1;
  var M = 0, Mgoal = 0;      /* materialization 0..1 */
  var hover = false, switching = false;
  var yaw = 0, tiltX = 0, tiltY = 0, tgtTiltX = 0, tgtTiltY = 0;
  var cloudZoom = 1;
  var zoomGoal = 1, zoom = 1;   /* scroll-wheel zoom, smoothed */

  function sizeCanvas() {
    var r = canvas.parentNode.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (glcanvas) { glcanvas.width = W * DPR; glcanvas.height = H * DPR; }
    if (GL) { GL.gl.viewport(0, 0, W * DPR, H * DPR); }
  }

  function galaxyTone(n) {
    /* luminescent gold-white core -> blue arms -> deep indigo rim */
    var r, g, b;
    if (n < 0.5) {
      var s = n / 0.5;
      r = 255 + (74 - 255) * s;
      g = 236 + (132 - 236) * s;
      b = 205 + (240 - 205) * s;
    } else {
      var u = (n - 0.5) / 0.5;
      r = 74 + (46 - 74) * u;
      g = 132 + (34 - 132) * u;
      b = 240 + (120 - 240) * u;
    }
    return [r, g, b];
  }

  function seedSwirl() {
    for (var i = 0; i < POOL; i++) {
      /* r01: normalized radius, core-concentrated. angle0/angSpeed: the
         swirl. u01: second shape param (disc height / sphere polar /
         toroid tube), also the color-ramp input. */
      var r01 = Math.pow(Math.random(), 0.6);
      swirl[i * 4] = r01;
      swirl[i * 4 + 1] = Math.random() * 6.2832;
      swirl[i * 4 + 2] = (0.05 + Math.random() * 0.12) * (Math.random() < 0.12 ? 1.9 : 1);
      swirl[i * 4 + 3] = Math.random();
      var jit = 0.88 + Math.random() * 0.24;
      var tone = galaxyTone(r01);
      galCol[i * 3] = Math.min(255, tone[0] * jit) | 0;
      galCol[i * 3 + 1] = Math.min(255, tone[1] * jit) | 0;
      galCol[i * 3 + 2] = Math.min(255, tone[2] * jit) | 0;
    }
    if (glOK) { glSyncStatic(); }
  }

  function sparkTone(h) {
    /* full-saturation jewel hue for the crystal twinkle */
    var i = (h * 6) | 0, f = h * 6 - i, q = 1 - f;
    switch (i % 6) {
      case 0: return [255, f * 255, 40];
      case 1: return [q * 255, 255, 40];
      case 2: return [40, 255, f * 255];
      case 3: return [40, q * 255, 255];
      case 4: return [f * 255, 40, 255];
      default: return [255, 40, q * 255];
    }
  }

  function decode(json) {
    var bin = atob(json.data);
    var n = json.n;
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
    var ints = new Int16Array(bytes.buffer);
    var pts = new Float32Array(n * 3);
    for (var p = 0; p < n * 3; p++) { pts[p] = ints[p] / 32767; }
    var rgb = null;
    if (json.rgb) {
      var rbin = atob(json.rgb);
      rgb = new Uint8Array(rbin.length);
      for (var k = 0; k < rbin.length; k++) { rgb[k] = rbin.charCodeAt(k); }
    }
    return { name: json.name, n: n, pts: pts, rgb: rgb };
  }

  function applyCloud(idx) {
    current = idx;
    var c = clouds[idx];
    /* elevation range for the color ramp (z is up in scan space) */
    var zmin = 1, zmax = -1;
    for (var k = 0; k < c.n; k++) {
      var z = c.pts[k * 3 + 2];
      if (z < zmin) { zmin = z; } if (z > zmax) { zmax = z; }
    }
    var zspan = Math.max(zmax - zmin, 0.001);
    /* long thin buildings normalize small against their major axis;
       zoom the presentation by inverse RMS radius so every scan fills
       a comparable share of the stage */
    var sum = 0;
    for (var m = 0; m < c.n; m++) {
      var mx = c.pts[m * 3], my = c.pts[m * 3 + 1], mz = c.pts[m * 3 + 2];
      sum += mx * mx + my * my + mz * mz;
    }
    cloudZoom = Math.min(2.2, Math.max(1, 0.62 / Math.sqrt(sum / c.n)));
    hasRGB = !!c.rgb;
    /* Baked clouds hold ~12k points. When POOL exceeds c.n the wrap-around
       copies would land on the SAME coordinates as existing points and add no
       visible density -- which is why raising Points thickened the galaxy but
       not the resolved object. Jitter each duplicate copy into the gaps so the
       object densifies too. First pass (i < c.n) stays exactly on the real
       scan points for fidelity; only copies get nudged. */
    var jr = 0.012;
    for (var i = 0; i < POOL; i++) {
      var j = (i % c.n) * 3;
      if (i < c.n) {
        target[i * 3] = c.pts[j];
        target[i * 3 + 1] = c.pts[j + 1];
        target[i * 3 + 2] = c.pts[j + 2];
      } else {
        target[i * 3] = c.pts[j] + (Math.random() - 0.5) * jr;
        target[i * 3 + 1] = c.pts[j + 1] + (Math.random() - 0.5) * jr;
        target[i * 3 + 2] = c.pts[j + 2] + (Math.random() - 0.5) * jr;
      }
      if (hasRGB) {
        bldCol[i * 3] = c.rgb[j];
        bldCol[i * 3 + 1] = c.rgb[j + 1];
        bldCol[i * 3 + 2] = c.rgb[j + 2];
      } else {
        var e = (c.pts[j + 2] - zmin) / zspan;
        /* elevation ramp: deep brand blue -> light blue; ~5% orange accents */
        var acc = Math.random() < 0.05;
        bldCol[i * 3] = acc ? 255 : Math.round(60 + e * 100);
        bldCol[i * 3 + 1] = acc ? 107 : Math.round(110 + e * 90);
        bldCol[i * 3 + 2] = acc ? 53 : Math.round(190 + e * 55);
      }
    }
    if (glOK) { glSyncCloud(); }
    updateHud();
  }

  function updateHud() {
    if (!hud) { return; }
    var c = clouds[current];
    hud.innerHTML = "DATASET " + (current + 1) + "/" + clouds.length +
      " / <b>" + c.name.toUpperCase() + "</b> / <span class=\"pts\">" +
      c.n.toLocaleString() + " PTS</span>";
  }

  function nextCloud() {
    if (clouds.length < 2 || switching) { return; }
    switching = true;
    var next = (current + 1) % clouds.length;
    var wait = window.setInterval(function () {
      if (M < 0.06) {
        window.clearInterval(wait);
        applyCloud(next);
        switching = false;
      }
    }, 60);
  }

  var last = null;

  /* frame() advances the shared simulation state (rotation, materialize,
     tilt, zoom, fps) once, computes the projection scalars both backends
     need, then dispatches to whichever renderer is active. Nothing about
     the controls, datasets, or DOM knows which backend is drawing. */
  function frame(ts) {
    if (last === null) { last = ts; }
    var dt = Math.min((ts - last) / 1000, 0.08);
    last = ts;

    if (!REDUCED) { yaw += dt * 0.22 * P.rotSpeed; }
    Mgoal = switching ? 0 : (hover || !FINE || REDUCED ? 1 : 0);
    M += (Mgoal - M) * Math.min(dt * 2.2 * P.coalesce, 1);
    tiltX += (tgtTiltX - tiltX) * Math.min(dt * 3, 1);
    tiltY += (tgtTiltY - tiltY) * Math.min(dt * 3, 1);
    zoom += (zoomGoal - zoom) * Math.min(dt * 6, 1);

    /* fps meter */
    fpsFrames++; fpsClock += dt;
    if (fpsClock >= 0.5) {
      fpsVal = Math.round(fpsFrames / fpsClock);
      fpsFrames = 0; fpsClock = 0;
      if (fpsEl) { fpsEl.textContent = fpsVal + " fps"; }
    }

    var pitch = -0.42 + tiltY;
    var S = {
      t: ts / 1000, dt: dt,
      R: Math.min(W, H) * 0.36 * (1 + (cloudZoom - 1) * M) * zoom,
      cx: W * (W > 900 ? 0.62 : 0.5), cy: H * 0.46, f: 2.4,
      cosY: Math.cos(yaw + tiltX), sinY: Math.sin(yaw + tiltX),
      cosP: Math.cos(pitch), sinP: Math.sin(pitch)
    };

    if (useGL) { drawGL(S); } else { drawCanvas(S); }
    window.requestAnimationFrame(frame);
  }

  /* ---------- Canvas2D backend (original, premult-color batched) ---------- */
  function drawCanvas(S) {
    var t = S.t, dt = S.dt, R = S.R, cx = S.cx, cy = S.cy, f = S.f;
    var cosY = S.cosY, sinY = S.sinY, cosP = S.cosP, sinP = S.sinP;

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";  /* additive: bloom + haze */

    /* luminescent core: a wide dense haze halo + a bright core orb, both
       fading out as the model materializes; their overlap builds a
       luminous 3D-sphere falloff at the centre */
    var glowStr = (1 - M) * P.glow;
    if (glowStr > 0.02 && !REDUCED) {
      var hr = R * 1.25 * P.hazeReach * zoom;
      var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, hr);
      halo.addColorStop(0.0, "rgba(255,245,222," + (0.34 * glowStr).toFixed(3) + ")");
      halo.addColorStop(0.16, "rgba(214,208,255," + (0.26 * glowStr).toFixed(3) + ")");
      halo.addColorStop(0.42, "rgba(120,150,255," + (0.14 * glowStr).toFixed(3) + ")");
      halo.addColorStop(0.72, "rgba(74,80,180," + (0.06 * glowStr).toFixed(3) + ")");
      halo.addColorStop(1.0, "rgba(50,50,140,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(cx - hr, cy - hr, hr * 2, hr * 2);

      var cr0 = R * 0.55 * P.coreSize * zoom;
      var core = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr0);
      core.addColorStop(0.0, "rgba(255,251,238," + (0.6 * glowStr).toFixed(3) + ")");
      core.addColorStop(0.28, "rgba(255,244,216," + (0.42 * glowStr).toFixed(3) + ")");
      core.addColorStop(0.6, "rgba(255,226,180," + (0.2 * glowStr).toFixed(3) + ")");
      core.addColorStop(1.0, "rgba(255,214,160,0)");
      ctx.fillStyle = core;
      ctx.fillRect(cx - cr0, cy - cr0, cr0 * 2, cr0 * 2);
    }

    /* crystal sparkle (ARGB "twinkle"): ignite random particles to a
       vivid hue at full brightness, then decay */
    if (!REDUCED) {
      sparkAcc += SPARK_BASE_RATE * P.twinkleRate * dt;
      var spawn = sparkAcc | 0;
      sparkAcc -= spawn;
      for (var q = 0; q < spawn; q++) {
        var si = (Math.random() * POOL) | 0;
        sparkP[si] = 1;
        sparkH[si] = Math.random();
      }
    }
    var sparkDecay = dt * P.twinkleSpeed / SPARK_BASE_LIFE;

    var shp = P.shape;
    var bodyR = 1.35 * P.bodySize;
    var spin = REDUCED ? 0 : P.swirlSpeed;

    for (var i = 0; i < POOL; i++) {
      var r01 = swirl[i * 4];
      var sa = swirl[i * 4 + 1] + t * swirl[i * 4 + 2] * spin;
      var u = swirl[i * 4 + 3];
      var sx, sy, sz, rr;

      if (shp === SHAPE_SPHERE) {
        var phi = u * 3.14159265;
        rr = (0.5 + 0.5 * r01) * bodyR;
        var sinp = Math.sin(phi);
        sx = sinp * Math.cos(sa) * rr;
        sy = sinp * Math.sin(sa) * rr;
        sz = Math.cos(phi) * rr * P.thickness;
      } else if (shp === SHAPE_TOROID) {
        var tube = u * 6.2831853;
        var minR = 0.34 * bodyR * P.thickness;
        var ring = 0.72 * bodyR + minR * Math.cos(tube);
        sx = ring * Math.cos(sa);
        sy = ring * Math.sin(sa);
        sz = minR * Math.sin(tube);
      } else {
        rr = r01 * bodyR;
        sx = Math.cos(sa) * rr;
        sy = Math.sin(sa) * rr;
        sz = (u - 0.5) * 0.5 * P.thickness * (0.7 + 0.3 * Math.sin(t * 0.4 + i));
      }
      /* gravity: dish the body downward, outer particles sag most */
      if (P.gravity > 0) { sz -= P.gravity * (0.2 + 0.8 * r01) * bodyR * 0.6; }

      var bx = target[i * 3], by = target[i * 3 + 1], bz = target[i * 3 + 2];

      var stag = (i % 997) / 997;
      var tt = M * 1.35 - stag * 0.35;
      if (tt < 0) { tt = 0; } if (tt > 1) { tt = 1; }
      tt = tt * tt * (3 - 2 * tt);

      var x = sx + (bx - sx) * tt;
      var y = sy + (by - sy) * tt;
      var z = sz + (bz - sz) * tt;

      var rx = x * cosY - y * sinY;
      var ry = x * sinY + y * cosY;
      var rz2 = z * cosP - ry * sinP;
      var rd = ry * cosP + z * sinP;

      var per = f / (f + rd);
      var px = cx + rx * R * per;
      var py = cy - rz2 * R * per;
      if (px < -4 || px > W + 4 || py < -4 || py > H + 4) {
        if (sparkP[i] > 0) { sparkP[i] -= sparkDecay; }
        continue;
      }

      var cmix = tt;
      if (hasRGB) { cmix = tt > 0.55 ? (tt - 0.55) / 0.45 : 0; }
      var cr = galCol[i * 3] + (bldCol[i * 3] - galCol[i * 3]) * cmix;
      var cg = galCol[i * 3 + 1] + (bldCol[i * 3 + 1] - galCol[i * 3 + 1]) * cmix;
      var cb = galCol[i * 3 + 2] + (bldCol[i * 3 + 2] - galCol[i * 3 + 2]) * cmix;

      var a = (0.2 + 0.55 * per * per) * (0.5 + tt * 0.5);
      if (M < 0.98) {
        var gb = 1 - r01;
        a += gb * gb * 0.75 * (1 - M) * P.glow;
      }

      var s = (per > 1.05 ? 2.0 : per > 0.9 ? 1.5 : 1.1) * P.particleSize;
      var sp = sparkP[i];
      if (sp > 0) {
        var st = sparkTone(sparkH[i]);
        cr += (st[0] - cr) * sp;
        cg += (st[1] - cg) * sp;
        cb += (st[2] - cb) * sp;
        a += sp * 0.6;
        sparkP[i] = sp - sparkDecay;
      }
      if (a > 1) { a = 1; }

      /* premultiply alpha into color and bucket by the quantized result */
      var pr = (cr * a) | 0, pg = (cg * a) | 0, pb = (cb * a) | 0;
      var key = ((pr >> 3) << 10) | ((pg >> 3) << 5) | (pb >> 3);
      if (key) {
        if (!inUse[key]) {
          inUse[key] = 1;
          if (!bkX[key]) { bkX[key] = []; bkY[key] = []; bkS[key] = []; }
          used.push(key);
        }
        bkX[key].push(px); bkY[key].push(py); bkS[key].push(s);
      }

      if (sp > 0.2) {
        var len = (2 + sp * 5) * P.twinkleSize;
        spX.push(px); spY.push(py); spL.push(len); spSz.push(s);
        spR.push(pr); spG.push(pg); spB.push(pb);
      }
    }

    /* one fillStyle set + a run of fillRects per quantized color */
    for (var k = 0; k < used.length; k++) {
      var b = used[k];
      ctx.fillStyle = bucketStyle(b);
      var xs = bkX[b], ys = bkY[b], ss = bkS[b], m = xs.length;
      for (var qq = 0; qq < m; qq++) { ctx.fillRect(xs[qq], ys[qq], ss[qq], ss[qq]); }
      xs.length = 0; ys.length = 0; ss.length = 0; inUse[b] = 0;
    }
    used.length = 0;

    /* crystalline glints last, on top */
    for (var sk = 0; sk < spX.length; sk++) {
      ctx.fillStyle = "rgb(" + spR[sk] + "," + spG[sk] + "," + spB[sk] + ")";
      var L = spL[sk], ps = spSz[sk];
      ctx.fillRect(spX[sk] - L, spY[sk], L * 2 + ps, 0.8);
      ctx.fillRect(spX[sk], spY[sk] - L, 0.8, L * 2 + ps);
    }
    spX.length = 0; spY.length = 0; spL.length = 0; spSz.length = 0;
    spR.length = 0; spG.length = 0; spB.length = 0;

    ctx.globalCompositeOperation = "source-over";
  }

  /* ---------- WebGL2 backend (Tier 2: per-particle math in the shader) ----
     Every particle's swirl seed, target position, and both colors live in
     static GPU buffers uploaded once; the vertex shader reproduces the exact
     Canvas2D math (shape -> coalesce lerp -> 3D rotate -> project), and every
     control is a uniform. Twinkle is a per-vertex hash instead of CPU random
     writes. Additive blending replaces the premult-color bucket trick.

     MODULATION SEAM: uniforms read P.* through effVal() below. Today it is a
     pass-through, but an audio/LFO layer can later add a per-parameter
     modulation here without touching the shader or the panel -- that is the
     hook for a Winamp-style FFT visualizer. */
  function effVal(key) { return P[key]; }   /* base + (future) modulation */

  var VS_SRC =
    "#version 300 es\n" +
    "precision highp float;\n" +
    "layout(location=0) in vec4 a_swirl;\n" +   /* r01, angle0, angSpeed, u01 */
    "layout(location=1) in vec3 a_target;\n" +
    "layout(location=2) in vec3 a_galcol;\n" +
    "layout(location=3) in vec3 a_bldcol;\n" +
    "uniform float u_time,u_M,u_spin,u_shape,u_bodyR,u_thickness,u_gravity;\n" +
    "uniform float u_cosY,u_sinY,u_cosP,u_sinP,u_f,u_R,u_cx,u_cy,u_W,u_H,u_DPR;\n" +
    "uniform float u_particleSize,u_glow,u_hasRGB,u_twRate,u_twSpeed,u_twSize,u_pool;\n" +
    "out vec3 v_color; out float v_alpha; out float v_spark;\n" +
    "const float PI=3.14159265, TAU=6.2831853;\n" +
    "float hash11(float p){ p=fract(p*0.1031); p*=p+33.33; p*=p+p; return fract(p); }\n" +
    "vec3 sparkTone(float h){ float i=floor(h*6.0); float f=h*6.0-i; float q=1.0-f; int m=int(mod(i,6.0));\n" +
    "  if(m==0) return vec3(1.0,f,0.157); if(m==1) return vec3(q,1.0,0.157); if(m==2) return vec3(0.157,1.0,f);\n" +
    "  if(m==3) return vec3(0.157,q,1.0); if(m==4) return vec3(f,0.157,1.0); return vec3(1.0,0.157,q); }\n" +
    "void main(){\n" +
    "  float id=float(gl_VertexID);\n" +
    "  float r01=a_swirl.x; float sa=a_swirl.y + u_time*a_swirl.z*u_spin; float u=a_swirl.w;\n" +
    "  float sx,sy,sz,rr;\n" +
    "  if(u_shape>1.5){ float tube=u*TAU; float minR=0.34*u_bodyR*u_thickness; float ring=0.72*u_bodyR+minR*cos(tube);\n" +
    "    sx=ring*cos(sa); sy=ring*sin(sa); sz=minR*sin(tube); }\n" +
    "  else if(u_shape>0.5){ float phi=u*PI; rr=(0.5+0.5*r01)*u_bodyR; float sp=sin(phi);\n" +
    "    sx=sp*cos(sa)*rr; sy=sp*sin(sa)*rr; sz=cos(phi)*rr*u_thickness; }\n" +
    "  else { rr=r01*u_bodyR; sx=cos(sa)*rr; sy=sin(sa)*rr; sz=(u-0.5)*0.5*u_thickness*(0.7+0.3*sin(u_time*0.4+id)); }\n" +
    "  if(u_gravity>0.0){ sz -= u_gravity*(0.2+0.8*r01)*u_bodyR*0.6; }\n" +
    "  float stag=mod(id,997.0)/997.0; float tt=clamp(u_M*1.35-stag*0.35,0.0,1.0); tt=tt*tt*(3.0-2.0*tt);\n" +
    "  vec3 pos=mix(vec3(sx,sy,sz), a_target, tt);\n" +
    "  float rx=pos.x*u_cosY-pos.y*u_sinY; float ry=pos.x*u_sinY+pos.y*u_cosY;\n" +
    "  float rz2=pos.z*u_cosP-ry*u_sinP; float rd=ry*u_cosP+pos.z*u_sinP;\n" +
    "  float per=u_f/(u_f+rd); float px=u_cx+rx*u_R*per; float py=u_cy-rz2*u_R*per;\n" +
    "  float cmix=tt; if(u_hasRGB>0.5){ cmix = tt>0.55 ? (tt-0.55)/0.45 : 0.0; }\n" +
    "  vec3 col=mix(a_galcol, a_bldcol, cmix);\n" +
    "  float a=(0.2+0.55*per*per)*(0.5+tt*0.5);\n" +
    "  if(u_M<0.98){ float gb=1.0-r01; a += gb*gb*0.75*(1.0-u_M)*u_glow; }\n" +
    "  float spark=0.0;\n" +
    "  if(u_twRate>0.001){ float h0=hash11(id*1.7); float life=1.1/u_twSpeed;\n" +
    "    float period=(u_pool/(55.0*u_twRate))*(0.6+0.8*h0);\n" +   /* match CPU model: fixed spawns/sec, so lit fraction ~ 55*rate/pool */
    "    float tt2=u_time+hash11(id*3.1)*period; float cyc=floor(tt2/period); float since=tt2-cyc*period;\n" +
    "    if(since<life){ spark=1.0-since/life; col=mix(col, sparkTone(hash11(id*5.3+cyc*13.0)), spark); a += spark*0.6; } }\n" +
    "  a=min(a,1.0);\n" +
    "  v_color=col; v_alpha=a; v_spark=spark;\n" +
    "  float s=(per>1.05?2.0:(per>0.9?1.5:1.1))*u_particleSize; float sizePx=s*u_DPR;\n" +
    "  if(spark>0.2){ sizePx += (2.0+spark*5.0)*u_twSize*2.0*u_DPR; }\n" +
    "  if(px<-4.0||px>u_W+4.0||py<-4.0||py>u_H+4.0){ gl_Position=vec4(2.0,2.0,2.0,1.0); gl_PointSize=0.0; return; }\n" +
    "  gl_PointSize=max(sizePx,1.0);\n" +
    "  gl_Position=vec4(px/u_W*2.0-1.0, 1.0-py/u_H*2.0, 0.0, 1.0);\n" +
    "}\n";

  var FS_SRC =
    "#version 300 es\n" +
    "precision highp float;\n" +
    "in vec3 v_color; in float v_alpha; in float v_spark; out vec4 frag;\n" +
    "void main(){\n" +
    "  vec2 pc=gl_PointCoord*2.0-1.0; float d=length(pc);\n" +
    "  float core=1.0-smoothstep(0.25,1.0,d); float intensity=core;\n" +
    "  if(v_spark>0.2){\n" +
    "    float sx=smoothstep(0.14,0.0,abs(pc.y))*smoothstep(1.0,0.0,abs(pc.x));\n" +
    "    float sy=smoothstep(0.14,0.0,abs(pc.x))*smoothstep(1.0,0.0,abs(pc.y));\n" +
    "    intensity=max(intensity, max(sx,sy)*v_spark);\n" +
    "  }\n" +
    "  float a=v_alpha*intensity;\n" +
    "  frag=vec4(v_color*a, a);\n" +   /* premultiplied; blend is ONE,ONE */
    "}\n";

  var GLOW_VS =
    "#version 300 es\n" +
    "precision highp float;\n" +
    "layout(location=0) in vec2 a_pos;\n" +
    "void main(){ gl_Position=vec4(a_pos,0.0,1.0); }\n";

  var GLOW_FS =
    "#version 300 es\n" +
    "precision highp float;\n" +
    "uniform float u_cx,u_cy,u_hr,u_cr0,u_glowStr,u_H,u_DPR; out vec4 frag;\n" +
    "vec4 haloAt(float t){ if(t>=1.0) return vec4(0.0); vec3 c; float a;\n" +
    "  if(t<0.16){ float s=t/0.16; c=mix(vec3(255,245,222),vec3(214,208,255),s)/255.0; a=mix(0.34,0.26,s); }\n" +
    "  else if(t<0.42){ float s=(t-0.16)/0.26; c=mix(vec3(214,208,255),vec3(120,150,255),s)/255.0; a=mix(0.26,0.14,s); }\n" +
    "  else if(t<0.72){ float s=(t-0.42)/0.30; c=mix(vec3(120,150,255),vec3(74,80,180),s)/255.0; a=mix(0.14,0.06,s); }\n" +
    "  else { float s=(t-0.72)/0.28; c=mix(vec3(74,80,180),vec3(50,50,140),s)/255.0; a=mix(0.06,0.0,s); } return vec4(c,a); }\n" +
    "vec4 coreAt(float t){ if(t>=1.0) return vec4(0.0); vec3 c; float a;\n" +
    "  if(t<0.28){ float s=t/0.28; c=mix(vec3(255,251,238),vec3(255,244,216),s)/255.0; a=mix(0.6,0.42,s); }\n" +
    "  else if(t<0.6){ float s=(t-0.28)/0.32; c=mix(vec3(255,244,216),vec3(255,226,180),s)/255.0; a=mix(0.42,0.2,s); }\n" +
    "  else { float s=(t-0.6)/0.4; c=mix(vec3(255,226,180),vec3(255,214,160),s)/255.0; a=mix(0.2,0.0,s); } return vec4(c,a); }\n" +
    "void main(){\n" +
    "  float cssx=gl_FragCoord.x/u_DPR; float cssy=u_H-gl_FragCoord.y/u_DPR;\n" +
    "  float d=distance(vec2(cssx,cssy), vec2(u_cx,u_cy));\n" +
    "  vec4 h=haloAt(d/u_hr); vec4 c=coreAt(d/u_cr0);\n" +
    "  frag=vec4((h.rgb*h.a + c.rgb*c.a)*u_glowStr, 1.0);\n" +
    "}\n";

  function glLink(gl, vsSrc, fsSrc) {
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        if (window.console) { console.warn("shader:", gl.getShaderInfoLog(s)); }
        return null;
      }
      return s;
    }
    var vs = sh(gl.VERTEX_SHADER, vsSrc), fs = sh(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) { return null; }
    var p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { return null; }
    return p;
  }

  function initGL() {
    try {
      glcanvas = document.createElement("canvas");
      glcanvas.id = "cloudgl";
      glcanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:none;cursor:crosshair;";
      canvas.parentNode.insertBefore(glcanvas, canvas.nextSibling);
      var gl = glcanvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true });
      if (!gl) { return false; }
      var prog = glLink(gl, VS_SRC, FS_SRC);
      var glow = glLink(gl, GLOW_VS, GLOW_FS);
      if (!prog || !glow) { return false; }

      var vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      function fbuf(loc, comps) {
        var b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, MAXP * comps * 4, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, comps, gl.FLOAT, false, 0, 0);
        return b;
      }
      function ubuf(loc, comps) {
        var b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, MAXP * comps, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, comps, gl.UNSIGNED_BYTE, true, 0, 0);
        return b;
      }
      var bSwirl = fbuf(0, 4), bTarget = fbuf(1, 3), bGal = ubuf(2, 3), bBld = ubuf(3, 3);
      gl.bindVertexArray(null);

      var glowVao = gl.createVertexArray();
      gl.bindVertexArray(glowVao);
      var bQuad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, bQuad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);

      function U(p, names) {
        var o = {};
        for (var i = 0; i < names.length; i++) { o[names[i]] = gl.getUniformLocation(p, "u_" + names[i]); }
        return o;
      }
      GL = {
        gl: gl, prog: prog, glow: glow, vao: vao, glowVao: glowVao,
        buf: { swirl: bSwirl, target: bTarget, gal: bGal, bld: bBld },
        u: U(prog, ["time", "M", "spin", "shape", "bodyR", "thickness", "gravity",
          "cosY", "sinY", "cosP", "sinP", "f", "R", "cx", "cy", "W", "H", "DPR",
          "particleSize", "glow", "hasRGB", "twRate", "twSpeed", "twSize", "pool"]),
        gu: U(glow, ["cx", "cy", "hr", "cr0", "glowStr", "H", "DPR"])
      };
      return true;
    } catch (e) { return false; }
  }

  function glSyncStatic() {
    if (!GL) { return; }
    var gl = GL.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, GL.buf.swirl);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, swirl, 0, POOL * 4);
    gl.bindBuffer(gl.ARRAY_BUFFER, GL.buf.gal);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, galCol, 0, POOL * 3);
  }
  function glSyncCloud() {
    if (!GL) { return; }
    var gl = GL.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, GL.buf.target);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, target, 0, POOL * 3);
    gl.bindBuffer(gl.ARRAY_BUFFER, GL.buf.bld);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, bldCol, 0, POOL * 3);
  }

  function drawGL(S) {
    var gl = GL.gl, u = GL.u;
    gl.viewport(0, 0, W * DPR, H * DPR);
    gl.clearColor(0, 0, 0, 0);   /* transparent: let the CSS stage gradient show, like Canvas2D */
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);   /* additive of premultiplied output */

    /* On the probe frame the glow is suppressed so that anything lit in the
       readback below can only have come from the POINTS draw. See verifyGL. */
    var probing = !glChecked && glCheckFrames >= 3;
    var glowStr = probing ? 0 : (1 - M) * effVal("glow");
    if (glowStr > 0.02 && !REDUCED) {
      gl.useProgram(GL.glow);
      gl.bindVertexArray(GL.glowVao);
      var g = GL.gu;
      gl.uniform1f(g.cx, S.cx); gl.uniform1f(g.cy, S.cy);
      gl.uniform1f(g.hr, S.R * 1.25 * effVal("hazeReach") * zoom);
      gl.uniform1f(g.cr0, S.R * 0.55 * effVal("coreSize") * zoom);
      gl.uniform1f(g.glowStr, glowStr);
      gl.uniform1f(g.H, H); gl.uniform1f(g.DPR, DPR);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    gl.useProgram(GL.prog);
    gl.bindVertexArray(GL.vao);
    gl.uniform1f(u.time, S.t);
    gl.uniform1f(u.M, M);
    gl.uniform1f(u.spin, REDUCED ? 0 : effVal("swirlSpeed"));
    gl.uniform1f(u.shape, effVal("shape"));
    gl.uniform1f(u.bodyR, 1.35 * effVal("bodySize"));
    gl.uniform1f(u.thickness, effVal("thickness"));
    gl.uniform1f(u.gravity, effVal("gravity"));
    gl.uniform1f(u.cosY, S.cosY); gl.uniform1f(u.sinY, S.sinY);
    gl.uniform1f(u.cosP, S.cosP); gl.uniform1f(u.sinP, S.sinP);
    gl.uniform1f(u.f, S.f); gl.uniform1f(u.R, S.R);
    gl.uniform1f(u.cx, S.cx); gl.uniform1f(u.cy, S.cy);
    gl.uniform1f(u.W, W); gl.uniform1f(u.H, H); gl.uniform1f(u.DPR, DPR);
    gl.uniform1f(u.particleSize, effVal("particleSize"));
    gl.uniform1f(u.glow, effVal("glow"));
    gl.uniform1f(u.hasRGB, hasRGB ? 1 : 0);
    gl.uniform1f(u.twRate, effVal("twinkleRate"));
    gl.uniform1f(u.twSpeed, effVal("twinkleSpeed"));
    gl.uniform1f(u.twSize, effVal("twinkleSize"));
    gl.uniform1f(u.pool, POOL);
    gl.drawArrays(gl.POINTS, 0, POOL);
    gl.bindVertexArray(null);

    verifyGL(gl);
  }

  /* A WebGL2 context that CREATES successfully but RASTERIZES nothing is the
     dangerous case: initGL() reports success, we hide the Canvas2D canvas, and
     the visitor gets a black stage that looks like a deliberate design choice
     rather than a failure. Chrome falls back to the SwiftShader software
     rasterizer whenever a GPU is blocklisted, so this is a real configuration
     and not a hypothetical one -- and SwiftShader was measured doing exactly
     this: it rasterizes the fullscreen-triangle glow pass correctly while
     dropping every gl.POINTS sprite, which is the entire particle field.

     That failure mode is why the probe suppresses the glow for one frame:
     with the halo off, any lit pixel in the readback can only have come from
     the points, so the check tests the thing that actually matters instead of
     being satisfied by a background wash. Whole buffer, because at high
     materialization the points sit wherever the scanned object is, not
     reliably at the centre. Runs once, on one frame. */
  var glChecked = false, glCheckFrames = 0;

  function verifyGL(gl) {
    if (glChecked) { return; }
    if (++glCheckFrames < 4) { return; }   /* let the first frames settle */
    glChecked = true;

    var w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    if (w <= 0 || h <= 0) { return; }

    var buf = new Uint8Array(w * h * 4);
    try {
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    } catch (e) {
      if (window.console) { console.warn("EBICParticles: GL readback failed", e); }
      return;
    }

    var lit = 0;
    for (var i = 0; i < buf.length; i += 4) {
      if (buf[i] > 6 || buf[i + 1] > 6 || buf[i + 2] > 6) { lit++; break; }
    }
    if (lit > 0) { return; }   /* points are rasterizing; nothing to do */

    if (window.console) {
      console.warn("EBICParticles: the WebGL2 renderer drew no particles " +
        "(software rasterizer or blocklisted GPU). Falling back to the " +
        "Canvas2D renderer so the stage still draws.");
    }
    glOK = false;
    P.renderer = 1;
    switchRenderer();
  }

  /* pick the active backend, flip canvas visibility, resync GPU buffers */
  function switchRenderer() {
    useGL = glOK && P.renderer === 0;
    if (glcanvas) { glcanvas.style.display = useGL ? "block" : "none"; }
    canvas.style.display = useGL ? "none" : "block";
    if (useGL) { glSyncStatic(); glSyncCloud(); }
    sizeCanvas();
  }

  /* ---------- input (bound to whichever canvas is showing) ---------- */

  function bindInput(el) {
    if (!el) { return; }
    if (FINE) {
      el.addEventListener("mousemove", function (e) {
        hover = true;
        var r = el.getBoundingClientRect();
        tgtTiltX = ((e.clientX - r.left) / r.width - 0.5) * 0.9;
        tgtTiltY = ((e.clientY - r.top) / r.height - 0.5) * 0.5;
      });
      el.addEventListener("mouseleave", function () {
        hover = false; tgtTiltX = 0; tgtTiltY = 0;
      });
    }
    el.addEventListener("click", nextCloud);
    /* Wheel-zoom swallows the page scroll, which is right for a full-screen
       showcase and very wrong for a hero band at the top of a long page --
       the visitor would be unable to scroll past it. Opt-in only. */
    if (opts.wheelZoom) {
      el.addEventListener("wheel", function (e) {
        e.preventDefault();
        zoomGoal *= Math.exp(-e.deltaY * 0.0012);
        if (zoomGoal < 0.45) { zoomGoal = 0.45; }
        if (zoomGoal > 4.5) { zoomGoal = 4.5; }
      }, { passive: false });
      el.addEventListener("dblclick", function () { zoomGoal = 1; });
    }
  }

  /* ---------- load ---------- */

  function start() {
    glOK = initGL();
    if (!glOK) { P.renderer = 1; }
    sizeCanvas();
    alloc(P.points); seedSwirl(); applyCloud(0);
    buildPanel();
    bindInput(canvas); bindInput(glcanvas);
    switchRenderer();
    if (loading) { loading.className += " done"; }
    if (hint && !FINE) { hint.innerHTML = "<span class=\"pulse\">Tap for next scan</span>"; }
    if (REDUCED) { M = 1; }
    window.requestAnimationFrame(frame);
  }

  /* ---------- control panel ---------- */

  var GROUPS = [
    ["Performance", [
      { k: "renderer", seg: ["WebGL", "Canvas2D"], segLabel: "Renderer" },
      { k: "points", label: "Points", min: 10000, max: 40000, step: 1000, realloc: true, fmt: function (v) { return (v / 1000) + "k"; } }
    ]],
    ["Body shape", [
      { k: "shape", seg: ["Disc", "Sphere", "Toroid"] },
      { k: "bodySize", label: "Body size", min: 0.4, max: 2.0, step: 0.05 },
      { k: "thickness", label: "Thickness", min: 0.0, max: 2.5, step: 0.05 },
      { k: "gravity", label: "Gravity (sag)", min: 0.0, max: 1.0, step: 0.02 }
    ]],
    ["Motion", [
      { k: "rotSpeed", label: "Rotation speed", min: 0, max: 3, step: 0.05 },
      { k: "swirlSpeed", label: "Swirl speed", min: 0, max: 3, step: 0.05 },
      { k: "coalesce", label: "Coalesce speed", min: 0.3, max: 3, step: 0.05 }
    ]],
    ["Core glow", [
      { k: "coreSize", label: "Core size", min: 0.2, max: 2.5, step: 0.05 },
      { k: "hazeReach", label: "Haze reach", min: 0.3, max: 2.5, step: 0.05 },
      { k: "glow", label: "Glow intensity", min: 0, max: 2.5, step: 0.05 }
    ]],
    ["Particles", [
      { k: "particleSize", label: "Particle size", min: 0.4, max: 3, step: 0.05 }
    ]],
    ["Twinkle", [
      { k: "twinkleRate", label: "Twinkle density", min: 0, max: 4, step: 0.05 },
      { k: "twinkleSpeed", label: "Twinkle speed", min: 0.2, max: 4, step: 0.05 },
      { k: "twinkleSize", label: "Twinkle size", min: 0, max: 3, step: 0.05 }
    ]]
  ];

  function saveParams() {
    try { localStorage.setItem(STORE, JSON.stringify(P)); } catch (e) {
      /* private-mode / quota: tuning simply will not persist */
      if (window.console) { console.warn("EBICParticles: settings not saved", e); }
    }
  }

  function buildPanel() {
    if (!opts.lab) { return; }
    var panel = document.getElementById("lab");
    if (!panel) { return; }
    fpsEl = document.getElementById("fps");
    var body = document.getElementById("labBody");
    var rows = [];

    GROUPS.forEach(function (grp) {
      rows.push('<div class="lg">' + grp[0] + '</div>');
      grp[1].forEach(function (c) {
        if (c.seg) {
          var segs = c.seg.map(function (name, idx) {
            return '<button data-seg="' + c.k + '" data-val="' + idx + '"' +
              (P[c.k] === idx ? ' class="on"' : '') + '>' + name + '</button>';
          }).join("");
          rows.push('<div class="lr"><span class="ll">' + (c.segLabel || "Shape") + '</span>' +
            '<span class="seg">' + segs + '</span></div>');
        } else {
          rows.push('<div class="lr"><span class="ll">' + c.label + '</span>' +
            '<input type="range" data-k="' + c.k + '" min="' + c.min + '" max="' + c.max +
            '" step="' + c.step + '" value="' + P[c.k] + '">' +
            '<span class="lv" id="lv_' + c.k + '"></span></div>');
        }
      });
    });
    body.innerHTML = rows.join("");

    function fmtOf(k) {
      for (var gi = 0; gi < GROUPS.length; gi++) {
        var arr = GROUPS[gi][1];
        for (var ci = 0; ci < arr.length; ci++) {
          if (arr[ci].k === k) { return arr[ci].fmt; }
        }
      }
      return null;
    }
    function refreshVal(k) {
      var el = document.getElementById("lv_" + k);
      if (!el) { return; }
      var fmt = fmtOf(k);
      el.textContent = fmt ? fmt(P[k]) : (+P[k]).toFixed(2);
    }

    body.querySelectorAll("input[type=range]").forEach(function (inp) {
      var k = inp.getAttribute("data-k");
      refreshVal(k);
      inp.addEventListener("input", function () {
        P[k] = parseFloat(inp.value);
        refreshVal(k);
        saveParams();
        var meta = null;
        GROUPS.forEach(function (g) { g[1].forEach(function (c) { if (c.k === k) { meta = c; } }); });
        if (meta && meta.realloc) {
          alloc(P.points); seedSwirl(); applyCloud(current);
        }
      });
    });
    body.querySelectorAll("button[data-seg]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var k = btn.getAttribute("data-seg");
        if (k === "renderer" && parseInt(btn.getAttribute("data-val"), 10) === 0 && !glOK) {
          return;   /* WebGL unavailable on this device */
        }
        P[k] = parseInt(btn.getAttribute("data-val"), 10);
        saveParams();
        body.querySelectorAll('button[data-seg="' + k + '"]').forEach(function (o) {
          o.className = (o === btn) ? "on" : "";
        });
        if (k === "renderer") { switchRenderer(); }
      });
    });
    if (!glOK) {
      var glBtn = body.querySelector('button[data-seg="renderer"][data-val="0"]');
      if (glBtn) { glBtn.textContent = "WebGL n/a"; glBtn.style.opacity = "0.4"; glBtn.style.cursor = "not-allowed"; }
    }

    document.getElementById("labReset").addEventListener("click", function () {
      for (var dk in DEFAULTS) { P[dk] = DEFAULTS[dk]; }
      if (!glOK) { P.renderer = 1; }
      saveParams();
      alloc(P.points); seedSwirl(); applyCloud(current);
      buildPanel();
      switchRenderer();
    });
    document.getElementById("labCopy").addEventListener("click", function () {
      var txt = JSON.stringify(P, null, 2);
      var btn = document.getElementById("labCopy");
      if (navigator.clipboard) {
        navigator.clipboard.writeText(txt).then(function () {
          btn.textContent = "copied"; window.setTimeout(function () { btn.textContent = "copy settings"; }, 1200);
        });
      }
    });
    document.getElementById("labToggle").addEventListener("click", function () {
      panel.classList.toggle("hid");
    });
  }

  function loadAll(names, dir) {
    return Promise.all(names.map(function (name) {
      return fetch(dir + name + ".json")
        .then(function (r) { if (!r.ok) { throw new Error(String(r.status)); } return r.json(); })
        .then(decode)
        .catch(function (err) {
          /* A dataset that 404s or fails to decode is skipped so one bad
             file cannot blank the stage -- but it must never vanish
             silently, or a broken bake looks like a working site. */
          if (window.console) {
            console.warn("EBICParticles: dataset \"" + name + "\" failed to load from " +
              dir + " -- skipping it. ", err);
          }
          return null;
        });
    }));
  }

  fetch(LOCAL_MANIFEST)
    .then(function (r) { return r.ok ? r.json() : []; })
    .catch(function () { return []; })
    .then(function (extra) {
      return Promise.all([
        loadAll(MANIFEST, CLOUD_DIR),
        loadAll(Array.isArray(extra) ? extra : [], CLOUD_DIR + "local/")
      ]);
    })
    .then(function (sets) {
      clouds = sets[0].concat(sets[1]).filter(Boolean);
      if (!clouds.length) {
        /* Every dataset failed. Say so in both places -- on screen for the
           visitor, and in the console with the directory that came up empty
           so a broken deploy is diagnosable rather than merely blank. */
        if (loading) { loading.textContent = "NO CLOUD DATA (SERVE OVER HTTP)"; }
        if (window.console) {
          console.error("EBICParticles: no datasets loaded from " + CLOUD_DIR +
            " -- the stage will stay empty. Check the path and that the site is served over HTTP.");
        }
        return;
      }
      start();
    });

  window.addEventListener("resize", sizeCanvas);
};
