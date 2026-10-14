'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@/components/app-shell/LangContext';
import { FIELD, SECTION } from '@/components/exams/SchemeParts';
import type { GenomePicker } from '@/lib/genome/genome';
import type { Genome } from '@/lib/genome/rules';
import { GenomeChild } from './GenomeChild';

// Learning Genome v1 (docs/27 row 9e, C217): pick a class, then a child, and read that child's genome. The classes
// are the ones this person may open (a teacher: their own); the children are in roll order, never by marks. The
// choice is kept in the address, so a refresh or a shared link opens the same child for someone who may read them.

type Problem = 'failed' | 'not_found' | null;

// The class and child chosen, kept in the address.
function remember(c: string | null, s: string | null) {
  const q = new URLSearchParams();
  if (c) q.set('class', c);
  if (c && s) q.set('child', s);
  const query = q.toString();
  window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
}

export function GenomeView({ initialClass, initialChild }: { initialClass: string | null; initialChild: string | null }) {
  const { t, lang } = useT();
  const [picker, setPicker] = useState<GenomePicker | null>(null);
  const [classId, setClassId] = useState<string | null>(initialClass);
  const [childId, setChildId] = useState<string | null>(initialChild);
  const [genome, setGenome] = useState<Genome | null>(null);
  const [problem, setProblem] = useState<Problem>(null);

  const classIdRef = useRef(classId);
  classIdRef.current = classId;

  // A load for a class or child chosen before is aborted when another is chosen, so a slow answer never replaces a
  // newer one and no request is left open.
  const loadPicker = useCallback(async (c: string | null, signal: AbortSignal) => {
    const res = await fetch(`/api/app/learning-genome${c ? `?class=${c}` : ''}`, { cache: 'no-store', signal }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as GenomePicker | null) : null;
    if (signal.aborted) return;
    if (res?.status === 404 && c) {
      setProblem('not_found');
      setClassId(null);
      setChildId(null);
      remember(null, null);
      return;
    }
    if (!got) return setProblem('failed');
    setPicker(got);
  }, []);
  const loadGenome = useCallback(async (s: string, signal: AbortSignal) => {
    const res = await fetch(`/api/app/learning-genome/${s}`, { cache: 'no-store', signal }).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as Genome | null) : null;
    if (signal.aborted) return;
    if (res?.status === 404) {
      setProblem('not_found');
      setChildId(null);
      remember(classIdRef.current, null);
      return;
    }
    if (!got) return setProblem('failed');
    setGenome(got);
  }, []);

  useEffect(() => {
    const load = new AbortController();
    void loadPicker(classId, load.signal);
    return () => load.abort();
  }, [classId, loadPicker]);
  useEffect(() => {
    const load = new AbortController();
    setGenome(null);
    if (childId) void loadGenome(childId, load.signal);
    return () => load.abort();
  }, [childId, loadGenome]);

  const chooseClass = (c: string) => {
    const next = c || null;
    setProblem(null);
    setChildId(null);
    setClassId(next);
    remember(next, null);
  };
  const chooseChild = (s: string) => {
    const next = s || null;
    setProblem(null);
    setChildId(next);
    remember(classId, next);
  };

  if (problem === 'failed') return <p role="alert" className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t('gn.failed')}</p>;
  if (!picker) return null;
  const children = picker.classId === classId ? picker.children : null;

  return (
    <div lang={lang} data-genome-view className="flex flex-col gap-4 text-sm text-slate">
      <section className={SECTION} data-genome-picker>
        <h2 className="text-base font-bold">{t('gn.pick.title')}</h2>
        <p className="text-slate/70">{t('gn.pick.self')}</p>
        {problem === 'not_found' && <p role="alert" data-genome-not-found className="rounded-md bg-off-white px-3 py-2">{t('gn.notFound')}</p>}
        {!picker.classes.length ? (
          <p className="rounded-md bg-off-white px-3 py-2" data-genome-no-classes>{t('gn.pick.noClasses')}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="genome-class" className="text-xs font-semibold">{t('gn.pick.class')}</label>
              <select id="genome-class" className={FIELD} value={classId ?? ''} onChange={(e) => chooseClass(e.target.value)}>
                <option value="">{t('gn.pick.classNone')}</option>
                {picker.classes.map((c) => (
                  <option key={c.classId} value={c.classId}>{c.name}</option>
                ))}
              </select>
            </div>
            {children && children.length > 0 && (
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor="genome-child" className="text-xs font-semibold">{t('gn.pick.child')}</label>
                <select id="genome-child" className={FIELD} value={childId ?? ''} onChange={(e) => chooseChild(e.target.value)}>
                  <option value="">{t('gn.pick.childNone')}</option>
                  {children.map((c) => (
                    <option key={c.studentId} value={c.studentId}>{c.rollNo ? t('ex.entry.child', { roll: c.rollNo, name: c.name }) : c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
        {children && children.length === 0 && <p className="rounded-md bg-off-white px-3 py-2" data-genome-no-children>{t('gn.pick.noChildren')}</p>}
      </section>
      {genome && genome.child.studentId === childId && <GenomeChild genome={genome} />}
    </div>
  );
}
