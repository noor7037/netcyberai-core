#!/usr/bin/env python3
"""Every /control and /app route actually goes through its guard.

B2 proved teacher -> /control is rejected with one real HTTP test. That
is correct evidence for the one route someone happened to test. It
says nothing about the next page.tsx a future prompt adds under the
wrong route group -- Next.js route groups (parenthesized folders) are
stripped from the URL, so a page placed under, say,
src/app/(marketing)/control/leak/page.tsx would resolve to the exact
same /control/leak URL as a page placed correctly under
src/app/(admin)/control/, without ever passing through
(admin)/control/layout.tsx's guard. Same shape as B2-hardening's
tenant-context choke point: one correct call site is not a guarantee
against a second, careless one appearing elsewhere.

Two checks:

1. Every page.tsx (and layout.tsx) in src/app whose RESOLVED URL
   (route groups stripped) starts with /control or /app must live,
   on disk, under the one sanctioned route-group folder for that
   prefix (src/app/(admin)/control/ or src/app/(school)/app/
   respectively). A file that resolves to that URL from anywhere else
   is a route that bypasses the guard layout entirely -- Next.js's own
   layout nesting can't rescue it, because it was never nested under
   the guard's layout.tsx in the first place.

2. The guard layouts themselves are checked for content, not just
   presence -- each must actually call its guard function
   (canAccessControl/canAccessApp) AND call redirect() on failure.
   A layout.tsx that exists but is a pass-through (e.g. `return
   <>{children}</>;` with no guard call) would satisfy "the file is
   there" while providing no actual protection -- this is the
   "component tree, not just presence of a file" requirement.

What this does NOT do: render anything or trace React's actual runtime
tree. It is a static, file-and-text check, same honesty standard as
check_choke_point.py -- the real-request runtime proof is the
Playwright verification run separately and reported alongside this.

Usage:
    python3 scripts/check_route_guards.py
    python3 scripts/check_route_guards.py --self-test
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
APP_ROOT = REPO_ROOT / "src" / "app"

CONTROL_GROUP = "(admin)/control"
APP_GROUP = "(school)/app"
# The family app (C230-D): a parent's session only, guarded by canAccessFamily.
FAMILY_GROUP = "(family)/family"

GROUP_SEGMENT_RE = re.compile(r"^\([^)]*\)$")


def resolved_url(rel_path: Path) -> str:
    """rel_path is relative to src/app, e.g. (admin)/control/schools/page.tsx."""
    parts = rel_path.parts[:-1]  # drop the page.tsx/layout.tsx filename
    segments = [p for p in parts if not GROUP_SEGMENT_RE.match(p)]
    return "/" + "/".join(segments) if segments else "/"


def find_route_files(app_root: Path) -> list[Path]:
    return [p for p in app_root.rglob("page.tsx")] + [p for p in app_root.rglob("layout.tsx")]


def check_no_leaking_routes(app_root: Path, rel_root: Path) -> list[str]:
    violations = []
    for f in find_route_files(app_root):
        rel = f.relative_to(rel_root)
        url = resolved_url(rel)
        rel_str = str(rel)

        if url == "/control" or url.startswith("/control/"):
            if not rel_str.startswith(CONTROL_GROUP + "/"):
                violations.append(
                    f"{rel_str}: resolves to {url} but is not under {CONTROL_GROUP}/ -- "
                    "bypasses the super_admin guard layout entirely"
                )
        if url == "/app" or url.startswith("/app/"):
            if not rel_str.startswith(APP_GROUP + "/"):
                violations.append(
                    f"{rel_str}: resolves to {url} but is not under {APP_GROUP}/ -- "
                    "bypasses the membership guard layout entirely"
                )
        if url == "/family" or url.startswith("/family/"):
            if not rel_str.startswith(FAMILY_GROUP + "/"):
                violations.append(
                    f"{rel_str}: resolves to {url} but is not under {FAMILY_GROUP}/ -- "
                    "bypasses the parent guard layout entirely"
                )
    return violations


def check_guard_layout_content(app_root: Path, rel_root: Path, group: str, guard_fn: str) -> list[str]:
    layout_path = app_root / group / "layout.tsx"
    rel_str = f"{group}/layout.tsx"
    if not layout_path.exists():
        return [f"{rel_str}: does not exist -- {guard_fn} has nowhere to run for this route group"]

    text = layout_path.read_text()
    violations = []
    if guard_fn + "(" not in text:
        violations.append(f"{rel_str}: does not call {guard_fn}() -- a pass-through layout guards nothing")
    if "redirect(" not in text:
        violations.append(f"{rel_str}: calls {guard_fn}() but never calls redirect() on failure")
    return violations


def run(app_root: Path, rel_root: Path | None = None) -> int:
    rel_root = rel_root or app_root
    violations = check_no_leaking_routes(app_root, rel_root)
    violations += check_guard_layout_content(app_root, rel_root, CONTROL_GROUP, "canAccessControl")
    violations += check_guard_layout_content(app_root, rel_root, APP_GROUP, "canAccessApp")
    violations += check_guard_layout_content(app_root, rel_root, FAMILY_GROUP, "canAccessFamily")

    if violations:
        print("FAIL: route-guard coverage violated:")
        for v in violations:
            print(f"  {v}")
        return 1

    print(
        "PASS: every /control and /app route file lives under its sanctioned route group, "
        "and both guard layouts call their guard function and redirect on failure."
    )
    print(
        "Caveat this check does NOT cover: it doesn't render React or trace the runtime "
        "component tree -- it confirms the STRUCTURAL guarantee (file location + guard-call "
        "presence) that Next.js's own layout nesting relies on. The runtime proof is the "
        "Playwright request test run alongside this."
    )
    return 0


def self_test() -> int:
    import shutil
    import tempfile

    tmp = Path(tempfile.mkdtemp())
    try:
        good = tmp / "good"
        (good / CONTROL_GROUP).mkdir(parents=True)
        (good / CONTROL_GROUP / "layout.tsx").write_text(
            "import { redirect } from 'next/navigation';\n"
            "export default function L({children}) { if (!canAccessControl(s)) { redirect('/login'); } return children; }\n"
        )
        (good / CONTROL_GROUP / "schools").mkdir(parents=True)
        (good / CONTROL_GROUP / "schools" / "page.tsx").write_text("export default function P() { return null; }\n")
        (good / APP_GROUP).mkdir(parents=True)
        (good / APP_GROUP / "layout.tsx").write_text(
            "import { redirect } from 'next/navigation';\n"
            "export default function L({children}) { if (!canAccessApp(s)) { redirect('/login'); } return children; }\n"
        )
        (good / FAMILY_GROUP).mkdir(parents=True)
        (good / FAMILY_GROUP / "layout.tsx").write_text(
            "import { redirect } from 'next/navigation';\n"
            "export default function L({children}) { if (!canAccessFamily(s)) { redirect('/login'); } return children; }\n"
        )
        rc_good = run(good)
        if rc_good != 0:
            print("SELF-TEST FAILED: the known-clean fixture was flagged as a violation")
            return 1

        bad = tmp / "bad"
        (bad / CONTROL_GROUP).mkdir(parents=True)
        (bad / CONTROL_GROUP / "layout.tsx").write_text(
            "import { redirect } from 'next/navigation';\n"
            "export default function L({children}) { if (!canAccessControl(s)) { redirect('/login'); } return children; }\n"
        )
        (bad / APP_GROUP).mkdir(parents=True)
        (bad / APP_GROUP / "layout.tsx").write_text(
            "import { redirect } from 'next/navigation';\n"
            "export default function L({children}) { if (!canAccessApp(s)) { redirect('/login'); } return children; }\n"
        )
        (bad / FAMILY_GROUP).mkdir(parents=True)
        (bad / FAMILY_GROUP / "layout.tsx").write_text(
            "import { redirect } from 'next/navigation';\n"
            "export default function L({children}) { if (!canAccessFamily(s)) { redirect('/login'); } return children; }\n"
        )
        # The planted violation: a page resolving to /control/leak from
        # a DIFFERENT route group, never passing through the real guard.
        (bad / "(marketing)" / "control" / "leak").mkdir(parents=True)
        (bad / "(marketing)" / "control" / "leak" / "page.tsx").write_text(
            "export default function Leak() { return 'leaked'; }\n"
        )
        rc_bad = run(bad)
        if rc_bad == 0:
            print("SELF-TEST FAILED: a route leaking the /control URL from outside the guard group was NOT caught")
            return 1

        print("SELF-TEST PASSED: clean fixture passes, the planted route-leak violation is caught")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    sys.exit(run(APP_ROOT))
