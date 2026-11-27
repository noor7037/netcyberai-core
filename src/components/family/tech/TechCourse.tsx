'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { classWord, tw } from '@/lib/family/tech/words';
import { mergeProgress, readLocalProgress } from '@/lib/family/tech/local-progress';
import { levelOfClass } from '@/lib/family/tech/score';
import { pick, TECH_LANGS, type TechLang } from '@/lib/family/tech/text';
import { MILESTONE_BADGES, unitBadges } from '@/lib/family/tech/badges';
import { childPath, type PathStep } from '@/lib/family/tech/personal';
import type { CourseCatalog, TechProgress } from '@/lib/family/tech/types';

const CLASSES = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const STRAND_BG: Record<string, string> = { hw: '#A9D6F5', elec: '#FFE7A3', os: '#D9CCF6', sw: '#B8E6CF', prog: '#FFB4A2', web: '#A9D6F5', net: '#B8E6CF', cloud: '#E3EEF9', data: '#FFE7A3', cyber: '#FBE6E3', robo: '#D9CCF6', ai: '#EFE9FB', ds: '#E4F3EA', cit: '#FBF1D3', career: '#FFE7A3' };

function Ring({ done, total, colour }: { done: number; total: number; colour: string }) {
  const share = total ? done / total : 0;
  const sweep = 2 * Math.PI * 16;
  return (
    <svg className="tl-ring" width="44" height="44" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="16" fill="none" stroke="#E7E1D6" strokeWidth="5" />
      <circle cx="20" cy="20" r="16" fill="none" stroke={colour} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${share * sweep} ${sweep}`} transform="rotate(-90 20 20)" />
      <text x="20" y="24" textAnchor="middle" fontSize="11" fontWeight="800" fill="#1C1B1A">{`${done}/${total}`}</text>
    </svg>
  );
}

// One child's course (C555): their name, their own class (exploring another class never changes it), their progress,
// and what to do next. `childId` keeps this phone's stars for this child only.
export function TechCourse({ catalog, progress, classLevel, initialLang, view, childId, name }: { catalog: CourseCatalog; progress: TechProgress; classLevel: number; initialLang: TechLang; view: number | null; childId: string; name: string }) {
  const [lang, setLang] = useState<TechLang>(initialLang);
  const [cls, setCls] = useState(view != null && CLASSES.includes(view) ? view : classLevel);
  const [strand, setStrand] = useState('all');
  const [exploring, setExploring] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [local, setLocal] = useState<TechProgress | null>(null);
  useEffect(() => setLocal(readLocalProgress(childId)), [childId]);
  const state = useMemo(() => mergeProgress(progress, local), [progress, local]);
  const path = useMemo(() => childPath(catalog, classLevel, state), [catalog, classLevel, state]);
  const lessonHref = (key: string) => `/family/tech/lesson/${key}?lang=${lang}`;
  const pathRow = (item: PathStep, label: string) => (
    <Link key={item.key} className="tl-lesson tl-press ready" href={lessonHref(item.key)} data-path={item.why}>
      <span className="tl-num" aria-hidden="true">{item.why === 'revise' ? '🔁' : item.why === 'stretch' ? '🚀' : '▶'}</span>
      <span className="tl-lesson-copy">
        <span className="tl-lt">{pick(lang, item.title)}</span>
        <span className="tl-ls">{`${label} · ${pick(lang, item.unit)}`}</span>
      </span>
      <span className="tl-go">{tw(lang, 'goLesson')}</span>
    </Link>
  );
  const level = levelOfClass(Math.max(1, cls));
  const inLevel = catalog.units.filter((unit) => unit.level === level);
  const show = (unit: (typeof inLevel)[number]) => strand === 'all' || unit.strand === strand;
  const classKey = cls <= 0 && inLevel.some((unit) => unit.classes.includes(cls)) ? cls : Math.max(1, cls);
  const mine = inLevel.filter((unit) => unit.classes.includes(classKey) && show(unit));
  const others = inLevel.filter((unit) => !unit.classes.includes(classKey) && show(unit));
  const opened = open ?? mine[0]?.id ?? null;
  const strandsHere = [...new Set(inLevel.map((unit) => unit.strand))];
  const labs = catalog.labs.filter((lab) => lab.level === `L${level}`);
  const badges = [...MILESTONE_BADGES, ...unitBadges(catalog).filter((badge) => badge.id.startsWith(`unit:L${level}.`) || state.badges.includes(badge.id))];

  const unitCard = (unit: (typeof inLevel)[number]) => {
    const info = catalog.strands[unit.strand] || { e: '✨', en: '' };
    const done = unit.lessons.filter((lesson) => state.done[lesson.key]).length;
    const colour = unit.level === 1 ? '#F5B90A' : unit.level === 2 ? '#0F766E' : '#6D28D9';
    const isOpen = opened === unit.id;
    const range = unit.classes.length ? `${unit.classes[0] <= 0 ? classWord(lang, unit.classes[0]) : unit.classes[0]}–${unit.classes[unit.classes.length - 1]}` : '';
    return (
      <article key={unit.id} className="tl-card tl-unit" data-unit={unit.id}>
        <button type="button" className="tl-press" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : unit.id)}>
          <span className="tl-ico" style={{ background: STRAND_BG[unit.strand] || '#E3EEF9' }}>{info.e}</span>
          <span className="tl-unit-copy">
            <span className="tl-pill">{pick(lang, info)}</span>
            <h3>{pick(lang, unit.title)}</h3>
            <span className="tl-meta">{`${unit.lessons.length} ${tw(lang, 'lessons')} · ${tw(lang, 'classes')} ${range}`}</span>
          </span>
          <Ring done={done} total={unit.lessons.length} colour={colour} />
        </button>
        {isOpen && (
          <ul className="tl-lessons">
            {unit.lessons.map((lesson, index) => {
              const row = state.done[lesson.key];
              return (
                <li key={lesson.key}>
                  <Link className={`tl-lesson tl-press ${row ? 'done' : 'ready'}`} href={`/family/tech/lesson/${lesson.key}?view=${cls}&lang=${lang}`}>
                    <span className="tl-num">{row ? '⭐' : index + 1}</span>
                    <span className="tl-lesson-copy">
                      <span className="tl-lt">{pick(lang, lesson.title)}</span>
                      <span className="tl-ls">{`${lesson.minutes} min · ${lesson.xp} XP`}</span>
                    </span>
                    <span className="tl-go">{row ? tw(lang, 'again') : tw(lang, 'start')}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </article>
    );
  };

  return (
    <div className="tl" lang={lang === 'hi' ? 'hi' : 'en'}>
      <header className={`tl-band l${level}${level === 1 ? '' : ' on-dark'}`}>
        <span className="tl-grid" aria-hidden="true" />
        <div className="tl-wrap tl-band-row">
          <div className="tl-title-row">
            <span className="tl-kicker">{tw(lang, 'kicker')}</span>
            <span className="tl-xp">⚡ <b>{tw(lang, 'xpNow', { n: state.xp })}</b></span>
          </div>
          <h1>{name ? tw(lang, 'pathTitle', { name }) : tw(lang, 'kicker')}</h1>
          <p className="tl-band-sub">{tw(lang, 'hello')}</p>
          <div className="tl-seg" role="group" aria-label={tw(lang, 'language')}>
            {TECH_LANGS.map((item) => (
              <button key={item.id} type="button" aria-pressed={lang === item.id} lang={item.id === 'hi' ? 'hi' : undefined} onClick={() => setLang(item.id)}>{item.label}</button>
            ))}
          </div>
        </div>
      </header>
      <main className="tl-wrap tl-main">
        <section className="tl-card tl-pad tl-path" data-path-for={classLevel}>
          <div className="tl-class-row">
            <h2>{tw(lang, 'upNext')}</h2>
            <span className="tl-pill tl-pill-ink">{tw(lang, 'pathDone', { c: classWord(lang, classLevel), d: path.done, t: path.total })}</span>
          </div>
          <ul className="tl-lessons">
            {path.next && <li>{pathRow(path.next, tw(lang, path.next.why === 'continue' ? 'whyContinue' : 'whyStart'))}</li>}
            {!path.next && path.stretch && <li><p className="tl-quiet">{tw(lang, 'whyStretch')}</p>{pathRow(path.stretch, classWord(lang, Math.max(1, classLevel) + 1))}</li>}
            {!path.next && !path.stretch && <li><p className="tl-quiet">{tw(lang, 'allDone')}</p></li>}
            {path.revise.map((item) => <li key={item.key}>{pathRow(item, tw(lang, 'revise'))}</li>)}
          </ul>
        </section>
        <section className="tl-card tl-pad">
          <div className="tl-class-row">
            <h2>{tw(lang, 'yourClass')}</h2>
            <span className="tl-pill tl-pill-ink">{classWord(lang, cls)}{cls !== classLevel ? ' · ↺' : ''}</span>
            <button type="button" className="tl-chip tl-press" aria-expanded={exploring} onClick={() => setExploring((value) => !value)}>{tw(lang, 'explore')}</button>
          </div>
          {exploring && (
            <div className="tl-chips" role="group" aria-label={tw(lang, 'yourClass')}>
              {CLASSES.map((item) => (
                <button key={item} type="button" className="tl-chip tl-press" aria-pressed={item === cls} onClick={() => { setCls(item); setStrand('all'); setOpen(null); }}>{item <= 0 ? classWord(lang, item) : String(item)}{item === classLevel ? ' •' : ''}</button>
              ))}
            </div>
          )}
          {cls !== classLevel && (
            <p className="tl-note">
              {tw(lang, 'exploring')}{' '}
              <button type="button" className="tl-chip tl-press" onClick={() => { setCls(classLevel); setStrand('all'); setOpen(null); setExploring(false); }}>{tw(lang, 'backToMine')}</button>
            </p>
          )}
          {cls <= 0 && <p className="tl-note">{tw(lang, 'preview')}</p>}
        </section>
        <section className="tl-levels" aria-label={tw(lang, 'level')}>
          {catalog.levels.map((item) => {
            const units = catalog.units.filter((unit) => unit.level === item.level);
            const all = units.flatMap((unit) => unit.lessons);
            const done = all.filter((lesson) => state.done[lesson.key]).length;
            return (
              <button key={item.level} type="button" className={`tl-lvl l${item.level} tl-press`} aria-current={item.level === level} onClick={() => { if (item.level !== level) { setCls(item.classes[0] ?? item.level * 3); setStrand('all'); setOpen(null); } }}>
                <span className="tl-lvl-n">{item.level}</span>
                <span className="tl-lvl-t">{pick(lang, item.title)}</span>
                <span className="tl-lvl-c">{`${tw(lang, 'classes')} ${item.classes[0]}–${item.classes[item.classes.length - 1]} · ${all.length} ${tw(lang, 'lessons')}`}</span>
                <span className="tl-bar"><i style={{ transform: `scaleX(${all.length ? done / all.length : 0})` }} /></span>
              </button>
            );
          })}
        </section>
        <section className="tl-stack-gap">
          <div className="tl-chips" role="group">
            <button type="button" className="tl-chip tl-press" aria-pressed={strand === 'all'} onClick={() => { setStrand('all'); setOpen(null); }}>{tw(lang, 'all')}</button>
            {strandsHere.map((id) => (
              <button key={id} type="button" className="tl-chip tl-press" aria-pressed={strand === id} onClick={() => { setStrand(id); setOpen(null); }}>{`${catalog.strands[id]?.e ?? ''} ${pick(lang, catalog.strands[id] ?? '')}`}</button>
            ))}
          </div>
          <h2>{`${tw(lang, 'forYou')} · ${classWord(lang, cls)}`}</h2>
          <div className="tl-units">{mine.map(unitCard)}</div>
          {others.length > 0 && (
            <details className="tl-card tl-more">
              <summary>{`${tw(lang, 'alsoLevel')} (${others.length})`}</summary>
              <div className="tl-units">{others.map(unitCard)}</div>
            </details>
          )}
        </section>
        {labs.length > 0 && (
          <section className="tl-stack-gap">
            <h2>{tw(lang, 'labs')}</h2>
            <div className="tl-lab-grid">
              {labs.map((lab) => (
                <a key={lab.id} className="tl-card tl-press tl-lab-card" href={`/family/tech/labs/${lab.level}/${lab.id}.html?lang=${lang}&embed=1`}>
                  <span aria-hidden="true">🧪</span>
                  <b>{lab.id.replace(/-/g, ' ')}</b>
                  <span className="tl-pill">{lab.level}</span>
                </a>
              ))}
            </div>
          </section>
        )}
        <section className="tl-stack-gap">
          <h2>{tw(lang, 'badges')}</h2>
          <div className="tl-badges">
            {badges.map((badge) => (
              <div key={badge.id} className={`tl-badge${state.badges.includes(badge.id) ? '' : ' locked'}`}>
                <span className="tl-badge-disc">{badge.emoji}</span>
                <span>{pick(lang, badge.name)}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
