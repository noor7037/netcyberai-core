import { siteUrl } from '@/lib/site-config';

// The family's link to a certificate's PDF (C228): the copy route and a 32-character random key, which opens the PDF
// for 30 days. Whoever holds the key holds the certificate, so it is written only into the family's own message.
//
// Control never shows it (C232 part A, C230-A): a text Control reads (a provider's error, a job's last error, the
// reason on a message) may quote the message's values, and the link among them. maskLinks() leaves a link as its
// domain and "…": "netcyberai.com/…". Pure, so the monitoring screen and the tests share it.

export const COPY_PATH = '/api/public/certificates/copy/';
export const copyLinkUrl = (key: string): string => `${siteUrl}${COPY_PATH}${key}`;

// Any web address (with its scheme, or a bare domain followed by a path), up to the next space or quotation mark.
const WEB_ADDRESS = /\b(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d+)?\/[^\s"'“”‘’`<>)\]]*/gi;
// The copy route's path without a domain, with whatever follows it.
const BARE_COPY_PATH = /\/api\/public\/certificates\/copy\/[^\s"'“”‘’`<>)\]]*/g;

export function maskLinks(text: string): string {
  return text.replace(WEB_ADDRESS, (_whole, domain: string) => `${domain.toLowerCase()}/…`).replace(BARE_COPY_PATH, `${COPY_PATH}…`);
}
