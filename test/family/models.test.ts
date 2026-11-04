import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { MODEL_BLOCK_PARTS as MODEL_PARTS, checkBlock, completeResponse, parseBlockLine, type Block, type ModelBlock } from '@/lib/family/blocks';
import { MODELS, MODEL_ASSET_MAX_BYTES, MODEL_KEYS, drawnParts, modelAssetPath, partMembers } from '@/lib/family/models/catalog';
import { modelFits } from '@/lib/family/models/fit';
import { partSpokenIn } from '@/lib/family/models/spoken';
import { SKETCHES } from '@/lib/family/models/sketch';
import { buildProcedural } from '@/lib/family/models/procedural';
import { RESOLVER_PROMPTS, resolverPrompt, LATEST_RESOLVER_PROMPT } from '@/lib/ai/prompts/family.resolver';
import { MODEL_CATALOGUE, MODEL_LINE, resolverSystem as v11System } from '@/lib/ai/prompts/family.resolver/v11';
import { resolverSystem as v10System, type ResolverAsk } from '@/lib/ai/prompts/family.resolver/v10';
import { generate } from '@/lib/family/resolver';

const ROOT = path.resolve(__dirname, '../..');
const DEVANAGARI = /[ऀ-ॿ]/;

describe('the model block', () => {
  const good = { type: 'model', title: 'Your brain', model: 'brain', focus: ['cerebellum', 'medulla'], caption: 'A model of the brain.' };

  it('keeps a known model with known parts, the first focus part first', () => {
    expect(checkBlock(good)).toEqual(good);
    expect(checkBlock({ type: 'model', title: 'Heart', model: 'heart' })).toEqual({ type: 'model', title: 'Heart', model: 'heart', focus: [] });
    // The model's stream accepts it (it is not chapter-only), and it sits after the board.
    expect(parseBlockLine(JSON.stringify(good))?.type).toBe('model');
    const ex = checkBlock({ type: 'explanation', title: 'Brain', idea: 'The brain controls the body.', example: 'You catch a ball.', steps: ['Look', 'Tell'], terms: [{ en: 'brain', local: 'brain' }] }) as Block;
    expect(completeResponse([checkBlock(good) as Block, ex], ['explanation'])!.map((b) => b.type)).toEqual(['explanation', 'model']);
  });

  it('drops an unknown model, an unknown or repeated part, too many parts, a long caption or title', () => {
    expect(checkBlock({ ...good, model: 'kidney_bean' })).toBeNull();
    expect(checkBlock({ ...good, focus: ['cerebellum', 'aorta'] })).toBeNull();
    expect(checkBlock({ ...good, focus: ['cerebellum', 'cerebellum'] })).toBeNull();
    expect(checkBlock({ ...good, focus: 'cerebellum' })).toBeNull();
    expect(checkBlock({ ...good, focus: ['frontal_lobe', 'parietal_lobe', 'temporal_lobe', 'occipital_lobe', 'cerebellum', 'pons', 'medulla'] })).toBeNull();
    expect(checkBlock({ ...good, caption: 'x'.repeat(161) })).toBeNull();
    expect(checkBlock({ ...good, title: 'x'.repeat(61) })).toBeNull();
    expect(checkBlock({ ...good, model: undefined })).toBeNull();
  });
});

describe('the catalogue', () => {
  it('has at least 12 models for Classes 6 to 10 Science, the block checker\'s part keys equal to the catalogue\'s', () => {
    expect(MODEL_KEYS.length).toBeGreaterThanOrEqual(12);
    for (const k of MODEL_KEYS) {
      expect(MODELS[k].parts.map((p) => p.key)).toEqual([...MODEL_PARTS[k]]);
      expect(MODELS[k].classes.every((c) => c >= 6 && c <= 10)).toBe(true);
    }
  });

  it('names every part in English and in Hindi (Devanagari), and every group names parts of its own model', () => {
    for (const k of MODEL_KEYS) {
      for (const p of MODELS[k].parts) {
        expect(p.en.trim().length, `${k}.${p.key}`).toBeGreaterThan(0);
        expect(DEVANAGARI.test(p.hi), `${k}.${p.key} hi`).toBe(true);
        for (const m of p.group ?? []) expect(drawnParts(k).map((d) => d.key)).toContain(m);
      }
      expect(MODELS[k].words.some((w) => DEVANAGARI.test(w))).toBe(true);
      expect(MODELS[k].words.some((w) => !DEVANAGARI.test(w))).toBe(true);
    }
  });

  it('draws every part in the 2D schematic, and nothing that is not a part', () => {
    for (const k of MODEL_KEYS) {
      const drawn = new Set(SKETCHES[k].map(([p]) => p));
      for (const p of drawnParts(k)) expect(drawn.has(p.key), `${k}.${p.key}`).toBe(true);
      for (const p of drawn) expect(p === '_' || MODEL_PARTS[k].includes(p as never), `${k} ${p}`).toBe(true);
    }
  });

  it('every asset exists, is at most 1.5 MB, has a node per part, and is in the licence record', () => {
    const record = readFileSync(path.join(ROOT, 'docs/reference/3d-models.md'), 'utf8');
    for (const k of MODEL_KEYS) {
      const url = modelAssetPath(k);
      if (!url) continue;
      const file = path.join(ROOT, 'public', url);
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).size).toBeLessThanOrEqual(MODEL_ASSET_MAX_BYTES);
      expect(record).toContain(`public/models/${k}.glb`);
      // The glb's JSON chunk names a node for every drawn part.
      const buf = readFileSync(file);
      const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8')) as { nodes: { name?: string }[] };
      const names = new Set(json.nodes.map((n) => n.name));
      for (const p of drawnParts(k)) expect(names.has(p.key), `${k}.${p.key}`).toBe(true);
    }
    expect(record).toContain('CC BY-SA 4.0');
  });

  it('builds every procedural model with a shape for every part', () => {
    for (const k of MODEL_KEYS) {
      if (MODELS[k].source !== 'procedural') continue;
      const g = buildProcedural(k)!;
      const parts = new Set<string>();
      g.traverse((o) => {
        if (o.userData.part) parts.add(o.userData.part as string);
      });
      expect([...parts].sort(), k).toEqual(drawnParts(k).map((p) => p.key).sort());
    }
    expect(partMembers('brain', 'brain_stem')).toEqual(['midbrain', 'pons', 'medulla']);
    expect(partMembers('brain', 'pons')).toEqual(['pons']);
  });
});

describe('modelFits', () => {
  it('fits a question about the thing, in English and in Hindi', () => {
    expect(modelFits('brain', 'What does the cerebellum do?')).toBe(true);
    expect(modelFits('brain', 'मस्तिष्क के भाग कौन से हैं?')).toBe(true);
    expect(modelFits('heart', 'How does the heart pump blood?')).toBe(true);
    expect(modelFits('heart', 'हृदय में कितने कक्ष होते हैं?')).toBe(true);
    expect(modelFits('flower', 'Name the parts of a flower')).toBe(true);
    expect(modelFits('flower', 'परागण क्या है?')).toBe(true);
    expect(modelFits('digestive', 'Explain digestion in humans')).toBe(true);
    expect(modelFits('solar_system', 'सौर मंडल में कितने ग्रह हैं?')).toBe(true);
  });

  it('does not fit a question about something else, and a short word only at a word start', () => {
    expect(modelFits('heart', 'What is friction?')).toBe(false);
    expect(modelFits('brain', 'How do plants make food?')).toBe(false);
    // "rain" is inside "brain": the water cycle is not shown for a brain question.
    expect(modelFits('water_cycle', 'What does the brain do?')).toBe(false);
    expect(modelFits('water_cycle', 'Why does it rain?')).toBe(true);
    expect(modelFits('eye', 'How does a convex lens form an image?')).toBe(false);
  });
});

describe('partSpokenIn', () => {
  it('finds the part a sentence names, the longest name first', () => {
    expect(partSpokenIn('brain', 'The cerebellum keeps your balance.', 'en')).toBe('cerebellum');
    expect(partSpokenIn('heart', 'Blood enters the right atrium from the vena cava.', 'en')).toBe('right_atrium');
    expect(partSpokenIn('earth_layers', 'The inner core is solid iron.', 'en')).toBe('inner_core');
    expect(partSpokenIn('flower', 'Pollen grains form in the anther.', 'en')).toBe('anther');
    expect(partSpokenIn('flower', 'The stamens are the male parts.', 'en')).toBe('stamen');
    expect(partSpokenIn('eye', 'The pupil lets light in.', 'en')).toBe('iris');
  });

  it('reads Hindi, and an English name inside a Hindi sentence', () => {
    expect(partSpokenIn('brain', 'अनुमस्तिष्क शरीर का संतुलन बनाए रखता है।', 'hi')).toBe('cerebellum');
    expect(partSpokenIn('heart', 'बायाँ निलय रक्त को पूरे शरीर में भेजता है।', 'hi')).toBe('left_ventricle');
    expect(partSpokenIn('eye', 'Retina पर प्रतिबिंब बनता है।', 'hi')).toBe('retina');
  });

  it('gives null when no part is named, or no sentence', () => {
    expect(partSpokenIn('brain', 'Let us see how it works.', 'en')).toBeNull();
    expect(partSpokenIn('brain', null, 'en')).toBeNull();
    expect(partSpokenIn('brain', '', 'hi')).toBeNull();
  });
});

describe('prompt v11', () => {
  const base: ResolverAsk = { board: 'CBSE', classLevel: 10, subject: 'science', openSubjects: ['science'], classSubjects: ['mathematics', 'science'], chapter: null, topic: null, question: 'What does the cerebellum do?', language: 'en', style: 'en', followUp: null, misconception: null };

  it('is v10 plus the catalogue line, registered after v10; v10 stays the fallback', () => {
    const versions = RESOLVER_PROMPTS.map((p) => p.version);
    expect(versions.indexOf('v11')).toBe(versions.indexOf('v10') + 1);
    expect(resolverPrompt('v11', false).version).toBe('v11');
    expect(LATEST_RESOLVER_PROMPT).toBe('v10');
    const s = v11System(base);
    expect(s).toContain(MODEL_LINE);
    expect(MODEL_LINE).toContain('Show a model only for a question about that thing; "focus" lists the parts you explain, in the order you explain them');
    expect(s.replace(`\n${MODEL_LINE}`, '')).toBe(v10System(base));
    expect(v11System({ ...base, subject: 'mathematics' })).toBe(v10System({ ...base, subject: 'mathematics' }));
  });

  it('lists the same keys and parts as the catalogue', () => {
    expect(Object.keys(MODEL_CATALOGUE)).toEqual(MODEL_KEYS);
    expect(Object.keys(MODEL_PARTS)).toEqual(MODEL_KEYS);
    for (const k of MODEL_KEYS) {
      expect([...MODEL_CATALOGUE[k]]).toEqual([...MODEL_PARTS[k]]);
      expect(MODEL_LINE).toContain(`${k} (${MODEL_PARTS[k].join(', ')})`);
    }
  });
});

describe('the resolver gate', () => {
  const run = async (asked: string, lines: object[]) => {
    const text = lines.map((b) => JSON.stringify(b));
    const events: { t: string; block?: { type: string } }[] = [];
    const g = await generate(
      {
        ctx: { accountId: 'a', child: { childId: 'c', firstName: 'X', classLevel: 10, board: 'CBSE', language: 'en', style: 'en', stateCode: 'IN-DL', freeSubject: 'science' }, childFirstNames: [], parentEmail: '', day: '2026-11-04', refusalWords: (k: string) => k },
        line: null,
        known: 'science',
        open: ['science'],
        classSubjects: ['science'],
        cacheable: false,
        promptVersion: 'v11',
        text: {
          send: async (onDelta?: (t: string) => void) => {
            for (const l of text) onDelta?.(`${l}\n`);
            return { result: { ok: true, text: text.join('\n'), tokensIn: 1, tokensOut: 1, provider: 'p', model: 'm' }, record: async () => undefined };
          },
        },
        moderation: null,
        asked,
        question: asked,
        plan: null,
      } as never,
      (e) => events.push(e as never)
    );
    return g.kept.map((b) => (b.type === 'model' ? `model:${(b as ModelBlock).model}` : b.type));
  };
  const explanation = { type: 'explanation', title: 'Friction', idea: 'Friction slows things down.', example: 'A ball stops on grass.', steps: ['Push', 'Watch'], terms: [] };

  it('drops a model the question is not about, and keeps one it is about', async () => {
    expect(await run('What is friction?', [explanation, { type: 'model', title: 'The heart', model: 'heart', focus: ['aorta'] }])).toEqual(['explanation']);
    expect(await run('What does the cerebellum do?', [explanation, { type: 'model', title: 'Your brain', model: 'brain', focus: ['cerebellum'] }])).toEqual(['explanation', 'model:brain']);
  });
});

describe('the model view', () => {
  it('draws the schematic first, with the focus part lit and named in the child\'s language, and 44 px part chips', async () => {
    const { createElement: h } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { ModelView } = await import('@/components/family/blocks/ModelView');
    const b = checkBlock({ type: 'model', title: 'मस्तिष्क', model: 'brain', focus: ['cerebellum'] }) as ModelBlock;
    const w = { 'fam.mdl.lang': 'hi', 'fam.mdl.parts': 'मॉडल के भाग', 'fam.mdl.aria': '{title} का मॉडल। {part}', 'fam.mdl.hint2d': 'छुओ', 'fam.mdl.ask': '{part} का काम क्या है?', 'fam.mdl.credit': 'BodyParts3D' } as never;
    const html = renderToStaticMarkup(h(ModelView, { b, w, tone: 'science', onAsk: () => undefined }));
    expect(html).toContain('data-model-2d');
    expect(html).toContain('data-model-label');
    expect(html).toContain('अनुमस्तिष्क का काम क्या है?');
    expect(html).toContain('data-model-part="cerebellum"');
    expect(html).toContain('min-h-[44px]');
    expect(html).not.toContain('<canvas');
  });
});
