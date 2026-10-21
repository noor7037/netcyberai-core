# The Family app's Android shell (M1-8, C254)

A native Android app made with Capacitor 7 that shows the live Family app (`https://www.netcyberai.com/family`), as
`docs/34_ECOSYSTEM_AND_SYNC.md` §8 and C230-N decide (not a Trusted Web Activity). Screens load from the deployment, so
a merge reaches phones at once; only native code (the Focus Lock in M2b, push later) needs a Play release.

| Part | Where |
|---|---|
| Package name, app name, start address, allowed hosts, offline page, version in the user agent | `capacitor.config.json` |
| The Android project | `android/` (made by `npx cap add android`) |
| The offline page (no connection) | `android-shell/www/offline.html` (the web app has its own at `/family/offline`) |
| Launcher icons and splash, from `public/brand/logo-mark.svg` | `node scripts/android/brand-assets.mjs` |
| The web install manifest, kept for browsers | `public/family.webmanifest` |
| Oldest accepted shell version | Control → Apps → Family app (the shell reports `NetCyberAIFamily/<versionCode>`) |

**Not in M1:** any lock, usage access, overlay or accessibility permission. The Focus Lock is milestone M2b.

## Building a package (a Mac with Java and the Android SDK)

1. Install a JDK 21 and the Android SDK (Android Studio, or the command-line tools), and accept Google's SDK licence.
2. `npm ci`, then `npx cap sync android`.
3. **Signing, kept off the repository:** make an upload key once
   (`keytool -genkeypair -v -keystore ~/keys/netcyberai-upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000`)
   and write `android/keystore.properties` (ignored by git):
   `storeFile=/Users/<you>/keys/netcyberai-upload.jks`, `storePassword=…`, `keyAlias=upload`, `keyPassword=…`.
   Back the key up somewhere safe; Play App Signing holds the app signing key.
4. `cd android && ./gradlew bundleRelease` → `android/app/build/outputs/bundle/release/app-release.aab`.
5. A test build for one phone, without Play: `./gradlew assembleDebug` → `app-debug.apk`.

## Putting the test build on your own Android phone (F1-4, C261)

The debug build (`android/app/build/outputs/apk/debug/app-debug.apk`) is signed with a debug key made on the Mac that
built it. It is for your own phone only, never for Play. It opens the live Family app, so it shows whatever is
deployed.

**Way 1: a USB cable.**
1. On the phone: Settings → About phone → tap "Build number" seven times (developer options), then Settings → System
   → Developer options → turn on "USB debugging".
2. Connect the phone to the Mac and tap "Allow" on the phone's "Allow USB debugging?" question.
3. On the Mac: `/opt/homebrew/share/android-commandlinetools/platform-tools/adb install -r android/app/build/outputs/apk/debug/app-debug.apk`
   (it answers "Success"). "NetCyberAI Family" is now on the phone.

**Way 2: send the file to the phone.**
1. Send `app-debug.apk` to yourself (Google Drive, email or WhatsApp to yourself).
2. On the phone, open it from Files or the message, and allow "Install unknown apps" for that app when Android asks.
3. Tap Install. Android may warn that the app is from an unknown developer: that is this debug key; tap "Install
   anyway".

To replace it later, build again and repeat either way: the new one installs over the old one (same debug key on the
same Mac).

**This Mac's set-up** (2026-10-21): JDK 21 (`/opt/homebrew/opt/openjdk@21`), the Android command-line tools from
Homebrew (`ANDROID_HOME=/opt/homebrew/share/android-commandlinetools`, the founder accepted Google's SDK licences), and
platform 35, build-tools 35.0.0 and platform-tools. The Gradle wrapper fetches the `-bin` distribution (the build tools
without their sources and docs, 90 MB less on a slow connection).

## Play internal test (once the Play developer account exists)

1. Play Console → Create app: "NetCyberAI Family", app, free; accept the declarations.
2. Set up Play App Signing (Google holds the app key; upload the `.aab` signed with the upload key).
3. Testing → Internal testing → Create release → upload the `.aab` → add the founder's Google account as a tester.
4. Open the tester link on the phone, accept, and install from Play.
5. Before a closed or production release: privacy policy, Data safety form, target audience (children: the Families
   policy), content rating (docs/34 §8).
