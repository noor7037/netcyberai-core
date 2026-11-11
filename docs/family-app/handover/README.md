# START HERE — how Noor works with Google Antigravity (or another AI)

You do four things. Everything technical is done by the AI and by Claude Code.

## The one-time setup (already done by Claude Code)

The folder **`/Users/tec/Downloads/NetCyber-Content`** is ready for the AI. It holds the latest project, the rules,
the checkers, the finished Class 10 Science chapters as the model, the lab library, and the text of every NCERT
chapter. The AI writes only into its `content-inbox` folder and into new lab templates; it never touches GitHub.

## Your four steps, for each chapter

**Step 1 — Open the folder in Antigravity.**
Open Google Antigravity → Open Folder → `Downloads/NetCyber-Content`.

**Step 2 — Paste this message (change only the subject and chapter number):**

> Read `docs/family-app/handover/PROMPT_BUILD_CHAPTER.md` and follow it exactly, including every file it tells you
> to read first. Subject: Class 10 Mathematics. Chapter: 1. Work only inside `content-inbox/` and, if a topic needs
> a lab that the library does not have, create the new lab template as the prompt says. Do not run any git command.
> When everything passes the checkers, write `content-inbox/c10-mathematics/DONE-ch01.md` with what you built, the
> new lab templates you made, and anything you were unsure about.

**Step 3 — Wait until it says done.** It can take a few hours. If it stops halfway, paste:
> Continue where you stopped and finish the chapter; run both checkers until they pass.

**Step 4 — Tell Claude Code:** "Class 10 Mathematics chapter 1 is in the inbox."
Then start a **new** Antigravity chat for the next chapter (chapter 2), with the same message. One chapter per chat.

That is all. Claude Code then checks every answer, plays every lab, looks at every diagram on a phone screen in both
languages, places your images, fixes what is wrong, publishes it, and writes a feedback file. **Before the next
chapter**, paste this into Antigravity first:

> Read the newest file in `docs/family-app/handover/feedback/` and `docs/family-app/handover/LESSONS.md` again. Do not
> repeat any of those mistakes.

## Images (in parallel, whenever you have time)

1. Open `data/content/universal/image-plans/Class-10-Mathematics-images.md` (the guide) and `.csv` (one row per
   image, with a ready prompt in the `prompt` column).
2. Make each image in your image tool by pasting its prompt. Save it with **exactly** the name in `file_name`.
3. Put all images in one folder (for example `Downloads/Class-10-Mathematics-Images`) and tell Claude Code.
4. Do not give the images to Antigravity.

## If you use ChatGPT or Gemini instead of Antigravity

They cannot open the folder, so it is slower and they cannot build new lab templates: start a new chat per chapter,
attach `PROMPT_BUILD_CHAPTER.md`, `LESSONS.md`, `reader/CONTRACT.md`, `labs/CONTRACT.md`, `example-topic.json`,
`example-labs.json`, `templates.md`, the chapter's rows of the image plan and the NCERT chapter PDF, and say "Follow
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
| `example-topic.json`, `example-labs.json` | Approved models of a topic and of labs |
| `templates.md` | The lab library: every lab type already built, what it shows, its settings |
| `PROMPT_IMAGE_PLAN.md` | How image plans are written (Claude Code uses it) |
| `feedback/` | Claude Code's review of each batch, for the AI to read before the next chapter |
| `../../../reader/CONTRACT.md`, `../../../labs/CONTRACT.md` | The exact rules for chapters, labs and lab templates |

The first chapters through this pack are the **factory pilot**: Class 10 Mathematics chapters 1–3
(`16_CONTENT_FACTORY_STRATEGY.md` §7). Their real cost and review findings decide how the rest is built.
