'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { Field, FIELD, PRIMARY, SECTION } from '@/components/exams/SchemeParts';
import type { MessageKey } from '@/lib/i18n';

// Control → a school → Exams: the board the school records (docs/27 row 9a, C213). NetCyberAI sets it here; the
// school's principal or school admin can also set it on the grading scheme screen. Audited either way.

type Data = { board: { boardId: string | null; name: string | null; setBy: string | null; setAt: string | null }; boards: { boardId: string; name: string }[] };

export function BoardSchoolPanel({ schoolId }: { schoolId: string }) {
  const { t, lang } = useT();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const when = (iso: string) => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));

  const load = useCallback(async () => {
    const res = await fetch(`/api/control/boards/schools/${schoolId}`, { cache: 'no-store' }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as Data | null) : null;
    setFailed(!got);
    if (got) {
      setData(got);
      setChoice(got.board.boardId ?? '');
    }
  }, [schoolId]);
  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    setNote(null);
    const res = await fetch(`/api/control/boards/schools/${schoolId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boardId: choice || null }) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    if (!res?.ok) return setNote({ ok: false, text: ['no_board', 'not_found'].includes(got?.code) ? t(`boards.err.${got.code}` as MessageKey) : t('boards.err.other') });
    setNote({ ok: true, text: t('gs.board.saved') });
    await load();
  };

  if (failed) return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('empty.not-loaded.title')}</p>;
  if (!data) return null;
  return (
    <section lang={lang} data-school-board className={`${SECTION} text-sm text-slate`}>
      <h2 className="text-base font-bold">{t('boards.school.title')}</h2>
      <p className="text-slate/70">{t('boards.school.how')}</p>
      {note && <p role="status" className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>{note.text}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <Field id="school-board" label={t('gs.board.label')}>
            <select id="school-board" className={FIELD} value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">{t('gs.board.none')}</option>
              {data.boards.map((b) => (
                <option key={b.boardId} value={b.boardId}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button type="button" data-school-board-save className={PRIMARY} disabled={busy || choice === (data.board.boardId ?? '')} onClick={() => void save()}>
          {t('gs.board.save')}
        </button>
      </div>
      {data.board.setAt && <p className="text-slate/70">{data.board.setBy ? t('gs.board.setBy', { name: data.board.setBy, date: when(data.board.setAt) }) : t('gs.board.setOn', { date: when(data.board.setAt) })}</p>}
    </section>
  );
}
