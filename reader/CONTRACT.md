# NetCyberAI chapter reader: content contract

The reader (`reader/index.html`, `reader.js`, `reader.css`) teaches one chapter topic by topic, on a phone first, in
English or Hindi. It shows the founder's images with labels and notes in both languages, and it runs the official labs
from `labs/defs` inside the lesson. Content is data: one JSON file per chapter at
`reader/content/c<NN>/<subject_id>/<chapter key>.json` (for example
`reader/content/c10/science/u.c10.science.jesc1.ch01.json`). Nothing in the reader knows a subject.

The rules behind this contract are in `docs/family-app/12_CONTENT_FACTORY.md` (band table) and the founder's framework
(feedback §5): Rosenshine topic flow, worked example then fade, concept first and board format second, CBSE 50/20/30
for Classes 9–12, misconception distractors, no shame, audio and offline.

## 1. Text

Every text a child sees is an object `{ "en": "...", "hi": "..." }` (written `T` below). Both languages are complete:
a child must understand the topic from either one alone, with no outside help. Original words only: never copy NCERT
sentences, figures or exercise wording.

**Hindi is everyday spoken Hindi (aam bolchaal) with common English words, never shuddh or literary Hindi** (founder,
9 Nov 2026; feedback part 2 §2–§8). Write the way a Class 10 student and teacher talk:
- Everyday words stay English, in Devanagari: गेट, पेंट (never रंग for paint), टेस्ट, स्टेप, टॉपिक, चैप्टर, मार्क्स,
  लैब, मॉडल आंसर, रिज़ल्ट, पास, डेटा, प्लेट, पाउडर, ग्रे, लाइन, टेबल, सेट-अप, एयरटाइट, फ़्रिज, बॉइलिंग ट्यूब, वॉच
  ग्लास, गॉगल्स, फ़्यूम कपबोर्ड, कॉर्क, फ़ॉइल, यूनिट. Spoken words over bookish ones: ज़रूरी (not आवश्यक), इस्तेमाल
  (not उपयोग), तरीक़ा (not विधि), ख़ुद (not स्वयं), अक्सर (not प्रायः), हिस्सा (not भाग), तरफ़ (not पक्ष), हवा
  (not वायु), वज़न (not भार), सख़्त (not कठोर), असली (not वास्तविक), लेना-देना (not संबंध).
- **Keep the NCERT Hindi science terms** the Hindi-medium board paper uses (अभिकारक, उत्पाद, अभिक्रिया, समीकरण,
  संतुलित, संयोजन, वियोजन, विस्थापन, द्विविस्थापन, उपचयन, अपचयन, उपचायक, अपचायक, अपचयोपचय, अवक्षेप, विलयन, तनु,
  संक्षारण, विकृतगंधिता, ऊष्माक्षेपी, ऊष्माशोषी, क्षारक (base; क्षार is alkali), विद्युत अपघटन, क्रियाकलाप …), with
  the English term in brackets the first time it appears in a topic. The term matches the book; the talk around it is
  spoken Hindi.
- Element and compound names in the English form, in Devanagari: लेड, ज़िंक, सल्फ़र (गंधक once), सिल्वर (चाँदी once),
  आयरन/लोहा — pick one form per concept and keep it in the reader and the labs.
- One register, तुम (करो, not करें), except quoted board wording ("स्पष्ट कीजिए"). Fix a noun's gender once (जंग,
  हाइड्रोजन, ऑक्सीजन are feminine).
- No calques ("follow the oxygen" → देखो ऑक्सीजन कहाँ गई), no clause wedged before a postposition (split it), every
  sentence has a complete verb that fits its subject. Never add words to a Hindi MCQ option that the English lacks.
- No bare English words in Hindi prose (ऊष्मा, not heat); keep digits as in the English (4, not चार); one style for
  units (g, mL, kg) everywhere. The checker greps for the banned words.

Reading level: write below the class label (one idea per sentence, short paragraphs), then give the precise board
wording. Contexts are Indian and varied (kitchen, market, monsoon, rotate festivals, any gender in any role).

**Equations** are plain strings in a small notation the reader formats: `->` arrow, `-[heat]->` or `-[sunlight]->`
arrow with a condition written over it (the reader translates common conditions; for any other give both languages as `-[alkaline KMnO4|क्षारीय KMnO4]->`), states `(s) (l) (g) (aq)`, `^` after a gas given off, `v` after a precipitate,
digits after an element or `)` become subscripts, a leading number is a coefficient (`2H2O`). Example:
`Zn(s) + 2HCl(aq) -> ZnCl2(aq) + H2(g)^`. Wrap an equation inside running text as `{{eq:...}}`.

## 2. Chapter file

```json
{
  "chapter_key": "u.c10.science.jesc1.ch01",
  "class": 10, "subject_id": "science", "book": "jesc1", "number": 1,
  "title": T, "big_idea": T, "outcomes": [T], "minutes": 120,
  "hook": { "image": "C10-SCI-CH01-01_hook-of-the-chapter", "scene": T, "question": T, "answered_in": "t08" },
  "topics": [Topic],
  "test": { "pass": 0.7, "items": [Item] },
  "sources": { "ncert": "jesc101", "images": "labs/assets/c10/science/MANIFEST.csv" }
}
```

- `big_idea` is the competency in child language (an outcome, not a section title). `outcomes` are 3–6 "can do"
  lines in NCERT Learning Outcome style.
- `hook.answered_in` names the topic whose `close` step answers the chapter hook. Every hook asked anywhere must be
  answered somewhere (close every loop).

## 3. Topic

```json
{ "id": "t01", "title": T, "short": T, "minutes": 12, "outcomes": [T], "ncert": ["1.1"],
  "terms": [{ "en": "Reactant", "hi": "अभिकारक", "gloss": T }],
  "steps": [Step],
  "check": { "draw": 5, "pass": 4, "items": [Item] },
  "why_no_lab": T }
```

**The platform is not a textbook (founder, 9 Nov 2026, feedback part 1).** No topic is text-only:
- Every topic has at least one `diagram` step: a full-topic visual a Class 10 child could explain the WHOLE topic from
  with the text covered (process, cause and effect, before → after, the whole apparatus, the whole cycle). Photos
  (`figure`) add the real thing; the `diagram` explains the idea. It must read at 360 px. **Everything is defined and
  everything is visual** (founder, 9 Nov 2026): after seeing the topic's diagrams, anyone understands the complete
  topic — every key term of the topic appears in a diagram with its short meaning, every step of a process is drawn,
  every cause has its effect. Use more than one `diagram` when one cannot carry the whole topic, and animate what moves
  (rays, current, particles, blood, energy). The checker requires every `terms[].en` to appear in the topic's diagrams.
- Every topic has a `lab` step when it has an NCERT activity, a natural experiment or a simulation; otherwise it has
  `why_no_lab`: one line saying why no lab helps here.

- 6–9 topics per chapter, each one idea a Class 10 child can finish in one sitting (10–15 minutes).
- `check.items`: **8** auto-marked items (types `mcq`, `ar`, `case`); the reader draws 5 and 4 of 5 opens the next
  topic; a retry draws a fresh set and never shames.

### Topic flow (Rosenshine + CLT + 5E; the checker enforces the starred steps)

1. `retrieve`* — one quick question on something learnt earlier (a previous topic or Class 9).
2. `hook` — a short real scene, often with an image, and a question the topic answers.
3. `explain`* — one new idea in small steps: `plain` first, then the `board` wording.
4. `figure` — an image (or a sequence) with a caption, numbered labels and "what to notice".
5. `equation`, `table`, `activity` — as the idea needs. Every NCERT activity of the chapter appears as an `activity`
   step (original words, safety note) or as a lab.
6. `worked`* — a full worked example, then a faded "your turn" with one step missing.
7. `lab` — an official lab from `labs/defs`, placed **after** the idea it shows has been taught.
8. `guided`* — a practice question with a hint before the answer.
9. `misconception`* — the common wrong idea, the right idea, and why.
10. `keypoints`* — 3–6 short lines.
11. `examtip` — clearly labelled "How the board asks this"; only after the concept; reduces uncertainty, never adds fear.
12. `close` — answers this topic's hook (and, in `hook.answered_in`, the chapter hook).

### Steps

| type | fields |
| --- | --- |
| `retrieve` | `item` (Item, auto-marked), `from`: T (where it was learnt) |
| `hook` | `image`?, `scene`: T, `question`: T |
| `explain` | `title`: T, `plain`: T, `body`: [T], `board`: T?, `points`: [T]? |
| `diagram` | `title`: T, `svg`: an inline SVG string (see below), `texts`: { key: T }, `caption`: T, `alt`: T, `notice`: [T] |
| `figure` | `images`: [name] (one, or a sequence shown as frames), `caption`: T, `alt`: T, `notice`: [T], `labels`: [{ `img`: index?, `x`: 0–100, `y`: 0–100, `text`: T }]? |
| `equation` | `eq`: string, `say`: T (how to read it), `note`: T? |
| `table` | `caption`: T, `head`: [T], `rows`: [[T]] |
| `activity` | `ncert`: "Activity 1.6", `title`: T, `materials`: [T], `steps`: [T], `observe`: T, `explain`: T, `safety`: T?, `image`: name? |
| `worked` | `problem`: T, `steps`: [T], `answer`: T, `faded`: { `problem`: T, `shown`: [T], `item`: Item } |
| `lab` | `lab`: lab id in `labs/defs/c10/science/<key>.json`, `before`: T (what to predict and watch), `after`: T (what it showed) |
| `guided` | `item`: Item, `hint`: T |
| `misconception` | `wrong`: T, `right`: T, `why`: T |
| `keypoints` | `points`: [T] |
| `examtip` | `tip`: T, `marks`: T? |
| `close` | `answers`: "hook" or "chapter", `text`: T |

**Diagrams.** `svg` is one `<svg viewBox="…">` element (about 360 × 240 to 360 × 420 units so it reads on a phone),
drawn with shapes, paths and arrows in the locked Family colours (ink #1C1B1A, saffron #E8702A, teal #0F766E, plum
#6D28D9, blush #B42318, sky #0369A1, the tints #E4F3EA #FBF1D3 #EFE9FB #FBE6E3 #E3EEF9, paper #FFFDF9, line #E7E1D6).
Every word or label is an empty `<text data-t="key" …/>`; the reader fills it from `texts[key]` in the current
language, so labels and equations switch with the toggle. A `<text>` may hold only digits, symbols or a formula
(H₂O, +, →, 2, A, B) directly. Motion uses CSS `@keyframes` inside a `<style>` in the SVG (the reader turns it off
under reduced motion); no `<script>`, no `on…=` attributes, no `<foreignObject>`, no `<image>`, no external links.
Keep each diagram under about 12 KB.

Image names are the file names in `labs/assets/<class>/<subject>/` without the extension (the reader loads
`<name>.640.webp` on phones and `<name>.webp` on wide screens). Images carry no words; all words live in the JSON
(caption, labels, notice), so they switch language. Label pins are numbered on the image with a bilingual legend
below it; give `x`/`y` as a percent of the image width and height, measured by looking at the image.

## 4. Items (questions)

Common fields: `id` (unique in the chapter, for example `t03-q5` or `test-q12`), `type`, `bloom`
(`remember|understand|apply|analyse|evaluate|create`).

| type | fields | marking |
| --- | --- | --- |
| `mcq` | `q`: T, `options`: [T ×4], `answer`: index, `why`: [T ×4] | auto |
| `ar` | `assertion`: T, `reason`: T, `answer`: 0–3, `why`: [T ×4] (the reader shows the four standard CBSE options) | auto |
| `case` | `stem`: T, `image`: name?, `parts`: [{ `q`, `options`, `answer`, `why` }] (2–3 parts) | auto, one mark per part |
| `short` | `q`: T, `marks`: 2 or 3, `model`: T, `rubric`: [T] (one point per mark) | self-marked against the rubric |
| `long` | `q`: T, `marks`: 5, `model`: T, `rubric`: [T ×5] | self-marked |

- `why` explains **every** option: why the right one is right and what idea makes each wrong one tempting.
  Distractors are real misconceptions. Feedback names the process, never the child.
- Spread the correct option: across a chapter no single index may hold more than 35% of `mcq`/`case` answers.
- AR options (fixed, shown by the reader): 0 both true and R explains A; 1 both true but R does not explain A;
  2 A true, R false; 3 A false, R true.

**Chapter test** (`test.items`, Classes 9–10): **20 items** in the CBSE Acad-30/2024 theory mix, counted by marks
as closely as items allow: about 50% competency (`case`, `ar`, source- or data-based `mcq`), 20% plain `mcq`, 30%
constructed (`short`, `long`). Mark a source- or data-based `mcq` with `"comp": true`. The checker counts marks:
competency 45–55%, plain `mcq` 15–25%, constructed 25–35%. At least 3 `case`, 3 `ar`, 4 `short`, 1 `long`.
Interleave topics. Pass mark 70%.

## 5. Labs

A `lab` step points at a lab id in the chapter's `labs/defs` file. The reader embeds it from `labs/index.html?embed=1`
in the current language and marks the step done when the lab posts `done`. A chapter may add or improve labs in its
`labs/defs` file; every change must pass `node labs/scripts/check.mjs labs/defs/c10/science` and keep the labs
contract (`labs/CONTRACT.md`). After editing defs, run `node labs/scripts/index.mjs`.

Labs show the founder's real photos above the simulation: a lab may carry `"photos": [{ "img": "<image name>",
"caption": T }]`; every name must be a key in `labs/assets/manifest.json` (which maps it to its file under
`labs/assets/`). The images live once, in `labs/assets/<class>/<subject>/`, and the reader uses the same files.

## 6. Checking

`node reader/scripts/check.mjs [file|dir]` checks a chapter file against this contract: bilingual text with Devanagari
in Hindi, starred steps in every topic, 8-item topic pools, the 20-item test mix, answer spread, every `why` present,
images that exist, labs that exist, hooks answered, unique ids. A chapter is done only when the checker reports 0
problems and the chapter opens in the reader at 390 px and 1280 px in both languages.
