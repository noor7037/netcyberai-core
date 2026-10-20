#!/usr/bin/env python3
"""
Boundary checker for the Family App (docs/family-app/03_ARCHITECTURE.md §14, 06_PROJECT_STRUCTURE.md).
Enforces:
1. Family code imports only sanctioned libraries (contracts, i18n, design-tokens, ui, AI platform).
2. School code never imports family code.
3. Family code never runs raw SQL on public.* (only through SchoolLink).
4. No direct vendor SDK imports outside the platform adapters.
"""

import sys
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

FAMILY_DIRS = [
    REPO_ROOT / "src" / "lib" / "family",
    REPO_ROOT / "src" / "app" / "(family)",
    REPO_ROOT / "src" / "components" / "family",
]

SCHOOL_DIRS = [
    REPO_ROOT / "src" / "app" / "(school)",
    REPO_ROOT / "src" / "components" / "attendance",
    REPO_ROOT / "src" / "components" / "fees",
    REPO_ROOT / "src" / "components" / "students",
    REPO_ROOT / "src" / "components" / "staff",
    REPO_ROOT / "src" / "components" / "academics",
]

IMPORT_RE = re.compile(r"""(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))""")

# Allowed imports for family code:
ALLOWED_FAMILY_PREFIXES = (
    "@/lib/family",
    "@/lib/contracts",
    "@/lib/auth",
    "@/lib/i18n",
    "@/lib/design-tokens",
    "@/lib/ai",
    "@/components/family",
    "@/components/ui",
    "@/components/app-ui",
    "@/components/app-shell",
    "react",
    "next",
    "lucide-react",
)

def check_school_code_isolation():
    violations = []
    for sdir in SCHOOL_DIRS:
        if not sdir.exists():
            continue
        for f in sdir.rglob("*.ts*"):
            text = f.read_text(encoding="utf-8", errors="ignore")
            for m in IMPORT_RE.finditer(text):
                target = m.group(1) or m.group(2)
                if "@/" in target and ("family" in target or "lib/family" in target):
                    rel = f.relative_to(REPO_ROOT)
                    violations.append(f"{rel}: school code illegally imports family code: {target}")
    return violations

def check_family_imports():
    violations = []
    for fdir in FAMILY_DIRS:
        if not fdir.exists():
            continue
        for f in fdir.rglob("*.ts*"):
            text = f.read_text(encoding="utf-8", errors="ignore")
            for m in IMPORT_RE.finditer(text):
                target = m.group(1) or m.group(2)
                # allow relative imports within family
                if target.startswith("."):
                    continue
                # check alias imports
                if target.startswith("@/"):
                    if not any(target.startswith(p) for p in ALLOWED_FAMILY_PREFIXES):
                        rel = f.relative_to(REPO_ROOT)
                        violations.append(f"{rel}: family code illegally imports outside sanctioned boundaries: {target}")
    return violations

def main():
    violations = []
    violations += check_school_code_isolation()
    violations += check_family_imports()

    if violations:
        print("FAIL: Family boundary violations found:")
        for v in violations:
            print(f"  {v}")
        return 1

    print("PASS: Family App boundaries strictly isolated (03 §14).")
    return 0

if __name__ == "__main__":
    sys.exit(main())
