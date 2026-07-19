#!/usr/bin/env python
"""Static checks for the EBIC website.

Run from anywhere:  python scripts/validate-site.py
Exits non-zero if any check fails, so it can be wired into pre-commit or CI.

Checks per HTML page:
  - source is ASCII-only at rest (house rule; emoji and typographic punctuation
    are written as CSS unicode escapes or HTML numeric character references so
    they still render identically)
  - no stray C0 control characters
  - no HTML numeric character references inside <script> or <style>, where the
    HTML parser does NOT decode them and they would render as literal text
  - any application/ld+json block parses as JSON
  - <section> and <div> tags are balanced
  - exactly one rel="canonical"
  - every in-page href="#anchor" resolves to an element id on that page

Plus: sitemap.xml parses and every <loc> maps to a file that exists, and
robots.txt is present.
"""
import glob
import io
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

BASE_URL = "https://www.ebicinc.com/"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def check_page(path):
    """Return a list of problem strings for one HTML file."""
    src = io.open(path, encoding="utf-8").read()
    probs = []

    non_ascii = sorted({"U+%04X" % ord(c) for c in src if ord(c) > 127})
    if non_ascii:
        probs.append("non-ASCII characters present: %s" % non_ascii)

    ctrl = sorted({"U+%04X" % ord(c) for c in src if ord(c) < 32 and c not in "\t\n\r"})
    if ctrl:
        probs.append("control characters present: %s" % ctrl)

    for m in re.finditer(r"<(script|style)\b[^>]*>(.*?)</\1>", src, re.S):
        stray = re.findall(r"&#x[0-9A-Fa-f]+;", m.group(2))
        if stray:
            probs.append(
                "HTML char refs inside <%s> (they will not decode): %s"
                % (m.group(1), stray)
            )

    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', src, re.S):
        try:
            json.loads(m.group(1))
        except ValueError as exc:
            probs.append("JSON-LD does not parse: %s" % exc)

    if src.count("<section") != src.count("</section>"):
        probs.append("unbalanced <section> tags")
    if src.count("<div") != src.count("</div>"):
        probs.append("unbalanced <div> tags")

    n_canon = src.count('rel="canonical"')
    if n_canon != 1:
        probs.append("expected exactly 1 rel=canonical, found %d" % n_canon)

    ids = set(re.findall(r'id="([^"]+)"', src))
    for anchor in sorted(set(re.findall(r'href="#([^"]+)"', src))):
        if anchor not in ids:
            probs.append("broken in-page anchor: #%s" % anchor)

    return probs


def main():
    os.chdir(REPO)
    failed = False

    pages = ["index.html"] + sorted(glob.glob("pages/*.html"))
    for page in pages:
        probs = check_page(page)
        if probs:
            failed = True
            print("[FAIL] %s" % page)
            for p in probs:
                print("        - %s" % p)
        else:
            print("[OK]   %s" % page)

    ns = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
    locs = [e.text for e in ET.parse("sitemap.xml").iter(ns + "loc")]
    missing = [
        (u.replace(BASE_URL, "") or "index.html")
        for u in locs
        if not os.path.exists(u.replace(BASE_URL, "") or "index.html")
    ]
    if missing:
        failed = True
        print("[FAIL] sitemap.xml: %d urls, missing files: %s" % (len(locs), missing))
    else:
        print("[OK]   sitemap.xml: %d urls, all resolve" % len(locs))

    if os.path.exists("robots.txt"):
        print("[OK]   robots.txt present")
    else:
        failed = True
        print("[FAIL] robots.txt missing")

    print("\nOVERALL: %s" % ("FAIL" if failed else "PASS"))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
