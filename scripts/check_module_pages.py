#!/usr/bin/env python3
"""Every working screen renders through ModulePage (docs/19 rule 1).

"Every screen has the same layout: learn one screen, know all 33 modules."
The layout is one component, src/components/app-ui/ModulePage.tsx. This
check fails CI when a page under /app or /control does not render through
it, so the next screen someone adds cannot quietly invent its own layout.

A page.tsx passes when one of these is true:

1. It renders <ModulePage ...> itself.
2. It renders a component (imported from @/components/...) whose own file
   renders <ModulePage ...>. One level only: the page must hand the screen
   to a view that is the ModulePage.
3. It is not a screen of its own: it only redirects, or only shows the
   shared "coming in a later phase" page (ModuleComingPage, StubPage).
4. It is a documented exception below, with the reason.

Known limit: a page that renders ModulePage on one path and its own layout
on another passes; review catches that, this check does not.

Static, text-based, file-local (the same honesty as check_route_guards.py):
it proves the component is used, not what the page looks like. Screenshots
at 390 and 1440 in each PR are the visual proof.

Usage:
    python3 scripts/check_module_pages.py
    python3 scripts/check_module_pages.py --self-test
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC = REPO_ROOT / "src"
ROOTS = ["app/(school)/app", "app/(admin)/control"]

# path (relative to src/app) -> why it does not use ModulePage.
EXCEPTIONS = {
    "(school)/app/dashboard/page.tsx": "Role dashboard: the dashboard anatomy of docs/19 §3.3 (hero band, KPI row, attention list, charts).",
    "(admin)/control/page.tsx": "Control dashboard: the dashboard anatomy of docs/19 §3.3.",
    "(school)/app/help/[slug]/page.tsx": "Help Center article: a reading page (title, steps, related guides), not a module screen.",
}

USES_RE = re.compile(r"<ModulePage\b")
NOT_A_SCREEN_RE = re.compile(r"<(ModuleComingPage|StubPage)\b|\bredirect\(")
OTHER_JSX_RE = re.compile(r"<(?!ModuleComingPage\b|StubPage\b|/|>)[A-Za-z]")
IMPORT_RE = re.compile(r"import\s+(?:type\s+)?\{[^}]*\}\s+from\s+'@/components/([^']+)'")


COMMENT_RE = re.compile(r"\{/\*.*?\*/\}|/\*.*?\*/|(?<![:'\"`])//[^\n]*", re.S)


def strip_comments(text: str) -> str:
    """A page that only mentions <ModulePage> in a comment does not use it."""
    return COMMENT_RE.sub("", text)


def component_file(src: Path, spec: str) -> Path | None:
    for ext in (".tsx", ".ts"):
        p = src / "components" / f"{spec}{ext}"
        if p.is_file():
            return p
    return None


def verdict(src: Path, page: Path) -> str | None:
    """None when the page passes; otherwise why it fails."""
    text = strip_comments(page.read_text())
    if USES_RE.search(text):
        return None
    for spec in IMPORT_RE.findall(text):
        f = component_file(src, spec)
        # The imported view must both be rendered by the page and be a ModulePage.
        if f and USES_RE.search(strip_comments(f.read_text())) and re.search(rf"<{re.escape(f.stem)}\b", text):
            return None
    if NOT_A_SCREEN_RE.search(text):
        # A page that only redirects or only shows the shared Coming page.
        body = re.sub(r"\{/\*.*?\*/\}", "", text, flags=re.S)
        if not OTHER_JSX_RE.search(body):
            return None
        return "shows a Coming page for some people and its own screen for others; the screen must render through ModulePage"
    return "does not render through ModulePage"


def find_violations(src: Path, exceptions: dict[str, str]) -> list[str]:
    out = []
    for root in ROOTS:
        base = src / root
        if not base.is_dir():
            continue
        for page in sorted(base.rglob("page.tsx")):
            rel = page.relative_to(src / "app").as_posix()
            if rel in exceptions:
                continue
            why = verdict(src, page)
            if why:
                out.append(f"src/app/{rel}: {why}")
    for rel in exceptions:
        if not (src / "app" / rel).is_file():
            out.append(f"EXCEPTIONS lists src/app/{rel}, which does not exist: remove the entry")
    return out


def main() -> int:
    violations = find_violations(SRC, EXCEPTIONS)
    if violations:
        print("FAIL: a /app or /control page does not render through ModulePage (docs/19 rule 1):")
        for v in violations:
            print(f"  {v}")
        print(
            "\nWrap the screen in <ModulePage title=... purpose=...> (src/components/app-ui/ModulePage.tsx), "
            "or, for a page that truly is not a module screen, add it to EXCEPTIONS in this file with the reason."
        )
        return 1
    pages = sum(1 for root in ROOTS for _ in (SRC / root).rglob("page.tsx"))
    print(f"PASS: {pages} /app and /control pages render through ModulePage, are not screens of their own, or are one of {len(EXCEPTIONS)} documented exceptions.")
    return 0


def self_test() -> int:
    import shutil
    import tempfile

    tmp = Path(tempfile.mkdtemp())
    try:
        src = tmp / "src"
        app = src / "app" / "(school)" / "app"
        comp = src / "components"

        def write(path: Path, text: str) -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)

        write(comp / "views" / "GoodView.tsx", "export function GoodView() { return <ModulePage title='x' purpose='y'>z</ModulePage>; }\n")
        write(comp / "views" / "PlainView.tsx", "export function PlainView() { return <div>plain</div>; }\n")
        write(app / "direct" / "page.tsx", "export default function P() { return <ModulePage title='a' purpose='b'>c</ModulePage>; }\n")
        write(app / "viaview" / "page.tsx", "import { GoodView } from '@/components/views/GoodView';\nexport default function P() { return <GoodView />; }\n")
        write(app / "coming" / "page.tsx", "export default function P() { return <ModuleComingPage moduleId=\"ptm\" />; }\n")
        write(app / "moved" / "page.tsx", "import { redirect } from 'next/navigation';\nexport default function P() { redirect('/app'); }\n")
        write(app / "excepted" / "page.tsx", "export default function P() { return <main>dashboard</main>; }\n")
        exceptions = {"(school)/app/excepted/page.tsx": "a dashboard"}
        if find_violations(src, exceptions):
            print("SELF-TEST FAILED: correct pages were flagged")
            print(find_violations(src, exceptions))
            return 1

        # Each of these must be caught.
        write(app / "bare" / "page.tsx", "export default function P() { return <div><h1>My own layout</h1></div>; }\n")
        write(app / "plainview" / "page.tsx", "import { PlainView } from '@/components/views/PlainView';\nexport default function P() { return <PlainView />; }\n")
        # Imports a ModulePage view but does not render it.
        write(app / "unused" / "page.tsx", "import { GoodView } from '@/components/views/GoodView';\nexport default function P() { return <div>own</div>; }\n")
        # A Coming page for some roles, and an own layout for the others.
        write(app / "mixed" / "page.tsx", "export default function P() { if (x) return <ModuleComingPage moduleId=\"staff\" />; return <div><h1>Own</h1></div>; }\n")
        # Mentions ModulePage only in a comment.
        write(app / "commented" / "page.tsx", "// TODO move to <ModulePage title='x' purpose='y'>\nexport default function P() { return <div>{/* <ModulePage> */}<h1>Own</h1></div>; }\n")
        got = find_violations(src, exceptions)
        for name in ("bare", "plainview", "unused", "mixed", "commented"):
            if not any(f"/{name}/page.tsx" in v for v in got):
                print(f"SELF-TEST FAILED: the '{name}' page was not caught")
                print(got)
                return 1
        if len(got) != 5:
            print("SELF-TEST FAILED: expected exactly the five planted pages")
            print(got)
            return 1

        # A stale exception is reported.
        if not any("does not exist" in v for v in find_violations(src, {"(school)/app/gone/page.tsx": "x"})):
            print("SELF-TEST FAILED: an exception for a missing page was not reported")
            return 1

        print("SELF-TEST PASSED")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    sys.exit(main())
