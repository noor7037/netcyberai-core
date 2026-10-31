# AI tutor and Control: progress log

**Written by:** the supervisor, for Noor. **Delivers:** one dated list of what changed for you after each of your
re-tests, item by item, and the plan for what is not built yet. **Rule:** updated with every PR that answers a re-test;
the Decision Log holds the reasons, this file holds the status.

## 31 Oct 2026: your Control re-test (C421)

| Your item | What changed | Status |
|---|---|---|
| Staff invites on `/control/monitoring`: "invite failed: 500" ×3, attempts exhausted | The three invites went to the QA's `example.com` addresses. The mail service refuses them (`550 Invalid 'to' field`), so the job retried and stopped, as designed. A real address sends. | Not a bug |
| Provider code 131042 on WhatsApp invites | Meta's code for "payment method missing" on the WhatsApp account. Email invites do not need it. | Yours: add a payment method in Meta Business when you want WhatsApp invites |
| `/control/ai` requests failing and falling back (9 of 20, 5 of 105) | Three causes in the last 30 hours: Nemotron timing out at 60 s before Scout became Primary (gone with the new route); Scout cut at 15 s by the time share (fixed in this PR: Scout now gets 28 s); Gemini `gemini-3.8-flash` answering `auth_failed` (the key's own standing with Google, not our code). | Fixed, except Gemini (yours) |
| `/control/templates` first load timed out at 8 s | A cold start on the Hobby plan: the page and its API are two functions that each wake and connect. Warm loads are under a second. | Known; goes with the production plan |
| School Overview QA Principal/Teachers "Not sent" | Same `example.com` refusal, reported honestly on the screen. | Not a bug |
| PR #393 change: replies from Noor@netcyberai.com | Both lead replies now go out from `LEADS_FROM_EMAIL` ("Noor <noor@netcyberai.com>", set in Vercel), signed "Noor, Founder, NetCyberAI". | Done |
| Control has no link to the apps | The dashboard has an "Open the apps" card: public site, school sign-in, Family app, teacher view. | Done |

## The screens marked "Not built yet": the plan

Each Control tab is a read-only view of the school's own module, built on the module's existing loader and contract,
so nothing is written twice. Three waves, in your order.

| Wave | Screens | When |
|---|---|---|
| 13 | School tabs **Students, Staff, Attendance, Fees**; platform **Audit Logs, System Settings** | PRs open 1–2 Nov |
| 14 | School tabs **Admissions, Academics, Communication**; platform **Analytics, Compliance, Integrations** | PRs open 3–4 Nov |
| 15 | School tabs Profile, Users, Pulse & Engagement, Recognition, Teacher Impact, Capture & Documents, Compliance, Integrations, Usage, Billing, Reports, Audit | PRs open 5–7 Nov |

Each wave is one batch for you to merge by hand, as now, until GitHub Actions is back.
