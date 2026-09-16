# NetCyberAI — Phase 0 Build Prompts

**Scope:** Public Web Platform only. The Bridge Rule
(`PRODUCT_CONSTITUTION_v2.0.md` §6) has not been met — no pilot data
exists. Control Plane, School Portal, Cloud Functions, and every core
automation are **out of scope** for every prompt in this file.

**How to use:** paste one prompt at a time into your builder tool,
along with `PRODUCT_CONSTITUTION_v2.0.md` and
`AI_BUILDER_SYSTEM_PROMPT.md`. Run the verification step before moving
to the next prompt. Do not batch prompts.

**Design tokens used throughout:**

| Token | Hex | Use |
|---|---|---|
| Sapphire | `#0F4C81` | Primary, trust, headings, primary buttons |
| Emerald | `#10B981` | Growth, recognition, success states |
| Amber | `#F59E0B` | Warnings, advisory notices |
| Slate | `#1E293B` | Body text, high contrast |
| Off-white | `#F9FAFB` | Page background, outdoor legibility |

Amber is carried forward from the earlier design direction because the
Form 6 advisory surface needs a warning colour; it is not used in
Phase 0 marketing pages except in the advisory explainer.

---

## PROMPT 0 — Prerequisites gate (do this before Prompt 1)

**Nothing gets built until these are supplied.** Do not let a builder
tool invent or placeholder any of them.

| Input needed | Why | Supplied? |
|---|---|---|
| Hosting platform decision (Vercel / Cloudflare Pages / Firebase Hosting) | Determines build output config and deploy command | ☐ |
| Domain registrar access for `netcyberai.com` | DNS records for the chosen host | ☐ |
| WhatsApp business number for the CTA deep-link | Every page CTA points at `wa.me/<number>` | ☐ |
| Company legal name + contact email + registered address | Required on `/terms`, `/privacy`, footer | ☐ |
| Logo file (SVG preferred) or explicit "use a wordmark for now" | Header, favicon, OG images | ☐ |
| Confirmation: is `netcyberai.com` already pointing anywhere? | Avoids overwriting a live site | ☐ |

**Not needed in Phase 0** (do not let anyone ask for these yet):
Supabase keys, Razorpay keys, Meta WhatsApp Cloud API credentials.
Phase 0 has no database, no payments, and sends no messages.

---

## PROMPT 1 — Repository scaffold and design system

**Target files**
```
package.json
next.config.js
tailwind.config.ts
tsconfig.json
src/app/layout.tsx
src/app/globals.css
src/lib/design-tokens.ts
src/lib/site-config.ts
src/components/ui/Button.tsx
src/components/ui/Card.tsx
src/components/ui/Container.tsx
src/components/layout/Header.tsx
src/components/layout/Footer.tsx
```

**Functional specification**

Next.js 14 App Router, TypeScript strict, Tailwind. **Standard Next.js
output, deployed on Vercel's Next.js runtime — not static export.**
`next.config.js` carries no `output` override. Revised
2026-09-16: Phase 0 still has no server-side data or tenant data (the
Bridge Rule is unchanged), but the site deploys as a normal Vercel
Next.js app rather than a static export, so routes that need it later
(e.g. per-request OG image generation) aren't blocked by an export
constraint decided prematurely. Every Phase 0 page is still static
content — this is a deployment-target change, not a return of
server-side data or tenant logic.

`src/lib/design-tokens.ts` holds only visual design tokens (colors),
mirrored into the Tailwind theme:
```ts
export const colors = {
  sapphire:  '#0F4C81',
  emerald:   '#10B981',
  amber:     '#F59E0B',
  slate:     '#1E293B',
  offWhite:  '#F9FAFB',
} as const;
```

`src/lib/site-config.ts` holds site-wide contact/config values — kept
separate from design tokens on purpose, so a color change and a phone
number change are never the same diff:
```ts
export const companyName = 'NetCyberAI';
export const contactEmail = 'admin@netcyberai.com';
export const companyAddress = 'Gurugram / Palwal, Haryana, India';

export const whatsappNumber =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '919817707037';

export function whatsappLink(message?: string): string {
  const base = `https://wa.me/${whatsappNumber}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
```
No component may hardcode the WhatsApp number, contact email, or
`netcyberai.com` — always import from this file. Verification below
checks this with a grep.

Mobile-first requirements, non-negotiable:
- Base layout is single-column. Desktop breakpoints add columns; the
  mobile layout is never a squeezed desktop layout.
- Minimum tap target 44×44 px on every interactive element.
- Body text minimum 16px, `#1E293B` on `#F9FAFB` — this must be legible
  on a cheap screen in daylight.
- No horizontal scroll at 360px viewport width. Test at 360, not 375.
- System font stack with a Devanagari fallback, so Hinglish examples
  render correctly without a webfont download on a slow connection.

Header: logo left, one primary CTA right ("Book a demo" → WhatsApp
deep link). No hamburger menu with more than 6 items; if nav grows
past that, the information architecture is wrong.

Footer: company legal name, contact email, links to `/privacy`,
`/terms`, `/security/data-ownership`.

**Verification**
```bash
npm run build          # must exit 0, standard Vercel output (no `out/`)
npx next start          # then check manually against localhost:3000:
```
- Load at 360px width in devtools — no horizontal scroll on any page.
- Lighthouse mobile performance ≥ 90, accessibility ≥ 95.
- Every button ≥44px tall, measured in devtools.
```bash
grep -rn '9817707037\|admin@netcyberai\|netcyberai.com' src/ \
  | grep -v 'src/lib/site-config.ts'
# Must return nothing — every contact/WhatsApp value lives in site-config.ts only.
```

**Human prerequisites:** hosting platform decision, WhatsApp number,
logo or "wordmark for now" confirmation, legal name and contact email.

---

## PROMPT 2 — Home page

**Target files**
```
src/app/page.tsx
src/components/home/Hero.tsx
src/components/home/TrustGaps.tsx
src/components/home/HowItWorks.tsx
src/components/home/CTASection.tsx
```

**Functional specification**

Hero: headline states the outcome, not the category. "Not another
school ERP" as supporting line, not the headline. Sapphire background,
off-white text, single primary CTA to WhatsApp.

Three Trust Gaps section — one card each (Parent↔Child,
Parent↔School, Principal↔Teacher), each with a one-sentence
description of the gap and a one-sentence description of what
NetCyberAI does about it. Emerald accent on the "what we do" line.

How It Works — three steps, plain language, no jargon, no framework
names.

**Hard content rules:**
- No customer logos. You have no customers.
- No testimonials. You have none.
- No numeric outcome claims of any kind — no percentages, no ₹
  figures, no "schools save X hours". `caseStudy` stays empty until a
  real consented pilot exists (Constitution §9).
- No live-KPI dashboard simulation. A fake dashboard showing fake
  numbers on the homepage is a fabricated claim in animated form.

**Verification**
```bash
grep -rEn '[0-9]+%|₹[0-9]|\$[0-9]' src/app/page.tsx src/components/home/
# Every hit must be traceable to a real source or be removed.
```
Manual: read the page aloud. If any sentence implies a result you
haven't achieved, cut it.

**Human prerequisites:** none beyond Prompt 1.

---

## PROMPT 3 — Feature pages (six)

**Target files**
```
src/app/features/whatsapp-fee-recovery-upi/page.tsx
src/app/features/daily-learning-pulse-hinglish/page.tsx
src/app/features/digital-tc-character-bonafide-pipeline/page.tsx
src/app/features/teacher-impact-card-principal-only/page.tsx
src/app/features/parent-weekly-confidence-brief/page.tsx
src/app/features/haryana-form-6-fee-advisory/page.tsx
src/components/content/AnswerFirst.tsx
src/components/content/FaqBlock.tsx
src/components/content/StepDiagram.tsx
```

**Functional specification**

Every feature page has the same skeleton:
1. `AnswerFirst` — 40–60 words answering the implied search query
   outright, in the first two sentences. This is what AI answer
   engines lift. It must read correctly quoted in isolation.
2. How it works — 3 steps, `StepDiagram`, plain language.
3. What it does not do — an honest limits section. This converts
   skeptical principals better than a feature list.
4. `FaqBlock` — 4–6 Q&As, rendered to visible HTML **and** to
   `FAQPage` JSON-LD.
5. CTA to WhatsApp.

Page-specific notes:
- **Fee recovery:** show the D-3 / D-Day / D+2 / D+7 sequence. Any
  WhatsApp per-message cost figure must carry its verification date
  inline and link Meta's pricing page. Do not reuse a rate from an old
  document without re-checking it.
- **Daily Pulse:** show a real Hinglish example message. Show the
  exception states (delayed / partial / not taught) and state plainly
  that the system never claims a topic was taught when it wasn't.
- **Teacher Impact Card:** lead with why public teacher leaderboards
  are harmful. This page's job is to differentiate on ethics.
- **Form 6 advisory** (new page, highest-value SEO target): explain
  the CPI + 5% cap, what Form 6 requires, and the filing deadline.
  Cite Tribune India sources with links and dates. State explicitly:
  **advisory only, never blocking, never legal advice.** Mention that
  a salary-linked alternative formula also exists. Amber used for the
  advisory-notice visual example.

**Verification**
```bash
npm run build
npx next start
```
- Paste each page's JSON-LD into Google's Rich Results Test — must
  validate as `FAQPage`.
- Every page has unique `<title>` (≤60 chars), meta description
  (150–160 chars), canonical, OG tags.
- `grep` for unsourced numbers as in Prompt 2.

**Human prerequisites:** current-year CPI figure and its official
source, for the Form 6 page. **If you don't have it, the page ships
explaining the formula without a worked example — do not let the
builder invent a CPI number.**

---

## PROMPT 4 — Trust pages

**Target files**
```
src/app/security/data-ownership/page.tsx
src/app/privacy/page.tsx
src/app/terms/page.tsx
src/app/pricing/page.tsx
```

**Functional specification**

`/security/data-ownership` is the highest-converting page for a
skeptical principal. Content: export anytime in standard formats,
Indian data residency, children's-data position under DPDP, no
third-party analytics or ad pixels on authenticated routes, what
happens to data on offboarding. Written for a principal to read
without a lawyer.

`/privacy` and `/terms`: real content, real company details. **These
are legal documents — have them reviewed before launch.** A builder
tool generating boilerplate is a starting draft, not a final document.

`/pricing`: three tiers plus pilot mode. If you have not decided
pricing, the page says "contact for pricing" rather than inventing
numbers. Explain pilot mode honestly — outbound messaging is off by
default during a pilot, the school switches it on when ready.

**Verification**
- Every claim on `/security/data-ownership` must correspond to
  something actually implemented or explicitly marked "planned".
  Promising an export feature that doesn't exist is the same class of
  problem as a fabricated statistic.
- Manual legal review checkpoint before launch.

**Human prerequisites:** company legal name, registered address,
contact email, pricing decision (or explicit "contact us" choice).

---

## PROMPT 5 — Blog infrastructure and first five posts

**Target files**
```
src/content/contract.ts
src/content/blog/index.ts
src/app/blog/page.tsx
src/app/blog/[slug]/page.tsx
src/content/blog/automate-school-fee-reminders-whatsapp-upi-india.ts
src/content/blog/digital-tc-character-certificate-workflow.ts
src/content/blog/haryana-form-6-fee-hike-compliance-guide.ts
src/content/blog/why-parents-dont-check-school-apps.ts
src/content/blog/personal-best-vs-top-3-recognition.ts
```

**Functional specification**

`contract.ts` defines the `BlogPost` type with a `caseStudy` field
typed as `null | {...}` — it stays `null` until a real consented
pilot exists.

Each post: 800–1200 words, answer-first opening, 4–6 FAQ items with
JSON-LD, minimum 3 internal links, real sources with URLs and dates,
CTA at the end.

The Form 6 post is the strongest ranking opportunity in the set —
a recurring statutory deadline with a documented low compliance rate
is a search query with real volume and real urgency. Cite the Tribune
sources. Explain the filing, the formula, the deadline, and the
consequence of not filing. Do not give legal advice.

**Two posts from the original brief must NOT be written as titled:**
- "How We Increased Fee Collection by 38%" — no such result exists.
  Write "The Fee Recovery Sequence, Step by Step: D-3 to D+7" instead.
- "What Indian Parents Actually Open (Data from Semi-Urban Schools)" —
  no such dataset exists. Write "How to Measure What Parents Actually
  Open" instead.

**Verification**
```bash
npx tsc --noEmit
npm run build
grep -rEn '[0-9]+%|₹[0-9]' src/content/blog/
# Every hit traced to a cited source or removed.
grep -rn 'caseStudy' src/content/blog/    # every one must be null
```

**Human prerequisites:** none, but flag any claim you want made about
your own pilot — the answer should be "none yet".

---

## PROMPT 6 — Remaining blog posts (six to ten more)

**Target files:** `src/content/blog/<slug>.ts` for each remaining post
in `netcyberai_public_site_content_plan.md`.

**Functional specification:** same contract and same rules as Prompt 5.
Write them in batches of three, verifying between batches. Do not let a
builder generate ten posts in one pass — quality degrades and sourcing
gets sloppy past about three.

**Verification:** same as Prompt 5, run per batch.

**Human prerequisites:** none.

---

## PROMPT 7 — Demo sandbox

**Target files**
```
src/app/demo/page.tsx
src/components/demo/RoleSwitcher.tsx
src/components/demo/PrincipalView.tsx
src/components/demo/TeacherView.tsx
src/components/demo/ParentView.tsx
src/demo-fixture/sunrise-public-school.ts
```

**Functional specification**

A functional, clickable, read-only sandbox. Role switcher between
Principal / Teacher / Parent views.

**Hard rules:**
- A persistent banner on every demo screen: "Concept demo — sample
  school, not real data." Not dismissible.
- All fixture data lives in `src/demo-fixture/` and nowhere else. It is
  the single allowlisted exception to the no-dummy-data rule
  (Constitution §9).
- The fixture school carries an obviously-fictional name. Nothing in
  it may resemble a real school, real student, or real family.
- Structurally incapable of sending anything. Phase 0 has no messaging
  integration at all, which makes this true by construction — keep it
  that way.
- Mobile-first: the Teacher view must be usable one-handed at 360px.
  This is the view that sells the product to a principal who has seen
  bloated ERPs.

**Verification**
```bash
grep -rn 'mock\|dummy\|fake\|sample' src/ --include=*.tsx --include=*.ts \
  | grep -v 'src/demo-fixture/'
# Must return nothing.
```
Manual: every demo screen shows the banner; no interaction claims to
have sent, saved, or paid anything.

**Human prerequisites:** none.

---

## PROMPT 8 — SEO infrastructure

**Target files**
```
src/app/sitemap.ts
src/app/robots.ts
src/app/opengraph-image.tsx
src/lib/seo.ts
public/llms.txt
```

**Functional specification**

- `sitemap.ts` — every route, generated from the route list, not
  hand-maintained.
- `robots.ts` — allow all, point at sitemap.
- OG images — generated, one per page type, using the design tokens.
  Sapphire background, off-white text.
- `seo.ts` — one helper producing title, description, canonical, OG,
  and JSON-LD, so no page hand-rolls its own and drifts.
- `llms.txt` — a plain-text summary of what NetCyberAI is, for AI
  answer engines. Same honesty rules: no invented results.

**Verification**
```bash
npm run build
curl localhost:3000/sitemap.xml    # every route present, no 404s
curl localhost:3000/robots.txt
```
- Rich Results Test passes on every page with JSON-LD.
- No page missing canonical or OG tags.

**Human prerequisites:** final domain confirmed, so canonicals are
correct.

---

## PROMPT 9 — Pre-launch audit and deploy

**Target files**
```
README.md
.github/workflows/checks.yml   (optional but recommended)
```

**Functional specification**

Run the full `ACCEPTANCE_CHECKLIST.md` Phase 0 section. Then:

```bash
# No fabricated claims anywhere
grep -rEn '[0-9]+%|₹[0-9]|\$[0-9]' src/ --include=*.ts --include=*.tsx \
  | grep -v 'src/demo-fixture/'

# No dummy data outside the fixture
grep -rn 'mock\|dummy\|fake\|sample' src/ --include=*.ts --include=*.tsx \
  | grep -v 'src/demo-fixture/'

# No secrets
grep -rn 'sk_\|api_key\|SECRET\|PRIVATE_KEY' src/

# Build clean
npm run build && npx tsc --noEmit
```

Manual pre-launch gates:
- Lighthouse mobile ≥90 performance, ≥95 accessibility, on a throttled
  3G profile — not on desktop broadband.
- Test on a real budget Android phone if you can borrow one. Devtools
  emulation misses font rendering and tap latency.
- Legal review of `/privacy` and `/terms` complete.
- Every WhatsApp cost figure re-verified against Meta's live pricing
  page, with the check date shown on the page.

Then deploy and point DNS.

**Human prerequisites:** DNS access, hosting account, legal review
sign-off.

---

## What happens after Phase 0

Do not start Phase 1. Run the public site, drive traffic, and watch for
the Bridge Rule trigger — 60–90 days of real Pulse engagement data from
a live school, or 2–3 schools asking for production access unprompted.

When that trigger fires, the Phase 1 sequence starts with applying
`netcyberai_schema.sql` and `netcyberai_rls_policies.sql` to a real
Supabase project, plus the additive migrations specified in
`11_BUSINESS_LOGIC_ADDENDUM.md` §2–§5. Prerequisites at that point will
include Supabase project URL and service key, Meta WhatsApp Cloud API
credentials and approved templates, and Razorpay test keys — **none of
which are needed now.**
