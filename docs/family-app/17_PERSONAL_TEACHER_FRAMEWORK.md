# The personal teacher: one framework for every student, every class

Written by Claude Code (build lead) for Noor and every writer AI, 12 Nov 2026. It sets how the app speaks to a child in
the chapter reader and the tutor, so it works the same for one student or a million, Class 1 to 12.

## 1. What the child experiences

- The app calls the child by **first name**, the way a teacher in a one-to-one class does: "Arav, आज हम सीखेंगे: …",
  "Hello Arav! In this chapter we will learn about …". The name comes now and then (the topic's first line, about
  every third step), never in every sentence.
- **"Teach me"** teaches: before each step a short teacher's line says why the step is there and what to do ("अब असली
  बात, ध्यान से सुनो।", "अब ख़ुद करके देखो। तैयार हो तो लैब खोलो।"). Then the lesson itself is read. **"Read all"** shows
  the whole topic without the teacher's lines.
- What is read aloud is the lesson only. Screen furniture is never read: step labels, chips, progress, picture pins,
  photo credits, "tap to zoom", the lab's download note, the topic list, the test card, the parent switch.
- **Nothing opens outside the app.** No link to a website anywhere (tutor answers, photos, sources, hubs, chapters,
  labs). A photo's credit and a source are shown as words ("Photo: A. Maker · CC BY-SA 4.0 · Wikimedia Commons",
  "Source: ncert.nic.in").

## 2. How it is built (so it scales)

| Part | Where | Rule |
| --- | --- | --- |
| The name | Family app page → `BookChapter` → the reader's `hello` message (`name`) | First name only, cleaned in the reader (letters, ≤ 24 characters). Never in the URL, never stored by the reader, never sent to an AI provider. |
| Teacher's lines | `reader/reader.js` → `TEACH` | One bilingual phrase bank for every chapter of every class: a line per step type, variants that rotate, gender-neutral home Hindi. Content writers never write greetings, names or screen notes. |
| Not read aloud | `reader/reader.js` → `SKIP_SEL`, class `noread` | Anything that is not lesson content is marked once in the reader, not per chapter. |
| Tutor name | `family.resolver` prompt v12/v13 + `src/lib/family/name-token.ts` (C490) | The model writes the token `{{name}}`; our server puts the first name in after the safety check. The name never reaches the provider. Live on TEST (v13). |
| No outside links | `ImageView`, `SourcesView`, `HubShell`; `reader/scripts/check.mjs` | Credits and sources are words. The checker refuses any chapter with a web address (only the SVG namespace is allowed). |

## 3. Keeping the app simple for every child

1. One big action per screen: "Continue", "Open lab", "Check". Everything else is small and quiet.
2. The child never has to read instructions: the teacher's line says what to do, out loud.
3. Same layout in every subject and class; only the content changes. A child who learns one chapter knows them all.
4. Targets 44 px or larger, labels 13 px or larger at phone width (15 px for Classes 1–2), AA contrast, motion off when
   the phone asks.
5. Classes 1–2: no tests, no locks, picture checks, everything also heard.
6. No sign-in, settings or links inside a lesson. The parent's controls stay behind the parent switch.

## 4. Adding to it later

- A new step type gets one line in `TEACH` (English and home Hindi, gender-neutral, `{n}` where the name fits).
- A new screen note gets `noread`, or a class that `SKIP_SEL` already skips.
- Pace, voice and language stay per child in the Family app's settings; the reader only follows them.
