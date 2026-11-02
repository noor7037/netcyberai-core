import type { Board, BoardAxis, BoardColour, BoardLeaf, BoardPoint } from './blocks';

// The board's drawing plan (W16-A2, docs/39 §6): what is on the board at a step, where each thing sits, and which step
// a spoken sentence has reached. Pure, so the view stays small and the call screen (W16-A4) can use the same helpers.

// The picture's units: the 100 by 100 grid, stretched across for a wide board and down for a tall one. Positions and
// lengths along an axis scale with it; a circle's radius and the text scale with the shorter side, so circles stay
// round and the words keep their size.
export function boardFrame(b: Pick<Board, 'width'>): { W: number; H: number; sx: number; sy: number; s: number } {
  const W = b.width === 'wide' ? 160 : 100;
  const H = b.width === 'tall' ? 140 : 100;
  return { W, H, sx: W / 100, sy: H / 100, s: 1 };
}

// One drawn thing: the command, the step that drew it, its colour (its own, else its group's, else ink).
export type BoardItem = { cmd: BoardLeaf; step: number; colour: BoardColour; key: string; group?: string };

// What the board shows once step `cursor` is reached (steps are numbered 1, 2, 3 by the checker): every command of the
// steps up to it, less what an erase up to it took away (an erase of a group takes the whole group).
export function boardItems(b: Board, cursor: number): BoardItem[] {
  const items: BoardItem[] = [];
  const erased = new Set<string>();
  for (const step of b.steps) {
    if (step.n > cursor) break;
    step.commands.forEach((c, i) => {
      if (c.kind === 'group') {
        c.commands.forEach((leaf, j) => {
          if (leaf.kind === 'erase') erased.add(leaf.target);
          else items.push({ cmd: leaf, step: step.n, colour: ('colour' in leaf && leaf.colour) || c.colour || 'ink', key: `${step.n}.${i}.${j}`, ...(c.id ? { group: c.id } : {}) });
        });
      } else if (c.kind === 'erase') erased.add(c.target);
      else items.push({ cmd: c, step: step.n, colour: ('colour' in c && c.colour) || 'ink', key: `${step.n}.${i}` });
    });
  }
  return items.filter((x) => !(x.group && erased.has(x.group)) && !('id' in x.cmd && x.cmd.id && erased.has(x.cmd.id)));
}

// The axes drawn up to a step, by id (a graph finds its axis here).
export function boardAxes(b: Board): Map<string, BoardAxis> {
  const out = new Map<string, BoardAxis>();
  for (const s of b.steps) for (const c of s.commands) for (const leaf of c.kind === 'group' ? c.commands : [c]) if (leaf.kind === 'axis' && leaf.id) out.set(leaf.id, leaf);
  return out;
}

// A point of an axis' own numbers, on the grid.
export function onAxis(axis: BoardAxis, p: BoardPoint): BoardPoint {
  const [x0, x1] = axis.x;
  const [y0, y1] = axis.y;
  return [axis.at[0] + ((p[0] - x0) / (x1 - x0)) * axis.w, axis.at[1] - ((p[1] - y0) / (y1 - y0)) * axis.h];
}

// The text size on the grid (the view draws it at this size, in grid units).
export const BOARD_TEXT = { small: 3.4, normal: 4.2, big: 5.6, label: 3.8, equation: 4.8 } as const;
const CHAR_W = 0.55;

// A command's box on the grid (x, y, w, h), for a highlight that names it. Text is measured at about half its size a
// character, so the ring is near enough; nothing depends on it but the ring.
export function boardBox(c: BoardLeaf, axes: Map<string, BoardAxis>): { x: number; y: number; w: number; h: number } | null {
  const span = (pts: BoardPoint[]) => {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  switch (c.kind) {
    case 'shape':
      if (c.shape === 'rect') return { x: c.at[0], y: c.at[1], w: c.w, h: c.h };
      if (c.shape === 'circle') return { x: c.at[0] - c.r, y: c.at[1] - c.r, w: c.r * 2, h: c.r * 2 };
      if (c.shape === 'ellipse') return { x: c.at[0] - c.rx, y: c.at[1] - c.ry, w: c.rx * 2, h: c.ry * 2 };
      if (c.shape === 'triangle') return span(c.points);
      return span([c.from, c.to]);
    case 'arrow':
      return span([c.from, c.to]);
    case 'label':
    case 'text':
    case 'equation': {
      const size = c.kind === 'label' ? BOARD_TEXT.label : c.kind === 'equation' ? BOARD_TEXT.equation : BOARD_TEXT[c.size ?? 'normal'];
      return { x: c.at[0], y: c.at[1] - size, w: Math.min(100 - c.at[0], c.text.length * size * CHAR_W), h: size * 1.3 };
    }
    case 'axis':
      return { x: c.at[0], y: c.at[1] - c.h, w: c.w, h: c.h };
    case 'graph': {
      const axis = axes.get(c.axis);
      return axis ? span(c.points.map((p) => onAxis(axis, p))) : null;
    }
    case 'point':
      // With its label beside it, so a ring round the point never crosses its name.
      return { x: c.at[0] - 1.5, y: c.at[1] - (c.label ? BOARD_TEXT.label : 1.5), w: 3 + (c.label ? 1 + c.label.length * BOARD_TEXT.label * CHAR_W : 0), h: c.label ? BOARD_TEXT.label + 1.5 : 3 };
    case 'highlight':
      return c.at && c.w !== undefined && c.h !== undefined ? { x: c.at[0], y: c.at[1], w: c.w, h: c.h } : null;
    default:
      return null;
  }
}

// The step a sentence has reached (W16-A4 passes the index of the sentence being spoken, from 0). Prompt v9 writes each
// step's `say` as one sentence of the explanation, in order, so the k-th step with a say line is drawn on the k-th
// sentence; a step without one comes with the step before it (or with the first). Past the last say line, the last
// step. No say line at all: one step a sentence. Returns the step number to draw up to (1 at the least).
export function boardCursorFromSentence(say: readonly (string | undefined | null)[], sentenceIndex: number): number {
  const total = say.length;
  if (total === 0) return 1;
  const i = Math.max(0, Math.floor(Number.isFinite(sentenceIndex) ? sentenceIndex : 0));
  const said = say.map((s, k) => (s && s.trim() ? k : -1)).filter((k) => k >= 0);
  if (said.length === 0) return Math.min(total, i + 1);
  const at = said[Math.min(i, said.length - 1)];
  // The steps after it, up to the next step with a say line, come with it.
  let end = at;
  while (end + 1 < total && !(say[end + 1] && say[end + 1]!.trim())) end++;
  return end + 1;
}

// The box round what an id names on the board drawn so far: one command, or every command of a group. null: nothing
// with that id is on the board (it was erased, or is not drawn yet).
export function targetBox(items: readonly BoardItem[], id: string, axes: Map<string, BoardAxis>): { x: number; y: number; w: number; h: number } | null {
  const boxes = items
    .filter((x) => x.group === id || ('id' in x.cmd && x.cmd.id === id))
    .map((x) => boardBox(x.cmd, axes))
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (boxes.length === 0) return null;
  const x = Math.min(...boxes.map((q) => q.x));
  const y = Math.min(...boxes.map((q) => q.y));
  return { x, y, w: Math.max(...boxes.map((q) => q.x + q.w)) - x, h: Math.max(...boxes.map((q) => q.y + q.h)) - y };
}
