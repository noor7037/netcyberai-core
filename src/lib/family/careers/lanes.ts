import { LANES, type CrossPath, type LaneId, type LateralRoute, type ParallelAction, type RoadLane, type RoadStep, type StreamSlug } from './types';

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

// A switch belongs on a career only when it lands on this career, or it starts from one of this career's
// streams and lands on another career in the same field. A shared stream, or any degree, is not enough.
export function crossesForCareer(
  career: { slug: string; fieldId: string; streams: readonly StreamSlug[] },
  crosses: readonly CrossPath[],
  fieldOf: (slug: string) => string | undefined,
): CrossPath[] {
  return crosses.filter((c) => {
    if (c.toSlugs.includes(career.slug)) return true;
    const streamFits = c.streams.some((s) => career.streams.includes(s));
    if (!streamFits) return false;
    return c.toSlugs.some((slug) => fieldOf(slug) === career.fieldId);
  });
}

export function crossesForStream(stream: StreamSlug, crosses: readonly CrossPath[]): CrossPath[] {
  return crosses.filter((c) => c.streams.includes(stream));
}
