# Play Console form answers (C541)

Every answer below comes from the repository (manifests, `capacitor.config.json`, `docs/34_ECOSYSTEM_AND_SYNC.md` §8-§9, `docs/family-app/prompts/M2B_PLAN.md`, `src/lib/family/focus.ts`, `FocusOutbound`). Anything not confirmed is `[GAP: ...]`. Play's wording changes; if a question differs, answer by the facts here.

## 1. Data safety

### NetCyberAI Family (com.netcyberai.family)

Overall: "Does your app collect or share any of the required user data types?" Yes. "Is all of the user data collected by your app encrypted in transit?" Yes (the app loads `https://www.netcyberai.com/family` only; cleartext is off in `capacitor.config.json`). "Do you provide a way for users to request that their data is deleted?" Yes: the parent deletes a child's answers, or the whole account, in the parent area; also by email request. https://www.netcyberai.com/privacy#delete-account (Play needs a web address for this).

| Data type (Play's list) | Collected | Shared | Purpose | Optional | Notes |
|---|---|---|---|---|---|
| Personal info: Email address | Yes | No | Account management | No | The parent's email, for the sign-in code |
| Personal info: Name | Yes | No | App functionality | No | The child's first name, chosen by the parent. Removed before anything goes to the AI |
| App activity: In-app actions and other user-generated content | Yes | No | App functionality | No | Checked quiz and test answers and progress, kept so the parent can see and delete them. Typed questions are answered by AI and never kept in the shared library |
| Photos and videos: Photos | Yes | No | App functionality | Yes | A photo of a textbook page for help. Read once, not stored |
| Audio: Voice or sound recordings | Yes | No | App functionality | Yes | Voice questions and English speaking practice, only after a microphone tap. Read once, not stored |
| Device or other IDs | Yes | No | App functionality | Yes | The browser's push-notification subscription if the parent turns notifications on. `[GAP: confirm no advertising or device ID is read by any plugin]` |

Not collected: location, contacts, calls, SMS, financial info, health, web browsing history, advertising ID. `[GAP: crash or diagnostic logs: confirm with the lead whether the deployment keeps any, and add "Crash logs / Diagnostics" if it does]`.

"Shared" is No because the AI providers process the (name-free) text, photo or audio on our behalf as service providers and Play does not count that as sharing. `[GAP: lawyer to confirm this reading for the AI providers and the school link]`. Data from a school the parent links stays between the family and that school.

Security practices to tick: data encrypted in transit; users can request deletion; the app follows Play's Families policy (Family only).

### NetCyberAI Focus (com.netcyberai.focus)

Overall: collects data: Yes (three yes or no facts and a phone id). Encrypted in transit: Yes (the app's only host is `www.netcyberai.com`, HTTPS). Deletion: Yes, by removing the phone in the Family app's parent area, or by uninstalling.

| Data type | Collected | Shared | Purpose | Optional | Notes |
|---|---|---|---|---|---|
| Device or other IDs | Yes | No | App functionality | No | A random id made on the phone. The server keeps only a keyed hash of it, never the id itself |
| App info and performance: Diagnostics (the lock's health) | Yes | No | App functionality | No | Three flags about every 30 minutes while the lock is on: lock on, permissions on, clock changed. Nothing about any app name or time of use |
| Personal info: other | No | | | | The parent PIN is checked once against our server at set-up (sent over HTTPS, not stored by the Focus app); the phone keeps only a salted hash |

Not collected or sent: which apps are opened or when, the list of installed apps, location, contacts, messages, photos, calls, browsing, advertising ID. These stay on the phone (the Focus app has exactly four requests: pass redeem, status, heartbeat, PIN check).

The app uses Usage access and Display over other apps, which are read on the phone and never transmitted. State this in the free-text field if Play offers one.

## 2. Content rating (IARC questionnaire)

Email for the certificate: admin@netcyberai.com.

| Question | Family | Focus |
|---|---|---|
| Category | Reference, News or Educational | Utility, Productivity, Communication, or Other (Play shows the list; choose the nearest to a parental control tool) |
| Violence, blood, fear | No | No |
| Sexual content or nudity | No | No |
| Profanity or crude humour | No | No |
| Controlled substances (drugs, alcohol, tobacco) | No | No |
| Gambling or simulated gambling | No | No |
| User-generated content or user interaction | The child types questions to an AI tutor and gets AI-generated answers; no chat between users. Answer the AI-content prompt truthfully (the answers pass a safety check before being shown) | No |
| Shares the user's location | No | No |
| Allows purchases of digital goods | No (none found in the code) | No |
| Unrestricted internet access | No: pages load from our own site only. `[GAP: lead to confirm that no in-app link opens the open web for a child]` | No |

Expected result for Family: the lowest rating (3+ or equivalent). The rating is Play's output; do not promise it in the listing.

## 3. Target audience and content

### NetCyberAI Family

- Target age groups: 5 to 8, 9 to 12 and 13 to 15 and 16 to 17 (the app covers Classes 1 to 12). Because it includes children under 13, the app is **designed for children and families** and Play's **Families policy** applies.
- Appeals to children: Yes.
- Opt into the Designed for Families program: Yes, when the app meets all of these. Checklist from the repository:
  - No advertising and no ad SDKs: true (no ads of any kind; `forms.md` section 5). `[GAP: lead to run a dependency check of `android/` and the web bundle for any ad or analytics SDK before submission]`.
  - Only data needed for the app's purpose is collected, with no advertising ID: true by design; see section 1.
  - Parent controls: the parent area sits behind a 6-digit PIN; the parent can see and delete a child's answers and delete the account.
  - Privacy policy that covers children: `https://www.netcyberai.com/privacy`, section 4 (children's data) and 6 (rights).
  - AI-generated content: disclosed in the app ("made by AI and can be wrong"); a safety check runs on every question and answer.
  - Sign-in: the parent signs in with an email code; a child on a shared phone does not sign in. On a child's own phone the parent approves a one-time code.
- **Teacher Approved: not claimed.** Do not apply for it, and do not use the words "teacher approved" in the listing.
- Store listing shows no content that misleads children, and no link out of the app to anything but our own pages.

### NetCyberAI Focus

- Target age group: **18 and over only**. It is a tool for parents. Do **not** select any age under 18, and do **not** join Designed for Families.
- Appeals to children: No. (It is a parental control, installed by the parent. The children it controls are not its audience.)
- Play's Families policy does not apply; the Focus app must still follow the monitoring-app rules in section 12.

## 4. App access

Both apps need a parent account, so tell Play how to sign in.

- **NetCyberAI Family:** sign-in is by an emailed 6-digit code, so a reviewer needs an address that receives it.
  - Instructions text to paste: "Open the app, tap Sign in, enter the reviewer email play-review@netcyberai.com, then enter the 6-digit sign-in code: the six-digit code in the private file the supervisor sent you. The parent area asks for a PIN: [GAP: reviewer PIN]. A child profile is already added."
  - `[GAP: the lead chooses the mechanism that gives a reviewer a code that works (a fixed reviewer account, or an inbox the reviewers can read) and fills the placeholders]`.
- **NetCyberAI Focus:** it is connected from the Family app. Instructions text: "Install both apps from the same Play track. Sign in to NetCyberAI Family with the reviewer account above, open Parent area > Focus Lock > Connect. NetCyberAI Focus opens by itself. Enter the parent PIN [GAP: reviewer PIN], switch on the steps shown (notifications, display over other apps, usage access), choose apps and times, tap Start. Open a chosen app inside the lock time to see the Study first screen." Steps are the ones in `docs/launch/FOCUS_TEST.md`.
- The Focus Lock must be switched on for the reviewer family in Control (Control > Apps > Focus Lock; offered to every family since 21 Nov 2026 per FOCUS_TEST.md).

## 5. Ads

"Does your app contain ads?" **No**, for both apps. No ad SDK is in either app.

## 6. Government apps

"Is your app a government app, or developed by or on behalf of a government?" **No.**

## 7. Financial features

Answer for both apps: **My app doesn't provide any financial features** (no loans, banking, investing, crypto, payments of ours).

Facts checked: neither app takes payment or sells anything, and neither has in-app purchases or a subscription in the code. One thing to note: in the Family parent area a parent with a linked school can see that school's fees and tap "Open my UPI app" or scan a UPI QR; the money goes to the school's own UPI account and we only show the details (`src/components/family/SchoolFees.tsx`). We do not process, hold or move money.

`[GAP: lead and founder to decide whether Play's "Payments / bill payment" option should be ticked for the School Link fee view. Recommended answer: no financial features, since the app only displays a school's UPI details and opens the parent's own UPI app.]`

## 8. Health

"Does your app have health features?" **No.** (Not a health or medical app; no health data.)

## 9. News

"Is your app a news app?" **No.**

## 10. Foreground service declaration (Focus only)

Manifest facts: `android.permission.FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_SPECIAL_USE`; service `.FocusService`, `foregroundServiceType="specialUse"`, subtype property "Parental control set up by the parent: keeps chosen entertainment apps closed during study times until the child's study for the day is done."

Play Console: App content > Foreground service permissions.

- **Foreground service type:** Special use.
- **Why no standard type fits:** the service must keep checking which app is in front all day so it can show the "Study first" screen at once. None of the standard types (camera, location, media playback and so on) describes a parental-control lock.
- **Description (paste):**
  "NetCyberAI Focus is a parental control app. The parent chooses entertainment apps and study times in the app. A foreground service runs while the lock is on so it can notice, on the phone only, when one of those apps comes to the front during a study time, and then show a 'Study first' screen over it. It also sends a short health report (lock on, permissions on, clock changed) about every 30 minutes and reads whether today's study is done. It is started by the parent tapping Start, it shows the permanent notification 'Focus Lock is on', and it stops when the parent stops the lock or the lock window ends."
- **User impact if the service is stopped or delayed:** "The chosen apps would not be covered during study time, so the child could open them before finishing the day's study. The parent would be told in the parent area that the lock stopped reporting."
- **Is the work user-initiated and visible?** Yes: the parent starts it, and the notification is always visible.
- **Can it be deferred or run with WorkManager?** No: the lock must react at once when an app opens; a scheduled job every few minutes would let a locked app stay open.
- **Video:** link to the screen recording made from `video-script.md`. `[GAP: video link (YouTube unlisted or Drive) from the founder]`.

## 11. Permissions declarations (if Play asks)

Play does not list usage access or display over other apps as restricted permissions needing a form, but it may ask during review. Paste these.

- **Usage access (`PACKAGE_USAGE_STATS`):** "NetCyberAI Focus is a parental control app. A parent grants usage access in Android Settings so the app can learn which app is in front, on this phone only. This lets it close the entertainment apps the parent has chosen during study times. The information is used on the phone to decide whether to show the block screen. It is never sent to our server or anyone else, and is not used for advertising or analytics. The parent can switch the access off in Settings; the app then tells the parent that the lock is off."
- **Display over other apps (`SYSTEM_ALERT_WINDOW`):** "Used only to show the 'Study first' screen on top of a locked app during the parent's study times, because Android 10 and later do not let an app in the background open a screen over another app. The screen lists what is left to study today and a button to start, and gives the parent PIN entry for the parent. It shows nothing else and never shows advertising."
- **Package visibility:** the app does not use `QUERY_ALL_PACKAGES`. The list of apps the parent chooses from comes from `<queries>` entries for launcher apps, browsers, the home screen and Settings screens.
- **Other permissions:** `INTERNET` (read study status, send the three flags), `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_SPECIAL_USE` (section 10), `RECEIVE_BOOT_COMPLETED` (the lock comes back after a restart), `POST_NOTIFICATIONS` (the permanent notice).
- **Not used, and we say so:** Accessibility service, device administrator, battery-optimisation exemption request.

NetCyberAI Family: `INTERNET`, `RECORD_AUDIO` (only after a microphone tap, voice questions and English practice) and `MODIFY_AUDIO_SETTINGS`. No camera permission: the phone's camera app takes the photo.

## 12. Monitoring app declaration and `isMonitoringTool` (Focus only)

The Focus manifest carries `<meta-data android:name="isMonitoringTool" android:value="child_monitoring" />`. This is Google Play's flag for a parental-control app that monitors a child.

- **What it means:** the app is declared to Play as a tool that parents use to supervise their own child's phone. Play then reviews it under its rule for stalkerware and monitoring apps (the app must not hide, must disclose monitoring, must not be used to secretly track another adult).
- **What the app monitors (and only this):** which app is in front, on the child's phone, during the parent's lock times; it keeps nothing about it and sends nothing about it.
- **How the rule's conditions are met:**
  - Aimed at parents of their own children only; the listing says so at the top.
  - A permanent "Focus Lock is on" notification is always visible while it runs; the app has a launcher icon and does not hide.
  - Clear disclosure in the listing's first paragraph (English and Hindi), and `[GAP: confirm the Focus app's first screen shows the same disclosure before set-up (docs/34 §9.3)]`.
  - Set up by the parent, with the parent's own account and PIN, through the Family app.
  - What leaves the phone is limited to four requests (`FocusOutbound`): connect with a one-time pass, read today's study status, send three yes or no flags, check the parent PIN once. A test fails if any other host, path or field appears.
  - No ads, no selling of data, no Accessibility API, no device admin.
- **Text to paste if Play asks "Why is your app a monitoring tool?":** "NetCyberAI Focus lets a parent keep chosen entertainment apps closed on their own child's phone during study times, until the child has done the day's study in our learning app. It sees which app is in front on the phone, only on the phone, to do this. It is visible (permanent notification and launcher icon), set up by the parent, and sends nothing about app use to us."
- **Lawyer:** gate L2 requires the lawyer's confirmation of the design before the public listing (`docs/34` §9.3). `[GAP: lawyer confirmation before the production release]`.
