'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/visual/Icons';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { CHILDREN, PARENT, PARENT_BUTTON_REPLIES, PARENT_MENU, PARENT_REPLIES, type ParentChildId, type ParentMenuId } from '@/demo-fixture/role-apps';
import { PhoneShell } from './PhoneShell';

// The parent's side, built on WhatsApp: there is no parent app to
// install (Decision Log C13). Every parent module of the principal
// dashboard (children, attendance, homework, marks, fees, receipts, PTM,
// notices, messages, concerns, documents, consent) is one tap away in
// the school chat's menu, the way a WhatsApp list message works.

type Draft = { from: 'school'; title?: string; lines: string[]; buttons?: string[]; tag?: string } | { from: 'parent'; text: string };
type Msg = Draft & { id: number };

const TIERS = ['Achhe se samjha', 'Thoda samjha', 'Samajh nahi aaya'];

function opening(child: ParentChildId): Msg[] {
  const c = CHILDREN[child];
  return [
    {
      id: 1,
      from: 'school',
      tag: 'Daily Learning Pulse',
      title: `Namaste ${PARENT.name}! What ${c.name} learned today`,
      lines:
        child === 'rahul'
          ? ['Maths · Fractions: which is bigger, 3/4 or 5/8? Ask Rahul why.', 'English · The Rainbow: what do we need to see a rainbow?', `Aaj ${c.name} ne kitna samjha?`]
          : ['Hindi · Varnamala: say three words that start with “ka”.', 'Maths · Counting to 50 in tens.', `Aaj ${c.name} ne kitna samjha?`],
      buttons: TIERS,
    },
  ];
}

export function ParentWhatsApp() {
  const [child, setChild] = useState<ParentChildId>('rahul');
  const [msgs, setMsgs] = useState<Msg[]>(() => opening('rahul'));
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const nextId = useRef(2);
  const chatRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = chatRef.current?.parentElement;
    if (el && msgs.length > 1) el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [msgs, reduced]);

  const push = (...m: Draft[]) => setMsgs((all) => [...all, ...m.map((x) => ({ ...x, id: nextId.current++ }))]);

  function choose(id: ParentMenuId) {
    const item = PARENT_MENU.find((m) => m.id === id)!;
    const r = PARENT_REPLIES[child][id];
    setMenuOpen(false);
    push({ from: 'parent', text: item.label }, { from: 'school', title: r.title, lines: r.lines, buttons: r.buttons });
  }

  function tap(label: string) {
    if (TIERS.includes(label)) {
      push({ from: 'parent', text: label }, { from: 'school', tag: 'Response recorded', lines: [`Thank you, ${PARENT.name}. The class teacher sees your reply and follows up where it is needed.`] });
      return;
    }
    if (/^\d{1,2}:\d{2} (am|pm)$/.test(label)) {
      push({ from: 'parent', text: label }, { from: 'school', tag: 'PTM booked', lines: [`Booked: Sat 26 Sep at ${label} with ${CHILDREN[child].teacher}. A reminder comes the evening before.`] });
      return;
    }
    if (['Transport', 'Academics', 'Fees', 'Other'].includes(label)) {
      push({ from: 'parent', text: label }, { from: 'school', tag: 'Concern CN-1043', lines: [`Your ${label.toLowerCase()} concern is logged and assigned. Updates will come here until it is resolved.`] });
      return;
    }
    const reply = PARENT_BUTTON_REPLIES[label] ?? 'Noted.';
    push({ from: 'parent', text: label }, { from: 'school', lines: [reply] });
  }

  function switchChild(id: ParentChildId) {
    setChild(id);
    setMenuOpen(false);
    nextId.current = 2;
    setMsgs(opening(id));
  }

  return (
    <PhoneShell
      label="Demo WhatsApp chat between the school and a parent"
      bar="emerald"
      screen="bg-peach/25"
      header={
        <div className="bg-emerald text-white">
          <div className="flex items-center gap-2.5 px-3 pb-2 pt-1">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-extrabold text-emerald">
              SI
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold">{PARENT.school}</span>
              <span className="block truncate text-xs">{`School updates · ${CHILDREN[child].name}, ${CHILDREN[child].cls}`}</span>
            </span>
          </div>
          <div role="group" aria-label="Choose child" className="flex gap-1.5 px-3 pb-2">
            {(Object.keys(CHILDREN) as ParentChildId[]).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={child === id}
                onClick={() => switchChild(id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${child === id ? 'bg-white text-emerald' : 'bg-white/15 text-white hover:bg-white/25'}`}
              >
                {`${CHILDREN[id].name} · ${CHILDREN[id].cls}`}
              </button>
            ))}
          </div>
        </div>
      }
      footer={
        <div className="relative border-t border-slate/10 bg-white">
          {menuOpen && (
            <div className="nca-pop absolute inset-x-2 bottom-full mb-2 max-h-[22rem] overflow-y-auto rounded-2xl bg-white p-2 shadow-2xl nca-scroll">
              <p className="px-2 pb-1 pt-1 text-xs font-extrabold text-slate">{`${PARENT.school} · Menu`}</p>
              <ul>
                {PARENT_MENU.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => choose(m.id)} className="nca-row flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald/10 text-emerald">
                        <Icon name={m.icon} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <b className="block text-xs text-slate">{m.label}</b>
                        <span className="block text-[11px] text-slate/70">{m.hint}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const text = draft.trim();
              if (!text) return;
              setDraft('');
              push({ from: 'parent', text }, { from: 'school', lines: [`Forwarded to ${CHILDREN[child].teacher}, the class teacher. You will get a reply here during school hours.`] });
            }}
            className="flex items-center gap-2 px-2 py-2"
          >
            <button
              type="button"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              className="flex min-h-[36px] shrink-0 items-center gap-1 rounded-full bg-emerald/10 px-3 text-xs font-bold text-emerald focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal"
            >
              <span aria-hidden="true">☰</span> Menu
            </button>
            <label className="min-w-0 flex-1">
              <span className="sr-only">Message the school</span>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message" className="min-h-[36px] w-full rounded-full bg-off-white px-3 text-xs text-slate outline-none focus-visible:ring-2 focus-visible:ring-royal" />
            </label>
            <button type="submit" aria-label="Send" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald text-white">
              <Icon name="arrow" className="h-4 w-4" />
            </button>
          </form>
        </div>
      }
    >
      <div ref={chatRef} className="flex flex-col gap-2 p-3">
        <p className="mx-auto rounded-md bg-white/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate/70">Today</p>
        {msgs.map((m) =>
          m.from === 'parent' ? (
            <p key={m.id} className="nca-pop ml-10 self-end rounded-xl rounded-tr-none bg-leaf/25 px-3 py-2 text-xs text-slate shadow-sm">
              {m.text}
              <span className="block text-right text-[10px] text-slate/70">✓✓</span>
            </p>
          ) : (
            <div key={m.id} className="nca-pop mr-6 self-start overflow-hidden rounded-xl rounded-tl-none bg-white text-xs text-slate shadow-sm">
              {m.tag && <p className="bg-emerald/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald">{m.tag}</p>}
              <div className="flex flex-col gap-1 px-3 py-2">
                {m.title && <b>{m.title}</b>}
                {m.lines.map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </div>
              {m.buttons && (
                <ul className="border-t border-slate/10">
                  {m.buttons.map((b) => (
                    <li key={b} className="border-b border-slate/10 last:border-0">
                      <button type="button" onClick={() => tap(b)} className="w-full py-2 text-center text-xs font-bold text-emerald hover:bg-emerald/5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-royal">
                        {b}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ),
        )}
      </div>
    </PhoneShell>
  );
}
