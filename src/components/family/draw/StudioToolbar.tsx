'use client';

import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { Words } from '@/lib/family/fill';
import { FREEHAND_TOOLS, isShape, type SketchTool } from '@/lib/family/sketch';

// The drawing studio's tool tray (C510; the art table's chunky blocks, C513): one row at the foot of the screen,
// scrolling sideways on a narrow phone. Each control is a 48 px pastel block with a large icon and a label, says whether
// it is on, and rises when chosen (family.css .draw-tool, off under reduced motion). Shapes, Stickers, Colours and Paper
// open their tray above the bar; the rest pick a tool at once. A long press on Colours opens the colour wheel under the
// finger (the studio's `colourHold`); a tap still opens the palette list, which keyboards and screen readers use.

export type StudioPanel = 'colours' | 'shapes' | 'stickers' | 'paper' | null;
type Hold = {
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  // True right after a long press chose a colour: the click that follows must not open the palette as well.
  swallowClick: () => boolean;
};

type Props = {
  w: Words;
  tool: SketchTool;
  colour: string;
  panel: StudioPanel;
  disabled?: boolean;
  onTool: (t: SketchTool) => void;
  onPanel: (p: StudioPanel) => void;
  onClear: () => void;
  // C513: My drawings opens from the tray (the top bar keeps room for Send at 360 px).
  onMine?: () => void;
  colourHold?: Hold;
};

const ICON = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const TOOL_BTN = 'draw-tool fam-press h-12 w-12';
// Each tool's own pastel block (ink icon on it), so the tray reads as a box of art things, not a panel.
const TINT: Record<string, string> = {
  pencil: 'bg-art-coral text-ink',
  brush: 'bg-art-sky text-ink',
  marker: 'bg-art-mint text-ink',
  highlighter: 'bg-art-butter text-ink',
  crayon: 'bg-art-lavender text-ink',
  watercolour: 'bg-art-sky text-ink',
  eraser: 'bg-white text-ink',
  fill: 'bg-art-mint text-ink',
  shapes: 'bg-art-butter text-ink',
  text: 'bg-art-coral text-ink',
  stickers: 'bg-art-lavender text-ink',
  colours: 'bg-white text-ink',
  paper: 'bg-art-table text-ink',
  clear: 'bg-white text-ink',
  mine: 'bg-art-table text-ink',
};

// One picture per tool (24 x 24, drawn here).
export const TOOL_ICON: Record<string, string> = {
  pencil: 'M4 20l1-4L16 5l3 3L8 19z M14 7l3 3',
  brush: 'M14 4l6 6-7 7-6-6z M7 11c-3 1-3 5-4 9 4-1 8-1 9-4',
  marker: 'M15 3l6 6-9 9H6v-6z M4 21h8',
  highlighter: 'M9 13l7-9 4 4-9 7z M9 13l-3 3 2 2 3-3 M4 21h9',
  crayon: 'M6 18l9-9 3 3-9 9H6z M15 9l2-4 4-1-1 4-2 4 M8 16l3 3',
  watercolour: 'M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z M9 15a3 3 0 0 0 3 3',
  eraser: 'M7 20h12M5 14l8-8 6 6-6 6H9z',
  fill: 'M5 11l7-7 7 7-7 7z M19 15c1 2 2 3 2 4a2 2 0 0 1-4 0c0-1 1-2 2-4z',
  line: 'M5 19L19 5',
  rect: 'M4 6h16v12H4z',
  ellipse: 'M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z',
  triangle: 'M12 4l9 16H3z',
  star: 'M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17l-5.6 3 1.3-6.2L3 9.5l6.3-.7z',
  arrow: 'M5 19L19 5 M10 5h9v9',
  text: 'M5 6V4h14v2 M12 4v16 M9 20h6',
  sticker: 'M12 3a9 9 0 1 0 9 9h-6a3 3 0 0 1-3-3z M15 3.5A9 9 0 0 1 20.5 9H15z M9 14c1 1.5 4 1.5 6 0',
  paper: 'M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5',
  clear: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  rotate: 'M20 12a8 8 0 1 1-2.3-5.7 M20 4v5h-5',
  mine: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
};

export function ToolIcon({ name, className = 'h-7 w-7' }: { name: string; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} {...ICON}>
      <path d={TOOL_ICON[name]} />
    </svg>
  );
}

export function StudioToolbar({ w, tool, colour, panel, disabled = false, onTool, onPanel, onClear, onMine, colourHold }: Props) {
  const toolButton = (t: SketchTool, label: string) => (
    <button key={t} type="button" data-studio-tool={t} aria-pressed={tool === t} aria-label={label} title={label} disabled={disabled} onClick={() => onTool(t)} className={`${TOOL_BTN} disabled:opacity-50 ${TINT[t] ?? TINT.eraser}`}>
      <ToolIcon name={t} />
    </button>
  );
  const panelButton = (p: Exclude<StudioPanel, null>, label: string, icon: ReactNode, on: boolean, hold?: Hold) => (
    <button
      type="button"
      data-studio-panel={p}
      aria-expanded={panel === p}
      aria-pressed={on || panel === p}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => {
        if (hold?.swallowClick()) return;
        onPanel(panel === p ? null : p);
      }}
      onPointerDown={hold?.onPointerDown}
      onPointerMove={hold?.onPointerMove}
      onPointerUp={hold?.onPointerUp}
      onPointerCancel={hold?.onPointerCancel}
      onContextMenu={hold ? (e) => e.preventDefault() : undefined}
      style={hold ? { touchAction: 'none' } : undefined}
      className={`${TOOL_BTN} disabled:opacity-50 ${TINT[p]}`}
    >
      {icon}
    </button>
  );
  return (
    <div role="toolbar" aria-label={w['fam.sketch.tools']} data-studio-toolbar className="flex items-center gap-2 overflow-x-auto px-3 pb-2 pt-3 [scrollbar-width:none]">
      {onMine && (
        <button type="button" data-sketch-mine aria-label={w['fam.sketch.mine']} title={w['fam.sketch.mine']} disabled={disabled} onClick={onMine} className={`${TOOL_BTN} disabled:opacity-50 ${TINT.mine}`}>
          <ToolIcon name="mine" />
        </button>
      )}
      {FREEHAND_TOOLS.map((t) => toolButton(t, t === 'eraser' ? w['fam.sketch.eraser'] : w[`fam.sketch.tool.${t}`]))}
      {toolButton('fill', w['fam.sketch.tool.fill'])}
      {panelButton('shapes', w['fam.sketch.shapes'], <ToolIcon name={isShape(tool) ? tool : 'star'} />, isShape(tool))}
      {toolButton('text', w['fam.sketch.tool.text'])}
      {panelButton('stickers', w['fam.sketch.stickers'], <ToolIcon name="sticker" />, tool === 'sticker')}
      {panelButton('colours', w['fam.sketch.colours'], <span aria-hidden="true" data-studio-swatch className="h-8 w-8 rounded-full ring-[3px] ring-white" style={{ backgroundColor: colour, boxShadow: '0 0 0 1px rgba(28,27,26,0.35), 0 2px 6px rgba(28,27,26,0.3)' }} />, false, colourHold)}
      {panelButton('paper', w['fam.sketch.paper'], <ToolIcon name="paper" />, false)}
      <button type="button" data-studio-clear aria-label={w['fam.sketch.clear']} title={w['fam.sketch.clear']} disabled={disabled} onClick={onClear} className={`${TOOL_BTN} disabled:opacity-50 ${TINT.clear}`}>
        <ToolIcon name="clear" />
      </button>
    </div>
  );
}
