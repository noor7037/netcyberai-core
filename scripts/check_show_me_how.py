#!/usr/bin/env python3
"""Every module page has "Show me how" (docs/19 rule 8).

"Screens teach themselves": the header of every working screen carries one
link to the Help Center guide for that screen's task. The link is
ModulePage's `help` prop: <ModulePage help="mark-attendance" ...>.

This check fails CI when a page of the school app (/app) that renders
through ModulePage (itself, or through the view it hands the screen to)
has no `help="<slug>"`, or names a guide that does not exist in
src/content/help/articles.ts.

Pages with no guide written yet are on a documented allowlist,
scripts/show_me_how_allowlist.json: page -> why. The list can only shrink:
  - a page not on it must have its guide;
  - a page on it that now has a guide, or is gone, must be taken off;
  - the list is compared with the one this branch started from (the merge
    base with origin/main): no page may be added to it. So a new screen
    ships with its guide, and editing the JSON by hand fails.

Text-based and file-local, like check_module_pages.py: it proves the link
is named in the source, and that the guide exists.

Usage:
    python3 scripts/check_show_me_how.py
    python3 scripts/check_show_me_how.py --self-test
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
# The school app. Control is the founder's own workspace: the Help Center's
# guides are written for schools, so Control's pages carry no "Show me how"
# and are not checked (C140; they were on the allowlist before).
ROOTS = ["src/app/(school)/app"]
ALLOWLIST = "scripts/show_me_how_allowlist.json"
ARTICLES = "src/content/help/articles.ts"
BASE_REF = "origin/main"
# Only the self-test sets this: a stand-in for the base branch's allowlist.
_BASE_FILE_FOR_SELF_TEST: Path | None = None

# A // comment starts a line or follows code punctuation; " // " inside a
# quoted attribute is words, and must not swallow the rest of the tag.
COMMENT_RE = re.compile(r"\{/\*.*?\*/\}|/\*.*?\*/|(?:^|(?<=[;{}(),]))[ \t]*//[^\n]*", re.S | re.M)
MODULE_PAGE_START_RE = re.compile(r"<ModulePage\b")
HELP_RE = re.compile(r"\bhelp=\"([a-z0-9-]+)\"")
IMPORT_RE = re.compile(r"import\s+(?:type\s+)?\{[^}]*\}\s+from\s+'@/components/([^']+)'")
NOT_THE_SCREEN = {"ModuleOffPage", "ModuleComingPage", "StubPage"}
SLUG_RE = re.compile(r"^\s*slug:\s*'([a-z0-9-]+)'", re.M)


def read(path: Path) -> str:
    return COMMENT_RE.sub("", path.read_text(encoding="utf-8"))


def opening_tags(text: str) -> list[str]:
    """The attributes of every <ModulePage ...> opening tag. The tag ends at
    the first > that is outside every {expression} and every quoted value,
    so `primary={<button onClick={() => go()}>…</button>}` before `help=`
    does not cut it short."""
    out: list[str] = []
    for m in MODULE_PAGE_START_RE.finditer(text):
        depth = 0
        quote = ""
        i = m.end()
        while i < len(text):
            ch = text[i]
            if quote:
                if ch == quote:
                    quote = ""
            elif depth == 0 and ch == '"':
                quote = ch
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
            elif ch == ">" and depth == 0:
                break
            i += 1
        out.append(text[m.end() : i])
    return out


def top_level(tag: str) -> str:
    """The tag's own attributes, without what is inside its {expressions}:
    a help="…" on a button inside `primary={…}` is not the page's."""
    out: list[str] = []
    depth = 0
    for ch in tag:
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        elif depth == 0:
            out.append(ch)
    return "".join(out)


def module_page_tags(root: Path, page: Path) -> list[str] | None:
    """The opening <ModulePage ...> tags of a page: its own, or those of the
    view it renders. None when the page does not render through ModulePage
    (a redirect, a Coming page, a dashboard)."""
    text = read(page)
    tags = opening_tags(text)
    if tags:
        return tags
    found: list[str] = []
    for spec in IMPORT_RE.findall(text):
        for ext in (".tsx", ".ts"):
            f = root / "src" / "components" / f"{spec}{ext}"
            # Not the screen itself: what a module's page shows when the module is off or not built.
            if f.is_file() and f.stem not in NOT_THE_SCREEN and re.search(rf"<{re.escape(f.stem)}\b", text):
                found.extend(opening_tags(read(f)))
    return found or None


def pages(root: Path) -> list[Path]:
    return [p for base in ROOTS if (root / base).is_dir() for p in sorted((root / base).rglob("page.tsx"))]


def base_allowlist(root: Path) -> dict[str, str] | None | str:
    if _BASE_FILE_FOR_SELF_TEST is not None:
        p = _BASE_FILE_FOR_SELF_TEST
        return json.loads(p.read_text())["pages"] if p.is_file() else None

    def git(*args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(["git", *args], cwd=root, capture_output=True, text=True)

    if git("rev-parse", "--verify", "--quiet", BASE_REF).returncode != 0:
        git("fetch", "--quiet", "--depth=1", "origin", "+refs/heads/main:refs/remotes/origin/main")
    if git("rev-parse", "--verify", "--quiet", BASE_REF).returncode != 0:
        return f"cannot read {BASE_REF} to compare the allowlist with (is this a git checkout with the origin remote?)"
    base = git("merge-base", "HEAD", BASE_REF)
    ref = base.stdout.strip() if base.returncode == 0 and base.stdout.strip() else BASE_REF
    got = git("show", f"{ref}:{ALLOWLIST}")
    return json.loads(got.stdout)["pages"] if got.returncode == 0 else None


def find_violations(root: Path) -> list[str]:
    out: list[str] = []
    allow_path = root / ALLOWLIST
    allowed: dict[str, str] = json.loads(allow_path.read_text(encoding="utf-8"))["pages"] if allow_path.is_file() else {}
    articles = root / ARTICLES
    slugs = set(SLUG_RE.findall(articles.read_text(encoding="utf-8"))) if articles.is_file() else set()
    if not slugs:
        out.append(f"{ARTICLES}: no guides found")

    seen: set[str] = set()
    for page in pages(root):
        rel = page.relative_to(root).as_posix()
        tags = module_page_tags(root, page)
        if tags is None:
            continue
        seen.add(rel)
        named = [HELP_RE.search(top_level(tag)) for tag in tags]
        missing = [m for m in named if m is None]
        for m in named:
            if m is not None and m.group(1) not in slugs:
                out.append(f"{rel}: \"Show me how\" names the guide '{m.group(1)}', which is not in {ARTICLES}")
        if missing and rel not in allowed:
            out.append(f"{rel}: no \"Show me how\"; give its ModulePage help=\"<guide slug>\" (write the guide in {ARTICLES} if there is none)")
        if not missing and rel in allowed:
            out.append(f"{ALLOWLIST}: {rel} now has its guide; take it off the list")
    for rel, why in sorted(allowed.items()):
        if rel not in seen:
            out.append(f"{ALLOWLIST}: {rel} is not a module page any more (or is gone); take it off the list")
        if not isinstance(why, str) or len(why.strip()) < 10:
            out.append(f"{ALLOWLIST}: {rel} has no reason written beside it")

    base = base_allowlist(root)
    if isinstance(base, str):
        out.append(base)
    elif base is not None:
        for rel in sorted(allowed):
            if rel not in base:
                out.append(f"{ALLOWLIST}: {rel} was added; the list only shrinks. A new screen ships with its guide.")
    return out


def main() -> int:
    violations = find_violations(REPO_ROOT)
    if violations:
        print('FAIL: a module page without "Show me how" (docs/19 rule 8), or the allowlist out of step:')
        for v in violations:
            print(f"  {v}")
        return 1
    allowed = json.loads((REPO_ROOT / ALLOWLIST).read_text(encoding="utf-8"))["pages"]
    total = sum(1 for p in pages(REPO_ROOT) if module_page_tags(REPO_ROOT, p) is not None)
    print(f'PASS: {total - len(allowed)} of {total} module pages have "Show me how" with a guide that exists; {len(allowed)} are on the allowlist, which has not grown since this branch left {BASE_REF}.')
    return 0


def self_test() -> int:
    import shutil
    import tempfile

    global _BASE_FILE_FOR_SELF_TEST
    tmp = Path(tempfile.mkdtemp())
    base_file = tmp / "base.json"
    _BASE_FILE_FOR_SELF_TEST = base_file
    try:
        def write(rel: str, text: str) -> None:
            p = tmp / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text, encoding="utf-8")

        def allow(pages_: dict[str, str]) -> None:
            write(ALLOWLIST, json.dumps({"pages": pages_}))

        def expect(label: str, needle: str | None) -> bool:
            got = find_violations(tmp)
            ok = (not got) if needle is None else any(needle in v for v in got)
            if not ok:
                print(f"SELF-TEST FAILED: {label}")
                print(got)
            return ok

        app = "src/app/(school)/app"
        write(ARTICLES, "export const HELP_ARTICLES = [\n  {\n    slug: 'mark-attendance',\n  },\n  {\n    slug: 'add-a-student',\n  },\n];\n")
        write(f"{app}/attendance/page.tsx", "export default function P() { return <ModulePage moduleId=\"attendance\" help=\"mark-attendance\" title={t(lang, 'x')} purpose=\"y\">z</ModulePage>; }\n")
        write("src/components/views/StudentsView.tsx", "export function StudentsView() {\n  return (\n    <ModulePage\n      help=\"add-a-student\"\n      title={a > b ? 'x' : 'y'}\n    >\n      z\n    </ModulePage>\n  );\n}\n")
        write(f"{app}/students/page.tsx", "import { StudentsView } from '@/components/views/StudentsView';\nexport default function P() { return <StudentsView />; }\n")
        write(f"{app}/fees/page.tsx", "export default function P() { return <ModuleComingPage moduleId=\"fees\" />; }\n")
        write(f"{app}/old/page.tsx", "export default function P() { return <ModulePage title=\"Old\" purpose=\"y\">z</ModulePage>; }\n")
        allow({f"{app}/old/page.tsx": "No guide written yet for this older screen."})
        if not expect("a correct tree was flagged", None):
            return 1

        write(f"{app}/new/page.tsx", "export default function P() { return <ModulePage title=\"New\" purpose=\"y\">z</ModulePage>; }\n")
        if not expect("a new page without a guide was not caught", "new/page.tsx: no \"Show me how\""):
            return 1
        write(f"{app}/new/page.tsx", "// help=\"mark-attendance\"\nexport default function P() { return <ModulePage title=\"New\" purpose=\"y\">{/* help=\"mark-attendance\" */}z</ModulePage>; }\n")
        if not expect("a guide named only in a comment was not caught", "new/page.tsx: no \"Show me how\""):
            return 1
        write(f"{app}/new/page.tsx", "export default function P() { return <ModulePage help=\"no-such-guide\" title=\"New\" purpose=\"y\">z</ModulePage>; }\n")
        if not expect("a guide that does not exist was not caught", "names the guide 'no-such-guide'"):
            return 1
        write(f"{app}/new/page.tsx", "export default function P() {\n  if (x) return <ModulePage help=\"mark-attendance\" title=\"A\" purpose=\"y\">z</ModulePage>;\n  return <ModulePage title=\"B\" purpose=\"y\">z</ModulePage>;\n}\n")
        if not expect("a page with the link on only one of its paths was not caught", "new/page.tsx: no \"Show me how\""):
            return 1
        write("src/components/views/BareView.tsx", "export function BareView() { return <ModulePage title=\"x\" purpose=\"y\">z</ModulePage>; }\n")
        write(f"{app}/new/page.tsx", "import { BareView } from '@/components/views/BareView';\nexport default function P() { return <BareView />; }\n")
        if not expect("a view without the link was not caught", "new/page.tsx: no \"Show me how\""):
            return 1
        # help= written after a button with its own > and an arrow function: still found.
        write(f"{app}/new/page.tsx", "export default function P() {\n  return (\n    <ModulePage\n      title={a > b ? 'x' : 'y'}\n      primary={<button onClick={() => go()}>Add</button>}\n      purpose=\"Fees // term 1\"\n      help=\"mark-attendance\"\n    >\n      z\n    </ModulePage>\n  );\n}\n")
        if not expect("a help= written after a button and a // in a value was not found", None):
            return 1
        # A help= that belongs to something inside the tag is not the page's.
        write(f"{app}/new/page.tsx", "export default function P() { return <ModulePage title=\"New\" purpose=\"y\" primary={<Tip help=\"mark-attendance\" />}>z</ModulePage>; }\n")
        if not expect("a help= on a child inside the tag was taken for the page's", "new/page.tsx: no \"Show me how\""):
            return 1
        # A // inside a one-line tag's words must not hide the tag.
        write(f"{app}/new/page.tsx", "export default function P() { return <ModulePage title=\"New\" purpose=\"Fees // term 1\">z</ModulePage>; }\n")
        if not expect("a page whose tag has // in its words was skipped", "new/page.tsx: no \"Show me how\""):
            return 1
        (tmp / f"{app}/new/page.tsx").unlink()

        write(f"{app}/old/page.tsx", "export default function P() { return <ModulePage help=\"add-a-student\" title=\"Old\" purpose=\"y\">z</ModulePage>; }\n")
        if not expect("a page that got its guide but stayed on the list was not caught", "now has its guide"):
            return 1
        (tmp / f"{app}/old/page.tsx").unlink()
        if not expect("a list entry for a page that is gone was not caught", "is not a module page any more"):
            return 1
        write(f"{app}/old/page.tsx", "export default function P() { return <ModulePage title=\"Old\" purpose=\"y\">z</ModulePage>; }\n")
        allow({f"{app}/old/page.tsx": ""})
        if not expect("a list entry without a reason was not caught", "has no reason"):
            return 1

        # Against the base branch: the list cannot gain a page.
        base_file.write_text(json.dumps({"pages": {f"{app}/old/page.tsx": "No guide written yet for this older screen."}}))
        write(f"{app}/new/page.tsx", "export default function P() { return <ModulePage title=\"New\" purpose=\"y\">z</ModulePage>; }\n")
        allow({f"{app}/old/page.tsx": "No guide written yet for this older screen.", f"{app}/new/page.tsx": "I will write it later, promise."})
        if not expect("a page added to the list by hand was not caught", "was added; the list only shrinks"):
            return 1
        (tmp / f"{app}/new/page.tsx").unlink()
        allow({f"{app}/old/page.tsx": "No guide written yet for this older screen."})
        if not expect("a tree matching its base was flagged", None):
            return 1

        print("SELF-TEST PASSED")
        return 0
    finally:
        _BASE_FILE_FOR_SELF_TEST = None
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    sys.exit(main())
