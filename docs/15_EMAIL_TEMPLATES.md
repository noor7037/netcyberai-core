# 15 — Supabase Auth email templates

**Governs:** the three emails Supabase Auth sends for NetCyberAI: Magic Link,
Reset Password and Invite user. They are pasted into the Supabase dashboard;
this file is their source of truth (Decision Log C96, C99).
**Where:** Supabase dashboard → Authentication → Emails → Templates, on the
project that serves the site (today `netcyberai-dev`, `unodnyyfqhxrbusbkite`),
and again on `netcyberai-prod` before the cutover.
**Also check there:** Authentication → URL Configuration → Site URL is
`https://www.netcyberai.com`, so `{{ .SiteURL }}` in the links points at the
live site.

## Rules every template follows

- **Code and link both.** The 6-digit `{{ .Token }}` is shown large, named for
  what it is ("code from this email", never an authenticator code, C96), and
  the button is a link that works on its own.
- **Links go to our own login page**, `{{ .SiteURL }}/login?th={{ .TokenHash }}&type=…`,
  which verifies the link on our server (C91). They do not depend on
  Supabase's redirect settings.
- **The `type` in each link must match the template:** `magiclink`,
  `recovery`, `invite`. `/login` accepts only these (`src/app/api/auth/link/route.ts`).
- **No marketing, no tracking pixels, no third-party images.** Plain inline
  styles, so they render the same in Gmail, Outlook and phone mail apps.

**Source of these three templates:** the supervisor gave Noor the Magic Link
and Reset Password templates directly, and this session did not see that
text. So all three below are written here in one style, to the rules above.
If what is pasted in Supabase differs, keep whichever is live and copy it
over this file, so the two do not drift apart.

---

## 1. Magic Link

**Subject:** `Your NetCyberAI sign-in code: {{ .Token }}`

```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1e293b">
  <p style="font-size:20px;font-weight:800;color:#0b1f4d;margin:0 0 16px">NetCyberAI</p>
  <p style="margin:0 0 12px">Here is your 6-digit sign-in code. Type it on the sign-in screen:</p>
  <p style="font-size:32px;font-weight:800;letter-spacing:6px;margin:16px 0">{{ .Token }}</p>
  <p style="margin:0 0 12px">This is the code from this email, not your authenticator app code.</p>
  <p style="margin:24px 0">
    <a href="{{ .SiteURL }}/login?th={{ .TokenHash }}&type=magiclink"
       style="background:#0b1f4d;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:6px;display:inline-block">
      Or sign in with one tap
    </a>
  </p>
  <p style="font-size:13px;color:#475569;margin:0">The code and the link work once and expire soon. Only the newest email works. If you did not try to sign in, ignore this email.</p>
  <p style="font-size:12px;color:#64748b;margin-top:32px">NetCyberAI · Gurugram, Haryana, India</p>
</div>
```

## 2. Reset Password

**Subject:** `Your NetCyberAI password code: {{ .Token }}`

```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1e293b">
  <p style="font-size:20px;font-weight:800;color:#0b1f4d;margin:0 0 16px">NetCyberAI</p>
  <p style="margin:0 0 12px">Use this 6-digit code to choose a new password:</p>
  <p style="font-size:32px;font-weight:800;letter-spacing:6px;margin:16px 0">{{ .Token }}</p>
  <p style="margin:0 0 12px">This is the code from this email, not your authenticator app code.</p>
  <p style="margin:24px 0">
    <a href="{{ .SiteURL }}/login?th={{ .TokenHash }}&type=recovery"
       style="background:#0b1f4d;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:6px;display:inline-block">
      Or choose a new password here
    </a>
  </p>
  <p style="font-size:13px;color:#475569;margin:0">The code and the link work once and expire soon. Only the newest email works. If you did not ask to change your password, ignore this email; your password stays the same.</p>
  <p style="font-size:12px;color:#64748b;margin-top:32px">NetCyberAI · Gurugram, Haryana, India</p>
</div>
```

## 3. Invite user

Sent when a school is approved (to its principal) and when a principal
invites staff (C98). The link opens `/login` at the set-password step
(`type=invite`). A resend from NetCyberAI sends the Reset Password email
above instead, which lands on the same step.

**Subject:** `You are invited to NetCyberAI`

```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1e293b">
  <p style="font-size:20px;font-weight:800;color:#0b1f4d;margin:0 0 16px">NetCyberAI</p>
  <p style="margin:0 0 12px">Hello{{ if .Data.display_name }} {{ .Data.display_name }}{{ end }},</p>
  <p style="margin:0 0 12px">You have been invited to your school's NetCyberAI account. Choose a password to sign in:</p>
  <p style="margin:24px 0">
    <a href="{{ .SiteURL }}/login?th={{ .TokenHash }}&type=invite"
       style="background:#0b1f4d;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:6px;display:inline-block">
      Accept and set your password
    </a>
  </p>
  <p style="font-size:13px;color:#475569;margin:0">Open the link on the device you will use. It works once. If it has expired, ask the person who invited you to send it again. If you were not expecting this, ignore this email.</p>
  <p style="font-size:12px;color:#64748b;margin-top:32px">NetCyberAI · Gurugram, Haryana, India</p>
</div>
```

`{{ .Data.display_name }}` is the name the inviter typed, passed by the invite
job (`src/lib/auth/admin-actions.ts`, `inviteUserToSchool`). Supabase escapes
template values.

---

## Emails NetCyberAI sends itself

These are not Supabase templates. They are sent through Resend by the job
pipeline (`email.send`), and their text lives in `src/lib/email/templates.ts`:

- the 6-digit code that confirms a school application's email;
- "New school application" to the founder;
- "You have been added to <school>" to an existing account given a new school.

They need `RESEND_API_KEY` and `EMAIL_FROM` in Vercel (C99).
