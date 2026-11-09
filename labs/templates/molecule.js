// Template: Molecule builder. Join atoms by sharing electrons (covalent), give electrons away (ionic), build and name
// carbon compounds (IUPAC up to C6, NCERT functional groups), see VSEPR shapes, and find isomers. Valency rules are
// enforced in code, so a child can only ever build a molecule that is chemically true. Config:
//   { mode: 'covalent'|'ionic'|'carbon'|'shapes'|'isomers', target?: formula or IUPAC name the child should build,
//     atoms?: [symbols shown on the palette] }
// Views: structure (ball and stick), dot (electron dot), 3d (rotating model, drawn in SVG: no library needed).
(function () {
  const L = window.NCA_LIB;
  const { esc, sub, svgSub, lerp, ease, tween } = L;
  const reduced = L.reducedMotion;
  const CSS = `.mo { display: flex; flex-direction: column; gap: 10px; }
.mo-top { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
.mo-goal { background: linear-gradient(90deg, #6D28D9, #1D4ED8); color: #fff; border-radius: 12px; padding: 8px 14px; font-weight: 700; display: flex; gap: 8px; align-items: center; flex: 1 1 220px; min-height: 44px; }
.mo-goal.done { background: linear-gradient(90deg, #0F766E, #22C55E); color: #06251f; }
.mo-goal b { font-family: var(--font-display); font-size: 1.1rem; }
.mo-views { display: inline-flex; flex: 0 1 auto; background: var(--sunk); border-radius: 12px; padding: 3px; gap: 2px; }
.mo-views button { flex: 1 1 auto; white-space: nowrap; border: 0; background: transparent; border-radius: 9px; min-height: 44px; padding: 0 14px; font-weight: 700; color: var(--ink-2); }
.mo-views button[aria-pressed="true"] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 3px rgba(6,18,51,.15); }
.mo-svg { width: 100%; height: auto; max-height: 540px; display: block; border-radius: 16px; background: radial-gradient(120% 90% at 50% 0%, #1B2A6B 0%, #0B1340 60%, #061233 100%); touch-action: pan-y; }
.mo-svg.rot { touch-action: none; cursor: grab; }
.mo-svg text { font-family: var(--font-display); font-weight: 800; pointer-events: none; user-select: none; }
.mo-atom { cursor: pointer; }
.mo-atom:focus-visible circle:first-of-type { stroke: #FFD23F; stroke-width: 5; }
.mo-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.mo-lbl { font-weight: 700; color: var(--ink-2); font-size: .88rem; margin-right: 2px; }
.mo-pal { border: 0; min-width: 48px; min-height: 48px; border-radius: 14px; font-family: var(--font-display); font-weight: 800; font-size: 1.15rem; color: #1E293B; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; padding: 4px 8px; box-shadow: 0 3px 0 rgba(6,18,51,.25), inset 0 -3px 0 rgba(0,0,0,.08); transition: transform .15s; }
.mo-pal small { font-family: var(--font-body); font-weight: 600; font-size: .62rem; line-height: 1.4; margin-top: 2px; opacity: .85; max-width: 72px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mo-pal:hover { transform: translateY(-2px); }
.mo-pal:active { transform: translateY(1px); }
.mo-pal.light { color: #fff; }
.mo-pal.metal { border: 2px solid rgba(255,255,255,.5); }
.mo-bond { border: 2px solid var(--line); background: var(--surface); color: var(--ink); min-height: 48px; min-width: 56px; border-radius: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; padding: 0 12px; }
.mo-bond[aria-pressed="true"] { border-color: var(--grape); background: var(--grape-t); color: var(--ink); }
.mo-bond svg { width: 26px; height: 16px; }
.mo-grp { border: 2px solid var(--line); background: var(--surface); color: var(--ink); min-height: 48px; border-radius: 12px; font-weight: 700; padding: 0 12px; display: inline-flex; align-items: center; gap: 6px; }
.mo-grp b { font-family: var(--font-display); color: var(--grape); white-space: nowrap; }
.mo-go { border: 0; min-height: 48px; border-radius: 12px; padding: 0 18px; font-weight: 800; background: var(--action); color: #1E293B; display: inline-flex; align-items: center; gap: 8px; font-size: 1.02rem; }
.mo-go:disabled { opacity: .5; cursor: default; }
.mo-out { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px; display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; min-height: 54px; }
.mo-formula { font-family: var(--font-display); font-weight: 800; font-size: 1.5rem; color: var(--royal); }
.mo-name { font-weight: 700; font-size: 1.05rem; }
.mo-note { flex-basis: 100%; margin: 0; color: var(--ink-2); }
.mo-badge { border-radius: 999px; padding: 3px 12px; font-weight: 700; font-size: .85rem; background: var(--sunk); color: var(--ink-2); border: 1.5px dashed var(--line); }
.mo-badge.on { background: var(--good); color: #fff; border-style: solid; border-color: var(--good); }
:root[data-theme="dark"] .mo-badge.on { color: #08201D; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .mo-badge.on { color: #08201D; } }
.mo-found { display: flex; flex-wrap: wrap; gap: 6px; }
.mo-found span { background: var(--grape-t); color: var(--ink); border-radius: 999px; padding: 3px 12px; font-weight: 700; font-size: .9rem; }
.mo-tools { display: flex; gap: 8px; flex-wrap: wrap; margin-left: auto; }
.mo-seg { display: flex; gap: 6px; flex: 1 1 260px; max-width: 420px; }
.mo-seg .mo-bond { flex: 1 1 0; justify-content: center; padding: 0 8px; min-width: 0; }
.mo-grps { display: flex; flex-wrap: wrap; gap: 8px; }
.mo-glbl { margin-left: 6px; }
@media (max-width: 560px) {
  .mo-grps { display: grid; grid-template-columns: 1fr 1fr; width: 100%; }
  .mo-grp { padding: 0 8px; font-size: .9rem; justify-content: flex-start; }
  .mo-glbl { margin-left: 0; flex-basis: 100%; }
  .mo-tools { margin-left: 0; width: 100%; }
  .mo-tools button { flex: 1 1 auto; }
}`;

  // ---- elements: name, valence electrons, covalent valency, shells (Bohr), colour, radius ----
  const EL = {
    H: { en: 'Hydrogen', hi: 'हाइड्रोजन', ve: 1, val: 1, sh: [1], col: '#E8EEF8', ink: '#1E293B', r: 0.62, z: 1 },
    C: { en: 'Carbon', hi: 'कार्बन', ve: 4, val: 4, sh: [2, 4], col: '#4B5563', ink: '#fff', r: 0.86, z: 6 },
    N: { en: 'Nitrogen', hi: 'नाइट्रोजन', ve: 5, val: 3, sh: [2, 5], col: '#2563EB', ink: '#fff', r: 0.82, z: 7 },
    O: { en: 'Oxygen', hi: 'ऑक्सीजन', ve: 6, val: 2, sh: [2, 6], col: '#EF4444', ink: '#fff', r: 0.8, z: 8 },
    F: { en: 'Fluorine', hi: 'फ्लुओरीन', ve: 7, val: 1, sh: [2, 7], col: '#86EFAC', ink: '#1E293B', r: 0.76, z: 9 },
    S: { en: 'Sulphur', hi: 'सल्फर', ve: 6, val: 2, sh: [2, 8, 6], col: '#FACC15', ink: '#1E293B', r: 1.0, z: 16 },
    Cl: { en: 'Chlorine', hi: 'क्लोरीन', ve: 7, val: 1, sh: [2, 8, 7], col: '#22C55E', ink: '#1E293B', r: 0.98, z: 17 },
    Br: { en: 'Bromine', hi: 'ब्रोमीन', ve: 7, val: 1, sh: [2, 8, 18, 7], col: '#B45309', ink: '#fff', r: 1.06, z: 35 },
    I: { en: 'Iodine', hi: 'आयोडीन', ve: 7, val: 1, sh: [2, 8, 18, 18, 7], col: '#7C3AED', ink: '#fff', r: 1.18, z: 53 },
    Li: { en: 'Lithium', hi: 'लिथियम', ve: 1, val: 1, sh: [2, 1], col: '#C084FC', ink: '#1E293B', r: 1.1, z: 3, metal: 1 },
    Na: { en: 'Sodium', hi: 'सोडियम', ve: 1, val: 1, sh: [2, 8, 1], col: '#A855F7', ink: '#fff', r: 1.2, z: 11, metal: 1 },
    K: { en: 'Potassium', hi: 'पोटैशियम', ve: 1, val: 1, sh: [2, 8, 8, 1], col: '#9333EA', ink: '#fff', r: 1.3, z: 19, metal: 1 },
    Mg: { en: 'Magnesium', hi: 'मैग्नीशियम', ve: 2, val: 2, sh: [2, 8, 2], col: '#34D399', ink: '#1E293B', r: 1.1, z: 12, metal: 2 },
    Ca: { en: 'Calcium', hi: 'कैल्शियम', ve: 2, val: 2, sh: [2, 8, 8, 2], col: '#2DD4BF', ink: '#1E293B', r: 1.24, z: 20, metal: 2 },
    Al: { en: 'Aluminium', hi: 'ऐलुमिनियम', ve: 3, val: 3, sh: [2, 8, 3], col: '#94A3B8', ink: '#1E293B', r: 1.08, z: 13, metal: 3 },
    Be: { en: 'Beryllium', hi: 'बेरिलियम', ve: 2, val: 2, sh: [2, 2], col: '#A3E635', ink: '#1E293B', r: 0.9, z: 4 },
    B: { en: 'Boron', hi: 'बोरॉन', ve: 3, val: 3, sh: [2, 3], col: '#F9A8D4', ink: '#1E293B', r: 0.86, z: 5 },
    Si: { en: 'Silicon', hi: 'सिलिकॉन', ve: 4, val: 4, sh: [2, 8, 4], col: '#D4A373', ink: '#1E293B', r: 1.08, z: 14 },
    P: { en: 'Phosphorus', hi: 'फॉस्फोरस', ve: 5, val: 3, sh: [2, 8, 5], col: '#FB923C', ink: '#1E293B', r: 1.04, z: 15 },
    Xe: { en: 'Xenon', hi: 'ज़ीनॉन', ve: 8, val: 0, sh: [2, 8, 18, 18, 8], col: '#67E8F9', ink: '#1E293B', r: 1.2, z: 54 },
  };
  const COV = ['H', 'C', 'N', 'O', 'F', 'S', 'Cl', 'Br', 'I'];               // may be joined by sharing
  const METALS = ['Li', 'Na', 'K', 'Mg', 'Ca', 'Al'];
  const NONMET = ['F', 'Cl', 'Br', 'O', 'S', 'N'];                           // ionic partners (anion charge = ve − 8)
  const CENTRAL = ['Be', 'B', 'C', 'Si', 'N', 'P', 'O', 'S', 'Cl', 'Br', 'Xe'];
  const TERMINAL = ['H', 'F', 'Cl', 'O'];
  const ANION = { F: 'fluoride', Cl: 'chloride', Br: 'bromide', O: 'oxide', S: 'sulphide', N: 'nitride' };
  const ANION_HI = { F: 'फ्लुओराइड', Cl: 'क्लोराइड', Br: 'ब्रोमाइड', O: 'ऑक्साइड', S: 'सल्फाइड', N: 'नाइट्राइड' };

  // Common names for molecules a child builds by hand (keyed by Hill formula; carbon compounds get IUPAC names from
  // the namer below, which wins when it applies).
  const NAMES = {
    H2: { en: 'Hydrogen molecule', hi: 'हाइड्रोजन अणु' }, O2: { en: 'Oxygen molecule', hi: 'ऑक्सीजन अणु' }, N2: { en: 'Nitrogen molecule', hi: 'नाइट्रोजन अणु' },
    Cl2: { en: 'Chlorine molecule', hi: 'क्लोरीन अणु' }, F2: { en: 'Fluorine molecule', hi: 'फ्लुओरीन अणु' }, Br2: { en: 'Bromine molecule', hi: 'ब्रोमीन अणु' }, I2: { en: 'Iodine molecule', hi: 'आयोडीन अणु' },
    H2O: { en: 'Water', hi: 'जल' }, ClH: { en: 'Hydrogen chloride', hi: 'हाइड्रोजन क्लोराइड' }, FH: { en: 'Hydrogen fluoride', hi: 'हाइड्रोजन फ्लुओराइड' }, BrH: { en: 'Hydrogen bromide', hi: 'हाइड्रोजन ब्रोमाइड' },
    H3N: { en: 'Ammonia', hi: 'अमोनिया' }, H2S: { en: 'Hydrogen sulphide', hi: 'हाइड्रोजन सल्फाइड' }, H2O2: { en: 'Hydrogen peroxide', hi: 'हाइड्रोजन परॉक्साइड' },
    CO2: { en: 'Carbon dioxide', hi: 'कार्बन डाइऑक्साइड' }, CS2: { en: 'Carbon disulphide', hi: 'कार्बन डाइसल्फाइड' },
    CH4: { en: 'Methane', hi: 'मेथेन' }, C2H6: { en: 'Ethane', hi: 'एथेन' }, C2H4: { en: 'Ethene', hi: 'एथीन' }, C2H2: { en: 'Ethyne', hi: 'एथाइन' },
    CH4O: { en: 'Methanol', hi: 'मेथेनॉल' }, C2H6O: { en: 'Ethanol', hi: 'एथेनॉल' }, CCl4: { en: 'Tetrachloromethane', hi: 'टेट्राक्लोरोमेथेन' }, CH3Cl: { en: 'Chloromethane', hi: 'क्लोरोमेथेन' },
    Cl2O: { en: 'Dichlorine monoxide', hi: 'डाइक्लोरीन मोनोऑक्साइड' }, F2O: { en: 'Oxygen difluoride', hi: 'ऑक्सीजन डाइफ्लुओराइड' }, CH2O: { en: 'Methanal', hi: 'मेथेनैल' },
    H4N2: { en: 'Hydrazine', hi: 'हाइड्राज़ीन' }, Cl3N: { en: 'Nitrogen trichloride', hi: 'नाइट्रोजन ट्राइक्लोराइड' }, F3N: { en: 'Nitrogen trifluoride', hi: 'नाइट्रोजन ट्राइफ्लुओराइड' },
  };
  // Shapes the child can build in 'shapes' mode (NCERT Class 11 VSEPR list plus the Class 10 molecules).
  const SHAPE_MOLS = ['BeCl2', 'BeF2', 'BF3', 'BCl3', 'CH4', 'CCl4', 'CF4', 'SiCl4', 'SiH4', 'NH3', 'NF3', 'PCl3', 'PH3', 'H2O', 'H2S', 'OF2', 'PCl5', 'PF5', 'SF6', 'SF4', 'ClF3', 'XeF2', 'XeF4', 'BrF5', 'ClF5', 'CO2', 'SO2', 'CS2', 'SO3', 'CH2O'];
  const SHAPES = {
    '2-0': { en: 'Linear', hi: 'रैखिक', angle: '180°' }, '3-0': { en: 'Trigonal planar', hi: 'त्रिकोणीय समतलीय', angle: '120°' }, '3-1': { en: 'Bent (V-shaped)', hi: 'बंकित (V-आकार)', angle: '< 120°' },
    '4-0': { en: 'Tetrahedral', hi: 'चतुष्फलकीय', angle: '109.5°' }, '4-1': { en: 'Trigonal pyramidal', hi: 'त्रिकोणीय पिरामिडी', angle: '107°' }, '4-2': { en: 'Bent (V-shaped)', hi: 'बंकित (V-आकार)', angle: '104.5°' },
    '5-0': { en: 'Trigonal bipyramidal', hi: 'त्रिकोणीय द्विपिरामिडी', angle: '120° and 90°' }, '5-1': { en: 'See-saw', hi: 'झूला (सी-सॉ)', angle: '< 120°, < 90°' }, '5-2': { en: 'T-shaped', hi: 'T-आकार', angle: '< 90°' }, '5-3': { en: 'Linear', hi: 'रैखिक', angle: '180°' },
    '6-0': { en: 'Octahedral', hi: 'अष्टफलकीय', angle: '90°' }, '6-1': { en: 'Square pyramidal', hi: 'वर्ग पिरामिडी', angle: '< 90°' }, '6-2': { en: 'Square planar', hi: 'वर्ग समतलीय', angle: '90°' },
  };
  const SHAPE_SET = new Set(SHAPE_MOLS);
  // Measured angles where they differ from the ideal (lone pairs squeeze the bonds; bigger central atoms squeeze more).
  const ANGLE = { NH3: '107°', H2O: '104.5°', H2S: '92°', PH3: '93.5°', NF3: '102°', OF2: '103°', PCl3: '100°', SO2: '119°', CH4: '109.5°', BF3: '120°', CO2: '180°', SF4: '102° and 173°', ClF3: '87.5°', BrF5: '84.8°' };
  const ROOT = ['meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct'];
  const ROOT_HI = ['मेथ', 'एथ', 'प्रोप', 'ब्यूट', 'पेन्ट', 'हेक्स', 'हेप्ट', 'ऑक्ट'];
  const MULT = ['', '', 'di', 'tri', 'tetra'], MULT_HI = ['', '', 'डाइ', 'ट्राइ', 'टेट्रा'];
  const GROUPS = {
    alcohol: { en: 'Alcohol', hi: 'ऐल्कोहॉल', show: '–OH' }, aldehyde: { en: 'Aldehyde', hi: 'ऐल्डिहाइड', show: '–CHO' }, acid: { en: 'Carboxylic acid', hi: 'कार्बोक्सिलिक अम्ल', show: '–COOH' },
    ketone: { en: 'Ketone', hi: 'कीटोन', show: '>C=O' }, chloro: { en: 'Chloro', hi: 'क्लोरो', show: '–Cl' }, bromo: { en: 'Bromo', hi: 'ब्रोमो', show: '–Br' },
  };
  const ISO_COUNT = { C3H8: 1, C4H10: 2, C5H12: 3, C6H14: 5 };

  // ---- graph helpers (pure; used by validate/keys under Node too) ----
  // G = { atoms: ['C','H',…], bonds: [{ a, b, o }] }  (o = bond order 1..3)
  const deg = (G, i) => G.bonds.reduce((s, b) => s + (b.a === i || b.b === i ? b.o : 0), 0);
  const free = (G, i) => EL[G.atoms[i]].val - deg(G, i);
  const nbrs = (G, i) => G.bonds.filter((b) => b.a === i || b.b === i).map((b) => ({ j: b.a === i ? b.b : b.a, o: b.o }));
  const bondBetween = (G, i, j) => G.bonds.find((b) => (b.a === i && b.b === j) || (b.a === j && b.b === i));
  function connected(G) {
    if (!G.atoms.length) return false;
    const seen = new Set([0]), st = [0];
    while (st.length) { const i = st.pop(); for (const n of nbrs(G, i)) if (!seen.has(n.j)) { seen.add(n.j); st.push(n.j); } }
    return seen.size === G.atoms.length;
  }
  // Hill formula: C first, then H, then the rest alphabetically (no carbon: all alphabetical).
  function formula(atoms) {
    const c = {}; atoms.forEach((s) => (c[s] = (c[s] || 0) + 1));
    let keys = Object.keys(c).sort();
    if (c.C) keys = ['C'].concat(c.H ? ['H'] : [], keys.filter((k) => k !== 'C' && k !== 'H'));
    return keys.map((k) => k + (c[k] > 1 ? c[k] : '')).join('');
  }
  const complete = (G) => G.atoms.length > 1 && connected(G) && G.atoms.every((_, i) => free(G, i) === 0);
  // Heavy-atom graph → full graph with hydrogens filling every free valency (carbon, isomers modes).
  function withH(G) {
    const H = { atoms: G.atoms.slice(), bonds: G.bonds.map((b) => ({ a: b.a, b: b.b, o: b.o })) };
    G.atoms.forEach((_, i) => { for (let k = free(G, i); k > 0; k--) { H.atoms.push('H'); H.bonds.push({ a: i, b: H.atoms.length - 1, o: 1 }); } });
    return H;
  }
  const lonePairs = (G, i) => Math.max(0, Math.floor((EL[G.atoms[i]].ve - deg(G, i)) / 2));
  const steric = (G, i) => nbrs(G, i).length + lonePairs(G, i);

  // ---- IUPAC naming for acyclic carbon compounds (chain ≤ 8, methyl/ethyl branches, NCERT functional groups) ----
  function allPaths(G, carbons) {
    const out = [];
    const cset = new Set(carbons);
    const walk = (path, seen) => {
      const i = path[path.length - 1];
      let ext = false;
      for (const n of nbrs(G, i)) if (cset.has(n.j) && !seen.has(n.j)) { ext = true; seen.add(n.j); walk(path.concat(n.j), seen); seen.delete(n.j); }
      if (!ext) out.push(path.slice());
    };
    for (const c of carbons) walk([c], new Set([c]));
    return out;
  }
  const alkyl = (n) => ({ en: ROOT[n - 1] + 'yl', hi: ROOT_HI[n - 1] + 'िल' });
  const cmpArr = (x, y) => { for (let i = 0; i < Math.max(x.length, y.length); i++) { const a = x[i] === undefined ? 1e9 : x[i], b = y[i] === undefined ? 1e9 : y[i]; if (a !== b) return a - b; } return 0; };
  // Returns { en, hi, formula } or null when the structure is outside the rules (rings, two kinds of group, …).
  function iupac(G) {
    const carbons = G.atoms.map((s, i) => (s === 'C' ? i : -1)).filter((i) => i >= 0);
    if (!carbons.length || carbons.length > 8 || !connected(G)) return null;
    if (G.atoms.some((s) => !['C', 'H', 'O', 'Cl', 'Br'].includes(s))) return null;
    const cset = new Set(carbons);
    // ring check: carbon bonds (count) must be carbons − 1
    const cb = G.bonds.filter((b) => cset.has(b.a) && cset.has(b.b));
    if (cb.length !== carbons.length - 1) return null;
    // groups on carbons
    const grp = {};            // carbon index → 'acid'|'aldehyde'|'ketone'
    const oh = [], halo = [];  // [carbon], [carbon, symbol]
    for (const i of G.atoms.map((_, k) => k)) {
      const s = G.atoms[i];
      if (s === 'O') {
        const ns = nbrs(G, i);
        if (ns.length === 1 && ns[0].o === 2 && cset.has(ns[0].j)) { grp[ns[0].j] = grp[ns[0].j] ? 'x' : 'oxo'; }
        else if (ns.length === 2 && ns.every((n) => n.o === 1) && ns.some((n) => G.atoms[n.j] === 'H') && ns.some((n) => cset.has(n.j))) oh.push(ns.find((n) => cset.has(n.j)).j);
        else return null;
      } else if (s === 'Cl' || s === 'Br') { const ns = nbrs(G, i); if (ns.length !== 1 || !cset.has(ns[0].j)) return null; halo.push([ns[0].j, s]); }
      else if (s === 'H') { const ns = nbrs(G, i); if (ns.length !== 1) return null; }
    }
    if (Object.values(grp).includes('x')) return null;
    for (const c of Object.keys(grp).map(Number)) {
      const cn = nbrs(G, c).filter((n) => cset.has(n.j)).length;
      const hasOH = oh.includes(c);
      if (hasOH) { if (cn > 1) return null; grp[c] = 'acid'; oh.splice(oh.indexOf(c), 1); }
      else grp[c] = cn <= 1 ? 'aldehyde' : 'ketone';
    }
    const kinds = [...new Set(Object.values(grp))];
    if (kinds.length > 1) return null;
    let principal = kinds[0] || (oh.length ? 'alcohol' : null);
    if (principal && principal !== 'alcohol' && oh.length) return null;      // two different groups: beyond school naming
    const pc = principal === 'alcohol' ? oh : Object.keys(grp).map(Number).filter((c) => grp[c] === principal);
    // candidate chains must hold every principal-group carbon
    let paths = allPaths(G, carbons).filter((p) => pc.every((c) => p.includes(c)));
    if (!paths.length) return null;
    const maxLen = Math.max(...paths.map((p) => p.length));
    paths = paths.filter((p) => p.length === maxLen);
    const multi = (p) => p.slice(1).reduce((s, c, k) => s + (bondBetween(G, p[k], c).o > 1 ? 1 : 0), 0);
    const maxM = Math.max(...paths.map(multi));
    paths = paths.filter((p) => multi(p) === maxM);
    let best = null;
    for (const p of paths) {
      const pos = new Map(p.map((c, k) => [c, k + 1]));
      const info = { p };
      info.g = pc.map((c) => pos.get(c)).sort((a, b) => a - b);
      info.m = p.slice(1).map((c, k) => [bondBetween(G, p[k], c).o, k + 1]).filter((x) => x[0] > 1).map((x) => x[1]);
      info.dbl = p.slice(1).map((c, k) => [bondBetween(G, p[k], c).o, k + 1]).filter((x) => x[0] === 2).map((x) => x[1]);
      info.tpl = p.slice(1).map((c, k) => [bondBetween(G, p[k], c).o, k + 1]).filter((x) => x[0] === 3).map((x) => x[1]);
      const subs = [];
      for (const c of p) for (const n of nbrs(G, c)) if (cset.has(n.j) && !pos.has(n.j)) {
        // branch size
        const seen = new Set([c, n.j]), st = [n.j]; let size = 0;
        while (st.length) { const i = st.pop(); size++; for (const m of nbrs(G, i)) if (cset.has(m.j) && !seen.has(m.j)) { seen.add(m.j); st.push(m.j); } }
        if (size > 3) return null;
        subs.push({ loc: pos.get(c), ...alkyl(size), key: ROOT[size - 1] + 'yl' });
      }
      for (const [c, s] of halo) subs.push({ loc: pos.get(c), en: s === 'Cl' ? 'chloro' : 'bromo', hi: s === 'Cl' ? 'क्लोरो' : 'ब्रोमो', key: s === 'Cl' ? 'chloro' : 'bromo' });
      info.subs = subs;
      info.s = subs.map((x) => x.loc).sort((a, b) => a - b);
      const rank = [...info.g, 100, ...info.m, 100, ...info.s];
      if (!best || cmpArr(rank, best.rank) < 0) best = { ...info, rank };
    }
    const n = maxLen;
    const needLoc = (k) => k !== undefined && n > 2 && !(n === 3 && principal && principal !== 'alcohol' && principal !== 'ketone');
    // prefixes: alphabetical by substituent name (multipliers ignored)
    const bykey = {};
    best.subs.forEach((s) => { (bykey[s.key] = bykey[s.key] || { ...s, locs: [] }).locs.push(s.loc); });
    const pre = Object.values(bykey).sort((a, b) => a.en.localeCompare(b.en));
    const noLoc = n === 1 || (n === 2 && best.subs.length === 1);       // chloromethane, chloroethane
    const preEn = pre.map((s) => `${noLoc ? '' : s.locs.sort((a, b) => a - b).join(',') + '-'}${MULT[s.locs.length] || ''}${s.en}`).join('-');
    const preHi = pre.map((s) => `${noLoc ? '' : s.locs.join(',') + '-'}${MULT_HI[s.locs.length] || ''}${s.hi}`).join('-');
    let en = ROOT[n - 1], hi = ROOT_HI[n - 1];
    const indep = (h) => h.replace(/^[ािीोॉै]/, (m) => ({ 'ा': 'आ', 'ि': 'इ', 'ी': 'ई', 'ो': 'ओ', 'ॉ': 'ऑ', 'ै': 'ऐ' })[m]);
    const join = (e, h) => { en += e; hi += /^[-\d]$/.test(hi.slice(-1)) ? indep(h) : h; };
    const mh = (k, h) => (MULT_HI[k] ? MULT_HI[k] + indep(h) : h);
    const unsat = best.dbl.length ? 'en' : best.tpl.length ? 'yn' : null;
    if (best.dbl.length && best.tpl.length) return null;
    const uloc = best.m;
    if (unsat) {
      if (uloc.length > 1) join('a', 'ा');
      if (n > 3 || uloc.length > 1 || principal) join(`-${uloc.join(',')}-`, `-${uloc.join(',')}-`);
      join(`${MULT[uloc.length] || ''}${unsat}`, mh(uloc.length, unsat === 'en' ? 'ीन' : 'ाइन'));
    } else join('an', 'ेन');
    const SUF = { alcohol: ['ol', 'ॉल'], aldehyde: ['al', 'ैल'], acid: ['oic acid', 'ोइक अम्ल'], ketone: ['one', 'ोन'] };
    if (principal) {
      const g = best.g;
      const [se, sh] = SUF[principal];
      const loc = principal === 'alcohol' ? n >= 3 || g.length > 1 : principal === 'ketone' ? n >= 4 || g.length > 1 : false;
      if (g.length > 1 && !unsat) join('e', '');
      if (loc) join(`-${g.join(',')}-`, `-${g.join(',')}-`);
      join(`${MULT[g.length] || ''}${se}`, mh(g.length, sh));
    } else join('e', '');
    return { en: preEn ? preEn + en : en, hi: preHi ? preHi + hi : hi, formula: formula(G.atoms) };
  }

  // ---- ionic rule: metal gives, non-metal takes; ratio from the charges ----
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  function ionic(m, x) {
    const cm = EL[m].metal, cx = 8 - EL[x].ve;
    const l = (cm * cx) / gcd(cm, cx);
    const nm = l / cm, nx = l / cx;
    return { m, x, cm, cx, nm, nx, formula: m + (nm > 1 ? nm : '') + x + (nx > 1 ? nx : ''), en: `${EL[m].en} ${ANION[x]}`, hi: `${EL[m].hi} ${ANION_HI[x]}` };
  }
  // ---- VSEPR: central atom + terminals → electron domains, lone pairs, shape ----
  // A shape is shown only for a real, stable molecule: one on the NCERT list, or one where the central atom has an octet.
  const shapeOk = (v) => !!v && (SHAPE_SET.has(v.formula) || (v.electrons === 8 && !['Be', 'B'].includes(v.c)));
  function vsepr(c, terms) {
    if (!terms.length) return null;
    const need = (s) => (s === 'H' ? 1 : 8 - EL[s].ve);       // electrons each terminal must share
    const used = terms.reduce((s, t) => s + need(t), 0);
    const rest = EL[c].ve - used;
    if (rest < 0 || rest % 2) return null;
    const lp = rest / 2, n = terms.length, st = n + lp;
    if (st < 2 || st > 6 || n > 6) return null;
    const shape = SHAPES[`${st}-${lp}`];
    if (!shape) return null;
    const cnt = {}; terms.forEach((t) => (cnt[t] = (cnt[t] || 0) + 1));
    // School convention: H2O, H2S (hydrogen first) but CH4, NH3, PCl5 (central first, hydrogen before halogens).
    const f = (c === 'O' || c === 'S') && terms.every((t) => t === 'H') ? `H${n}${c}` : c + Object.keys(cnt).sort((a, b) => (a === 'H' ? -1 : b === 'H' ? 1 : a.localeCompare(b))).map((k) => k + (cnt[k] > 1 ? cnt[k] : '')).join('');
    return { c, terms, lp, n, st, shape, formula: f, orders: terms.map(need), electrons: 2 * used + 2 * lp };
  }

  // ---- 2D layout: textbook structural formula (chain across, 90° / 120° / 180° slots by steric number) ----
  const rad = (d) => (d * Math.PI) / 180;
  const normA = (a) => (((a + 180) % 360) + 360) % 360 - 180;
  function chainEnd(G) {
    // The carbon chain (or, with no carbon, the heavy-atom chain) runs across the picture.
    const keep = G.atoms.includes('C') ? (s) => s === 'C' : (s) => s !== 'H';
    const heavy = G.atoms.map((s, i) => (keep(s) ? i : -1)).filter((i) => i >= 0);
    if (!heavy.length) return 0;
    const far = (s) => { const d = new Map([[s, 0]]); const q = [s]; let last = s; while (q.length) { const i = q.shift(); last = i; for (const n of nbrs(G, i)) if (keep(G.atoms[n.j]) && !d.has(n.j)) { d.set(n.j, d.get(i) + 1); q.push(n.j); } } return last; };
    return far(far(heavy[0]));
  }
  function layout2D(G) {
    const pos = new Array(G.atoms.length).fill(null), slots = new Array(G.atoms.length).fill(null);
    if (!G.atoms.length) return { pos, slots };
    const subtree = (i, from) => { let s = 1; for (const n of nbrs(G, i)) if (n.j !== from) s += subtree(n.j, i); return s; };
    const place = (i, from, x, y, ang) => {
      pos[i] = { x, y };
      const kids = nbrs(G, i).filter((n) => n.j !== from).map((n) => ({ ...n, size: subtree(n.j, i) })).sort((a, b) => b.size - a.size);
      const n = Math.max(steric(G, i), kids.length + (from == null ? 0 : 1), 1);
      const step = 360 / n;
      const angles = [];
      for (let k = from == null ? 0 : 1; k < n; k++) angles.push(from == null ? ang + 180 + step * k : ang + step * k);
      angles.sort((a, b) => Math.abs(normA(a - ang - 180)) - Math.abs(normA(b - ang - 180)));
      // Textbook look: a chain carbon with one chain partner and one end atom (C=O in a ketone, acid or aldehyde)
      // keeps the chain straight and puts the end atom straight up.
      if (from != null && n === 3 && kids.length === 2 && kids[0].size > 1 && kids[1].size === 1) angles.splice(0, 2, ang + 180, ang + 270);
      kids.forEach((k, idx) => { const a = angles[idx]; place(k.j, i, x + Math.cos(rad(a)), y + Math.sin(rad(a)), a + 180); });
      slots[i] = angles.slice(kids.length);
    };
    place(chainEnd(G), null, 0, 0, 180);
    return { pos, slots };
  }

  // ---- 3D embedding: VSEPR directions per atom, children staggered (or planar across a double bond) ----
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]), unit: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    perp: (a) => V.unit(Math.abs(a[0]) < 0.8 ? V.cross(a, [1, 0, 0]) : V.cross(a, [0, 1, 0])),
    rot: (v, k, th) => { const c = Math.cos(th), s = Math.sin(th); return V.add(V.add(V.mul(v, c), V.mul(V.cross(k, v), s)), V.mul(k, V.dot(k, v) * (1 - c))); },
    rotTo: (a, b) => { const c = V.dot(a, b); if (c < -0.9999) { const ax = V.perp(a); return (v) => V.rot(v, ax, Math.PI); } const ax = V.unit(V.cross(a, b)), th = Math.acos(Math.max(-1, Math.min(1, c))); return th < 1e-6 ? (v) => v : (v) => V.rot(v, ax, th); },
  };
  const T3 = 1 / Math.sqrt(3);
  const DIRS = {
    1: [[1, 0, 0]], 2: [[1, 0, 0], [-1, 0, 0]], 3: [[1, 0, 0], [-0.5, 0.866, 0], [-0.5, -0.866, 0]],
    4: [[T3, T3, T3], [T3, -T3, -T3], [-T3, T3, -T3], [-T3, -T3, T3]],
    5: [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-0.5, 0, 0.866], [-0.5, 0, -0.866]],
    6: [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]],
  };
  // Returns { pos: [[x,y,z]], lps: [[dir…] per atom] }. Bond length 1 (0.72 to hydrogen).
  function embed3D(G) {
    const n = G.atoms.length, pos = new Array(n).fill(null), lps = new Array(n).fill(null);
    if (!n) return { pos, lps };
    const subtree = (i, from) => { let s = 1; for (const m of nbrs(G, i)) if (m.j !== from) s += subtree(m.j, i); return s; };
    const place = (i, from, p, toParent, ref) => {
      pos[i] = p;
      const kids = nbrs(G, i).filter((m) => m.j !== from).map((m) => ({ ...m, size: subtree(m.j, i) })).sort((a, b) => b.size - a.size);
      const st = Math.min(6, Math.max(steric(G, i), kids.length + (from == null ? 0 : 1), 1));
      let dirs = DIRS[st].map((d) => d.slice());
      if (from != null) {
        const R = V.rotTo(dirs[0], toParent);
        dirs = dirs.map(R);
        if (dirs.length > 1 && ref) {
          const b = toParent;
          const pr = (v) => V.sub(v, V.mul(b, V.dot(b, v)));
          const v1 = pr(dirs[1]), r1 = pr(ref);
          if (V.len(v1) > 1e-6 && V.len(r1) > 1e-6) {
            let phi = Math.atan2(V.dot(V.cross(v1, r1), b), V.dot(v1, r1));
            if (st !== 3) phi += Math.PI;                       // staggered unless planar (double bond)
            dirs = dirs.map((d) => V.rot(d, b, phi));
          }
        }
      }
      const own = from == null ? dirs : dirs.slice(1);
      kids.forEach((k, idx) => {
        const d = own[idx];
        const len = G.atoms[i] === 'H' || G.atoms[k.j] === 'H' ? 0.72 : k.o === 3 ? 0.86 : k.o === 2 ? 0.92 : 1;
        const q = V.add(p, V.mul(d, len));
        const other = own.find((x) => x !== d) || (from != null ? dirs[0] : V.perp(d));
        place(k.j, i, q, V.mul(d, -1), other);
      });
      lps[i] = own.slice(kids.length);
    };
    place(chainEnd(G), null, [0, 0, 0], null, null);
    return { pos, lps };
  }
  // Rotate (about y, then tilt about x) and project to the screen with a little perspective.
  function project(p, th, tilt) {
    const c = Math.cos(th), s = Math.sin(th);
    let x = p[0] * c + p[2] * s, z = -p[0] * s + p[2] * c, y = p[1];
    const ct = Math.cos(tilt), stl = Math.sin(tilt);
    const y2 = y * ct - z * stl, z2 = y * stl + z * ct;
    return { x, y: y2, z: z2, k: 1 + z2 * 0.14 };
  }
  const lighten = (h, t) => L.mixHex(h, '#FFFFFF', t), darken = (h, t) => L.mixHex(h, '#061233', t);
  const DEFS = `<defs>${Object.keys(EL).map((s) => `<radialGradient id="mo-g-${s}" cx=".32" cy=".28" r=".78"><stop offset="0" stop-color="${lighten(EL[s].col, 0.55)}"/><stop offset=".55" stop-color="${EL[s].col}"/><stop offset="1" stop-color="${darken(EL[s].col, 0.45)}"/></radialGradient>`).join('')}
    <radialGradient id="mo-g-lp" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFE27A" stop-opacity=".9"/><stop offset="1" stop-color="#FFD23F" stop-opacity=".25"/></radialGradient>
    <linearGradient id="mo-g-stick" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E2E8F0"/><stop offset="1" stop-color="#94A3B8"/></linearGradient></defs>`;

  // ---- SVG pieces ----
  const sphere = (x, y, r, s, extra = '') => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="url(#mo-g-${s})" ${extra}/>`;
  const label = (x, y, s, size, ink) => `<text x="${x.toFixed(1)}" y="${(y + size * 0.36).toFixed(1)}" text-anchor="middle" font-size="${size}" fill="${ink}">${s}</text>`;
  // n parallel lines between two points (bond order), stroke colour, width
  function bondLines(x1, y1, x2, y2, o, col, w, gapK = 1) {
    const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    const offs = o === 1 ? [0] : o === 2 ? [-w * 0.95 * gapK, w * 0.95 * gapK] : [-w * 1.7 * gapK, 0, w * 1.7 * gapK];
    return offs.map((k) => `<line x1="${(x1 + nx * k).toFixed(1)}" y1="${(y1 + ny * k).toFixed(1)}" x2="${(x2 + nx * k).toFixed(1)}" y2="${(y2 + ny * k).toFixed(1)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`).join('');
  }
  // Two dots (a pair) centred at (x,y), laid across the direction angle a (deg)
  const pair = (x, y, a, col = '#FFE27A', r = 3.2, gap = 4.6) => { const px = -Math.sin(rad(a)) * gap, py = Math.cos(rad(a)) * gap; return `<circle cx="${(x + px).toFixed(1)}" cy="${(y + py).toFixed(1)}" r="${r}" fill="${col}"/><circle cx="${(x - px).toFixed(1)}" cy="${(y - py).toFixed(1)}" r="${r}" fill="${col}"/>`; };

  // The 2D structure (view 'structure') or electron-dot picture (view 'dot') of a graph, fitted into w×h.
  function draw2D(G, view, sel, w, h, api) {
    const { pos, slots } = layout2D(G);
    if (!G.atoms.length) return '';
    const xs = pos.map((p) => p.x), ys = pos.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const mx = w < 560 ? 64 : 150, my = w < 560 ? 80 : 120;
    const s = Math.max(40, Math.min(96, (w - mx) / Math.max(0.01, maxX - minX), (h - my) / Math.max(0.01, maxY - minY)));
    const cx = w / 2 - ((minX + maxX) / 2) * s, cy = h / 2 - ((minY + maxY) / 2) * s;
    const P = pos.map((p) => ({ x: cx + p.x * s, y: cy + p.y * s }));
    const R = (i) => (view === 'dot' ? 16 : 13 + EL[G.atoms[i]].r * 9);
    let out = '';
    if (view !== 'dot') {
      for (const b of G.bonds) { const a = P[b.a], c = P[b.b]; out += bondLines(a.x, a.y, c.x, c.y, b.o, '#CBD5E1', Math.max(4, s / 16)); }
    } else {
      for (const b of G.bonds) {
        const a = P[b.a], c = P[b.b];
        const ang = Math.atan2(c.y - a.y, c.x - a.x) * 180 / Math.PI;
        const nx = -Math.sin(rad(ang)), ny = Math.cos(rad(ang)), ux = Math.cos(rad(ang)), uy = Math.sin(rad(ang));
        const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
        const ks = b.o === 1 ? [0] : b.o === 2 ? [-7, 7] : [-11, 0, 11];
        for (const k of ks) out += `<circle cx="${(mx + nx * k - ux * 4.5).toFixed(1)}" cy="${(my + ny * k - uy * 4.5).toFixed(1)}" r="3.4" fill="#FFE27A"/><circle cx="${(mx + nx * k + ux * 4.5).toFixed(1)}" cy="${(my + ny * k + uy * 4.5).toFixed(1)}" r="3.4" fill="#FFE27A"/>`;
      }
    }
    G.atoms.forEach((sym, i) => {
      const p = P[i], e = EL[sym], r = R(i);
      const name = api.t(e);
      const box = `<g class="mo-atom" data-sel="${i}" role="button" tabindex="0" aria-pressed="${sel === i}" aria-label="${esc(name)}">`;
      if (view === 'dot') {
        out += box + `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r + 10}" fill="${sel === i ? 'rgba(255,210,63,.18)' : 'transparent'}" stroke="${sel === i ? '#FFD23F' : 'none'}" stroke-width="3"/>` + label(p.x, p.y, sym, 30, e.col === '#4B5563' ? '#F1F5FF' : lighten(e.col, 0.2));
        const lp = lonePairs(G, i);
        (slots[i] || []).slice(0, lp).forEach((a) => { out += pair(p.x + Math.cos(rad(a)) * (r + 9), p.y + Math.sin(rad(a)) * (r + 9), a); });
        out += '</g>';
      } else {
        out += box + (sel === i ? `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r + 7}" fill="none" stroke="#FFD23F" stroke-width="3" stroke-dasharray="6 5"/>` : '') + sphere(p.x, p.y, r, sym) + label(p.x, p.y, sym, r * 1.1, e.ink)
          // an open-bond badge: how many more bonds this atom still wants
          + (free(G, i) > 0 ? `<circle cx="${(p.x + r * 0.8).toFixed(1)}" cy="${(p.y - r * 0.8).toFixed(1)}" r="10" fill="#FFD23F" stroke="#061233" stroke-width="1.5"/><text x="${(p.x + r * 0.8).toFixed(1)}" y="${(p.y - r * 0.8 + 4.5).toFixed(1)}" text-anchor="middle" font-size="13" fill="#1E293B">+${free(G, i)}</text>` : '') + '</g>';
      }
    });
    return out;
  }

  // The 3D model: atoms as shaded spheres, sticks, lone-pair lobes; th/tilt are the viewing angles.
  function draw3D(G, geo, th, tilt, w, h, opts = {}) {
    const items = [];
    const pts = geo.pos.map((p) => project(p, th, tilt));
    const rr = Math.max(0.8, ...geo.pos.map((p) => V.len(p)));
    const s = Math.min(opts.scale || 120, (Math.min(w, h) * 0.42) / rr);
    const cx = w / 2, cy = h / 2;
    const sc = (q) => ({ x: cx + q.x * s * q.k, y: cy - q.y * s * q.k, k: q.k, z: q.z });
    const S = pts.map(sc);
    const rad3 = (i) => (opts.ballK ? Math.min(opts.ball || 30, s * opts.ballK) : opts.ball || 20) * EL[G.atoms[i]].r;
    G.atoms.forEach((sym, i) => items.push({ z: S[i].z, html: sphere(S[i].x, S[i].y, rad3(i) * S[i].k, sym) + (opts.labels === false ? '' : label(S[i].x, S[i].y, sym, rad3(i) * S[i].k * 0.95, EL[sym].ink)) }));
    // Each bond is drawn as two halves, each sorted just behind its own atom, so near atoms cover the sticks correctly.
    for (const b of G.bonds) {
      const a = S[b.a], c = S[b.b], mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2, w = 6 * (a.k + c.k) / 2 * (opts.stick || 1);
      items.push({ z: a.z - 0.001, html: bondLines(a.x, a.y, mx, my, b.o, '#CBD5E1', w, 1.1) });
      items.push({ z: c.z - 0.001, html: bondLines(mx, my, c.x, c.y, b.o, '#CBD5E1', w, 1.1) });
    }
    if (opts.lonePairs) G.atoms.forEach((_, i) => (geo.lps[i] || []).forEach((d) => {
      const base = geo.pos[i], tip = V.add(base, V.mul(d, 0.62)), mid = V.add(base, V.mul(d, 0.42));
      const pm = sc(project(mid, th, tilt)), pt = sc(project(tip, th, tilt)), pb = S[i];
      const ang = Math.atan2(pt.y - pb.y, pt.x - pb.x) * 180 / Math.PI;
      const len = Math.hypot(pt.x - pb.x, pt.y - pb.y);
      items.push({ z: pm.z - 0.01, html: `<g transform="rotate(${ang.toFixed(1)} ${pm.x.toFixed(1)} ${pm.y.toFixed(1)})"><ellipse cx="${pm.x.toFixed(1)}" cy="${pm.y.toFixed(1)}" rx="${Math.max(13, len * 0.4).toFixed(1)}" ry="${(15 * pm.k).toFixed(1)}" fill="url(#mo-g-lp)" stroke="#FFD23F" stroke-opacity=".6"/>${pair(pm.x + len * 0.1, pm.y, 0, '#FFF3B0', 3.2, 5)}</g>` });
    }));
    items.sort((a, b) => a.z - b.z);
    return items.map((x) => x.html).join('');
  }

  // ---- a library of buildable structures: the catalogue of names/formulas start and target may use ----
  // spec: 'O H H' = central atom then terminals (a digit = bond order, e.g. 'C O2 O2'); 'H-O-O-H' = a chain.
  const STAR = { H2: 'H H', O2: 'O O2', N2: 'N N3', Cl2: 'Cl Cl', F2: 'F F', Br2: 'Br Br', I2: 'I I', ClH: 'Cl H', FH: 'F H', BrH: 'Br H', H2O: 'O H H', H3N: 'N H H H', H2S: 'S H H',
    CO2: 'C O2 O2', CS2: 'C S2 S2', CCl4: 'C Cl Cl Cl Cl', Cl2O: 'O Cl Cl', F2O: 'O F F', Cl3N: 'N Cl Cl Cl', F3N: 'N F F F', H2O2: 'H-O-O-H' };
  function fromSpec(spec) {
    const G = { atoms: [], bonds: [] };
    if (spec.includes('-')) { spec.split('-').forEach((s, i) => { G.atoms.push(s); if (i) G.bonds.push({ a: i - 1, b: i, o: 1 }); }); return G; }
    spec.split(' ').forEach((tok, i) => { const m = tok.match(/^([A-Z][a-z]?)(\d?)$/); G.atoms.push(m[1]); if (i) G.bonds.push({ a: 0, b: i, o: +(m[2] || 1) }); });
    return G;
  }
  let CAT = null; const FCOUNT = {};        // { byKey: { lowercased name or formula → { en, hi, formula, G (heavy, carbon) | full } } }
  function catalogue() {
    if (CAT) return CAT;
    const byKey = {};
    const put = (G, heavy) => { const nm = iupac(heavy ? withH(G) : G); if (!nm) return; const e = { en: nm.en, hi: nm.hi, formula: nm.formula, G, heavy }; byKey[nm.en.toLowerCase()] = e; if (!byKey[nm.formula]) byKey[nm.formula] = e; };
    const chain = (n) => { const G = { atoms: Array(n).fill('C'), bonds: [] }; for (let i = 1; i < n; i++) G.bonds.push({ a: i - 1, b: i, o: 1 }); return G; };
    const add = (G, at, s, o = 1) => { G.atoms.push(s); G.bonds.push({ a: at, b: G.atoms.length - 1, o }); return G; };
    for (let n = 1; n <= 6; n++) {
      put(chain(n), true);
      for (let p = 0; p < n - 1; p++) { const a = chain(n); a.bonds[p].o = 2; put(a, true); const b = chain(n); b.bonds[p].o = 3; put(b, true); }
      for (let c = 0; c < n; c++) { put(add(chain(n), c, 'O'), true); put(add(chain(n), c, 'Cl'), true); put(add(chain(n), c, 'Br'), true); if (c === 0 || c === n - 1) { put(add(chain(n), c, 'O', 2), true); put(add(add(chain(n), c, 'O', 2), c, 'O'), true); } else put(add(chain(n), c, 'O', 2), true); }
    }
    // branched alkanes (the isomers of butane, pentane and hexane)
    [[3, [1]], [3, [1, 1]], [4, [1]], [4, [1, 2]], [4, [1, 1]], [5, [1]], [5, [2]]].forEach(([n, ms]) => { const G = chain(n); ms.forEach((c) => add(G, c, 'C')); put(G, true); });
    for (const f of Object.keys(STAR)) { const e = { en: NAMES[f].en, hi: NAMES[f].hi, formula: f, G: fromSpec(STAR[f]), heavy: false }; byKey[f] = e; if (!byKey[e.en.toLowerCase()]) byKey[e.en.toLowerCase()] = e; }
    for (const f of SHAPE_MOLS) {
      const toks = f.match(/[A-Z][a-z]?\d*/g).map((t) => { const m = t.match(/^([A-Z][a-z]?)(\d*)$/); return [m[1], +(m[2] || 1)]; });
      const ci = toks.findIndex(([s, n]) => n === 1 && CENTRAL.includes(s));
      const c = toks[ci][0], terms = toks.flatMap(([s, n], i) => (i === ci ? [] : Array(n).fill(s)));
      const v = vsepr(c, terms);
      if (v && !byKey['shape:' + f]) byKey['shape:' + f] = { formula: f, v, c, terms };
    }
    for (const e of new Set(Object.values(byKey))) if (e.en && e.G && byKey[e.en.toLowerCase()] === e) FCOUNT[e.formula] = (FCOUNT[e.formula] || 0) + 1;
    CAT = { byKey };
    return CAT;
  }
  // Any formula string ('NH3', 'HCl', 'C2H5OH') → its Hill formula ('H3N', 'ClH', 'C2H6O'); null when not a formula.
  function hill(f) {
    f = String(f || '').trim();
    if (!/^([A-Z][a-z]?\d*)+$/.test(f)) return null;
    const atoms = [];
    for (const m of f.matchAll(/([A-Z][a-z]?)(\d*)/g)) { if (!EL[m[1]]) return null; for (let k = 0; k < (+m[2] || 1); k++) atoms.push(m[1]); }
    return formula(atoms);
  }
  // School spelling of a Hill formula (NH3 not H3N, HCl not ClH).
  const CONV = { H3N: 'NH3', ClH: 'HCl', FH: 'HF', BrH: 'HBr', IH: 'HI', H4N2: 'N2H4', Cl3N: 'NCl3', F3N: 'NF3', F2O: 'OF2', H3P: 'PH3', H4Si: 'SiH4' };
  const conv = (f) => CONV[f] || f;
  const findEntry = (key) => { if (!key) return null; const c = catalogue().byKey; const h = hill(key); return c[String(key)] || c[String(key).toLowerCase()] || (h && c[h]) || null; };
  const elementsOf = (f) => (String(f).match(/[A-Z][a-z]?/g) || []);
  const MODES = ['covalent', 'ionic', 'carbon', 'shapes', 'isomers'];
  const PAL = {
    covalent: { all: COV, def: ['H', 'C', 'O', 'N', 'Cl'] }, carbon: { all: ['C', 'H', 'O', 'Cl', 'Br'], def: ['C', 'O', 'Cl', 'Br'] }, isomers: { all: ['C', 'H'], def: ['C'] },
    ionic: { all: METALS.concat(NONMET), def: ['Na', 'Mg', 'Cl', 'O'] }, shapes: { all: [...new Set(CENTRAL.concat(TERMINAL))], def: ['C', 'N', 'O', 'S', 'P', 'Be', 'B', 'Xe', 'H', 'F', 'Cl'] },
  };
  const palette = (cfg) => (cfg && Array.isArray(cfg.atoms) && cfg.atoms.length ? cfg.atoms : PAL[cfg && cfg.mode] ? PAL[cfg.mode].def : []);
  const ionicPairs = (atoms) => { const out = []; for (const m of atoms) if (EL[m] && EL[m].metal) for (const x of atoms) if (NONMET.includes(x)) out.push(ionic(m, x)); return out; };
  // Can a target/start string be built in this mode with this palette? Returns the entry or null.
  function resolve(cfg, key) {
    if (!key) return null;
    const pal = palette(cfg), mode = cfg.mode;
    const h = hill(key);
    if (mode === 'isomers') return h && ISO_COUNT[h] ? { formula: h, iso: ISO_COUNT[h] } : null;
    if (mode === 'ionic') return ionicPairs(pal).find((p) => p.formula === key || (h && hill(p.formula) === h) || p.en.toLowerCase() === String(key).toLowerCase()) || null;
    if (mode === 'shapes') { const by = catalogue().byKey; const e = by['shape:' + key] || Object.values(by).find((x) => x.v && h && hill(x.formula) === h); return e && elementsOf(e.formula).every((s) => pal.includes(s)) ? e : null; }
    const e = findEntry(key);
    if (!e || !e.G) return null;
    if (mode === 'carbon' && !e.heavy) return null;
    const need = mode === 'carbon' ? e.G.atoms.filter((s) => s !== 'H') : e.heavy ? withH(e.G).atoms : e.G.atoms;
    if (!need.every((s) => pal.includes(s))) return null;
    // A formula target with several structures (C3H6O: propanal and propanone) accepts any of them.
    const byFormula = !!h && h === e.formula && String(key).toLowerCase() !== e.en.toLowerCase();
    return byFormula && FCOUNT[e.formula] > 1 ? { formula: e.formula, G: e.G, heavy: e.heavy, any: true } : e;
  }
  const U = {
    start: { en: 'Tap an atom below to start', hi: 'शुरू करने के लिए नीचे किसी परमाणु पर टैप करो' }, build: { en: 'Build: ', hi: 'बनाओ: ' }, builtIt: { en: 'You built it!', hi: 'तुमने बना लिया!' },
    free: { en: 'Build anything you like', hi: 'जो चाहो बनाओ' }, atoms: { en: 'Atoms', hi: 'परमाणु' }, bonds: { en: 'Bond', hi: 'आबंध' }, groups: { en: 'Group', hi: 'समूह' },
    single: { en: 'Single', hi: 'एकल' }, double: { en: 'Double', hi: 'द्वि' }, triple: { en: 'Triple', hi: 'त्रि' },
    vStructure: { en: 'Structure', hi: 'संरचना' }, vDot: { en: 'Electron dots', hi: 'इलेक्ट्रॉन बिंदु' }, v3d: { en: '3D model', hi: '3D मॉडल' },
    undo: { en: 'Undo', hi: 'पीछे' }, reset: { en: 'Start again', hi: 'फिर से' }, transfer: { en: 'Give an electron', hi: 'इलेक्ट्रॉन दो' },
    full: { en: 'Every atom has a full outer shell', hi: 'हर परमाणु का बाहरी कोश पूरा है' }, octet: { en: 'Octet complete', hi: 'अष्टक पूरा' }, notFull: { en: 'Some atoms still want bonds', hi: 'कुछ परमाणु अभी और आबंध चाहते हैं' }, notOct: { en: 'Not every atom has a full outer shell yet', hi: 'अभी हर परमाणु का बाहरी कोश पूरा नहीं' }, fullShell: { en: 'Every ion has a full outer shell', hi: 'हर आयन का बाहरी कोश पूरा है' },
    noFree: { en: 'That atom has no free valency. Tap another atom first.', hi: 'इस परमाणु की संयोजकता भर चुकी है। पहले दूसरे परमाणु पर टैप करो।' },
    noBond: { en: 'Not enough free valency on both atoms for that bond.', hi: 'इस आबंध के लिए दोनों परमाणुओं पर पर्याप्त खाली संयोजकता नहीं है।' },
    nextBond: { en: 'The next bond will be ', hi: 'अगला आबंध होगा: ' }, terminalOnly: { en: 'That group goes only on an end carbon.', hi: 'यह समूह केवल सिरे वाले कार्बन पर लगता है।' },
    middleOnly: { en: 'A ketone needs a carbon with carbons on both sides.', hi: 'कीटोन के लिए कार्बन के दोनों ओर कार्बन चाहिए।' }, max: { en: 'That is the most this builder holds.', hi: 'इतना ही इस निर्माता में समाता है।' },
    rotate: { en: 'Drag to turn the model', hi: 'मॉडल घुमाने के लिए खींचो' }, allIso: { en: 'find every isomer', hi: 'सारे समावयवी खोजो' }, tryEdit: { en: 'Not the target yet. Tap an atom in the picture, then change its bond or remove an atom to make room.', hi: 'अभी लक्ष्य नहीं बना। चित्र में किसी परमाणु पर टैप करो, फिर उसका आबंध बदलो या जगह बनाने के लिए कोई परमाणु हटाओ।' }, remove: { en: 'Remove atom', hi: 'परमाणु हटाओ' },
    notLeaf: { en: 'Only an end atom can be removed. Tap an atom at the edge first.', hi: 'केवल सिरे वाला परमाणु हटता है। पहले किनारे वाले परमाणु पर टैप करो।' }, pickAtom: { en: 'Tap an atom in the picture first.', hi: 'पहले चित्र में किसी परमाणु पर टैप करो।' },
    unstable: { en: 'Not a stable molecule yet: the central atom needs more partners.', hi: 'अभी स्थिर अणु नहीं: केंद्रीय परमाणु को और साथी चाहिए।' },
    selHint: { en: 'Yellow ring = where the next atom joins. Tap any atom to move it.', hi: 'पीला घेरा = अगला परमाणु यहाँ जुड़ेगा। बदलने के लिए किसी परमाणु पर टैप करो।' }, isoFound: { en: 'Isomers found', hi: 'मिले समावयवी' }, of: { en: ' of ', hi: ' / ' },
    sameFormula: { en: 'Same formula, different structure: an isomer!', hi: 'सूत्र वही, संरचना अलग: समावयवी!' }, name: { en: 'Name', hi: 'नाम' },
    pickMetal: { en: 'Pick a metal and a non-metal first.', hi: 'पहले एक धातु और एक अधातु चुनो।' }, allMoved: { en: 'All electrons have moved. The ions now attract each other.', hi: 'सारे इलेक्ट्रॉन जा चुके। अब आयन एक-दूसरे को खींचते हैं।' },
    gives: { en: ' gives ', hi: ' देता है ' }, takes: { en: ' takes ', hi: ' लेता है ' }, electron: { en: 'electron', hi: 'इलेक्ट्रॉन' }, electrons: { en: 'electrons', hi: 'इलेक्ट्रॉन' },
    ionicNote: { en: 'Opposite charges attract: the ions hold together by an ionic bond and pack into a crystal.', hi: 'विपरीत आवेश आकर्षित होते हैं: आयन आयनिक आबंध से जुड़कर क्रिस्टल बनाते हैं।' },
    lattice: { en: 'In the crystal every ion is surrounded by ions of the opposite charge.', hi: 'क्रिस्टल में हर आयन विपरीत आवेश वाले आयनों से घिरा रहता है।' },
    cluster: { en: 'Ions attract in every direction; many such units pack into a crystal.', hi: 'आयन हर दिशा में आकर्षित करते हैं; ऐसी बहुत-सी इकाइयाँ मिलकर क्रिस्टल बनाती हैं।' },
    central: { en: 'Central atom', hi: 'केंद्रीय परमाणु' }, around: { en: 'Atoms around it', hi: 'चारों ओर के परमाणु' }, firstCentral: { en: 'Pick the central atom first (it goes in the middle).', hi: 'पहले केंद्रीय परमाणु चुनो (वह बीच में रहता है)।' },
    lp: { en: 'lone pairs', hi: 'एकाकी युग्म' }, lp1: { en: 'lone pair', hi: 'एकाकी युग्म' }, angle: { en: 'Bond angle', hi: 'आबंध कोण' }, shape: { en: 'Shape', hi: 'आकार' },
    keepAdding: { en: 'Keep adding atoms until every electron is paired.', hi: 'तब तक परमाणु जोड़ो जब तक हर इलेक्ट्रॉन युग्म में न आ जाए।' }, tooMany: { en: 'The central atom cannot hold that many.', hi: 'केंद्रीय परमाणु इतने नहीं रख सकता।' },
    expanded: { en: 'Expanded octet', hi: 'विस्तारित अष्टक' }, incomplete: { en: 'Incomplete octet', hi: 'अपूर्ण अष्टक' }, metal: { en: 'metal', hi: 'धातु' }, nonmetal: { en: 'non-metal', hi: 'अधातु' },
  };

  // ---- mount ----
  function mount(root, cfg, api) {
    cfg = Object.assign({}, cfg);
    // A narrow stage (phone) gets its own taller drawing area so atoms stay big enough to tap and read.
    const narrow = (root.clientWidth || 800) < 560, W = narrow ? 440 : 800, H = narrow ? 420 : 460, FS = narrow ? 13 : 15;
    const mode = cfg.mode, T = (x) => api.t(x);
    const pal = palette(cfg);
    const target = resolve(cfg, cfg.target), start = mode === 'isomers' ? findEntry(cfg.start) : resolve(cfg, cfg.start);
    const builder = mode === 'covalent' || mode === 'carbon' || mode === 'isomers';
    const views = builder ? ['structure', 'dot', '3d'] : mode === 'ionic' ? ['dot', '3d'] : ['3d', 'dot'];
    const S = { view: views.includes(cfg.view) ? cfg.view : views[0], th: 0.6, tilt: 0.35, G: { atoms: [], bonds: [] }, par: [], sel: null, bt: 1, hist: [], lastName: null, found: [], done: false,
      metal: null, non: null, given: [], got: [], moving: null, close: 0, central: null, terms: [] };
    let raf = 0, stopTween = null;
    const emit = (ev) => { if (!S.quiet) api.emit(ev); };
    const VN = { structure: U.vStructure, dot: U.vDot, '3d': U.v3d };
    root.innerHTML = `<div class="mo">
      <div class="mo-top"><div class="mo-goal" id="mo-goal"></div>
        <div class="mo-views" role="group" aria-label="${esc(T({ en: 'View', hi: 'दृश्य' }))}">${views.map((v) => `<button type="button" data-key="view:${v}" aria-pressed="${S.view === v}">${esc(T(VN[v]))}</button>`).join('')}</div></div>
      <svg class="mo-svg" viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(T({ en: 'Molecule', hi: 'अणु' }))}"></svg>
      <div class="mo-row" id="mo-pal"></div>
      <div class="mo-row" id="mo-ctl"></div>
      <div class="mo-out" aria-live="polite" id="mo-out"></div></div>`;
    const svg = root.querySelector('svg'), out = root.querySelector('#mo-out'), goal = root.querySelector('#mo-goal');
    const palBtn = (s) => { const e = EL[s]; return `<button type="button" class="mo-pal ${e.ink === '#fff' ? 'light' : ''} ${e.metal ? 'metal' : ''}" data-key="atom:${s}" style="background:${e.col}" aria-label="${esc(T(e))}">${s}<small>${esc(T(e))}</small></button>`; };
    const bondIcon = (o) => `<svg viewBox="0 0 26 16" aria-hidden="true">${(o === 1 ? [8] : o === 2 ? [4, 12] : [2, 8, 14]).map((y) => `<line x1="2" y1="${y}" x2="24" y2="${y}" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>`).join('')}</svg>`;
    const groupsFor = () => [].concat(pal.includes('O') ? ['alcohol', 'aldehyde', 'acid', 'ketone'] : [], pal.includes('Cl') ? ['chloro'] : [], pal.includes('Br') ? ['bromo'] : []);
    root.querySelector('#mo-pal').innerHTML = `<span class="mo-lbl">${esc(T(U.atoms))}</span>` + pal.filter((s) => mode !== 'carbon' || s === 'C').map(palBtn).join('')
      + (mode === 'carbon' && groupsFor().length ? `<span class="mo-lbl mo-glbl">${esc(T(U.groups))}</span><div class="mo-grps">` + groupsFor().map((g) => `<button type="button" class="mo-grp" data-key="group:${g}"><b>${esc(GROUPS[g].show)}</b>${esc(T(GROUPS[g]))}</button>`).join('') + '</div>' : '');
    root.querySelector('#mo-ctl').innerHTML = (mode === 'covalent' || mode === 'carbon' ? `<span class="mo-lbl">${esc(T(U.bonds))}</span><div class="mo-seg" role="group" aria-label="${esc(T(U.bonds))}">` + [1, 2, 3].map((o) => `<button type="button" class="mo-bond" data-key="bond:${['', 'single', 'double', 'triple'][o]}" aria-pressed="${S.bt === o}">${bondIcon(o)}${esc(T(U[['', 'single', 'double', 'triple'][o]]))}</button>`).join('') + '</div>' : '')
      + (mode === 'ionic' ? `<button type="button" class="mo-go" data-key="transfer">⚡ ${esc(T(U.transfer))}</button>` : '')
      + `<div class="mo-tools">${builder ? `<button type="button" class="ghost" data-key="remove">✕ ${esc(T(U.remove))}</button>` : ''}<button type="button" class="ghost" data-key="undo">↶ ${esc(T(U.undo))}</button><button type="button" class="ghost" data-key="reset">${esc(T(U.reset))}</button></div>`;

    const backdrop = () => `<rect width="${W}" height="${H}" fill="transparent"/><g opacity=".35">${[[90, 70, 2], [700, 90, 3], [740, 380, 2], [60, 400, 3], [400, 30, 1.5], [620, 430, 1.5]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#9FB6FF"/>`).join('')}</g>`;
    const hint = (txt) => `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="${narrow ? 17 : 26}" fill="#C9D5F5" font-weight="700" style="font-family:var(--font-body)">${esc(txt)}</text>`;
    const setGoal = (done) => {
      if (!target) { goal.innerHTML = `<span>${esc(T(U.free))}</span>`; return; }
      const nm = target.en ? T(target) : target.v ? T(target.v.shape) : target.formula;
      goal.className = 'mo-goal' + (done ? ' done' : '');
      const fm = sub(target.v ? target.formula : conv(target.formula));
      goal.innerHTML = done ? `<span>🎉 ${esc(T(U.builtIt))}</span> <b>${fm}</b>` : `<span>${esc(T(U.build))}</span>` + (nm === target.formula ? `<b>${fm}</b>` : `<b>${esc(nm)}</b><span>(${fm})</span>`) + (target.iso ? `<span>· ${esc(T(U.allIso))}</span>` : '');
    };
    const setView = (v, tell) => { S.view = v; svg.classList.toggle('rot', v === '3d'); root.querySelectorAll('.mo-views button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === 'view:' + v))); draw(); if (tell) { emit('view:' + v); api.record(T({ en: 'Switched to ', hi: 'दृश्य बदला: ' }) + T(VN[v])); } };
    function loop() {
      cancelAnimationFrame(raf);
      if (S.view !== '3d' || reduced()) return;
      const f = () => { S.th += 0.006; draw(); raf = requestAnimationFrame(f); };
      raf = requestAnimationFrame(f);
    }
    // drag to turn the 3D model
    let drag = null;
    svg.addEventListener('pointerdown', (e) => { if (S.view !== '3d') return; drag = { x: e.clientX, y: e.clientY, th: S.th, tilt: S.tilt }; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener('pointermove', (e) => { if (!drag) return; S.th = drag.th + (e.clientX - drag.x) * 0.012; S.tilt = Math.max(-1.2, Math.min(1.2, drag.tilt + (e.clientY - drag.y) * 0.01)); if (reduced()) draw(); });
    svg.addEventListener('pointerup', () => (drag = null));
    svg.addEventListener('pointercancel', () => (drag = null));

    // ---------- builder modes (covalent, carbon, isomers) ----------
    const shown = () => (mode === 'covalent' ? S.G : withH(S.G));
    const snapshot = () => { S.hist.push(JSON.stringify({ G: S.G, par: S.par, sel: S.sel })); if (S.hist.length > 40) S.hist.shift(); };
    // Common names only where the formula allows one structure under the valency rules (no carbon, or CO2/CS2).
    const nameOf = (G) => { const n = iupac(G); if (n) return n; const f = formula(G.atoms); return NAMES[f] && (!G.atoms.includes('C') || STAR[f]) ? Object.assign({ formula: f }, NAMES[f]) : null; };
    function evalBuild() {
      const G = shown();
      if (!G.atoms.length) { out.innerHTML = `<p class="mo-note">${esc(T(U.start))}</p>`; setGoal(false); return; }
      const f = formula(G.atoms), ok = complete(G), nm = ok ? nameOf(G) : null;
      const badge = mode === 'covalent' ? `<span class="mo-badge ${ok ? 'on' : ''}">${esc(T(ok ? U.full : U.notFull))}</span>` : '';
      let extra = '';
      if (mode === 'isomers' && target) extra = `<div class="mo-found"><span class="mo-lbl">${esc(T(U.isoFound))} ${S.found.length}${esc(T(U.of))}${target.iso}</span>${S.found.map((x) => `<span>${esc(T(x))}</span>`).join('')}</div>`;
      out.innerHTML = `<span class="mo-formula">${sub(conv(f))}</span>${nm ? `<span class="mo-name">${esc(T(nm))}</span>` : ''}${badge}${extra}${S.view !== '3d' && (!ok || S.G.atoms.length < 3) ? `<p class="mo-note">${esc(T(U.selHint))}</p>` : ''}`;
      if (!ok) { setGoal(false); return; }
      const key = nm ? nm.en.toLowerCase() : f;
      if (nm && S.lastName !== key) { S.lastName = key; emit('named:' + nm.en.toLowerCase()); api.record(T({ en: 'Built ', hi: 'बनाया: ' }) + T(nm) + ' (' + conv(f) + ')'); }
      if (mode === 'isomers' && target && f === target.formula && nm && !S.found.some((x) => x.en === nm.en)) { S.found.push(nm); if (S.found.length > 1) api.toast(U.sameFormula); evalBuild(); return; }
      const hit = target && target.formula === f && (mode === 'isomers' ? S.found.length >= target.iso : !target.en || !nm || target.en.toLowerCase() === nm.en.toLowerCase());
      setGoal(!!hit);
      if (!hit && target && mode !== 'isomers') out.insertAdjacentHTML('beforeend', `<p class="mo-note">${esc(T(U.tryEdit))}</p>`);
      if (hit && !S.done) { S.done = true; api.celebrate(); api.speak(T(U.builtIt)); }
      emit('built:' + f); if (conv(f) !== f) emit('built:' + conv(f));
      if (mode === 'covalent') emit('octet');
    }
    // The bond a bond button changes: one of the selected atom's bonds to another non-hydrogen atom that can take the
    // new order (its parent bond first, then the newest).
    function bondOf(i, o) {
      if (i == null || i >= S.G.atoms.length) return null;
      const can = (b) => { const d = o - b.o; return b.o !== o && (d <= 0 || (free(S.G, b.a) >= d && free(S.G, b.b) >= d)); };
      const heavy = nbrs(S.G, i).filter((n) => S.G.atoms[n.j] !== 'H').map((n) => n.j);
      const order = (S.par[i] != null && heavy.includes(S.par[i]) ? [S.par[i]] : []).concat(heavy.filter((j) => j !== S.par[i]).sort((a, b) => b - a));
      const bs = order.map((j) => bondBetween(S.G, i, j));
      return bs.find(can) || bs.find((b) => b.o !== o) || null;
    }
    const heavyFree = (i) => free(S.G, i);
    function addAtom(sym, o = S.bt) {
      const G = S.G;
      if (G.atoms.length >= 16) { api.toast(U.max); return false; }
      if (!G.atoms.length) { snapshot(); G.atoms.push(sym); S.par.push(null); S.sel = 0; return true; }
      if (S.sel == null) S.sel = G.atoms.findIndex((_, i) => heavyFree(i) > 0);
      if (S.sel < 0 || heavyFree(S.sel) < o) { const alt = G.atoms.findIndex((_, i) => heavyFree(i) >= o); if (alt < 0) { api.toast(U.noFree); return false; } S.sel = alt; }
      if (EL[sym].val < o) { api.toast(U.noBond); return false; }
      snapshot();
      G.atoms.push(sym); S.par.push(S.sel);
      G.bonds.push({ a: S.sel, b: G.atoms.length - 1, o });
      const j = G.atoms.length - 1;
      if (heavyFree(S.sel) === 0) S.sel = heavyFree(j) > 0 ? j : G.atoms.findIndex((_, i) => heavyFree(i) > 0);
      if (S.sel < 0) S.sel = j;
      return true;
    }
    function setBond(o) {
      S.bt = o;
      root.querySelectorAll('.mo-bond').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === 'bond:' + ['', 'single', 'double', 'triple'][o])));
      const b = bondOf(S.sel, o);
      if (b && b.o !== o) {
        const d = o - b.o;
        if (heavyFree(b.a) >= d && heavyFree(b.b) >= d) { snapshot(); b.o = o; draw(); evalBuild(); emit('bonded'); api.record(T({ en: 'Made a ', hi: 'बनाया: ' }) + T(U[['', 'single', 'double', 'triple'][o]]) + T({ en: ' bond', hi: ' आबंध' })); return; }
        api.toast(U.noBond); return;
      }
      api.toast(T(U.nextBond) + T(U[['', 'single', 'double', 'triple'][o]]));
    }
    function addGroup(g) {
      const G = S.G, i = S.sel;
      if (i == null || G.atoms[i] !== 'C') { api.toast(U.noFree); return; }
      const cN = nbrs(G, i).filter((n) => G.atoms[n.j] === 'C').length, f = heavyFree(i);
      const push = (s, o) => { G.atoms.push(s); S.par.push(i); G.bonds.push({ a: i, b: G.atoms.length - 1, o }); };
      if (g === 'alcohol' || g === 'chloro' || g === 'bromo') { if (f < 1) { api.toast(U.noFree); return; } snapshot(); push(g === 'alcohol' ? 'O' : g === 'chloro' ? 'Cl' : 'Br', 1); }
      else if (g === 'aldehyde' || g === 'acid') { if (cN > 1) { api.toast(U.terminalOnly); return; } if (f < (g === 'acid' ? 3 : 2)) { api.toast(U.noFree); return; } snapshot(); push('O', 2); if (g === 'acid') push('O', 1); }
      else if (g === 'ketone') { if (cN < 2) { api.toast(U.middleOnly); return; } if (f < 2) { api.toast(U.noFree); return; } snapshot(); push('O', 2); }
      draw(); evalBuild(); emit('bonded'); api.record(T({ en: 'Added group ', hi: 'समूह जोड़ा: ' }) + GROUPS[g].show);
    }
    function removeSel() {
      const G = S.G, i = S.sel;
      if (i == null || i >= G.atoms.length) { api.toast(U.pickAtom); return; }
      const ns = nbrs(G, i);
      if (G.atoms.length > 1 && ns.length !== 1) { api.toast(U.notLeaf); return; }
      snapshot();
      const sym = G.atoms[i];
      G.atoms.splice(i, 1);
      G.bonds = G.bonds.filter((b) => b.a !== i && b.b !== i).map((b) => ({ a: b.a > i ? b.a - 1 : b.a, b: b.b > i ? b.b - 1 : b.b, o: b.o }));
      S.par = G.atoms.map((_, k) => { const n = nbrs(G, k).map((x) => x.j).filter((j) => j < k); return n.length ? Math.min(...n) : null; });
      S.sel = G.atoms.length && ns.length ? (ns[0].j > i ? ns[0].j - 1 : ns[0].j) : null;
      S.done = false; S.lastName = null;
      draw(); evalBuild(); api.record(T({ en: 'Removed ', hi: 'हटाया: ' }) + T(EL[sym]));
    }
    function loadEntry(e) {
      if (!e || !e.G) return;
      S.G = { atoms: e.G.atoms.slice(), bonds: e.G.bonds.map((b) => ({ a: b.a, b: b.b, o: b.o })) };
      if (mode === 'covalent' && e.heavy) S.G = withH(S.G);
      S.par = S.G.atoms.map((_, i) => { const b = S.G.bonds.find((x) => x.b === i); return b ? b.a : null; });
      S.sel = S.G.atoms.findIndex((_, i) => heavyFree(i) > 0); if (S.sel < 0) S.sel = 0;
    }

    // ---------- ionic mode ----------
    const info = () => (S.metal && S.non ? ionic(S.metal, S.non) : null);
    const ionDone = () => { const I = info(); return !!I && S.given.every((g) => g >= I.cm) && S.got.every((g) => g >= I.cx) && S.given.length === I.nm; };
    const charge = (n, sign) => (n > 1 ? '⁰¹²³⁴'[n] : '') + (sign === '+' ? '⁺' : '⁻');
    function ionLayout() {
      const I = info(), nm = I ? I.nm : S.metal ? 1 : 0, nx = I ? I.nx : S.non ? 1 : 0;
      // Rows of ions with room for each charge badge above its ion; at the end the ions close in until they touch.
      const k = Math.max(nm, nx, 1);
      const maxR = Math.min(78, W * 0.125, (H - 80 - (k - 1) * 36) / (2 * k));
      const top = maxR + 40, bot = H - maxR - 40;
      const ys = (n) => (n <= 1 ? [(top + bot) / 2] : Array.from({ length: n }, (_, i) => top + (i * (bot - top)) / (n - 1)));
      const ring = (sym, lost) => { const n = EL[sym].sh.length, step = n > 1 ? Math.max(11, (maxR - 20) / (n - 1)) : 0; return 22 + Math.max(0, n - 1 - (lost ? 1 : 0)) * step; };
      const dEnd = S.metal && S.non ? ring(S.metal, true) + ring(S.non, false) + 12 : W * 0.46;
      const d = lerp(W * 0.46, Math.min(W * 0.46, dEnd), S.close);
      return { nm, nx, maxR, M: ys(nm).map((y) => ({ x: W / 2 - d / 2, y })), X: ys(nx).map((y) => ({ x: W / 2 + d / 2, y })) };
    }
    const slotPos = (p, r, idx, n) => { const a = rad(-90 + (360 * idx) / n); return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }; };
    function drawIon(sym, p, maxR, outerCount, lost, badge, hot) {
      const e = EL[sym], sh = e.sh.slice();
      const n = sh.length, step = n > 1 ? Math.max(11, (maxR - 20) / (n - 1)) : 0;
      let s = sphere(p.x, p.y, 15, sym) + label(p.x, p.y, sym, 16, e.ink);
      sh.forEach((c, k) => {
        const r = 22 + k * step, outer = k === n - 1;
        if (outer && lost) { s += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="none" stroke="#9FB6FF" stroke-opacity=".25" stroke-width="1.5" stroke-dasharray="4 5"/>`; return; }
        const cnt = outer ? outerCount : c, slots = outer ? 8 : c;
        s += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="none" stroke="${outer && cnt === 8 ? '#5EE0C9' : '#9FB6FF'}" stroke-opacity="${outer ? 0.8 : 0.4}" stroke-width="${outer ? 2.5 : 1.5}"/>`;
        for (let j = 0; j < cnt; j++) { const q = slotPos(p, r, j, slots); s += `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="4.6" fill="${outer && hot && j >= cnt - hot ? '#FF9B57' : '#FFE27A'}"/>`; }
      });
      if (badge) s += `<rect x="${p.x - 28}" y="${p.y - maxR - 34}" width="56" height="26" rx="13" fill="#FFD23F"/><text x="${p.x}" y="${p.y - maxR - 15}" text-anchor="middle" font-size="17" fill="#1E293B">${esc(badge)}</text>`;
      return `<g aria-label="${esc(T(e))}">${s}</g>`;
    }
    function drawIonic() {
      const I = info(), Lo = ionLayout();
      if (!S.metal && !S.non) return hint(T(U.start));
      if (S.view === '3d' && I) {
        const G3 = { atoms: [], bonds: [] }, pos = [];
        if (I.nm === 1 && I.nx === 1 && I.cm <= 2) { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { G3.atoms.push((i + j + k + 3) % 2 === 0 ? I.m : I.x); pos.push([i * 0.9, j * 0.9, k * 0.9]); } }
        else { for (let i = 0; i < I.nm; i++) { G3.atoms.push(I.m); pos.push([0, (i - (I.nm - 1) / 2) * 1.2, 0]); } for (let i = 0; i < I.nx; i++) { const a = (2 * Math.PI * i) / I.nx; G3.atoms.push(I.x); pos.push([Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3]); } }
        return draw3D(G3, { pos, lps: [] }, S.th, S.tilt, W, H, { ball: 17, scale: 95 }) + `<text x="${W / 2}" y="${H - 16}" text-anchor="middle" font-size="${FS}" fill="#C9D5F5" style="font-family:var(--font-body)">${esc(T(U.rotate))}</text>`;
      }
      let s = '';
      if (S.metal) Lo.M.forEach((p, i) => { const g = S.given[i] || 0, cm = EL[S.metal].metal; const left = EL[S.metal].ve - g - (S.moving && S.moving.mi === i ? 1 : 0); s += drawIon(S.metal, p, Lo.maxR, left, left <= 0, g >= cm ? S.metal + charge(cm, '+') : null, I ? Math.min(left, cm - g) : 0); });
      if (S.non) Lo.X.forEach((p, i) => { const g = S.got[i] || 0, cx = 8 - EL[S.non].ve; s += drawIon(S.non, p, Lo.maxR, EL[S.non].ve + g, false, g >= cx ? S.non + charge(cx, '−') : null, 0); });
      if (S.moving) s += `<circle cx="${S.moving.x.toFixed(1)}" cy="${S.moving.y.toFixed(1)}" r="6" fill="#FF9B57" stroke="#fff" stroke-width="1.5"/>`;
      if (I && S.close > 0.5) { const m = Lo.M[0], x = Lo.X[0]; s += `<text x="${W / 2}" y="${H - 16}" text-anchor="middle" font-size="${FS + 1}" fill="#FFE27A" style="font-family:var(--font-body)">${esc(T(U.allMoved))}</text>`; }
      return s;
    }
    function evalIonic() {
      const I = info();
      if (!I) { out.innerHTML = `<p class="mo-note">${esc(S.metal || S.non ? T(U.pickMetal) : T(U.start))}</p>`; setGoal(false); return; }
      const done = ionDone();
      const n1 = (k) => `${k} ${T(k === 1 ? U.electron : U.electrons)}`;
      out.innerHTML = `<span class="mo-formula">${sub(I.formula)}</span><span class="mo-name">${esc(T(I))}</span><span class="mo-badge ${done ? 'on' : ''}">${esc(T(done ? U.fullShell : U.notOct))}</span>
        <p class="mo-note">${esc(api.lang() === 'hi' ? `${T(EL[I.m])} (${T(U.metal)}) ${n1(I.cm)} देता है → ${I.m}${charge(I.cm, '+')}।  ${T(EL[I.x])} (${T(U.nonmetal)}) ${n1(I.cx)} लेता है → ${I.x}${charge(I.cx, '−')}।` : `${T(EL[I.m])} (${T(U.metal)})${T(U.gives)}${n1(I.cm)} → ${I.m}${charge(I.cm, '+')};  ${T(EL[I.x])} (${T(U.nonmetal)})${T(U.takes)}${n1(I.cx)} → ${I.x}${charge(I.cx, '−')}.`)} ${done ? esc(T(I.nm === 1 && I.nx === 1 && I.cm <= 2 ? U.lattice : U.cluster)) : ''}</p>`;
      setGoal(done && target && target.formula === I.formula);
    }
    function transfer() {
      const I = info();
      if (!I) { api.toast(U.pickMetal); return; }
      if (S.moving) return;
      const mi = S.given.findIndex((g) => g < I.cm), ni = S.got.findIndex((g) => g < I.cx);
      if (mi < 0 || ni < 0) { api.toast(U.allMoved); return; }
      const Lo = ionLayout(), e = EL[I.m], shM = e.sh.length, shX = EL[I.x].sh.length;
      const rM = 22 + (shM - 1) * Math.max(11, (Lo.maxR - 20) / (shM - 1)), rX = 22 + (shX - 1) * Math.max(11, (Lo.maxR - 20) / (shX - 1));
      const from = slotPos(Lo.M[mi], rM, e.ve - S.given[mi] - 1, 8), to = slotPos(Lo.X[ni], rX, EL[I.x].ve + S.got[ni], 8);
      S.moving = { mi, x: from.x, y: from.y };
      stopTween = tween(900, (t) => { const k = ease(t); S.moving.x = lerp(from.x, to.x, k); S.moving.y = lerp(from.y, to.y, k) - Math.sin(Math.PI * t) * 40; draw(); }, () => {
        S.moving = null; S.given[mi]++; S.got[ni]++;
        draw(); evalIonic(); emit('transferred');
        api.record(T({ en: 'Moved an electron from ', hi: 'इलेक्ट्रॉन ले गया: ' }) + I.m + ' → ' + I.x);
        if (ionDone()) {
          stopTween = tween(800, (t) => { S.close = ease(t); draw(); }, () => { draw(); evalIonic(); emit('built:' + I.formula); emit('octet'); emit('named:' + I.en.toLowerCase()); if (target && target.formula === I.formula && !S.done) { S.done = true; api.celebrate(); api.speak(T(U.builtIt)); } });
        }
      });
    }
    function setIonic(m, x) { S.metal = m; S.non = x; S.close = 0; const I = info(); S.given = Array(I ? I.nm : m ? 1 : 0).fill(0); S.got = Array(I ? I.nx : x ? 1 : 0).fill(0); S.done = false; }

    // ---------- shapes mode ----------
    const shapeG = () => ({ atoms: [S.central].concat(S.terms), bonds: S.terms.map((t, i) => ({ a: 0, b: i + 1, o: t === 'H' ? 1 : 8 - EL[t].ve })) });
    function drawShapes() {
      if (!S.central) return hint(T(U.start));
      const v0 = vsepr(S.central, S.terms), v = shapeOk(v0) ? v0 : null, G = shapeG();
      if (S.view === 'dot') return draw2D(G, 'dot', null, W, H, api);
      let pos, lps;
      if (v) {
        // Turn the model so the lone pairs point up (the textbook view); with none, a tetrahedron stands on three legs.
        let dirs = DIRS[v.st].map((d) => d.slice());
        const m = dirs.slice(v.n).reduce((a, d) => V.add(a, d), [0, 0, 0]);
        if (V.len(m) > 0.1) dirs = dirs.map(V.rotTo(V.unit(m), [0, 1, 0]));
        else if (!v.lp && v.st === 4) dirs = dirs.map(V.rotTo(dirs[0], [0, 1, 0]));
        pos = [[0, 0, 0]].concat(S.terms.map((t, i) => V.mul(dirs[i], t === 'H' ? 0.8 : 1))); lps = [dirs.slice(v.n)];
      }
      else { pos = [[0, 0, 0]].concat(S.terms.map((t, i) => { const a = (2 * Math.PI * i) / Math.max(1, S.terms.length); return [Math.cos(a), 0, Math.sin(a)]; })); lps = []; }
      return draw3D(G, { pos, lps }, S.th, S.tilt, W, H, { lonePairs: true, ball: narrow ? 27 : 31, scale: narrow ? 150 : 180, stick: narrow ? 1 : 1.25 }) + `<text x="${W / 2}" y="${H - 16}" text-anchor="middle" font-size="${FS}" fill="#C9D5F5" style="font-family:var(--font-body)">${esc(T(v ? U.rotate : U.keepAdding))}</text>`;
    }
    function evalShapes(changed) {
      if (!S.central) { out.innerHTML = `<p class="mo-note">${esc(T(U.start))}</p>`; setGoal(false); return; }
      const v0 = vsepr(S.central, S.terms), v = shapeOk(v0) ? v0 : null;
      if (!v) { out.innerHTML = `<span class="mo-name">${esc(T(U.central))}: ${S.central}</span><span class="mo-badge">${esc(T(U.around))}: ${S.terms.length ? S.terms.join(', ') : '–'}</span><p class="mo-note">${esc(T(v0 ? U.unstable : U.keepAdding))}</p>`; setGoal(false); return; }
      const oct = v.electrons === 8 ? U.octet : v.electrons > 8 ? U.expanded : U.incomplete;
      out.innerHTML = `<span class="mo-formula">${sub(v.formula)}</span><span class="mo-name">${esc(T(U.shape))}: ${esc(T(v.shape))}</span><span class="mo-badge on">AX${v.n}${v.lp ? 'E' + v.lp : ''}</span><span class="mo-badge ${v.electrons === 8 ? 'on' : ''}">${esc(T(oct))} (${v.electrons} e⁻)</span>
        <p class="mo-note">${esc(T(U.angle))}: ${esc(ANGLE[v.formula] || v.shape.angle)} · ${v.lp} ${esc(T(v.lp === 1 ? U.lp1 : U.lp))}</p>`;
      const hit = target && target.formula === v.formula;
      setGoal(!!hit);
      if (changed) {
        emit('built:' + v.formula); emit('named:' + v.shape.en.toLowerCase()); if (v.electrons === 8) emit('octet');
        api.record(T({ en: 'Built ', hi: 'बनाया: ' }) + v.formula + ': ' + T(v.shape));
        if (hit && !S.done) { S.done = true; api.celebrate(); api.speak(T(v.shape)); }
      }
    }

    // ---------- draw / events ----------
    function draw() {
      let body;
      if (builder) { const G = shown(); body = !G.atoms.length ? hint(T(U.start)) : S.view === '3d' ? draw3D(G, embed3D(G), S.th, S.tilt, W, H, { ball: narrow ? 24 : 30, ballK: 0.24, scale: narrow ? 130 : 170 }) + `<text x="${W / 2}" y="${H - 16}" text-anchor="middle" font-size="${FS}" fill="#C9D5F5" style="font-family:var(--font-body)">${esc(T(U.rotate))}</text>` : draw2D(G, S.view, S.sel, W, H, api); }
      else body = mode === 'ionic' ? drawIonic() : drawShapes();
      svg.innerHTML = DEFS + backdrop() + body;
    }
    const evalAll = (changed) => (builder ? evalBuild() : mode === 'ionic' ? evalIonic() : evalShapes(changed));
    function reset() {
      if (stopTween) stopTween();
      Object.assign(S, { G: { atoms: [], bonds: [] }, par: [], sel: null, hist: [], lastName: null, found: [], done: false, metal: null, non: null, given: [], got: [], moving: null, close: 0, central: null, terms: [] });
      draw(); evalAll(false); api.record(T({ en: 'Started again', hi: 'फिर से शुरू किया' }));
    }
    const box = root.querySelector('.mo');
    box.addEventListener('click', (e) => {
      const sg = e.target.closest('[data-sel]');
      if (sg) { const i = +sg.dataset.sel; if (builder && i < S.G.atoms.length) { S.sel = i; draw(); api.speak(T(EL[S.G.atoms[i]])); } return; }
      const el = e.target.closest('[data-key]');
      if (!el) return;
      const key = el.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key.startsWith('view:')) { setView(key.slice(5), true); loop(); return; }
      if (key === 'reset') { reset(); return; }
      if (key === 'remove') { if (builder) removeSel(); return; }
      if (key === 'undo') {
        if (builder) { const h = S.hist.pop(); if (!h) return; const o = JSON.parse(h); S.G = o.G; S.par = o.par; S.sel = o.sel; S.done = false; }
        else if (mode === 'ionic') { if (stopTween) stopTween(); S.moving = null; S.given = S.given.map(() => 0); S.got = S.got.map(() => 0); S.close = 0; S.done = false; }
        else { if (S.terms.length) S.terms.pop(); else S.central = null; S.done = false; }
        draw(); evalAll(true); return;
      }
      if (key.startsWith('atom:')) {
        const s = key.slice(5);
        if (!pal.includes(s)) return;
        if (builder) { if (mode !== 'covalent' && s !== 'C') return; const had = S.G.atoms.length; if (!addAtom(s)) return; draw(); evalBuild(); emit('added:' + s); if (had) emit('bonded'); api.record(T({ en: 'Added ', hi: 'जोड़ा: ' }) + T(EL[s])); api.speak(T(EL[s])); }
        else if (mode === 'ionic') { if (EL[s].metal) setIonic(s, S.non); else setIonic(S.metal, s); draw(); evalIonic(); emit('added:' + s); api.speak(T(EL[s])); }
        else {
          if (!S.central) { if (!CENTRAL.includes(s)) { api.toast(U.firstCentral); return; } S.central = s; }
          else { if (!TERMINAL.includes(s)) { api.toast(U.firstCentral); return; } const need = s === 'H' ? 1 : 8 - EL[s].ve; const used = S.terms.reduce((a, t) => a + (t === 'H' ? 1 : 8 - EL[t].ve), 0); if (S.terms.length >= 6 || used + need > EL[S.central].ve) { api.toast(U.tooMany); return; } S.terms.push(s); }
          S.done = S.done && shapeOk(vsepr(S.central, S.terms));
          draw(); evalShapes(true); emit('added:' + s); api.speak(T(EL[s]));
        }
        return;
      }
      if (key.startsWith('bond:')) { setBond({ single: 1, double: 2, triple: 3 }[key.slice(5)] || 1); return; }
      if (key.startsWith('group:')) { addGroup(key.slice(6)); return; }
      if (key === 'transfer') transfer();
    });
    box.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-sel]')) { e.preventDefault(); e.target.closest('[data-sel]').dispatchEvent(new MouseEvent('click', { bubbles: true })); } });

    // ---------- start ----------
    S.quiet = true;
    if (start) {
      if (builder) loadEntry(start);
      else if (mode === 'ionic') setIonic(start.m, start.x);
      else { S.central = start.c; S.terms = start.terms.slice(); }
    }
    svg.classList.toggle('rot', S.view === '3d');
    draw(); evalAll(true); S.quiet = false; S.done = false; setGoal(false);
    loop();
    return { destroy() { cancelAnimationFrame(raf); if (stopTween) stopTween(); } };
  }

  // ---- register ----
  const BONDS = ['bond:single', 'bond:double', 'bond:triple'];
  NCA_T.register({
    id: 'molecule',
    css: CSS,
    validate(c) {
      const e = [];
      if (!c || typeof c !== 'object') return ['config must be an object'];
      if (!MODES.includes(c.mode)) { e.push('mode: one of ' + MODES.join(', ')); return e; }
      if (c.atoms !== undefined) {
        if (!Array.isArray(c.atoms) || !c.atoms.length || c.atoms.length > 12) e.push('atoms: 1 to 12 element symbols');
        else {
          c.atoms.forEach((s) => { if (!PAL[c.mode].all.includes(s)) e.push(`atoms: ${s} is not available in ${c.mode} mode (allowed: ${PAL[c.mode].all.join(' ')})`); });
          if (new Set(c.atoms).size !== c.atoms.length) e.push('atoms: a symbol is repeated');
          if (c.mode === 'ionic' && !(c.atoms.some((s) => METALS.includes(s)) && c.atoms.some((s) => NONMET.includes(s)))) e.push('atoms: ionic mode needs at least one metal and one non-metal');
          if (c.mode === 'shapes' && !(c.atoms.some((s) => CENTRAL.includes(s)) && c.atoms.some((s) => TERMINAL.includes(s)))) e.push('atoms: shapes mode needs a central atom and a terminal atom');
        }
      }
      if (e.length) return e;
      for (const k of ['target', 'start']) if (c[k] !== undefined) {
        if (typeof c[k] !== 'string' || !c[k].trim()) e.push(`${k}: a formula or name`);
        else if (!(k === 'start' && c.mode === 'isomers' ? (findEntry(c[k]) && findEntry(c[k]).heavy && findEntry(c[k]).G.atoms.every((s) => s === 'C')) : resolve(c, c[k]))) e.push(`${k}: "${c[k]}" cannot be built in ${c.mode} mode with these atoms`);
      }
      if (c.view !== undefined && !['structure', 'dot', '3d'].includes(c.view)) e.push('view: structure, dot or 3d');
      return e;
    },
    keys(c) {
      c = c || {};
      const pal = palette(c), mode = c.mode;
      const builder = mode === 'covalent' || mode === 'carbon' || mode === 'isomers';
      const views = builder ? ['structure', 'dot', '3d'] : mode === 'ionic' ? ['dot', '3d'] : ['3d', 'dot'];
      const groups = mode === 'carbon' ? [].concat(pal.includes('O') ? ['alcohol', 'aldehyde', 'acid', 'ketone'] : [], pal.includes('Cl') ? ['chloro'] : [], pal.includes('Br') ? ['bromo'] : []) : [];
      const targets = pal.filter((s) => mode !== 'carbon' || s === 'C').map((s) => 'atom:' + s).concat(mode === 'covalent' || mode === 'carbon' ? BONDS : [], groups.map((g) => 'group:' + g), views.map((v) => 'view:' + v), mode === 'ionic' ? ['transfer'] : [], builder ? ['remove'] : [], ['undo', 'reset']);
      const t = c.target ? resolve(c, c.target) : null;
      const events = ['built:*', 'named:*', 'view:*', 'added:*', 'octet'].concat(t ? ['built:' + t.formula].concat(conv(t.formula) !== t.formula ? ['built:' + conv(t.formula)] : [], t.en ? ['named:' + t.en.toLowerCase()] : t.v ? ['named:' + t.v.shape.en.toLowerCase()] : []) : [], builder ? ['bonded'] : [], mode === 'ionic' ? ['transferred'] : []);
      return { targets, events };
    },
    demo: { mode: 'covalent', atoms: ['H', 'C', 'O', 'N', 'Cl'], start: 'C2H4', target: 'ethanol', view: 'structure' },
    modes: MODES,
    mount(root, config, api) { return mount(root, config, api); },
  });
})();
