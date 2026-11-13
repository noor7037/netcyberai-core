'use client';

import type { ReactNode } from 'react';
import type { Words } from '@/lib/family/fill';
import { FREEHAND_TOOLS, isShape, type SketchTool } from '@/lib/family/sketch';

// The drawing studio's tool bar (C510): one row at the foot of the screen, scrolling sideways on a narrow phone. Each
// control is 44 px, has a label, and says whether it is on. Shapes, Stickers, Colours and Paper open their panel above
// the bar; the rest pick a tool at once.

export type StudioPanel = 'colours' | 'shapes' | 'stickers' | 'paper' | null;

type Props = {
  w: Words;
  tool: SketchTool;
  colour: string;
  panel: StudioPanel;
  disabled?: boolean;
  onTool: (t: SketchTool) => void;
  onPanel: (p: StudioPanel) => void;
  onClear: () => void;
};

const ICON = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const TOOL_BTN = 'fam-press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl';
const ON = 'bg-ink text-white';
const OFF = 'bg-white text-ink ring-1 ring-ink/15';

// One small picture per tool (24 x 24, drawn here).
export const TOOL_ICON: Record<string, string> = {
  pencil: 'M4 20l1-4L16 5l3 3L8 19z M14 7l3 3',
  brush: 'M14 4l6 6-7 7-6-6z M7 11c-3 1-3 5-4 9 4-1 8-1 9-4',
  marker: 'M15 3l6 6-9 9H6v-6z M4 21h8',
  highlighter: 'M9 13l7-9 4 4-9 7z M9 13l-3 3 2 2 3-3 M4 21h9',
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
};

export function ToolIcon({ name, className = 'h-6 w-6' }: { name: string; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} {...ICON}>
      <path d={TOOL_ICON[name]} />
    </svg>
  );
}

export function StudioToolbar({ w, tool, colour, panel, disabled = false, onTool, onPanel, onClear }: Props) {
  const toolButton = (t: SketchTool, label: string) => (
    <button key={t} type="button" data-studio-tool={t} aria-pressed={tool === t} aria-label={label} title={label} disabled={disabled} onClick={() => onTool(t)} className={`${TOOL_BTN} disabled:opacity-50 ${tool === t ? ON : OFF}`}>
      <ToolIcon name={t} />
    </button>
  );
  const panelButton = (p: Exclude<StudioPanel, null>, label: string, icon: ReactNode, on: boolean) => (
    <button
      type="button"
      data-studio-panel={p}
      aria-expanded={panel === p}
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onPanel(panel === p ? null : p)}
      className={`${TOOL_BTN} disabled:opacity-50 ${on || panel === p ? ON : OFF}`}
    >
      {icon}
    </button>
  );
  return (
    <div role="toolbar" aria-label={w['fam.sketch.tools']} data-studio-toolbar className="flex items-center gap-1.5 overflow-x-auto px-2 py-2 [scrollbar-width:none]">
      {FREEHAND_TOOLS.map((t) => toolButton(t, t === 'eraser' ? w['fam.sketch.eraser'] : w[`fam.sketch.tool.${t}`]))}
      {toolButton('fill', w['fam.sketch.tool.fill'])}
      {panelButton('shapes', w['fam.sketch.shapes'], <ToolIcon name={isShape(tool) ? tool : 'star'} />, isShape(tool))}
      {toolButton('text', w['fam.sketch.tool.text'])}
      {panelButton('stickers', w['fam.sketch.stickers'], <ToolIcon name="sticker" />, tool === 'sticker')}
      {panelButton('colours', w['fam.sketch.colours'], <span aria-hidden="true" data-studio-swatch className="h-7 w-7 rounded-full ring-2 ring-white" style={{ backgroundColor: colour, boxShadow: '0 0 0 1px rgba(28,27,26,0.35)' }} />, false)}
      {panelButton('paper', w['fam.sketch.paper'], <ToolIcon name="paper" />, false)}
      <button type="button" data-studio-clear aria-label={w['fam.sketch.clear']} title={w['fam.sketch.clear']} disabled={disabled} onClick={onClear} className={`${TOOL_BTN} disabled:opacity-50 ${OFF}`}>
        <ToolIcon name="clear" />
      </button>
    </div>
  );
}
