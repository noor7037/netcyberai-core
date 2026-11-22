# Play Store kit (C541)

**Written by:** the build lead's sub-agent. **For:** Noor. **Delivers:** everything to paste into Google Play Console for NetCyberAI Family and NetCyberAI Focus. **Rules that bind it:** only facts found in the repository; anything unknown is marked `[GAP: ...]`.

## Your actions first

1. Fill the `[GAP: ...]` items listed at the end of this page (support email, reviewer sign-in, deletion page web address, lawyer confirmation).
2. Record the 30-second video with `video-script.md` (Android's built-in screen recorder).
3. Paste each file's answers into the Console form named in the table below.

## Order of steps in Play Console (do Family first, then Focus)

1. **Create the app** (All apps > Create app). Family: name `NetCyberAI Family`, default language English (India), App, Free. Focus: name `NetCyberAI Focus`, same choices. Package names are fixed by the builds: `com.netcyberai.family` and `com.netcyberai.focus`.
2. **Play App Signing.**
   - Family: accept Play App Signing at the first upload; keep the upload key off the repository.
   - Focus: before the first upload choose **"Use the same app signing key as NetCyberAI Family"**. The two apps only talk to each other when both carry the same key (see `docs/launch/FOCUS_TEST.md`). This cannot be changed after the first upload.
3. **Set up your app** (Dashboard tasks). Answer every form with the files below.
4. **Internal testing track first.** Upload the build, add your own Google account as a tester, install from the Play link on your phone, and run `docs/launch/FOCUS_TEST.md` with the Play-installed pair.
5. **Closed testing next**, with the pilot families (by invitation). If the developer account is a new personal account, Play may require a closed test with a minimum number of testers for a minimum number of days before production: `[GAP: confirm the exact tester count and days shown in Play Console for this account]`.
6. **Production** only after the launch gates, including the lawyer's confirmation of the Focus Lock design (gate L2, `docs/34_ECOSYSTEM_AND_SYNC.md` §9.3).

## Which file answers which Console form

| Console form or screen | File |
|---|---|
| Main store listing: name, short and full description, Hindi translation, category, tags, contact details | `family-listing.md`, `focus-listing.md` |
| Graphics: app icon, feature graphic | `assets/` (PNG files, below) |
| Privacy policy URL | `https://www.netcyberai.com/privacy` (the section "Focus Lock (NetCyberAI Focus app)" is added in this slice and goes live when the PR is merged and deployed) |
| Data safety | `forms.md` section 1 |
| Content rating | `forms.md` section 2 |
| Target audience and content; Designed for Families | `forms.md` section 3 |
| App access | `forms.md` section 4 |
| Ads | `forms.md` section 5 |
| Government apps, Financial features, Health, News | `forms.md` sections 6 to 9 |
| Foreground service permissions declaration (Focus) and video | `forms.md` section 10, `video-script.md` |
| Sensitive permissions (usage access, display over other apps) | `forms.md` section 11 |
| Monitoring app declaration (Focus) | `forms.md` section 12 |

## Graphics in `assets/`

| File | Use |
|---|---|
| `family-icon-512.png` | Family app icon, 512 x 512 |
| `family-feature-1024x500.png` | Family feature graphic |
| `focus-icon-512.png` | Focus app icon, 512 x 512 |
| `focus-feature-1024x500.png` | Focus feature graphic |

Phone screenshots of the Family app are taken by the build lead. Focus screenshots come from the Focus test run.

## Gaps left for the founder

- `admin@netcyberai.com` in both listings (Play shows it publicly).
- `play-review@netcyberai.com` and `the six-digit code in the private file the supervisor sent you`: the build lead decides the sign-in mechanism for Play's reviewers.
- https://www.netcyberai.com/privacy#delete-account: Play asks for a web address where a parent can ask for the account to be deleted without installing the app.
- `[GAP: lawyer confirmation]` of the Focus Lock before the public listing.
- The other `[GAP: ...]` lines inside each file.

## Screenshots

Phone screenshots, 1080x1920 (9:16), in `assets/screenshots/`.

NetCyberAI Family (made from the screenshot harness, made-up names only):

- `family-01-home.png`: home screen in child mode
- `family-02-study.png`: Study, chapter list
- `family-03-tutor.png`: AI tutor answer
- `family-04-english.png`: English practice
- `family-05-parent.png`: parent area
- `family-06-home-hindi.png`: home screen in Hindi (optional extra)

NetCyberAI Focus (framed from real phone screenshots):

- `focus-01-study-first.png`: apps open after today's study
- `focus-02-parent-pin.png`: only the parent's PIN opens early
