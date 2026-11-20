#!/usr/bin/env python3
"""The day each public page last changed, for sitemap.xml's <lastmod> (C471).

A search engine trusts <lastmod> only while it is honest: a date that moves on every build, or one that never moves,
is ignored. So the date comes from git, per page: the last commit that touched the page's own folder (not the pages
nested under it) or any `@/content/...` file it imports. A blog post is its own file in src/content/blog; a product,
a solution, a resource section or a free tool is its collection's file. A change not committed yet counts as today.
The dates are written to src/content/page-dates.json, which src/app/sitemap.ts reads (a build on Vercel has no git
history to ask).

    python3 scripts/page_dates.py --write    regenerate the file
    python3 scripts/page_dates.py --check    fail when a page changed after its recorded day (CI, full history)
    python3 scripts/page_dates.py --self-test
"""
from __future__ import annotations

import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "src" / "app"
OUT = ROOT / "src" / "content" / "page-dates.json"
# The signed-in apps and development pages are not public (src/app/sitemap.ts's INTERNAL_ROOTS).
INTERNAL = {"(admin)", "(school)", "(family)", "(parent)", "(dev)", "login"}
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
IMPORT = re.compile(r"""from\s+['"]@/content/([^'"]+)['"]""")
# Dynamic segments and the collection file each one's entries live in.
COLLECTIONS = {
    "products/[slug]": "src/content/catalog.ts",
    "solutions/[slug]": "src/content/catalog.ts",
    "resources/[slug]": "src/content/resources.ts",
    "free-tools/[slug]": "src/content/free-tools.ts",
    # C533: the feature pages drawn from data, one file per audience.
    "features/[slug]": ["src/content/features/school.ts", "src/content/features/family-learn.ts", "src/content/features/family-life.ts"],
}


def today() -> str:
    return dt.datetime.now(IST).date().isoformat()


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()


def last_change(files: list[str]) -> str | None:
    """The IST day of the last commit touching any of these files; today when one has uncommitted changes."""
    files = [f for f in files if (ROOT / f).exists()]
    if not files:
        return None
    if git("status", "--porcelain", "--", *files):
        return today()
    stamp = git("log", "-1", "--format=%cI", "--", *files)
    return dt.datetime.fromisoformat(stamp).astimezone(IST).date().isoformat() if stamp else None


def content_file(spec: str) -> str | None:
    for candidate in (f"src/content/{spec}.ts", f"src/content/{spec}.tsx", f"src/content/{spec}/index.ts"):
        if (ROOT / candidate).exists():
            return candidate
    return None


# Files in a route folder that are not that page's own content: the sitemap, robots and app icons beside the home page,
# a layout or an error page shared by every page below. A change to them is not a change to the page.
NOT_CONTENT = {
    "sitemap.ts", "robots.ts", "manifest.ts", "icon.svg", "globals.css", "opengraph-image.tsx", "route.ts",
    "layout.tsx", "not-found.tsx", "error.tsx", "global-error.tsx",
}


def folder_files(folder: Path) -> list[Path]:
    """A route folder's own files and its private `_` folders (never a nested route, an API or a file route)."""
    out: list[Path] = []
    for p in sorted(folder.iterdir()):
        if p.is_file() and p.name not in NOT_CONTENT:
            out.append(p)
        elif p.is_dir() and p.name.startswith("_"):
            out.extend(q for q in sorted(p.rglob("*")) if q.is_file())
    return out


def page_sources(folder: Path) -> list[str]:
    files = folder_files(folder)
    sources = {str(f.relative_to(ROOT)) for f in files}
    for f in files:
        if f.suffix in (".ts", ".tsx"):
            for spec in IMPORT.findall(f.read_text()):
                found = content_file(spec)
                if found:
                    sources.add(found)
    return sorted(sources)


def static_routes(folder: Path, route: str) -> list[tuple[str, Path]]:
    found = [(route or "/", folder)] if (folder / "page.tsx").exists() else []
    for p in sorted(folder.iterdir()):
        if not p.is_dir() or p.name.startswith(("[", "_")) or p.name in INTERNAL:
            continue
        group = p.name.startswith("(") and p.name.endswith(")")
        found.extend(static_routes(p, route if group else f"{route}/{p.name}"))
    return found


def collection_slugs(file: str) -> list[str]:
    return re.findall(r"^\s+slug: '([a-z0-9-]+)'", (ROOT / file).read_text(), re.M)


def compute() -> dict[str, str]:
    dates: dict[str, str] = {}
    for route, folder in static_routes(APP, ""):
        day = last_change(page_sources(folder))
        if day:
            dates[route] = day
    for segment, source in COLLECTIONS.items():
        base = segment.split("/")[0]
        files = source if isinstance(source, list) else [source]
        # The template page and the collection both make each entry's page.
        day = last_change([*files, *page_sources(APP / base / "[slug]")])
        for slug in [s for f in files for s in collection_slugs(f)]:
            dates[f"/{base}/{slug}"] = day
    for post in sorted((ROOT / "src" / "content" / "blog").glob("*.ts")):
        if post.name == "index.ts":
            continue
        published = re.search(r"publishedOn: '(\d{4}-\d{2}-\d{2})'", post.read_text())
        day = last_change([str(post.relative_to(ROOT))])
        days = [d for d in (day, published.group(1) if published else None) if d]
        if days:
            dates[f"/blog/{post.stem}"] = max(days)
    return dict(sorted(dates.items()))


def check() -> int:
    recorded = json.loads(OUT.read_text()) if OUT.exists() else {}
    stale = [f"{route}: changed {day}, recorded {recorded.get(route, 'nothing')}" for route, day in compute().items() if recorded.get(route, "") < day]
    if stale:
        print("page_dates: these pages changed after the day sitemap.xml gives them:", *stale, sep="\n  ", file=sys.stderr)
        print("Run: python3 scripts/page_dates.py --write", file=sys.stderr)
        return 1
    print(f"page_dates: {len(recorded)} pages, every <lastmod> is current.")
    return 0


def self_test() -> int:
    if not static_routes(APP, ""):
        print("self-test FAILED: no public page found", file=sys.stderr)
        return 1
    dates = compute()
    for must in ("/", "/pricing", "/blog/haryana-form-6-fee-hike-compliance-guide"):
        if must not in dates or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", dates[must]):
            print(f"self-test FAILED: no day for {must}", file=sys.stderr)
            return 1
    if any(r.startswith(("/app", "/control", "/family", "/login")) for r in dates):
        print("self-test FAILED: a signed-in page was dated", file=sys.stderr)
        return 1
    print(f"page_dates self-test: ok ({len(dates)} pages)")
    return 0


def main(argv: list[str]) -> int:
    if argv[1:] == ["--write"]:
        OUT.write_text(json.dumps(compute(), indent=2) + "\n")
        print(f"page_dates: wrote {OUT.relative_to(ROOT)}")
        return 0
    if argv[1:] == ["--check"]:
        return check()
    if argv[1:] == ["--self-test"]:
        return self_test()
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
