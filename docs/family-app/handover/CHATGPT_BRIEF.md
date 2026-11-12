# Brief for ChatGPT: build Classes 1, 2 and 3 — every subject, every chapter

From Claude Code (build lead), 12 Nov 2026, for the ChatGPT agent that has read access to this repository and opens
pull requests. This is the single instruction file. Read it in full, then the files in §2, then work through §4 without
stopping until the scope is complete. Your first slice (PR #421) was reviewed: what to keep and change is in §3.

## 0. Every decision is already made: build, do not ask

Noor does not relay questions. Everything you might ask is answered here; when something is still unclear, choose the
safer option, write it under "Unsure" in the PR description, and keep building.

| You might ask | The answer |
| --- | --- |
| I have no checkout / no `labs/.work/txt/` | Unpack `netcyberai-workspace.tar.gz` (Noor attaches it). It is the repository at the commit named in its `WORKSPACE.txt`, without `.git`, `node_modules`, `.next` or `.env*`, plus the NCERT text of every Class 1–3 book in `labs/.work/txt/<book code><chapter>.txt` (for example `aejm101.txt`). Read those texts; never copy them into a repository file. |
| I cannot run the checkers | `node reader/scripts/check.mjs …` and `node labs/scripts/check.mjs …` need only Node 18+ (no install). Run them. |
| I cannot run the smoke test | It needs Playwright. If you cannot install it, skip it and write "smoke not run" in the PR; Claude Code runs it. |
| I cannot run anything | Build anyway. Check every chapter by hand against §4–§8 and `LESSONS.md`, and write "checkers not run" in the PR. Never stop. |
| I cannot open a pull request | Deliver one `.zip` per subject holding the changed files at their repository paths (`reader/content/c01/…`, `labs/defs/c01/…`, `labs/assets/c01/…`). Noor drops it in Downloads; Claude Code applies it. |
| Where are the image plans for Classes 1–3? | There are none and none are needed. Draw animated SVG scenes (§5.1); add an open-licence photo (§5.2) only where the real thing matters. Never name a founder image (`C01-…`) that does not exist. |
| Which chapters? | Only the rows of `data/content/universal/syllabus/chapters.csv` for the book codes in §1, in order. Class 3 EVS is `ceev1` "Our Wondrous World". |
| Language of a language book | English book (Mridang, Santoor): the English words being taught stay English in both modes; the Hindi mode explains around them in home Hindi. Hindi book (Sarangi, Veena): the Hindi being taught stays Hindi in both modes; the English mode explains in simple English. Maths and EVS: fully bilingual. |
| Greeting the child, names | Do not write greetings, the child's name or "Hello child" into content. The reader adds the teacher's lines and the child's first name by itself (founder, 12 Nov 2026). Write every step to "तुम" / "you". |
| Screen notes ("tap to zoom", "open the lab", "loading") | Never write them into content. The reader shows its own and never reads them aloud. |
| Links | **No web address anywhere** in a chapter or a lab: not in text, captions, pictures or credits. A credit is words only: `"credit": "Author Name, Wikimedia Commons, CC BY 4.0"`. The source URL goes only into `CREDITS.csv`. The checker refuses a chapter with a web address. |
| A lab template does not fit | Build a new general template (skill §6) and add it to `labs/catalogue.json`. Do not skip the lab. |
| Class 3 contract | Write it as §4 says, in its own small PR (or zip) first, then continue with Class 3 chapters on top of it without waiting. |

## 1. The goal and the order

Build every chapter of every subject of **Class 1, then Class 2, then Class 3** (NCERT, current editions) as
interactive, bilingual chapters for the NetCyberAI Family app — a child learns alone on a parent's phone, in English or
in everyday Hindi, with pictures, voice, play and labs. Not a textbook.

| Order | Scope | Books (from `data/content/universal/syllabus/books.csv`, scope `core`) |
| --- | --- | --- |
| 1 | Class 1: English, Hindi, Mathematics | `aemr1` Mridang, `ahsr1` Sarangi, `aejm1` Joyful Mathematics |
| 2 | Class 2: English, Hindi, Mathematics | `bemr1` Mridang, `bhsr1` Sarangi, `bejm1` Joyful Mathematics |
| 3 | Class 3: English, Hindi, Mathematics, EVS | `cesa1` Santoor, `chve1` Veena, `cemm1` Maths Mela, `ceev1` Our Wondrous World |

The chapter list for a scope comes **only** from `data/content/universal/syllabus/chapters.csv` (run
`node skills/netcyber-content/scripts/queue.mjs init --class 1` to print it). Never invent, merge or skip a chapter;
"unnumbered" activity items in the syllabus are included as short chapters.

**Delivery:** one pull request per subject per class (for example `content/class-1-mathematics`), every chapter of that
subject in it, all checks passing, the checker output pasted in the PR description. Never merge, never push to `main`,
never change files outside the ones listed in §6 unless the brief says so. Keep going to the next subject after
opening each PR; Claude Code reviews them in batches.

## 2. Read first (in this order)

1. `skills/netcyber-content/SKILL.md` — the method (phases, gates, non-negotiables), and its references when a phase
   needs them: `references/pedagogy.md` (band table), `hindi.md`, `diagrams.md`, `labs.md`, `questions.md`,
   `images.md`, `subject-playbooks.md` (Foundational and Preparatory sections), `research.md`, `review-rubric.md`,
   `lab-library.md`.
2. `reader/CONTRACT.md` — the file format, including the **Foundational reader: Classes 1–2** section you added.
3. `docs/family-app/handover/LESSONS.md` — 45 mistakes earlier writers made. Repeating one is a failure.
4. `docs/family-app/handover/feedback/chatgpt-class1-1.md` — the review of your first slice.
5. The NCERT text of each chapter: the PDFs linked in `books.csv` / `chapters.csv` (`source_url`). Read them; never copy.

## 3. What to keep from your first slice, and what changes

**Keep (good work):** the foundational band contract (no chapter test, no locked topics, 2–3 options, 4 checks with 3
drawn, 4–8 minute topics); the warm, inclusive voice ("हर परिवार अलग हो सकता है"); hooks that are answered; reusing
the chapter's lab ids; bilingual SVG diagrams with `data-t` labels; the "draft PR, no merge" discipline.

**Changed by Claude Code in your PR (keep these):** the foundational path covers Classes 1 and 2; it now also runs the
shared rules (spoken-Hindi word list, no LaTeX, readable labels, images exist, photo credits); `book.json` with
`"list": "built"` replaces the hard-coded Class 1 filter; a duplicated line in `reader.js` removed; "गतिविधि" →
"एक्टिविटी".

**Change from now on:**

1. **Checks must be picture checks, not definitions.** "किस शब्द का मतलब है: 'वे लोग जो…'?" is too abstract for a
   6-year-old. Ask about something the child can see: "बिल्ली कहाँ है?" with options "🐱 कुर्सी के नीचे", "🐱 कुर्सी
   के ऊपर", "🐱 डिब्बे के अंदर", or "कौन-सी तस्वीर में 3 आम हैं?" with "🥭🥭🥭", "🥭🥭", "🥭🥭🥭🥭". Emoji and tiny pictures in
   options are welcome; the diagram above the check shows the scene.
2. **Sentences as short as the child reads** (NIPUN): Class 1 — captions of 4–5 words and short sentences the child
   also hears; Class 2 — short sentences; one idea each. Your explanations are 3–4 sentences; split them into steps.
3. **No English words inside the Hindi lesson** unless the topic is learning English. "On का मतलब ऊपर" belongs in the
   English book, not in Hindi Maths; in Hindi Maths say "ऊपर, नीचे, अंदर, बाहर".
4. **Richer visuals** (§5): every topic needs a scene the child loves to look at, not a few labels on shapes.
5. **Labs that are real play**: sort, match, count, build, pour, tap-to-hear. Reuse a template when it fits; build a new
   general template when none does (skill §6) — for example "drag the objects into the right place" for spatial words,
   "tap to count and hear the number", "make a pattern".
6. **Every chapter of the book**, not chapter 1 only.

## 4. The band rules you build to

| | Class 1 | Class 2 | Class 3 (Preparatory) |
| --- | --- | --- | --- |
| Topic | 4–8 min, one tiny idea | 6–10 min | 8–15 min |
| Language | picture + 4–5 word captions; everything also read aloud | short sentences, also heard | 8–12-word sentences |
| Checks | 4 picture checks, 3 drawn, 2–3 options, no pass mark, no lock | same, gentle | 5 drawn from 8, 3 of 5 to move on, unlimited calm retry |
| Chapter test | none | none (a small picture check is fine) | ≤ 10 items, never called an "exam" |
| Labs | guided play (sort, pour, build, match, count) | same | predict–observe–explain |
| Exam tips | none | none | none |

**Class 3 needs a Preparatory contract that does not exist yet** (the reader and checker know Classes 1–2 and 9–12).
Before writing Class 3 chapters, open one small PR that adds it the same way you added the foundational path
(`reader/CONTRACT.md` section, a `class === 3`… branch in `reader/scripts/check.mjs` reusing the shared sweep, the
reader's check gate at 3 of 5 with calm retry and a short "chapter check" of up to 10 items). Claude Code reviews it
first.

## 5. Visuals: colourful, modern, and legal

Every topic needs visuals a child can understand **without reading** — the scene, the action, the idea.

1. **Animated SVG scenes (first choice, you make them).** Flat, modern, rounded, friendly illustration (think a good
   children's app, not clip-art from 2005): soft shapes, thick friendly outlines or none, generous white space, Indian
   homes, streets, schools, markets, farms and festivals of many faiths, children of every skin tone and ability. Palette
   for illustrations (bright but harmonious, not neon, not grey): saffron `#E8702A`, sunshine `#FFD23F`, teal `#0F766E`,
   leaf `#22C55E`, sky `#0369A1`, cyan `#02CFF9`, plum `#6D28D9`, coral `#FF6B57`, with the paper `#FFFDF9` and tints
   `#E4F3EA #FBF1D3 #EFE9FB #FBE6E3 #E3EEF9`; ink `#1C1B1A` for lines and text. Gentle CSS animation (a cat walking under
   the chair, apples dropping into a basket one by one, a hand clapping) that also reads well as a still frame. viewBox
   about 360 wide, labels 15+ for Classes 1–2, words only as `data-t` labels (both languages). Rules: skill
   `references/diagrams.md`.
2. **Real photos from open-licence libraries (when the real thing matters):** Wikimedia Commons (CC0, CC BY, CC BY-SA,
   public domain), Unsplash, Pexels, Pixabay, and Indian government or NASA public-domain images. **Never take images
   from Google Images or random websites** — most are copyrighted and a paid app cannot use them. Never use photos of
   identifiable children, logos or brand packaging. Download the original, convert to WebP (1280 px and a 640 px copy,
   the same way as `labs/assets/c10/science/`), save as `labs/assets/c0N/<subject>/PH-c0N-<subject>-chNN-<slug>.webp`
   (and `.640.webp`), and give the figure a `"credit": "<author>, <source name>, <licence>"` — words only, no web
   address (the checker refuses a `PH-` photo without a credit, and any chapter with a web address). List every photo in `labs/assets/c0N/<subject>/CREDITS.csv` (`file, source_url, author, licence`).
3. Founder-made images may appear later; when an image plan exists for a subject, use its file names.

## 6. Language: everyday Hindi, the way a Delhi family talks at home

Write Hindi the way parents and children talk at home in Delhi — simple, warm, everyday words, English words where
people actually use them, never shuddh or textbook Hindi.

- **Say:** सिर्फ़ (not केवल), हर (not प्रत्येक), ज़्यादा (not अधिक), आसान (not सरल), मुश्किल (not कठिन), खाना (not
  भोजन), पानी (not जल), पेड़ (not वृक्ष), फूल (not पुष्प), आँख (not नेत्र), स्कूल (not विद्यालय/पाठशाला), मदद (not
  सहायता), कोशिश (not प्रयास), काम (not कार्य), शुरू (not आरंभ), ख़त्म (not समाप्त), जगह (not स्थान), सवाल / जवाब (not
  प्रश्न / उत्तर), और (not एवं / तथा), पर / लेकिन (not किंतु / परंतु), इसलिए (not अतः), से (not द्वारा), के हिसाब से
  (not अनुसार), एक्टिविटी (not गतिविधि), टीचर, क्लास, होमवर्क, टिफ़िन, बैग, पेंसिल, बोतल, गेम, टॉपिक.
- तुम register; warm and playful ("चलो देखें!", "बढ़िया!", "फिर से करके देखो"); never scolding.
- Every Hindi sentence written fresh, not translated word by word; complete verbs; one word per thing in the whole
  chapter and its labs.
- The full rules and lists: skill `references/hindi.md`, `reader/CONTRACT.md` §1, `LESSONS.md` §C. The checker refuses
  the banned words.

## 7. Mistakes earlier writers made — do not repeat them

From the Class 10 reviews (details and the rule for each in `LESSONS.md`):

- Wrong answer keys and assertion-reason keys that contradict their own explanation; two correct options; impossible
  numbers or figures. **Solve every item twice yourself.**
- LaTeX in the text (`\frac`, `\times`) — write plain symbols (½, ×, =, ➕); never wrap maths in `{{eq:…}}`.
- Diagrams that are boxes of words, or drawn on a 720-wide viewBox so the words are tiny.
- Half the topics without a lab; starter labs left unchanged; lab items in the wrong shape; guided steps targeting
  controls the template does not have (the lab freezes). Run `node labs/scripts/check.mjs` on every labs file and read
  every line it prints.
- Image names that do not exist; describing what an image does not show.
- Bookish Hindi and English left inside Hindi sentences.
- Claiming "0 problems" without running the checkers on the final files.

## 8. For every chapter: the gates

```
node labs/scripts/check.mjs labs/defs/c0N/<subject>/<chapter key>.json          # 0 problems
node reader/scripts/check.mjs reader/content/c0N/<subject>/<chapter key>.json  # ok
node reader/scripts/index.mjs && node labs/scripts/index.mjs
SMOKE_BOOK=c0N/<subject> node reader/scripts/smoke.mjs <chapter number>        # every topic, 390/1280 px, EN/HI
```

Files you write per subject: `reader/content/c0N/<subject>/<chapter key>.json` (every chapter), `book.json` (with
`"list": "built"` for Classes 1–2), the regenerated `index.json` and `reader/content/books.json`, the chapter labs files
in `labs/defs/c0N/<subject>/`, new templates in `labs/templates/` plus their `labs/catalogue.json` entries, photos and
`CREDITS.csv` in `labs/assets/c0N/<subject>/`. Nothing else.

## 9. The PR description (each subject)

Who it is for and what it delivers; the chapter list with topics, labs (new templates named) and visuals per chapter;
the photos used with their licences; the checker and smoke output; what you were unsure about (be honest). Claude Code
reviews, fixes, and writes the next feedback file in `docs/family-app/handover/feedback/`; read it before the next
subject.
