#!/usr/bin/env python3
"""No fabricated numeric claims outside the demo fixture.

Replaces a blunt grep (`[0-9]+%|\u20b9[0-9]|\$[0-9]`) that could only be
kept quiet with file-path exclusions. A path exclusion means any future
numeric claim added to that file -- real or fabricated -- stops being
checked, which defeats the point of the check. This script instead
distinguishes the *shape* of a match:

1. A number-percent inside a quoted string literal immediately after a
   `:` in a `.ts`/`.tsx` file (e.g. `width: '100%'`) is a CSS value, not
   prose, and is never a claim.
2. A number-percent that is part of a worked arithmetic derivation shown
   inline (e.g. `5/15 = 33.3%`) is self-verifying: the proof is right
   there in the text, so nothing needs to be traced to an outside source.
   Any other number sharing the same enclosing comment block as such a
   derivation is treated as part of the same worked example.
3. A Postgres positional parameter (`$1`, `$2`, ...) inside a string that
   reads as a SQL statement (has a `select`/`insert`/`where`/... keyword),
   or a percentage inside a CSS `calc()` expression (e.g. Tailwind's
   `w-[calc(100%-2rem)]`), is query/style syntax, not a claim.
4. A number inside a string literal that is itself phrased as a question
   (the string, trimmed, ends in `?`) is not an assertion -- "Is the fee
   cap simply \"5% every year\"?" raises the number to negate it, it
   doesn't claim it. A rhetorical question is not a claim.
4. Anything else needs a citation -- a URL, a `Source:`/`Sources:` line,
   a `SourceLink`, a `sources:` array entry, or a `checkedOn:` field --
   somewhere in the smallest enclosing block (the nearest brace-balanced
   `{...}`, or the enclosing `/* ... */` comment). That block is the
   natural unit of "the same claim" in this codebase: one page component,
   one content object, one metadata entry. A raw character-count window
   was tried first and rejected: in a compact object literal (several
   short sibling entries close together, as in seo.ts's `pageMeta`), a
   window wide enough to reach a real citation also reaches into the
   *next* sibling's citation, so an unrelated, uncited entry would pass
   just for sitting near someone else's source. Scoping to the enclosing
   block only can't leak that way. No citation anywhere in scope means
   the claim fails, exactly as it should.

Usage:
    python3 scripts/check_claims.py [path ...]   # defaults to src/
    python3 scripts/check_claims.py --self-test

Exit 0 if every numeric claim is either a style value, a self-verifying
derivation, or traceable to a citation. Exit 1 otherwise.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCAN_ROOT = REPO_ROOT / "src"

# The check's own named exception: fictional demo data is expected to
# contain invented-looking numbers by design, not a false positive to
# quiet down.
EXEMPT_DIR = "src/demo-fixture/"

CLAIM_RE = re.compile(r"[0-9]+%|\u20b9[0-9]|\$[0-9]")
CITATION_RE = re.compile(
    r"https?://|SourceLink|Sources?:|checkedOn:", re.IGNORECASE
)
DERIVATION_RE = re.compile(r"[0-9]+\s*/\s*[0-9]+\s*=\s*[0-9.]+%")
SQL_KEYWORD_RE = re.compile(
    r"\b(select|insert|update|delete|where|values|set_config|returning|from)\b",
    re.IGNORECASE,
)

# String/comment spans, so brace matching and "is this inside a comment"
# checks don't get confused by braces or citation-looking text that only
# appears inside a string or a comment used for something else.
_TOKEN_RE = re.compile(
    r"(?P<comment>//[^\n]*|/\*.*?\*/)"
    r"|(?P<string>'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"|`(?:\\.|[^`\\])*`)",
    re.DOTALL,
)


@dataclass
class Violation:
    path: str
    line: int
    text: str


def _spans(text: str) -> list[tuple[int, int, str]]:
    return [
        (m.start(), m.end(), "comment" if m.lastgroup == "comment" else "string")
        for m in _TOKEN_RE.finditer(text)
    ]


def _enclosing_comment(pos: int, spans: list[tuple[int, int, str]]) -> tuple[int, int] | None:
    for start, end, kind in spans:
        if kind == "comment" and start <= pos < end:
            return start, end
    return None


def _in_span(pos: int, spans: list[tuple[int, int, str]]) -> bool:
    return any(start <= pos < end for start, end, _ in spans)


def _enclosing_brace_block(pos: int, text: str, spans: list[tuple[int, int, str]]) -> tuple[int, int]:
    depth = 0
    i = pos - 1
    open_pos = 0
    while i >= 0:
        if _in_span(i, spans):
            # Jump past whichever span covers i.
            for start, end, _ in spans:
                if start <= i < end:
                    i = start - 1
                    break
            continue
        ch = text[i]
        if ch == "}":
            depth += 1
        elif ch == "{":
            if depth == 0:
                open_pos = i
                break
            depth -= 1
        i -= 1
    else:
        return 0, len(text)

    depth = 0
    j = open_pos + 1
    while j < len(text):
        if _in_span(j, spans):
            for start, end, _ in spans:
                if start <= j < end:
                    j = end
                    break
            continue
        ch = text[j]
        if ch == "{":
            depth += 1
        elif ch == "}":
            if depth == 0:
                return open_pos, j + 1
            depth -= 1
        j += 1
    return open_pos, len(text)


def _enclosing_string(pos: int, spans: list[tuple[int, int, str]]) -> tuple[int, int] | None:
    for start, end, kind in spans:
        if kind == "string" and start <= pos < end:
            return start, end
    return None


def _is_css_value_shape(text: str, start: int, end: int) -> bool:
    if end >= len(text) or text[end] not in ("'", '"'):
        return False
    if start == 0 or text[start - 1] != text[end]:
        return False
    j = start - 2
    while j >= 0 and text[j] in " \t":
        j -= 1
    return j >= 0 and text[j] == ":"


def _is_css_calc_shape(text: str, start: int, end: int, spans: list[tuple[int, int, str]]) -> bool:
    """A percentage inside a CSS `calc()` expression -- e.g. Tailwind's
    arbitrary-value `w-[calc(100%-2rem)]` -- is a CSS value, not a claim.
    Distinguished the same shape-based way as `_is_css_value_shape`: an
    unclosed `calc(` earlier in the same string literal.
    """
    if end == 0 or text[end - 1] != "%":
        return False
    string_span = _enclosing_string(start, spans)
    if not string_span:
        return False
    prefix = text[string_span[0] + 1 : start]
    calc_idx = prefix.lower().rfind("calc(")
    if calc_idx == -1:
        return False
    return ")" not in prefix[calc_idx:]


def _is_sql_placeholder_shape(text: str, start: int, spans: list[tuple[int, int, str]]) -> bool:
    """A Postgres positional parameter ($1, $2, ...) inside a SQL string,
    not a currency claim. Distinguished by the enclosing string literal
    reading as a SQL statement (a `select`/`insert`/`where`/... keyword
    present) -- the same shape-based approach as the CSS-value check.
    """
    if text[start] != "$":
        return False
    string_span = _enclosing_string(start, spans)
    if not string_span:
        return False
    inner = text[string_span[0] + 1 : string_span[1] - 1]
    return bool(SQL_KEYWORD_RE.search(inner))


def find_unsourced_claims(text: str) -> list[tuple[int, str]]:
    """Return (line_number, matched_text) for every claim lacking a source."""
    spans = _spans(text)
    results = []
    for m in CLAIM_RE.finditer(text):
        start, end = m.span()

        if _is_css_value_shape(text, start, end):
            continue

        if _is_css_calc_shape(text, start, end, spans):
            continue

        if _is_sql_placeholder_shape(text, start, spans):
            continue

        string_span = _enclosing_string(start, spans)
        if string_span:
            inner = text[string_span[0] + 1 : string_span[1] - 1].rstrip()
            if inner.endswith("?"):
                continue

        comment_scope = _enclosing_comment(start, spans)
        scope = comment_scope if comment_scope else _enclosing_brace_block(start, text, spans)
        scope_text = text[scope[0] : scope[1]]
        if CITATION_RE.search(scope_text) or DERIVATION_RE.search(scope_text):
            continue

        line_no = text.count("\n", 0, start) + 1
        results.append((line_no, m.group()))
    return results


def check_file(path: Path) -> list[Violation]:
    text = path.read_text(encoding="utf-8")
    rel = str(path.relative_to(REPO_ROOT))
    return [Violation(rel, line, matched) for line, matched in find_unsourced_claims(text)]


def main(argv: list[str]) -> int:
    if "--self-test" in argv:
        return run_self_test()

    roots = [REPO_ROOT / a for a in argv] or [SCAN_ROOT]
    violations: list[Violation] = []
    for root in roots:
        for ext in ("*.ts", "*.tsx"):
            for path in sorted(root.rglob(ext)):
                rel = str(path.relative_to(REPO_ROOT)).replace("\\", "/")
                if rel.startswith(EXEMPT_DIR):
                    continue
                violations.extend(check_file(path))

    if violations:
        for v in violations:
            print(f"::error::{v.path}:{v.line}: unsourced numeric claim {v.text!r} "
                  f"-- trace it to a cited source or remove it.")
        return 1

    print("No unsourced numeric claims found.")
    return 0


# ---------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------


def run_self_test() -> int:
    cases: list[tuple[str, str, bool]] = [
        (
            "CSS value in a .tsx file",
            "export function Card() {\n"
            "  return {\n"
            "    style: {\n"
            "      width: '100%',\n"
            "      height: '100%',\n"
            "    },\n"
            "  };\n"
            "}\n",
            True,  # should PASS (no violations)
        ),
        (
            "CPI + 5% with a citation nearby",
            "<p>\n"
            "  In effect, CPI + 5% acts as the ceiling on the calculation.\n"
            "</p>\n"
            "<p>\n"
            "  Source: <SourceLink href=\"https://example.com/source\">The Tribune</SourceLink>\n"
            "</p>\n",
            True,
        ),
        (
            "bare invented number with no citation anywhere near it",
            "export const claim = 'We increased fee collection by 38% this quarter.';\n",
            False,  # must FAIL
        ),
        (
            "worked arithmetic derivation in a comment (self-verifying)",
            "/**\n"
            " * Proof with the original numbers:\n"
            " *   85 -> 90 :  (90-85)/(100-85) =  5/15 = 33.3%\n"
            " *   40 -> 55 :  (55-40)/(100-40) = 15/60 = 25.0%\n"
            " * This is what delivers \"60-70% of parents get a positive message\".\n"
            " */\n"
            "export const x = 1;\n",
            True,
        ),
        (
            "citation far away in an unrelated sibling object (seo.ts shape)",
            "export const pageMeta = {\n"
            "  other: {\n"
            "    title: 'Some other page',\n"
            "    // Source: https://example.com/unrelated\n"
            "  },\n"
            "  form6: {\n"
            "    title: 'Haryana Form 6 Fee Advisory (CPI + 5% Cap)',\n"
            "  },\n"
            "};\n",
            False,  # form6 has no citation in its own scope -- must still FAIL
        ),
        (
            "citation inside the same sibling object (seo.ts, fixed)",
            "export const pageMeta = {\n"
            "  form6: {\n"
            "    // Source: https://example.com/tribune-form6\n"
            "    title: 'Haryana Form 6 Fee Advisory (CPI + 5% Cap)',\n"
            "  },\n"
            "};\n",
            True,
        ),
        (
            "rhetorical FAQ question negating a number, no citation nearby",
            "export const faqs = [\n"
            "  {\n"
            "    question: 'Is the fee cap simply \"5% every year\"?',\n"
            "    answer: 'No. The cap is tied to the per-capita rise in staff salary.',\n"
            "  },\n"
            "];\n",
            True,
        ),
        (
            "fabricated stat dressed up as a question (still an assertion)",
            "export const claim = 'Did fee collection really increase by 38% this quarter? Yes, it did.';\n",
            False,
        ),
        (
            "SQL positional parameter inside a query string (not a claim)",
            "export function stmt() {\n"
            "  return `select token_version from users where user_id = $1`;\n"
            "}\n",
            True,
        ),
        (
            "bare dollar-digit with no SQL context nearby -- must still FAIL",
            "export const claim = 'Give the winner $1 million, no source needed.';\n",
            False,
        ),
        (
            "CSS calc() percentage in a Tailwind arbitrary-value class",
            "export function Box() {\n"
            "  return <div className=\"w-[calc(100%-2rem)] max-w-sm\" />;\n"
            "}\n",
            True,
        ),
        (
            "bare percentage claim that merely follows the word calc in prose",
            "export const claim = 'calc it yourself: fees rose 38% this quarter.';\n",
            False,
        ),
    ]

    failed = False
    for name, snippet, expect_pass in cases:
        violations = find_unsourced_claims(snippet)
        got_pass = len(violations) == 0
        status = "PASS" if got_pass == expect_pass else "FAIL"
        if status == "FAIL":
            failed = True
        print(f"[{status}] {name} -- expected {'pass' if expect_pass else 'fail'}, "
              f"got {'pass' if got_pass else 'fail'} (violations: {violations})")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
