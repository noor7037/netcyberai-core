// What the sign-in page says at each step (C96): the step counter, what to
// do now, what happens next and what to do if stuck, plus every error
// sentence. Kept free of React so it is unit-tested. Every code is named by
// where it comes from, because two unnamed 6-digit codes one screen apart
// got typed into the wrong box in production (C96).

export type StepKind =
  | 'credentials'
  | 'code_request'
  | 'code_verify'
  | 'reset_request'
  | 'reset_verify'
  | 'reset_mfa'
  | 'link_password'
  | 'link_checking'
  | 'email_step'
  | 'mfa'
  | 'mfa_setup'
  | 'select_school'
  | 'done';

export type GuidanceContext = {
  // Where the emailed code went: n•••8@gmail.com, or what the person typed.
  emailTarget?: string;
  // A platform admin with no authenticator sets one up after the email code.
  setupNext?: boolean;
  // When the newest code was sent, for "only the newest code works".
  codeSentAt?: Date | null;
};

export type Guidance = {
  // "Step 2 of 3", "One more step" or "Last step".
  position: string;
  title: string;
  doNow: string;
  next: string;
  stuck: string[];
};

export const AUTHENTICATOR_APP = 'your authenticator app (Google Authenticator)';

export function authenticatorCodeLabel(): string {
  return `6-digit code from ${AUTHENTICATOR_APP}`;
}

export function emailCodeLabel(target: string): string {
  return `6-digit code from the email we just sent to ${target}`;
}

export const EMAIL_CODE_NOT_AUTHENTICATOR = 'This is not your authenticator code.';
export const AUTHENTICATOR_NOT_EMAIL = 'It changes every 30 seconds. This is not the code from our email.';

// 24-hour HH:MM in the browser's own time zone.
export function clock(at: Date): string {
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

export function newestCodeLine(at: Date): string {
  return `New code sent at ${clock(at)}. Only the newest code works.`;
}

const LOST_PHONE = 'Lost the phone with your authenticator app? Contact NetCyberAI support; we remove it and you set up a new one.';
const NO_EMAIL = 'No email after a minute? Check spam, then use “Send a new code”.';
const FORGOT = 'Forgot your password? Use “Forgot password?” under the password box.';

export function guidanceFor(kind: StepKind, ctx: GuidanceContext = {}): Guidance {
  const target = ctx.emailTarget || 'your email';
  const sent = ctx.codeSentAt ? [newestCodeLine(ctx.codeSentAt)] : [];
  switch (kind) {
    case 'credentials':
      return {
        position: 'Step 1 of 2',
        title: 'Sign in',
        doNow: 'Enter your email, mobile number or username, and your password.',
        next: 'If your account has an authenticator app, you type its 6-digit code next. Otherwise we email you a 6-digit code.',
        stuck: [FORGOT, 'First time here? Use “Set your password” with the email your school registered.'],
      };
    case 'mfa':
      return {
        position: 'Step 2 of 2',
        title: 'Authenticator code',
        doNow: `Open ${AUTHENTICATOR_APP} and type the 6-digit code shown for NetCyberAI.`,
        next: 'You are signed in. If you work in more than one school, you choose which one to open.',
        stuck: ['The code changes every 30 seconds: type the one showing now. We never email this code.', LOST_PHONE],
      };
    case 'email_step':
      return {
        position: ctx.setupNext ? 'Step 2 of 3' : 'Step 2 of 2',
        title: 'Code from our email',
        doNow: `Open the email we just sent to ${target} and type its 6-digit code. ${EMAIL_CODE_NOT_AUTHENTICATOR}`,
        next: ctx.setupNext
          ? 'Next you set up an authenticator app on your phone. Platform admin accounts need one.'
          : 'You are signed in. Tick “remember this device” to skip this email code here for 30 days.',
        stuck: [...sent, NO_EMAIL, 'The link in that email also signs you in, if you open it on this device.'],
      };
    case 'mfa_setup':
      return {
        position: 'Step 3 of 3',
        title: 'Set up your authenticator app',
        doNow: 'Scan the QR code with an authenticator app on your phone, then type the 6-digit code it shows.',
        next: 'You are signed in. From now on every sign-in asks for your password and then this app’s code, with no email code.',
        stuck: ['No authenticator app yet? Install Google Authenticator or Microsoft Authenticator from your phone’s app store.', 'Cannot scan? Type the setup key instead.'],
      };
    case 'code_request':
      return {
        position: 'Step 1 of 2',
        title: 'Get a sign-in code by email',
        doNow: 'Enter the email or mobile number your school registered. We email you a 6-digit code.',
        next: 'You type the code from that email on the next screen.',
        stuck: ['Only accounts your school created get an email.', FORGOT],
      };
    case 'code_verify':
      return {
        position: 'Step 2 of 2',
        title: 'Code from our email',
        doNow: `Type the 6-digit code from the email we sent to ${target}. ${EMAIL_CODE_NOT_AUTHENTICATOR}`,
        next: 'You are signed in. If your account has an authenticator app, you type its code after this.',
        stuck: [...sent, NO_EMAIL, 'The link in that email also signs you in, if you open it on this device.'],
      };
    case 'reset_request':
      return {
        position: 'Step 1 of 2',
        title: 'Get a password code by email',
        doNow: 'Enter the email or mobile number your school registered. We email you a 6-digit code.',
        next: 'You type that code and choose a new password on the next screen.',
        stuck: ['Only accounts your school created get an email. Still stuck? Ask your school admin.', 'Signed in with a username? A username gets no email: ask your school office or NetCyberAI for a new password.'],
      };
    case 'reset_verify':
      return {
        position: 'Step 2 of 2',
        title: 'Choose a new password',
        doNow: `Type the 6-digit code from the email we sent to ${target}, then your new password twice.`,
        next: 'You are signed in and signed out on every other device.',
        stuck: [...sent, NO_EMAIL],
      };
    case 'reset_mfa':
      return {
        position: 'One more step',
        title: 'Authenticator code',
        doNow: `Your account has an authenticator app. Type its 6-digit code to save the new password.`,
        next: 'Your new password is saved and you are signed in.',
        stuck: ['We never email this code: it is in your authenticator app.', LOST_PHONE],
      };
    case 'link_password':
      return {
        position: 'Step 2 of 2',
        title: 'Choose your new password',
        doNow: 'Your email is confirmed. Type your new password twice.',
        next: 'You are signed in.',
        stuck: ['Use 8 to 72 characters. A short sentence is easy to remember and hard to guess.'],
      };
    case 'link_checking':
      return { position: 'One moment', title: 'Checking your link', doNow: 'Checking the link from your email.', next: 'You are signed in.', stuck: [] };
    case 'select_school':
      return {
        position: 'Last step',
        title: 'Choose your school',
        doNow: 'Your account works in more than one school. Choose the one to open now.',
        next: 'You can switch schools later without signing out.',
        stuck: ['A school missing? Ask that school’s admin to add you.'],
      };
    case 'done':
      return { position: 'Done', title: 'Opening NetCyberAI', doNow: 'You are signed in.', next: '', stuck: [] };
  }
}

// The auth API returns machine codes (src/lib/auth/*); people see a
// sentence, never the raw code. Wrong-code sentences name the code's source.
export const ERROR_TEXT: Record<string, string> = {
  invalid_credentials: 'That email and password do not match. Check both and try again.',
  no_memberships: 'This account is not linked to any school yet. Ask your school admin to add you.',
  pending_token_invalid: 'Your sign-in step expired. Please start again.',
  session_expired: 'Your session expired. Please sign in again.',
  session_revoked: 'This session was signed out. Please sign in again.',
  membership_invalid: 'You no longer have access to that school. Choose another, or ask your school admin.',
  forbidden: 'This account cannot do that. Ask your school admin if you think it should.',
  account_disabled: 'This account is switched off. Ask your school admin.',
  code_invalid:
    'That email code did not work or has expired. Type the 6-digit code from the newest email we sent. It is not your authenticator code.',
  rate_limited: 'Too many codes were asked for. Wait a minute, then try again.',
  password_invalid: 'Use 8 to 72 characters, with no space at the start or end.',
  password_rejected: 'That password was not accepted. Choose a longer one you have not used elsewhere.',
  mfa_invalid_code: `That authenticator code did not work. Type the 6-digit code ${AUTHENTICATOR_APP} shows now. It is not the code from our email.`,
  mfa_required: `This account also needs the 6-digit code from ${AUTHENTICATOR_APP}.`,
  email_send_failed: 'Our email service could not send the email just now. Please try again in a few minutes, or contact support.',
  email_limit: 'Our email service is busy and could not send another email just now. Try again later, or ask your school admin for a sign-in link.',
  link_invalid: 'That link has expired or was already used. Each link works once, for one hour, and only the newest email works. Send a new code below.',
  setup_required: 'This needs a setting that is not switched on yet. Please contact support.',
  mfa_not_enrolled:
    'This account needs an authenticator app. It is set up only after signing in with your password and then the code from our email. Sign in that way to set it up, or contact support.',
  mfa_already_enrolled: 'An authenticator app is already set up for this account. Sign in again and enter its code.',
  mfa_enroll_failed: 'We could not start the authenticator setup. Please try again.',
  admin_reset_needs_founder:
    'This platform admin account has no authenticator app, so its password cannot be reset by email. Ask another platform admin to set a temporary password for you.',
};

export function humanError(code: unknown, fallback: string): string {
  return (typeof code === 'string' && ERROR_TEXT[code]) || fallback;
}
