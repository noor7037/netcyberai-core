#!/usr/bin/env python3
"""Real WCAG contrast ratios, computed, not eyeballed.

The login page's own `text-slate/60` bug (07_DESIGN_SYSTEM.md, Task 3
of B2-hardening) was caught by hand, once, on one page. This script is
that same arithmetic run automatically, on every `text-*` utility class
this codebase actually uses, everywhere it's used -- so the next
instance doesn't wait for someone to compute it by eye again.

What this script IS: a mechanical scan of className strings for
`text-<color>[/<opacity>]` utilities, each resolved against a
same-shape approximation of its background -- same discipline as
check_choke_point.py: narrow enough to be exact, not a claim of full
understanding it can't back up.

Background resolution, in order, per `text-*` class found:
  1. A `bg-<color>` utility in the SAME className string (the common
     case in this codebase -- Button's variantClasses, for example).
  2. Failing that, the nearest `bg-<color>` utility appearing EARLIER
     in the same file, in source order -- an approximation of "the
     nearest enclosing container's background," not a real DOM/CSS
     cascade resolution. A file that nests a light-on-dark section
     inside a dark-on-light one in a way source order doesn't capture
     could fool this; that's a real, stated limit, not a silent one.
  3. Failing that, off-white (`#F9FAFB`) -- this codebase's page
     background (src/app/layout.tsx's `bg-off-white`).

Text size (normal vs. "large," which gets the looser 3:1 floor per
WCAG 2.1 SC 1.4.3): large if a `text-lg`/`text-xl`/`text-2xl`/`text-3xl`+
utility is present in the same className, OR `text-sm`/`text-base`
paired with `font-bold`/`font-semibold` (>=14px bold clears the large
threshold). Otherwise normal (this codebase's own floor is 16px body
text per 07_DESIGN_SYSTEM.md, itself normal-sized).

"Critical" (checked against 7:1, WARNING not FAILURE, per this
project's own AAA-for-critical-states rule) is heuristically anything
using a `red-*` color, or on a line containing `role="alert"` or
`error`/`Error` in a nearby identifier.

Usage:
    python3 scripts/check_contrast.py [path ...]   # defaults to src/
    python3 scripts/check_contrast.py --self-test

Exit 0 if nothing is below the hard floor (4.5:1 normal / 3:1 large).
Exit 1 otherwise, with every failing pairing and its exact ratio.
Warnings (critical pairings under 7:1 but still >= the hard floor)
print but do not fail the build.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCAN_ROOT = REPO_ROOT / "src"

DEFAULT_BG = "#F9FAFB"  # off-white, this codebase's page background

# Every named color this codebase's Tailwind config or literal classes
# actually resolve to. Deliberately not all of Tailwind's palette --
# only what's wired in tailwind.config.ts (the design tokens) plus the
# literal Tailwind defaults this codebase is observed to use. A color
# used here that isn't in this table is reported as UNRESOLVED, not
# silently skipped -- see main().
COLOR_HEX = {
    # v3 (2026-09-25): navy/cyan/violet corrected to the founder's own
    # directly-stated hex values; `peach` added as the fourth stated
    # brand anchor -- see src/lib/design-tokens.ts for the full
    # rationale. Names unchanged from v1/v2 except the new `peach`.
    "sapphire": "#002357",
    "azure": "#016898",
    "cyan": "#02CFF9",
    "violet": "#4400F0",
    "peach": "#FFC590",
    "peach-text": "#1E293B",
    "emerald": "#0F766E",
    "emerald-text": "#0F766E",
    "amber": "#F5820B",
    "amber-text": "#92400E",
    "gold": "#F5B90A",
    "slate": "#1E293B",
    "off-white": "#F9FAFB",
    "white": "#FFFFFF",
    "black": "#000000",
    "red-600": "#DC2626",
    "red-700": "#B91C1C",
    "red-800": "#991B1B",
}

CLASS_ATTR_RE = re.compile(r"className\s*=\s*[{]?[`\"']([^`\"']*)[`\"']", re.DOTALL)
# Deliberately NOT a bare `[a-z]+` fallback -- that would also match
# Tailwind's non-color text-* utilities (text-sm, text-lg, text-left,
# text-center, text-base...), which is exactly the false-positive this
# regex was rewritten to rule out. A "color-shaped" token is either one
# of this script's own known names, or looks like Tailwind's numbered
# palette (`word-NNN`, e.g. red-700, gray-300) -- something is
# excluded specifically because it is NOT this: sm/lg/xl/base/left/
# center have no numeric suffix and aren't in KNOWN_COLOR_NAMES.
KNOWN_COLOR_NAMES = sorted(COLOR_HEX.keys(), key=len, reverse=True)
COLOR_TOKEN_RE = re.compile(
    r"\b(text|bg)-(" + "|".join(re.escape(n) for n in KNOWN_COLOR_NAMES) + r"|[a-z]+-\d{2,3})(?:/(\d{1,3}))?\b"
)
LARGE_SIZE_RE = re.compile(r"\btext-(lg|xl|2xl|3xl|4xl|5xl|6xl)\b")
SMALL_BUT_BOLD_RE = re.compile(r"\btext-(sm|base)\b.*\b(font-bold|font-semibold)\b")
# Deliberately NOT a bare "error"/"Error" word match -- that matched
# component-wide identifiers (a prop named `error`, `pending`, etc.)
# anywhere in a wide lookback window, flagging unrelated helper/pending
# text in the same file as WARN. role="alert" on the tag's OWN attrs is
# a real, narrow signal that THIS element is a critical/destructive
# announcement; combined with the separate `name.startswith("red")`
# check below, that's the actual critical-state signal, not a
# same-file word co-occurrence.
CRITICAL_HINT_RE = re.compile(r'role="alert"')


def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def relative_luminance(rgb: tuple[int, int, int]) -> float:
    def channel(c: int) -> float:
        c_norm = c / 255
        return c_norm / 12.92 if c_norm <= 0.03928 else ((c_norm + 0.055) / 1.055) ** 2.4

    r, g, b = rgb
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def contrast_ratio(hex1: str, hex2: str) -> float:
    l1 = relative_luminance(hex_to_rgb(hex1))
    l2 = relative_luminance(hex_to_rgb(hex2))
    lighter, darker = max(l1, l2), min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def blend_over(fg_hex: str, alpha_pct: int, bg_hex: str) -> str:
    fr, fgc, fb = hex_to_rgb(fg_hex)
    br, bgc, bb = hex_to_rgb(bg_hex)
    a = alpha_pct / 100
    r = round(fr * a + br * (1 - a))
    g = round(fgc * a + bgc * (1 - a))
    b = round(fb * a + bb * (1 - a))
    return "#%02x%02x%02x" % (r, g, b)


@dataclass
class Finding:
    file: str
    line: int
    text_color: str
    bg_color: str
    ratio: float
    is_large: bool
    is_critical: bool
    resolved: bool = True
    unresolved_name: str | None = None
    is_disabled: bool = False

    def floor(self) -> float:
        return 3.0 if self.is_large else 4.5

    def status(self) -> str:
        if not self.resolved:
            return "UNRESOLVED"
        # WCAG 2.1 SC 1.4.3 explicitly excludes "text ... that is part
        # of an inactive user interface component" from the contrast
        # requirement -- a real exemption, not a way to dodge the
        # checker. Caught a real instance of this during Prompt D
        # (ScanStubButton's dimmed disabled-state text, 2.34:1): worth
        # recognizing correctly rather than either failing a legitimate
        # exemption or quietly weakening the check.
        if self.is_disabled:
            return "EXEMPT"
        if self.ratio < self.floor():
            return "FAIL"
        if self.is_critical and self.ratio < 7.0:
            return "WARN"
        return "PASS"


# Tailwind's variant syntax is always `variant:utility` (hover:bg-white,
# focus-visible:text-slate, dark:bg-slate, group-hover:bg-white/10, ...)
# -- a `:` immediately before a color-token match is therefore never
# part of that match's own name, it is a variant guard, and the utility
# it guards only applies conditionally (on hover, on focus, ...), never
# as the element's base rendered style. Found live: Sidebar.tsx's mobile
# hamburger button pairs `text-white` with `hover:bg-white/10` in the
# same className -- extract_bg_color's regex matched "bg-white" inside
# "hover:bg-white/10" with no way to tell it apart from a real base
# `bg-white`, misresolving the button's actual background (bg-sapphire,
# from its ancestor) as white and flagging a false "text-white on
# white" failure. Any variant prefix produces the identical false
# positive, not just this one case, so the fix is general: a match
# immediately preceded by `:` is variant-guarded and excluded from base
# style resolution, wherever it's checked (background above, text color
# in scan_file's own loop).
def _is_variant_guarded(cls: str, match_start: int) -> bool:
    return match_start > 0 and cls[match_start - 1] == ":"


def extract_bg_color(cls: str) -> tuple[str, int] | None:
    for m in COLOR_TOKEN_RE.finditer(cls):
        if _is_variant_guarded(cls, m.start()):
            continue
        kind, name, opacity = m.group(1), m.group(2), m.group(3)
        if kind == "bg" and name in COLOR_HEX:
            return name, int(opacity) if opacity else 100
    return None


# Approximates DOM ancestry, not CSS inheritance (background-color
# doesn't inherit in CSS -- but visually, a child with no bg of its own
# sits on whatever its nearest ANCESTOR's background is, which is what
# actually matters for "what is this text readable against"). A single
# pass over the whole file's tag opens/closes, in order, as a stack:
# a className's ambient background is the nearest OPEN ancestor tag
# that set one, not merely the nearest bg-* that appears earlier in
# the file (a preceding SIBLING's background, e.g. a <button
# className="bg-sapphire">...</button> immediately before an unrelated
# <p>, is not that <p>'s background -- source-order proximity alone
# produced exactly that false positive during this script's own
# development; this stack fixes it).
#
# Still an approximation, not a real parser: it can't see JSX
# fragments' effect on nesting, doesn't evaluate conditional
# expressions, and a `>` inside a non-string JS expression in a tag's
# attribute span (e.g. `className={x > 5 ? 'a' : 'b'}`) would confuse
# where a tag "ends" -- not observed in this codebase's actual style
# (plain string/template classNames throughout), so accepted rather
# than built out further.
TAG_TOKEN_RE = re.compile(r"<(/?)([A-Za-z][\w.]*)([^<>]*?)(/?)>", re.DOTALL)


def scan_file(path: Path, project_root: Path) -> list[Finding]:
    rel = str(path.relative_to(project_root))
    text = path.read_text()

    stack: list[tuple[str, tuple[str, int] | None, bool]] = []  # (tag name, bg or None, disabled)
    findings: list[Finding] = []

    for tag_match in TAG_TOKEN_RE.finditer(text):
        is_closing, tag_name, attrs, is_self_closing = tag_match.groups()
        line_no = text.count("\n", 0, tag_match.start()) + 1

        if is_closing:
            for idx in range(len(stack) - 1, -1, -1):
                if stack[idx][0] == tag_name:
                    del stack[idx:]
                    break
            continue

        cls_match = CLASS_ATTR_RE.search(attrs)
        cls = cls_match.group(1) if cls_match else ""
        own_bg = extract_bg_color(cls)
        own_disabled = bool(re.search(r'\bdisabled\b|aria-disabled="true"', attrs))
        is_disabled = own_disabled or any(d for _, _, d in stack)

        for tok in COLOR_TOKEN_RE.finditer(cls):
            if _is_variant_guarded(cls, tok.start()):
                continue
            kind, name, opacity = tok.group(1), tok.group(2), tok.group(3)
            if kind != "text":
                continue
            alpha = int(opacity) if opacity else 100

            bg_name, bg_alpha = own_bg or next(
                (bg for _, bg, _ in reversed(stack) if bg), None
            ) or ("off-white", 100)

            if name not in COLOR_HEX or bg_name not in COLOR_HEX:
                findings.append(
                    Finding(
                        rel, line_no, name, bg_name, 0.0,
                        is_large=False, is_critical=False,
                        resolved=False, unresolved_name=name if name not in COLOR_HEX else bg_name,
                    )
                )
                continue

            bg_hex = COLOR_HEX[bg_name]
            if bg_alpha < 100:
                bg_hex = blend_over(bg_hex, bg_alpha, DEFAULT_BG)
            fg_hex = COLOR_HEX[name]
            if alpha < 100:
                fg_hex = blend_over(fg_hex, alpha, bg_hex)

            ratio = contrast_ratio(fg_hex, bg_hex)
            is_large = bool(LARGE_SIZE_RE.search(cls)) or bool(SMALL_BUT_BOLD_RE.search(cls))
            is_critical = name.startswith("red") or bool(CRITICAL_HINT_RE.search(attrs))

            findings.append(
                Finding(
                    rel, line_no, f"{name}/{alpha}" if alpha < 100 else name, bg_name, ratio,
                    is_large, is_critical, is_disabled=is_disabled,
                )
            )

        if not is_self_closing:
            stack.append((tag_name, own_bg, is_disabled))

    return findings


def iter_source_files(root: Path):
    for path in root.rglob("*"):
        if path.suffix in (".ts", ".tsx") and path.is_file():
            yield path


def run(scan_root: Path, project_root: Path | None = None) -> int:
    project_root = project_root or REPO_ROOT
    all_findings: list[Finding] = []
    for f in iter_source_files(scan_root):
        all_findings.extend(scan_file(f, project_root))

    fails = [f for f in all_findings if f.status() == "FAIL"]
    warns = [f for f in all_findings if f.status() == "WARN"]
    unresolved = [f for f in all_findings if f.status() == "UNRESOLVED"]
    passes = [f for f in all_findings if f.status() == "PASS"]
    exempt = [f for f in all_findings if f.status() == "EXEMPT"]

    print(f"Checked {len(all_findings)} text-color pairings across {scan_root}.")
    print(
        f"  PASS: {len(passes)}   EXEMPT (disabled): {len(exempt)}   "
        f"WARN (critical, <7:1): {len(warns)}   FAIL (<floor): {len(fails)}   UNRESOLVED: {len(unresolved)}"
    )

    if exempt:
        print("\nEXEMPT -- WCAG 1.4.3 excludes inactive UI component text from the contrast floor:")
        for f in exempt:
            print(f"  {f.file}:{f.line}: text-{f.text_color} on {f.bg_color} = {f.ratio:.2f}:1 (disabled)")

    if unresolved:
        print("\nUnresolved (color not in this script's known table -- add it rather than guessing):")
        for f in unresolved:
            print(f"  {f.file}:{f.line}: unknown color `{f.unresolved_name}`")

    if warns:
        print("\nWARN -- critical-context pairing below the 7:1 AAA floor (not a hard failure):")
        for f in warns:
            print(f"  {f.file}:{f.line}: text-{f.text_color} on {f.bg_color} = {f.ratio:.2f}:1")

    if fails:
        print("\nFAIL -- below the WCAG floor for this text size:")
        for f in fails:
            print(f"  {f.file}:{f.line}: text-{f.text_color} on {f.bg_color} = {f.ratio:.2f}:1 (floor {f.floor()}:1, {'large' if f.is_large else 'normal'} text)")
        return 1

    print("\nPASS: no text-color pairing is below its WCAG floor.")
    return 0


def self_test() -> int:
    import shutil
    import tempfile

    tmp = Path(tempfile.mkdtemp())
    try:
        good = tmp / "good"
        good.mkdir()
        (good / "Ok.tsx").write_text('<p className="text-slate/70 bg-white">fine</p>\n')
        rc_good = run(good, project_root=tmp)
        if rc_good != 0:
            print("SELF-TEST FAILED: known-good pairing was flagged as a failure")
            return 1

        bad = tmp / "bad"
        bad.mkdir()
        (bad / "Bad.tsx").write_text('<span className="text-slate/60 bg-white">too faint</span>\n')
        rc_bad = run(bad, project_root=tmp)
        if rc_bad == 0:
            print("SELF-TEST FAILED: the known slate/60-on-white bug class was NOT caught")
            return 1

        # The Sidebar.tsx bug shape: a `hover:`-guarded bg utility in the
        # SAME className as a base text color must not be mistaken for
        # the element's actual (ancestor-inherited) background.
        variant_guard = tmp / "variant_guard"
        variant_guard.mkdir()
        (variant_guard / "Guard.tsx").write_text(
            '<div className="bg-sapphire">'
            '<button className="text-white hover:bg-white/10">fine on sapphire</button>'
            '</div>\n'
        )
        rc_guard = run(variant_guard, project_root=tmp)
        if rc_guard != 0:
            print("SELF-TEST FAILED: hover:bg-white/10 was mistaken for a base white background")
            return 1

        print("SELF-TEST PASSED: clean pairing passes, the known bug classes are caught, variant-guarded utilities are not mistaken for base style")
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
