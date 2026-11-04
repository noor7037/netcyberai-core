import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { avatarState, resetAvatar, setAvatarMood, type AvatarMood } from '@/lib/family/avatar-state';
import { FaceArt, TutorFace, lookOf, mouthPath } from '@/components/family/avatar/TutorFace';
import { cheer } from '@/components/family/blocks/QuizView';

// W19-A: the tutor's face, its moods, the quiz's moments and the voice that moves its mouth.
const MOODS: AvatarMood[] = ['idle', 'listening', 'thinking', 'speaking', 'reading', 'celebrating', 'encouraging', 'sleeping'];
const art = (mood: AvatarMood, level = 0, still = false) => renderToStaticMarkup(h(FaceArt, { mood, level, look: 'maths', still }));
const mouth = (html: string) => /data-mouth="[a-z]+" d="([^"]+)"/.exec(html)?.[1];

afterEach(() => {
  resetAvatar();
  vi.useRealTimers();
});

describe('TutorFace', () => {
  it('draws every mood, with the mouth named for it', () => {
    for (const m of MOODS) expect(art(m)).toContain(`data-mouth="${m}"`);
    expect(art('thinking').match(/tf-dot/g)).toHaveLength(3);
    expect(art('sleeping')).toContain('tf-z');
    expect(art('celebrating')).toContain('tf-bounce');
    expect(art('encouraging')).toContain('tf-nod');
    expect(art('reading')).toContain('tf-read');
    expect(art('idle')).toContain('tf-breathe');
  });

  it('the wrapper carries the mood, the size and the look, and names the tutor', () => {
    const html = renderToStaticMarkup(h(TutorFace, { size: 'lg', tutorKey: 'science', name: 'Science Tutor' }));
    expect(html).toContain('data-mood="idle"');
    expect(html).toContain('data-size="lg"');
    expect(html).toContain('data-tutor-face="science"');
    expect(html).toContain('aria-label="Science Tutor"');
    expect(renderToStaticMarkup(h(TutorFace, { size: 'sm' }))).toContain('aria-hidden="true"');
  });

  it('each platform tutor has its own look; a school tutor wears its subject; else the plain face', () => {
    expect(['maths', 'science', 'english', 'hindi', 'social_science', 'all_rounder'].map((k) => lookOf(k))).toEqual(['maths', 'science', 'english', 'hindi', 'social', 'plain']);
    expect(lookOf('school:x', 'physics')).toBe('science');
    expect(lookOf(null)).toBe('plain');
  });

  it('reduced motion removes every animation class and keeps the expression', () => {
    for (const m of MOODS) {
      const html = art(m, 0.8, true);
      expect(html).not.toMatch(/tf-(breathe|bounce|nod|read|dot|z)\b/);
      expect(html).toContain(`data-mouth="${m}"`);
    }
    expect(mouth(art('speaking', 0.1, true))).toBe(mouth(art('speaking', 0.9, true)));
  });

  it('the level opens the mouth while speaking', () => {
    expect(mouth(art('speaking', 0))).not.toBe(mouth(art('speaking', 0.9)));
    expect(mouthPath('speaking', 1)).not.toBe(mouthPath('speaking', 0));
    expect(mouthPath('idle', 1)).toBe(mouthPath('idle', 0));
  });

  it('encouraging never frowns: its mouth curves down in the middle, a smile', () => {
    const [, , y0, , cy] = /M(\d+) (\d+)Q(\d+) (\d+)/.exec(mouthPath('encouraging', 0))!.map(Number);
    expect(cy).toBeGreaterThan(y0);
  });
});

describe('quiz moments', () => {
  it('a right answer celebrates, a wrong one encourages, then back to the mood before', () => {
    vi.useFakeTimers();
    setAvatarMood('reading');
    cheer(true);
    expect(avatarState().mood).toBe('celebrating');
    vi.advanceTimersByTime(2000);
    expect(avatarState().mood).toBe('reading');
    cheer(false);
    expect(avatarState().mood).toBe('encouraging');
  });
});

describe('lineVoice drives the face', () => {
  it('server voice: speaking with a measured level while it plays, reading when it ends', async () => {
    const g = globalThis as Record<string, unknown>;
    const audios: { onended: (() => void) | null }[] = [];
    class FakeAudio {
      playbackRate = 1;
      paused = true;
      currentTime = 0;
      duration = 1;
      onplaying: (() => void) | null = null;
      onended: (() => void) | null = null;
      constructor() {
        audios.push(this);
      }
      play() {
        this.paused = false;
        queueMicrotask(() => this.onplaying?.());
        return Promise.resolve();
      }
      pause() {
        this.paused = true;
      }
      removeAttribute() {}
    }
    const source = { connect: vi.fn() };
    const analyser = { fftSize: 0, connect: vi.fn(), getByteTimeDomainData: (b: Uint8Array) => b.forEach((_, i) => (b[i] = i % 2 ? 200 : 56)) };
    class FakeContext {
      state = 'suspended';
      destination = {};
      createAnalyser = () => analyser;
      createMediaElementSource = vi.fn(() => source);
      resume = async () => {
        this.state = 'running';
      };
    }
    g.window = globalThis;
    g.AudioContext = FakeContext;
    g.Audio = FakeAudio;
    g.requestAnimationFrame = (f: () => void) => setTimeout(f, 5) as unknown as number;
    g.cancelAnimationFrame = (id: number) => clearTimeout(id);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue();
    g.fetch = vi.fn(async () => new Response(new Blob(['x']), { headers: { 'content-type': 'audio/mpeg' } }));

    const { speakLine } = await import('@/components/family/voice/lineVoice');
    const done = speakLine('server', { kind: 'tutor_answer', messageId: 'm1' }, { text: 'Hello', lang: 'en', rate: 1 });
    await vi.waitFor(() => expect(avatarState().mood).toBe('speaking'));
    await vi.waitFor(() => expect(avatarState().level).toBeGreaterThan(0.3));
    expect(source.connect).toHaveBeenCalledWith(analyser);
    audios[0].onended?.();
    await expect(done).resolves.toEqual({ cancelled: false, mode: 'server' });
    expect(avatarState().mood).toBe('reading');
    expect(avatarState().level).toBe(0);
  });
});
