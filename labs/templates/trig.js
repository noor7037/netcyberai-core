// Template: Trigonometry wheel. Ratios in a right triangle, the unit circle, heights and distances with a clinometer,
// identities checked numerically, and the graphs of the six ratios. The numbers are computed, never scripted: the
// ratios come from Math, the exact values of the standard angles (0, 30, 45, 60, 90 and their reflections) from a
// table, the clinometer scene from real geometry (tan = height / distance, sin = height / string). Config:
//   { mode: 'ratios' | 'unit-circle' | 'heights' | 'identities' | 'graphs',
//     angle?: degrees (ratios, identities 0-90; unit-circle, graphs 0-360; heights 25-75),
//     scene?: 'tower' | 'tree' | 'kite' | 'building' | 'river'   (heights only),
//     ask?: 'height' | 'distance' | 'angle'                      (heights only) }
(function () {
  const L = window.NCA_LIB;
  const { esc, tween } = L;
  const T2 = (en, hi) => ({ en, hi });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const lerp = (a, b, t) => a + (b - a) * t;

  const MODES = ['ratios', 'unit-circle', 'heights', 'identities', 'graphs'];
  const RATIOS = ['sin', 'cos', 'tan', 'cosec', 'sec', 'cot'];
  const SCENES = ['tower', 'tree', 'kite', 'building', 'river'];
  const ASKS = ['height', 'distance', 'angle'];
  const STD = [0, 30, 45, 60, 90];

  // ---------------------------------------------------------------- the ratios
  const snapZ = (v) => (Math.abs(v) < 1e-12 ? 0 : v);
  function val(name, d) {
    const r = rad(d), s = snapZ(Math.sin(r)), c = snapZ(Math.cos(r));
    switch (name) {
      case 'sin': return s;
      case 'cos': return c;
      case 'tan': return c === 0 ? null : s / c;
      case 'cosec': return s === 0 ? null : 1 / s;
      case 'sec': return c === 0 ? null : 1 / c;
      case 'cot': return s === 0 ? null : c / s;
      default: return null;
    }
  }
  const vals = (d) => Object.fromEntries(RATIOS.map((n) => [n, val(n, d)]));
  // Exact forms for the reference angles (the school table); the sign comes from the real value.
  const EX = {
    sin: { 0: '0', 30: '1/2', 45: '1/√2', 60: '√3/2', 90: '1' },
    cos: { 0: '1', 30: '√3/2', 45: '1/√2', 60: '1/2', 90: '0' },
    tan: { 0: '0', 30: '1/√3', 45: '1', 60: '√3', 90: null },
    cosec: { 0: null, 30: '2', 45: '√2', 60: '2/√3', 90: '1' },
    sec: { 0: '1', 30: '2/√3', 45: '√2', 60: '2', 90: null },
    cot: { 0: null, 30: '√3', 45: '1', 60: '1/√3', 90: '0' },
  };
  // string = exact form, null = not defined, undefined = not a standard angle
  function exact(name, a) {
    const d = (((Math.round(a * 1e6) / 1e6) % 360) + 360) % 360;
    if (Math.abs(d - Math.round(d)) > 1e-6) return undefined;
    const r = d <= 90 ? d : d <= 180 ? 180 - d : d <= 270 ? d - 180 : 360 - d;
    if (!(r in EX.sin)) return undefined;
    const v = val(name, d);
    if (v === null) return null;
    const base = EX[name][r];
    if (base === null) return null;
    return v < -1e-9 ? '−' + base : base;
  }
  function fmt(v, p) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(p == null ? 3 : p);
    if (/^-0\.?0*$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function radText(a) {
    const d = Math.round(a);
    if (Math.abs(a - d) > 1e-9) return fmt(rad(a), 2) + ' rad';
    if (d === 0) return '0 rad';
    const g = gcd(d, 180), n = d / g, m = 180 / g;
    const top = n === 1 ? 'π' : n + 'π';
    return (m === 1 ? top : top + '/' + m) + ' rad';
  }
  const quadrant = (a) => { const d = ((a % 360) + 360) % 360; if (d % 90 === 0) return 0; return d < 90 ? 1 : d < 180 ? 2 : d < 270 ? 3 : 4; };

  // ---------------------------------------------------------------- words
  const RN = {
    sin: { n: T2('sine', 'ज्या'), col: '#2563EB', ct: '#FFFFFF', f: ['opp', 'hyp'] },
    cos: { n: T2('cosine', 'कोज्या'), col: '#FF7A1A', ct: '#1E293B', f: ['adj', 'hyp'] },
    tan: { n: T2('tangent', 'स्पर्शरेखा'), col: '#8B3DFF', ct: '#FFFFFF', f: ['opp', 'adj'] },
    cosec: { n: T2('cosecant', 'कोसेकेंट'), col: '#0F766E', ct: '#FFFFFF', f: ['hyp', 'opp'] },
    sec: { n: T2('secant', 'सेकेंट'), col: '#FF6B57', ct: '#1E293B', f: ['hyp', 'adj'] },
    cot: { n: T2('cotangent', 'कोटेंजेंट'), col: '#F5B90A', ct: '#1E293B', f: ['adj', 'opp'] },
  };
  const SIDE = {
    opp: { n: T2('opposite', 'सम्मुख भुजा'), s: T2('opposite', 'सम्मुख'), col: '#E11D48' },
    adj: { n: T2('adjacent', 'आसन्न भुजा'), s: T2('adjacent', 'आसन्न'), col: '#0891B2' },
    hyp: { n: T2('hypotenuse', 'कर्ण'), s: T2('hypotenuse', 'कर्ण'), col: '#4338CA' },
  };
  const ND = T2('not defined', 'परिभाषित नहीं');
  const TIP = {
    ratios: T2('Drag the top corner or use the slider. A ratio compares two sides, and it depends only on the angle.', 'ऊपर वाला कोना खींचो या स्लाइडर चलाओ। अनुपात दो भुजाओं की तुलना है और वह केवल कोण पर निर्भर करता है।'),
    'unit-circle': T2('Drag the point round the circle. Its height is sin θ and its sideways distance is cos θ.', 'बिंदु को वृत्त पर घुमाओ। उसकी ऊँचाई sin θ और क्षैतिज दूरी cos θ है।'),
    identities: T2('Switch on more ratios to unlock more identities. Both sides match at every angle.', 'और अनुपात चालू करो तो और सर्वसमिकाएँ खुलेंगी। हर कोण पर दोनों पक्ष बराबर रहते हैं।'),
    graphs: T2('Press play: the point on the circle draws the wave as it turns.', 'चलाओ दबाओ: वृत्त का बिंदु घूमते हुए तरंग बनाता है।'),
  };

  // ---------------------------------------------------------------- heights and distances
  // Hs: the heights the "next problem" button goes through. fn: the ratio that links the quantities.
  const SC = {
    tower: { name: T2('the tower', 'मीनार'), Hs: [30, 40, 50], amax: 75 },
    tree: { name: T2('the tree', 'पेड़'), Hs: [9, 12, 15], amax: 75 },
    kite: { name: T2('the kite', 'पतंग'), Hs: [20, 30, 40], amax: 75 },
    building: { name: T2('the building', 'इमारत'), Hs: [18, 27, 36], amax: 75 },
    river: { name: T2('the tree across the river', 'नदी के उस पार का पेड़'), Hs: [15, 20, 25], amax: 45 },
  };
  const AMIN = 25;
  const stationsFor = (scene) => (scene === 'river' ? [30, 45] : [30, 45, 60]);
  const fnOf = (scene, ask) => (scene === 'kite' && ask !== 'distance' ? 'sin' : 'tan');
  const startAngles = [null, 38, 56, 31, 47, 63];

  // ---------------------------------------------------------------- identities (checked numerically)
  const sq = (x) => (x == null ? null : x * x);
  const IDN = [
    { id: 'pyth', need: ['sin', 'cos'], name: T2('Pythagoras identity', 'पाइथागोरस सर्वसमिका'), eq: 'sin²θ + cos²θ = 1',
      calc: (v) => ({ ln: `${fmt(sq(v.sin), 4)} + ${fmt(sq(v.cos), 4)}`, lv: sq(v.sin) + sq(v.cos), rn: '1', rv: 1, lb: [[sq(v.sin), 'sin'], [sq(v.cos), 'cos']], rb: [[1, null]] }) },
    { id: 'tansec', need: ['tan', 'sec'], name: T2('Tan–sec identity', 'tan–sec सर्वसमिका'), eq: '1 + tan²θ = sec²θ',
      calc: (v) => (v.tan == null || v.sec == null ? null : { ln: `1 + ${fmt(sq(v.tan), 4)}`, lv: 1 + sq(v.tan), rn: fmt(sq(v.sec), 4), rv: sq(v.sec), lb: [[1, null], [sq(v.tan), 'tan']], rb: [[sq(v.sec), 'sec']] }) },
    { id: 'cotcsc', need: ['cot', 'cosec'], name: T2('Cot–cosec identity', 'cot–cosec सर्वसमिका'), eq: '1 + cot²θ = cosec²θ',
      calc: (v) => (v.cot == null || v.cosec == null ? null : { ln: `1 + ${fmt(sq(v.cot), 4)}`, lv: 1 + sq(v.cot), rn: fmt(sq(v.cosec), 4), rv: sq(v.cosec), lb: [[1, null], [sq(v.cot), 'cot']], rb: [[sq(v.cosec), 'cosec']] }) },
    { id: 'quot', need: ['sin', 'cos', 'tan'], name: T2('Quotient', 'भागफल संबंध'), eq: 'tan θ = sin θ / cos θ',
      calc: (v) => (v.tan == null ? null : { ln: fmt(v.tan, 4), lv: v.tan, rn: `${fmt(v.sin, 4)} ÷ ${fmt(v.cos, 4)}`, rv: v.sin / v.cos, lb: [[v.tan, 'tan']], rb: [[v.sin / v.cos, 'tan']] }) },
    { id: 'rcsc', need: ['sin', 'cosec'], name: T2('Reciprocal', 'व्युत्क्रम संबंध'), eq: 'cosec θ = 1 / sin θ',
      calc: (v) => (v.cosec == null ? null : { ln: fmt(v.cosec, 4), lv: v.cosec, rn: `1 ÷ ${fmt(v.sin, 4)}`, rv: 1 / v.sin, lb: [[v.cosec, 'cosec']], rb: [[1 / v.sin, 'cosec']] }) },
    { id: 'rsec', need: ['cos', 'sec'], name: T2('Reciprocal', 'व्युत्क्रम संबंध'), eq: 'sec θ = 1 / cos θ',
      calc: (v) => (v.sec == null ? null : { ln: fmt(v.sec, 4), lv: v.sec, rn: `1 ÷ ${fmt(v.cos, 4)}`, rv: 1 / v.cos, lb: [[v.sec, 'sec']], rb: [[1 / v.cos, 'sec']] }) },
    { id: 'rcot', need: ['tan', 'cot'], name: T2('Reciprocal', 'व्युत्क्रम संबंध'), eq: 'cot θ = 1 / tan θ',
      calc: (v) => (v.cot == null || v.tan == null ? null : { ln: fmt(v.cot, 4), lv: v.cot, rn: `1 ÷ ${fmt(v.tan, 4)}`, rv: 1 / v.tan, lb: [[v.cot, 'cot']], rb: [[1 / v.tan, 'cot']] }) },
    { id: 'csin', need: ['sin', 'cos'], name: T2('Complementary angles', 'पूरक कोण'), eq: 'sin(90° − θ) = cos θ',
      calc: (v, a) => ({ ln: fmt(val('sin', 90 - a), 4), lv: val('sin', 90 - a), rn: fmt(v.cos, 4), rv: v.cos, lb: [[val('sin', 90 - a), 'sin']], rb: [[v.cos, 'cos']] }) },
    { id: 'ccos', need: ['sin', 'cos'], name: T2('Complementary angles', 'पूरक कोण'), eq: 'cos(90° − θ) = sin θ',
      calc: (v, a) => ({ ln: fmt(val('cos', 90 - a), 4), lv: val('cos', 90 - a), rn: fmt(v.sin, 4), rv: v.sin, lb: [[val('cos', 90 - a), 'cos']], rb: [[v.sin, 'sin']] }) },
    { id: 'ctan', need: ['tan', 'cot'], name: T2('Complementary angles', 'पूरक कोण'), eq: 'tan(90° − θ) = cot θ',
      calc: (v, a) => { const l = val('tan', 90 - a); return l == null || v.cot == null ? null : { ln: fmt(l, 4), lv: l, rn: fmt(v.cot, 4), rv: v.cot, lb: [[l, 'tan']], rb: [[v.cot, 'cot']] }; } },
    { id: 'dbl', need: ['sin', 'cos'], name: T2('Double angle', 'द्विगुण कोण'), eq: 'sin 2θ = 2 sin θ cos θ',
      calc: (v, a) => ({ ln: fmt(val('sin', 2 * a), 4), lv: val('sin', 2 * a), rn: `2 × ${fmt(v.sin, 4)} × ${fmt(v.cos, 4)}`, rv: 2 * v.sin * v.cos, lb: [[val('sin', 2 * a), 'sin']], rb: [[2 * v.sin * v.cos, 'sin']] }) },
    { id: 'cdbl', need: ['sin', 'cos'], name: T2('Double angle', 'द्विगुण कोण'), eq: 'cos 2θ = cos²θ − sin²θ',
      calc: (v, a) => ({ ln: fmt(val('cos', 2 * a), 4), lv: val('cos', 2 * a), rn: `${fmt(sq(v.cos), 4)} − ${fmt(sq(v.sin), 4)}`, rv: sq(v.cos) - sq(v.sin), lb: [[val('cos', 2 * a), 'cos']], rb: [[sq(v.cos) - sq(v.sin), 'cos']] }) },
  ];

  // ---------------------------------------------------------------- CSS
  const CSS = `.tg { --tg-ink: #1E293B; display: grid; gap: 12px; }
.tg.tg-wide { grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); align-items: start; }
.tg-stage { border-radius: 18px; overflow: hidden; box-shadow: 0 6px 22px rgba(6,18,51,.14), inset 0 0 0 1px rgba(6,18,51,.06); background: #EAF1FC; }
.tg-svg { display: block; width: 100%; height: auto; user-select: none; -webkit-user-select: none; touch-action: pan-y; }
.tg-t { font-family: var(--font-body); font-weight: 700; fill: #1E293B; paint-order: stroke; stroke: rgba(255,255,255,.88); stroke-width: 4px; stroke-linejoin: round; }
.tg-td { font-family: var(--font-display); font-weight: 800; fill: #1E293B; paint-order: stroke; stroke: rgba(255,255,255,.9); stroke-width: 5px; stroke-linejoin: round; }
.tg-grab { cursor: grab; touch-action: none; outline: none; }
.tg-grab:active { cursor: grabbing; }
.tg-hit { cursor: ew-resize; touch-action: none; }
.tg-obs { cursor: grab; outline: none; touch-action: none; }
.tg-obs:focus-visible .tg-ring, .tg-grab:focus-visible .tg-ring { stroke: #8B3DFF; stroke-width: 4; stroke-dasharray: 7 5; opacity: 1; }
.tg-pulse { animation: tg-pulse 1.8s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes tg-pulse { 0%, 100% { opacity: .9; transform: scale(1); } 50% { opacity: .35; transform: scale(1.35); } }
.tg-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.tg-tip { margin: 0; color: var(--ink-2); font-size: .95rem; }
.tg-sl { display: block; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 8px 14px 4px; }
.tg-sl-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.tg-sl-t { font-weight: 700; color: var(--ink); }
.tg-sl-v { font: 800 1.2rem var(--font-display); color: var(--ink); }
.tg-range { -webkit-appearance: none; appearance: none; width: 100%; height: 44px; background: transparent; margin: 0; cursor: pointer; }
.tg-range::-webkit-slider-runnable-track { height: 10px; border-radius: 99px; background: linear-gradient(90deg, #02CFF9, #2563EB 50%, #8B3DFF); }
.tg-range::-moz-range-track { height: 10px; border-radius: 99px; background: linear-gradient(90deg, #02CFF9, #2563EB 50%, #8B3DFF); }
.tg-range::-webkit-slider-thumb { -webkit-appearance: none; width: 30px; height: 30px; margin-top: -10px; border-radius: 50%; background: #fff; border: 4px solid #1D4ED8; box-shadow: 0 2px 6px rgba(6,18,51,.35); }
.tg-range::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: #fff; border: 4px solid #1D4ED8; box-shadow: 0 2px 6px rgba(6,18,51,.35); }
.tg-range:focus-visible { outline: 3px solid #8B3DFF; outline-offset: 2px; border-radius: 10px; }
.tg-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.tg-lbl { font-size: .82rem; font-weight: 700; color: var(--ink-2); margin-right: 2px; }
.tg-chip { min-height: 44px; min-width: 44px; border-radius: 999px; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); font: 700 .95rem var(--font-body); padding: 0 14px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 7px; transition: transform .12s, box-shadow .12s, background .15s; }
.tg-chip:hover { transform: translateY(-1px); box-shadow: 0 3px 8px rgba(6,18,51,.14); }
.tg-chip:focus-visible, .tg-btn:focus-visible, .tg-in:focus-visible { outline: 3px solid #8B3DFF; outline-offset: 2px; }
.tg-chip.on, .tg-chip[aria-pressed="true"] { background: var(--c, #1D4ED8); border-color: var(--c, #1D4ED8); color: var(--ct, #fff); box-shadow: 0 2px 0 rgba(6,18,51,.2); }
.tg-chip i { width: 12px; height: 12px; border-radius: 50%; background: var(--c); border: 2px solid rgba(255,255,255,.75); flex: none; }
.tg-chip[aria-pressed="true"] i { background: var(--ct); border-color: var(--ct); opacity: .9; }
.tg-btn { min-height: 44px; border-radius: 12px; border: 0; padding: 0 16px; font: 800 1rem var(--font-body); cursor: pointer; color: #fff; background: linear-gradient(180deg, #3B6EEA, #1D4ED8); box-shadow: 0 2px 0 rgba(6,18,51,.25); display: inline-flex; align-items: center; gap: 8px; }
.tg-btn:active { transform: translateY(1px); }
.tg-btn.alt { background: linear-gradient(180deg, #FFE070, #FFD23F); color: #1E293B; }
.tg-btn.ok { background: linear-gradient(180deg, #34D399, #0F766E); }
.tg-btn[hidden] { display: none; }
.tg-in { min-height: 44px; width: 7.5em; border-radius: 12px; border: 2px solid var(--line); background: var(--surface); color: var(--ink); font: 700 1.1rem var(--font-body); padding: 0 12px; }
.tg-body { display: flex; flex-direction: column; gap: 8px; }
.tg-card { background: var(--surface); border: 1px solid var(--line); border-left: 6px solid var(--c, #1D4ED8); border-radius: 12px; padding: 8px 12px; }
.tg-card h4 { margin: 0 0 2px; font: 800 1rem var(--font-display); color: var(--ink); display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
.tg-card h4 small { font: 600 .82rem var(--font-body); color: var(--ink-2); }
.tg-num { font-size: .98rem; color: var(--ink); overflow-wrap: anywhere; }
.tg-num strong { font-family: var(--font-display); font-size: 1.1rem; }
.tg-num em { font-style: normal; color: var(--ink-2); font-weight: 700; }
.tg-side-chip { display: inline-block; border-radius: 8px; padding: 0 7px; font-weight: 700; font-size: .85rem; color: #fff; background: var(--c); }
.tg-note { margin: 0; font-size: .92rem; color: var(--ink-2); }
.tg-box { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px; color: var(--ink); }
.tg-box p { margin: 0; }
.tg-box p + p { margin-top: 4px; }
.tg-q { font-weight: 700; font-size: 1.02rem; }
.tg-facts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.tg-fact { border-radius: 10px; padding: 4px 10px; font-weight: 700; font-size: .92rem; background: var(--sunk); color: var(--ink); border: 1.5px solid var(--line); }
.tg-fact.find { border-style: dashed; border-color: #8B3DFF; }
.tg-fact b { font-family: var(--font-display); }
.tg-msg { border-radius: 12px; padding: 10px 14px; font-weight: 600; background: var(--sunk); color: var(--ink); }
.tg-msg.right { background: var(--good-t); border: 1.5px solid var(--good); }
.tg-msg.wrong { background: var(--bad-t); border: 1.5px solid var(--bad); }
.tg-msg code { font-family: var(--font-display); font-size: 1.02rem; }
.tg-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px; }
.tg-form label { font-weight: 700; color: var(--ink); }
.tg-heights .tg-table { max-width: 460px; }
.tg-table { width: 100%; border-collapse: collapse; font-size: .84rem; background: var(--surface); border-radius: 12px; overflow: hidden; border: 1px solid var(--line); }
.tg-table th, .tg-table td { padding: 5px 4px; text-align: center; border-bottom: 1px solid var(--line); color: var(--ink); }
.tg-table th { background: var(--sunk); font-weight: 700; }
.tg-table td.cur, .tg-table th.cur { background: var(--sun-t); font-weight: 800; }
.tg-table tr:last-child td { border-bottom: 0; }
.tg-table td:first-child { text-align: left; font-weight: 800; padding-left: 8px; white-space: nowrap; }
.tg-bars { display: grid; grid-template-columns: 2.6em 1fr; gap: 3px 6px; align-items: center; margin-top: 6px; font-size: .72rem; color: var(--ink-2); font-weight: 700; }
.tg-bar { display: flex; height: 12px; border-radius: 99px; overflow: hidden; background: var(--sunk); }
.tg-bar i { display: block; height: 100%; transition: width .3s; border-right: 2px solid rgba(255,255,255,.7); }
.tg-ok { color: var(--good); font-weight: 800; }
.tg-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) { .tg-pulse { animation: none; } .tg-chip, .tg-bar i { transition: none; } }`;

  // ---------------------------------------------------------------- the template
  function trig(root, cfg, api) {
    const mode = cfg.mode;
    const scene = mode === 'heights' ? cfg.scene || 'tower' : null;
    const ask = mode === 'heights' ? cfg.ask || 'height' : null;
    const uid = 'tg' + Math.random().toString(36).slice(2, 7);
    const tt = (x) => esc(api.t(x));
    const lang = () => (api.lang ? api.lang() : 'en');
    const range = mode === 'unit-circle' || mode === 'graphs' ? [0, 360] : mode === 'heights' ? [AMIN, scene ? SC[scene].amax : 75] : [0, 90];
    const defA = { ratios: 30, 'unit-circle': 30, identities: 30, graphs: 30, heights: 45 }[mode];
    const S = {
      a: cfg.angle != null ? cfg.angle : defA,
      on: { sin: true, cos: true, tan: true, cosec: false, sec: false, cot: false },
      narrow: false, playing: false,
      v: 0, wrong: 0, solved: false, msg: null, revealed: false, dDisp: null, flash: 0,
    };
    if (mode === 'graphs') S.on = { sin: true, cos: true, tan: false, cosec: false, sec: false, cot: false };
    if (mode === 'heights') S.on = { sin: false, cos: false, tan: false };
    if (mode === 'identities') S.on = { sin: true, cos: true, tan: true, cosec: false, sec: false, cot: false };
    const stations = mode === 'heights' && ask === 'angle' ? stationsFor(scene) : null;
    const snapA = (a) => {
      if (stations) return stations.reduce((b, s) => (Math.abs(s - a) < Math.abs(b - a) ? s : b), stations[0]);
      return clamp(Math.round(a), range[0], range[1]);
    };
    if (mode === 'heights') S.a = snapA(S.a);
    const A0 = S.a;
    const timers = [];
    let raf = 0, last = 0, stopGlide = null, ro = null, drag = false, lastLang = null;
    const ratiosOn = () => Object.keys(S.on).filter((k) => S.on[k]);

    // events and the live line ---------------------------------------------------------------
    let evTimer = 0, liveTimer = 0;
    const queueEmit = (evs) => {
      clearTimeout(evTimer);
      evTimer = setTimeout(() => evs.forEach((e) => api.emit(e)), 200);
    };
    function liveSay(text) {
      const el = root.querySelector('.tg-live');
      clearTimeout(liveTimer);
      liveTimer = setTimeout(() => { if (el) el.textContent = text; }, 450);
    }
    const angleWord = () => api.t(T2('Angle', 'कोण')) + ' ' + Math.round(S.a) + '°';

    // static skeleton ---------------------------------------------------------------------------
    const chipsFor = mode === 'unit-circle' || mode === 'graphs' ? [0, 30, 45, 60, 90, 180, 270, 360] : STD;
    const togList = mode === 'heights' ? ['sin', 'cos', 'tan'] : RATIOS;
    function build() {
      lastLang = lang();
      const stage = `<div class="tg-stage"><svg class="tg-svg" role="group" aria-label="${tt(modeLabel())}" viewBox="0 0 480 340"></svg></div>`;
      const slider = mode === 'heights' && ask === 'angle' ? '' : `<label class="tg-sl"><span class="tg-sl-top"><span class="tg-sl-t">${tt(mode === 'heights' ? T2('Move the observer: angle of elevation', 'प्रेक्षक को चलाओ: उन्नयन कोण') : T2('Angle θ', 'कोण θ'))}</span><output class="tg-sl-v"></output></span>
          <input class="tg-range" type="range" min="${range[0]}" max="${range[1]}" step="1" value="${S.a}" data-key="slider:angle" aria-label="${tt(mode === 'heights' ? T2('Angle of elevation in degrees', 'उन्नयन कोण, अंशों में') : T2('Angle in degrees', 'कोण, अंशों में'))}"></label>`;
      const chips = mode === 'heights' ? '' : `<div class="tg-row" role="group" aria-label="${tt(T2('Standard angles', 'मानक कोण'))}"><span class="tg-lbl">${tt(T2('Jump to', 'सीधे जाओ'))}</span>${chipsFor.map((a) => `<button type="button" class="tg-chip" data-a="${a}">${a}°</button>`).join('')}</div>`;
      const togs = `<div class="tg-row" role="group" aria-label="${tt(mode === 'heights' ? T2('Show the triangle ratios', 'त्रिभुज के अनुपात दिखाओ') : T2('Show or hide ratios', 'अनुपात दिखाओ या छिपाओ'))}"><span class="tg-lbl">${tt(mode === 'heights' ? T2('Ratio help', 'अनुपात की मदद') : T2('Ratios', 'अनुपात'))}</span>${togList.map((r) => `<button type="button" class="tg-chip" style="--c:${RN[r].col};--ct:${RN[r].ct}" data-key="toggle:${r}" aria-pressed="${!!S.on[r]}" aria-label="${esc(api.t(RN[r].n))}"><i></i>${r} θ</button>`).join('')}</div>`;
      const play = (mode === 'unit-circle' || mode === 'graphs') && !L.reducedMotion() ? `<div class="tg-row"><button type="button" class="tg-btn alt" data-key="play" aria-pressed="false"><span class="tg-play-i">▶</span><span class="tg-play-t">${tt(T2('Play', 'चलाओ'))}</span></button></div>` : '';
      const steps = mode === 'heights' ? `<div class="tg-row"><button type="button" class="tg-btn alt" data-step="1">◀ ${tt(T2('Step closer', 'पास जाओ'))}</button><button type="button" class="tg-btn alt" data-step="-1">${tt(T2('Step back', 'पीछे हटो'))} ▶</button></div>` : '';
      const form = mode === 'heights' ? `<form class="tg-form" data-key="answer" novalidate>
          <label for="${uid}-in">${tt(ask === 'angle' ? T2('Angle (degrees)', 'कोण (अंश)') : T2('Your answer (metres)', 'तुम्हारा उत्तर (मीटर)'))}</label>
          <input id="${uid}-in" class="tg-in" type="text" inputmode="decimal" autocomplete="off" size="6">
          <button type="submit" class="tg-btn ok">${tt(T2('Check', 'जाँचो'))}</button>
          <button type="button" class="tg-btn alt tg-next" data-key="next" hidden>${tt(T2('Next problem', 'अगला सवाल'))}</button>
        </form>` : '';
      root.innerHTML = `<div class="tg tg-${mode}">${stage}<div class="tg-side">
          <p class="tg-tip"></p>
          ${mode === 'heights' ? '<div class="tg-body tg-main"></div>' : ''}
          ${slider}${steps}${chips}${togs}${play}${form}
          ${mode === 'heights' ? '' : '<div class="tg-body tg-main"></div>'}
          <div class="tg-live tg-sr" aria-live="polite"></div>
        </div></div>`;
    }
    function modeLabel() {
      return {
        ratios: T2('Right triangle with its sides and ratios', 'भुजाओं और अनुपातों वाला समकोण त्रिभुज'),
        'unit-circle': T2('Unit circle', 'इकाई वृत्त'),
        identities: T2('Right triangle for the identities', 'सर्वसमिकाओं के लिए समकोण त्रिभुज'),
        graphs: T2('Unit circle and the graphs of the ratios', 'इकाई वृत्त और अनुपातों के आलेख'),
        heights: T2('Clinometer scene: heights and distances', 'नतिमापी का दृश्य: ऊँचाई और दूरी'),
      }[mode];
    }
    build();
    const svg = () => root.querySelector('.tg-svg');
    const q = (s) => root.querySelector(s);

    // ---------------------------------------------------------------- drawing: right triangle (ratios, identities)
    function triSVG(sym) {
      const a = S.a, r = rad(a), s = snapZ(Math.sin(r)), c = snapZ(Math.cos(r));
      const Ax = 100, Ay = 286, Ls = 236;
      const Cx = Ax + Ls * c, By = Ay - Ls * s;
      const act = sym ? [] : ratiosOn();
      const used = new Set(act.flatMap((k) => RN[k].f));
      const op = (k) => (!used.size || used.has(k) ? 1 : 0.28);
      const vv = { opp: 10 * s, adj: 10 * c, hyp: 10 };
      const sl = (k, p) => (sym ? p : fmt(vv[k], 2));
      const nx = -s, ny = -c;
      const mx = (Ax + Cx) / 2, my = (Ay + By) / 2;
      const hx = mx + nx * 26, hy = my + ny * 26;
      const oppSym = sym ? `sin θ = ${fmt(s, 3)}` : '', adjSym = sym ? `cos θ = ${fmt(c, 3)}` : '';
      const lab = (x, y, name, v, anchor) => `<text class="tg-t" x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="17" text-anchor="${anchor}">${esc(api.t(name))}</text><text class="tg-td" x="${x.toFixed(1)}" y="${(y + 20).toFixed(1)}" font-size="17" text-anchor="${anchor}">${esc(v)}</text>`;
      const arcA = a > 1 ? `<path d="M${Ax + 50} ${Ay}A50 50 0 0 0 ${(Ax + 50 * c).toFixed(1)} ${(Ay - 50 * s).toFixed(1)}" fill="rgba(255,210,63,.55)" stroke="#F5B90A" stroke-width="3"/><path d="M${Ax} ${Ay}L${Ax + 50} ${Ay}A50 50 0 0 0 ${(Ax + 50 * c).toFixed(1)} ${(Ay - 50 * s).toFixed(1)}Z" fill="rgba(255,210,63,.45)"/>` : '';
      const mid = rad(a / 2);
      const arcB = a < 82 && a > 0 ? `<path d="M${Cx.toFixed(1)} ${(By + 34).toFixed(1)}A34 34 0 0 1 ${(Cx - 34 * c).toFixed(1)} ${(By + 34 * s).toFixed(1)}" fill="none" stroke="#8B3DFF" stroke-width="3"/>` : '';
      const bis = normalize(-c, s + 1);
      const rightSq = c > 0.12 && s > 0.12 ? `<path d="M${(Cx - 14).toFixed(1)} ${Ay}v-14h14" fill="none" stroke="#1E293B" stroke-width="2.5"/>` : '';
      return `<defs>
          <linearGradient id="${uid}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F4F8FF"/><stop offset="1" stop-color="#D6E6FB"/></linearGradient>
          <linearGradient id="${uid}-tri" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".95"/><stop offset="1" stop-color="#BFD7FA" stop-opacity=".85"/></linearGradient>
          <pattern id="${uid}-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#C5D6EE" stroke-width="1"/></pattern>
        </defs>
        <rect width="480" height="340" fill="url(#${uid}-sky)"/><rect width="480" height="340" fill="url(#${uid}-grid)" opacity=".7"/>
        <line x1="20" y1="${Ay}" x2="460" y2="${Ay}" stroke="#8FA6C8" stroke-width="2"/>
        <polygon points="${Ax},${Ay} ${Cx.toFixed(1)},${Ay} ${Cx.toFixed(1)},${By.toFixed(1)}" fill="url(#${uid}-tri)"/>
        ${arcA}${arcB}
        <line x1="${Cx.toFixed(1)}" y1="${Ay}" x2="${Cx.toFixed(1)}" y2="${By.toFixed(1)}" stroke="${SIDE.opp.col}" stroke-width="7" stroke-linecap="round" opacity="${op('opp')}"/>
        <line x1="${Ax}" y1="${Ay}" x2="${Cx.toFixed(1)}" y2="${Ay}" stroke="${SIDE.adj.col}" stroke-width="7" stroke-linecap="round" opacity="${op('adj')}"/>
        <line x1="${Ax}" y1="${Ay}" x2="${Cx.toFixed(1)}" y2="${By.toFixed(1)}" stroke="${SIDE.hyp.col}" stroke-width="7" stroke-linecap="round" opacity="${op('hyp')}"/>
        ${rightSq}
        ${a > 1 ? `<text class="tg-td" font-size="20" x="${(Ax + 78 * Math.cos(mid)).toFixed(1)}" y="${(Ay - 78 * Math.sin(mid) + 6).toFixed(1)}" text-anchor="middle">θ</text>` : ''}
        ${a < 82 && a > 0 ? `<text class="tg-t" font-size="14" x="${(Cx + 66 * bis[0]).toFixed(1)}" y="${(By + 66 * bis[1] + 4).toFixed(1)}" text-anchor="middle" fill="#6D28D9">${sym ? '90°−θ' : esc(fmt(90 - a, 0)) + '°'}</text>` : ''}
        ${lab(Cx + 14, (Ay + By) / 2 - 4, sym ? T2('opposite', 'सम्मुख') : SIDE.opp.s, sym ? oppSym : sl('opp'), 'start')}
        ${lab(mx, Ay + 26, sym ? T2('adjacent', 'आसन्न') : SIDE.adj.s, sym ? adjSym : sl('adj'), 'middle')}
        ${lab(hx - (nx < -0.4 ? 4 : 0), hy - 6, SIDE.hyp.s, sym ? '1' : sl('hyp'), nx < -0.4 ? 'end' : 'middle')}
        <text class="tg-td" font-size="17" x="${Ax - 8}" y="${Ay + 22}" text-anchor="end">A</text>
        <g class="tg-grab" data-handle="tri" role="presentation" style="touch-action:none"><circle class="tg-pulse" cx="${Cx.toFixed(1)}" cy="${By.toFixed(1)}" r="16" fill="#FFD23F" opacity=".5"/><circle cx="${Cx.toFixed(1)}" cy="${By.toFixed(1)}" r="11" fill="#FFD23F" stroke="#1E293B" stroke-width="3"/><circle cx="${Cx.toFixed(1)}" cy="${By.toFixed(1)}" r="32" fill="transparent"/></g>`;
    }
    function normalize(x, y) { const n = Math.hypot(x, y) || 1; return [x / n, y / n]; }

    // ---------------------------------------------------------------- drawing: unit circle
    const CX = 240, CY = 218, R = 124;
    function clipEnd(x0, y0, x1, y1) {
      const lo = [14, 14], hi = [466, 428];
      let t = 1;
      const dx = x1 - x0, dy = y1 - y0;
      if (dx > 0 && x0 + dx * t > hi[0]) t = Math.min(t, (hi[0] - x0) / dx);
      if (dx < 0 && x0 + dx * t < lo[0]) t = Math.min(t, (lo[0] - x0) / dx);
      if (dy > 0 && y0 + dy * t > hi[1]) t = Math.min(t, (hi[1] - y0) / dy);
      if (dy < 0 && y0 + dy * t < lo[1]) t = Math.min(t, (lo[1] - y0) / dy);
      return { x: x0 + dx * t, y: y0 + dy * t, clipped: t < 1 };
    }
    function seg(x0, y0, x1, y1, col, w, extra) {
      const e = clipEnd(x0, y0, x1, y1);
      let arrow = '';
      if (e.clipped) { const ang = Math.atan2(e.y - y0, e.x - x0); const ax = e.x, ay = e.y; arrow = `<polygon points="${ax},${ay} ${(ax - 12 * Math.cos(ang - 0.45)).toFixed(1)},${(ay - 12 * Math.sin(ang - 0.45)).toFixed(1)} ${(ax - 12 * Math.cos(ang + 0.45)).toFixed(1)},${(ay - 12 * Math.sin(ang + 0.45)).toFixed(1)}" fill="${col}"/>`; }
      return `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${e.x.toFixed(1)}" y2="${e.y.toFixed(1)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" ${extra || ''}/>${arrow}`;
    }
    function unitSVG() {
      const a = S.a, v = vals(a), c = v.cos, s = v.sin;
      const X = (u) => CX + R * u, Y = (u) => CY - R * u;
      const Px = X(c), Py = Y(s);
      const on = S.on;
      const arc = a >= 359.9 ? `<circle cx="${CX}" cy="${CY}" r="30" fill="rgba(255,210,63,.4)" stroke="#F5B90A" stroke-width="3"/>`
        : a > 0.5 ? `<path d="M${CX} ${CY}L${CX + 30} ${CY}A30 30 0 ${a > 180 ? 1 : 0} 0 ${(CX + 30 * c).toFixed(1)} ${(CY - 30 * s).toFixed(1)}Z" fill="rgba(255,210,63,.45)" stroke="#F5B90A" stroke-width="3"/>` : '';
      let body = '';
      if (on.tan || on.sec) body += `<line x1="${X(1)}" y1="14" x2="${X(1)}" y2="428" stroke="#8B3DFF" stroke-width="1.5" stroke-dasharray="5 5" opacity=".45"/>`;
      if (on.cot || on.cosec) body += `<line x1="14" y1="${Y(1)}" x2="466" y2="${Y(1)}" stroke="#F5B90A" stroke-width="1.5" stroke-dasharray="5 5" opacity=".7"/>`;
      if (on.tan || on.sec || on.cot || on.cosec) body += seg(CX, CY, X(c * 6), Y(s * 6), '#94A3B8', 1.5, 'stroke-dasharray="4 4"');
      if (on.cosec && v.cosec != null) body += seg(CX, CY, X(v.cot), Y(1), RN.cosec.col, 5) + (v.cosec ? '' : '');
      if (on.sec && v.sec != null) body += seg(CX, CY, X(1), Y(v.tan), RN.sec.col, 5);
      if (on.cot && v.cot != null) body += seg(X(0), Y(1), X(v.cot), Y(1), RN.cot.col, 6);
      if (on.tan && v.tan != null) body += seg(X(1), Y(0), X(1), Y(v.tan), RN.tan.col, 6);
      if (on.cos) body += `<line x1="${CX}" y1="${CY}" x2="${Px.toFixed(1)}" y2="${CY}" stroke="${RN.cos.col}" stroke-width="7" stroke-linecap="round"/>`;
      if (on.sin) body += `<line x1="${Px.toFixed(1)}" y1="${CY}" x2="${Px.toFixed(1)}" y2="${Py.toFixed(1)}" stroke="${RN.sin.col}" stroke-width="7" stroke-linecap="round"/>`;
      let labels = '';
      const L1 = (x, y, txt, anchor) => `<text class="tg-t" font-size="15" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor || 'middle'}">${txt}</text>`;
      if (on.sin && Math.abs(s) > 0.12) labels += L1(Px + (c >= 0 ? 10 : -10), (CY + Py) / 2 + 5, 'sin θ', c >= 0 ? 'start' : 'end');
      if (on.cos && Math.abs(c) > 0.2) labels += L1((CX + Px) / 2, CY + (s >= 0 ? 20 : -10), 'cos θ');
      if (on.tan && v.tan != null && Math.abs(v.tan) > 0.15) labels += L1(X(1) + 8, Math.max(24, Math.min(420, (Y(0) + Y(v.tan)) / 2)) + 5, 'tan θ', 'start');
      if (on.cot && v.cot != null && Math.abs(v.cot) > 0.2) labels += L1(Math.max(20, Math.min(460, (X(0) + X(v.cot)) / 2)), Y(1) - 9, 'cot θ');
      if (on.sec && v.sec != null && Math.abs(v.sec) > 1.15) labels += L1((CX + X(1)) / 2 + 4, Math.max(24, Math.min(420, (CY + Y(v.tan)) / 2)) - 10, 'sec θ', 'start');
      if (on.cosec && v.cosec != null && Math.abs(v.cosec) > 1.15) labels += L1(Math.max(20, Math.min(460, (CX + X(v.cot)) / 2)) + 6, (CY + Y(1)) / 2 + 22, 'cosec θ', 'start');
      const mid = rad(a / 2);
      const ql = (x, y, t) => `<text class="tg-t" font-size="14" x="${x}" y="${y}" text-anchor="middle" fill="#64748B" style="fill:#64748B">${t}</text>`;
      const curQ = quadrant(a);
      return `<defs><radialGradient id="${uid}-disc" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#CFE0F8"/></radialGradient>
          <linearGradient id="${uid}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F4F8FF"/><stop offset="1" stop-color="#DCE8FA"/></linearGradient></defs>
        <rect width="480" height="440" fill="url(#${uid}-bg)"/>
        ${[1, 2, 3, 4].map((n) => `<rect x="${n === 1 || n === 4 ? CX : 0}" y="${n === 1 || n === 2 ? 0 : CY}" width="240" height="${n === 1 || n === 2 ? CY : 222}" fill="#FFD23F" opacity="${curQ === n ? 0.16 : 0}"/>`).join('')}
        <circle cx="${CX}" cy="${CY}" r="${R}" fill="url(#${uid}-disc)" stroke="#1D4ED8" stroke-width="3"/>
        <line x1="10" y1="${CY}" x2="470" y2="${CY}" stroke="#475569" stroke-width="2"/><line x1="${CX}" y1="8" x2="${CX}" y2="432" stroke="#475569" stroke-width="2"/>
        ${[-1, 1].map((u) => `<line x1="${X(u)}" y1="${CY - 5}" x2="${X(u)}" y2="${CY + 5}" stroke="#475569" stroke-width="2"/><line x1="${CX - 5}" y1="${Y(u)}" x2="${CX + 5}" y2="${Y(u)}" stroke="#475569" stroke-width="2"/>`).join('')}
        ${ql(X(1) + 12, CY + 20, '1')}${ql(X(-1) - 14, CY + 20, '−1')}${ql(CX + 16, Y(1) - 6, '1')}${ql(CX + 20, Y(-1) + 18, '−1')}
        ${ql(432, 30, '<tspan font-weight="800">I</tspan>')}${ql(48, 30, '<tspan font-weight="800">II</tspan>')}${ql(48, 420, '<tspan font-weight="800">III</tspan>')}${ql(432, 420, '<tspan font-weight="800">IV</tspan>')}
        ${arc}
        ${body}
        <line x1="${CX}" y1="${CY}" x2="${Px.toFixed(1)}" y2="${Py.toFixed(1)}" stroke="#061233" stroke-width="3.5" stroke-linecap="round"/>
        ${a > 0.5 ? `<text class="tg-td" font-size="17" x="${(CX + 52 * Math.cos(mid)).toFixed(1)}" y="${(CY - 52 * Math.sin(mid) + 6).toFixed(1)}" text-anchor="middle">θ</text>` : ''}
        ${labels}
        <g class="tg-grab" data-handle="circle" style="touch-action:none"><circle class="tg-pulse" cx="${Px.toFixed(1)}" cy="${Py.toFixed(1)}" r="17" fill="#FFD23F" opacity=".5"/><circle cx="${Px.toFixed(1)}" cy="${Py.toFixed(1)}" r="11" fill="#FFD23F" stroke="#061233" stroke-width="3.5"/><circle cx="${Px.toFixed(1)}" cy="${Py.toFixed(1)}" r="32" fill="transparent"/></g>
        <text class="tg-td" font-size="16" x="${Px + (c >= 0 ? 16 : -16)}" y="${Py + (s >= 0 ? -14 : 24)}" text-anchor="${c >= 0 ? 'start' : 'end'}">P</text>`;
    }

    // ---------------------------------------------------------------- drawing: graphs
    function graphGeo() {
      return S.narrow
        ? { VW: 420, VH: 600, cx: 112, cy: 112, R: 78, x0: 44, w: 346, yc: 410, u: 56, stack: true }
        : { VW: 840, VH: 414, cx: 118, cy: 198, R: 82, x0: 290, w: 510, yc: 198, u: 82, stack: false };
    }
    function curvePath(name, G, from, to) {
      const CAP = 2.25;
      let d = '', pen = false, prev = null;
      for (let t = from; t <= to + 1e-9; t += 1) {
        const y = val(name, t);
        const ok = y != null && Math.abs(y) <= CAP && !(prev != null && Math.abs(y - prev) > 1.6);
        if (!ok) { pen = false; prev = y != null ? y : null; continue; }
        const px = G.x0 + (G.w * t) / 360, py = G.yc - G.u * y;
        d += `${pen ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`;
        pen = true; prev = y;
      }
      return d;
    }
    function graphSVG() {
      const G = graphGeo();
      const a = S.a, v = vals(a);
      const X = (t) => G.x0 + (G.w * t) / 360, Y = (y) => G.yc - G.u * y;
      const act = RATIOS.filter((k) => S.on[k]);
      const cu = (u) => G.cx + G.R * u, cv = (u) => G.cy - G.R * u;
      const Px = cu(v.cos), Py = cv(v.sin);
      let grid = '';
      for (let t = 0; t <= 360; t += 90) grid += `<line x1="${X(t)}" y1="${Y(2.25)}" x2="${X(t)}" y2="${Y(-2.25)}" stroke="#B9CBE6" stroke-width="1.5"/><text class="tg-t" font-size="${G.stack ? 14 : 15}" x="${X(t)}" y="${Y(-2.25) + 20}" text-anchor="middle">${t}°</text>`;
      for (const y of [-2, -1, 1, 2]) grid += `<line x1="${G.x0}" y1="${Y(y)}" x2="${G.x0 + G.w}" y2="${Y(y)}" stroke="#B9CBE6" stroke-width="1" ${Math.abs(y) === 1 ? '' : 'stroke-dasharray="3 5"'}/><text class="tg-t" font-size="14" x="${G.x0 - 7}" y="${Y(y) + 5}" text-anchor="end">${fmt(y, 0)}</text>`;
      let asym = '';
      const A90 = act.some((k) => k === 'tan' || k === 'sec'), A0s = act.some((k) => k === 'cot' || k === 'cosec');
      if (A90) for (const t of [90, 270]) asym += `<line x1="${X(t)}" y1="${Y(2.25)}" x2="${X(t)}" y2="${Y(-2.25)}" stroke="#64748B" stroke-width="1.5" stroke-dasharray="6 5"/>`;
      if (A0s) for (const t of [0, 180, 360]) asym += `<line x1="${X(t)}" y1="${Y(2.25)}" x2="${X(t)}" y2="${Y(-2.25)}" stroke="#64748B" stroke-width="1.5" stroke-dasharray="6 5"/>`;
      let curves = '', marks = '';
      for (const k of act) {
        const col = RN[k].col;
        curves += `<path d="${curvePath(k, G, 0, 360)}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" opacity=".28"/>`;
        curves += `<path d="${curvePath(k, G, 0, a)}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round"/>`;
        const y = v[k];
        if (y != null && Math.abs(y) <= 2.25) {
          marks += `<line x1="${X(a)}" y1="${Y(0)}" x2="${X(a)}" y2="${Y(y)}" stroke="${col}" stroke-width="2" stroke-dasharray="4 4"/><circle cx="${X(a)}" cy="${Y(y)}" r="8" fill="${col}" stroke="#fff" stroke-width="3"/>`;
        }
      }
      if (!G.stack && S.on.sin) marks = `<line x1="${Px}" y1="${Py}" x2="${X(a)}" y2="${Y(v.sin)}" stroke="${RN.sin.col}" stroke-width="2" stroke-dasharray="4 4"/>` + marks;
      if (!G.stack && !S.on.sin && S.on.cos) marks = `<line x1="${Px}" y1="${Py}" x2="${Px}" y2="${Py}" stroke="none"/>` + marks;
      const disc = `<circle cx="${G.cx}" cy="${G.cy}" r="${G.R}" fill="url(#${uid}-disc)" stroke="#1D4ED8" stroke-width="3"/>
        <line x1="${G.cx - G.R - 12}" y1="${G.cy}" x2="${G.cx + G.R + 12}" y2="${G.cy}" stroke="#475569" stroke-width="1.5"/><line x1="${G.cx}" y1="${G.cy - G.R - 12}" x2="${G.cx}" y2="${G.cy + G.R + 12}" stroke="#475569" stroke-width="1.5"/>
        ${S.on.cos ? `<line x1="${G.cx}" y1="${G.cy}" x2="${Px.toFixed(1)}" y2="${G.cy}" stroke="${RN.cos.col}" stroke-width="5" stroke-linecap="round"/>` : ''}
        ${S.on.sin ? `<line x1="${Px.toFixed(1)}" y1="${G.cy}" x2="${Px.toFixed(1)}" y2="${Py.toFixed(1)}" stroke="${RN.sin.col}" stroke-width="5" stroke-linecap="round"/>` : ''}
        <line x1="${G.cx}" y1="${G.cy}" x2="${Px.toFixed(1)}" y2="${Py.toFixed(1)}" stroke="#061233" stroke-width="3" stroke-linecap="round"/>
        <g class="tg-grab" data-handle="graphcircle" style="touch-action:none"><circle class="tg-pulse" cx="${Px.toFixed(1)}" cy="${Py.toFixed(1)}" r="14" fill="#FFD23F" opacity=".5"/><circle cx="${Px.toFixed(1)}" cy="${Py.toFixed(1)}" r="9" fill="#FFD23F" stroke="#061233" stroke-width="3"/><circle cx="${Px.toFixed(1)}" cy="${Py.toFixed(1)}" r="28" fill="transparent"/></g>`;
      return `<defs><radialGradient id="${uid}-disc" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#CFE0F8"/></radialGradient>
          <linearGradient id="${uid}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F4F8FF"/><stop offset="1" stop-color="#DCE8FA"/></linearGradient></defs>
        <rect width="${G.VW}" height="${G.VH}" fill="url(#${uid}-bg)"/>
        ${grid}
        <line x1="${G.x0}" y1="${Y(0)}" x2="${G.x0 + G.w + 6}" y2="${Y(0)}" stroke="#334155" stroke-width="2.5"/><line x1="${G.x0}" y1="${Y(2.4)}" x2="${G.x0}" y2="${Y(-2.4)}" stroke="#334155" stroke-width="2.5"/>
        ${asym}${curves}${marks}${disc}
        <text class="tg-td" font-size="15" x="${G.x0 + G.w}" y="${Y(0) - 8}" text-anchor="end">θ</text>`;
    }

    // ---------------------------------------------------------------- heights: the geometry
    function hGeo() {
      const sc = SC[scene], H = sc.Hs[S.v];
      const VW = S.narrow ? 520 : 800, VH = S.narrow ? 440 : 400;
      const gy = VH - 78, baseX = VW - (S.narrow ? 140 : 150);
      const dmax = H / Math.tan(rad(AMIN));
      const s = Math.min((baseX - 38) / dmax, (gy - 62) / H);
      const A = S.a;
      const dTrue = H / Math.tan(rad(A));
      const dd = S.dDisp == null ? dTrue : S.dDisp;
      return { H, VW, VH, gy, baseX, s, A, dTrue, dd, hp: H * s, obsX: baseX - dd * s, Ls: H / Math.sin(rad(A)), sc, ow: H * s * ({ tower: 0.12, tree: 0.33, river: 0.33, building: 0.25 }[scene] || 0) + (scene === 'kite' ? 24 : 0) };
    }
    function drawObject(g) {
      const { baseX: bx, gy, hp } = g;
      const top = gy - hp;
      if (scene === 'tower') {
        const w0 = hp * 0.2, w1 = hp * 0.115, dome = hp * 0.12;
        let s = `<ellipse cx="${bx}" cy="${gy + 2}" rx="${w0 * 0.9}" ry="5" fill="rgba(0,0,0,.18)"/>
          <polygon points="${bx - w0 / 2},${gy} ${bx + w0 / 2},${gy} ${bx + w1 / 2},${top + dome} ${bx - w1 / 2},${top + dome}" fill="url(#${uid}-stone)" stroke="#8C3F22" stroke-width="2"/>`;
        for (let i = 1; i <= 4; i++) {
          const y = gy - (hp - dome) * (i / 5), w = lerp(w0, w1, i / 5);
          s += `<rect x="${bx - w / 2 - 2}" y="${y - 3}" width="${w + 4}" height="6" rx="2" fill="#F6E3C3" stroke="#8C3F22" stroke-width="1"/>`;
        }
        for (let i = 0; i < 4; i++) { const y = gy - (hp - dome) * ((i + 0.55) / 5), w = lerp(w0, w1, (i + 0.55) / 5); s += `<rect x="${bx - 3}" y="${y - 7}" width="6" height="14" rx="3" fill="#5B2A17" opacity=".75"/><rect x="${bx - w * 0.3}" y="${y - 3}" width="3" height="8" rx="1.5" fill="#5B2A17" opacity=".4"/><rect x="${bx + w * 0.3 - 3}" y="${y - 3}" width="3" height="8" rx="1.5" fill="#5B2A17" opacity=".4"/>`; }
        s += `<path d="M${bx - w1 * 0.62} ${top + dome}Q${bx - w1 * 0.5} ${top + dome * 0.15} ${bx} ${top}Q${bx + w1 * 0.5} ${top + dome * 0.15} ${bx + w1 * 0.62} ${top + dome}Z" fill="#F4C26B" stroke="#8C3F22" stroke-width="2"/>`;
        return s;
      }
      if (scene === 'tree' || scene === 'river') {
        const r0 = hp * 0.2, tw = hp * 0.07;
        const lobes = [[0, r0, r0], [-0.2 * hp, 0.4 * hp, 0.2 * hp], [0.2 * hp, 0.4 * hp, 0.2 * hp], [0, 0.46 * hp, 0.23 * hp], [-0.1 * hp, 0.24 * hp, 0.18 * hp], [0.11 * hp, 0.25 * hp, 0.18 * hp]];
        return `<ellipse cx="${bx}" cy="${gy + 2}" rx="${hp * 0.24}" ry="5" fill="rgba(0,0,0,.18)"/>
          <path d="M${bx - tw} ${gy}L${bx - tw * 0.6} ${top + hp * 0.5}L${bx + tw * 0.6} ${top + hp * 0.5}L${bx + tw} ${gy}Z" fill="#7A4A26" stroke="#4E2D14" stroke-width="2"/>
          ${lobes.map(([dx, dy, rr], i) => `<circle cx="${bx + dx}" cy="${top + dy}" r="${rr}" fill="${['#2E9E4B', '#3FB65B', '#2A8F43', '#35AA52', '#4CC46A', '#48BD66'][i]}" stroke="#1E6B33" stroke-width="2"/>`).join('')}`;
      }
      if (scene === 'building') {
        const bw = hp * 0.46, floors = Math.round(g.H / 3), fh = hp / floors;
        let s = `<ellipse cx="${bx}" cy="${gy + 2}" rx="${bw * 0.6}" ry="5" fill="rgba(0,0,0,.18)"/><rect x="${bx - bw / 2}" y="${top}" width="${bw}" height="${hp}" fill="url(#${uid}-wall)" stroke="#44546E" stroke-width="2"/><rect x="${bx - bw / 2 - 4}" y="${top - 5}" width="${bw + 8}" height="9" rx="3" fill="#44546E"/>`;
        for (let f = 0; f < floors - 1; f++) for (let c = 0; c < 3; c++) s += `<rect x="${bx - bw / 2 + bw * (0.12 + c * 0.3)}" y="${top + fh * f + fh * 0.2}" width="${bw * 0.2}" height="${fh * 0.5}" rx="2" fill="${(f + c) % 4 === 0 ? '#FFD23F' : '#8FD3F4'}" stroke="#44546E" stroke-width="1"/>`;
        s += `<rect x="${bx - bw * 0.1}" y="${gy - fh * 0.8}" width="${bw * 0.2}" height="${fh * 0.8}" rx="3" fill="#7A4A26" stroke="#44546E" stroke-width="1.5"/>`;
        return s;
      }
      // kite: the thing flies at the top; its foot is marked on the ground
      const kx = bx, ky = top;
      return `<line x1="${bx}" y1="${top}" x2="${bx}" y2="${gy}" stroke="#64748B" stroke-width="1.5" stroke-dasharray="5 5"/><circle cx="${bx}" cy="${gy}" r="5" fill="#64748B"/>
        <path d="M${kx} ${ky + 14}c-14 26 14 38 0 66" fill="none" stroke="#FF6B57" stroke-width="2.5"/>
        ${[28, 48, 66].map((o, i) => `<path d="M${kx - 6} ${ky + o}l6 4l6 -4l-6 -4z" fill="${['#FFD23F', '#8B3DFF', '#02CFF9'][i]}"/>`).join('')}
        <polygon points="${kx},${ky - 26} ${kx + 19},${ky - 3} ${kx},${ky + 16} ${kx - 19},${ky - 3}" fill="#FF7A1A" stroke="#7C2D12" stroke-width="2"/>
        <polygon points="${kx},${ky - 26} ${kx + 19},${ky - 3} ${kx},${ky - 3}" fill="#FFD23F"/><polygon points="${kx},${ky + 16} ${kx - 19},${ky - 3} ${kx},${ky - 3}" fill="#8B3DFF"/>
        <line x1="${kx}" y1="${ky - 26}" x2="${kx}" y2="${ky + 16}" stroke="#7C2D12" stroke-width="1.5"/><line x1="${kx - 19}" y1="${ky - 3}" x2="${kx + 19}" y2="${ky - 3}" stroke="#7C2D12" stroke-width="1.5"/>`;
    }
    function child(x, gy) {
      return `<g transform="translate(${x - 34} ${gy})">
        <ellipse cx="0" cy="1" rx="14" ry="3.5" fill="rgba(0,0,0,.2)"/>
        <rect x="-8" y="-17" width="6" height="17" rx="3" fill="#1D4ED8"/><rect x="2" y="-17" width="6" height="17" rx="3" fill="#1D4ED8"/>
        <rect x="-10" y="-36" width="20" height="22" rx="8" fill="#FF7A1A"/><rect x="-14" y="-33" width="6" height="18" rx="3" fill="#E5651A"/>
        <path d="M8 -28l22 14" stroke="#F1B58A" stroke-width="5" stroke-linecap="round"/>
        <circle cx="0" cy="-45" r="9" fill="#F1B58A"/><path d="M-9 -47a9 9 0 0 1 18 0c-4 -4 -13 -5 -18 0z" fill="#2B2018"/>
        <circle cx="3.5" cy="-45" r="1.4" fill="#2B2018"/></g>`;
    }
    function heightsSVG() {
      const g = hGeo();
      const { VW, VH, gy, baseX, hp, s, obsX, H } = g;
      const top = gy - hp;
      const fs = S.narrow ? 19 : 16;
      const known = knownSet();
      const th = Math.atan2(hp, baseX - obsX);
      const px = obsX, py = gy;
      const rr = S.narrow ? 44 : 50;
      const shownA = known.A || S.revealed;
      const angTxt = shownA ? Math.round(g.A) + '°' : '?';
      const mid = th / 2;
      const showTri = ratiosOn().length > 0;
      const used = new Set(ratiosOn().flatMap((k) => RN[k].f));
      const fn = fnOf(scene, ask);
      const hypLabelX = (px + baseX) / 2 - Math.sin(th) * 18, hypLabelY = (py + top) / 2 - Math.cos(th) * 18;
      const badge = (x, y, txt, col, anchor) => {
        const w = txt.length * fs * 0.62 + 16;
        const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
        return `<g><rect x="${x0.toFixed(1)}" y="${(y - fs - 2).toFixed(1)}" width="${w.toFixed(1)}" height="${fs + 12}" rx="${(fs + 12) / 2}" fill="${col}" stroke="#fff" stroke-width="2"/><text x="${(x0 + w / 2).toFixed(1)}" y="${(y + 3).toFixed(1)}" font-family="var(--font-display)" font-weight="800" font-size="${fs}" text-anchor="middle" fill="#fff">${esc(txt)}</text></g>`;
      };
      const dTxt = known.d ? fmt(g.dTrue, 1) + ' m' : '?';
      const hTxt = known.H ? H + ' m' : '?';
      const wr = scene === 'river' ? H * s : 0;
      const dimX = Math.round(baseX + g.ow + 16);
      const ruler = known.d || ask === 'distance';
      return `<defs>
          <linearGradient id="${uid}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5BB6F5"/><stop offset=".7" stop-color="#BFE5FB"/><stop offset="1" stop-color="#FFF3D6"/></linearGradient>
          <linearGradient id="${uid}-gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6FD07A"/><stop offset="1" stop-color="#2E9E4B"/></linearGradient>
          <linearGradient id="${uid}-wat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5CC8F2"/><stop offset="1" stop-color="#1E88C8"/></linearGradient>
          <linearGradient id="${uid}-stone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E0805A"/><stop offset=".5" stop-color="#F1A27A"/><stop offset="1" stop-color="#C65D3B"/></linearGradient>
          <linearGradient id="${uid}-wall" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E9EEF7"/><stop offset="1" stop-color="#BCC8DC"/></linearGradient>
          <radialGradient id="${uid}-sun"><stop offset="0" stop-color="#FFF6B0"/><stop offset="1" stop-color="#FFD23F"/></radialGradient>
        </defs>
        <rect width="${VW}" height="${VH}" fill="url(#${uid}-sky)"/>
        <circle cx="${VW * 0.1}" cy="58" r="30" fill="url(#${uid}-sun)" opacity=".95"/>
        <g fill="#fff" opacity=".85"><ellipse cx="${VW * 0.42}" cy="62" rx="40" ry="12"/><ellipse cx="${VW * 0.42 + 22}" cy="52" rx="26" ry="12"/><ellipse cx="${VW * 0.7}" cy="104" rx="34" ry="10"/><ellipse cx="${VW * 0.7 - 16}" cy="96" rx="20" ry="9"/></g>
        <path d="M0 ${gy - 20}Q${VW * 0.2} ${gy - 70} ${VW * 0.4} ${gy - 24}T${VW * 0.8} ${gy - 30}T${VW} ${gy - 18}V${gy}H0Z" fill="#8ACB8F" opacity=".7"/>
        <rect y="${gy}" width="${VW}" height="${VH - gy}" fill="url(#${uid}-gr)"/><rect y="${gy}" width="${VW}" height="4" fill="#1F7A38" opacity=".55"/>
        ${scene === 'river' ? `<rect x="${(baseX - wr).toFixed(1)}" y="${gy}" width="${wr.toFixed(1)}" height="${VH - gy}" fill="url(#${uid}-wat)"/><g stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".6">${[0.2, 0.5, 0.75].map((t) => `<path d="M${(baseX - wr * (1 - t)).toFixed(1)} ${gy + 20}q8 -5 16 0t16 0"/><path d="M${(baseX - wr * (0.9 - t * 0.7)).toFixed(1)} ${gy + 48}q8 -5 16 0t16 0"/>`).join('')}</g>` : ''}
        ${drawObject(g)}
        ${showTri ? `<polygon points="${px.toFixed(1)},${py} ${baseX},${py} ${baseX},${top.toFixed(1)}" fill="rgba(255,210,63,.28)"/>` : ''}
        <line x1="${baseX}" y1="${gy}" x2="${baseX}" y2="${top.toFixed(1)}" stroke="#334155" stroke-width="2" stroke-dasharray="6 5" opacity=".8"/>
        <path d="M${baseX - 14} ${gy}v-14h14" fill="none" stroke="#1E293B" stroke-width="2.5"/>
        <line x1="${px.toFixed(1)}" y1="${py}" x2="${baseX}" y2="${gy}" stroke="#334155" stroke-width="2" opacity=".6"/>
        <line x1="${px.toFixed(1)}" y1="${py}" x2="${baseX + 10}" y2="${py}" stroke="#334155" stroke-width="2" stroke-dasharray="3 5"/>
        ${showTri ? `<line x1="${baseX}" y1="${gy}" x2="${baseX}" y2="${top.toFixed(1)}" stroke="${SIDE.opp.col}" stroke-width="5" opacity="${used.has('opp') ? 1 : 0.3}"/><line x1="${px.toFixed(1)}" y1="${gy}" x2="${baseX}" y2="${gy}" stroke="${SIDE.adj.col}" stroke-width="5" opacity="${used.has('adj') ? 1 : 0.3}"/>` : ''}
        <path d="M${px.toFixed(1)} ${py}L${(px + rr).toFixed(1)} ${py}A${rr} ${rr} 0 0 0 ${(px + rr * Math.cos(th)).toFixed(1)} ${(py - rr * Math.sin(th)).toFixed(1)}Z" fill="rgba(255,255,255,.55)" stroke="#fff" stroke-width="2"/>
        <line x1="${px.toFixed(1)}" y1="${py}" x2="${baseX}" y2="${top.toFixed(1)}" stroke="#061233" stroke-width="5" stroke-linecap="round" opacity=".25"/>
        <line x1="${px.toFixed(1)}" y1="${py}" x2="${baseX}" y2="${top.toFixed(1)}" stroke="${showTri && used.has('hyp') ? SIDE.hyp.col : '#FFD23F'}" stroke-width="3" stroke-linecap="round" ${showTri && used.has('hyp') ? '' : 'stroke-dasharray="1 0"'}/>
        <circle cx="${baseX}" cy="${top.toFixed(1)}" r="6" fill="#FF6B57" stroke="#fff" stroke-width="2.5"/>
        ${badge(px + (rr + 24) * Math.cos(mid) + 8, py - (rr + 24) * Math.sin(mid) + 6, angTxt, '#8B3DFF', 'start')}
        ${known.L ? badge(hypLabelX, hypLabelY, fmt(g.Ls, 1) + ' m', '#4338CA', 'middle') : ''}
        ${showTri ? `<text class="tg-t" font-size="${fs - 2}" x="${baseX + 8}" y="${(gy + top) / 2}" text-anchor="start" style="fill:${SIDE.opp.col}">${esc(api.t(SIDE.opp.s))}</text><text class="tg-t" font-size="${fs - 2}" x="${(px + baseX) / 2}" y="${gy + 24}" text-anchor="middle" style="fill:${SIDE.adj.col}">${esc(api.t(SIDE.adj.s))}</text><text class="tg-t" font-size="${fs - 2}" x="${hypLabelX - (known.L ? 0 : 0)}" y="${hypLabelY - (known.L ? 26 : 4)}" text-anchor="middle" style="fill:${SIDE.hyp.col}">${esc(api.t(SIDE.hyp.s))}</text>` : ''}
        ${ruler ? `<g stroke="#1E293B" stroke-width="2"><line x1="${px.toFixed(1)}" y1="${gy + 32}" x2="${baseX}" y2="${gy + 32}"/><line x1="${px.toFixed(1)}" y1="${gy + 24}" x2="${px.toFixed(1)}" y2="${gy + 40}"/><line x1="${baseX}" y1="${gy + 24}" x2="${baseX}" y2="${gy + 40}"/></g>
        ${badge((px + baseX) / 2, gy + 58, (S.narrow ? 'd = ' : api.t(T2('distance', 'दूरी')) + ' d = ') + dTxt, known.d ? '#0F766E' : '#8B3DFF', 'middle')}` : ''}
        <g stroke="#1E293B" stroke-width="2"><line x1="${dimX}" y1="${gy}" x2="${dimX}" y2="${top.toFixed(1)}"/><line x1="${dimX - 8}" y1="${gy}" x2="${dimX + 8}" y2="${gy}"/><line x1="${dimX - 8}" y1="${top.toFixed(1)}" x2="${dimX + 8}" y2="${top.toFixed(1)}"/></g>
        ${badge(dimX, top - 12, 'H = ' + hTxt, known.H ? '#0F766E' : '#8B3DFF', 'middle')}
        <rect class="tg-hit" data-handle="obs-zone" x="0" y="${gy - 70}" width="${VW}" height="150" fill="transparent"/>
        <g class="tg-obs" data-key="drag:observer" data-handle="obs" tabindex="0" role="slider" aria-label="${tt(T2('Observer with clinometer: use arrow keys or drag', 'नतिमापी वाला प्रेक्षक: तीर वाली कुंजियाँ या खींचो'))}" aria-valuemin="${stations ? stations[0] : AMIN}" aria-valuemax="${stations ? stations[stations.length - 1] : SC[scene].amax}" aria-valuenow="${stations && !S.revealed ? stations.indexOf(S.a) + 1 : Math.round(g.A)}" aria-valuetext="${esc(obsText())}">
          ${child(px, gy)}
          <path d="M${px - 22} ${gy}a22 22 0 0 1 44 0z" fill="#fff" fill-opacity=".9" stroke="#1E293B" stroke-width="2"/>
          ${[0, 30, 60, 90, 120, 150, 180].map((t) => { const rr2 = rad(t); return `<line x1="${(px + 17 * Math.cos(rr2)).toFixed(1)}" y1="${(gy - 17 * Math.sin(rr2)).toFixed(1)}" x2="${(px + 22 * Math.cos(rr2)).toFixed(1)}" y2="${(gy - 22 * Math.sin(rr2)).toFixed(1)}" stroke="#1E293B" stroke-width="1.5"/>`; }).join('')}
          <circle cx="${px.toFixed(1)}" cy="${gy}" r="4.5" fill="#FF6B57" stroke="#1E293B" stroke-width="1.5"/>
          <circle class="tg-ring tg-pulse" cx="${px.toFixed(1)}" cy="${gy}" r="30" fill="none" stroke="#8B3DFF" stroke-width="3" opacity=".6"/>
          <rect x="${px - 44}" y="${gy - 64}" width="88" height="88" fill="transparent"/>
        </g>`;
    }
    // what the child can see in this problem
    function knownSet() {
      const kite = scene === 'kite';
      if (ask === 'height') return { A: true, H: false, d: !kite, L: kite };
      if (ask === 'distance') return { A: true, H: true, d: false, L: false };
      return { A: false, H: true, d: !kite, L: kite };
    }
    function obsText() {
      const g = hGeo(), k = knownSet();
      const bits = [];
      if (k.A || S.revealed) bits.push(api.t(T2('angle', 'कोण')) + ' ' + Math.round(g.A) + '°');
      if (k.d) bits.push(api.t(T2('distance', 'दूरी')) + ' ' + fmt(g.dTrue, 1) + ' m');
      if (k.L) bits.push(api.t(T2('string', 'डोर')) + ' ' + fmt(g.Ls, 1) + ' m');
      if (!bits.length) bits.push(api.t(T2('position', 'स्थान')) + ' ' + (stations.indexOf(S.a) + 1));
      return bits.join(', ');
    }

    // ---------------------------------------------------------------- the dynamic panels
    function sideChip(k) { return `<span class="tg-side-chip" style="--c:${SIDE[k].col}">${tt(SIDE[k].s)}</span>`; }
    function ratioCards(a) {
      const v = vals(a);
      const r = rad(a);
      const sv = { opp: 10 * snapZ(Math.sin(r)), adj: 10 * snapZ(Math.cos(r)), hyp: 10 };
      const sideMode = mode === 'ratios';
      return RATIOS.filter((k) => S.on[k]).map((k) => {
        const [n, d] = RN[k].f;
        const ex = exact(k, a);
        const ok = v[k] != null;
        let num;
        if (sideMode) num = ok ? `${fmt(sv[n], 2)} ÷ ${fmt(sv[d], 2)} = <strong>${fmt(v[k], 3)}</strong>${ex ? ` <em>= ${esc(ex)}</em>` : ''}` : `${fmt(sv[n], 2)} ÷ ${fmt(sv[d], 2)}: <strong>${tt(ND)}</strong> <small>(÷ 0)</small>`;
        else num = ok ? `<strong>${fmt(v[k], 3)}</strong>${ex ? ` <em>= ${esc(ex)}</em>` : ''}` : `<strong>${tt(ND)}</strong>`;
        const head = sideMode ? `<div class="tg-num">${sideChip(n)} ÷ ${sideChip(d)}</div>` : '';
        return `<div class="tg-card" style="--c:${RN[k].col}"><h4>${k} θ <small>${tt(RN[k].n)}</small></h4>${head}<div class="tg-num">${num}</div></div>`;
      }).join('');
    }
    function stdTable(a) {
      const rows = RATIOS.filter((k) => S.on[k]);
      if (!rows.length) return '';
      const cur = Math.abs(a - Math.round(a)) < 1e-9 ? Math.round(a) : -1;
      return `<table class="tg-table"><caption class="tg-sr">${tt(T2('Exact values at the standard angles', 'मानक कोणों पर यथार्थ मान'))}</caption><thead><tr><th scope="col">θ</th>${STD.map((d) => `<th scope="col" class="${cur === d ? 'cur' : ''}">${d}°</th>`).join('')}</tr></thead><tbody>${rows.map((k) => `<tr><td scope="row" style="color:var(--ink)"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${RN[k].col};margin-right:5px"></span>${k}</td>${STD.map((d) => { const e = exact(k, d); return `<td class="${cur === d ? 'cur' : ''}">${e == null ? '—' : esc(e)}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
    }
    function ratiosPanel() {
      const a = S.a;
      return ratioCards(a) + `<p class="tg-note">${tt(T2('The hypotenuse is kept at 10 units, so the other sides read directly as tenths of the ratio.', 'कर्ण 10 इकाई रखा गया है, इसलिए बाकी भुजाएँ सीधे अनुपात के दसवें भाग के रूप में दिखती हैं।'))}</p>` + stdTable(a);
    }
    function unitPanel() {
      const a = S.a, v = vals(a);
      const qd = quadrant(a);
      const qtxt = qd === 0 ? T2('on an axis', 'अक्ष पर') : [null, T2('quadrant I: all ratios are positive', 'पहला पाद: सभी अनुपात धनात्मक'), T2('quadrant II: only sin and cosec are positive', 'दूसरा पाद: केवल sin और cosec धनात्मक'), T2('quadrant III: only tan and cot are positive', 'तीसरा पाद: केवल tan और cot धनात्मक'), T2('quadrant IV: only cos and sec are positive', 'चौथा पाद: केवल cos और sec धनात्मक')][qd];
      const info = `<div class="tg-box"><p><b>θ = ${Math.round(a)}°</b> = ${esc(radText(Math.round(a)))}; ${tt(qtxt)}</p>
          <p>P = (cos θ, sin θ) = (<b>${fmt(v.cos)}</b>, <b>${fmt(v.sin)}</b>)</p>
          <p>sin²θ + cos²θ = ${fmt(sq(v.sin), 3)} + ${fmt(sq(v.cos), 3)} = <b>${fmt(sq(v.sin) + sq(v.cos), 3)}</b></p></div>`;
      return info + ratioCards(a) + stdTable(a);
    }
    function identPanel() {
      const a = S.a, v = vals(a);
      const cards = IDN.filter((d) => d.need.every((k) => S.on[k])).map((d) => {
        const c = d.calc(v, a);
        if (!c) return `<div class="tg-card" style="--c:#94A3B8"><h4>${esc(d.eq)} <small>${tt(d.name)}</small></h4><div class="tg-num"><strong>${tt(ND)}</strong> ${tt(T2('at this angle (a side is zero)', 'इस कोण पर (एक भुजा शून्य है)'))}</div></div>`;
        const same = Math.abs(c.lv - c.rv) < 1e-9;
        const tot = Math.max(Math.abs(c.lv), Math.abs(c.rv), 1e-9);
        const bar = (parts) => `<div class="tg-bar">${parts.map(([x, key]) => `<i style="width:${(Math.abs(x) / tot) * 100}%;background:${key ? RN[key].col : '#94A3B8'}"></i>`).join('')}</div>`;
        return `<div class="tg-card" style="--c:#8B3DFF"><h4>${esc(d.eq)} <small>${tt(d.name)}</small></h4>
          <div class="tg-num">${esc(c.ln)} = <strong>${fmt(c.lv, 4)}</strong> &nbsp;|&nbsp; ${esc(c.rn)} = <strong>${fmt(c.rv, 4)}</strong> ${same ? `<span class="tg-ok">✓ ${tt(T2('equal', 'बराबर'))}</span>` : ''}</div>
          <div class="tg-bars" aria-hidden="true"><span>${tt(T2('left', 'बायाँ'))}</span>${bar(c.lb)}<span>${tt(T2('right', 'दायाँ'))}</span>${bar(c.rb)}</div></div>`;
      });
      return (cards.length ? cards.join('') : `<p class="tg-note">${tt(T2('Switch on sin and cos to see the first identities.', 'पहली सर्वसमिकाएँ देखने के लिए sin और cos चालू करो।'))}</p>`)
        + `<p class="tg-note">${tt(T2('Identities are true for every angle where all the ratios in them exist.', 'सर्वसमिकाएँ उन सभी कोणों के लिए सही हैं जहाँ उनके सभी अनुपात परिभाषित हैं।'))}</p>`;
    }
    const PROP = {
      sin: [T2('360°', '360°'), T2('−1 to 1', '−1 से 1')], cos: [T2('360°', '360°'), T2('−1 to 1', '−1 से 1')],
      tan: [T2('180°', '180°'), T2('every number', 'हर संख्या')], cot: [T2('180°', '180°'), T2('every number', 'हर संख्या')],
      sec: [T2('360°', '360°'), T2('1 or more, or −1 or less', '1 या अधिक, या −1 या कम')], cosec: [T2('360°', '360°'), T2('1 or more, or −1 or less', '1 या अधिक, या −1 या कम')],
    };
    function graphPanel() {
      const a = S.a, v = vals(a);
      const act = RATIOS.filter((k) => S.on[k]);
      const cards = act.map((k) => `<div class="tg-card" style="--c:${RN[k].col}"><h4>${k} θ <small>${tt(RN[k].n)}</small></h4><div class="tg-num">${tt(T2('at', 'पर'))} ${Math.round(a)}°: <strong>${v[k] == null ? tt(ND) : fmt(v[k], 3)}</strong> &nbsp; ${tt(T2('repeats every', 'दोहराव हर'))} <b>${tt(PROP[k][0])}</b>; ${tt(T2('values', 'मान'))}: <b>${tt(PROP[k][1])}</b></div></div>`).join('');
      return cards || `<p class="tg-note">${tt(T2('Switch on a ratio to draw its graph.', 'आलेख देखने के लिए कोई अनुपात चालू करो।'))}</p>`;
    }

    // heights panel ------------------------------------------------------------------------------
    const numTxt = (x) => fmt(x, 1);
    function question() {
      const g = hGeo(), nm = SC[scene].name;
      const H = g.H;
      const nmH = nm.hi;
      if (scene === 'kite') {
        if (ask === 'height') return T2(`How high is the kite flying? The string is ${numTxt(g.Ls)} m long. Move the observer, read the angle, and work it out.`, `पतंग कितनी ऊँचाई पर उड़ रही है? डोर ${numTxt(g.Ls)} मीटर लंबी है। प्रेक्षक को चलाओ, कोण पढ़ो और ऊँचाई निकालो।`);
        if (ask === 'distance') return T2(`The kite flies ${H} m above the ground. How far is the observer from the spot right below it? Read the angle and work it out.`, `पतंग ज़मीन से ${H} मीटर ऊपर उड़ रही है। प्रेक्षक उसके ठीक नीचे के बिंदु से कितनी दूर है? कोण पढ़ो और दूरी निकालो।`);
        return T2(`The kite is ${H} m high on a string ${numTxt(g.Ls)} m long. What is the angle of elevation of the string?`, `पतंग ${H} मीटर ऊँचाई पर है और डोर ${numTxt(g.Ls)} मीटर लंबी है। डोर का उन्नयन कोण कितना है?`);
      }
      const the = nm;
      if (ask === 'height') return T2(`How tall is ${the.en}? You stand ${numTxt(g.dTrue)} m from it. Read the clinometer and work out the height.`, `${the.hi} की ऊँचाई कितनी है? तुम उससे ${numTxt(g.dTrue)} मीटर दूर खड़े हो। नतिमापी का कोण पढ़ो और ऊँचाई निकालो।`);
      if (ask === 'distance') return T2(`${cap(the.en)} is ${H} m tall. How far from it are you standing? Read the clinometer and work it out.`, `${the.hi} की ऊँचाई ${H} मीटर है। तुम उससे कितनी दूर खड़े हो? नतिमापी का कोण पढ़ो और दूरी निकालो।`);
      return T2(`${cap(the.en)} is ${H} m tall and you stand ${numTxt(g.dTrue)} m from it. What is the angle of elevation of its top?`, `${the.hi} की ऊँचाई ${H} मीटर है और तुम उससे ${numTxt(g.dTrue)} मीटर दूर खड़े हो। उसके शिखर का उन्नयन कोण कितना है?`);
    }
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    function factsHTML() {
      const g = hGeo(), k = knownSet();
      const f = (label, v, find) => `<span class="tg-fact ${find ? 'find' : ''}">${tt(label)}: <b>${esc(v)}</b></span>`;
      const out = [];
      out.push(f(T2('Angle', 'कोण'), k.A || S.revealed ? Math.round(g.A) + '°' : '?', !k.A && !S.revealed));
      out.push(f(T2('Height', 'ऊँचाई'), k.H ? g.H + ' m' : '?', !k.H));
      if (k.d) out.push(f(T2('Distance', 'दूरी'), numTxt(g.dTrue) + ' m'));
      else if (ask === 'distance') out.push(f(T2('Distance', 'दूरी'), '?', true));
      if (k.L) out.push(f(T2('String', 'डोर'), numTxt(g.Ls) + ' m'));
      return `<div class="tg-facts">${out.join('')}</div>`;
    }
    function ratioHelp() {
      const act = ratiosOn();
      if (!act.length) return '';
      const g = hGeo(), fn = fnOf(scene, ask);
      const kite = scene === 'kite';
      const names = kite && fn === 'sin' ? { opp: T2('height of the kite', 'पतंग की ऊँचाई'), adj: T2('ground distance', 'ज़मीन पर दूरी'), hyp: T2('string', 'डोर') } : { opp: T2('height', 'ऊँचाई'), adj: T2('distance', 'दूरी'), hyp: T2('line of sight', 'दृष्टि-रेखा') };
      return act.map((k) => {
        const [n, d] = RN[k].f;
        const kn = knownSet();
        const v = kn.A || S.revealed ? fmt(val(k, g.A), 3) : '?';
        return `<div class="tg-card" style="--c:${RN[k].col}"><h4>${k} θ <small>${tt(RN[k].n)}</small></h4><div class="tg-num">${sideChip(n)} ÷ ${sideChip(d)} = ${tt(names[n])} ÷ ${tt(names[d])}${kn.A || S.revealed ? ` &nbsp; <em>${k} ${Math.round(g.A)}° = ${v}</em>` : ''}</div></div>`;
      }).join('');
    }
    function heightsPanel() {
      const msg = S.msg ? `<div class="tg-msg ${S.msg.type}">${S.msg.html}</div>` : '';
      const tbl = ask === 'angle' ? hintTable() : '';
      return `<div class="tg-box"><p class="tg-q">${tt(question())}</p>${factsHTML()}</div>${msg}${tbl}${ratioHelp()}`;
    }
    function hintTable() {
      const fn = fnOf(scene, ask), sts = stationsFor(scene);
      return `<table class="tg-table"><caption class="tg-sr">${tt(T2('Values to help', 'मदद के लिए मान'))}</caption><thead><tr><th scope="col">θ</th>${sts.map((a) => `<th scope="col">${a}°</th>`).join('')}</tr></thead><tbody><tr><td scope="row">${fn}</td>${sts.map((a) => `<td>${a === 45 && fn === 'sin' ? '0.707' : fmt(val(fn, a), 3)}</td>`).join('')}</tr></tbody></table>`;
    }
    const total = () => hGeo();
    // the true answer for the current problem
    function truth() {
      const g = hGeo();
      return ask === 'height' ? g.H : ask === 'distance' ? g.dTrue : g.A;
    }
    function working(g) {
      const kite = scene === 'kite';
      const A = Math.round(g.A);
      if (ask === 'height') return kite ? `${numTxt(g.Ls)} × sin ${A}° = ${fmt(g.H, 1)} m` : `${numTxt(g.dTrue)} × tan ${A}° = ${fmt(g.H, 1)} m`;
      if (ask === 'distance') return `${g.H} ÷ tan ${A}° = ${fmt(g.dTrue, 1)} m`;
      return kite ? `sin θ = ${g.H} ÷ ${numTxt(g.Ls)} = ${fmt(g.H / g.Ls, 3)} → θ = ${A}°` : `tan θ = ${g.H} ÷ ${numTxt(g.dTrue)} = ${fmt(g.H / g.dTrue, 3)} → θ = ${A}°`;
    }
    function mistakeHint(x) {
      const g = hGeo(), kite = scene === 'kite', A = rad(g.A);
      const near = (y) => y != null && Math.abs(x - y) <= Math.max(0.3, 0.03 * Math.abs(y));
      if (ask === 'height') {
        if (!kite && near(g.dTrue / Math.tan(A))) return T2('You divided by tan θ. tan θ = height ÷ distance, so height = distance × tan θ.', 'तुमने tan θ से भाग दिया। tan θ = ऊँचाई ÷ दूरी, इसलिए ऊँचाई = दूरी × tan θ।');
        if (kite && near(g.Ls / Math.sin(A))) return T2('You divided by sin θ. sin θ = height ÷ string, so height = string × sin θ.', 'तुमने sin θ से भाग दिया। sin θ = ऊँचाई ÷ डोर, इसलिए ऊँचाई = डोर × sin θ।');
        if (kite && near(g.Ls * Math.cos(A))) return T2('That is the ground distance (string × cos θ). The height uses sin θ.', 'यह ज़मीन पर दूरी है (डोर × cos θ)। ऊँचाई में sin θ आता है।');
      } else if (ask === 'distance') {
        if (near(g.H * Math.tan(A))) return T2('You multiplied by tan θ. tan θ = height ÷ distance, so distance = height ÷ tan θ.', 'तुमने tan θ से गुणा किया। tan θ = ऊँचाई ÷ दूरी, इसलिए दूरी = ऊँचाई ÷ tan θ।');
        if (near(g.H / Math.sin(A))) return T2('That is the line of sight (hypotenuse), not the distance on the ground.', 'यह दृष्टि-रेखा (कर्ण) है, ज़मीन पर दूरी नहीं।');
      } else {
        const alt = deg(Math.atan(g.dTrue / g.H));
        if (Math.abs(x - alt) <= 2 && Math.abs(alt - g.A) > 3) return T2('You flipped the fraction. tan θ is height ÷ distance, not distance ÷ height.', 'तुमने भिन्न उलट दी। tan θ = ऊँचाई ÷ दूरी है, दूरी ÷ ऊँचाई नहीं।');
      }
      return null;
    }
    function checkAnswer(x) {
      const t = truth();
      const ok = ask === 'angle' ? Math.abs(x - t) <= 2 : Math.abs(x - t) <= Math.max(0.3, 0.03 * t);
      const g = hGeo();
      if (ok) {
        S.solved = true; S.revealed = true;
        S.msg = { type: 'right', html: `<b>${tt(T2('Yes!', 'सही!'))}</b> <code>${esc(working(g))}</code>${ask === 'angle' ? ` ${tt(T2('The clinometer now shows it.', 'अब नतिमापी भी यही दिखाता है।'))}` : ''}` };
        q('.tg-next').hidden = false;
        api.record(api.t(T2('Answered ', 'उत्तर दिया ')) + x + ': ' + api.t(T2('right', 'सही')));
        api.emit('answered:right');
        api.celebrate();
        liveSay(api.t(T2('Right. ', 'सही। ')) + working(g));
      } else {
        S.wrong++;
        const fn = fnOf(scene, ask);
        const m = mistakeHint(x);
        const help = S.wrong >= 2 ? T2(` Hint: use ${fn} θ = ${fn === 'sin' ? 'opposite ÷ hypotenuse' : 'opposite ÷ adjacent'}.`, ` संकेत: ${fn} θ = ${fn === 'sin' ? 'सम्मुख ÷ कर्ण' : 'सम्मुख ÷ आसन्न'} का उपयोग करो।`) : T2(' Which sides do you know, and which do you want?', ' कौन-सी भुजाएँ पता हैं और कौन-सी चाहिए?');
        const body = m || { en: '', hi: '' };
        S.msg = { type: 'wrong', html: `<b>${tt(T2('Not quite.', 'अभी नहीं।'))}</b> ${m ? tt(body) : ''}${m && S.wrong < 2 ? '' : tt(help)}` };
        api.record(api.t(T2('Answered ', 'उत्तर दिया ')) + x + ': ' + api.t(T2('wrong', 'ग़लत')));
        api.emit('answered:wrong');
        liveSay(api.t(T2('Not quite. Try again.', 'अभी नहीं। फिर कोशिश करो।')));
      }
      draw();
    }

    // ---------------------------------------------------------------- draw
    function draw() {
      if (lastLang !== lang()) {
        const keep = q('.tg-in') ? q('.tg-in').value : '';
        build();
        if (q('.tg-in')) q('.tg-in').value = keep;
        if (S.solved) q('.tg-next').hidden = false;
      }
      const el = svg();
      if (!el) return;
      let vb;
      if (mode === 'ratios' || mode === 'identities') vb = '0 0 480 340';
      else if (mode === 'unit-circle') vb = '0 0 480 440';
      else if (mode === 'graphs') { const G = graphGeo(); vb = `0 0 ${G.VW} ${G.VH}`; }
      else { const g = hGeo(); vb = `0 0 ${g.VW} ${g.VH}`; }
      el.setAttribute('viewBox', vb);
      const hadFocus = mode === 'heights' && document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('tg-obs');
      el.innerHTML = mode === 'ratios' ? triSVG(false) : mode === 'identities' ? triSVG(true) : mode === 'unit-circle' ? unitSVG() : mode === 'graphs' ? graphSVG() : heightsSVG();
      if (hadFocus) { const o = el.querySelector('.tg-obs'); if (o) o.focus({ preventScroll: true }); }
      q('.tg-tip').textContent = mode === 'heights' ? api.t(T2('Drag the observer (or use the slider) to measure from a new spot.', 'नई जगह से नापने के लिए प्रेक्षक को खींचो (या स्लाइडर चलाओ)।')) : api.t(TIP[mode]);
      const main = q('.tg-main');
      main.innerHTML = mode === 'ratios' ? ratiosPanel() : mode === 'unit-circle' ? unitPanel() : mode === 'identities' ? identPanel() : mode === 'graphs' ? graphPanel() : heightsPanel();
      const sl = q('.tg-range');
      if (sl) {
        sl.value = String(Math.round(S.a));
        sl.setAttribute('aria-valuetext', Math.round(S.a) + '°');
        const out = q('.tg-sl-v');
        if (out) out.textContent = mode === 'unit-circle' || mode === 'graphs' ? `${Math.round(S.a)}° · ${radText(Math.round(S.a))}` : `${Math.round(S.a)}°`;
      }
      root.querySelectorAll('[data-key^="toggle:"]').forEach((b) => b.setAttribute('aria-pressed', String(!!S.on[b.dataset.key.slice(7)])));
      root.querySelectorAll('.tg-chip[data-a]').forEach((b) => b.classList.toggle('on', Math.round(S.a) === +b.dataset.a));
      root.classList.toggle('tg-playing', S.playing);
      const wide = (root.clientWidth || 0) >= 860 && (mode === 'ratios' || mode === 'unit-circle' || mode === 'identities');
      const box = q('.tg');
      if (box) box.classList.toggle('tg-wide', wide);
    }

    // ---------------------------------------------------------------- interactions
    function setAngle(a, how) {
      const v = mode === 'heights' ? snapA(a) : clamp(a, range[0], range[1]);
      if (v === S.a && how !== 'play') return;
      const prev = S.a;
      S.a = v;
      if (mode === 'heights') {
        S.msg = S.solved ? null : S.msg && S.msg.type === 'wrong' ? null : S.msg;
        if (S.solved) { S.solved = false; S.wrong = 0; q('.tg-next').hidden = true; }
        if (stopGlide) stopGlide();
        const g0 = H2d(prev), g1 = H2d(v);
        stopGlide = tween(130, (t) => { S.dDisp = lerp(g0, g1, t); draw(); }, () => { S.dDisp = null; stopGlide = null; draw(); });
        const g = hGeo();
        api.record(api.t(T2('Measured: angle ', 'नापा: कोण ')) + Math.round(v) + '°, ' + api.t(T2('distance ', 'दूरी ')) + numTxt(H2d(v)) + ' m');
        queueEmit(['measured', 'changed']);
        liveSay(obsText());
        return;
      }
      draw();
      if (how !== 'play') {
        queueEmit(['changed']);
        liveSay(angleWord() + ': ' + RATIOS.filter((k) => S.on[k]).map((k) => `${k} ${fmt(val(k, S.a), 3)}`).join(', '));
      }
    }
    const H2d = (A) => SC[scene].Hs[S.v] / Math.tan(rad(A));
    function pointer(e) {
      const el = svg();
      const r = el.getBoundingClientRect();
      const vb = el.viewBox.baseVal;
      return { x: ((e.clientX - r.left) / r.width) * vb.width, y: ((e.clientY - r.top) / r.height) * vb.height };
    }
    function angleFromPointer(e) {
      const p = pointer(e);
      let a;
      if (mode === 'ratios') a = deg(Math.atan2(286 - p.y, p.x - 100));
      else if (mode === 'unit-circle') { a = deg(Math.atan2(CY - p.y, p.x - CX)); if (a < 0) a += 360; }
      else if (mode === 'graphs') { const G = graphGeo(); a = deg(Math.atan2(G.cy - p.y, p.x - G.cx)); if (a < 0) a += 360; }
      else return null;
      a = Math.round(a);
      const m = Math.round(a / 15) * 15;
      if (Math.abs(a - m) <= 2) a = m;
      return clamp(a, range[0], range[1]);
    }
    function heightsFromPointer(e) {
      const g = hGeo();
      const p = pointer(e);
      const d = (g.baseX - p.x) / g.s;
      return d <= 0.01 ? SC[scene].amax : deg(Math.atan2(g.H, d));
    }
    function gate(key) {
      if (api.allowed(key)) return true;
      api.nudge(key);
      return false;
    }
    function onDown(e) {
      const h = e.target.closest && e.target.closest('[data-handle]');
      if (mode === 'heights') {
        if (!h) return;
        if (!gate('drag:observer')) return;
        drag = true;
        svg().setPointerCapture(e.pointerId);
        setAngle(heightsFromPointer(e));
        e.preventDefault();
        return;
      }
      if (!h) return;
      if (!gate('slider:angle')) return;
      stopPlay();
      drag = true;
      svg().setPointerCapture(e.pointerId);
      const a = angleFromPointer(e);
      if (a != null) setAngle(a);
      e.preventDefault();
    }
    function onMove(e) {
      if (!drag) return;
      if (mode === 'heights') { setAngle(heightsFromPointer(e)); return; }
      const a = angleFromPointer(e);
      if (a != null) setAngle(a);
    }
    function onUp() { drag = false; }
    function onInput(e) {
      if (!e.target.classList.contains('tg-range')) return;
      if (!gate('slider:angle')) { e.target.value = String(Math.round(S.a)); return; }
      stopPlay();
      setAngle(+e.target.value);
    }
    function togglePlay() {
      if (S.playing) { stopPlay(); return; }
      S.playing = true;
      last = 0;
      const b = q('[data-key="play"]');
      if (b) { b.setAttribute('aria-pressed', 'true'); q('.tg-play-i').textContent = '⏸'; q('.tg-play-t').textContent = api.t(T2('Pause', 'रोको')); }
      const tick = (now) => {
        if (!S.playing) return;
        if (!last) last = now;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        S.a = (S.a + dt * 40) % 360;
        draw();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    function stopPlay() {
      if (!S.playing) return;
      S.playing = false;
      cancelAnimationFrame(raf);
      S.a = Math.round(S.a);
      const b = q('[data-key="play"]');
      if (b) { b.setAttribute('aria-pressed', 'false'); q('.tg-play-i').textContent = '▶'; q('.tg-play-t').textContent = api.t(T2('Play', 'चलाओ')); }
      draw();
      queueEmit(['changed']);
      liveSay(angleWord());
    }
    function onClick(e) {
      const b = e.target.closest('button');
      if (!b || !root.contains(b)) return;
      const key = b.dataset.key || '';
      if (key.startsWith('toggle:')) {
        if (!gate(key)) return;
        const r = key.slice(7);
        S.on[r] = !S.on[r];
        draw();
        queueEmit(['changed']);
        liveSay(api.t(RN[r].n) + ' ' + api.t(S.on[r] ? T2('shown', 'दिखाया') : T2('hidden', 'छिपाया')));
        return;
      }
      if (key === 'play') { if (!gate(key)) return; togglePlay(); return; }
      if (key === 'next') { if (!gate(key)) return; nextProblem(); return; }
      if (b.dataset.a != null) { if (!gate('slider:angle')) return; stopPlay(); setAngle(+b.dataset.a); return; }
      if (b.dataset.step) {
        if (!gate('drag:observer')) return;
        stepObserver(+b.dataset.step);
      }
    }
    function stepObserver(dir) {
      if (stations) {
        const i = stations.indexOf(S.a) + dir;
        if (i >= 0 && i < stations.length) setAngle(stations[i]);
        return;
      }
      setAngle(S.a + dir * (dir > 0 ? 1 : 1));
    }
    function onKey(e) {
      const o = e.target.closest && e.target.closest('.tg-obs');
      if (!o) return;
      const k = e.key;
      let d = 0;
      if (k === 'ArrowRight' || k === 'ArrowUp') d = 1;
      else if (k === 'ArrowLeft' || k === 'ArrowDown') d = -1;
      else if (k === 'PageUp') d = 5;
      else if (k === 'PageDown') d = -5;
      else if (k === 'Home') { e.preventDefault(); if (gate('drag:observer')) setAngle(stations ? stations[0] : SC[scene].amax); return; }
      else if (k === 'End') { e.preventDefault(); if (gate('drag:observer')) setAngle(stations ? stations[stations.length - 1] : AMIN); return; }
      else return;
      e.preventDefault();
      if (!gate('drag:observer')) return;
      if (stations) stepObserver(Math.sign(d));
      else setAngle(S.a + d);
    }
    function onSubmit(e) {
      if (!e.target.classList.contains('tg-form')) return;
      e.preventDefault();
      if (!gate('answer')) return;
      const inp = q('.tg-in');
      const x = parseFloat(String(inp.value).replace(',', '.').replace(/[^0-9.\-]/g, ''));
      if (!isFinite(x)) { api.toast(T2('Type a number first.', 'पहले कोई संख्या लिखो।')); inp.focus(); return; }
      checkAnswer(x);
    }
    function nextProblem() {
      const sc = SC[scene];
      S.v = (S.v + 1) % sc.Hs.length;
      S.solved = false; S.wrong = 0; S.msg = null; S.revealed = false;
      const st = stations ? snapA(startAngles[(S.v * 2 + 1) % startAngles.length] || 45) : clamp(startAngles[S.v] || A0, AMIN, sc.amax);
      S.a = st; S.dDisp = null;
      q('.tg-next').hidden = true;
      q('.tg-in').value = '';
      draw();
      queueEmit(['changed']);
      liveSay(api.t(T2('New problem. ', 'नया सवाल। ')) + api.t(question()));
    }

    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    root.addEventListener('submit', onSubmit);

    function measure() {
      const w = (q('.tg-stage') || root).clientWidth || root.clientWidth || 800;
      const nw = w < 560;
      if (nw !== S.narrow) { S.narrow = nw; return true; }
      return false;
    }
    measure();
    draw();
    if (typeof ResizeObserver !== 'undefined') {
      let lastW = root.clientWidth;
      ro = new ResizeObserver(() => { const w = root.clientWidth; if (w === lastW) return; lastW = w; measure(); draw(); if (measure()) draw(); });
      ro.observe(root);
    }
    return {
      destroy() {
        S.playing = false;
        cancelAnimationFrame(raf);
        clearTimeout(evTimer); clearTimeout(liveTimer);
        if (stopGlide) stopGlide();
        if (ro) ro.disconnect();
        ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'input', 'change', 'click', 'keydown', 'submit'].forEach((n) => root.removeEventListener(n, { pointerdown: onDown, pointermove: onMove, pointerup: onUp, pointercancel: onUp, input: onInput, change: onInput, click: onClick, keydown: onKey, submit: onSubmit }[n]));
      },
    };
  }

  // ---------------------------------------------------------------- register
  NCA_T.register({
    id: 'trig',
    css: CSS,
    validate(c) {
      const e = [];
      if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
      Object.keys(c).forEach((k) => { if (!['mode', 'angle', 'scene', 'ask'].includes(k)) e.push('unknown key: ' + k); });
      if (!MODES.includes(c.mode)) { e.push('mode: one of ' + MODES.join(', ')); return e; }
      if (c.angle != null) {
        if (typeof c.angle !== 'number' || !isFinite(c.angle)) e.push('angle: a number of degrees');
        else {
          const lim = c.mode === 'unit-circle' || c.mode === 'graphs' ? [0, 360] : c.mode === 'heights' ? [AMIN, SC[c.scene && SC[c.scene] ? c.scene : 'tower'].amax] : [0, 90];
          if (c.angle < lim[0] || c.angle > lim[1]) e.push(`angle: ${lim[0]} to ${lim[1]} degrees for mode ${c.mode}`);
        }
      }
      if (c.mode !== 'heights') {
        if (c.scene != null) e.push('scene: only for mode heights');
        if (c.ask != null) e.push('ask: only for mode heights');
      } else {
        if (c.scene != null && !SCENES.includes(c.scene)) e.push('scene: one of ' + SCENES.join(', '));
        if (c.ask != null && !ASKS.includes(c.ask)) e.push('ask: one of ' + ASKS.join(', '));
      }
      return e;
    },
    keys(c) {
      const mode = c && c.mode;
      const tg = RATIOS.map((r) => 'toggle:' + r);
      if (mode === 'heights') {
        const ask = (c && c.ask) || 'height';
        return {
          targets: (ask === 'angle' ? [] : ['slider:angle']).concat(['drag:observer', 'answer', 'next', 'toggle:sin', 'toggle:cos', 'toggle:tan']),
          events: ['changed', 'measured', 'answered:right', 'answered:wrong'],
        };
      }
      const targets = ['slider:angle'].concat(tg);
      if (mode === 'unit-circle' || mode === 'graphs') targets.push('play');
      return { targets, events: ['changed'] };
    },
    demo: { mode: 'heights', scene: 'tower', ask: 'height', angle: 40 },
    mount(root, config, api) { return trig(root, config, api); },
    // pure maths, for tests under Node
    model: { val, vals, exact, radText },
  });
})();
