# focuslock-core: the Focus Lock's rule engine

The rules of the Focus Lock (`docs/34_ECOSYSTEM_AND_SYNC.md` §9.1, decisions C304, slice M2b-3), as plain Kotlin on
the JVM. It has no Android classes, so every rule is tested on a laptop or in CI without a phone or an emulator. The
app depends on it (`android/app/build.gradle`), and the FocusLock plugin (M2b-4, M2b-5) calls it.

```
cd android && ./gradlew :focuslock-core:test
```

## What it decides

`FocusEngine.decide(packageName, rules, device, state, clock)` says whether the app in front may be used, or which
block screen covers it. The checks run in this order:

1. Our own app and the calling apps are always open.
2. A parent session opens everything.
3. Outside lock times, everything is open.
4. In lock times, Settings, the Play Store and the installer need the PIN.
5. Educational apps stay open, and so does WhatsApp if the parent chose. Apps the parent did not choose stay open.
6. A chosen app opens only when the server says today's plan is done, up to the parent's limit. Otherwise the block
   screen lists what is pending, or asks "Who is using the phone?" on a shared phone.

| Part | Files |
|---|---|
| India date, weekday and minute (UTC+05:30, no java.time) | `IndiaTime.kt` |
| The lock's clock: server time carried by time since boot; clock changes flagged | `TrustedClock.kt` |
| Lock times, always-open and PIN-only packages, the parent's rules and their checks | `Rules.kt` |
| PIN hash (PBKDF2-HMAC-SHA256), PIN version, wrong-PIN waits | `Pin.kt` |
| Decisions, "done" for the day, parent and child sessions, the limit after "done" | `FocusEngine.kt` |

## §9.1 rules and their tests

| Rule | Test class |
|---|---|
| 1. Only the parent sets the PIN; it guards every setting | `Rule1ParentPinTest` |
| 2. Apps unlock only when today's plan is done; it sticks for the day; the parent's limit | `Rule2DoneForTheDayTest` |
| 3, 6. Blocked with the pending list and the next item; "Who is using the phone?" | `Rule3And6BlockScreenTest` |
| 4. Calls always work; WhatsApp as the parent chose | `Rule4CallsAlwaysWorkTest` |
| 5. Only chosen apps, at set times by weekday; our app and educational apps open | `Rule5LockTimesTest` |
| 7. The parent session re-locks after its time or on screen-off | `Rule7ParentSessionTest` |
| 8. Waits after 5 wrong PINs, no hints, Settings and Play Store locked, clock changes flagged | `Rule8NoBypassTest` |

`IndiaTimeTest`, `Pbkdf2Test` and `TrustedClockTest` check the helpers against java.time, the JVM's own PBKDF2 and an
RFC 7914 test vector. `EngineSourceGuardTest` keeps out Android classes, java.time, Base64, network, files and logging.

## Not here

Each of these belongs to a later slice:

- **M2b-4:** set-up and the guided permission steps.
- **M2b-5:** the foreground service, reading the app in front, drawing the block screen, and the encrypted rules file
  (Android Keystore).
- **M2b-6:** reporting a tamper case (a permission revoked, a force-stop, safe mode, a changed clock) to the parent.

## Choices to know

- **"Done" needs the server's clock.** After a restart, "done" waits for the next status reply. Until then, the
  lock's clock is only the phone's clock, never earlier than the last time the lock saw.
- **The parent's limit after "done"** counts minutes of use of the locked apps that day, not time since "done".
- **Settings, the Play Store and the installer** stay PIN-only for all of the lock times, even after "done".
- **A night lock is two windows**, for example 21:00–24:00 and 00:00–07:00.
- **The PIN hash** uses 100,000 rounds. The count is stored in each hash, so it can change later.
