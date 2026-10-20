# 05 — Money: what the family app can earn without hurting the school business

**Revised 2026-10-20 (C230-I):**
- the free plan is one subject per child;
- school information stays free;
- the practice partner's cost is set out (§5).

## 1. Rules (they outrank any pricing idea)

1. **A family never pays for its own school's information.** Attendance, fees, receipts, report cards, notices, PTM,
   homework hand-in, study material and the Daily Pulse are the school's service, paid by the school through its
   NetCyberAI plan. The registry enforces it (`03` §2, entitlement `school_info`).
   - *Reconciled:* C230-H listed Tonight's practice among the free school modules. It is a learning tool fed by school
     data, so it now follows the subject entitlement like the rest of the learning loop. Seeing the school's syllabus
     is free; learning tools on it follow the entitlement.
2. **The school's price never depends on families buying anything.**
3. **No school sees a family's own learning data** (answers, mastery, plans, English results, vault) unless the family
   shares it.
4. **No advertising, no data sales, no loans, no sales calls** (`02` §13).
5. **The free plan stays useful on its own,** and never loses what it already had.

## 2. Free and Family Plus

| Free | Family Plus (one price for all the family's children), or sponsored by the school |
|---|---|
| School information for linked children (all of `02` §9) | — |
| The learning loop for **one subject per child**: Understand, checks, practice, mastery, Tonight's practice, revision and past papers in that subject, within daily limits | Every subject, with higher daily limits for questions and photos |
| Syllabus from the catalog or the school; one custom set-up from index pages, for the free subject | Custom syllabus set-up for every further subject |
| English moments inside responses | The 90-day English programme with its assessments |
| Opportunities and the readiness tracker, with reminders | — |
| Career exploration | Saved career plans with milestone reminders |
| The weekly summary; the Learning Vault | Vault export; later the admission dossier PDF |
| — | Later: the English practice partner, if its cost allows (§5), or as a separate add-on |
| 3 photo questions a day (the homework helper's hint ladder) | A higher fair-use cap for photo questions |
| The vault up to a storage limit (starting at 50 MB) | More vault storage; the admission dossier |

**Limits are data (C230-L):** the free subject count, photo questions a day and vault storage are settings in Control
(`10` §1), so a pilot can change them without code.

**Packs (C230-L):** for families who will not subscribe, one-time season packs (an exam runway mock series; a Board
30-day plan per subject) and one-time items (the admission dossier, the in-depth career roadmap). They are grants with
an end date (`03` §2), never a second subscription. Which ones are sold, and at what price, is decided from pilot
evidence with Plus (§4).

**The free subject:**
- The parent picks it per child and may change it once per school term.
- **Why one subject:** it lets a family see the whole loop work before paying, and bounds the AI cost of free
  families.

## 3. Revenue models assessed

| Model | Conflict with the school business | Decision |
|---|---|---|
| **Family Plus** | None while rule 1 holds | **Go after the pilot shows retention** |
| **School-sponsored Plus** (a school buys Plus for its families, per student per year, with its plan) | Strengthens it | **Go**, priced with the school plans |
| **"Invite your school"** (a standalone family asks its school to join) | Strengthens it | **Go:** counts per school; a family's contact shared only on its explicit opt-in |
| **Practice partner as an add-on** | None | **Decide on measured cost** (§5) |
| Opportunities and career exploration | Public good, trust | **Free always** |
| Advertising; coaching or course commissions; data of any kind | Law, neutrality, trust | **Rejected** |
| Live tutor marketplace | Safety and operations | **Deferred** |

## 4. Price: a hypothesis to test, not a decision

- **Anchors** (`01` E10, E3):
  - ₹300 a month buys a full video-course plan (PhysicsWallah);
  - an urban family spends about ₹3,988 a year per child on coaching;
  - free AI tutors exist (`01` E9), so Plus must sell what they lack: the child's syllabus, mastery and progress, the
    English programme, and the parent's view.
- **Hypothesis:** a family price well under the video-course anchor, monthly and yearly, tested in two bands at pilot
  schools.
- **Decided only after** 30-day retention of free families and the pilot questions (`01` §4). No price appears in the
  product before then.
- **The founder's test bands (2026-10-20):** ₹49–₹499 points for packs and add-ons, and ₹299 a month for Plus in the
  mockups. They are bands to test at pilot schools, not prices.

## 5. Unit economics

Cost per active child per month =
- generation for uncached responses, photos and checks (metered and capped per entitlement);
- plus the generation of reviewed responses, spread over every family (per topic, not per child);
- plus English programme feedback;
- plus voice minutes if the partner is used;
- plus email, messages and a share of hosting.

**The practice partner is the cost risk:**

| Daily limit | Minutes a month (30 days) | At about $0.023 a minute (lower published rates) | At about $0.06–0.10 a minute (higher rates) |
|---|---|---|---|
| 15 minutes | 450 | about $10 | about $27–45 |
| 10 minutes, 3 days a week | about 130 | about $3 | about $8–13 |
| 5 minutes a day | 150 | about $3.5 | about $9–15 |

These are third-party estimates of current rates (`01` E17); recompute with the chosen provider's price list before
deciding. A 15-minute daily default inside a low family price would lose money on every active child. The limit stays
configurable in Control (`03` §7).

- **[GAP: the chosen provider's prices]:** the cost per response and per voice minute is computed once the provider is
  chosen (gate L3).
- Control's platform cap guarantees a month's AI spend cannot exceed what the founder sets.

## 6. What must be settled before the first rupee

| Item | Owner |
|---|---|
| A payment gateway for subscriptions (UPI AutoPay) and its KYC | Founder |
| If sold inside a Google Play app: Play's billing rules for India | Founder, before the store listing |
| GST on digital services and invoices | Founder with the accountant |
| Refund and cancellation terms in plain words, cancel in two taps | Founder with the lawyer (gate L1) |
