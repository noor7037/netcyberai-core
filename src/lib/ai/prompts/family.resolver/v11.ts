// Prompt v11 of the family.resolver profile (W19-D): v10, word for word, plus one line: the 3D models. For a Science
// question about one of the catalogue's things (the brain, the heart, a flower, the solar system...), the answer may
// carry one model block naming the model by key and the parts it explains, in order. Our code draws the model, lights the
// parts and names them in the child's language; a model whose words are not in the question is dropped
// (src/lib/family/models/fit.ts), and so is a key or a part the catalogue does not have.
//
// The Family app is a bounded module (docs/family-app/03 §14), so the prompt does not import the catalogue
// (src/lib/family/blocks.ts MODEL_BLOCK_PARTS, src/lib/family/models/catalog.ts); the keys are repeated here and test/family/models.test.ts keeps the two equal.
// Registered next to v10 and chosen by Control by name; v10 stays the code-only fallback until the founder switches.

import { resolverSystem as v10System, resolverUser as v10User, type ResolverAsk } from './v10';

export const RESOLVER_PROMPT_VERSION = 'v11';
export type { ResolverAsk };

export const MODEL_CATALOGUE: Record<string, readonly string[]> = {
  brain: ['frontal_lobe', 'parietal_lobe', 'temporal_lobe', 'occipital_lobe', 'cerebellum', 'midbrain', 'pons', 'medulla', 'hypothalamus', 'cerebrum', 'brain_stem'],
  heart: ['right_atrium', 'left_atrium', 'right_ventricle', 'left_ventricle', 'aorta', 'pulmonary_artery', 'vena_cava', 'pulmonary_veins', 'valves', 'coronary_arteries'],
  eye: ['cornea', 'iris', 'lens', 'sclera', 'retina', 'vitreous', 'optic_nerve'],
  lungs: ['trachea', 'bronchi', 'right_lung', 'left_lung', 'epiglottis'],
  digestive: ['mouth', 'salivary_glands', 'pharynx', 'oesophagus', 'stomach', 'liver', 'gallbladder', 'pancreas', 'small_intestine', 'large_intestine', 'appendix'],
  excretory: ['kidneys', 'ureters', 'bladder', 'urethra'],
  plant_cell: ['cell_wall', 'cell_membrane', 'cytoplasm', 'nucleus', 'vacuole', 'chloroplasts', 'mitochondria'],
  animal_cell: ['cell_membrane', 'cytoplasm', 'nucleus', 'mitochondria', 'golgi', 'lysosomes', 'vacuole'],
  flower: ['petals', 'sepals', 'filament', 'anther', 'stigma', 'style', 'ovary', 'receptacle', 'stalk', 'stamen', 'pistil'],
  neuron: ['dendrites', 'cell_body', 'nucleus', 'axon', 'myelin', 'nerve_endings'],
  dc_motor: ['magnet_n', 'magnet_s', 'coil', 'commutator', 'brushes', 'axle', 'battery', 'magnet'],
  electromagnet: ['core', 'coil', 'battery', 'switch', 'clips'],
  solar_system: ['sun', 'mercury', 'venus', 'earth', 'mars', 'asteroid_belt', 'jupiter', 'saturn', 'uranus', 'neptune'],
  earth_layers: ['crust', 'mantle', 'outer_core', 'inner_core', 'core'],
  atom: ['protons', 'neutrons', 'electrons', 'k_shell', 'l_shell', 'nucleus', 'shells'],
  water_cycle: ['sun', 'sea', 'evaporation', 'clouds', 'rain', 'mountains', 'river'],
  leaf: ['blade', 'midrib', 'veins', 'petiole', 'stomata', 'guard_cells'],
};

export const MODEL_LINE = `For Science, one 3D model when the question is about one of these things: {"type":"model","title":"≤60","model":"<key>","focus":["<part>",...],"caption":"≤160"}. Show a model only for a question about that thing; "focus" lists the parts you explain, in the order you explain them (at most 6). Models and their parts: ${Object.entries(MODEL_CATALOGUE)
  .map(([k, parts]) => `${k} (${parts.join(', ')})`)
  .join('; ')}.`;

const SCIENCE = /^(science|physics|chemistry|biology)$/;

export function modelLines(a: Pick<ResolverAsk, 'subject'>): string[] {
  const science = a.subject === null || SCIENCE.test(a.subject);
  return science ? [MODEL_LINE] : [];
}

export function resolverSystem(a: ResolverAsk): string {
  const base = v10System(a);
  const lines = modelLines(a);
  if (lines.length === 0) return base;
  // With v10's other blocks, before the closing rules, so the block list still reads as the answer's order.
  const at = base.indexOf('\nRules: ');
  const extra = lines.join('\n');
  return at < 0 ? `${base}\n${extra}` : `${base.slice(0, at)}\n${extra}${base.slice(at)}`;
}

export const resolverUser = v10User;
