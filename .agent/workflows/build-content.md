---
description: Build NetCyberAI content for a chapter, a subject, a stream or a whole class, to completion
---

1. Read `skills/netcyber-content/SKILL.md` in full, then the files its §1 lists.
2. If `content-inbox/QUEUE.json` exists, run `node skills/netcyber-content/scripts/queue.mjs status` and continue it.
   Otherwise create the queue for the scope the user named (SKILL.md §1a), for example
   `node skills/netcyber-content/scripts/queue.mjs init --class 10 --subject mathematics`.
3. Loop: `queue.mjs next` → build the item to the skill's standard → `queue.mjs done <id>` (fix until it passes) → next.
4. Do not stop, summarise or ask to continue while items are left. When the queue is complete, write
   `content-inbox/RUN-REPORT.md`.
