CONTEXT: From the Claude Code build lead to the supervisor and the founder (Noor). This is how M2b, the Focus Lock ("learn to unlock", `docs/34` §9, 07's M2b row, C230-N), is built: eight slices as a stack of PRs on base main, after P1. Built by CLAUDE.md; Decision Log row C304 records this plan, and C305–C312 are reserved for its slices.

# M2b build plan: the Focus Lock

## What is already there

- **The Android app:** a Capacitor shell (`android/`, `capacitor.config.json`, F1-4) that loads `/family` from our
  deployment. It has no native code of its own yet (`MainActivity` is the stock bridge).
- **The parent PIN** (M1): set at sign-up, stored as a salted hash, reset by an email code (`src/lib/family/pin.ts`,
  `/api/family/pin/*`).
- **"Today's plan is done"** (M2-2): built once per child per India day and done only from checked answers
  (`src/lib/family/plan.ts`). Offline answers count once they sync (M2-9).
- **Not on this Mac:** the Android SDK, Gradle and `adb`. Slice M2b-3 installs them (Temurin JDK 21 and Google's
  command-line tools, from their official sources).

## Decisions (C304)

- **One native plugin, in the same app.** A Capacitor plugin `FocusLock` (Kotlin, in `android/`) holds the lock. The
  web app sets it up and shows the parent area; the plugin enforces it. There is no second app, because most pilot
  children use a parent's phone (§9).
- **How it sees and covers an app:**
  - It learns which app is in front from **usage access** (`PACKAGE_USAGE_STATS`), read on the phone.
  - It covers a locked app with our block screen. To open that screen from the background on Android 10 and later, it
    needs **"display over other apps"** (`SYSTEM_ALERT_WINDOW`). The parent grants both in Settings, with guided steps.
  - **No Accessibility API**, as §9.3 says.
  - **No `QUERY_ALL_PACKAGES`:** the app list comes from a `<queries>` entry for launcher apps, which Play does not
    restrict.
- **It runs all day as a foreground service**, with the visible "NetCyberAI Focus is on" notification. On Android 14
  and later the service type is `specialUse`, declared to Play.
- **The rules live only on the phone:**
  - What they hold: the chosen apps, the lock times, the parent-session length, the WhatsApp choice and the educational
    apps the parent marked.
  - They are encrypted with a key held in the Android Keystore.
  - Nothing about which app was opened, or when, is sent anywhere. **Test:** every request the plugin makes goes
    through one client with two allowed endpoints and a fixed request body, and a test fails on any other host, path or
    field.
- **What the server sees:**
  - **Status.** `GET /api/family/focus/status` returns, for the children set for that phone: whether today's plan is
    done, the pending items (titles and keys, for the block screen), and the PIN's version.
  - **Lock health.** `POST /api/family/focus/heartbeat`, about every 30 minutes during lock times. It carries only
    "the lock is on", "its permissions are granted" and "the clock was changed". It never carries an app name or a time
    of use.
  - **Open for the supervisor:** the heartbeat is lock health, not monitoring of the child, but it does go one step
    beyond §9.3's "the server only knows the plan is done". Without it the parent cannot be told when the lock was
    removed. The lawyer sees it before the public listing (gate L2).
- **The PIN works offline.**
  - At set-up the parent's PIN is checked once against the server. The phone then keeps its own salted hash (PBKDF2,
    in the encrypted rules) and the PIN's version.
  - When the server's PIN version changes (a reset), the lock asks the parent to enter the new PIN.
  - Five wrong PINs bring waits that grow (1, 5, then 15 minutes, then 1 hour). There are no hints, and the PIN is never
    shown.
- **"Done" sticks for the day.** Once the server says today's plan is done, the apps stay open for the rest of that
  day's lock window, even offline. The day is the India date from the server, never the phone's clock. A clock change
  is reported as tampering.
- **A shared phone with more than one child:** the block screen asks "Who is using the phone?". It opens the apps for
  that child's done plan, for that session only. It locks again when the screen turns off.
- **Always open:**
  - the dialler, contacts, messages and emergency calls;
  - our own app;
  - the apps the parent marked educational;
  - WhatsApp, if the parent chose so.
  During lock times, Settings and the Play Store are locked too.
- **What we promise, exactly as §9.2 says:** hard to bypass, every bypass detected and reported, nothing changeable
  without the PIN.
  - **Uninstalling outside lock times is possible**: Settings is open then, and no device-admin trick is used, because
    Play restricts it. If the heartbeat stops, the parent is told.
  - Safe mode and a factory reset cannot be prevented by any ordinary app. They also show up as a stopped heartbeat.
- **A child's own phone** (§9.4): the parent's app shows a one-time code (6 digits, valid 10 minutes, used once,
  stored hashed). The child's phone enters it and gets a session for that one child. The parent can revoke it from the
  parent area. The parent PIN still guards settings on that phone.
- **Control:** a `focus_lock` module flag in Control → Apps, **off by default**. It is switched on only for the closed
  pilot families, whose parents have given written consent (§9.3).

## Slices

| # | Slice | Owner | Needs | Done when |
|---|---|---|---|---|
| M2b-1 | Server: focus status, lock-health heartbeat, `family.focus_devices` (a hashed device id, the children set for it, last heartbeat, three flags; no app data), the parent's tamper notice (parent area and email), the `focus_lock` flag | Lead | M2 | RLS with two accounts; status says "done" only from checked answers; a heartbeat with any field beyond the three is refused; a stopped heartbeat during lock times tells the parent once |
| M2b-2 | A child's own phone: one-time link code, a child-scoped device session, revoke | Lead | M2b-1 | Code used once, expires, hashed, rate-limited; the session reaches one child only; revoke ends it at once (security review) |
| M2b-3 | Android tooling and the plugin's core: SDK on the Mac, a Gradle build in CI, the rule engine (lock times by weekday, the always-open list, "done" for the day, PIN waits) as plain Kotlin with JVM tests | Lead | — | The APK builds in CI; rule-engine tests cover every rule of §9.1 |
| M2b-4 | Set-up, in the parent area: the disclosure, choose apps from the phone's list (suggestions: games, video, social, browsers, YouTube), lock times, parent session, WhatsApp, educational apps; the guided permission steps and per-brand battery and autostart steps | Agent | M2b-3 | A parent completes set-up on an emulator; a missing permission blocks "Start" with the step to fix it; Hindi and English |
| M2b-5 | The lock: the foreground service, the block screen with the pending list and "start the next one", unlock on "done", the PIN session that re-locks on screen-off or timeout, Settings and the Play Store locked in lock times, "who is using the phone?" | Lead | M2b-1, M2b-3 | On an emulator: a locked app is covered; finishing the plan opens it; calls open; the PIN session re-locks; 5 wrong PINs bring a wait |
| M2b-6 | Tamper: a permission revoked, the clock changed, a reboot, a force-stop (heartbeat gap); the outgoing-requests test | Lead | M2b-5 | Each case reaches the parent; the request test fails on any extra field or host |
| M2b-7 | Play readiness: the monitoring-tool, foreground-service, overlay and usage-access declarations; the privacy policy section; Data safety answers; the closed-test track; release signing with the upload key off the repository | Lead | M2b-5 | A signed build is accepted on the closed-test track |
| M2b-8 | Real phones: the acceptance pass of 07's M2b row on the founder's test phones, one of each brand pilot families use; fixes | Lead | M2b-7 | Every line of 07's acceptance test passes on every brand, with screenshots |

Reviews by CLAUDE.md: M2b-1, M2b-2 and M2b-6 touch auth or personal data, so each gets `/code-review` (medium) and
`/security-review`. The others get `/code-review` (low).

## What only the founder can give

1. **A Google Play developer account.** An organisation account is recommended; it needs a D-U-N-S number. A new
   personal account must first run a closed test with 12 testers for 14 days (`docs/34` §8). Needed by M2b-7.
2. **The phone brands pilot families use**, and one test phone of each. Needed by M2b-4's per-brand steps and by M2b-8.
3. **Written consent from each pilot parent** for the Focus Lock. We draft the text; the parents sign it. Needed
   before the flag is switched on for any family.

## Order

M2b starts after P1 (C230-S). M2b-1 and M2b-3 do not depend on each other and can run side by side (separate
files: server and `android/`). M2b-2 follows M2b-1. M2b-4 and M2b-5 follow M2b-3, then M2b-6 to M2b-8 in order.
