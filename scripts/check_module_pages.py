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

Every path counts (C136). Inside the page's component, and inside the view
it hands the screen to, each `return` that returns a screen must return
<ModulePage>, a view that is one, or the shared Coming page: a page cannot
show ModulePage to some people and its own layout to others (a loading or
error state drawn outside the template, a different screen for one role).
`return null`, redirect() and notFound() are fine. A return that chooses
between two screens in one expression (`return ok ? <A /> : <B />`) is
refused: write it as two returns, so each can be checked.

The check must be able to read the component, and fails when it cannot: the
page is written `export default function Name(...) {` and a view
`export function Name(...) {`, without a return type between the
parameters and the body; a top-level `return something()` that is not JSX,
null, redirect() or notFound() is refused, because the screen it returns
cannot be seen from here.

Still not seen (review catches these): a screen built in a helper and
returned from inside an `if { }` block, and a wrapper component that is
not ModulePage but renders it.

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


RETURN_RE = re.compile(r"\breturn\b")
NOT_A_SCREEN_RETURN_RE = re.compile(r"^(?:$|null\b|undefined\b|redirect\(|notFound\(|permanentRedirect\()")
JSX_RE = re.compile(r"<[A-Za-z]")
ROOT_RE = re.compile(r"\(?\s*<([A-Za-z][\w.]*)")
FRAGMENT_RE = re.compile(r"\(?\s*<>")


def _matching(text: str, start: int, open_ch: str, close_ch: str) -> int:
    """Index just past the bracket that closes the one at `start`. Brackets
    inside quoted text do not count."""
    depth = 0
    quote = ""
    i = start
    while i < len(text):
        ch = text[i]
        if quote:
            if ch == "\\":
                i += 1
            elif ch == quote:
                quote = ""
        elif ch in "'\"`":
            quote = ch
        elif ch == open_ch:
            depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return len(text)


UNREADABLE = "\0unreadable"


def component_body(text: str, name: str | None) -> str | None:
    """The body of `export default function` (name None) or of the exported
    component `name`; None when it cannot be found."""
    pattern = r"export\s+default\s+(?:async\s+)?function\b[^(]*" if name is None else rf"export\s+(?:default\s+)?(?:async\s+)?function\s+{re.escape(name)}\b[^(]*"
    m = re.search(pattern, text)
    if not m:
        return None
    params_end = _matching(text, m.end(), "(", ")")
    after = text[params_end:].lstrip()
    if not after.startswith("{"):
        return UNREADABLE  # a return type (or anything else) between the parameters and the body
    brace = text.index("{", params_end)
    return text[brace : _matching(text, brace, "{", "}")]


def screen_returns(body: str) -> list[str]:
    """What each return of a component returns: a tag name, "<>" for a
    fragment, or "?" for an expression that chooses between screens. Returns
    inside another return (a callback in the JSX) are part of that screen."""
    out: list[str] = []
    inside_until = 0
    for m in RETURN_RE.finditer(body):
        if m.start() < inside_until:
            continue
        rest = body[m.end() :]
        stripped = rest.lstrip()
        if stripped.startswith("("):
            end = _matching(body, m.end() + (len(rest) - len(stripped)), "(", ")")
        else:
            semi = body.find(";", m.end())
            end = semi if semi >= 0 else len(body)
        expr = body[m.end() : end]
        inside_until = end
        if not JSX_RE.search(expr) and "<>" not in expr:
            # return null, return; return redirect(...): not a screen. At the top
            # level of the component anything else returns a screen built
            # somewhere this check cannot see.
            depth = body.count("{", 0, m.start()) - body.count("}", 0, m.start())
            if depth == 1 and not NOT_A_SCREEN_RETURN_RE.match(expr.strip().lstrip("(").strip()):
                out.append("?")
            continue
        if expr.lstrip().startswith(("{", "[")):
            continue  # a callback building a row of data ({ label, content: <X /> }), not a screen
        root = ROOT_RE.match(expr.lstrip())
        if root:
            out.append(root.group(1))
        elif FRAGMENT_RE.match(expr.lstrip()):
            out.append("<>")
        else:
            out.append("?")
    return out


NOT_A_SCREEN = {"ModuleComingPage", "StubPage"}


def path_problem(where: str, body: str | None, allowed: set[str], shape: str) -> str | None:
    if body is None or body == UNREADABLE:
        return f"{where} cannot be read by this check; write it as `{shape}` with no return type before the body"
    for root in screen_returns(body):
        if root == "?":
            return f"{where} has a return whose screen cannot be seen here (two screens in one expression, or a screen built elsewhere); return the JSX itself, one screen per return"
        if root not in allowed:
            shown = "a fragment" if root == "<>" else f"<{root}>"
            return f"{where} returns {shown} on one path, outside ModulePage; every path of the screen renders through ModulePage"
    return None


def verdict(src: Path, page: Path) -> str | None:
    """None when the page passes; otherwise why it fails."""
    text = strip_comments(page.read_text())
    # Views this page may hand the screen to: imported components that are a ModulePage.
    views: dict[str, Path] = {}
    for spec in IMPORT_RE.findall(text):
        f = component_file(src, spec)
        if f and USES_RE.search(strip_comments(f.read_text())) and re.search(rf"<{re.escape(f.stem)}\b", text):
            views[f.stem] = f
    if USES_RE.search(text) or views:
        problem = path_problem("the page", component_body(text, None), {"ModulePage"} | NOT_A_SCREEN | set(views), "export default function Page(...) {")
        if problem:
            return problem
        for name, f in sorted(views.items()):
            problem = path_problem(f"its view {name}", component_body(strip_comments(f.read_text()), name), {"ModulePage"}, f"export function {name}(...) {{")
            if problem:
                return problem
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

        for name in ("bare", "plainview", "unused", "mixed", "commented"):
            (app / name / "page.tsx").unlink()

        # Every path counts (C136). Fine: a guard, a loading state INSIDE the
        # template, callbacks that return rows, a Coming page for some roles.
        write(
            app / "paths-ok" / "page.tsx",
            "export default async function P({ params, sep = ')' }: { params: { id: string }; sep?: string }) {\n"
            "  async function save() {\n    if (!ok) return;\n    return fetch('/x');\n  }\n"
            "  useEffect(() => {\n    return () => stop();\n  }, []);\n"
            "  if (!ok) return null;\n"
            "  if (gone) notFound();\n"
            "  if (teacher) return <ModuleComingPage moduleId=\"fees\" />;\n"
            "  if (loading) {\n    return <ModulePage title='a' purpose='b'><LoadingState /></ModulePage>;\n  }\n"
            "  const tabs = list.map((x) => {\n    return { id: x.id, content: <Panel /> };\n  });\n"
            "  return (\n    <ModulePage title='a' purpose='b'>\n      {rows.map((r) => {\n        return <li key={r.id}>{r.name}</li>;\n      })}\n      {empty ? <p>none</p> : <ul />}\n    </ModulePage>\n  );\n}\n",
        )
        write(comp / "views" / "ArrowView.tsx", "export const ArrowView = () => {\n  if (loading) return <div>Loading</div>;\n  return <ModulePage title='x' purpose='y'>z</ModulePage>;\n};\n")
        write(comp / "views" / "TwoFacedView.tsx", "export function TwoFacedView() {\n  if (loading) return <div>Loading</div>;\n  return <ModulePage title='x' purpose='y'>z</ModulePage>;\n}\n")
        if find_violations(src, exceptions):
            print("SELF-TEST FAILED: a page whose every path is the template was flagged")
            print(find_violations(src, exceptions))
            return 1
        planted = {
            # ModulePage for most, an own layout when loading.
            "path-loading": "export default function P() {\n  if (loading) return <div className='p-4'>Loading</div>;\n  return <ModulePage title='a' purpose='b'>c</ModulePage>;\n}\n",
            # An own layout for one role.
            "path-role": "export default function P() {\n  if (role === 'teacher') {\n    return (\n      <main>\n        <h1>Mine</h1>\n      </main>\n    );\n  }\n  return <ModulePage title='a' purpose='b'>c</ModulePage>;\n}\n",
            # A fragment on one path.
            "path-fragment": "export default function P() {\n  if (x) return <><h1>Own</h1></>;\n  return <ModulePage title='a' purpose='b'>c</ModulePage>;\n}\n",
            # Two screens chosen in one expression.
            "path-ternary": "export default function P() {\n  return ok ? <ModulePage title='a' purpose='b'>c</ModulePage> : <div>Own</div>;\n}\n",
            # The view it hands the screen to is the template only on one path.
            "path-view": "import { TwoFacedView } from '@/components/views/TwoFacedView';\nexport default function P() { return <TwoFacedView />; }\n",
            # Written so the check cannot read it: each must fail, not pass unread.
            "path-arrow": "const P = async () => {\n  if (x) return <div>Own</div>;\n  return <ModulePage title='a' purpose='b'>c</ModulePage>;\n};\nexport default P;\n",
            "path-annotated": "export default async function P(): Promise<{ a: string }> {\n  if (x) return <div>Own</div>;\n  return <ModulePage title='a' purpose='b'>c</ModulePage>;\n}\n",
            "path-elsewhere": "function Own() { return <div>Own</div>; }\nexport default function P() {\n  if (x) return <ModulePage title='a' purpose='b'>c</ModulePage>;\n  return Own();\n}\n",
            "path-arrow-view": "import { ArrowView } from '@/components/views/ArrowView';\nexport default function P() { return <ArrowView />; }\n",
            # A ModulePage view for some, an own layout for others.
            "path-view-or-own": "import { GoodView } from '@/components/views/GoodView';\nexport default function P() {\n  if (x) return <section>Own</section>;\n  return <GoodView />;\n}\n",
        }
        for name, text in planted.items():
            write(app / name / "page.tsx", text)
        got = find_violations(src, exceptions)
        for name in planted:
            if not any(f"/{name}/page.tsx" in v for v in got):
                print(f"SELF-TEST FAILED: the '{name}' page was not caught")
                print(got)
                return 1
        if len(got) != len(planted):
            print("SELF-TEST FAILED: expected exactly the planted every-path pages")
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
