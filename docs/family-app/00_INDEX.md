# Family App programme (P7b, redefined by C230-H, revised by C230-I and C230-L)

**Status:** plan. Nothing here is built yet beyond C230-D's first parent home. Build starts with milestone M1 (`07`).
- **C230-H** (2026-10-18) set the shape.
- **C230-I** (2026-10-20) revised it after the founder's review:
  - the learning loop is dynamic, not a library;
  - English, careers and opportunities are full experiences;
  - one free subject per child;
  - a shared AI platform managed in Control;
  - a re-sequenced wave plan.
- **C230-L** (2026-10-20) reconciled the master prompt v2, the founder's mockups and his 10 features:
  - milestones M1–M7, learning loop first;
  - a binding feature map (`11`);
  - Control for every app and one content library (`10`).

**One sentence:** one parent-and-student app that helps any child understand school, practise until they have truly
understood, prepare for exams, improve their English and see where their subjects can lead, in the family's language,
and that adds the school's own information when the child's school uses NetCyberAI.

| File | What it settles |
|---|---|
| `01_RESEARCH.md` | Evidence on families' problems in India; video, voice, licence, career and provider facts; competitors; differentiators assessed |
| `02_PRODUCT.md` | Mission, users, the two modes, the learning loop, video, English, careers, opportunities, school information, syllabus, what is not built, gates, done, silent failures |
| `03_ARCHITECTURE.md` | Registry and entitlements, identity, School Link, data and storage, the Concept Resolver pipeline, the AI platform, the video finder, ingestion, opportunities and careers data, consent, Control, boundaries |
| `04_HOSTING_AND_SCALING.md` | Same deployment and database now (functions in Mumbai), upload retention, video quota, voice; when and how to split later |
| `05_MONETIZATION.md` | Rules, free and Plus, models assessed, price hypothesis, unit economics including voice |
| `06_PROJECT_STRUCTURE.md` | Where every file goes, naming, ownership, the tests each slice brings |
| `07_EXECUTION_WORKFLOW.md` | Waves FA-1, P-AI, FA-2 to FA-7 with dependencies; the loop; gates; content operations; release; incidents |
| `08_PROMPT_FRAMEWORKS.md` | Build prompts any AI coding tool can follow; the app's product prompts per profile |
| `09_EXPERIENCE_DESIGN.md` | Learning first with engagement as its servant; the visual identity; the 3D and motion policy; performance budgets; patterns from ten leading products; the banned list and the design review gate |
| `10_CONTROL_AND_CONTENT.md` | What Control may change (never code); Control → Apps for the Teacher app, school web and Family app; credentials; the central content library that schools, linked and standalone families share |
| `11_FEATURE_MAP.md` | Every planned feature (38) with its verdict, what is built, its milestone and its money class |
| `mockups/` | The founder's four mockup boards: the reference for look and scope, never for facts |
| `prototype-audit/` | The weekend prototype's audit: a list of failures to prevent, not a source |

## Decisions in brief

1. **One app, two modes** (kept): any family gets the learning loop, English, careers and opportunities; linked
   children also get their school's information.
2. **Family accounts are global**, with their own session and cookie (kept).
3. **School Link** by a single-use school-issued code; school data read as the guardian through the existing parent
   rules; unlinking ends access at once (kept).
4. **`family` and `content` schemas**, no foreign key into the school schema (kept). Raw uploads live in storage with
   short retention, never in the database.
5. **Learning is dynamic (C230-I):**
   - the Concept Resolver ("Understand") assembles a response from typed blocks (explanation, worked example,
     diagram, graph, timeline, map, vetted simulation, video, checks, practice, English moment, sources);
   - the model fills data, our components draw it;
   - numbers are recomputed and links come from an allowlist;
   - frequent topics are reviewed and cached.
6. **Mastery, not completion:** checks and practice drive a misconception-to-mastery loop; a topic is mastered after
   correct answers on two days a week apart.
7. **Video** is found per topic from provider metadata and shown inside the response, with an honest note that the
   provider may show ads and suggestions; the response never depends on it.
8. **English:** a free 3–5-line English moment in responses, and a paid 90-day programme with assessed progress. **No
   fluency guarantee**: measured gains on days 0, 45 and 90 instead. The voice practice partner is a costed pilot
   after launch.
9. **Careers and opportunities** run on vetted data with sources and dates: pathways cannot invent a step,
   opportunities say "likely eligible" with conditions, and stale items are hidden.
10. **Money:** school information is always free; the learning loop is free for one subject per child; Plus (or a
    school's sponsorship) adds every subject, custom syllabi, the English programme and higher limits.
11. **One AI platform for all of NetCyberAI**, built before the learning loop (P-AI):
    - adapters per capability and profiles per feature;
    - credentials sealed and managed in Control, with routing, fallbacks, prompt versions, budgets and health;
    - a minors check;
    - Copilot and Parent AI move onto it.
12. **Supersedes:** docs/31's WhatsApp-code first step; C230-D's founder-made logins become family accounts; the
    library-first study core of C230-H.
13. **Milestones M1–M7 (C230-L):** the learning loop first (M1, M2), then the school connected (M3), the future (M4),
    the lifetime record (M5), English (M6), Plus and launch (M7).
14. **Control runs every app (C230-L):** versions, flags with audiences, kill switches, banners, health and usage for
    the Teacher app, school web and Family app; sealed credentials; never code, never a child's data.
15. **One content library (C230-L):** syllabus and topic packs uploaded and reviewed once in Control; schools adopt
    it, linked families read it through their school, standalone families read it directly.

## What needs the founder

| # | Input | Blocks |
|---|---|---|
| 1 | Lawyer: privacy notice, consent method (Rule 10), transient processing of textbook photos, disclaimers on careers and opportunities, and whether the mastery loop is "behavioural monitoring" (`02` §14, L1–L2) | Public launch |
| 2 | An AI provider whose current terms allow use by children, with zero retention where required; its key; monthly caps (L3). The supervisor recommends the platform's existing Copilot provider (C230-L); the key is entered in Control → AI once M1 ships it | Real responses; M1's done gate |
| 3 | Reviewers: subjects (promoted responses), opportunities, careers, English (L4) | Content going live; coverage grows only as fast as reviewers can keep it true |
| 4 | The practice partner's default daily limit, and whether it sits in Plus or is an add-on, once its cost is measured (`05` §5) | The voice pilot |
| 5 | Licences: PhET for commercial use; GeoGebra or Desmos only if wanted and licensed (L7) | Simulation blocks |
| 6 | The product's name; the pilot state for opportunities; whether recruitment notices are in scope | Naming, opportunities scope |
| 7 | Whether pilot schools want exam transparency (scanned scripts and re-evaluation requests) | That after-launch wave |
| 8 | The live server key (roadmap action 8) | Uploads and logins on the live site |
| 9 | Later: a payment gateway; a Google Play account if the store listing is chosen | FA-6, FA-7 |
