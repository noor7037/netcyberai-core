'use client';

import { useStepUp } from '@/components/auth/StepUp';
import { useCallback, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import type { AiOverview, Counts } from '@/lib/ai/control';
import { isMessageKey, type MessageKey } from '@/lib/i18n';
import { cleanWorkersAccount, cleanWorkersToken, workersAccountLooksRight, workersTokenLooksRight } from '@/lib/ai/adapters/workers-key';

// Control → AI (C249), the forms. Every save goes to /api/control/ai and the page's data is read again from there,
// so what is shown is always what the database holds. A key is typed into a password field, sent once and cleared:
// the page never receives one back.

type Data = AiOverview & { providerChoices: string[] };
type Draft = { providerId: string; model: string; promptVersion: string; enabled: boolean; fallbackProvider: string; fallbackModel: string };

const ERRORS = ['account_id_format', 'token_format', 'no_encryption_key', 'provider', 'key_format', 'terms_url', 'in_use', 'profile', 'model', 'prompt_version', 'incomplete', 'not_cleared_for_minors', 'cap', 'not_found', 'cannot_restore_key', 'request', 'aal2'];
// M2-5: a content provider's key test (their words are under control.video.ai.err.*).
const TEST_ERRORS = ['no_key', 'not_testable'];
const TAP = 'min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate disabled:opacity-60';
const PRIMARY = 'min-h-[44px] rounded-md bg-sapphire px-5 text-sm font-semibold text-white disabled:opacity-60';
const CARD = 'flex flex-col gap-3 rounded-xl border border-slate/10 bg-white p-4';
const day = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');

const draftOf = (p: Data['profiles'][number]): Draft => ({
  providerId: p.providerId ?? '',
  model: p.model ?? '',
  promptVersion: p.promptVersion,
  enabled: p.enabled,
  fallbackProvider: p.fallback[0]?.provider ?? '',
  fallbackModel: p.fallback[0]?.model ?? '',
});

export function AiControls({ initial }: { initial: Data }) {
  const { stepUpFetch } = useStepUp();
  const { t, lang } = useT();
  const [data, setData] = useState<Data>(initial);
  const [keys, setKeys] = useState<Record<string, string>>({});
  // Cloudflare's key in two boxes (C317): the Account ID and the API token.
  const [cf, setCf] = useState({ account: '', token: '' });
  // A box says what is wrong only once the founder has left it, never while it is still being filled in.
  const [cfLeft, setCfLeft] = useState({ account: false, token: false });
  const [terms, setTerms] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(initial.profiles.map((p) => [p.profileId, draftOf(p)])));
  const [cap, setCap] = useState(initial.cap === null ? '' : String(initial.cap));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const read = useCallback(async () => {
    const res = await fetch('/api/control/ai', { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as Data | null) : null;
    if (got) {
      setData(got);
      setDrafts(Object.fromEntries(got.profiles.map((p) => [p.profileId, draftOf(p)])));
      setCap(got.cap === null ? '' : String(got.cap));
    }
  }, []);

  const send = async (payload: Record<string, unknown>, done: MessageKey, after?: () => void) => {
    setBusy(true);
    setNote(null);
    const res = await stepUpFetch('/api/control/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    after?.();
    if (!res?.ok) {
      setBusy(false);
      return setNote({ ok: false, text: ERRORS.includes(got?.code) ? t(`control.ai.err.${got.code}` as MessageKey) : t('control.ai.err.other') });
    }
    await read();
    setBusy(false);
    setNote({ ok: true, text: t(done) });
  };

  // A content provider's key test (M2-5): the answer says whether the provider took the key, never the key.
  const test = async (providerId: string) => {
    setBusy(true);
    setNote(null);
    const res = await stepUpFetch('/api/control/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test', providerId }) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    await read();
    setBusy(false);
    if (!res?.ok) {
      const code = got?.code;
      return setNote({ ok: false, text: TEST_ERRORS.includes(code) ? t(`control.video.ai.err.${code}` as MessageKey) : ERRORS.includes(code) ? t(`control.ai.err.${code}` as MessageKey) : t('control.ai.err.other') });
    }
    setNote(got?.works ? { ok: true, text: t('control.video.ai.works') } : { ok: false, text: t('control.video.ai.fails', { code: String(got?.code ?? '') }) });
  };

  const name = (n: string | null) => n ?? t('control.ai.someone');
  const usageLine = (c: Counts) => t('control.ai.usage.line', { requests: c.requests, failures: c.failures, capRefusals: c.capRefusals, tokensIn: c.tokensIn, tokensOut: c.tokensOut });

  return (
    <div lang={lang} className="flex flex-col gap-5 text-sm text-slate">
      {/* The outcome of a save sits at the bottom of the window, wherever the page is scrolled (C319): at the top it was
          out of sight while the founder worked on a service lower down, so a refusal went unseen. */}
      {note && (
        <p
          role="status"
          data-ai-note
          className={`fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-xl items-center gap-3 rounded-md py-1 pl-4 pr-1 font-semibold shadow-lg ${note.ok ? 'border border-slate/20 bg-white text-slate' : 'border border-red-800/30 bg-white text-red-800'}`}
        >
          <span className="flex-1 py-2">{note.text}</span>
          <button type="button" data-ai-note-close className={TAP} onClick={() => setNote(null)}>
            {t('control.ai.note.close')}
          </button>
        </p>
      )}

      <section data-ai-providers className={CARD}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-lg font-bold">{t('control.ai.providers.title')}</h2>
          <InfoTip>{t('control.ai.providers.how')}</InfoTip>
        </div>
        <ul className="flex flex-col gap-3">
          {data.providers.map((p) => (
            <li key={p.providerId} data-ai-provider={p.providerId} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
              <p className="font-bold">{p.providerId}</p>
              {!p.hasAdapter && <p>{t('control.ai.provider.noAdapter')}</p>}
              {p.capability === 'video' && <p data-ai-video-provider>{t('control.video.ai.provider')}</p>}
              {p.capability !== 'video' && p.hasAdapter && !p.minorsEligible && <p>{t('control.ai.provider.notEligible')}</p>}
              {p.capability === 'video' ? null : p.clearedForMinors ? (
                <>
                  <p>{t('control.ai.provider.cleared', { date: day(p.clearedAt), name: name(p.clearedByName) })}</p>
                  {p.termsUrl && <p className="break-all text-slate/70">{t('control.ai.provider.terms', { url: p.termsUrl })}</p>}
                  <button type="button" data-ai-withdraw disabled={busy} className={`${TAP} self-start`} onClick={() => void send({ action: 'clearance', providerId: p.providerId, cleared: false }, 'control.ai.saved')}>
                    {t('control.ai.provider.withdraw')}
                  </button>
                </>
              ) : (
                <>
                  <p>{t('control.ai.provider.notCleared')}</p>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <Input id={`terms-${p.providerId}`} type="url" inputMode="url" maxLength={500} label={t('control.ai.provider.termsUrl')} value={terms[p.providerId] ?? ''} onChange={(e) => setTerms({ ...terms, [p.providerId]: e.target.value })} />
                    <button type="button" data-ai-clear disabled={busy || !(terms[p.providerId] ?? '').trim()} className={TAP} onClick={() => void send({ action: 'clearance', providerId: p.providerId, cleared: true, termsUrl: terms[p.providerId] }, 'control.ai.saved')}>
                      {t('control.ai.provider.clear')}
                    </button>
                  </div>
                </>
              )}
              {p.hasAdapter && (
                <>
                  <p data-ai-key-meta>{p.credential ? t('control.ai.key.set', { date: day(p.credential.setAt), name: name(p.credential.setByName), last4: p.credential.keyLast4 }) : t('control.ai.key.none')}</p>
                  {p.providerId === 'workers-ai' ? (
                    <div data-ai-key-cloudflare className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start">
                      <Input
                        id="key-workers-ai-account"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={200}
                        label={t('control.ai.key.account')}
                        helperText={t('control.ai.key.accountHelp')}
                        error={cfLeft.account && cf.account.trim() && !workersAccountLooksRight(cleanWorkersAccount(cf.account)) ? t('control.ai.err.account_id_format') : undefined}
                        onBlur={() => setCfLeft({ ...cfLeft, account: true })}
                        disabled={!data.keyReady}
                        value={cf.account}
                        onChange={(e) => setCf({ ...cf, account: e.target.value })}
                      />
                      <Input
                        id="key-workers-ai-token"
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={400}
                        label={t('control.ai.key.token')}
                        helperText={t('control.ai.key.tokenHelp')}
                        error={cfLeft.token && cf.token.trim() && !workersTokenLooksRight(cleanWorkersToken(cf.token)) ? t('control.ai.err.token_format') : undefined}
                        onBlur={() => setCfLeft({ ...cfLeft, token: true })}
                        disabled={!data.keyReady}
                        value={cf.token}
                        onChange={(e) => setCf({ ...cf, token: e.target.value })}
                      />
                      <button
                        type="button"
                        data-ai-key-save
                        disabled={busy || !data.keyReady || !workersAccountLooksRight(cleanWorkersAccount(cf.account)) || !workersTokenLooksRight(cleanWorkersToken(cf.token))}
                        className={`${TAP} sm:mt-7`}
                        onClick={() => void send({ action: 'credential', providerId: 'workers-ai', accountId: cf.account, token: cf.token }, 'control.ai.saved', () => {
                          setCf({ account: '', token: '' });
                          setCfLeft({ account: false, token: false });
                        })}
                      >
                        {t('control.ai.key.save')}
                      </button>
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <Input
                        id={`key-${p.providerId}`}
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={400}
                        label={t('control.ai.key.new')}
                        helperText={t('control.ai.key.help')}
                        disabled={!data.keyReady}
                        value={keys[p.providerId] ?? ''}
                        onChange={(e) => setKeys({ ...keys, [p.providerId]: e.target.value })}
                      />
                      <button
                        type="button"
                        data-ai-key-save
                        disabled={busy || !data.keyReady || !(keys[p.providerId] ?? '').trim()}
                        className={TAP}
                        onClick={() => void send({ action: 'credential', providerId: p.providerId, apiKey: keys[p.providerId] }, 'control.ai.saved', () => setKeys((k) => ({ ...k, [p.providerId]: '' })))}
                      >
                        {t('control.ai.key.save')}
                      </button>
                    </div>
                  )}
                  {p.capability === 'video' && p.credential && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" data-ai-key-test disabled={busy} className={TAP} onClick={() => void test(p.providerId)}>
                        {t('control.video.ai.test')}
                      </button>
                      {p.credential.testedAt && (
                        <span data-ai-key-tested>{t(p.credential.testOk ? 'control.video.ai.testedOk' : 'control.video.ai.testedFailed', { date: day(p.credential.testedAt) })}</span>
                      )}
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section data-ai-profiles className={CARD}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-lg font-bold">{t('control.ai.profile.title')}</h2>
          <InfoTip>{t('control.ai.profile.how')}</InfoTip>
        </div>
        {data.profiles.map((p) => {
          const d = drafts[p.profileId] ?? draftOf(p);
          const set = (patch: Partial<Draft>) => setDrafts({ ...drafts, [p.profileId]: { ...d, ...patch } });
          // What the feature does, for one that says so (AI marking's two tasks, C349).
          const about = `control.ai.profile.about.${p.profileId}`;
          const options = (
            <>
              <option value="">{t('control.ai.profile.none')}</option>
              {data.providerChoices.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </>
          );
          return (
            <div key={p.profileId} data-ai-profile={p.profileId} className="flex flex-col gap-3 rounded-md border border-slate/10 p-3">
              <p className="font-bold">{t(`control.ai.profile.name.${p.profileId}` as MessageKey)}</p>
              {isMessageKey(about) && <p data-ai-profile-about>{t(about)}</p>}
              {p.carriesChildWords && <p className="text-slate/70">{t('control.ai.profile.childWords')}</p>}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Select id={`provider-${p.profileId}`} label={t('control.ai.profile.provider')} value={d.providerId} onChange={(e) => set({ providerId: e.target.value })}>
                  {options}
                </Select>
                <Input id={`model-${p.profileId}`} maxLength={80} spellCheck={false} label={t('control.ai.profile.model')} value={d.model} onChange={(e) => set({ model: e.target.value })} />
                {p.usesPrompt && (
                  <Input id={`prompt-${p.profileId}`} maxLength={32} spellCheck={false} label={t('control.ai.profile.promptVersion')} value={d.promptVersion} onChange={(e) => set({ promptVersion: e.target.value })} />
                )}
                <Select id={`fallback-${p.profileId}`} label={t('control.ai.profile.fallbackProvider')} value={d.fallbackProvider} onChange={(e) => set({ fallbackProvider: e.target.value })}>
                  {options}
                </Select>
                <Input id={`fallback-model-${p.profileId}`} maxLength={80} spellCheck={false} label={t('control.ai.profile.fallbackModel')} value={d.fallbackModel} onChange={(e) => set({ fallbackModel: e.target.value })} />
              </div>
              <Switch id={`enabled-${p.profileId}`} label={t('control.ai.profile.enabled')} stateText={d.enabled ? t('control.ai.profile.on') : t('control.ai.profile.off')} checked={d.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
              <button
                type="button"
                data-ai-profile-save
                disabled={busy}
                className={`${PRIMARY} self-start`}
                onClick={() =>
                  void send(
                    {
                      action: 'profile',
                      profileId: p.profileId,
                      providerId: d.providerId || null,
                      model: d.model.trim() || null,
                      promptVersion: d.promptVersion.trim(),
                      enabled: d.enabled,
                      fallback: d.fallbackProvider && d.fallbackModel.trim() ? [{ provider: d.fallbackProvider, model: d.fallbackModel.trim() }] : [],
                    },
                    'control.ai.saved'
                  )
                }
              >
                {t('control.ai.profile.save')}
              </button>
            </div>
          );
        })}
      </section>

      <section data-ai-usage className={CARD}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-lg font-bold">{t('control.ai.usage.title')}</h2>
          <InfoTip>{t('control.ai.usage.how')}</InfoTip>
        </div>
        {data.usage.map((u) => (
          <div key={u.profileId} data-ai-usage-profile={u.profileId} className="flex flex-col gap-1">
            <p className="font-bold">{t(`control.ai.profile.name.${u.profileId}` as MessageKey)}</p>
            <p>
              <span className="font-semibold">{t('control.ai.usage.today')}</span>: {usageLine(u.today)}
            </p>
            <p>
              <span className="font-semibold">{t('control.ai.usage.month')}</span>: {usageLine(u.month)}
            </p>
          </div>
        ))}
      </section>

      <section data-ai-cap className={CARD}>
        <div className="flex flex-wrap items-center gap-x-1">
          <h2 className="text-lg font-bold">{t('control.ai.cap.title')}</h2>
          <InfoTip>{t('control.ai.cap.how')}</InfoTip>
        </div>
        <p>{data.cap === null ? t('control.ai.cap.notSet') : t('control.ai.cap.current', { value: data.cap })}</p>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_auto] sm:items-end">
          <Input id="ai-cap" inputMode="numeric" label={t('control.ai.cap.label')} value={cap} onChange={(e) => setCap(e.target.value)} />
          <button type="button" data-ai-cap-save disabled={busy || !/^\d{1,4}$/.test(cap.trim())} className={TAP} onClick={() => void send({ action: 'cap', value: Number(cap.trim()) }, 'control.ai.saved')}>
            {t('control.ai.cap.save')}
          </button>
        </div>
      </section>

      <section data-ai-changes className={CARD}>
        <h2 className="text-lg font-bold">{t('control.ai.changes.title')}</h2>
        {data.changes.length === 0 && <p>{t('control.ai.changes.none')}</p>}
        <ul className="flex flex-col gap-2">
          {data.changes.map((c) => (
            <li key={c.auditId} data-ai-change className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate/10 p-3">
              <span>{t('control.ai.changes.line', { what: t(`control.ai.change.${c.action}` as MessageKey), target: c.target ?? '', date: day(c.at), name: name(c.byName) })}</span>
              {c.canUndo ? (
                <button type="button" data-ai-undo disabled={busy} className={TAP} onClick={() => void send({ action: 'undo', auditId: c.auditId }, 'control.ai.undone')}>
                  {t('control.ai.changes.undo')}
                </button>
              ) : (
                c.action === 'ai.credential_set' && <span className="text-slate/70">{t('control.ai.changes.keyNoUndo')}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
