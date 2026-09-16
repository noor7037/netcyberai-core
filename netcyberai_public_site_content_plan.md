# NetCyberAI Public Site — Content Plan

Scope: the ONLY surface not gated by the Bridge Rule. Goal: rank for
principal search intent, convert to /demo, and generate the 2-3
committed schools that could trigger the bridge. No tenant data, no
schema dependency — safe to build regardless of the Postgres decision
timeline.

## Pages

| Page | Intent it owns | Notes |
|---|---|---|
| `/` | Brand / category entry | "Not another ERP" framing; 3 trust gaps; CTA to /demo |
| `/features/whatsapp-fee-recovery-upi` | "whatsapp fee reminder school software india" | D-3/D-Day/D+2/D+7 sequence, real UPI+Razorpay flow. **Pricing must be re-verified against Meta's live INR card before publishing — do not reuse the "~₹0.11/conversation" figure from the old brief; unit and rate both changed.** |
| `/features/daily-learning-pulse-hinglish` | "daily learning updates parents whatsapp" | Exception-based logic explained in plain language |
| `/features/digital-tc-character-bonafide-pipeline` | "digital tc certificate workflow school" | State machine as a diagram, not prose |
| `/features/teacher-impact-card-principal-only` | "teacher accountability software india" | Explicitly argues against public leaderboards — this is a trust asset, not a feature list |
| `/features/parent-weekly-confidence-brief` | "weekly confidence brief" / dinner-table framing | Sample narrative, clearly labelled as illustrative |
| `/compare/[competitor]-alternative` | comparison intent | Facts only, dated citations, no invented stats about competitors |
| `/security/data-ownership` | trust / objection-handling | Export anytime, India residency, DPDP posture — this converts skeptical principals |
| `/pricing` | commercial intent | 3 tiers + pilot mode explained honestly |
| `/demo` | bottom-funnel | Real, functional sandbox — clearly labelled "Concept Demo — pilot in progress" per your own OQ-7 default |
| `/blog` | top-funnel SEO/GEO | See list below |

Every page: answer-first paragraph (40-60 words), FAQ block with
`FAQPage` JSON-LD, one internal-linking pass, sitemap + robots.txt.

## Blog list (15) — with the two fabrication fixes carried forward

The original brief asked for two posts with numbers that don't exist
yet. Both are corrected here; do not revert to the original titles
until you have a real, consented case study.

| # | Title | Status |
|---|---|---|
| 1 | How to Automate School Fee Reminders on WhatsApp with UPI (2026 Guide) | as briefed |
| 2 | Digital TC / Character Certificate Workflow: Application to WhatsApp Delivery | as briefed |
| 3 | Why Parents Don't Check School Apps — and How Daily Learning Pulse Fixes It | as briefed |
| 4 | [Competitor] vs NetCyberAI: Which Actually Improves Parent Confidence? | facts only, dated |
| 5 | ~~"How We Increased Fee Collection by 38%"~~ → **"The Fee Recovery Sequence, Step by Step: D-3 to D+7 (Template Playbook)"** | **corrected — methodology, zero outcome claims** |
| 6 | UDISE+ Data Export Made Simple | as briefed |
| 7 | Teacher Impact Card: Measuring Teaching Without Toxic Leaderboards | as briefed |
| 8 | Personal Best vs Top 3: A Recognition System That Doesn't Demotivate Most Students | uses the corrected logit-delta reasoning |
| 9 | School Attendance Alerts Without Spamming Parents | as briefed |
| 10 | School ERP Data Ownership: A Pre-Contract Checklist | as briefed |
| 11 | Weekly Confidence Brief: 3 Dinner-Table Questions Based on Today's Learning | as briefed |
| 12 | Coaching Centre vs School ERP: Same Engine, Different Data Model | as briefed |
| 13 | Onboarding 500 Students Without a DPDP Problem | reframed to include consent-ledger requirement, not just speed |
| 14 | ~~"What Indian Parents Actually Open (Data from Semi-Urban Schools)"~~ → **"WhatsApp vs Mobile App: How to Measure What Parents Actually Open"** | **corrected — instrumentation method, not invented data** |
| 15 | School Notices: From Paper Diary to WhatsApp in Two Clicks | as briefed |

## Hard rule for every post

A `caseStudy` field stays `null` until a real, consented pilot school
exists. Every numeric outcome claim in draft copy gets flagged before
publish — this is the one CI-style check worth doing manually until
you have an actual repo: **grep every blog draft for a percentage sign
or a dollar/rupee figure, and trace each one back to a real source**.
If it can't be traced, it doesn't ship.

## What this plan deliberately does NOT include

No portal screens, no Control Plane, no Cloud Functions, no database
migrations — those stay parked behind the Bridge Rule per the decision
already made. This plan is scoped to what's actually unblocked.
