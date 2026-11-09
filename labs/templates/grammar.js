// Template: Sentence workshop. Build, tag, change, punctuate, fix and join sentences in English, Hindi and Sanskrit.
// Six modes, one engine. build: tap word tiles into order. tag: pick a part of speech (or a Sanskrit case) and tap the
// words that have that job. transform / punctuate / fix / combine: rewrite the sentence, with word tiles when the lab
// gives `words`, otherwise by typing (with punctuation keys). Answers are the lab's own; the template compares
// normalised text (spaces, quotes and, for punctuate and fix, capital letters) and always shows the rule.
// Domain rules in code: the tag sets of each language, what each tag means, and a closed-class word list (articles,
// pronouns, conjunctions, interjections, Hindi case markers, Sanskrit avyayas) so a config cannot tag "the" as a noun.
// Config:
//   { mode: 'build'|'tag'|'transform'|'punctuate'|'fix'|'combine', lang: 'en'|'hi'|'sa',
//     items: [{ id, words?: [string], sentence?: string, answer: string | [string], tags?: [string], rule: {en,hi},
//               task?: {en,hi} }] (2-8), tagset?: [tag ids] }
(function () {
  const { esc, tx } = window.NCA_LIB;
  const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
  const DEV = /[ऀ-ॿ]/;
  const LAT = /[A-Za-z]/;
  const MODES = ['build', 'tag', 'transform', 'punctuate', 'fix', 'combine'];
  const LANGS = ['en', 'hi', 'sa'];
  const T2 = (en, hi) => ({ en, hi });
  const isBi = (x) => x && typeof x === 'object' && typeof x.en === 'string' && typeof x.hi === 'string' && x.en.trim() && x.hi.trim();

  // ---------------------------------------------------------------- tags (parts of speech and Sanskrit cases)
  // g: the language of the id. c/t: fill and text colour (logo colours; white only on the dark ones).
  const W = '#FFFFFF', D = '#1E293B';
  const TAGS = {
    noun: { g: 'en', c: '#1D4ED8', t: W, en: 'noun', hi: 'संज्ञा', d: T2('names a person, place, animal or thing', 'व्यक्ति, स्थान, प्राणी या वस्तु का नाम बताता है') },
    pronoun: { g: 'en', c: '#8B3DFF', t: W, en: 'pronoun', hi: 'सर्वनाम', d: T2('stands in place of a noun', 'संज्ञा की जगह आता है') },
    verb: { g: 'en', c: '#0F766E', t: W, en: 'verb', hi: 'क्रिया', d: T2('tells what someone does or is', 'काम करना या होना बताता है') },
    adjective: { g: 'en', c: '#FF7A1A', t: D, en: 'adjective', hi: 'विशेषण', d: T2('tells more about a noun', 'संज्ञा के बारे में और बताता है') },
    adverb: { g: 'en', c: '#FF6B57', t: D, en: 'adverb', hi: 'क्रियाविशेषण', d: T2('tells how, when or where something happens', 'काम कैसे, कब या कहाँ हुआ, यह बताता है') },
    preposition: { g: 'en', c: '#02CFF9', t: D, en: 'preposition', hi: 'संबंधबोधक', d: T2('shows how a noun is related to another word (in, on, under)', 'संज्ञा का दूसरे शब्द से संबंध या स्थान बताता है (in, on, under)') },
    conjunction: { g: 'en', c: '#FFD23F', t: D, en: 'conjunction', hi: 'समुच्चयबोधक', d: T2('joins words or sentences (and, but, or)', 'शब्दों या वाक्यों को जोड़ता है (and, but, or)') },
    interjection: { g: 'en', c: '#4400F0', t: W, en: 'interjection', hi: 'विस्मयादिबोधक', d: T2('shows a sudden feeling (Wow! Oh!)', 'अचानक भाव दिखाता है (Wow! Oh!)') },
    article: { g: 'en', c: '#22C55E', t: D, en: 'article', hi: 'आर्टिकल', d: T2('a, an, the: comes before a noun', 'a, an, the: संज्ञा से पहले आता है') },
    'संज्ञा': { g: 'hi', c: '#1D4ED8', t: W, en: 'noun', hi: 'संज्ञा', d: T2('names a person, place, animal or thing', 'व्यक्ति, स्थान, प्राणी या वस्तु का नाम') },
    'सर्वनाम': { g: 'hi', c: '#8B3DFF', t: W, en: 'pronoun', hi: 'सर्वनाम', d: T2('stands in place of a noun', 'संज्ञा की जगह आता है') },
    'क्रिया': { g: 'hi', c: '#0F766E', t: W, en: 'verb', hi: 'क्रिया', d: T2('tells what someone does or is', 'काम करना या होना बताता है') },
    'विशेषण': { g: 'hi', c: '#FF7A1A', t: D, en: 'adjective', hi: 'विशेषण', d: T2('tells more about a noun or pronoun', 'संज्ञा या सर्वनाम की विशेषता बताता है') },
    'क्रियाविशेषण': { g: 'hi', c: '#FF6B57', t: D, en: 'adverb', hi: 'क्रियाविशेषण', d: T2('tells how, when or where a thing is done', 'क्रिया की विशेषता बताता है (कैसे, कब, कहाँ)') },
    'संबंधबोधक': { g: 'hi', c: '#02CFF9', t: D, en: 'relation word', hi: 'संबंधबोधक', d: T2('shows how a noun is related to another word (before, near)', 'संज्ञा का दूसरे शब्द से संबंध बताता है (पहले, पास, बिना)') },
    'समुच्चयबोधक': { g: 'hi', c: '#FFD23F', t: D, en: 'conjunction', hi: 'समुच्चयबोधक', d: T2('joins words or sentences', 'शब्दों या वाक्यों को जोड़ता है') },
    'विस्मयादिबोधक': { g: 'hi', c: '#4400F0', t: W, en: 'interjection', hi: 'विस्मयादिबोधक', d: T2('shows a sudden feeling', 'हर्ष, शोक, आश्चर्य जैसे भाव दिखाता है') },
    'अव्यय': { g: 'hi', c: '#F5B90A', t: D, en: 'avyaya (never changes)', hi: 'अव्यय', d: T2('a word whose form never changes', 'जिस शब्द का रूप कभी नहीं बदलता') },
    'प्रथमा': { g: 'hi', c: '#1D4ED8', t: W, en: 'case 1: doer', hi: 'प्रथमा', d: T2('the doer of the action (subject)', 'काम करने वाला (कर्ता)') },
    'द्वितीया': { g: 'hi', c: '#8B3DFF', t: W, en: 'case 2: object', hi: 'द्वितीया', d: T2('the thing the action is done to (object)', 'जिस पर काम होता है (कर्म)') },
    'तृतीया': { g: 'hi', c: '#0F766E', t: W, en: 'case 3: by, with', hi: 'तृतीया', d: T2('the tool or means: by, with', 'साधन: से, के द्वारा (करण)') },
    'चतुर्थी': { g: 'hi', c: '#FF7A1A', t: D, en: 'case 4: to, for', hi: 'चतुर्थी', d: T2('the receiver: to, for', 'जिसके लिए काम हो: को, के लिए (संप्रदान)') },
    'पञ्चमी': { g: 'hi', c: '#FF6B57', t: D, en: 'case 5: from', hi: 'पञ्चमी', d: T2('the place or thing moved away from: from', 'जिससे अलग हो: से (अपादान)') },
    'षष्ठी': { g: 'hi', c: '#02CFF9', t: D, en: 'case 6: of', hi: 'षष्ठी', d: T2('belonging: of, \'s', 'संबंध: का, की, के (संबंध)') },
    'सप्तमी': { g: 'hi', c: '#FFD23F', t: D, en: 'case 7: in, on', hi: 'सप्तमी', d: T2('the place or time: in, on', 'आधार: में, पर (अधिकरण)') },
    'संबोधन': { g: 'hi', c: '#22C55E', t: D, en: 'calling', hi: 'संबोधन', d: T2('calling someone: O ...!', 'किसी को पुकारना: हे ...!') },
  };
  const BASE = {
    en: ['noun', 'pronoun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'interjection'],
    hi: ['संज्ञा', 'सर्वनाम', 'क्रिया', 'विशेषण', 'क्रियाविशेषण', 'संबंधबोधक', 'समुच्चयबोधक', 'विस्मयादिबोधक'],
    sa: ['संज्ञा', 'सर्वनाम', 'क्रिया', 'विशेषण', 'अव्यय'],
  };
  const CASES = ['प्रथमा', 'द्वितीया', 'तृतीया', 'चतुर्थी', 'पञ्चमी', 'षष्ठी', 'सप्तमी', 'संबोधन'];
  const ALLOWED = {
    en: ['noun', 'pronoun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'interjection', 'article'],
    hi: BASE.hi.concat(['अव्यय']),
    sa: BASE.sa.concat(CASES),
  };
  const defaultTagset = (lang, used) => (lang === 'en' && used.indexOf('article') >= 0 ? BASE.en.concat(['article']) : BASE[lang].slice());

  // ---------------------------------------------------------------- closed-class words (what a config may not contradict)
  // entry: [allowed tags (first is the main one), mustTag]. A word that is always one class must carry it when that
  // class is in the tagset; a word that can be two classes ("in": preposition or adverb) only has to stay inside them.
  const LEX = { en: {}, hi: {}, sa: {} };
  const addLex = (lang, words, allowed, must) => words.split(' ').forEach((w) => { LEX[lang][w] = [allowed, !!must]; });
  addLex('en', 'a an the', ['article', 'adjective'], 1);
  addLex('en', 'i me he him she they them we us you it myself himself herself themselves itself yourself ourselves', ['pronoun'], 1);
  addLex('en', 'who whom whose which what', ['pronoun', 'adjective', 'conjunction']);
  addLex('en', 'oh wow alas hurrah hurray ouch oops hey bravo aha ah hello', ['interjection'], 1);
  addLex('en', 'and but or nor because although though unless whether whereas if', ['conjunction'], 1);
  addLex('en', 'so yet while as since', ['conjunction', 'adverb', 'preposition']);
  addLex('en', 'of with from into onto upon beside between among beneath within without against during under towards toward at', ['preposition'], 1);
  addLex('en', 'in on about above below around along across behind by near over through off up down after before until till for', ['preposition', 'adverb', 'conjunction']);
  addLex('hi', 'मैं हम तुम आप मैंने हमने तुमने आपने उसने उन्होंने इसने मुझे मुझको हमें तुम्हें तुझे उसे उन्हें इसे इन्हें कौन कोई', ['सर्वनाम'], 1);
  addLex('hi', 'वह यह वे ये मेरा मेरी मेरे तुम्हारा तुम्हारी हमारा हमारी उसका उसकी उसके', ['सर्वनाम', 'विशेषण']);
  addLex('hi', 'तथा एवं लेकिन परंतु किंतु मगर अथवा क्योंकि इसलिए कि या', ['समुच्चयबोधक'], 1);
  addLex('hi', 'और', ['समुच्चयबोधक', 'विशेषण', 'क्रियाविशेषण']);
  addLex('hi', 'अरे वाह हाय ओह अहा शाबाश उफ़ ओहो छि', ['विस्मयादिबोधक'], 1);
  addLex('hi', 'है हैं था थी थे थीं हूँ हूं', ['क्रिया'], 1);
  addLex('hi', 'में पर से को ने का की के', [], 1); // case markers (कारक चिह्न): attached helpers, tagged with nothing
  addLex('sa', 'च वा अपि एव तु न इति अत्र तत्र कुत्र यदा तदा सदा इह', ['अव्यय'], 1);
  addLex('sa', 'अहम् त्वम् वयम् यूयम् सः सा तत् एषः एषा एतत्', ['सर्वनाम'].concat(CASES), 1);
  const bare = (w) => String(w).replace(/^[^A-Za-zऀ-ॿ]+|[^A-Za-zऀ-ॿ़]+$/g, '').toLowerCase();

  // ---------------------------------------------------------------- text helpers
  const strip = (s) => String(s || '').normalize('NFC').replace(/[​-‍﻿]/g, '');
  function norm(s, cs) {
    s = strip(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().replace(/\s+([,.;:!?।॥)\]])/g, '$1');
    return cs ? s : s.toLowerCase();
  }
  const answersOf = (it) => (Array.isArray(it.answer) ? it.answer : it.answer == null ? [] : [it.answer]).filter((a) => typeof a === 'string' && a.trim());
  // Can these tiles be placed in some order (each at most once) to spell the target? Returns tile indices or null.
  function partition(words, target) {
    const tgt = norm(target);
    const used = [], out = [];
    const go = () => {
      const cur = norm(out.map((i) => words[i]).join(' '));
      if (cur === tgt) return true;
      if (!tgt.startsWith(cur) || out.length >= words.length) return false;
      for (let i = 0; i < words.length; i++) {
        if (used[i] || !strip(words[i]).trim()) continue;
        used[i] = 1; out.push(i);
        if (go()) return true;
        used[i] = 0; out.pop();
      }
      return false;
    };
    return go() ? out.slice() : null;
  }
  const tokensOf = (it, mode) => (Array.isArray(it.words) && mode === 'tag' ? it.words : String(it.sentence || '').trim().split(/\s+/).filter(Boolean));
  const stripMarks = (s) => strip(s).replace(/[\s,.;:!?"'()\-‘’“”।॥]+/g, '').toLowerCase();

  // ---------------------------------------------------------------- validate / keys
  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object { mode, lang, items }'];
    Object.keys(c).forEach((k) => { if (!['mode', 'lang', 'items', 'tagset'].includes(k)) e.push('unknown key: ' + k + ' (use mode, lang, items, tagset)'); });
    const mode = c.mode, lang = c.lang == null ? 'en' : c.lang;
    if (!MODES.includes(mode)) e.push('mode must be one of ' + MODES.join(', '));
    if (!LANGS.includes(lang)) e.push('lang must be en, hi or sa');
    if (!Array.isArray(c.items) || c.items.length < 2 || c.items.length > 8) { e.push('items: an array of 2 to 8 items'); return e; }
    if (!MODES.includes(mode) || !LANGS.includes(lang)) return e;
    let tagset = null;
    if (c.tagset != null) {
      if (mode !== 'tag') e.push('tagset is only used with mode "tag"');
      else if (!Array.isArray(c.tagset) || c.tagset.length < 2 || c.tagset.length > 12) e.push('tagset: an array of 2 to 12 tags');
      else {
        tagset = c.tagset;
        const seen = new Set();
        c.tagset.forEach((t) => {
          if (!ALLOWED[lang].includes(t)) e.push('tagset: "' + t + '" is not a tag for lang ' + lang + ' (use ' + ALLOWED[lang].join(', ') + ')');
          if (seen.has(t)) e.push('tagset: duplicate tag ' + t);
          seen.add(t);
        });
      }
    }
    const ids = new Set(), usedTags = [];
    c.items.forEach((it, i) => {
      const w = 'items[' + i + ']';
      if (!it || typeof it !== 'object' || Array.isArray(it)) { e.push(w + ': an object { id, answer, rule }'); return; }
      Object.keys(it).forEach((k) => { if (!['id', 'words', 'sentence', 'answer', 'tags', 'rule', 'task'].includes(k)) e.push(w + ': unknown key ' + k); });
      if (typeof it.id !== 'string' || !ID.test(it.id)) e.push(w + ': id must be letters, digits, - or _ (no spaces or colons)');
      else if (ids.has(it.id)) e.push(w + ': duplicate id ' + it.id);
      else ids.add(it.id);
      if (!isBi(it.rule)) e.push(w + ': rule needs both en and hi text');
      else {
        if (it.rule.en.length > 260 || it.rule.hi.length > 320) e.push(w + ': rule is too long for a child (260 characters in English at most)');
        if (!DEV.test(it.rule.hi)) e.push(w + ': the hi rule must be written in Devanagari');
      }
      if (it.task != null) {
        if (!isBi(it.task)) e.push(w + ': task needs both en and hi text');
        else {
          if (it.task.en.length > 140 || it.task.hi.length > 180) e.push(w + ': task is too long (140 characters in English at most)');
          if (!DEV.test(it.task.hi)) e.push(w + ': the hi task must be written in Devanagari');
        }
      }
      if (it.words != null) {
        if (!Array.isArray(it.words) || it.words.length < 2 || it.words.length > 16 || it.words.some((x) => typeof x !== 'string' || !x.trim() || x.length > 24)) e.push(w + ': words: 2 to 16 non-empty strings of 24 characters at most');
      }
      if (it.sentence != null && (typeof it.sentence !== 'string' || !it.sentence.trim() || it.sentence.length > 240)) e.push(w + ': sentence must be a text of 240 characters at most');
      const okWords = Array.isArray(it.words) && it.words.length >= 2 && it.words.length <= 16 && it.words.every((x) => typeof x === 'string' && x.trim());
      const okSent = typeof it.sentence === 'string' && it.sentence.trim();
      const script = (s) => (lang === 'en' ? (LAT.test(s) && !DEV.test(s)) : DEV.test(s));
      // answer(s)
      const ans = answersOf(it);
      const ansRaw = Array.isArray(it.answer) ? it.answer : it.answer == null ? [] : [it.answer];
      if (mode !== 'tag' || it.answer != null) {
        if (!ans.length || ans.length !== ansRaw.length) e.push(w + ': answer must be a text or a list of 1 to 4 texts');
        else if (ans.length > 4) e.push(w + ': at most 4 accepted answers');
        else if (new Set(ans.map((a) => norm(a, mode === 'punctuate' || mode === 'fix'))).size !== ans.length) e.push(w + ': the accepted answers repeat');
        ans.forEach((a) => {
          if (a.length > 240) e.push(w + ': an answer is too long');
          if (!script(a)) e.push(w + ': answers must be written in ' + (lang === 'en' ? 'English (Latin letters)' : 'Devanagari') + ' to match lang "' + lang + '"');
        });
      }
      if (mode === 'tag') {
        if (!okWords && !okSent) { e.push(w + ': a tag item needs a sentence (or words)'); return; }
        if (okWords && okSent && it.words.join(' ') !== it.sentence.trim().replace(/\s+/g, ' ')) e.push(w + ': words and sentence must spell the same sentence');
        const toks = okWords ? it.words : it.sentence.trim().split(/\s+/);
        if (toks.length < 2 || toks.length > 16) e.push(w + ': a tag sentence has 2 to 16 words');
        if (!script(toks.join(' '))) e.push(w + ': the sentence must be written in ' + (lang === 'en' ? 'English' : 'Devanagari') + ' to match lang "' + lang + '"');
        if (!Array.isArray(it.tags) || it.tags.length !== toks.length) { e.push(w + ': tags must be a list with one entry per word (' + toks.length + '); use "" for a word that needs no tag'); return; }
        const used = [];
        it.tags.forEach((t, k) => {
          if (typeof t !== 'string') { e.push(w + ': tags[' + k + '] must be a tag id or ""'); return; }
          if (t && !ALLOWED[lang].includes(t)) e.push(w + ': tags[' + k + '] "' + t + '" is not a tag for lang ' + lang);
          if (t) used.push(t);
        });
        if (!used.length) e.push(w + ': at least one word must carry a tag');
        used.forEach((t) => usedTags.push(t));
        if (tagset) used.forEach((t) => { if (!tagset.includes(t)) e.push(w + ': the tag "' + t + '" is not in the tagset'); });
        const ts = tagset || defaultTagset(lang, used);
        toks.forEach((tok, k) => {
          const lex = LEX[lang][bare(tok)], t = typeof it.tags[k] === 'string' ? it.tags[k] : '';
          if (!lex) return;
          if (t && !lex[0].includes(t)) e.push(w + ': "' + bare(tok) + '" cannot be tagged "' + t + '" (it is ' + (lex[0].length ? lex[0].join(' or ') : 'a case marker and carries no tag') + ')');
          if (!t && lex[1] && lex[0].length && ts.includes(lex[0][0])) e.push(w + ': "' + bare(tok) + '" is a ' + lex[0][0] + ' and must be tagged');
        });
      } else {
        if (mode === 'build') {
          if (!okWords) e.push(w + ': build items need words (the tiles), 2 to 16');
        } else if (!okSent) e.push(w + ': ' + mode + ' items need a sentence');
        else if (!script(it.sentence)) e.push(w + ': the sentence must be written in ' + (lang === 'en' ? 'English' : 'Devanagari') + ' to match lang "' + lang + '"');
        if (it.tags != null) e.push(w + ': tags are only used with mode "tag"');
        if (okWords) {
          const bad = ans.filter((a) => !partition(it.words, a));
          if (bad.length) e.push(w + ': the words cannot spell the answer "' + bad[0] + '" (every answer must be made from the tiles, each used once; punctuation tiles go in words too)');
          if (it.words.length - Math.min.apply(null, ans.map((a) => (partition(it.words, a) || []).length).concat([99])) > 3) e.push(w + ': at most 3 extra tiles beyond the answer');
        }
        if (okSent && ans.length) {
          const s = it.sentence;
          if (mode === 'punctuate') {
            if (ans.some((a) => stripMarks(a) !== stripMarks(s))) e.push(w + ': a punctuate answer must have the same words as the sentence (only capitals and marks change)');
            if (ans.some((a) => norm(a, true) === norm(s, true))) e.push(w + ': the sentence is already punctuated; nothing for the child to do');
          } else if (mode === 'fix') {
            if (ans.some((a) => norm(a, true) === norm(s, true))) e.push(w + ': the sentence has no mistake (it equals an accepted answer)');
          } else if (mode === 'transform' || mode === 'combine') {
            if (ans.some((a) => norm(a) === norm(s))) e.push(w + ': the answer is the same as the sentence');
          }
        }
        if (mode === 'combine' && okSent && !/[.!?।॥].*\S/.test(it.sentence.trim())) e.push(w + ': a combine item needs two or more short sentences in `sentence`');
      }
    });
    return e;
  }

  const MARKS = { en: ['.', ',', '?', '!', ';', ':', "'", '"', '-'], hi: ['।', ',', '?', '!', ';', ':', "'", '"', '-'], sa: ['।', '॥', ',', '?', '!', ':', '-'] };
  function keys(c) {
    const items = c && Array.isArray(c.items) ? c.items.filter((x) => x && typeof x === 'object') : [];
    const mode = c && MODES.includes(c.mode) ? c.mode : 'build', lang = c && LANGS.includes(c.lang) ? c.lang : 'en';
    const targets = items.filter((x) => typeof x.id === 'string').map((x) => 'item:' + x.id).concat(['answer', 'next', 'reset']);
    const events = [];
    items.forEach((x) => { if (typeof x.id === 'string') { if (mode === 'build') events.push('built:' + x.id); if (mode === 'tag') events.push('tagged:' + x.id); } });
    events.push('answered:right', 'answered:wrong', 'done');
    if (mode === 'tag') {
      let used = [];
      items.forEach((x) => { if (Array.isArray(x.tags)) used = used.concat(x.tags.filter((t) => typeof t === 'string' && t)); });
      const ts = Array.isArray(c.tagset) ? c.tagset : defaultTagset(lang, used);
      ts.forEach((t) => targets.push('tag:' + t));
      let n = 0;
      items.forEach((x) => { n = Math.max(n, tokensOf(x, 'tag').length); });
      for (let i = 0; i < n; i++) targets.push('word:' + i);
      targets.push('hear');
    } else {
      let nw = 0, typing = false;
      items.forEach((x) => { if (Array.isArray(x.words)) nw = Math.max(nw, x.words.length); else typing = true; });
      for (let i = 0; i < nw; i++) targets.push('word:' + i);
      if (nw) targets.push('undo', 'clear');
      if (typing) { targets.push('input', 'clear'); MARKS[lang].forEach((m) => targets.push('mark:' + m)); }
      if (mode !== 'build') targets.push('hear');
    }
    targets.push('reveal');
    return { targets: targets.filter((t, i, a) => a.indexOf(t) === i), events };
  }

  // ---------------------------------------------------------------- styles
  const css = `
.gr { --gr-r: 18px; --gr-ink: #1E293B; display: grid; gap: 12px; min-width: 0; font-family: var(--font-body, system-ui, sans-serif); color: var(--ink); }
.gr * { box-sizing: border-box; }
.gr button { font-family: inherit; }
.gr-head { --mc: #14B8A6; position: relative; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: var(--gr-r); color: #fff; overflow: hidden; background: linear-gradient(120deg, #0F766E 0%, #0D9488 45%, #14B8A6 100%); box-shadow: 0 6px 16px rgba(13,148,136,.28); }
.gr-ico { flex: none; width: 48px; height: 48px; border-radius: 14px; background: rgba(255,255,255,.2); display: grid; place-items: center; }
.gr-ico svg { width: 30px; height: 30px; }
.gr-hd { position: relative; z-index: 1; min-width: 0; }
.gr-title { margin: 0; font-family: var(--font-display, inherit); font-weight: 800; font-size: 1.25rem; line-height: 1.15; }
.gr-how { margin: 2px 0 0; font-size: .95rem; line-height: 1.35; opacity: .95; }
.gr-bub { position: absolute; right: 8px; top: 6px; display: flex; gap: 6px; pointer-events: none; }
.gr-bub i { font-style: normal; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; font-family: var(--font-display, inherit); font-weight: 800; background: rgba(255,255,255,.18); animation: gr-float 3.4s ease-in-out infinite; }
.gr-bub i:nth-child(2) { animation-delay: .6s; margin-top: 14px; } .gr-bub i:nth-child(3) { animation-delay: 1.2s; } .gr-bub i:nth-child(4) { animation-delay: 1.8s; margin-top: 12px; }
.gr-steps { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.gr-step { position: relative; width: 44px; height: 44px; border-radius: 50%; border: 2px solid var(--line); border-bottom-width: 4px; background: var(--surface); color: var(--ink); font-family: var(--font-display, inherit); font-weight: 800; font-size: 1.05rem; cursor: pointer; transition: transform .15s; }
.gr-step:hover { transform: translateY(-2px); }
.gr-step[aria-current="true"] { background: #0F766E; border-color: #0B5D57; color: #fff; }
.gr-step.gr-ok { border-color: var(--good); } .gr-step.gr-ok::after { content: '✓'; position: absolute; right: -5px; top: -6px; width: 20px; height: 20px; border-radius: 50%; background: var(--good); color: #fff; font-size: .75rem; line-height: 20px; }
.gr-steps-t { margin-left: auto; font-family: var(--font-display, inherit); font-weight: 700; color: var(--ink-2); font-size: .95rem; }
.gr-paper { position: relative; padding: 16px 14px 16px 22px; border-radius: var(--gr-r); background: #FFFDF5; color: var(--gr-ink); border: 2px solid #E8DFC6; box-shadow: 0 8px 20px rgba(6,18,51,.12), inset 6px 0 0 #FFD23F; display: grid; gap: 14px; min-width: 0; background-image: radial-gradient(#EADFC0 1px, transparent 1.2px); background-size: 18px 18px; }
.gr-task { display: inline-flex; align-items: center; gap: 8px; align-self: start; justify-self: start; max-width: 100%; padding: 7px 14px; border-radius: 999px; background: #0F766E; color: #fff; font-family: var(--font-display, inherit); font-weight: 700; font-size: 1rem; line-height: 1.3; }
.gr-orig { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 14px; background: #fff; border: 2px solid #E8DFC6; }
.gr-orig-l { font-size: .8rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #64748B; display: block; }
.gr-orig-t { margin: 2px 0 0; font-size: 1.3rem; line-height: 1.5; font-weight: 600; overflow-wrap: anywhere; }
.gr-orig > div { flex: 1; min-width: 0; }
.gr-hear { flex: none; width: 44px; height: 44px; border-radius: 50%; border: 2px solid #0F766E; background: #fff; color: #0F766E; cursor: pointer; display: grid; place-items: center; transition: transform .15s, background .15s; }
.gr-hear:hover { background: #E6FFFB; transform: scale(1.06); } .gr-hear svg { width: 22px; height: 22px; }
.gr-line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-height: 68px; padding: 10px; border-radius: 14px; background: #fff; border: 2px dashed #B9C6CF; }
.gr-line-e { color: #64748B; font-size: .95rem; padding: 4px 6px; }
.gr-bank { display: flex; flex-wrap: wrap; gap: 10px; padding: 4px 0; }
.gr-tile { position: relative; min-height: 48px; min-width: 48px; max-width: 100%; padding: 8px 16px; border-radius: 14px; border: 2px solid #0F766E; border-bottom-width: 5px; background: linear-gradient(180deg, #fff, #E6FFFB); color: var(--gr-ink); font-weight: 700; font-size: 1.2rem; line-height: 1.2; cursor: pointer; touch-action: manipulation; transition: transform .15s, box-shadow .15s; box-shadow: 0 3px 8px rgba(6,18,51,.12); overflow-wrap: anywhere; }
.gr-tile:hover { transform: translateY(-2px); }
.gr-tile.gr-in { border-color: #1D4ED8; background: linear-gradient(180deg, #fff, #EAF1FF); animation: gr-pop .3s cubic-bezier(.3,1.6,.5,1); }
.gr-tile.gr-good { border-color: var(--good); background: linear-gradient(180deg, #fff, #E6F9EC); }
.gr-tile.gr-miss { border-color: var(--bad); background: linear-gradient(180deg, #fff, #FDECEC); animation: gr-shake .45s; }
.gr-tile.gr-miss::after { content: '?'; position: absolute; right: -6px; top: -9px; width: 20px; height: 20px; border-radius: 50%; background: var(--bad); color: #fff; font-size: .8rem; line-height: 20px; text-align: center; }
.gr-ghost { min-height: 48px; min-width: 48px; padding: 8px 16px; border-radius: 14px; border: 2px dashed #CBD5DB; color: transparent; font-weight: 700; font-size: 1.2rem; line-height: 1.2; user-select: none; }
.gr-tools { display: flex; gap: 8px; flex-wrap: wrap; }
.gr-mini { min-height: 44px; padding: 8px 14px; border-radius: 12px; border: 2px solid #CBD5DB; border-bottom-width: 4px; background: #fff; color: var(--gr-ink); font-weight: 700; font-size: .95rem; cursor: pointer; }
.gr-mini:hover { border-color: #0F766E; }
.gr-ta { width: 100%; min-height: 110px; padding: 12px 14px; border-radius: 14px; border: 2px solid #B9C6CF; background: #fff; color: var(--gr-ink); font-family: inherit; font-size: 1.3rem; line-height: 1.5; font-weight: 600; resize: vertical; }
.gr-ta:focus { outline: 3px solid #02CFF9; outline-offset: 2px; border-color: #0F766E; }
.gr-ta[readonly] { background: #F0FDF4; border-color: var(--good); }
.gr-marks { display: flex; flex-wrap: wrap; gap: 8px; }
.gr-mk { width: 48px; height: 48px; border-radius: 12px; border: 2px solid #0F766E; border-bottom-width: 4px; background: #fff; color: #0F766E; font-weight: 800; font-size: 1.4rem; cursor: pointer; line-height: 1; }
.gr-mk:hover { background: #E6FFFB; }
.gr-diff { margin: 0; padding: 8px 12px; border-radius: 12px; background: #fff; border: 2px solid #E8DFC6; font-size: 1.15rem; line-height: 1.6; font-weight: 600; overflow-wrap: anywhere; }
.gr-diff mark { background: #FDD9D5; color: #7F1D1D; border-radius: 6px; padding: 0 4px; text-decoration: underline wavy #DC2626; text-underline-offset: 4px; }
.gr-pal { display: flex; flex-wrap: wrap; gap: 8px; }
.gr-tg { --c: #1D4ED8; --tc: #fff; display: inline-flex; align-items: center; gap: 8px; min-height: 48px; padding: 6px 14px 6px 8px; border-radius: 999px; border: 2px solid var(--c); border-bottom-width: 4px; background: #fff; color: var(--gr-ink); font-weight: 700; font-size: 1rem; line-height: 1.15; cursor: pointer; text-align: left; transition: transform .15s; }
.gr-tg i { flex: none; width: 28px; height: 28px; border-radius: 50%; background: var(--c); color: var(--tc); display: grid; place-items: center; font-style: normal; font-size: .8rem; font-weight: 800; }
.gr-tg small { display: block; font-weight: 600; font-size: .75rem; color: #64748B; }
.gr-tg:hover { transform: translateY(-2px); }
.gr-tg[aria-pressed="true"] { background: var(--c); color: var(--tc); box-shadow: 0 0 0 3px rgba(2,207,249,.55), 0 6px 14px rgba(6,18,51,.2); transform: translateY(-2px); }
.gr-tg[aria-pressed="true"] small { color: inherit; opacity: .9; } .gr-tg[aria-pressed="true"] i { background: rgba(255,255,255,.28); color: inherit; }
.gr-def { margin: 0; padding: 8px 12px; border-radius: 12px; background: #E6FFFB; border: 1px solid #99E6DC; color: #0B4F4A; font-size: .95rem; line-height: 1.4; }
.gr-words { display: flex; flex-wrap: wrap; gap: 10px 8px; padding: 6px 0; }
.gr-w { --c: #1D4ED8; --tc: #fff; position: relative; min-height: 56px; padding: 6px 14px; border-radius: 14px; border: 2px solid #B9C6CF; border-bottom-width: 4px; background: #fff; color: var(--gr-ink); cursor: pointer; display: grid; justify-items: center; align-content: center; gap: 1px; transition: transform .15s, background .2s, border-color .2s; touch-action: manipulation; max-width: 100%; }
.gr-w:hover { transform: translateY(-2px); border-color: #0F766E; }
.gr-w b { font-size: 1.25rem; font-weight: 700; line-height: 1.25; overflow-wrap: anywhere; }
.gr-w small { text-align: center; overflow-wrap: anywhere; max-width: 12em; font-size: .72rem; font-weight: 800; letter-spacing: .02em; line-height: 1.1; }
.gr-w.gr-t { background: var(--c); border-color: color-mix(in srgb, var(--c) 70%, #000); color: var(--tc); animation: gr-pop .3s cubic-bezier(.3,1.6,.5,1); }
.gr-w.gr-good::after, .gr-w.gr-bad::after { position: absolute; right: -6px; top: -9px; width: 22px; height: 22px; border-radius: 50%; color: #fff; font-size: .8rem; line-height: 22px; text-align: center; font-weight: 800; }
.gr-w.gr-good::after { content: '✓'; background: var(--good); }
.gr-w.gr-bad { border-color: var(--bad); border-style: dashed; animation: gr-shake .45s; } .gr-w.gr-bad::after { content: '✗'; background: var(--bad); }
.gr-w.gr-bad:not(.gr-t) b { color: var(--bad); }
.gr-w.gr-wave { animation: gr-wave .6s cubic-bezier(.3,1.6,.5,1) both; }
.gr-fb { display: flex; gap: 10px; align-items: flex-start; min-height: 64px; padding: 10px 14px; border-radius: var(--gr-r); background: var(--sunk); border: 1px solid var(--line); line-height: 1.45; }
.gr-fb-i { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; background: var(--royal-t); color: var(--royal); }
.gr-fb-t { min-width: 0; overflow-wrap: anywhere; } .gr-fb-t strong { font-family: var(--font-display, inherit); }
.gr-fb.gr-good { background: var(--good-t); border-color: var(--good); } .gr-fb.gr-good .gr-fb-i { background: var(--good); color: #fff; }
.gr-fb.gr-bad { background: var(--bad-t); border-color: var(--bad); } .gr-fb.gr-bad .gr-fb-i { background: var(--bad); color: #fff; }
.gr-fb.gr-win { background: var(--sun-t); border-color: var(--sun); } .gr-fb.gr-win .gr-fb-i { background: var(--sun); color: #1E293B; }
.gr-rule { display: block; margin-top: 6px; padding: 6px 10px; border-left: 4px solid #14B8A6; background: rgba(20,184,166,.12); border-radius: 0 8px 8px 0; }
.gr-act { display: flex; flex-wrap: wrap; gap: 10px; }
.gr-btn { min-height: 52px; min-width: 130px; padding: 10px 22px; border-radius: 14px; border: 2px solid var(--line); border-bottom-width: 4px; background: var(--surface); color: var(--ink); font-family: var(--font-display, inherit); font-weight: 800; font-size: 1.1rem; cursor: pointer; transition: transform .15s; }
.gr-btn:hover { transform: translateY(-2px); }
.gr-btn.gr-main { background: linear-gradient(180deg, #14B8A6, #0F766E); border-color: #0B5D57; color: #fff; }
.gr-btn.gr-go { background: linear-gradient(180deg, #2563EB, #1D4ED8); border-color: #1E3A8A; color: #fff; animation: gr-pulse 1.6s ease-in-out infinite; }
.gr-btn[disabled] { opacity: .45; cursor: default; transform: none; }
.gr button:focus-visible, .gr textarea:focus-visible { outline: 3px solid var(--cyan, #02CFF9); outline-offset: 2px; }
@keyframes gr-pop { 0% { transform: scale(.7); } 100% { transform: scale(1); } }
@keyframes gr-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-7px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(2px); } }
@keyframes gr-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes gr-wave { 0% { transform: translateY(0); } 40% { transform: translateY(-12px) scale(1.06); } 100% { transform: translateY(0); } }
@keyframes gr-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(37,99,235,.45); } 50% { box-shadow: 0 0 0 7px rgba(37,99,235,0); } }
@media (prefers-reduced-motion: reduce) { .gr *, .gr *::before, .gr *::after { animation: none !important; transition: none !important; } }
@media (max-width: 420px) { .gr-bub { display: none; } .gr-title { font-size: 1.1rem; } .gr-paper { padding: 14px 10px 14px 18px; } .gr-btn { flex: 1; min-width: 0; padding-inline: 12px; } .gr-orig-t { font-size: 1.2rem; } .gr-tile { padding-inline: 12px; } .gr-w { padding-inline: 10px; } }
`;

  // ---------------------------------------------------------------- the lab
  const ICON = {
    build: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="12" width="12" height="9" rx="3" fill="#FFD23F"/><rect x="15" y="12" width="11" height="9" rx="3" fill="#FF7A1A"/><rect x="8" y="3" width="13" height="8" rx="3" fill="#02CFF9"/><rect x="4" y="24" width="24" height="4" rx="2" fill="#fff" opacity=".7"/></svg>',
    tag: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 5h14l12 12-11 11L3 16z" fill="#FFD23F"/><circle cx="10" cy="11" r="2.6" fill="#0F766E"/></svg>',
    transform: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 12a10 10 0 0 1 17-5l3-3v9h-9l3-3a6 6 0 0 0-10 2z" fill="#FFD23F"/><path d="M27 20a10 10 0 0 1-17 5l-3 3v-9h9l-3 3a6 6 0 0 0 10-2z" fill="#02CFF9"/></svg>',
    punctuate: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="8" cy="23" r="3.4" fill="#FFD23F"/><path d="M12 22c0 5-2 7-5 8" stroke="#FFD23F" stroke-width="2.4" fill="none" stroke-linecap="round"/><rect x="17" y="4" width="5" height="15" rx="2.5" fill="#02CFF9"/><circle cx="19.5" cy="25" r="3" fill="#02CFF9"/></svg>',
    fix: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 27l3-9L22 4l6 6L14 24z" fill="#FFD23F"/><path d="M22 4l6 6 2-2a2.8 2.8 0 0 0 0-4l-2-2a2.8 2.8 0 0 0-4 0z" fill="#FF6B57"/><path d="M5 27l3-9 6 6z" fill="#fff"/></svg>',
    combine: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="6" width="12" height="8" rx="3" fill="#02CFF9"/><rect x="2" y="18" width="12" height="8" rx="3" fill="#FFD23F"/><path d="M16 10h4q4 0 4 4v4q0 4-4 4h-4" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M24 14h5" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>',
  };
  const GLYPH = ['●', '▲', '■', '◆', '★', '♥', '✚', '⬟', '⬢', '☗', '◐', '✿'];
  const SPEAKER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
  const MODE_TITLE = {
    build: T2('Build the sentence', 'वाक्य बनाओ'), tag: T2('Tag the words', 'शब्दों को पहचानो'), transform: T2('Change the sentence', 'वाक्य बदलो'),
    punctuate: T2('Add the punctuation', 'विराम चिह्न लगाओ'), fix: T2('Fix the mistake', 'ग़लती सुधारो'), combine: T2('Join the sentences', 'वाक्य जोड़ो'),
  };
  const BUBBLES = { en: ['.', ',', '?', '!'], hi: ['।', ',', '?', '!'], sa: ['।', ',', '?', '॥'] };

  function mount(root, config, api) {
    const mode = config.mode, lang = config.lang || 'en';
    const cs = mode === 'punctuate' || mode === 'fix';
    const spk = lang === 'en' ? 'en' : 'hi';
    const T = (en, hi) => api.t({ en, hi });
    const L = () => api.lang();
    const items = config.items.map((it) => {
      const answers = answersOf(it);
      const tile = mode !== 'tag' && Array.isArray(it.words);
      const tokens = mode === 'tag' ? tokensOf(it, 'tag') : null;
      const o = { id: it.id, raw: it, answers, tile, tokens, atags: mode === 'tag' ? it.tags.slice() : null, words: it.words, sentence: it.sentence || '', rule: it.rule, task: it.task };
      if (tile) o.order = shuffleTiles(it.words, answers, it.id);
      return o;
    });
    const used = [];
    items.forEach((it) => { if (it.atags) it.atags.forEach((t) => { if (t) used.push(t); }); });
    const tagset = mode === 'tag' ? (Array.isArray(config.tagset) ? config.tagset : defaultTagset(lang, used)) : [];
    const S = {};
    const freshItem = (it) => ({ chosen: [], tags: it.tokens ? it.tokens.map(() => '') : [], text: !it.tile && (mode === 'punctuate' || mode === 'fix' || mode === 'transform') ? it.sentence : '', tries: 0, solved: false, revealed: false, first: false, bad: null, mark: null, diff: null, msg: null });
    items.forEach((it) => { S[it.id] = freshItem(it); });
    let cur = 0, sel = null, popId = null, destroyed = false, doneSent = false, timers = [];

    function shuffleTiles(words, answers, id) {
      let seed = 11;
      for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
      let ord = words.map((_, i) => i);
      for (let tryN = 0; tryN < 8; tryN++) {
        ord = words.map((_, i) => i);
        for (let i = ord.length - 1; i > 0; i--) { seed = (seed * 1664525 + 1013904223) >>> 0; const j = seed % (i + 1); const t = ord[i]; ord[i] = ord[j]; ord[j] = t; }
        const joined = norm(ord.map((i) => words[i]).join(' '));
        if (!answers.some((a) => norm(a) === joined)) break;
      }
      return ord;
    }
    const finished = (it) => S[it.id].solved || S[it.id].revealed;
    const allFinished = () => items.every(finished);
    const tagLabel = (t) => {
      const g = TAGS[t], ui = L();
      if (g.g === 'en') return { main: ui === 'hi' ? g.hi : g.en, sub: ui === 'hi' ? g.en : '' };
      return { main: t, sub: ui === 'en' ? g.en : '' };
    };
    const speakText = (it) => (mode === 'tag' ? it.tokens.join(' ') : it.answers[0]);

    // ------------------------------------------------------------ render
    function ruleHTML(it) { return `<span class="gr-rule"><strong>${esc(T('Rule:', 'नियम:'))}</strong> ${esc(tx(it.rule, L()))}</span>`; }
    function msgBox(s) {
      const m = s.msg;
      const icon = !m ? '?' : m.kind === 'good' ? '✓' : m.kind === 'bad' ? '✗' : m.kind === 'win' ? '★' : 'i';
      const first = mode === 'build' ? T('Tap the words in order, then press Check.', 'शब्दों को क्रम से छुओ, फिर जाँचो दबाओ।')
        : mode === 'tag' ? T('Pick a tag, tap the words, then press Check.', 'एक टैग चुनो, शब्द छुओ, फिर जाँचो दबाओ।')
        : T('Write your answer, then press Check.', 'अपना उत्तर लिखो, फिर जाँचो दबाओ।');
      return `<div class="gr-fb ${m ? 'gr-' + m.kind : ''}" role="status" aria-live="polite"><span class="gr-fb-i" aria-hidden="true">${icon}</span><div class="gr-fb-t">${m ? m.html : esc(first)}</div></div>`;
    }
    function howText() {
      const it = items[cur];
      if (mode === 'build') return T('Tap the words in the right order to make a correct sentence.', 'शब्दों को सही क्रम में छुओ और सही वाक्य बनाओ।');
      if (mode === 'tag') return T('Pick a tag, then tap every word that has that job.', 'एक टैग चुनो, फिर उस काम वाले हर शब्द को छुओ।');
      const how = it.tile ? T('Tap the words to write your answer.', 'शब्द छूकर अपना उत्तर बनाओ।') : T('Edit the sentence in the box.', 'डिब्बे में वाक्य को ठीक करो।');
      return how;
    }
    function defaultTask() {
      if (mode === 'transform') return T('Change the sentence the way your lesson shows.', 'पाठ की तरह वाक्य को बदलो।');
      if (mode === 'punctuate') return lang === 'en' ? T('Add capital letters and punctuation marks.', 'बड़े अक्षर और विराम चिह्न लगाओ।') : T('Add the punctuation marks.', 'विराम चिह्न लगाओ।');
      if (mode === 'fix') return T('Find the mistake and write the sentence correctly.', 'ग़लती ढूँढ़ो और वाक्य सही लिखो।');
      if (mode === 'combine') return T('Join the short sentences into one sentence.', 'छोटे वाक्यों को जोड़कर एक वाक्य बनाओ।');
      if (mode === 'build') return T('Make a correct sentence.', 'सही वाक्य बनाओ।');
      return T('Pick a tag, then tap the words.', 'टैग चुनो, फिर शब्द छुओ।');
    }
    function bodyTag(it, s) {
      const pal = tagset.map((t) => {
        const g = TAGS[t], lab = tagLabel(t);
        return `<button type="button" class="gr-tg" data-key="tag:${esc(t)}" style="--c:${g.c};--tc:${g.t}" aria-pressed="${sel === t}" aria-label="${esc(lab.main + (lab.sub ? ' (' + lab.sub + ')' : ''))}"${finished(it) ? ' disabled' : ''}><i aria-hidden="true">${GLYPH[tagset.indexOf(t) % GLYPH.length]}</i><span>${esc(lab.main)}${lab.sub ? `<small>${esc(lab.sub)}</small>` : ''}</span></button>`;
      }).join('');
      const def = sel ? `<p class="gr-def"><strong>${esc(tagLabel(sel).main)}:</strong> ${esc(tx(TAGS[sel].d, L()))}</p>` : `<p class="gr-def">${esc(T('Pick a tag above to see what it means.', 'ऊपर से कोई टैग चुनो, उसका मतलब यहाँ दिखेगा।'))}</p>`;
      const some = it.atags.some((t) => !t);
      const note = some ? `<p class="gr-def" style="background:#FFF7DB;border-color:#F5D56B;color:#5B4500">${esc(T('Some words need no tag. Tag only the words that match the tags above.', 'कुछ शब्दों को टैग नहीं करना है। केवल ऊपर के टैग वाले शब्दों को टैग करो।'))}</p>` : '';
      const fin = finished(it);
      const wordsHTML = it.tokens.map((tok, i) => {
        const t = s.tags[i], g = t ? TAGS[t] : null, lab = t ? tagLabel(t) : null;
        const isBad = s.bad && s.bad.indexOf(i) >= 0;
        const rightNow = (s.bad && !isBad && (t || '') === (it.atags[i] || '') && t) || (fin && t && t === it.atags[i]);
        const reveal = isBad && s.tries >= 2 && it.atags[i];
        const cls = ['gr-w', t ? 'gr-t' : '', isBad ? 'gr-bad' : rightNow ? 'gr-good' : '', fin && s.solved && popId === it.id ? 'gr-wave' : ''].filter(Boolean).join(' ');
        const label = tok + (t ? ', ' + lab.main : ', ' + T('no tag', 'कोई टैग नहीं')) + (isBad ? ', ' + T('not right', 'सही नहीं') : '');
        const small = t ? `<small>${esc(lab.main)}</small>` : reveal ? '' : '';
        const hintLine = reveal ? `<small style="color:#B91C1C">${esc(T('try: ', 'देखो: ') + tagLabel(it.atags[i]).main)}</small>` : '';
        const delay = fin && s.solved && popId === it.id ? ` animation-delay:${i * 70}ms;` : '';
        return `<button type="button" class="${cls}" data-key="word:${i}" aria-label="${esc(label)}" style="${g ? `--c:${g.c};--tc:${g.t};` : ''}${delay}"${fin ? ' disabled' : ''}><b>${esc(tok)}</b>${small}${hintLine}</button>`;
      }).join('');
      return `<div class="gr-orig" style="background:transparent;border:0;padding:0;align-items:center"><span class="gr-orig-l" style="flex:1">${esc(T('Tag the sentence', 'वाक्य के शब्द पहचानो'))}</span><button type="button" class="gr-hear" data-key="hear" aria-label="${esc(T('Hear the sentence', 'वाक्य सुनो'))}">${SPEAKER}</button></div>
<div class="gr-pal" role="group" aria-label="${esc(T('Tags', 'टैग'))}">${pal}</div>${def}${note}
<div class="gr-words" role="group" aria-label="${esc(T('Words of the sentence', 'वाक्य के शब्द'))}">${wordsHTML}</div>`;
    }
    function bodyTiles(it, s) {
      const fin = finished(it);
      const lineHTML = s.chosen.map((wi, pos) => {
        const m = s.mark;
        const cls = ['gr-tile', 'gr-in', m && pos < m.ok ? 'gr-good' : '', m && pos === m.bad ? 'gr-miss' : '', fin && s.solved && popId === it.id ? 'gr-wave' : ''].filter(Boolean).join(' ');
        return `<button type="button" class="${cls}" data-key="word:${wi}" data-in="${pos}" aria-label="${esc(it.words[wi] + ', ' + T('word ' + (pos + 1) + ' of your sentence. Tap to take it back.', 'तुम्हारे वाक्य का शब्द ' + (pos + 1) + '। वापस लेने के लिए छुओ।'))}"${fin ? ' disabled' : ''}${fin && s.solved && popId === it.id ? ` style="animation-delay:${pos * 70}ms"` : ''}>${esc(it.words[wi])}</button>`;
      }).join('') || `<span class="gr-line-e">${esc(T('Your sentence will appear here.', 'तुम्हारा वाक्य यहाँ बनेगा।'))}</span>`;
      const bank = it.order.map((wi) => (s.chosen.indexOf(wi) >= 0 ? `<span class="gr-ghost" aria-hidden="true">${esc(it.words[wi])}</span>` : `<button type="button" class="gr-tile" data-key="word:${wi}" aria-label="${esc(it.words[wi])}"${fin ? ' disabled' : ''}>${esc(it.words[wi])}</button>`)).join('');
      return `<div class="gr-line" role="group" aria-label="${esc(T('Your sentence', 'तुम्हारा वाक्य'))}">${lineHTML}</div>
<div class="gr-bank" role="group" aria-label="${esc(T('Word tiles', 'शब्द-टाइल'))}">${bank}</div>
<div class="gr-tools"><button type="button" class="gr-mini" data-key="undo"${fin || !s.chosen.length ? ' disabled' : ''}>↶ ${esc(T('Undo', 'पीछे'))}</button><button type="button" class="gr-mini" data-key="clear"${fin || !s.chosen.length ? ' disabled' : ''}>✕ ${esc(T('Clear', 'हटाओ'))}</button></div>`;
    }
    function bodyType(it, s) {
      const fin = finished(it);
      const marks = MARKS[lang].map((m) => `<button type="button" class="gr-mk" data-key="mark:${esc(m)}" aria-label="${esc(T('Insert ' + m, m + ' लगाओ'))}"${fin ? ' disabled' : ''}>${esc(m)}</button>`).join('');
      const ph = mode === 'combine' ? T('Write one joined sentence', 'जुड़ा हुआ एक वाक्य लिखो') : T('Write the sentence', 'वाक्य लिखो');
      return `<textarea class="gr-ta" data-key="input" lang="${lang === 'en' ? 'en' : 'hi'}" rows="3" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="${esc(ph)}" placeholder="${esc(ph)}"${fin ? ' readonly' : ''}>${esc(s.text)}</textarea>
${s.diff ? `<p class="gr-diff" aria-label="${esc(T('Your answer, with words to look at marked', 'तुम्हारा उत्तर, देखने वाले शब्द चिह्नित'))}">${s.diff}</p>` : ''}
<div class="gr-marks" role="group" aria-label="${esc(T('Punctuation keys', 'विराम चिह्न'))}">${marks}</div>
<div class="gr-tools"><button type="button" class="gr-mini" data-key="clear"${fin ? ' disabled' : ''}>↺ ${esc(T('Start again', 'फिर से'))}</button></div>`;
    }
    function render() {
      if (destroyed) return;
      const act = root.contains(document.activeElement) ? document.activeElement.getAttribute('data-key') : null;
      const it = items[cur], s = S[it.id];
      const fin = finished(it);
      const doneN = items.filter(finished).length;
      const steps = items.map((x, i) => `<button type="button" class="gr-step${finished(x) ? ' gr-ok' : ''}" data-key="item:${esc(x.id)}" aria-current="${i === cur}" aria-label="${esc(T('Sentence ' + (i + 1) + ' of ' + items.length + (finished(x) ? ', done' : ''), 'वाक्य ' + (i + 1) + ' / ' + items.length + (finished(x) ? ', पूरा' : '')))}">${i + 1}</button>`).join('');
      const task = it.task ? tx(it.task, L()) : defaultTask();
      let orig = '';
      if (mode === 'transform' || mode === 'combine' || ((mode === 'fix' || mode === 'punctuate') && it.tile) || (mode === 'build' && it.sentence)) {
        const lbl = mode === 'build' ? T('Clue', 'संकेत') : mode === 'combine' ? T('Short sentences', 'छोटे वाक्य') : mode === 'transform' ? T('Original sentence', 'मूल वाक्य') : mode === 'fix' ? T('Sentence with a mistake', 'ग़लती वाला वाक्य') : T('Sentence without punctuation', 'बिना विराम चिह्न का वाक्य');
        orig = `<div class="gr-orig"><div><span class="gr-orig-l">${esc(lbl)}</span><p class="gr-orig-t" lang="${lang === 'en' ? 'en' : 'hi'}">${esc(it.sentence)}</p></div>${mode !== 'build' ? `<button type="button" class="gr-hear" data-key="hear" aria-label="${esc(T('Hear the sentence', 'वाक्य सुनो'))}">${SPEAKER}</button>` : ''}</div>`;
      }
      let body = mode === 'tag' ? bodyTag(it, s) : it.tile ? bodyTiles(it, s) : bodyType(it, s);
      if (mode === 'build' && s.solved) body += `<div><button type="button" class="gr-hear" data-key="hear" aria-label="${esc(T('Hear the sentence', 'वाक्य सुनो'))}">${SPEAKER}</button></div>`;
      const showReveal = !fin && s.tries >= 2;
      const last = items.every((x, i) => i === cur || finished(x));
      const nextLbl = allFinished() ? T('Finish', 'पूरा करो') : T('Next sentence', 'अगला वाक्य');
      const acts = `<div class="gr-act">${fin ? '' : `<button type="button" class="gr-btn gr-main" data-key="answer">${esc(T('Check', 'जाँचो'))}</button>`}${showReveal ? `<button type="button" class="gr-btn" data-key="reveal">${esc(T('Answer', 'उत्तर देखो'))}</button>` : ''}${fin && !allFinished() ? `<button type="button" class="gr-btn gr-go" data-key="next">${esc(T('Next sentence', 'अगला वाक्य'))} →</button>` : ''}${fin && allFinished() ? `<button type="button" class="gr-btn gr-go" data-key="reset">↺ ${esc(T('Play again', 'फिर से खेलो'))}</button>` : ''}${!fin ? `<button type="button" class="gr-btn" data-key="next"${last || items.length < 2 ? ' disabled' : ''} aria-label="${esc(T('Skip to another sentence', 'दूसरे वाक्य पर जाओ'))}">${esc(T('Skip', 'छोड़ो'))} →</button>` : ''}</div>`;
      const bub = BUBBLES[lang].map((b) => `<i>${esc(b)}</i>`).join('');
      root.innerHTML = `<div class="gr gr-m-${mode}">
<header class="gr-head"><span class="gr-ico">${ICON[mode]}</span><div class="gr-hd"><h3 class="gr-title">${esc(tx(MODE_TITLE[mode], L()))}</h3><p class="gr-how">${esc(howText())}</p></div><span class="gr-bub" aria-hidden="true">${bub}</span></header>
<nav class="gr-steps" aria-label="${esc(T('Sentences', 'वाक्य'))}">${steps}<span class="gr-steps-t">${doneN} / ${items.length}</span></nav>
<section class="gr-paper" aria-label="${esc(T('Workspace', 'कार्य-स्थल'))}"><span class="gr-task">${esc(task)}</span>${orig}${body}</section>
${msgBox(s)}
${acts}
</div>`;
      popId = null;
      if (act) {
        const el = root.querySelector('[data-key="' + act.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]');
        if (el && !el.disabled) el.focus({ preventScroll: true });
      }
    }

    // ------------------------------------------------------------ actions
    const setMsg = (s, kind, html) => { s.msg = { kind, html }; };
    const joined = (it, s) => (it.tile ? s.chosen.map((i) => it.words[i]).join(' ') : s.text);
    function diffTokens(a) { return strip(a).replace(/([,.;:!?"()।॥])/g, ' $1 ').split(/\s+/).filter(Boolean); }
    function lcsFlags(stu, ans) {
      const n = stu.length, m = ans.length, eq = (x, y) => (cs ? x === y : x.toLowerCase() === y.toLowerCase());
      const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) d[i][j] = eq(stu[i], ans[j]) ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
      const ok = new Array(n).fill(false);
      let i = 0, j = 0;
      while (i < n && j < m) { if (eq(stu[i], ans[j])) { ok[i] = true; i++; j++; } else if (d[i + 1][j] >= d[i][j + 1]) i++; else j++; }
      return { ok, len: d[0][0], m };
    }
    function diffHTML(it, text) {
      const stu = diffTokens(text);
      let best = null;
      it.answers.forEach((a) => { const at = diffTokens(a), r = lcsFlags(stu, at); r.score = r.len - 0.01 * Math.abs(at.length - stu.length); if (!best || r.score > best.score) best = r; });
      let html = '', bad = 0;
      stu.forEach((tok, i) => {
        const closing = /^[,.;:!?)।॥]$/.test(tok);
        const piece = best.ok[i] ? esc(tok) : (bad++, `<mark>${esc(tok)}</mark>`);
        html += (html && !closing ? ' ' : '') + piece;
      });
      return { html, bad, missing: best.m - best.len - bad > 0 ? best.m - best.len : 0 };
    }
    function check() {
      const it = items[cur], s = S[it.id];
      if (finished(it)) return;
      if (!api.allowed('answer')) { api.nudge('answer'); return; }
      let ok = false;
      s.bad = null; s.mark = null; s.diff = null;
      if (mode === 'tag') {
        if (!s.tags.some(Boolean)) { setMsg(s, 'info', esc(T('Tag at least one word first.', 'पहले कम से कम एक शब्द को टैग करो।'))); render(); return; }
        s.bad = [];
        s.tags.forEach((t, i) => { if ((t || '') !== (it.atags[i] || '')) s.bad.push(i); });
        ok = !s.bad.length;
        s.tries++;
        if (!ok) {
          const n = s.bad.length;
          setMsg(s, 'bad', `<strong>${esc(T('Not yet.', 'अभी नहीं।'))}</strong> ${esc(T(n + (n === 1 ? ' word needs' : ' words need') + ' another look (marked red). Tap a word to change its tag.', n + ' शब्द फिर से देखने हैं (लाल चिह्न)। टैग बदलने के लिए शब्द छुओ।'))}${s.tries >= 2 ? ruleHTML(it) : ''}`);
        }
      } else {
        const txt = joined(it, s);
        if (!norm(txt)) { setMsg(s, 'info', esc(it.tile ? T('Tap some words first.', 'पहले कुछ शब्द छुओ।') : T('Write your answer first.', 'पहले अपना उत्तर लिखो।'))); render(); return; }
        if (!it.tile && mode !== 'combine' && mode !== 'build' && norm(txt, true) === norm(it.sentence, true)) { setMsg(s, 'info', esc(T('This is still the same sentence. Change it first.', 'यह अब भी वही वाक्य है। पहले इसे बदलो।'))); render(); return; }
        ok = it.answers.some((a) => norm(a, cs) === norm(txt, cs));
        s.tries++;
        if (!ok) {
          let hint;
          if (it.tile) {
            const cur2 = s.chosen.map((i) => it.words[i]);
            let bestOk = 0, bestBad = 0;
            it.answers.forEach((a) => {
              const tgt = norm(a);
              let k = 0;
              while (k < cur2.length && tgt.startsWith(norm(cur2.slice(0, k + 1).join(' ')))) k++;
              if (k > bestOk || (k === bestOk && !bestBad)) { bestOk = k; bestBad = k; }
            });
            const prefixFull = bestOk === cur2.length;
            s.mark = { ok: bestOk, bad: prefixFull ? -1 : bestOk };
            hint = prefixFull ? T('So far the words are right, but the sentence is not finished.', 'अब तक के शब्द सही हैं, पर वाक्य अधूरा है।')
              : bestOk === 0 ? T('The first word is not right. Take it back and try another.', 'पहला शब्द सही नहीं है। उसे वापस लो और दूसरा आज़माओ।')
              : T('The first ' + bestOk + (bestOk === 1 ? ' word is' : ' words are') + ' right (green). Look at word ' + (bestOk + 1) + ' (red).', 'पहले ' + bestOk + ' शब्द सही हैं (हरे)। शब्द ' + (bestOk + 1) + ' देखो (लाल)।');
          } else {
            const d = diffHTML(it, txt);
            s.diff = d.html;
            hint = d.bad ? T('The words that need a look are marked in red.', 'जिन शब्दों को देखना है वे लाल चिह्न में हैं।')
              : d.missing ? T('Something is missing. Read the sentence again.', 'कुछ छूट गया है। वाक्य फिर से पढ़ो।')
              : T('The words are right. Check the capital letters, punctuation and spaces.', 'शब्द सही हैं। बड़े अक्षर, विराम चिह्न और दूरी जाँचो।');
          }
          setMsg(s, 'bad', `<strong>${esc(T('Not yet.', 'अभी नहीं।'))}</strong> ${esc(hint)}${s.tries >= 2 ? ruleHTML(it) : ''}`);
        }
      }
      const nm = it.id;
      if (ok) {
        s.solved = true; s.first = s.tries === 1; popId = it.id;
        const good = mode === 'tag' ? it.tokens.join(' ') : it.tile ? joined(it, s) : joined(it, s);
        setMsg(s, 'good', `<strong>${esc(s.first ? T('Correct! First try.', 'सही! पहली बार में।') : T('Correct!', 'सही!'))}</strong> <span lang="${lang === 'en' ? 'en' : 'hi'}">${esc(good)}</span>${ruleHTML(it)}`);
        if (mode === 'build') api.emit('built:' + nm);
        if (mode === 'tag') api.emit('tagged:' + nm);
        api.emit('answered:right');
        api.record(T('Sentence ' + (cur + 1) + ' (' + mode + '): correct after ' + s.tries + ' ' + (s.tries === 1 ? 'try' : 'tries'), 'वाक्य ' + (cur + 1) + ' (' + mode + '): ' + s.tries + ' प्रयास में सही'));
        api.speak(tx(it.rule, L()), L());
        if (allFinished()) finishAll();
      } else {
        api.emit('answered:wrong');
        api.record(T('Sentence ' + (cur + 1) + ' (' + mode + '): wrong attempt ' + s.tries, 'वाक्य ' + (cur + 1) + ' (' + mode + '): ग़लत प्रयास ' + s.tries));
      }
      render();
    }
    function finishAll() {
      if (!doneSent) { doneSent = true; api.emit('done'); api.celebrate(); }
      const first = items.filter((x) => S[x.id].first).length;
      api.record(T('Finished all ' + items.length + ' sentences; ' + first + ' right on the first try', 'सभी ' + items.length + ' वाक्य पूरे; ' + first + ' पहली बार में सही'));
    }
    function reveal() {
      const it = items[cur], s = S[it.id];
      if (finished(it) || s.tries < 2) return;
      if (!api.allowed('reveal')) { api.nudge('reveal'); return; }
      s.revealed = true; s.bad = null; s.mark = null; s.diff = null;
      if (mode === 'tag') s.tags = it.atags.slice();
      else if (it.tile) s.chosen = partition(it.words, it.answers[0]) || [];
      else s.text = it.answers[0];
      setMsg(s, 'info', `<strong>${esc(T('Here is one correct answer.', 'यह एक सही उत्तर है।'))}</strong> ${mode === 'tag' ? '' : `<span lang="${lang === 'en' ? 'en' : 'hi'}">${esc(it.answers[0])}</span>`}${ruleHTML(it)}`);
      api.record(T('Sentence ' + (cur + 1) + ': answer shown', 'वाक्य ' + (cur + 1) + ': उत्तर दिखाया गया'));
      if (allFinished()) finishAll();
      render();
    }
    function go(i) { cur = i; render(); }
    function next() {
      if (!api.allowed('next')) { api.nudge('next'); return; }
      for (let k = 1; k <= items.length; k++) {
        const j = (cur + k) % items.length;
        if (!finished(items[j])) { go(j); api.record(T('Went to sentence ' + (j + 1), 'वाक्य ' + (j + 1) + ' पर गए')); return; }
      }
      go((cur + 1) % items.length);
    }
    function reset() {
      if (!api.allowed('reset')) { api.nudge('reset'); return; }
      items.forEach((it) => { S[it.id] = freshItem(it); });
      cur = 0; sel = null; doneSent = false;
      api.record(T('Played again', 'फिर से खेला'));
      render();
    }
    function onWord(i, inLine) {
      const it = items[cur], s = S[it.id];
      if (finished(it)) return;
      if (!api.allowed('word:' + i)) { api.nudge('word:' + i); return; }
      if (mode === 'tag') {
        s.bad = null;
        if (!sel) {
          if (s.tags[i]) s.tags[i] = '';
          else { setMsg(s, 'info', esc(T('Pick a tag first, then tap the word.', 'पहले टैग चुनो, फिर शब्द छुओ।'))); }
        } else s.tags[i] = s.tags[i] === sel ? '' : sel;
        render();
        return;
      }
      s.mark = null; s.msg = null;
      if (inLine) { const p = s.chosen.indexOf(i); if (p >= 0) s.chosen.splice(p, 1); }
      else if (s.chosen.indexOf(i) < 0) s.chosen.push(i);
      render();
    }
    function insertMark(m) {
      const it = items[cur], s = S[it.id];
      if (finished(it)) return;
      if (!api.allowed('mark:' + m)) { api.nudge('mark:' + m); return; }
      const ta = root.querySelector('.gr-ta');
      if (!ta) return;
      const a = ta.selectionStart == null ? ta.value.length : ta.selectionStart, b = ta.selectionEnd == null ? a : ta.selectionEnd;
      ta.value = ta.value.slice(0, a) + m + ta.value.slice(b);
      s.text = ta.value; s.msg = null; s.diff = null;
      ta.focus();
      ta.setSelectionRange(a + m.length, a + m.length);
    }

    function onClick(ev) {
      const k = ev.target.closest('[data-key]');
      if (!k || !root.contains(k) || k.disabled) return;
      const key = k.getAttribute('data-key');
      if (key === 'input') return;
      if (key.startsWith('item:')) {
        if (!api.allowed(key)) { api.nudge(key); return; }
        const i = items.findIndex((x) => x.id === key.slice(5));
        if (i >= 0) go(i);
      } else if (key.startsWith('tag:')) {
        if (!api.allowed(key)) { api.nudge(key); return; }
        const t = key.slice(4);
        sel = sel === t ? null : t;
        render();
      } else if (key.startsWith('word:')) onWord(+key.slice(5), k.hasAttribute('data-in'));
      else if (key.startsWith('mark:')) insertMark(key.slice(5));
      else if (key === 'answer') check();
      else if (key === 'reveal') reveal();
      else if (key === 'next') next();
      else if (key === 'reset') reset();
      else if (key === 'hear') {
        if (!api.allowed('hear')) { api.nudge('hear'); return; }
        const it = items[cur];
        if (mode !== 'build' && mode !== 'tag') api.speak(it.sentence, spk);
        else api.speak(speakText(it), spk);
      } else if (key === 'undo' || key === 'clear') {
        const it = items[cur], s = S[it.id];
        if (!api.allowed(key)) { api.nudge(key); return; }
        if (key === 'undo') s.chosen.pop();
        else if (it.tile) s.chosen = [];
        else { s.text = freshItem(it).text; }
        s.mark = null; s.diff = null; s.msg = null;
        render();
      }
    }
    function onInput(ev) {
      if (!ev.target.classList || !ev.target.classList.contains('gr-ta')) return;
      const s = S[items[cur].id];
      s.text = ev.target.value; s.msg = null; s.diff = null;
    }
    function onKey(ev) {
      if (ev.key === 'Enter' && !ev.shiftKey && ev.target.classList && ev.target.classList.contains('gr-ta')) { ev.preventDefault(); check(); }
    }
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('keydown', onKey);
    render();
    return {
      destroy() {
        destroyed = true;
        timers.forEach(clearTimeout);
        root.removeEventListener('click', onClick);
        root.removeEventListener('input', onInput);
        root.removeEventListener('keydown', onKey);
        root.innerHTML = '';
      },
    };
  }

  const demo = {
    mode: 'tag',
    lang: 'en',
    items: [
      { id: 'fox', sentence: 'The clever fox ran quickly into the forest.', tags: ['article', 'adjective', 'noun', 'verb', 'adverb', 'preposition', 'article', 'noun'], rule: T2('A noun names a thing, an adjective describes a noun, a verb shows the action and an adverb tells how it was done.', 'संज्ञा नाम बताती है, विशेषण संज्ञा की विशेषता बताता है, क्रिया काम बताती है और क्रियाविशेषण बताता है कि काम कैसे हुआ।') },
      { id: 'wow', sentence: 'Wow! She and her brother love sweet mangoes.', tags: ['interjection', 'pronoun', 'conjunction', 'adjective', 'noun', 'verb', 'adjective', 'noun'], rule: T2('An interjection shows a sudden feeling. A pronoun (she) takes the place of a name, and a conjunction (and) joins words.', 'विस्मयादिबोधक अचानक भाव दिखाता है। सर्वनाम (she) नाम की जगह आता है और समुच्चयबोधक (and) शब्दों को जोड़ता है।') },
      { id: 'bird', sentence: 'A small bird sat on the green branch.', tags: ['article', 'adjective', 'noun', 'verb', 'preposition', 'article', 'adjective', 'noun'], rule: T2('The word "on" is a preposition: it shows where the bird sat. "A" and "the" are articles.', '"on" संबंधबोधक है: यह बताता है कि चिड़िया कहाँ बैठी। "A" और "the" आर्टिकल हैं।') },
      { id: 'books', sentence: 'Meena reads a book but Arjun draws pictures.', tags: ['noun', 'verb', 'article', 'noun', 'conjunction', 'noun', 'verb', 'noun'], rule: T2('"But" is a conjunction: it joins two parts of the sentence. Names of people are nouns.', '"But" समुच्चयबोधक है: यह वाक्य के दो भागों को जोड़ता है। लोगों के नाम संज्ञा होते हैं।') },
    ],
  };

  NCA_T.register({ id: 'grammar', css, validate, keys, demo, mount });
})();
