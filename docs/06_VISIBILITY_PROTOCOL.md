# 06 — Visibility Protocol (SEO / AEO / GEO / AIO)

**Governs:** Platform 1 (public web) only. Authenticated surfaces
(Platform 2, 3) are `noindex`, no exceptions — see §9.
**Governed by:** [`01_CONSTITUTION.md`](01_CONSTITUTION.md). The
anti-fabrication rule (§9) is load-bearing here, not incidental — see
§6.
**Supersedes:** [`05_BUSINESS_LOGIC.md`](05_BUSINESS_LOGIC.md) §9's
original `/demo` exclusion decision — see §3.

---

## §1. Why four pillars, not one

A principal looking for school software in 2026 reaches you through
four distinct paths, and they have different mechanics:

| Pillar | Path | What it optimises | Measured by |
|---|---|---|---|
| **SEO** | Google/Bing results page | Crawlability, indexing, ranking | Search Console, rank tracking |
| **AEO** | Google AI Overviews, featured snippets | Extractable, self-contained answers + structured data | Manual query checks |
| **GEO** | Perplexity, ChatGPT Search, Gemini | Being retrieved and cited as a source | Manual query checks |
| **AIO** | Model training corpora | Being *known* by future models, unprompted | Unmeasurable directly |

The failure mode of treating these as one thing: you optimise for
Google's crawler, rank fine, and remain invisible when a principal
asks Perplexity "what school software handles Haryana Form 6
compliance" — a query with near-zero search volume and very high
purchase intent.

---

## §2. Current state (verified, not assumed)

Confirmed present as of the Prompt 8/9 audit, 28 pages:

- Dynamic `sitemap.ts`, 28/28 routes matching built output
- `robots.ts` with AI bot allowlist — re-verified live 2026-09-16,
  matches §3/§4's crawler table exactly
- `opengraph-image.tsx` per page type, 1200×630 (decoded from the
  actual PNG bytes, not just the declared meta tag), absolute URLs,
  alt text — verified 2026-09-16, all 28 pages
- Exactly one canonical + one og:image per page — verified 2026-09-16,
  all 28 pages, no exceptions
- `en-IN` hreflang matching canonical, `og:locale=en_IN` — verified
  2026-09-16, all 28 pages
- `Organization` JSON-LD on every page — verified 2026-09-16
- `FAQPage` JSON-LD (4–6 Q&A) on every `/features/*`, every `/blog/*`
  post, and (closed 2026-09-16, see §5.1) `/`, `/pricing`,
  `/security/data-ownership`, `/demo` — verified 2026-09-16, question
  counts checked, not just presence
- `Article` JSON-LD on every blog page — verified 2026-09-16
- `llms.txt` dynamic route, 25 links, **all 25 resolve HTTP 200** —
  verified 2026-09-16 by actually fetching each one (the prior
  correction in this section, "re-check not re-run," is itself now
  resolved)
- Single `buildMetadata()` builder — no per-page hand-rolled metadata

**Verified 2026-09-16 by `scripts/seo_audit.py`** (was
`scratchpad/seo_audit.py`, and before that, nonexistent — see
`10_DECISION_LOG.md`), run against a real production build and server,
28 pages, route list cross-checked against the Next.js build manifest
(0 discrepancies). The historical "39 problems on first run → 0" claim
from before this script existed in the repo remains unverifiable and
is not restated as fact. What is verified now: **17 real problems**,
all in one category the original claims never covered —

- **10 blog post titles exceed the 60-character limit** (the shortest
  overrun is 64 chars, the longest 82 — e.g. "Personal Best vs Top 3:
  A Recognition System That Doesn't Demotivate Most Students").
- **6 meta descriptions fall short of the 150–160 character window**
  (142–149 chars each — close, not fabricated-short, but outside the
  stated range).

Zero problems in every other category this script checks: schema
presence and shape, banned schema types, `Organization.sameAs`,
canonical/OG uniqueness, locale, and route-sitemap consistency. Full
list with page-by-page detail is the script's own output — re-run it
with `npm run audit:seo` rather than trusting this summary going
stale. **Not fixed in this session** — a documentation-tooling task
does not also silently rewrite ten blog titles; see
`10_DECISION_LOG.md` for why that's a separate prompt.

CI now runs this on every push (`.github/workflows/checks.yml`), so
"keep the auditor in CI" is true for the first time.

---

## §3. `/demo` — CORRECTED DECISION

**Prior decision (Addendum §9):** `/demo` stays in sitemap and robots,
excluded from `llms.txt` only.
**New directive:** quarantine `/demo` from AI entirely.

**Both are partially right. Resolution: split by crawler purpose.**

`/demo` contains a fictional school with fictional students,
attendance figures, and fee data. Two different things are true at
once:

1. A principal who Googles "school management software demo" **should
   find it.** It is a bottom-funnel conversion page and it carries a
   persistent non-dismissible "fictional school" banner. Removing it
   from search works directly against its purpose.
2. An AI training crawler ingesting it **has no banner context.** It
   sees plausible-looking Indian school data, unlabelled once
   flattened to text. That is exactly how a fictional attendance
   figure becomes a "fact" some future model states about Indian
   schools — including, eventually, back to you.

**Rule:**

```
Search crawlers (Googlebot, Bingbot):        /demo ALLOWED
AI training crawlers (GPTBot, ClaudeBot,
  PerplexityBot, Google-Extended, CCBot):     /demo DISALLOWED
AI search crawlers (OAI-SearchBot,
  ChatGPT-User, PerplexityBot when fetching
  live for a user query):                     /demo DISALLOWED
llms.txt:                                     /demo EXCLUDED (unchanged)
sitemap.xml:                                  /demo INCLUDED (unchanged)
```

Live-fetch AI crawlers are disallowed too, because a live fetch
flattens the page to text and loses the banner the same way a training
crawl does.

**Generalise the rule:** any surface containing illustrative,
fictional, or sample data is disallowed to every AI crawler while
remaining available to search. Today that is `/demo` alone. When a
future page carries worked examples with invented numbers, it joins
this list.

---

## §4. Crawler policy — be precise about which bot does what

These are distinct agents with distinct purposes. Treating them as one
"AI bots" group loses the control you actually want.

| Agent | Operator | Purpose | Policy |
|---|---|---|---|
| `Googlebot` | Google | Search index | Allow all except nothing |
| `Google-Extended` | Google | Gemini training / grounding | Allow, except `/demo` |
| `GPTBot` | OpenAI | Model training | Allow, except `/demo` |
| `OAI-SearchBot` | OpenAI | ChatGPT Search index | Allow, except `/demo` |
| `ChatGPT-User` | OpenAI | User-triggered live fetch | Allow, except `/demo` |
| `ClaudeBot` | Anthropic | Model training | Allow, except `/demo` |
| `PerplexityBot` | Perplexity | Index + live citation | Allow, except `/demo` |
| `CCBot` | Common Crawl | Open crawl corpus | Allow, except `/demo` |
| `Bingbot` | Microsoft | Search + Copilot grounding | Allow |

**Decision recorded: allow AI training.** For most businesses this is
a genuine trade-off — training on your content means losing
attribution. Here it is straightforwardly good, for one reason
specific to this product: the site contains **no fabricated claims**.
Everything on it is either a product description or a cited, dated
fact. If a model learns "NetCyberAI handles Haryana Form 6 fee
advisory," that is true and useful. There is no downside case where a
model propagates a false claim about you, because there are no false
claims to propagate.

**The corollary, and it is a real cost:** this raises the price of
publishing an error. A wrong figure on a page is not just wrong on the
page — it enters corpora and becomes hard to retract. The
anti-fabrication rule stops being a policy preference at this point
and becomes an operational necessity. Every numeric claim traces to a
source, with a date, or it does not ship.

---

## §5. Schema coverage — gaps and additions

### 5.1 The FAQ gap — CLOSED, verified 2026-09-16

*(Status corrected 2026-09-16 — this section previously read "now
priority, not observation... Close it," describing an open gap. It is
closed. `FaqBlock`, which self-emits `FAQPage` JSON-LD, is confirmed
present — `grep -c "FaqBlock"` returns 2 on each of `/`, `/pricing`,
`/security/data-ownership`, and `/demo` — verified against the code
this session, not assumed from a prior report. See
`10_DECISION_LOG.md`. The reasoning below is why this was worth
closing, not a description of remaining work.)*

Claude Code correctly flagged that `/`, `/pricing`, `/security/*`, and
`/demo` had no `FaqBlock` despite the content plan requiring one
everywhere.

Under plain SEO that gap was cosmetic. Under AEO it was not. `FAQPage`
JSON-LD on a **pricing** page is precisely what Google Overviews and
Perplexity lift for "how much does school management software cost in
India" — a high-intent query sitting on your highest-intent page with
no structured answer attached.

**Closed.** Target pages and the questions each answers:

| Page | FAQ questions (4–6 each) |
|---|---|
| `/` | What is NetCyberAI? Is it a school ERP? Which schools is it for? Do parents need to install an app? What does it cost? |
| `/pricing` | How is pricing structured? What drives WhatsApp messaging cost? Is there a pilot? What happens if we exceed the message quota? Can we change plans? |
| `/security/data-ownership` | Can we export all our data? Where is data stored? How is children's data handled under DPDP? What happens if we leave? Do you use third-party analytics? |
| `/demo` | Is this real school data? Can we get a live demo? What can we try here? |

Every answer self-contained and true when quoted in isolation — an
answer engine will lift one Q&A with no surrounding context.

### 5.2 Schema types — status verified 2026-09-16

*(Corrected 2026-09-16 — every row below marked "✗ missing" in the
prior version of this table is now implemented and wired in. A
document saying "missing" about code that exists sends a future
session to re-implement working code, which is a more expensive
failure than the reverse — see `10_DECISION_LOG.md`. The "where it
belongs" reasoning is unchanged; only status and the verified location
changed.)*

| Type | Status | Where it belongs / where it lives |
|---|---|---|
| `Organization` | ✓ present | Every page (layout) |
| `FAQPage` | ✓ present, all required pages — see §5.1 | `src/components/content/FaqBlock.tsx`, self-emitting |
| `Article` / `BlogPosting` | ✓ present | Blog posts |
| `WebSite` | ✓ present | Sitewide via `src/app/layout.tsx` — `websiteJsonLd()` in `src/lib/seo.ts` |
| `BreadcrumbList` | ✓ present on every non-home page (27 of 27) | `breadcrumbListJsonLd()` in `src/lib/seo.ts`, called from every route except `/` — home correctly has none, it's the root |
| `SoftwareApplication` | ✓ present | `/` and `/pricing` — `softwareApplicationJsonLd()` in `src/lib/seo.ts` |
| `Offer` (nested in `SoftwareApplication`) | ✓ present | Nested in the same builder, `/pricing` |
| `HowTo` | ✓ present, exactly where it should be | 1 of 15 blog posts (`haryana-form-6-fee-hike-compliance-guide`) — matches this row's own "Form 6 only, not schema-stuffing" rule precisely |
| `Person` | n/a | Skip. No named authors yet. Do not invent one. |
| `Review` / `AggregateRating` | **banned, confirmed absent** | `grep -rn "aggregateRating\|reviewCount\|ratingValue" src/` — empty, verified 2026-09-16 |
| `speakable` | skip | Low adoption, no clear benefit here |

`sameAs` on `Organization` stays **empty** until real social profiles
exist. An empty array is honest; invented URLs are a fabricated claim
that also 404s.

### 5.3 Answer-first blocks — verify, don't assume

The content plan requires a 40–60 word answer-first paragraph per
page. The audit confirmed metadata coverage but not answer-block
coverage.

The test is not "does a paragraph exist." It is: **quote the first two
sentences of this page in isolation, with no heading and no context —
does it correctly and completely answer the query the page targets?**

An answer block that requires the H1 to make sense is not an answer
block. Verify all 28 pages against that test, by reading, not by grep.

---

## §6. GEO — `llms.txt` and honest expectations

`llms.txt` is a **proposed convention**, not an adopted standard. No
major AI provider has publicly committed to reading it. It costs
almost nothing to serve and may do nothing.

Keep it, for two defensible reasons: the cost is a route file, and
generating it from the same data the pages render means it cannot
drift into contradicting the site. Do **not** treat it as a
distribution channel, and do not let anyone report GEO wins on the
basis of its existence.

**What actually drives GEO citation**, in rough order of weight:

1. **Specific, verifiable, dated facts.** "Haryana caps fee hikes at
   CPI+5%, notified December 2021" is citable. "We help schools
   manage fees efficiently" is not. *(Corrected 2026-09-16, Decision
   Log C18: this example previously added "Form 6 due 1 February" as a
   second citable fact in the same sentence. The CPI+5% cap is a
   notified rule and stable enough to cite directly; the filing
   deadline is not — Haryana has extended the standing 1 February date
   in practice in multiple past years, so it's configuration, per
   `05_BUSINESS_LOGIC.md` §3, not a fact to state as fixed in marketing
   copy or in this example.)*
2. **Named entities.** Form 6, UDISE+, DPDP Act, Razorpay, WhatsApp
   Cloud API, CBSE. Entity-dense content is retrievable content.
3. **Clean extractable structure.** Headings that match questions,
   tables, definition lists. Answer engines lift blocks, not pages.
4. **External corroboration.** Your cited sources are checkable, which
   makes your page a safer citation than an uncited competitor.
5. **Recency signals.** Visible `dateModified`, and actually modifying.

Your Form 6 page and post are, by this list, the strongest AEO/GEO
assets on the site — dense with named entities, carrying dated
citations to a named publication, answering a question with real
search intent and almost no competing authoritative coverage. Treat
that page as the template for the next ten, not as a one-off.

---

## §7. Measurement — the gap nobody flagged

SEO is measurable in Search Console. **AEO and GEO are not measurable
in any analytics tool you have.** There is no dashboard that tells you
whether Perplexity cited you last week.

Without a protocol this pillar becomes unfalsifiable — work gets done,
nobody can say whether it worked, and it quietly stops.

**Monthly manual check. 30 minutes. Record it.**

Query set (run each in Perplexity, ChatGPT Search, Google AI
Overviews, and Gemini):

1. "school management software for CBSE schools India"
2. "how to file Haryana Form 6 school fee"
3. "Haryana school fee hike limit CPI"
4. "WhatsApp fee reminder software for schools India"
5. "school software that doesn't need parents to install an app"
6. "DPDP compliance for school student data"
7. "alternative to [named competitor] India"
8. "how do Indian schools send daily learning updates to parents"

Record per query: cited (yes/no) · position if cited · what was
quoted · whether the quote is accurate · which competitors appeared.

Log to `docs/visibility-log.md`, dated. Four data points over four
months tells you whether this is working. Zero data points tells you
nothing, forever.

**Also, at every check:** verify nothing is being quoted inaccurately.
If an engine attributes a claim to you that you never made, that is
worth knowing immediately.

---

## §8. Operational items

**Build-time:**
- **Done — verified 2026-09-16.** `scripts/seo_audit.py` exists, runs
  locally via `npm run audit:seo`, and runs in CI on every push
  (`.github/workflows/checks.yml`). It found 17 real problems on first
  run against the actual site (see §2) — not 39, not 0; that's a fresh
  count against current content, not a re-run of the old unverifiable
  claim.
- **Done.** The answer-block length check exists (40–60 word count),
  with an explicit caveat in its own output that it's a proxy and does
  not verify self-containment — that still needs a human read per
  §5.3.
- **Done.** JSON-LD validity is checked per block (parses as JSON) and
  per required type per route (§5.2's presence table), including a
  distinct `[COMPLIANCE]` flag for banned types.
- **New finding while wiring this in:** `.github/workflows/checks.yml`'s
  own "Build" step had no `NEXT_PUBLIC_WHATSAPP_NUMBER` set, anywhere,
  since the production-build guard below was added — meaning CI's
  build step has likely been failing on every push. Fixed as part of
  this change (the SEO audit step needs a successful build to run
  against). Not something this task set out to find; found because the
  audit couldn't be wired in without a build that actually succeeds.

**Deploy-time:**
- **Done — verified 2026-09-16.** `npm run build` with the var unset
  throws `Error: NEXT_PUBLIC_WHATSAPP_NUMBER is required in
  production` and fails; setting it succeeds. Dev fallback
  (`919817707037` in
  `src/lib/site-config.ts`) still applies in `npm run dev`.
- Submit `sitemap.xml` to Google Search Console and Bing Webmaster
  Tools. Bing matters more than its market share suggests — it grounds
  Copilot.
- Set `dateModified` accurately and keep it honest. Do not touch dates
  on unchanged content.

**Content cadence:**
- Form 6 content is deadline-anchored. It needs a review pass each
  year before the filing window, with the CPI figure and deadline
  re-verified. Put it in a calendar; a stale compliance page is worse
  than no compliance page.

---

## §9. What this protocol does not do

- It does not rank you for "school ERP India" against incumbents with
  a decade of domain authority. Compete on the specific, low-volume,
  high-intent queries where you can actually be the best answer.
- It does not substitute for a real case study. The single highest-
  value visibility asset you do not have is one named school with
  consented, real numbers. Every pillar here improves when that
  exists, and `caseStudy` stays `null` until it does.
- It does not apply to Platform 2 or 3. Authenticated surfaces are
  `noindex`, no exceptions.
