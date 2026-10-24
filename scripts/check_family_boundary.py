#!/usr/bin/env python3
"""The Family app's boundary (docs/family-app/03 §14, C247). Fails CI when:

1. Family code imports anything outside what it may use: its own area, the contracts, the shared UI and app-ui
   components, i18n, the design tokens, time helpers, the AI platform's public interface, the storage interface, and a
   short list of platform services each named with the one family file allowed to use it (the family database
   helper, the token signing, the email sender).
2. School or Control code imports family code. The middleware may import the family session check, nothing else.
3. Family SQL names a table outside family.*, content.* and control.* (school data reaches a family only through
   SchoolLink, from M3), or code outside the family area names a family.* table (Control reads family data only as
   counts, through family.control_counts()).
4. A vendor's AI or video service is called from anywhere but the AI platform's adapters (src/lib/ai/adapters/**):
   no vendor SDK import, no vendor API host.
5. A family.*, content.* or control.* table is created without row level security both enabled and forced.

File-local and regex-based, like check_choke_point.py and check_rls_policies.py: it checks what each file says, not a
data flow.

Usage:
    python3 scripts/check_family_boundary.py
    python3 scripts/check_family_boundary.py --self-test
"""
from __future__ import annotations

import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# The family area: everything the Family app is made of.
FAMILY_AREA = ("src/lib/family/", "src/components/family/", "src/app/(family)/", "src/app/api/family/")

# What any family file may import.
FAMILY_MAY_IMPORT = (
    "@/lib/family/",
    "@/components/family/",
    "@/lib/contracts/",
    "@/components/ui/",
    "@/components/app-ui/",
    "@/lib/i18n",
    "@/lib/design-tokens",
    "@/lib/time/",
    "@/lib/ai/platform",  # the AI platform's public interface (03 §7)
    "@/lib/ai/prompts/",  # prompt text lives in the repository (08 §7)
    "@/lib/storage/file-storage",  # the storage interface
)
# Platform services, each allowed to exactly one family file (the door it goes through).
FAMILY_DOORS = {
    "@/lib/auth/db": {"src/lib/family/db.ts"},
    "@/lib/auth/jwt": {"src/lib/family/session.ts"},
    "@/lib/auth/env": {"src/lib/family/secret.ts"},
    "@/lib/email/sender": {"src/lib/family/sign-in.ts"},
    # The homework helper screens a photo with the upload screen every stored file uses (M2-6, C280).
    "@/lib/privacy/upload-check": {"src/lib/family/homework.ts"},
    # Voice input applies the 12-digit rule to the words it hears before they are shown (M2-7, C281).
    "@/lib/privacy/aadhaar": {"src/lib/family/voice.ts"},
    # Staff prepare the explanations of a syllabus version before children ask (C300): the content staff guard (the
    # authenticator) and the platform role's transaction, for this one route only.
    "@/lib/content/route": {"src/app/api/family/prepare/route.ts"},
    "@/lib/control/billing-route": {"src/app/api/family/prepare/route.ts"},
    # The Android shell's own speech engine (C230-Y): the web view has no speechSynthesis, so the English course and the
    # read-aloud button speak through the shell's TextToSpeech plugin, from this one file.
    "@capacitor/core": {"src/components/family/english/speech.ts"},
    # School Link (C230-AA): the school's records, read as the guardian, only through this one family file.
    "@/lib/school-link": {"src/lib/family/school.ts"},
    # A parent's own syllabus from a PDF (C230-AB): the PDF reader and its "title on its page" check, as Control's import.
    "@/lib/content/pdf-import": {"src/app/api/family/syllabus/read/route.ts"},
}
# Packages and the framework, allowed everywhere.
EXTERNAL_OK = re.compile(r"^(react|react-dom|next|jose|crypto|util|pg$|node:)")

# Outside the family area, these files may import exactly these family modules.
OUTSIDE_MAY_IMPORT_FAMILY = {
    "src/middleware.ts": {"@/lib/family/session"},
    # The preparing job (C316) runs the prepare tool's step with no browser open; staff only, see the file.
    "src/lib/jobs/ai-jobs.ts": {"@/lib/family/prepare"},
    # The push job (M3-8b, C339) is registered with the others; it runs inside each account's own family session.
    "src/lib/jobs/handlers.ts": {"@/lib/family/push"},
}

# Outside the family area, these files may name these family tables: the choke point's live session check (the one
# module allowed to set the family role and account, check_choke_point.py).
OUTSIDE_MAY_NAME_FAMILY_TABLE = {
    # The session check, and School Link's guardian context, which checks the family's own link in the same
    # transaction before reading the school as the guardian (C230-AA).
    "src/lib/auth/db.ts": {"accounts", "school_links"},
    # The school's office disconnects a guardian's Family app through this one definer function (C230-AA).
    "src/lib/school-link/index.ts": {"revoke_school_links_for_guardian"},
    # The AI platform's daily cap counts a family's requests in that family's own transaction (C249).
    "src/lib/ai/daily-cap.ts": {"ai_daily"},
    # Control's door to the people (C230-V) returns parents' emails and children's names: only its one reader, which
    # audits every read, may call it.
    "src/lib/control/family-people.ts": {"control_accounts"},
}

# C230-D's school parent home moved out of the family area to /parent (M1-2, C248): nothing is exempt any more.
LEGACY: set[str] = set()

VENDOR_IMPORT = re.compile(r"""from\s+['"](@anthropic-ai/|openai|@google/generative-ai|@google/genai|@google-cloud/|googleapis|groq-sdk|@mistralai/)""")
VENDOR_HOST = re.compile(r"(api\.anthropic\.com|api\.openai\.com|api\.cloudflare\.com|generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com|youtube\.googleapis\.com|www\.googleapis\.com/youtube)")
AI_ADAPTERS = "src/lib/ai/adapters/"

IMPORT_RE = re.compile(r"""(?:import|export)\s[^'"]*?from\s+['"](?P<mod>[^'"]+)['"]|import\(\s*['"](?P<dyn>[^'"]+)['"]\s*\)""")
TEMPLATE_RE = re.compile(r"`([^`]*)`", re.DOTALL)
SQL_HINT = re.compile(r"\b(select|insert|update|delete)\b", re.IGNORECASE)
TABLE_REF = re.compile(r"\b(?:from|join|into|update)\s+(?P<name>[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)\s*(?P<call>\()?", re.IGNORECASE)
# Any call of a family function, in any position (select family.f(...), from family.f(...)).
FAMILY_CALL = re.compile(r"\bfamily\.(?P<fn>[a-z_][a-z0-9_]*)\s*\(", re.IGNORECASE)
# Control's doors to the numbers (definer functions that return counts only, M1-7 and M2-11): any file may call them.
NUMBER_DOORS = {"control_counts", "m2_counts"}
FAMILY_TABLE_REF = re.compile(r"\b(?:from|join|into|update)\s+family\.(?P<table>[a-z_][a-z0-9_]*)\s*(?P<call>\()?", re.IGNORECASE)
SQL_WORDS = {"select", "set", "lateral", "unnest", "jsonb_array_elements", "jsonb_to_recordset", "generate_series", "jsonb_each", "jsonb_object_keys"}

CREATE_TABLE = re.compile(r"create\s+table\s+(?:if\s+not\s+exists\s+)?(?P<schema>family|content|control)\.(?P<table>\w+)\s*\(", re.IGNORECASE)
RLS_SWITCH = re.compile(r"alter\s+table\s+(?P<schema>family|content|control)\.(?P<table>\w+)\s+(?P<kind>enable|force)\s+row\s+level\s+security", re.IGNORECASE)
SQL_COMMENT = re.compile(r"--[^\n]*")


# `from` inside extract(... from x), substring(x from 2), trim(both ' ' from x) and the like names no table.
FUNCTION_FROM = re.compile(r"\b(extract|substring|trim|overlay|position)\s*\([^()]*$", re.IGNORECASE)


def inside_function_from(literal: str, at: int) -> bool:
    return bool(FUNCTION_FROM.search(literal[:at]))


def in_family_area(rel: str) -> bool:
    return rel.startswith(FAMILY_AREA)


def imports_of(text: str) -> list[str]:
    return [m.group("mod") or m.group("dyn") for m in IMPORT_RE.finditer(text)]


def strip_comments(text: str) -> str:
    return re.sub(r"(?m)^\s*//.*$", "", text)


def check_sources(root: Path) -> list[str]:
    problems: list[str] = []
    src = root / "src"
    if not src.exists():
        return problems
    for path in sorted(src.rglob("*")):
        if path.suffix not in (".ts", ".tsx") or not path.is_file():
            continue
        rel = path.relative_to(root).as_posix()
        text = path.read_text(encoding="utf-8")
        code = strip_comments(text)
        family = in_family_area(rel) and rel not in LEGACY

        # 4. Vendors only through the AI platform's adapters.
        if not rel.startswith(AI_ADAPTERS):
            if VENDOR_IMPORT.search(code):
                problems.append(f"{rel}: imports a vendor AI or video SDK; call the AI platform instead (03 §7)")
            if VENDOR_HOST.search(code):
                problems.append(f"{rel}: calls a vendor AI or video host directly; only src/lib/ai/adapters/** may")

        mods = imports_of(code)
        if family:
            # 1. What family code may import.
            for mod in mods:
                # A relative import is judged by where it lands (C230-AB): "../../content/x" from family code is
                # "@/lib/content/x", and gets no free pass for being written relatively.
                if mod.startswith("."):
                    landed = (Path(rel).parent / mod).as_posix()
                    landed = str(Path(landed)).replace("\\", "/")
                    parts: list[str] = []
                    for part in landed.split("/"):
                        if part == "..":
                            if parts:
                                parts.pop()
                        elif part not in ("", "."):
                            parts.append(part)
                    landed = "/".join(parts)
                    if not landed.startswith("src/"):
                        problems.append(f"{rel}: family code may not import {mod}")
                        continue
                    mod = "@/" + landed[len("src/"):]
                    if in_family_area("src/" + mod[2:] + ".ts") or in_family_area("src/" + mod[2:] + "/"):
                        continue
                if EXTERNAL_OK.match(mod):
                    continue
                if mod.startswith(FAMILY_MAY_IMPORT):
                    continue
                door = FAMILY_DOORS.get(mod)
                if door is not None and rel in door:
                    continue
                problems.append(f"{rel}: family code may not import {mod}")
            # 3. Family SQL stays in family.*, content.* and control.*.
            for literal in TEMPLATE_RE.findall(code):
                if not SQL_HINT.search(literal):
                    continue
                for m in TABLE_REF.finditer(literal):
                    name = m.group("name").lower()
                    if m.group("call") or name in SQL_WORDS or inside_function_from(literal, m.start()):
                        continue
                    schema = name.split(".")[0] if "." in name else None
                    if schema not in ("family", "content", "control"):
                        problems.append(f"{rel}: family SQL names {name}; only family.*, content.* and control.* (school data only through SchoolLink)")
        elif rel not in LEGACY:
            # 2. Nothing else imports family code.
            allowed = OUTSIDE_MAY_IMPORT_FAMILY.get(rel, set())
            for mod in mods:
                if mod.startswith(("@/lib/family/", "@/components/family/")) or mod in ("@/lib/family", "@/components/family"):
                    if mod not in allowed:
                        problems.append(f"{rel}: imports family code ({mod}); the family app is a bounded module (03 §14)")
            # 3. Family tables and functions only through the number doors, or a door listed for that one file above (the
            #    people door has exactly one reader, which audits every read).
            listed = OUTSIDE_MAY_NAME_FAMILY_TABLE.get(rel, set())
            for literal in TEMPLATE_RE.findall(code):
                for m in FAMILY_TABLE_REF.finditer(literal):
                    if m.group("call") or m.group("table") in listed:
                        continue
                    problems.append(f"{rel}: names family.{m.group('table')}; outside the family app only family.control_counts() and family.m2_counts() may be used")
                for m in FAMILY_CALL.finditer(literal):
                    fn = m.group("fn").lower()
                    if fn in NUMBER_DOORS or fn in listed:
                        continue
                    problems.append(f"{rel}: names family.{fn}(); outside the family app only family.control_counts() and family.m2_counts() may be called")
    return problems


def check_migrations(root: Path) -> list[str]:
    created: dict[str, None] = {}
    state: dict[str, set[str]] = {}
    mig = root / "supabase" / "migrations"
    if not mig.exists():
        return []
    for path in sorted(mig.glob("*.sql")):
        text = SQL_COMMENT.sub("", path.read_text(encoding="utf-8"))
        for m in CREATE_TABLE.finditer(text):
            created[f"{m.group('schema').lower()}.{m.group('table').lower()}"] = None
        for m in RLS_SWITCH.finditer(text):
            state.setdefault(f"{m.group('schema').lower()}.{m.group('table').lower()}", set()).add(m.group("kind").lower())
    problems = []
    for table in created:
        lacks = [k for k in ("enable", "force") if k not in state.get(table, set())]
        if lacks:
            problems.append(f"{table}: row level security not {' and '.join(lacks)}d (03 §14)")
    return problems


def run(root: Path) -> list[str]:
    return check_sources(root) + check_migrations(root)


def main() -> int:
    problems = run(ROOT)
    if problems:
        print("FAIL: the Family app's boundary (docs/family-app/03 §14):")
        for p in problems:
            print(f"  {p}")
        return 1
    print("PASS: family code imports only its allowed areas and doors, writes SQL only on family/content/control, nothing "
          "else imports it, vendors are reached only through the AI adapters, and every family/content/control table has "
          "row level security enabled and forced.")
    return 0


def self_test() -> int:
    def write(root: Path, rel: str, text: str) -> None:
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")

    cases = [
        ("family imports school code", "src/lib/family/x.ts", "import { a } from '@/lib/fees/family';\n", "may not import"),
        ("family uses a door it was not given", "src/lib/family/x.ts", "import { withFamilyContext } from '@/lib/auth/db';\n", "may not import"),
        ("family reaches outside by a relative path", "src/lib/family/x.ts", "import { a } from '../content/pdf-import';\n", "may not import @/lib/content/pdf-import"),
        ("family SQL on a school table", "src/lib/family/x.ts", "const q = `select * from students where x = 1`;\n", "family SQL names students"),
        ("family SQL on public.*", "src/app/api/family/x/route.ts", "const q = `select 1 from public.users`;\n", "family SQL names public.users"),
        ("school code imports family code", "src/lib/fees/x.ts", "import { y } from '@/lib/family/session';\n", "imports family code"),
        ("school code reads a family table", "src/lib/control/x.ts", "const q = `select count(*) from family.children`;\n", "names family.children"),
        ("the people door outside its audited reader", "src/app/api/control/x/route.ts", "const q = `select family.control_accounts($1, $2, $3, $4)`;\n", "names family.control_accounts"),
        ("a vendor SDK outside the adapters", "src/lib/family/x.ts", "import Anthropic from '@anthropic-ai/sdk';\n", "vendor AI or video SDK"),
        ("a vendor host outside the adapters", "src/lib/copilot/x.ts", "fetch('https://api.openai.com/v1/x');\n", "vendor AI or video host"),
        ("a family table without forced RLS", "supabase/migrations/1_x.sql", "create table family.t (id int);\nalter table family.t enable row level security;\n", "not forced"),
    ]
    clean = [
        ("src/lib/family/db.ts", "import { withFamilyContext } from '@/lib/auth/db';\n"),
        ("src/lib/family/y.ts", "import { t } from '@/lib/i18n';\nimport { Card } from '@/components/ui/Card';\nconst q = `select c.first_name, extract(epoch from c.created_at) from family.children c join content.topics t on true`;\nconst r = `select * from family.sign_in($1, $2, $3)`;\n"),
        ("src/lib/control/family-counts.ts", "const q = `select family.control_counts() as c`;\n"),
        ("src/lib/control/family-people.ts", "const q = `select family.control_accounts($1, $2, $3, $4) as people`;\n"),
        ("src/lib/ai/adapters/anthropic.ts", "fetch('https://api.anthropic.com/v1/messages');\n"),
        ("src/middleware.ts", "import { verifyFamilySession } from '@/lib/family/session';\n"),
        ("supabase/migrations/1_ok.sql", "create table content.t (id int);\nalter table content.t enable row level security;\nalter table content.t force row level security;\n"),
    ]
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp) / "clean"
        for rel, text in clean:
            write(base, rel, text)
        got = run(base)
        if got:
            print("SELF-TEST FAILED: a clean tree was flagged:", got)
            return 1
        for i, (label, rel, text, expect) in enumerate(cases):
            root = Path(tmp) / f"case{i}"
            for crel, ctext in clean:
                write(root, crel, ctext)
            write(root, rel, text)
            got = run(root)
            if not any(expect in g for g in got):
                print(f"SELF-TEST FAILED: {label}: expected '{expect}', got {got}")
                return 1
    print(f"SELF-TEST PASSED ({len(cases)} violations caught, a clean tree passes)")
    return 0


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv else main())
