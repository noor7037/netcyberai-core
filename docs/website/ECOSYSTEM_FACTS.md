# What the public website may say (supervisor, 20 Nov 2026, C532)

**Written by:** the supervisor. **For:** anyone editing the public website (src/app outside (school), (family), (admin),
(parent), api; src/components/home, showcase, marketing, content; src/content). **Delivers:** the facts the site states and
the rules it keeps. Where this file and the product disagree, the product wins: fix this file.

## 1. What NetCyberAI is now

One ecosystem, three connected apps on one validated record:

1. **School app** (principal, office, teacher): the school's records, attendance, homework, exams and report cards,
   fees, notices, reports, and the AI layer (Early Warning, Curriculum Gap, Learning Genome, Teacher Copilot, School
   Health Auditor). The status of every module comes ONLY from `src/content/module-status.ts` (checked against the app's
   registry by `scripts/check_module_status.py`). Never write "live", "available now" or "coming soon" for a module in
   prose; render the status from that file.
2. **NetCyberAI Family app** (child and parent), for any family, with or without a NetCyberAI school:
   - **AI tutor:** the child types, speaks, or photographs a book page or homework. The answer comes in the child's own
     language (English, Hindi, Hinglish). A concept is explained with pictures, simulations and short videos chosen for
     that topic. A sum is explained first, then solved step by step, ending with "Samajh aaya?". The tutor remembers the
     chat, so "samajh nahi aaya" re-explains the same problem another way. A child can also talk to the tutor on a call.
   - **Study:** interactive chapters with animated diagrams, labs and checks. Today: Classes 1, 2 and 3, and Class 10
     Science and Mathematics. More classes are being added. Never claim "every class" or "all subjects".
   - **English:** a spoken-English course in short daily lessons.
   - **Draw:** a drawing studio with guided templates tied to what the child studies; drawings stay on the phone.
   - **Future:** careers (step-by-step roadmaps), entrance exams, and scholarships and government schemes, each entry
     reviewed before families see it.
   - **Parent area:** the child's progress, daily limits and switches, consent, and the child's own data controls.
   - **School Link:** a family whose school uses NetCyberAI connects with a one-time code from the school and sees that
     child's attendance, homework, notices, marks and timetable, read under the school's own rules.
   - On the web at /family and as an Android app. Do not name an app store.
3. **Control** (NetCyberAI's own console): not marketed; never shown on the public site.

## 2. Parents and apps (replaces the old line)

Old, now wrong: "Parents never need an app or a login."
Say instead: "Parents need no app for school updates: they arrive on WhatsApp. Families who want more for their child at
home use the NetCyberAI Family app." WhatsApp sending still waits on each school's own WhatsApp number (show its status
from module-status.ts, never as live).

## 3. Rules every page keeps

- **No invented numbers.** No counts of schools, students, users, results, percentages or time saved. Numbers on a mock
  screen are example data and live only in `src/demo-fixture/**` (`scripts/check_claims.py` fails otherwise). Prices
  only from the pricing source; the Family app has **no published price** (say "Ask us about Family plans").
- **No names of other companies** (no competitor, no "Canva", no "Aqua", no app store).
- **Never mention** QR/NFC labels or hardware, Focus Lock, Digital Twin, Automation OS, Payroll, Career Graph as
  products (spec only).
- **Mock screens mirror the real product.** The principal dashboard mock (`src/components/showcase/principal/`) shows
  the real dashboard's sections (`src/components/dashboards/OfficeDashboardView.tsx`) with demo-fixture data. The Family
  app mock uses the Family app's own colours (warm paper, teal, saffron, plum; no dark blue).
- **Design and access:** tokens from `src/lib/design-tokens.ts` only; AA contrast (`scripts/check_contrast.py`); 44 px
  targets; works at 360, 390, 768, 1024, 1440 with no sideways scroll; motion off under prefers-reduced-motion.
- **SEO:** each new page has metadata through `buildMetadata`/`pageMeta` (`src/lib/seo`), is in `src/app/sitemap.ts` with
  a current date, and in `src/app/llms.txt` if it is a top-level page. `bash scripts/run_seo_audit.sh` passes.
- **Checks before a PR:** `npx tsc --noEmit -p .`, `python3 scripts/check_claims.py`, `python3 scripts/check_module_status.py`,
  `python3 scripts/check_contrast.py`, the mock/sample grep (ci_local step 7), and the tests under `test/` that name the
  files you changed.
