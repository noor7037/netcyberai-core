#!/usr/bin/env python3
"""The WhatsApp send-gate must stay a single, allowlisted choke point.

Same principle as the SET ROLE choke point in db.ts
(check_choke_point.py) and the service-role Supabase client
(check_service_role.py): exactly one module may call a real provider's
send() function, and exactly one module may ever decrypt a school's
WhatsApp credentials. Every trigger in scope for Prompt H (attendance-
absence notification, and any future one) must go through
src/lib/whatsapp/gate.ts's sendWhatsAppMessage() -- never a provider
directly, and never by reading whatsapp_config_get_credentials() from
anywhere else.

Two checks:

1. `.send(` is called on a WhatsApp provider only from GATE_MODULE
   (excluding PROVIDER_MODULE's own class definitions, which declare
   the method but never call it). A second call site is exactly a
   trigger bypassing the gate and hitting a provider directly.
2. `whatsapp_config_get_credentials` -- the one SQL function that can
   ever produce a plaintext WhatsApp credential (Supabase Vault-backed;
   app_user has no other path to vault.decrypted_secrets) -- is
   referenced only from GATE_MODULE. A second call site is a new,
   unreviewed path to a live, usable credential.

This is a textual heuristic, the same tradeoff check_choke_point.py and
check_service_role.py already make: it looks for the literal patterns
`.send(` and `whatsapp_config_get_credentials`, not a real TypeScript
call graph. `.send(` is broader than WhatsApp alone (e.g. a form
library's own `.send()`), so it only counts as a violation when the
same line's file also names a WhatsApp provider (the stand-in, Meta's
adapter, or the WhatsAppProvider interface itself) -- narrowing to files that actually hold a
provider instance, not every `.send(` in the codebase.

Usage:
    python3 scripts/check_whatsapp_send_gate.py           # scans src/
    python3 scripts/check_whatsapp_send_gate.py --self-test
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCAN_ROOT = REPO_ROOT / "src"

PROVIDER_MODULE = "src/lib/whatsapp/provider.ts"
GATE_MODULE = "src/lib/whatsapp/gate.ts"

PROVIDER_IMPORT_RE = re.compile(r"\b(MockWhatsAppProvider|StandInWhatsAppProvider|MetaWhatsAppProvider|WhatsAppProvider|WhatsAppProviderSPI)\b")
SEND_CALL_RE = re.compile(r"\.send(Text)?\s*\(")
CREDENTIALS_FN_RE = re.compile(r"\bwhatsapp_config_get_credentials\b")


def iter_source_files(root: Path):
    for path in root.rglob("*"):
        if path.suffix in (".ts", ".tsx") and path.is_file():
            yield path


def make_rel(project_root: Path):
    def rel(path: Path) -> str:
        return str(path.relative_to(project_root))

    return rel


def check_send_confined_to_gate(files: list[Path], rel) -> list[str]:
    violations = []
    for f in files:
        rp = rel(f)
        if rp == PROVIDER_MODULE:
            continue  # defines .send(), never calls it
        text = f.read_text()
        if not PROVIDER_IMPORT_RE.search(text):
            continue  # a `.send(` here belongs to something else entirely
        for i, line in enumerate(text.splitlines(), start=1):
            if SEND_CALL_RE.search(line) and rp != GATE_MODULE:
                violations.append(
                    f"{rp}:{i}: calls a WhatsApp provider's send() from outside {GATE_MODULE} -- "
                    "every trigger must go through sendWhatsAppMessage(), never a provider directly"
                )
    return violations


def check_credentials_confined_to_gate(files: list[Path], rel) -> list[str]:
    violations = []
    for f in files:
        rp = rel(f)
        if rp == GATE_MODULE:
            continue
        text = f.read_text()
        for i, line in enumerate(text.splitlines(), start=1):
            if CREDENTIALS_FN_RE.search(line):
                violations.append(
                    f"{rp}:{i}: references whatsapp_config_get_credentials outside {GATE_MODULE} -- "
                    "a new, unreviewed path to a live, usable WhatsApp credential"
                )
    return violations


def run(scan_root: Path, project_root: Path | None = None) -> int:
    rel = make_rel(project_root or REPO_ROOT)
    files = list(iter_source_files(scan_root))
    violations = check_send_confined_to_gate(files, rel) + check_credentials_confined_to_gate(files, rel)
    if violations:
        print("FAIL: WhatsApp send-gate choke point violated:")
        for v in violations:
            print(f"  {v}")
        return 1
    print(
        f"PASS: no WhatsApp provider send() call and no whatsapp_config_get_credentials reference "
        f"exists outside {GATE_MODULE}."
    )
    return 0


def self_test() -> int:
    import shutil
    import tempfile

    tmp = Path(tempfile.mkdtemp())
    try:
        good_dir = tmp / "good" / "src" / "lib" / "whatsapp"
        good_dir.mkdir(parents=True)
        (good_dir / "provider.ts").write_text(
            "export class MockWhatsAppProvider { async send(p) { return { success: true }; } }\n"
        )
        (good_dir / "gate.ts").write_text(
            "import { MockWhatsAppProvider } from './provider';\n"
            "export async function sendWhatsAppMessage() {\n"
            "  const provider = new MockWhatsAppProvider();\n"
            "  await provider.send({});\n"
            "  await client.query('select * from whatsapp_config_get_credentials($1)', [id]);\n"
            "}\n"
        )
        rc_good = run(tmp / "good" / "src", project_root=tmp / "good")
        if rc_good != 0:
            print("SELF-TEST FAILED: the known-clean fixture was flagged as a violation")
            return 1

        # A trigger calling provider.send() directly, bypassing the gate.
        bad_dir = tmp / "bad" / "src" / "lib" / "attendance"
        bad_dir.mkdir(parents=True)
        provider_copy_dir = tmp / "bad" / "src" / "lib" / "whatsapp"
        provider_copy_dir.mkdir(parents=True)
        (provider_copy_dir / "provider.ts").write_text(
            "export class MockWhatsAppProvider { async send(p) { return { success: true }; } }\n"
        )
        (bad_dir / "attendance.ts").write_text(
            "import { MockWhatsAppProvider } from '../whatsapp/provider';\n"
            "export async function markAbsent() {\n"
            "  const provider = new MockWhatsAppProvider();\n"
            "  await provider.send({});\n"
            "}\n"
        )
        rc_bad = run(tmp / "bad" / "src", project_root=tmp / "bad")
        if rc_bad == 0:
            print("SELF-TEST FAILED: a planted direct provider.send() call outside the gate was NOT caught")
            return 1

        # A second module reading the credentials function directly.
        bad2_dir = tmp / "bad2" / "src" / "lib" / "sneaky"
        bad2_dir.mkdir(parents=True)
        (bad2_dir / "leak.ts").write_text(
            "export async function leak(client) {\n"
            "  return client.query('select * from whatsapp_config_get_credentials($1)', [id]);\n"
            "}\n"
        )
        rc_bad2 = run(tmp / "bad2" / "src", project_root=tmp / "bad2")
        if rc_bad2 == 0:
            print("SELF-TEST FAILED: a planted direct whatsapp_config_get_credentials reference was NOT caught")
            return 1

        # A `.send(` unrelated to WhatsApp (no provider import) must
        # never be flagged -- this is the heuristic's own precision test.
        unrelated_dir = tmp / "unrelated" / "src" / "lib" / "mail"
        unrelated_dir.mkdir(parents=True)
        (unrelated_dir / "mailer.ts").write_text(
            "export async function notify(client) { await client.send({ to: 'a@b.com' }); }\n"
        )
        rc_unrelated = run(tmp / "unrelated" / "src", project_root=tmp / "unrelated")
        if rc_unrelated != 0:
            print("SELF-TEST FAILED: an unrelated .send( call with no WhatsApp provider import was wrongly flagged")
            return 1

        print("SELF-TEST PASSED")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    sys.exit(run(SCAN_ROOT))
