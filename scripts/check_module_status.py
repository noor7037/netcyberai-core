#!/usr/bin/env python3
"""A module the website calls "live" exists (T5, Decision Log C140).

src/content/module-status.ts says where each module stands in the real
product, and the website shows it. This check fails CI when:

1. A module marked `live` there has no evidence (LIVE_EVIDENCE in the same
   file), or its evidence is not in the repository:
     route  src/app/(school)/app/<route>/page.tsx, a real screen (not only
            the shared "coming" page)
     api    a route.ts under src/app/api/app/<api>
     table  `create table <table>` in supabase/migrations
   An evidence line may say `null` for the API or the table only with a
   written `why`.
2. module-status.ts and the app's own registry (src/lib/contracts/modules.ts)
   disagree about which modules are live.
3. src/content/ecosystem.ts states a status of its own, or names a module
   that module-status.ts does not have: its status labels come from
   module-status.ts only.

Text-based, like the other guards here.

Usage:
    python3 scripts/check_module_status.py
    python3 scripts/check_module_status.py --self-test
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
STATUS_FILE = "src/content/module-status.ts"
REGISTRY_FILE = "src/lib/contracts/modules.ts"
ECOSYSTEM_FILE = "src/content/ecosystem.ts"
# The real file has 33; fewer means the file was reformatted and this check can no longer read it.
MIN_MODULES = 3

STATUS_RE = re.compile(r"^\s*'?([a-z][a-z-]*)'?:\s*\{\s*status:\s*'([a-z-]+)'", re.M)
EVIDENCE_BLOCK_RE = re.compile(r"LIVE_EVIDENCE[^=]*=\s*\{(.*?)\n\};", re.S)
EVIDENCE_RE = re.compile(r"^\s*'?([a-z][a-z-]*)'?:\s*\{\s*route:\s*'([^']*)',\s*api:\s*(null|'[^']*'),\s*table:\s*(null|'[^']*')(?:,\s*why:\s*'((?:[^'\\]|\\.)*)')?", re.M)
REGISTRY_RE = re.compile(r"\{\s*id:\s*'([a-z-]+)'[^\n]*?status:\s*'([a-z0-9-]+)'")
ECO_MODULE_RE = re.compile(r"module:\s*'([a-z-]+)'")
STATUS_WORDS_RE = re.compile(r"['\"`](Live|Partly live|Foundation built|Planned|Needs specification|live|partial|foundation|planned|needs-spec)['\"`]")
NOT_A_SCREEN_RE = re.compile(r"<(ModuleComingPage|StubPage)\b")
REAL_SCREEN_RE = re.compile(r"<(?!ModuleComingPage\b|StubPage\b|ModuleOffPage\b|/|>)[A-Z][A-Za-z]*")


def find_violations(root: Path) -> list[str]:
    out: list[str] = []
    status_path = root / STATUS_FILE
    if not status_path.is_file():
        return [f"{STATUS_FILE}: not found"]
    text = status_path.read_text(encoding="utf-8")
    block = EVIDENCE_BLOCK_RE.search(text)
    status_text = text[: block.start()] if block else text
    statuses = dict(STATUS_RE.findall(status_text))
    if len(statuses) < MIN_MODULES:
        out.append(f"{STATUS_FILE}: only {len(statuses)} module statuses could be read (each is written on one line: `id: {{ status: '…', note: '…' }},`)")
    evidence = {m.group(1): m.groups()[1:] for m in EVIDENCE_RE.finditer(block.group(1))} if block else {}
    migrations = "\n".join(p.read_text(encoding="utf-8") for p in sorted((root / "supabase" / "migrations").glob("*.sql"))) if (root / "supabase" / "migrations").is_dir() else ""

    for module, status in sorted(statuses.items()):
        if status != "live":
            continue
        if module not in evidence:
            out.append(f"{STATUS_FILE}: '{module}' is marked live but has no line in LIVE_EVIDENCE (its route, API and table)")
            continue
        route, api, table, why = evidence[module]
        page = root / "src" / "app" / "(school)" / "app" / route / "page.tsx"
        if not page.is_file():
            out.append(f"{STATUS_FILE}: '{module}' is marked live but its page src/app/(school)/app/{route}/page.tsx does not exist")
        else:
            page_text = page.read_text(encoding="utf-8")
            if NOT_A_SCREEN_RE.search(page_text) and not REAL_SCREEN_RE.search(page_text):
                out.append(f"{STATUS_FILE}: '{module}' is marked live but its page only shows the \"coming\" page")
        for kind, value in (("API", api), ("table", table)):
            if value == "null" and not (why or "").strip():
                out.append(f"{STATUS_FILE}: '{module}' has no {kind} in LIVE_EVIDENCE and no `why` saying so")
        if api != "null":
            folder = root / "src" / "app" / "api" / "app" / api.strip("'")
            if not (folder.is_dir() and any(folder.rglob("route.ts"))):
                out.append(f"{STATUS_FILE}: '{module}' is marked live but has no API under src/app/api/app/{api.strip(chr(39))}")
        if table != "null" and not re.search(rf"create table (?:if not exists )?(?:public\.)?{re.escape(table.strip(chr(39)))}\b", migrations, re.I):
            out.append(f"{STATUS_FILE}: '{module}' is marked live but no migration creates the table {table}")
    for module in sorted(evidence):
        if module not in statuses:
            out.append(f"{STATUS_FILE}: LIVE_EVIDENCE names '{module}', which has no status")

    registry_path = root / REGISTRY_FILE
    if registry_path.is_file():
        registry = dict(REGISTRY_RE.findall(registry_path.read_text(encoding="utf-8")))
        for module in sorted(set(statuses) & set(registry)):
            site_live, app_live = statuses[module] == "live", registry[module] == "live"
            if site_live != app_live:
                out.append(f"'{module}' is {'live' if site_live else statuses[module]} in {STATUS_FILE} but {registry[module]} in {REGISTRY_FILE}: the website and the app must agree on what is live")

    eco_path = root / ECOSYSTEM_FILE
    if eco_path.is_file():
        eco = re.sub(r"//[^\n]*", "", eco_path.read_text(encoding="utf-8"))
        for m in STATUS_WORDS_RE.finditer(eco):
            out.append(f"{ECOSYSTEM_FILE}: states a status of its own ({m.group(0)}); status labels come from module-status.ts")
        for module in sorted(set(ECO_MODULE_RE.findall(eco))):
            if module not in statuses:
                out.append(f"{ECOSYSTEM_FILE}: names the module '{module}', which {STATUS_FILE} does not have")
        if ECO_MODULE_RE.search(eco) and "from './module-status'" not in eco:
            out.append(f"{ECOSYSTEM_FILE}: must take its status labels from ./module-status")
    return out


def main() -> int:
    violations = find_violations(REPO_ROOT)
    if violations:
        print('FAIL: a module called "live" that is not there, or status stated in two places:')
        for v in violations:
            print(f"  {v}")
        return 1
    text = (REPO_ROOT / STATUS_FILE).read_text(encoding="utf-8")
    live = sorted(m for m, s in STATUS_RE.findall(text[: text.index("LIVE_EVIDENCE")]) if s == "live")
    print(f"PASS: the {len(live)} modules marked live ({', '.join(live)}) each have their page, API and table; the app's registry agrees; ecosystem.ts states no status of its own.")
    return 0


def self_test() -> int:
    import shutil
    import tempfile

    tmp = Path(tempfile.mkdtemp())
    try:
        def write(rel: str, text: str) -> None:
            p = tmp / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text, encoding="utf-8")

        def expect(label: str, needle: str | None) -> bool:
            got = find_violations(tmp)
            ok = (not got) if needle is None else any(needle in v for v in got)
            if not ok:
                print(f"SELF-TEST FAILED: {label}")
                print(got)
            return ok

        status = (
            "export const moduleStatus = {\n"
            "  students: { status: 'live', note: 'x' },\n"
            "  'help-center': { status: 'live', note: 'x' },\n"
            "  fees: { status: 'foundation', note: 'x' },\n"
            "};\n\n"
            "export const LIVE_EVIDENCE: X = {\n"
            "  students: { route: 'students', api: 'students', table: 'students' },\n"
            "  'help-center': { route: 'help', api: null, table: null, why: 'Guides are files; nothing is stored.' },\n"
            "};\n"
        )
        registry = "const ROWS = [\n  { id: 'students', label: 'Students', status: 'live',\n    capabilities: [] },\n  { id: 'help-center', label: 'Help', status: 'live',\n    capabilities: [] },\n  { id: 'fees', label: 'Fees', status: 'foundation',\n    capabilities: [] },\n];\n"
        eco = "import { moduleStatus, STATUS_LABEL } from './module-status';\nexport const ECO_MODULES = [\n  { label: 'Fees', icon: 'fees', module: 'fees' },\n  { label: 'Alerts', icon: 'bell' },\n];\n"
        write(STATUS_FILE, status)
        write(REGISTRY_FILE, registry)
        write(ECOSYSTEM_FILE, eco)
        write("src/app/(school)/app/students/page.tsx", "export default function P() { return <StudentsView />; }\n")
        write("src/app/(school)/app/help/page.tsx", "export default function P() { return <ModulePage title='x' purpose='y'>z</ModulePage>; }\n")
        write("src/app/api/app/students/route.ts", "export async function GET() {}\n")
        write("supabase/migrations/1_base.sql", "create table students (student_id uuid primary key);\n")
        if not expect("a correct tree was flagged", None):
            return 1

        cases = [
            ("a live module with no evidence line", STATUS_FILE, status.replace("  students: { route: 'students', api: 'students', table: 'students' },\n", ""), "has no line in LIVE_EVIDENCE"),
            ("a live module whose page does not exist", STATUS_FILE, status.replace("route: 'students'", "route: 'pupils'"), "page.tsx does not exist"),
            ("a live module with no API", STATUS_FILE, status.replace("api: 'students'", "api: 'pupils'"), "has no API under"),
            ("a live module with no table", STATUS_FILE, status.replace("table: 'students'", "table: 'pupils'"), "no migration creates the table"),
            ("a missing API with no reason", STATUS_FILE, status.replace(", why: 'Guides are files; nothing is stored.'", ""), "no `why` saying so"),
            ("a module promoted to live without the app agreeing", STATUS_FILE, status.replace("fees: { status: 'foundation'", "fees: { status: 'live'"), "has no line in LIVE_EVIDENCE"),
            ("the website and the app disagreeing", REGISTRY_FILE, registry.replace("{ id: 'students', label: 'Students', status: 'live'", "{ id: 'students', label: 'Students', status: 'partial'"), "must agree on what is live"),
            ("ecosystem.ts stating its own status", ECOSYSTEM_FILE, eco.replace("module: 'fees' }", "module: 'fees', status: 'Live' }"), "states a status of its own"),
            ("ecosystem.ts naming a module that does not exist", ECOSYSTEM_FILE, eco.replace("module: 'fees'", "module: 'feez'"), "which src/content/module-status.ts does not have"),
        ]
        originals = {STATUS_FILE: status, REGISTRY_FILE: registry, ECOSYSTEM_FILE: eco}
        for label, rel, changed, needle in cases:
            write(rel, changed)
            if not expect(f"not caught: {label}", needle):
                return 1
            write(rel, originals[rel])
        write("src/app/(school)/app/students/page.tsx", "export default function P() { return <ModuleComingPage moduleId=\"students\" />; }\n")
        if not expect("not caught: a live module whose page is only the coming page", "only shows the \"coming\" page"):
            return 1

        print("SELF-TEST PASSED")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    sys.exit(main())
