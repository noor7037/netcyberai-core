// The Draw feature's shared shapes (C513), written by the supervisor before the two build slices start, so the studio
// (one slice) and the templates (the other) meet at one contract. Types and constants only: no code, no data.

// A template the studio opens: an outline the child draws and colours over, never erased by the child's eraser.
export type DrawTemplate = {
  // Stable id, e.g. "c03.evs.frog-life-cycle"; lowercase letters, digits, dots and hyphens.
  id: string;
  // Words shown above the canvas (already in the child's language).
  title: string;
  // One line saying what to do ("Draw and label the four stages").
  task: string;
  // The outline as one SVG document (viewBox set, strokes only, no script, no external reference), drawn over the paper
  // and under the child's strokes' top layer so lines stay visible after colouring.
  outlineSvg: string;
  // The themed colours offered first for this template (hex), 5 to 8 of them.
  palette: readonly string[];
  // Labels the child may place (a word bank), in the child's language; empty when the template has none.
  labels: readonly string[];
  // Where it belongs, for saving on the device and for the tutor.
  subject: string;
  classLevel: number;
  chapterKey: string | null;
  // C517: the guided steps for the youngest (engagement mode), in the child's language; absent: built from the task
  // and labels. And a line of background context shown faintly behind the paper.
  steps?: readonly { text: string; at?: { x: number; y: number } }[];
  context?: string;
};

// What the studio is opened with. No template: the free canvas.
export type StudioOpen = {
  template?: DrawTemplate;
  // Where the child came from, kept with the saved drawing ("free" from the Draw tab).
  from: 'free' | 'lesson' | 'homework';
  subject?: string;
  chapterKey?: string | null;
};

// What the studio tells its host. "done" is the child's own tap on Done for a template (the only thing progress counts);
// nothing here carries a judgement of the drawing.
export type StudioEvent =
  | { t: 'saved'; drawingId: string; templateId: string | null }
  | { t: 'done'; templateId: string }
  | { t: 'sent'; templateId: string | null }
  | { t: 'closed' };

// The daily creation limit's Control setting (new drawings started in a day, per child); the studio reads its number
// from its host as a prop and counts on the device.
export const DRAW_DAILY_SETTING = 'family.draw.daily_creations';
export const DRAW_DAILY_DEFAULT = 12;
