'use client';

import { useState } from 'react';
import { useWords } from '@/components/app-shell/Words';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { PRIMARY, SECTION, TAP } from '@/components/exams/SchemeParts';
import { Input } from '@/components/ui/Input';
import type { FamilyBoard, FamilyBoardProblem } from '@/lib/content/family-boards';
import type { MessageKey } from '@/lib/i18n';

// Control → Boards, second section (C230-AP): the family app's boards (content.boards), the list a parent picks a
// child's board from. Apart from the school exam boards above, which carry grading presets; no join. Staff add a board
// or correct its names; a board is never deleted. Every change goes to the Control API, which checks the session and
// writes the audit row.

const PROBLEMS: FamilyBoardProblem[] = ['board_id', 'name_en', 'name_hi', 'id_taken', 'not_found'];
type Form = { boardId: string; nameEn: string; nameHi: string };
const EMPTY: Form = { boardId: '', nameEn: '', nameHi: '' };

export function FamilyBoardsSection({ initial }: { initial: FamilyBoard[] }) {
  const { t, tCount } = useWords();
  const [boards, setBoards] = useState<FamilyBoard[]>(initial);
  const [adding, setAdding] = useState<Form>(EMPTY);
  const [editing, setEditing] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async (payload: unknown, done: MessageKey): Promise<boolean> => {
    setBusy(true);
    setNote(null);
    const res = await fetch('/api/control/boards/family', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    if (!res?.ok) {
      setBusy(false);
      const code = got?.code as FamilyBoardProblem | undefined;
      setNote({ ok: false, text: t(code && PROBLEMS.includes(code) ? (`fboards.err.${code}` as MessageKey) : 'fboards.err.other') });
      return false;
    }
    const list = await fetch('/api/control/boards/family', { cache: 'no-store' }).catch(() => null);
    const fresh = list?.ok ? ((await list.json().catch(() => null)) as { boards: FamilyBoard[] } | null) : null;
    if (fresh) setBoards(fresh.boards);
    setBusy(false);
    setNote({ ok: true, text: t(done) });
    return true;
  };

  return (
    <section data-family-boards className={SECTION}>
      <div className="flex flex-wrap items-center gap-x-1">
        <h2 className="text-base font-bold">{t('fboards.title')}</h2>
        <InfoTip>{t('fboards.how')}</InfoTip>
      </div>
      <p>{t('fboards.lead')}</p>
      {note && (
        <p role="status" data-family-boards-note={note.ok ? 'ok' : 'error'} className={`rounded-md px-3 py-2 font-semibold ${note.ok ? 'bg-off-white text-slate' : 'border border-red-800/30 text-red-800'}`}>
          {note.text}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {boards.map((b) => (
          <li key={b.boardId} data-family-board={b.boardId} className="flex flex-col gap-2 rounded-md border border-slate/10 p-3">
            {editing?.boardId === b.boardId ? (
              <>
                <p className="font-bold">{b.boardId}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input id={`fb-en-${b.boardId}`} label={t('fboards.nameEn')} maxLength={120} value={editing.nameEn} onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })} />
                  <Input id={`fb-hi-${b.boardId}`} lang="hi" label={t('fboards.nameHi')} maxLength={120} value={editing.nameHi} onChange={(e) => setEditing({ ...editing, nameHi: e.target.value })} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" data-family-board-save className={PRIMARY} disabled={busy || !editing.nameEn.trim()} onClick={() => void send({ action: 'rename', ...editing }, 'fboards.renamed').then((ok) => ok && setEditing(null))}>
                    {t('fboards.save')}
                  </button>
                  <button type="button" className={TAP} disabled={busy} onClick={() => setEditing(null)}>
                    {t('gs.cancel')}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="font-bold">{b.nameEn}</p>
                  {b.nameHi ? <p lang="hi">{b.nameHi}</p> : <p className="text-slate/70">{t('fboards.noHindi')}</p>}
                  <p className="text-slate/70">
                    {b.boardId} · {tCount('fboards.versions', b.versions)}
                  </p>
                </div>
                <button type="button" data-family-board-edit className={TAP} disabled={busy} onClick={() => setEditing({ boardId: b.boardId, nameEn: b.nameEn, nameHi: b.nameHi ?? '' })}>
                  {t('fboards.edit')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div data-family-board-new className="flex flex-col gap-3 border-t border-slate/10 pt-3">
        <h3 className="font-bold">{t('fboards.add.title')}</h3>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,1fr)]">
          <Input id="fb-new-id" label={t('fboards.id')} maxLength={16} value={adding.boardId} onChange={(e) => setAdding({ ...adding, boardId: e.target.value.trim().toUpperCase() })} />
          <Input id="fb-new-en" label={t('fboards.nameEn')} maxLength={120} value={adding.nameEn} onChange={(e) => setAdding({ ...adding, nameEn: e.target.value })} />
          <Input id="fb-new-hi" lang="hi" label={t('fboards.nameHi')} maxLength={120} value={adding.nameHi} onChange={(e) => setAdding({ ...adding, nameHi: e.target.value })} />
        </div>
        <button type="button" data-family-board-add className={`${PRIMARY} self-start`} disabled={busy || !adding.boardId || !adding.nameEn.trim()} onClick={() => void send({ action: 'add', ...adding }, 'fboards.added').then((ok) => ok && setAdding(EMPTY))}>
          {t('fboards.add.save')}
        </button>
      </div>
    </section>
  );
}
