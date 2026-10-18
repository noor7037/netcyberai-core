# 32 · C235 Ecosystem UI programme: research, decisions, feasibility, status

Founder request (2026-10-15): a premium redesign of every interface (Control, principal and school dashboards, the
teacher's phone use of /app, the parent app), with less text; the full class range LKG–12 with sections A–C kept in
step everywhere; bulk upload and download; a branded sticky header; school branding at onboarding and in Settings;
navigation organised like the founder's reference screenshots; documents on profiles; data export; and feasibility
reports for Google storage and a Gemini assistant. The founder gave the lead full discretion ("take any best
decision"). This file is the one place for what was decided, why, and where each part stands.

## 1. Design research (what the decisions rest on)

**Colour.** Studies of colour and learning are few and context-bound; the dependable guidance is functional, not
emotional: colour carries meaning only when it is consistent, it is never the only signal (WCAG 1.4.1), text keeps
its contrast, and calm surfaces with colour reserved for meaning lower the visual load of a dense admin tool. So:
- One tone per module category (the logo palette's tokens), used for the page banner and icon chips: the founder's
  reference app does the same and it gives wayfinding without words.
- Status colours fixed app-wide: green = done or present, amber = needs attention, red = overdue or an error, blue =
  information and primary action. Each always has an icon and a word as well.
- Surfaces: tinted off-white page, white cards, a translucent sticky header (Apple's "materials"), soft shadows,
  12–16 px radii, an 8 px spacing grid, large clear page titles.

**Accessibility (WCAG 2.1 AA, the standard the app is held to).**
| Criterion | What it means here |
| --- | --- |
| 1.4.3 / 1.4.11 | Text 4.5:1 (large 3:1); input borders, checkbox outlines and focus rings 3:1 against their background (checked by `scripts/check_contrast.py`) |
| 1.3.1, 3.3.2, 2.5.3 | Every field has a real label that stays visible; the accessible name contains the visible label |
| 1.4.1 | Colour never alone: icon + word with every status colour |
| 2.4.7 | A visible focus ring on everything focusable |
| 1.4.10 | Reflow down to 320 px wide with no sideways scrolling (harness checks 390 px) |
| 4.1.2 | Custom checkboxes, radios and switches keep the native input underneath |
| Motion | All motion off under `prefers-reduced-motion` (house rule, beyond AA) |
| Targets | 44 px minimum (Apple HIG's 44 pt; WCAG 2.2's 24 px AA minimum is met with room) |

**Educational administration UX.** Task-first home (My Day) over menus; one primary action per screen; progressive
disclosure (the explanation behind an ⓘ, not on the page); identity always visible (which school, who is signed in,
in what role); bulk work through preview → validate → commit with a per-row error list; bilingual (English, Hindi);
phone-first for teachers and parents; low-bandwidth and offline-tolerant for teachers.

## 2. Decisions that change the request (lead, on the founder's grant of discretion)

1. **Floating labels, not placeholder-only labels.** "Replace labels with placeholder text that clears when typing"
   fails WCAG 1.3.1 and 3.3.2 (the label disappears; placeholder grey usually fails 4.5:1). The label sits inside the
   field where a placeholder would be and slides to the top border when the field is focused or filled; it never
   disappears. Secondary text goes under the field. This gives the clean look asked for and stays accessible.
2. **"30% less text" is measured, not estimated**: words visible in `<main>` on a fixed set of 11 harness screens,
   before and after, by a script the lead can rerun.
3. **SVG logos are converted to PNG in the browser.** An SVG can carry script. The picker accepts JPG, PNG and SVG
   up to 5 MB; the browser draws it to a canvas, scales to at most 512 px and uploads PNG/WebP; the server accepts
   only PNG, JPEG or WebP by their first bytes. No SVG is ever stored or served.
4. **Documents stay on Supabase Storage for now** (section 4). Google Cloud Storage is kept behind the existing
   storage interface for later.
5. **Privacy law.** FERPA and COPPA are United States laws; they bind US schools and US-directed services. Indian
   schools are bound by the Digital Personal Data Protection Act 2023 and its 2025 Rules (children's data needs
   verifiable parental consent; no tracking or targeted advertising of children). The app is built to the DPDP Act
   and follows FERPA's principles (school-controlled records, role-based access, audit of every view of a document).
6. **The class range** is the full Indian K-12 ladder: Nursery (where a school has it), LKG, UKG, 1–12, sections
   A, B, C as the standard set a school adds in one action; a school can still add or rename its own.

## 3. Slices and status

| Slice | Scope | Status |
| --- | --- | --- |
| C235-A | Standard classes LKG–12 × A–C in one action; one class order everywhere; consistency audit; bulk class upload/download; 10,000-row proof of the student bulk import | Merged (C235-A); the demo school has the 42 classes |
| C235-B | Sticky branded header (school logo + name, person's name + role); school branding in Settings (principal, school admin only) and at onboarding in Control; safe logo upload; navigation: Home → Frequent work → All modules by category | Merged (C235-B); migration on both databases |
| C235-C | Design system v5: floating-label inputs, custom checkbox/radio/segmented control, gradient page banner per module category, KPI icon chips; at least 30% fewer words on 11 key screens | Merged (C235-C, #178): 59% fewer words (7,490 → 3,046) |
| C235-D | Documents on staff and student profiles (PDF/JPG/PNG, 10 MB, versions kept, role-based access, every view audited); export of students, staff and classes as Excel (.xlsx) and CSV | Merged (C235-D, #178); migration on both databases; the staff profile to the founder's reference (nine tabs, staff code, designation, employment, photo, ID card, biodata): C238 (#183), migration on both databases |
| C235-D2 | Papers up to 10 MB sent straight from the browser to storage (ask, send, confirm), checked on arrival; bucket raised to 10 MiB | Merged (C235-D2, #179) after a security review (one medium finding fixed: only the checked bytes are kept); bucket migration on both databases. Live uploads wait on founder action 8 (`16` §5). The scheduled sweep of unconfirmed uploads (D3): C237 (#182), hourly, migration on both databases. A wrong or missing server key now shows as a red line and in `/api/health`: C236 (#181) |
| C235-E | Feasibility: document storage (section 4) and the AI assistant (section 5) | This file |
| C235-F | The redesign carried into every remaining module screen (each screen adopts the v5 components) | Built, awaiting merge: part 1, the teaching screens, C239 (#185); part 2, the office screens and Control, C240 (#184). Visible words in `<main>` on the 103 screens of the two parts fell 33% at 1440 px (42,921 → 28,632) and 32% at 390 px (44,780 → 30,271): teaching 32% and 31%, office 35% and 34%, Control 32% and 32% |

## 4. Feasibility: document storage (Google Workspace / Google Cloud Storage)

**Today.** Documents live in Supabase Storage, in one private bucket, reached only through one module
(`src/lib/capture/storage.ts`) with the service role, under a per-school path, handed out as 10-minute signed links.
Student documents already use it (8 MB limit). It sits in the same project as the database, so the audit trail and
the access rules are one system.

**Google Workspace does not include Cloud Storage.** A Workspace subscription covers Drive, Gmail and so on per user.
Google Cloud Storage is billed separately through a Google Cloud billing account. Drive is not a fit for application
records: files belong to user accounts, sharing is per person rather than per role, and the API has per-user quotas.

**What Google Cloud Storage would need.** A Google Cloud project with billing; a bucket in `asia-south1` (Mumbai) for
Indian data residency; a service identity for the app, ideally Vercel's OIDC federation to Google so no long-lived
key is stored; a storage backend behind the existing storage interface (one slice); a one-time copy of existing
files; and the same signed-link pattern. Cost per GB is of the same order as Supabase's overage price; the gain is
not cost.

**Recommendation.** Keep Supabase Storage. Move to Google Cloud Storage only if (a) storage passes the Supabase plan's
included quota by a margin that makes Google cheaper, or (b) a school or the law requires Google-hosted or
India-region storage that the Supabase project cannot give. Either way the switch is one slice because every file
goes through one module.

**Founder input needed only if switching:** a Google Cloud project with billing and permission for the app's
identity on one bucket.

## 5. Feasibility: an AI assistant on every platform (Google Gemini)

**What exists.** One door to any language model (`src/lib/ai/provider.ts`): a request type that cannot carry a
student, guardian or phone number, metering and a monthly limit per school; Teacher Copilot and Parent AI are built
on it and run on a stand-in until a key is set.

**A Gemini subscription is not an API key.** A Gemini Advanced / Google One AI plan is for a person in the Gemini
app; it gives no API access. The app needs either a Gemini API key (Google AI Studio, billed per use) or Vertex AI in
a Google Cloud project (billed per use, region selectable; `asia-south1` keeps data in India and comes with Google
Cloud's data-processing terms). The lead recommends **Vertex AI in asia-south1**; check Google's current terms that
prompts are not used for training before switching it on.

**Design.**
- The assistant is one more request kind through the same door, with three layers:
  1. **Help** (no school data): answers how-to and troubleshooting questions from the app's own help text, module
     notes and guides.
  2. **Read-only facts** (staff): the model never queries the database. It may ask for one of a fixed list of
     server-side tools ("absent today in my classes", "fees overdue this month", "who teaches 7-B maths"); each tool
     runs under the asker's own session, through the same row rules as the screens, and returns counts or the
     rows that person could already open. Nothing it receives is new to that person.
  3. **Parents** (later): only their own children's facts, after the consent purpose for AI is decided (brief O6).
- No tool writes anything. Tool output is treated as data, never as instructions. No Aadhaar, phone number or
  address is ever passed in. Every question and answer is metered and kept for the school's audit for a set time.
- Role boundaries are a tool allowlist per role, tested like the route guards.

**Plan.** Layer 1: one slice. Layer 2: two slices (tools, then the chat screen on staff pages and Control). Layer 3:
one slice after the consent decision. Each slice is one PR with tests.

**Founder input needed:** (1) choose Vertex AI (recommended) or an AI Studio key; (2) set the key or the project in
Vercel himself (no one else handles it); (3) a monthly spend limit; (4) approve the tool list per role; (5) the
consent wording for parents' use (layer 3).

## 6. WhatsApp: where it stands (2026-10-15)

Code: the account form strips spaces and line breaks from pasted values, checks each field as it is typed, makes the
verify token, and shows the callback URL with a copy button (C230-B, C230-D); live since #172/#173.
Data: the live database holds no saved WhatsApp account, no save attempt in the audit log and no event from Meta.
So nothing has been saved since the fix. Checked again later the same day: still no saved account, audit row or Meta event. The founder did add WhatsApp values to Vercel's production environment early on 15 October (a system-user token, the phone number id and the business account id), and the encryption key `MESSAGING_CREDENTIALS_KEY`. The key is what the app needs, and with it saving now works. The three WhatsApp values are not read by the app: credentials are only ever read from the account saved in Control, encrypted with that key (`src/lib/whatsapp/credentials.ts`). So the same three values have to be pasted into Control → WhatsApp account and saved; after that the three Vercel entries can be deleted, so the token lives in one place. What is left is the founder's: save the account in Control → WhatsApp
account, paste the callback URL and verify token into Meta and verify, then test the connection; the long-lead Meta
Business verification and rotating the token that was exposed earlier also stay with him.

## 7. Change log
- 2026-10-15: written (lead). Slices A–C started in parallel worktrees (C198 model); D queued after A.
- 2026-10-15: A and B merged together after the full gate on their stack (two tests updated to the slices' intended changes).
- 2026-10-15: C and D merged together (#178) after the full gate and a security review of D (no high or medium finding; the erasure audit row now counts removed documents). D2 built; the `documents` bucket raised to 10 MiB on both databases.
- 2026-10-15: D2 merged (#179). Found while checking it: the live site's server key belongs to the production project, so logins, invites and every upload fail live until the founder replaces it (`16` §5 action 8).
- 2026-10-18: wave C236 (lead and three agents): C236 storage health and the red line; C237 the hourly sweep of unconfirmed uploads; C238 the staff profile; C239 and C240 the redesign on the teaching, office and Control screens (#181–#185, a stack on `main`), with the close-out (C241: screenshots, the three C232 screens, these docs). Not covered by F: Timetable (not in either part), the placeholder modules (Marks, Teacher Impact, My Impact, Recognition) and Academics.
