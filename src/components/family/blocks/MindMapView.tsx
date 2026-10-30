'use client';

import type { MindMap } from '@/lib/family/blocks';
import { colors, deepColors } from '@/lib/design-tokens';
import type { Words } from '@/lib/family/fill';
import { Card } from './BlockViews';
import { useReducedMotion } from './InteractiveViews';

const BRANCH_DELAY_MS = 300;
// A branch's reveal: CSS only (nca-pop), each branch after the one before; none when still.
const reveal = (moving: boolean, i: number) => (moving ? { animation: `nca-pop 400ms ease-out ${(i + 1) * BRANCH_DELAY_MS}ms both`, transformBox: 'fill-box' as const, transformOrigin: 'center' } : undefined);

// A mind map (W8-AI, resolver v7), drawn by our own code from checked data (src/lib/family/blocks.ts: 2 to 6 branches,
// 0 to 4 leaves, every label up to 40 characters); no library, no markup from the model.
//   - From 480 px: an SVG with the root idea in the centre, the branches in a column either side of it and each
//     branch's leaves beyond it, one logo colour per branch (all carry white text at AA).
//   - Under 480 px (and always for a screen reader): a vertical tree in plain HTML that wraps at any width (390 first).
// W10-6 (docs/39 §5): the map opens branch by branch (300 ms apart, the root first), in the SVG and in the tree alike.
// No motion under prefers-reduced-motion (and the first paint is still): the whole map at once. `still` forces that.

// One colour per branch, in a fixed order: logo tokens that carry white text at AA (design-tokens.ts).
const BRANCH_HEX = [colors.royal, colors.emerald, colors.grape, deepColors.tangerineDeep, deepColors.coralDeep, colors.azure] as const;
// A branch's chip: its colour with white text (each pair AA).
const BRANCH_CHIP = ['bg-royal text-white', 'bg-emerald text-white', 'bg-grape text-white', 'bg-tangerine-deep text-white', 'bg-coral-deep text-white', 'bg-azure text-white'] as const;
const BRANCH_RING = ['border-royal', 'border-emerald', 'border-grape', 'border-tangerine-deep', 'border-coral-deep', 'border-azure'] as const;

// The SVG's geometry, drawn about 1:1 in the Family app's column (max-w-xl): the root in the centre column, the
// branches in a column either side, each branch's leaves beyond it (stacked under it, at the outer edge, on a spine).
const W = 520;
const COL_W = 160;
const ROOT_W = 140;
const LEAF_W = 145;
const LINE_H = 15;
const PAD = 12;
const GAP = 8;
const GROUP_GAP = 18;
const CHARS = 18;

// A label in at most three lines of about `chars` characters, broken at spaces (a longer word gets its own line).
export function wrapLabel(text: string, chars = CHARS): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && `${line} ${word}`.length > chars) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

const boxH = (lines: number) => PAD + lines * LINE_H + 4;

type Placed = { x: number; y: number; w: number; h: number; lines: string[] };

export function placeMindMap(b: MindMap) {
  // Branches alternate right and left, so the two sides stay about the same height.
  const groups = b.branches.map((br, i) => {
    const label = wrapLabel(br.label);
    const leaves = br.leaves.map((l) => wrapLabel(l));
    const h = boxH(label.length) + leaves.reduce((n, l) => n + GAP + boxH(l.length), 0);
    return { right: i % 2 === 0, label, leaves, h };
  });
  const sideH = (right: boolean) => Math.max(0, groups.filter((g) => g.right === right).reduce((n, g) => n + g.h + GROUP_GAP, 0) - GROUP_GAP);
  const rootLines = wrapLabel(b.root, 16);
  const H = Math.max(sideH(true), sideH(false), boxH(rootLines.length)) + 24;
  const root: Placed = { x: W / 2 - ROOT_W / 2, y: H / 2 - boxH(rootLines.length) / 2, w: ROOT_W, h: boxH(rootLines.length), lines: rootLines };
  const next = { right: (H - sideH(true)) / 2, left: (H - sideH(false)) / 2 };
  const branches = groups.map((g) => {
    let y = g.right ? next.right : next.left;
    const box: Placed = { x: g.right ? W - COL_W : 0, y, w: COL_W, h: boxH(g.label.length), lines: g.label };
    y += box.h;
    const leaves = g.leaves.map((lines) => {
      const p: Placed = { x: g.right ? W - LEAF_W : 0, y: y + GAP, w: LEAF_W, h: boxH(lines.length), lines };
      y = p.y + p.h;
      return p;
    });
    if (g.right) next.right += g.h + GROUP_GAP;
    else next.left += g.h + GROUP_GAP;
    return { box, leaves, right: g.right };
  });
  return { W, H, root, branches };
}

// A soft S-curve from one box's side to another's.
function curve(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  return ['M', x1, y1, 'C', mx, y1, mx, y2, x2, y2].join(' ');
}

function BoxText({ p, fill, bold }: { p: Placed; fill: string; bold?: boolean }) {
  const first = p.y + p.h / 2 - ((p.lines.length - 1) * LINE_H) / 2 + 4;
  return (
    <text x={p.x + p.w / 2} textAnchor="middle" fontSize="13" fontWeight={bold ? 800 : 600} fill={fill}>
      {p.lines.map((l, i) => (
        <tspan key={i} x={p.x + p.w / 2} y={first + i * LINE_H}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

export function MindMapView({ b, w, tone, still }: { b: MindMap; w: Words; tone: string; still?: boolean }) {
  const { H, root, branches } = placeMindMap(b);
  const reduced = useReducedMotion();
  const moving = !(still ?? reduced);
  return (
    <Card title={b.title} tone={tone} tag="mind_map">
      <p className="sr-only">{w['fam.block.mindMap']}</p>
      <svg data-mind-map-svg viewBox={`0 0 ${W} ${H}`} className="mx-auto hidden w-full max-w-[520px] min-[480px]:block" aria-hidden="true">
        {branches.map((br, i) => {
          const hex = BRANCH_HEX[i % BRANCH_HEX.length];
          // The leaves hang from a spine on the branch's inner side, each on its own short tick.
          const spineX = br.right ? W - LEAF_W - 10 : LEAF_W + 10;
          const last = br.leaves[br.leaves.length - 1];
          return (
            <g key={i} className={moving ? 'fam-reveal' : undefined} style={reveal(moving, i)}>
              <path d={curve(root.x + (br.right ? root.w : 0), root.y + root.h / 2, br.right ? br.box.x : br.box.x + br.box.w, br.box.y + br.box.h / 2)} fill="none" stroke={hex} strokeWidth="3" />
              {last && <line x1={spineX} y1={br.box.y + br.box.h} x2={spineX} y2={last.y + last.h / 2} stroke={hex} strokeWidth="2" />}
              {br.leaves.map((leaf, k) => (
                <line key={k} x1={spineX} y1={leaf.y + leaf.h / 2} x2={br.right ? leaf.x : leaf.x + leaf.w} y2={leaf.y + leaf.h / 2} stroke={hex} strokeWidth="2" />
              ))}
              <rect x={br.box.x} y={br.box.y} width={br.box.w} height={br.box.h} rx="12" fill={hex} />
              <BoxText p={br.box} fill="#ffffff" bold />
              {br.leaves.map((leaf, k) => (
                <g key={k}>
                  <rect x={leaf.x + 1} y={leaf.y} width={leaf.w - 2} height={leaf.h} rx="10" fill="#ffffff" stroke={hex} strokeWidth="2" />
                  <BoxText p={leaf} fill={colors.slate} />
                </g>
              ))}
            </g>
          );
        })}
        <rect x={root.x} y={root.y} width={root.w} height={root.h} rx="16" fill={colors.violet} />
        <BoxText p={root} fill="#ffffff" bold />
      </svg>
      {/* The same map as a vertical tree: what a phone shows, and what a screen reader reads at every width. */}
      <div data-mind-map-tree className="flex flex-col gap-3 min-[480px]:sr-only">
        <p className="self-start rounded-2xl bg-violet px-4 py-2 text-base font-extrabold text-white">{b.root}</p>
        <ul className="flex flex-col gap-3">
          {b.branches.map((br, i) => (
            <li key={i} className={`ml-3 flex flex-col gap-2 border-l-4 pl-3 ${BRANCH_RING[i % BRANCH_RING.length]} ${moving ? 'fam-reveal' : ''}`} style={reveal(moving, i)}>
              <span className={`self-start rounded-xl px-3 py-1.5 text-sm font-bold ${BRANCH_CHIP[i % BRANCH_CHIP.length]}`}>{br.label}</span>
              {br.leaves.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {br.leaves.map((leaf, k) => (
                    <li key={k} className={`rounded-xl border-2 bg-white px-3 py-1 text-sm text-slate ${BRANCH_RING[i % BRANCH_RING.length]}`}>
                      {leaf}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
