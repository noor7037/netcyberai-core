import type { LaneId, StreamSlug } from './types';
import { STREAMS } from './types';

// The child's class decides the next decision. Science is stored as one stream, so both PCM and PCB stay open.
// No state is read: the same class sees the same next step in every state.

export type SchoolStream = 'science' | 'commerce' | 'humanities';

export type OpensNow = {
  kind: 'plan_ahead' | 'stream_choice' | 'entrance';
  streams: StreamSlug[];
  openLane: LaneId;
};

export function opensNow(classLevel: number, stream: SchoolStream | null): OpensNow {
  if (classLevel <= 8) return { kind: 'plan_ahead', streams: [...STREAMS], openLane: 'during_10' };
  if (classLevel <= 10) return { kind: 'stream_choice', streams: [...STREAMS], openLane: 'after_10' };
  if (stream === 'commerce') return { kind: 'entrance', streams: ['commerce'], openLane: 'entrance' };
  if (stream === 'humanities') return { kind: 'entrance', streams: ['arts'], openLane: 'entrance' };
  if (stream === 'science') return { kind: 'entrance', streams: ['science-pcm', 'science-pcb'], openLane: 'entrance' };
  return { kind: 'entrance', streams: [...STREAMS], openLane: 'entrance' };
}
