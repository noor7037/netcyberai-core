#!/usr/bin/env python3
"""First Load JS budgets (C393, C401, C402): every Family app page under 200 kB, every Control page under 250 kB.

The Family app runs on low-end phones on slow data, so each of its pages has a budget for the JavaScript a first visit
downloads: the "First Load JS" `next build` prints. This check reads the build's app-build-manifest.json and, for each
page, adds up the gzip size of every distinct script in the page's manifest entry AND in the entries of every layout
above it (C401), in kB of 1000 bytes. `next build` prints the page's own entry without its layouts, which hid a
layout that carried the whole message table on every Control page; this check counts what a first visit downloads.
It fails when any page under a budget is over it, or when a budget finds no page. No page is excluded.

The usual cause of a breach is a client component that imports the full message table (`t` from '@/lib/i18n', or
useT): pass the client the words it needs instead (familyWords in the Family app; pickWords and useWords elsewhere).

Usage:
    python3 scripts/check_family_budget.py --build .next
    python3 scripts/check_family_budget.py --self-test
"""
from __future__ import annotations

import gzip
import json
import sys
import tempfile
from pathlib import Path

# (manifest key prefix, budget in kB, name).
BUDGETS = [("/(family)/", 200.0, "the family budget"), ("/(admin)/control", 250.0, "the Control budget")]


def layouts_above(manifest: dict, page: str) -> list[str]:
    # "/(family)/family/(app)/parent/page" → "/layout", "/(family)/layout", "/(family)/family/layout", ...
    parts = page.split("/")[1:-1]
    keys = ["/layout"] + ["/" + "/".join(parts[: i + 1]) + "/layout" for i in range(len(parts))]
    return [k for k in keys if k in manifest]


def first_load_kb(build: Path, manifest: dict, page: str, sizes: dict[str, int]) -> float:
    files = {f for key in [page, *layouts_above(manifest, page)] for f in manifest.get(key, []) if f.endswith(".js")}
    total = 0
    for f in files:
        if f not in sizes:
            sizes[f] = len(gzip.compress((build / f).read_bytes()))
        total += sizes[f]
    return total / 1000


def check(build: Path) -> list[str]:
    manifest_path = build / "app-build-manifest.json"
    if not manifest_path.exists():
        return [f"{manifest_path} is missing: run the build first"]
    manifest = json.loads(manifest_path.read_text())["pages"]
    sizes: dict[str, int] = {}
    problems = []
    for prefix, budget, name in BUDGETS:
        pages = sorted(k for k in manifest if k.startswith(prefix) and k.endswith("/page"))
        if not pages:
            problems.append(f"no page under {prefix} found in the build ({name})")
        for page in pages:
            kb = first_load_kb(build, manifest, page, sizes)
            if kb > budget:
                problems.append(f"{page}: {kb:.1f} kB First Load JS with its layouts, over {name} of {budget:.0f} kB")
    return problems


def self_test() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        build = Path(tmp)
        (build / "static").mkdir()
        (build / "static" / "small.js").write_bytes(b"a" * 1000)
        # Random bytes do not compress: about 250 kB gzipped.
        import os

        (build / "static" / "big.js").write_bytes(os.urandom(250_000))
        manifest = {
            "pages": {
                "/layout": ["static/small.js"],
                "/(family)/family/(app)/page": ["static/small.js"],
                "/(family)/family/(app)/parent/page": ["static/small.js"],
                "/(admin)/control/layout": ["static/small.js"],
                "/(admin)/control/family/page": ["static/small.js"],
            }
        }
        (build / "app-build-manifest.json").write_text(json.dumps(manifest))
        if check(build):
            print("self-test FAILED: a small build was flagged", file=sys.stderr)
            return 1
        # A heavy script on the parent area is caught, and only there; a script shared twice counts once.
        manifest["pages"]["/(family)/family/(app)/parent/page"] = ["static/small.js", "static/big.js", "static/big.js"]
        (build / "app-build-manifest.json").write_text(json.dumps(manifest))
        problems = check(build)
        if len(problems) != 1 or "parent/page" not in problems[0]:
            print(f"self-test FAILED: the heavy parent page was not caught alone: {problems}", file=sys.stderr)
            return 1
        # A heavy layout counts for every page under it (C401): here, the Control layout above every Control page.
        manifest["pages"]["/(family)/family/(app)/parent/page"] = ["static/small.js"]
        manifest["pages"]["/(admin)/control/layout"] = ["static/big.js"]
        (build / "app-build-manifest.json").write_text(json.dumps(manifest))
        problems = check(build)
        if len(problems) != 1 or "control/family/page" not in problems[0]:
            print(f"self-test FAILED: a heavy layout above the Control pages was not caught: {problems}", file=sys.stderr)
            return 1
        manifest["pages"]["/(admin)/control/layout"] = ["static/small.js"]
        # A budget that finds no page fails, so a renamed route cannot pass by being missed.
        del manifest["pages"]["/(admin)/control/family/page"]
        (build / "app-build-manifest.json").write_text(json.dumps(manifest))
        if not any("no page under /(admin)/control " in p for p in check(build)):
            print("self-test FAILED: a budget with no page passed", file=sys.stderr)
            return 1
        manifest["pages"]["/(admin)/control/family/page"] = ["static/small.js"]
        # A heavy page outside the budgets is not this check's business.
        manifest["pages"]["/(family)/family/(app)/parent/page"] = ["static/small.js"]
        manifest["pages"]["/(school)/app/page"] = ["static/big.js"]
        (build / "app-build-manifest.json").write_text(json.dumps(manifest))
        if check(build):
            print("self-test FAILED: a school page was counted", file=sys.stderr)
            return 1
    print("check_family_budget self-test: ok")
    return 0


def main(argv: list[str]) -> int:
    if argv[1:] == ["--self-test"]:
        return self_test()
    if len(argv) != 3 or argv[1] != "--build":
        print(__doc__, file=sys.stderr)
        return 2
    problems = check(Path(argv[2]))
    for p in problems:
        print(p, file=sys.stderr)
    if problems:
        return 1
    print("check_family_budget: every page is under its First Load JS budget, layouts included: " + ", ".join(f"{p} {b:.0f} kB" for p, b, _ in BUDGETS))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
