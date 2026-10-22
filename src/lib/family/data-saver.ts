// The data-saver (docs/family-app/11 L9, 07 §1; M2-9, C283). Many families have weak or paid mobile data. With it on,
// a response loads text only, text first: no pictures, no diagrams drawn beyond text, no interactive or video blocks,
// and nothing fetched ahead. The switch is per device (localStorage), off by default; a phone that asks the browser to
// save data (navigator.connection.saveData) turns it on until the family chooses. Pure here, safe for the phone.

// The blocks a data-saver response keeps, in the order it shows them: what is read first, then the questions.
export const TEXT_FIRST = ['explanation', 'worked_example', 'key_points', 'english_moment', 'sources'] as const;
export const QUESTIONS = ['check', 'practice'] as const;
const KEPT: readonly string[] = [...TEXT_FIRST, ...QUESTIONS];

// The blocks to draw. Off: all of them, as they came. On: only text and questions (a diagram, a picture, an interactive
// model, a video, or any type this list does not know is dropped), the text blocks first, each group in its order.
export function dataSaverBlocks<B extends { type: string }>(blocks: readonly B[], on: boolean): B[] {
  if (!on) return [...blocks];
  const rank = (b: B) => KEPT.indexOf(b.type) >= TEXT_FIRST.length ? 1 : 0;
  return blocks.filter((b) => KEPT.includes(b.type)).map((b, i) => ({ b, i })).sort((x, y) => rank(x.b) - rank(y.b) || x.i - y.i).map((x) => x.b);
}

// How many blocks the data-saver left out, so the screen can say so.
export function droppedCount(blocks: readonly { type: string }[], on: boolean): number {
  return on ? blocks.filter((b) => !KEPT.includes(b.type)).length : 0;
}

export const DATA_SAVER_KEY = 'ncf.dataSaver';
export type DataSaverState = { on: boolean; source: 'chosen' | 'phone' | 'default' };

// The device's choice ('1' on, '0' off), else the phone's save-data hint, else off.
export function dataSaverState(stored: string | null, saveDataHint: boolean | undefined): DataSaverState {
  if (stored === '1' || stored === '0') return { on: stored === '1', source: 'chosen' };
  if (saveDataHint === true) return { on: true, source: 'phone' };
  return { on: false, source: 'default' };
}

// Pack sizes as families read them: "120 KB", "1.4 MB" (never under 1 KB).
export function sizeText(bytes: number): { n: string; unit: 'KB' | 'MB' } {
  if (bytes >= 1024 * 1024) return { n: (Math.round((bytes / (1024 * 1024)) * 10) / 10).toString(), unit: 'MB' };
  return { n: String(Math.max(1, Math.round(bytes / 1024))), unit: 'KB' };
}
