# Brief for the build lead: WhatsApp end to end (supervisor, 2026-10-26)

Supervisor → build lead. The founder connected Meta to the supervisor's session and asked that WhatsApp work end to end.
For testing, the platform's own number is used; each school later brings its own number (`school_whatsapp_configs`).
Rules: CLAUDE.md; docs/25 (P4) and C183/C186 for the send-gate and webhooks.

## What the supervisor found (2026-10-26, read from Meta and the test database)

**Meta, business "Noor islam":**
- The app "NetCyberAI System" has a callback URL set.
- The number +91 98177 07037 is registered on one WhatsApp account. The same number is half set up on a second account
  named NetCyberAI; leave that one alone.

| Gap | Effect | Who |
|---|---|---|
| The WhatsApp account is not subscribed to the app | No inbound message, delivery status or template decision reaches us | Founder says yes; the supervisor runs it |
| App unpublished (development mode) | Real webhooks may not arrive | Founder (App Dashboard; privacy policy `https://www.netcyberai.com/privacy`) |
| No payment method | Template sends are accepted but most likely never delivered | Founder (billing) |
| Business not verified | Low sending limits | Founder (documents) |

**Our side:**
- Control's account is the registered number (id ending 5287) and passed its test on 24 Oct; it is enabled.
- No message has ever gone through Meta. The 2,184 `communication_log` rows are seeded, with provider null.

**Templates: none can pass Meta as written.**
- All 46 rows (23 names × en/hi) **start with a placeholder**, 7 also **end with one**, and 2 **repeat one**. Meta
  refuses all three.
- Meta already approved `attendance_absence_notification` (en, id 2274559680068398), with the body
  `From {{1}}: {{2}} was marked absent on {{3}}. If this is a mistake, or your child is unwell, please tell the school office.`
  Ours still says `{{school}}: … or {{child}} is unwell …` and `meta_status = not_submitted`. A send would use Meta's
  words while we record ours, and our gate refuses it anyway (it needs `meta_status = approved`).
- Nothing in `src` handles the webhook field `message_template_status_update`, so Meta's decisions never reach us.

## Yours, in this order (one PR each; WhatsApp is messaging, so each gets a security review)

1. **Templates in Meta's shape.**
   - Rewrite every registry body (en and hi) so that:
     - none starts or ends with a placeholder (for example `From {{school}}: …`);
     - no placeholder repeats;
     - no two placeholders sit next to each other;
     - there is about one placeholder at most for every three words;
     - the body is at most 1024 characters, with at most one blank line between paragraphs.
   - Bump each version. `attendance_absence_notification` v2 (en) must equal Meta's approved body word for word.
   - Add a test that holds every registry template to these rules, so this cannot come back.
   - The founder reviews the wording in Control as before.
2. **Submit and sync.**
   - Control → WhatsApp → Templates gets **Submit to Meta**: Graph `POST /{account}/message_templates` with the saved
     token, for a template whose wording is reviewed and approved; UTILITY category for school notices.
   - Meta's decisions arrive through the `message_template_status_update` webhook and set `meta_status`,
     `meta_template_id` and `meta_decided_at`.
   - **Refresh from Meta** reconciles by name and language. It must mark the already-approved
     `attendance_absence_notification` (en) approved.
   - Positional parameters follow `variables` in order.
3. **End-to-end proof on the live site**, after the founder's four steps:
   - **Inbound:** the founder messages the number from his phone; it lands in `inbound_messages` / the teacher's queue.
   - **A reply within 24 hours:** it is delivered, and its status comes back by webhook.
   - **One approved template** to the founder's number from the demo school only (allow outbound for the demo school
     alone): sent, delivered and read land in `communication_log` with `provider = 'meta'`.
   - Record each with screenshots. If the signature check fails, the App Secret saved in Control is not this app's;
     say so. Do not paste secrets anywhere.
4. **Later, planned only:** each school's own number via Embedded Signup into `school_whatsapp_configs`. A plan row in
   docs/25; build when the first real school is ready.

## Also yours: #312 (a child's own phone) is held

- The "Children's own phones" section shows for every family. The reviewer's MEDIUM (blind guessing of a live six-digit
  code across all families) therefore applies to everyone.
- **Decided (C230-AF):** reverse the flow as the reviewer recommends. The child's phone shows the code; the parent
  types it in the signed-in parent area. Also keep the section behind the `focus_lock` switch, so only pilot families
  see it.
- Update docs/34 §9.4 to match. Then the supervisor merges.
