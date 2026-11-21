# NetCyberAI Focus: test on your phone (supervisor, 21 Nov 2026, C538)

**Written by:** the supervisor. **For:** Noor. **Delivers:** how to install and check the Focus Lock app on your
Android phone, about 15 minutes.

## Before you start (once)

1. **Nothing to switch on.** Since 21 Nov 2026 the Focus Lock is offered to every family (Control → Apps → Focus Lock,
   everyone). On each phone it stays off until the parent connects NetCyberAI Focus and taps Start.
2. **Install both apps from the same run.** GitHub → Actions → the latest "android" run on this branch → Artifacts →
   `netcyberai-family-and-focus-apks`. Unzip it: `app-debug.apk` (Family) and `focus-debug.apk` (Focus).
   - Uninstall the NetCyberAI Family app you have now first. Test builds from different runs have different keys, and
     the two apps only talk to each other when they come from the same run.
   - Install `app-debug.apk`, sign in, then install `focus-debug.apk`.

## The check

1. **Family app → Parent area (PIN) → Focus Lock → Connect.** NetCyberAI Focus opens by itself. You type no code.
2. **Focus: enter your parent PIN.**
3. **The steps.** Tap Open on each and switch NetCyberAI Focus on: notifications, display over other apps, usage
   access, then your phone brand's battery (and autostart) steps. If the usage-access switch is grey (an app installed
   from a file), use the grey-switch line under that step. "Start" works only when every step is ticked.
4. **Apps and times.** The suggested apps are already ticked. **For this test,** set the days to include today and a
   time that includes now (the default is Monday to Friday, 4 pm to 9 pm). Tap Start.
5. **Open YouTube (or a game).** The block screen shows "Study first", with what is left today and "Start studying".
6. **Back** goes to the home screen. **Calls, messages and WhatsApp** open normally.
7. **Settings or the Play Store** shows "Locked in study time". The parent PIN opens it; the lock comes back when the
   screen turns off.
8. **Finish today's study** in the Family app. Open YouTube again: it opens within about 20 seconds.
9. **Restart the phone.** The "Focus Lock is on" notification comes back by itself.
10. **Parent area → Focus Lock** lists the phone with its last report.

Write down what looks wrong, with a screenshot and your phone's brand and model.

## Known limits

- The brands' own screen names change between versions; where one is not found, App info opens with the words for
  where to tap. Each brand is checked on a real phone before the Play listing.
- A child can still reset the phone or use safe mode; the parent is told when the lock stops reporting.
- On Play: create the Focus app with "use the same app signing key as NetCyberAI Family", before the first upload.
