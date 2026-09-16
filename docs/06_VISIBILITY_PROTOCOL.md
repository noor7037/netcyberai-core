# 13 — Visibility Protocol (SEO / AEO / GEO / AIO)

**Status:** Additive. Governs Platform 1 (public web) only.
**Supersedes:** Addendum §9's `/demo` exclusion decision — see §3.
**Governed by:** `PRODUCT_CONSTITUTION_v2.0.md`. The anti-fabrication
rule (§9) is load-bearing here, not incidental — see §6.

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
- `robots.ts` with AI bot allowlist
- `opengraph-image.tsx` per page type, 1200×630, absolute URLs, alt text
- Exactly one canonical + one og:image per page
- `en-IN` hreflang matching canonical, `og:locale=en_IN`
- `Organization` JSON-LD on every page
- `FAQPage` JSON-LD (4–6 Q&A) on every `/features/*` and `/blog/*`
- `Article` JSON-LD on every blog page
- `llms.txt` dynamic route, 25 links all resolving 200
- Single `buildMetadata()` builder — no per-page hand-rolled metadata

Verified by `scratchpad/seo_audit.py` fetching all built pages. 39
problems on first run → 0. This is the standard; keep the auditor in
CI.

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

### 5.1 The FAQ gap — now priority, not observation

Claude Code correctly flagged that `/`, `/pricing`, `/security/*`, and
`/demo` have no `FaqBlock` despite the content plan requiring one
everywhere, and correctly declined to fix it inside an audit prompt.

Under plain SEO that gap is cosmetic. Under AEO it is not. `FAQPage`
JSON-LD on a **pricing** page is precisely what Google Overviews and
Perplexity lift for "how much does school management software cost in
India" — a high-intent query sitting on your highest-intent page with
no structured answer attached.

**Close it.** Target pages and the questions each must answer:

| Page | FAQ questions (4–6 each) |
|---|---|
| `/` | What is NetCyberAI? Is it a school ERP? Which schools is it for? Do parents need to install an app? What does it cost? |
| `/pricing` | How is pricing structured? What drives WhatsApp messaging cost? Is there a pilot? What happens if we exceed the message quota? Can we change plans? |
| `/security/data-ownership` | Can we export all our data? Where is data stored? How is children's data handled under DPDP? What happens if we leave? Do you use third-party analytics? |
| `/demo` | Is this real school data? Can we get a live demo? What can we try here? |

Every answer self-contained and true when quoted in isolation — an
answer engine will lift one Q&A with no surrounding context.

### 5.2 Schema types — present vs missing

| Type | Status | Where it belongs |
|---|---|---|
| `Organization` | ✓ present | Every page (layout) |
| `FAQPage` | ✓ features, blog · ✗ home, pricing, trust, demo | Close per §5.1 |
| `Article` / `BlogPosting` | ✓ present | Blog posts |
| `WebSite` | ✗ missing | Layout — enables sitelinks search box |
| `BreadcrumbList` | ✗ missing | Every nested page — improves SERP display and gives answer engines hierarchy |
| `SoftwareApplication` | ✗ missing | `/pricing` + home — the correct type for a SaaS product; `Product` is for physical goods |
| `Offer` (nested in `SoftwareApplication`) | ✗ missing | `/pricing` — one per tier |
| `HowTo` | ✗ missing | Form 6 filing guide only — it is a genuine procedure, so this is honest use, not schema-stuffing |
| `Person` | n/a | Skip. No named authors yet. Do not invent one. |
| `Review` / `AggregateRating` | **banned** | No customers, no reviews. Inventing these is fraud, not SEO. |
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
   CPI+5%, notified December 2021, Form 6 due 1 February" is citable.
   "We help schools manage fees efficiently" is not.
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
- Keep `seo_audit.py` in CI. It caught 39 real problems; it will catch
  regressions.
- Add an answer-block length check (40–60 words) to the auditor.
- Add a JSON-LD validity check per type once §5.2 additions land.

**Deploy-time:**
- `NEXT_PUBLIC_WHATSAPP_NUMBER` currently falls back silently. A
  production build with it unset ships a placeholder number and the
  only symptom is demo requests going nowhere. **Fail the production
  build when it is unset.** Dev fallback is fine.
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
