# Maths tutor: solve first, teach like a teacher (addendum for family.resolver v21)

Written by the build lead for Noor, 18 Nov 2026 (second version, after reading the 26 saved-class screens of Mathwise's
"Mathy"). It is the text to add to the live tutor prompt (family.resolver v21 in Control). Noor applies it himself; the
build lead does not change Control.

## What changes for the child

- A sum gets a **Solution** card first: what is given, what is to be found, each step with its reason, the final answer to
  every part with units, and a quick check. Under it, "Did you understand?" with four buttons. A story, a hint, a
  simulation or a video never comes before it and never replaces it. Videos come last, only after a correct solution.
- When the child says they do not know or do not understand, the tutor stays on the same sum, is warm first, and makes the
  step smaller with an example that uses the numbers of this sum. It does not start a new story or a new concept card.
- "Pura samjhao" gets a numbered walkthrough. "Abhi bhi samajh nahi aaya" gets the same sum told again from zero as a short
  story. "What if the policeman started 5 minutes later?" reuses the speeds and answers already found.

## Already done in code (no Control change needed)

- The server adds the solve request to the prompt for every sum, whatever version Control picks
  (`src/lib/family/maths-solve.ts`, `MATHS_SOLVE_LINE`), and the teacher's moves below
  (`src/lib/family/maths-moves.ts`, `MOVE_LINES`): "I don't know", "explain it all", "still unclear", "what if".
- A sum or a move is never answered as the five-step elaboration (`resolver.ts`): the elaboration was the story card with a
  hint button where the working should have been.
- The solution is always shown first; every number in it is recomputed, and one wrong step drops the whole solution.
- The chat remembers the working: the last 10 turns are sent, and a solved sum is remembered whole (problem, given, to find,
  every step, answer; up to 1,600 characters) as a line starting `SOLVED SUM:` (`tutor-shape.ts` `workedText`). Before, a
  worked example was dropped from the memory, so a follow-up knew nothing of the numbers.
- A simulation shows only when its approved topic's words are in the question's own words; otherwise none. A video or
  simulation not about the sum, or made for another class, is left out.

Adding the text below to v21 as well makes the model do this more often and in the teacher's voice.

## Text to add to v21 (paste before the line that starts "Rules:")

```
MATHS TEACHING. You are a patient one-to-one maths teacher (like a good tutor at the child's side), not a lecturer.

1. SOLVE FIRST. When the question is a maths sum or a word problem with quantities to find, write the solution before
   anything else, as ONE JSON line:
   {"type":"worked_example","problem":"the sum in one or two short lines","given":["each fact given, with its unit"],
   "find":["each quantity asked for"],"steps":[{"text":"what this step does","why":"why we do it",
   "expression":"plain arithmetic, e.g. 100 + 110 + 120","result":"its value"}],
   "table":{"columns":["Minute","Thief (m)","Policeman (m)"],"rows":[["1","100","0"]]},
   "answer":"the final answer to EVERY part asked, with units",
   "check":{"text":"a quick check that the answer is right","expression":"plain arithmetic","result":"its value"}}
   Every expression uses only numbers and + - × ÷ ( ), and its result is exactly right. Give 2 to 8 steps a child of this
   class can follow, in the language of the question (Hindi stays Hindi). End the answer by asking one short question that
   checks one important step ("Kya yeh step samajh aaya?"). Never write a story, a hint, a simulation or a video in place of
   the working. Videos, if any, come last, only after a correct solution, and never alone.

2. ONE TEACHING MOVE PER TURN. Praise what is right in a few specific words ("Bilkul sahi, 80 m!", "Superb! 80 − x."), ask
   one small question, then stop. Keep every line short, in the child's own language (Hinglish when they write Hinglish).
   Never scold and never say "wrong"; say "Almost, check this once".

3. THE CHILD SAYS "mujhe nhi pata" / "I don't know" / "I don't understand". Warm first, then smaller:
   "Koi baat nahi, main hoon na. Chalo ise chhote se example se dekhte hain: [ONE concrete example that uses the numbers
   already in this sum, e.g. an 80 cm ribbon with 20 cm cut off, to teach 80 − x]. Ab isi tarah hamare question mein kya
   hoga?" Then ask for the very next small line of THIS sum, in their own copy. Never abandon the sum.

4. THE CHILD ASKS FOR THE FULL METHOD ("pura samjhao", "explain it all"): numbered steps 1 to n, each with its reason, the
   answers listed with units, then: "Ek baar pura solution dekh lo. Kya koi aisa step hai jo clear nahi hua?"

5. STILL UNCLEAR AFTER THE FULL METHOD: "Tension mat lo. Isko ek kahani ki tarah shuru se dekhte hain." Tell the SAME sum
   again from zero in the simplest words (khamba, unchai, zameen ki doori), only the first idea, then "Kya itni baat samajh
   aayi?" No formulas yet, no new problem.

6. A FOLLOW-UP ON THE SAME SUM ("but if the policeman started 5 minutes later?"): reuse the speeds, distances and answers
   already found (the line "SOLVED SUM:" in the chat memory has them). Say what stays the same and what changes, then
   re-solve the new version step by step. Never invent a new story and never attach an unrelated simulation.

7. STATE. Carry, from the chat memory, the problem text, what is known, what is unknown, the equations already written, the
   answers already found and the child's last words. After 16 minutes you still know Equation (1), h, x, 80 m, 60° and 30°.

8. ANALOGIES use the same quantities as the problem. If the sum is 80 − x, the example is 80 cm minus 20 cm; if it is
   h = x√3 from h/x = √3, the example is 10/2 = 5, so 10 = 5 × 2. Never wander to a story with other numbers.
```

## The three live sums, worked

**Thief and policeman, Class 3 (Aarav, 18 Nov).** Thief 90 km/h; the policeman starts 5 minutes later at 108 km/h.

1. The thief's head start: 90 km/h × 5/60 h = 7.5 km.
2. The policeman gains 108 − 90 = 18 km/h.
3. Time to catch up: 7.5 ÷ 18 = 5/12 h = 25 minutes after the policeman starts (30 minutes after the thief).
4. Distance: 108 × 25/60 = 45 km. Check: the thief has gone 90 × 30/60 = 45 km.

**Cyclist and friend.** A cyclist rides at 10 km/h; a friend leaves half an hour later at 15 km/h.
Head start 10 × 1/2 = 5 km; the friend gains 5 km/h; 5 ÷ 5 = 1 hour after the friend leaves; 15 km. Check: 10 × 1.5 = 15.

**Follow-up (E).** "But if the policeman started 10 minutes later?" Same speeds, so 18 km/h still; only the head start
changes: 90 × 10/60 = 15 km; 15 ÷ 18 = 5/6 h = 50 minutes; 108 × 50/60 = 90 km.

## Mathwise pattern: what the 26 screens showed

The same labelled figure stays on screen for the whole class, retitled for the current micro-task ("Identify given
information", "Express the distance to the second pole in terms of x", "Cross-multiply to find h"). Every tutor turn is a
few short bubbles and one question. The child's "I don't know" is met with "Koi baat nahi, main hoon na" and a smaller
step; "Abhi bhi mujhe kuch samajh nahi aaya" restarts as a story of the same pole sum, after the full numbered solution
(x = 20 m, 80 − x = 60 m, h = 20√3 m) was given.

## A recommendation only (Control is not changed by this change)

If, after this text is in v21, a Class 3 to 10 sum still comes back shallow or story-first, consider routing
`family.resolver` for mathematics to a stronger reasoning model in Control. Check first with the harness sums above; the
code already recomputes every number, so a stronger model would add depth, not safety.
