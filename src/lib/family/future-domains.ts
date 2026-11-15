// Apply may open official sites only (founder, 15 Nov 2026). Four things must hold: the link is https, it has no
// credentials or odd port, and its site is either on an official suffix (.gov.in .nic.in .ac.in .edu.in .res.in) or on a
// site the founder switched on by name in Control (content.future_apply_domains, all off until switched on).
// This replaces the 12 Nov "no link out" rule for those sites only; any other link stays words, never a link.

export const OFFICIAL_SUFFIXES = ['gov.in', 'nic.in', 'ac.in', 'edu.in', 'res.in'] as const;

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
    return u.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

const onSuffix = (host: string, suffix: string) => host === suffix || host.endsWith(`.${suffix}`);

// enabledExtras: the domains the founder has on. A listed domain covers its own subdomains.
export function applyHostOk(url: string | null | undefined, enabledExtras: readonly string[]): string | null {
  const host = hostOf(url);
  if (!host) return null;
  if (OFFICIAL_SUFFIXES.some((s) => host.endsWith(`.${s}`))) return host.replace(/^www\./, '');
  return enabledExtras.some((d) => onSuffix(host, d.toLowerCase())) ? host.replace(/^www\./, '') : null;
}
