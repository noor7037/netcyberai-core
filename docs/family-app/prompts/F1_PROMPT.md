CONTEXT: From the supervisor (independent CTO and principal architect) to the Claude Code build lead, for Noor, a non-technical founder. M1 is merged (#203–#212). This wave fixes what the founder hit on his phone and finishes M1's open items: staying signed in, the menu button, the AI key's server key, Hindi chapter names, and the Android app file. It is a stack of PRs on base main; stop after it and report. Work by CLAUDE.md, challenge this brief with evidence where it is wrong, and report in plain words, founder actions first.

START
- Run `git fetch origin main` and start from the latest main.
- Read Decision Log C230-N and C247–C255 only. Everything else is unchanged since M1, so do not re-read it.
- Decision Log rows C256–C262 are reserved for this wave.

F1-0 Server set-up (lead, first; one founder approval)
1. AI keys get their own server key:
   - `src/lib/ai/credentials.ts` uses a new `AI_CREDENTIALS_KEY`, in the same format and with the same version handling as the payments key.
   - Never use `PAYMENT_CREDENTIALS_KEY`: it does not exist in production, and one key must not open both payments and AI.
   - Change the `control.ai.noServerKey` message to match.
   - No AI key has been saved yet, so nothing needs re-sealing.
2. Create it in Vercel for Production and Preview. Generate a random value and pipe it straight in, for example `openssl rand -base64 32 | vercel env add AI_CREDENTIALS_KEY production`, using the format the code expects. Never print, echo, log or commit the value. Then redeploy.
3. Production database:
   - The supervisor applied M1's migration to production in parts, and both databases' fingerprints match except for one function.
   - Add `family.issue_code` with its revoke and grant lines, exactly as in `20261021094627_m1_family_content_control.sql`. The supervisor's database tool stops at its delete clause.
   - Then record the migration in production's `supabase_migrations.schema_migrations` with the same version and name the test database has.
   - Show both databases' fingerprints equal afterwards.

F1-1 Signing in like a modern app (lead; auth: /code-review medium plus /security-review)
1. **Trust this browser for 30 days:**
   - A tick box on the authenticator step and on the emailed-code step.
   - When ticked, that browser or app skips the authenticator and the emailed code for 30 days, for every role including super_admin. Today an account with an authenticator is asked every time (`stepAfterPassword` in `src/lib/auth/authenticator-rules.ts` returns 'authenticator' even on a trusted device). Change that rule and its tests.
   - Reuse the existing device token (`DEVICE_COOKIE`, `signDeviceToken`, `deviceTrusted`). Bind it to the user, and end it on a password change, "sign out everywhere", or "forget this device".
   - The account page lists signed-in devices, each with "forget".
2. **Step-up for sensitive actions only:**
   - Ask the authenticator again, valid for 15 minutes, before: saving or replacing any credential (AI, payments, WhatsApp), viewing as a school (impersonation), and changing a person's role.
   - Nothing else asks again.
3. **Keep me signed in:**
   - A tick box, on by default.
   - On: the session renews itself while used, and signs out only after 30 days without use (staff) or 180 days without use (the Family app), or on sign-out, a password or PIN change, or "sign out everywhere".
   - Off: the session ends when the browser closes.
   - The installed Android app always keeps the family signed in. The parent area still needs the PIN.
4. **Remember my email or mobile number on this device:**
   - A tick box that stores only the identifier on the device and fills it in next time, with a way to clear it.
5. **Passwords:**
   - We never store a password.
   - Add correct `autocomplete` attributes (username, current-password, new-password, one-time-code) on every sign-in, reset and set-password field, so Chrome, Google Password Manager and Android autofill offer to save and fill it.
   - Keep or add "Show password".
6. **Tests:** trusted device skips, expiry, revocation by each route, step-up timing, the sliding renewal, the remember-identifier tick box, and that no password reaches storage.

F1-2 The menu button, on the left, everywhere (agent; UI: /code-review low)
- One change to `src/components/app-shell/AppShell.tsx` covers Control, the school web and the Teacher app:
  - **Phones:** the menu button moves to the **left** of the top bar at every width. It opens the menu as a drawer from the left. The same button, a tap outside, or Esc closes it.
  - **Tablets and computers:** the same button hides the sidebar completely, so the page uses the full width, and shows it again. The choice is remembered on that device (localStorage inside try/catch).
  - Keep the phone's bottom quick bar.
- Accessibility and motion: 44 px target, `aria-expanded` and `aria-controls`, focus returns to the button, and no slide animation under reduced motion.
- The Family app keeps its five bottom tabs.
- Pictures before and after at 360, 390, 768, 1024 and 1440 px for Control, the school web and the teacher phone view.

F1-3 M1 follow-ups (agent; AI path: /code-review medium)
1. **No database connection held while the AI answers:**
   - Split the Understand request: checks and reads in one short transaction → the provider call with no connection held → the writes (cache, usage, progress) in a second short transaction.
   - Test with a slow stand-in adapter that the pool connection is released during the call.
2. **Typed questions:** the server must not trust the subject the screen sends. Answer only in a subject the child may use. If the question is about another subject, say so plainly and point to that subject.
3. **Hindi chapter names:**
   - Fill `title_hi` from CBSE's official Hindi curriculum documents for 2026-27 if they exist, with their own source lines.
   - If none exist, leave the English names, and record that in the catalog README. Never machine-translate titles without a review step.
   - Fill class X Science topics from the official document if it lists them; otherwise say so.
4. **Catalog proof sheet for the founder's approval:**
   - For each of the four versions, one page (`docs/family-app/catalog-proof/`) showing a picture of the CBSE document's course-structure page beside our list of units, chapters and topics.
   - The founder approves in Control by comparing them.
   - The supervisor's cloud session cannot reach cbseacademic.nic.in, so the proof comes from your Mac.
5. **Demo script:** the parent PIN is 6 digits; correct the Hindi demo text.

F1-4 The Android app file (lead, last; founder approves the commands)
- Install a JDK (17 or 21) and the Android command-line tools with Homebrew. Ask the founder to type "yes" to accept the Android SDK licence when the tool asks. That is his decision; never accept it yourself.
- Build a debug APK of the Family app shell.
- Give the founder two ways to install it on his Android phone: a USB command, or the APK file to send to his phone.
- If the founder's Play account exists, also prepare the internal-test upload; otherwise list it as a founder action.

NEVER
- Print, log or commit a secret, or a value from Vercel or the database's credentials.
- Store a password.
- Lengthen the session of a revoked device.
- Skip step-up for credentials or impersonation.
- No Co-Authored-By line and no model name anywhere.

AGENTS AND MODELS
- F1-1 by the lead on the strongest model. F1-2 and F1-3 in parallel as agents in their own worktrees: F1-2 on a faster model, F1-3 on the strongest. They touch different files.

GATES AND REPORT
- 07 §3 gates for each slice. Run the full ci_local.sh once on the top of the stack.
- Report in the Transparent Output Template, founder actions first, short.
- Include a phone test script for the founder:
  - sign in to Control on his phone with "trust this browser" ticked;
  - close the browser and reopen it: no code asked;
  - the menu button on the left opens and hides the menu;
  - enter the AI key in Control → AI;
  - run the M1 Hindi demo.
