// Template: Heat lab. Temperature scales, conduction, convection, radiation, thermal expansion, heat balance
// (mixing), a thermodynamic (Carnot) cycle, and the sea breeze. Everything is computed from real physics:
//   thermometer : exact C/F/K conversions, fixed points of water
//   conduction  : 1-D heat equation along rods of real materials (k, density, specific heat), wax beads melt at 60 C
//   convection  : tracer particles carried by a buoyancy-driven loop, heated at the burner, cooled at the ice
//   radiation   : absorbers (black, white, silver) heated by a lamp with inverse-square intensity, then cooling
//   expansion   : dL = alpha * L0 * dT for each material, and a copper-steel bimetallic strip
//   mixing      : heat lost = heat gained, Tf = sum(m c T) / sum(m c), approach to equilibrium
//   cycle       : ideal-gas Carnot cycle on a P-V diagram, efficiency = 1 - Tc/Th
//   sea-breeze  : land and sea warm at different rates over a day (specific heat), giving sea and land breezes
// Config: { mode: 'thermometer'|'conduction'|'convection'|'radiation'|'expansion'|'mixing'|'cycle'|'sea-breeze',
//           materials?: ['copper','steel','glass','wood','plastic']   (conduction, expansion, mixing only) }
(function () {
  'use strict';
  const L = window.NCA_LIB;
  const { esc, lerp, clamp, ease, mixHex } = L;
  const T2 = (en, hi) => ({ en, hi });
  const MODES = ['thermometer', 'conduction', 'convection', 'radiation', 'expansion', 'mixing', 'cycle', 'sea-breeze'];
  const MAT_MODES = ['conduction', 'expansion', 'mixing'];

  // Real data (room-temperature values used in school physics tables).
  // k: thermal conductivity W/(m K); alpha: linear expansion per K; c: specific heat J/(kg K); rho: kg/m3
  const MATS = {
    copper: { n: T2('Copper', 'ताँबा'), k: 401, alpha: 17e-6, c: 385, rho: 8960, col: '#C8742F', hi: '#F0B27A', dark: false,
      use: T2('A very good conductor. Pan bases are made of copper or steel so heat reaches the food fast.', 'बहुत अच्छा सुचालक। कढ़ाई और पैन के तले ताँबे या स्टील के होते हैं ताकि गर्मी खाने तक जल्दी पहुँचे।') },
    steel: { n: T2('Steel', 'इस्पात (स्टील)'), k: 50, alpha: 12e-6, c: 490, rho: 7850, col: '#8C97A6', hi: '#D3DAE4', dark: false,
      use: T2('A good conductor, but slower than copper. A steel spoon left in hot dal soon gets hot.', 'अच्छा सुचालक, पर ताँबे से धीमा। गर्म दाल में रखी स्टील की चम्मच जल्दी गर्म हो जाती है।') },
    glass: { n: T2('Glass', 'काँच'), k: 1.0, alpha: 9e-6, c: 840, rho: 2500, col: '#8FD3EA', hi: '#DDF4FC', dark: true,
      use: T2('A poor conductor. Heat creeps through glass very slowly.', 'कुचालक। काँच में गर्मी बहुत धीरे-धीरे आगे बढ़ती है।') },
    wood: { n: T2('Wood', 'लकड़ी'), k: 0.15, alpha: 5e-6, c: 1700, rho: 600, col: '#B9824A', hi: '#E3BC8A', dark: true,
      use: T2('An insulator. Pan handles are made of wood so they stay cool enough to hold.', 'कुचालक। पैन के हत्थे लकड़ी के होते हैं ताकि पकड़ने लायक ठंडे रहें।') },
    plastic: { n: T2('Plastic (PVC)', 'प्लास्टिक (PVC)'), k: 0.2, alpha: 70e-6, c: 1000, rho: 1400, col: '#E8559B', hi: '#F7A6CB', dark: true,
      use: T2('An insulator. Kettle handles and switches are plastic, so they do not burn your hand.', 'कुचालक। केतली के हत्थे और स्विच प्लास्टिक के होते हैं, इसलिए हाथ नहीं जलता।') },
  };
  const MATIDS = Object.keys(MATS);
  const WATER = { n: T2('Water', 'पानी'), c: 4186, rho: 1000, col: '#7CC4F0' };

  // ------------------------------------------------------------------ small helpers
  let UID = 0;
  const fx = (v, d) => { const p = Math.pow(10, d), r = Math.round(v * p) / p; return (r === 0 ? 0 : r).toFixed(d); };
  const RAMP = ['#2B5FD9', '#18A8D8', '#7CD37B', '#FFD23F', '#FF7A1A', '#E0301E'];
  const ramp = (f) => { f = clamp(f, 0, 1) * (RAMP.length - 1); const i = Math.min(RAMP.length - 2, Math.floor(f)); return mixHex(RAMP[i], RAMP[i + 1], f - i); };
  const mm = (sec, t) => {
    sec = Math.round(sec);
    const m = Math.floor(sec / 60), s = sec % 60;
    return m ? t(T2(`${m} min ${s} s`, `${m} मिनट ${s} सेकंड`)) : t(T2(`${s} s`, `${s} सेकंड`));
  };
  const ICON = {
    flame: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-10z" fill="#E0301E"/><path d="M12 12c1 2 3 3 3 5a3 3 0 0 1-6 0c0-2 2-3 3-5z" fill="#FFD23F"/></svg>',
    snow: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><g stroke="#0E7490" stroke-width="2.2" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5"/></g></svg>',
    play: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="#1E293B"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="#1E293B"/></svg>',
    reset: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12a7 7 0 1 0 2.2-5.1" fill="none" stroke="#1E293B" stroke-width="2.4" stroke-linecap="round"/><path d="M4 3v5h5" fill="none" stroke="#1E293B" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    thermo: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z" fill="#fff" stroke="#1E293B" stroke-width="2"/><circle cx="12" cy="17" r="2" fill="#E0301E"/></svg>',
    mix: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 7h7l-2-3M20 17h-7l2 3" fill="none" stroke="#1E293B" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 7c4 0 6 10 16 10" fill="none" stroke="#1E293B" stroke-width="2.4" stroke-linecap="round"/></svg>',
    drop: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" fill="#8B3DFF"/></svg>',
    step: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 4l10 8-10 8zM18 4v16" fill="#1E293B" stroke="#1E293B" stroke-width="2" stroke-linejoin="round"/></svg>',
  };
  const btn = (key, icon, label, cls, extra) => `<button type="button" class="ht-btn ${cls || ''}" data-key="${esc(key)}" ${extra || ''}>${icon || ''}<span>${esc(label)}</span></button>`;
  const slider = (key, label, min, max, step, val, out, rname) => `<label class="ht-sl"><span class="ht-sl-t">${esc(label)}</span><output data-r="${rname || 'o-' + key.replace(':', '-')}">${esc(out)}</output><input type="range" data-key="${esc(key)}" min="${min}" max="${max}" step="${step}" value="${val}" aria-label="${esc(label)}"></label>`;
  const card = (inner, cls, r) => `<div class="ht-card ${cls || ''}" ${r ? `data-r="${r}"` : ''}>${inner}</div>`;
  const sup = (s) => `<sup>${s}</sup>`;

  // A small line graph (pure SVG). Returns { svg, set(R, id, xs, ys) }.
  function graphMaker(o) {
    const w = 600, h = o.h || 190, pl = 54, pr = 14, pt = 14, pb = 40;
    const X = (x) => pl + (x / o.xmax) * (w - pl - pr), Y = (y) => h - pb - ((y - o.ymin) / (o.ymax - o.ymin)) * (h - pt - pb);
    let grid = '';
    for (let i = 0; i <= o.yt; i++) { const v = o.ymin + ((o.ymax - o.ymin) * i) / o.yt, y = Y(v); grid += `<line x1="${pl}" x2="${w - pr}" y1="${y}" y2="${y}" stroke="#CBD5E1" stroke-width="1"/><text x="${pl - 6}" y="${y + 5}" text-anchor="end" class="ht-gt">${fx(v, 0)}</text>`; }
    for (let i = 0; i <= o.xt; i++) { const v = (o.xmax * i) / o.xt, x = X(v); grid += `<line x1="${x}" x2="${x}" y1="${pt}" y2="${h - pb}" stroke="#E2E8F0" stroke-width="1"/><text x="${x}" y="${h - pb + 18}" text-anchor="middle" class="ht-gt">${o.xfmt ? o.xfmt(v) : fx(v, 0)}</text>`; }
    const paths = o.series.map((s) => `<path data-r="g-${s.id}" d="" fill="none" stroke="${s.col}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    const legend = o.series.map((s, i) => `<g transform="translate(${pl + 8 + i * (o.lw || 120)} ${pt + 8})"><rect width="14" height="5" y="3" rx="2" fill="${s.col}"/><text x="19" y="10" class="ht-gt" font-weight="700">${esc(s.label)}</text></g>`).join('');
    const svg = `<svg viewBox="0 0 ${w} ${h}" class="ht-svg ht-graph" role="img" aria-label="${esc(o.aria)}"><rect width="${w}" height="${h}" fill="#fff"/>${grid}<line x1="${pl}" x2="${pl}" y1="${pt}" y2="${h - pb}" stroke="#475569" stroke-width="2"/><line x1="${pl}" x2="${w - pr}" y1="${h - pb}" y2="${h - pb}" stroke="#475569" stroke-width="2"/><text x="${(pl + w - pr) / 2}" y="${h - 6}" text-anchor="middle" class="ht-gl">${esc(o.xlab)}</text><text transform="translate(14 ${(pt + h - pb) / 2}) rotate(-90)" text-anchor="middle" class="ht-gl">${esc(o.ylab)}</text>${o.extra || ''}${paths}${legend}<line data-r="g-now" x1="${pl}" x2="${pl}" y1="${pt}" y2="${h - pb}" stroke="#334155" stroke-width="2" stroke-dasharray="5 4" opacity="0"/></svg>`;
    return {
      svg,
      set(R, id, xs, ys) { const p = R('g-' + id); if (p) p.setAttribute('d', xs.map((x, i) => (i ? 'L' : 'M') + fx(X(x), 1) + ' ' + fx(Y(clamp(ys[i], o.ymin, o.ymax)), 1)).join(' ')); },
      now(R, x) { const l = R('g-now'); if (l) { l.setAttribute('x1', X(x)); l.setAttribute('x2', X(x)); l.setAttribute('opacity', x == null ? 0 : 0.8); } },
    };
  }

  // =========================================================================================== CSS
  const CSS = `
.ht-root{container-type:inline-size;width:100%}
.ht{display:grid;gap:14px;font-family:var(--font-body,system-ui,sans-serif);color:var(--ink,#1E293B)}
@container (min-width:860px){.ht{grid-template-columns:minmax(0,1.5fr) minmax(330px,1fr);align-items:start}}
.ht-scene{border-radius:20px;overflow:hidden;background:linear-gradient(180deg,#EAF6FF,#FFF7EA);box-shadow:0 10px 28px rgba(6,18,51,.16),inset 0 0 0 1px rgba(6,18,51,.08);display:grid;gap:0}
.ht-scene svg,.ht-scene canvas{display:block;width:100%;height:auto}
.ht-duo{display:grid;gap:0}
@container (min-width:560px){.ht-duo{grid-template-columns:1fr 1fr}}
.ht-side{display:grid;gap:12px;min-width:0}
.ht-card{background:var(--surface,#fff);border:1px solid var(--line,#E2E8F0);border-radius:16px;padding:12px 14px;box-shadow:0 2px 10px rgba(6,18,51,.06);font-size:16px;line-height:1.5;min-width:0}
.ht-card b{font-family:var(--font-display,inherit)}
.ht-card h3{margin:0 0 4px;font:700 18px var(--font-display,inherit)}
.ht-card p{margin:0 0 6px}.ht-card p:last-child{margin:0}
.ht-row{display:flex;flex-wrap:wrap;gap:8px}
.ht-btn{min-height:48px;min-width:48px;padding:8px 16px;border-radius:14px;border:2px solid rgba(6,18,51,.14);font:700 16px var(--font-display,inherit);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--sunk,#EEF2F7);color:var(--ink,#1E293B);transition:transform .12s,box-shadow .12s,background .2s;touch-action:manipulation}
.ht-btn:hover{transform:translateY(-1px);box-shadow:0 4px 10px rgba(6,18,51,.14)}
.ht-btn:focus-visible,.ht-clk:focus-visible,.ht-sl input:focus-visible{outline:3px solid #02CFF9;outline-offset:2px}
.ht-btn[aria-pressed="true"]{box-shadow:0 0 0 3px #1D4ED8}
.ht-hot{background:linear-gradient(135deg,#FFD23F,#FF7A1A);color:#1E293B;border-color:#E8650A}
.ht-cool{background:linear-gradient(135deg,#9BEAFB,#14B8A6);color:#1E293B;border-color:#0E9488}
.ht-go{background:linear-gradient(135deg,#C7F5D4,#22C55E);color:#1E293B;border-color:#16A34A}
.ht-plain{background:var(--sunk,#EEF2F7)}
.ht-chipbtn{min-height:48px;padding:6px 12px;border-radius:999px;font-size:15px;background:var(--surface,#fff)}
.ht-chipbtn[aria-pressed="true"]{background:#EFF6FF;box-shadow:0 0 0 3px #1D4ED8}
.ht-dot{width:16px;height:16px;border-radius:50%;display:inline-block;border:2px solid rgba(6,18,51,.35)}
.ht-sl{display:grid;grid-template-columns:1fr auto;gap:0 10px;align-items:center;font-weight:600}
.ht-sl output{font:700 18px var(--font-display,inherit);color:#9A3412}
.ht-sl input{grid-column:1/-1;width:100%;min-height:44px;margin:0;accent-color:#EA580C;touch-action:pan-y}
.ht-sls{display:grid;gap:4px}
@container (min-width:520px){.ht-sls.ht-two{grid-template-columns:1fr 1fr;gap:4px 18px}}
.ht-chips{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.ht-chip{border-radius:14px;padding:8px 4px;text-align:center;color:#1E293B;line-height:1.1}
.ht-chip b{display:block;font-size:clamp(20px,6.4cqw,30px)}
.ht-chip span{font-size:15px;font-weight:700}
.ht-live{min-height:1.5em;font-weight:600;font-size:16px;line-height:1.5;padding:10px 14px;border-radius:14px;background:#FFF7E0;border:1px solid #F5B90A;color:#3B2A00}
.ht-live:empty{display:none}
.ht-eq{font-size:16px;line-height:1.7;overflow-wrap:anywhere}
.ht-eq mark{background:#FFE9A8;color:inherit;border-radius:6px;padding:0 4px}
.ht-bar{display:grid;grid-template-columns:96px 1fr 70px;gap:8px;align-items:center;margin:4px 0;font-size:15px}
.ht-bar i{display:block;height:14px;border-radius:7px;min-width:5px;transition:width .3s}
.ht-bar span:last-child{text-align:right;font-weight:700}
.ht-tbl{width:100%;border-collapse:collapse;font-size:15px}
.ht-tbl th,.ht-tbl td{padding:5px 6px;text-align:left;border-bottom:1px solid var(--line,#E2E8F0)}
.ht-tbl td:last-child,.ht-tbl th:last-child{text-align:right}
.ht-svg text{font-family:var(--font-body,system-ui,sans-serif)}
.ht-tk{font-size:15px;fill:#334155;font-weight:600}
.ht-lb{font-size:17px;fill:#0F172A;font-weight:700}
.ht-lb2{font-size:15px;fill:#334155;font-weight:600}
.ht-gt{font-size:14px;fill:#334155}.ht-gl{font-size:15px;fill:#0F172A;font-weight:700}
.ht-clk{cursor:pointer}
.ht-clk:hover .ht-glow{opacity:.9}
.ht-glow{opacity:0;transition:opacity .2s}
.ht-flame{transform-box:fill-box;transform-origin:50% 100%;animation:ht-flick .32s ease-in-out infinite alternate}
@keyframes ht-flick{from{transform:scale(1,1) skewX(-3deg)}to{transform:scale(.9,1.14) skewX(3deg)}}
.ht-bub{animation:ht-rise 1.4s linear infinite;transform-box:fill-box}
@keyframes ht-rise{0%{transform:translateY(0);opacity:0}15%{opacity:.9}100%{transform:translateY(-110px);opacity:0}}
.ht-steam{animation:ht-steam 2.4s ease-in infinite;transform-box:fill-box}
@keyframes ht-steam{0%{transform:translateY(8px);opacity:0}30%{opacity:.7}100%{transform:translateY(-34px);opacity:0}}
.ht-ray{stroke-dasharray:12 10;animation:ht-dash .7s linear infinite}
@keyframes ht-dash{to{stroke-dashoffset:-22}}
.ht-pulse{animation:ht-pulse 1.6s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
@keyframes ht-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
@media (prefers-reduced-motion:reduce){.ht-flame,.ht-bub,.ht-steam,.ht-ray,.ht-pulse{animation:none}.ht-btn,.ht-bar i{transition:none}}
`;

  // ======================================================================================= THERMOMETER MODE
  const FIXED = [
    { C: 0, n: T2('Ice melts', 'बर्फ़ पिघलती है'), col: '#0E9488' },
    { C: 37, n: T2('Body', 'शरीर'), col: '#B45309' },
    { C: 100, n: T2('Water boils', 'पानी उबलता है'), col: '#C2271A' },
  ];
  const PRESETS = { ice: [0, T2('Ice water', 'बर्फ़ का पानी')], room: [25, T2('Room', 'कमरा')], body: [37, T2('Body', 'शरीर')], boil: [100, T2('Boiling', 'उबलता')] };
  const thermometerMode = {
    init() { return { T: 25, goal: null, heating: false, cooling: false, said100: false, live: null, wasHeat: 0 }; },
    view(c) {
      const { t, st } = c;
      const yB = (T) => 310 - ((clamp(T, -20, 110) + 20) / 130) * 240;
      const yS = (T) => 284 - ((clamp(T, -20, 110) + 20) / 130) * 204;
      let ticks = '';
      for (let C = -20; C <= 110; C += 10) {
        const y = yB(C), major = C % 20 === 0;
        ticks += `<line x1="${major ? 386 : 392}" x2="400" y1="${y}" y2="${y}" stroke="#334155" stroke-width="${major ? 2 : 1.3}"/>`;
        if (major) ticks += `<text x="380" y="${y + 5}" text-anchor="end" class="ht-tk">${C}</text>`;
      }
      for (let F = 0; F <= 220; F += 20) {
        const C = (F - 32) / 1.8, y = yB(C);
        if (C < -20 || C > 110) continue;
        const major = F % 40 === 0;
        ticks += `<line x1="424" x2="${major ? 438 : 432}" y1="${y}" y2="${y}" stroke="#334155" stroke-width="${major ? 2 : 1.3}"/>`;
        if (major) ticks += `<text x="443" y="${y + 5}" class="ht-tk">${F}</text>`;
      }
      const fixed = FIXED.map((f) => { const y = yB(f.C); return `<line x1="420" x2="476" y1="${y}" y2="${y}" stroke="${f.col}" stroke-width="2" stroke-dasharray="4 3" opacity=".0"/><g><circle cx="494" cy="${y}" r="5" fill="${f.col}"/><text x="504" y="${y + 5}" class="ht-lb2" fill="${f.col}" style="fill:${f.col}">${esc(t(f.n))}</text></g>`; }).join('');
      const bubs = Array.from({ length: 9 }, (_, i) => `<circle class="ht-bub" data-r="bub" cx="${96 + i * 17}" cy="${290 - (i % 3) * 8}" r="${3 + (i % 3)}" fill="#fff" stroke="#9CCCE8" style="animation-delay:${(i * 0.17).toFixed(2)}s"/>`).join('');
      const steam = Array.from({ length: 5 }, (_, i) => `<path class="ht-steam" data-r="steam" d="M${80 + i * 34} 150 q-9 -14 0 -26 q9 -12 0 -24" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity="0" style="animation-delay:${(i * 0.45).toFixed(2)}s"/>`).join('');
      const scene = `<svg viewBox="0 0 600 410" class="ht-svg" role="img" aria-label="${esc(t(T2('A beaker of water with a thermometer, and a large thermometer with Celsius and Fahrenheit scales.', 'पानी का बीकर और थर्मामीटर, तथा सेल्सियस और फ़ारेनहाइट पैमाने वाला बड़ा थर्मामीटर।')))}">
<defs><linearGradient id="${c.u}gl" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#DCEBF7" stop-opacity=".5"/></linearGradient>
<clipPath id="${c.u}bk"><path d="M62 96 V312 Q62 328 78 328 H222 Q238 328 238 312 V96 Z"/></clipPath>
<radialGradient id="${c.u}bulb" cx=".35" cy=".35"><stop offset="0" stop-color="#FF8A7A"/><stop offset="1" stop-color="#C2271A"/></radialGradient></defs>
<rect x="0" y="352" width="600" height="58" fill="#E5D3B5"/><rect x="0" y="352" width="600" height="6" fill="#CDB48C"/>
<g data-r="burner"><rect x="110" y="362" width="80" height="14" rx="5" fill="#475569"/><rect x="140" y="336" width="20" height="28" rx="4" fill="#64748B"/>
<g data-r="flame" opacity="0"><path class="ht-flame" d="M150 338 c-22 -14 -14 -36 0 -52 c14 16 22 38 0 52z" fill="#FF7A1A"/><path class="ht-flame" d="M150 338 c-11 -8 -7 -20 0 -30 c7 10 11 22 0 30z" fill="#FFD23F"/></g></g>
<g clip-path="url(#${c.u}bk)"><rect data-r="water" x="62" y="170" width="176" height="160" fill="#7CC4F0" opacity=".9"/>
<g data-r="ice" opacity="0"><rect x="62" y="170" width="176" height="160" fill="#CFEDFF"/><path d="M80 190 L130 250 L110 320 M200 180 L170 260 L215 320 M150 200 L160 300" stroke="#fff" stroke-width="3" fill="none" opacity=".7"/></g>
<g data-r="cubes" opacity="0"><rect x="84" y="156" width="40" height="40" rx="7" fill="#DDF2FF" stroke="#fff" stroke-width="2" transform="rotate(-8 104 176)"/><rect x="150" y="162" width="36" height="36" rx="7" fill="#DDF2FF" stroke="#fff" stroke-width="2" transform="rotate(10 168 180)"/><rect x="114" y="176" width="30" height="30" rx="6" fill="#CFEDFF" stroke="#fff" stroke-width="2"/></g>
<g data-r="bubs" opacity="0">${bubs}</g></g>
<g data-r="steamg">${steam}</g>
<path d="M62 96 V312 Q62 328 78 328 H222 Q238 328 238 312 V96" fill="url(#${c.u}gl)" stroke="#6C8DA8" stroke-width="4" stroke-linejoin="round" opacity=".55"/><path d="M52 96 H72 M228 96 H248" stroke="#6C8DA8" stroke-width="4" stroke-linecap="round"/>
<g data-key="thermometer" role="button" tabindex="0" class="ht-clk" aria-label="${esc(t(T2('Thermometer in the beaker: tap to read it', 'बीकर में थर्मामीटर: पढ़ने के लिए दबाओ')))}">
<rect x="116" y="40" width="68" height="280" fill="transparent"/><rect x="132" y="56" width="36" height="260" rx="18" fill="#E8F3FB" opacity=".35" class="ht-glow"/>
<rect x="141" y="66" width="18" height="222" rx="9" fill="#F3FAFF" stroke="#5B7A92" stroke-width="2.5"/><circle cx="150" cy="298" r="15" fill="#F3FAFF" stroke="#5B7A92" stroke-width="2.5"/>
<rect data-r="labliq" x="146" y="200" width="8" height="90" rx="4" fill="#E0301E"/><circle cx="150" cy="298" r="10" fill="url(#${c.u}bulb)"/></g>
<text x="150" y="30" text-anchor="middle" class="ht-lb">${esc(t(T2('Tap the thermometer', 'थर्मामीटर को दबाओ')))}</text>
<text x="394" y="34" text-anchor="end" class="ht-lb" fill="#0E7490" style="fill:#0E7490">°C</text><text x="448" y="34" class="ht-lb" style="fill:#9A3412">°F</text>
${ticks}${fixed}
<g data-key="thermometer" role="button" tabindex="0" class="ht-clk" aria-label="${esc(t(T2('Big thermometer: tap to read it', 'बड़ा थर्मामीटर: पढ़ने के लिए दबाओ')))}">
<rect x="396" y="44" width="32" height="300" fill="transparent"/>
<rect x="400" y="52" width="24" height="270" rx="12" fill="#F3FAFF" stroke="#5B7A92" stroke-width="3"/><circle cx="412" cy="338" r="27" fill="#F3FAFF" stroke="#5B7A92" stroke-width="3"/>
<rect data-r="bigliq" x="408" y="200" width="8" height="140" rx="4" fill="#E0301E"/><circle cx="412" cy="338" r="19" fill="url(#${c.u}bulb)"/><rect x="404" y="56" width="3" height="256" rx="1.5" fill="#fff" opacity=".7"/></g>
</svg>`;
      const presets = Object.keys(PRESETS).map((k) => btn('preset:' + k, '', t(PRESETS[k][1]), 'ht-plain ht-chipbtn')).join('');
      const side = `
<div class="ht-chips" role="group" aria-label="${esc(t(T2('The same temperature on three scales', 'एक ही तापमान तीन पैमानों पर')))}">
<div class="ht-chip" style="background:#BFEFFA"><b data-r="vC">25</b><span>°C ${esc(t(T2('Celsius', 'सेल्सियस')))}</span></div>
<div class="ht-chip" style="background:#FFD9B8"><b data-r="vF">77</b><span>°F ${esc(t(T2('Fahrenheit', 'फ़ारेनहाइट')))}</span></div>
<div class="ht-chip" style="background:#E6D6FF"><b data-r="vK">298</b><span>K ${esc(t(T2('Kelvin', 'केल्विन')))}</span></div></div>
${card('', 'ht-eq', 'eq')}
${card(`<div class="ht-sls">${slider('slider:temp', t(T2('Water temperature', 'पानी का तापमान')), -20, 110, 0.5, 25, '25 °C', 'o-temp')}</div>`)}
<div class="ht-row">${btn('heat', ICON.flame, t(T2('Heat', 'गर्म करो')), 'ht-hot', 'aria-pressed="false"')}${btn('cool', ICON.snow, t(T2('Add ice', 'बर्फ़ डालो')), 'ht-cool', 'aria-pressed="false"')}${btn('thermometer', ICON.thermo, t(T2('Read', 'पढ़ो')), 'ht-plain')}</div>
<div class="ht-row" role="group" aria-label="${esc(t(T2('Quick temperatures', 'तुरंत तापमान')))}">${presets}</div>`;
      return {
        scene, side,
        refresh() {
          const T = st.T, R = c.R;
          R('labliq').setAttribute('y', yS(T)); R('labliq').setAttribute('height', 292 - yS(T));
          R('bigliq').setAttribute('y', yB(T)); R('bigliq').setAttribute('height', 340 - yB(T));
          const frozen = T < -0.05, melt = Math.abs(T) <= 0.05, boil = T >= 99.95, above = T > 100.05;
          R('ice').setAttribute('opacity', frozen ? 1 : 0); R('cubes').setAttribute('opacity', melt ? 1 : 0);
          const wcol = frozen ? '#CFEDFF' : mixHex('#7CC4F0', '#F0A877', clamp(T / 110, 0, 1) * 0.55);
          R('water').setAttribute('fill', wcol);
          const lvl = above ? 220 : 170; R('water').setAttribute('y', lvl); R('water').setAttribute('height', 330 - lvl);
          R('bubs').setAttribute('opacity', boil ? 1 : 0);
          const sOp = clamp((T - 55) / 45, 0, 1) * 0.9 + (above ? 0.3 : 0);
          R('steamg').setAttribute('opacity', fx(Math.min(1, sOp), 2));
          R('flame').setAttribute('opacity', st.heating ? 1 : 0);
          const Cr = Math.round(T * 10) / 10, F = Cr * 1.8 + 32, K = Cr + 273.15;
          R('vC').textContent = fx(Cr, 1); R('vF').textContent = fx(F, 1); R('vK').textContent = fx(K, 2);
          R('eq').innerHTML = `<p><b>°F</b> = °C × 9/5 + 32 = ${fx(Cr, 1)} × 9/5 + 32 = <mark>${fx(F, 1)}</mark></p><p><b>K</b> = °C + 273.15 = ${fx(Cr, 1)} + 273.15 = <mark>${fx(K, 2)}</mark></p><p>${esc(t(stateWord(T)))}</p>`;
          const inp = c.root.querySelector('[data-key="slider:temp"]');
          if (inp && document.activeElement !== inp) inp.value = T;
          R('o-temp').textContent = fx(Cr, 1) + ' °C';
          const hb = c.root.querySelector('[data-key="heat"]'), cb = c.root.querySelector('[data-key="cool"]');
          if (hb) hb.setAttribute('aria-pressed', st.heating); if (cb) cb.setAttribute('aria-pressed', st.cooling);
        },
      };
    },
    tick(c, dt) {
      const st = c.st; let ch = false;
      if (st.heating && st.T < 100) { st.T = Math.min(100, st.T + 8 * dt); ch = true; if (st.T >= 100 && !st.said100) { st.said100 = true; c.say(T2('Still heating, but the thermometer stays at 100 °C. The heat is now turning water into steam.', 'अब भी गर्म कर रहे हैं, पर थर्मामीटर 100 °C पर ही रहता है। गर्मी अब पानी को भाप में बदल रही है।')); } }
      if (st.cooling && st.T > 0) { st.T = Math.max(0, st.T - 8 * dt); ch = true; if (st.T <= 0) c.say(T2('The thermometer stops at 0 °C while the ice is melting. Ice and water stay at 0 °C together.', 'बर्फ़ के पिघलते समय थर्मामीटर 0 °C पर रुक जाता है। बर्फ़ और पानी साथ-साथ 0 °C पर रहते हैं।')); }
      if (st.goal != null) { const d = st.goal - st.T; st.T += c.reduced() ? d : Math.sign(d) * Math.min(Math.abs(d), 60 * dt); if (Math.abs(st.goal - st.T) < 1e-6) { st.T = st.goal; st.goal = null; } ch = true; }
      return ch;
    },
    act(c, key, el) {
      const st = c.st;
      if (key === 'heat') { st.heating = !st.heating; st.cooling = false; st.goal = null; st.said100 = st.T >= 100; if (st.heating) { c.emit('heated'); c.api.record(c.t(T2('Heated the water', 'पानी गर्म किया'))); } }
      else if (key === 'cool') { st.cooling = !st.cooling; st.heating = false; st.goal = null; if (st.cooling) { c.emit('cooled'); c.api.record(c.t(T2('Added ice', 'बर्फ़ डाली'))); } }
      else if (key.startsWith('preset:')) { st.heating = st.cooling = false; st.goal = PRESETS[key.slice(7)][0]; c.say(T2(`Water set to ${PRESETS[key.slice(7)][0]} °C.`, `पानी ${PRESETS[key.slice(7)][0]} °C पर किया।`)); }
      else if (key === 'thermometer') {
        const Cr = Math.round(st.T * 10) / 10;
        c.say(T2(`The thermometer reads ${fx(Cr, 1)} °C. That is ${fx(Cr * 1.8 + 32, 1)} °F and ${fx(Cr + 273.15, 2)} K.`, `थर्मामीटर ${fx(Cr, 1)} °C पढ़ता है। यह ${fx(Cr * 1.8 + 32, 1)} °F और ${fx(Cr + 273.15, 2)} K है।`));
        c.api.record(c.t(T2('Read the thermometer: ', 'थर्मामीटर पढ़ा: ')) + fx(Cr, 1) + ' °C');
        c.emit('reading');
      }
    },
    input(c, key, v) { if (key === 'slider:temp') { const st = c.st; st.heating = st.cooling = false; st.goal = null; st.T = v; st.said100 = false; c.emit('moved:temp'); } },
  };
  function stateWord(T) {
    if (T < -0.05) return T2('Below 0 °C water freezes into ice.', '0 °C से नीचे पानी जमकर बर्फ़ बन जाता है।');
    if (T <= 0.05) return T2('0 °C: the melting point of ice. Ice and water can stay together.', '0 °C: बर्फ़ का गलनांक। बर्फ़ और पानी साथ रह सकते हैं।');
    if (T >= 100.05) return T2('Above 100 °C water is steam (water vapour).', '100 °C से ऊपर पानी भाप (जलवाष्प) होता है।');
    if (T >= 99.95) return T2('100 °C: water boils at normal pressure.', '100 °C: सामान्य दाब पर पानी उबलता है।');
    if (Math.abs(T - 37) < 0.6) return T2('About 37 °C is normal human body temperature (98.6 °F).', 'लगभग 37 °C मनुष्य के शरीर का सामान्य तापमान है (98.6 °F)।');
    if (T < 15) return T2('Cold water: its particles move slowly.', 'ठंडा पानी: इसके कण धीरे चलते हैं।');
    if (T < 33) return T2('This is about room temperature.', 'यह लगभग कमरे का तापमान है।');
    if (T < 60) return T2('Warm water. Hotter than your body.', 'गुनगुना पानी। शरीर से ज़्यादा गर्म।');
    return T2('Very hot water: it can burn you. Only adults heat water.', 'बहुत गर्म पानी: इससे जलन हो सकती है। पानी केवल बड़े गर्म करते हैं।');
  }

  // ======================================================================================= CONDUCTION MODE
  const CD = { TMAX: 1800, DT: 10, BEADS: [2, 4, 6, 8, 10], MELT: 60, AMB: 25, SPEED: 45 };
  function simRod(id, Ts) {
    const M = MATS[id], a = M.k / (M.rho * M.c), dx = 0.01;
    const sub = Math.ceil(CD.DT / ((0.4 * dx * dx) / a)), dt = CD.DT / sub, r = (a * dt) / (dx * dx);
    let T = new Array(11).fill(CD.AMB); T[0] = Ts;
    const snaps = [T.slice()];
    for (let s = 1; s <= CD.TMAX / CD.DT; s++) {
      for (let q = 0; q < sub; q++) {
        const n = T.slice();
        for (let i = 1; i < 10; i++) n[i] = T[i] + r * (T[i - 1] - 2 * T[i] + T[i + 1]);
        n[10] = T[10] + 2 * r * (T[9] - T[10]); n[0] = Ts; T = n;
      }
      snaps.push(T.slice());
    }
    const tm = CD.BEADS.map((cm) => {
      for (let s = 1; s < snaps.length; s++) if (snaps[s][cm] >= CD.MELT) { const a0 = snaps[s - 1][cm], a1 = snaps[s][cm]; return (s - 1 + (CD.MELT - a0) / (a1 - a0)) * CD.DT; }
      return Infinity;
    });
    return { snaps, tm };
  }
  function rodAt(rod, t) {
    const x = clamp(t / CD.DT, 0, rod.snaps.length - 1), i = Math.min(rod.snaps.length - 2, Math.floor(x)), f = x - i;
    return rod.snaps[i].map((v, k) => lerp(v, rod.snaps[i + 1][k], f));
  }
  const conductionMode = {
    init(cfg) {
      const mats = cfg.materials || MATIDS.slice();
      return { mats, sel: mats[0], Ts: 150, t: 0, playing: false, cache: null, fall: {}, fired: {}, live: null };
    },
    ensure(st) {
      if (st.cache && st.cache.Ts === st.Ts) return;
      st.cache = { Ts: st.Ts, rods: {} };
      st.mats.forEach((m) => { st.cache.rods[m] = simRod(m, st.Ts); st.fall[m] = CD.BEADS.map(() => 0); });
      st.fired = {};
    },
    view(c) {
      const { t, st } = c, n = st.mats.length;
      const rowH = Math.min(70, 300 / n), y0 = 56;
      const sceneH = y0 + n * rowH + 56, X0 = 104, W = 436;
      let rows = '', defs = '';
      st.mats.forEach((m, i) => {
        const M = MATS[m], ry = y0 + i * rowH + 20;
        defs += `<linearGradient id="${c.u}g${i}" x1="0" x2="1">${Array.from({ length: 11 }, (_, k) => `<stop data-r="s-${m}-${k}" offset="${k / 10}" stop-color="#999"/>`).join('')}</linearGradient>`;
        const beads = CD.BEADS.map((cm, bi) => { const bx = X0 + (cm / 10) * W; return `<g data-r="b-${m}-${bi}"><line x1="${bx}" x2="${bx}" y1="${ry + 22}" y2="${ry + 30}" stroke="#64748B" stroke-width="2"/><circle cx="${bx}" cy="${ry + 35}" r="6.5" fill="#F6E27A" stroke="#C9A81F" stroke-width="1.5"/></g>`; }).join('');
        rows += `<g data-key="material:${m}" role="button" tabindex="0" class="ht-clk" aria-label="${esc(t(M.n))}" data-row="${m}">
<rect data-r="rowbg-${m}" x="6" y="${ry - 22}" width="588" height="${rowH - 4}" rx="12" fill="#fff" opacity="0"/>
<text x="${X0}" y="${ry - 7}" class="ht-lb">${esc(t(M.n))}</text><text data-r="tend-${m}" x="${X0 + W}" y="${ry - 7}" text-anchor="end" class="ht-lb2"></text>
<rect x="${X0}" y="${ry}" width="${W}" height="22" rx="5" fill="url(#${c.u}g${i})" stroke="#475569" stroke-width="2"/>
<rect x="${X0 + 3}" y="${ry + 3}" width="${W - 6}" height="4" rx="2" fill="#fff" opacity=".35"/>${beads}</g>`;
      });
      let ruler = '';
      for (let cm = 0; cm <= 10; cm += 2) ruler += `<line x1="${X0 + (cm / 10) * W}" x2="${X0 + (cm / 10) * W}" y1="${sceneH - 40}" y2="${sceneH - 30}" stroke="#475569" stroke-width="2"/><text x="${X0 + (cm / 10) * W}" y="${sceneH - 12}" text-anchor="middle" class="ht-tk">${cm}</text>`;
      const flames = Array.from({ length: Math.max(1, n) }, (_, i) => `<g data-r="fl-${i}" opacity="0"><path class="ht-flame" d="M70 ${y0 + i * rowH + 46} c-12 -8 -8 -20 0 -32 c8 12 12 24 0 32z" fill="#FF7A1A"/><path class="ht-flame" d="M70 ${y0 + i * rowH + 46} c-6 -5 -4 -12 0 -18 c4 6 6 13 0 18z" fill="#FFD23F"/></g>`).join('');
      const scene = `<svg viewBox="0 0 600 ${sceneH}" class="ht-svg" role="img" aria-label="${esc(t(T2('Rods of different materials heated at the left end. Wax beads on each rod melt and drop as heat arrives.', 'अलग-अलग पदार्थों की छड़ें, जिनका बायाँ सिरा गर्म किया जाता है। गर्मी पहुँचते ही हर छड़ पर लगी मोम की गोलियाँ पिघलकर गिरती हैं।')))}">
<defs>${defs}<linearGradient id="${c.u}hb" x1="0" x2="1"><stop offset="0" stop-color="#7C2D12"/><stop offset="1" stop-color="#EA580C"/></linearGradient></defs>
<rect x="30" y="${y0 - 8}" width="62" height="${n * rowH + 6}" rx="12" fill="url(#${c.u}hb)" stroke="#7C2D12" stroke-width="2.5"/>
<text x="61" y="${y0 + 14}" text-anchor="middle" class="ht-lb" style="fill:#fff" data-r="tsrc"></text>
${rows}${flames}
<text x="${X0 + W}" y="${sceneH - 54}" text-anchor="end" class="ht-lb2">${esc(t(T2('far end', 'दूर वाला सिरा')))}</text>
<text x="${X0}" y="${sceneH - 54}" class="ht-lb2">${esc(t(T2('hot end', 'गर्म सिरा')))}</text>
<line x1="${X0}" x2="${X0 + W}" y1="${sceneH - 40}" y2="${sceneH - 40}" stroke="#475569" stroke-width="2"/>${ruler}
<text x="${X0 + W / 2}" y="${sceneH - 1}" text-anchor="middle" class="ht-lb2">${esc(t(T2('distance from the hot end (cm)', 'गर्म सिरे से दूरी (cm)')))}</text>
</svg>`;
      const kmax = Math.max(...st.mats.map((m) => MATS[m].k)), kmin = Math.min(...st.mats.map((m) => MATS[m].k));
      const bars = st.mats.slice().sort((a, b) => MATS[b].k - MATS[a].k).map((m) => {
        const w = Math.max(4, ((Math.log10(MATS[m].k) + 1) / (Math.log10(401) + 1)) * 100);
        return `<div class="ht-bar"><span>${esc(t(MATS[m].n))}</span><i style="width:${w.toFixed(0)}%;background:${MATS[m].col}"></i><span>${MATS[m].k}</span></div>`;
      }).join('');
      void kmax; void kmin;
      const side = `
${card(`<div class="ht-sls">${slider('slider:temp', t(T2('Temperature of the hot end', 'गर्म सिरे का तापमान')), 100, 200, 10, st.Ts, st.Ts + ' °C', 'o-temp')}${slider('slider:time', t(T2('Time passed', 'बीता समय')), 0, CD.TMAX, 10, st.t, mm(st.t, t), 'o-time')}</div>`)}
<div class="ht-row">${btn('heat', ICON.flame, t(T2('Heat the rods', 'छड़ें गर्म करो')), 'ht-hot', 'aria-pressed="false"')}${btn('thermometer', ICON.thermo, t(T2('Read far ends', 'दूर सिरे पढ़ो')), 'ht-plain')}${btn('reset', ICON.reset, t(T2('Start again', 'फिर से')), 'ht-plain')}</div>
${card('', '', 'info')}
${card(`<h3>${esc(t(T2('Conductivity k, W/(m·K)', 'ऊष्मा चालकता k, W/(m·K)')))}</h3>${bars}<p style="font-size:14px;color:var(--ink-2,#475569)">${esc(t(T2('Bars use a log scale, so copper does not hide the small ones.', 'पट्टियाँ लघुगणकीय पैमाने पर हैं, ताकि ताँबा छोटी पट्टियों को छिपा न दे।')))}</p>`)}`;
      return {
        scene, side,
        refresh() {
          conductionMode.ensure(st);
          const R = c.R;
          R('tsrc').textContent = st.Ts + ' °C';
          st.mats.forEach((m, i) => {
            const rod = st.cache.rods[m], T = rodAt(rod, st.t);
            T.forEach((v, k) => R(`s-${m}-${k}`).setAttribute('stop-color', ramp((v - 20) / (st.Ts - 20))));
            R('tend-' + m).textContent = fx(T[10], 0) + ' °C';
            CD.BEADS.forEach((cm, bi) => {
              const g = R(`b-${m}-${bi}`), f = ease(st.fall[m][bi]);
              g.setAttribute('transform', `translate(0 ${fx(f * (rowH - 62 > 4 ? Math.min(30, rowH - 62) : 4), 1)})`);
              g.setAttribute('opacity', fx(1 - f * 0.25, 2));
            });
            R('rowbg-' + m).setAttribute('opacity', st.sel === m ? 0.85 : 0);
            R('rowbg-' + m).setAttribute('stroke', st.sel === m ? '#1D4ED8' : 'none'); R('rowbg-' + m).setAttribute('stroke-width', 3);
            R('fl-' + i).setAttribute('opacity', st.playing ? 1 : 0);
          });
          const M = MATS[st.sel];
          R('info').innerHTML = `<h3>${esc(t(M.n))}</h3><p>k = <b>${M.k}</b> W/(m·K) &nbsp;(${esc(t(M.k >= 10 ? T2('conductor', 'सुचालक') : T2('insulator', 'कुचालक')))})</p><p>${esc(t(M.use))}</p><p>${esc(t(T2(`Heat moves along it ${fx(M.k / 0.15, 0)} times faster than along wood.`, `इसमें गर्मी लकड़ी की तुलना में ${fx(M.k / 0.15, 0)} गुना तेज़ बढ़ती है।`)))}</p>`;
          const hb = c.root.querySelector('[data-key="heat"]');
          if (hb) { hb.setAttribute('aria-pressed', st.playing); hb.lastChild.textContent = st.playing ? t(T2('Pause', 'रोको')) : t(T2('Heat the rods', 'छड़ें गर्म करो')); }
          const ti = c.root.querySelector('[data-key="slider:time"]');
          if (ti && document.activeElement !== ti) ti.value = st.t;
          R('o-time').textContent = mm(st.t, t); R('o-temp').textContent = st.Ts + ' °C';
        },
      };
    },
    tick(c, dt) {
      const st = c.st; conductionMode.ensure(st);
      if (st.playing) { st.t = Math.min(CD.TMAX, st.t + CD.SPEED * dt); if (st.t >= CD.TMAX) { st.playing = false; conductionMode.summary(c); } }
      st.mats.forEach((m) => {
        const rod = st.cache.rods[m];
        CD.BEADS.forEach((cm, bi) => {
          const dropped = st.t >= rod.tm[bi];
          st.fall[m][bi] = dropped ? (c.reduced() ? 1 : Math.min(1, st.fall[m][bi] + dt * 2.5)) : 0;
          if (dropped && bi === 0 && !st.fired[m]) {
            st.fired[m] = true;
            c.say(T2(`${MATS[m].n.en}: the first wax bead (2 cm from the heat) drops after ${mm(rod.tm[0], (x) => x.en)}.`, `${MATS[m].n.hi}: गर्मी से 2 cm दूर वाली पहली मोम की गोली ${mm(rod.tm[0], (x) => x.hi)} बाद गिरती है।`));
            c.emit('conducted');
          }
        });
      });
      return true;
    },
    summary(c) {
      const st = c.st;
      const res = st.mats.map((m) => ({ m, n: st.cache.rods[m].tm.filter((x) => isFinite(x)).length })).sort((a, b) => b.n - a.n);
      c.say(T2(`After ${mm(CD.TMAX, (x) => x.en)}: ${res.map((r) => `${MATS[r.m].n.en} ${r.n} of 5 beads`).join(', ')}. More beads dropped means heat travelled further.`, `${mm(CD.TMAX, (x) => x.hi)} बाद: ${res.map((r) => `${MATS[r.m].n.hi} की 5 में से ${r.n} गोलियाँ`).join(', ')}। जितनी ज़्यादा गोलियाँ गिरीं, गर्मी उतनी दूर पहुँची।`));
    },
    act(c, key) {
      const st = c.st;
      if (key === 'heat') {
        if (!st.playing && st.t >= CD.TMAX) { st.t = 0; st.fired = {}; }
        st.playing = !st.playing;
        if (st.playing) { c.emit('heated'); c.api.record(c.t(T2('Started heating the rods', 'छड़ें गर्म करना शुरू किया'))); }
      } else if (key === 'reset') { st.t = 0; st.playing = false; st.fired = {}; st.mats.forEach((m) => (st.fall[m] = CD.BEADS.map(() => 0))); c.say(null); c.emit('reset'); }
      else if (key.startsWith('material:')) { st.sel = key.slice(9); c.emit('selected:' + st.sel); }
      else if (key === 'thermometer') {
        conductionMode.ensure(st);
        const parts = st.mats.map((m) => `${fx(rodAt(st.cache.rods[m], st.t)[10], 0)} °C ${MATS[m].n.en}`);
        const partsH = st.mats.map((m) => `${MATS[m].n.hi} ${fx(rodAt(st.cache.rods[m], st.t)[10], 0)} °C`);
        c.say(T2(`Far end after ${mm(st.t, (x) => x.en)}: ${parts.join(', ')}. (Start: ${CD.AMB} °C.)`, `${mm(st.t, (x) => x.hi)} बाद दूर वाला सिरा: ${partsH.join(', ')}। (शुरू में: ${CD.AMB} °C।)`));
        c.api.record(c.t(T2('Read the temperature at the far ends', 'दूर वाले सिरों का तापमान पढ़ा')));
        c.emit('reading');
      }
    },
    input(c, key, v) {
      const st = c.st;
      if (key === 'slider:temp') { st.Ts = v; st.cache = null; st.t = Math.min(st.t, CD.TMAX); st.fired = {}; c.emit('moved:temp'); }
      else if (key === 'slider:time') { st.t = v; st.playing = false; c.emit('moved:time'); }
    },
  };

  // ======================================================================================= CONVECTION MODE
  const RHO_W = [[0, 999.84], [20, 998.21], [40, 992.22], [60, 983.20], [80, 971.80], [100, 958.35]];
  const rhoW = (T) => { T = clamp(T, 0, 100); for (let i = 0; i < RHO_W.length - 1; i++) if (T <= RHO_W[i + 1][0]) return lerp(RHO_W[i][1], RHO_W[i + 1][1], (T - RHO_W[i][0]) / (RHO_W[i + 1][0] - RHO_W[i][0])); return 958.35; };
  const TANK = { x: 70, y: 56, w: 460, h: 270 };
  function mkCanvas(c, host, W, H) {
    const cv = host.querySelector('canvas'); const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return g;
  }
  const font = (g, px, w) => { g.font = `${w || 700} ${px}px Mukta, "Noto Sans Devanagari", system-ui, sans-serif`; };
  const convectionMode = {
    init() {
      const parts = Array.from({ length: 150 }, () => ({ x: Math.random(), y: Math.random(), T: 20, seen: false }));
      return { Th: 80, heating: false, h: 0, parts, dye: [], tt: 0, fired: false, live: null, ctx: null };
    },
    view(c) {
      const { t, st } = c;
      const scene = `<canvas width="1200" height="800" role="img" aria-label="${esc(t(T2('A tank of water heated at the bottom left corner and cooled by ice at the top right. Small bits float round in a loop: up where it is hot, across the top, down where it is cold.', 'पानी की टंकी, जिसका नीचे बायाँ कोना गर्म किया जाता है और ऊपर दाएँ कोने पर बर्फ़ है। छोटे कण चक्कर लगाते हैं: गर्म जगह ऊपर, ऊपर से आर-पार, ठंडी जगह नीचे।')))}"></canvas>`;
      const dh = rhoW(st.Th), dc = rhoW(20);
      const side = `
${card(`<div class="ht-sls">${slider('slider:temp', t(T2('Heater temperature', 'हीटर का तापमान')), 40, 100, 5, st.Th, st.Th + ' °C', 'o-temp')}</div>`)}
<div class="ht-row">${btn('heat', ICON.flame, t(T2('Heat', 'गर्म करो')), 'ht-hot', 'aria-pressed="false"')}${btn('dye', ICON.drop, t(T2('Drop a purple crystal', 'बैंगनी क्रिस्टल डालो')), 'ht-plain')}${btn('thermometer', ICON.thermo, t(T2('Read thermometers', 'थर्मामीटर पढ़ो')), 'ht-plain')}${btn('reset', ICON.reset, t(T2('Start again', 'फिर से')), 'ht-plain')}</div>
${card('', 'ht-eq', 'info')}`;
      void dh; void dc;
      return {
        scene, side,
        bind() { st.ctx = mkCanvas(c, c.root.querySelector('.ht-scene'), 600, 400); },
        refresh() {
          const R = c.R, hb = c.root.querySelector('[data-key="heat"]');
          if (hb) hb.setAttribute('aria-pressed', st.heating);
          const ti = c.root.querySelector('[data-key="slider:temp"]');
          if (ti && document.activeElement !== ti) ti.value = st.Th;
          R('o-temp').textContent = st.Th + ' °C';
          const a = rhoW(st.Th), b = rhoW(20);
          R('info').innerHTML = `<p>${esc(t(T2('Hot water is less dense, so it rises. Cold water is denser, so it sinks.', 'गर्म पानी कम घना होता है, इसलिए ऊपर उठता है। ठंडा पानी अधिक घना होता है, इसलिए नीचे बैठता है।')))}</p><p>${esc(t(T2('Density at the heater', 'हीटर के पास घनत्व')))}: <mark>${fx(a, 1)}</mark> kg/m${sup(3)} &nbsp; ${esc(t(T2('at 20 °C', '20 °C पर')))}: <mark>${fx(b, 1)}</mark> kg/m${sup(3)}</p><p>${esc(t(T2('Flow strength', 'प्रवाह की तेज़ी')))}: <b>${Math.round(st.h * 100)}%</b></p>`;
          convectionMode.draw(c);
        },
      };
    },
    tick(c, dt) {
      const st = c.st; st.tt += dt;
      const target = st.heating ? (st.Th - 20) / 80 : 0;
      st.h += (target - st.h) * Math.min(1, dt * (st.heating ? 0.9 : 0.35));
      if (c.reduced() && st.heating) st.h = target;
      const Ap = st.h * 0.42;
      const advance = (p, jit) => {
        const u = -Ap * Math.PI * Math.sin(Math.PI * p.x) * Math.cos(Math.PI * p.y), v = Ap * Math.PI * Math.cos(Math.PI * p.x) * Math.sin(Math.PI * p.y);
        p.x = clamp(p.x + u * dt + (Math.random() - 0.5) * jit, 0.015, 0.985); p.y = clamp(p.y + v * dt + (Math.random() - 0.5) * jit, 0.015, 0.985);
      };
      st.parts.forEach((p) => {
        advance(p, 0.002);
        const heatZone = p.x < 0.3 && p.y < 0.22, iceZone = p.x > 0.8 && p.y > 0.76;
        const goal = heatZone ? (st.heating ? st.Th : 20) : iceZone ? 6 : 20, rate = heatZone ? 2.6 : iceZone ? 2.0 : 0.14;
        p.T += (goal - p.T) * Math.min(1, rate * dt);
        if (p.x < 0.3 && p.y < 0.3) p.seen = true;
        if (p.seen && p.x > 0.72 && p.y > 0.7 && st.h > 0.3 && !st.fired) { st.fired = true; c.emit('convected'); c.say(T2('Yes! The warm water rose near the heater, moved across the top, cooled and sank on the other side. That loop is a convection current.', 'हाँ! हीटर के पास गर्म पानी ऊपर उठा, ऊपर से आर-पार गया, ठंडा हुआ और दूसरी तरफ़ नीचे बैठ गया। यह चक्कर संवहन धारा है।')); }
      });
      st.dye.forEach((p) => {
        advance(p, 0.004); p.life -= dt;
        p.trail.push([p.x, p.y]); if (p.trail.length > 14) p.trail.shift();
        if (p.x > 0.8 && p.y > 0.8 && st.h > 0.3 && !st.fired) { st.fired = true; c.emit('convected'); c.say(T2('The purple colour is carried up beside the heater, across the top and down the other side. The moving water carries the heat.', 'बैंगनी रंग हीटर के पास ऊपर, ऊपर से आर-पार और दूसरी तरफ़ नीचे ले जाया जाता है। बहता हुआ पानी गर्मी ले जाता है।')); }
      });
      st.dye = st.dye.filter((p) => p.life > 0);
      return true;
    },
    draw(c) {
      const st = c.st, g = st.ctx, t = c.t; if (!g) return;
      const { x, y, w, h } = TANK;
      g.clearRect(0, 0, 600, 400);
      const bg = g.createLinearGradient(0, 0, 0, 400); bg.addColorStop(0, '#EAF6FF'); bg.addColorStop(1, '#FFF3DE'); g.fillStyle = bg; g.fillRect(0, 0, 600, 400);
      g.fillStyle = '#E5D3B5'; g.fillRect(0, 372, 600, 28);
      // water as a heat map
      g.save(); g.beginPath(); g.roundRect(x, y, w, h, 10); g.clip();
      g.fillStyle = '#CDEBFB'; g.fillRect(x, y, w, h);
      const cols = 23, rows = 14, cw = w / cols, ch = h / rows, sig2 = 40 * 40;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const px = x + (i + 0.5) * cw, py = y + (j + 0.5) * ch;
        let ws = 0.25, ts = 0.25 * 20;
        for (const p of st.parts) { const dx = x + p.x * w - px, dy = y + (1 - p.y) * h - py, d2 = dx * dx + dy * dy; if (d2 < 9 * sig2) { const wt = Math.exp(-d2 / sig2); ws += wt; ts += wt * p.T; } }
        const T = ts / ws, f = (T - 6) / (st.Th - 6 + 1e-6);
        g.fillStyle = mixHex('#CDEBFB', ramp(clamp(f, 0, 1)), clamp(Math.abs(T - 20) / 30, 0, 0.8) * 0.85);
        g.fillRect(x + i * cw - 0.5, y + j * ch - 0.5, cw + 1, ch + 1);
      }
      // tracer bits
      st.parts.forEach((p) => { const px = x + p.x * w, py = y + (1 - p.y) * h; g.beginPath(); g.arc(px, py, 3.2, 0, 7); g.fillStyle = '#FFFFFF'; g.fill(); g.lineWidth = 1.3; g.strokeStyle = '#334155'; g.stroke(); });
      // dye
      st.dye.forEach((p) => {
        const a = clamp(p.life / 6, 0, 1);
        g.lineWidth = 5; g.lineCap = 'round'; g.strokeStyle = `rgba(110,40,200,${(0.5 * a).toFixed(2)})`; g.beginPath();
        p.trail.forEach((q, k) => { const px = x + q[0] * w, py = y + (1 - q[1]) * h; k ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke();
      });
      g.restore();
      // ice cubes at the top right
      g.save(); g.beginPath(); g.roundRect(x, y, w, h, 10); g.clip();
      [[470, 56, 46], [500, 80, 38], [452, 88, 34]].forEach(([ix, iy, s]) => { g.fillStyle = 'rgba(222,244,255,.95)'; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.roundRect(ix, iy, s, s, 8); g.fill(); g.stroke(); });
      g.restore();
      // glass
      g.lineWidth = 5; g.strokeStyle = 'rgba(60,100,130,.75)'; g.beginPath(); g.roundRect(x, y, w, h, 10); g.stroke();
      // burner
      g.fillStyle = '#475569'; g.beginPath(); g.roundRect(80, 352, 110, 18, 6); g.fill(); g.fillStyle = '#64748B'; g.fillRect(122, 334, 26, 20);
      if (st.heating) {
        const fl = 1 + 0.12 * Math.sin(st.tt * 22);
        g.fillStyle = '#FF7A1A'; g.beginPath(); g.moveTo(135, 334); g.bezierCurveTo(105, 324, 118, 300, 135, 290 - 10 * fl); g.bezierCurveTo(152, 300, 165, 324, 135, 334); g.fill();
        g.fillStyle = '#FFD23F'; g.beginPath(); g.moveTo(135, 332); g.bezierCurveTo(120, 324, 126, 312, 135, 306 - 6 * fl); g.bezierCurveTo(144, 312, 150, 324, 135, 332); g.fill();
      }
      font(g, 17); g.fillStyle = '#0F172A';
      g.fillText(t(T2('Heater', 'हीटर')), 210, 366); g.textAlign = 'right'; g.fillText(t(T2('Ice', 'बर्फ़')), 530, 46); g.textAlign = 'left';
      // arrows showing the loop once it runs
      if (st.h > 0.25) {
        g.strokeStyle = `rgba(30,41,59,${clamp(st.h, 0, 0.7).toFixed(2)})`; g.fillStyle = g.strokeStyle; g.lineWidth = 3;
        const arrow = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); const a = Math.atan2(y2 - y1, x2 - x1); g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - 12 * Math.cos(a - 0.5), y2 - 12 * Math.sin(a - 0.5)); g.lineTo(x2 - 12 * Math.cos(a + 0.5), y2 - 12 * Math.sin(a + 0.5)); g.fill(); };
        arrow(x + 0.18 * w, y + 0.64 * h, x + 0.18 * w, y + 0.34 * h); arrow(x + 0.38 * w, y + 0.12 * h, x + 0.62 * w, y + 0.12 * h);
        arrow(x + 0.82 * w, y + 0.36 * h, x + 0.82 * w, y + 0.66 * h); arrow(x + 0.62 * w, y + 0.88 * h, x + 0.38 * w, y + 0.88 * h);
      }
    },
    act(c, key) {
      const st = c.st;
      if (key === 'heat') { st.heating = !st.heating; if (st.heating) { c.emit('heated'); c.api.record(c.t(T2('Started the heater', 'हीटर चालू किया'))); } }
      else if (key === 'dye') {
        const n = 26;
        for (let i = 0; i < n; i++) st.dye.push({ x: 0.12 + Math.random() * 0.1, y: 0.05 + Math.random() * 0.12, life: 18 + Math.random() * 4, trail: [] });
        c.emit('dyed'); c.api.record(c.t(T2('Dropped a purple crystal', 'बैंगनी क्रिस्टल डाला')));
        if (!st.heating) c.say(T2('The colour spreads only a little. Now switch the heater on and watch it move.', 'रंग थोड़ा-सा ही फैलता है। अब हीटर चालू करो और इसे चलते देखो।'));
      } else if (key === 'reset') { st.heating = false; st.h = 0; st.dye = []; st.fired = false; st.parts.forEach((p) => { p.x = Math.random(); p.y = Math.random(); p.T = 20; p.seen = false; }); c.say(null); }
      else if (key === 'thermometer') {
        const near = st.parts.filter((p) => p.x < 0.3 && p.y < 0.3), far = st.parts.filter((p) => p.x > 0.7 && p.y > 0.7), avg = (a) => (a.length ? a.reduce((s, p) => s + p.T, 0) / a.length : 20);
        c.say(T2(`Near the heater: ${fx(avg(near), 1)} °C. Near the ice: ${fx(avg(far), 1)} °C. Far corner at the bottom: about 20 °C.`, `हीटर के पास: ${fx(avg(near), 1)} °C। बर्फ़ के पास: ${fx(avg(far), 1)} °C। नीचे का दूर वाला कोना: लगभग 20 °C।`));
        c.emit('reading');
      }
    },
    input(c, key, v) { if (key === 'slider:temp') { c.st.Th = v; c.emit('moved:temp'); } },
  };

  // ======================================================================================= RADIATION MODE
  const SURF = {
    black: { n: T2('Dull black', 'काला खुरदरा'), a: 0.95, tauC: 160, fill: '#1B1F2A', ink: '#fff', note: T2('absorbs about 95% of the heat rays that reach it, and gives heat out quickly', 'पहुँचने वाली ऊष्मा-किरणों का लगभग 95% सोखता है और गर्मी जल्दी छोड़ता भी है') },
    white: { n: T2('White', 'सफ़ेद'), a: 0.3, tauC: 150, fill: '#F6F7F9', ink: '#1E293B', note: T2('reflects most of the rays, absorbing only about 30%', 'अधिकांश किरणें लौटा देता है, केवल लगभग 30% सोखता है') },
    silver: { n: T2('Shiny silver', 'चमकीला चाँदी-सा'), a: 0.1, tauC: 420, fill: '#C9D1DB', ink: '#1E293B', note: T2('reflects about 90% of the rays, and also loses heat slowly (like the shiny lining of a flask)', 'लगभग 90% किरणें लौटा देता है और गर्मी धीरे गँवाता भी है (थर्मस की चमकीली परत की तरह)') },
  };
  const SIDS = Object.keys(SURF);
  const RAD = { TON: 300, TMAX: 600, AMB: 25, TAUH: 150 };
  const radT = (id, d, t) => {
    const s = SURF[id], dTeq = 40 * (s.a / 0.95) * Math.pow(40 / d, 2);
    const on = (x) => RAD.AMB + dTeq * (1 - Math.exp(-x / RAD.TAUH));
    return t <= RAD.TON ? on(t) : RAD.AMB + (on(RAD.TON) - RAD.AMB) * Math.exp(-(t - RAD.TON) / s.tauC);
  };
  const radiationMode = {
    init() { return { d: 40, t: 0, playing: false, live: null, graph: null, said: false }; },
    view(c) {
      const { t, st } = c;
      const rowsY = [96, 208, 320], cx0 = 392;
      const yT = (T) => 0 + T; void yT;
      const cans = SIDS.map((id, i) => {
        const S = SURF[id], yc = rowsY[i];
        return `<g data-key="thermometer:${id}" role="button" tabindex="0" class="ht-clk" aria-label="${esc(t(T2('Thermometer on the ', 'थर्मामीटर: ')) + t(S.n))}">
<rect x="${cx0 + 62}" y="${yc - 80}" width="40" height="64" fill="transparent"/>
<rect x="${cx0 + 76}" y="${yc - 74}" width="12" height="52" rx="6" fill="#F3FAFF" stroke="#5B7A92" stroke-width="2"/><rect data-r="mer-${id}" x="${cx0 + 79.5}" y="${yc - 40}" width="5" height="20" rx="2.5" fill="#E0301E"/></g>
<rect x="${cx0}" y="${yc - 24}" width="132" height="50" rx="9" fill="${S.fill}" stroke="#334155" stroke-width="3"/>
${id === 'silver' ? `<rect x="${cx0 + 8}" y="${yc - 20}" width="116" height="8" rx="4" fill="#fff" opacity=".8"/><rect x="${cx0 + 10}" y="${yc + 8}" width="30" height="12" rx="6" fill="#fff" opacity=".35"/>` : ''}
<rect x="${cx0 + 62}" y="${yc - 28}" width="40" height="6" rx="3" fill="#64748B"/>
<text x="${cx0 + 40}" y="${yc + 6}" text-anchor="middle" class="ht-lb" style="fill:${S.ink}">${esc(t(S.n))}</text>
<text data-r="rd-${id}" x="${cx0 + 140}" y="${yc + 8}" class="ht-lb" style="font-size:22px">--</text>`;
      }).join('');
      const rays = rowsY.map((y, i) => `<line data-r="ray-${i}" class="ht-ray" x1="150" y1="208" x2="${cx0 - 2}" y2="${y}" stroke="#FFB020" stroke-width="3" stroke-linecap="round"/>`).join('');
      const g = graphMaker({ xmax: RAD.TMAX, ymin: 20, ymax: 100, xt: 5, yt: 4, xlab: t(T2('time (minutes)', 'समय (मिनट)')), ylab: '°C', aria: t(T2('Graph of temperature against time for the three cans', 'तीनों डिब्बों के लिए तापमान-समय ग्राफ़')), xfmt: (v) => fx(v / 60, 0), series: SIDS.map((id) => ({ id, col: id === 'black' ? '#1B1F2A' : id === 'white' ? '#EA580C' : '#2563EB', label: t(SURF[id].n) })), lw: 130, h: 200 });
      st.graph = g;
      const scene = `<svg viewBox="0 0 600 410" class="ht-svg" role="img" aria-label="${esc(t(T2('A heat lamp shining on three cans: dull black, white and shiny silver, each with a thermometer.', 'एक हीट-लैम्प तीन डिब्बों पर चमक रहा है: काला, सफ़ेद और चमकीला; हर एक पर थर्मामीटर।')))}">
<defs><radialGradient id="${c.u}lamp"><stop offset="0" stop-color="#FFF7C2"/><stop offset=".5" stop-color="#FFD23F"/><stop offset="1" stop-color="#FF7A1A" stop-opacity="0"/></radialGradient></defs>
<rect y="372" width="600" height="38" fill="#E5D3B5"/><rect y="372" width="600" height="5" fill="#CDB48C"/>
${rays}
<g data-r="lamp"><circle data-r="halo" cx="150" cy="208" r="70" fill="url(#${c.u}lamp)" opacity=".9"/>
<path d="M122 170 L110 246 H166 L178 170 Z" fill="#475569" stroke="#1E293B" stroke-width="3" stroke-linejoin="round" transform="translate(0 0)"/>
<rect x="108" y="246" width="60" height="10" rx="4" fill="#1E293B"/><rect x="132" y="256" width="12" height="52" fill="#64748B"/><rect x="112" y="306" width="52" height="10" rx="4" fill="#334155"/>
<circle data-r="bulb" cx="150" cy="208" r="22" fill="#FFF3A8" stroke="#E8A50C" stroke-width="3"/></g>
<line data-r="dline" x1="150" x2="392" y1="352" y2="352" stroke="#334155" stroke-width="2.5"/>
<line x1="150" x2="150" y1="344" y2="360" stroke="#334155" stroke-width="2.5"/><line x1="392" x2="392" y1="344" y2="360" stroke="#334155" stroke-width="2.5"/>
<text data-r="dtxt" x="270" y="344" text-anchor="middle" class="ht-lb"></text>
${cans}
<text data-r="state" x="300" y="22" text-anchor="middle" class="ht-lb"></text>
</svg>${g.svg}`;
      const side = `
${card(`<div class="ht-sls">${slider('slider:distance', t(T2('Distance of the lamp', 'लैम्प की दूरी')), 30, 80, 5, st.d, st.d + ' cm', 'o-dist')}${slider('slider:time', t(T2('Time (lamp is on for the first 5 minutes)', 'समय (लैम्प पहले 5 मिनट जलता है)')), 0, RAD.TMAX, 10, st.t, mm(st.t, t), 'o-time')}</div>`)}
<div class="ht-row">${btn('heat', ICON.flame, t(T2('Switch on the lamp', 'लैम्प जलाओ')), 'ht-hot', 'aria-pressed="false"')}${btn('thermometer', ICON.thermo, t(T2('Read all three', 'तीनों पढ़ो')), 'ht-plain')}${btn('reset', ICON.reset, t(T2('Start again', 'फिर से')), 'ht-plain')}</div>
${card('', '', 'info')}`;
      return {
        scene, side,
        refresh() {
          const R = c.R, on = st.t < RAD.TON;
          const xl = 392 - st.d * 3.0;
          R('lamp').setAttribute('transform', `translate(${xl - 150} 0)`);
          R('dline').setAttribute('x1', xl); R('dline').setAttribute('x2', 392);
          R('dtxt').setAttribute('x', (xl + 392) / 2); R('dtxt').textContent = st.d + ' cm';
          R('halo').setAttribute('opacity', on ? 0.9 : 0.12); R('bulb').setAttribute('fill', on ? '#FFF3A8' : '#B8B2A0');
          [0, 1, 2].forEach((i) => { const r = R('ray-' + i); r.setAttribute('x1', xl + 16); r.setAttribute('opacity', on ? 0.85 : 0); r.setAttribute('stroke-width', fx(2 + 3.5 * Math.pow(40 / st.d, 2), 1)); });
          R('state').textContent = on ? t(T2('Lamp ON: heat rays travel through the air', 'लैम्प चालू: ऊष्मा-किरणें हवा में चलती हैं')) : t(T2('Lamp OFF: the cans cool down', 'लैम्प बंद: डिब्बे ठंडे हो रहे हैं'));
          SIDS.forEach((id) => {
            const T = radT(id, st.d, st.t);
            R('rd-' + id).textContent = fx(T, 1) + ' °C';
            const hgt = 8 + ((clamp(T, 20, 100) - 20) / 80) * 44;
            const rowY = [96, 208, 320][SIDS.indexOf(id)];
            R('mer-' + id).setAttribute('height', hgt); R('mer-' + id).setAttribute('y', rowY - 22 - hgt);
          });
          const hb = c.root.querySelector('[data-key="heat"]');
          if (hb) { hb.setAttribute('aria-pressed', st.playing); hb.lastChild.textContent = st.playing ? t(T2('Pause', 'रोको')) : t(T2('Switch on the lamp', 'लैम्प जलाओ')); }
          const ti = c.root.querySelector('[data-key="slider:time"]'), di = c.root.querySelector('[data-key="slider:distance"]');
          if (ti && document.activeElement !== ti) ti.value = st.t;
          if (di && document.activeElement !== di) di.value = st.d;
          R('o-time').textContent = mm(st.t, t); R('o-dist').textContent = st.d + ' cm';
          const xs = [], n = 60; for (let i = 0; i <= n; i++) xs.push((st.t * i) / n);
          SIDS.forEach((id) => st.graph.set(R, id, xs, xs.map((x) => radT(id, st.d, x))));
          st.graph.now(R, st.t);
          R('info').innerHTML = SIDS.map((id) => `<p><span class="ht-dot" style="background:${SURF[id].fill}"></span> <b>${esc(t(SURF[id].n))}</b>: ${esc(t(SURF[id].note))}.</p>`).join('') + `<p>${esc(t(T2('Intensity falls as 1/d². Double the distance and the rays are four times weaker.', 'तीव्रता 1/d² की तरह घटती है। दूरी दोगुनी करो तो किरणें चार गुना कमज़ोर हो जाती हैं।')))}</p>`;
        },
      };
    },
    tick(c, dt) {
      const st = c.st;
      if (st.playing) { st.t = Math.min(RAD.TMAX, st.t + 30 * dt); if (st.t >= RAD.TMAX) { st.playing = false; radiationMode.sum(c); } }
      return st.playing;
    },
    sum(c) {
      const st = c.st, T = SIDS.map((id) => [id, radT(id, st.d, RAD.TON)]).sort((a, b) => b[1] - a[1]);
      c.say(T2(`At 5 minutes, the ${SURF[T[0][0]].n.en.toLowerCase()} can was hottest (${fx(T[0][1], 1)} °C) and the ${SURF[T[2][0]].n.en.toLowerCase()} can was coolest (${fx(T[2][1], 1)} °C). Dull black surfaces absorb the most heat radiation.`, `5 मिनट पर ${SURF[T[0][0]].n.hi} डिब्बा सबसे गर्म था (${fx(T[0][1], 1)} °C) और ${SURF[T[2][0]].n.hi} डिब्बा सबसे ठंडा (${fx(T[2][1], 1)} °C)। काली खुरदरी सतह विकिरण-ऊष्मा सबसे अधिक सोखती है।`));
    },
    act(c, key) {
      const st = c.st;
      if (key === 'heat') { if (!st.playing && st.t >= RAD.TMAX) st.t = 0; st.playing = !st.playing; if (st.playing) { c.emit('heated'); c.api.record(c.t(T2('Switched on the lamp', 'लैम्प जलाया'))); } }
      else if (key === 'reset') { st.t = 0; st.playing = false; c.say(null); }
      else if (key === 'thermometer' || key.startsWith('thermometer:')) {
        const ids = key === 'thermometer' ? SIDS : [key.slice(12)];
        c.say(T2(`After ${mm(st.t, (x) => x.en)}: ${ids.map((id) => `${SURF[id].n.en} ${fx(radT(id, st.d, st.t), 1)} °C`).join(', ')}.`, `${mm(st.t, (x) => x.hi)} बाद: ${ids.map((id) => `${SURF[id].n.hi} ${fx(radT(id, st.d, st.t), 1)} °C`).join(', ')}।`));
        c.api.record(c.t(T2('Read the thermometers', 'थर्मामीटर पढ़े')));
        c.emit('reading');
      }
    },
    input(c, key, v) {
      const st = c.st;
      if (key === 'slider:distance') { st.d = v; c.emit('moved:distance'); }
      else if (key === 'slider:time') { st.t = v; st.playing = false; c.emit('moved:time'); }
    },
  };

  // ======================================================================================= EXPANSION MODE
  const EXP = { TMIN: 20, TMAX: 100, MAG: 60, PX: 350 };
  const expansionMode = {
    init(cfg) { const mats = cfg.materials || MATIDS.slice(); return { mats, sel: mats[0], T: 20, goal: null, heating: false, up: false, live: null }; },
    view(c) {
      const { t, st } = c, n = st.mats.length;
      const rowH = Math.min(58, 250 / n), y0 = 44, by0 = y0 + n * rowH + 44, H = by0 + 118, X0 = 74;
      let rows = '';
      st.mats.forEach((m, i) => {
        const M = MATS[m], ry = y0 + i * rowH + 20;
        rows += `<g data-key="material:${m}" role="button" tabindex="0" class="ht-clk" aria-label="${esc(t(M.n))}">
<rect data-r="rowbg-${m}" x="6" y="${ry - 20}" width="588" height="${rowH - 2}" rx="12" fill="#fff" opacity="0"/>
<text x="${X0 + 8}" y="${ry - 5}" class="ht-lb">${esc(t(M.n))}</text>
<rect data-r="rod-${m}" x="${X0}" y="${ry}" width="${EXP.PX}" height="20" rx="4" fill="${M.col}" stroke="#334155" stroke-width="2.5"/>
<line data-r="orig-${m}" x1="${X0 + EXP.PX}" x2="${X0 + EXP.PX}" y1="${ry - 4}" y2="${ry + 24}" stroke="#334155" stroke-width="2" stroke-dasharray="4 3"/>
<text data-r="dl-${m}" x="${X0 + EXP.PX + 12}" y="${ry + 16}" class="ht-lb" style="fill:#9A3412"></text></g>`;
      });
      const scene = `<svg viewBox="0 0 600 ${H}" class="ht-svg" role="img" aria-label="${esc(t(T2('Rods of different materials fixed at the left. Heated, each grows longer by a different small amount, drawn 60 times bigger. Below, a bimetallic strip bends.', 'अलग-अलग पदार्थों की छड़ें बायीं ओर जमी हैं। गर्म करने पर हर छड़ थोड़ी-थोड़ी लंबी होती है (60 गुना बड़ा दिखाया गया)। नीचे द्विधात्विक पट्टी मुड़ती है।')))}">
<defs><pattern id="${c.u}hat" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#CBD5E1"/><line x1="0" y1="0" x2="0" y2="8" stroke="#64748B" stroke-width="3"/></pattern></defs>
<rect x="38" y="${y0 - 6}" width="34" height="${n * rowH + 2}" fill="url(#${c.u}hat)" stroke="#475569" stroke-width="2"/>
<rect x="38" y="${by0 - 14}" width="34" height="46" fill="url(#${c.u}hat)" stroke="#475569" stroke-width="2"/>
<text x="${X0}" y="22" class="ht-lb2">${esc(t(T2('Growth is drawn 60 times bigger than it really is', 'वृद्धि असल से 60 गुना बड़ी दिखाई गई है')))}</text>
${rows}
<text x="${X0 + 8}" y="${by0 - 12}" class="ht-lb">${esc(t(T2('Bimetallic strip: copper on top, steel below', 'द्विधात्विक पट्टी: ऊपर ताँबा, नीचे इस्पात')))}</text>
<path data-r="bm-cu" d="" fill="none" stroke="${MATS.copper.col}" stroke-width="9" stroke-linecap="butt"/>
<path data-r="bm-st" d="" fill="none" stroke="${MATS.steel.col}" stroke-width="9" stroke-linecap="butt"/>
<text data-r="bmtxt" x="300" y="${H - 8}" text-anchor="middle" class="ht-lb2"></text>
<g data-r="flame" opacity="0"><path class="ht-flame" d="M${X0 + 150} ${H - 6} c-16 -10 -10 -26 0 -40 c10 14 16 30 0 40z" fill="#FF7A1A"/><path class="ht-flame" d="M${X0 + 150} ${H - 6} c-8 -6 -5 -14 0 -22 c5 8 8 16 0 22z" fill="#FFD23F"/></g>
</svg>`;
      const side = `
${card(`<div class="ht-chips" style="grid-template-columns:1fr"><div class="ht-chip" style="background:#FFD9B8"><b data-r="vT">20 °C</b><span>${esc(t(T2('temperature of the rods', 'छड़ों का तापमान')))}</span></div></div>
<div class="ht-sls">${slider('slider:temp', t(T2('Set the temperature', 'तापमान तय करो')), EXP.TMIN, EXP.TMAX, 1, st.T, '20 °C', 'o-temp')}</div>`)}
<div class="ht-row">${btn('heat', ICON.flame, t(T2('Heat', 'गर्म करो')), 'ht-hot', 'aria-pressed="false"')}${btn('cool', ICON.snow, t(T2('Cool', 'ठंडा करो')), 'ht-cool')}${btn('thermometer', ICON.thermo, t(T2('Read', 'पढ़ो')), 'ht-plain')}</div>
${card('', 'ht-eq', 'info')}${card('', '', 'tbl')}`;
      const rowYs = (i) => y0 + i * rowH + 20;
      return {
        scene, side,
        refresh() {
          const R = c.R, dT = st.T - EXP.TMIN, f = clamp(dT / (EXP.TMAX - EXP.TMIN), 0, 1);
          st.mats.forEach((m, i) => {
            const M = MATS[m], dL = M.alpha * 1 * dT * 1000, off = dL * (EXP.PX / 1000) * EXP.MAG;
            const rod = R('rod-' + m); rod.setAttribute('width', fx(EXP.PX + off, 1)); rod.setAttribute('fill', mixHex(M.col, ramp(0.3 + 0.7 * f), f * 0.5));
            R('dl-' + m).setAttribute('x', fx(74 + EXP.PX + off + 12, 1)); R('dl-' + m).textContent = '+' + fx(dL, dL < 1 ? 2 : 1) + ' mm';
            R('rowbg-' + m).setAttribute('opacity', st.sel === m ? 0.85 : 0); R('rowbg-' + m).setAttribute('stroke', st.sel === m ? '#1D4ED8' : 'none'); R('rowbg-' + m).setAttribute('stroke-width', 3);
            void i; void rowYs;
          });
          // bimetallic strip: length 10 cm, thickness 1 mm; curvature = 1.5 * dAlpha * dT / h (equal thickness and stiffness)
          const dA = MATS.copper.alpha - MATS.steel.alpha, theta = 1.5 * dA * dT * 100, thd = theta * 12, Ls = 300, N = 30;
          const pts = [[], []]; let px = 74, py = by0 + 4, hd = 0;
          for (let k = 0; k <= N; k++) {
            const nx = -Math.sin(hd), ny = Math.cos(hd);
            pts[0].push([px + nx * -4.6, py + ny * -4.6]); pts[1].push([px + nx * 4.6, py + ny * 4.6]);
            hd = (thd * (k + 0.5)) / N; px += (Ls / N) * Math.cos(hd); py += (Ls / N) * Math.sin(hd); hd = (thd * (k + 1)) / N;
          }
          const dstr = (p) => p.map((q, k) => (k ? 'L' : 'M') + fx(q[0], 1) + ' ' + fx(q[1], 1)).join(' ');
          R('bm-cu').setAttribute('d', dstr(pts[0])); R('bm-st').setAttribute('d', dstr(pts[1]));
          const tip = (theta * 100) / 2;
          R('bmtxt').textContent = t(T2(`Bends towards the steel. Real bend for a 10 cm strip: ${fx((theta * 180) / Math.PI, 1)}°, tip moves ${fx(tip, 1)} mm (drawn 12 times bigger)`, `इस्पात की ओर मुड़ती है। 10 cm की पट्टी में असल मोड़: ${fx((theta * 180) / Math.PI, 1)}°, सिरा ${fx(tip, 1)} mm खिसकता है (12 गुना बड़ा दिखाया)`));
          R('flame').setAttribute('opacity', st.heating ? 1 : 0);
          R('vT').textContent = fx(st.T, 0) + ' °C'; R('o-temp').textContent = fx(st.T, 0) + ' °C';
          const inp = c.root.querySelector('[data-key="slider:temp"]'); if (inp && document.activeElement !== inp) inp.value = st.T;
          const hb = c.root.querySelector('[data-key="heat"]'); if (hb) hb.setAttribute('aria-pressed', st.heating);
          const M = MATS[st.sel], dL = M.alpha * dT * 1000;
          R('info').innerHTML = `<h3>${esc(t(M.n))}</h3><p><b>ΔL = α × L${'<sub>0</sub>'} × ΔT</b></p><p>α = ${fx(M.alpha * 1e6, 0)} × 10${sup('−6')} /°C, L${'<sub>0</sub>'} = 1 m = 1000 mm, ΔT = ${fx(dT, 0)} °C</p><p>ΔL = ${fx(M.alpha * 1e6, 0)} × 10${sup('−6')} × 1000 × ${fx(dT, 0)} = <mark>${fx(dL, 2)} mm</mark></p>`;
          R('tbl').innerHTML = `<table class="ht-tbl"><caption style="text-align:left;font-weight:700">${esc(t(T2('Which grows most?', 'किसकी वृद्धि सबसे अधिक?')))}</caption><tr><th>${esc(t(T2('Material', 'पदार्थ')))}</th><th>α (10${sup('−6')}/°C)</th><th>ΔL (mm)</th></tr>${st.mats.slice().sort((a, b) => MATS[b].alpha - MATS[a].alpha).map((m) => `<tr><td>${esc(t(MATS[m].n))}</td><td>${fx(MATS[m].alpha * 1e6, 0)}</td><td>${fx(MATS[m].alpha * dT * 1000, 2)}</td></tr>`).join('')}</table>`;
        },
      };
    },
    tick(c, dt) {
      const st = c.st, before = st.T;
      if (st.goal != null) {
        const d = st.goal - st.T; st.T += c.reduced() ? d : Math.sign(d) * Math.min(Math.abs(d), 16 * dt);
        if (Math.abs(st.goal - st.T) < 1e-6) { st.T = st.goal; st.goal = null; st.heating = false; }
      }
      expansionMode.check(c, before);
      return st.goal != null;
    },
    check(c, before) {
      const st = c.st;
      if (before < 40 && st.T >= 40 && !st.up) { st.up = true; c.emit('expanded'); c.say(T2('The rods have grown longer! Plastic grew the most and wood the least. Metals grow a little, but the change is too small to see without a magnifier.', 'छड़ें लंबी हो गईं! प्लास्टिक सबसे अधिक बढ़ा और लकड़ी सबसे कम। धातुएँ थोड़ी बढ़ती हैं, पर यह बदलाव बिना आवर्धन के दिखता नहीं।')); }
      if (st.T < 30) st.up = false;
    },
    act(c, key) {
      const st = c.st;
      if (key === 'heat') { if (st.heating) { st.goal = null; st.heating = false; } else { st.goal = EXP.TMAX; st.heating = true; c.emit('heated'); c.api.record(c.t(T2('Heated the rods', 'छड़ें गर्म कीं'))); } }
      else if (key === 'cool') { st.goal = EXP.TMIN; st.heating = false; c.emit('cooled'); }
      else if (key.startsWith('material:')) { st.sel = key.slice(9); c.emit('selected:' + st.sel); }
      else if (key === 'thermometer') { c.say(T2(`The thermometer reads ${fx(st.T, 1)} °C. The rods started at ${EXP.TMIN} °C.`, `थर्मामीटर ${fx(st.T, 1)} °C पढ़ता है। छड़ें ${EXP.TMIN} °C से शुरू हुई थीं।`)); c.emit('reading'); }
    },
    input(c, key, v) { if (key === 'slider:temp') { const st = c.st, b = st.T; st.heating = false; st.goal = v; if (c.reduced()) st.T = v; c.emit('moved:temp'); expansionMode.check(c, b); } },
  };

  // ======================================================================================= MIXING MODE
  const MIX = { TAU: 0.9, END: 7, MOVE: 1.6 };
  const mixSample = (st) => (st.hot === 'water' ? WATER : MATS[st.hot]);
  const mixingMode = {
    init(cfg) { return { mats: cfg.materials || MATIDS.slice(), hot: 'water', T1: 80, m1: 200, T2: 20, m2: 200, phase: 'ready', tt: 0, mv: 0, live: null }; },
    calc(st) {
      const s = mixSample(st), C1 = (st.m1 / 1000) * s.c, C2 = (st.m2 / 1000) * WATER.c, Tf = (C1 * st.T1 + C2 * st.T2) / (C1 + C2);
      return { C1, C2, Tf, Q: C1 * (st.T1 - Tf) };
    },
    view(c) {
      const { t, st } = c;
      const g = graphMaker({ xmax: MIX.END, ymin: 0, ymax: 100, xt: 7, yt: 5, xlab: t(T2('time after mixing (s)', 'मिलाने के बाद समय (s)')), ylab: '°C', aria: t(T2('Graph: the hot and cold temperatures move together and meet', 'ग्राफ़: गर्म और ठंडे के तापमान पास आकर मिल जाते हैं')), series: [{ id: 'hot', col: '#E0301E', label: t(T2('hot sample', 'गर्म नमूना')) }, { id: 'cold', col: '#2563EB', label: t(T2('cold water', 'ठंडा पानी')) }], lw: 150, h: 190 });
      st.graph = g;
      const lvl = (m) => 18 + m * 0.14;
      const bk = (x, w, hgt, name) => `<clipPath id="${c.u}${name}"><path d="M${x} ${380 - hgt} V362 Q${x} 376 ${x + 14} 376 H${x + w - 14} Q${x + w} 376 ${x + w} 362 V${380 - hgt}Z"/></clipPath>`;
      void lvl; void bk;
      const scene = `<svg viewBox="0 0 600 410" class="ht-svg" role="img" aria-label="${esc(t(T2('Two samples at different temperatures are mixed in a beaker and reach one common temperature.', 'अलग-अलग तापमान के दो नमूने बीकर में मिलाए जाते हैं और दोनों एक ही तापमान पर पहुँच जाते हैं।')))}">
<defs><clipPath id="${c.u}cl"><path d="M330 150 V352 Q330 368 346 368 H514 Q530 368 530 352 V150Z"/></clipPath><clipPath id="${c.u}hl"><path d="M52 190 V352 Q52 368 68 368 H182 Q198 368 198 352 V190Z"/></clipPath>
<linearGradient id="${c.u}gl" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#DCEBF7" stop-opacity=".4"/></linearGradient>
<radialGradient id="${c.u}bulb" cx=".35" cy=".35"><stop offset="0" stop-color="#FF8A7A"/><stop offset="1" stop-color="#C2271A"/></radialGradient></defs>
<rect y="368" width="600" height="42" fill="#E5D3B5"/><rect y="368" width="600" height="5" fill="#CDB48C"/>
<g data-r="hotg"><g data-r="hotwater"><path d="M52 190 V352 Q52 368 68 368 H182 Q198 368 198 352 V190" fill="url(#${c.u}gl)" stroke="#6C8DA8" stroke-width="4" opacity=".6"/><rect data-r="hliq" x="52" y="300" width="146" height="70" fill="#E0301E" opacity=".85" clip-path="url(#${c.u}hl)"/>
<path d="M44 190 H62 M188 190 H206" stroke="#6C8DA8" stroke-width="4" stroke-linecap="round"/></g>
<g data-r="hotblock" opacity="0"><line data-r="string" x1="125" x2="125" y1="70" y2="150" stroke="#475569" stroke-width="3"/><rect data-r="block" x="95" y="150" width="60" height="60" rx="6" fill="#C8742F" stroke="#334155" stroke-width="3"/><rect data-r="blockhi" x="99" y="154" width="52" height="10" rx="4" fill="#fff" opacity=".35"/></g>
<text x="125" y="396" text-anchor="middle" class="ht-lb" data-r="hotlbl"></text></g>
<g><path d="M330 150 V352 Q330 368 346 368 H514 Q530 368 530 352 V150" fill="url(#${c.u}gl)" stroke="#6C8DA8" stroke-width="4" opacity=".6"/><rect data-r="cliq" x="330" y="300" width="200" height="70" fill="#2563EB" opacity=".85" clip-path="url(#${c.u}cl)"/>
<path d="M322 150 H342 M518 150 H538" stroke="#6C8DA8" stroke-width="4" stroke-linecap="round"/>
<rect data-r="cblock" x="395" y="240" width="60" height="60" rx="6" fill="#C8742F" stroke="#334155" stroke-width="3" opacity="0"/></g>
<text x="430" y="396" text-anchor="middle" class="ht-lb" data-r="coldlbl"></text>
<g data-key="thermometer" role="button" tabindex="0" class="ht-clk" aria-label="${esc(t(T2('Thermometer in the beaker: tap to read it', 'बीकर में थर्मामीटर: पढ़ने के लिए दबाओ')))}">
<rect x="478" y="96" width="44" height="262" fill="transparent"/><rect x="492" y="108" width="14" height="224" rx="7" fill="#F3FAFF" stroke="#5B7A92" stroke-width="2.5"/><circle cx="499" cy="338" r="13" fill="#F3FAFF" stroke="#5B7A92" stroke-width="2.5"/>
<rect data-r="mer" x="495.5" y="250" width="7" height="86" rx="3.5" fill="#E0301E"/><circle cx="499" cy="338" r="8.5" fill="url(#${c.u}bulb)"/></g>
<text data-r="trd" x="430" y="120" text-anchor="middle" class="ht-lb" style="font-size:22px"></text>
<text data-r="t1" x="125" y="40" text-anchor="middle" class="ht-lb" style="font-size:22px"></text>
<path data-r="arrow" d="M215 120 Q270 70 316 120" fill="none" stroke="#475569" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 8"/>
</svg>${g.svg}`;
      const sampleBtns = [btn('material:water', `<i class="ht-dot" style="background:${WATER.col}"></i>`, t(WATER.n), 'ht-chipbtn', 'aria-pressed="true"')].concat(st.mats.map((m) => btn('material:' + m, `<i class="ht-dot" style="background:${MATS[m].col}"></i>`, t(MATS[m].n), 'ht-chipbtn', 'aria-pressed="false"'))).join('');
      const side = `
${card(`<p style="margin:0 0 6px;font-weight:700">${esc(t(T2('The hot sample is:', 'गर्म नमूना है:')))}</p><div class="ht-row" role="group" aria-label="${esc(t(T2('Hot sample material', 'गर्म नमूने का पदार्थ')))}">${sampleBtns}</div>`)}
${card(`<div class="ht-sls ht-two">${slider('slider:temp', t(T2('Hot sample temperature', 'गर्म नमूने का तापमान')), 40, 100, 1, st.T1, st.T1 + ' °C', 'o-t1')}${slider('slider:mass', t(T2('Hot sample mass', 'गर्म नमूने का द्रव्यमान')), 50, 500, 10, st.m1, st.m1 + ' g', 'o-m1')}${slider('slider:coldtemp', t(T2('Cold water temperature', 'ठंडे पानी का तापमान')), 0, 35, 1, st.T2, st.T2 + ' °C', 'o-t2')}${slider('slider:coldmass', t(T2('Cold water mass', 'ठंडे पानी का द्रव्यमान')), 50, 500, 10, st.m2, st.m2 + ' g', 'o-m2')}</div>`)}
<div class="ht-row">${btn('mix', ICON.mix, t(T2('Mix', 'मिलाओ')), 'ht-hot')}${btn('thermometer', ICON.thermo, t(T2('Read', 'पढ़ो')), 'ht-plain')}${btn('reset', ICON.reset, t(T2('Start again', 'फिर से')), 'ht-plain')}</div>
${card('', 'ht-eq', 'info')}`;
      return {
        scene, side,
        refresh() {
          const R = c.R, s = mixSample(st), cc = mixingMode.calc(st), solid = st.hot !== 'water';
          let T1 = st.T1, T2v = st.T2;
          if (st.phase !== 'ready') { const k = st.phase === 'mixed' ? 1 : Math.exp(-st.tt / MIX.TAU), dT = (st.T1 - st.T2) * k; T1 = cc.Tf + (cc.C2 / (cc.C1 + cc.C2)) * dT; T2v = cc.Tf - (cc.C1 / (cc.C1 + cc.C2)) * dT; if (st.phase === 'mixed') { T1 = T2v = cc.Tf; } }
          const mv = ease(st.mv);
          const wh = 18 + st.m1 * 0.14, wc = 18 + (st.m2 + (st.phase !== 'ready' && !solid ? st.m1 * mv : 0)) * 0.14;
          // hot side
          R('hotwater').setAttribute('opacity', solid ? 0 : 1); R('hotblock').setAttribute('opacity', solid && st.phase === 'ready' ? 1 : 0);
          const hl = R('hliq'); hl.setAttribute('y', 368 - wh * (1 - (solid ? 1 : mv))); hl.setAttribute('fill', ramp(T1 / 100)); hl.setAttribute('opacity', st.phase === 'ready' || !solid ? 0.85 : 0);
          R('hotg').setAttribute('transform', !solid && st.phase !== 'ready' ? `translate(${fx(mv * 150, 1)} ${fx(-mv * 70, 1)}) rotate(${fx(mv * 55, 1)} 125 360)` : 'translate(0 0)');
          R('hotg').setAttribute('opacity', !solid && st.phase !== 'ready' && mv >= 1 ? 0 : 1);
          if (solid) {
            const vol = (st.m1 / 1000) / s.rho * 1e6, side_ = clamp(Math.cbrt(vol) * 10, 22, 70);
            const bx = R('block'), bh = R('blockhi');
            const dip = st.phase === 'ready' ? 0 : mv, by = lerp(150, 368 - wc + 10, dip) , bxx = lerp(125, 430, dip);
            bx.setAttribute('width', side_); bx.setAttribute('height', side_); bh.setAttribute('width', side_ - 8);
            const cb = R('cblock'); cb.setAttribute('width', side_); cb.setAttribute('height', side_); cb.setAttribute('x', 430 - side_ / 2); cb.setAttribute('y', 368 - wc + 14); cb.setAttribute('fill', mixHex(s.col, ramp(T1 / 100), 0.45)); cb.setAttribute('opacity', st.phase === 'ready' ? 0 : mv > 0.98 ? 1 : 0);
            bx.setAttribute('fill', mixHex(s.col, ramp(T1 / 100), 0.45)); bx.setAttribute('x', fx(bxx - side_ / 2, 1)); bx.setAttribute('y', fx(by, 1)); bh.setAttribute('x', fx(bxx - side_ / 2 + 4, 1)); bh.setAttribute('y', fx(by + 4, 1));
            const sg = R('string'); sg.setAttribute('x1', fx(bxx, 1)); sg.setAttribute('x2', fx(bxx, 1)); sg.setAttribute('y2', fx(by, 1)); sg.setAttribute('y1', 70);
            R('hotblock').setAttribute('opacity', st.phase === 'ready' || mv < 0.98 ? 1 : 0);
          }
          const cl = R('cliq'); cl.setAttribute('y', 368 - wc); cl.setAttribute('height', wc + 4); cl.setAttribute('fill', ramp(T2v / 100));
          R('arrow').setAttribute('opacity', st.phase === 'ready' ? 1 : 0);
          R('hotlbl').textContent = `${t(s.n)} ${st.m1} g`; R('coldlbl').textContent = `${t(WATER.n)} ${st.phase !== 'ready' && !solid ? st.m1 + st.m2 : st.m2} g`;
          R('t1').textContent = st.phase === 'ready' || solid ? fx(T1, 1) + ' °C' : '';
          const Tm = st.phase === 'ready' ? T2v : T2v;
          R('trd').textContent = fx(Tm, 1) + ' °C';
          const mh = 10 + clamp(Tm / 100, 0, 1) * 214; R('mer').setAttribute('height', mh); R('mer').setAttribute('y', 340 - mh);
          // graph
          const xs = [], n = 50, tEnd = st.phase === 'ready' ? 0 : st.phase === 'mixed' ? MIX.END : Math.min(MIX.END, st.tt);
          for (let i = 0; i <= n; i++) xs.push((tEnd * i) / n);
          const dT0 = st.T1 - st.T2;
          if (st.phase === 'ready') { st.graph.set(R, 'hot', [0, 0], [st.T1, st.T1]); st.graph.set(R, 'cold', [0, 0], [st.T2, st.T2]); }
          else { st.graph.set(R, 'hot', xs, xs.map((x) => cc.Tf + (cc.C2 / (cc.C1 + cc.C2)) * dT0 * Math.exp(-x / MIX.TAU))); st.graph.set(R, 'cold', xs, xs.map((x) => cc.Tf - (cc.C1 / (cc.C1 + cc.C2)) * dT0 * Math.exp(-x / MIX.TAU))); }
          // inputs
          const syn = (k, v, out, r) => { const el = c.root.querySelector(`[data-key="${k}"]`); if (el && document.activeElement !== el) el.value = v; R(r).textContent = out; };
          syn('slider:temp', st.T1, st.T1 + ' °C', 'o-t1'); syn('slider:mass', st.m1, st.m1 + ' g', 'o-m1'); syn('slider:coldtemp', st.T2, st.T2 + ' °C', 'o-t2'); syn('slider:coldmass', st.m2, st.m2 + ' g', 'o-m2');
          ['water'].concat(st.mats).forEach((m) => { const b = c.root.querySelector(`[data-key="material:${m}"]`); if (b) b.setAttribute('aria-pressed', st.hot === m); });
          const mixb = c.root.querySelector('[data-key="mix"]'); if (mixb) mixb.disabled = st.phase !== 'ready';
          const kg = (m) => fx(m / 1000, 3);
          let html = `<table class="ht-tbl"><tr><th></th><th>m (kg)</th><th>c (J/kg·°C)</th><th>T (°C)</th></tr><tr><td>${esc(t(s.n))}</td><td>${kg(st.m1)}</td><td>${s.c}</td><td>${st.T1}</td></tr><tr><td>${esc(t(WATER.n))}</td><td>${kg(st.m2)}</td><td>${WATER.c}</td><td>${st.T2}</td></tr></table>`;
          if (st.phase === 'mixed') {
            const Q = cc.Q / 1000;
            html += `<p><b>${esc(t(T2('Heat lost by the hot sample', 'गर्म नमूने ने गर्मी खोई')))}</b><br>Q = m c (T${'<sub>1</sub>'} − T) = ${kg(st.m1)} × ${s.c} × (${st.T1} − ${fx(cc.Tf, 1)}) = <mark>${fx(Q, 2)} kJ</mark></p><p><b>${esc(t(T2('Heat gained by the cold water', 'ठंडे पानी ने गर्मी पाई')))}</b><br>Q = m c (T − T${'<sub>2</sub>'}) = ${kg(st.m2)} × ${WATER.c} × (${fx(cc.Tf, 1)} − ${st.T2}) = <mark>${fx(Q, 2)} kJ</mark></p><p><b>${esc(t(T2('Final temperature', 'अंतिम तापमान')))}</b>: T = (m${'<sub>1</sub>'}c${'<sub>1</sub>'}T${'<sub>1</sub>'} + m${'<sub>2</sub>'}c${'<sub>2</sub>'}T${'<sub>2</sub>'}) / (m${'<sub>1</sub>'}c${'<sub>1</sub>'} + m${'<sub>2</sub>'}c${'<sub>2</sub>'}) = <mark>${fx(cc.Tf, 1)} °C</mark></p><p>${esc(t(T2('Heat lost = heat gained. Heat only moved from hot to cold.', 'खोई गर्मी = पाई गर्मी। गर्मी केवल गर्म से ठंडे की ओर गई।')))}</p>`;
          } else html += `<p>${esc(t(T2('Guess the final temperature, then press Mix.', 'अंतिम तापमान का अनुमान लगाओ, फिर "मिलाओ" दबाओ।')))}</p>`;
          R('info').innerHTML = html;
        },
      };
    },
    tick(c, dt) {
      const st = c.st; if (st.phase === 'ready') return false;
      if (st.phase === 'moving') {
        st.mv = Math.min(1, st.mv + (c.reduced() ? 1 : dt / MIX.MOVE));
        if (st.mv >= 1) { st.phase = 'mixing'; st.tt = 0; }
      } else if (st.phase === 'mixing') {
        st.tt += c.reduced() ? MIX.END : dt;
        if (st.tt >= MIX.END) {
          st.phase = 'mixed'; const cc = mixingMode.calc(st);
          c.say(T2(`Equilibrium! Both are now at ${fx(cc.Tf, 1)} °C. Heat lost by the hot sample equals heat gained by the cold water.`, `साम्य! अब दोनों ${fx(cc.Tf, 1)} °C पर हैं। गर्म नमूने की खोई गर्मी = ठंडे पानी की पाई गर्मी।`));
          c.api.record(c.t(T2('Mixed. Final temperature ', 'मिलाया। अंतिम तापमान ')) + fx(cc.Tf, 1) + ' °C');
          c.emit('equilibrium');
        }
      }
      return true;
    },
    act(c, key) {
      const st = c.st;
      if (key === 'mix' && st.phase === 'ready') { st.phase = 'moving'; st.mv = 0; st.tt = 0; c.emit('mixed'); c.say(null); }
      else if (key === 'reset') { st.phase = 'ready'; st.mv = 0; st.tt = 0; c.say(null); }
      else if (key.startsWith('material:')) { st.hot = key.slice(9); st.phase = 'ready'; st.mv = 0; c.emit('selected:' + st.hot); }
      else if (key === 'thermometer') {
        const cc = mixingMode.calc(st), T = st.phase === 'ready' ? st.T2 : st.phase === 'mixed' ? cc.Tf : st.T2 + (cc.Tf - st.T2) * (1 - Math.exp(-st.tt / MIX.TAU));
        c.say(T2(`The thermometer in the cold water reads ${fx(T, 1)} °C.`, `ठंडे पानी में रखा थर्मामीटर ${fx(T, 1)} °C पढ़ता है।`)); c.emit('reading');
      }
    },
    input(c, key, v) {
      const st = c.st, m = { 'slider:temp': 'T1', 'slider:mass': 'm1', 'slider:coldtemp': 'T2', 'slider:coldmass': 'm2' }[key];
      if (m) { st[m] = v; st.phase = 'ready'; st.mv = 0; c.emit('moved:' + key.slice(7)); }
    },
  };

  // ======================================================================================= CYCLE MODE (Carnot)
  const CY = { n: 0.1, R: 8.314, g: 1.4, V1: 0.001, ratio: 2, SPEED: 0.25 };
  function cyclePts(Th, Tc) {
    const k = Math.pow(Th / Tc, 1 / (CY.g - 1)), V1 = CY.V1, V2 = V1 * CY.ratio, V3 = V2 * k, V4 = V1 * k;
    return { V1, V2, V3, V4, k };
  }
  function cycleAt(s, Th, Tc) {
    const p = cyclePts(Th, Tc), st = Math.min(3, Math.floor(s)), f = s - st, nR = CY.n * CY.R;
    let V, T;
    if (st === 0) { V = p.V1 * Math.pow(p.V2 / p.V1, f); T = Th; }
    else if (st === 1) { V = p.V2 * Math.pow(p.V3 / p.V2, f); T = Th * Math.pow(p.V2 / V, CY.g - 1); }
    else if (st === 2) { V = p.V3 * Math.pow(p.V4 / p.V3, f); T = Tc; }
    else { V = p.V4 * Math.pow(p.V1 / p.V4, f); T = Tc * Math.pow(p.V4 / V, CY.g - 1); }
    const P = (nR * T) / V, QhFull = nR * Th * Math.log(CY.ratio), QcFull = nR * Tc * Math.log(CY.ratio);
    const Qh = st === 0 ? nR * Th * Math.log(V / p.V1) : QhFull;
    const Qc = st < 2 ? 0 : st === 2 ? nR * Tc * Math.log(p.V3 / V) : QcFull;
    const W = Qh - Qc - (nR / (CY.g - 1)) * (T - Th);
    return { V, T, P, stage: st, Qh, Qc, W, QhFull, QcFull };
  }
  const CYST = [
    { n: T2('A to B: isothermal expansion', 'A से B: समतापी प्रसार'), d: T2('The gas touches the hot reservoir. It takes in heat Qh and expands at constant temperature, pushing the piston up.', 'गैस गर्म भंडार को छूती है। यह ऊष्मा Qh लेती है और स्थिर तापमान पर फैलकर पिस्टन को ऊपर धकेलती है।') },
    { n: T2('B to C: adiabatic expansion', 'B से C: रुद्धोष्म प्रसार'), d: T2('The gas is insulated: no heat goes in or out. It keeps expanding and cools from Th to Tc as it does work.', 'गैस अवरोधित है: न ऊष्मा आती है, न जाती है। यह फैलती रहती है और कार्य करते हुए Th से Tc तक ठंडी होती है।') },
    { n: T2('C to D: isothermal compression', 'C से D: समतापी संपीडन'), d: T2('The gas touches the cold reservoir. The piston squeezes it and it gives out heat Qc at constant temperature.', 'गैस ठंडे भंडार को छूती है। पिस्टन इसे दबाता है और यह स्थिर तापमान पर ऊष्मा Qc बाहर देती है।') },
    { n: T2('D to A: adiabatic compression', 'D से A: रुद्धोष्म संपीडन'), d: T2('The gas is insulated again. Squeezing it warms it from Tc back to Th, and the cycle is ready to start again.', 'गैस फिर अवरोधित है। दबाने से यह Tc से वापस Th तक गर्म होती है और चक्र फिर शुरू होने को तैयार है।') },
  ];
  const cycleMode = {
    init() { return { Th: 600, Tc: 300, s: 0, playing: false, target: null, lastStage: 0, cycles: 0, live: null, snapAt: 0 }; },
    view(c) {
      const { t, st } = c;
      const scene = `<div class="ht-duo"><svg viewBox="0 0 300 340" class="ht-svg" role="img" aria-label="${esc(t(T2('A cylinder of gas with a piston, resting on a hot block, an insulating block or a cold block.', 'पिस्टन वाला गैस का सिलिंडर, जो गर्म, अवरोधक या ठंडे ब्लॉक पर रखा है।')))}">
<defs><linearGradient id="${c.u}pg" x1="0" x2="1"><stop offset="0" stop-color="#94A3B8"/><stop offset=".5" stop-color="#E2E8F0"/><stop offset="1" stop-color="#94A3B8"/></linearGradient></defs>
<rect x="70" y="272" width="160" height="50" rx="10" data-r="blk" fill="#E0301E" stroke="#334155" stroke-width="3"/><text data-r="blktxt" x="150" y="304" text-anchor="middle" class="ht-lb" style="fill:#1E293B"></text>
<rect data-r="gas" x="92" y="100" width="116" height="170" fill="#FFB36B" opacity=".9"/>
<path d="M90 28 V266 H210 V28" fill="none" stroke="#475569" stroke-width="6" stroke-linejoin="round"/><rect x="86" y="264" width="128" height="10" rx="4" fill="#64748B"/>
<g data-r="pist"><rect x="93" y="0" width="114" height="16" rx="5" fill="url(#${c.u}pg)" stroke="#475569" stroke-width="2.5"/><rect x="143" y="-60" width="14" height="62" fill="#94A3B8" stroke="#475569" stroke-width="2"/></g>
<g data-r="harr" opacity="0"><path d="M150 268 v-36 m-12 12 l12 -14 l12 14" fill="none" stroke="#E0301E" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g>
<g data-r="carr" opacity="0"><path d="M150 232 v36 m-12 -12 l12 14 l12 -14" fill="none" stroke="#2563EB" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g>
<text data-r="tg" x="150" y="258" text-anchor="middle" class="ht-lb" style="fill:#1E293B;font-size:20px"></text>
</svg>
<svg viewBox="0 0 340 340" class="ht-svg" role="img" aria-label="${esc(t(T2('Pressure-volume diagram of the cycle with the four stages A to D.', 'चक्र का दाब-आयतन आरेख, चार चरण A से D।')))}" data-r="pv"></svg></div>`;
      const side = `
${card(`<div class="ht-sls ht-two">${slider('slider:temp', t(T2('Hot reservoir Th', 'गर्म भंडार Th')), 400, 800, 10, st.Th, st.Th + ' K', 'o-th')}${slider('slider:cold', t(T2('Cold reservoir Tc', 'ठंडा भंडार Tc')), 250, 380, 10, st.Tc, st.Tc + ' K', 'o-tc')}</div>`)}
<div class="ht-row">${btn('heat', ICON.play, t(T2('Run the engine', 'इंजन चलाओ')), 'ht-hot', 'aria-pressed="false"')}${btn('step', ICON.step, t(T2('Next stage', 'अगला चरण')), 'ht-plain')}${btn('reset', ICON.reset, t(T2('Start again', 'फिर से')), 'ht-plain')}</div>
${card('', '', 'stage')}${card('', 'ht-eq', 'info')}`;
      return {
        scene, side,
        refresh() {
          const R = c.R, p = cyclePts(st.Th, st.Tc), cur = cycleAt(st.s, st.Th, st.Tc);
          // PV diagram
          const Vmax = p.V3 * 1.06, Pmax = (CY.n * CY.R * st.Th) / p.V1 * 1.06;
          const ox = 52, oy = 296, W = 270, H = 262;
          const X = (V) => ox + (V / Vmax) * W, Y = (P) => oy - (P / Pmax) * H;
          const curve = (s0, s1) => { const a = []; for (let i = 0; i <= 40; i++) { const q = cycleAt(Math.min(3.9999, s0 + ((s1 - s0) * i) / 40), st.Th, st.Tc); a.push(`${i ? 'L' : 'M'}${fx(X(q.V), 1)} ${fx(Y(q.P), 1)}`); } return a.join(' '); };
          const cols = ['#E0301E', '#FF7A1A', '#2563EB', '#8B3DFF'];
          const nice = (v) => { const e = Math.pow(10, Math.floor(Math.log10(v))); const f = v / e; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e; };
          const vStep = nice(Vmax / 4), pStep = nice(Pmax / 4);
          let ax = '';
          for (let v = 0; v <= Vmax; v += vStep) ax += `<line x1="${X(v)}" x2="${X(v)}" y1="${oy}" y2="${oy + 6}" stroke="#334155" stroke-width="2"/><text x="${X(v)}" y="${oy + 22}" text-anchor="middle" class="ht-gt">${fx(v * 1000, vStep * 1000 < 1 ? 1 : 0)}</text>`;
          for (let q = 0; q <= Pmax; q += pStep) ax += `<line x1="${ox - 6}" x2="${ox}" y1="${Y(q)}" y2="${Y(q)}" stroke="#334155" stroke-width="2"/><text x="${ox - 9}" y="${Y(q) + 5}" text-anchor="end" class="ht-gt">${fx(q / 1000, 0)}</text>`;
          const pts = [['A', 0], ['B', 1], ['C', 2], ['D', 3]].map(([n, s]) => { const q = cycleAt(s, st.Th, st.Tc); return { n, x: X(q.V), y: Y(q.P) }; });
          const poly = []; for (let s = 0; s < 4; s += 0.1) { const q = cycleAt(s, st.Th, st.Tc); poly.push(`${fx(X(q.V), 1)},${fx(Y(q.P), 1)}`); }
          const lab = pts.map((q) => { const dx = q.n === 'A' ? -16 : q.n === 'B' ? 10 : q.n === 'C' ? 6 : -8, dy = q.n === 'A' ? -8 : q.n === 'B' ? -8 : q.n === 'C' ? -12 : 22; return `<circle cx="${q.x}" cy="${q.y}" r="4.5" fill="#fff" stroke="#334155" stroke-width="2"/><text x="${q.x + dx}" y="${q.y + dy}" class="ht-lb">${q.n}</text>`; }).join('');
          const trace = `<path d="${curve(0, Math.min(3.9999, Math.max(0.0001, st.s)))}" fill="none" stroke="#0F172A" stroke-width="7" stroke-linecap="round" opacity=".2"/>`;
          R('pv').innerHTML = `<rect width="340" height="340" fill="#fff"/><polygon points="${poly.join(' ')}" fill="#FFE9A8" opacity=".75"/>
<line x1="${ox}" x2="${ox}" y1="22" y2="${oy}" stroke="#475569" stroke-width="2.5"/><line x1="${ox}" x2="${ox + W + 8}" y1="${oy}" y2="${oy}" stroke="#475569" stroke-width="2.5"/>${ax}
<text x="${ox + W / 2}" y="332" text-anchor="middle" class="ht-gl">${esc(t(T2('volume V (litres)', 'आयतन V (लीटर)')))}</text><text transform="translate(12 ${oy - H / 2}) rotate(-90)" text-anchor="middle" class="ht-gl">${esc(t(T2('pressure P (kPa)', 'दाब P (kPa)')))}</text>
${cols.map((cl, i) => `<path d="${curve(i, i + 0.9999)}" fill="none" stroke="${cl}" stroke-width="4" stroke-linecap="round"/>`).join('')}${trace}${lab}
<circle cx="${fx(X(cur.V), 1)}" cy="${fx(Y(cur.P), 1)}" r="9" fill="${ramp((cur.T - 250) / 550)}" stroke="#0F172A" stroke-width="3"/>`;
          // cylinder
          const frac = cur.V / p.V3, top = 266 - 8 - frac * 160 - 12;
          R('pist').setAttribute('transform', `translate(0 ${fx(top, 1)})`);
          R('gas').setAttribute('y', fx(top + 16, 1)); R('gas').setAttribute('height', fx(266 - top - 16, 1)); R('gas').setAttribute('fill', ramp((cur.T - 250) / 550));
          const stg = cur.stage, blk = R('blk');
          blk.setAttribute('fill', stg === 0 ? '#FF7A1A' : stg === 2 ? '#7DD3FC' : '#CBD5E1'); R('blktxt').textContent = stg === 0 ? t(T2(`Hot ${st.Th} K`, `गर्म ${st.Th} K`)) : stg === 2 ? t(T2(`Cold ${st.Tc} K`, `ठंडा ${st.Tc} K`)) : t(T2('Insulated', 'अवरोधित'));
          R('harr').setAttribute('opacity', stg === 0 ? 1 : 0); R('carr').setAttribute('opacity', stg === 2 ? 1 : 0);
          R('tg').textContent = fx(cur.T, 0) + ' K';
          R('stage').innerHTML = `<h3>${esc(t(CYST[stg].n))}</h3><p>${esc(t(CYST[stg].d))}</p>`;
          const eta = 1 - st.Tc / st.Th, full = cycleAt(3.9999, st.Th, st.Tc);
          void full;
          R('info').innerHTML = `<table class="ht-tbl"><tr><th>${esc(t(T2('So far', 'अब तक')))}</th><th>J</th></tr><tr><td>${esc(t(T2('Heat taken in, Qh', 'ली गई ऊष्मा, Qh')))}</td><td>${fx(cur.Qh, 1)}</td></tr><tr><td>${esc(t(T2('Heat given out, Qc', 'दी गई ऊष्मा, Qc')))}</td><td>${fx(cur.Qc, 1)}</td></tr><tr><td>${esc(t(T2('Work done by gas', 'गैस द्वारा किया कार्य')))}</td><td>${fx(cur.W, 1)}</td></tr></table>
<p>${esc(t(T2('Full cycle', 'पूरा चक्र')))}: Qh = ${fx(cur.QhFull, 1)} J, Qc = ${fx(cur.QcFull, 1)} J, W = Qh − Qc = <mark>${fx(cur.QhFull - cur.QcFull, 1)} J</mark></p><p>η = W/Qh = <mark>${fx(((cur.QhFull - cur.QcFull) / cur.QhFull) * 100, 1)}%</mark> = 1 − Tc/Th = 1 − ${st.Tc}/${st.Th} = ${fx(eta * 100, 1)}%</p><p style="font-size:14px;color:var(--ink-2,#475569)">${esc(t(T2('Ideal gas (air, γ = 1.4), 0.1 mol, volume doubles in the isothermal expansion.', 'आदर्श गैस (वायु, γ = 1.4), 0.1 मोल; समतापी प्रसार में आयतन दोगुना होता है।')))}</p>`;
          const hb = c.root.querySelector('[data-key="heat"]'); if (hb) { hb.setAttribute('aria-pressed', st.playing); hb.lastChild.textContent = st.playing ? t(T2('Pause', 'रोको')) : t(T2('Run the engine', 'इंजन चलाओ')); hb.firstChild.outerHTML = st.playing ? ICON.pause : ICON.play; }
          const a = c.root.querySelector('[data-key="slider:temp"]'), b = c.root.querySelector('[data-key="slider:cold"]');
          if (a && document.activeElement !== a) a.value = st.Th; if (b && document.activeElement !== b) b.value = st.Tc;
          R('o-th').textContent = st.Th + ' K'; R('o-tc').textContent = st.Tc + ' K';
        },
      };
    },
    tick(c, dt) {
      const st = c.st; let ds = 0;
      if (st.playing) { if (c.reduced()) { st.snapAt += dt; if (st.snapAt > 2.5) { st.snapAt = 0; ds = Math.floor(st.s) + 1 - st.s; } } else ds = CY.SPEED * dt; }
      else if (st.target != null) { ds = Math.min(0.7 * dt, st.target - st.s); if (c.reduced()) ds = st.target - st.s; if (st.target - st.s - ds < 1e-9) { ds = st.target - st.s; st.target = null; } }
      if (!ds) return false;
      st.s += ds;
      if (st.s >= 4 - 1e-9) { st.s -= 4; st.cycles++; st.lastStage = 0; c.emit('cycle-done'); c.emit('stage:0'); const eta = 1 - st.Tc / st.Th; c.say(T2(`One full cycle done. The engine turned ${fx(eta * 100, 1)}% of the heat it took in into work, and gave the rest to the cold reservoir. No engine can do better between these temperatures.`, `एक पूरा चक्र पूरा हुआ। इंजन ने ली गई ऊष्मा का ${fx(eta * 100, 1)}% कार्य में बदला और बाकी ठंडे भंडार को दे दी। इन तापमानों के बीच कोई इंजन इससे बेहतर नहीं हो सकता।`)); if (st.playing && st.cycles >= 1) st.playing = false; }
      const sg = Math.floor(st.s);
      if (sg !== st.lastStage) { st.lastStage = sg; c.emit('stage:' + sg); }
      return true;
    },
    act(c, key) {
      const st = c.st;
      if (key === 'heat') { st.playing = !st.playing; st.target = null; st.snapAt = 0; if (st.playing) { c.emit('heated'); c.api.record(c.t(T2('Started the engine', 'इंजन चलाया'))); } }
      else if (key === 'step') { st.playing = false; st.target = Math.floor(st.s + 1e-6) + 1; }
      else if (key === 'reset') { st.s = 0; st.playing = false; st.target = null; st.lastStage = 0; c.say(null); }
    },
    input(c, key, v) {
      const st = c.st;
      if (key === 'slider:temp') { st.Th = v; if (st.Tc > v - 50) st.Tc = v - 50; c.emit('moved:temp'); }
      else if (key === 'slider:cold') { st.Tc = Math.min(v, st.Th - 50); c.emit('moved:cold'); }
    },
  };

  // ======================================================================================= SEA BREEZE MODE
  const landT = (h) => {
    const Tmin = 24, Tmax = 36, hh = h < 5 ? h + 24 : h;
    if (hh < 14) { const u = (hh - 5) / 9; return Tmin + (Tmax - Tmin) * ((1 - Math.cos(Math.PI * u)) / 2); }
    const u = (hh - 14) / 15; return Tmax - (Tmax - Tmin) * ((1 - Math.cos(Math.PI * u)) / 2);
  };
  const seaT = (h) => 28.5 + 0.6 * Math.cos((2 * Math.PI * (h - 15.5)) / 24);
  const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
  const clock = (h, t) => {
    const hh = Math.floor(h) % 24, mn = Math.round((h - Math.floor(h)) * 60), h12 = hh % 12 || 12;
    const part = hh < 4 ? T2('night', 'रात') : hh < 12 ? T2('morning', 'सुबह') : hh < 16 ? T2('afternoon', 'दोपहर') : hh < 19 ? T2('evening', 'शाम') : T2('night', 'रात');
    return `${h12}:${String(mn).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'} (${t(part)})`;
  };
  const seaMode = {
    init() { return { h: 8, playing: false, parts: Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random() })), ctx: null, A: 0, fired: {}, flow: 0, tt: 0, live: null }; },
    state(h) { const L_ = landT(h), S = seaT(h), d = L_ - S; return { L: L_, S, d, A: d * (d > 0 ? 0.06 : 0.05) * smooth(0.6, 1.6, Math.abs(d)) }; },
    view(c) {
      const { t, st } = c;
      const scene = `<canvas width="1200" height="800" role="img" aria-label="${esc(t(T2('A coast: sea on the left, land on the right. The sun or moon moves across the sky. Air moves in a loop between sea and land.', 'एक तट: बायीं ओर समुद्र, दायीं ओर ज़मीन। आकाश में सूर्य या चाँद चलता है। समुद्र और ज़मीन के बीच हवा चक्कर लगाती है।')))}"></canvas>`;
      const side = `
${card(`<div class="ht-sls">${slider('slider:time', t(T2('Time of day', 'दिन का समय')), 0, 24, 0.5, st.h, clock(st.h, t), 'o-time')}</div>`)}
<div class="ht-chips" role="group" aria-label="${esc(t(T2('Temperatures', 'तापमान')))}"><div class="ht-chip" style="background:#FFD9B8"><b data-r="vL">--</b><span>${esc(t(T2('land °C', 'ज़मीन °C')))}</span></div><div class="ht-chip" style="background:#BFEFFA"><b data-r="vS">--</b><span>${esc(t(T2('sea °C', 'समुद्र °C')))}</span></div><div class="ht-chip" style="background:#E6D6FF"><b data-r="vD">--</b><span>${esc(t(T2('land − sea', 'ज़मीन − समुद्र')))}</span></div></div>
<div class="ht-row">${btn('heat', ICON.play, t(T2('Run the day', 'दिन चलाओ')), 'ht-hot', 'aria-pressed="false"')}${btn('thermometer', ICON.thermo, t(T2('Read both', 'दोनों पढ़ो')), 'ht-plain')}</div>
${card('', 'ht-eq', 'info')}
${card(`<h3>${esc(t(T2('Why do they differ?', 'अंतर क्यों?')))}</h3><p>${esc(t(T2('Specific heat: water 4186 J/(kg·°C), dry sand about 830 J/(kg·°C). The same sunshine warms sand about five times as much. The sea also mixes heat down into deep water.', 'विशिष्ट ऊष्मा: पानी 4186 J/(kg·°C), सूखी रेत लगभग 830 J/(kg·°C)। उतनी ही धूप रेत को लगभग पाँच गुना अधिक गर्म करती है। समुद्र गर्मी को गहराई तक भी बाँट देता है।')))}</p>`)}`;
      return {
        scene, side,
        bind() { st.ctx = mkCanvas(c, c.root.querySelector('.ht-scene'), 600, 400); },
        refresh() {
          const R = c.R, S_ = seaMode.state(st.h);
          R('vL').textContent = fx(S_.L, 1); R('vS').textContent = fx(S_.S, 1); R('vD').textContent = (S_.d >= 0 ? '+' : '−') + fx(Math.abs(S_.d), 1);
          const ti = c.root.querySelector('[data-key="slider:time"]'); if (ti && document.activeElement !== ti) ti.value = st.h;
          R('o-time').textContent = clock(st.h, t);
          const hb = c.root.querySelector('[data-key="heat"]'); if (hb) { hb.setAttribute('aria-pressed', st.playing); hb.lastChild.textContent = st.playing ? t(T2('Pause', 'रोको')) : t(T2('Run the day', 'दिन चलाओ')); }
          const w = S_.A > 0.02 ? T2('Sea breeze: cool air blows from the sea to the land.', 'समुद्री पवन: ठंडी हवा समुद्र से ज़मीन की ओर चलती है।') : S_.A < -0.02 ? T2('Land breeze: cool air blows from the land to the sea.', 'स्थल पवन: ठंडी हवा ज़मीन से समुद्र की ओर चलती है।') : T2('Calm: land and sea are almost equally warm, so there is little wind.', 'शांत: ज़मीन और समुद्र लगभग बराबर गर्म हैं, इसलिए हवा कम है।');
          const why = S_.A > 0.02 ? T2('Land is warmer. Its air warms, expands and rises. Cooler, denser air from the sea rushes in to take its place.', 'ज़मीन अधिक गर्म है। उसकी हवा गर्म होकर फैलती और ऊपर उठती है। समुद्र की ठंडी, घनी हवा उसकी जगह लेने दौड़ती है।') : S_.A < -0.02 ? T2('Land has cooled quickly but the sea is still warm. Warm air rises over the sea, and cooler air from the land flows out to replace it.', 'ज़मीन जल्दी ठंडी हो गई पर समुद्र अब भी गर्म है। समुद्र के ऊपर गर्म हवा उठती है और ज़मीन की ठंडी हवा उसकी जगह लेने बहती है।') : T2('Same temperature on both sides, so no loop forms.', 'दोनों ओर एक-सा तापमान है, इसलिए कोई चक्र नहीं बनता।');
          R('info').innerHTML = `<h3>${esc(t(w))}</h3><p>${esc(t(why))}</p>`;
          seaMode.draw(c);
        },
      };
    },
    tick(c, dt) {
      const st = c.st; st.tt += dt;
      if (st.playing) { st.h += 1.5 * dt; if (st.h >= 24) st.h -= 24; }
      const S_ = seaMode.state(st.h); st.A += (S_.A - st.A) * Math.min(1, dt * (c.reduced() ? 50 : 2.5));
      st.parts.forEach((p) => {
        const Ap = st.A;
        const u = Ap * Math.PI * Math.sin(Math.PI * p.x) * Math.cos(Math.PI * p.y), v = -Ap * Math.PI * Math.cos(Math.PI * p.x) * Math.sin(Math.PI * p.y);
        p.x += u * dt + (Math.random() - 0.5) * 0.002; p.y += v * dt + (Math.random() - 0.5) * 0.002;
        p.x = clamp(p.x, 0.015, 0.985); p.y = clamp(p.y, 0.015, 0.985);
      });
      if (Math.abs(st.A) > 0.12) {
        st.flow += dt;
        if (st.flow > 1.2) {
          const kind = st.A > 0 ? 'sea' : 'land';
          if (!st.fired.c) { st.fired.c = 1; c.emit('convected'); }
          if (!st.fired[kind]) { st.fired[kind] = 1; c.emit('breeze:' + kind); c.say(kind === 'sea' ? T2('A sea breeze has started. Land is warmer than the sea, so air rises over the land and cooler sea air moves in.', 'समुद्री पवन शुरू हो गई। ज़मीन समुद्र से अधिक गर्म है, इसलिए ज़मीन पर हवा ऊपर उठती है और समुद्र की ठंडी हवा आती है।') : T2('A land breeze has started. At night land cools faster than the sea, so the wind turns round and blows out to sea.', 'स्थल पवन शुरू हो गई। रात में ज़मीन समुद्र से जल्दी ठंडी होती है, इसलिए हवा पलटकर समुद्र की ओर चलती है।')); }
        }
      } else st.flow = 0;
      return true;
    },
    draw(c) {
      const st = c.st, g = st.ctx, t = c.t; if (!g) return;
      const h = st.h, S_ = seaMode.state(h);
      const el = Math.sin((Math.PI * (h - 6)) / 12), dayF = clamp(el * 2.2 + 0.25, 0, 1);
      g.clearRect(0, 0, 600, 400);
      const sky = g.createLinearGradient(0, 0, 0, 300);
      sky.addColorStop(0, mixHex('#0B1A3E', '#5BAEF0', dayF)); sky.addColorStop(1, mixHex('#24366B', '#DDF1FF', dayF)); g.fillStyle = sky; g.fillRect(0, 0, 600, 300);
      // stars
      if (dayF < 0.6) { g.fillStyle = `rgba(255,255,255,${(0.9 - dayF * 1.4).toFixed(2)})`; for (let i = 0; i < 28; i++) { g.fillRect((i * 97) % 600, (i * 53) % 130 + 6, 2, 2); } }
      // sun or moon
      const daySun = h >= 6 && h <= 18, ph = daySun ? (h - 6) / 12 : ((h < 6 ? h + 24 : h) - 18) / 12;
      const bx = 40 + ph * 520, by = 300 - Math.sin(Math.PI * ph) * 230;
      if (daySun) { const gr = g.createRadialGradient(bx, by, 4, bx, by, 60); gr.addColorStop(0, 'rgba(255,240,150,1)'); gr.addColorStop(1, 'rgba(255,200,60,0)'); g.fillStyle = gr; g.beginPath(); g.arc(bx, by, 60, 0, 7); g.fill(); g.fillStyle = '#FFD23F'; g.beginPath(); g.arc(bx, by, 22, 0, 7); g.fill(); }
      else { g.fillStyle = '#F5F3E7'; g.beginPath(); g.arc(bx, by, 17, 0, 7); g.fill(); g.fillStyle = mixHex('#0B1A3E', '#24366B', 0.5); g.beginPath(); g.arc(bx + 7, by - 3, 15, 0, 7); g.fill(); }
      // clouds over land when air rises
      const ca = clamp((S_.d - 2) / 5, 0, 1) * (daySun ? 1 : 0);
      if (ca > 0.02) { g.fillStyle = `rgba(255,255,255,${(0.92 * ca).toFixed(2)})`; [[430, 70, 1], [500, 52, 0.8], [380, 48, 0.7]].forEach(([cx, cy, s]) => { g.beginPath(); g.arc(cx, cy, 20 * s, 0, 7); g.arc(cx + 22 * s, cy + 4, 16 * s, 0, 7); g.arc(cx - 22 * s, cy + 5, 15 * s, 0, 7); g.fill(); }); }
      // sea
      const sea = g.createLinearGradient(0, 296, 0, 400); sea.addColorStop(0, mixHex('#0E3A66', '#3FA7DC', dayF)); sea.addColorStop(1, mixHex('#08203F', '#1E6DAF', dayF)); g.fillStyle = sea; g.fillRect(0, 296, 300, 104);
      g.strokeStyle = `rgba(255,255,255,${(0.25 + 0.3 * dayF).toFixed(2)})`; g.lineWidth = 2;
      for (let r = 0; r < 4; r++) { g.beginPath(); for (let x = 0; x <= 300; x += 10) { const y = 316 + r * 22 + Math.sin(x * 0.07 + st.tt * 1.6 + r) * 3; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
      // boat
      g.fillStyle = '#7C2D12'; g.beginPath(); g.moveTo(70, 300); g.lineTo(130, 300); g.lineTo(118, 316); g.lineTo(82, 316); g.fill(); g.fillStyle = '#F8FAFC'; g.beginPath(); g.moveTo(100, 262); g.lineTo(100, 298); g.lineTo(122, 298); g.fill();
      // land
      const land = g.createLinearGradient(0, 290, 0, 400); land.addColorStop(0, mixHex('#4B4A38', '#D9B77E', dayF)); land.addColorStop(1, mixHex('#2E2A22', '#B8975C', dayF)); g.fillStyle = land;
      g.beginPath(); g.moveTo(300, 330); g.quadraticCurveTo(318, 296, 360, 292); g.lineTo(600, 292); g.lineTo(600, 400); g.lineTo(300, 400); g.fill();
      const warm = clamp((S_.L - 28) / 10, 0, 1); g.fillStyle = `rgba(255,110,40,${(warm * 0.28).toFixed(2)})`; g.fillRect(300, 292, 300, 108);
      // trees and house
      const tree = (x, s) => { g.fillStyle = '#6B4423'; g.fillRect(x - 3 * s, 270, 6 * s, 24); g.fillStyle = mixHex('#1F4A2A', '#2E9E4F', dayF); g.beginPath(); g.arc(x, 262, 16 * s, 0, 7); g.arc(x - 10 * s, 272, 11 * s, 0, 7); g.arc(x + 10 * s, 272, 11 * s, 0, 7); g.fill(); };
      tree(400, 1); tree(560, 1.1);
      g.fillStyle = mixHex('#8A5A44', '#E8A87C', dayF); g.fillRect(450, 262, 56, 32); g.fillStyle = mixHex('#4A2B24', '#B8453A', dayF); g.beginPath(); g.moveTo(444, 262); g.lineTo(478, 238); g.lineTo(512, 262); g.fill();
      g.fillStyle = dayF < 0.5 ? '#FFD86B' : '#CDE9F8'; g.fillRect(468, 272, 14, 14);
      // thermometers
      const thermo = (x, T, lab) => {
        g.fillStyle = '#F3FAFF'; g.strokeStyle = '#5B7A92'; g.lineWidth = 2.5; g.beginPath(); g.roundRect(x - 6, 322, 12, 60, 6); g.fill(); g.stroke();
        const hh2 = 8 + clamp((T - 20) / 20, 0, 1) * 44; g.fillStyle = '#E0301E'; g.fillRect(x - 2.5, 378 - hh2, 5, hh2);
        font(g, 16); g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(`${fx(T, 1)}°`, x, 316); g.fillText(lab, x, 396); g.textAlign = 'left';
      };
      thermo(210, S_.S, t(T2('sea', 'समुद्र'))); thermo(420, S_.L, t(T2('land', 'ज़मीन')));
      // air flow: particles with short trails
      const A = st.A, mag = clamp(Math.abs(A) / 0.4, 0, 1);
      const sx = (p) => 20 + p.x * 560, sy = (p) => 250 - p.y * 190;
      if (mag > 0.04) {
        st.parts.forEach((p) => {
          const px = sx(p), py = sy(p), u = A * Math.PI * Math.sin(Math.PI * p.x) * Math.cos(Math.PI * p.y), v = -A * Math.PI * Math.cos(Math.PI * p.x) * Math.sin(Math.PI * p.y);
          const L2 = 26; const ux = u * 560, vy = -v * 190, nn = Math.hypot(ux, vy) || 1;
          g.strokeStyle = `rgba(255,255,255,${(0.35 + 0.5 * mag).toFixed(2)})`; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(px - (ux / nn) * L2 * 0.5, py - (vy / nn) * L2 * 0.5); g.lineTo(px, py); g.stroke();
          g.fillStyle = '#fff'; g.beginPath(); g.arc(px, py, 2.6, 0, 7); g.fill();
        });
        font(g, 17); g.textAlign = 'center';
        const lbl = (txt, x, y, col) => { const w = g.measureText(txt).width + 16; g.fillStyle = 'rgba(15,23,42,.62)'; g.beginPath(); g.roundRect(x - w / 2, y - 18, w, 26, 8); g.fill(); g.fillStyle = col; g.fillText(txt, x, y); };
        if (A > 0) { lbl(t(T2('warm air rises', 'गर्म हवा ऊपर उठती है')), 470, 112, '#FFD4A8'); lbl(t(T2('cool air sinks', 'ठंडी हवा नीचे आती है')), 130, 112, '#BFEFFA'); lbl(t(T2('sea breeze →', 'समुद्री पवन →')), 300, 258, '#fff'); }
        else { lbl(t(T2('warm air rises', 'गर्म हवा ऊपर उठती है')), 130, 112, '#FFD4A8'); lbl(t(T2('cool air sinks', 'ठंडी हवा नीचे आती है')), 470, 112, '#BFEFFA'); lbl(t(T2('← land breeze', '← स्थल पवन')), 300, 258, '#fff'); }
        g.textAlign = 'left';
      }
    },
    act(c, key) {
      const st = c.st;
      if (key === 'heat') { st.playing = !st.playing; if (st.playing) { c.emit('heated'); c.api.record(c.t(T2('Ran the day', 'दिन चलाया'))); } }
      else if (key === 'thermometer') {
        const S_ = seaMode.state(st.h);
        c.say(T2(`At ${clock(st.h, (x) => x.en)}: land ${fx(S_.L, 1)} °C, sea ${fx(S_.S, 1)} °C. The land is ${fx(Math.abs(S_.d), 1)} °C ${S_.d >= 0 ? 'warmer' : 'cooler'} than the sea.`, `${clock(st.h, (x) => x.hi)} पर: ज़मीन ${fx(S_.L, 1)} °C, समुद्र ${fx(S_.S, 1)} °C। ज़मीन समुद्र से ${fx(Math.abs(S_.d), 1)} °C ${S_.d >= 0 ? 'अधिक गर्म' : 'अधिक ठंडी'} है।`));
        c.emit('reading');
      }
    },
    input(c, key, v) { if (key === 'slider:time') { c.st.h = v; c.st.playing = false; c.emit('moved:time'); } },
  };

  // =========================================================================================== registry
  const IMPL = { thermometer: thermometerMode, conduction: conductionMode, convection: convectionMode, radiation: radiationMode, expansion: expansionMode, mixing: mixingMode, cycle: cycleMode, 'sea-breeze': seaMode };

  function mount(root, cfg, api) {
    const M = IMPL[cfg.mode], st = M.init(cfg);
    let view = null, lang = null, raf = 0, last = 0, dead = false;
    const c = {
      cfg, st, api, root, u: 'ht' + ++UID,
      t: (x) => api.t(x),
      R: (n) => root.querySelector(`[data-r="${n}"]`),
      emit: (e) => api.emit(e),
      reduced: () => L.reducedMotion(),
      say(msg) { st.live = msg; const el = root.querySelector('.ht-live'); if (el) el.textContent = msg ? api.t(msg) : ''; },
    };
    function render() {
      lang = api.lang();
      view = M.view(c);
      root.innerHTML = `<div class="ht-root"><div class="ht"><div class="ht-scene">${view.scene}</div><div class="ht-side">${view.side}<div class="ht-live" aria-live="polite" role="status"></div></div></div></div>`;
      if (view.bind) view.bind();
      view.refresh();
      c.say(st.live);
    }
    function onClick(e) {
      const el = e.target.closest('[data-key]');
      if (!el || el.disabled || el.type === 'range') return;
      const key = el.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      M.act(c, key, el); view.refresh();
      if (key.startsWith('material:') || key.startsWith('preset:')) { const again = root.querySelector(`[data-key="${key}"]`); if (again && again.tagName === 'BUTTON') again.focus(); }
    }
    function onInput(e) {
      const el = e.target.closest('input[type="range"][data-key]');
      if (!el) return;
      if (!api.allowed(el.dataset.key)) { api.nudge(el.dataset.key); view.refresh(); return; }
      M.input(c, el.dataset.key, parseFloat(el.value)); view.refresh();
    }
    function onKey(e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('g[data-key]')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    }
    function frame(now) {
      if (dead) return;
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      if (api.lang() !== lang) render();
      M.tick(c, dt); view.refresh();
      raf = requestAnimationFrame(frame);
    }
    render();
    root.addEventListener('click', onClick); root.addEventListener('input', onInput); root.addEventListener('keydown', onKey);
    raf = requestAnimationFrame(frame);
    return { destroy() { dead = true; cancelAnimationFrame(raf); root.removeEventListener('click', onClick); root.removeEventListener('input', onInput); root.removeEventListener('keydown', onKey); } };
  }

  NCA_T.register({
    id: 'heat',
    css: CSS,
    validate(c) {
      const e = [];
      if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
      Object.keys(c).forEach((k) => { if (!['mode', 'materials'].includes(k)) e.push('unknown key: ' + k); });
      if (!MODES.includes(c.mode)) e.push('mode: one of ' + MODES.join(', '));
      if (c.materials != null) {
        if (!MAT_MODES.includes(c.mode)) e.push('materials: only for the conduction, expansion and mixing modes');
        if (!Array.isArray(c.materials) || c.materials.length < 1 || c.materials.length > 5) e.push('materials: 1 to 5 material ids');
        else { c.materials.forEach((m) => { if (!MATS[m]) e.push('unknown material: ' + m + ' (use ' + MATIDS.join(', ') + ')'); }); if (new Set(c.materials).size !== c.materials.length) e.push('materials: each material once'); }
      }
      return e;
    },
    keys(c) {
      const mode = c && c.mode, mats = (c && Array.isArray(c.materials) && c.materials) || MATIDS;
      const M = mats.map((m) => 'material:' + m), sel = mats.map((m) => 'selected:' + m);
      if (mode === 'thermometer') return { targets: ['heat', 'cool', 'slider:temp', 'thermometer', 'preset:ice', 'preset:room', 'preset:body', 'preset:boil'], events: ['reading', 'heated', 'cooled', 'moved:temp'] };
      if (mode === 'conduction') return { targets: ['heat', 'reset', 'slider:temp', 'slider:time', 'thermometer'].concat(M), events: ['conducted', 'reading', 'heated', 'reset', 'moved:temp', 'moved:time'].concat(sel) };
      if (mode === 'convection') return { targets: ['heat', 'dye', 'reset', 'slider:temp', 'thermometer'], events: ['convected', 'reading', 'heated', 'dyed', 'moved:temp'] };
      if (mode === 'radiation') return { targets: ['heat', 'reset', 'slider:distance', 'slider:time', 'thermometer', 'thermometer:*'], events: ['reading', 'heated', 'moved:distance', 'moved:time'] };
      if (mode === 'expansion') return { targets: ['heat', 'cool', 'slider:temp', 'thermometer'].concat(M), events: ['expanded', 'reading', 'heated', 'cooled', 'moved:temp'].concat(sel) };
      if (mode === 'mixing') return { targets: ['mix', 'reset', 'slider:temp', 'slider:mass', 'slider:coldtemp', 'slider:coldmass', 'thermometer', 'material:water'].concat(M), events: ['equilibrium', 'mixed', 'reading', 'moved:temp', 'moved:mass', 'moved:coldtemp', 'moved:coldmass', 'selected:water'].concat(sel) };
      if (mode === 'cycle') return { targets: ['heat', 'step', 'reset', 'slider:temp', 'slider:cold'], events: ['cycle-done', 'stage:*', 'heated', 'moved:temp', 'moved:cold'] };
      if (mode === 'sea-breeze') return { targets: ['heat', 'slider:time', 'thermometer'], events: ['convected', 'breeze:sea', 'breeze:land', 'reading', 'heated', 'moved:time'] };
      return { targets: [], events: [] };
    },
    demo: { mode: 'conduction', materials: ['copper', 'steel', 'glass', 'wood', 'plastic'] },
    modes: MODES,
    materials: MATIDS,
    mount(root, config, api) { return mount(root, config, api); },
  });
})();
