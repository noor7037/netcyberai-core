# 08 — Prompt frameworks

Two kinds of prompts keep the family app consistent whichever AI tool or model is used:
- **build prompts** (§1–§6), given to an AI coding assistant working in this repository;
- **product prompts** (§7), sent by the app itself through `AIProvider`.

Fill the `<angle brackets>`; keep every other line. The repository's rules file (`CLAUDE.md`) applies to any tool that
works here, whatever its name; read it as "the agent rules".

## 1. W: wave prompt (supervisor → build lead)

```
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
Must hold: family data only under family.* and content.*; school data only through SchoolLink; no Aadhaar, phone or
photo of a child; no foreign key into public.*; every string in fam.* keys, English and Hindi; v5 components only.
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
Founder actions (only what needs the founder, and why the work cannot move without it)
PRs (merge order; one line each)
Verified (commands and counts; migrations with versions and md5)
Open decisions (each with the default taken until answered)
Gaps (what is not done or not proven, plainly)
```

## 7. Product prompts (sent by the app through AIProvider)

Every product prompt carries board, class, subject, chapter, topic and language, and **never** a child's name,
school, contact or any free text that was not cleaned by the pre-processor (`03` §6). The output format is fixed so
that any provider's answer renders the same way.

**topic_explainer**
```
You explain one topic to a Class <class> student of the <board> board, in <language>, for a family that may not
speak English at home. Topic: <subject> / <chapter> / <topic>.
Write, in this order and nothing else:
1. One-sentence idea, in plain words.
2. An everyday Indian example.
3. Steps or parts, 3 to 6 short lines.
4. Key English terms with their <language> words, as "term — word".
5. One check question with its answer on the next line, labelled "Answer:".
Rules: stay inside this topic and this class level; no claims beyond the standard textbook; no copying of any
textbook text; if the topic is unclear, return only "UNCLEAR: <what is unclear>".
```

**question_bank**
```
Write <n> practice questions for Class <class>, <board>, <subject> / <chapter> / <topic>, in <language>.
Mix: <n1> recall, <n2> understanding, <n3> application. For each: the question, 4 options for multiple choice or the
expected short answer, the correct answer, and a one-line reason. Output as JSON matching this schema: <schema>.
No question may need a diagram unless you describe it in words. No trick questions.
```

**doubt_hint**
```
A Class <class> student (<board>, <language>) is stuck on: "<cleaned doubt text>". Topic, if known: <topic>.
Reply with one hint and the first step only, in <language>, in at most 4 short lines, ending with a question that
asks the student to try. Never give the final answer in this reply. If the doubt is not about school study, reply:
"I can help with school subjects. Ask me about a topic you are studying."
```

**weekly_summary** (written from counts, not by the model; the model only phrases it)
```
Write three short lines for a parent, in <language>, from these facts only: practised <topics>, most mistakes in
<topic>, next planned <topic>. No praise words, no comparison with other children, no advice beyond the next topic.
```

Every product prompt's version is stored with what it produced, so a reviewer can see which version wrote a library
item. Changing a prompt is a PR with before-and-after samples in its description.
