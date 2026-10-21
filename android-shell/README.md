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

## Play internal test (once the Play developer account exists)

1. Play Console → Create app: "NetCyberAI Family", app, free; accept the declarations.
2. Set up Play App Signing (Google holds the app key; upload the `.aab` signed with the upload key).
3. Testing → Internal testing → Create release → upload the `.aab` → add the founder's Google account as a tester.
4. Open the tester link on the phone, accept, and install from Play.
5. Before a closed or production release: privacy policy, Data safety form, target audience (children: the Families
   policy), content rating (docs/34 §8).
