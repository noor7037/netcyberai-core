import type { MessageKey } from '@/lib/i18n';

// What the compliance desk's panels share (C227): the classes of the screen's parts, a call to the desk's routes, and
// the words for a refusal.

export const TAP = 'inline-flex min-h-[44px] items-center justify-center rounded-md border border-slate/20 bg-white px-4 text-sm font-semibold text-slate disabled:opacity-60';
export const PRIMARY = 'inline-flex min-h-[44px] items-center justify-center rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
export const FIELD = 'min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-sm text-slate';
export const CARD = 'flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4';
export const LINK = 'inline-flex min-h-[44px] items-center text-sapphire underline';

export type Reply = { ok: boolean; status: number; body: Record<string, unknown> };
export type Say = (ok: boolean, text: string) => void;

export async function send(url: string, method: 'POST' | 'DELETE', payload?: unknown): Promise<Reply> {
  const init: RequestInit = { method };
  if (payload instanceof FormData) init.body = payload;
  else if (payload !== undefined) {
    init.body = JSON.stringify(payload);
    init.headers = { 'Content-Type': 'application/json' };
  }
  const res = await fetch(url, init).catch(() => null);
  const body = ((res ? await res.json().catch(() => null) : null) ?? {}) as Record<string, unknown>;
  return { ok: Boolean(res?.ok), status: res?.status ?? 0, body };
}

// The codes the desk's routes answer with, each with its own words; anything else is said plainly.
const CODES = ['stage', 'length', 'aadhaar', 'tet_type', 'tet_paper', 'date', 'tet_needed', 'future', 'order', 'heading', 'value', 'source', 'unchanged', 'too_many', 'unknown_standard', 'note', 'nothing', 'not_a_photo_or_pdf', 'too_large', 'storage_unavailable', 'empty', 'no_name_column', 'on_register'];
export function refusal(reply: Reply): MessageKey {
  if (reply.status === 403) return 'cdk.notYours';
  if (reply.status === 404) return 'cdk.err.not_found';
  const code = String(reply.body.code ?? '');
  return CODES.includes(code) ? (`cdk.err.${code}` as MessageKey) : 'cdk.err.other';
}

// A day as the office reads it, in India.
export function dayFormat(lang: string) {
  const day = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
  return (iso: string) => day.format(new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso));
}
