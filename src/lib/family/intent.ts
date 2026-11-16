import type { FamilyChild } from './children';
import { freeWords } from './answer-videos';
import { answerLanguage } from './question-language';
import type { TopicForms } from './resolver';
import { isSubject, type Subject } from './subjects';
import { words } from './videos';
import { cleanEnglish, cleanLocal } from './topic-words';

export { cleanEnglish, cleanLocal };

// What a student asked, in any input language (Noor, 16 Nov 2026). One step turns the typed words (Devanagari Hindi, Hinglish, mixed, English, or
// another app language) into one result that every part of the answer reads: the topic in English and in the child's script (named by the tutor's
// own answer, `topic_en` and `topic_local` of its elaboration block: no extra model call), the subject, the class, the answer language, and the
// search terms for videos, photos, simulations and 3D. The topic key comes from the English term, so "Kachra prabandhan", "कचरा प्रबंधन" and
// "what is waste management" share one key. Without the model's term, the typed words stand in, marked `raw` (romanised or untranslated), so a
// search that found nothing for them is never remembered as empty.

export type ModelTopic = { en?: string | null; local?: string | null };
export type Intent = {
  lang: string | undefined;
  subject: Subject;
  classLevel: number;
  topicEn: string | null;
  topicLocal: string | null;
  typed: string[];
  // The words each search uses: English first, then the child's script, then the typed words.
  termsEn: string[];
  termsLocal: string[];
  key: string | null;
  raw: boolean;
};

const KEY = /^[a-z0-9][a-z0-9._-]{2,119}$/;
const LATIN_WORD = /^[a-z][a-z-]*$/;
const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0)!, 0x01000193) >>> 0;
  return h.toString(36);
};

// A key shared by everyone who asks the same thing: the class and the English term's words, in order.
export function topicKey(classLevel: number, en: string): string | null {
  const slug = words(en).filter((w) => LATIN_WORD.test(w)).join('-').slice(0, 100).replace(/-+$/, '');
  const key = `free.c${Math.max(0, Math.floor(classLevel))}.${slug}`;
  return slug && KEY.test(key) ? key : null;
}

export function intentOf(a: { question: string | null; child: Pick<FamilyChild, 'classLevel' | 'firstName' | 'language'>; subject: Subject | string | null; replyLang?: string | null; model?: ModelTopic | null }): Intent {
  const typed = a.question ? freeWords(a.question, a.child.firstName ?? '') : [];
  const lang = answerLanguage({ replyLang: a.replyLang, language: a.child.language, question: a.question });
  const topicEn = cleanEnglish(a.model?.en);
  const topicLocal = cleanLocal(a.model?.local);
  const subject: Subject = isSubject(a.subject) ? a.subject : 'science';
  const classLevel = Math.max(0, Math.floor(a.child.classLevel));
  let key: string | null = topicEn ? topicKey(classLevel, topicEn) : null;
  // No English term from the tutor: the typed words stand in, as the old key did (their letters, or a hash for another script).
  if (!key && typed.length) {
    const sorted = Array.from(new Set(typed)).sort();
    const latin = sorted.filter((w) => LATIN_WORD.test(w));
    const slug = latin.length === sorted.length ? latin.join('-').slice(0, 100).replace(/-+$/, '') : `h${hash(sorted.join(' '))}`;
    key = KEY.test(`free.c${classLevel}.${slug}`) ? `free.c${classLevel}.${slug}` : null;
  }
  const raw = !topicEn;
  return {
    lang, subject, classLevel, topicEn, topicLocal, typed,
    termsEn: topicEn ? [topicEn, ...typed.filter((w) => LATIN_WORD.test(w) && !topicEn.includes(w))] : typed.filter((w) => LATIN_WORD.test(w)),
    termsLocal: topicLocal ? [topicLocal] : [],
    key, raw,
  };
}

// The topic line for the videos of a typed question no catalog line named, from the intent; null when nothing can be named.
export function intentLine(i: Intent): { subject: Subject; key: string; chapterEn: string; topicEn: string | null; title: string; forms: TopicForms } | null {
  if (!i.key) return null;
  const en = i.topicEn;
  const title = en ?? i.typed.join(' ');
  if (!title.trim()) return null;
  return { subject: i.subject, key: i.key, chapterEn: title, topicEn: title, title: i.topicLocal ?? title, forms: { en, local: i.topicLocal, typed: i.typed, raw: i.raw } };
}
