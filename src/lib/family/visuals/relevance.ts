import { words } from '@/lib/family/videos';

// The relevance check for a step's photograph (v21; a moth was shown for "energy"). A picture is kept only when its
// title, tags or description share meaning words with the search words (the quality gate of the video finder,
// videos.ts: normalised words, a plural or longer form matching), with a small list of near-meanings, so "energy doing
// work" never takes a moth and does take "Kinetic energy diagram". The search words are English (the tutor gives the
// English topic and step queries), so this is the same in every input language. Nothing matching is no picture.

const EXTRA_STOP = new Set([
  'doing', 'does', 'done', 'make', 'makes', 'made', 'use', 'used', 'uses', 'using', 'type', 'types', 'everyday', 'activity', 'example',
  'examples', 'picture', 'pictures', 'photo', 'photos', 'image', 'images', 'diagram', 'diagrams', 'file', 'jpg', 'jpeg', 'png', 'svg', 'gif',
  'tif', 'tiff', 'webp', 'real', 'daily', 'simple', 'basic', 'thing', 'things', 'different', 'kind', 'kinds', 'show', 'shows', 'showing',
  'see', 'look', 'called', 'life', 'can', 'has', 'have', 'not', 'very', 'many', 'much', 'out', 'way', 'ways', 'kids', 'children', 'child',
]);

// Near-meanings, read both ways; kept small on purpose.
const NEAR: string[][] = [
  ['energy', 'power', 'kinetic', 'potential', 'joule', 'joules'],
  ['force', 'push', 'pull', 'pushing', 'pulling', 'friction', 'gravity'],
  ['fraction', 'fractions', 'half', 'halves', 'quarter', 'numerator', 'denominator'],
  ['democracy', 'election', 'elections', 'vote', 'voting', 'ballot', 'parliament'],
  ['electricity', 'electric', 'circuit', 'battery', 'current'],
  ['magnet', 'magnetic', 'magnetism'],
  ['heat', 'thermal', 'temperature', 'fire', 'flame'],
  ['light', 'lamp', 'ray', 'rays', 'beam'],
  ['sound', 'vibration', 'noise', 'echo'],
  ['plant', 'plants', 'tree', 'trees', 'shrub', 'herb'],
  ['leaf', 'leaves', 'foliage'],
  ['money', 'coin', 'coins', 'currency', 'rupee', 'rupees'],
  ['water', 'river', 'lake', 'rain', 'ocean', 'sea'],
  ['photosynthesis', 'chlorophyll', 'leaf', 'leaves'],
  ['government', 'parliament', 'assembly'],
  ['food', 'meal', 'fruit', 'vegetable', 'vegetables'],
  ['animal', 'animals', 'wildlife', 'mammal', 'bird', 'insect'],
];
const near = new Map<string, Set<string>>();
for (const group of NEAR) for (const w of group) near.set(w, new Set([...(near.get(w) ?? []), ...group]));

export const meaningWords = (text: string): string[] => Array.from(new Set(words(text).filter((w) => !EXTRA_STOP.has(w))));

const same = (t: string, w: string) => w === t || (t.length >= 4 && Math.min(w.length, t.length) >= 4 && (w.startsWith(t) || t.startsWith(w)));

// How many of the search words (or their near-meanings) the picture's own words contain.
export function matches(query: string, about: string): number {
  const seen = meaningWords(about);
  return meaningWords(query).filter((t) => [t, ...(near.get(t) ?? [])].some((v) => seen.some((w) => same(v, w)))).length;
}

// A picture fits: at least one search word for a short query, at least a third of them for a longer one.
export function relevant(query: string, about: string): boolean {
  const n = meaningWords(query).length;
  return n > 0 && matches(query, about) >= Math.max(1, Math.ceil(n / 3));
}

export const relevantTo = (query: string) => (about: string): boolean => relevant(query, about);

// Living things: the only searches iNaturalist is asked (its photographs are of animals and plants, whatever the words).
export const LIVING = /\b(animals?|plants?|trees?|flowers?|leaf|leaves|birds?|insects?|butterfl(y|ies)|moths?|bees?|ants?|fish(es)?|frogs?|toads?|snakes?|lizards?|mammals?|reptiles?|amphibians?|fung(us|i)|mushrooms?|seeds?|seedlings?|grass(es)?|crops?|wildlife|species|cactus|cacti|ferns?|moss(es)?|algae|tigers?|lions?|elephants?|cows?|buffalo(es)?|goats?|dogs?|cats?|horses?|monkeys?|deer|camels?|owls?|parrots?|peacocks?|crows?|sparrows?|eagles?|spiders?|worms?|earthworms?|snails?|crabs?|sharks?|whales?|dolphins?|turtles?|tortoises?|bats?|squirrels?|rabbits?|mosquito(es)?|flies|housefly|beetles?|caterpillars?|lotus|mango|neem|banyan|tulsi|wheat|rice plant|paddy)\b/i;
