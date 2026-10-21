#!/usr/bin/env python3
"""The screenshot harness and session minting can never reach production.

scripts/harness/ shows the real signed-in screens on a throwaway local
database by signing its own session cookie (Decision Log C133). That is
safe only while it stays a development tool. This check fails CI if any of
these stops being true:

1. Nothing under src/ refers to the harness (scripts/harness, its database
   server, its seed) or imports PGlite. What src/ does not import is not in
   a build.
2. The means of signing a session stay where they are. Three allowlists,
   by capability rather than by spelling: who may import the signing
   library (jose), who may read the session secret, and who may name the
   token signers (signAccessToken, signPendingToken, signDeviceToken) under
   any alias. A new file in src/ that does any of these is a new way to
   become someone, and fails here until it is reviewed and listed.
3. No route of the app is a harness: no path under src/app is named for
   one, and every development-only page under src/app/(dev) calls
   notFound() when NODE_ENV is production (the existing pattern).
4. The harness itself refuses to run in production and only talks to
   127.0.0.1.
5. With --build <dir> (CI runs it after the Build step): the built output
   contains none of the harness's markers.

Static and text-based, like the other guards here. The negative tests are
in --self-test: each planted violation must be caught.

Usage:
    python3 scripts/check_harness_isolation.py [--build .next]
    python3 scripts/check_harness_isolation.py --self-test
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Rule 2, by capability. Each list is the complete set today.
JOSE_IMPORTERS = {"src/lib/auth/jwt.ts"}  # the only file that signs or verifies a token
SECRET_READERS = {
    "src/lib/auth/jwt.ts",  # signs and verifies with it
    "src/lib/auth/env.ts",  # reads it from the environment
    "src/lib/onboarding/intake.ts",  # keys the application-form digest; mints nothing
    "src/lib/documents/upload-ticket.ts",  # seals a pending record-document upload (C235-D2); mints nothing
    "src/lib/family/secret.ts",  # derives the Family app's hash keys: codes, the PIN's pepper, sealed items (C248); mints nothing
}
SIGNER_USERS = {
    "src/lib/auth/jwt.ts",  # defines the three signers
    "src/lib/auth/resolve.ts",  # sign-in, after every check has passed
    "src/lib/auth/refresh.ts",  # a refresh issues the next access token
    "src/lib/auth/account.ts",  # password and sign-in steps
    "src/lib/auth/authenticator.ts",  # the second step of sign-in
    "src/lib/auth/outcome-response.ts",  # turns a finished sign-in into cookies
    "src/app/api/control/impersonate/start/route.ts",  # time-boxed, audited impersonation
    # The Family app's own tokens (C248): defined in session.ts, issued only after a right email code (verify), and
    # parent mode only after the PIN (pin, unlock) or a PIN reset by the account's own email code.
    "src/lib/family/session.ts",
    "src/app/api/family/auth/code/route.ts",
    "src/app/api/family/auth/verify/route.ts",
    "src/app/api/family/pin/route.ts",
    "src/app/api/family/pin/unlock/route.ts",
    "src/app/api/family/pin/reset/route.ts",
}
JOSE_RE = re.compile(r"""(?:from|require\(|import\()\s*['"]jose(?:/[^'"]*)?['"]""")
SECRET_RE = re.compile(r"\bappSessionSecret\b|\bAPP_SESSION_SECRET\b")
SIGNER_RE = re.compile(r"\b(?:signAccessToken|signPendingToken|signDeviceToken|signFamilyToken|signFamilySession|signParentMode|signCodeStep)\b|\bSignJWT\b")
# The harness by name anywhere in a file; PGlite only as an import (comments
# in src/ may say that tests run on it).
HARNESS_REF_RE = re.compile(
    r"scripts/harness|harness-seed|PGLiteSocketServer|NCA_SCREENSHOT_HARNESS"
    r"|(?:from|require\(|import\()\s*['\"]@electric-sql/pglite",
    re.IGNORECASE,
)
# A hint only: rule 2 is the control. Names a sign-in shortcut tends to get.
HARNESS_ROUTE_RE = re.compile(
    r"harness|(?:dev|test|e2e|debug|fake)[-_]?(?:session|login|signin|auth)|login[-_]?as|impersonate[-_]?dev|(?:^|[-_])mint(?:$|[-_])",
    re.IGNORECASE,
)
# Markers that exist only in the harness; none may appear in a build.
BUILD_MARKERS = ["NCA_SCREENSHOT_HARNESS", "harness-not-a-key", "PGLiteSocketServer"]
CODE_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}


def find_violations(root: Path, build_dir: Path | None = None) -> list[str]:
    out: list[str] = []
    src = root / "src"

    for path in sorted(src.rglob("*")):
        if not path.is_file() or path.suffix not in CODE_EXT:
            continue
        rel = path.relative_to(root).as_posix()
        text = path.read_text(errors="ignore")
        # 1. src never refers to the harness. (The seed is a .sql file, not code.)
        m = HARNESS_REF_RE.search(text)
        if m:
            out.append(f"{rel}: refers to the screenshot harness or PGlite ({m.group(0)!r}); src/ must not")
        # 2. the means of signing a session stay in the allowlisted modules.
        if not rel.endswith((".test.ts", ".test.tsx")):
            if JOSE_RE.search(text) and rel not in JOSE_IMPORTERS:
                out.append(f"{rel}: mints a session token: imports the signing library (jose) outside the allowlist")
            if SECRET_RE.search(text) and rel not in SECRET_READERS:
                out.append(f"{rel}: mints a session token: reads the session secret outside the allowlist")
            if SIGNER_RE.search(text) and rel not in SIGNER_USERS:
                out.append(f"{rel}: mints a session token: uses a token signer outside the allowlist")

    # 3. no harness route; every (dev) page is closed in production.
    app = src / "app"
    if app.is_dir():
        for path in sorted(app.rglob("*")):
            rel = path.relative_to(root).as_posix()
            if path.is_dir() and HARNESS_ROUTE_RE.search(path.name):
                out.append(f"{rel}/: a route named like a harness or a sign-in shortcut; the app has none")
        dev_files = sorted(p for name in ("page.tsx", "route.ts") for p in (app / "(dev)").rglob(name)) if (app / "(dev)").is_dir() else []
        for page in dev_files:
            text = page.read_text()
            if not (re.search(r"""process\.env\.NODE_ENV\s*===\s*['"]production['"]""", text) and "notFound()" in text):
                out.append(f"{page.relative_to(root).as_posix()}: a development-only page that does not call notFound() in production")

    # 4. the harness guards itself.
    harness = root / "scripts" / "harness"
    if harness.is_dir():
        run = harness / "run.mjs"
        db = harness / "db.mjs"
        if run.is_file():
            text = run.read_text()
            if not re.search(r"""NODE_ENV\s*===\s*['"]production['"][\s\S]{0,200}?refusing to run""", text):
                out.append("scripts/harness/run.mjs: no longer refuses to run in production")
            if "randomBytes(" not in text:
                out.append("scripts/harness/run.mjs: the session secret must be made up for each run, never taken from the environment")
            if not re.search(r"""['"]-H['"],\s*['"]127\.0\.0\.1['"]""", text):
                out.append("scripts/harness/run.mjs: the app must be started on 127.0.0.1 only")
            if "...process.env" in text:
                out.append("scripts/harness/run.mjs: the app must get a clean environment, not a copy of this shell's")
        for f in sorted(harness.glob("*.mjs")):
            for name in ("APP_SESSION_SECRET", "DATABASE_URL"):
                if re.search(r"process\.env(?:\.|\[['\"])" + name, f.read_text()):
                    out.append(f"scripts/harness/{f.name}: reads {name} from the environment; the session secret must be made up for each run and the app pointed at its own local database only")
        if db.is_file() and "host: '127.0.0.1'" not in db.read_text():
            out.append("scripts/harness/db.mjs: the database server must listen on 127.0.0.1 only")

    # 5. nothing of the harness is in the build.
    if build_dir is not None:
        if not build_dir.is_dir():
            out.append(f"{build_dir}: build output not found (run the Build step first)")
        else:
            for path in sorted(build_dir.rglob("*")):
                if not path.is_file() or path.suffix not in {".js", ".html", ".json", ".rsc", ".txt", ".mjs"} or "/cache/" in path.as_posix():
                    continue
                text = path.read_text(errors="ignore")
                for marker in BUILD_MARKERS:
                    if marker in text:
                        out.append(f"{path.relative_to(root).as_posix() if root in path.parents else path}: the build contains the harness marker {marker!r}")
    for rel in sorted(JOSE_IMPORTERS | SECRET_READERS | SIGNER_USERS):
        if not (root / rel).is_file():
            out.append(f"an allowlist names {rel}, which does not exist: remove the entry")
    return out


def main(argv: list[str]) -> int:
    build = Path(argv[argv.index("--build") + 1]).resolve() if "--build" in argv else None
    violations = find_violations(REPO_ROOT, build)
    if violations:
        print("FAIL: the screenshot harness or session minting could reach production:")
        for v in violations:
            print(f"  {v}")
        return 1
    print(
        "PASS: nothing in src/ refers to the harness or PGlite; session tokens are minted only in "
        f"{len(SIGNER_USERS)} allowlisted auth modules; no harness route exists; every (dev) page is closed in production"
        + ("; the build contains no harness marker." if build else ".")
    )
    return 0


def self_test() -> int:
    import shutil
    import tempfile

    tmp = Path(tempfile.mkdtemp())
    try:
        def write(rel: str, text: str) -> None:
            p = tmp / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text)

        # A clean tree: the real shapes.
        for rel in sorted(JOSE_IMPORTERS | SECRET_READERS | SIGNER_USERS):
            write(rel, "export async function x() { return 1; }\n")
        write("src/lib/auth/jwt.ts", "import { SignJWT } from 'jose';\nexport async function signAccessToken() { return new SignJWT({}).sign(appSessionSecret()); }\n")
        write("src/lib/auth/resolve.ts", "export async function x() { return signAccessToken(claims); }\n")
        write("src/app/(dev)/design-system/page.tsx", "export default function P() { if (process.env.NODE_ENV === 'production') notFound(); return null; }\n")
        write("src/app/(school)/app/students/page.tsx", "export default function P() { return null; }\n")
        write("src/demo-fixture/harness-seed.sql", "insert into schools values (1);\n")
        write("scripts/harness/run.mjs", "if (process.env.NODE_ENV === 'production' || x) {\n  console.error('harness: refusing to run: local only');\n}\nconst secret = randomBytes(32);\nspawn(node, ['dev', '-H', '127.0.0.1'], { env: childEnv });\n")
        write("scripts/harness/db.mjs", "new PGLiteSocketServer({ db, port, host: '127.0.0.1' });\n")
        write(".next/server/app/page.js", "module.exports = 'a normal page';\n")
        clean = find_violations(tmp, tmp / ".next")
        if clean:
            print("SELF-TEST FAILED: a clean tree was flagged")
            print(clean)
            return 1

        # Each planted violation must be caught, one at a time.
        cases = {
            "a route in the app that signs a session": ("src/app/api/dev-session/route.ts", "export async function GET() { return signAccessToken({ role: 'super_admin' }); }\n", ["mints a session token", "a route named like a harness"]),
            "a page that imports the harness": ("src/app/(school)/app/x/page.tsx", "import { startHarnessDb } from '../../../../../scripts/harness/db.mjs';\n", ["refers to the screenshot harness"]),
            "PGlite imported by the app": ("src/lib/auth/db-dev.ts", "import { PGlite } from '@electric-sql/pglite';\n", ["refers to the screenshot harness or PGlite"]),
            "a SignJWT outside the auth modules": ("src/lib/tools/token.ts", "const t = await new SignJWT({ typ: 'access' }).sign(key);\n", ["uses a token signer"]),
            "the signing library under another name": ("src/lib/tools/t2.ts", "import * as jose from 'jose';\nconst t = new jose.SignJWT({});\n", ["imports the signing library"]),
            "the signing library with an alias": ("src/lib/tools/t3.ts", "import { SignJWT as J } from 'jose';\nconst t = new J({});\n", ["imports the signing library"]),
            "a signer under an alias": ("src/lib/tools/t4.ts", "import { signAccessToken as s } from '@/lib/auth/jwt';\nawait s(claims);\n", ["uses a token signer"]),
            "a pending token for any user": ("src/app/api/debug/login-as/route.ts", "export async function GET() { return signPendingToken({ userId, purpose: 'select_school' }); }\n", ["uses a token signer", "a route named like a harness"]),
            "a hand-built token": ("src/lib/tools/t5.ts", "const mac = createHmac('sha256', appSessionSecret());\n", ["reads the session secret"]),
            "a dev route handler left open": ("src/app/(dev)/peek/route.ts", "export async function GET() { return new Response('x'); }\n", ["does not call notFound() in production"]),
            "a dev page left open in production": ("src/app/(dev)/open/page.tsx", "export default function P() { return <div>open</div>; }\n", ["does not call notFound() in production"]),
            "the harness in the build": (".next/server/chunks/1.js", "const x = 'NCA_SCREENSHOT_HARNESS';\n", ["the build contains the harness marker"]),
        }
        for label, (rel, text, expect) in cases.items():
            write(rel, text)
            got = find_violations(tmp, tmp / ".next")
            for needle in expect:
                if not any(needle in v for v in got):
                    print(f"SELF-TEST FAILED: not caught: {label} ({needle})")
                    print(got)
                    return 1
            (tmp / rel).unlink()
            for parent in (tmp / rel).parents:  # remove the folders the case made, so the next starts clean
                if parent == tmp or any(parent.iterdir()):
                    break
                parent.rmdir()
            if find_violations(tmp, tmp / ".next"):
                print(f"SELF-TEST FAILED: tree not clean after removing: {label}")
                print(find_violations(tmp, tmp / ".next"))
                return 1

        # The harness losing its own guards.
        write("scripts/harness/run.mjs", "const secret = process.env.APP_SESSION_SECRET ?? randomBytes(32);\nspawn(node, ['dev'], { env: { ...process.env, APP_SESSION_SECRET: secret, DATABASE_URL: process.env.DATABASE_URL } });\n")
        write("scripts/harness/db.mjs", "new PGLiteSocketServer({ db, port, host: '0.0.0.0' });\n")
        got = find_violations(tmp)
        for needle in ("no longer refuses to run in production", "reads APP_SESSION_SECRET", "reads DATABASE_URL", "a clean environment", "started on 127.0.0.1 only", "must listen on 127.0.0.1 only"):
            if not any(needle in v for v in got):
                print(f"SELF-TEST FAILED: not caught: the harness without its guard ({needle})")
                print(got)
                return 1

        print("SELF-TEST PASSED")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    sys.exit(main(sys.argv[1:]))
