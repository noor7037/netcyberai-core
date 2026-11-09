// Template: Genetics cross. Cross plants and people, fill Punnett squares, count ratios, then see DNA copy itself and
// build a protein. The genetics is computed, not scripted: gametes are made allele by allele, the square is filled by
// combining them, phenotypes follow the dominance rule of the mode (complete, incomplete, ABO co-dominance, X/Y sex),
// and random offspring are drawn from the same square, so counts approach the exact Mendelian ratios.
// Modes: monohybrid, dihybrid, test-cross, incomplete-dominance, blood-groups, sex, dna, pedigree.
// Config: { mode, trait?: 'height'|'seed-shape'|'seed-colour'|'flower-colour', parents?: [genotype, genotype] }
//   monohybrid/test-cross/dihybrid: trait picks the pea character(s); genotypes like 'Tt', 'RrYy' (dihybrid pairs
//     seed-shape with seed-colour, and height with flower-colour). test-cross: parents[0] is the unknown tall plant
//     (its real genotype, hidden from the child), parents[1] must be the dwarf tester 'tt'.
//   incomplete-dominance: 'RR' red, 'Rr' pink, 'rr' white snapdragon. blood-groups: 'IAIB', 'IAi', 'ii', or 'AB', 'AO'.
//   sex: ['XX','XY']. pedigree: 'AA'|'Aa'|'aa' (a is the recessive trait). dna: parents[0] is the template strand,
//     3'->5', starting TAC, 6 to 12 bases, a multiple of 3.
// Keys: parent:0, parent:1 (tap to change a genotype), cross, cell:<row>-<col> (0-based; row = parent 2's gamete,
//   column = parent 1's gamete; in dna the base slot; in pedigree the child), grow, answer.
(function () {
  const L = window.NCA_LIB;
  const { esc, tween } = L;
  const T2 = (en, hi) => ({ en, hi });
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const MODES = ['monohybrid', 'dihybrid', 'test-cross', 'incomplete-dominance', 'blood-groups', 'sex', 'dna', 'pedigree'];

  // ---------------------------------------------------------------- Mendel's pea characters (dominant / recessive)
  const TR = {
    height: { g: 'T', name: T2('Plant height', 'पौधे की ऊँचाई'), dom: T2('Tall', 'लंबा'), rec: T2('Dwarf', 'बौना') },
    'seed-shape': { g: 'R', name: T2('Seed shape', 'बीज का आकार'), dom: T2('Round', 'गोल'), rec: T2('Wrinkled', 'झुर्रीदार') },
    'seed-colour': { g: 'Y', name: T2('Seed colour', 'बीज का रंग'), dom: T2('Yellow', 'पीला'), rec: T2('Green', 'हरा') },
    'flower-colour': { g: 'P', name: T2('Flower colour', 'फूल का रंग'), dom: T2('Purple', 'बैंगनी'), rec: T2('White', 'सफ़ेद') },
  };
  const TRAITS = Object.keys(TR);
  const PAIR = { 'seed-shape': ['seed-shape', 'seed-colour'], 'seed-colour': ['seed-shape', 'seed-colour'], height: ['height', 'flower-colour'], 'flower-colour': ['height', 'flower-colour'] };
  const PH_BG = ['#DCFCE7', '#FEF3C7', '#DBEAFE', '#FCE7F3'];
  const PH_FG = ['#22C55E', '#F5B90A', '#02CFF9', '#FF6B57'];
  const AL_COL = { U1: '#22C55E', L1: '#FFD23F', U2: '#02CFF9', L2: '#FF6B57', A: '#FF6B57', B: '#02CFF9', O: '#FFD23F', X: '#22C55E', Y: '#FF7A1A' };
  const isUp = (c) => c === c.toUpperCase() && c !== c.toLowerCase();
  const capWord = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // ---------------------------------------------------------------- icons (drawn in a 40 x 40 box)
  function wrinkle(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2, rr = r + (i % 2 ? -2.1 : 1.3) + Math.sin(i * 1.7) * 0.8; pts.push((cx + Math.cos(a) * rr).toFixed(1) + ',' + (cy + Math.sin(a) * rr).toFixed(1)); }
    return pts.join(' ');
  }
  function peaIcon(round, col) {
    const c = col === 'g' ? '#7BC74D' : '#F2C230', d = col === 'g' ? '#4E9A2E' : '#C99A10';
    return round
      ? `<circle cx="20" cy="21" r="14" fill="${c}" stroke="${d}" stroke-width="2"/><ellipse cx="14" cy="14" rx="5" ry="3" fill="#fff" opacity=".45" transform="rotate(-30 14 14)"/>`
      : `<polygon points="${wrinkle(20, 21, 13.5)}" fill="${c}" stroke="${d}" stroke-width="2" stroke-linejoin="round"/><path d="M12 19q4 3 8-1M18 28q5-3 9 0M23 14q3 2 5 0" fill="none" stroke="${d}" stroke-width="1.6" stroke-linecap="round"/>`;
  }
  function flowerSVG(cx, cy, r, fill, stroke) {
    let s = '';
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; s += `<ellipse cx="${(cx + Math.cos(a) * r * 0.62).toFixed(1)}" cy="${(cy + Math.sin(a) * r * 0.62).toFixed(1)}" rx="${r * 0.46}" ry="${r * 0.46}" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`; }
    return s + `<circle cx="${cx}" cy="${cy}" r="${r * 0.28}" fill="#F5B90A" stroke="#C99A10" stroke-width="1"/>`;
  }
  function plantIcon(tall, flower) {
    const top = tall ? 5 : 20, leafY = tall ? 24 : 30;
    const fl = flower ? flowerSVG(20, top + 4, 9, flower.fill, flower.stroke) : `<ellipse cx="20" cy="${top + 2}" rx="4" ry="6" fill="#22C55E"/>`;
    return `<path d="M20 38V${top + 6}" stroke="#3F8F2F" stroke-width="3" stroke-linecap="round"/><path d="M20 ${leafY}q-10 -1 -11 -9q9 0 11 9zM20 ${leafY + 4}q10 -1 11 -8q-9 0 -11 8z" fill="#4CB944" stroke="#2F7A25" stroke-width="1.2"/>${fl}<path d="M10 38h20" stroke="#8B5E34" stroke-width="3" stroke-linecap="round"/>`;
  }
  const FLOWER = { P: { fill: '#8B3DFF', stroke: '#4400F0' }, W: { fill: '#FFFFFF', stroke: '#94A3B8' }, R: { fill: '#E11D48', stroke: '#9F1239' }, K: { fill: '#F9A8D4', stroke: '#DB2777' } };
  function dropIcon(label, col) {
    return `<path d="M20 3C14 12 8 18 8 26a12 12 0 0 0 24 0C32 18 26 12 20 3z" fill="${col}" stroke="#7F1D1D" stroke-opacity=".55" stroke-width="1.6"/><text x="20" y="31" text-anchor="middle" font-family="Baloo 2,Mukta,sans-serif" font-size="${label.length > 1 ? 13 : 16}" font-weight="800" fill="#1E293B">${label}</text>`;
  }
  function personIcon(girl) {
    const c = girl ? '#FF6B57' : '#1D4ED8';
    return `<circle cx="20" cy="9" r="6" fill="#F2C9A0" stroke="#B07D4F" stroke-width="1.2"/>` + (girl
      ? `<path d="M20 16l-9 15h18z" fill="${c}"/><path d="M16 31v6M24 31v6" stroke="#B07D4F" stroke-width="3" stroke-linecap="round"/>`
      : `<rect x="12" y="16" width="16" height="12" rx="3" fill="${c}"/><path d="M16 28v9M24 28v9" stroke="#1E3A8A" stroke-width="4" stroke-linecap="round"/>`);
  }
  const svgWrap = (inner, size) => `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true" focusable="false">${inner}</svg>`;

  // ---------------------------------------------------------------- the genetic model of each mode
  // Genotypes are strings: 2 characters per gene (alleles, dominant/first-ranked first). The model knows how to make
  // gametes, combine them, find the phenotype and say how things look.
  function monoModel(mode, trait) {
    const tr = TR[trait], U = tr.g, l = U.toLowerCase();
    const inc = mode === 'incomplete-dominance';
    const R = inc ? 'R' : U, r = R.toLowerCase();
    const M = {
      mode, loci: 1, alleles: [[R, r]], rank: (c) => (isUp(c) ? 0 : 1), trait, tr,
      opts: [R + R, R + r, r + r], def: [R + r, R + r], names: [T2('Parent 1', 'पैतृक 1'), T2('Parent 2', 'पैतृक 2')],
      pk: (g) => (inc ? g : /[A-Z]/.test(g) ? 'D' : 'r'),
      alCol: (c, i) => (isUp(c) ? AL_COL.U1 : AL_COL.L1),
    };
    if (inc) {
      M.ph = [
        { key: 'RR', label: T2('Red', 'लाल'), icon: (s) => svgWrap(plantIcon(true, FLOWER.R), s) },
        { key: 'Rr', label: T2('Pink', 'गुलाबी'), icon: (s) => svgWrap(plantIcon(true, FLOWER.K), s) },
        { key: 'rr', label: T2('White', 'सफ़ेद'), icon: (s) => svgWrap(plantIcon(true, FLOWER.W), s) },
      ];
      M.what = T2('Snapdragon flower colour', 'स्नैपड्रैगन के फूल का रंग');
    } else {
      const ic = (v) => {
        if (trait === 'height') return (s) => svgWrap(plantIcon(v === 'D', null), s);
        if (trait === 'seed-shape') return (s) => svgWrap(peaIcon(v === 'D', 'y'), s);
        if (trait === 'seed-colour') return (s) => svgWrap(peaIcon(true, v === 'D' ? 'y' : 'g'), s);
        return (s) => svgWrap(plantIcon(true, v === 'D' ? FLOWER.P : FLOWER.W), s);
      };
      M.ph = [{ key: 'D', label: tr.dom, icon: ic('D') }, { key: 'r', label: tr.rec, icon: ic('r') }];
      M.what = tr.name;
    }
    return M;
  }
  function diModel(trait) {
    const pair = PAIR[trait], A = TR[pair[0]], B = TR[pair[1]];
    const a = A.g, b = B.g;
    const M = {
      mode: 'dihybrid', loci: 2, alleles: [[a, a.toLowerCase()], [b, b.toLowerCase()]], rank: (c) => (isUp(c) ? 0 : 1), pair,
      opts: [], def: [a + a.toLowerCase() + b + b.toLowerCase(), a + a.toLowerCase() + b + b.toLowerCase()],
      names: [T2('Parent 1', 'पैतृक 1'), T2('Parent 2', 'पैतृक 2')],
      pk: (g) => (/[A-Z]/.test(g.slice(0, 2)) ? 'D' : 'r') + (/[A-Z]/.test(g.slice(2)) ? 'D' : 'r'),
      alCol: (c, i) => (i === 0 ? (isUp(c) ? AL_COL.U1 : AL_COL.L1) : (isUp(c) ? AL_COL.U2 : AL_COL.L2)),
      what: T2(A.name.en + ' and ' + B.name.en.toLowerCase(), A.name.hi + ' और ' + B.name.hi),
    };
    return M;
  }
  function bloodModel() {
    const col = { A: '#FF6B57', B: '#02CFF9', AB: '#B58CFF', O: '#FFD23F' };
    return {
      mode: 'blood-groups', loci: 1, alleles: [['A', 'B', 'O']], rank: (c) => 'ABO'.indexOf(c),
      opts: ['AA', 'AO', 'BB', 'BO', 'AB', 'OO'], def: ['AO', 'BO'], names: [T2('Mother', 'माँ'), T2('Father', 'पिता')],
      pk: (g) => (g.includes('A') && g.includes('B') ? 'AB' : g.includes('A') ? 'A' : g.includes('B') ? 'B' : 'O'),
      alCol: (c) => AL_COL[c],
      ph: ['A', 'B', 'AB', 'O'].map((k) => ({ key: k, label: T2('Group ' + k, 'समूह ' + k), icon: (s) => svgWrap(dropIcon(k, col[k]), s) })),
      what: T2('ABO blood group', 'ABO रक्त समूह'),
    };
  }
  function sexModel() {
    return {
      mode: 'sex', loci: 1, alleles: [['X', 'Y']], rank: (c) => 'XY'.indexOf(c), opts: [], def: ['XX', 'XY'], names: [T2('Mother', 'माँ'), T2('Father', 'पिता')],
      pk: (g) => (g === 'XX' ? 'F' : 'M'), alCol: (c) => AL_COL[c],
      ph: [{ key: 'F', label: T2('Girl', 'लड़की'), icon: (s) => svgWrap(personIcon(true), s) }, { key: 'M', label: T2('Boy', 'लड़का'), icon: (s) => svgWrap(personIcon(false), s) }],
      what: T2('Sex of the child', 'बच्चे का लिंग'),
    };
  }
  function pedModel(trait) {
    const tr = trait ? TR[trait] : null;
    const aff = (s, fill) => svgWrap(`<circle cx="20" cy="20" r="13" fill="${fill ? '#1E293B' : '#fff'}" stroke="#1E293B" stroke-width="2.5"/>`, s);
    return {
      mode: 'pedigree', loci: 1, alleles: [['A', 'a']], rank: (c) => (isUp(c) ? 0 : 1), opts: ['AA', 'Aa', 'aa'], def: ['Aa', 'Aa'],
      names: [T2('Mother', 'माँ'), T2('Father', 'पिता')], pk: (g) => (/[A-Z]/.test(g) ? 'D' : 'r'), alCol: (c) => (isUp(c) ? AL_COL.U1 : AL_COL.L1),
      ph: [
        { key: 'D', label: tr ? tr.dom : T2('Does not have the trait', 'लक्षण नहीं है'), icon: (s) => aff(s, false) },
        { key: 'r', label: tr ? tr.rec : T2('Has the trait', 'लक्षण है'), icon: (s) => aff(s, true) },
      ],
      what: tr ? tr.name : T2('A family trait (albinism)', 'परिवार का एक लक्षण (ऐल्बिनिज़्म)'),
    };
  }
  // The whole-model helpers shared by every genetic mode.
  function finish(M) {
    M.normLocus = (s) => (M.rank(s[0]) <= M.rank(s[1]) ? s : s[1] + s[0]);
    M.norm = (g) => { let o = ''; for (let i = 0; i < g.length; i += 2) o += M.normLocus(g.slice(i, i + 2)); return o; };
    M.valid = (g) => typeof g === 'string' && g.length === 2 * M.loci && [...Array(M.loci).keys()].every((i) => g.slice(2 * i, 2 * i + 2).split('').every((c) => M.alleles[i].includes(c)));
    M.gam = (g) => {
      if (M.loci === 1) return [g[0], g[1]];
      return [g[0] + g[2], g[0] + g[3], g[1] + g[2], g[1] + g[3]];
    };
    M.comb = (a, b) => {
      let o = '';
      for (let i = 0; i < M.loci; i++) o += M.normLocus(a[i] + b[i]);
      return o;
    };
    M.show = (g) => (M.mode === 'blood-groups'
      ? g.split('').map((c) => (c === 'O' ? 'i' : 'I<sup>' + c + '</sup>')).join('')
      : esc(g));
    M.showG = (g) => (M.mode === 'blood-groups' ? (g === 'O' ? 'i' : 'I<sup>' + g + '</sup>') : esc(g));
    M.say = (g) => (M.mode === 'blood-groups' ? g.split('').map((c) => (c === 'O' ? 'i' : 'I ' + c)).join(' ') : g.split('').join(' '));
    M.phOf = (g) => { const k = M.pk(g); return M.ph.findIndex((p) => p.key === k); };
    if (M.loci === 2) {
      const a = M.alleles[0], b = M.alleles[1], o = [];
      const L1 = [a[0] + a[0], a[0] + a[1], a[1] + a[1]], L2 = [b[0] + b[0], b[0] + b[1], b[1] + b[1]];
      L1.forEach((x) => L2.forEach((y) => o.push(x + y)));
      M.opts = o;
      const pf = (v) => (trait) => v;
      const [A, B] = [TR[M.pair[0]], TR[M.pair[1]]];
      const ic = (k) => {
        const [s1, s2] = [k[0] === 'D', k[1] === 'D'];
        if (M.pair[0] === 'seed-shape') return (s) => svgWrap(peaIcon(s1, s2 ? 'y' : 'g'), s);
        return (s) => svgWrap(plantIcon(s1, s2 ? FLOWER.P : FLOWER.W), s);
      };
      const nm = (k) => T2((k[0] === 'D' ? A.dom.en : A.rec.en) + ', ' + (k[1] === 'D' ? B.dom.en : B.rec.en).toLowerCase(), (k[0] === 'D' ? A.dom.hi : A.rec.hi) + ', ' + (k[1] === 'D' ? B.dom.hi : B.rec.hi));
      M.ph = ['DD', 'Dr', 'rD', 'rr'].map((k) => ({ key: k, label: nm(k), icon: ic(k) }));
    }
    return M;
  }
  const trait0 = (mode, t) => t || (mode === 'dihybrid' ? 'seed-shape' : mode === 'incomplete-dominance' ? 'flower-colour' : 'height');
  function build(mode, trait) {
    const t = trait0(mode, trait);
    let M;
    if (mode === 'monohybrid' || mode === 'test-cross' || mode === 'incomplete-dominance') M = monoModel(mode, t);
    else if (mode === 'dihybrid') { M = diModel(t); }
    else if (mode === 'blood-groups') M = bloodModel();
    else if (mode === 'sex') M = sexModel();
    else if (mode === 'pedigree') M = pedModel(trait);
    else return null;
    finish(M);
    if (mode === 'test-cross') { M.def = [M.alleles[0][0] + M.alleles[0][1], M.alleles[0][1] + M.alleles[0][1]]; M.opts = [M.alleles[0][0] + M.alleles[0][0], M.alleles[0][0] + M.alleles[0][1]]; M.names = [T2('Unknown tall plant', 'अज्ञात लंबा पौधा'), T2('Dwarf tester plant', 'बौना परीक्षण पौधा')]; if (t !== 'height') { M.names = [T2('Unknown ' + TR[t].dom.en.toLowerCase() + ' plant', 'अज्ञात ' + TR[t].dom.hi + ' पौधा'), T2(TR[t].rec.en + ' tester plant', TR[t].rec.hi + ' परीक्षण पौधा')]; } }
    return M;
  }
  // Parse a config genotype into the model's internal form (or null).
  function parseG(M, mode, s) {
    if (typeof s !== 'string') return null;
    if (mode === 'blood-groups') {
      const m = s.match(/^(IA|IB|i|A|B|O)(IA|IB|i|A|B|O)$/);
      if (!m) return null;
      const map = { IA: 'A', IB: 'B', i: 'O', A: 'A', B: 'B', O: 'O' };
      return M.norm(map[m[1]] + map[m[2]]);
    }
    if (mode === 'sex') return s === 'XX' || s === 'XY' || s === 'YX' ? M.norm(s) : null;
    // letters may be given in either order (tT) but must be the right letters in either case
    if (s.length !== 2 * M.loci) return null;
    const n = M.norm(s);
    return M.valid(n) ? n : null;
  }

  // ---------------------------------------------------------------- the Punnett square
  const gridOf = (M, pa, pb) => {
    const cols = M.gam(pa), rows = M.gam(pb);
    return { cols, rows, cells: rows.map((rg) => cols.map((cg) => M.comb(cg, rg))) };
  };
  function tally(M, G) {
    const counts = M.ph.map(() => 0), geno = {};
    G.cells.forEach((row) => row.forEach((g) => { counts[M.phOf(g)]++; geno[g] = (geno[g] || 0) + 1; }));
    return { counts, geno, total: G.rows.length * G.cols.length };
  }
  const reduce = (arr) => { const nz = arr.filter((x) => x > 0); const d = nz.reduce(gcd, 0) || 1; return arr.map((x) => x / d); };
  const frac = (n, d) => { if (n === 0) return '0'; const g = gcd(n, d); return n === d ? '1' : n / g + '/' + d / g; };
  const genoOrder = (M, a, b) => {
    const k = (g) => [...g].map((c) => M.rank(c)).join('');
    return k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0;
  };

  // ---------------------------------------------------------------- DNA data: the genetic code, pairing rules
  const BASES = ['A', 'T', 'G', 'C'];
  const BCOL = { A: '#FF6B57', T: '#FFD23F', G: '#22C55E', C: '#02CFF9', U: '#FF7A1A' };
  const COMP = { A: 'T', T: 'A', G: 'C', C: 'G' };
  const RNA = { A: 'U', T: 'A', G: 'C', C: 'G' };
  const CODE_AA = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
  const CODE_ORDER = 'TCAG';
  const AA = {
    A: T2('Alanine', 'अलानीन'), R: T2('Arginine', 'आर्जिनीन'), N: T2('Asparagine', 'ऐस्पैरेजीन'), D: T2('Aspartic acid', 'ऐस्पार्टिक अम्ल'), C: T2('Cysteine', 'सिस्टीन'),
    Q: T2('Glutamine', 'ग्लूटामीन'), E: T2('Glutamic acid', 'ग्लूटामिक अम्ल'), G: T2('Glycine', 'ग्लाइसीन'), H: T2('Histidine', 'हिस्टिडीन'), I: T2('Isoleucine', 'आइसोल्यूसीन'),
    L: T2('Leucine', 'ल्यूसीन'), K: T2('Lysine', 'लाइसीन'), M: T2('Methionine', 'मेथिओनीन'), F: T2('Phenylalanine', 'फ़ेनिलएलानीन'), P: T2('Proline', 'प्रोलीन'),
    S: T2('Serine', 'सेरीन'), T: T2('Threonine', 'थ्रेओनीन'), W: T2('Tryptophan', 'ट्रिप्टोफ़ैन'), Y: T2('Tyrosine', 'टायरोसीन'), V: T2('Valine', 'वैलीन'), '*': T2('Stop', 'रुको'),
  };
  // codon: three letters of A, U, G, C (mRNA); returns the one-letter amino acid or '*'
  const codonAA = (c) => CODE_AA[CODE_ORDER.indexOf(c[0] === 'U' ? 'T' : c[0]) * 16 + CODE_ORDER.indexOf(c[1] === 'U' ? 'T' : c[1]) * 4 + CODE_ORDER.indexOf(c[2] === 'U' ? 'T' : c[2])];
  const transcribe = (tpl) => [...tpl].map((b) => RNA[b]).join('');
  const translate = (mrna) => { const out = []; for (let i = 0; i + 2 < mrna.length; i += 3) { const c = mrna.slice(i, i + 3), a = codonAA(c); out.push({ c, a }); if (a === '*') break; } return out; };
  const STRANDS = ['TACGGATTTATT', 'TACCCTAAAATT', 'TACGGTCTTACT'];
  const strandOk = (s) => typeof s === 'string' && /^[ATGC]+$/.test(s) && s.length >= 6 && s.length <= 12 && s.length % 3 === 0 && s.startsWith('TAC');

  // ---------------------------------------------------------------- helpers: seeded randomness
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const shuffle = (arr, rnd) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------------------------------------------------------------- CSS
  const CSS = `
.cr{--cr-a:#65A30D;display:grid;gap:14px;max-width:1100px;margin:0 auto;color:var(--ink,#1E293B);font-family:var(--font-body,Mukta,sans-serif)}
.cr *{box-sizing:border-box}
.cr button{font:inherit;color:inherit;cursor:pointer}
.cr button:focus-visible{outline:3px solid var(--royal,#1D4ED8);outline-offset:2px}
.cr-hero{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:20px;color:#fff;background:linear-gradient(120deg,#1F3A0B,#3F6212 48%,#0F766E);box-shadow:0 8px 22px -10px rgba(15,60,30,.55);position:relative;overflow:hidden}
.cr-hero svg.cr-helix{flex:none;width:46px;height:46px}
.cr-hero h2{margin:0;font:800 clamp(18px,4.6vw,24px)/1.15 var(--font-display,Baloo 2,Mukta,sans-serif)}
.cr-hero p{margin:2px 0 0;font-size:14px;opacity:.95;line-height:1.35}
.cr-body{display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}
@media (min-width:860px){.cr-body{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);align-items:start}}
.cr-card{background:var(--surface,#fff);border:1px solid var(--line,#E2E8F0);border-radius:18px;padding:14px;box-shadow:0 6px 18px -12px rgba(15,23,42,.35);min-width:0}
.cr-card h3{margin:0 0 8px;font:700 15px/1.2 var(--font-display,Baloo 2,Mukta,sans-serif);color:var(--ink-2,#475569);letter-spacing:.01em}
.cr-parents{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:8px;align-items:center}
.cr-x{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--sunk,#F1F5F9);font:800 20px/1 var(--font-display,sans-serif);color:var(--ink-2,#475569)}
.cr-par{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 6px 8px;min-height:44px;border-radius:18px;border:2px solid var(--line,#CBD5E1);background:linear-gradient(180deg,var(--surface,#fff),var(--sunk,#F1F5F9));width:100%;text-align:center;transition:transform .15s,border-color .15s,box-shadow .15s}
.cr-par:hover:not(.fixed){border-color:var(--cr-a);transform:translateY(-1px);box-shadow:0 8px 16px -10px rgba(63,98,18,.6)}
.cr-par .nm{font-size:12.5px;font-weight:700;color:var(--ink-2,#475569);line-height:1.15}
.cr-par .gt{font:800 clamp(22px,6vw,28px)/1.1 var(--font-display,sans-serif);letter-spacing:.04em}
.cr-par .pt{font-size:13px;font-weight:600;line-height:1.2}
.cr-par .hint{font-size:11.5px;color:var(--ink-2,#475569);opacity:.9}
.cr-gams{display:flex;flex-wrap:wrap;justify-content:center;gap:4px;min-height:30px;margin-top:4px}
.cr-gam{min-width:28px;height:28px;padding:0 5px;border-radius:14px;display:inline-grid;place-items:center;font:800 13px/1 var(--font-display,sans-serif);color:#1E293B;box-shadow:inset 0 -2px 0 rgba(0,0,0,.14),0 1px 3px rgba(0,0,0,.18);border:1.5px solid rgba(255,255,255,.7)}
.cr-gam.q{background:var(--sunk,#E2E8F0);color:var(--ink-2,#64748B);box-shadow:none;border:1.5px dashed var(--line,#CBD5E1)}
.cr-gam.pop{animation:crpop .45s cubic-bezier(.3,1.6,.5,1) both}
.cr-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.cr .cr-btn{color:#fff;min-height:46px;padding:10px 16px;border-radius:14px;border:0;background:linear-gradient(180deg,#7CB518,#5A8F0C);color:#fff;font-weight:800;font-size:16px;font-family:var(--font-display,sans-serif);box-shadow:0 5px 0 #3F6212,0 10px 18px -8px rgba(63,98,18,.7);transition:transform .1s,box-shadow .1s,filter .15s;flex:1 1 150px;text-shadow:0 1px 0 rgba(0,0,0,.25)}
.cr-btn:hover{filter:brightness(1.05)}
.cr-btn:active{transform:translateY(3px);box-shadow:0 2px 0 #3F6212}
.cr-btn.alt{background:linear-gradient(180deg,#2F6FEB,#1D4ED8);box-shadow:0 5px 0 #1E3A8A,0 10px 18px -8px rgba(29,78,216,.7)}
.cr .cr-btn.off{background:linear-gradient(180deg,#7C8798,#64748B);box-shadow:0 5px 0 #475569;opacity:.9}
.cr-status{margin:10px 0 0;padding:9px 12px;border-radius:12px;background:var(--sunk,#F1F5F9);font-size:14.5px;line-height:1.4;min-height:40px}
.cr-pun{display:grid;gap:6px;grid-template-columns:minmax(40px,.7fr) repeat(var(--n),minmax(0,1fr));align-items:stretch}
.cr-pun .corner{display:grid;place-items:center;font-size:11px;font-weight:700;color:var(--ink-2,#64748B);text-align:center;line-height:1.1}
.cr-pun .hd{display:grid;place-items:center;min-height:36px}
.cr-cell{position:relative;min-height:62px;min-width:44px;padding:4px 2px;border-radius:14px;border:2px dashed var(--line,#CBD5E1);background:var(--sunk,#F1F5F9);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font:800 clamp(13px,3.6vw,18px)/1.1 var(--font-display,sans-serif);color:#1E293B;transition:transform .15s,background .3s,border-color .3s}
.cr-cell .q{font-size:22px;color:var(--ink-2,#94A3B8)}
.cr-cell:hover:not(.on){border-color:var(--cr-a);transform:scale(1.03)}
.cr-cell.on{border-style:solid;border-color:rgba(0,0,0,.14);cursor:default}
.cr-cell.pop{animation:crpop .5s cubic-bezier(.3,1.6,.5,1) both}
.cr-cell .ph{font:600 10.5px/1.05 var(--font-body,sans-serif);opacity:.85;text-align:center;max-width:100%;overflow-wrap:anywhere}
.cr-cell.off:not(.on){opacity:.55}
.cr-res h3 span{font-weight:600;opacity:.8}
.cr-rat{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline;margin:2px 0 8px}
.cr-rat b{font:800 clamp(24px,6vw,30px)/1 var(--font-display,sans-serif);color:var(--cr-a);letter-spacing:.02em}
.cr-rat span{font-size:14px;color:var(--ink-2,#475569)}
.cr-bars{display:grid;gap:8px}
.cr-bar{display:grid;grid-template-columns:32px minmax(0,1fr);gap:8px;align-items:center}
.cr-bar .nm{font-size:13.5px;font-weight:700;line-height:1.2;display:flex;justify-content:space-between;gap:8px}
.cr-bar .nm i{font-style:normal;font-weight:600;color:var(--ink-2,#475569);white-space:nowrap}
.cr-trk{position:relative;height:16px;border-radius:9px;background:var(--sunk,#E2E8F0);overflow:visible;margin-top:3px}
.cr-trk u{position:absolute;left:0;top:0;bottom:0;border-radius:9px;transition:width .6s cubic-bezier(.3,1,.4,1);text-decoration:none}
.cr-trk s{position:absolute;top:-4px;bottom:-4px;width:3px;border-radius:2px;background:var(--night,#061233);text-decoration:none}
.cr-legend{font-size:12.5px;color:var(--ink-2,#475569);margin:8px 0 0;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.cr-legend s{display:inline-block;width:3px;height:14px;background:var(--night,#061233);vertical-align:middle;margin-right:4px;text-decoration:none}
.cr-strip{display:flex;flex-wrap:wrap;gap:2px;margin-top:10px;max-height:94px;overflow:hidden;padding:6px;background:var(--sunk,#F1F5F9);border-radius:12px}
.cr-strip span{display:inline-grid;line-height:0}
.cr-strip span.new{animation:crdrop .5s cubic-bezier(.3,1.5,.5,1) both}
.cr-q{border:2px solid var(--cr-a);background:linear-gradient(180deg,rgba(101,163,13,.08),transparent)}
.cr-q h4{margin:0 0 10px;font:700 17px/1.3 var(--font-display,Baloo 2,Mukta,sans-serif)}
.cr-opts{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}
.cr-opt{min-height:46px;padding:8px 12px;border-radius:12px;border:2px solid var(--line,#CBD5E1);background:var(--surface,#fff);font-weight:700;font-size:15.5px;line-height:1.25;transition:transform .12s,border-color .12s,background .2s}
.cr-opt:hover:not(.done){border-color:var(--royal,#1D4ED8);transform:translateY(-1px)}
.cr-opt.good{background:#DCFCE7;border-color:#16A34A;color:#14532D}
.cr-opt.bad{background:#FEE2E2;border-color:#DC2626;color:#7F1D1D;animation:crshake .4s}
.cr-opt.off{opacity:.55}
.cr-why{margin:10px 0 0;font-size:14.5px;line-height:1.45}
.cr-why.good{color:#166534}
.cr-lock{font-size:14px;color:var(--ink-2,#475569);margin:0}
.cr-hide{opacity:.5}
.cr-ped{display:grid;gap:0;justify-items:center}
.cr-ped .gen{display:flex;gap:18px;align-items:flex-start;justify-content:center;flex-wrap:nowrap}
.cr-ped .couple{position:relative;display:flex;gap:26px;justify-content:center}
.cr-ped .couple::before{content:"";position:absolute;left:36px;right:36px;top:36px;border-top:3px solid var(--night,#061233)}
.cr-ped .drop{width:3px;height:22px;background:var(--night,#061233)}
.cr-ped .sib{position:relative;display:flex;flex-wrap:wrap;gap:10px 8px;justify-content:center;padding-top:16px;margin-top:0;width:100%}
.cr-ped .sib2{margin-top:10px}
.cr-ped .sib::before{content:"";position:absolute;top:0;left:7%;right:7%;border-top:3px solid var(--night,#061233)}
.cr-sym{display:flex;flex-direction:column;align-items:center;gap:3px;background:none;border:0;padding:0;min-width:56px;position:relative}
.cr-sym .shape{width:52px;height:52px;border:3px solid var(--night,#061233);display:grid;place-items:center;background:#fff;font:800 13px var(--font-display,sans-serif);color:#1E293B;position:relative;transition:transform .15s,box-shadow .2s}
.cr-sym.F .shape{border-radius:50%}.cr-sym.M .shape{border-radius:6px}
.cr-sym.aff .shape{background:var(--night,#061233);color:#fff}
.cr-sym.car .shape{background:linear-gradient(90deg,#fff 50%,var(--night,#061233) 50%)}
.cr-sym:hover:not(.empty) .shape{transform:scale(1.07);box-shadow:0 6px 14px -6px rgba(0,0,0,.5)}
.cr-sym.sib1::before{content:"";position:absolute;top:-16px;left:50%;width:3px;height:16px;background:var(--night,#061233);transform:translateX(-50%)}
.cr-sym.empty .shape{border-style:dashed;border-color:var(--line,#CBD5E1);background:var(--sunk,#F1F5F9);color:var(--ink-2,#94A3B8)}
.cr-sym.pop .shape{animation:crpop .5s cubic-bezier(.3,1.6,.5,1) both}
.cr-sym .gl{font:700 13px var(--font-body,sans-serif);min-height:16px;line-height:1.1;color:var(--ink,#1E293B)}
.cr-sym .gl.u{color:var(--ink-2,#64748B)}
.cr-sym .nm{font-size:12px;font-weight:700;color:var(--ink-2,#475569)}
.cr-key{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12.5px;color:var(--ink-2,#475569);margin-top:12px;justify-content:center}
.cr-key i{display:inline-block;width:14px;height:14px;border:2px solid var(--night,#061233);vertical-align:-2px;margin-right:4px;background:#fff}
.cr-dna{display:grid;gap:0;justify-items:center}
.cr-dna .cols{display:grid;grid-template-columns:1fr 1fr;width:100%;max-width:320px;font-size:12px;font-weight:700;color:var(--ink-2,#475569);text-align:center;margin-bottom:4px;gap:60px}
.cr-rung{display:grid;grid-template-columns:44px minmax(26px,1fr) 44px;align-items:center;gap:0;height:46px;width:var(--w,70%);min-width:190px;max-width:320px;transition:width .3s}
.cr-bs{width:42px;height:38px;border-radius:12px;display:grid;place-items:center;font:800 18px/1 var(--font-display,sans-serif);color:#1E293B;border:2px solid rgba(0,0,0,.18);box-shadow:inset 0 -3px 0 rgba(0,0,0,.14),0 3px 6px -3px rgba(0,0,0,.4);background:var(--c);position:relative;transition:transform .15s}
button.cr-bs{min-width:44px;min-height:44px;width:44px;height:44px;padding:0}
button.cr-bs.empty{background:var(--sunk,#F1F5F9);border:2px dashed var(--line,#94A3B8);box-shadow:none;color:var(--ink-2,#94A3B8)}
button.cr-bs.right{box-shadow:0 0 0 3px #16A34A,inset 0 -3px 0 rgba(0,0,0,.14)}
button.cr-bs.wrong{box-shadow:0 0 0 3px #DC2626,inset 0 -3px 0 rgba(0,0,0,.14);animation:crshake .4s}
button.cr-bs:hover{transform:scale(1.07)}
.cr-bond{height:100%;display:grid;align-content:center;gap:4px;padding:0 3px}
.cr-bond i{display:block;border-top:3px dotted var(--ink-2,#94A3B8);opacity:.45}
.cr-bond.ok i{border-top:3px solid #16A34A;opacity:1;animation:crgrow .35s both}
.cr-rails{position:relative}
.cr-rep{display:grid;gap:8px}
.cr-mol{display:grid;gap:3px;padding:8px;border-radius:12px;background:var(--sunk,#F1F5F9)}
.cr-mol b{font-size:12.5px;color:var(--ink-2,#475569)}
.cr-chips{display:flex;flex-wrap:wrap;gap:2px}
.cr-chip{min-width:22px;height:24px;padding:0 3px;border-radius:7px;display:inline-grid;place-items:center;font:800 12.5px/1 var(--font-display,sans-serif);color:#1E293B;background:var(--c);border:2px solid transparent}
.cr-chip.old{border-color:var(--night,#061233)}
.cr-chip.new{box-shadow:0 0 0 2px #fff,0 0 0 4px #16A34A;animation:crpop .5s both}
.cr-codon{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 4px;border-radius:12px;background:var(--sunk,#F1F5F9);min-width:64px}
.cr-codon .aa{font-size:12.5px;font-weight:700;text-align:center;line-height:1.15}
.cr-codon.stop{background:#FEE2E2}
.cr-codon.skip{opacity:.4}
.cr-codons{display:flex;flex-wrap:wrap;gap:6px}
.cr-tbl{width:100%;border-collapse:collapse;font-size:14px}
.cr-tbl td,.cr-tbl th{padding:3px 6px;text-align:center}
@keyframes crpop{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}
@keyframes crdrop{0%{transform:translateY(-14px) scale(.5);opacity:0}100%{transform:none;opacity:1}}
@keyframes crshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
@keyframes crgrow{0%{transform:scaleX(0)}100%{transform:scaleX(1)}}
@media (prefers-reduced-motion:reduce){.cr *{animation:none!important;transition:none!important}}
`;

  // ---------------------------------------------------------------- validation
  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
    Object.keys(c).forEach((k) => { if (!['mode', 'trait', 'parents'].includes(k)) e.push('unknown key: ' + k); });
    if (!MODES.includes(c.mode)) { e.push('mode must be one of ' + MODES.join(', ')); return e; }
    if (c.trait != null) {
      if (!TRAITS.includes(c.trait)) e.push('unknown trait: ' + c.trait + ' (use ' + TRAITS.join(', ') + ')');
      else if (['blood-groups', 'sex', 'dna'].includes(c.mode)) e.push('trait does not apply to mode ' + c.mode);
      else if (c.mode === 'incomplete-dominance' && c.trait !== 'flower-colour') e.push('incomplete-dominance is drawn for the flower-colour trait only');
    }
    if (c.parents != null) {
      if (!Array.isArray(c.parents)) { e.push('parents must be an array of genotypes'); return e; }
      if (c.mode === 'dna') {
        if (c.parents.length < 1 || c.parents.length > 2) e.push('dna parents: one template strand (optionally a second)');
        c.parents.forEach((s) => { if (!strandOk(s)) e.push('dna strand "' + s + '": use A, T, G, C only, 6 to 12 bases, a multiple of 3, starting with TAC (the start codon AUG on mRNA)'); });
        return e;
      }
      if (c.parents.length !== 2) { e.push('parents must have exactly two genotypes'); return e; }
      const M = build(c.mode, c.trait);
      const P = c.parents.map((s) => parseG(M, c.mode, s));
      P.forEach((p, i) => { if (!p) e.push('parents[' + i + '] "' + c.parents[i] + '" is not a genotype this mode can draw'); });
      if (P.every(Boolean)) {
        if (c.mode === 'sex' && !(P[0] === 'XX' && P[1] === 'XY')) e.push('sex: parents must be [XX, XY] (mother, father)');
        if (c.mode === 'test-cross') {
          if (!/[A-Z]/.test(P[0])) e.push('test-cross: parents[0] must show the dominant trait (e.g. TT or Tt)');
          if (/[A-Z]/.test(P[1])) e.push('test-cross: parents[1] must be the homozygous recessive tester (e.g. tt)');
        }
      }
    }
    return e;
  }
  function cellKeys(c) {
    const mode = c.mode, out = [];
    const sq = (n) => { for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) out.push('cell:' + r + '-' + k); };
    if (mode === 'dihybrid') sq(4);
    else if (mode === 'dna') { const s = (c.parents && c.parents[0]) || STRANDS[0]; for (let i = 0; i < s.length; i++) out.push('cell:0-' + i); }
    else if (mode === 'pedigree') for (let i = 0; i < 8; i++) out.push('cell:0-' + i);
    else sq(2);
    return out;
  }
  function keys(c) {
    const cc = c && MODES.includes(c.mode) ? c : { mode: 'monohybrid' };
    return { targets: (cc.mode === 'dna' ? ['parent:0', 'cross'] : ['parent:0', 'parent:1', 'cross']).concat(cellKeys(cc), ['grow', 'answer']), events: ['crossed', 'filled', 'grown', 'ratio', 'answered:right', 'answered:wrong'] };
  }

  // ---------------------------------------------------------------- the mounted lab
  function mount(root, config, api) {
    const mode = config.mode;
    const DNA = mode === 'dna', PED = mode === 'pedigree', TEST = mode === 'test-cross';
    const M = DNA ? null : build(mode, config.trait);
    const timers = [];
    const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
    let dead = false;
    const t = (x) => api.t(x);

    // ----- state
    const S = { parents: null, truth: null, tpl: null, crossed: false, filled: {}, obs: null, q: null, qi: 0, qState: null, msg: null, flash: null, ped: null, dna: null, strandI: 0 };
    function initParents() {
      if (DNA) { S.tpl = (config.parents && config.parents[0]) || STRANDS[0]; S.strandI = Math.max(0, STRANDS.indexOf(S.tpl)); return; }
      const src = config.parents && config.parents.length === 2 ? config.parents.map((s) => parseG(M, mode, s)) : M.def.map((s) => M.norm(s));
      S.parents = src.slice();
      if (TEST) { S.truth = src[0]; S.parents = [M.alleles[0][0] + M.alleles[0][0], src[1]]; }
    }
    function resetCross() {
      S.crossed = false; S.filled = {}; S.obs = M ? { counts: M.ph.map(() => 0), total: 0, recent: [] } : null; S.q = null; S.qState = null; S.ped = null; S.pedN = 0;
      S.dna = DNA ? { slots: Array(S.tpl.length).fill(null), bad: {}, rep: false, tr: false } : null;
    }
    initParents(); resetCross();
    const truthParents = () => (TEST ? [S.truth, S.parents[1]] : S.parents);
    const G = () => gridOf(M, S.parents[0], S.parents[1]);
    const nCells = () => (M.loci === 2 ? 16 : 4);
    const allFilled = () => Object.keys(S.filled).length === nCells();

    // ----- text bits
    const title = () => {
      if (DNA) return T2('DNA: copy it, then read it', 'DNA: प्रतिलिपि बनाओ, फिर पढ़ो');
      return ({
        monohybrid: T2('Monohybrid cross', 'एकसंकर संकरण'), dihybrid: T2('Dihybrid cross', 'द्विसंकर संकरण'), 'test-cross': T2('Test cross: who is hiding a recessive allele?', 'परीक्षण संकरण: किसमें अप्रभावी एलील छिपा है?'),
        'incomplete-dominance': T2('Incomplete dominance', 'अपूर्ण प्रभाविता'), 'blood-groups': T2('Blood groups: three alleles', 'रक्त समूह: तीन एलील'), sex: T2('How is the sex of a child decided?', 'बच्चे का लिंग कैसे तय होता है?'), pedigree: T2('Reading a family tree (pedigree)', 'वंशावली पढ़ना'),
      })[mode];
    };
    const TRX = (M && M.tr) || TR.height;
    const subtitle = () => {
      if (DNA) return T2('Pair the bases, unzip the strands, then make mRNA and a protein.', 'क्षारकों को जोड़ो, लड़ियाँ खोलो, फिर mRNA और प्रोटीन बनाओ।');
      return ({
        monohybrid: T2('One trait: ' + M.what.en.toLowerCase() + '. Capital letter = dominant allele.', 'एक लक्षण: ' + M.what.hi + '। बड़ा अक्षर = प्रभावी एलील।'),
        dihybrid: T2('Two traits at once: ' + M.what.en.toLowerCase() + '. Genes sort independently.', 'दो लक्षण एक साथ: ' + M.what.hi + '। जीन स्वतंत्र रूप से बँटते हैं।'),
        'test-cross': T2('Cross the unknown ' + TRX.dom.en.toLowerCase() + ' plant with a ' + TRX.rec.en.toLowerCase() + ' (' + M.alleles[0][1] + M.alleles[0][1] + ') plant and look at the offspring.', 'अज्ञात ' + TRX.dom.hi + ' पौधे का ' + TRX.rec.hi + ' (' + M.alleles[0][1] + M.alleles[0][1] + ') पौधे से संकरण करो और संतति देखो।'),
        'incomplete-dominance': T2('Neither allele hides the other: the mix shows (snapdragon).', 'कोई भी एलील दूसरे को नहीं छिपाता: मिश्रित रंग दिखता है (स्नैपड्रैगन)।'),
        'blood-groups': T2('Alleles Iᴬ, Iᴮ and i decide group A, B, AB or O.', 'एलील Iᴬ, Iᴮ और i से समूह A, B, AB या O तय होता है।'),
        sex: T2('Mother gives X. Father gives X or Y. Fill the square and count.', 'माँ X देती है। पिता X या Y देता है। वर्ग भरो और गिनो।'),
        pedigree: T2('Circles are females, squares are males, dark symbols have the trait.', 'वृत्त स्त्री, वर्ग पुरुष, गहरे चिह्न में लक्षण है।'),
      })[mode];
    };
    const crossLabel = () => (DNA ? T2('Unzip and copy', 'खोलो और प्रतिलिपि बनाओ') : T2('Cross the parents', 'संकरण कराओ'));
    const growLabel = () => (DNA ? T2('Make mRNA and protein', 'mRNA और प्रोटीन बनाओ') : PED ? T2('Add a child', 'एक बच्चा जोड़ो') : (mode === 'sex' || mode === 'blood-groups') ? T2('Have 16 children', '16 बच्चे पैदा करो') : T2('Grow 16 offspring', '16 संतति उगाओ'));
    const say = (x) => { S.msg = x; };
    const gamChip = (gm, i, pop, idx) => {
      const cols = M.loci === 2 ? [M.alCol(gm[0], 0), M.alCol(gm[1], 1)] : [M.alCol(gm[0], 0)];
      const bg = cols.length === 2 ? `linear-gradient(90deg,${cols[0]} 50%,${cols[1]} 50%)` : cols[0];
      const txt = M.loci === 2 ? esc(gm) : M.showG(gm);
      return `<span class="cr-gam ${pop ? 'pop' : ''}" style="background:${bg};${pop ? 'animation-delay:' + idx * 90 + 'ms' : ''}">${txt}</span>`;
    };

    // ----- rendering of the genetic modes
    function parentsHTML() {
      const cards = [0, 1].map((i) => {
        if (DNA) return '';
        const g = i === 0 && TEST ? S.parents[0] : S.parents[i];
        const ph = M.ph[M.phOf(TEST && i === 0 ? M.alleles[0][0] + M.alleles[0][1] : g)];
        const fixed = mode === 'sex' || (TEST && i === 1);
        const showG = TEST && i === 0 ? `${esc(M.alleles[0][0])}<span style="opacity:.5">?</span>` : M.show(g);
        const nm = t(M.names[i]);
        const gameteRow = S.crossed ? M.gam(g).map((gm, k) => gamChip(gm, k, S.flash === 'cross', k)).join('') : `<span class="cr-gam q">?</span><span class="cr-gam q">?</span>`;
        const hint = fixed ? (mode === 'sex' ? T2('tap to learn', 'जानने के लिए टैप करो') : T2('always ' + g, 'हमेशा ' + g)) : TEST && i === 0 ? T2('Your guess: ' + g + ' (tap to change)', 'तुम्हारा अनुमान: ' + g + ' (बदलने के लिए टैप करो)') : T2('tap to change', 'बदलने के लिए टैप करो');
        const label = `${nm}: ${M.say(g)}, ${t(ph.label)}. ${t(hint)}`;
        return `<button type="button" class="cr-par ${fixed ? 'fixed' : ''}" data-key="parent:${i}" aria-label="${esc(label)}">
          <span class="nm">${esc(nm)}</span>${ph.icon(46)}<span class="gt">${showG}</span><span class="pt">${TEST && i === 0 ? esc(t(M.ph[0].label)) : esc(t(ph.label))}</span>
          <span class="gams" aria-hidden="true"><span class="cr-gams">${gameteRow}</span></span><span class="hint">${esc(t(hint))}</span></button>`;
      });
      return `<div class="cr-parents">${cards[0]}<span class="cr-x" aria-hidden="true">×</span>${cards[1]}</div>`;
    }
    function gridHTML() {
      const g = G(), n = g.cols.length;
      const hd = (gm, pop, k) => `<span class="hd">${S.crossed ? gamChip(gm, k, pop, k) : '<span class="cr-gam q">?</span>'}</span>`;
      let h = `<div class="cr-pun" style="--n:${n}" role="group" aria-label="${esc(t(T2('Punnett square', 'पनेट वर्ग')))}"><span class="corner">${esc(t(T2('gametes', 'युग्मक')))}</span>`;
      g.cols.forEach((gm, k) => { h += hd(gm, S.flash === 'cross', k); });
      g.rows.forEach((rg, r) => {
        h += hd(rg, S.flash === 'cross', r);
        g.cells[r].forEach((cg, c) => {
          const key = r + '-' + c, on = !!S.filled[key], pi = M.phOf(cg), ph = M.ph[pi];
          const label = on ? `${t(T2('Square', 'वर्ग'))} ${r + 1},${c + 1}: ${M.say(cg)}, ${t(ph.label)}` : `${t(T2('Square', 'वर्ग'))} ${r + 1},${c + 1}: ${t(S.crossed ? T2('empty, tap to fill', 'ख़ाली, भरने के लिए टैप करो') : T2('cross the parents first', 'पहले संकरण कराओ'))}`;
          h += `<button type="button" class="cr-cell ${on ? 'on' : ''} ${S.crossed ? '' : 'off'} ${S.flash === 'cell:' + key ? 'pop' : ''}" data-key="cell:${r}-${c}" aria-label="${esc(label)}" ${on ? `style="background:${PH_BG[pi % 4]}"` : ''}>${on ? `${ph.icon(M.loci === 2 ? 22 : 30)}<span>${M.show(cg)}</span>${M.loci === 1 ? `<span class="ph">${esc(t(ph.label))}</span>` : ''}` : '<span class="q">?</span>'}</button>`;
        });
      });
      return h + '</div>';
    }
    function resultsHTML() {
      const g = G(), tl = tally(M, g), tot = tl.total;
      const done = allFilled();
      let h = '';
      if (done) {
        const gn = Object.keys(tl.geno).sort((a, b) => genoOrder(M, a, b));
        const gr = reduce(gn.map((k) => tl.geno[k]));
        const pr = reduce(tl.counts);
        const phWords = M.ph.map((p, i) => (tl.counts[i] ? `${pr[i]} ${t(t0(p.label))}` : null)).filter(Boolean);
        h += `<h3>${esc(t(T2('What the square says', 'वर्ग क्या बताता है')))}</h3>
          <div class="cr-rat"><span>${esc(t(T2('Phenotype ratio', 'फीनोटाइप अनुपात')))}</span><b>${pr.filter((x, i) => tl.counts[i] > 0).join(' : ')}</b></div>
          <div class="cr-rat"><span>${esc(t(T2('= ', '= ')))}${esc(phWords.join(' : '))}</span></div>
          <div class="cr-rat"><span>${esc(t(T2('Genotype ratio', 'जीनोटाइप अनुपात')))}</span><b style="font-size:20px">${gr.join(' : ')}</b><span>${gn.map((k) => M.show(k)).join(' : ')}</span></div>`;
      } else {
        h += `<h3>${esc(t(T2('Ratio', 'अनुपात')))}</h3><p class="cr-lock">${esc(t(S.crossed ? T2('Fill every square (' + Object.keys(S.filled).length + ' of ' + tot + ') to see the exact ratio.', 'सटीक अनुपात देखने के लिए हर वर्ग भरो (' + tot + ' में से ' + Object.keys(S.filled).length + ')।') : T2('Cross the parents, then tap each square.', 'पहले संकरण कराओ, फिर हर वर्ग पर टैप करो।')))}</p>`;
      }
      if (S.obs.total > 0 && !TEST) h += barsHTML(tl, true);
      else if (TEST && S.obs.total > 0) h += barsHTML(tl, false);
      return h;
    }
    function barsHTML(tl, showExp) {
      const o = S.obs, tot = tl.total;
      const min = Math.min(...o.counts.filter((x) => x > 0));
      const obsRatio = o.counts.map((x) => (x ? (x / min).toFixed(1).replace(/\.0$/, '') : '0'));
      let h = `<h3 style="margin-top:14px">${esc(t(T2('Real offspring so far: ', 'अब तक की वास्तविक संतति: ')))}<span>${o.total}</span></h3><div class="cr-bars">`;
      M.ph.forEach((p, i) => {
        const pc = o.total ? (o.counts[i] / o.total) * 100 : 0, ex = (tl.counts[i] / tot) * 100;
        h += `<div class="cr-bar"><span aria-hidden="true">${p.icon(32)}</span><div><div class="nm"><span>${esc(t(p.label))}</span><i>${o.counts[i]} (${pc.toFixed(0)}%)</i></div><div class="cr-trk" role="img" aria-label="${esc(t(p.label))}: ${pc.toFixed(0)}%${showExp ? ', ' + esc(t(T2('expected', 'अपेक्षित'))) + ' ' + ex.toFixed(0) + '%' : ''}"><u style="width:${pc}%;background:${PH_FG[i % 4]}"></u>${showExp ? `<s style="left:calc(${ex}% - 1px)"></s>` : ''}</div></div></div>`;
      });
      h += `</div>`;
      if (showExp) h += `<p class="cr-legend"><span><s></s>${esc(t(T2('expected share from the square', 'वर्ग से अपेक्षित भाग')))}</span></p>`;
      h += `<div class="cr-rat" style="margin-top:8px"><span>${esc(t(T2('Counted ratio', 'गिना हुआ अनुपात')))}</span><b style="font-size:20px">${obsRatio.filter((x, i) => o.counts[i] > 0 || tl.counts[i] > 0).join(' : ')}</b></div>`;
      h += `<div class="cr-strip" aria-hidden="true">${o.recent.map((r) => `<span class="${r.nw ? 'new' : ''}" style="${r.nw ? 'animation-delay:' + r.d + 'ms' : ''}">${M.ph[r.k].icon(26)}</span>`).join('')}</div>`;
      return h;
    }

    // ----- pedigree
    const PN = 8;
    function pedMake() {
      const [pm, pf] = S.parents;
      const hasA = pm.includes('A') || pf.includes('A') || true;
      let best = null;
      for (let seed = 7; seed < 400; seed++) {
        const r = rng(seed * 2654435761 + pm.charCodeAt(1) * 31 + pf.charCodeAt(1) * 17);
        const kids = [];
        for (let i = 0; i < PN; i++) {
          const a = pm[r() < 0.5 ? 0 : 1], b = pf[r() < 0.5 ? 0 : 1];
          kids.push({ sex: r() < 0.5 ? 'F' : 'M', g: M.norm(a + b), shown: false });
        }
        best = kids;
        const first = kids.slice(0, 4).map((k) => M.pk(k.g));
        const can = tally(M, G()).counts;
        const wantBoth = can[0] > 0 && can[1] > 0;
        const okMix = !wantBoth || (first.includes('D') && first.includes('r'));
        const sexes = new Set(kids.slice(0, 4).map((k) => k.sex));
        if (okMix && sexes.size === 2) break;
      }
      return best;
    }
    function pedHTML() {
      const sym = (g, sex, key, extra, reveal, nm, num) => {
        const aff = M.pk(g) === 'r', car = reveal && g === 'Aa';
        const gl = (num ? num + ': ' : '') + (reveal ? M.show(g) : aff ? 'aa' : 'A_');
        const inner = `<span class="shape"></span><span class="gl ${reveal || aff ? '' : 'u'}">${gl}</span>`;
        const cls = `cr-sym ${sex} ${aff ? 'aff' : ''} ${car ? 'car' : ''} ${extra || ''}`;
        return key ? `<button type="button" class="${cls}" data-key="${key}" aria-label="${esc(nm)}">${inner}</button>` : `<div class="${cls}" role="img" aria-label="${esc(nm)}">${inner}</div>`;
      };
      const par = [0, 1].map((i) => {
        const g = S.parents[i], aff = M.pk(g) === 'r';
        const sex = i === 0 ? 'F' : 'M';
        const nm = `${t(M.names[i])}: ${g}, ${t(M.ph[M.phOf(g)].label)}. ${t(T2('Tap to change', 'बदलने के लिए टैप करो'))}`;
        return sym(g, sex, null, '', true, nm);
      });
      let h = `<div class="cr-ped"><div class="gen"><div class="couple" style="--n:2">${par[1]}${par[0]}</div></div>`;
      h += `<div class="drop"></div><div class="sib">`;
      for (let i = 0; i < PN; i++) {
        if (i === 4) h += `</div><div class="sib sib2">`;
        const k = S.ped && S.ped[i];
        const born = k && i < S.pedN;
        if (!born) { h += `<button type="button" class="cr-sym empty sib1 F" data-key="cell:0-${i}" aria-label="${esc(t(T2('Child ' + (i + 1) + ': not born yet', 'बच्चा ' + (i + 1) + ': अभी नहीं जन्मा')))}" ><span class="shape">?</span><span class="gl u">${i + 1}</span></button>`; continue; }
        const rev = !!S.filled[i];
        const nm = `${t(k.sex === 'F' ? T2('Daughter', 'पुत्री') : T2('Son', 'पुत्र'))} ${i + 1}: ${t(M.ph[M.phOf(k.g)].label)}${rev ? ', ' + k.g : ''}`;
        h += sym(k.g, k.sex, 'cell:0-' + i, 'sib1 ' + (S.flash === 'cell:' + i ? 'pop' : ''), rev, nm, i + 1);
      }
      h += `</div><div class="cr-key"><span><i style="border-radius:50%"></i>${esc(t(T2('female', 'स्त्री')))}</span><span><i></i>${esc(t(T2('male', 'पुरुष')))}</span><span><i style="background:#061233"></i>${esc(t(T2('has the trait (aa)', 'लक्षण है (aa)')))}</span><span><i style="background:linear-gradient(90deg,#fff 50%,#061233 50%)"></i>${esc(t(T2('carrier (Aa)', 'वाहक (Aa)')))}</span></div></div>`;
      return h;
    }
    function pedResults() {
      const kids = S.ped ? S.ped.slice(0, S.pedN) : [];
      const tl = tally(M, G());
      let h = `<h3>${esc(t(T2('The family so far', 'अब तक का परिवार')))}</h3>`;
      if (!kids.length) return h + `<p class="cr-lock">${esc(t(T2('Press “Cross the parents” to have the first four children.', '“संकरण कराओ” दबाओ, पहले चार बच्चे होंगे।')))}</p>`;
      const a = kids.filter((k) => M.pk(k.g) === 'r').length, u = kids.length - a;
      h += `<div class="cr-rat"><span>${esc(t(T2('Has the trait : does not', 'लक्षण है : नहीं है')))}</span><b>${a} : ${u}</b></div>`;
      const ex = tl.counts;
      h += `<p class="cr-lock">${esc(t(T2('Chance for each child, from the parents: ' + frac(ex[1], 4) + ' have the trait.', 'माता-पिता के जीनों से हर बच्चे में लक्षण होने की संभावना: ' + frac(ex[1], 4) + '।')))}</p>`;
      h += `<p class="cr-lock" style="margin-top:6px">${esc(t(T2('Tap a child to reveal the genes (' + Object.keys(S.filled).length + ' of ' + kids.length + ').', 'जीन देखने के लिए बच्चे पर टैप करो (' + kids.length + ' में से ' + Object.keys(S.filled).length + ')।')))}</p>`;
      return h;
    }

    // ----- DNA
    const helixW = (i, n) => Math.round(66 + 30 * Math.cos((i / 3.2) * 1.0 + 0.4));
    function dnaHTML() {
      const D = S.dna, tpl = S.tpl, n = tpl.length;
      let h = `<div class="cr-dna"><div class="cols"><span>${esc(t(T2('Template strand', 'टेम्पलेट लड़ी')))}<br>3′</span><span>${esc(t(T2('New strand', 'नई लड़ी')))}<br>5′</span></div>`;
      for (let i = 0; i < n; i++) {
        const b = tpl[i], s = D.slots[i], right = s && s === COMP[b], wrong = s && !right;
        const lines = right ? (b === 'A' || b === 'T' ? 2 : 3) : 3;
        const label = `${t(T2('Base', 'क्षारक'))} ${i + 1}: ${b}. ${t(T2('Partner', 'साथी'))}: ${s ? s + (right ? ' ' + t(T2('correct', 'सही')) : ' ' + t(T2('wrong, tap to change', 'ग़लत, बदलने के लिए टैप करो'))) : t(T2('empty, tap to choose a base', 'ख़ाली, क्षारक चुनने के लिए टैप करो'))}`;
        h += `<div class="cr-rung" style="--w:${helixW(i, n)}%"><span class="cr-bs" style="--c:${BCOL[b]}">${b}</span>
          <span class="cr-bond ${right ? 'ok' : ''}" aria-hidden="true">${'<i></i>'.repeat(right ? lines : 1)}</span>
          <button type="button" class="cr-bs ${s ? '' : 'empty'} ${right ? 'right' : ''} ${wrong ? 'wrong' : ''}" ${s ? `style="--c:${BCOL[s]}"` : ''} data-key="cell:0-${i}" aria-label="${esc(label)}">${s || '?'}</button></div>`;
      }
      h += `</div><p class="cr-legend" style="justify-content:center">${BASES.map((b) => `<span><span class="cr-chip" style="--c:${BCOL[b]}">${b}</span></span>`).join('')}<span>${esc(t(T2('A–T: 2 bonds, G–C: 3 bonds', 'A–T: 2 बंध, G–C: 3 बंध')))}</span></p>`;
      return h;
    }
    const chips = (s, cls, cs) => [...s].map((b) => `<span class="cr-chip ${cls || ''}" style="--c:${BCOL[b]}">${b}</span>`).join('');
    function dnaResults() {
      const D = S.dna, tpl = S.tpl, comp = [...tpl].map((b) => COMP[b]).join('');
      let h = '';
      const done = D.slots.every((s, i) => s === COMP[tpl[i]]);
      if (!done) {
        const ok = D.slots.filter((s, i) => s === COMP[tpl[i]]).length;
        h += `<h3>${esc(t(T2('Base pairing', 'क्षारक युग्मन')))}</h3><p class="cr-lock">${esc(t(T2('Tap a slot to choose its base. ' + ok + ' of ' + tpl.length + ' pairs are right. A pairs with T, G pairs with C.', 'क्षारक चुनने के लिए ख़ाने पर टैप करो। ' + tpl.length + ' में से ' + ok + ' जोड़े सही हैं। A का साथी T, G का साथी C।')))}</p>`;
        return h;
      }
      const dbl = tpl + comp, cnt = (b) => [...dbl].filter((x) => x === b).length;
      h += `<h3>${esc(t(T2('Chargaff’s rule', 'शारगाफ़ का नियम')))}</h3>
        <table class="cr-tbl"><tr>${BASES.map((b) => `<th><span class="cr-chip" style="--c:${BCOL[b]}">${b}</span></th>`).join('')}</tr><tr>${BASES.map((b) => `<td><b>${cnt(b)}</b></td>`).join('')}</tr></table>
        <div class="cr-rat" style="margin-top:8px"><span>A : T</span><b style="font-size:22px">${frac(cnt('A'), cnt('T')) === '1' ? '1 : 1' : cnt('A') / gcd(cnt('A'), cnt('T')) + ' : ' + cnt('T') / gcd(cnt('A'), cnt('T'))}</b><span>G : C</span><b style="font-size:22px">${frac(cnt('G'), cnt('C')) === '1' ? '1 : 1' : cnt('G') / gcd(cnt('G'), cnt('C')) + ' : ' + cnt('C') / gcd(cnt('G'), cnt('C'))}</b></div>`;
      if (D.rep) {
        h += `<h3 style="margin-top:14px">${esc(t(T2('Replication: 2 DNA molecules', 'द्विगुणन: 2 DNA अणु')))}</h3><div class="cr-rep">
          <div class="cr-mol"><b>DNA 1</b><div class="cr-chips" title="old">${chips(tpl, 'old')}</div><div class="cr-chips">${chips(comp, 'new')}</div></div>
          <div class="cr-mol"><b>DNA 2</b><div class="cr-chips">${chips(comp, 'old')}</div><div class="cr-chips">${chips(tpl, 'new')}</div></div></div>
          <p class="cr-legend"><span><span class="cr-chip old" style="--c:#fff">&nbsp;</span> ${esc(t(T2('old strand', 'पुरानी लड़ी')))}</span><span><span class="cr-chip new" style="--c:#fff;animation:none">&nbsp;</span> ${esc(t(T2('new strand', 'नई लड़ी')))}</span></p>
          <p class="cr-lock">${esc(t(T2('Each new DNA keeps one old strand: this is semi-conservative replication.', 'हर नए DNA में एक पुरानी लड़ी रहती है: इसे अर्ध-संरक्षी द्विगुणन कहते हैं।')))}</p>`;
      }
      if (D.tr) {
        const mrna = transcribe(tpl), cod = translate(mrna);
        h += `<h3 style="margin-top:14px">${esc(t(T2('mRNA and protein', 'mRNA और प्रोटीन')))}</h3><div class="cr-codons">`;
        for (let i = 0; i < tpl.length; i += 3) {
          const c = mrna.slice(i, i + 3), idx = i / 3, hit = cod[idx], stop = hit && hit.a === '*', skip = !hit;
          h += `<div class="cr-codon ${stop ? 'stop' : ''} ${skip ? 'skip' : ''}"><div class="cr-chips">${[...c].map((b) => `<span class="cr-chip" style="--c:${BCOL[b]}">${b}</span>`).join('')}</div><span class="aa">${skip ? esc(t(T2('(not read)', '(पढ़ा नहीं गया)'))) : esc(t(AA[hit.a]))}</span></div>`;
        }
        h += `</div><p class="cr-lock" style="margin-top:8px">${esc(t(T2('RNA has U (uracil) instead of T. Three bases make one codon; AUG starts the protein.', 'RNA में T की जगह U (यूरेसिल) होता है। तीन क्षारक मिलकर एक कोडॉन बनाते हैं; AUG से प्रोटीन शुरू होता है।')))}</p>`;
      }
      return h;
    }

    // ----- questions (made from the actual parents, never scripted)
    const fracPool = (d) => (d === 16 ? ['1/16', '3/16', '1/4', '3/8', '9/16', '1/2', '3/4'] : ['0', '1/4', '1/2', '3/4', '1']);
    function opts4(correct, pool, rnd) {
      const others = shuffle(pool.filter((x) => x !== correct), rnd).slice(0, 3);
      return shuffle([correct].concat(others), rnd);
    }
    function makeQuestion() {
      const rnd = rng(1000 + S.qi * 77 + (S.parents ? S.parents.join('').length : 5));
      const mk = (q, optsArr, ans, why) => ({ q, o: optsArr, a: ans, why });
      const strs = (arr) => arr.map((x) => (typeof x === 'string' ? T2(x, x) : x));
      if (DNA) {
        const tpl = S.tpl, i = S.qi % 3;
        if (i === 0) { const b = tpl[(S.qi + 1) % tpl.length]; const c = opts4(COMP[b], BASES, rnd); return mk(T2('A base on the template strand is ' + b + '. Which base pairs with it?', 'टेम्पलेट लड़ी पर एक क्षारक ' + b + ' है। उसका साथी कौन-सा क्षारक है?'), strs(c), c.indexOf(COMP[b]), T2('A pairs with T and G pairs with C, so ' + b + ' pairs with ' + COMP[b] + '.', 'A का साथी T और G का साथी C होता है, इसलिए ' + b + ' का साथी ' + COMP[b] + ' है।')); }
        if (i === 1) { const c = shuffle(['2', '3', '4', '1'], rnd); return mk(T2('How many hydrogen bonds hold a G–C pair together?', 'G–C जोड़े को कितने हाइड्रोजन बंध जोड़े रखते हैं?'), strs(c), c.indexOf('3'), T2('G–C has 3 hydrogen bonds; A–T has 2. That is why G–C rich DNA is harder to unzip.', 'G–C में 3 हाइड्रोजन बंध होते हैं; A–T में 2। इसलिए G–C वाला DNA खोलना कठिन होता है।')); }
        const prot = translate(transcribe(tpl)).filter((x) => x.a !== '*').length;
        const cs = shuffle([String(prot), String(prot + 1), String(prot + 2), String(Math.max(1, prot - 1))].filter((x, k, a) => a.indexOf(x) === k), rnd);
        return mk(T2('The template has ' + tpl.length + ' bases and a stop codon. How many amino acids does the protein have?', 'टेम्पलेट में ' + tpl.length + ' क्षारक और एक स्टॉप कोडॉन है। प्रोटीन में कितने अमीनो अम्ल होंगे?'), strs(cs), cs.indexOf(String(prot)), T2('Every 3 bases make one codon. The stop codon ends the chain without adding an amino acid, so the protein has ' + prot + '.', 'हर 3 क्षारक एक कोडॉन बनाते हैं। स्टॉप कोडॉन बिना अमीनो अम्ल जोड़े श्रृंखला रोक देता है, इसलिए प्रोटीन में ' + prot + ' अमीनो अम्ल हैं।'));
      }
      const g = G(), tl = tally(M, g), tot = tl.total;
      const nz = tl.counts.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
      const kinds = [];
      if (TEST) {
        const un = S.truth;
        const A = M.alleles[0][0], a = M.alleles[0][1];
        const c = [A + A, A + a, a + a, null].map((x) => x);
        const o = [T2(A + A, A + A), T2(A + a, A + a), T2(a + a, a + a), T2('Cannot tell', 'बता नहीं सकते')];
        if (S.qi % 2 === 0) return mk(T2('Look at the real offspring. What is the genotype of the unknown ' + M.tr.dom.en.toLowerCase() + ' plant?', 'वास्तविक संतति देखो। अज्ञात ' + M.tr.dom.hi + ' पौधे का जीनोटाइप क्या है?'), o, un === A + A ? 0 : 1,
          un === A + A ? T2('Every offspring shows the dominant trait. A ' + a + a + ' tester gives only ' + a + ', so the unknown parent must give only ' + A + ': it is ' + A + A + '.', 'हर संतति में प्रभावी लक्षण है। ' + a + a + ' परीक्षक केवल ' + a + ' देता है, इसलिए अज्ञात पौधा केवल ' + A + ' देता है: वह ' + A + A + ' है।')
            : T2('About half the offspring show the recessive trait. They got ' + a + ' from both parents, so the unknown parent gave ' + a + ' too: it is ' + A + a + '.', 'लगभग आधी संतति में अप्रभावी लक्षण है। उन्हें दोनों माता-पिता से ' + a + ' मिला, इसलिए अज्ञात पौधे ने भी ' + a + ' दिया: वह ' + A + a + ' है।'));
        const o2 = [T2('It can only give ' + a + ', so every allele of the other parent shows', 'यह केवल ' + a + ' देता है, इसलिए दूसरे माता-पिता का हर एलील दिखता है'), T2('It is taller than the other plant', 'यह दूसरे पौधे से ज़्यादा लंबा है'), T2('It makes more seeds', 'यह अधिक बीज बनाता है'), T2('It is always dominant', 'यह हमेशा प्रभावी होता है')];
        return mk(T2('Why do we cross with the homozygous recessive (' + a + a + ') plant?', 'समयुग्मजी अप्रभावी (' + a + a + ') पौधे से संकरण क्यों कराते हैं?'), o2, 0, T2('A ' + a + a + ' plant hides nothing: whatever the unknown parent gives, the offspring show it.', a + a + ' पौधा कुछ नहीं छिपाता: अज्ञात पौधा जो भी एलील दे, संतति में वह दिख जाता है।'));
      }
      if (mode === 'incomplete-dominance' && S.qi % 4 === 0) {
        return mk(T2('What colour is an Rr snapdragon?', 'Rr स्नैपड्रैगन का रंग क्या है?'), [T2('Red', 'लाल'), T2('Pink', 'गुलाबी'), T2('White', 'सफ़ेद'), T2('Purple', 'बैंगनी')], 1, T2('Neither R nor r is dominant. Red and white mix, so Rr is pink.', 'न R प्रभावी है न r। लाल और सफ़ेद मिलते हैं, इसलिए Rr गुलाबी है।'));
      }
      if (mode === 'sex' && S.qi % 3 === 0) return mk(T2('Which parent decides if the baby is a girl or a boy?', 'बच्चा लड़की होगा या लड़का, यह कौन-सा माता-पिता तय करता है?'), [T2('Father', 'पिता'), T2('Mother', 'माँ'), T2('Both equally', 'दोनों बराबर'), T2('Neither', 'कोई नहीं')], 0, T2('Every egg carries X. A sperm carries X or Y. X + X gives a girl, X + Y gives a boy, so the father’s sperm decides.', 'हर अंडाणु में X होता है। शुक्राणु में X या Y होता है। X + X से लड़की, X + Y से लड़का, इसलिए पिता का शुक्राणु तय करता है।'));
      if (mode === 'sex' && S.qi % 3 === 1) return mk(T2('Which sex chromosome does a human egg carry?', 'मानव अंडाणु में कौन-सा लिंग गुणसूत्र होता है?'), [T2('X', 'X'), T2('Y', 'Y'), T2('XX', 'XX'), T2('XY', 'XY')], 0, T2('The mother is XX, so every egg gets one X.', 'माँ XX है, इसलिए हर अंडाणु को एक X मिलता है।'));
      if (mode === 'blood-groups' && S.qi % 3 === 1) {
        const can = tl.counts[3] > 0;
        return mk(T2('Can these parents have a child with blood group O?', 'क्या इन माता-पिता का बच्चा O रक्त समूह का हो सकता है?'), [T2('Yes', 'हाँ'), T2('No', 'नहीं')], can ? 0 : 1, can ? T2('Yes: the square has an ii box. Both parents must give i.', 'हाँ: वर्ग में ii वाला ख़ाना है। दोनों को i देना होगा।') : T2('No: no box in the square is ii.', 'नहीं: वर्ग में कोई ख़ाना ii नहीं है।'));
      }
      if (mode === 'blood-groups' && S.qi % 3 === 2) {
        const o = [{ en: 'IAIA', hi: 'IAIA', h: 'I<sup>A</sup>I<sup>A</sup>' }, { en: 'IAi', hi: 'IAi', h: 'I<sup>A</sup>i' }, { en: 'ii', hi: 'ii', h: 'ii' }, { en: 'IAIB', hi: 'IAIB', h: 'I<sup>A</sup>I<sup>B</sup>' }];
        return mk(T2('Which genotype gives blood group O?', 'कौन-सा जीनोटाइप O रक्त समूह देता है?'), o, 2, T2('Group O needs two i alleles. Iᴬ and Iᴮ are both dominant over i.', 'O समूह के लिए दो i एलील चाहिए। Iᴬ और Iᴮ दोनों i पर प्रभावी हैं।'));
      }
      if (PED && S.ped) {
        const kids = S.ped.slice(0, S.pedN), affK = kids.some((k) => M.pk(k.g) === 'r');
        const pU = S.parents.every((p) => M.pk(p) === 'D');
        if (pU && affK && S.qi % 2 === 0) return mk(T2('Both parents do not show the trait but a child does. Is the trait dominant or recessive?', 'दोनों माता-पिता में लक्षण नहीं है पर एक बच्चे में है। यह लक्षण प्रभावी है या अप्रभावी?'), [T2('Recessive', 'अप्रभावी'), T2('Dominant', 'प्रभावी')], 0, T2('The child got one a from each parent, so both parents carry a hidden a. Carriers (Aa) look normal.', 'बच्चे को हर माता-पिता से एक a मिला, इसलिए दोनों में छिपा a है। वाहक (Aa) सामान्य दिखते हैं।'));
        if (affK && S.qi % 2 === 1) { const o = ['AA', 'Aa', 'aa', 'A_']; return mk(T2('What is the genotype of a child who has the trait?', 'जिस बच्चे में लक्षण है उसका जीनोटाइप क्या है?'), strs(o), 2, T2('A recessive trait shows only when both alleles are a.', 'अप्रभावी लक्षण तभी दिखता है जब दोनों एलील a हों।')); }
      }
      // generic: fraction / genotype count / ratio
      const pick = nz[S.qi % nz.length], ph = M.ph[pick];
      const lab = t0(ph.label);
      const kind = S.qi % 3;
      if (kind === 0 || (mode === 'blood-groups' && kind !== 0) || PED) {
        const c = frac(tl.counts[pick], tot), pool = fracPool(tot);
        const o = opts4(pool.includes(c) ? c : c, pool.concat([c]).filter((x, i, a) => a.indexOf(x) === i), rnd);
        return mk(T2('What fraction of the offspring will be “' + lab.en + '”?', 'संतति का कितना भाग “' + lab.hi + '” होगा?'), strs(o), o.indexOf(c), T2('Count the squares: ' + tl.counts[pick] + ' of ' + tot + ' are “' + lab.en + '”, which is ' + c + '.', 'वर्ग गिनो: ' + tot + ' में से ' + tl.counts[pick] + ' “' + lab.hi + '” हैं, यानी ' + c + '।'));
      }
      if (kind === 1) {
        const d = Object.keys(tl.geno).length, cs = [d, d + 1, d + 2, Math.max(1, d - 1)].filter((x, i, a) => a.indexOf(x) === i).slice(0, 4).sort((a, b) => a - b).map(String);
        const o = shuffle(cs, rnd);
        return mk(T2('How many different genotypes can the offspring have?', 'संतति के कितने अलग-अलग जीनोटाइप हो सकते हैं?'), strs(o), o.indexOf(String(d)), T2('Different boxes can have the same genotype. Counting each kind once gives ' + d + '.', 'अलग ख़ानों में एक ही जीनोटाइप हो सकता है। हर प्रकार को एक बार गिनने पर ' + d + ' मिलते हैं।'));
      }
      const pr = reduce(tl.counts).filter((x, i) => tl.counts[i] > 0), correct = pr.length === 1 ? 'same' : pr.join(' : ');
      const pool = ['3 : 1', '1 : 1', '1 : 2 : 1', '9 : 3 : 3 : 1', '3 : 3 : 1 : 1', '1 : 1 : 1 : 1', 'same'].filter((x) => (M.ph.length === 2 ? x.split(' : ').length <= 2 || x === 'same' : M.ph.length === 3 ? x.split(' : ').length === 3 || x === 'same' || x === '1 : 1' : true));
      const poolx = pool.includes(correct) ? pool : pool.concat([correct]);
      const o = opts4(correct, poolx, rnd);
      return mk(T2('What is the phenotype ratio of these offspring?', 'इस संतति का फीनोटाइप अनुपात क्या है?'), o.map((x) => (x === 'same' ? T2('All the same', 'सब एक जैसे') : T2(x, x))), o.indexOf(correct), T2('Add up the squares of each look: ' + (correct === 'same' ? 'all squares look the same.' : correct + '.'), 'हर रूप के वर्ग गिनो: ' + (correct === 'same' ? 'सभी वर्ग एक जैसे हैं।' : correct + '।')));
    }
    const t0 = (x) => ({ en: mode === 'blood-groups' ? x.en : x.en.toLowerCase(), hi: x.hi });
    function questionHTML() {
      const locked = (() => {
        if (DNA) return !S.dna.slots.every((s, i) => s === COMP[S.tpl[i]]) ? T2('Finish pairing the bases first.', 'पहले क्षारकों को जोड़ना पूरा करो।') : null;
        if (!S.crossed) return T2('Cross the parents to get a question.', 'सवाल पाने के लिए पहले संकरण कराओ।');
        if (TEST && S.obs.total < 16) return T2('Grow some offspring first, then decide.', 'पहले कुछ संतति उगाओ, फिर तय करो।');
        if (PED && S.pedN < 1) return T2('Cross the parents to get a question.', 'सवाल पाने के लिए पहले संकरण कराओ।');
        return null;
      })();
      if (locked) return `<div class="cr-card cr-q"><h3>${esc(t(T2('Question', 'सवाल')))}</h3><p class="cr-lock">${esc(t(locked))}</p><div class="cr-opts"><button type="button" class="cr-opt off" data-key="answer" aria-disabled="true" data-i="x">${esc(t(T2('Answer', 'उत्तर')))}</button></div></div>`;
      if (!S.q) S.q = makeQuestion();
      const q = S.q, st = S.qState || {};
      let h = `<div class="cr-card cr-q"><h3>${esc(t(T2('Question', 'सवाल')))}</h3><h4>${esc(t(q.q))}</h4><div class="cr-opts" role="group">`;
      q.o.forEach((o, i) => {
        const cls = st.right === i ? 'good done' : st.wrong && st.wrong.includes(i) ? 'bad' : st.right != null ? 'off done' : '';
        h += `<button type="button" class="cr-opt ${cls}" data-key="answer" data-i="${i}">${o.h ? o.h : esc(t(o))}</button>`;
      });
      h += '</div>';
      if (st.right != null) h += `<p class="cr-why good" role="status">${esc(t(T2('Right! ', 'सही! ')))}${esc(t(q.why))}</p>`;
      else if (st.wrong && st.wrong.length) h += `<p class="cr-why">${esc(t(T2('Not quite. Look again and try another answer.', 'ठीक नहीं। फिर से देखो और दूसरा उत्तर चुनो।')))}</p>`;
      return h + '</div>';
    }

    // ----- main render
    function render() {
      if (dead) return;
      const act = document.activeElement;
      const fk = act && root.contains(act) && act.getAttribute ? (act.getAttribute('data-key') || '') + '|' + (act.getAttribute('data-i') || '') : null;
      const canGrow = DNA ? S.dna.slots.every((s, i) => s === COMP[S.tpl[i]]) : S.crossed;
      const dnaDone = DNA && canGrow;
      const left = DNA ? dnaHTML() : PED ? pedHTML() : gridHTML();
      const right = DNA ? dnaResults() : PED ? pedResults() : resultsHTML();
      const helix = `<svg class="cr-helix" viewBox="0 0 46 46" aria-hidden="true"><path d="M12 4c24 10-24 14 0 20s24 12 0 18" fill="none" stroke="#B9F27C" stroke-width="3.2" stroke-linecap="round"/><path d="M34 4c-24 10 24 14 0 20s-24 12 0 18" fill="none" stroke="#7DE3D3" stroke-width="3.2" stroke-linecap="round"/><path d="M16 11h14M14 23h18M16 35h14" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".85"/></svg>`;
      root.innerHTML = `<div class="cr">
        <div class="cr-hero">${helix}<div><h2>${esc(t(title()))}</h2><p>${esc(t(subtitle()))}</p></div></div>
        <div class="cr-body">
          <div class="cr-card">
            ${DNA ? '' : parentsHTML()}
            <div class="cr-row">
              <button type="button" class="cr-btn ${DNA ? (canGrow && !S.dna.rep ? '' : canGrow ? '' : 'off') : S.crossed ? 'off' : ''}" data-key="cross">${esc(t(crossLabel()))}</button>
              <button type="button" class="cr-btn alt ${(DNA ? canGrow : S.crossed && (!PED || S.pedN < PN)) ? '' : 'off'}" data-key="grow">${esc(t(growLabel()))}</button>
            </div>
            <div class="cr-status" aria-live="polite">${esc(S.msg ? t(S.msg) : t(startMsg()))}</div>
            <div style="margin-top:12px">${left}</div>
          </div>
          <div style="display:grid;gap:14px;min-width:0">
            <div class="cr-card cr-res">${right}</div>
            ${questionHTML()}
          </div>
        </div></div>`;
      S.flash = null;
      if (S.obs) S.obs.recent.forEach((r) => { r.nw = false; });
      if (fk) { const el = [...root.querySelectorAll('[data-key]')].find((e) => (e.getAttribute('data-key') || '') + '|' + (e.getAttribute('data-i') || '') === fk); if (el) el.focus({ preventScroll: true }); }
    }
    function startMsg() {
      if (DNA) return T2('Tap each empty box on the right and choose the partner base for the template.', 'दाईं ओर हर ख़ाली ख़ाने पर टैप करके टेम्पलेट के लिए साथी क्षारक चुनो।');
      if (PED) return T2('Tap a parent to change its genes, then cross.', 'जीन बदलने के लिए माता-पिता पर टैप करो, फिर संकरण कराओ।');
      if (TEST) return T2('The tall plant could be ' + M.alleles[0][0] + M.alleles[0][0] + ' or ' + M.alleles[0][0] + M.alleles[0][1] + '. Cross it, grow offspring and find out.', 'लंबा पौधा ' + M.alleles[0][0] + M.alleles[0][0] + ' या ' + M.alleles[0][0] + M.alleles[0][1] + ' हो सकता है। संकरण कराओ, संतति उगाओ और पता लगाओ।');
      return T2('Tap a parent to change its genotype, then press Cross.', 'जीनोटाइप बदलने के लिए माता-पिता पर टैप करो, फिर संकरण कराओ।');
    }

    // ----- actions
    function onParent(i) {
      if (DNA) { return; }
      if (mode === 'sex') { say(i === 0 ? T2('Mother has two X chromosomes (XX). Every egg gets one X.', 'माँ में दो X गुणसूत्र (XX) हैं। हर अंडाणु को एक X मिलता है।') : T2('Father has one X and one Y (XY). A sperm gets X or Y.', 'पिता में एक X और एक Y (XY) है। शुक्राणु को X या Y मिलता है।')); api.speak && api.speak(t(S.msg)); render(); return; }
      if (TEST && i === 1) { say(T2('The tester must be ' + S.parents[1] + ': it hides nothing.', 'परीक्षक ' + S.parents[1] + ' ही होना चाहिए: वह कुछ नहीं छिपाता।')); render(); return; }
      const list = M.opts;
      const k = list.indexOf(S.parents[i]);
      S.parents[i] = list[(k + 1) % list.length];
      if (TEST) S.filled = {}; else resetCross();
      say(T2('Changed: now ' + S.parents[i] + '. Press Cross.', 'बदला: अब ' + S.parents[i] + ' है। संकरण कराओ।'));
      api.record(t(T2('Set ' + t(M.names[i]) + ' to ' + S.parents[i], t(M.names[i]) + ' को ' + S.parents[i] + ' किया')));
      render();
    }
    function onDnaParent() {
      S.strandI = (S.strandI + 1) % STRANDS.length; S.tpl = STRANDS[S.strandI]; resetCross(); say(null); render();
    }
    function onCross() {
      if (DNA) {
        if (!S.dna.slots.every((s, i) => s === COMP[S.tpl[i]])) { api.toast(T2('Pair every base first.', 'पहले हर क्षारक का जोड़ा बनाओ।')); return; }
        if (S.dna.rep) { api.toast(T2('Already copied. Try the next step.', 'प्रतिलिपि बन चुकी। अगला चरण आज़माओ।')); return; }
        S.dna.rep = true; say(T2('The strands unzipped and each one built a new partner: two identical DNA molecules.', 'लड़ियाँ खुलीं और हर एक ने नया साथी बनाया: दो एक जैसे DNA अणु।'));
        api.record(t(T2('Copied the DNA', 'DNA की प्रतिलिपि बनाई'))); render(); api.emit('crossed'); return;
      }
      if (S.crossed) { api.toast(T2('Already crossed. Change a parent to try a new cross.', 'संकरण हो चुका। नया संकरण देखने के लिए माता-पिता बदलो।')); return; }
      S.crossed = true; S.flash = 'cross';
      if (PED) { S.ped = pedMake(); S.pedN = 4; say(T2('Four children were born. Tap each child to reveal their genes.', 'चार बच्चे हुए। उनके जीन देखने के लिए हर बच्चे पर टैप करो।')); }
      else say(T2('Crossed! Each parent makes gametes with one allele each. Tap the squares to join them.', 'संकरण हुआ! हर माता-पिता एक-एक एलील वाले युग्मक बनाता है। उन्हें जोड़ने के लिए वर्गों पर टैप करो।'));
      api.record(t(T2('Crossed ', 'संकरण: ')) + S.parents.join(' × '));
      render(); api.emit('crossed');
    }
    function onCell(key) {
      if (DNA) {
        const i = +key.split('-')[1], D = S.dna;
        const cur = D.slots[i], was = cur === COMP[S.tpl[i]];
        if (was) { api.toast(T2('This pair is already right.', 'यह जोड़ा पहले से सही है।')); return; }
        D.slots[i] = BASES[(cur ? BASES.indexOf(cur) + 1 : 0) % 4];
        const ok = D.slots[i] === COMP[S.tpl[i]];
        if (ok) say(T2(S.tpl[i] + ' pairs with ' + D.slots[i] + ' (' + (S.tpl[i] === 'A' || S.tpl[i] === 'T' ? '2' : '3') + ' hydrogen bonds).', S.tpl[i] + ' का साथी ' + D.slots[i] + ' है (' + (S.tpl[i] === 'A' || S.tpl[i] === 'T' ? '2' : '3') + ' हाइड्रोजन बंध)।'));
        else say(T2(D.slots[i] + ' does not pair with ' + S.tpl[i] + '. Try another base.', D.slots[i] + ' का साथी ' + S.tpl[i] + ' नहीं है। दूसरा क्षारक आज़माओ।'));
        const nowDone = D.slots.every((s, k) => s === COMP[S.tpl[k]]);
        S.flash = null; render();
        if (nowDone) { say(T2('All pairs are right: A–T and G–C in equal numbers. Now unzip and copy.', 'सभी जोड़े सही हैं: A–T और G–C बराबर संख्या में। अब खोलो और प्रतिलिपि बनाओ।')); api.record(t(T2('Completed the base pairs', 'क्षारक जोड़े पूरे किए'))); render(); api.emit('filled'); api.emit('ratio'); }
        return;
      }
      if (!S.crossed) { api.toast(T2('Press “Cross the parents” first.', 'पहले “संकरण कराओ” दबाओ।')); return; }
      const k = key.replace('cell:', '');
      if (PED) {
        const i = +k.split('-')[1];
        if (!S.ped || i >= S.pedN) { api.toast(T2('This child is not born yet. Press “Add a child”.', 'यह बच्चा अभी नहीं जन्मा। “एक बच्चा जोड़ो” दबाओ।')); return; }
        const kid = S.ped[i];
        if (S.filled[i]) { say(T2('Child ' + (i + 1) + ': ' + kid.g, 'बच्चा ' + (i + 1) + ': ' + kid.g)); render(); return; }
        S.filled[i] = true; S.flash = 'cell:' + i;
        const aff = M.pk(kid.g) === 'r';
        say(aff ? T2('Child ' + (i + 1) + ' is aa: both alleles are a, so the trait shows.', 'बच्चा ' + (i + 1) + ' aa है: दोनों एलील a हैं, इसलिए लक्षण दिखता है।') : kid.g === 'Aa' ? T2('Child ' + (i + 1) + ' is Aa: a carrier. It looks normal but can pass on a.', 'बच्चा ' + (i + 1) + ' Aa है: वाहक। सामान्य दिखता है पर a आगे दे सकता है।') : T2('Child ' + (i + 1) + ' is AA: no a allele at all.', 'बच्चा ' + (i + 1) + ' AA है: उसमें a एलील बिल्कुल नहीं है।'));
        api.record(t(T2('Revealed child ' + (i + 1) + ': ' + kid.g, 'बच्चा ' + (i + 1) + ' के जीन देखे: ' + kid.g)));
        const done = S.ped.slice(0, S.pedN).every((_, j) => S.filled[j]);
        render();
        if (done) { api.emit('filled'); api.emit('ratio'); }
        return;
      }
      if (S.filled[k]) { const [r, c] = k.split('-').map(Number), g = G().cells[r][c]; api.speak && api.speak(M.say(g)); return; }
      S.filled[k] = true; S.flash = 'cell:' + k;
      const [r, c] = k.split('-').map(Number), g = G().cells[r][c];
      api.record(t(T2('Filled square ' + (r + 1) + ',' + (c + 1) + ': ' + g, 'वर्ग ' + (r + 1) + ',' + (c + 1) + ' भरा: ' + g)));
      const done = allFilled();
      if (done) {
        const tl = tally(M, G()), pr = reduce(tl.counts).filter((x, i) => tl.counts[i] > 0).join(' : ');
        say(T2('Square complete! Phenotype ratio ' + pr + '.', 'वर्ग पूरा! फीनोटाइप अनुपात ' + pr + '।'));
      } else say(T2(g + ': ' + t(M.ph[M.phOf(g)].label) + '. ' + (nCells() - Object.keys(S.filled).length) + ' squares left.', g + ': ' + M.ph[M.phOf(g)].label.hi + '। ' + (nCells() - Object.keys(S.filled).length) + ' वर्ग बचे।'));
      render();
      if (done) { api.emit('filled'); api.emit('ratio'); }
    }
    function onGrow() {
      if (DNA) {
        if (!S.dna.slots.every((s, i) => s === COMP[S.tpl[i]])) { api.toast(T2('Pair every base first.', 'पहले हर क्षारक का जोड़ा बनाओ।')); return; }
        S.dna.tr = true; say(T2('The template was read: A became U in mRNA, and each codon picked an amino acid.', 'टेम्पलेट पढ़ा गया: mRNA में A की जगह U आया और हर कोडॉन ने एक अमीनो अम्ल चुना।'));
        api.record(t(T2('Made mRNA and a protein', 'mRNA और प्रोटीन बनाया'))); render(); api.emit('grown'); return;
      }
      if (!S.crossed) { api.toast(T2('Press “Cross the parents” first.', 'पहले “संकरण कराओ” दबाओ।')); return; }
      if (PED) {
        if (S.pedN >= PN) { api.toast(T2('The family is complete (8 children).', 'परिवार पूरा है (8 बच्चे)।')); return; }
        S.pedN++; say(T2('Child ' + S.pedN + ' was born. Tap to reveal their genes.', 'बच्चा ' + S.pedN + ' जन्मा। जीन देखने के लिए टैप करो।')); S.flash = 'cell:' + (S.pedN - 1); S.q = null;
        api.record(t(T2('Added a child', 'एक बच्चा जोड़ा'))); render(); api.emit('grown'); return;
      }
      const G2 = gridOf(M, truthParents()[0], truthParents()[1]), o = S.obs, n = 16;
      for (let i = 0; i < n; i++) {
        const r = Math.floor(Math.random() * G2.rows.length), c = Math.floor(Math.random() * G2.cols.length), g = G2.cells[r][c], k = M.phOf(g);
        o.counts[k]++; o.total++; o.recent.push({ k, nw: true, d: i * 35 });
      }
      if (o.recent.length > 160) o.recent.splice(0, o.recent.length - 160);
      const desc = M.ph.map((p, i) => o.counts[i] + ' ' + t0(p.label).en).join(', ');
      say(T2('Grown ' + n + ' more offspring (' + o.total + ' in all): ' + desc + '.', n + ' और संतति उगी (कुल ' + o.total + '): ' + M.ph.map((p, i) => o.counts[i] + ' ' + p.label.hi).join(', ') + '।'));
      api.record(t(T2('Grew offspring: ' + o.total + ' in all', 'संतति उगाई: कुल ' + o.total)));
      render(); api.emit('grown'); api.emit('ratio');
    }
    function onAnswer(i) {
      if (!S.q) return;
      const st = S.qState || (S.qState = { wrong: [] });
      if (st.right != null) return;
      if (S.q.a === i) {
        st.right = i; api.celebrate && api.celebrate(); api.record(t(T2('Answered right: ', 'सही उत्तर: ')) + t(S.q.q));
        render(); api.emit('answered:right');
        later(() => { S.q = null; S.qState = null; S.qi++; render(); }, 3200);
      } else {
        if (!st.wrong.includes(i)) st.wrong.push(i);
        api.record(t(T2('Answered wrong: ', 'ग़लत उत्तर: ')) + t(S.q.q)); render(); api.emit('answered:wrong');
      }
    }

    function onClick(e) {
      const el = e.target.closest ? e.target.closest('[data-key]') : null;
      if (!el || !root.contains(el)) return;
      const key = el.getAttribute('data-key');
      if (api.allowed && !api.allowed(key)) { api.nudge && api.nudge(key); return; }
      if (key.startsWith('parent:')) { const i = +key.slice(7); DNA ? onDnaParent() : onParent(i); }
      else if (key === 'cross') onCross();
      else if (key === 'grow') onGrow();
      else if (key.startsWith('cell:')) onCell(key);
      else if (key === 'answer') {
        const i = el.getAttribute('data-i');
        if (i === 'x' || i == null) { api.toast(T2('Do the steps above first.', 'पहले ऊपर के चरण करो।')); return; }
        onAnswer(+i);
      }
    }
    root.addEventListener('click', onClick);
    render();
    return { destroy() { dead = true; timers.forEach(clearTimeout); root.removeEventListener('click', onClick); root.innerHTML = ''; } };
  }

  NCA_T.register({
    id: 'cross',
    css: CSS,
    validate,
    keys,
    demo: { mode: 'dihybrid', trait: 'seed-shape', parents: ['RrYy', 'RrYy'] },
    modes: MODES,
    model: { build, parseG, gridOf, tally, codonAA, transcribe, translate, reduce },
    mount,
  });
})();
