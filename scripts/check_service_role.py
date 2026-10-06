#!/usr/bin/env python3
"""The service-role Supabase client must stay a single, allowlisted choke point.

Raised while answering a real question during Prompt F's PR review: is
`newAuthAdminClient()` (src/lib/auth/supabase.ts) -- the client that
bypasses RLS and GoTrue's normal checks entirely, Supabase's own master
credential -- confined the same way SET ROLE is confined to db.ts? The
honest answer at the time was "partially, and not mechanically checked":
storage.ts's own header comment claimed the discipline, but
supabase.ts's comment named a caller module (src/lib/onboarding/invite.ts)
that does not exist in this codebase -- the real second caller is the
invite route itself, calling it inline. Two real call sites, one of them
misdescribed, and nothing that would have caught a third. This script
makes that discipline mechanically checked instead of merely asserted --
the same reasoning check_choke_point.py itself already used for SET ROLE.

Three checks:

1. `newAuthAdminClient` is DEFINED only in DEFINITION_MODULE. A second
   factory function constructing a service-role client anywhere else is
   exactly the violation this script exists to catch.
2. `newAuthAdminClient(` is CALLED only from DEFINITION_MODULE's own
   definition (excluded) or from AUTHORIZED_CALLERS. Any other call site
   is a new, unreviewed path to Supabase's master credential.
3. The credential itself -- the literal env var name
   SUPABASE_SERVICE_ROLE_KEY, or a direct call to the
   `supabaseServiceRoleKey()` accessor -- appears only in
   DEFINITION_MODULE (the one legitimate caller) or CREDENTIAL_MODULE
   (env.ts, where it's declared). This catches a bypass that skips
   newAuthAdminClient() entirely and reads the raw credential straight
   from process.env or the accessor function.

Usage:
    python3 scripts/check_service_role.py [path ...]   # defaults to src/
    python3 scripts/check_service_role.py --self-test

Exit 0 if all three checks pass. Exit 1 with the offending file:line
otherwise.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCAN_ROOT = REPO_ROOT / "src"

DEFINITION_MODULE = "src/lib/auth/supabase.ts"
CREDENTIAL_MODULE = "src/lib/auth/env.ts"
AUTHORIZED_CALLERS = {
    "src/lib/capture/storage.ts",
    # FileStorage on the private bucket (PR-4, C126): school-prefixed keys,
    # signed links only. Callers depend on the FileStorage interface.
    "src/lib/storage/supabase-file-storage.ts",
    # Founder-console account tools (C91): one-time sign-in/reset links,
    # temporary password, removing a lost authenticator. super_admin only.
    "src/lib/auth/admin-actions.ts",
    "src/app/api/control/schools/[schoolId]/invite/route.ts",
}

CLIENT_DEF_RE = re.compile(r"export\s+function\s+newAuthAdminClient\b")
CLIENT_CALL_RE = re.compile(r"\bnewAuthAdminClient\s*\(")
CREDENTIAL_NAME_RE = re.compile(r"SUPABASE_SERVICE_ROLE_KEY")
CREDENTIAL_FN_CALL_RE = re.compile(r"\bsupabaseServiceRoleKey\s*\(")


def iter_source_files(root: Path):
    for path in root.rglob("*"):
        if path.suffix in (".ts", ".tsx") and path.is_file():
            yield path


def make_rel(project_root: Path):
    def rel(path: Path) -> str:
        return str(path.relative_to(project_root))

    return rel


def check_definition_is_singular(files: list[Path], rel) -> list[str]:
    violations = []
    for f in files:
        rp = rel(f)
        text = f.read_text()
        for i, line in enumerate(text.splitlines(), start=1):
            if CLIENT_DEF_RE.search(line) and rp != DEFINITION_MODULE:
                violations.append(
                    f"{rp}:{i}: newAuthAdminClient is defined outside {DEFINITION_MODULE} -- "
                    "a second service-role client factory is exactly the violation this check "
                    "exists to catch"
                )
    return violations


def check_callers_are_allowlisted(files: list[Path], rel) -> list[str]:
    violations = []
    for f in files:
        rp = rel(f)
        if rp == DEFINITION_MODULE:
            continue
        text = f.read_text()
        for i, line in enumerate(text.splitlines(), start=1):
            if CLIENT_CALL_RE.search(line) and rp not in AUTHORIZED_CALLERS:
                violations.append(
                    f"{rp}:{i}: calls newAuthAdminClient() from outside the authorized caller "
                    f"list ({', '.join(sorted(AUTHORIZED_CALLERS))}) -- a new, unreviewed path "
                    "to Supabase's service-role master credential"
                )
    return violations


def check_credential_is_confined(files: list[Path], rel) -> list[str]:
    violations = []
    for f in files:
        rp = rel(f)
        if rp in (DEFINITION_MODULE, CREDENTIAL_MODULE):
            continue
        text = f.read_text()
        for i, line in enumerate(text.splitlines(), start=1):
            if CREDENTIAL_NAME_RE.search(line) or CREDENTIAL_FN_CALL_RE.search(line):
                violations.append(
                    f"{rp}:{i}: references the service-role credential directly -- must go "
                    f"through newAuthAdminClient() in {DEFINITION_MODULE}, never read the raw "
                    "key or call supabaseServiceRoleKey() from anywhere else"
                )
    return violations


def run(scan_root: Path, project_root: Path | None = None) -> int:
    rel = make_rel(project_root or REPO_ROOT)
    files = list(iter_source_files(scan_root))
    violations = (
        check_definition_is_singular(files, rel)
        + check_callers_are_allowlisted(files, rel)
        + check_credential_is_confined(files, rel)
    )
    if violations:
        print("FAIL: service-role choke point violated:")
        for v in violations:
            print(f"  {v}")
        return 1
    print(
        "PASS: newAuthAdminClient is defined only in "
        f"{DEFINITION_MODULE}, called only from its allowlisted callers "
        f"({', '.join(sorted(AUTHORIZED_CALLERS))}), and the service-role "
        f"credential itself is never referenced outside {DEFINITION_MODULE} "
        f"and {CREDENTIAL_MODULE}."
    )
    return 0


def self_test() -> int:
    import shutil
    import tempfile

    tmp = Path(tempfile.mkdtemp())
    try:
        good_dir = tmp / "good" / "src" / "lib" / "auth"
        good_dir.mkdir(parents=True)
        (good_dir / "supabase.ts").write_text(
            "export function newAuthAdminClient() { "
            "return createClient(supabaseUrl(), supabaseServiceRoleKey()); }\n"
        )
        good_caller_dir = tmp / "good" / "src" / "lib" / "capture"
        good_caller_dir.mkdir(parents=True)
        (good_caller_dir / "storage.ts").write_text(
            "import { newAuthAdminClient } from '@/lib/auth/supabase';\n"
            "export async function uploadDocument() { const client = newAuthAdminClient(); }\n"
        )
        rc_good = run(tmp / "good" / "src", project_root=tmp / "good")
        if rc_good != 0:
            print("SELF-TEST FAILED: the known-clean fixture was flagged as a violation")
            return 1

        # A second factory function constructing a service-role client
        # outside supabase.ts must be caught.
        bad_dir = tmp / "bad" / "src" / "lib" / "sneaky"
        bad_dir.mkdir(parents=True)
        (bad_dir / "leak.ts").write_text(
            "export function newAuthAdminClient() { return createClient(url, key); }\n"
        )
        rc_bad = run(tmp / "bad" / "src", project_root=tmp / "bad")
        if rc_bad == 0:
            print("SELF-TEST FAILED: a planted second newAuthAdminClient definition was NOT caught")
            return 1

        # A call site outside the allowlist must be caught, even though
        # the definition itself is in the right place.
        bad2_dir = tmp / "bad2" / "src" / "lib" / "auth"
        bad2_dir.mkdir(parents=True)
        (bad2_dir / "supabase.ts").write_text(
            "export function newAuthAdminClient() { return createClient(url, key); }\n"
        )
        bad2_route_dir = tmp / "bad2" / "src" / "app" / "api" / "app" / "students" / "route"
        bad2_route_dir.mkdir(parents=True)
        (bad2_route_dir / "unrelated.ts").write_text(
            "import { newAuthAdminClient } from '@/lib/auth/supabase';\n"
            "export async function GET() { const client = newAuthAdminClient(); }\n"
        )
        rc_bad2 = run(tmp / "bad2" / "src", project_root=tmp / "bad2")
        if rc_bad2 == 0:
            print("SELF-TEST FAILED: an unallowlisted caller of newAuthAdminClient() was NOT caught")
            return 1

        # A bypass that reads the raw credential directly, skipping
        # newAuthAdminClient() entirely, must be caught.
        bad3_dir = tmp / "bad3" / "src" / "lib" / "sneaky"
        bad3_dir.mkdir(parents=True)
        (bad3_dir / "shortcut.ts").write_text(
            "export function directClient() { return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY); }\n"
        )
        rc_bad3 = run(tmp / "bad3" / "src", project_root=tmp / "bad3")
        if rc_bad3 == 0:
            print("SELF-TEST FAILED: a direct SUPABASE_SERVICE_ROLE_KEY reference bypassing newAuthAdminClient() was NOT caught")
            return 1

        print("SELF-TEST PASSED: clean fixture passes, all three planted violations are caught")
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
