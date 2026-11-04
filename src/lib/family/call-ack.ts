// The tutor's instant reaction (W19-B): the moment the child's words are known, the tutor says one short line back
// ("You asked why the sky is blue. Let's look at it.") while the answer is still being written, so the call never goes
// quiet. Pure and shared: the voice route seals the line for the server voice (the speak route's `call_line`), and the
// phone can make the same line for its own voice. The same question always gets the same line (a hash of the words
// picks the template); different questions get different ones. Hindi in Devanagari.

type Lang = 'en' | 'hi';

const TOPIC_WORDS = 10;

// FNV-1a over the words as heard (lower case, spaces folded): stable across runs, phones and the server.
export function ackHash(text: string): number {
  let h = 0x811c9dc5;
  const s = text.toLowerCase().replace(/\s+/g, ' ').trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const pick = <T>(list: readonly T[], text: string): T => list[ackHash(text) % list.length]!;

// ---- sums --------------------------------------------------------------------------------------------------------

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const OPS: { re: string; en: string; hi: string }[] = [
  { re: String.raw`x|×|\*|times|into|multiplied\s+by|गुणा|गुणे`, en: 'times', hi: 'गुणा' },
  { re: String.raw`\+|plus|add|जोड़|जमा|प्लस|और`, en: 'plus', hi: 'जोड़' },
  { re: String.raw`−|–|-|minus|take\s+away|घटा|माइनस`, en: 'minus', hi: 'घटा' },
  { re: String.raw`÷|/|divided\s+by|by|भाग|बटा`, en: 'divided by', hi: 'भाग' },
];

export function findSum(text: string): { a: string; op: { en: string; hi: string }; b: string } | null {
  for (const op of OPS) {
    const m = new RegExp(String.raw`(?:^|[^\d.])${NUM}\s*(?:${op.re})\s*${NUM}(?![\d])`, 'iu').exec(text);
    if (m) return { a: m[1]!, op, b: m[2]! };
  }
  return null;
}

const SUM: Record<Lang, readonly string[]> = {
  en: ["Let's work out {s}.", 'Okay, {s}. Let’s work it out.', "{s}. Let's solve it step by step.", "Let's find {s} together."],
  hi: ['चलिए {s} निकालते हैं।', 'ठीक है, {s}। चलिए हल करते हैं।', '{s}। चलिए एक-एक कदम हल करते हैं।', 'चलिए साथ में {s} निकालते हैं।'],
};

// ---- English topic -----------------------------------------------------------------------------------------------

// Politeness and filler, taken off the front (and "please", "sir", "ma'am" anywhere).
const EN_LEAD = /^(?:(?:thank you|thanks|hi|hello|hey|okay|ok|so|um+|uh+|and|now|well|teacher|sir|ma'?am|miss|tutor|please|can you|could you|would you|will you|tell me|explain(?: to me)?|i want to know|i wanna know|i would like to know|do you know|i have a question|my question is|i want to ask)\b[\s,:]*)+/i;
const EN_ANYWHERE = /\b(?:please|sir|ma'?am)\b/gi;
const WH = /^(why|how|what|when|where|who|which|whose|whom)\s+(is|are|was|were)\s+(.+)$/i;
const WH_DO = /^(why|how|what|when|where|who|which)\s+(do|does|did|can|could|will|would|should|shall|has|have|had)\s+/i;
const WH_BARE = /^(why|how|what|when|where|who|which|whether|if)\b/i;
const YESNO = /^(is|are|was|were|do|does|did|can|could|will|would|should|has|have|had)\s+/i;
// A last word that is said of the subject ("blue", "formed"): the verb goes before it ("why the sky is blue").
const COMPLEMENT = /^(?:\w+(?:ed|en|wn)|blue|green|red|hot|cold|warm|wet|dry|big|small|round|flat|salty|sweet|sour|bitter|dark|bright|heavy|light|hard|soft|high|low|important|alive|dead|different|same|possible|useful|harmful|necessary|called|made|done|known|seen)$/i;
const TRAILING = /\s+(?:the|a|an|of|and|to|in|on|for|with|from|by)$/i;

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const cut = (s: string) => {
  let out = words(s).slice(0, TOPIC_WORDS).join(' ');
  for (let i = 0; i < 3 && TRAILING.test(out); i++) out = out.replace(TRAILING, '');
  return out;
};

function clean(text: string): string {
  return text
    .replace(/[?!.।]+/g, ' ')
    .replace(/[“”"]/g, '')
    .replace(EN_ANYWHERE, ' ')
    .replace(/\s*,\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type EnTopic = { kind: 'clause' | 'noun' | 'quote'; text: string };

export function englishTopic(text: string): EnTopic | null {
  let s = clean(text);
  for (let i = 0; i < 4; i++) s = s.replace(EN_LEAD, '').trim();
  s = s.replace(/^about\s+/i, '').trim();
  if (!s) return null;
  const wh = WH.exec(s);
  if (wh) {
    const [, q, aux, rest] = wh;
    const r = words(rest!);
    const last = r[r.length - 1]!;
    // "why is the sky blue" → "why the sky is blue"; "what is photosynthesis" → "what photosynthesis is".
    const clause = r.length >= 2 && COMPLEMENT.test(last) && !/^[A-Z]/.test(last) ? [...r.slice(0, -1), aux, last] : [...r, aux];
    return { kind: 'clause', text: cut(`${q!.toLowerCase()} ${clause.join(' ')}`) };
  }
  // "how does a plant make food", "can a fish breathe": said back as the question itself.
  if (WH_DO.test(s) || YESNO.test(s)) return { kind: 'quote', text: cut(s.charAt(0).toLowerCase() + s.slice(1)) };
  if (WH_BARE.test(s)) return { kind: 'clause', text: cut(s.charAt(0).toLowerCase() + s.slice(1)) };
  return { kind: 'noun', text: cut(s) };
}

const EN: Record<EnTopic['kind'], readonly string[]> = {
  clause: ["You asked {t}. Let's look at it.", "So you want to know {t}. Let's find out.", "Good question: {t}. Let's work through it.", "Let's see {t}. Here we go."],
  noun: ["You asked about {t}. Let's look at it.", "{T}. Good topic. Let's find out.", "Let's talk about {t}.", "So, {t}. Let's work through it."],
  quote: ["Good question: {t}? Let's look at it.", "You asked, {t}? Let's find out.", "{T}? Let's work through it.", "Let's see. {T}? Here we go."],
};

// ---- Hindi topic -------------------------------------------------------------------------------------------------

// A Hindi question already reads as what was asked ("आसमान नीला क्यों है"): only politeness and fillers come off.
const HI_LEAD = /^(?:(?:नमस्ते|हैलो|हेलो|अच्छा|ठीक है|तो|सर|मैम|मैडम|दीदी|भैया|जी|कृपया|प्लीज़|प्लीज|मुझे|मुझको|क्या आप|ज़रा|जरा|मेरा सवाल है|मेरा प्रश्न है|मैं जानना चाहता हूँ|मैं जानना चाहती हूँ|मैं जानना चाहता हूं|मैं जानना चाहती हूं)(?:\s+|,|$))+/u;
const HI_TAIL = /(?:^|\s)(?:(?:मुझे\s+)?(?:बताइए|बताइये|बताओ|बताएं|बताएँ|बता दीजिए|बता दो|समझाइए|समझाइये|समझाओ|समझा दीजिए|समझा दो)|कृपया|प्लीज़|प्लीज|सर|मैम|जी)(?=\s|$)/gu;
const HI_TRAILING = /\s+(?:का|की|के|और|को|में|से|पर|ने)$/u;

export function hindiTopic(text: string): string | null {
  let s = clean(text).replace(HI_TAIL, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 4; i++) s = s.replace(HI_LEAD, '').trim();
  if (!s) return null;
  let out = words(s).slice(0, TOPIC_WORDS).join(' ');
  for (let i = 0; i < 3 && HI_TRAILING.test(out); i++) out = out.replace(HI_TRAILING, '');
  return out;
}

const HI: readonly string[] = ['आपने पूछा {t}। चलिए देखते हैं।', 'अच्छा सवाल है, {t}। चलिए समझते हैं।', 'तो आप जानना चाहते हैं {t}। चलिए पता करते हैं।', '{t}, चलिए इसे साथ में समझते हैं।'];

const PLAIN: Record<Lang, string> = { en: "Let's look at it.", hi: 'चलिए देखते हैं।' };

const fillT = (tpl: string, t: string) => tpl.replace('{T}', t.charAt(0).toUpperCase() + t.slice(1)).replace('{t}', t).replace('{s}', t);

// The line, at most a dozen words and one breath: the question's topic said back, or the sum read out.
export function callAck(text: string, lang: Lang): string {
  const sum = findSum(text);
  if (sum) {
    const s = `${sum.a} ${sum.op[lang]} ${sum.b}`;
    return fillT(pick(SUM[lang], text), s);
  }
  if (lang === 'hi') {
    const t = hindiTopic(text);
    return t ? fillT(pick(HI, text), t) : PLAIN.hi;
  }
  const t = englishTopic(text);
  return t ? fillT(pick(EN[t.kind], text), t.text) : PLAIN.en;
}
