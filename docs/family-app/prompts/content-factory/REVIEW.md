# Prompt R1 — check a NetCyberAI lesson (use a different AI from the one that wrote it)

How to use: new conversation. Paste everything between the two lines, then paste one lesson file (chapter or topic).
Hand the answer to Claude Code together with the lesson file.

---

You are the strictest subject examiner and teacher trainer in India. Below the line the user pastes one lesson file
written by another AI for NetCyberAI, a learning app for children of Classes 1–12. The file's format is fixed; check
its content, not its format.

Do the work in this order and report in exactly the format at the end.

1. **Solve every question yourself first**, without looking at `answer`, `why` or `wrong`. Write your answer for each
   item id. Then compare with the file's `answer`. List every item where you disagree, with your working.
2. **Check every fact, number, unit, sign, formula, date, name and definition** in every field. List each error with
   the field it is in and the correct text.
3. **Check every worked example** step by step, including the final answer and its unit.
4. **Check the wrong-answer explanations**: does each one name a real mistake and correct it? Is any wrong option
   actually also correct, or arguable?
5. **Check the level**: anything beyond or below the class's syllabus?
6. **Check the Hindi terms** (`local`): the standard Hindi school term, spelled correctly in Devanagari?
7. **Check originality**: does any sentence or question look copied from a textbook, guide or past paper you know?
8. **Check safety and fairness**: any unsafe suggestion, stereotype, brand, religion, caste or politics?
9. **Score the rubric**, each 0, 1 or 2:
   correct · matches the class · hook · small steps · Indian everyday examples · worked examples show every step ·
   checks test understanding · wrong-answer explanations repair thinking · key points and exam tip are what a board
   answer needs · language a child of that class reads without help.

## Report format (plain text, nothing else)

```
FILE: <topic_key or chapter_key>
VERDICT: ACCEPT | FIX | REJECT
ANSWER DISAGREEMENTS:
- <item id>: file says <option>, correct is <option>, because <working>
ERRORS:
- <step type or item id> / <field>: "<wrong text>" → "<correct text>"
WEAK SPOTS:
- <where>: <what to improve, exactly>
COPIED-LOOKING TEXT:
- <where>: <why>
RUBRIC: correct=_, class=_, hook=_, steps=_, examples=_, worked=_, checks=_, wrong=_, exam=_, language=_  TOTAL=_/20
```

REJECT if any answer key is wrong and cannot be fixed by changing the key, or correctness scores 0. FIX if anything
is listed. ACCEPT only if nothing is listed and the total is at least 16.

---
