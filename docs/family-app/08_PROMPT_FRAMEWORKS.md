# 08 — Prompt frameworks

Two kinds of prompts keep the family app consistent whichever AI tool or model is used:
- **build prompts** (§1–§6), given to an AI coding assistant working in this repository;
- **product prompts** (§7), sent by the app itself through `AIProvider`.

Fill the `<angle brackets>`; keep every other line. The repository's rules file (`CLAUDE.md`) applies to any tool that
works here, whatever its name; read it as "the agent rules".

## 1. W: wave prompt (supervisor → build lead)

```
CONTEXT: From the supervisor (independent CTO and principal architect) to the Claude Code build lead, for the founder,
a non-technical reader. This wave delivers <one line>. Work by CLAUDE.md, challenge this brief with evidence where it
is wrong, and report in plain words, founder actions first.

Read Decision Log <rows>, then docs/family-app/<files and sections>. Rows continue from <C-number>; reserve them
first. Open every PR with base main; one PR per slice; stack them. Never apply a migration to production before the
test database. No Co-Authored-By and no model name in any commit, PR title or PR body. Never subscribe to PR
activity, comment on a PR or schedule a check-in.

MODEL PER TASK: the strongest model for auth, RLS, migrations, money, messaging, secrets, personal data and every
security review; a middle model for UI and copy with tests; a small model for read-only work. The lead reviews every
diff; a slice that fails its tests twice or whose review finds a correctness bug is redone one model up. Models and
redos go in the chat report only.

WAVE <id>: <one line>. The lead owns migrations, the registry, shared components, shells, shared docs and the stack
order. <Agent> owns <files>; none touches another's files.

LEAD, first PR: <shared parts>.
AGENT <X> (<model tier>): <slice>. Files: <paths>. Rules: <the 03/02 rules that apply>. Tests: <list, including the
negative ones>.
LEAD, after: harness pictures of every changed screen at 360, 390 and 1440; docs <files>; reviews per CLAUDE.md;
migrations in PR order with md5 and a policy read-back on both databases.

Then stop. Report in the Transparent Output Template, founder actions first, short.
```

## 2. S: slice brief (lead → one agent)

```
SLICE <id>, <one line>. Read: docs/family-app/<sections>; CLAUDE.md; <one or two code files to copy patterns from>.
You may change only: <exact paths>. Do not touch: <shared files>; ask the lead.
Build: <behaviour, as numbered acceptance lines>.
Data: <tables and policies, or "none: ask the lead for any">.
Must hold: family data only under family.* and content.*; school data only through SchoolLink; AI and video only through
the AI platform's adapters and profiles; model output is data rendered by our components, never code; no Aadhaar,
phone or photo of a child; no foreign key into public.*; every string in fam.* keys, English and Hindi; v5 components
only.
Tests first: <allow tests>, <deny tests: another account, a staff session, an unlinked child, another school>.
Done when: tsc clean, your tests pass, check_family_boundary.py passes, pictures at 360/390/1440 attached.
Report: files changed, tests run with counts, anything you could not do and why.
```

## 3. M: migration brief

```
MIGRATION <name> for slice <id>. Tables: <name: columns with types and checks>. Every table: RLS enabled and forced;
a restrictive policy on account_id = app.current_account_id (family.*) or published-only reads (content.*); grants to
app_user limited to <verbs>; no DELETE where history matters; no foreign key into public.*. Triggers set their own
timestamps. Comment each table with its slice id.
Apply: the test database first; read back policies, grants and the function md5; then production; rename the file to
the test database's version. Report both versions and the md5.
```

## 4. R: review brief

```
REVIEW <PR or branch> at <low | medium>. Look for: a path where one account reads another's rows; a family session
reaching a staff API or the reverse; school data read without SchoolLink or after unlink; child data reaching
AIProvider; unreviewed content reaching a family; a paid plan on a school module; a string not in the message files;
a missing deny test. For each finding: file and line, the concrete failing scenario, the smallest fix. No style notes.
```

## 5. F: fix brief

```
FIX <symptom>, seen at <where>. Reproduce it first with a failing test. Change only what the failing test needs.
Run the slice's tests and the checkers the change touches. Report the cause in one sentence and the test that now
passes.
```

## 6. Report: the Transparent Output Template

```
Context (2–3 lines: who reports, to whom, what this report covers)
Founder actions (only what needs the founder, and why the work cannot move without it)
PRs (merge order; one line each)
Verified (commands and counts; migrations with versions and md5)
Open decisions (each with the default taken until answered)
Gaps (what is not done or not proven, plainly)
```

## 7. Product prompts (sent by the app through the AI platform)

**Revised 2026-10-20 (C230-I)** for the Concept Resolver and the new experiences.

**Rules for every product prompt:**
- Each runs under a profile (`03` §7). Its request carries board, class, subject, topic and language, and never a
  child's name, school, contact, or any text the pre-processor has not cleaned.
- Outputs are **JSON against a schema in the repository**; free text outside the schema is discarded.
- Prompt text lives in `src/lib/ai/prompts/<profile>/<version>.md`. Changing it is a PR with before-and-after samples;
  Control only chooses the active version and its rollout.

**family.resolve.plan**
```
A Class <class> student (<board>, explanations in <language>) asks about: "<cleaned input>".
Matched syllabus topic: <subject> / <chapter> / <topic> (confidence <c>). Known misconceptions on it: <ids or none>.
Choose the blocks that best teach this, from: explanation, worked_example, diagram, graph, construction, timeline,
map, simulation, video, check, practice, english_moment, sources. Always include explanation, check and practice.
Return JSON {"topic_confirmed": bool, "question_type": "...", "blocks": [{"type": "...", "purpose": "..."}]}.
If the input is not about school study, return {"refuse": "not_school_study"}. If the topic is unclear, return
{"clarify": "<one short question>"}.
```

**family.resolve.generate** (one call per block; this is the explanation block; the others follow the same frame with
their own schema)
```
Write the "<type>" block for Class <class>, <board>, <subject> / <chapter> / <topic>, in <language>.
Purpose: <purpose from the plan>. Follow this JSON schema exactly: <schema>.
Explanation rules: start with the idea in one plain sentence; then an everyday Indian example or analogy; then
3 to 6 steps; put each key English term beside its <language> word as "term — word"; stay at this class level;
claim nothing beyond the standard curriculum; copy no textbook text; give no URLs (sources come from the allowlist).
```

**family.resolve.verify**
```
Independently solve each question below (Class <class>, <subject> / <topic>) and return JSON
[{"id": "...", "your_answer": "...", "agrees_with_key": bool, "problem": "<if any>"}]. Do not look for agreement:
solve first, then compare with the given key. Questions: <questions with keys>.
```
Numeric steps are additionally recomputed by the math library; any disagreement drops the block.

**family.check_and_practice** (the misconception loop)
```
Write <n> questions for Class <class>, <board>, <subject> / <chapter> / <topic>, in <language>: <n1> recall,
<n2> understanding, <n3> application. For multiple choice, each wrong option must reflect one named misconception
from this list: <misconception ids and descriptions>; tag it. For each question: the correct answer, a one-line
reason, and for each wrong option a two-line explanation of that exact misunderstanding. JSON per <schema>.
```

**family.syllabus_extract**
```
These are photos of a syllabus or contents page. Extract the structure only: units, chapters, topics, in order,
exactly as printed. Return JSON {"board_guess": "...", "class_guess": "...", "subject_guess": "...",
"items": [{"level": "unit|chapter|topic", "title": "...", "page": n|null, "confidence": 0-1}]}.
Do not guess unreadable text: give it confidence below 0.5 and your best reading in "title". Never include body
text from the book.
```

**family.video_rank**
```
Topic: Class <class>, <board>, <subject> / <chapter> / <topic>, language <language>. Rank these candidate videos for
a student of this class, using only the data given (title, description, chapter timestamps, duration, channel,
language, captions present, made for kids). Prefer: on-topic, at this level, 3–15 minutes or a chapter that starts
the topic, the student's language, a clear teaching channel. Return JSON [{"video_id": "...", "score": 0-1,
"start_seconds": n|null, "reason": "..."}]; exclude any that seem off-topic, sensational or advertising.
```

**family.opportunity_extract**
```
From this official notice text (source: <url>), fill the opportunity schema <schema>: type, issuer, eligibility
rules, dates, fees, documents, steps, official and application links. For every field, quote the exact sentence it
came from in "evidence". If a field is not stated, set it to null: never infer a requirement, a date or a fee.
```

**family.career_explain**
```
Explain these pathways to a <class/qualification> student in <stream> with interests <interests>, in <language>.
Use ONLY the nodes and edges given (each has a source): <subgraph>. For each route: the steps in order with
eligibility and exams, typical duration, one practical next action this year, and an honest line on uncertainty. Do
not add any step, exam, salary or guarantee that is not in the data.
```

**english.moment**
```
For a Class <class> student learning <topic> (<subject>), support language <language>: write 3 to 5 short lines:
one or two key English words with meanings in <language>, one model sentence using them, one sentence pattern to
reuse, and one "say it" prompt. Simple English. JSON per <schema>.
```

**english.feedback**
```
Assess this answer to the task "<task>" for a learner at <CEFR level>, using the rubric <rubric> (each criterion
0–4). Return JSON {"scores": {...}, "corrections": [{"original": "...", "better": "...", "why": "<support language>"}],
"one_thing_to_practise": "..."}. Be specific and kind; no score without a reason.
```

**weekly_summary** (written from counts; the model only phrases it)
```
Write three short lines for a parent, in <language>, from these facts only: topics checked <list>, most mistakes in
<topic>, next planned <topic>, English days completed <n>. No praise words, no comparison with other children, no
advice beyond the next step.
```

Each product prompt's version is stored with what it produced, so a reviewer can see which version wrote a response.
