> **ARCHIVED — 2026-09-16.** The "upload these files into an external
> AI builder tool" workflow this document describes is obsolete: the
> files now live in this repo, under version control, and a session
> works from them directly. Its content — what to read, in what
> order, and the one instruction to give a new AI session — was
> carried forward into [`../00_START_HERE.md`](../00_START_HERE.md).
> Kept for reference to the pack-based workflow this project used
> before it had a repository.

# NetCyberAI — Upload Pack Index

Upload these to any AI web-builder tool (Firebase Studio, Google AI
Studio, Cursor, Lovable, a fresh Claude chat, etc.) in this order,
before typing your build request:

1. **`PRODUCT_CONSTITUTION_v2.0.md`** — the single source of truth.
   Supersedes every earlier version and every fragment pasted into a
   past session. If a tool ever suggests something that contradicts
   this file, that's the tool being wrong, not the file being outdated
   — check with yourself before letting it proceed.
2. **`AI_BUILDER_SYSTEM_PROMPT.md`** — tells the tool *how* to behave:
   no dummy data, no invented numbers, the Transparent Output Template,
   how to disagree with you or with a past AI's output.
3. **`ARCHITECTURE_DECISIONS_PLAIN.md`** — the technical decisions,
   explained in plain language, so you can sanity-check what any
   builder tool produces without needing to know framework jargon.
4. **`netcyberai_schema.sql`** — the actual database structure.
5. **`netcyberai_rls_policies.sql`** — the tenant-isolation rules.
6. **`netcyberai_recognition.ts`** — the corrected recognition-scoring
   logic (Personal Best + banded Most Improved).
7. **`BUILD_ORDER.md`** — what to build now (public site only) vs.
   what stays gated behind the Bridge Rule.
8. **`netcyberai_public_site_content_plan.md`** — the actual pages and
   blog posts for the Phase 0 build.
9. **`ACCEPTANCE_CHECKLIST.md`** — what "done" means; run this before
   accepting any AI tool's claim that something works.

## The one instruction to give every new AI session, verbatim

> "Read `PRODUCT_CONSTITUTION_v2.0.md` and
> `AI_BUILDER_SYSTEM_PROMPT.md` fully before responding. Treat the
> Constitution as locked; if my request conflicts with it, tell me
> directly instead of silently following my request. Use the
> Transparent Output Template on every response. Check `BUILD_ORDER.md`
> before writing any Control Plane or Portal code — that work is
> gated and may not be authorized yet."

## Why this pack exists

Across earlier sessions, different AI tools independently made
conflicting decisions (a database swap, a metric redefinition, a
scoring-formula change) without you confirming any of them, and one
session reported extensive "verified" work that can't actually be
checked from outside that session. This pack exists so the *next*
tool starts from decisions you've actually reviewed and made — not
from whatever the last tool happened to land on.
