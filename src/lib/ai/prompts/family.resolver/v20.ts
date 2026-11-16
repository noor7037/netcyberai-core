// Prompt v20 of the family.resolver profile (live testing of a Class 3 child with a Hindi profile, 16 Nov 2026): v19 with two
// changes, for every class (LKG to 12) and every tutor (maths, science, general). v19 is untouched; Control chooses v20 by name.
//   1. LANGUAGE. Romanised Hindi ("Kachra prabandhan") or Hinglish is Hindi: the whole elaboration block is in Hindi in Devanagari
//      (definition, levels, real life, the task, its hint and answer, the future line, every "say", the checks, and so the photo
//      captions the server copies from the step texts), with English only where the TERMS rule allows. When the language is
//      unclear, the child's profile language is used.
//   2. DEPTH. The depth adapts to the topic: a simple fact takes 1 to 2 sentences a step, a process, a cause or a why question 3
//      to 5, with Intermediate and Advanced richer than Basic. The class band still sets how hard the words are.
// The lines are v19's, rewritten by toV20 (elaboration-prompt.ts), which throws when a line it replaces is missing.

import { resolverSystem as v19System, resolverUser as v19User, isElaboration, type ResolverAsk } from './v19';
import { LANGUAGE_NAMES, languageRule, withLanguage } from './v17';
import { defaultPlan } from '@/lib/ai/teaching/plan-shape';
import { toV20 } from './elaboration-prompt';
import { answerLanguage } from '@/lib/family/question-language';

export const RESOLVER_PROMPT_VERSION = 'v20';
export type { ResolverAsk };

export const ROMAN_HINDI_LINE =
  'LANGUAGE OF THE WHOLE BLOCK: Hindi written in Roman letters (for example "kachra prabandhan") and Hinglish are Hindi: answer in Hindi in Devanagari script. When you cannot tell the language of the question, use the language of the student\'s profile. The definition, the three levels, the real-life scene, the task with its hint and answer, the future line, every "say" and every check are all in that one language; English only for the key school words the language rule allows. Only the "q" photograph words stay in English. WHAT WAS ASKED: whatever the student typed (Hindi in Devanagari, Hindi in Roman letters, mixed Hindi and English, English or another language), first work out the topic they mean, then name it properly in topic_en and topic_local; never copy the typed letters into them.';

// The language the answer is in: what the question was asked in, except that Roman-letter Hindi and Hinglish are Hindi, and a short Latin
// question with no English word in it is the profile language (Hindi for a Hindi profile).
export const elaborationLang = (a: Pick<ResolverAsk, 'replyLang' | 'language' | 'question'>): string | undefined => answerLanguage(a);

export const resolverSystem = (a: ResolverAsk): string => {
  const base = v19System(a);
  if (!isElaboration(a)) return base;
  const lang = elaborationLang(a);
  let out = base;
  if (lang !== a.replyLang) {
    // Swap the language rule v19 put on the first line for the one of the language this question really is.
    const old = languageRule(a);
    const rule = languageRule({ replyLang: lang, motherTongue: a.motherTongue });
    if (rule && old) {
      const nl = out.indexOf('\n');
      const first = (nl < 0 ? out : out.slice(0, nl)).replace(old, rule);
      out = first + (nl < 0 ? '' : out.slice(nl));
    } else if (rule) out = withLanguage(out, rule);
  }
  const band = (a.plan ?? defaultPlan({ classLevel: a.classLevel, subject: a.subject, lang: a.language === 'hi' ? 'hi' : 'en', elaborate: true }, 'medium')).band;
  out = toV20(out, band);
  const at = out.indexOf('\nRules: ');
  const extra = `${ROMAN_HINDI_LINE}${lang && LANGUAGE_NAMES[lang] ? ` The answer language here is ${LANGUAGE_NAMES[lang]}.` : ''}`;
  return at < 0 ? `${out}\n${extra}` : `${out.slice(0, at)}\n${extra}${out.slice(at)}`;
};

export const resolverUser = v19User;
