// Template: Word builder. Build words from sounds and letters in English, Hindi and Sanskrit.
// Modes: phonics (sound tiles, digraphs as one tile), spelling (hear it, spell it, no help on the order),
// matra (consonant + vowel sign = akshar), syllables (split a word into beats / aksharas), affix (prefix and
// suffix with the true English spelling rules and the Hindi / Sanskrit upasarg and pratyay), compound (join two
// words) and sandhi (svar sandhi worked out by a rule engine: dirgha, guna, vriddhi, yan, ayadi).
// The language rules are in code: aksharas are cut by the Devanagari rules, English suffixes follow the
// drop-e / y-to-i / doubling rules, and every sandhi is computed (a lab can only ask for a word the engine
// really makes). Config:
//   { mode, lang: 'en'|'hi'|'sa', words?: [{ w, pic?, meaning?: {en,hi}, parts? }], extra?: string,
//     consonants?: [string], matras?: [string], examples?: { akshar: word }, parts?: [string] }
(function () {
  const L = window.NCA_LIB;
  const { esc } = L;
  const T2 = (en, hi) => ({ en, hi });

  // ---------------------------------------------------------------- Devanagari: aksharas, matras, sandhi
  const cp = (ch) => ch.codePointAt(0);
  const isCons = (ch) => { if (!ch) return false; const c = cp(ch); return (c >= 0x915 && c <= 0x939) || (c >= 0x958 && c <= 0x95f); };
  const isIndV = (ch) => { if (!ch) return false; const c = cp(ch); return (c >= 0x905 && c <= 0x914) || c === 0x960 || c === 0x961; };
  const isMatra = (ch) => { if (!ch) return false; const c = cp(ch); return (c >= 0x93e && c <= 0x94c) || c === 0x962 || c === 0x963; };
  const isMod = (ch) => { if (!ch) return false; const c = cp(ch); return c >= 0x901 && c <= 0x903; };
  const HAL = '्', NUK = '़';
  const DEVWORD = /^[ऀ-ॣ॰-ॿ]+$/;
  // Cut a Devanagari string into aksharas: consonant (+nukta) (+ halant + consonant)* (+ matra) (+ ं ँ ः),
  // or an independent vowel (+ ं ँ ः). A word-final halant stays with its consonant.
  function aksharas(s) {
    const a = [...s], out = [];
    let i = 0;
    while (i < a.length) {
      const ch = a[i];
      let u = ch;
      i++;
      if (isCons(ch)) {
        if (a[i] === NUK) { u += a[i]; i++; }
        while (a[i] === HAL && isCons(a[i + 1])) { u += a[i] + a[i + 1]; i += 2; if (a[i] === NUK) { u += a[i]; i++; } }
        if (a[i] === HAL) { u += a[i]; i++; }
        else if (isMatra(a[i])) { u += a[i]; i++; }
        while (isMod(a[i])) { u += a[i]; i++; }
      } else if (isIndV(ch)) {
        while (isMod(a[i])) { u += a[i]; i++; }
      }
      out.push(u);
    }
    return out;
  }
  const validAkshar = (u) => { const a = [...u]; return isCons(a[0]) || isIndV(a[0]); };
  const devOK = (w) => DEVWORD.test(w) && aksharas(w).every(validAkshar);
  const enOK = (w) => /^[A-Za-z]+$/.test(w);
  const wordOK = (w, lang) => (lang === 'en' ? enOK(w) : devOK(w));

  const MAT = { 'अ': '', 'आ': 'ा', 'इ': 'ि', 'ई': 'ी', 'उ': 'ु', 'ऊ': 'ू', 'ऋ': 'ृ', 'ए': 'े', 'ऐ': 'ै', 'ओ': 'ो', 'औ': 'ौ' };
  const MV = { 'ा': 'आ', 'ि': 'इ', 'ी': 'ई', 'ु': 'उ', 'ू': 'ऊ', 'ृ': 'ऋ', 'े': 'ए', 'ै': 'ऐ', 'ो': 'ओ', 'ौ': 'औ' };
  const SANDHI_RULES = {
    dirgha: { n: T2('Dirgha sandhi', 'दीर्घ संधि'), r: T2('Two similar vowels (a/ā, i/ī, u/ū) join and become one long vowel.', 'समान स्वर (अ/आ, इ/ई, उ/ऊ) मिलकर एक दीर्घ स्वर बन जाते हैं।') },
    guna: { n: T2('Guna sandhi', 'गुण संधि'), r: T2('a or ā + i/ī gives e; a or ā + u/ū gives o; a or ā + ṛ gives ar.', 'अ/आ + इ/ई = ए; अ/आ + उ/ऊ = ओ; अ/आ + ऋ = अर्।') },
    vriddhi: { n: T2('Vriddhi sandhi', 'वृद्धि संधि'), r: T2('a or ā + e/ai gives ai; a or ā + o/au gives au.', 'अ/आ + ए/ऐ = ऐ; अ/आ + ओ/औ = औ।') },
    yan: { n: T2('Yan sandhi', 'यण् संधि'), r: T2('i/ī, u/ū or ṛ + a different vowel: i becomes y, u becomes v, ṛ becomes r.', 'इ/ई, उ/ऊ या ऋ के बाद कोई दूसरा स्वर आए तो इ का य्, उ का व्, ऋ का र् हो जाता है।') },
    ayadi: { n: T2('Ayadi sandhi', 'अयादि संधि'), r: T2('e, ai, o, au + any vowel become ay, āy, av, āv.', 'ए, ऐ, ओ, औ के बाद कोई स्वर आए तो अय्, आय्, अव्, आव् हो जाता है।') },
  };
  // Svar sandhi of a + b. Returns { w, rule, v1, v2, out } or null when the rule does not apply.
  function sandhi(a, b) {
    const A = [...a], B = [...b];
    if (!A.length || !B.length) return null;
    const last = A[A.length - 1];
    let v1, base;
    if (MV[last]) { v1 = MV[last]; base = A.slice(0, -1).join(''); } else if (isCons(last) || last === NUK) { v1 = 'अ'; base = a; } else return null;
    const bl = [...base].pop();
    if (!bl || !(isCons(bl) || bl === NUK)) return null;
    const v2 = B[0];
    if (!(v2 in MAT)) return null;
    const rest = B.slice(1).join(''), m2 = MAT[v2];
    let w, rule, out;
    if (v1 === 'अ' || v1 === 'आ') {
      if (v2 === 'अ' || v2 === 'आ') { rule = 'dirgha'; out = 'आ'; w = base + 'ा' + rest; }
      else if (v2 === 'इ' || v2 === 'ई') { rule = 'guna'; out = 'ए'; w = base + 'े' + rest; }
      else if (v2 === 'उ' || v2 === 'ऊ') { rule = 'guna'; out = 'ओ'; w = base + 'ो' + rest; }
      else if (v2 === 'ऋ') { rule = 'guna'; out = 'अर्'; w = base + 'र्' + rest; }
      else if (v2 === 'ए' || v2 === 'ऐ') { rule = 'vriddhi'; out = 'ऐ'; w = base + 'ै' + rest; }
      else { rule = 'vriddhi'; out = 'औ'; w = base + 'ौ' + rest; }
    } else if (v1 === 'इ' || v1 === 'ई') {
      if (v2 === 'इ' || v2 === 'ई') { rule = 'dirgha'; out = 'ई'; w = base + 'ी' + rest; }
      else { rule = 'yan'; out = 'य्'; w = base + HAL + 'य' + m2 + rest; }
    } else if (v1 === 'उ' || v1 === 'ऊ') {
      if (v2 === 'उ' || v2 === 'ऊ') { rule = 'dirgha'; out = 'ऊ'; w = base + 'ू' + rest; }
      else { rule = 'yan'; out = 'व्'; w = base + HAL + 'व' + m2 + rest; }
    } else if (v1 === 'ऋ') {
      if (v2 === 'ऋ') return null;
      rule = 'yan'; out = 'र्'; w = base + HAL + 'र' + m2 + rest;
    } else if (v1 === 'ए') { rule = 'ayadi'; out = 'अय्'; w = base + 'य' + m2 + rest; }
    else if (v1 === 'ऐ') { rule = 'ayadi'; out = 'आय्'; w = base + 'ा' + 'य' + m2 + rest; }
    else if (v1 === 'ओ') { rule = 'ayadi'; out = 'अव्'; w = base + 'व' + m2 + rest; }
    else { rule = 'ayadi'; out = 'आव्'; w = base + 'ा' + 'व' + m2 + rest; }
    return { w, rule, v1, v2, out };
  }

  // Vowel signs (matras) and what each looks like when written.
  const MATRAS = {
    'ा': { s: 'aa', pos: T2('goes after the letter', 'अक्षर के बाद लगती है') },
    'ि': { s: 'i', pos: T2('goes before the letter (but is said after it)', 'अक्षर से पहले लगती है (पर बोली बाद में जाती है)') },
    'ी': { s: 'ee', pos: T2('goes after the letter', 'अक्षर के बाद लगती है') },
    'ु': { s: 'u', pos: T2('goes below the letter', 'अक्षर के नीचे लगती है') },
    'ू': { s: 'oo', pos: T2('goes below the letter', 'अक्षर के नीचे लगती है') },
    'ृ': { s: 'ri', pos: T2('goes below the letter', 'अक्षर के नीचे लगती है') },
    'े': { s: 'e', pos: T2('goes above the letter', 'अक्षर के ऊपर लगती है') },
    'ै': { s: 'ai', pos: T2('goes above the letter', 'अक्षर के ऊपर लगती है') },
    'ो': { s: 'o', pos: T2('goes after and above the letter', 'अक्षर के बाद और ऊपर लगती है') },
    'ौ': { s: 'au', pos: T2('goes after and above the letter', 'अक्षर के बाद और ऊपर लगती है') },
    'ं': { s: 'an', pos: T2('is a dot above the letter (anusvaar)', 'अक्षर के ऊपर बिंदु है (अनुस्वार)') },
    'ँ': { s: 'an', pos: T2('is a moon-dot above the letter (chandrabindu)', 'अक्षर के ऊपर चंद्रबिंदु है') },
    'ः': { s: 'ah', pos: T2('is two dots after the letter (visarg)', 'अक्षर के बाद दो बिंदु हैं (विसर्ग)') },
  };
  const CONS_EXTRA = ['क्ष', 'त्र', 'ज्ञ', 'श्र'];
  const validCons = (c) => (typeof c === 'string' && ([...c].length === 1 && isCons(c) || CONS_EXTRA.includes(c)));

  // ---------------------------------------------------------------- English phonics units, spelling rules
  const DIG = ['igh', 'tch', 'sh', 'ch', 'th', 'ck', 'ng', 'ph', 'wh', 'qu', 'ee', 'oo', 'ai', 'ay', 'oa', 'oi', 'ou', 'ow', 'aw', 'ea', 'ar', 'or', 'er', 'ir', 'ur'];
  function enUnits(w) {
    const lw = w.toLowerCase(), out = [];
    let i = 0;
    while (i < w.length) {
      const d = DIG.find((x) => lw.startsWith(x, i));
      if (d) { out.push(w.substr(i, d.length)); i += d.length; } else { out.push(w[i]); i++; }
    }
    return out;
  }
  const letterUnits = (w, lang) => (lang === 'en' ? [...w] : aksharas(w));
  // Add a suffix with the school spelling rules. Returns { w, rule } (rule: 'e' | 'y' | 'd' | null).
  function addSuffix(base, suf) {
    const vsuf = /^[aeiou]/.test(suf);
    if (/[^aeiou]y$/.test(base) && suf !== 'ing') return { w: base.slice(0, -1) + 'i' + suf, rule: 'y' };
    if (vsuf && /[^aeiou]e$/.test(base)) return { w: base.slice(0, -1) + suf, rule: 'e' };
    if (vsuf && /^[^aeiou]*[aeiou][^aeiouwxy]$/.test(base)) return { w: base + base[base.length - 1] + suf, rule: 'd' };
    return { w: base + suf, rule: null };
  }
  const SPELLRULE = {
    e: T2('The silent e is dropped before a suffix that starts with a vowel.', 'स्वर से शुरू होने वाले प्रत्यय से पहले चुप रहने वाला e हट जाता है।'),
    y: T2('The y changes to i before the suffix.', 'प्रत्यय से पहले y बदलकर i हो जाता है।'),
    d: T2('A short word with one vowel and one last consonant doubles that consonant before a vowel suffix.', 'एक स्वर और एक अंतिम व्यंजन वाले छोटे शब्द में स्वर वाले प्रत्यय से पहले अंतिम अक्षर दोहराया जाता है।'),
  };

  // ---------------------------------------------------------------- word data
  const SYL_EN = {};
  ('ap-ple ba-by ba-na-na bas-ket bi-cy-cle break-fast but-ter-fly but-ton can-dle car-pet chil-dren croc-o-dile di-no-saur doc-tor dol-phin drag-on e-lec-tric-i-ty el-e-phant fam-i-ly for-est gar-den gi-raffe gui-tar ham-mer hap-py hel-lo hos-pi-tal im-por-tant in-sect jun-gle kit-ten lad-der lem-on li-brar-y li-on mar-ket moun-tain mon-key nap-kin num-ber or-ange pa-per pen-cil pic-ture pi-lot pump-kin rab-bit rain-bow ro-bot sis-ter spi-der sum-mer ta-ble teach-er ti-ger to-ma-to po-ta-to tur-tle um-brel-la va-ca-tion ve-hi-cle vol-ca-no wa-ter wa-ter-mel-on win-dow yel-low ze-bra cam-e-ra com-put-er ba-sket-ball foot-ball play-ground').split(' ').forEach((s) => { const p = s.split('-'); SYL_EN[p.join('')] = p; });

  const AFFIX_INFO = {
    en: {
      un: ['p', 'not', 'नहीं'], re: ['p', 'again', 'फिर से'], dis: ['p', 'not, the opposite of', 'नहीं, उलटा'], pre: ['p', 'before', 'पहले'], mis: ['p', 'wrongly', 'गलत'], im: ['p', 'not (used before p)', 'नहीं (p से पहले)'], in: ['p', 'not', 'नहीं'], over: ['p', 'too much', 'ज़रूरत से ज़्यादा'],
      ful: ['s', 'full of', 'से भरा'], less: ['s', 'without', 'के बिना'], ness: ['s', 'the state of being', 'होने की अवस्था'], ly: ['s', 'in that way', 'उस तरह से'], er: ['s', 'one who does it, or more', 'करने वाला, या अधिक'], ing: ['s', 'happening now', 'अभी हो रहा है'], ed: ['s', 'happened in the past', 'पहले हो चुका'], able: ['s', 'can be done', 'किया जा सकता है'], ment: ['s', 'the act or result', 'क्रिया या उसका फल'],
    },
    hi: {
      'अ': ['p', 'not, without', 'नहीं, बिना'], 'अन': ['p', 'not', 'नहीं'], 'नि': ['p', 'without', 'बिना'], 'निर्': ['p', 'without', 'बिना'], 'कु': ['p', 'bad', 'बुरा'], 'सु': ['p', 'good', 'अच्छा'], 'दुर्': ['p', 'bad', 'बुरा'], 'प्र': ['p', 'forward, very', 'आगे, अधिक'], 'वि': ['p', 'apart, special', 'अलग, विशेष'], 'उप': ['p', 'near, small', 'पास, छोटा'], 'अति': ['p', 'too much', 'बहुत ज़्यादा'],
      'पन': ['s', 'the state of being', 'होने का भाव'], 'आई': ['s', 'the act of', 'करने का भाव'], 'वाला': ['s', 'one who does or has', 'करने या रखने वाला'], 'दार': ['s', 'one who has', 'रखने वाला'], 'हीन': ['s', 'without', 'के बिना'], 'ता': ['s', 'the state of being', 'होने का भाव'],
    },
    sa: {
      'आ': ['p', 'towards', 'की ओर'], 'निर्': ['p', 'out', 'बाहर'], 'अनु': ['p', 'after', 'पीछे'], 'उप': ['p', 'near', 'पास'], 'अप': ['p', 'away', 'दूर'], 'अभि': ['p', 'towards', 'सामने की ओर'], 'प्र': ['p', 'forward', 'आगे'], 'वि': ['p', 'apart, about', 'अलग, इधर-उधर'], 'सम्': ['p', 'together', 'साथ'], 'परि': ['p', 'around', 'चारों ओर'],
    },
  };
  // English: type|affix|base|meaning en|meaning hi   (type p: prefix + base; s: base + suffix; the spelling is worked out)
  const AFF_EN = `p|un|happy|not happy|दुखी
p|un|kind|not kind|निर्दयी
p|un|lock|to open a lock|ताला खोलना
p|re|write|to write again|फिर से लिखना
p|re|play|to play again|फिर से बजाना
p|re|build|to build again|फिर से बनाना
p|dis|like|not to like|पसंद न करना
p|dis|appear|to go out of sight|ग़ायब हो जाना
p|dis|agree|not to agree|सहमत न होना
p|pre|heat|to heat before|पहले से गरम करना
p|mis|spell|to spell wrongly|गलत वर्तनी लिखना
p|mis|use|to use wrongly|गलत उपयोग करना
p|im|possible|not possible|असंभव
p|in|visible|not able to be seen|अदृश्य
p|over|eat|to eat too much|ज़रूरत से ज़्यादा खाना
s|ful|help|giving help|मददगार
s|ful|care|full of care|सावधान
s|ful|use|useful|उपयोगी
s|ful|beauty|full of beauty|सुंदर
s|ful|colour|full of colour|रंग-बिरंगा
s|less|hope|without hope|निराश
s|less|fear|without fear|निडर
s|ness|kind|being kind|दया का भाव
s|ness|happy|being happy|खुशी
s|ness|sad|being sad|उदासी
s|ly|slow|in a slow way|धीरे से
s|ly|quick|in a quick way|जल्दी से
s|ly|easy|in an easy way|आसानी से
s|er|teach|one who teaches|पढ़ाने वाला
s|er|farm|one who farms|खेती करने वाला
s|er|dance|one who dances|नाचने वाला
s|er|big|more big|ज़्यादा बड़ा
s|er|happy|more happy|ज़्यादा खुश
s|ing|make|happening now|बना रहा है
s|ing|run|happening now|दौड़ रहा है
s|ing|swim|happening now|तैर रहा है
s|ing|cry|happening now|रो रहा है
s|ing|use|happening now|उपयोग कर रहा है
s|ed|hope|happened in the past|आशा की
s|ed|hop|happened in the past|कूदा
s|ed|carry|happened in the past|उठाया
s|ed|play|happened in the past|खेला
s|able|love|can be loved|प्यार करने योग्य
s|able|enjoy|can be enjoyed|आनंद देने वाला
s|ment|govern|the act of governing|सरकार`;
  // Hindi and Sanskrit: lang|type|affix|base|word|meaning en|meaning hi
  const AFF_DEV = `hi|p|अ|ज्ञान|अज्ञान|not knowing|ज्ञान का न होना
hi|p|अन|पढ़|अनपढ़|not able to read|जिसने पढ़ाई नहीं की
hi|p|नि|डर|निडर|without fear|जिसे डर न लगे
hi|p|निर्|धन|निर्धन|without money|जिसके पास धन न हो
hi|p|कु|संग|कुसंग|bad company|बुरी संगति
hi|p|सु|पुत्र|सुपुत्र|a good son|अच्छा बेटा
hi|p|दुर्|गुण|दुर्गुण|a bad quality|बुरी आदत
hi|p|प्र|बल|प्रबल|very strong|बहुत ताकतवर
hi|p|वि|देश|विदेश|another country|दूसरा देश
hi|p|उप|नाम|उपनाम|a second name|दूसरा नाम
hi|p|अति|वृष्टि|अतिवृष्टि|too much rain|बहुत ज़्यादा बारिश
hi|s|पन|अपना|अपनापन|feeling of belonging|अपने होने का भाव
hi|s|पन|अकेला|अकेलापन|being alone|अकेले होने का भाव
hi|s|पन|बड़ा|बड़ापन|greatness|बड़े होने का भाव
hi|s|आई|लड़|लड़ाई|a fight|झगड़ा
hi|s|आई|पढ़|पढ़ाई|studying|पढ़ने का काम
hi|s|आई|लिख|लिखाई|writing|लिखने का काम
hi|s|वाला|दूध|दूधवाला|milkman|दूध बेचने वाला
hi|s|वाला|फल|फलवाला|fruit seller|फल बेचने वाला
hi|s|दार|दुकान|दुकानदार|shopkeeper|दुकान रखने वाला
hi|s|दार|ईमान|ईमानदार|honest|ईमान रखने वाला
hi|s|हीन|धन|धनहीन|without money|बिना धन का
hi|s|हीन|बल|बलहीन|without strength|बिना ताकत का
hi|s|ता|सुंदर|सुंदरता|beauty|सुंदर होने का भाव
hi|s|ता|सरल|सरलता|simplicity|सरल होने का भाव
sa|p|आ|गच्छति|आगच्छति|comes|आता है
sa|p|निर्|गच्छति|निर्गच्छति|goes out|बाहर जाता है
sa|p|अनु|गच्छति|अनुगच्छति|follows|पीछे चलता है
sa|p|उप|गच्छति|उपगच्छति|goes near|पास जाता है
sa|p|अप|गच्छति|अपगच्छति|goes away|दूर जाता है
sa|p|अभि|गच्छति|अभिगच्छति|goes towards|सामने जाता है
sa|p|प्र|हरति|प्रहरति|strikes|प्रहार करता है
sa|p|वि|हरति|विहरति|wanders about|घूमता है
sa|p|आ|हरति|आहरति|brings|लाता है
sa|p|सम्|हरति|संहरति|gathers, destroys|समेटता है, नष्ट करता है
sa|p|परि|हरति|परिहरति|avoids|छोड़ देता है
sa|p|उप|हरति|उपहरति|offers|भेंट करता है`;
  // lang|first|second|meaning en|meaning hi   (word = first + second)
  const COMP_LINES = `en|sun|flower|a tall yellow flower that faces the sun|सूरजमुखी का फूल
en|rain|bow|colours in the sky after rain|इंद्रधनुष
en|butter|fly|an insect with colourful wings|तितली
en|class|room|the room where we study|कक्षा का कमरा
en|foot|ball|a ball we kick|पैर से खेली जाने वाली गेंद
en|tooth|brush|a brush for cleaning teeth|दाँत साफ़ करने का ब्रश
en|note|book|a book for writing|लिखने की कॉपी
en|play|ground|a place to play|खेल का मैदान
en|moon|light|light from the moon|चाँद की रोशनी
en|star|fish|a sea animal shaped like a star|तारा मछली
en|cup|board|a cupboard for dishes|बर्तन रखने की अलमारी
en|black|board|a board for writing with chalk|श्यामपट्ट
en|door|bell|a bell at the door|दरवाज़े की घंटी
en|sea|shore|the land beside the sea|समुद्र का किनारा
en|air|port|a place where planes land|हवाई अड्डा
en|fire|fly|an insect that glows at night|जुगनू
en|sail|boat|a boat with a sail|पाल वाली नाव
en|snow|man|a man made of snow|बर्फ़ का आदमी
en|pan|cake|a flat round cake|चपटा गोल केक
en|bed|room|a room for sleeping|सोने का कमरा
en|hand|bag|a bag carried in the hand|हाथ का थैला
en|honey|bee|a bee that makes honey|शहद की मक्खी
en|news|paper|paper that brings the news|अख़बार
en|water|melon|a big juicy green fruit|तरबूज़
hi|राज|महल|a king's palace|राजा का महल
hi|पाठ|शाला|a school|पाठ पढ़ने की जगह
hi|गंगा|जल|water of the Ganga|गंगा का पानी
hi|रसोई|घर|a kitchen|खाना बनाने का घर
hi|घुड़|सवार|a horse rider|घोड़े पर चढ़ने वाला
hi|नील|कमल|a blue lotus|नीला कमल
hi|देश|भक्ति|love for one's country|देश से प्रेम
hi|हाथ|घड़ी|a wristwatch|हाथ पर बाँधी जाने वाली घड़ी
hi|सूरज|मुखी|a sunflower|वह फूल जिसका मुँह सूरज की ओर रहता है
hi|डाक|घर|a post office|चिट्ठियाँ भेजने का घर
hi|हवा|महल|the palace of winds|हवा वाला महल
sa|राज|पुत्रः|a prince|राजा का पुत्र
sa|राज|पुरुषः|a king's officer|राजा का सेवक
sa|नील|कमलम्|a blue lotus|नीला कमल
sa|चन्द्र|मुखम्|a moon-like face|चाँद जैसा मुख
sa|देव|मन्दिरम्|a temple of the gods|देवताओं का मंदिर
sa|पाठ|शाला|a school|पढ़ने की जगह`;
  // first|second|meaning en|meaning hi   (word is computed by the sandhi engine)
  const SAN_LINES = `विद्या|आलय|a school|पढ़ने की जगह
हिम|आलय|the Himalayas, the home of snow|बर्फ़ का घर
देव|आलय|a temple, the home of a god|देवता का घर
पुस्तक|आलय|a library|किताबों का घर
शिव|आलय|a temple of Shiva|शिव का मंदिर
हिम|अचल|a snowy mountain|बर्फ़ का पर्वत
सत्य|आग्रह|holding on to the truth|सत्य पर डटे रहना
सूर्य|अस्त|sunset|सूर्य का डूबना
परम|अर्थ|the highest purpose|सबसे बड़ा उद्देश्य
स्व|अर्थ|selfishness|अपना मतलब
विद्या|अर्थी|a student|पढ़ने वाला
महा|आत्मा|a great soul|महान आत्मा
कवि|इन्द्र|the king of poets|कवियों का राजा
गिरि|ईश|the lord of the mountains|पर्वतों का स्वामी
देव|इन्द्र|the king of the gods|देवताओं का राजा
गण|ईश|Ganesha|गणेश
महा|ईश|Mahesh, the great lord|महान स्वामी
नर|इन्द्र|a king of men|मनुष्यों का राजा
सूर्य|उदय|sunrise|सूरज का उगना
महा|उत्सव|a great festival|बड़ा उत्सव
सप्त|ऋषि|the seven sages|सात ऋषि
महा|ऋषि|a great sage|बड़े ऋषि
एक|एक|each and every one|हर एक
सदा|एव|always|हमेशा
वन|औषधि|a medicine from the forest|जंगल की दवा
महा|औषध|a great medicine|बड़ी दवा
इति|आदि|and so on|वगैरह
अति|अधिक|too much|बहुत ज़्यादा
यदि|अपि|even if|चाहे
प्रति|एक|each one|हर एक
सु|आगत|welcome|स्वागत
अनु|अय|connection|संबंध
अभि|उदय|rise, progress|उन्नति
प्रति|उत्तर|a reply|जवाब
अति|आचार|cruelty|ज़ुल्म
ने|अन|the eye|आँख
गै|अक|a singer|गाने वाला
पो|अन|the wind|हवा
पौ|अक|fire|आग
नौ|इक|a sailor|नाव चलाने वाला`;

  const AFF = { en: {}, hi: {}, sa: {} };
  const INV = { en: { p: new Set(), s: new Set(), b: new Set() }, hi: { p: new Set(), s: new Set(), b: new Set() }, sa: { p: new Set(), s: new Set(), b: new Set() } };
  Object.keys(AFFIX_INFO).forEach((lg) => Object.keys(AFFIX_INFO[lg]).forEach((a) => INV[lg][AFFIX_INFO[lg][a][0]].add(a)));
  function addAff(lg, type, aff, base, w, en, hi, rule) {
    const parts = type === 'p' ? [aff, base] : [base, aff];
    AFF[lg][w] = { w, parts, roles: type === 'p' ? ['pre', 'base'] : ['base', 'suf'], aff, type, mean: T2(en, hi), rule };
    INV[lg].b.add(base);
  }
  AFF_EN.split('\n').forEach((ln) => {
    const [type, aff, base, en, hi] = ln.split('|');
    if (type === 'p') addAff('en', 'p', aff, base, aff + base, en, hi, null);
    else { const r = addSuffix(base, aff); addAff('en', 's', aff, base, r.w, en, hi, r.rule); }
  });
  AFF_DEV.split('\n').forEach((ln) => { const [lg, type, aff, base, w, en, hi] = ln.split('|'); addAff(lg, type, aff, base, w, en, hi, null); });
  const COMP = { en: {}, hi: {}, sa: {} };
  COMP_LINES.split('\n').forEach((ln) => { const [lg, a, b, en, hi] = ln.split('|'); COMP[lg][a + b] = { w: a + b, parts: [a, b], mean: T2(en, hi) }; });
  const SAN = {};
  SAN_LINES.split('\n').forEach((ln) => { const [a, b, en, hi] = ln.split('|'); const r = sandhi(a, b); SAN[r.w] = { w: r.w, parts: [a, b], mean: T2(en, hi) }; });

  // ---------------------------------------------------------------- resolving a config into items
  const MODES = ['phonics', 'spelling', 'matra', 'syllables', 'affix', 'compound', 'sandhi'];
  const LANGS = ['en', 'hi', 'sa'];
  const WORD_MODES = ['phonics', 'spelling', 'syllables', 'affix', 'compound', 'sandhi'];
  const strArr = (a) => Array.isArray(a) && a.every((x) => typeof x === 'string' && x);
  // prepare(cfg) -> { items, errs }. An item is { w, units, parts, roles, pic, mean, rule, ... } ready to draw.
  function prepare(c) {
    const errs = [], items = [];
    const mode = c.mode, lang = c.lang;
    if (!Array.isArray(c.words) || c.words.length < 1 || c.words.length > 12) { errs.push('words: 1 to 12 words'); return { items, errs }; }
    const seen = new Set();
    c.words.forEach((x, i) => {
      const at = `words[${i}]`;
      if (!x || typeof x !== 'object' || typeof x.w !== 'string' || !x.w) { errs.push(`${at}: needs w (the word)`); return; }
      Object.keys(x).forEach((k) => { if (!['w', 'pic', 'meaning', 'parts'].includes(k)) errs.push(`${at}: unknown key ${k}`); });
      const w = x.w;
      if (seen.has(w)) { errs.push(`${at}: ${w} is listed twice`); return; }
      seen.add(w);
      if (w.length > 24) { errs.push(`${at}: ${w} is too long (24 characters at most)`); return; }
      if (!wordOK(w, lang)) { errs.push(`${at}: "${w}" is not written in ${lang === 'en' ? 'English letters only' : 'Devanagari letters only (no spaces, digits or marks that start a word)'}`); return; }
      if (x.pic != null && (typeof x.pic !== 'string' || !x.pic)) errs.push(`${at}: pic must be a picture id or asset id`);
      let mean = null;
      if (x.meaning != null) {
        if (!x.meaning || typeof x.meaning.en !== 'string' || typeof x.meaning.hi !== 'string' || !x.meaning.en || !x.meaning.hi) errs.push(`${at}: meaning needs en and hi`);
        else mean = x.meaning;
      }
      if (x.parts != null && !strArr(x.parts)) { errs.push(`${at}: parts must be an array of strings`); return; }
      const it = { w, pic: x.pic || null, mean, lang };
      if (mode === 'phonics') {
        let u;
        if (x.parts) {
          if (x.parts.join('') !== w) { errs.push(`${at}: parts must join to ${w}`); return; }
          if (lang === 'en' ? !x.parts.every((p) => enOK(p) && p.length <= 3) : !x.parts.every((p) => aksharas(p).length === 1 && validAkshar(p))) { errs.push(`${at}: each sound part must be one sound (up to 3 letters) or one akshar`); return; }
          u = x.parts;
        } else u = lang === 'en' ? enUnits(w) : aksharas(w);
        if (u.length < 2) { errs.push(`${at}: "${w}" has only one sound unit; use a longer word`); return; }
        it.units = u;
      } else if (mode === 'spelling') {
        if (x.parts) { errs.push(`${at}: parts is not used in spelling mode`); return; }
        it.units = letterUnits(w, lang);
        if (it.units.length < 2) { errs.push(`${at}: "${w}" is too short to spell`); return; }
      } else if (mode === 'syllables') {
        const u = letterUnits(w, lang);
        let parts;
        if (lang === 'en') {
          parts = x.parts || SYL_EN[w.toLowerCase()];
          if (!parts) { errs.push(`${at}: the syllables of "${w}" are not known; give parts, e.g. ["but","ter","fly"]`); return; }
          if (parts.join('').toLowerCase() !== w.toLowerCase()) { errs.push(`${at}: parts must join to ${w}`); return; }
          if (parts.length < 2) { errs.push(`${at}: "${w}" has one syllable; there is nothing to split`); return; }
          if (!parts.every((p) => /[aeiouyAEIOUY]/.test(p))) { errs.push(`${at}: every syllable needs a vowel sound`); return; }
          it.cuts = []; let n = 0;
          parts.slice(0, -1).forEach((p) => { n += p.length; it.cuts.push(n); });
        } else {
          parts = u;
          if (x.parts && (x.parts.length !== u.length || x.parts.some((p, k) => p !== u[k]))) { errs.push(`${at}: the aksharas of ${w} are ${u.join(' - ')}`); return; }
          if (u.length < 2) { errs.push(`${at}: "${w}" has one akshar; there is nothing to split`); return; }
          it.cuts = u.slice(0, -1).map((_, k) => k + 1);
        }
        it.units = u; it.parts = parts;
      } else if (mode === 'affix') {
        if (x.parts) { errs.push(`${at}: parts is not used in affix mode (the word is looked up in the known prefix and suffix words)`); return; }
        const a = AFF[lang][w];
        if (!a) { errs.push(`${at}: "${w}" is not a known prefix or suffix word in ${lang}. Known: ${Object.keys(AFF[lang]).slice(0, 8).join(', ')}…`); return; }
        Object.assign(it, a, { mean: mean || a.mean });
      } else if (mode === 'compound') {
        let a = COMP[lang][w];
        if (x.parts) {
          if (x.parts.length < 2 || x.parts.length > 3) { errs.push(`${at}: a compound has 2 or 3 parts`); return; }
          if (x.parts.join('') !== w) { errs.push(`${at}: parts must join to ${w}`); return; }
          if (!x.parts.every((p) => wordOK(p, lang) && (lang === 'en' ? p.length >= 2 : true))) { errs.push(`${at}: every part must be a real word piece in ${lang}`); return; }
          a = { w, parts: x.parts, mean: null };
        }
        if (!a) { errs.push(`${at}: "${w}" is not a known compound in ${lang}; give parts that join to it`); return; }
        Object.assign(it, { parts: a.parts, mean: mean || a.mean });
      } else if (mode === 'sandhi') {
        let pr = x.parts;
        const known = SAN[w];
        if (!pr) { if (!known) { errs.push(`${at}: "${w}" is not a known sandhi word; give parts [first, second]`); return; } pr = known.parts; }
        if (pr.length !== 2 || !pr.every((p) => devOK(p))) { errs.push(`${at}: sandhi parts are two Devanagari words`); return; }
        const r = sandhi(pr[0], pr[1]);
        if (!r) { errs.push(`${at}: ${pr[0]} + ${pr[1]} is not a svar sandhi this template can work out`); return; }
        if (r.w !== w) { errs.push(`${at}: ${pr[0]} + ${pr[1]} makes ${r.w}, not ${w}`); return; }
        Object.assign(it, { parts: pr, sd: r, mean: mean || (known && known.mean) || null });
      }
      items.push(it);
    });
    return { items, errs };
  }

  // ---------------------------------------------------------------- pictures
  const star = (cx, cy, R, r) => Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, d = i % 2 ? r : R; return `${(cx + d * Math.cos(a)).toFixed(1)},${(cy + d * Math.sin(a)).toFixed(1)}`; }).join(' ');
  const PIC = {
    cat: '<path d="M30 40l8-24 14 16h16l14-16 8 24c6 8 8 16 8 24 0 18-18 28-38 28S22 82 22 64c0-8 2-16 8-24z" fill="#F4A259"/><circle cx="48" cy="56" r="5" fill="#1E293B"/><circle cx="72" cy="56" r="5" fill="#1E293B"/><path d="M56 66h8l-4 5z" fill="#C2410C"/><path d="M40 68h-16M40 72l-14 4M80 68h16M80 72l14 4" stroke="#1E293B" stroke-width="2" stroke-linecap="round"/>',
    sun: '<circle cx="60" cy="50" r="22" fill="#FFD23F" stroke="#F5B90A" stroke-width="3"/>' + Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * 2 * Math.PI; return `<line x1="${(60 + 30 * Math.cos(a)).toFixed(1)}" y1="${(50 + 30 * Math.sin(a)).toFixed(1)}" x2="${(60 + 42 * Math.cos(a)).toFixed(1)}" y2="${(50 + 42 * Math.sin(a)).toFixed(1)}" stroke="#F5B90A" stroke-width="5" stroke-linecap="round"/>`; }).join('') + '<circle cx="52" cy="46" r="3" fill="#C2410C"/><circle cx="68" cy="46" r="3" fill="#C2410C"/><path d="M50 56q10 9 20 0" stroke="#C2410C" stroke-width="3" fill="none" stroke-linecap="round"/>',
    bus: '<rect x="14" y="24" width="92" height="50" rx="10" fill="#FF7A1A"/><rect x="22" y="32" width="18" height="16" rx="3" fill="#E5ECFE"/><rect x="46" y="32" width="18" height="16" rx="3" fill="#E5ECFE"/><rect x="70" y="32" width="18" height="16" rx="3" fill="#E5ECFE"/><rect x="92" y="32" width="8" height="28" rx="2" fill="#E5ECFE"/><rect x="14" y="56" width="92" height="5" fill="#C2410C"/><circle cx="34" cy="76" r="9" fill="#1E293B"/><circle cx="86" cy="76" r="9" fill="#1E293B"/><circle cx="34" cy="76" r="3" fill="#CBD5E1"/><circle cx="86" cy="76" r="3" fill="#CBD5E1"/>',
    pen: '<g transform="rotate(-30 60 50)"><rect x="18" y="41" width="70" height="16" rx="5" fill="#1D4ED8"/><rect x="18" y="41" width="70" height="6" rx="3" fill="#3B82F6"/><path d="M88 41l16 8-16 8z" fill="#F4D9A8"/><path d="M98 46l6 3-6 3z" fill="#1E293B"/><rect x="10" y="43" width="10" height="12" rx="3" fill="#FFD23F"/></g>',
    fish: '<ellipse cx="54" cy="50" rx="34" ry="22" fill="#FF7A1A"/><path d="M84 50l22-18v36z" fill="#F5B90A"/><path d="M50 30q8-12 22-6l-6 12z" fill="#C2410C"/><circle cx="38" cy="44" r="5" fill="#fff"/><circle cx="37" cy="44" r="2.5" fill="#1E293B"/><path d="M60 38q6 12 0 24M70 40q5 10 0 20" stroke="#C2410C" stroke-width="2" fill="none"/>',
    ship: '<path d="M14 62h92l-14 22H30z" fill="#1D4ED8"/><rect x="26" y="52" width="68" height="10" fill="#E5ECFE"/><rect x="54" y="20" width="4" height="34" fill="#1E293B"/><path d="M58 22l32 26H58z" fill="#FFD23F"/><path d="M52 28L32 48h20z" fill="#FF6B57"/><path d="M0 90q15-8 30 0t30 0 30 0 30 0" stroke="#02CFF9" stroke-width="4" fill="none"/>',
    book: '<path d="M60 30c-12-8-30-8-44-2v50c14-6 32-6 44 2z" fill="#8B3DFF"/><path d="M60 30c12-8 30-8 44-2v50c-14-6-32-6-44 2z" fill="#A66BFF"/><path d="M60 30v50" stroke="#4400F0" stroke-width="3"/><path d="M24 40q16-4 30 2M24 52q16-4 30 2M66 42q14-6 30-2M66 54q14-6 30-2" stroke="#fff" stroke-width="2.5" fill="none" opacity=".8"/>',
    ball: '<circle cx="60" cy="52" r="32" fill="#FF6B57"/><path d="M28 52a32 32 0 0 1 64 0" fill="#FFD23F"/><path d="M28 52h64" stroke="#fff" stroke-width="5"/><circle cx="60" cy="52" r="32" fill="none" stroke="#C2410C" stroke-width="3"/><path d="M60 20q-14 32 0 64" stroke="#fff" stroke-width="3" fill="none"/>',
    tree: '<rect x="54" y="56" width="12" height="32" fill="#8B5A2B"/><circle cx="60" cy="38" r="26" fill="#22C55E"/><circle cx="42" cy="50" r="17" fill="#16A34A"/><circle cx="78" cy="50" r="17" fill="#16A34A"/><circle cx="52" cy="32" r="6" fill="#4ADE80" opacity=".7"/>',
    house: '<rect x="26" y="48" width="68" height="40" fill="#FFD23F"/><path d="M18 50L60 16l42 34z" fill="#FF6B57"/><rect x="52" y="62" width="16" height="26" rx="3" fill="#8B5A2B"/><rect x="33" y="58" width="14" height="14" rx="2" fill="#E5ECFE"/><rect x="73" y="58" width="14" height="14" rx="2" fill="#E5ECFE"/><rect x="76" y="22" width="9" height="18" fill="#C2410C"/>',
    moon: '<path d="M78 14a38 38 0 1 0 0 72 30 30 0 1 1 0-72z" fill="#FFD23F" stroke="#F5B90A" stroke-width="3"/><circle cx="42" cy="44" r="4" fill="#F5B90A"/><circle cx="50" cy="66" r="6" fill="#F5B90A" opacity=".7"/><circle cx="96" cy="26" r="3" fill="#fff"/><circle cx="100" cy="70" r="2.5" fill="#fff"/>',
    flower: '<rect x="57" y="52" width="6" height="38" fill="#16A34A"/><path d="M60 78q-22-6-26-20 20 0 26 20zM60 72q20-4 26-18-20-2-26 18z" fill="#22C55E"/>' + Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * 2 * Math.PI; return `<circle cx="${(60 + 17 * Math.cos(a)).toFixed(1)}" cy="${(36 + 17 * Math.sin(a)).toFixed(1)}" r="11" fill="#FF6B9D"/>`; }).join('') + '<circle cx="60" cy="36" r="9" fill="#FFD23F"/>',
    apple: '<path d="M60 30c-14-10-36-4-36 20 0 22 16 38 28 38 4 0 6-2 8-2s4 2 8 2c12 0 28-16 28-38 0-24-22-30-36-20z" fill="#EF4444"/><path d="M60 30q2-14 12-18" stroke="#8B5A2B" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M62 22q14-12 24-4-8 12-24 4z" fill="#22C55E"/><ellipse cx="42" cy="48" rx="6" ry="10" fill="#fff" opacity=".35"/>',
    star: `<polygon points="${star(60, 52, 40, 17)}" fill="#FFD23F" stroke="#F5B90A" stroke-width="3" stroke-linejoin="round"/><circle cx="52" cy="50" r="3" fill="#C2410C"/><circle cx="68" cy="50" r="3" fill="#C2410C"/><path d="M52 60q8 7 16 0" stroke="#C2410C" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  };
  const picSvg = (id) => (PIC[id] ? `<svg viewBox="0 0 120 100" aria-hidden="true" focusable="false">${PIC[id]}</svg>` : '');

  // ---------------------------------------------------------------- styles
  const CSS = `
.wd { container-type: inline-size; max-width: 700px; margin: 0 auto; padding: 10px 2px 18px; display: flex; flex-direction: column; align-items: center; gap: 16px; font-family: var(--font-body, system-ui); color: var(--ink, #1E293B); }
.wd [lang=hi] { font-family: var(--font-display, 'Baloo 2'), var(--font-body, system-ui), sans-serif; }
.wd button { font-family: inherit; cursor: pointer; }
.wd-card { width: 100%; display: flex; align-items: center; justify-content: center; gap: 14px; background: linear-gradient(135deg, var(--surface, #fff) 55%, rgba(15,118,110,.10)); border: 1px solid var(--line, #E2E8F0); border-radius: 20px; padding: 12px 16px; box-shadow: 0 6px 18px rgba(15,23,42,.08); position: relative; }
.wd-pic { width: 112px; flex: none; aspect-ratio: 6/5; display: grid; place-items: center; border-radius: 16px; background: linear-gradient(160deg, #E8FBF7, #DCEBFF); overflow: hidden; }
.wd-pic svg, .wd-pic img { width: 100%; height: 100%; object-fit: contain; display: block; }
.wd-badge { font-family: var(--font-display, 'Baloo 2'); font-weight: 800; font-size: 2.6rem; color: #0F766E; }
.wd-side { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; min-width: 0; flex: 1; }
.wd-clue { font-size: 1.05rem; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
.wd-count { font-size: .85rem; color: var(--ink-2, #475569); font-weight: 600; }
.wd-dots { display: flex; gap: 6px; }
.wd-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--line, #CBD5E1); }
.wd-dot.on { background: #FF7A1A; box-shadow: 0 0 0 3px rgba(255,122,26,.25); }
.wd-dot.ok { background: #22C55E; }
.wd-btn { border: 0; border-radius: 14px; min-height: 48px; padding: 0 18px; font-weight: 700; font-size: 1.02rem; display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: linear-gradient(180deg, #14B8A6, #0F766E); color: #fff; box-shadow: 0 4px 0 #0B4F4A; transition: transform .1s, box-shadow .1s; }
.wd-btn:active { transform: translateY(3px); box-shadow: 0 1px 0 #0B4F4A; }
.wd-btn.alt { background: linear-gradient(180deg, #FFB547, #FF7A1A); color: #1E293B; box-shadow: 0 4px 0 #C2410C; }
.wd-btn.alt:active { box-shadow: 0 1px 0 #C2410C; }
.wd-btn.pale { background: var(--surface, #fff); color: var(--ink, #1E293B); border: 1.5px solid var(--line, #CBD5E1); box-shadow: 0 3px 0 var(--line, #CBD5E1); }
.wd-btn[aria-disabled=true] { opacity: .45; box-shadow: none; }
.wd-btn:focus-visible, .wd-tile:focus-visible, .wd-ltr:focus-visible { outline: 3px solid #FF7A1A; outline-offset: 2px; }
.wd-slots { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; width: 100%; }
.wd-slot { min-width: 56px; height: 72px; padding: 0 8px; border-radius: 16px; border: 3px dashed var(--line, #CBD5E1); display: grid; place-items: center; font-family: var(--font-display, 'Baloo 2'); font-weight: 800; font-size: 2.2rem; background: var(--surface, #fff); transition: border-color .2s, background .2s; }
.wd-slot.full { border-style: solid; border-color: #22C55E; color: var(--good, #15803D); animation: wd-pop .3s ease; }
.wd-slot.typed { border-style: solid; border-color: #2563EB; color: #2563EB; animation: wd-pop .3s ease; }
.wd-slot.bad { border-style: solid; border-color: #EF4444; color: #DC2626; animation: wd-shake .45s ease; }
.wd-slot.next { border-color: #FFD23F; box-shadow: 0 0 0 4px rgba(255,210,63,.3); }
.wd-slot small { display: block; font: 600 .62rem var(--font-body, system-ui); color: var(--ink-2, #475569); text-align: center; margin-top: -4px; }
.wd-tiles { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; width: 100%; }
.wd-tile { min-width: 56px; height: 56px; padding: 0 10px; border-radius: 14px; border: 0; background: linear-gradient(180deg, #2563EB, #1D4ED8); color: #fff; font-family: var(--font-display, 'Baloo 2'); font-weight: 800; font-size: 1.6rem; box-shadow: 0 4px 0 #1E3A8A; transition: transform .1s, box-shadow .1s; }
.wd-tile:active { transform: translateY(3px); box-shadow: 0 1px 0 #1E3A8A; }
.wd-tile.digraph { background: linear-gradient(180deg, #8B3DFF, #6D28D9); box-shadow: 0 4px 0 #4C1D95; }
.wd-spelling .wd-tile { background: linear-gradient(180deg, #14B8A6, #0F766E); box-shadow: 0 4px 0 #0B4F4A; }
.wd-tile.big { min-width: 68px; height: 68px; font-size: 2.1rem; background: linear-gradient(180deg, #0F9A8E, #0F766E); box-shadow: 0 4px 0 #0B4F4A; }
.wd-tile.big.on { background: linear-gradient(180deg, #FFB547, #FF7A1A); color: #1E293B; box-shadow: 0 4px 0 #C2410C; }
.wd-tile.sign { background: linear-gradient(180deg, #8B3DFF, #6D28D9); box-shadow: 0 4px 0 #4C1D95; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; padding-top: 4px; }
.wd-tile.sign i { font: 600 .62rem var(--font-body, system-ui); font-style: normal; opacity: .85; margin-top: 2px; }
.wd-chip.pre { background: linear-gradient(180deg, #FFB547, #FF7A1A); color: #1E293B; box-shadow: 0 4px 0 #C2410C; }
.wd-chip.base { background: linear-gradient(180deg, #2563EB, #1D4ED8); box-shadow: 0 4px 0 #1E3A8A; }
.wd-chip.suf { background: linear-gradient(180deg, #8B3DFF, #6D28D9); box-shadow: 0 4px 0 #4C1D95; }
.wd-chip.c1 { background: linear-gradient(180deg, #14B8A6, #0F766E); box-shadow: 0 4px 0 #0B4F4A; }
.wd-chip.c2 { background: linear-gradient(180deg, #8B3DFF, #6D28D9); box-shadow: 0 4px 0 #4C1D95; }
.wd-chip.c3 { background: linear-gradient(180deg, #FFB547, #FF7A1A); color: #1E293B; box-shadow: 0 4px 0 #C2410C; }
.wd-chip.c4 { background: linear-gradient(180deg, #FF8A78, #FF6B57); color: #1E293B; box-shadow: 0 4px 0 #B83B2B; }
.wd-foot { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; justify-content: center; min-height: 52px; width: 100%; }
.wd-msg { font-size: 1.05rem; text-align: center; color: var(--ink-2, #475569); max-width: 560px; }
.wd-done { font-size: 1.15rem; text-align: center; }
.wd-done b { display: block; font-family: var(--font-display, 'Baloo 2'); font-size: 2rem; color: var(--good, #15803D); line-height: 1.2; }
.wd-rule { background: linear-gradient(135deg, rgba(139,61,255,.10), rgba(2,207,249,.10)); border: 1px solid var(--line, #E2E8F0); border-radius: 14px; padding: 10px 14px; font-size: .98rem; text-align: left; width: 100%; line-height: 1.45; }
.wd-rule b { color: #6D28D9; }
.wd-legend { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; font-size: .8rem; font-weight: 700; }
.wd-legend span { padding: 2px 10px; border-radius: 99px; }
.wd-legend .pre { background: #FFB547; color: #1E293B; } .wd-legend .base { background: #2563EB; color: #fff; } .wd-legend .suf { background: #8B3DFF; color: #fff; }
.wd-plus { align-self: center; font: 800 1.8rem var(--font-display, 'Baloo 2'); color: var(--ink-2, #475569); }
.wd-build { display: flex; flex-wrap: wrap; justify-content: center; align-items: flex-end; gap: 10px; width: 100%; }
.wd-build.joined { animation: wd-merge .6s ease forwards; }
.wd-build.joined .wd-slot { border-style: solid; border-color: #22C55E; color: #15803D; border-radius: 0; margin-inline: -5px; }
.wd-build.joined .wd-plus { display: none; }
.wd-build.joined .wd-slot:first-of-type { border-radius: 16px 0 0 16px; } .wd-build.joined .wd-slot:last-of-type { border-radius: 0 16px 16px 0; }
.wd-eq { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 10px; font-family: var(--font-display, 'Baloo 2'); font-weight: 800; font-size: clamp(2rem, 11cqw, 3.4rem); background: var(--surface, #fff); border: 1px solid var(--line, #E2E8F0); border-radius: 20px; padding: 6px 20px; width: 100%; box-shadow: 0 6px 18px rgba(15,23,42,.08); }
.wd-op { color: var(--ink-2, #475569); font-size: .7em; }
.wd-sign { color: #8B3DFF; } .wd-res { color: #15803D; min-width: 1.4em; text-align: center; } .wd-res.pop { animation: wd-pop .4s ease; }
.wd-ex { font-size: 1.3rem; min-height: 1.7em; text-align: center; } .wd-ex b { color: #0F766E; font-size: 1.15em; }
.wd-coll { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; min-height: 34px; }
.wd-coll span { background: #E8FBF7; color: #0F766E; border-radius: 10px; padding: 2px 10px; font: 700 1.2rem var(--font-display, 'Baloo 2'); }
.wd-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; width: 100%; }
.wd-word { display: flex; flex-wrap: wrap; justify-content: center; align-items: flex-end; gap: 0; row-gap: 8px; width: 100%; padding: 10px 0; }
.wd-ltr { min-width: 44px; height: 64px; padding: 0 4px; border: 0; border-radius: 12px; font-family: var(--font-display, 'Baloo 2'); font-weight: 800; font-size: 2.1rem; color: #fff; display: inline-grid; place-items: center; transition: background .25s, transform .15s; }
span.wd-ltr { cursor: default; }
.wd-ltr.s0 { background: linear-gradient(180deg, #2563EB, #1D4ED8); } .wd-ltr.s1 { background: linear-gradient(180deg, #14B8A6, #0F766E); } .wd-ltr.s2 { background: linear-gradient(180deg, #8B3DFF, #6D28D9); } .wd-ltr.s3 { background: linear-gradient(180deg, #FF8A78, #E24B36); }
.wd-ltr.hit { transform: translateY(-10px) scale(1.12); }
.wd-ltr[aria-pressed=true]::after { content: ''; }
.wd-cut { width: 6px; align-self: stretch; margin: 0 6px; border-radius: 3px; background: repeating-linear-gradient(180deg, #FFD23F 0 6px, transparent 6px 10px); }
.wd-parts { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
.wd-parts span { padding: 6px 16px; border-radius: 14px; font: 800 1.8rem var(--font-display, 'Baloo 2'); color: #fff; animation: wd-pop .35s ease backwards; }
.wd-shake { animation: wd-shake .45s ease; }
@keyframes wd-shake { 20%, 60% { transform: translateX(-6px); } 40%, 80% { transform: translateX(6px); } }
@keyframes wd-pop { from { transform: scale(.6); } 70% { transform: scale(1.12); } to { transform: none; } }
@keyframes wd-merge { from { gap: 10px; } to { gap: 0; } }
@container (max-width: 480px) {
  .wd-card { flex-direction: column; text-align: center; } .wd-side { align-items: center; } .wd-pic { width: 100px; }
  .wd-slot { min-width: 46px; height: 62px; font-size: 1.9rem; } .wd-tile { min-width: 48px; height: 52px; font-size: 1.4rem; } .wd-tile.big { min-width: 58px; height: 60px; }
  .wd-ltr { min-width: 40px; height: 58px; font-size: 1.8rem; }
}
@media (prefers-reduced-motion: reduce) { .wd *, .wd *::before, .wd *::after { animation: none !important; transition: none !important; } }
`;

  // ---------------------------------------------------------------- the mounted template
  function build(root, cfg, api) {
    const lang = cfg.lang, mode = cfg.mode;
    const spk = lang === 'en' ? 'en' : 'hi';
    const lg = lang === 'en' ? 'en' : 'hi';
    const t = (x) => api.t(x);
    const items = mode === 'matra' ? [] : prepare(cfg).items;
    const S = { wi: 0, typed: [], cuts: new Set(), slots: [], done: false, bad: false, hints: 0, c: null, made: null, coll: [], hit: -1, tries: 0, msg: null };
    let alive = true;
    const timers = [];
    const later = (fn, ms) => { timers.push(setTimeout(() => { if (alive) fn(); }, ms)); };
    const cur = () => items[S.wi];
    const ok = (...keys) => keys.some((k) => api.allowed(k));
    const gate = (...keys) => { if (ok(...keys)) return true; api.nudge(keys[0]); return false; };

    // ---- shared pieces
    function picHTML(it) {
      const a = it.pic && api.asset ? api.asset(it.pic) : null;
      if (a) return `<img src="${esc(a)}" alt="${esc(it.mean ? t(it.mean) : it.w)}">`;
      if (it.pic && PIC[it.pic]) return picSvg(it.pic);
      const first = lang === 'en' ? it.w[0].toUpperCase() : aksharas(it.w)[0];
      return `<span class="wd-badge" lang="${lg}" aria-hidden="true">${esc(first)}</span>`;
    }
    function cardHTML(it, extra) {
      const dots = items.length > 1 ? `<div class="wd-dots" aria-label="${esc(t(T2(`Word ${S.wi + 1} of ${items.length}`, `शब्द ${S.wi + 1} / ${items.length}`)))}">${items.map((_, i) => `<span class="wd-dot ${i < S.wi || (i === S.wi && S.done) ? 'ok' : i === S.wi ? 'on' : ''}"></span>`).join('')}</div>` : '';
      const clue = it.mean ? `<div class="wd-clue">${esc(t(it.mean))}</div>` : '';
      return `<div class="wd-card"><div class="wd-pic">${picHTML(it)}</div><div class="wd-side">${clue}${extra || ''}<button type="button" class="wd-btn pale" data-key="listen"><span aria-hidden="true">🔊</span> ${esc(t(T2('Listen', 'सुनो')))}</button>${dots}</div></div>`;
    }
    function footHTML(doneHTML, helpHTML, extraBtns) {
      const more = S.wi + 1 < items.length;
      const next = items.length > 1 ? `<button type="button" class="wd-btn alt" data-key="next" ${S.done && more ? '' : 'aria-disabled="true"'}>${esc(t(T2('Next word', 'अगला शब्द')))} →</button>` : '';
      const again = S.done && !more ? `<button type="button" class="wd-btn alt" data-key="again">↻ ${esc(t(T2('Play again', 'फिर से खेलो')))}</button>` : '';
      return `<div class="wd-foot"><div class="wd-msg" role="status" aria-live="polite">${S.done ? doneHTML : helpHTML}</div></div><div class="wd-foot">${extraBtns || ''}${next}${again}</div>`;
    }
    const poolSorted = (arr) => arr.slice().sort((a, b) => a.localeCompare(b, lang === 'en' ? 'en' : 'hi'));
    const hashN = (s) => { let h = 7; for (const ch of s) h = (h * 31 + cp(ch)) >>> 0; return h; };

    // ---- phonics and spelling
    function poolUnits() {
      const set = new Set();
      items.forEach((it) => it.units.forEach((u) => set.add(u)));
      if (cfg.extra) letterUnits(cfg.extra, lang).forEach((u) => set.add(u));
      return poolSorted([...set]);
    }
    function slotsView(it) {
      const n = it.units.length;
      const html = it.units.map((u, i) => {
        const v = S.typed[i];
        let cls = '';
        if (mode === 'phonics') cls = v ? 'full' : i === S.typed.length && !S.done ? 'next' : '';
        else cls = v ? (S.bad && v !== u ? 'bad' : S.done ? 'full' : 'typed') : i === S.typed.length && !S.done ? 'next' : '';
        return `<span class="wd-slot ${cls}" lang="${lg}">${v ? esc(v) : ''}</span>`;
      }).join('');
      return `<div class="wd-slots" role="group" aria-label="${esc(t(T2(`${n} places`, `${n} स्थान`)))}">${html}</div>`;
    }
    function drawLetters() {
      const it = cur();
      const pool = poolUnits();
      const tiles = pool.map((u) => `<button type="button" class="wd-tile ${mode === 'phonics' && [...u].length > 1 && lang === 'en' ? 'digraph' : ''}" data-key="pick:${esc(u)}" data-u="${esc(u)}" lang="${lg}">${esc(u)}</button>`).join('');
      const builtTxt = S.done ? `${t(T2('You built ', 'तुमने बनाया: '))}<b lang="${lg}">${esc(it.w)}</b>` : '';
      const help = mode === 'phonics'
        ? t(T2('Tap the sounds in order. Purple tiles are two letters that make one sound.', 'ध्वनियों को क्रम से टैप करो।'))
        : S.bad ? t(T2('Not quite. Use the back button, or ask for a hint.', 'ठीक नहीं बना। मिटाओ या संकेत माँगो।')) : t(T2('Listen, then spell the word.', 'सुनो, फिर शब्द की वर्तनी बनाओ।'));
      const extraBtns = mode === 'spelling' && !S.done
        ? `<button type="button" class="wd-btn pale" data-key="undo" aria-label="${esc(t(T2('Take back the last letter', 'आखिरी अक्षर मिटाओ')))}">⌫</button><button type="button" class="wd-btn pale" data-key="hint">💡 ${esc(t(T2('Hint', 'संकेत')))}</button>` : '';
      const note = mode === 'phonics' && lang === 'en' && it.units.some((u) => u.length > 1) && !S.done ? '' : '';
      root.innerHTML = `<div class="wd wd-${mode}" lang="${lang === 'en' ? 'en' : 'hi'}">${cardHTML(it)}${slotsView(it)}<div class="wd-tiles" data-key="tiles" role="group" aria-label="${esc(t(T2('Letters', 'अक्षर')))}">${tiles}</div>${note}${footHTML(builtTxt, help, extraBtns)}</div>`;
    }
    function finishWord(it) {
      S.done = true;
      api.emit('word:' + it.w);
      api.record(t(T2('Built the word ', 'शब्द बनाया: ')) + it.w);
      api.celebrate();
      drawLetters();
      later(() => api.speak((mode === 'phonics' ? it.units.join(' ... ') + ' ... ' : '') + it.w, spk), 250);
    }
    function onPick(u, el) {
      const it = cur();
      if (S.done) return;
      if (mode === 'phonics') {
        if (u === it.units[S.typed.length]) {
          S.typed.push(u); api.speak(u, spk); api.emit('pick:' + u);
          if (S.typed.length === it.units.length) return finishWord(it);
          drawLetters();
        } else {
          if (el) { el.classList.add('wd-shake'); later(() => el.classList.remove('wd-shake'), 500); }
          api.toast(T2(`Listen again: ${it.units.join(' - ')}`, `फिर से सुनो: ${it.units.join(' - ')}`));
          api.record(t(T2(`Tried ${u} instead of ${it.units[S.typed.length]}`, `${it.units[S.typed.length]} की जगह ${u} चुना`)));
        }
      } else {
        if (S.typed.length >= it.units.length) return;
        S.typed.push(u); api.emit('pick:' + u); api.speak(u, spk);
        S.bad = false;
        if (S.typed.length === it.units.length) {
          if (S.typed.every((x, i) => x === it.units[i])) return finishWord(it);
          S.bad = true; S.tries++;
          api.record(t(T2('Spelled ', 'वर्तनी बनाई: ')) + S.typed.join('') + ' (' + it.w + ')');
          api.toast(T2('Not quite. Check each letter.', 'ठीक नहीं बना। हर अक्षर जाँचो।'));
        }
        drawLetters();
      }
    }

    // ---- matra
    function drawMatra() {
      const ex = cfg.examples || {};
      const m = S.made;
      let exHTML = `<div class="wd-ex">&nbsp;</div>`;
      if (m && ex[m.r]) {
        const w = ex[m.r], i = w.indexOf(m.r);
        exHTML = `<div class="wd-ex" lang="hi">${esc(m.r)} ${esc(t(T2('as in', 'से')))} <b>${i >= 0 ? esc(w.slice(0, i)) + '<u>' + esc(m.r) + '</u>' + esc(w.slice(i + m.r.length)) : esc(w)}</b></div>`;
      } else if (m) exHTML = `<div class="wd-ex" lang="hi">${esc(m.r)}</div>`;
      const info = m ? MATRAS[m.m] : null;
      const posTxt = info ? `<div class="wd-msg"><span lang="hi" style="font-size:1.4em">◌${esc(m.m)}</span> ${esc(t(info.pos))}.</div>` : `<div class="wd-msg">${esc(t(T2('Pick a letter, then a vowel sign.', 'पहले अक्षर चुनो, फिर मात्रा।')))}</div>`;
      root.innerHTML = `<div class="wd wd-matra" lang="hi">
        <div class="wd-row" role="group" aria-label="${esc(t(T2('Letters', 'अक्षर')))}">${cfg.consonants.map((k) => `<button type="button" class="wd-tile big ${S.c === k ? 'on' : ''}" data-key="pick:${esc(k)}" aria-pressed="${S.c === k}" lang="hi">${esc(k)}</button>`).join('')}</div>
        <div class="wd-eq" role="status" aria-live="polite" aria-label="${esc(m ? m.r : '')}"><span>${esc(S.c || '?')}</span><span class="wd-op">+</span><span class="wd-sign">${m ? '◌' + esc(m.m) : '◌'}</span><span class="wd-op">=</span><span class="wd-res ${m ? 'pop' : ''}">${m ? esc(m.r) : ''}</span></div>
        ${exHTML}${posTxt}
        <div class="wd-row" role="group" aria-label="${esc(t(T2('Vowel signs', 'मात्राएँ')))}">${cfg.matras.map((s) => `<button type="button" class="wd-tile sign" data-key="matra:${esc(s)}" lang="hi" aria-label="${esc(t(T2(`vowel sign ${MATRAS[s].s}`, `मात्रा ${s}`)))}">◌${esc(s)}<i>${esc(MATRAS[s].s)}</i></button>`).join('')}</div>
        ${S.coll.length ? `<div class="wd-coll" lang="hi" aria-label="${esc(t(T2('Aksharas you made', 'तुम्हारे बनाए अक्षर')))}">${S.coll.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
      </div>`;
    }

    // ---- syllables
    const segOf = (i) => { let k = 0; S.cuts.forEach((c) => { if (c <= i) k++; }); return k; };
    function drawSyl() {
      const it = cur();
      const n = it.units.length;
      const letters = it.units.map((u, i) => {
        const hit = S.hit >= 0 && segOf(i) === S.hit ? ' hit' : '';
        const cl = `wd-ltr s${segOf(i) % 4}${hit}`;
        if (i === n - 1) return `<span class="${cl}" lang="${lg}">${esc(u)}</span>`;
        return `<button type="button" class="${cl}" data-key="gap:${i + 1}" aria-pressed="${S.cuts.has(i + 1)}" aria-label="${esc(t(T2(`Split after ${u}`, `${u} के बाद तोड़ो`)))}" lang="${lg}">${esc(u)}</button>${S.cuts.has(i + 1) ? '<span class="wd-cut" aria-hidden="true"></span>' : ''}`;
      }).join('');
      const unit = lang === 'en' ? T2('syllables', 'अक्षर-खंड (सिलेबल)') : T2('aksharas', 'अक्षर');
      const doneHTML = S.done ? `<div class="wd-parts" lang="${lg}">${it.parts.map((p, i) => `<span class="wd-ltr s${i % 4}" style="min-width:0">${esc(p)}</span>`).join('')}</div>${esc(t(T2(`${it.parts.length} ${unit.en}: clap ${it.parts.length} times.`, `${it.parts.length} ${unit.hi}: ${it.parts.length} बार ताली बजाओ।`)))}` : '';
      const help = t(lang === 'en' ? T2('Tap a letter to put a cut after it. Clap to hear the beats.', 'किसी अक्षर को टैप करके उसके बाद कट लगाओ। ताली से बीट सुनो।') : T2('Tap between aksharas to cut the word. Clap to hear the beats.', 'अक्षरों के बीच टैप करके शब्द को तोड़ो। ताली से बीट सुनो।'));
      root.innerHTML = `<div class="wd wd-syllables" lang="${lang === 'en' ? 'en' : 'hi'}">${cardHTML(it)}<div class="wd-word" role="group" aria-label="${esc(t(T2('Word to split', 'तोड़ने वाला शब्द')))}">${letters}</div>${footHTML(doneHTML, help, `<button type="button" class="wd-btn pale" data-key="clap">👏 ${esc(t(T2('Clap the beats', 'ताली बजाओ')))}</button>`)}</div>`;
    }
    function sylOnGap(i, el) {
      const it = cur();
      if (S.done) return;
      if (S.cuts.has(i)) S.cuts.delete(i); else S.cuts.add(i);
      api.emit('split:' + i);
      const truth = new Set(it.cuts);
      const same = S.cuts.size === truth.size && [...S.cuts].every((c) => truth.has(c));
      if (same) {
        S.done = true; S.hit = -1; api.emit('word:' + it.w); api.record(t(T2('Split ', 'तोड़ा: ')) + it.parts.join(' - ')); api.celebrate();
        drawSyl(); later(() => api.speak(it.parts.join(' ... ') + ' ... ' + it.w, spk), 250); return;
      }
      if (S.cuts.size >= truth.size) api.toast(T2('Not there yet. Clap and listen for the beats.', 'अभी ठीक नहीं। ताली बजाकर बीट सुनो।'));
      drawSyl();
    }
    function clap() {
      const it = cur();
      api.emit('clap');
      api.speak(it.parts.join(' ... '), spk);
      const n = it.parts.length;
      if (L.reducedMotion()) return;
      const savedCuts = S.cuts, savedDone = S.done;
      S.cuts = new Set(it.cuts); // show the true beats while clapping
      for (let k = 0; k < n; k++) later(() => { S.hit = k; drawSyl(); }, 450 * k + 50);
      later(() => { S.hit = -1; S.cuts = savedCuts; S.done = savedDone; drawSyl(); }, 450 * n + 400);
    }

    // ---- affix, compound, sandhi
    function buildPool() {
      const set = [];
      const role = {};
      items.forEach((it) => it.parts.forEach((p, i) => { if (!set.includes(p)) set.push(p); if (it.roles && !role[p]) role[p] = it.roles[i]; }));
      (cfg.parts || []).forEach((p) => { if (!set.includes(p)) set.push(p); if (mode === 'affix' && !role[p]) role[p] = INV[lang].p.has(p) ? 'pre' : INV[lang].s.has(p) ? 'suf' : 'base'; });
      set.sort((a, b) => hashN(a) - hashN(b) || a.localeCompare(b));
      return { set, role };
    }
    let POOL = null;
    const SLOT_LBL = { pre: T2('prefix', 'उपसर्ग'), base: T2('word', 'शब्द'), suf: T2('suffix', 'प्रत्यय') };
    function noteHTML(it) {
      if (mode === 'affix') {
        const info = AFFIX_INFO[lang][it.aff];
        const nm = lang === 'en' ? (it.type === 'p' ? `${it.aff}-` : `-${it.aff}`) : it.aff;
        let s = `<b lang="${lg}">${esc(nm)}</b> ${esc(t(T2('means', 'का अर्थ है')))} “${esc(t(T2(info[1], info[2])))}”.`;
        if (it.rule) s += ` ${esc(t(SPELLRULE[it.rule]))}`;
        if (lang === 'sa' && it.w !== it.parts.join('')) s += ` ${esc(t(T2('सम् changes to सं when it joins a word.', 'सम् शब्द से जुड़ने पर सं हो जाता है।')))}`;
        return `<div class="wd-rule">${s}</div>`;
      }
      if (mode === 'sandhi') {
        const r = it.sd, R = SANDHI_RULES[r.rule];
        const vs = (v) => (v === 'अ' ? 'अ' : v);
        return `<div class="wd-rule" lang="hi"><b>${esc(t(R.n))}</b>: ${esc(vs(r.v1))} + ${esc(r.v2)} → <b>${esc(r.out)}</b><br>${esc(t(R.r))}</div>`;
      }
      return '';
    }
    function drawBuild() {
      const it = cur();
      if (!POOL) POOL = buildPool();
      const n = it.parts.length;
      const slots = it.parts.map((p, i) => {
        const v = S.typed[i];
        const lbl = it.roles ? `<small>${esc(t(SLOT_LBL[it.roles[i]]))}</small>` : '';
        const cls = v ? (S.done ? 'full' : S.bad ? 'bad' : 'typed') : i === S.typed.length && !S.done ? 'next' : '';
        return `${i ? '<span class="wd-plus" aria-hidden="true">+</span>' : ''}<span class="wd-slot ${cls}" lang="${lg}">${v ? esc(v) : ''}${lbl}</span>`;
      }).join('');
      const roleCls = (p, k) => (mode === 'affix' ? POOL.role[p] || 'base' : 'c' + (1 + (hashN(p) % 4)));
      const chips = POOL.set.map((p) => `<button type="button" class="wd-tile wd-chip ${roleCls(p)}" data-key="part:${esc(p)}" data-u="${esc(p)}" lang="${lg}">${esc(p)}</button>`).join('');
      const legend = mode === 'affix' ? `<div class="wd-legend"><span class="pre">${esc(t(SLOT_LBL.pre))}</span><span class="base">${esc(t(SLOT_LBL.base))}</span><span class="suf">${esc(t(SLOT_LBL.suf))}</span></div>` : '';
      const doneHTML = S.done ? `${esc(t(T2('You made ', 'तुमने बनाया: ')))}<b lang="${lg}">${esc(it.w)}</b>${noteHTML(it)}` : '';
      const helpTxt = mode === 'sandhi' ? T2('Join the two words. Pick them in order.', 'दोनों शब्दों को जोड़ो। क्रम से चुनो।')
        : mode === 'affix' ? T2('Build the word that matches the clue.', 'संकेत के अनुसार शब्द बनाओ।') : T2('Pick two words that make the word in the clue.', 'संकेत वाला शब्द बनाने के लिए दो शब्द चुनो।');
      const help = S.bad ? t(T2('That is not the word we want. Clear it and try again.', 'यह वह शब्द नहीं है जो चाहिए। मिटाकर फिर कोशिश करो।')) : t(helpTxt);
      const clear = !S.done ? `<button type="button" class="wd-btn pale" data-key="clear">⌫ ${esc(t(T2('Clear', 'मिटाओ')))}</button>` : '';
      const clueExtra = it.mean ? '' : '';
      root.innerHTML = `<div class="wd wd-${mode}" lang="${lang === 'en' ? 'en' : 'hi'}">${buildCard(it, clueExtra)}<div class="wd-build ${S.done ? 'joined' : ''}" role="group" aria-label="${esc(t(T2(`${n} places`, `${n} स्थान`)))}">${slots}</div>${legend}<div class="wd-tiles" role="group" aria-label="${esc(t(T2('Word pieces', 'शब्द के टुकड़े')))}">${chips}</div>${footHTML(doneHTML, help, clear)}</div>`;
    }
    function buildCard(it) {
      // For sandhi the clue is the meaning; the made word stays hidden until the child builds it.
      const hide = !S.done;
      const clue = it.mean ? it.mean : T2('Build the word', 'शब्द बनाओ');
      const dots = items.length > 1 ? `<div class="wd-dots">${items.map((_, i) => `<span class="wd-dot ${i < S.wi || (i === S.wi && S.done) ? 'ok' : i === S.wi ? 'on' : ''}"></span>`).join('')}</div>` : '';
      return `<div class="wd-card"><div class="wd-pic">${picHTML(it.pic ? it : Object.assign({}, it, { w: hide ? '?' : it.w }))}</div><div class="wd-side"><div class="wd-clue">${esc(t(clue))}</div><button type="button" class="wd-btn pale" data-key="listen"><span aria-hidden="true">🔊</span> ${esc(t(T2('Listen', 'सुनो')))}</button>${dots}</div></div>`;
    }
    function onPart(p) {
      const it = cur();
      if (S.done) return;
      if (S.typed.length >= it.parts.length) return;
      S.typed.push(p); api.emit('part:' + p); api.speak(p, spk);
      S.bad = false;
      if (S.typed.length === it.parts.length) {
        if (S.typed.every((x, i) => x === it.parts[i])) {
          S.done = true; api.emit('word:' + it.w); api.emit('joined:' + it.w);
          api.record(t(T2('Joined ', 'जोड़ा: ')) + it.parts.join(' + ') + ' = ' + it.w); api.celebrate();
          drawBuild(); later(() => api.speak(it.w, spk), 300); return;
        }
        S.bad = true; S.tries++;
        api.record(t(T2('Tried ', 'कोशिश: ')) + S.typed.join(' + '));
        api.toast(T2('That is not the word we want.', 'यह वह शब्द नहीं है जो चाहिए।'));
      }
      drawBuild();
    }

    // ---- events
    const draw = () => (mode === 'matra' ? drawMatra() : mode === 'syllables' ? drawSyl() : mode === 'affix' || mode === 'compound' || mode === 'sandhi' ? drawBuild() : drawLetters());
    function redraw() {
      const a = root.contains(document.activeElement) ? document.activeElement : null;
      const k = a && a.dataset ? a.dataset.key : null;
      draw();
      if (k) { const again = [...root.querySelectorAll('[data-key]')].find((e) => e.dataset.key === k); if (again && again.focus) again.focus({ preventScroll: true }); }
    }
    function resetWord() { S.typed = []; S.cuts = new Set(); S.done = false; S.bad = false; S.hit = -1; }
    function onClick(e) {
      const el = e.target.closest('[data-key]');
      if (!el || !root.contains(el)) return;
      const key = el.dataset.key;
      if (key === 'tiles') return;
      if (el.getAttribute('aria-disabled') === 'true') { if (key === 'next') api.toast(T2('Finish this word first.', 'पहले यह शब्द पूरा करो।')); return; }
      if (key === 'again') { S.wi = 0; resetWord(); POOL = null; redraw(); return; }
      if (mode === 'matra') {
        if (key.startsWith('pick:')) {
          if (!gate(key)) return;
          S.c = key.slice(5); S.made = null; redraw(); api.speak(S.c, 'hi'); api.emit(key);
        } else if (key.startsWith('matra:')) {
          if (!gate(key)) return;
          if (!S.c) { api.toast(T2('Pick a letter first.', 'पहले कोई अक्षर चुनो।')); return; }
          const m = key.slice(6);
          S.made = { m, r: S.c + m };
          if (!S.coll.includes(S.made.r)) S.coll.push(S.made.r);
          redraw();
          api.speak(S.made.r + ((cfg.examples || {})[S.made.r] ? ', ' + cfg.examples[S.made.r] : ''), 'hi');
          api.emit('make:' + S.made.r);
          api.record(t(T2('Made ', 'बनाया: ')) + S.made.r);
        }
        return;
      }
      const it = cur();
      if (key === 'listen') { if (!gate('listen')) return; api.speak(it.w, spk); api.emit('listen'); return; }
      if (key === 'next') {
        if (!gate('next')) return;
        if (S.wi + 1 >= items.length) return;
        S.wi++; resetWord(); redraw(); api.emit('next'); api.speak(cur().w, spk); return;
      }
      if (mode === 'phonics' || mode === 'spelling') {
        if (key.startsWith('pick:')) { if (!gate(key, 'tiles')) return; onPick(el.dataset.u, el); }
        else if (key === 'undo') { if (!gate('undo')) return; if (S.typed.length && !S.done) { S.typed.pop(); S.bad = false; api.emit('undo'); redraw(); } }
        else if (key === 'hint') {
          if (!gate('hint')) return;
          while (S.typed.length && S.typed.some((x, i) => x !== it.units[i])) S.typed.pop();
          if (S.typed.length < it.units.length) { S.hints++; api.emit('hint'); S.bad = false; onPick(it.units[S.typed.length], null); }
        }
      } else if (mode === 'syllables') {
        if (key.startsWith('gap:')) { if (!gate(key)) return; sylOnGap(+key.slice(4), el); }
        else if (key === 'clap') { if (!gate('clap')) return; clap(); }
      } else {
        if (key.startsWith('part:')) { if (!gate(key)) return; onPart(el.dataset.u); }
        else if (key === 'clear') { if (!gate('clear')) return; if (S.typed.length && !S.done) { S.typed = []; S.bad = false; api.emit('clear'); redraw(); } }
      }
    }
    root.addEventListener('click', onClick);
    draw();
    return {
      destroy() { alive = false; timers.forEach(clearTimeout); root.removeEventListener('click', onClick); },
    };
  }

  // ---------------------------------------------------------------- registration
  const uniq = (a) => [...new Set(a)];
  NCA_T.register({
    id: 'words',
    css: CSS,
    validate(c) {
      const e = [];
      if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
      const known = ['mode', 'lang', 'words', 'extra', 'consonants', 'matras', 'examples', 'parts'];
      Object.keys(c).forEach((k) => { if (!known.includes(k)) e.push('unknown key: ' + k); });
      if (!MODES.includes(c.mode)) e.push('mode: one of ' + MODES.join(', '));
      if (!LANGS.includes(c.lang)) e.push('lang: one of ' + LANGS.join(', '));
      if (e.length) return e;
      if ((c.mode === 'matra' || c.mode === 'sandhi') && c.lang === 'en') e.push(c.mode + ' mode is for Hindi (hi) or Sanskrit (sa), not English');
      if (c.mode === 'matra') {
        if (c.words != null) e.push('words is not used in matra mode (use consonants and matras)');
        if (!Array.isArray(c.consonants) || c.consonants.length < 1 || c.consonants.length > 14) e.push('consonants: 1 to 14 consonants');
        else {
          c.consonants.forEach((k) => { if (!validCons(k)) e.push('not a Devanagari consonant: ' + k); });
          if (new Set(c.consonants).size !== c.consonants.length) e.push('consonants: each once');
        }
        if (!Array.isArray(c.matras) || c.matras.length < 1 || c.matras.length > 13) e.push('matras: 1 to 13 vowel signs');
        else {
          c.matras.forEach((m) => { if (!MATRAS[m]) e.push('unknown vowel sign: ' + m + ' (use ' + Object.keys(MATRAS).join(' ') + ')'); });
          if (new Set(c.matras).size !== c.matras.length) e.push('matras: each once');
        }
        if (c.examples != null) {
          if (typeof c.examples !== 'object' || Array.isArray(c.examples)) e.push('examples: an object of akshar → word');
          else {
            const cs = Array.isArray(c.consonants) ? c.consonants : [], ms = Array.isArray(c.matras) ? c.matras : [];
            Object.keys(c.examples).forEach((k) => {
              const w = c.examples[k];
              const can = cs.some((x) => ms.some((m) => x + m === k));
              if (!can) e.push(`examples: ${k} is not a letter + vowel sign from this lab`);
              if (typeof w !== 'string' || !devOK(w)) e.push(`examples: the word for ${k} must be Devanagari`);
              else if (!w.includes(k)) e.push(`examples: ${w} does not contain ${k}`);
            });
          }
        }
        ['extra', 'parts'].forEach((k) => { if (c[k] != null) e.push(k + ' is not used in matra mode'); });
        return e;
      }
      ['consonants', 'matras', 'examples'].forEach((k) => { if (c[k] != null) e.push(k + ' is only used in matra mode'); });
      if (c.extra != null) {
        if (!['phonics', 'spelling'].includes(c.mode)) e.push('extra is only used in phonics and spelling modes');
        else if (typeof c.extra !== 'string' || !c.extra || !wordOK(c.extra, c.lang) || letterUnits(c.extra, c.lang).length > 8) e.push('extra: up to 8 extra letters in the lang\'s script');
      }
      if (c.parts != null) {
        if (!['affix', 'compound', 'sandhi'].includes(c.mode)) e.push('parts is only used in affix, compound and sandhi modes');
        else if (!strArr(c.parts) || c.parts.length > 8) e.push('parts: up to 8 extra pieces (strings)');
        else {
          c.parts.forEach((p) => {
            if (!wordOK(p, c.lang)) e.push(`parts: "${p}" is not in the ${c.lang} script`);
            else if (c.mode === 'affix' && !(INV[c.lang].p.has(p) || INV[c.lang].s.has(p) || INV[c.lang].b.has(p))) e.push(`parts: "${p}" is not a known prefix, suffix or base word in ${c.lang}`);
          });
        }
      }
      const P = prepare(c);
      return e.concat(P.errs);
    },
    keys(c) {
      const out = { targets: [], events: [] };
      if (!c || typeof c !== 'object') return out;
      if (c.mode === 'matra') {
        const cs = Array.isArray(c.consonants) ? c.consonants : [], ms = Array.isArray(c.matras) ? c.matras : [];
        out.targets = cs.map((k) => 'pick:' + k).concat(ms.map((m) => 'matra:' + m));
        out.events = cs.map((k) => 'pick:' + k).concat(['make:*']);
        return out;
      }
      const items = Array.isArray(c.words) ? prepare(c).items : [];
      const many = items.length > 1;
      const words = items.map((it) => 'word:' + it.w);
      const common = ['listen'].concat(many ? ['next'] : []);
      if (c.mode === 'phonics' || c.mode === 'spelling') {
        const units = uniq(items.flatMap((it) => it.units).concat(c.extra && wordOK(c.extra, c.lang) ? letterUnits(c.extra, c.lang) : []));
        out.targets = common.concat(['tiles'], units.map((u) => 'pick:' + u), c.mode === 'spelling' ? ['undo', 'hint'] : []);
        out.events = common.concat(words, units.map((u) => 'pick:' + u), c.mode === 'spelling' ? ['undo', 'hint'] : []);
      } else if (c.mode === 'syllables') {
        out.targets = common.concat(['clap', 'gap:*']);
        out.events = common.concat(words, ['clap', 'split:*']);
      } else if (['affix', 'compound', 'sandhi'].includes(c.mode)) {
        const parts = uniq(items.flatMap((it) => it.parts).concat(Array.isArray(c.parts) ? c.parts : []));
        out.targets = common.concat(['clear'], parts.map((p) => 'part:' + p));
        out.events = common.concat(words, items.map((it) => 'joined:' + it.w), ['clear'], parts.map((p) => 'part:' + p));
      }
      return out;
    },
    demo: {
      mode: 'phonics', lang: 'en', extra: 'bd',
      words: [
        { w: 'ship', pic: 'ship', meaning: { en: 'A big boat that sails on the sea.', hi: 'समुद्र में चलने वाली बड़ी नाव।' } },
        { w: 'fish', pic: 'fish', meaning: { en: 'It lives in water and has fins.', hi: 'यह पानी में रहती है और इसके पंख होते हैं।' } },
        { w: 'moon', pic: 'moon', meaning: { en: 'It shines in the night sky.', hi: 'यह रात के आसमान में चमकता है।' } },
        { w: 'tree', pic: 'tree', meaning: { en: 'It has a trunk, branches and leaves.', hi: 'इसमें तना, शाखाएँ और पत्ते होते हैं।' } },
        { w: 'cat', pic: 'cat', meaning: { en: 'A small pet that says meow.', hi: 'एक छोटा पालतू जानवर जो म्याऊँ कहता है।' } },
      ],
    },
    // Pure language rules, for tests under Node.
    rules: { aksharas, sandhi, addSuffix, enUnits, prepare, SAN, AFF, COMP, SYL_EN, MATRAS },
    mount(root, config, api) { return build(root, config, api); },
  });
})();
