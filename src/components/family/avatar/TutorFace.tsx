'use client';

import { useEffect, useId, useState } from 'react';
import { lessonColors as C, lessonTints as T } from '@/lib/design-tokens';
import { avatarState, setAvatarMood, type AvatarMood } from '@/lib/family/avatar-state';
import { useAvatar } from './useAvatar';
import { Confetti } from './Confetti';
import './tutor-face.css';
import { readChildSettings } from '@/lib/family/child-settings';

// The tutor's face (W19-A): a rounded character drawn here in SVG (no stock art), lit by gradients and a soft shadow, that
// reacts to the mood store (avatar-state.ts): it breathes and blinks, leans in to listen, looks up to think, moves its
// mouth with the voice, reads along, celebrates with confetti, encourages with a nod (never a frown), and sleeps while
// the tab is hidden. Each platform tutor wears its subject's tint and one accessory. Motion is CSS transforms only;
// under prefers-reduced-motion nothing moves and a mood is a still expression.

export type FaceSize = 'sm' | 'md' | 'xl' | 'lg';
type Gear = 'glasses' | 'pencil' | 'book' | 'flower' | 'globe' | 'spark';
type Look = { body: string; tint: string; gear: Gear };

const LOOKS: Record<string, Look> = {
  maths: { body: T.sky.accent, tint: T.sky.tint, gear: 'pencil' },
  science: { body: T.mint.accent, tint: T.mint.tint, gear: 'glasses' },
  english: { body: T.blush.accent, tint: T.blush.tint, gear: 'book' },
  hindi: { body: T.butter.accent, tint: T.butter.tint, gear: 'flower' },
  social: { body: T.lilac.accent, tint: T.sky.tint, gear: 'globe' },
  plain: { body: C.plum, tint: T.lilac.tint, gear: 'spark' },
};
const BY_SUBJECT: Record<string, string> = { mathematics: 'maths', science: 'science', physics: 'science', chemistry: 'science', biology: 'science', evs: 'science', english: 'english', hindi: 'hindi', social_science: 'social', history: 'social', geography: 'social', political_science: 'social', economics: 'social' };
const BY_KEY: Record<string, string> = { maths: 'maths', science: 'science', english: 'english', hindi: 'hindi', social_science: 'social', social: 'social' };

export const lookOf = (tutorKey?: string | null, subject?: string | null): string => BY_KEY[tutorKey ?? ''] ?? BY_SUBJECT[subject ?? ''] ?? 'plain';

const PX: Record<FaceSize, string> = { sm: 'h-10 w-10', xl: 'h-16 w-16', md: 'h-24 w-24', lg: 'h-[200px] w-[200px]' };

// The mouth for a mood; when speaking, `open` (0 to 1) opens it.
export function mouthPath(mood: AvatarMood, open: number): string {
  const o = Math.min(1, Math.max(0, open));
  if (mood === 'speaking') {
    const w = 9 - o * 2;
    return `M${60 - w} 79Q60 ${77 - o * 2} ${60 + w} 79Q60 ${81 + o * 13} ${60 - w} 79Z`;
  }
  if (mood === 'celebrating') return 'M48 76Q60 77 72 76Q70 92 60 92Q50 92 48 76Z';
  if (mood === 'encouraging') return 'M47 77Q60 89 73 77';
  if (mood === 'thinking') return 'M54 81Q60 83 66 79';
  if (mood === 'sleeping') return 'M57 81Q60 85 63 81Q60 79 57 81Z';
  return 'M50 78Q60 86 70 78';
}

const filled = (m: AvatarMood) => m === 'speaking' || m === 'celebrating' || m === 'sleeping';

const GAZE: Partial<Record<AvatarMood, [number, number]>> = { thinking: [-4, -5], listening: [3, 0], sleeping: [0, 2] };

function Gear({ gear }: { gear: Gear }) {
  if (gear === 'glasses')
    return (
      <g fill={C.card} fillOpacity=".2" stroke={C.ink} strokeWidth="2.4">
        <circle cx="47" cy="64" r="10" />
        <circle cx="73" cy="64" r="10" />
        <path d="M57 63q3-3 6 0M37 62l-9-3M83 62l9-3" fill="none" />
      </g>
    );
  if (gear === 'pencil')
    return (
      <g transform="translate(88 14) rotate(32)">
        <rect width="8" height="28" rx="2" fill={C.saffron} />
        <rect width="8" height="5" rx="2" fill={T.blush.accent} />
        <path d="M0 28h8l-4 9z" fill={C.card} />
        <path d="M2.7 34h2.6L4 37z" fill={C.ink} />
      </g>
    );
  if (gear === 'book')
    return (
      <g transform="translate(80 86) rotate(-12)">
        <path d="M0 2q8-3 16 1v18q-8-4-16-1z" fill={C.card} stroke={T.blush.accent} strokeWidth="1.6" />
        <path d="M16 3q8-4 16-1v18q-8-3-16 1z" fill={C.card} stroke={T.blush.accent} strokeWidth="1.6" />
        <path d="M4 8h8M4 12h8M20 8h8M20 12h8" stroke={C.line} strokeWidth="1.4" />
      </g>
    );
  if (gear === 'flower')
    return (
      <g transform="translate(28 30)" fill={C.saffron}>
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <circle key={a} cx={Math.cos((a * Math.PI) / 180) * 6} cy={Math.sin((a * Math.PI) / 180) * 6} r="4.6" />
        ))}
        <circle r="4" fill={C.saffronDeep} />
      </g>
    );
  if (gear === 'globe')
    return (
      <g transform="translate(96 96)">
        <circle r="11" fill={T.sky.accent} />
        <path d="M-8-4q5-4 8 1t7-1M-6 6q4-2 7 1" stroke={T.mint.tint} strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M-13 3a13 13 0 0 0 22 8" stroke={C.ink} strokeWidth="2" fill="none" />
      </g>
    );
  return <path d="M98 10l2.6 7 7 2.6-7 2.6-2.6 7-2.6-7-7-2.6 7-2.6z" fill={C.saffron} />;
}

export type FaceArtProps = { mood: AvatarMood; level: number; look: string; still: boolean; blink?: boolean; glance?: number; uid?: string };

// The drawing for one state; pure, so a test can render every mood.
export function FaceArt({ mood, level, look, still, blink = false, glance = 0, uid = 'tf' }: FaceArtProps) {
  const L = LOOKS[look] ?? LOOKS.plain;
  const id = (s: string) => `${uid}${s}`;
  const a = (cls: string) => (still ? undefined : cls);
  const open = mood === 'speaking' ? (still ? 0.35 : level) : 0;
  const [gx, gy] = GAZE[mood] ?? [mood === 'idle' ? glance : 0, 0];
  const lean = mood === 'listening' ? 'rotate(6deg) translateX(3px)' : mood === 'sleeping' ? 'rotate(-7deg) translateY(3px)' : mood === 'speaking' ? `translateY(${-open * 2}px)` : 'none';
  const brow = mood === 'speaking' ? (open > 0.5 ? -3 : 0) : mood === 'celebrating' ? -4 : mood === 'encouraging' || mood === 'listening' ? -2 : mood === 'sleeping' ? 2 : 0;
  const shut = mood === 'sleeping' || mood === 'celebrating';
  const d = mouthPath(mood, open);
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full overflow-visible" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={id('h')} cx=".35" cy=".3" r=".8">
          <stop offset="0" stopColor={L.tint} stopOpacity=".55" />
          <stop offset=".45" stopColor={L.body} stopOpacity="0" />
          <stop offset="1" stopColor={C.ink} stopOpacity=".35" />
        </radialGradient>
        <radialGradient id={id('f')} cx=".45" cy=".35" r=".75">
          <stop offset="0" stopColor={C.card} />
          <stop offset="1" stopColor={L.tint} />
        </radialGradient>
        <filter id={id('s')} x="-0.2" y="-0.2" width="1.4" height="1.5">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor={C.ink} floodOpacity=".25" />
        </filter>
      </defs>
      <ellipse cx="60" cy="112" rx="30" ry="4.5" fill={C.ink} opacity=".14" />
      <g className={a(`tf-breathe${mood === 'sleeping' ? ' tf-slow' : ''}`)}>
        <g className="tf-body" style={{ transform: lean }}>
          <g className={a(mood === 'celebrating' ? 'tf-bounce' : mood === 'encouraging' ? 'tf-nod' : '')}>
            {mood === 'listening' && <circle className="tf-aura" cx="60" cy="62" r="52" fill="none" stroke={L.body} strokeWidth={3 + level * 6} opacity={0.25 + level * 0.6} />}
            <g filter={`url(#${id('s')})`}>
              <circle cx="17" cy="64" r="8" fill={L.body} />
              <circle cx="103" cy="64" r="8" fill={L.body} stroke={mood === 'listening' ? L.tint : 'none'} strokeWidth="3" />
              <circle cx="60" cy="60" r="44" fill={L.body} />
              <circle cx="60" cy="60" r="44" fill={`url(#${id('h')})`} />
            </g>
            <ellipse cx="60" cy="69" rx="33" ry="28" fill={`url(#${id('f')})`} />
            <ellipse cx="44" cy="32" rx="12" ry="6" fill={C.card} opacity=".35" transform="rotate(-25 44 32)" />
            <circle cx="38" cy="77" r="5" fill={T.blush.accent} opacity={mood === 'celebrating' ? 0.35 : 0.2} />
            <circle cx="82" cy="77" r="5" fill={T.blush.accent} opacity={mood === 'celebrating' ? 0.35 : 0.2} />
            <g className="tf-brows" style={{ transform: `translateY(${brow}px)` }} stroke={C.ink} strokeWidth="2.6" strokeLinecap="round" fill="none">
              <path d={mood === 'thinking' ? 'M41 50q6-6 12-2' : 'M41 53q6-4 12 0'} />
              <path d="M67 53q6-4 12 0" />
            </g>
            <g className="tf-eyes" style={{ transform: `translate(${gx}px,${gy}px)` }}>
              {shut ? (
                <path d={mood === 'sleeping' ? 'M41 64q6 4 12 0M67 64q6 4 12 0' : 'M41 66q6-7 12 0M67 66q6-7 12 0'} stroke={C.ink} strokeWidth="3" strokeLinecap="round" fill="none" />
              ) : (
                <g className={a(mood === 'reading' ? 'tf-read' : '')}>
                  <g className="tf-lids" style={{ transform: `scaleY(${blink ? 0.1 : mood === 'encouraging' ? 0.85 : 1})` }}>
                    <ellipse cx="47" cy="64" rx="5.5" ry="7" fill={C.ink} />
                    <ellipse cx="73" cy="64" rx="5.5" ry="7" fill={C.ink} />
                    <circle cx="49" cy="61" r="2" fill={C.card} />
                    <circle cx="75" cy="61" r="2" fill={C.card} />
                  </g>
                </g>
              )}
            </g>
            <path data-mouth={mood} d={d} fill={filled(mood) ? C.ink : 'none'} stroke={C.ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            {(mood === 'celebrating' || open > 0.4) && <ellipse cx="60" cy={mood === 'celebrating' ? 87 : 81 + open * 9} rx="5" ry="2.5" fill={T.blush.accent} />}
            <Gear gear={L.gear} />
          </g>
        </g>
      </g>
      {mood === 'thinking' && (
        <g fill={L.body}>
          {[0, 1, 2].map((i) => (
            <circle key={i} className={a('tf-dot')} style={still ? undefined : { animationDelay: `${i * 0.2}s` }} cx={88 + i * 9} cy="12" r="3.5" />
          ))}
        </g>
      )}
      {mood === 'sleeping' && (
        <g stroke={L.body} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {[0, 1].map((i) => (
            <path key={i} className={a('tf-z')} style={still ? undefined : { animationDelay: `${i * 1.5}s` }} d={`M${92 + i * 8} ${22 - i * 10}h${7 - i}l-${7 - i} ${7 - i}h${7 - i}`} />
          ))}
        </g>
      )}
    </svg>
  );
}

function useStill(): boolean {
  const [still, setStill] = useState(false);
  useEffect(() => {
    const q = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (!q) return;
    const on = () => setStill(q.matches);
    on();
    q.addEventListener?.('change', on);
    return () => q.removeEventListener?.('change', on);
  }, []);
  return still;
}

export function TutorFace({ size = 'md', tutorKey = null, subject = null, name, className = '', confetti = size !== 'sm' }: { size?: FaceSize; tutorKey?: string | null; subject?: string | null; name?: string; className?: string; confetti?: boolean }) {
  const { mood, level, since } = useAvatar();
  const still = useStill();
  const uid = useId().replace(/:/g, '');
  const [blink, setBlink] = useState(false);
  const [glance, setGlance] = useState(0);
  // W19-C: the child's own switch "The tutor's face" off hides it everywhere.
  const [shown, setShown] = useState(true);
  useEffect(() => {
    let live = true;
    void readChildSettings().then((s) => {
      if (live) setShown(s.tutorFace);
    });
    return () => {
      live = false;
    };
  }, []);

  // Blinks every 3 to 6 s, and now and then a glance to one side.
  useEffect(() => {
    if (still) return;
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      t = setTimeout(() => {
        setBlink(true);
        if (Math.random() < 0.3) setGlance(Math.random() < 0.5 ? -3 : 3);
        t = setTimeout(() => {
          setBlink(false);
          t = setTimeout(() => setGlance(0), 700);
          next();
        }, 130);
      }, 3000 + Math.random() * 3000);
    };
    next();
    return () => clearTimeout(t);
  }, [still]);

  // A hidden tab puts the tutor to sleep; back on the tab, it wakes.
  useEffect(() => {
    const seen = () => {
      if (document.hidden) setAvatarMood('sleeping');
      else if (avatarState().mood === 'sleeping') setAvatarMood('idle');
    };
    document.addEventListener('visibilitychange', seen);
    return () => document.removeEventListener('visibilitychange', seen);
  }, []);

  if (!shown) return null;
  return (
    <span role={name ? 'img' : undefined} aria-label={name} aria-hidden={name ? undefined : true} data-tutor-face={lookOf(tutorKey, subject)} data-mood={mood} data-size={size} className={`relative inline-block shrink-0 ${PX[size]} ${className}`}>
      <FaceArt mood={mood} level={level} look={lookOf(tutorKey, subject)} still={still} blink={blink} glance={glance} uid={uid} />
      {mood === 'celebrating' && !still && confetti && <Confetti key={since} />}
    </span>
  );
}

// W22-S3: the tutor's face kept on screen while it answers or reads. W23-A: a 64 px face, and the reading controls in the
// same strip (Play or Pause, and the percent read), so they never scroll away. A solid strip stuck to the top of the
// scrolling area (the feed, or the page) for as long as the answer that owns it is being made or read; it takes its own
// height of the answer's column and never floats over text or controls: text scrolls under its solid background.
// Nothing animates here beyond the face (which stills itself under prefers-reduced-motion).
export function StickyTutorFace({ tutorKey = null, subject = null, label, percent, speaking = false, onToggle, toggleLabel }: { tutorKey?: string | null; subject?: string | null; label: string; percent?: number; speaking?: boolean; onToggle?: () => void; toggleLabel?: string }) {
  return (
    <div data-sticky-face className="sticky top-0 z-10 flex min-h-[72px] items-center gap-3 rounded-2xl bg-white px-2 py-1 text-sm font-bold text-ink ring-1 ring-ink/10">
      <TutorFace size="xl" tutorKey={tutorKey} subject={subject} confetti={false} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {percent !== undefined && percent > 0 && (
        <span data-sticky-percent className="shrink-0 text-sm font-bold tabular-nums text-ink">
          {percent}%
        </span>
      )}
      {onToggle && (
        <button type="button" data-sticky-toggle aria-pressed={speaking} aria-label={toggleLabel} onClick={onToggle} className="fam-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-grape-deep text-white">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            {speaking ? (
              <>
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </>
            ) : (
              <path d="M7 5v14l12-7z" />
            )}
          </svg>
        </button>
      )}
    </div>
  );
}
