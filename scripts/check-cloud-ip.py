"""Guard: no withheld point cloud may reach the published site.

Run before any deploy, and in CI if this repo ever gets one:

    python scripts/check-cloud-ip.py

Four independent ways a withheld dataset can escape. The first is the one
that motivated this file: `git mv`-ing a cloud into assets/clouds/local/
stages it as a RENAME, so it stays tracked at the new path and ships anyway.
.gitignore does not untrack what is already in the index, so the directory
looks protected while being nothing of the sort. That failure is completely
silent -- the file sits in the "withheld" folder, the manifest looks right,
and the geometry is still in the public repo.

Exit 0 = safe to publish. Exit 1 = something would leak, with the reason.
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTICLES = os.path.join(ROOT, "assets", "js", "particles.js")
PUBLISHED_DIR = os.path.join(ROOT, "assets", "clouds")
LOCAL_DIR = os.path.join(PUBLISHED_DIR, "local")
LOCAL_MANIFEST = os.path.join(LOCAL_DIR, "manifest.json")

failures = []


def fail(msg):
    failures.append(msg)


def published_manifest():
    """The MANIFEST array the deployed site actually iterates."""
    src = open(PARTICLES, encoding="utf-8").read()
    m = re.search(r"var\s+MANIFEST\s*=\s*\[(.*?)\]", src, re.S)
    if not m:
        fail("could not find the MANIFEST array in assets/js/particles.js")
        return []
    return re.findall(r'"([^"]+)"', m.group(1))


def withheld():
    """Slugs that must never be served from the public site."""
    if not os.path.exists(LOCAL_MANIFEST):
        return []
    return json.load(open(LOCAL_MANIFEST, encoding="utf-8"))


def tracked(path_prefix):
    """Paths git has in the index under a prefix. Index, not disk -- the whole
    point is to catch files that are staged despite being 'ignored'."""
    out = subprocess.run(
        ["git", "ls-files", "--cached", path_prefix],
        cwd=ROOT, capture_output=True, text=True, check=True,
    ).stdout
    return [l for l in out.splitlines() if l.strip()]


pub = published_manifest()
hidden = set(withheld())

# 1. Nothing tracked under local/. This is the git mv trap.
leaked = tracked("assets/clouds/local/")
for p in leaked:
    fail("TRACKED IN GIT but must never be published: %s" % p)

# 2. No published manifest entry is also on the withheld list.
for slug in pub:
    if slug in hidden:
        fail("particles.js MANIFEST publishes '%s', which local/manifest.json withholds" % slug)

# 3. Every published entry has a file where the site will look for it.
for slug in pub:
    if not os.path.exists(os.path.join(PUBLISHED_DIR, slug + ".json")):
        fail("particles.js MANIFEST lists '%s' but assets/clouds/%s.json does not exist" % (slug, slug))

# 4. No withheld dataset is sitting loose in the published directory.
for slug in hidden:
    stray = os.path.join(PUBLISHED_DIR, slug + ".json")
    if os.path.exists(stray):
        fail("withheld '%s' is sitting in the PUBLISHED directory: assets/clouds/%s.json" % (slug, slug))

print("published (%d): %s" % (len(pub), ", ".join(pub) if pub else "(none)"))
print("withheld  (%d): %s" % (len(hidden), ", ".join(sorted(hidden)) if hidden else "(none)"))
print("tracked under local/: %d" % len(leaked))

if failures:
    print("\n%d PROBLEM(S) -- do not deploy:" % len(failures))
    for f in failures:
        print("  [X] %s" % f)
    sys.exit(1)

print("\n[OK] no withheld dataset can reach the published site.")
