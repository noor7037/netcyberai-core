# 39. The Teaching Engine (Wave 9)

Supervisor (CTO and Chief AI Officer), for the founder and the Wave 9 agents. Binding: what each slice builds, the shapes
they share, and what is already there. Decision Log C406–C409. Rules: CLAUDE.md; nothing hard-codes a subject, a class
or a question; the child's words go only to providers Control allows (testing mode, C404).

## 1. What is true today (HEAD of main, 2026-10-30)

- **Memory exists but is not used.** `family.tutor_conversations` is one conversation per child and subject
  (`unique (child_id, subject)`); `family.tutor_messages` keeps every turn with its blocks. The resolver prompt never
  receives earlier turns, so a follow-up is answered cold. This is the defect the founder saw.
- **The library exists.** `content.chapter_contents` holds published chapters (blocks JSON, subject, board, class);
  `content.units`, `content.topics` and `family.child_syllabi` hold the syllabus; `content.video_picks` holds checked
  YouTube videos. Nothing retrieves a chapter for a question: the resolver answers from the model alone.
- **The answer format is fixed by the prompt.** v7 asks every question for the same block list, so a biology question
  got a pendulum simulation and a three-box flow. The checker (`src/lib/family/blocks.ts`) drops bad blocks and the
  child sees "did not pass our checks".
- **The Quality Lab exists** (`control.ai_eval_runs`, `ai_eval_results`): cases are entered by hand; nothing covers the
  curriculum.

## 2. The architecture, mapped to this repository

| The founder's layer | In NetCyberAI | Slice |
|---|---|---|
| Foundation model | The gateway: Primary, Backup 1, Backup 2 per workload, Control → AI | built |
| Curriculum knowledge base | `content.*` chapters, units, topics, videos; the studio and the review queue | built; coverage in 9D |
| Retrieval | Postgres full-text over chapter blocks and syllabus (tsvector, no new service); passages into the prompt | 9B |
| Teaching engine | One planning call before the answer: question type, class band, depth, which blocks, which visuals | 9B |
| Visual engine | SVG drawn by our code from the model's labels; licensed photos from Wikimedia Commons with credit; YouTube picks | 9C |
| Evaluation engine | Eval cases generated from the syllabus per class × subject × question type; coverage manifest in Control | 9D |
| Student context | The child's class, board, language, chapter, and the chat's memory (summary + last turns) | 9A |

## 3. Shapes every slice uses (final; agents do not change them)

**Chat (9A).** A child has up to **15 open chats per subject**; the 16th archives the oldest. A chat takes up to
**30 child turns**; at 30 it is `full` and the screen says "This chat is full. Start a new chat in <subject>." A chat
carries `title` (first question, 60 chars), `turn_count`, `summary` (≤ 1,200 chars, rewritten every 5 turns by the
`family.summary` workload), `status` (`open`, `full`, `archived`). The prompt receives: the summary, the last 6 turns
verbatim (child text and the tutor's explanation paragraphs only, no blocks), the chapter key.

**Plan (9B).** `{"questionType": "definition|concept|why_how|comparison|problem|derivation|process|experiment|history|
case|application", "band": "lkg_1|c2_5|c6_8|c9_10|c11_12", "depth": "short|medium|full", "blocks": [..block names..],
"visuals": [{"kind": "figure|steps|timeline|image|video", "about": "..."}], "lang": "en|hi"}`. The band comes from the
child's class, never guessed from the question. `short` is one explanation and one check; `medium` the usual set; `full` the whole set. No
interactive block unless `questionType` is `problem`, `process` or `experiment` **and** the subject is Mathematics or
Science.

**New blocks (9C draws, 9B asks for, blocks.ts checks).**
- `{"type":"figure","title":"...","kind":"schematic","shape":"circle|ring|cell|layered|orbit","labels":[{"at":"centre|top|right|bottom|left|ring","text":"≤40"}]}`: a schematic with callouts, 2–6 labels.
- `{"type":"steps","title":"...","items":[{"label":"≤30","text":"≤120"}]}`: 3–5 steps as a strip (a row at 768, a column at 390).
- `{"type":"timeline","title":"...","items":[{"when":"≤20","text":"≤100"}]}`: 3–8 events.
- `{"type":"image","query":"≤80","caption":"≤120"}`: the server replaces it with a licensed Wikimedia Commons image (CC0, CC BY, CC BY-SA, public domain only; credit line and licence shown; cached in `content.image_picks`), or drops it.
- `{"type":"videos"}`: the server fills it from `content.video_picks` for the chapter, or drops it.

**Bands.** lkg_1: ≤ 60 words, one picture, read aloud first; c2_5: ≤ 150 words, a story or example, one check;
c6_8: 150–350 words, reasoning, a figure or steps, misconceptions, check and practice; c9_10: formulas, worked
problems, exam style; c11_12: derivations, numericals, rigour. The planner may go one band down for a simple question,
never up.

## 4. Acceptance

- A third follow-up in a chat is answered with the earlier turns in view (test: "and why is that?" after two turns).
- The same question in class 3 and class 11 gets different depth and blocks; a biology question gets no pendulum.
- A chapter in the library is quoted ("From your chapter: …") when it matches; otherwise the answer says it is general.
- Every photo shown carries a credit and a licence; none is generated.
- Control → Content → Coverage lists every syllabus unit with: chapters published, reviewed, missing; CSV export.
- The Lab runs an eval set of at least one case per class × subject × question type in the configured syllabus.

## 5. Wave 10 additions (founder, 30 Oct: content-matched, animated, interactive visuals; chat like the chat products)

**The visual must match the content, never plain text alone.** The planner (`visuals`) chooses: a `chart` for numbers and comparisons; `timeline` for history and ordered processes; `mind_map` (animated reveal) for connected ideas; `scene` for anything with parts (the body, the mind, a motor, a circuit, a cell, a flower, the water cycle), tap-able part by part; for Mathematics at least one of `number_line`, `graph`, `geometry`, `fraction_model` or `steps` (animated working) in every answer. Cards and progress rings stay for status and key points.

**New blocks (final shapes; drawn by our code, checked by `blocks.ts`).**
- `{"type":"scene","title":"≤60","layout":"row|ring|stack|free","parts":[{"id":"a1","label":"≤30","text":"≤220","shape":"circle|rect|pill|hex|coil|magnet|wire|arrow|organ","colour":1-8}],"links":[{"from":"a1","to":"a2","kind":"flow|line|arrow","label":"≤20"}],"animate":"flow|pulse|rotate|none"}`: 2–12 parts, each in its own palette colour; a tap opens the part's text; `flow` animates dashes along links (current, blood, water), `pulse` breathes the parts (heart, lungs), `rotate` turns `coil` parts (a motor's rotor). Motion off under `prefers-reduced-motion`; everything still readable without it.
- `{"type":"chart","title":"≤60","kind":"bar|line|pie","unit":"≤12","labels":["≤12"],"series":[{"label":"≤20","values":[numbers]}]}`: 2–12 points, 1–3 series; our code scales axes and computes percentages; the caption says the figures are as given in the answer.
- `steps` gains `"animate": true`: steps reveal one by one (300 ms apart), tap to replay.
- `mind_map` gains the same reveal, branch by branch.

**Chat, final rule (replaces the 15-chat list on the screen).** Each subject shows one continuous feed: every question and every answer, in order, newest at the bottom, like the chat products. The feed keeps the last **30 child turns per subject**; the 31st deletes the oldest automatically (the chats of §3 stay as storage; the screen never lists them). The latest conversation is always visible on opening the subject. A follow-up answer opens with one sentence that refers back ("Earlier we saw that …"). A subject change decided by the server is announced in the feed ("Moved to Science") and the subject tab follows it.
