'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { LinkedSchool, SchoolHomework } from '@/lib/contracts/school-link';
import { fill, type Words } from '@/lib/family/fill';
import { familyApi } from './client';

// The parent area's "Your school" (C230-AA; docs/family-app/03 §4). A family uses the app on its own; when its school
// is on NetCyberAI, the school's office gives the parent a Family app code and the parent connects here. Then each of
// the guardian's children at the school can be matched to a child in this app (the parent chooses; nothing is merged
// by guess), and the school's part shows. Disconnecting takes the school's part away at once; the app's own learning
// stays.

export type SchoolLinkView = { linkId: string; school: LinkedSchool; pairs: { studentId: string; childId: string }[] };

const rupees = (minor: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(minor / 100);
// A due day (yyyy-mm-dd) as "24 Oct" / "24 अक्टू॰", read as a calendar day (no time zone moves it).
const day = (iso: string, lang: 'en' | 'hi') => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

// The homework the school set for a matched child's class and section (C329), read only.
function HomeworkList({ w, lang, items }: { w: Words; lang: 'en' | 'hi'; items: SchoolHomework[] }) {
  return (
    <div className="flex flex-col gap-1" data-school-homework>
      <p className="text-sm font-semibold text-slate">{w['fam.school.homework']}</p>
      {items.length === 0 ? (
        <p className="text-sm text-slate">{w['fam.school.homeworkNone']}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((h, i) => (
            <li key={i} className="rounded-lg bg-slate/5 px-3 py-2 text-sm text-slate">
              <p className="font-semibold">
                {h.subject ? `${h.subject}: ` : ''}
                {h.title}
              </p>
              {h.details && <p className="whitespace-pre-line">{h.details}</p>}
              <p>
                {h.due ? fill(w['fam.school.homeworkDue'], { date: day(h.due, lang) }) : ''}
                {h.done ? `${h.due ? ' · ' : ''}${w['fam.school.homeworkDone']}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConnectForm({ w, again }: { w: Words; again: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const connect = async () => {
    setBusy(true);
    setError('');
    const r = await familyApi('/api/family/school/connect', 'POST', { code });
    setBusy(false);
    if (!r.ok) return setError(r.error === 'too_many_tries' ? w['fam.school.tooMany'] : w['fam.school.badCode']);
    setCode('');
    router.refresh();
  };
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void connect();
      }}
    >
      {!again && <p className="text-sm text-slate">{w['fam.school.lead']}</p>}
      <Input id="fam-school-code" label={again ? w['fam.school.another'] : w['fam.school.code']} value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} autoComplete="off" helperText={w['fam.school.codeHelp']} />
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || code.replace(/[\s-]/g, '').length !== 8} className="self-start">
        {w['fam.school.connect']}
      </Button>
    </form>
  );
}

function LinkCard({ w, lang, link, children }: { w: Words; lang: 'en' | 'hi'; link: SchoolLinkView; children: { childId: string; firstName: string }[] }) {
  const router = useRouter();
  const initial = Object.fromEntries(link.school.children.map((c) => [c.studentId, link.pairs.find((p) => p.studentId === c.studentId)?.childId ?? '']));
  const [choice, setChoice] = useState<Record<string, string>>(initial);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(choice) !== JSON.stringify(initial);
  const save = async () => {
    setError('');
    const r = await familyApi('/api/family/school/children', 'POST', { linkId: link.linkId, pairs: link.school.children.map((c) => ({ studentId: c.studentId, childId: choice[c.studentId] || null })) });
    if (!r.ok) return setError(w['fam.school.saveError']);
    setSaved(true);
    router.refresh();
  };
  const unlink = async () => {
    const r = await familyApi('/api/family/school/unlink', 'POST', { linkId: link.linkId });
    if (!r.ok) return setError(w['fam.school.saveError']);
    router.refresh();
  };
  const usedElsewhere = (studentId: string) => new Set(Object.entries(choice).filter(([s, c]) => s !== studentId && c).map(([, c]) => c));
  return (
    <div data-school-link={link.linkId} className="flex flex-col gap-3 rounded-2xl bg-off-white p-3">
      <p className="text-base font-bold text-slate">{fill(w['fam.school.connected'], { school: link.school.schoolName })}</p>
      {link.school.children.length === 0 ? (
        <p className="text-sm text-slate">{w['fam.school.noChildren']}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {link.school.children.map((c) => (
            <li key={c.studentId} data-school-child={c.studentId} className="flex flex-col gap-2 rounded-xl bg-white p-3 ring-1 ring-slate/10">
              <p className="text-base font-semibold text-slate">
                {c.name}
                {c.className ? ` · ${c.className}` : ''}
              </p>
              <p className="text-sm text-slate">
                {fill(w['fam.school.today'], { mark: w[`fam.school.mark.${c.today ?? 'none'}`] })}
                {c.markedDays > 0 ? ` · ${fill(w['fam.school.present'], { present: c.presentDays, marked: c.markedDays })}` : ''}
                {c.dueMinor > 0 ? ` · ${fill(w['fam.school.due'], { amount: rupees(c.dueMinor) })}` : ''}
              </p>
              {c.homework && <HomeworkList w={w} lang={lang} items={c.homework} />}
              <label className="flex flex-col gap-1 text-sm font-semibold text-slate" htmlFor={`fam-school-pair-${c.studentId}`}>
                {w['fam.school.whichChild']}
                <select
                  id={`fam-school-pair-${c.studentId}`}
                  value={choice[c.studentId] ?? ''}
                  onChange={(e) => {
                    setSaved(false);
                    setChoice({ ...choice, [c.studentId]: e.target.value });
                  }}
                  className="min-h-[44px] rounded-xl border border-slate/30 bg-white px-3 text-base text-slate"
                >
                  <option value="">{w['fam.school.notLinked']}</option>
                  {children
                    .filter((k) => !usedElsewhere(c.studentId).has(k.childId))
                    .map((k) => (
                      <option key={k.childId} value={k.childId}>
                        {k.firstName}
                      </option>
                    ))}
                </select>
              </label>
            </li>
          ))}
        </ul>
      )}
      {link.school.awaitingConsent > 0 && <p className="text-sm text-slate">{fill(w['fam.school.awaiting'], { n: link.school.awaitingConsent })}</p>}
      {children.length === 0 && <p className="text-sm text-slate">{w['fam.school.addChildFirst']}</p>}
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
      {saved && !dirty && (
        <p role="status" className="text-sm font-semibold text-emerald-text">
          {w['fam.school.saved']}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {link.school.children.length > 0 && (
          <Button type="button" disabled={!dirty} onClick={() => void save()}>
            {w['fam.school.save']}
          </Button>
        )}
        {!confirm ? (
          <Button type="button" variant="outline" onClick={() => setConfirm(true)}>
            {w['fam.school.disconnect']}
          </Button>
        ) : (
          <>
            <p className="w-full text-sm text-slate">{w['fam.school.disconnectNote']}</p>
            <Button type="button" variant="outline" onClick={() => void unlink()}>
              {w['fam.school.disconnectYes']}
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirm(false)}>
              {w['fam.common.cancel']}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function SchoolSection({ w, lang, links, children }: { w: Words; lang: 'en' | 'hi'; links: SchoolLinkView[]; children: { childId: string; firstName: string }[] }) {
  return (
    <section data-school-section className="fam-card fam-rise flex flex-col gap-3 bg-white p-4 sm:p-5">
      <h2 className="text-lg font-extrabold text-slate">{w['fam.school.title']}</h2>
      {links.map((l) => (
        <LinkCard key={l.linkId} w={w} lang={lang} link={l} children={children} />
      ))}
      <ConnectForm w={w} again={links.length > 0} />
    </section>
  );
}
