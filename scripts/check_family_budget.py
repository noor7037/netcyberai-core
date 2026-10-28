#!/usr/bin/env python3
"""The Family app's First Load JS budget (C393): every page under /family stays under 200 kB.

The Family app runs on low-end phones on slow data, so each of its pages has a budget for the JavaScript a first visit
downloads: the "First Load JS" `next build` prints. This check reads the build's app-build-manifest.json and, for each
family page, adds up the gzip size of every distinct script in the page's manifest entry, in kB of 1000 bytes: the
same sum `next build` prints (checked against it to the tenth of a kB). It fails when any family page is over the budget. No page is excluded, the parent area included.

The usual cause of a breach is a client component that imports the full message table (`t` from '@/lib/i18n'): pass
the client the words it needs (familyWords) instead.

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

BUDGET_KB = 200.0
FAMILY_PREFIX = "/(family)/"


def first_load_kb(build: Path, manifest: dict, page: str, sizes: dict[str, int]) -> float:
    files = {f for f in manifest.get(page, []) if f.endswith(".js")}
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
    pages = sorted(k for k in manifest if k.startswith(FAMILY_PREFIX) and k.endswith("/page"))
    if not pages:
        return ["no family page found in the build"]
    sizes: dict[str, int] = {}
    problems = []
    for page in pages:
        kb = first_load_kb(build, manifest, page, sizes)
        if kb > BUDGET_KB:
            problems.append(f"{page}: {kb:.1f} kB First Load JS, over the family budget of {BUDGET_KB:.0f} kB")
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
        # A heavy page outside the family app is not this check's business.
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
    print(f"check_family_budget: every family page is under {BUDGET_KB:.0f} kB First Load JS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
