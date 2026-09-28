export const companyName = 'NetCyberAI';
export const contactEmail = 'admin@netcyberai.com';
export const companyAddress = 'Gurugram / Palwal, Haryana, India';

export const siteUrl = 'https://netcyberai.com';
export const siteLanguage = 'en-IN';
export const ogLocale = 'en_IN';
export const siteTagline = 'WhatsApp-native parent engagement for Indian schools';
export const siteDescription =
  'NetCyberAI is a WhatsApp-native Student Learning Monitoring & Parent Engagement Engine for Indian schools.';
export const serviceRegion = { addressRegion: 'Haryana', addressCountry: 'IN' } as const;

// Dev fallback is fine. Production without this set is a silent
// failure — every demo CTA routes to a placeholder number, and the
// only symptom is inquiries going nowhere (Constitution §9 bans this
// class of silent failure).
if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_WHATSAPP_NUMBER) {
  throw new Error(
    'NEXT_PUBLIC_WHATSAPP_NUMBER is required in production. ' +
      'Set it in Vercel environment variables before deploying.'
  );
}

export const whatsappNumber =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '919817707037';

// "+91 98177 07037" for display; the raw number stays in whatsappNumber.
export function displayPhone(n: string = whatsappNumber): string {
  const d = n.replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') ? `+91 ${d.slice(2, 7)} ${d.slice(7)}` : `+${d}`;
}

export function whatsappLink(message?: string): string {
  const base = `https://wa.me/${whatsappNumber}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
