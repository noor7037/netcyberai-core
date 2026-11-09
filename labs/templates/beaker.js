// Template: Beaker bench. Pour, mix, heat and test in a beaker: gases, heat, colour changes, precipitates, metal
// displacement, indicators and pH, thermal decomposition, water of crystallisation, electrolysis and gas tests.
// The chemistry is computed, not scripted: substances carry their real ions and formulas; reactions follow the
// school rules (reactivity series, solubility table, acid + base, acid + carbonate, acid + metal); equations are
// balanced by an atom counter; pH comes from a charge balance with real acid constants. A lab can only choose among
// the substances listed here, so it can never show an impossible result. Config:
//   { items: [substance ids, 1–6, shown on the bench], start?: [ids already in the beaker, ≤4],
//     tools?: ['lamp' | 'ph' | 'electrolysis' | 'limewater' | 'splint'] }
(function () {
  const L = window.NCA_LIB;
  const { esc, eqHTML, lerp, ease, mixHex, hex } = L;
  const reduced = L.reducedMotion;
  const tween = L.tween;
  const T2 = (en, hi) => ({ en, hi });
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const WATER = '#EAF3FB';
  // Subscripts in SVG text as dy-shifted tspans (baseline-shift renders unevenly across browsers).
  const COND = { heat: 'ऊष्मा', electricity: 'विद्युत', sunlight: 'सूर्य-प्रकाश', MnO2: 'MnO2', 'alk.KMnO4,heat': 'क्षारीय-KMnO4,ऊष्मा' };
  const eqLang = (eq, lang) => (lang === 'hi' ? eq.replace(/-\[([^\]]+)\]->/g, (m, c) => `-[${COND[c] || c}]->`) : eq);
  const fsub = (f) => esc(f).replace(/([A-Za-z\)])(\d+)/g, '$1<tspan dy="4" font-size="72%">$2</tspan><tspan dy="-4">\u200B</tspan>');

  // ---------------------------------------------------------------- ions (NCERT reactivity series ranks: K Na Ca Mg Al Zn Fe Pb H Cu Ag)
  const CAT = {
    H: { z: 1, f: 'H', rank: 8, n: T2('hydrogen', 'हाइड्रोजन'), m: T2('hydrogen', 'हाइड्रोजन') },
    K: { z: 1, f: 'K', strong: 1, rank: 0, n: T2('potassium', 'पोटैशियम'), m: T2('potassium', 'पोटैशियम') },
    Ba: { z: 2, f: 'Ba', strong: 1, rank: 0.5, n: T2('barium', 'बेरियम'), m: T2('barium', 'बेरियम') },
    Na: { z: 1, f: 'Na', strong: 1, rank: 1, n: T2('sodium', 'सोडियम'), m: T2('sodium', 'सोडियम') },
    Ca: { z: 2, f: 'Ca', strong: 1, rank: 2, n: T2('calcium', 'कैल्शियम'), m: T2('calcium', 'कैल्शियम') },
    NH4: { z: 1, f: 'NH4', poly: 1, ka: 5.6e-10, n: T2('ammonium', 'अमोनियम') },
    Mg: { z: 2, f: 'Mg', ka: 4e-12, rank: 3, n: T2('magnesium', 'मैग्नीशियम'), m: T2('magnesium', 'मैग्नीशियम'), dep: '#AEB5BF' },
    Al: { z: 3, f: 'Al', ka: 1e-5, rank: 4, n: T2('aluminium', 'ऐलुमिनियम'), m: T2('aluminium', 'ऐलुमिनियम'), dep: '#BCC4CF' },
    Zn: { z: 2, f: 'Zn', ka: 1e-9, rank: 5, n: T2('zinc', 'ज़िंक'), m: T2('zinc', 'जस्ता'), dep: '#7F8A99' },
    Fe: { z: 2, f: 'Fe', ka: 3.2e-10, rank: 6, n: T2('iron', 'आयरन'), m: T2('iron', 'लोहा'), dep: '#3F444B', col: '#B9DDA8' },
    Pb: { z: 2, f: 'Pb', ka: 2e-8, rank: 7, n: T2('lead', 'लेड'), m: T2('lead', 'सीसा'), dep: '#59616B', toxic: 1 },
    Cu: { z: 2, f: 'Cu', ka: 3.2e-8, rank: 9, n: T2('copper', 'कॉपर'), m: T2('copper', 'ताँबा'), dep: '#A4532B', col: '#2F7FD8' },
    Ag: { z: 1, f: 'Ag', ka: 1e-12, rank: 10, n: T2('silver', 'सिल्वर'), m: T2('silver', 'चाँदी'), dep: '#D3D8DF' },
  };
  const ANI = {
    Cl: { z: 1, f: 'Cl', strong: 1, n: T2('chloride', 'क्लोराइड') },
    I: { z: 1, f: 'I', strong: 1, n: T2('iodide', 'आयोडाइड') },
    NO3: { z: 1, f: 'NO3', poly: 1, strong: 1, n: T2('nitrate', 'नाइट्रेट') },
    SO4: { z: 2, f: 'SO4', poly: 1, kas: [1e3, 1.2e-2], n: T2('sulphate', 'सल्फेट') },
    OH: { z: 1, f: 'OH', poly: 1, n: T2('hydroxide', 'हाइड्रॉक्साइड') },
    CO3: { z: 2, f: 'CO3', poly: 1, kas: [4.5e-7, 4.7e-11], n: T2('carbonate', 'कार्बोनेट') },
    HCO3: { z: 1, f: 'HCO3', poly: 1, kas: [4.5e-7, 4.7e-11], n: T2('hydrogencarbonate', 'हाइड्रोजन कार्बोनेट') },
    CH3COO: { z: 1, f: 'CH3COO', poly: 1, kas: [1.75e-5], weak: 1, n: T2('ethanoate', 'एथेनोएट') },
    Cit: { z: 3, f: 'C6H5O7', poly: 1, kas: [7.4e-4, 1.7e-5, 4.0e-7], weak: 1, n: T2('citrate', 'साइट्रेट') },
  };
  const ACIDNAME = {
    Cl: T2('hydrochloric acid', 'हाइड्रोक्लोरिक अम्ल'), SO4: T2('sulphuric acid', 'सल्फ़्यूरिक अम्ल'), NO3: T2('nitric acid', 'नाइट्रिक अम्ल'),
    CH3COO: T2('ethanoic acid', 'एथेनॉइक अम्ल'), Cit: T2('citric acid', 'साइट्रिक अम्ल'), I: T2('hydroiodic acid', 'हाइड्रोआयोडिक अम्ल'),
  };
  const SPECIALF = { 'H|OH': 'H2O', 'H|CH3COO': 'CH3COOH', 'H|Cit': 'C6H8O7', 'H|CO3': 'H2CO3', 'H|HCO3': 'H2CO3', 'NH4|OH': 'NH4OH', 'Na|CH3COO': 'CH3COONa', 'K|CH3COO': 'CH3COOK', 'NH4|CH3COO': 'CH3COONH4' };
  function saltF(c, a) {
    const k = c + '|' + a;
    if (SPECIALF[k]) return SPECIALF[k];
    const C = CAT[c], A = ANI[a], g = gcd(C.z, A.z), nc = A.z / g, na = C.z / g;
    const part = (f, n, poly) => (n === 1 ? f : poly ? `(${f})${n}` : f + n);
    if (a === 'CH3COO') return `(CH3COO)${na}${part(C.f, nc, C.poly)}`;
    return part(C.f, nc, C.poly) + part(A.f, na, A.poly);
  }
  const counts = (c, a) => { const g = gcd(CAT[c].z, ANI[a].z); return [ANI[a].z / g, CAT[c].z / g]; };
  function saltName(c, a) {
    if (c === 'H') return ACIDNAME[a] || T2('acid', 'अम्ल');
    return { en: cap(CAT[c].n.en + ' ' + ANI[a].n.en), hi: CAT[c].n.hi + ' ' + ANI[a].n.hi };
  }
  const solName = (c, a) => { const n = saltName(c, a); return c === 'H' ? { en: 'Dilute ' + n.en, hi: 'तनु ' + n.hi } : { en: n.en + ' solution', hi: n.hi + ' विलयन' }; };
  function ionColour(c, a) {
    if (c === 'Cu') return a === 'Cl' ? '#2FA393' : a === 'NO3' ? '#3F86D6' : '#2F7FD8';
    if (c === 'Fe') return '#B9DDA8';
    return null;
  }
  // Solubility rules (school level): the pairs that form a precipitate, its colour, and the colour word.
  const WH = '#F5F6F7';
  const INSOL = {
    'Ag|Cl': [WH, 'white'], 'Ag|I': ['#EFE3A0', 'paleyellow'], 'Pb|I': ['#F2B705', 'yellow'], 'Pb|Cl': [WH, 'white'], 'Pb|SO4': [WH, 'white'],
    'Ba|SO4': [WH, 'white'], 'Ba|CO3': [WH, 'white'], 'Ca|CO3': [WH, 'white'], 'Ag|CO3': ['#F1EBC8', 'paleyellow'], 'Zn|CO3': [WH, 'white'],
    'Mg|CO3': [WH, 'white'], 'Pb|CO3': [WH, 'white'], 'Cu|CO3': ['#5FB3A0', 'bluegreen'], 'Fe|CO3': ['#D5E2C0', 'palegreen'],
    'Cu|OH': ['#58A6E8', 'blue'], 'Fe|OH': ['#6E8B4E', 'dirtygreen'], 'Zn|OH': [WH, 'white'], 'Al|OH': [WH, 'white'], 'Mg|OH': [WH, 'white'],
    'Pb|OH': [WH, 'white'], 'Ag|OH': ['#6B4A2E', 'brown', 'Ag2O', T2('silver oxide', 'सिल्वर ऑक्साइड'), 'waterOut'],
    'Al|CO3': [WH, 'white', 'Al(OH)3', T2('aluminium hydroxide', 'ऐलुमिनियम हाइड्रॉक्साइड'), 'waterIn'],
  };
  const COLW = {
    white: T2('white', 'सफ़ेद'), paleyellow: T2('pale yellow', 'हल्का पीला'), yellow: T2('yellow', 'पीला'), bluegreen: T2('blue-green', 'नीला-हरा'),
    palegreen: T2('pale green', 'हल्का हरा'), blue: T2('blue', 'नीला'), dirtygreen: T2('dirty green', 'मटमैला हरा'), brown: T2('brown', 'भूरा'),
    red: T2('red', 'लाल'), pink: T2('pink', 'गुलाबी'), colourless: T2('colourless', 'रंगहीन'), orange: T2('orange', 'नारंगी'), green: T2('green', 'हरा'),
    reddishbrown: T2('reddish-brown', 'लाल-भूरा'), magenta: T2('dark pink (magenta)', 'गहरा गुलाबी (मैजेंटा)'), violet: T2('violet', 'बैंगनी'),
    darkblue: T2('dark blue', 'गहरा नीला'), purple: T2('light purple', 'हल्का बैंगनी'), yellowgreen: T2('yellow-green', 'पीला-हरा'), bluegreen2: T2('blue-green', 'नीला-हरा'),
  };
  const GAS = {
    H2: T2('hydrogen', 'हाइड्रोजन'), O2: T2('oxygen', 'ऑक्सीजन'), CO2: T2('carbon dioxide', 'कार्बन डाइऑक्साइड'), SO2: T2('sulphur dioxide', 'सल्फ़र डाइऑक्साइड'),
    NO2: T2('nitrogen dioxide', 'नाइट्रोजन डाइऑक्साइड'), Cl2: T2('chlorine', 'क्लोरीन'), H2S: T2('hydrogen sulphide', 'हाइड्रोजन सल्फ़ाइड'), NH3: T2('ammonia', 'अमोनिया'),
  };

  // ---------------------------------------------------------------- formula parsing and equation balancing
  function parseF(str) {
    const total = {};
    for (let part of String(str).replace(/[\[\]]/g, '').split('·')) {
      let mult = 1;
      const m = part.match(/^(\d+)(.+)$/);
      if (m) { mult = +m[1]; part = m[2]; }
      let i = 0;
      const num = () => { const x = part.slice(i).match(/^\d+/); if (x) { i += x[0].length; return +x[0]; } return 1; };
      const grp = () => {
        const c = {};
        while (i < part.length) {
          const ch = part[i];
          if (ch === '(') { i++; const inner = grp(); i++; const k = num(); for (const e in inner) c[e] = (c[e] || 0) + inner[e] * k; }
          else if (ch === ')') return c;
          else { const x = part.slice(i).match(/^[A-Z][a-z]?/); if (!x) { i++; continue; } i += x[0].length; const k = num(); c[x[0]] = (c[x[0]] || 0) + k; }
        }
        return c;
      };
      const g = grp();
      for (const e in g) total[e] = (total[e] || 0) + g[e] * mult;
    }
    return total;
  }
  const balCache = {};
  // Smallest whole-number coefficients that conserve every element (brute force, ≤ 6 species).
  function balance(R, P) {
    const key = R.join('+') + '>' + P.join('+');
    if (balCache[key]) return balCache[key];
    const sp = R.map(parseF).concat(P.map(parseF));
    const els = [...new Set(sp.flatMap((x) => Object.keys(x)))];
    const n = sp.length, max = n >= 6 ? 6 : 8;
    const co = new Array(n).fill(1);
    let best = null, bestSum = Infinity;
    for (;;) {
      const s = co.reduce((a, b) => a + b, 0);
      if (s < bestSum && els.every((e) => { let d = 0; for (let k = 0; k < n; k++) d += (k < R.length ? 1 : -1) * co[k] * (sp[k][e] || 0); return d === 0; })) { best = co.slice(); bestSum = s; }
      let k = 0;
      while (k < n && co[k] === max) { co[k] = 1; k++; }
      if (k === n) break;
      co[k]++;
    }
    balCache[key] = best;
    return best;
  }
  // species: [formula, state, mark]; mark '^' gas, 'v' precipitate
  function eqLine(R, P, cond) {
    const co = balance(R.map((x) => x[0]), P.map((x) => x[0]));
    if (!co) return null;
    const f = (x, k) => `${co[k] > 1 ? co[k] : ''}${x[0]}(${x[1]})${x[2] || ''}`;
    return { eq: R.map(f).join(' + ') + (cond ? ` -[${cond}]-> ` : ' -> ') + P.map((x, k) => f(x, k + R.length)).join(' + '), co };
  }

  // ---------------------------------------------------------------- substances
  const Lq = (colour, formula, en, hi, x) => Object.assign({ kind: 'liquid', colour, formula, name: T2(en, hi) }, x || {});
  const Sd = (look, colour, formula, en, hi, x) => Object.assign({ kind: 'solid', look, colour, formula, name: T2(en, hi) }, x || {});
  const SUB = {
    // the original bench (ids kept)
    zinc: Sd('granules', '#9AA6B8', 'Zn', 'Zinc granules', 'जस्ते के दाने', { metal: 'Zn' }),
    hcl: Lq('#E4EFFA', 'HCl', 'Dilute hydrochloric acid', 'तनु हाइड्रोक्लोरिक अम्ल', { ion: ['H', 'Cl'], C: 0.1 }),
    pbno3: Lq('#EEF2F8', 'Pb(NO3)2', 'Lead nitrate solution', 'लेड नाइट्रेट विलयन', { ion: ['Pb', 'NO3'], C: 0.1 }),
    ki: Lq('#F1F4F9', 'KI', 'Potassium iodide solution', 'पोटैशियम आयोडाइड विलयन', { ion: ['K', 'I'], C: 0.1 }),
    cuso4: Lq('#3F8FE0', 'CuSO4', 'Copper sulphate solution', 'कॉपर सल्फेट विलयन', { ion: ['Cu', 'SO4'], C: 0.1 }),
    feso4: Lq('#C9E4BD', 'FeSO4', 'Iron sulphate solution', 'आयरन सल्फेट विलयन', { ion: ['Fe', 'SO4'], C: 0.1 }),
    nail: Sd('nail', '#8E99AA', 'Fe', 'Iron nail', 'लोहे की कील', { metal: 'Fe' }),
    copperwire: Sd('wire', '#C8742F', 'Cu', 'Copper wire', 'ताँबे का तार', { metal: 'Cu' }),
    cao: Sd('lumps', '#F6F7F9', 'CaO', 'Quicklime', 'बिना बुझा चूना', { oxide: 'Ca', amt: 0.5 }),
    water: Lq('#D9ECFB', 'H2O', 'Water', 'पानी', { cond: 0 }),
    soda: Sd('powder', '#FBFBFB', 'NaHCO3', 'Baking soda', 'खाने का सोडा', { ion: ['Na', 'HCO3'], amt: 0.05, sol: 1 }),
    vinegar: Lq('#F4ECD6', 'CH3COOH', 'Vinegar', 'सिरका', { ion: ['H', 'CH3COO'], C: 0.8 }),
    naoh: Lq('#EDF3F8', 'NaOH', 'Sodium hydroxide solution', 'सोडियम हाइड्रॉक्साइड विलयन', { ion: ['Na', 'OH'], C: 0.1 }),
    bluelitmus: Lq('#3F63D6', 'litmus', 'Blue litmus solution', 'नीला लिटमस विलयन', { ind: 'litB' }),
    redlitmus: Lq('#D8433A', 'litmus', 'Red litmus solution', 'लाल लिटमस विलयन', { ind: 'litR' }),
    phenol: Lq('#F4F4F6', 'phenolphthalein', 'Phenolphthalein', 'फ़िनॉल्फ़्थेलिन', { ind: 'php', label: 'Phph' }),
    // metals and other solids
    mg: Sd('ribbon', '#C9CED6', 'Mg', 'Magnesium ribbon', 'मैग्नीशियम रिबन', { metal: 'Mg' }),
    al: Sd('foil', '#C3CAD4', 'Al', 'Aluminium foil', 'ऐलुमिनियम पन्नी', { metal: 'Al' }),
    ironfil: Sd('filings', '#5B6270', 'Fe', 'Iron filings', 'लोहे का बुरादा', { metal: 'Fe' }),
    chalk: Sd('lumps', '#F7F7F2', 'CaCO3', 'Chalk (calcium carbonate)', 'चॉक (कैल्शियम कार्बोनेट)', { ion: ['Ca', 'CO3'], amt: 0.02 }),
    cuso4c: Sd('crystals', '#2F7FD8', 'CuSO4·5H2O', 'Copper sulphate crystals', 'कॉपर सल्फेट के क्रिस्टल', { ion: ['Cu', 'SO4'], amt: 0.05, sol: 1 }),
    feso4c: Sd('crystals', '#9CCB8A', 'FeSO4·7H2O', 'Ferrous sulphate crystals', 'फ़ेरस सल्फेट के क्रिस्टल', { ion: ['Fe', 'SO4'], amt: 0.05, sol: 1 }),
    pbno3s: Sd('powder', '#FAFAFA', 'Pb(NO3)2', 'Lead nitrate powder', 'लेड नाइट्रेट पाउडर', { ion: ['Pb', 'NO3'], amt: 0.03, sol: 1 }),
    cuo: Sd('powder', '#24201F', 'CuO', 'Copper oxide', 'कॉपर ऑक्साइड', { oxide: 'Cu', amt: 0.02 }),
    mgo: Sd('powder', '#F7F7F7', 'MgO', 'Magnesium oxide', 'मैग्नीशियम ऑक्साइड', { oxide: 'Mg', amt: 0.02 }),
    sulphur: Sd('powder', '#F3D23B', 'S', 'Sulphur powder', 'गंधक का चूर्ण'),
    nh4cl: Sd('powder', '#FBFBFB', 'NH4Cl', 'Ammonium chloride', 'अमोनियम क्लोराइड', { ion: ['NH4', 'Cl'], amt: 0.1, sol: 1, endo: 1 }),
    camphor: Sd('tablets', '#FAFAF7', 'C10H16O', 'Camphor', 'कपूर', { floats: 1 }),
    ice: Sd('cubes', '#DDF0FF', 'H2O', 'Ice cubes', 'बर्फ़ के टुकड़े', { floats: 1, label: 'ice' }),
    salt: Sd('powder', '#FFFFFF', 'NaCl', 'Common salt', 'साधारण नमक', { ion: ['Na', 'Cl'], amt: 0.1, sol: 1 }),
    sugar: Sd('crystals', '#FFFFFF', 'C12H22O11', 'Sugar', 'चीनी', { sol: 1 }),
    sand: Sd('powder', '#D9B77E', 'SiO2', 'Sand', 'रेत'),
    potato: Sd('slice', '#F1E2B0', 'potato', 'Potato slice', 'आलू का टुकड़ा', { starch: 1, catalase: 1, label: 'potato' }),
    wax: Sd('block', '#F7F1DE', 'wax', 'Candle wax', 'मोमबत्ती का मोम', { floats: 1, label: 'wax' }),
    mno2: Sd('powder', '#2B2B2E', 'MnO2', 'Manganese dioxide', 'मैंगनीज़ डाइऑक्साइड', { catalyst: 1 }),
    agcl: Sd('powder', '#F2F2F2', 'AgCl', 'Silver chloride', 'सिल्वर क्लोराइड', { ion: ['Ag', 'Cl'], amt: 0.01 }),
    // liquids
    h2so4: Lq('#E6EEF8', 'H2SO4', 'Dilute sulphuric acid', 'तनु सल्फ़्यूरिक अम्ल', { ion: ['H', 'SO4'], C: 0.05 }),
    lemon: Lq('#F7EFA6', 'C6H8O7', 'Lemon juice', 'नींबू का रस', { ion: ['H', 'Cit'], C: 0.1, label: 'lemon' }),
    ethanoic: Lq('#F2F0EA', 'CH3COOH', 'Dilute ethanoic acid', 'तनु एथेनॉइक अम्ल', { ion: ['H', 'CH3COO'], C: 0.1 }),
    limewater: Lq('#F3F6F8', 'Ca(OH)2', 'Lime water', 'चूने का पानी', { ion: ['Ca', 'OH'], C: 0.02 }),
    ammonia: Lq('#F1F5F9', 'NH4OH', 'Ammonium hydroxide solution', 'अमोनियम हाइड्रॉक्साइड विलयन', { ion: ['NH4', 'OH'], C: 0.1 }),
    na2co3: Lq('#F1F5F9', 'Na2CO3', 'Sodium carbonate solution', 'सोडियम कार्बोनेट विलयन', { ion: ['Na', 'CO3'], C: 0.05 }),
    soapsol: Lq('#EEF0F3', 'soap', 'Soap solution', 'साबुन का घोल', { ab: { cat: 1e-4 }, cond: 1, label: 'soap', opaque: 0.35 }),
    saltsol: Lq('#EEF4FA', 'NaCl', 'Salt solution', 'नमक का घोल', { ion: ['Na', 'Cl'], C: 0.1 }),
    sugarsol: Lq('#F6F3EC', 'C12H22O11', 'Sugar solution', 'चीनी का घोल', { cond: 0, solute: 'sugar' }),
    tapwater: Lq('#DCEEFB', 'H2O', 'Tap water', 'नल का पानी', { ab: { cat: 3e-7 }, cond: 1, label: 'tap' }),
    milk: Lq('#FBFAF4', 'milk', 'Milk', 'दूध', { ab: { cat: 0.01, sys: [[0.02, [2.5e-7], 0]] }, cond: 1, protein: 1, label: 'milk', opaque: 0.9 }),
    eggwhite: Lq('#F3EFD8', 'albumin', 'Egg white', 'अंडे की सफ़ेदी', { ab: { cat: 1e-6 }, protein: 1, label: 'egg', opaque: 0.2 }),
    starchsol: Lq('#F2F2EE', 'starch', 'Starch solution', 'मंड (स्टार्च) का घोल', { starch: 1, label: 'starch', opaque: 0.25 }),
    iodine: Lq('#B8732C', 'I2', 'Iodine solution', 'आयोडीन का घोल', { cond: 1, iodine: 1 }),
    alcohol: Lq('#F5F8FC', 'C2H5OH', 'Ethanol (alcohol)', 'एथेनॉल (ऐल्कोहॉल)', { cond: 0, organic: 1 }),
    kmno4: Lq('#7B2D8E', 'KMnO4', 'Alkaline potassium permanganate', 'क्षारीय पोटैशियम परमैंगनेट', { ab: { cat: 0.1, sys: [[0.05, [4.5e-7, 4.7e-11], 0]] }, cond: 2 }),
    agno3: Lq('#F2F4F8', 'AgNO3', 'Silver nitrate solution', 'सिल्वर नाइट्रेट विलयन', { ion: ['Ag', 'NO3'], C: 0.1 }),
    bacl2: Lq('#F2F4F8', 'BaCl2', 'Barium chloride solution', 'बेरियम क्लोराइड विलयन', { ion: ['Ba', 'Cl'], C: 0.1 }),
    na2so4: Lq('#F2F5F9', 'Na2SO4', 'Sodium sulphate solution', 'सोडियम सल्फेट विलयन', { ion: ['Na', 'SO4'], C: 0.1 }),
    znso4: Lq('#F1F4F8', 'ZnSO4', 'Zinc sulphate solution', 'ज़िंक सल्फेट विलयन', { ion: ['Zn', 'SO4'], C: 0.1 }),
    al2so4: Lq('#F1F4F8', 'Al2(SO4)3', 'Aluminium sulphate solution', 'ऐलुमिनियम सल्फेट विलयन', { ion: ['Al', 'SO4'], C: 0.05 }),
    h2o2: Lq('#EEF6FB', 'H2O2', 'Hydrogen peroxide', 'हाइड्रोजन पेरॉक्साइड', { ab: { sys: [[0.9, [2.4e-12], 0]] }, cond: 0, peroxide: 1 }),
    oil: Lq('#F2C94C', 'oil', 'Cooking oil', 'खाने का तेल', { oil: 1, cond: 0, label: 'oil' }),
    universal: Lq('#43A047', 'UI', 'Universal indicator', 'सार्वत्रिक सूचक', { ind: 'uni' }),
    methylorange: Lq('#F28C28', 'MO', 'Methyl orange', 'मेथिल ऑरेंज', { ind: 'mo' }),
    turmeric: Lq('#F2C12E', 'turmeric', 'Turmeric solution', 'हल्दी का घोल', { ind: 'tur', label: 'haldi' }),
    chinarose: Lq('#B5739D', 'hibiscus', 'China rose solution', 'गुड़हल का घोल', { ind: 'cr', label: 'rose' }),
    // made only in reactions (a lab cannot put these on the bench)
    cuso4anh: Sd('powder', '#F1F1EC', 'CuSO4', 'Anhydrous copper sulphate (white)', 'निर्जल कॉपर सल्फेट (सफ़ेद)', { ion: ['Cu', 'SO4'], amt: 0.05, prod: 1 }),
    fe2o3: Sd('powder', '#8B3A1E', 'Fe2O3', 'Iron(III) oxide', 'आयरन (III) ऑक्साइड', { prod: 1 }),
    pbo: Sd('powder', '#E9C46A', 'PbO', 'Lead oxide', 'लेड ऑक्साइड', { prod: 1 }),
    na2co3s: Sd('powder', '#FFFFFF', 'Na2CO3', 'Sodium carbonate', 'सोडियम कार्बोनेट', { ion: ['Na', 'CO3'], amt: 0.025, sol: 1, prod: 1 }),
    fes: Sd('powder', '#2A2A2A', 'FeS', 'Iron sulphide', 'आयरन सल्फ़ाइड', { sulfide: 'Fe', amt: 0.05, prod: 1 }),
    carbon: Sd('powder', '#151515', 'C', 'Carbon (charred sugar)', 'कार्बन (जली चीनी)', { prod: 1 }),
  };
  const TOOLS = ['lamp', 'ph', 'electrolysis', 'limewater', 'splint'];

  // ---------------------------------------------------------------- pH from a charge balance
  const KW = 1e-14;
  const liquidVol = (M) => M.entries.reduce((v, e) => v + (e.state === 'liq' && !e.s.oil ? e.vol : 0), 0) + M.water;
  function sysCharge(C, K, z0, h) {
    let t = 1, S = 1, q = z0;
    for (let j = 0; j < K.length; j++) { t = (t * K[j]) / h; S += t; q += t * (z0 - j - 1); }
    return (C * q) / S;
  }
  function phOf(M) {
    const V = liquidVol(M);
    if (V <= 0) return null;
    let cat = 0, an = 0;
    const sys = [];
    for (const e of M.entries) {
      if (e.state === 'solid' || e.n <= 0) continue;
      const u = e.n / V;
      if (e.s.ab) { const a = e.s.ab; cat += (a.cat || 0) * u; an += (a.an || 0) * u; (a.sys || []).forEach(([C, K, z]) => sys.push([C * u, K, z])); }
      if (e.s.ion) {
        const [c, a] = e.s.ion, C = CAT[c], A = ANI[a], [nc, na] = counts(c, a);
        if (C.strong) cat += C.z * nc * u; else if (C.ka) sys.push([nc * u, [C.ka], C.z]);
        if (A.strong) an += A.z * na * u; else if (A.kas) sys.push([na * u, A.kas, 0]);
      }
    }
    const f = (p) => { const h = Math.pow(10, -p); let q = h - KW / h + cat - an; for (const [C, K, z] of sys) q += sysCharge(C, K, z, h); return q; };
    let lo = -1, hi = 15;
    for (let i = 0; i < 70; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
    return clamp((lo + hi) / 2, 0, 14);
  }
  // ---------------------------------------------------------------- indicators: colour and colour word for a pH
  const UNI = ['#C62828', '#E53935', '#F4511E', '#FB8C00', '#FFB300', '#FDD835', '#C0CA33', '#43A047', '#00897B', '#039BE5', '#1E88E5', '#3949AB', '#5E35B1', '#6A1B9A', '#4A148C'];
  const UNIW = ['red', 'red', 'red', 'orange', 'orange', 'yellow', 'yellowgreen', 'green', 'bluegreen2', 'blue', 'blue', 'darkblue', 'darkblue', 'violet', 'violet'];
  const IND = {
    litB: (p) => (p < 4.5 ? ['#D8433A', 'red'] : ['#3F63D6', 'blue']),
    litR: (p) => (p > 8.3 ? ['#3F63D6', 'blue'] : ['#D8433A', 'red']),
    php: (p) => (p >= 8.2 ? ['#E24FA4', 'pink'] : ['#F4F4F6', 'colourless']),
    mo: (p) => (p < 3.1 ? ['#D7263D', 'red'] : p < 4.4 ? ['#F28C28', 'orange'] : ['#F6C915', 'yellow']),
    uni: (p) => { const i = clamp(Math.round(p), 0, 14); return [UNI[i], UNIW[i]]; },
    tur: (p) => (p >= 8 ? ['#A0401C', 'reddishbrown'] : ['#F2C12E', 'yellow']),
    cr: (p) => (p < 6 ? ['#C2185B', 'magenta'] : p > 8 ? ['#2E7D32', 'green'] : ['#B5739D', 'purple']),
  };
  const phWord = (p) => (p < 3 ? T2('strongly acidic', 'प्रबल अम्लीय') : p < 6.5 ? T2('weakly acidic', 'दुर्बल अम्लीय') : p <= 7.5 ? T2('neutral', 'उदासीन') : p <= 11 ? T2('weakly basic', 'दुर्बल क्षारीय') : T2('strongly basic', 'प्रबल क्षारीय'));
  const kindWord = (p) => (p < 6.5 ? T2('an acid', 'अम्लीय') : p > 7.5 ? T2('a base', 'क्षारीय') : T2('neutral', 'उदासीन'));

  // ---------------------------------------------------------------- the bench model (pure; no DOM)
  let uid = 0;
  function newModel() {
    return { entries: [], water: 0, ppt: [], tint: null, cloud: null, gas: null, rate: 0, temp: 0, tempNote: null, steam: 0, fume: null, boiled: 0, crust: [], subl: null, drops: 0, elec: null, done: new Set(), added: [], noted: new Set(), indCol: null, light: null };
  }
  function mkEntry(id, s) {
    s = s || SUB[id];
    if (s.kind === 'liquid') return { k: ++uid, id, s, vol: 1, n: s.ion ? s.C : 1, state: 'liq' };
    return { k: ++uid, id, s, vol: 0, n: s.ion || s.oxide || s.sulfide ? s.amt || 0.05 : 1, state: 'solid' };
  }
  const saltDef = (c, a) => ({ kind: 'liquid', ion: [c, a], formula: saltF(c, a), name: solName(c, a), made: 1 });
  function addSol(M, c, a, n) {
    if (n <= 0) return;
    const e = M.entries.find((x) => x.state === 'sol' && x.s.made && x.s.ion[0] === c && x.s.ion[1] === a);
    if (e) e.n += n; else M.entries.push({ k: ++uid, id: null, s: saltDef(c, a), vol: 0, n, state: 'sol' });
  }
  function consume(M, e, amt) {
    e.n -= amt;
    if (e.n <= 1e-7) { if (e.state === 'liq') M.water += e.vol; M.entries.splice(M.entries.indexOf(e), 1); }
  }
  const dissolved = (M) => M.entries.filter((e) => (e.state === 'liq' || e.state === 'sol') && e.s.ion && e.n > 1e-7);
  const acids = (M) => dissolved(M).filter((e) => e.s.ion[0] === 'H');
  const bases = (M) => dissolved(M).filter((e) => e.s.ion[1] === 'OH');
  const solids = (M) => M.entries.filter((e) => e.state === 'solid');
  const has = (M, id) => M.entries.find((e) => e.id === id && (e.state !== 'solid' || SUB[id].kind === 'solid'));
  const fOf = (e) => (e.s.ion ? saltF(e.s.ion[0], e.s.ion[1]) : e.s.formula);
  const stOf = (e) => (e.state === 'solid' ? 's' : 'aq');
  const nameOf = (e) => (e.oxide ? T2('Copper wire with a black coat', 'काली परत वाला ताँबे का तार') : e.melted ? T2('Melted wax', 'पिघला मोम') : e.s.name);
  const noteKey = (...es) => es.map((e) => e.k).sort().join('+');
  const R = (obs, note, more) => Object.assign({ obs, note }, more || {});
  // Words a few rules share.
  const TEACHER = T2(' Only a teacher handles this in a school lab.', ' स्कूल लैब में इसे केवल शिक्षक करते हैं।');
  const DANGER = (c) => (c === 'Pb' ? T2(' Lead compounds are poisonous; only a teacher does this.', ' लेड के यौगिक ज़हरीले होते हैं; यह केवल शिक्षक करते हैं।') : c === 'Ba' ? T2(' Barium compounds are poisonous; only a teacher does this.', ' बेरियम के यौगिक ज़हरीले होते हैं; यह केवल शिक्षक करते हैं।') : null);
  const join = (a, b) => (b ? { en: a.en + b.en, hi: a.hi + b.hi } : a);
  // Texts kept from the reviewed first version (same reactions, same words).
  const OVERRIDE = {
    'hcl+zinc': { eq: 'Zn(s) + 2HCl(aq) -> ZnCl2(aq) + H2(g)^', note: T2('Bubbles of hydrogen gas form on the zinc, and the beaker gets warm.', 'जस्ते पर हाइड्रोजन गैस के बुलबुले बनते हैं और बीकर गर्म हो जाता है।') },
    'ki+pbno3': { eq: 'Pb(NO3)2(aq) + 2KI(aq) -> PbI2(s)v + 2KNO3(aq)', note: T2('A bright yellow solid, lead iodide, forms and settles: a precipitate. Lead compounds are poisonous; only a teacher does this in a school lab.', 'चमकीला पीला ठोस, लेड आयोडाइड, बनकर नीचे बैठ जाता है: यह अवक्षेप है। लेड के यौगिक ज़हरीले होते हैं; स्कूल लैब में यह केवल शिक्षक करते हैं।') },
    'cuso4+nail': { eq: 'Fe(s) + CuSO4(aq) -> FeSO4(aq) + Cu(s)', note: T2('The nail gets a reddish-brown coat of copper, and the blue colour fades to pale green iron sulphate.', 'कील पर ताँबे की लाल-भूरी परत चढ़ जाती है और नीला रंग हल्के हरे आयरन सल्फेट में बदल जाता है।') },
    'copperwire+feso4': { note: T2('Nothing happens. Copper is less reactive than iron, so it cannot push iron out of iron sulphate.', 'कुछ नहीं होता। ताँबा लोहे से कम अभिक्रियाशील है, इसलिए वह आयरन सल्फेट से लोहे को नहीं हटा सकता।') },
    'copperwire+cuso4': { note: T2('Nothing happens: copper cannot displace copper.', 'कुछ नहीं होता: ताँबा ताँबे को नहीं हटा सकता।') },
    'feso4+nail': { note: T2('Nothing visible happens: iron is already the metal in iron sulphate.', 'कुछ दिखाई नहीं देता: आयरन सल्फेट में धातु पहले से लोहा ही है।') },
    'cao+water': { eq: 'CaO(s) + H2O(l) -> Ca(OH)2(aq)', note: T2('It hisses and gets very hot: a lot of heat is given out. The milky liquid is slaked lime. Never try this at home.', 'सी-सी की आवाज़ होती है और मिश्रण बहुत गर्म हो जाता है: बहुत ऊष्मा निकलती है। यह दूधिया द्रव बुझा हुआ चूना है। इसे घर पर कभी मत करना।') },
    'soda+vinegar': { eq: 'NaHCO3(s) + CH3COOH(aq) -> CH3COONa(aq) + H2O(l) + CO2(g)^', note: T2('It fizzes strongly with carbon dioxide gas, and the beaker feels slightly cooler.', 'कार्बन डाइऑक्साइड गैस से तेज़ झाग बनता है और बीकर थोड़ा ठंडा लगता है।') },
    'hcl+naoh': { eq: 'NaOH(aq) + HCl(aq) -> NaCl(aq) + H2O(l)', note: T2('No colour change, but it warms a little: the acid and the base neutralise each other into salt and water.', 'रंग नहीं बदलता, पर मिश्रण थोड़ा गर्म होता है: अम्ल और क्षार एक-दूसरे को उदासीन करके नमक और पानी बनाते हैं।') },
  };
  function withOverride(r, a, b) {
    if (!a || !b || !a.id || !b.id) return r;
    const o = OVERRIDE[[a.id, b.id].sort().join('+')];
    if (o) { if (o.eq) r.eq = o.eq; r.note = o.note; }
    return r;
  }

  // One reaction step at room temperature (null when nothing more happens).
  function nextReaction(M) {
    const V = liquidVol(M);
    const A = acids(M);
    const sol = solids(M);
    const D = dissolved(M);
    const once = (key) => { if (M.done.has(key)) return false; M.done.add(key); return true; };
    const find = (pred) => M.entries.find(pred);
    // --- tests on food and special pairs
    const protein = find((e) => e.s.protein && e.state === 'liq' && !e.cooked);
    if (protein && !M.done.has('biuret')) {
      const cu = D.find((e) => e.s.ion[0] === 'Cu');
      const cuPpt = M.ppt.some((p) => p.key === 'Cu|OH');
      const oh = D.find((e) => e.s.ion[1] === 'OH' && CAT[e.s.ion[0]].strong);
      if ((cu || cuPpt) && (oh || cuPpt)) {
        M.done.add('biuret');
        if (cu) M.entries.splice(M.entries.indexOf(cu), 1);
        M.ppt = M.ppt.filter((p) => p.key !== 'Cu|OH');
        M.tint = { c: '#7E4FC0', a: 0.85 };
        return R(['colour'], T2(`It turns violet: ${protein.s.name.en.toLowerCase()} contains protein. (Copper sulphate and sodium hydroxide together are the protein test.)`, `यह बैंगनी हो जाता है: ${protein.s.name.hi} में प्रोटीन है। (कॉपर सल्फेट और सोडियम हाइड्रॉक्साइड मिलकर प्रोटीन की जाँच करते हैं।)`));
      }
    }
    const iod = find((e) => e.s.iodine && e.state === 'liq');
    const starch = find((e) => e.s.starch && e.state === 'liq');
    if (iod && starch && once('starch')) { M.tint = { c: '#1B1E4D', a: 0.92 }; return R(['colour'], T2('It turns blue-black at once: the liquid contains starch. Iodine is the test for starch.', 'यह तुरंत नीला-काला हो जाता है: द्रव में मंड (स्टार्च) है। आयोडीन मंड की जाँच है।')); }
    const potato = find((e) => e.id === 'potato');
    if (iod && potato && once('potato-iodine')) { potato.coat = '#1B1E4D'; return R(['colour'], T2('The potato slice turns blue-black where the iodine touches it: potato is rich in starch.', 'जहाँ आयोडीन लगता है, आलू का टुकड़ा नीला-काला हो जाता है: आलू में बहुत मंड (स्टार्च) होता है।')); }
    const per = find((e) => e.s.peroxide);
    if (per && potato && once('catalase')) { M.gas = { type: 'O2' }; return R(['gas'], T2('Tiny bubbles of oxygen form on the potato. An enzyme in the potato (catalase) breaks hydrogen peroxide into water and oxygen.', 'आलू पर ऑक्सीजन के छोटे बुलबुले बनते हैं। आलू का एक एंजाइम (कैटालेज़) हाइड्रोजन पेरॉक्साइड को पानी और ऑक्सीजन में तोड़ता है।'), { gas: 1.4, gasType: 'O2', foam: 0.4 }); }
    if (per && find((e) => e.s.catalyst) && once('mno2')) { M.gas = { type: 'O2' }; return R(['gas'], T2('It fizzes fast with oxygen gas. Manganese dioxide is a catalyst: it speeds up the breakdown of hydrogen peroxide and is not used up.', 'ऑक्सीजन गैस से तेज़ झाग बनता है। मैंगनीज़ डाइऑक्साइड उत्प्रेरक है: यह हाइड्रोजन पेरॉक्साइड के टूटने को तेज़ करता है और ख़ुद ख़र्च नहीं होता।'), { eq: '2H2O2(aq) -[MnO2]-> 2H2O(l) + O2(g)^', gas: 2.6, gasType: 'O2', foam: 0.8 }); }
    const milk = find((e) => e.id === 'milk' && !e.curdled);
    if (milk && A.length) { milk.curdled = true; M.ppt.push({ c: '#FFFDF2', key: 'curd' }); M.cloud = '#FFFDF4'; return R(['ppt'], T2('The milk curdles: white lumps of milk protein (casein) separate out. This is how paneer is made with lemon juice or vinegar.', 'दूध फट जाता है: दूध के प्रोटीन (केसीन) के सफ़ेद थक्के अलग हो जाते हैं। नींबू के रस या सिरके से पनीर ऐसे ही बनता है।')); }
    const agcl = sol.find((e) => e.id === 'agcl');
    const nh4oh = D.find((e) => e.s.ion[0] === 'NH4' && e.s.ion[1] === 'OH');
    if (agcl && nh4oh) { M.entries.splice(M.entries.indexOf(agcl), 1); return R(['dissolve'], T2('The white silver chloride dissolves in ammonia solution, forming a soluble complex.', 'सफ़ेद सिल्वर क्लोराइड अमोनिया के विलयन में घुल जाता है और एक घुलनशील संकुल बनता है।'), { eq: 'AgCl(s) + 2NH4OH(aq) -> [Ag(NH3)2]Cl(aq) + 2H2O(l)' }); }
    const naoh = D.find((e) => e.s.ion[1] === 'OH' && (e.s.ion[0] === 'Na' || e.s.ion[0] === 'K'));
    const alm = sol.find((e) => e.s.metal === 'Al' && !e.coat);
    if (naoh && alm && once('al-naoh' + alm.k)) { M.gas = { type: 'H2' }; return R(['gas', 'temp'], T2('Aluminium reacts with sodium hydroxide: hydrogen bubbles out and it gets warm. Aluminium is amphoteric: it reacts with acids and with bases.', 'ऐलुमिनियम सोडियम हाइड्रॉक्साइड से अभिक्रिया करता है: हाइड्रोजन के बुलबुले निकलते हैं और यह गर्म होता है। ऐलुमिनियम उभयधर्मी है: यह अम्ल और क्षार दोनों से अभिक्रिया करता है।'), { eq: '2Al(s) + 2NaOH(aq) + 2H2O(l) -> 2NaAlO2(aq) + 3H2(g)^', gas: 1.8, gasType: 'H2', temp: 0.8 }); }
    const znm = sol.find((e) => e.s.metal === 'Zn');
    if (naoh && znm && once('zn-naoh-cold' + znm.k)) return R(['gas'], T2('Only a few tiny bubbles at room temperature. Zinc reacts with sodium hydroxide faster when it is warmed.', 'कमरे के तापमान पर केवल कुछ छोटे बुलबुले। गर्म करने पर जस्ता सोडियम हाइड्रॉक्साइड से तेज़ी से अभिक्रिया करता है।'), { gas: 0.3, gasType: 'H2', key: 'zn-cold' });
    // --- solids with acids: metals, carbonates, oxides, sulphides
    for (const e of sol) {
      for (const a of A) {
        const an = a.s.ion[1];
        if (e.s.metal && !M.done.has('ma' + noteKey(e, a))) {
          M.done.add('ma' + noteKey(e, a));
          M.noted.add(e.k);
          const m = e.s.metal, C = CAT[m];
          if (C.rank > CAT.H.rank) return R([], T2(`Nothing happens. ${cap(C.m.en)} is less reactive than hydrogen, so it cannot take the place of hydrogen in the acid.`, `कुछ नहीं होता। ${C.m.hi} हाइड्रोजन से कम अभिक्रियाशील है, इसलिए वह अम्ल में हाइड्रोजन की जगह नहीं ले सकता।`), { none: true });
          const weak = ANI[an].weak;
          if (weak && m !== 'Mg' && m !== 'Zn') return R([], T2(`${cap(C.m.en)} reacts with this weak acid far too slowly to see.`, `${C.m.hi} इस दुर्बल अम्ल से इतनी धीमी अभिक्रिया करता है कि दिखाई नहीं देती।`), { none: true });
          if (an === 'NO3' || an === 'I') return R([], T2('Nothing to see here.', 'यहाँ कुछ दिखाई नहीं देता।'), { none: true });
          const L2 = eqLine([[m, 's'], [fOf(a), 'aq']], [[saltF(m, an), 'aq'], ['H2', 'g', '^']]);
          const xi = (0.2 * a.n) / L2.co[1];
          consume(M, a, xi * L2.co[1]);
          addSol(M, m, an, xi * L2.co[2]);
          M.gas = { type: 'H2' };
          const rate = weak ? (m === 'Mg' ? 1 : 0.4) : { Mg: 3, Al: 1.6, Zn: 1.6, Fe: 0.7 }[m];
          const extra = m === 'Al' ? T2(' Aluminium may start slowly: a thin oxide layer protects it at first.', ' ऐलुमिनियम धीरे शुरू हो सकता है: पहले उस पर ऑक्साइड की पतली परत होती है।') : m === 'Fe' ? T2(' Iron reacts slowly.', ' लोहा धीरे अभिक्रिया करता है।') : m === 'Mg' ? T2(' Magnesium reacts fast.', ' मैग्नीशियम तेज़ी से अभिक्रिया करता है।') : null;
          const r = R(weak || m === 'Fe' ? ['gas'] : ['gas', 'temp'], join(T2(`Bubbles of hydrogen gas form on the ${C.m.en}${weak || m === 'Fe' ? '' : ', and the beaker gets warm'}.`, `${C.m.hi} पर हाइड्रोजन गैस के बुलबुले बनते हैं${weak || m === 'Fe' ? '' : ' और बीकर गर्म हो जाता है'}।`), extra), { eq: L2.eq, gas: rate, gasType: 'H2', temp: weak || m === 'Fe' ? 0.2 : m === 'Mg' ? 1.3 : 0.9 });
          return withOverride(r, e, a);
        }
        const ec = e.s.ion && e.s.ion[1];
        if ((ec === 'CO3' || ec === 'HCO3') && an !== 'I') {
          M.noted.add(e.k);
          return carbonate(M, e, a);
        }
        const ox = e.s.oxide || (e.oxide ? 'Cu' : null);
        if (ox && an !== 'I') {
          M.noted.add(e.k);
          const oxF = ox + 'O';
          const L2 = eqLine([[oxF, 's'], [fOf(a), 'aq']], [[saltF(ox, an), 'aq'], ['H2O', 'l']]);
          const nOx = e.oxide ? 0.004 : e.n;
          const xi = Math.min(nOx / L2.co[0], a.n / L2.co[1]);
          consume(M, a, xi * L2.co[1]);
          if (e.oxide) { e.oxide = false; e.coat = null; } else if (xi * L2.co[0] >= e.n - 1e-9) M.entries.splice(M.entries.indexOf(e), 1); else e.n -= xi * L2.co[0];
          addSol(M, ox, an, xi * L2.co[2]);
          const word = { Cu: T2('The black copper oxide dissolves and the liquid turns blue-green: a copper salt and water form. A metal oxide reacts with an acid the way a base does.', 'काला कॉपर ऑक्साइड घुल जाता है और द्रव नीला-हरा हो जाता है: कॉपर का लवण और पानी बनते हैं। धातु का ऑक्साइड अम्ल से क्षार की तरह अभिक्रिया करता है।'), Mg: T2('The white magnesium oxide dissolves: a magnesium salt and water form. A metal oxide reacts with an acid like a base.', 'सफ़ेद मैग्नीशियम ऑक्साइड घुल जाता है: मैग्नीशियम का लवण और पानी बनते हैं। धातु का ऑक्साइड अम्ल से क्षार की तरह अभिक्रिया करता है।'), Ca: T2('Quicklime reacts with the acid and gets hot: a calcium salt and water form.', 'बिना बुझा चूना अम्ल से अभिक्रिया करके गर्म होता है: कैल्शियम का लवण और पानी बनते हैं।') }[ox];
          if (e.id === 'copperwire') return R(['colour'], T2('The black coat on the copper wire disappears and the acid turns faintly blue-green: copper oxide reacted with the acid, leaving shiny copper.', 'ताँबे के तार की काली परत ग़ायब हो जाती है और अम्ल हल्का नीला-हरा हो जाता है: कॉपर ऑक्साइड ने अम्ल से अभिक्रिया की और चमकदार ताँबा बचा।'), { eq: L2.eq });
          return R(ox === 'Ca' ? ['temp'] : ox === 'Mg' ? ['dissolve'] : ['colour'], word, { eq: L2.eq, temp: ox === 'Ca' ? 1.6 : 0.3 });
        }
        if (e.s.sulfide && !ANI[an].weak && an !== 'I') {
          M.noted.add(e.k);
          const m = e.s.sulfide;
          const L2 = eqLine([[m + 'S', 's'], [fOf(a), 'aq']], [[saltF(m, an), 'aq'], ['H2S', 'g', '^']]);
          const xi = Math.min(e.n / L2.co[0], a.n / L2.co[1]);
          consume(M, a, xi * L2.co[1]);
          e.n -= xi * L2.co[0]; if (e.n <= 1e-7) M.entries.splice(M.entries.indexOf(e), 1);
          addSol(M, m, an, xi * L2.co[2]);
          M.gas = { type: 'H2S' };
          return R(['gas', 'smell'], join(T2('Gas bubbles out with a smell of rotten eggs: hydrogen sulphide. This shows iron sulphide is a new compound: a plain mixture of iron and sulphur would give hydrogen instead.', 'सड़े अंडे जैसी गंध वाली गैस निकलती है: हाइड्रोजन सल्फ़ाइड। इससे पता चलता है कि आयरन सल्फ़ाइड एक नया यौगिक है: लोहे और गंधक का साधारण मिश्रण हाइड्रोजन देता।'), TEACHER), { eq: L2.eq, gas: 1.2, gasType: 'H2S' });
        }
      }
    }
    // --- metal in a salt solution: the reactivity series decides
    for (const e of sol) {
      if (!e.s.metal) continue;
      for (const s of D) {
        const [c, an] = s.s.ion;
        if (c === 'H' || an === 'OH' || CAT[c].rank == null || s.s.made && c === e.s.metal) continue;
        const key = 'dsp' + noteKey(e, s);
        if (M.done.has(key)) continue;
        M.done.add(key);
        M.noted.add(e.k);
        const m = e.s.metal, Cm = CAT[m], Cc = CAT[c];
        if (m === c) return withOverride(R([], T2(`Nothing visible happens: ${Cm.m.en} is already the metal in ${saltName(c, an).en.toLowerCase()}.`, `कुछ दिखाई नहीं देता: ${saltName(c, an).hi} में धातु पहले से ${Cm.m.hi} ही है।`), { none: true }), e, s);
        if (Cm.rank > Cc.rank) return withOverride(R([], T2(`Nothing happens. ${cap(Cm.m.en)} is less reactive than ${Cc.m.en}, so it cannot push ${Cc.m.en} out of ${saltName(c, an).en.toLowerCase()}.`, `कुछ नहीं होता। ${Cm.m.hi} ${Cc.m.hi} से कम अभिक्रियाशील है, इसलिए वह ${saltName(c, an).hi} से ${Cc.m.hi} को नहीं हटा सकता।`), { none: true }), e, s);
        const L2 = eqLine([[m, 's'], [fOf(s), 'aq']], [[saltF(m, an), 'aq'], [c, 's']]);
        const xi = s.n / L2.co[1];
        consume(M, s, s.n);
        addSol(M, m, an, xi * L2.co[2]);
        e.coat = Cc.dep;
        const slow = m === 'Al' ? T2(' (Aluminium may take a while to start because of its oxide layer.)', ' (ऑक्साइड की परत के कारण ऐलुमिनियम को शुरू होने में समय लग सकता है।)') : null;
        const before = ionColour(c, an), after = ionColour(m, an);
        const col = before && !after ? T2(` The ${COLW[c === 'Cu' ? 'blue' : 'palegreen'].en} colour fades.`, ` ${COLW[c === 'Cu' ? 'blue' : 'palegreen'].hi} रंग फीका पड़ जाता है।`) : !before && after ? T2(' The liquid turns ' + (m === 'Cu' ? 'blue' : 'pale green') + '.', ' द्रव ' + (m === 'Cu' ? 'नीला' : 'हल्का हरा') + ' हो जाता है।') : before && after ? T2(' The colour changes from blue to pale green.', ' रंग नीले से हल्का हरा हो जाता है।') : null;
        const r = R(before || after ? ['colour', 'coat'] : ['coat'], join(join(T2(`${cap(Cm.m.en)} is more reactive than ${Cc.m.en}, so it pushes ${Cc.m.en} out of the solution: a coat of ${Cc.m.en} forms on the ${Cm.m.en}.`, `${Cm.m.hi} ${Cc.m.hi} से अधिक अभिक्रियाशील है, इसलिए वह ${Cc.m.hi} को विलयन से बाहर कर देता है: ${Cm.m.hi} पर ${Cc.m.hi} की परत चढ़ जाती है।`), col), slow), { eq: L2.eq });
        return withOverride(r, e, s);
      }
    }
    // --- two dissolved substances: neutralisation, acid + carbonate, precipitates
    const both = (i, j) => [[D[i], D[j]], [D[j], D[i]]];
    for (let i = 0; i < D.length; i++) {
      for (let j = i + 1; j < D.length; j++) {
        for (const [a, b] of both(i, j)) {
          const [ca, aa] = a.s.ion, [cb, ab] = b.s.ion;
          if (ca === 'H' && ab === 'OH') {
            const insol = INSOL[cb + '|' + aa];
            const L2 = eqLine([[fOf(b), 'aq'], [fOf(a), 'aq']], [[saltF(cb, aa), insol ? 's' : 'aq', insol ? 'v' : ''], ['H2O', 'l']]);
            const xi = Math.min(a.n / L2.co[1], b.n / L2.co[0]);
            consume(M, a, xi * L2.co[1]); consume(M, b, xi * L2.co[0]);
            if (insol) M.ppt.push({ c: insol[0], key: cb + '|' + aa }); else addSol(M, cb, aa, xi * L2.co[2]);
            const sn = saltName(cb, aa);
            const r = R(['temp'], T2(`No fizz and no colour change, but it warms a little: the acid and the base neutralise each other, making ${sn.en.toLowerCase()} (a salt) and water.`, `न झाग, न रंग बदलता है, पर मिश्रण थोड़ा गर्म होता है: अम्ल और क्षार एक-दूसरे को उदासीन करके ${sn.hi} (एक लवण) और पानी बनाते हैं।`), { eq: L2.eq, temp: 0.5 });
            return withOverride(r, a, b);
          }
          if (ca === 'H' && (ab === 'CO3' || ab === 'HCO3') && aa !== 'I') return carbonate(M, b, a);
          if (ab === 'OH' && (cb === 'Ca' || cb === 'Ba') && aa === 'HCO3') {
            const L2 = eqLine([[fOf(b), 'aq'], [fOf(a), 'aq']], [[saltF(cb, 'CO3'), 's', 'v'], [saltF(ca, 'OH'), 'aq'], ['H2O', 'l']]);
            const xi = Math.min(a.n / L2.co[1], b.n / L2.co[0]);
            consume(M, a, xi * L2.co[1]); consume(M, b, xi * L2.co[0]);
            addSol(M, ca, 'OH', xi * L2.co[3]);
            M.ppt.push({ c: WH, key: cb + '|CO3' });
            return R(['ppt'], T2(`A white precipitate of ${saltName(cb, 'CO3').en.toLowerCase()} forms: the liquid turns milky.`, `${saltName(cb, 'CO3').hi} का सफ़ेद अवक्षेप बनता है: द्रव दूधिया हो जाता है।`), { eq: L2.eq, ppt: WH });
          }
        }
        for (const [a, b] of both(i, j)) {
          const [ca, aa] = a.s.ion, [cb, ab] = b.s.ion;
          const p = INSOL[ca + '|' + ab];
          if (!p || ca === 'H') continue;
          const otherInsol = INSOL[cb + '|' + aa];
          const water = cb === 'H' && aa === 'OH';
          const Rs = [[fOf(a), 'aq'], [fOf(b), 'aq']];
          const Ps = [[p[2] || saltF(ca, ab), 's', 'v']];
          if (!water) Ps.push([saltF(cb, aa), otherInsol ? 's' : 'aq', otherInsol ? 'v' : '']);
          if (p[4] === 'waterOut' || water) Ps.push(['H2O', 'l']);
          if (p[4] === 'waterIn') { Rs.push(['H2O', 'l']); Ps.push(['CO2', 'g', '^']); }
          const L2 = eqLine(Rs, Ps);
          if (!L2) continue;
          const xi = Math.min(a.n / L2.co[0], b.n / L2.co[1]);
          consume(M, a, xi * L2.co[0]); consume(M, b, xi * L2.co[1]);
          M.ppt.push({ c: p[0], key: ca + '|' + ab });
          if (!water) { if (otherInsol) M.ppt.push({ c: otherInsol[0], key: cb + '|' + aa }); else addSol(M, cb, aa, xi * L2.co[Rs.length + 1]); }
          const pn = p[3] || saltName(ca, ab);
          if (p[4] === 'waterIn') M.gas = { type: 'CO2' };
          const r = R(p[4] === 'waterIn' ? ['ppt', 'gas'] : ['ppt'], join(T2(`A ${COLW[p[1]].en} solid, ${pn.en.toLowerCase()}, forms and settles: a precipitate. The two compounds swapped partners (double displacement).`, `${COLW[p[1]].hi} ठोस, ${pn.hi}, बनकर नीचे बैठ जाता है: यह अवक्षेप है। दोनों यौगिकों ने अपने साथी बदल लिए (द्विविस्थापन)।`), DANGER(ca) || DANGER(cb)), { eq: L2.eq, ppt: p[0], gas: p[4] === 'waterIn' ? 1 : 0, gasType: p[4] === 'waterIn' ? 'CO2' : null });
          return withOverride(r, a, b);
        }
      }
    }
    // --- quicklime and magnesium oxide in water (when no acid is there)
    const cao = sol.find((e) => e.s.oxide === 'Ca');
    if (cao && V > 0) {
      const w = M.entries.find((e) => e.id === 'water');
      M.entries.splice(M.entries.indexOf(cao), 1);
      addSol(M, 'Ca', 'OH', Math.min(0.02 * V, cao.n));
      M.cloud = '#FFFFFF';
      return withOverride(R(['temp'], T2('It hisses and gets very hot: quicklime reacts with water and gives out a lot of heat. The milky liquid is slaked lime (calcium hydroxide). Never try this at home.', 'सी-सी की आवाज़ होती है और बहुत गर्म हो जाता है: बिना बुझा चूना पानी से अभिक्रिया करके बहुत ऊष्मा देता है। दूधिया द्रव बुझा हुआ चूना (कैल्शियम हाइड्रॉक्साइड) है। इसे घर पर कभी मत करना।'), { eq: 'CaO(s) + H2O(l) -> Ca(OH)2(aq)', temp: 2.6, steam: 1 }), cao, w);
    }
    const mgo = sol.find((e) => e.s.oxide === 'Mg');
    if (mgo && V > 0) {
      M.entries.splice(M.entries.indexOf(mgo), 1);
      addSol(M, 'Mg', 'OH', 1.5e-4 * V);
      M.cloud = '#F7F7F7';
      return R(['dissolve'], T2('Magnesium oxide dissolves a little, making magnesium hydroxide: a base. Test it: red litmus turns blue.', 'मैग्नीशियम ऑक्साइड थोड़ा घुलकर मैग्नीशियम हाइड्रॉक्साइड बनाता है: एक क्षार। जाँचो: लाल लिटमस नीला हो जाता है।'), { eq: 'MgO(s) + H2O(l) -> Mg(OH)2(aq)' });
    }
    const anh = sol.find((e) => e.id === 'cuso4anh');
    if (anh && V > 0) { anh.state = 'sol'; return R(['colour', 'temp'], T2('The white powder turns blue again and warms up: it takes back its water of crystallisation.', 'सफ़ेद पाउडर फिर से नीला हो जाता है और गर्म होता है: यह अपना क्रिस्टलन जल वापस ले लेता है।'), { eq: 'CuSO4(s) + 5H2O(l) -> CuSO4·5H2O(aq)', temp: 0.6 }); }
    // --- dissolving and other physical changes
    if (V > 0) {
      const dis = sol.filter((e) => e.s.sol).concat(M.entries.filter((e) => e.state === 'crust'));
      if (dis.length) {
        dis.forEach((e) => { e.state = 'sol'; M.noted.add(e.k); });
        if (dis.some((x) => x.s.solute)) M.boiled = 0;
        const e = dis[0];
        const cold = dis.some((x) => x.s.endo);
        const col = e.s.ion && ionColour(e.s.ion[0], e.s.ion[1]);
        return R(cold ? ['dissolve', 'temp'] : col ? ['dissolve', 'colour'] : ['dissolve'], cold
          ? T2(`${e.s.name.en}: it dissolves, and the beaker gets colder. Dissolving it takes in heat.`, `${e.s.name.hi}: यह घुल जाता है और बीकर ठंडा हो जाता है। घुलते समय यह ऊष्मा लेता है।`)
          : T2(`${e.s.name.en}: it dissolves in the water${col ? ' and colours it' : '. It spreads out evenly, so you cannot see it, but it is still there'}.`, `${e.s.name.hi}: यह पानी में घुल जाता है${col ? ' और उसे रंग देता है' : '। यह पूरे पानी में बराबर फैल जाता है, इसलिए दिखता नहीं, पर वहीं है'}।`), { temp: cold ? -0.7 : 0 });
      }
      const ins = sol.find((e) => !M.noted.has(e.k));
      if (ins) {
        M.noted.add(ins.k);
        const nm = nameOf(ins);
        if (ins.s.floats) return R(['nodissolve'], T2(`Floats and does not dissolve: ${nm.en.toLowerCase()} is lighter than water.`, `तैरता है और घुलता नहीं: ${nm.hi} पानी से हल्का है।`));
        if (ins.id === 'chalk') return R(['nodissolve'], T2('Chalk does not dissolve: the water turns cloudy for a while, then the chalk settles.', 'चॉक घुलता नहीं: पानी कुछ देर धुँधला होता है, फिर चॉक नीचे बैठ जाता है।'));
        return R(['nodissolve'], T2(`Does not dissolve: ${nm.en.toLowerCase()} stays at the bottom of the liquid.`, `नहीं घुलता: ${nm.hi} द्रव की तली में पड़ा रहता है।`));
      }
      const oil = M.entries.find((e) => e.s.oil && !M.noted.has(e.k));
      const others = M.entries.filter((e) => e.state === 'liq' && !e.s.oil).length + (M.water > 0 ? 1 : 0);
      if (oil && others) { M.noted.add(oil.k); return R(['nodissolve'], T2('Oil does not mix with water: it floats on top as a separate layer, because oil is lighter than water.', 'तेल पानी में नहीं मिलता: यह ऊपर एक अलग परत बनाकर तैरता है, क्योंकि तेल पानी से हल्का है।')); }
      const alc = M.entries.find((e) => e.s.organic && !M.noted.has(e.k));
      if (alc && M.entries.filter((e) => e.state === 'liq' && !e.s.oil && !e.s.organic).length) { M.noted.add(alc.k); return R(['dissolve'], T2('Alcohol mixes completely with water: you cannot see two layers.', 'ऐल्कोहॉल पानी में पूरी तरह मिल जाता है: दो परतें नहीं दिखतीं।')); }
    }
    return null;
  }
  function carbonate(M, e, a) {
    const [cc, ac] = e.s.ion, an = a.s.ion[1];
    const L2 = eqLine([[fOf(e), stOf(e)], [fOf(a), 'aq']], [[saltF(cc, an), INSOL[cc + '|' + an] ? 's' : 'aq'], ['H2O', 'l'], ['CO2', 'g', '^']]);
    const xi = Math.min(e.n / L2.co[0], a.n / L2.co[1]);
    consume(M, a, xi * L2.co[1]);
    if (e.state === 'solid') { e.n -= xi * L2.co[0]; if (e.n <= 1e-7) M.entries.splice(M.entries.indexOf(e), 1); } else consume(M, e, xi * L2.co[0]);
    addSol(M, cc, an, xi * L2.co[2]);
    M.gas = { type: 'CO2' };
    const soda = ac === 'HCO3';
    const sn = saltName(cc, an);
    const r = R(soda ? ['gas', 'temp'] : ['gas'], join(T2(`It fizzes: carbon dioxide gas bubbles out. ${sn.en} and water are made too. Every carbonate does this with an acid.`, `झाग बनता है: कार्बन डाइऑक्साइड गैस के बुलबुले निकलते हैं। ${sn.hi} और पानी भी बनते हैं। हर कार्बोनेट अम्ल के साथ ऐसा करता है।`), cc === 'Ca' && an === 'SO4' ? T2(' The fizzing soon slows: calcium sulphate does not dissolve well and coats the chalk.', ' झाग जल्दी धीमा पड़ता है: कैल्शियम सल्फेट ठीक से नहीं घुलता और चॉक पर परत बना देता है।') : null), { eq: L2.eq, gas: soda ? 3 : 1.8, gasType: 'CO2', foam: soda ? 1 : 0.3, temp: soda && ANI[an].weak ? -0.6 : soda ? -0.2 : 0.2 });
    return withOverride(r, e, a);
  }
  function indicatorEntry(M) { const l = M.entries.filter((e) => e.s.ind && e.state === 'liq'); return l[l.length - 1]; }
  function indicatorNow(M) { const e = indicatorEntry(M); if (!e) return null; const p = phOf(M); return { e, p, col: IND[e.s.ind](p == null ? 7 : p) }; }
  // After any change: run every reaction that can happen, then see whether an indicator changed.
  function settle(M, quiet) {
    const out = [];
    const ind0 = M.indCol;
    const c0 = liquidColour(M);
    for (let i = 0; i < 6; i++) { const r = nextReaction(M); if (!r) break; out.push(r); }
    const I = indicatorNow(M);
    if (I) {
      const from = ind0 && ind0.k === I.e.k ? ind0.c : I.e.s.colour;
      const changed = from.toLowerCase() !== I.col[0].toLowerCase();
      const nm = I.e.s.name, kw = kindWord(I.p);
      const others = M.entries.filter((e) => e !== I.e).length + (M.water > 0 ? 1 : 0);
      if (!quiet && changed) out.push(R(['colour'], T2(`${nm.en} turns ${COLW[I.col[1]].en}: the liquid is ${kw.en}.`, `${nm.hi} ${COLW[I.col[1]].hi} हो जाता है: द्रव ${kw.hi} है।`)));
      else if (!quiet && !changed && others && (!ind0 || ind0.k !== I.e.k)) {
        const hint = I.e.s.ind === 'litB' ? T2(' Blue litmus turns red only in an acid.', ' नीला लिटमस केवल अम्ल में लाल होता है।') : I.e.s.ind === 'litR' ? T2(' Red litmus turns blue only in a base.', ' लाल लिटमस केवल क्षार में नीला होता है।') : I.e.s.ind === 'php' ? T2(' Phenolphthalein turns pink only in a base.', ' फ़िनॉल्फ़्थेलिन केवल क्षार में गुलाबी होता है।') : I.e.s.ind === 'tur' ? T2(' Turmeric turns reddish-brown only in a base.', ' हल्दी केवल क्षार में लाल-भूरी होती है।') : null;
        out.push(R([], join(T2(`${nm.en} stays ${COLW[I.col[1]].en}: the liquid is ${kw.en}.`, `${nm.hi} ${COLW[I.col[1]].hi} ही रहता है: द्रव ${kw.hi} है।`), hint), { none: !out.length }));
      }
      M.indCol = { k: I.e.k, c: I.col[0] };
    } else M.indCol = null;
    if (!quiet && !out.length && M.entries.length + (M.water > 0 ? 1 : 0) >= 2) out.push(R([], T2('Nothing visible happens with these.', 'इनसे कोई बदलाव दिखाई नहीं देता।'), { none: true }));
    const c1 = liquidColour(M);
    if (c0 && c1 && !quiet) {
      const d = hex(c0).reduce((a, v, i) => a + Math.abs(v - hex(c1)[i]), 0);
      const main = out.find((r) => !r.none);
      if (d > 45 && main && !main.obs.includes('colour')) main.obs = main.obs.concat('colour');
    }
    applyEffects(M, out);
    return out;
  }
  function applyEffects(M, out) {
    for (const r of out) {
      if (r.temp) M.temp = clamp(M.temp + r.temp, -1, 3);
      if (r.gas) M.rate = Math.max(r.gas * 0.4, 0.2);
      if (r.steam) M.steam = 1;
      if (r.fume) M.fume = r.fume;
    }
  }
  function addToBench(M, id) {
    const e = mkEntry(id);
    M.entries.push(e);
    M.added.push(id);
    M.elec = null;
    return settle(M);
  }
  // Heating with the spirit lamp.
  function heat(M) {
    const V = liquidVol(M);
    const dry = V === 0;
    const sol = solids(M);
    const find = (p) => M.entries.find(p);
    const once = (key) => { if (M.done.has(key)) return false; M.done.add(key); return true; };
    const out = [];
    M.elec = null;
    let r = null;
    const sd = (id) => sol.find((e) => e.id === id);
    const swap = (e, id) => { e.id = id; e.s = SUB[id]; e.n = SUB[id].amt || e.n; };
    const naoh = dissolved(M).find((e) => e.s.ion[1] === 'OH' && CAT[e.s.ion[0]].strong);
    const nh4 = M.entries.find((e) => e.s.ion && e.s.ion[0] === 'NH4' && e.s.ion[1] !== 'OH');
    if (dry && sd('cuso4c')) { swap(sd('cuso4c'), 'cuso4anh'); M.drops = 1; r = R(['colour', 'state'], T2('The blue crystals turn white, and drops of water appear on the cool glass: heating drives out the water of crystallisation.', 'नीले क्रिस्टल सफ़ेद हो जाते हैं और ठंडे काँच पर पानी की बूँदें दिखती हैं: गर्म करने से क्रिस्टलन जल निकल जाता है।'), { eq: 'CuSO4·5H2O(s) -[heat]-> CuSO4(s) + 5H2O(g)', steam: 0.6 }); }
    else if (dry && sd('feso4c')) { swap(sd('feso4c'), 'fe2o3'); M.drops = 1; M.gas = { type: 'SO2' }; r = R(['colour', 'smell'], T2('First drops of water form (the crystals lose their water of crystallisation), then the green crystals turn reddish-brown and give a smell of burning sulphur. Ferrous sulphate breaks down: thermal decomposition.', 'पहले पानी की बूँदें बनती हैं (क्रिस्टल अपना क्रिस्टलन जल खोते हैं), फिर हरे क्रिस्टल लाल-भूरे हो जाते हैं और जलते गंधक जैसी गंध आती है। फ़ेरस सल्फेट टूट जाता है: यह ऊष्मीय वियोजन है।'), { eq: '2FeSO4(s) -[heat]-> Fe2O3(s) + SO2(g)^ + SO3(g)^', fume: '#EEF0F2' }); }
    else if (dry && sd('pbno3s')) { swap(sd('pbno3s'), 'pbo'); M.gas = { type: 'NO2' }; r = R(['gas', 'colour'], join(T2('Brown fumes of nitrogen dioxide rise, and a yellowish lead oxide is left: lead nitrate breaks down on heating. Oxygen is given off too.', 'नाइट्रोजन डाइऑक्साइड का भूरा धुआँ उठता है और पीला-सा लेड ऑक्साइड बचता है: गर्म करने पर लेड नाइट्रेट टूट जाता है। ऑक्सीजन भी निकलती है।'), T2(' The brown gas is poisonous: only a teacher does this, in a fume cupboard.', ' भूरी गैस ज़हरीली है: यह केवल शिक्षक धूम-कक्ष में करते हैं।')), { eq: '2Pb(NO3)2(s) -[heat]-> 2PbO(s) + 4NO2(g)^ + O2(g)^', fume: '#A0522D' }); }
    else if (dry && sd('soda')) { const e = sd('soda'); const n = e.n / 2; swap(e, 'na2co3s'); e.n = n; M.gas = { type: 'CO2' }; M.drops = 1; r = R(['gas'], T2('Baking soda breaks down: carbon dioxide and steam are given off and sodium carbonate is left. This is why baking soda makes cakes rise.', 'खाने का सोडा टूट जाता है: कार्बन डाइऑक्साइड और भाप निकलती है और सोडियम कार्बोनेट बचता है। इसी से केक फूलता है।'), { eq: '2NaHCO3(s) -[heat]-> Na2CO3(s) + H2O(l) + CO2(g)^' }); }
    else if (dry && sd('mg')) { swap(sd('mg'), 'mgo'); r = R(['light'], T2('Magnesium burns with a dazzling white flame and turns into white magnesium oxide powder. (In a real lab it is held with tongs; never look straight at the flame.)', 'मैग्नीशियम चकाचौंध करने वाली सफ़ेद लौ से जलता है और सफ़ेद मैग्नीशियम ऑक्साइड पाउडर बन जाता है। (असली लैब में इसे चिमटे से पकड़ते हैं; लौ को सीधे मत देखो।)'), { eq: '2Mg(s) + O2(g) -[heat]-> 2MgO(s)', light: '#FFFFFF' }); }
    else if (dry && sol.find((e) => e.id === 'copperwire' && !e.oxide)) { const e = sol.find((x) => x.id === 'copperwire' && !x.oxide); e.oxide = true; e.coat = '#1F1A17'; r = R(['colour'], T2('The copper wire gets a black coat: copper joins with oxygen from the air to form copper oxide. This is oxidation.', 'ताँबे के तार पर काली परत चढ़ जाती है: ताँबा हवा की ऑक्सीजन से जुड़कर कॉपर ऑक्साइड बनाता है। यह ऑक्सीकरण है।'), { eq: '2Cu(s) + O2(g) -[heat]-> 2CuO(s)' }); }
    else if (dry && sd('ironfil') && sd('sulphur')) { [sd('ironfil'), sd('sulphur')].forEach((e) => M.entries.splice(M.entries.indexOf(e), 1)); M.entries.push(mkEntry('fes')); r = R(['light', 'colour'], T2('The mixture glows red-hot and turns into a black solid, iron sulphide: a new compound. A magnet can no longer pull out the iron.', 'मिश्रण लाल होकर दमकता है और काला ठोस, आयरन सल्फ़ाइड, बन जाता है: एक नया यौगिक। अब चुंबक लोहे को अलग नहीं कर सकता।'), { eq: 'Fe(s) + S(s) -[heat]-> FeS(s)', light: '#FF8A3D' }); }
    else if (dry && sd('sulphur')) { M.entries.splice(M.entries.indexOf(sd('sulphur')), 1); M.gas = { type: 'SO2' }; r = R(['light', 'smell'], join(T2('Sulphur melts, then burns with a blue flame, making sulphur dioxide gas with a choking smell. Sulphur dioxide dissolves in water to make an acid: it turns blue litmus red.', 'गंधक पिघलता है, फिर नीली लौ से जलता है और दम घोंटने वाली गंध की सल्फ़र डाइऑक्साइड गैस बनती है। सल्फ़र डाइऑक्साइड पानी में घुलकर अम्ल बनाती है: यह नीले लिटमस को लाल करती है।'), TEACHER), { eq: 'S(s) + O2(g) -[heat]-> SO2(g)^', light: '#5B8CFF' }); }
    else if (dry && (sd('nh4cl') || sd('camphor'))) { const e = sd('nh4cl') || sd('camphor'); M.subl = '#FFFFFF'; e.sublimed = true; r = R(['state'], T2(`${e.s.name.en} turns straight into vapour without melting, and the vapour turns back into solid on the cool upper glass: sublimation. This separates it from things like salt or sand.`, `${e.s.name.hi} बिना पिघले सीधे वाष्प बन जाता है और ठंडे ऊपरी काँच पर फिर ठोस बन जाता है: यह ऊर्ध्वपातन है। इससे इसे नमक या रेत जैसी चीज़ों से अलग किया जाता है।`), { fume: '#F4F6F8' }); }
    else if (dry && sd('sugar')) { swap(sd('sugar'), 'carbon'); M.drops = 1; r = R(['colour', 'state'], T2('Sugar melts, turns brown (caramel), then black: it breaks down into carbon and water vapour. This change cannot be undone: a chemical change.', 'चीनी पिघलती है, भूरी (कैरेमल) होती है, फिर काली: यह कार्बन और जलवाष्प में टूट जाती है। यह बदलाव उलटा नहीं हो सकता: यह रासायनिक परिवर्तन है।'), { eq: 'C12H22O11(s) -[heat]-> 12C(s) + 11H2O(g)', steam: 0.6 }); }
    else if (dry && sol.find((e) => e.id === 'wax' && !e.melted)) { sol.find((e) => e.id === 'wax').melted = true; r = R(['state'], T2('The wax melts into a liquid. When it cools it turns solid again: a physical change, no new substance.', 'मोम पिघलकर द्रव बन जाता है। ठंडा होने पर यह फिर ठोस बनता है: यह भौतिक परिवर्तन है, कोई नया पदार्थ नहीं बनता।')); }
    else if (dry && sd('chalk')) r = R([], T2('No visible change. Chalk (calcium carbonate) breaks into quicklime and carbon dioxide only in a very hot kiln, about 850 °C: a spirit lamp is not hot enough.', 'कोई बदलाव नहीं दिखता। चॉक (कैल्शियम कार्बोनेट) बिना बुझे चूने और कार्बन डाइऑक्साइड में केवल बहुत गर्म भट्ठी (लगभग 850 °C) में टूटता है: स्पिरिट लैंप उतना गर्म नहीं है।'), { none: true, eq: 'CaCO3(s) -[heat]-> CaO(s) + CO2(g)^' });
    else if (dry && sd('agcl')) r = R([], T2('No change from gentle heating. Silver chloride is broken down by light: in sunlight it slowly turns grey as silver forms.', 'हल्का गर्म करने से कोई बदलाव नहीं। सिल्वर क्लोराइड प्रकाश से टूटता है: धूप में चाँदी बनने से यह धीरे-धीरे धूसर हो जाता है।'), { none: true, eq: '2AgCl(s) -[sunlight]-> 2Ag(s) + Cl2(g)' });
    else if (sol.find((e) => e.id === 'ice')) { sol.filter((e) => e.id === 'ice').forEach((e) => { e.id = 'water'; e.s = SUB.water; e.state = 'liq'; e.vol = 1; e.n = 1; }); M.tempNote = T2('0 °C', '0 °C'); r = R(['state'], T2('The ice melts into water. While it melts the temperature stays at 0 °C: the heat goes into melting.', 'बर्फ़ पिघलकर पानी बनती है। पिघलते समय तापमान 0 °C पर रुका रहता है: ऊष्मा पिघलने में लगती है।')); }
    else if (find((e) => e.id === 'eggwhite' && !e.cooked)) { find((e) => e.id === 'eggwhite').cooked = true; M.cloud = '#FBFAF6'; r = R(['colour', 'state'], T2('The clear egg white turns solid and white: heat changes its protein for good, as when an egg is boiled.', 'साफ़ अंडे की सफ़ेदी ठोस और सफ़ेद हो जाती है: ऊष्मा इसके प्रोटीन को हमेशा के लिए बदल देती है, जैसे अंडा उबालने पर।')); }
    else if (find((e) => e.id === 'alcohol') && find((e) => e.id === 'kmno4')) { const k = find((e) => e.id === 'kmno4'); M.water += k.vol; M.entries.splice(M.entries.indexOf(k), 1); r = R(['colour'], T2('The purple colour disappears as the permanganate is used up: it oxidises the ethanol to ethanoic acid. (Warm alcohol only in a hot-water bath, never over a flame.)', 'परमैंगनेट ख़र्च होने पर बैंगनी रंग ग़ायब हो जाता है: यह एथेनॉल को एथेनॉइक अम्ल में ऑक्सीकृत करता है। (ऐल्कोहॉल को केवल गर्म पानी के बर्तन में गर्म करो, लौ पर कभी नहीं।)'), { eq: 'CH3CH2OH(aq) -[alk.KMnO4,heat]-> CH3COOH(aq)' }); }
    else if (naoh && sol.find((e) => e.s.metal === 'Zn') && once('zn-naoh-hot')) { M.gas = { type: 'H2' }; r = R(['gas'], T2('Now bubbles of hydrogen come quickly: warm zinc reacts with sodium hydroxide to make sodium zincate and hydrogen.', 'अब हाइड्रोजन के बुलबुले तेज़ी से आते हैं: गर्म जस्ता सोडियम हाइड्रॉक्साइड से अभिक्रिया करके सोडियम ज़िंकेट और हाइड्रोजन बनाता है।'), { eq: 'Zn(s) + 2NaOH(aq) -[heat]-> Na2ZnO2(aq) + H2(g)^', gas: 1.6, gasType: 'H2' }); }
    else if (naoh && nh4 && once('nh3')) { M.gas = { type: 'NH3' }; const L2 = eqLine([[fOf(nh4), stOf(nh4)], [fOf(naoh), 'aq']], [[saltF(naoh.s.ion[0], nh4.s.ion[1]), 'aq'], ['H2O', 'l'], ['NH3', 'g', '^']], 'heat'); r = R(['gas', 'smell'], T2('A gas with a sharp smell comes off: ammonia. It turns moist red litmus paper blue. Every ammonium salt gives ammonia when warmed with a base.', 'तीखी गंध वाली गैस निकलती है: अमोनिया। यह गीले लाल लिटमस पेपर को नीला कर देती है। हर अमोनियम लवण क्षार के साथ गर्म करने पर अमोनिया देता है।'), { eq: L2 && L2.eq, gas: 0.8, gasType: 'NH3' }); }
    else if (find((e) => e.s.peroxide) && !find((e) => e.s.catalyst) && once('h2o2-hot')) { M.gas = { type: 'O2' }; r = R(['gas'], T2('Hydrogen peroxide breaks down faster when warm: small bubbles of oxygen form.', 'गर्म करने पर हाइड्रोजन पेरॉक्साइड तेज़ी से टूटता है: ऑक्सीजन के छोटे बुलबुले बनते हैं।'), { eq: '2H2O2(aq) -[heat]-> 2H2O(l) + O2(g)^', gas: 0.8, gasType: 'O2' }); }
    else if (V > 0) {
      const aqLiq = M.entries.filter((e) => e.state === 'liq' && !e.s.oil && !e.s.organic).length + (M.water > 0 ? 1 : 0);
      const solutes = M.entries.filter((e) => (e.state === 'sol' || e.state === 'liq') && (e.s.ion || e.s.solute) && e.n > 1e-7);
      const harsh = M.entries.some((e) => e.state !== 'solid' && e.s.ion && (e.s.ion[0] === 'H' || e.s.ion[1] === 'OH'));
      if (!aqLiq) r = R([], M.entries.some((e) => e.s.organic) ? T2('Alcohol catches fire easily, so it is warmed only in a hot-water bath. There it evaporates quickly: it boils at about 78 °C.', 'ऐल्कोहॉल जल्दी आग पकड़ता है, इसलिए इसे केवल गर्म पानी के बर्तन में गर्म करते हैं। वहाँ यह जल्दी वाष्पित होता है: यह लगभग 78 °C पर उबलता है।') : T2('The oil gets hot. Never heat oil strongly: it can catch fire.', 'तेल गर्म हो जाता है। तेल को कभी बहुत गर्म मत करो: इसमें आग लग सकती है।'), { none: true });
      else if (M.boiled === 0) {
        M.boiled = 1;
        M.entries.forEach((e) => { if (e.state === 'liq') e.vol *= 0.5; });
        M.water *= 0.5;
        M.tempNote = T2('100 °C', '100 °C');
        r = R(['state'], solutes.length && !harsh ? T2('The water boils at 100 °C and turns into steam, so the level falls. Heat it again to boil away all the water and see what is left.', 'पानी 100 °C पर उबलकर भाप बनता है, इसलिए स्तर गिरता है। सारा पानी उड़ाने और देखने के लिए कि क्या बचता है, फिर गर्म करो।') : T2('The water boils at 100 °C and turns into steam, so the level falls: evaporation.', 'पानी 100 °C पर उबलकर भाप बनता है, इसलिए स्तर गिरता है: यह वाष्पन है।'), { steam: 1 });
      } else if (harsh) r = R([], T2('We stop here: boiling an acid or an alkali dry is dangerous.', 'हम यहीं रुकते हैं: अम्ल या क्षार को सुखाने तक उबालना ख़तरनाक है।'), { none: true, steam: 1 });
      else {
        M.crust = solutes.map((e) => (e.s.ion ? ionColour(e.s.ion[0], e.s.ion[1]) || (e.s.kind === 'solid' ? e.s.colour : '#FFFFFF') : '#FFFFFF'));
        const names = solutes.map(crustName);
        M.entries = M.entries.filter((e) => e.state === 'solid' || solutes.includes(e) || e.s.oil);
        solutes.forEach((e) => { e.state = 'crust'; e.vol = 0; });
        M.water = 0; M.tempNote = null; M.tint = null; M.cloud = null; M.boiled = 0;
        r = R(['state'], names.length ? T2(`All the water has boiled away. ${names.map((n) => n.en).join(', ')} is left behind as crystals: evaporation separates a dissolved solid from water.`, `सारा पानी उड़ गया। ${names.map((n) => n.hi).join(', ')} क्रिस्टल के रूप में बच जाता है: वाष्पन से घुला हुआ ठोस पानी से अलग होता है।`) : T2('All the water has boiled away and the beaker is dry: nothing was dissolved in it.', 'सारा पानी उड़ गया और बीकर सूख गया: उसमें कुछ घुला नहीं था।'), { steam: 1 });
      }
    } else r = R([], T2('It gets hot, but nothing else changes: no new substance forms.', 'यह गर्म हो जाता है, पर और कुछ नहीं बदलता: कोई नया पदार्थ नहीं बनता।'), { none: true });
    if (r.gasType == null && M.gas && r.gas) r.gasType = M.gas.type;
    if (!r.gas && /gas/.test((r.obs || []).join())) r.gas = 1.2;
    out.push(r);
    M.temp = Math.max(M.temp, 2);
    const more = settle(M);
    more.filter((x) => !x.none).forEach((x) => out.push(x));
    applyEffects(M, [r]);
    return out;
  }
  function crustName(e) { return e.s.solute ? SUB[e.s.solute].name : e.s.kind === 'solid' ? e.s.name : saltName(e.s.ion[0], e.s.ion[1]); }
  // Electrolysis with carbon electrodes and a 6 V battery.
  function electrolyse(M) {
    const V = liquidVol(M);
    if (!V || !M.entries.some((e) => e.state === 'liq' && !e.s.oil && !e.s.organic) && !M.water) return null;
    const D = dissolved(M).filter((e) => e.n / V > 1e-4);
    let cond = 0;
    D.forEach((e) => { const [c, a] = e.s.ion; const weak = ANI[a].weak && c === 'H' || c === 'NH4' && a === 'OH'; cond = Math.max(cond, weak ? 1 : 2); });
    M.entries.forEach((e) => { if (e.state !== 'solid' && e.s.cond) cond = Math.max(cond, e.s.cond); });
    if (!cond) { M.elec = { cond: 0 }; return R([], T2('The bulb does not light and almost no bubbles form: pure water (or sugar or alcohol in water) hardly conducts electricity. Add a little acid or salt.', 'बल्ब नहीं जलता और लगभग कोई बुलबुला नहीं बनता: शुद्ध पानी (या पानी में चीनी या ऐल्कोहॉल) बिजली का चालन लगभग नहीं करता। थोड़ा अम्ल या नमक मिलाओ।'), { none: true }); }
    const cats = D.map((e) => e.s.ion[0]), ans = D.map((e) => e.s.ion[1]);
    const cath = cats.includes('Ag') ? 'Ag' : cats.includes('Cu') ? 'Cu' : cats.includes('Pb') ? 'Pb' : 'H2';
    const an = ans.includes('I') ? 'I2' : D.some((e) => e.s.ion[1] === 'Cl' && e.n / V > 0.02) ? 'Cl2' : 'O2';
    let eq = null;
    const salt = (c) => D.find((e) => e.s.ion[0] === c);
    if (cath === 'H2' && an === 'O2') eq = '2H2O(l) -[electricity]-> 2H2(g)^ + O2(g)^';
    else if (cath === 'H2' && an === 'Cl2') eq = D.some((e) => e.s.ion.join() === 'Na,Cl') ? '2NaCl(aq) + 2H2O(l) -[electricity]-> 2NaOH(aq) + Cl2(g)^ + H2(g)^' : D.some((e) => e.s.ion.join() === 'H,Cl') ? '2HCl(aq) -[electricity]-> H2(g)^ + Cl2(g)^' : null;
    else if (cath === 'H2' && an === 'I2' && D.some((e) => e.s.ion.join() === 'K,I')) eq = '2KI(aq) + 2H2O(l) -[electricity]-> 2KOH(aq) + I2(aq) + H2(g)^';
    else if (cath === 'Cu' && an === 'O2' && salt('Cu').s.ion[1] === 'SO4') eq = '2CuSO4(aq) + 2H2O(l) -[electricity]-> 2Cu(s) + 2H2SO4(aq) + O2(g)^';
    else if (cath === 'Cu' && an === 'Cl2' && salt('Cu').s.ion[1] === 'Cl') eq = 'CuCl2(aq) -[electricity]-> Cu(s) + Cl2(g)^';
    else if (cath === 'Ag' && an === 'O2' && salt('Ag').s.ion[1] === 'NO3') eq = '4AgNO3(aq) + 2H2O(l) -[electricity]-> 4Ag(s) + 4HNO3(aq) + O2(g)^';
    else if (cath === 'Pb' && an === 'O2' && salt('Pb').s.ion[1] === 'NO3') eq = '2Pb(NO3)2(aq) + 2H2O(l) -[electricity]-> 2Pb(s) + 4HNO3(aq) + O2(g)^';
    M.elec = { cond, cath, an, ratio: cath === 'H2' && an === 'O2' ? 2 : 1 };
    M.gas = { elec: { cath, an } };
    if (cath === 'Cu') { const s = salt('Cu'); s.n *= 0.75; }
    if (an === 'I2') M.tint = { c: '#A65E1E', a: 0.45 };
    const bulb = cond === 2 ? T2('The bulb glows brightly: the liquid conducts electricity.', 'बल्ब तेज़ जलता है: द्रव बिजली का चालन करता है।') : T2('The bulb glows dimly: the liquid conducts a little.', 'बल्ब धीमा जलता है: द्रव थोड़ा चालन करता है।');
    let tx;
    if (cath === 'H2' && an === 'O2') tx = T2(' Hydrogen collects over the negative electrode (cathode) and oxygen over the positive one (anode). There is twice as much hydrogen as oxygen, 2 : 1, because water is H₂O.', ' ऋण इलेक्ट्रोड (कैथोड) पर हाइड्रोजन और धन इलेक्ट्रोड (ऐनोड) पर ऑक्सीजन जमा होती है। हाइड्रोजन ऑक्सीजन की दोगुनी है, 2 : 1, क्योंकि पानी H₂O है।');
    else if (cath === 'H2' && an === 'Cl2') tx = T2(' Hydrogen forms at the cathode and chlorine (a greenish gas with a bleach smell) at the anode.', ' कैथोड पर हाइड्रोजन और ऐनोड पर क्लोरीन (ब्लीच जैसी गंध वाली हरी-पीली गैस) बनती है।');
    else if (cath === 'H2' && an === 'I2') tx = T2(' Hydrogen bubbles at the cathode; the liquid turns brown at the anode as iodine forms.', ' कैथोड पर हाइड्रोजन के बुलबुले; ऐनोड पर आयोडीन बनने से द्रव भूरा होता है।');
    else tx = { en: ` ${cap(CAT[cath].m.en)} coats the negative electrode (cathode), and ${an === 'Cl2' ? 'chlorine' : an === 'I2' ? 'iodine' : 'oxygen'} forms at the anode. This is how electroplating works.`, hi: ` ऋण इलेक्ट्रोड (कैथोड) पर ${CAT[cath].m.hi} की परत चढ़ती है और ऐनोड पर ${an === 'Cl2' ? 'क्लोरीन' : an === 'I2' ? 'आयोडीन' : 'ऑक्सीजन'} बनती है। विद्युत-लेपन ऐसे ही होता है।` };
    return R(['glow', 'gas'], join(bulb, tx), { eq });
  }
  const SPLINT = {
    pop: T2('a squeaky pop', 'हल्की "पॉप" की आवाज़'), relight: T2('the glowing splint bursts into flame', 'सुलगती तीली फिर से जल उठती है'), out: T2('the burning splint goes out', 'जलती तीली बुझ जाती है'), burn: T2('the splint keeps burning as in air', 'तीली हवा की तरह जलती रहती है'),
  };
  function splintTest(M) {
    const g = M.gas;
    if (g && g.elec) {
      const c = g.elec.cath === 'H2' ? 'pop' : null, a = g.elec.an === 'O2' ? 'relight' : null;
      const parts = [];
      if (c) parts.push(T2('At the cathode tube: a squeaky pop, so the gas is hydrogen.', 'कैथोड वाली नली पर: हल्की "पॉप" की आवाज़, तो गैस हाइड्रोजन है।'));
      if (a) parts.push(T2('At the anode tube: the glowing splint relights, so the gas is oxygen.', 'ऐनोड वाली नली पर: सुलगती तीली फिर जल उठती है, तो गैस ऑक्सीजन है।'));
      if (g.elec.an === 'Cl2') parts.push(T2('Chlorine is not tested with a splint: it has a bleach smell and bleaches damp litmus paper.', 'क्लोरीन की जाँच तीली से नहीं करते: इसकी गंध ब्लीच जैसी होती है और यह गीले लिटमस पेपर का रंग उड़ा देती है।'));
      const note = parts.reduce((x, y) => ({ en: x.en + (x.en ? ' ' : '') + y.en, hi: x.hi + (x.hi ? ' ' : '') + y.hi }), { en: '', hi: '' });
      return R([c ? 'pop' : null, a ? 'relight' : null].filter(Boolean), note.en ? note : T2('No gas to test here.', 'यहाँ जाँचने के लिए कोई गैस नहीं।'), { show: c || a || 'burn', splint: a && !c ? 'glow' : 'burn' });
    }
    const t = g && g.type;
    const map = { H2: ['burn', 'pop', T2('A squeaky pop: the gas is hydrogen. Hydrogen burns with a pop.', 'हल्की "पॉप" की आवाज़: गैस हाइड्रोजन है। हाइड्रोजन "पॉप" के साथ जलती है।')], O2: ['glow', 'relight', T2('The glowing splint bursts into flame: the gas is oxygen. Oxygen helps things burn.', 'सुलगती तीली फिर से जल उठती है: गैस ऑक्सीजन है। ऑक्सीजन जलने में मदद करती है।')], CO2: ['burn', 'out', T2('The burning splint goes out: carbon dioxide does not let things burn. (Lime water tells it apart from other such gases.)', 'जलती तीली बुझ जाती है: कार्बन डाइऑक्साइड जलने नहीं देती। (चूने का पानी इसे दूसरी ऐसी गैसों से अलग पहचानता है।)')], SO2: ['burn', 'out', T2('The burning splint goes out: sulphur dioxide does not support burning.', 'जलती तीली बुझ जाती है: सल्फ़र डाइऑक्साइड जलने में मदद नहीं करती।')], NH3: ['burn', 'out', T2('The burning splint goes out: ammonia does not burn in air.', 'जलती तीली बुझ जाती है: अमोनिया हवा में नहीं जलती।')], NO2: ['glow', 'relight', T2('The glowing splint relights: oxygen comes off along with the brown nitrogen dioxide.', 'सुलगती तीली फिर जल उठती है: भूरी नाइट्रोजन डाइऑक्साइड के साथ ऑक्सीजन भी निकलती है।')], H2S: ['burn', 'burn', T2('Hydrogen sulphide burns with a blue flame, and it is poisonous: it is identified by its rotten-egg smell.', 'हाइड्रोजन सल्फ़ाइड नीली लौ से जलती है और ज़हरीली है: इसे सड़े अंडे जैसी गंध से पहचानते हैं।')] };
    const m = map[t];
    if (!m) return R([], T2('No gas is coming off, so the splint keeps burning just as in air.', 'कोई गैस नहीं निकल रही, इसलिए तीली हवा की तरह जलती रहती है।'), { show: 'burn', splint: 'burn' });
    return R(m[1] === 'burn' ? [] : [m[1] === 'pop' ? 'pop' : m[1] === 'relight' ? 'relight' : 'goesout'], m[2], { show: m[1], splint: m[0] });
  }
  function limeTest(M) {
    const t = M.gas && M.gas.type;
    if (t === 'CO2') return R(['milky'], T2('The lime water turns milky: the gas is carbon dioxide. It makes a white precipitate of calcium carbonate. (If you keep bubbling, it slowly clears again.)', 'चूने का पानी दूधिया हो जाता है: गैस कार्बन डाइऑक्साइड है। इससे कैल्शियम कार्बोनेट का सफ़ेद अवक्षेप बनता है। (बहुत देर तक गैस डालने पर यह धीरे-धीरे फिर साफ़ हो जाता है।)'), { eq: 'Ca(OH)2(aq) + CO2(g) -> CaCO3(s)v + H2O(l)', milky: 1 });
    if (t === 'SO2') return R(['milky'], T2('The lime water turns milky. Sulphur dioxide does this too, like carbon dioxide; its choking smell tells it apart.', 'चूने का पानी दूधिया हो जाता है। कार्बन डाइऑक्साइड की तरह सल्फ़र डाइऑक्साइड भी ऐसा करती है; इसकी दम घोंटने वाली गंध इसे अलग पहचानती है।'), { eq: 'Ca(OH)2(aq) + SO2(g) -> CaSO3(s)v + H2O(l)', milky: 1 });
    if (M.gas) return R([], T2(`The lime water stays clear: the gas is not carbon dioxide.`, `चूने का पानी साफ़ रहता है: गैस कार्बन डाइऑक्साइड नहीं है।`), { none: true });
    return R([], T2('No gas is coming off, so the lime water stays clear.', 'कोई गैस नहीं निकल रही, इसलिए चूने का पानी साफ़ रहता है।'), { none: true });
  }

  // ---------------------------------------------------------------- colours of what is in the beaker
  function liquidColour(M) {
    const liq = M.entries.filter((e) => e.state === 'liq' && !e.s.oil);
    const V = liquidVol(M);
    if (V <= 0) return null;
    const cols = [], w = [];
    liq.forEach((e) => { cols.push(e.s.ind || e.s.ion ? WATER : e.s.colour); w.push(e.vol); });
    if (M.water > 0) { cols.push(WATER); w.push(M.water); }
    const W = w.reduce((a, b) => a + b, 0) || 1;
    const s = [0, 0, 0];
    cols.forEach((c, i) => hex(c).forEach((v, k) => (s[k] += (v * w[i]) / W)));
    let c = '#' + s.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    M.entries.forEach((e) => { if (e.state !== 'solid' && e.s.ion) { const ic = ionColour(e.s.ion[0], e.s.ion[1]); if (ic) c = mixHex(c, ic, Math.min(0.92, e.n / V / 0.07)); } });
    if (M.tint) c = mixHex(c, M.tint.c, M.tint.a);
    const I = indicatorNow(M);
    if (I) c = mixHex(c, I.col[0], 0.82);
    if (M.cloud) c = mixHex(c, M.cloud, 0.5);
    return c;
  }
  const liquidLevel = (M) => Math.min(150, (M.entries.reduce((v, e) => v + (e.state === 'liq' ? e.vol : 0), 0) + M.water) * 36);
  const oilLevel = (M) => Math.min(60, M.entries.reduce((v, e) => v + (e.state === 'liq' && e.s.oil ? e.vol : 0), 0) * 36);

  // ---------------------------------------------------------------- CSS
  const CSS = `.bk { --bk-ink: #1E293B; }
.bk-svg { width: 100%; height: auto; display: block; border-radius: 16px; background: #E9EEF7; box-shadow: inset 0 0 0 1px rgba(6,18,51,.06); }
.bk-item, .bk-beaker { cursor: pointer; transition: filter .2s; outline: none; }
.bk-item:hover, .bk-item:focus-visible { filter: brightness(1.04) drop-shadow(0 4px 8px rgba(6,18,51,.22)); }
.bk-item:focus-visible .bk-hit, .bk-beaker:focus-visible .bk-hit { stroke: #8B3DFF; stroke-width: 3; stroke-dasharray: 6 4; }
.bk-item.sel { filter: drop-shadow(0 0 10px rgba(139,61,255,.65)); }
.bk-name { font: 600 13px var(--font-body); fill: #1E293B; }
.bk-formula { font: 700 14px var(--font-display); fill: #1E3A8A; }
.bk-temp { font: 700 12px var(--font-body); fill: #B42318; }
.bk-tag { font: 700 13px var(--font-display); fill: #1E293B; }
.bk-big { font: 800 22px var(--font-display); fill: #B42318; }
.bk-under { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.bk-shelf { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
.bk-pick { min-height: 76px; border-radius: 14px; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 6px 4px; font: 600 .78rem/1.15 var(--font-body); cursor: pointer; text-align: center; transition: transform .15s, box-shadow .15s, border-color .15s; }
.bk-pick svg { width: 34px; height: 40px; }
.bk-pick[aria-pressed="true"] { border-color: #8B3DFF; box-shadow: 0 0 0 3px rgba(139,61,255,.28); transform: translateY(-2px); }
.bk-pick.used { opacity: .45; }
.bk-obs-row { display: flex; flex-wrap: wrap; gap: 6px; }
.bk-obs { border-radius: 999px; padding: 4px 12px; font-weight: 700; font-size: .86rem; background: var(--surface); border: 1.5px dashed var(--line); color: var(--ink-2); transition: all .3s; }
.bk-obs.on { background: var(--good); border: 1.5px solid var(--good); color: #fff; transform: scale(1.04); }
:root[data-theme="dark"] .bk-obs.on { color: #08201D; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .bk-obs.on { color: #08201D; } }
.bk-obs.on.none { background: var(--ink-2); border-color: var(--ink-2); }
.bk-result { background: var(--surface); border-radius: 14px; padding: 10px 14px; border: 1px solid var(--line); min-height: 52px; display: flex; flex-direction: column; gap: 8px; }
.bk-result p { margin: 0; }
.bk-res + .bk-res { border-top: 1px dashed var(--line); padding-top: 8px; }
.bk-result .eq { font-size: 1.05rem; overflow-x: auto; white-space: nowrap; padding-bottom: 2px; }
.bk-inside { font-size: .88rem; color: var(--ink-2); }
.bk-tools { display: flex; flex-wrap: wrap; gap: 8px; }
.bk-tool { min-height: 44px; display: inline-flex; align-items: center; gap: 8px; border-radius: 12px; padding: 0 14px; font: 700 .95rem var(--font-body); border: 0; cursor: pointer; color: #1E293B; box-shadow: 0 2px 0 rgba(6,18,51,.18); transition: transform .12s, filter .12s; }
.bk-tool:hover { filter: brightness(1.05); transform: translateY(-1px); }
.bk-tool:active { transform: translateY(1px); }
.bk-tool svg { width: 22px; height: 22px; flex: none; }
.bk-tool[data-tool="lamp"] { background: linear-gradient(180deg, #FF9A4D, #FF7A1A); }
.bk-tool[data-tool="ph"] { background: linear-gradient(180deg, #A266FF, #8B3DFF); color: #fff; }
.bk-tool[data-tool="electrolysis"] { background: linear-gradient(180deg, #3B6EEA, #1D4ED8); color: #fff; }
.bk-tool[data-tool="limewater"] { background: linear-gradient(180deg, #3ED1C0, #14B8A6); }
.bk-tool[data-tool="splint"] { background: linear-gradient(180deg, #FFE070, #FFD23F); }
.bk-ph { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; }
.bk-ph-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.bk-ph-val { font: 800 1.35rem var(--font-display); color: var(--ink); }
.bk-ph-word { font-weight: 700; color: var(--ink-2); }
.bk-ph-strip { position: relative; display: grid; grid-template-columns: repeat(15, minmax(0, 1fr)); border-radius: 10px; overflow: visible; }
.bk-ph-strip span { height: 30px; display: flex; align-items: center; justify-content: center; font: 700 .72rem var(--font-body); color: #fff; text-shadow: 0 1px 1px rgba(0,0,0,.35); }
.bk-ph-strip span:first-child { border-radius: 10px 0 0 10px; }
.bk-ph-strip span:last-child { border-radius: 0 10px 10px 0; }
.bk-ph-mark { position: absolute; top: -8px; width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-top: 10px solid var(--ink); transform: translateX(-8px); transition: left .9s cubic-bezier(.3,.7,.2,1); }
.bk-ph-ends { display: flex; justify-content: space-between; font-size: .78rem; color: var(--ink-2); margin-top: 4px; }
.bk-flame { transform-origin: 670px 336px; animation: bk-flick .18s ease-in-out infinite alternate; }
@keyframes bk-flick { from { transform: scale(1, 1); } to { transform: scale(.94, 1.07); } }
@media (prefers-reduced-motion: reduce) { .bk-flame { animation: none; } .bk-pick, .bk-tool, .bk-obs, .bk-ph-mark { transition: none; } }`;

  // ---------------------------------------------------------------- small drawings
  const ICON = {
    lamp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c2 3 4 4.5 4 7a4 4 0 0 1-8 0c0-2.5 2-4 4-7z" fill="#B42318"/><path d="M12 6c1 1.6 2 2.4 2 3.6a2 2 0 0 1-4 0c0-1.2 1-2 2-3.6z" fill="#FFD23F"/><rect x="6" y="15" width="12" height="7" rx="3" fill="#1E293B"/><rect x="11" y="12" width="2" height="4" fill="#1E293B"/></svg>',
    ph: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="2" width="8" height="13" rx="2" fill="#fff"/><rect x="9.5" y="4" width="5" height="4" rx="1" fill="#22C55E"/><rect x="11" y="15" width="2" height="7" rx="1" fill="#fff"/></svg>',
    electrolysis: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="10" height="6" rx="1.5" fill="#fff"/><rect x="13" y="5" width="2" height="2" fill="#fff"/><path d="M6 9v12M11 9v12" stroke="#fff" stroke-width="2"/><circle cx="19" cy="7" r="4" fill="#FFD23F"/></svg>',
    limewater: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2h8v16a4 4 0 0 1-8 0z" fill="#fff" stroke="#1E293B" stroke-width="1.5"/><path d="M8.8 10h6.4v8a3.2 3.2 0 0 1-6.4 0z" fill="#E2E8F0"/></svg>',
    splint: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21L16 8" stroke="#8B5A2B" stroke-width="3" stroke-linecap="round"/><path d="M18 2c1.6 2.4 3 3.5 3 5.4a3 3 0 0 1-6 0C15 5.5 16.4 4.4 18 2z" fill="#FF7A1A"/></svg>',
  };
  const TOOLNAME = {
    lamp: T2('Heat it', 'गर्म करो'), ph: T2('Test pH', 'pH जाँचो'), electrolysis: T2('Pass electricity', 'बिजली प्रवाहित करो'),
    limewater: T2('Lime-water test', 'चूने के पानी से जाँच'), splint: T2('Splint test', 'तीली से जाँच'),
  };
  const OBS = { gas: T2('Gas given off', 'गैस निकली'), temp: T2('Temperature change', 'तापमान बदला'), colour: T2('Colour change', 'रंग बदला'), ppt: T2('Precipitate', 'अवक्षेप') };
  const OBSX = {
    coat: T2('A coat forms', 'परत चढ़ी'), light: T2('Light and flame', 'रोशनी और लौ'), state: T2('Change of state', 'अवस्था बदली'), smell: T2('A smell', 'गंध आई'),
    dissolve: T2('Dissolves', 'घुल गया'), nodissolve: T2('Does not dissolve', 'नहीं घुला'), glow: T2('Bulb glows', 'बल्ब जला'), pop: T2('Pop sound', '"पॉप" की आवाज़'),
    relight: T2('Splint relights', 'तीली फिर जली'), goesout: T2('Flame goes out', 'लौ बुझी'), milky: T2('Turns milky', 'दूधिया हुआ'),
  };
  function solidIcon(s, colour, ox, oy) {
    const c = colour || s.colour;
    const L1 = s.look;
    const at = (d) => `<g transform="translate(${ox} ${oy})">${d}</g>`;
    if (L1 === 'granules') return at([0, 1, 2, 3, 4].map((k) => `<path d="M${-20 + k * 9} -${6 + (k % 2) * 5}l6-5 6 3 0 6-7 3z" fill="${c}" stroke="#6B7689" stroke-width="1"/>`).join(''));
    if (L1 === 'nail') return at(`<rect x="-26" y="-12" width="52" height="7" rx="3" fill="${c}" stroke="#5E6878"/><rect x="22" y="-16" width="6" height="15" rx="2" fill="#7C889C"/>`);
    if (L1 === 'wire') return at(`<path d="M-22 -8c6-10 12 10 18 0s12 10 18 0 10 8 14 0" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`);
    if (L1 === 'ribbon') return at(`<path d="M-24 -8c8-8 16 8 24 0s16 8 24 0" fill="none" stroke="#7F8894" stroke-width="6" stroke-linecap="round"/><path d="M-24 -8c8-8 16 8 24 0s16 8 24 0" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`);
    if (L1 === 'foil') return at(`<path d="M-20 -6l8-10 10 4 8-6 10 8-4 8-12 2-10-2z" fill="${c}" stroke="#8C95A3"/><path d="M-10 -10l6 4 8-4" fill="none" stroke="#fff" stroke-width="1.5" opacity=".7"/>`);
    if (L1 === 'filings') return at(Array.from({ length: 22 }, (_, k) => `<rect x="${-22 + ((k * 13) % 44)}" y="${-4 - ((k * 7) % 9)}" width="3" height="1.6" fill="${c}" transform="rotate(${(k * 37) % 180} ${-22 + ((k * 13) % 44)} ${-4 - ((k * 7) % 9)})"/>`).join(''));
    if (L1 === 'crystals') return at([0, 1, 2, 3].map((k) => `<path d="M${-22 + k * 12} -4l5-9 5 9-5 4z" fill="${c}" stroke="rgba(6,18,51,.35)"/>`).join(''));
    if (L1 === 'lumps') return at([0, 1, 2].map((k) => `<rect x="${-22 + k * 15}" y="-${14 + (k % 2) * 4}" width="13" height="12" rx="4" fill="${c}" stroke="#B5BDCA"/>`).join(''));
    if (L1 === 'cubes') return at([0, 1, 2].map((k) => `<rect x="${-22 + k * 15}" y="-${16 + (k % 2) * 3}" width="13" height="13" rx="2" fill="${c}" stroke="#9CC3EE"/><path d="M${-19 + k * 15} -${13 + (k % 2) * 3}h5" stroke="#fff" stroke-width="2"/>`).join(''));
    if (L1 === 'slice') return at(`<ellipse cx="0" cy="-8" rx="22" ry="8" fill="${c}" stroke="#C9A85C"/><ellipse cx="0" cy="-9" rx="17" ry="5" fill="${mixHex(c, '#FFFFFF', 0.3)}"/>`);
    if (L1 === 'block') return at(`<rect x="-16" y="-20" width="32" height="18" rx="3" fill="${c}" stroke="#D3C59E"/>`);
    if (L1 === 'tablets') return at([0, 1, 2].map((k) => `<ellipse cx="${-14 + k * 14}" cy="-6" rx="6" ry="3" fill="${c}" stroke="#C9CED8"/>`).join(''));
    return at(`<path d="M-22 -2c8-14 36-14 44 0z" fill="${c}" stroke="rgba(6,18,51,.2)"/>`);
  }

  // ---------------------------------------------------------------- the view
  function beaker(root, cfg, api) {
    cfg = Object.assign({ start: [], tools: [] }, cfg);
    const items = cfg.items;
    const tools = cfg.tools || [];
    const has2 = (t) => tools.includes(t);
    const M = newModel();
    const LIFT = has2('lamp') ? 72 : 0;
    const TOP = LIFT ? (has2('electrolysis') ? 16 : 30) : has2('electrolysis') ? 76 : 96;
    const S = { picked: null, narrow: false, results: [], view: null, flame: 0, ph: null, splint: null, lime: 0, probe: 0, elecT: 0 };
    let busy = false, idleStop = null, ro = null, stops = [];
    const n = items.length;
    const gap = Math.min(96, 540 / n);
    const pos = Object.fromEntries(items.map((id, i) => [id, 34 + i * gap + (gap - 72) / 2]));
    const bg = api.asset ? api.asset('beaker-bench') : null;

    root.innerHTML = `<div class="bk">
        <svg class="bk-svg" role="group" aria-label="${esc(api.t(T2('Lab bench', 'लैब की मेज़')))}"></svg>
        <div class="bk-shelf" hidden></div>
        <div class="bk-under">
          <div class="bk-obs-row" aria-label="${esc(api.t(T2('What you observe', 'तुमने क्या देखा')))}"></div>
          <div class="bk-result" aria-live="polite"></div>
          ${has2('ph') ? '<div class="bk-ph"></div>' : ''}
          <div class="bk-tools">${tools.map((t) => `<button type="button" class="bk-tool" data-tool="${t}" data-key="tool:${t}">${ICON[t]}<span>${esc(api.t(TOOLNAME[t]))}</span></button>`).join('')}<button type="button" class="ghost" data-key="clean">${esc(api.t(T2('Clean the beaker', 'बीकर साफ़ करो')))}</button></div>
        </div>
      </div>`;
    const svg = root.querySelector('svg');
    const shelf = root.querySelector('.bk-shelf');

    const label = (s) => s.label || s.formula;
    const bottleBody = (s, id) => {
      if (s.kind === 'liquid') {
        const f = label(s);
        const fsz = f.length > 9 ? 10 : f.length > 6 ? 12 : 14;
        return `<rect x="6" y="-118" width="60" height="118" rx="12" fill="url(#bk-glass)" stroke="#8FA3BF" stroke-width="2"/>
          <rect x="9" y="-84" width="54" height="81" rx="9" fill="${s.colour}" opacity=".92"/>
          <rect x="12" y="-80" width="8" height="70" rx="4" fill="#fff" opacity=".45"/>
          <rect x="24" y="-136" width="24" height="20" rx="3" fill="url(#bk-glass)" stroke="#8FA3BF" stroke-width="2"/>
          <rect x="21" y="-148" width="30" height="14" rx="4" fill="${s.ind ? '#6D28D9' : s.ion && s.ion[0] === 'H' ? '#B42318' : s.ion && s.ion[1] === 'OH' ? '#1D4ED8' : '#1E3A8A'}"/>
          <rect x="11" y="-70" width="50" height="30" rx="5" fill="#FFFDF7" stroke="#D8CFB8"/>
          <text x="36" y="-50" text-anchor="middle" class="bk-formula" style="font-size:${fsz}px">${fsub(f)}</text>`;
      }
      return `<ellipse cx="36" cy="-8" rx="32" ry="9" fill="#EEF3FA" stroke="#8FA3BF" stroke-width="2"/>${solidIcon(s, null, 36, -2)}
          <rect x="6" y="-64" width="60" height="26" rx="6" fill="#FFFDF7" stroke="#D8CFB8"/>
          <text x="36" y="-46" text-anchor="middle" class="bk-formula" style="font-size:${label(s).length > 7 ? 11 : 14}px">${fsub(label(s))}</text>`;
    };
    const inBeaker = (id) => M.entries.some((e) => e.id === id && e.state === 'solid') && SUB[id].kind === 'solid';
    const bottle = (id) => {
      const s = SUB[id];
      if (s.kind === 'solid' && M.added.includes(id) && M.entries.some((e) => e.id === id)) return '';
      const x = pos[id];
      const nm = api.t(s.name).split(' ');
      const lines = [];
      nm.forEach((w) => { const l = lines[lines.length - 1]; if (l && (l + ' ' + w).length <= 13) lines[lines.length - 1] = l + ' ' + w; else lines.push(w); });
      const lab = `<text x="36" y="22" text-anchor="middle" class="bk-name">${lines.slice(0, 3).map((l, i) => `<tspan x="36" dy="${i ? 14 : 0}">${esc(l)}</tspan>`).join('')}</text>`;
      const sel = S.picked === id;
      return `<g class="bk-item ${sel ? 'sel' : ''}" data-key="pick:${id}" data-id="${id}" role="button" tabindex="0" aria-pressed="${sel}" aria-label="${esc(api.t(s.name))}" transform="translate(${x} ${380 - (sel ? 16 : 0)})">
        <rect class="bk-hit" x="-2" y="-152" width="76" height="196" rx="10" fill="transparent"/>${sel ? '<ellipse cx="36" cy="6" rx="34" ry="6" fill="#8B3DFF" opacity=".25"/>' : ''}${bottleBody(s, id)}${lab}</g>`;
    };
    function shelfHTML() {
      return items.map((id) => {
        const s = SUB[id];
        const gone = s.kind === 'solid' && M.added.includes(id) && M.entries.some((e) => e.id === id);
        const icon = s.kind === 'liquid'
          ? `<svg viewBox="0 0 34 40" aria-hidden="true"><rect x="9" y="1" width="16" height="7" rx="2" fill="${s.ind ? '#6D28D9' : '#1E3A8A'}"/><rect x="11" y="7" width="12" height="7" fill="#DCE6F2"/><rect x="3" y="13" width="28" height="26" rx="7" fill="#EEF4FB" stroke="#8FA3BF" stroke-width="1.5"/><rect x="5" y="21" width="24" height="16" rx="5" fill="${s.colour}"/></svg>`
          : `<svg viewBox="0 0 72 40" aria-hidden="true" style="width:60px"><ellipse cx="36" cy="32" rx="32" ry="7" fill="#EEF3FA" stroke="#8FA3BF" stroke-width="2"/>${solidIcon(s, null, 36, 34)}</svg>`;
        return `<button type="button" class="bk-pick ${gone ? 'used' : ''}" data-key="pick:${id}" aria-pressed="${S.picked === id}" ${gone ? 'disabled' : ''}>${icon}<span>${esc(api.t(s.name))}</span></button>`;
      }).join('');
    }

    function solidsInBeaker() {
      const sl = M.entries.filter((e) => e.state === 'solid');
      const lv = liquidLevel(M);
      return sl.map((e, i) => {
        const s = e.s, x = 626 + (i % 3) * 40, c = e.coat || s.colour;
        if (s.look === 'nail') return `<g><rect x="${x + 14}" y="232" width="10" height="132" rx="4" fill="${c}" stroke="#5E6878" transform="rotate(14 ${x + 19} 300)"/><rect x="${x + 6}" y="226" width="26" height="9" rx="3" fill="#7C889C" transform="rotate(14 ${x + 19} 300)"/></g>`;
        if (s.look === 'wire') return `<path d="M${x - 2} 360c8-30 20 20 28-12s20 24 28-8" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`;
        if (s.look === 'ribbon') return `<path d="M${x} 368c6-20 12-30 18-50s14-10 20-30" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`;
        if (e.melted) return `<ellipse cx="${x + 14}" cy="${lv ? 372 - lv - 2 : 368}" rx="26" ry="5" fill="#F5E7B5" opacity=".95"/>`;
        if (s.floats && lv) return solidIcon(s, c, x + 14, 372 - lv + 8);
        if (e.sublimed) return solidIcon(s, mixHex(c, '#D7DEE8', 0.4), x + 14, 372);
        return solidIcon(s, c, x + 14, 372);
      }).join('');
    }
    const crustSVG = () => (M.entries.some((e) => e.state === 'crust') ? M.crust.map((c, i) => [0, 1, 2, 3, 4, 5].map((k) => `<path d="M${610 + i * 9 + k * 20} 372l5-9 5 9-5 3z" fill="${c}" stroke="rgba(6,18,51,.3)"/>`).join('')).join('') : '');
    const thermoY = () => 320 - clamp(M.temp, -0.8, 3) * 50;
    function tempWord() {
      if (M.tempNote && M.temp > 1) return api.t(M.tempNote);
      if (M.temp > 2) return api.t(T2('very hot', 'बहुत गर्म'));
      if (M.temp > 0.3) return api.t(T2('warmer', 'गर्म'));
      if (M.temp < -0.3) return api.t(T2('cooler', 'ठंडा'));
      return api.t(T2('room temp.', 'सामान्य'));
    }
    function elecSVG(t) {
      const E = M.elec;
      if (!E) return '';
      const lv = liquidLevel(M), top = 372 - lv;
      const gH = E.cond ? 92 * t * (E.cond === 2 ? 1 : 0.55) : 4 * t;
      // per unit of charge: H2 and Cl2 one volume, O2 half a volume (it needs twice the electrons)
      const g1 = E.cath === 'H2' ? gH : 0, g2 = E.an === 'O2' ? gH / 2 : E.an === 'Cl2' ? gH * 0.8 : E.cond ? 0 : gH;
      const tube = (x, g, lab) => `<rect x="${x}" y="214" width="34" height="158" rx="16" fill="${mixHex(S.liqCol || WATER, '#7FB2E5', 0.35)}" opacity=".8"/>
        <rect x="${x + 2}" y="216" width="30" height="${Math.max(0, g)}" rx="14" fill="#FFFFFF" stroke="#C9D8EA" stroke-width="1"/>
        <rect x="${x}" y="214" width="34" height="158" rx="16" fill="none" stroke="#7F93B2" stroke-width="2"/>
        ${g > 6 ? `<text x="${x + 17}" y="${216 + Math.min(g, 90) / 2 + 6}" text-anchor="middle" class="bk-tag">${fsub(lab)}</text>` : ''}`;
      const dep = E.cath && E.cath !== 'H2' ? CAT[E.cath].dep : '#2A2E35';
      return `<g aria-hidden="true">
        <rect x="628" y="250" width="7" height="${120}" fill="${t > 0.3 ? dep : '#2A2E35'}"/><rect x="674" y="250" width="7" height="120" fill="#2A2E35"/>
        ${E.cath === 'H2' || !E.cath ? tube(614, g1, 'H2') : ''}${tube(660, g2, E.an === 'Cl2' ? 'Cl2' : 'O2')}
        <text x="631" y="208" text-anchor="middle" class="bk-tag" fill="#1D4ED8">−</text><text x="677" y="208" text-anchor="middle" class="bk-tag">+</text>
        <path d="M631 372v6h-24V143H586M677 372v6h54V100H617M595 100h-24v28" fill="none" stroke="#B42318" stroke-width="2.5"/>
        <rect x="520" y="128" width="66" height="30" rx="5" fill="#1E293B"/><rect x="566" y="122" width="10" height="7" rx="2" fill="#1E293B"/>
        <text x="548" y="148" text-anchor="middle" style="font:700 12px var(--font-body);fill:#FFD23F">6 V</text>
        <text x="578" y="120" text-anchor="middle" class="bk-tag" style="font-size:11px">+</text><text x="594" y="152" class="bk-tag" style="font-size:12px">−</text>
        <circle cx="606" cy="100" r="11" fill="${E.cond ? mixHex('#FFF7D6', '#FFD23F', t) : '#F1F5F9'}" stroke="#7F93B2" stroke-width="2"/>
        ${E.cond ? `<circle cx="606" cy="100" r="${16 + 10 * t * (E.cond === 2 ? 1 : 0.5)}" fill="#FFD23F" opacity="${0.35 * t}"/>` : ''}
      </g>`;
    }
    function probeSVG(t) {
      if (!S.probe) return '';
      const y = lerp(-60, 0, t);
      const lv = liquidLevel(M);
      return `<g transform="translate(0 ${y})" aria-hidden="true"><rect x="644" y="120" width="26" height="72" rx="8" fill="#1E293B"/><rect x="648" y="128" width="18" height="16" rx="3" fill="#B7F7C9"/>
        <text x="657" y="140" text-anchor="middle" style="font:700 9px var(--font-body);fill:#0F5132">${S.ph != null && t > 0.95 ? S.ph.toFixed(1) : '--'}</text>
        <rect x="654" y="192" width="6" height="160" fill="#94A3B8"/><circle cx="657" cy="352" r="5" fill="#64748B"/></g>`;
    }
    function limeSVG(t) {
      if (!has2('limewater')) return '';
      const milky = S.lime ? mixHex('#CFE6F6', '#FFFFFF', t) : '#CFE6F6';
      const rim = 182 - LIFT;
      return `<g aria-hidden="true">
        <rect x="752" y="${364}" width="40" height="16" rx="3" fill="#94A3B8"/>
        <path d="M760 250v100a12 12 0 0 0 24 0V250" fill="url(#bk-glass)" stroke="#7F93B2" stroke-width="2"/>
        <path d="M762 285v65a10 10 0 0 0 20 0V285z" fill="${milky}" opacity=".95"/>${S.lime ? '<path d="M764 300v48a8 8 0 0 0 16 0V300z" fill="#FFFFFF" opacity=".7"/>' : ''}
        ${S.view === 'lime' ? `<rect x="640" y="${rim - 10}" width="60" height="12" rx="4" fill="#8B5A2B"/><path d="M670 ${rim - 10}V${rim - 30}H772V340" fill="none" stroke="#9FB3CC" stroke-width="5" stroke-linejoin="round" opacity=".9"/>` : ''}
        <g id="bk-limeb"></g>
        <text x="772" y="244" text-anchor="middle" class="bk-name" style="font-size:11px">${esc(api.t(T2('lime water', 'चूने का पानी')))}</text></g>`;
    }
    function splintSVG(t) {
      if (S.view !== 'splint' || !S.splint) return '';
      const rim = 182 - LIFT;
      const k = Math.min(1, t * 3);
      const tx = lerp(520, 640, ease(k)), ty = lerp(rim - 90, rim - 6, ease(k));
      const sp = S.splint;
      const after = t > 0.45;
      const show = sp.show;
      let tip = '';
      const flame = (sc) => `<g transform="translate(${tx} ${ty}) scale(${sc}) translate(${-tx} ${-ty})"><path d="M${tx} ${ty - 2}c-8-6-8-16 0-26 8 10 8 20 0 26z" fill="#FF7A1A" opacity=".95"/><path d="M${tx} ${ty - 4}c-4-3-4-9 0-14 4 5 4 11 0 14z" fill="#FFD23F"/></g>`;
      if (!after) tip = sp.splint === 'glow' ? `<circle cx="${tx}" cy="${ty}" r="5" fill="#FF5A1F"/><circle cx="${tx}" cy="${ty}" r="9" fill="#FF7A1A" opacity=".35"/>` : flame(1);
      else if (show === 'pop') tip = `<path d="M${tx} ${ty - 30}l6 14 14-6-8 14 14 6-15 3 2 15-11-10-11 10 2-15-15-3 14-6-8-14 14 6z" fill="#FFD23F" stroke="#FF7A1A" stroke-width="2" opacity="${1 - (t - 0.45)}"/><text x="${tx + 30}" y="${ty - 30}" class="bk-big">${esc(api.t(T2('POP!', 'पॉप!')))}</text>`;
      else if (show === 'relight') tip = flame(1.9) + `<circle cx="${tx}" cy="${ty - 14}" r="26" fill="#FFD23F" opacity=".25"/>`;
      else if (show === 'burn') tip = flame(1.1);
      else tip = `<path d="M${tx} ${ty - 4}c-6-10 6-14 0-26" fill="none" stroke="#94A3B8" stroke-width="3" stroke-linecap="round" opacity=".8"/><circle cx="${tx}" cy="${ty}" r="3" fill="#3F3F46"/>`;
      return `<g aria-hidden="true"><path d="M${tx - 70} ${ty - 70}L${tx} ${ty}" stroke="#8B5A2B" stroke-width="6" stroke-linecap="round"/>${tip}</g>`;
    }
    function lampSVG() {
      if (!LIFT) return '';
      return `<g aria-hidden="true">
        <path d="M600 312L584 380M740 312L756 380M670 312V318" stroke="#475569" stroke-width="5" stroke-linecap="round"/>
        <rect x="586" y="306" width="168" height="7" rx="2" fill="#94A3B8"/><path d="M590 309.5h160" stroke="#CBD5E1" stroke-width="1" stroke-dasharray="3 3"/>
        <g id="bk-flame" opacity="${S.flame}"><g class="bk-flame"><path d="M670 337c-11-7-11-19 0-29 11 10 11 22 0 29z" fill="#3B82F6" opacity=".5"/><path d="M670 336c-7-5-7-14 0-22 7 8 7 17 0 22z" fill="#FF7A1A"/><path d="M670 335c-3-3-3-8 0-12 3 4 3 9 0 12z" fill="#FFD23F"/></g></g>
        <rect x="666" y="336" width="8" height="10" rx="2" fill="#E2E8F0"/><path d="M646 380c-6 0-8-4-6-10l8-22c2-4 4-4 8-4h28c4 0 6 0 8 4l8 22c2 6 0 10-6 10z" fill="url(#bk-lampg)" stroke="#7F93B2" stroke-width="2"/>
        <path d="M652 358h36" stroke="#fff" stroke-width="3" opacity=".5" stroke-linecap="round"/>
        <text x="670" y="398" text-anchor="middle" class="bk-name" style="font-size:11px">${esc(api.t(T2('spirit lamp', 'स्पिरिट लैंप')))}</text></g>`;
    }

    function draw() {
      S.narrow = (root.clientWidth || 800) < 620;
      const lv = liquidLevel(M), top = 372 - lv, ol = oilLevel(M);
      S.liqCol = liquidColour(M) || WATER;
      const ppt = M.ppt.length ? M.ppt[M.ppt.length - 1].c : null;
      const pptH = Math.min(26, M.ppt.length * 14);
      const vb = S.narrow ? `440 ${TOP} 360 ${412 - TOP}` : `0 ${TOP} 800 ${470 - TOP}`;
      svg.setAttribute('viewBox', vb);
      svg.innerHTML = `
        <defs>
          <linearGradient id="bk-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EEF2FA"/><stop offset="1" stop-color="#D6DEEC"/></linearGradient>
          <linearGradient id="bk-bench" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7F2E8"/><stop offset="1" stop-color="#E3D6BE"/></linearGradient>
          <linearGradient id="bk-glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".85"/><stop offset=".5" stop-color="#EAF3FD" stop-opacity=".55"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".8"/></linearGradient>
          <linearGradient id="bk-lampg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#DCEBFA"/><stop offset=".5" stop-color="#F8FBFF"/><stop offset="1" stop-color="#C9DAEE"/></linearGradient>
          <radialGradient id="bk-light"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".95"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
          <clipPath id="bk-clip"><path d="M602 196h136v168a10 10 0 0 1-10 10H612a10 10 0 0 1-10-10z"/></clipPath>
          <pattern id="bk-tiles" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#C9D3E4" stroke-width="1"/></pattern>
        </defs>
        <rect y="0" width="800" height="470" fill="url(#bk-wall)"/><rect y="0" width="800" height="378" fill="url(#bk-tiles)" opacity=".7"/>
        ${bg ? `<image href="${esc(bg)}" x="0" y="0" width="800" height="378" preserveAspectRatio="xMidYMid slice" opacity=".22"/>` : ''}
        <rect x="0" y="380" width="800" height="90" fill="url(#bk-bench)"/><rect x="0" y="378" width="800" height="5" fill="#CDBB98"/>
        ${lampSVG()}
        ${limeSVG(S.lime ? 1 : 0)}
        <g transform="translate(0 ${-LIFT})">
          <g data-key="beaker" class="bk-beaker" role="button" tabindex="0" aria-label="${esc(api.t(T2('Beaker: tap to pour in what you picked', 'बीकर: जो उठाया है उसे डालने के लिए टैप करो')))}">
            <rect class="bk-hit" x="584" y="168" width="172" height="216" rx="12" fill="transparent"/>
            <g clip-path="url(#bk-clip)">
              <rect id="bk-liquid" x="600" y="${top}" width="140" height="${lv + 4}" fill="${S.liqCol}" opacity="${lv ? 0.9 : 0}"/>
              <rect id="bk-oil" x="600" y="${top}" width="140" height="${ol}" fill="#F2C94C" opacity="${ol ? 0.85 : 0}"/>
              <rect id="bk-surface" x="600" y="${top - 2}" width="140" height="4" fill="#fff" opacity="${lv ? 0.6 : 0}"/>
              <rect id="bk-ppt" x="600" y="${374 - pptH}" width="140" height="${pptH}" fill="${ppt || 'transparent'}"/>
              <g id="bk-parts"></g>
              ${crustSVG()}
              ${solidsInBeaker()}
              <ellipse id="bk-foam" cx="670" cy="${top - 4}" rx="68" ry="0" fill="#FFFFFF" opacity="0"/>
              <g id="bk-bubbles"></g>
              ${M.subl ? `<rect x="600" y="196" width="140" height="10" fill="${M.subl}" opacity=".85"/>` : ''}
              ${M.drops ? [0, 1, 2, 3, 4].map((k) => `<ellipse cx="${606 + k * 30}" cy="${204 + (k % 2) * 8}" rx="2.5" ry="3.5" fill="#BFD9F2"/>`).join('') : ''}
            </g>
            ${elecSVG(S.elecT)}
            <path d="M596 182h148M600 186v178a14 14 0 0 0 14 14h112a14 14 0 0 0 14-14V186" fill="url(#bk-glass)" fill-opacity=".25" stroke="#7F93B2" stroke-width="3" stroke-linecap="round"/>
            <path d="M610 200v150" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" opacity=".55"/>
            ${[0, 1, 2, 3].map((k) => `<path d="M${M.elec ? 600 : 726} ${352 - k * 36}h12" stroke="#7F93B2" stroke-width="2"/>`).join('')}
            ${M.elec ? '' : `<g aria-hidden="true"><rect x="716" y="150" width="12" height="214" rx="6" fill="#FFFFFF" stroke="#7F93B2" stroke-width="2" opacity=".95"/>
              <rect id="bk-merc" x="719.5" y="${thermoY()}" width="5" height="${364 - thermoY()}" fill="#E5484D"/><circle cx="722" cy="364" r="9" fill="#E5484D" stroke="#7F93B2" stroke-width="2"/></g>
              <text x="744" y="142" text-anchor="end" class="bk-temp" id="bk-templbl">${esc(tempWord())}</text>`}
            <g id="bk-steam" opacity="${M.steam && M.temp > 1 ? 0.9 : 0}">${[0, 1, 2].map((k) => `<path d="M${632 + k * 32} 168c-10-14 10-20 0-36" fill="none" stroke="#B9C6D8" stroke-width="5" stroke-linecap="round"/>`).join('')}</g>
            <g id="bk-fume" opacity="${M.fume ? 0.75 : 0}">${[0, 1, 2, 3].map((k) => `<ellipse cx="${630 + k * 26}" cy="${168 - (k % 2) * 14}" rx="22" ry="12" fill="${M.fume || '#fff'}"/>`).join('')}</g>
            <circle id="bk-flash" cx="670" cy="300" r="120" fill="url(#bk-light)" opacity="0"/>
            ${probeSVG(S.probe)}
          </g>
        </g>
        ${splintSVG(S.splintT || 0)}
        <line id="bk-stream" x1="0" y1="0" x2="0" y2="0" stroke="#9CC3EE" stroke-width="7" stroke-linecap="round" opacity="0"/>
        ${S.narrow ? '' : items.map(bottle).join('')}
        <g id="bk-pourer"></g>`;
      shelf.hidden = !S.narrow;
      if (S.narrow) shelf.innerHTML = shelfHTML(); else shelf.innerHTML = '';
      drawUnder();
    }
    function drawUnder() {
      const lit = new Set(S.results.flatMap((r) => r.obs || []));
      const none = S.results.length && S.results.every((r) => r.none);
      root.querySelector('.bk-obs-row').innerHTML = Object.keys(OBS).map((k) => `<span class="bk-obs ${lit.has(k) ? 'on' : ''}">${esc(api.t(OBS[k]))}</span>`).join('')
        + Object.keys(OBSX).filter((k) => lit.has(k)).map((k) => `<span class="bk-obs on">${esc(api.t(OBSX[k]))}</span>`).join('')
        + (none ? `<span class="bk-obs on none">${esc(api.t(T2('No change', 'कोई बदलाव नहीं')))}</span>` : '');
      const inside = M.entries.filter((e) => e.state !== 'gone').map((e) => api.t(e.state === 'crust' ? crustName(e) : nameOf(e)));
      if (M.water > 0.01 && !M.entries.some((e) => e.id === 'water')) inside.push(api.t(T2('Water', 'पानी')));
      root.querySelector('.bk-result').innerHTML = (S.results.length
        ? S.results.map((r) => `<div class="bk-res">${r.eq ? `<div class="eq">${eqHTML(eqLang(r.eq, api.lang ? api.lang() : 'en'))}</div>` : ''}<p>${esc(api.t(r.note))}</p></div>`).join('')
        : `<p class="muted">${esc(api.t(M.entries.length ? T2('Pick something and tap the beaker to add it.', 'कुछ उठाओ और डालने के लिए बीकर पर टैप करो।') : T2('The beaker is empty. Pick something and tap the beaker.', 'बीकर ख़ाली है। कुछ उठाओ और बीकर पर टैप करो।')))}</p>`)
        + (inside.length ? `<p class="bk-inside">${esc(api.t(T2('In the beaker: ', 'बीकर में: ')))}${esc(inside.join(', '))}</p>` : '');
      const ph = root.querySelector('.bk-ph');
      if (ph) {
        const v = S.ph;
        ph.innerHTML = `<div class="bk-ph-top"><span class="bk-ph-val">pH ${v == null ? '--' : v.toFixed(1)}</span><span class="bk-ph-word">${v == null ? esc(api.t(T2('Tap Test pH to dip the meter in.', 'pH जाँचो दबाकर मीटर डुबाओ।'))) : esc(api.t(phWord(v)))}</span></div>
          <div class="bk-ph-strip" role="img" aria-label="${esc(api.t(T2('Universal indicator colours from pH 0 to 14', 'pH 0 से 14 तक सार्वत्रिक सूचक के रंग')))}">${UNI.map((c, i) => `<span style="background:${c}">${i}</span>`).join('')}${v == null ? '' : `<i class="bk-ph-mark" style="left:${((v + 0.5) / 15) * 100}%"></i>`}</div>
          <div class="bk-ph-ends"><span>${esc(api.t(T2('acid', 'अम्ल')))}</span><span>${esc(api.t(T2('neutral 7', 'उदासीन 7')))}</span><span>${esc(api.t(T2('base', 'क्षार')))}</span></div>`;
      }
    }

    // bubbles
    const bubbles = [];
    function bubbleFrame(rate) {
      const g = svg.querySelector('#bk-bubbles');
      if (!g) return;
      const top = 372 - liquidLevel(M);
      if (!liquidLevel(M)) { g.innerHTML = ''; return; }
      const E = M.elec;
      if (Math.random() < rate * 0.6 && bubbles.length < 70) {
        const rods = E && E.cond ? [E.cath === 'H2' ? 631 : null, E.an !== 'I2' ? 677 : null].filter(Boolean) : null;
        if (rods && !rods.length) return;
        const x = rods ? rods[Math.random() < 0.6 ? 0 : rods.length - 1] + (Math.random() - 0.5) * 8 : 612 + Math.random() * 116;
        bubbles.push({ x, y: E ? 330 : 368, r: 1.5 + Math.random() * 3, v: 0.8 + Math.random() * 1.6 });
      }
      for (const b of bubbles) { b.y -= b.v * (1 + rate * 0.4); b.x += Math.sin(b.y / 9) * 0.4; }
      for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].y < (E ? 222 : top)) bubbles.splice(i, 1);
      g.innerHTML = bubbles.map((b) => `<circle cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" r="${b.r.toFixed(1)}" fill="#FFFFFF" fill-opacity=".55" stroke="#FFFFFF" stroke-width="1"/>`).join('');
    }
    function idle() {
      if (idleStop) idleStop();
      idleStop = null;
      if (reduced() || !M.rate || !liquidLevel(M)) return;
      let on = true;
      const f = () => { if (!on) return; bubbleFrame(M.rate); requestAnimationFrame(f); };
      requestAnimationFrame(f);
      idleStop = () => { on = false; };
    }
    const run = (ms, step, done) => { const s = tween(ms, step, () => { stops = stops.filter((x) => x !== s); done && done(); }); stops.push(s); return s; };

    // Animate the change from the snapshot before to the model now, showing every effect in the results.
    function animateResults(out, before, done) {
      const eff = { gas: 0, foam: 0, steam: 0, ppt: null, light: null };
      out.forEach((r) => { eff.gas = Math.max(eff.gas, r.gas || 0); eff.foam = Math.max(eff.foam, r.foam || 0); if (r.steam) eff.steam = 1; if (r.ppt) eff.ppt = r.ppt; if (r.light) eff.light = r.light; });
      const after = { col: liquidColour(M) || WATER, lv: liquidLevel(M), temp: M.temp };
      M.temp = before.temp;
      draw();
      const liq = svg.querySelector('#bk-liquid'), merc = svg.querySelector('#bk-merc'), tl = svg.querySelector('#bk-templbl'), foam = svg.querySelector('#bk-foam'), flash = svg.querySelector('#bk-flash'), parts = svg.querySelector('#bk-parts'), steam = svg.querySelector('#bk-steam');
      busy = true;
      const changed = out.some((r) => !r.none) || before.lv !== after.lv;
      run(changed ? 3000 : 900, (t) => {
        const e = ease(t);
        M.temp = before.temp + (after.temp - before.temp) * e;
        if (liq) { liq.setAttribute('fill', mixHex(before.col, after.col, e)); const l = lerp(before.lv, after.lv, e); liq.setAttribute('y', 372 - l); liq.setAttribute('height', l + 4); liq.setAttribute('opacity', l > 0.5 ? 0.9 : 0); }
        if (merc) { merc.setAttribute('y', thermoY()); merc.setAttribute('height', 364 - thermoY()); }
        if (tl) tl.textContent = tempWord();
        if (eff.gas) bubbleFrame(eff.gas * (1 - t * 0.4));
        if (eff.foam && foam) { const f = Math.sin(Math.PI * Math.min(1, t * 1.2)) * eff.foam; foam.setAttribute('ry', Math.max(0, f) * 14); foam.setAttribute('opacity', f > 0 ? 0.85 : 0); foam.setAttribute('cy', 372 - after.lv - 4); }
        if (eff.light && flash) { flash.setAttribute('fill', eff.light === '#FFFFFF' ? 'url(#bk-light)' : eff.light); flash.setAttribute('opacity', (Math.sin(Math.PI * t) * (eff.light === '#FFFFFF' ? 1 : 0.4)).toFixed(2)); }
        if (eff.steam && steam) steam.setAttribute('opacity', (0.9 * Math.min(1, t * 2)).toFixed(2));
        if (eff.ppt && parts) parts.innerHTML = Array.from({ length: 26 }, (_, i) => `<circle cx="${606 + ((i * 37) % 130)}" cy="${372 - after.lv + 10 + ((i * 53) % 60) + e * 70}" r="2.4" fill="${eff.ppt}" opacity="${((1 - e) * 0.9).toFixed(2)}"/>`).join('');
      }, () => {
        M.temp = after.temp;
        busy = false;
        draw();
        idle();
        done && done();
      });
    }
    const snap = () => ({ col: liquidColour(M) || WATER, lv: liquidLevel(M), temp: M.temp });
    function report(out) {
      S.results = out;
      out.forEach((r) => api.record(r.none ? api.t(T2('Saw no change', 'कोई बदलाव नहीं दिखा')) : api.t(T2('Saw: ', 'देखा: ')) + (r.obs || []).map((k) => api.t(OBS[k] || OBSX[k])).join(', ')));
    }

    function pour(id) {
      const s = SUB[id];
      busy = true;
      S.picked = null;
      S.view = null; S.probe = 0; S.lime = 0;
      const before = snap();
      draw();
      let g = svg.querySelector(`[data-id="${id}"]`);
      const x0 = S.narrow ? 452 : pos[id];
      if (S.narrow) { const p = svg.querySelector('#bk-pourer'); p.innerHTML = `<g transform="translate(${x0} 380)">${bottleBody(s, id)}</g>`; g = p.firstChild; }
      const liquid = s.kind === 'liquid';
      const tx = 548, ty = 300 - LIFT;
      const stream = svg.querySelector('#bk-stream');
      api.record(api.t(T2('Added ', 'डाला: ')) + api.t(s.name));
      run(1700, (t) => {
        const a = t < 0.3 ? ease(t / 0.3) : t > 0.8 ? 1 - ease((t - 0.8) / 0.2) : 1;
        const x = lerp(x0, tx, a), y = lerp(380, ty, a);
        const rot = (t > 0.3 && t < 0.8 ? Math.sin(((t - 0.3) / 0.5) * Math.PI) : 0) * (liquid ? 100 : 70);
        if (g) g.setAttribute('transform', `translate(${x} ${y}) rotate(${rot} 36 -130)`);
        if (t > 0.38 && t < 0.72) {
          if (liquid) {
            const lvNow = lerp(before.lv, Math.min(150, before.lv + 36), (t - 0.38) / 0.34);
            stream.setAttribute('x1', 588); stream.setAttribute('y1', 176 - LIFT); stream.setAttribute('x2', 630); stream.setAttribute('y2', 372 - LIFT - lvNow);
            stream.setAttribute('stroke', s.colour); stream.setAttribute('opacity', 0.85);
            const l = svg.querySelector('#bk-liquid');
            if (l) { l.setAttribute('y', 372 - lvNow); l.setAttribute('height', lvNow + 4); l.setAttribute('opacity', 0.9); l.setAttribute('fill', mixHex(before.col, s.ind ? s.colour : s.colour, before.lv ? 0.35 : 1)); }
          }
        } else stream.setAttribute('opacity', 0);
      }, () => {
        const out = addToBench(M, id);
        report(out);
        const pre = { col: mixHex(before.col, s.colour, before.lv ? 0.35 : 1), lv: liquid ? Math.min(150, before.lv + 36) : before.lv, temp: before.temp };
        if (!before.lv && !liquid) pre.col = WATER;
        animateResults(out, pre, () => {
          api.emit('add:' + id);
          if (out.length) api.emit('reacted');
        });
      });
    }
    function useTool(t) {
      if (t === 'lamp') {
        if (!M.entries.length && !M.water) { api.toast(T2('Put something in the beaker first.', 'पहले बीकर में कुछ डालो।')); return; }
        S.view = null; S.probe = 0; S.lime = 0;
        const before = snap();
        const out = heat(M);
        report(out);
        S.flame = 1;
        api.record(api.t(T2('Heated the beaker', 'बीकर गर्म किया')));
        animateResults(out, before, () => {
          S.flame = 0; draw();
          api.emit('heated');
          api.emit('tested:lamp');
          if (out.some((r) => !r.none) || out.length) api.emit('reacted');
        });
      } else if (t === 'ph') {
        const p = phOf(M);
        if (p == null) { api.toast(T2('The pH meter needs a liquid in the beaker.', 'pH मीटर के लिए बीकर में द्रव चाहिए।')); return; }
        S.view = 'probe'; S.ph = p; busy = true;
        S.results = [R([], T2(`The meter reads pH ${p.toFixed(1)}: ${phWord(p).en}. On the universal indicator chart that is ${COLW[IND.uni(p)[1]].en}.`, `मीटर pH ${p.toFixed(1)} दिखाता है: ${phWord(p).hi}। सार्वत्रिक सूचक चार्ट पर यह ${COLW[IND.uni(p)[1]].hi} है।`))];
        api.record(api.t(T2('Measured pH ', 'pH मापा: ')) + p.toFixed(1));
        run(1100, (k) => { S.probe = ease(k); draw(); }, () => { busy = false; S.probe = 1; draw(); api.emit('tested:ph'); api.emit('ph:' + Math.round(p)); });
      } else if (t === 'electrolysis') {
        const before = snap();
        const r = electrolyse(M);
        if (!r) { api.toast(T2('Electrolysis needs a watery liquid in the beaker.', 'विद्युत-अपघटन के लिए बीकर में पानी वाला द्रव चाहिए।')); return; }
        S.view = 'elec'; S.probe = 0; S.lime = 0; S.results = [r]; busy = true;
        report([r]);
        const cond = M.elec.cond;
        const after = snap();
        run(4200, (k) => { S.elecT = ease(k); draw(); const l = svg.querySelector('#bk-liquid'); if (l) l.setAttribute('fill', mixHex(before.col, after.col, ease(k))); if (cond) bubbleFrame(cond * 1.2); }, () => { busy = false; S.elecT = 1; M.rate = cond ? 0.5 : 0; draw(); idle(); api.emit('tested:electrolysis'); if (!r.none) api.emit('reacted'); });
      } else if (t === 'limewater') {
        const r = limeTest(M);
        S.view = 'lime'; S.probe = 0; S.results = [r]; busy = true; S.lime = 0;
        report([r]);
        run(2600, (k) => {
          draw();
          const g = svg.querySelector('#bk-limeb');
          if (g && M.gas && M.gas.type) g.innerHTML = Array.from({ length: 6 }, (_, i) => `<circle cx="${768 + ((i * 7) % 10)}" cy="${350 - ((k * 140 + i * 23) % 60)}" r="2.5" fill="#fff" stroke="#9FB3CC"/>`).join('');
          if (r.milky) { const p = svg.querySelector('path[d^="M762 285"]'); if (p) p.setAttribute('fill', mixHex('#CFE6F6', '#FFFFFF', ease(k))); }
        }, () => { busy = false; S.lime = r.milky ? 1 : 0; draw(); api.emit('tested:limewater'); });
      } else if (t === 'splint') {
        const r = splintTest(M);
        S.view = 'splint'; S.splint = r; S.probe = 0; S.results = [r]; busy = true;
        report([r]);
        if (r.show === 'pop') api.speak(api.t(T2('Pop!', 'पॉप!')));
        run(2400, (k) => { S.splintT = k; draw(); }, () => { busy = false; S.splintT = 1; draw(); api.emit('tested:splint'); });
      }
    }

    function onClick(e) {
      const el = e.target.closest('[data-key]');
      if (!el || busy || el.disabled) return;
      const key = el.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key.startsWith('pick:')) {
        const id = key.slice(5);
        S.picked = S.picked === id ? null : id;
        draw();
        if (S.picked) { api.emit('pick:' + id); api.speak(api.t(SUB[id].name)); }
        const again = root.querySelector(`[data-key="${key}"]`);
        if (again && S.narrow) again.focus();
      } else if (key === 'beaker') {
        if (!S.picked) { api.toast(T2('Pick something from the bench first.', 'पहले मेज़ से कुछ उठाओ।')); return; }
        const s = SUB[S.picked];
        if (s.kind === 'liquid' && M.entries.some((x) => x.id === S.picked && x.state === 'liq')) { api.toast(T2('That is already in the beaker.', 'यह पहले से बीकर में है।')); return; }
        if (s.kind === 'solid' && M.entries.some((x) => x.id === S.picked)) { api.toast(T2('That is already in the beaker.', 'यह पहले से बीकर में है।')); return; }
        if (M.added.length >= 4 || liquidLevel(M) >= 150 && s.kind === 'liquid') { api.toast(T2('The beaker is full. Clean it first.', 'बीकर भर गया है। पहले इसे साफ़ करो।')); return; }
        if (s.ind && M.entries.some((x) => x.s.ind)) { api.toast(T2('One indicator at a time: clean the beaker first.', 'एक बार में एक ही सूचक: पहले बीकर साफ़ करो।')); return; }
        pour(S.picked);
      } else if (key.startsWith('tool:')) {
        useTool(key.slice(5));
      } else if (key === 'clean') {
        Object.assign(M, newModel());
        Object.assign(S, { picked: null, results: [], view: null, flame: 0, ph: null, splint: null, lime: 0, probe: 0, elecT: 0 });
        bubbles.length = 0;
        if (idleStop) idleStop();
        draw();
        api.emit('clean');
        api.record(api.t(T2('Cleaned the beaker', 'बीकर साफ़ किया')));
      }
    }
    function onKey(e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('g[data-key]')) { e.preventDefault(); e.target.closest('[data-key]').dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    }
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    (cfg.start || []).forEach((id) => { if (!M.entries.some((e) => e.id === id)) { M.entries.push(mkEntry(id)); } });
    if ((cfg.start || []).length) { M.added = []; settle(M, true); M.temp = 0; M.rate = 0; M.steam = 0; S.results = []; }
    draw();
    let lastNarrow = S.narrow;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => { const nw = (root.clientWidth || 800) < 620; if (nw !== lastNarrow && !busy) { lastNarrow = nw; draw(); } }); ro.observe(root); }
    return { destroy() { if (idleStop) idleStop(); stops.forEach((s) => s()); if (ro) ro.disconnect(); root.removeEventListener('click', onClick); root.removeEventListener('keydown', onKey); } };
  }

  NCA_T.register({
    id: 'beaker',
    css: CSS,
    validate(c) {
      const e = [];
      if (!c || typeof c !== 'object') return ['config must be an object'];
      Object.keys(c).forEach((k) => { if (!['items', 'start', 'tools'].includes(k)) e.push('unknown key: ' + k); });
      const ok = (id, where) => { if (!SUB[id]) e.push(`unknown substance${where}: ${id}`); else if (SUB[id].prod) e.push(`${id} is only made in reactions; it cannot be put on the bench${where}`); };
      if (!Array.isArray(c.items) || c.items.length < 1 || c.items.length > 6) e.push('items: 1 to 6 substance ids');
      else { c.items.forEach((id) => ok(id, '')); if (new Set(c.items).size !== c.items.length) e.push('items: each substance once'); }
      if (c.start != null) {
        if (!Array.isArray(c.start)) e.push('start: an array of substance ids');
        else {
          if (c.start.length > 4) e.push('start: at most 4 substances (the beaker holds 4)');
          c.start.forEach((id) => ok(id, ' in start'));
          if (new Set(c.start).size !== c.start.length) e.push('start: each substance once');
          if (c.start.filter((id) => SUB[id] && SUB[id].ind).length > 1) e.push('start: one indicator at a time');
        }
      }
      if (c.tools != null) {
        if (!Array.isArray(c.tools)) e.push('tools: an array');
        else { c.tools.forEach((t) => { if (!TOOLS.includes(t)) e.push('unknown tool: ' + t + ' (use ' + TOOLS.join(', ') + ')'); }); if (new Set(c.tools).size !== c.tools.length) e.push('tools: each tool once'); }
      }
      return e;
    },
    keys(c) {
      const ids = (c && Array.isArray(c.items) && c.items) || [];
      const tl = (c && Array.isArray(c.tools) && c.tools) || [];
      const ev = ids.map((id) => 'pick:' + id).concat(ids.map((id) => 'add:' + id), ['reacted', 'clean']);
      if (tl.includes('lamp')) ev.push('heated');
      tl.forEach((t) => ev.push('tested:' + t));
      if (tl.includes('ph')) ev.push('ph:*');
      return { targets: ids.map((id) => 'pick:' + id).concat(['beaker', 'clean'], tl.map((t) => 'tool:' + t)), events: ev };
    },
    demo: { items: ['zinc', 'hcl', 'soda', 'vinegar', 'naoh', 'universal'], start: ['water', 'universal'], tools: ['lamp', 'ph', 'limewater', 'splint', 'electrolysis'] },
    substances: Object.keys(SUB).filter((k) => !SUB[k].prod),
    tools: TOOLS,
    // The pure bench model, for tests under Node.
    model: { SUB, newModel, addToBench, heat, electrolyse, splintTest, limeTest, phOf, liquidColour, balance, parseF, saltF },
    mount(root, config, api) { return beaker(root, config, api); },
  });
})();
