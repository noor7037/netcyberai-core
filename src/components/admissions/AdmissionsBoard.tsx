'use client';

import { useState, type DragEvent } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { InfoTip } from '@/components/app-ui/InfoTip';
import { Input } from '@/components/ui/Input';
import type { MessageKey } from '@/lib/i18n';

// The pipeline as a board (W21-M1): enquiry → visit → form → admitted, or lost. Drag a card to another column, or
// tap it and choose where it goes; each move is the enquiry's own "record what happened" (POST action 'outcome'), so
// the database keeps the step with who moved it and when, and "lost" asks why. Admitted is reached only by Admit on
// the enquiry's card below (it makes the child's record), never by a move. The columns are the pipeline's stages:
// "Visit" holds Visit booked and Visited, "Form" holds Form taken and Form submitted (the offer of a place).

type Stage = 'enquiry' | 'visit_booked' | 'visited' | 'form_taken' | 'form_submitted' | 'admitted' | 'not_joining';
export type BoardRow = { enquiry_id: string; child_name: string | null; class_name: string; source: string; stage: Stage; next_follow_up: string | null; next_step: string | null; erased_on: string | null };
type Column = { id: 'enquiry' | 'visit' | 'form' | 'admitted' | 'lost'; stages: Stage[]; target: Stage | null };
export const COLUMNS: readonly Column[] = [
  { id: 'enquiry', stages: ['enquiry'], target: 'enquiry' },
  { id: 'visit', stages: ['visit_booked', 'visited'], target: 'visit_booked' },
  { id: 'form', stages: ['form_taken', 'form_submitted'], target: 'form_taken' },
  { id: 'admitted', stages: ['admitted'], target: null },
  { id: 'lost', stages: ['not_joining'], target: 'not_joining' },
];
// The admitted and lost columns show their latest few; every one is in the lists below.
const CLOSED_SHOWN = 10;
const TAP = 'min-h-[44px] rounded-md border border-slate/20 bg-white px-3 text-sm font-semibold text-slate disabled:opacity-60';

const columnOf = (s: Stage) => COLUMNS.find((c) => c.stages.includes(s))!;

export function AdmissionsBoard<R extends BoardRow>({ rows, busy, onMove }: { rows: readonly R[]; busy: boolean; onMove: (r: R, stage: Stage, reason?: string) => Promise<boolean> }) {
  const { t, lang } = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const [losing, setLosing] = useState<{ id: string; reason: string } | null>(null);
  const [over, setOver] = useState<Column['id'] | null>(null);
  const byId = new Map(rows.map((r) => [r.enquiry_id, r]));

  const move = async (r: R, c: Column) => {
    if (!c.target || columnOf(r.stage).id === c.id) return;
    if (c.target === 'not_joining') {
      setOpenId(r.enquiry_id);
      setLosing({ id: r.enquiry_id, reason: '' });
      return;
    }
    if (await onMove(r, c.target)) setOpenId(null);
  };
  const drop = (e: DragEvent, c: Column) => {
    e.preventDefault();
    setOver(null);
    const r = byId.get(e.dataTransfer.getData('text/plain'));
    if (r && !busy) void move(r, c);
  };
  const childLine = (r: R) => (r.erased_on ? t('adm.erased.title', { class: r.class_name }) : t('adm.childFor', { child: r.child_name ?? '', class: r.class_name }));

  return (
    <section data-adm-board aria-labelledby="adm-board-title" className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4">
      <div className="flex flex-wrap items-center gap-x-1">
        <h2 id="adm-board-title" className="text-base font-bold">{t('adm.board.title')}</h2>
        <InfoTip>{t('adm.board.how')}</InfoTip>
      </div>
      <div lang={lang} className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {COLUMNS.map((c) => {
          const all = rows.filter((r) => c.stages.includes(r.stage));
          const shown = c.target === 'enquiry' || c.target === 'visit_booked' || c.target === 'form_taken' ? all : all.slice(0, CLOSED_SHOWN);
          const droppable = c.target !== null;
          return (
            <div
              key={c.id}
              data-adm-column={c.id}
              data-count={all.length}
              onDragOver={droppable ? (e) => { e.preventDefault(); setOver(c.id); } : undefined}
              onDragLeave={droppable ? () => setOver(null) : undefined}
              onDrop={droppable ? (e) => drop(e, c) : undefined}
              className={`flex min-w-0 flex-col gap-2 rounded-md border p-2 ${over === c.id ? 'border-sapphire bg-off-white' : 'border-slate/10 bg-white'}`}
            >
              <h3 className="px-1 text-sm font-bold">{t('adm.board.column', { column: t(`adm.board.col.${c.id}` as MessageKey), count: all.length })}</h3>
              {all.length === 0 && <p className="px-1 text-slate/70">{t('adm.board.empty')}</p>}
              <ul className="flex flex-col gap-2">
                {shown.map((r) => {
                  const open = openId === r.enquiry_id;
                  const movable = r.stage !== 'admitted';
                  return (
                    <li
                      key={r.enquiry_id}
                      data-adm-card={r.enquiry_id}
                      data-stage={r.stage}
                      draggable={movable && !busy}
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', r.enquiry_id); e.dataTransfer.effectAllowed = 'move'; }}
                      className="flex min-w-0 flex-col gap-2 rounded-md border border-slate/10 bg-white p-2"
                    >
                      <button
                        type="button"
                        aria-expanded={open}
                        className="flex min-h-[44px] min-w-0 flex-col items-start text-left"
                        onClick={() => { setOpenId(open ? null : r.enquiry_id); setLosing(null); }}
                      >
                        <span className="break-words font-semibold">{childLine(r)}</span>
                        <span className="break-words text-xs text-slate/70">{[t(`adm.stage.${r.stage}` as MessageKey), t(`adm.source.${r.source}` as MessageKey)].join(' · ')}</span>
                      </button>
                      {open && (
                        <div data-adm-move className="flex flex-col gap-2">
                          {movable && losing?.id !== r.enquiry_id && (
                            <div className="flex flex-wrap gap-2">
                              {COLUMNS.filter((to) => to.target && to.id !== c.id).map((to) => (
                                <button key={to.id} type="button" data-adm-move-to={to.id} disabled={busy} className={TAP} onClick={() => void move(r, to)}>
                                  {t('adm.board.moveTo', { column: t(`adm.board.col.${to.id}` as MessageKey) })}
                                </button>
                              ))}
                            </div>
                          )}
                          {losing?.id === r.enquiry_id && (
                            <div data-adm-lost className="flex flex-col gap-2">
                              <Input id={`adm-lost-${r.enquiry_id}`} label={t('adm.board.lostWhy')} maxLength={120} value={losing.reason} onChange={(e) => setLosing({ id: r.enquiry_id, reason: e.target.value })} />
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  data-adm-lost-save
                                  disabled={busy || !losing.reason.trim()}
                                  className={TAP}
                                  onClick={async () => { if (await onMove(r, 'not_joining', losing.reason)) { setLosing(null); setOpenId(null); } }}
                                >
                                  {t('adm.board.lostSave')}
                                </button>
                                <button type="button" className={TAP} onClick={() => setLosing(null)}>
                                  {t('adm.cancel')}
                                </button>
                              </div>
                            </div>
                          )}
                          <a href={`#enquiry-${r.enquiry_id}`} className="inline-flex min-h-[44px] items-center font-semibold text-sapphire underline">
                            {t(r.stage === 'form_submitted' || r.stage === 'form_taken' ? 'adm.board.openToAdmit' : 'adm.board.open')}
                          </a>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {shown.length < all.length && <p className="px-1 text-slate/70">{t('adm.board.more', { count: all.length - shown.length })}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
