import { LANES, type CrossPath, type LaneId, type LateralRoute, type ParallelAction, type RoadLane, type RoadStep, type StreamSlug } from './types';

const GRADUATE = new Set(['ug', 'pg', 'phd']);

export function buildLanes(input: { steps: readonly RoadStep[]; actions: readonly ParallelAction[]; laterals: readonly LateralRoute[] }): RoadLane[] {
  return LANES.map((id) => ({
    id,
    steps: input.steps.filter((s) => s.lane === id).sort((a, b) => a.sort - b.sort),
    actions: input.actions.filter((a) => stageLane(a.stage) === id),
    laterals: id === 'years' ? [...input.laterals] : [],
  }));
}

function stageLane(stage: ParallelAction['stage']): LaneId {
  if (stage === 'during_10') return 'during_10';
  if (stage === 'during_12') return 'during_12';
  return 'bachelor';
}

export function crossesForCareer(streams: readonly StreamSlug[], minLevel: string, slug: string, crosses: readonly CrossPath[]): CrossPath[] {
  return crosses.filter((c) => c.toSlugs.includes(slug) || c.streams.some((s) => streams.includes(s)) || (c.anyGraduate && GRADUATE.has(minLevel)));
}

export function crossesForStream(stream: StreamSlug, crosses: readonly CrossPath[]): CrossPath[] {
  return crosses.filter((c) => c.streams.includes(stream));
}
