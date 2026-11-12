import type { ModelList } from './control';

// The "provider · model" drop-down's options (W6-C, C397): one select per slot, an optgroup per provider, and an
// "Other…" item in each group for a model id the list does not have. Pure, so the choices and the rule are tested
// without a screen.

// A model id as the vendor names it; the same rule the server and the database hold (src/lib/ai/control.ts).
export const MODEL_RULE = /^@?[A-Za-z0-9._:/-]{1,80}$/;
export const validModel = (m: string) => MODEL_RULE.test(m.trim());

// An option's value is "provider|model"; '|' is in neither a provider id nor a model id. "Other…" is "provider|*other".
const OTHER = '*other';
export const optionValue = (provider: string, model: string) => `${provider}|${model}`;
export const otherValue = (provider: string) => `${provider}|${OTHER}`;
export type Parsed = { provider: string; model: string | null }; // model null: the "Other…" item
export function parseOption(value: string): Parsed | null {
  const cut = value.indexOf('|');
  if (cut <= 0) return null;
  const provider = value.slice(0, cut);
  const model = value.slice(cut + 1);
  return { provider, model: model === OTHER ? null : model };
}

export type Group = { provider: string; models: string[] };
// The groups to offer: the given providers in order, each with the model ids its latest list holds (none when the list
// failed or was never fetched; nothing is guessed). A provider the slot already holds but the choices lack is added so
// the saved route can always be shown.
export function groupsFor(
  providers: string[],
  lists: Record<string, ModelList>,
  current: string[] = [],
  need: Need | null = null,
  short: { keep: string[] } | null = null,
): Group[] {
  const all = [...providers, ...current.filter((p) => p && !providers.includes(p))];
  return all.map((provider) => {
    const list = lists[provider];
    const fit = list?.ok ? list.models.filter((m) => fitsNeed(provider, need, m)) : [];
    return { provider, models: short ? shortModels(fit, list?.proven ?? [], short.keep) : fit };
  });
}

// The short list (C502): only the ids that have answered lately or sit in a route, plus what this slot holds. A provider
// with none yet (a new key) keeps its whole list, or there would be nothing to pick.
export function shortModels(fit: string[], proven: string[], keep: string[]): string[] {
  const want = new Set([...proven, ...keep]);
  const few = fit.filter((m) => want.has(m));
  return few.length > 0 ? few : fit;
}
export const hasMore = (providers: string[], lists: Record<string, ModelList>, need: Need | null) =>
  providers.some((p) => {
    const l = lists[p];
    if (!l?.ok) return false;
    const fit = l.models.filter((m) => fitsNeed(p, need, m));
    return shortModels(fit, l.proven ?? [], []).length < fit.length;
  });

// W18 (2 Nov): a provider's one model list serves every picker, but a vendor that sells voices, speech to text and text
// under one key (Sarvam, ElevenLabs, Gemini, OpenRouter, OpenAI) would otherwise show a voice to the text picker and a chat
// model to Reading aloud. Each picker keeps the ids shaped for its feature's own need; a provider not listed here, or a
// need with no shape, shows its whole list. Shapes mirror the adapters' own model checks; a saved id the list lacks still
// shows through "Other".
export type Need = 'text' | 'stt' | 'tts' | 'realtime';
const SHAPES: Record<string, Partial<Record<Need, RegExp>>> = {
  sarvam: { tts: /^bulbul:/, stt: /^saaras:/, text: /^sarvam-/ },
  elevenlabs: { tts: /^eleven_(multilingual_v2|flash_v2_5)\//, stt: /^scribe/ },
  gemini: { tts: /tts|\//i, stt: /^(?!.*tts)(?!.*live)/i, realtime: /live/i, text: /^(?!.*tts)(?!.*live)/i },
  openai: { tts: /tts/i, stt: /whisper|transcribe/i, realtime: /realtime/i, text: /^(?!.*(tts|whisper|transcribe|realtime))/i },
  openrouter: { tts: /tts|speech|\|/i, stt: /whisper|transcri|stt/i, text: /^(?!.*(tts|whisper|transcri|\|))/i },
};
export function fitsNeed(provider: string, need: Need | null, model: string): boolean {
  const shape = need ? SHAPES[provider]?.[need] : undefined;
  return shape ? shape.test(model) : true;
}

// What the select shows for a slot: the matching list item, "Other…" (typing, or a model the list does not hold), or
// nothing chosen. `typing` is true right after "Other…" was picked.
export function selectedValue(groups: Group[], slot: { provider: string; model: string }, typing: boolean): string {
  if (!slot.provider) return '';
  if (typing) return otherValue(slot.provider);
  if (!slot.model) return '';
  const g = groups.find((x) => x.provider === slot.provider);
  return g?.models.includes(slot.model) ? optionValue(slot.provider, slot.model) : otherValue(slot.provider);
}

export const sameChoice = (a: { provider: string; model: string }, b: { provider: string; model: string }) =>
  !!a.provider && a.provider === b.provider && a.model.trim() === b.model.trim();
// True when two filled slots hold the same provider and model.
export const hasDuplicate = (slots: { provider: string; model: string }[]) =>
  slots.some((s, i) => s.provider && slots.some((o, j) => j > i && sameChoice(s, o)));
