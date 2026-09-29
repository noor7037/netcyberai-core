#!/usr/bin/env python3
"""scripts/ci_local.sh must stay an exact mirror of .github/workflows/checks.yml.

docs/14_BACKEND_BUILD_PLAN.md B10: sessions run `scripts/ci_local.sh`
instead of re-deriving the CI command list. A local mirror that has
silently drifted from CI is worse than none -- it reports green on checks
CI no longer runs, or misses the ones it added. So this compares, in order,
every step of the workflow's `verify` job against ci_local.sh's
`uses_step` / `run_step` calls:

- same step count and order;
- `uses:` steps: same action and the same `with:` values;
- `run:` steps: same `name:`, same `env:`, and the same `run:` body line for
  line (trailing whitespace and trailing blank lines aside).

No YAML library (none is guaranteed on a fresh machine). The workflow is a
flat step list, parsed by indentation; anything the parser does not
recognise is a failure, never a guess.
"""

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "checks.yml"
MIRROR = REPO_ROOT / "scripts" / "ci_local.sh"

STEP_KEYS = {"uses", "with", "name", "env", "run"}
RUN_STEP_RE = re.compile(r"""^run_step "((?:[^"\\]|\\.)*)"((?: [A-Za-z_][A-Za-z0-9_]*=\S+)*) <<'STEP'$""")
USES_STEP_RE = re.compile(r"^uses_step (\S+)((?: [A-Za-z_-][A-Za-z0-9_-]*=\S+)*)$")


class ParseError(Exception):
    pass


def _indent(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def _scalar(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value


def _normalise_body(lines: list[str]) -> list[str]:
    out = [line.rstrip() for line in lines]
    while out and out[-1] == "":
        out.pop()
    return out


def parse_workflow(text: str) -> list[dict]:
    lines = text.splitlines()
    try:
        start = next(i for i, l in enumerate(lines) if l.strip() == "steps:")
    except StopIteration:
        raise ParseError("no `steps:` key found")
    steps_indent = _indent(lines[start])
    steps: list[dict] = []
    i = start + 1
    item_indent = None
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        ind = _indent(line)
        if ind <= steps_indent:
            break  # left the steps list
        stripped = line.strip()
        if stripped.startswith("- "):
            if item_indent is None:
                item_indent = ind
            if ind != item_indent:
                raise ParseError(f"line {i + 1}: unexpected list item indentation")
            steps.append({})
            # The first key sits on the "- " line itself, two columns in.
            line = " " * (ind + 2) + stripped[2:]
            ind += 2
        elif item_indent is None or ind != item_indent + 2:
            raise ParseError(f"line {i + 1}: expected a step key, got {stripped!r}")
        key, sep, value = line.strip().partition(":")
        if not sep or key not in STEP_KEYS:
            raise ParseError(f"line {i + 1}: unrecognised step key {key!r}")
        step = steps[-1]
        value = value.strip()
        i += 1
        if key in ("with", "env"):
            if value:
                raise ParseError(f"line {i}: inline `{key}:` maps are not supported")
            mapping = {}
            while i < len(lines) and (not lines[i].strip() or _indent(lines[i]) > ind):
                if lines[i].strip():
                    k, s, v = lines[i].strip().partition(":")
                    if not s:
                        raise ParseError(f"line {i + 1}: expected `key: value` under `{key}:`")
                    mapping[k.strip()] = _scalar(v)
                i += 1
            step[key] = mapping
        elif key == "run" and value == "|":
            body: list[str] = []
            while i < len(lines) and (not lines[i].strip() or _indent(lines[i]) > ind):
                body.append(lines[i])
                i += 1
            content = [l for l in body if l.strip()]
            dedent = min(_indent(l) for l in content) if content else 0
            step["run"] = _normalise_body([l[dedent:] for l in body])
        elif value.startswith(("|", ">")):
            raise ParseError(f"line {i}: block style {value!r} is not supported")
        else:
            step[key] = [_scalar(value)] if key == "run" else _scalar(value)
    if not steps:
        raise ParseError("the steps list is empty")
    return steps


def _kv(pairs: str) -> dict:
    out = {}
    for token in pairs.split():
        k, _, v = token.partition("=")
        out[k] = v
    return out


def parse_mirror(text: str) -> list[dict]:
    lines = text.splitlines()
    steps: list[dict] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        m = USES_STEP_RE.match(line)
        if m:
            step = {"uses": m.group(1)}
            if m.group(2):
                step["with"] = _kv(m.group(2))
            steps.append(step)
            i += 1
            continue
        m = RUN_STEP_RE.match(line)
        if m:
            step = {"name": m.group(1).replace('\\"', '"')}
            if m.group(2):
                step["env"] = _kv(m.group(2))
            body = []
            i += 1
            while i < len(lines) and lines[i] != "STEP":
                body.append(lines[i])
                i += 1
            if i == len(lines):
                raise ParseError(f"run_step {step['name']!r}: heredoc never closed with STEP")
            step["run"] = _normalise_body(body)
            steps.append(step)
        elif line.startswith(("run_step ", "uses_step ")):
            raise ParseError(f"line {i + 1}: malformed call {line!r}")
        i += 1
    return steps


def compare(workflow: list[dict], mirror: list[dict]) -> list[str]:
    problems = []
    for n in range(max(len(workflow), len(mirror))):
        w = workflow[n] if n < len(workflow) else None
        m = mirror[n] if n < len(mirror) else None
        label = f"step {n + 1}"
        if w is None:
            problems.append(f"{label}: ci_local.sh has an extra step {m.get('name') or m.get('uses')!r}")
            continue
        if m is None:
            problems.append(f"{label}: ci_local.sh is missing {w.get('name') or w.get('run') or w.get('uses')!r}")
            continue
        if "uses" in w or "uses" in m:
            if w.get("uses") != m.get("uses") or w.get("with", {}) != m.get("with", {}):
                problems.append(f"{label}: uses/with differ: workflow {w.get('uses')} {w.get('with', {})} "
                                f"vs ci_local {m.get('uses')} {m.get('with', {})}")
            continue
        w_name = w.get("name") or w["run"][0]
        if w_name != m.get("name"):
            problems.append(f"{label}: name differs: workflow {w_name!r} vs ci_local {m.get('name')!r}")
        if w.get("env", {}) != m.get("env", {}):
            problems.append(f"{label} ({w_name}): env differs: workflow {w.get('env', {})} vs ci_local {m.get('env', {})}")
        if w["run"] != m["run"]:
            problems.append(f"{label} ({w_name}): run body differs from the workflow's")
    return problems


def run(workflow_path: Path = WORKFLOW, mirror_path: Path = MIRROR) -> int:
    try:
        workflow = parse_workflow(workflow_path.read_text())
        mirror = parse_mirror(mirror_path.read_text())
    except (ParseError, OSError) as e:
        print(f"FAIL: could not parse: {e}")
        return 1
    problems = compare(workflow, mirror)
    if problems:
        print(f"FAIL: {mirror_path.name} no longer mirrors {workflow_path.name}:")
        for p in problems:
            print(f"  {p}")
        print("Update scripts/ci_local.sh so every step matches the workflow, in the same order.")
        return 1
    print(f"PASS: {mirror_path.name} mirrors all {len(workflow)} steps of {workflow_path.name}, in order.")
    return 0


def self_test() -> int:
    import shutil
    import tempfile

    workflow = (
        "jobs:\n  verify:\n    steps:\n"
        "      - uses: actions/checkout@v4\n\n"
        "      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n\n"
        "      - run: npm ci\n\n"
        "      - name: Build\n        env:\n          X: \"1\"\n        run: npm run build\n\n"
        "      - name: Grep\n        run: |\n          if grep -rn 'a' src/; then\n            exit 1\n          fi\n"
    )
    good = (
        "uses_step actions/checkout@v4\n"
        "uses_step actions/setup-node@v4 node-version=20\n"
        "run_step \"npm ci\" <<'STEP'\nnpm ci\nSTEP\n"
        "run_step \"Build\" X=1 <<'STEP'\nnpm run build\nSTEP\n"
        "run_step \"Grep\" <<'STEP'\nif grep -rn 'a' src/; then\n  exit 1\nfi\nSTEP\n"
    )
    cases = {
        "clean mirror": (good, 0),
        "changed run body": (good.replace("exit 1", "exit 0"), 1),
        "missing step": (good.replace("run_step \"Build\" X=1 <<'STEP'\nnpm run build\nSTEP\n", ""), 1),
        "reordered steps": (good.replace("run_step \"npm ci\" <<'STEP'\nnpm ci\nSTEP\n", "")
                            + "run_step \"npm ci\" <<'STEP'\nnpm ci\nSTEP\n", 1),
        "changed env": (good.replace("X=1", "X=2"), 1),
        "changed with": (good.replace("node-version=20", "node-version=22"), 1),
        "extra step": (good + "run_step \"Extra\" <<'STEP'\ntrue\nSTEP\n", 1),
    }
    tmp = Path(tempfile.mkdtemp())
    try:
        wf = tmp / "checks.yml"
        wf.write_text(workflow)
        for label, (mirror_text, expected) in cases.items():
            mp = tmp / "ci_local.sh"
            mp.write_text(mirror_text)
            got = 0 if run(wf, mp) == 0 else 1
            if got != expected:
                print(f"SELF-TEST FAILED: case {label!r} returned {got}, expected {expected}")
                return 1
        print("SELF-TEST PASSED")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    sys.exit(run())
