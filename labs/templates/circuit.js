// Template: Circuit builder. Cells, bulbs, resistors, switches and meters on a board; Ohm's law, series and parallel,
// resistivity, electric power and cost, house wiring with MCB and earth, conductors and insulators, Kirchhoff's
// rules, the Wheatstone bridge, the p-n diode and LED, and logic gates. Every reading comes from the real formulas
// (Ohm's law, Kirchhoff's rules, R = ρl/A with real resistivities, P = VI, the diode equation), so a lab can never
// show an impossible result. Config:
//   { mode: 'free'|'ohm'|'series-parallel'|'resistivity'|'power'|'house'|'conductors'|'kirchhoff'|'wheatstone'|'diode'|'logic',
//     parts?: [part ids on the tray (free mode)], preset?: a starting layout id of that mode }
(function () {
  const L = window.NCA_LIB;
  const { esc, lerp, clamp, ease, mixHex, tween } = L;
  const reduced = L.reducedMotion;
  const PX = 'cc';
  const CSS = `
.cc { container-type: inline-size; }
.cc-in { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); align-items: start; }
@container (min-width: 900px) { .cc-in { grid-template-columns: minmax(0, 1.6fr) minmax(300px, 1fr); } .cc-in .cc-sliders { grid-template-columns: 1fr; } }
@container (max-width: 560px) { .cc-svg { --cc-k: 1.25; } }
.cc-svg { width: 100%; height: auto; display: block; border-radius: 14px; background: #F3F6FC; }
.cc-t { font-family: var(--font-body); font-weight: 700; }
.cc-h { font-family: var(--font-display); font-weight: 800; }
.cc-lbl { font-family: var(--font-body); font-weight: 600; }
.cc-val { font-family: var(--font-display); font-weight: 800; }
.cc-t:not([fill]) { fill: #1E293B; } .cc-h:not([fill]) { fill: #1E3A8A; } .cc-lbl:not([fill]) { fill: #475569; } .cc-val:not([fill]) { fill: #0F766E; }
.cc-hot { animation: cc-hot .5s ease-in-out infinite alternate; }
@keyframes cc-hot { to { stroke: #FF6B57; } }
.cc-flow { stroke: #FFB020; stroke-width: 3.5; stroke-linecap: round; stroke-dasharray: 5 12; fill: none; animation: cc-dash var(--cc-speed, 1s) linear infinite; pointer-events: none; }
.cc-flow.rev { animation-direction: reverse; }
@keyframes cc-dash { to { stroke-dashoffset: -17; } }
@media (prefers-reduced-motion: reduce) { .cc-flow, .cc-hot, .cc-spin, .cc-glow { animation: none !important; } }
.cc-glow { animation: cc-glow 1.6s ease-in-out infinite alternate; }
@keyframes cc-glow { to { opacity: .7; } }
.cc-spin { animation: cc-spin 1.2s linear infinite; }
@keyframes cc-spin { to { transform: rotate(360deg); } }
.cc-ctl { cursor: pointer; }
.cc-ctl:hover { filter: brightness(1.05) drop-shadow(0 3px 6px rgba(6,18,51,.18)); }
.cc-ctl:focus-visible { outline: none; filter: drop-shadow(0 0 6px #8B3DFF); }
.cc-ctl.sel { filter: drop-shadow(0 0 9px rgba(139,61,255,.75)); }
.cc-slot { fill: #FFFFFF; stroke: #94A3B8; stroke-width: 2; stroke-dasharray: 6 5; }
.cc-slot.on { stroke-dasharray: none; stroke: #CBD5E1; }
.cc-panel { display: flex; flex-direction: column; gap: 10px; }
.cc-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.cc-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.cc-chip { border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 999px; min-height: 44px; padding: 0 14px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
.cc-chip[aria-pressed="true"] { background: var(--royal); color: #fff; border-color: var(--royal); }
:root[data-theme="dark"] .cc-chip[aria-pressed="true"] { color: #061233; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .cc-chip[aria-pressed="true"] { color: #061233; } }
.cc-chip.danger[aria-pressed="true"] { background: var(--bad); border-color: var(--bad); color: #fff; }
.cc-chip .sw { width: 14px; height: 14px; border-radius: 50%; background: var(--line); flex: none; }
.cc-chip[aria-pressed="true"] .sw { background: #FFD23F; box-shadow: 0 0 8px #FFD23F; }
.cc-sl { display: grid; grid-template-columns: minmax(84px, 130px) 1fr auto; gap: 10px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 6px 12px; min-height: 48px; }
.cc-sl span { font-weight: 700; font-size: .92rem; }
.cc-sl output { font-family: var(--font-display); font-weight: 800; color: var(--royal); min-width: 64px; text-align: right; font-size: 1.05rem; }
.cc-sl input[type=range] { width: 100%; min-width: 0; height: 44px; margin: 0; accent-color: #1D4ED8; cursor: pointer; }
.cc-sliders { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.cc-out { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px; min-height: 52px; }
.cc-out p { margin: 0; }
.cc-out .eq { font-family: var(--font-display); font-weight: 800; font-size: 1.12rem; color: var(--royal); overflow-wrap: anywhere; }
.cc-out .warn { color: var(--bad); font-weight: 700; }
.cc-out .ok { color: var(--good); font-weight: 700; }
.cc-reads { display: flex; flex-wrap: wrap; gap: 8px; }
.cc-read { background: var(--royal-t); border-radius: 12px; padding: 6px 12px; font-weight: 700; display: inline-flex; gap: 6px; align-items: baseline; }
.cc-read b { font-family: var(--font-display); font-size: 1.15rem; color: var(--royal); }
.cc-table { width: 100%; border-collapse: collapse; font-size: .9rem; }
.cc-table th, .cc-table td { padding: 5px 8px; text-align: center; border-bottom: 1px solid var(--line); }
.cc-table tr.now td { background: var(--sun-t); font-weight: 800; }
.cc-btn { border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 12px; min-height: 44px; padding: 0 14px; font-weight: 700; }
.cc-btn.go { background: var(--royal); color: #fff; border-color: var(--royal); }
:root[data-theme="dark"] .cc-btn.go { color: #061233; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .cc-btn.go { color: #061233; } }
.cc-tip { font-size: .9rem; color: var(--ink-2); margin: 0; }
`;

  // ---------- data: every number here is a real school value ----------
  const T = (en, hi) => ({ en, hi });
  // Parts a free-mode tray may hold. R in ohms; emf in volts; bulb rating 3 V, 0.3 A (R = 10 Ω, 0.9 W).
  const PARTS = {
    cell: { name: T('Cell (1.5 V)', 'सेल (1.5 V)'), emf: 1.5 },
    battery: { name: T('Battery (3 V)', 'बैटरी (3 V)'), emf: 3 },
    bulb: { name: T('Bulb', 'बल्ब'), r: 10, rated: 0.9 },
    resistor: { name: T('Resistor (20 Ω)', 'प्रतिरोधक (20 Ω)'), r: 20 },
    switch: { name: T('Switch', 'स्विच'), r: 0 },
    ammeter: { name: T('Ammeter', 'ऐमीटर'), r: 0.01 },
    voltmeter: { name: T('Voltmeter', 'वोल्टमीटर'), r: 1e6 },
    rheostat: { name: T('Rheostat (0–50 Ω)', 'धारा नियंत्रक (0–50 Ω)'), r: 25 },
    fuse: { name: T('Fuse (1 A)', 'फ़्यूज़ (1 A)'), r: 0.01, rating: 1 },
    led: { name: T('LED', 'LED'), vf: 2.0, r: 10 },
    diode: { name: T('Diode', 'डायोड'), vf: 0.7, r: 0.5 },
  };
  // Materials: resistivity in Ω·m at 20 °C (NCERT Class 10 table values), and whether a tester bulb lights.
  const MAT = {
    silver: { name: T('Silver', 'चाँदी'), rho: 1.6e-8, cond: 'yes', colour: '#D7DCE3', group: 'metal' },
    copper: { name: T('Copper', 'ताँबा'), rho: 1.62e-8, cond: 'yes', colour: '#C8742F', group: 'metal' },
    aluminium: { name: T('Aluminium', 'ऐलुमिनियम'), rho: 2.63e-8, cond: 'yes', colour: '#C5CBD3', group: 'metal' },
    tungsten: { name: T('Tungsten', 'टंगस्टन'), rho: 5.2e-8, cond: 'yes', colour: '#8C949F', group: 'metal' },
    iron: { name: T('Iron', 'लोहा'), rho: 10e-8, cond: 'yes', colour: '#7C8696', group: 'metal' },
    nichrome: { name: T('Nichrome', 'नाइक्रोम'), rho: 100e-8, cond: 'yes', colour: '#9A8F7F', group: 'alloy' },
    manganin: { name: T('Manganin', 'मैंगनिन'), rho: 44e-8, cond: 'yes', colour: '#B08A5A', group: 'alloy' },
    constantan: { name: T('Constantan', 'कॉन्स्टैन्टन'), rho: 49e-8, cond: 'yes', colour: '#A69277', group: 'alloy' },
    graphite: { name: T('Pencil lead (graphite)', 'पेंसिल की लीड (ग्रेफ़ाइट)'), rho: 1e-5, cond: 'yes', colour: '#3B3F46', group: 'other' },
    steelkey: { name: T('Steel key', 'स्टील की चाबी'), rho: 7e-7, cond: 'yes', colour: '#9AA4B2', group: 'metal' },
    coin: { name: T('Coin', 'सिक्का'), rho: 7e-8, cond: 'yes', colour: '#D4AF37', group: 'metal' },
    saltwater: { name: T('Salt water', 'नमक का पानी'), cond: 'weak', colour: '#BFE3F7', group: 'liquid' },
    lemon: { name: T('Lemon juice', 'नींबू का रस'), cond: 'weak', colour: '#F6EBA8', group: 'liquid' },
    vinegar: { name: T('Vinegar', 'सिरका'), cond: 'weak', colour: '#F2E6CC', group: 'liquid' },
    tapwater: { name: T('Tap water', 'नल का पानी'), cond: 'weak', colour: '#D9ECFB', group: 'liquid' },
    distilled: { name: T('Distilled water', 'आसुत जल'), cond: 'no', colour: '#EAF4FD', group: 'liquid' },
    sugarwater: { name: T('Sugar solution', 'चीनी का घोल'), cond: 'no', colour: '#F4F1E6', group: 'liquid' },
    oil: { name: T('Oil', 'तेल'), cond: 'no', colour: '#F2D77A', group: 'liquid' },
    plastic: { name: T('Plastic', 'प्लास्टिक'), cond: 'no', colour: '#60A5FA', group: 'insulator' },
    rubber: { name: T('Rubber', 'रबड़'), cond: 'no', colour: '#F472B6', group: 'insulator' },
    wood: { name: T('Wood', 'लकड़ी'), cond: 'no', colour: '#C8956C', group: 'insulator' },
    glass: { name: T('Glass', 'काँच'), cond: 'no', colour: '#BFEAF5', group: 'insulator' },
    paper: { name: T('Paper', 'कागज़'), cond: 'no', colour: '#FFFBEA', group: 'insulator' },
    eraser: { name: T('Eraser', 'रबड़ (इरेज़र)'), cond: 'no', colour: '#F9A8D4', group: 'insulator' },
    cloth: { name: T('Cloth', 'कपड़ा'), cond: 'no', colour: '#A7F3D0', group: 'insulator' },
    air: { name: T('Air (a gap)', 'हवा (खाली जगह)'), cond: 'no', colour: '#F3F6FC', group: 'insulator' },
  };
  const WIRE_MATS = ['copper', 'aluminium', 'iron', 'nichrome', 'silver', 'tungsten', 'plastic', 'rubber', 'wood', 'glass', 'paper'];
  const RES_MATS = ['copper', 'aluminium', 'silver', 'tungsten', 'iron', 'nichrome', 'manganin', 'constantan'];
  // Household appliances: rated power at 220 V (typical Indian ratings).
  const APPL = {
    led: { name: T('LED bulb', 'LED बल्ब'), w: 9, kind: 'light', short: T('LED', 'LED') },
    bulb: { name: T('Filament bulb', 'फ़िलामेंट बल्ब'), w: 60, kind: 'light', short: T('Bulb', 'बल्ब') },
    bulb100: { name: T('100 W bulb', '100 W बल्ब'), w: 100, kind: 'light', short: T('100 W bulb', '100 W बल्ब') },
    tube: { name: T('Tube light', 'ट्यूब लाइट'), w: 40, kind: 'light', short: T('Tube', 'ट्यूब') },
    fan: { name: T('Ceiling fan', 'छत का पंखा'), w: 75, kind: 'motor', short: T('Fan', 'पंखा') },
    tv: { name: T('Television', 'टेलीविज़न'), w: 100, kind: 'box', short: T('TV', 'टीवी') },
    fridge: { name: T('Refrigerator', 'रेफ़्रिजरेटर'), w: 150, kind: 'box', short: T('Fridge', 'फ़्रिज') },
    cooler: { name: T('Air cooler', 'एयर कूलर'), w: 200, kind: 'motor', short: T('Cooler', 'कूलर') },
    iron: { name: T('Electric iron', 'बिजली की इस्तरी'), w: 1000, kind: 'heat', short: T('Iron', 'इस्तरी') },
    heater: { name: T('Room heater', 'रूम हीटर'), w: 1500, kind: 'heat', short: T('Heater', 'हीटर') },
    ac: { name: T('Air conditioner', 'एयर कंडीशनर'), w: 1500, kind: 'box', short: T('AC', 'AC') },
    geyser: { name: T('Geyser', 'गीज़र'), w: 2000, kind: 'heat', short: T('Geyser', 'गीज़र') },
  };
  const MAINS = 220;
  const GATES = {
    and: { name: 'AND', f: (a, b) => a && b, say: T('AND: both switches must be ON', 'AND: दोनों स्विच ON होने चाहिए') },
    or: { name: 'OR', f: (a, b) => a || b, say: T('OR: any one switch ON is enough', 'OR: कोई एक स्विच ON हो तो काफ़ी है') },
    not: { name: 'NOT', f: (a) => !a, one: true, say: T('NOT: the output is the opposite of the input', 'NOT: निर्गत, निवेश का उल्टा होता है') },
    nand: { name: 'NAND', f: (a, b) => !(a && b), say: T('NAND: OFF only when both are ON', 'NAND: केवल तब OFF जब दोनों ON हों') },
    nor: { name: 'NOR', f: (a, b) => !(a || b), say: T('NOR: ON only when both are OFF', 'NOR: केवल तब ON जब दोनों OFF हों') },
    xor: { name: 'XOR', f: (a, b) => a !== b, say: T('XOR: ON when the two inputs differ', 'XOR: ON जब दोनों निवेश अलग हों') },
  };
  const MODES = ['free', 'ohm', 'series-parallel', 'resistivity', 'power', 'house', 'conductors', 'kirchhoff', 'wheatstone', 'diode', 'logic'];
  const FREE_SLOTS = 6; // three on the top wire, three on the bottom wire
  const PRESETS = {
    free: {
      empty: [],
      torch: ['battery', 'switch:on', 'bulb', 'wire:copper', 'ammeter', 'wire:copper'],
      'two-bulbs': ['battery', 'bulb', 'bulb', null, 'switch', null],
      'bulb-resistor': ['battery', 'resistor', 'bulb', null, 'switch', 'ammeter'],
      'meter-pair': ['battery', 'ammeter', 'bulb', null, 'switch', null],
      rheostat: ['battery', 'rheostat', 'bulb', 'ammeter', 'switch', null],
      fuse: ['battery', 'fuse', 'bulb', null, 'switch', null],
      led: ['battery', 'resistor', 'led', null, 'switch', null],
      'opposite-cells': ['cell', 'cell', 'bulb', null, 'switch', null],
    },
    ohm: { basic: { v: 3, r: 10 }, "high-r": { v: 3, r: 40 }, "low-v": { v: 1.5, r: 10 } },
    'series-parallel': { series: 'series', parallel: 'parallel' },
    resistivity: { nichrome: 'nichrome', copper: 'copper' },
    power: { lights: ['led', 'bulb', 'bulb100'], kitchen: ['geyser', 'iron', 'fridge'], home: ['led', 'fan', 'tv', 'heater'] },
    house: { mcb: 'mcb', fuse: 'fuse' },
    conductors: { solids: 'solids', liquids: 'liquids', all: 'all' },
    kirchhoff: { basic: 1 },
    wheatstone: { balanced: 'balanced', unbalanced: 'unbalanced' },
    diode: { silicon: 'silicon', germanium: 'germanium', led: 'led' },
    logic: { and: 'and', or: 'or', not: 'not', nand: 'nand', nor: 'nor', xor: 'xor' },
  };
  const DEFAULT_PARTS = ['cell', 'battery', 'bulb', 'resistor', 'switch', 'ammeter', 'voltmeter', 'fuse', 'led', 'wire:copper', 'wire:plastic'];
  const fmtA = (i) => (Math.abs(i) < 0.0005 ? '0 A' : Math.abs(i) < 1 ? (i * 1000).toFixed(Math.abs(i) < 0.01 ? 2 : 0) + ' mA' : i.toFixed(2) + ' A');
  const fmtV = (v) => (Math.abs(v) < 0.0005 ? '0 V' : Math.abs(v) < 1 ? (v * 1000).toFixed(0) + ' mV' : v.toFixed(2) + ' V');
  const fmtR = (r) => (r >= 1e6 ? (r / 1e6).toFixed(2) + ' MΩ' : r >= 1000 ? (r / 1000).toFixed(2) + ' kΩ' : r >= 10 ? r.toFixed(1) + ' Ω' : r.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + ' Ω');
  const sig = (x, n = 3) => (x === 0 ? '0' : Number(x.toPrecision(n)).toString());

  // ---------- SVG primitives: each symbol is horizontal, centred at the origin, terminals at x = ±36 ----------
  const BG = '#F3F6FC', WIRE = '#2B3A55', GLASS = '#EAF2FF';
  const W = `stroke="${WIRE}" stroke-width="3.5" stroke-linecap="round" fill="none"`;
  const patch = (w, h) => `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="${BG}"/>`;
  const lead = (a, b) => `<line x1="${a}" y1="0" x2="${b}" y2="0" ${W}/>`;
  const up = (rot, x, y, inner) => `<g transform="translate(${x} ${y}) rotate(${-rot})">${inner}</g>`;
  const DEFS = `<defs>
    <radialGradient id="ccglow"><stop offset="0" stop-color="#FFF4B8" stop-opacity="1"/><stop offset=".45" stop-color="#FFD23F" stop-opacity=".75"/><stop offset="1" stop-color="#FFD23F" stop-opacity="0"/></radialGradient>
    <radialGradient id="ccglowr"><stop offset="0" stop-color="#FFD1CC" stop-opacity="1"/><stop offset=".45" stop-color="#FF6B57" stop-opacity=".7"/><stop offset="1" stop-color="#FF6B57" stop-opacity="0"/></radialGradient>
    <linearGradient id="ccglass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DCE7FA"/></linearGradient>
    <linearGradient id="ccboard" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6F8FD"/><stop offset="1" stop-color="#E4EAF6"/></linearGradient>
    <linearGradient id="ccwall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF9EC"/><stop offset="1" stop-color="#F3E9D2"/></linearGradient>
    <pattern id="ccgrid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#D5DEEE" stroke-width="1"/></pattern>
  </defs>`;
  const SYM = {
    cell(o, rot) {
      const d = o.dir === -1 ? -1 : 1;
      return patch(22, 42) + lead(-36, -5 * d) + lead(5 * d, 36) +
        `<line x1="${-5 * d}" y1="-9" x2="${-5 * d}" y2="9" stroke="${WIRE}" stroke-width="7" stroke-linecap="round"/><line x1="${5 * d}" y1="-18" x2="${5 * d}" y2="18" stroke="${WIRE}" stroke-width="3"/>` +
        up(rot, 13 * d, -24, `<text text-anchor="middle" class="cc-t" font-size="15" fill="#B42318">+</text>`) + up(rot, -13 * d, -24, `<text text-anchor="middle" class="cc-t" font-size="15">−</text>`);
    },
    battery(o, rot) {
      const d = o.dir === -1 ? -1 : 1;
      const plates = [-12, 4].map((x) => `<line x1="${(x - 3) * d}" y1="-9" x2="${(x - 3) * d}" y2="9" stroke="${WIRE}" stroke-width="7" stroke-linecap="round"/><line x1="${(x + 5) * d}" y1="-18" x2="${(x + 5) * d}" y2="18" stroke="${WIRE}" stroke-width="3"/>`).join('');
      return patch(40, 42) + lead(-36, -16 * d) + lead(16 * d, 36) + plates +
        up(rot, 22 * d, -24, `<text text-anchor="middle" class="cc-t" font-size="15" fill="#B42318">+</text>`) + up(rot, -22 * d, -24, `<text text-anchor="middle" class="cc-t" font-size="15">−</text>`);
    },
    bulb(o) {
      const g = clamp(o.glow || 0, 0, 1);
      const fil = o.blown ? `<path d="M-9 8l6-9 3 4" ${W} stroke-width="2"/><path d="M9 8l-4-7" ${W} stroke-width="2"/>` : `<path d="M-9 8l5-9 4 6 4-6 5 9" fill="none" stroke="${g > 0.05 ? mixHex('#7A6A4A', '#FFE27A', g) : '#5B5B66'}" stroke-width="2.5" stroke-linejoin="round"/>`;
      return `<circle r="40" fill="url(#ccglow)" opacity="${(g * 0.95).toFixed(2)}" class="${g > 0.3 ? 'cc-glow' : ''}"/>` + patch(36, 40) + lead(-36, -17) + lead(17, 36) +
        `<circle r="17" fill="${g > 0.05 ? mixHex(GLASS, '#FFF2B0', g) : GLASS}" stroke="${WIRE}" stroke-width="2.5"/>${fil}<rect x="-8" y="8" width="16" height="7" rx="2" fill="${WIRE}"/>`;
    },
    resistor(o, rot) {
      return patch(50, 24) + lead(-36, -24) + lead(24, 36) + `<rect x="-24" y="-8" width="48" height="16" rx="3" fill="#F8E3B0" stroke="#8B5E1A" stroke-width="2.5"/>` +
        `<rect x="-14" y="-8" width="5" height="16" fill="#8B5E1A"/><rect x="-4" y="-8" width="5" height="16" fill="#1D4ED8"/><rect x="6" y="-8" width="5" height="16" fill="#B42318"/>` +
        (o.label ? up(rot, 0, -16, `<text text-anchor="middle" class="cc-lbl" font-size="12">${esc(o.label)}</text>`) : '');
    },
    rheostat(o, rot) {
      const f = clamp(o.frac == null ? 0.5 : o.frac, 0, 1);
      const x = -22 + f * 44;
      return patch(60, 40) + lead(-36, -24) + lead(24, 36) + `<rect x="-24" y="-7" width="48" height="14" rx="3" fill="#F8E3B0" stroke="#8B5E1A" stroke-width="2.5"/>` +
        `<path d="M${x} -22v10" ${W} stroke-width="3"/><path d="M${x - 5} -14l5 7 5-7z" fill="${WIRE}"/><circle cx="${x}" cy="-22" r="4" fill="#8B3DFF"/>` +
        (o.label ? up(rot, 0, 20, `<text text-anchor="middle" class="cc-lbl" font-size="12">${esc(o.label)}</text>`) : '');
    },
    switch(o) {
      const on = !!o.on;
      return patch(44, 34) + lead(-36, -16) + lead(16, 36) + `<circle cx="-16" r="3.5" fill="${WIRE}"/><circle cx="16" r="3.5" fill="${WIRE}"/>` +
        `<line x1="-16" y1="0" x2="${on ? 16 : 11}" y2="${on ? 0 : -19}" stroke="${on ? '#0F766E' : '#B42318'}" stroke-width="4" stroke-linecap="round" style="transition: all .25s"/>`;
    },
    meter(o, rot) {
      const f = clamp(o.needle || 0, -1, 1);
      const ang = -60 + (f + 1) * 60;
      const col = o.kind === 'V' ? '#1D4ED8' : o.kind === 'G' ? '#8B3DFF' : '#0F766E';
      return patch(40, 44) + lead(-36, -19) + lead(19, 36) + `<circle r="19" fill="url(#ccglass)" stroke="${WIRE}" stroke-width="2.5"/>` +
        up(rot, 0, 0, `<path d="M-11 4a12 12 0 0 1 22 0" fill="none" stroke="#94A3B8" stroke-width="1.5"/><line x1="0" y1="5" x2="${(14 * Math.sin((ang * Math.PI) / 180)).toFixed(1)}" y2="${(5 - 14 * Math.cos((ang * Math.PI) / 180)).toFixed(1)}" stroke="#B42318" stroke-width="2" stroke-linecap="round" style="transition: all .4s"/><circle cy="5" r="2" fill="#B42318"/><text y="15" text-anchor="middle" class="cc-h" font-size="13" fill="${col}">${o.kind}</text>`) +
        (o.val != null ? up(rot, 0, 32, `<rect x="-30" y="-9" width="60" height="18" rx="5" fill="#0B1226"/><text y="4.5" text-anchor="middle" class="cc-val" font-size="12" fill="#5EE0C9">${esc(o.val)}</text>`) : '');
    },
    fuse(o) {
      return patch(46, 24) + lead(-36, -20) + lead(20, 36) + `<rect x="-20" y="-8" width="40" height="16" rx="8" fill="#FFF7E0" stroke="${WIRE}" stroke-width="2.5"/>` +
        (o.blown ? `<line x1="-14" y1="0" x2="-5" y2="0" ${W} stroke-width="2.5"/><line x1="5" y1="0" x2="14" y2="0" ${W} stroke-width="2.5"/><path d="M-3 -5l3 3-3 3M3 -5l-3 3 3 3" stroke="#FF6B57" stroke-width="2" fill="none"/>` : `<line x1="-14" y1="0" x2="14" y2="0" ${W} stroke-width="2.5"/>`);
    },
    diode(o) {
      const d = o.dir === -1 ? -1 : 1;
      return patch(36, 30) + lead(-36, -12) + lead(12, 36) + `<path d="M${-10 * d} -11v22l${20 * d} -11z" fill="#1E293B"/><line x1="${10 * d}" y1="-11" x2="${10 * d}" y2="11" stroke="${WIRE}" stroke-width="3.5"/>`;
    },
    led(o) {
      const d = o.dir === -1 ? -1 : 1;
      const g = clamp(o.glow || 0, 0, 1);
      return `<circle r="36" fill="url(#ccglowr)" opacity="${(g * 0.95).toFixed(2)}" class="${g > 0.3 ? 'cc-glow' : ''}"/>` + patch(36, 30) + lead(-36, -12) + lead(12, 36) +
        `<path d="M${-10 * d} -11v22l${20 * d} -11z" fill="${g > 0.05 ? mixHex('#B42318', '#FF6B57', g) : '#B42318'}"/><line x1="${10 * d}" y1="-11" x2="${10 * d}" y2="11" stroke="${WIRE}" stroke-width="3.5"/>` +
        `<path d="M2 -14l7 -8m-3 1l3 -1v3M-6 -14l7 -8m-3 1l3 -1v3" stroke="#B42318" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    },
    wire(o, rot) {
      const m = MAT[o.material] || MAT.copper;
      return patch(60, 20) + lead(-36, -28) + lead(28, 36) + `<rect x="-28" y="-4.5" width="56" height="9" rx="4.5" fill="${m.colour}" stroke="${m.cond === 'yes' ? '#6B4A1E' : '#64748B'}" stroke-width="1.5"/><rect x="-24" y="-3" width="48" height="2" rx="1" fill="#FFFFFF" opacity=".45"/>` +
        (o.label ? up(rot, 0, -14, `<text text-anchor="middle" class="cc-lbl" font-size="11">${esc(o.label)}</text>`) : '');
    },
    gap() { return `<rect x="-26" y="-7" width="52" height="14" rx="6" class="cc-slot"/>`; },
  };
  // Put a symbol on the board. rot: 0 along +x, 90 down, 180 along −x, 270 up (loop direction). Returns a group.
  function place(type, x, y, rot, o = {}, attrs = '') {
    const f = SYM[type];
    return `<g transform="translate(${x} ${y}) rotate(${rot})" ${attrs}>${f ? f(o, rot) : ''}</g>`;
  }
  const rectPath = (x, y, w, h) => `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  // Animated current along a path: speed from the current size; direction from its sign.
  const flow = (d, I) => (Math.abs(I) < 1e-4 ? '' : `<path d="${d}" class="cc-flow ${I < 0 ? 'rev' : ''}" style="--cc-speed: ${clamp(0.5 / Math.min(2, Math.abs(I)) , 0.25, 2.5).toFixed(2)}s"/>`);
  const wire = (d, hot) => `<path d="${d}" ${W} ${hot ? 'stroke="#FF6B57" class="cc-hot"' : ''}/>`;
  // Font sizes grow a little in a narrow container (--cc-k) so the board stays readable on a phone.
  const text = (x, y, s, cls = 'cc-t', size = 14, extra = '') => `<text x="${x}" y="${y}" class="${cls}" font-size="${size}" style="font-size: calc(${size}px * var(--cc-k, 1))" ${extra}>${esc(s)}</text>`;
  const ctl = (key, label, inner, sel) => `<g data-key="${esc(key)}" class="cc-ctl ${sel ? 'sel' : ''}" role="button" tabindex="0" aria-label="${esc(label)}" ${sel ? 'aria-pressed="true"' : ''}>${inner}</g>`;

  // ---------- physics ----------
  // One series loop. items: [{ type, dir, on, material, r, rating, frac }] in loop order. Returns the loop state.
  function solveSeries(items) {
    const out = { open: false, short: false, E: 0, R: 0, I: 0, why: null };
    let E = 0, R = 0;
    const diodes = [];
    for (const it of items) {
      const p = PARTS[it.type];
      if (!it.type || it.type === 'gap') { out.open = true; out.why = 'gap'; continue; }
      if (it.type === 'switch' && !it.on) { out.open = true; out.why = 'switch'; continue; }
      if (it.type === 'wire') { const m = MAT[it.material]; if (!m || m.cond !== 'yes') { out.open = true; out.why = 'insulator'; } else if (it.material === 'nichrome') R += 2; continue; }
      if (it.type === 'fuse' && it.blown) { out.open = true; out.why = 'fuse'; continue; }
      if (it.type === 'bulb' && it.blown) { out.open = true; out.why = 'bulb'; continue; }
      if (p && p.emf) E += p.emf * (it.dir === -1 ? -1 : 1);
      if (it.type === 'rheostat') R += 50 * clamp(it.frac == null ? 0.5 : it.frac, 0, 1);
      else if (p && p.vf) diodes.push(it);
      else if (p) R += p.r || 0;
    }
    out.E = E;
    if (out.open) return out;
    const s = Math.sign(E);
    let Eeff = E;
    for (const d of diodes) {
      if (s === 0 || (d.dir === -1 ? -1 : 1) !== s) { out.open = true; out.why = 'diode'; return out; }
      Eeff -= PARTS[d.type].vf * s; R += PARTS[d.type].r;
    }
    if (diodes.length && Math.sign(Eeff) !== s) { out.open = true; out.why = 'diode-low'; return out; }
    out.R = R;
    if (Math.abs(E) > 0 && R < 0.5) { out.short = true; out.I = s * 60; return out; }
    out.I = R > 0 ? Eeff / R : 0;
    return out;
  }
  const bulbGlow = (I, r = 10, rated = 0.9) => clamp((I * I * r) / rated, 0, 1);
  const ledGlow = (I) => clamp(Math.abs(I) / 0.08, 0, 1);

  // ---------- HTML helpers ----------
  const slider = (key, label, min, max, step, val, out) => `<label class="cc-sl"><span>${esc(label)}</span><input type="range" data-key="${esc(key)}" min="${min}" max="${max}" step="${step}" value="${val}" aria-label="${esc(label)}"><output>${esc(out)}</output></label>`;
  const chip = (key, label, on, extra = '', cls = '') => `<button type="button" class="cc-chip ${cls}" data-key="${esc(key)}" aria-pressed="${on ? 'true' : 'false'}" ${extra}>${label}</button>`;
  const read = (label, val) => `<span class="cc-read">${esc(label)} <b>${esc(val)}</b></span>`;

  // ---------- the engine of this template: one mount, many modes ----------
  const MODE = {};
  function mount(root, cfg, api) {
    cfg = Object.assign({ parts: null, preset: null }, cfg);
    const m = MODE[cfg.mode];
    const c = { S: { sl: {}, flags: {}, reads: {} }, cfg, api, t: (x) => api.t(x), root, m, busy: false };
    root.innerHTML = `<div class="cc"><div class="cc-in"><svg class="cc-svg" viewBox="0 0 640 ${m.H || 320}" role="group" aria-label="${esc(api.t({ en: 'Circuit board', hi: 'परिपथ बोर्ड' }))}"></svg>
      <div class="cc-panel"><div class="cc-ctrls"></div><div class="cc-reads" aria-live="polite"></div><div class="cc-out" aria-live="polite"></div></div></div></div>`;
    c.svg = root.querySelector('svg');
    c.ctrls = root.querySelector('.cc-ctrls');
    c.reads = root.querySelector('.cc-reads');
    c.out = root.querySelector('.cc-out');
    m.init(c);
    c.ctrls.innerHTML = m.ctrls(c);
    let first = true;
    c.draw = function draw() {
      const r = m.compute(c) || {};
      c.svg.innerHTML = DEFS + m.svg(c, r);
      const p = m.panel(c, r) || {};
      c.reads.innerHTML = p.reads || '';
      c.out.innerHTML = p.out || '';
      if (m.sync) m.sync(c, r);
      // Flags → events (only on change, never at the first draw).
      const F = c.S.flags, N = { closed: !!r.closed, lit: !!r.lit };
      if (!first) {
        if (N.closed !== !!F.closed) api.emit(N.closed ? 'closed' : 'open');
        if (N.lit && !F.lit) api.emit('lit');
        for (const k of ['ammeter', 'voltmeter']) if (r.reads && r.reads[k] != null && r.reads[k] !== c.S.reads[k]) api.emit('reading:' + k);
      }
      Object.assign(F, N);
      if (r.reads) Object.assign(c.S.reads, r.reads);
      first = false;
    };
    c.draw();
    const onKey = (key, el) => {
      if (c.busy) return;
      if (!api.allowed(key)) { api.nudge(key); return; }
      m.act(c, key, el);
    };
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-key]');
      if (!el || el.tagName === 'INPUT' || el.tagName === 'LABEL') return;
      onKey(el.dataset.key, el);
    });
    root.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('g[data-key]')) { e.preventDefault(); onKey(e.target.dataset.key, e.target); }
    });
    root.addEventListener('input', (e) => {
      const el = e.target;
      if (!el.matches('input[type=range][data-key]')) return;
      const key = el.dataset.key;
      if (!api.allowed(key)) { el.value = el.dataset.prev == null ? el.defaultValue : el.dataset.prev; api.nudge(key); return; }
      el.dataset.prev = el.value;
      c.S.sl[key.slice(7)] = Number(el.value);
      const o = el.parentElement.querySelector('output');
      if (o && m.slideText) o.textContent = m.slideText(c, key.slice(7), Number(el.value));
      c.draw();
    });
    root.addEventListener('change', (e) => { const el = e.target; if (el.matches('input[type=range][data-key]') && m.slideDone) m.slideDone(c, el.dataset.key.slice(7)); });
    return { destroy() { if (c.stop) c.stop(); } };
  }
  // Common words.
  const U = {
    on: T('ON', 'ON'), off: T('OFF', 'OFF'), switch: T('Switch', 'स्विच'),
    ammeter: T('Ammeter', 'ऐमीटर'), voltmeter: T('Voltmeter', 'वोल्टमीटर'), current: T('Current', 'धारा'), voltage: T('Voltage', 'वोल्टता'), resistance: T('Resistance', 'प्रतिरोध'),
    open: T('The circuit is open: no current flows.', 'परिपथ खुला है: धारा नहीं बहती।'),
    closed: T('The circuit is closed: current flows.', 'परिपथ बंद है: धारा बह रही है।'),
    short: T('Short circuit! Almost no resistance, so a huge current flows and the wires get hot. Never do this for real.', 'शॉर्ट सर्किट! प्रतिरोध लगभग शून्य है, इसलिए बहुत बड़ी धारा बहती है और तार गर्म हो जाते हैं। असल में ऐसा कभी मत करना।'),
    plot: T('Plot this point', 'यह बिंदु अंकित करो'), reset: T('Reset', 'फिर से'),
  };
  const switchChip = (c, on, key = 'switch') => chip(key, `<i class="sw"></i>${esc(c.t(U.switch))}: ${esc(c.t(on ? U.on : U.off))}`, on);

  // ================= FREE: build a loop on the board =================
  const partName = (id) => (id.startsWith('wire:') ? { en: (MAT[id.slice(5)] || MAT.copper).name.en + ' wire', hi: (MAT[id.slice(5)] || MAT.copper).name.hi + ' का तार' } : PARTS[id].name);
  const SLOT_POS = [[153, 60, 0], [320, 60, 0], [487, 60, 0], [487, 260, 180], [320, 260, 180], [153, 260, 180]];
  MODE.free = {
    H: 320,
    init(c) {
      const tray = (c.cfg.parts && c.cfg.parts.length ? c.cfg.parts : DEFAULT_PARTS).filter((p, i, a) => a.indexOf(p) === i);
      c.S.tray = tray;
      const pre = PRESETS.free[c.cfg.preset || 'empty'] || [];
      c.S.slots = Array.from({ length: FREE_SLOTS }, (_, i) => (pre[i] ? mk(pre[i]) : null));
      c.S.sl.rheostat = 25;
      function mk(id) { if (id === 'switch:on') return { type: 'switch', on: true }; return id.startsWith('wire:') ? { type: 'wire', material: id.slice(5) } : { type: id, dir: 1, on: id === 'switch' ? false : undefined, frac: 0.5 }; }
      c.mk = mk;
    },
    ctrls(c) {
      return `<div class="cc-chips" aria-label="${esc(c.t({ en: 'Parts tray', hi: 'पुर्ज़ों की ट्रे' }))}">${c.S.tray.map((id) => chip('part:' + id, esc(c.t(partName(id))), false)).join('')}
        <button type="button" class="cc-btn" data-key="clear">${esc(c.t({ en: 'Clear the board', hi: 'बोर्ड ख़ाली करो' }))}</button></div>
        <div class="cc-sliders" id="cc-rh" hidden>${slider('slider:rheostat', c.t({ en: 'Rheostat', hi: 'धारा नियंत्रक' }), 0, 50, 1, 25, '25 Ω')}</div>
        <p class="cc-tip">${esc(c.t({ en: 'Tap a part to put it on the board. Tap a gap to join it with wire. Tap a cell to turn it around; tap a part to take it off.', hi: 'पुर्ज़े पर टैप करो तो वह बोर्ड पर लग जाता है। खाली जगह पर टैप करो तो तार जुड़ जाता है। सेल पर टैप करो तो वह पलट जाता है; किसी पुर्ज़े पर टैप करो तो वह हट जाता है।' }))}</p>`;
    },
    slideText: (c, k, v) => v + ' Ω',
    compute(c) {
      const items = c.S.slots.map((s) => (s ? Object.assign({}, s, { frac: c.S.sl.rheostat / 50 }) : { type: 'gap' }));
      const r = solveSeries(items);
      r.items = items;
      // Fuse and bulb protection, applied once (they stay blown until the board is cleared).
      let changed = false;
      if (!r.open) c.S.slots.forEach((s) => {
        if (!s) return;
        if (s.type === 'fuse' && !s.blown && Math.abs(r.I) > PARTS.fuse.rating) { s.blown = true; changed = true; c.api.emit('fused'); c.api.record(c.t({ en: 'The fuse melted', hi: 'फ़्यूज़ पिघल गया' })); }
        if (s.type === 'bulb' && !s.blown && (r.short || r.I * r.I * PARTS.bulb.r > 5 * PARTS.bulb.rated)) { s.blown = true; changed = true; c.api.emit('blown'); c.api.record(c.t({ en: 'The bulb burnt out', hi: 'बल्ब फुंक गया' })); }
      });
      if (changed) return MODE.free.compute(c);
      if (r.short && !c.S.shortSeen) { c.S.shortSeen = true; c.api.emit('short'); } else if (!r.short) c.S.shortSeen = false;
      r.closed = !r.open;
      r.lit = !r.open && items.some((it) => (it.type === 'bulb' && !it.blown && bulbGlow(r.I) > 0.05) || (it.type === 'led' && ledGlow(r.I) > 0.05));
      r.reads = {};
      if (items.some((it) => it.type === 'ammeter')) r.reads.ammeter = r.open ? '0 A' : r.short ? '>10 A' : fmtA(r.I);
      if (items.some((it) => it.type === 'voltmeter')) r.reads.voltmeter = r.open && r.why !== 'gap' && r.why !== 'switch' && r.why !== 'insulator' ? '0 V' : fmtV(r.open ? 0 : Math.abs(r.E) - Math.abs(r.I) * 0);
      return r;
    },
    svg(c, r) {
      const d = rectPath(70, 60, 500, 200);
      const hot = r.short;
      let g = `<rect width="640" height="320" fill="url(#ccboard)"/><rect width="640" height="320" fill="url(#ccgrid)" opacity=".8"/>` + wire(d, hot) + (r.open || hot ? '' : flow(d, r.I));
      g += text(320, 300, c.t(r.open ? U.open : r.short ? U.short : U.closed).split('!')[0], 'cc-lbl', 14, 'text-anchor="middle"');
      r.items.forEach((it, i) => {
        const [x, y, rot] = SLOT_POS[i];
        const s = c.S.slots[i];
        let inner, key = 'board', label;
        if (!s) { inner = SYM.gap(); label = c.t({ en: 'Gap: tap to join with wire', hi: 'खाली जगह: तार जोड़ने के लिए टैप करो' }); }
        else {
          const o = Object.assign({}, s);
          if (s.type === 'bulb') o.glow = r.open ? 0 : bulbGlow(r.I);
          if (s.type === 'led') o.glow = r.open ? 0 : ledGlow(r.I);
          if (s.type === 'ammeter') { o.kind = 'A'; o.val = r.reads.ammeter; o.needle = r.open ? 0 : clamp(r.I / 1, -1, 1); }
          if (s.type === 'voltmeter') { o.kind = 'V'; o.val = r.reads.voltmeter; o.needle = r.open && r.why ? 0 : clamp(Math.abs(r.E) / 6, 0, 1); }
          if (s.type === 'resistor') o.label = '20 Ω';
          if (s.type === 'rheostat') { o.frac = c.S.sl.rheostat / 50; o.label = c.S.sl.rheostat + ' Ω'; }
          if (s.type === 'wire') o.label = c.t(MAT[s.material].name);
          inner = SYM[s.type === 'ammeter' || s.type === 'voltmeter' ? 'meter' : s.type](o, rot);
          if (s.type === 'switch') key = 'switch';
          label = c.t(partName(s.type === 'wire' ? 'wire:' + s.material : s.type));
        }
        g += `<g transform="translate(${x} ${y}) rotate(${rot})">${ctl(key, label, `<rect x="-40" y="-30" width="80" height="60" fill="transparent"/>${inner}`)}</g>`;
      });
      return g;
    },
    panel(c, r) {
      const reads = Object.keys(r.reads).map((k) => read(c.t(U[k]), r.reads[k])).join('');
      let out;
      const WHY = { gap: T('There is a gap in the loop. Tap a gap to join it with a wire.', 'लूप में खाली जगह है। तार जोड़ने के लिए खाली जगह पर टैप करो।'), switch: T('The switch is open. Tap it to close the circuit.', 'स्विच खुला है। परिपथ बंद करने के लिए उस पर टैप करो।'), insulator: T('That wire is an insulator: it does not let current through.', 'वह तार कुचालक है: वह धारा को नहीं जाने देता।'), fuse: T('The fuse has melted, so the circuit is open. That is its job: it protects the bulb and the wires.', 'फ़्यूज़ पिघल गया है, इसलिए परिपथ खुला है। यही उसका काम है: वह बल्ब और तारों को बचाता है।'), bulb: T('The bulb burnt out: too much current for its thin filament.', 'बल्ब फुंक गया: उसके पतले फ़िलामेंट के लिए धारा बहुत ज़्यादा थी।'), diode: T('The diode is the wrong way round: it lets current pass only from + to −. Tap it to turn it.', 'डायोड उल्टा लगा है: वह धारा को केवल + से − की ओर जाने देता है। उसे पलटने के लिए टैप करो।'), 'diode-low': T('Not enough voltage to push current through the diode.', 'डायोड से धारा निकालने के लिए वोल्टता काफ़ी नहीं है।') };
      if (r.open) out = `<p>${esc(c.t(WHY[r.why] || U.open))}</p>`;
      else if (r.short) out = `<p class="warn">${esc(c.t(U.short))}</p>`;
      else if (Math.abs(r.E) < 1e-9) out = `<p>${esc(c.t(c.S.slots.some((s) => s && PARTS[s.type] && PARTS[s.type].emf) ? { en: 'The cells push against each other, so their voltages cancel: no current.', hi: 'सेल एक-दूसरे के विरुद्ध धकेलते हैं, इसलिए उनकी वोल्टता रद्द हो जाती है: धारा शून्य।' } : { en: 'The loop is complete, but there is no cell to push the current.', hi: 'लूप पूरा है, पर धारा को धकेलने के लिए कोई सेल नहीं है।' }))}</p>`;
      else {
        const volt = c.S.slots.some((s) => s && s.type === 'voltmeter');
        out = `<div class="eq">I = V / R = ${sig(Math.abs(r.E))} V / ${sig(r.R)} Ω = ${fmtA(Math.abs(r.I))}</div>` +
          (volt ? `<p>${esc(c.t({ en: 'A voltmeter has a very high resistance. Put in series like this, it almost stops the current and reads the whole battery voltage. In a real circuit it goes across a part (in parallel).', hi: 'वोल्टमीटर का प्रतिरोध बहुत ज़्यादा होता है। इस तरह श्रेणी में लगाने पर यह धारा लगभग रोक देता है और पूरी बैटरी की वोल्टता दिखाता है। असली परिपथ में इसे किसी पुर्ज़े के आर-पार (समांतर) लगाते हैं।' }))}</p>` : '') +
          (c.S.slots.some((s) => s && s.type === 'bulb') ? `<p>${esc(c.t({ en: 'Bulb power P = I²R = ', hi: 'बल्ब की शक्ति P = I²R = ' }))}${sig(r.I * r.I * 10, 2)} W ${esc(c.t({ en: '(rated 0.9 W)', hi: '(निर्धारित 0.9 W)' }))}</p>` : '');
      }
      return { reads, out };
    },
    sync(c) { const rh = c.root.querySelector('#cc-rh'); if (rh) rh.hidden = !c.S.slots.some((s) => s && s.type === 'rheostat'); },
    act(c, key, el) {
      const S = c.S;
      if (key.startsWith('part:')) {
        const id = key.slice(5);
        const i = S.slots.indexOf(null);
        if (i < 0) { c.api.toast({ en: 'The board is full. Tap a part to take it off.', hi: 'बोर्ड भर गया है। किसी पुर्ज़े को हटाने के लिए उस पर टैप करो।' }); return; }
        S.slots[i] = c.mk(id);
        c.api.record(c.t({ en: 'Put on the board: ', hi: 'बोर्ड पर लगाया: ' }) + c.t(partName(id)));
        c.api.speak(c.t(partName(id)));
        c.draw(); c.api.emit('placed:' + id);
      } else if (key === 'board' || key === 'switch') {
        const g = el.ownerSVGElement ? [...c.svg.querySelectorAll('g[data-key]')].indexOf(el) : -1;
        if (g < 0) return;
        const s = S.slots[g];
        if (!s) { S.slots[g] = c.mk('wire:copper'); c.draw(); c.api.emit('placed:wire:copper'); return; }
        if (s.type === 'switch') { s.on = !s.on; c.draw(); c.api.record(c.t(s.on ? { en: 'Closed the switch', hi: 'स्विच बंद किया' } : { en: 'Opened the switch', hi: 'स्विच खोला' })); return; }
        if (['cell', 'battery', 'diode', 'led'].includes(s.type)) { s.dir = s.dir === -1 ? 1 : -1; c.draw(); c.api.emit('flipped'); return; }
        S.slots[g] = null; c.draw(); c.api.emit('removed');
        c.api.record(c.t({ en: 'Took off: ', hi: 'हटाया: ' }) + c.t(partName(s.type === 'wire' ? 'wire:' + s.material : s.type)));
      } else if (key === 'clear') {
        S.slots = S.slots.map(() => null); S.shortSeen = false; c.draw(); c.api.emit('cleared');
      }
    },
    keys(cfg) {
      const tray = (cfg.parts && cfg.parts.length ? cfg.parts : DEFAULT_PARTS);
      return { targets: tray.map((p) => 'part:' + p).concat(['board', 'switch', 'slider:rheostat', 'clear']), events: ['closed', 'open', 'lit', 'reading:ammeter', 'reading:voltmeter', 'fused', 'blown', 'short', 'placed:*', 'removed', 'flipped', 'cleared'] };
    },
  };

  // ================= OHM: V, I and the V–I graph =================
  MODE.ohm = {
    H: 320,
    init(c) { const p = PRESETS.ohm[c.cfg.preset] || PRESETS.ohm.basic; c.S.sl.voltage = p.v; c.S.sl.resistance = p.r; c.S.on = false; c.S.pts = []; },
    ctrls(c) {
      return `<div class="cc-row">${switchChip(c, false)}<button type="button" class="cc-btn go" data-key="plot">${esc(c.t(U.plot))}</button><button type="button" class="cc-btn" data-key="clear">${esc(c.t({ en: 'Clear graph', hi: 'ग्राफ़ साफ़ करो' }))}</button></div>
        <div class="cc-sliders">${slider('slider:voltage', c.t({ en: 'Battery voltage', hi: 'बैटरी की वोल्टता' }), 0, 6, 0.5, c.S.sl.voltage, c.S.sl.voltage + ' V')}${slider('slider:resistance', c.t(U.resistance), 5, 50, 5, c.S.sl.resistance, c.S.sl.resistance + ' Ω')}</div>`;
    },
    slideText: (c, k, v) => v + (k === 'voltage' ? ' V' : ' Ω'),
    compute(c) {
      const V = c.S.sl.voltage, R = c.S.sl.resistance, on = c.S.on;
      const I = on ? V / R : 0;
      return { closed: on, V, R, I, reads: { ammeter: fmtA(I), voltmeter: fmtV(on ? V : 0) } };
    },
    svg(c, r) {
      const d = rectPath(60, 50, 320, 180), dv = 'M150 230V268H290V230';
      let g = `<rect width="640" height="320" fill="url(#ccboard)"/><rect width="640" height="320" fill="url(#ccgrid)" opacity=".8"/>` + wire(d) + wire(dv) + flow(d, r.I);
      g += `<circle cx="150" cy="230" r="4" fill="${WIRE}"/><circle cx="290" cy="230" r="4" fill="${WIRE}"/>`;
      g += place('battery', 120, 50, 0, { dir: 1 }) + text(120, 22, r.V + ' V', 'cc-h', 15, 'text-anchor="middle"');
      g += `<g transform="translate(220 50)">${ctl('switch', c.t(U.switch), `<rect x="-30" y="-26" width="60" height="52" fill="transparent"/>` + SYM.switch({ on: c.S.on }))}</g>`;
      g += place('meter', 320, 50, 0, { kind: 'A', val: r.reads.ammeter, needle: clamp(r.I / 1.2, 0, 1) });
      g += place('resistor', 220, 230, 180, { label: r.R + ' Ω' });
      g += place('meter', 220, 268, 0, { kind: 'V', val: r.reads.voltmeter, needle: clamp((c.S.on ? r.V : 0) / 6, 0, 1) });
      // The V–I graph.
      const gx = 440, gy = 270, gw = 170, gh = 220, Imax = 1.25;
      g += `<rect x="${gx - 50}" y="${gy - gh - 30}" width="${gw + 70}" height="${gh + 70}" rx="14" fill="#FFFFFF" stroke="#CBD5E1"/>`;
      g += `<path d="M${gx} ${gy - gh}V${gy}H${gx + gw}" fill="none" stroke="#475569" stroke-width="2"/>`;
      g += text(gx + gw / 2, gy + 28, c.t({ en: 'V (volt) →', hi: 'V (वोल्ट) →' }), 'cc-lbl', 12, 'text-anchor="middle"') + text(gx - 36, gy - gh / 2, c.t({ en: 'I (A)', hi: 'I (A)' }), 'cc-lbl', 12, `text-anchor="middle" transform="rotate(-90 ${gx - 36} ${gy - gh / 2})"`);
      for (let v = 0; v <= 6; v += 2) g += text(gx + (v / 6) * gw, gy + 14, String(v), 'cc-lbl', 11, 'text-anchor="middle"');
      for (let i = 0; i <= 1.2; i += 0.4) g += text(gx - 6, gy - (i / Imax) * gh + 4, i.toFixed(1), 'cc-lbl', 11, 'text-anchor="end"');
      const px = (v) => gx + (v / 6) * gw, py = (i) => gy - clamp(i / Imax, 0, 1) * gh;
      g += `<line x1="${px(0)}" y1="${py(0)}" x2="${px(Math.min(6, Imax * r.R))}" y2="${py(Math.min(6, Imax * r.R) / r.R)}" stroke="#1D4ED8" stroke-width="2" stroke-dasharray="4 4" opacity=".6"/>`;
      c.S.pts.forEach((p) => { g += `<circle cx="${px(p.V)}" cy="${py(p.I)}" r="5" fill="${p.R === r.R ? '#8B3DFF' : '#94A3B8'}" stroke="#fff" stroke-width="1.5"/>`; });
      if (c.S.on) g += `<circle cx="${px(r.V)}" cy="${py(r.I)}" r="7" fill="none" stroke="#FF7A1A" stroke-width="2.5"/>`;
      g += text(gx + gw / 2, gy - gh - 12, c.t({ en: 'V–I graph', hi: 'V–I ग्राफ़' }), 'cc-h', 14, 'text-anchor="middle"');
      return g;
    },
    panel(c, r) {
      const reads = read(c.t(U.voltmeter), r.reads.voltmeter) + read(c.t(U.ammeter), r.reads.ammeter);
      const mine = c.S.pts.filter((p) => p.R === r.R);
      let out = c.S.on ? `<div class="eq">V = I × R → ${r.V} V = ${sig(r.I)} A × ${r.R} Ω</div><p>${esc(c.t({ en: 'V ÷ I = ', hi: 'V ÷ I = ' }))}${r.I ? sig(r.V / r.I) + ' Ω' : '—'} ${esc(c.t({ en: '(always the resistance). Change the voltage and plot points: they lie on one straight line through the origin.', hi: '(हमेशा प्रतिरोध)। वोल्टता बदलो और बिंदु अंकित करो: वे मूल बिंदु से जाती एक सीधी रेखा पर होते हैं।' }))}</p>` : `<p>${esc(c.t(U.open))}</p>`;
      if (mine.length) out += `<table class="cc-table"><tr><th>V</th><th>I</th><th>V/I</th></tr>${mine.map((p) => `<tr><td>${p.V} V</td><td>${fmtA(p.I)}</td><td>${p.I ? sig(p.V / p.I) + ' Ω' : '—'}</td></tr>`).join('')}</table>`;
      return { reads, out };
    },
    act(c, key) {
      if (key === 'switch') { c.S.on = !c.S.on; c.draw(); c.api.record(c.t(c.S.on ? { en: 'Closed the switch', hi: 'स्विच बंद किया' } : { en: 'Opened the switch', hi: 'स्विच खोला' })); }
      else if (key === 'plot') {
        if (!c.S.on) { c.api.toast({ en: 'Close the switch first, so the meters read.', hi: 'पहले स्विच बंद करो, ताकि मीटर पढ़ें।' }); return; }
        const V = c.S.sl.voltage, R = c.S.sl.resistance;
        if (!c.S.pts.some((p) => p.V === V && p.R === R)) c.S.pts.push({ V, R, I: V / R });
        c.draw(); c.api.emit('plotted'); c.api.record(c.t({ en: 'Plotted ', hi: 'अंकित किया ' }) + `(${V} V, ${fmtA(V / R)})`);
      } else if (key === 'clear') { c.S.pts = []; c.draw(); }
    },
    sync(c) { const b = c.root.querySelector('button[data-key="switch"]'); if (b) { b.setAttribute('aria-pressed', String(c.S.on)); b.innerHTML = `<i class="sw"></i>${esc(c.t(U.switch))}: ${esc(c.t(c.S.on ? U.on : U.off))}`; } },
    keys: () => ({ targets: ['switch', 'slider:voltage', 'slider:resistance', 'plot', 'clear'], events: ['closed', 'open', 'reading:ammeter', 'reading:voltmeter', 'plotted'] }),
  };

  // ================= SERIES-PARALLEL: two bulbs, one battery =================
  MODE['series-parallel'] = {
    H: 340,
    init(c) { c.S.arr = PRESETS['series-parallel'][c.cfg.preset] || 'series'; c.S.on = false; c.S.in = [true, true]; c.S.sl.r1 = 10; c.S.sl.r2 = 20; c.S.V = 6; },
    ctrls(c) {
      return `<div class="cc-row">${switchChip(c, false)}${chip('series', esc(c.t({ en: 'Series', hi: 'श्रेणी' })), true)}${chip('parallel', esc(c.t({ en: 'Parallel', hi: 'समांतर' })), false)}</div>
        <div class="cc-sliders">${slider('slider:r1', c.t({ en: 'Bulb 1', hi: 'बल्ब 1' }), 5, 40, 5, 10, '10 Ω')}${slider('slider:r2', c.t({ en: 'Bulb 2', hi: 'बल्ब 2' }), 5, 40, 5, 20, '20 Ω')}</div>
        <p class="cc-tip">${esc(c.t({ en: 'Tap a bulb to unscrew it and see what the other one does.', hi: 'किसी बल्ब पर टैप करके उसे निकालो और देखो दूसरा क्या करता है।' }))}</p>`;
    },
    slideText: (c, k, v) => v + ' Ω',
    compute(c) {
      const V = c.S.V, R1 = c.S.sl.r1, R2 = c.S.sl.r2, [a, b] = c.S.in, on = c.S.on, ser = c.S.arr === 'series';
      let I = 0, I1 = 0, I2 = 0, Req = 0;
      if (ser) { Req = R1 + R2; if (on && a && b) { I = V / Req; I1 = I2 = I; } }
      else { Req = a && b ? (R1 * R2) / (R1 + R2) : a ? R1 : b ? R2 : Infinity; if (on) { I1 = a ? V / R1 : 0; I2 = b ? V / R2 : 0; I = I1 + I2; } }
      const g1 = clamp((I1 * I1 * R1) / 0.9, 0, 1), g2 = clamp((I2 * I2 * R2) / 0.9, 0, 1);
      return { closed: on && (ser ? a && b : a || b), lit: g1 > 0.05 || g2 > 0.05, I, I1, I2, Req, g1, g2, ser, V, reads: { ammeter: fmtA(I) } };
    },
    svg(c, r) {
      let g = `<rect width="640" height="340" fill="url(#ccboard)"/><rect width="640" height="340" fill="url(#ccgrid)" opacity=".8"/>`;
      const top = 'M60 230V50H580V230';
      const bulb = (i, x, y, rot, glow) => `<g transform="translate(${x} ${y}) rotate(${rot})">${ctl('part:bulb' + (i + 1), c.t({ en: 'Bulb ' + (i + 1), hi: 'बल्ब ' + (i + 1) }), `<rect x="-40" y="-30" width="80" height="60" fill="transparent"/>` + (c.S.in[i] ? SYM.bulb({ glow }) : patch(40, 40) + `<circle r="17" fill="none" stroke="#94A3B8" stroke-width="2" stroke-dasharray="5 4"/>`))}</g>` + up(0, x, y + (rot === 180 ? -34 : 34), text(0, 4, (i ? c.S.sl.r2 : c.S.sl.r1) + ' Ω', 'cc-lbl', 12, 'text-anchor="middle"'));
      if (r.ser) {
        g += wire(top) + wire('M580 230H60') + flow(top + 'H60', r.I);
        g += bulb(1, 230, 230, 180, r.g2) + bulb(0, 410, 230, 180, r.g1);
      } else {
        g += wire(top) + wire('M580 230H60') + wire('M460 230V300H180V230');
        g += flow(top + 'H460', r.I) + flow('M460 230H180', r.I1) + flow('M460 230V300H180V230', r.I2) + flow('M180 230H60', r.I);
        g += `<circle cx="180" cy="230" r="4.5" fill="${WIRE}"/><circle cx="460" cy="230" r="4.5" fill="${WIRE}"/>`;
        g += bulb(0, 320, 230, 180, r.g1) + bulb(1, 320, 300, 180, r.g2);
      }
      g += place('battery', 130, 50, 0, { dir: 1 }) + text(130, 22, r.V + ' V', 'cc-h', 15, 'text-anchor="middle"');
      g += `<g transform="translate(300 50)">${ctl('switch', c.t(U.switch), `<rect x="-30" y="-26" width="60" height="52" fill="transparent"/>` + SYM.switch({ on: c.S.on }))}</g>`;
      g += place('meter', 470, 50, 0, { kind: 'A', val: r.reads.ammeter, needle: clamp(r.I / 1.5, 0, 1) });
      g += text(320, r.ser ? 300 : 330, c.t(r.ser ? { en: 'Series: one path, the same current through both', hi: 'श्रेणी: एक ही रास्ता, दोनों में समान धारा' } : { en: 'Parallel: two paths, the same voltage across both', hi: 'समांतर: दो रास्ते, दोनों पर समान वोल्टता' }), 'cc-lbl', 13, 'text-anchor="middle"');
      return g;
    },
    panel(c, r) {
      const R1 = c.S.sl.r1, R2 = c.S.sl.r2;
      const reads = read(c.t(U.ammeter), r.reads.ammeter) + read(c.t({ en: 'Bulb 1', hi: 'बल्ब 1' }), fmtA(r.I1)) + read(c.t({ en: 'Bulb 2', hi: 'बल्ब 2' }), fmtA(r.I2));
      const eq = r.ser ? `R = R₁ + R₂ = ${R1} + ${R2} = ${R1 + R2} Ω` : `1/R = 1/R₁ + 1/R₂ → R = ${sig((R1 * R2) / (R1 + R2))} Ω`;
      let out = `<div class="eq">${esc(eq)}</div>`;
      if (!c.S.on) out += `<p>${esc(c.t(U.open))}</p>`;
      else if (r.ser && !(c.S.in[0] && c.S.in[1])) out += `<p class="warn">${esc(c.t({ en: 'One bulb is out, so the only path is broken: both are dark. That is why old series fairy lights all go off together.', hi: 'एक बल्ब निकला है, इसलिए इकलौता रास्ता टूट गया: दोनों बुझे हैं। इसीलिए पुरानी श्रेणी वाली झालर की सारी बत्तियाँ एक साथ बुझ जाती हैं।' }))}</p>`;
      else if (!r.ser && !(c.S.in[0] && c.S.in[1])) out += `<p class="ok">${esc(c.t({ en: 'One bulb is out, but the other has its own path, so it stays lit. Houses are wired in parallel for this reason.', hi: 'एक बल्ब निकला है, पर दूसरे का अपना रास्ता है, इसलिए वह जलता रहता है। इसी कारण घरों की वायरिंग समांतर होती है।' }))}</p>`;
      else out += `<p>${esc(c.t(r.ser ? { en: 'Same current in both; the bigger resistance takes the bigger share of the voltage.', hi: 'दोनों में समान धारा; बड़ा प्रतिरोध वोल्टता का बड़ा हिस्सा लेता है।' } : { en: 'Same voltage on both; the smaller resistance takes the bigger current, so it glows brighter.', hi: 'दोनों पर समान वोल्टता; छोटा प्रतिरोध बड़ी धारा लेता है, इसलिए वह ज़्यादा चमकता है।' }))} ${esc(c.t({ en: 'Total current', hi: 'कुल धारा' }))} I = ${r.V} V / ${sig(r.Req)} Ω = ${fmtA(r.I)}.</p>`;
      return { reads, out };
    },
    sync(c) {
      const b = c.root.querySelector('button[data-key="switch"]'); if (b) { b.setAttribute('aria-pressed', String(c.S.on)); b.innerHTML = `<i class="sw"></i>${esc(c.t(U.switch))}: ${esc(c.t(c.S.on ? U.on : U.off))}`; }
      ['series', 'parallel'].forEach((k) => { const e = c.root.querySelector(`[data-key="${k}"]`); if (e) e.setAttribute('aria-pressed', String(c.S.arr === k)); });
    },
    act(c, key) {
      if (key === 'switch') { c.S.on = !c.S.on; c.draw(); }
      else if (key === 'series' || key === 'parallel') { if (c.S.arr !== key) { c.S.arr = key; c.draw(); c.api.emit(key); c.api.record(c.t(key === 'series' ? { en: 'Wired the bulbs in series', hi: 'बल्बों को श्रेणी में जोड़ा' } : { en: 'Wired the bulbs in parallel', hi: 'बल्बों को समांतर में जोड़ा' })); } }
      else if (key === 'part:bulb1' || key === 'part:bulb2') { const i = key === 'part:bulb1' ? 0 : 1; c.S.in[i] = !c.S.in[i]; c.draw(); c.api.emit(c.S.in[i] ? 'bulb:in' : 'bulb:out'); c.api.record(c.t(c.S.in[i] ? { en: 'Put the bulb back', hi: 'बल्ब वापस लगाया' } : { en: 'Unscrewed a bulb', hi: 'एक बल्ब निकाला' })); }
    },
    keys: () => ({ targets: ['switch', 'series', 'parallel', 'part:bulb1', 'part:bulb2', 'slider:r1', 'slider:r2'], events: ['closed', 'open', 'lit', 'reading:ammeter', 'series', 'parallel', 'bulb:out', 'bulb:in'] }),
  };

  // ================= RESISTIVITY: R = ρ l / A =================
  MODE.resistivity = {
    H: 300,
    init(c) { c.S.mat = PRESETS.resistivity[c.cfg.preset] || 'nichrome'; c.S.sl.length = 50; c.S.sl.area = 0.5; c.S.on = false; c.S.pts = []; c.S.E = 2; c.S.r0 = 1; },
    ctrls(c) {
      return `<div class="cc-chips">${RES_MATS.map((id) => chip('material:' + id, esc(c.t(MAT[id].name)), id === c.S.mat)).join('')}</div>
        <div class="cc-row">${switchChip(c, false)}<button type="button" class="cc-btn go" data-key="plot">${esc(c.t({ en: 'Note this reading', hi: 'यह पाठ्यांक लिखो' }))}</button></div>
        <div class="cc-sliders">${slider('slider:length', c.t({ en: 'Length', hi: 'लंबाई' }), 10, 100, 5, 50, '50 cm')}${slider('slider:area', c.t({ en: 'Thickness (area)', hi: 'मोटाई (क्षेत्रफल)' }), 0.1, 2, 0.1, 0.5, '0.5 mm²')}</div>`;
    },
    slideText: (c, k, v) => (k === 'length' ? v + ' cm' : v.toFixed(1) + ' mm²'),
    compute(c) {
      const m = MAT[c.S.mat], l = c.S.sl.length / 100, A = c.S.sl.area * 1e-6;
      const R = (m.rho * l) / A;
      const I = c.S.on ? c.S.E / (R + c.S.r0) : 0;
      return { closed: c.S.on, R, I, l, A, m, reads: { ammeter: fmtA(I), voltmeter: fmtV(I * R) } };
    },
    svg(c, r) {
      let g = `<rect width="640" height="300" fill="url(#ccboard)"/><rect width="640" height="300" fill="url(#ccgrid)" opacity=".8"/>`;
      const d = rectPath(60, 50, 520, 170);
      g += wire(d) + flow(d, r.I);
      g += place('battery', 130, 50, 0, { dir: 1 }) + text(130, 22, c.S.E + ' V', 'cc-h', 15, 'text-anchor="middle"');
      g += `<g transform="translate(320 50)">${ctl('switch', c.t(U.switch), `<rect x="-30" y="-26" width="60" height="52" fill="transparent"/>` + SYM.switch({ on: c.S.on }))}</g>`;
      g += place('meter', 500, 50, 0, { kind: 'A', val: r.reads.ammeter, needle: clamp(r.I / 2, 0, 1) });
      // The test wire: its drawn length and thickness follow the sliders.
      const len = 80 + c.S.sl.length * 3.4, th = 4 + Math.sqrt(c.S.sl.area) * 10, x0 = 320 - len / 2;
      g += `<rect x="${x0 - 12}" y="${220 - 12}" width="24" height="24" rx="4" fill="#64748B"/><rect x="${x0 + len - 12}" y="${220 - 12}" width="24" height="24" rx="4" fill="#64748B"/>`;
      g += `<rect x="${x0}" y="${220 - th / 2}" width="${len}" height="${th}" rx="${th / 2}" fill="${r.m.colour}" stroke="#3F3A33" stroke-width="1.5"/>`;
      g += text(320, 258, `${c.t(r.m.name)} · l = ${c.S.sl.length} cm · A = ${c.S.sl.area.toFixed(1)} mm²`, 'cc-lbl', 13, 'text-anchor="middle"');
      g += text(320, 282, `R = ${fmtR(r.R)}`, 'cc-h', 18, 'text-anchor="middle"');
      g += `<rect x="${x0}" y="220" width="${len}" height="0.1" fill="none"/>`;
      return g;
    },
    panel(c, r) {
      const reads = read(c.t(U.resistance), fmtR(r.R)) + read(c.t(U.ammeter), r.reads.ammeter);
      let out = `<div class="eq">R = ρ l / A = ${r.m.rho.toExponential(2).replace('e-', ' × 10⁻')} Ω·m × ${sig(r.l)} m / ${r.A.toExponential(1).replace('e-', ' × 10⁻')} m² = ${fmtR(r.R)}</div>
        <p>${esc(c.t({ en: 'Longer wire → more resistance. Thicker wire → less resistance. The material sets ρ (resistivity): nichrome is about 60 times copper, so heaters use nichrome and wires use copper.', hi: 'लंबा तार → ज़्यादा प्रतिरोध। मोटा तार → कम प्रतिरोध। पदार्थ ρ (प्रतिरोधकता) तय करता है: नाइक्रोम ताँबे से लगभग 60 गुना है, इसलिए हीटर में नाइक्रोम और तारों में ताँबा लगता है।' }))} ${esc(c.t({ en: 'The cell and meter add 1 Ω of their own.', hi: 'सेल और मीटर अपना 1 Ω जोड़ते हैं।' }))}</p>`;
      if (c.S.pts.length) out += `<table class="cc-table"><tr><th>${esc(c.t({ en: 'Material', hi: 'पदार्थ' }))}</th><th>l</th><th>A</th><th>R</th><th>I</th></tr>${c.S.pts.map((p) => `<tr><td>${esc(c.t(MAT[p.mat].name))}</td><td>${p.l} cm</td><td>${p.A.toFixed(1)} mm²</td><td>${fmtR(p.R)}</td><td>${fmtA(p.I)}</td></tr>`).join('')}</table>`;
      return { reads, out };
    },
    sync(c) {
      const b = c.root.querySelector('button[data-key="switch"]'); if (b) { b.setAttribute('aria-pressed', String(c.S.on)); b.innerHTML = `<i class="sw"></i>${esc(c.t(U.switch))}: ${esc(c.t(c.S.on ? U.on : U.off))}`; }
      c.root.querySelectorAll('[data-key^="material:"]').forEach((e) => e.setAttribute('aria-pressed', String(e.dataset.key === 'material:' + c.S.mat)));
    },
    act(c, key) {
      if (key === 'switch') { c.S.on = !c.S.on; c.draw(); }
      else if (key.startsWith('material:')) { c.S.mat = key.slice(9); c.draw(); c.api.emit('material:' + c.S.mat); c.api.record(c.t({ en: 'Chose ', hi: 'चुना: ' }) + c.t(MAT[c.S.mat].name)); }
      else if (key === 'plot') { const r = MODE.resistivity.compute(c); if (c.S.pts.length < 8) c.S.pts.push({ mat: c.S.mat, l: c.S.sl.length, A: c.S.sl.area, R: r.R, I: r.I }); c.draw(); c.api.emit('plotted'); }
    },
    keys: () => ({ targets: RES_MATS.map((m) => 'material:' + m).concat(['switch', 'slider:length', 'slider:area', 'plot']), events: ['closed', 'open', 'reading:ammeter', 'reading:voltmeter', 'plotted', 'material:*'] }),
  };

  // ================= POWER: P = VI, energy and the electricity bill =================
  const ICON = {
    light(on, w) { const g = on ? clamp(w / 100, 0.15, 1) : 0; return `<circle r="30" fill="url(#ccglow)" opacity="${g}" class="${g > 0.3 ? 'cc-glow' : ''}"/><circle r="13" fill="${on ? mixHex(GLASS, '#FFF2B0', g) : GLASS}" stroke="${WIRE}" stroke-width="2"/><rect x="-6" y="12" width="12" height="6" rx="2" fill="${WIRE}"/>`; },
    motor(on) { return `<g class="${on ? 'cc-spin' : ''}"><circle r="4" fill="${WIRE}"/>${[0, 120, 240].map((a) => `<path d="M0 0l6 -18 -12 0z" fill="${on ? '#0EA5E9' : '#94A3B8'}" transform="rotate(${a})"/>`).join('')}</g>`; },
    heat(on) { return `<rect x="-16" y="-12" width="32" height="24" rx="4" fill="#E2E8F0" stroke="${WIRE}" stroke-width="2"/>${[-8, 0, 8].map((y) => `<line x1="-11" y1="${y}" x2="11" y2="${y}" stroke="${on ? '#FF6B57' : '#94A3B8'}" stroke-width="3" stroke-linecap="round"/>`).join('')}`; },
    box(on) { return `<rect x="-16" y="-12" width="32" height="24" rx="4" fill="${on ? '#C7D2FE' : '#E2E8F0'}" stroke="${WIRE}" stroke-width="2"/><rect x="-12" y="-8" width="24" height="14" rx="2" fill="${on ? '#1D4ED8' : '#94A3B8'}"/>`; },
  };
  const POWER_DEFAULT = ['led', 'bulb', 'bulb100', 'fan', 'tv', 'heater'];
  MODE.power = {
    H: 320,
    init(c) { c.S.list = PRESETS.power[c.cfg.preset] || POWER_DEFAULT; c.S.app = {}; c.S.on = true; c.S.sl.hours = 5; c.S.sl.tariff = 7; },
    ctrls(c) {
      return `<div class="cc-row">${switchChip(c, true)}</div><div class="cc-chips">${c.S.list.map((id) => chip('appliance:' + id, `<i class="sw"></i>${esc(c.t(APPL[id].name))} · ${APPL[id].w} W`, false)).join('')}</div>
        <div class="cc-sliders">${slider('slider:hours', c.t({ en: 'Hours used per day', hi: 'रोज़ कितने घंटे' }), 1, 24, 1, 5, '5 h')}${slider('slider:tariff', c.t({ en: 'Price per unit', hi: 'प्रति यूनिट दाम' }), 3, 10, 0.5, 7, '₹ 7')}</div>`;
    },
    slideText: (c, k, v) => (k === 'hours' ? v + ' h' : '₹ ' + v),
    compute(c) {
      const on = c.S.list.filter((id) => c.S.on && c.S.app[id]);
      const P = on.reduce((s, id) => s + APPL[id].w, 0);
      const I = P / MAINS, kwh = (P * c.S.sl.hours) / 1000, cost = kwh * c.S.sl.tariff;
      return { closed: c.S.on && on.length > 0, lit: on.some((id) => APPL[id].kind === 'light'), on, P, I, kwh, cost, reads: { ammeter: fmtA(I) } };
    },
    svg(c, r) {
      let g = `<rect width="640" height="320" fill="url(#ccwall)"/>`;
      const n = c.S.list.length, x0 = 250, step = n > 1 ? (590 - x0) / (n - 1) : 0;
      const lastOn = Math.max(-1, ...c.S.list.map((id, i) => (c.S.app[id] && c.S.on ? i : -1)));
      g += `<rect x="30" y="40" width="70" height="60" rx="10" fill="#1E293B"/>` + text(65, 65, '220 V', 'cc-h', 15, 'text-anchor="middle" fill="#FFD23F"') + text(65, 86, c.t({ en: 'supply', hi: 'सप्लाई' }), 'cc-lbl', 11, 'text-anchor="middle" fill="#CBD5E1"');
      g += wire('M100 70H600') + wire('M100 250H600') + wire('M100 70V250');
      if (lastOn >= 0 && r.I > 0) g += flow(`M100 250V70H${x0 + lastOn * step}`, Math.min(r.I, 2)) + flow(`M${x0 + lastOn * step} 250H100`, Math.min(r.I, 2));
      g += `<g transform="translate(150 70)">${ctl('switch', c.t({ en: 'Main switch', hi: 'मुख्य स्विच' }), `<rect x="-30" y="-26" width="60" height="52" fill="transparent"/>` + SYM.switch({ on: c.S.on }))}</g>`;
      g += place('meter', 210, 250, 180, { kind: 'A', val: r.reads.ammeter, needle: clamp(r.I / 10, 0, 1) });
      c.S.list.forEach((id, i) => {
        const a = APPL[id], x = x0 + i * step, on = c.S.on && !!c.S.app[id];
        const inner = `<rect x="-30" y="-120" width="60" height="240" fill="transparent"/>` +
          `<line x1="0" y1="-90" x2="0" y2="-32" ${W}/><line x1="0" y1="32" x2="0" y2="90" ${W}/>` + (on ? flow(`M0 -90V-32`, a.w / MAINS) + flow(`M0 32V90`, a.w / MAINS) : '') +
          `<g transform="translate(0 -62) rotate(90)">${SYM.switch({ on })}</g>` +
          `<rect x="-26" y="-30" width="52" height="60" rx="10" fill="${on ? '#FFFFFF' : '#F1F5F9'}" stroke="${on ? '#0F766E' : '#94A3B8'}" stroke-width="2"/>` +
          `<g transform="translate(0 -4)">${ICON[a.kind](on, a.w)}</g>` + text(0, 22, a.w + ' W', 'cc-h', 11, 'text-anchor="middle"') +
          text(0, 108, c.t(a.short || a.name), 'cc-lbl', 11, 'text-anchor="middle"');
        g += `<g transform="translate(${x} 160)">${ctl('appliance:' + id, c.t(a.name), inner, on)}</g>`;
      });
      g += text(320, 300, c.t({ en: 'Every appliance is in parallel across 220 V. Tap one to switch it on or off.', hi: 'हर उपकरण 220 V पर समांतर में है। चालू या बंद करने के लिए किसी एक पर टैप करो।' }), 'cc-lbl', 12, 'text-anchor="middle"');
      return g;
    },
    panel(c, r) {
      const reads = read(c.t({ en: 'Total power', hi: 'कुल शक्ति' }), r.P + ' W') + read(c.t(U.current), r.reads.ammeter) + read(c.t({ en: 'Per day', hi: 'रोज़' }), sig(r.kwh, 3) + ' kWh') + read(c.t({ en: 'Per month', hi: 'महीने का' }), '₹ ' + Math.round(r.cost * 30));
      const out = `<div class="eq">I = P / V = ${r.P} W / 220 V = ${fmtA(r.I)}</div><div class="eq">E = P × t = ${r.P} W × ${c.S.sl.hours} h = ${sig(r.kwh, 3)} kWh (${esc(c.t({ en: 'units', hi: 'यूनिट' }))})</div>
        <p>${esc(c.t({ en: '1 unit = 1 kilowatt-hour = 1000 W for 1 hour. The bill counts units × price. A 1500 W heater for one hour costs as much as a 9 W LED for 167 hours.', hi: '1 यूनिट = 1 किलोवाट-घंटा = 1000 W एक घंटे तक। बिल में यूनिट × दाम गिना जाता है। 1500 W का हीटर एक घंटे में उतना खर्च करता है जितना 9 W की LED 167 घंटों में।' }))}</p>`;
      return { reads, out };
    },
    sync(c) {
      const b = c.root.querySelector('button[data-key="switch"]'); if (b) { b.setAttribute('aria-pressed', String(c.S.on)); b.innerHTML = `<i class="sw"></i>${esc(c.t({ en: 'Main switch', hi: 'मुख्य स्विच' }))}: ${esc(c.t(c.S.on ? U.on : U.off))}`; }
      c.root.querySelectorAll('button[data-key^="appliance:"]').forEach((e) => e.setAttribute('aria-pressed', String(!!c.S.app[e.dataset.key.slice(10)])));
    },
    act(c, key) {
      if (key === 'switch') { c.S.on = !c.S.on; c.draw(); }
      else if (key.startsWith('appliance:')) { const id = key.slice(10); if (!APPL[id]) return; c.S.app[id] = !c.S.app[id]; c.draw(); c.api.emit('appliance:' + id + (c.S.app[id] ? ':on' : ':off')); c.api.record(c.t(APPL[id].name) + ' ' + c.t(c.S.app[id] ? U.on : U.off)); }
    },
    keys(cfg) { const list = PRESETS.power[cfg.preset] || POWER_DEFAULT; return { targets: ['switch', 'slider:hours', 'slider:tariff'].concat(list.map((id) => 'appliance:' + id)), events: ['closed', 'open', 'lit', 'reading:ammeter', 'appliance:*'] }; },
  };

  // ================= HOUSE: meter, main switch, MCB or fuse, live–neutral–earth =================
  const HOUSE_APPS = ['bulb', 'fan', 'tv', 'geyser', 'heater'];
  const RATINGS = [6, 10, 16, 20, 25, 32];
  MODE.house = {
    H: 360,
    init(c) { c.S.guard = PRESETS.house[c.cfg.preset] || 'mcb'; c.S.on = true; c.S.app = {}; c.S.tripped = false; c.S.fault = false; c.S.sl.mcb = 3; },
    ctrls(c) {
      const fuse = c.S.guard === 'fuse';
      return `<div class="cc-row">${switchChip(c, true)}${chip('fault:short', `⚡ ${esc(c.t({ en: 'Short-circuit fault', hi: 'शॉर्ट सर्किट दोष' }))}`, false, '', 'danger')}<button type="button" class="cc-chip danger" data-key="fault:overload">${esc(c.t({ en: 'Switch everything on', hi: 'सब कुछ चालू करो' }))}</button></div>
        <div class="cc-chips">${HOUSE_APPS.map((id) => chip('appliance:' + id, `<i class="sw"></i>${esc(c.t(APPL[id].name))} · ${APPL[id].w} W`, false)).join('')}</div>
        <div class="cc-sliders">${slider('slider:mcb', c.t(fuse ? { en: 'Fuse rating', hi: 'फ़्यूज़ की रेटिंग' } : { en: 'MCB rating', hi: 'MCB की रेटिंग' }), 0, RATINGS.length - 1, 1, 3, RATINGS[3] + ' A')}</div>`;
    },
    slideText: (c, k, v) => RATINGS[v] + ' A',
    compute(c) {
      const S = c.S, rating = RATINGS[S.sl.mcb], fuse = S.guard === 'fuse';
      const live = S.on && !S.tripped;
      const on = HOUSE_APPS.filter((id) => live && S.app[id]);
      let I = on.reduce((s, id) => s + APPL[id].w, 0) / MAINS;
      if (live && S.fault) I = 2000;
      if (live && I > rating) {
        S.tripped = true; S.tripWhy = S.fault ? 'short' : 'overload';
        c.api.emit(fuse ? 'fused' : 'tripped');
        c.api.record(c.t(fuse ? { en: 'The fuse melted', hi: 'फ़्यूज़ पिघल गया' } : { en: 'The MCB tripped', hi: 'MCB ट्रिप हो गया' }));
        return MODE.house.compute(c);
      }
      return { closed: live && on.length > 0, lit: on.includes('bulb'), on, I, rating, fuse, live, reads: { ammeter: fmtA(I) } };
    },
    svg(c, r) {
      const S = c.S;
      let g = `<rect width="640" height="360" fill="url(#ccwall)"/>`;
      // Pole and service wires → meter → main switch → MCB/fuse → house wiring.
      g += `<rect x="24" y="30" width="10" height="300" fill="#8B5E1A"/><rect x="14" y="30" width="30" height="8" fill="#8B5E1A"/>`;
      g += `<rect x="60" y="60" width="70" height="70" rx="8" fill="#1E293B"/>` + text(95, 86, 'kWh', 'cc-h', 14, 'text-anchor="middle" fill="#5EE0C9"') + text(95, 108, c.t({ en: 'meter', hi: 'मीटर' }), 'cc-lbl', 11, 'text-anchor="middle" fill="#CBD5E1"');
      const L = '#DC2626', N = '#1E293B', E = '#16A34A';
      const liveD = 'M130 80H610', neuD = 'M130 110H160V250H610', earthD = 'M160 300H610';
      g += `<path d="M34 50C50 60 50 70 60 80" stroke="${L}" stroke-width="3.5" fill="none"/><path d="M34 60C50 90 50 100 60 110" stroke="${N}" stroke-width="3.5" fill="none"/>`;
      g += `<path d="${liveD}" stroke="${L}" stroke-width="3.5" fill="none" ${r.live && r.I > 0 ? 'class="' + (S.fault ? 'cc-hot' : '') + '"' : ''}/><path d="${neuD}" stroke="${N}" stroke-width="3.5" fill="none"/><path d="${earthD}" stroke="${E}" stroke-width="3.5" fill="none"/>`;
      g += `<path d="M160 300v14m-10 0h20m-16 7h12m-8 7h4" stroke="${E}" stroke-width="3" fill="none" stroke-linecap="round"/>` + text(190, 326, c.t({ en: 'earth (green)', hi: 'भूसंपर्क (हरा)' }), 'cc-lbl', 11, `fill="${E}"`);
      g += text(615, 76, 'L', 'cc-h', 12, `fill="${L}"`) + text(615, 254, 'N', 'cc-h', 12, `fill="${N}"`) + text(615, 304, 'E', 'cc-h', 12, `fill="${E}"`);
      if (r.live && r.I > 0 && !S.fault) g += flow('M130 80H560', Math.min(r.I, 3)) + flow('M560 250H160V110', Math.min(r.I, 3));
      // Main switch and MCB / fuse.
      g += `<g transform="translate(200 80)">${ctl('switch', c.t({ en: 'Main switch', hi: 'मुख्य स्विच' }), `<rect x="-30" y="-26" width="60" height="52" fill="transparent"/>` + SYM.switch({ on: S.on }))}</g>`;
      const trip = S.tripped;
      const guard = r.fuse
        ? patch(50, 40) + SYM.fuse({ blown: trip }) + text(0, -22, c.t({ en: 'fuse', hi: 'फ़्यूज़' }) + ' ' + r.rating + ' A', 'cc-lbl', 11, 'text-anchor="middle"')
        : patch(50, 60) + lead(-36, -18) + lead(18, 36) + `<rect x="-18" y="-24" width="36" height="48" rx="6" fill="${trip ? '#FEE2E2' : '#E2E8F0'}" stroke="${trip ? '#B42318' : '#475569'}" stroke-width="2"/><rect x="-6" y="${trip ? 2 : -18}" width="12" height="16" rx="3" fill="${trip ? '#B42318' : '#0F766E'}" style="transition: y .3s"/>` + text(0, -30, 'MCB ' + r.rating + ' A', 'cc-lbl', 11, 'text-anchor="middle"') + text(0, 36, c.t(trip ? { en: 'TRIPPED · tap to reset', hi: 'ट्रिप · रीसेट के लिए टैप' } : U.on), 'cc-lbl', 10, `text-anchor="middle" fill="${trip ? '#B42318' : '#0F766E'}"`);
      g += `<g transform="translate(290 80)">${ctl('part:mcb', c.t(r.fuse ? { en: 'Fuse', hi: 'फ़्यूज़' } : { en: 'MCB', hi: 'MCB' }), `<rect x="-36" y="-40" width="72" height="80" fill="transparent"/>` + guard)}</g>`;
      // Appliances in parallel between L and N; metal-bodied ones also on E.
      HOUSE_APPS.forEach((id, i) => {
        const a = APPL[id], x = 370 + i * 58, on = r.on.includes(id), metal = a.kind === 'heat';
        const inner = `<rect x="-28" y="-80" width="56" height="200" fill="transparent"/>` +
          `<line x1="0" y1="-80" x2="0" y2="-30" stroke="${L}" stroke-width="3"/><line x1="0" y1="30" x2="0" y2="90" stroke="${N}" stroke-width="3"/>` + (metal ? `<line x1="12" y1="30" x2="12" y2="140" stroke="${E}" stroke-width="3"/>` : '') +
          (on ? flow('M0 -80V-30', a.w / MAINS) + flow('M0 30V90', a.w / MAINS) : '') +
          `<g transform="translate(0 -56) rotate(90)">${SYM.switch({ on: !!S.app[id] })}</g>` +
          `<rect x="-24" y="-30" width="48" height="60" rx="8" fill="${on ? '#FFFFFF' : '#F1F5F9'}" stroke="${on ? '#0F766E' : '#94A3B8'}" stroke-width="2"/><g transform="translate(0 -4)">${ICON[a.kind](on, a.w)}</g>` + text(0, 22, a.w + ' W', 'cc-h', 10, 'text-anchor="middle"') + text(0, 112, c.t(a.short || a.name), 'cc-lbl', 11, 'text-anchor="middle"');
        g += `<g transform="translate(${x} 160)">${ctl('appliance:' + id, c.t(a.name), inner, !!S.app[id])}</g>`;
      });
      if (S.fault) g += `<g><path d="M330 80V250" stroke="#B42318" stroke-width="4" stroke-dasharray="6 4"/><path d="M322 150l10-14 -4 10 10-2 -12 16 3-10z" fill="#FFD23F" stroke="#B42318"/>` + text(338, 166, c.t({ en: 'fault: L touches N', hi: 'दोष: L और N छू रहे' }), 'cc-lbl', 11, 'fill="#B42318"') + '</g>';
      return g;
    },
    panel(c, r) {
      const S = c.S;
      const reads = read(c.t(U.current), r.reads.ammeter) + read(c.t(r.fuse ? { en: 'Fuse', hi: 'फ़्यूज़' } : { en: 'MCB', hi: 'MCB' }), r.rating + ' A');
      let out;
      if (S.tripped) out = `<p class="warn">${esc(c.t(S.tripWhy === 'short' ? (r.fuse ? { en: 'Short circuit: live touched neutral, a huge current flowed and the fuse wire melted in a flash. Fix the fault, then fit a new fuse.', hi: 'शॉर्ट सर्किट: लाइव तार न्यूट्रल से छू गया, बहुत बड़ी धारा बही और फ़्यूज़ का तार पल भर में पिघल गया। पहले दोष ठीक करो, फिर नया फ़्यूज़ लगाओ।' } : { en: 'Short circuit: live touched neutral, a huge current flowed and the MCB tripped in a flash. Fix the fault, then reset it.', hi: 'शॉर्ट सर्किट: लाइव तार न्यूट्रल से छू गया, बहुत बड़ी धारा बही और MCB पल भर में ट्रिप हो गया। पहले दोष ठीक करो, फिर रीसेट करो।' }) : { en: `Overload: too many appliances drew more than ${r.rating} A, so the ${r.fuse ? 'fuse melted' : 'MCB tripped'} before the wires could overheat.`, hi: `ओवरलोड: बहुत से उपकरणों ने ${r.rating} A से ज़्यादा धारा खींची, इसलिए तार गर्म होने से पहले ${r.fuse ? 'फ़्यूज़ पिघल गया' : 'MCB ट्रिप हो गया'}।` }))}</p>`;
      else if (!S.on) out = `<p>${esc(c.t({ en: 'Main switch off: the whole house is disconnected from the live wire.', hi: 'मुख्य स्विच बंद: पूरा घर लाइव तार से अलग है।' }))}</p>`;
      else out = `<div class="eq">I = ${r.on.reduce((s, id) => s + APPL[id].w, 0)} W / 220 V = ${fmtA(r.I)} ${r.I > 0.8 * r.rating ? '⚠' : ''}</div><p>${esc(c.t({ en: 'Live (red) brings the current, neutral (black) takes it back, earth (green) is a safety path from metal bodies to the ground. The MCB cuts off when the current goes above its rating.', hi: 'लाइव (लाल) धारा लाता है, न्यूट्रल (काला) उसे वापस ले जाता है, भूसंपर्क (हरा) धातु के ढाँचों से ज़मीन तक सुरक्षा का रास्ता है। धारा रेटिंग से ऊपर जाते ही MCB काट देता है।' }))}</p>`;
      return { reads, out };
    },
    sync(c) {
      const b = c.root.querySelector('button[data-key="switch"]'); if (b) { b.setAttribute('aria-pressed', String(c.S.on)); b.innerHTML = `<i class="sw"></i>${esc(c.t({ en: 'Main switch', hi: 'मुख्य स्विच' }))}: ${esc(c.t(c.S.on ? U.on : U.off))}`; }
      c.root.querySelectorAll('button[data-key^="appliance:"]').forEach((e) => e.setAttribute('aria-pressed', String(!!c.S.app[e.dataset.key.slice(10)])));
      const f = c.root.querySelector('button[data-key="fault:short"]'); if (f) f.setAttribute('aria-pressed', String(c.S.fault));
    },
    act(c, key) {
      const S = c.S;
      if (key === 'switch') { S.on = !S.on; c.draw(); }
      else if (key.startsWith('appliance:')) { const id = key.slice(10); if (!APPL[id]) return; S.app[id] = !S.app[id]; c.draw(); c.api.emit('appliance:' + id + (S.app[id] ? ':on' : ':off')); }
      else if (key === 'fault:short') { S.fault = !S.fault; c.draw(); c.api.record(c.t(S.fault ? { en: 'Made a short-circuit fault', hi: 'शॉर्ट सर्किट दोष बनाया' } : { en: 'Fixed the fault', hi: 'दोष ठीक किया' })); }
      else if (key === 'fault:overload') { HOUSE_APPS.forEach((id) => (S.app[id] = true)); c.draw(); c.api.emit('overload'); }
      else if (key === 'part:mcb') {
        if (!S.tripped) { c.api.toast(c.t(S.guard === 'fuse' ? { en: 'The fuse is fine.', hi: 'फ़्यूज़ ठीक है।' } : { en: 'The MCB is on.', hi: 'MCB चालू है।' })); return; }
        if (S.fault) { c.api.toast(c.t({ en: 'Fix the fault first, or it will trip again at once.', hi: 'पहले दोष ठीक करो, वरना यह तुरंत फिर ट्रिप होगा।' })); return; }
        S.tripped = false; c.draw(); c.api.emit('reset');
      }
    },
    keys: () => ({ targets: ['switch', 'part:mcb', 'fault:short', 'fault:overload', 'slider:mcb'].concat(HOUSE_APPS.map((id) => 'appliance:' + id)), events: ['closed', 'open', 'lit', 'reading:ammeter', 'tripped', 'fused', 'overload', 'reset', 'appliance:*'] }),
  };

  // ================= CONDUCTORS: a tester with a gap =================
  const COND_SETS = {
    solids: ['copper', 'iron', 'aluminium', 'steelkey', 'coin', 'graphite', 'plastic', 'rubber', 'wood', 'glass', 'paper', 'eraser', 'cloth'],
    liquids: ['saltwater', 'lemon', 'vinegar', 'tapwater', 'distilled', 'sugarwater', 'oil'],
    all: ['copper', 'iron', 'coin', 'graphite', 'steelkey', 'plastic', 'rubber', 'wood', 'glass', 'paper', 'eraser', 'saltwater', 'lemon', 'vinegar', 'tapwater', 'distilled', 'sugarwater', 'oil', 'air'],
  };
  MODE.conductors = {
    H: 300,
    init(c) { c.S.set = COND_SETS[PRESETS.conductors[c.cfg.preset] || 'solids']; c.S.mat = null; c.S.on = true; },
    ctrls(c) {
      return `<div class="cc-row">${switchChip(c, true)}</div><div class="cc-chips" aria-label="${esc(c.t({ en: 'Things to test', hi: 'जाँचने की चीज़ें' }))}">${c.S.set.map((id) => chip('material:' + id, `<i class="sw" style="background:${MAT[id].colour}"></i>${esc(c.t(MAT[id].name))}`, false)).join('')}</div>`;
    },
    compute(c) {
      const m = c.S.mat ? MAT[c.S.mat] : null;
      const cond = m ? m.cond : 'no';
      const closed = c.S.on && !!m && cond !== 'no';
      const glow = closed ? (cond === 'yes' ? 1 : 0.3) : 0;
      return { closed, lit: glow > 0.05, m, cond, glow, I: closed ? (cond === 'yes' ? 0.3 : 0.05) : 0 };
    },
    svg(c, r) {
      let g = `<rect width="640" height="300" fill="url(#ccboard)"/><rect width="640" height="300" fill="url(#ccgrid)" opacity=".8"/>`;
      const d = rectPath(80, 60, 480, 160);
      g += wire(d) + flow(d, r.I);
      g += place('cell', 170, 60, 0, { dir: 1 }) + place('bulb', 470, 60, 0, { glow: r.glow });
      g += `<g transform="translate(320 60)">${ctl('switch', c.t(U.switch), `<rect x="-30" y="-26" width="60" height="52" fill="transparent"/>` + SYM.switch({ on: c.S.on }))}</g>`;
      // The gap with two clips; the thing under test sits between them.
      g += patch(0, 0) + `<rect x="250" y="206" width="140" height="28" fill="${BG}"/>`;
      g += `<path d="M250 220l-14-8v16z" fill="#64748B"/><path d="M390 220l14-8v16z" fill="#64748B"/>`;
      if (r.m) {
        const liquid = r.m.group === 'liquid';
        g += liquid
          ? `<path d="M280 196v44a6 6 0 0 0 6 6h68a6 6 0 0 0 6-6v-44" fill="none" stroke="#7F93B2" stroke-width="2.5"/><rect x="282" y="214" width="76" height="30" rx="4" fill="${r.m.colour}" opacity=".9"/><line x1="250" y1="220" x2="292" y2="236" ${W}/><line x1="390" y1="220" x2="348" y2="236" ${W}/>`
          : `<rect x="252" y="210" width="136" height="20" rx="8" fill="${r.m.colour}" stroke="#475569" stroke-width="1.5"/>`;
        g += text(320, 270, c.t(r.m.name), 'cc-t', 14, 'text-anchor="middle"');
      } else g += `<rect x="252" y="210" width="136" height="20" rx="8" class="cc-slot"/>` + text(320, 270, c.t({ en: 'Pick something to put between the clips', hi: 'क्लिपों के बीच रखने के लिए कुछ चुनो' }), 'cc-lbl', 13, 'text-anchor="middle"');
      return g;
    },
    panel(c, r) {
      let out;
      if (!r.m) out = `<p>${esc(c.t({ en: 'If the bulb glows, the thing lets current pass: it is a conductor. If not, it is an insulator.', hi: 'अगर बल्ब जलता है, तो वह चीज़ धारा को जाने देती है: वह चालक है। नहीं तो वह कुचालक है।' }))}</p>`;
      else if (!c.S.on) out = `<p>${esc(c.t(U.open))}</p>`;
      else if (r.cond === 'yes') out = `<p class="ok">${esc(c.t(r.m.name))}: ${esc(c.t({ en: 'the bulb glows brightly. It is a conductor: metals and graphite let current pass easily.', hi: 'बल्ब तेज़ जलता है। यह चालक है: धातुएँ और ग्रेफ़ाइट धारा को आसानी से जाने देते हैं।' }))}</p>`;
      else if (r.cond === 'weak') out = `<p class="ok">${esc(c.t(r.m.name))}: ${esc(c.t({ en: 'the bulb glows faintly. Liquids with salts or acids dissolved in them conduct, but weakly; a tester with an LED or a magnetic needle shows it clearly.', hi: 'बल्ब हल्का जलता है। जिन द्रवों में नमक या अम्ल घुला हो वे चालक हैं, पर कमज़ोर; LED या चुंबकीय सुई वाला परीक्षक इसे साफ़ दिखाता है।' }))}</p>`;
      else out = `<p class="warn">${esc(c.t(r.m.name))}: ${esc(c.t({ en: 'no glow. It is an insulator: it does not let current pass. That is why wires have a plastic cover.', hi: 'बल्ब नहीं जला। यह कुचालक है: यह धारा को नहीं जाने देता। इसीलिए तारों पर प्लास्टिक का खोल होता है।' }))}</p>`;
      return { reads: '', out };
    },
    sync(c) {
      const b = c.root.querySelector('button[data-key="switch"]'); if (b) { b.setAttribute('aria-pressed', String(c.S.on)); b.innerHTML = `<i class="sw"></i>${esc(c.t(U.switch))}: ${esc(c.t(c.S.on ? U.on : U.off))}`; }
      c.root.querySelectorAll('button[data-key^="material:"]').forEach((e) => e.setAttribute('aria-pressed', String(e.dataset.key === 'material:' + c.S.mat)));
    },
    act(c, key) {
      if (key === 'switch') c.S.on = !c.S.on;
      else if (key.startsWith('material:')) { const id = key.slice(9); if (!MAT[id]) return; c.S.mat = c.S.mat === id ? null : id; if (c.S.mat) c.api.speak(c.t(MAT[id].name)); }
      else return;
      c.draw();
      if (c.S.on && c.S.mat) { const v = MAT[c.S.mat].cond === 'no' ? 'insulates' : 'conducts'; c.api.emit(v); c.api.record(c.t(MAT[c.S.mat].name) + ': ' + c.t(v === 'conducts' ? { en: 'conducts', hi: 'चालक' } : { en: 'insulates', hi: 'कुचालक' })); }
    },
    keys(cfg) { const set = COND_SETS[PRESETS.conductors[cfg.preset] || 'solids']; return { targets: ['switch'].concat(set.map((id) => 'material:' + id)), events: ['closed', 'open', 'lit', 'conducts', 'insulates'] }; },
  };

  // ================= KIRCHHOFF: two loops, one junction =================
  MODE.kirchhoff = {
    H: 320,
    init(c) { Object.assign(c.S.sl, { e1: 6, e2: 3, r1: 2, r2: 4, r3: 6 }); c.S.on = true; },
    ctrls(c) {
      const s = c.S.sl;
      return `<div class="cc-row">${switchChip(c, true)}</div><div class="cc-sliders">${slider('slider:e1', 'E₁', 0, 12, 1, s.e1, s.e1 + ' V')}${slider('slider:e2', 'E₂', 0, 12, 1, s.e2, s.e2 + ' V')}${slider('slider:r1', 'R₁', 1, 20, 1, s.r1, s.r1 + ' Ω')}${slider('slider:r2', 'R₂', 1, 20, 1, s.r2, s.r2 + ' Ω')}${slider('slider:r3', 'R₃', 1, 20, 1, s.r3, s.r3 + ' Ω')}</div>`;
    },
    slideText: (c, k, v) => v + (k[0] === 'e' ? ' V' : ' Ω'),
    compute(c) {
      const { e1, e2, r1, r2, r3 } = c.S.sl;
      let V = 0, I1 = 0, I2 = 0, I3 = 0;
      if (c.S.on) { V = (e1 / r1 + e2 / r2) / (1 / r1 + 1 / r2 + 1 / r3); I1 = (e1 - V) / r1; I2 = (e2 - V) / r2; I3 = V / r3; }
      return { closed: c.S.on, V, I1, I2, I3, reads: { ammeter: fmtA(I3), voltmeter: fmtV(V) } };
    },
    svg(c, r) {
      const s = c.S.sl;
      let g = `<rect width="640" height="320" fill="url(#ccboard)"/><rect width="640" height="320" fill="url(#ccgrid)" opacity=".8"/>`;
      g += wire('M120 60H520') + wire('M120 260H520') + wire('M120 60V260') + wire('M320 60V260') + wire('M520 60V260');
      g += flow('M120 260V60H320', r.I1) + flow('M320 260H120', r.I1) + flow('M520 260V60H320', r.I2) + flow('M320 260H520', r.I2) + flow('M320 60V260', r.I3);
      g += `<circle cx="320" cy="60" r="5" fill="${WIRE}"/><circle cx="320" cy="260" r="5" fill="${WIRE}"/>` + text(332, 52, 'P', 'cc-h', 14) + text(332, 280, 'Q', 'cc-h', 14);
      g += place('battery', 120, 205, 270, { dir: 1 }) + place('resistor', 120, 115, 270, {}) + text(98, 120, 'R₁ ' + s.r1 + ' Ω', 'cc-lbl', 13, 'text-anchor="end"');
      g += place('battery', 520, 205, 270, { dir: 1 }) + place('resistor', 520, 115, 270, {}) + text(542, 120, 'R₂ ' + s.r2 + ' Ω', 'cc-lbl', 13);
      g += place('resistor', 320, 160, 90, {}) + text(298, 150, 'R₃ ' + s.r3 + ' Ω', 'cc-lbl', 13, 'text-anchor="end"');
      g += `<g transform="translate(220 60)">${ctl('switch', c.t(U.switch), `<rect x="-30" y="-26" width="60" height="52" fill="transparent"/>` + SYM.switch({ on: c.S.on }))}</g>`;
      g += text(60, 210, 'E₁ ' + s.e1 + ' V', 'cc-h', 13, 'text-anchor="middle"') + text(580, 210, 'E₂ ' + s.e2 + ' V', 'cc-h', 13, 'text-anchor="middle"');
      const arrow = (x, y, upd, I, lbl) => `<path d="M${x} ${y}v${upd * 26}l-5 ${-upd * 7}m5 ${upd * 7}l5 ${-upd * 7}" stroke="${I < 0 ? '#B42318' : '#0F766E'}" stroke-width="3" fill="none" stroke-linecap="round" transform="${I < 0 ? `rotate(180 ${x} ${y + upd * 13})` : ''}"/>` + text(x + 10, y + upd * 13 + 5, `${lbl} = ${fmtA(I)}`, 'cc-val', 13);
      g += arrow(140, 185, -1, r.I1, 'I₁') + arrow(540, 185, -1, r.I2, 'I₂') + arrow(340, 200, 1, r.I3, 'I₃');
      g += text(420, 160, 'V(P) = ' + fmtV(r.V), 'cc-val', 13, 'text-anchor="middle"');
      g += text(320, 300, c.t({ en: 'At junction P: current in = current out. Around each loop: the voltages add up to zero.', hi: 'संधि P पर: आने वाली धारा = जाने वाली धारा। हर लूप में: वोल्टताओं का योग शून्य।' }), 'cc-lbl', 12, 'text-anchor="middle"');
      return g;
    },
    panel(c, r) {
      const s = c.S.sl;
      const reads = read('I₁', fmtA(r.I1)) + read('I₂', fmtA(r.I2)) + read('I₃', fmtA(r.I3));
      const out = c.S.on ? `<div class="eq">${esc(c.t({ en: 'Junction rule', hi: 'संधि नियम' }))}: I₁ + I₂ = I₃ → ${sig(r.I1)} + ${sig(r.I2)} = ${sig(r.I3)} A</div>
        <div class="eq">${esc(c.t({ en: 'Loop rule (left)', hi: 'लूप नियम (बायाँ)' }))}: E₁ − I₁R₁ − I₃R₃ = ${s.e1} − ${sig(r.I1 * s.r1)} − ${sig(r.I3 * s.r3)} = ${sig(s.e1 - r.I1 * s.r1 - r.I3 * s.r3, 2)}</div>
        <p>${esc(c.t({ en: 'A negative current means it really flows the other way: a weaker cell can be charged by a stronger one.', hi: 'ऋणात्मक धारा का मतलब है कि वह असल में उल्टी दिशा में बहती है: कमज़ोर सेल को मज़बूत सेल चार्ज कर सकता है।' }))}</p>` : `<p>${esc(c.t(U.open))}</p>`;
      return { reads, out };
    },
    sync(c) { const b = c.root.querySelector('button[data-key="switch"]'); if (b) { b.setAttribute('aria-pressed', String(c.S.on)); b.innerHTML = `<i class="sw"></i>${esc(c.t(U.switch))}: ${esc(c.t(c.S.on ? U.on : U.off))}`; } },
    act(c, key) { if (key === 'switch') { c.S.on = !c.S.on; c.draw(); } },
    keys: () => ({ targets: ['switch', 'slider:e1', 'slider:e2', 'slider:r1', 'slider:r2', 'slider:r3'], events: ['closed', 'open', 'reading:ammeter', 'reading:voltmeter'] }),
  };

  // ================= WHEATSTONE: balance the bridge =================
  MODE.wheatstone = {
    H: 360,
    init(c) { Object.assign(c.S.sl, { p: 10, q: 20, r: 10, s: PRESETS.wheatstone[c.cfg.preset] === 'unbalanced' ? 30 : 20 }); c.S.on = true; c.S.E = 2; c.S.Rg = 50; },
    ctrls(c) {
      const s = c.S.sl;
      return `<div class="cc-row">${switchChip(c, true)}</div><div class="cc-sliders">${slider('slider:p', 'P', 1, 100, 1, s.p, s.p + ' Ω')}${slider('slider:q', 'Q', 1, 100, 1, s.q, s.q + ' Ω')}${slider('slider:r', 'R', 1, 100, 1, s.r, s.r + ' Ω')}${slider('slider:s', 'S', 1, 100, 1, s.s, s.s + ' Ω')}</div>`;
    },
    slideText: (c, k, v) => v + ' Ω',
    compute(c) {
      const { p, q, r, s } = c.S.sl, E = c.S.on ? c.S.E : 0, Rg = c.S.Rg;
      const a11 = 1 / p + 1 / q + 1 / Rg, a12 = -1 / Rg, a21 = -1 / Rg, a22 = 1 / r + 1 / s + 1 / Rg, b1 = E / p, b2 = E / r;
      const det = a11 * a22 - a12 * a21;
      const Vb = (b1 * a22 - a12 * b2) / det, Vd = (a11 * b2 - a21 * b1) / det;
      const Ig = (Vb - Vd) / Rg;
      const balanced = p * s === q * r;
      if (c.S.on && balanced && !c.S.wasBal) c.api.emit('balanced');
      c.S.wasBal = c.S.on && balanced;
      return { closed: c.S.on, Vb, Vd, Ig, balanced, Ip: (E - Vb) / p, Iq: Vb / q, Ir: (E - Vd) / r, Is: Vd / s, reads: { ammeter: c.S.on ? fmtA(Ig) : '0 A' } };
    },
    svg(c, r) {
      const s = c.S.sl;
      let g = `<rect width="640" height="360" fill="url(#ccboard)"/><rect width="640" height="360" fill="url(#ccgrid)" opacity=".8"/>`;
      const A = [80, 160], B = [320, 50], C = [560, 160], D = [320, 270];
      const seg = (a, b) => `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`;
      g += wire(seg(A, B)) + wire(seg(B, C)) + wire(seg(A, D)) + wire(seg(D, C)) + wire(seg(B, D)) + wire('M80 160V320H560V160');
      g += flow(seg(A, B), r.Ip) + flow(seg(B, C), r.Iq) + flow(seg(A, D), r.Ir) + flow(seg(D, C), r.Is) + flow(seg(B, D), r.Ig) + flow('M560 160V320H80V160', r.Ip + r.Ir);
      const ang = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      [[A, B, 'P', s.p], [B, C, 'Q', s.q], [A, D, 'R', s.r], [D, C, 'S', s.s]].forEach(([a, b, n, v]) => { const m = mid(a, b); g += place('resistor', m[0], m[1], ang(a, b), { label: `${n} = ${v} Ω` }); });
      g += place('meter', 320, 160, 90, { kind: 'G', needle: clamp(r.Ig / 0.01, -1, 1) });
      g += `<rect x="348" y="146" width="78" height="22" rx="6" fill="#0B1226"/>` + text(387, 162, r.reads.ammeter, 'cc-val', 13, 'text-anchor="middle" fill="#5EE0C9"');
      g += place('battery', 320, 320, 0, { dir: -1 }) + text(320, 350, c.S.E + ' V', 'cc-h', 13, 'text-anchor="middle"');
      g += `<g transform="translate(160 320)">${ctl('switch', c.t(U.switch), `<rect x="-30" y="-26" width="60" height="52" fill="transparent"/>` + SYM.switch({ on: c.S.on }))}</g>`;
      [[A, 'A', -16, 5], [B, 'B', 0, -12], [C, 'C', 16, 5], [D, 'D', 0, 22]].forEach(([p, n, dx, dy]) => { g += `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="${WIRE}"/>` + text(p[0] + dx, p[1] + dy, n, 'cc-h', 15, 'text-anchor="middle"'); });
      g += text(600, 348, c.S.on ? (r.balanced ? c.t({ en: 'Balanced: no current through G', hi: 'संतुलित: G से कोई धारा नहीं' }) : c.t({ en: 'Not balanced', hi: 'असंतुलित' })) : '', 'cc-val', 13, `text-anchor="end" fill="${r.balanced ? '#0F766E' : '#B42318'}"`);
      return g;
    },
    panel(c, r) {
      const s = c.S.sl;
      const reads = read(c.t({ en: 'Galvanometer', hi: 'गैल्वेनोमीटर' }), r.reads.ammeter) + read('V(B) − V(D)', fmtV(r.Vb - r.Vd));
      const out = `<div class="eq">P/Q = ${s.p}/${s.q} = ${sig(s.p / s.q)} · R/S = ${s.r}/${s.s} = ${sig(s.r / s.s)}</div>
        <p>${esc(c.t(r.balanced ? { en: 'P/Q = R/S, so B and D are at the same potential and the galvanometer reads zero. This is how an unknown resistance is measured: balance the bridge, then S = R × Q / P.', hi: 'P/Q = R/S, इसलिए B और D एक ही विभव पर हैं और गैल्वेनोमीटर शून्य दिखाता है। अज्ञात प्रतिरोध ऐसे ही मापा जाता है: सेतु संतुलित करो, फिर S = R × Q / P।' } : { en: 'Change one arm until the galvanometer reads zero. Balance needs P/Q = R/S.', hi: 'किसी एक भुजा को तब तक बदलो जब तक गैल्वेनोमीटर शून्य न दिखाए। संतुलन के लिए P/Q = R/S चाहिए।' }))}</p>`;
      return { reads, out };
    },
    sync(c) { const b = c.root.querySelector('button[data-key="switch"]'); if (b) { b.setAttribute('aria-pressed', String(c.S.on)); b.innerHTML = `<i class="sw"></i>${esc(c.t(U.switch))}: ${esc(c.t(c.S.on ? U.on : U.off))}`; } },
    act(c, key) { if (key === 'switch') { c.S.on = !c.S.on; c.draw(); } },
    keys: () => ({ targets: ['switch', 'slider:p', 'slider:q', 'slider:r', 'slider:s'], events: ['closed', 'open', 'reading:ammeter', 'balanced'] }),
  };

  // ================= DIODE: forward and reverse bias, the I–V curve =================
  const DIODES = { silicon: { name: T('Silicon diode', 'सिलिकॉन डायोड'), Is: 1e-12, n: 1.3 }, germanium: { name: T('Germanium diode', 'जर्मेनियम डायोड'), Is: 1e-6, n: 1.3 }, led: { name: T('LED', 'LED'), Is: 1e-18, n: 2 } };
  const VT = 0.02585;
  function diodeSolve(E, Rs, d) {
    if (E <= 0) return { Vd: E, I: -d.Is };
    let lo = 0, hi = E;
    for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; const I = d.Is * (Math.exp(Math.min(m / (d.n * VT), 80)) - 1); if (m + Rs * I > E) hi = m; else lo = m; }
    const Vd = (lo + hi) / 2;
    return { Vd, I: (E - Vd) / Rs };
  }
  MODE.diode = {
    H: 340,
    init(c) { c.S.kind = PRESETS.diode[c.cfg.preset] || 'silicon'; c.S.sl.voltage = 2; c.S.on = true; c.S.fwd = true; c.S.Rs = 100; c.S.pts = []; },
    ctrls(c) {
      return `<div class="cc-chips">${Object.keys(DIODES).map((k) => chip('material:' + k, esc(c.t(DIODES[k].name)), k === c.S.kind)).join('')}</div>
        <div class="cc-row">${switchChip(c, true)}<button type="button" class="cc-btn" data-key="part:battery">⇄ ${esc(c.t({ en: 'Turn the battery', hi: 'बैटरी पलटो' }))}</button><button type="button" class="cc-btn go" data-key="plot">${esc(c.t(U.plot))}</button></div>
        <div class="cc-sliders">${slider('slider:voltage', c.t({ en: 'Supply voltage', hi: 'सप्लाई वोल्टता' }), 0, 5, 0.1, 2, '2.0 V')}</div>`;
    },
    slideText: (c, k, v) => v.toFixed(1) + ' V',
    compute(c) {
      const d = DIODES[c.S.kind], E = c.S.on ? c.S.sl.voltage * (c.S.fwd ? 1 : -1) : 0;
      const { Vd, I } = diodeSolve(E, c.S.Rs, d);
      const glow = c.S.kind === 'led' ? clamp(I / 0.02, 0, 1) : 0;
      return { closed: c.S.on, lit: glow > 0.05, Vd, I, E, glow, fwd: c.S.fwd, reads: { ammeter: fmtA(Math.abs(I) < 1e-7 ? 0 : I), voltmeter: fmtV(Vd) } };
    },
    svg(c, r) {
      let g = "";
      const d = rectPath(60, 50, 340, 180), dv = 'M100 230V272H220V230';
      g += `<rect width="640" height="340" fill="url(#ccboard)"/><rect width="640" height="340" fill="url(#ccgrid)" opacity=".8"/>` + wire(d) + wire(dv) + flow(d, r.I) + `<circle cx="100" cy="230" r="4" fill="${WIRE}"/><circle cx="220" cy="230" r="4" fill="${WIRE}"/>`;
      g += `<g transform="translate(120 50)">${ctl('part:battery', c.t({ en: 'Battery: tap to turn it around', hi: 'बैटरी: पलटने के लिए टैप करो' }), `<rect x="-36" y="-30" width="72" height="60" fill="transparent"/>` + SYM.battery({ dir: c.S.fwd ? 1 : -1 }, 0))}</g>` + text(120, 96, c.S.sl.voltage.toFixed(1) + ' V', 'cc-h', 15, 'text-anchor="middle"');
      g += `<g transform="translate(230 50)">${ctl('switch', c.t(U.switch), `<rect x="-30" y="-26" width="60" height="52" fill="transparent"/>` + SYM.switch({ on: c.S.on }))}</g>`;
      g += place('meter', 340, 50, 0, { kind: 'A', val: r.reads.ammeter, needle: clamp(r.I / 0.05, -1, 1) });
      g += place(c.S.kind === 'led' ? 'led' : 'diode', 160, 230, 180, { dir: 1, glow: r.glow }) + place('resistor', 310, 230, 180, { label: c.S.Rs + ' Ω' });
      g += place('meter', 160, 272, 0, { kind: 'V', val: r.reads.voltmeter, needle: clamp(r.Vd / 3, -1, 1) });
      g += text(230, 332, c.t(r.fwd ? { en: 'Forward bias: + to p-side. Current flows above the knee voltage.', hi: 'अग्र बायस: + p-भाग से जुड़ा। घुटना वोल्टता के ऊपर धारा बहती है।' } : { en: 'Reverse bias: + to n-side. Only a tiny leakage current.', hi: 'पश्च बायस: + n-भाग से जुड़ा। केवल बहुत छोटी क्षरण धारा।' }), 'cc-lbl', 12, 'text-anchor="middle"');
      // I–V graph: V from −5 to +3 V, I from 0 to 50 mA.
      const gx = 440, gy = 250, gw = 170, gh = 200, Vmin = -5, Vmax = 3, Imax = 50;
      const px = (v) => gx + ((v - Vmin) / (Vmax - Vmin)) * gw, py = (i) => gy - clamp(i / Imax, -0.1, 1) * gh;
      g += `<rect x="${gx - 36}" y="${gy - gh - 30}" width="${gw + 60}" height="${gh + 70}" rx="14" fill="#FFFFFF" stroke="#CBD5E1"/>`;
      g += `<path d="M${gx} ${gy}H${gx + gw}M${px(0)} ${gy - gh}V${gy}" fill="none" stroke="#475569" stroke-width="2"/>`;
      [-4, -2, 0, 2].forEach((v) => { g += text(px(v), gy + 14, String(v), 'cc-lbl', 11, 'text-anchor="middle"'); });
      [20, 40].forEach((i) => { g += text(px(0) - 4, py(i) + 4, String(i), 'cc-lbl', 11, 'text-anchor="end"'); });
      g += text(gx + gw, gy + 28, 'V →', 'cc-lbl', 12, 'text-anchor="end"') + text(px(0) + 6, gy - gh + 10, 'I (mA)', 'cc-lbl', 12);
      const dd = DIODES[c.S.kind];
      let curve = '';
      for (let v = 0; v <= Vmax; v += 0.05) { const I = dd.Is * (Math.exp(Math.min(v / (dd.n * VT), 80)) - 1) * 1000; if (I > Imax) break; curve += (curve ? 'L' : 'M') + px(v).toFixed(1) + ' ' + py(I).toFixed(1); }
      g += `<path d="${curve}" fill="none" stroke="#1D4ED8" stroke-width="2" stroke-dasharray="4 4" opacity=".55"/>`;
      c.S.pts.forEach((p) => { g += `<circle cx="${px(p.V)}" cy="${py(p.I * 1000)}" r="5" fill="${p.k === c.S.kind ? '#8B3DFF' : '#94A3B8'}" stroke="#fff" stroke-width="1.5"/>`; });
      if (c.S.on) g += `<circle cx="${px(clamp(r.Vd, Vmin, Vmax))}" cy="${py(r.I * 1000)}" r="7" fill="none" stroke="#FF7A1A" stroke-width="2.5"/>`;
      g += text(gx + gw / 2, gy - gh - 14, c.t({ en: 'I–V curve', hi: 'I–V वक्र' }), 'cc-h', 14, 'text-anchor="middle"');
      return g;
    },
    panel(c, r) {
      const reads = read(c.t(U.voltmeter), r.reads.voltmeter) + read(c.t(U.ammeter), r.reads.ammeter);
      const knee = { silicon: 0.7, germanium: 0.3, led: 1.8 }[c.S.kind];
      let out = `<p>${esc(c.t(DIODES[c.S.kind].name))}: ${esc(c.t({ en: 'knee (cut-in) voltage about', hi: 'घुटना (कट-इन) वोल्टता लगभग' }))} ${knee} V. ${esc(c.t(r.fwd ? (r.I > 1e-4 ? { en: 'The diode conducts: nearly all the extra voltage drops across the 100 Ω resistor, so the diode voltage stays near the knee.', hi: 'डायोड चालन कर रहा है: लगभग सारी अतिरिक्त वोल्टता 100 Ω प्रतिरोधक पर गिरती है, इसलिए डायोड की वोल्टता घुटने के पास रहती है।' } : { en: 'Below the knee the current is almost zero.', hi: 'घुटने के नीचे धारा लगभग शून्य है।' }) : { en: 'Reverse biased: the depletion layer widens and only micro-amperes (Ge) or pico-amperes (Si) leak through. The whole supply voltage sits across the diode.', hi: 'पश्च बायस: अवक्षय परत चौड़ी हो जाती है और केवल माइक्रो-ऐम्पियर (Ge) या पीको-ऐम्पियर (Si) रिसते हैं। पूरी सप्लाई वोल्टता डायोड पर होती है।' }))}</p>`;
      if (c.S.pts.length) out += `<table class="cc-table"><tr><th>V</th><th>I</th></tr>${c.S.pts.slice(-6).map((p) => `<tr><td>${fmtV(p.V)}</td><td>${fmtA(Math.abs(p.I) < 1e-7 ? 0 : p.I)}</td></tr>`).join('')}</table>`;
      return { reads, out };
    },
    sync(c) {
      const b = c.root.querySelector('button[data-key="switch"]'); if (b) { b.setAttribute('aria-pressed', String(c.S.on)); b.innerHTML = `<i class="sw"></i>${esc(c.t(U.switch))}: ${esc(c.t(c.S.on ? U.on : U.off))}`; }
      c.root.querySelectorAll('button[data-key^="material:"]').forEach((e) => e.setAttribute('aria-pressed', String(e.dataset.key === 'material:' + c.S.kind)));
    },
    act(c, key) {
      if (key === 'switch') { c.S.on = !c.S.on; c.draw(); }
      else if (key === 'part:battery') { c.S.fwd = !c.S.fwd; c.draw(); c.api.emit(c.S.fwd ? 'forward' : 'reverse'); c.api.record(c.t(c.S.fwd ? { en: 'Forward bias', hi: 'अग्र बायस' } : { en: 'Reverse bias', hi: 'पश्च बायस' })); }
      else if (key.startsWith('material:')) { const k = key.slice(9); if (!DIODES[k]) return; c.S.kind = k; c.draw(); c.api.emit('material:' + k); }
      else if (key === 'plot') { const r = MODE.diode.compute(c); if (c.S.pts.length < 24) c.S.pts.push({ V: r.Vd, I: r.I, k: c.S.kind }); c.draw(); c.api.emit('plotted'); }
    },
    keys: () => ({ targets: ['switch', 'part:battery', 'slider:voltage', 'plot'].concat(Object.keys(DIODES).map((k) => 'material:' + k)), events: ['closed', 'open', 'lit', 'reading:ammeter', 'reading:voltmeter', 'plotted', 'forward', 'reverse', 'material:*'] }),
  };

  // ================= LOGIC: gates as switch circuits =================
  const GATE_SHAPE = {
    and: `<path d="M-30 -24H0a24 24 0 0 1 0 48H-30z" fill="#FFF7E0" stroke="${WIRE}" stroke-width="3"/>`,
    or: `<path d="M-34 -24q14 24 0 48q26 0 54-24q-28-24-54-24z" fill="#E0F2FE" stroke="${WIRE}" stroke-width="3" stroke-linejoin="round"/>`,
    not: `<path d="M-26 -24L18 0l-44 24z" fill="#FCE7F3" stroke="${WIRE}" stroke-width="3" stroke-linejoin="round"/><circle cx="23" cy="0" r="5" fill="#fff" stroke="${WIRE}" stroke-width="3"/>`,
    nand: `<path d="M-30 -24H-6a24 24 0 0 1 0 48H-30z" fill="#FFF7E0" stroke="${WIRE}" stroke-width="3"/><circle cx="23" cy="0" r="5" fill="#fff" stroke="${WIRE}" stroke-width="3"/>`,
    nor: `<path d="M-38 -24q14 24 0 48q26 0 54-24q-28-24-54-24z" fill="#E0F2FE" stroke="${WIRE}" stroke-width="3" stroke-linejoin="round"/><circle cx="23" cy="0" r="5" fill="#fff" stroke="${WIRE}" stroke-width="3"/>`,
    xor: `<path d="M-42 -24q14 24 0 48" fill="none" stroke="${WIRE}" stroke-width="3"/><path d="M-34 -24q14 24 0 48q26 0 54-24q-28-24-54-24z" fill="#DCFCE7" stroke="${WIRE}" stroke-width="3" stroke-linejoin="round"/>`,
  };
  MODE.logic = {
    H: 300,
    init(c) { c.S.gate = PRESETS.logic[c.cfg.preset] || 'and'; c.S.a = false; c.S.b = false; },
    ctrls(c) {
      return `<div class="cc-chips">${Object.keys(GATES).map((k) => chip('part:' + k, GATES[k].name, k === c.S.gate)).join('')}</div>
        <div class="cc-row">${chip('switch', `<i class="sw"></i>A: ${esc(c.t(U.off))}`, false)}${chip('switch:b', `<i class="sw"></i>B: ${esc(c.t(U.off))}`, false)}</div>`;
    },
    compute(c) {
      const G = GATES[c.S.gate];
      const out = !!G.f(c.S.a, c.S.b);
      return { closed: out, lit: out, out, G };
    },
    svg(c, r) {
      const G = r.G, one = !!G.one;
      let g = `<rect width="640" height="300" fill="url(#ccboard)"/><rect width="640" height="300" fill="url(#ccgrid)" opacity=".8"/>`;
      const sw = (key, y, on, lbl, dim) => `<g transform="translate(150 ${y})" opacity="${dim ? 0.25 : 1}">${ctl(key, lbl, `<rect x="-40" y="-26" width="80" height="52" fill="transparent"/>` + SYM.switch({ on }))}</g>` + text(96, y - 12, lbl, 'cc-h', 16, `text-anchor="middle" opacity="${dim ? 0.3 : 1}"`) + text(150, y + 34, on ? '1' : '0', 'cc-val', 14, 'text-anchor="middle"');
      const ya = one ? 150 : 110, yb = 190;
      g += wire(`M60 ${ya}H114`) + wire(`M186 ${ya}H${one ? 290 : 280}`) + (one ? '' : wire(`M60 ${yb}H114`) + wire(`M186 ${yb}H280`));
      g += `<path d="M60 ${ya}V${one ? 150 : yb}" ${W}/>`;
      g += sw('switch', ya, c.S.a, 'A') + (one ? '' : sw('switch:b', yb, c.S.b, 'B'));
      g += `<g transform="translate(320 150)">${GATE_SHAPE[c.S.gate]}</g>` + text(320, 205, G.name, 'cc-h', 16, 'text-anchor="middle"');
      if (!one) g += `<path d="M280 110V140H290M280 190V160H290" ${W}/>`;
      g += wire('M348 150H440') + (r.out ? flow('M348 150H440', 0.3) : '') + (r.out ? flow(`M60 ${ya}H114`, 0.3) : '');
      g += place('bulb', 476, 150, 0, { glow: r.out ? 1 : 0 }) + text(476, 200, c.t({ en: 'Output', hi: 'निर्गत' }) + ' = ' + (r.out ? '1' : '0'), 'cc-val', 15, 'text-anchor="middle"');
      g += wire(`M512 150H560V250H60V${one ? ya : yb}`) + (r.out ? flow('M512 150H560V250H60', 0.3) : '');
      g += place('battery', 300, 250, 180, { dir: 1 }, 'opacity="1"');
      g += text(320, 288, c.t(G.say), 'cc-lbl', 13, 'text-anchor="middle"');
      return g;
    },
    panel(c, r) {
      const G = r.G, one = !!G.one;
      const rows = one ? [[0], [1]] : [[0, 0], [0, 1], [1, 0], [1, 1]];
      const now = one ? [c.S.a ? 1 : 0] : [c.S.a ? 1 : 0, c.S.b ? 1 : 0];
      const table = `<table class="cc-table"><tr><th>A</th>${one ? '' : '<th>B</th>'}<th>${esc(c.t({ en: 'Output', hi: 'निर्गत' }))}</th></tr>${rows.map((row) => `<tr class="${row.join() === now.join() ? 'now' : ''}">${row.map((v) => `<td>${v}</td>`).join('')}<td>${G.f(!!row[0], !!row[1]) ? '1' : '0'}</td></tr>`).join('')}</table>`;
      const how = { and: T('Two switches in series: both must be closed for the bulb to light.', 'श्रेणी में दो स्विच: बल्ब जलने के लिए दोनों बंद होने चाहिए।'), or: T('Two switches in parallel: either one closed lights the bulb.', 'समांतर में दो स्विच: कोई एक बंद हो तो बल्ब जलता है।'), not: T('The switch is across the bulb: closing it short-cuts the bulb, so it goes off.', 'स्विच बल्ब के आर-पार है: उसे बंद करने पर बल्ब बायपास हो जाता है, इसलिए बुझ जाता है।'), nand: T('AND followed by NOT.', 'AND के बाद NOT।'), nor: T('OR followed by NOT.', 'OR के बाद NOT।'), xor: T('ON only when exactly one input is ON, like a staircase light with two switches.', 'केवल तब ON जब ठीक एक निवेश ON हो, जैसे सीढ़ी की बत्ती के दो स्विच।') }[c.S.gate];
      return { reads: read('A', c.S.a ? '1' : '0') + (one ? '' : read('B', c.S.b ? '1' : '0')) + read('Y', r.out ? '1' : '0'), out: table + `<p>${esc(c.t(how))}</p>` };
    },
    sync(c) {
      c.root.querySelectorAll('button[data-key^="part:"]').forEach((e) => e.setAttribute('aria-pressed', String(e.dataset.key === 'part:' + c.S.gate)));
      const a = c.root.querySelector('button[data-key="switch"]'), b = c.root.querySelector('button[data-key="switch:b"]');
      if (a) { a.setAttribute('aria-pressed', String(c.S.a)); a.innerHTML = `<i class="sw"></i>A: ${esc(c.t(c.S.a ? U.on : U.off))}`; }
      if (b) { b.setAttribute('aria-pressed', String(c.S.b)); b.innerHTML = `<i class="sw"></i>B: ${esc(c.t(c.S.b ? U.on : U.off))}`; b.hidden = !!GATES[c.S.gate].one; }
    },
    act(c, key) {
      if (key === 'switch') c.S.a = !c.S.a;
      else if (key === 'switch:b') c.S.b = !c.S.b;
      else if (key.startsWith('part:')) { const k = key.slice(5); if (!GATES[k]) return; c.S.gate = k; c.api.emit('gate:' + k); }
      else return;
      c.draw();
    },
    keys: () => ({ targets: ['switch', 'switch:b'].concat(Object.keys(GATES).map((k) => 'part:' + k)), events: ['closed', 'open', 'lit', 'gate:*'] }),
  };

  // ---------- register ----------
  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object') return ['config must be an object'];
    if (!MODES.includes(c.mode)) { e.push('mode: one of ' + MODES.join(', ')); return e; }
    if (c.parts != null) {
      if (!Array.isArray(c.parts) || c.parts.length > 12) e.push('parts: an array of up to 12 part ids');
      else c.parts.forEach((p) => {
        if (typeof p !== 'string') { e.push('parts: ids must be strings'); return; }
        if (p.startsWith('wire:')) { if (!WIRE_MATS.includes(p.slice(5))) e.push('unknown wire material: ' + p.slice(5) + ' (one of ' + WIRE_MATS.join(', ') + ')'); }
        else if (!PARTS[p]) e.push('unknown part: ' + p);
      });
    }
    if (c.preset != null) {
      if (typeof c.preset !== 'string' || !PRESETS[c.mode] || !PRESETS[c.mode][c.preset]) e.push(`preset: for mode ${c.mode} one of ${Object.keys(PRESETS[c.mode] || {}).join(', ')}`);
    }
    return e;
  }
  NCA_T.register({
    id: 'circuit',
    css: CSS,
    validate,
    keys(c) { const m = c && MODE[c.mode]; return m ? m.keys(c) : { targets: [], events: [] }; },
    demo: { mode: 'free', preset: 'torch', parts: ['cell', 'battery', 'bulb', 'resistor', 'switch', 'ammeter', 'voltmeter', 'fuse', 'led', 'rheostat', 'wire:copper', 'wire:plastic'] },
    modes: MODES, presets: PRESETS, parts: Object.keys(PARTS), materials: Object.keys(MAT), appliances: Object.keys(APPL),
    mount(root, config, api) { return mount(root, config, api); },
  });
})();
