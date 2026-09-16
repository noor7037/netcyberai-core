# NetCyberAI — Public Web Platform (Phase 0)

WhatsApp-native Student Learning Monitoring & Parent Engagement Engine
for Indian schools. This repository currently contains **only the
Phase 0 public marketing site** — no database, no authentication, no
messaging integration. See `PRODUCT_CONSTITUTION_v2.0.md` §6 (the
Bridge Rule) for why: Control Plane and School Portal work is gated
until real pilot data or unprompted school demand exists, and neither
has happened yet.

## Stack

Next.js 14 (App Router, standard Vercel output — not static export),
TypeScript strict, Tailwind. See `ARCHITECTURE_DECISIONS_PLAIN.md` for
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

## Where things live

| Path | What it is |
|---|---|
| `src/app/` | Pages (App Router) |
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
- **The Bridge Rule.** Do not start Control Plane or School Portal work
  without checking `PRODUCT_CONSTITUTION_v2.0.md` §6 first.

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
```

Each of these must produce no output (the grep checks) or exit 0 (the
build/typecheck) before a change is considered done. `.github/workflows/checks.yml`
runs the same checks on every push and pull request.

## Not yet done (manual, before a real launch)

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
- DNS and hosting deploy — needs credentials this repo does not have
  and no session should have without the domain owner present.
