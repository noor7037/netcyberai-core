# NetCyberAI

WhatsApp-native Student Learning Monitoring & Parent Engagement Engine
for Indian schools. This repository holds the whole product:

- **The school platform** (`src/app/(school)`): principal, teachers and the
  office: students, attendance, fees, exams and AI marking, papers, the
  timetable, WhatsApp messages and notices.
- **The Family app** (`src/app/(family)/family`): one app for parents and
  children: the Study tutor with memory and visual answers, Understand,
  English, Future hubs, the parent area, School Link, offline packs. Also an
  Android shell (`android/`).
- **Control** (`src/app/(admin)/control`): NetCyberAI staff only: schools,
  onboarding and one-click provisioning, Leads, the AI gateway and Quality
  Lab, the content library and its coverage, billing, monitoring.
- **The public site** (`src/app`): marketing pages, the demo, pricing,
  verification pages.

**Where it stands today:** [`docs/00_CURRENT_MILESTONE.md`](docs/00_CURRENT_MILESTONE.md)
(the current milestone, what is live, what is next, the launch blockers).
Decisions and their reasons: [`docs/10_DECISION_LOG.md`](docs/10_DECISION_LOG.md).
The plan: [`docs/16_MASTER_ROADMAP.md`](docs/16_MASTER_ROADMAP.md). The
reading order for a new session: [`docs/00_START_HERE.md`](docs/00_START_HERE.md)
and [`CLAUDE.md`](CLAUDE.md).

**Running the checks:** `bash scripts/ci_local.sh` runs the same steps as
`.github/workflows/checks.yml` (typecheck, tests, the checkers in
`scripts/`). Run it once before a push; while building, run `npx tsc --noEmit -p .`
and the tests of the files you changed.

## Stack

Next.js 14 (App Router, standard Vercel output — not static export),
TypeScript strict, Tailwind, Postgres (Supabase) with row level security. See
[`docs/03_ARCHITECTURE_PLAIN.md`](docs/03_ARCHITECTURE_PLAIN.md) for
the reasoning in plain language.

## Running locally

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run build         # production build
npm start              # serve the production build
npm run typecheck      # tsc --noEmit
```

`NEXT_PUBLIC_WHATSAPP_NUMBER` is optional — it defaults to the number
already configured in `src/lib/site-config.ts` if unset.

`.claude/launch.json` is intentionally tracked (not gitignored) — it's
shared dev-preview tooling (`npm run dev` on port 3000), not a personal
config. Keep it that way: no absolute paths, no host names, no
credentials, nothing that only works on one machine. Check its content
before every commit that touches it, the same way you'd check any
other tracked file.

## Where things live

| Path | What it is |
|---|---|
| `src/app/` | Pages and API routes (App Router): the public site, `(school)`, `(family)`, `(admin)/control`, `api/` |
| `src/lib/` | Logic by module: `family/`, `ai/`, `content/`, `fees/`, `marking/` and more; `contracts/` holds the typed shapes screens are built against |
| `supabase/migrations/` | The database, one migration per change |
| `docs/` | The plan, the Decision Log and the module specs; `docs/family-app/` for the Family app |
| `scripts/` | `ci_local.sh`, the checkers and the screenshot harness |
| `src/components/` | UI, layout, content, and demo components |
| `src/content/blog/` | Blog post data (`BlogPost` objects, see `contract.ts`) |
| `src/demo-fixture/` | The **only** allowlisted fictional data in the repo — used solely by `/demo` |
| `src/lib/site-config.ts` | Single source of truth for domain, contact info, WhatsApp number |
| `src/lib/seo.ts` | Single metadata/JSON-LD builder every page uses |

## Project rules this codebase follows

- **No invented data or numbers.** Every numeric claim in `src/`
  outside `src/demo-fixture/` must trace to a cited, dated source.
  `/demo` is the single allowlisted exception, and even there names and
  figures are fictional but plausible — never a real school.
- **No dummy data outside the fixture.** Enforced by CI (see below).
- **The Bridge Rule.** Overridden by Amendment 1 — the platform is
  authorized and built. Read [`docs/01_CONSTITUTION.md`](docs/01_CONSTITUTION.md)
  §6 and [`docs/08_EXECUTION_BIBLE.md`](docs/08_EXECUTION_BIBLE.md)
  before starting Control Plane or School Portal work, not because
  it's blocked, but because the build sequence and its gates
  (tenant isolation first, consent before messaging) matter.

## Verification

```bash
# No fabricated numeric claims outside the demo fixture
# (src/lib/recognition.ts is also excluded — its header comment cites the
# 85->90/40->55 percentages that prove the banned formula is inverted)
grep -rEn '[0-9]+%|₹[0-9]|\$[0-9]' src/ --include='*.ts' --include='*.tsx' \
  | grep -v 'src/demo-fixture/' | grep -v 'src/lib/recognition.ts'

# No mock/dummy/fake/sample data outside the demo fixture
# (src/lib/recognition.ts is also excluded — "sample-size" there is the
# statistical term in a guard-clause comment, not placeholder data)
grep -rn 'mock\|dummy\|fake\|sample' src/ --include='*.ts' --include='*.tsx' \
  | grep -v 'src/demo-fixture/' | grep -v 'src/lib/recognition.ts'

# No secrets committed
grep -rn 'sk_\|api_key\|SECRET\|PRIVATE_KEY' src/

npm run build && npm run typecheck

# SEO/AEO schema, metadata, and crawler-policy audit against a real
# build and server (docs/06_VISIBILITY_PROTOCOL.md). Builds, starts
# the production server, runs scripts/seo_audit.py, tears the server
# down either way.
npm run audit:seo
```

Each of these must produce no output (the grep checks) or exit 0 (the
build/typecheck/audit) before a change is considered done.
`.github/workflows/checks.yml` runs the same checks on every push and
pull request.

## Not yet done (manual, before the first real school)

These cannot be verified by an AI session and are not automated in CI:

- Lighthouse mobile audit (performance ≥90, accessibility ≥95) on a
  throttled 3G profile, via Chrome DevTools — not a desktop-broadband
  run.
- A real budget Android phone test — devtools emulation misses font
  rendering and tap latency.
- Legal review sign-off on `/privacy` and `/terms` (both are marked
  "Draft — pending legal review" on the pages themselves until this
  happens).
- Re-verifying every WhatsApp cost figure against Meta's live INR
  pricing card immediately before publish, even though none is
  currently hardcoded (see `src/lib/site-config.ts` and the fee-recovery
  feature page for how this is handled without a fixed number).
- The production database cutover before the first real school
  ([`docs/18_PRODUCTION_CUTOVER.md`](docs/18_PRODUCTION_CUTOVER.md)). The site
  is live at www.netcyberai.com on the test database; the cutover needs
  credentials only the founder holds.
