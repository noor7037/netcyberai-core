import { afterEach, describe, expect, it, vi } from 'vitest';
import { avatarMoment, avatarState, resetAvatar, setAvatarLevel, setAvatarMood, subscribeAvatar } from '@/lib/family/avatar-state';

// W19-A: the mood store every Family screen writes and the avatar reads.
afterEach(() => {
  resetAvatar();
  vi.useRealTimers();
});

describe('the avatar mood store', () => {
  it('starts idle, changes mood once per change, clamps the level and tells listeners', () => {
    const seen: string[] = [];
    const off = subscribeAvatar((s) => seen.push(`${s.mood}:${s.level}`));
    setAvatarMood('listening');
    setAvatarMood('listening');
    setAvatarLevel(2);
    setAvatarLevel(-1);
    setAvatarLevel(Number.NaN);
    setAvatarMood('thinking');
    expect(avatarState().level).toBe(0);
    expect(seen).toEqual(['listening:0', 'listening:1', 'listening:0', 'thinking:0']);
    off();
    setAvatarMood('speaking');
    expect(seen).toHaveLength(4);
  });

  it('a moment returns to the mood before it, unless the screen moved on', () => {
    vi.useFakeTimers();
    setAvatarMood('reading');
    avatarMoment('celebrating', 500);
    expect(avatarState().mood).toBe('celebrating');
    vi.advanceTimersByTime(500);
    expect(avatarState().mood).toBe('reading');
    avatarMoment('encouraging', 500);
    setAvatarMood('speaking');
    vi.advanceTimersByTime(500);
    expect(avatarState().mood).toBe('speaking');
  });
});
