// What the Install button shows (founder, C230): one pure decision from what the browser told us, so it is testable.
export type InstallView = 'installed' | 'prompt' | 'ios-hint' | 'desktop-hint' | 'menu-hint';

export type InstallInputs = {
  /** Running as an installed app already (display-mode standalone, or `appinstalled` fired). */
  installed: boolean;
  /** `beforeinstallprompt` was captured, so one tap can open the browser's install sheet. */
  hasPrompt: boolean;
  userAgent: string;
  maxTouchPoints?: number;
};

export function isIos(userAgent: string, maxTouchPoints = 0): boolean {
  // iPadOS 13+ reports as a Mac but has a touch screen.
  return /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

export function isPhoneOrTablet(userAgent: string, maxTouchPoints = 0): boolean {
  return isIos(userAgent, maxTouchPoints) || /Android|Mobile/i.test(userAgent);
}

export function decideInstallView(i: InstallInputs): InstallView {
  if (i.installed) return 'installed';
  if (i.hasPrompt) return 'prompt';
  if (isIos(i.userAgent, i.maxTouchPoints)) return 'ios-hint';
  if (!isPhoneOrTablet(i.userAgent, i.maxTouchPoints)) return 'desktop-hint';
  // An Android browser that gave no prompt (Firefox, Samsung, or the prompt not yet ready): the browser menu does it.
  return 'menu-hint';
}
