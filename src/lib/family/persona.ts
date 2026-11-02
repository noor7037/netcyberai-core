// A tutor's persona (W16-A3): who the tutor is, as one line of the system prompt. Pure, no database. The line is "You are
// <name>, <style>. Speak <language>." and nothing more; the name and the style are cleaned first (one line, no markup, a
// length limit), because a school writes its own tutors' words. The safety check on every answer is unchanged.
export type PersonaLanguage = 'en' | 'hi' | 'both';
export type Persona = { name: string; style: string; language: PersonaLanguage };

export const PERSONA_NAME_MAX = 40;
export const PERSONA_STYLE_MAX = 140;

const oneLine = (v: string, max: number): string =>
  v
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();

export function personaLine(p: Persona): string {
  const name = oneLine(p.name, PERSONA_NAME_MAX);
  const style = oneLine(p.style, PERSONA_STYLE_MAX).replace(/[.\s]+$/, '');
  const speak = p.language === 'en' ? 'English' : p.language === 'hi' ? 'Hindi' : 'the child’s own language';
  return `You are ${name}, ${style}. Speak ${speak}.`;
}
