// Template: Colour and pattern studio ("art"). Four modes, all drawn in SVG, all bilingual.
//   mix       paint-model (RYB) colour mixing: drops of paint go in a dish, "Mix" stirs, the result is named by rule
//             (secondary 1:1, tertiary 2:1, brown from all three, tints with white, shades with black), a 12-colour wheel.
//   rangoli   dot-grid (pulli) rangoli: lines, powder dots, petals and flowers repeated by a real symmetry group.
//   symmetry  freehand kaleidoscope (n-fold rotation, with or without mirror), or "find the lines of symmetry" on
//             shapes and letters by turning a mirror line and a turntable (true counts are in the data).
//   art-form  Warli, Madhubani, Gond, Kalamkari, Pattachitra: facts and a canvas to stamp that art form's motifs.
// Config (all optional except mode; unknown keys are rejected):
//   { mode:'mix', paints?:[red yellow blue white black green orange purple brown pink], start?:[paints], goal?:'green', wheel?:bool, question? }
//   { mode:'rangoli', grid?:5|7|9|11, symmetry?:'none'|'mirror'|'quad'|'rot4'|'full', palette?:[colour ids], sample?:bool, fixed?:bool, question? }
//   { mode:'symmetry', fold?:1..12, mirror?:bool, palette?:[ids], sample?:bool, fixed?:bool, question? }
//   { mode:'symmetry', shapes:[shape ids, 1..8], question? }   (shape explorer instead of the freehand pad)
//   { mode:'art-form', art_form?:'madhubani'|'warli'|'gond'|'kalamkari'|'pattachitra', sample?:bool, question? }
//   question: { q:{en,hi}, options:[{en,hi}×2..4], answer:index, why?:{en,hi} }   (target "answer"; events answered:right/wrong)
(function () {
  const L = window.NCA_LIB;
  const { esc, lerp, clamp, ease, mixHex, tween } = L;
  const T2 = (en, hi) => ({ en, hi });
  const TAU = Math.PI * 2;
  const rad = (d) => (d * Math.PI) / 180;
  const f1 = (n) => Math.round(n * 10) / 10;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  let UID = 0;
  const uid = () => 'ar' + ++UID;

  // ------------------------------------------------------------------------------------------------ CSS
  const CSS = `
.ar-root{--ar-a:#F43F5E;display:grid;gap:12px;color:var(--ink,#1E293B);font-family:var(--font-body,system-ui,sans-serif);min-width:0}
.ar-root *{box-sizing:border-box}
.ar-main{display:grid;gap:14px;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);align-items:start}
@media(max-width:780px){.ar-main{grid-template-columns:minmax(0,1fr)}}
.ar-stagecol{display:grid;gap:10px;min-width:0}
.ar-stage{border-radius:22px;overflow:hidden;box-shadow:0 12px 32px rgba(6,18,51,.22);line-height:0;background:#fff}
.ar-svg{display:block;width:100%;height:auto}
.ar-svg:focus-visible,.ar-btn:focus-visible,.ar-range:focus-visible,.ar-wedge:focus-visible{outline:3px solid var(--royal,#1D4ED8);outline-offset:2px}
.ar-panel{display:grid;gap:10px;min-width:0}
.ar-card{background:var(--surface,#fff);border:1px solid var(--line,#E2E8F0);border-radius:18px;padding:12px 14px;min-width:0}
.ar-h{font-family:var(--font-display,inherit);font-weight:700;font-size:15px;margin:0 0 8px;color:var(--ink,#1E293B)}
.ar-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ar-btn{min-height:44px;min-width:44px;border-radius:14px;border:2px solid var(--line,#CBD5E1);background:var(--surface,#fff);color:var(--ink,#1E293B);font:600 15px/1.2 var(--font-body,inherit);padding:8px 12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:transform .12s,box-shadow .15s,border-color .15s}
.ar-btn:hover{transform:translateY(-1px);box-shadow:0 4px 10px rgba(6,18,51,.14)}
.ar-btn:active{transform:translateY(1px)}
.ar-btn[aria-pressed=true],.ar-btn.on{border-color:var(--ar-a);box-shadow:0 0 0 3px rgba(244,63,94,.28)}
.ar-btn.pri{background:var(--royal,#1D4ED8);color:#fff;border-color:transparent}
.ar-btn[disabled]{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none}
.ar-btn svg{flex:none}
.ar-sw{width:30px;height:30px;border-radius:50%;flex:none;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35),inset 0 -4px 7px rgba(0,0,0,.18),inset 0 3px 5px rgba(255,255,255,.35)}
.ar-paints{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}
.ar-paint{flex-direction:column;gap:4px;padding:8px 6px;font-size:14px}
.ar-paint .ar-sw{width:38px;height:38px}
.ar-chips{display:flex;flex-wrap:wrap;gap:6px}
.ar-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px 4px 5px;border-radius:99px;background:var(--sunk,#F1F5F9);font-size:14px;font-weight:600}
.ar-chip .ar-sw{width:20px;height:20px;border-width:1px}
.ar-recipe{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-height:44px}
.ar-recipe .op{font-weight:700;color:var(--ink-2,#475569)}
.ar-result{display:flex;align-items:center;gap:12px;font-family:var(--font-display,inherit);font-weight:700;font-size:22px;min-height:50px}
.ar-result .ar-sw{width:44px;height:44px}
.ar-live{font-size:15px;font-weight:600;color:var(--ink,#1E293B);background:var(--sun-t,#FFF6D6);border-radius:14px;padding:10px 12px;line-height:1.35;min-height:44px}
.ar-live:empty{display:none}
.ar-goal{display:flex;align-items:center;gap:10px;background:var(--grape-t,#F1E8FF);border-radius:14px;padding:8px 12px;font-weight:700}
.ar-goal .ar-sw{width:26px;height:26px}
.ar-range{width:100%;height:44px;accent-color:var(--royal,#1D4ED8);cursor:pointer}
.ar-lab{display:flex;justify-content:space-between;gap:8px;font-size:14px;font-weight:600;color:var(--ink-2,#475569)}
.ar-q .ar-qt{font-weight:700;margin:0 0 8px;line-height:1.4}
.ar-opts{display:grid;gap:8px}
.ar-opt{justify-content:flex-start;text-align:left}
.ar-opt.right{border-color:var(--good,#0F766E);background:var(--good-t,#DCFCE7)}
.ar-opt.wrong{border-color:var(--bad,#DC2626);background:var(--bad-t,#FEE2E2)}
.ar-qf{margin-top:8px;font-weight:600;font-size:14px;line-height:1.4}
.ar-note{font-size:14px;line-height:1.45;color:var(--ink-2,#475569);margin:0}
.ar-kv{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:14px;line-height:1.4;margin:0}
.ar-kv dt{font-weight:700}.ar-kv dd{margin:0}
.ar-ul{margin:0;padding-left:20px;font-size:14px;line-height:1.5}
.ar-badges{display:flex;flex-wrap:wrap;gap:8px}
.ar-badge{background:var(--royal-t,#E0E9FF);border-radius:12px;padding:6px 12px;font-weight:700;font-size:14px}
.ar-tabs{display:flex;flex-wrap:wrap;gap:6px}
.ar-pop{animation:ar-pop .35s cubic-bezier(.2,1.4,.4,1) both;transform-box:fill-box;transform-origin:center}
@keyframes ar-pop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
.ar-wedge{cursor:pointer}
.ar-wedge:hover path{filter:brightness(1.08)}
@media (prefers-reduced-motion:reduce){.ar-pop{animation:none}.ar-btn{transition:none}}
`;

  // ------------------------------------------------------------------------------------------------ colours
  const CLR = {
    red: { hex: '#D7263D', n: T2('red', 'लाल') }, yellow: { hex: '#FFC914', n: T2('yellow', 'पीला') },
    blue: { hex: '#2457C5', n: T2('blue', 'नीला') }, green: { hex: '#1F9D55', n: T2('green', 'हरा') },
    orange: { hex: '#FF7A1A', n: T2('orange', 'नारंगी') }, pink: { hex: '#FF5FA2', n: T2('pink', 'गुलाबी') },
    purple: { hex: '#7B2D8E', n: T2('purple', 'बैंगनी') }, white: { hex: '#FFFFFF', n: T2('white', 'सफ़ेद') },
    black: { hex: '#1B1B22', n: T2('black', 'काला') },
  };
  const CLR_IDS = Object.keys(CLR);

  // ---------------------------------------------------------------- mix model (paint / RYB)
  // Each paint adds a vector of the three primary pigments (r, y, b) plus white (w) and black (k).
  const PAINT = {
    red: { r: 1 }, yellow: { y: 1 }, blue: { b: 1 }, white: { w: 1 }, black: { k: 1 },
    green: { y: 1, b: 1 }, orange: { r: 1, y: 1 }, purple: { r: 1, b: 1 }, brown: { r: 1, y: 1, b: 1 }, pink: { r: 1, w: 2 },
  };
  const PAINT_HEX = { red: '#D7263D', yellow: '#FFC914', blue: '#2457C5', white: '#FFFFFF', black: '#1B1B22', green: '#1F9D55', orange: '#FF7A1A', purple: '#7B2D8E', brown: '#6B4226', pink: '#F7A3B7' };
  const PAINT_NAME = { red: T2('Red', 'लाल'), yellow: T2('Yellow', 'पीला'), blue: T2('Blue', 'नीला'), white: T2('White', 'सफ़ेद'), black: T2('Black', 'काला'), green: T2('Green', 'हरा'), orange: T2('Orange', 'नारंगी'), purple: T2('Purple', 'बैंगनी'), brown: T2('Brown', 'भूरा'), pink: T2('Pink', 'गुलाबी') };
  const PAINT_IDS = Object.keys(PAINT);
  const MAX_DROPS = 6;
  const CUBE = { '000': '#FBFAF6', '100': '#D7263D', '010': '#FFC914', '001': '#2457C5', '110': '#FF7A1A', '011': '#1F9D55', '101': '#7B2D8E', '111': '#6B4226' };
  const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16));
  const hexOf = (a) => '#' + a.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  function rybHex(r, y, b) {
    const out = [0, 0, 0];
    for (const key in CUBE) {
      const wgt = (key[0] === '1' ? r : 1 - r) * (key[1] === '1' ? y : 1 - y) * (key[2] === '1' ? b : 1 - b);
      const c = rgbOf(CUBE[key]);
      for (let i = 0; i < 3; i++) out[i] += c[i] * wgt;
    }
    return hexOf(out);
  }
  const vecOf = (drops) => drops.reduce((v, id) => { const p = PAINT[id]; ['r', 'y', 'b', 'w', 'k'].forEach((k) => { v[k] += p[k] || 0; }); return v; }, { r: 0, y: 0, b: 0, w: 0, k: 0 });
  function colourOf(v) {
    const tot = v.r + v.y + v.b;
    let h;
    if (tot > 0) {
      const m = Math.max(v.r, v.y, v.b);
      h = rybHex(v.r / m, v.y / m, v.b / m);
      if (v.w) h = mixHex(h, '#FFFFFF', Math.min(0.9, v.w / (v.w + tot)));
      if (v.k) h = mixHex(h, '#14141A', Math.min(0.85, (v.k / (v.k + tot)) * 0.95));
    } else if (v.w || v.k) h = mixHex('#FFFFFF', '#1B1B22', v.k / (v.w + v.k) * 0.78 + (v.w ? 0 : 0.22));
    else h = '#FFFFFF';
    return h;
  }
  const NAMES = {
    red: T2('red', 'लाल'), yellow: T2('yellow', 'पीला'), blue: T2('blue', 'नीला'),
    orange: T2('orange', 'नारंगी'), green: T2('green', 'हरा'), purple: T2('purple', 'बैंगनी'),
    'red-orange': T2('red-orange', 'लाल-नारंगी'), 'yellow-orange': T2('yellow-orange', 'पीला-नारंगी'),
    'yellow-green': T2('yellow-green', 'पीला-हरा'), 'blue-green': T2('blue-green', 'नीला-हरा'),
    'blue-violet': T2('blue-violet', 'नीला-बैंगनी'), 'red-violet': T2('red-violet', 'लाल-बैंगनी'),
    brown: T2('brown', 'भूरा'), white: T2('white', 'सफ़ेद'), black: T2('black', 'काला'), grey: T2('grey', 'स्लेटी'),
    pink: T2('pink', 'गुलाबी'), maroon: T2('maroon', 'मैरून'), navy: T2('navy blue', 'गहरा नीला'), olive: T2('olive green', 'जैतूनी हरा'),
  };
  const TER = { ry: ['red-orange', 'yellow-orange'], yb: ['yellow-green', 'blue-green'], rb: ['red-violet', 'blue-violet'] };
  const SEC = { ry: 'orange', yb: 'green', rb: 'purple' };
  // The rule: one pigment = itself; two pigments = secondary when about equal (< 2:1), tertiary from 2:1 up to 3:1,
  // and still the stronger primary beyond 3:1; all three = brown; white makes a tint, black a shade.
  function classify(v) {
    const tot = v.r + v.y + v.b;
    if (!tot) return v.w && v.k ? 'grey' : v.w ? 'white' : v.k ? 'black' : null;
    const set = ['r', 'y', 'b'].filter((k) => v[k] > 0);
    let base;
    if (set.length === 1) base = { r: 'red', y: 'yellow', b: 'blue' }[set[0]];
    else if (set.length === 3) base = 'brown';
    else {
      const pair = set.join('');
      const a = v[set[0]], b = v[set[1]];
      const ratio = Math.max(a, b) / Math.min(a, b);
      if (ratio < 2) base = SEC[pair];
      else if (ratio <= 3) base = TER[pair][a > b ? 0 : 1];
      else base = { r: 'red', y: 'yellow', b: 'blue' }[a > b ? set[0] : set[1]];
    }
    if (v.w && v.k) return 'muted-' + base;
    if (v.w) return base === 'red' ? 'pink' : 'light-' + base;
    if (v.k) return { red: 'maroon', blue: 'navy', yellow: 'olive' }[base] || 'dark-' + base;
    return base;
  }
  function nameOfId(id) {
    if (NAMES[id]) return NAMES[id];
    const m = id.match(/^(light|dark|muted)-(.+)$/);
    const b = NAMES[m[2]];
    const pre = { light: T2('light ', 'हल्का '), dark: T2('dark ', 'गहरा '), muted: T2('dull ', 'फीका ') }[m[1]];
    return T2(pre.en + b.en, pre.hi + b.hi);
  }
  const reachCache = {};
  function reachable(paints) {
    const key = paints.join(',');
    if (reachCache[key]) return reachCache[key];
    const out = new Set();
    const rec = (start, drops) => {
      if (drops.length >= 2 && new Set(drops).size >= 2) out.add(classify(vecOf(drops)));
      if (drops.length === MAX_DROPS) return;
      for (let i = start; i < paints.length; i++) rec(i, drops.concat(paints[i]));
    };
    rec(0, []);
    return (reachCache[key] = [...out].sort());
  }
  // The 12-colour wheel (RYB): index 0 at the top, clockwise.
  const WHEEL = [
    ['yellow', { y: 1 }], ['yellow-orange', { y: 2, r: 1 }], ['orange', { y: 1, r: 1 }], ['red-orange', { r: 2, y: 1 }], ['red', { r: 1 }], ['red-violet', { r: 2, b: 1 }],
    ['purple', { r: 1, b: 1 }], ['blue-violet', { b: 2, r: 1 }], ['blue', { b: 1 }], ['blue-green', { b: 2, y: 1 }], ['green', { y: 1, b: 1 }], ['yellow-green', { y: 2, b: 1 }],
  ].map(([id, p]) => { const v = Object.assign({ r: 0, y: 0, b: 0, w: 0, k: 0 }, p); return { id, v, hex: colourOf(v) }; });
  const WHEEL_KIND = (i) => (i % 4 === 0 ? 'primary' : i % 2 === 0 ? 'secondary' : 'tertiary');
  const RECIPE_TXT = {
    'yellow-orange': ['yellow', 'orange'], 'red-orange': ['red', 'orange'], 'red-violet': ['red', 'purple'], 'blue-violet': ['blue', 'purple'], 'blue-green': ['blue', 'green'], 'yellow-green': ['yellow', 'green'],
    orange: ['red', 'yellow'], green: ['yellow', 'blue'], purple: ['red', 'blue'],
  };

  // ---------------------------------------------------------------- rangoli model
  const RSYM = {
    none: { m: [[1, 0, 0, 1]], lines: 0, order: 1, n: T2('No symmetry', 'कोई सममिति नहीं') },
    mirror: { m: [[1, 0, 0, 1], [-1, 0, 0, 1]], lines: 1, order: 1, n: T2('One mirror line', 'एक दर्पण-रेखा') },
    quad: { m: [[1, 0, 0, 1], [-1, 0, 0, 1], [1, 0, 0, -1], [-1, 0, 0, -1]], lines: 2, order: 2, n: T2('Two mirror lines', 'दो दर्पण-रेखाएँ') },
    rot4: { m: [[1, 0, 0, 1], [0, -1, 1, 0], [-1, 0, 0, -1], [0, 1, -1, 0]], lines: 0, order: 4, n: T2('Turn 4 times (no mirror)', 'चार बार घुमाव (दर्पण नहीं)') },
    full: { m: [[1, 0, 0, 1], [-1, 0, 0, 1], [1, 0, 0, -1], [-1, 0, 0, -1], [0, -1, 1, 0], [0, 1, -1, 0], [0, 1, 1, 0], [0, -1, -1, 0]], lines: 4, order: 4, n: T2('Four mirror lines and 4 turns', 'चार दर्पण-रेखाएँ और 4 घुमाव') },
  };
  const RSYM_IDS = Object.keys(RSYM);
  const GRIDS = [5, 7, 9, 11];
  const RPAL = ['red', 'yellow', 'white', 'green', 'orange', 'pink'];
  const RCLR = { red: '#E0243B', yellow: '#FFC21A', white: '#FFFFFF', green: '#25B060', orange: '#FF7A1A', pink: '#FF5FA2', blue: '#3A78F2', purple: '#A15BFF', black: '#2A2A33' };
  const RTOOLS = ['line', 'dot', 'petal', 'flower', 'erase'];
  const RTOOL_N = { line: T2('Line', 'रेखा'), dot: T2('Dot', 'बिंदु'), petal: T2('Petal', 'पंखुड़ी'), flower: T2('Flower', 'फूल'), erase: T2('Rub out', 'मिटाओ') };

  // ---------------------------------------------------------------- symmetry shapes (true counts are data; tested numerically)
  const reg = (n, r, rot) => Array.from({ length: n }, (_, k) => { const a = rad((rot == null ? -90 : rot) + (k * 360) / n); return [r * Math.cos(a), r * Math.sin(a)]; });
  const star = (n, R, r) => Array.from({ length: n * 2 }, (_, k) => { const a = rad(-90 + (k * 180) / n); const q = k % 2 ? r : R; return [q * Math.cos(a), q * Math.sin(a)]; });
  const ell = (rx, ry) => Array.from({ length: 64 }, (_, k) => { const a = rad((k * 360) / 64); return [rx * Math.cos(a), ry * Math.sin(a)]; });
  const lines90 = (n) => Array.from({ length: n }, (_, k) => (90 + (k * 180) / n) % 180).sort((a, b) => a - b);
  const SHAPES = {
    square: { n: T2('Square', 'वर्ग'), poly: [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]], lines: [0, 45, 90, 135], order: 4 },
    rectangle: { n: T2('Rectangle', 'आयत'), poly: [[-1, -0.6], [1, -0.6], [1, 0.6], [-1, 0.6]], lines: [0, 90], order: 2 },
    equilateral: { n: T2('Equilateral triangle', 'समबाहु त्रिभुज'), poly: reg(3, 1), lines: lines90(3), order: 3 },
    isosceles: { n: T2('Isosceles triangle', 'समद्विबाहु त्रिभुज'), poly: [[0, -0.95], [0.7, 0.75], [-0.7, 0.75]], lines: [90], order: 1 },
    scalene: { n: T2('Scalene triangle', 'विषमबाहु त्रिभुज'), poly: [[-0.9, 0.7], [0.95, 0.55], [-0.2, -0.85]], lines: [], order: 1 },
    circle: { n: T2('Circle', 'वृत्त'), poly: ell(1, 1), lines: 'all', order: 'inf' },
    oval: { n: T2('Oval', 'अंडाकार'), poly: ell(1, 0.65), lines: [0, 90], order: 2 },
    parallelogram: { n: T2('Parallelogram', 'समांतर चतुर्भुज'), poly: [[-0.6, -0.6], [1, -0.6], [0.6, 0.6], [-1, 0.6]], lines: [], order: 2 },
    rhombus: { n: T2('Rhombus', 'समचतुर्भुज'), poly: [[0, -1], [0.62, 0], [0, 1], [-0.62, 0]], lines: [0, 90], order: 2 },
    kite: { n: T2('Kite', 'पतंग (चतुर्भुज)'), poly: [[0, -1], [0.65, -0.25], [0, 0.95], [-0.65, -0.25]], lines: [90], order: 1 },
    trapezium: { n: T2('Isosceles trapezium', 'समद्विबाहु समलंब चतुर्भुज'), poly: [[-0.55, -0.6], [0.55, -0.6], [1, 0.6], [-1, 0.6]], lines: [90], order: 1 },
    pentagon: { n: T2('Regular pentagon', 'सम पंचभुज'), poly: reg(5, 1), lines: lines90(5), order: 5 },
    hexagon: { n: T2('Regular hexagon', 'सम षट्भुज'), poly: reg(6, 1), lines: lines90(6), order: 6 },
    star: { n: T2('Five-point star', 'पाँच कोनों वाला तारा'), poly: star(5, 1, 0.4), lines: lines90(5), order: 5 },
    plus: { n: T2('Plus sign', 'जोड़ का चिह्न'), poly: [[-0.18, -1], [0.18, -1], [0.18, -0.18], [1, -0.18], [1, 0.18], [0.18, 0.18], [0.18, 1], [-0.18, 1], [-0.18, 0.18], [-1, 0.18], [-1, -0.18], [-0.18, -0.18]], lines: [0, 45, 90, 135], order: 4 },
    'letter-A': { n: T2('Letter A', 'अक्षर A'), segs: [[-0.8, 0.9, 0, -0.95], [0, -0.95, 0.8, 0.9], [-0.45, 0.25, 0.45, 0.25]], lines: [90], order: 1 },
    'letter-H': { n: T2('Letter H', 'अक्षर H'), segs: [[-0.7, -0.9, -0.7, 0.9], [0.7, -0.9, 0.7, 0.9], [-0.7, 0, 0.7, 0]], lines: [0, 90], order: 2 },
    'letter-T': { n: T2('Letter T', 'अक्षर T'), segs: [[-0.8, -0.9, 0.8, -0.9], [0, -0.9, 0, 0.9]], lines: [90], order: 1 },
    'letter-E': { n: T2('Letter E', 'अक्षर E'), segs: [[-0.5, -0.9, -0.5, 0.9], [-0.5, -0.9, 0.7, -0.9], [-0.5, 0, 0.45, 0], [-0.5, 0.9, 0.7, 0.9]], lines: [0], order: 1 },
    'letter-X': { n: T2('Letter X', 'अक्षर X'), segs: [[-0.6, -0.9, 0.6, 0.9], [0.6, -0.9, -0.6, 0.9]], lines: [0, 90], order: 2 },
    'letter-N': { n: T2('Letter N', 'अक्षर N'), segs: [[-0.6, 0.9, -0.6, -0.9], [-0.6, -0.9, 0.6, 0.9], [0.6, 0.9, 0.6, -0.9]], lines: [], order: 2 },
  };
  const SHAPE_IDS = Object.keys(SHAPES);
  const SHAPE_FILL = ['#2563EB', '#14B8A6', '#8B3DFF', '#FF7A1A', '#F43F5E', '#0F766E', '#FFC21A'];
  const SYM_PAL = ['red', 'yellow', 'white', 'orange', 'pink', 'green', 'blue', 'purple'];

  // ---------------------------------------------------------------- art forms (facts)
  const FORMS = {
    warli: {
      n: T2('Warli', 'वारली'), bg: '#B5502B', bg2: '#8E3A1C', palette: ['white'], motifs: ['person', 'tree', 'hut', 'sun', 'dance'],
      where: T2('Maharashtra (Palghar and Thane hills)', 'महाराष्ट्र (पालघर और ठाणे की पहाड़ियाँ)'),
      who: T2('The Warli adivasi community', 'वारली आदिवासी समुदाय'),
      surface: T2('Mud-hut walls, coated with red-brown earth and cow dung', 'मिट्टी के घरों की दीवारें, लाल-भूरी मिट्टी और गोबर से लिपी हुई'),
      tools: T2('Rice-flour paste; a thin bamboo stick chewed at the tip is the brush', 'चावल के आटे की लेई; सिरे पर चबाई हुई पतली बाँस की छड़ी कूची का काम करती है'),
      features: [
        T2('Only white, on a red-brown wall.', 'लाल-भूरी दीवार पर केवल सफ़ेद रंग।'),
        T2('Three shapes: circle (sun, moon), triangle (hills, trees), square (a field or sacred space).', 'तीन आकार: वृत्त (सूरज, चाँद), त्रिभुज (पहाड़, पेड़), वर्ग (खेत या पवित्र स्थान)।'),
        T2('A person is two triangles joined at their tips.', 'एक व्यक्ति दो त्रिभुज होते हैं जो नोक पर जुड़े हैं।'),
        T2('Scenes of farming, festivals, weddings and the Tarpa dance in a ring.', 'खेती, त्योहार, विवाह और घेरे में तारपा नृत्य के दृश्य।'),
      ],
      tryit: T2('Draw a Tarpa dance: dancers in a ring.', 'तारपा नृत्य बनाओ: घेरे में नाचते लोग।'),
    },
    madhubani: {
      n: T2('Madhubani', 'मधुबनी'), bg: '#FFF1D6', bg2: '#FBE3B0', palette: ['red', 'yellow', 'blue', 'green', 'orange', 'pink'], motifs: ['fish', 'peacock', 'lotus', 'sun'],
      where: T2('Bihar (the Mithila region)', 'बिहार (मिथिला क्षेत्र)'),
      who: T2('Women of Mithila, now artists of every kind', 'मिथिला की महिलाएँ, अब हर तरह के कलाकार'),
      surface: T2('Freshly plastered walls and floors at weddings and festivals; today paper and cloth', 'विवाह और त्योहार पर ताज़ा लिपी दीवारें और फ़र्श; आज काग़ज़ और कपड़ा'),
      tools: T2('Fingers, twigs, matchsticks and nib pens; colours from flowers, turmeric, indigo and soot', 'उँगलियाँ, तीलियाँ, माचिस की सलाइयाँ और निब-पेन; रंग फूलों, हल्दी, नील और कालिख से'),
      features: [
        T2('Bright flat colours inside bold black lines.', 'गहरी काली रेखाओं के भीतर चटक सपाट रंग।'),
        T2('Double-line borders and hatching.', 'दोहरी रेखा की किनारियाँ और तिरछी धारियों की भराई।'),
        T2('Almost no empty space: flowers, birds and patterns fill the gaps.', 'लगभग कोई ख़ाली जगह नहीं: फूल, पक्षी और नमूने खाली जगह भर देते हैं।'),
        T2('Fish, peacock, lotus and sun are lucky signs, often painted for weddings.', 'मछली, मोर, कमल और सूरज शुभ चिह्न हैं, जो अक्सर विवाह पर बनते हैं।'),
      ],
      tryit: T2('Paint a fish pair and fill the gaps with flowers.', 'मछली का जोड़ा बनाओ और खाली जगह फूलों से भरो।'),
    },
    gond: {
      n: T2('Gond', 'गोंड'), bg: '#12152A', bg2: '#0A0C1B', palette: ['yellow', 'orange', 'pink', 'green', 'blue', 'white'], motifs: ['bird', 'deer', 'tree', 'fish'],
      where: T2('Madhya Pradesh (Mandla and Dindori), and nearby states', 'मध्य प्रदेश (मंडला और डिंडोरी) और आसपास के राज्य'),
      who: T2('The Gond community; artist Jangarh Singh Shyam made it widely known from the 1980s', 'गोंड समुदाय; कलाकार जनगढ़ सिंह श्याम ने इसे 1980 के दशक से व्यापक रूप से पहचान दिलाई'),
      surface: T2('Walls and floors of homes; today paper and canvas', 'घरों की दीवारें और फ़र्श; आज काग़ज़ और कैनवास'),
      tools: T2('Colours once from charcoal, coloured soil, leaves and lime; today often acrylic', 'रंग पहले कोयले, रंगीन मिट्टी, पत्तियों और चूने से; आज अक्सर ऐक्रेलिक'),
      features: [
        T2('Bodies are filled with dots, dashes and lines that make the picture seem to move.', 'शरीर बिंदुओं, छोटी रेखाओं और धारियों से भरे होते हैं, जिनसे चित्र हिलता-सा लगता है।'),
        T2('Animals, birds and trees are the main subjects.', 'पशु, पक्षी और पेड़ मुख्य विषय हैं।'),
        T2('Vivid colours glow on a dark background.', 'गहरी पृष्ठभूमि पर चटक रंग चमकते हैं।'),
        T2('A picture of an animal is believed to bring good luck.', 'माना जाता है कि पशु का चित्र शुभ होता है।'),
      ],
      tryit: T2('Make a deer and fill its body with dots.', 'हिरन बनाओ और उसका शरीर बिंदुओं से भरो।'),
    },
    kalamkari: {
      n: T2('Kalamkari', 'कलमकारी'), bg: '#F3E6CB', bg2: '#E7D3AA', palette: ['red', 'blue', 'yellow', 'green', 'black'], motifs: ['flower', 'tree', 'paisley', 'peacock'],
      where: T2('Andhra Pradesh (Srikalahasti and Machilipatnam) and Telangana', 'आंध्र प्रदेश (श्रीकालहस्ती और मछलीपट्टनम) और तेलंगाना'),
      who: T2('Hereditary cloth painters and block-printers', 'पीढ़ियों से चले आ रहे कपड़ा-चित्रकार और छपाई करने वाले कारीगर'),
      surface: T2('Cotton cloth, first soaked in milk and myrobalan (harad) so the dyes hold', 'सूती कपड़ा, जिसे पहले दूध और हरड़ में भिगोया जाता है ताकि रंग पक्के रहें'),
      tools: T2('A bamboo pen (kalam = pen, kari = work). Dyes: indigo (blue), madder root (red), myrobalan (yellow), iron and jaggery (black). Green is blue over yellow.', 'बाँस की कलम (कलम + कारी = कलम का काम)। रंग: नील (नीला), मजीठ की जड़ (लाल), हरड़ (पीला), लोहा और गुड़ (काला)। हरा रंग पीले पर नील चढ़ाने से बनता है।'),
      features: [
        T2('Natural dyes only: plants, roots and minerals.', 'केवल प्राकृतिक रंग: पौधे, जड़ें और खनिज।'),
        T2('Srikalahasti work is drawn freehand with the pen; Machilipatnam work is printed with blocks.', 'श्रीकालहस्ती का काम कलम से हाथ से बनता है; मछलीपट्टनम का काम ठप्पों से छपता है।'),
        T2('Scenes from the Ramayana and Mahabharata, the Tree of Life, flowers and peacocks.', 'रामायण और महाभारत के दृश्य, जीवन-वृक्ष, फूल और मोर।'),
        T2('Fine black outlines, then flat colour fills.', 'पहले बारीक काली रेखाएँ, फिर सपाट रंग भराई।'),
      ],
      tryit: T2('Draw a Tree of Life with a flower at its foot.', 'जीवन-वृक्ष बनाओ और उसके पास एक फूल रखो।'),
    },
    pattachitra: {
      n: T2('Pattachitra', 'पट्टचित्र'), bg: '#F5DFA8', bg2: '#E8C77A', palette: ['red', 'yellow', 'black', 'white', 'blue', 'green'], motifs: ['face', 'lotus', 'fish', 'sun'],
      where: T2('Odisha (Puri, Raghurajpur) and West Bengal', 'ओडिशा (पुरी, रघुराजपुर) और पश्चिम बंगाल'),
      who: T2('Chitrakar families of painters', 'चित्रकार परिवार'),
      surface: T2('Cloth (patta) stiffened with a paste of tamarind seed and chalk', 'कपड़ा (पट्ट), जिसे इमली के बीज और खड़िया की लेई से कड़ा किया जाता है'),
      tools: T2('Natural colours: white from conch shell, black from lamp soot, red and yellow from stones, blue from indigo', 'प्राकृतिक रंग: सफ़ेद शंख से, काला दीये की कालिख से, लाल और पीला पत्थरों से, नीला नील से'),
      features: [
        T2('Bold black outlines and flat colours; figures have big eyes.', 'गहरी काली रेखाएँ और सपाट रंग; आकृतियों की आँखें बड़ी होती हैं।'),
        T2('Decorative flower borders frame the picture.', 'फूलों की सजावटी किनारी चित्र को घेरती है।'),
        T2('Stories of Jagannath, Krishna and the Ramayana.', 'जगन्नाथ, कृष्ण और रामायण की कथाएँ।'),
        T2('Jagannath is painted dark, Balabhadra white and Subhadra yellow.', 'जगन्नाथ गहरे रंग के, बलभद्र सफ़ेद और सुभद्रा पीली बनाई जाती हैं।'),
      ],
      tryit: T2('Paint the three faces: black, white and yellow.', 'तीन चेहरे बनाओ: काला, सफ़ेद और पीला।'),
    },
  };
  const FORM_IDS = Object.keys(FORMS);
  const MOTIF_N = {
    person: T2('Person', 'व्यक्ति'), tree: T2('Tree', 'पेड़'), hut: T2('Hut', 'झोपड़ी'), sun: T2('Sun', 'सूरज'), dance: T2('Dance ring', 'नृत्य का घेरा'),
    fish: T2('Fish', 'मछली'), peacock: T2('Peacock', 'मोर'), lotus: T2('Lotus', 'कमल'), bird: T2('Bird', 'पक्षी'), deer: T2('Deer', 'हिरन'),
    flower: T2('Flower', 'फूल'), paisley: T2('Mango motif', 'आम की आकृति'), face: T2('Face', 'चेहरा'),
  };
  const ALL_MOTIFS = [...new Set(FORM_IDS.flatMap((f) => FORMS[f].motifs))];
  const MAX_STAMPS = 40;

  // ------------------------------------------------------------------------------------------------ validate / keys
  const okText = (x) => (typeof x === 'string' && x.trim()) || (x && typeof x === 'object' && typeof x.en === 'string' && x.en.trim() && typeof x.hi === 'string' && x.hi.trim());
  function validateQuestion(q, e) {
    if (!q || typeof q !== 'object' || Array.isArray(q)) { e.push('question: an object { q, options, answer }'); return; }
    Object.keys(q).forEach((k) => { if (!['q', 'options', 'answer', 'why'].includes(k)) e.push('question: unknown key ' + k); });
    if (!okText(q.q)) e.push('question.q: needs English and Hindi text');
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) e.push('question.options: 2 to 4 options');
    else {
      q.options.forEach((o, i) => { if (!okText(o)) e.push(`question.options[${i}]: needs English and Hindi text`); });
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) e.push('question.answer: the index (from 0) of the right option');
    }
    if (q.why != null && !okText(q.why)) e.push('question.why: needs English and Hindi text');
  }
  const idList = (v, name, ok, min, max, e) => {
    if (!Array.isArray(v)) { e.push(name + ': an array'); return false; }
    if (v.length < min || v.length > max) e.push(`${name}: ${min} to ${max} items`);
    v.forEach((x) => { if (!ok.includes(x)) e.push(`${name}: unknown "${x}" (use ${ok.join(', ')})`); });
    if (new Set(v).size !== v.length) e.push(name + ': each item once');
    return true;
  };
  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
    const modes = { mix: ['paints', 'start', 'goal', 'wheel', 'question'], rangoli: ['grid', 'symmetry', 'palette', 'sample', 'fixed', 'question'], symmetry: ['fold', 'mirror', 'palette', 'sample', 'fixed', 'shapes', 'question'], 'art-form': ['art_form', 'sample', 'question'] };
    if (!modes[c.mode]) return ['mode must be one of: ' + Object.keys(modes).join(', ')];
    Object.keys(c).forEach((k) => { if (k !== 'mode' && !modes[c.mode].includes(k)) e.push(`unknown key "${k}" for mode ${c.mode} (allowed: ${modes[c.mode].join(', ')})`); });
    ['wheel', 'sample', 'fixed', 'mirror'].forEach((k) => { if (c[k] != null && typeof c[k] !== 'boolean') e.push(k + ': true or false'); });
    if (c.question != null) validateQuestion(c.question, e);
    if (c.mode === 'mix') {
      const paints = c.paints == null ? PAINT_IDS.slice(0, 5) : c.paints;
      if (c.paints != null) idList(c.paints, 'paints', PAINT_IDS, 2, 10, e);
      if (e.length === 0 || Array.isArray(paints)) {
        const pl = Array.isArray(paints) ? paints : [];
        if (c.start != null) {
          if (!Array.isArray(c.start)) e.push('start: an array of paint ids');
          else { if (c.start.length > MAX_DROPS) e.push(`start: at most ${MAX_DROPS} drops`); c.start.forEach((p) => { if (!pl.includes(p)) e.push(`start: "${p}" is not one of the paints`); }); }
        }
        if (c.goal != null) {
          if (c.question != null) e.push('use either goal or question, not both');
          const r = pl.every((p) => PAINT[p]) ? reachable(pl) : [];
          if (!r.includes(c.goal)) e.push(`goal "${c.goal}" cannot be made by mixing these paints (reachable: ${r.join(', ')})`);
        }
      }
    }
    if (c.mode === 'rangoli') {
      if (c.grid != null && !GRIDS.includes(c.grid)) e.push('grid: 5, 7, 9 or 11');
      if (c.symmetry != null && !RSYM[c.symmetry]) e.push('symmetry: one of ' + RSYM_IDS.join(', '));
      if (c.palette != null) idList(c.palette, 'palette', Object.keys(RCLR), 1, 9, e);
    }
    if (c.mode === 'symmetry') {
      if (c.shapes != null) {
        idList(c.shapes, 'shapes', SHAPE_IDS, 1, 8, e);
        ['fold', 'mirror', 'palette', 'sample', 'fixed'].forEach((k) => { if (c[k] != null) e.push(`${k} is for the freehand pad; it cannot be used with shapes`); });
      } else {
        if (c.fold != null && !(Number.isInteger(c.fold) && c.fold >= 1 && c.fold <= 12)) e.push('fold: a whole number from 1 to 12');
        if (c.palette != null) idList(c.palette, 'palette', Object.keys(RCLR), 1, 9, e);
      }
    }
    if (c.mode === 'art-form' && c.art_form != null && !FORMS[c.art_form]) e.push('art_form: one of ' + FORM_IDS.join(', '));
    return e;
  }
  function keys(c) {
    const t = ['canvas'], ev = [];
    c = c || {};
    if (c.mode === 'mix') {
      const paints = Array.isArray(c.paints) ? c.paints : PAINT_IDS.slice(0, 5);
      paints.forEach((p) => t.push('colour:' + p));
      t.push('tool:mix', 'tool:undo', 'tool:clear');
      if (c.wheel !== false) { t.push('tool:wheel'); ev.push('wheel:open'); }
      reachable(paints.filter((p) => PAINT[p])).forEach((id) => ev.push('mixed:' + id));
      if (c.goal != null) ev.push('answered:right', 'answered:wrong');
    } else if (c.mode === 'rangoli') {
      (Array.isArray(c.palette) ? c.palette : RPAL).forEach((p) => t.push('colour:' + p));
      RTOOLS.forEach((x) => t.push('tool:' + x));
      t.push('tool:undo', 'tool:clear');
      if (!c.fixed) t.push('tool:symmetry');
      ev.push('drawn');
    } else if (c.mode === 'symmetry' && Array.isArray(c.shapes)) {
      c.shapes.forEach((s) => t.push('tool:' + s));
      t.push('tool:mirror', 'tool:fold', 'tool:turn');
      ev.push('found:line', 'found:all', 'fold:match', 'fold:miss', 'turn:fit');
    } else if (c.mode === 'symmetry') {
      (Array.isArray(c.palette) ? c.palette : SYM_PAL).forEach((p) => t.push('colour:' + p));
      t.push('tool:undo', 'tool:clear');
      if (!c.fixed) t.push('tool:fold', 'tool:mirror');
      ev.push('drawn');
    } else if (c.mode === 'art-form') {
      const forms = c.art_form ? [c.art_form] : FORM_IDS;
      const pal = [...new Set(forms.flatMap((f) => (FORMS[f] ? FORMS[f].palette : [])))];
      pal.forEach((p) => t.push('colour:' + p));
      [...new Set(forms.flatMap((f) => (FORMS[f] ? FORMS[f].motifs : [])))].forEach((m) => t.push('tool:' + m));
      t.push('tool:border', 'tool:watch', 'tool:undo', 'tool:clear');
      if (!c.art_form) forms.forEach((f) => { t.push('tool:' + f); ev.push('form:' + f); });
      ev.push('drawn', 'watched');
    }
    if (c.question != null || c.goal != null) {
      if (c.question != null) t.push('answer');
      if (!ev.includes('answered:right')) ev.push('answered:right', 'answered:wrong');
    }
    return { targets: t, events: ev };
  }

  // ------------------------------------------------------------------------------------------------ shared UI
  function base(root, api, cls, topHTML) {
    root.innerHTML = `<div class="ar-root ${cls}"><div class="ar-main"><div class="ar-stagecol">${topHTML || ''}<div class="ar-stage"></div><div class="ar-live" role="status" aria-live="polite"></div></div><div class="ar-panel"></div></div></div>`;
    const q = (s) => root.querySelector(s);
    return { el: q('.ar-root'), stage: q('.ar-stage'), live: q('.ar-live'), panel: q('.ar-panel'), top: q('.ar-top') };
  }
  // Rebuild a container's HTML but keep keyboard focus on the same control.
  function setHTML(el, html) {
    const a = document.activeElement;
    const fk = a && el.contains(a) ? a.getAttribute('data-fk') : null;
    el.innerHTML = html;
    if (fk) { const n = el.querySelector('[data-fk="' + fk + '"]'); if (n && !n.disabled) n.focus({ preventScroll: true }); }
  }
  const sw = (hex) => `<span class="ar-sw" style="background:${hex}" aria-hidden="true"></span>`;
  const btn = (key, act, label, o) => {
    o = o || {};
    return `<button type="button" class="ar-btn${o.cls ? ' ' + o.cls : ''}" data-key="${esc(key)}" data-fk="${esc(key)}${o.arg != null ? ':' + esc(o.arg) : ''}" data-act="${act}"${o.arg != null ? ` data-arg="${esc(o.arg)}"` : ''}${o.pressed != null ? ` aria-pressed="${o.pressed ? 'true' : 'false'}"` : ''}${o.dis ? ' disabled' : ''}${o.aria ? ` aria-label="${esc(o.aria)}"` : ''}>${label}</button>`;
  };
  // The question block (target "answer").
  function qHTML(cfg, api, st) {
    if (!cfg) return '';
    const opts = cfg.options.map((o, i) => `<button type="button" class="ar-btn ar-opt ${st.sel === i ? (st.done ? 'right' : 'wrong') : ''}" data-act="ans" data-arg="${i}" data-fk="ans${i}"${st.done ? ' disabled' : ''}>${esc(api.t(o))}</button>`).join('');
    let fb = '';
    if (st.done) fb = api.t(T2('Right! ', 'सही! ')) + (cfg.why ? api.t(cfg.why) : '');
    else if (st.sel != null) fb = api.t(T2('Not quite. Look again and try another answer.', 'ठीक नहीं। फिर से देखो और दूसरा उत्तर चुनो।'));
    return `<div class="ar-card ar-q" data-key="answer"><p class="ar-qt">${esc(api.t(cfg.q))}</p><div class="ar-opts">${opts}</div><div class="ar-qf">${esc(fb)}</div></div>`;
  }
  function qAnswer(cfg, api, st, i) {
    if (st.done || !cfg) return false;
    st.sel = i;
    if (i === cfg.answer) { st.done = true; api.emit('answered:right'); api.record(api.t(T2('Answered the question: right', 'प्रश्न का उत्तर: सही'))); api.celebrate(); }
    else { api.emit('answered:wrong'); api.record(api.t(T2('Answered the question: wrong', 'प्रश्न का उत्तर: ग़लत'))); }
    return true;
  }
  // Click / key handling shared by every mode: [data-act] buttons, gated by their data-key.
  function wire(el, api, handlers, keyOf) {
    const on = (e) => {
      const b = e.target.closest && e.target.closest('[data-act]');
      if (!b || !el.contains(b)) return;
      const host = b.closest('[data-key]');
      const key = host ? host.getAttribute('data-key') : null;
      if (key && !api.allowed(key)) { e.preventDefault(); api.nudge(key); return; }
      const h = handlers[b.getAttribute('data-act')];
      if (h) h(b.getAttribute('data-arg'), b, e);
    };
    el.addEventListener('click', on);
    return () => el.removeEventListener('click', on);
  }
  const press = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); } };
  function svgPoint(svg, ev, w, h) {
    const r = svg.getBoundingClientRect();
    return [((ev.clientX - r.left) / r.width) * w, ((ev.clientY - r.top) / r.height) * h];
  }

  // ------------------------------------------------------------------------------------------------ mode: mix
  const KIND_NOTE = (id) => {
    if (['orange', 'green', 'purple'].includes(id)) return T2('A secondary colour: two primary colours mixed in equal amounts.', 'द्वितीयक रंग: दो प्राथमिक रंग बराबर मात्रा में मिलाने से।');
    if (id.indexOf('-') > 0 && NAMES[id]) return T2('A tertiary colour: a primary colour with a secondary colour (2 parts to 1).', 'तृतीयक रंग: एक प्राथमिक और एक द्वितीयक रंग (2 भाग और 1 भाग)।');
    if (id === 'brown') return T2('All three primary colours together make a dull brown.', 'तीनों प्राथमिक रंग साथ मिलकर फीका भूरा बनाते हैं।');
    if (id === 'grey') return T2('White and black together make grey.', 'सफ़ेद और काला मिलकर स्लेटी बनाते हैं।');
    if (id.indexOf('light-') === 0 || id === 'pink') return T2('White makes a colour lighter. This is called a tint.', 'सफ़ेद रंग किसी रंग को हल्का करता है। इसे टिंट कहते हैं।');
    if (id.indexOf('dark-') === 0 || ['maroon', 'navy', 'olive'].includes(id)) return T2('Black makes a colour darker. This is called a shade.', 'काला रंग किसी रंग को गहरा करता है। इसे शेड कहते हैं।');
    if (id.indexOf('muted-') === 0) return T2('White and black together dull a colour down.', 'सफ़ेद और काला साथ मिलकर रंग को फीका कर देते हैं।');
    return T2('This colour is mostly one primary colour.', 'यह रंग मुख्य रूप से एक प्राथमिक रंग है।');
  };

  function mountMix(root, c, api) {
    const paints = c.paints || PAINT_IDS.slice(0, 5);
    const wheelOn = c.wheel !== false;
    const goal = c.goal || null;
    const S = { drops: (c.start || []).slice(), mixed: null, swirl: 0, dropT: 1, wheel: false, sel: null, found: [], busy: false, target: null, q: { done: false, sel: null } };
    const top = goal ? '<div class="ar-top"></div>' : '';
    const U = base(root, api, 'ar-mix', top);
    const vid = uid();
    let stops = [];
    const pName = (p) => api.t(PAINT_NAME[p]);
    const resName = (id) => api.t(nameOfId(id));
    const recipeText = (drops) => {
      const order = []; const cnt = {};
      drops.forEach((p) => { if (!cnt[p]) { cnt[p] = 0; order.push(p); } cnt[p]++; });
      return order.map((p) => (cnt[p] > 1 ? cnt[p] + ' ' : '') + pName(p).toLowerCase()).join(' + ');
    };
    const say = (t) => { U.live.textContent = t; };

    // ---- the dish (SVG)
    function dishSVG() {
      const n = S.drops.length - (S.dropT < 1 ? 1 : 0);
      const landed = S.drops.slice(0, Math.max(0, n));
      const t = S.swirl, e = ease(t);
      const CX = 210, CY = 150, DR = 82;
      let fill = '#FFFFFF';
      if (S.mixed) fill = S.mixed.hex;
      else if (S.target && t > 0) fill = mixHex('#FFFFFF', S.target.hex, ease(clamp(t * 1.4, 0, 1)));
      let blobs = '';
      const bR = n <= 1 ? 36 : n <= 3 ? 30 : 25;
      const ringR = (n <= 1 ? 0 : n <= 3 ? 32 : 42) * (1 - e);
      if (!S.mixed) {
        landed.forEach((p, i) => {
          const a = rad(-90 + (i * 360) / Math.max(1, n) + e * 720);
          const x = CX + ringR * Math.cos(a), y = CY + ringR * Math.sin(a);
          const op = 1 - Math.pow(e, 2.2);
          blobs += `<g opacity="${f1(op * 100) / 100}"><ellipse cx="${f1(x)}" cy="${f1(y + 4)}" rx="${bR}" ry="${bR * 0.9}" fill="rgba(0,0,0,.14)"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${bR}" fill="${PAINT_HEX[p]}"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${bR}" fill="url(#${vid}hl)"/></g>`;
        });
      }
      let swirl = '';
      if (t > 0 && S.target) {
        landed.forEach((p, i) => {
          const a0 = e * 720 + (i * 360) / landed.length;
          let d = '';
          for (let k = 0; k <= 24; k++) { const u = k / 24; const a = rad(a0 + u * 300); const r = 8 + u * 58 * (1 - 0.3 * e); d += (k ? 'L' : 'M') + f1(CX + r * Math.cos(a)) + ' ' + f1(CY + r * Math.sin(a)); }
          swirl += `<path d="${d}" fill="none" stroke="${PAINT_HEX[p]}" stroke-width="9" stroke-linecap="round" opacity="${f1(0.9 * (1 - e) * 100) / 100}"/>`;
        });
      }
      // the brush
      const ba = rad(e * 720 - 30);
      const bx = S.busy ? CX + 30 * Math.cos(ba) : 312, by = S.busy ? CY + 30 * Math.sin(ba) : 236;
      const tipCol = S.busy && S.target ? mixHex(PAINT_HEX[landed[0] || 'white'], S.target.hex, e) : S.mixed ? S.mixed.hex : '#B8B2A6';
      const brush = `<g><line x1="${f1(bx + 14)}" y1="${f1(by - 16)}" x2="${f1(bx + 86)}" y2="${f1(by - 100)}" stroke="#C48A4A" stroke-width="10" stroke-linecap="round"/><line x1="${f1(bx + 10)}" y1="${f1(by - 12)}" x2="${f1(bx + 34)}" y2="${f1(by - 40)}" stroke="#9AA3AE" stroke-width="12" stroke-linecap="round"/><path d="M${f1(bx + 8)} ${f1(by - 10)} Q${f1(bx - 8)} ${f1(by + 2)} ${f1(bx - 6)} ${f1(by + 8)} Q${f1(bx + 6)} ${f1(by + 6)} ${f1(bx + 14)} ${f1(by - 12)}Z" fill="${tipCol}" stroke="rgba(0,0,0,.25)" stroke-width="1"/></g>`;
      // decorative dabs on the palette rim
      const dabs = paints.map((p, i) => { const a = rad(200 + (i * 140) / Math.max(1, paints.length - 1)); return `<circle cx="${f1(210 + 188 * Math.cos(a))}" cy="${f1(150 + 118 * Math.sin(a))}" r="9" fill="${PAINT_HEX[p]}" stroke="rgba(0,0,0,.18)" stroke-width="1"/>`; }).join('');
      // falling drop
      let drop = '';
      if (S.dropT < 1 && S.drops.length) {
        const p = S.drops[S.drops.length - 1]; const y = lerp(-20, CY - 6, ease(S.dropT));
        drop = `<path d="M${CX} ${f1(y - 22)} C${CX + 16} ${f1(y)} ${CX + 14} ${f1(y + 16)} ${CX} ${f1(y + 16)} C${CX - 14} ${f1(y + 16)} ${CX - 16} ${f1(y)} ${CX} ${f1(y - 22)}Z" fill="${PAINT_HEX[p]}" stroke="rgba(0,0,0,.2)"/>`;
      }
      return `<svg class="ar-svg" viewBox="0 0 420 300" role="button" tabindex="0" data-key="canvas" data-fk="dish" aria-label="${esc(api.t(T2('Mixing dish. Press to stir the paints.', 'मिलाने की कटोरी। रंग मिलाने के लिए दबाओ।')))}">
<defs><linearGradient id="${vid}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE9C7"/><stop offset="1" stop-color="#F7C98B"/></linearGradient>
<radialGradient id="${vid}hl" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></radialGradient>
<radialGradient id="${vid}well" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#E8E3D8"/></radialGradient></defs>
<rect width="420" height="300" fill="url(#${vid}bg)"/>
<ellipse cx="214" cy="262" rx="196" ry="22" fill="rgba(80,40,0,.18)"/>
<path d="M210 24 C330 22 404 80 400 150 C396 224 322 262 218 262 C120 262 30 236 22 160 C14 80 96 26 210 24Z" fill="#FBF3E2" stroke="#E2CFA6" stroke-width="3"/>
<ellipse cx="82" cy="206" rx="19" ry="15" fill="#F1BE7E" stroke="#E2CFA6" stroke-width="3"/>${dabs}
<circle cx="${CX}" cy="${CY + 5}" r="${DR + 4}" fill="rgba(0,0,0,.14)"/>
<circle cx="${CX}" cy="${CY}" r="${DR}" fill="url(#${vid}well)" stroke="#CFC8B6" stroke-width="5"/>
<circle cx="${CX}" cy="${CY}" r="${DR - 8}" fill="${fill}" stroke="rgba(0,0,0,.12)" stroke-width="1.5"/>
${S.mixed ? `<circle cx="${CX}" cy="${CY}" r="${DR - 8}" fill="url(#${vid}hl)"/>` : ''}
${blobs}${swirl}${drop}${brush}
${!S.drops.length ? `<text x="${CX}" y="${CY + 6}" text-anchor="middle" font-size="16" font-weight="600" fill="#8A8372" font-family="var(--font-body,sans-serif)">${esc(api.t(T2('Add paint', 'रंग डालो')))}</text>` : ''}
</svg>`;
    }
    function drawStage() { U.stage.innerHTML = dishSVG(); }

    // ---- the wheel
    function wheelSVG() {
      const CX = 120, CY = 120, R = 112, r = 44;
      const pt = (rr, a) => [CX + rr * Math.sin(rad(a)), CY - rr * Math.cos(rad(a))];
      const sel = S.sel;
      let g = '';
      WHEEL.forEach((w, i) => {
        const a0 = i * 30 - 15, a1 = i * 30 + 15;
        const [x0, y0] = pt(R, a0), [x1, y1] = pt(R, a1), [x2, y2] = pt(r, a1), [x3, y3] = pt(r, a0);
        const isSel = sel === i, isOpp = sel != null && (sel + 6) % 12 === i;
        const [mx, my] = pt((R + r) / 2, i * 30);
        g += `<g class="ar-wedge" role="button" tabindex="0" data-wi="${i}" data-fk="wedge${i}" aria-label="${esc(resName(w.id))}" aria-pressed="${isSel}"><path d="M${f1(x0)} ${f1(y0)} A${R} ${R} 0 0 1 ${f1(x1)} ${f1(y1)} L${f1(x2)} ${f1(y2)} A${r} ${r} 0 0 0 ${f1(x3)} ${f1(y3)}Z" fill="${w.hex}" stroke="${isSel ? '#061233' : '#fff'}" stroke-width="${isSel ? 4 : 2}"/>${isOpp ? `<circle cx="${f1(mx)}" cy="${f1(my)}" r="7" fill="#fff" stroke="#061233" stroke-width="2.5"/>` : ''}${WHEEL_KIND(i) === 'primary' ? `<circle cx="${f1(mx)}" cy="${f1(my)}" r="4" fill="rgba(255,255,255,.9)"/>` : ''}</g>`;
      });
      const mid = sel != null ? `<circle cx="${CX}" cy="${CY}" r="${r - 6}" fill="${WHEEL[sel].hex}" stroke="#fff" stroke-width="3"/>` : `<circle cx="${CX}" cy="${CY}" r="${r - 6}" fill="#fff" stroke="#E2E8F0" stroke-width="2"/><text x="${CX}" y="${CY + 5}" text-anchor="middle" font-size="14" fill="#64748B" font-weight="600" font-family="var(--font-body,sans-serif)">${esc(api.t(T2('Tap', 'छुओ')))}</text>`;
      return `<svg viewBox="0 0 240 240" style="width:100%;max-width:260px;display:block;margin:0 auto" role="group" aria-label="${esc(api.t(T2('Colour wheel with 12 colours', '12 रंगों वाला रंग-चक्र')))}">${g}${mid}</svg>`;
    }
    function wheelInfo() {
      if (S.sel == null) return api.t(T2('Tap a colour on the wheel to see how it is made.', 'कोई रंग छुओ और देखो वह कैसे बनता है।'));
      const w = WHEEL[S.sel], kind = WHEEL_KIND(S.sel), opp = WHEEL[(S.sel + 6) % 12];
      let how;
      if (kind === 'primary') how = api.t(T2('A primary colour: it cannot be made by mixing other colours.', 'प्राथमिक रंग: इसे दूसरे रंग मिलाकर नहीं बनाया जा सकता।'));
      else {
        const [a, b] = RECIPE_TXT[w.id];
        how = (kind === 'secondary' ? api.t(T2('Secondary: ', 'द्वितीयक: ')) : api.t(T2('Tertiary: ', 'तृतीयक: '))) + resName(a) + ' + ' + resName(b) + '.';
      }
      return `${cap(resName(w.id))}. ${how} ${api.t(T2('Opposite on the wheel: ', 'चक्र में सामने का रंग: '))}${resName(opp.id)} ${api.t(T2('(complementary colours).', '(पूरक रंग)।'))}`;
    }

    // ---- the panel
    function panelHTML() {
      const full = S.drops.length >= MAX_DROPS;
      const pb = paints.map((p) => `<button type="button" class="ar-btn ar-paint" data-key="colour:${p}" data-fk="colour:${p}" data-act="add" data-arg="${p}"${full || S.busy ? ' aria-disabled="true"' : ''}>${sw(PAINT_HEX[p])}<span>${esc(pName(p))}</span></button>`).join('');
      const chips = S.drops.map((p) => `<span class="ar-chip">${sw(PAINT_HEX[p])}${esc(pName(p))}</span>`).join('<span class="op" aria-hidden="true">+</span>');
      const res = S.mixed
        ? `<div class="ar-result">${sw(S.mixed.hex)}<span>${esc(cap(resName(S.mixed.id)))}</span></div><p class="ar-note">${esc(api.t(KIND_NOTE(S.mixed.id)))}</p>`
        : `<p class="ar-note">${esc(api.t(S.drops.length < 2 ? T2('Tap two or more paints to put drops in the dish.', 'कटोरी में बूँदें डालने के लिए दो या अधिक रंग छुओ।') : T2('Now press Mix.', 'अब मिलाओ दबाओ।')))}</p>`;
      const tools = btn('tool:mix', 'mix', esc(api.t(T2('Mix', 'मिलाओ'))), { cls: 'pri', dis: S.busy })
        + btn('tool:undo', 'undo', esc(api.t(T2('Take one back', 'एक वापस'))), { dis: !S.drops.length || S.busy })
        + btn('tool:clear', 'clear', esc(api.t(T2('Clear dish', 'कटोरी साफ़'))), { dis: !S.drops.length || S.busy })
        + (wheelOn ? btn('tool:wheel', 'wheel', esc(api.t(T2('Colour wheel', 'रंग-चक्र'))), { pressed: S.wheel }) : '');
      const wheel = wheelOn && S.wheel ? `<div class="ar-card" data-key="tool:wheel-card"><h3 class="ar-h">${esc(api.t(T2('The colour wheel', 'रंग-चक्र')))}</h3>${wheelSVG()}<p class="ar-note" style="margin-top:8px">${esc(wheelInfo())}</p></div>` : '';
      const found = S.found.length ? `<div class="ar-card"><h3 class="ar-h">${esc(api.t(T2('Colours you made', 'तुमने ये रंग बनाए')))} (${S.found.length})</h3><div class="ar-chips">${S.found.map((f) => `<span class="ar-chip">${sw(f.hex)}${esc(resName(f.id))}</span>`).join('')}</div></div>` : '';
      return `<div class="ar-card"><h3 class="ar-h">${esc(api.t(T2('Paints', 'रंग')))}</h3><div class="ar-paints">${pb}</div></div>
<div class="ar-card"><h3 class="ar-h">${esc(api.t(T2('In the dish', 'कटोरी में')))}</h3><div class="ar-recipe">${chips || `<span class="ar-note">${esc(api.t(T2('Empty', 'ख़ाली')))}</span>`}</div>${res}<div class="ar-row" style="margin-top:8px">${tools}</div></div>${wheel}${found}${qHTML(c.question, api, S.q)}`;
    }
    function render() {
      setHTML(U.panel, panelHTML());
      if (goal && U.top) U.top.innerHTML = `<div class="ar-goal">${sw(colourOf(goalVec(goal)))}<span>${esc(api.t(T2('Make this colour: ', 'यह रंग बनाओ: ')))}${esc(resName(goal))}</span></div>`;
    }
    const goalVec = (id) => {
      // any recipe that gives the goal (first found by search), only to show a sample swatch
      let best = null;
      const rec = (start, drops) => {
        if (best) return;
        if (drops.length >= 2 && new Set(drops).size >= 2 && classify(vecOf(drops)) === id) { best = drops; return; }
        if (drops.length === MAX_DROPS) return;
        for (let i = start; i < paints.length; i++) rec(i, drops.concat(paints[i]));
      };
      rec(0, []);
      return vecOf(best || []);
    };

    // ---- actions
    function afterChange() { S.mixed = null; S.target = null; render(); drawStage(); }
    function addDrop(p) {
      if (S.busy) return;
      if (S.drops.length >= MAX_DROPS) { api.toast(T2('The dish is full. Mix, or take one back.', 'कटोरी भर गई है। मिलाओ, या एक वापस लो।')); return; }
      S.drops.push(p); S.mixed = null; S.target = null; S.dropT = 0;
      api.record(api.t(T2('Put a drop of ', 'कटोरी में बूँद डाली: ')) + pName(p).toLowerCase());
      render();
      stops.push(tween(460, (k) => { S.dropT = k; drawStage(); }, () => { S.dropT = 1; drawStage(); say(pName(p) + ' — ' + S.drops.length + (S.drops.length === 1 ? api.t(T2(' drop in the dish.', ' बूँद कटोरी में।')) : api.t(T2(' drops in the dish.', ' बूँदें कटोरी में।')))); }));
    }
    function doMix() {
      if (S.busy) return;
      if (S.drops.length < 2 || new Set(S.drops).size < 2) { api.toast(T2('Put in two different paints first.', 'पहले दो अलग रंग डालो।')); return; }
      const v = vecOf(S.drops), id = classify(v), hex = colourOf(v);
      S.busy = true; S.target = { id, hex, v }; S.mixed = null;
      render();
      stops.push(tween(1500, (k) => { S.swirl = k; drawStage(); }, () => {
        S.busy = false; S.swirl = 0; S.mixed = S.target;
        if (!S.found.some((f) => f.id === id)) S.found.push({ id, hex });
        const txt = recipeText(S.drops) + ' = ' + resName(id);
        api.record(txt);
        say(txt + '. ' + api.t(KIND_NOTE(id)));
        render(); drawStage();
        api.emit('mixed:' + id);
        if (goal) {
          if (id === goal) { api.emit('answered:right'); api.celebrate(); }
          else { api.emit('answered:wrong'); api.toast(T2('That made ' + resName(id) + '. Try again.', 'इससे ' + resName(id) + ' बना। फिर कोशिश करो।')); }
        }
      }));
    }
    const off = wire(U.el, api, {
      add: (p) => addDrop(p),
      mix: () => doMix(),
      undo: () => { if (S.busy || !S.drops.length) return; S.drops.pop(); afterChange(); say(''); },
      clear: () => { if (S.busy) return; S.drops = []; afterChange(); say(''); },
      wheel: () => { S.wheel = !S.wheel; if (S.wheel) api.emit('wheel:open'); render(); },
      ans: (i) => { if (qAnswer(c.question, api, S.q, +i)) render(); },
    });
    // dish (canvas) and wheel wedges
    const onStage = (e) => {
      const s = e.target.closest && e.target.closest('svg[data-key="canvas"]');
      if (!s) return;
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (!api.allowed('canvas')) { api.nudge('canvas'); return; }
      doMix();
    };
    U.stage.addEventListener('click', onStage); U.stage.addEventListener('keydown', onStage);
    const onWheel = (e) => {
      const w = e.target.closest && e.target.closest('.ar-wedge');
      if (!w) return;
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      S.sel = +w.getAttribute('data-wi'); render();
      const n = U.panel.querySelector('[data-fk="wedge' + S.sel + '"]'); if (n) n.focus({ preventScroll: true });
    };
    U.panel.addEventListener('click', onWheel); U.panel.addEventListener('keydown', onWheel);
    drawStage(); render();
    return { destroy() { stops.forEach((s) => s()); off(); U.stage.removeEventListener('click', onStage); U.stage.removeEventListener('keydown', onStage); U.panel.removeEventListener('click', onWheel); U.panel.removeEventListener('keydown', onWheel); root.innerHTML = ''; } };
  }

  // ------------------------------------------------------------------------------------------------ mode: rangoli
  const mapPt = (m, i, j) => [m[0] * i + m[1] * j, m[2] * i + m[3] * j];
  const iconSVG = {
    line: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20 L20 4" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><circle cx="4" cy="20" r="2.6" fill="currentColor"/><circle cx="20" cy="4" r="2.6" fill="currentColor"/></svg>',
    dot: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="currentColor"/></svg>',
    petal: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12 C8 3 16 3 21 12 C16 21 8 21 3 12Z" fill="currentColor"/></svg>',
    flower: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor">' + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<ellipse cx="12" cy="5.5" rx="2.6" ry="4.6" transform="rotate(${a} 12 12)"/>`).join('') + '</g></svg>',
    erase: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15 L13 5 L20 11 L13 20 L8 20Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M9 11 L16 17" stroke="currentColor" stroke-width="2.4"/></svg>',
  };

  function rangoliSample(h, pal) {
    const c = (k) => pal[k % pal.length];
    const a = Math.min(h, 4), it = [];
    it.push({ t: 'flower', i: 0, j: 0, c: c(4) });
    it.push({ t: 'petal', i: 1, j: 0, c: c(1) }, { t: 'petal', i: 0, j: 1, c: c(1) });
    if (h >= 2) {
      it.push({ t: 'line', i: 1, j: 1, i2: 2, j2: 0, c: c(0) }, { t: 'line', i: 1, j: 1, i2: 0, j2: 2, c: c(0) });
      it.push({ t: 'dot', i: 2, j: 2, c: c(2) });
      it.push({ t: 'petal', i: 2, j: 0, c: c(5) }, { t: 'petal', i: 0, j: 2, c: c(5) });
    }
    if (h >= 3) {
      it.push({ t: 'line', i: 2, j: 2, i2: 3, j2: 3, c: c(3) });
      it.push({ t: 'flower', i: 3, j: 1, c: c(0) }, { t: 'flower', i: 1, j: 3, c: c(0) });
      it.push({ t: 'dot', i: 3, j: 0, c: c(2) }, { t: 'dot', i: 0, j: 3, c: c(2) });
    }
    if (h >= 4) {
      it.push({ t: 'line', i: 3, j: 3, i2: 4, j2: 4, c: c(1) }, { t: 'petal', i: 4, j: 2, c: c(3) }, { t: 'petal', i: 2, j: 4, c: c(3) });
      it.push({ t: 'dot', i: a, j: 0, c: c(2) }, { t: 'dot', i: 0, j: a, c: c(2) });
      it.push({ t: 'flower', i: 4, j: 4, c: c(5) });
    }
    if (h >= 5) it.push({ t: 'line', i: 4, j: 4, i2: 5, j2: 5, c: c(4) }, { t: 'dot', i: 5, j: 3, c: c(2) }, { t: 'dot', i: 3, j: 5, c: c(2) });
    return it;
  }

  function mountRangoli(root, c, api) {
    const n = c.grid || 7, h = (n - 1) / 2, sp = 300 / (n - 1), CX = 200;
    const pal = c.palette || RPAL;
    const S = { sym: c.symmetry || 'quad', tool: 'line', colour: pal[0], items: c.sample ? rangoliSample(h, pal.map((p) => p)) : [], hist: [], start: null, cur: [0, 0], focus: false, newest: -1, q: { done: false, sel: null } };
    // a palette smaller than the sample's colour list still works: sample uses pal indices modulo length
    const U = base(root, api, 'ar-rg');
    const vid = uid();
    const P = (i, j) => [CX + i * sp, CX + j * sp];
    const hexOfC = (id) => RCLR[id] || '#FFFFFF';
    const clrName = (id) => api.t(CLR[id] ? CLR[id].n : T2(id, id));
    const imgs = (it) => {
      const seen = new Set(), out = [];
      RSYM[S.sym].m.forEach((m) => {
        const a = mapPt(m, it.i, it.j);
        const b = it.t === 'line' ? mapPt(m, it.i2, it.j2) : null;
        let dir = null;
        if (it.t === 'petal') { const d = it.i === 0 && it.j === 0 ? [0, -1] : [it.i, it.j]; dir = mapPt(m, d[0], d[1]); }
        const k = it.t === 'line' ? [a, b].sort((p, q) => p[0] - q[0] || p[1] - q[1]).join('|') : it.t === 'petal' ? a.join(',') + '>' + dir.join(',') : a.join(',');
        if (!seen.has(k)) { seen.add(k); out.push({ a, b, dir }); }
      });
      return out;
    };
    const itemSVG = (it, idx) => {
      const col = hexOfC(it.c);
      const cls = idx === S.newest ? ' class="ar-pop"' : '';
      const lite = mixHex(col, '#FFFFFF', 0.45);
      return `<g${cls}>` + imgs(it).map((im) => {
        const [x, y] = P(im.a[0], im.a[1]);
        if (it.t === 'dot') return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(sp * 0.27)}" fill="${col}"/><circle cx="${f1(x - sp * 0.07)}" cy="${f1(y - sp * 0.08)}" r="${f1(sp * 0.1)}" fill="${lite}" opacity=".7"/>`;
        if (it.t === 'line') { const [x2, y2] = P(im.b[0], im.b[1]); return `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${col}" stroke-width="${f1(sp * 0.22)}" stroke-linecap="round"/><line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${lite}" stroke-width="${f1(sp * 0.07)}" stroke-linecap="round" opacity=".6"/>`; }
        if (it.t === 'petal') {
          const ang = (Math.atan2(im.dir[1], im.dir[0]) * 180) / Math.PI, Ln = sp * 0.98, w = sp * 0.34;
          return `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(ang)})"><path d="M0 0 C${f1(Ln * 0.28)} ${f1(-w)} ${f1(Ln * 0.78)} ${f1(-w)} ${f1(Ln)} 0 C${f1(Ln * 0.78)} ${f1(w)} ${f1(Ln * 0.28)} ${f1(w)} 0 0Z" fill="${col}"/><path d="M${f1(Ln * 0.12)} 0 L${f1(Ln * 0.82)} 0" stroke="${lite}" stroke-width="${f1(sp * 0.05)}" stroke-linecap="round" opacity=".7"/></g>`;
        }
        // flower: 8 petals and a centre
        const pe = [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<ellipse cx="0" cy="${f1(-sp * 0.34)}" rx="${f1(sp * 0.13)}" ry="${f1(sp * 0.25)}" transform="rotate(${a})" fill="${col}"/>`).join('');
        return `<g transform="translate(${f1(x)} ${f1(y)})">${pe}<circle r="${f1(sp * 0.14)}" fill="${it.c === 'yellow' ? '#FF7A1A' : '#FFD23F'}"/></g>`;
      }).join('') + '</g>';
    };
    function stageSVG() {
      const dots = [];
      for (let j = -h; j <= h; j++) for (let i = -h; i <= h; i++) { const [x, y] = P(i, j); dots.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${i === 0 && j === 0 ? 3.6 : 2.6}" fill="#FFFFFF" opacity=".75"/>`); }
      const s = S.sym, g = [];
      if (s === 'mirror' || s === 'quad' || s === 'full') g.push(`<line x1="200" y1="14" x2="200" y2="386" />`);
      if (s === 'quad' || s === 'full') g.push(`<line x1="14" y1="200" x2="386" y2="200" />`);
      if (s === 'full') g.push(`<line x1="40" y1="40" x2="360" y2="360" /><line x1="360" y1="40" x2="40" y2="360" />`);
      let rot = '';
      if (s === 'rot4') rot = `<circle cx="200" cy="200" r="16" fill="none" stroke="#FFD23F" stroke-width="2" stroke-dasharray="3 5"/>`;
      const startRing = S.start ? (() => { const [x, y] = P(S.start[0], S.start[1]); return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(sp * 0.4)}" fill="none" stroke="#FFD23F" stroke-width="3"/>`; })() : '';
      const curRing = S.focus ? (() => { const [x, y] = P(S.cur[0], S.cur[1]); return `<rect x="${f1(x - sp * 0.42)}" y="${f1(y - sp * 0.42)}" width="${f1(sp * 0.84)}" height="${f1(sp * 0.84)}" rx="6" fill="none" stroke="#02CFF9" stroke-width="3"/>`; })() : '';
      return `<svg class="ar-svg" viewBox="0 0 400 400" tabindex="0" role="application" data-key="canvas" data-fk="canvas" style="touch-action:none;cursor:crosshair" aria-label="${esc(api.t(T2('Rangoli floor with a grid of dots. Use the arrow keys to move and Enter to place.', 'बिंदुओं की ग्रिड वाला रंगोली का फ़र्श। चलने के लिए तीर कुंजियाँ और रखने के लिए Enter दबाओ।')))}">
<defs><radialGradient id="${vid}f" cx=".5" cy=".45" r=".75"><stop offset="0" stop-color="#4A2433"/><stop offset="1" stop-color="#1F1020"/></radialGradient></defs>
<rect width="400" height="400" fill="url(#${vid}f)"/>
<rect x="8" y="8" width="384" height="384" rx="16" fill="none" stroke="#F5B90A" stroke-width="3" opacity=".55"/>
<rect x="15" y="15" width="370" height="370" rx="11" fill="none" stroke="#FF7A1A" stroke-width="1.2" stroke-dasharray="2 6" opacity=".7"/>
<g stroke="#02CFF9" stroke-width="1.5" stroke-dasharray="6 6" opacity=".5">${g.join('')}</g>${rot}
${dots.join('')}${S.items.map(itemSVG).join('')}${startRing}${curRing}</svg>`;
    }
    function drawStage() { U.stage.innerHTML = stageSVG(); }
    function panelHTML() {
      const tools = RTOOLS.map((tk) => btn('tool:' + tk, 'tool', iconSVG[tk] + `<span>${esc(api.t(RTOOL_N[tk]))}</span>`, { arg: tk, pressed: S.tool === tk })).join('');
      const cols = pal.map((p) => `<button type="button" class="ar-btn" data-key="colour:${p}" data-fk="colour:${p}" data-act="colour" data-arg="${p}" aria-pressed="${S.colour === p}" aria-label="${esc(clrName(p))}" style="padding:4px;border-radius:50%;width:48px;height:48px">${sw(hexOfC(p))}</button>`).join('');
      const sy = RSYM[S.sym];
      const symCard = `<div class="ar-card"><h3 class="ar-h">${esc(api.t(T2('Symmetry', 'सममिति')))}: ${esc(api.t(sy.n))}</h3><div class="ar-badges"><span class="ar-badge">${esc(api.t(T2('Mirror lines: ', 'दर्पण-रेखाएँ: ')))}${sy.lines}</span><span class="ar-badge">${esc(api.t(T2('Order of turning: ', 'घुमाव का क्रम: ')))}${sy.order}</span></div><p class="ar-note" style="margin:8px 0">${esc(api.t(sy.order > 1 ? T2('Turn the pattern by ' + 360 / sy.order + ' degrees and it looks the same.', 'नमूने को ' + 360 / sy.order + ' अंश घुमाओ तो वह वैसा ही दिखता है।') : T2('A full turn of 360 degrees is the only turn that brings it back.', 'केवल 360 अंश का पूरा घुमाव ही उसे वैसा लाता है।')))}</p>${c.fixed ? '' : btn('tool:symmetry', 'sym', esc(api.t(T2('Change symmetry', 'सममिति बदलो'))))}</div>`;
      return `<div class="ar-card"><h3 class="ar-h">${esc(api.t(T2('Tools', 'औज़ार')))}</h3><div class="ar-row">${tools}</div><p class="ar-note" style="margin-top:8px">${esc(api.t(S.tool === 'line' ? T2('Tap one dot, then another dot in a straight or diagonal line.', 'एक बिंदु छुओ, फिर सीधी या तिरछी रेखा में दूसरा बिंदु।') : S.tool === 'erase' ? T2('Tap a dot to rub out what touches it.', 'किसी बिंदु को छुओ, उससे जुड़ा सब मिट जाएगा।') : T2('Tap a dot to place it. The pattern repeats by itself.', 'किसी बिंदु को छुओ। नमूना अपने-आप दोहरता है।')))}</p></div>
<div class="ar-card"><h3 class="ar-h">${esc(api.t(T2('Powder colour', 'रंग')))}</h3><div class="ar-row">${cols}</div></div>${symCard}
<div class="ar-row">${btn('tool:undo', 'undo', esc(api.t(T2('Undo', 'पीछे'))), { dis: !S.hist.length })}${btn('tool:clear', 'clear', esc(api.t(T2('Clear floor', 'फ़र्श साफ़'))), { dis: !S.items.length })}</div>${qHTML(c.question, api, S.q)}`;
    }
    function render() { setHTML(U.panel, panelHTML()); }
    const say = (t) => { U.live.textContent = t; };
    function snap() { S.hist.push(JSON.stringify(S.items)); if (S.hist.length > 60) S.hist.shift(); }
    function added(it, what) {
      const k = imgs(it).length;
      api.record(api.t(T2('Rangoli: placed a ' + what, 'रंगोली: ' + what + ' रखा')));
      say(api.t(T2('Placed. It repeats ' + k + (k === 1 ? ' time.' : ' times.'), 'रखा गया। यह ' + k + ' बार दोहरता है।')));
      api.emit('drawn');
    }
    function applyAt(i, j) {
      if (!api.allowed('canvas')) { api.nudge('canvas'); return; }
      const tool = S.tool;
      if (tool === 'erase') {
        const before = S.items.length;
        const keep = S.items.filter((it) => !((it.i === i && it.j === j) || (it.t === 'line' && it.i2 === i && it.j2 === j)));
        if (keep.length !== before) { snap(); S.items = keep; S.newest = -1; say(api.t(T2('Rubbed out.', 'मिटा दिया।'))); drawStage(); render(); }
        return;
      }
      if (tool === 'line') {
        if (!S.start) { S.start = [i, j]; drawStage(); say(api.t(T2('Start dot chosen. Tap the end dot.', 'शुरू का बिंदु चुना। अंतिम बिंदु छुओ।'))); return; }
        const [a, b] = S.start, dx = i - a, dy = j - b;
        if (!dx && !dy) { S.start = null; drawStage(); return; }
        if (dx && dy && Math.abs(dx) !== Math.abs(dy)) { api.toast(T2('Pick a dot in a straight or diagonal line.', 'सीधी या तिरछी रेखा में बिंदु चुनो।')); return; }
        snap();
        S.items = S.items.filter((it) => !(it.t === 'line' && ((it.i === a && it.j === b && it.i2 === i && it.j2 === j) || (it.i === i && it.j === j && it.i2 === a && it.j2 === b))));
        const it = { t: 'line', i: a, j: b, i2: i, j2: j, c: S.colour };
        S.items.push(it); S.newest = S.items.length - 1; S.start = null; drawStage(); render(); added(it, api.t(T2('line', 'रेखा')));
        return;
      }
      snap();
      S.items = S.items.filter((it) => !(it.t === tool && it.i === i && it.j === j));
      const it = { t: tool, i, j, c: S.colour };
      S.items.push(it); S.newest = S.items.length - 1; drawStage(); render(); added(it, api.t(RTOOL_N[tool]).toLowerCase());
    }
    const nearDot = (ev) => {
      const svg = U.stage.querySelector('svg');
      const [x, y] = svgPoint(svg, ev, 400, 400);
      const i = clamp(Math.round((x - CX) / sp), -h, h), j = clamp(Math.round((y - CX) / sp), -h, h);
      const [px, py] = P(i, j);
      return Math.hypot(x - px, y - py) <= sp * 0.62 ? [i, j] : null;
    };
    const onDown = (ev) => {
      if (!ev.target.closest('svg')) return;
      const d = nearDot(ev); S.dragFrom = null;
      if (!d) return;
      ev.preventDefault();
      const first = S.tool === 'line' && !S.start;
      applyAt(d[0], d[1]);
      if (first && S.start) S.dragFrom = d;
    };
    const onUp = (ev) => {
      if (S.tool === 'line' && S.start && S.dragFrom && ev.target.closest && ev.target.closest('svg')) {
        const d = nearDot(ev);
        if (d && (d[0] !== S.dragFrom[0] || d[1] !== S.dragFrom[1])) applyAt(d[0], d[1]);
      }
      S.dragFrom = null;
    };
    const onKey = (ev) => {
      if (!ev.target.closest('svg')) return;
      const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
      if (mv) { ev.preventDefault(); S.cur = [clamp(S.cur[0] + mv[0], -h, h), clamp(S.cur[1] + mv[1], -h, h)]; drawStage(); focusSvg(); say(api.t(T2('Dot ' + (S.cur[0] + h + 1) + ' across, ' + (S.cur[1] + h + 1) + ' down', 'बिंदु: ' + (S.cur[0] + h + 1) + ' आड़े, ' + (S.cur[1] + h + 1) + ' खड़े'))); }
      else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); applyAt(S.cur[0], S.cur[1]); focusSvg(); }
      else if (ev.key === 'Escape') { S.start = null; drawStage(); focusSvg(); }
    };
    const focusSvg = () => { const s = U.stage.querySelector('svg'); if (s) s.focus({ preventScroll: true }); };
    const onFocus = (ev) => { if (!S.focus && ev.target.matches && ev.target.matches(':focus-visible')) { S.focus = true; drawStage(); focusSvg(); } };
    const onBlur = () => { setTimeout(() => { if (!U.stage.contains(document.activeElement)) { S.focus = false; drawStage(); } }, 0); };
    U.stage.addEventListener('pointerdown', onDown); U.stage.addEventListener('pointerup', onUp); U.stage.addEventListener('keydown', onKey);
    U.stage.addEventListener('focusin', onFocus); U.stage.addEventListener('focusout', onBlur);
    const off = wire(U.el, api, {
      tool: (tk) => { S.tool = tk; S.start = null; drawStage(); render(); },
      colour: (p) => { S.colour = p; render(); say(clrName(p)); },
      sym: () => { const k = RSYM_IDS.indexOf(S.sym); S.sym = RSYM_IDS[(k + 1) % RSYM_IDS.length]; drawStage(); render(); say(api.t(RSYM[S.sym].n)); },
      undo: () => { if (!S.hist.length) return; S.items = JSON.parse(S.hist.pop()); S.newest = -1; drawStage(); render(); },
      clear: () => { if (!S.items.length) return; snap(); S.items = []; S.start = null; S.newest = -1; drawStage(); render(); },
      ans: (i) => { if (qAnswer(c.question, api, S.q, +i)) render(); },
    });
    drawStage(); render();
    return { destroy() { off(); U.stage.removeEventListener('pointerdown', onDown); U.stage.removeEventListener('pointerup', onUp); U.stage.removeEventListener('keydown', onKey); U.stage.removeEventListener('focusin', onFocus); U.stage.removeEventListener('focusout', onBlur); root.innerHTML = ''; } };
  }

  // ------------------------------------------------------------------------------------------------ mode: symmetry (freehand pad)
  function mountPad(root, c, api) {
    const pal = c.palette || SYM_PAL;
    const S = { fold: c.fold || 6, mirror: c.mirror != null ? c.mirror : true, colour: pal[0], strokes: [], cur: [0, -70], pen: false, drawing: null, focus: false, q: { done: false, sel: null } };
    if (c.sample) {
      const wave = []; for (let k = 0; k <= 40; k++) { const u = k / 40, r = 18 + 140 * u, a = 0.42 * Math.sin(u * Math.PI * 3); wave.push([r * Math.sin(a), -r * Math.cos(a)]); }
      const loop = []; for (let k = 0; k <= 36; k++) { const a = (k / 36) * TAU; loop.push([26 * Math.sin(a), -104 + 26 * Math.cos(a)]); }
      const zig = []; for (let k = 0; k <= 12; k++) zig.push([(k % 2 ? 14 : -6) + 0, -(60 + k * 6)]);
      S.strokes.push({ c: pal[0 % pal.length], pts: wave }, { c: pal[1 % pal.length], pts: loop }, { c: pal[3 % pal.length], pts: zig });
    }
    const U = base(root, api, 'ar-pad');
    const vid = uid();
    const hexOfC = (id) => RCLR[id] || '#FFFFFF';
    const clrName = (id) => api.t(CLR[id] ? CLR[id].n : T2(id, id));
    const say = (t) => { U.live.textContent = t; };
    const pathD = (pts) => (pts.length === 1 ? `M${f1(pts[0][0])} ${f1(pts[0][1])}l0.1 0` : pts.map((p, i) => (i ? 'L' : 'M') + f1(p[0]) + ' ' + f1(p[1])).join(' '));
    const transforms = () => {
      const out = [];
      for (let k = 0; k < S.fold; k++) { const a = f1((k * 360) / S.fold); out.push(`rotate(${a})`); if (S.mirror) out.push(`rotate(${a}) scale(-1 1)`); }
      return out;
    };
    function stageSVG() {
      const tr = transforms();
      const defs = S.strokes.map((s, i) => `<path id="${vid}s${i}" d="${pathD(s.pts)}" fill="none" stroke="${hexOfC(s.c)}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
      const uses = S.strokes.map((s, i) => tr.map((t) => `<use href="#${vid}s${i}" transform="${t}"/>`).join('')).join('');
      let guides = '';
      if (S.mirror) for (let k = 0; k < S.fold; k++) { const a = (k * 180) / S.fold; guides += `<line x1="0" y1="-186" x2="0" y2="186" transform="rotate(${f1(a)})"/>`; }
      else if (S.fold > 1) for (let k = 0; k < S.fold; k++) { const a = (k * 360) / S.fold; guides += `<line x1="0" y1="0" x2="0" y2="-186" transform="rotate(${f1(a)})"/>`; }
      const cur = S.focus ? `<circle cx="${S.cur[0]}" cy="${S.cur[1]}" r="9" fill="none" stroke="${S.pen ? '#FFD23F' : '#02CFF9'}" stroke-width="3"/>` : '';
      return `<svg class="ar-svg" viewBox="0 0 400 400" tabindex="0" role="application" data-key="canvas" data-fk="canvas" style="touch-action:none;cursor:crosshair" aria-label="${esc(api.t(T2('Drawing pad. Draw with a finger or mouse, or press Space to put the pen down and use the arrow keys.', 'चित्र-पट। उँगली या माउस से बनाओ, या Space से कलम रखो और तीर कुंजियाँ चलाओ।')))}">
<defs><radialGradient id="${vid}b" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#1B2C6B"/><stop offset="1" stop-color="#070B24"/></radialGradient></defs>
<rect width="400" height="400" fill="url(#${vid}b)"/>
<g transform="translate(200 200)"><circle r="190" fill="none" stroke="#8B9BFF" stroke-width="1.5" opacity=".35"/>
<g stroke="#8B9BFF" stroke-width="1.4" stroke-dasharray="5 6" opacity=".55">${guides}</g>
<defs>${defs}</defs>${uses}<circle r="3.5" fill="#fff" opacity=".8"/>${cur}</g></svg>`;
    }
    function drawStage() { U.stage.innerHTML = stageSVG(); }
    function panelHTML() {
      const cols = pal.map((p) => `<button type="button" class="ar-btn" data-key="colour:${p}" data-fk="colour:${p}" data-act="colour" data-arg="${p}" aria-pressed="${S.colour === p}" aria-label="${esc(clrName(p))}" style="padding:4px;border-radius:50%;width:48px;height:48px">${sw(hexOfC(p))}</button>`).join('');
      const lines = S.mirror ? S.fold : 0, ang = 360 / S.fold;
      const ctl = c.fixed ? '' : `<div class="ar-card"><h3 class="ar-h">${esc(api.t(T2('Make the pattern', 'नमूना बनाओ')))}</h3>
<div class="ar-row" data-key="tool:fold"><button type="button" class="ar-btn" data-act="fold-" data-fk="fold-" aria-label="${esc(api.t(T2('Fewer copies', 'कम प्रतियाँ')))}"${S.fold <= 1 ? ' disabled' : ''}>&minus;</button><strong style="min-width:92px;text-align:center">${S.fold} ${esc(api.t(T2('copies', 'प्रतियाँ')))}</strong><button type="button" class="ar-btn" data-act="fold+" data-fk="fold+" aria-label="${esc(api.t(T2('More copies', 'अधिक प्रतियाँ')))}"${S.fold >= 12 ? ' disabled' : ''}>+</button></div>
<div class="ar-row" style="margin-top:8px">${btn('tool:mirror', 'mirror', esc(api.t(T2('Mirror', 'दर्पण'))), { pressed: S.mirror })}</div></div>`;
      return `<div class="ar-card"><h3 class="ar-h">${esc(api.t(T2('Pen colour', 'कलम का रंग')))}</h3><div class="ar-row">${cols}</div><p class="ar-note" style="margin-top:8px">${esc(api.t(T2('Draw in the circle. Everything you draw is copied all around.', 'गोले में बनाओ। जो भी बनाओगे वह चारों ओर दोहराया जाएगा।')))}</p></div>${ctl}
<div class="ar-card"><h3 class="ar-h">${esc(api.t(T2('What the pattern has', 'नमूने में क्या है')))}</h3><div class="ar-badges"><span class="ar-badge">${esc(api.t(T2('Mirror lines: ', 'दर्पण-रेखाएँ: ')))}${lines}</span><span class="ar-badge">${esc(api.t(T2('Order of turning: ', 'घुमाव का क्रम: ')))}${S.fold}</span></div><p class="ar-note" style="margin-top:8px">${esc(api.t(S.fold > 1 ? T2('Turn it by ' + f1(ang) + ' degrees and it fits on itself.', 'इसे ' + f1(ang) + ' अंश घुमाओ तो यह अपने ऊपर बैठ जाता है।') : T2('With one copy only a full turn of 360 degrees brings it back.', 'एक प्रति में केवल 360 अंश का पूरा घुमाव इसे वापस लाता है।')))}</p></div>
<div class="ar-row">${btn('tool:undo', 'undo', esc(api.t(T2('Undo', 'पीछे'))), { dis: !S.strokes.length })}${btn('tool:clear', 'clear', esc(api.t(T2('Clear', 'साफ़'))), { dis: !S.strokes.length })}</div>${qHTML(c.question, api, S.q)}`;
    }
    function render() { setHTML(U.panel, panelHTML()); }
    // drawing
    const MAXS = 60;
    function begin(x, y) {
      if (!api.allowed('canvas')) { api.nudge('canvas'); return false; }
      if (S.strokes.length >= MAXS) { api.toast(T2('The pad is full. Press Undo or Clear.', 'पट भर गया है। पीछे या साफ़ दबाओ।')); return false; }
      S.drawing = { c: S.colour, pts: [[x, y]] }; S.strokes.push(S.drawing); drawStage(); return true;
    }
    function extend(x, y) {
      const d = S.drawing; if (!d) return;
      const l = d.pts[d.pts.length - 1];
      if (Math.hypot(x - l[0], y - l[1]) < 2.5) return;
      d.pts.push([x, y]);
      const p = U.stage.querySelector('#' + vid + 's' + (S.strokes.length - 1));
      if (p) p.setAttribute('d', pathD(d.pts));
    }
    function finish() {
      const d = S.drawing; S.drawing = null;
      if (!d) return;
      if (d.pts.length < 2) { S.strokes.pop(); drawStage(); return; }
      render(); api.record(api.t(T2('Drew a line on the pattern pad', 'पैटर्न-पट पर रेखा खींची')));
      say(api.t(T2('Drawn. It is copied ' + S.fold * (S.mirror ? 2 : 1) + ' times.', 'बन गया। यह ' + S.fold * (S.mirror ? 2 : 1) + ' बार दोहराया गया।')));
      api.emit('drawn');
    }
    const pt = (ev) => { const [x, y] = svgPoint(U.stage.querySelector('svg'), ev, 400, 400); return [clamp(x - 200, -188, 188), clamp(y - 200, -188, 188)]; };
    const onDown = (ev) => {
      if (!ev.target.closest('svg')) return;
      ev.preventDefault();
      const [x, y] = pt(ev);
      if (begin(x, y)) { try { U.stage.querySelector('svg').setPointerCapture(ev.pointerId); } catch (e) { /* not supported */ } }
    };
    const onMove = (ev) => { if (S.drawing && S.drawing !== 'key') { const [x, y] = pt(ev); extend(x, y); } };
    const onUp = () => { if (S.drawing && !S.pen) finish(); };
    const focusSvg = () => { const s = U.stage.querySelector('svg'); if (s) s.focus({ preventScroll: true }); };
    const onKey = (ev) => {
      if (!ev.target.closest('svg')) return;
      const st = ev.shiftKey ? 24 : 8;
      const mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[ev.key];
      if (mv) {
        ev.preventDefault();
        S.cur = [clamp(S.cur[0] + mv[0], -184, 184), clamp(S.cur[1] + mv[1], -184, 184)];
        if (S.pen) extend(S.cur[0], S.cur[1]);
        drawStage(); focusSvg();
      } else if (ev.key === ' ' || ev.key === 'Enter') {
        ev.preventDefault();
        if (!S.pen) { if (begin(S.cur[0], S.cur[1])) { S.pen = true; say(api.t(T2('Pen down. Use the arrow keys to draw.', 'कलम नीचे। बनाने के लिए तीर कुंजियाँ दबाओ।'))); } }
        else { S.pen = false; finish(); }
        drawStage(); focusSvg();
      } else if (ev.key === 'Escape' && S.pen) { S.pen = false; finish(); drawStage(); focusSvg(); }
    };
    const onFocus = (ev) => { if (!S.focus && ev.target.matches && ev.target.matches(':focus-visible')) { S.focus = true; drawStage(); focusSvg(); } };
    const onBlur = () => { setTimeout(() => { if (!U.stage.contains(document.activeElement)) { S.focus = false; if (S.pen) { S.pen = false; finish(); } drawStage(); } }, 0); };
    U.stage.addEventListener('pointerdown', onDown); U.stage.addEventListener('pointermove', onMove); U.stage.addEventListener('pointerup', onUp); U.stage.addEventListener('pointercancel', onUp);
    U.stage.addEventListener('keydown', onKey); U.stage.addEventListener('focusin', onFocus); U.stage.addEventListener('focusout', onBlur);
    const off = wire(U.el, api, {
      colour: (p) => { S.colour = p; render(); say(clrName(p)); },
      'fold-': () => { if (S.fold > 1) { S.fold--; drawStage(); render(); say(S.fold + ' ' + api.t(T2('copies', 'प्रतियाँ'))); } },
      'fold+': () => { if (S.fold < 12) { S.fold++; drawStage(); render(); say(S.fold + ' ' + api.t(T2('copies', 'प्रतियाँ'))); } },
      mirror: () => { S.mirror = !S.mirror; drawStage(); render(); },
      undo: () => { if (!S.strokes.length) return; S.strokes.pop(); drawStage(); render(); },
      clear: () => { if (!S.strokes.length) return; S.strokes = []; drawStage(); render(); },
      ans: (i) => { if (qAnswer(c.question, api, S.q, +i)) render(); },
    });
    drawStage(); render();
    return { destroy() { off(); ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'keydown', 'focusin', 'focusout'].forEach((ev, k) => U.stage.removeEventListener(ev, [onDown, onMove, onUp, onUp, onKey, onFocus, onBlur][k])); root.innerHTML = ''; } };
  }

  // ------------------------------------------------------------------------------------------------ mode: symmetry (shape explorer)
  const SC = 128, SCX = 200;
  const reflect = (p, th) => { const dx = Math.cos(rad(th)), dy = -Math.sin(rad(th)); const k = 2 * (p[0] * dx + p[1] * dy); return [k * dx - p[0], k * dy - p[1]]; };
  const rotate = (p, th) => { const co = Math.cos(rad(th)), si = Math.sin(rad(th)); return [p[0] * co - p[1] * si, p[0] * si + p[1] * co]; };
  const angDiff = (a, b) => { let d = Math.abs((((a - b) % 180) + 180) % 180); return Math.min(d, 180 - d); };
  // the line of symmetry nearest to the angle (within 3 degrees counts as on the line)
  function nearLine(sh, ang) {
    if (sh.lines === 'all') return { i: 0, d: 0 };
    let best = -1, bd = 999;
    sh.lines.forEach((l, i) => { const d = angDiff(ang, l); if (d < bd) { bd = d; best = i; } });
    return { i: best, d: bd };
  }
  const shapeSVG = (sh, f, fill, stroke, sw, extra) => {
    const tp = (p) => { const q = f ? f(p) : p; return [f1(SCX + q[0] * SC), f1(SCX + q[1] * SC)]; };
    if (sh.poly) return `<path d="${sh.poly.map((p, i) => (i ? 'L' : 'M') + tp(p).join(' ')).join('')}Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" ${extra || ''}/>`;
    return `<g stroke="${fill === 'none' ? stroke : fill}" stroke-width="${fill === 'none' ? sw : 22}" stroke-linecap="round" fill="none" ${extra || ''}>${sh.segs.map((s) => { const a = tp([s[0], s[1]]), b = tp([s[2], s[3]]); return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`; }).join('')}</g>`;
  };
  const miniShape = (id) => {
    const sh = SHAPES[id];
    const tp = (p) => [f1(p[0] * 40), f1(p[1] * 40)];
    const col = SHAPE_FILL[SHAPE_IDS.indexOf(id) % SHAPE_FILL.length];
    const inner = sh.poly ? `<path d="${sh.poly.map((p, i) => (i ? 'L' : 'M') + tp(p).join(' ')).join('')}Z" fill="${col}" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>` : `<g stroke="${col}" stroke-width="9" stroke-linecap="round">${sh.segs.map((s) => `<line x1="${s[0] * 40}" y1="${s[1] * 40}" x2="${s[2] * 40}" y2="${s[3] * 40}"/>`).join('')}</g>`;
    return `<svg width="28" height="28" viewBox="-48 -48 96 96" aria-hidden="true">${inner}</svg>`;
  };

  function mountShapes(root, c, api) {
    const ids = c.shapes;
    const S = { shape: ids[0], ang: 70, foldT: 0, foldTh: 0, matched: null, folding: false, rot: 0, found: {}, fits: {}, full: {}, msg: '', tmsg: '', q: { done: false, sel: null } };
    const U = base(root, api, 'ar-sh');
    const vid = uid();
    let stops = [];
    const fill = () => SHAPE_FILL[SHAPE_IDS.indexOf(S.shape) % SHAPE_FILL.length];
    const sh = () => SHAPES[S.shape];
    const nLines = () => (sh().lines === 'all' ? Infinity : sh().lines.length);
    const foundN = () => (S.found[S.shape] || []).length;
    const say = (t) => { U.live.textContent = t; };
    function stageSVG() {
      const s = sh(), col = fill();
      let body = '', lineEl = '', verdict = '';
      let grid = '';
      for (let k = -4; k <= 4; k++) grid += `<line x1="${SCX + k * 40}" y1="0" x2="${SCX + k * 40}" y2="400"/><line x1="0" y1="${SCX + k * 40}" x2="400" y2="${SCX + k * 40}"/>`;
      if (S.rot > 0) {
        body = shapeSVG(s, null, 'none', '#64748B', 2.5, 'stroke-dasharray="6 5" opacity=".7"') + shapeSVG(s, (p) => rotate(p, S.rot), col, '#061233', 3, 'fill-opacity=".92"');
        verdict = S.tmsg;
      } else {
        body = shapeSVG(s, null, col, '#061233', 3, 'fill-opacity=".92"');
        if (S.foldT > 0) {
          const th = S.foldTh;
          body += shapeSVG(s, (p) => { const r = reflect(p, th); return [lerp(p[0], r[0], S.foldT), lerp(p[1], r[1], S.foldT)]; }, '#FF7A1A', '#B45309', 3, 'fill-opacity=".5" stroke-dasharray="7 4"');
        }
        const th = S.foldT > 0 ? S.foldTh : S.ang, dx = Math.cos(rad(th)), dy = -Math.sin(rad(th));
        const a = [SCX - dx * 190, SCX - dy * 190], b = [SCX + dx * 190, SCX + dy * 190];
        const mc = S.matched === true && !S.folding ? '#0F766E' : S.matched === false && !S.folding ? '#DC2626' : '#8B3DFF';
        lineEl = `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${mc}" stroke-width="4" stroke-dasharray="10 7" stroke-linecap="round"/><circle cx="${f1(a[0] + dx * 12)}" cy="${f1(a[1] + dy * 12)}" r="8" fill="${mc}"/><circle cx="${f1(b[0] - dx * 12)}" cy="${f1(b[1] - dy * 12)}" r="8" fill="${mc}"/>`;
        verdict = S.folding ? '' : S.msg;
      }
      const pill = verdict ? `<g><rect x="12" y="354" width="376" height="34" rx="17" fill="${S.matched === true ? '#DCFCE7' : S.matched === false ? '#FEE2E2' : '#E0E9FF'}" stroke="rgba(0,0,0,.12)"/><text x="200" y="376" text-anchor="middle" font-size="15" font-weight="700" fill="#061233" font-family="var(--font-body,sans-serif)">${esc(verdict)}</text></g>` : '';
      return `<svg class="ar-svg" viewBox="0 0 400 400" role="img" data-key="canvas" data-fk="canvas" tabindex="0" aria-label="${esc(api.t(s.n))}">
<defs><linearGradient id="${vid}p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4F8FF"/><stop offset="1" stop-color="#DCE7FF"/></linearGradient></defs>
<rect width="400" height="400" fill="url(#${vid}p)"/><g stroke="#B6C6EE" stroke-width="1" opacity=".6">${grid}</g>
<circle cx="200" cy="200" r="3" fill="#061233" opacity=".5"/>${body}${lineEl}${pill}</svg>`;
    }
    function drawStage() { U.stage.innerHTML = stageSVG(); }
    function mirrorDyn() {
      const k = foundN(), N = nLines(), s = sh();
      let t;
      if (N === Infinity) t = k >= 3 ? api.t(T2('A circle has endless lines of symmetry: every line through the centre.', 'वृत्त में अनगिनत सममिति-रेखाएँ होती हैं: केंद्र से जाने वाली हर रेखा।')) : api.t(T2('Lines found: ', 'मिली रेखाएँ: ')) + k;
      else if (N > 0 && k >= N) t = api.t(T2('All found! ', 'सब मिल गईं! ')) + api.t(s.n) + api.t(T2(' has ' + N + (N === 1 ? ' line' : ' lines') + ' of symmetry.', ' में ' + N + ' सममिति-रेखाएँ हैं।'));
      else t = api.t(T2('Lines found: ', 'मिली रेखाएँ: ')) + k;
      const dots = N !== Infinity && N > 0 ? Array.from({ length: N }, (_, i) => `<span class="ar-sw" style="width:18px;height:18px;border-width:1px;background:${i < k ? '#0F766E' : '#E2E8F0'}" aria-hidden="true"></span>`).join('') : '';
      return `<div class="ar-row" style="margin-bottom:6px">${dots}</div><p class="ar-note"><strong>${esc(t)}</strong></p>`;
    }
    function turnDyn() {
      const s = sh(), fs = (S.fits[S.shape] || []).length;
      let t = '';
      if (s.order === 'inf') t = fs ? api.t(T2('A circle looks the same after any turn. Order: endless.', 'वृत्त किसी भी घुमाव के बाद वैसा ही दिखता है। क्रम: अनंत।')) : '';
      else if (fs >= s.order - 1 && (s.order > 1 || S.full[S.shape])) t = api.t(T2('It fits ' + s.order + (s.order === 1 ? ' time' : ' times') + ' in one full turn: the order of rotational symmetry is ' + s.order + '.', 'एक पूरे चक्कर में यह ' + s.order + ' बार बैठता है: घूर्णन सममिति का क्रम ' + s.order + ' है।'));
      else t = api.t(T2('Turns that fit: ', 'जो घुमाव बैठे: ')) + fs;
      return `<p class="ar-note"><strong>${esc(t)}</strong></p>`;
    }
    function panelHTML() {
      const chips = ids.length > 1 ? `<div class="ar-card"><h3 class="ar-h">${esc(api.t(T2('Shape', 'आकृति')))}</h3><div class="ar-tabs">${ids.map((id) => btn('tool:' + id, 'shape', miniShape(id) + `<span>${esc(api.t(SHAPES[id].n))}</span>`, { arg: id, pressed: S.shape === id })).join('')}</div></div>` : `<div class="ar-card"><h3 class="ar-h">${esc(api.t(sh().n))}</h3></div>`;
      return `${chips}
<div class="ar-card"><h3 class="ar-h">${esc(api.t(T2('Mirror line', 'दर्पण-रेखा')))}</h3>
<div data-key="tool:mirror"><div class="ar-lab"><span>${esc(api.t(T2('Turn the line', 'रेखा घुमाओ')))}</span><span id="${vid}ang">${S.ang}&deg;</span></div><input class="ar-range" type="range" min="0" max="179" step="1" value="${S.ang}" data-slider="mirror" data-fk="slider-mirror" aria-label="${esc(api.t(T2('Angle of the mirror line', 'दर्पण-रेखा का कोण')))}"></div>
<div class="ar-row" style="margin:6px 0">${btn('tool:fold', 'fold', esc(api.t(T2('Fold along the line', 'रेखा पर मोड़ो'))), { cls: 'pri' })}</div><div id="${vid}md">${mirrorDyn()}</div></div>
<div class="ar-card"><h3 class="ar-h">${esc(api.t(T2('Turn the shape', 'आकृति घुमाओ')))}</h3>
<div data-key="tool:turn"><div class="ar-lab"><span>${esc(api.t(T2('Turn (clockwise)', 'घुमाव (दक्षिणावर्त)')))}</span><span id="${vid}rot">${S.rot}&deg;</span></div><input class="ar-range" type="range" min="0" max="360" step="1" value="${S.rot}" data-slider="turn" data-fk="slider-turn" aria-label="${esc(api.t(T2('Turn the shape by an angle', 'आकृति को कोण से घुमाओ')))}"></div><div id="${vid}td">${turnDyn()}</div></div>${qHTML(c.question, api, S.q)}`;
    }
    function render() { setHTML(U.panel, panelHTML()); }
    const upd = () => { const a = U.panel.querySelector('#' + vid + 'md'), b = U.panel.querySelector('#' + vid + 'td'); if (a) a.innerHTML = mirrorDyn(); if (b) b.innerHTML = turnDyn(); };
    const setText = (suffix, v) => { const e = U.panel.querySelector('#' + vid + suffix); if (e) e.innerHTML = v + '&deg;'; };
    const setSlider = (name, v) => { const e = U.panel.querySelector('[data-slider="' + name + '"]'); if (e) e.value = v; };
    function doFold() {
      if (S.folding) return;
      S.rot = 0; setSlider('turn', 0); setText('rot', 0); S.tmsg = '';
      const s = sh(), m = nearLine(s, S.ang), ok = m.d <= 3;
      const th = ok && s.lines !== 'all' ? s.lines[m.i] : S.ang;
      if (ok) { S.ang = th; setSlider('mirror', th); setText('ang', th); }
      S.foldTh = th; S.foldT = 0; S.matched = null; S.msg = ''; S.folding = true;
      stops.push(tween(1000, (k) => { S.foldT = ease(k); drawStage(); }, () => {
        S.folding = false; S.matched = ok; S.foldT = 1;
        if (ok) {
          const key = s.lines === 'all' ? 'c' + (Math.round(S.ang / 15) % 12) : 'l' + m.i;
          const arr = (S.found[S.shape] = S.found[S.shape] || []);
          const isNew = arr.indexOf(key) < 0;
          if (isNew) arr.push(key);
          S.msg = api.t(T2('Yes! The two halves match: a line of symmetry.', 'हाँ! दोनों हिस्से मिलते हैं: सममिति-रेखा।'));
          api.emit('fold:match'); if (isNew) { api.emit('found:line'); api.record(api.t(T2('Found a line of symmetry of the ', 'सममिति-रेखा मिली: ')) + api.t(s.n)); }
          const total = s.lines === 'all' ? 3 : s.lines.length;
          if (isNew && arr.length >= total) { api.emit('found:all'); api.celebrate(); }
        } else {
          const near = m.d <= 12 && s.lines.length !== 0;
          S.msg = api.t(near ? T2('Almost! Move the line a little and fold again.', 'लगभग! रेखा थोड़ी खिसकाओ और फिर मोड़ो।') : T2('The halves do not match. Try another line.', 'दोनों हिस्से नहीं मिलते। दूसरी रेखा आज़माओ।'));
          api.emit('fold:miss');
        }
        say(S.msg); drawStage(); upd();
      }));
    }
    function onSlider(e) {
      const el = e.target;
      if (!el.matches || !el.matches('input[data-slider]')) return;
      const which = el.getAttribute('data-slider');
      if (!api.allowed('tool:' + which)) { api.nudge('tool:' + which); el.value = which === 'mirror' ? S.ang : S.rot; return; }
      const v = +el.value;
      if (which === 'mirror') {
        S.ang = v; S.foldT = 0; S.matched = null; S.msg = ''; S.rot = 0; S.tmsg = ''; setSlider('turn', 0); setText('rot', 0); setText('ang', v); drawStage();
      } else {
        const s = sh();
        S.foldT = 0; S.matched = null; S.msg = '';
        let val = v; S.tmsg = '';
        if (s.order === 'inf') {
          if (v >= 8) { S.tmsg = api.t(T2('It fits at every angle.', 'यह हर कोण पर बैठता है।')); const a = (S.fits[S.shape] = S.fits[S.shape] || []); if (!a.length) { a.push('c'); api.emit('turn:fit'); } }
        } else {
          const step = 360 / s.order;
          for (let k = 1; k <= s.order; k++) {
            if (Math.abs(v - k * step) <= 3) {
              val = Math.round(k * step);
              if (k < s.order) {
                S.tmsg = api.t(T2('It fits again after turning ' + f1(k * step) + ' degrees!', 'यह ' + f1(k * step) + ' अंश घुमाने पर फिर बैठता है!'));
                const a = (S.fits[S.shape] = S.fits[S.shape] || []);
                if (a.indexOf(k) < 0) { a.push(k); api.emit('turn:fit'); api.record(api.t(T2('Turned the shape; it fits at ', 'आकृति घुमाई; यह बैठी ')) + f1(k * step)); }
              } else {
                S.tmsg = api.t(T2('A full turn of 360 degrees always fits.', '360 अंश का पूरा चक्कर हमेशा बैठता है।'));
                S.full[S.shape] = true;
              }
              break;
            }
          }
        }
        S.rot = val; if (val !== v) el.value = val; setText('rot', val); drawStage(); upd(); if (S.tmsg) say(S.tmsg);
      }
    }
    U.panel.addEventListener('input', onSlider);
    const off = wire(U.el, api, {
      fold: () => doFold(),
      shape: (id) => { if (S.folding) return; S.shape = id; S.foldT = 0; S.matched = null; S.msg = ''; S.rot = 0; S.tmsg = ''; S.ang = 70; drawStage(); render(); say(api.t(SHAPES[id].n)); },
      ans: (i) => { if (qAnswer(c.question, api, S.q, +i)) render(); },
    });
    drawStage(); render();
    return { destroy() { stops.forEach((s) => s()); off(); U.panel.removeEventListener('input', onSlider); root.innerHTML = ''; } };
  }

  // ------------------------------------------------------------------------------------------------ mode: art-form
  const lighter = (h, t) => mixHex(h, '#FFFFFF', t == null ? 0.4 : t);
  const darker = (h, t) => mixHex(h, '#000000', t == null ? 0.35 : t);
  const FHEX = {
    warli: { white: '#FFF8EC' },
    madhubani: { red: '#D7263D', yellow: '#FFC21A', blue: '#2457C5', green: '#1F9D55', orange: '#FF7A1A', pink: '#F0508C' },
    gond: { yellow: '#FFD23F', orange: '#FF7A1A', pink: '#FF5FA2', green: '#2BC46A', blue: '#3A8DFF', white: '#FFFFFF' },
    kalamkari: { red: '#A3342B', blue: '#27407A', yellow: '#D9A62E', green: '#4C7A3A', black: '#2B2220' },
    pattachitra: { red: '#C8321F', yellow: '#F2B91E', black: '#1C1513', white: '#FFFDF5', blue: '#2C4A9A', green: '#2F7D46' },
  };
  const INK = { warli: '#FFF8EC', madhubani: '#2B1B12', gond: '#12152A', kalamkari: '#3B2A22', pattachitra: '#1A1210' };
  const fhex = (form, id) => (FHEX[form] && FHEX[form][id]) || RCLR[id] || '#FFFFFF';
  const isDark = (h) => { const [r, g, b] = rgbOf(h); return r * 0.299 + g * 0.587 + b * 0.114 < 90; };
  const MSCALE = { dance: 0.95, tree: 0.9, sun: 0.7, deer: 0.9, peacock: 0.9 };

  function motifFish(c, ink, sw, eye) {
    const body = 'M-40 0 C-22 -22 14 -22 30 0 C14 22 -22 22 -40 0Z';
    let sc = ''; for (const y of [-8, 2, 12]) for (let x = -22 + (y === 2 ? 4 : 0); x < 16; x += 9) sc += `M${x} ${y} q4.5 5 9 0 `;
    return `<g stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"><path d="M28 0 L46 -17 L42 0 L46 17Z" fill="${lighter(c, 0.3)}"/><path d="M-8 -15 C-2 -30 12 -28 14 -16Z" fill="${lighter(c, 0.3)}"/><path d="M-6 15 C0 28 10 26 12 16Z" fill="${lighter(c, 0.3)}"/><path d="${body}" fill="${c}"/><path d="${body}" fill="none" transform="scale(.86)" stroke-width="${sw * 0.45}"/><path d="${sc}" fill="none" stroke-width="${sw * 0.55}"/><circle cx="-29" cy="-3" r="${eye || 3.4}" fill="#fff"/><circle cx="-29" cy="-3" r="${(eye || 3.4) * 0.5}" fill="${ink}" stroke="none"/></g>`;
  }
  function motifPeacock(c, ink, sw) {
    let f = '';
    for (const a of [-62, -41, -21, 0, 21, 41, 62]) f += `<g transform="rotate(${a} 0 20)"><ellipse cx="0" cy="-8" rx="7.6" ry="26" fill="${a % 2 ? lighter(c, 0.25) : c}" stroke="${ink}" stroke-width="${sw}"/><circle cy="-27" r="4.6" fill="#2457C5" stroke="${ink}" stroke-width="${sw * 0.6}"/><circle cy="-27" r="1.8" fill="#FFC21A"/></g>`;
    return `<g stroke-linejoin="round" stroke-linecap="round">${f}<ellipse cx="0" cy="26" rx="12" ry="17" fill="${darker(c, 0.1)}" stroke="${ink}" stroke-width="${sw}"/><ellipse cx="0" cy="6" rx="5.5" ry="15" fill="#2457C5" stroke="${ink}" stroke-width="${sw}"/><circle cy="-10" r="6.5" fill="#2457C5" stroke="${ink}" stroke-width="${sw}"/><path d="M-3 -16 L-5 -26 M0 -17 L0 -28 M3 -16 L5 -26" stroke="${ink}" stroke-width="${sw}" fill="none"/><circle cx="-3" cy="-11" r="1.4" fill="#fff"/><path d="M-2 -7 L0 -2 L2 -7Z" fill="#FFC21A" stroke="${ink}" stroke-width="1"/><path d="M-5 41 L-6 49 M5 41 L6 49" stroke="${ink}" stroke-width="${sw}"/></g>`;
  }
  function motifLotus(c, ink, sw) {
    let p = '';
    [-64, 64, -32, 32, 0].forEach((a, i) => { p += `<path d="M0 30 C-15 14 -13 -12 0 -34 C13 -12 15 14 0 30Z" transform="rotate(${a} 0 30)" fill="${i < 4 ? c : lighter(c, 0.35)}" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"/>`; });
    return `<g>${p}<path d="M0 24 L0 -20" stroke="${ink}" stroke-width="${sw * 0.5}" stroke-linecap="round"/><path d="M-42 40 q10 -9 21 0 t21 0 t21 0 t21 0" fill="none" stroke="${ink}" stroke-width="${sw}" stroke-linecap="round"/></g>`;
  }
  function motifSun(c, ink, sw, scallop) {
    let r = '';
    for (let a = 0; a < 360; a += 30) r += scallop ? `<ellipse cy="-27" rx="6" ry="11" transform="rotate(${a})" fill="${lighter(c, 0.35)}" stroke="${ink}" stroke-width="${sw * 0.8}"/>` : `<path d="M-5 -20 L0 -34 L5 -20Z" transform="rotate(${a})" fill="${lighter(c, 0.35)}" stroke="${ink}" stroke-width="${sw * 0.8}" stroke-linejoin="round"/>`;
    return `<g>${r}<circle r="19" fill="${c}" stroke="${ink}" stroke-width="${sw}"/><circle r="16" fill="none" stroke="${ink}" stroke-width="${sw * 0.4}"/><circle cx="-6" cy="-3" r="${scallop ? 4.4 : 2}" fill="${scallop ? '#fff' : ink}" stroke="${ink}" stroke-width="1.4"/><circle cx="6" cy="-3" r="${scallop ? 4.4 : 2}" fill="${scallop ? '#fff' : ink}" stroke="${ink}" stroke-width="1.4"/>${scallop ? `<circle cx="-6" cy="-3" r="1.8" fill="${ink}"/><circle cx="6" cy="-3" r="1.8" fill="${ink}"/>` : ''}<path d="M-7 6 Q0 13 7 6" fill="none" stroke="${ink}" stroke-width="${sw * 0.8}" stroke-linecap="round"/></g>`;
  }
  // dots and dashes, to be clipped to a body (Gond)
  function gondRows(dc, dk) {
    let s = '';
    for (let y = -46, r = 0; y < 48; y += 6, r++) for (let x = -52 + (r % 2) * 3; x < 52; x += 6) s += r % 3 === 1 ? `<path d="M${x} ${y} h3.4" stroke="${dk}" stroke-width="1.5" stroke-linecap="round"/>` : `<circle cx="${x}" cy="${y}" r="1.35" fill="${dc}"/>`;
    return s;
  }
  function motif(form, m, c) {
    const ink = INK[form];
    if (form === 'warli') {
      const st = `stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;
      const person = `<g ${st} fill="${c}"><circle cx="0" cy="-36" r="6"/><path d="M-12 -27 L12 -27 L0 -4Z"/><path d="M0 -4 L-12 20 L12 20Z"/><path d="M-12 -26 L-26 -12 M12 -26 L26 -12 M-7 20 L-10 40 M7 20 L10 40" fill="none"/></g>`;
      if (m === 'person') return person;
      if (m === 'tree') return `<g ${st} fill="none"><path d="M0 44 L0 -30"/>${[30, 16, 2, -12].map((y) => `<path d="M0 ${y} L-16 ${y - 12} M0 ${y} L16 ${y - 12}"/>`).join('')}<path d="M-9 -26 L9 -26 L0 -46Z" fill="${c}"/></g>`;
      if (m === 'hut') return `<g ${st} fill="none"><path d="M-30 0 L0 -34 L30 0Z" fill="${c}" fill-opacity=".28"/><rect x="-24" y="0" width="48" height="38"/><path d="M-6 38 V18 H6 V38"/><path d="M-36 38 H36"/></g>`;
      if (m === 'sun') return `<g ${st} fill="none"><circle r="13"/><circle r="4" fill="${c}"/>${Array.from({ length: 12 }, (_, k) => `<path d="M0 -19 L0 -30" transform="rotate(${k * 30})"/>`).join('')}</g>`;
      return `<g><circle r="34" fill="none" stroke="${c}" stroke-width="1.6" stroke-dasharray="2 5" stroke-linecap="round"/>${Array.from({ length: 8 }, (_, k) => `<g transform="rotate(${k * 45}) translate(0 -34) scale(.32)">${person}</g>`).join('')}<path d="M-6 9 L0 -9 L6 9Z" fill="${c}" stroke="${c}" stroke-width="2" stroke-linejoin="round"/></g>`;
    }
    if (form === 'madhubani') {
      if (m === 'fish') return motifFish(c, ink, 2.6);
      if (m === 'peacock') return motifPeacock(c, ink, 2.2);
      if (m === 'lotus') return motifLotus(c, ink, 2.4);
      return motifSun(c, ink, 2.6, false);
    }
    if (form === 'kalamkari') {
      if (m === 'peacock') return motifPeacock(c, ink, 1.5);
      if (m === 'flower') {
        let p = '';
        for (let a = 0; a < 360; a += 45) p += `<path d="M0 -8 C-10 -18 -8 -34 0 -44 C8 -34 10 -18 0 -8Z" transform="rotate(${a})" fill="${c}" stroke="${ink}" stroke-width="1.4"/>`;
        for (let a = 22.5; a < 360; a += 45) p += `<path d="M0 -6 C-6 -12 -5 -22 0 -28 C5 -22 6 -12 0 -6Z" transform="rotate(${a})" fill="${lighter(c, 0.45)}" stroke="${ink}" stroke-width="1.2"/>`;
        return `<g stroke-linejoin="round">${p}<circle r="8" fill="#D9A62E" stroke="${ink}" stroke-width="1.4"/><circle r="3.4" fill="${ink}"/></g>`;
      }
      if (m === 'paisley') {
        const d = 'M-4 42 C-30 36 -34 8 -20 -14 C-10 -30 8 -40 22 -34 C34 -28 34 -14 24 -8 C16 -3 12 4 16 14 C20 26 14 40 -4 42Z';
        const sc = (k) => `translate(2 2) scale(${k}) translate(-2 -2)`;
        return `<g stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"><path d="${d}" fill="${c}"/><path d="${d}" transform="${sc(0.8)}" fill="none" stroke-width="2.4" stroke-dasharray="0.1 5" stroke-linecap="round"/><path d="${d}" transform="${sc(0.6)}" fill="${lighter(c, 0.55)}"/><path d="${d}" transform="${sc(0.3)}" fill="${c}"/></g>`;
      }
      // tree of life
      const leaf = (x, y, a, f) => `<path d="M0 0 C-6 -6 -6 -14 0 -20 C6 -14 6 -6 0 0Z" transform="translate(${x} ${y}) rotate(${a})" fill="${f}" stroke="${ink}" stroke-width="1.2"/>`;
      const fl = (x, y, f) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((a) => `<ellipse cy="-5.5" rx="3.2" ry="5.5" transform="rotate(${a})" fill="${f}" stroke="${ink}" stroke-width="1"/>`).join('')}<circle r="2.6" fill="#D9A62E" stroke="${ink}" stroke-width=".8"/></g>`;
      return `<g fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"><path d="M0 46 C-12 32 12 20 0 6 C-10 -6 6 -16 0 -30"/><path d="M0 22 C-14 18 -26 8 -34 -4" stroke-width="2.2"/><path d="M0 10 C14 6 26 -2 34 -14" stroke-width="2.2"/><path d="M0 -8 C-10 -14 -16 -22 -20 -32" stroke-width="2"/><path d="M0 -12 C10 -18 16 -26 20 -36" stroke-width="2"/></g>
<ellipse cx="0" cy="46" rx="26" ry="5" fill="#C9A06A" stroke="${ink}" stroke-width="1.2"/>${leaf(-8, 30, -70, '#4C7A3A')}${leaf(8, 24, 70, '#4C7A3A')}${leaf(-22, 8, -40, c)}${leaf(22, -2, 40, c)}${leaf(-12, -14, -45, '#4C7A3A')}${leaf(12, -20, 45, '#4C7A3A')}${fl(-35, -6, c)}${fl(35, -16, c)}${fl(-21, -34, lighter(c, 0.3))}${fl(21, -38, lighter(c, 0.3))}${fl(0, -36, c)}`;
    }
    if (form === 'pattachitra') {
      if (m === 'lotus') return motifLotus(c, ink, 3.2);
      if (m === 'fish') return motifFish(c, ink, 3.2, 5.4);
      if (m === 'sun') return motifSun(c, ink, 3, true);
      const dk = isDark(c), rim = dk ? '#F5E6C8' : ink, mark = dk ? '#F5E6C8' : ink;
      return `<g stroke-linejoin="round" stroke-linecap="round">${[-16, 0, 16].map((x, i) => `<circle cx="${x}" cy="${i === 1 ? -38 : -34}" r="8" fill="${i === 1 ? '#C8321F' : '#F2B91E'}" stroke="${ink}" stroke-width="3"/>`).join('')}<circle r="31" fill="${c}" stroke="${ink}" stroke-width="4"/><circle r="31" fill="none" stroke="${rim}" stroke-width="1.6" transform="scale(.93)"/><circle cx="-12" cy="-4" r="10.5" fill="#fff" stroke="${ink}" stroke-width="3"/><circle cx="12" cy="-4" r="10.5" fill="#fff" stroke="${ink}" stroke-width="3"/><circle cx="-12" cy="-4" r="5" fill="${ink}"/><circle cx="12" cy="-4" r="5" fill="${ink}"/><path d="M-9 16 Q0 22 9 16" fill="none" stroke="${mark}" stroke-width="3"/><path d="M0 -19 L0 -13" stroke="${mark}" stroke-width="3"/></g>`;
    }
    // gond: coloured body with dots and dashes inside it
    const id = uid(), dc = lighter(c, 0.78), dk = darker(c, 0.5);
    const clip = (shapes) => `<clipPath id="${id}">${shapes}</clipPath>`;
    const filled = (shapes, extra) => `<defs>${clip(shapes)}</defs><g fill="${c}">${shapes}</g><g clip-path="url(#${id})">${gondRows(dc, dk)}</g>${extra || ''}`;
    if (m === 'bird') return filled('<ellipse cx="-4" cy="8" rx="27" ry="16"/><circle cx="24" cy="-8" r="10"/><path d="M-28 6 L-50 -10 L-44 8 L-52 20 L-26 16Z"/><path d="M31 -12 L47 -6 L32 -2Z"/>', `<circle cx="27" cy="-10" r="2.6" fill="#fff"/><circle cx="27.6" cy="-10" r="1.1" fill="${INK.gond}"/><path d="M-6 24 L-8 38 M6 23 L6 38" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`);
    if (m === 'deer') return filled('<ellipse cx="0" cy="8" rx="27" ry="13"/><path d="M14 2 L24 -18 L32 -16 L22 8Z"/><ellipse cx="34" cy="-20" rx="9" ry="5.5" transform="rotate(-15 34 -20)"/>', `<g stroke="${c}" stroke-linecap="round" fill="none"><path d="M-18 18 L-20 42 M-8 20 L-8 42 M10 20 L10 42 M20 18 L22 42" stroke-width="4"/><path d="M30 -24 L28 -40 M28 -34 L22 -40 M28 -40 L34 -46 M36 -24 L40 -40 M40 -34 L46 -38" stroke-width="2.4"/></g><circle cx="37" cy="-21" r="1.6" fill="#fff"/>`);
    if (m === 'fish') return filled('<ellipse cx="-4" cy="0" rx="32" ry="19"/><path d="M24 0 L46 -17 L42 0 L46 17Z"/><path d="M-12 -16 C-4 -32 14 -28 16 -14Z"/>', `<circle cx="-24" cy="-4" r="3.2" fill="#fff"/><circle cx="-24.6" cy="-4" r="1.4" fill="${INK.gond}"/>`);
    // gond tree
    return `<defs>${clip('<circle cx="0" cy="-22" r="23"/><circle cx="-22" cy="-10" r="15"/><circle cx="22" cy="-10" r="15"/>')}</defs><path d="M-5 46 C-4 22 -9 8 -3 -8 L6 -8 C2 8 8 22 5 46Z" fill="${darker(c, 0.25)}"/><path d="M0 42 L0 -4" stroke="${dc}" stroke-width="1.6" stroke-dasharray="3 3"/><g fill="${c}"><circle cx="0" cy="-22" r="23"/><circle cx="-22" cy="-10" r="15"/><circle cx="22" cy="-10" r="15"/></g><g clip-path="url(#${id})">${gondRows(dc, dk)}</g><g fill="none" stroke="${dk}" stroke-width="1.6" stroke-dasharray="2 3.5"><circle cx="0" cy="-22" r="14"/><circle cx="0" cy="-22" r="6"/></g>`;
  }
  function borderSVG(form, c1) {
    const ink = INK[form];
    if (form === 'warli') {
      let t = 'M18 24', b = 'M18 276';
      for (let x = 18; x < 382; x += 16) { t += ` L${x + 8} 12 L${x + 16} 24`; b += ` L${x + 8} 288 L${x + 16} 276`; }
      return `<g fill="none" stroke="#FFF8EC" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="${t}"/><path d="${b}"/><line x1="10" y1="36" x2="10" y2="264" stroke-dasharray="0.1 9"/><line x1="390" y1="36" x2="390" y2="264" stroke-dasharray="0.1 9"/></g>`;
    }
    if (form === 'madhubani') {
      let tk = '';
      for (let x = 22; x < 384; x += 10) tk += `<path d="M${x} 10 L${x + 5} 19 M${x} 290 L${x + 5} 281"/>`;
      for (let y = 22; y < 284; y += 10) tk += `<path d="M10 ${y} L19 ${y + 5} M390 ${y} L381 ${y + 5}"/>`;
      return `<g fill="none" stroke="${ink}" stroke-width="2"><rect x="6" y="6" width="388" height="288" rx="6" stroke-width="3.4"/><rect x="22" y="22" width="356" height="256" rx="3" stroke-width="1.6"/>${tk}</g><g fill="${c1}"><circle cx="14" cy="14" r="6"/><circle cx="386" cy="14" r="6"/><circle cx="14" cy="286" r="6"/><circle cx="386" cy="286" r="6"/></g>`;
    }
    if (form === 'gond') return `<g fill="none" stroke-linecap="round"><rect x="10" y="10" width="380" height="280" rx="10" stroke="#FFD23F" stroke-width="3.4" stroke-dasharray="0.1 8"/><rect x="20" y="20" width="360" height="260" rx="8" stroke="#FF7A1A" stroke-width="2" stroke-dasharray="9 6"/></g>`;
    if (form === 'kalamkari') {
      let vt = 'M16 22', vb = 'M16 278', lv = '';
      for (let x = 16; x < 384; x += 26) { vt += ` q6.5 -12 13 0 t13 0`; vb += ` q6.5 12 13 0 t13 0`; lv += `<ellipse cx="${x + 13}" cy="12" rx="3.4" ry="6" fill="#4C7A3A" stroke="${ink}" stroke-width=".8"/><ellipse cx="${x + 13}" cy="288" rx="3.4" ry="6" fill="#4C7A3A" stroke="${ink}" stroke-width=".8"/>`; }
      return `<g fill="none" stroke="${ink}" stroke-width="1.8" stroke-linecap="round"><path d="${vt}"/><path d="${vb}"/><path d="M8 34 V266 M392 34 V266 M13 34 V266 M387 34 V266" stroke-width="1.2"/></g>${lv}`;
    }
    let dm = '';
    for (let x = 24; x < 384; x += 24) dm += `<path d="M${x} 15 l5 5 -5 5 -5 -5Z M${x} 275 l5 5 -5 5 -5 -5Z" fill="#FFFDF5" stroke="${ink}" stroke-width="1.2"/>`;
    for (let y = 36; y < 270; y += 24) dm += `<path d="M15 ${y} l5 5 -5 5 -5 -5Z M385 ${y} l5 5 -5 5 -5 -5Z" fill="#FFFDF5" stroke="${ink}" stroke-width="1.2"/>`;
    return `<path d="M3 3 H397 V297 H3Z M26 26 V274 H374 V26Z" fill-rule="evenodd" fill="#C8321F" stroke="${ink}" stroke-width="3.4"/>${dm}`;
  }
  const SAMPLES = {
    warli: [['sun', 70, 80, 'white'], ['dance', 205, 112, 'white'], ['hut', 88, 200, 'white'], ['tree', 335, 170, 'white'], ['person', 200, 218, 'white'], ['person', 255, 218, 'white']],
    madhubani: [['sun', 72, 86, 'orange'], ['peacock', 205, 112, 'blue'], ['fish', 98, 212, 'red'], ['fish', 240, 212, 'green', 1], ['lotus', 330, 198, 'pink']],
    gond: [['tree', 88, 150, 'green'], ['deer', 215, 168, 'orange'], ['bird', 312, 98, 'yellow'], ['fish', 312, 218, 'pink']],
    kalamkari: [['tree', 200, 142, 'red'], ['flower', 78, 98, 'blue'], ['flower', 322, 98, 'blue'], ['peacock', 92, 208, 'red'], ['paisley', 308, 208, 'yellow']],
    pattachitra: [['sun', 200, 66, 'yellow'], ['face', 105, 150, 'black'], ['face', 200, 150, 'white'], ['face', 295, 150, 'yellow'], ['lotus', 105, 226, 'red'], ['fish', 295, 232, 'blue'], ['lotus', 200, 226, 'red']],
  };

  function mountArt(root, c, api) {
    const forms = c.art_form ? [c.art_form] : FORM_IDS;
    const S = { form: forms[0], items: {}, border: true, color: {}, motif: {}, cur: [200, 150], focus: false, newest: -1, watching: false, hist: {}, q: { done: false, sel: null } };
    forms.forEach((f) => { S.items[f] = c.sample ? SAMPLES[f].map((s) => ({ m: s[0], x: s[1], y: s[2], c: s[3], flip: !!s[4] })) : []; S.hist[f] = []; S.color[f] = FORMS[f].palette[0]; S.motif[f] = FORMS[f].motifs[0]; });
    const U = base(root, api, 'ar-af');
    const vid = uid();
    let timers = [], stops = [];
    const F = () => FORMS[S.form];
    const clrName = (id) => api.t(CLR[id] ? CLR[id].n : T2(id, id));
    const say = (t) => { U.live.textContent = t; };
    const speck = (form) => {
      let r = 12345 + form.length * 77, o = '';
      const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
      for (let i = 0; i < 70; i++) o += `<circle cx="${f1(rnd() * 400)}" cy="${f1(rnd() * 300)}" r="${f1(0.6 + rnd() * 1.4)}"/>`;
      return o;
    };
    const mini = (m) => `<svg width="38" height="38" viewBox="-52 -52 104 104" aria-hidden="true"><rect x="-52" y="-52" width="104" height="104" rx="14" fill="${F().bg}"/>${motif(S.form, m, fhex(S.form, S.color[S.form]))}</svg>`;
    function stageSVG() {
      const f = S.form, fm = F();
      const items = S.items[f].map((it, i) => `<g transform="translate(${it.x} ${it.y}) scale(${(MSCALE[it.m] || 0.8) * (it.flip ? -1 : 1)} ${MSCALE[it.m] || 0.8})"><g${i === S.newest ? ' class="ar-pop"' : ''}>${motif(f, it.m, fhex(f, it.c))}</g></g>`).join('');
      const cur = S.focus ? `<circle cx="${S.cur[0]}" cy="${S.cur[1]}" r="14" fill="none" stroke="#02CFF9" stroke-width="3"/><circle cx="${S.cur[0]}" cy="${S.cur[1]}" r="2.5" fill="#02CFF9"/>` : '';
      return `<svg class="ar-svg" viewBox="0 0 400 300" tabindex="0" role="application" data-key="canvas" data-fk="canvas" style="cursor:crosshair" aria-label="${esc(api.t(T2('Canvas for ', 'कैनवास: ')) + api.t(fm.n) + '. ' + api.t(T2('Tap to place the chosen motif. With a keyboard, use arrows and Enter.', 'चुना हुआ चित्र रखने के लिए छुओ। कीबोर्ड से तीर कुंजियाँ और Enter दबाओ।')))}">
<defs><radialGradient id="${vid}g" cx=".5" cy=".45" r=".8"><stop offset="0" stop-color="${fm.bg}"/><stop offset="1" stop-color="${fm.bg2}"/></radialGradient></defs>
<rect width="400" height="300" fill="url(#${vid}g)"/><g fill="${INK[f] === '#FFF8EC' ? '#6B2A12' : '#000'}" opacity=".12">${speck(f)}</g>
${S.border ? borderSVG(f, fhex(f, fm.palette[0])) : ''}${items}${cur}</svg>`;
    }
    function drawStage() { U.stage.innerHTML = stageSVG(); }
    function panelHTML() {
      const fm = F(), f = S.form;
      const tabs = !c.art_form ? `<div class="ar-card"><h3 class="ar-h">${esc(api.t(T2('Art form', 'कला-शैली')))}</h3><div class="ar-tabs">${forms.map((id) => btn('tool:' + id, 'form', esc(api.t(FORMS[id].n)), { arg: id, pressed: S.form === id })).join('')}</div></div>` : '';
      const kv = (k, v) => `<dt>${esc(api.t(k))}</dt><dd>${esc(api.t(v))}</dd>`;
      const info = `<div class="ar-card"><h3 class="ar-h" style="font-size:20px">${esc(api.t(fm.n))}</h3><dl class="ar-kv">${kv(T2('Where', 'कहाँ'), fm.where)}${kv(T2('Who', 'कौन'), fm.who)}${kv(T2('On what', 'किस पर'), fm.surface)}${kv(T2('How', 'कैसे'), fm.tools)}</dl><ul class="ar-ul" style="margin-top:10px">${fm.features.map((x) => `<li>${esc(api.t(x))}</li>`).join('')}</ul></div>`;
      const motifs = fm.motifs.map((m) => btn('tool:' + m, 'motif', mini(m) + `<span>${esc(api.t(MOTIF_N[m]))}</span>`, { arg: m, pressed: S.motif[f] === m })).join('');
      const cols = fm.palette.map((p) => `<button type="button" class="ar-btn" data-key="colour:${p}" data-fk="colour:${p}" data-act="colour" data-arg="${p}" aria-pressed="${S.color[f] === p}" aria-label="${esc(clrName(p))}" style="padding:4px;border-radius:50%;width:48px;height:48px">${sw(fhex(f, p))}</button>`).join('');
      const draw = `<div class="ar-card"><h3 class="ar-h">${esc(api.t(T2('Paint in this style', 'इस शैली में रंगो')))}</h3><div class="ar-row">${motifs}</div>${fm.palette.length > 1 ? `<div class="ar-row" style="margin-top:10px">${cols}</div>` : `<p class="ar-note" style="margin-top:8px">${esc(api.t(T2('This art form uses only white paste.', 'इस कला में केवल सफ़ेद लेई चलती है।')))}</p>`}<p class="ar-note" style="margin:8px 0">${esc(api.t(fm.tryit))}</p>
<div class="ar-row">${btn('tool:border', 'border', esc(api.t(T2('Border', 'किनारी'))), { pressed: S.border })}${btn('tool:watch', 'watch', esc(api.t(T2('Watch the artist', 'कलाकार को देखो'))), { cls: 'pri', dis: S.watching })}${btn('tool:undo', 'undo', esc(api.t(T2('Undo', 'पीछे'))), { dis: !S.hist[f].length || S.watching })}${btn('tool:clear', 'clear', esc(api.t(T2('Clear', 'साफ़'))), { dis: !S.items[f].length || S.watching })}</div></div>`;
      return `${tabs}${draw}${info}${qHTML(c.question, api, S.q)}`;
    }
    function render() { setHTML(U.panel, panelHTML()); }
    const snap = () => { const h = S.hist[S.form]; h.push(JSON.stringify(S.items[S.form])); if (h.length > 40) h.shift(); };
    function stamp(x, y) {
      if (!api.allowed('canvas')) { api.nudge('canvas'); return; }
      if (S.watching) return;
      const f = S.form;
      if (S.items[f].length >= MAX_STAMPS) { api.toast(T2('The canvas is full. Press Undo or Clear.', 'कैनवास भर गया है। पीछे या साफ़ दबाओ।')); return; }
      snap();
      S.items[f].push({ m: S.motif[f], x: Math.round(clamp(x, 30, 370)), y: Math.round(clamp(y, 30, 270)), c: S.color[f] });
      S.newest = S.items[f].length - 1; drawStage(); render();
      say(api.t(MOTIF_N[S.motif[f]]) + api.t(T2(' placed.', ' रखा गया।')));
      api.record(api.t(T2('Painted a ' + api.t(MOTIF_N[S.motif[f]]).toLowerCase() + ' in ' + api.t(F().n) + ' style', api.t(F().n) + ' शैली में ' + api.t(MOTIF_N[S.motif[f]]) + ' बनाया')));
      api.emit('drawn');
    }
    function watch() {
      if (S.watching) return;
      const f = S.form, sam = SAMPLES[f];
      snap(); S.items[f] = []; S.watching = true; drawStage(); render();
      let k = 0;
      const next = () => {
        if (k >= sam.length) { S.watching = false; S.newest = -1; render(); say(api.t(T2('The artist is done.', 'कलाकार का काम पूरा हुआ।'))); api.emit('watched'); return; }
        const s = sam[k++];
        S.items[f].push({ m: s[0], x: s[1], y: s[2], c: s[3], flip: !!s[4] }); S.newest = S.items[f].length - 1; drawStage();
        timers.push(setTimeout(next, L.reducedMotion() ? 0 : 650));
      };
      next();
    }
    const canvasPt = (ev) => svgPoint(U.stage.querySelector('svg'), ev, 400, 300);
    const onDown = (ev) => { if (ev.target.closest('svg')) { ev.preventDefault(); const [x, y] = canvasPt(ev); stamp(x, y); } };
    const focusSvg = () => { const s = U.stage.querySelector('svg'); if (s) s.focus({ preventScroll: true }); };
    const onKey = (ev) => {
      if (!ev.target.closest('svg')) return;
      const st = ev.shiftKey ? 40 : 12;
      const mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[ev.key];
      if (mv) { ev.preventDefault(); S.cur = [clamp(S.cur[0] + mv[0], 30, 370), clamp(S.cur[1] + mv[1], 30, 270)]; drawStage(); focusSvg(); }
      else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); stamp(S.cur[0], S.cur[1]); focusSvg(); }
    };
    const onFocus = (ev) => { if (!S.focus && ev.target.matches && ev.target.matches(':focus-visible')) { S.focus = true; drawStage(); focusSvg(); } };
    const onBlur = () => setTimeout(() => { if (!U.stage.contains(document.activeElement) && S.focus) { S.focus = false; drawStage(); } }, 0);
    U.stage.addEventListener('pointerdown', onDown); U.stage.addEventListener('keydown', onKey); U.stage.addEventListener('focusin', onFocus); U.stage.addEventListener('focusout', onBlur);
    const off = wire(U.el, api, {
      form: (id) => { if (S.watching) return; S.form = id; S.newest = -1; drawStage(); render(); api.emit('form:' + id); say(api.t(FORMS[id].n)); },
      motif: (m) => { S.motif[S.form] = m; render(); say(api.t(MOTIF_N[m])); },
      colour: (p) => { S.color[S.form] = p; render(); say(clrName(p)); },
      border: () => { S.border = !S.border; drawStage(); render(); },
      watch: () => watch(),
      undo: () => { const h = S.hist[S.form]; if (!h.length || S.watching) return; S.items[S.form] = JSON.parse(h.pop()); S.newest = -1; drawStage(); render(); },
      clear: () => { if (!S.items[S.form].length || S.watching) return; snap(); S.items[S.form] = []; S.newest = -1; drawStage(); render(); },
      ans: (i) => { if (qAnswer(c.question, api, S.q, +i)) render(); },
    });
    drawStage(); render();
    return { destroy() { timers.forEach(clearTimeout); stops.forEach((s) => s()); off(); U.stage.removeEventListener('pointerdown', onDown); U.stage.removeEventListener('keydown', onKey); U.stage.removeEventListener('focusin', onFocus); U.stage.removeEventListener('focusout', onBlur); root.innerHTML = ''; } };
  }

  // ------------------------------------------------------------------------------------------------ register
  const DEMO = {
    mode: 'rangoli', grid: 9, symmetry: 'full', palette: ['red', 'yellow', 'white', 'green', 'orange', 'pink'], sample: true,
    question: { q: T2('How many mirror lines does this rangoli have?', 'इस रंगोली में कितनी दर्पण-रेखाएँ हैं?'), options: [T2('1', '1'), T2('2', '2'), T2('4', '4')], answer: 2, why: T2('It has 4 mirror lines: up-down, left-right and two diagonals.', 'इसमें 4 दर्पण-रेखाएँ हैं: ऊपर-नीचे, बाएँ-दाएँ और दो तिरछी।') },
  };
  NCA_T.register({
    id: 'art',
    css: CSS,
    validate,
    keys,
    demo: DEMO,
    shapes: SHAPES, forms: FORMS, rsym: RSYM,
    model: { classify, vecOf, colourOf, reachable, nameOfId, WHEEL, nearLine, reflect },
    mount(root, config, api) {
      if (config.mode === 'mix') return mountMix(root, config, api);
      if (config.mode === 'rangoli') return mountRangoli(root, config, api);
      if (config.mode === 'symmetry') return config.shapes ? mountShapes(root, config, api) : mountPad(root, config, api);
      return mountArt(root, config, api);
    },
  });
})();
