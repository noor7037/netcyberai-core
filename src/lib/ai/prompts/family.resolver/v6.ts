// Prompt v6 of the family.resolver profile (C334): v5 (C323) with one rule more, about quotation marks.
//
// Measured before it (C330's evidence, 2026-10-24): `cbse.c6.science.ch04.t02` ("Poles of Magnet", English) failed every
// preparing run with the explanation and check kept, no block refused, the model stopping by itself, and the scanner
// ending inside an unclosed object, although the answer's last 400 characters closed every block: a double quotation
// mark written inside a text value (a quoted word, such as the name of a pole) ends that value early, and every brace
// after it is read the wrong way round. JSON is never repaired (C321), so the model is asked not to write one.
// Everything else is v5's, word for word.

import { resolverSystem as v5System, resolverUser as v5User } from './v5';
import type { ResolverAsk } from './v3';

export const RESOLVER_PROMPT_VERSION = 'v6';

// v5's line that asks for JSON Lines; the new rule follows it.
export const JSON_LINES_RULE = 'Output ONLY JSON objects, one per line (JSON Lines). No text before, between or after them, no Markdown, no code fences, no HTML.';
export const NO_DOUBLE_QUOTES_RULE =
  "Inside any text value, never write the double quotation mark (\"). To quote a word, use single quotation marks, like 'north pole'. A double quotation mark inside a value breaks the whole line.";

export function resolverSystem(a: ResolverAsk): string {
  return v5System(a).replace(JSON_LINES_RULE, `${JSON_LINES_RULE}\n${NO_DOUBLE_QUOTES_RULE}`);
}

export const resolverUser = v5User;
