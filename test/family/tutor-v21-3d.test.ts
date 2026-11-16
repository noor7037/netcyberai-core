import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseBlockLine } from '@/lib/family/blocks';
import { elaborationBlock, type Elaboration } from '@/lib/family/elaboration';
import { withPics } from '@/lib/family/elaboration-pics';
import { RateLimited } from '@/lib/family/visuals/limits';
import { covers, forgetKeyWarnings, forgetLocalVisuals, freeLicence, getJson } from '@/lib/family/visuals/adapter-kit';
import { fillElaboration, forgetElabPhotos } from '@/lib/family/visuals/elab-fill';
import { find3d, MODEL_SOURCES, richSteps, type Source3d } from '@/lib/family/visuals/models3d';
import { ANIM_INDEX, findAnimation } from '@/lib/family/visuals/anim-source';
import { sketchfab3d } from '@/lib/family/visuals/model-sketchfab';
import { nasa3d } from '@/lib/family/visuals/model-nasa3d';
import { forgetPolyHaven } from '@/lib/family/visuals/model-polyhaven';
import { resourceUrl } from '@/components/family/blocks/gltf-resources';
import { SOURCES } from '@/lib/family/visuals/sources';
import { modelUrl, photoUrl } from '@/lib/family/visuals/photo-hosts';

// v21 3D and animation sources (16 Nov 2026). Every request is mocked: no live call in a test.

const guardedCalls: { source: string; error: unknown }[] = [];
vi.mock('@/lib/family/visuals/limits', async (orig) => {
  const real = await orig<typeof import('@/lib/family/visuals/limits')>();
  return {
    ...real,
    guarded: async <T,>(source: string, fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn();
      } catch (error) {
        guardedCalls.push({ source, error });
        return null;
      }
    },
  };
});

type Route = [RegExp, unknown, number?];
function mockFetch(routes: Route[]) {
  const calls: string[] = [];
  const f = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const r = routes.find(([re]) => re.test(url));
    if (!r) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(r[1]), { status: r[2] ?? 200, headers: { 'retry-after': '120' } });
  }) as typeof fetch;
  return { f, calls };
}

const UID = 'a'.repeat(32);
const sketchSearch = (licence: { slug: string; label: string }, extra: Record<string, unknown> = {}) => ({
  results: [{ uid: UID, name: 'Wind Turbine', license: licence, isDownloadable: true, isAgeRestricted: false, tags: [{ name: 'energy' }], user: { displayName: 'Maker' }, thumbnails: { images: [{ url: `https://media.sketchfab.com/models/${UID}/thumbnails/x/640.jpeg`, width: 640 }] }, ...extra }],
});
const sketchDownload = { glb: { url: 'https://sketchfab-prod-media.s3.amazonaws.com/archives/x/wind.glb?sig=1', size: 2_000_000, expires: 300 } };

beforeEach(() => {
  guardedCalls.length = 0;
  forgetKeyWarnings();
  forgetLocalVisuals();
  forgetElabPhotos();
  forgetPolyHaven();
});
afterEach(() => vi.restoreAllMocks());

const HINDI = {
  type: 'elaboration',
  term: 'ऊर्जा',
  definition: { text: 'ऊर्जा काम करने की क्षमता है।', say: 'ऊर्जा काम करने की क्षमता है।', q: 'energy' },
  levels: { basic: 'हवा से पवन चक्की घूमती है।', intermediate: 'पवन चक्की हवा की गति को बिजली में बदलती है।', advanced: 'गतिज ऊर्जा से विद्युत ऊर्जा बनती है।', say: 'तीन स्तर।', q: 'wind turbine' },
  real_life: { text: 'घर का पंखा बिजली से चलता है।', say: 'पंखा।', q: 'ceiling fan' },
  try_it: { question: 'हवा न चले तो पवन चक्की का क्या होगा?', right: 'वह रुक जाएगी।', hint: 'हवा के बारे में सोचो।', say: 'सोचो।', q: 'windmill' },
  future: { text: 'आगे तुम सौर और पवन ऊर्जा पढ़ोगे।', say: 'आगे।', q: 'solar panel' },
  checks: [{ question: 'पवन चक्की किससे घूमती है?', options: ['हवा', 'पानी'], answer: 0, right: 'हवा।', hint: 'चरण 2।' }],
};

describe('3D for any language through the English q3d term', () => {
  it('a Hindi energy answer with q3d "wind turbine" gets a 3D model from a non-chemistry source on step 2', async () => {
    const { f, calls } = mockFetch([[/api\.sketchfab\.com\/v3\/search/, sketchSearch({ slug: 'by', label: 'CC Attribution' })], [/\/download$/, sketchDownload], [/api\.polyhaven\.com\/assets/, {}]]);
    const env = { SKETCHFAB_TOKEN: 't' };
    const built = { ...withPics(parseBlockLine(JSON.stringify(HINDI)) as unknown as Elaboration, [], 'ऊर्जा क्या है', 7), q3d: ['', 'wind turbine', '', '', ''] };
    const stub = async () => null;
    const b = await fillElaboration(built, { subject: 'science', search: stub, rich: (q, k) => richSteps(q, k, { find: (t) => find3d(t, env, f) }) });
    expect(b.pics[1]?.kind).toBe('model3d');
    expect(b.pics[1]?.from).toBe('sketchfab');
    expect(b.pics[1]?.model?.format).toBe('glb');
    expect(b.pics[1]?.caption).toContain('हवा');
    expect(calls.some((u) => /pubchem|rcsb/.test(u))).toBe(false);
  });

  it('an empty q3d returns null at once, with no request and no source asked', async () => {
    const { f, calls } = mockFetch([]);
    const run = vi.fn(async () => null);
    expect(await find3d('', {}, f, [{ id: 'x', run }])).toBeNull();
    expect(await find3d('   ', {}, f)).toBeNull();
    expect(run).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
    const out = await richSteps(['', '', '', '', ''], [false, false, false, false, false], { find: run, anim: run });
    expect(out.every((x) => x === null)).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });

  it('at most two rich pictures an answer, step 2 first, never over an authored diagram', async () => {
    const asked: string[] = [];
    const find = async (t: string) => (asked.push(t), { model: { format: 'glb' as const, url: 'https://static.poly.pizza/x.glb' }, still: 'https://static.poly.pizza/x.webp', credit: 'a', licence: 'CC0 1.0', page: 'https://poly.pizza/m/x', from: 'polypizza' });
    const out = await richSteps(['heart', 'lungs', 'kidney', 'brain', 'eye'], [true, false, false, false, false], { find });
    expect(asked).toEqual(['lungs', 'kidney']);
    expect(out.map((x) => x?.kind ?? null)).toEqual([null, 'model3d', 'model3d', null, null]);
  });

  it('PubChem is asked first for a compound name, the PDB for an enzyme, neither for an everyday thing', async () => {
    const order = (term: string) => MODEL_SOURCES.filter((s) => !s.when || s.when(term)).map((s) => s.id);
    expect(order('glucose')[0]).toBe('pubchem');
    expect(order('amylase enzyme')[0]).toBe('pdb');
    expect(order('wind turbine')).not.toContain('pubchem');
    expect(order('wind turbine')).not.toContain('pdb');
    expect(order('satellite').indexOf('pubchem')).toBe(order('satellite').length - 1);
    expect(order('moon phase')).not.toContain('pdb');
  });

  it('a NASA model is matched on every word: "wind turbine" is not the Wind spacecraft', () => {
    expect(nasa3d('wind turbine')).toBeNull();
    const m = nasa3d('Saturn V rocket') ?? nasa3d('Saturn V');
    expect(m?.from).toBe('nasa3d');
    expect(modelUrl(m?.model.url)).toBeTruthy();
    expect(covers('wind turbine', 'Wind')).toBe(false);
    expect(covers('solar panels', 'Solar Panel')).toBe(true);
  });
});

describe('keys, rate limits and licences', () => {
  it('a missing key skips the source and is logged once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { f, calls } = mockFetch([[/api\.polyhaven\.com\/assets/, {}]]);
    await find3d('wind turbine', {}, f);
    await find3d('water wheel', {}, f);
    expect(calls.some((u) => /sketchfab|poly\.pizza|api\.si\.edu/.test(u))).toBe(false);
    const lines = warn.mock.calls.map((c) => String(c[0]));
    for (const id of ['sketchfab', 'polypizza', 'smithsonian3d']) expect(lines.filter((l) => l.includes(`${id} skipped`))).toHaveLength(1);
  });

  it('HTTP 429 throws RateLimited, which guarded receives (and pauses the source); the next source is still asked', async () => {
    const { f } = mockFetch([[/./, {}, 429]]);
    await expect(getJson('https://api.sketchfab.com/v3/search?q=x', f)).rejects.toBeInstanceOf(RateLimited);
    const next = vi.fn(async () => null);
    const sources: Source3d[] = [{ id: 'sketchfab', key: 'SKETCHFAB_TOKEN', run: (t, ff, k) => sketchfab3d(t, {}, ff, k) }, { id: 'polyhaven', run: next }];
    expect(await find3d('wind turbine', { SKETCHFAB_TOKEN: 't' }, f, sources)).toBeNull();
    expect(guardedCalls).toHaveLength(1);
    expect(guardedCalls[0].source).toBe('sketchfab');
    expect(guardedCalls[0].error).toBeInstanceOf(RateLimited);
    expect((guardedCalls[0].error as RateLimited).retryAfterS).toBe(120);
    expect(next).toHaveBeenCalled();
  });

  it('the licence filter keeps CC0, CC BY and CC BY-SA and rejects NC, ND and store licences', () => {
    for (const ok of ['cc0', 'CC0 1.0', 'by', 'CC Attribution', 'CC-BY-4.0', 'CC BY 3.0', 'by-sa', 'CC Attribution-ShareAlike', 'Public Domain']) expect(freeLicence(ok)).not.toBeNull();
    for (const no of ['by-nc', 'CC Attribution-NonCommercial', 'by-nd', 'CC Attribution-NoDerivs', 'by-nc-sa', 'by-nc-nd', 'st', 'Standard', 'ed', 'Editorial', 'free-st', '', undefined]) expect(freeLicence(no)).toBeNull();
  });

  it('Sketchfab skips a non-commercial, a no-derivatives, an age-restricted or a non-downloadable model', async () => {
    for (const bad of [sketchSearch({ slug: 'by-nc', label: 'CC Attribution-NonCommercial' }), sketchSearch({ slug: 'by-nd', label: 'CC Attribution-NoDerivs' }), sketchSearch({ slug: 'by', label: 'CC Attribution' }, { isAgeRestricted: true }), sketchSearch({ slug: 'by', label: 'CC Attribution' }, { isDownloadable: false })]) {
      const { f, calls } = mockFetch([[/v3\/search/, bad], [/\/download$/, sketchDownload]]);
      expect(await sketchfab3d('wind turbine', {}, f, 't')).toBeNull();
      expect(calls.some((u) => u.endsWith('/download'))).toBe(false);
    }
    const { f } = mockFetch([[/v3\/search/, sketchSearch({ slug: 'cc0', label: 'CC0 Public Domain' })], [/\/download$/, sketchDownload]]);
    expect((await sketchfab3d('wind turbine', {}, f, 't'))?.licence).toBe('CC0 1.0');
  });
});

describe('the animation source', () => {
  it('picks the right file from the index', () => {
    expect(findAnimation('wind turbine')?.url).toBe('/anim/wind-turbine.svg');
    expect(findAnimation('water cycle')?.url).toBe('/anim/water-cycle.svg');
    expect(findAnimation('heart')?.url).toBe('/anim/heartbeat.svg');
    expect(findAnimation('simple pendulum')?.url).toBe('/anim/pendulum.svg');
    expect(findAnimation('stock market')).toBeNull();
    expect(findAnimation('')).toBeNull();
  });

  it('every indexed file is our own, licensed for commercial use, with English tags', () => {
    expect(ANIM_INDEX.length).toBeGreaterThanOrEqual(10);
    for (const r of ANIM_INDEX) {
      expect(r.file).toMatch(/^[a-z0-9-]+\.svg$/);
      expect(r.licence).toMatch(/CC0|CC BY|MIT|Apache/);
      expect(r.tags.length).toBeGreaterThan(0);
    }
  });

  it('a step with no 3D model gets an animation, and the block keeps it through a stored round trip', async () => {
    const out = await richSteps(['', 'wind turbine', '', '', ''], [false, false, false, false, false], { find: async () => null });
    expect(out[1]?.kind).toBe('animation');
    const built = { ...withPics(parseBlockLine(JSON.stringify(HINDI)) as unknown as Elaboration, [], 'ऊर्जा क्या है', 7), q3d: ['', 'wind turbine', '', '', ''] };
    const b = await fillElaboration(built, { subject: 'science', search: async () => null, rich: (q, k) => richSteps(q, k, { find: async () => null }) });
    expect(b.pics[1]).toMatchObject({ kind: 'animation', url: '/anim/wind-turbine.svg' });
    const back = elaborationBlock(JSON.parse(JSON.stringify(b)), true);
    expect(back?.pics[1]).toMatchObject({ kind: 'animation', url: '/anim/wind-turbine.svg' });
    const evil = elaborationBlock(JSON.parse(JSON.stringify({ ...b, pics: b.pics.map((p, i) => (i === 1 ? { ...p, url: 'https://evil.example/x.svg' } : p)) })), true);
    expect(evil?.pics[1]?.kind).not.toBe('animation');
  });
});

describe('the registry and the hosts', () => {
  it('every SOURCES row has an adapter, is served by the 3D/animation code, an embed or code, or is planned', () => {
    const model = new Set(MODEL_SOURCES.map((s) => s.id));
    for (const s of SOURCES) {
      const ok = !!s.adapter || (s.served === 'model3d' && model.has(s.id)) || (s.served === 'animation' && s.id === 'anim') || s.access === 'embed' || s.access === 'code' || s.planned === true;
      expect(ok, s.id).toBe(true);
      if (s.planned) expect(s.note, s.id).toBeTruthy();
    }
    for (const id of model) expect(SOURCES.some((s) => s.id === id && s.served === 'model3d'), id).toBe(true);
    expect(SOURCES.some((s) => s.id === 'lottie')).toBe(false);
  });

  it('the shared raw host is limited to the Khronos samples, and the viewer keeps a glTF on its own host', () => {
    expect(modelUrl('https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb')).toBeTruthy();
    expect(modelUrl('https://raw.githubusercontent.com/someone/else/main/x.glb')).toBeNull();
    expect(photoUrl('https://raw.githubusercontent.com/someone/else/main/x.jpg')).toBeNull();
    const g = 'https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/ArmChair_01/ArmChair_01_1k.gltf';
    expect(resourceUrl(g, 'textures/Armchair_01_diff_1k.jpg')).toBe('https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/ArmChair_01/Armchair_01_diff_1k.jpg');
    expect(resourceUrl(g, 'ArmChair_01.bin')).toBe('https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/ArmChair_01/ArmChair_01.bin');
    expect(resourceUrl(g, 'https://evil.example/x.bin')).toBe('about:blank');
    expect(resourceUrl(g, 'blob:https://app/1')).toBe('blob:https://app/1');
  });
});
