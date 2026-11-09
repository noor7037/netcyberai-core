// Template: Body explorer. Open the human body system by system: tap a part to learn what it is and what it does,
// switch layers and views, play the journey of food, air, blood, urine or a nerve signal, then test yourself by
// finding parts (label), tracing a journey part by part (trace) or putting its steps in order (order).
// Every drawing is the template's own SVG, laid out in true anatomical positions (a front view: the body's right
// side is on the viewer's left). Facts follow the NCERT syllabus, Classes 3-12. Config:
//   { system: 'skeleton'|'muscles'|'digestive'|'respiratory'|'circulatory'|'heart'|'excretory'|'nervous'|'brain'|
//             'eye'|'ear'|'skin'|'endocrine'|'reproductive'|'teeth'|'immune',
//     flow?: 'food'|'air'|'blood'|'urine'|'signal'   (only a flow that really runs through that system),
//     task?: 'explore'|'label'|'trace'|'order' }       (trace and order need a system with a journey)
(function () {
  const L = window.NCA_LIB;
  const { esc } = L;
  const T2 = (en, hi) => ({ en, hi });
  const r1 = (v) => Math.round(v * 10) / 10;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

  // ---------------------------------------------------------------- drawing helpers (pure strings; no DOM)
  // A smooth Catmull-Rom curve through points.
  function smooth(P, closed = true) {
    const n = P.length;
    const g = (i) => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
    let d = `M${r1(P[0][0])} ${r1(P[0][1])}`;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
    }
    return d + (closed ? 'Z' : '');
  }
  // Draw a left-side piece and its mirror image about the body's midline (x = 240).
  const both = (m, cx = 240) => m + `<g transform="matrix(-1 0 0 1 ${2 * cx} 0)">${m}</g>`;
  const blob = (P, fill, stroke, sw = 1.5) => { const d = smooth(P); return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/><path d="${d}" fill="url(#by-sheen)" pointer-events="none"/>`; };
  const hit = (d, w) => `<path d="${d}" class="by-hit" stroke-width="${w}"/>`;
  // A tube: dark edge, colour, soft highlight, and a wide invisible stroke so a thin tube is easy to tap.
  const tube = (d, w, col, edge) => `<path d="${d}" fill="none" stroke="${edge}" stroke-width="${w + 2.6}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="${r1(Math.max(1, w * 0.28))}" stroke-linecap="round" transform="translate(${-r1(w * 0.14)} ${-r1(w * 0.14)})" pointer-events="none"/>` + hit(d, w + 14);
  const line = (d, w, col) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>` + hit(d, w + 14);
  // A long bone: knobbed ends and a shaft.
  function bone(x1, y1, x2, y2, w) {
    const dx = x2 - x1, dy = y2 - y1, Ln = Math.hypot(dx, dy), px = -dy / Ln, py = dx / Ln, h = w / 2, e = w * 0.62;
    const k = [[x1, y1], [x2, y2]].map(([x, y]) => `<circle cx="${r1(x + px * e * 0.55)}" cy="${r1(y + py * e * 0.55)}" r="${r1(e)}" class="by-bf"/><circle cx="${r1(x - px * e * 0.55)}" cy="${r1(y - py * e * 0.55)}" r="${r1(e)}" class="by-bf"/>`).join('');
    const a = [x1 + px * h, y1 + py * h], b = [x2 + px * h, y2 + py * h], c = [x2 - px * h, y2 - py * h], d = [x1 - px * h, y1 - py * h];
    return `${k}<path d="M${r1(a[0])} ${r1(a[1])}L${r1(b[0])} ${r1(b[1])}L${r1(c[0])} ${r1(c[1])}L${r1(d[0])} ${r1(d[1])}Z" fill="#F7F0E1"/><path d="M${r1(a[0])} ${r1(a[1])}L${r1(b[0])} ${r1(b[1])}M${r1(d[0])} ${r1(d[1])}L${r1(c[0])} ${r1(c[1])}" class="by-bl"/>`;
  }
  const boneLine = (d, w) => `<path d="${d}" fill="none" stroke="#A08B6A" stroke-width="${w + 2}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#F7F0E1" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const P = (id, en, hi, ien, ihi, at, d, extra) => Object.assign({ id, n: T2(en, hi), i: T2(ien, ihi), at, d }, extra || {});

  // ---------------------------------------------------------------- the body outline (front view, midline x = 240)
  const HALF = [[226, 112], [224, 148], [200, 160], [166, 168], [150, 186], [142, 240], [134, 316], [124, 380], [118, 420], [110, 446], [114, 470], [126, 478], [136, 468], [138, 444], [142, 420], [150, 374], [156, 322], [162, 262], [172, 222], [176, 272], [184, 338], [176, 400], [176, 452], [184, 520], [192, 574], [190, 622], [198, 686], [178, 704], [182, 718], [216, 718], [220, 698], [218, 684], [226, 622], [226, 574], [232, 500], [240, 458]];
  const BODY_D = smooth(HALF.concat(HALF.slice(0, -1).map(([x, y]) => [480 - x, y]).reverse()));
  function figure(o) {
    o = o || {};
    const back = o.back;
    return `<g class="by-fig" opacity="${o.op || 1}" pointer-events="none">
      <ellipse cx="197" cy="76" rx="7" ry="13" fill="url(#by-skin)" stroke="#D99A80" stroke-width="1.6"/><ellipse cx="283" cy="76" rx="7" ry="13" fill="url(#by-skin)" stroke="#D99A80" stroke-width="1.6"/>
      <path d="${BODY_D}" fill="url(#by-skin)" stroke="#D99A80" stroke-width="2"/>
      <ellipse cx="240" cy="70" rx="42" ry="52" fill="url(#by-skin)" stroke="#D99A80" stroke-width="2"/>
      <rect x="227" y="104" width="26" height="30" fill="url(#by-skin)"/>
      ${back ? '<path d="M199 70C196 32 218 16 240 16C262 16 284 32 281 70C276 52 262 40 240 40C218 40 204 52 199 70Z" fill="#3B2A20"/><path d="M200 64C204 90 214 108 228 116L252 116C266 108 276 90 280 64C282 96 270 112 256 118L224 118C210 112 198 96 200 64Z" fill="#3B2A20" opacity=".9"/>'
        : '<path d="M200 60C202 30 220 18 240 18C260 18 278 30 280 60C272 42 258 34 240 34C222 34 208 42 200 60Z" fill="#3B2A20"/>'}
    </g>`;
  }

  // ---------------------------------------------------------------- shared drawings
  function ribs(back) {
    const W = [26, 36, 44, 50, 55, 58, 59, 58, 55, 50];
    let s = '';
    for (let i = 0; i < 10; i++) {
      const yB = 178 + i * 11, w = W[i];
      if (back) s += `M229 ${yB}C${240 - w * 0.5} ${yB - 4} ${240 - w} ${yB + 4} ${242 - w} ${yB + 22}`;
      else {
        const e = i < 7 ? 8 : 18 + (i - 7) * 10, yF = i < 7 ? 182 + i * 12.5 : 268 + (i - 7) * 10;
        s += `M234 ${yB}C${r1(240 - w * 0.6)} ${yB - 7} ${240 - w} ${yB - 2} ${240 - w} ${yB + 12}C${240 - w} ${yB + 24} ${240 - e - 12} ${yF} ${240 - e} ${yF}`;
      }
    }
    s += `M${back ? 229 : 234} 290C216 288 200 294 194 306M${back ? 229 : 234} 300C220 300 208 306 204 314`;
    return both(boneLine(s, 4.2));
  }
  function spine() {
    let s = '';
    for (let i = 0; i < 7; i++) s += `<rect x="234" y="${r1(124 + i * 5.4)}" width="12" height="4.6" rx="1.6" class="by-bf"/>`;
    for (let i = 0; i < 12; i++) { const w = 14 + i * 0.5; s += `<rect x="${r1(240 - w / 2)}" y="${r1(162 + i * 11.4)}" width="${w}" height="9.6" rx="3" class="by-bf"/>`; }
    for (let i = 0; i < 5; i++) { const w = 22 + i; s += `<rect x="${r1(240 - w / 2)}" y="${300 + i * 14}" width="${w}" height="12" rx="4" class="by-bf"/>`; }
    return s + '<path d="M226 372L254 372L246 412L234 412Z" class="by-bf"/><circle cx="235" cy="384" r="1.8" fill="#A08B6A"/><circle cx="245" cy="384" r="1.8" fill="#A08B6A"/><circle cx="236" cy="396" r="1.6" fill="#A08B6A"/><circle cx="244" cy="396" r="1.6" fill="#A08B6A"/><path d="M236 412L244 412L240 421Z" class="by-bf"/>';
  }
  const SK = {
    skull: (back) => (back ? '<path d="M200 66C200 30 220 18 240 18C260 18 280 30 280 66C280 92 266 112 240 114C214 112 200 92 200 66Z" class="by-bf"/><path d="M210 50Q240 36 270 50M240 18V44M214 86Q240 96 266 86" class="by-bl"/>'
      : '<path d="M204 68C204 34 220 20 240 20C260 20 276 34 276 68C276 84 270 94 264 98L216 98C210 94 204 84 204 68Z" class="by-bf"/><ellipse cx="226" cy="70" rx="9" ry="8" fill="#5B4636"/><ellipse cx="254" cy="70" rx="9" ry="8" fill="#5B4636"/><path d="M240 76L233 90H247Z" fill="#5B4636"/><path d="M212 82Q218 90 224 88M268 82Q262 90 256 88" class="by-bl"/>' + [0, 1, 2, 3, 4, 5].map((k) => `<rect x="${225 + k * 5}" y="96" width="4.4" height="6" rx="1.2" fill="#FFFDF7" stroke="#A08B6A" stroke-width=".8"/>`).join('')),
    jaw: '<path d="M214 96C214 114 226 126 240 126C254 126 266 114 266 96L258 100L256 110C250 116 230 116 224 110L222 100Z" class="by-bf"/>' + [0, 1, 2, 3, 4, 5].map((k) => `<rect x="${225 + k * 5}" y="103" width="4.4" height="5.5" rx="1.2" fill="#FFFDF7" stroke="#A08B6A" stroke-width=".8"/>`).join(''),
    clavicle: both(boneLine('M234 172C222 168 210 176 196 172C186 169 178 166 170 170', 5)),
    scapula: both('<path d="M224 184L188 176L172 186L178 206L208 262L222 250Z" class="by-bf"/><path d="M222 196L176 188" class="by-bl" stroke-width="2.4"/>'),
    sternum: '<path d="M234 172L246 172L247 192L245 252L240 264L235 252L233 192Z" class="by-bf"/>',
    pelvis: both('<path d="' + smooth([[228, 384], [218, 372], [198, 370], [180, 382], [176, 402], [186, 422], [200, 436], [214, 446], [232, 452], [238, 448], [234, 430], [226, 414]]) + '" class="by-bf"/><ellipse cx="218" cy="436" rx="7" ry="5" fill="#8C7556" opacity=".55"/><circle cx="204" cy="424" r="7" fill="none" stroke="#A08B6A" stroke-width="2"/>'),
    humerus: both(bone(170, 184, 145, 314, 9) + '<circle cx="172" cy="178" r="8.5" class="by-bf"/>'),
    radius: both(bone(140, 328, 121, 408, 5)),
    ulna: both(bone(150, 326, 134, 410, 5) + '<circle cx="152" cy="322" r="5" class="by-bf"/>'),
    hand: both([0, 1, 2, 3, 4, 5, 6, 7].map((k) => `<circle cx="${119 + (k % 4) * 5}" cy="${419 + Math.floor(k / 4) * 6}" r="3" class="by-bf"/>`).join('') + boneLine('M118 428L110 440L106 452M121 431L117 449L114 470M125 431L123 450L122 476M129 431L129 449L130 474M133 430L135 446L136 466', 2.6)),
    femur: both(bone(194, 438, 206, 562, 9.5) + '<path d="M204 424L190 436" stroke="#A08B6A" stroke-width="9" stroke-linecap="round"/><path d="M204 424L190 436" stroke="#F7F0E1" stroke-width="6.6" stroke-linecap="round"/><circle cx="205" cy="423" r="8" class="by-bf"/><circle cx="186" cy="434" r="6" class="by-bf"/>'),
    patella: both('<ellipse cx="208" cy="572" rx="7" ry="8.5" class="by-bf"/>'),
    tibia: both(bone(211, 588, 213, 680, 9)),
    fibula: both(bone(198, 592, 201, 678, 4.5)),
    foot: both('<ellipse cx="206" cy="694" rx="10" ry="6" class="by-bf"/>' + boneLine('M198 698L188 712M202 699L196 714M206 699L204 715M210 699L212 715M214 698L220 713', 2.6)),
  };
  function skeletonAll(view) {
    const back = view === 'back';
    return spine() + ribs(back) + (back ? SK.scapula : SK.sternum + SK.clavicle) + SK.pelvis + SK.skull(back) + (back ? '' : SK.jaw) + SK.humerus + SK.radius + SK.ulna + SK.hand + SK.femur + (back ? '' : SK.patella) + SK.tibia + SK.fibula + SK.foot;
  }
  const JOINT = (pts, col) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="${col}" fill-opacity=".28" stroke="${col}" stroke-width="2.4"/><circle cx="${x}" cy="${y}" r="4" fill="${col}"/>`).join('') + pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="16" fill="transparent"/>`).join('');

  // ---------------------------------------------------------------- styles
  const CSS = `.by { --by-ink: #1E293B; display: flex; flex-direction: column; gap: 12px; }
.by-head { display: flex; align-items: center; gap: 12px; }
.by-ico { width: 46px; height: 46px; border-radius: 14px; flex: none; display: grid; place-items: center; background: linear-gradient(140deg, #FF6B57, #BE123C); box-shadow: 0 6px 14px rgba(190,18,60,.28); }
.by-ico svg { width: 30px; height: 30px; }
.by-title { margin: 0; font: 800 1.3rem/1.1 var(--font-display); color: var(--ink); }
.by-sub { margin: 2px 0 0; color: var(--ink-2); font-size: .92rem; line-height: 1.3; }
.by-main { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
.by.wide .by-main { grid-template-columns: minmax(0, 1.2fr) minmax(290px, 1fr); align-items: start; }
.by-stage { position: relative; border-radius: 20px; padding: 8px; background: radial-gradient(circle at 50% 38%, #FFFFFF 0, #EEF4FF 46%, #E3E9FB 100%); box-shadow: inset 0 0 0 1px rgba(6,18,51,.07), 0 8px 22px rgba(6,18,51,.08); }
.by-svg { display: block; width: 100%; height: auto; margin: 0 auto; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.by-note { margin: 4px 6px 2px; font-size: .8rem; color: #475569; text-align: center; }
.by-part { cursor: pointer; outline: none; transition: opacity .25s, filter .2s; }
.by-part:hover { filter: brightness(1.07) drop-shadow(0 0 3px rgba(139,61,255,.55)); }
.by-part:focus-visible { filter: drop-shadow(0 0 3px #8B3DFF) drop-shadow(0 0 7px #8B3DFF); }
.by-svg.dim .by-part:not(.on):not(.done) { opacity: .42; }
.by-part.on, .by-part.on:hover { opacity: 1; filter: drop-shadow(0 0 3px #FFD23F) drop-shadow(0 0 8px rgba(255,122,26,.85)); }
.by-part.done { filter: drop-shadow(0 0 3px #22C55E) drop-shadow(0 0 6px rgba(34,197,94,.7)); }
.by-part.bad { filter: drop-shadow(0 0 4px #EF4444) drop-shadow(0 0 9px rgba(239,68,68,.8)); }
.by-part.hint { animation: by-pulse 1s ease-in-out infinite; }
.by-static { pointer-events: none; }
@keyframes by-pulse { 0%, 100% { filter: none; } 50% { filter: drop-shadow(0 0 6px #FFD23F) drop-shadow(0 0 12px #FF7A1A); } }
.by-hit { fill: none; stroke: transparent; pointer-events: stroke; }
.by-bf { fill: #F7F0E1; stroke: #A08B6A; stroke-width: 1.3; }
.by-bl { fill: none; stroke: #A08B6A; stroke-width: 1.2; }
.by-lab text { font-family: var(--font-body); font-weight: 700; fill: #0F172A; }
.by-lab rect { fill: #FFFFFF; fill-opacity: .94; stroke: #94A3B8; }
.by-lab.on rect { fill: #FFF6D2; stroke: #F5B90A; }
.by-lab.done rect { fill: #DCFCE7; stroke: #16A34A; }
.by-lab line { stroke: #334155; stroke-width: 1.2; }
.by-cap { font: 700 11px var(--font-body); fill: #334155; }
.by-panel { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.by-ctrls { display: flex; flex-wrap: wrap; gap: 8px; }
.by-chip { min-height: 44px; border-radius: 999px; padding: 0 14px; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); font: 700 .9rem var(--font-body); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: background .15s, border-color .15s, transform .12s; }
.by-chip:hover { transform: translateY(-1px); }
.by-chip[aria-pressed="true"] { background: #BE123C; border-color: #BE123C; color: #fff; }
.by-chip .tick { width: 18px; height: 18px; border-radius: 50%; display: inline-grid; place-items: center; font-size: 12px; border: 1.5px solid currentColor; }
.by-tabs { display: inline-flex; border-radius: 999px; background: var(--sunk); padding: 3px; gap: 2px; border: 1px solid var(--line); flex-wrap: wrap; }
.by-tabs .by-chip { border: 0; background: transparent; }
.by-tabs .by-chip[aria-pressed="true"] { background: #BE123C; color: #fff; box-shadow: 0 2px 6px rgba(190,18,60,.35); }
.by-play { min-height: 48px; border: 0; border-radius: 14px; padding: 0 18px; font: 800 1rem var(--font-display); color: #fff; cursor: pointer; display: inline-flex; align-items: center; gap: 10px; background: linear-gradient(180deg, #F43F5E, #BE123C); box-shadow: 0 4px 0 #881337, 0 8px 16px rgba(190,18,60,.25); transition: transform .12s, filter .12s; }
.by-play:hover { filter: brightness(1.06); }
.by-play:active { transform: translateY(2px); box-shadow: 0 2px 0 #881337; }
.by-play[aria-busy="true"] { filter: saturate(.6); }
.by-play svg { width: 18px; height: 18px; }
.by-card { background: var(--surface); border: 1px solid var(--line); border-left: 6px solid #BE123C; border-radius: 16px; padding: 12px 14px; min-height: 92px; color: var(--ink); }
.by-card h4 { margin: 0 0 4px; font: 800 1.2rem/1.2 var(--font-display); display: flex; align-items: center; gap: 8px; }
.by-card p { margin: 4px 0 0; line-height: 1.45; }
.by-card .dot { width: 14px; height: 14px; border-radius: 50%; flex: none; box-shadow: 0 0 0 2px rgba(255,255,255,.7); }
.by-card .muted { color: var(--ink-2); }
.by-card .big { font: 800 1.35rem var(--font-display); color: #BE123C; }
:root[data-theme="dark"] .by-card .big { color: #FDA4AF; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .by-card .big { color: #FDA4AF; } }
.by-card .ok { color: var(--good); font-weight: 800; }
.by-card .no { color: var(--bad); font-weight: 800; }
.by-meter { height: 8px; border-radius: 99px; background: var(--sunk); overflow: hidden; margin-top: 8px; }
.by-meter i { display: block; height: 100%; background: linear-gradient(90deg, #22C55E, #14B8A6); border-radius: 99px; transition: width .4s; }
.by-flow { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.by-fs { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 4px 10px 4px 4px; background: var(--surface); border: 1.5px dashed var(--line); color: var(--ink-2); font-weight: 700; font-size: .85rem; transition: all .3s; }
.by-fs b { width: 22px; height: 22px; border-radius: 50%; display: inline-grid; place-items: center; background: var(--sunk); color: var(--ink); font-size: .78rem; }
.by-fs.on { border: 1.5px solid #F5B90A; background: #FFF6D2; color: #1E293B; }
.by-fs.on b { background: #F5B90A; color: #1E293B; }
.by-fs.now { transform: scale(1.06); box-shadow: 0 0 0 3px rgba(245,185,10,.35); }
.by-arrow { color: var(--ink-2); font-weight: 800; }
.by-zoom { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 8px 10px 10px; }
.by-zt { font: 800 .95rem var(--font-display); color: var(--ink); margin: 0 0 4px; display: flex; align-items: center; gap: 6px; }
.by-zoom > svg { display: block; width: 100%; height: auto; max-height: 280px; border-radius: 12px; background: linear-gradient(180deg, #FFFFFF, #EEF4FF); }
.by-zt svg { width: 18px; height: 18px; flex: none; }
.by-order { display: flex; flex-direction: column; gap: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px; }
.by-slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; margin: 0; padding: 0; list-style: none; }
.by-slot { width: 100%; min-height: 44px; border-radius: 12px; border: 1.5px dashed var(--line); background: var(--sunk); color: var(--ink); font: 700 .88rem var(--font-body); display: flex; align-items: center; gap: 8px; padding: 4px 8px; cursor: pointer; text-align: left; }
.by-slot b { width: 24px; height: 24px; border-radius: 50%; flex: none; display: grid; place-items: center; background: #BE123C; color: #fff; font-size: .8rem; }
.by-slot.full { border-style: solid; border-color: #8B3DFF; background: var(--surface); }
.by-slot.bad { border-color: var(--bad); background: var(--bad-t); }
.by-slot.good { border-color: var(--good); background: var(--good-t); }
.by-cards { display: flex; flex-wrap: wrap; gap: 6px; }
.by-cardbtn { min-height: 44px; border-radius: 12px; border: 0; padding: 0 12px; font: 700 .9rem var(--font-body); cursor: pointer; color: #1E293B; background: linear-gradient(180deg, #FFE070, #FFD23F); box-shadow: 0 2px 0 #C9A21F; }
.by-cardbtn:hover { filter: brightness(1.04); }
.by-check { align-self: flex-start; }
.by-photo img { width: 100%; border-radius: 14px; display: block; }
.by-photo figcaption { font-size: .8rem; color: var(--ink-2); margin-top: 4px; }
.by-shake { animation: by-shake .35s; }
@keyframes by-shake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
@media (prefers-reduced-motion: reduce) { .by-part, .by-chip, .by-fs, .by-meter i, .by-play { transition: none; } .by-part.hint { animation: none; filter: drop-shadow(0 0 6px #FFD23F) drop-shadow(0 0 12px #FF7A1A); } .by-shake { animation: none; } }`;

  // ---------------------------------------------------------------- scenes
  const SCENES = {};
  const BODY_NOTE = T2('Seen from the front: the body\'s right side is on your left.', 'सामने से देखा गया: शरीर का दायाँ भाग तुम्हारे बाएँ ओर है।');
  const NAMES_LAYER = T2('Names', 'नाम');

  // SKELETON ---------------------------------------------------------
  SCENES.skeleton = {
    name: T2('Skeleton', 'कंकाल'), about: T2('206 bones hold us up, protect soft organs and let us move.', '206 हड्डियाँ हमें सहारा देती हैं, कोमल अंगों की रक्षा करती हैं और हमें चलने देती हैं।'),
    vb: [60, 8, 360, 724], body: true, views: true, note: BODY_NOTE,
    layers: [{ id: 'bones', n: T2('Bones', 'हड्डियाँ'), on: true }, { id: 'joints', n: T2('Joints', 'जोड़'), on: false }],
    bg: (st) => figure({ op: 0.5, back: st.view === 'back' }),
    parts: [
      P('spine', 'Backbone (spine)', 'मेरुदंड (रीढ़ की हड्डी)', 'A chain of small bones called vertebrae (33 in a child). It holds the body upright, lets it bend and protects the spinal cord.', 'कशेरुक नाम की छोटी हड्डियों की एक शृंखला (बच्चे में 33)। यह शरीर को सीधा रखती है, झुकने देती है और मेरुरज्जु की रक्षा करती है।', [240, 340], () => spine(), { l: 'bones' }),
      P('ribs', 'Ribs', 'पसलियाँ', '12 pairs of curved bones make the rib cage. It protects the heart and lungs and moves up and out when we breathe in.', '12 जोड़ी मुड़ी हुई हड्डियाँ पसलियों का पिंजरा बनाती हैं। यह हृदय और फेफड़ों की रक्षा करता है और साँस लेते समय ऊपर और बाहर उठता है।', [186, 236], (st) => ribs(st.view === 'back'), { l: 'bones' }),
      P('sternum', 'Breastbone', 'उरोस्थि (छाती की हड्डी)', 'The flat bone in the middle of the chest. Most ribs join it at the front.', 'छाती के बीच की चपटी हड्डी। ज़्यादातर पसलियाँ आगे से इससे जुड़ती हैं।', [240, 214], SK.sternum, { l: 'bones', v: 'front' }),
      P('clavicle', 'Collarbone', 'हँसली (कॉलर की हड्डी)', 'It joins the breastbone to the shoulder and holds the arm out at the side.', 'यह उरोस्थि को कंधे से जोड़ती है और बाँह को बगल में टिकाए रखती है।', [290, 170], SK.clavicle, { l: 'bones', v: 'front' }),
      P('scapula', 'Shoulder blade', 'कंधे की हड्डी (स्कैपुला)', 'A flat, triangle-shaped bone at the back of the shoulder. The upper-arm bone fits into a shallow cup on it.', 'कंधे के पीछे की चपटी, तिकोनी हड्डी। ऊपरी बाँह की हड्डी इसके एक उथले गड्ढे में फँसती है।', [290, 214], SK.scapula, { l: 'bones', v: 'back' }),
      P('pelvis', 'Hip bone (pelvis)', 'श्रोणि (कूल्हे की हड्डी)', 'A strong bowl of bones that carries the weight of the upper body and protects the bladder and nearby organs.', 'हड्डियों का एक मज़बूत कटोरा जो ऊपरी शरीर का भार उठाता है और मूत्राशय व आसपास के अंगों की रक्षा करता है।', [196, 398], SK.pelvis, { l: 'bones' }),
      P('skull', 'Skull', 'खोपड़ी', 'About 22 bones locked together. It protects the brain, eyes and ears.', 'लगभग 22 हड्डियाँ आपस में जुड़ी होती हैं। यह मस्तिष्क, आँखों और कानों की रक्षा करती है।', [262, 40], (st) => SK.skull(st.view === 'back'), { l: 'bones' }),
      P('jaw', 'Lower jaw', 'निचला जबड़ा', 'The only bone of the skull that can move. It lets us chew and speak.', 'खोपड़ी की अकेली हड्डी जो हिल सकती है। इससे हम चबाते और बोलते हैं।', [256, 118], SK.jaw, { l: 'bones', v: 'front' }),
      P('humerus', 'Upper-arm bone (humerus)', 'ऊपरी बाँह की हड्डी (ह्यूमरस)', 'The long bone from the shoulder to the elbow.', 'कंधे से कोहनी तक की लंबी हड्डी।', [158, 250], SK.humerus, { l: 'bones' }),
      P('radius', 'Radius', 'रेडियस', 'The forearm bone on the thumb side.', 'अग्रबाहु की वह हड्डी जो अँगूठे की ओर होती है।', [128, 376], SK.radius, { l: 'bones' }),
      P('ulna', 'Ulna', 'अल्ना', 'The forearm bone on the little-finger side. Its end makes the point of the elbow.', 'अग्रबाहु की वह हड्डी जो छोटी उँगली की ओर होती है। इसका सिरा कोहनी की नोक बनाता है।', [146, 350], SK.ulna, { l: 'bones' }),
      P('hand', 'Hand bones', 'हाथ की हड्डियाँ', '27 small bones in the wrist, palm and fingers let the hand grip, hold a pencil and write.', 'कलाई, हथेली और उँगलियों की 27 छोटी हड्डियाँ हाथ को पकड़ने, पेंसिल थामने और लिखने देती हैं।', [124, 452], SK.hand, { l: 'bones' }),
      P('femur', 'Thigh bone (femur)', 'जाँघ की हड्डी (फीमर)', 'The longest and strongest bone in the body. Its round head fits into the hip.', 'शरीर की सबसे लंबी और मज़बूत हड्डी। इसका गोल सिरा कूल्हे में फँसता है।', [200, 500], SK.femur, { l: 'bones' }),
      P('patella', 'Kneecap', 'घुटने की टोपी (पटेला)', 'A small bone in front of the knee that protects the knee joint.', 'घुटने के आगे की छोटी हड्डी जो घुटने के जोड़ की रक्षा करती है।', [272, 572], SK.patella, { l: 'bones', v: 'front' }),
      P('tibia', 'Shin bone (tibia)', 'पिंडली की हड्डी (टिबिया)', 'The larger of the two lower-leg bones. It carries the body\'s weight down to the foot.', 'निचली टाँग की दो हड्डियों में बड़ी। यह शरीर का भार पैर तक पहुँचाती है।', [268, 636], SK.tibia, { l: 'bones' }),
      P('fibula', 'Fibula', 'फिबुला', 'The thin bone on the outer side of the lower leg.', 'निचली टाँग के बाहरी ओर की पतली हड्डी।', [200, 640], SK.fibula, { l: 'bones' }),
      P('foot', 'Foot bones', 'पैर की हड्डियाँ', '26 bones in each foot form arches that carry our weight and help us walk and run.', 'हर पैर की 26 हड्डियाँ मेहराब बनाती हैं जो हमारा भार उठाती हैं और चलने-दौड़ने में मदद करती हैं।', [206, 706], SK.foot, { l: 'bones' }),
      P('ball', 'Ball-and-socket joint', 'कंदुक-खल्लिका संधि', 'Shoulder and hip: a round end fits in a cup, so the arm or leg can move in all directions.', 'कंधा और कूल्हा: गोल सिरा एक प्याले जैसे गड्ढे में फँसता है, इसलिए बाँह या टाँग हर दिशा में घूम सकती है।', [172, 178], JOINT([[172, 178], [308, 178], [205, 423], [275, 423]], '#8B3DFF'), { l: 'joints' }),
      P('hinge', 'Hinge joint', 'कब्ज़ा (हिंज) संधि', 'Elbow and knee: they move back and forth in one direction only, like a door on its hinge.', 'कोहनी और घुटना: ये दरवाज़े के कब्ज़े की तरह केवल एक ही दिशा में आगे-पीछे चलते हैं।', [145, 320], JOINT([[145, 320], [335, 320], [208, 572], [272, 572]], '#FF7A1A'), { l: 'joints' }),
      P('pivot', 'Pivotal joint', 'धुराग्र संधि', 'Where the head joins the neck: it lets the head turn left and right.', 'जहाँ सिर गर्दन से जुड़ता है: इससे सिर दाएँ-बाएँ घूमता है।', [240, 124], JOINT([[240, 124]], '#14B8A6'), { l: 'joints' }),
      P('gliding', 'Gliding joint', 'सरकने वाली संधि', 'Wrist and ankle: small bones slide a little over one another.', 'कलाई और टखना: छोटी हड्डियाँ एक-दूसरे पर थोड़ा सरकती हैं।', [128, 422], JOINT([[128, 422], [352, 422], [206, 690], [274, 690]], '#2563EB'), { l: 'joints' }),
      P('fixed', 'Fixed joint', 'अचल संधि', 'The bones of the skull are locked together and cannot move.', 'खोपड़ी की हड्डियाँ आपस में जकड़ी रहती हैं और हिल नहीं सकतीं।', [240, 40], JOINT([[240, 40]], '#64748B'), { l: 'joints' }),
    ],
  };

  // MUSCLES ----------------------------------------------------------
  const MU = (pts) => blob(pts, 'url(#by-musc)', '#9F1D2B', 1.4);
  const MS = {
    deltoid: both(MU([[178, 166], [160, 168], [148, 182], [144, 204], [150, 226], [160, 214], [170, 194], [182, 180]])),
    pectoral: both(MU([[236, 176], [200, 172], [182, 182], [174, 200], [178, 220], [194, 234], [220, 236], [236, 228]])),
    biceps: both(MU([[162, 214], [152, 226], [147, 260], [147, 292], [151, 312], [157, 300], [163, 270], [167, 236]])),
    forearm: both(MU([[147, 322], [137, 340], [127, 380], [123, 408], [133, 410], [144, 380], [152, 346], [156, 326]])),
    abs: [242, 268, 294].map((y) => `<rect x="222" y="${y}" width="16" height="22" rx="6" fill="url(#by-musc)" stroke="#9F1D2B" stroke-width="1.3"/><rect x="242" y="${y}" width="16" height="22" rx="6" fill="url(#by-musc)" stroke="#9F1D2B" stroke-width="1.3"/>`).join('') + MU([[222, 320], [238, 320], [238, 386], [232, 392], [224, 372]]) + MU([[242, 320], [258, 320], [256, 372], [248, 392], [242, 386]]),
    obliques: both(MU([[194, 240], [186, 270], [186, 330], [192, 372], [214, 392], [220, 370], [220, 320], [218, 262], [210, 240]])),
    quads: both(MU([[184, 434], [182, 480], [190, 540], [200, 562], [212, 560], [222, 520], [228, 470], [226, 440], [210, 446]])),
    shin: both(MU([[196, 590], [194, 630], [200, 672], [206, 672], [210, 630], [208, 592]])),
    trapezius: MU([[240, 118], [226, 128], [214, 150], [182, 166], [176, 176], [212, 190], [232, 240], [240, 296], [248, 240], [268, 190], [304, 176], [298, 166], [266, 150], [254, 128]]),
    triceps: both(MU([[163, 210], [151, 224], [145, 262], [147, 300], [153, 316], [161, 300], [167, 262], [170, 226]])),
    lats: both(MU([[228, 238], [204, 222], [182, 228], [180, 262], [188, 310], [206, 344], [234, 352], [236, 300]])),
    glutes: both(MU([[238, 396], [214, 392], [186, 402], [180, 428], [190, 452], [214, 458], [236, 448]])),
    hams: both(MU([[186, 462], [184, 500], [192, 548], [202, 566], [214, 566], [226, 520], [230, 476], [224, 460]])),
    calf: both(MU([[192, 586], [188, 612], [194, 646], [204, 654], [214, 640], [220, 612], [218, 586], [206, 578]])),
    achilles: both(tube('M205 652L207 690', 4, '#F3E6D3', '#B9A27E')),
  };
  // Biceps and triceps on a side view of the arm: bend = 0 (straight) .. 1 (bent).
  function armPair(bend, t) {
    const sh = [38, 74], el = [170, 92], a = -bend * 2.0;
    const dir = [Math.cos(a), Math.sin(a)], fl = 112, wr = [el[0] + dir[0] * fl, el[1] + dir[1] * fl];
    const ins = [el[0] + dir[0] * 20 - dir[1] * 8, el[1] + dir[1] * 20 + dir[0] * -8];
    const olec = [el[0] - dir[0] * 9 + dir[1] * 6, el[1] - dir[1] * 9 - dir[0] * 6];
    const spindle = (A, B, th, side) => { const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, dx = B[0] - A[0], dy = B[1] - A[1], Ln = Math.hypot(dx, dy) || 1, nx = -dy / Ln * side, ny = dx / Ln * side; return `M${r1(A[0])} ${r1(A[1])}Q${r1(mx + nx * th * 2)} ${r1(my + ny * th * 2)} ${r1(B[0])} ${r1(B[1])}Q${r1(mx + nx * th * 0.3)} ${r1(my + ny * th * 0.3)} ${r1(A[0])} ${r1(A[1])}Z`; };
    const bi = spindle([56, 66], ins, 8 + 9 * bend, -1), tri = spindle([52, 84], olec, 10 - 5 * bend, 1);
    return `<circle cx="34" cy="76" r="20" fill="url(#by-skin)" stroke="#D99A80" stroke-width="1.6"/>${bone(sh[0], sh[1], el[0], el[1], 9)}${bone(el[0], el[1], wr[0], wr[1], 7)}<circle cx="${r1(wr[0] + dir[0] * 12)}" cy="${r1(wr[1] + dir[1] * 12)}" r="12" fill="url(#by-skin)" stroke="#D99A80" stroke-width="1.6"/>
      <g class="by-part" data-key="part:biceps" data-id="biceps" role="button" tabindex="0" aria-label="${esc(t(T2('Biceps', 'बाइसेप्स')))}"><path d="${bi}" fill="url(#by-musc)" stroke="#9F1D2B" stroke-width="1.4"/></g>
      <g class="by-part" data-key="part:triceps" data-id="triceps" role="button" tabindex="0" aria-label="${esc(t(T2('Triceps', 'ट्राइसेप्स')))}"><path d="${tri}" fill="url(#by-musc)" stroke="#9F1D2B" stroke-width="1.4" opacity=".92"/></g>`;
  }
  SCENES.muscles = {
    name: T2('Muscles', 'पेशियाँ'), about: T2('More than 600 muscles pull on bones to move us. Muscles can only pull, so they work in pairs.', '600 से ज़्यादा पेशियाँ हड्डियों को खींचकर हमें चलाती हैं। पेशियाँ केवल खींच सकती हैं, इसलिए जोड़ियों में काम करती हैं।'),
    vb: [60, 8, 360, 724], body: true, views: true, note: BODY_NOTE,
    layers: [{ id: 'muscles', n: T2('Muscles', 'पेशियाँ'), on: true }, { id: 'bones', n: T2('Bones under', 'नीचे की हड्डियाँ'), on: false }, { id: 'pair', n: T2('Muscle pair', 'पेशियों की जोड़ी'), on: false }],
    bg: (st) => figure({ back: st.view === 'back' }) + (st.layers.has('bones') ? `<g opacity=".55" pointer-events="none">${skeletonAll(st.view)}</g>` : ''),
    parts: [
      P('trapezius', 'Trapezius', 'ट्रेपेज़ियस', 'A big diamond-shaped muscle of the upper back. It lifts the shoulders and holds the head up.', 'ऊपरी पीठ की बड़ी हीरे जैसी पेशी। यह कंधों को उठाती है और सिर को थामे रखती है।', [240, 210], MS.trapezius, { l: 'muscles', v: 'back' }),
      P('lats', 'Broad back muscle', 'पीठ की चौड़ी पेशी', 'The latissimus dorsi pulls the arms down and back, as in climbing or swimming.', 'लैटिसिमस डॉर्सी बाँहों को नीचे और पीछे खींचती है, जैसे चढ़ते या तैरते समय।', [196, 290], MS.lats, { l: 'muscles', v: 'back' }),
      P('deltoid', 'Shoulder muscle (deltoid)', 'कंधे की पेशी (डेल्टॉइड)', 'It covers the shoulder like a cap and lifts the arm out to the side.', 'यह कंधे को टोपी की तरह ढकती है और बाँह को बगल में ऊपर उठाती है।', [154, 196], MS.deltoid, { l: 'muscles' }),
      P('pectoral', 'Chest muscle', 'छाती की पेशी', 'The pectoral muscles pull the arms forward and across the chest, as in pushing or hugging.', 'छाती की पेशियाँ बाँहों को आगे और छाती के पार खींचती हैं, जैसे धक्का देते या गले लगाते समय।', [298, 206], MS.pectoral, { l: 'muscles', v: 'front' }),
      P('biceps', 'Biceps', 'बाइसेप्स (द्विशिर पेशी)', 'On the front of the upper arm. When it contracts it bends the elbow.', 'ऊपरी बाँह के आगे। जब यह सिकुड़ती है तो कोहनी मुड़ती है।', [154, 262], MS.biceps, { l: 'muscles', v: 'front' }),
      P('triceps', 'Triceps', 'ट्राइसेप्स (त्रिशिर पेशी)', 'On the back of the upper arm. When it contracts it straightens the elbow. It works as a pair with the biceps.', 'ऊपरी बाँह के पीछे। जब यह सिकुड़ती है तो कोहनी सीधी होती है। यह बाइसेप्स के साथ जोड़ी में काम करती है।', [326, 262], MS.triceps, { l: 'muscles', v: 'back' }),
      P('forearm', 'Forearm muscles', 'अग्रबाहु की पेशियाँ', 'They move the wrist and the fingers through long tendons.', 'ये लंबी कंडराओं से कलाई और उँगलियों को चलाती हैं।', [134, 372], MS.forearm, { l: 'muscles' }),
      P('abs', 'Belly muscles', 'पेट की पेशियाँ', 'The rectus abdominis bends the body forward and holds the belly organs in place.', 'रेक्टस एब्डोमिनिस शरीर को आगे झुकाती है और पेट के अंगों को जगह पर रखती है।', [248, 280], MS.abs, { l: 'muscles', v: 'front' }),
      P('obliques', 'Side belly muscles', 'पेट की बगल की पेशियाँ', 'The obliques twist and bend the body to the side.', 'ऑब्लिक पेशियाँ शरीर को मोड़ती और बगल में झुकाती हैं।', [292, 320], MS.obliques, { l: 'muscles', v: 'front' }),
      P('glutes', 'Buttock muscle', 'नितंब की पेशी', 'The gluteus maximus is the largest muscle in the body. It straightens the hip when we stand up, climb or run.', 'ग्लूटियस मैक्सिमस शरीर की सबसे बड़ी पेशी है। उठते, चढ़ते या दौड़ते समय यह कूल्हे को सीधा करती है।', [206, 424], MS.glutes, { l: 'muscles', v: 'back' }),
      P('quads', 'Front thigh muscles', 'जाँघ की आगे की पेशियाँ', 'The quadriceps straighten the knee, for kicking, jumping and standing up.', 'क्वाड्रिसेप्स घुटने को सीधा करती हैं, लात मारने, कूदने और खड़े होने के लिए।', [272, 500], MS.quads, { l: 'muscles', v: 'front' }),
      P('hams', 'Back thigh muscles', 'जाँघ के पीछे की पेशियाँ', 'The hamstrings bend the knee. They pair with the front thigh muscles.', 'हैमस्ट्रिंग घुटने को मोड़ती हैं। ये जाँघ की आगे की पेशियों के साथ जोड़ी बनाती हैं।', [272, 512], MS.hams, { l: 'muscles', v: 'back' }),
      P('shin', 'Shin muscle', 'पिंडली के आगे की पेशी', 'It lifts the toes and the front of the foot as we walk.', 'चलते समय यह पंजे और पैर के आगे के भाग को ऊपर उठाती है।', [204, 632], MS.shin, { l: 'muscles', v: 'front' }),
      P('calf', 'Calf muscle', 'पिंडली की पेशी', 'It lifts the heel so we can stand on tiptoe, walk and jump.', 'यह एड़ी उठाती है ताकि हम पंजों पर खड़े हो सकें, चल सकें और कूद सकें।', [276, 614], MS.calf, { l: 'muscles', v: 'back' }),
      P('achilles', 'Heel tendon', 'एड़ी की कंडरा', 'The Achilles tendon joins the calf muscle to the heel bone. It is the strongest tendon in the body.', 'एकिलीज़ कंडरा पिंडली की पेशी को एड़ी की हड्डी से जोड़ती है। यह शरीर की सबसे मज़बूत कंडरा है।', [206, 676], MS.achilles, { l: 'muscles', v: 'back' }),
    ],
    zoom: {
      layer: 'pair', title: T2('A muscle pair moves the elbow', 'पेशियों की जोड़ी कोहनी चलाती है'), vb: [0, 0, 320, 200],
      draw: (st, t) => armPair(st.bend || 0, t),
      caption: (st, t) => (st.bend > 0.5 ? t(T2('Biceps contracts (shorter, fatter); triceps relaxes. The elbow bends.', 'बाइसेप्स सिकुड़ती है (छोटी, मोटी); ट्राइसेप्स ढीली होती है। कोहनी मुड़ती है।')) : t(T2('Triceps contracts; biceps relaxes. The elbow straightens.', 'ट्राइसेप्स सिकुड़ती है; बाइसेप्स ढीली होती है। कोहनी सीधी होती है।'))),
      parts: [],
    },
    playName: T2('Bend the arm', 'बाँह मोड़ो'), playLayer: 'pair', playMs: 6000,
    anim: (k, st) => { st.bend = 0.5 - 0.5 * Math.cos(k * Math.PI * 4); },
  };

  // DIGESTIVE --------------------------------------------------------
  function snake(x1, x2, y0, dy, rows) {
    let d = `M${x1} ${y0}`;
    for (let r = 0; r < rows; r++) {
      const y = y0 + r * dy, to = r % 2 ? x1 : x2;
      d += `L${to} ${y}`;
      if (r < rows - 1) d += `A${dy / 2} ${dy / 2} 0 0 ${r % 2 ? 0 : 1} ${to} ${y + dy}`;
    }
    return d;
  }
  const SI_D = 'M256 356C246 368 220 366 214 378L212 386' + snake(212, 278, 386, 10, 4).replace(/^M[^L]*/, '') + 'L200 424';
  const LI_D = 'M196 432C190 420 188 400 190 382C191 372 198 368 212 368L272 368C288 368 294 376 294 392L294 420C294 434 286 440 272 442C262 444 252 444 246 446';
  const STOMACH = [[252, 300], [260, 290], [280, 292], [300, 306], [306, 330], [294, 352], [268, 362], [250, 360], [250, 350], [266, 344], [276, 328], [268, 312]];
  SCENES.digestive = {
    name: T2('Digestive system', 'पाचन तंत्र'), about: T2('A long tube from the mouth to the anus, with glands that pour in juices, breaks food into tiny pieces the blood can carry.', 'मुँह से गुदा तक एक लंबी नली, और उसमें रस डालने वाली ग्रंथियाँ, भोजन को इतने छोटे कणों में तोड़ती हैं कि रक्त उन्हें ले जा सके।'),
    vb: [100, 28, 280, 452], body: true, note: BODY_NOTE,
    layers: [{ id: 'tract', n: T2('Food pipe and gut', 'आहार नाल'), on: true }, { id: 'glands', n: T2('Glands', 'ग्रंथियाँ'), on: true }, { id: 'villi', n: T2('Zoom: villi', 'ज़ूम: रसांकुर'), on: false }],
    bg: () => figure(),
    parts: [
      P('oesophagus', 'Food pipe (oesophagus)', 'ग्रासनली (भोजन नली)', 'A muscular tube about 25 cm long. Waves of squeezing (peristalsis) push each swallow down to the stomach.', 'लगभग 25 सेमी लंबी पेशीय नली। सिकुड़न की लहरें (क्रमाकुंचन) हर निवाले को नीचे आमाशय तक धकेलती हैं।', [238, 200], tube('M240 112C240 150 241 200 244 250C246 276 248 290 252 300', 7, '#EE8A8F', '#B4505A'), { l: 'tract' }),
      P('pancreas', 'Pancreas', 'अग्न्याशय', 'It pours pancreatic juice into the small intestine to digest proteins, fats and starch. It also makes insulin.', 'यह छोटी आंत में अग्न्याशयी रस डालता है जो प्रोटीन, वसा और मंड को पचाता है। यह इंसुलिन भी बनाता है।', [282, 350], blob([[222, 356], [232, 350], [262, 348], [290, 340], [302, 344], [294, 354], [262, 362], [236, 366]], '#F5C46B', '#B7862A'), { l: 'glands' }),
      P('stomach', 'Stomach', 'आमाशय', 'A J-shaped muscular bag. It churns food with hydrochloric acid, which kills germs, and with juices that begin to digest protein.', 'J आकार की पेशीय थैली। यह भोजन को हाइड्रोक्लोरिक अम्ल के साथ मथता है, जो रोगाणु मारता है, और ऐसे रसों के साथ जो प्रोटीन का पाचन शुरू करते हैं।', [288, 328], blob(STOMACH, '#F28C80', '#B4483E') + '<path d="M262 318C276 324 286 336 278 348M270 304C288 312 296 326 292 342" fill="none" stroke="#FFFFFF" stroke-opacity=".45" stroke-width="1.6"/>', { l: 'tract' }),
      P('liver', 'Liver', 'यकृत', 'The largest gland in the body. It makes bile, which breaks fat into small drops, and it stores extra sugar.', 'शरीर की सबसे बड़ी ग्रंथि। यह पित्त बनाता है, जो वसा को छोटी बूँदों में तोड़ता है, और अतिरिक्त शर्करा जमा रखता है।', [200, 304], blob([[172, 300], [186, 286], [220, 282], [258, 284], [286, 292], [292, 300], [270, 308], [236, 320], [206, 336], [184, 334], [174, 320]], '#A9442F', '#6E2418') + '<path d="M236 286C232 300 228 312 222 324" fill="none" stroke="#6E2418" stroke-width="1.2" opacity=".6"/>', { l: 'glands' }),
      P('gallbladder', 'Gall bladder', 'पित्ताशय', 'A small bag under the liver that stores bile and squeezes it into the small intestine after a meal.', 'यकृत के नीचे एक छोटी थैली जो पित्त जमा करती है और भोजन के बाद उसे छोटी आंत में डालती है।', [206, 338], blob([[200, 326], [210, 326], [214, 338], [208, 348], [200, 344]], '#5DBB63', '#2F7A35'), { l: 'glands' }),
      P('largeint', 'Large intestine', 'बड़ी आंत', 'About 1.5 m long and wider than the small intestine. It takes water and some salts back from the undigested food.', 'लगभग 1.5 मीटर लंबी और छोटी आंत से चौड़ी। यह बिना पचे भोजन से पानी और कुछ लवण वापस सोख लेती है।', [294, 400], tube(LI_D, 14, '#E8956B', '#A85A34') + `<path d="${LI_D}" fill="none" stroke="#A85A34" stroke-width="14" stroke-dasharray="1.6 9" opacity=".55" pointer-events="none"/>`, { l: 'tract' }),
      P('appendix', 'Appendix', 'परिशेषिका (अपेंडिक्स)', 'A small, finger-like pouch at the start of the large intestine. In humans it has no known role in digestion.', 'बड़ी आंत की शुरुआत में एक छोटी, उँगली जैसी थैली। मनुष्य में पाचन में इसका कोई ज्ञात काम नहीं है।', [198, 448], tube('M194 438C192 446 196 452 204 454', 4.5, '#E8956B', '#A85A34'), { l: 'tract' }),
      P('smallint', 'Small intestine', 'छोटी आंत (क्षुद्रांत्र)', 'The longest part of the gut, about 7 m, coiled up. Bile and juices finish digestion here, and the digested food passes into the blood.', 'आहार नाल का सबसे लंबा भाग, लगभग 7 मीटर, कुंडली में लिपटा। यहाँ पित्त और रस पाचन पूरा करते हैं और पचा भोजन रक्त में जाता है।', [250, 401], tube(SI_D, 7, '#F7A8A2', '#BD5F5A'), { l: 'tract' }),
      P('rectum', 'Rectum', 'मलाशय', 'The last part of the large intestine. The solid waste (faeces) is stored here for a while.', 'बड़ी आंत का अंतिम भाग। ठोस अपशिष्ट (मल) कुछ समय यहाँ जमा रहता है।', [244, 450], tube('M246 446C242 448 240 452 240 458', 11, '#D97A55', '#A0502C'), { l: 'tract' }),
      P('anus', 'Anus', 'गुदा', 'The opening at the end of the gut. Undigested waste leaves the body here; this is called egestion.', 'आहार नाल के अंत का छिद्र। बिना पचा अपशिष्ट यहाँ से शरीर के बाहर निकलता है; इसे मल-त्याग कहते हैं।', [240, 464], '<circle cx="240" cy="464" r="5" fill="#7C2D12" stroke="#4A1A0A" stroke-width="1.5"/><circle cx="240" cy="464" r="12" fill="transparent"/>', { l: 'tract' }),
      P('mouth', 'Mouth', 'मुख', 'Teeth cut and grind the food and the tongue mixes it with saliva. Saliva begins to turn starch into sugar.', 'दाँत भोजन को काटते और पीसते हैं और जीभ उसे लार में मिलाती है। लार मंड को शर्करा में बदलना शुरू करती है।', [240, 100], '<ellipse cx="240" cy="100" rx="13" ry="6.5" fill="#D9475A" stroke="#962235" stroke-width="1.5"/><ellipse cx="240" cy="101" rx="8" ry="2.6" fill="#5B1020"/><ellipse cx="240" cy="100" rx="18" ry="12" fill="transparent"/>', { l: 'tract' }),
      P('salivary', 'Salivary glands', 'लार ग्रंथियाँ', 'Three pairs of glands that pour saliva into the mouth. Saliva wets the food and starts digesting starch.', 'तीन जोड़ी ग्रंथियाँ जो मुँह में लार डालती हैं। लार भोजन को गीला करती है और मंड का पाचन शुरू करती है।', [207, 95], both(blob([[202, 84], [212, 86], [214, 98], [208, 106], [200, 100]], '#F7B7C8', '#C26A86') + blob([[218, 112], [228, 112], [230, 120], [222, 124], [216, 120]], '#F7B7C8', '#C26A86')), { l: 'glands' }),
    ],
    zoom: {
      layer: 'villi', title: T2('Zoom: the inner wall of the small intestine', 'ज़ूम: छोटी आंत की भीतरी दीवार'), vb: [0, 0, 320, 170],
      bg: () => '<rect x="0" y="120" width="320" height="50" fill="#F7A8A2"/><path d="M0 120H320" stroke="#BD5F5A" stroke-width="2"/>' + [0, 1, 2, 3, 4, 5, 6].map((k) => `<circle cx="${20 + k * 46}" cy="${40 + (k % 3) * 18}" r="5" fill="#B45309" opacity=".7"/>`).join(''),
      caps: [[12, 20, T2('digested food', 'पचा हुआ भोजन'), 'start'], [160, 158, T2('wall of the small intestine', 'छोटी आंत की दीवार')]],
      parts: [
        P('villi', 'Villi', 'रसांकुर (विलाई)', 'Millions of tiny finger-like folds give the small intestine a huge surface, so digested food is absorbed quickly into the blood.', 'लाखों छोटे उँगली जैसे उभार छोटी आंत की सतह को बहुत बड़ा बना देते हैं, ताकि पचा भोजन जल्दी रक्त में सोखा जाए।', [160, 70], [0, 1, 2, 3, 4, 5].map((k) => { const x = 30 + k * 50; return `<path d="M${x - 16} 122C${x - 16} 60 ${x - 12} 46 ${x} 46C${x + 12} 46 ${x + 16} 60 ${x + 16} 122Z" fill="#F9B8B2" stroke="#BD5F5A" stroke-width="1.6"/>`; }).join('')),
        P('capillary', 'Blood capillaries', 'रक्त केशिकाएँ', 'Inside each villus a net of tiny blood vessels picks up the digested food and carries it to every part of the body.', 'हर रसांकुर के अंदर बारीक रक्त वाहिकाओं का जाल पचा भोजन उठाकर शरीर के हर भाग तक ले जाता है।', [80, 100], [0, 1, 2, 3, 4, 5].map((k) => { const x = 30 + k * 50; return `<path d="M${x - 8} 122C${x - 8} 80 ${x - 6} 58 ${x} 58C${x + 6} 58 ${x + 8} 80 ${x + 8} 122" fill="none" stroke="#DC2626" stroke-width="2.4"/><path d="M${x - 8} 96L${x + 8} 84M${x - 8} 108L${x + 8} 98" stroke="#DC2626" stroke-width="1.4"/>`; }).join('') + hit('M22 120V60M72 120V60M122 120V60M172 120V60M222 120V60M272 120V60', 10)),
      ],
    },
    flows: {
      food: {
        col: '#B45309', name: T2('food', 'भोजन'), start: T2('Where does food enter the body? Tap it.', 'भोजन शरीर में कहाँ से जाता है? उस पर टैप करो।'),
        done: T2('Food travels about 9 m from the mouth to the anus and is digested on the way.', 'भोजन मुँह से गुदा तक लगभग 9 मीटर चलता है और रास्ते में पचता है।'),
        steps: [
          { p: 'mouth', at: [240, 100], s: T2('Teeth chew the food and saliva starts to digest starch.', 'दाँत भोजन चबाते हैं और लार मंड का पाचन शुरू करती है।') },
          { p: 'oesophagus', at: [246, 262], via: [[240, 118], [240, 160], [242, 214]], s: T2('Swallowed food is squeezed down the food pipe.', 'निगला गया भोजन भोजन नली से नीचे धकेला जाता है।') },
          { p: 'stomach', at: [282, 330], via: [[252, 300], [272, 308]], s: T2('The stomach churns it with acid and digestive juice for a few hours.', 'आमाशय उसे कुछ घंटों तक अम्ल और पाचक रस के साथ मथता है।') },
          { p: 'smallint', at: [246, 406], via: [[256, 356], [232, 366], [214, 380], [212, 386], [278, 386], [278, 396], [212, 396]], s: T2('Bile and juices finish digestion; the villi pass the food into the blood.', 'पित्त और रस पाचन पूरा करते हैं; रसांकुर भोजन को रक्त में पहुँचाते हैं।') },
          { p: 'largeint', at: [294, 412], via: [[212, 406], [212, 416], [200, 424], [192, 410], [190, 384], [206, 368], [272, 368], [292, 378]], s: T2('Water is taken back from what could not be digested.', 'जो पच नहीं सका उससे पानी वापस सोखा जाता है।') },
          { p: 'rectum', at: [244, 448], via: [[292, 430], [272, 442]], s: T2('The waste is stored for a while.', 'अपशिष्ट कुछ समय जमा रहता है।') },
          { p: 'anus', at: [240, 464], s: T2('The waste leaves the body (egestion).', 'अपशिष्ट शरीर से बाहर निकलता है (मल-त्याग)।') },
        ],
      },
    },
  };

  // RESPIRATORY ------------------------------------------------------
  const RL = [[224, 178], [212, 182], [196, 200], [184, 230], [178, 266], [180, 296], [196, 302], [220, 300], [234, 296], [236, 262], [232, 226], [230, 192]];
  const LL = [[256, 178], [268, 182], [284, 200], [296, 230], [302, 266], [300, 296], [284, 302], [266, 302], [256, 296], [258, 282], [250, 272], [246, 252], [250, 226], [250, 192]];
  const LUNGS = (op) => `<g opacity="${op}">${blob(RL, '#F49CA8', '#C0506A')}${blob(LL, '#F49CA8', '#C0506A')}<path d="M184 248Q206 244 232 250M232 214Q206 252 190 298M250 210Q276 250 292 298" fill="none" stroke="#C0506A" stroke-width="1.3" opacity=".7"/></g>`;
  const TREE = 'M212 238L196 222M196 222L188 210M196 222L204 206M212 238L190 252M190 252L180 262M190 252L186 238M212 238L204 268M204 268L192 284M204 268L218 286M218 286L224 276';
  const TIPS = [[188, 210], [204, 206], [180, 262], [186, 238], [192, 284], [218, 286], [224, 276]];
  const DIAPH = 'M170 318C186 292 222 296 240 302C258 296 294 292 310 318L310 325C294 300 258 305 240 310C222 305 186 300 170 325Z';
  const heartFaint = '<path d="' + smooth([[226, 252], [244, 244], [262, 252], [266, 270], [252, 290], [240, 292], [228, 276]]) + '" fill="#E35B6A" opacity=".55"/>';
  SCENES.respiratory = {
    name: T2('Respiratory system', 'श्वसन तंत्र'), about: T2('We breathe in air so that oxygen can reach the blood, and breathe out carbon dioxide.', 'हम हवा अंदर लेते हैं ताकि ऑक्सीजन रक्त तक पहुँचे, और कार्बन डाइऑक्साइड बाहर छोड़ते हैं।'),
    vb: [112, 28, 256, 304], body: true, note: BODY_NOTE,
    layers: [{ id: 'airways', n: T2('Airways', 'वायु मार्ग'), on: true }, { id: 'ribs', n: T2('Ribs', 'पसलियाँ'), on: false }, { id: 'alveoli', n: T2('Zoom: air sacs', 'ज़ूम: वायु कूपिकाएँ'), on: false }],
    bg: () => figure() + heartFaint,
    parts: [
      P('lungs', 'Lungs', 'फेफड़े', 'Two spongy organs in the chest. The right lung has 3 lobes; the left has 2 and leaves room for the heart.', 'छाती में दो स्पंज जैसे अंग। दाएँ फेफड़े में 3 पालियाँ हैं; बाएँ में 2, जो हृदय के लिए जगह छोड़ता है।', [290, 262], `<g id="by-lungs">${LUNGS(1)}</g>`, { l: 'airways' }),
      P('bronchioles', 'Bronchioles', 'श्वसनिकाएँ', 'Each bronchus branches again and again into thousands of fine tubes, like the branches of a tree.', 'हर श्वसनी बार-बार बँटकर हज़ारों बारीक नलियाँ बनाती है, पेड़ की टहनियों की तरह।', [196, 222], both(line(TREE, 2.4, '#E9A0B2')), { l: 'airways' }),
      P('alveoli', 'Air sacs (alveoli)', 'वायु कूपिकाएँ', 'Millions of tiny balloons at the ends of the bronchioles. Oxygen passes from them into the blood; carbon dioxide passes out.', 'श्वसनिकाओं के सिरों पर लाखों छोटे गुब्बारे। इनसे ऑक्सीजन रक्त में जाती है; कार्बन डाइऑक्साइड बाहर आती है।', [192, 284], both(TIPS.map(([x, y]) => `<circle cx="${x - 2}" cy="${y}" r="3" fill="#F8C2CC" stroke="#C0506A"/><circle cx="${x + 2}" cy="${y - 2}" r="3" fill="#F8C2CC" stroke="#C0506A"/><circle cx="${x + 1}" cy="${y + 3}" r="3" fill="#F8C2CC" stroke="#C0506A"/><circle cx="${x}" cy="${y}" r="9" fill="transparent"/>`).join('')), { l: 'airways' }),
      P('bronchi', 'Bronchi', 'श्वसनियाँ', 'The windpipe divides into two bronchi, one going into each lung.', 'श्वासनली दो श्वसनियों में बँटती है, एक-एक हर फेफड़े में जाती है।', [262, 224], tube('M240 204L224 222L212 238', 7, '#F3C9D2', '#B9707F') + tube('M240 204L258 220L270 234', 7, '#F3C9D2', '#B9707F'), { l: 'airways' }),
      P('trachea', 'Windpipe (trachea)', 'श्वासनली', 'A tube held open by C-shaped rings of cartilage, so it never collapses.', 'C आकार के उपास्थि के छल्लों से खुली रहने वाली नली, ताकि यह कभी पिचके नहीं।', [240, 172], tube('M240 142L240 206', 11, '#F3D2D8', '#B9707F') + [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => `<path d="M235 ${148 + k * 6.6}h10" stroke="#C98A99" stroke-width="2" stroke-linecap="round" pointer-events="none"/>`).join(''), { l: 'airways' }),
      P('larynx', 'Voice box (larynx)', 'स्वरयंत्र', 'It holds the vocal cords, which make sound. A flap, the epiglottis, closes it when we swallow so food does not go into the windpipe.', 'इसमें स्वर-रज्जु होते हैं जो आवाज़ बनाते हैं। निगलते समय एक ढक्कन (घाँटी-ढक्कन) इसे बंद करता है ताकि भोजन श्वासनली में न जाए।', [244, 133], '<path d="M230 124H250L248 142H232Z" fill="#E9A3B8" stroke="#A85A70" stroke-width="1.5"/><path d="M240 126L236 140M240 126L244 140" stroke="#A85A70" stroke-width="1.2"/><rect x="226" y="120" width="28" height="26" fill="transparent"/>', { l: 'airways' }),
      P('pharynx', 'Throat (pharynx)', 'ग्रसनी (गला)', 'A shared passage behind the nose and mouth for both air and food.', 'नाक और मुँह के पीछे का साझा रास्ता, हवा और भोजन दोनों के लिए।', [240, 113], tube('M240 92L240 124', 9, '#F2A7B5', '#B4607A'), { l: 'airways' }),
      P('nose', 'Nose', 'नाक (नासिका)', 'Air enters through the nostrils. Hairs and sticky mucus trap dust and germs, and the air is warmed and made moist.', 'हवा नथुनों से अंदर आती है। बाल और चिपचिपा श्लेष्म धूल और रोगाणु रोकते हैं, और हवा गर्म व नम होती है।', [240, 72], '<path d="M231 62Q240 55 249 62L253 86Q240 93 227 86Z" fill="#F9B4C0" stroke="#C0506A" stroke-width="1.4" opacity=".95"/><ellipse cx="235" cy="88" rx="3.2" ry="2" fill="#5B1020"/><ellipse cx="245" cy="88" rx="3.2" ry="2" fill="#5B1020"/>', { l: 'airways' }),
      P('diaphragm', 'Diaphragm', 'डायाफ्राम (मध्यपट)', 'A dome-shaped sheet of muscle under the lungs. When it tightens and flattens, the chest gets bigger and air rushes in.', 'फेफड़ों के नीचे गुंबद जैसी पेशी की परत। जब यह कसकर चपटी होती है, छाती बड़ी होती है और हवा अंदर आती है।', [290, 306], `<g id="by-diaph"><path d="${DIAPH}" fill="#C2587A" stroke="#7E2747" stroke-width="1.4"/></g>`),
      P('ribs', 'Rib cage', 'पसलियों का पिंजरा', 'The ribs protect the lungs. Muscles between them lift the ribs up and out when we breathe in.', 'पसलियाँ फेफड़ों की रक्षा करती हैं। उनके बीच की पेशियाँ साँस लेते समय पसलियों को ऊपर और बाहर उठाती हैं।', [190, 200], (st) => `<g opacity=".8">${ribs(false)}${SK.sternum}</g>` + hit('M186 190V300M294 190V300', 20), { l: 'ribs' }),
    ],
    zoom: {
      layer: 'alveoli', title: T2('Zoom: air sacs and blood', 'ज़ूम: वायु कूपिकाएँ और रक्त'), vb: [0, 0, 320, 180],
      bg: () => '<path d="M160 0V40" stroke="#E9A0B2" stroke-width="10" stroke-linecap="round"/>',
      caps: [[172, 16, T2('air', 'हवा'), 'start'], [300, 172, T2('O₂ into blood', 'O₂ रक्त में'), 'end'], [20, 172, T2('CO₂ out', 'CO₂ बाहर'), 'start']],
      parts: [
        P('alveoli', 'Air sacs (alveoli)', 'वायु कूपिकाएँ', 'Their walls are only one cell thick, so gases pass through easily.', 'इनकी दीवार केवल एक कोशिका मोटी है, इसलिए गैसें आसानी से पार होती हैं।', [192, 284], [[120, 80], [160, 66], [200, 80], [136, 116], [184, 116], [160, 100]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="24" fill="#FBD0D8" stroke="#C0506A" stroke-width="1.6"/>`).join('') + '<path d="M160 40L160 60" stroke="#E9A0B2" stroke-width="8"/>'),
        P('capillary', 'Blood capillaries', 'रक्त केशिकाएँ', 'A net of tiny blood vessels wraps each air sac. Blood here picks up oxygen and gives away carbon dioxide.', 'हर वायु कूपिका को बारीक रक्त वाहिकाओं का जाल लपेटे रहता है। यहाँ रक्त ऑक्सीजन लेता है और कार्बन डाइऑक्साइड छोड़ता है।', [70, 140], line('M30 150C70 130 90 100 108 70C122 50 150 50 170 48C196 48 214 62 226 84C238 110 254 130 290 150', 4, '#3B6FD8') + line('M30 156C80 140 110 136 136 142C160 148 196 146 226 136C250 128 270 136 290 156', 4, '#DC2626')),
      ],
    },
    flows: {
      air: {
        col: '#06B6D4', name: T2('air', 'हवा'), start: T2('Where does air enter the body? Tap it.', 'हवा शरीर में कहाँ से जाती है? उस पर टैप करो।'),
        done: T2('Air reached the air sacs. Oxygen goes into the blood; carbon dioxide comes back out the same way.', 'हवा वायु कूपिकाओं तक पहुँची। ऑक्सीजन रक्त में जाती है; कार्बन डाइऑक्साइड इसी रास्ते बाहर आती है।'),
        steps: [
          { p: 'nose', at: [240, 80], s: T2('Air enters the nostrils; it is cleaned, warmed and moistened.', 'हवा नथुनों से आती है; वह साफ़, गर्म और नम होती है।') },
          { p: 'pharynx', at: [240, 110], s: T2('It passes through the throat.', 'वह गले से गुज़रती है।') },
          { p: 'larynx', at: [240, 133], s: T2('Then through the voice box.', 'फिर स्वरयंत्र से।') },
          { p: 'trachea', at: [240, 180], s: T2('Down the windpipe.', 'श्वासनली से नीचे।') },
          { p: 'bronchi', at: [222, 226], via: [[240, 204]], s: T2('Into a bronchus and a lung.', 'एक श्वसनी से फेफड़े में।') },
          { p: 'bronchioles', at: [204, 268], via: [[212, 238]], s: T2('Along smaller and smaller bronchioles.', 'छोटी से छोटी श्वसनिकाओं में।') },
          { p: 'alveoli', at: [192, 284], s: T2('Into the air sacs, where oxygen enters the blood.', 'वायु कूपिकाओं में, जहाँ ऑक्सीजन रक्त में जाती है।') },
        ],
      },
    },
    playName: T2('Breathe', 'साँस लो'), playMs: 8000,
    anim: (k, st, svg) => {
      const b = 0.5 - 0.5 * Math.cos(k * Math.PI * 4);
      const lg = svg.querySelector('#by-lungs'), dg = svg.querySelector('#by-diaph');
      if (lg) lg.setAttribute('transform', `translate(240 300) scale(${(1 + 0.05 * b).toFixed(3)} ${(1 + 0.07 * b).toFixed(3)}) translate(-240 -300)`);
      if (dg) dg.setAttribute('transform', `translate(0 ${(9 * b).toFixed(1)}) translate(240 310) scale(1 ${(1 - 0.35 * b).toFixed(3)}) translate(-240 -310)`);
      st.breath = b;
    },
  };

  // CIRCULATORY ------------------------------------------------------
  const HEART_PTS = [[-20, -12], [-10, -20], [4, -20], [16, -14], [22, -2], [20, 12], [10, 24], [4, 30], [-4, 22], [-16, 10], [-22, -2]];
  const heartAt = (cx, cy, s) => smooth(HEART_PTS.map(([x, y]) => [cx + x * s, cy + y * s]));
  const ART = { aorta: 'M252 248L250 218C250 206 268 204 268 218C268 230 252 238 252 260L250 402', branches: 'M250 214C246 190 236 160 234 120C232 96 228 80 226 66M256 212C252 190 250 160 248 120C248 96 252 80 254 66M248 214C232 196 212 180 176 182C160 190 152 230 146 280C142 330 132 380 124 420L122 446M262 212C276 196 290 180 304 182C320 190 328 230 334 280C338 330 348 380 356 420L358 446M250 402C238 414 222 420 216 440C210 480 206 530 208 570C210 620 210 660 206 700M250 402C258 414 264 420 266 440C272 480 276 530 274 570C272 620 272 660 276 700' };
  const VEIN = { cava: 'M232 250L232 190M234 272L234 404', branches: 'M232 190C226 160 224 120 222 70M232 190C246 184 258 170 260 140C262 110 260 90 262 70M232 192C214 184 196 178 170 186C156 196 150 236 140 280C136 330 128 380 118 420L116 446M234 192C254 182 286 176 310 186C326 196 332 236 340 280C346 330 354 380 362 420L364 446M234 404C226 414 218 420 212 440C204 480 200 530 202 570C204 620 204 660 200 700M234 404C248 414 266 420 272 440C278 480 282 530 280 570C278 620 278 660 282 700' };
  const CAPS = [[119, 452], [361, 452], [203, 706], [279, 706]].map(([x, y]) => `<g transform="translate(${x} ${y})"><path d="M-6 -8C-10 -2 -4 2 -8 8M0 -8C-4 0 4 2 0 10M6 -8C2 -2 10 2 6 8M-8 0C-2 -3 2 3 8 0" fill="none" stroke="#9B5DE5" stroke-width="1.4"/><circle r="12" fill="transparent"/></g>`).join('');
  SCENES.circulatory = {
    name: T2('Circulatory system', 'परिसंचरण तंत्र'), about: T2('The heart pumps blood through arteries, capillaries and veins to every cell, and round again.', 'हृदय रक्त को धमनियों, केशिकाओं और शिराओं से हर कोशिका तक पंप करता है, और फिर वापस।'),
    vb: [60, 10, 360, 720], body: true, note: BODY_NOTE,
    layers: [{ id: 'arteries', n: T2('Arteries', 'धमनियाँ'), on: true }, { id: 'veins', n: T2('Veins', 'शिराएँ'), on: true }],
    bg: () => figure(),
    parts: [
      P('lungs', 'Lungs', 'फेफड़े', 'Blood passes through the lungs to drop carbon dioxide and pick up oxygen.', 'रक्त फेफड़ों से होकर गुज़रता है ताकि कार्बन डाइऑक्साइड छोड़े और ऑक्सीजन ले।', [196, 266], LUNGS(0.55)),
      P('veins', 'Veins', 'शिराएँ', 'Veins bring blood back to the heart. They have thin walls and valves that stop blood flowing backwards. Most carry blood low in oxygen (shown blue).', 'शिराएँ रक्त को वापस हृदय तक लाती हैं। इनकी दीवार पतली होती है और कपाट रक्त को उल्टा बहने से रोकते हैं। अधिकतर में ऑक्सीजन कम वाला रक्त होता है (नीला दिखाया)।', [356, 390], line(VEIN.branches, 3.2, '#2F62D0'), { l: 'veins' }),
      P('arteries', 'Arteries', 'धमनियाँ', 'Arteries carry blood away from the heart. Their thick, stretchy walls take the push of each heartbeat; you feel it as your pulse.', 'धमनियाँ रक्त को हृदय से दूर ले जाती हैं। इनकी मोटी, लचीली दीवारें हर धड़कन का दबाव सहती हैं; इसे हम नाड़ी के रूप में महसूस करते हैं।', [132, 390], line(ART.branches, 3.2, '#E0313F'), { l: 'arteries' }),
      P('capillaries', 'Capillaries', 'केशिकाएँ', 'The thinnest blood vessels, one cell thick. Here food and oxygen pass into the cells and wastes pass out.', 'सबसे पतली रक्त वाहिकाएँ, एक कोशिका मोटी। यहाँ भोजन और ऑक्सीजन कोशिकाओं में जाते हैं और अपशिष्ट बाहर आते हैं।', [119, 452], CAPS),
      P('aorta', 'Aorta', 'महाधमनी', 'The largest artery. It carries oxygen-rich blood from the left side of the heart to the whole body.', 'सबसे बड़ी धमनी। यह ऑक्सीजन युक्त रक्त को हृदय के बाएँ भाग से पूरे शरीर तक ले जाती है।', [266, 220], tube(ART.aorta, 5.5, '#E0313F', '#9B1C28'), { l: 'arteries' }),
      P('venacava', 'Vena cava', 'महाशिरा', 'The two largest veins bring blood low in oxygen from the body back into the right side of the heart.', 'दो सबसे बड़ी शिराएँ शरीर से ऑक्सीजन रहित रक्त को हृदय के दाएँ भाग में वापस लाती हैं।', [232, 220], tube(VEIN.cava, 5.5, '#2F62D0', '#1B3C8A'), { l: 'veins' }),
      P('pulmart', 'Pulmonary artery', 'फुफ्फुस धमनी', 'It takes blood low in oxygen from the right side of the heart to the lungs. It is the only artery that carries such blood.', 'यह ऑक्सीजन रहित रक्त को हृदय के दाएँ भाग से फेफड़ों तक ले जाती है। ऐसा रक्त ले जाने वाली यह अकेली धमनी है।', [222, 233], tube('M246 244C246 236 242 232 236 232L212 236M246 238C252 230 262 232 272 236', 4, '#2F62D0', '#1B3C8A'), { l: 'arteries' }),
      P('pulmvein', 'Pulmonary veins', 'फुफ्फुस शिराएँ', 'They bring oxygen-rich blood from the lungs back to the left side of the heart.', 'ये फेफड़ों से ऑक्सीजन युक्त रक्त को हृदय के बाएँ भाग में वापस लाती हैं।', [268, 254], tube('M212 254C226 252 240 254 256 258M272 254C266 254 262 256 258 258', 3.6, '#E0313F', '#9B1C28'), { l: 'veins' }),
      P('heartR', 'Heart: right side', 'हृदय: दायाँ भाग', 'It receives blood low in oxygen from the body and pumps it to the lungs.', 'यह शरीर से ऑक्सीजन रहित रक्त लेता है और उसे फेफड़ों में पंप करता है।', [238, 262], `<g id="by-heartR"><path d="${heartAt(250, 262, 1)}" fill="#6D7FE0" stroke="#3B3F9A" stroke-width="1.5" clip-path="url(#by-hcR)"/></g>`),
      P('heartL', 'Heart: left side', 'हृदय: बायाँ भाग', 'It receives oxygen-rich blood from the lungs and pumps it hard to the whole body. Its wall is the thickest.', 'यह फेफड़ों से ऑक्सीजन युक्त रक्त लेता है और उसे ज़ोर से पूरे शरीर में पंप करता है। इसकी दीवार सबसे मोटी होती है।', [260, 272], `<g id="by-heartL"><path d="${heartAt(250, 262, 1)}" fill="#E0484F" stroke="#9B1C28" stroke-width="1.5" clip-path="url(#by-hcL)"/></g>`),
    ],
    defs: '<clipPath id="by-hcR"><path d="M200 200L249 200L255 300L200 300Z"/></clipPath><clipPath id="by-hcL"><path d="M249 200L300 200L300 300L255 300Z"/></clipPath>',
    flows: {
      blood: {
        col: '#2F62D0', name: T2('blood', 'रक्त'), start: T2('Blood has given its oxygen to the cells of the hand. Tap where it is now.', 'रक्त ने हाथ की कोशिकाओं को अपनी ऑक्सीजन दे दी है। अभी वह जहाँ है, उस पर टैप करो।'),
        done: T2('That is one full round: body, heart, lungs, heart, body. Blood passes through the heart twice in each round (double circulation).', 'यह एक पूरा चक्कर है: शरीर, हृदय, फेफड़े, हृदय, शरीर। हर चक्कर में रक्त हृदय से दो बार गुज़रता है (दोहरा परिसंचरण)।'),
        steps: [
          { p: 'capillaries', at: [119, 452], c: '#7C3AED', s: T2('In the capillaries the blood gave oxygen and food to the cells.', 'केशिकाओं में रक्त ने कोशिकाओं को ऑक्सीजन और भोजन दिया।') },
          { p: 'veins', at: [176, 186], via: [[118, 420], [128, 380], [140, 280], [156, 210]], c: '#2F62D0', s: T2('Veins carry it back towards the heart.', 'शिराएँ उसे वापस हृदय की ओर ले जाती हैं।') },
          { p: 'venacava', at: [232, 230], via: [[214, 184], [232, 192]], c: '#2F62D0', s: T2('The vena cava pours it into the heart.', 'महाशिरा उसे हृदय में डालती है।') },
          { p: 'heartR', at: [240, 262], c: '#2F62D0', s: T2('The right side of the heart pumps it to the lungs.', 'हृदय का दायाँ भाग उसे फेफड़ों में पंप करता है।') },
          { p: 'pulmart', at: [214, 236], via: [[246, 242], [238, 232]], c: '#2F62D0', s: T2('Along the pulmonary artery.', 'फुफ्फुस धमनी से होकर।') },
          { p: 'lungs', at: [200, 262], c: '#E0313F', s: T2('In the lungs it gives up carbon dioxide and takes oxygen. It turns bright red.', 'फेफड़ों में वह कार्बन डाइऑक्साइड छोड़ता और ऑक्सीजन लेता है। वह चमकीला लाल हो जाता है।') },
          { p: 'pulmvein', at: [236, 254], via: [[214, 254]], c: '#E0313F', s: T2('The pulmonary veins bring it back to the heart.', 'फुफ्फुस शिराएँ उसे वापस हृदय में लाती हैं।') },
          { p: 'heartL', at: [260, 268], c: '#E0313F', s: T2('The strong left side pumps it out to the body.', 'मज़बूत बायाँ भाग उसे शरीर में पंप करता है।') },
          { p: 'aorta', at: [258, 210], via: [[252, 246], [250, 220]], c: '#E0313F', s: T2('Up the aorta, the biggest artery.', 'महाधमनी से ऊपर, सबसे बड़ी धमनी।') },
          { p: 'arteries', at: [124, 420], via: [[248, 214], [212, 180], [176, 182], [156, 214], [146, 280], [136, 340]], c: '#E0313F', s: T2('Arteries carry it to the hand, and the round starts again.', 'धमनियाँ उसे हाथ तक ले जाती हैं, और चक्कर फिर शुरू होता है।') },
        ],
      },
    },
    playName: T2('Heartbeat', 'धड़कन'), playMs: 6000,
    anim: (k, st, svg) => {
      const ph = (k * 6000 / 820) % 1, s = 1 + 0.07 * Math.max(0, Math.sin(ph * Math.PI * 2));
      ['#by-heartR', '#by-heartL'].forEach((q) => { const g = svg.querySelector(q); if (g) g.setAttribute('transform', `translate(250 262) scale(${s.toFixed(3)}) translate(-250 -262)`); });
    },
  };

  // HEART (section) --------------------------------------------------
  const HM = [[112, 150], [134, 124], [170, 118], [210, 126], [250, 118], [296, 124], [318, 150], [326, 196], [318, 250], [296, 300], [262, 346], [240, 372], [212, 352], [170, 316], [132, 272], [112, 222], [106, 184]];
  const CAV = {
    ra: [[122, 158], [146, 138], [180, 138], [198, 152], [200, 190], [192, 214], [160, 220], [130, 206], [120, 182]],
    rv: [[150, 236], [200, 232], [214, 240], [222, 290], [232, 338], [214, 332], [176, 300], [152, 268]],
    la: [[222, 146], [252, 134], [290, 138], [306, 156], [304, 190], [288, 206], [244, 208], [224, 190]],
    lv: [[238, 228], [288, 226], [296, 250], [288, 292], [262, 330], [248, 342], [240, 300], [234, 262]],
  };
  const flap = (x, y, dir) => `<path d="M${x - 14} ${y}L${x - 4} ${y + 14 * dir}L${x - 2} ${y}Z" fill="#FFF7ED" stroke="#B45309" stroke-width="1.2"/><path d="M${x + 14} ${y}L${x + 4} ${y + 14 * dir}L${x + 2} ${y}Z" fill="#FFF7ED" stroke="#B45309" stroke-width="1.2"/><path d="M${x - 4} ${y + 14 * dir}L${x - 8} ${y + 34 * dir}M${x + 4} ${y + 14 * dir}L${x + 8} ${y + 34 * dir}" stroke="#FFF7ED" stroke-width="1"/><circle cx="${x}" cy="${y + 6 * dir}" r="16" fill="transparent"/>`;
  SCENES.heart = {
    name: T2('Heart', 'हृदय'), about: T2('A fist-sized muscle with four chambers that beats about 72 times a minute at rest, all our life.', 'मुट्ठी के आकार की चार कक्षों वाली पेशी जो आराम के समय लगभग 72 बार प्रति मिनट धड़कती है, जीवन भर।'),
    vb: [0, 0, 420, 420], note: T2('A cut through the heart, seen from the front: its right side is on your left. Blue: blood low in oxygen; red: oxygen-rich.', 'हृदय की काट, सामने से: इसका दायाँ भाग तुम्हारे बाएँ ओर है। नीला: ऑक्सीजन रहित रक्त; लाल: ऑक्सीजन युक्त।'),
    layers: [{ id: 'valves', n: T2('Valves', 'कपाट'), on: true }, { id: 'arrows', n: T2('Arrows', 'तीर'), on: false }],
    caps: [[80, 98, T2('to right lung', 'दाएँ फेफड़े को')], [374, 92, T2('to left lung', 'बाएँ फेफड़े को')], [370, 222, T2('from lungs', 'फेफड़ों से')], [334, 18, T2('to body', 'शरीर को')], [100, 18, T2('from body', 'शरीर से')], [100, 404, T2('from body', 'शरीर से')]],
    parts: [
      P('ivc', 'Inferior vena cava', 'निम्न महाशिरा', 'The big vein that brings blood from the lower body into the right atrium.', 'वह बड़ी शिरा जो निचले शरीर से रक्त को दाएँ अलिंद में लाती है।', [108, 360], '<path d="M110 196L142 206L138 386L106 386Z" fill="#3B6FD8" stroke="#1B3C8A" stroke-width="1.6"/>'),
      P('pulmart', 'Pulmonary artery', 'फुफ्फुस धमनी', 'It carries blood low in oxygen from the right ventricle to both lungs.', 'यह ऑक्सीजन रहित रक्त को दाएँ निलय से दोनों फेफड़ों तक ले जाती है।', [120, 122], tube('M202 118L92 112', 18, '#3B6FD8', '#1B3C8A') + tube('M210 114C250 104 300 100 346 106', 18, '#3B6FD8', '#1B3C8A')),
      P('aorta', 'Aorta', 'महाधमनी', 'The biggest artery. It carries oxygen-rich blood from the left ventricle to the whole body.', 'सबसे बड़ी धमनी। यह ऑक्सीजन युक्त रक्त को बाएँ निलय से पूरे शरीर तक ले जाती है।', [300, 54], tube('M250 230C248 160 240 110 232 80C222 46 274 30 300 50C318 64 322 96 318 130', 28, '#E2323F', '#9B1C28') + tube('M238 54L232 18M258 44L258 8M280 44L290 10', 10, '#E2323F', '#9B1C28')),
    ],
  };
  // Order matters (back to front): IVC, pulmonary artery branches, aorta, muscle, chambers, valves, septum, trunk, SVC, pulmonary veins.
  SCENES.heart.parts.push(
    P('wall', 'Heart muscle', 'हृदय की पेशी', 'The wall of the heart is a special muscle that contracts and relaxes all life long without getting tired.', 'हृदय की दीवार एक विशेष पेशी है जो जीवन भर बिना थके सिकुड़ती और फैलती रहती है।', [318, 262], `<path d="${smooth(HM)}" fill="#C93545" stroke="#7F1D2B" stroke-width="2"/><path d="${smooth(HM)}" fill="url(#by-sheen)" pointer-events="none"/>`),
    P('septum', 'Septum', 'पट (सेप्टम)', 'The thick wall of muscle between the left and right sides. It keeps oxygen-rich and oxygen-poor blood apart.', 'बाएँ और दाएँ भाग के बीच की मोटी पेशी की दीवार। यह ऑक्सीजन युक्त और ऑक्सीजन रहित रक्त को अलग रखती है।', [226, 316], line('M213 140C216 180 218 214 224 250C228 290 232 320 238 348', 11, '#A3283A')),
    P('ra', 'Right atrium', 'दायाँ अलिंद', 'The upper right chamber. It collects blood low in oxygen coming from the body.', 'ऊपर का दायाँ कक्ष। यह शरीर से आने वाला ऑक्सीजन रहित रक्त इकट्ठा करता है।', [140, 176], `<g class="by-ch" id="by-ra">${blob(CAV.ra, '#4F7BE0', '#1B3C8A')}</g>`),
    P('rv', 'Right ventricle', 'दायाँ निलय', 'The lower right chamber. It pumps blood to the lungs, which are close by, so its wall is thinner.', 'नीचे का दायाँ कक्ष। यह रक्त को पास के फेफड़ों तक पंप करता है, इसलिए इसकी दीवार पतली है।', [170, 286], `<g class="by-ch" id="by-rv">${blob(CAV.rv, '#4F7BE0', '#1B3C8A')}</g>`),
    P('la', 'Left atrium', 'बायाँ अलिंद', 'The upper left chamber. It collects oxygen-rich blood coming from the lungs.', 'ऊपर का बायाँ कक्ष। यह फेफड़ों से आने वाला ऑक्सीजन युक्त रक्त इकट्ठा करता है।', [280, 170], `<g class="by-ch" id="by-la">${blob(CAV.la, '#E2474F', '#9B1C28')}</g>`),
    P('lv', 'Left ventricle', 'बायाँ निलय', 'The lower left chamber, with the thickest wall. It pumps blood all round the body.', 'नीचे का बायाँ कक्ष, सबसे मोटी दीवार वाला। यह रक्त को पूरे शरीर में पंप करता है।', [272, 286], `<g class="by-ch" id="by-lv">${blob(CAV.lv, '#E2474F', '#9B1C28')}</g>`),
    P('tricuspid', 'Tricuspid valve', 'त्रिवलनी कपाट', 'Three flaps between the right atrium and right ventricle. They open to let blood down and shut so it cannot flow back.', 'दाएँ अलिंद और दाएँ निलय के बीच तीन पल्ले। ये रक्त को नीचे जाने देने के लिए खुलते हैं और उसे वापस जाने से रोकने के लिए बंद होते हैं।', [160, 226], flap(176, 222, 1), { l: 'valves' }),
    P('mitral', 'Bicuspid (mitral) valve', 'द्विवलनी (मिट्रल) कपाट', 'Two flaps between the left atrium and left ventricle that stop blood flowing backwards.', 'बाएँ अलिंद और बाएँ निलय के बीच दो पल्ले जो रक्त को उल्टा बहने से रोकते हैं।', [264, 214], flap(264, 214, 1), { l: 'valves' }),
    P('semilunar', 'Semilunar valves', 'अर्धचंद्र कपाट', 'Half-moon pockets where the pulmonary artery and the aorta leave the heart. They stop blood falling back into the ventricles.', 'आधे चाँद जैसी जेबें जहाँ फुफ्फुस धमनी और महाधमनी हृदय से निकलती हैं। ये रक्त को वापस निलयों में गिरने से रोकती हैं।', [250, 224], '<path d="M190 222Q200 232 210 222M240 222Q250 232 260 222" fill="none" stroke="#FFF7ED" stroke-width="3"/><path d="M190 222Q200 232 210 222M240 222Q250 232 260 222" class="by-hit" stroke-width="16"/>', { l: 'valves' }),
    P('pulmart', 'Pulmonary artery', 'फुफ्फुस धमनी', 'It carries blood low in oxygen from the right ventricle to both lungs.', 'यह ऑक्सीजन रहित रक्त को दाएँ निलय से दोनों फेफड़ों तक ले जाती है।', [120, 122], tube('M200 236C200 190 196 150 204 116', 24, '#3B6FD8', '#1B3C8A')),
    P('svc', 'Superior vena cava', 'ऊर्ध्व महाशिरा', 'The big vein that brings blood from the head and arms into the right atrium.', 'वह बड़ी शिरा जो सिर और बाँहों से रक्त को दाएँ अलिंद में लाती है।', [126, 60], '<path d="M128 26L160 26L162 150L130 154Z" fill="#3B6FD8" stroke="#1B3C8A" stroke-width="1.6"/><path d="M134 30L136 148" stroke="#fff" stroke-opacity=".3" stroke-width="4"/>'),
    P('pulmvein', 'Pulmonary veins', 'फुफ्फुस शिराएँ', 'They bring oxygen-rich blood from the lungs into the left atrium. They are the only veins that carry such blood.', 'ये फेफड़ों से ऑक्सीजन युक्त रक्त को बाएँ अलिंद में लाती हैं। ऐसा रक्त ले जाने वाली ये अकेली शिराएँ हैं।', [370, 186], tube('M392 150L300 160', 13, '#E2323F', '#9B1C28') + tube('M392 190L300 186', 13, '#E2323F', '#9B1C28')),
  );
  SCENES.heart.fg = (st) => (st.layers.has('arrows') ? '<g pointer-events="none" stroke="#0F172A" stroke-width="2.4" fill="none" marker-end="url(#by-arr)"><path d="M145 40V100"/><path d="M124 360V300"/><path d="M168 200V250"/><path d="M196 286C198 250 198 200 200 150"/><path d="M180 112H110"/><path d="M226 110H330"/><path d="M386 170H322"/><path d="M262 184V250"/><path d="M262 300C254 250 250 190 244 120"/><path d="M286 42C300 48 314 70 318 110"/></g>' : '');
  SCENES.heart.flows = {
    blood: {
      col: '#3B6FD8', name: T2('blood', 'रक्त'), start: T2('Where does blood from the body enter the heart? Tap it.', 'शरीर से रक्त हृदय में कहाँ से आता है? उस पर टैप करो।'),
      done: T2('Right side to the lungs, left side to the body: the two sides pump at the same moment, about 72 times a minute.', 'दायाँ भाग फेफड़ों को, बायाँ भाग शरीर को: दोनों भाग एक ही पल में पंप करते हैं, लगभग 72 बार प्रति मिनट।'),
      steps: [
        { p: 'svc', alt: ['ivc'], name: T2('Vena cava', 'महाशिरा'), at: [145, 60], c: '#3B6FD8', s: T2('Blood low in oxygen arrives from the body in the vena cava.', 'ऑक्सीजन रहित रक्त शरीर से महाशिरा द्वारा आता है।') },
        { p: 'ra', at: [160, 180], via: [[146, 120]], c: '#3B6FD8', s: T2('It fills the right atrium.', 'वह दाएँ अलिंद को भरता है।') },
        { p: 'tricuspid', at: [176, 228], c: '#3B6FD8', s: T2('The atrium squeezes; the tricuspid valve opens.', 'अलिंद सिकुड़ता है; त्रिवलनी कपाट खुलता है।') },
        { p: 'rv', at: [192, 284], c: '#3B6FD8', s: T2('Blood fills the right ventricle.', 'रक्त दाएँ निलय को भरता है।') },
        { p: 'pulmart', at: [96, 112], via: [[200, 240], [200, 170], [204, 118]], c: '#3B6FD8', s: T2('The ventricle pumps it up the pulmonary artery to the lungs.', 'निलय उसे फुफ्फुस धमनी से फेफड़ों में पंप करता है।') },
        { p: 'pulmvein', at: [330, 160], jump: true, c: '#E2323F', s: T2('In the lungs it takes oxygen and returns in the pulmonary veins.', 'फेफड़ों में वह ऑक्सीजन लेता है और फुफ्फुस शिराओं से लौटता है।') },
        { p: 'la', at: [270, 172], c: '#E2323F', s: T2('It fills the left atrium.', 'वह बाएँ अलिंद को भरता है।') },
        { p: 'mitral', at: [264, 220], c: '#E2323F', s: T2('The bicuspid valve opens.', 'द्विवलनी कपाट खुलता है।') },
        { p: 'lv', at: [266, 284], c: '#E2323F', s: T2('Blood fills the strong left ventricle.', 'रक्त मज़बूत बाएँ निलय को भरता है।') },
        { p: 'aorta', at: [306, 60], via: [[250, 230], [246, 150], [236, 90], [250, 48]], c: '#E2323F', s: T2('It is pumped into the aorta and out to the body.', 'वह महाधमनी में और फिर शरीर में पंप होता है।') },
      ],
    },
  };
  SCENES.heart.playName = T2('Heartbeat', 'धड़कन');
  SCENES.heart.playMs = 6500;
  SCENES.heart.anim = (k, st, svg) => {
    const ph = (k * 6500 / 860) % 1;
    const a = 1 - 0.07 * Math.max(0, Math.sin(ph * Math.PI * 2 / 0.35)) * (ph < 0.35 ? 1 : 0);
    const v = 1 - 0.09 * (ph > 0.3 && ph < 0.75 ? Math.sin((ph - 0.3) / 0.45 * Math.PI) : 0);
    const sc = (id, s, cx, cy) => { const g = svg.querySelector(id); if (g) g.setAttribute('transform', `translate(${cx} ${cy}) scale(${s.toFixed(3)}) translate(${-cx} ${-cy})`); };
    sc('#by-ra', a, 160, 178); sc('#by-la', a, 264, 172); sc('#by-rv', v, 190, 280); sc('#by-lv', v, 266, 282);
  };

  // EXCRETORY --------------------------------------------------------
  const BEAN = [[-18, -6], [-14, -24], [0, -32], [12, -24], [14, -10], [8, 0], [14, 10], [12, 24], [0, 32], [-14, 24]];
  SCENES.excretory = {
    name: T2('Excretory system', 'उत्सर्जन तंत्र'), about: T2('Two kidneys clean the blood of wastes like urea and make urine.', 'दो वृक्क रक्त से यूरिया जैसे अपशिष्ट साफ़ करते हैं और मूत्र बनाते हैं।'),
    vb: [110, 262, 260, 222], body: true, note: BODY_NOTE,
    layers: [{ id: 'organs', n: T2('Organs', 'अंग'), on: true }, { id: 'vessels', n: T2('Blood vessels', 'रक्त वाहिकाएँ'), on: true }, { id: 'nephron', n: T2('Zoom: nephron', 'ज़ूम: नेफ्रॉन'), on: false }],
    bg: (st) => figure() + (st.layers.has('vessels') ? '<path d="M248 270V408" stroke="#E0313F" stroke-width="7" stroke-linecap="round" opacity=".55"/><path d="M232 270V408" stroke="#2F62D0" stroke-width="7" stroke-linecap="round" opacity=".55"/>' : ''),
    parts: [
      P('renalvein', 'Renal vein', 'वृक्क शिरा', 'It carries the cleaned blood from the kidney back towards the heart.', 'यह साफ़ हुए रक्त को वृक्क से वापस हृदय की ओर ले जाती है।', [176, 372], tube('M214 354C222 356 228 356 232 356M266 348C254 350 240 352 232 352', 3.6, '#2F62D0', '#1B3C8A'), { l: 'vessels' }),
      P('renalartery', 'Renal artery', 'वृक्क धमनी', 'It brings blood carrying wastes such as urea into the kidney.', 'यह यूरिया जैसे अपशिष्ट वाले रक्त को वृक्क में लाती है।', [176, 320], tube('M248 344C236 342 224 342 214 344M248 336C256 334 262 334 266 336', 3.6, '#E0313F', '#9B1C28'), { l: 'vessels' }),
      P('kidney', 'Kidneys', 'वृक्क (गुर्दे)', 'Two bean-shaped organs at the back of the belly. Each has about a million tiny filters called nephrons. The right kidney sits a little lower than the left.', 'पेट के पीछे सेम के आकार के दो अंग। हर एक में लगभग दस लाख छोटे छन्ने होते हैं जिन्हें नेफ्रॉन कहते हैं। दायाँ वृक्क बाएँ से थोड़ा नीचे होता है।', [304, 336], blob(BEAN.map(([x, y]) => [204 - x, 348 + y]), '#B04545', '#6E2020') + blob(BEAN.map(([x, y]) => [276 + x, 340 + y]), '#B04545', '#6E2020'), { l: 'organs' }),
      P('ureter', 'Ureters', 'मूत्रवाहिनियाँ', 'Two thin tubes, one from each kidney, that carry urine down to the bladder.', 'दो पतली नलियाँ, हर वृक्क से एक, जो मूत्र को नीचे मूत्राशय तक ले जाती हैं।', [292, 392], tube('M212 356C214 380 222 404 230 424', 3.2, '#F2C14E', '#A77C12') + tube('M268 350C266 378 258 404 250 424', 3.2, '#F2C14E', '#A77C12'), { l: 'organs' }),
      P('bladder', 'Urinary bladder', 'मूत्राशय', 'A stretchy muscular bag that stores urine until we choose to pass it.', 'एक लचीली पेशीय थैली जो मूत्र को तब तक जमा रखती है जब तक हम उसे बाहर न निकालें।', [282, 440], blob([[220, 424], [240, 416], [260, 424], [264, 440], [252, 452], [228, 452], [216, 440]], '#F6CD5B', '#A77C12'), { l: 'organs' }),
      P('urethra', 'Urethra', 'मूत्रमार्ग', 'The tube through which urine leaves the body.', 'वह नली जिससे मूत्र शरीर से बाहर निकलता है।', [214, 468], tube('M240 452L240 472', 4, '#F2C14E', '#A77C12'), { l: 'organs' }),
    ],
    zoom: {
      layer: 'nephron', title: T2('Zoom: one nephron, a tiny filter', 'ज़ूम: एक नेफ्रॉन, एक छोटा छन्ना'), vb: [0, 0, 320, 200],
      caps: [[314, 196, T2('urine to the ureter ↓', 'मूत्र मूत्रवाहिनी को ↓'), 'end'], [80, 12, T2('blood in', 'रक्त अंदर'), 'start']],
      parts: [
        P('glomerulus', 'Glomerulus', 'केशिकागुच्छ (ग्लोमेरुलस)', 'A knot of blood capillaries. Blood is pressed through its walls, and water, salts, sugar and urea are filtered out.', 'रक्त केशिकाओं की एक गाँठ। रक्त इसकी दीवारों से दबकर छनता है, और पानी, लवण, शर्करा व यूरिया अलग हो जाते हैं।', [58, 86], line('M40 0C40 30 46 40 50 50M70 0C70 30 66 40 62 52', 3, '#DC2626') + '<path d="M46 56C38 62 44 74 52 70C60 78 70 70 64 62C74 58 66 46 58 52C54 44 44 48 46 56Z" fill="#EF4444" stroke="#991B1B" stroke-width="1.4"/>'),
        P('bowman', 'Bowman\'s capsule', 'बोमन संपुट', 'A cup that wraps the glomerulus and collects the filtered liquid.', 'एक प्याला जो केशिकागुच्छ को लपेटता है और छना हुआ द्रव इकट्ठा करता है।', [30, 110], '<path d="M34 50C22 64 24 86 40 94C56 102 76 96 84 82" fill="none" stroke="#F5B90A" stroke-width="7" stroke-linecap="round"/>' + hit('M34 50C22 64 24 86 40 94C56 102 76 96 84 82', 16)),
        P('tubule', 'Tubule', 'नलिका', 'A long, looped tube. As the liquid flows along, useful sugar, salts and most of the water are taken back into the blood.', 'एक लंबी, घुमावदार नली। द्रव के आगे बहते समय उपयोगी शर्करा, लवण और ज़्यादातर पानी वापस रक्त में ले लिए जाते हैं।', [150, 150], tube('M84 82C100 70 96 50 114 46C132 42 136 66 148 70L150 170C152 180 168 180 170 170L172 80C176 60 196 54 206 66C216 78 230 70 240 60', 6, '#FCD34D', '#A77C12')),
        P('collectingduct', 'Collecting duct', 'संग्राहक वाहिनी', 'Many tubules empty into it. What is left is urine: water, urea and extra salts.', 'कई नलिकाएँ इसमें खाली होती हैं। जो बचता है वह मूत्र है: पानी, यूरिया और अतिरिक्त लवण।', [270, 120], tube('M246 20L248 186', 9, '#F2C14E', '#A77C12')),
      ],
    },
    flows: {
      urine: {
        col: '#E0A100', name: T2('urine', 'मूत्र'), start: T2('Blood carrying waste comes to the kidney first. Tap the vessel that brings it.', 'अपशिष्ट वाला रक्त पहले वृक्क तक आता है। जो वाहिका उसे लाती है उस पर टैप करो।'),
        done: T2('The kidneys filter about 180 litres of blood liquid a day but make only about 1.5 litres of urine: most water goes back into the blood.', 'वृक्क दिन में लगभग 180 लीटर रक्त-द्रव छानते हैं पर केवल लगभग 1.5 लीटर मूत्र बनाते हैं: ज़्यादातर पानी वापस रक्त में जाता है।'),
        steps: [
          { p: 'renalartery', at: [230, 343], via: [], c: '#E0313F', s: T2('The renal artery brings blood with urea into the kidney.', 'वृक्क धमनी यूरिया वाला रक्त वृक्क में लाती है।') },
          { p: 'kidney', at: [202, 348], c: '#E0A100', s: T2('Nephrons filter the blood; wastes and extra water become urine.', 'नेफ्रॉन रक्त छानते हैं; अपशिष्ट और अतिरिक्त पानी मूत्र बनते हैं।') },
          { p: 'ureter', at: [222, 410], via: [[212, 360], [216, 386]], c: '#E0A100', s: T2('Urine trickles down the ureter.', 'मूत्र मूत्रवाहिनी से नीचे बहता है।') },
          { p: 'bladder', at: [240, 436], c: '#E0A100', s: T2('It is stored in the bladder.', 'वह मूत्राशय में जमा होता है।') },
          { p: 'urethra', at: [240, 470], c: '#E0A100', s: T2('It leaves the body through the urethra.', 'वह मूत्रमार्ग से शरीर के बाहर निकलता है।') },
        ],
      },
    },
  };

  // NERVOUS ----------------------------------------------------------
  const BRAIN_IN_HEAD = [[206, 62], [212, 38], [232, 24], [256, 26], [272, 40], [276, 64], [266, 80], [240, 86], [214, 80]];
  const GYRI = 'M214 54C222 46 226 58 234 50S246 60 252 50 266 58 270 52M212 66C220 60 228 70 236 62S250 72 258 64 268 70 272 64M220 40C228 34 236 44 244 36S256 42 262 36';
  SCENES.nervous = {
    name: T2('Nervous system', 'तंत्रिका तंत्र'), about: T2('The brain, the spinal cord and the nerves carry messages through the body in a fraction of a second.', 'मस्तिष्क, मेरुरज्जु और तंत्रिकाएँ पल भर में पूरे शरीर में संदेश पहुँचाते हैं।'),
    vb: [60, 10, 360, 720], body: true, note: BODY_NOTE,
    layers: [{ id: 'cns', n: T2('Brain and spinal cord', 'मस्तिष्क और मेरुरज्जु'), on: true }, { id: 'nerves', n: T2('Nerves', 'तंत्रिकाएँ'), on: true }, { id: 'neuron', n: T2('Zoom: a neuron', 'ज़ूम: एक न्यूरॉन'), on: false }],
    bg: () => figure() + '<g pointer-events="none"><rect x="110" y="500" width="13" height="30" rx="3" fill="#FDE68A" stroke="#B45309"/><path d="M116.5 500V494" stroke="#1E293B" stroke-width="1.5"/><path d="M116.5 478C122 486 122 492 116.5 495C111 492 111 486 116.5 478Z" fill="#FF7A1A"/><path d="M116.5 484C119 488 119 491 116.5 493C114 491 114 488 116.5 484Z" fill="#FFD23F"/></g>',
    parts: [
      P('nerves', 'Nerves', 'तंत्रिकाएँ', 'Bundles of nerve cells that run from the brain and spinal cord to every part of the body, like wires.', 'तंत्रिका कोशिकाओं के गुच्छे जो मस्तिष्क और मेरुरज्जु से शरीर के हर भाग तक तारों की तरह जाते हैं।', [338, 380], (st) => hit('M240 168C196 176 160 196 146 280C136 360 128 420 124 448M240 168C284 176 320 196 334 280C344 360 352 420 356 448M240 340C226 410 206 520 204 698M240 340C254 410 274 520 276 698', 14), { l: 'nerves' }),
      P('spinalcord', 'Spinal cord', 'मेरुरज्जु', 'A thick cord of nerves inside the backbone. It carries messages between the brain and the body and handles quick reflexes by itself.', 'मेरुदंड के अंदर तंत्रिकाओं की मोटी डोरी। यह मस्तिष्क और शरीर के बीच संदेश ले जाती है और तुरंत होने वाली प्रतिवर्ती क्रियाएँ स्वयं संभालती है।', [222, 300], tube('M240 86L240 330', 6, '#F6D5A8', '#B9895A') + '<path d="M240 330L232 380M240 330L240 384M240 330L248 380" stroke="#E8A317" stroke-width="1.6" fill="none"/>', { l: 'cns' }),
      P('brain', 'Brain', 'मस्तिष्क', 'The control centre in the skull. It thinks, remembers and feels, and controls the whole body.', 'खोपड़ी में नियंत्रण केंद्र। यह सोचता है, याद रखता है, महसूस करता है और पूरे शरीर को नियंत्रित करता है।', [272, 46], blob(BRAIN_IN_HEAD, '#F4A7B9', '#B4566E') + `<path d="${GYRI}" fill="none" stroke="#C86A82" stroke-width="1.4" pointer-events="none"/>`, { l: 'cns' }),
      P('receptor', 'Receptor', 'ग्राही', 'Nerve endings in the skin that sense touch, heat and pain. Here they feel the hot flame.', 'त्वचा में तंत्रिका के सिरे जो स्पर्श, गर्मी और दर्द महसूस करते हैं। यहाँ वे गर्म लौ को महसूस करते हैं।', [114, 470], '<circle cx="124" cy="474" r="5" fill="#02CFF9" stroke="#0E7490" stroke-width="1.5"/><path d="M124 464v-4M132 468l3-3M116 468l-3-3M134 476h4M114 476h-4" stroke="#0E7490" stroke-width="1.6" stroke-linecap="round"/><circle cx="124" cy="474" r="13" fill="transparent"/>'),
      P('sensory', 'Sensory nerve', 'संवेदी तंत्रिका', 'It carries the message from the receptor to the spinal cord.', 'यह ग्राही से संदेश मेरुरज्जु तक ले जाती है।', [132, 330], line('M124 474C126 450 130 420 134 390C140 340 148 290 156 246C164 206 190 188 238 200', 3, '#06B6D4')),
      P('motor', 'Motor nerve', 'प्रेरक तंत्रिका', 'It carries the order from the spinal cord to a muscle.', 'यह मेरुरज्जु से आदेश को पेशी तक ले जाती है।', [196, 196], line('M240 206C210 198 186 200 172 214C164 226 160 240 158 252', 3, '#F97316')),
      P('effector', 'Muscle (effector)', 'पेशी (कार्यकर)', 'The muscle that does the work: it contracts and pulls the hand away from the flame.', 'वह पेशी जो काम करती है: यह सिकुड़कर हाथ को लौ से दूर खींचती है।', [150, 290], blob([[162, 236], [152, 246], [148, 270], [150, 292], [156, 296], [162, 276], [166, 250]], 'url(#by-musc)', '#9F1D2B')),
    ],
    zoom: {
      layer: 'neuron', title: T2('Zoom: a nerve cell (neuron)', 'ज़ूम: एक तंत्रिका कोशिका (न्यूरॉन)'), vb: [0, 0, 320, 160],
      caps: [[160, 150, T2('the message travels this way →', 'संदेश इस ओर चलता है →')]],
      parts: [
        P('dendrite', 'Dendrites', 'द्रुमिकाएँ', 'Short branches that pick up messages from other cells.', 'छोटी शाखाएँ जो दूसरी कोशिकाओं से संदेश लेती हैं।', [24, 40], line('M60 80L30 50L14 46M30 50L26 30M60 80L24 90L8 84M24 90L16 106M60 80L36 122L30 140M36 122L18 124M60 80L48 36L54 18', 2.6, '#8B3DFF')),
        P('cellbody', 'Cell body', 'कोशिका काय', 'The main part of the cell with the nucleus. It joins the messages together.', 'केंद्रक वाला कोशिका का मुख्य भाग। यह संदेशों को जोड़ता है।', [60, 112], '<path d="M44 70C50 58 72 58 78 70C86 80 80 98 66 100C50 102 38 86 44 70Z" fill="#C4A5FF" stroke="#6D28D9" stroke-width="1.6"/><circle cx="61" cy="80" r="7" fill="#6D28D9"/>'),
        P('axon', 'Axon', 'तंत्रिकाक्ष (एक्सॉन)', 'A long, thin fibre that carries the message away from the cell body, sometimes for up to a metre.', 'एक लंबा, पतला तंतु जो संदेश को कोशिका काय से दूर ले जाता है, कभी-कभी एक मीटर तक।', [160, 60], line('M78 80L250 80', 3, '#6D28D9') + [0, 1, 2, 3, 4].map((k) => `<rect x="${92 + k * 31}" y="72" width="25" height="16" rx="8" fill="#FDE68A" stroke="#B45309" stroke-width="1.2"/>`).join('')),
        P('ending', 'Nerve endings', 'तंत्रिका सिरे', 'At the far end the message is passed on, across a tiny gap, to the next cell or to a muscle.', 'दूर वाले सिरे पर संदेश एक छोटे से अंतर के पार अगली कोशिका या पेशी को दे दिया जाता है।', [292, 40], line('M250 80L280 58M250 80L288 82M250 80L278 104', 2.6, '#6D28D9') + '<circle cx="282" cy="56" r="5" fill="#8B3DFF"/><circle cx="291" cy="82" r="5" fill="#8B3DFF"/><circle cx="281" cy="106" r="5" fill="#8B3DFF"/>'),
      ],
    },
    flows: {
      signal: {
        col: '#F5B90A', name: T2('nerve signal', 'तंत्रिका संकेत'), start: T2('The finger touches the hot flame. What senses the heat first? Tap it.', 'उँगली गर्म लौ को छूती है। गर्मी को सबसे पहले कौन महसूस करता है? उस पर टैप करो।'),
        done: T2('This quick, automatic action is a reflex. The path it takes is called a reflex arc; the message also goes on to the brain, so we feel the pain a moment later.', 'यह तेज़, अपने-आप होने वाली क्रिया प्रतिवर्ती क्रिया है। इसका रास्ता प्रतिवर्ती चाप कहलाता है; संदेश मस्तिष्क तक भी जाता है, इसलिए हमें दर्द थोड़ी देर बाद महसूस होता है।'),
        steps: [
          { p: 'receptor', at: [124, 474], s: T2('Receptors in the fingertip sense the heat.', 'उँगली के सिरे के ग्राही गर्मी महसूस करते हैं।') },
          { p: 'sensory', at: [146, 300], via: [[126, 450], [134, 390]], s: T2('The sensory nerve carries the message up the arm.', 'संवेदी तंत्रिका संदेश को बाँह से ऊपर ले जाती है।') },
          { p: 'spinalcord', at: [240, 204], via: [[156, 246], [176, 200], [214, 194]], s: T2('In the spinal cord a relay nerve cell passes it straight on. The brain is not needed for this.', 'मेरुरज्जु में एक जोड़ने वाली तंत्रिका कोशिका उसे सीधे आगे भेजती है। इसके लिए मस्तिष्क की ज़रूरत नहीं।') },
          { p: 'motor', at: [176, 210], via: [[220, 198], [196, 200]], s: T2('The motor nerve carries the order back.', 'प्रेरक तंत्रिका आदेश को वापस ले जाती है।') },
          { p: 'effector', at: [156, 266], via: [[164, 230]], s: T2('The arm muscle contracts and pulls the hand away.', 'बाँह की पेशी सिकुड़ती है और हाथ को दूर खींचती है।') },
        ],
      },
    },
  };
  // Fix the nerves path (one path element with the drawing data).
  SCENES.nervous.parts[0].d = () => both(`<path d="M240 168C222 172 196 176 176 184C160 196 152 236 146 280C140 330 132 380 126 420L124 448M124 448l-10 14M124 448l-2 22M124 448l8 18M240 340C236 370 226 410 216 440C210 480 206 530 206 570C206 620 206 660 204 698M204 698l-10 12M204 698l4 14M206 570l-12 8M146 280l-14 8${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `M240 ${180 + i * 14}C226 ${178 + i * 14} 204 ${182 + i * 14} 190 ${192 + i * 14}`).join('')}M232 82C224 88 214 92 206 98M234 86C230 96 226 104 220 110" fill="none" stroke="#E8A317" stroke-width="2.2" stroke-linecap="round"/>`) + hit('M240 168C196 176 160 196 146 280C136 360 128 420 124 448M240 168C284 176 320 196 334 280C344 360 352 420 356 448M240 340C226 410 206 520 204 698M240 340C254 410 274 520 276 698', 14);

  // BRAIN ------------------------------------------------------------
  const CEREBRUM = [[70, 176], [74, 128], [104, 78], [160, 46], [230, 36], [300, 48], [354, 84], [382, 136], [380, 180], [356, 206], [320, 212], [286, 206], [262, 200], [236, 204], [206, 214], [170, 216], [130, 212], [96, 200]];
  const CEREB_LAT = [[70, 176], [74, 128], [104, 78], [160, 46], [230, 36], [300, 48], [354, 84], [382, 136], [380, 180], [356, 206], [320, 216], [290, 234], [250, 252], [200, 254], [150, 238], [110, 220], [84, 200]];
  const CEREBELLUM = [[300, 222], [330, 212], [366, 214], [390, 234], [388, 266], [362, 284], [320, 284], [296, 266]];
  const BRAIN_GYRI = 'M96 150C110 120 130 140 146 112S180 120 196 90 236 106 250 76 290 96 306 76 340 104 352 120M90 184C112 170 128 190 150 168S190 182 210 160 250 172 268 150 310 168 330 146 362 166 372 170M130 76C150 90 160 70 178 84S210 64 226 74M260 60C280 70 300 56 318 72M120 200C140 196 160 206 180 198';
  const FOLIA = [0, 1, 2, 3, 4].map((k) => `M${302 + k * 2} ${232 + k * 10}C${330} ${226 + k * 11} ${364} ${228 + k * 11} ${386 - k * 2} ${240 + k * 9}`).join('');
  const LOBES = {
    frontal: [[0, 0], [234, 0], [210, 168], [130, 186], [0, 206]],
    parietal: [[234, 0], [332, 0], [336, 150], [286, 164], [210, 168]],
    occipital: [[332, 0], [460, 0], [460, 300], [332, 226], [336, 150]],
    temporal: [[0, 206], [130, 186], [210, 168], [286, 164], [336, 150], [332, 226], [300, 300], [0, 340]],
  };
  const lobe = (k, col) => `<path d="M${LOBES[k].map((p) => p.join(' ')).join('L')}Z" fill="${col}" clip-path="url(#by-lclip)"/>`;
  SCENES.brain = {
    name: T2('Brain', 'मस्तिष्क'), about: T2('About 1.4 kg of nerve tissue that controls thinking, the senses, movement and the body\'s automatic work.', 'लगभग 1.4 किलो तंत्रिका ऊतक जो सोच, इंद्रियों, गति और शरीर के अपने-आप होने वाले कामों को नियंत्रित करता है।'),
    vb: [40, 20, 380, 320], tabs: true, note: T2('Seen from the side: the face is towards the left.', 'बगल से देखा गया: चेहरा बाईं ओर है।'),
    layers: [{ id: 'regions', n: T2('Parts', 'भाग') }, { id: 'lobes', n: T2('Lobes', 'पालियाँ') }],
    defs: `<clipPath id="by-lclip"><path d="${smooth(CEREB_LAT)}"/></clipPath><clipPath id="by-cclip"><path d="${smooth(CEREBRUM)}"/></clipPath>`,
    bg: () => '<path d="M60 150C50 100 90 40 170 26C250 12 340 30 386 90C412 130 410 200 396 250L360 300" fill="none" stroke="#CBD5E1" stroke-width="3" stroke-dasharray="6 6" pointer-events="none"/>',
    caps: [[64, 250, T2('← face', '← चेहरा'), 'start']],
    fg: (st) => (st.layers.has('lobes') ? `<path d="${smooth(CEREB_LAT)}" fill="none" stroke="#9D3B58" stroke-width="2" pointer-events="none"/><path d="${BRAIN_GYRI}" fill="none" stroke="#7A2944" stroke-opacity=".35" stroke-width="1.6" clip-path="url(#by-lclip)" pointer-events="none"/><path d="M234 36L210 168M130 186C170 176 250 164 336 150M336 150L332 226M332 60L336 150" fill="none" stroke="#5B1730" stroke-width="2.4" stroke-dasharray="5 4" clip-path="url(#by-lclip)" pointer-events="none"/>` : ''),
    parts: [
      P('spinalcord', 'Spinal cord', 'मेरुरज्जु', 'It carries messages between the brain and the body.', 'यह मस्तिष्क और शरीर के बीच संदेश ले जाती है।', [300, 330], tube('M268 316L266 340', 14, '#F6D5A8', '#B9895A'), { l: 'regions' }),
      P('medulla', 'Medulla', 'मेडुला (मेरुशीर्ष)', 'Part of the hind-brain. It controls automatic actions such as heartbeat, breathing, blood pressure, swallowing and vomiting.', 'पश्चमस्तिष्क का भाग। यह धड़कन, साँस, रक्तचाप, निगलने और उल्टी जैसी अपने-आप होने वाली क्रियाओं को नियंत्रित करता है।', [306, 304], blob([[258, 268], [284, 268], [282, 296], [274, 318], [262, 318], [258, 296]], '#F2B48C', '#A8653E'), { l: 'regions' }),
      P('pons', 'Pons', 'पॉन्स', 'Part of the hind-brain that helps control breathing and passes messages between the brain\'s parts.', 'पश्चमस्तिष्क का भाग जो साँस को नियंत्रित करने में मदद करता है और मस्तिष्क के भागों के बीच संदेश पहुँचाता है।', [312, 262], blob([[256, 236], [282, 234], [294, 250], [284, 266], [258, 266], [250, 252]], '#EFA57D', '#A8653E'), { l: 'regions' }),
      P('cerebellum', 'Cerebellum', 'अनुमस्तिष्क', 'Part of the hind-brain at the back. It keeps our balance and posture and makes movements smooth and exact, like riding a cycle.', 'पीछे स्थित पश्चमस्तिष्क का भाग। यह संतुलन और मुद्रा बनाए रखता है और गति को सधा व सटीक बनाता है, जैसे साइकिल चलाना।', [370, 290], blob(CEREBELLUM, '#E9879B', '#9D3B58') + `<path d="${FOLIA}" fill="none" stroke="#9D3B58" stroke-width="1.2" opacity=".7" pointer-events="none"/>`),
      P('midbrain', 'Mid-brain', 'मध्यमस्तिष्क', 'It links the fore-brain and hind-brain and controls some reflexes of the eyes and ears, such as turning towards a sudden sound.', 'यह अग्रमस्तिष्क और पश्चमस्तिष्क को जोड़ता है और आँख-कान की कुछ प्रतिवर्ती क्रियाएँ नियंत्रित करता है, जैसे अचानक आवाज़ की ओर मुड़ना।', [300, 216], blob([[250, 206], [272, 204], [284, 218], [278, 234], [254, 234]], '#F7C6A3', '#A8653E'), { l: 'regions' }),
      P('cerebrum', 'Cerebrum', 'प्रमस्तिष्क', 'The biggest part, in the fore-brain. It thinks, learns and remembers, receives messages from the senses and starts voluntary actions like writing.', 'सबसे बड़ा भाग, अग्रमस्तिष्क में। यह सोचता, सीखता और याद रखता है, इंद्रियों से संदेश लेता है और लिखने जैसी ऐच्छिक क्रियाएँ शुरू करता है।', [130, 60], blob(CEREBRUM, '#F4A7B9', '#9D3B58') + `<path d="${BRAIN_GYRI}" fill="none" stroke="#B4566E" stroke-width="1.6" clip-path="url(#by-cclip)" pointer-events="none"/><path d="M130 176C170 150 240 140 300 162" fill="none" stroke="#FCE7EF" stroke-width="7" stroke-linecap="round" opacity=".8" pointer-events="none"/>`, { l: 'regions' }),
      P('hypothalamus', 'Hypothalamus', 'हाइपोथैलेमस', 'A small part of the fore-brain that controls body temperature, hunger and thirst, and tells the pituitary gland what to do.', 'अग्रमस्तिष्क का छोटा भाग जो शरीर का ताप, भूख और प्यास नियंत्रित करता है और पीयूष ग्रंथि को निर्देश देता है।', [176, 236], blob([[222, 206], [244, 204], [248, 218], [232, 226], [220, 218]], '#C084FC', '#6D28D9'), { l: 'regions' }),
      P('pituitary', 'Pituitary gland', 'पीयूष ग्रंथि', 'A pea-sized gland hanging below the brain. It makes growth hormone and controls other glands, so it is called the master gland.', 'मस्तिष्क के नीचे लटकी मटर के आकार की ग्रंथि। यह वृद्धि हार्मोन बनाती है और दूसरी ग्रंथियों को नियंत्रित करती है, इसलिए इसे मुख्य ग्रंथि कहते हैं।', [196, 262], '<path d="M232 224L230 236" stroke="#7E22CE" stroke-width="3"/><ellipse cx="230" cy="244" rx="10" ry="8" fill="#A855F7" stroke="#6B21A8" stroke-width="1.5"/><circle cx="230" cy="242" r="14" fill="transparent"/>', { l: 'regions' }),
      P('brainstem', 'Brain stem', 'मस्तिष्क स्तंभ', 'Mid-brain, pons and medulla together. It runs breathing, heartbeat and other automatic work.', 'मध्यमस्तिष्क, पॉन्स और मेडुला मिलकर। यह साँस, धड़कन और दूसरे अपने-आप होने वाले काम चलाता है।', [300, 300], blob([[258, 240], [286, 236], [288, 290], [278, 334], [262, 334], [258, 290]], '#F2B48C', '#A8653E'), { l: 'lobes' }),
      P('frontal', 'Frontal lobe', 'अग्र पालि', 'At the front. Thinking, planning, speaking and starting movements.', 'आगे की ओर। सोचना, योजना बनाना, बोलना और गति शुरू करना।', [110, 120], lobe('frontal', '#F9A8D4'), { l: 'lobes' }),
      P('parietal', 'Parietal lobe', 'पार्श्व पालि', 'At the top. Feeling touch, heat, cold and pain, and knowing where the body is.', 'ऊपर की ओर। स्पर्श, गर्मी, ठंड और दर्द महसूस करना, और शरीर की स्थिति जानना।', [290, 60], lobe('parietal', '#A5B4FC'), { l: 'lobes' }),
      P('occipital', 'Occipital lobe', 'पश्च पालि', 'At the back. Seeing: it makes sense of what the eyes send.', 'पीछे की ओर। देखना: आँखों से आए संदेशों को समझता है।', [384, 170], lobe('occipital', '#86EFAC'), { l: 'lobes' }),
      P('temporal', 'Temporal lobe', 'शंख पालि', 'At the side, above the ear. Hearing, understanding words and memory.', 'बगल में, कान के ऊपर। सुनना, शब्द समझना और स्मृति।', [180, 226], lobe('temporal', '#FDE68A'), { l: 'lobes' }),
      P('cerebellum', 'Cerebellum', 'अनुमस्तिष्क', 'At the back, below the lobes. Balance, posture and smooth movement.', 'पीछे, पालियों के नीचे। संतुलन, मुद्रा और सधी हुई गति।', [370, 290], blob(CEREBELLUM, '#E9879B', '#9D3B58') + `<path d="${FOLIA}" fill="none" stroke="#9D3B58" stroke-width="1.2" opacity=".7" pointer-events="none"/>`, { l: 'lobes' }),
    ],
  };
  SCENES.brain.parts.find((p) => p.id === 'cerebellum').l = 'regions';

  // EYE --------------------------------------------------------------
  const EC = [270, 160], ER = 110;
  const ept = (deg, r) => [r1(EC[0] + r * Math.cos(deg * Math.PI / 180)), r1(EC[1] + r * Math.sin(deg * Math.PI / 180))];
  const earc = (a1, a2, r) => { const p1 = ept(a1, r), p2 = ept(a2, r); return `M${p1[0]} ${p1[1]}A${r} ${r} 0 1 1 ${p2[0]} ${p2[1]}`; };
  const RAYS = ['M44 112L186 130L366 188', 'M44 112L186 160L366 188', 'M44 112L186 188L366 188'];
  SCENES.eye = {
    name: T2('Eye', 'आँख'), about: T2('The eye works like a camera: it bends light to make a picture on the retina, and the brain sees it.', 'आँख कैमरे की तरह काम करती है: यह प्रकाश को मोड़कर रेटिना पर चित्र बनाती है, और मस्तिष्क उसे देखता है।'),
    vb: [0, 30, 460, 260], note: T2('A cut through the eye from the side; light comes in from the left.', 'आँख की बगल से काट; प्रकाश बाईं ओर से आता है।'),
    layers: [{ id: 'rays', n: T2('Light rays', 'प्रकाश किरणें'), on: false }],
    bg: () => `<circle cx="${EC[0]}" cy="${EC[1]}" r="98" fill="#EEF8FC"/>`,
    fg: (st) => (st.layers.has('rays') ? `<g pointer-events="none"><path d="M44 160V116" stroke="#16A34A" stroke-width="4" stroke-linecap="round"/><path d="M36 124L44 110L52 124Z" fill="#16A34A"/>${RAYS.map((d, i) => `<path class="by-ray" d="${d}" fill="none" stroke="#F59E0B" stroke-width="2.2" stroke-dasharray="${st.rayK != null ? `${r1(st.rayK * 360)} 400` : 'none'}"/>`).join('')}<path d="M366 160V186" stroke="#DC2626" stroke-width="3.4" stroke-linecap="round"/><path d="M361 180L366 190L371 180Z" fill="#DC2626"/></g>` : ''),
    caps: [[44, 182, T2('object', 'वस्तु'), 'middle', 'rays'], [312, 222, T2('image: upside down', 'प्रतिबिंब: उल्टा'), 'middle', 'rays']],
    parts: [
      P('vitreous', 'Vitreous humour', 'काचाभ द्रव', 'A clear jelly that fills the eyeball and keeps its round shape.', 'एक साफ़ जेली जो नेत्रगोलक को भरती है और उसका गोल आकार बनाए रखती है।', [280, 120], `<circle cx="${EC[0]}" cy="${EC[1]}" r="60" fill="#E0F2FE" opacity=".55"/>`),
      P('opticnerve', 'Optic nerve', 'दृक् तंत्रिका', 'It carries the signals from the retina to the brain.', 'यह रेटिना से संकेतों को मस्तिष्क तक ले जाती है।', [430, 214], tube('M374 184L452 198', 20, '#F6C453', '#B7862A')),
      P('sclera', 'Sclera', 'श्वेत पटल', 'The tough white outer coat that protects the eye. It is the "white of the eye".', 'मज़बूत सफ़ेद बाहरी परत जो आँख की रक्षा करती है। यही आँख का सफ़ेद भाग है।', [270, 40], `<path d="${earc(205, 155, ER)}" fill="none" stroke="#94A3B8" stroke-width="13"/><path d="${earc(205, 155, ER)}" fill="none" stroke="#FFFFFF" stroke-width="10"/>` + hit(earc(205, 155, ER), 16)),
      P('choroid', 'Choroid', 'रक्तक पटल (कोरॉइड)', 'A dark layer full of blood vessels that feeds the eye and stops light bouncing around inside.', 'रक्त वाहिकाओं से भरी गहरी परत जो आँख को पोषण देती है और अंदर प्रकाश को इधर-उधर उछलने से रोकती है।', [352, 76], `<path d="${earc(206, 154, 103)}" fill="none" stroke="#7C3A2D" stroke-width="4.5"/>` + hit(earc(215, 145, 103), 8)),
      P('retina', 'Retina', 'दृष्टिपटल (रेटिना)', 'The light-sensitive screen at the back. Its rod cells work in dim light; its cone cells see colour. They turn light into nerve signals.', 'पीछे की प्रकाश-संवेदी परदा। इसकी शलाका कोशिकाएँ मंद प्रकाश में काम करती हैं; शंकु कोशिकाएँ रंग देखती हैं। ये प्रकाश को तंत्रिका संकेत में बदलती हैं।', [376, 118], `<path d="${earc(215, 145, 98.5)}" fill="none" stroke="#F59E7A" stroke-width="5"/>` + hit(earc(215, 145, 98.5), 12)),
      P('yellowspot', 'Yellow spot', 'पीत बिंदु', 'The middle of the retina, packed with cone cells. Here we see most sharply.', 'रेटिना का मध्य भाग, शंकु कोशिकाओं से भरा। यहाँ हम सबसे साफ़ देखते हैं।', [348, 150], '<ellipse cx="368" cy="160" rx="3.4" ry="7" fill="#FACC15" stroke="#A16207"/><circle cx="368" cy="160" r="9" fill="transparent"/>'),
      P('blindspot', 'Blind spot', 'अंध बिंदु', 'Where the optic nerve leaves the eye there are no rods or cones, so nothing is seen at this spot.', 'जहाँ दृक् तंत्रिका आँख से निकलती है वहाँ शलाकाएँ या शंकु नहीं होते, इसलिए इस बिंदु पर कुछ नहीं दिखता।', [354, 198], '<ellipse cx="370" cy="183" rx="3.4" ry="7" fill="#1E293B"/><circle cx="370" cy="183" r="9" fill="transparent"/>'),
      P('aqueous', 'Aqueous humour', 'जलीय द्रव', 'A clear watery liquid between the cornea and the lens that feeds them.', 'कॉर्निया और लेंस के बीच एक साफ़ पानी जैसा द्रव जो उन्हें पोषण देता है।', [164, 92], '<path d="M170.3 113.5Q128 160 170.3 206.5L186 206L186 114Z" fill="#DBEAFE"/>'),
      P('ciliary', 'Ciliary muscles', 'पक्ष्माभी पेशियाँ', 'They change the shape of the lens, so we can focus on near and far things.', 'ये लेंस का आकार बदलती हैं, ताकि हम पास और दूर की चीज़ों पर ध्यान केंद्रित कर सकें।', [210, 86], '<ellipse cx="196" cy="110" rx="7" ry="10" fill="url(#by-musc)" stroke="#9F1D2B"/><ellipse cx="196" cy="210" rx="7" ry="10" fill="url(#by-musc)" stroke="#9F1D2B"/><path d="M198 118L204 124M198 202L204 196" stroke="#94A3B8" stroke-width="1.2"/>'),
      P('lens', 'Lens', 'लेंस (अभिनेत्र लेंस)', 'A clear, flexible lens that focuses the light on the retina.', 'साफ़, लचीला लेंस जो प्रकाश को रेटिना पर केंद्रित करता है।', [232, 230], '<ellipse cx="204" cy="160" rx="14" ry="38" fill="#E0F2FE" stroke="#38BDF8" stroke-width="2"/><path d="M198 136Q194 160 198 184" stroke="#fff" stroke-width="3" fill="none" opacity=".8"/>'),
      P('iris', 'Iris', 'परितारिका (आइरिस)', 'The coloured ring of muscle. It makes the pupil smaller in bright light and bigger in dim light.', 'पेशी का रंगीन छल्ला। यह तेज़ रोशनी में पुतली को छोटा और मंद रोशनी में बड़ा करता है।', [190, 70], '<rect x="182" y="112" width="8" height="34" rx="2" fill="#8B5E3C" stroke="#5C3A20"/><rect x="182" y="174" width="8" height="34" rx="2" fill="#8B5E3C" stroke="#5C3A20"/>'),
      P('pupil', 'Pupil', 'पुतली', 'The hole in the middle of the iris that lets light in. It looks black.', 'आइरिस के बीच का छिद्र जो प्रकाश को अंदर आने देता है। यह काला दिखता है।', [150, 250], '<rect x="182" y="146" width="8" height="28" fill="#0F172A" opacity=".55"/><rect x="176" y="146" width="20" height="28" fill="transparent"/>'),
      P('cornea', 'Cornea', 'कॉर्निया', 'The clear front window of the eye. Most of the bending of light happens here.', 'आँख की साफ़ सामने की खिड़की। प्रकाश का ज़्यादातर मुड़ना यहीं होता है।', [120, 120], tube('M170.3 113.5Q128 160 170.3 206.5', 3.6, '#BAE6FD', '#0284C7')),
    ],
    flows: {
      signal: {
        col: '#F59E0B', name: T2('light and signal', 'प्रकाश और संकेत'), start: T2('Light from the tree reaches the eye. What does it pass through first? Tap it.', 'पेड़ से प्रकाश आँख तक पहुँचता है। वह सबसे पहले किससे गुज़रता है? उस पर टैप करो।'),
        done: T2('The image on the retina is upside down and tiny; the brain turns it the right way up and we see.', 'रेटिना पर प्रतिबिंब उल्टा और बहुत छोटा होता है; मस्तिष्क उसे सीधा करता है और हम देखते हैं।'),
        steps: [
          { p: 'cornea', at: [150, 160], s: T2('Light enters through the clear cornea, which bends it.', 'प्रकाश साफ़ कॉर्निया से अंदर आता है, जो उसे मोड़ता है।') },
          { p: 'pupil', at: [186, 160], s: T2('It passes through the pupil in the iris.', 'वह आइरिस के बीच पुतली से गुज़रता है।') },
          { p: 'lens', at: [204, 160], s: T2('The lens focuses it.', 'लेंस उसे केंद्रित करता है।') },
          { p: 'retina', at: [366, 184], via: [[290, 172]], s: T2('A small upside-down image forms on the retina; rods and cones make signals.', 'रेटिना पर एक छोटा उल्टा प्रतिबिंब बनता है; शलाकाएँ और शंकु संकेत बनाते हैं।') },
          { p: 'opticnerve', at: [444, 196], via: [[378, 186]], s: T2('The optic nerve carries the signals to the brain.', 'दृक् तंत्रिका संकेतों को मस्तिष्क तक ले जाती है।') },
        ],
      },
    },
    playName: T2('Shine light', 'प्रकाश डालो'), playLayer: 'rays', playMs: 3000,
    anim: (k, st, svg) => { st.rayK = Math.min(1, k * 1.3); svg.querySelectorAll('.by-ray').forEach((p) => p.setAttribute('stroke-dasharray', `${r1(st.rayK * 360)} 400`)); },
  };

  // EAR --------------------------------------------------------------
  const PINNA = [[70, 30], [44, 46], [26, 90], [24, 150], [36, 206], [60, 252], [84, 262], [96, 240], [84, 206], [70, 186], [62, 160], [70, 128], [88, 98], [96, 62], [88, 38]];
  const spiral = (cx, cy, r0, turns) => { const pts = []; for (let i = 0; i <= turns * 24; i++) { const a = i / 24 * Math.PI * 2 + Math.PI * 0.9, r = r0 * (1 - i / (turns * 24) * 0.8); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return smooth(pts, false); };
  const COCH = spiral(332, 198, 36, 2.6);
  SCENES.ear = {
    name: T2('Ear', 'कान'), about: T2('The ear turns sound vibrations into nerve signals, and it also keeps our balance.', 'कान ध्वनि के कंपन को तंत्रिका संकेतों में बदलता है, और हमारा संतुलन भी बनाए रखता है।'),
    vb: [0, 10, 480, 300], note: T2('A cut through the right ear, seen from the front.', 'दाएँ कान की काट, सामने से देखी गई।'),
    layers: [{ id: 'zones', n: T2('Outer, middle, inner', 'बाहरी, मध्य, आंतरिक'), on: false }],
    bg: (st) => '<path d="M96 20H470V300H96Z" fill="#EBDCC4"/>' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => `<circle cx="${120 + (k * 47) % 340}" cy="${40 + (k * 71) % 250}" r="3" fill="#D8C3A0"/>`).join('') + '<path d="M60 20H98V300H60Z" fill="url(#by-skin)"/>' + (st.layers.has('zones') ? '<rect x="0" y="10" width="204" height="300" fill="#FFD23F" opacity=".16"/><rect x="204" y="10" width="68" height="300" fill="#02CFF9" opacity=".18"/><rect x="272" y="10" width="140" height="300" fill="#8B3DFF" opacity=".14"/>' : '') + '<path d="M204 104L236 96L266 110L272 150L262 196L236 212L206 206Z" fill="#FDF4E7" stroke="#D6C2A0" stroke-width="1.5"/>',
    caps: [[100, 30, T2('outer ear', 'बाहरी कान'), 'middle', 'zones'], [238, 30, T2('middle ear', 'मध्य कान'), 'middle', 'zones'], [342, 30, T2('inner ear', 'आंतरिक कान'), 'middle', 'zones'], [454, 160, T2('to brain', 'मस्तिष्क को'), 'end'], [318, 296, T2('to throat', 'गले की ओर'), 'start']],
    parts: [
      P('eustachian', 'Eustachian tube', 'यूस्टेकियन नली', 'A tube from the middle ear to the throat. It keeps the air pressure the same on both sides of the eardrum; that is why ears "pop".', 'मध्य कान से गले तक एक नली। यह कान के पर्दे के दोनों ओर हवा का दबाव बराबर रखती है; इसीलिए कान "खुलते" हैं।', [282, 270], tube('M238 208C252 240 276 270 312 298', 10, '#F2B8C6', '#B4607A')),
      P('earcanal', 'Ear canal', 'कर्ण नलिका', 'A tube about 2.5 cm long that leads sound to the eardrum. Wax in it traps dust and germs.', 'लगभग 2.5 सेमी लंबी नली जो ध्वनि को कान के पर्दे तक ले जाती है। इसका मैल धूल और रोगाणु रोकता है।', [140, 206], '<path d="M70 134C120 132 170 140 202 136L202 184C170 180 120 184 70 170Z" fill="#F7D9C4" stroke="#C98F6E" stroke-width="1.6"/>'),
      P('pinna', 'Outer ear (pinna)', 'कर्ण पल्लव', 'The flap of skin and cartilage outside the head. Its shape collects sound waves and sends them into the ear.', 'सिर के बाहर त्वचा और उपास्थि का पल्ला। इसका आकार ध्वनि तरंगों को इकट्ठा करके कान में भेजता है।', [34, 260], blob(PINNA, 'url(#by-skin)', '#C98F6E', 1.8) + '<path d="M64 52C42 80 36 140 50 200C58 222 70 236 84 244" fill="none" stroke="#C98F6E" stroke-width="2"/><ellipse cx="76" cy="150" rx="12" ry="22" fill="#E7B394" opacity=".8"/>'),
      P('eardrum', 'Eardrum', 'कर्ण पटह (कान का पर्दा)', 'A thin, tight skin across the end of the canal. Sound makes it vibrate.', 'नलिका के अंत में एक पतली, तनी हुई झिल्ली। ध्वनि उसे कंपित करती है।', [190, 106], '<g id="by-drum"><ellipse cx="204" cy="160" rx="4" ry="28" fill="#E2E8F0" stroke="#64748B" stroke-width="1.6"/></g><rect x="196" y="130" width="16" height="60" fill="transparent"/>'),
      P('hammer', 'Hammer (malleus)', 'मुग्दरक (हथौड़ा)', 'The first of three tiny bones. Its handle is joined to the eardrum.', 'तीन छोटी हड्डियों में पहली। इसका हत्था कान के पर्दे से जुड़ा होता है।', [212, 84], '<g class="by-oss">' + boneLine('M207 172L216 126', 4.6) + '<circle cx="221" cy="117" r="8" class="by-bf"/></g><circle cx="216" cy="140" r="14" fill="transparent"/>'),
      P('anvil', 'Anvil (incus)', 'निहाई (इन्कस)', 'The middle bone. It passes the vibration from the hammer to the stirrup.', 'बीच की हड्डी। यह कंपन को हथौड़े से रकाब तक पहुँचाती है।', [252, 92], '<g class="by-oss"><circle cx="236" cy="118" r="8" class="by-bf"/>' + boneLine('M239 124L247 145', 4) + '</g><circle cx="240" cy="128" r="13" fill="transparent"/>'),
      P('stirrup', 'Stirrup (stapes)', 'वलयक (रकाब)', 'The smallest bone in the body, about 3 mm. It pushes on the inner ear like a tiny piston.', 'शरीर की सबसे छोटी हड्डी, लगभग 3 मिमी। यह आंतरिक कान को एक छोटे पिस्टन की तरह धकेलती है।', [262, 184], '<g class="by-oss"><path d="M248 148C254 136 264 136 268 140M248 148C254 160 264 160 268 156" fill="none" stroke="#A08B6A" stroke-width="4.4" stroke-linecap="round"/><path d="M248 148C254 136 264 136 268 140M248 148C254 160 264 160 268 156" fill="none" stroke="#F7F0E1" stroke-width="2.4" stroke-linecap="round"/><rect x="267" y="136" width="5" height="24" rx="2" class="by-bf"/></g><circle cx="260" cy="148" r="13" fill="transparent"/>'),
      P('semicircular', 'Semicircular canals', 'अर्धवृत्ताकार नलिकाएँ', 'Three looped tubes of fluid at right angles. They sense how the head moves and help us keep our balance.', 'द्रव से भरी तीन घुमावदार नलियाँ, एक-दूसरे से समकोण पर। ये सिर की गति महसूस करती हैं और संतुलन में मदद करती हैं।', [356, 62], '<g fill="none" stroke-linecap="round"><ellipse cx="300" cy="90" rx="20" ry="26" stroke="#7C3AED" stroke-width="8"/><ellipse cx="300" cy="90" rx="20" ry="26" stroke="#C4B5FD" stroke-width="5"/><ellipse cx="326" cy="104" rx="26" ry="13" stroke="#7C3AED" stroke-width="8"/><ellipse cx="326" cy="104" rx="26" ry="13" stroke="#C4B5FD" stroke-width="5"/><ellipse cx="316" cy="80" rx="11" ry="24" transform="rotate(35 316 80)" stroke="#7C3AED" stroke-width="8"/><ellipse cx="316" cy="80" rx="11" ry="24" transform="rotate(35 316 80)" stroke="#C4B5FD" stroke-width="5"/></g>' + blob([[272, 128], [296, 120], [310, 136], [304, 158], [280, 162], [270, 148]], '#C4B5FD', '#7C3AED')),
      P('cochlea', 'Cochlea', 'कर्णावर्त (कॉक्लिया)', 'A snail-shaped tube full of fluid. Tiny hair cells inside turn the vibrations into nerve signals.', 'घोंघे के आकार की द्रव से भरी नली। इसके अंदर की छोटी रोम कोशिकाएँ कंपन को तंत्रिका संकेतों में बदलती हैं।', [356, 252], tube(COCH, 11, '#E9D5FF', '#7C3AED')),
      P('auditorynerve', 'Auditory nerve', 'श्रवण तंत्रिका', 'It carries the signals from the cochlea to the brain, which hears them as sound.', 'यह संकेतों को कर्णावर्त से मस्तिष्क तक ले जाती है, जो उन्हें ध्वनि के रूप में सुनता है।', [430, 196], tube('M334 196C360 186 400 170 466 168M304 140C340 150 380 164 420 168', 8, '#F6C453', '#B7862A')),
    ],
    fg: (st) => (st.waves != null ? `<g pointer-events="none" fill="none" stroke="#0EA5E9" stroke-width="2.6" stroke-linecap="round">${[0, 1, 2].map((i) => { const x = 74 + ((st.waves * 260 + i * 40) % 124); return `<path d="M${r1(x)} 142Q${r1(x + 8)} 158 ${r1(x)} 176" opacity="${r1(1 - (x - 74) / 140)}"/>`; }).join('')}</g>` : ''),
    flows: {
      signal: {
        col: '#0EA5E9', name: T2('sound and signal', 'ध्वनि और संकेत'), start: T2('A bell rings. Which part of the ear catches the sound first? Tap it.', 'घंटी बजती है। कान का कौन-सा भाग ध्वनि को सबसे पहले पकड़ता है? उस पर टैप करो।'),
        done: T2('Sound travels as vibrations through air, skin, bone and fluid, and is turned into a nerve signal the brain understands.', 'ध्वनि हवा, झिल्ली, हड्डी और द्रव से कंपन के रूप में चलती है, और ऐसे तंत्रिका संकेत में बदलती है जिसे मस्तिष्क समझता है।'),
        steps: [
          { p: 'pinna', at: [60, 150], s: T2('The outer ear catches the sound waves.', 'बाहरी कान ध्वनि तरंगें पकड़ता है।') },
          { p: 'earcanal', at: [140, 158], s: T2('They travel down the ear canal.', 'वे कर्ण नलिका से अंदर जाती हैं।') },
          { p: 'eardrum', at: [204, 160], s: T2('The eardrum vibrates.', 'कान का पर्दा कंपित होता है।') },
          { p: 'hammer', at: [216, 132], s: T2('The hammer shakes with it…', 'हथौड़ा उसके साथ हिलता है…') },
          { p: 'anvil', at: [238, 122], s: T2('…passes it to the anvil…', '…निहाई को देता है…') },
          { p: 'stirrup', at: [262, 148], s: T2('…and the stirrup pushes on the inner ear.', '…और रकाब आंतरिक कान को धकेलता है।') },
          { p: 'cochlea', at: [332, 198], via: [[290, 160], [306, 176]], s: T2('Fluid in the cochlea moves; hair cells make nerve signals.', 'कर्णावर्त का द्रव हिलता है; रोम कोशिकाएँ तंत्रिका संकेत बनाती हैं।') },
          { p: 'auditorynerve', at: [440, 169], via: [[360, 186], [400, 172]], s: T2('The auditory nerve carries them to the brain.', 'श्रवण तंत्रिका उन्हें मस्तिष्क तक ले जाती है।') },
        ],
      },
    },
    playName: T2('Make a sound', 'आवाज़ करो'), playMs: 5000,
    anim: (k, st, svg) => {
      st.waves = k * 6;
      const d = svg.querySelector('#by-drum'); const w = Math.sin(k * 5000 / 60);
      if (d) d.setAttribute('transform', `translate(${r1(2 * w)} 0)`);
      svg.querySelectorAll('.by-oss').forEach((o, i) => o.setAttribute('transform', `translate(${r1(1.4 * Math.sin(k * 5000 / 60 - i * 0.6))} 0)`));
    },
  };

  // SKIN -------------------------------------------------------------
  const wave = (y0, amp, per, x0 = 0, x1 = 460) => { const pts = []; for (let x = x0; x <= x1; x += 20) pts.push([x, y0 + amp * Math.sin(x / per)]); return pts; };
  const EPI_TOP = wave(70, 4, 30), EPI_BOT = wave(110, 7, 16);
  const poly = (top, bot) => smooth(top, false) + 'L' + bot.slice().reverse().map((p) => p.join(' ')).join('L') + 'Z';
  SCENES.skin = {
    name: T2('Skin', 'त्वचा'), about: T2('The largest organ of the body. It protects us, keeps us at the right temperature and lets us feel.', 'शरीर का सबसे बड़ा अंग। यह हमारी रक्षा करती है, शरीर का ताप ठीक रखती है और हमें महसूस करने देती है।'),
    vb: [0, 0, 460, 340], note: T2('A small block of skin, cut through and magnified.', 'त्वचा का एक छोटा टुकड़ा, काटकर बड़ा दिखाया गया।'),
    layers: [{ id: 'glands', n: T2('Glands', 'ग्रंथियाँ'), on: true }, { id: 'vessels', n: T2('Blood vessels', 'रक्त वाहिकाएँ'), on: true }, { id: 'nerves', n: T2('Nerves', 'तंत्रिकाएँ'), on: true }],
    defs: '<pattern id="by-fatp" patternUnits="userSpaceOnUse" width="26" height="22"><rect width="26" height="22" fill="#FDE9A8"/><circle cx="7" cy="7" r="6" fill="#FEF3C7" stroke="#E2B84A"/><circle cx="20" cy="17" r="6.5" fill="#FEF3C7" stroke="#E2B84A"/></pattern>',
    bg: () => '<rect x="0" y="0" width="460" height="70" fill="#E0F2FE" opacity=".5"/>',
    parts: [
      P('fat', 'Fat layer', 'वसा परत', 'A layer of fat cells under the skin. It keeps the body warm, stores energy and cushions it against knocks.', 'त्वचा के नीचे वसा कोशिकाओं की परत। यह शरीर को गर्म रखती है, ऊर्जा जमा करती है और चोट से बचाती है।', [40, 300], '<rect x="0" y="228" width="460" height="112" fill="url(#by-fatp)"/>'),
      P('dermis', 'Dermis', 'चर्म (अंतस्त्वचा)', 'The thick inner layer, made of strong, stretchy fibres. It holds the blood vessels, nerves, glands and hair roots.', 'मोटी भीतरी परत, मज़बूत और लचीले तंतुओं से बनी। इसमें रक्त वाहिकाएँ, तंत्रिकाएँ, ग्रंथियाँ और बालों की जड़ें होती हैं।', [420, 200], `<path d="${poly(EPI_BOT, [[0, 230], [460, 230]])}" fill="#F7C6C0"/><path d="${smooth(wave(230, 3, 40), false)}" fill="none" stroke="#D99A80" stroke-width="1.5"/>`),
      P('epidermis', 'Epidermis', 'अधिचर्म (बाह्य त्वचा)', 'The thin outer layer. Its top cells are dead and flake off; new cells form below. Melanin here gives skin its colour and shields it from sunlight.', 'पतली बाहरी परत। इसकी ऊपर की कोशिकाएँ मृत होती हैं और झड़ती रहती हैं; नीचे नई कोशिकाएँ बनती हैं। यहाँ का मेलेनिन त्वचा को रंग देता है और धूप से बचाता है।', [420, 80], `<path d="${poly(EPI_TOP, EPI_BOT)}" fill="#F6D7C3" stroke="#C98F6E" stroke-width="1.4"/><path d="${smooth(wave(76, 4, 30), false)}" fill="none" stroke="#E8B9A0" stroke-width="5" opacity=".8"/><path d="${smooth(wave(104, 6, 16), false)}" fill="none" stroke="#B9785F" stroke-width="2" stroke-dasharray="2 4"/>`),
      P('vessels', 'Blood vessels', 'रक्त वाहिकाएँ', 'They feed the skin. When we are hot they widen to lose heat, so the skin looks red; when cold they narrow to save heat.', 'ये त्वचा को पोषण देती हैं। गर्मी में ये फैलकर ऊष्मा छोड़ती हैं, इसलिए त्वचा लाल दिखती है; ठंड में सिकुड़कर ऊष्मा बचाती हैं।', [420, 214], line('M0 218C120 210 240 224 460 214', 4, '#DC2626') + line('M0 226C120 218 240 232 460 222', 4, '#2563EB') + [70, 236, 400].map((x) => `<path d="M${x} 216C${x - 6} 160 ${x - 4} 120 ${x + 6} 116C${x + 14} 120 ${x + 12} 160 ${x + 10} 224" fill="none" stroke="#9333EA" stroke-width="2.4"/>`).join(''), { l: 'vessels' }),
      P('follicle', 'Hair follicle', 'रोम कूप', 'A tiny pit in the skin where a hair grows from its root.', 'त्वचा में एक छोटा गड्ढा जहाँ जड़ से बाल उगता है।', [104, 200], '<path d="M140 98C138 150 140 190 146 214C150 222 158 222 160 214C164 190 164 150 160 98Z" fill="#F2B9A5" stroke="#C47F6B" stroke-width="1.6"/><circle cx="152" cy="214" r="9" fill="#B9785F"/>'),
      P('hairmuscle', 'Hair muscle', 'रोम पेशी', 'A tiny muscle that pulls the hair upright when we are cold or scared: goose bumps!', 'एक छोटी पेशी जो ठंड या डर में बाल को खड़ा कर देती है: रोंगटे खड़े होना!', [212, 160], blob([[158, 180], [164, 172], [204, 112], [210, 118], [168, 184]], 'url(#by-musc)', '#9F1D2B', 1)),
      P('oilgland', 'Oil gland', 'तैल ग्रंथि', 'It makes an oil (sebum) that keeps the hair and skin soft and waterproof.', 'यह एक तेल (सीबम) बनाती है जो बालों और त्वचा को मुलायम और जलरोधी रखता है।', [196, 144], blob([[164, 128], [182, 122], [194, 134], [190, 152], [172, 156], [164, 144]], '#FCD34D', '#B7862A') + '<path d="M170 132C178 136 182 142 180 148" fill="none" stroke="#B7862A" stroke-width="1.2"/>', { l: 'glands' }),
      P('hair', 'Hair', 'बाल', 'Hair is made of dead cells of keratin. It grows from the root deep in the skin and helps keep us warm.', 'बाल केराटिन की मृत कोशिकाओं से बना होता है। यह त्वचा में गहरी जड़ से उगता है और गर्म रखने में मदद करता है।', [130, 26], tube('M152 212C150 170 148 130 148 100C146 70 136 40 118 14', 4, '#3F2A1D', '#1C120C')),
      P('sweatgland', 'Sweat gland', 'स्वेद ग्रंथि (पसीने की ग्रंथि)', 'A coiled tube deep in the skin. It makes sweat; as sweat dries it cools the body and removes some salt and water.', 'त्वचा में गहरी कुंडलित नली। यह पसीना बनाती है; पसीना सूखते समय शरीर को ठंडा करता है और कुछ लवण व पानी बाहर निकालता है।', [350, 272], tube(smooth([[304, 236], [296, 252], [312, 262], [326, 250], [314, 240], [300, 256], [318, 270], [330, 258], [316, 246]], false), 4, '#93C5FD', '#2563EB') + tube(smooth([[304, 236], [296, 200], [306, 170], [296, 140], [304, 110], [300, 72]], false), 2.6, '#BFDBFE', '#3B82F6'), { l: 'glands' }),
      P('pore', 'Sweat pore', 'स्वेद छिद्र', 'A tiny opening on the surface where sweat comes out.', 'सतह पर एक छोटा छिद्र जहाँ से पसीना बाहर आता है।', [334, 40], '<path d="M294 66L300 74L306 66" fill="#1E3A8A" stroke="#1E3A8A" stroke-width="1.5"/><circle cx="300" cy="56" r="3" fill="#7DD3FC"/><circle cx="300" cy="66" r="12" fill="transparent"/>', { l: 'glands' }),
      P('nerve', 'Nerve', 'तंत्रिका', 'It carries messages from the receptors in the skin to the spinal cord and brain.', 'यह त्वचा के ग्राहियों से संदेश मेरुरज्जु और मस्तिष्क तक ले जाती है।', [24, 268], line('M0 300C90 296 180 270 220 200C232 170 236 140 236 126M200 236C260 270 330 284 384 282', 2.6, '#E8A317'), { l: 'nerves' }),
      P('receptor', 'Touch and pressure receptors', 'स्पर्श और दाब ग्राही', 'Nerve endings that sense touch (near the top) and firm pressure (deep down). Fingertips have the most.', 'तंत्रिका के सिरे जो हल्का स्पर्श (ऊपर) और ज़ोर का दबाव (गहराई में) महसूस करते हैं। उँगलियों के सिरों में ये सबसे ज़्यादा होते हैं।', [266, 128], '<ellipse cx="236" cy="120" rx="5" ry="8" fill="#FDE68A" stroke="#B45309" stroke-width="1.4"/><path d="M232 116h8M232 120h8M232 124h8" stroke="#B45309" stroke-width=".8"/>' + [12, 9, 6, 3].map((r) => `<ellipse cx="392" cy="282" rx="${r + 4}" ry="${r}" fill="${r === 3 ? '#F59E0B' : '#FEF3C7'}" stroke="#B45309" stroke-width="1"/>`).join('') + '<circle cx="236" cy="120" r="12" fill="transparent"/>', { l: 'nerves' }),
    ],
  };

  // TEETH ------------------------------------------------------------
  // Tooth centres along one half of the upper arch (from the midline to the back), on an ellipse.
  function archPos(sizes, gap) {
    const pt = (f) => [210 + 128 * Math.cos(f), 282 - 196 * Math.sin(f)];
    const targets = []; let acc = 1;
    sizes.forEach((w) => { targets.push(acc + w / 2); acc += w + gap; });
    const out = []; let phi = Math.PI / 2, prev = pt(phi), len = 0;
    while (out.length < targets.length && phi > -0.6) {
      phi -= 0.002; const p = pt(phi); len += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p;
      if (len >= targets[out.length]) out.push({ x: r1(p[0]), y: r1(p[1]), a: r1(Math.atan2(196 * Math.cos(phi), 128 * Math.sin(phi)) * 180 / Math.PI), w: sizes[out.length] });
    }
    return out;
  }
  const TCOL = { incisor: ['#BAE6FD', '#0369A1'], canine: ['#FDE68A', '#A16207'], premolar: ['#BBF7D0', '#15803D'], molar: ['#DDD6FE', '#6D28D9'] };
  const toothShape = (type, w) => {
    const [f, s] = TCOL[type], h = w / 2;
    if (type === 'incisor') return `<rect x="${-h}" y="-5" width="${w}" height="10" rx="4" fill="${f}" stroke="${s}" stroke-width="1.4"/><path d="M${-h + 3} -2H${h - 3}" stroke="#fff" stroke-width="1.6"/>`;
    if (type === 'canine') return `<path d="M${-h} 0Q${-h} -7 0 -8Q${h} -7 ${h} 0Q${h} 7 0 7Q${-h} 7 ${-h} 0Z" fill="${f}" stroke="${s}" stroke-width="1.4"/><circle r="1.8" fill="${s}"/>`;
    if (type === 'premolar') return `<ellipse rx="${h}" ry="9" fill="${f}" stroke="${s}" stroke-width="1.4"/><path d="M${-h * 0.55} 0H${h * 0.55}" stroke="${s}" stroke-width="1.2"/>`;
    return `<rect x="${-h}" y="-10.5" width="${w}" height="21" rx="6" fill="${f}" stroke="${s}" stroke-width="1.4"/><path d="M${-h + 3} 0H${h - 3}M0 -8V8" stroke="${s}" stroke-width="1.2"/>`;
  };
  const ADULT = { sizes: [17, 14, 16, 15, 15, 21, 20, 19], types: ['incisor', 'incisor', 'canine', 'premolar', 'premolar', 'molar', 'molar', 'molar'] };
  const MILK = { sizes: [15, 13, 14, 18, 20], types: ['incisor', 'incisor', 'canine', 'molar', 'molar'] };
  const archTeeth = (set, type) => { const pos = archPos(set.sizes, 2.5); return both(pos.map((p, i) => (set.types[i] === type ? `<g transform="translate(${p.x} ${p.y}) rotate(${p.a})">${toothShape(type, p.w)}<rect x="${-p.w / 2 - 3}" y="-14" width="${p.w + 6}" height="28" fill="transparent"/></g>` : '')).join(''), 210); };
  const GUM_ARC = (() => { const pts = []; for (let f = -0.32; f <= Math.PI + 0.33; f += 0.08) pts.push([210 + 128 * Math.cos(f), 282 - 196 * Math.sin(f)]); return smooth(pts, false); })();
  const toothInfo = {
    incisor: ['Incisors', 'कृंतक', 'The flat, sharp front teeth, for biting and cutting food. 8 in all (4 in each jaw).', 'आगे के चपटे, धारदार दाँत, भोजन काटने के लिए। कुल 8 (हर जबड़े में 4)।'],
    canine: ['Canines', 'रदनक', 'Pointed teeth beside the incisors, for tearing food. 4 in all.', 'कृंतकों के बगल के नुकीले दाँत, भोजन फाड़ने के लिए। कुल 4।'],
    premolar: ['Premolars', 'अग्रचर्वणक', 'Teeth with two points that crush and grind food. 8 in all. Milk teeth have no premolars.', 'दो उभार वाले दाँत जो भोजन कुचलते और पीसते हैं। कुल 8। दूध के दाँतों में अग्रचर्वणक नहीं होते।'],
    molar: ['Molars', 'चर्वणक', 'The big flat back teeth that grind food finely. 12 in an adult, including 4 wisdom teeth that come last.', 'पीछे के बड़े चपटे दाँत जो भोजन को बारीक पीसते हैं। वयस्क में 12, जिनमें सबसे बाद में आने वाली 4 अक़्ल दाढ़ें भी हैं।'],
  };
  const milkInfo = {
    incisor: 'Milk incisors: 8 in all. They begin to fall at about 6 years, and permanent teeth grow in their place.|दूध के कृंतक: कुल 8। ये लगभग 6 वर्ष की आयु में गिरने लगते हैं, और उनकी जगह स्थायी दाँत उगते हैं।',
    canine: 'Milk canines: 4 in all, for tearing food.|दूध के रदनक: कुल 4, भोजन फाड़ने के लिए।',
    molar: 'Milk molars: 8 in all. Permanent premolars later grow in their place.|दूध की दाढ़ें: कुल 8। बाद में उनकी जगह स्थायी अग्रचर्वणक उगते हैं।',
  };
  const toothParts = (set, tab) => [...new Set(set.types)].map((ty) => {
    const [en, hi, ie, ih] = toothInfo[ty];
    const pos = archPos(set.sizes, 2.5), k = set.types.lastIndexOf(ty);
    const mi = tab === 'milk' ? milkInfo[ty].split('|') : [ie, ih];
    return P(ty, en, hi, mi[0], mi[1], [pos[k].x, pos[k].y], archTeeth(set, ty), { l: tab });
  });
  const CROWN = [[146, 170], [136, 120], [144, 72], [170, 52], [192, 62], [210, 56], [228, 62], [250, 52], [276, 72], [284, 120], [274, 170]];
  const DENT = [[156, 172], [150, 124], [158, 88], [176, 74], [194, 82], [210, 78], [226, 82], [244, 74], [262, 88], [270, 124], [264, 172]];
  const ROOT = [[150, 166], [198, 166], [188, 250], [178, 300], [164, 300], [156, 250]];
  const PULP = [[182, 156], [176, 112], [186, 96], [196, 112], [210, 106], [224, 112], [234, 96], [244, 112], [238, 156]];
  SCENES.teeth = {
    name: T2('Teeth', 'दाँत'), about: T2('We get two sets of teeth: 20 milk teeth, then 32 permanent teeth. Each kind has its own job.', 'हमें दाँतों के दो समूह मिलते हैं: 20 दूध के दाँत, फिर 32 स्थायी दाँत। हर प्रकार का अपना काम है।'),
    vb: [0, 0, 420, 340], tabs: true, note: T2('Upper jaw seen from below, front teeth at the top. The lower jaw has the same set.', 'ऊपरी जबड़ा नीचे से देखा गया, आगे के दाँत ऊपर। निचले जबड़े में भी यही समूह होता है।'),
    layers: [{ id: 'adult', n: T2('Adult teeth', 'स्थायी दाँत') }, { id: 'milk', n: T2('Milk teeth', 'दूध के दाँत') }, { id: 'section', n: T2('Inside a tooth', 'दाँत के अंदर') }],
    defs: '<pattern id="by-spongy" patternUnits="userSpaceOnUse" width="24" height="20"><rect width="24" height="20" fill="#EAD9B8"/><circle cx="6" cy="6" r="3.4" fill="#D9C39A"/><circle cx="17" cy="14" r="4" fill="#D9C39A"/></pattern>',
    bg: (st) => (st.layers.has('section') ? '' : `<ellipse cx="210" cy="282" rx="100" ry="170" fill="#FAD1DD"/><path d="${GUM_ARC}" fill="none" stroke="#F49AB0" stroke-width="44" stroke-linecap="round"/><path d="M210 140V320" stroke="#F49AB0" stroke-width="3" stroke-dasharray="4 6"/>`),
    caps: [[210, 214, T2('upper jaw: 16 teeth', 'ऊपरी जबड़ा: 16 दाँत'), 'middle', 'adult'], [210, 234, T2('with the lower jaw: 32', 'निचले जबड़े सहित: 32'), 'middle', 'adult'], [210, 214, T2('upper jaw: 10 milk teeth', 'ऊपरी जबड़ा: 10 दूध के दाँत'), 'middle', 'milk'], [210, 234, T2('with the lower jaw: 20', 'निचले जबड़े सहित: 20'), 'middle', 'milk']],
    parts: [
      ...toothParts(ADULT, 'adult'), ...toothParts(MILK, 'milk'),
      P('jawbone', 'Jaw bone', 'जबड़े की हड्डी', 'The roots sit firmly in sockets in the jaw bone.', 'जड़ें जबड़े की हड्डी के गड्ढों में मज़बूती से टिकी होती हैं।', [60, 300], '<rect x="30" y="196" width="360" height="144" rx="10" fill="url(#by-spongy)" stroke="#B9A27E" stroke-width="1.5"/>', { l: 'section' }),
      P('cement', 'Cement', 'सीमेंटम', 'A thin bony layer that covers the root and fixes it to the jaw.', 'एक पतली हड्डी जैसी परत जो जड़ को ढकती है और उसे जबड़े से जोड़ती है।', [130, 268], both(`<path d="${smooth(ROOT)}" fill="#FDE7B0" stroke="#B98B4E" stroke-width="4"/>`, 210), { l: 'section' }),
      P('gum', 'Gum', 'मसूड़ा', 'Soft pink flesh around the neck of the tooth. Brushing keeps it healthy.', 'दाँत की गर्दन के चारों ओर मुलायम गुलाबी मांस। ब्रश करने से यह स्वस्थ रहता है।', [70, 170], both(blob([[30, 150], [110, 140], [140, 152], [148, 178], [142, 208], [30, 208]], '#F49AB0', '#BE185D'), 210), { l: 'section' }),
      P('enamel', 'Enamel', 'इनैमल (दंतवल्क)', 'The hard white coat of the crown, the hardest substance in the body. Acid made by germs from sugar can dissolve it and cause decay.', 'शिखर की सख़्त सफ़ेद परत, शरीर का सबसे कठोर पदार्थ। चीनी से रोगाणुओं का बनाया अम्ल इसे घोलकर सड़न कर सकता है।', [320, 80], blob(CROWN, '#FFFFFF', '#94A3B8', 2), { l: 'section' }),
      P('dentine', 'Dentine', 'डेंटीन (दंतधातु)', 'The yellowish layer under the enamel that makes up most of the tooth. It is a little softer than enamel.', 'इनैमल के नीचे की पीली परत जिससे दाँत का अधिकतर भाग बनता है। यह इनैमल से थोड़ी नरम होती है।', [100, 110], `<path d="${smooth(DENT)}" fill="#FDE7B0" stroke="#D9B26A" stroke-width="1.2"/>`, { l: 'section' }),
      P('pulp', 'Pulp', 'मज्जा (दंत मज्जा)', 'The soft living centre of the tooth, with nerves and blood vessels. Decay that reaches it causes toothache.', 'दाँत का नरम जीवित केंद्र, जिसमें तंत्रिकाएँ और रक्त वाहिकाएँ हैं। सड़न इस तक पहुँचे तो दाँत दर्द होता है।', [210, 128], blob(PULP, '#F9A8B8', '#BE185D') + both(tube('M186 156L172 294', 5, '#F9A8B8', '#BE185D'), 210), { l: 'section' }),
      P('nerve', 'Nerve and blood vessels', 'तंत्रिका और रक्त वाहिकाएँ', 'They enter through a tiny hole at the tip of each root to feed the tooth and let it feel.', 'ये हर जड़ के सिरे के छोटे छिद्र से अंदर आती हैं, दाँत को पोषण देने और महसूस कराने के लिए।', [150, 330], both(line('M184 150L172 296C170 310 160 322 140 332', 1.6, '#DC2626') + line('M188 150L176 296C176 312 176 324 180 336', 1.6, '#E8A317'), 210), { l: 'section' }),
      P('crown', 'Crown', 'शिखर (मुकुट)', 'The part of the tooth we can see, above the gum.', 'दाँत का वह भाग जो मसूड़े के ऊपर दिखाई देता है।', [322, 112], '<path d="M300 56H312V146H300" fill="none" stroke="#475569" stroke-width="2.4"/>' + hit('M306 56V146', 22), { l: 'section' }),
      P('root', 'Root', 'जड़ (मूल)', 'The part hidden inside the jaw, which holds the tooth in place. Molars have two or three roots.', 'जबड़े के अंदर छिपा भाग, जो दाँत को जगह पर थामता है। दाढ़ों में दो या तीन जड़ें होती हैं।', [322, 236], '<path d="M300 160H312V300H300" fill="none" stroke="#475569" stroke-width="2.4"/>' + hit('M306 160V300', 22), { l: 'section' }),
    ],
  };

  // ENDOCRINE --------------------------------------------------------
  SCENES.endocrine = {
    name: T2('Endocrine glands', 'अंतःस्रावी ग्रंथियाँ'), about: T2('Glands without tubes pour chemical messengers, hormones, straight into the blood.', 'बिना नली वाली ग्रंथियाँ रासायनिक संदेशवाहक, हार्मोन, सीधे रक्त में डालती हैं।'),
    vb: [110, 14, 260, 486], body: true, tabs: true, note: BODY_NOTE,
    layers: [{ id: 'female', n: T2('Female', 'स्त्री') }, { id: 'male', n: T2('Male', 'पुरुष') }],
    bg: (st) => figure() + `<path d="${smooth(BRAIN_IN_HEAD)}" fill="#F4A7B9" opacity=".35"/>` + blob(BEAN.map(([x, y]) => [204 - x, 346 + y]), '#E7B0B0', '#C08080', 1) + blob(BEAN.map(([x, y]) => [276 + x, 338 + y]), '#E7B0B0', '#C08080', 1) + (st.layers.has('female') ? `<path d="${smooth([[226, 404], [254, 404], [252, 426], [240, 440], [228, 426]])}" fill="#FBCFE8" opacity=".7"/>` : `<path d="${smooth([[222, 462], [258, 462], [262, 482], [240, 494], [218, 482]])}" fill="#F2C6AE" stroke="#D99A80"/>`),
    parts: [
      P('hypothalamus', 'Hypothalamus', 'हाइपोथैलेमस', 'A part of the brain that links the nerves with the hormones. Its releasing hormones tell the pituitary what to do.', 'मस्तिष्क का भाग जो तंत्रिकाओं को हार्मोनों से जोड़ता है। इसके मोचक हार्मोन पीयूष ग्रंथि को बताते हैं कि क्या करना है।', [276, 48], blob([[228, 60], [240, 56], [246, 64], [238, 70], [228, 68]], '#F472B6', '#9D174D')),
      P('pineal', 'Pineal gland', 'पीनियल ग्रंथि', 'A tiny gland deep in the brain. Its hormone melatonin helps control sleep and waking.', 'मस्तिष्क में गहरी एक छोटी ग्रंथि। इसका हार्मोन मेलाटोनिन सोने और जागने को नियंत्रित करने में मदद करता है।', [282, 34], '<path d="M250 48L256 56L248 58Z" fill="#14B8A6" stroke="#0F766E" stroke-width="1.2"/><circle cx="251" cy="54" r="9" fill="transparent"/>'),
      P('pituitary', 'Pituitary gland', 'पीयूष ग्रंथि', 'The master gland. Its growth hormone controls how we grow (too little causes dwarfism), and it controls many other glands.', 'मुख्य ग्रंथि। इसका वृद्धि हार्मोन हमारी बढ़त नियंत्रित करता है (कमी से बौनापन होता है), और यह कई दूसरी ग्रंथियों को नियंत्रित करती है।', [200, 82], '<path d="M238 70L238 74" stroke="#7E22CE" stroke-width="2"/><circle cx="238" cy="78" r="4.6" fill="#A855F7" stroke="#6B21A8" stroke-width="1.2"/><circle cx="238" cy="78" r="10" fill="transparent"/>'),
      P('thyroid', 'Thyroid gland', 'थायरॉइड ग्रंथि', 'A butterfly-shaped gland in the neck. Its hormone thyroxin controls how fast the body uses food. It needs iodine; too little causes goitre, a swollen neck.', 'गर्दन में तितली के आकार की ग्रंथि। इसका हार्मोन थायरॉक्सिन नियंत्रित करता है कि शरीर भोजन का कितनी तेज़ी से उपयोग करे। इसे आयोडीन चाहिए; कमी से घेंघा होता है।', [276, 140], both(blob([[226, 128], [233, 126], [237, 138], [233, 148], [225, 146], [221, 138]], '#F97316', '#9A3412')) + '<rect x="234" y="137" width="12" height="5" rx="2" fill="#F97316"/>'),
      P('parathyroid', 'Parathyroid glands', 'पैराथायरॉइड ग्रंथियाँ', 'Four tiny glands behind the thyroid. Their hormone keeps the right amount of calcium in the blood and bones.', 'थायरॉइड के पीछे चार छोटी ग्रंथियाँ। इनका हार्मोन रक्त और हड्डियों में कैल्शियम की सही मात्रा बनाए रखता है।', [200, 132], both('<circle cx="224" cy="131" r="2.8" fill="#FACC15" stroke="#854D0E"/><circle cx="224" cy="145" r="2.8" fill="#FACC15" stroke="#854D0E"/><circle cx="224" cy="138" r="9" fill="transparent"/>')),
      P('thymus', 'Thymus', 'थाइमस ग्रंथि', 'In the upper chest. It is large in children and helps train white blood cells to fight germs; it shrinks after the teens.', 'ऊपरी छाती में। यह बच्चों में बड़ी होती है और श्वेत रक्त कोशिकाओं को रोगाणुओं से लड़ना सिखाने में मदद करती है; किशोरावस्था के बाद यह छोटी हो जाती है।', [276, 186], `<ellipse cx="234" cy="186" rx="7" ry="13" fill="#4ADE80" stroke="#15803D" stroke-width="1.4"/><ellipse cx="246" cy="188" rx="7" ry="12" fill="#4ADE80" stroke="#15803D" stroke-width="1.4"/>`),
      P('adrenal', 'Adrenal glands', 'अधिवृक्क ग्रंथियाँ', 'Caps on top of the kidneys. Adrenaline gets the body ready to face danger: the heart beats faster and we breathe faster.', 'वृक्कों के ऊपर टोपी जैसी ग्रंथियाँ। एड्रीनलिन शरीर को ख़तरे के लिए तैयार करता है: दिल तेज़ धड़कता है और साँस तेज़ होती है।', [182, 312], '<path d="M196 318L204 304L216 316Z" fill="#FB7185" stroke="#9F1239" stroke-width="1.4"/><path d="M284 310L276 296L264 308Z" fill="#FB7185" stroke="#9F1239" stroke-width="1.4"/>'),
      P('pancreas', 'Pancreas', 'अग्न्याशय', 'Besides digestive juice it makes insulin, which controls the sugar in the blood. Too little insulin causes diabetes.', 'पाचक रस के अलावा यह इंसुलिन बनाता है, जो रक्त में शर्करा को नियंत्रित करता है। इंसुलिन की कमी से मधुमेह होता है।', [300, 362], blob([[222, 356], [232, 350], [262, 348], [290, 340], [302, 344], [294, 354], [262, 362], [236, 366]], '#EAB308', '#854D0E')),
      P('ovary', 'Ovaries', 'अंडाशय', 'They make oestrogen, which brings the changes of puberty in girls, and they release eggs.', 'ये एस्ट्रोजन बनाते हैं, जो लड़कियों में यौवनारंभ के बदलाव लाता है, और अंडे छोड़ते हैं।', [194, 420], '<ellipse cx="214" cy="414" rx="8" ry="5" fill="#EC4899" stroke="#9D174D" stroke-width="1.3"/><ellipse cx="266" cy="414" rx="8" ry="5" fill="#EC4899" stroke="#9D174D" stroke-width="1.3"/><circle cx="214" cy="414" r="11" fill="transparent"/><circle cx="266" cy="414" r="11" fill="transparent"/>', { l: 'female' }),
      P('testis', 'Testes', 'वृषण', 'They make testosterone, which brings the changes of puberty in boys, such as a deeper voice and facial hair, and they make sperm.', 'ये टेस्टोस्टेरोन बनाते हैं, जो लड़कों में यौवनारंभ के बदलाव लाता है, जैसे भारी आवाज़ और चेहरे पर बाल, और शुक्राणु बनाते हैं।', [282, 480], '<ellipse cx="231" cy="478" rx="6" ry="9" fill="#60A5FA" stroke="#1E40AF" stroke-width="1.3"/><ellipse cx="249" cy="478" rx="6" ry="9" fill="#60A5FA" stroke="#1E40AF" stroke-width="1.3"/>', { l: 'male' }),
    ],
  };

  // REPRODUCTIVE -----------------------------------------------------
  SCENES.reproductive = {
    name: T2('Reproductive system', 'जनन तंत्र'), about: T2('The organs that make it possible for new life to begin. They become fully active at puberty.', 'वे अंग जिनसे नए जीवन का आरंभ संभव होता है। ये यौवनारंभ पर पूरी तरह सक्रिय होते हैं।'),
    vb: [0, 20, 420, 330], tabs: true, note: T2('A simple diagram seen from the front, labels only.', 'सामने से देखा गया सरल चित्र, केवल नामांकन।'),
    layers: [{ id: 'female', n: T2('Female', 'स्त्री') }, { id: 'male', n: T2('Male', 'पुरुष') }],
    parts: [
      P('oviduct', 'Oviducts (fallopian tubes)', 'अंडवाहिनियाँ', 'Two tubes from near the ovaries to the uterus. An egg travels along one; this is where it may be fertilised.', 'अंडाशयों के पास से गर्भाशय तक दो नलियाँ। अंडा इनमें से एक में चलता है; यहीं उसका निषेचन हो सकता है।', [92, 76], both(tube(smooth([[168, 124], [140, 110], [110, 104], [86, 112], [70, 130]], false), 7, '#FBCFE8', '#BE185D') + '<path d="M70 130L56 136M70 130L58 146M70 130L66 150M70 130L74 150" stroke="#BE185D" stroke-width="2.2" stroke-linecap="round"/>', 210), { l: 'female' }),
      P('ovary', 'Ovaries', 'अंडाशय', 'Two small organs that hold eggs. From puberty, usually one egg is released each month. They also make hormones.', 'दो छोटे अंग जिनमें अंडे होते हैं। यौवनारंभ से आमतौर पर हर महीने एक अंडा निकलता है। ये हार्मोन भी बनाते हैं।', [44, 190], both('<path d="M110 160L156 150" stroke="#DB2777" stroke-width="2" stroke-dasharray="3 3"/>' + blob([[70, 158], [90, 146], [114, 152], [116, 168], [94, 176], [72, 170]], '#F472B6', '#9D174D') + '<circle cx="86" cy="160" r="3" fill="#FCE7F3"/><circle cx="100" cy="164" r="2.4" fill="#FCE7F3"/>', 210), { l: 'female' }),
      P('uterus', 'Uterus', 'गर्भाशय', 'A hollow, muscular organ shaped like an upside-down pear. A baby grows here for about nine months.', 'उल्टी नाशपाती के आकार का खोखला, पेशीय अंग। यहाँ शिशु लगभग नौ महीने बढ़ता है।', [290, 180], blob([[170, 112], [250, 112], [264, 136], [252, 190], [232, 230], [222, 244], [198, 244], [188, 230], [168, 190], [156, 136]], '#F9A8D4', '#BE185D', 1.8) + '<path d="M184 128L236 128L214 196L206 196Z" fill="#FCE7F3" opacity=".9"/>', { l: 'female' }),
      P('cervix', 'Cervix', 'गर्भाशय ग्रीवा', 'The narrow neck at the lower end of the uterus.', 'गर्भाशय के निचले सिरे की संकरी गर्दन।', [282, 254], '<path d="M198 244L222 244L226 264L194 264Z" fill="#F472B6" stroke="#BE185D" stroke-width="1.4"/>', { l: 'female' }),
      P('vagina', 'Vagina', 'योनि', 'The muscular passage from the cervix to the outside of the body. It is also the birth canal.', 'गर्भाशय ग्रीवा से शरीर के बाहर तक पेशीय मार्ग। यही जन्म मार्ग भी है।', [264, 312], '<path d="M194 264L226 264L230 336Q210 346 190 336Z" fill="#FBCFE8" stroke="#BE185D" stroke-width="1.6"/>', { l: 'female' }),
      P('spermduct', 'Sperm ducts', 'शुक्राणु वाहिनियाँ', 'Two tubes that carry sperm from the testes up and round to the urethra.', 'दो नलियाँ जो शुक्राणुओं को वृषणों से ऊपर घुमाकर मूत्रमार्ग तक ले जाती हैं।', [74, 150], both(tube(smooth([[168, 238], [140, 200], [128, 150], [140, 108], [170, 96], [192, 118], [204, 146]], false), 4.5, '#93C5FD', '#1D4ED8'), 210), { l: 'male' }),
      P('bladder', 'Urinary bladder', 'मूत्राशय', 'It stores urine. It is not a reproductive organ, but in males urine and sperm leave through the same urethra (never at the same time).', 'यह मूत्र जमा करता है। यह जनन अंग नहीं है, पर पुरुषों में मूत्र और शुक्राणु एक ही मूत्रमार्ग से निकलते हैं (कभी एक साथ नहीं)।', [314, 70], blob([[170, 60], [250, 60], [266, 90], [250, 122], [170, 122], [154, 90]], '#FDE68A', '#A16207'), { l: 'male' }),
      P('seminal', 'Seminal vesicles', 'शुक्राशय', 'Two glands behind the bladder that add a sugary fluid which gives sperm energy.', 'मूत्राशय के पीछे दो ग्रंथियाँ जो शर्करा वाला द्रव मिलाती हैं जिससे शुक्राणुओं को ऊर्जा मिलती है।', [110, 120], both(blob([[150, 114], [172, 116], [180, 134], [164, 142], [148, 132]], '#C4B5FD', '#6D28D9'), 210), { l: 'male' }),
      P('prostate', 'Prostate gland', 'प्रोस्टेट ग्रंथि', 'A gland below the bladder, around the urethra, that adds fluid to the sperm.', 'मूत्राशय के नीचे, मूत्रमार्ग के चारों ओर एक ग्रंथि जो शुक्राणुओं में द्रव मिलाती है।', [300, 152], '<ellipse cx="210" cy="152" rx="26" ry="15" fill="#A78BFA" stroke="#5B21B6" stroke-width="1.6"/>', { l: 'male' }),
      P('scrotum', 'Scrotum', 'वृषणकोश', 'A bag of skin that holds the testes outside the body, where it is a little cooler; sperm need this.', 'त्वचा की थैली जो वृषणों को शरीर के बाहर थोड़ी ठंडी जगह रखती है; शुक्राणुओं को इसकी ज़रूरत होती है।', [94, 270], blob([[140, 204], [280, 204], [292, 252], [262, 300], [210, 312], [158, 300], [128, 252]], '#F2C6AE', '#C98F6E', 1.6), { l: 'male' }),
      P('testis', 'Testes', 'वृषण', 'Two oval organs that make sperm from puberty, and the hormone testosterone.', 'दो अंडाकार अंग जो यौवनारंभ से शुक्राणु बनाते हैं, और हार्मोन टेस्टोस्टेरोन।', [96, 230], both('<ellipse cx="172" cy="258" rx="20" ry="26" fill="#F0A1B8" stroke="#BE185D" stroke-width="1.6"/><path d="M160 238C150 248 152 270 164 282" fill="none" stroke="#DB2777" stroke-width="4" stroke-linecap="round"/>', 210), { l: 'male' }),
      P('penis', 'Penis', 'शिश्न', 'The organ through which the urethra passes to the outside.', 'वह अंग जिससे होकर मूत्रमार्ग बाहर तक जाता है।', [300, 292], blob([[194, 176], [226, 176], [230, 318], [210, 338], [190, 318]], '#F4B79A', '#B9785F', 1.6), { l: 'male' }),
      P('urethra', 'Urethra', 'मूत्रमार्ग', 'The tube from the bladder through the penis to the outside.', 'मूत्राशय से शिश्न होकर बाहर तक जाने वाली नली।', [148, 330], tube('M210 120L210 334', 4, '#FDE68A', '#A16207'), { l: 'male' }),
    ],
  };

  // IMMUNE -----------------------------------------------------------
  const NODES = [[226, 140], [221, 152], [176, 214], [182, 225], [212, 440], [220, 450], [148, 318], [210, 566], [236, 350], [246, 360], [240, 370]];
  SCENES.immune = {
    name: T2('Immune system', 'प्रतिरक्षा तंत्र'), about: T2('White blood cells, the lymph system and some organs work together to find and destroy germs.', 'श्वेत रक्त कोशिकाएँ, लसीका तंत्र और कुछ अंग मिलकर रोगाणुओं को खोजते और नष्ट करते हैं।'),
    vb: [60, 10, 360, 720], body: true, note: BODY_NOTE,
    layers: [{ id: 'lymph', n: T2('Lymph system', 'लसीका तंत्र'), on: true }, { id: 'organs', n: T2('Organs', 'अंग'), on: true }, { id: 'cells', n: T2('Zoom: germ fighters', 'ज़ूम: रोगाणु से लड़ने वाले'), on: false }],
    bg: () => figure(),
    parts: [
      P('lymphvessels', 'Lymph vessels', 'लसीका वाहिकाएँ', 'Thin tubes that collect a clear liquid, lymph, from around the cells and return it to the blood.', 'पतली नलियाँ जो कोशिकाओं के आसपास से एक साफ़ द्रव, लसीका, इकट्ठा करके रक्त में लौटाती हैं।', [128, 380], '', { l: 'lymph' }),
      P('nodes', 'Lymph nodes', 'लसीका ग्रंथियाँ', 'Bean-shaped filters along the lymph vessels, in the neck, armpits and groin. They trap germs; they swell when we are ill.', 'लसीका वाहिकाओं पर सेम जैसे छन्ने, गर्दन, बगल और जाँघ के जोड़ में। ये रोगाणु पकड़ते हैं; बीमारी में सूज जाते हैं।', [176, 236], both(NODES.map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="4.6" ry="3.4" fill="#22C55E" stroke="#14532D" stroke-width="1.2"/><circle cx="${x}" cy="${y}" r="9" fill="transparent"/>`).join('')), { l: 'lymph' }),
      P('tonsils', 'Tonsils', 'टॉन्सिल', 'Two lumps of lymph tissue at the back of the throat that catch germs coming in through the mouth and nose.', 'गले के पीछे लसीका ऊतक के दो उभार जो मुँह और नाक से आने वाले रोगाणुओं को पकड़ते हैं।', [276, 100], '<ellipse cx="232" cy="104" rx="4" ry="6" fill="#F472B6" stroke="#9D174D" stroke-width="1.2"/><ellipse cx="248" cy="104" rx="4" ry="6" fill="#F472B6" stroke="#9D174D" stroke-width="1.2"/><rect x="224" y="94" width="32" height="20" fill="transparent"/>', { l: 'organs' }),
      P('thymus', 'Thymus', 'थाइमस', 'Here some white blood cells (T cells) learn to tell germs from the body\'s own cells. It is most active in children.', 'यहाँ कुछ श्वेत रक्त कोशिकाएँ (T कोशिकाएँ) रोगाणुओं और शरीर की अपनी कोशिकाओं में अंतर करना सीखती हैं। यह बच्चों में सबसे सक्रिय होता है।', [276, 186], `<ellipse cx="234" cy="186" rx="7" ry="13" fill="#4ADE80" stroke="#15803D" stroke-width="1.4"/><ellipse cx="246" cy="188" rx="7" ry="12" fill="#4ADE80" stroke="#15803D" stroke-width="1.4"/>`, { l: 'organs' }),
      P('spleen', 'Spleen', 'प्लीहा (तिल्ली)', 'An organ on the left of the belly that filters the blood, removes old red cells and stores white blood cells.', 'पेट के बाईं ओर का अंग जो रक्त छानता है, पुरानी लाल कोशिकाएँ हटाता है और श्वेत रक्त कोशिकाएँ जमा रखता है।', [318, 318], blob([[278, 300], [296, 296], [306, 312], [300, 334], [284, 336], [280, 318]], '#9333EA', '#581C87'), { l: 'organs' }),
      P('marrow', 'Bone marrow', 'अस्थि मज्जा', 'The soft red tissue inside bones that makes all our blood cells, including the white blood cells.', 'हड्डियों के अंदर का नरम लाल ऊतक जो हमारी सभी रक्त कोशिकाएँ बनाता है, श्वेत रक्त कोशिकाएँ भी।', [272, 500], both(`<g opacity=".9">${bone(194, 438, 206, 562, 9.5)}</g><path d="M196 452L204 548" stroke="#DC2626" stroke-width="4" stroke-linecap="round"/>`), { l: 'organs' }),
    ],
    zoom: {
      layer: 'cells', title: T2('Zoom: white blood cells at work', 'ज़ूम: काम करती श्वेत रक्त कोशिकाएँ'), vb: [0, 0, 320, 170],
      draw: (st, t) => { const k = st.eat || 0, gx = 156 - 62 * k, gy = 96 - 4 * k; const arm = 10 + 24 * Math.sin(Math.min(1, k * 1.4) * Math.PI / 2); return `<g class="by-part" data-key="part:phagocyte" data-id="phagocyte" role="button" tabindex="0" aria-label="${esc(t(T2('Phagocyte', 'भक्षक कोशिका')))}"><path d="${smooth([[50, 70], [80, 50], [112, 60], [118 + arm, 76], [100 + arm * 0.6, 96], [120 + arm, 116], [100, 134], [60, 132], [36, 104]])}" fill="#BFDBFE" stroke="#1D4ED8" stroke-width="1.8"/><path d="M62 92C70 82 80 86 78 96C88 98 86 110 76 108C70 116 58 110 62 102" fill="#6366F1"/></g>
        <g class="by-part" data-key="part:germ" data-id="germ" role="button" tabindex="0" aria-label="${esc(t(T2('Germ', 'रोगाणु')))}" opacity="${r1(1 - Math.max(0, k - 0.7) / 0.3 * 0.8)}"><rect x="${r1(gx - 12)}" y="${r1(gy - 5)}" width="24" height="10" rx="5" fill="#84CC16" stroke="#3F6212" stroke-width="1.4"/></g>
        <g class="by-static"><rect x="196" y="140" width="22" height="9" rx="4.5" fill="#84CC16" stroke="#3F6212" stroke-width="1.2" transform="rotate(-20 207 144)"/><rect x="270" y="150" width="22" height="9" rx="4.5" fill="#84CC16" stroke="#3F6212" stroke-width="1.2"/></g>
        <g class="by-part" data-key="part:lymphocyte" data-id="lymphocyte" role="button" tabindex="0" aria-label="${esc(t(T2('Lymphocyte', 'लसीकाणु')))}"><circle cx="248" cy="56" r="24" fill="#DDD6FE" stroke="#6D28D9" stroke-width="1.8"/><circle cx="248" cy="56" r="17" fill="#7C3AED"/></g>
        <g class="by-part" data-key="part:antibody" data-id="antibody" role="button" tabindex="0" aria-label="${esc(t(T2('Antibodies', 'प्रतिरक्षी')))}">${[[210, 118], [236, 128], [282, 132], [262, 108]].map(([x, y]) => `<path d="M${x} ${y + 8}V${y}L${x - 6} ${y - 7}M${x} ${y}L${x + 6} ${y - 7}" fill="none" stroke="#F59E0B" stroke-width="2.6" stroke-linecap="round"/>`).join('')}<rect x="198" y="96" width="94" height="44" fill="transparent"/></g>`; },
      parts: [
        P('phagocyte', 'Phagocyte', 'भक्षक कोशिका', 'A white blood cell that flows around a germ, swallows it and digests it.', 'एक श्वेत रक्त कोशिका जो रोगाणु के चारों ओर फैलकर उसे निगलती और पचा देती है।', [70, 30]),
        P('germ', 'Germ', 'रोगाणु', 'Bacteria and viruses that cause disease when they get into the body.', 'जीवाणु और विषाणु जो शरीर में घुसकर रोग पैदा करते हैं।', [160, 76]),
        P('lymphocyte', 'Lymphocyte', 'लसीकाणु (लिम्फोसाइट)', 'A white blood cell that makes antibodies. It remembers a germ, so the next time the body fights back faster; vaccines work this way.', 'एक श्वेत रक्त कोशिका जो प्रतिरक्षी बनाती है। यह रोगाणु को याद रखती है, इसलिए अगली बार शरीर तेज़ी से लड़ता है; टीके इसी तरह काम करते हैं।', [248, 98]),
        P('antibody', 'Antibodies', 'प्रतिरक्षी (एंटीबॉडी)', 'Y-shaped proteins that stick to one kind of germ and mark it for destruction.', 'Y आकार के प्रोटीन जो एक प्रकार के रोगाणु से चिपककर उसे नष्ट करने के लिए चिह्नित करते हैं।', [300, 100]),
      ],
    },
    playName: T2('Catch a germ', 'रोगाणु पकड़ो'), playLayer: 'cells', playMs: 4500,
    anim: (k, st) => { st.eat = Math.min(1, k * 1.15); },
  };
  SCENES.immune.parts[0].d = line('M226 92C226 120 228 150 232 176M232 176C208 178 182 184 168 196C156 220 150 260 144 300C140 340 132 380 126 420M244 400C230 420 216 440 210 480C206 530 206 600 204 690M254 92C254 120 252 150 248 176M248 176C272 178 298 184 312 196C324 220 330 260 336 300C340 340 348 380 354 420M244 400C258 420 270 440 274 480C278 530 278 600 280 690M244 400L246 260C248 220 254 196 262 178', 2.4, '#16A34A');

  // ---------------------------------------------------------------- the view
  const SYSTEMS = Object.keys(SCENES);
  const FLOWS = ['food', 'air', 'blood', 'urine', 'signal'];
  const TASKS = ['explore', 'label', 'trace', 'order'];
  const DEF_FLOW = {};
  SYSTEMS.forEach((k) => { if (SCENES[k].flows) DEF_FLOW[k] = Object.keys(SCENES[k].flows)[0]; });
  const effFlow = (c) => c.flow || (c.task === 'trace' || c.task === 'order' ? DEF_FLOW[c.system] : null) || null;
  const partsOf = (sc) => sc.parts.concat(sc.zoom ? sc.zoom.parts : []);
  const uniq = (a) => [...new Set(a)];
  const DEFS = '<linearGradient id="by-skin" gradientUnits="userSpaceOnUse" x1="140" y1="0" x2="340" y2="0"><stop offset="0" stop-color="#F0BC9E"/><stop offset=".5" stop-color="#FFE6D5"/><stop offset="1" stop-color="#F0BC9E"/></linearGradient>'
    + '<radialGradient id="by-sheen" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".5" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></radialGradient>'
    + '<pattern id="by-musc" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(75)"><rect width="6" height="6" fill="#D9434F"/><path d="M0 1.6H6" stroke="#EF7B85" stroke-width="1.2"/></pattern>'
    + '<marker id="by-arr" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#0F172A"/></marker>';
  const ICON_BODY = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="6.5" r="4.2" fill="#fff"/><path d="M8.5 12.5h15l-2.4 9h-2.3l-1 8.5h-3.6l-1-8.5h-2.3z" fill="#fff"/><path d="M15.4 15c-2.4-1.6-4.6.4-3.6 2.6.8 1.8 3.6 3.2 4.2 3.8.6-.6 3.4-2 4.2-3.8 1-2.2-1.2-4.2-3.6-2.6l-.6.5z" fill="#FF6B57"/></svg>';
  const PLAY_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3l12 7-12 7z" fill="currentColor"/></svg>';
  const TURN_ICON = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 10a6 6 0 1 0 2-4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 2.5v4.5h4.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  const U = {
    tap: T2('Tap any part of the picture to see its name and what it does.', 'चित्र के किसी भी भाग पर टैप करो और उसका नाम व काम जानो।'),
    play: T2('Press the red button to follow the journey.', 'यात्रा देखने के लिए लाल बटन दबाओ।'),
    follow: T2('Follow the ', 'रास्ता देखो: '), playing: T2('Playing…', 'चल रहा है…'), again: T2('Play the journey', 'यात्रा चलाओ'),
    names: T2('Names', 'नाम'), front: T2('Front view: turn round', 'सामने से: पीछे घुमाओ'), back: T2('Back view: turn to the front', 'पीछे से: सामने घुमाओ'),
    step: T2('Step', 'चरण'), of: T2('of', 'में से'), done: T2('Journey complete', 'यात्रा पूरी'),
    find: T2('Find and tap:', 'ढूँढो और टैप करो:'), right: T2('Right!', 'सही!'), thatIs: T2('That is the ', 'यह है: '), tryAgain: T2('Try again.', 'फिर कोशिश करो।'),
    hint: T2('Look for the glowing part.', 'चमकते भाग को देखो।'), allFound: T2('All found!', 'सब मिल गए!'), score: T2('Found first time: ', 'पहली बार में सही: '),
    next: T2('Where does it go next? Tap it.', 'यह आगे कहाँ जाता है? उस पर टैप करो।'), notThere: T2('Not that one: ', 'वह नहीं: '),
    order: T2('Put the journey in order: tap the yellow cards one by one to fill boxes 1, 2, 3… Tap a box to take a card back.', 'यात्रा को क्रम में लगाओ: पीले कार्डों पर एक-एक करके टैप करो और 1, 2, 3… खाने भरो। कार्ड वापस लेने के लिए खाने पर टैप करो।'),
    check: T2('Check', 'जाँचो'), fill: T2('Fill every box first.', 'पहले हर खाना भरो।'), wrongN: T2(' are in the wrong place (red). Tap them to take them back.', ' ग़लत जगह पर हैं (लाल)। उन्हें वापस लेने के लिए टैप करो।'),
    solved: T2('Perfect order! Watch the journey.', 'बिलकुल सही क्रम! अब यात्रा देखो।'), looked: T2('Looked at: ', 'देखा: '), photo: T2('A real view', 'असली रूप'),
    box: T2('Box', 'खाना'), empty: T2('empty', 'ख़ाली'),
  };

  function view(root, cfg, api) {
    const sc = SCENES[cfg.system];
    const task = cfg.task || 'explore';
    const flowId = effFlow(cfg);
    const flow = flowId ? sc.flows[flowId] : null;
    const t = (x) => api.t(x);
    const lang = () => (api.lang ? api.lang() : 'en');
    const reduced = L.reducedMotion;
    const playable = task === 'explore' && !!(flow || sc.anim);
    const S = {
      view: 'front', layers: new Set(sc.tabs ? [sc.layers[0].id] : sc.layers.filter((l) => l.on).map((l) => l.id)),
      names: false, sel: null, done: new Set(), bad: null, hint: null, msg: null,
      step: -1, reached: new Set(), tok: null, trail: [], playing: false, moving: false, miss: 0, quiz: null, ord: null,
    };
    let raf = 0, alive = true, timers = [], ro = null, lastW = 0;
    const jobs = new Set();
    const later = (f, ms) => { const id = setTimeout(() => { timers = timers.filter((x) => x !== id); if (alive) f(); }, ms); timers.push(id); };
    function loop(now) { raf = 0; if (!alive) return; [...jobs].forEach((j) => j(now)); if (jobs.size) raf = requestAnimationFrame(loop); }
    const addJob = (j) => { jobs.add(j); if (!raf && alive) raf = requestAnimationFrame(loop); };
    const stopAll = () => { jobs.clear(); timers.forEach(clearTimeout); timers = []; if (raf) cancelAnimationFrame(raf); raf = 0; S.playing = false; S.moving = false; };

    const vis = (p) => (!p.v || p.v === S.view) && (!p.l || S.layers.has(p.l));
    const zoomOn = () => !!(sc.zoom && S.layers.has(sc.zoom.layer));
    const visParts = () => sc.parts.filter(vis).concat(zoomOn() ? sc.zoom.parts : []);
    const info = (id) => partsOf(sc).find((p) => p.id === id && (vis(p) || (sc.zoom && sc.zoom.parts.includes(p)))) || partsOf(sc).find((p) => p.id === id);
    const nameOf = (id) => { const p = info(id); return p ? t(p.n) : id; };
    const stepName = (st) => (st.name ? t(st.name) : nameOf(st.p));

    root.innerHTML = `<div class="by">
        <div class="by-head"><span class="by-ico">${ICON_BODY}</span><div><h3 class="by-title">${esc(t(sc.name))}</h3><p class="by-sub">${esc(t(sc.about))}</p></div></div>
        <div class="by-main">
          <div class="by-stage"><svg class="by-svg" viewBox="${sc.vb.join(' ')}" role="group" aria-label="${esc(t(sc.name))}"></svg>${sc.note ? `<p class="by-note">${esc(t(sc.note))}</p>` : ''}</div>
          <div class="by-panel">
            <div class="by-ctrls"></div>
            <div class="by-card" aria-live="polite"></div>
            <div class="by-flow" hidden></div>
            ${task === 'order' ? '<div class="by-order" data-key="answer"></div>' : ''}
            <div class="by-zoom" hidden></div>
            <figure class="by-photo" hidden></figure>
          </div>
        </div>
      </div>`;
    const box = root.querySelector('.by');
    const svg = root.querySelector('.by-svg');
    const $ = (q) => root.querySelector(q);

    // -------- svg
    const svgW = () => (svg.getBoundingClientRect ? svg.getBoundingClientRect().width : 0) || 600;
    const scaleK = (vb, w) => vb[2] / Math.max(160, w);
    const capsM = (caps, vb, w) => {
      if (!caps) return '';
      const fs = clamp(11.5 * scaleK(vb, w), 8, 22);
      return `<g class="by-static">${caps.filter((c) => !c[4] || S.layers.has(c[4])).map(([x, y, txt, a]) => `<text x="${x}" y="${y}" class="by-cap" font-size="${r1(fs)}" text-anchor="${a || 'middle'}">${esc(t(txt))}</text>`).join('')}</g>`;
    };
    const cls = (id) => [S.sel === id ? 'on' : '', S.done.has(id) ? 'done' : '', S.bad === id ? 'bad' : '', S.hint === id ? 'hint' : ''].filter(Boolean).join(' ');
    const partG = (p) => {
      const d = typeof p.d === 'function' ? p.d(S) : p.d || '';
      if (task === 'order') return `<g class="by-part by-static ${cls(p.id)}">${d}</g>`;
      return `<g class="by-part ${cls(p.id)}" data-key="part:${p.id}" data-id="${p.id}" role="button" tabindex="0" aria-label="${esc(t(p.n))}" aria-pressed="${S.sel === p.id}">${d}</g>`;
    };
    const labelSet = () => {
      const ids = new Set();
      if (S.names && task !== 'label' && task !== 'order') visParts().forEach((p) => ids.add(p.id));
      if (S.sel) ids.add(S.sel);
      S.done.forEach((id) => ids.add(id));
      if (task === 'trace') S.reached.forEach((id) => ids.add(id));
      return ids;
    };
    function labelsM(parts, vb, w, side) {
      const ids = labelSet(), [vx, vy, vw, vh] = vb, k = scaleK(vb, w), fs = clamp(12.5 * k, 8.5, 26), lh = fs * 1.7;
      const items = [], seen = new Set();
      parts.forEach((p) => { if (p.at && ids.has(p.id) && !seen.has(p.id)) { seen.add(p.id); items.push(p); } });
      const one = (p, x, y, wd) => `<g class="by-lab ${S.sel === p.id ? 'on' : ''} ${S.done.has(p.id) ? 'done' : ''}" pointer-events="none">${side ? `<line x1="${r1(x < p.at[0] ? x + wd : x)}" y1="${r1(y)}" x2="${p.at[0]}" y2="${p.at[1]}" stroke-width="${r1(k * 1.2)}"/><circle cx="${p.at[0]}" cy="${p.at[1]}" r="${r1(fs * 0.24)}" fill="#334155"/>` : ''}<rect x="${r1(x)}" y="${r1(y - lh / 2 + 1)}" width="${r1(wd)}" height="${r1(lh - 2)}" rx="${r1((lh - 2) / 2)}" stroke-width="${r1(k)}"/><text x="${r1(x + wd / 2)}" y="${r1(y + fs * 0.36)}" font-size="${r1(fs)}" text-anchor="middle">${esc(t(p.n))}</text></g>`;
      const width = (p) => Math.min(vw * 0.62, t(p.n).length * fs * (lang() === 'hi' ? 0.5 : 0.53) + fs * 1.2);
      if (!side) return items.map((p) => { const wd = width(p); return one(p, clamp(p.at[0] - wd / 2, vx + 2, vx + vw - wd - 2), clamp(p.at[1], vy + lh / 2, vy + vh - lh / 2), wd); }).join('');
      const cx = side === true ? vx + vw / 2 : side; let out = '';
      [items.filter((p) => p.at[0] < cx), items.filter((p) => p.at[0] >= cx)].forEach((arr, si) => {
        arr.sort((a, b) => a.at[1] - b.at[1]);
        const lo = vy + lh / 2 + 2, hi = vy + vh - lh / 2 - 2;
        const ys = arr.map((p) => clamp(p.at[1], lo, hi));
        for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + lh + 2);
        const over = ys.length ? ys[ys.length - 1] - hi : 0;
        if (over > 0) { for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.min(ys[i] - (i === ys.length - 1 ? over : 0), i < ys.length - 1 ? ys[i + 1] - lh - 2 : Infinity); }
        arr.forEach((p, i) => { const wd = width(p); out += one(p, si ? vx + vw - 4 - wd : vx + 4, ys[i], wd); });
      });
      return out;
    }
    const trailD = () => S.trail.filter((pl) => pl.length > 1).map((pl) => 'M' + pl.map((q) => `${r1(q[0])} ${r1(q[1])}`).join('L')).join('');
    function tokM(k) {
      if (!S.tok || !flow) return '';
      const tr = clamp(6.5 * k, 4.5, 11);
      return `<g class="by-static"><path id="by-trail" d="${trailD()}" fill="none" stroke="${flow.col}" stroke-width="${r1(tr * 0.55)}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${r1(tr * 0.2)} ${r1(tr * 0.9)}" opacity=".85"/><g id="by-tok" transform="translate(${r1(S.tok.x)} ${r1(S.tok.y)})"><circle r="${r1(tr * 2)}" fill="${S.tok.c}" opacity=".22"/><circle r="${r1(tr)}" fill="${S.tok.c}" stroke="#fff" stroke-width="${r1(tr * 0.32)}"/><circle cx="${r1(-tr * 0.32)}" cy="${r1(-tr * 0.32)}" r="${r1(tr * 0.32)}" fill="#fff" opacity=".85"/></g></g>`;
    }
    // The stage keeps the scene's height in view and widens the viewBox to the stage's shape, so labels have room.
    let VB = sc.vb.slice();
    function fitBox() {
      const w = svgW(), [vx, vy, vw, vh] = sc.vb;
      const hMax = Math.max(300, (typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 900) * 0.74);
      const h = Math.min(hMax, w * vh / vw * 1.0);
      const W = Math.max(vw, vh * w / h);
      VB = [r1(vx - (W - vw) / 2), vy, r1(W), vh];
      svg.setAttribute('viewBox', VB.join(' '));
      svg.style.height = Math.round(h) + 'px';
      return w;
    }
    function drawSvg() {
      const w = fitBox(), k = scaleK(VB, w);
      lastW = w;
      let s = `<defs>${DEFS}${sc.defs || ''}</defs>`;
      if (sc.bg) s += `<g class="by-static">${sc.bg(S)}</g>`;
      sc.parts.forEach((p) => { if (vis(p)) s += partG(p); });
      s += `<g id="by-fg" class="by-static">${sc.fg ? sc.fg(S) : ''}</g>`;
      s += capsM(sc.caps, VB, w) + labelsM(sc.parts.filter(vis), VB, w, sc.vb[0] + sc.vb[2] / 2) + tokM(k);
      svg.innerHTML = s;
      svg.classList.toggle('dim', !!S.sel && !S.names && task !== 'label');
    }
    function placeTok() {
      const g = svg.querySelector('#by-tok'), tr = svg.querySelector('#by-trail');
      if (g && S.tok) g.setAttribute('transform', `translate(${r1(S.tok.x)} ${r1(S.tok.y)})`);
      if (tr) tr.setAttribute('d', trailD());
    }
    // -------- panel
    function renderZoom() {
      const z = sc.zoom, el = $('.by-zoom');
      if (!z || !zoomOn()) { el.hidden = true; el.innerHTML = ''; return; }
      el.hidden = false;
      const zs = el.querySelector('svg'), w = (zs && zs.getBoundingClientRect().width) || 300;
      const inner = (z.bg ? `<g class="by-static">${z.bg(S)}</g>` : '') + (z.draw ? z.draw(S, t) : z.parts.map(partG).join('')) + capsM(z.caps, z.vb, w) + labelsM(z.parts, z.vb, w, false);
      el.innerHTML = `<p class="by-zt"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 12l5 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>${esc(t(z.title))}</p><svg viewBox="${z.vb.join(' ')}" role="group" aria-label="${esc(t(z.title))}">${inner}</svg>${z.caption ? `<p class="by-note" aria-live="polite">${esc(z.caption(S, t))}</p>` : ''}`;
      el.querySelectorAll('[data-id]').forEach((g) => { const c = cls(g.dataset.id); g.setAttribute('class', 'by-part ' + c); g.setAttribute('aria-pressed', String(S.sel === g.dataset.id)); if (task === 'order') { g.removeAttribute('data-key'); g.removeAttribute('tabindex'); g.removeAttribute('role'); g.classList.add('by-static'); } });
    }
    function renderCtrls() {
      let h = '';
      if (playable || (task === 'trace' && flow && S.step >= flow.steps.length - 1)) {
        const label = S.playing ? t(U.playing) : flow ? t(U.follow) + t(flow.name) : t(sc.playName);
        h += `<button type="button" class="by-play" data-key="play" aria-busy="${S.playing}">${PLAY_ICON}<span>${esc(label)}</span></button>`;
      }
      if (sc.tabs) h += `<div class="by-tabs" role="group" aria-label="${esc(t(sc.name))}">${sc.layers.map((l) => `<button type="button" class="by-chip" data-key="layer:${l.id}" aria-pressed="${S.layers.has(l.id)}">${esc(t(l.n))}</button>`).join('')}</div>`;
      else h += sc.layers.map((l) => `<button type="button" class="by-chip" data-key="layer:${l.id}" aria-pressed="${S.layers.has(l.id)}"><span class="tick" aria-hidden="true">${S.layers.has(l.id) ? '✓' : ''}</span>${esc(t(l.n))}</button>`).join('');
      if (task === 'explore' || task === 'trace') h += `<button type="button" class="by-chip" data-key="layer:labels" aria-pressed="${S.names}"><span class="tick" aria-hidden="true">${S.names ? '✓' : ''}</span>${esc(t(U.names))}</button>`;
      if (sc.views) h += `<button type="button" class="by-chip" data-key="rotate" aria-pressed="${S.view === 'back'}">${TURN_ICON}${esc(t(S.view === 'back' ? U.back : U.front))}</button>`;
      $('.by-ctrls').innerHTML = h;
    }
    const meter = (a, b) => `<div class="by-meter" role="progressbar" aria-valuemin="0" aria-valuemax="${b}" aria-valuenow="${a}"><i style="width:${b ? Math.round((a / b) * 100) : 0}%"></i></div>`;
    function renderCard() {
      let h = '';
      const partCard = (id) => { const p = info(id); return p ? `<h4>${esc(t(p.n))}</h4><p>${esc(t(p.i))}</p>` : ''; };
      if (task === 'label') {
        const q = S.quiz;
        if (S.msg && S.msg.ok === false) h += `<p class="no">${esc(t(U.thatIs) + nameOf(S.msg.id))}. ${esc(t(U.tryAgain))}${S.hint ? ' ' + esc(t(U.hint)) : ''}</p>`;
        else if (S.msg && S.msg.ok) h += `<p class="ok">✓ ${esc(t(U.right))} ${esc(nameOf(S.msg.id))}</p>`;
        if (q.i < q.list.length) h += `<p class="muted">${esc(t(U.find))}</p><p class="big">${esc(nameOf(q.list[q.i]))}</p>`;
        else h += `<h4>🎉 ${esc(t(U.allFound))}</h4><p>${esc(t(U.score))}${q.first} / ${q.list.length}</p>`;
        h += meter(q.i, q.list.length);
      } else if (task === 'order') {
        const o = S.ord;
        if (o.solved) h = `<p class="ok">🎉 ${esc(t(U.solved))}</p>` + (S.step >= 0 ? `<h4>${esc(stepName(flow.steps[S.step]))}</h4><p>${esc(t(flow.steps[S.step].s))}</p>` : '');
        else h = `<p>${esc(t(U.order))}</p>` + (o.bad.size ? `<p class="no">${o.bad.size}${esc(t(U.wrongN))}</p>` : '');
        if (o.solved && S.msg && S.msg.done) h += `<p class="muted">${esc(t(flow.done))}</p>`;
      } else if (task === 'trace') {
        const n = flow.steps.length;
        if (S.msg && S.msg.ok === false) h += `<p class="no">${esc(t(U.notThere) + nameOf(S.msg.id))}. ${esc(t(U.tryAgain))}${S.hint ? ' ' + esc(t(U.hint)) : ''}</p>`;
        if (S.step < 0) h += `<p class="big">${esc(t(flow.start))}</p>`;
        else if (S.step < n - 1) h += `<p class="ok">✓ ${S.step + 1}. ${esc(stepName(flow.steps[S.step]))}</p><p>${esc(t(flow.steps[S.step].s))}</p><p><b>${esc(t(U.next))}</b></p>`;
        else h += `<h4>🎉 ${esc(t(U.done))}</h4><p>${esc(t(flow.done))}</p>`;
        h += meter(S.step + 1, n);
      } else if (flow && (S.playing || (S.msg && S.msg.done)) && S.step >= 0) {
        const st = flow.steps[S.step];
        h = S.playing ? `<p class="muted">${esc(t(U.step))} ${S.step + 1} ${esc(t(U.of))} ${flow.steps.length}</p><h4>${esc(stepName(st))}</h4><p>${esc(t(st.s))}</p>` : `<h4>✔ ${esc(t(U.done))}</h4><p>${esc(t(flow.done))}</p>`;
      } else if (S.sel) h = partCard(S.sel);
      else h = `<p>👆 ${esc(t(U.tap))}</p>${flow ? `<p class="muted">▶ ${esc(t(U.play))}</p>` : ''}`;
      $('.by-card').innerHTML = h;
    }
    function renderFlow() {
      const el = $('.by-flow');
      if (!flow || (task === 'order' && !S.ord.solved)) { el.hidden = true; el.innerHTML = ''; return; }
      el.hidden = false;
      el.setAttribute('aria-label', t(flow.name));
      el.innerHTML = flow.steps.map((st, i) => `${i ? '<span class="by-arrow" aria-hidden="true">→</span>' : ''}<span class="by-fs ${i <= S.step ? 'on' : ''} ${i === S.step ? 'now' : ''}"><b>${i + 1}</b>${task !== 'trace' || i <= S.step ? esc(stepName(st)) : '?'}</span>`).join('');
    }
    function renderOrder() {
      const o = S.ord, el = $('.by-order');
      if (!el) return;
      el.innerHTML = `<ol class="by-slots">${o.slots.map((v, j) => `<li><button type="button" class="by-slot ${v != null ? 'full' : ''} ${o.bad.has(j) ? 'bad' : ''} ${o.solved ? 'good' : ''}" data-act="slot" data-i="${j}" aria-label="${esc(t(U.box))} ${j + 1}: ${v != null ? esc(stepName(flow.steps[v])) : esc(t(U.empty))}"><b>${j + 1}</b><span>${v != null ? esc(stepName(flow.steps[v])) : ''}</span></button></li>`).join('')}</ol>`
        + (o.solved ? '' : `<div class="by-cards">${o.cards.filter((i) => !o.slots.includes(i)).map((i) => `<button type="button" class="by-cardbtn" data-act="card" data-i="${i}">${esc(stepName(flow.steps[i]))}</button>`).join('')}</div><button type="button" class="by-play by-check" data-act="check">✓ ${esc(t(U.check))}</button>`);
    }
    function drawAll() {
      const a = typeof document !== 'undefined' ? document.activeElement : null;
      let fq = null;
      if (a && root.contains(a)) fq = a.dataset.act ? `[data-act="${a.dataset.act}"][data-i="${a.dataset.i}"]` : a.dataset.key ? `[data-key="${a.dataset.key}"]` : null;
      drawSvg(); renderCtrls(); renderCard(); renderFlow(); renderZoom(); if (task === 'order') renderOrder();
      if (fq) { const el = root.querySelector(fq); if (el && el.focus) el.focus({ preventScroll: true }); }
    }

    // -------- motion
    function moveAlong(pts, done) {
      const seg = []; let tot = 0;
      for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); tot += l; }
      const cur = S.trail[S.trail.length - 1], base = cur.length;
      if (reduced() || tot < 1) { cur.push(...pts.slice(1)); S.tok.x = pts[pts.length - 1][0]; S.tok.y = pts[pts.length - 1][1]; placeTok(); done(); return; }
      const ms = clamp(tot * 7, 550, 2200), t0 = performance.now();
      const job = (now) => {
        const k = Math.min(1, (now - t0) / ms); let d = ease(k) * tot, i = 0;
        while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
        const a = pts[i], b = pts[i + 1], f = seg[i] ? Math.min(1, d / seg[i]) : 1, x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
        cur.length = base; for (let j = 1; j <= i; j++) cur.push(pts[j]); cur.push([x, y]);
        S.tok.x = x; S.tok.y = y; placeTok();
        if (k >= 1) { jobs.delete(job); cur.length = base; cur.push(...pts.slice(1)); done(); }
      };
      addJob(job);
    }
    function animFrame(k) {
      sc.anim(k, S, svg);
      const fg = svg.querySelector('#by-fg'); if (fg && sc.fg) fg.innerHTML = sc.fg(S);
      if (sc.zoom && sc.zoom.draw && zoomOn()) renderZoom();
    }
    function startLoopAnim() {
      if (!sc.anim || reduced()) return;
      const t0 = performance.now(), ms = sc.playMs || 5000;
      addJob(function loopAnim(now) { animFrame(((now - t0) / ms) % 1); });
    }
    function step(i, then) {
      const st = flow.steps[i];
      const arrive = () => { S.step = i; S.reached.add(st.p); S.sel = st.p; S.tok.c = st.c || flow.col; S.moving = false; drawAll(); if (S.playing) api.speak(t(st.s)); then(); };
      if (i === 0) { S.tok.x = st.at[0]; S.tok.y = st.at[1]; arrive(); return; }
      if (st.jump) { S.trail.push([st.at.slice()]); S.tok.x = st.at[0]; S.tok.y = st.at[1]; arrive(); return; }
      S.moving = true;
      moveAlong([[S.tok.x, S.tok.y]].concat(st.via || [], [st.at]), arrive);
    }
    function runFlow(emit) {
      stopAll();
      const st = flow.steps;
      Object.assign(S, { playing: true, step: -1, reached: new Set(), trail: [[st[0].at.slice()]], tok: { x: st[0].at[0], y: st[0].at[1], c: st[0].c || flow.col }, msg: null, hint: null });
      if (sc.playLayer) S.layers.add(sc.playLayer);
      drawAll();
      startLoopAnim();
      const go = (i) => {
        if (i >= st.length) {
          stopAll(); S.sel = null; S.msg = { done: true }; drawAll();
          api.record(t(T2('Followed the journey of ', 'यात्रा देखी: ')) + t(flow.name));
          if (emit) api.emit('traced');
          return;
        }
        step(i, () => later(() => go(i + 1), reduced() ? 1800 : 1400));
      };
      go(0);
    }
    function runAnim() {
      stopAll();
      if (sc.playLayer) S.layers.add(sc.playLayer);
      S.playing = true; drawAll();
      api.record(t(sc.playName));
      if (reduced()) { animFrame(sc.reducedK != null ? sc.reducedK : 1); later(() => { S.playing = false; renderCtrls(); }, 600); return; }
      const t0 = performance.now(), ms = sc.playMs || 5000;
      const job = (now) => { const k = Math.min(1, (now - t0) / ms); animFrame(k); if (k >= 1) { jobs.delete(job); S.playing = false; renderCtrls(); } };
      addJob(job);
    }

    // -------- tasks
    function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    function buildQuiz() {
      const prev = S.quiz;
      const ids = shuffle(uniq(visParts().map((p) => p.id)).filter((id) => !S.done.has(id)));
      S.quiz = { list: ids.slice(0, Math.max(3, 10 - S.done.size)), i: 0, first: prev ? prev.first : 0, missed: false };
      S.miss = 0; S.hint = null;
    }
    function labelTap(id) {
      const q = S.quiz, want = q.list[q.i];
      if (!want) { S.sel = id; S.msg = null; drawAll(); return; }
      if (id === want) {
        if (!S.miss) q.first++;
        S.done.add(id); q.i++; S.miss = 0; S.hint = null; S.msg = { ok: true, id };
        api.record(t(U.right) + ' ' + nameOf(id));
        api.emit('answered:right');
        if (q.i >= q.list.length) api.celebrate();
      } else {
        S.miss++; S.bad = id; S.msg = { ok: false, id };
        if (S.miss >= 2) S.hint = want;
        api.record(t(U.notThere) + nameOf(id));
        api.emit('answered:wrong');
        later(() => { S.bad = null; drawAll(); }, 900);
      }
      drawAll();
    }
    function traceTap(id) {
      const st = flow.steps, i = S.step + 1;
      if (i >= st.length || S.moving) { if (i >= st.length) { S.sel = id; drawAll(); } return; }
      const nx = st[i];
      if (id === nx.p || (nx.alt || []).includes(id)) {
        S.miss = 0; S.hint = null; S.bad = null; S.msg = null;
        if (i === 0) { S.trail = [[nx.at.slice()]]; S.tok = { x: nx.at[0], y: nx.at[1], c: nx.c || flow.col }; }
        api.record(`${i + 1}. ${stepName(nx)}`);
        api.emit('answered:right');
        step(i, () => { if (i === st.length - 1) { S.sel = null; drawAll(); api.emit('traced'); api.celebrate(); } });
      } else {
        S.miss++; S.bad = id; S.msg = { ok: false, id };
        if (S.miss >= 2) S.hint = nx.p;
        api.emit('answered:wrong');
        drawAll();
        later(() => { S.bad = null; drawAll(); }, 900);
      }
    }
    function orderAct(el) {
      const o = S.ord;
      if (!el || o.solved) return;
      const act = el.dataset.act, i = +el.dataset.i;
      if (act === 'card') { const j = o.slots.indexOf(null); if (j < 0) return; o.slots[j] = i; o.bad.clear(); }
      else if (act === 'slot') { if (o.slots[i] == null) return; o.slots[i] = null; o.bad.delete(i); }
      else if (act === 'check') {
        if (o.slots.includes(null)) { api.toast(U.fill); return; }
        const wrong = o.slots.map((v, j) => (v !== j ? j : -1)).filter((j) => j >= 0);
        api.record(t(U.check) + ': ' + o.slots.map((v) => stepName(flow.steps[v])).join(' → '));
        if (!wrong.length) { o.solved = true; drawAll(); api.emit('answered:right'); api.emit('ordered'); api.celebrate(); later(() => runFlow(false), 700); return; }
        o.bad = new Set(wrong); api.emit('answered:wrong');
        const tray = $('.by-order'); if (tray && !reduced()) { tray.classList.remove('by-shake'); void tray.offsetWidth; tray.classList.add('by-shake'); }
      }
      drawAll();
    }
    function tapPart(id) {
      if (task === 'order') return;
      api.emit('picked:' + id);
      if (task === 'label') { labelTap(id); return; }
      if (task === 'trace') { traceTap(id); return; }
      S.sel = id; S.msg = null;
      api.speak(nameOf(id)); api.record(t(U.looked) + nameOf(id));
      drawAll();
    }
    function toggleLayer(id) {
      if (id === 'labels') { S.names = !S.names; drawAll(); return; }
      if (!sc.layers.some((l) => l.id === id)) return;
      if (sc.tabs) { if (S.layers.has(id)) return; S.layers = new Set([id]); }
      else if (S.layers.has(id)) S.layers.delete(id); else S.layers.add(id);
      if (S.sel && !visParts().some((p) => p.id === S.sel)) S.sel = null;
      if (task === 'label') buildQuiz();
      api.record(t(sc.layers.find((l) => l.id === id).n) + (S.layers.has(id) ? ' ✓' : ' ✗'));
      drawAll();
    }
    function rotate() {
      S.view = S.view === 'front' ? 'back' : 'front';
      if (S.sel && !visParts().some((p) => p.id === S.sel)) S.sel = null;
      if (task === 'label') buildQuiz();
      api.record(t(S.view === 'back' ? T2('Turned to the back', 'पीछे घुमाया') : T2('Turned to the front', 'सामने घुमाया')));
      drawAll();
    }
    function play() {
      if (S.playing) return;
      if (flow && (task === 'explore' || task === 'trace')) runFlow(task === 'explore');
      else if (sc.anim && task === 'explore') runAnim();
    }
    function onClick(e) {
      const el = e.target.closest('[data-key]');
      if (!el || !root.contains(el)) return;
      const key = el.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key.startsWith('part:')) tapPart(key.slice(5));
      else if (key.startsWith('layer:')) toggleLayer(key.slice(6));
      else if (key === 'rotate') rotate();
      else if (key === 'play') play();
      else if (key === 'answer') orderAct(e.target.closest('[data-act]'));
    }
    function onKey(e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('g[role="button"]')) { e.preventDefault(); e.target.closest('g[role="button"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    }
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);

    if (task === 'label') buildQuiz();
    if (task === 'order') { const n = flow.steps.length; let c; do { c = shuffle([...Array(n).keys()]); } while (c.every((v, i) => v === i)); S.ord = { cards: c, slots: Array(n).fill(null), solved: false, bad: new Set() }; }
    const fit = () => { box.classList.toggle('wide', (root.clientWidth || 800) >= 760); };
    fit();
    drawAll();
    const photo = api.asset ? api.asset('body-' + cfg.system) : null;
    if (photo) { const f = $('.by-photo'); f.hidden = false; f.innerHTML = `<img src="${esc(photo)}" alt="${esc(t(sc.name))}"><figcaption>${esc(t(U.photo))}</figcaption>`; }
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => { fit(); const w = svgW(); if (Math.abs(w - lastW) > 40 && !S.moving) { drawSvg(); renderZoom(); } });
      ro.observe(root);
    }
    return { destroy() { alive = false; stopAll(); if (ro) ro.disconnect(); root.removeEventListener('click', onClick); root.removeEventListener('keydown', onKey); } };
  }

  NCA_T.register({
    id: 'body',
    css: CSS,
    validate(c) {
      if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
      const e = [];
      Object.keys(c).forEach((k) => { if (!['system', 'flow', 'task'].includes(k)) e.push('unknown key: ' + k); });
      if (!SCENES[c.system]) { e.push('system: one of ' + SYSTEMS.join(', ')); return e; }
      const sc = SCENES[c.system];
      if (c.flow != null) {
        if (!FLOWS.includes(c.flow)) e.push('flow: one of ' + FLOWS.join(', '));
        else if (!sc.flows || !sc.flows[c.flow]) e.push(`flow '${c.flow}' does not run through the ${c.system} system` + (sc.flows ? ` (use ${Object.keys(sc.flows).join(', ')})` : ' (this system has no flow)'));
      }
      if (c.task != null && !TASKS.includes(c.task)) e.push('task: one of ' + TASKS.join(', '));
      if ((c.task === 'trace' || c.task === 'order') && !DEF_FLOW[c.system]) e.push(`task '${c.task}' needs a journey to follow; the ${c.system} system has none (use explore or label)`);
      return e;
    },
    keys(c) {
      const sc = c && SCENES[c.system];
      if (!sc) return { targets: [], events: [] };
      const task = c.task || 'explore', f = effFlow(c), ids = uniq(partsOf(sc).map((p) => p.id));
      const layers = sc.layers.map((l) => 'layer:' + l.id);
      if (task === 'order') return { targets: ['answer'].concat(layers), events: ['ordered', 'answered:right', 'answered:wrong'] };
      const targets = ids.map((id) => 'part:' + id).concat(['part:*'], layers);
      if (task !== 'label') targets.push('layer:labels');
      if (sc.views) targets.push('rotate');
      if (task === 'explore' && (f || sc.anim)) targets.push('play');
      const events = ids.map((id) => 'picked:' + id).concat(['picked:*']);
      if (task === 'explore' && f) events.push('traced');
      if (task === 'label') events.push('answered:right', 'answered:wrong');
      if (task === 'trace') events.push('traced', 'answered:right', 'answered:wrong');
      return { targets, events };
    },
    demo: { system: 'digestive', flow: 'food', task: 'explore' },
    systems: SYSTEMS,
    // Pure data for tests under Node.
    model: { SCENES, DEF_FLOW, FLOWS, TASKS },
    mount(root, config, api) { return view(root, config, api); },
  });
})();
