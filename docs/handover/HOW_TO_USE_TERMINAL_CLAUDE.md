# How to work with Claude Code in your Mac terminal

For Noor. Plain steps; nothing here needs technical knowledge.

## 1. Starting, every time

1. Open Terminal.
2. Go to the project folder (wherever you downloaded it), for example:
   `cd ~/netcyberai-core`
3. Type `claude` and press Enter.

To carry on yesterday's conversation instead of starting fresh: `claude --continue`

## 2. The very first message to send (copy and paste this once)

```
You are the supervisor for NetCyberAI. I am Noor, the founder. I am not technical.

First run: git fetch origin && git checkout claude/jolly-volta-3y6vps && git pull

Then read these three files, in this order, and nothing else yet:
1. docs/handover/HANDOVER.md
2. docs/handover/2026-11-13_draw_feature_handover.md
3. CLAUDE.md

Then tell me in at most 10 plain lines: what you understand the next step to be, and anything you need from me.
Do not start building until I say go.
```

When its summary looks right, reply: `go`.

## 3. How to talk to it

Talk the way you talked to me. You do not need special words.

- **Say the problem, not the solution.** "On my phone the call takes long to start" is better than "change the
  microphone code".
- **Say where you saw it.** Which screen, which child or class, what you tapped, what happened.
- **Paste a screenshot** when you have one: drag the picture into the terminal window.
- **One job per message** is cheaper than five. If you have many, number them.
- **To stop it mid-way:** press `Esc`. Nothing breaks.
- **If it asks permission** to run a command or edit a file, read the one line and choose Yes. Choosing
  "Yes, and don't ask again" for ordinary commands saves time.

Useful sentences:

| You want | Say |
|---|---|
| A plan before any change | "Plan only. Do not change anything yet." |
| It to carry on | "go" |
| Less talk | "Shorter. Only what I must do and what changed." |
| To check a claim | "Did you actually run it? Show me the result line." |
| A pull request | "Run the full checks, then open a PR." |
| To save and stop | "Save everything, push it, and update the handover note." |

## 4. Your part of the routine (unchanged)

1. It builds and tells you a PR is ready, with a link.
2. You open the link on GitHub and press **Merge**. The red check on GitHub is expected (billing); what matters is
   that it told you "all 29 steps passed".
3. You test on your phone and tell it what you saw.

Things only you can do, which it will ask for: settings in Control → AI (prompt version, prices, paying customers),
approving a database change if it cannot apply one itself, building a new Android app, and decisions about money
or taste.

## 5. Keeping the cost down ($100 goes quickly if you are not careful)

- Type `/cost` at any time to see what this session has used.
- Type `/model` to choose the model. Use the middle one (Sonnet) for normal work. Switch to the strongest only for
  hard jobs: money, sign-in, children's data, or when the middle one is clearly struggling.
- When a job is finished and you start a different one, type `/clear`. A long conversation costs more with every
  message, because the whole conversation is re-read each time.
- If you want to keep the conversation but shrink it, type `/compact`.
- Do not ask it to "audit everything" or "read the whole project". Ask for one thing.
- Do not ask it to use several agents at once. Parallel work is fast and expensive.
- If it starts reading many files for a small question, press `Esc` and say "read less, grep first".

## 6. Other commands worth knowing

| Command | What it does |
|---|---|
| `/help` | Lists everything |
| `/resume` | Pick an older conversation to reopen |
| `/mcp` | Shows connected services (GitHub, Supabase). If Supabase is missing, tell Claude "help me connect Supabase" |
| `/status` | Which account and model you are on |
| `Shift` + `Tab` | Cycles modes; "plan mode" makes it plan without changing files |
| `Esc` twice | Go back to an earlier message and try again from there |

## 7. One-time setup it may ask you for

- **GitHub tool:** if it says `gh` is missing, run `brew install gh` and then `gh auth login` in Terminal and follow
  the prompts. This lets it open pull requests for you.
- **Project packages:** the first time, it will run `npm ci` (a few minutes).
- **Database changes:** in the cloud I applied these for you. On the Mac it may not be able to. If it says a
  migration is waiting, either ask it to help you connect Supabase to Claude Code, or it will give you a file to
  paste into the Supabase dashboard's SQL editor. Always do this **before** merging the PR that needs it.

## 8. If something goes wrong

- **It seems confused about the project:** say "Read docs/handover/HANDOVER.md again and tell me the next step."
- **It claims something works but your phone disagrees:** your phone is right. Tell it exactly what you saw.
- **It wants to merge, push to main, or comment on a PR:** say no. Those are yours, and `CLAUDE.md` forbids them.
- **You are about to run out of credit:** say "Save everything, push it, and update docs/handover/HANDOVER.md
  section 6 with exactly where you stopped." Then you can resume later from the note.
