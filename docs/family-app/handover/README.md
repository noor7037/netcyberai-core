# START HERE — how Noor works with Google Antigravity (or another AI)

You do four things. Everything technical is done by the AI and by Claude Code.

## The one-time setup (already done by Claude Code)

The folder **`/Users/tec/Downloads/NetCyber-Content`** is ready for the AI. It holds the latest project, the rules,
the checkers, the finished Class 10 Science chapters as the model, the lab library, and the text of every NCERT
chapter. The AI writes only into its `content-inbox` folder and into new lab templates; it never touches GitHub.

## Your steps

**Step 1 — Open the folder in Antigravity.**
Open Google Antigravity → Open Folder → `Downloads/NetCyber-Content`.

**Step 2 — Paste ONE message with the scope you want.** The AI follows the skill `skills/netcyber-content`, builds the
work list from our syllabus file (it cannot invent or skip chapters) and does not stop until every item passes:

| You want | Paste |
| --- | --- |
| One chapter | `Use the netcyber-content skill. Build Class 10 Mathematics chapter 1 to completion.` |
| A whole subject | `Use the netcyber-content skill. Build Class 10 Mathematics, every chapter, to completion.` |
| One stream of a class | `Use the netcyber-content skill. Build Class 12 Science stream, every subject and chapter, to completion.` |
| A whole class | `Use the netcyber-content skill. Build Class 12, every stream, subject and chapter, to completion.` |

Start with the **factory pilot**: Class 10 Mathematics, chapters 1–3 (one chapter at a time), so we measure quality and
cost before a whole subject or class.

**Step 3 — If it stops before the end** (a session limit, the computer slept), open Antigravity again and paste:
> Use the netcyber-content skill. Continue the queued run until `queue.mjs status` says it is complete.

It continues exactly where it stopped (the progress is saved in `content-inbox/QUEUE.json`).

**Step 4 — Tell Claude Code** what is in the inbox ("Class 10 Mathematics chapters 1–3 are in the inbox"). Claude Code
reviews, fixes, places your images, publishes and writes a feedback file. Before the AI's next run, paste:
> Read the newest file in `docs/family-app/handover/feedback/` and `docs/family-app/handover/LESSONS.md`, then continue.

## Images (in parallel, whenever you have time)

1. Open `data/content/universal/image-plans/Class-10-Mathematics-images.md` (the guide) and `.csv` (one row per
   image, with a ready prompt in the `prompt` column).
2. Make each image in your image tool by pasting its prompt. Save it with **exactly** the name in `file_name`.
3. Put all images in one folder (for example `Downloads/Class-10-Mathematics-Images`) and tell Claude Code.
4. Do not give the images to Antigravity.

## If you use ChatGPT or Gemini instead of Antigravity

They cannot open the folder, so it is slower and they cannot build new lab templates: start a new chat per chapter,
attach `PROMPT_BUILD_CHAPTER.md`, `LESSONS.md`, `reader/CONTRACT.md`, `labs/CONTRACT.md`, `example-topic.json`,
`example-labs.json`, `skills/netcyber-content/references/lab-library.md`, the chapter's rows of the image plan and the NCERT chapter PDF, and say "Follow
PROMPT_BUILD_CHAPTER.md, chat mode. Subject: Class 10 Mathematics. Chapter: 1." Save each reply as the file it names in
`NetCyber-Content/content-inbox/c10-mathematics/<chapter key>/`. Claude Code then builds any lab template they request.
Antigravity is strongly preferred.

## Second opinion (optional, recommended)

After Antigravity finishes a chapter, give `docs/family-app/prompts/content-factory/REVIEW.md` and the chapter file to
ChatGPT or Gemini and send its list of issues to Claude Code with the chapter.

## What is in this folder (for the AI, not for you)

| File | Purpose |
| --- | --- |
| `PROMPT_BUILD_CHAPTER.md` | The master instructions the AI follows |
| `LESSONS.md` | Mistakes already made and the rule against each; grows after every review |
| `skills/netcyber-content/assets/example-topic.json`, `example-labs.json` | Approved models of a topic and of labs |
| `skills/netcyber-content/references/lab-library.md` | The lab library: every lab type already built, what it shows, its settings |
| `PROMPT_IMAGE_PLAN.md` | How image plans are written (Claude Code uses it) |
| `feedback/` | Claude Code's review of each batch, for the AI to read before the next chapter |
| `../../../reader/CONTRACT.md`, `../../../labs/CONTRACT.md` | The exact rules for chapters, labs and lab templates |

The skill itself is `skills/netcyber-content/` (SKILL.md, references, scripts, assets). Antigravity picks it up through
`.agent/rules/` and `.agent/workflows/build-content.md`; Claude Code through `.claude/skills/netcyber-content`.
