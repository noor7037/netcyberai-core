'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { minorToRupees } from '@/lib/fees/money';
import type { MessageKey } from '@/lib/i18n';

// Bank statements (docs/24 §3.4 path B, C176). The office downloads the statement from net banking as CSV and
// gives it here. First a preview: how many credit rows, their total, the period. Only when the uploader confirms
// those numbers are the credit rows kept. The same statement again adds nothing. Nothing here credits a payment.

type ColumnMap = { headerRow: number; date: number; narration: number; credit?: number; debit?: number; amount?: number; drCr?: number; balance?: number; reference?: number };
type Account = { account_id: string; label: string; bank_name: string; account_last4: string };
type Summary = { rowsRead: number; creditRows: number; creditTotalMinor: number; debitRows: number; periodFrom: string; periodTo: string; openingBalanceMinor: number | null; closingBalanceMinor: number | null; firstCredits: { valueDate: string; narration: string; amountMinor: number }[] };
type Preview = { map: ColumnMap | null; firstLines: string[][]; summary: Summary | null; problem: { reason: string; line?: number; value?: string } | null };
type Upload = { import_id: string; account_label: string; period_from: string; period_to: string; credit_rows: number; rows_added: number; credit_total_minor: number; balance_continues: boolean | null; uploaded_by_name: string | null };
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const COLUMNS = ['date', 'narration', 'credit', 'debit', 'amount', 'drCr', 'balance', 'reference'] as const;

export function FeesBankView() {
  const { t, lang } = useT();
  const toast = useToast();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [mayAdd, setMayAdd] = useState(false);
  const [account, setAccount] = useState({ label: '', bankName: '', accountLast4: '', ifsc: '' });
  const [accountId, setAccountId] = useState('');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/app/fees/bank').catch(() => null);
    const body = res?.ok ? await res.json().catch(() => null) : null;
    if (!body) return;
    setAccounts(body.accounts ?? []);
    setUploads(body.imports ?? []);
    setMayAdd(body.mayAddAccount === true);
    setAccountId((id) => id || body.accounts?.[0]?.account_id || '');
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: unknown): Promise<{ ok: boolean; body: Record<string, unknown> }> {
    setBusy(true);
    const res = await fetch('/api/app/fees/bank', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const answer = (await res?.json().catch(() => null)) ?? {};
    setBusy(false);
    return { ok: !!res?.ok, body: answer };
  }

  async function addAccount() {
    const r = await post({ action: 'account', ...account });
    if (!r.ok) toast.show(t('bank.account.bad'), 'danger');
    else setAccount({ label: '', bankName: '', accountLast4: '', ifsc: '' });
    void load();
  }

  async function read(withMap: ColumnMap | null) {
    setDone(null);
    const r = await post({ action: 'preview', accountId, text, map: withMap, from, to });
    if (!r.ok) return toast.show(t('fee.failed'), 'danger');
    const p = r.body.preview as Preview;
    setPreview(p);
    // Column names not recognised: start from the first line and let the uploader choose.
    setMap(p.map ?? (p.firstLines.length > 0 ? { headerRow: 0, date: 0, narration: 1 } : null));
  }

  async function keep() {
    if (!preview?.summary || !map) return;
    const r = await post({ action: 'import', accountId, text, map, from, to, confirmed: { creditRows: preview.summary.creditRows, creditTotalMinor: preview.summary.creditTotalMinor } });
    if (!r.ok) return toast.show(t(r.body.code === 'not_confirmed' ? 'bank.changed' : 'fee.failed'), 'danger');
    setDone(t(r.body.balanceContinues === false ? 'bank.kept.gap' : 'bank.kept', { added: Number(r.body.rowsAdded), already: Number(r.body.alreadyHere) }));
    setPreview(null);
    setText('');
    setFileName('');
    void load();
  }

  if (accounts === null) return null;
  const header = (map && preview?.firstLines[map.headerRow]) || [];
  const problemText = (p: NonNullable<Preview['problem']>) => t(`bank.problem.${['no_rows', 'bad_map', 'bad_date', 'bad_amount', 'no_credits', 'outside_period', 'too_big', 'no_map', 'period'].includes(p.reason) ? p.reason : 'bad_map'}` as MessageKey, { line: p.line ?? '', value: p.value ?? '' });

  return (
    <section lang={lang} data-bank className="flex flex-col gap-4 rounded-lg border border-slate/10 bg-white p-4">
      <div>
        <h2 className="text-base font-bold text-slate">{t('bank.title')}</h2>
        <p className="text-sm text-slate/70">{t('bank.how')}</p>
      </div>

      {accounts.length === 0 && <p data-bank-empty className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t(mayAdd ? 'bank.none.office' : 'bank.none.other')}</p>}
      {mayAdd && (
        <details className="text-sm text-slate" open={accounts.length === 0}>
          <summary className="min-h-[44px] cursor-pointer font-semibold text-sapphire">{t('bank.account.add')}</summary>
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <Input id="bank-label" label={t('bank.account.label')} maxLength={60} value={account.label} onChange={(e) => setAccount({ ...account, label: e.target.value })} />
            <Input id="bank-name" label={t('rails.upi.bank')} maxLength={60} value={account.bankName} onChange={(e) => setAccount({ ...account, bankName: e.target.value })} />
            <Input id="bank-last4" label={t('rails.upi.last4')} inputMode="numeric" maxLength={4} value={account.accountLast4} onChange={(e) => setAccount({ ...account, accountLast4: e.target.value })} />
            <Input id="bank-ifsc" label={t('rails.upi.ifsc')} maxLength={11} value={account.ifsc} onChange={(e) => setAccount({ ...account, ifsc: e.target.value.toUpperCase() })} />
            <button type="button" data-bank-add disabled={busy} className={`${PRIMARY} self-end`} onClick={() => void addAccount()}>
              {t('bank.account.save')}
            </button>
          </div>
        </details>
      )}

      {accounts.length > 0 && (
        <div data-bank-upload className="flex flex-col gap-3 border-t border-slate/10 pt-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select id="bank-account" label={t('bank.account')} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.account_id} value={a.account_id}>{`${a.label} · ${a.bank_name} · ${a.account_last4}`}</option>
              ))}
            </Select>
            <Input id="bank-from" type="date" label={t('bank.from')} value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input id="bank-to" type="date" label={t('bank.to')} value={to} onChange={(e) => setTo(e.target.value)} />
            <label className="flex flex-col gap-1 text-sm font-semibold text-slate">
              {t('bank.file')}
              <input
                id="bank-file"
                type="file"
                accept=".csv,text/csv"
                className="min-h-[44px] text-sm font-normal"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setPreview(null);
                  setFileName(file?.name ?? '');
                  if (file) void file.text().then(setText);
                }}
              />
            </label>
          </div>
          <p className="text-xs text-slate/70">{t('bank.csvOnly')}</p>
          <button type="button" data-bank-read disabled={busy || !text || !from || !to || !accountId} className={`${TAP} self-start`} onClick={() => void read(null)}>
            {t('bank.read', { file: fileName })}
          </button>

          {preview?.problem && <p role="alert" data-bank-problem className="rounded-md bg-tangerine/10 px-3 py-2 text-sm font-semibold text-slate">{problemText(preview.problem)}</p>}
          {preview && map && preview.firstLines.length > 0 && (
            <div data-bank-map className="flex flex-col gap-2 text-sm text-slate">
              <p className="font-semibold">{t('bank.map.title')}</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Select id="bank-map-header" label={t('bank.map.header')} value={String(map.headerRow)} onChange={(e) => setMap({ ...map, headerRow: Number(e.target.value) })}>
                  {preview.firstLines.map((line, i) => (
                    <option key={i} value={i}>{`${i + 1}. ${line.filter(Boolean).join(' · ').slice(0, 60) || '—'}`}</option>
                  ))}
                </Select>
                {COLUMNS.map((c) => (
                  <Select key={c} id={`bank-map-${c}`} label={t(`bank.map.${c}` as MessageKey)} value={map[c] === undefined ? '' : String(map[c])} onChange={(e) => setMap({ ...map, [c]: e.target.value === '' ? undefined : Number(e.target.value) })}>
                    <option value="">{t('bank.map.none')}</option>
                    {header.map((h, i) => (
                      <option key={i} value={i}>{`${i + 1}. ${h || '—'}`}</option>
                    ))}
                  </Select>
                ))}
              </div>
              <button type="button" disabled={busy} className={`${TAP} self-start`} onClick={() => void read(map)}>
                {t('bank.map.again')}
              </button>
            </div>
          )}
          {preview?.summary && (
            <div data-bank-preview className="flex flex-col gap-2 rounded-md border-2 border-sapphire/30 bg-off-white p-3 text-sm text-slate">
              <p className="text-base font-bold">{t('bank.preview', { count: preview.summary.creditRows, amount: minorToRupees(preview.summary.creditTotalMinor) })}</p>
              <p>{t('bank.preview.more', { from: preview.summary.periodFrom, to: preview.summary.periodTo, rows: preview.summary.rowsRead, debits: preview.summary.debitRows })}</p>
              <ul className="text-xs text-slate/80">
                {preview.summary.firstCredits.map((c, i) => (
                  <li key={i}>{`${c.valueDate} · ₹${minorToRupees(c.amountMinor)} · ${c.narration}`}</li>
                ))}
              </ul>
              <button type="button" data-bank-keep disabled={busy} className={`${PRIMARY} self-start`} onClick={() => void keep()}>
                {t('bank.keep', { count: preview.summary.creditRows, amount: minorToRupees(preview.summary.creditTotalMinor) })}
              </button>
            </div>
          )}
          {done && <p role="status" data-bank-done className="rounded-md bg-emerald/10 px-3 py-2 text-sm font-semibold text-slate">{done}</p>}
        </div>
      )}

      {uploads.length > 0 && (
        <ul data-bank-uploads className="flex flex-col gap-1 border-t border-slate/10 pt-3 text-sm text-slate">
          {uploads.map((u) => (
            <li key={u.import_id} className="flex flex-wrap justify-between gap-2">
              <span>{t('bank.upload', { account: u.account_label, from: u.period_from, to: u.period_to, rows: u.credit_rows, added: u.rows_added, amount: minorToRupees(u.credit_total_minor), by: u.uploaded_by_name ?? '' })}</span>
              {u.balance_continues === false && <span data-bank-gap className="font-bold text-red-800">{t('bank.gap')}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
