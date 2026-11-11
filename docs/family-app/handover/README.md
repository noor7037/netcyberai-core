# Handover pack for the outside AI (writer)

For Noor. This folder is everything an outside AI needs to write a subject's chapters to the NetCyberAI standard.
The plan behind it is `docs/family-app/15_UNIVERSAL_CONTENT_PLAN.md`.

## Files in this pack

| File | What it is | Give it to |
| --- | --- | --- |
| `PROMPT_BUILD_CHAPTER.md` | The master prompt: writes one chapter (reader JSON + labs JSON) | The writer AI, at the start of every session |
| `LESSONS.md` | Mistakes already made and the rule for each; grows after every review | The writer AI, every session, right after the prompt |
| `../../../reader/CONTRACT.md` | The exact file format and rules | The writer AI, every session |
| `example-topic.json` | One complete, approved topic from Class 10 Science, as a model | The writer AI, every session |
| `example-labs.json` | Two approved labs, as a model | The writer AI, every session |
| `templates.md` | The 57 lab templates: what each one can show and its settings | The writer AI, every session |
| The subject's image plan | `data/content/universal/image-plans/<Class>-<Subject>-images.csv` | The writer AI (so it uses the planned image names) and you (to make the images) |
| `PROMPT_IMAGE_PLAN.md` | Makes an image plan for a subject | Claude Code uses it (you may use it with another AI if you want) |
| `feedback/<subject>-<n>.md` | Claude Code's review of the last batch | The writer AI, before it writes the next chapter |

## Which AI (recommendation)

1. **Google Antigravity** for writing. It works inside this repository folder on your Mac, can run the checkers and fix
   its own mistakes, and can write files directly. This saves the most of your time and Claude Code's.
2. **ChatGPT or Gemini** as the second reader (`docs/family-app/prompts/content-factory/REVIEW.md`): a different
   company from the writer checks the science and the Hindi.
3. **Meta AI**: image generation if you like its pictures; not for writing chapters.

## Session script with Google Antigravity (one chapter per session)

1. Open the `NetCyber-EduOps` folder in Antigravity.
2. Paste: "Read `docs/family-app/handover/PROMPT_BUILD_CHAPTER.md` and follow it exactly. Subject: Class 10
   Mathematics. Chapter: 1." (Change the subject and chapter each time.)
3. It reads the contract, the lessons, the examples, the NCERT text and the image plan, writes
   `content-inbox/c10-mathematics/u.c10.mathematics.jemh1.ch01.json` and its labs file in
   `content-inbox/c10-mathematics/labs/`, and runs both checkers until they pass.
4. When it says done, tell Claude Code: "Chapter 1 of Class 10 Mathematics is in the inbox." Go on to chapter 2 in a new
   session.
5. Antigravity must not run git, must not edit anything outside `content-inbox/`, and must not touch the engine.

## Session script with ChatGPT or Gemini (chat only)

1. Start a new chat per chapter. Attach: `PROMPT_BUILD_CHAPTER.md`, `LESSONS.md`, `reader/CONTRACT.md`,
   `example-topic.json`, `example-labs.json`, `templates.md`, the image plan CSV (only that chapter's rows) and the
   NCERT chapter PDF.
2. Say: "Follow PROMPT_BUILD_CHAPTER.md, chat mode. Subject: Class 10 Mathematics. Chapter: 1."
3. It replies in parts: first `chapter.json` (title, hook, outcomes, topic list), then one topic per reply, then
   `test.json`, then `labs.json`. After each reply, say "next".
4. Save each reply as a file in `content-inbox/c10-mathematics/u.c10.mathematics.jemh1.ch01/` with the name it gives
   (for example `t03.json`). Or paste them all into one Google Doc for the chapter.
5. Tell Claude Code the chapter is in the inbox.

## What happens after (you do nothing technical)

Claude Code joins the parts, runs the checkers and the browser test, re-solves every answer, plays every lab, fixes
what is wrong, places your images, opens the PR, and writes `feedback/<subject>-<n>.md`. Give that feedback file to
the same writer AI at the start of its next session so it does not repeat the mistakes.

## Images

Make the images from the subject's image plan, name each file exactly as the plan says, and give the folder to
Claude Code (like `Class-10-Science-Images`). Do not give the images to the writer AI.
