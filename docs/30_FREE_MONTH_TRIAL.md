# 30 — The free first month

**Status:** built with Decision Log C226 (supervisor's answer 2 in C223-A).
**Scope:** a school's free first month: what is stored, who changes what,
the nightly move to the school's plan, what the school is told, and the
edge cases. The plan placement of the same slice (answer 1) is in the
migration and the PR, not here.

The website promises a free first month with every working module. Until
now no trial existed in the product. C223-A decides it:

> A school starts a 30-day trial on the day Control starts it (Control sets
> and may extend the date, each time with a reason and an audit row); in the
> trial it has every working module; when it ends it moves to the plan
> chosen at onboarding, Starter unless Control says otherwise, and the
> principal is told 7 days before in the app. `billing.default_plan` =
> Starter stays as the plan after the trial.

## 1. Days

- **Day 0** is the day Control starts the free month (India's date). It is
  given free on top: Control may start it at any hour, and a school started
  late in the evening should not lose a day.
- **Days 1 to 30** follow. `ends_on` is **day 30, the last day of the free
  month, inclusive**. By default `ends_on` = day 0 + 30 days.
- **Day 31** begins at midnight in India (18:30 UTC of day 30). The nightly
  billing job, queued just after midnight (00:10 India time, as today), moves
  the school to its plan.
- "N days left" is `ends_on − today` in India's calendar: 30 on day 0, 1 on
  day 29, 0 on day 30 ("today is the last day").

All dates are India's (`src/lib/time/india.ts`), never UTC.

## 2. Data

`school_trials`, one row a school, ever (the school is the primary key):

| Column | Meaning |
|---|---|
| `school_id` | the school |
| `starts_on` | day 0: India's date on the day Control started it |
| `ends_on` | the last day of the free month (day 30 by default) |
| `started_by`, `started_at` | who started it in Control, and when |
| `ended_at`, `ended_plan_id` | when the nightly job moved the school, and to which plan (both or neither) |

The database holds the rules that must never break:

- one free month a school, ever (primary key);
- `ends_on` after `starts_on`, and at most 90 days after it (a slip of the
  year is refused; the 90 is a bound, not a promise to schools);
- `starts_on` is India's date at the moment of insert (no back-dating);
- `ends_on` only ever moves later, and an extension is never into the past;
- once the school has been moved (`ended_at` set) the row never changes;
- a row is never removed.

Nothing else is a new column. **The plan after the free month** is the
school's subscription plan (`school_subscriptions.plan_id`): the plan chosen
at onboarding (the plan for new schools, `billing.default_plan`, Starter),
unless Control chooses another when it starts the free month or later with
"Change plan". A plan for test schools only is never a real school's plan:
the database already refuses that subscription (C219).

**Modules in the free month** are the existing switch rows,
`school_module_entitlements` with source `trial` (a source the table has had
since P1-b). **Features in the free month:** `school_plan_has_feature`
answers yes for every feature while the school's free month is in force (a
row with `ended_at` empty), so the features follow the same stored fact as
the modules, never the clock.

## 3. Who changes what

| Who | What |
|---|---|
| Control (NetCyberAI staff, platform role) | starts the free month for a school, choosing its last day (default day 30) and the plan after it, with a reason; extends the last day, each time with a reason; changes the plan after it ("Change plan") |
| The nightly billing job (the platform, by nobody) | moves the school to its plan after the last day; each night, switches on as `trial` any module that has started working since |
| The school's principal and school admin | read their own free month: the days left and the plan after it |
| Every other school role | nothing: the database returns no row |

Reasons are the founder's (C124): each is written by `writeEntitlementAudit`
into `entitlement_change_reasons`, which only the platform role reads. The
audit rows (`entitlement.trial_started`, `entitlement.trial_extended`,
`entitlement.trial_ended`) hold dates, plan ids, module ids and counts only:
never the reason, a name or other free text (C56). Like the row, they are
read by the school's principal and school admin only (a restrictive policy on
`audit_log`, `audit_trial_rows_office`); the plan applied with a free month
(`entitlement.plan_applied`) stays visible to every role of the school, as
every plan change is (C124).

## 4. Starting the free month

In one transaction, as the platform role, under the school's billing lock:

1. The school exists, has never had a free month (`trial_used`), and has no
   paid-until day (`billed`: a school that already pays is given
   complimentary modules instead, C212).
2. The last day is after today and at most 90 days after it (`ends_on`).
3. The plan after it: the one Control chose, or the school's subscription
   plan, or the plan for new schools. If it differs from the school's
   subscription, the plan is applied first (`applyPlan`, audited
   `entitlement.plan_applied` with the same reason); a retired plan or a
   test schools' plan for a real school is refused as `applyPlan` refuses it.
4. The row is written; every module that works today (`workingModules()`)
   is switched on with source `trial`, except a module the founder set by
   hand (`founder_override`), which keeps the founder's choice. A `plan` or
   `complimentary` row becomes `trial`; its limits are kept.
5. One audit row `entitlement.trial_started`: the first and last day, the
   plan after, the modules switched on.

## 5. Extending

The new last day is later than the current one, today or later, and at most
90 days after day 0; a reason is required. It is allowed until the nightly
job has moved the school (so also on day 31 before the move). After the move
the free month is over for good: Control gives modules for a time with a
complimentary term instead. Audited `entitlement.trial_extended`, before and
after day.

## 6. The nightly move

`billing.nightly` (`src/lib/control/billing-nightly.ts`) begins with the free
months, before the payment check:

1. Each school whose free month is in force and whose last day is before
   today (India's date of the job's own clock, whatever day it was queued
   for) is moved, in its own transaction, under the school's billing lock,
   re-reading the row: a second run, or a late one, finds `ended_at` set and
   does nothing. So a job that runs twice, or days late, moves the school
   once.
2. The move: the school's `trial` rows become `plan` rows; the school's plan
   is applied (its modules on, with its limits; the rest off, Help never;
   audited `entitlement.plan_applied`); complimentary terms in force today
   are switched on again (`syncComplimentaryModules`); the row gets
   `ended_at` and `ended_plan_id`; one audit row `entitlement.trial_ended`
   with the plan, the modules switched off and the day checked.
3. Each school still in its free month gets any module that has started
   working since (a deploy) switched on as `trial`.

The job is queued when there is something to do: `billing_nightly_enqueue`
also looks for a free month in force.

**The payment check skips a school in its free month:** nothing is owed in
the free month, so a paid-until day that passes during it does not put the
school in grace. The check resumes the night the school is moved.

## 7. What the school is told

In the app shell (every screen), for the principal and the school admin
only, from the school's own session (row level security returns the row to
those two roles only; the plan's name comes from a narrow function that
answers the same two roles of the same school, and only while the free month
is in force). Never a message, never an amount, no online payment.

| Days left | Line |
|---|---|
| 30 to 8 | "Free month: N days left, to the end of {last day}." (quiet) |
| 7 to 1 | the notice: the last day, the plan from the next day, that modules outside it switch off, and "raise a ticket" to talk about the plan |
| 0 | "Today is the last day of your free month", with the same notice |
| below 0 | the move has not run yet: "Your free month ended with {last day}." |

The 7 days are C223-A's ("the principal is told 7 days before").

## 8. Control

Billing & Plans:

- **Free month**, above the schools: every school with a free month, in force
  first and soonest last day first, then those that have ended; each with its
  last day, days left and the plan after it.
- On each school's card: its free month in one line, and "Free month": start
  it (last day, prefilled day 30; plan after, prefilled the school's plan;
  reason), extend it (new last day; reason), and its history with each
  reason, who and when.

## 9. Edge cases

- **No free month:** nothing changes for the school; features are its
  plan's, as before C226.
- **A test school** may have a free month (modules are not a matter of
  payment); it moves to its own plan, which may be a test schools' plan.
- **The founder's hand switches** stand through the free month and after it.
- **Complimentary terms:** a `trial` row is left alone by the complimentary
  sync; at the move the plan is applied first, then the terms in force are
  switched on again.
- **"Change plan" during the free month** changes the plan after it; the
  modules stay on (`applyPlan` leaves `trial` rows alone).
- **Payments during the free month** are recorded as usual (paying ahead).
- **A job that fails** for one school is retried by the queue; schools
  already moved are not moved again.
- **Between midnight and the job** (about ten minutes) the school still has
  every module: the move is a stored fact, made by the job, never worked out
  when a screen is read.
- **Rolling out:** the migration reaches the databases before the code. With
  no free month stored, every changed function answers exactly as before.

## 10. Proof

`test/billing/trial.test.ts` (the whole schema, as the app's roles) and
`test/billing/trial-routes.test.ts` (the Control routes): day 30 and day 31,
an extension, India's midnight (18:29:59 and 18:30 UTC), a job run twice and
late, a school with no free month, a test school, who reads what, and the
database's own rules attempted directly.
