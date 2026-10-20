# 06 — Project structure

**Revised 2026-10-20 (C230-I):** the AI platform, the Concept Resolver, blocks, the video finder, ingestion,
opportunities, careers and English.

Everything lives in netcyberai-core. New paths are marked **new**; the rest exist today.

```
src/
  app/
    (family)/family/                 pages of the family app (exists: layout, home from C230-D)
      layout.tsx                     family shell: header, child switcher, bottom bar
      page.tsx                       home: module cards from the registry, per child
      sign-in/ consent/ children/    new: account, consent, child profiles
      learn/ [childId]/…             new: Understand (the Concept Resolver), checks, practice, mastery, plan, past papers
      english/ careers/              new: the English programme; the pathway explorer
      vault/ opportunities/          new: the Learning Vault; opportunities and readiness
      school/ [childId]/…            new: connected modules C1–C9
      link/                          new: redeem a school's connect code
      account/                       new: language, consents, sign out, delete account
    api/family/**                    new: one route per action; every route checks the family session
    (admin)/control/family/**        new: Control → Family (03 §12)
    (admin)/control/ai/**            new: Control → AI, platform-wide (03 §7)
    (school)/app/students/…          exists; gains "Family app code" on a guardian (School Link issue)
  lib/
    family/                          family business code (exists: home.ts)
      modules.ts                     new: the module registry (03 §2)
      accounts/ consent/ children/   new
      resolver/                      new: ingest, context, plan, generate, verify (03 §6)
      blocks/                        new: one JSON schema per block type
      learn/                         new: progress, mastery loop, plan, past papers, weekly summary
      syllabus/                      new: catalog reads, family upload extraction and confirmation (03 §9)
      video/                         new: the video finder over the video_search adapter (03 §8)
      english/ careers/              new
      vault/ opportunities/          new
      school/                        new: C-modules, through SchoolLink only
      privacy/                       new: the text pre-processor for AI calls (names, numbers, contacts, 12-digit runs)
      db.ts                          new: opens a family-account context (app.current_account_id)
    contracts/
      school-link.ts                 new: the SchoolLink interface and its types
      family-*.ts                    new: typed contracts the screens are built against (CLAUDE.md "contracts first")
    school-link/
      in-process.ts                  new: SchoolLink over the parent tenant context (03 §4)
    ai/                              exists as provider.ts; becomes the AI platform (P-AI):
      adapters/                      text, vision, speech, voice, embeddings, video_search
      profiles.ts                    feature profiles with routing, fallbacks, limits, minors flag
      prompts/<profile>/<v>.md       product prompt text, versioned (08 §7)
      credentials.ts                 sealed provider credentials (the WhatsApp and payments pattern)
  components/
    family/                          new: family UI parts on the v5 system
      blocks/                        new: one renderer per block type (KaTeX, Mermaid strict, plotter, geometry, timeline, map)
supabase/migrations/
  <version>_family_<slice>.sql       new: schemas family and content, one migration per slice
public/
  family/manifest.webmanifest        new
  family-sw.js                       new: scope /family, never caches /api
scripts/
  check_family_boundary.py           new: the import, SQL and vendor boundary (03 §14); runs in ci_local.sh and CI
test/
  family/**                          new: PGlite tests with every migration, as app_user with a family session
docs/family-app/                     this programme
```

## Naming

| Thing | Rule |
|---|---|
| Tables | `family.<plural noun>`, `content.<plural noun>` |
| RLS setting | `app.current_account_id` for family sessions; school reads use the existing tenant settings |
| Message keys | `fam.<area>.<key>` in `en.ts` and `hi.ts`, each area's keys kept together |
| Jobs | `family.<job>` |
| Env variables | `FAMILY_<NAME>`; AI credentials are not env variables but sealed rows managed in Control |
| Audit actions | `family.<action>`, with ids and counts only (C56) |
| Decision Log rows | the next free C-number, reserved by the lead before agents start |

## Ownership

| Area | Owner |
|---|---|
| Migrations, the registry, `check_family_boundary.py`, the shells, shared docs, the stack order | The build lead (one session) |
| One slice's files | The agent the lead assigns, as `07` §3 says |
| Review, the full gate, both databases' parity, merge, production check | The supervisor |
| Content publishing, prices, legal gates | The founder (with reviewers he appoints) |

## Tests every slice brings

- RLS: a second account reads and writes nothing of the first; a staff session reaches no family API; a family session
  reaches no staff API.
- For connected modules: an unlinked child shows nothing; another school's data never appears.
- For AI paths: the pre-processor test; the block-safety test (script in every field renders as text); the minors
  check refuses an unmarked provider; the cap reached shows the message; numeric steps recomputed.
- Screens: harness pictures at 360, 390 and 1440 px; English and Hindi; reduced motion.
