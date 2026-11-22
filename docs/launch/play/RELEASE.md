# Play Store release: signing and bundles (supervisor, 22 Nov 2026, C541)

**Written by:** the supervisor. **For:** Noor. **Delivers:** how the two apps become signed Play Store bundles, and
the one-time steps only you can do.

## Done in the repository

- Both apps target **Android 16 (API 36)**, which Google Play requires for new apps and updates since 31 Aug 2026.
- Versions: NetCyberAI Family 1.3.0 (code 4), NetCyberAI Focus 1.0.0 (code 5).
- **Actions → android-release → Run workflow** builds both apps as signed Android App Bundles (`.aab`), the format
  Play Console takes. Download them from the run's Artifacts (`netcyberai-play-bundles`).
- Google Play's reviewers sign in to the Family app with the review address and its fixed code (C542). Both are in
  the server's settings, and no email is sent for that address. The address and code for Play Console's "App access"
  form are in the file the supervisor sent you with the upload key.

## One time, only you

1. **The upload key.** The supervisor sent you two files: `netcyberai-upload.jks` and
   `netcyberai-upload-key-secrets.txt`. Save both in your Google Drive and nowhere public. Without them, a new version
   cannot be uploaded until Google resets the key.
2. **Four GitHub secrets.** Go to GitHub, then the repository, then Settings → Secrets and variables → Actions → New
   repository secret. Add the four names and values from `netcyberai-upload-key-secrets.txt`, copied exactly.
3. **Google Play Console account.** Go to play.google.com/console and pay the one-time US$25 fee.
   - An organisation account needs a D-U-N-S number and skips the 12-tester rule.
   - A new personal account must run a closed test with 12 testers for 14 days before production.
4. **Create the two apps in Play Console.** For NetCyberAI Focus, choose **"use the same app signing key as
   NetCyberAI Family"** before its first upload. It cannot be changed later. The apps talk to each other on the phone
   only when they share the key.
5. **Internal testing first.** Upload both `.aab` files to the internal testing track and add your own email as a
   tester. Install from the Play link. The "restricted settings" step then disappears.
6. Then fill in the forms from `docs/launch/play/` (listings, Data safety, content rating, target audience, the Focus
   app's foreground-service declaration and video), and move to closed testing, then production.
7. When NetCyberAI Focus is live for everyone, tell the supervisor. Control's setting `family.focus_on_play` is then
   switched on and the parent area shows the Install button. Until then it says "coming soon".
