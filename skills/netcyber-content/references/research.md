# Research sources (what to read, what never to copy)

| Source | Where | Use it for |
| --- | --- | --- |
| NCERT textbook, current edition | Extracted text: `labs/.work/txt/<code><NN>.txt` (`<code>` from `data/content/universal/syllabus/books.csv`, e.g. `jemh1` + `01`); PDF links in `books.csv` | Coverage, section order, activity numbers and titles, in-text questions, exercise themes |
| The syllabus row | `data/content/universal/syllabus/chapters.csv` (key `u.c<NN>.<subject>.<book>.ch<nn>`) | The chapter key and title; notes like "for reading only" |
| CBSE curriculum of the session | cbseacademic.nic.in (Curriculum) | What is deleted or added; what is examined |
| NCERT Learning Outcomes | ncert.nic.in (elementary and secondary documents) | Outcome-style `big_idea` and `outcomes` |
| NCERT Exemplar, CBSE sample papers | ncert.nic.in, cbseacademic.nic.in | Question styles, competency items, marking schemes |
| Existing labs and image rows | `labs/defs/c<NN>/<subject>/<key>.json` | Topic split ideas, labs to reuse |
| The approved model | `reader/content/c10/science/*.json`, `assets/example-topic.json` | Depth, voice, Hindi, structure |

Rules:

- **Never copy** NCERT sentences, figures, tables, exercise or example wording, or anything from coaching sites,
  guides or other apps. Read, understand, write your own explanation with your own examples and numbers.
- Never invent statistics or "facts about India"; use round illustrative numbers clearly labelled as examples, or cite a
  public official source you actually opened.
- Activity numbers and titles come from the current NCERT text only — never from memory.
- If the current text drops a topic that older editions had, do not teach it (or mark it "for the curious" in one
  short note).
- Language subjects: never reproduce copyrighted stories or poems; summarise in your own words and teach the skills.
