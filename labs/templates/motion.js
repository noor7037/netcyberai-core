// Template: Motion lab. Straight-line motion from the equations of motion, graph matching, free fall, projectiles,
// uniform circular motion and relative velocity. Every position, speed and graph comes from the same exact formulas
// (no air resistance), so the picture, the numbers and the graphs always agree. Config:
//   { mode: '1d'|'graph-match'|'free-fall'|'projectile'|'circular'|'relative',
//     vehicle?: 'car'|'cycle'|'ball'|'train'|'auto', u?: m/s, a?: m/s², angle?: degrees, speed?: m/s, g?: 9.8,
//     h?: start height in m (free-fall, 1–60), r?: radius in m (circular, 0.5–10), pair?: true (free-fall: a heavy
//     and a light ball fall together), match?: 'dt'|'vt' (graph-match: which graph is the target),
//     vehicle2?: the second vehicle (relative) }
// In graph-match, u and a describe the hidden target motion the child must reproduce (by sliders or by dragging).
(function () {
  const L = window.NCA_LIB;
  const { esc, clamp } = L;
  const reduced = L.reducedMotion;
  const PI = Math.PI;
  const T = (en, hi) => ({ en, hi });
  const num = (x, d = 1) => {
    if (!isFinite(x)) return '–';
    let s = (Math.abs(x) < 1e-9 ? 0 : x).toFixed(d);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s === '-0' ? '0' : s.replace('-', '−');
  };
  const nice = (x) => { if (!(x > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(x))); const f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };

  const MODES = ['1d', 'graph-match', 'free-fall', 'projectile', 'circular', 'relative'];
  const VEH = ['car', 'cycle', 'ball', 'train', 'auto'];
  const KEYS = ['mode', 'vehicle', 'vehicle2', 'u', 'a', 'angle', 'speed', 'g', 'h', 'r', 'pair', 'match'];
  // Allowed ranges per mode (the sliders use the same ranges, so a config is always something the child can also set).
  const RANGE = {
    '1d': { u: [0, 30], a: [-10, 10] },
    'graph-match': { u: [0, 30], a: [-10, 10] },
    'free-fall': { u: [-20, 20], g: [0.5, 30], h: [1, 60] },
    'projectile': { speed: [5, 50], angle: [1, 90], g: [0.5, 30] },
    'circular': { speed: [0.5, 10], r: [0.5, 10] },
    'relative': { u: [-20, 20], speed: [-20, 20] },
  };
  const ANY = { u: [-30, 30], a: [-10, 10], angle: [0, 90], speed: [-30, 50], g: [0.5, 30], h: [1, 60], r: [0.5, 10] };
  const DEF = {
    '1d': { u: 10, a: 0 }, 'graph-match': { u: 10, a: 0 }, 'free-fall': { u: 0, g: 9.8, h: 20 },
    'projectile': { speed: 20, angle: 45, g: 9.8 }, 'circular': { speed: 3, r: 2 }, 'relative': { u: 10, speed: 15 },
  };
  const SLIDERS = {
    '1d': [{ k: 'u', min: 0, max: 30, step: 1, unit: 'm/s', label: T('Starting speed u', 'शुरुआती चाल u') }, { k: 'a', min: -10, max: 10, step: 0.5, unit: 'm/s²', label: T('Acceleration a', 'त्वरण a') }],
    'graph-match': [{ k: 'u', min: 0, max: 30, step: 1, unit: 'm/s', label: T('Starting speed u', 'शुरुआती चाल u') }, { k: 'a', min: -10, max: 10, step: 0.5, unit: 'm/s²', label: T('Acceleration a', 'त्वरण a') }],
    'free-fall': [{ k: 'u', min: -20, max: 20, step: 1, unit: 'm/s', label: T('Throw speed u (up is +)', 'फेंकने की चाल u (ऊपर +)') }],
    'projectile': [{ k: 'speed', min: 5, max: 50, step: 1, unit: 'm/s', label: T('Launch speed u', 'छोड़ने की चाल u') }, { k: 'angle', min: 0, max: 90, step: 1, unit: '°', label: T('Angle θ', 'कोण θ') }],
    'circular': [{ k: 'speed', min: 0.5, max: 10, step: 0.5, unit: 'm/s', label: T('Speed v', 'चाल v') }],
    'relative': [{ k: 'u', min: -20, max: 20, step: 1, unit: 'm/s', label: T('Speed of A', 'A की चाल') }, { k: 'speed', min: -20, max: 20, step: 1, unit: 'm/s', label: T('Speed of B', 'B की चाल') }],
  };
  const VNAME = { car: T('car', 'कार'), cycle: T('cycle', 'साइकिल'), ball: T('ball', 'गेंद'), train: T('train', 'रेलगाड़ी'), auto: T('auto', 'ऑटो') };
  const W = {
    time: T('Time', 'समय'), dist: T('Distance', 'दूरी'), height: T('Height', 'ऊँचाई'), vel: T('Velocity', 'वेग'), speed: T('Speed', 'चाल'), acc: T('Acceleration', 'त्वरण'),
    angle: T('Angle', 'कोण'), period: T('Period', 'आवर्तकाल'), gap: T('Gap', 'बीच की दूरी'), rel: T('B seen from A', 'A से B का वेग'), along: T('Along', 'आगे'),
    play: T('Play', 'चलाओ'), pause: T('Pause', 'रोको'), again: T('Play again', 'फिर चलाओ'), reset: T('Reset', 'शुरू से'), launch: T('Launch', 'छोड़ो'), drop: T('Drop', 'गिराओ'), whirl: T('Whirl', 'घुमाओ'),
    release: T('Let go of the string', 'डोरी छोड़ दो'), target: T('Target', 'लक्ष्य'), ghost: T('target', 'लक्ष्य'), start: T('start', 'शुरू'), readings: T('Readings', 'माप'), scene: T('Motion scene', 'गति का दृश्य'),
    graphs: T('Graphs', 'ग्राफ़'), tAxis: T('time t (s)', 'समय t (s)'),
    gTitle: { dt: T('Distance–time', 'दूरी–समय'), vt: T('Velocity–time', 'वेग–समय'), at: T('Acceleration–time', 'त्वरण–समय') },
    fromGround: T('Seen from the ground', 'ज़मीन से देखने पर'), fromA: T('Seen from A', 'A से देखने पर'),
    heavy: T('heavy', 'भारी'), light: T('light', 'हल्की'), apex: T('highest point', 'सबसे ऊँचा बिंदु'), landed: T('landed', 'गिरी'),
  };
  const DRAG = {
    '1d': T('Drag the car along the road', 'कार को सड़क पर खींचो'), 'graph-match': T('Drag the car to follow the target', 'लक्ष्य के पीछे-पीछे कार खींचो'),
    'free-fall': T('Drag the ball to set the drop height', 'गिराने की ऊँचाई बदलने के लिए गेंद खींचो'), 'projectile': T('Drag the ball to set the angle', 'कोण बदलने के लिए गेंद खींचो'),
    'circular': T('Drag the stone around the circle', 'पत्थर को वृत्त पर घुमाओ'), 'relative': T('Drag B to change where it starts', 'B की शुरुआती जगह बदलने के लिए उसे खींचो'),
  };
  const INTRO = {
    '1d': T('Set u and a, then press Play. Or drag the car yourself and watch the graph draw.', 'u और a तय करो, फिर चलाओ दबाओ। या कार को ख़ुद खींचो और ग्राफ़ बनते देखो।'),
    'graph-match': T('Make the car move exactly like the purple target graph: set u and a and press Play, or drag the car to keep up with the ghost car.', 'कार को बैंगनी लक्ष्य ग्राफ़ की तरह ही चलाओ: u और a तय करके चलाओ दबाओ, या छाया-कार के साथ-साथ कार खींचो।'),
    'free-fall': T('Press Drop. Drag the ball to change the height; raise u to throw it up first.', 'गिराओ दबाओ। ऊँचाई बदलने के लिए गेंद खींचो; पहले ऊपर फेंकने के लिए u बढ़ाओ।'),
    'projectile': T('Set the speed and the angle, then Launch. Old paths stay so you can compare.', 'चाल और कोण तय करो, फिर छोड़ो दबाओ। पुराने रास्ते बने रहते हैं ताकि तुलना कर सको।'),
    'circular': T('Press Whirl. The speed stays the same, but watch the green velocity arrow keep turning.', 'घुमाओ दबाओ। चाल वही रहती है, पर देखो, हरा वेग-तीर घूमता रहता है।'),
    'relative': T('Set both speeds and press Play. The lower road shows what a passenger in A sees.', 'दोनों की चाल तय करके चलाओ दबाओ। नीचे की सड़क दिखाती है कि A में बैठा यात्री क्या देखता है।'),
  };
  const LINES = {
    '1d': { dt: [['s', 'mo-ld', W.dist]], vt: [['v', 'mo-lv', W.vel]], at: [['a', 'mo-la', W.acc]] },
    'graph-match': { dt: [['s', 'mo-ld', W.dist]], vt: [['v', 'mo-lv', W.vel]], at: [['a', 'mo-la', W.acc]] },
    'free-fall': { dt: [['y', 'mo-ld', W.height]], vt: [['v', 'mo-lv', W.vel]], at: [['a', 'mo-la', W.acc]] },
    'projectile': { dt: [['x', 'mo-ld', T('x (along)', 'x (आगे)')], ['y', 'mo-lt', T('y (height)', 'y (ऊँचाई)')]], vt: [['vx', 'mo-ld', 'vx'], ['vy', 'mo-lt', 'vy']], at: [['ax', 'mo-ld', 'ax'], ['a', 'mo-lt', 'ay']] },
    'circular': { dt: [['s', 'mo-ld', T('distance along the circle', 'वृत्त पर चली दूरी')]], vt: [['v', 'mo-lv', T('speed |v|', 'चाल |v|')], ['vx', 'mo-lt', 'vx']], at: [['a', 'mo-la', '|a| = v²/r'], ['ax', 'mo-lt', 'ax']] },
    'relative': { dt: [['xA', 'mo-ld', 'A'], ['xB', 'mo-lb', 'B']], vt: [['vA', 'mo-ld', 'A'], ['vB', 'mo-lb', 'B'], ['rel', 'mo-lt', W.rel, true]], at: [['aA', 'mo-ld', 'A'], ['aB', 'mo-lb', 'B']] },
  };
  const UNIT = { dt: 'm', vt: 'm/s', at: 'm/s²' };
  const RD = { X0: 60, L: 50, k: 13.6 };   // road: 50 m across 680 px

  const CSS = `.mo { container-type: inline-size; color: var(--ink); font-family: var(--font-body); }
.mo * { box-sizing: border-box; }
.mo-grid { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); }
@container (min-width: 820px) { .mo-grid { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); align-items: start; } }
.mo-read { display: grid; grid-template-columns: repeat(auto-fit, minmax(78px, 1fr)); gap: 6px; margin-bottom: 10px; }
.mo-read div { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 5px 6px; text-align: center; min-width: 0; }
.mo-read small { display: block; font-size: .7rem; font-weight: 700; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mo-read b { font: 800 1.2rem/1.2 var(--font-display); font-variant-numeric: tabular-nums; white-space: nowrap; }
.mo-read u { text-decoration: none; font-size: .7rem; color: var(--ink-2); font-weight: 600; margin-left: 2px; }
.mo-svg { width: 100%; height: auto; display: block; border-radius: 16px; box-shadow: 0 6px 18px rgba(6,18,51,.14); touch-action: none; background: #BFDBFE; }
.mo-ctl { margin-top: 10px; display: grid; gap: 8px; }
.mo-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.mo-btn { min-height: 48px; border: 0; border-radius: 12px; padding: 0 18px; font: 700 1rem var(--font-body); display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: var(--sunk); color: var(--ink); cursor: pointer; transition: transform .12s, box-shadow .2s, background .2s; }
.mo-btn:active { transform: scale(.97); }
.mo-btn:focus-visible { outline: 3px solid #FF7A1A; outline-offset: 2px; }
.mo-play { background: #FF7A1A; color: #1E293B; box-shadow: 0 4px 12px rgba(255,122,26,.35); flex: 1 1 150px; font-size: 1.05rem; }
.mo-play.on { background: #1D4ED8; color: #fff; box-shadow: 0 4px 12px rgba(29,78,216,.35); }
.mo-ghost { border: 1.5px solid var(--line); background: var(--surface); }
.mo-sl { display: grid; grid-template-columns: 1fr auto; gap: 0 10px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 6px 12px 2px; }
.mo-sl span { font-weight: 700; font-size: .9rem; }
.mo-sl output { font: 800 1.05rem var(--font-display); color: var(--royal); font-variant-numeric: tabular-nums; text-align: right; }
.mo-sl input[type=range] { grid-column: 1 / -1; width: 100%; height: 44px; margin: 0; -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer; }
.mo-sl input[type=range]::-webkit-slider-runnable-track { height: 10px; border-radius: 5px; background: linear-gradient(90deg, #02CFF9, #1D4ED8); }
.mo-sl input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 28px; height: 28px; border-radius: 50%; background: #fff; border: 3px solid #1D4ED8; margin-top: -9px; box-shadow: 0 2px 6px rgba(6,18,51,.3); }
.mo-sl input[type=range]::-moz-range-track { height: 10px; border-radius: 5px; background: linear-gradient(90deg, #02CFF9, #1D4ED8); }
.mo-sl input[type=range]::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: #fff; border: 3px solid #1D4ED8; }
.mo-sl input:focus-visible { outline: 3px solid #FF7A1A; outline-offset: 2px; border-radius: 8px; }
.mo-tabs { display: flex; gap: 6px; margin-bottom: 8px; }
.mo-tab { flex: 1; min-height: 44px; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 12px; font: 700 .95rem var(--font-body); cursor: pointer; transition: all .18s; }
.mo-tab:hover { border-color: #2563EB; }
.mo-tab[aria-pressed="true"] { background: #1D4ED8; border-color: #1D4ED8; color: #fff; box-shadow: 0 4px 12px rgba(29,78,216,.3); }
.mo-gwrap { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 6px; }
.mo-gsvg { width: 100%; height: auto; display: block; touch-action: none; }
.mo-live { margin-top: 10px; background: var(--surface); border: 1px solid var(--line); border-left: 5px solid #2563EB; border-radius: 12px; padding: 9px 13px; min-height: 48px; line-height: 1.4; font-size: .95rem; }
.mo-live.ok { border-left-color: #22C55E; }
.mo-formula { margin-top: 10px; display: grid; gap: 6px; }
.mo-f { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 12px; align-items: baseline; background: var(--sunk); border-radius: 10px; padding: 6px 10px; font-size: .9rem; }
.mo-f b { font-family: var(--font-display); color: var(--royal); white-space: nowrap; font-size: 1rem; }
.mo-f span { font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
@container (max-width: 430px) { .mo-f { grid-template-columns: minmax(0, 1fr); } }
.mo-obj { cursor: grab; }
.mo-obj:focus { outline: none; }
.mo-obj:focus-visible .mo-ring { stroke: #FF7A1A; }
.mo-ring { fill: transparent; stroke: transparent; stroke-width: 3; stroke-dasharray: 6 5; }
.mo-gtxt { font: 600 calc(11px * var(--mo-gz)) var(--font-body); fill: var(--ink-2); }
.mo-gttl { font: 700 calc(13px * var(--mo-gz)) var(--font-body); fill: var(--ink); }
.mo-gax { stroke: var(--ink-2); stroke-width: 1.3; }
.mo-ggrid { stroke: var(--line); stroke-width: 1; }
.mo-line { fill: none; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; }
.mo-ld { stroke: var(--royal); } .mo-lv { stroke: var(--good); } .mo-la { stroke: #FF7A1A; } .mo-lt { stroke: var(--grape); } .mo-lb { stroke: #FF6B57; }
.mo-dot { stroke: #fff; stroke-width: 2; }
.mo-dot.mo-ld { fill: var(--royal); } .mo-dot.mo-lv { fill: var(--good); } .mo-dot.mo-la { fill: #FF7A1A; } .mo-dot.mo-lt { fill: var(--grape); } .mo-dot.mo-lb { fill: #FF6B57; }
.mo-sw.mo-ld { fill: var(--royal); } .mo-sw.mo-lv { fill: var(--good); } .mo-sw.mo-la { fill: #FF7A1A; } .mo-sw.mo-lt { fill: var(--grape); } .mo-sw.mo-lb { fill: #FF6B57; }
.mo-svg { --mo-z: 1; }
.mo-gsvg { --mo-gz: 1; }
.mo-stxt { font: 700 calc(12px * var(--mo-z)) var(--font-body); fill: #1E293B; paint-order: stroke; stroke: rgba(248,250,252,.75); stroke-width: 3px; }
.mo-stxt.lt { fill: #F8FAFC; }
.mo-pill { font: 700 calc(12px * var(--mo-z)) var(--font-body); fill: #1E293B; }
@media (prefers-reduced-motion: reduce) { .mo-btn, .mo-tab { transition: none; } }`;

  // ---------- pure maths (also used by validate/keys-free code paths) ----------
  // Smallest positive time at which ½at² + ut = d, or Infinity.
  function timeTo(u, a, d) {
    if (Math.abs(a) < 1e-9) return u > 0 ? d / u : Infinity;
    const disc = u * u + 2 * a * d;
    if (disc < 0) return Infinity;
    const c = [(-u + Math.sqrt(disc)) / a, (-u - Math.sqrt(disc)) / a].filter((x) => x > 1e-9);
    return c.length ? Math.min(...c) : Infinity;
  }
  function plan1d(u, a) {
    const tL = timeTo(u, a, RD.L);
    const tStop = a < 0 ? Math.max(0, -u / a) : Infinity;
    const still = u <= 0 && a <= 0;
    const T0 = still ? 0 : Math.min(tL, tStop, 20);
    const at = (t) => {
      const tt = Math.min(Math.max(0, t), tStop, T0);
      const s = Math.min(RD.L, u * tt + 0.5 * a * tt * tt);
      const over = t > tStop + 1e-9 || t > T0 + 1e-9;
      return { s, v: over ? (tStop <= T0 ? 0 : u + a * tt) : u + a * tt, a: over && tStop <= T0 ? 0 : a };
    };
    const end = still ? 'still' : tL <= tStop && tL <= 20 ? 'end' : tStop <= 20 ? 'brake' : 'time';
    return { T: T0, at, events: [{ t: T0, e: 'stopped' }], end, still };
  }

  // ---------- drawing helpers ----------
  const cloud = (x, y, s = 1) => `<g fill="#fff" opacity=".92" transform="translate(${x} ${y}) scale(${s})"><ellipse rx="34" ry="14"/><ellipse cx="-20" cy="4" rx="20" ry="11"/><ellipse cx="22" cy="5" rx="22" ry="12"/></g>`;
  const hills = (y) => `<path d="M0 ${y}C110 ${y - 60} 230 ${y - 25} 360 ${y - 55}S600 ${y - 10} 800 ${y - 65}V${y}Z" fill="#6EE7B7" opacity=".85"/><path d="M0 ${y}C160 ${y - 30} 300 ${y - 50} 470 ${y - 28}S700 ${y - 45} 800 ${y - 20}V${y}Z" fill="#34D399" opacity=".8"/>`;
  function defs() {
    return `<defs>
      <linearGradient id="mo-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3B82F6"/><stop offset="1" stop-color="#DBEAFE"/></linearGradient>
      <linearGradient id="mo-grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#86EFAC"/><stop offset="1" stop-color="#22C55E"/></linearGradient>
      <linearGradient id="mo-road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#64748B"/><stop offset="1" stop-color="#334155"/></linearGradient>
      <linearGradient id="mo-bld" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E2E8F0"/><stop offset="1" stop-color="#94A3B8"/></linearGradient>
      <radialGradient id="mo-ball" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#FFC9C0"/><stop offset=".45" stop-color="#FF6B57"/><stop offset="1" stop-color="#9F1239"/></radialGradient>
      <radialGradient id="mo-ball2" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#BAE6FD"/><stop offset=".45" stop-color="#38BDF8"/><stop offset="1" stop-color="#1E40AF"/></radialGradient>
      <radialGradient id="mo-field" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#BBF7D0"/><stop offset="1" stop-color="#4ADE80"/></radialGradient>
    </defs>`;
  }
  function sky(H, assetUrl) {
    return defs() + `<rect width="800" height="${H}" fill="url(#mo-sky)"/>${assetUrl ? `<image href="${esc(assetUrl)}" width="800" height="${H}" preserveAspectRatio="xMidYMid slice" opacity=".85"/>` : ''}<circle cx="700" cy="58" r="40" fill="#FDE68A" opacity=".35"/><circle cx="700" cy="58" r="26" fill="#FDE047"/>${cloud(130, 62)}${cloud(430, 44, 0.8)}${cloud(610, 96, 0.6)}`;
  }
  function arrow(x1, y1, x2, y2, col, w = 3.5) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (len < 3) return '';
    const ux = dx / len, uy = dy / len, hx = x2 - ux * 10, hy = y2 - uy * 10;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/><polygon points="${x2.toFixed(1)},${y2.toFixed(1)} ${(hx - uy * 6).toFixed(1)},${(hy + ux * 6).toFixed(1)} ${(hx + uy * 6).toFixed(1)},${(hy - ux * 6).toFixed(1)}" fill="${col}"/>`;
  }
  let ZS = 1, GZ = 1;   // text scale for the scene and the graph: bigger in the viewBox when the SVG is drawn small
  function pill(x, y, text, bg = '#FFFFFF', fg = '#1E293B', anchor = 'middle') {
    const w = (text.length * 7.2 + 14) * ZS, h = 20 * ZS;
    x = anchor === 'middle' ? clamp(x, w / 2 + 4, 796 - w / 2) : x;
    const x0 = clamp(anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2, 4, 796 - w);
    return `<g><rect x="${x0.toFixed(1)}" y="${(y - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(h / 2).toFixed(1)}" fill="${bg}" opacity=".94" stroke="rgba(30,41,59,.15)"/><text x="${(x0 + w / 2).toFixed(1)}" y="${(y + 4.4 * ZS).toFixed(1)}" text-anchor="middle" class="mo-pill" style="fill:${fg}">${esc(text)}</text></g>`;
  }
  const VW = { car: 94, cycle: 50, ball: 28, train: 108, auto: 86 };
  function vehicle(id, deg, flip) {
    const wheel = (cx, cy, r) => `<g transform="translate(${cx} ${cy})"><circle r="${r}" fill="#1E293B"/><circle r="${(r * 0.62).toFixed(1)}" fill="#CBD5E1"/><g transform="rotate(${deg.toFixed(1)})"><path d="M0 ${-r * 0.55}V${r * 0.55}M${-r * 0.55} 0H${r * 0.55}" stroke="#475569" stroke-width="2.2" stroke-linecap="round"/></g><circle r="2" fill="#475569"/></g>`;
    let b = '';
    if (id === 'car') b = `<path d="M-42 -12H42Q47 -12 47 -17V-26Q47 -32 41 -32H23L10 -46H-16L-30 -32H-41Q-47 -32 -47 -26V-17Q-47 -12 -42 -12Z" fill="#2563EB"/><path d="M-26 -32L-14 -43H8L18 -32Z" fill="#DBEAFE"/><line x1="-3" y1="-43" x2="-3" y2="-32" stroke="#2563EB" stroke-width="2"/><rect x="42" y="-28" width="5" height="6" rx="1.5" fill="#FDE68A"/><rect x="-47" y="-28" width="5" height="6" rx="1.5" fill="#FCA5A5"/><rect x="-10" y="-30" width="22" height="3" rx="1.5" fill="#1E40AF" opacity=".5"/>${wheel(-26, -9, 9)}${wheel(26, -9, 9)}`;
    else if (id === 'cycle') b = `<g stroke="#FF7A1A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M-22 -11L-7 -36L5 -14L-22 -11M5 -14L22 -11L15 -40M-7 -36H-13M15 -40L21 -45"/></g><rect x="-15" y="-41" width="11" height="4" rx="2" fill="#1E293B"/><circle cx="5" cy="-14" r="3.2" fill="#1E293B"/><g stroke="#B45309" stroke-width="3.2" stroke-linecap="round" fill="none"><path d="M-9 -39L-2 -57L19 -45"/><path d="M-9 -39L0 -25L5 -14"/></g><path d="M-6 -57L-2 -58" stroke="#B45309" stroke-width="3"/><circle cx="-3" cy="-64" r="6.5" fill="#F59E0B"/><path d="M-9.5 -65q6.5-7 13 0" fill="#1E293B"/>${wheel(-22, -11, 11)}${wheel(22, -11, 11)}`;
    else if (id === 'train') b = `<rect x="-52" y="-40" width="92" height="30" rx="6" fill="#DC2626"/><rect x="12" y="-60" width="30" height="22" rx="4" fill="#B91C1C"/><rect x="18" y="-55" width="12" height="10" rx="2" fill="#DBEAFE"/><rect x="-42" y="-56" width="12" height="18" rx="3" fill="#1E293B"/><circle cx="-36" cy="-62" r="6" fill="#CBD5E1" opacity=".7"/><circle cx="-28" cy="-70" r="4" fill="#CBD5E1" opacity=".5"/><rect x="-52" y="-30" width="92" height="4" fill="#FCD34D"/><path d="M40 -12L54 -2H40Z" fill="#1E293B"/><rect x="-48" y="-25" width="10" height="8" rx="1" fill="#FDE68A"/>${wheel(-34, -8, 8)}${wheel(-10, -8, 8)}${wheel(22, -8, 8)}<line x1="-34" y1="-8" x2="22" y2="-8" stroke="#94A3B8" stroke-width="3" stroke-linecap="round" transform="translate(${(Math.cos(deg * PI / 180) * 4).toFixed(1)} ${(Math.sin(deg * PI / 180) * 4).toFixed(1)})"/>`;
    else if (id === 'auto') b = `<path d="M-32 -12V-34Q-32 -48 -18 -48H14Q30 -48 34 -34L36 -24V-12Z" fill="#FACC15"/><path d="M-32 -22H36V-12H-32Z" fill="#16A34A"/><path d="M14 -46Q29 -44 33 -30H24Q22 -40 12 -42Z" fill="#DBEAFE"/><rect x="-26" y="-44" width="30" height="14" rx="3" fill="#1E293B" opacity=".85"/><rect x="-22" y="-42" width="12" height="8" fill="#DBEAFE"/><path d="M36 -24Q46 -24 46 -14V-12H36Z" fill="#1E293B"/><rect x="-36" y="-30" width="8" height="12" rx="2" fill="#FACC15"/>${wheel(-18, -8, 8)}${wheel(36, -8, 8)}`;
    else b = `<circle cx="0" cy="-13" r="13" fill="url(#mo-ball)"/><g transform="translate(0 -13) rotate(${deg.toFixed(1)})"><ellipse rx="13" ry="5" fill="none" stroke="#7F1D1D" stroke-width="1.5" opacity=".65"/></g>`;
    return `<ellipse cx="0" cy="1" rx="${VW[id] / 2}" ry="3.5" fill="#000" opacity=".18"/><g transform="${flip ? 'scale(-1 1)' : 'scale(1 1)'}">${b}</g>`;
  }

  // ---------- the template ----------
  function mount(root, cfg, api) {
    const t = (x) => api.t(x);
    const mode = cfg.mode;
    const P = Object.assign({}, DEF[mode]);
    Object.keys(RANGE[mode]).forEach((k) => { if (cfg[k] != null) P[k] = cfg[k]; });
    const target = mode === 'graph-match' ? { u: P.u, a: P.a } : null;
    if (target) { P.u = target.u === 0 ? 5 : 0; P.a = 0; }
    const matchKind = cfg.match || 'dt';
    const veh = cfg.vehicle || (['free-fall', 'projectile', 'circular'].includes(mode) ? 'ball' : 'car');
    const veh2 = cfg.vehicle2 || (veh === 'car' ? 'auto' : 'car');
    const VB = { '1d': 320, 'graph-match': 320, 'free-fall': 420, 'projectile': 400, 'circular': 360, 'relative': 470 }[mode];
    const S = { t: 0, playing: false, done: false, graph: target ? matchKind : 'dt', plan: null, raf: 0, last: 0, fired: new Set(), trails: [], manual: null, theta0: 0, drag: null, released: null, gapB: 12, ffk: 0, turns: 0, keyTimer: 0, matchedOnce: false };
    const bgUrl = api.asset('motion-sky');

    // ----- DOM -----
    const sliders = SLIDERS[mode];
    const playWord = () => (S.playing ? W.pause : S.done ? W.again : mode === 'projectile' ? W.launch : mode === 'free-fall' ? W.drop : mode === 'circular' ? W.whirl : W.play);
    root.innerHTML = `<div class="mo mo-${mode}"><div class="mo-grid">
      <div class="mo-left">
        <div class="mo-read" aria-label="${esc(t(W.readings))}"></div>
        <svg class="mo-svg" viewBox="0 0 800 ${VB}" role="group" aria-label="${esc(t(W.scene))}"></svg>
        <div class="mo-ctl">
          <div class="mo-btns">
            <button type="button" class="mo-btn mo-play" data-key="play"></button>
            <button type="button" class="mo-btn mo-ghost" data-key="reset">↺ ${esc(t(W.reset))}</button>
            ${mode === 'circular' ? `<button type="button" class="mo-btn mo-ghost" data-key="release">✂ ${esc(t(W.release))}</button>` : ''}
          </div>
          ${sliders.map((s) => `<label class="mo-sl"><span>${esc(t(s.label))}</span><output></output><input type="range" data-key="slider:${s.k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${P[s.k]}" aria-label="${esc(t(s.label))}"></label>`).join('')}
        </div>
      </div>
      <div class="mo-right">
        <div class="mo-tabs" data-key="graph" role="group" aria-label="${esc(t(W.graphs))}">
          ${['dt', 'vt', 'at'].map((k) => `<button type="button" class="mo-tab" data-g="${k}" aria-pressed="${k === S.graph}">${k === 'dt' ? (mode === 'free-fall' ? 'h–t' : mode === 'projectile' ? 'x, y–t' : mode === 'relative' ? 'x–t' : 'd–t') : k === 'vt' ? 'v–t' : 'a–t'}</button>`).join('')}
        </div>
        <div class="mo-gwrap"><svg class="mo-gsvg" viewBox="0 0 420 252" role="img" aria-label="${esc(t(W.gTitle[S.graph]))}"></svg></div>
        <div class="mo-live" aria-live="polite">${esc(t(INTRO[mode]))}</div>
        <div class="mo-formula"></div>
      </div></div></div>`;
    const svg = root.querySelector('.mo-svg'), gsvg = root.querySelector('.mo-gsvg'), readEl = root.querySelector('.mo-read'), liveEl = root.querySelector('.mo-live'), formEl = root.querySelector('.mo-formula'), playBtn = root.querySelector('.mo-play');
    const sliderEl = (k) => root.querySelector(`input[data-key="slider:${k}"]`);
    function syncSliders() { sliders.forEach((s) => { const inp = sliderEl(s.k); inp.value = P[s.k]; inp.nextElementSibling; inp.parentElement.querySelector('output').textContent = `${num(P[s.k], 2)} ${s.unit}`; }); }
    function live(x, ok) { liveEl.textContent = t(x); liveEl.classList.toggle('ok', !!ok); }

    // ----- plans (exact physics) -----
    function planFF() {
      const { u, g, h } = P;
      const disc = u * u + 2 * g * h, Tt = (u + Math.sqrt(disc)) / g, tA = u > 0 ? u / g : 0, H = u > 0 ? h + u * u / (2 * g) : h;
      const at = (tm) => { const tt = clamp(tm, 0, Tt); const over = tm > Tt + 1e-9; return { y: Math.max(0, h + u * tt - 0.5 * g * tt * tt), v: over ? 0 : u - g * tt, a: over ? 0 : -g }; };
      const events = []; if (u > 0) events.push({ t: tA, e: 'max-height' }); events.push({ t: Tt, e: 'landed' }, { t: Tt, e: 'stopped' });
      return { T: Tt, at, events, tA, H, vLand: -Math.sqrt(disc) };
    }
    function planPJ() {
      const u = P.speed, th = P.angle * PI / 180, g = P.g, Tt = 2 * u * Math.sin(th) / g;
      const R = u * u * Math.sin(2 * th) / g, H = u * u * Math.sin(th) * Math.sin(th) / (2 * g), tA = u * Math.sin(th) / g;
      const still = Tt < 0.02;
      const at = (tm) => { const tt = clamp(tm, 0, Tt); const over = tm > Tt + 1e-9; return { x: u * Math.cos(th) * tt, y: Math.max(0, u * Math.sin(th) * tt - 0.5 * g * tt * tt), vx: over ? 0 : u * Math.cos(th), vy: over ? 0 : u * Math.sin(th) - g * tt, ax: 0, a: over ? 0 : -g }; };
      return { T: still ? 0 : Tt, at, events: [{ t: tA, e: 'max-height' }, { t: Tt, e: 'landed' }, { t: Tt, e: 'range' }, { t: Tt, e: 'stopped' }], R, H, tA, still };
    }
    function planCR() {
      const v = P.speed, r = P.r, w = v / r, Tp = 2 * PI * r / v, a = v * v / r;
      const at = (tm) => { const th = S.theta0 + w * tm; return { th, s: v * tm, v, a, w, Tp, vx: -v * Math.sin(th), ax: -a * Math.cos(th) }; };
      return { T: Infinity, at, events: [], Tp, a, w };
    }
    function planRel() {
      const vA = P.u, vB = P.speed, xA0 = 6, xB0 = xA0 + S.gapB;
      const out = (x0, v) => (v > 0 ? (RD.L + 4 - x0) / v : v < 0 ? (x0 + 4) / -v : Infinity);
      const still = vA === 0 && vB === 0;
      // The run ends when the first moving vehicle leaves the road (or after 20 s).
      let Tt = Math.min(out(xA0, vA), out(xB0, vB), 20); if (!isFinite(Tt)) Tt = 20;
      const at = (tm) => { const tt = clamp(tm, 0, Tt); return { xA: xA0 + vA * tt, xB: xB0 + vB * tt, vA, vB, rel: vB - vA, gap: xB0 - xA0 + (vB - vA) * tt, aA: 0, aB: 0 }; };
      const meet = vB - vA !== 0 ? (xA0 - xB0) / (vB - vA) : Infinity;
      return { T: still ? 0 : Tt, at, events: [{ t: Tt, e: 'stopped' }], meet: meet > 0 && meet <= Tt ? meet : null, xA0, xB0, still };
    }
    const plan = () => (mode === '1d' || mode === 'graph-match' ? plan1d(P.u, P.a) : mode === 'free-fall' ? planFF() : mode === 'projectile' ? planPJ() : mode === 'circular' ? planCR() : planRel());
    const ffScale = () => 290 / Math.max(10, P.h + Math.max(0, P.u) * Math.max(0, P.u) / (2 * P.g));
    const pjScale = () => 580 / (P.speed * P.speed / P.g);

    function cur() {
      if (S.manual) { const m = S.manual, p = m.pts[m.pts.length - 1]; return { t: p ? p.t : 0, s: m.s, v: p ? p.v : 0, a: NaN }; }
      const pl = S.plan || plan();
      return Object.assign({ t: S.t }, pl.at(S.t));
    }

    // ----- readouts -----
    const READ = {
      '1d': [['t', W.time, 's'], ['s', W.dist, 'm'], ['v', W.vel, 'm/s'], ['a', W.acc, 'm/s²']],
      'graph-match': [['t', W.time, 's'], ['s', W.dist, 'm'], ['v', W.vel, 'm/s'], ['a', W.acc, 'm/s²']],
      'free-fall': [['t', W.time, 's'], ['y', W.height, 'm'], ['v', W.vel, 'm/s'], ['a', W.acc, 'm/s²']],
      'projectile': [['t', W.time, 's'], ['x', W.along, 'm'], ['y', W.height, 'm'], ['vx', 'vx', 'm/s'], ['vy', 'vy', 'm/s']],
      'circular': [['deg', W.angle, '°'], ['v', W.speed, 'm/s'], ['a', W.acc, 'm/s²'], ['Tp', W.period, 's']],
      'relative': [['t', W.time, 's'], ['vA', 'A', 'm/s'], ['vB', 'B', 'm/s'], ['rel', W.rel, 'm/s'], ['gap', W.gap, 'm']],
    }[mode];
    function readouts(st) {
      const v = Object.assign({}, st, { deg: st.th != null ? (((st.th * 180 / PI) % 360) + 360) % 360 : 0 });
      readEl.innerHTML = READ.map(([k, lab, unit]) => `<div><small>${esc(typeof lab === 'string' ? lab : t(lab))}</small><b>${num(v[k], k === 't' ? 2 : 1)}<u>${unit}</u></b></div>`).join('');
    }

    // ----- scenes -----
    function roadBack(H, roads) {
      let s = sky(H, bgUrl) + hills(roads[0].top - 26) + `<rect y="${roads[0].top - 30}" width="800" height="${H - roads[0].top + 30}" fill="url(#mo-grass)"/>`;
      roads.forEach(({ top, bot }) => { s += `<rect y="${top}" width="800" height="${bot - top}" fill="url(#mo-road)"/><line x1="0" x2="800" y1="${top + 4}" y2="${top + 4}" stroke="#F8FAFC" stroke-width="2.5"/><line x1="0" x2="800" y1="${bot - 4}" y2="${bot - 4}" stroke="#F8FAFC" stroke-width="2.5"/>`; if (bot - top > 86) s += `<line x1="0" x2="800" y1="${(top + bot) / 2}" y2="${(top + bot) / 2}" stroke="#FDE68A" stroke-width="3" stroke-dasharray="22 16"/>`; });
      return s;
    }
    function markers(top, off) {
      let out = '';
      const start = Math.floor(off / 10) * 10 - 10;
      for (let m = start; m <= off + RD.L + 10; m += 10) {
        const x = RD.X0 + (m - off) * RD.k;
        if (x < -20 || x > 820) continue;
        out += `<rect x="${(x - 3).toFixed(1)}" y="${top - 18}" width="6" height="18" rx="2" fill="#F8FAFC" stroke="#475569"/><text x="${x.toFixed(1)}" y="${top - 23}" text-anchor="middle" class="mo-stxt">${m} m</text>`;
      }
      return out;
    }
    const objWrap = (x, y, inner, extra = '', ringR = 48, ringY = -22) => `<g class="mo-obj" data-key="drag:object" role="button" tabindex="0" aria-label="${esc(t(DRAG[mode]))}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) ${extra}"><circle class="mo-ring" cx="0" cy="${ringY}" r="${ringR}"/><rect x="${-ringR}" y="${ringY - ringR}" width="${2 * ringR}" height="${2 * ringR}" fill="transparent"/>${inner}</g>`;

    function scene1d(st) {
      const ground = 262, top = 206, bot = 284;
      const x = RD.X0 + st.s * RD.k, deg = (st.s * RD.k) / 9 * 180 / PI;
      let s = roadBack(320, [{ top, bot }]) + markers(top, 0);
      const xe = RD.X0 + RD.L * RD.k;
      s += `<line x1="${xe}" x2="${xe}" y1="${top - 4}" y2="${bot + 4}" stroke="#fff" stroke-width="3" stroke-dasharray="6 6"/><rect x="${xe}" y="${top - 60}" width="3" height="60" fill="#1E293B"/><path d="M${xe + 3} ${top - 60}h30l-8 12 8 12h-30z" fill="#FF7A1A"/>`;
      if (target) { const g = plan1d(target.u, target.a).at(S.manual ? st.t : S.t); const gx = RD.X0 + g.s * RD.k; s += `<g opacity=".4" transform="translate(${gx.toFixed(1)} ${ground})">${vehicle(veh, (g.s * RD.k) / 9 * 180 / PI, false)}</g>${pill(gx, ground - 64, t(W.ghost), '#8B3DFF', '#fff')}`; }
      s += objWrap(x, ground, vehicle(veh, deg, false));
      if (isFinite(st.v) && Math.abs(st.v) > 0.05) { const len = clamp(Math.abs(st.v) * 5, 18, 150) * Math.sign(st.v); s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${ground - 52}" y2="${top - 40}" stroke="#15803D" stroke-width="1.5" stroke-dasharray="3 4" opacity=".7"/>` + arrow(x, top - 46, x + len, top - 46, '#15803D') + pill(x + len / 2, top - 56 - 10 * ZS, `v = ${num(st.v)} m/s`, '#DCFCE7', '#14532D'); }
      if (isFinite(st.a) && Math.abs(st.a) > 0.05) { const ay = top - 66 - 22 * ZS, len = clamp(Math.abs(st.a) * 12, 18, 130) * Math.sign(st.a); s += arrow(x, ay, x + len, ay, '#EA580C') + pill(x + len / 2, ay - 10 - 10 * ZS, `a = ${num(st.a, 2)} m/s²`, '#FFEDD5', '#7C2D12'); }
      if (st.s > 0.2) s += `<line x1="${RD.X0}" x2="${x.toFixed(1)}" y1="304" y2="304" stroke="#1D4ED8" stroke-width="3"/><line x1="${RD.X0}" x2="${RD.X0}" y1="297" y2="311" stroke="#1D4ED8" stroke-width="3"/><line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="297" y2="311" stroke="#1D4ED8" stroke-width="3"/>` + pill((RD.X0 + x) / 2, 304, `s = ${num(st.s)} m`, '#DBEAFE', '#1E3A8A');
      else s += pill(RD.X0, 304, t(W.start), '#DBEAFE', '#1E3A8A');
      return s;
    }
    function sceneFF(st) {
      const H = 420, G = 380, k = S.ffk || (S.ffk = ffScale());
      const pl = S.plan || plan();
      const topY = G - P.h * k, maxH = Math.max(pl.H, P.h);
      let s = sky(H, bgUrl) + hills(G - 30) + `<rect y="${G - 36}" width="800" height="${H - G + 36}" fill="url(#mo-grass)"/><rect y="${G}" width="800" height="${H - G}" fill="#15803D" opacity=".35"/>`;
      // building, floors every ~3 m
      s += `<rect x="40" y="${topY.toFixed(1)}" width="200" height="${(G - topY).toFixed(1)}" fill="url(#mo-bld)" stroke="#64748B"/><rect x="34" y="${(topY - 8).toFixed(1)}" width="212" height="10" rx="2" fill="#475569"/>`;
      for (let fy = topY + 14; fy < G - 20; fy += Math.max(16, 3 * k)) for (let fx = 56; fx < 220; fx += 44) s += `<rect x="${fx}" y="${fy.toFixed(1)}" width="24" height="${Math.min(14, Math.max(6, 1.6 * k)).toFixed(1)}" rx="2" fill="#BFDBFE" stroke="#64748B" stroke-width=".8"/>`;
      s += `<rect x="130" y="${G - 30}" width="24" height="30" rx="3" fill="#7C2D12"/>`;
      // ruler
      const step = nice(maxH / 5);
      const RX = 560;
      s += `<rect x="${RX - 6}" y="${(G - maxH * k - 10).toFixed(1)}" width="12" height="${(maxH * k + 10).toFixed(1)}" rx="3" fill="#FEF3C7" stroke="#92400E" stroke-width="1.5"/>`;
      for (let m = 0; m <= maxH + 1e-9; m += step) { const y = G - m * k; s += `<line x1="${RX - 6}" x2="${RX + 10}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#78350F" stroke-width="2"/><text x="${RX + 14}" y="${(y + 4 * ZS).toFixed(1)}" class="mo-stxt">${num(m)} m</text>`; }
      s += `<line x1="240" x2="${RX}" y1="${topY.toFixed(1)}" y2="${topY.toFixed(1)}" stroke="#1E3A8A" stroke-width="1.5" stroke-dasharray="4 4"/>` + pill(450, topY + 4 + 10 * ZS, `h₀ = ${num(P.h)} m`, '#DBEAFE', '#1E3A8A');
      if (P.u > 0 && (S.t >= pl.tA || S.done)) { const y = G - pl.H * k; s += `<circle cx="300" cy="${y.toFixed(1)}" r="4" fill="#8B3DFF"/><line x1="300" x2="${RX}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#8B3DFF" stroke-dasharray="4 4"/>` + pill(430, y - 4 - 10 * ZS, `${t(W.apex)}: ${num(pl.H)} m`, '#EFE6FF', '#4C1D95'); }
      const by = G - st.y * k;
      const sh = clamp(1 - st.y / Math.max(maxH, 1), 0.25, 1);
      s += `<ellipse cx="300" cy="${G + 2}" rx="${(16 * sh).toFixed(1)}" ry="${(4 * sh).toFixed(1)}" fill="#000" opacity=".2"/>`;
      let ball = `<circle cx="0" cy="-13" r="13" fill="url(#mo-ball)"/>`;
      if (cfg.pair) { ball += `<circle cx="44" cy="-8" r="8" fill="url(#mo-ball2)"/>`; }
      if (veh !== 'ball') ball = vehicle(veh, 0, false);
      s += objWrap(300, by, ball, '', 44, -14);
      if (cfg.pair && veh === 'ball' && S.t === 0 && !S.playing) s += pill(280, by - 14, t(W.heavy), '#FEE2E2', '#7F1D1D', 'end') + pill(358, by - 8, t(W.light), '#DBEAFE', '#1E3A8A', 'start');
      if (Math.abs(st.v) > 0.05) { const len = clamp(Math.abs(st.v) * 4, 20, 120); const dir = st.v > 0 ? -1 : 1; const ax = 270, y1 = by - 13, y2 = y1 + dir * len; s += arrow(ax, y1, ax, y2, '#15803D') + pill(ax - 8, (y1 + y2) / 2, `v = ${num(st.v)} m/s`, '#DCFCE7', '#14532D', 'end'); }
      s += pill(150, G + 20, `g = ${num(P.g, 2)} m/s² ↓`, '#FFEDD5', '#7C2D12');
      return s;
    }
    function scenePJ(st) {
      const H = 400, G = 330, X0 = 70, k = pjScale(), pl = S.plan || plan(), th = P.angle * PI / 180;
      let s = sky(H, bgUrl) + hills(G - 20) + `<rect y="${G - 24}" width="800" height="${H - G + 24}" fill="url(#mo-grass)"/><rect y="${G}" width="800" height="${H - G}" fill="#15803D" opacity=".35"/>`;
      const Rmax = P.speed * P.speed / P.g, step = nice(Rmax / 6);
      s += `<line x1="${X0}" x2="790" y1="${G}" y2="${G}" stroke="#1E293B" stroke-width="2"/>`;
      for (let m = 0; X0 + m * k <= 790; m += step) { const x = X0 + m * k; s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${G}" y2="${G + 8}" stroke="#1E293B" stroke-width="2"/><text x="${x.toFixed(1)}" y="${G + 22}" text-anchor="middle" class="mo-stxt">${num(m)} m</text>`; }
      // old shots
      S.trails.forEach((tr, i) => { const pts = tr.pts.map(([mx, my]) => `${(X0 + mx * k).toFixed(1)},${(G - 8 - my * k).toFixed(1)}`).join(' '); s += `<polyline points="${pts}" fill="none" stroke="#1E293B" stroke-opacity="${0.25 + 0.1 * i}" stroke-width="2.5" stroke-dasharray="5 5"/>` + pill(X0 + tr.R * k, G - 26 - 18 * (i % 2), `${num(tr.angle)}°, ${num(tr.speed)} m/s: ${num(tr.R)} m`, '#F1F5F9', '#334155'); });
      // current path
      if (S.t > 0 && !pl.still) { const N = 90, pts = []; for (let i = 0; i <= N; i++) { const tt = Math.min(S.t, pl.T) * i / N; const q = pl.at(tt); pts.push(`${(X0 + q.x * k).toFixed(1)},${(G - 8 - q.y * k).toFixed(1)}`); } s += `<polyline points="${pts.join(' ')}" fill="none" stroke="#1D4ED8" stroke-width="3.5" stroke-linecap="round"/>`; }
      // launcher
      s += `<rect x="46" y="${G - 22}" width="48" height="22" rx="6" fill="#475569"/><circle cx="54" cy="${G - 4}" r="7" fill="#1E293B"/><circle cx="86" cy="${G - 4}" r="7" fill="#1E293B"/>`;
      s += `<g transform="translate(${X0} ${G - 8}) rotate(${-P.angle})"><rect x="-6" y="-9" width="54" height="18" rx="7" fill="#334155"/><rect x="38" y="-10" width="12" height="20" rx="3" fill="#1E293B"/></g>`;
      const ax = X0 + 46 * Math.cos(th), ay = G - 8 - 46 * Math.sin(th);
      s += `<path d="M${X0 + 40} ${G - 8}A40 40 0 0 0 ${(X0 + 40 * Math.cos(th)).toFixed(1)} ${(G - 8 - 40 * Math.sin(th)).toFixed(1)}" fill="none" stroke="#FDE047" stroke-width="2.5" stroke-dasharray="4 3"/>` + pill(X0 + 58 * Math.cos(th / 2) + 12, G - 8 - 58 * Math.sin(th / 2), `θ = ${num(P.angle)}°`, '#FEF9C3', '#713F12');
      if (S.t === 0 && !S.playing) { const len = 36 + P.speed * 1.6; s += arrow(ax, ay, ax + len * Math.cos(th), ay - len * Math.sin(th), '#1D4ED8') + pill(ax + (len + 26) * Math.cos(th) + 20, ay - (len + 26) * Math.sin(th), `u = ${num(P.speed)} m/s`, '#DBEAFE', '#1E3A8A'); }
      if (S.t >= pl.tA && S.t > 0 && !pl.still) { const hx = X0 + (pl.R / 2) * k, hy = G - 8 - pl.H * k; s += `<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="4.5" fill="#8B3DFF"/><line x1="${hx.toFixed(1)}" x2="${hx.toFixed(1)}" y1="${hy.toFixed(1)}" y2="${G}" stroke="#8B3DFF" stroke-dasharray="4 4"/>` + pill(hx, hy - 16, `H = ${num(pl.H)} m`, '#EFE6FF', '#4C1D95'); }
      if (S.done && !pl.still) { const rx = X0 + pl.R * k; s += `<line x1="${X0}" x2="${rx.toFixed(1)}" y1="${G + 44}" y2="${G + 44}" stroke="#1D4ED8" stroke-width="3"/>` + pill((X0 + rx) / 2, G + 44, `R = ${num(pl.R)} m`, '#DBEAFE', '#1E3A8A'); }
      const bx = X0 + st.x * k, by = G - 8 - st.y * k;
      const deg = (st.x * k) / 13 * 180 / PI;
      let ball = veh === 'ball' ? `<circle cx="0" cy="0" r="13" fill="url(#mo-ball)"/><g transform="rotate(${deg.toFixed(1)})"><ellipse rx="13" ry="5" fill="none" stroke="#7F1D1D" stroke-width="1.5" opacity=".65"/></g>` : `<g transform="translate(0 8) scale(.8)">${vehicle(veh, deg, false)}</g>`;
      s += objWrap(bx, by, ball, '', 34, 0);
      if (S.playing || (S.t > 0 && !S.done)) { s += arrow(bx + 13, by, bx + 13 + clamp(st.vx * 3, 0, 100), by, '#15803D', 3) + (Math.abs(st.vy) > 0.3 ? arrow(bx, by - 13 * Math.sign(st.vy), bx, by - 13 * Math.sign(st.vy) - clamp(st.vy * 3, -100, 100), '#15803D', 3) : ''); }
      s += pill(560, 40, `g = ${num(P.g, 2)} m/s² ↓`, '#FFEDD5', '#7C2D12');
      return s;
    }
    function sceneCR(st) {
      const H = 360, cx = 400, cy = 180, R = 145;
      let s = defs() + `<rect width="800" height="${H}" fill="url(#mo-field)"/>`;
      for (let i = 0; i < 14; i++) s += `<ellipse cx="${(i * 61 + 30) % 800}" cy="${(i * 137 + 20) % 360}" rx="6" ry="3" fill="#15803D" opacity=".18"/>`;
      s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#F8FAFC" stroke-width="3" stroke-dasharray="10 8" opacity=".9"/>`;
      s += `<line x1="${cx + R - 10}" x2="${cx + R + 10}" y1="${cy}" y2="${cy}" stroke="#1E293B" stroke-width="2"/>` + pill(cx + R + 16, cy + 6 + 10 * ZS, t(W.start), '#F1F5F9', '#334155', 'start');
      const th = st.th, px = cx + R * Math.cos(th), py = cy - R * Math.sin(th);
      const vd = [-Math.sin(th), -Math.cos(th)], ad = [-Math.cos(th), Math.sin(th)];
      const degs = ((th * 180 / PI) % 360 + 360) % 360;
      const half = (degs / 2) * PI / 180;
      if (degs > 2 && ZS < 1.4) s += `<path d="M${cx + 34} ${cy}A34 34 0 ${degs > 180 ? 1 : 0} 0 ${(cx + 34 * Math.cos(th)).toFixed(1)} ${(cy - 34 * Math.sin(th)).toFixed(1)}" fill="none" stroke="#FDE047" stroke-width="2.5"/>` + pill(cx + 58 * Math.cos(half), cy - 58 * Math.sin(half), `θ = ${num(degs, 0)}°`, '#FEF9C3', '#713F12');
      let ox = px, oy = py;
      if (S.released) { const rl = S.released, dt = S.t - rl.t0; ox = rl.x + rl.vx * dt; oy = rl.y + rl.vy * dt; s += `<line x1="${rl.x.toFixed(1)}" y1="${rl.y.toFixed(1)}" x2="${(rl.x + rl.vx * 60).toFixed(1)}" y2="${(rl.y + rl.vy * 60).toFixed(1)}" stroke="#1D4ED8" stroke-width="2" stroke-dasharray="6 5"/>`; }
      else s += `<line x1="${cx}" y1="${cy}" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}" stroke="#92400E" stroke-width="2.5"/>` + pill(cx - 70 * Math.cos(th), cy + 70 * Math.sin(th), `r = ${num(P.r, 2)} m`, '#FEF3C7', '#78350F');
      s += `<circle cx="${cx}" cy="${cy}" r="9" fill="#334155" stroke="#F8FAFC" stroke-width="2"/><text x="${cx + 14}" y="${cy - 10}" class="mo-stxt">O</text>`;
      const heading = Math.atan2(vd[1], vd[0]) * 180 / PI;
      const inner = veh === 'ball' ? `<circle r="13" fill="url(#mo-ball)"/><circle r="4" cx="-4" cy="-4" fill="#fff" opacity=".5"/>` : `<g transform="rotate(${heading.toFixed(1)}) translate(0 14) scale(.75)">${vehicle(veh, (st.s * 60) / 9 * 180 / PI, false)}</g>`;
      s += objWrap(ox, oy, inner, '', 34, 0);
      if (!S.released) {
        const lv = clamp(28 + st.v * 9, 30, 120), la = clamp(14 + st.a * 6, 26, 70);
        s += arrow(ox, oy, ox + vd[0] * lv, oy + vd[1] * lv, '#15803D') + pill(ox + vd[0] * (lv + 30 * ZS), oy + vd[1] * (lv + 14 * ZS), `v = ${num(st.v, 2)} m/s`, '#DCFCE7', '#14532D');
        s += arrow(ox, oy, ox + ad[0] * la, oy + ad[1] * la, '#EA580C') + pill(ox + ad[0] * R * 0.62 - vd[0] * 16 * ZS, oy + ad[1] * R * 0.62 - vd[1] * 16 * ZS, `a = ${num(st.a, 2)} m/s²`, '#FFEDD5', '#7C2D12');
      }
      s += pill(12, 8 + 12 * ZS, `T = ${num(st.Tp, 2)} s`, '#DBEAFE', '#1E3A8A', 'start') + pill(12, 14 + 36 * ZS, `ω = ${num(st.w, 2)} rad/s`, '#DBEAFE', '#1E3A8A', 'start');
      return s;
    }
    function sceneRel(st) {
      const pl = S.plan || plan();
      const views = [{ top: 104, bot: 198, off: 0, title: W.fromGround }, { top: 320, bot: 414, off: st.xA - pl.xA0, title: W.fromA }];
      let s = roadBack(470, views.map((v) => ({ top: v.top, bot: v.bot })));
      s += `<rect y="214" width="800" height="40" fill="#064E3B" opacity=".12"/>`;
      views.forEach((v, i) => {
        s += markers(v.top, v.off) + pill(10, v.top - 34 - 12 * ZS, t(v.title), i ? '#8B3DFF' : '#1D4ED8', '#fff', 'start');
        const xa = RD.X0 + (st.xA - v.off) * RD.k, xb = RD.X0 + (st.xB - v.off) * RD.k, ya = v.top + 46, yb = v.bot - 6;
        const dA = ((st.xA - v.off) * RD.k) / 9 * 180 / PI, dB = ((st.xB - v.off) * RD.k) / 9 * 180 / PI;
        const vA = i ? 0 : st.vA, vB = i ? st.rel : st.vB;
        const fA = st.vA < 0, fB = st.vB < 0;
        const gA = `<g transform="translate(${xa.toFixed(1)} ${ya})">${vehicle(veh, dA, fA)}</g>` + pill(xa + (fA ? 1 : -1) * (VW[veh] / 2 + 4), ya - 22, 'A', '#1D4ED8', '#fff', fA ? 'start' : 'end');
        const gBin = vehicle(veh2, dB, fB);
        const gB = i ? `<g transform="translate(${xb.toFixed(1)} ${yb})">${gBin}</g>` : objWrap(xb, yb, gBin);
        s += gA + gB + pill(xb + (fB ? 1 : -1) * (VW[veh2] / 2 + 4), yb - 22, 'B', '#BE123C', '#fff', fB ? 'start' : 'end');
        if (Math.abs(vA) > 0.05) s += arrow(xa, ya + 8, xa + clamp(vA * 4, -120, 120), ya + 8, '#1D4ED8', 3);
        if (Math.abs(vB) > 0.05) s += arrow(xb, yb + 8, xb + clamp(vB * 4, -120, 120), yb + 8, '#BE123C', 3);
        if (i && Math.abs(st.gap) > 0.5) { const x1 = clamp(Math.min(xa, xb), 8, 792), x2 = clamp(Math.max(xa, xb), 8, 792); s += `<line x1="${x1.toFixed(1)}" x2="${x2.toFixed(1)}" y1="${v.bot + 28}" y2="${v.bot + 28}" stroke="#4C1D95" stroke-width="2.5" stroke-dasharray="5 4"/>` + pill((x1 + x2) / 2, v.bot + 28, `${t(W.gap)} = ${num(st.gap)} m`, '#EFE6FF', '#4C1D95'); }
      });
      return s;
    }
    const scene = (st) => (mode === 'free-fall' ? sceneFF(st) : mode === 'projectile' ? scenePJ(st) : mode === 'circular' ? sceneCR(st) : mode === 'relative' ? sceneRel(st) : scene1d(st));

    // ----- graph -----
    function drawGraph() {
      const kind = S.graph, X0 = 40 + 12 * GZ, X1 = 408, Y1 = 214 - 16 * GZ;
      let Y0 = 26;
      let lines = [], tMax = 5;
      const tNow = S.t;
      let note = '';
      if (S.manual) {
        const pts = S.manual.pts;
        tMax = target ? S.manual.T : Math.max(5, Math.ceil(S.t + 0.5));
        if (kind === 'dt') lines.push({ pts: pts.map((p) => [p.t, p.s]), cls: 'mo-ld', label: t(W.dist), live: true });
        else if (kind === 'vt') lines.push({ pts: pts.map((p) => [p.t, p.v]), cls: 'mo-lv', label: t(W.vel), live: true });
        else note = t(T('a is not measured when you move it by hand.', 'हाथ से चलाने पर a नहीं मापा जाता।'));
      } else {
        const pl = S.plan || plan();
        tMax = isFinite(pl.T) && pl.T > 0 ? pl.T : mode === 'circular' ? Math.max(2 * pl.Tp, 2) : 5;
        const N = 120, defsL = LINES[mode][kind];
        lines = defsL.map((d) => ({ pts: [], cls: d[1], label: typeof d[2] === 'string' ? d[2] : t(d[2]), dash: !!d[3], live: true }));
        for (let i = 0; i <= N; i++) { const tt = tMax * i / N, st = pl.at(tt); defsL.forEach((d, j) => lines[j].pts.push([tt, st[d[0]]])); }
      }
      if (target) {
        const tp = plan1d(target.u, target.a), N = 120, pts = [];
        tMax = Math.max(tMax, tp.T);
        for (let i = 0; i <= N; i++) { const tt = tp.T * i / N, st = tp.at(tt); pts.push([tt, kind === 'dt' ? st.s : kind === 'vt' ? st.v : st.a]); }
        lines.push({ pts, cls: 'mo-lt', label: t(W.target), dash: true, full: true });
      }
      if (lines.length > 1) Y0 = 30 + 16 * GZ;
      let ys = []; lines.forEach((l) => l.pts.forEach((p) => { if (isFinite(p[1])) ys.push(p[1]); }));
      let yMin = Math.min(0, ...ys), yMax = Math.max(0, ...ys);
      if (!isFinite(yMin)) yMin = 0; if (!isFinite(yMax)) yMax = 0;
      if (yMax - yMin < 1e-9) yMax = yMin + 1;
      const yStep = nice((yMax - yMin) / 4);
      yMin = Math.floor(yMin / yStep + 1e-9) * yStep; yMax = Math.ceil(yMax / yStep - 1e-9) * yStep; if (yMax <= yMin) yMax = yMin + yStep;
      const tStep = nice(tMax / 5), tTop = Math.max(tStep, Math.ceil(tMax / tStep - 1e-9) * tStep);
      const px = (tt) => X0 + (tt / tTop) * (X1 - X0), py = (y) => Y1 - ((y - yMin) / (yMax - yMin)) * (Y1 - Y0);
      let out = '';
      for (let v = yMin; v <= yMax + 1e-9; v += yStep) out += `<line class="mo-ggrid" x1="${X0}" x2="${X1}" y1="${py(v).toFixed(1)}" y2="${py(v).toFixed(1)}"/><text class="mo-gtxt" x="${X0 - 6}" y="${(py(v) + 4).toFixed(1)}" text-anchor="end">${num(v, 2)}</text>`;
      for (let v = 0; v <= tTop + 1e-9; v += tStep) out += `<line class="mo-ggrid" x1="${px(v).toFixed(1)}" x2="${px(v).toFixed(1)}" y1="${Y0}" y2="${Y1}"/><text class="mo-gtxt" x="${px(v).toFixed(1)}" y="${(Y1 + 4 + 11 * GZ).toFixed(1)}" text-anchor="middle">${num(v, 2)}</text>`;
      out += `<line class="mo-gax" x1="${X0}" x2="${X1}" y1="${py(0).toFixed(1)}" y2="${py(0).toFixed(1)}"/><line class="mo-gax" x1="${X0}" x2="${X0}" y1="${Y0}" y2="${Y1}"/>`;
      lines.forEach((l) => {
        const pts = l.full ? l.pts : l.pts.filter((p) => p[0] <= tNow + 1e-9);
        if (pts.length >= 2) out += `<path class="mo-line ${l.cls}" d="${pts.map((p, i) => `${i ? 'L' : 'M'}${px(p[0]).toFixed(1)} ${py(p[1]).toFixed(1)}`).join('')}"${l.dash ? ' stroke-dasharray="7 5"' : ''}/>`;
        if (l.live && pts.length && tNow > 0) { const q = pts[pts.length - 1]; out += `<circle class="mo-dot ${l.cls}" cx="${px(q[0]).toFixed(1)}" cy="${py(q[1]).toFixed(1)}" r="5"/>`; }
      });
      if (mode === 'circular' && !S.manual) { const Tp = (S.plan || plan()).Tp; for (let m = Tp; m <= tTop; m += Tp) out += `<line x1="${px(m).toFixed(1)}" x2="${px(m).toFixed(1)}" y1="${Y0}" y2="${Y1}" class="mo-lt" stroke-dasharray="3 4" opacity=".7"/><text class="mo-gtxt" x="${px(m).toFixed(1)}" y="${Y0 - 4}" text-anchor="middle">${m / Tp > 1 ? num(m / Tp, 0) + 'T' : 'T'}</text>`; }
      const title = kind === 'dt' && mode === 'free-fall' ? t(T('Height–time', 'ऊँचाई–समय')) : kind === 'dt' && (mode === 'projectile' || mode === 'relative') ? t(T('Position–time', 'स्थिति–समय')) : t(W.gTitle[kind]);
      out += `<text class="mo-gttl" x="${X0}" y="${(4 + 11 * GZ).toFixed(1)}">${esc(title)}</text>`;
      out += `<text class="mo-gtxt" x="${(X0 + X1) / 2}" y="${(Y1 + 8 + 23 * GZ).toFixed(1)}" text-anchor="middle">${esc(t(W.tAxis))}</text>`;
      const yl = kind === 'dt' ? (mode === 'free-fall' ? 'h' : mode === 'projectile' ? 'x, y' : mode === 'relative' ? 'x' : mode === 'circular' ? 's' : 'd') : kind === 'vt' ? 'v' : 'a';
      out += `<text class="mo-gtxt" transform="translate(${(4 + 9 * GZ).toFixed(1)} ${(Y0 + Y1) / 2}) rotate(-90)" text-anchor="middle">${yl} (${UNIT[kind]})</text>`;
      if (lines.length > 1) { let lx = X0; const ly = 12 + 15 * GZ; lines.forEach((l) => { const w = (l.label.length * 6.2 + 22) * GZ; out += `<rect class="mo-sw ${l.cls}" x="${lx.toFixed(1)}" y="${(ly - 9 * GZ).toFixed(1)}" width="${(11 * GZ).toFixed(1)}" height="${(11 * GZ).toFixed(1)}" rx="3"/><text class="mo-gtxt" x="${(lx + 15 * GZ).toFixed(1)}" y="${ly.toFixed(1)}">${esc(l.label)}</text>`; lx += w; }); }
      if (!note && !target && !S.manual && tNow === 0 && !S.playing) note = t(T('Press ▶ and watch the graph draw itself', '▶ दबाओ और ग्राफ़ को अपने-आप बनते देखो'));
      if (note) out += `<text class="mo-gtxt" style="font-weight:700" x="${(X0 + X1) / 2}" y="${(Y0 + Y1) / 2}" text-anchor="middle">${esc(note)}</text>`;
      gsvg.innerHTML = out;
      gsvg.setAttribute('aria-label', title);
    }

    // ----- formulas with the live numbers -----
    const row = (f, val) => `<div class="mo-f"><b>${f}</b><span>${val}</span></div>`;
    const pm = (x) => (x < 0 ? '− ' : '+ ') + num(Math.abs(x), 2);
    function formula(st) {
      let h = '';
      if (mode === '1d' || mode === 'graph-match') {
        if (S.manual) h = row(t(T('By hand', 'हाथ से')), esc(t(T('The graph records what your finger did: the slope of d–t is the speed.', 'ग्राफ़ वही दर्ज करता है जो तुम्हारी उँगली ने किया: d–t का ढाल ही चाल है।'))));
        else {
          const { u, a } = P, tt = st.t;
          h = row('v = u + at', `v = ${num(u)} ${pm(a)} × ${num(tt, 2)} = <strong>${num(st.v)} m/s</strong>`)
            + row('s = ut + ½at²', `s = ${num(u)} × ${num(tt, 2)} ${pm(a / 2)} × ${num(tt, 2)}² = <strong>${num(st.s)} m</strong>`)
            + row('v² = u² + 2as', `${num(st.v * st.v)} = ${num(u * u)} ${pm(2 * a)} × ${num(st.s)}`);
        }
        if (target) h += row(esc(t(W.target)), S.matchedOnce ? `u = ${num(target.u)} m/s, a = ${num(target.a, 2)} m/s²` : esc(t(T('hidden until you match it', 'मिलाने तक छिपा हुआ'))));
      } else if (mode === 'free-fall') {
        const { u, g, h: h0 } = P, pl = S.plan || plan(), tt = st.t;
        h = row('v = u − gt', `v = ${num(u)} − ${num(g, 2)} × ${num(tt, 2)} = <strong>${num(st.v)} m/s</strong>`)
          + row('h = h₀ + ut − ½gt²', `h = ${num(h0)} ${pm(u)} × ${num(tt, 2)} − ½ × ${num(g, 2)} × ${num(tt, 2)}² = <strong>${num(st.y)} m</strong>`)
          + (S.done ? row(esc(t(T('Time to land', 'गिरने में समय'))), `t = (u + √(u² + 2gh₀)) / g = <strong>${num(pl.T, 2)} s</strong>`) : '');
      } else if (mode === 'projectile') {
        const pl = S.plan || plan();
        const seen = (e) => S.fired.has(e) || S.done;
        h = row('T = 2u sinθ / g', seen('landed') ? `T = <strong>${num(pl.T, 2)} s</strong>` : esc(t(T('time of flight: launch to see', 'उड़ान का समय: छोड़कर देखो'))))
          + row('H = u² sin²θ / 2g', seen('max-height') ? `H = <strong>${num(pl.H)} m</strong>` : esc(t(T('maximum height', 'अधिकतम ऊँचाई'))))
          + row('R = u² sin2θ / g', seen('range') ? `R = <strong>${num(pl.R)} m</strong>` : esc(t(T('range', 'परास'))));
      } else if (mode === 'circular') {
        h = row('a = v² / r', `a = ${num(st.v, 2)}² / ${num(P.r, 2)} = <strong>${num(st.a, 2)} m/s²</strong>`)
          + row('T = 2πr / v', `T = 2π × ${num(P.r, 2)} / ${num(st.v, 2)} = <strong>${num(st.Tp, 2)} s</strong>`)
          + row('ω = v / r', `ω = <strong>${num(st.w, 2)} rad/s</strong>, f = 1/T = ${num(1 / st.Tp, 2)} Hz`);
      } else {
        const pl = S.plan || plan();
        h = row('v<sub>BA</sub> = v<sub>B</sub> − v<sub>A</sub>', `${num(st.vB)} − (${num(st.vA)}) = <strong>${num(st.rel)} m/s</strong>`)
          + row(esc(t(T('gap', 'दूरी'))) + ' = gap₀ + v<sub>BA</sub> t', `${num(pl.xB0 - pl.xA0)} ${pm(st.rel)} × ${num(st.t, 2)} = <strong>${num(st.gap)} m</strong>`)
          + (pl.meet ? row(esc(t(T('Side by side at', 'आमने-सामने होंगे'))), `t = <strong>${num(pl.meet, 2)} s</strong>`) : '');
      }
      formEl.innerHTML = h;
    }

    function render() {
      const had = document.activeElement && root.contains(document.activeElement) && document.activeElement.classList.contains('mo-obj');
      const st = cur();
      const sw = svg.getBoundingClientRect().width, gw = gsvg.getBoundingClientRect().width;
      ZS = sw > 0 ? clamp(620 / sw, 1, 2) : 1; GZ = gw > 0 ? clamp(330 / gw, 1, 1.45) : 1;
      svg.style.setProperty('--mo-z', ZS.toFixed(3)); gsvg.style.setProperty('--mo-gz', GZ.toFixed(3));
      readouts(st); svg.innerHTML = scene(st); drawGraph(); formula(st);
      playBtn.textContent = (S.playing ? '❚❚ ' : '▶ ') + t(playWord());
      playBtn.classList.toggle('on', S.playing);
      if (had) { const o = root.querySelector('.mo-obj'); if (o) o.focus({ preventScroll: true }); }
    }

    // ----- run loop -----
    function stopRun(keepDone) {
      if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0;
      S.playing = false; if (!keepDone) { S.done = false; S.t = 0; S.fired = new Set(); S.plan = null; S.released = null; }
      if (S.manual) manualEnd(false, true);
    }
    function onEvent(ev) {
      const pl = S.plan;
      if (mode === '1d') {
        const st = pl.at(pl.T);
        if (ev.e === 'stopped') live(pl.end === 'end' ? T(`It reached the end of the road: ${num(st.s)} m in ${num(pl.T, 2)} s.`, `सड़क के अंत तक पहुँच गई: ${num(st.s)} m, ${num(pl.T, 2)} s में।`) : pl.end === 'brake' ? T(`It slowed to a stop after ${num(pl.T, 2)} s, covering ${num(st.s)} m.`, `${num(pl.T, 2)} s बाद रुक गई, ${num(st.s)} m चलकर।`) : T(`20 s are up: ${num(st.s)} m covered, now moving at ${num(st.v)} m/s.`, `20 s पूरे: ${num(st.s)} m तय हुए, अब चाल ${num(st.v)} m/s।`));
      } else if (mode === 'free-fall') {
        if (ev.e === 'max-height') live(T(`Highest point ${num(pl.H)} m at ${num(pl.tA, 2)} s: for an instant the velocity is 0, but g still pulls down.`, `सबसे ऊँचा बिंदु ${num(pl.H)} m, ${num(pl.tA, 2)} s पर: एक पल के लिए वेग 0 है, पर g अब भी नीचे खींचता है।`));
        if (ev.e === 'landed') live(T(`Landed after ${num(pl.T, 2)} s, hitting the ground at ${num(-pl.vLand)} m/s.${cfg.pair ? ' Both balls land together: with no air, mass does not matter.' : ''}`, `${num(pl.T, 2)} s बाद ज़मीन पर गिरी, ${num(-pl.vLand)} m/s की चाल से।${cfg.pair ? ' दोनों गेंदें साथ गिरीं: हवा न हो तो द्रव्यमान से फ़र्क नहीं पड़ता।' : ''}`), true);
      } else if (mode === 'projectile') {
        const vx = P.speed * Math.cos(P.angle * PI / 180);
        if (ev.e === 'max-height') live(T(`Highest point H = ${num(pl.H)} m at t = ${num(pl.tA, 2)} s: here vy = 0 while vx stays ${num(vx)} m/s.`, `सबसे ऊँचा बिंदु H = ${num(pl.H)} m, t = ${num(pl.tA, 2)} s पर: यहाँ vy = 0 है, पर vx ${num(vx)} m/s ही रहता है।`));
        if (ev.e === 'range') live(T(`Landed: range R = ${num(pl.R)} m, time of flight T = ${num(pl.T, 2)} s, highest point H = ${num(pl.H)} m.`, `गिरी: परास R = ${num(pl.R)} m, उड़ान का समय T = ${num(pl.T, 2)} s, अधिकतम ऊँचाई H = ${num(pl.H)} m।`), true);
      } else if (mode === 'relative') {
        if (ev.e === 'stopped') { const st = pl.at(pl.T); live(T(`Run over after ${num(pl.T, 2)} s. The gap is now ${num(st.gap)} m.`, `${num(pl.T, 2)} s बाद दौड़ ख़त्म। अब बीच की दूरी ${num(st.gap)} m है।`)); }
      }
      api.emit(ev.e);
      if (ev.e === 'landed' || ev.e === 'stopped') api.record(t(T(`Finished at t = ${num(S.t, 2)} s`, `t = ${num(S.t, 2)} s पर पूरा हुआ`)));
    }
    function fireEvents() { (S.plan.events || []).forEach((ev) => { if (!S.fired.has(ev.e) && S.t >= ev.t - 1e-9) { S.fired.add(ev.e); onEvent(ev); } }); }
    function finish() {
      S.t = Math.min(S.t, S.plan.T); S.playing = false; S.done = true; S.raf = 0;
      fireEvents(); render();
      if (target) evaluateMatch(false);
    }
    function frame(now) {
      if (!S.playing) return;
      const dt = Math.min(0.1, (now - S.last) / 1000); S.last = now; S.t += dt;
      if (S.released) { if (S.t - S.released.t0 > S.released.dur) { S.playing = false; S.done = true; S.raf = 0; render(); live(T('The string is let go: with no force towards the centre the stone flies off in a straight line, along the tangent.', 'डोरी छोड़ दी: केंद्र की ओर बल न रहने पर पत्थर स्पर्श-रेखा की दिशा में सीधी रेखा में उड़ गया।'), true); api.emit('stopped'); return; } render(); S.raf = requestAnimationFrame(frame); return; }
      if (S.t >= S.plan.T) { finish(); return; }
      fireEvents(); render();
      S.raf = requestAnimationFrame(frame);
    }
    function play() {
      if (S.playing) { pause(); return; }
      if (S.manual) manualEnd(false, true);
      if (S.done) { if (mode === 'projectile' && S.plan && !S.plan.still) pushTrail(); S.done = false; S.t = 0; S.fired = new Set(); S.released = null; if (mode === 'circular') S.turns = 0; }
      S.plan = plan();
      if (S.plan.still || S.plan.T === 0) { api.toast(mode === 'projectile' ? T('Point it up a little: at 0° it lands at once.', 'थोड़ा ऊपर करो: 0° पर वह तुरंत गिर जाती है।') : T('Nothing moves yet: give it a speed or an acceleration first.', 'अभी कुछ नहीं चलता: पहले चाल या त्वरण दो।')); S.plan = null; return; }
      S.playing = true;
      api.emit('moving');
      if (mode === '1d' || mode === 'graph-match') { live(T(`Started with u = ${num(P.u)} m/s and a = ${num(P.a, 2)} m/s². Watch the graph being drawn from the same motion.`, `u = ${num(P.u)} m/s और a = ${num(P.a, 2)} m/s² से शुरू। देखो, ग्राफ़ इसी गति से बन रहा है।`)); api.record(t(T(`Played with u = ${num(P.u)}, a = ${num(P.a, 2)}`, `u = ${num(P.u)}, a = ${num(P.a, 2)} से चलाया`))); }
      else if (mode === 'free-fall') { live(P.u > 0 ? T(`Thrown up at ${num(P.u)} m/s from ${num(P.h)} m: it slows by ${num(P.g, 2)} m/s every second, stops for an instant, then falls.`, `${num(P.h)} m से ${num(P.u)} m/s से ऊपर फेंकी: हर सेकंड ${num(P.g, 2)} m/s धीमी होती है, एक पल रुकती है, फिर गिरती है।`) : T(`Dropped from ${num(P.h)} m: its speed grows by ${num(P.g, 2)} m/s every second.`, `${num(P.h)} m से गिराई: हर सेकंड चाल ${num(P.g, 2)} m/s बढ़ती है।`)); api.record(t(T(`Dropped from ${num(P.h)} m with u = ${num(P.u)}`, `${num(P.h)} m से गिराया, u = ${num(P.u)}`))); }
      else if (mode === 'projectile') { live(T(`Launched at ${num(P.speed)} m/s, ${num(P.angle)}°. Sideways it keeps vx = ${num(P.speed * Math.cos(P.angle * PI / 180))} m/s; up and down, g acts.`, `${num(P.speed)} m/s, ${num(P.angle)}° पर छोड़ी। आगे की ओर vx = ${num(P.speed * Math.cos(P.angle * PI / 180))} m/s बना रहता है; ऊपर-नीचे g काम करता है।`)); api.record(t(T(`Launched at ${num(P.speed)} m/s, ${num(P.angle)}°`, `${num(P.speed)} m/s, ${num(P.angle)}° पर छोड़ा`))); }
      else if (mode === 'circular') { live(T(`Speed stays ${num(P.speed, 2)} m/s, but the direction keeps changing, so there is an acceleration a = v²/r = ${num(S.plan.a, 2)} m/s² towards the centre.`, `चाल ${num(P.speed, 2)} m/s ही रहती है, पर दिशा बदलती रहती है, इसलिए केंद्र की ओर त्वरण a = v²/r = ${num(S.plan.a, 2)} m/s² है।`)); api.record(t(T(`Whirled at ${num(P.speed, 2)} m/s`, `${num(P.speed, 2)} m/s से घुमाया`))); }
      else { const rel = P.speed - P.u; live(rel > 0 ? T(`Seen from A, B pulls ahead at ${num(rel)} m/s.`, `A से देखने पर B ${num(rel)} m/s से आगे निकलता है।`) : rel < 0 && P.speed < 0 && P.u >= 0 ? T(`B comes towards A at ${num(-rel)} m/s: when they move opposite ways, the speeds add.`, `B, A की ओर ${num(-rel)} m/s से आता है: उल्टी दिशा में चलने पर चालें जुड़ जाती हैं।`) : rel < 0 ? T(`Seen from A, B falls behind at ${num(-rel)} m/s.`, `A से देखने पर B ${num(-rel)} m/s से पीछे छूटता है।`) : T('Same velocity: seen from A, B does not move at all.', 'एक-सा वेग: A से देखने पर B बिल्कुल नहीं हिलता।')); api.record(t(T(`Played A = ${num(P.u)}, B = ${num(P.speed)} m/s`, `A = ${num(P.u)}, B = ${num(P.speed)} m/s से चलाया`))); }
      if (reduced() || !window.requestAnimationFrame) { if (mode === 'circular') { S.t = S.plan.Tp * 0.75; S.playing = false; render(); return; } S.t = S.plan.T; finish(); return; }
      S.last = performance.now(); S.raf = requestAnimationFrame(frame);
    }
    function pause() {
      S.playing = false; if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0; render();
      if (mode === 'circular') { const n = Math.floor(S.t / S.plan.Tp); live(T(`Paused after ${n} full turn${n === 1 ? '' : 's'}: one turn takes T = ${num(S.plan.Tp, 2)} s.`, `${n} पूरे चक्कर के बाद रुका: एक चक्कर में T = ${num(S.plan.Tp, 2)} s लगते हैं।`)); api.emit('stopped'); }
      api.record(t(T(`Paused at t = ${num(S.t, 2)} s`, `t = ${num(S.t, 2)} s पर रोका`)));
    }
    function pushTrail() {
      const pl = S.plan, N = 60, pts = [];
      for (let i = 0; i <= N; i++) { const q = pl.at(pl.T * i / N); pts.push([q.x, q.y]); }
      S.trails.push({ pts, angle: P.angle, speed: P.speed, R: pl.R, H: pl.H });
      if (S.trails.length > 4) S.trails.shift();
    }
    function reset() {
      stopRun(false);
      S.trails = []; S.theta0 = 0; S.gapB = 12; S.ffk = 0; S.turns = 0; S.matchedOnce = S.matchedOnce && false;
      if (mode === 'graph-match') { P.u = target.u === 0 ? 5 : 0; P.a = 0; syncSliders(); }
      live(INTRO[mode]); render();
      api.record(t(T('Reset', 'शुरू से किया')));
    }
    function release() {
      if (mode !== 'circular') return;
      if (!S.playing || S.released) { api.toast(T('Whirl it first, then let go.', 'पहले घुमाओ, फिर छोड़ो।')); return; }
      const st = cur(), cx = 400, cy = 180, R = 145;
      const x = cx + R * Math.cos(st.th), y = cy - R * Math.sin(st.th), pxs = (R / P.r) * st.v;   // px per second along the tangent
      S.released = { t0: S.t, x, y, vx: -Math.sin(st.th) * pxs, vy: -Math.cos(st.th) * pxs, dur: 1.6 };
      // Stop while the stone is still on the field: until it reaches the edge of the picture.
      const room = (d, p, lo, hi) => (d > 1e-9 ? (hi - p) / d : d < -1e-9 ? (lo - p) / d : Infinity);
      S.released.dur = Math.max(0.3, Math.min(1.6, room(S.released.vx, x, 20, 780), room(S.released.vy, y, 20, 340)));
      api.record(t(T('Let go of the string', 'डोरी छोड़ दी')));
      if (reduced()) { S.t = S.released.t0 + S.released.dur; S.playing = false; S.done = true; render(); api.emit('stopped'); }
    }

    // ----- graph matching -----
    function evaluateMatch(byHand) {
      const tp = plan1d(target.u, target.a);
      let rms = 0, n = 0;
      if (byHand) { const pts = S.manual.pts; pts.forEach((p) => { const d = p.s - tp.at(p.t).s; rms += d * d; n++; }); }
      else { const mine = plan1d(P.u, P.a); for (let i = 0; i <= 60; i++) { const tt = tp.T * i / 60; const d = mine.at(tt).s - tp.at(tt).s; rms += d * d; n++; } }
      rms = Math.sqrt(rms / Math.max(1, n));
      const ok = rms <= (byHand ? 0.09 : 0.03) * RD.L;
      if (ok) {
        S.matchedOnce = true;
        live(T(`Matched! Your motion is the target: u = ${num(target.u)} m/s, a = ${num(target.a, 2)} m/s².`, `मिल गया! तुम्हारी गति लक्ष्य जैसी है: u = ${num(target.u)} m/s, a = ${num(target.a, 2)} m/s²।`), true);
        api.celebrate(); api.speak(T('Matched!', 'मिल गया!')); api.record(t(T('Matched the target graph', 'लक्ष्य ग्राफ़ से मिला दिया'))); api.emit('matched'); formula(cur());
        return;
      }
      if (byHand) live(T('Not yet: your line strays from the target. Try again, keeping up with the ghost car.', 'अभी नहीं: तुम्हारी रेखा लक्ष्य से हटती है। फिर कोशिश करो, छाया-कार के साथ-साथ चलो।'));
      else {
        const du = P.u - target.u, da = P.a - target.a;
        const hint = Math.abs(du) > 0.5 ? (du > 0 ? T('The start is too fast: lower u.', 'शुरुआत बहुत तेज़ है: u घटाओ।') : T('The start is too slow: raise u.', 'शुरुआत धीमी है: u बढ़ाओ।')) : da > 0 ? T('The curve bends up too much: lower a.', 'वक्र ज़्यादा ऊपर मुड़ता है: a घटाओ।') : T('The curve does not bend up enough: raise a.', 'वक्र उतना ऊपर नहीं मुड़ता: a बढ़ाओ।');
        live(T('Not yet. ' + hint.en, 'अभी नहीं। ' + hint.hi));
      }
      api.record(t(T('Did not match yet', 'अभी नहीं मिला')));
    }

    // ----- moving the object by hand -----
    function manualStart() {
      if (S.manual && S.manual.on) return;
      stopRun(false);
      S.manual = { on: true, t0: performance.now(), pts: [], s: 0, T: target ? plan1d(target.u, target.a).T : 15, raf: 0, byHand: true };
      S.manual.raf = requestAnimationFrame(manualFrame);
    }
    function manualFrame(now) {
      const m = S.manual; if (!m || !m.on) return;
      const tt = (now - m.t0) / 1000;
      // Speed from the change in position over the last 0.4 s, smoothed so the v–t line is readable.
      let raw = 0; for (let i = m.pts.length - 1; i >= 0; i--) { if (tt - m.pts[i].t >= 0.4) { raw = (m.s - m.pts[i].s) / (tt - m.pts[i].t); break; } }
      const prev = m.pts.length ? m.pts[m.pts.length - 1].v : 0, v = prev + (raw - prev) * 0.18;
      m.pts.push({ t: tt, s: m.s, v });
      S.t = tt; render();
      if (tt >= m.T) { manualEnd(true, false); return; }
      m.raf = requestAnimationFrame(manualFrame);
    }
    function manualEnd(windowOver, silent) {
      const m = S.manual; if (!m) return;
      if (m.raf) cancelAnimationFrame(m.raf); m.raf = 0; m.on = false;
      if (silent) { S.manual = null; S.t = 0; return; }
      const last = m.pts[m.pts.length - 1] || { t: 0, s: m.s };
      if (target) { if (windowOver) evaluateMatch(true); }
      else if (last.t > 0.3) live(T(`You moved it by hand: ${num(last.s)} m in ${num(last.t, 2)} s, average speed ${num(last.s / last.t)} m/s. A steep d–t line means fast; flat means stopped.`, `तुमने हाथ से चलाया: ${num(last.t, 2)} s में ${num(last.s)} m, औसत चाल ${num(last.s / last.t)} m/s। d–t की खड़ी रेखा मतलब तेज़; सपाट मतलब रुकी हुई।`));
      render();
    }
    const toSvg = (e) => { const r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left) * 800 / r.width, y: (e.clientY - r.top) * VB / r.height }; };
    function dragTo(p) {
      if (mode === '1d' || mode === 'graph-match') { S.manual.s = clamp((p.x - RD.X0) / RD.k, 0, RD.L); }
      else if (mode === 'free-fall') { const k = S.ffk || (S.ffk = ffScale()); P.h = clamp(Math.round((380 - p.y) / k * 2) / 2, 1, Math.min(60, 330 / k)); S.plan = null; }
      else if (mode === 'projectile') { const ang = Math.atan2(322 - p.y, p.x - 70) * 180 / PI; P.angle = clamp(Math.round(ang), 0, 90); sliderEl('angle').value = P.angle; syncSliders(); S.plan = null; }
      else if (mode === 'circular') { const th = Math.atan2(180 - p.y, p.x - 400); S.theta0 = th - (P.speed / P.r) * S.t; S.plan = null; }
      else { S.gapB = clamp(Math.round((p.x - RD.X0) / RD.k - 6), -6, RD.L - 6); S.plan = null; }
      render();
    }
    function dragStart() {
      if (S.playing) pause();
      if (mode === '1d' || mode === 'graph-match') { if (!S.manual || !S.manual.on) manualStart(); }
      else if (S.t > 0 || S.done) { stopRun(false); if (mode === 'circular') S.theta0 = cur().th; }
      S.drag = { moved: false };
    }
    function dragMove(p) {
      if (!S.drag) return;
      dragTo(p);
      if (!S.drag.moved) { S.drag.moved = true; api.emit('moving'); }
    }
    function dragEnd() {
      if (!S.drag) return;
      const moved = S.drag.moved; S.drag = null;
      if (mode === '1d' && S.manual) manualEnd(false, false);
      if (mode === 'free-fall') { S.ffk = 0; api.record(t(T(`Set the height to ${num(P.h)} m`, `ऊँचाई ${num(P.h)} m की`))); }
      if (mode === 'projectile') api.record(t(T(`Set the angle to ${num(P.angle)}°`, `कोण ${num(P.angle)}° किया`)));
      if (moved) api.emit('stopped');
      render();
    }
    svg.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('[data-key="drag:object"]');
      if (!g) return;
      if (!api.allowed('drag:object')) { api.nudge('drag:object'); return; }
      e.preventDefault();
      try { svg.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      dragStart();
      if (mode !== '1d' && mode !== 'graph-match') dragMove(toSvg(e));
    });
    svg.addEventListener('pointermove', (e) => { if (S.drag) { e.preventDefault(); dragMove(toSvg(e)); } });
    const up = (e) => { if (S.drag) { try { svg.releasePointerCapture(e.pointerId); } catch (x) { /* ignore */ } dragEnd(); } };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
    svg.addEventListener('keydown', (e) => {
      const g = e.target.closest && e.target.closest('[data-key="drag:object"]');
      if (!g || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      if (!api.allowed('drag:object')) { api.nudge('drag:object'); return; }
      const dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0, dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      if (!S.drag) dragStart();
      const st = cur();
      let p;
      if (mode === '1d' || mode === 'graph-match') p = { x: RD.X0 + (S.manual.s + dx) * RD.k, y: 0 };
      else if (mode === 'free-fall') { const k = S.ffk || (S.ffk = ffScale()); p = { x: 300, y: 380 - (P.h - dy) * k }; }
      else if (mode === 'projectile') { const a = clamp(P.angle + (dx || -dy) * 5, 0, 90) * PI / 180; p = { x: 70 + 100 * Math.cos(a), y: 322 - 100 * Math.sin(a) }; }
      else if (mode === 'circular') { const th = st.th + (dx || -dy) * 5 * PI / 180; p = { x: 400 + 100 * Math.cos(th), y: 180 - 100 * Math.sin(th) }; }
      else p = { x: RD.X0 + (S.gapB + 6 + dx) * RD.k, y: 0 };
      dragMove(p);
      clearTimeout(S.keyTimer); S.keyTimer = setTimeout(dragEnd, 700);
    });

    // ----- controls -----
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-key]');
      if (!el || el.tagName === 'INPUT') return;
      const key = el.dataset.key;
      if (key === 'drag:object') return;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key === 'play') play();
      else if (key === 'reset') reset();
      else if (key === 'release') release();
      else if (key === 'graph') {
        const b = e.target.closest('[data-g]'); if (!b) return;
        S.graph = b.dataset.g;
        root.querySelectorAll('.mo-tab').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        drawGraph(); api.emit('graph:' + S.graph); api.record(t(T(`Looked at the ${S.graph === 'dt' ? 'd–t' : S.graph === 'vt' ? 'v–t' : 'a–t'} graph`, `${S.graph === 'dt' ? 'd–t' : S.graph === 'vt' ? 'v–t' : 'a–t'} ग्राफ़ देखा`)));
      }
    });
    sliders.forEach((s) => {
      const inp = sliderEl(s.k);
      inp.addEventListener('input', () => {
        const key = 'slider:' + s.k;
        if (!api.allowed(key)) { api.nudge(key); inp.value = P[s.k]; return; }
        const v = parseFloat(inp.value);
        if (mode === 'circular') { const st = cur(); P.speed = v; S.theta0 = st.th - (v / P.r) * S.t; S.plan = S.playing ? planCR() : null; }
        else { P[s.k] = v; stopRun(false); if (!S.done) live(INTRO[mode]); }
        S.ffk = 0;
        syncSliders(); render();
      });
      inp.addEventListener('change', () => api.record(t(T(`Set ${s.k} = ${num(P[s.k], 2)} ${s.unit}`, `${s.k} = ${num(P[s.k], 2)} ${s.unit} किया`))));
    });
    // Scrub a finished run by touching the graph.
    const scrub = (e) => {
      if (S.playing || S.manual || !S.plan || !S.done || mode === 'circular') return;
      if (!api.allowed('graph')) return;
      const r = gsvg.getBoundingClientRect(); const x = (e.clientX - r.left) * 420 / r.width;
      const pl = S.plan, tStep = nice(pl.T / 5), tTop = Math.max(tStep, Math.ceil(pl.T / tStep - 1e-9) * tStep);
      const gx0 = 40 + 12 * GZ; S.t = clamp(((x - gx0) / (408 - gx0)) * tTop, 0, pl.T); render();
    };
    gsvg.addEventListener('pointerdown', (e) => { scrub(e); S.scrubbing = true; });
    gsvg.addEventListener('pointermove', (e) => { if (S.scrubbing) scrub(e); });
    gsvg.addEventListener('pointerup', () => { S.scrubbing = false; });
    gsvg.addEventListener('pointerleave', () => { S.scrubbing = false; });

    syncSliders();
    render();
    let ro = null;
    if (window.ResizeObserver) { let lastW = 0; ro = new ResizeObserver(() => { const w = Math.round(svg.getBoundingClientRect().width); if (w && Math.abs(w - lastW) > 8) { lastW = w; if (!S.playing && !(S.manual && S.manual.on)) render(); } }); ro.observe(root); }
    return { destroy() { if (ro) ro.disconnect(); stopRun(false); if (S.manual && S.manual.raf) cancelAnimationFrame(S.manual.raf); clearTimeout(S.keyTimer); } };
  }

  NCA_T.register({
    id: 'motion',
    css: CSS,
    validate(c) {
      const e = [];
      if (!c || typeof c !== 'object') return ['config must be an object'];
      if (!MODES.includes(c.mode)) return ['mode: one of ' + MODES.join(', ')];
      Object.keys(c).forEach((k) => { if (!KEYS.includes(k)) e.push('unknown key: ' + k); });
      if (c.vehicle != null && !VEH.includes(c.vehicle)) e.push('vehicle: one of ' + VEH.join(', '));
      if (c.vehicle2 != null && !VEH.includes(c.vehicle2)) e.push('vehicle2: one of ' + VEH.join(', '));
      ['u', 'a', 'angle', 'speed', 'g', 'h', 'r'].forEach((k) => {
        if (c[k] == null) return;
        const used = RANGE[c.mode][k], r = used || ANY[k];
        if (typeof c[k] !== 'number' || !isFinite(c[k])) e.push(k + ': a number');
        else if (c[k] < r[0] || c[k] > r[1]) e.push(`${k}: ${r[0]} to ${r[1]}${used ? '' : ' (not used in mode ' + c.mode + ')'}`);
      });
      if (c.pair != null && typeof c.pair !== 'boolean') e.push('pair: true or false');
      if (c.match != null && !['dt', 'vt'].includes(c.match)) e.push("match: 'dt' or 'vt'");
      if (c.mode === 'graph-match') { const u = c.u == null ? DEF['graph-match'].u : c.u, a = c.a == null ? DEF['graph-match'].a : c.a; if (typeof u === 'number' && typeof a === 'number' && u <= 0 && a <= 0) e.push('graph-match: the target must move (u > 0 or a > 0)'); }
      if (c.mode === 'relative') { const u = c.u == null ? DEF.relative.u : c.u, s = c.speed == null ? DEF.relative.speed : c.speed; if (u === 0 && s === 0) e.push('relative: at least one vehicle must move'); }
      return e;
    },
    keys(c) {
      const m = c && c.mode;
      const targets = ['play', 'reset'].concat((SLIDERS[m] || []).map((s) => 'slider:' + s.k), ['graph', 'drag:object']);
      if (m === 'circular') targets.push('release');
      const ev = { '1d': ['moving', 'stopped'], 'graph-match': ['moving', 'stopped', 'matched'], 'free-fall': ['moving', 'max-height', 'landed', 'stopped'], 'projectile': ['moving', 'max-height', 'landed', 'range', 'stopped'], 'circular': ['moving', 'stopped'], 'relative': ['moving', 'stopped'] }[m] || [];
      return { targets, events: ev.concat(['graph:dt', 'graph:vt', 'graph:at']) };
    },
    demo: { mode: 'projectile', vehicle: 'ball', speed: 25, angle: 45, g: 9.8 },
    modes: MODES.slice(),
    vehicles: VEH.slice(),
    mount(root, config, api) { return mount(root, config, api); },
  });
})();
