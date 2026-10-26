# 25 — P4 plan: WhatsApp live and the parent loop

**Status:** plan for review (Decision Log C181). No code in this PR.
**Scope:** roadmap `16` §4 phase P4: Communication, Daily Pulse send and
replies, Parents, PTM Scheduler, Events, Complaints, Parent AI v1, delivery
states. Also, from P3: fee reminders, the UPI "Payment initiated" message
and receipts on WhatsApp.
**Done when** (`16` §4): parents receive, reply, and every message state is
visible to the school.
**Every screen** follows `19` §5: `ModulePage`, today cards, English and
Hindi, a tour, a "Show me how" guide, teaching empty states, logo tokens, AA
contrast, 44 px targets, no invented numbers.

## 1. Where we start (checked in the code and both databases, 2026-10-13)

| Piece | Today |
|---|---|
| The send-gate | `src/lib/whatsapp/gate.ts`, `sendWhatsAppMessage()`. One function, in order: the same trigger twice returns the first outcome (`dedupe_key`); pilot school not approved → `blocked_pilot`; consent for the purpose, read live → `blocked_consent`; the school's quiet hours → `blocked_quiet_hours`; no budget set, or spent → `blocked_budget`; template not approved → `blocked_no_template`; a real account with no verified rate → `blocked_budget`. Then it sends and logs `sent` or `failed`. `scripts/check_whatsapp_send_gate.py` fails CI if anything else calls a provider. |
| What the gate does not do | It has **no rule for a test school**. A message blocked by quiet hours is **dropped**, not sent later. It runs inside the caller's request, not through the job queue. It never hears back: nothing sets `delivered`, `read` or a late `failed`. |
| Providers | `WhatsAppProviderSPI` with one method, `send()`. `MockWhatsAppProvider` records calls in memory. `MetaWhatsAppProvider` throws "not implemented". No way to check a connection, read a webhook, or name a template version. |
| Credentials | `school_whatsapp_configs` (a school's own number, secrets in Supabase Vault through two `security definer` functions). No row in either database. Nothing holds **platform** credentials. |
| Callers | One: an absence marked in attendance sends `attendance_absence_notification` to each guardian with a phone number, purpose `operational_communication`. |
| Consent | `consent_ledger`, append-only, per student and purpose; the latest row decides (`isPurposeGranted`). Six purposes: `core_records`, `operational_communication`, `daily_pulse`, `recognition`, `weekly_brief`, `at_risk`. Test database: 414 rows. Production: 0. |
| Quiet hours | `schools.quiet_hours_start`, `quiet_hours_end` (21:00 to 07:00 by default) and `timezone`. Read by the gate. No screen sets them. |
| Templates | `whatsapp_templates`: `template_name`, `status`, `billing_category`, optional `school_id`. **No version, language, body, variables, or Meta's own id.** One row in each database: `attendance_absence_notification`, approved, utility. That approval is ours; Meta has approved nothing. |
| The log | `communication_log`: phone, template, category, billable, cost, GST, rate, cost basis, status, provider message id, `read_at`, `dedupe_key`, provider used, reason. The status type already has `queued`, `sent`, `delivered`, `read`, `failed` and the five `blocked_*`. **No student, guardian, purpose, template version, what was said, `delivered_at`, or failure code.** Test database: 2,184 rows (seeded for the two test schools: 1,146 read, 889 delivered, 119 sent, 8 failed, 22 blocked for consent). Production: 0. |
| Inbound | `webhook_events` (provider `whatsapp` allowed, unique payload hash). **0 rows in both databases; no route writes to it.** No table for a parent's message or a thread. |
| Cost | `message_rate_table` (rate and GST per category from a date, with where and when it was verified): **0 rows in both databases.** The gate records cost from it, or zero with `rate_not_verified`. Control shows cost per school and category for 30 days and says which categories have no rate (`src/lib/control/messaging-cost.ts`). `billable` is set at send; Meta charges on delivery. |
| Daily Pulse | `pulse_messages`, `pulse_response_log`, `pulse_followups`; drafts and the needs-help queue are live (P2). Nothing is sent. |
| Screens | Communication was a "coming" page until slice 7b (My Day counted held messages; corrected in C183). Parents, PTM, Events, Complaints and Parent AI are "coming" pages. Guardians, consent and data requests live on the student's page. |
| Schools | Test database: 2 schools, both test schools, both pilot with outbound not approved, neither with a budget. Production: none. So nothing can leave today, by four separate rules. |
| Fees (P3) | Reminders go by email (C179). The payer page shows "Payment initiated" on screen only. Receipts are on screen and in print. |

## 2. What P4 delivers

- **One provider interface, a stand-in, and the real adapter dormant.**
  `WhatsAppProvider` as `PaymentProvider` is: send a template, check the
  connection, read a webhook. The stand-in answers like the real thing,
  including delivery receipts and replies, so every loop is proven without
  Meta. The Meta Cloud API adapter is built against Meta's documented
  formats and stays off until platform credentials are entered in Control.
- **Every send through the one gate**, now by way of the job queue, so
  a message held for quiet hours goes out when they end.
- **Templates with versions and their approval state**, in English and
  Hindi, each naming its variables.
- **Delivery states the school can see**: sent, delivered, read, failed,
  and held with the reason, per message.
- **Replies threaded to the school**: a parent's message lands in a thread
  with the right family, for the right staff.
- **Cost per message**, counted when Meta counts it.
- The parent loop on top: Daily Pulse, class notices, fee messages, PTM,
  events, complaints, and Parent AI v1.

## 3. Rules that hold everywhere in P4

1. **One gate.** Nothing sends except `sendWhatsAppMessage()`. The CI check
   stays and is extended to the new provider files.
2. **Never to a real number for a test school.** A test school's messages go
   to the stand-in only, whatever credentials exist. Checked in the gate and
   again in the Meta adapter.
3. **Consent is read live**, for the purpose of that message. No row means
   no. A parent who replies STOP (or रोकें) is recorded as a withdrawal for
   that student's messaging purposes, by a new ledger row, and told so once.
4. **Quiet hours hold; they do not drop.** A held message is sent after
   quiet hours unless it has gone stale (each template says how long it
   stays worth sending).
5. **Every template's first line names the school** ("<School name>: …"), because one platform number serves every school (C183). **A template is sent only in an approved version.** Our wording and
   Meta's approval are recorded separately. A change of words is a new
   version; the old one stays for the record.
6. **Free text only inside the 24-hour window** that a parent's own message
   opens, and only as a reply in that thread. Everything else is a template.
7. **Cost is never guessed.** A real send needs a verified rate on record. A
   message is billable when the provider says it was delivered.
8. **Credentials are write-only**: AES-256-GCM in the app, a key from the
   environment with a version, never in a response, log or audit row (the
   `payment_credentials` pattern, with the same test that greps for them).
9. **No child's marks, health or fee amounts in a message unless the
   template was approved to carry them**, and never another child's.
   Messages name the school; a child is named by first name only.
10. **Nothing a machine wrote reaches a parent unread** in P4: Pulse, notices
    and Parent AI answers are approved by a person first (C116).
11. **The founder's workload rule (C103)** holds: nothing here asks Noor for
    a dashboard task beyond §6.

## 4. Slices, in order

Each is one PR, with tests on the whole schema as the app's database role, a
real-browser run on the stand-in, the migration applied to the test
database, checked, then production, and one review at medium with a security
read (messaging and personal data).

| PR | Delivers | Data model change | Acceptance test |
|---|---|---|---|
| **7a. Provider interface and stand-in** | `WhatsAppProvider` (`send`, `testConnection`, `readNotice`), a stand-in that signs and returns delivery notices and replies, and the gate choosing the provider. The test-school rule. The log learns who and why. | `communication_log` gains `student_id`, `parent_id`, `purpose`, `provider`, `delivered_at`, `failed_at`, `failure_code`. | A test school resolves to the stand-in even when real credentials exist. Every existing gate rule still blocks as before. The stand-in's notices verify with its secret and fail with a wrong one. |
| **7b. Delivery states** | A public webhook route. A notice is stored once (`webhook_events`), checked, and moves the message forward only: sent → delivered → read, or failed, with the time. `billable` follows delivery. The school's Communication screen lists each message with its state. | `webhook_events` gains `signature_ok`, `outcome`. | The same notice twice changes nothing. A notice out of order never moves a state backwards. A notice with a bad signature is recorded and changes nothing. Another school's message id is not found. |
| **7c. Templates, versioned** | The templates P4 needs, in code, in English and Hindi, each with its variables, category and how long it stays worth sending. Control shows each version, our approval and Meta's, and records Meta's id and decision. | `whatsapp_templates` gains `version`, `language`, `body`, `variables`, `meta_template_id`, `meta_status`, `stale_after_minutes`; unique per name, language and version. | A send uses the newest version approved by both. A new version does not send until approved. A missing variable refuses the send before the provider is called. |
| **7d. Outbox** | Sends go through the job queue. Held for quiet hours means sent when they end, or dropped as stale with that reason. Retries on a provider failure, never a double send. | `communication_log.not_before`, `attempts`; status `queued` is used. | A message at 22:00 is delivered after 07:00 once. A stale one is not sent and says why. A provider failure is retried and sent once. |
| **7e. Meta adapter, dormant** | The Cloud API adapter from Meta's documented formats: send a template, verify the webhook signature and challenge, read statuses and inbound messages. Platform credentials saved from Control, encrypted, write-only, with "test the connection". Off until saved. Tests use recorded examples; no network call. | `whatsapp_credentials` (platform, mode, ciphertext, iv, tag, key version, last 4, saved by, tested at). | No credentials: the stand-in is used. Saved credentials never appear in a response, a log or an audit row. A test school never reaches the adapter. |
| **7f. Replies, threaded** | A parent's message lands in a thread for that family and school. Staff reply inside the 24-hour window. STOP withdraws consent. An unknown number goes to the office's list, never matched by guess. | `message_threads`, `inbound_messages`. | A reply reaches only its own school and the right staff. Free text after 24 hours is refused. STOP writes a withdrawal and the next send is blocked for consent. |
| **7g. Fees on WhatsApp** | Fee reminders (same rules as C179), "Payment initiated, the school will verify", and the receipt with its number and link. Email stays as the fallback. | None beyond 7c's templates. | A family is reminded once a day on one channel. A promise or hardship holds both. No receipt message before the school has verified. |
| **7h. Daily Pulse send and replies** | The approved Pulse goes to the class's guardians. "Understood" and "Needs help" replies are counted and feed the needs-help queue. | `pulse_messages` gains the approver and the send time. | Only an approved Pulse sends. A "needs help" reply opens a follow-up for that child's teacher only. |
| **7i. Communication: class notices** | A notice to a class or the school, written by staff, approved by the principal, sent as a template, with who received and read it. | `class_notices` and its recipients. | A teacher reaches only their own classes. Nothing sends unapproved. |
| **7j. Parents** | One screen per guardian: their children, consent by purpose, the phone and its state, the thread, data requests. | None. | A teacher sees guardians of their own classes only. A consent change shows in the next send. |
| **7k. PTM Scheduler** | Slots per teacher, an invitation, the parent picks a slot by reply, a reminder the day before, attendance at the meeting. | `ptm_events`, `ptm_slots`, `ptm_bookings`. | A slot is booked once. A parent with two children gets one message a teacher. |
| **7l. Events** | An event with a date and classes, an invitation, a reminder, replies counted. | `school_events`, `event_replies`. | Only the invited classes receive it. A cancelled event tells those invited. |
| **7m. Complaints** | A parent's complaint from the thread or the office becomes a ticket with an owner and a due time, escalating to the principal, with the parent told at each step. | `complaints`, `complaint_events`. | Nothing closes without a note. An overdue complaint reaches the principal. A teacher never sees a complaint about themselves before the principal does. |
| **7n. Parent AI v1** | "What can I do at home?" answered from what was taught and the child's own work, drafted by the stand-in or the AI provider, approved by the teacher before it is sent. | `parent_ai_answers`. | An answer cites what it used. Nothing sends unapproved. No other child's data is in the prompt (tested). |
| **7o. Cost and going live** | Rates entered from Meta's own pricing page with the source and date. The budget screen for a school. Control's cost page reads delivery. The live checklist. | None. | A real send without a verified rate is refused. Month spend equals the sum of delivered, billable messages. |
| **7p. Meta's review from Control** (C344, C345; built 2026-10-26) | Every template in Meta's shape (version 2). "Submit to Meta" sends a version approved here to Meta's review (UTILITY, positional, one example per value); Meta's `message_template_status_update` webhook moves its state by Meta's id; "Refresh from Meta" matches Meta's templates to ours by name, language and words. Sends give their values by position. | None beyond C344's opening rule. | attendance (en) v2 matches Meta's approved words and id. Words at Meta that are not ours make no version approved by Meta. A template Meta files as another category does not send. |
| **7q. A school's own number, by Embedded Signup** (planned, not built; the brief of 2026-10-26, task 4) | A school connects its own WhatsApp Business number from its settings through Meta's Embedded Signup. NetCyberAI's app is the Tech Provider: Meta returns a code, exchanged on the server for a business token for **that school's** account and number. They are kept in `school_whatsapp_configs` (secrets sealed as in 7e, never shown back). The send-gate picks the school's number when one is connected, tested and switched on, else the platform's. Each school's templates are submitted to its own account (7p, per account), and its webhook notices are matched by its business account id. | `school_whatsapp_configs` gains the business account id, the token's seal and its test state (one migration). | A school sends only from its own number once connected, and never from another school's. A test school still never reaches a real account. Disconnecting falls back to the platform's number. **Needs first:** NetCyberAI's business verified, the app published, and Meta's Tech Provider onboarding (Noor). |

Order may change after 7f: 7g to 7n are independent of each other.

## 5. Decisions the plan makes, unless told otherwise

- **One platform number first.** P4 sends from NetCyberAI's own WhatsApp
  Business number, with the school named in the message. A school's own
  number (`school_whatsapp_configs`) stays in the schema, dormant.
- **Credentials move to the app's encryption** for the platform account
  (the `payment_credentials` pattern), not Supabase Vault. The Vault
  functions stay for a school's own number and are not used in P4.
- **Its own key**, `MESSAGING_CREDENTIALS_KEY`, not the payments key, so one
  can be changed without the other. I do not create or print it.
- **The stand-in's delivery notices are honest about being a stand-in**:
  provider `stand-in` on every row, shown as such to the founder, and never
  counted as cost.
- **Seeded log rows stay as they are.** The 2,184 rows in the test database
  have no student or purpose; new columns are empty for them.
- **STOP is per student and guardian's phone**, withdrawing the messaging
  purposes (`operational_communication`, `daily_pulse`, `recognition`,
  `weekly_brief`, `at_risk`), never `core_records`.
- **Email stays** for a guardian with no WhatsApp consent or number.

## 6. What needs Noor

Three things, all outside the app, none before 7e is merged:

1. **Meta Business verification** of NetCyberAI (the business documents
   Meta asks for).
2. **A phone number** for the WhatsApp Business account that is not in use
   on WhatsApp, and the one-time code sent to it.
3. **Template approval**: I prepare every template's exact text and
   category; they are submitted in Meta's Business Manager and Meta decides.

Then the credentials are entered once in Control. Nothing else.

## 7. Limits of what I can verify

- No message reaches a real phone until §6 is done. Every loop is proven on
  the stand-in and on recorded examples of Meta's formats.
- Meta's formats are taken from its public documentation as it reads when
  each slice is built; the adapter's tests are only as true as those
  examples. The first real send is the real test, and is done to the
  founder's own number first.
- Meta's rates are entered from its pricing page with the date; I cannot
  confirm an invoice.
- Hindi wording is unreviewed until a Hindi reader checks it.

## 8. Going live: the checklist (written after slice 7o, C197)

P4 is built and proven on the stand-in. No message has reached a real phone.
These steps, in this order, are what stands between that and the first real
school. Each says who does it and how the app shows it is done. Nothing here
is skipped by a flag: the send-gate refuses a real send until each is true.

| # | Step | Who | Done when |
|---|---|---|---|
| 1 | **The encryption key.** `MESSAGING_CREDENTIALS_KEY` (32 random bytes, base64) is set on the deployment, in the same way and place as `PAYMENT_CREDENTIALS_KEY`. It is never put in code, a log, chat or a PR. | Supervisor's deployment session | Control → WhatsApp account no longer says the server holds no key, and "Save, switched off" is enabled. |
| 2 | **Meta Business verification** of NetCyberAI. | Noor (Meta asks for the business's own documents) | Meta's Business Manager shows the business as verified. |
| 3 | **A phone number** for the WhatsApp Business account that is not in use on WhatsApp, and the one-time code sent to it. | Noor | The number is listed under the WhatsApp Business account. |
| 4 | **The account in Control.** Phone-number id, WABA id, access token, app secret and a verify token are entered once in Control → WhatsApp account. Each box says what belongs in it and names a slip (a space, a line break, a wrong character, the length) while it is typed; the verify token can be made by the screen and is shown as typed, since Meta sends it back in the clear. They are write-only. **Order:** save here first; only then does Meta's "Verify and save" succeed, with the same verify token and the callback URL the screen shows with a Copy button (before a save the address answers "not found" on purpose). Then "Test the connection" is pressed (C230-B). | Supervisor's session, with Noor present for the values only he can see | The test passes and Meta's webhook check succeeds. The account stays switched off. |
| 5 | **Templates.** Control → Message templates → "Bring in the versions written in the code". Each English version is read and approved there, then sent with **"Submit to Meta"** (7p): Meta's decision arrives by the webhook (the account's `message_template_status_update` field must be subscribed), and **"Refresh from Meta"** reads it back at any time, matching by words. A template made in Business Manager instead is matched the same way, if its words are ours. The templates: `attendance_absence_notification`, `fee_reminder`, `fee_overdue`, `fee_payment_initiated`, `fee_receipt`, `daily_pulse`, `class_notice`, `ptm_invitation`, `ptm_booked`, `ptm_time_not_free`, `ptm_reminder`, `ptm_cancelled`, `event_invitation`, `event_reminder`, `event_cancelled`, `complaint_received`, `complaint_escalated`, `complaint_closed`, `home_help`, `messages_stopped`. | Supervisor's session prepares; Meta decides | Each template a school will use shows "approved" by us and by Meta. A template Meta has not approved is not sent on the real account. |
| 6 | **Hindi review.** A Hindi reader reads every Hindi version; each one read is marked with "Mark the wording as reviewed" in Control → Message templates, with who read it and when. | A Hindi reader chosen by Noor | Until a version is marked, a guardian who prefers Hindi is sent the English version. |
| 7 | **Rates.** The rate for each category in use (utility first) is read on Meta's own pricing page for India and entered in Control → Messaging & Cost with the page's address and the day it was read. Sources: <https://developers.facebook.com/docs/whatsapp/pricing> (per-message pricing since 1 July 2025) and the rate cards at <https://business.whatsapp.com/products/platform-pricing>. No rate is in the code. | Supervisor's session | "Rate not verified" no longer names that category. A real send in a category with no rate in force is refused. |
| 8 | **A school's monthly limit.** Set in Control → Messaging & Cost with a reason. | Supervisor's session, with the amount agreed with the school | The school's Communication page shows its budget. With no limit, its messages are held. |
| 9 | **The first real send, to the founder's own number.** A school that is not a test school is given one student whose guardian's number is Noor's own, with consent recorded. The account is switched on in Control. One absence notice is sent. | Supervisor's session, Noor holding the phone | The message arrives; Communication shows it sent, then delivered, then read; Messaging & Cost shows its cost; a reply from the phone appears as a conversation; STOP stops further messages. |
| 10 | **Only then** is a real school's sending switched on (its pilot switch), one template at a time, starting with absence notices. | Supervisor's session | The school's Communication page stops saying WhatsApp is not connected. |

What the checklist cannot prove in advance, and the first real send will:
Meta's formats are built from its public documentation, not from an observed
message; Meta's invoice is the only proof of a rate; a utility template
delivered inside an open customer-service window is free at Meta but is
counted here at the utility rate, so the app's spend can be higher than the
invoice and never lower.
