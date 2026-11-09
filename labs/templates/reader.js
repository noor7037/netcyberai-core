// Template: Story and poem studio ("reader"). A short passage (our own retelling, never textbook text) is lived in six
// ways: picture panels, rhythm (a steady pulse with one beat per syllable, tapped in time), vocab (find the key words,
// then match meanings), character (meet the people, guess who a clue describes), emotion-map (feel each line, draw the
// story's feeling curve), read-along (karaoke-style highlighting, speed and sound).
// Language rules live in code: syllables are counted by rule (English vowel groups with the silent-e / -ed / -es rules,
// Devanagari aksharas for Hindi and Sanskrit); rhymes are found from the spelled ending; every feeling carries a fixed
// positive-to-difficult value used for the curve. A lab can only choose among things this file knows to be true.
// Config: { mode, lang: 'en'|'hi'|'sa' (language of the passage),
//   passage: { title: {en,hi}|string, lines: [string] (2-24), art?: [asset id per line] },
//   words?: [{ w (one word that appears in the passage), meaning: {en,hi} }] (<=12; vocab needs 2-10),
//   characters?: [{ id, name: string|{en,hi}, traits: [{en,hi}] (1-5) }] (<=8; character mode 2-6, names appear in the text),
//   emotions?: [feeling id per line] (emotion-map only, required), question?: { q, options (2-4), answer, why? }
//   (panels, rhythm, read-along), bpm?: 40-140 and stress?: ['/x/x', …] and syllables?: { word: 'syl-la-bles' } (rhythm only) }
// Lines are numbered from 0: targets line:0, line:1, …
(function () {
  const L = window.NCA_LIB;
  const { esc } = L;
  const T2 = (en, hi) => ({ en, hi });
  const MODES = ['panels', 'rhythm', 'vocab', 'character', 'emotion-map', 'read-along'];
  const LANGS = ['en', 'hi', 'sa'];
  const KEYS = ['mode', 'lang', 'passage', 'words', 'characters', 'emotions', 'question', 'bpm', 'stress', 'syllables'];
  const isT = (x) => !!x && typeof x === 'object' && typeof x.en === 'string' && typeof x.hi === 'string' && x.en.trim() !== '' && x.hi.trim() !== '';
  const ID_RE = /^[A-Za-z0-9_-]{1,24}$/;
  const DEV = /[ऀ-ॿ]/;
  const LAT = /[A-Za-z]/;
  const TOK = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*|[^\p{L}\p{M}\p{N}]+/gu;
  const tokens = (s) => String(s).match(TOK) || [];
  const isWordTok = (t) => /^[\p{L}\p{M}\p{N}]/u.test(t);
  const norm = (w) => String(w).toLowerCase().replace(/’/g, "'");
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // A fixed shuffle keyed on a string, so a lab always looks the same.
  function shuffled(arr, key) {
    const a = arr.slice(); let s = hash(key) || 1;
    for (let i = a.length - 1; i > 0; i--) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; const j = (s >>> 8) % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // ------------------------------------------------------------ feelings (value: 1 = happiest, 0 = hardest)
  const EMO = {
    joy: { n: T2('joy', 'ख़ुशी'), v: 0.92, c: '#FFD23F', face: 'smile', side: 'good' },
    love: { n: T2('love', 'प्यार'), v: 0.86, c: '#FB7185', face: 'love', side: 'good' },
    pride: { n: T2('pride', 'गर्व'), v: 0.8, c: '#FF9A3C', face: 'proud', side: 'good' },
    wonder: { n: T2('wonder', 'अचरज'), v: 0.7, c: '#5ADCF9', face: 'wonder', side: 'good' },
    surprise: { n: T2('surprise', 'हैरानी'), v: 0.58, c: '#F0ABFC', face: 'surprise', side: 'mid' },
    calm: { n: T2('calm', 'शांति'), v: 0.5, c: '#5EEAD4', face: 'calm', side: 'good' },
    worry: { n: T2('worry', 'चिंता'), v: 0.32, c: '#B6C2D6', face: 'worry', side: 'hard' },
    fear: { n: T2('fear', 'डर'), v: 0.14, c: '#A78BFA', face: 'fear', side: 'hard' },
    sadness: { n: T2('sadness', 'उदासी'), v: 0.16, c: '#7FB2FF', face: 'sad', side: 'hard' },
    anger: { n: T2('anger', 'ग़ुस्सा'), v: 0.2, c: '#F87171', face: 'anger', side: 'hard' },
  };
  const EMO_IDS = Object.keys(EMO);
  const EMO_FILL = ['joy', 'sadness', 'fear', 'calm', 'anger', 'surprise', 'love', 'worry'];

  // ------------------------------------------------------------ syllables
  const isV = (ch, i) => 'aeiou'.indexOf(ch) >= 0 || (ch === 'y' && i > 0);
  const DIGR = ['th', 'sh', 'ch', 'ph', 'wh'];
  // Common school words the vowel-group rule cannot see (a vowel pair that is two sounds).
  const EN_SPECIAL = { poem: 'po-em', poems: 'po-ems', poet: 'po-et', poets: 'po-ets', poetry: 'po-et-ry', quiet: 'qui-et', diet: 'di-et', science: 'sci-ence', create: 'cre-ate', idea: 'i-de-a', area: 'a-re-a', real: 're-al', video: 'vi-de-o', radio: 'ra-di-o', piano: 'pi-a-no', being: 'be-ing', going: 'go-ing', doing: 'do-ing', seeing: 'see-ing', trying: 'try-ing', flying: 'fly-ing', playing: 'play-ing', saying: 'say-ing', giant: 'gi-ant', ocean: 'o-cean', violet: 'vi-o-let', lion: 'li-on', fire: 'fire', hour: 'hour', our: 'our' };
  function enSyl(word) {
    const base = word.replace(/[^A-Za-z]/g, '');
    const w = base.toLowerCase();
    if (!w) return [word];
    if (EN_SPECIAL[w]) { const parts = EN_SPECIAL[w].split('-'); let at = 0; return parts.map((p) => { const piece = base.slice(at, at + p.length); at += p.length; return piece; }); }
    const n = w.length;
    let g = [];
    for (let i = 0; i < n;) { if (isV(w[i], i)) { let j = i; while (j < n && isV(w[j], j)) j++; g.push([i, j]); i = j; } else i++; }
    if (!g.length) return [base];
    // io, ia, iu, eo, ua, uo inside a word are two sounds (lion, radio, duo) - except -tion, -cial, -gion, -quo, -gua
    const g2 = [];
    g.forEach((p) => {
      const pair = w.slice(p[0], p[1]);
      const before = p[0] > 0 ? w[p[0] - 1] : '';
      if (p[1] - p[0] === 2 && ['ia', 'io', 'iu', 'ua', 'uo'].includes(pair) && !'tscgxq'.includes(before) && p[1] < n) { g2.push([p[0], p[0] + 1], [p[0] + 1, p[1]]); }
      else g2.push(p);
    });
    g = g2;
    if (g.length > 1) {
      const last = g[g.length - 1];
      const leL = n >= 3 && w[n - 2] === 'l' && !(n >= 3 && isV(w[n - 3], n - 3));
      if (w.endsWith('e') && last[0] === n - 1 && !leL) g.pop();
      else if (/[^aeiouytd]ed$/.test(w) && last[0] === n - 2) g.pop();
      else if (/[^aeiouysxzcgh]es$/.test(w) && last[0] === n - 2 && !(w[n - 3] === 'l' && n >= 4 && !isV(w[n - 4], n - 4))) g.pop();
    }
    const cuts = [];
    for (let k = 0; k + 1 < g.length; k++) {
      const a = g[k], b = g[k + 1];
      const c = w.slice(a[1], b[0]);
      if (c.length <= 1) cuts.push(a[1]);
      else if (c.length === 2 && DIGR.includes(c)) cuts.push(a[1]);
      else if (c.startsWith('ck') || c.startsWith('ng')) cuts.push(a[1] + 2);
      else if (DIGR.includes(c.slice(0, 2))) cuts.push(a[1]);
      else cuts.push(a[1] + 1);
    }
    const out = []; let s = 0;
    cuts.forEach((c) => { out.push(base.slice(s, c)); s = c; });
    out.push(base.slice(s));
    return out.filter((x) => x);
  }
  // Devanagari: a syllable (akshara) is a consonant cluster plus its vowel sign, or an independent vowel, with its marks.
  const cp = (ch) => ch.codePointAt(0);
  const isCons = (c) => (c >= 0x915 && c <= 0x939) || (c >= 0x958 && c <= 0x95f);
  const isIndV = (c) => (c >= 0x904 && c <= 0x914) || c === 0x960 || c === 0x961;
  const isMatra = (c) => (c >= 0x93e && c <= 0x94c) || c === 0x94e || c === 0x94f || c === 0x955 || c === 0x956 || c === 0x957 || c === 0x962 || c === 0x963;
  const isMark = (c) => c >= 0x900 && c <= 0x903;
  function hiSyl(word) {
    const cs = [...word]; const out = []; let i = 0;
    const joiner = (c) => c === 0x200c || c === 0x200d;
    while (i < cs.length) {
      const c = cp(cs[i]); let s = '';
      if (isCons(c)) {
        s += cs[i++];
        for (;;) {
          if (i < cs.length && cp(cs[i]) === 0x93c) s += cs[i++];
          if (i < cs.length && cp(cs[i]) === 0x94d) {
            if (i + 1 < cs.length && isCons(cp(cs[i + 1]))) { s += cs[i] + cs[i + 1]; i += 2; continue; }
            s += cs[i++]; break;
          }
          break;
        }
        if (i < cs.length && isMatra(cp(cs[i]))) s += cs[i++];
      } else if (isIndV(c)) s += cs[i++];
      else s += cs[i++];
      while (i < cs.length && (isMark(cp(cs[i])) || joiner(cp(cs[i])) || cp(cs[i]) === 0x93c)) s += cs[i++];
      out.push(s);
    }
    // a lone vowel sign or mark that came first (rare) joins the next piece; keep it simple: merge pieces that hold no base
    const res = [];
    out.forEach((p) => { const c0 = cp(p); if (res.length && !(isCons(c0) || isIndV(c0) || /^[\p{L}\p{N}]/u.test(p))) res[res.length - 1] += p; else res.push(p); });
    return res;
  }
  function sylWord(word, lang, ov) {
    const k = norm(word).replace(/'/g, '');
    if (ov && ov[k]) return ov[k].split('-');
    if (DEV.test(word)) return hiSyl(word);
    if (/^[0-9]+$/.test(word)) return [word];
    return enSyl(word);
  }
  // [{ toks: [{ t, p: [pieces] | null }] }] for each line
  function lineSylls(line, lang, ov) {
    return tokens(line).map((t) => (isWordTok(t) ? { t, p: sylWord(t, lang, ov) } : { t, p: null }));
  }
  const sylCount = (line, lang, ov) => lineSylls(line, lang, ov).reduce((n, x) => n + (x.p ? x.p.length : 0), 0);
  // Rhyme: the spelled ending of the last word (English: from the last vowel group, silent e kept; Devanagari: last akshara).
  function rhymeKey(line, lang) {
    const ws = tokens(line).filter(isWordTok);
    if (!ws.length) return '';
    const w = ws[ws.length - 1];
    if (DEV.test(w)) { const a = hiSyl(w); return a.length ? a[a.length - 1] : ''; }
    let s = norm(w).replace(/[^a-z]/g, '');
    if (s.length < 2) return '';
    let silent = false;
    if (s.endsWith('e') && s.length > 2 && !isV(s[s.length - 2], s.length - 2)) { s = s.slice(0, -1); silent = true; }
    let st = -1;
    for (let i = s.length - 1; i >= 0; i--) {
      if (isV(s[i], i)) { st = i; while (st > 0 && isV(s[st - 1], st - 1)) st--; break; }
    }
    if (st < 0) return '';
    return s.slice(st) + (silent ? 'e' : '');
  }
  function rhymeLetters(lines, lang) {
    const keys = lines.map((l) => rhymeKey(l, lang));
    const count = {}; keys.forEach((k) => { if (k) count[k] = (count[k] || 0) + 1; });
    const letter = {}; let next = 0;
    return keys.map((k) => { if (!k || count[k] < 2) return ''; if (!letter[k]) letter[k] = String.fromCharCode(65 + next++); return letter[k]; });
  }

  // ------------------------------------------------------------ picture art (all drawn here; each motif fits a 40 x 40 box)
  const SKIN = '#C98B5B';
  const M = {
    sun: () => `<g stroke="#F5B90A" stroke-width="2.4" stroke-linecap="round">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => { const r = a * Math.PI / 180; return `<path d="M${(20 + Math.cos(r) * 12.5).toFixed(1)} ${(20 + Math.sin(r) * 12.5).toFixed(1)}L${(20 + Math.cos(r) * 18).toFixed(1)} ${(20 + Math.sin(r) * 18).toFixed(1)}"/>`; }).join('')}</g><circle cx="20" cy="20" r="10" fill="#FFD23F" stroke="#F5B90A" stroke-width="1.5"/><circle cx="17" cy="17" r="3" fill="#fff" opacity=".5"/>`,
    moon: () => '<path d="M27 5a15 15 0 1 0 9 26A12 12 0 0 1 27 5z" fill="#FFF3B0" stroke="#F5D86A" stroke-width="1.2"/><circle cx="16" cy="22" r="2" fill="#F0E08A"/><circle cx="21" cy="29" r="1.4" fill="#F0E08A"/>',
    star: () => { const s = (x, y, k) => `<path transform="translate(${x} ${y}) scale(${k})" d="M20 4l4.7 10.2 11.1 1.2-8.3 7.5 2.3 11-9.8-5.6-9.8 5.6 2.3-11-8.3-7.5 11.1-1.2z" fill="#FFD23F" stroke="#F5B90A" stroke-width="1.6" stroke-linejoin="round"/>`; return s(-2, 2, 0.6) + s(16, 10, 0.55) + s(2, 18, 0.42); },
    cloud: () => '<g fill="#fff" stroke="#CBD5E1" stroke-width="1.2"><ellipse cx="20" cy="26" rx="17" ry="8"/><circle cx="14" cy="21" r="7"/><circle cx="24" cy="18" r="9"/></g><ellipse cx="20" cy="29" rx="14" ry="3" fill="#E2E8F0" opacity=".7"/>',
    rain: () => '<g fill="#94A3B8" stroke="#64748B" stroke-width="1"><ellipse cx="20" cy="15" rx="17" ry="7"/><circle cx="13" cy="11" r="6"/><circle cx="24" cy="8" r="8"/></g><g stroke="#2563EB" stroke-width="2.2" stroke-linecap="round"><path d="M10 26l-2 6M18 27l-2 7M26 26l-2 6M33 27l-2 7M14 33l-1.5 5M23 34l-1.5 5"/></g>',
    tree: () => '<rect x="17" y="22" width="6" height="17" rx="2" fill="#92400E"/><g fill="#22C55E" stroke="#15803D" stroke-width="1.2"><circle cx="20" cy="14" r="10"/><circle cx="12" cy="21" r="8"/><circle cx="28" cy="21" r="8"/></g><circle cx="16" cy="11" r="3" fill="#86EFAC" opacity=".7"/>',
    flower: () => '<path d="M20 38V19" stroke="#15803D" stroke-width="3" stroke-linecap="round"/><path d="M20 32c-7-1-9-6-9-6 6 0 9 2 9 6zM20 28c6 0 9-4 9-4-6-1-9 1-9 4z" fill="#22C55E"/><g fill="#FB7185">' + [0, 72, 144, 216, 288].map((a) => `<circle cx="${(20 + Math.cos((a - 90) * Math.PI / 180) * 7).toFixed(1)}" cy="${(13 + Math.sin((a - 90) * Math.PI / 180) * 7).toFixed(1)}" r="5"/>`).join('') + '</g><circle cx="20" cy="13" r="4.2" fill="#FFD23F" stroke="#F5B90A"/>',
    bird: () => '<path d="M6 20l-5-5 8 2z" fill="#B45309"/><ellipse cx="19" cy="22" rx="12" ry="8" fill="#FF6B57" stroke="#C2410C" stroke-width="1.2"/><circle cx="30" cy="16" r="6" fill="#FF6B57" stroke="#C2410C" stroke-width="1.2"/><path d="M35 15l5 2-5 2z" fill="#FFD23F" stroke="#F5B90A"/><circle cx="31.5" cy="15" r="1.4" fill="#1E293B"/><path d="M12 22c4-8 12-6 14 0-4 4-11 4-14 0z" fill="#FFB4A8" stroke="#C2410C" stroke-width="1"/><path d="M17 30v6M22 30v6" stroke="#B45309" stroke-width="2" stroke-linecap="round"/>',
    fish: () => '<path d="M30 20l9-8v16z" fill="#F59E0B"/><ellipse cx="18" cy="20" rx="14" ry="8.5" fill="#FF9A3C" stroke="#C2410C" stroke-width="1.2"/><path d="M10 14c6 3 10 3 14 0" fill="none" stroke="#FFD23F" stroke-width="2"/><circle cx="9" cy="18" r="2" fill="#fff"/><circle cx="8.5" cy="18" r="1" fill="#1E293B"/><path d="M14 12l4-5 4 5z" fill="#F59E0B"/>',
    house: () => '<rect x="6" y="19" width="28" height="19" fill="#FDE68A" stroke="#D97706" stroke-width="1.4"/><path d="M2 21L20 5l18 16z" fill="#DC2626" stroke="#991B1B" stroke-width="1.4" stroke-linejoin="round"/><rect x="16" y="26" width="8" height="12" rx="1" fill="#92400E"/><rect x="8.5" y="24" width="6" height="6" fill="#BAE6FD" stroke="#D97706"/><rect x="26" y="24" width="6" height="6" fill="#BAE6FD" stroke="#D97706"/>',
    mountain: () => '<path d="M0 38L14 10l8 14 6-9 12 23z" fill="#64748B" stroke="#475569" stroke-width="1.2" stroke-linejoin="round"/><path d="M14 10l-5 9 5-3 4 3z" fill="#fff"/><path d="M28 15l-4 7 4-2 3 2z" fill="#fff"/>',
    child: () => `<path d="M9 38c0-9 5-14 11-14s11 5 11 14z" fill="#2563EB" stroke="#1D4ED8" stroke-width="1.2"/><circle cx="20" cy="15" r="8" fill="${SKIN}" stroke="#9A6334" stroke-width="1.2"/><path d="M11.5 14c0-8 17-8 17 0-4-4-12-4-17 0z" fill="#1E293B"/><circle cx="17" cy="16" r="1.2" fill="#1E293B"/><circle cx="23" cy="16" r="1.2" fill="#1E293B"/><path d="M17 20c2 2 4 2 6 0" fill="none" stroke="#7C2D12" stroke-width="1.3" stroke-linecap="round"/>`,
    book: () => '<path d="M3 11c6-3 12-3 17 1v24c-5-4-11-4-17-1z" fill="#FFF7ED" stroke="#EA580C" stroke-width="1.4" stroke-linejoin="round"/><path d="M37 11c-6-3-12-3-17 1v24c5-4 11-4 17-1z" fill="#FFFFFF" stroke="#EA580C" stroke-width="1.4" stroke-linejoin="round"/><path d="M7 16c3-1 6-1 9 .5M7 21c3-1 6-1 9 .5M24 16.5c3-1.500 6-1.500 9-.5M24 21.500c3-1.500 6-1.500 9-.5" stroke="#FDBA74" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    heart: () => '<path d="M20 35C6 25 3 17 8 11c4-4 9-2 12 3 3-5 8-7 12-3 5 6 2 14-12 24z" fill="#F43F5E" stroke="#BE123C" stroke-width="1.4" stroke-linejoin="round"/><path d="M11 14c2-2 4-1 5 1" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".6"/>',
    kite: () => '<path d="M20 2l13 14-13 18L7 16z" fill="#FF7A1A" stroke="#C2410C" stroke-width="1.2" stroke-linejoin="round"/><path d="M20 2v32M7 16h26" stroke="#FFD23F" stroke-width="1.4"/><path d="M20 34c-3 2-1 4-4 6" fill="none" stroke="#8B3DFF" stroke-width="1.6" stroke-linecap="round"/>',
    diya: () => '<path d="M20 8c-5 6-4 11 0 13 4-2 5-7 0-13z" fill="#FFD23F" stroke="#FF7A1A" stroke-width="1.2"/><path d="M20 14c-2 3-1 5 0 6 1-1 2-3 0-6z" fill="#FF7A1A"/><path d="M5 24h30c-1 9-7 13-15 13S6 33 5 24z" fill="#C2410C" stroke="#7C2D12" stroke-width="1.2"/><path d="M8 27h24" stroke="#FFD23F" stroke-width="1.6"/>',
    mango: () => '<path d="M20 7c9-2 16 6 15 16-1 8-8 14-16 14S4 31 5 23C6 14 12 8 20 7z" fill="#FDB813" stroke="#D97706" stroke-width="1.3"/><path d="M13 14c3-3 7-3 9-2" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".55"/><path d="M20 7c0-3 3-5 8-4-1 3-4 5-8 4z" fill="#22C55E" stroke="#15803D"/>',
    boat: () => '<path d="M20 3v24" stroke="#78350F" stroke-width="2"/><path d="M22 4c8 5 12 13 12 20H22z" fill="#fff" stroke="#CBD5E1" stroke-width="1.2" stroke-linejoin="round"/><path d="M18 8c-5 4-9 10-9 16h9z" fill="#FF6B57" stroke="#C2410C" stroke-width="1.2" stroke-linejoin="round"/><path d="M4 27h32c-2 8-8 11-16 11S6 35 4 27z" fill="#92400E" stroke="#78350F" stroke-width="1.2"/>',
    bell: () => '<path d="M20 4c-8 0-11 7-11 15 0 5-3 7-4 10h30c-1-3-4-5-4-10 0-8-3-15-11-15z" fill="#F5B90A" stroke="#B45309" stroke-width="1.4"/><circle cx="20" cy="33" r="3.5" fill="#B45309"/><circle cx="20" cy="4" r="2.2" fill="#B45309"/><path d="M14 12c-2 3-2 7-2 10" stroke="#FFF3B0" stroke-width="2" fill="none" stroke-linecap="round"/>',
    rabbit: () => '<ellipse cx="14" cy="6" rx="3.4" ry="9" fill="#F1F5F9" stroke="#94A3B8"/><ellipse cx="25" cy="6" rx="3.4" ry="9" fill="#F1F5F9" stroke="#94A3B8"/><ellipse cx="14" cy="7" rx="1.4" ry="6" fill="#FBCFE8"/><ellipse cx="25" cy="7" rx="1.4" ry="6" fill="#FBCFE8"/><circle cx="20" cy="22" r="10" fill="#F8FAFC" stroke="#94A3B8" stroke-width="1.2"/><ellipse cx="20" cy="35" rx="11" ry="6" fill="#F8FAFC" stroke="#94A3B8" stroke-width="1.2"/><circle cx="16.500" cy="21" r="1.4" fill="#1E293B"/><circle cx="23.500" cy="21" r="1.4" fill="#1E293B"/><path d="M18.500 25l1.500 1.500 1.500-1.500z" fill="#F43F5E"/>',
    cat: () => '<path d="M8 17L9 4l8 7zM32 17L31 4l-8 7z" fill="#F59E0B" stroke="#B45309" stroke-width="1.2" stroke-linejoin="round"/><circle cx="20" cy="22" r="13" fill="#FBBF24" stroke="#B45309" stroke-width="1.2"/><circle cx="14.500" cy="20" r="2" fill="#1E293B"/><circle cx="25.500" cy="20" r="2" fill="#1E293B"/><path d="M18.500 25h3l-1.500 2z" fill="#F43F5E"/><path d="M20 27c-2 3-5 3-6 2M20 27c2 3 5 3 6 2M8 24l-6-1M8 27l-6 2M32 24l6-1M32 27l6 2" stroke="#7C2D12" stroke-width="1.100" fill="none" stroke-linecap="round"/>',
    dog: () => '<path d="M7 12c-5 0-6 10-2 14l4-3zM33 12c5 0 6 10 2 14l-4-3z" fill="#92400E" stroke="#78350F" stroke-width="1.2"/><circle cx="20" cy="21" r="12.500" fill="#D69E5B" stroke="#92400E" stroke-width="1.2"/><ellipse cx="20" cy="28" rx="7" ry="5.500" fill="#F5E1C0"/><circle cx="14.500" cy="19" r="2" fill="#1E293B"/><circle cx="25.500" cy="19" r="2" fill="#1E293B"/><ellipse cx="20" cy="25" rx="3" ry="2.200" fill="#1E293B"/><path d="M20 27v3c-2 2-4 1-5 0M20 30c2 2 4 1 5 0" stroke="#1E293B" stroke-width="1.100" fill="none"/>',
    elephant: () => '<path d="M5 14c-5 0-5 14 2 16 3-2 3-10-2-16z" fill="#94A3B8" stroke="#64748B" stroke-width="1.2"/><circle cx="20" cy="17" r="12" fill="#A5B4C4" stroke="#64748B" stroke-width="1.2"/><path d="M14 22c-1 8 0 12-5 14M14 22c2 2 6 2 8 0" fill="none" stroke="#64748B" stroke-width="5" stroke-linecap="round" opacity="0"/><path d="M17 24c-1 8-2 11-6 13 5 2 8-2 9-13z" fill="#A5B4C4" stroke="#64748B" stroke-width="1.2" stroke-linejoin="round"/><path d="M33 8c6 2 6 18-1 21-4-3-4-17 1-21z" fill="#94A3B8" stroke="#64748B" stroke-width="1.2"/><circle cx="15" cy="14" r="1.800" fill="#1E293B"/><circle cx="25" cy="14" r="1.800" fill="#1E293B"/>',
    cow: () => '<path d="M8 8l-4-5M32 8l4-5" stroke="#F5E1C0" stroke-width="3" stroke-linecap="round"/><path d="M4 12c-3 0-3 7 1 8zM36 12c3 0 3 7-1 8z" fill="#FFFFFF" stroke="#94A3B8"/><ellipse cx="20" cy="19" rx="13" ry="14" fill="#F8FAFC" stroke="#94A3B8" stroke-width="1.2"/><path d="M11 9c5-4 11-3 10 3-3 3-9 3-10-3z" fill="#4B3B2E"/><ellipse cx="20" cy="30" rx="9" ry="7" fill="#FBCFE8" stroke="#F472B6"/><circle cx="16" cy="30" r="1.500" fill="#BE185D"/><circle cx="24" cy="30" r="1.500" fill="#BE185D"/><circle cx="14" cy="18" r="2" fill="#1E293B"/><circle cx="26" cy="18" r="2" fill="#1E293B"/>',
    road: () => '<path d="M14 4h12l12 34H2z" fill="#6B7280"/><path d="M20 6v5M20 15v6M20 26v8" stroke="#FDE68A" stroke-width="2" stroke-linecap="round"/>',
    person: (c) => `<path d="M9 38c0-9 5-14 11-14s11 5 11 14z" fill="${c || '#8B3DFF'}" stroke="rgba(6,18,51,.35)" stroke-width="1.2"/><circle cx="20" cy="15" r="8" fill="${SKIN}" stroke="#9A6334" stroke-width="1.2"/><path d="M11.500 14c0-8 17-8 17 0-4-4-12-4-17 0z" fill="#1E293B"/><circle cx="17" cy="16" r="1.200" fill="#1E293B"/><circle cx="23" cy="16" r="1.200" fill="#1E293B"/><path d="M17 20c2 2 4 2 6 0" fill="none" stroke="#7C2D12" stroke-width="1.300" stroke-linecap="round"/>`,
  };
  // keyword -> motif. A trailing "=" means the word must match exactly; otherwise a word that starts with it matches.
  const KW = {
    en: {
      sun: ['sun=', 'sunny', 'sunshine', 'sunrise', 'morning', 'dawn', 'sunlight'], moon: ['moon', 'night', 'midnight', 'bedtime'], star: ['star=', 'stars', 'starry', 'twinkl'],
      cloud: ['cloud', 'sky=', 'clouds'], rain: ['rain', 'storm', 'drizzle', 'monsoon', 'puddle'], tree: ['tree', 'forest', 'woods=', 'leaf=', 'leaves=', 'branch', 'jungle'],
      flower: ['flower', 'garden', 'blossom', 'petal', 'lotus', 'marigold'], bird: ['bird', 'sparrow', 'crow=', 'parrot', 'peacock', 'sings=', 'singing', 'nest', 'flew=', 'flies=', 'flying', 'fly='],
      fish: ['fish', 'fishes'], water: ['river', 'sea=', 'ocean', 'lake=', 'pond', 'water=', 'stream=', 'waves=', 'swim'], house: ['house', 'home=', 'hut=', 'village', 'roof', 'door=', 'cottage'],
      mountain: ['mountain', 'hill=', 'hills=', 'peak=', 'valley'], child: ['boy=', 'girl=', 'child', 'children', 'kids=', 'kid=', 'baby', 'student', 'friend', 'son=', 'daughter'],
      book: ['book', 'read=', 'reads=', 'reading', 'story=', 'page=', 'pages=', 'school', 'teacher', 'poem', 'learn'], heart: ['love', 'heart', 'kindness', 'mother', 'father', 'mother\'s', 'hug'],
      kite: ['kite'], diya: ['diya', 'diwali', 'lamp'], mango: ['mango', 'fruit'], boat: ['boat', 'ship=', 'sail'], bell: ['bell'], rabbit: ['rabbit', 'hare='], cat: ['cat=', 'cats=', 'kitten'],
      dog: ['dog=', 'dogs=', 'puppy'], elephant: ['elephant'], cow: ['cow=', 'cows=', 'calf=', 'milk=', 'bull='], road: ['road', 'path=', 'journey', 'street', 'walk'],
    },
    hi: {
      sun: ['सूरज', 'सूर्य', 'सवेरा', 'सुबह', 'भोर', 'धूप'], moon: ['चाँद', 'चांद', 'चंद्र', 'चन्द्र', 'रात', 'चाँदनी'], star: ['तारा', 'तारे', 'सितारा', 'सितारे'], cloud: ['बादल', 'आसमान', 'आकाश', 'गगन='],
      rain: ['बारिश', 'वर्षा', 'बरसात', 'बरस', 'मेघ', 'सावन='], tree: ['पेड़', 'वृक्ष', 'जंगल', 'वन=', 'पत्त', 'डाली', 'पौधा', 'पौधे'], flower: ['फूल', 'पुष्प', 'बगीचा', 'बाग=', 'गुलाब', 'कमल', 'कली', 'सुमन='],
      bird: ['चिड़ि', 'पक्षी', 'तोता', 'तोते', 'मोर=', 'कौआ', 'कोयल', 'घोंसला', 'उड़', 'पंछी', 'खग='], fish: ['मछली', 'मछलियाँ', 'मीन='], water: ['नदी', 'समुद्र', 'सागर', 'तालाब', 'झील', 'पानी', 'जल=', 'कुआँ', 'कुआं', 'नीर='],
      house: ['घर=', 'घरों', 'झोपड़', 'गाँव', 'गांव', 'गृह=', 'दरवाज़', 'दरवाज'], mountain: ['पहाड़', 'पर्वत', 'शिखर'],
      child: ['बच्च', 'लड़का', 'लड़की', 'बालक', 'बालिका', 'बेटा', 'बेटी', 'बिटिया', 'दोस्त', 'मित्र', 'छात्र'], book: ['किताब', 'पुस्तक', 'पढ़', 'कहानी', 'पाठशाला', 'स्कूल', 'शिक्षक', 'अध्यापक', 'कविता'],
      heart: ['प्यार', 'प्रेम', 'दिल=', 'हृदय', 'माँ=', 'माता', 'पिता', 'ममता'], kite: ['पतंग'], diya: ['दीया', 'दीपक', 'दीप=', 'दीपावली', 'दिवाली'], mango: ['आम=', 'आमों', 'फल=', 'फलों'],
      boat: ['नाव', 'नौका', 'जहाज़', 'जहाज'], bell: ['घंटी', 'घण्टी', 'घंटा'], rabbit: ['खरगोश'], cat: ['बिल्ली', 'बिलौटा'], dog: ['कुत्ता', 'कुत्ते', 'पिल्ला'], elephant: ['हाथी', 'गज='], cow: ['गाय', 'बछड़ा', 'दूध=', 'बैल='],
      road: ['सड़क', 'रास्ता', 'रास्ते', 'राह=', 'पथ=', 'मार्ग', 'यात्रा'],
    },
  };
  const SKY = ['sun', 'moon', 'star', 'cloud', 'rain'];
  const FLY = ['bird', 'kite'];
  function motifsFor(line, lang) {
    const table = lang === 'en' ? KW.en : KW.hi;
    const toks = tokens(line).filter(isWordTok).map(norm);
    const hits = [];
    Object.keys(table).forEach((m) => {
      let best = -1;
      toks.forEach((t, i) => {
        if (best >= 0) return;
        if (table[m].some((k) => (k.endsWith('=') ? t === k.slice(0, -1) : t.startsWith(k)))) best = i;
      });
      if (best >= 0) hits.push([best, m]);
    });
    hits.sort((a, b) => a[0] - b[0]);
    return hits.map((h) => h[1]);
  }
  let UID = 0;
  // One panel scene: sky + hills/water + up to four things named in the line, 160 x 100.
  function sceneSVG(line, idx, lang, chars, uid) {
    const found = motifsFor(line, lang);
    const sky = found.filter((m) => SKY.includes(m)).slice(0, 2);
    const fly = found.filter((m) => FLY.includes(m)).slice(0, 1);
    const water = found.includes('water');
    const fish = water && found.includes('fish');
    const ground = found.filter((m) => !SKY.includes(m) && !FLY.includes(m) && m !== 'water' && m !== 'fish' && m !== 'mountain').slice(0, 3);
    const hasMtn = found.includes('mountain');
    const night = sky.includes('moon') || sky.includes('star');
    const rainy = sky.includes('rain');
    const grad = night ? 'n' : rainy ? 'r' : ['d', 'd', 'a'][idx % 3];
    let s = `<rect width="160" height="100" fill="url(#${uid}-${grad})"/>`;
    if (night) s += '<g fill="#fff" opacity=".8"><circle cx="20" cy="14" r="1"/><circle cx="52" cy="26" r="1.200"/><circle cx="84" cy="10" r="1"/><circle cx="140" cy="30" r="1.200"/><circle cx="122" cy="8" r="1"/></g>';
    if (!sky.length && !night) s += '<g transform="translate(98 8) scale(.8)" opacity=".85">' + M.cloud() + '</g>';
    sky.forEach((m, i) => { s += `<g transform="translate(${i ? 22 : 112} ${i ? 10 : 6}) scale(${m === 'star' ? 0.9 : 1})">${M[m]()}</g>`; });
    if (hasMtn) s += `<g transform="translate(40 24) scale(2.4)">${M.mountain()}</g>`;
    s += `<ellipse cx="80" cy="104" rx="110" ry="26" fill="url(#${uid}-${night ? 'gn' : 'g'})"/>`;
    if (water) s += `<path d="M0 74c14-5 26 5 40 0s26 5 40 0 26 5 40 0 26 5 40 0V100H0z" fill="url(#${uid}-w)" opacity=".95"/><path d="M10 84c8-3 14 3 22 0M70 90c8-3 14 3 22 0M120 82c8-3 14 3 22 0" stroke="#fff" stroke-width="1.400" fill="none" opacity=".6" stroke-linecap="round"/>`;
    const slots = water ? [[10, 40], [60, 42], [112, 40]] : [[12, 48], [60, 50], [108, 48]];
    ground.forEach((m, i) => { const sl = slots[i]; s += `<g transform="translate(${sl[0]} ${sl[1]}) scale(1.15)">${m === 'person' ? M.person() : M[m]()}</g>`; });
    const mentioned = (chars || []).filter((c) => c.in);
    mentioned.slice(0, 2).forEach((c, i) => { const slot = slots[Math.min(2, ground.length + i)]; s += `<g transform="translate(${slot[0]} ${slot[1]}) scale(1.15)">${M.person(c.col)}</g>`; });
    if (fish) s += '<g transform="translate(88 70) scale(.7)">' + M.fish() + '</g>';
    fly.forEach((m) => { s += `<g transform="translate(46 8) scale(.8)">${M[m]()}</g>`; });
    if (!found.length && !mentioned.length) s += `<g opacity=".95"><circle cx="80" cy="56" r="20" fill="#fff" opacity=".35"/><path d="M80 40l4 10 11 1-8 7 3 11-10-6-10 6 3-11-8-7 11-1z" fill="#FFD23F" stroke="#F5B90A" stroke-width="1.400" stroke-linejoin="round"/></g>`;
    return s;
  }
  const defs = (uid) => `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
    <linearGradient id="${uid}-d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4FB3F6"/><stop offset="1" stop-color="#DDF1FF"/></linearGradient>
    <linearGradient id="${uid}-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFA24C"/><stop offset=".6" stop-color="#FFD9A0"/><stop offset="1" stop-color="#FFF3D6"/></linearGradient>
    <linearGradient id="${uid}-n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B1B4D"/><stop offset="1" stop-color="#4C3AA8"/></linearGradient>
    <linearGradient id="${uid}-r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7B8BA3"/><stop offset="1" stop-color="#CBD5E1"/></linearGradient>
    <linearGradient id="${uid}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5BD27F"/><stop offset="1" stop-color="#1E9D55"/></linearGradient>
    <linearGradient id="${uid}-gn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2F8F63"/><stop offset="1" stop-color="#14573F"/></linearGradient>
    <linearGradient id="${uid}-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#38BDF8"/><stop offset="1" stop-color="#0369A1"/></linearGradient></defs></svg>`;

  // Feeling faces (40 x 40).
  function faceSVG(id, size) {
    const e = EMO[id]; const k = e.face; const ink = '#1E293B';
    const eye = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${ink}"/>`;
    const arc = (d) => `<path d="${d}" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>`;
    let f = '';
    if (k === 'smile') f = arc('M11 16q3-4 6 0M23 16q3-4 6 0') + `<path d="M11 23q9 10 18 0z" fill="#fff" stroke="${ink}" stroke-width="2" stroke-linejoin="round"/>`;
    else if (k === 'love') f = '<path d="M10 17c0-3 4-4 5-1 1-3 5-2 5 1 0 3-5 5-5 5s-5-2-5-5zM21 17c0-3 4-4 5-1 1-3 5-2 5 1 0 3-5 5-5 5s-5-2-5-5z" fill="#E11D48"/>' + arc('M13 26q7 7 14 0');
    else if (k === 'proud') f = arc('M11 17q3-3 6 0M23 17q3-3 6 0') + arc('M13 25q7 6 14 0') + '<path d="M6 7l1.500 3 3 .5-2.300 2 .7 3-2.900-1.700L3.100 15.500l.7-3L1.500 10.500l3-.5z" fill="#FFD23F" stroke="#F5B90A" stroke-width=".8"/>';
    else if (k === 'wonder') f = eye(14, 16, 3) + eye(26, 16, 3) + '<circle cx="15" cy="15" r="1" fill="#fff"/><circle cx="27" cy="15" r="1" fill="#fff"/>' + `<ellipse cx="20" cy="27" rx="3.500" ry="4.500" fill="${ink}"/>`;
    else if (k === 'surprise') f = arc('M9 10q5-4 9 0M22 10q5-4 9 0') + eye(14, 17, 3.200) + eye(26, 17, 3.200) + `<ellipse cx="20" cy="28" rx="4" ry="5" fill="${ink}"/>`;
    else if (k === 'calm') f = arc('M10 17q4 3 8 0M22 17q4 3 8 0') + arc('M14 26q6 4 12 0');
    else if (k === 'worry') f = arc('M9 11l7 2M31 11l-7 2') + eye(14, 18, 2.200) + eye(26, 18, 2.200) + arc('M13 28q3-3 6 0t6 0');
    else if (k === 'fear') f = arc('M9 12l7 2.500M31 12l-7 2.500') + eye(14, 19, 3.400) + eye(26, 19, 3.400) + '<circle cx="15" cy="18" r="1.100" fill="#fff"/><circle cx="27" cy="18" r="1.100" fill="#fff"/>' + `<path d="M15 29q5-6 10 0z" fill="${ink}"/>`;
    else if (k === 'sad') f = arc('M9 14l7-2M31 14l-7-2') + eye(14, 19, 2.200) + eye(26, 19, 2.200) + arc('M13 30q7-6 14 0') + '<path d="M13 22c-2 3-2 5 0 5s2-2 0-5z" fill="#38BDF8" stroke="#0369A1" stroke-width=".8"/>';
    else f = arc('M9 12l8 4M31 12l-8 4') + eye(14, 19, 2.400) + eye(26, 19, 2.400) + arc('M13 30q7-6 14 0');
    return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true" focusable="false"><circle cx="20" cy="20" r="18.500" fill="${e.c}" stroke="rgba(6,18,51,.35)" stroke-width="1.500"/><ellipse cx="14" cy="9" rx="7" ry="3.500" fill="#fff" opacity=".35"/>${f}</svg>`;
  }
  const CHAR_COL = ['#1D4ED8', '#8B3DFF', '#0F766E', '#FF7A1A', '#FF6B57', '#14B8A6', '#F5B90A', '#22C55E'];

  // ------------------------------------------------------------ CSS
  const CSS = `
.rd{font-family:var(--font-body);color:var(--ink);max-width:1000px;margin:0 auto;position:relative;--rd-c:#7C2D12;--rd-o:#FF7A1A;--rd-tint:color-mix(in srgb,#FF7A1A 11%,var(--surface))}
.rd *{box-sizing:border-box}
.rd button{font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.rd button:focus-visible{outline:3px solid var(--action,#2563EB);outline-offset:3px}
.rd-head{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:20px;color:#fff;background:linear-gradient(120deg,#7C2D12 0%,#9A3412 50%,#B45309 100%);box-shadow:0 6px 18px rgba(124,45,18,.3);position:relative;overflow:hidden}
.rd-head:after{content:"";position:absolute;right:-30px;top:-40px;width:150px;height:150px;border-radius:50%;background:radial-gradient(circle,rgba(255,210,63,.45),transparent 70%);pointer-events:none}
.rd-hico{flex:0 0 auto;width:46px;height:46px;border-radius:14px;background:rgba(255,255,255,.16);display:grid;place-items:center}
.rd-hico svg{width:30px;height:30px}
.rd-ht{flex:1 1 auto;min-width:0}
.rd-kick{font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;opacity:.92}
.rd-title{margin:0;font-family:var(--font-display);font-weight:700;font-size:clamp(20px,5.4vw,28px);line-height:1.15;overflow-wrap:anywhere}
.rd-lang{flex:0 0 auto;align-self:flex-start;font-size:13px;font-weight:700;padding:3px 10px;border-radius:99px;background:rgba(255,255,255,.2);position:relative;z-index:1}
.rd-how{margin:10px 2px 0;font-size:clamp(15px,3.9vw,17px);line-height:1.4;color:var(--ink-2)}
.rd-tools{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:12px 0 0}
.rd-play{display:inline-flex;align-items:center;gap:8px;min-height:48px;padding:8px 20px 8px 14px;border:0;border-radius:99px;font-weight:800;font-size:17px;color:#1E293B;background:linear-gradient(135deg,#FFD23F,#FF9A3C);box-shadow:0 4px 0 #C2570C,0 8px 16px rgba(194,87,12,.28);transition:transform .15s,box-shadow .15s}
.rd-play:hover{transform:translateY(-1px)}
.rd-play:active{transform:translateY(3px);box-shadow:0 1px 0 #C2570C}
.rd-play svg{width:22px;height:22px}
.rd-pill{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:6px 14px;border:2px solid var(--line);border-radius:99px;background:var(--surface);font-weight:700;font-size:15px}
.rd-pill[aria-pressed="true"]{border-color:var(--rd-o);background:color-mix(in srgb,#FF7A1A 18%,var(--surface))}
.rd-seg{display:inline-flex;border:2px solid var(--line);border-radius:99px;overflow:hidden;background:var(--surface)}
.rd-seg button{min-height:40px;min-width:44px;padding:4px 12px;border:0;background:transparent;font-weight:700;font-size:15px}
.rd-seg button[aria-pressed="true"]{background:#7C2D12;color:#fff}
.rd-prog{margin-inline-start:auto;font-family:var(--font-display);font-weight:700;font-size:16px;display:flex;align-items:center;gap:8px}
.rd-bar{width:90px;height:10px;border-radius:99px;background:var(--sunk);border:1px solid var(--line);overflow:hidden}
.rd-bar i{display:block;height:100%;background:linear-gradient(90deg,#FFD23F,#22C55E);border-radius:99px;transition:width .5s cubic-bezier(.3,.8,.3,1)}
.rd-grid{display:grid;grid-template-columns:1fr;gap:14px;margin:14px 0 0}
@media(min-width:560px){.rd-grid{grid-template-columns:1fr 1fr}}
@media(min-width:900px){.rd-grid{grid-template-columns:1fr 1fr 1fr}}
.rd-pan{position:relative;display:flex;flex-direction:column;padding:0;text-align:start;border:3px solid var(--surface);border-radius:20px;background:var(--surface);overflow:hidden;box-shadow:0 3px 10px rgba(6,18,51,.16);transition:transform .2s cubic-bezier(.3,1.3,.5,1),box-shadow .2s,border-color .2s}
.rd-pan:hover{transform:translateY(-3px);box-shadow:0 10px 22px rgba(6,18,51,.2)}
.rd-pan.sel,.rd-pan.act{border-color:var(--rd-o);box-shadow:0 0 0 4px rgba(255,122,26,.3),0 10px 22px rgba(6,18,51,.2)}
.rd-pan.act{transform:scale(1.02)}
.rd-art{display:block;aspect-ratio:8/5;width:100%;background:#CFE8FA}
.rd-art svg,.rd-art img{display:block;width:100%;height:100%;object-fit:cover}
.rd-pn{position:absolute;top:8px;inset-inline-start:8px;z-index:2;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-family:var(--font-display);font-weight:800;font-size:15px;color:#fff;background:#7C2D12;border:2px solid #fff;box-shadow:0 2px 6px rgba(6,18,51,.3)}
.rd-cap{display:block;padding:10px 14px 14px;font-size:clamp(16px,4vw,18px);line-height:1.45;font-weight:500;background:var(--surface)}
.rd-card{margin:12px 0 0;padding:12px 14px;border-radius:18px;border:2px solid var(--line);background:var(--surface);box-shadow:0 2px 8px rgba(6,18,51,.08)}
.rd-ln{display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:16px;transition:background .25s}
.rd-ln.act{background:color-mix(in srgb,#FFD23F 24%,var(--surface))}
.rd-ln.on{background:color-mix(in srgb,var(--cc,#FF7A1A) 15%,var(--surface));box-shadow:inset 4px 0 0 var(--cc,#FF7A1A)}
.rd-lbtn{flex:0 0 auto;width:44px;height:44px;border-radius:50%;border:2px solid var(--line);background:var(--surface);display:grid;place-items:center;color:#7C2D12}
.rd-lbtn svg{width:20px;height:20px}
.rd-lbtn:hover{border-color:var(--rd-o)}
.rd-ltx{margin:0;flex:1 1 auto;min-width:0;font-size:clamp(18px,4.8vw,22px);line-height:1.75;font-weight:500;overflow-wrap:anywhere}
.rd-ltx.dev{line-height:1.95}
.rd-w{display:inline;border-radius:8px;padding:1px 2px;transition:background .15s,color .15s}
.rd-w.now{background:#FFD23F;color:#1E293B;box-shadow:0 0 0 3px #FFD23F}
.rd-w.done{color:var(--ink-2)}
button.rd-w{border:0;background:transparent;font:inherit;line-height:inherit;padding:2px 6px;margin:0 1px;min-height:44px;border-bottom:3px dotted #FF7A1A;color:#7C2D12;font-weight:700;border-radius:8px 8px 4px 4px;background:color-mix(in srgb,#FFD23F 22%,transparent)}
button.rd-w:hover{background:color-mix(in srgb,#FFD23F 55%,transparent)}
button.rd-w.found{border-bottom:3px solid #0F766E;color:var(--ink);background:color-mix(in srgb,#14B8A6 20%,transparent)}
button.rd-w.found:after{content:" \\2713";font-size:.8em;color:#0F766E}
.rd-nm{font-weight:800;border-radius:8px;padding:0 4px;color:#fff;background:var(--cc)}
.rd-mean{display:flex;gap:12px;align-items:flex-start;border-color:#FF7A1A;background:var(--rd-tint);animation:rd-rise .35s cubic-bezier(.3,1.3,.5,1)}
.rd-mean b{font-family:var(--font-display);font-size:24px;line-height:1.2;color:#7C2D12}
.rd-mean p{margin:4px 0 0;font-size:17px;line-height:1.45}
.rd-mean .rd-mi{flex:0 0 auto;width:44px;height:44px;border-radius:14px;background:#FF7A1A;display:grid;place-items:center}
.rd-mean .rd-mi svg{width:26px;height:26px}
.rd-q{margin:14px 0 0;padding:14px;border-radius:20px;background:var(--surface);border:2px solid var(--line);box-shadow:0 2px 8px rgba(6,18,51,.08)}
.rd-q h3{margin:0 0 4px;font-family:var(--font-display);font-size:16px;color:#7C2D12;letter-spacing:.02em;text-transform:uppercase}
.rd-qt{margin:0 0 10px;font-size:clamp(17px,4.4vw,20px);line-height:1.4;font-weight:600}
.rd-opts{display:grid;grid-template-columns:1fr;gap:10px}
@media(min-width:640px){.rd-opts{grid-template-columns:1fr 1fr}}
.rd-opt{display:flex;align-items:center;gap:10px;min-height:52px;padding:8px 14px;text-align:start;border:2px solid var(--line);border-radius:16px;background:var(--surface);font-weight:600;font-size:clamp(16px,4vw,18px);line-height:1.3;transition:transform .15s,border-color .15s,background .15s}
.rd-opt:hover:not(:disabled){transform:translateY(-2px);border-color:var(--rd-o)}
.rd-opt .ky{flex:0 0 auto;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--sunk);font-family:var(--font-display);font-weight:800;font-size:15px}
.rd-opt.ok{border-color:#0F766E;background:color-mix(in srgb,#14B8A6 20%,var(--surface))}
.rd-opt.ok .ky{background:#0F766E;color:#fff}
.rd-opt.bad{border-color:var(--bad,#C2410C);background:color-mix(in srgb,#FF6B57 16%,var(--surface));animation:rd-shake .4s}
.rd-opt:disabled{cursor:default}
.rd-opt:disabled:not(.ok):not(.bad){opacity:.55}
.rd-fb{min-height:24px;margin:10px 2px 0;font-size:16px;line-height:1.45}
.rd-fb.ok{color:var(--good,#0F766E);font-weight:700}
.rd-fb.bad{color:var(--bad,#C2410C);font-weight:700}
.rd-live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.rd-chars{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:14px 0 0}
.rd-ch{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 8px 12px;min-height:44px;border:3px solid var(--line);border-radius:20px;background:var(--surface);font-weight:700;font-size:17px;box-shadow:0 2px 8px rgba(6,18,51,.1);transition:transform .2s cubic-bezier(.3,1.3,.5,1),border-color .2s}
.rd-ch:hover{transform:translateY(-3px)}
.rd-ch[aria-pressed="true"]{border-color:var(--cc);background:color-mix(in srgb,var(--cc) 14%,var(--surface));box-shadow:0 0 0 4px color-mix(in srgb,var(--cc) 30%,transparent)}
.rd-ch .av{width:68px;height:68px;border-radius:50%;background:color-mix(in srgb,var(--cc) 22%,var(--surface));display:grid;place-items:center;overflow:hidden}
.rd-ch .av svg{width:62px;height:62px;margin-top:6px}
.rd-traits{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.rd-trait{padding:6px 14px;border-radius:99px;font-weight:700;font-size:16px;color:#fff;background:var(--cc);animation:rd-rise .35s cubic-bezier(.3,1.3,.5,1) both}
.rd-ask h3{margin:0 0 6px;font-family:var(--font-display);font-size:16px;color:#7C2D12;text-transform:uppercase;letter-spacing:.02em}
.rd-clue{display:inline-block;margin:2px 0 10px;padding:8px 16px;border-radius:16px;font-size:clamp(18px,4.8vw,22px);font-weight:800;background:linear-gradient(135deg,#FFD23F,#FFB454);color:#1E293B;box-shadow:0 3px 0 #C2570C}
.rd-elist{display:flex;flex-direction:column;gap:8px;margin:14px 0 0;padding:0;list-style:none}
.rd-el{display:flex;align-items:center;gap:10px;width:100%;min-height:56px;padding:8px 12px;text-align:start;border:2px solid var(--line);border-radius:16px;background:var(--surface);transition:border-color .2s,background .2s,transform .2s}
.rd-el .n{flex:0 0 auto;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--sunk);font-family:var(--font-display);font-weight:800;font-size:15px}
.rd-el .t{flex:1 1 auto;min-width:0;font-size:clamp(16px,4.2vw,19px);line-height:1.45;overflow-wrap:anywhere}
.rd-el .f{flex:0 0 auto;width:40px;height:40px;display:grid;place-items:center}
.rd-el .f.q{border-radius:50%;border:3px dashed var(--line);color:var(--ink-2);font-family:var(--font-display);font-weight:800;font-size:20px}
.rd-el.cur{border-color:var(--rd-o);background:var(--rd-tint);box-shadow:0 0 0 4px rgba(255,122,26,.25)}
.rd-el.done{border-color:var(--ec);background:color-mix(in srgb,var(--ec) 14%,var(--surface))}
.rd-feels{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:10px}
.rd-fe{display:flex;flex-direction:column;align-items:center;gap:4px;min-height:44px;padding:8px 6px;border:2px solid var(--line);border-radius:16px;background:var(--surface);font-weight:700;font-size:15px;transition:transform .15s,border-color .15s}
.rd-fe:hover:not(:disabled){transform:translateY(-3px);border-color:var(--rd-o)}
.rd-fe.bad{border-color:var(--bad,#C2410C);animation:rd-shake .4s;opacity:.6}
.rd-fe:disabled{cursor:default}
.rd-curve{margin:14px 0 0;padding:10px;border-radius:20px;border:2px solid var(--line);background:var(--surface)}
.rd-curve svg{display:block;width:100%;height:auto}
.rd-curve .ln{fill:none;stroke:#7C2D12;stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1000;stroke-dashoffset:0;animation:rd-draw 1s ease-out}
.rd-curve text{font-family:var(--font-body);fill:var(--ink-2);font-size:11px}
.rd-sum{margin:12px 0 0;padding:12px 14px;border-radius:16px;background:var(--rd-tint);border:2px solid #FF7A1A;font-size:17px;line-height:1.5;animation:rd-rise .4s both}
.rd-rtop{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:12px 0 0}
.rd-rl{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:16px;margin:6px 0;transition:background .2s}
.rd-rl.act{background:color-mix(in srgb,#FFD23F 22%,var(--surface))}
.rd-sy{flex:1 1 auto;min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;font-size:clamp(17px,4.6vw,21px)}
.rd-wg{display:inline-flex;gap:2px}
@media(max-width:560px){.rd-rl{flex-wrap:wrap;gap:6px 10px}.rd-rl .rd-sy{order:3;flex:1 1 100%}.rd-rl .rd-meta{order:2;flex-direction:row;gap:6px;margin-left:auto}.rd-sp{padding:3px 6px;min-height:34px}}
.rd-sp{padding:4px 8px;min-height:36px;display:inline-flex;align-items:center;border-radius:10px;background:var(--sunk);border:2px solid var(--line);font-weight:600;line-height:1.2;transition:transform .12s,background .12s}
.rd-sp.weak{border-style:dashed;font-weight:400;opacity:.85}
.rd-sp.now{background:#FFD23F;color:#1E293B;border-color:#F5B90A;transform:scale(1.14);box-shadow:0 3px 8px rgba(245,185,10,.5)}
.rd-sp.hit{background:color-mix(in srgb,#22C55E 38%,var(--surface));border-color:#0F766E}
.rd-sp.miss{background:color-mix(in srgb,#FF6B57 28%,var(--surface));border-color:#C2410C}
.rd-pu{color:var(--ink-2)}
.rd-meta{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:44px;font-size:12px;font-weight:700;color:var(--ink-2)}
.rd-meta b{font-family:var(--font-display);font-size:17px;color:var(--ink)}
.rd-rh{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#8B3DFF;color:#fff;font-family:var(--font-display);font-weight:800;font-size:13px}
.rd-padw{display:flex;flex-direction:column;align-items:center;gap:8px;margin:16px 0 0}
.rd-drum{position:relative;width:min(100%,360px);min-height:84px;border:0;border-radius:26px;font-family:var(--font-display);font-weight:800;font-size:24px;letter-spacing:.04em;color:#1E293B;background:linear-gradient(160deg,#FFD23F,#FF7A1A);box-shadow:0 7px 0 #C2570C,0 14px 24px rgba(194,87,12,.3);transition:transform .08s,box-shadow .08s,filter .15s;user-select:none;-webkit-user-select:none}
.rd-drum:active,.rd-drum.pressed{transform:translateY(6px);box-shadow:0 1px 0 #C2570C}
.rd-drum.tick:before{content:"";position:absolute;inset:-6px;border-radius:30px;border:4px solid #FFD23F;animation:rd-ring .5s ease-out forwards;pointer-events:none}
.rd-drum.off{filter:grayscale(.8)}
.rd-count{min-height:30px;font-family:var(--font-display);font-weight:800;font-size:22px;color:#7C2D12}
.rd-score{font-size:17px;font-weight:700}
@keyframes rd-ring{from{opacity:.9;transform:scale(.96)}to{opacity:0;transform:scale(1.12)}}
@keyframes rd-rise{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
@keyframes rd-shake{0%,100%{transform:none}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
@keyframes rd-draw{from{stroke-dashoffset:1000}to{stroke-dashoffset:0}}
@media(prefers-reduced-motion:reduce){.rd *,.rd *:before{animation:none!important;transition:none!important}.rd-pan:hover,.rd-ch:hover,.rd-opt:hover,.rd-fe:hover{transform:none}}
@media(max-width:420px){.rd-head{padding:10px 12px}.rd-hico{width:40px;height:40px}.rd-lang{display:none}.rd-lbtn{width:44px;height:44px}.rd-prog{margin-inline-start:0}}
`;

  // ------------------------------------------------------------ validation
  const wordOf = (name, lang) => (typeof name === 'string' ? name : lang === 'en' ? name.en : name.hi);
  const IC = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.500v15l13-7.500z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.500" fill="currentColor"/></svg>',
    ear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.500c1.800 1.800 1.800 5.200 0 7M18.500 6c3 3 3 9 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 5c4-2 7-2 10 1v14c-3-3-6-3-10-1zM22 5c-4-2-7-2-10 1v14c3-3 6-3 10-1z" fill="#FFF7ED" stroke="#fff" stroke-width="1.500" stroke-linejoin="round"/></svg>',
    bulb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0-3.500 10.900c.7.600 1 1.300 1 2.100h5c0-.8.300-1.500 1-2.100A6 6 0 0 0 12 3z" fill="#FFD23F" stroke="#fff" stroke-width="1.400"/><path d="M10 19h4M10.500 21.500h3" stroke="#fff" stroke-width="1.800" stroke-linecap="round"/></svg>',
  };

  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
    Object.keys(c).forEach((k) => { if (!KEYS.includes(k)) e.push('unknown key: ' + k); });
    if (!MODES.includes(c.mode)) e.push('mode: one of ' + MODES.join(', '));
    if (!LANGS.includes(c.lang)) e.push("lang: 'en', 'hi' or 'sa'");
    const p = c.passage;
    let lines = null;
    if (!p || typeof p !== 'object' || Array.isArray(p)) e.push('passage: { title, lines } is required');
    else {
      Object.keys(p).forEach((k) => { if (!['title', 'lines', 'art'].includes(k)) e.push('passage: unknown key ' + k); });
      if (!((typeof p.title === 'string' && p.title.trim()) || isT(p.title))) e.push('passage.title: a string or { en, hi }');
      const max = c.mode === 'panels' ? 12 : c.mode === 'rhythm' ? 16 : 24;
      if (!Array.isArray(p.lines) || p.lines.length < 2 || p.lines.length > max) e.push(`passage.lines: 2 to ${max} lines for mode ${c.mode}`);
      else {
        lines = p.lines;
        p.lines.forEach((l, i) => {
          if (typeof l !== 'string' || !l.trim()) { e.push(`passage.lines[${i}]: a non-empty string`); return; }
          if (l.length > 240) e.push(`passage.lines[${i}]: at most 240 characters (keep it a short retelling)`);
          if (c.lang === 'en' && (DEV.test(l) || !LAT.test(l))) e.push(`passage.lines[${i}]: lang is 'en', so write the line in English`);
          if ((c.lang === 'hi' || c.lang === 'sa') && !DEV.test(l)) e.push(`passage.lines[${i}]: lang is '${c.lang}', so write the line in Devanagari`);
        });
        if (p.lines.join(' ').length > 2600) e.push('passage: too long; a short original retelling please');
      }
      if (p.art != null) {
        if (!Array.isArray(p.art) || (lines && p.art.length !== lines.length) || p.art.some((a) => typeof a !== 'string' || !ID_RE.test(a))) e.push('passage.art: one asset id (letters, digits, - _) per line');
        if (c.mode !== 'panels') e.push('passage.art is used by panels mode only');
      }
    }
    const all = lines && lines.every((l) => typeof l === 'string') ? lines : [];
    const bag = new Set(); all.forEach((l) => tokens(l).filter(isWordTok).forEach((t) => bag.add(norm(t))));
    const flat = norm(all.join(' '));
    if (c.words != null) {
      if (!Array.isArray(c.words) || c.words.length > 12) e.push('words: an array of at most 12');
      else {
        const seen = new Set(), means = new Set();
        c.words.forEach((x, i) => {
          if (!x || typeof x !== 'object') { e.push(`words[${i}]: { w, meaning }`); return; }
          if (typeof x.w !== 'string' || !/^[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*$/u.test(x.w)) { e.push(`words[${i}].w: one word, no spaces`); return; }
          if (all.length && !bag.has(norm(x.w))) e.push(`words[${i}].w "${x.w}" does not appear in the passage (write it exactly as it appears)`);
          if (seen.has(norm(x.w))) e.push(`words[${i}].w "${x.w}" is listed twice`);
          seen.add(norm(x.w));
          if (!isT(x.meaning)) e.push(`words[${i}].meaning: { en, hi }`);
          else { const m = x.meaning.en.trim().toLowerCase(); if (means.has(m)) e.push(`words[${i}].meaning: two words share the meaning "${x.meaning.en}"`); means.add(m); }
        });
      }
    }
    if (c.mode === 'vocab' && !(Array.isArray(c.words) && c.words.length >= 2 && c.words.length <= 10)) e.push('vocab mode needs words: 2 to 10 of { w, meaning }');
    if (c.characters != null) {
      const cmax = c.mode === 'character' ? 6 : 8;
      if (!Array.isArray(c.characters) || c.characters.length > cmax) e.push(`characters: an array of at most ${cmax}`);
      else {
        const ids = new Set(), traitSeen = new Set();
        c.characters.forEach((ch, i) => {
          if (!ch || typeof ch !== 'object') { e.push(`characters[${i}]: { id, name, traits }`); return; }
          if (typeof ch.id !== 'string' || !ID_RE.test(ch.id)) e.push(`characters[${i}].id: letters, digits, - _ (1 to 24)`);
          else { if (ids.has(ch.id)) e.push(`characters[${i}].id "${ch.id}" is used twice`); ids.add(ch.id); }
          const okName = (typeof ch.name === 'string' && ch.name.trim()) || isT(ch.name);
          if (!okName) e.push(`characters[${i}].name: a string or { en, hi }`);
          else if (c.mode === 'character' && !flat.includes(norm(wordOf(ch.name, c.lang)))) e.push(`characters[${i}].name "${wordOf(ch.name, c.lang)}" does not appear in the passage`);
          if (!Array.isArray(ch.traits) || ch.traits.length < 1 || ch.traits.length > 5 || !ch.traits.every(isT)) e.push(`characters[${i}].traits: 1 to 5 of { en, hi }`);
          else ch.traits.forEach((t) => { const k = t.en.trim().toLowerCase(); if (traitSeen.has(k)) e.push(`characters[${i}]: the trait "${t.en}" is given to two characters, so a clue would not name one`); traitSeen.add(k); });
        });
      }
    }
    if (c.mode === 'character' && !(Array.isArray(c.characters) && c.characters.length >= 2)) e.push('character mode needs characters: 2 to 6');
    if (c.mode === 'emotion-map') {
      if (!Array.isArray(c.emotions) || (lines && c.emotions.length !== lines.length) || c.emotions.some((x) => !EMO[x])) e.push('emotions: one feeling per line, each one of ' + EMO_IDS.join(', '));
    } else if (c.emotions != null) e.push('emotions is used by emotion-map mode only');
    if (c.question != null) {
      const q = c.question;
      if (!['panels', 'rhythm', 'read-along'].includes(c.mode)) e.push('question is used by panels, rhythm and read-along modes');
      if (!q || typeof q !== 'object') e.push('question: { q, options, answer }');
      else {
        if (!isT(q.q)) e.push('question.q: { en, hi }');
        if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4 || !q.options.every((o) => isT(o) || (typeof o === 'string' && o.trim()))) e.push('question.options: 2 to 4 of { en, hi } or strings');
        else if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) e.push('question.answer: the index (from 0) of the right option');
        if (q.why != null && !isT(q.why)) e.push('question.why: { en, hi }');
      }
    }
    ['bpm', 'stress', 'syllables'].forEach((k) => { if (c[k] != null && c.mode !== 'rhythm') e.push(k + ' is used by rhythm mode only'); });
    if (c.mode === 'rhythm') {
      if (c.bpm != null && !(Number.isFinite(c.bpm) && c.bpm >= 40 && c.bpm <= 140)) e.push('bpm: a number from 40 to 140 beats a minute');
      let ov = null;
      if (c.syllables != null) {
        if (!c.syllables || typeof c.syllables !== 'object' || Array.isArray(c.syllables)) e.push('syllables: { word: "syl-la-bles" }');
        else {
          ov = {};
          Object.keys(c.syllables).forEach((k) => {
            const v = c.syllables[k];
            if (typeof v !== 'string' || v.split('-').join('').toLowerCase() !== k.toLowerCase().replace(/['’]/g, '') || v.split('-').some((x) => !x)) e.push(`syllables.${k}: the same letters as the word, cut with hyphens`);
            else ov[k.toLowerCase().replace(/['’]/g, '')] = v;
          });
        }
      }
      if (c.stress != null) {
        if (!Array.isArray(c.stress) || (lines && c.stress.length !== lines.length)) e.push('stress: one pattern per line');
        else if (all.length) c.stress.forEach((s, i) => {
          if (typeof s !== 'string' || !/^[/x]+$/.test(s)) { e.push(`stress[${i}]: only "/" (strong beat) and "x" (soft beat)`); return; }
          const n = sylCount(all[i], c.lang, ov);
          if (s.length !== n) e.push(`stress[${i}]: line ${i} has ${n} syllables but the pattern has ${s.length}`);
        });
      }
    }
    return e;
  }

  function keys(c) {
    const lines = (c && c.passage && Array.isArray(c.passage.lines) && c.passage.lines.length) || 0;
    const idx = Array.from({ length: lines }, (_, i) => i);
    const words = (c && Array.isArray(c.words) ? c.words : []).filter((x) => x && typeof x.w === 'string').map((x) => x.w);
    const chars = (c && Array.isArray(c.characters) ? c.characters : []).filter((x) => x && typeof x.id === 'string').map((x) => x.id);
    const mode = c && c.mode;
    const hasQ = !!(c && c.question);
    const t = [], ev = [];
    const lineT = () => idx.forEach((i) => { t.push('line:' + i); ev.push('line:' + i); });
    if (mode === 'panels') { lineT(); t.push('play'); ev.push('played'); if (hasQ) t.push('answer'); }
    else if (mode === 'read-along') { lineT(); t.push('play', 'sound', 'speed:slow', 'speed:normal', 'speed:fast'); ev.push('played'); words.forEach((w) => { t.push('word:' + w); ev.push('found:' + w); }); if (hasQ) t.push('answer'); }
    else if (mode === 'vocab') { t.push('play'); ev.push('played'); words.forEach((w) => { t.push('word:' + w); ev.push('found:' + w); }); t.push('answer'); }
    else if (mode === 'character') { chars.forEach((id) => { t.push('character:' + id); ev.push('picked:' + id); }); t.push('answer'); }
    else if (mode === 'emotion-map') { lineT(); t.push('answer'); ev.push('map-done'); }
    else if (mode === 'rhythm') { lineT(); t.push('play', 'beat'); ev.push('played', 'beat-ok'); if (hasQ) t.push('answer'); }
    if (t.includes('answer')) ev.push('answered:right', 'answered:wrong');
    return { targets: t, events: ev };
  }

  // ------------------------------------------------------------ the view
  function reader(root, cfg, api) {
    const mode = cfg.mode;
    const lines = cfg.passage.lines;
    const uid = 'rd' + (++UID);
    const pLang = cfg.lang;
    const spLang = pLang === 'en' ? 'en' : 'hi';
    const tp = (x) => (typeof x === 'string' ? x : api.t(x));
    const tr = (en, hi) => api.t(T2(en, hi));
    const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k]);
    const words = cfg.words || [];
    const wmap = new Map(words.map((x) => [norm(x.w), x]));
    const chars = (cfg.characters || []).map((c, i) => ({ id: c.id, i, col: CHAR_COL[i % CHAR_COL.length], pname: wordOf(c.name, pLang), name: c.name, traits: c.traits }));
    const nameRe = chars.length ? new RegExp('(' + chars.map((c) => c.pname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|') + ')', 'giu') : null;
    const ov = {}; Object.keys(cfg.syllables || {}).forEach((k) => { ov[k.toLowerCase().replace(/['’]/g, '')] = cfg.syllables[k]; });
    const S = { sel: -1, active: -1, wi: -1, playing: false, sound: true, speed: 'normal', found: new Set(), open: null, qi: 0, wrong: new Set(), qdone: false, fb: null, cur: 0, emo: [], tries: 0, hint: '', result: null, mapDone: false, picked: null };
    const Q = { done: false, wrong: new Set(), fb: '' };
    const timers = new Set();
    let raf = 0, ac = null, destroyed = false;
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!destroyed) fn(); }, ms); timers.add(id); return id; };
    const clearTimers = () => { timers.forEach((id) => clearTimeout(id)); timers.clear(); if (raf) { cancelAnimationFrame(raf); raf = 0; } };
    const say = (text, lang) => { try { api.speak(text, lang || spLang); } catch (e) { /* no speech here */ } };
    const hush = () => { try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* none */ } };
    const live = (m) => { const el = root.querySelector('.rd-live'); if (el) el.textContent = m; };
    const devCls = DEV.test(lines.join('')) ? ' dev' : '';

    const MODE_NAME = {
      panels: T2('Picture panels', 'चित्र-पट्टियाँ'), rhythm: T2('Feel the rhythm', 'लय महसूस करो'), vocab: T2('Word hunt', 'शब्द खोज'),
      character: T2('Meet the characters', 'पात्रों से मिलो'), 'emotion-map': T2('Feelings map', 'भावनाओं का नक्शा'), 'read-along': T2('Read along', 'साथ-साथ पढ़ो'),
    };
    const HOW = {
      panels: T2('Tap a picture to hear its line. Press Play to watch the whole story.', 'किसी चित्र को दबाकर उसकी पंक्ति सुनो। पूरी कहानी देखने के लिए चलाओ दबाओ।'),
      rhythm: T2('Press Play. Tap the big button each time a part of a word lights up.', 'चलाओ दबाओ। शब्द का कोई भाग चमके तो बड़ा बटन दबाओ।'),
      vocab: T2('Tap the glowing words to see what they mean. Then play the word game.', 'चमकते शब्दों को दबाकर उनके अर्थ देखो। फिर शब्दों का खेल खेलो।'),
      character: T2('Tap a character to learn about them. Then guess who the clue is about.', 'किसी पात्र को दबाकर उसके बारे में जानो। फिर अनुमान लगाओ कि संकेत किसका है।'),
      'emotion-map': T2('Read each line and pick the feeling. Your answers draw the story\'s feeling line.', 'हर पंक्ति पढ़ो और भाव चुनो। तुम्हारे उत्तर कहानी की भाव-रेखा बनाएँगे।'),
      'read-along': T2('Press Play and follow the glowing words. Tap a line to hear it again.', 'चलाओ दबाओ और चमकते शब्दों के साथ पढ़ो। किसी पंक्ति को दबाकर दोबारा सुनो।'),
    };
    const LANGNAME = { en: 'English', hi: 'हिन्दी', sa: 'संस्कृतम्' };

    // ---- line text with key words and character names
    function lineHTML(i, o) {
      o = o || {};
      let html = '';
      const textSegs = [];
      const line = lines[i];
      if (nameRe && o.names) {
        let last = 0; nameRe.lastIndex = 0;
        for (const m of line.matchAll(nameRe)) {
          if (m.index > last) textSegs.push({ t: line.slice(last, m.index) });
          const c = chars.find((x) => norm(x.pname) === norm(m[0]));
          textSegs.push({ t: m[0], c });
          last = m.index + m[0].length;
        }
        if (last < line.length) textSegs.push({ t: line.slice(last) });
      } else textSegs.push({ t: line });
      textSegs.forEach((sg) => {
        if (sg.c) { html += `<span class="rd-nm" style="--cc:${sg.c.col}">${esc(sg.t)}</span>`; return; }
        tokens(sg.t).forEach((tk) => {
          if (!isWordTok(tk)) { html += esc(tk); return; }
          const wd = o.keywords ? wmap.get(norm(tk)) : null;
          const wi = o.wc ? o.wc.n++ : 0;
          if (wd) html += `<button type="button" class="rd-w rd-kw ${S.found.has(norm(wd.w)) ? 'found' : ''}" data-key="word:${esc(wd.w)}" data-w="${esc(wd.w)}" data-wi="${wi}">${esc(tk)}</button>`;
          else html += `<span class="rd-w" data-wi="${wi}">${esc(tk)}</span>`;
        });
      });
      return html;
    }

    // ---- shared question
    function qHTML() {
      const q = cfg.question;
      if (!q) return '';
      return `<section class="rd-q" aria-label="${esc(tr('A question about the passage', 'अंश के बारे में एक प्रश्न'))}">
        <h3>${esc(tr('Think about it', 'सोचो'))}</h3><p class="rd-qt">${esc(api.t(q.q))}</p>
        <div class="rd-opts" role="group">${q.options.map((o, i) => `<button type="button" class="rd-opt ${Q.done && i === q.answer ? 'ok' : ''} ${Q.wrong.has(i) ? 'bad' : ''}" data-key="answer" data-o="${i}" ${Q.done || Q.wrong.has(i) ? 'disabled' : ''}><span class="ky">${'ABCD'[i]}</span><span>${esc(tp(o))}</span></button>`).join('')}</div>
        <div class="rd-fb ${Q.fb && Q.done ? 'ok' : Q.fb ? 'bad' : ''}">${esc(Q.fb)}</div></section>`;
    }
    function answerQ(i) {
      const q = cfg.question;
      if (Q.done || Q.wrong.has(i)) return;
      if (i === q.answer) {
        Q.done = true; Q.fb = tr('Yes, well done! ', 'हाँ, शाबाश! ') + (q.why ? api.t(q.why) : '');
        api.record(tr('Answered the passage question correctly', 'अंश का प्रश्न सही हल किया'));
        rerender(); live(Q.fb); api.emit('answered:right');
      } else {
        Q.wrong.add(i); Q.fb = tr('Not quite. Read the passage again and try another answer.', 'ठीक नहीं। अंश दोबारा पढ़ो और दूसरा उत्तर चुनो।');
        api.record(tr('Tried a wrong answer to the passage question', 'अंश के प्रश्न का ग़लत उत्तर चुना'));
        rerender(); live(Q.fb); api.emit('answered:wrong');
      }
    }

    // ---- playing lines (panels, read-along, vocab)
    const SPEED = { slow: 0.7, normal: 1, fast: 1.4 };
    function wordMs(tk) { return clamp(68 * [...tk].length + 150, 240, 950) / SPEED[S.speed]; }
    function lineWords(i) {
      const out = []; const tk = tokens(lines[i]);
      tk.forEach((t, k) => { if (isWordTok(t)) { const nx = tk[k + 1] || ''; const pause = /[.!?।]/.test(nx) ? 520 : /[,;:—-]/.test(nx) ? 260 : 0; out.push({ t, ms: wordMs(t) + pause / SPEED[S.speed] }); } });
      return out;
    }
    const lineMs = (i) => (mode === 'panels' ? 1300 + 62 * [...lines[i]].length : mode === 'vocab' ? 1000 + 62 * [...lines[i]].length : lineWords(i).reduce((a, w) => a + w.ms, 0) + 350);
    function paint() {
      root.querySelectorAll('[data-i]').forEach((el) => {
        if (el.classList.contains('rd-pan') || el.classList.contains('rd-ln') || el.classList.contains('rd-rl')) el.classList.toggle('act', Number(el.dataset.i) === S.active);
      });
      if (mode === 'read-along' || mode === 'vocab') {
        const ws = root.querySelectorAll('.rd-w[data-wi]');
        ws.forEach((el) => {
          const n = Number(el.dataset.wi); const ln = el.closest('.rd-ln');
          const inAct = ln && Number(ln.dataset.i) === S.active;
          el.classList.toggle('now', inAct && n === S.wi);
          el.classList.toggle('done', !!inAct && n < S.wi);
        });
      }
      const pb = root.querySelector('[data-key="play"]');
      if (pb && mode !== 'rhythm') { pb.setAttribute('aria-pressed', S.playing ? 'true' : 'false'); pb.querySelector('.t').textContent = S.playing ? tr('Stop', 'रोको') : tr(mode === 'panels' ? 'Play the story' : mode === 'vocab' ? 'Listen' : 'Play', mode === 'panels' ? 'कहानी चलाओ' : mode === 'vocab' ? 'सुनो' : 'चलाओ'); pb.querySelector('.i').innerHTML = S.playing ? IC.stop : IC.play; }
    }
    function stopPlay() { clearTimers(); hush(); S.playing = false; S.active = -1; S.wi = -1; paint(); }
    function playLines(from, to, final) {
      stopPlay(); S.playing = true;
      const go = (i) => {
        if (i > to) { S.playing = false; S.active = -1; S.wi = -1; paint(); if (final) { api.emit('played'); api.record(tr('Played the passage', 'अंश चलाकर सुना')); api.celebrate(); } return; }
        S.active = i; S.wi = -1; paint();
        const el = root.querySelector(`[data-i="${i}"]`);
        if (el && el.scrollIntoView && (mode === 'panels' || i > from)) el.scrollIntoView({ block: 'nearest', behavior: L.reducedMotion() ? 'auto' : 'smooth' });
        if (mode === 'panels' || S.sound) say(lines[i]);
        let ms = lineMs(i);
        if (mode === 'read-along' || mode === 'vocab') {
          let acc = 0; const ws = lineWords(i); let base = lineBase(i);
          ws.forEach((w, k) => { later(() => { S.wi = base + k; paint(); }, acc); acc += w.ms; });
          ms = acc + 350;
        }
        later(() => go(i + 1), ms);
      };
      go(from);
    }
    function lineBase(i) { const first = root.querySelector(`.rd-ln[data-i="${i}"] .rd-w[data-wi]`); return first ? Number(first.dataset.wi) : 0; }

    // ---- views
    const VIEW = {};
    VIEW.panels = () => {
      const fx = chars;
      return `<div class="rd-tools">${playBtn()}</div>
      <div class="rd-grid">${lines.map((ln, i) => {
        const art = cfg.passage.art && api.asset ? api.asset(cfg.passage.art[i]) : null;
        const cs = fx.map((c) => ({ col: c.col, in: norm(ln).includes(norm(c.pname)) }));
        return `<button type="button" class="rd-pan ${S.sel === i ? 'sel' : ''} ${S.active === i ? 'act' : ''}" data-key="line:${i}" data-i="${i}" aria-pressed="${S.sel === i}" aria-label="${esc(tr('Panel', 'पट्टी'))} ${i + 1}: ${esc(ln)}">
          <span class="rd-pn" aria-hidden="true">${i + 1}</span>
          <span class="rd-art" aria-hidden="true">${art ? `<img src="${esc(art)}" alt="">` : `<svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice">${sceneSVG(ln, i, pLang, cs, uid)}</svg>`}</span>
          <span class="rd-cap${devCls}">${esc(ln)}</span></button>`;
      }).join('')}</div>${qHTML()}`;
    };
    function playBtn() {
      return `<button type="button" class="rd-play" data-key="play" aria-pressed="${S.playing}"><span class="i">${S.playing ? IC.stop : IC.play}</span><span class="t">${esc(S.playing ? tr('Stop', 'रोको') : tr(mode === 'panels' ? 'Play the story' : mode === 'vocab' ? 'Listen' : 'Play', mode === 'panels' ? 'कहानी चलाओ' : mode === 'vocab' ? 'सुनो' : 'चलाओ'))}</span></button>`;
    }
    function passageHTML(o) {
      const wc = { n: 0 };
      return `<div class="rd-card" style="padding:8px">${lines.map((ln, i) => `<div class="rd-ln" data-i="${i}">
        ${o.listen ? `<button type="button" class="rd-lbtn" data-key="line:${i}" aria-label="${esc(tr('Listen to line', 'पंक्ति सुनो'))} ${i + 1}">${IC.ear}</button>` : ''}
        <p class="rd-ltx${devCls}">${lineHTML(i, { keywords: true, wc })}</p></div>`).join('')}</div>`;
    }
    function meaningHTML() {
      if (!S.open) return '<div class="rd-card rd-mean" style="opacity:.8"><span class="rd-mi" aria-hidden="true">' + IC.bulb + '</span><div><b>?</b><p>' + esc(tr('Tap a glowing word to see what it means.', 'किसी चमकते शब्द को दबाओ और उसका अर्थ देखो।')) + '</p></div></div>';
      const wd = wmap.get(S.open);
      return `<div class="rd-card rd-mean"><span class="rd-mi" aria-hidden="true">${IC.bulb}</span><div><b>${esc(wd.w)}</b><p>${esc(api.t(wd.meaning))}</p></div></div>`;
    }
    function progHTML() {
      const n = words.length; const f = S.found.size;
      return `<div class="rd-prog" aria-label="${esc(tr('Words found', 'मिले शब्द'))}"><span>${f}/${n}</span><span class="rd-bar"><i style="width:${n ? Math.round((f / n) * 100) : 0}%"></i></span></div>`;
    }
    VIEW['read-along'] = () => `<div class="rd-tools">${playBtn()}
      <span class="rd-seg" role="group" aria-label="${esc(tr('Speed', 'गति'))}">${['slow', 'normal', 'fast'].map((k) => `<button type="button" data-key="speed:${k}" aria-pressed="${S.speed === k}">${esc(tr({ slow: 'Slow', normal: 'Normal', fast: 'Fast' }[k], { slow: 'धीमा', normal: 'सामान्य', fast: 'तेज़' }[k]))}</button>`).join('')}</span>
      <button type="button" class="rd-pill" data-key="sound" aria-pressed="${S.sound}">${IC.ear.replace('<svg', '<svg width="20" height="20"')}${esc(S.sound ? tr('Sound on', 'आवाज़ चालू') : tr('Sound off', 'आवाज़ बंद'))}</button>
      ${words.length ? progHTML() : ''}</div>
      ${passageHTML({ listen: true })}${words.length ? `<div aria-live="polite">${meaningHTML()}</div>` : ''}${qHTML()}`;

    function quizWord() { return words[S.qi]; }
    function quizOpts() {
      const w = quizWord();
      const others = shuffled(words.filter((x) => x !== w), 'o' + w.w).slice(0, 3);
      return shuffled([w].concat(others), 'q' + w.w + S.qi);
    }
    VIEW.vocab = () => {
      const w = quizWord();
      const done = S.qi >= words.length;
      return `<div class="rd-tools">${playBtn()}${progHTML()}</div>${passageHTML({ listen: false })}<div aria-live="polite">${meaningHTML()}</div>
      <section class="rd-q" aria-label="${esc(tr('Word game', 'शब्दों का खेल'))}"><h3>${esc(tr('Word game', 'शब्दों का खेल'))}  ${done ? '' : `(${S.qi + 1}/${words.length})`}</h3>
      ${done ? `<p class="rd-qt">${esc(tr('You matched every word. Brilliant!', 'तुमने सारे शब्द मिला लिए। शानदार!'))}</p>` : `<p class="rd-qt">${esc(tr('Which word means: ', 'कौन-सा शब्द इसका अर्थ है: '))}<b>${esc(api.t(w.meaning))}</b></p>
      <div class="rd-opts" role="group">${quizOpts().map((o) => `<button type="button" class="rd-opt ${S.wrong.has(o.w) ? 'bad' : ''}" data-key="answer" data-o="${esc(o.w)}" ${S.wrong.has(o.w) ? 'disabled' : ''}><span>${esc(o.w)}</span></button>`).join('')}</div>`}
      <div class="rd-fb ${S.fb && S.fb.ok ? 'ok' : S.fb ? 'bad' : ''}">${esc(S.fb ? S.fb.m : '')}</div></section>`;
    };
    function answerVocab(wd) {
      const w = quizWord();
      if (!w || S.wrong.has(wd)) return;
      if (norm(wd) === norm(w.w)) {
        const ln = lines.find((l) => tokens(l).some((t) => norm(t) === norm(w.w))) || '';
        S.fb = { ok: true, m: tr('Yes! ', 'हाँ! ') + `"${w.w}" = ${api.t(w.meaning)}` }; S.wrong = new Set(); S.qi++;
        if (!S.found.has(norm(w.w))) S.found.add(norm(w.w));
        api.record(tr('Matched the word ', 'शब्द मिलाया: ') + w.w);
        rerender(); live(S.fb.m); void ln; api.emit('answered:right');
        if (S.qi >= words.length) { api.celebrate(); api.record(tr('Finished the word game', 'शब्दों का खेल पूरा किया')); }
      } else {
        S.wrong.add(wd); S.fb = { ok: false, m: tr('Not quite. Find that meaning in the story and try again.', 'ठीक नहीं। कहानी में वह अर्थ ढूँढो और फिर कोशिश करो।') };
        rerender(); live(S.fb.m); api.emit('answered:wrong');
      }
    }
    function openWord(w) {
      const wd = words.find((x) => x.w === w); if (!wd) return;
      S.open = norm(wd.w); const first = !S.found.has(S.open); S.found.add(S.open);
      rerender();
      say(wd.w); later(() => say(api.t(wd.meaning), api.lang ? api.lang() : 'en'), 900);
      live(wd.w + ': ' + api.t(wd.meaning));
      api.record(tr('Found the word ', 'शब्द मिला: ') + wd.w);
      api.emit('found:' + wd.w);
      if (first && S.found.size === words.length) { api.celebrate(); api.record(tr('Found all the key words', 'सारे मुख्य शब्द मिल गए')); }
    }

    // character
    VIEW.character = () => {
      const sel = chars.find((c) => c.id === S.picked);
      const round = S.qi;
      const done = round >= chars.length;
      const target = chars[round];
      const clue = target ? target.traits[round % target.traits.length] : null;
      return `<div class="rd-chars">${chars.map((c) => `<button type="button" class="rd-ch" style="--cc:${c.col}" data-key="character:${esc(c.id)}" aria-pressed="${S.picked === c.id}"><span class="av"><svg viewBox="0 0 40 40" aria-hidden="true">${M.person(c.col)}</svg></span><span>${esc(tp(c.name))}</span></button>`).join('')}</div>
      <div class="rd-card" aria-live="polite" ${sel ? `style="border-color:${sel.col}"` : ''}>${sel ? `<b style="font-family:var(--font-display);font-size:22px;color:var(--ink)">${esc(tp(sel.name))}</b><div class="rd-traits" style="--cc:${sel.col}">${sel.traits.map((t, k) => `<span class="rd-trait" style="--cc:${sel.col};animation-delay:${k * 90}ms">${esc(api.t(t))}</span>`).join('')}</div>` : `<p style="margin:0;font-size:17px">${esc(tr('Tap a character to learn about them.', 'किसी पात्र को दबाकर उसके बारे में जानो।'))}</p>`}</div>
      <div class="rd-card" style="padding:8px">${lines.map((ln, i) => { const here = sel && norm(ln).includes(norm(sel.pname)); return `<div class="rd-ln ${here ? 'on' : ''}" ${here ? `style="--cc:${sel.col}"` : ''}><p class="rd-ltx${devCls}">${lineHTML(i, { names: true, keywords: false })}</p></div>`; }).join('')}</div>
      <section class="rd-q rd-ask"><h3>${esc(tr('Who is it?', 'यह कौन है?'))} ${done ? '' : `(${round + 1}/${chars.length})`}</h3>
      ${done ? `<p class="rd-qt">${esc(tr('You know all the characters now. Well done!', 'अब तुम सभी पात्रों को जानते हो। शाबाश!'))}</p>` : `<div class="rd-clue">${esc(api.t(clue))}</div>
      <div class="rd-opts" role="group">${shuffled(chars, 'c' + round).map((c) => `<button type="button" class="rd-opt ${S.wrong.has(c.id) ? 'bad' : ''}" data-key="answer" data-o="${esc(c.id)}" ${S.wrong.has(c.id) ? 'disabled' : ''}><span class="ky" style="background:${c.col};color:#fff"> </span><span>${esc(tp(c.name))}</span></button>`).join('')}</div>`}
      <div class="rd-fb ${S.fb && S.fb.ok ? 'ok' : S.fb ? 'bad' : ''}">${esc(S.fb ? S.fb.m : '')}</div></section>`;
    };
    function answerChar(id) {
      const target = chars[S.qi]; if (!target || S.wrong.has(id)) return;
      if (id === target.id) {
        S.fb = { ok: true, m: tr('Yes! That is ', 'हाँ! यह है ') + tp(target.name) }; S.wrong = new Set(); S.qi++;
        rerender(); live(S.fb.m); api.record(tr('Matched a clue to ', 'संकेत मिलाया: ') + tp(target.name)); api.emit('answered:right');
        if (S.qi >= chars.length) api.celebrate();
      } else {
        S.wrong.add(id); S.fb = { ok: false, m: tr('Not this one. Think about what the character does in the story.', 'यह नहीं। सोचो, पात्र कहानी में क्या करता है।') };
        rerender(); live(S.fb.m); api.emit('answered:wrong');
      }
    }

    // emotion-map
    const emoOpts = (() => {
      const used = [...new Set(cfg.emotions || [])];
      const o = used.slice();
      for (const k of EMO_FILL) { if (o.length >= 5) break; if (!o.includes(k)) o.push(k); }
      return EMO_IDS.filter((k) => o.includes(k));
    })();
    function curveSVG() {
      const n = lines.length, W = 320, H = 156, x0 = 22, x1 = W - 22;
      const X = (i) => x0 + (n > 1 ? (i * (x1 - x0)) / (n - 1) : 0);
      const Y = (v) => 128 - v * 104;
      const pts = []; S.emo.forEach((e, i) => { if (e) pts.push([X(i), Y(EMO[e].v), i, e]); });
      let d = '';
      if (pts.length) {
        d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
        for (let k = 0; k + 1 < pts.length; k++) {
          const p0 = pts[k - 1] || pts[k], p1 = pts[k], p2 = pts[k + 1], p3 = pts[k + 2] || p2;
          const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = clamp(p1[1] + (p2[1] - p0[1]) / 6, 14, 136);
          const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = clamp(p2[1] - (p3[1] - p1[1]) / 6, 14, 136);
          d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
        }
      }
      return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(tr('The feeling line of the story', 'कहानी की भाव-रेखा'))}">
        <rect x="0" y="0" width="${W}" height="${Y(0.5)}" rx="10" fill="#FFD23F" opacity=".14"/><rect x="0" y="${Y(0.5)}" width="${W}" height="${H - 26 - Y(0.5) + 24}" rx="10" fill="#7FB2FF" opacity=".14"/>
        <path d="M0 ${Y(0.5)}H${W}" stroke="var(--line)" stroke-dasharray="4 5" stroke-width="1.500"/>
        <text x="8" y="14">${esc(tr('happy side', 'ख़ुशी की ओर'))}</text><text x="8" y="${Y(0) + 4}">${esc(tr('hard feelings', 'कठिन भाव'))}</text>
        ${Array.from({ length: n }, (_, i) => `<text x="${X(i)}" y="${H - 3}" text-anchor="middle">${i + 1}</text>`).join('')}
        ${d ? `<path class="ln" d="${d}" pathLength="1000"/>` : ''}
        ${pts.map((p) => `<g transform="translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})"><circle r="11" fill="${EMO[p[3]].c}" stroke="#7C2D12" stroke-width="2"/><text y="4" text-anchor="middle" style="font-size:11px;font-weight:800;fill:#1E293B">${p[2] + 1}</text></g>`).join('')}</svg>`;
    }
    function summary() {
      const es = S.emo; const n = es.length; if (es.some((x) => !x)) return '';
      let low = 0; es.forEach((e, i) => { if (EMO[e].v < EMO[es[low]].v) low = i; });
      const nm = (e) => api.t(EMO[e].n);
      return fmt(tr('The story starts with {a}, its hardest moment is at line {l} ({b}), and it ends with {c}.', 'कहानी {a} से शुरू होती है, सबसे कठिन क्षण पंक्ति {l} पर है ({b}), और अंत {c} पर होता है।'), { a: nm(es[0]), l: low + 1, b: nm(es[low]), c: nm(es[n - 1]) });
    }
    VIEW['emotion-map'] = () => {
      const n = lines.length; const all = S.emo.every((x) => x);
      return `<ol class="rd-elist">${lines.map((ln, i) => { const e = S.emo[i]; return `<li><button type="button" class="rd-el ${S.cur === i && !all ? 'cur' : ''} ${e ? 'done' : ''}" ${e ? `style="--ec:${EMO[e].c}"` : ''} data-key="line:${i}" data-i="${i}" aria-label="${esc(tr('Line', 'पंक्ति'))} ${i + 1}: ${esc(ln)}${e ? ', ' + esc(api.t(EMO[e].n)) : ''}"><span class="n">${i + 1}</span><span class="t${devCls}">${esc(ln)}</span><span class="f ${e ? '' : 'q'}">${e ? faceSVG(e, 38) : '?'}</span></button></li>`; }).join('')}</ol>
      ${all ? `<div class="rd-sum" aria-live="polite">${esc(summary())}</div>` : `<section class="rd-q rd-ask"><h3>${esc(fmt(tr('How does line {n} feel?', 'पंक्ति {n} में कैसा भाव है?'), { n: S.cur + 1 }))}</h3>
      <div class="rd-feels" role="group">${emoOpts.map((id) => `<button type="button" class="rd-fe ${S.wrong.has(id) ? 'bad' : ''}" data-key="answer" data-e="${id}" ${S.wrong.has(id) ? 'disabled' : ''}>${faceSVG(id, 44)}<span>${esc(api.t(EMO[id].n))}</span></button>`).join('')}</div>
      <div class="rd-fb ${S.fb && S.fb.ok ? 'ok' : S.fb ? 'bad' : ''}">${esc(S.fb ? S.fb.m : '')}</div></section>`}
      <div class="rd-curve">${curveSVG()}</div>`;
    };
    function nextEmo() { for (let k = 0; k < lines.length; k++) { const j = (S.cur + k) % lines.length; if (!S.emo[j]) return j; } return -1; }
    function answerEmo(id) {
      if (S.wrong.has(id) || S.emo[S.cur]) return;
      const right = cfg.emotions[S.cur];
      if (id === right) {
        S.emo[S.cur] = id; S.wrong = new Set(); S.tries = 0;
        const nm = api.t(EMO[id].n);
        S.fb = { ok: true, m: tr('Yes, ', 'हाँ, ') + nm + '.' };
        api.record(fmt(tr('Line {n} feels like {e}', 'पंक्ति {n} में भाव: {e}'), { n: S.cur + 1, e: nm }));
        const nx = nextEmo(); if (nx >= 0) S.cur = nx;
        rerender(); live(S.fb.m); api.emit('answered:right');
        if (nx < 0) { S.mapDone = true; api.celebrate(); api.emit('map-done'); live(summary()); }
      } else {
        S.wrong.add(id); S.tries++;
        const side = EMO[right].side;
        const hint = S.tries >= 2 ? (side === 'hard' ? tr(' Hint: it is a hard feeling.', ' संकेत: यह कठिन भाव है।') : side === 'good' ? tr(' Hint: it is a happy-side feeling.', ' संकेत: यह ख़ुशी की ओर का भाव है।') : tr(' Hint: it is a feeling in between.', ' संकेत: यह बीच का भाव है।')) : '';
        S.fb = { ok: false, m: tr('Not quite. Read the line again and look at the clue words.', 'ठीक नहीं। पंक्ति फिर पढ़ो और संकेत वाले शब्द देखो।') + hint };
        rerender(); live(S.fb.m); api.emit('answered:wrong');
      }
    }

    // rhythm
    const bpm = cfg.bpm || 84;
    const iv = 60000 / bpm;
    const parsed = lines.map((l) => lineSylls(l, pLang, ov));
    const rl = rhymeLetters(lines, pLang);
    const sylName = pLang === 'en' ? tr('syllables', 'अक्षर') : tr('syllables', 'अक्षर');
    let seq = [], hits = new Set(), t0 = 0, lastK = -1, strongTotal = 0;
    function buildSeq() {
      seq = [{ kind: 'c', n: 1 }, { kind: 'c', n: 2 }]; strongTotal = 0; let g = 0;
      parsed.forEach((ln, i) => {
        let k = 0; const pat = cfg.stress ? cfg.stress[i] : null;
        ln.forEach((tk) => { if (tk.p) tk.p.forEach(() => { const strong = pat ? pat[k] === '/' : true; k++; if (strong) strongTotal++; seq.push({ kind: 's', line: i, g, strong }); g++; }); });
        seq.push({ kind: 'r', line: i });
      });
    }
    VIEW.rhythm = () => {
      let g = 0;
      const rows = lines.map((ln, i) => {
        const pat = cfg.stress ? cfg.stress[i] : null; let k = 0;
        const body = parsed[i].map((tk) => {
          if (!tk.p) return `<span class="rd-pu">${esc(tk.t.trim() === '' ? ' ' : tk.t)}</span>`;
          return `<span class="rd-wg">${tk.p.map((pc) => { const weak = pat && pat[k] !== '/'; k++; return `<span class="rd-sp ${weak ? 'weak' : ''}" data-g="${g++}">${esc(pc)}</span>`; }).join('')}</span>`;
        }).join('');
        const n = parsed[i].reduce((a, tk) => a + (tk.p ? tk.p.length : 0), 0);
        return `<div class="rd-rl" data-i="${i}"><button type="button" class="rd-lbtn" data-key="line:${i}" aria-label="${esc(tr('Listen to line', 'पंक्ति सुनो'))} ${i + 1}">${IC.ear}</button><div class="rd-sy${devCls}" lang="${pLang === 'en' ? 'en' : 'hi'}">${body}</div><div class="rd-meta"><b>${n}</b><span>${esc(sylName)}</span>${rl[i] ? `<span class="rd-rh" title="${esc(tr('rhymes with the lines that share this letter', 'इसी अक्षर वाली पंक्तियों से तुक मिलती है'))}">${rl[i]}</span>` : ''}</div></div>`;
      }).join('');
      const r = S.result;
      return `<div class="rd-rtop">${rplay()}<span class="rd-pill" aria-label="${esc(tr('Speed', 'गति'))}">${bpm} ${esc(tr('beats a minute', 'बीट प्रति मिनट'))}</span></div>
      <div class="rd-card" style="padding:6px 8px">${rows}</div>
      <div class="rd-padw"><div class="rd-count" aria-hidden="true"></div>
        <button type="button" class="rd-drum" data-key="beat" aria-label="${esc(tr('Beat: tap in time with the glowing part', 'बीट: चमकते भाग के साथ ताल में दबाओ'))}">${esc(tr('TAP', 'ताल'))}</button>
        <div class="rd-score" aria-live="polite">${r ? esc(fmt(tr('You kept the beat on {a} of {b} beats.', 'तुमने {b} में से {a} बीट पर ताल रखी।'), { a: r.h, b: r.t })) + ' ' + esc(r.t && r.h / r.t >= 0.7 ? tr('Wonderful rhythm!', 'वाह, क्या लय है!') : tr('Play again to beat your score.', 'फिर चलाओ और अपना स्कोर सुधारो।')) : esc(tr('Press Play, then tap in time.', 'चलाओ दबाओ, फिर ताल में दबाओ।'))}</div></div>${qHTML()}`;
    };
    function rplay() {
      return `<button type="button" class="rd-play" data-key="play" aria-pressed="${S.playing}"><span class="i">${S.playing ? IC.stop : IC.play}</span><span class="t">${esc(S.playing ? tr('Stop', 'रोको') : tr('Play', 'चलाओ'))}</span></button>`;
    }
    function blip(freq, ms, vol) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        if (!ac) ac = new AC();
        if (ac.state === 'suspended') ac.resume();
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'triangle'; o.frequency.value = freq; g.gain.value = vol;
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + ms / 1000);
        o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + ms / 1000);
      } catch (e) { /* no audio */ }
    }
    function activate(k) {
      const e = seq[k]; if (!e) return;
      const prev = root.querySelector('.rd-sp.now'); if (prev) { prev.classList.remove('now'); prev.classList.add('past'); }
      const cnt = root.querySelector('.rd-count');
      const drum = root.querySelector('.rd-drum');
      if (e.kind === 'c') { if (cnt) cnt.textContent = e.n === 1 ? tr('Ready…', 'तैयार…') : tr('Steady…', 'ध्यान से…'); blip(520, 90, 0.18); }
      else if (e.kind === 's') {
        if (cnt) cnt.textContent = '';
        const el = root.querySelector(`.rd-sp[data-g="${e.g}"]`); if (el) el.classList.add('now');
        S.active = e.line; paint(); if (e.strong) blip(880, 110, 0.22); else blip(600, 70, 0.1);
        const row = root.querySelector(`.rd-rl[data-i="${e.line}"]`);
        if (row && row.scrollIntoView && (k === 2 || seq[k - 1].kind === 'r')) row.scrollIntoView({ block: 'nearest', behavior: L.reducedMotion() ? 'auto' : 'smooth' });
      } else if (cnt) cnt.textContent = '';
      if (drum && e.kind !== 'r') { drum.classList.remove('tick'); void drum.offsetWidth; if (e.kind === 's' && e.strong) drum.classList.add('tick'); }
    }
    function stopRhythm() {
      clearTimers(); S.playing = false; S.active = -1; hush();
      const prev = root.querySelector('.rd-sp.now'); if (prev) prev.classList.remove('now');
      paint(); const pb = root.querySelector('[data-key="play"]'); if (pb) { pb.setAttribute('aria-pressed', 'false'); pb.querySelector('.t').textContent = tr('Play', 'चलाओ'); pb.querySelector('.i').innerHTML = IC.play; }
      const cnt = root.querySelector('.rd-count'); if (cnt) cnt.textContent = '';
    }
    function startRhythm() {
      stopRhythm(); S.result = null; buildSeq(); hits = new Set(); lastK = -1; S.playing = true;
      root.querySelectorAll('.rd-sp').forEach((el) => el.classList.remove('now', 'past', 'hit', 'miss'));
      const sc = root.querySelector('.rd-score'); if (sc) sc.textContent = tr('Tap in time with the glowing part.', 'चमकते भाग के साथ ताल में दबाओ।');
      const pb = root.querySelector('[data-key="play"]'); if (pb) { pb.setAttribute('aria-pressed', 'true'); pb.querySelector('.t').textContent = tr('Stop', 'रोको'); pb.querySelector('.i').innerHTML = IC.stop; }
      t0 = performance.now() + 350;
      const loop = (now) => {
        if (!S.playing || destroyed) return;
        const pos = (now - t0) / iv; const k = Math.floor(pos);
        if (k > lastK) { for (let j = Math.max(0, lastK + 1); j <= k; j++) activate(j); lastK = k; }
        if (k >= seq.length) { finishRhythm(); return; }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    function finishRhythm() {
      raf = 0; S.playing = false; S.active = -1; S.result = { h: hits.size, t: strongTotal };
      api.record(fmt(tr('Kept the beat on {a} of {b}', '{b} में से {a} बीट पर ताल रखी'), { a: hits.size, b: strongTotal }));
      const ok = strongTotal && hits.size / strongTotal >= 0.7;
      const h = S.result;
      rerender(); live(fmt(tr('You kept the beat on {a} of {b} beats.', 'तुमने {b} में से {a} बीट पर ताल रखी।'), { a: h.h, b: h.t }));
      api.emit('played'); if (ok) api.celebrate();
    }
    function tapBeat() {
      if (!S.playing) { startRhythm(); return; }
      const now = performance.now(); const pos = (now - t0) / iv; const k = Math.round(pos); const d = Math.abs(pos - k);
      const e = seq[k]; const drum = root.querySelector('.rd-drum');
      if (e && e.kind === 's' && e.strong && d <= 0.42 && !hits.has(k)) {
        hits.add(k);
        const el = root.querySelector(`.rd-sp[data-g="${e.g}"]`); if (el) el.classList.add('hit');
        api.emit('beat-ok');
      } else {
        const tgt = e && e.kind === 's' ? root.querySelector(`.rd-sp[data-g="${e.g}"]`) : null;
        if (tgt && !hits.has(k) && d > 0.42) tgt.classList.add('miss');
        if (drum) { drum.classList.add('off'); later(() => drum.classList.remove('off'), 160); }
      }
    }

    // ---- shell
    root.innerHTML = `<div class="rd rd-m-${mode}">${defs(uid)}
      <header class="rd-head"><span class="rd-hico" aria-hidden="true">${IC.book}</span><div class="rd-ht"><div class="rd-kick">${esc(api.t(MODE_NAME[mode]))}</div><h2 class="rd-title">${esc(tp(cfg.passage.title))}</h2></div><span class="rd-lang">${LANGNAME[pLang]}</span></header>
      <p class="rd-how">${esc(api.t(HOW[mode]))}</p><div class="rd-main"></div><div class="rd-live" role="status" aria-live="polite"></div></div>`;
    const main = root.querySelector('.rd-main');
    function compose(el) { return el.dataset.key + '|' + (el.dataset.i || el.dataset.o || el.dataset.e || el.dataset.w || ''); }
    function rerender() {
      const a = document.activeElement; const k = a && main.contains(a) ? compose(a) : null;
      main.innerHTML = VIEW[mode]();
      if (k) { const again = [...main.querySelectorAll('[data-key]')].find((el) => compose(el) === k && !el.disabled); if (again) again.focus({ preventScroll: true }); }
      paint();
    }

    // ---- input
    function onClick(ev) {
      const el = ev.target.closest('[data-key]');
      if (!el || !root.contains(el) || el.disabled) return;
      if (el.classList.contains('rd-drum') && ev.detail !== 0) return; // pointer taps are handled on pointerdown
      handle(el);
    }
    function handle(el) {
      const key = el.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key === 'beat') { tapBeat(); return; }
      if (key === 'play') {
        if (mode === 'rhythm') { if (S.playing) stopRhythm(); else startRhythm(); return; }
        if (S.playing) { stopPlay(); return; }
        playLines(0, lines.length - 1, true); return;
      }
      if (key === 'sound') { S.sound = !S.sound; if (!S.sound) hush(); rerender(); return; }
      if (key.startsWith('speed:')) { S.speed = key.slice(6); rerender(); return; }
      if (key.startsWith('line:')) {
        const i = Number(key.slice(5));
        if (mode === 'emotion-map') { if (!S.emo.every((x) => x) && !S.emo[i]) S.cur = i; else if (S.emo[i]) { say(lines[i]); } rerender(); api.emit('line:' + i); return; }
        if (mode === 'rhythm') { stopRhythm(); S.active = i; paint(); say(lines[i]); later(() => { S.active = -1; paint(); }, lineMs0(i)); api.emit('line:' + i); return; }
        if (mode === 'read-along') { playLines(i, i, false); api.emit('line:' + i); return; }
        S.sel = i; rerender(); say(lines[i]); live(lines[i]); api.record(tr('Opened panel ', 'पट्टी खोली: ') + (i + 1)); api.emit('line:' + i); return;
      }
      if (key.startsWith('word:')) { openWord(el.dataset.w); return; }
      if (key.startsWith('character:')) {
        const id = key.slice(10); S.picked = id; const c = chars.find((x) => x.id === id);
        rerender(); if (c) { say(tp(c.name), api.lang ? api.lang() : spLang); live(tp(c.name) + ': ' + c.traits.map((t) => api.t(t)).join(', ')); api.record(tr('Met ', 'मिला: ') + tp(c.name)); }
        api.emit('picked:' + id); return;
      }
      if (key === 'answer') {
        if (mode === 'vocab') answerVocab(el.dataset.o);
        else if (mode === 'character') answerChar(el.dataset.o);
        else if (mode === 'emotion-map') answerEmo(el.dataset.e);
        else answerQ(Number(el.dataset.o));
      }
    }
    const lineMs0 = (i) => 800 + 55 * [...lines[i]].length;
    function onDown(ev) {
      const el = ev.target.closest('.rd-drum');
      if (!el || !root.contains(el) || ev.button > 0) return;
      el.classList.add('pressed'); handle(el);
    }
    function onUp() { const d = root.querySelector('.rd-drum'); if (d) d.classList.remove('pressed'); }
    function onKey(ev) {
      const el = ev.target.closest && ev.target.closest('.rd-drum');
      if (el && (ev.key === ' ' || ev.key === 'Enter')) { ev.preventDefault(); if (!ev.repeat) { el.classList.add('pressed'); handle(el); } }
    }
    function onKeyUp(ev) { if (ev.key === ' ' || ev.key === 'Enter') onUp(); }
    root.addEventListener('click', onClick);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('keydown', onKey);
    root.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerup', onUp);
    if (mode === 'emotion-map') { S.emo = lines.map(() => null); }
    rerender();
    return {
      destroy() {
        destroyed = true; clearTimers(); hush();
        root.removeEventListener('click', onClick); root.removeEventListener('pointerdown', onDown); root.removeEventListener('keydown', onKey); root.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('pointerup', onUp);
        try { if (ac && ac.close) ac.close(); } catch (e) { /* closed */ }
      },
    };
  }

  NCA_T.register({
    id: 'reader',
    css: CSS,
    validate,
    keys,
    demo: {
      mode: 'panels',
      lang: 'en',
      passage: {
        title: { en: 'Ravi and the red kite', hi: 'रवि और लाल पतंग' },
        lines: [
          'Early in the morning, Ravi ran up to the roof with his red kite.',
          'The sun peeped over the hills and the whole village woke up.',
          'A strong wind came, and the kite flew high above the trees.',
          'Suddenly the string snapped, and Ravi felt very sad.',
          'His friend Meena pointed at a bird flying beside the kite.',
          'Together they ran down the road, laughing, to bring the kite home.',
        ],
      },
      words: [
        { w: 'peeped', meaning: { en: 'looked out slowly, a little at a time', hi: 'धीरे-धीरे थोड़ा-थोड़ा बाहर झाँका' } },
        { w: 'suddenly', meaning: { en: 'all at once, without warning', hi: 'अचानक, बिना बताए' } },
        { w: 'snapped', meaning: { en: 'broke with a quick sharp sound', hi: 'झटके से टूट गया' } },
      ],
      characters: [
        { id: 'ravi', name: 'Ravi', traits: [{ en: 'loves flying kites', hi: 'पतंग उड़ाना पसंद है' }, { en: 'gets sad when things break', hi: 'कुछ टूटने पर उदास हो जाता है' }] },
        { id: 'meena', name: 'Meena', traits: [{ en: 'notices small things', hi: 'छोटी बातें देख लेती है' }, { en: 'a good friend', hi: 'अच्छी दोस्त' }] },
      ],
      question: {
        q: { en: 'Why did Ravi feel sad?', hi: 'रवि उदास क्यों हुआ?' },
        options: [{ en: 'The string of his kite broke.', hi: 'उसकी पतंग की डोर टूट गई।' }, { en: 'The wind stopped.', hi: 'हवा रुक गई।' }, { en: 'Meena went home.', hi: 'मीना घर चली गई।' }],
        answer: 0,
        why: { en: 'The string snapped, so the kite could fly away.', hi: 'डोर टूट गई, इसलिए पतंग उड़ सकती थी।' },
      },
    },
    model: { enSyl, hiSyl, sylCount, rhymeKey, motifsFor },
    mount(root, config, api) { return reader(root, config, api); },
  });
})();
