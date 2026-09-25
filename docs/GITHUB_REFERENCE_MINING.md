# GitHub Reference Mining

**Governs:** nothing — reference material only, per the founder's own instruction
(§9 of the 2026-09-24 handoff): "These repositories are REFERENCE MATERIAL. They
are NOT architecture authorities."
**Status: fully resolved, 2026-09-24 update.** The founder's local
`~/NetCyberAI-GitHub-References` folder was not reachable from this cloud
session directly (confirmed by checking `$HOME` and searching the
filesystem — it doesn't exist there). Four of the seven named repos were
initially found and cloned from public GitHub by guessing owner/repo
names from the handoff's phrasing (§1 below) rather than left unresearched.
The founder then pushed the actual folder to
`github.com/noor7037/NetCyberAI-GitHub-References` and it was cloned
directly and cross-checked against the earlier guesses: **all seven named
repos are present and match exactly** — `School-Management-Schema`
(Nahyomee), `School-Management-System` (TemiKayode),
`School_Management_System` (WangilaWakhongola), `core` (Gibbon, confirmed
via its README banner), `education` (Frappe Education, confirmed via its
README banner), `gegok12` (GegoK12), `openeducat_erp` (OpenEduCat,
confirmed via its README/LICENSE badge). The three earlier `[GAP —
NOT VERIFIABLE FROM THIS SESSION]` items in §3 are now closed: **no
duplicate TemiKayode directory exists** in the real folder, and neither
**Alisha1402** nor **RosarioSIS** are part of it — both were correctly
flagged as "not confirmed" rather than guessed present, and are now
confirmed genuinely absent, not merely unchecked. The per-repo findings in
§1/§2 below (license, stack, domain coverage) were verified against real
GitHub content before this folder existed and are unchanged by this
update — this folder's arrival confirms the founder's real reference set
matches what was already researched, it doesn't add new repos to mine.

---

## 1. Repos mined directly (cloned + read this session)

### TemiKayode/School-Management-System
- **URL:** https://github.com/TemiKayode/School-Management-System (found via GitHub search on the founder's named owner — matches "TemiKayode School Management System" from the handoff)
- **License:** README badge claims MIT. **No `LICENSE` file exists anywhere in the repo** (checked directly) and no `license` field in `package.json`. Treat as **unconfirmed** — a badge is not a license grant. Do not copy code on the strength of the badge alone; ask the repo owner or wait for an actual LICENSE file before reusing anything beyond reading for ideas.
- **Stack:** Next.js/Node 20, `docker-compose.yml`, Kubernetes manifests (`k8s/`), Nginx, a `services/` directory (microservices-leaning), multi-gateway payments (Stripe/PayPal/Flutterwave).
- **Claims requiring skepticism:** README states "Production-ready · 10,000+ concurrent users · P99 < 350ms" — an unverified, self-reported claim in a personal/portfolio repo (3 stars, 6 forks). **`COMPETITOR/REFERENCE MARKETING CLAIM` — not independently verified, not to be treated as evidence of real production traffic.**
- **Domain coverage (per README):** Admin/Teacher/Student/Parent dashboards, attendance, grades, fees, assignments, e-learning, timetable, transport, library, real-time notifications.
- **Relevance:** closest stack match to NetCyberAI of any repo mined (Next.js, not PHP/Django) — worth a closer read of its `frontend/` structure for UI/dashboard pattern ideas specifically, once the license question is resolved. Its microservices/K8s topology is **not** a reason to abandon our modular monolith (see Decision Log C43 — already decided).
- **Classification: REFERENCE ONLY** (license unconfirmed blocks ADOPT/ADAPT of any actual code; ideas/workflow only).

### WangilaWakhongola/School_Management_System
- **URL:** https://github.com/WangilaWakhongola/School_Management_System
- **License:** none found (no `LICENSE` file, no `license` field in any config file checked).
- **Stack:** Django 4.2 + Django REST Framework, PostgreSQL, JWT (SimpleJWT), Swagger UI (drf-yasg), `pytest.ini` present (has a real test suite — worth noting since NetCyberAI currently has none).
- **Domain coverage:** Accounts/JWT auth, Students, Teachers, Attendance (daily/bulk + summaries), Grades (bulk grading, auto-calculation, reports), Timetable (weekly slots), Fees (M-Pesa/cash/bank — Kenyan payment context), Library (inventory, issue/return, overdue fines).
- **Relevance:** PHP/Java aren't the only "wrong stack" — Django/Python is also architecturally distinct from Next.js/TypeScript, so same D1 reasoning applies: reference only, no code merge. Its **existence of a real pytest suite** for a solo/small project is the most useful single fact here — direct evidence that a test suite is normal practice even for hobby-scale school-ERP projects, reinforcing Gap G2 from `12_RECONSTRUCTION_INVESTIGATION.md`.
- **Classification: REFERENCE ONLY** (stack mismatch; no license to adopt code under anyway).

### Nahyomee/School-Management-Schema
- **URL:** https://github.com/Nahyomee/School-Management-Schema
- **License:** **MIT, confirmed directly in `composer.json`** (`"license": "MIT"`) — the one repo among the four with an actual machine-readable license declaration, though still no standalone `LICENSE` file.
- **Stack:** Laravel migrations + seeders only — no application code, just a database schema reference with an ERD image and a raw SQL dump. Explicitly designed to be read, not run as an app.
- **Domain coverage (schema only):** multi-tenant via `school_id` on every table (same pattern NetCyberAI already uses); School, Users (admin/teacher/student — no separate parent/guardian table noted), **Sessions, terms** (a first-class academic-session/term concept), Classrooms, subjects, attendance, Assessments, grades, Notices.
- **Relevance — the one genuinely useful cross-check:** this schema has a first-class **academic session/term** concept. NetCyberAI's own live schema does not — `academic_year` exists only as a text column on `fee_structures`, nowhere else (`classes`, `students`, `exams` have no session/term reference at all). See `DOMAIN_MODEL_COMPARISON.md` for the full comparison and why this is a real gap, not a stylistic difference.
- **Classification: ADAPT (schema concept only, not code)** — the session/term idea is worth NetCyberAI adding as its own migration; the actual Laravel migration files are not reusable (different ORM/schema-definition language) and not needed to be — the concept transfers, the code doesn't need to.

### Alisha1402/school-management-system
- **URL:** https://github.com/Alisha1402/school-management-system
- **License:** none found.
- **Stack:** MERN (MongoDB/Express/React 19/Node), 92 files, created/last touched 2026-09-02 — a very new, small project (0 stars).
- **Domain coverage:** explicitly India/CBSE-targeted — CBSE 10-point grading (A1–E), ₹-denominated itemized fee heads (Tuition/Admission/Examination/Computer/Annual), period-wise attendance, homework with deadline tracking and file uploads, notice board, grievance/leave desks.
- **Real flag, worth acting on:** the README explicitly lists **"Aadhaar records"** as a stored student field. NetCyberAI's own Constitution/Decision Log has an explicit, deliberate rule that **no Aadhaar image is stored** (Prompt F capture subsystem). This is a concrete example of a reference project doing something NetCyberAI has already correctly decided not to do — cited here as a **REJECT** pattern with reasoning, not merely skipped.
- **Classification: REFERENCE ONLY (domain/UX ideas), REJECT (Aadhaar storage pattern specifically)** — MongoDB (document store) also conflicts with Decision Log's own architecture reasoning (`01_CONSTITUTION.md` §4: relational integrity for money/consent/audit data, already decided against a document store after one prior AI session tried exactly this and was reverted).

---

## 2. Repos already mined in the prior investigation (PR #13, `12_RECONSTRUCTION_INVESTIGATION.md` §6) — not re-fetched here

Frappe Education (GPL-3.0), Gibbon (GPL-3.0), RosarioSIS (GPL-2.0), OpenEduCat (LGPL-3.0), GegoK12 (MIT) were independently verified directly against GitHub/LICENSE files in the prior investigation. Findings stand unchanged; see that document rather than re-deriving them here, per the founder's own "do not repeatedly reread everything" instruction.

---

## 3. Named repos originally reported as not found / not reachable — now resolved (§0)

At the time this section was first written, the founder's local folder was
unreachable and these four items were open questions. The folder has since
been pushed to GitHub and cloned directly (§0) — resolving all four:

- **"WangilaWakhongola School Management System"** — confirmed: the real
  folder's `School_Management_System` directory is exactly the repo found
  by username search. Not a different repository.
- **The duplicate TemiKayode directory** — confirmed **does not exist** in
  the real folder. Only one TemiKayode directory (`School-Management-System`)
  is present. The handoff's mention of a duplicate was either resolved by
  the founder before pushing, or referred to something else not present
  here — not a gap this session left unchecked, but not something to
  invent an explanation for either.
- **Alisha1402** — confirmed **absent** from the real folder, exactly as
  the handoff itself flagged ("not confirmed in the reference folder").
  It remains real and public on GitHub (§1) if ever wanted.
- **RosarioSIS** — confirmed **absent** from the real folder too. Already
  mined directly from GitHub in the prior investigation (§2) regardless —
  its absence from this folder doesn't remove it from the research.
