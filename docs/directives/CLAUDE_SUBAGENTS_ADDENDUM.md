# Claude Code Addendum — Sub-agents, Model Mix, Conflict Resolution & Reuse

**Applies to:** every Claude Code run executing  
[`CLAUDE_CONTENT_LAYER_DIRECTIVE.md`](./CLAUDE_CONTENT_LAYER_DIRECTIVE.md) and/or  
[`CLAUDE_FAMILY_AI_HUBS_REDESIGN_DIRECTIVE.md`](./CLAUDE_FAMILY_AI_HUBS_REDESIGN_DIRECTIVE.md)  
(and any future Family/content scaffolding directives that link here).

**Relationship to repo root [`CLAUDE.md`](../CLAUDE.md):**  
Keep and follow existing **Working efficiently**, **Token discipline**, and **Parallel agents** sections. This addendum is **additional** — it does not replace them. Where this file is more specific for these two directives, follow this file; where `CLAUDE.md` is stricter on safety (auth/RLS/money/messaging/children’s data), keep that stricter bar.

---

## Sub-agents (capacity)

- The lead session may launch **up to five or six** sub-agents depending on work complexity (extends the “at most 5” guidance in `CLAUDE.md` **only when** parallel slices are truly independent and the sixth is needed to finish faster without thrashing).
- Prefer **fewer, well-briefed** agents over the maximum. Do not spawn agents to re-read, explain, or re-check work already done.
- Each sub-agent gets a **tight brief**: slice goal, exact files it may touch, docs section, acceptance test, and what it must **not** touch.
- Run in parallel **only** what does not collide (separate modules/screens/files). Same tables, shared components, or the same route stay in **one** agent.
- Migrations, Decision Log numbers, shared roadmap docs, and PR stack order stay **serial**, lead-owned (per `CLAUDE.md`).

---
---

## Testing phase — no premature restrictions (mandatory)

**Current stage is Founder testing.** Do **not** add unnecessary security guardrails, rate limits, compliance blocks, age/model-policy hard-blocks, or other restrictions that would prevent high-quality output or block the Founder from inserting, exchanging, and testing **any** API key from the Control Panel (`/control/ai`).

- Prioritize **high-quality product output** and **founder freedom to configure providers** over premature lock-down.
- Still: keep secrets **server-side / sealed** (never ship keys to the client, logs, or HTML) — that is basic credential hygiene, not a “block testing” guardrail.
- Still: no production migrate/deploy/paid spend without Founder sign-off.
- Still: never fake a live successful provider response.
- After testing, the Founder will instruct Claude Code **step-by-step** to set boundaries. Do not invent those boundaries now.
- Aligns with and **makes explicit** the existing no-preemptive-restriction / no hardwired provider-block rules for this testing phase.

## Model mix (Sonnet / Opus / Haiku)

Assign different sub-agents to **Haiku**, **Sonnet**, and **Opus** to save tokens and time — **without compromising output quality or work quality**.

| Model | Use for |
|-------|---------|
| **Haiku** | Mechanical work: i18n key slots, empty stub JSON, docs inventory lines, renames, screenshot harness for unchanged patterns, boilerplate route stubs that mirror an existing file |
| **Sonnet** | Ordinary product slices: a screen shell, a route, a loader, a test suite, CSS/SVG hub shells, wiring flags |
| **Opus** | Auth, RLS, Storage tenancy, children’s data, AI tutor conversation safety, schema design that spans modules, conflict resolution that changes architecture, the one security/code review pass when required |

**Hard requirement — no quality compromise:**  
If a cheaper model would degrade quality for a given sub-task, **use the stronger model**. Do not “save tokens” by shipping weak types, weak RLS, incomplete acceptance criteria, ChatGPT chrome, invented pedagogy/copy, or half-integrated UI. Token savings come from tight briefs, reuse, and parallel independent slices — **never** from accepting worse work.

---

## Conflicts & full platform access

Claude Code has **end-to-end access** to this repository and has built much of the platform to date. When directives conflict with each other, with `CLAUDE.md`, or with the **existing codebase**:

1. Prefer **preserving working product behaviour** and **additive** changes (flags, adjacent routes, shared components).
2. Prefer **reuse** of existing components, libs, patterns, and paths over new parallel implementations.
3. Prefer the **CTO-locked decisions** inside the Family AI / hubs directive and the **no content generation** rule inside the content-layer directive over generic prompt fluff.
4. Otherwise resolve using the **best engineering approach you deem fit**, document the decision in the Report back (and Decision Log when the change is lasting), and do not block waiting for re-litigation of already-locked CTO calls.

---

## Reuse first (time & tokens)

- **Reusable components must be reused from existing locations** (`src/components/family/**`, `src/lib/family/**`, `VoiceInput`, `ProgressRing`, `FamilyHeader`, English course checkers, catalog loaders, module flags, i18n patterns, etc.).
- Before creating a new file, **search** for an existing one to extend or compose.
- Mirror hand-rolled checkers (e.g. English `course.ts` / `blocks.ts`) rather than introducing new stacks (e.g. Zod) unless justified in the report.
- Empty shells + loaders + flags beat inventing a second design system.

---

## Targeted reads only (mandatory — main agent + all sub-agents)

Claude Code **already built this platform end-to-end**. Rely on existing knowledge of the repo structure and the **Repo anchors / map** sections in these directives.

- **Do not** unnecessarily read the entire codebase, run broad tree walks, or re-read files already established this session.
- **Do not** waste time or tokens on redundant full-codebase scans (`find`/`rg` over the whole repo “just in case”, dumping large files, re-opening unchanged docs).
- **Do** use **targeted reads** of only the paths needed for the current slice (grep first for a symbol, then the few lines you will change and what they call).
- This applies to the **lead/main agent and every sub-agent**. Sub-agent briefs must list the exact files allowed; agents must not explore the whole repository.
- Aligns with root [`CLAUDE.md`](../CLAUDE.md) Token discipline (“Read narrowly”, “Build from what the founder reported”, “Never repeat work”) — this restates it as hard for these directive runs.

---

## Report note

In the final Report back for either directive, include one short block:

- Sub-agents used (count ≤ 6) and model per agent  
- Any conflict resolved and the approach chosen  
- Existing components reused (paths)
- Confirmation: no full-codebase scan; only targeted paths read
