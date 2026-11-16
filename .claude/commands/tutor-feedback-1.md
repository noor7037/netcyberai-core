# PR 436 feedback round 1 (Noor, 16 Nov 2026)

Follow CLAUDE.md. Stay on branch `claude/tutor-overhaul-nov16` (PR 436). Never push to main. Do not merge. Do not switch Control.

## A. New rule: full elaboration pattern for every question or keyword
When a student asks anything, or types just a keyword, the tutor explains it completely, from every angle, in this order:
1. **What you asked:** answer the exact question first, in one clear line.
2. **All scenarios:** cover each case, type or variation of the idea, including common mistakes and edge cases.
3. **Real life:** where the student meets it in daily life and what they see in the world around them (home, school, market, nature, India-relevant).
4. **Future use:** how it will be used later: next classes, exams, careers and everyday adult life.
5. **See, read, understand, listen:** every part has a matching visual (correct showcase diagram, chart, lab or picture), readable text, and a voice line synced step by step. End with one check-in question.

Scale the depth to the class: short and picture-led for LKG to Class 2, fuller for older classes. Never skip a step; keep each step tight.
Implement this as the default in prompt v19 (or v20 if v19 is already final), in the plan shape and the block order. Add it to `.claude/commands/tutor-overhaul.md` as a standing rule, and add tests that check a reply contains all 5 parts in order.

## B. Bugs seen in docs/screenshots/tutor-overhaul/*.png (fix all)
1. Wrong showcase: "What are equal fractions?" shows the chemistry diagram "From reactants to product" plus a chemistry caption. Showcase must match the question's subject, class and chapter, with a real relevance threshold. Show nothing rather than an unrelated diagram. Add no-cross-subject tests.
2. An empty yellow panel sits under the diagram: render the full diagram or drop the empty parts.
3. Overlap: the Draw button, Ask bar and dock cover the answer card at 390px and 1440px. Reserve real bottom space so every card and caption is fully visible.
4. Duplicate badges "AI-made" and "Made by AI": keep one.
5. Desktop 1440px: the tutor sits in a narrow phone-width column. Use the width: whiteboard stage plus the conversation side by side.
6. The "You asked" bubble is cut off at the top of the stage.
7. The chapter list shows test chapters ("Interactive pictures (harness)") and mixes classes (Class 9 Number Systems or Polynomials with an equal-fractions chapter). Families see only their child's class chapters, never harness data.
8. Staff words "Published" and "Received" show to families: hide them or use family-friendly wording.
9. Chapter icons are inconsistent (numbers, a book icon, a dot): use one style.
10. A big empty gap sits between the Ask bar and the dock at the end of the page; make the Data-saver switch state clearly visible.
11. The "Study" label is cramped under its icon in the phone dock.

## C. Proof
- Run the harness on a real maths fractions chapter with the elaboration pattern active (v19 selected only inside the harness, not in Control).
- Add screenshots: one English and one Hindi answer, at 390px and 1440px, showing all 5 parts.
- Look at every screenshot yourself before committing. Run tsc, tests and build.
- Commit, then push this branch only. Report in 10 plain lines with picture paths.
