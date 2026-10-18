# Family App programme (P7b, redefined by C230-H)

**Status:** plan, decided by the supervisor on 2026-10-18 from the founder's brief and five planning notes, checked
against the code. Nothing here is built yet beyond C230-D's first parent home. Build starts with wave FA-1 (`07`).

**One sentence:** one parent-and-student app that helps any child understand school and prepare for exams in the
family's language, and that adds the school's own modules when the child's school uses NetCyberAI.

| File | What it settles |
|---|---|
| `01_RESEARCH.md` | The evidence on parents' and students' problems in India, with sources, and what to avoid |
| `02_PRODUCT.md` | Mission, users, the two modes, every feature, what is not built, launch gates, definition of done |
| `03_ARCHITECTURE.md` | The module registry, family accounts, School Link, the `family` and `content` schemas, AI, consent, Control, boundaries |
| `04_HOSTING_AND_SCALING.md` | Same deployment and database now (functions in Mumbai), and when and how to split later |
| `05_MONETIZATION.md` | What the app may earn without conflicting with the school business, and what is rejected |
| `06_PROJECT_STRUCTURE.md` | Where every file goes, naming, ownership, the tests each slice brings |
| `07_EXECUTION_WORKFLOW.md` | Waves FA-1 to FA-6, the loop per wave, gates, content operations, release, incidents |
| `08_PROMPT_FRAMEWORKS.md` | Build prompts any AI coding tool can follow, and the app's own product prompts |

## Decisions in brief (C230-H)

1. **One app, two modes:** a standalone study core for every family; school modules only for children linked to a
   NetCyberAI school.
2. **Family accounts are global**, separate from school users, with their own session and cookie.
3. **School Link** by a single-use code the school office issues (WhatsApp code later); school data is read as the
   guardian through the existing parent rules; unlinking ends access at once.
4. **Two new schemas**, `family` (family-owned, keyed to the account) and `content` (catalog and reviewed library, no
   personal data), with no foreign key into the school schema.
5. **Reviewed library first, AI on top:** explainers and question banks are reviewed before any family sees them;
   doubt help is hint-first, marked as AI, cleaned of personal details, metered and capped.
6. **Control runs it all:** flags, AI spend, review queues, counts; no browsing of children's data.
7. **Hosting:** the same Vercel project (functions moved to Mumbai, #193) and the same Supabase project now; built so
   the app and then its data can move out without a rewrite.
8. **Money:** families never pay for their own school's data; Family Plus and school-sponsored Plus only after the
   pilot shows retention; no ads, data sales, loans or sales calls.
9. **Supersedes** docs/31's sign-in by WhatsApp code as the first step, and C230-D's founder-made logins, which become
   family accounts. docs/31's slices 11b–11g stay as the school modules.

## What needs the founder

| # | Input | Blocks |
|---|---|---|
| 1 | Lawyer: privacy notice, consent words, the parental-consent method; whether adaptive practice is "behavioural monitoring" for a non-school company (`02` §7 L1–L2) | Public launch of the standalone mode |
| 2 | An AI provider, key and monthly cap (C235) | Real explainers and doubts (the stand-in runs until then) |
| 3 | Reviewers for the first library (teachers he trusts) | FA-3's content going live |
| 4 | The product's name, and whether it stays under netcyberai.com | Stage 2 domain (`04`) |
| 5 | The live server key (roadmap action 8) | Uploads and logins on the live site |
| 6 | Later: a payment gateway for subscriptions; a Google Play account if the store listing is chosen | FA-6 |
