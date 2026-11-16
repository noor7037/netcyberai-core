import { describe, expect, it } from 'vitest';
import { rankVideos } from '@/lib/family/videos';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

const OFFICIAL = 'UCofficial0000000000001';
const cand = (id: string, title: string, durationS: number) => ({ videoId: id, channelId: OFFICIAL, channelTitle: 'Official', title, durationS, embeddable: true, isPublic: true, ageRestricted: false, hasPaidPlacement: false, captions: true, madeForKids: false, language: 'hi', viewCount: 100000, likeCount: 2000, publishedAt: '2024-01-01T00:00:00Z', chapters: [] }) as never;
const channels = [{ channelId: OFFICIAL, title: 'Official', kind: 'official' as const, noAds: false }];

describe('video card and choice (v21)', () => {
  it('a focused video of a few minutes ranks above a 56-minute chapter lecture', () => {
    const got = rankVideos([cand('lecture00001', 'Energy full chapter lecture', 56 * 60), cand('focused0001', 'Energy explained', 8 * 60)], { topicTitles: ['energy'], language: 'hi', channels });
    expect(got.map((g) => g.video_id)[0]).toBe('focused0001');
  });
  it('the long lecture is still shown when it is the only one', () => {
    const got = rankVideos([cand('lecture00001', 'Energy full chapter lecture', 40 * 60)], { topicTitles: ['energy'], language: 'hi', channels });
    expect(got.length).toBe(1);
  });
  it('the note says only YouTube, ads and suggestions, in English and Hindi', () => {
    const m = (x: Record<string, string>) => x['fam.video.note'];
    expect(m(en as never)).not.toMatch(/Nothing from YouTube loads/);
    expect(m(hi as never)).not.toContain('लोड नहीं होता');
    expect(m(hi as never)).toContain('YouTube');
  });
});

import { chainShareMs, CHAIN_MIN_MS, PROFILES } from '@/lib/ai/platform';
import { quizPrompt } from '@/lib/ai/prompts/family.quiz';

describe('the quiz route (v21)', () => {
  const quiz = PROFILES.find((p) => p.id === 'family.quiz')!;
  it('the primary is watched for its first text, and the backup keeps a real slot of the route time', () => {
    expect(quiz.firstTextMs).toBeGreaterThan(0);
    expect(quiz.callMs!).toBeGreaterThanOrEqual(2 * CHAIN_MIN_MS);
    const primary = chainShareMs({ left: quiz.callMs!, behind: 1, reserveMs: CHAIN_MIN_MS, firstTextMs: quiz.firstTextMs!, streams: true });
    expect(quiz.callMs! - Math.min(primary, quiz.firstTextMs!)).toBeGreaterThanOrEqual(CHAIN_MIN_MS);
  });
  it('the shorter quiz prompt (v2) is the latest, so an unknown Control version falls back to it', () => {
    expect(quizPrompt('v10').version).toBe('v2');
    expect(quizPrompt('v1').version).toBe('v1');
    expect(quizPrompt('v2').system()).toContain('twelve words');
  });
});
