CONTEXT: From the supervisor (independent CTO and principal architect) to the Claude Code build lead, for Noor, a non-technical founder. W2 carries out the founder's decisions of 2026-10-22 (C230-T): an internal demo pilot, AI within verified free terms, one sign-in system, founder control, the APK pipeline, devices and permissions, then the Teacher App. Work by CLAUDE.md; inspect before building; reuse; challenge with evidence; report in plain words, founder actions first. W2 replaces P1's pilot (Class 5 EVS) and comes before M2b.

THE FOUNDER'S DECISIONS (binding)
- **Pilot:** internal testing now, with synthetic data only.
  - A fictional "NetCyberAI Demo School", CBSE, English medium with Hindi support.
  - Class 6 Science, two chapters: `cbse.c6.science.ch04` Exploring Magnets (5 topics) and `cbse.c6.science.ch08` A Journey through States of Water (7 topics).
  - No real school and no real child yet.
- **Infrastructure:** the existing hosting and the test database. No Supabase Pro, no cutover now (C103 stands).
- **Money:** no paid service or API without Noor's approval.
- **Scope:** the whole agreed product (the Family app, the Teacher App and Control), extensible, with real workflows. Never a Class 6-only build and never a facade.
- **Honesty:** every screen and report says what works, what is blocked, and why. Nothing is called production-ready until verified.

AI PROVIDERS (C230-U replaces C230-T's AI rules; evidence and sources in `docs/family-app/AI_PROVIDERS.md`)
- **Real AI for children now, free: Cloudflare Workers AI**, with open-weight models (Llama, Gemma, Whisper). The supervisor built its adapters (`src/lib/ai/adapters/workers-ai.ts`: text, photos, speech).
  - No clause in Cloudflare's terms or the models' licences bars a product for children.
  - Cloudflare does not train on what is sent.
  - The free plan stops with an error at 10,000 neurons a day; it never bills.
  - It serves every profile now, adults' tools included. The founder enters `<account id>:<token>` and clears it for minors in Control → AI.
- **OpenAI** is no longer eligible for children's profiles in code: its terms forbid users under 13.
- **Gemini** has an adapter but stays unconfigured. Its terms are 18+ only, and whether an adult tool on a site children use is "likely to be accessed" by under-18s is unanswered by Google.
- **Anthropic** (allows minors with safeguards; paid) becomes the children's primary when Noor approves the spend, with Workers AI as its fallback.
- **YouTube Data API:** allowed for a child-directed app with obligations.
  - Notify Google that the API client is child-directed (the Developer Policies' child-directed section).
  - Tracking off, the privacy-enhanced embed, and tap to load.
  - The free quota is 10,000 units a day, and a search costs 100 units, so keep `family.video_searches_per_day` (90) under it.
- **Google Custom Search JSON API:** closed to new customers; it ends on 2027-01-01. Not used.
- **Keys** live only in Control → AI, sealed (10 §3). A spent quota hands the call to the next provider, then shows the plain "try again later" message.
- **Yours on the AI path** (W2 item 1, before the demo):
  - add `content.prepare` (no child's words) and move the prepare path onto it;
  - a moderation pass with Llama Guard on Workers AI, on a child's typed words and on answers;
  - the "made by AI" notice, with "Built with Llama" on the AI page (the Llama licence);
  - tune the resolver prompt until Llama returns our JSON blocks reliably, measured on the 2 demo chapters;
  - after the founder's key, a live smoke test of text, a photo and a recording, closing the three "not verified yet" points in AI_PROVIDERS.md.

YOURS, IN THIS ORDER (one coherent slice each; CLAUDE.md sizes and reviews; auth slices get /code-review medium plus /security-review)
1. **The demo pilot.**
   - Settings: `family.open_subjects` and `family.reviewed_only_subjects` become `["science"]`, by migration, test database first.
   - Synthetic accounts: a parent and a Class 6 child under the demo school, and a teacher. They live only in `src/demo-fixture/**` and the harness seed, or as clearly synthetic rows on the test database. Never in product UI code.
   - Add the `content.prepare` profile and move the prepare path onto it.
   - When Noor has entered the Workers AI key, prepare the 2 chapters + 12 topics × English and Hindi (28) for review.
2. **Sign-in: one identity system (Supabase Auth).** Inspect `src/lib/auth/**` and the Family session (`src/lib/family/session.ts`) first.
   - **Google first.** "Continue with Google" is the primary option for families, teachers and staff. It takes the verified email and the name and photo Google gives.
   - **Email second.** "Continue with email": email and password, with email confirmation and password reset.
   - **One app session.** The Family app keeps its own app session, issued only after Supabase Auth has proved who it is. There must never be two identity stores for one person.
   - **Control and money** keep the authenticator (C257) on top of either sign-in.
   - **Linking and duplicates.** Link accounts only by verified email. An unconfirmed email-and-password account must never capture a later Google sign-in. Test that this pre-account takeover is impossible.
   - **Auth emails go through our existing sender** (`src/lib/email/sender.ts`), for example Supabase's send-email hook, if Supabase's built-in mail is limited. Verify its limits first.
   - **After sign-in, missing details:**
     - name;
     - role;
     - an optional mobile number, unverified; never used to sign in and never sent an SMS.
   - **Roles.**
     - A person may choose only "parent", or "I teach at a school", which asks to join through an invitation or a school's code.
     - Teacher, school admin and staff roles come only from an invitation or from Control.
     - Super admin is never self-chosen.
   - **Returning users** land where their role belongs. Sessions survive app restarts (C257).
   - **Google sign-in in the Android app.** Google refuses OAuth inside an embedded WebView (`disallowed_useragent`), and the Capacitor shell is one.
     - In the app, run the Google step in the system browser (Custom Tabs) and return by a verified App Link, or use Android's Credential Manager.
     - Test it in the APK, not only in a browser.
   - **Founder input:** a Google OAuth client. Write Noor the exact clicks: Google Cloud → OAuth client → paste into Supabase → Auth → Google. That step is his, because it is his Google account.
3. **Founder control.**
   - Noor's existing account is the designated super admin. Find it from the database, never from code text.
   - Control → Accounts: every family and school account; search; and per account:
     - unlock or restrict modules, subjects, syllabi, features and entitlements;
     - suspend, and revoke sessions.
   - Each change carries a reason and is audited.
   - Raising any role is a definer function that only a super admin with the authenticator may call. The database refuses self-elevation. Test it.
4. **The APK pipeline.**
   - The shell (`capacitor.config.json`) loads the live site. Web changes therefore reach installed apps on their next open; only native changes need a new APK.
   - Write this down for testers.
   - Add a GitHub Actions workflow: on a release tag, build a signed APK with `versionCode` increasing and `versionName` from the tag, and send it to testers with **Firebase App Distribution** (free).
   - The signing key and the Firebase credential are only in GitHub secrets, never in the repository. Keep the package id `com.netcyberai.family` and one signing key forever.
   - Use the existing oldest-accepted-version check (M1-8) to ask a tester to update.
   - If you cannot set the secrets yourself, give Noor the exact clicks.
5. **Devices.**
   - A device registry for families and staff: account, app version, device model and Android version (from the user agent or Capacitor's Device plugin), the first and last time seen.
   - An app-scoped installation id: a random UUID the app creates and keeps. Never IMEI, Android ID or the advertising ID.
   - Show the counts of registered and active devices, with "active" defined on screen: used in the last 7 days.
   - Revoke a device's sessions, or all of an account's.
6. **Permissions.**
   - The Android manifest declares only what a built feature uses.
   - Ask at the moment of use, with a plain sentence first:
     - the microphone for voice;
     - the camera for a photo;
     - the Android Photo Picker for an existing picture, never broad media access;
     - notifications only when a feature sends them, and optional.
   - No location, contacts, SMS or call log.
   - The Focus Lock's usage access and overlay come only with M2b and its own disclosure.
   - The privacy page lists each permission and why.
7. **The Teacher App** (the school app's teacher role), by `docs/16` and `docs/17`.
   - Its daily journeys work end to end on synthetic data: sign-in, classes and students, attendance, homework and practice from the catalog, a student's progress, messages to parents (the send-gate as it is).
   - Plan the slices in a plan file and a Decision Log row before building.
8. **Then M2b**, the Focus Lock (`M2B_PLAN.md`).

DONE MEANS (W2)
- On the live site, with synthetic accounts only:
  - a parent signs in with Google and with email;
  - a teacher joins through an invitation;
  - Noor unlocks a subject for one account and sees the audit row;
  - a device appears in the registry and its session is revoked.
- A tester installs a versioned APK from Firebase App Distribution, and the next tagged release reaches them.
- The demo child opens Exploring Magnets and sees only checked explanations, or the honest "being checked" state.
- Every screen marks what is blocked (for example "live AI for children is not switched on yet") instead of pretending.

GATES: 07 §3, as before. No Co-Authored-By line and no model name anywhere. No paid service without Noor's approval.
