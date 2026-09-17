#!/usr/bin/env python3
"""The tenant-context choke point must stay singular.

Prompt B2's own verification found the real security boundary of this
system: RLS trusts app.current_tenant_id/app.current_role/
app.current_user_id unconditionally (confirmed directly -- forging the
tenant GUC exposed another school's real membership rows even though
the RLS policies themselves were unchanged). Nothing in the database
stops a second, careless call site from setting those GUCs from
unverified input. The only thing that stops it is discipline: exactly
one module sets them, and that module only ever does so from a row
already read through the verified `memberships`/`users` resolution
path. This script makes that discipline mechanically checked instead
of merely asserted -- the same reasoning as check_claims.py replacing
an assertion with a check, one level up the stack.

Three checks, each intentionally narrow enough to be exact rather than
a data-flow analysis this script cannot honestly claim to perform:

1. `set_config(` for a Postgres session GUC appears ONLY in the one
   authorized module (AUTHORIZED_MODULE). Any other call site is the
   violation this script exists to catch.
2. The three context-wrapper functions (withTenantContext,
   withSelfContext, withBackendConnection) -- and any literal
   `set role` / `SET ROLE` statement -- are defined/used ONLY in that
   same module. A second, parallel role-switching helper would be just
   as dangerous as a second set_config call site.
3. No API route handler (src/app/api/**/route.ts, the actual boundary
   where client-controlled input enters this codebase) ever reads
   `schoolId` off its own parsed request body. This is deliberately
   file-local, not a full data-flow trace: it encodes the concrete
   invariant Prompt B2's report and hard constraints require --
   school_id is never accepted from a client -- as something this
   script can actually verify, rather than a claim the report merely
   makes. It does not, and cannot, prove no *indirect* path exists;
   see the script's own report output for that caveat stated plainly.

Usage:
    python3 scripts/check_choke_point.py [path ...]   # defaults to src/
    python3 scripts/check_choke_point.py --self-test

Exit 0 if all three checks pass. Exit 1 with the offending file:line
otherwise.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCAN_ROOT = REPO_ROOT / "src"
AUTHORIZED_MODULE = "src/lib/auth/db.ts"

SET_CONFIG_RE = re.compile(r"set_config\s*\(")
SET_ROLE_RE = re.compile(r"['\"`]\s*(set|reset)\s+role\b", re.IGNORECASE)
WRAPPER_DEF_RE = re.compile(
    r"export\s+async\s+function\s+(withTenantContext|withSelfContext|withBackendConnection)\b"
)
REQ_JSON_ASSIGN_RE = re.compile(r"\b(\w+)\s*=\s*(?:await\s+)?\w+\.json\(\)")
ROUTE_FILE_RE = re.compile(r"^src/app/api/.*/route\.tsx?$")


def iter_source_files(root: Path):
    for path in root.rglob("*"):
        if path.suffix in (".ts", ".tsx") and path.is_file():
            yield path


def make_rel(project_root: Path):
    def rel(path: Path) -> str:
        return str(path.relative_to(project_root))

    return rel


def check_set_config(files: list[Path], rel) -> list[str]:
    violations = []
    for f in files:
        text = f.read_text()
        if rel(f) == AUTHORIZED_MODULE:
            continue
        for i, line in enumerate(text.splitlines(), start=1):
            if SET_CONFIG_RE.search(line):
                violations.append(f"{rel(f)}:{i}: set_config() call outside {AUTHORIZED_MODULE}")
    return violations


def check_role_switch_and_wrappers(files: list[Path], rel) -> list[str]:
    violations = []
    for f in files:
        rp = rel(f)
        text = f.read_text()
        for i, line in enumerate(text.splitlines(), start=1):
            if rp != AUTHORIZED_MODULE and SET_ROLE_RE.search(line):
                violations.append(f"{rp}:{i}: SET ROLE/RESET ROLE literal outside {AUTHORIZED_MODULE}")
            m = WRAPPER_DEF_RE.search(line)
            if m and rp != AUTHORIZED_MODULE:
                violations.append(
                    f"{rp}:{i}: {m.group(1)} is defined outside {AUTHORIZED_MODULE} -- a second "
                    "context-wrapper implementation is exactly the violation this check exists to catch"
                )
    return violations


def check_route_handlers_never_read_schoolid(files: list[Path], rel) -> list[str]:
    violations = []
    for f in files:
        rp = rel(f)
        if not ROUTE_FILE_RE.match(rp):
            continue
        text = f.read_text()
        body_vars = set(m.group(1) for m in REQ_JSON_ASSIGN_RE.finditer(text))
        if not body_vars:
            continue
        for i, line in enumerate(text.splitlines(), start=1):
            for var in body_vars:
                if re.search(rf"\b{re.escape(var)}\.schoolId\b", line):
                    violations.append(
                        f"{rp}:{i}: reads `{var}.schoolId` from the parsed request body -- "
                        "school_id must always come from a verified membership row, never the client"
                    )
    return violations


def run(scan_root: Path, project_root: Path | None = None) -> int:
    rel = make_rel(project_root or REPO_ROOT)
    files = list(iter_source_files(scan_root))
    violations = (
        check_set_config(files, rel)
        + check_role_switch_and_wrappers(files, rel)
        + check_route_handlers_never_read_schoolid(files, rel)
    )
    if violations:
        print("FAIL: tenant-context choke point violated:")
        for v in violations:
            print(f"  {v}")
        return 1
    print(
        "PASS: set_config/SET ROLE/context-wrapper definitions are confined to "
        f"{AUTHORIZED_MODULE}; no API route reads schoolId from its own request body."
    )
    print(
        "Caveat this check does NOT cover: an indirect path where a route hands an "
        "unvalidated value to resolve.ts/refresh.ts under a different field name. "
        "Those two files are the ones responsible for only ever deriving schoolId "
        "from fetchOwnedActiveMembership/fetchLiveUser -- read them, this script "
        "only checks the mechanical, file-local invariant."
    )
    return 0


def self_test() -> int:
    import shutil
    import tempfile

    tmp = Path(tempfile.mkdtemp())
    try:
        good_dir = tmp / "good" / "src" / "lib" / "auth"
        good_dir.mkdir(parents=True)
        (good_dir / "db.ts").write_text(
            "export async function withTenantContext() { "
            "await client.query(\"set role app_user\"); "
            "await client.query(`select set_config('app.current_tenant_id', $1, true)`); }\n"
        )
        route_dir = tmp / "good" / "src" / "app" / "api" / "auth" / "switch-school"
        route_dir.mkdir(parents=True)
        (route_dir / "route.ts").write_text(
            "export async function POST(req) { const body = await req.json(); "
            "const outcome = await switchSchool(session, body.membershipId); }\n"
        )
        rc_good = run(tmp / "good" / "src", project_root=tmp / "good")
        if rc_good != 0:
            print("SELF-TEST FAILED: the known-clean fixture was flagged as a violation")
            return 1

        bad_dir = tmp / "bad" / "src" / "lib" / "sneaky"
        bad_dir.mkdir(parents=True)
        (bad_dir / "leak.ts").write_text(
            "export async function shortcut(client, schoolId) { "
            "await client.query(`select set_config('app.current_tenant_id', $1, true)`, [schoolId]); }\n"
        )
        rc_bad = run(tmp / "bad" / "src", project_root=tmp / "bad")
        if rc_bad == 0:
            print("SELF-TEST FAILED: a planted unauthorized set_config call site was NOT caught")
            return 1

        bad2_dir = tmp / "bad2" / "src" / "app" / "api" / "auth" / "hack"
        bad2_dir.mkdir(parents=True)
        (bad2_dir / "route.ts").write_text(
            "export async function POST(req) { const body = await req.json(); "
            "const schoolId = body.schoolId; }\n"
        )
        rc_bad2 = run(tmp / "bad2" / "src", project_root=tmp / "bad2")
        if rc_bad2 == 0:
            print("SELF-TEST FAILED: a route reading body.schoolId directly was NOT caught")
            return 1

        print("SELF-TEST PASSED: clean fixture passes, both planted violations are caught")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    paths = [Path(p) for p in sys.argv[1:] if not p.startswith("--")] or [SCAN_ROOT]
    rc = 0
    for p in paths:
        rc = run(p) or rc
    sys.exit(rc)
