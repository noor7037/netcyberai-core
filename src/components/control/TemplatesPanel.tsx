'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { MessageKey } from '@/lib/i18n';

// Control → WhatsApp templates (docs/25 slice 7c, C184): every version's exact words, our approval, and Meta's.
// The words come from the code; this screen never edits them. New words are a new version, written in code.

type Row = { id: string; name: string; version: number; language: 'en' | 'hi'; body: string | null; variables: string[]; category: string; staleAfterMinutes: number | null; status: 'approved' | 'pending' | 'rejected'; approvedByName: string | null; approvedAt: string | null; metaStatus: string; metaTemplateId: string | null; inCode: boolean; sendsNow: boolean; wordingReviewed?: boolean; wordingReviewedNote?: string | null };
const META = ['not_submitted', 'pending', 'approved', 'rejected', 'paused'] as const;
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const OURS = { approved: 'success', pending: 'warning', rejected: 'danger' } as const;

export function TemplatesPanel() {
  const { t, lang } = useT();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ id: string; status: string; metaId: string } | null>(null);
  const [review, setReview] = useState<{ id: string; note: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/control/templates').catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    setRows(body?.templates ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>, done: (answer: Record<string, unknown>) => string) {
    setBusy(true);
    const res = await fetch('/api/control/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const answer = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    setNote(res?.ok ? done(answer) : t(answer.code === 'not_in_code' ? 'tpl.bad.notInCode' : answer.code === 'meta_id' ? 'tpl.bad.metaId' : 'tpl.bad'));
    setMeta(null);
    setReview(null);
    void load();
  }

  if (rows === null) return null;
  const names = [...new Set(rows.map((r) => r.name))];
  return (
    <section lang={lang} data-templates className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg border border-slate/10 bg-white p-4 text-sm text-slate">
        <div className="flex flex-wrap items-center gap-x-1">
          <button type="button" data-templates-sync disabled={busy} className={PRIMARY} onClick={() => void post({ action: 'sync' }, (a) => t('tpl.synced', { added: Number(a.added ?? 0), filled: Number(a.filled ?? 0) }))}>
            {t('tpl.sync')}
          </button>
          <InfoTip>{t('tpl.how')}</InfoTip>
        </div>
        {note && <p role="status" data-templates-note className="rounded-md bg-off-white px-3 py-2 font-semibold">{note}</p>}
      </div>
      {rows.length === 0 && <p className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('tpl.none')}</p>}
      {names.map((name) => (
        <div key={name} data-template={name} className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
          {/* ui-strings: not words -- the template's own name, as Meta will know it */}
          <h2 className="text-base font-bold text-slate"><code>{name}</code></h2>
          {rows.filter((r) => r.name === name).map((r) => (
            <div key={r.id} data-template-version={`${r.language}-${r.version}`} className="flex flex-col gap-2 border-t border-slate/10 pt-3 text-sm text-slate">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{t('tpl.version', { version: r.version, language: t(r.language === 'hi' ? 'tpl.lang.hi' : 'tpl.lang.en') })}</span>
                <Badge variant={OURS[r.status]}>{t(`tpl.ours.${r.status}` as MessageKey)}</Badge>
                <Badge variant={r.metaStatus === 'approved' ? 'success' : r.metaStatus === 'rejected' || r.metaStatus === 'paused' ? 'danger' : 'neutral'}>{t(`tpl.meta.${r.metaStatus}` as MessageKey)}</Badge>
                {r.language !== 'en' && <Badge variant={r.wordingReviewed ? 'success' : 'warning'}>{t(r.wordingReviewed ? 'tpl.reviewed' : 'tpl.notReviewed')}</Badge>}
                {r.sendsNow && <Badge variant="success">{t('tpl.sendsNow')}</Badge>}
                {!r.inCode && r.body !== null && <Badge variant="danger">{t('tpl.notInCode')}</Badge>}
              </div>
              <p lang={r.language} className="whitespace-pre-wrap rounded-md bg-off-white px-3 py-2">{r.body ?? t('tpl.noWords')}</p>
              <p className="text-xs text-slate/70">{t('tpl.detail', { category: r.category, minutes: r.staleAfterMinutes ?? 0, by: r.approvedByName ?? '—', metaId: r.metaTemplateId ?? '—' })}</p>
              <div className="flex flex-wrap gap-2">
                {r.status !== 'approved' && r.inCode && (
                  <button type="button" data-template-approve disabled={busy} className={PRIMARY} onClick={() => void post({ action: 'approve', id: r.id }, () => t('tpl.approved'))}>
                    {t('tpl.approve')}
                  </button>
                )}
                {r.status !== 'rejected' && (
                  <button type="button" disabled={busy} className={TAP} onClick={() => void post({ action: 'reject', id: r.id }, () => t('tpl.rejected'))}>
                    {t('tpl.reject')}
                  </button>
                )}
                <button type="button" data-template-meta disabled={busy} className={TAP} onClick={() => setMeta({ id: r.id, status: r.metaStatus, metaId: r.metaTemplateId ?? '' })}>
                  {t('tpl.meta.record')}
                </button>
              </div>
              {r.language !== 'en' && r.wordingReviewed && r.wordingReviewedNote && <p className="text-xs text-slate/70">{t('tpl.reviewed.by', { note: r.wordingReviewedNote })}</p>}
              {r.language !== 'en' && !r.wordingReviewed && r.body !== null && (
                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <Input id={`tpl-review-${r.id}`} label={t('tpl.review.note')} maxLength={200} value={review?.id === r.id ? review.note : ''} onChange={(e) => setReview({ id: r.id, note: e.target.value })} />
                  <button type="button" data-template-reviewed disabled={busy || review?.id !== r.id || !review.note.trim()} className={TAP} onClick={() => void post({ action: 'reviewed', id: r.id, note: review?.note ?? '' }, () => t('tpl.review.done'))}>
                    {t('tpl.review.save')}
                  </button>
                </div>
              )}
              {meta?.id === r.id && (
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <Select id={`tpl-meta-status-${r.id}`} label={t('tpl.meta.status')} value={meta.status} onChange={(e) => setMeta({ ...meta, status: e.target.value })}>
                    {META.map((m) => (
                      <option key={m} value={m}>{t(`tpl.meta.${m}` as MessageKey)}</option>
                    ))}
                  </Select>
                  <Input id={`tpl-meta-id-${r.id}`} label={t('tpl.meta.id')} maxLength={100} value={meta.metaId} onChange={(e) => setMeta({ ...meta, metaId: e.target.value })} />
                  <button type="button" data-template-meta-save disabled={busy} className={PRIMARY} onClick={() => void post({ action: 'meta', id: r.id, metaStatus: meta.status, metaTemplateId: meta.metaId }, () => t('tpl.meta.saved'))}>
                    {t('tpl.meta.save')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
