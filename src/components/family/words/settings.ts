import { readChildSettings } from '@/lib/family/child-settings';
import { isLangCode, type LangCode } from './languages';

// The child's switches for the tap menu. The fields come from the settings store; a missing field is its default.
export type WordSettings = { tapToRead: boolean; wordHelp: boolean; meaningLang: LangCode | null; autoScroll: boolean };
export const WORD_DEFAULTS: WordSettings = { tapToRead: true, wordHelp: true, meaningLang: null, autoScroll: true };

export function wordSettingsOf(s: unknown): WordSettings {
  const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
  return {
    tapToRead: typeof o.tapToRead === 'boolean' ? o.tapToRead : true,
    wordHelp: typeof o.wordHelp === 'boolean' ? o.wordHelp : true,
    meaningLang: isLangCode(o.meaningLang) ? o.meaningLang : null,
    autoScroll: typeof o.autoScroll === 'boolean' ? o.autoScroll : true,
  };
}

export const readWordSettings = async (): Promise<WordSettings> => wordSettingsOf(await readChildSettings());
