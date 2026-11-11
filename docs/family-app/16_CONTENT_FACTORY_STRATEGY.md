# Content factory strategy: how we build every subject, Classes 1–12

Written by Claude Code (build lead), 11 Nov 2026, for Noor and the supervisor. It is a decision memo on the cheapest
and fastest way to build all 1,344 core chapters to the Class 10 Science standard. It changes the unit of work and the
order in `15_UNIVERSAL_CONTENT_PLAN.md`. The roles (outside AI writes, Claude Code reviews, Noor makes images), the
no-GitHub rule and the quality gates in plan 15 stay. Numbers come from scripts run on our own syllabus and labs data.

## Summary: what we do and why

1. **We stop building chapter by chapter.** We build each idea once, as a **concept card**, and assemble chapters from
   cards. Our syllabus repeats ideas from class to class: 31–55% of all Maths, Science and Social Science topics
   re-teach an idea taught in another class.
2. **Order: Class 10 first, then outwards by subject.** Finish Class 10 (board year, it sells). Then Classes 9, 11
   and 12. Then 6–8, 3–5 and 1–2, which are assembled mostly from cards that already exist.
3. **Build five shared libraries once:** a Hindi–English term bank, a misconception bank, diagram generators, question
   generators and a shared image library. Each fixes a problem the pilot had (Hindi drift, repeated mistakes, 253
   hand-drawn SVGs, wrong answer keys, 211 images for one subject).
4. **Code does the mechanical work, not AI:** maths and physics questions, test assembly, recurring diagrams,
   checking terms, NCERT activity numbers, and joining chapter files.
5. **Outside AIs write; Claude Code reviews a short digest**, not the whole 500 KB file. A card is reviewed once and
   reused, not reviewed again in every class.
6. **Cost:** about **0.17 billion** Claude tokens for everything, against about **0.45 billion** for plan 15 as
   written and about **1.1 billion** if Claude Code wrote chapters the way the pilot did.
7. **Time:** Class 10 is done in about 10 weeks and everything in about **12 months**, against about 2.5 years one
   chapter per session.
8. **Noor's images:** about 7,000 instead of about 13,000, because one image serves every class that teaches the
   same thing.
9. **Languages work differently.** English, Hindi and Sanskrit are half of all chapters (673). Their stories and
   poems do not repeat, so we reuse skills (grammar, writing forms, figures of speech), not content.
10. **Next week:** harvest Class 10 Science into the libraries, build the assembler and the first generators, and
    pilot Class 10 Maths chapters 1–3 through the factory. The supervisor decides go or no-go on the measured cost.

## 1. What the data says

### 1.1 Where the chapters are (1,344 core chapters, 6,608 topics)

| Family | Chapters | Topics | Note |
| --- | --- | --- | --- |
| Languages (English 248, Hindi 284, Sanskrit 141) | 673 | 2,499 | Half the work; literature does not repeat |
| Social Science 6–10 + History, Geography, Political Science, Economics 11–12 | 212 | 1,130 | Strong spiral: maps, climate, democracy, economy |
| Science 6–10 + EVS 3–5 + Physics, Chemistry, Biology 11–12 | 174 | 1,267 | Strongest spiral |
| Mathematics 1–12 | 161 | 829 | Strong spiral; best fit for generated questions |
| Accountancy, Business, CS, IP, Psychology, Sociology (11–12) | 124 | 883 | Two classes only; little spiral |

By class: Classes 1–5 have 278 chapters, 6–8 have 255, 9–10 have 247, 11–12 have 564. Class 10 has 154 core
chapters; 13 (Science) are done.

### 1.2 How much repeats (the spiral)

Two measures, both run on the 6,608 topic titles in `labs/defs/**`:

| Measure | Maths | Science | SST | All three |
| --- | --- | --- | --- | --- |
| **Lower bound:** topic title closely matches a topic in another class | 315 of 829 (38%) | 405 of 1,267 (32%) | 273 of 1,130 (24%) | 993 of 3,226 (31%), in 252 concept groups |
| **Upper bound:** topic touches one of the 69 spine concepts taught in 3 or more classes | 463 (56%) | 771 (61%) | 556 (49%) | 1,790 of 3,226 (55%) |
| Languages: topic touches a skill taught in 3+ classes | | | | 880 of 2,499 (35%) |

Examples of the spine: fractions → rational → real numbers (8 classes, 5–12); lines and angles (9 classes);
triangles (9); data handling (11); light, mirrors and the eye (8 classes, 4–12); electricity (8); acids, bases and
salts (6); cells (6); motion (6); democracy and the constitution (7 classes, 115 topics); rivers and drainage (7).

**Working figure: about 40% of concept topics can reuse a card.** A reused card still needs new band-level
explanation, so it saves about half of that topic's work (terms, misconceptions, diagrams, images and question
templates are reused; the explanation is written for the class). **Reuse alone saves about 20%.** The bigger saving
comes from code doing mechanical work and from shorter reviews (§4).

### 1.3 What the pilot cost and what it left behind

| Item | Class 10 Science (13 chapters) |
| --- | --- |
| Writing | ~450k tokens per chapter (~5.8M) |
| Upgrade after feedback | ~450–650k per chapter (~7M) |
| Total | **~1M tokens per chapter** |
| File size | 400–600 KB per chapter; SVG is 23% of the bytes |
| Left behind (reusable now) | 458 English–Hindi terms, 112 misconceptions, 253 diagrams, 52 labs, 211 images, 31 lessons |
| Review findings | 8 wrong images, activity numbers from memory wrong, Hindi word swaps not good enough |

Each review finding is a library or a script problem, not a writing problem: an image library with briefs, an
activity register taken from the NCERT text, and a term bank used while writing.

## 2. What real content factories do (only what changes our decision)

| Practice | Who | What we take |
| --- | --- | --- |
| Small modules assembled into many books | OpenStax/Connexions: modules grouped into collections that make a book | Concept cards assembled into chapters |
| Single source and structured reuse | CompTIA moved to structured content with a central repository; authors reuse instead of copy-paste; it estimated 25% of text reusable | Our 31–55% concept overlap is higher than theirs, so reuse pays more for us |
| Template prompts, generate many, a human picks | Duolingo: a fixed prompt with blanks (level, theme, exercise type) makes ~10 candidates; a learning designer picks and edits; an expert has the final say | Outside AI fills card templates; Claude Code picks and fixes; Noor sees the result |
| Automatic item generation | An expert writes an "item model"; code makes a family of items by changing the numbers and surface features | Maths and physics question generators: answer computed by code, distractors from the misconception bank |
| Spiral curriculum | Bruner: return to the same ideas with more depth each time | A card holds a depth ladder (Classes 3–5, 6–8, 9–10, 11–12) |
| Skill map with prerequisites | Khan Academy's knowledge map linked skills by prerequisite (now replaced by course mastery) | The spine lists each concept's prerequisites, so `retrieve` steps point back to the earlier class |

## 3. Decisions

### 3.1 Unit of production: the concept card (decision)

| Option | Reuse | Consistency | Review cost | Verdict |
| --- | --- | --- | --- | --- |
| Chapter | None across classes | Drifts (two names, two genders) | Whole file every time | No |
| Topic | Some | Drifts | Topic by topic | No |
| **Concept card + band overlay** | Terms, misconceptions, diagrams, images, item templates shared | One term bank | Card once, then only the new text | **Yes** |

A **concept card** (`content/cards/<family>/<concept_id>.json`) holds, once:
- the concept id, prerequisites, and the classes and chapters that teach it;
- the terms (ids into the term bank) and the misconceptions (ids into the misconception bank);
- the depth ladder: what each band must and must not say (for example, light in Class 6 = travels in straight lines;
  Class 10 = refraction and lenses; Class 12 = wave optics);
- diagram specs (generator + parameters) and image ids;
- item templates (parametric for numbers, written for ideas), each tagged with band and Bloom level.

A **chapter recipe** (`content/recipes/<chapter_key>.yaml`) lists the chapter's topics, the card each topic uses and
the band. The **band overlay** is the new text for that class: hook, plain explanation, worked example, close, in
English and Hindi. A script joins card + overlay into the reader JSON, and `reader/scripts/check.mjs` checks it as
today. The reader format does not change.

**Where cards do not fit:** literature chapters (stories, poems) and the commerce and CS subjects. They are written
per chapter as today, but they use skill cards (grammar, letter writing, figures of speech, accounting entries,
coding patterns) and the same banks.

### 3.2 Order: Class 10 first, then outwards by subject (decision)

| Option | For | Against |
| --- | --- | --- |
| Class by class | Simple; matches plan 15 | Rebuilds the same idea in every class; terms drift |
| One subject 1–12 | Best reuse and consistency | Classes 1–5 come before their band contracts; Class 10 waits months |
| Whole spine first | Cleanest design | Nothing reaches users for months |
| **Hybrid: board year first, then outwards by subject** | Value early and reuse | Cards built in Class 10 need a depth ladder from the start (small cost) |

**Waves:**

| Wave | What | Chapters | How |
| --- | --- | --- | --- |
| 0 (2 weeks) | Libraries, assembler, digest, first generators, pilot | 3 (Maths 1–3) | §6 |
| A (weeks 3–10) | Rest of Class 10: Maths, SST, English, Hindi, Sanskrit | 141 | Each topic a card with a ladder stub |
| B (weeks 11–24) | Class 9, then 11–12 by family (Maths; Physics, Chemistry, Biology; History, Geography, Political Science, Economics; languages; commerce and CS) | ~657 | Cards from Class 10 extended up and down |
| C (weeks 25–36) | Classes 6–8 | 255 | Mostly assembled from cards; middle-band contract |
| D (weeks 37–50) | Classes 3–5, then 1–2 | 278 | Own contracts; cards supply terms, misconceptions and images; play format for 1–2 |

Inside each wave, work **by subject family**, with one writer AI per family. It keeps one voice and one set of terms,
and the Hindi gets reviewed in batches. Class 9 comes right after Class 10 because it shares the band and contract
and feeds Class 10.

### 3.3 Shared libraries: build once (decision)

| Library | File | Seed from | Kills |
| --- | --- | --- | --- |
| **Term bank** (translation memory) | `content/banks/terms.csv`: en, hi, NCERT term, gender, band, banned variants | 458 terms from Class 10 Science + LESSONS §C + NCERT Hindi glossaries | Two names for one thing, gender drift, shuddh-vs-spoken swaps; the checker fails a banned form |
| **Misconception bank** | `content/banks/misconceptions.csv`: id, concept, wrong, right, why, band | 112 from Class 10 Science | Re-inventing distractors; weak wrong options |
| **Activity register** | `content/banks/activities.csv`: class, book, chapter, activity number, title | Script on the NCERT PDF text | Activity numbers from memory |
| **Diagram generators** | `content/diagrams/*.mjs`: parameters in, SVG with `data-t` labels out | Patterns in the 253 pilot SVGs | Hand-drawn SVGs, wrong geometry, keyframe clashes |
| **Question generators** | `content/items/*.mjs` + templates | Maths and physics numericals first | Wrong answer keys, small pools, answer-position bias |
| **Image library** | `content/images/library.csv`: image id, concept, views, brief, used by | 211 Class 10 Science images | Noor drawing the same eye or circuit twice; images that miss their brief |
| Lab templates (exists) | `labs/catalogue.json` (57 templates, 5,443 labs) | — | Already shared |

**Diagram generators to build first (about 40 cover most of Maths and Science):** number line, fraction bar, place
value chart, coordinate plane and graph, bar graph/histogram/pie, triangle with given parts, angle and transversal,
circle with chord/tangent/sector, solids and nets, trig ratio triangle, clock; ray diagram (mirror, lens, prism, eye),
circuit (series/parallel, meter readings), magnetic field lines, wave, motion graphs, force arrows; cell, food chain
and web, cycles (water, carbon, nitrogen), process flow, apparatus set-up, particle model; map outline with points,
timeline, flow of government, sector bar.

Each generator is code reviewed once, then any number of correct diagrams cost almost nothing. Hand-drawn SVG remains
for one-off ideas.

### 3.4 Who does what, to keep Claude tokens low (decision)

| Work | Done by | Why |
| --- | --- | --- |
| Concept map, card text, band overlays, literature chapters | Outside AI (Antigravity first) | Long writing is the biggest cost; it can run the checkers itself |
| Second read for facts and Hindi | A different outside AI | A second company catches what the first misses |
| Maths/physics items, test assembly (50/20/30, answer positions), diagram drawing from specs, joining files, term checks, activity numbers, image dedupe | **Scripts** | Exact and repeatable; zero tokens per use; no wrong answer keys |
| Hindi term replacement | Script **flags**, the writer rewrites | LESSONS 24: word swaps alone read badly. The term bank goes in the prompt so the first draft is right |
| Generators, assembler, contracts, checker rules | Claude Code, once | Small code, reused thousands of times |
| Review | Claude Code reads a **digest** | See below |
| Images | Noor, from the library briefs | Only where the real thing matters |

**The review digest** is a script output per chapter: only the new overlay text in English and Hindi side by side,
the Hindi sentences the term checker flagged, the questions not made by a generator, and the list of reused cards
(already approved). No SVG, no reused card text, no generated items (their generator is tested). Claude Code reads
40–60k tokens instead of the 150–200k-token file.

**Audit:** after a family's first three clean books, Claude Code reviews one chapter in five in full. A chapter
found with a serious error puts the family back to full review.

## 4. The pipeline

| Stage | Who | Input → output | Gate | Batch |
| --- | --- | --- | --- | --- |
| 1. Spine | Outside AI proposes, script checks, Claude Code spot-checks | NCERT contents + topic titles → `spine/concepts.csv` (id, classes, prerequisites) | Every core topic mapped to a concept or marked "chapter-only" | One family at a time |
| 2. Cards | Outside AI | Spine rows + term bank + misconception bank + activity register → cards | Card checker: schema, terms only from the bank, sources, ladder present | 10–15 cards per session |
| 3. Card review | Second AI, then Claude Code (digest) | Cards → approved cards | Facts, ladder, Hindi; approved once | Per family batch |
| 4. Recipes and overlays | Outside AI | Chapter recipe + overlay text per topic | Recipe points only to approved cards | One book per session (2–4 chapters for small books) |
| 5. Assemble | Script | Cards + overlays + generated diagrams and items → reader JSON + lab defs | `reader/scripts/check.mjs`, `labs/scripts/check.mjs`: 0 problems | Per book |
| 6. Chapter review | Claude Code (digest) | Digest → fixes in the overlay | Every non-generated answer re-solved; Hindi read whole | Per book |
| 7. Images | Noor → Claude Code | Library briefs → images, checked against the brief, pins placed | Image matches its brief | Per family, one list across classes |
| 8. Smoke and publish | Claude Code → supervisor | `smoke.mjs` at 390/1280, EN/HI → one PR per book | Plan 15 §9 gates | Per book |
| 9. Feedback | Claude Code | `handover/feedback/` + LESSONS + new checker rule | A rule a program can check becomes a checker rule | Per batch |

**Fix at the source:** a fix to a card fixes every chapter that uses it. The assembler rebuilds those chapters;
nobody edits a chapter file by hand.

## 5. Cost and time

Estimates, not promises. Claude Code tokens for all 1,344 core chapters. Lower-band chapters are smaller (Classes
1–5 have shorter topics and no 20-item test); the averages below allow for that.

| | A. Claude Code writes (pilot way) | B. Plan 15 as written (outside AI writes whole chapters, Claude reviews whole file) | **C. Factory (this memo)** |
| --- | --- | --- | --- |
| One-off build | — | — | ~20M (libraries, generators, assembler, digest, band contracts) |
| Per chapter | ~800k–1M | ~300k (read whole file, re-solve, fix, place images, smoke) | ~100k (digest, fixes, smoke) |
| All chapters | **~1.1 billion** | **~0.4 billion** | ~0.13 billion |
| Image checks | in the above | ~13,000 images → ~40M | ~7,000 images → ~20M |
| **Total** | **~1.1 billion** | **~0.45 billion** | **~0.17 billion** (range 0.13–0.25) |
| Noor's sessions | — | ~1,344 (one per chapter) | ~600 (card batches + one book per session) |
| Noor's images | ~13,000 | ~13,000 | ~7,000 |
| Time to Class 10 complete | — | ~4 months | ~10 weeks |
| Time to everything | — | ~2.5 years at ~10 chapters a week | **~12 months** at ~30 chapters a week after wave 0 |

Where C's saving comes from: card reuse ~20%; the digest instead of the whole file ~50% of review tokens; code for
items, tests and diagrams (no answer-key or SVG re-checks); fewer images. The pilot (§6) measures the real
per-chapter figure. If it is above 150k, we look again before wave A.

## 6. Risks and how we prevent them

| Risk | Prevention |
| --- | --- |
| **Quality drift** over hundreds of chapters | Golden examples per band; every repeat mistake becomes a checker rule; the 1-in-5 full audit; a serious error puts the family back on full review |
| **Same text in every class** (the card becomes a copy-paste) | The card holds terms, misconceptions, diagrams and items, never the explanation. The overlay is written fresh for the class. The checker fails an overlay that repeats another class's text above a set similarity |
| **Copyright** | No NCERT sentences, figures or exercise wording (plan 15 §8). Literature chapters teach around the text and never reproduce it. A script checks overlap of long word runs against the NCERT PDF text. Images are made fresh from our briefs |
| **Review bottleneck** (Claude Code) | Digest review; cards approved once; generators tested once; a second AI reads first |
| **Founder image load** | Shared image library across classes; generated diagrams for anything schematic; images only where the real thing matters; one list per family so Noor works in long, similar batches |
| **Band differences** (1–2 vs 11–12) | Each band has its own contract before its wave (gate size, test mix, item types, minutes). Classes 1–2 follow NCF-FS: play, picture checks, no tests. The term bank has a band field (simpler words for young children). The card's ladder says what each band must not say yet |
| **Wrong spine mapping** (our title match is rough) | The spine is built from the NCERT contents by an outside AI, checked by script (every topic mapped once) and spot-checked; a wrong link only costs a reused diagram, not a wrong chapter |
| **Over-building the system** | Wave 0 is two weeks and ends in a measured pilot. Cards only for concept subjects. No card system for literature |
| **Hindi still awkward** | The term bank goes in the writing prompt; the checker flags banned forms; the writer rewrites whole sentences (no blind swaps); the digest shows every new Hindi sentence |

## 7. The first three steps (next week)

1. **Harvest Class 10 Science into the libraries** (Claude Code, ~3M tokens). Script out the 458 terms into the term
   bank, the 112 misconceptions into the misconception bank, the 211 images into the image library with their
   briefs, and the diagram patterns into a generator list. Build the activity register for Class 10 Maths and SST from
   the NCERT PDFs. Add the term check to `reader/scripts/check.mjs`.
2. **Build the assembler, the digest and the first generators** (Claude Code, ~8M tokens). Card and recipe formats;
   the assembler that writes today's reader JSON; the review digest; about 10 diagram generators and 8 question
   generators for Class 10 Maths (real numbers, polynomials, linear equations, quadratics, AP, triangles and
   coordinates, trigonometry, statistics and probability).
3. **Pilot Class 10 Maths chapters 1–3 through the factory.** Update the handover pack (`PROMPT_BUILD_CARD.md`, the
   term bank in every session; the Maths image plan rewritten as library ids). Antigravity writes the cards and
   overlays; Claude Code assembles, reviews the digest, publishes one PR and **measures tokens and hours per
   chapter**. The supervisor decides go or no-go for wave A on that number (target ≤ 120k per chapter).

**Noor's part next week:** one Antigravity session for the Maths cards when step 3 starts. Nothing else.

## 8. Open decisions for the supervisor

- Approve the concept card + recipe change to plan 15 (§3.1) and the wave order (§3.2).
- Whether existing Class 10 Science is rebuilt from cards later (recommended: no; harvest only, rebuild only when a
  card fix must reach it).
- Decision Log rows for this change (the lead reserves the numbers).

## Sources opened

- Duolingo blog, LLM-assisted lessons: https://blog.duolingo.com/large-language-model-duolingo-lessons
- Scriptorium, CompTIA structured learning content: https://www.scriptorium.com/2025/09/comptia-accelerates-global-content-delivery-with-structured-learning-content/
- Wikipedia, Automatic item generation (item models, parents and isomorphs): https://en.wikipedia.org/wiki/Automatic_item_generation
- From search summaries only (not opened): OpenStax CNX modules and collections (https://www.wikiwand.com/en/articles/OpenStax_CNX);
  Khan Academy knowledge map retired for course mastery (support.khanacademy.org community answer); spiral curriculum
  (Bruner 1960; Harden and Stamper 1999, via https://qmul.ac.uk/queenmaryacademy/educators/resources/degree-apprenticeships/curriculum-design/spiral-curriculum).

Scripts used for §1 (not committed): topic titles from `labs/defs/**`, a regex concept spine per family, and a
title-similarity cluster (shared content words at Jaccard 0.3 or above, across classes).
