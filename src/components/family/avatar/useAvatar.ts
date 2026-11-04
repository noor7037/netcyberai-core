'use client';

import { useSyncExternalStore } from 'react';
import { avatarState, subscribeAvatar, type AvatarState } from '@/lib/family/avatar-state';

const SERVER: AvatarState = { mood: 'idle', level: 0, since: 0 };

// The avatar's mood and level as React state (W19-A). Any component may read it; the screens write it through
// setAvatarMood / setAvatarLevel / avatarMoment in '@/lib/family/avatar-state'.
export function useAvatar(): AvatarState {
  return useSyncExternalStore(subscribeAvatar, avatarState, () => SERVER);
}
