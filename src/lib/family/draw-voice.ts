// The Draw guide's server voice line (C519). A phone with no voice of its own for the child's language asks the server
// to read one step of a template. The phone sends the template id, the step's place and the language, never the words:
// the server builds the words here, from the template manifest it already holds, the same way the phone builds the
// guide (draw-engage.ts guidedSteps), so it is no open text-to-speech.
import { drawTemplate } from './draw-templates';

export type DrawVoiceLang = 'en' | 'hi';

// The two fixed lines the guide adds around a template's own steps (the same words as fam.draw.g.colourIt and
// fam.draw.g.finish; a test keeps them equal).
export const DRAW_GUIDE_LINES: Record<DrawVoiceLang, { colourIt: string; finish: string }> = {
  en: { colourIt: 'Now colour the {word}.', finish: 'All done! Tap Done.' },
  hi: { colourIt: 'अब {word} में रंग भरो।', finish: 'हो गया! अब ‘हो गया’ दबाओ।' },
};

// The words of step `step` of a template in a language, or null when there is no such template or step.
export function drawStepText(templateId: string, step: number, lang: DrawVoiceLang): string | null {
  const t = drawTemplate(templateId);
  if (!t || !Number.isInteger(step) || step < 0) return null;
  const lines = DRAW_GUIDE_LINES[lang];
  const own = t.steps && t.steps.length > 0 ? t.steps.map((s) => s[lang]) : [t.task[lang], ...t.labels[lang].slice(0, 5).map((word) => lines.colourIt.replace('{word}', word))];
  const all = [...own, lines.finish];
  return all[step] ?? null;
}
