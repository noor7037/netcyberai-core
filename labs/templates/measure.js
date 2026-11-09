// Template: Measuring lab. Real instruments, read the way a school lab teaches it.
//   scale        15 cm ruler (least count 1 mm): zero error of the object's start, parallax from a slanted eye
//   tape         3 m measuring tape (1 cm), straight objects and round ones (girth), slack in the tape
//   balance      two-pan beam balance with a box of standard weights (least count 5 g), g and kg
//   cylinder     100 mL measuring cylinder (2 mL): meniscus, eye level, liquids and a stone by displacement
//   clock        analog clock: read a time, or set the hands to a time
//   stopwatch    digital stopwatch (0.01 s): start and stop with an event, reaction time, a pendulum's period
//   thermometer  laboratory thermometer (1 C) and clinical thermometer (0.1 C): bulb in, wait, read
//   vernier      vernier callipers (main scale 1 mm, 10 divisions = 9 mm, least count 0.1 mm) with zero error
//   screw-gauge  screw gauge (pitch 0.5 mm, 50 divisions, least count 0.01 mm) with zero error
//   hand-span    measuring with hand-spans of different hands, then why we need standard units
// Config: { instrument, object?, units? }. Every size is a whole multiple of the instrument's least count, so the
// correct reading is exact. Events: placed (an object is on or in the instrument), aligned (the set-up is right:
// zero matched, beam level, eye level, jaws closed on the object, bulb settled, hands set), measured (the child
// pressed Read), answered:right / answered:wrong. Targets: object:<id>, instrument, slider:<name>, read, answer.
(function () {
  const L = window.NCA_LIB;
  const { esc, tween, ease } = L;
  const T2 = (en, hi) => ({ en, hi });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hash = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  const r2 = (v, d) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
  const num = (v, d) => String(parseFloat((+v).toFixed(d == null ? 2 : d)));
  const DEG = Math.PI / 180;
  const ink = '#1E293B';

  // ---------------------------------------------------------------- units
  const U = {
    cm: { f: 1, dim: 'len', n: T2('cm', 'सेमी') }, mm: { f: 0.1, dim: 'len', n: T2('mm', 'मिमी') }, m: { f: 100, dim: 'len', n: T2('m', 'मी') },
    g: { f: 1, dim: 'mass', n: T2('g', 'ग्राम') }, kg: { f: 1000, dim: 'mass', n: T2('kg', 'किग्रा') },
    mL: { f: 1, dim: 'vol', n: T2('mL', 'मिली') }, L: { f: 1000, dim: 'vol', n: T2('L', 'ली') },
    C: { f: 1, dim: 'temp', n: T2('°C', '°C') }, s: { f: 1, dim: 'time', n: T2('s', 'से') },
    min: { f: 1, dim: 'clock', n: T2('min', 'मिनट') }, spans: { f: 1, dim: 'count', n: T2('hand-spans', 'बित्ते') },
  };
  const UNITS_OK = {
    scale: ['cm', 'mm'], tape: ['cm', 'm'], balance: ['g', 'kg'], cylinder: ['mL', 'L'], vernier: ['cm', 'mm'], 'screw-gauge': ['mm', 'cm'], 'hand-span': ['cm', 'm'],
    clock: [], stopwatch: [], thermometer: [],
  };
  const UNIT_DEF = { scale: 'cm', tape: 'cm', balance: 'g', cylinder: 'mL', clock: 'min', stopwatch: 's', thermometer: 'C', vernier: 'cm', 'screw-gauge': 'mm', 'hand-span': 'spans' };
  const unitName = (u, api) => api.t(U[u].n);
  const DIGITS = '०१२३४५६७८९';
  function parseNum(raw) {
    const s = String(raw == null ? '' : raw).trim().replace(/[०-९]/g, (c) => DIGITS.indexOf(c)).replace(',', '.');
    if (!/^-?\d*\.?\d+$/.test(s)) return null;
    return parseFloat(s);
  }
  function parseTime(raw) {
    const s = String(raw == null ? '' : raw).trim().replace(/[०-९]/g, (c) => DIGITS.indexOf(c));
    let m = s.match(/^(\d{1,2})\s*[:.\s]\s*(\d{1,2})$/);
    if (!m) m = s.match(/^(\d{1,2})(\d{2})$/);
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    if (h > 24 || mi > 59) return null;
    return ((h % 12) * 60 + mi) % 720;
  }

  // ---------------------------------------------------------------- the things to measure (sizes are multiples of the least count)
  const SCALE_OBJ = {
    crayon: { n: T2('Crayon', 'क्रेयॉन'), v: 8.4 }, eraser: { n: T2('Eraser', 'रबर'), v: 4.2 }, clip: { n: T2('Paper clip', 'पेपर क्लिप'), v: 3.2 },
    key: { n: T2('Key', 'चाबी'), v: 5.8 }, leaf: { n: T2('Neem leaf', 'नीम की पत्ती'), v: 6.5 }, stub: { n: T2('Pencil stub', 'छोटी पेंसिल'), v: 9.6 },
  };
  const TAPE_OBJ = {
    door: { n: T2('Door (width)', 'दरवाज़ा (चौड़ाई)'), v: 90, kind: 'line' }, desk: { n: T2('Desk (length)', 'डेस्क (लंबाई)'), v: 120, kind: 'line' },
    bench: { n: T2('Bench (length)', 'बेंच (लंबाई)'), v: 180, kind: 'line' }, board: { n: T2('Blackboard (length)', 'श्यामपट (लंबाई)'), v: 240, kind: 'line' },
    bucket: { n: T2('Bucket (round)', 'बाल्टी (गोल)'), v: 157, kind: 'round' }, tree: { n: T2('Tree trunk (round)', 'पेड़ का तना (गोल)'), v: 94, kind: 'round' },
  };
  const BAL_OBJ = {
    eraser: { n: T2('Eraser', 'रबर'), v: 20 }, notebook: { n: T2('Notebook', 'कॉपी'), v: 90 }, orange: { n: T2('Orange', 'संतरा'), v: 130 },
    apple: { n: T2('Apple', 'सेब'), v: 150 }, mango: { n: T2('Mango', 'आम'), v: 250 }, pencilbox: { n: T2('Pencil box', 'पेंसिल-बॉक्स'), v: 345 },
    sugar: { n: T2('Packet of sugar', 'चीनी का पैकेट'), v: 1000 }, brick: { n: T2('Brick', 'ईंट'), v: 2000 },
  };
  const BAL_W = [[1000, 1], [500, 1], [200, 2], [100, 2], [50, 2], [20, 2], [10, 2], [5, 2]];
  const CYL_OBJ = {
    juice: { n: T2('Orange juice', 'संतरे का जूस'), v: 62, col: '#FF9F1C', kind: 'liquid' }, milk: { n: T2('Milk', 'दूध'), v: 84, col: '#FBF7EA', kind: 'liquid' },
    oil: { n: T2('Cooking oil', 'खाने का तेल'), v: 36, col: '#F2C94C', kind: 'liquid' }, water: { n: T2('Coloured water', 'रंगीन पानी'), v: 46, col: '#38BDF8', kind: 'liquid' },
    pebble: { n: T2('Pebble (solid)', 'कंकड़ (ठोस)'), v: 12, kind: 'solid' }, stone: { n: T2('Stone (solid)', 'पत्थर (ठोस)'), v: 26, kind: 'solid' },
  };
  const CLK_OBJ = {
    school: { n: T2('School starts', 'स्कूल शुरू'), t: 480, kind: 'read', pm: false }, lunch: { n: T2('Lunch break', 'भोजन का अवकाश'), t: 750, kind: 'read', pm: true },
    cricket: { n: T2('Cricket practice', 'क्रिकेट अभ्यास'), t: 255, kind: 'read', pm: true }, dinner: { n: T2('Dinner', 'रात का खाना'), t: 465, kind: 'read', pm: true },
    train: { n: T2('Train arrives', 'ट्रेन आती है'), t: 642, kind: 'read', pm: false },
    tea: { n: T2('Tea time: half past four', 'चाय का समय: साढ़े चार'), t: 270, kind: 'set', pm: true }, recess: { n: T2('Break: quarter to eleven', 'अवकाश: पौने ग्यारह'), t: 645, kind: 'set', pm: false },
    homework: { n: T2('Homework: quarter past five', 'होमवर्क: सवा पाँच'), t: 315, kind: 'set', pm: true }, game: { n: T2('Game: five to seven', 'खेल: सात बजने में पाँच मिनट'), t: 415, kind: 'set', pm: true },
  };
  const SW_OBJ = {
    ball: { n: T2('Ball rolling down a ramp', 'ढलान पर लुढ़कती गेंद'), v: 4.8 }, runner: { n: T2('Ravi runs 50 m', 'रवि 50 मीटर दौड़ता है'), v: 9 },
    pendulum: { n: T2('Pendulum: 10 swings', 'लोलक: 10 दोलन'), v: 0 },
  };
  const THERM_OBJ = {
    tap: { n: T2('Tap water', 'नल का पानी'), v: 27, kind: 'lab' }, milk: { n: T2('Warm milk', 'गुनगुना दूध'), v: 45, kind: 'lab' },
    tea: { n: T2('Hot tea (adult only)', 'गरम चाय (केवल बड़ों के लिए)'), v: 72, kind: 'lab' }, ice: { n: T2('Ice and water', 'बर्फ़ और पानी'), v: 0, kind: 'lab' },
    boiling: { n: T2('Boiling water (adult only)', 'उबलता पानी (केवल बड़ों के लिए)'), v: 100, kind: 'lab' },
    body: { n: T2('Body (clinical)', 'शरीर (क्लिनिकल)'), v: 36.8, kind: 'clin' }, fever: { n: T2('Fever (clinical)', 'बुखार (क्लिनिकल)'), v: 38.6, kind: 'clin' },
  };
  const VER_OBJ = {
    marble: { n: T2('Marble', 'कंचा'), v: 1.64, col: '#2563EB' }, coin: { n: T2('Coin', 'सिक्का'), v: 2.28, col: '#C9A227' }, bead: { n: T2('Glass bead', 'काँच का मनका'), v: 0.98, col: '#14B8A6' },
    rod: { n: T2('Iron rod', 'लोहे की छड़'), v: 1.26, col: '#64748B' }, ball: { n: T2('Steel ball', 'स्टील की गेंद'), v: 1.90, col: '#94A3B8' },
  };
  const SG_OBJ = {
    hair: { n: T2('Human hair', 'बाल'), v: 0.08, col: '#3B2F2F' }, thin: { n: T2('Thin copper wire', 'पतला ताँबे का तार'), v: 0.52, col: '#C8742F' },
    thick: { n: T2('Thick copper wire', 'मोटा ताँबे का तार'), v: 0.91, col: '#C8742F' }, card: { n: T2('Plastic card', 'प्लास्टिक कार्ड'), v: 0.76, col: '#8B3DFF' },
    ball: { n: T2('Steel ball', 'स्टील की गेंद'), v: 3.18, col: '#94A3B8' },
  };
  const HAND = [
    { id: 'little', n: T2('Little sister', 'छोटी बहन'), v: 10 }, { id: 'me', n: T2('Me', 'मैं'), v: 15 }, { id: 'dad', n: T2('Papa', 'पापा'), v: 20 },
  ];
  const SPAN_OBJ = {
    shelf: { n: T2('Book shelf', 'किताबों की अलमारी'), v: 60 }, desk: { n: T2('Desk', 'डेस्क'), v: 120 }, bench: { n: T2('Bench', 'बेंच'), v: 180 }, board: { n: T2('Blackboard', 'श्यामपट'), v: 240 },
  };
  const POOL = { scale: SCALE_OBJ, tape: TAPE_OBJ, balance: BAL_OBJ, cylinder: CYL_OBJ, clock: CLK_OBJ, stopwatch: SW_OBJ, thermometer: THERM_OBJ, vernier: VER_OBJ, 'screw-gauge': SG_OBJ, 'hand-span': SPAN_OBJ };
  const INSTR = Object.keys(POOL);
  const NAMES = {
    scale: T2('Ruler', 'पैमाना'), tape: T2('Measuring tape', 'फ़ीता'), balance: T2('Beam balance', 'तुला'), cylinder: T2('Measuring cylinder', 'मापक सिलिंडर'),
    clock: T2('Clock', 'घड़ी'), stopwatch: T2('Stopwatch', 'स्टॉपवॉच'), thermometer: T2('Thermometer', 'थर्मामीटर'), vernier: T2('Vernier callipers', 'वर्नियर कैलिपर्स'),
    'screw-gauge': T2('Screw gauge', 'पेचमान (स्क्रू गेज)'), 'hand-span': T2('Hand-span', 'बित्ता (हाथ की चौड़ाई)'),
  };
  const SPEC = {
    scale: T2('Smallest mark: 1 mm = 0.1 cm', 'सबसे छोटा निशान: 1 मिमी = 0.1 सेमी'), tape: T2('Smallest mark: 1 cm. 100 cm = 1 m', 'सबसे छोटा निशान: 1 सेमी। 100 सेमी = 1 मी'),
    balance: T2('Smallest weight: 5 g. 1000 g = 1 kg', 'सबसे छोटा बाट: 5 ग्राम। 1000 ग्राम = 1 किग्रा'), cylinder: T2('Smallest mark: 2 mL. 1000 mL = 1 L', 'सबसे छोटा निशान: 2 मिली। 1000 मिली = 1 ली'),
    clock: T2('Smallest mark: 1 minute', 'सबसे छोटा निशान: 1 मिनट'), stopwatch: T2('Least count: 0.01 s', 'अल्पतमांक: 0.01 से'),
    thermometer: T2('Laboratory: 1 °C. Clinical: 0.1 °C', 'प्रयोगशाला: 1 °C। क्लिनिकल: 0.1 °C'),
    vernier: T2('Least count = 1 mm ÷ 10 = 0.1 mm = 0.01 cm', 'अल्पतमांक = 1 मिमी ÷ 10 = 0.1 मिमी = 0.01 सेमी'),
    'screw-gauge': T2('Pitch 0.5 mm ÷ 50 divisions: least count 0.01 mm', 'पिच 0.5 मिमी ÷ 50 भाग: अल्पतमांक 0.01 मिमी'),
    'hand-span': T2('Hands differ, so the count differs', 'हाथ अलग, इसलिए गिनती अलग'),
  };
  const SLIDERS = {
    scale: ['slide', 'eye'], tape: ['pull', 'tight'], balance: [], cylinder: ['pour', 'lower', 'eye'], clock: ['time'], stopwatch: ['length'], thermometer: ['dip'],
    vernier: ['jaw', 'zero'], 'screw-gauge': ['thimble', 'zero'], 'hand-span': ['span'],
  };
  const BAL_IDS = BAL_W.map((w) => 'weight-' + w[0]);
  const EXTRA = { scale: [], tape: [], balance: BAL_IDS, cylinder: [], clock: [], stopwatch: [], thermometer: [], vernier: ['zero-check'], 'screw-gauge': ['zero-check'], 'hand-span': [] };

  // ---------------------------------------------------------------- small SVG helpers
  const T = (x, y, s, o) => { o = o || {}; return `<text x="${x}" y="${y}" font-size="${o.size || 16}" fill="${o.fill || ink}" text-anchor="${o.anchor || 'middle'}" font-weight="${o.weight || 600}"${o.extra ? ' ' + o.extra : ''}>${esc(s)}</text>`; };
  const line = (x1, y1, x2, y2, c, w, extra) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c || ink}" stroke-width="${w || 1}"${extra ? ' ' + extra : ''}/>`;
  let gid = 0;
  const uid = () => 'ms' + (++gid);

  // ---------------------------------------------------------------- CSS
  const CSS = `
.ms { display: flex; flex-direction: column; gap: 12px; font-family: var(--font-body); color: var(--ink); max-width: 980px; margin: 0 auto; }
.ms * { box-sizing: border-box; }
.ms-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
.ms-ttl { font: 800 1.2rem var(--font-display); margin: 0; }
.ms-spec { background: #0F766E; color: #fff; border-radius: 999px; padding: 3px 12px; font-weight: 700; font-size: .84rem; }
.ms-stage, .ms-lensbox { border-radius: 18px; overflow: hidden; box-shadow: 0 6px 18px rgba(6,18,51,.14), inset 0 0 0 1px rgba(6,18,51,.08); background: linear-gradient(180deg, #F3FBF9, #D7EFEA); }
.ms-lensbox { background: linear-gradient(180deg, #FFFDF5, #FDF1CF); box-shadow: 0 6px 18px rgba(245,185,10,.25), inset 0 0 0 2px #F5B90A; }
.ms-lensbox[hidden] { display: none; }
.ms-lenstitle { display: flex; align-items: center; gap: 8px; padding: 8px 14px 0; font: 700 .92rem var(--font-body); color: #7A5600; }
.ms-lenstitle svg { width: 20px; height: 20px; flex: none; }
.ms-svg, .ms-lens { display: block; width: 100%; height: auto; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
.ms-svg text, .ms-lens text { font-family: var(--font-body); }
.ms-drag { cursor: ew-resize; touch-action: none; }
.ms-tray { display: flex; flex-wrap: wrap; gap: 8px; }
.ms-ob { min-height: 48px; display: inline-flex; align-items: center; gap: 8px; border: 2px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 14px; padding: 4px 14px 4px 8px; font: 700 .95rem var(--font-body); transition: transform .12s, border-color .12s, box-shadow .12s; box-shadow: 0 2px 0 rgba(6,18,51,.12); }
.ms-ob:hover { transform: translateY(-1px); border-color: #14B8A6; }
.ms-ob[aria-pressed="true"] { border-color: #0F766E; background: #0F766E; color: #fff; }
.ms-ob.ms-feat:not([aria-pressed="true"]) { border-color: #FF7A1A; }
.ms-ob:disabled { opacity: .45; cursor: not-allowed; transform: none; }
.ms-ob svg { width: 36px; height: 36px; flex: none; }
.ms-ob small { font-weight: 700; opacity: .75; }
.ms-ctls { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px 18px; }
.ms-sl { display: flex; flex-direction: column; gap: 2px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 8px 14px 6px; }
.ms-sl-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-weight: 700; }
.ms-sl output { font: 800 1rem var(--font-display); color: #0F766E; white-space: nowrap; }
:root[data-theme="dark"] .ms-sl output { color: #5EEAD4; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .ms-sl output { color: #5EEAD4; } }
.ms-sl input[type=range] { width: 100%; min-height: 44px; accent-color: #0F766E; margin: 0; }
.ms-sl input[type=range]:disabled { opacity: .45; }
.ms-acts { display: flex; flex-wrap: wrap; gap: 8px; }
.ms-btn { min-height: 48px; border: 0; border-radius: 14px; padding: 0 18px; font: 800 1rem var(--font-body); display: inline-flex; align-items: center; gap: 8px; cursor: pointer; box-shadow: 0 3px 0 rgba(6,18,51,.22); transition: transform .12s, filter .12s; }
.ms-btn:hover { filter: brightness(1.06); transform: translateY(-1px); }
.ms-btn:active { transform: translateY(2px); box-shadow: 0 1px 0 rgba(6,18,51,.22); }
.ms-btn svg { width: 22px; height: 22px; }
.ms-read { background: linear-gradient(180deg, #FFD23F, #F5B90A); color: #1E293B; }
.ms-go { background: linear-gradient(180deg, #3B6EEA, #1D4ED8); color: #fff; }
.ms-alt { background: linear-gradient(180deg, #A266FF, #8B3DFF); color: #fff; }
.ms-ghost { background: var(--surface); color: var(--ink); border: 1.5px solid var(--line); box-shadow: none; font-weight: 700; }
.ms-ans { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 8px 12px; }
.ms-ans label { display: flex; align-items: center; gap: 8px; font-weight: 700; flex: 1 1 220px; }
.ms-ans input { width: 120px; min-height: 48px; font: 800 1.25rem var(--font-display); text-align: center; border: 2px solid var(--line); border-radius: 12px; background: var(--bg); color: var(--ink); padding: 0 8px; }
.ms-ans input:focus-visible, .ms-btn:focus-visible, .ms-ob:focus-visible, .ms-sl input:focus-visible { outline: 3px solid #FF7A1A; outline-offset: 2px; }
.ms-unit { font-weight: 800; color: var(--ink-2); }
.ms-hint { margin: 0; color: var(--ink-2); font-weight: 600; min-height: 1.4em; }
.ms-res { display: flex; flex-direction: column; gap: 8px; min-height: 8px; }
.ms-card { border-radius: 14px; padding: 10px 14px; border: 2px solid; }
.ms-card.ok { background: var(--good-t); border-color: var(--good); }
.ms-card.bad { background: var(--bad-t); border-color: var(--bad); }
.ms-card strong { font: 800 1.05rem var(--font-display); }
.ms-card p { margin: 4px 0 0; }
.ms-card .ms-why { font-size: .95rem; color: var(--ink-2); }
.ms-card .ms-sum { font: 800 1.05rem var(--font-display); }
.ms-svg [role=button] { cursor: pointer; }
.ms-svg [role=button]:focus-visible { outline: 3px solid #FF7A1A; outline-offset: 2px; }
.ms-pop { animation: ms-pop .35s ease-out; }
@keyframes ms-pop { 0% { transform: scale(.92); opacity: .4; } 100% { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .ms-pop { animation: none; } .ms-btn, .ms-ob { transition: none; } }
@media (max-width: 480px) { .ms-ans input { width: 100px; } .ms-btn { padding: 0 14px; } .ms-ob { padding-right: 10px; } }
`;

  // ================================================================ MODES
  // Each mode: make(X) -> controller. X = { api, tt, S, cfg, unit, run, redraw, check }.
  // Controller: pool, vb, lensVb, icon(id), choose(id), sliders(), slide(name, v), draw() -> {main, lens}, align(), hint(),
  // truth() -> {v, lc}, diagnose(ansBase), explain(), plus optional read(), readLabel, buttons(), check(raw), reset(), destroy().
  const MODE = {};
  const mkPool = (obj) => Object.keys(obj).map((id) => Object.assign({ id }, obj[id]));
  const rulerDefs = (id) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE27A"/><stop offset="1" stop-color="#F2B50F"/></linearGradient>
    <linearGradient id="${id}d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EBD9B0"/><stop offset="1" stop-color="#D9C08C"/></linearGradient></defs>`;

  // ---------------------------------------------------------------- scale (ruler)
  const SO = {
    crayon: (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w - h * 0.7}" height="${h}" rx="2" fill="#E53935"/><rect x="${x + w * 0.12}" y="${y}" width="${w * 0.45}" height="${h}" fill="#FFF4D6" opacity=".92"/><path d="M${x + w - h * 0.7} ${y}L${x + w} ${y + h / 2}L${x + w - h * 0.7} ${y + h}z" fill="#B71C1C"/>`,
    eraser: (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#F48FB1"/><rect x="${x + w * 0.3}" y="${y}" width="${w * 0.42}" height="${h}" fill="#2563EB"/><rect x="${x + w * 0.3}" y="${y}" width="${w * 0.42}" height="${h * 0.3}" fill="#fff" opacity=".25"/>`,
    clip: (x, y, w, h) => `<rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}" rx="${h / 2}" fill="none" stroke="#94A3B8" stroke-width="3.4"/><rect x="${x + w * 0.14}" y="${y + h * 0.28}" width="${w * 0.66}" height="${h * 0.44}" rx="${h * 0.22}" fill="none" stroke="#94A3B8" stroke-width="3.4"/>`,
    key: (x, y, w, h) => `<rect x="${x + h * 0.8}" y="${y + h * 0.34}" width="${w - h * 0.8}" height="${h * 0.3}" rx="2" fill="#F5B90A"/><rect x="${x + w - 12}" y="${y + h * 0.6}" width="5" height="${h * 0.3}" fill="#F5B90A"/><rect x="${x + w - 26}" y="${y + h * 0.6}" width="5" height="${h * 0.22}" fill="#F5B90A"/><circle cx="${x + h * 0.5}" cy="${y + h / 2}" r="${h * 0.5}" fill="#F5B90A"/><circle cx="${x + h * 0.5}" cy="${y + h / 2}" r="${h * 0.2}" fill="#FDE7A0"/>`,
    leaf: (x, y, w, h) => `<path d="M${x} ${y + h / 2}Q${x + w * 0.3} ${y - h * 0.15} ${x + w} ${y + h / 2}Q${x + w * 0.3} ${y + h * 1.15} ${x} ${y + h / 2}z" fill="#22C55E"/><path d="M${x} ${y + h / 2}L${x + w} ${y + h / 2}" stroke="#15803D" stroke-width="2.4"/>`,
    stub: (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w * 0.1}" height="${h}" fill="#C0C7D1"/><rect x="${x}" y="${y}" width="${w * 0.05}" height="${h}" fill="#F48FB1"/><rect x="${x + w * 0.1}" y="${y}" width="${w * 0.7}" height="${h}" fill="#F5B90A"/><path d="M${x + w * 0.8} ${y}L${x + w} ${y + h / 2}L${x + w * 0.8} ${y + h}z" fill="#E8C79A"/><path d="M${x + w * 0.94} ${y + h * 0.35}L${x + w} ${y + h / 2}L${x + w * 0.94} ${y + h * 0.65}z" fill="#334155"/>`,
  };
  const SOC = { crayon: '#E53935', eraser: '#2563EB', clip: '#94A3B8', key: '#F5B90A', leaf: '#22C55E', stub: '#F5B90A' };
  const icoWrap = (inner) => `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">${inner}</svg>`;
  MODE.scale = function (X) {
    const st = { id: null, off: 0, eye: 22 };
    const PX = 48, X0 = 40, RY = 188, gap = 0.2;
    const len = () => SCALE_OBJ[st.id].v;
    const shift = () => -gap * Math.tan(st.eye * DEG);
    const rid = uid();
    const maxOff = () => r2(15 - len(), 1);
    return {
      pool: mkPool(SCALE_OBJ), vb: [800, 300], lensVb: [800, 200],
      icon: (id) => icoWrap(SO[id](3, 14, 34, 12)),
      choose(id) {
        st.id = id; const h = hash(id);
        st.off = Math.min(maxOff(), r2(1 + (h % 18) / 10, 1)); st.eye = 22; return true;
      },
      sliders() {
        if (!st.id) return [];
        return [
          { name: 'slide', label: T2('Slide the object along the ruler', 'वस्तु को पैमाने पर खिसकाओ'), min: 0, max: maxOff(), step: 0.1, value: st.off, out: (v) => num(v, 1) + ' ' + unitName('cm', X.api) },
          { name: 'eye', label: T2('Where your eye looks from', 'तुम्हारी आँख कहाँ से देख रही है'), min: -30, max: 30, step: 1, value: st.eye, out: (v) => (v === 0 ? X.tt(T2('straight above', 'सीधे ऊपर')) : Math.abs(v) + '° ' + X.tt(v > 0 ? T2('to the right', 'दाएँ') : T2('to the left', 'बाएँ'))) },
        ];
      },
      slide(n, v) { if (n === 'slide') st.off = r2(clamp(v, 0, maxOff()), 1); else st.eye = Math.round(v); },
      drag: { name: 'slide', toValue: (x) => (x - X0) / PX - len() / 2 },
      align: () => st.id && Math.abs(st.off) < 0.05 && Math.abs(st.eye) <= 3,
      hint() {
        if (!st.id) return T2('Choose something to measure.', 'नापने के लिए कोई चीज़ चुनो।');
        if (st.off > 0.05) return T2('Slide the object so its left end meets the 0 mark.', 'वस्तु को ऐसे खिसकाओ कि उसका बायाँ सिरा 0 के निशान पर आए।');
        if (Math.abs(st.eye) > 3) return T2('Put your eye straight above the mark you read. A slanted look gives a wrong reading (parallax).', 'जिस निशान को पढ़ना है उसके ठीक ऊपर आँख रखो। तिरछा देखने से ग़लत पाठ्यांक आता है (लंबन)।');
        return T2('Good set-up. Press Read, then count the small marks: each is 1 mm.', 'सही व्यवस्था। पढ़ो दबाओ, फिर छोटे निशान गिनो: हर एक 1 मिमी है।');
      },
      truth: () => ({ v: len(), lc: 0.1 }),
      diagnose(a) {
        const tr = st.off + len();
        if (st.off > 0.05 && Math.abs(a - tr) < 0.05) return T2(`That is the mark under the right end, but the object starts at ${num(st.off, 1)} cm, not at 0. Slide it to 0, or subtract the start.`, `यह दाएँ सिरे का निशान है, पर वस्तु 0 से नहीं, ${num(st.off, 1)} सेमी से शुरू होती है। उसे 0 पर लाओ या शुरुआत घटाओ।`);
        if (Math.abs(shift()) >= 0.05 && Math.abs(a - (len() + shift() + (st.off > 0.05 ? st.off : 0))) < 0.05) return T2('You read the slanted view. Move your eye straight above the end and read again.', 'तुमने तिरछी नज़र का पाठ्यांक पढ़ा। आँख को सिरे के ठीक ऊपर लाकर फिर पढ़ो।');
        if (Math.abs(a - len()) <= 0.25) return T2('Very close. Count the small marks after the last number: each one is 1 mm = 0.1 cm.', 'बहुत पास। आख़िरी संख्या के बाद छोटे निशान गिनो: हर एक 1 मिमी = 0.1 सेमी है।');
        return null;
      },
      explain: () => T2(`The object starts at 0 and its right end meets ${num(len(), 1)} cm: ${num(len() * 10, 0)} small marks of 1 mm. Length = ${num(len(), 1)} cm.`, `वस्तु 0 से शुरू होकर ${num(len(), 1)} सेमी पर ख़त्म होती है: 1 मिमी के ${num(len() * 10, 0)} छोटे निशान। लंबाई = ${num(len(), 1)} सेमी।`),
      draw() {
        const o = st.id ? SCALE_OBJ[st.id] : null;
        let m = rulerDefs(rid) + `<rect x="0" y="150" width="800" height="150" fill="url(#${rid}d)"/>` + `<rect x="0" y="150" width="800" height="3" fill="#B8975A" opacity=".5"/>`;
        m += `<rect x="26" y="${RY}" width="748" height="76" rx="7" fill="url(#${rid})" stroke="#B88700" stroke-width="2"/><rect x="26" y="${RY}" width="748" height="9" rx="4" fill="#fff" opacity=".28"/>`;
        for (let i = 0; i <= 150; i++) { const x = X0 + i * 4.8, l = i % 10 === 0 ? 30 : i % 5 === 0 ? 22 : 14; m += line(x, RY, x, RY + l, ink, i % 10 === 0 ? 2 : 1.2); if (i % 10 === 0) m += T(x, RY + 52, i / 10, { size: 18, weight: 700 }); }
        m += T(762, RY + 70, 'cm', { size: 14, anchor: 'end', weight: 800 });
        if (o) {
          const x = X0 + st.off * PX, w = len() * PX, h = 34, y = RY - h - 3, al = this.align();
          m += `<g class="ms-drag" data-drag="slide" aria-hidden="true"><ellipse cx="${x + w / 2}" cy="${RY - 1}" rx="${w / 2}" ry="4" fill="rgba(6,18,51,.18)"/>${SO[st.id](x, y, w, h)}<rect x="${x - 6}" y="${y - 8}" width="${w + 12}" height="${h + 14}" fill="transparent"/></g>`;
          m += line(x, y + 2, x, RY + 30, '#FF6B57', 1.6, 'stroke-dasharray="4 3"') + line(x + w, y + 2, x + w, RY + 30, '#FF6B57', 1.6, 'stroke-dasharray="4 3"');
          m += `<circle cx="${X0}" cy="${RY + 38}" r="9" fill="${al ? '#22C55E' : 'none'}" stroke="${al ? '#15803D' : '#FF6B57'}" stroke-width="2.5"/>` + T(X0, RY + 43, '0', { size: 12, fill: al ? '#fff' : ink, weight: 800 });
          m += T(x + w / 2, y - 10, X.tt(o.n), { size: 24, weight: 800 });
        } else m += T(400, 112, X.tt(T2('Choose something to measure', 'नापने के लिए कोई चीज़ चुनो')), { size: 30, weight: 800, fill: '#0F766E' });
        // the eye, seen from the side
        if (o) {
          const a = st.eye * DEG, px = 678, ey = 84, ex = px + 62 * Math.sin(a), eyy = ey - 62 * Math.cos(a), hit = px - 16 * Math.tan(a);
          m += `<g aria-hidden="true"><rect x="562" y="8" width="230" height="128" rx="12" fill="#fff" opacity=".82"/><rect x="578" y="100" width="198" height="12" rx="2" fill="url(#${rid})" stroke="#B88700"/><rect x="578" y="84" width="100" height="16" fill="${SOC[st.id]}" opacity=".9"/>`;
          m += line(px, 84, px, 112, '#15803D', 2) + line(ex, eyy, hit, 100, '#FF6B57', 2, 'stroke-dasharray="5 3"') + `<circle cx="${hit}" cy="100" r="4" fill="#FF6B57"/><circle cx="${ex}" cy="${eyy}" r="9" fill="#fff" stroke="${ink}" stroke-width="2"/><circle cx="${ex + (px - ex) * 0.2}" cy="${eyy + (ey - eyy) * 0.2}" r="4" fill="${ink}"/>`;
          m += T(668, 130, X.tt(T2('side view', 'बगल से')), { size: 12, weight: 700, fill: '#475569' }) + `</g>`;
        }
        let lens = '', lvb = null;
        if (o && X.S.read) {
          const sh = shift(), objc = SOC[st.id];
          const panel = (k, c, side, title) => {
            const ox = 6 + k * 396, cx = ox + 194, ppc = 250, cid = rid + 'c' + k;
            let g = `<clipPath id="${cid}"><rect x="${ox}" y="6" width="388" height="188" rx="12"/></clipPath><g clip-path="url(#${cid})"><rect x="${ox}" y="6" width="388" height="188" fill="#FFFDF2"/><rect x="${ox}" y="86" width="388" height="108" fill="url(#${rid})"/>`;
            const ex = cx + sh * ppc, base = Math.round(c * 10);
            g += side === 0 ? `<rect x="${ex}" y="34" width="${ox + 388 - ex}" height="52" fill="${objc}"/>` : `<rect x="${ox}" y="34" width="${ex - ox}" height="52" fill="${objc}"/>`;
            for (let i = -11; i <= 11; i++) { const kk = base + i, x = cx + (kk / 10 - c) * ppc, l = kk % 10 === 0 ? 48 : kk % 5 === 0 ? 36 : 24; g += line(x, 86, x, 86 + l, ink, kk % 10 === 0 ? 2.6 : 1.4); if (kk % 10 === 0) g += T(x, 86 + l + 24, num(kk / 10, 0), { size: 24, weight: 800 }); }
            if (Math.abs(sh) > 0.004) g += line(cx, 30, cx, 150, '#64748B', 2, 'stroke-dasharray="5 4"');
            g += line(ex, 28, ex, 150, '#E11D48', 3.4) + T(cx, 26, X.tt(title), { size: 15, weight: 800, fill: '#475569' }) + `</g><rect x="${ox}" y="6" width="388" height="188" rx="12" fill="none" stroke="#F5B90A" stroke-width="2"/>`;
            return g;
          };
          const wrap = (k, s) => (X.narrow ? `<g transform="translate(${-k * 396} ${k * 198})">${s}</g>` : s);
          lens = wrap(0, panel(0, st.off, 0, T2('Left end', 'बायाँ सिरा'))) + wrap(1, panel(1, r2(st.off + len(), 1), 1, T2('Right end', 'दायाँ सिरा')));
          if (X.narrow) lvb = [0, 0, 400, 400];
        }
        return { main: m, lens, lvb };
      },
    };
  };

  // ---------------------------------------------------------------- tape
  MODE.tape = function (X) {
    const st = { id: null, P: 0, tight: 30 };
    const rid = uid();
    const obj = () => TAPE_OBJ[st.id];
    const slack = () => (100 - st.tight) / 100;
    const err = () => Math.round(slack() * 0.06 * obj().v);
    const maxP = () => Math.ceil(obj().v * 1.25);
    const reading = () => obj().v + err();
    return {
      pool: mkPool(TAPE_OBJ), vb: [800, 300], lensVb: [800, 190],
      icon: (id) => icoWrap(TAPE_OBJ[id].kind === 'round' ? '<circle cx="20" cy="20" r="11" fill="#B88B5A"/><circle cx="20" cy="20" r="14" fill="none" stroke="#F5B90A" stroke-width="4"/>' : '<rect x="3" y="12" width="34" height="11" rx="3" fill="#B88B5A"/><rect x="3" y="27" width="34" height="5" fill="#F5B90A"/>'),
      choose(id) { st.id = id; st.P = 0; st.tight = 30; return true; },
      sliders() {
        if (!st.id) return [];
        return [
          { name: 'pull', label: T2('Pull the tape out', 'फ़ीते को बाहर खींचो'), min: 0, max: maxP(), step: 1, value: st.P, out: (v) => v + ' ' + unitName('cm', X.api) },
          { name: 'tight', label: T2('Pull it tight', 'फ़ीते को कसकर तानो'), min: 0, max: 100, step: 5, value: st.tight, out: (v) => X.tt(v >= 95 ? T2('tight and straight', 'कसा और सीधा') : v >= 60 ? T2('a little loose', 'थोड़ा ढीला') : T2('loose', 'ढीला')) },
        ];
      },
      slide(n, v) { if (n === 'pull') st.P = Math.round(clamp(v, 0, maxP())); else st.tight = Math.round(clamp(v, 0, 100) / 5) * 5; },
      align: () => st.id && st.P >= obj().v + err() && st.tight >= 95,
      hint() {
        if (!st.id) return T2('Choose something to measure.', 'नापने के लिए कोई चीज़ चुनो।');
        if (st.P < obj().v) return obj().kind === 'round' ? T2('The tape has not gone all the way round. Pull more.', 'फ़ीता पूरा चक्कर नहीं लगा पाया। और खींचो।') : T2('The tape does not reach the far end yet. Pull more.', 'फ़ीता अभी दूसरे सिरे तक नहीं पहुँचा। और खींचो।');
        if (st.tight < 95) return T2('The tape is loose and sags: it reads too long. Pull it tight and straight.', 'फ़ीता ढीला है और झूल रहा है: पाठ्यांक ज़्यादा आता है। उसे कसकर सीधा तानो।');
        return T2('Good set-up. Press Read and find the mark at the far end.', 'सही व्यवस्था। पढ़ो दबाओ और दूसरे सिरे का निशान खोजो।');
      },
      truth: () => ({ v: obj().v, lc: 1 }),
      diagnose(a) {
        if (err() > 0 && Math.abs(a - reading()) < 0.5) return T2('The tape was loose, so it read too long. Pull it tight and read again.', 'फ़ीता ढीला था, इसलिए पाठ्यांक ज़्यादा आया। उसे कसकर फिर पढ़ो।');
        if (Math.abs(a - obj().v) <= 3) return T2('Close. Each small mark is 1 cm; count the marks after the last number.', 'पास है। हर छोटा निशान 1 सेमी है; आख़िरी संख्या के बाद निशान गिनो।');
        return null;
      },
      explain: () => T2(`The far end meets the ${obj().v} cm mark. ${obj().v} cm = ${num(obj().v / 100, 2)} m, because 100 cm make 1 m.`, `दूसरा सिरा ${obj().v} सेमी के निशान पर है। ${obj().v} सेमी = ${num(obj().v / 100, 2)} मी, क्योंकि 100 सेमी का 1 मी होता है।`),
      draw() {
        const o = st.id ? obj() : null;
        let m = rulerDefs(rid) + `<rect x="0" y="236" width="800" height="64" fill="url(#${rid}d)" opacity=".7"/>`;
        if (!o) return { main: m + T(400, 150, X.tt(T2('Choose something to measure', 'नापने के लिए कोई चीज़ चुनो')), { size: 30, weight: 800, fill: '#0F766E' }), lens: '' };
        const A = slack() * 12, tickEvery = o.kind === 'round' ? 10 : 10;
        const caseSVG = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="0" y="-26" width="66" height="52" rx="14" fill="#F97316" stroke="#9A3412" stroke-width="2"/><circle cx="33" cy="0" r="14" fill="#FED7AA" stroke="#9A3412" stroke-width="2"/><circle cx="33" cy="0" r="5" fill="#9A3412"/></g>`;
        if (o.kind === 'line') {
          const x0 = 60, sc = 520 / o.v, y0 = 203, xe = x0 + st.P * sc, col = st.id === 'board' ? '#14532D' : st.id === 'door' ? '#92400E' : '#B8864B';
          m += `<rect x="${x0}" y="104" width="${o.v * sc}" height="${st.id === 'door' ? 44 : 60}" rx="5" fill="${col}" stroke="rgba(6,18,51,.35)" stroke-width="2"/>` + (st.id === 'door' ? `<circle cx="${x0 + o.v * sc - 18}" cy="126" r="5" fill="#F5B90A"/>` : '');
          m += T(x0 + o.v * sc / 2, st.id === 'door' ? 133 : 142, X.tt(o.n), { size: 18, fill: '#fff', weight: 800 });
          m += line(x0 + o.v * sc, 150, x0 + o.v * sc, 236, '#E11D48', 2, 'stroke-dasharray="5 4"');
          if (st.P > 0) {
            let d = '';
            for (let x = x0; x <= xe; x += 4) d += (x === x0 ? 'M' : 'L') + x + ' ' + (y0 + A * Math.sin((x - x0) / 22)).toFixed(1);
            m += `<path d="${d}" fill="none" stroke="#9A6A00" stroke-width="27" stroke-linecap="butt"/><path d="${d}" fill="none" stroke="#FBD34D" stroke-width="24"/>`;
            const ts = sc * 10 >= 36 ? 10 : 20;
            for (let c = 0; c * 1 <= st.P; c += 1) { const x = x0 + c * sc, y = y0 + A * Math.sin((x - x0) / 22) - 12, l = c % 10 === 0 ? 14 : c % 5 === 0 ? 10 : 6; if (sc * 1 >= 2 || c % 5 === 0) m += line(x, y, x, y + l, ink, c % 10 === 0 ? 1.8 : 1); if (c % ts === 0 && c > 0) m += T(x, y + 26, c, { size: 11, weight: 800 }); }
            m += caseSVG(xe, y0 + A * Math.sin((xe - x0) / 22), 0);
          } else m += caseSVG(x0 - 66, y0, 0);
          m += `<path d="M${x0 - 10} 186v34h14v-9h-6v-25z" fill="#CBD5E1" stroke="#475569" stroke-width="2"/>`;
        } else {
          const cx = 300, cy = 140, r = 70, k = (2 * Math.PI * r) / o.v, R = r + 12, per = 2 * Math.PI * R, frac = clamp(st.P / o.v, 0, 1);
          m += st.id === 'tree' ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#8D5B32" stroke="#5B3A1E" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="${r * 0.7}" fill="none" stroke="#B07A4A" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="${r * 0.4}" fill="none" stroke="#B07A4A" stroke-width="3"/>` : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#2563EB" stroke="#1E3A8A" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="${r * 0.8}" fill="#1D4ED8"/>`;
          m += T(cx, cy + 6, X.tt({ en: o.n.en.replace(/ \(.*\)/, ''), hi: o.n.hi.replace(/ \(.*\)/, '') }), { size: 17, fill: '#fff', weight: 800 });
          if (st.P > 0) {
            m += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#9A6A00" stroke-width="25" stroke-dasharray="${frac * per} ${per}" transform="rotate(-90 ${cx} ${cy})"/><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#FBD34D" stroke-width="22" stroke-dasharray="${frac * per} ${per}" transform="rotate(-90 ${cx} ${cy})"/>`;
            for (let c = 0; c <= Math.min(st.P, o.v); c += 10) { const th = -Math.PI / 2 + (c / o.v) * 2 * Math.PI; m += line(cx + (R - 11) * Math.cos(th), cy + (R - 11) * Math.sin(th), cx + (R - 3) * Math.cos(th), cy + (R - 3) * Math.sin(th), ink, 1.6); }
            const th = -Math.PI / 2 + frac * 2 * Math.PI;
            if (st.P > o.v) { const tl = Math.min(st.P - o.v, o.v * 0.5) * k * 1.4; m += `<rect x="${cx}" y="${cy - R - 11}" width="${tl}" height="22" fill="#FBD34D" stroke="#9A6A00" stroke-width="2"/>` + caseSVG(cx + tl, cy - R, 0); }
            else m += caseSVG(cx + R * Math.cos(th), cy + R * Math.sin(th), th * 180 / Math.PI + 90);
          }
          m += `<path d="M${cx - 8} ${cy - R - 16}h16v9h-6v26h-4v-26h-6z" fill="#CBD5E1" stroke="#475569" stroke-width="2"/>` + T(cx + 190, cy - 20, X.tt(T2('Start and finish', 'शुरुआत और अंत')), { size: 14, anchor: 'start', fill: '#475569' }) + `<path d="M${cx + 188} ${cy - 24}L${cx + 14} ${cy - R - 8}" stroke="#E11D48" stroke-width="2" fill="none" stroke-dasharray="4 4"/>`;
        }
        let lens = '';
        if (X.S.read) {
          const Rv = reading();
          if (st.P < Rv) lens = T(400, 100, X.tt(T2('Too short: pull the tape out more.', 'फ़ीता छोटा है: उसे और बाहर खींचो।')), { size: 26, weight: 800, fill: '#B91C1C' });
          else {
            const cx = 400, ppc = 62, loose = err() > 0;
            lens = `<defs><clipPath id="${rid}t"><rect x="6" y="6" width="788" height="178" rx="12"/></clipPath></defs><g clip-path="url(#${rid}t)"><rect x="6" y="6" width="788" height="178" fill="#FFFDF2"/><rect x="6" y="84" width="788" height="100" fill="#FBD34D"/>`;
            lens += `<rect x="6" y="26" width="${cx - 6}" height="58" fill="${o.kind === 'round' ? '#2563EB' : '#B8864B'}"/>`;
            for (let c = Rv - 7; c <= Rv + 7; c++) { const x = cx + (c - Rv) * ppc; if (c < 0 || c > st.P) continue; const l = c % 10 === 0 ? 50 : c % 5 === 0 ? 38 : 28; lens += line(x, 84, x, 84 + l, ink, c % 10 === 0 ? 2.8 : 1.4) + T(x, 84 + l + 22, c, { size: c % 10 === 0 ? 24 : 19, weight: c % 10 === 0 ? 800 : 700 }); }
            lens += line(cx, 26, cx, 150, '#E11D48', 3.4) + T(cx - 10, 20, X.tt(o.kind === 'round' ? T2('tape meets its start', 'फ़ीता शुरुआत से मिला') : T2('far end of the object', 'वस्तु का दूसरा सिरा')), { size: 17, anchor: 'end', fill: '#475569', weight: 800 });
            if (loose) lens += T(630, 20, X.tt(T2('loose tape', 'ढीला फ़ीता')), { size: 17, anchor: 'end', fill: '#B91C1C', weight: 800 });
            lens += `</g><rect x="6" y="6" width="788" height="178" rx="12" fill="none" stroke="#F5B90A" stroke-width="2"/>`;
          }
        }
        return { main: m, lens, lvb: X.narrow ? [160, 0, 480, 190] : null };
      },
    };
  };

  // ---------------------------------------------------------------- balance
  const BO = {
    eraser: (cx, by) => `<rect x="${cx - 24}" y="${by - 20}" width="48" height="20" rx="5" fill="#F48FB1"/><rect x="${cx - 8}" y="${by - 20}" width="18" height="20" fill="#2563EB"/>`,
    notebook: (cx, by) => `<rect x="${cx - 26}" y="${by - 10}" width="52" height="10" rx="2" fill="#8B3DFF"/><rect x="${cx - 24}" y="${by - 14}" width="48" height="4" fill="#fff"/><rect x="${cx - 26}" y="${by - 18}" width="52" height="5" rx="2" fill="#6D28D9"/>`,
    orange: (cx, by) => `<circle cx="${cx}" cy="${by - 21}" r="21" fill="#FB923C"/><circle cx="${cx - 7}" cy="${by - 28}" r="5" fill="#fff" opacity=".3"/><path d="M${cx} ${by - 42}l5-5" stroke="#15803D" stroke-width="3"/>`,
    apple: (cx, by) => `<path d="M${cx} ${by - 38}c-8-8-26-2-26 16 0 14 10 22 26 22s26-8 26-22c0-18-18-24-26-16z" fill="#DC2626"/><path d="M${cx} ${by - 38}v-9" stroke="#78350F" stroke-width="3"/><path d="M${cx + 2} ${by - 46}c8-6 14-2 14-2s-4 8-14 2z" fill="#22C55E"/>`,
    mango: (cx, by) => `<path d="M${cx - 30} ${by - 22}c0-16 20-26 40-16 14 7 18 26 4 34-14 8-44 6-44-18z" fill="#FACC15"/><path d="M${cx - 20} ${by - 28}c6-8 18-10 28-6" stroke="#F97316" stroke-width="5" fill="none" opacity=".6"/><path d="M${cx + 8} ${by - 40}c4-6 10-6 12-4" stroke="#15803D" stroke-width="3" fill="none"/>`,
    pencilbox: (cx, by) => `<rect x="${cx - 42}" y="${by - 26}" width="84" height="26" rx="5" fill="#14B8A6"/><rect x="${cx - 42}" y="${by - 26}" width="84" height="8" rx="4" fill="#0F766E"/><circle cx="${cx}" cy="${by - 10}" r="4" fill="#FFD23F"/>`,
    sugar: (cx, by) => `<path d="M${cx - 26} ${by - 52}h52l-3 52h-46z" fill="#F1F5F9" stroke="#94A3B8" stroke-width="2"/><rect x="${cx - 22}" y="${by - 38}" width="44" height="18" rx="3" fill="#2563EB"/><text x="${cx}" y="${by - 25}" font-size="12" font-weight="800" fill="#fff" text-anchor="middle">1 kg</text>`,
    brick: (cx, by) => `<rect x="${cx - 40}" y="${by - 34}" width="80" height="34" rx="3" fill="#B45309"/><rect x="${cx - 30}" y="${by - 26}" width="18" height="10" rx="2" fill="#92400E"/><rect x="${cx + 8}" y="${by - 26}" width="18" height="10" rx="2" fill="#92400E"/>`,
  };
  const wDim = (g) => (g >= 500 ? { w: 46, h: 32 } : g >= 100 ? { w: 38, h: 28 } : g >= 20 ? { w: 32, h: 24 } : { w: 28, h: 20 });
  const wIcon = (g) => { const d = wDim(g); return `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><rect x="${20 - d.w / 2 * 0.8}" y="${30 - d.h * 0.8}" width="${d.w * 0.8}" height="${d.h * 0.8}" rx="5" fill="#D9A21B" stroke="#8A6208" stroke-width="2"/><rect x="${20 - d.w * 0.15}" y="${30 - d.h * 0.8 - 4}" width="${d.w * 0.3}" height="5" rx="2" fill="#8A6208"/></svg>`; };
  const gLabel = (g) => (g >= 1000 ? g / 1000 + ' kg' : g + ' g');
  MODE.balance = function (X) {
    const st = { id: null, pan: [], ang: 0, settled: true, stop: null };
    const mass = () => BAL_OBJ[st.id].v;
    const sum = () => st.pan.reduce((a, b) => a + b, 0);
    const used = (g) => st.pan.filter((x) => x === g).length;
    const tgt = () => clamp((mass() - sum()) * 0.4, -10, 10);
    function go() {
      const from = st.ang, to = tgt();
      if (st.stop) st.stop();
      st.settled = false;
      st.stop = X.run(1100, (k) => { st.ang = to + (from - to) * Math.exp(-5 * k) * Math.cos(10 * k); X.redraw(true); }, () => { st.ang = to; st.settled = true; X.redraw(true); X.check(); });
    }
    return {
      pool: mkPool(BAL_OBJ), vb: [800, 340], lensVb: [800, 130],
      icon: (id) => icoWrap(`<g transform="translate(20 35) scale(.4)">${BO[id](0, 0).replace(/<text[^>]*>.*?<\/text>/, '')}</g>`),
      extras: BAL_W.map(([g, n]) => ({ id: 'weight-' + g, g, n })),
      extraName: (e) => T2(gLabel(e.g), gLabel(e.g).replace('kg', 'किग्रा').replace(' g', ' ग्राम')),
      extraLeft: (e) => e.n - used(e.g),
      extraIcon: (e) => wIcon(e.g),
      choose(id) { st.id = id; st.pan = []; st.ang = 0; go(); return true; },
      extra(eid) {
        if (!st.id) return T2('Put something on the left pan first.', 'पहले बाएँ पलड़े पर कोई चीज़ रखो।');
        const g = +eid.slice(7);
        if (used(g) >= BAL_W.find((w) => w[0] === g)[1]) return T2('The box has no more of this weight.', 'डिब्बे में यह बाट और नहीं है।');
        if (st.pan.length >= 8) return T2('The pan is full (8 weights).', 'पलड़ा भर गया है (8 बाट)।');
        st.pan.push(g); st.pan.sort((a, b) => b - a); go(); return null;
      },
      removeWeight(i) { st.pan.splice(i, 1); go(); },
      sliders: () => [],
      slide() {},
      align: () => st.id && st.settled && sum() === mass(),
      hint() {
        if (!st.id) return T2('Choose something to weigh. It goes on the left pan.', 'तौलने के लिए कोई चीज़ चुनो। वह बाएँ पलड़े पर रखी जाएगी।');
        const d = mass() - sum();
        if (d > 0) return T2('The left pan is heavier. Add a weight from the box to the right pan.', 'बायाँ पलड़ा भारी है। डिब्बे से एक बाट दाएँ पलड़े पर रखो।');
        if (d < 0) return T2('The right pan is heavier now. Tap a weight on the pan to take it off, then try a smaller one.', 'अब दायाँ पलड़ा भारी है। पलड़े पर किसी बाट को छूकर हटाओ, फिर छोटा बाट आज़माओ।');
        return T2('The pointer is in the middle: the beam is balanced. Press Read.', 'सूचक बीच में है: तुला संतुलित है। पढ़ो दबाओ।');
      },
      read() { return st.id && sum() === mass() ? null : T2('Balance the beam first: the pointer must stay in the middle.', 'पहले तुला को संतुलित करो: सूचक बीच में रहना चाहिए।'); },
      truth: () => ({ v: mass(), lc: 5 }),
      diagnose(a) {
        if (sum() !== mass() && Math.abs(a - sum()) < 2.5) return T2('The beam is not level yet, so these weights are not equal to the object. Balance it first.', 'तुला अभी बराबर नहीं है, इसलिए ये बाट वस्तु के बराबर नहीं हैं। पहले संतुलित करो।');
        if (st.pan.length && Math.abs(a - st.pan[0]) < 2.5 && st.pan.length > 1) return T2('Add up all the weights on the pan, not only the biggest one.', 'पलड़े पर रखे सारे बाट जोड़ो, केवल सबसे बड़ा नहीं।');
        return null;
      },
      explain() {
        let list = st.pan.slice();
        if (sum() !== mass()) { list = []; let left = mass(); const cnt = {}; BAL_W.forEach(([g, n]) => { while (left >= g && (cnt[g] || 0) < n) { list.push(g); cnt[g] = (cnt[g] || 0) + 1; left -= g; } }); }
        return T2(`When the pointer is in the middle, the weights equal the object: ${list.join(' + ')} = ${mass()} g = ${num(mass() / 1000, 3)} kg.`, `जब सूचक बीच में होता है, तब बाट वस्तु के बराबर होते हैं: ${list.join(' + ')} = ${mass()} ग्राम = ${num(mass() / 1000, 3)} किग्रा।`);
      },
      draw() {
        const a = st.ang * DEG, ca = Math.cos(a), sa = Math.sin(a), px = 400, py = 108, hl = 232;
        const lx = px - hl * ca, ly = py + hl * sa, rx = px + hl * ca, ry = py - hl * sa, drop = 112;
        const bal = st.id && st.settled && sum() === mass();
        const brass = 'url(#' + 'bbr' + ')';
        let m = `<defs><linearGradient id="bbr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F4CE63"/><stop offset=".5" stop-color="#D9A21B"/><stop offset="1" stop-color="#9C6F0A"/></linearGradient><linearGradient id="bst" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#94A3B8"/><stop offset=".5" stop-color="#E2E8F0"/><stop offset="1" stop-color="#94A3B8"/></linearGradient></defs>`;
        m += `<rect x="0" y="312" width="800" height="28" fill="#D9C08C"/><rect x="330" y="296" width="140" height="18" rx="8" fill="#334155"/><rect x="388" y="${py}" width="24" height="190" rx="6" fill="url(#bst)" stroke="#64748B" stroke-width="2"/>`;
        // fixed scale arc and tick marks at the top
        m += `<path d="M ${px - 60} 36 Q ${px} 20 ${px + 60} 36" fill="none" stroke="#64748B" stroke-width="3"/>`;
        for (let i = -3; i <= 3; i++) m += line(px + i * 20, 36 - (i === 0 ? 0 : 2) + (i * i) * 0.45 * -1 + 5, px + i * 20, 24 + (i * i) * 0.45 * -1 + 4, i === 0 ? '#16A34A' : '#64748B', i === 0 ? 4 : 2);
        // strings and pans
        const pan = (x, y, items) => {
          let g = `<path d="M${x - 78} ${y + drop}Q${x - 62} ${y + drop + 26} ${x} ${y + drop + 26}Q${x + 62} ${y + drop + 26} ${x + 78} ${y + drop}z" fill="url(#bst)" stroke="#64748B" stroke-width="2"/>`;
          g = line(x, y, x - 78, y + drop, '#64748B', 1.8) + line(x, y, x + 78, y + drop, '#64748B', 1.8) + g;
          return g + items;
        };
        let leftItems = st.id ? BO[st.id](lx, ly + drop) : '';
        let rightItems = '';
        let cx0 = rx - 70, row = 0, rowTop = 0;
        st.pan.forEach((g, i) => {
          const d = wDim(g);
          if (cx0 + d.w > rx + 72) { cx0 = rx - 70; rowTop += 30; row++; }
          const wy = ry + drop - d.h - rowTop;
          rightItems += `<g class="ms-w" role="button" tabindex="0" data-w="${i}" data-g="${g}" aria-label="${esc(X.tt(T2('Take off ' + gLabel(g), gLabel(g) + ' हटाओ')))}"><rect x="${cx0}" y="${wy}" width="${d.w}" height="${d.h}" rx="5" fill="${brass}" stroke="#8A6208" stroke-width="2"/><rect x="${cx0 + d.w * 0.35}" y="${wy - 5}" width="${d.w * 0.3}" height="6" rx="2" fill="#8A6208"/><text x="${cx0 + d.w / 2}" y="${wy + d.h / 2 + 4}" font-size="${d.w < 30 ? 10 : 12}" font-weight="800" fill="#3B2A04" text-anchor="middle">${gLabel(g).replace(' ', '')}</text></g>`;
          cx0 += d.w + 4;
        });
        m += pan(lx, ly, leftItems) + pan(rx, ry, rightItems);
        // beam with pointer
        m += `<g transform="translate(${px} ${py}) rotate(${-st.ang})"><rect x="-240" y="-8" width="480" height="16" rx="8" fill="url(#bst)" stroke="#475569" stroke-width="2"/><path d="M-6 -8 L0 -72 L6 -8z" fill="${bal ? '#16A34A' : '#E11D48'}" stroke="#7F1D1D" stroke-width="1"/><circle cx="0" cy="0" r="10" fill="#334155"/><circle cx="-240" cy="0" r="6" fill="#475569"/><circle cx="240" cy="0" r="6" fill="#475569"/></g>`;
        if (bal) m += T(px + 84, 40, X.tt(T2('Balanced!', 'संतुलित!')), { size: 22, fill: '#15803D', weight: 800, anchor: 'start' });
        if (!st.id) m += T(px, 240, X.tt(T2('Choose something to weigh', 'तौलने के लिए कोई चीज़ चुनो')), { size: 30, weight: 800, fill: '#0F766E' });
        m += T(lx, ly + drop + 52, X.tt(T2('object', 'वस्तु')), { size: 20, fill: '#475569' }) + T(rx, ry + drop + 52, X.tt(T2('weights', 'बाट')), { size: 20, fill: '#475569' });
        let lens = '';
        let lvb = null;
        if (X.S.read && st.id) {
          const per = X.narrow ? 4 : 8, rows = Math.max(1, Math.ceil(st.pan.length / per)), H = 50 + rows * 74 + 10;
          lens = T(400, 34, X.tt(T2('Weights on the right pan. Add them up.', 'दाएँ पलड़े के बाट। इन्हें जोड़ो।')), { size: X.narrow ? 22 : 24, weight: 800, fill: '#7A5600' });
          for (let r = 0; r < rows; r++) {
            const part = st.pan.slice(r * per, r * per + per), last = r === rows - 1;
            let x = 400 - (part.length * 92 + (last ? 60 : 0) - 20) / 2;
            part.forEach((g, i) => { lens += `<rect x="${x}" y="${52 + r * 74}" width="72" height="56" rx="12" fill="${brass}" stroke="#8A6208" stroke-width="2"/>` + T(x + 36, 88 + r * 74, gLabel(g), { size: 25, weight: 800, fill: '#3B2A04' }) + (r * per + i < st.pan.length - 1 ? T(x + 82, 90 + r * 74, '+', { size: 30, weight: 800 }) : ''); x += 92; });
            if (last) lens += T(x + 2, 92 + r * 74, '= ?', { size: 30, weight: 800, anchor: 'start', fill: '#B91C1C' });
          }
          lvb = X.narrow ? [160, 0, 480, H] : [0, 0, 800, Math.max(130, H)];
        }
        return { main: m, lens, lvb };
      },
    };
  };

  // ---------------------------------------------------------------- measuring cylinder
  MODE.cylinder = function (X) {
    const st = { id: null, pour: 0, lower: 0, eye: 6 };
    const W0 = 50, CX = 400, YB = 300, PM = 2.64;
    const o = () => CYL_OBJ[st.id];
    const solid = () => st.id && o().kind === 'solid';
    const sub = () => clamp((st.lower - 52) / 18, 0, 1);
    const level = () => (solid() ? W0 + o().v * sub() : (o().v * st.pour) / 100);
    const yv = (v) => YB - v * PM;
    const shift = () => 0.4 * st.eye;
    const rid = uid();
    return {
      pool: mkPool(CYL_OBJ), vb: [60, 0, 570, 336], lensVb: [800, 270],
      icon: (id) => (CYL_OBJ[id].kind === 'solid' ? icoWrap(`<path d="M8 26c-2-8 6-14 14-13 9 1 12 8 9 14-3 5-20 6-23-1z" fill="#78716C"/>`) : icoWrap(`<rect x="10" y="6" width="20" height="30" rx="4" fill="#E0F2FE" stroke="#64748B" stroke-width="2"/><rect x="11" y="16" width="18" height="19" rx="3" fill="${CYL_OBJ[id].col}"/>`)),
      choose(id) { st.id = id; st.pour = 0; st.lower = 0; st.eye = 6; return true; },
      sliders() {
        if (!st.id) return [];
        const a = solid() ? { name: 'lower', label: T2('Lower the stone on its string', 'पत्थर को धागे से नीचे उतारो'), min: 0, max: 100, step: 1, value: st.lower, out: (v) => X.tt(v === 0 ? T2('above the water', 'पानी के ऊपर') : v >= 70 ? T2('under the water', 'पानी के नीचे') : T2('going in', 'अंदर जा रहा है')) }
          : { name: 'pour', label: T2('Pour from the beaker', 'बीकर से उड़ेलो'), min: 0, max: 100, step: 1, value: st.pour, out: (v) => (v === 100 ? X.tt(T2('all poured', 'सब उड़ेल दिया')) : v + ' %') };
        return [a, { name: 'eye', label: T2('Height of your eye', 'तुम्हारी आँख की ऊँचाई'), min: -10, max: 10, step: 1, value: st.eye, out: (v) => X.tt(v === 0 ? T2('level with the liquid', 'द्रव के बराबर') : v > 0 ? T2('too high', 'बहुत ऊपर') : T2('too low', 'बहुत नीचे')) }];
      },
      slide(n, v) { if (n === 'eye') st.eye = Math.round(v); else if (n === 'pour') st.pour = Math.round(clamp(v, 0, 100)); else st.lower = Math.round(clamp(v, 0, 100)); },
      align: () => st.id && (solid() ? st.lower >= 70 : st.pour === 100) && Math.abs(st.eye) <= 1,
      hint() {
        if (!st.id) return T2('Choose a liquid or a solid.', 'कोई द्रव या ठोस चुनो।');
        if (solid()) {
          if (st.lower < 70) return T2('First read the water level. Then lower the stone under the water and read again.', 'पहले पानी का स्तर पढ़ो। फिर पत्थर को पानी में डुबोकर दोबारा पढ़ो।');
        } else if (st.pour < 100) return T2('Pour all the liquid into the cylinder.', 'सारा द्रव सिलिंडर में उड़ेलो।');
        if (Math.abs(st.eye) > 1) return T2('Bring your eye level with the bottom of the curved surface. Looking from above or below misreads it.', 'आँख को वक्र सतह के निचले भाग के बराबर लाओ। ऊपर या नीचे से देखने पर ग़लत पाठ्यांक आता है।');
        return solid() ? T2('Good. Read the new level. The stone’s volume is the rise in level.', 'बढ़िया। नया स्तर पढ़ो। पत्थर का आयतन स्तर में बढ़ोतरी है।') : T2('Good. Press Read and look at the bottom of the curve.', 'बढ़िया। पढ़ो दबाओ और वक्र के निचले भाग को देखो।');
      },
      truth: () => ({ v: o().v, lc: 2 }),
      diagnose(a) {
        if (solid()) {
          if (Math.abs(a - (W0 + o().v)) < 1) return T2('That is the final water level. The stone’s volume is the rise: final level minus first level.', 'यह पानी का अंतिम स्तर है। पत्थर का आयतन स्तर की बढ़ोतरी है: अंतिम स्तर में से पहला स्तर घटाओ।');
          if (Math.abs(a - W0) < 1) return T2('That is the water before the stone. Subtract it from the new level.', 'यह पत्थर डालने से पहले का पानी है। इसे नए स्तर में से घटाओ।');
          return null;
        }
        if (st.pour < 100 && Math.abs(a - level()) < 1.5) return T2('You read the level before all the liquid was poured in.', 'तुमने सारा द्रव उड़ेलने से पहले का स्तर पढ़ा।');
        if (Math.abs(shift()) >= 1 && Math.abs(a - (level() + shift())) < 1.2) return T2('Your eye was not level with the liquid, so you misread. Fix the eye height and read again.', 'तुम्हारी आँख द्रव के बराबर नहीं थी, इसलिए पाठ्यांक ग़लत आया। आँख की ऊँचाई ठीक करके फिर पढ़ो।');
        if (Math.abs(a - o().v) <= 5) return T2('Close. Each small mark is 2 mL. Read the bottom of the curve.', 'पास है। हर छोटा निशान 2 मिली है। वक्र का निचला भाग पढ़ो।');
        return null;
      },
      explain: () => solid() ? T2(`First level ${W0} mL, level with the stone ${W0 + o().v} mL. Volume of the stone = ${W0 + o().v} − ${W0} = ${o().v} mL (1 mL = 1 cm³).`, `पहला स्तर ${W0} मिली, पत्थर के साथ ${W0 + o().v} मिली। पत्थर का आयतन = ${W0 + o().v} − ${W0} = ${o().v} मिली (1 मिली = 1 सेमी³)।`)
        : T2(`With the eye level, the bottom of the curve is on the ${o().v} mL mark. Volume = ${o().v} mL = ${num(o().v / 1000, 3)} L.`, `आँख बराबर रखने पर वक्र का निचला भाग ${o().v} मिली के निशान पर है। आयतन = ${o().v} मिली = ${num(o().v / 1000, 3)} ली।`),
      draw() {
        let m = `<defs><linearGradient id="${rid}g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".3" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity=".35"/></linearGradient></defs><rect x="0" y="300" width="800" height="30" fill="#D9C08C"/>`;
        const lv = st.id ? level() : 0, col = st.id && !solid() ? o().col : '#38BDF8';
        const xl = CX - 56, xr = CX + 56;
        if (st.id && !solid()) {
          const rem = o().v * (1 - st.pour / 100), by = 300, bh = rem * 1.9 + 4;
          m += `<path d="M90 ${by - 128}L100 ${by}H208L216 ${by - 128}" fill="#E0F2FE" fill-opacity=".5" stroke="#64748B" stroke-width="3"/>` + (rem > 0.2 ? `<path d="M${100 + (1 - Math.min(1, bh / 128)) * 0} ${by - bh}H208V${by}H100z" fill="${col}" opacity=".95"/>` : '') + `<path d="M90 ${by - 128}L84 ${by - 134}" stroke="#64748B" stroke-width="3"/>` + T(154, by + 22, X.tt(o().n), { size: 18, weight: 800 });
          if (st.pour > 0 && st.pour < 100) m += `<path d="M86 ${by - 132}Q60 ${by - 120} ${CX - 40} 60Q${CX - 10} 40 ${CX - 20} ${yv(lv) - 2}" fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round" opacity=".9"/>`;
        }
        // cylinder
        m += `<ellipse cx="${CX}" cy="${YB + 8}" rx="80" ry="10" fill="#475569"/><rect x="${CX - 34}" y="${YB}" width="68" height="10" fill="#475569"/><rect x="${xl}" y="30" width="112" height="${YB - 30}" rx="6" fill="#E0F2FE" fill-opacity=".55" stroke="#64748B" stroke-width="3"/>`;
        if (st.id && lv > 0) {
          const y = yv(lv);
          m += `<path d="M${xl + 2} ${y - 6}Q${xl + 18} ${y} ${CX} ${y}Q${xr - 18} ${y} ${xr - 2} ${y - 6}V${YB}H${xl + 2}z" fill="${col}" opacity=".92"/>`;
        }
        if (solid() && st.id) {
          const sy = 40 + (st.lower / 100) * 210, r = 14 + o().v * 0.3;
          m += line(CX, 0, CX, sy - r * 0.8, '#475569', 2) + `<ellipse cx="${CX}" cy="${sy}" rx="${r}" ry="${r * 0.82}" fill="#78716C" stroke="#44403C" stroke-width="2"/><ellipse cx="${CX - r * 0.3}" cy="${sy - r * 0.3}" rx="${r * 0.3}" ry="${r * 0.2}" fill="#A8A29E"/>`;
        }
        m += `<rect x="${xl}" y="30" width="112" height="${YB - 30}" rx="6" fill="url(#${rid}g)"/>`;
        for (let v = 0; v <= 100; v += 2) { const y = yv(v), l = v % 10 === 0 ? 24 : 12; m += line(xr, y, xr - l, y, ink, v % 10 === 0 ? 2 : 1.2); if (v % 10 === 0) m += T(xr + 8, y + 5, v, { size: 14, anchor: 'start', weight: 800 }); }
        m += T(xr + 52, 46, 'mL', { size: 13, anchor: 'start', weight: 800, fill: '#475569' });
        // the eye
        if (st.id) {
          const ey = clamp(yv(lv) - st.eye * 11, 24, 296);
          m += `<g aria-hidden="true">` + line(545, ey, xr, yv(lv), '#FF6B57', 2.4, 'stroke-dasharray="5 4"') + `<circle cx="560" cy="${ey}" r="16" fill="#fff" stroke="${ink}" stroke-width="2.5"/><circle cx="553" cy="${ey}" r="7" fill="${ink}"/>` + T(560, ey + 36, X.tt(T2('your eye', 'तुम्हारी आँख')), { size: 17, fill: '#475569', weight: 800 }) + `</g>`;
        } else m += T(500, 160, X.tt(T2('Choose a liquid or a solid', 'कोई द्रव या ठोस चुनो')), { size: 26, weight: 800, fill: '#0F766E', anchor: 'middle' });
        let lens = '';
        if (X.S.read && st.id) {
          const Lc = lv, ppm = 13, Y0 = 135, ty = (v) => Y0 - (v - Lc) * ppm, xl2 = 110, xr2 = 410, cx2 = 260, ap = Lc + shift();
          lens = `<defs><clipPath id="${rid}c"><rect x="6" y="6" width="788" height="258" rx="12"/></clipPath></defs><g clip-path="url(#${rid}c)"><rect x="6" y="6" width="788" height="258" fill="#FFFDF2"/><rect x="${xl2}" y="0" width="${xr2 - xl2}" height="270" fill="#E0F2FE" opacity=".6"/>`;
          const ya = ty(ap);
          lens += `<path d="M${xl2} ${ya - 16}Q${xl2 + 60} ${ya} ${cx2} ${ya}Q${xr2 - 60} ${ya} ${xr2} ${ya - 16}V270H${xl2}z" fill="${col}" opacity=".92"/><path d="M${xl2} ${ya - 16}Q${xl2 + 60} ${ya} ${cx2} ${ya}Q${xr2 - 60} ${ya} ${xr2} ${ya - 16}" fill="none" stroke="#1E293B" stroke-width="2.6"/>`;
          for (let v = Math.ceil(Lc - 12); v <= Lc + 12; v++) if (v % 2 === 0 && v >= 0 && v <= 100) { const y = ty(v), l = v % 10 === 0 ? 78 : 44; lens += line(xr2, y, xr2 - l, y, ink, v % 10 === 0 ? 3 : 1.8); if (v % 10 === 0) lens += T(xr2 + 14, y + 8, v, { size: 24, anchor: 'start', weight: 800 }); }
          if (Math.abs(shift()) >= 0.2) lens += line(xl2, ty(Lc), xr2 - 30, ty(Lc), '#64748B', 2, 'stroke-dasharray="6 5"');
          lens += line(xl2 - 30, ya, xr2 - 30, ya, '#E11D48', 2.4, 'stroke-dasharray="2 4"') + T(350, 28, X.tt(T2('Read the bottom of the curve (meniscus)', 'वक्र का निचला भाग पढ़ो (मेनिस्कस)')), { size: 17, weight: 800, fill: '#475569' }) + T(540, 250, 'mL', { size: 20, fill: '#475569', weight: 800 });
          lens += `</g><rect x="6" y="6" width="788" height="258" rx="12" fill="none" stroke="#F5B90A" stroke-width="2"/>`;
        }
        return { main: m, lens, lvb: X.narrow ? [100, 0, 500, 270] : null };
      },
    };
  };

  // ---------------------------------------------------------------- clock
  const clockWords = (t) => { const h = Math.floor(t / 60) % 12 || 12, m = t % 60; return h + ':' + String(m).padStart(2, '0'); };
  MODE.clock = function (X) {
    const st = { id: null, cur: 0 };
    const CXc = 300, CYc = 232, R = 186;
    const o = () => CLK_OBJ[st.id];
    const part = () => { const h = (Math.floor(o().t / 60) % 12) + (o().pm ? 12 : 0); return h < 12 ? 0 : h < 16 ? 1 : h < 19 ? 2 : 3; };
    const PARTN = [T2('in the morning', 'सुबह'), T2('in the afternoon', 'दोपहर'), T2('in the evening', 'शाम'), T2('at night', 'रात')];
    return {
      pool: mkPool(CLK_OBJ), vb: [600, 460], lensVb: null,
      icon: (id) => icoWrap(`<circle cx="20" cy="20" r="15" fill="#fff" stroke="#1D4ED8" stroke-width="3"/><path d="M20 20V10M20 20l7 4" stroke="#1E293B" stroke-width="2.6" stroke-linecap="round"/>`),
      choose(id) {
        st.id = id; const k = CLK_OBJ[id];
        if (k.kind === 'set') { st.cur = 0; return true; }
        st.cur = 0;
        X.run(1100, (f) => { st.cur = k.t % 720 * ease(f); X.redraw(true); }, () => { st.cur = k.t % 720; X.redraw(true); X.check(); });
        return true;
      },
      sliders() {
        if (!st.id || o().kind !== 'set') return [];
        return [{ name: 'time', label: T2('Turn the hands', 'सुइयाँ घुमाओ'), min: 0, max: 715, step: 5, value: st.cur, out: (v) => clockWords(v) }];
      },
      slide(n, v) { st.cur = Math.round(clamp(v, 0, 715) / 5) * 5; },
      align: () => st.id && (o().kind === 'set' ? st.cur === o().t % 720 : X.S.read),
      hint() {
        if (!st.id) return T2('Choose a time to read or to set.', 'पढ़ने या लगाने के लिए कोई समय चुनो।');
        if (o().kind === 'set') return st.cur === o().t % 720 ? T2('The clock shows the right time. Press Read, then type it.', 'घड़ी सही समय दिखा रही है। पढ़ो दबाओ, फिर समय लिखो।') : T2('Turn the hands to the time in the name. The short hand shows hours, the long hand minutes.', 'नाम में दिए समय पर सुइयाँ घुमाओ। छोटी सुई घंटे, बड़ी सुई मिनट बताती है।');
        return X.S.read ? T2('Type the time as hours:minutes, like 8:45.', 'समय घंटे:मिनट में लिखो, जैसे 8:45।') : T2('Look at both hands, then press Read for help with the numbers.', 'दोनों सुइयाँ देखो, फिर संख्याओं की मदद के लिए पढ़ो दबाओ।');
      },
      truth: () => ({ v: o().t % 720, lc: 1 }),
      check(raw) {
        const t = parseTime(raw);
        if (t == null) return { invalid: T2('Type a time like 8:45.', 'समय ऐसे लिखो: 8:45।') };
        const want = o().t % 720;
        if (t !== want) {
          const hr = Math.floor(t / 60), mi = t % 60, wh = Math.floor(want / 60), wm = want % 60;
          let msg = T2('Look again. The short hand tells the hour, the long hand counts the minutes in fives.', 'फिर से देखो। छोटी सुई घंटा बताती है, बड़ी सुई पाँच-पाँच करके मिनट गिनाती है।');
          if (mi === wh * 5 % 60 && hr === Math.floor(wm / 5)) msg = T2('You swapped the hands. The short, thick hand shows the hour; the long, thin hand shows the minutes.', 'तुमने सुइयाँ उलट दीं। छोटी, मोटी सुई घंटा बताती है; लंबी, पतली सुई मिनट।');
          else if (hr === wh) msg = T2('The hour is right. Now count the minutes: each number is 5 minutes, each small mark is 1 minute.', 'घंटा सही है। अब मिनट गिनो: हर संख्या 5 मिनट है, हर छोटा निशान 1 मिनट।');
          else if (mi === wm) msg = T2('The minutes are right. Check the hour: the short hand is just past which number?', 'मिनट सही हैं। घंटा देखो: छोटी सुई किस संख्या के ठीक आगे है?');
          return { ok: false, msg };
        }
        if (o().kind === 'set' && st.cur !== want) return { ok: false, msg: T2('That is the time you were asked for, but the clock does not show it yet. Turn the hands first.', 'यह माँगा गया समय है, पर घड़ी अभी यह नहीं दिखा रही। पहले सुइयाँ घुमाओ।') };
        return { ok: true };
      },
      explain: () => T2(`The short hand is at the ${Math.floor(o().t / 60) % 12 || 12} side and the long hand is on ${(o().t % 60) / 5} (that is ${o().t % 60} minutes). The time is ${clockWords(o().t)}.`, `छोटी सुई ${Math.floor(o().t / 60) % 12 || 12} के पास है और बड़ी सुई ${(o().t % 60) / 5} पर है (यानी ${o().t % 60} मिनट)। समय ${clockWords(o().t)} है।`),
      draw() {
        const c = st.cur, mA = (c % 60) * 6, hA = (c / 2) % 360;
        let m = `<defs><radialGradient id="ckf" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#E7EEF9"/></radialGradient><linearGradient id="ckr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B6EEA"/><stop offset="1" stop-color="#1E3A8A"/></linearGradient></defs>`;
        m += `<circle cx="${CXc}" cy="${CYc + 8}" r="${R + 22}" fill="rgba(6,18,51,.2)"/><circle cx="${CXc}" cy="${CYc}" r="${R + 22}" fill="url(#ckr)"/><circle cx="${CXc}" cy="${CYc}" r="${R}" fill="url(#ckf)"/>`;
        for (let i = 0; i < 60; i++) { const a = i * 6 * DEG, l = i % 5 === 0 ? 16 : 8, r1 = R - 6, r2 = r1 - l; m += line(CXc + r1 * Math.sin(a), CYc - r1 * Math.cos(a), CXc + r2 * Math.sin(a), CYc - r2 * Math.cos(a), ink, i % 5 === 0 ? 3 : 1.4); }
        for (let i = 1; i <= 12; i++) { const a = i * 30 * DEG; m += T(CXc + 130 * Math.sin(a), CYc - 130 * Math.cos(a) + 12, i, { size: 36, weight: 800, fill: '#1E3A8A' }); }
        if (X.S.read && st.id) for (let i = 1; i <= 12; i++) { const a = i * 30 * DEG; m += T(CXc + (R + 11) * Math.sin(a), CYc - (R + 11) * Math.cos(a) + 5, (i * 5) % 60 || 60, { size: 14, weight: 800, fill: '#fff' }); }
        if (st.id) {
          const hand = (ang, len, w, col, tail) => `<g transform="rotate(${ang} ${CXc} ${CYc})"><path d="M${CXc - w} ${CYc + tail}L${CXc - w * 0.7} ${CYc - len + 12}L${CXc} ${CYc - len}L${CXc + w * 0.7} ${CYc - len + 12}L${CXc + w} ${CYc + tail}z" fill="${col}" stroke="rgba(6,18,51,.35)" stroke-width="1.4"/></g>`;
          m += hand(hA, 92, 7, '#1D4ED8', 18) + hand(mA, 146, 4.2, '#FF7A1A', 24) + `<circle cx="${CXc}" cy="${CYc}" r="10" fill="#061233"/><circle cx="${CXc}" cy="${CYc}" r="4" fill="#FFD23F"/>`;
          if (X.S.read) {
            const lab = (ang, len, txt, col) => { const a = ang * DEG, x = CXc + len * Math.sin(a), y = CYc - len * Math.cos(a), w = txt.length * 8.6 + 18; return `<rect x="${x - w / 2}" y="${y - 14}" width="${w}" height="26" rx="13" fill="${col}"/>` + T(x, y + 5, txt, { size: 14, fill: '#fff', weight: 800 }); };
            m += lab(hA, 62, X.tt(T2('hour hand', 'घंटे की सुई')), '#1D4ED8') + lab(mA, 112, X.tt(T2('minute hand', 'मिनट की सुई')), '#C2410C');
          }
          if (o().kind === 'read') { const p = part(); m += `<g aria-hidden="true">` + (p < 3 ? `<circle cx="64" cy="64" r="26" fill="${p === 0 ? '#FFD23F' : p === 1 ? '#FFB300' : '#FF7A1A'}"/>` + [0, 45, 90, 135, 180, 225, 270, 315].map((d) => line(64 + 34 * Math.cos(d * DEG), 64 + 34 * Math.sin(d * DEG), 64 + 42 * Math.cos(d * DEG), 64 + 42 * Math.sin(d * DEG), p === 2 ? '#FF7A1A' : '#F5B90A', 4)).join('') : `<path d="M82 64a28 28 0 1 1-26-38 22 22 0 0 0 26 38z" fill="#FFF3B0"/><circle cx="30" cy="30" r="2.4" fill="#FFF3B0"/><circle cx="108" cy="30" r="2.4" fill="#FFF3B0"/>`) + `</g>` + T(64, 118, X.tt(PARTN[p]), { size: 16, weight: 800, fill: '#475569' }); }
        } else m += T(CXc, CYc + 8, X.tt(T2('Choose a time', 'कोई समय चुनो')), { size: 30, weight: 800, fill: '#0F766E' });
        return { main: m, lens: '' };
      },
    };
  };

  // ---------------------------------------------------------------- stopwatch
  MODE.stopwatch = function (X) {
    const st = { id: null, running: false, started: false, t0: 0, el: 0, val: null, len: 50, raf: 0, iv: 0 };
    const o = () => SW_OBJ[st.id];
    const period = () => 2 * Math.PI * Math.sqrt(st.len / 100 / 9.8);
    const dur = () => (st.id === 'pendulum' ? 10 * period() : o().v);
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const fmt = (s) => { const mm = Math.floor(s / 60), ss = s - mm * 60; return String(mm).padStart(2, '0') + ':' + (ss < 10 ? '0' : '') + ss.toFixed(2); };
    function stopTick() { if (st.raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(st.raf); if (st.iv) clearInterval(st.iv); st.raf = 0; st.iv = 0; }
    function tick() {
      if (!st.running) return;
      st.el = (now() - st.t0) / 1000;
      X.redraw(true);
      if (!L.reducedMotion() && typeof requestAnimationFrame !== 'undefined') st.raf = requestAnimationFrame(tick);
    }
    function start() {
      st.running = true; st.started = true; st.val = null; st.t0 = now(); st.el = 0;
      if (L.reducedMotion() || typeof requestAnimationFrame === 'undefined') st.iv = setInterval(tick, 100); else st.raf = requestAnimationFrame(tick);
      X.redraw(true); X.check();
    }
    function stop() {
      st.el = (now() - st.t0) / 1000; st.running = false; stopTick();
      st.val = Math.floor(st.el * 100 + 1e-9) / 100; st.el = st.val;
      X.redraw(true); X.check();
    }
    return {
      pool: mkPool(SW_OBJ), vb: [700, 380], lensVb: [800, 150],
      icon: (id) => icoWrap(id === 'pendulum' ? '<path d="M20 4L28 28" stroke="#475569" stroke-width="2"/><circle cx="28" cy="30" r="6" fill="#FF7A1A"/>' : id === 'ball' ? '<path d="M4 12L36 32" stroke="#64748B" stroke-width="4" stroke-linecap="round"/><circle cx="22" cy="18" r="6" fill="#E11D48"/>' : '<circle cx="22" cy="10" r="5" fill="#F5B90A"/><path d="M22 15v12M22 20l8 4M22 27l-6 9M22 27l8 9" stroke="#1E293B" stroke-width="3" stroke-linecap="round" fill="none"/>'),
      choose(id) { stopTick(); Object.assign(st, { id, running: false, started: false, val: null, el: 0 }); return true; },
      sliders() {
        if (st.id !== 'pendulum') return [];
        return [{ name: 'length', label: T2('Length of the string', 'धागे की लंबाई'), min: 25, max: 100, step: 5, value: st.len, dis: st.running || st.started, out: (v) => v + ' cm' }];
      },
      slide(n, v) { if (n === 'length' && !st.running && !st.started) st.len = Math.round(clamp(v, 25, 100) / 5) * 5; },
      buttons() {
        return [{ key: 'instrument', cls: 'ms-go', label: st.running ? T2('Stop', 'रोको') : T2('Start', 'शुरू'), disabled: !st.id || (!st.running && st.started), fn: () => { if (!st.id) return T2('Choose an event first.', 'पहले कोई घटना चुनो।'); if (st.running) stop(); else start(); return null; } }];
      },
      reset() { stopTick(); Object.assign(st, { running: false, started: false, val: null, el: 0 }); },
      align: () => st.id && st.started,
      hint() {
        if (!st.id) return T2('Choose an event to time.', 'समय नापने के लिए कोई घटना चुनो।');
        if (!st.started) return st.id === 'pendulum' ? T2('The stopwatch shows zero. Press Start when the bob is let go. Press Stop after the 10th swing.', 'स्टॉपवॉच शून्य पर है। गोलक छूटते ही शुरू दबाओ। दसवें दोलन के बाद रोको दबाओ।') : T2('The stopwatch shows zero. Press Start together with the event and Stop when it ends.', 'स्टॉपवॉच शून्य पर है। घटना के साथ शुरू दबाओ और ख़त्म होते ही रोको दबाओ।');
        if (st.running) return T2('Watch closely and press Stop at the very end.', 'ध्यान से देखो और अंत में तुरंत रोको दबाओ।');
        return T2('Stopped. Press Read to see the display close up.', 'रुक गई। पास से देखने के लिए पढ़ो दबाओ।');
      },
      read() { return st.val != null ? null : T2('Stop the stopwatch first.', 'पहले स्टॉपवॉच रोको।'); },
      check(raw) {
        if (st.val == null) return { invalid: T2('Run the stopwatch and stop it first.', 'पहले स्टॉपवॉच चलाकर रोको।') };
        const a = parseNum(raw);
        if (a == null) return { invalid: T2('Type a number.', 'संख्या लिखो।') };
        const pend = st.id === 'pendulum', want = pend ? st.val / 10 : st.val;
        if (Math.abs(a - want) <= (pend ? 0.0075 : 0.005)) return { ok: true };
        if (pend && Math.abs(a - st.val) <= 0.005) return { ok: false, msg: T2('That is the time for 10 swings. The time for ONE swing (the period) is that divided by 10.', 'यह 10 दोलनों का समय है। एक दोलन का समय (आवर्तकाल) इसे 10 से भाग देने पर मिलता है।') };
        return { ok: false, msg: pend ? T2('Divide the stopwatch time by 10 to get the time for one swing.', 'स्टॉपवॉच का समय 10 से भाग दो, एक दोलन का समय मिल जाएगा।') : T2('Read the numbers on the display again: minutes : seconds . hundredths.', 'स्क्रीन के अंक फिर पढ़ो: मिनट : सेकंड . सौवाँ भाग।') };
      },
      truth: () => ({ v: st.val || 0, lc: 0.01 }),
      explain() {
        const d = dur(), v = st.val || 0, diff = v - d, react = Math.abs(diff);
        if (react > 1.2) return T2(`The event really lasted ${num(d, 2)} s, but you stopped at ${num(v, 2)} s: ${diff < 0 ? 'too early' : 'too late'}. Start together with the event and press Stop the moment it ends.`, `घटना सचमुच ${num(d, 2)} से चली, पर तुमने ${num(v, 2)} से पर रोकी: ${diff < 0 ? 'बहुत जल्दी' : 'बहुत देर से'}। घटना के साथ ही शुरू करो और ख़त्म होते ही रोको दबाओ।`);
        if (st.id === 'pendulum') return T2(`The stopwatch said ${num(v, 2)} s for 10 swings, so one swing took ${num(v / 10, 3)} s. The real time was ${num(d, 2)} s. Timing many swings makes your slow reaction (${num(react, 2)} s here) matter ten times less.`, `10 दोलनों के लिए स्टॉपवॉच ने ${num(v, 2)} से दिखाया, इसलिए एक दोलन में ${num(v / 10, 3)} से लगे। असली समय ${num(d, 2)} से था। कई दोलन गिनने से तुम्हारी देर की प्रतिक्रिया (यहाँ ${num(react, 2)} से) का असर दस गुना कम हो जाता है।`);
        return T2(`The event really lasted ${num(d, 2)} s and your stopwatch says ${num(v, 2)} s. The ${num(react, 2)} s difference is your reaction time.`, `घटना सचमुच ${num(d, 2)} से चली और तुम्हारी स्टॉपवॉच ${num(v, 2)} से दिखा रही है। ${num(react, 2)} से का अंतर तुम्हारी प्रतिक्रिया का समय है।`);
      },
      destroy: stopTick,
      draw() {
        const e = st.el, run = st.started;
        let m = `<defs><radialGradient id="swb" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#4C7DF0"/><stop offset="1" stop-color="#1E3A8A"/></radialGradient></defs>`;
        m += `<rect x="0" y="330" width="700" height="50" fill="#D9C08C"/>`;
        m += `<rect x="156" y="18" width="30" height="30" rx="6" fill="#94A3B8" stroke="#475569" stroke-width="2"/><rect x="148" y="10" width="46" height="14" rx="6" fill="#F5B90A" stroke="#8A6208" stroke-width="2"/><circle cx="170" cy="204" r="152" fill="rgba(6,18,51,.2)" transform="translate(0 6)"/><circle cx="170" cy="198" r="150" fill="url(#swb)" stroke="#0B1B4D" stroke-width="3"/><circle cx="170" cy="198" r="128" fill="#E8EEFB"/>`;
        m += `<rect x="62" y="154" width="216" height="88" rx="12" fill="#1F2A1E" stroke="#0B1B4D" stroke-width="3"/>`;
        const shown = st.id ? (st.val != null ? st.val : e) : 0;
        m += `<text x="170" y="214" font-size="48" font-weight="700" text-anchor="middle" fill="#B6F59E" font-family="ui-monospace,Menlo,Consolas,monospace">${fmt(shown)}</text>`;
        m += T(170, 262, X.tt(T2('stopwatch', 'स्टॉपवॉच')), { size: 15, weight: 800, fill: '#1E3A8A' }) + T(170, 140, st.running ? X.tt(T2('RUNNING', 'चल रही है')) : st.val != null ? X.tt(T2('STOPPED', 'रुकी')) : X.tt(T2('READY', 'तैयार')), { size: 14, weight: 800, fill: st.running ? '#16A34A' : '#475569' });
        if (!st.id) return { main: m + T(520, 190, X.tt(T2('Choose an event', 'कोई घटना चुनो')), { size: 30, weight: 800, fill: '#0F766E' }), lens: '' };
        // the event
        const D = dur(), f = clamp(e / D, 0, 1), fin = run && e >= D;
        if (st.id === 'ball') {
          const p = Math.min(1, (e / D) * (e / D)), x = 372 + 270 * p, y = 110 + 170 * p;
          m += `<path d="M360 100L660 290" stroke="#92400E" stroke-width="14" stroke-linecap="round"/><path d="M360 94L660 284" stroke="#B8864B" stroke-width="6" stroke-linecap="round"/><circle cx="${x}" cy="${y - 16}" r="16" fill="#E11D48"/><circle cx="${x - 5}" cy="${y - 22}" r="5" fill="#fff" opacity=".4"/>`;
          m += line(668, 250, 668, 300, '#16A34A', 4) + T(668, 244, X.tt(T2('finish', 'अंत')), { size: 14, fill: '#15803D', weight: 800 });
        } else if (st.id === 'runner') {
          const x = 380 + 270 * f;
          m += `<rect x="350" y="236" width="340" height="40" rx="6" fill="#C2410C"/>` + line(380, 236, 380, 276, '#fff', 3) + line(650, 236, 650, 276, '#16A34A', 5) + T(380, 296, X.tt(T2('start', 'शुरुआत')), { size: 14, weight: 800 }) + T(650, 296, X.tt(T2('finish: 50 m', 'अंत: 50 मी')), { size: 14, weight: 800, fill: '#15803D' });
          const lg = Math.sin(e * 14) * 10 * (run && !fin ? 1 : 0);
          m += `<g transform="translate(${x} 0)"><circle cx="0" cy="170" r="11" fill="#F5B90A"/><path d="M0 182v32M0 190l${14 + lg / 2} 14M0 190l-${14 - lg / 2} 14M0 214l${12 + lg} 22M0 214l-${12 - lg} 22" stroke="#1D4ED8" stroke-width="6" stroke-linecap="round" fill="none"/></g>`;
        } else {
          const pl = st.len * 2.4, ang = 20 * Math.cos((2 * Math.PI * e) / period()) * DEG, bx = 520 + pl * Math.sin(ang), by = 40 + pl * Math.cos(ang), n = Math.min(10, Math.floor(e / period()));
          m += `<rect x="430" y="24" width="180" height="14" rx="5" fill="#475569"/><path d="M520 38L${bx} ${by}" stroke="#334155" stroke-width="2.4"/><circle cx="${bx}" cy="${by + 10}" r="14" fill="#FF7A1A" stroke="#9A3412" stroke-width="2"/>`;
          m += T(520, 340, X.tt(T2('swings counted: ', 'गिने दोलन: ')) + (run ? n : 0), { size: 22, weight: 800, fill: n >= 10 ? '#15803D' : '#334155' });
        }
        if (fin && st.id !== 'pendulum') m += T(520, 64, X.tt(T2('Finished! Press Stop.', 'ख़त्म! रोको दबाओ।')), { size: 22, weight: 800, fill: '#15803D' });
        if (st.id === 'pendulum' && run && e >= D) m += T(520, 64, X.tt(T2('10 swings done: press Stop!', '10 दोलन पूरे: रोको दबाओ!')), { size: 20, weight: 800, fill: '#15803D' });
        let lens = '';
        if (X.S.read && st.val != null) lens = `<rect x="150" y="14" width="500" height="112" rx="16" fill="#1F2A1E" stroke="#0B1B4D" stroke-width="4"/><text x="400" y="95" font-size="76" font-weight="700" text-anchor="middle" fill="#B6F59E" font-family="ui-monospace,Menlo,Consolas,monospace">${fmt(st.val)}</text>` + T(400, 142, X.tt(T2('minutes : seconds . hundredths', 'मिनट : सेकंड . सौवाँ भाग')), { size: 15, weight: 800, fill: '#475569' });
        return { main: m, lens, lvb: X.narrow ? [140, 0, 520, 150] : null };
      },
    };
  };

  // ---------------------------------------------------------------- thermometer
  MODE.thermometer = function (X) {
    const st = { id: null, dip: 0, col: 28, settled: true, cat: 'out' };
    const o = () => THERM_OBJ[st.id];
    const clin = () => st.id && o().kind === 'clin';
    const lc = () => (clin() ? 0.1 : 1);
    const AMB = 28, TY0 = 150, TY1 = 8, SURF = 230;
    const tmin = () => (clin() ? 35 : -10), tmax = () => (clin() ? 42 : 110);
    const cat = () => (st.dip >= 95 ? 'bottom' : st.dip >= 50 ? 'in' : 'out');
    const target = () => (st.cat === 'in' ? o().v : st.cat === 'bottom' ? o().v + 2.5 : clin() ? 35 : AMB);
    function go() {
      const from = st.col, to = target();
      st.settled = false;
      X.run(1500, (k) => { st.col = from + (to - from) * ease(k); X.redraw(true); }, () => { st.col = to; st.settled = true; X.redraw(true); X.check(); });
    }
    return {
      pool: mkPool(THERM_OBJ), vb: [90, 0, 440, 340], lensVb: [800, 240],
      icon: (id) => icoWrap(THERM_OBJ[id].kind === 'clin' ? '<rect x="6" y="17" width="28" height="7" rx="3" fill="#E2E8F0" stroke="#64748B" stroke-width="2"/><circle cx="8" cy="20" r="4" fill="#94A3B8"/>' : '<rect x="17" y="3" width="6" height="26" rx="3" fill="#fff" stroke="#64748B" stroke-width="2"/><circle cx="20" cy="31" r="5" fill="#E11D48"/><rect x="19" y="14" width="2" height="16" fill="#E11D48"/>'),
      choose(id) { st.id = id; st.dip = 0; st.cat = 'out'; st.col = clin() ? 35 : AMB; st.settled = true; return true; },
      sliders() {
        if (!st.id) return [];
        return [{ name: 'dip', label: clin() ? T2('Hold the thermometer under the arm', 'थर्मामीटर को बगल में रखो') : T2('Lower the thermometer', 'थर्मामीटर को नीचे उतारो'), min: 0, max: 100, step: 1, value: st.dip, out: (v) => X.tt(v >= 95 ? T2('touching the bottom', 'तली को छू रहा है') : v >= 50 ? T2('bulb in the liquid', 'बल्ब द्रव में') : T2('bulb outside', 'बल्ब बाहर')) }];
      },
      slide(n, v) { st.dip = Math.round(clamp(v, 0, 100)); const c = cat(); if (c !== st.cat) { st.cat = c; go(); } },
      align: () => st.id && st.cat === 'in' && st.settled,
      hint() {
        if (!st.id) return T2('Choose something to measure the temperature of.', 'तापमान नापने के लिए कोई चीज़ चुनो।');
        if (st.cat === 'out') return T2('Lower the thermometer until the whole bulb is in the liquid.', 'थर्मामीटर को तब तक नीचे उतारो जब तक पूरा बल्ब द्रव में न आ जाए।');
        if (st.cat === 'bottom') return T2('The bulb touches the bottom, which is warmer or colder than the liquid. Lift it a little.', 'बल्ब तली को छू रहा है, जो द्रव से अलग तापमान की हो सकती है। उसे थोड़ा ऊपर उठाओ।');
        if (!st.settled) return T2('Wait. The column is still moving.', 'रुको। स्तंभ अभी चल रहा है।');
        return T2('The column has stopped. Keep the bulb in the liquid, press Read and look at the top of the column.', 'स्तंभ रुक गया है। बल्ब को द्रव में रखो, पढ़ो दबाओ और स्तंभ का ऊपरी सिरा देखो।');
      },
      truth: () => ({ v: o().v, lc: lc() }),
      diagnose(a) {
        if (st.cat !== 'in' && Math.abs(a - st.col) <= lc() * 1.5) return T2('You read it with the bulb out of the liquid (or touching the bottom). Read while the bulb is in the liquid.', 'तुमने बल्ब द्रव से बाहर (या तली पर) रहते हुए पढ़ा। बल्ब द्रव में रहते हुए पढ़ो।');
        if (!st.settled) return T2('The column was still moving. Wait until it stops.', 'स्तंभ अभी चल रहा था। उसके रुकने तक रुको।');
        if (Math.abs(a - o().v) <= lc() * 3) return T2(clin() ? 'Close. Each small mark is 0.1 °C; count the marks after the last whole number.' : 'Close. Each small mark is 1 °C; count the marks after the last number.', clin() ? 'पास है। हर छोटा निशान 0.1 °C है; आख़िरी पूर्ण संख्या के बाद निशान गिनो।' : 'पास है। हर छोटा निशान 1 °C है; आख़िरी संख्या के बाद निशान गिनो।');
        return null;
      },
      explain: () => T2(`With the bulb in the liquid and the column still, the top of the column is at ${num(o().v, clin() ? 1 : 0)} °C.`, `बल्ब द्रव में और स्तंभ स्थिर होने पर, स्तंभ का ऊपरी सिरा ${num(o().v, clin() ? 1 : 0)} °C पर है।`),
      draw() {
        let m = `<defs><linearGradient id="thg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".5" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity=".6"/></linearGradient></defs><rect x="0" y="316" width="800" height="24" fill="#D9C08C"/>`;
        if (!st.id) return { main: m + T(400, 170, X.tt(T2('Choose something to measure', 'नापने के लिए कोई चीज़ चुनो')), { size: 30, weight: 800, fill: '#0F766E' }), lens: '' };
        const liqc = { tap: '#BAE6FD', milk: '#FBF7EA', tea: '#C2763E', ice: '#CFEFFB', boiling: '#BAE6FD' }[st.id];
        const bx = 120, bw = 190, TX = 215;
        if (clin()) m += `<path d="M${bx} 200Q${bx} 190 ${bx + 20} 190H${bx + bw - 20}Q${bx + bw} 190 ${bx + bw} 200V300Q${bx + bw} 316 ${bx + bw - 20} 316H${bx + 20}Q${bx} 316 ${bx} 300z" fill="#F5C7A1" stroke="#C98B5A" stroke-width="3"/>` + T(bx + bw / 2, 306, X.tt(T2('under the arm', 'बगल में')), { size: 18, weight: 800, fill: '#7C4A1D' });
        else m += `<path d="M${bx} 160V300Q${bx} 316 ${bx + 18} 316H${bx + bw - 18}Q${bx + bw} 316 ${bx + bw} 300V160" fill="#E0F2FE" fill-opacity=".35" stroke="#64748B" stroke-width="3"/><rect x="${bx + 2}" y="${SURF}" width="${bw - 4}" height="${316 - SURF}" rx="8" fill="${liqc}" opacity=".95"/>${st.id === 'ice' ? '<rect x="150" y="236" width="38" height="34" rx="6" fill="#fff" opacity=".8"/><rect x="230" y="246" width="34" height="30" rx="6" fill="#fff" opacity=".8"/>' : ''}` + (st.id === 'boiling' ? [150, 190, 240, 270].map((x, i) => `<circle cx="${x}" cy="${290 - i * 14}" r="${5 - i % 2}" fill="#fff" opacity=".7"/>`).join('') : '');
        // thermometer
        const dy = 20 + 1.15 * st.dip, py = (T) => TY0 - ((T - tmin()) / (tmax() - tmin())) * (TY0 - TY1);
        const colY = py(clamp(st.col, tmin(), tmax()));
        m += `<g transform="translate(${TX} ${dy})"><rect x="-13" y="-6" width="26" height="${TY0 + 16}" rx="13" fill="#F8FAFC" stroke="#64748B" stroke-width="2.5"/><circle cx="0" cy="${TY0 + 18}" r="17" fill="${clin() ? '#CBD5E1' : '#FCA5A5'}" stroke="#64748B" stroke-width="2.5"/><rect x="-4" y="${colY}" width="8" height="${TY0 + 18 - colY}" rx="4" fill="${clin() ? '#64748B' : '#DC2626'}"/><circle cx="0" cy="${TY0 + 18}" r="12" fill="${clin() ? '#64748B' : '#DC2626'}"/>`;
        const n = clin() ? 7 : 12;
        for (let i = 0; i <= n; i++) { const T0 = tmin() + (i * (tmax() - tmin())) / n, y = py(T0); m += line(13, y, 22, y, ink, 1.6) + T(26, y + 4, num(T0, 0), { size: 10, anchor: 'start', weight: 800 }); }
        m += `</g>`;
        if (st.cat === 'in' || st.cat === 'bottom') m += `<rect x="${bx + 2}" y="${SURF}" width="${bw - 4}" height="${316 - SURF}" rx="8" fill="${clin() ? 'transparent' : liqc}" opacity=".25"/>`;
        m += T(bx + bw / 2, 336 - 2, X.tt(o().n), { size: 18, weight: 800, fill: ink });
        let lens = '';
        if (X.S.read) {
          const l = lc(), ppu = 17, cy = 118, base = Math.round(st.col / l), cx = 330, per = clin() ? 10 : 10;
          lens = `<defs><clipPath id="thc"><rect x="6" y="6" width="788" height="228" rx="12"/></clipPath></defs><g clip-path="url(#thc)"><rect x="6" y="6" width="788" height="228" fill="#FFFDF2"/><rect x="${cx - 40}" y="0" width="80" height="250" rx="10" fill="#fff" stroke="#64748B" stroke-width="3"/>`;
          const yc = cy - (st.col / l - st.col / l) * ppu;
          lens += `<rect x="${cx - 8}" y="${yc}" width="16" height="250" fill="${clin() ? '#64748B' : '#DC2626'}"/><circle cx="${cx}" cy="${yc}" r="8" fill="${clin() ? '#64748B' : '#DC2626'}"/>`;
          for (let k = base - 8; k <= base + 8; k++) { const y = cy - (k - st.col / l) * ppu, major = k % per === 0, mid = k % 5 === 0; lens += line(cx + 40, y, cx + 40 + (major ? 54 : mid ? 40 : 26), y, ink, major ? 3 : 1.6); if (major) lens += T(cx + 104, y + 8, num((k * l), clin() ? 0 : 0), { size: 24, anchor: 'start', weight: 800 }); }
          lens += `<rect x="${cx - 140}" y="${cy - 1.5}" width="100" height="3" fill="#E11D48"/>` + T(cx - 140, cy - 12, X.tt(T2('top of the column', 'स्तंभ का ऊपरी सिरा')), { size: 18, weight: 800, fill: '#475569', anchor: 'start' }).replace('<text', '<text paint-order="stroke" stroke="#FFFDF2" stroke-width="5"') + T(cx + 190, 40, '°C', { size: 26, weight: 800, fill: '#475569' });
          lens += `</g><rect x="6" y="6" width="788" height="228" rx="12" fill="none" stroke="#F5B90A" stroke-width="2"/>`;
        }
        return { main: m, lens, lvb: X.narrow ? [40, 0, 520, 240] : null };
      },
    };
  };

  // ---------------------------------------------------------------- vernier callipers
  MODE.vernier = function (X) {
    const st = { id: null, jaw: 0, zero: 2 };
    const X0 = 70, PXC = 50;
    const rid = uid();
    const size = () => VER_OBJ[st.id].v;
    const e = () => st.zero * 0.01;
    const open = () => (st.id ? Math.max(st.jaw, size()) : st.jaw);
    const R = () => r2(open() + e(), 2);
    const parts = () => { const Rmm = Math.round(R() * 100) / 10, mF = Math.floor(Rmm + 1e-9), k = Math.round((Rmm - mF) * 10); return { Rmm, mF, k }; };
    return {
      pool: mkPool(VER_OBJ), vb: [800, 300], lensVb: [800, 240], readNoObj: true,
      icon: (id) => icoWrap(`<circle cx="20" cy="20" r="${5 + VER_OBJ[id].v * 4.2}" fill="${VER_OBJ[id].col}"/><circle cx="${17}" cy="${17}" r="3" fill="#fff" opacity=".4"/>`),
      choose(id) { if (st.id === id) { st.id = null; st.jaw = 0; return false; } st.id = id; st.jaw = r2(VER_OBJ[id].v + 1.2, 2); return true; },
      sliders() {
        return [
          { name: 'jaw', label: T2('Slide the jaw', 'जबड़े को खिसकाओ'), min: 0, max: 6, step: 0.01, value: st.jaw, out: () => X.tt(!st.id ? (st.jaw === 0 ? T2('jaws closed', 'जबड़े बंद') : T2('jaws open', 'जबड़े खुले')) : st.jaw <= size() + 1e-9 ? T2('touching the object', 'वस्तु को छू रहा है') : T2('open', 'खुला')) },
          { name: 'zero', label: T2('Zero error of this instrument', 'इस उपकरण की शून्य त्रुटि'), min: -5, max: 5, step: 1, value: st.zero, out: (v) => X.tt(v === 0 ? T2('none', 'कोई नहीं') : v > 0 ? T2('has a positive error', 'धनात्मक त्रुटि है') : T2('has a negative error', 'ऋणात्मक त्रुटि है')) },
        ];
      },
      slide(n, v) {
        if (n === 'zero') { st.zero = Math.round(clamp(v, -5, 5)); return; }
        v = r2(clamp(v, 0, 6), 2);
        st.jaw = st.id && v <= size() + 0.04 ? size() : v;
      },
      drag: { name: 'jaw', toValue: (x) => (x - X0) / PXC },
      buttons() {
        return [{ key: 'zero-check', cls: 'ms-ghost', label: T2('Close the jaws: check the zero', 'जबड़े बंद करो: शून्य जाँचो'), fn: () => { st.id = null; st.jaw = 0; X.unplace(); return null; } }];
      },
      clear() { st.id = null; st.jaw = 0; },
      align: () => st.id && st.jaw <= size() + 1e-9,
      hint() {
        if (!st.id) return T2('With the jaws closed, look at the vernier zero. If it is not on the main zero, there is a zero error. Then choose an object.', 'जबड़े बंद करके वर्नियर के शून्य को देखो। यदि वह मुख्य पैमाने के शून्य पर नहीं है, तो शून्य त्रुटि है। फिर कोई वस्तु चुनो।');
        if (st.jaw > size() + 1e-9) return T2('Slide the jaw until it just touches the object.', 'जबड़े को तब तक खिसकाओ जब तक वह वस्तु को बस छू न ले।');
        return T2('The jaws grip the object. Press Read. Then correct the reading for the zero error.', 'जबड़े वस्तु को पकड़े हैं। पढ़ो दबाओ। फिर पाठ्यांक को शून्य त्रुटि के लिए ठीक करो।');
      },
      truth: () => ({ v: size(), lc: 0.01 }),
      diagnose(a) {
        const ee = e();
        if (ee !== 0 && Math.abs(a - R()) < 0.005) return T2('That is the observed reading. This instrument has a zero error, so subtract it: corrected reading = observed − zero error.', 'यह देखा गया पाठ्यांक है। इस उपकरण में शून्य त्रुटि है, इसलिए उसे घटाओ: सही पाठ्यांक = देखा गया − शून्य त्रुटि।');
        if (ee !== 0 && Math.abs(a - (open() - ee)) < 0.005) return T2('You used the zero error with the wrong sign. A positive error is subtracted; a negative error is added.', 'तुमने शून्य त्रुटि का चिह्न उल्टा लगाया। धनात्मक त्रुटि घटाई जाती है; ऋणात्मक त्रुटि जोड़ी जाती है।');
        if (Math.abs(a - size()) <= 0.1) return T2('Close. Find which vernier line meets a main-scale line: that number times 0.01 cm is added to the main scale reading.', 'पास है। देखो वर्नियर की कौन-सी रेखा मुख्य पैमाने की रेखा से मिलती है: उस संख्या को 0.01 सेमी से गुणा करके मुख्य पाठ्यांक में जोड़ो।');
        return null;
      },
      explain() {
        const { mF, k } = parts(), ee = e();
        return T2(`Main scale: ${num(mF / 10, 1)} cm. Vernier line ${k} meets a main-scale line: ${k} × 0.01 = ${num(k * 0.01, 2)} cm. Observed reading = ${num(R(), 2)} cm. ${ee === 0 ? 'No zero error.' : 'Zero error = ' + (ee > 0 ? '+' : '') + num(ee, 2) + ' cm, so corrected reading = ' + num(R(), 2) + ' ' + (ee > 0 ? '−' : '+') + ' ' + num(Math.abs(ee), 2) + ' = ' + num(size(), 2) + ' cm.'}`,
          `मुख्य पैमाना: ${num(mF / 10, 1)} सेमी। वर्नियर की रेखा ${k} मुख्य पैमाने की रेखा से मिलती है: ${k} × 0.01 = ${num(k * 0.01, 2)} सेमी। देखा गया पाठ्यांक = ${num(R(), 2)} सेमी। ${ee === 0 ? 'कोई शून्य त्रुटि नहीं।' : 'शून्य त्रुटि = ' + (ee > 0 ? '+' : '') + num(ee, 2) + ' सेमी, इसलिए सही पाठ्यांक = ' + num(R(), 2) + ' ' + (ee > 0 ? '−' : '+') + ' ' + num(Math.abs(ee), 2) + ' = ' + num(size(), 2) + ' सेमी।'}`);
      },
      draw() {
        const op = open(), xj = X0 + op * PXC, xz = X0 + R() * PXC;
        let m = `<defs><linearGradient id="${rid}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F1F5F9"/><stop offset=".5" stop-color="#CBD5E1"/><stop offset="1" stop-color="#94A3B8"/></linearGradient></defs><rect x="0" y="262" width="800" height="38" fill="#D9C08C"/>`;
        m += `<rect x="40" y="84" width="740" height="56" rx="6" fill="url(#${rid}s)" stroke="#64748B" stroke-width="2"/>`;
        for (let mm = 0; mm <= 140; mm++) { const x = X0 + mm * 5, l = mm % 10 === 0 ? 24 : mm % 5 === 0 ? 17 : 11; m += line(x, 140, x, 140 - l, ink, mm % 10 === 0 ? 1.8 : 1); if (mm % 10 === 0 && mm <= 130) m += T(x, 142 - 32, mm / 10, { size: 16, weight: 800 }); }
        m += T(770, 110, 'cm', { size: 16, weight: 800 });
        // fixed jaw, sliding jaw and the vernier plate
        m += `<path d="M${X0 - 22} 84V252H${X0}V150H${X0}V84z" fill="url(#${rid}s)" stroke="#64748B" stroke-width="2"/>`;
        m += `<g class="ms-drag" data-drag="jaw" aria-hidden="true"><path d="M${xj} 140V252H${xj + 22}V176H${xj + 120}V84H${xj + 22}V140z" fill="url(#${rid}s)" stroke="#64748B" stroke-width="2"/><rect x="${xj - 6}" y="130" width="140" height="130" fill="transparent"/></g>`;
        m += `<rect x="${xz}" y="140" width="45" height="30" fill="#E0F2FE" stroke="#0369A1" stroke-width="1.5"/>`;
        for (let j = 0; j <= 10; j++) { const x = xz + j * 4.5; m += line(x, 140, x, 140 + (j % 5 === 0 ? 14 : 9), '#0C4A6E', 1); }
        m += T(xz, 188, '0', { size: 14, weight: 800, fill: '#0C4A6E' }) + T(xz + 45, 188, '10', { size: 14, weight: 800, fill: '#0C4A6E' });
        if (st.id) {
          const r = size() * PXC / 2, cx = X0 + size() * PXC / 2, o = VER_OBJ[st.id];
          m += `<circle cx="${cx}" cy="198" r="${r}" fill="${o.col}" stroke="rgba(6,18,51,.4)" stroke-width="2"/><circle cx="${cx - r * 0.3}" cy="${198 - r * 0.3}" r="${Math.max(2, r * 0.22)}" fill="#fff" opacity=".4"/>` + T(X0 + 60, 284, X.tt(o.n), { size: 20, weight: 800 });
        }
        m += T(X0 - 30, 72, X.tt(T2('main scale', 'मुख्य पैमाना')), { size: 15, anchor: 'start', fill: '#475569', weight: 700 }) + T(xz + 120, 214, X.tt(T2('vernier scale', 'वर्नियर पैमाना')), { size: 16, fill: '#0369A1', weight: 800, anchor: 'start' });
        let lens = '', lvb = null;
        if (X.S.read) {
          const { Rmm, mF, k } = parts(), nar = X.narrow, W = nar ? 450 : 800, px = nar ? 38 : 56, ws = mF - 1, xm = (mm) => (nar ? 20 : 30) + (mm - ws) * px;
          lens = `<defs><clipPath id="${rid}c"><rect x="6" y="6" width="${W - 12}" height="228" rx="12"/></clipPath></defs><g clip-path="url(#${rid}c)"><rect x="6" y="6" width="${W - 12}" height="228" fill="#FFFDF2"/><rect x="6" y="40" width="${W - 12}" height="72" fill="#E2E8F0"/><rect x="6" y="112" width="${W - 12}" height="82" fill="#BAE6FD"/>`;
          for (let mm = Math.max(0, ws); mm <= ws + (nar ? 12 : 15); mm++) { const x = xm(mm), l = mm % 10 === 0 ? 46 : mm % 5 === 0 ? 34 : 24; lens += line(x, 112, x, 112 - l, ink, mm % 10 === 0 ? 2.8 : 1.6); if (mm % 10 === 0) lens += T(x, 112 - l - 8, num(mm / 10, 0) + ' cm', { size: 22, weight: 800 }); }
          for (let j = 0; j <= 10; j++) { const x = xm(Rmm + 0.9 * j), hit = j === k; lens += line(x, 112, x, 112 + (hit ? 62 : j % 5 === 0 ? 46 : 34), hit ? '#FF7A1A' : '#0C4A6E', hit ? 4.4 : 2.2); lens += T(x, 112 + 66 + 16, j, { size: 20, weight: 800, fill: hit ? '#C2410C' : '#0C4A6E' }); }
          lens += line(xm(Rmm), 26, xm(Rmm), 112, '#E11D48', 3) + T(xm(Rmm) + 8, 34, X.tt(T2('vernier zero', 'वर्नियर शून्य')), { size: 17, weight: 800, fill: '#E11D48', anchor: 'start' });
          lens += T(W / 2, 224, X.tt(T2('main scale: 1 mm. 10 vernier divisions = 9 mm', 'मुख्य पैमाना: 1 मिमी। 10 वर्नियर भाग = 9 मिमी')), { size: nar ? 15 : 16, weight: 700, fill: '#475569' });
          lens += `</g><rect x="6" y="6" width="${W - 12}" height="228" rx="12" fill="none" stroke="#F5B90A" stroke-width="2"/>`;
          lvb = [0, 0, W, 240];
        }
        return { main: m, lens, lvb };
      },
    };
  };

  // ---------------------------------------------------------------- screw gauge
  MODE['screw-gauge'] = function (X) {
    const st = { id: null, th: 0, zero: 3 };
    const AX = 150, PM = 32, ZX = 365, YA = 150;
    const rid = uid();
    const size = () => SG_OBJ[st.id].v;
    const e = () => st.zero * 0.01;
    const open = () => (st.id ? Math.max(st.th, size()) : st.th);
    const R = () => r2(open() + e(), 2);
    const parts = () => { const r = R(), lsr = Math.floor(r / 0.5 + 1e-9) * 0.5, csr = Math.round((r - lsr) / 0.01); return { lsr: r2(lsr, 1), csr }; };
    return {
      pool: mkPool(SG_OBJ), vb: [800, 300], lensVb: [800, 240], readNoObj: true,
      icon: (id) => icoWrap(`<circle cx="20" cy="20" r="${3 + SG_OBJ[id].v * 3.4}" fill="${SG_OBJ[id].col}"/>`),
      choose(id) { if (st.id === id) { st.id = null; st.th = 0; return false; } st.id = id; st.th = r2(SG_OBJ[id].v + 1.5, 2); return true; },
      sliders() {
        return [
          { name: 'thimble', label: T2('Turn the thimble', 'थिंबल को घुमाओ'), min: 0, max: 6, step: 0.01, value: st.th, out: () => X.tt(!st.id ? (st.th === 0 ? T2('closed', 'बंद') : T2('open', 'खुला')) : st.th <= size() + 1e-9 ? T2('clicks on the object', 'वस्तु पर क्लिक करता है') : T2('open', 'खुला')) },
          { name: 'zero', label: T2('Zero error of this instrument', 'इस उपकरण की शून्य त्रुटि'), min: -5, max: 5, step: 1, value: st.zero, out: (v) => X.tt(v === 0 ? T2('none', 'कोई नहीं') : v > 0 ? T2('has a positive error', 'धनात्मक त्रुटि है') : T2('has a negative error', 'ऋणात्मक त्रुटि है')) },
        ];
      },
      slide(n, v) {
        if (n === 'zero') { st.zero = Math.round(clamp(v, -5, 5)); return; }
        v = r2(clamp(v, 0, 6), 2);
        st.th = st.id && v <= size() + 0.03 ? size() : v;
      },
      buttons() {
        return [{ key: 'zero-check', cls: 'ms-ghost', label: T2('Close the gap: check the zero', 'खाली जगह बंद करो: शून्य जाँचो'), fn: () => { st.id = null; st.th = 0; X.unplace(); return null; } }];
      },
      clear() { st.id = null; st.th = 0; },
      align: () => st.id && st.th <= size() + 1e-9,
      hint() {
        if (!st.id) return T2('With the gap closed, look at the circular scale. If its zero is not on the line, there is a zero error. Then choose an object.', 'खाली जगह बंद करके वृत्ताकार पैमाना देखो। यदि उसका शून्य रेखा पर नहीं है, तो शून्य त्रुटि है। फिर कोई वस्तु चुनो।');
        if (st.th > size() + 1e-9) return T2('Turn the thimble until the gap just closes on the object.', 'थिंबल को तब तक घुमाओ जब तक खाली जगह वस्तु पर बस बंद न हो जाए।');
        return T2('Gripped. Press Read: the linear scale gives whole and half millimetres, the circular scale gives hundredths.', 'पकड़ लिया। पढ़ो दबाओ: रैखिक पैमाना पूरे और आधे मिलीमीटर देता है, वृत्ताकार पैमाना सौवें भाग।');
      },
      truth: () => ({ v: size() / 10, lc: 0.001 }),
      diagnose(a) {
        const ee = e() / 10, aa = a * 10;
        if (ee !== 0 && Math.abs(aa - R()) < 0.005) return T2('That is the observed reading. This gauge has a zero error: corrected reading = observed − zero error.', 'यह देखा गया पाठ्यांक है। इस पेचमान में शून्य त्रुटि है: सही पाठ्यांक = देखा गया − शून्य त्रुटि।');
        if (ee !== 0 && Math.abs(aa - (open() - e())) < 0.005) return T2('Check the sign of the zero error. A positive error is subtracted; a negative error is added.', 'शून्य त्रुटि का चिह्न जाँचो। धनात्मक त्रुटि घटाई जाती है; ऋणात्मक त्रुटि जोड़ी जाती है।');
        if (Math.abs(aa - (size() + 0.5)) < 0.005 || Math.abs(aa - (size() - 0.5)) < 0.005) return T2('Check the half-millimetre mark: is it visible before the thimble edge?', 'आधे मिलीमीटर का निशान जाँचो: क्या वह थिंबल के किनारे से पहले दिख रहा है?');
        if (Math.abs(aa - size()) <= 0.06) return T2('Close. The circular scale reading times 0.01 mm is added to the linear scale reading.', 'पास है। वृत्ताकार पैमाने के पाठ्यांक को 0.01 मिमी से गुणा करके रैखिक पाठ्यांक में जोड़ो।');
        return null;
      },
      explain() {
        const { lsr, csr } = parts(), ee = e();
        return T2(`Linear scale: ${num(lsr, 1)} mm. Circular scale: ${csr} × 0.01 = ${num(csr * 0.01, 2)} mm. Observed reading = ${num(R(), 2)} mm. ${ee === 0 ? 'No zero error.' : 'Zero error = ' + (ee > 0 ? '+' : '') + num(ee, 2) + ' mm, so corrected reading = ' + num(R(), 2) + ' ' + (ee > 0 ? '−' : '+') + ' ' + num(Math.abs(ee), 2) + ' = ' + num(size(), 2) + ' mm.'}`,
          `रैखिक पैमाना: ${num(lsr, 1)} मिमी। वृत्ताकार पैमाना: ${csr} × 0.01 = ${num(csr * 0.01, 2)} मिमी। देखा गया पाठ्यांक = ${num(R(), 2)} मिमी। ${ee === 0 ? 'कोई शून्य त्रुटि नहीं।' : 'शून्य त्रुटि = ' + (ee > 0 ? '+' : '') + num(ee, 2) + ' मिमी, इसलिए सही पाठ्यांक = ' + num(R(), 2) + ' ' + (ee > 0 ? '−' : '+') + ' ' + num(Math.abs(ee), 2) + ' = ' + num(size(), 2) + ' मिमी।'}`);
      },
      draw() {
        const op = open(), tip = AX + op * PM, xe = ZX + R() * PM;
        let m = `<defs><linearGradient id="${rid}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F1F5F9"/><stop offset=".5" stop-color="#CBD5E1"/><stop offset="1" stop-color="#94A3B8"/></linearGradient><linearGradient id="${rid}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#475569"/><stop offset=".45" stop-color="#94A3B8"/><stop offset="1" stop-color="#334155"/></linearGradient></defs><rect x="0" y="270" width="800" height="30" fill="#D9C08C"/>`;
        m += `<path d="M${AX - 25} ${YA}H100Q40 ${YA} 40 ${YA + 60}Q40 ${YA + 118} 100 ${YA + 118}H${ZX - 20}V${YA + 14}" fill="none" stroke="#64748B" stroke-width="30" stroke-linejoin="round"/><path d="M${AX - 25} ${YA}H100Q40 ${YA} 40 ${YA + 60}Q40 ${YA + 118} 100 ${YA + 118}H${ZX - 20}V${YA + 14}" fill="none" stroke="url(#${rid}s)" stroke-width="22" stroke-linejoin="round"/>`;
        m += `<rect x="${AX - 28}" y="${YA - 12}" width="28" height="24" rx="3" fill="url(#${rid}s)" stroke="#64748B" stroke-width="2"/><rect x="${tip}" y="${YA - 6}" width="${ZX - 20 - tip + 6}" height="12" fill="url(#${rid}s)" stroke="#64748B" stroke-width="1.5"/>`;
        m += `<rect x="${ZX - 20}" y="${YA - 22}" width="300" height="44" rx="4" fill="#E2E8F0" stroke="#64748B" stroke-width="2"/>` + line(ZX - 20, YA, ZX + 280, YA, ink, 1.6);
        for (let h = 0; h <= 16; h++) { const x = ZX + h * 16, whole = h % 2 === 0; m += line(x, YA, x, whole ? YA - 14 : YA + 9, ink, 1.4); if (whole) m += T(x, YA - 17, h / 2, { size: 11, weight: 800 }); }
        m += `<path d="M${xe} ${YA - 32}h110l14 6v52l-14 6h-110z" fill="url(#${rid}t)" stroke="#1E293B" stroke-width="2"/><path d="M${xe} ${YA - 32}l12 5v54l-12 5z" fill="#CBD5E1" stroke="#1E293B" stroke-width="1.5"/>`;
        for (let i = 0; i < 13; i++) m += line(xe, YA - 26 + i * 4.2, xe + 10, YA - 26 + i * 4.2, '#E2E8F0', 1);
        m += `<rect x="${xe + 124}" y="${YA - 20}" width="44" height="40" rx="8" fill="#475569" stroke="#1E293B" stroke-width="2"/>` + T(xe + 146, YA + 5, X.tt(T2('ratchet', 'रैचेट')), { size: 10, fill: '#E2E8F0', weight: 800 });
        if (st.id) { const r = size() * PM / 2; m += `<circle cx="${AX + size() * PM / 2}" cy="${YA}" r="${Math.max(r, 2.2)}" fill="${SG_OBJ[st.id].col}" stroke="rgba(6,18,51,.5)" stroke-width="1.4"/>` + T(AX + 6, YA + 56, X.tt(SG_OBJ[st.id].n), { size: 15, weight: 800 }); }
        m += T(AX, YA - 36, X.tt(T2('anvil', 'निहाई')), { size: 13, fill: '#475569' }) + T(tip + 8, YA - 36 + 2, X.tt(T2('spindle', 'स्पिंडल')), { size: 13, fill: '#475569' });
        m += T(400, 40, X.tt(T2('Pitch 0.5 mm, 50 circular divisions: least count 0.5 ÷ 50 = 0.01 mm', 'पिच 0.5 मिमी, 50 वृत्ताकार भाग: अल्पतमांक 0.5 ÷ 50 = 0.01 मिमी')), { size: 16, weight: 800, fill: '#0F766E' });
        let lens = '', lvb = null;
        if (X.S.read) {
          const nar = X.narrow, r = R(), { csr } = parts(), ppm = 133, lx = (v) => 330 + (v - r) * ppm, dy = 22, cy = 120, W = nar ? 410 : 800;
          let lin = `<rect x="6" y="6" width="388" height="228" rx="12" fill="#FFFDF2"/><rect x="6" y="60" width="388" height="120" fill="#E2E8F0"/>` + line(6, cy, 394, cy, ink, 2);
          for (let h = Math.ceil((r - 3) * 2); h <= Math.floor(r * 2 + 1e-9); h++) { if (h < 0) continue; const x = lx(h / 2), whole = h % 2 === 0; lin += line(x, cy, x, whole ? cy - 46 : cy + 34, ink, whole ? 2.8 : 2); if (whole) lin += T(x, cy - 54, h / 2, { size: 24, weight: 800 }); }
          lin += `<path d="M${lx(r)} 40v160h80V40z" fill="#64748B" stroke="#1E293B" stroke-width="3"/><path d="M${lx(r)} 40v160" stroke="#E2E8F0" stroke-width="5"/>` + T(200, 30, X.tt(T2('linear scale: mm and half mm', 'रैखिक पैमाना: मिमी और आधा मिमी')), { size: 17, weight: 800, fill: '#475569' });
          lens = `<defs><clipPath id="${rid}c"><rect x="6" y="6" width="388" height="228" rx="12"/></clipPath></defs><g clip-path="url(#${rid}c)">${lin}</g>`;
          let circ = `<rect x="6" y="6" width="${nar ? 398 : 388}" height="228" rx="12" fill="#FFFDF2"/><rect x="60" y="34" width="200" height="190" rx="14" fill="#475569" stroke="#1E293B" stroke-width="3"/>`;
          for (let k = csr - 4; k <= csr + 4; k++) { const y = cy + 6 - (k - csr) * dy, d = ((k % 50) + 50) % 50, hit = k === csr; circ += line(60, y, 60 + (d % 5 === 0 ? 62 : 38), y, hit ? '#FF7A1A' : '#E2E8F0', hit ? 4 : 2); if (d % 5 === 0) circ += T(140, y + 7, d, { size: 22, weight: 800, anchor: 'start', fill: hit ? '#FFB27A' : '#E2E8F0' }); }
          circ += line(20, cy + 6, 280, cy + 6, '#FFD23F', 3.2) + T(160, 24, X.tt(T2('circular scale: 50 divisions', 'वृत्ताकार पैमाना: 50 भाग')), { size: 17, weight: 800, fill: '#475569' }) + T(335, cy + 2, X.tt(T2('line on the barrel', 'बैरल की रेखा')), { size: 15, weight: 800, fill: '#B45309', extra: 'transform="rotate(0)"' });
          lens += `<g transform="translate(${nar ? 0 : 394} ${nar ? 234 : 0})">${circ}</g><rect x="6" y="6" width="388" height="228" rx="12" fill="none" stroke="#F5B90A" stroke-width="2"/>`;
          lvb = nar ? [0, 0, 410, 472] : [0, 0, 800, 240];
        }
        return { main: m, lens, lvb };
      },
    };
  };

  // ---------------------------------------------------------------- hand-span
  MODE['hand-span'] = function (X) {
    const st = { id: null, hand: 1, n: 0, read: false };
    const o = () => SPAN_OBJ[st.id];
    const span = () => HAND[st.hand].v;
    const max = () => o().v / span();
    const handSVG = (x, y, w, tint, label, ghost) => {
      const fw = w / 5, hs = [0.55, 0.8, 0.95, 0.85, 0.6], base = 70;
      let g = `<g opacity="${ghost ? 0.35 : 1}"${ghost ? ' stroke-dasharray="4 3"' : ''}>`;
      hs.forEach((h, i) => { g += `<rect x="${x + i * fw + 1}" y="${y + base - 14 - h * 56}" width="${fw - 2}" height="${h * 56 + 14}" rx="${Math.min(10, fw / 2 - 1)}" fill="${tint}" stroke="rgba(6,18,51,.35)" stroke-width="1.4"/>`; });
      g += `<rect x="${x + 1}" y="${y + base - 20}" width="${w - 2}" height="34" rx="9" fill="${tint}" stroke="rgba(6,18,51,.35)" stroke-width="1.4"/>`;
      if (label != null) g += `<circle cx="${x + w / 2}" cy="${y + base + 36}" r="${clamp(w / 3.2, 8, 17)}" fill="#0F766E"/>` + T(x + w / 2, y + base + 36 + clamp(w / 8, 4, 6), label, { size: clamp(w / 2.6, 11, 20), fill: '#fff', weight: 800 });
      return g + '</g>';
    };
    return {
      pool: mkPool(SPAN_OBJ), vb: [800, 300], lensVb: [800, 140], answerUnit: 'spans',
      icon: (id) => icoWrap(`<rect x="3" y="14" width="34" height="12" rx="3" fill="#B8864B"/>`),
      choose(id) { st.id = id; st.n = 0; return true; },
      sliders() {
        if (!st.id) return [];
        return [{ name: 'span', label: T2('Whose hand?', 'किसका हाथ?'), min: 0, max: 2, step: 1, value: st.hand, out: (v) => X.tt(HAND[v].n) + ': ' + HAND[v].v + ' ' + unitName('cm', X.api) }];
      },
      slide(n, v) { const h = Math.round(clamp(v, 0, 2)); if (h !== st.hand) { st.hand = h; st.n = 0; } },
      buttons() {
        return [{ key: 'instrument', cls: 'ms-go', label: T2('Lay the next hand', 'अगला हाथ रखो'), disabled: !st.id || st.n >= max(), fn: () => { if (!st.id) return T2('Choose something to measure.', 'नापने के लिए कोई चीज़ चुनो।'); if (st.n < max()) st.n++; return null; } }];
      },
      reset() { st.n = 0; },
      align: () => st.id && st.n === max(),
      hint() {
        if (!st.id) return T2('Choose something to measure with your hand.', 'अपने हाथ से नापने के लिए कोई चीज़ चुनो।');
        if (st.n < max()) return T2('Lay hands one after another, thumb tip where the last little finger ended. Leave no gap and no overlap.', 'हाथ एक के बाद एक रखो, अँगूठे की नोक वहाँ जहाँ पिछली छोटी उँगली ख़त्म हुई। न खाली जगह, न ऊपर-नीचे।');
        return T2('The object ends exactly here. Press Read, then type how many hand-spans.', 'वस्तु ठीक यहीं ख़त्म होती है। पढ़ो दबाओ, फिर कितने बित्ते हैं लिखो।');
      },
      read() { return st.id && st.n === max() ? null : T2('Lay hands along the whole object first.', 'पहले पूरी वस्तु पर हाथ रखो।'); },
      truth: () => ({ v: max(), lc: 1 }),
      diagnose(a) {
        if (Math.abs(a - max()) === 1) return T2('Almost. Count the numbers on the hands again, once each.', 'लगभग। हाथों पर लिखी संख्याएँ फिर गिनो, हर एक को एक बार।');
        if (st.n < max()) return T2('You have not covered the whole object yet.', 'तुमने अभी पूरी वस्तु नहीं ढकी।');
        return null;
      },
      explain() {
        const u = X.unit, cmv = o().v, other = HAND.filter((h, i) => i !== st.hand).map((h) => `${X.tt(h.n)}: ${cmv / h.v}`).join(', ');
        const lenTxt = u === 'm' ? num(cmv / 100, 2) + ' m' : cmv + ' cm';
        return T2(`${max()} hand-spans of ${span()} cm each = ${lenTxt}. Other hands give other counts (${other}) for the same ${X.tt(o().n).toLowerCase()}. That is why we use a standard unit like the centimetre.`, `${span()} सेमी के ${max()} बित्ते = ${lenTxt}। दूसरे हाथों से उसी चीज़ की गिनती अलग आती है (${other})। इसीलिए हम सेंटीमीटर जैसी मानक इकाई का उपयोग करते हैं।`);
      },
      draw() {
        let m = `<rect x="0" y="236" width="800" height="64" fill="#D9C08C" opacity=".7"/>`;
        if (!st.id) return { main: m + T(400, 140, X.tt(T2('Choose something to measure', 'नापने के लिए कोई चीज़ चुनो')), { size: 30, weight: 800, fill: '#0F766E' }), lens: '' };
        const x0 = 60, W = 680, sc = W / o().v, hw = span() * sc, y0 = 150;
        m += `<rect x="${x0}" y="${y0 + 14}" width="${W}" height="30" rx="6" fill="#B8864B" stroke="#7C5428" stroke-width="2"/>` + line(x0, y0 + 4, x0, y0 + 62, '#16A34A', 3) + line(x0 + W, y0 + 4, x0 + W, y0 + 62, '#E11D48', 3);
        m += T(x0, y0 + 80, X.tt(T2('start', 'शुरुआत')), { size: 13, fill: '#15803D', weight: 800 }) + T(x0 + W, y0 + 80, X.tt(T2('end', 'अंत')), { size: 13, fill: '#B91C1C', weight: 800 }) + T(x0 + W / 2, y0 + 34 + 3, X.tt(o().n), { size: 15, fill: '#fff', weight: 800 });
        const tints = ['#FDBA8C', '#F6A874'];
        for (let i = 0; i < st.n; i++) m += handSVG(x0 + i * hw, y0 - 66, hw, tints[i % 2], i + 1, false);
        if (st.n < max()) m += handSVG(x0 + st.n * hw, y0 - 66, hw, '#FDBA8C', null, true);
        else m += T(400, 36, X.tt(T2('The end of the object is reached!', 'वस्तु का अंत आ गया!')), { size: 22, weight: 800, fill: '#15803D' });
        m += T(400, 280, X.tt(HAND[st.hand].n) + ': ' + span() + ' ' + unitName('cm', X.api) + ' ' + X.tt(T2('in one hand-span', 'एक बित्ते में')), { size: 15, weight: 700, fill: '#475569' });
        let lens = '', lvb = null;
        if (X.S.read && st.n === max()) {
          lens = T(400, 30, X.tt(T2('Hands laid along the object', 'वस्तु पर रखे गए हाथ')), { size: 24, weight: 800, fill: '#7A5600' });
          const n = st.n, cw = Math.min(46, (X.narrow ? 440 : 740) / n);
          for (let i = 0; i < n; i++) { const cx = 400 - (n * cw) / 2 + cw * i + cw / 2; lens += `<circle cx="${cx}" cy="84" r="${Math.min(20, cw / 2 - 2)}" fill="${i === n - 1 ? '#FF7A1A' : '#0F766E'}"/>` + T(cx, 84 + 6, i + 1, { size: Math.min(19, cw / 2.2), fill: '#fff', weight: 800 }); }
          lens += T(400, 128, X.tt(T2('Count them: the last number is the answer.', 'इन्हें गिनो: आख़िरी संख्या ही उत्तर है।')), { size: 18, weight: 700, fill: '#475569' });
          lvb = X.narrow ? [160, 0, 480, 140] : [0, 0, 800, 140];
        }
        return { main: m, lens, lvb };
      },
    };
  };

  // ================================================================ the shell shared by every instrument
  const LENS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M15 15l6 6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
  const ASK = {
    scale: T2('Length of the object', 'वस्तु की लंबाई'), tape: T2('Length', 'लंबाई'), balance: T2('Mass', 'द्रव्यमान'), cylinder: T2('Volume', 'आयतन'), clock: T2('The time', 'समय'),
    stopwatch: T2('Time shown', 'दिखाया गया समय'), thermometer: T2('Temperature', 'तापमान'), vernier: T2('Corrected diameter', 'सही व्यास'), 'screw-gauge': T2('Corrected diameter', 'सही व्यास'), 'hand-span': T2('How many hand-spans?', 'कितने बित्ते?'),
  };
  function mount(root, cfg, api) {
    const instr = cfg.instrument;
    const tt = (x) => api.t(x);
    const aunit = (MODE_ANSWER_UNIT(instr) || cfg.units || UNIT_DEF[instr]);
    const S = { id: null, placed: false, read: false, done: false, al: false, wrong: 0 };
    const stops = [];
    let alive = true;
    const run = (ms, step, done) => {
      let fin = false, stop = null;
      stop = tween(ms, step, () => { fin = true; const i = stops.indexOf(stop); if (i >= 0) stops.splice(i, 1); if (alive && done) done(); });
      if (!fin) stops.push(stop);
      return stop;
    };
    const cancelAll = () => { stops.splice(0).forEach((s) => s && s()); };
    const X = { api, tt, S, cfg, unit: cfg.units || UNIT_DEF[instr], run, redraw: (light) => draw(light), check: () => checkAlign(), unplace };
    const ctl = MODE[instr](X);
    const vb4 = ctl.vb.length === 4 ? ctl.vb : [0, 0, ctl.vb[0], ctl.vb[1]];
    const [vx, vy, vw, vh] = vb4;
    X.narrow = (root.clientWidth || 800) < 600;
    const feat = cfg.object || null;
    const pool = ctl.pool.filter((p) => p.id === feat).concat(ctl.pool.filter((p) => p.id !== feat));
    const hasInstrBtn = (ctl.buttons ? ctl.buttons() : []).some((b) => b.key === 'instrument');
    const nameOf = () => (S.id ? tt(ctl.pool.find((p) => p.id === S.id).n) : '');

    root.innerHTML = `<div class="ms ms-${instr}">
      <div class="ms-head"><h3 class="ms-ttl">${esc(tt(NAMES[instr]))}</h3><span class="ms-spec">${esc(tt(SPEC[instr]))}</span></div>
      <div class="ms-stage" style="max-width:${Math.round(vw * 1.3)}px;margin:0 auto;width:100%"><svg class="ms-svg" viewBox="${vx} ${vy} ${vw} ${vh}" role="group" aria-label="${esc(tt(NAMES[instr]))}"></svg></div>
      <div class="ms-lensbox" hidden><div class="ms-lenstitle">${LENS_ICON}<span>${esc(tt(T2('Through the magnifier', 'आवर्धक काँच से')))}</span></div><svg class="ms-lens" viewBox="0 0 ${ctl.lensVb ? ctl.lensVb[0] : 800} ${ctl.lensVb ? ctl.lensVb[1] : 200}" role="img" aria-label="${esc(tt(T2('Close-up of the reading', 'पाठ्यांक का पास से दृश्य')))}"></svg></div>
      <p class="ms-hint"></p>
      <div class="ms-tray" role="group" aria-label="${esc(tt(T2('Things to measure', 'नापने की चीज़ें')))}"></div>
      ${ctl.extras ? '<div class="ms-tray ms-extras" role="group" aria-label="' + esc(tt(T2('Box of weights', 'बाटों का डिब्बा'))) + '"></div>' : ''}
      <div class="ms-ctls"></div>
      <div class="ms-acts"></div>
      <form class="ms-ans" data-key="answer" novalidate><label><span class="ms-asklbl"></span><input type="text" inputmode="${instr === 'clock' ? 'text' : 'decimal'}" autocomplete="off" enterkeyhint="done"><span class="ms-unit"></span></label><button type="submit" class="ms-btn ms-go">${esc(tt(T2('Check', 'जाँचो')))}</button></form>
      <div class="ms-res" aria-live="polite"></div>
    </div>`;
    const $ = (s) => root.querySelector(s);
    const svgEl = $('.ms-svg'), lensSvg = $('.ms-lens'), lensBox = $('.ms-lensbox'), hintEl = $('.ms-hint'), tray = $('.ms-tray'), extrasEl = $('.ms-extras'), ctlsEl = $('.ms-ctls'), actsEl = $('.ms-acts'), form = $('.ms-ans'), input = form.querySelector('input'), res = $('.ms-res');

    // ---- tray, extras, buttons, sliders
    tray.innerHTML = pool.map((p) => `<button type="button" class="ms-ob${p.id === feat ? ' ms-feat' : ''}" data-key="object:${p.id}" aria-pressed="false">${ctl.icon(p.id)}<span>${esc(tt(p.n))}</span></button>`).join('');
    function syncExtras() {
      if (!extrasEl) return;
      extrasEl.innerHTML = ctl.extras.map((e) => { const left = ctl.extraLeft(e); return `<button type="button" class="ms-ob" data-key="object:${e.id}" ${left <= 0 ? 'disabled' : ''}>${ctl.extraIcon(e)}<span>${esc(tt(ctl.extraName(e)))}</span><small>×${left}</small></button>`; }).join('');
    }
    function syncTray() { tray.querySelectorAll('.ms-ob').forEach((b) => b.setAttribute('aria-pressed', S.placed && b.dataset.key === 'object:' + S.id ? 'true' : 'false')); }
    const btns = () => (ctl.buttons ? ctl.buttons() : []);
    function buildActs() {
      const hasRead = true;
      actsEl.innerHTML = btns().map((b) => `<button type="button" class="ms-btn ${b.cls || 'ms-ghost'}" data-key="${b.key}"></button>`).join('') +
        (hasRead ? `<button type="button" class="ms-btn ms-read" data-key="read">${LENS_ICON}<span></span></button>` : '') +
        `<button type="button" class="ms-btn ms-ghost" data-key="reset"></button>`;
      syncActs();
    }
    function syncActs() {
      btns().forEach((b) => { const el = actsEl.querySelector(`[data-key="${b.key}"]`); if (el) { el.textContent = tt(b.label); el.disabled = !!b.disabled; } });
      const rd = actsEl.querySelector('[data-key="read"] span'); if (rd) rd.textContent = tt(ctl.readLabel || T2('Read it', 'पढ़ो'));
      const rs = actsEl.querySelector('[data-key="reset"]'); if (rs) rs.textContent = tt(T2('Start again', 'फिर से शुरू'));
    }
    function buildSliders() {
      const list = ctl.sliders();
      ctlsEl.innerHTML = list.map((s) => `<div class="ms-sl"><div class="ms-sl-top"><label for="ms-s-${s.name}">${esc(tt(s.label))}</label><output for="ms-s-${s.name}"></output></div><input id="ms-s-${s.name}" type="range" data-key="slider:${s.name}" data-name="${s.name}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.value}"></div>`).join('');
      syncSliders();
    }
    function syncSliders() {
      const list = ctl.sliders();
      list.forEach((s) => {
        const inp = ctlsEl.querySelector(`input[data-name="${s.name}"]`);
        if (!inp) return;
        inp.value = s.value; inp.disabled = !!s.dis;
        const txt = s.out(s.value);
        inp.closest('.ms-sl').querySelector('output').textContent = txt;
        inp.setAttribute('aria-valuetext', txt);
      });
    }
    function askUpdate() {
      let a = ASK[instr];
      if (instr === 'cylinder' && S.id && CYL_OBJ[S.id].kind === 'solid') a = T2('Volume of the stone', 'पत्थर का आयतन');
      if (instr === 'stopwatch' && S.id === 'pendulum') a = T2('Time for one swing', 'एक दोलन का समय');
      $('.ms-asklbl').textContent = tt(a);
      form.querySelector('.ms-unit').textContent = instr === 'clock' ? tt(T2('(like 8:45)', '(जैसे 8:45)')) : tt(U[aunit].n);
    }

    // ---- drawing
    function draw(light) {
      if (!alive) return;
      const d = ctl.draw();
      svgEl.innerHTML = hasInstrBtn ? d.main : `<g data-key="instrument">${d.main}</g>`;
      const showLens = !!ctl.lensVb && S.read && !!d.lens;
      lensBox.hidden = !showLens;
      if (showLens) { lensSvg.innerHTML = d.lens; const lv = d.lvb || [0, 0, ctl.lensVb[0], ctl.lensVb[1]]; lensSvg.setAttribute('viewBox', lv.join(' ')); }
      hintEl.textContent = S.done ? '' : tt(ctl.hint());
      svgEl.setAttribute('aria-label', tt(NAMES[instr]) + (S.id ? ': ' + nameOf() : ''));
      syncActs();
      if (!light) { syncTray(); syncExtras(); }
    }
    function checkAlign() {
      if (!alive) return;
      const a = !!(S.placed && ctl.align());
      if (a && !S.al) { api.emit('aligned'); api.record(tt(T2('Set it up correctly', 'सही ढंग से लगाया'))); }
      S.al = a;
    }

    // ---- actions
    function pick(id, silent) {
      cancelAll();
      const r = ctl.choose(id);
      S.placed = r !== false; S.id = S.placed ? id : null;
      Object.assign(S, { read: false, done: false, wrong: 0 });
      res.innerHTML = ''; input.value = '';
      S.al = silent && S.placed ? !!ctl.align() : false;
      buildSliders(); askUpdate(); draw();
      if (S.placed && !silent) {
        api.emit('placed'); api.record(tt(T2('Chose ', 'चुना: ')) + nameOf());
        if (api.speak) api.speak(nameOf());
      }
      if (!silent) checkAlign();
    }
    function unplace() { S.placed = false; S.id = null; S.read = false; S.done = false; S.al = false; res.innerHTML = ''; cancelAll(); syncTray(); buildSliders(); askUpdate(); draw(); }
    function applySlider(name, v, fromDrag) {
      const key = 'slider:' + name;
      if (!(api.allowed(key) || (fromDrag && api.allowed('instrument')))) { api.nudge(key); syncSliders(); return false; }
      ctl.slide(name, v);
      syncSliders(); draw(true); checkAlign();
      return true;
    }
    function doRead() {
      if (!api.allowed('read')) { api.nudge('read'); return; }
      if (!S.placed && !ctl.readNoObj) { api.toast(T2('Choose something to measure first.', 'पहले नापने के लिए कोई चीज़ चुनो।')); return; }
      const blocked = ctl.read ? ctl.read() : null;
      if (blocked) { api.toast(blocked); return; }
      S.read = true; draw(true); checkAlign();
      api.emit('measured'); api.record(tt(T2('Looked closely at the reading', 'पाठ्यांक को पास से देखा')));
    }
    function doReset() {
      if (!api.allowed('reset')) { api.nudge('reset'); return; }
      cancelAll();
      if (ctl.reset) ctl.reset();
      if (ctl.clear) ctl.clear();
      if (S.id) pick(S.id, true); else { buildSliders(); draw(); }
      api.record(tt(T2('Started again', 'फिर से शुरू किया')));
    }
    const dec = (lc, f) => { const d = Math.max(0, Math.ceil(-Math.log10(lc / f) - 1e-9)); return Math.min(4, d); };
    function submit(ev) {
      ev.preventDefault();
      if (!api.allowed('answer')) { api.nudge('answer'); return; }
      if (!S.placed) { api.toast(T2('Choose something to measure first.', 'पहले नापने के लिए कोई चीज़ चुनो।')); return; }
      const raw = input.value;
      let r, sum = '';
      if (ctl.check) {
        r = ctl.check(raw);
        if (instr === 'clock') sum = clockWords(CLK_OBJ[S.id].t);
        else if (instr === 'stopwatch') sum = num(S.id === 'pendulum' ? ctl.truth().v / 10 : ctl.truth().v, S.id === 'pendulum' ? 3 : 2) + ' ' + tt(U.s.n);
      } else {
        const v = parseNum(raw);
        if (v == null) r = { invalid: T2('Type a number, like 7.3', 'संख्या लिखो, जैसे 7.3') };
        else {
          const tr = ctl.truth(), f = U[aunit].f, base = v * f;
          sum = num(tr.v / f, dec(tr.lc, f)) + ' ' + tt(U[aunit].n);
          if (Math.abs(base - tr.v) < tr.lc * 0.5 + 1e-9) r = { ok: true };
          else {
            let msg = ctl.diagnose ? ctl.diagnose(base) : null;
            if (!msg) for (const k of [10, 100, 1000]) if (Math.abs(base * k - tr.v) < tr.lc * 0.5 + 1e-9 || Math.abs(base / k - tr.v) < tr.lc * 0.5 + 1e-9) { msg = T2('The digits are right, but check the unit: 1 m = 100 cm, 1 cm = 10 mm, 1 kg = 1000 g, 1 L = 1000 mL.', 'अंक सही हैं, पर इकाई जाँचो: 1 मी = 100 सेमी, 1 सेमी = 10 मिमी, 1 किग्रा = 1000 ग्राम, 1 ली = 1000 मिली।'); break; }
            r = { ok: false, msg: msg || T2('Not quite. Press Read and look closely at the marks, then count them carefully.', 'ठीक नहीं। पढ़ो दबाओ और निशानों को ध्यान से देखकर सावधानी से गिनो।') };
          }
        }
      }
      if (r.invalid) { api.toast(r.invalid); input.focus(); return; }
      if (instr === 'hand-span') sum = num(ctl.truth().v, 0) + ' ' + tt(U.spans.n);
      if (r.ok) {
        S.done = true;
        res.innerHTML = `<div class="ms-card ok ms-pop"><strong>${esc(tt(T2('Right!', 'सही!')))}</strong><p class="ms-sum">${esc(sum)}</p><p class="ms-why">${esc(tt(ctl.explain()))}</p></div>`;
        api.emit('answered:right'); api.record(tt(T2('Answered right: ', 'सही उत्तर: ')) + sum);
        if (api.celebrate) api.celebrate();
        draw(true);
      } else {
        S.wrong++;
        res.innerHTML = `<div class="ms-card bad ms-pop"><strong>${esc(tt(T2('Not yet.', 'अभी नहीं।')))}</strong><p>${esc(tt(r.msg))}</p>${S.wrong >= 3 ? `<p class="ms-why">${esc(tt(ctl.explain()))}</p>` : ''}</div>`;
        api.emit('answered:wrong'); api.record(tt(T2('Answered wrong: ', 'ग़लत उत्तर: ')) + raw);
      }
    }

    // ---- events
    function onClick(e) {
      const w = e.target.closest('.ms-w');
      if (w && svgEl.contains(w)) {
        if (!api.allowed('object:weight-' + w.dataset.g)) { api.nudge('object:weight-' + w.dataset.g); return; }
        const i = +w.dataset.w; ctl.removeWeight(i); draw(); syncExtras(); api.record(tt(T2('Took a weight off', 'एक बाट हटाया'))); return;
      }
      const el = e.target.closest('button[data-key]');
      if (!el || el.disabled || !root.contains(el)) return;
      const key = el.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key.startsWith('object:weight-')) {
        const msg = ctl.extra(key.slice(7));
        if (msg) { api.toast(msg); return; }
        draw(); syncExtras(); api.record(tt(T2('Put a weight on the pan: ', 'पलड़े पर बाट रखा: ')) + el.querySelector('span').textContent);
      } else if (key.startsWith('object:')) pick(key.slice(7));
      else if (key === 'read') doRead();
      else if (key === 'reset') doReset();
      else {
        const b = btns().find((x) => x.key === key);
        if (b) { const msg = b.fn(); if (msg) api.toast(msg); else { draw(); checkAlign(); syncSliders(); } }
      }
    }
    function onInput(e) {
      const t = e.target;
      if (!t.matches || !t.matches('input[type=range]')) return;
      applySlider(t.dataset.name, +t.value);
    }
    function onChange(e) { const t = e.target; if (t.matches && t.matches('input[type=range]')) api.record(tt(T2('Moved: ', 'घुमाया: ')) + t.closest('.ms-sl').querySelector('label').textContent); }
    function onKey(e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('.ms-w')) { e.preventDefault(); e.target.closest('.ms-w').dispatchEvent(new MouseEvent('click', { bubbles: true })); } }
    // dragging an object or a jaw on the stage
    let drag = null;
    const svgX = (ev) => { const m = svgEl.getScreenCTM(); if (!m) return 0; const p = svgEl.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(m.inverse()).x; };
    function onDown(e) {
      const g = e.target.closest && e.target.closest('[data-drag]');
      if (!g || !ctl.drag) return;
      const sl = ctl.sliders().find((s) => s.name === ctl.drag.name);
      if (!sl || sl.dis) return;
      drag = { off: ctl.drag.toValue(svgX(e)) - sl.value, id: e.pointerId };
      try { svgEl.setPointerCapture(e.pointerId); } catch (x) { /* older browsers */ }
      e.preventDefault();
    }
    function onMove(e) { if (!drag || e.pointerId !== drag.id) return; applySlider(ctl.drag.name, ctl.drag.toValue(svgX(e)) - drag.off, true); }
    function onUp(e) { if (drag && e.pointerId === drag.id) { drag = null; api.record(tt(T2('Dragged it', 'खींचकर खिसकाया'))); } }
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('keydown', onKey);
    form.addEventListener('submit', submit);
    svgEl.addEventListener('pointerdown', onDown);
    svgEl.addEventListener('pointermove', onMove);
    svgEl.addEventListener('pointerup', onUp);
    svgEl.addEventListener('pointercancel', onUp);

    buildActs(); buildSliders(); askUpdate(); syncExtras(); syncTray(); draw();
    if (cfg.object) pick(cfg.object, true);
    let ro = null, lastNarrow = X.narrow;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => { const nw = (root.clientWidth || 800) < 600; if (nw !== lastNarrow) { lastNarrow = nw; X.narrow = nw; draw(true); } }); ro.observe(root); }
    return {
      destroy() {
        alive = false; if (ro) ro.disconnect(); cancelAll(); if (ctl.destroy) ctl.destroy();
        root.removeEventListener('click', onClick); root.removeEventListener('input', onInput); root.removeEventListener('change', onChange); root.removeEventListener('keydown', onKey);
        form.removeEventListener('submit', submit);
      },
    };
  }
  function MODE_ANSWER_UNIT(instr) { return instr === 'hand-span' ? 'spans' : instr === 'clock' ? 'min' : null; }

  NCA_T.register({
    id: 'measure',
    css: CSS,
    validate(c) {
      const e = [];
      if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
      Object.keys(c).forEach((k) => { if (!['instrument', 'object', 'units'].includes(k)) e.push('unknown key: ' + k); });
      if (typeof c.instrument !== 'string' || !INSTR.includes(c.instrument)) { e.push('instrument must be one of: ' + INSTR.join(', ')); return e; }
      const pool = POOL[c.instrument];
      if (c.object != null && (typeof c.object !== 'string' || !Object.prototype.hasOwnProperty.call(pool, c.object))) e.push(`unknown object "${c.object}" for ${c.instrument} (use ${Object.keys(pool).join(', ')})`);
      if (c.units != null) {
        const ok = UNITS_OK[c.instrument];
        if (!ok.length) e.push(`${c.instrument} has no choice of units; leave units out`);
        else if (!ok.includes(c.units)) e.push(`units "${c.units}" does not suit ${c.instrument} (use ${ok.join(' or ')})`);
      }
      return e;
    },
    keys(c) {
      const i = c && typeof c.instrument === 'string' && INSTR.includes(c.instrument) ? c.instrument : null;
      const objs = i ? Object.keys(POOL[i]).map((id) => 'object:' + id).concat(EXTRA[i].filter((x) => x.startsWith('weight-')).map((x) => 'object:' + x)) : ['object:*'];
      const sl = i ? SLIDERS[i].map((n) => 'slider:' + n) : ['slider:*'];
      const btn = i ? EXTRA[i].filter((x) => !x.startsWith('weight-')) : [];
      return { targets: objs.concat(['instrument'], sl, ['read', 'answer', 'reset'], btn), events: ['placed', 'aligned', 'measured', 'answered:right', 'answered:wrong'] };
    },
    demo: { instrument: 'vernier', object: 'marble', units: 'cm' },
    instruments: INSTR,
    objects: Object.fromEntries(INSTR.map((i) => [i, Object.keys(POOL[i])])),
    mount(root, config, api) { return mount(root, config, api); },
  });
})();
