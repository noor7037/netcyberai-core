# Maths sums: solve first (addendum for family.resolver v21)

Written by the build lead for Noor, 18 Nov 2026. It is the text to add to the live tutor prompt (family.resolver v21 in
Control) so a maths sum is solved before anything else. Noor applies it himself; the build lead does not change Control.

## What changes for the child

A sum gets a **Solution** card first. The card lists what is given and what is to be found, works each step with its
reason, gives the final answer (both parts when two are asked) and a quick check. Under it the child sees "Did you
understand?" with four buttons: Yes, Explain differently, Show simpler steps, and Give me a similar one to try. The
elaboration, pictures, a simulation and videos may come after it. They never replace it.

## Already done in code (no Control change needed)

- The server adds this request to the prompt for every sum, whatever version Control picks
  (`src/lib/family/maths-solve.ts`, `MATHS_SOLVE_LINE`).
- The solution is always shown first. If the model writes the elaboration before it, the elaboration waits.
- Every number in the solution is recomputed, and one wrong step drops the whole solution.
- A simulation or a video that is not about the sum, or a video made for another class (for example "Grade 5" or "GCSE"
  for Class 3), is left out.

Adding the text below to v21 as well makes the model write the solution first and get it right more often.

## Text to add to v21 (paste before the line that starts "Rules:")

```
MATHS SUMS: SOLVE FIRST. When the question is a maths sum or a word problem with quantities to find, write the solution
before the elaboration, as ONE JSON line:
{"type":"worked_example","problem":"the sum in one or two short lines","given":["each fact given, with its unit"],
"find":["each quantity asked for"],"steps":[{"text":"what this step does","why":"why we do it",
"expression":"plain arithmetic, e.g. 100 + 110 + 120","result":"its value"}],
"table":{"columns":["Minute","Thief (m)","Policeman (m)"],"rows":[["1","100","0"]]},
"answer":"the final answer to EVERY part asked, with units",
"check":{"text":"a quick check that the answer is right","expression":"plain arithmetic","result":"its value"}}
Every expression uses only numbers and + - × ÷ ( ), and its result is exactly right. Give 2 to 8 steps a child of this
class can follow. Use "table" (optional, at most 12 rows) when a quantity changes step by step, such as a speed that grows
every minute. When two things are asked, the answer gives both. The check shows the answer works (for example, both
distances are equal at the catch). After the solution, write the elaboration. Its numbers agree with the solution, its
real-life story never comes before the working, and it never replaces it.
```

## Worked check (the live sum)

A thief runs at 100 m/min. A policeman starts 1 minute later at 100 m/min and goes 10 m/min faster every minute.

| Minute of chase | Thief so far (m) | Policeman so far (m) |
| --- | --- | --- |
| 1 | 200 | 100 |
| 2 | 300 | 210 |
| 3 | 400 | 330 |
| 4 | 500 | 460 |
| 5 | 600 | 600 |

Answer: the policeman catches the thief 5 minutes after he starts, which is 6 minutes after the thief ran. Each has run
600 m. Check: 100 × 6 = 600 = 100 + 110 + 120 + 130 + 140.
