# 04 — Hosting and scaling

## 1. Stage 1: same deployment, same database (now)

| Part | Where | Note |
|---|---|---|
| Pages and APIs | The existing Vercel project, `www.netcyberai.com/family` and `/api/family/**` | No new project, domain or fixed cost. |
| Functions region | **Mumbai (`bom1`)** | Fixed in #193. Before it, functions ran in US East (`iad1`) while the database is in Mumbai, so every query crossed the world. |
| Database | The existing Supabase project (`ap-south-1`, Mumbai), new schemas `family` and `content` | Data stays in India. |
| Files | The existing private `documents` bucket, under `family/<account_id>/…` for vault files | Through the one storage module. |
| Jobs | The existing jobs runner (weekly content freshness, nightly archive of expired opportunities, weekly summaries) | Job names prefixed `family.`. |
| AI | The `AIProvider` interface; stand-in until the founder chooses a provider (C235 recommends Vertex AI in asia-south1) | Metered per account. |
| Email | Resend (live) | Sign-in codes and the weekly summary. |
| WhatsApp | The send-gate, once P4 is live | Connected-school purposes first; standalone messages only when the cost is planned. |
| Monitoring | `/api/health`, Control → Monitoring, Control → Family | A `family` tag on errors and logs. |

**Variable costs only:** AI usage (doubts and library generation), email, WhatsApp messages (about ₹0.115 per
authentication message, `01` E14), storage. Fixed hosting cost does not change at this stage.

## 2. What is built now so the later split is mechanical

1. **No foreign keys from `family.*` or `content.*` into `public.*`** (`03` §5).
2. **School data only through `SchoolLink`**, an interface with an in-process implementation today.
3. **Code boundary in CI** (`03` §10): the family area imports nothing from the school area.
4. **Own session type and cookie**, own environment variables (prefix `FAMILY_`), own job names, own error tag.
5. **Feature flags in the family registry**, managed in Control.
6. **Content is non-personal** and versioned, so it can be cached at the edge later.

## 3. Stage 2: own deployment, same database

**When** (planning thresholds, revised with real data):

- family requests pass half of all function invocations for two weeks running;
- a family release waits on a school-system release twice in a month;
- a separate product name or domain is decided;
- a partner contract requires the family app to be deployed apart.

**How:**
- Move the family area into its own app in a workspace (`apps/family`, with shared packages for ui, i18n, tokens and
  contracts), or build a family-only app from the same repository.
- Give it its own Vercel project, also in `bom1`, on `family.netcyberai.com` or the product's own domain.
- Keep the same database and the same `SchoolLink` (still in-process: the family app connects to the same database
  with its own role, limited to `family.*`, `content.*` and the parent-scoped read path).

## 4. Stage 3: own database

**When:**
- the family schemas' load affects the school system (sustained CPU above 60% in the peak hour, or connection limits
  reached);
- or a contract requires separate data.

**How:**
1. Create a new Supabase project in `ap-south-1`.
2. Copy `family` and `content` there (`pg_dump -n family -n content`), with a short write freeze and a row-count check.
3. Switch `SchoolLink` to an HTTP implementation: the school system exposes `/api/school-link/**`, called with a
   signed service token that names the school and the guardian on every request. The school side opens the same
   parent tenant context, so parent RLS stays the backstop.
4. Drop the copied schemas from the school database after a verified period.

Nothing in the family code changes except the `SchoolLink` implementation and the connection string.

## 5. Mobile

| Step | What | Who |
|---|---|---|
| Now | Installable PWA on Android and iOS from the browser | Build |
| Phase 6 | Google Play listing by wrapping the same PWA (Trusted Web Activity): no second codebase | Founder: a Google Play developer account (one-time registration fee) and the store-listing decision (docs/31 §6) |
| Later | iOS App Store wrapper, if iOS demand shows in the data | Founder decision |

Google Play's billing rules apply to digital subscriptions sold inside a Play-distributed app; settle that before
Phase 6 (`05` §5).

## 6. Reliability

- **Backups:** Supabase keeps daily backups on its paid plans, and point-in-time recovery is an add-on; the founder
  confirms the plan and the add-on before public launch.
- **Health:** the family app's own check (`/api/family/health`: database, content readable, AI provider reachable) is
  shown in Control → Monitoring.
- **Degrades safely:**
  - AI down → doubts say "try later"; library content still works.
  - School system unreachable (Stage 3) → C-modules say so; the study core still works.
  - Over the AI cap → a clear message, never a silent failure.
