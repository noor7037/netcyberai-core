'use client';

import { isMessageKey, type Lang, type MessageKey } from '@/lib/i18n';
import type { ErrorType, SheetFlag, SheetState } from '@/lib/contracts/marking';

// What the marking screens share (C347): asking the app's routes and saying a refusal in words, and the plain words
// for the flags, states and kinds of mistake. Every word is a message (mk.*), in English and Hindi.

export type T = (key: MessageKey, params?: Record<string, string | number>) => string;
export type Reply = { ok: boolean; status: number; body: Record<string, unknown> | null };

export async function ask(method: 'GET' | 'POST', url: string, payload?: unknown): Promise<Reply> {
  const res = await fetch(url, {
    method,
    ...(method === 'GET' ? { cache: 'no-store' as const } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload ?? {}) }),
  }).catch(() => null);
  const body = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
  return { ok: !!res?.ok, status: res?.status ?? 0, body };
}

// A refusal as the teacher reads it: the library's one-word reason, else a general line.
export function errorWords(t: T, reply: Pick<Reply, 'body' | 'status'>, fallback: MessageKey = 'mk.err.other'): string {
  const code = typeof reply.body?.code === 'string' ? reply.body.code : '';
  const key = `mk.err.${code}`;
  if (code && isMessageKey(key)) return t(key);
  if (reply.status === 0) return t('mk.err.network');
  return t(fallback);
}

export const FLAG_KEYS: Record<SheetFlag, MessageKey> = {
  identity: 'mk.flag.identity',
  check_child: 'mk.flag.check_child',
  not_answer_page: 'mk.flag.not_answer_page',
  mismatch: 'mk.flag.mismatch',
  two_scripts: 'mk.flag.two_scripts',
  missing_page: 'mk.flag.missing_page',
  unreadable: 'mk.flag.unreadable',
  not_all_read: 'mk.flag.not_all_read',
  unsure: 'mk.flag.unsure',
  changed: 'mk.flag.changed',
};
export const FLAG_HOW_KEYS: Record<SheetFlag, MessageKey> = {
  identity: 'mk.flag.identity.how',
  check_child: 'mk.flag.check_child.how',
  not_answer_page: 'mk.flag.not_answer_page.how',
  mismatch: 'mk.flag.mismatch.how',
  two_scripts: 'mk.flag.two_scripts.how',
  missing_page: 'mk.flag.missing_page.how',
  unreadable: 'mk.flag.unreadable.how',
  not_all_read: 'mk.flag.not_all_read.how',
  unsure: 'mk.flag.unsure.how',
  changed: 'mk.flag.changed.how',
};
export const STATE_KEYS: Record<SheetState, MessageKey> = {
  waiting: 'mk.state.waiting',
  marking: 'mk.state.marking',
  marked: 'mk.state.marked',
  failed: 'mk.state.failed',
  approved: 'mk.state.approved',
  set_aside: 'mk.state.set_aside',
};
export const ERROR_TYPE_KEYS: Record<ErrorType, MessageKey> = {
  none: 'mk.mistake.none',
  concept: 'mk.mistake.concept',
  calculation: 'mk.mistake.calculation',
  incomplete: 'mk.mistake.incomplete',
  presentation: 'mk.mistake.presentation',
  language: 'mk.mistake.language',
  misread: 'mk.mistake.misread',
  not_attempted: 'mk.mistake.not_attempted',
};

// Why a script could not be marked, in words (the code is the job's own; an unknown one gets a general line).
export function failureWords(t: T, code: string | null): string {
  const key = `mk.failure.${code ?? 'other'}`;
  return isMessageKey(key) ? t(key) : t('mk.failure.other');
}

export const scriptsHref = (paperId: string) => `/app/exams/papers/${paperId}/marking`;
export const sheetHref = (paperId: string, sheetId: string) => `/app/exams/papers/${paperId}/marking/${sheetId}`;
export const scanHref = (paperId: string) => `/app/exams/papers/${paperId}/marking/scan`;

// How a child is shown in a list: "2. Meera Example A", else the name.
export const childLine = (c: { name: string; rollNo: string | null }) => (c.rollNo ? `${c.rollNo}. ${c.name}` : c.name);

export type { Lang };
