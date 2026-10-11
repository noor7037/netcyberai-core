#!/usr/bin/env python3
"""Words on /app and /control screens come from the message files.

docs/19 rule 3: Hindi and English everywhere. A screen that writes its own
words can only ever speak one language, so every word a person reads comes
from src/lib/i18n/messages (en.ts and hi.ts, same keys) or from the error
catalogue and Help articles, which are already in both languages.

What this check does (text-based, like the other guards here):

1. Finds hard-coded words in the .tsx files of the app and Control and of
   the component folders they draw from:
     - text between tags, including text beside a {value}
       ("<p>Showing {n} students</p>");
     - the attributes a person reads or hears (aria-label, title,
       placeholder, alt, label, purpose, description and the like),
       written as "…", '…' or {'…'};
     - quoted sentences anywhere in the file (a toast, a ternary, a
       label: '…' in a list), recognised as words by starting with a
       capital or a Hindi letter and having a space;
     - one-word labels in the places a label goes ({'Save'}, label: 'Save').
2. A file with none is clean and must stay clean.
3. The screens written before the language switch are on a documented
   allowlist, scripts/ui_strings_allowlist.json: file -> how many
   hard-coded strings it still has. The list can only shrink:
     - a file may not go above its number, and a file not on the list may
       not have any;
     - when a file drops below its number the number must be lowered
       (--update), so the gain is kept;
     - --update never raises a number and never adds a file;
     - the list is compared with the one this branch started from (the
       merge base with origin/main): no higher number than there, and no
       new file, so editing the JSON by hand, or deleting it and starting
       again, fails. One exception, for a rename or a split: a file may
       join the list when a file that was on it is gone from the tree and
       the list's sum has not gone up.
   P1c-4 and P1c-5 move the remaining screens; the list is empty when done.
4. The message files: en.ts and hi.ts have the same keys and the same
   {values}, every line of them is understood by this check, and neither
   uses the words docs/19 names as jargon.

5. A line that this check takes for words but is not (a date pattern, a
   font name, a brand name) is marked at its end with
       // ui-strings: not words (the reason)
   and is skipped. Every marker is counted in the PASS line, so they are
   seen in review.

Limits, stated plainly: it counts, so replacing one hard-coded string with
another in an allowlisted file is not seen; and words kept in .ts data
files or built in variables are not read.

Usage:
    python3 scripts/check_ui_strings.py              check
    python3 scripts/check_ui_strings.py --update     lower the numbers after moving strings
    python3 scripts/check_ui_strings.py --init       write the first allowlist (refused if one exists)
    python3 scripts/check_ui_strings.py --self-test
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ALLOWLIST = "scripts/ui_strings_allowlist.json"
BASE_REF = "origin/main"
NOT_WORDS = "ui-strings: not words"
# Only the self-test sets this: a stand-in for the base branch's allowlist.
_BASE_FILE_FOR_SELF_TEST: Path | None = None

# Where a signed-in person's screens live.
ROOTS = [
    "src/app/(school)/app",
    "src/app/(admin)/control",
    "src/components/app-shell",
    "src/components/app-ui",
    "src/components/account",
    "src/components/academics",
    "src/components/attendance",
    "src/components/compliance",
    "src/components/control",
    "src/components/dashboards",
    "src/components/help",
    "src/components/settings",
    "src/components/shell",
    "src/components/students",
    "src/components/tickets",
    "src/components/ui",
]

MESSAGES_EN = "src/lib/i18n/messages/en.ts"
MESSAGES_HI = "src/lib/i18n/messages/hi.ts"
# docs/19 rule 3: words a non-technical person should never be shown.
JARGON = ["invalid", "entity", "null", "sync failed", "undefined", "exception", "payload", "fetch failed"]

LETTERS = r"A-Za-zऀ-ॿ"
# A comment starts a line, or follows a space or an opening brace: the /* in
# accept="image/*" and the // in a URL are not comments.
COMMENT_RE = re.compile(r"(?:(?<=\s)|(?<=\{)|^)/\*.*?\*/|(?:(?<=\s)|^)//[^\n]*", re.DOTALL | re.MULTILINE)
# Text between two tags.
TAG_TEXT_RE = re.compile(rf">([^<>{{}}]*?[{LETTERS}]{{2,}}[^<>{{}}]*?)<")
# Text beside a {value}: "}words<", ">words{", "}words{".
BRACE_TEXT_RE = re.compile(rf"(?:\}}([^<>{{}}]*?[{LETTERS}]{{2,}}[^<>{{}}]*?)[<{{]|>([^<>{{}}]*?[{LETTERS}]{{2,}}[^<>{{}}]*?)\{{)")
READ_ATTRS = (
    r"aria-label|aria-description|title|placeholder|alt|label|purpose|description|eyebrow|hint|helpText|emptyTitle|emptyHint"
    r"|confirmLabel|cancelLabel|subtitle|heading|message|caption|summary|tooltip"
)
# attr="…", attr='…', attr={'…'}, attr={"…"}
ATTR_RE = re.compile(rf"\b(?:{READ_ATTRS})=(?:\"([^\"\n]*)\"|'([^'\n]*)'|\{{\s*'([^'\n]*)'\s*\}}|\{{\s*\"([^\"\n]*)\"\s*\}}|\{{\s*`([^`\n]*)`\s*\}})")
# label: '…' in an object or a list of options.
PROP_RE = re.compile(rf"\b(?:{READ_ATTRS.replace('aria-label|aria-description|', '')}|text)\s*:\s*(?:'([^'\n]*)'|\"([^\"\n]*)\")")
# {'Save'} as a child.
CHILD_RE = re.compile(r"(?<![=\w])\{\s*(?:'([^'\n]*)'|\"([^\"\n]*)\")\s*[}+]")
# A one-word label chosen in the page: {ok ? 'Saved' : 'Failed'}, {ok && 'Saved'}.
CHOSEN_RE = re.compile(r"(?:\?|&&|\|\|)\s*'([^'\n]*)'(?:\s*:\s*'([^'\n]*)')?")
# Any quoted or back-quoted text, for the sentence rule.
QUOTED_RE = re.compile(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"|`((?:[^`\\]|\\.)*)`")
# A sentence: starts with a capital or a Hindi letter, has a space, and at
# least two words of letters. Class names, keys and ids do not look like this.
SENTENCE_RE = re.compile(rf"^[A-Zऀ-ॿ][^\n]*\s[^\n]*$")
WORD_RE = re.compile(rf"[{LETTERS}]{{2,}}")
ONE_WORD_RE = re.compile(rf"^[A-Zऀ-ॿ][a-zऀ-ॿ]+[.!?…:]?$")
# Quoted text that is not shown to anyone.
NOT_SHOWN_BEFORE = re.compile(r"(?:===|!==|==|!=|\bcase|\bfrom|\bimport|\bthrow new \w+\(|console\.\w+\(|\bclassName=\{?|\bkey=\{?|\btypeof\s+\w+\s*[!=]==?)\s*$")
# Signs that a match between angle brackets is code, not words on a screen.
CODE_SIGNS = re.compile(r"=>|===|!==|;|\s=\s|&&|\|\||\?\.|\breturn\b|\bconst\b|\)\s*:|^\s*[),.\]]|^\s*\w+\s*\?\s*$|\?\s*['\"]|^as \w+$|^\s*[:?]\s*[\w.!]+\s*\??\s*$")
# Stricter beside a brace, where most matches are code ("} else {").
BRACE_CODE_SIGNS = re.compile(r"[()=;?&|\[\]'\"`$]|:\s*\S")
JS_WORDS = {"else", "return", "const", "let", "if", "try", "catch", "finally", "async", "function", "export", "await", "satisfies", "extends", "implements", "while", "switch"}
KEY_RE = re.compile(r"^\s*'([^']+)':\s*(['\"])(.*)\2,\s*$", re.MULTILINE)
KEY_LINE_RE = re.compile(r"^\s*['\"]", re.MULTILINE)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


PLAIN_TOKEN_RE = re.compile(rf"^(?:[{LETTERS}’']+[.,!?…:]?|\d+)$")
LAYOUT_WORDS = {"flex", "grid", "block", "hidden", "relative", "absolute", "fixed", "sticky", "inline", "truncate", "underline", "italic", "uppercase", "capitalize", "static", "table", "contents", "group", "peer", "container", "border", "rounded", "shadow", "transition", "outline", "ring", "filter", "invisible", "visible", "grow", "shrink", "antialiased"}


def is_sentence(s: str) -> bool:
    s = s.strip()
    if re.match(r"^[MLHVCZ][\d\s.,-]", s):  # an SVG path, not words
        return False
    if SENTENCE_RE.match(s) and len(WORD_RE.findall(s)) >= 2:
        return True
    # A sentence that starts small or with a number ("3 students were added",
    # "could not save the student"): three plain words or more, nothing that
    # looks like a class name or a key.
    tokens = s.replace("${", " ").replace("}", " ").split() if "${" in s else s.split()
    plain = [w for w in tokens if PLAIN_TOKEN_RE.match(w)]
    return len(tokens) >= 3 and len(plain) == len(tokens) and len(WORD_RE.findall(s)) >= 2 and not all(w.lower() in LAYOUT_WORDS for w in tokens)


def hard_coded(text: str) -> list[str]:
    text = "\n".join("" if NOT_WORDS in line else line for line in text.split("\n"))
    text = COMMENT_RE.sub("", text)
    spans: dict[int, str] = {}  # where it starts -> the words, so one string is counted once

    for m in TAG_TEXT_RE.finditer(text):
        words = " ".join(m.group(1).split())
        # "=> Promise<void>": the > of an arrow, then a type, is code.
        if m.start() > 0 and text[m.start() - 1] == "=":
            continue
        if words and not CODE_SIGNS.search(words):
            spans[m.start(1)] = words
    for m in BRACE_TEXT_RE.finditer(text):
        g = 1 if m.group(1) is not None else 2
        words = " ".join(m.group(g).split())
        if not words or BRACE_CODE_SIGNS.search(words) or CODE_SIGNS.search(words):
            continue
        if all(w in JS_WORDS for w in re.findall(r"[A-Za-z]+", words)):
            continue
        spans.setdefault(m.start(g), words)
    for rx in (ATTR_RE, PROP_RE, CHILD_RE):
        for m in rx.finditer(text):
            g = next(i for i in range(1, (m.lastindex or 0) + 1) if m.group(i) is not None)
            value = m.group(g).strip()
            if rx is ATTR_RE and WORD_RE.search(value):
                spans.setdefault(m.start(g), value)
            elif rx is not ATTR_RE and (ONE_WORD_RE.match(value) or is_sentence(value)):
                spans.setdefault(m.start(g), value)
    for m in CHOSEN_RE.finditer(text):
        for g in (1, 2):
            if m.group(g) is not None and ONE_WORD_RE.match(m.group(g).strip()):
                spans.setdefault(m.start(g), m.group(g).strip())
    for m in QUOTED_RE.finditer(text):
        g = next(i for i in (1, 2, 3) if m.group(i) is not None)
        value = m.group(g)
        if not is_sentence(value) or NOT_SHOWN_BEFORE.search(text[max(0, m.start() - 40) : m.start()]):
            continue
        spans.setdefault(m.start(g), value.strip())
    return [spans[k] for k in sorted(spans)]


def count_files(root: Path) -> dict[str, int]:
    counts: dict[str, int] = {}
    for base in ROOTS:
        folder = root / base
        if not folder.is_dir():
            continue
        for path in sorted(folder.rglob("*.tsx")):
            if path.name.endswith(".test.tsx"):
                continue
            n = len(hard_coded(read(path)))
            if n:
                counts[path.relative_to(root).as_posix()] = n
    return counts


def message_keys(path: Path) -> dict[str, str]:
    return {m.group(1): m.group(3) for m in KEY_RE.finditer(read(path))} if path.is_file() else {}


def base_allowlist(root: Path) -> dict[str, int] | None | str:
    """The allowlist this branch started from: a dict, None when there was
    none yet (the first PR), or a sentence when it cannot be read."""
    if _BASE_FILE_FOR_SELF_TEST is not None:
        p = _BASE_FILE_FOR_SELF_TEST
        return json.loads(read(p))["files"] if p.is_file() else None

    def git(*args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(["git", *args], cwd=root, capture_output=True, text=True)

    if git("rev-parse", "--verify", "--quiet", BASE_REF).returncode != 0:
        # A CI checkout has only the PR's own commit: bring the base branch's tip.
        git("fetch", "--quiet", "--depth=1", "origin", "+refs/heads/main:refs/remotes/origin/main")
    if git("rev-parse", "--verify", "--quiet", BASE_REF).returncode != 0:
        return f"cannot read {BASE_REF} to compare the allowlist with (is this a git checkout with the origin remote?)"
    # Where this branch left main, so a list that main has since shortened is
    # not held against a branch cut earlier. In a shallow checkout there is
    # no shared history to find; the tip is the base then (a PR's merge
    # commit already contains it).
    base = git("merge-base", "HEAD", BASE_REF)
    ref = base.stdout.strip() if base.returncode == 0 and base.stdout.strip() else BASE_REF
    got = git("show", f"{ref}:{ALLOWLIST}")
    return json.loads(got.stdout)["files"] if got.returncode == 0 else None


def count_markers(root: Path) -> int:
    n = 0
    for base in ROOTS:
        folder = root / base
        if folder.is_dir():
            for path in folder.rglob("*.tsx"):
                n += read(path).count(NOT_WORDS)
    return n


def find_violations(root: Path) -> list[str]:
    out: list[str] = []
    allow_path = root / ALLOWLIST
    body = json.loads(read(allow_path)) if allow_path.is_file() else {"files": {}}
    allowed: dict[str, int] = body["files"]
    counts = count_files(root)
    for rel, n in sorted(counts.items()):
        if rel not in allowed:
            out.append(f"{rel}: {n} hard-coded string(s); a new screen takes its words from src/lib/i18n/messages")
        elif n > allowed[rel]:
            out.append(f"{rel}: {n} hard-coded strings, above its allowed {allowed[rel]}; new words go in the message files")
        elif n < allowed[rel]:
            out.append(f"{rel}: down to {n} from {allowed[rel]}; run `python3 scripts/check_ui_strings.py --update` to keep the gain")
    for rel in sorted(allowed):
        if rel not in counts:
            out.append(f"{rel}: has no hard-coded strings left (or is gone); run --update to take it off the allowlist")

    base = base_allowlist(root)
    if isinstance(base, str):
        out.append(base)
    elif base is not None:
        # A rename or a split: a listed file is gone from the tree and the sum has not gone up.
        moved = any(not (root / rel).is_file() for rel in base) and sum(allowed.values()) <= sum(base.values())
        for rel, n in sorted(allowed.items()):
            if rel not in base:
                if not moved:
                    out.append(f"{ALLOWLIST}: {rel} was added; the list only shrinks (it was not on it when this branch left {BASE_REF})")
            elif n > base[rel]:
                out.append(f"{ALLOWLIST}: {rel} was raised to {n} from {base[rel]}; the list only shrinks")

    en, hi = message_keys(root / MESSAGES_EN), message_keys(root / MESSAGES_HI)
    if not en:
        out.append(f"{MESSAGES_EN}: no messages found")
    for rel, table in ((MESSAGES_EN, en), (MESSAGES_HI, hi)):
        path = root / rel
        lines = len(KEY_LINE_RE.findall(COMMENT_RE.sub("", read(path)))) if path.is_file() else 0
        if lines != len(table):
            out.append(f"{rel}: {lines} message lines but {len(table)} understood; write each as  'key': 'words',  on one line")
    for key in sorted(set(en) - set(hi)):
        out.append(f"{MESSAGES_HI}: missing the key {key!r} that en.ts has")
    for key in sorted(set(hi) - set(en)):
        out.append(f"{MESSAGES_HI}: has the key {key!r} that en.ts does not")
    for rel, table in ((MESSAGES_EN, en), (MESSAGES_HI, hi)):
        for key, value in sorted(table.items()):
            for word in JARGON:
                if re.search(rf"\b{re.escape(word)}\b", value, re.IGNORECASE):
                    out.append(f"{rel}: {key!r} uses the word {word!r}; say it in plain words (docs/19 rule 3)")
    for key in sorted(set(en) & set(hi)):
        if set(re.findall(r"\{(\w+)\}", en[key])) != set(re.findall(r"\{(\w+)\}", hi[key])):
            out.append(f"{MESSAGES_HI}: {key!r} does not use the same {{values}} as en.ts")
    return out


def write_allowlist(root: Path, files: dict[str, int]) -> None:
    body = {
        "about": "Screens written before the Hindi/English switch (C134): file -> hard-coded strings still in it. "
        "This list only shrinks (scripts/check_ui_strings.py). P1c-4 and P1c-5 move the rest; empty means done.",
        "files": dict(sorted(files.items())),
    }
    (root / ALLOWLIST).write_text(json.dumps(body, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def init(root: Path) -> int:
    if (root / ALLOWLIST).is_file():
        print(f"--init refused: {ALLOWLIST} exists. The list only shrinks; use --update.")
        return 1
    base = base_allowlist(root)
    if base is not None:
        print(f"--init refused: {base}" if isinstance(base, str) else f"--init refused: {BASE_REF} already has an allowlist. Restore it; the list only shrinks.")
        return 1
    counts = count_files(root)
    write_allowlist(root, counts)
    print(f"allowlist written: {len(counts)} files, {sum(counts.values())} strings.")
    return 0


def update(root: Path) -> int:
    allow_path = root / ALLOWLIST
    if not allow_path.is_file():
        print(f"--update refused: there is no {ALLOWLIST}. Restore it from git; the list only shrinks.")
        return 1
    old: dict[str, int] = json.loads(read(allow_path))["files"]
    counts = count_files(root)
    refused = [f"{rel}: {n} (allowed {old.get(rel, 0)})" for rel, n in sorted(counts.items()) if n > old.get(rel, 0)]
    if refused:
        print("--update only lowers numbers. Move these words to the message files first:")
        for r in refused:
            print(f"  {r}")
        return 1
    write_allowlist(root, counts)
    print(f"allowlist written: {len(counts)} files, {sum(counts.values())} strings (was {len(old)} files, {sum(old.values())}).")
    return 0


def main() -> int:
    violations = find_violations(REPO_ROOT)
    if violations:
        print("FAIL: words on a screen that do not come from the message files, or message files out of step:")
        for v in violations:
            print(f"  {v}")
        return 1
    allowed = json.loads(read(REPO_ROOT / ALLOWLIST))["files"]
    print(
        f"PASS: en.ts and hi.ts have the same {len(message_keys(REPO_ROOT / MESSAGES_EN))} keys and no jargon; "
        f"no new hard-coded strings; {len(allowed)} older screens ({sum(allowed.values())} strings) remain on the allowlist, "
        f"which has not grown since this branch left {BASE_REF}; {count_markers(REPO_ROOT)} line(s) marked \"{NOT_WORDS}\"."
    )
    return 0


def self_test() -> int:
    import shutil
    import tempfile

    tmp = Path(tempfile.mkdtemp())
    global _BASE_FILE_FOR_SELF_TEST
    base_file = tmp / "base-allowlist.json"
    _BASE_FILE_FOR_SELF_TEST = base_file  # no base branch yet
    try:
        def write(rel: str, text: str) -> None:
            p = tmp / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text, encoding="utf-8")

        def allow(files: dict[str, int]) -> None:
            write(ALLOWLIST, json.dumps({"files": files}))

        def expect(label: str, needle: str | None) -> bool:
            got = find_violations(tmp)
            ok = (not got) if needle is None else any(needle in v for v in got)
            if not ok:
                print(f"SELF-TEST FAILED: {label}")
                print(got)
            return ok

        screen = "src/app/(school)/app/x/page.tsx"
        old = "src/components/ui/Old.tsx"
        en_ok = "export const en = {\n  // a note\n  'a.title': 'Students',\n  'a.count': '{count} found',\n} as const;\n"
        hi_ok = "export const hi = {\n  'a.title': 'विद्यार्थी',\n  'a.count': '{count} मिले',\n};\n"
        write(MESSAGES_EN, en_ok)
        write(MESSAGES_HI, hi_ok)
        # Clean code that must NOT be flagged: generics, comments, class names,
        # key names, comparisons, ternaries of class names, a URL, accept="image/*".
        clean = (
            "export function P({ n, total }: { n: number; total: number }) {\n"
            "  const rows = useState<Row[] | null>(null);\n"
            "  // a comment with <b>words</b> and 'A sentence here'\n"
            "  if (e.key === 'ArrowDown' || kind !== 'Open ticket') return null;\n"
            "  try { go(); } catch { stop(); } finally { done(); }\n"
            "  const cls = on ? 'bg-white text-slate' : 'bg-slate/5 text-white';\n"
            "  return (\n"
            "    <div className={`flex ${cls}`} key={'Row one'}>\n"
            "      {/* a note about What this shows */}\n"
            "      <input accept=\"image/*\" aria-label={t('a.title')} />\n"
            "      <a href=\"https://example.invalid/a\">{t('a.title')}</a>\n"
            "      {n > total ? <b>{t('a.title')}</b> : null}\n"
            "      {failed ? <Empty id=\"x\" /> : office ? <Empty id=\"y\" /> : <Empty id=\"z\" />}\n"
            "      <h1>{t('a.count', { count: n })}</h1>\n"
            "      <Later load={(id: string): Promise<void> => go(id)} again={() => Promise<Row[]>} />\n"
            "      <time>{format(d, 'D MMM YYYY')}</time> // ui-strings: not words (a date pattern)\n"
            "      <p className={on ? 'block' : 'hidden'} style={{ fontFamily: 'inter' }} />\n"
            "    </div>\n"
            "  );\n"
            "}\n"
        )
        write(screen, clean)
        write(old, "export function Old() {\n  return <p title=\"Old words\">Still in English</p>;\n}\n")
        allow({old: 2})
        if not expect("a clean tree was flagged", None):
            return 1

        # Every shape of hard-coded words in a new screen is caught.
        shapes = {
            "text between tags": "<h1>Students</h1>",
            "an attribute": "<input placeholder=\"Search students\" />",
            "Hindi written into a screen": "<p>विद्यार्थी</p>",
            "text before a {value}": "<p>Showing {n} students</p>",
            "text after a {value}": "<p>{n} found</p>",
            "text between two {values}": "<p>{a} of {b}</p>",
            "a label ending in a colon beside a {value}": "<p>Total: {n}</p>",
            "a sentence in a ternary": "<p>{ok ? 'Saved for today' : t('a.title')}</p>",
            "a quoted child": "<p>{'Save'}</p>",
            "an attribute in braces": "<input placeholder={'Search students'} />",
            "an attribute in single quotes": "<input title='Search students' />",
            "a label in a list of options": "<Select options={[{ value: 'a', label: 'Active' }]} />",
            "a sentence passed to a function": "<button onClick={() => toast('Student was added')}>{t('a.title')}</button>",
            "a sentence in back quotes": "<p>{`Welcome back ${name}`}</p>",
            "words after accept=\"image/*\" and a later comment": "<input accept=\"image/*\" /><p>Hidden words</p>{/* note */}",
            "one word chosen by a condition": "<p>{ok ? 'Saved' : 'Failed'}</p>",
            "one word shown by a condition": "<p>{ok && 'Saved'}</p>",
            "a back-quoted attribute": "<p title={`Class ${c}`} />",
            "words joined to a value": "<p>{'Total ' + n}</p>",
            "a sentence that starts small": "<button onClick={() => toast('could not save the student')}>{t('a.title')}</button>",
            "a sentence that starts with a number": "<button onClick={() => toast('3 students were added')}>{t('a.title')}</button>",
            "a back-quoted sentence that starts with a value": "<p>{`${n} students found`}</p>",
        }
        for label, jsx in shapes.items():
            write(screen, f"export function P() {{\n  return <div>{jsx}</div>;\n}}\n")
            if not expect(f"not caught: {label}", "hard-coded string(s)"):
                return 1
        write(screen, clean)

        # The ratchet.
        write(old, "export function Old() {\n  return <p title=\"Old words\">Still in English<b>and more</b></p>;\n}\n")
        if not expect("an allowlisted file growing was not caught", "above its allowed 2"):
            return 1
        write(old, "export function Old() {\n  return <p>Still in English</p>;\n}\n")
        if not expect("an allowlisted file shrinking without --update was not caught", "down to 1 from 2"):
            return 1
        if update(tmp) != 0 or json.loads(read(tmp / ALLOWLIST)) ["files"] != {old: 1}:
            print("SELF-TEST FAILED: --update did not lower the number")
            return 1
        write(old, "export function Old() {\n  return <p title=\"Old words\">Still in English</p>;\n}\n")
        if update(tmp) == 0:
            print("SELF-TEST FAILED: --update raised a number")
            return 1
        write(old, "export function Old() {\n  return <p>Still in English</p>;\n}\n")
        write(screen, "export function P() {\n  return <h1>Students</h1>;\n}\n")
        if update(tmp) == 0:
            print("SELF-TEST FAILED: --update added a file")
            return 1
        write(screen, clean)
        write(old, "export function Old() {\n  return <p>{t('a.title')}</p>;\n}\n")
        if not expect("a finished file left on the allowlist was not caught", "take it off the allowlist"):
            return 1
        write(old, "export function Old() {\n  return <p>Still in English</p>;\n}\n")
        allow({old: 1})
        if init(tmp) == 0:
            print("SELF-TEST FAILED: --init replaced an existing allowlist")
            return 1
        (tmp / ALLOWLIST).unlink()
        if init(tmp) != 0 or json.loads(read(tmp / ALLOWLIST))["files"] != {old: 1}:
            print("SELF-TEST FAILED: --init did not write the first allowlist")
            return 1
        (tmp / ALLOWLIST).unlink()
        if update(tmp) == 0:
            print("SELF-TEST FAILED: --update wrote a new allowlist after the old one was deleted")
            return 1

        # Against the base branch: no new file, no higher number, no starting again.
        base_file.write_text(json.dumps({"total": 1, "files": {old: 1}}), encoding="utf-8")
        if init(tmp) == 0:
            print("SELF-TEST FAILED: --init started again although the base branch has an allowlist")
            return 1
        write(old, "export function Old() {\n  return <p title=\"Old words\">Still in English</p>;\n}\n")
        allow({old: 2})
        if not expect("a number raised by hand was not caught", "was raised to 2 from 1"):
            return 1
        write(old, "export function Old() {\n  return <p>Still in English</p>;\n}\n")
        write(screen, "export function P() {\n  return <h1>Students</h1>;\n}\n")
        allow({old: 1, screen: 1})
        if not expect("a file added by hand was not caught", "was added; the list only shrinks"):
            return 1
        write(screen, clean)
        # A rename: the old file is gone, the new one carries its number.
        renamed = "src/components/ui/Renamed.tsx"
        write(renamed, read(tmp / old))
        (tmp / old).unlink()
        allow({renamed: 1})
        if not expect("a renamed file carrying its number was flagged", None):
            return 1
        write(renamed, "export function Old() {\n  return <p title=\"More words\">Still in English</p>;\n}\n")
        allow({renamed: 2})
        if not expect("a rename that grew the list was not caught", "was added; the list only shrinks"):
            return 1
        (tmp / renamed).unlink()
        write(old, "export function Old() {\n  return <p>Still in English</p>;\n}\n")
        allow({old: 1})
        if not expect("a tree matching its base was flagged", None):
            return 1

        # The message files.
        write(MESSAGES_HI, "export const hi = {\n  'a.title': 'विद्यार्थी',\n};\n")
        if not expect("a key missing from hi.ts was not caught", "missing the key 'a.count'"):
            return 1
        write(MESSAGES_HI, hi_ok.replace("};", "  'a.extra': 'और',\n};"))
        if not expect("an extra key in hi.ts was not caught", "has the key 'a.extra'"):
            return 1
        write(MESSAGES_HI, "export const hi = {\n  'a.title': 'विद्यार्थी',\n  'a.count': 'मिले',\n};\n")
        if not expect("a lost {value} in hi.ts was not caught", "does not use the same {values}"):
            return 1
        write(MESSAGES_HI, hi_ok)
        write(MESSAGES_EN, en_ok.replace("'Students'", "'Invalid entity'"))
        if not expect("jargon in a message was not caught", "uses the word 'invalid'"):
            return 1
        write(MESSAGES_EN, en_ok.replace("} as const;", "  \"a.odd\": 'Null value', // a note\n} as const;"))
        if not expect("a message line this check cannot read was not caught", "message lines but"):
            return 1

        print("SELF-TEST PASSED")
        return 0
    finally:
        _BASE_FILE_FOR_SELF_TEST = None
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    if "--init" in sys.argv:
        sys.exit(init(REPO_ROOT))
    if "--update" in sys.argv:
        sys.exit(update(REPO_ROOT))
    sys.exit(main())
