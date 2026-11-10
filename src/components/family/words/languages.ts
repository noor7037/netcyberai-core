// The languages a word can be translated into: the word-help API's list (src/lib/family/languages.ts, W23-B), in the
// shape the tap menu reads (each language's own name).
import { LANGUAGES, isLangCode, type LangCode } from '@/lib/family/languages';

export const LANGS: readonly { code: LangCode; name: string }[] = LANGUAGES.map((l) => ({ code: l.code, name: l.native }));
export type { LangCode };
export { isLangCode };
