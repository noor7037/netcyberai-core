// Template: Economy simulator. Markets, elasticity, production, costs, revenue, the circular flow, national income,
// money creation by banks, the Keynesian multiplier, the government budget, the foreign exchange market, the sectors
// of the economy and formal and informal credit. Every model is the textbook model, computed in code:
//   demand-supply / exchange-rate: linear Qd = a − b·P and Qs = c + d·P; equilibrium P* = (a − c)/(b + d)
//   elasticity: point elasticity on a linear demand curve, e = b·P/Q = lower segment ÷ upper segment
//   costs: TVC = αq − βq² + γq³; AVC, AFC, AC, MC derived exactly (MC cuts AVC and AC at their lowest points)
//   revenue: price-taking firm (AR = MR = P) or a downward demand P = A − Bq (MR = A − 2Bq); profit is largest at MR = MC
//   production: TP = aL² − bL³ for whole workers; MP = TP(L) − TP(L − 1), AP = TP/L; three stages of returns
//   circular-flow: leakages (saving, taxes, imports) and injections (investment, government spending, exports)
//   national-income: GDPmp = C + I + G + (X − M); NDP, NNP, NNPfc; value added and double counting
//   money-creation: deposits multiply by 1/rr; multiplier: k = 1/(1 − MPC); budget: revenue, fiscal, primary deficit
//   sectors: sort jobs into primary/secondary/tertiary, organised/unorganised, public/private
//   credit: simple (or compound) interest on a bank loan and a moneylender's loan
// All numbers are illustrative (a tag on screen says so); none is presented as real data.
// Config: { mode: one of the modes above, params?: { numbers named by the mode } }
(function () {
  const L = window.NCA_LIB;
  const { esc, lerp, ease } = L;
  const T2 = (en, hi) => ({ en, hi });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r1 = (v) => Math.round(v * 10) / 10;
  const r05 = (v) => Math.round(v * 2) / 2;
  let UID = 0;

  // ---------------------------------------------------------------- numbers
  function nice(v) {
    if (!(v > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / e;
    const n = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => f <= x + 1e-9);
    return +(n * e).toPrecision(12);
  }
  function tickStep(span, n) {
    const raw = span / (n || 5);
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    return +((f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e).toPrecision(12);
  }
  function fm(v, d) {
    if (v === Infinity || v === -Infinity) return '∞';
    if (!isFinite(v)) return '—';
    d = d == null ? 2 : d;
    const k = Math.pow(10, d);
    const r = Math.round(v * k) / k;
    const s = Math.abs(r).toLocaleString('en-IN', { maximumFractionDigits: d });
    return (r < 0 ? '−' : '') + s;
  }
  const rs = (v, d) => (v < 0 ? '−₹' + fm(-v, d) : '₹' + fm(v, d));
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
  const ri = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  function shuffle(r, a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  const hashStr = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  // One multiple-choice item: right answer, distractors (typical mistakes), and the reason.
  function mcq(r, q, right, wrongs, why) {
    const seen = new Set([right]);
    const ws = [];
    wrongs.forEach((x) => { if (x != null && !seen.has(x) && ws.length < 3) { seen.add(x); ws.push(x); } });
    const opts = shuffle(r, [right].concat(ws));
    return { q, opts, ans: opts.indexOf(right), why };
  }
  // A number answer with nearby distractors built from common slips.
  function numOpts(right, slips, f) {
    const out = [];
    slips.forEach((s) => { if (isFinite(s) && Math.abs(s - right) > 1e-9) out.push(f(s)); });
    [1.25, 0.8, 1.5, 0.5, 2].forEach((k) => out.push(f(right * k)));
    return out;
  }

  // ---------------------------------------------------------------- drawing helpers (SVG strings)
  const COL = { d: '#1D4ED8', s: '#C2410C', e: '#7C3AED', g: '#15803D', teal: '#0F766E', grey: '#475569', gold: '#B45309', red: '#B91C1C', cyan: '#0E7490', pink: '#BE185D' };
  const txt = (x, y, s, cls, more) => `<text x="${r1(x)}" y="${r1(y)}" class="${cls || 'ec-t'}" ${more || ''}>${esc(s)}</text>`;
  const lab = (x, y, s, col, anchor, cls) => `<text x="${r1(x)}" y="${r1(y)}" class="${cls || 'ec-lb'}" fill="${col}" text-anchor="${anchor || 'start'}">${esc(s)}</text>`;
  const dot = (x, y, col, rad, hollow) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${rad || 6}" fill="${hollow ? '#fff' : col}" stroke="${hollow ? col : '#fff'}" stroke-width="${hollow ? 2.5 : 2}"/>`;
  function pill(x, y, s, col, anchor) {
    const w = s.length * 7.4 + 14;
    const x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
    return `<g><rect x="${r1(x0)}" y="${r1(y - 11)}" width="${r1(w)}" height="22" rx="11" fill="${col}"/><text x="${r1(x0 + w / 2)}" y="${r1(y + 4.5)}" class="ec-pill" text-anchor="middle">${esc(s)}</text></g>`;
  }
  function arrowHead(x, y, dir, col, size) {
    const s = size || 7;
    const m = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    const px = -m[1], py = m[0];
    return `<path d="M${r1(x + m[0] * s)} ${r1(y + m[1] * s)}L${r1(x + px * s * 0.8)} ${r1(y + py * s * 0.8)}L${r1(x - px * s * 0.8)} ${r1(y - py * s * 0.8)}Z" fill="${col}"/>`;
  }
  // Axes, grid, ticks and labels for one plot area. Returns scale functions and the SVG.
  function frame(o) {
    const l = o.l != null ? o.l : 54, rr = o.r != null ? o.r : 16, t = o.t != null ? o.t : 34, b = o.b != null ? o.b : 50;
    const oy = o.oy || 0;
    let pw = o.W - l - rr, ph = o.H - t - b;
    if (o.square) { const s = Math.min(pw, ph); pw = s; ph = s; }
    const [x0, x1] = o.x, [y0, y1] = o.y;
    const sx = (v) => l + ((v - x0) / (x1 - x0)) * pw;
    const sy = (v) => oy + t + ph - ((v - y0) / (y1 - y0)) * ph;
    const xs = o.xs || tickStep(x1 - x0, o.narrow ? 4 : 6), ys = o.ys || tickStep(y1 - y0, o.ny || 5);
    const xf = o.xf || ((v) => fm(v, 2)), yf = o.yf || ((v) => fm(v, 2));
    const T = oy + t, B = oy + t + ph;
    let g = `<defs><clipPath id="${o.cid}"><rect x="${l}" y="${T - 3}" width="${pw + 3}" height="${ph + 3}"/></clipPath></defs>`;
    g += `<rect x="${l}" y="${T}" width="${r1(pw)}" height="${r1(ph)}" rx="4" class="ec-plot"/>`;
    for (let i = Math.ceil(x0 / xs - 1e-9); i * xs <= x1 + 1e-9; i++) {
      const v = +(i * xs).toPrecision(12), X = sx(v);
      g += `<line x1="${r1(X)}" y1="${T}" x2="${r1(X)}" y2="${r1(B)}" class="ec-grid"/>` + txt(X, B + 17, o.xticks ? o.xticks(v) : xf(v), 'ec-tk', 'text-anchor="middle"');
    }
    for (let i = Math.ceil(y0 / ys - 1e-9); i * ys <= y1 + 1e-9; i++) {
      const v = +(i * ys).toPrecision(12), Y = sy(v);
      g += `<line x1="${l}" y1="${r1(Y)}" x2="${r1(l + pw)}" y2="${r1(Y)}" class="ec-grid${v === 0 && y0 < 0 ? ' ec-zero' : ''}"/>` + txt(l - 6, Y + 4, yf(v), 'ec-tk', 'text-anchor="end"');
    }
    const ax = y0 < 0 ? sy(0) : B;
    g += `<path d="M${l} ${T - 8}V${r1(B)}" class="ec-axis"/><path d="M${l} ${r1(ax)}H${r1(l + pw + 6)}" class="ec-axis"/>`;
    g += arrowHead(l, T - 10, 'up', '#334155', 5) + arrowHead(l + pw + 8, ax, 'right', '#334155', 5);
    if (o.yl) g += txt(6, T - 14, o.yl, 'ec-al');
    if (o.xl) g += txt(l + pw, B + 37, o.xl, 'ec-al', 'text-anchor="end"');
    return { sx, sy, l, t: T, pw, ph, r: l + pw, b: B, svg: g, clip: `clip-path="url(#${o.cid})"`, x0, x1, y0, y1 };
  }
  const seg = (F, xa, ya, xb, yb, col, cls, more) => `<path d="M${r1(F.sx(xa))} ${r1(F.sy(ya))}L${r1(F.sx(xb))} ${r1(F.sy(yb))}" stroke="${col}" class="${cls || 'ec-line'}" ${F.clip} ${more || ''}/>`;
  function fpath(F, fn, a, b, col, cls, n) {
    n = n || 90;
    const span = F.y1 - F.y0;
    let d = '';
    for (let i = 0; i <= n; i++) {
      const x = a + ((b - a) * i) / n, y = fn(x);
      if (!isFinite(y)) continue;
      d += (d ? 'L' : 'M') + r1(F.sx(x)) + ' ' + r1(F.sy(clamp(y, F.y0 - span, F.y1 + span)));
    }
    return `<path d="${d}" stroke="${col}" class="${cls || 'ec-line'}" ${F.clip}/>`;
  }
  function smooth(pts) {
    if (pts.length < 3) return 'M' + pts.map((p) => r1(p[0]) + ' ' + r1(p[1])).join('L');
    let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
    }
    return d;
  }
  // Curve-end labels pushed apart so they never overlap.
  function endLabels(items, lo, hi, gap) {
    gap = gap || 17;
    items.sort((a, b) => a.y - b.y);
    for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < gap) items[i].y = items[i - 1].y + gap;
    const over = items.length ? items[items.length - 1].y - hi : 0;
    if (over > 0) items.forEach((it) => (it.y -= over));
    for (let i = 0; i < items.length; i++) if (items[i].y < lo + i * gap) items[i].y = lo + i * gap;
    return items.map((it) => lab(it.x, it.y, it.s, it.col, it.anchor || 'end')).join('');
  }
  const tile = (label, value, col) => `<div class="ec-tile" style="--c:${col || '#14B8A6'}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  const tiles = (arr) => `<div class="ec-tiles">${arr.map((a) => tile(a[0], a[1], a[2])).join('')}</div>`;
  const status = (cls, s) => `<p class="ec-status ${cls}">${esc(s)}</p>`;
  const note = (s) => `<p class="ec-note">${esc(s)}</p>`;
  const formula = (s) => `<p class="ec-formula">${esc(s)}</p>`;

  // ---------------------------------------------------------------- CSS
  const CSS = `.ec { display: flex; flex-direction: column; gap: 12px; color: var(--ink); font-family: var(--font-body); min-width: 0; }
.ec-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.ec-badge { width: 44px; height: 44px; border-radius: 14px; flex: none; display: grid; place-items: center; background: linear-gradient(140deg, #2DD4BF, #0D9488 55%, #0F766E); box-shadow: 0 6px 14px rgba(13,148,136,.35); }
.ec-badge svg { width: 28px; height: 28px; }
.ec-ht { flex: 1 1 200px; min-width: 0; }
.ec-title { margin: 0; font: 800 1.2rem/1.2 var(--font-display); }
.ec-sub { margin: 2px 0 0; color: var(--ink-2); font-size: .92rem; line-height: 1.35; }
.ec-tag { font-size: .76rem; font-weight: 700; padding: 3px 10px; border-radius: 999px; background: var(--sun-t); border: 1px solid var(--line); color: var(--ink); white-space: nowrap; }
.ec-main { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); align-items: start; }
.ec.wide .ec-main { grid-template-columns: minmax(0, 1.55fr) minmax(290px, 1fr); }
.ec-stage { border-radius: 18px; padding: 8px; min-width: 0; background: linear-gradient(155deg, #E6FFFB, #EEF2FF 55%, #FDF2FF); box-shadow: 0 10px 26px rgba(6,18,51,.10), inset 0 0 0 1px rgba(6,18,51,.07); }
.ec-svg { display: block; width: 100%; height: auto; }
.ec-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.ec-card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px; min-width: 0; }
.ec-card > :first-child { margin-top: 0; }
.ec-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(98px, 1fr)); gap: 8px; }
.ec-tile { border-radius: 12px; padding: 7px 10px; background: var(--sunk); border-left: 5px solid var(--c); min-width: 0; }
.ec-tile span { display: block; font-size: .78rem; font-weight: 700; color: var(--ink-2); line-height: 1.2; }
.ec-tile b { display: block; font: 800 1.12rem/1.2 var(--font-display); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.ec-status { margin: 10px 0 0; padding: 8px 12px; border-radius: 12px; font-weight: 700; line-height: 1.35; }
.ec-status.ok { background: var(--good-t); box-shadow: inset 4px 0 0 #0F766E; }
.ec-status.warn { background: var(--sun-t); box-shadow: inset 4px 0 0 #F5B90A; }
.ec-status.bad { background: var(--bad-t); box-shadow: inset 4px 0 0 #B42318; }
.ec-note { margin: 8px 0 0; font-size: .9rem; color: var(--ink-2); line-height: 1.4; }
.ec-formula { margin: 8px 0 0; font: 700 .92rem/1.4 var(--font-body); background: var(--royal-t); border-radius: 10px; padding: 6px 10px; overflow-wrap: anywhere; }
.ec-live { margin: 0; min-height: 1.2em; font-weight: 700; color: var(--ink); line-height: 1.4; }
.ec-live:empty { display: none; }
.ec-live:not(:empty) { background: var(--grape-t); border-radius: 12px; padding: 8px 12px; }
.ec-ctl { display: flex; flex-direction: column; gap: 4px; }
.ec-sls { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 2px 14px; }
.ec-sl { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 8px; }
.ec-sl[hidden] { display: none; }
.ec-sl label { font-weight: 700; font-size: .9rem; line-height: 1.2; }
.ec-sl output { font: 800 .98rem var(--font-display); background: var(--sunk); border-radius: 8px; padding: 1px 8px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ec-sl input[type=range] { grid-column: 1 / -1; width: 100%; height: 44px; margin: 0; background: transparent; -webkit-appearance: none; appearance: none; cursor: pointer; }
.ec-sl input[type=range]:disabled { opacity: .45; cursor: not-allowed; }
.ec-sl input[type=range]::-webkit-slider-runnable-track { height: 10px; border-radius: 999px; background: linear-gradient(90deg, #14B8A6 0, #0D9488 var(--pct, 50%), var(--line) var(--pct, 50%)); }
.ec-sl input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 28px; height: 28px; margin-top: -9px; border-radius: 50%; background: #fff; border: 3px solid #0D9488; box-shadow: 0 2px 6px rgba(6,18,51,.3); }
.ec-sl input[type=range]::-moz-range-track { height: 10px; border-radius: 999px; background: var(--line); }
.ec-sl input[type=range]::-moz-range-progress { height: 10px; border-radius: 999px; background: #0D9488; }
.ec-sl input[type=range]::-moz-range-thumb { width: 24px; height: 24px; border-radius: 50%; background: #fff; border: 3px solid #0D9488; box-shadow: 0 2px 6px rgba(6,18,51,.3); }
.ec-sl input[type=range]:focus-visible { outline: 3px solid #8B3DFF; outline-offset: 2px; border-radius: 8px; }
.ec-btns { display: flex; flex-wrap: wrap; gap: 8px; }
.ec-btn { min-height: 44px; padding: 0 14px; border-radius: 12px; border: 0; font: 700 .95rem/1.15 var(--font-body); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 2px 0 rgba(6,18,51,.18); transition: transform .12s, filter .12s, background .2s; }
.ec-btn:hover { filter: brightness(1.06); transform: translateY(-1px); }
.ec-btn:active { transform: translateY(1px); }
.ec-btn:focus-visible, .ec-opt:focus-visible, .ec-cardbtn:focus-visible, .ec-bin:focus-visible { outline: 3px solid #8B3DFF; outline-offset: 2px; }
.ec-btn svg { width: 20px; height: 20px; flex: none; }
.ec-play { background: linear-gradient(180deg, #3B6EEA, #1D4ED8); color: #fff; flex: 1 1 170px; }
.ec-play.on { background: linear-gradient(180deg, #F87171, #B42318); }
.ec-tog { background: var(--surface); color: var(--ink); box-shadow: inset 0 0 0 1.5px var(--line); }
.ec-tog::before { content: ''; width: 18px; height: 18px; border-radius: 6px; border: 2px solid #64748B; flex: none; box-sizing: border-box; }
.ec-tog[aria-pressed="true"] { background: linear-gradient(180deg, #5EEAD4, #2DD4BF); color: #1E293B; box-shadow: inset 0 0 0 1.5px #0F766E; }
.ec-tog[aria-pressed="true"]::before { background: #0F766E; border-color: #0F766E; box-shadow: inset 0 0 0 3px #CCFBF1; }
.ec-shifts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ec-shift { font-size: .9rem; padding: 0 10px; }
.ec-shift.d { background: linear-gradient(180deg, #DBEAFE, #BFDBFE); color: #1E3A8A; }
.ec-shift.s { background: linear-gradient(180deg, #FFEDD5, #FED7AA); color: #7C2D12; }
.ec-quiz { border-radius: 16px; padding: 12px 14px; border: 1px solid var(--line); background: linear-gradient(135deg, var(--grape-t), var(--surface) 70%); }
.ec-qh { display: flex; align-items: center; gap: 8px; font: 800 1rem var(--font-display); }
.ec-qi { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: #8B3DFF; color: #fff; font-weight: 800; }
.ec-q { margin: 8px 0 10px; font-weight: 600; line-height: 1.45; }
.ec-opts { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; }
.ec-opt { min-height: 48px; text-align: left; padding: 8px 12px; border-radius: 12px; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); font: 600 .95rem/1.3 var(--font-body); cursor: pointer; transition: border-color .2s, background .2s, transform .12s; }
.ec-opt:hover:not(:disabled) { border-color: #8B3DFF; transform: translateY(-1px); }
.ec-opt:disabled { cursor: default; }
.ec-opt.right { border-color: #0F766E; background: var(--good-t); }
.ec-opt.wrong { border-color: #B42318; background: var(--bad-t); }
.ec-qfb { margin: 10px 0 0; line-height: 1.45; }
.ec-qfb:empty { display: none; }
.ec-qfb.ok, .ec-qfb.no { padding: 8px 12px; border-radius: 12px; }
.ec-qfb.ok { background: var(--good-t); }
.ec-qfb.no { background: var(--bad-t); }
.ec-next { margin-top: 10px; background: linear-gradient(180deg, #A266FF, #8B3DFF); color: #fff; }
.ec-svg .ec-plot { fill: #FFFFFF; stroke: #CBD5E1; }
.ec-svg .ec-grid { stroke: #E2E8F0; stroke-width: 1; }
.ec-svg .ec-zero { stroke: #94A3B8; }
.ec-svg .ec-axis { stroke: #334155; stroke-width: 2; fill: none; }
.ec-svg text { font-family: var(--font-body); }
.ec-svg .ec-t { font-size: 13px; fill: #1E293B; }
.ec-svg .ec-tk { font-size: 12px; fill: #475569; font-variant-numeric: tabular-nums; }
.ec-svg .ec-al { font-size: 13px; font-weight: 700; fill: #334155; }
.ec-svg .ec-lb { font-size: 14px; font-weight: 800; paint-order: stroke; stroke: #fff; stroke-width: 4px; stroke-linejoin: round; }
.ec-svg .ec-sm { font-size: 12px; font-weight: 700; paint-order: stroke; stroke: #fff; stroke-width: 3.5px; stroke-linejoin: round; }
.ec-svg .ec-pill { font-size: 12.5px; font-weight: 800; fill: #fff; }
.ec-svg .ec-line { fill: none; stroke-width: 3.5; stroke-linecap: round; stroke-linejoin: round; }
.ec-svg .ec-thin { fill: none; stroke-width: 2.2; stroke-linecap: round; }
.ec-svg .ec-ghost { fill: none; stroke-width: 2.5; stroke-dasharray: 7 6; opacity: .45; }
.ec-svg .ec-guide { fill: none; stroke: #64748B; stroke-width: 1.6; stroke-dasharray: 5 5; }
.ec-svg .ec-box { font-size: 14px; font-weight: 800; fill: #fff; }
.ec-svg .ec-boxd { font-size: 14px; font-weight: 800; fill: #1E293B; }
.ec-svg .ec-boxs { font-size: 12px; font-weight: 600; fill: #fff; }
.ec-svg .ec-boxsd { font-size: 12px; font-weight: 600; fill: #334155; }
.ec-table { width: 100%; border-collapse: collapse; font-size: .9rem; font-variant-numeric: tabular-nums; }
.ec-table th, .ec-table td { padding: 4px 6px; text-align: right; border-bottom: 1px solid var(--line); }
.ec-table th:first-child, .ec-table td:first-child { text-align: left; }
.ec-table tr.cur td { background: var(--sun-t); font-weight: 800; }
.ec-scroll { overflow-x: auto; max-width: 100%; }
.ec-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: baseline; }
.ec-rounds { display: flex; flex-direction: column; gap: 3px; margin-top: 8px; }
.ec-round { display: grid; grid-template-columns: 74px minmax(0, 1fr) 64px; align-items: center; gap: 6px; font-size: .82rem; font-weight: 700; }
.ec-round i { display: block; height: 12px; border-radius: 6px; background: linear-gradient(90deg, #14B8A6, #0D9488); transition: width .3s; }
.ec-round span:last-child { text-align: right; font-variant-numeric: tabular-nums; }
.ec-terms { width: 100%; border-collapse: collapse; font-size: .86rem; margin-top: 8px; }
.ec-terms th, .ec-terms td { border-bottom: 1px solid var(--line); padding: 5px 6px; text-align: left; vertical-align: top; line-height: 1.3; }
.ec-terms th { color: var(--ink-2); }
.ec-sort { display: flex; flex-direction: column; gap: 10px; }
.ec-bins { display: grid; gap: 8px; grid-template-columns: repeat(var(--n, 3), minmax(0, 1fr)); }
.ec-bin { min-height: 150px; border-radius: 16px; border: 2px dashed rgba(6,18,51,.25); background: rgba(255,255,255,.75); color: #1E293B; padding: 8px 6px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; font: 600 .82rem/1.25 var(--font-body); text-align: center; transition: transform .15s, border-color .2s, background .2s; }
.ec-bin svg { width: 64px; height: 50px; }
.ec-bin b { font: 800 1rem/1.15 var(--font-display); }
.ec-bin.ready { border-color: #8B3DFF; border-style: solid; background: #fff; }
.ec-bin.shake { animation: ec-shake .4s; border-color: #B42318; }
.ec-bin.glow { animation: ec-glow .6s; }
.ec-chips { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; margin-top: 4px; }
.ec-chip { font-size: .74rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: #CCFBF1; color: #134E4A; }
.ec-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 8px; }
.ec-cardbtn { min-height: 56px; border-radius: 14px; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); padding: 8px 10px; font: 700 .9rem/1.25 var(--font-body); text-align: left; cursor: pointer; box-shadow: 0 2px 0 rgba(6,18,51,.10); transition: transform .15s, box-shadow .15s, border-color .15s; }
.ec-cardbtn[aria-pressed="true"] { border-color: #8B3DFF; box-shadow: 0 0 0 3px rgba(139,61,255,.3); transform: translateY(-2px); }
.ec-score { font-weight: 800; }
.ec-m-sectors:not(.wide) .ec-side { display: contents; }
.ec-m-sectors:not(.wide) .ec-read { order: 1; }
.ec-m-sectors:not(.wide) .ec-stage { order: 2; }
.ec-m-sectors:not(.wide) .ec-live { order: 3; }
.ec-m-sectors:not(.wide) .ec-btns { order: 4; }
.ec.narrow .ec-stage { padding: 4px; border-radius: 14px; }
@keyframes ec-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
@keyframes ec-glow { 0% { background: #CCFBF1; } 100% { background: rgba(255,255,255,.75); } }
@media (prefers-reduced-motion: reduce) { .ec-btn, .ec-opt, .ec-cardbtn, .ec-bin, .ec-round i { transition: none; } .ec-bin.shake, .ec-bin.glow { animation: none; } }`;

  const ICON_BADGE = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="18" width="5" height="9" rx="1.5" fill="#CCFBF1"/><rect x="11.5" y="13" width="5" height="14" rx="1.5" fill="#99F6E4"/><rect x="19" y="8" width="5" height="19" rx="1.5" fill="#fff"/><path d="M4 14l8-6 6 4 9-8" fill="none" stroke="#FFD23F" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="27" cy="4" r="2.4" fill="#FFD23F"/></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor"/></svg>';
  const ICON_STOP = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="5" width="10" height="10" rx="2" fill="currentColor"/></svg>';

  // ---------------------------------------------------------------- modes
  const MODES = {};

  // ---- demand and supply, and the foreign exchange market (same linear model, different words)
  function market(fx) {
    const PN = fx ? 'rate' : 'price';
    const W_ = fx
      ? { d: T2('Demand for $', '$ की माँग'), s: T2('Supply of $', '$ की आपूर्ति'), y: T2('Exchange rate (₹ per $)', 'विनिमय दर (₹ प्रति $)'), x: T2('Dollars ($ million)', 'डॉलर ($ मिलियन)'), u: T2('$ million', '$ मिलियन'), pr: T2('Exchange rate', 'विनिमय दर'), qd: T2('Dollars demanded', 'डॉलर की माँग'), qs: T2('Dollars supplied', 'डॉलर की आपूर्ति') }
      : { d: T2('Demand', 'माँग'), s: T2('Supply', 'आपूर्ति'), y: T2('Price (₹ per kg)', 'कीमत (₹ प्रति किलो)'), x: T2('Quantity (kg)', 'मात्रा (किलो)'), u: T2('kg', 'किलो'), pr: T2('Price', 'कीमत'), qd: T2('Quantity demanded', 'माँगी गई मात्रा'), qs: T2('Quantity supplied', 'आपूर्ति की मात्रा') };
    const eqm = (p) => { const P = (p.a - p.c) / (p.b + p.d); return { P, Q: p.a - p.b * P }; };
    const ymOf = (p) => nice(((p.a + 3 * p.step) / p.b) * 1.05);
    const xmOf = (p) => nice((p.a + 3 * p.step) * 1.05);
    const qd = (p, P) => Math.max(0, p.a - p.b * P);
    const qs = (p, P) => Math.max(0, p.c + p.d * P);
    const ctls = fx ? ["fixedAt"] : ["ceilingAt", "floorAt"];
    const spec = { a: [5, 100000, 0, fx ? 260 : 100], b: [0.01, 1000, 0, 2], c: [-100000, 100000, 0, fx ? 20 : 10], d: [0.01, 1000, 0, 1], step: [0.5, 100000, 0, fx ? 20 : 10] };
    spec[PN] = [0, 1e7, 0, (p) => Math.min(r05(eqm(p).P * 1.3), ymOf(p))];
    if (fx) spec.fixedAt = [0, 1e7, 0, (p) => r05(eqm(p).P * 0.9)];
    else { spec.ceilingAt = [0, 1e7, 0, (p) => r05(eqm(p).P * 0.7)]; spec.floorAt = [0, 1e7, 0, (p) => Math.min(r05(eqm(p).P * 1.3), ymOf(p))]; }
    const pTxt = (v) => (fx ? '₹' + fm(v, 2) + ' / $' : rs(v, 2));
    const lim = (S, v) => {
      const p = S.p;
      if (S.tg.fixed) return p.fixedAt;
      if (S.tg.ceiling && v > p.ceilingAt) return p.ceilingAt;
      if (S.tg.floor && v < p.floorAt) return p.floorAt;
      return v;
    };
    function state(S, t) {
      const p = S.p, E = eqm(p), P = S.price, a = qd(p, P), b = qs(p, P), u = t(W_.u);
      if (Math.abs(P - E.P) < 1e-6) return ['ok', fx ? t(T2('Dollars demanded = dollars supplied: this is the equilibrium exchange rate.', 'डॉलर की माँग = डॉलर की आपूर्ति: यही संतुलन विनिमय दर है।')) : t(T2('Demand equals supply: the market clears at the equilibrium price.', 'माँग आपूर्ति के बराबर है: संतुलन कीमत पर बाज़ार साफ़ हो जाता है।'))];
      const gap = fm(Math.abs(a - b), 1) + ' ' + u;
      if (fx) {
        if (S.tg.fixed) return a > b ? ['bad', t(T2(`At the fixed rate people want ${gap} more than is offered. The RBI must sell ${gap} from its reserves to hold the rate.`, `तय दर पर लोग ${gap} ज़्यादा चाहते हैं। दर बनाए रखने के लिए RBI को अपने भंडार से ${gap} बेचने होंगे।`))] : ['warn', t(T2(`At the fixed rate ${gap} more is offered than wanted. The RBI must buy ${gap}, so its reserves grow.`, `तय दर पर ${gap} ज़्यादा डॉलर बिकने आते हैं। RBI को ${gap} ख़रीदने होंगे, इसलिए उसका भंडार बढ़ता है।`))];
        return a > b ? ['bad', t(T2(`Excess demand for dollars: ${gap}. The rate tends to rise: the rupee depreciates.`, `डॉलर की अधिमाँग: ${gap}। दर बढ़ने लगती है: रुपये का मूल्यह्रास होता है।`))] : ['warn', t(T2(`Excess supply of dollars: ${gap}. The rate tends to fall: the rupee appreciates.`, `डॉलर की अधिपूर्ति: ${gap}। दर घटने लगती है: रुपये की मूल्यवृद्धि होती है।`))];
      }
      if (a > b) return ['bad', S.tg.ceiling && P === p.ceilingAt ? t(T2(`Shortage of ${gap} at the price ceiling. The price is not allowed to rise, so some buyers go without: ration shops or black markets can appear.`, `कीमत की ऊपरी सीमा पर ${gap} की कमी। कीमत बढ़ने नहीं दी जाती, इसलिए कुछ ख़रीदार ख़ाली हाथ रहते हैं: राशन की दुकानें या काला बाज़ार बन सकते हैं।`)) : t(T2(`Shortage (excess demand) of ${gap}. Buyers compete, so the price tends to rise.`, `${gap} की कमी (अधिमाँग)। ख़रीदार होड़ करते हैं, इसलिए कीमत बढ़ने लगती है।`))];
      return ['warn', S.tg.floor && P === p.floorAt ? t(T2(`Surplus of ${gap} at the price floor. The price is not allowed to fall, so the government often buys the extra (like grain bought at a minimum support price).`, `कीमत की निचली सीमा पर ${gap} का अधिशेष। कीमत गिरने नहीं दी जाती, इसलिए अक्सर सरकार अतिरिक्त माल ख़रीदती है (जैसे न्यूनतम समर्थन मूल्य पर अनाज)।`)) : t(T2(`Surplus (excess supply) of ${gap}. Sellers cut prices, so the price tends to fall.`, `${gap} का अधिशेष (अधिपूर्ति)। विक्रेता कीमत घटाते हैं, इसलिए कीमत गिरने लगती है।`))];
    }
    const togs = fx ? ['fixed'] : ['ceiling', 'floor'];
    return {
      name: fx ? T2('Foreign exchange market', 'विदेशी मुद्रा बाज़ार') : T2('Demand and supply', 'माँग और आपूर्ति'),
      sub: fx ? T2('The rupee price of a dollar is set by the demand for and supply of dollars.', 'एक डॉलर की रुपये में कीमत डॉलर की माँग और आपूर्ति से तय होती है।') : T2('A market for tomatoes: where demand meets supply, the price settles.', 'टमाटर का बाज़ार: जहाँ माँग और आपूर्ति मिलती हैं, कीमत वहीं टिकती है।'),
      spec, tog: togs, sl: [PN], shifts: true, play: true,
      events: ['equilibrium', 'shifted', 'computed', 'answered:right', 'answered:wrong'],
      check(p) {
        const e = [], E = eqm(p), Y = ymOf(p);
        if (!(p.a > p.c)) return ['a must be greater than c: at price 0 demand must be above supply, or there is no positive equilibrium price'];
        if (!(E.Q > 0)) return ['demand and supply meet at a negative quantity: no equilibrium to draw'];
        if (p[PN] > Y) e.push(`${PN} ${p[PN]} is above the top of the chart (${Y})`);
        ctls.forEach((k) => { if (!(p[k] > 0) || p[k] > Y) e.push(`${k} must be above 0 and at most ${Y}`); });
        if (p.ceiling === 1 && p.floor === 1) e.push('ceiling and floor cannot both be switched on');
        return e;
      },
      init(p) { return { p: Object.assign({}, p), a0: p.a, c0: p.c, xm: xmOf(p), ym: ymOf(p), sh: { demand: 0, supply: 0 }, price: p[PN] }; },
      after(S) { if (S.tg.ceiling && S.tg.floor) S.tg.floor = false; S.price = lim(S, S.price); },
      sliders(S, C) { return [{ name: PN, label: W_.pr, min: 0, max: S.ym, step: 0.5, get: () => S.price, fmt: pTxt, off: () => !!S.tg.fixed }]; },
      togLabel: fx ? { fixed: T2('RBI fixes the rate', 'RBI दर तय करे') } : { ceiling: T2('Price ceiling', 'कीमत की ऊपरी सीमा'), floor: T2('Price floor', 'कीमत की निचली सीमा') },
      shiftLabel: { d: W_.d, s: W_.s },
      playLabel: fx ? T2('Let the market adjust', 'बाज़ार को समायोजित होने दो') : T2('Let the price adjust', 'कीमत को समायोजित होने दो'),
      slide(S, name, v, C) {
        const lv = lim(S, v);
        if (lv !== v) C.toast(S.tg.ceiling ? T2('The ceiling does not let the price go higher.', 'ऊपरी सीमा कीमत को इससे ऊपर नहीं जाने देती।') : T2('The floor does not let the price go lower.', 'निचली सीमा कीमत को इससे नीचे नहीं जाने देती।'));
        S.price = lv;
      },
      release(S, name, C) {
        const E = eqm(S.p);
        if (Math.abs(S.price - E.P) <= 0.51 && lim(S, E.P) === E.P) { S.price = E.P; C.render(); C.emit('equilibrium'); C.live(C.t(T2(`Equilibrium: ${pTxt(E.P)} and ${fm(E.Q, 1)} ${C.t(W_.u)}.`, `संतुलन: ${pTxt(E.P)} और ${fm(E.Q, 1)} ${C.t(W_.u)}।`))); }
        else C.live(state(S, C.t)[1]);
        C.emit('computed');
      },
      toggle(S, n, C) {
        S.tg[n] = !S.tg[n];
        if (n === 'ceiling' && S.tg.ceiling) S.tg.floor = false;
        if (n === 'floor' && S.tg.floor) S.tg.ceiling = false;
        S.price = lim(S, S.price);
        const on = S.tg[n], v = { ceiling: S.p.ceilingAt, floor: S.p.floorAt, fixed: S.p.fixedAt }[n];
        C.live(on ? C.t({ ceiling: T2(`Price ceiling on: the price may not go above ${pTxt(v)}.`, `ऊपरी सीमा लागू: कीमत ${pTxt(v)} से ऊपर नहीं जा सकती।`), floor: T2(`Price floor on: the price may not go below ${pTxt(v)}.`, `निचली सीमा लागू: कीमत ${pTxt(v)} से नीचे नहीं जा सकती।`), fixed: T2(`The RBI holds the rate at ${pTxt(v)} by buying or selling dollars.`, `RBI डॉलर ख़रीद-बेचकर दर को ${pTxt(v)} पर रखता है।`) }[n]) : C.t(T2('Switched off: the market is free again.', 'बंद किया: बाज़ार फिर से मुक्त है।')));
      },
      shift(S, which, dir, C) {
        const k = which === 'demand' ? 'a' : 'c', sg = dir === 'right' ? 1 : -1, n = S.sh[which] + sg;
        if (Math.abs(n) > 3) { C.toast(T2('That is as far as it goes on this chart.', 'इस चार्ट पर इससे आगे नहीं जा सकते।')); return; }
        const np = Object.assign({}, S.p, { [k]: S.p[k] + sg * S.p.step });
        const E = eqm(np);
        if (!(E.P > 0 && E.Q > 0)) { C.toast(T2('The two lines would no longer meet on the chart.', 'तब दोनों रेखाएँ चार्ट पर नहीं मिलेंगी।')); return; }
        S.sh[which] = n;
        const from = S.p[k], to = np[k];
        C.anim(650, (t) => { S.p[k] = lerp(from, to, ease(t)); C.render(); }, () => {
          S.p[k] = to; S.price = lim(S, S.price); C.render();
          const E0 = eqm(Object.assign({}, S.p, { a: S.a0, c: S.c0 }));
          const up = (x, y) => (x > y + 1e-9 ? C.t(T2('higher', 'ज़्यादा')) : x < y - 1e-9 ? C.t(T2('lower', 'कम')) : C.t(T2('the same', 'उतनी ही')));
          const nm = C.t(which === 'demand' ? W_.d : W_.s), dw = C.t(dir === 'right' ? T2('right', 'दाईं ओर') : T2('left', 'बाईं ओर'));
          C.live(C.t(T2(`${nm} moved ${dw}. New equilibrium: ${pTxt(E.P)} and ${fm(E.Q, 1)} ${C.t(W_.u)} (compared with the start: price ${up(E.P, E0.P)}, quantity ${up(E.Q, E0.Q)}). Press Play to let the market get there.`, `${nm} ${dw} खिसकी। नया संतुलन: ${pTxt(E.P)} और ${fm(E.Q, 1)} ${C.t(W_.u)} (शुरुआत की तुलना में: कीमत ${up(E.P, E0.P)}, मात्रा ${up(E.Q, E0.Q)})। बाज़ार को वहाँ पहुँचने देने के लिए Play दबाओ।`)));
          C.record(C.t(T2(`Shifted ${nm} ${dw}`, `${nm} ${dw} खिसकाई`)));
          C.emit('shifted');
        });
      },
      play(S, C) {
        if (S.tg.fixed) { C.toast(T2('The RBI holds the rate fixed. Switch off "RBI fixes the rate" to let it float.', 'RBI दर को तय रखता है। दर को खुला छोड़ने के लिए "RBI दर तय करे" बंद करो।')); return; }
        const E = eqm(S.p), target = lim(S, E.P), from = S.price;
        C.anim(clamp(500 + Math.abs(target - from) * 40, 600, 2200), (t) => { S.price = lerp(from, target, ease(t)); C.render(); }, () => {
          S.price = target; C.render();
          if (Math.abs(target - E.P) < 1e-9) { C.emit('equilibrium'); C.live(C.t(T2(`The market reached equilibrium: ${pTxt(E.P)} and ${fm(E.Q, 1)} ${C.t(W_.u)}. Here no buyer and no seller wants to change.`, `बाज़ार संतुलन पर पहुँच गया: ${pTxt(E.P)} और ${fm(E.Q, 1)} ${C.t(W_.u)}। यहाँ कोई ख़रीदार या विक्रेता बदलाव नहीं चाहता।`))); }
          else C.live(state(S, C.t)[1]);
          C.emit('computed');
        });
      },
      svg(S, X) {
        const p = S.p, t = X.t, E = eqm(p);
        const F = frame({ W: X.W, H: X.H, x: [0, S.xm], y: [0, S.ym], cid: X.cid, narrow: X.narrow, xl: t(W_.x), yl: t(W_.y), xf: (v) => fm(v, 1), yf: (v) => fm(v, 1) });
        let g = F.svg;
        const dLine = (a, cls) => seg(F, a, 0, 0, a / p.b, COL.d, cls);
        const sLine = (c, cls) => { const p0 = Math.max(0, -c / p.d), p1 = S.ym * 1.4; return seg(F, c + p.d * p0, p0, c + p.d * p1, p1, COL.s, cls); };
        const shD = Math.abs(p.a - S.a0) > 1e-9, shS = Math.abs(p.c - S.c0) > 1e-9;
        if (shD) g += dLine(S.a0, 'ec-ghost');
        if (shS) g += sLine(S.c0, 'ec-ghost');
        // price ceiling / floor / fixed rate
        const ctlLine = (v, col, s) => `<path d="M${F.l} ${r1(F.sy(v))}H${r1(F.r)}" stroke="${col}" stroke-width="3" stroke-dasharray="10 5"/>` + lab(F.r - 6, F.sy(v) - 8, s, col, 'end', 'ec-sm');
        if (S.tg.ceiling) g += ctlLine(p.ceilingAt, COL.red, t(T2('Price ceiling ', 'ऊपरी सीमा ')) + pTxt(p.ceilingAt));
        if (S.tg.floor) g += ctlLine(p.floorAt, COL.g, t(T2('Price floor ', 'निचली सीमा ')) + pTxt(p.floorAt));
        if (S.tg.fixed) g += ctlLine(p.fixedAt, COL.e, t(T2('Fixed rate ', 'तय दर ')) + pTxt(p.fixedAt));
        g += dLine(p.a) + sLine(p.c);
        // curve names
        const lp = S.ym * 0.1, ldq = p.a - p.b * lp;
        g += lab(Math.min(F.sx(ldq) + 8, F.r - 4), F.sy(lp) - 8, t(W_.d) + (shD ? '₁' : ''), COL.d, F.sx(ldq) + 8 > F.r - 70 ? 'end' : 'start');
        const sp = Math.min(S.ym * 0.9, (S.xm * 0.9 - p.c) / p.d), sq = p.c + p.d * sp;
        g += lab(F.sx(sq) + (F.sx(sq) > F.r - 90 ? -10 : 10), F.sy(sp) + 4, t(W_.s) + (shS ? '₁' : ''), COL.s, F.sx(sq) > F.r - 90 ? 'end' : 'start');
        if (shD) g += lab(F.sx(S.a0 - p.b * lp) + 8, F.sy(lp) + 18, t(W_.d) + '₀', '#64748B', 'start', 'ec-sm');
        if (shS) { const sp0 = Math.min(S.ym * 0.78, (S.xm * 0.8 - S.c0) / p.d); g += lab(F.sx(S.c0 + p.d * sp0) + 10, F.sy(sp0) + 4, t(W_.s) + '₀', '#64748B', 'start', 'ec-sm'); }
        // equilibrium
        const ex = F.sx(E.Q), ey = F.sy(E.P);
        g += `<path d="M${F.l} ${r1(ey)}H${r1(ex)}V${r1(F.b)}" class="ec-guide"/>`;
        if (shD || shS) { const E0 = eqm(Object.assign({}, p, { a: S.a0, c: S.c0 })); g += dot(F.sx(E0.Q), F.sy(E0.P), '#64748B', 6, true) + lab(F.sx(E0.Q) - 10, F.sy(E0.P) - 10, 'E₀', '#64748B', 'end', 'ec-sm'); }
        g += `<circle cx="${r1(ex)}" cy="${r1(ey)}" r="14" fill="#8B3DFF" opacity=".16"/>` + dot(ex, ey, '#6D28D9', 7) + lab(ex + 12, ey - 12, shD || shS ? 'E₁' : 'E', '#6D28D9', 'start');
        g += pill(F.l + 4, ey, pTxt(E.P), '#6D28D9', 'start') + pill(ex, F.b - 14, fm(E.Q, 1), '#6D28D9', 'middle');
        // current price line: shortage or surplus
        const P = S.price;
        if (Math.abs(P - E.P) > 1e-6) {
          const a = qd(p, P), b = qs(p, P), y = F.sy(P), lo = Math.min(a, b), hi = Math.max(a, b), short = a > b;
          const col = short ? COL.red : COL.gold;
          g += `<path d="M${F.l} ${r1(y)}H${r1(F.r)}" stroke="#334155" stroke-width="1.6" stroke-dasharray="3 4"/>`;
          g += `<rect x="${r1(F.sx(lo))}" y="${r1(y - 7)}" width="${r1(Math.max(2, F.sx(hi) - F.sx(lo)))}" height="14" rx="7" fill="${col}" opacity=".28"/>`;
          if (a > 0 || P <= p.a / p.b) g += dot(F.sx(a), y, COL.d, 6);
          if (b > 0) g += dot(F.sx(b), y, COL.s, 6);
          const mid = (F.sx(lo) + F.sx(hi)) / 2;
          const word = fx ? (short ? t(T2('Excess demand ', 'अधिमाँग ')) : t(T2('Excess supply ', 'अधिपूर्ति '))) : short ? t(T2('Shortage ', 'कमी ')) : t(T2('Surplus ', 'अधिशेष '));
          const above = y > F.t + 40;
          g += lab(clamp(mid, F.l + 70, F.r - 70), above ? y - 14 : y + 24, word + fm(hi - lo, 1), col, 'middle', 'ec-sm');
          if (!S.tg.fixed && !(S.tg.ceiling && P === p.ceilingAt && short) && !(S.tg.floor && P === p.floorAt && !short)) {
            const ax = clamp(F.sx(hi) + 22, F.l + 20, F.r - 12);
            g += short ? `<path d="M${r1(ax)} ${r1(y - 4)}V${r1(y - 30)}" stroke="${col}" stroke-width="3"/>` + arrowHead(ax, y - 32, 'up', col, 6) : `<path d="M${r1(ax)} ${r1(y + 4)}V${r1(y + 30)}" stroke="${col}" stroke-width="3"/>` + arrowHead(ax, y + 32, 'down', col, 6);
          }
          g += pill(F.l + 4, y, pTxt(P), '#334155', 'start');
        }
        return g;
      },
      read(S, X) {
        const t = X.t, p = S.p, E = eqm(p), P = S.price, st = state(S, t);
        let h = tiles([[t(W_.pr), pTxt(P), '#334155'], [t(W_.qd), fm(qd(p, P), 1), COL.d], [t(W_.qs), fm(qs(p, P), 1), COL.s]]);
        h += status(st[0], st[1]);
        h += formula(t(T2(`Equilibrium where demand = supply: ${pTxt(E.P)}, ${fm(E.Q, 1)} ${t(W_.u)}`, `संतुलन जहाँ माँग = आपूर्ति: ${pTxt(E.P)}, ${fm(E.Q, 1)} ${t(W_.u)}`)));
        h += note(t(fx ? T2('Demand for $ comes from imports, study and travel abroad; supply of $ from exports, foreign tourists and foreign investment.', '$ की माँग आयात, विदेश में पढ़ाई और यात्रा से आती है; $ की आपूर्ति निर्यात, विदेशी पर्यटकों और विदेशी निवेश से।') : T2('Shift a curve when something other than the price changes: income, tastes, rain, costs.', 'जब कीमत के अलावा कुछ बदले (आय, पसंद, बारिश, लागत), तब वक्र खिसकाओ।')));
        return h;
      },
      quiz(S, r, C) {
        const t = C.t, p = S.p, v = ri(r, 0, 2);
        if (v === 0) {
          const E = eqm(p);
          let P = r05(E.P * pick(r, [0.6, 0.75, 1.25, 1.4]));
          P = clamp(P, 0.5, p.a / p.b - 0.5);
          const a = qd(p, P), b = qs(p, P), u = t(W_.u), gap = fm(Math.abs(a - b), 1) + ' ' + u;
          const sh = fx ? t(T2(`Excess demand of ${gap}`, `${gap} की अधिमाँग`)) : t(T2(`A shortage of ${gap}`, `${gap} की कमी`));
          const su = fx ? t(T2(`Excess supply of ${gap}`, `${gap} की अधिपूर्ति`)) : t(T2(`A surplus of ${gap}`, `${gap} का अधिशेष`));
          const eq = t(T2('Equilibrium', 'संतुलन'));
          return mcq(r, t(T2(`At ${pTxt(P)}, ${fm(a, 1)} ${u} is demanded and ${fm(b, 1)} ${u} is supplied. What does the market have?`, `${pTxt(P)} पर ${fm(a, 1)} ${u} की माँग है और ${fm(b, 1)} ${u} की आपूर्ति। बाज़ार में क्या है?`)), a > b ? sh : su, [a > b ? su : sh, eq], t(T2(a > b ? 'Demand is more than supply, so there is a gap of the difference: the price will tend to rise.' : 'Supply is more than demand, so the extra is left unsold: the price will tend to fall.', a > b ? 'माँग आपूर्ति से ज़्यादा है, इसलिए अंतर जितनी कमी है: कीमत बढ़ने लगेगी।' : 'आपूर्ति माँग से ज़्यादा है, इसलिए अतिरिक्त माल बिना बिके रहता है: कीमत गिरने लगेगी।')));
        }
        if (v === 1) {
          const cases = fx
            ? [[T2('More Indian students go to study abroad and need dollars.', 'ज़्यादा भारतीय छात्र विदेश पढ़ने जाते हैं और उन्हें डॉलर चाहिए।'), 'dr'], [T2('Many more foreign tourists visit India and change their dollars.', 'बहुत ज़्यादा विदेशी पर्यटक भारत आते हैं और डॉलर बदलवाते हैं।'), 'sr'], [T2('India buys much less oil from abroad.', 'भारत विदेश से बहुत कम तेल ख़रीदता है।'), 'dl'], [T2('Foreign companies stop investing in India.', 'विदेशी कंपनियाँ भारत में निवेश करना बंद कर देती हैं।'), 'sl']]
            : [[T2('Incomes rise and people want more tomatoes at every price.', 'आय बढ़ती है और लोग हर कीमत पर ज़्यादा टमाटर चाहते हैं।'), 'dr'], [T2('A very good harvest brings more tomatoes at every price.', 'बहुत अच्छी फ़सल से हर कीमत पर ज़्यादा टमाटर आते हैं।'), 'sr'], [T2('A health scare makes people buy fewer tomatoes at every price.', 'सेहत के डर से लोग हर कीमत पर कम टमाटर ख़रीदते हैं।'), 'dl'], [T2('Floods destroy part of the crop.', 'बाढ़ से फ़सल का कुछ हिस्सा बर्बाद हो जाता है।'), 'sl']];
          const [cs, k] = pick(r, cases);
          const res = fx
            ? { dr: T2('The rate rises: the rupee depreciates', 'दर बढ़ती है: रुपये का मूल्यह्रास'), sr: T2('The rate falls: the rupee appreciates', 'दर घटती है: रुपये की मूल्यवृद्धि'), dl: T2('The rate falls: the rupee appreciates', 'दर घटती है: रुपये की मूल्यवृद्धि'), sl: T2('The rate rises: the rupee depreciates', 'दर बढ़ती है: रुपये का मूल्यह्रास') }
            : { dr: T2('Price rises and quantity rises', 'कीमत बढ़ती है और मात्रा बढ़ती है'), sr: T2('Price falls and quantity rises', 'कीमत घटती है और मात्रा बढ़ती है'), dl: T2('Price falls and quantity falls', 'कीमत घटती है और मात्रा घटती है'), sl: T2('Price rises and quantity falls', 'कीमत बढ़ती है और मात्रा घटती है') };
          const all = fx ? [res.dr, res.sr, T2('Nothing changes', 'कुछ नहीं बदलता')] : [res.dr, res.sr, res.dl, res.sl];
          const why = { dr: T2('Demand moves right; the new meeting point is higher up.', 'माँग दाईं ओर खिसकती है; नया मिलन-बिंदु ऊपर होता है।'), sr: T2('Supply moves right; the new meeting point is lower down and further right.', 'आपूर्ति दाईं ओर खिसकती है; नया मिलन-बिंदु नीचे और दाईं ओर होता है।'), dl: T2('Demand moves left; the new meeting point is lower down.', 'माँग बाईं ओर खिसकती है; नया मिलन-बिंदु नीचे होता है।'), sl: T2('Supply moves left; the new meeting point is higher up and further left.', 'आपूर्ति बाईं ओर खिसकती है; नया मिलन-बिंदु ऊपर और बाईं ओर होता है।') }[k];
          return mcq(r, t(cs) + ' ' + t(T2('What happens?', 'क्या होगा?')), t(res[k]), all.map(t), t(why) + (fx ? ' ' + t(T2('More rupees per dollar means a weaker rupee.', 'एक डॉलर के ज़्यादा रुपये मतलब कमज़ोर रुपया।')) : ''));
        }
        const E = eqm(p);
        const f = (x) => pTxt(x);
        const qn = fx ? 'e' : 'P';
        return mcq(r, t(T2(`Demand: Qd = ${fm(p.a)} − ${fm(p.b)}${qn}. Supply: Qs = ${fm(p.c)} + ${fm(p.d)}${qn}. What is the equilibrium ${fx ? 'exchange rate' : 'price'}?`, `माँग: Qd = ${fm(p.a)} − ${fm(p.b)}${qn}। आपूर्ति: Qs = ${fm(p.c)} + ${fm(p.d)}${qn}। संतुलन ${fx ? 'विनिमय दर' : 'कीमत'} क्या है?`)).replace('+ −', '− '), f(E.P), numOpts(E.P, [(p.a + p.c) / (p.b + p.d), p.a / p.b, (p.a - p.c) / Math.max(0.01, Math.abs(p.b - p.d))], f), t(T2(`Set Qd = Qs: ${fm(p.a)} − ${fm(p.b)}${qn} = ${fm(p.c)} + ${fm(p.d)}${qn}, so ${qn} = (${fm(p.a)} − ${fm(p.c)}) ÷ (${fm(p.b)} + ${fm(p.d)}) = ${fm(E.P, 2)}.`, `Qd = Qs रखो: ${fm(p.a)} − ${fm(p.b)}${qn} = ${fm(p.c)} + ${fm(p.d)}${qn}, इसलिए ${qn} = (${fm(p.a)} − ${fm(p.c)}) ÷ (${fm(p.b)} + ${fm(p.d)}) = ${fm(E.P, 2)}।`)));
      },
    };
  }
  MODES['demand-supply'] = market(false);
  MODES['exchange-rate'] = market(true);

  // ---- price elasticity of demand on a straight-line demand curve
  MODES.elasticity = (() => {
    const pm = (p) => p.a / p.b;
    const el = (p, P) => { const q = p.a - p.b * P; return q <= 1e-12 ? Infinity : (p.b * P) / q; };
    const kind = (e) => (e === Infinity ? 'inf' : Math.abs(e - 1) < 0.005 ? 'unit' : e < 1e-9 ? 'zero' : e > 1 ? 'el' : 'inel');
    const KW = {
      inf: T2('Demand here is perfectly elastic (e is infinitely large): this is where the line meets the price axis.', 'यहाँ माँग पूर्णतः लोचदार है (e अनंत): यहाँ रेखा कीमत-अक्ष से मिलती है।'),
      unit: T2('Unitary elastic (e = 1): the middle of the line. A small price change leaves spending the same.', 'इकाई लोच (e = 1): रेखा का बीच। कीमत के छोटे बदलाव से ख़र्च वही रहता है।'),
      zero: T2('Perfectly inelastic point (e = 0): where the line meets the quantity axis.', 'पूर्णतः बेलोच बिंदु (e = 0): जहाँ रेखा मात्रा-अक्ष से मिलती है।'),
      el: T2('Elastic (e > 1): a 1% rise in price cuts the quantity by more than 1%, so spending falls when the price rises.', 'लोचदार (e > 1): कीमत 1% बढ़ने पर मात्रा 1% से ज़्यादा घटती है, इसलिए कीमत बढ़ने पर ख़र्च घटता है।'),
      inel: T2('Inelastic (e < 1): a 1% rise in price cuts the quantity by less than 1%, so spending rises when the price rises.', 'बेलोच (e < 1): कीमत 1% बढ़ने पर मात्रा 1% से कम घटती है, इसलिए कीमत बढ़ने पर ख़र्च बढ़ता है।'),
    };
    return {
      name: T2('Price elasticity of demand', 'माँग की कीमत लोच'),
      sub: T2('Move along a straight demand line and watch e change from 0 to very large.', 'माँग की सीधी रेखा पर चलो और देखो e कैसे 0 से बहुत बड़ा होता जाता है।'),
      spec: { a: [5, 100000, 0, 100], b: [0.01, 1000, 0, 2], price: [0, 1e7, 0, (p) => r05(pm(p) * 0.3)] },
      tog: ['expenditure'], togDef: { expenditure: 1 }, sl: ['price'], play: true,
      events: ['computed', 'answered:right', 'answered:wrong'],
      check(p) { return p.price > pm(p) + 1e-9 ? [`price must be at most a ÷ b = ${fm(pm(p))} (there the quantity demanded is 0)`] : []; },
      init(p) { const M = pm(p); return { p, price: p.price, xm: nice(p.a * 1.05), ym: nice(M * 1.08), step: M >= 20 ? 0.5 : M >= 4 ? 0.1 : 0.01 }; },
      sliders(S) { return [{ name: 'price', label: T2('Price', 'कीमत'), min: 0, max: pm(S.p), step: S.step, get: () => S.price, fmt: (v) => rs(v, 2) }]; },
      togLabel: { expenditure: T2('Show spending (P × Q)', 'ख़र्च दिखाओ (P × Q)') },
      playLabel: T2('Sweep the price from 0 to the top', 'कीमत को 0 से ऊपर तक ले जाओ'),
      slide(S, n, v) { S.price = v; },
      release(S, n, C) {
        const M = pm(S.p);
        if (Math.abs(S.price - M / 2) <= S.step * 0.6) { S.price = M / 2; C.render(); }
        C.live(C.t(T2('e = ', 'e = ')) + fm(el(S.p, S.price), 2) + '. ' + C.t(KW[kind(el(S.p, S.price))]));
        C.emit('computed');
      },
      play(S, C) {
        const start = S.price, M = pm(S.p);
        S.tg.expenditure = true;
        C.anim(5200, (t) => { S.price = M * t; C.render(); }, () => {
          C.anim(600, (t) => { S.price = lerp(M, start, ease(t)); C.render(); }, () => {
            S.price = start; C.render();
            C.live(C.t(T2(`Spending P × Q was largest, ${rs((S.p.a * S.p.a) / (4 * S.p.b), 2)}, at the middle of the line where e = 1. Below the middle demand is inelastic; above it, elastic.`, `ख़र्च P × Q सबसे ज़्यादा, ${rs((S.p.a * S.p.a) / (4 * S.p.b), 2)}, रेखा के बीच में था जहाँ e = 1। बीच से नीचे माँग बेलोच है; ऊपर लोचदार।`)));
            C.emit('computed');
          });
        });
      },
      svg(S, X) {
        const p = S.p, t = X.t, P = S.price, q = p.a - p.b * P, e = el(p, P), M = pm(p);
        const F = frame({ W: X.W, H: X.H, x: [0, S.xm], y: [0, S.ym], cid: X.cid, narrow: X.narrow, xl: t(T2('Quantity demanded (units)', 'माँगी गई मात्रा (इकाइयाँ)')), yl: t(T2('Price (₹ per unit)', 'कीमत (₹ प्रति इकाई)')), xf: (v) => fm(v, 1), yf: (v) => fm(v, 1) });
        let g = F.svg;
        if (S.tg.expenditure && q > 0 && P > 0) {
          const w = F.sx(q) - F.l, h = F.b - F.sy(P);
          g += `<rect x="${F.l}" y="${r1(F.sy(P))}" width="${r1(w)}" height="${r1(h)}" fill="#14B8A6" fill-opacity=".2" stroke="#0F766E" stroke-width="1.5"/>`;
          if (w > 110 && h > 34) g += lab(F.l + w / 2, F.sy(P) + h / 2 + 5, t(T2('Spending ', 'ख़र्च ')) + rs(P * q, 0), COL.teal, 'middle', 'ec-sm');
        }
        g += `<path d="M${r1(F.sx(q))} ${r1(F.sy(P))}L${r1(F.sx(p.a))} ${r1(F.sy(0))}" stroke="#22C55E" stroke-width="13" stroke-opacity=".35" stroke-linecap="round" ${F.clip}/>`;
        g += `<path d="M${r1(F.sx(0))} ${r1(F.sy(M))}L${r1(F.sx(q))} ${r1(F.sy(P))}" stroke="#8B3DFF" stroke-width="13" stroke-opacity=".28" stroke-linecap="round" ${F.clip}/>`;
        g += seg(F, p.a, 0, 0, M, COL.d);
        g += dot(F.sx(p.a / 2), F.sy(M / 2), COL.e, 5, true) + lab(F.sx(p.a / 2) + 10, F.sy(M / 2) - 10, 'e = 1', COL.e, 'start', 'ec-sm');
        g += lab(F.sx(p.a * 0.18) + 12, F.sy(M * 0.82), t(T2('e > 1: elastic', 'e > 1: लोचदार')), COL.e, 'start', 'ec-sm');
        g += lab(F.sx(p.a * 0.8) + 10, F.sy(M * 0.2) - 4, t(T2('e < 1: inelastic', 'e < 1: बेलोच')), COL.g, 'start', 'ec-sm');
        g += lab(F.sx(p.a) - 6, F.b - 10, t(T2('D', 'D')), COL.d, 'end');
        const px = F.sx(q), py = F.sy(P);
        g += `<path d="M${F.l} ${r1(py)}H${r1(px)}V${r1(F.b)}" class="ec-guide"/>`;
        g += `<circle cx="${r1(px)}" cy="${r1(py)}" r="15" fill="#FFD23F" opacity=".35"/>` + dot(px, py, '#1E293B', 7);
        const es = 'e = ' + fm(e, 2);
        g += lab(px + 14 > F.r - 80 ? px - 14 : px + 14, py - 12, es, '#1E293B', px + 14 > F.r - 80 ? 'end' : 'start');
        g += pill(F.l + 4, py, rs(P, 2), '#334155', 'start') + pill(px, F.b - 14, fm(q, 1), '#334155', 'middle');
        return g;
      },
      read(S, X) {
        const t = X.t, p = S.p, P = S.price, q = p.a - p.b * P, e = el(p, P), M = pm(p), k = kind(e);
        let h = tiles([[t(T2('Price', 'कीमत')), rs(P, 2), '#334155'], [t(T2('Quantity', 'मात्रा')), fm(q, 1), COL.d], [t(T2('Elasticity e', 'लोच e')), fm(e, 2), COL.e], [t(T2('Spending P × Q', 'ख़र्च P × Q')), rs(P * q, 0), COL.teal]]);
        h += status(k === 'unit' ? 'ok' : 'warn', t(KW[k]));
        h += formula(`e = (ΔQ ÷ ΔP) × (P ÷ Q) = ${fm(p.b)} × ${fm(P, 2)} ÷ ${fm(q, 1)} = ${fm(e, 2)}`);
        h += formula(t(T2(`Geometric method: lower segment ÷ upper segment = ${fm(P, 2)} ÷ ${fm(M - P, 2)} = ${fm(e, 2)}`, `ज्यामितीय विधि: निचला खंड ÷ ऊपरी खंड = ${fm(P, 2)} ÷ ${fm(M - P, 2)} = ${fm(e, 2)}`)));
        return h;
      },
      quiz(S, r, C) {
        const t = C.t, p = S.p, M = pm(S.p);
        const kinds = { el: T2('Elastic (e > 1)', 'लोचदार (e > 1)'), unit: T2('Unitary elastic (e = 1)', 'इकाई लोच (e = 1)'), inel: T2('Inelastic (e < 1)', 'बेलोच (e < 1)') };
        if (r() < 0.5) {
          const f = pick(r, [0.25, 0.5, 0.75, 0.2, 0.8]), P = M * f, q = p.a - p.b * P, e = el(p, P), k = kind(e);
          return mcq(r, t(T2(`Demand: Q = ${fm(p.a)} − ${fm(p.b)}P. At a price of ${rs(P, 2)}, Q = ${fm(q, 2)}. What kind of demand is this?`, `माँग: Q = ${fm(p.a)} − ${fm(p.b)}P। ${rs(P, 2)} की कीमत पर Q = ${fm(q, 2)}। यह कैसी माँग है?`)), t(kinds[k]), [t(kinds.el), t(kinds.unit), t(kinds.inel)], t(T2(`e = b × P ÷ Q = ${fm(p.b)} × ${fm(P, 2)} ÷ ${fm(q, 2)} = ${fm(e, 2)}.`, `e = b × P ÷ Q = ${fm(p.b)} × ${fm(P, 2)} ÷ ${fm(q, 2)} = ${fm(e, 2)}।`)));
        }
        const dp = pick(r, [10, 20, 25, 50]), dq = pick(r, [5, 10, 20, 30, 40, 50].filter((x) => x !== dp)), e = dq / dp;
        return mcq(r, t(T2(`The price of a notebook rises by ${dp}% and the quantity demanded falls by ${dq}%. What is the price elasticity of demand?`, `एक कॉपी की कीमत ${dp}% बढ़ती है और माँगी गई मात्रा ${dq}% घटती है। माँग की कीमत लोच क्या है?`)), fm(e, 2), [fm(dp / dq, 2), fm(dq - dp, 2), fm(dq * dp / 100, 2)], t(T2(`e = % change in quantity ÷ % change in price = ${dq} ÷ ${dp} = ${fm(e, 2)}, so demand is ${e > 1 ? 'elastic' : e < 1 ? 'inelastic' : 'unitary elastic'}.`, `e = मात्रा में % बदलाव ÷ कीमत में % बदलाव = ${dq} ÷ ${dp} = ${fm(e, 2)}, इसलिए माँग ${e > 1 ? 'लोचदार' : e < 1 ? 'बेलोच' : 'इकाई लोच वाली'} है।`)));
      },
    };
  })();

  // ---- short-run costs (shared by the revenue mode)
  const costSpec = { tfc: [0, 1e7, 0, 60], alpha: [0.01, 1e7, 0, 30], beta: [0, 1e7, 0, 3], gamma: [0.0001, 1e6, 0, 0.2] };
  const costCheck = (p) => (3 * p.alpha * p.gamma > p.beta * p.beta ? [] : ['alpha must be greater than beta² ÷ (3 × gamma), or MC would drop below zero (impossible)']);
  function costFns(p) {
    const A = p.alpha, B = p.beta, G = p.gamma, tfc = p.tfc;
    const TVC = (q) => A * q - B * q * q + G * q * q * q;
    const AVC = (q) => A - B * q + G * q * q;
    const MC = (q) => A - 2 * B * q + 3 * G * q * q;
    const AFC = (q) => (q > 0 ? tfc / q : Infinity);
    const AC = (q) => (q > 0 ? tfc / q + AVC(q) : Infinity);
    const TC = (q) => tfc + TVC(q);
    let lo = 1e-6, hi = Math.max(60, (B / G) * 4 + 10);
    for (let i = 0; i < 90; i++) { const m = (lo + hi) / 2; if (-tfc / (m * m) - B + 2 * G * m < 0) lo = m; else hi = m; }
    return { TVC, AVC, MC, AFC, AC, TC, qAVC: B / (2 * G), qMC: B / (3 * G), qAC: (lo + hi) / 2 };
  }
  const CN = {
    TFC: [T2('Total fixed cost (TFC)', 'कुल स्थिर लागत (TFC)'), '#64748B'], TVC: [T2('Total variable cost (TVC)', 'कुल परिवर्ती लागत (TVC)'), COL.teal], TC: [T2('Total cost (TC)', 'कुल लागत (TC)'), COL.d],
    AFC: [T2('Average fixed cost (AFC)', 'औसत स्थिर लागत (AFC)'), '#64748B'], AVC: [T2('Average variable cost (AVC)', 'औसत परिवर्ती लागत (AVC)'), COL.teal], AC: [T2('Average cost (AC)', 'औसत लागत (AC)'), COL.d], MC: [T2('Marginal cost (MC)', 'सीमांत लागत (MC)'), COL.s],
  };
  const costRow = (t, k, v) => `<tr><td><i class="ec-dot" style="background:${CN[k][1]}"></i>${esc(t(CN[k][0]))}</td><td>${esc(isFinite(v) ? rs(v, 2) : '—')}</td></tr>`;

  MODES.costs = {
    name: T2('Costs of production', 'उत्पादन की लागत'),
    sub: T2('A small bakery: fixed costs (rent) and variable costs (flour, wages). Watch how average and marginal costs move.', 'एक छोटी बेकरी: स्थिर लागत (किराया) और परिवर्ती लागत (आटा, मज़दूरी)। देखो औसत और सीमांत लागत कैसे बदलती हैं।'),
    spec: Object.assign({}, costSpec, { qmax: [4, 40, 0, 10], q: [0, 40, 0, (p) => p.qmax / 2] }),
    tog: ['totals'], sl: ['q', 'tfc'], play: true,
    events: ['computed', 'answered:right', 'answered:wrong'],
    check(p) { const e = costCheck(p); if (p.q > p.qmax) e.push('q must be at most qmax'); return e; },
    init(p) {
      const S = { p: Object.assign({}, p), q: p.q, tfcMax: nice(Math.max(2 * p.tfc, 100)) };
      const c = costFns(Object.assign({}, p, { tfc: S.tfcMax }));
      S.ymU = nice(1.3 * Math.max(c.MC(p.qmax), c.AVC(p.qmax) + S.tfcMax / p.qmax, p.alpha));
      S.ymT = nice(1.1 * c.TC(p.qmax));
      return S;
    },
    sliders(S) { return [{ name: 'q', label: T2('Output (loaves)', 'उत्पादन (पाव)'), min: 0, max: S.p.qmax, step: 0.5, get: () => S.q, fmt: (v) => fm(v, 1) }, { name: 'tfc', label: T2('Fixed cost: rent (₹)', 'स्थिर लागत: किराया (₹)'), min: 0, max: S.tfcMax, step: 1, get: () => S.p.tfc, fmt: (v) => rs(v, 0) }]; },
    togLabel: { totals: T2('Show total costs', 'कुल लागतें दिखाओ') },
    playLabel: T2('Raise output step by step', 'उत्पादन धीरे-धीरे बढ़ाओ'),
    slide(S, n, v) { if (n === 'q') S.q = v; else S.p.tfc = v; },
    release(S, n, C) { C.live(MODES.costs.say(S, C.t)); C.emit('computed'); },
    say(S, t) {
      const c = costFns(S.p), q = S.q;
      if (q <= 0) return t(T2('At zero output there is no variable cost, but the fixed cost (rent) must still be paid.', 'शून्य उत्पादन पर परिवर्ती लागत नहीं होती, पर स्थिर लागत (किराया) फिर भी देनी पड़ती है।'));
      const mc = c.MC(q), ac = c.AC(q);
      if (Math.abs(mc - ac) < 0.05 * ac) return t(T2('MC = AC here: AC is at its lowest point.', 'यहाँ MC = AC: AC अपने सबसे निचले बिंदु पर है।'));
      return mc < ac ? t(T2('MC is below AC, so each extra loaf pulls the average down: AC is falling.', 'MC, AC से नीचे है, इसलिए हर अतिरिक्त पाव औसत को नीचे खींचता है: AC घट रही है।')) : t(T2('MC is above AC, so each extra loaf pulls the average up: AC is rising.', 'MC, AC से ऊपर है, इसलिए हर अतिरिक्त पाव औसत को ऊपर खींचता है: AC बढ़ रही है।'));
    },
    play(S, C) {
      const qm = S.p.qmax;
      C.anim(4500, (t) => { S.q = qm * t; C.render(); }, () => {
        S.q = qm; C.render();
        const c = costFns(S.p);
        C.live(C.t(T2(`AVC is lowest at ${fm(c.qAVC, 1)} loaves (${rs(c.AVC(c.qAVC), 2)}) and AC at ${fm(c.qAC, 1)} loaves (${rs(c.AC(c.qAC), 2)}). The MC curve passes through both lowest points.`, `AVC सबसे कम ${fm(c.qAVC, 1)} पाव पर है (${rs(c.AVC(c.qAVC), 2)}) और AC ${fm(c.qAC, 1)} पाव पर (${rs(c.AC(c.qAC), 2)})। MC वक्र दोनों निचले बिंदुओं से होकर जाता है।`)));
        C.emit('computed');
      });
    },
    svg(S, X) {
      const p = S.p, t = X.t, c = costFns(p), q = S.q, qm = p.qmax;
      const xl = t(T2('Output (loaves per hour)', 'उत्पादन (पाव प्रति घंटा)'));
      if (S.tg.totals) {
        const F = frame({ W: X.W, H: X.H, x: [0, qm], y: [0, S.ymT], cid: X.cid, narrow: X.narrow, xl, yl: t(T2('Total cost (₹)', 'कुल लागत (₹)')), xf: (v) => fm(v, 1), yf: (v) => fm(v, 0) });
        let g = F.svg;
        g += seg(F, 0, p.tfc, qm, p.tfc, '#64748B', 'ec-thin');
        g += fpath(F, c.TVC, 0, qm, COL.teal) + fpath(F, c.TC, 0, qm, COL.d);
        g += endLabels([{ x: F.r - 6, y: F.sy(c.TC(qm)) - 8, s: 'TC', col: COL.d }, { x: F.r - 6, y: F.sy(c.TVC(qm)) + 18, s: 'TVC', col: COL.teal }, { x: F.r - 6, y: F.sy(p.tfc) - 8, s: 'TFC', col: '#475569' }], F.t + 12, F.b - 6);
        const x = F.sx(q);
        g += `<path d="M${r1(x)} ${F.t}V${F.b}" class="ec-guide"/>`;
        if (p.tfc > 0) g += `<path d="M${r1(x + 10)} ${r1(F.sy(c.TVC(q)))}V${r1(F.sy(c.TC(q)))}" stroke="#475569" stroke-width="2"/>` + lab(x + 16, (F.sy(c.TVC(q)) + F.sy(c.TC(q))) / 2 + 4, 'TFC', '#475569', 'start', 'ec-sm');
        g += dot(x, F.sy(c.TC(q)), COL.d) + dot(x, F.sy(c.TVC(q)), COL.teal) + dot(x, F.sy(p.tfc), '#64748B', 5);
        return g;
      }
      const F = frame({ W: X.W, H: X.H, x: [0, qm], y: [0, S.ymU], cid: X.cid, narrow: X.narrow, xl, yl: t(T2('Cost per loaf (₹)', 'प्रति पाव लागत (₹)')), xf: (v) => fm(v, 1), yf: (v) => fm(v, 0) });
      let g = F.svg;
      const q0 = qm / 160;
      if (p.tfc > 0) g += fpath(F, c.AFC, q0, qm, '#64748B', 'ec-thin');
      g += fpath(F, c.AVC, q0, qm, COL.teal) + fpath(F, c.AC, q0, qm, COL.d) + fpath(F, c.MC, 0, qm, COL.s);
      const lb = [{ x: F.r - 6, y: F.sy(c.AC(qm)) - 6, s: 'AC', col: COL.d }, { x: F.r - 6, y: F.sy(c.AVC(qm)) + 4, s: 'AVC', col: COL.teal }, { x: F.r - 6, y: F.sy(c.MC(qm)) - 6, s: 'MC', col: COL.s }];
      if (p.tfc > 0) lb.push({ x: F.r - 6, y: F.sy(c.AFC(qm)) - 6, s: 'AFC', col: '#475569' });
      g += endLabels(lb.map((o) => Object.assign(o, { y: clamp(o.y, F.t + 12, F.b - 6) })), F.t + 12, F.b - 6);
      if (c.qAVC > 0 && c.qAVC < qm) g += dot(F.sx(c.qAVC), F.sy(c.AVC(c.qAVC)), COL.teal, 6, true) + lab(F.sx(c.qAVC), F.sy(c.AVC(c.qAVC)) + 22, t(T2('lowest AVC', 'न्यूनतम AVC')), COL.teal, 'middle', 'ec-sm');
      if (c.qAC < qm && c.AC(c.qAC) < S.ymU) g += dot(F.sx(c.qAC), F.sy(c.AC(c.qAC)), COL.d, 6, true) + lab(F.sx(c.qAC) - 10, F.sy(c.AC(c.qAC)) - 12, t(T2('lowest AC', 'न्यूनतम AC')), COL.d, 'end', 'ec-sm');
      const x = F.sx(q);
      g += `<path d="M${r1(x)} ${F.t}V${F.b}" class="ec-guide"/>`;
      if (q > 0) [['AC', COL.d], ['AVC', COL.teal], ['MC', COL.s]].forEach(([k, col]) => { const v = c[k](q); if (v <= S.ymU) g += dot(x, F.sy(v), col, 5.5); });
      else g += dot(x, F.sy(c.MC(0)), COL.s, 5.5);
      g += pill(x, F.b - 14, 'q = ' + fm(q, 1), '#334155', 'middle');
      return g;
    },
    read(S, X) {
      const t = X.t, c = costFns(S.p), q = S.q;
      let h = `<div class="ec-scroll"><table class="ec-table"><tr><th>${esc(t(T2('At', 'पर')))} q = ${fm(q, 1)}</th><th>₹</th></tr>`;
      h += costRow(t, 'TFC', S.p.tfc) + costRow(t, 'TVC', c.TVC(q)) + costRow(t, 'TC', c.TC(q)) + costRow(t, 'AFC', q > 0 ? c.AFC(q) : NaN) + costRow(t, 'AVC', q > 0 ? c.AVC(q) : NaN) + costRow(t, 'AC', q > 0 ? c.AC(q) : NaN) + costRow(t, 'MC', c.MC(q)) + '</table></div>';
      h += status(q > 0 && c.MC(q) < c.AC(q) ? 'ok' : 'warn', MODES.costs.say(S, t));
      h += formula('TC = TFC + TVC · AC = TC ÷ q = AFC + AVC · MC = ' + t(T2('extra cost of one more loaf', 'एक और पाव की अतिरिक्त लागत')));
      return h;
    },
    quiz(S, r, C) {
      const t = C.t, p = S.p, c = costFns(p), q = ri(r, 2, Math.max(3, Math.floor(p.qmax) - 1)), v = ri(r, 0, 3);
      const f = (x) => rs(x, 2);
      if (v === 0) return mcq(r, t(T2(`At ${q} loaves, TFC = ${f(p.tfc)} and TVC = ${f(c.TVC(q))}. What is the total cost?`, `${q} पाव पर TFC = ${f(p.tfc)} और TVC = ${f(c.TVC(q))}। कुल लागत क्या है?`)), f(c.TC(q)), numOpts(c.TC(q), [c.TVC(q) - p.tfc, c.TVC(q), c.TC(q) / q], f), t(T2('Total cost = fixed cost + variable cost.', 'कुल लागत = स्थिर लागत + परिवर्ती लागत।')));
      if (v === 1 && p.tfc > 0) return mcq(r, t(T2(`The rent (TFC) is ${f(p.tfc)}. What is the average fixed cost at ${q} loaves?`, `किराया (TFC) ${f(p.tfc)} है। ${q} पाव पर औसत स्थिर लागत क्या है?`)), f(p.tfc / q), numOpts(p.tfc / q, [p.tfc, p.tfc * q, p.tfc / (q + 1)], f), t(T2('AFC = TFC ÷ q. As output grows the same rent is spread over more loaves, so AFC keeps falling.', 'AFC = TFC ÷ q। उत्पादन बढ़ने पर वही किराया ज़्यादा पावों में बँटता है, इसलिए AFC घटती रहती है।')));
      if (v === 2) return mcq(r, t(T2('Which cost stays the same however many loaves are made?', 'कितने भी पाव बनें, कौन-सी लागत वही रहती है?')), t(T2('Total fixed cost', 'कुल स्थिर लागत')), [t(T2('Total variable cost', 'कुल परिवर्ती लागत')), t(T2('Marginal cost', 'सीमांत लागत')), t(T2('Average fixed cost', 'औसत स्थिर लागत'))], t(T2('Rent must be paid even at zero output, so TFC is a flat line. AFC falls as output grows.', 'शून्य उत्पादन पर भी किराया देना पड़ता है, इसलिए TFC एक सपाट रेखा है। उत्पादन बढ़ने पर AFC घटती है।')));
      return mcq(r, t(T2('The MC curve cuts the AC curve at which point of AC?', 'MC वक्र, AC वक्र को उसके किस बिंदु पर काटता है?')), t(T2('Its lowest point', 'उसके सबसे निचले बिंदु पर')), [t(T2('Its highest point', 'उसके सबसे ऊँचे बिंदु पर')), t(T2('Where output is zero', 'जहाँ उत्पादन शून्य है')), t(T2('It never cuts AC', 'वह AC को कभी नहीं काटता'))], t(T2('While MC is below AC it pulls AC down; once MC is above, it pulls AC up. So they meet where AC is lowest.', 'जब तक MC, AC से नीचे है वह AC को नीचे खींचता है; ऊपर होते ही ऊपर खींचता है। इसलिए दोनों वहाँ मिलते हैं जहाँ AC सबसे कम है।')));
    },
  };

  // ---- revenue and the firm's best output
  function bestQ(p, comp) {
    const c = costFns(p), a3 = 3 * p.gamma;
    if (comp) {
      const disc = 4 * p.beta * p.beta - 4 * a3 * (p.alpha - p.price);
      if (disc < 0) return 0;
      const q = (2 * p.beta + Math.sqrt(disc)) / (2 * a3);
      return p.price < c.AVC(q) - 1e-9 ? 0 : q;
    }
    const bq = 2 * p.B - 2 * p.beta, disc = bq * bq - 4 * a3 * (p.alpha - p.A);
    if (disc < 0) return 0;
    const q = (-bq + Math.sqrt(disc)) / (2 * a3);
    if (!(q > 0)) return 0;
    return p.A - p.B * q < c.AVC(q) - 1e-9 ? 0 : q;
  }
  MODES.revenue = {
    name: T2('Revenue and the best output', 'संप्राप्ति और सबसे अच्छा उत्पादन'),
    sub: T2('Total, average and marginal revenue, and where a firm earns the most profit.', 'कुल, औसत और सीमांत संप्राप्ति, और फ़र्म को सबसे ज़्यादा लाभ कहाँ मिलता है।'),
    spec: Object.assign({}, costSpec, { price: [0.5, 1e6, 0, 30], A: [1, 1e7, 0, 60], B: [0.001, 1e5, 0, 3], qmax: [4, 40, 0, 12], q: [0, 40, 0, 4] }),
    tog: ['competition', 'totals', 'profit'], togDef: { competition: 1, profit: 1 }, sl: ['q', 'price'], play: true,
    events: ['equilibrium', 'computed', 'answered:right', 'answered:wrong'],
    check(p) {
      const e = costCheck(p);
      if (e.length) return e;
      if (p.q > p.qmax) e.push('q must be at most qmax');
      if (p.A / p.B < 2) e.push('A ÷ B (the output where price falls to 0) must be at least 2');
      if (bestQ(p, true) > p.qmax) e.push('at this price the best output is beyond qmax: raise qmax or lower the price');
      if (bestQ(p, false) > Math.min(p.qmax, p.A / p.B)) e.push('with this demand the best output is beyond qmax: raise qmax');
      return e;
    },
    init(p) {
      const S = { p: Object.assign({}, p), q: p.q, pmax: nice(Math.max(2 * p.price, p.A)) };
      const c = costFns(p);
      S.ymU = nice(1.2 * Math.max(p.A, S.pmax, c.MC(p.qmax)));
      return S;
    },
    after(S) { S.q = Math.min(S.q, MODES.revenue.qhi(S)); },
    qhi(S) { return S.tg.competition ? S.p.qmax : Math.min(S.p.qmax, S.p.A / S.p.B); },
    priceAt(S, q) { return S.tg.competition ? S.p.price : Math.max(0, S.p.A - S.p.B * q); },
    sliders(S) {
      const R = MODES.revenue;
      return [{ name: 'q', label: T2('Output (units)', 'उत्पादन (इकाइयाँ)'), min: 0, max: () => R.qhi(S), step: 0.5, get: () => S.q, fmt: (v) => fm(v, 1) },
        { name: 'price', label: T2('Market price (₹)', 'बाज़ार कीमत (₹)'), min: 0.5, max: S.pmax, step: 0.5, get: () => S.p.price, fmt: (v) => rs(v, 2), off: () => !S.tg.competition }];
    },
    togLabel: { competition: T2('Price-taking firm (perfect competition)', 'कीमत स्वीकार करने वाली फ़र्म (पूर्ण प्रतियोगिता)'), totals: T2('Show totals (TR)', 'कुल दिखाओ (TR)'), profit: T2('Add costs and profit', 'लागत और लाभ जोड़ो') },
    playLabel: T2('Find the best output', 'सबसे अच्छा उत्पादन खोजो'),
    slide(S, n, v) { if (n === 'q') S.q = v; else S.p.price = v; },
    toggle(S, n, C) { S.tg[n] = !S.tg[n]; S.q = Math.min(S.q, MODES.revenue.qhi(S)); C.live(MODES.revenue.say(S, C.t)); },
    best(S) { return Math.min(bestQ(S.p, S.tg.competition), MODES.revenue.qhi(S)); },
    say(S, t) {
      const R = MODES.revenue, p = S.p, c = costFns(p), qs = R.best(S), q = S.q;
      if (!S.tg.profit) return S.tg.competition ? t(T2('A price-taking firm sells every unit at the market price, so AR = MR = price and TR is a straight line.', 'कीमत स्वीकार करने वाली फ़र्म हर इकाई बाज़ार कीमत पर बेचती है, इसलिए AR = MR = कीमत और TR एक सीधी रेखा है।')) : t(T2('To sell more, this firm must lower its price, so MR falls twice as fast as AR. TR is highest where MR = 0.', 'ज़्यादा बेचने के लिए इस फ़र्म को कीमत घटानी पड़ती है, इसलिए MR, AR से दोगुनी तेज़ी से गिरता है। जहाँ MR = 0 वहाँ TR सबसे ज़्यादा है।'));
      if (qs === 0) return t(T2('The price is below the lowest AVC: the firm loses less by shutting down (output 0).', 'कीमत न्यूनतम AVC से नीचे है: फ़र्म बंद करने (उत्पादन 0) पर कम नुक़सान उठाती है।'));
      const mr = S.tg.competition ? p.price : p.A - 2 * p.B * q, mc = c.MC(q);
      if (Math.abs(q - qs) < 0.26) {
        const pr = R.priceAt(S, qs) * qs - c.TC(qs);
        return pr >= 0 ? t(T2(`Best output: MR = MC here, and MC is rising. Profit is the largest possible: ${rs(pr, 2)}.`, `सबसे अच्छा उत्पादन: यहाँ MR = MC है और MC बढ़ रहा है। लाभ सबसे ज़्यादा है: ${rs(pr, 2)}।`)) : t(T2(`Best output: MR = MC. There is a loss of ${rs(-pr, 2)}, but the price covers AVC, so producing loses less than shutting down.`, `सबसे अच्छा उत्पादन: MR = MC। ${rs(-pr, 2)} का नुक़सान है, पर कीमत AVC को ढक लेती है, इसलिए उत्पादन करना बंद करने से कम नुक़सान देता है।`));
      }
      return mr > mc ? t(T2('MR is more than MC: one more unit adds more to revenue than to cost. Raise output.', 'MR, MC से ज़्यादा है: एक और इकाई लागत से ज़्यादा संप्राप्ति जोड़ती है। उत्पादन बढ़ाओ।')) : t(T2('MR is less than MC: the last unit costs more than it brings in. Cut output.', 'MR, MC से कम है: आख़िरी इकाई जितना लाती है उससे ज़्यादा ख़र्च करवाती है। उत्पादन घटाओ।'));
    },
    release(S, n, C) {
      const qs = MODES.revenue.best(S);
      if (n === 'q' && S.tg.profit && qs > 0 && Math.abs(S.q - qs) <= 0.3) { S.q = qs; C.render(); C.emit('equilibrium'); }
      C.live(MODES.revenue.say(S, C.t));
      C.emit('computed');
    },
    play(S, C) {
      S.tg.profit = true;
      const R = MODES.revenue, qs = R.best(S), from = S.q;
      C.anim(clamp(Math.abs(qs - from) * 260, 500, 2200), (t) => { S.q = lerp(from, qs, ease(t)); C.render(); }, () => {
        S.q = qs; C.render(); C.live(R.say(S, C.t));
        if (qs > 0) C.emit('equilibrium');
        C.emit('computed');
      });
    },
    svg(S, X) {
      const R = MODES.revenue, p = S.p, t = X.t, c = costFns(p), q = S.q, qm = p.qmax, comp = S.tg.competition, qs = R.best(S), qh = R.qhi(S);
      const xl = t(T2('Output (units)', 'उत्पादन (इकाइयाँ)'));
      const TR = (x) => (comp ? p.price * x : Math.max(0, p.A * x - p.B * x * x));
      if (S.tg.totals) {
        const trMax = comp ? p.price * qm : (p.A * p.A) / (4 * p.B);
        const ym = nice(1.12 * Math.max(trMax, S.tg.profit ? c.TC(qh) : 0));
        const F = frame({ W: X.W, H: X.H, x: [0, qm], y: [0, ym], cid: X.cid, narrow: X.narrow, xl, yl: t(T2('Rupees (₹)', 'रुपये (₹)')), xf: (v) => fm(v, 1), yf: (v) => fm(v, 0) });
        let g = F.svg;
        g += fpath(F, TR, 0, comp ? qm : Math.min(qm, p.A / p.B), COL.g);
        const lbs = [{ x: F.r - 6, y: F.sy(TR(comp ? qm : Math.min(qm, p.A / p.B))) - 8, s: 'TR', col: COL.g }];
        if (!comp) { const qp = p.A / (2 * p.B); if (qp <= qm) g += dot(F.sx(qp), F.sy(TR(qp)), COL.g, 6, true) + lab(F.sx(qp), F.sy(TR(qp)) - 14, t(T2('TR highest (MR = 0)', 'TR सबसे ज़्यादा (MR = 0)')), COL.g, 'middle', 'ec-sm'); }
        if (S.tg.profit) {
          g += fpath(F, c.TC, 0, qh, COL.d);
          lbs.push({ x: F.r - 6, y: F.sy(c.TC(qh)) - 8, s: 'TC', col: COL.d });
          if (qs > 0) { const xs = F.sx(qs), y1 = F.sy(TR(qs)), y2 = F.sy(c.TC(qs)), pr = TR(qs) - c.TC(qs); g += `<path d="M${r1(xs)} ${r1(y1)}V${r1(y2)}" stroke="${pr >= 0 ? COL.g : COL.red}" stroke-width="5" stroke-opacity=".55"/>` + lab(xs - 8, (y1 + y2) / 2 + 4, (pr >= 0 ? t(T2('max profit ', 'अधिकतम लाभ ')) : t(T2('least loss ', 'न्यूनतम हानि '))) + rs(Math.abs(pr), 0), pr >= 0 ? COL.g : COL.red, 'end', 'ec-sm'); }
        }
        g += endLabels(lbs.map((o) => Object.assign(o, { y: clamp(o.y, F.t + 12, F.b - 6) })), F.t + 12, F.b - 6);
        const x = F.sx(q);
        g += `<path d="M${r1(x)} ${F.t}V${F.b}" class="ec-guide"/>` + dot(x, F.sy(TR(q)), COL.g);
        if (S.tg.profit) g += dot(x, F.sy(c.TC(q)), COL.d);
        g += pill(x, F.b - 14, 'q = ' + fm(q, 1), '#334155', 'middle');
        return g;
      }
      const F = frame({ W: X.W, H: X.H, x: [0, qm], y: [0, S.ymU], cid: X.cid, narrow: X.narrow, xl, yl: t(T2('Rupees per unit (₹)', 'प्रति इकाई रुपये (₹)')), xf: (v) => fm(v, 1), yf: (v) => fm(v, 0) });
      let g = F.svg;
      if (S.tg.profit && qs > 0) {
        const P = R.priceAt(S, qs), ac = c.AC(qs), up = P >= ac;
        g += `<rect x="${F.l}" y="${r1(F.sy(Math.max(P, ac)))}" width="${r1(F.sx(qs) - F.l)}" height="${r1(Math.abs(F.sy(ac) - F.sy(P)))}" fill="${up ? '#22C55E' : '#EF4444'}" fill-opacity=".22" stroke="${up ? COL.g : COL.red}" stroke-width="1.2"/>`;
        g += lab(F.l + (F.sx(qs) - F.l) / 2, Math.max(F.sy(P), F.sy(ac)) + 17, (up ? t(T2('Best profit ', 'अधिकतम लाभ ')) : t(T2('Least loss ', 'न्यूनतम हानि '))) + rs(Math.abs(P - ac) * qs, 0), up ? COL.g : COL.red, 'middle', 'ec-sm');
      }
      const lbs = [];
      if (comp) { g += seg(F, 0, p.price, qm, p.price, COL.d) + lab(F.l + 8, F.sy(p.price) - 9, 'AR = MR = P', COL.d, 'start', 'ec-sm'); }
      else {
        g += seg(F, 0, p.A, p.A / p.B, 0, COL.d) + seg(F, 0, p.A, p.A / (2 * p.B), 0, COL.e);
        const qa = Math.min(qm, p.A / p.B) * 0.86, qmr = Math.min(qm, p.A / (2 * p.B)) * 0.8;
        g += lab(F.sx(qa) + 8, F.sy(p.A - p.B * qa) - 8, 'AR = D', COL.d, 'start') + lab(F.sx(qmr) - 8, F.sy(p.A - 2 * p.B * qmr) + 4, 'MR', COL.e, 'end');
      }
      if (S.tg.profit) {
        g += fpath(F, c.AC, qm / 160, qm, COL.teal) + fpath(F, c.MC, 0, qm, COL.s);
        lbs.push({ x: F.r - 6, y: F.sy(c.AC(qm)) + 16, s: 'AC', col: COL.teal }, { x: F.r - 6, y: F.sy(c.MC(qm)) - 6, s: 'MC', col: COL.s });
        if (qs > 0) { const mr = comp ? p.price : p.A - 2 * p.B * qs; g += `<circle cx="${r1(F.sx(qs))}" cy="${r1(F.sy(mr))}" r="14" fill="#8B3DFF" opacity=".16"/>` + dot(F.sx(qs), F.sy(mr), '#6D28D9', 6.5) + lab(F.sx(qs) - 12, F.sy(mr) - 12, 'MR = MC', '#6D28D9', 'end', 'ec-sm'); }
      }
      g += endLabels(lbs.map((o) => Object.assign(o, { y: clamp(o.y, F.t + 12, F.b - 6) })), F.t + 12, F.b - 6);
      const x = F.sx(q);
      g += `<path d="M${r1(x)} ${F.t}V${F.b}" class="ec-guide"/>` + dot(x, F.sy(R.priceAt(S, q)), COL.d);
      g += pill(x, F.b - 14, 'q = ' + fm(q, 1), '#334155', 'middle');
      return g;
    },
    read(S, X) {
      const R = MODES.revenue, t = X.t, p = S.p, q = S.q, c = costFns(p), P = R.priceAt(S, q), tr = P * q, mr = S.tg.competition ? p.price : p.A - 2 * p.B * q;
      const arr = [[t(T2('Price = AR', 'कीमत = AR')), rs(P, 2), COL.d], [t(T2('Total revenue TR', 'कुल संप्राप्ति TR')), rs(tr, 2), COL.g], [t(T2('Marginal revenue MR', 'सीमांत संप्राप्ति MR')), rs(mr, 2), COL.e]];
      if (S.tg.profit) arr.push([t(T2('Total cost TC', 'कुल लागत TC')), rs(c.TC(q), 2), COL.teal], [tr - c.TC(q) >= 0 ? t(T2('Profit', 'लाभ')) : t(T2('Loss', 'हानि')), rs(Math.abs(tr - c.TC(q)), 2), tr - c.TC(q) >= 0 ? COL.g : COL.red]);
      let h = tiles(arr);
      const qs = R.best(S);
      h += status(S.tg.profit && Math.abs(q - qs) < 0.26 ? 'ok' : 'warn', R.say(S, t));
      h += formula(S.tg.competition ? 'TR = P × q · AR = TR ÷ q = P · MR = P' : `AR = ${fm(p.A)} − ${fm(p.B)}q · TR = AR × q · MR = ${fm(p.A)} − ${fm(2 * p.B)}q`);
      if (S.tg.profit) h += note(t(T2(`Best output: ${fm(qs, 2)} units (where MR = MC on the rising part of MC).`, `सबसे अच्छा उत्पादन: ${fm(qs, 2)} इकाइयाँ (जहाँ MC के बढ़ते भाग पर MR = MC)।`)));
      return h;
    },
    quiz(S, r, C) {
      const t = C.t, v = ri(r, 0, 3), f = (x) => rs(x, 2);
      if (v === 0) { const P = ri(r, 4, 40), q = ri(r, 3, 20); return mcq(r, t(T2(`A farmer sells ${q} bags of rice at ${rs(P, 0)} each. What is the total revenue?`, `एक किसान चावल की ${q} बोरियाँ ${rs(P, 0)} प्रति बोरी पर बेचता है। कुल संप्राप्ति क्या है?`)), f(P * q), numOpts(P * q, [P + q, P, q * (P - 1)], f), t(T2('TR = price × quantity.', 'TR = कीमत × मात्रा।'))); }
      if (v === 1) { const q = ri(r, 4, 12), P = ri(r, 5, 30); return mcq(r, t(T2(`A firm's TR from ${q} units is ${rs(P * q, 0)}. What is its average revenue?`, `एक फ़र्म की ${q} इकाइयों से TR ${rs(P * q, 0)} है। उसकी औसत संप्राप्ति क्या है?`)), f(P), numOpts(P, [P * q, P * q - q, P + 1], f), t(T2('AR = TR ÷ quantity, which is the price per unit.', 'AR = TR ÷ मात्रा, यानी प्रति इकाई कीमत।'))); }
      if (v === 2) return mcq(r, t(T2('For a price-taking firm in perfect competition, marginal revenue is equal to:', 'पूर्ण प्रतियोगिता में कीमत स्वीकार करने वाली फ़र्म के लिए सीमांत संप्राप्ति किसके बराबर है?')), t(T2('the market price', 'बाज़ार कीमत')), [t(T2('zero', 'शून्य')), t(T2('total revenue', 'कुल संप्राप्ति')), t(T2('marginal cost at every output', 'हर उत्पादन पर सीमांत लागत'))], t(T2('Each extra unit sells at the same market price, so MR = AR = price.', 'हर अतिरिक्त इकाई उसी बाज़ार कीमत पर बिकती है, इसलिए MR = AR = कीमत।')));
      return mcq(r, t(T2('A firm earns the most profit at the output where:', 'फ़र्म को सबसे ज़्यादा लाभ उस उत्पादन पर मिलता है जहाँ:')), t(T2('MR = MC and MC is rising', 'MR = MC हो और MC बढ़ रहा हो')), [t(T2('TR is the largest', 'TR सबसे ज़्यादा हो')), t(T2('AC is the lowest', 'AC सबसे कम हो')), t(T2('MR is the largest', 'MR सबसे ज़्यादा हो'))], t(T2('Below that output MR > MC, so more units add profit; above it MR < MC, so they cut profit.', 'उससे कम उत्पादन पर MR > MC, इसलिए और इकाइयाँ लाभ बढ़ाती हैं; उससे ज़्यादा पर MR < MC, इसलिए लाभ घटता है।')));
    },
  };

  // ---- production: returns to a variable factor (labour on a fixed plot of land)
  const tpOf = (p, L) => p.a * L * L - p.b * L * L * L;
  function prodInfo(p) {
    let peak = 0;
    for (let L = 1; L <= 80; L++) if (tpOf(p, L) > tpOf(p, peak) + 1e-12) peak = L;
    const Lmax = Math.min(15, peak + 2);
    const rows = [];
    for (let L = 0; L <= Lmax; L++) {
      const tp = tpOf(p, L), mp = L ? tp - tpOf(p, L - 1) : null, ap = L ? tp / L : null;
      const prev = L > 1 ? tpOf(p, L - 1) - tpOf(p, L - 2) : -Infinity;
      rows.push({ L, tp, mp, ap, stage: !L ? 0 : mp < 0 ? 3 : mp > prev ? 1 : 2 });
    }
    return { peak, Lmax, rows };
  }
  const STAGE = {
    0: T2('Add workers to the fixed plot of land and tools.', 'ज़मीन और औज़ारों के तय टुकड़े पर मज़दूर जोड़ो।'),
    1: T2('Stage I, increasing returns: each new worker adds more than the one before, because the land and tools were not fully used.', 'अवस्था I, बढ़ते प्रतिफल: हर नया मज़दूर पिछले से ज़्यादा जोड़ता है, क्योंकि ज़मीन और औज़ार पूरे इस्तेमाल नहीं हो रहे थे।'),
    2: T2('Stage II, diminishing returns: each new worker still adds output, but less than the one before.', 'अवस्था II, घटते प्रतिफल: हर नया मज़दूर उत्पादन तो जोड़ता है, पर पिछले से कम।'),
    3: T2('Stage III, negative returns: too many workers crowd the fixed land, so total product falls.', 'अवस्था III, ऋणात्मक प्रतिफल: तय ज़मीन पर बहुत ज़्यादा मज़दूर हैं, इसलिए कुल उत्पाद घटता है।'),
  };
  const SCOL = { 1: '#DCFCE7', 2: '#FEF3C7', 3: '#FEE2E2' };
  MODES.production = {
    name: T2('Production: returns to a factor', 'उत्पादन: कारक के प्रतिफल'),
    sub: T2('One field and its tools stay fixed. Add workers one by one and watch TP, MP and AP.', 'एक खेत और उसके औज़ार तय रहते हैं। एक-एक करके मज़दूर जोड़ो और TP, MP और AP देखो।'),
    spec: { a: [0.5, 10000, 0, 10], b: [0.001, 1000, 0, 1], labour: [0, 15, 'int', 3] },
    tog: ['table'], sl: ['labour'], play: true,
    events: ['computed', 'answered:right', 'answered:wrong'],
    check(p) { const I = prodInfo(p), e = []; if (I.peak < 3 || I.peak > 13) e.push(`total product must peak between 3 and 13 workers (now ${I.peak}): change a or b`); else if (p.labour > I.Lmax) e.push(`labour must be at most ${I.Lmax}`); return e; },
    dims: (n) => (n ? [340, 500] : [640, 470]),
    init(p) { const I = prodInfo(p); return { p, L: p.labour, I }; },
    sliders(S) { return [{ name: 'labour', label: T2('Workers on the field (L)', 'खेत पर मज़दूर (L)'), min: 0, max: S.I.Lmax, step: 1, get: () => S.L, fmt: (v) => fm(v, 0) }]; },
    togLabel: { table: T2('Show the table', 'तालिका दिखाओ') },
    playLabel: T2('Hire workers one by one', 'एक-एक करके मज़दूर रखो'),
    slide(S, n, v) { S.L = Math.round(v); },
    release(S, n, C) { C.live(C.t(STAGE[S.I.rows[S.L].stage])); C.emit('computed'); },
    play(S, C) {
      const I = S.I, start = S.L >= I.Lmax ? 0 : S.L;
      S.L = start; C.render();
      const n = I.Lmax - start;
      C.anim(n * 700, (t) => { const L = start + Math.floor(t * n + 1e-9); if (L !== S.L) { S.L = Math.min(L, I.Lmax); C.render(); } }, () => {
        S.L = I.Lmax; C.render();
        const lastUp = I.rows.filter((x) => x.stage === 1).pop(), firstNeg = I.rows.find((x) => x.stage === 3);
        C.live(C.t(T2(`MP rose up to worker ${lastUp ? lastUp.L : 1}, then fell${firstNeg ? `, and from worker ${firstNeg.L} it was negative, so TP fell` : ''}. TP was highest with ${I.peak} workers.`, `MP मज़दूर ${lastUp ? lastUp.L : 1} तक बढ़ा, फिर घटा${firstNeg ? `, और मज़दूर ${firstNeg.L} से ऋणात्मक हो गया, इसलिए TP घटा` : ''}। ${I.peak} मज़दूरों पर TP सबसे ज़्यादा था।`)));
        C.emit('computed');
      });
    },
    svg(S, X) {
      const t = X.t, I = S.I, rows = I.rows, Lm = I.Lmax, L = S.L, H2 = Math.round(X.H * 0.47);
      const tpMax = Math.max(...rows.map((x) => x.tp)), mps = rows.slice(1).map((x) => x.mp), aps = rows.slice(1).map((x) => x.ap);
      const lo = Math.min(0, ...mps), hi = Math.max(...mps, ...aps);
      const xf = (v) => fm(v, 0), xs = Lm > 10 ? 2 : 1;
      const A = frame({ W: X.W, H: H2, x: [0, Lm + 0.5], y: [0, nice(tpMax * 1.12)], cid: X.cid + 'a', narrow: X.narrow, b: 24, yl: t(T2('Total product TP (kg of wheat)', 'कुल उत्पाद TP (किलो गेहूँ)')), xs, xf, yf: (v) => fm(v, 0), ny: 4 });
      const yr = hi - lo, B = frame({ W: X.W, H: X.H - H2, oy: H2, x: [0, Lm + 0.5], y: [lo < 0 ? -nice(-lo * 1.15) : 0, nice(hi * 1.15)], cid: X.cid + 'b', narrow: X.narrow, t: 30, xl: t(T2('Workers (L)', 'मज़दूर (L)')), yl: t(T2('MP and AP (kg per worker)', 'MP और AP (किलो प्रति मज़दूर)')), xs, xf, yf: (v) => fm(v, 0), ny: yr > 0 ? 4 : 2 });
      let g = '';
      const bands = (F) => rows.slice(1).map((x) => `<rect x="${r1(F.sx(Math.max(0, x.L - 0.5)))}" y="${F.t}" width="${r1(F.sx(Math.min(Lm + 0.5, x.L + 0.5)) - F.sx(Math.max(0, x.L - 0.5)))}" height="${r1(F.ph)}" fill="${SCOL[x.stage]}" opacity=".75"/>`).join('');
      g += A.svg.replace('class="ec-plot"/>', 'class="ec-plot"/>' + bands(A)) + B.svg.replace('class="ec-plot"/>', 'class="ec-plot"/>' + bands(B));
      // stage names over the top plot
      const runs = [];
      rows.slice(1).forEach((x) => { const lr = runs[runs.length - 1]; if (lr && lr.s === x.stage) lr.b = x.L; else runs.push({ s: x.stage, a: x.L, b: x.L }); });
      const SN = { 1: T2('I · rising MP', 'I · बढ़ता MP'), 2: T2('II · falling MP', 'II · घटता MP'), 3: T2('III · MP below 0', 'III · MP शून्य से कम') };
      runs.forEach((u) => { const x0 = A.sx(Math.max(0, u.a - 0.5)), x1 = A.sx(Math.min(Lm + 0.5, u.b + 0.5)), s = t(SN[u.s]), roman = ['', 'I', 'II', 'III'][u.s]; g += lab((x0 + x1) / 2, A.t + 16, x1 - x0 > s.length * 7.2 ? s : roman, '#334155', 'middle', 'ec-sm'); });
      // TP
      g += `<path d="${smooth(rows.map((x) => [A.sx(x.L), A.sy(x.tp)]))}" stroke="${COL.d}" class="ec-line" ${A.clip}/>`;
      rows.forEach((x) => { g += `<circle cx="${r1(A.sx(x.L))}" cy="${r1(A.sy(x.tp))}" r="3.2" fill="${COL.d}"/>`; });
      g += lab(A.sx(I.peak), A.sy(tpOf(S.p, I.peak)) - 10, 'TP', COL.d, 'middle');
      // MP bars and AP line
      const bw = Math.max(6, (B.sx(1) - B.sx(0)) * 0.46);
      rows.slice(1).forEach((x) => { const y0 = B.sy(0), y1 = B.sy(x.mp), cur = x.L === L; g += `<rect x="${r1(B.sx(x.L) - bw / 2)}" y="${r1(Math.min(y0, y1))}" width="${r1(bw)}" height="${r1(Math.max(1, Math.abs(y1 - y0)))}" rx="3" fill="${x.mp < 0 ? '#EF4444' : '#14B8A6'}" ${cur ? 'stroke="#1E293B" stroke-width="2.5"' : 'opacity=".85"'}/>`; });
      g += `<path d="${smooth(rows.slice(1).map((x) => [B.sx(x.L), B.sy(x.ap)]))}" stroke="${COL.e}" class="ec-line" ${B.clip}/>`;
      rows.slice(1).forEach((x) => { g += `<circle cx="${r1(B.sx(x.L))}" cy="${r1(B.sy(x.ap))}" r="3.5" fill="${COL.e}"/>`; });
            g += `<rect x="${r1(B.l + 8)}" y="${r1(B.t + 7)}" width="12" height="12" rx="3" fill="#14B8A6"/>` + lab(B.l + 24, B.t + 17, t(T2('MP (bars)', 'MP (स्तंभ)')), COL.teal, 'start', 'ec-sm');
      const la = rows[Lm];
      g += lab(B.sx(Lm) - 6, B.sy(la.ap) - 10, 'AP', COL.e, 'end');
      if (lo < 0) g += `<path d="M${B.l} ${r1(B.sy(0))}H${r1(B.r)}" stroke="#334155" stroke-width="1.5"/>`;
      if (L > 0) {
        g += `<path d="M${r1(A.sx(L))} ${A.t}V${r1(A.b)}M${r1(B.sx(L))} ${B.t}V${r1(B.b)}" class="ec-guide"/>`;
        g += `<circle cx="${r1(A.sx(L))}" cy="${r1(A.sy(rows[L].tp))}" r="13" fill="#FFD23F" opacity=".45"/>` + dot(A.sx(L), A.sy(rows[L].tp), COL.d, 6.5) + dot(B.sx(L), B.sy(rows[L].ap), COL.e, 6);
      }
      return g;
    },
    extra(S, X) {
      // the field with its workers and a crop that grows with TP
      const I = S.I, L = S.L, tp = I.rows[L].tp, tpMax = Math.max(...I.rows.map((x) => x.tp));
      const W = 640, H = 92, n = Math.max(0, L);
      let g = `<rect x="0" y="0" width="${W}" height="${H}" rx="14" fill="#BAE6FD"/><circle cx="600" cy="22" r="13" fill="#FFD23F"/><rect x="0" y="44" width="${W}" height="48" rx="0" fill="#86C66C"/><rect x="0" y="80" width="${W}" height="12" fill="#6FAE55"/>`;
      const rowsN = Math.round((tp / (tpMax || 1)) * 22);
      for (let i = 0; i < 22; i++) { const x = 24 + i * 27, ok = i < rowsN; g += `<path d="M${x} 78v-${ok ? 18 : 6}" stroke="${ok ? '#CA8A04' : '#4D7C0F'}" stroke-width="3" stroke-linecap="round"/>${ok ? `<ellipse cx="${x}" cy="${78 - 20}" rx="3.2" ry="6" fill="#EAB308"/>` : ''}`; }
      const gap = n ? Math.min(40, 560 / n) : 0;
      for (let i = 0; i < n; i++) {
        const x = 40 + i * gap, c = ['#1D4ED8', '#C2410C', '#7C3AED', '#0F766E', '#BE185D'][i % 5];
        g += `<g transform="translate(${r1(x)} 40)"><circle cx="0" cy="0" r="6" fill="#8D5524"/><path d="M-6 6h12l2 22h-16z" fill="${c}"/><path d="M-5 28v10M5 28v10" stroke="#1E293B" stroke-width="3" stroke-linecap="round"/><path d="M7 10l10 24" stroke="#78350F" stroke-width="2.5"/><path d="M14 33l8 -2" stroke="#475569" stroke-width="3" stroke-linecap="round"/></g>`;
      }
      return `<svg viewBox="0 0 ${W} ${H}" class="ec-svg ec-farm" role="img" aria-label="${esc(X.t(T2(`${L} workers on the field`, `खेत पर ${L} मज़दूर`)))}" style="margin-top:8px">${g}</svg>`;
    },
    read(S, X) {
      const t = X.t, row = S.I.rows[S.L];
      let h = tiles([[t(T2('Workers L', 'मज़दूर L')), fm(S.L, 0), '#334155'], [t(T2('Total product TP', 'कुल उत्पाद TP')), fm(row.tp, 2), COL.d], [t(T2('Marginal product MP', 'सीमांत उत्पाद MP')), row.mp == null ? '—' : fm(row.mp, 2), COL.teal], [t(T2('Average product AP', 'औसत उत्पाद AP')), row.ap == null ? '—' : fm(row.ap, 2), COL.e]]);
      h += status(row.stage === 3 ? 'bad' : row.stage === 2 ? 'warn' : 'ok', t(STAGE[row.stage]));
      h += formula(t(T2('MP of worker L = TP(L) − TP(L − 1) · AP = TP ÷ L', 'मज़दूर L का MP = TP(L) − TP(L − 1) · AP = TP ÷ L')));
      if (S.tg.table) {
        h += `<div class="ec-scroll" style="margin-top:8px"><table class="ec-table"><tr><th>L</th><th>TP</th><th>MP</th><th>AP</th></tr>${S.I.rows.map((x) => `<tr class="${x.L === S.L ? 'cur' : ''}"><td>${x.L}</td><td>${fm(x.tp, 2)}</td><td>${x.mp == null ? '—' : fm(x.mp, 2)}</td><td>${x.ap == null ? '—' : fm(x.ap, 2)}</td></tr>`).join('')}</table></div>`;
      }
      return h;
    },
    quiz(S, r, C) {
      const t = C.t, rows = S.I.rows, v = ri(r, 0, 2), k = ri(r, 2, S.I.Lmax), row = rows[k];
      if (v === 0) return mcq(r, t(T2(`With ${k - 1} workers the field gives ${fm(rows[k - 1].tp, 2)} kg; with ${k} workers it gives ${fm(row.tp, 2)} kg. What is the marginal product of worker ${k}?`, `${k - 1} मज़दूरों से खेत ${fm(rows[k - 1].tp, 2)} किलो देता है; ${k} मज़दूरों से ${fm(row.tp, 2)} किलो। मज़दूर ${k} का सीमांत उत्पाद क्या है?`)), fm(row.mp, 2) + ' kg', [fm(row.tp, 2) + ' kg', fm(row.tp / k, 2) + ' kg', fm(row.tp + rows[k - 1].tp, 2) + ' kg', fm(rows[k - 1].tp, 2) + ' kg'], t(T2(`MP = TP(${k}) − TP(${k - 1}) = ${fm(row.tp, 2)} − ${fm(rows[k - 1].tp, 2)} = ${fm(row.mp, 2)} kg.`, `MP = TP(${k}) − TP(${k - 1}) = ${fm(row.tp, 2)} − ${fm(rows[k - 1].tp, 2)} = ${fm(row.mp, 2)} किलो।`)));
      if (v === 1) return mcq(r, t(T2(`${k} workers produce ${fm(row.tp, 2)} kg in total. What is the average product?`, `${k} मज़दूर कुल ${fm(row.tp, 2)} किलो पैदा करते हैं। औसत उत्पाद क्या है?`)), fm(row.ap, 2) + ' kg', [fm(row.tp, 2) + ' kg', fm(row.mp, 2) + ' kg', fm(row.tp * k, 2) + ' kg', fm(row.tp / (k + 1), 2) + ' kg'], t(T2('AP = TP ÷ number of workers.', 'AP = TP ÷ मज़दूरों की संख्या।')));
      const names = { 1: T2('Stage I: increasing returns', 'अवस्था I: बढ़ते प्रतिफल'), 2: T2('Stage II: diminishing returns', 'अवस्था II: घटते प्रतिफल'), 3: T2('Stage III: negative returns', 'अवस्था III: ऋणात्मक प्रतिफल') };
      const seq = rows.slice(1, k + 1).map((x) => fm(x.mp, 1)).join(', ');
      return mcq(r, t(T2(`The MPs of workers 1 to ${k} are ${seq}. Worker ${k} is in which stage?`, `मज़दूर 1 से ${k} तक के MP हैं ${seq}। मज़दूर ${k} किस अवस्था में है?`)), t(names[row.stage]), [t(names[1]), t(names[2]), t(names[3])], t(T2('Stage I while MP rises, Stage II while MP falls but stays positive, Stage III once MP is negative.', 'जब तक MP बढ़े अवस्था I, MP घटे पर धनात्मक रहे तो अवस्था II, MP ऋणात्मक हो तो अवस्था III।')));
    },
  };

  // ---- the circular flow of income, with leakages and injections
  function along(pts, f) {
    const L2 = [];
    let tot = 0;
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L2.push(d); tot += d; }
    let d = clamp(f, 0, 1) * tot;
    for (let i = 0; i < L2.length; i++) { if (d <= L2[i] || i === L2.length - 1) { const k = L2[i] ? Math.min(1, d / L2[i]) : 0; return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)]; } d -= L2[i]; }
    return pts[pts.length - 1];
  }
  const poly = (pts) => 'M' + pts.map((p) => r1(p[0]) + ' ' + r1(p[1])).join('L');
  const SECT = [
    { k: 'financial', leak: 'saving', inj: 'investment', nm: [T2('Financial', 'वित्तीय'), T2('market', 'बाज़ार')], sn: T2('Banks', 'बैंक'), ln: T2('Saving', 'बचत'), jn: T2('Investment', 'निवेश'), js: T2('Investment', 'निवेश'), col: '#0E7490' },
    { k: 'government', leak: 'tax', inj: 'govt', nm: [T2('Government', 'सरकार')], sn: T2('Govt.', 'सरकार'), ln: T2('Taxes', 'कर'), jn: T2('Govt. spending', 'सरकारी व्यय'), js: T2('Spending', 'व्यय'), col: '#6D28D9' },
    { k: 'abroad', leak: 'imports', inj: 'exports', nm: [T2('Rest of', 'शेष'), T2('the world', 'विश्व')], sn: T2('Abroad', 'विदेश'), ln: T2('Imports', 'आयात'), jn: T2('Exports', 'निर्यात'), js: T2('Exports', 'निर्यात'), col: '#BE185D' },
  ];
  function flowModel(S) {
    const p = S.p;
    let sh = 0, J = 0;
    SECT.forEach((s) => { if (S.tg[s.k]) { sh += p[s.leak] / 100; J += p[s.inj]; } });
    const Y = S.Y, leak = sh * Y;
    return { sh, J, Y, leak, C: Y - leak, next: Y - leak + J, star: sh > 0 ? J / sh : J > 0 ? Infinity : Y };
  }
  function flowGeo(X) {
    const W = X.W, H = X.H, n = X.narrow, li = n ? 48 : 60, ri = W - li, hx0 = W * 0.22, hx1 = W * 0.78;
    const P = {
      goods: [[hx0, H - 30], [22, H - 30], [22, 30], [hx0, 30]],
      spend: [[hx0, 56], [li, 56], [li, H - 56], [hx0, H - 56]],
      serv: [[hx1, 30], [W - 22, 30], [W - 22, H - 30], [hx1, H - 30]],
      pay: [[hx1, H - 56], [ri, H - 56], [ri, 56], [hx1, 56]],
    };
    const a = li + 14, b = ri - 14;
    const slots = SECT.map((s, i) => { const cx = a + ((b - a) * (2 * i + 1)) / 6; return { cx, w: (b - a) / 3 - 10, leak: [[cx, 74], [cx, H / 2 - 36]], inj: [[cx, H / 2 + 36], [cx, H - 74]] }; });
    return { W, H, li, ri, hx0, hx1, P, slots };
  }
  MODES['circular-flow'] = {
    name: T2('Circular flow of income', 'आय का चक्रीय प्रवाह'),
    sub: T2('Money goes round from firms to households and back. Saving, taxes and imports leak out; investment, government spending and exports flow in.', 'पैसा फ़र्मों से परिवारों तक और वापस घूमता है। बचत, कर और आयात बाहर रिसते हैं; निवेश, सरकारी व्यय और निर्यात अंदर आते हैं।'),
    spec: { income: [10, 1e9, 0, 1000], saving: [0, 60, 0, 10], tax: [0, 60, 0, 10], imports: [0, 60, 0, 10], investment: [0, 1e9, 0, 100], govt: [0, 1e9, 0, 100], exports: [0, 1e9, 0, 50] },
    tog: ['financial', 'government', 'abroad'], togDef: { financial: 1, government: 1, abroad: 1 },
    sl: ['saving', 'tax', 'imports', 'investment', 'govt', 'exports'], play: true,
    events: ['equilibrium', 'computed', 'answered:right', 'answered:wrong'],
    check(p) { return p.saving + p.tax + p.imports > 100 ? ['saving + tax + imports cannot be more than 100% of income'] : []; },
    dims: (n) => (n ? [340, 480] : [640, 460]),
    init(p) { return { p: Object.assign({}, p), Y: p.income, round: 0, ph: -1, rmax: nice(Math.max(p.income, p.investment + p.govt + p.exports) * 0.6) }; },
    sliders(S) {
      const pc = (v) => fm(v, 0) + '%', mk = (v) => rs(v, 0);
      const out = [];
      SECT.forEach((s) => out.push({ name: s.leak, label: T2(s.ln.en + ' (% of income)', s.ln.hi + ' (आय का %)'), min: 0, max: 60, step: 1, get: () => S.p[s.leak], fmt: pc, off: () => !S.tg[s.k] }));
      SECT.forEach((s) => out.push({ name: s.inj, label: T2(s.jn.en + ' (₹ crore)', s.jn.hi + ' (₹ करोड़)'), min: 0, max: nice(Math.max(2 * S.p[s.inj], S.rmax)), step: 1, get: () => S.p[s.inj], fmt: mk, off: () => !S.tg[s.k] }));
      return out;
    },
    togLabel: { financial: T2('Banks (saving, investment)', 'बैंक (बचत, निवेश)'), government: T2('Government (taxes, spending)', 'सरकार (कर, व्यय)'), abroad: T2('Rest of the world (trade)', 'शेष विश्व (व्यापार)') },
    playLabel: T2('Run the flow round by round', 'प्रवाह को दौर-दर-दौर चलाओ'),
    slide(S, n, v) {
      const p = Object.assign({}, S.p, { [n]: v });
      if (p.saving + p.tax + p.imports > 100) return false;
      S.p[n] = v;
    },
    say(S, t) {
      const m = flowModel(S);
      if (m.sh === 0 && m.J === 0) return ['ok', t(T2('Two sectors only: households spend all their income on goods from firms, so income stays the same every round.', 'केवल दो क्षेत्र: परिवार अपनी पूरी आय फ़र्मों की वस्तुओं पर ख़र्च करते हैं, इसलिए हर दौर में आय वही रहती है।'))];
      if (Math.abs(m.leak - m.J) <= Math.max(0.5, 0.005 * m.Y)) return ['ok', t(T2('Leakages = injections: income stays the same. The flow is in equilibrium.', 'रिसाव = अंतःक्षेपण: आय वही रहती है। प्रवाह संतुलन में है।'))];
      return m.J > m.leak ? ['warn', t(T2(`Injections (${rs(m.J, 0)}) are more than leakages (${rs(m.leak, 0)}): next round income rises to ${rs(m.next, 0)}.`, `अंतःक्षेपण (${rs(m.J, 0)}) रिसाव (${rs(m.leak, 0)}) से ज़्यादा हैं: अगले दौर में आय बढ़कर ${rs(m.next, 0)} होगी।`))] : ['bad', t(T2(`Leakages (${rs(m.leak, 0)}) are more than injections (${rs(m.J, 0)}): next round income falls to ${rs(m.next, 0)}.`, `रिसाव (${rs(m.leak, 0)}) अंतःक्षेपण (${rs(m.J, 0)}) से ज़्यादा हैं: अगले दौर में आय घटकर ${rs(m.next, 0)} होगी।`))];
    },
    release(S, n, C) { C.live(MODES['circular-flow'].say(S, C.t)[1]); C.emit('computed'); },
    toggle(S, n, C) {
      S.tg[n] = !S.tg[n];
      const s = SECT.find((x) => x.k === n);
      C.live(S.tg[n] ? C.t(T2(`Added: ${s.ln.en.toLowerCase()} leaks out of the flow and ${s.jn.en.toLowerCase()} flows back in.`, `जोड़ा: ${s.ln.hi} प्रवाह से बाहर रिसता है और ${s.jn.hi} वापस अंदर आता है।`)) : C.t(T2('Removed that sector from the flow.', 'उस क्षेत्र को प्रवाह से हटाया।')));
    },
    play(S, C) {
      const CF = MODES['circular-flow'];
      let rounds = 0;
      const one = () => {
        C.anim(1700, (t) => { S.ph = t; C.render(); }, () => {
          const m = flowModel(S);
          S.ph = -1; rounds++; S.round++;
          const done = Math.abs(m.next - m.Y) <= Math.max(0.5, 0.005 * m.Y);
          S.Y = m.next; C.render();
          if (done || (m.sh === 0 && m.J === 0)) { C.live(C.t(T2(`Round ${S.round}: income is ${rs(S.Y, 0)} and stays there, because leakages = injections. This is equilibrium income.`, `दौर ${S.round}: आय ${rs(S.Y, 0)} है और वहीं टिकी रहती है, क्योंकि रिसाव = अंतःक्षेपण। यही संतुलन आय है।`))); C.emit('equilibrium'); C.emit('computed'); return; }
          if (rounds >= 8) { const st = flowModel(S).star; C.live(C.t(isFinite(st) ? T2(`After ${rounds} rounds income is ${rs(S.Y, 0)}, moving towards ${rs(st, 0)}, where leakages will equal injections. Press Play again to continue.`, `${rounds} दौर के बाद आय ${rs(S.Y, 0)} है, और ${rs(st, 0)} की ओर बढ़ रही है, जहाँ रिसाव अंतःक्षेपण के बराबर होंगे। आगे बढ़ने के लिए फिर Play दबाओ।`) : T2(`Nothing leaks out but money keeps flowing in, so income keeps rising: ${rs(S.Y, 0)} now.`, `कुछ बाहर नहीं रिसता पर पैसा अंदर आता रहता है, इसलिए आय बढ़ती रहती है: अभी ${rs(S.Y, 0)}।`))); C.emit('computed'); return; }
          C.live(CF.say(S, C.t)[1]);
          one();
        });
      };
      one();
    },
    svg(S, X) {
      const t = X.t, G = flowGeo(X), m = flowModel(S), W = G.W, H = G.H, n = X.narrow;
      let g = `<defs><linearGradient id="${X.cid}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3B6EEA"/><stop offset="1" stop-color="#1D4ED8"/></linearGradient><linearGradient id="${X.cid}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14A394"/><stop offset="1" stop-color="#0F766E"/></linearGradient></defs>`;
      g += `<rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="18" fill="#FFFFFF" fill-opacity=".72"/>`;
      const flow = (pts, col, dash) => `<path d="${poly(pts)}" fill="none" stroke="${col}" stroke-width="${dash ? 3 : 4}" ${dash ? 'stroke-dasharray="9 6"' : ''} stroke-linejoin="round"/>` + arrowHead(pts[pts.length - 1][0] - (pts[pts.length - 1][0] > pts[pts.length - 2][0] ? 7 : -7), pts[pts.length - 1][1], pts[pts.length - 1][0] > pts[pts.length - 2][0] ? 'right' : 'left', col, 8);
      g += flow(G.P.goods, COL.g, true) + flow(G.P.serv, COL.e, true) + flow(G.P.spend, '#B45309') + flow(G.P.pay, '#B45309');
      const vt = (x, s, col) => `<text transform="translate(${r1(x)} ${r1(H / 2)}) rotate(-90)" text-anchor="middle" class="ec-sm" fill="${col}" dy="4">${esc(s)}</text>`;
      g += vt(22, t(T2('Goods and services', 'वस्तुएँ और सेवाएँ')), COL.g) + vt(G.li, t(T2('Spending C ', 'उपभोग व्यय C ')) + rs(m.C, 0), '#92400E');
      g += vt(W - 22, n ? t(T2('Factor services', 'कारक सेवाएँ')) : t(T2('Factor services (labour, land, capital)', 'कारक सेवाएँ (श्रम, भूमि, पूँजी)')), COL.e) + vt(G.ri, t(T2('Factor payments ', 'कारक भुगतान ')) + rs(m.Y, 0), '#92400E');
      // the two big boxes
      const box = (y, fill, title, sub) => `<g><rect x="${r1(G.hx0)}" y="${y}" width="${r1(G.hx1 - G.hx0)}" height="60" rx="14" fill="url(#${fill})" stroke="#fff" stroke-width="2"/>${txt(W / 2, y + 26, title, 'ec-box', 'text-anchor="middle"')}${txt(W / 2, y + 46, sub, 'ec-boxs', 'text-anchor="middle"')}</g>`;
      g += box(14, X.cid + 'h', t(T2('Households', 'परिवार')), t(T2('Income ', 'आय ')) + rs(m.Y, 0));
      g += box(H - 74, X.cid + 'f', t(T2('Firms', 'फ़र्में')), t(T2('Sales ', 'बिक्री ')) + rs(m.C + m.J, 0));
      // the middle sectors
      SECT.forEach((s, i) => {
        const sl = G.slots[i], on = !!S.tg[s.k], y0 = H / 2 - 34;
        if (on) {
          g += `<path d="${poly(sl.leak)}" stroke="${COL.red}" stroke-width="3.5" fill="none"/>` + arrowHead(sl.cx, sl.leak[1][1] - 6, 'down', COL.red, 7);
          g += `<path d="${poly(sl.inj)}" stroke="${COL.g}" stroke-width="3.5" fill="none"/>` + arrowHead(sl.cx, sl.inj[1][1] - 6, 'down', COL.g, 7);
          const ly = (sl.leak[0][1] + sl.leak[1][1]) / 2, iy = (sl.inj[0][1] + sl.inj[1][1]) / 2;
          g += lab(sl.cx, ly - 3, t(s.ln), COL.red, 'middle', 'ec-sm') + lab(sl.cx, ly + 12, rs((S.p[s.leak] / 100) * m.Y, 0), COL.red, 'middle', 'ec-sm');
          g += lab(sl.cx, iy - 3, t(n ? s.js : s.jn), COL.g, 'middle', 'ec-sm') + lab(sl.cx, iy + 12, rs(S.p[s.inj], 0), COL.g, 'middle', 'ec-sm');
          g += `<rect x="${r1(sl.cx - sl.w / 2)}" y="${y0}" width="${r1(sl.w)}" height="68" rx="12" fill="${s.col}" stroke="#fff" stroke-width="2"/>`;
          const nm = n ? [t(s.sn)] : s.nm.map(t);
          nm.forEach((w, j) => { g += txt(sl.cx, y0 + 38 + (j - (nm.length - 1) / 2) * 16, w, 'ec-box', `text-anchor="middle" style="font-size:${n ? 12.5 : 14}px"`); });
        } else {
          g += `<rect x="${r1(sl.cx - sl.w / 2)}" y="${y0}" width="${r1(sl.w)}" height="68" rx="12" fill="#F8FAFC" stroke="#94A3B8" stroke-width="2" stroke-dasharray="6 5"/>`;
          const nm = n ? [t(s.sn)] : s.nm.map(t);
          nm.forEach((w, j) => { g += txt(sl.cx, y0 + 38 + (j - (nm.length - 1) / 2) * 16, w, 'ec-boxsd', 'text-anchor="middle"'); });
        }
      });
      // moving coins and parcels during Play
      if (S.ph >= 0) {
        const ph = S.ph, coin = (pt) => `<g transform="translate(${r1(pt[0])} ${r1(pt[1])})"><circle r="8" fill="#FFD23F" stroke="#B45309" stroke-width="2"/><text y="4" text-anchor="middle" style="font:800 10px var(--font-body);fill:#92400E">₹</text></g>`;
        const parcel = (pt, col) => `<rect x="${r1(pt[0] - 6)}" y="${r1(pt[1] - 6)}" width="12" height="12" rx="3" fill="${col}" stroke="#fff" stroke-width="1.5"/>`;
        const run = (a, b, fn) => { const k = (ph - a) / (b - a); if (k < 0 || k > 1) return ''; let s = ''; for (let j = 0; j < 3; j++) s += fn(clamp((k - j * 0.18) / 0.64, 0, 1)); return s; };
        g += run(0, 0.36, (f) => coin(along(G.P.pay, f)) + parcel(along(G.P.serv, f), COL.e));
        g += run(0.33, 0.7, (f) => coin(along(G.P.spend, f)) + parcel(along(G.P.goods, f), COL.g) + SECT.map((s, i) => (S.tg[s.k] && S.p[s.leak] > 0 ? coin(along(G.slots[i].leak, f)) : '')).join(''));
        g += run(0.66, 1, (f) => SECT.map((s, i) => (S.tg[s.k] && S.p[s.inj] > 0 ? coin(along(G.slots[i].inj, f)) : '')).join(''));
      }
      if (S.round) g += pill(G.hx1 - 8, 30, t(T2('Round ', 'दौर ')) + S.round, '#0B2A6B', 'end');
      return g;
    },
    read(S, X) {
      const t = X.t, m = flowModel(S), st = MODES['circular-flow'].say(S, t);
      let h = tiles([[t(T2('Income Y', 'आय Y')), rs(m.Y, 0), COL.d], [t(T2('Consumption C', 'उपभोग C')), rs(m.C, 0), COL.gold], [t(T2('Leakages', 'रिसाव')), rs(m.leak, 0), COL.red], [t(T2('Injections', 'अंतःक्षेपण')), rs(m.J, 0), COL.g]]);
      h += status(st[0], st[1]);
      h += formula(t(T2(`Next income = C + injections = ${rs(m.C, 0)} + ${rs(m.J, 0)} = ${rs(m.next, 0)}`, `अगली आय = C + अंतःक्षेपण = ${rs(m.C, 0)} + ${rs(m.J, 0)} = ${rs(m.next, 0)}`)));
      if (m.sh > 0) h += note(t(T2(`Income settles where leakages = injections: Y = ${rs(m.J, 0)} ÷ ${fm(m.sh, 2)} = ${rs(m.star, 0)}. Amounts in ₹ crore.`, `आय वहाँ टिकती है जहाँ रिसाव = अंतःक्षेपण: Y = ${rs(m.J, 0)} ÷ ${fm(m.sh, 2)} = ${rs(m.star, 0)}। राशि ₹ करोड़ में।`)));
      h += note(t(T2('Dashed lines are real flows (goods, factor services); solid lines are money flows.', 'टूटी रेखाएँ वास्तविक प्रवाह हैं (वस्तुएँ, कारक सेवाएँ); ठोस रेखाएँ मुद्रा प्रवाह हैं।')));
      return h;
    },
    quiz(S, r, C) {
      const t = C.t, v = ri(r, 0, 2);
      if (v === 0) {
        const L1 = [ri(r, 5, 20) * 10, ri(r, 5, 20) * 10, ri(r, 3, 12) * 10], tot = L1[0] + L1[1] + L1[2], dlt = pick(r, [-40, 0, 40]);
        const J1 = [Math.round((tot + dlt) * 0.5 / 10) * 10, 0, 0]; J1[1] = Math.round((tot + dlt) * 0.3 / 10) * 10; J1[2] = tot + dlt - J1[0] - J1[1];
        const J = J1[0] + J1[1] + J1[2], ans = J > tot ? T2('Rise', 'बढ़ेगी') : J < tot ? T2('Fall', 'घटेगी') : T2('Stay the same', 'वही रहेगी');
        return mcq(r, t(T2(`Households save ₹${L1[0]}, pay ₹${L1[1]} in taxes and spend ₹${L1[2]} on imports. Firms invest ₹${J1[0]}, the government spends ₹${J1[1]} and exports bring in ₹${J1[2]}. Next round, income will:`, `परिवार ₹${L1[0]} बचाते हैं, ₹${L1[1]} कर देते हैं और ₹${L1[2]} आयात पर ख़र्च करते हैं। फ़र्में ₹${J1[0]} निवेश करती हैं, सरकार ₹${J1[1]} ख़र्च करती है और निर्यात से ₹${J1[2]} आते हैं। अगले दौर में आय:`)), t(ans), [t(T2('Rise', 'बढ़ेगी')), t(T2('Fall', 'घटेगी')), t(T2('Stay the same', 'वही रहेगी'))], t(T2(`Leakages = ${tot}, injections = ${J}. Income rises when injections are bigger, falls when leakages are bigger.`, `रिसाव = ${tot}, अंतःक्षेपण = ${J}। अंतःक्षेपण बड़े हों तो आय बढ़ती है, रिसाव बड़े हों तो घटती है।`)));
      }
      if (v === 1) return mcq(r, t(T2('Which of these is an injection into the circular flow?', 'इनमें से कौन चक्रीय प्रवाह में अंतःक्षेपण है?')), t(T2('Exports', 'निर्यात')), [t(T2('Saving', 'बचत')), t(T2('Taxes', 'कर')), t(T2('Imports', 'आयात'))], t(T2('Injections add spending on our firms\' goods from outside the household–firm loop: investment, government spending and exports.', 'अंतःक्षेपण परिवार–फ़र्म चक्र के बाहर से हमारी फ़र्मों की वस्तुओं पर ख़र्च जोड़ते हैं: निवेश, सरकारी व्यय और निर्यात।')));
      return mcq(r, t(T2('Wages that firms pay to households are a:', 'फ़र्में परिवारों को जो मज़दूरी देती हैं, वह है:')), t(T2('Money flow (a factor payment)', 'मुद्रा प्रवाह (कारक भुगतान)')), [t(T2('Real flow of goods', 'वस्तुओं का वास्तविक प्रवाह')), t(T2('Leakage', 'रिसाव')), t(T2('Injection', 'अंतःक्षेपण'))], t(T2('Households give labour (a real flow) and firms pay wages for it (a money flow).', 'परिवार श्रम देते हैं (वास्तविक प्रवाह) और फ़र्में उसके बदले मज़दूरी देती हैं (मुद्रा प्रवाह)।')));
    },
  };

  // ---- national income: from GDP to national income, and value added
  function aggr(p) {
    const gdp = p.C + p.I + p.G + p.X - p.M, ndp = gdp - p.dep, nnp = ndp + p.nfia, ni = nnp - p.nit;
    return { gdp, ndp, nnp, ni };
  }
  MODES['national-income'] = {
    name: T2('National income', 'राष्ट्रीय आय'),
    sub: T2('From GDP at market prices to national income, step by step; and why we add only value added.', 'बाज़ार कीमत पर GDP से राष्ट्रीय आय तक, क़दम-दर-क़दम; और हम केवल मूल्यवर्धन ही क्यों जोड़ते हैं।'),
    spec: { C: [0, 1e9, 0, 600], I: [0, 1e9, 0, 200], G: [0, 1e9, 0, 150], X: [0, 1e9, 0, 100], M: [0, 1e9, 0, 130], dep: [0, 1e9, 0, 60], nfia: [-1e9, 1e9, 0, -20], nit: [-1e9, 1e9, 0, 80], wheat: [1, 1e9, 0, 100], flour: [1, 1e9, 0, 150], bread: [1, 1e9, 0, 220] },
    tog: ['valueadded'], sl: ['C', 'I', 'G', 'X', 'M', 'dep', 'nfia', 'nit', 'wheat', 'flour', 'bread'],
    events: ['computed', 'answered:right', 'answered:wrong'],
    check(p) {
      const A = aggr(p), e = [];
      if (!(A.gdp > 0)) e.push('GDP = C + I + G + X − M must be above 0');
      if (p.dep >= A.gdp) e.push('depreciation must be less than GDP');
      if (!(A.ni > 0)) e.push('national income must come out above 0');
      if (!(p.flour > p.wheat)) e.push('flour must sell for more than the wheat it is made from');
      if (!(p.bread > p.flour)) e.push('bread must sell for more than the flour it is made from');
      return e;
    },
    dims: (n) => (n ? [340, 470] : [640, 430]),
    init(p) { const S = { p: Object.assign({}, p) }; S.rng = {}; Object.keys(p).forEach((k) => (S.rng[k] = nice(Math.max(2 * Math.abs(p[k]), 100)))); return S; },
    sliders(S) {
      const lb = { C: T2('Consumption C', 'उपभोग C'), I: T2('Investment I', 'निवेश I'), G: T2('Government spending G', 'सरकारी व्यय G'), X: T2('Exports X', 'निर्यात X'), M: T2('Imports M', 'आयात M'), dep: T2('Depreciation', 'मूल्यह्रास'), nfia: T2('Net factor income from abroad', 'विदेशों से निवल कारक आय'), nit: T2('Net indirect taxes', 'निवल अप्रत्यक्ष कर'), wheat: T2('Farmer sells wheat for', 'किसान गेहूँ बेचता है'), flour: T2('Miller sells flour for', 'चक्की वाला आटा बेचता है'), bread: T2('Baker sells bread for', 'बेकर ब्रेड बेचता है') };
      return Object.keys(lb).map((k) => ({ name: k, label: lb[k], min: k === 'nfia' || k === 'nit' ? -S.rng[k] : 0, max: S.rng[k], step: 1, get: () => S.p[k], fmt: (v) => rs(v, 0), hide: () => (['wheat', 'flour', 'bread'].includes(k) ? !S.tg.valueadded : !!S.tg.valueadded) }));
    },
    togLabel: { valueadded: T2('Value added: farm to bread', 'मूल्यवर्धन: खेत से ब्रेड तक') },
    slide(S, n, v, C) {
      const p = Object.assign({}, S.p, { [n]: v });
      if (MODES['national-income'].check(p).length) { C.toast(['wheat', 'flour', 'bread'].includes(n) ? T2('Each stage must sell for more than it paid for its input.', 'हर चरण को अपने कच्चे माल से ज़्यादा में बेचना होगा।') : T2('That would make GDP or national income zero or less.', 'इससे GDP या राष्ट्रीय आय शून्य या उससे कम हो जाएगी।')); return false; }
      S.p[n] = v;
    },
    release(S, n, C) {
      const A = aggr(S.p), p = S.p;
      C.live(S.tg.valueadded ? C.t(T2(`Value added: ${rs(p.wheat, 0)} + ${rs(p.flour - p.wheat, 0)} + ${rs(p.bread - p.flour, 0)} = ${rs(p.bread, 0)}, the value of the bread.`, `मूल्यवर्धन: ${rs(p.wheat, 0)} + ${rs(p.flour - p.wheat, 0)} + ${rs(p.bread - p.flour, 0)} = ${rs(p.bread, 0)}, ब्रेड का मूल्य।`)) : C.t(T2(`GDP ${rs(A.gdp, 0)} → national income ${rs(A.ni, 0)} crore.`, `GDP ${rs(A.gdp, 0)} → राष्ट्रीय आय ${rs(A.ni, 0)} करोड़।`)));
      C.emit('computed');
    },
    toggle(S, n, C) { S.tg[n] = !S.tg[n]; C.live(S.tg[n] ? C.t(T2('Follow the bread: each stage adds value to what it bought.', 'ब्रेड के पीछे चलो: हर चरण ख़रीदी चीज़ में मूल्य जोड़ता है।')) : C.t(T2('Back to the steps from GDP to national income.', 'वापस GDP से राष्ट्रीय आय के क़दमों पर।'))); },
    svg(S, X) {
      const t = X.t, p = S.p, W = X.W, H = X.H, n = X.narrow;
      let g = `<defs><pattern id="${X.cid}x" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#FEE2E2"/><path d="M0 0V8" stroke="#DC2626" stroke-width="3"/></pattern></defs>`;
      g += `<rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="16" fill="#FFFFFF" fill-opacity=".8"/>`;
      if (S.tg.valueadded) {
        const st = [{ nm: T2('Farmer', 'किसान'), what: T2('wheat', 'गेहूँ'), sale: p.wheat, inp: 0, col: '#CA8A04' }, { nm: T2('Miller', 'चक्की वाला'), what: T2('flour', 'आटा'), sale: p.flour, inp: p.wheat, col: '#0F766E' }, { nm: T2('Baker', 'बेकर'), what: T2('bread', 'ब्रेड'), sale: p.bread, inp: p.flour, col: '#C2410C' }];
        const top = 92, base = H - 150, sc = (base - top) / p.bread, bw = n ? 64 : 92;
        const icon = (i, x) => {
          if (i === 0) return `<g transform="translate(${x} 48)"><path d="M0 26V-14" stroke="#A16207" stroke-width="3"/>${[-12, -4, 4].map((y) => `<ellipse cx="-6" cy="${y}" rx="4" ry="8" fill="#EAB308" transform="rotate(-25 -6 ${y})"/><ellipse cx="6" cy="${y}" rx="4" ry="8" fill="#EAB308" transform="rotate(25 6 ${y})"/>`).join('')}<ellipse cx="0" cy="-20" rx="3.5" ry="7" fill="#EAB308"/></g>`;
          if (i === 1) return `<g transform="translate(${x} 48)"><circle r="20" fill="#E2E8F0" stroke="#475569" stroke-width="3"/>${[0, 45, 90, 135].map((a) => `<path d="M0 0L${r1(18 * Math.cos((a * Math.PI) / 180))} ${r1(18 * Math.sin((a * Math.PI) / 180))}M0 0L${r1(-18 * Math.cos((a * Math.PI) / 180))} ${r1(-18 * Math.sin((a * Math.PI) / 180))}" stroke="#475569" stroke-width="2.5"/>`).join('')}<circle r="5" fill="#475569"/></g>`;
          return `<g transform="translate(${x} 50)"><path d="M-26 10C-28 -14 28 -14 26 10Z" fill="#D97706" stroke="#92400E" stroke-width="2"/><path d="M-12 -4l4 6M0 -6l4 6M12 -4l4 6" stroke="#FDE68A" stroke-width="2.5" stroke-linecap="round"/></g>`;
        };
        st.forEach((s, i) => {
          const cx = W * (0.18 + i * 0.32), va = s.sale - s.inp;
          g += icon(i, cx) + txt(cx, 86, t(s.nm), 'ec-al', 'text-anchor="middle"');
          if (s.inp > 0) g += `<rect x="${r1(cx - bw / 2)}" y="${r1(base - s.inp * sc)}" width="${bw}" height="${r1(s.inp * sc)}" rx="6" fill="#CBD5E1"/>` + (s.inp * sc > 30 ? txt(cx, base - (s.inp * sc) / 2 + 4, t(T2('bought ', 'ख़रीदा ')) + rs(s.inp, 0), 'ec-boxsd', 'text-anchor="middle"') : '');
          g += `<rect x="${r1(cx - bw / 2)}" y="${r1(base - s.sale * sc)}" width="${bw}" height="${r1(va * sc)}" rx="6" fill="${s.col}"/>` + (va * sc > 30 ? txt(cx, base - s.inp * sc - (va * sc) / 2 + 4, '+' + rs(va, 0), 'ec-box', 'text-anchor="middle"') : '');
          g += lab(cx, base - s.sale * sc - 8, t(T2('sells ', 'बेचता ')) + rs(s.sale, 0), '#1E293B', 'middle', 'ec-sm');
          g += lab(cx, base + 18, t(T2('value added ', 'मूल्यवर्धन ')) + rs(va, 0), s.col, 'middle', 'ec-sm');
          if (i < 2) { const x1 = cx + bw / 2 + 6, x2 = W * (0.18 + (i + 1) * 0.32) - bw / 2 - 6; g += `<path d="M${r1(x1)} ${base - 30}H${r1(x2 - 6)}" stroke="#475569" stroke-width="2.5"/>` + arrowHead(x2 - 4, base - 30, 'right', '#475569', 6); }
        });
        const tot = p.wheat + p.flour + p.bread, sx = (v) => 16 + (v / tot) * (W - 32);
        g += txt(16, H - 104, t(T2('Adding every sale (double counting):', 'हर बिक्री जोड़ना (दोहरी गणना):')), 'ec-al') + `<rect x="16" y="${H - 96}" width="${r1(sx(tot) - 16)}" height="24" rx="8" fill="url(#${X.cid}x)" stroke="#DC2626"/>` + lab(sx(tot) - 8, H - 79, rs(tot, 0) + ' ✗', COL.red, 'end', 'ec-sm');
        g += txt(16, H - 52, t(T2('Adding only value added = the final bread:', 'केवल मूल्यवर्धन जोड़ना = अंतिम ब्रेड:')), 'ec-al') + `<rect x="16" y="${H - 44}" width="${r1(sx(p.bread) - 16)}" height="24" rx="8" fill="#22C55E" stroke="#15803D"/>` + lab(sx(p.bread) + 8, H - 27, rs(p.bread, 0) + ' ✓', COL.g, 'start', 'ec-sm');
        return g;
      }
      const A = aggr(p), nx = p.X - p.M;
      const mx = nice(1.04 * Math.max(p.C + p.I + p.G + Math.max(0, nx), A.gdp, A.ndp + Math.max(0, p.nfia), A.nnp + Math.max(0, -p.nit), A.ni));
      const L0 = 16, R0 = W - (n ? 66 : 84), sx = (v) => L0 + (v / mx) * (R0 - L0), rh = (H - 30) / 4, bh = n ? 26 : 30;
      const rows = [
        { lb: T2('GDP at market prices = C + I + G + (X − M)', 'बाज़ार कीमत पर GDP = C + I + G + (X − M)'), v: A.gdp },
        { lb: T2('NDP at market prices = GDP − depreciation', 'बाज़ार कीमत पर NDP = GDP − मूल्यह्रास'), v: A.ndp, from: A.gdp, d: T2('depreciation', 'मूल्यह्रास') },
        { lb: T2('NNP at market prices = NDP + net factor income from abroad', 'बाज़ार कीमत पर NNP = NDP + विदेशों से निवल कारक आय'), v: A.nnp, from: A.ndp, d: T2('NFIA', 'NFIA') },
        { lb: T2('National income (NNP at factor cost) = NNP − net indirect taxes', 'राष्ट्रीय आय (साधन लागत पर NNP) = NNP − निवल अप्रत्यक्ष कर'), v: A.ni, from: A.nnp, d: T2('net indirect taxes', 'निवल अप्रत्यक्ष कर') },
      ];
      const segTxt = (x0, x1, y, s, dark) => (x1 - x0 > s.length * 7 + 6 ? txt((x0 + x1) / 2, y + bh / 2 + 4.5, s, dark ? 'ec-boxsd' : 'ec-boxs', 'text-anchor="middle" style="font-weight:800"') : '');
      rows.forEach((row, i) => {
        const y = 20 + i * rh + 22;
        let lb = t(row.lb);
        if (n && lb.length > 50) lb = lb.split(' = ')[0];
        g += txt(L0, y - 7, lb, 'ec-al');
        if (i === 0) {
          let x = 0;
          [['C', p.C, COL.d], ['I', p.I, COL.teal], ['G', p.G, '#6D28D9'], ['X − M', Math.max(0, nx), '#F5B90A']].forEach(([k, v, col]) => { if (v <= 0) return; g += `<rect x="${r1(sx(x))}" y="${r1(y)}" width="${r1(sx(x + v) - sx(x))}" height="${bh}" fill="${col}" stroke="#fff" stroke-width="1.5"/>` + segTxt(sx(x), sx(x + v), y, k + ' ' + fm(v, 0), col === '#F5B90A'); x += v; });
          if (nx < 0) g += `<rect x="${r1(sx(A.gdp))}" y="${r1(y)}" width="${r1(sx(p.C + p.I + p.G) - sx(A.gdp))}" height="${bh}" fill="url(#${X.cid}x)"/>` + segTxt(sx(A.gdp), sx(p.C + p.I + p.G), y, '− ' + fm(-nx, 0), true);
        } else {
          const col = i === 3 ? '#F5B90A' : ['', '#0E7490', '#1D4ED8'][i];
          g += `<rect x="${r1(sx(0))}" y="${r1(y)}" width="${r1(sx(row.v) - sx(0))}" height="${bh}" rx="6" fill="${col}"/>`;
          const dv = row.v - row.from;
          if (Math.abs(dv) > 1e-9) {
            const a = Math.min(row.v, row.from), b = Math.max(row.v, row.from);
            g += dv < 0 ? `<rect x="${r1(sx(a))}" y="${r1(y)}" width="${r1(sx(b) - sx(a))}" height="${bh}" fill="url(#${X.cid}x)"/>` : `<rect x="${r1(sx(a))}" y="${r1(y)}" width="${r1(sx(b) - sx(a))}" height="${bh}" fill="#22C55E" stroke="#15803D"/>`;
            g += segTxt(sx(a), sx(b), y, (dv < 0 ? '− ' : '+ ') + fm(Math.abs(dv), 0), true);
          }
          g += `<path d="M${r1(sx(row.from))} ${r1(y - rh + bh)}V${r1(y)}" stroke="#94A3B8" stroke-width="1.5" stroke-dasharray="4 4"/>`;
        }
        g += lab(sx(Math.max(row.v, row.from || 0, i === 0 ? p.C + p.I + p.G + Math.max(0, nx) : 0)) + 6, y + bh / 2 + 5, rs(row.v, 0), i === 3 ? COL.gold : '#1E293B', 'start', 'ec-sm');
      });
      return g;
    },
    read(S, X) {
      const t = X.t, p = S.p, A = aggr(p);
      if (S.tg.valueadded) {
        let h = tiles([[t(T2('Farmer adds', 'किसान जोड़ता है')), rs(p.wheat, 0), '#CA8A04'], [t(T2('Miller adds', 'चक्की वाला जोड़ता है')), rs(p.flour - p.wheat, 0), COL.teal], [t(T2('Baker adds', 'बेकर जोड़ता है')), rs(p.bread - p.flour, 0), COL.s], [t(T2('Total value added', 'कुल मूल्यवर्धन')), rs(p.bread, 0), COL.g]]);
        h += status('ok', t(T2('Wheat and flour are intermediate goods: they are used up in making bread. Counting them again would be double counting.', 'गेहूँ और आटा मध्यवर्ती वस्तुएँ हैं: वे ब्रेड बनाने में ख़र्च हो जाते हैं। उन्हें दोबारा गिनना दोहरी गणना होगी।')));
        h += formula(t(T2('Value added = value of output − intermediate goods bought', 'मूल्यवर्धन = उत्पादन का मूल्य − ख़रीदी गई मध्यवर्ती वस्तुएँ')));
        h += note(t(T2('Here the farmer is taken to buy no inputs.', 'यहाँ माना गया है कि किसान कोई कच्चा माल नहीं ख़रीदता।')));
        return h;
      }
      let h = tiles([[t(T2('GDP at market prices', 'बाज़ार कीमत पर GDP')), rs(A.gdp, 0), COL.d], [t(T2('NDP at market prices', 'बाज़ार कीमत पर NDP')), rs(A.ndp, 0), COL.cyan], [t(T2('NNP at market prices', 'बाज़ार कीमत पर NNP')), rs(A.nnp, 0), COL.d], [t(T2('National income', 'राष्ट्रीय आय')), rs(A.ni, 0), COL.gold]]);
      h += formula(`GDPmp = ${fm(p.C)} + ${fm(p.I)} + ${fm(p.G)} + (${fm(p.X)} − ${fm(p.M)}) = ${fm(A.gdp)}`);
      h += formula(`NI = ${fm(A.gdp)} − ${fm(p.dep)} ${p.nfia < 0 ? '−' : '+'} ${fm(Math.abs(p.nfia))} ${p.nit < 0 ? '+' : '−'} ${fm(Math.abs(p.nit))} = ${fm(A.ni)}`);
      h += note(t(T2('Gross → net: take away depreciation. Domestic → national: add net factor income from abroad. Market prices → factor cost: take away indirect taxes, add subsidies. Amounts in ₹ crore.', 'सकल → निवल: मूल्यह्रास घटाओ। घरेलू → राष्ट्रीय: विदेशों से निवल कारक आय जोड़ो। बाज़ार कीमत → साधन लागत: अप्रत्यक्ष कर घटाओ, सब्सिडी जोड़ो। राशि ₹ करोड़ में।')));
      return h;
    },
    quiz(S, r, C) {
      const t = C.t, v = ri(r, 0, 2), f = (x) => rs(x, 0);
      if (v === 0) {
        const p = { C: ri(r, 40, 90) * 10, I: ri(r, 10, 30) * 10, G: ri(r, 10, 25) * 10, X: ri(r, 5, 15) * 10, M: ri(r, 5, 18) * 10, dep: ri(r, 2, 8) * 10, nfia: ri(r, -4, 4) * 5, nit: ri(r, 3, 10) * 10 }, A = aggr(p);
        return mcq(r, t(T2(`C = ${p.C}, I = ${p.I}, G = ${p.G}, X = ${p.X}, M = ${p.M}, depreciation = ${p.dep}, net factor income from abroad = ${p.nfia}, net indirect taxes = ${p.nit} (₹ crore). What is national income?`, `C = ${p.C}, I = ${p.I}, G = ${p.G}, X = ${p.X}, M = ${p.M}, मूल्यह्रास = ${p.dep}, विदेशों से निवल कारक आय = ${p.nfia}, निवल अप्रत्यक्ष कर = ${p.nit} (₹ करोड़)। राष्ट्रीय आय क्या है?`)), f(A.ni), [f(A.gdp), f(A.nnp), f(A.ni + 2 * p.dep), f(A.ndp - p.nit)], t(T2(`GDP = ${A.gdp}; NDP = ${A.ndp}; NNP = ${A.nnp}; national income = NNP − net indirect taxes = ${A.ni}.`, `GDP = ${A.gdp}; NDP = ${A.ndp}; NNP = ${A.nnp}; राष्ट्रीय आय = NNP − निवल अप्रत्यक्ष कर = ${A.ni}।`)));
      }
      if (v === 1) { const a = ri(r, 4, 20) * 10, b = a + ri(r, 2, 15) * 10; return mcq(r, t(T2(`A miller buys wheat for ₹${a} and sells the flour for ₹${b}. What is the miller's value added?`, `एक चक्की वाला ₹${a} का गेहूँ ख़रीदकर आटा ₹${b} में बेचता है। उसका मूल्यवर्धन क्या है?`)), f(b - a), [f(b), f(a + b), f(a)], t(T2('Value added = sale value − intermediate goods bought.', 'मूल्यवर्धन = बिक्री मूल्य − ख़रीदी गई मध्यवर्ती वस्तुएँ।'))); }
      return mcq(r, t(T2('Why do we add only the value added at each stage when finding GDP?', 'GDP निकालते समय हम हर चरण का केवल मूल्यवर्धन ही क्यों जोड़ते हैं?')), t(T2('To avoid counting intermediate goods twice', 'ताकि मध्यवर्ती वस्तुएँ दो बार न गिनी जाएँ')), [t(T2('Because farmers pay no tax', 'क्योंकि किसान कर नहीं देते')), t(T2('To include imports', 'आयात को शामिल करने के लिए')), t(T2('Because final goods are too costly', 'क्योंकि अंतिम वस्तुएँ बहुत महँगी हैं'))], t(T2('The wheat\'s value is already inside the flour\'s price, and the flour\'s inside the bread\'s. Adding all sales counts them again.', 'गेहूँ का मूल्य पहले से आटे की कीमत में है, और आटे का ब्रेड की कीमत में। सारी बिक्री जोड़ने से वे दोबारा गिने जाते हैं।')));
    },
  };

  // ---- money creation by banks: deposits multiply by 1 ÷ rr
  const SHADE = ['#0F766E', '#14B8A6', '#2DD4BF', '#0E7490', '#22D3EE', '#67E8F9'];
  MODES['money-creation'] = {
    name: T2('Money creation by banks', 'बैंकों द्वारा मुद्रा सृजन'),
    sub: T2('A bank keeps a part of each deposit as reserves and lends the rest; the loan comes back as a new deposit.', 'बैंक हर जमा का एक हिस्सा आरक्षित रखता है और बाक़ी उधार देता है; वह ऋण नई जमा बनकर लौटता है।'),
    spec: { deposit: [1, 1e9, 0, 1000], rr: [1, 100, 0, 20], rounds: [2, 15, 'int', 10], shown: [1, 15, 'int', 3] },
    sl: ['rr', 'deposit'], play: true,
    events: ['computed', 'answered:right', 'answered:wrong'],
    check(p) { return p.shown > p.rounds ? ['shown must be at most rounds'] : []; },
    init(p) { return { p: Object.assign({}, p), shown: p.shown, grow: 1, dmax: nice(Math.max(2 * p.deposit, 1000)) }; },
    math(S) {
      const r = S.p.rr / 100, D = S.p.deposit, k = S.shown, dep = (j) => D * Math.pow(1 - r, j - 1);
      const tot = (n) => (r >= 1 ? D * Math.min(n, 1) : (D * (1 - Math.pow(1 - r, n))) / r);
      return { r, D, k, dep, tot, lim: D / r, loans: (n) => tot(n) * (1 - r) };
    },
    sliders(S) { return [{ name: 'rr', label: T2('Reserve ratio rr (%)', 'आरक्षित अनुपात rr (%)'), min: Math.min(5, S.p.rr), max: Math.max(50, S.p.rr), step: 1, get: () => S.p.rr, fmt: (v) => fm(v, 0) + '%' }, { name: 'deposit', label: T2('First deposit (₹)', 'पहली जमा (₹)'), min: 1, max: S.dmax, step: 1, get: () => S.p.deposit, fmt: (v) => rs(v, 0) }]; },
    playLabel: T2('Lend and re-deposit, round by round', 'दौर-दर-दौर उधार दो और फिर जमा करो'),
    slide(S, n, v) { S.p[n] = v; },
    release(S, n, C) { const m = MODES['money-creation'].math(S); C.live(C.t(T2(`Money multiplier = 1 ÷ ${fm(m.r, 2)} = ${fm(1 / m.r, 2)}. At most, deposits reach ${rs(m.lim, 0)}.`, `मुद्रा गुणक = 1 ÷ ${fm(m.r, 2)} = ${fm(1 / m.r, 2)}। जमा अधिक से अधिक ${rs(m.lim, 0)} तक पहुँचती है।`))); C.emit('computed'); },
    play(S, C) {
      const MC2 = MODES['money-creation'];
      if (S.shown >= S.p.rounds) S.shown = 0;
      const step = () => {
        S.shown++; S.grow = 0;
        C.anim(560, (t) => { S.grow = ease(t); C.render(); }, () => {
          S.grow = 1; C.render();
          if (S.shown < S.p.rounds) return step();
          const m = MC2.math(S);
          C.live(C.t(T2(`After ${S.shown} rounds total deposits are ${rs(m.tot(S.shown), 0)}. They can never go past ${rs(m.D, 0)} × 1/${fm(m.r, 2)} = ${rs(m.lim, 0)}.`, `${S.shown} दौर के बाद कुल जमा ${rs(m.tot(S.shown), 0)} है। यह कभी ${rs(m.D, 0)} × 1/${fm(m.r, 2)} = ${rs(m.lim, 0)} से आगे नहीं जा सकती।`)));
          C.emit('computed');
        });
      };
      step();
    },
    svg(S, X) {
      const t = X.t, m = MODES['money-creation'].math(S), R = S.p.rounds, k = S.shown;
      const F = frame({ W: X.W, H: X.H, x: [0.4, R + 0.6], y: [0, nice(m.lim * 1.1)], cid: X.cid, narrow: X.narrow, xl: t(T2('Round of lending', 'उधार का दौर')), yl: t(T2('Total deposits in the banks (₹)', 'बैंकों में कुल जमा (₹)')), xs: R > 10 && X.narrow ? 2 : 1, xf: (v) => fm(v, 0), yf: (v) => fm(v, 0), l: 62 });
      let g = F.svg;
      const bw = (F.sx(1) - F.sx(0)) * 0.62;
      for (let i = 1; i <= k; i++) {
        let base = 0;
        for (let j = 1; j <= i; j++) {
          const h = m.dep(j) * (i === k && j === i ? S.grow : 1), y0 = F.sy(base), y1 = F.sy(base + h), x = F.sx(i) - bw / 2;
          if (y0 - y1 > 0.4) {
            g += `<rect x="${r1(x)}" y="${r1(y1)}" width="${r1(bw)}" height="${r1(y0 - y1)}" fill="${SHADE[(j - 1) % SHADE.length]}" ${j === i ? 'stroke="#1E293B" stroke-width="1.5"' : 'stroke="#fff" stroke-width=".8"'}/>`;
            g += `<rect x="${r1(x)}" y="${r1(y0 - (y0 - y1) * m.r)}" width="${r1(bw)}" height="${r1((y0 - y1) * m.r)}" fill="#042F2E" fill-opacity=".38"/>`;
          }
          base += h;
        }
        if (i === k) g += lab(F.sx(i), F.sy(base) - 8, rs(base, 0), '#0F766E', 'middle', 'ec-sm');
      }
      const ly = F.sy(m.lim);
      g += `<path d="M${F.l} ${r1(ly)}H${r1(F.r)}" stroke="${COL.red}" stroke-width="2.5" stroke-dasharray="9 6"/>` + lab(F.r - 6, ly - 8, t(T2('Limit: ', 'सीमा: ')) + rs(m.D, 0) + ' × 1/' + fm(m.r, 2) + ' = ' + rs(m.lim, 0), COL.red, 'end', 'ec-sm');
      g += `<rect x="${F.l + 10}" y="${F.t + 12}" width="14" height="14" rx="3" fill="#14B8A6"/>` + txt(F.l + 30, F.t + 24, t(T2('new deposit', 'नई जमा')), 'ec-t') + `<rect x="${F.l + 10}" y="${F.t + 32}" width="14" height="14" rx="3" fill="#0B5B55"/>` + txt(F.l + 30, F.t + 44, t(T2('part kept as reserves', 'आरक्षित रखा भाग')), 'ec-t');
      return g;
    },
    read(S, X) {
      const t = X.t, m = MODES['money-creation'].math(S), k = S.shown, d = m.dep(k);
      let h = tiles([[t(T2('Reserve ratio', 'आरक्षित अनुपात')), fm(S.p.rr, 0) + '%', '#334155'], [t(T2('Money multiplier', 'मुद्रा गुणक')), fm(1 / m.r, 2), COL.e], [t(T2('Deposits so far', 'अब तक जमा')), rs(m.tot(k), 0), COL.teal], [t(T2('Loans so far', 'अब तक ऋण')), rs(m.loans(k), 0), COL.d]]);
      h += status('ok', t(T2(`Round ${k}: ${rs(d, 0)} is deposited. The bank keeps ${rs(d * m.r, 0)} (${fm(S.p.rr, 0)}%) as reserves and lends ${rs(d * (1 - m.r), 0)}, which is spent and comes back as the next deposit.`, `दौर ${k}: ${rs(d, 0)} जमा होते हैं। बैंक ${rs(d * m.r, 0)} (${fm(S.p.rr, 0)}%) आरक्षित रखता है और ${rs(d * (1 - m.r), 0)} उधार देता है, जो ख़र्च होकर अगली जमा बनकर लौटता है।`)));
      h += formula(t(T2(`Total deposits (at most) = first deposit × 1 ÷ rr = ${rs(m.D, 0)} × ${fm(1 / m.r, 2)} = ${rs(m.lim, 0)}`, `कुल जमा (अधिकतम) = पहली जमा × 1 ÷ rr = ${rs(m.D, 0)} × ${fm(1 / m.r, 2)} = ${rs(m.lim, 0)}`)));
      return h;
    },
    quiz(S, r, C) {
      const t = C.t, v = ri(r, 0, 2), rr = pick(r, [5, 10, 20, 25, 50]), D = pick(r, [100, 500, 1000, 2000, 5000]), f = (x) => rs(x, 0);
      if (v === 0) return mcq(r, t(T2(`The reserve ratio is ${rr}%. What is the money multiplier?`, `आरक्षित अनुपात ${rr}% है। मुद्रा गुणक क्या है?`)), fm(100 / rr, 2), [fm(rr / 100, 2), fm(rr, 2), fm(100 - rr, 2), fm(100 / (100 - rr), 2)], t(T2(`Money multiplier = 1 ÷ rr = 1 ÷ ${fm(rr / 100, 2)} = ${fm(100 / rr, 2)}.`, `मुद्रा गुणक = 1 ÷ rr = 1 ÷ ${fm(rr / 100, 2)} = ${fm(100 / rr, 2)}।`)));
      if (v === 1) return mcq(r, t(T2(`Someone deposits ${f(D)} and the reserve ratio is ${rr}%. What is the most that total deposits can grow to?`, `कोई ${f(D)} जमा करता है और आरक्षित अनुपात ${rr}% है। कुल जमा अधिक से अधिक कितनी हो सकती है?`)), f((D * 100) / rr), [f(D), f((D * rr) / 100), f(D * (1 + rr / 100)), f((D * 100) / rr - D)], t(T2('Total deposits = first deposit × 1 ÷ rr.', 'कुल जमा = पहली जमा × 1 ÷ rr।')));
      return mcq(r, t(T2(`A bank receives a deposit of ${f(D)}. The reserve ratio is ${rr}%. How much can it lend?`, `एक बैंक को ${f(D)} की जमा मिलती है। आरक्षित अनुपात ${rr}% है। वह कितना उधार दे सकता है?`)), f((D * (100 - rr)) / 100), [f((D * rr) / 100), f(D), f((D * 100) / rr)], t(T2(`It must keep ${rr}% (${f((D * rr) / 100)}) as reserves and can lend the rest.`, `उसे ${rr}% (${f((D * rr) / 100)}) आरक्षित रखना होगा और बाक़ी उधार दे सकता है।`)));
    },
  };

  // ---- the Keynesian investment multiplier and the 45° line
  MODES.multiplier = {
    name: T2('The investment multiplier', 'निवेश गुणक'),
    sub: T2('Extra investment becomes someone\'s income; they spend a part (MPC) of it, which becomes someone else\'s income, and so on.', 'अतिरिक्त निवेश किसी की आय बनता है; वह उसका एक हिस्सा (MPC) ख़र्च करता है, जो किसी और की आय बनता है, और ऐसे ही आगे।'),
    spec: { mpc: [0.05, 0.95, 0, 0.8], auto: [0, 1e9, 0, 100], investment: [0, 1e9, 0, 100], change: [1, 1e9, 0, 100] },
    sl: ['mpc', 'investment', 'change'], play: true,
    events: ['shifted', 'equilibrium', 'computed', 'answered:right', 'answered:wrong'],
    dims: (n) => (n ? [340, 380] : [640, 440]),
    init(p) { return { p: Object.assign({}, p), raised: false, n: 0 }; },
    math(S) {
      const p = S.p, c = p.mpc, A0 = p.auto + p.investment, Y0 = A0 / (1 - c), Y1 = (A0 + p.change) / (1 - c), k = 1 / (1 - c);
      const N = Math.min(30, Math.max(3, Math.ceil(Math.log(0.01) / Math.log(c))));
      return { c, A0, Y0, Y1, k, N, dI: p.change };
    },
    sliders(S) {
      return [{ name: 'mpc', label: T2('MPC (share of extra income spent)', 'MPC (अतिरिक्त आय का ख़र्च हिस्सा)'), min: Math.min(0.1, S.p.mpc), max: 0.95, step: 0.01, get: () => S.p.mpc, fmt: (v) => fm(v, 2) },
        { name: 'investment', label: T2('Investment I (₹ crore)', 'निवेश I (₹ करोड़)'), min: 0, max: nice(Math.max(2 * S.p.investment, 200)), step: 1, get: () => S.p.investment, fmt: (v) => rs(v, 0) },
        { name: 'change', label: T2('Extra investment ΔI (₹ crore)', 'अतिरिक्त निवेश ΔI (₹ करोड़)'), min: 1, max: nice(Math.max(2 * S.p.change, 200)), step: 1, get: () => S.p.change, fmt: (v) => rs(v, 0) }];
    },
    playLabel: T2('Add the extra investment', 'अतिरिक्त निवेश जोड़ो'),
    slide(S, n, v) { S.p[n] = v; S.raised = false; S.n = 0; },
    release(S, n, C) { const m = MODES.multiplier.math(S); C.live(C.t(T2(`k = 1 ÷ (1 − ${fm(m.c, 2)}) = ${fm(m.k, 2)}. Equilibrium income is ${rs(m.Y0, 0)}.`, `k = 1 ÷ (1 − ${fm(m.c, 2)}) = ${fm(m.k, 2)}। संतुलन आय ${rs(m.Y0, 0)} है।`))); C.emit('computed'); },
    play(S, C) {
      const m = MODES.multiplier.math(S);
      S.raised = true; S.n = 0; C.render(); C.emit('shifted');
      C.anim(m.N * 380, (t) => { S.n = t * m.N; C.render(); }, () => {
        S.n = m.N; C.render();
        C.live(C.t(T2(`Income rose from ${rs(m.Y0, 0)} to ${rs(m.Y1, 0)}: ΔY = k × ΔI = ${fm(m.k, 2)} × ${rs(m.dI, 0)} = ${rs(m.k * m.dI, 0)}. Each round added less, because people save a part (1 − MPC) of every extra rupee.`, `आय ${rs(m.Y0, 0)} से बढ़कर ${rs(m.Y1, 0)} हुई: ΔY = k × ΔI = ${fm(m.k, 2)} × ${rs(m.dI, 0)} = ${rs(m.k * m.dI, 0)}। हर दौर में कम जुड़ा, क्योंकि लोग हर अतिरिक्त रुपये का एक हिस्सा (1 − MPC) बचाते हैं।`)));
        C.emit('equilibrium'); C.emit('computed');
      });
    },
    svg(S, X) {
      const t = X.t, m = MODES.multiplier.math(S), Ym = nice(m.Y1 * 1.12);
      const F = frame({ W: X.W, H: X.H, x: [0, Ym], y: [0, Ym], cid: X.cid, narrow: X.narrow, square: true, xl: t(T2('Income Y (₹ crore)', 'आय Y (₹ करोड़)')), yl: t(T2('Aggregate demand AD (₹ crore)', 'समग्र माँग AD (₹ करोड़)')), xf: (v) => fm(v, 0), yf: (v) => fm(v, 0), ny: 5 });
      let g = F.svg;
      g += seg(F, 0, 0, Ym, Ym, '#64748B', 'ec-thin') + lab(F.sx(Ym * 0.8) + 10, F.sy(Ym * 0.8) + 16, '45°: AD = Y', '#475569', 'start', 'ec-sm');
      const AD = (dI) => (Y) => m.A0 + dI + m.c * Y;
      g += S.raised ? fpath(F, AD(0), 0, Ym, COL.d, 'ec-ghost') + fpath(F, AD(m.dI), 0, Ym, COL.d) : fpath(F, AD(0), 0, Ym, COL.d);
      const yl = (fn) => clamp(F.sy(fn(Ym * 0.97)), F.t + 14, F.b - 8);
      g += lab(F.sx(Ym * 0.97), yl(AD(S.raised ? m.dI : 0)) - 8, S.raised ? 'AD₁ = C + I + ΔI' : 'AD = C + I', COL.d, 'end', 'ec-sm');
      if (S.raised) g += lab(F.sx(Ym * 0.97), yl(AD(0)) + 18, 'AD₀', '#64748B', 'end', 'ec-sm');
      // staircase
      if (S.raised && S.n > 0) {
        let Y = m.Y0, d = `M${r1(F.sx(Y))} ${r1(F.sy(Y))}`;
        const full = Math.floor(S.n), part = S.n - full;
        for (let i = 0; i < Math.min(full + 1, m.N); i++) {
          const step = m.dI * Math.pow(m.c, i), f = i < full ? 1 : part;
          if (f <= 0) break;
          const fv = Math.min(1, f * 2), fh = Math.max(0, f * 2 - 1);
          d += `V${r1(F.sy(Y + step * fv))}`;
          if (fh > 0) d += `H${r1(F.sx(Y + step * fh))}`;
          Y += step * (fh > 0 ? fh : 0);
          if (f < 1) break;
        }
        g += `<path d="${d}" fill="none" stroke="#F59E0B" stroke-width="3" stroke-linejoin="round" ${F.clip}/>`;
      }
      const E = (Y, nm, col, hollow) => `<path d="M${r1(F.sx(Y))} ${r1(F.sy(Y))}V${F.b}" class="ec-guide"/>` + dot(F.sx(Y), F.sy(Y), col, 7, hollow) + lab(F.sx(Y) - 12, F.sy(Y) - 10, nm, col, 'end') + pill(F.sx(Y), F.b - 14, fm(Y, 0), col, 'middle');
      g += E(m.Y0, S.raised ? 'E₀' : 'E', S.raised ? '#64748B' : '#6D28D9', S.raised);
      if (S.raised && S.n >= m.N - 1e-9) g += E(m.Y1, 'E₁', '#6D28D9');
      if (S.raised) { const x = F.l + 8; g += `<path d="M${x} ${r1(F.sy(m.A0))}V${r1(F.sy(m.A0 + m.dI))}" stroke="#F59E0B" stroke-width="4"/>` + lab(x + 6, (F.sy(m.A0) + F.sy(m.A0 + m.dI)) / 2 + 4, 'ΔI', COL.gold, 'start', 'ec-sm'); }
      // the rounds, beside the square chart on a wide screen
      if (!X.narrow) {
        const x0 = F.r + 34, w = X.W - x0 - 14, n = Math.min(8, m.N), bh = 20;
        g += txt(x0, F.t + 4, t(T2('Each round adds', 'हर दौर जोड़ता है')), 'ec-al');
        for (let i = 0; i < n; i++) {
          const v = m.dI * Math.pow(m.c, i), on = S.raised && S.n > i, y = F.t + 18 + i * (bh + 8);
          g += `<rect x="${r1(x0)}" y="${r1(y)}" width="${r1(w)}" height="${bh}" rx="6" fill="#F1F5F9"/><rect x="${r1(x0)}" y="${r1(y)}" width="${r1(Math.max(3, (w * v) / m.dI))}" height="${bh}" rx="6" fill="${on ? '#F59E0B' : '#CBD5E1'}"/>`;
          g += txt(x0 + 6, y + 14.5, (i + 1) + ': +' + fm(v, 1), 'ec-t', 'style="font-weight:800;font-size:12px"');
        }
        const yT = F.t + 18 + n * (bh + 8) + 14;
        g += txt(x0, yT, t(T2('… adds up to', '… कुल मिलाकर')), 'ec-t') + txt(x0, yT + 20, 'k × ΔI = ' + fm(m.k * m.dI, 0), 'ec-al', `style="fill:${COL.gold}"`);
      }
      return g;
    },
    read(S, X) {
      const t = X.t, m = MODES.multiplier.math(S);
      let h = tiles([[t(T2('MPC', 'MPC')), fm(m.c, 2), '#334155'], [t(T2('Multiplier k', 'गुणक k')), fm(m.k, 2), COL.e], [t(T2('Extra investment ΔI', 'अतिरिक्त निवेश ΔI')), rs(m.dI, 0), COL.gold], [t(T2('Change in income ΔY', 'आय में बदलाव ΔY')), rs(m.k * m.dI, 0), COL.g]]);
      h += formula(`k = 1 ÷ (1 − MPC) = 1 ÷ (1 − ${fm(m.c, 2)}) = ${fm(m.k, 2)}`);
      h += formula(t(T2(`Equilibrium: Y = (C₀ + I) ÷ (1 − MPC) = ${rs(m.A0, 0)} ÷ ${fm(1 - m.c, 2)} = ${rs(m.Y0, 0)}`, `संतुलन: Y = (C₀ + I) ÷ (1 − MPC) = ${rs(m.A0, 0)} ÷ ${fm(1 - m.c, 2)} = ${rs(m.Y0, 0)}`)));
      if (X.narrow) {
        h += `<div class="ec-rounds">${Array.from({ length: Math.min(6, m.N) }, (_, i) => { const v = m.dI * Math.pow(m.c, i); return `<div class="ec-round"><span>${esc(t(T2('Round ', 'दौर ')))}${i + 1}</span><i style="width:${r1((100 * v) / m.dI)}%;${S.raised && S.n > i ? '' : 'background:#CBD5E1'}"></i><span>+${fm(v, 1)}</span></div>`; }).join('')}</div>`;
      }
      h += note(t(T2('C₀ is the spending people do even with no income (autonomous consumption). Amounts in ₹ crore.', 'C₀ वह ख़र्च है जो लोग बिना आय के भी करते हैं (स्वायत्त उपभोग)। राशि ₹ करोड़ में।')));
      return h;
    },
    quiz(S, r, C) {
      const t = C.t, v = ri(r, 0, 2), c = pick(r, [0.5, 0.6, 0.75, 0.8, 0.9]), k = 1 / (1 - c), dI = pick(r, [100, 200, 500, 1000]);
      if (v === 0) return mcq(r, t(T2(`The MPC is ${fm(c, 2)}. What is the investment multiplier?`, `MPC ${fm(c, 2)} है। निवेश गुणक क्या है?`)), fm(k, 2), [fm(1 / c, 2), fm(c, 2), fm(1 - c, 2), fm(1 + c, 2)], t(T2(`k = 1 ÷ (1 − MPC) = 1 ÷ ${fm(1 - c, 2)} = ${fm(k, 2)}.`, `k = 1 ÷ (1 − MPC) = 1 ÷ ${fm(1 - c, 2)} = ${fm(k, 2)}।`)));
      if (v === 1) return mcq(r, t(T2(`Investment rises by ₹${dI} crore and the MPC is ${fm(c, 2)}. By how much does income rise?`, `निवेश ₹${dI} करोड़ बढ़ता है और MPC ${fm(c, 2)} है। आय कितनी बढ़ेगी?`)), rs(k * dI, 0), [rs(dI, 0), rs(c * dI, 0), rs(dI / c, 0), rs(k * dI * c, 0)], t(T2(`ΔY = k × ΔI = ${fm(k, 2)} × ${dI} = ${fm(k * dI, 0)}.`, `ΔY = k × ΔI = ${fm(k, 2)} × ${dI} = ${fm(k * dI, 0)}।`)));
      return mcq(r, t(T2('If people spend a bigger share of each extra rupee (MPC rises), the multiplier:', 'अगर लोग हर अतिरिक्त रुपये का बड़ा हिस्सा ख़र्च करें (MPC बढ़े), तो गुणक:')), t(T2('Becomes bigger', 'बड़ा हो जाता है')), [t(T2('Becomes smaller', 'छोटा हो जाता है')), t(T2('Stays the same', 'वही रहता है')), t(T2('Becomes zero', 'शून्य हो जाता है'))], t(T2('k = 1 ÷ (1 − MPC): a bigger MPC leaves a smaller number below the line, so k grows.', 'k = 1 ÷ (1 − MPC): MPC बड़ा होने से नीचे की संख्या छोटी होती है, इसलिए k बढ़ता है।')));
    },
  };

  // ---- the government budget and its deficits
  function bud(p) { const RR = p.tax + p.nontax, TE = p.revexp + p.capexp, FD = TE - RR - p.recoveries; return { RR, TE, RD: p.revexp - RR, FD, PD: FD - p.interest }; }
  MODES.budget = {
    name: T2('The government budget', 'सरकारी बजट'),
    sub: T2('What the government receives and spends in a year, and the three deficits.', 'सरकार एक साल में क्या पाती है और क्या ख़र्च करती है, और तीन घाटे।'),
    spec: { tax: [0, 1e9, 0, 2000], nontax: [0, 1e9, 0, 300], recoveries: [0, 1e9, 0, 50], revexp: [0, 1e9, 0, 2800], interest: [0, 1e9, 0, 900], capexp: [0, 1e9, 0, 700] },
    sl: ['tax', 'nontax', 'recoveries', 'revexp', 'interest', 'capexp'],
    events: ['computed', 'answered:right', 'answered:wrong'],
    check(p) { const e = []; if (p.interest > p.revexp) e.push('interest payments are part of revenue expenditure, so interest cannot be more than revexp'); if (!(p.revexp + p.capexp > 0)) e.push('total expenditure must be above 0'); if (!(p.tax + p.nontax + p.recoveries > 0)) e.push('receipts must be above 0'); return e; },
    dims: (n) => (n ? [340, 430] : [640, 430]),
    init(p) { const S = { p: Object.assign({}, p) }; S.rng = {}; Object.keys(p).forEach((k) => (S.rng[k] = nice(Math.max(2 * p[k], 200)))); return S; },
    sliders(S) {
      const lb = { tax: T2('Tax revenue', 'कर राजस्व'), nontax: T2('Non-tax revenue (fees, dividends)', 'ग़ैर-कर राजस्व (शुल्क, लाभांश)'), recoveries: T2('Loans paid back + sale of shares', 'ऋण वसूली + शेयरों की बिक्री'), revexp: T2('Revenue expenditure (salaries, subsidies, interest)', 'राजस्व व्यय (वेतन, सब्सिडी, ब्याज)'), interest: T2('…of which interest payments', '…जिसमें ब्याज भुगतान'), capexp: T2('Capital expenditure (roads, dams, schools)', 'पूँजीगत व्यय (सड़कें, बाँध, स्कूल)') };
      return Object.keys(lb).map((k) => ({ name: k, label: lb[k], min: 0, max: S.rng[k], step: 1, get: () => S.p[k], fmt: (v) => rs(v, 0) }));
    },
    slide(S, n, v, C) {
      const p = Object.assign({}, S.p, { [n]: v });
      if (n === 'revexp' && p.interest > v) p.interest = v;
      if (n === 'interest' && v > p.revexp) { C.toast(T2('Interest is part of revenue expenditure: it cannot be bigger.', 'ब्याज राजस्व व्यय का हिस्सा है: यह उससे बड़ा नहीं हो सकता।')); return false; }
      if (MODES.budget.check(p).length) return false;
      Object.assign(S.p, p);
    },
    say(S, t) { const B = bud(S.p); return B.FD > 0 ? ['warn', t(T2(`Spending is more than receipts, so the government must borrow ${rs(B.FD, 0)}: that is the fiscal deficit.`, `ख़र्च प्राप्तियों से ज़्यादा है, इसलिए सरकार को ${rs(B.FD, 0)} उधार लेना होगा: यही राजकोषीय घाटा है।`))] : ['ok', t(T2(`Receipts cover all spending: a surplus of ${rs(-B.FD, 0)}, so no borrowing is needed.`, `प्राप्तियाँ पूरा ख़र्च ढक लेती हैं: ${rs(-B.FD, 0)} का अधिशेष, इसलिए उधार की ज़रूरत नहीं।`))]; },
    release(S, n, C) { C.live(MODES.budget.say(S, C.t)[1]); C.emit('computed'); },
    svg(S, X) {
      const t = X.t, p = S.p, B = bud(p), n = X.narrow;
      const top = nice(1.06 * Math.max(B.TE, B.RR + p.recoveries, B.RR + p.recoveries + Math.max(0, B.FD)));
      const F = frame({ W: X.W, H: X.H, x: [0, 2], y: [0, top], cid: X.cid, narrow: n, xs: 10, xf: () => '', yl: t(T2('₹ crore', '₹ करोड़')), yf: (v) => fm(v, 0), b: 44, l: 58 });
      let g = F.svg;
      const bw = (F.sx(1) - F.sx(0)) * (n ? 0.66 : 0.56);
      const col = (cx, parts, title) => {
        let base = 0, s = '';
        parts.forEach(([nm, v, c, dark]) => {
          if (v <= 0) return;
          const y0 = F.sy(base), y1 = F.sy(base + v), h = y0 - y1, x = cx - bw / 2;
          s += `<rect x="${r1(x)}" y="${r1(y1)}" width="${r1(bw)}" height="${r1(h)}" fill="${c}" stroke="#fff" stroke-width="1.5"/>`;
          const cls = dark ? 'ec-boxsd' : 'ec-boxs';
          if (h >= 34) s += txt(cx, y1 + h / 2 - 3, t(nm), cls, `text-anchor="middle" style="font-weight:800"`) + txt(cx, y1 + h / 2 + 13, rs(v, 0), cls, 'text-anchor="middle"');
          else if (h >= 16) s += txt(cx, y1 + h / 2 + 4.5, t(nm) + ' ' + fm(v, 0), cls, `text-anchor="middle" style="font-size:11px;font-weight:800"`);
          base += v;
        });
        return s + txt(cx, F.b + 18, title, 'ec-al', 'text-anchor="middle"') + txt(cx, F.b + 34, rs(base, 0), 'ec-tk', 'text-anchor="middle"');
      };
      g += col(F.sx(0.5), [[T2('Tax', 'कर'), p.tax, '#1D4ED8'], [T2('Non-tax', 'ग़ैर-कर'), p.nontax, '#0E7490'], [T2('Recoveries', 'वसूली'), p.recoveries, '#0F766E'], [T2('Borrowing', 'उधार'), Math.max(0, B.FD), '#DC2626']], t(T2('Receipts', 'प्राप्तियाँ')));
      g += col(F.sx(1.5), [[T2('Interest', 'ब्याज'), p.interest, '#BE185D'], [T2('Other revenue spending', 'अन्य राजस्व व्यय'), p.revexp - p.interest, '#7C3AED'], [T2('Capital spending', 'पूँजीगत व्यय'), p.capexp, '#F5B90A', 1], [T2('Surplus', 'अधिशेष'), Math.max(0, -B.FD), '#15803D']], t(T2('Expenditure', 'व्यय')));
      if (B.FD > 0) { const y1 = F.sy(B.RR + p.recoveries), y2 = F.sy(B.RR + p.recoveries + B.FD), x = F.sx(0.5) + bw / 2 + 8; g += `<path d="M${r1(x)} ${r1(y1)}h6V${r1(y2)}h-6" fill="none" stroke="#DC2626" stroke-width="2.5"/>` + lab(x + 12, (y1 + y2) / 2 + 4, t(T2('fiscal deficit', 'राजकोषीय घाटा')), COL.red, 'start', 'ec-sm'); }
      return g;
    },
    read(S, X) {
      const t = X.t, p = S.p, B = bud(p), st = MODES.budget.say(S, t);
      let h = tiles([[t(T2('Revenue receipts', 'राजस्व प्राप्तियाँ')), rs(B.RR, 0), COL.d], [t(T2('Total expenditure', 'कुल व्यय')), rs(B.TE, 0), COL.e], [t(T2('Fiscal deficit', 'राजकोषीय घाटा')), rs(B.FD, 0), COL.red]]);
      h += status(st[0], st[1]);
      h += formula(t(T2(`Revenue deficit = revenue expenditure − revenue receipts = ${fm(p.revexp)} − ${fm(B.RR)} = ${fm(B.RD)}`, `राजस्व घाटा = राजस्व व्यय − राजस्व प्राप्तियाँ = ${fm(p.revexp)} − ${fm(B.RR)} = ${fm(B.RD)}`)));
      h += formula(t(T2(`Fiscal deficit = total expenditure − (revenue receipts + non-debt capital receipts) = ${fm(B.TE)} − ${fm(B.RR + p.recoveries)} = ${fm(B.FD)}`, `राजकोषीय घाटा = कुल व्यय − (राजस्व प्राप्तियाँ + ग़ैर-ऋण पूँजीगत प्राप्तियाँ) = ${fm(B.TE)} − ${fm(B.RR + p.recoveries)} = ${fm(B.FD)}`)));
      h += formula(t(T2(`Primary deficit = fiscal deficit − interest payments = ${fm(B.FD)} − ${fm(p.interest)} = ${fm(B.PD)}`, `प्राथमिक घाटा = राजकोषीय घाटा − ब्याज भुगतान = ${fm(B.FD)} − ${fm(p.interest)} = ${fm(B.PD)}`)));
      h += note(t(T2('A revenue deficit means the government borrows even to meet day-to-day spending. The primary deficit shows the borrowing that is not just for paying interest on old loans.', 'राजस्व घाटे का अर्थ है कि सरकार रोज़ के ख़र्च के लिए भी उधार लेती है। प्राथमिक घाटा वह उधार दिखाता है जो केवल पुराने ऋणों का ब्याज चुकाने के लिए नहीं है।')));
      return h;
    },
    quiz(S, r, C) {
      const t = C.t, v = ri(r, 0, 2), f = (x) => rs(x, 0);
      const p = { tax: ri(r, 15, 30) * 100, nontax: ri(r, 2, 5) * 100, recoveries: ri(r, 1, 3) * 50, revexp: 0, interest: 0, capexp: ri(r, 4, 9) * 100 };
      p.revexp = p.tax + p.nontax + ri(r, 1, 8) * 100; p.interest = ri(r, 4, 9) * 100;
      const B = bud(p);
      if (v === 0) return mcq(r, t(T2(`Revenue receipts are ${f(B.RR)} and revenue expenditure is ${f(p.revexp)} (₹ crore). What is the revenue deficit?`, `राजस्व प्राप्तियाँ ${f(B.RR)} और राजस्व व्यय ${f(p.revexp)} (₹ करोड़) है। राजस्व घाटा क्या है?`)), f(B.RD), [f(B.RR + p.revexp), f(B.FD), f(p.revexp)], t(T2('Revenue deficit = revenue expenditure − revenue receipts.', 'राजस्व घाटा = राजस्व व्यय − राजस्व प्राप्तियाँ।')));
      if (v === 1) return mcq(r, t(T2(`Total expenditure is ${f(B.TE)}. Revenue receipts are ${f(B.RR)} and recoveries of loans are ${f(p.recoveries)}. What is the fiscal deficit?`, `कुल व्यय ${f(B.TE)} है। राजस्व प्राप्तियाँ ${f(B.RR)} और ऋण वसूली ${f(p.recoveries)} है। राजकोषीय घाटा क्या है?`)), f(B.FD), [f(B.TE - B.RR), f(B.RD), f(B.TE + p.recoveries - B.RR)], t(T2('Fiscal deficit = total expenditure − revenue receipts − non-debt capital receipts. It is what must be borrowed.', 'राजकोषीय घाटा = कुल व्यय − राजस्व प्राप्तियाँ − ग़ैर-ऋण पूँजीगत प्राप्तियाँ। इतना ही उधार लेना पड़ता है।')));
      return mcq(r, t(T2(`The fiscal deficit is ${f(B.FD)} and interest payments are ${f(p.interest)}. What is the primary deficit?`, `राजकोषीय घाटा ${f(B.FD)} और ब्याज भुगतान ${f(p.interest)} है। प्राथमिक घाटा क्या है?`)), f(B.PD), [f(B.FD + p.interest), f(p.interest), f(B.FD)], t(T2('Primary deficit = fiscal deficit − interest payments.', 'प्राथमिक घाटा = राजकोषीय घाटा − ब्याज भुगतान।')));
    },
  };

  // ---- sectors of the economy: a sorting game
  const JOBS = [
    [T2('Farmer growing wheat on her own field', 'अपने खेत में गेहूँ उगाने वाली किसान'), 'p', 'u', 'pri'],
    [T2('Fisherman with a small boat', 'छोटी नाव वाला मछुआरा'), 'p', 'u', 'pri'],
    [T2('Miner in a government-owned coal mine', 'सरकारी कोयला खदान में खनिक'), 'p', 'o', 'pub'],
    [T2('Dairy farmer with two buffaloes', 'दो भैंसों वाला डेयरी किसान'), 'p', 'u', 'pri'],
    [T2('Collecting honey in a forest', 'जंगल में शहद इकट्ठा करना'), 'p', 'u', 'pri'],
    [T2('Handloom weaver working at home', 'घर पर काम करने वाला हथकरघा बुनकर'), 's', 'u', 'pri'],
    [T2('Worker in a big car factory, with a job contract', 'बड़ी कार फ़ैक्टरी में अनुबंध वाला मज़दूर'), 's', 'o', 'pri'],
    [T2('Worker in a government steel plant', 'सरकारी इस्पात संयंत्र में मज़दूर'), 's', 'o', 'pub'],
    [T2('Construction labourer hired for the day', 'दिन भर के लिए रखा गया निर्माण मज़दूर'), 's', 'u', 'pri'],
    [T2('Tailor stitching clothes in a small shop', 'छोटी दुकान में कपड़े सिलने वाला दर्ज़ी'), 's', 'u', 'pri'],
    [T2('Engineer at a government power station', 'सरकारी बिजलीघर में इंजीनियर'), 's', 'o', 'pub'],
    [T2('Potter making clay pots at home', 'घर पर मिट्टी के बर्तन बनाने वाला कुम्हार'), 's', 'u', 'pri'],
    [T2('Teacher in a government school', 'सरकारी स्कूल में शिक्षक'), 't', 'o', 'pub'],
    [T2('Street vendor selling vegetables', 'सब्ज़ी बेचने वाला फेरीवाला'), 't', 'u', 'pri'],
    [T2('Nurse in a private hospital', 'निजी अस्पताल में नर्स'), 't', 'o', 'pri'],
    [T2('Ticket checker on the railways', 'रेलवे में टिकट जाँचने वाला'), 't', 'o', 'pub'],
    [T2('Software engineer in a large IT company', 'बड़ी आईटी कंपनी में सॉफ़्टवेयर इंजीनियर'), 't', 'o', 'pri'],
    [T2('Clerk in a public sector bank', 'सार्वजनिक क्षेत्र के बैंक में क्लर्क'), 't', 'o', 'pub'],
    [T2('Mobile repairer at a roadside stall', 'सड़क किनारे स्टॉल पर मोबाइल ठीक करने वाला'), 't', 'u', 'pri'],
    [T2('Postman delivering letters', 'चिट्ठियाँ बाँटने वाला डाकिया'), 't', 'o', 'pub'],
  ].map(([n, s, o, w]) => ({ n, s, o, w }));
  const BIN_ICON = {
    p: '<svg viewBox="0 0 64 50" aria-hidden="true"><circle cx="52" cy="11" r="8" fill="#FFD23F"/><path d="M4 44h56" stroke="#65A30D" stroke-width="5" stroke-linecap="round"/><path d="M22 44V18M38 44V22" stroke="#15803D" stroke-width="3"/><ellipse cx="16" cy="24" rx="7" ry="3.6" fill="#22C55E" transform="rotate(-30 16 24)"/><ellipse cx="28" cy="20" rx="7" ry="3.6" fill="#22C55E" transform="rotate(30 28 20)"/><ellipse cx="38" cy="18" rx="3.5" ry="7" fill="#EAB308"/></svg>',
    s: '<svg viewBox="0 0 64 50" aria-hidden="true"><circle cx="49" cy="8" r="5" fill="#CBD5E1"/><circle cx="56" cy="4" r="3.5" fill="#E2E8F0"/><path d="M4 46V26l12 8v-8l12 8v-8l12 8V12h9v34z" fill="#64748B"/><rect x="9" y="36" width="6" height="6" rx="1" fill="#FFD23F"/><rect x="21" y="36" width="6" height="6" rx="1" fill="#FFD23F"/><rect x="33" y="36" width="6" height="6" rx="1" fill="#FFD23F"/></svg>',
    t: '<svg viewBox="0 0 64 50" aria-hidden="true"><path d="M8 20h48l-4-10H12z" fill="#EC4899"/><path d="M8 20h8v4H8zM24 20h8v4h-8zM40 20h8v4h-8z" fill="#fff"/><rect x="11" y="24" width="42" height="22" rx="2" fill="#7C3AED"/><rect x="17" y="30" width="12" height="16" fill="#C4B5FD"/><rect x="34" y="30" width="13" height="9" rx="1" fill="#DDD6FE"/></svg>',
    o: '<svg viewBox="0 0 64 50" aria-hidden="true"><rect x="14" y="6" width="36" height="40" rx="3" fill="#1D4ED8"/>' + [0, 1, 2, 3].map((r) => [0, 1, 2].map((c) => `<rect x="${19 + c * 10}" y="${11 + r * 8}" width="6" height="5" fill="#BFDBFE"/>`).join('')).join('') + '<rect x="28" y="38" width="8" height="8" fill="#93C5FD"/></svg>',
    u: '<svg viewBox="0 0 64 50" aria-hidden="true"><path d="M10 18h40l-3-8H13z" fill="#F97316"/><rect x="12" y="18" width="36" height="16" rx="2" fill="#F59E0B"/><circle cx="20" cy="27" r="3.5" fill="#22C55E"/><circle cx="28" cy="26" r="3.5" fill="#EF4444"/><circle cx="36" cy="27" r="3.5" fill="#22C55E"/><circle cx="19" cy="41" r="5" fill="#334155"/><circle cx="41" cy="41" r="5" fill="#334155"/><path d="M48 24l10-6" stroke="#78350F" stroke-width="3" stroke-linecap="round"/></svg>',
    pub: '<svg viewBox="0 0 64 50" aria-hidden="true"><path d="M8 18L32 6l24 12z" fill="#0F766E"/><rect x="8" y="18" width="48" height="4" fill="#134E4A"/>' + [0, 1, 2, 3, 4].map((i) => `<rect x="${12 + i * 9}" y="23" width="4" height="17" fill="#5EEAD4"/>`).join('') + '<rect x="6" y="40" width="52" height="6" rx="1" fill="#134E4A"/></svg>',
    pri: '<svg viewBox="0 0 64 50" aria-hidden="true"><rect x="10" y="16" width="44" height="30" rx="3" fill="#C2410C"/><rect x="14" y="8" width="36" height="10" rx="2" fill="#FED7AA"/><rect x="17" y="24" width="12" height="22" fill="#FDBA74"/><rect x="34" y="24" width="15" height="10" fill="#FFEDD5"/><circle cx="26" cy="36" r="1.5" fill="#7C2D12"/></svg>',
  };
  const SCHEME = {
    sectors: { key: 's', bins: [{ id: 'p', nm: T2('Primary', 'प्राथमिक'), d: T2('uses nature directly', 'प्रकृति का सीधा उपयोग'), why: T2('it uses natural resources directly (farming, fishing, mining, forests)', 'यह प्राकृतिक संसाधनों का सीधा उपयोग करता है (खेती, मछली, खनन, जंगल)') }, { id: 's', nm: T2('Secondary', 'द्वितीयक'), d: T2('makes or builds goods', 'वस्तुएँ बनाता या निर्माण करता'), why: T2('it makes or builds goods from raw materials', 'यह कच्चे माल से वस्तुएँ बनाता या निर्माण करता है') }, { id: 't', nm: T2('Tertiary', 'तृतीयक'), d: T2('gives services', 'सेवाएँ देता'), why: T2('it gives a service, not a good', 'यह कोई वस्तु नहीं, सेवा देता है') }] },
    organised: { key: 'o', bins: [{ id: 'o', nm: T2('Organised', 'संगठित'), d: T2('registered; regular jobs and rules', 'पंजीकृत; नियमित काम और नियम'), why: T2('the work is registered, with regular jobs, fixed hours and rules that protect workers', 'यह काम पंजीकृत है, नियमित नौकरी, तय घंटे और मज़दूरों की रक्षा के नियमों के साथ') }, { id: 'u', nm: T2('Unorganised', 'असंगठित'), d: T2('small; no job security', 'छोटा; नौकरी की सुरक्षा नहीं'), why: T2('it is small and often not registered, with few rules and no job security', 'यह छोटा है और अक्सर पंजीकृत नहीं, कम नियम और नौकरी की कोई सुरक्षा नहीं') }] },
    ownership: { key: 'w', bins: [{ id: 'pub', nm: T2('Public sector', 'सार्वजनिक क्षेत्र'), d: T2('owned by the government', 'सरकार के स्वामित्व में'), why: T2('the government owns it', 'इसका स्वामी सरकार है') }, { id: 'pri', nm: T2('Private sector', 'निजी क्षेत्र'), d: T2('owned by people or companies', 'लोगों या कंपनियों के स्वामित्व में'), why: T2('a person or a company owns it', 'इसका स्वामी कोई व्यक्ति या कंपनी है') }] },
  };
  const SCHEMES = ['sectors', 'organised', 'ownership'];
  function sortRound(S) {
    const r = rng(S.seed++), sc = SCHEME[S.scheme], idx = JOBS.map((_, i) => i), pickd = [];
    sc.bins.forEach((b) => { const pool = shuffle(r, idx.filter((i) => JOBS[i][sc.key] === b.id && !pickd.includes(i))); if (pool.length) pickd.push(pool[0]); });
    shuffle(r, idx.filter((i) => !pickd.includes(i))).slice(0, Math.max(0, S.count - pickd.length)).forEach((i) => pickd.push(i));
    S.deck = shuffle(r, pickd); S.placed = {}; sc.bins.forEach((b) => (S.placed[b.id] = [])); S.sel = null; S.first = 0; S.missed = new Set(); S.flash = null;
  }
  MODES.sectors = {
    name: T2('Sectors of the economy', 'अर्थव्यवस्था के क्षेत्रक'),
    sub: T2('Sort each job: primary, secondary or tertiary; organised or unorganised; public or private.', 'हर काम को छाँटो: प्राथमिक, द्वितीयक या तृतीयक; संगठित या असंगठित; सार्वजनिक या निजी।'),
    spec: { count: [3, 12, 'int', 6], scheme: [1, 3, 'int', 1] },
    tog: SCHEMES, noTogParams: true, noNumbers: true, sl: [], play: true, answer: true,
    events: ['answered:right', 'answered:wrong', 'computed'],
    init(p) { const S = { p, count: p.count, scheme: SCHEMES[p.scheme - 1], seed: 11 }; sortRound(S); return S; },
    after(S) { SCHEMES.forEach((k) => (S.tg[k] = k === S.scheme)); },
    togLabel: { sectors: T2('Primary · secondary · tertiary', 'प्राथमिक · द्वितीयक · तृतीयक'), organised: T2('Organised or unorganised', 'संगठित या असंगठित'), ownership: T2('Public or private', 'सार्वजनिक या निजी') },
    playLabel: T2('New set of jobs', 'कामों का नया सेट'),
    toggle(S, n, C) { S.scheme = n; SCHEMES.forEach((k) => (S.tg[k] = k === n)); sortRound(S); C.live(C.t(T2('New sorting game: tap a job, then tap where it belongs.', 'नया छँटाई खेल: एक काम पर टैप करो, फिर वहाँ टैप करो जहाँ वह जाता है।'))); },
    play(S, C) { sortRound(S); C.render(); C.live(C.t(T2('New jobs to sort.', 'छाँटने के लिए नए काम।'))); },
    answer(S, target, C) {
      const card = target.closest('[data-card]'), bin = target.closest('[data-bin]'), t = C.t;
      if (card) { const i = +card.dataset.card; S.sel = S.sel === i ? null : i; C.render(); const again = C.root.querySelector(`[data-card="${i}"]`); if (again) again.focus(); return; }
      if (!bin) return;
      if (S.sel == null) { C.toast(T2('First tap a job card.', 'पहले किसी काम के कार्ड पर टैप करो।')); return; }
      const sc = SCHEME[S.scheme], job = JOBS[S.sel], right = job[sc.key], b = sc.bins.find((x) => x.id === bin.dataset.bin), rb = sc.bins.find((x) => x.id === right);
      if (b.id === right) {
        S.placed[right].push(S.sel); S.deck = S.deck.filter((x) => x !== S.sel); if (!S.missed.has(S.sel)) S.first++;
        S.flash = { id: right, k: 'glow' }; S.sel = null;
        C.live(t(T2(`Yes: ${job.n.en} is ${rb.nm.en.toLowerCase()}, because ${rb.why.en}.`, `हाँ: ${job.n.hi} ${rb.nm.hi} है, क्योंकि ${rb.why.hi}।`)));
        C.record(t(job.n) + ' → ' + t(rb.nm)); C.emit('answered:right');
        if (!S.deck.length) { C.render(); C.emit('computed'); C.celebrate(); C.live(t(T2(`All sorted! ${S.first} of ${S.count} right on the first try.`, `सब छँट गए! ${S.count} में से ${S.first} पहली बार में सही।`))); return; }
      } else {
        S.missed.add(S.sel); S.flash = { id: b.id, k: 'shake' };
        C.live(t(T2(`Not ${b.nm.en.toLowerCase()}. Think again: is it ${sc.bins.map((x) => x.d.en).join(', or ')}?`, `${b.nm.hi} नहीं। फिर सोचो: क्या यह ${sc.bins.map((x) => x.d.hi).join(', या ')} है?`)));
        C.emit('answered:wrong');
      }
      C.render();
    },
    stage(S, X) {
      const t = X.t, sc = SCHEME[S.scheme], fl = S.flash;
      S.flash = null;
      return `<div class="ec-sort"><div class="ec-bins" style="--n:${sc.bins.length}" data-key="answer">${sc.bins.map((b) => `<button type="button" class="ec-bin${S.sel != null ? ' ready' : ''}${fl && fl.id === b.id ? ' ' + fl.k : ''}" data-bin="${b.id}" aria-label="${esc(t(b.nm) + ': ' + t(b.d))}">${BIN_ICON[b.id]}<b>${esc(t(b.nm))}</b><span>${esc(t(b.d))}</span><span class="ec-chips">${S.placed[b.id].map((i) => `<span class="ec-chip">${esc(t(JOBS[i].n))}</span>`).join('')}</span></button>`).join('')}</div></div>`;
    },
    read(S, X) {
      const t = X.t, done = S.count - S.deck.length;
      let h = `<p class="ec-score">${esc(t(T2(`Sorted ${done} of ${S.count} · right first time ${S.first}`, `छँटे ${S.count} में से ${done} · पहली बार में सही ${S.first}`)))}</p>`;
      h += S.deck.length ? `<p class="ec-note" style="margin:0 0 8px">${esc(t(T2('Tap a job, then tap the box where it belongs.', 'एक काम पर टैप करो, फिर उस डिब्बे पर जहाँ वह जाता है।')))}</p><div class="ec-cards" data-key="answer">${S.deck.map((i) => `<button type="button" class="ec-cardbtn" data-card="${i}" aria-pressed="${S.sel === i}">${esc(t(JOBS[i].n))}</button>`).join('')}</div>` : status('ok', t(T2('All sorted. Press "New set of jobs" or switch to another way of sorting.', 'सब छँट गए। "कामों का नया सेट" दबाओ या छाँटने का दूसरा तरीक़ा चुनो।')));
      return h;
    },
  };

  // ---- credit: a bank loan and a moneylender's loan
  MODES.credit = {
    name: T2('Credit: bank or moneylender?', 'साख: बैंक या साहूकार?'),
    sub: T2('Borrow the same money from a bank (formal) and from a moneylender (informal), and compare what must be paid back.', 'वही रक़म बैंक (औपचारिक) और साहूकार (अनौपचारिक) से उधार लो, और तुलना करो कि कितना लौटाना पड़ता है।'),
    spec: { principal: [100, 1e9, 0, 10000], months: [1, 60, 'int', 12], bank: [1, 40, 0, 12], lender: [0.5, 15, 0, 3] },
    tog: ['compound'], sl: ['principal', 'months', 'bank', 'lender'], play: true,
    events: ['computed', 'answered:right', 'answered:wrong'],
    init(p) { return { p: Object.assign({}, p), m: p.months, pmax: nice(Math.max(2 * p.principal, 1000)) }; },
    owe(S, who, m) { const p = S.p, P = p.principal; if (who === 'bank') return S.tg.compound ? P * Math.pow(1 + p.bank / 1200, m) : P * (1 + (p.bank * m) / 1200); return S.tg.compound ? P * Math.pow(1 + p.lender / 100, m) : P * (1 + (p.lender * m) / 100); },
    sliders(S) {
      return [{ name: 'principal', label: T2('Loan amount (₹)', 'ऋण की रक़म (₹)'), min: 100, max: S.pmax, step: 100, get: () => S.p.principal, fmt: (v) => rs(v, 0) },
        { name: 'months', label: T2('Time (months)', 'समय (महीने)'), min: 1, max: Math.max(36, S.p.months), step: 1, get: () => S.p.months, fmt: (v) => fm(v, 0) },
        { name: 'bank', label: T2('Bank interest (% a year)', 'बैंक ब्याज (% प्रति वर्ष)'), min: 1, max: Math.max(30, S.p.bank), step: 0.5, get: () => S.p.bank, fmt: (v) => fm(v, 1) + '%' },
        { name: 'lender', label: T2('Moneylender interest (% a month)', 'साहूकार ब्याज (% प्रति माह)'), min: 0.5, max: Math.max(10, S.p.lender), step: 0.5, get: () => S.p.lender, fmt: (v) => fm(v, 1) + '%' }];
    },
    togLabel: { compound: T2('Interest on interest (compound)', 'ब्याज पर ब्याज (चक्रवृद्धि)') },
    playLabel: T2('Let the months pass', 'महीने बीतने दो'),
    slide(S, n, v) { S.p[n] = v; if (n === 'months' || S.m > S.p.months) S.m = S.p.months; },
    say(S, t) { const CR = MODES.credit, b = CR.owe(S, 'bank', S.m), l = CR.owe(S, 'lender', S.m); return t(T2(`After ${fm(S.m, 0)} months: ${rs(b, 0)} to the bank but ${rs(l, 0)} to the moneylender. The informal loan costs ${rs(l - b, 0)} more.`, `${fm(S.m, 0)} महीने बाद: बैंक को ${rs(b, 0)} पर साहूकार को ${rs(l, 0)}। अनौपचारिक ऋण ${rs(l - b, 0)} ज़्यादा महँगा पड़ता है।`)); },
    release(S, n, C) { C.live(MODES.credit.say(S, C.t)); C.emit('computed'); },
    play(S, C) { const M2 = S.p.months; C.anim(Math.min(4000, 600 + M2 * 160), (t) => { S.m = M2 * t; C.render(); }, () => { S.m = M2; C.render(); C.live(MODES.credit.say(S, C.t)); C.emit('computed'); }); },
    svg(S, X) {
      const t = X.t, CR = MODES.credit, M2 = S.p.months, top = nice(CR.owe(S, 'lender', M2) * 1.1);
      const F = frame({ W: X.W, H: X.H, x: [0, M2], y: [0, top], cid: X.cid, narrow: X.narrow, xl: t(T2('Months', 'महीने')), yl: t(T2('Amount to pay back (₹)', 'लौटाने की रक़म (₹)')), xs: M2 <= 12 ? (X.narrow ? 2 : 1) : M2 <= 24 ? (X.narrow ? 4 : 2) : 6, xf: (v) => fm(v, 0), yf: (v) => fm(v, 0), l: 66 });
      let g = F.svg;
      const pts = (who) => Array.from({ length: 61 }, (_, i) => { const m = (M2 * i) / 60; return r1(F.sx(m)) + ' ' + r1(F.sy(CR.owe(S, who, m))); });
      g += `<path d="M${F.l} ${F.b}L${pts('bank').join('L')}L${r1(F.r)} ${F.b}Z" fill="#3B82F6" fill-opacity=".10"/>`;
      g += `<path d="M${pts('bank').join('L')}L${pts('lender').reverse().join('L')}Z" fill="#F97316" fill-opacity=".22"/>`;
      g += `<path d="M${F.l} ${r1(F.sy(S.p.principal))}H${r1(F.r)}" stroke="#64748B" stroke-width="2" stroke-dasharray="6 5"/>` + lab(F.l + 8, F.sy(S.p.principal) + 18, t(T2('Loan ', 'ऋण ')) + rs(S.p.principal, 0), '#475569', 'start', 'ec-sm');
      g += fpath(F, (m) => CR.owe(S, 'bank', m), 0, M2, COL.d) + fpath(F, (m) => CR.owe(S, 'lender', m), 0, M2, COL.s);
      const mL = M2 * 0.3;
      g += lab(F.sx(mL), F.sy(CR.owe(S, 'lender', mL)) - 12, t(T2('Moneylender (informal)', 'साहूकार (अनौपचारिक)')), COL.s, 'start', 'ec-sm') + lab(F.sx(mL), Math.min(F.sy(CR.owe(S, 'bank', mL)) + 20, F.sy(S.p.principal) - 6), t(T2('Bank (formal)', 'बैंक (औपचारिक)')), COL.d, 'start', 'ec-sm');
      const x = F.sx(S.m), b = CR.owe(S, 'bank', S.m), l = CR.owe(S, 'lender', S.m);
      g += `<path d="M${r1(x)} ${F.t}V${F.b}" class="ec-guide"/>` + dot(x, F.sy(l), COL.s, 6.5) + dot(x, F.sy(b), COL.d, 6.5);
      const side = x > F.l + (F.r - F.l) * 0.6 ? 'end' : 'start', dx = side === 'end' ? -10 : 10;
      g += pill(x + dx, F.sy(l) - (F.sy(b) - F.sy(l) < 26 ? 14 : 0), rs(l, 0), COL.s, side) + pill(x + dx, F.sy(b) + (F.sy(b) - F.sy(l) < 26 ? 14 : 0), rs(b, 0), COL.d, side);
      return g;
    },
    read(S, X) {
      const t = X.t, CR = MODES.credit, b = CR.owe(S, 'bank', S.m), l = CR.owe(S, 'lender', S.m), P = S.p.principal;
      let h = tiles([[t(T2('Pay the bank', 'बैंक को देना')), rs(b, 0), COL.d], [t(T2('Pay the moneylender', 'साहूकार को देना')), rs(l, 0), COL.s], [t(T2('Extra cost of informal loan', 'अनौपचारिक ऋण की अतिरिक्त लागत')), rs(l - b, 0), COL.red]]);
      h += status(l - b > 0.1 * P ? 'bad' : 'warn', CR.say(S, t));
      h += formula(S.tg.compound ? t(T2('Amount = loan × (1 + monthly rate)^months', 'रक़म = ऋण × (1 + मासिक दर)^महीने')) : t(T2(`Simple interest = loan × rate × time. Bank: ${fm(S.p.bank, 1)}% a year; moneylender: ${fm(S.p.lender, 1)}% a month = ${fm(S.p.lender * 12, 1)}% a year.`, `साधारण ब्याज = ऋण × दर × समय। बैंक: ${fm(S.p.bank, 1)}% प्रति वर्ष; साहूकार: ${fm(S.p.lender, 1)}% प्रति माह = ${fm(S.p.lender * 12, 1)}% प्रति वर्ष।`)));
      const rows = [[T2('Interest', 'ब्याज'), T2('Lower', 'कम'), T2('Often much higher', 'अक्सर बहुत ज़्यादा')], [T2('Collateral (land, gold as security)', 'समर्थक ऋणाधार (ज़मीन, सोना ज़मानत)'), T2('Usually asked for', 'आमतौर पर माँगा जाता है'), T2('Often not asked', 'अक्सर नहीं माँगा जाता')], [T2('Papers', 'काग़ज़ात'), T2('Needed', 'ज़रूरी'), T2('Few or none', 'कम या नहीं')], [T2('Who checks the rules', 'नियम कौन देखता है'), T2('The RBI supervises banks', 'RBI बैंकों की निगरानी करता है'), T2('No one', 'कोई नहीं')]];
      h += `<div class="ec-scroll"><table class="ec-terms"><tr><th>${esc(t(T2('Terms of credit', 'साख की शर्तें')))}</th><th style="color:${COL.d}">${esc(t(T2('Bank', 'बैंक')))}</th><th style="color:${COL.s}">${esc(t(T2('Moneylender', 'साहूकार')))}</th></tr>${rows.map((r) => `<tr><th>${esc(t(r[0]))}</th><td>${esc(t(r[1]))}</td><td>${esc(t(r[2]))}</td></tr>`).join('')}</table></div>`;
      return h;
    },
    quiz(S, r, C) {
      const t = C.t, v = ri(r, 0, 2), P = pick(r, [5000, 10000, 20000, 50000]), m = pick(r, [6, 12, 24]), rb = pick(r, [9, 10, 12, 15]), rl = pick(r, [2, 3, 4, 5]), f = (x) => rs(x, 0);
      if (v === 0) return mcq(r, t(T2(`A bank lends ${f(P)} at ${rb}% a year simple interest. How much interest is due after ${m} months?`, `एक बैंक ${f(P)} ${rb}% प्रति वर्ष साधारण ब्याज पर उधार देता है। ${m} महीने बाद कितना ब्याज बनेगा?`)), f((P * rb * m) / 1200), [f((P * rb * m) / 100), f((P * rb) / 100), f((P * rb * m) / 1200 + P)], t(T2(`Interest = ${f(P)} × ${rb}% × ${m}/12 years = ${f((P * rb * m) / 1200)}.`, `ब्याज = ${f(P)} × ${rb}% × ${m}/12 वर्ष = ${f((P * rb * m) / 1200)}।`)));
      if (v === 1) return mcq(r, t(T2(`A moneylender charges ${rl}% a month. What is that for a whole year (simple interest)?`, `एक साहूकार ${rl}% प्रति माह लेता है। पूरे साल के लिए (साधारण ब्याज) यह कितना है?`)), rl * 12 + '%', [rl + '%', rl * 10 + '%', rl * 6 + '%'], t(T2(`${rl}% × 12 months = ${rl * 12}% a year, much more than a bank usually charges.`, `${rl}% × 12 महीने = ${rl * 12}% प्रति वर्ष, जो बैंक के आमतौर पर लिए जाने वाले ब्याज से बहुत ज़्यादा है।`)));
      return mcq(r, t(T2('What is collateral?', 'समर्थक ऋणाधार (collateral) क्या है?')), t(T2('Something the borrower owns, kept as security until the loan is repaid', 'उधार लेने वाले की कोई चीज़, जो ऋण चुकने तक ज़मानत के रूप में रखी जाती है')), [t(T2('The interest paid every month', 'हर महीने दिया जाने वाला ब्याज')), t(T2('A bank\'s profit', 'बैंक का लाभ')), t(T2('The first instalment of the loan', 'ऋण की पहली क़िस्त'))], t(T2('Land, a house, gold or cattle can be collateral; the lender may sell it if the loan is not repaid.', 'ज़मीन, मकान, सोना या पशु ऋणाधार हो सकते हैं; ऋण न चुकाने पर ऋणदाता उसे बेच सकता है।')));
    },
  };

  // ---------------------------------------------------------------- config defaults, validation, keys
  Object.keys(MODES).forEach((id) => { const M = MODES[id]; if (!M.noTogParams) (M.tog || []).forEach((n) => { M.spec[n] = [0, 1, 'int', M.togDef && M.togDef[n] ? 1 : 0]; }); });
  function fill(M, given) {
    const p = {};
    Object.keys(M.spec).forEach((k) => { const d = M.spec[k][3]; if (given[k] != null) p[k] = given[k]; else if (typeof d !== 'function') p[k] = d; });
    Object.keys(M.spec).forEach((k) => { if (p[k] == null) p[k] = M.spec[k][3](p); });
    return p;
  }
  function validate(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
    const e = [];
    Object.keys(c).forEach((k) => { if (k !== 'mode' && k !== 'params') e.push('unknown key: ' + k + ' (use mode, params)'); });
    const M = MODES[c.mode];
    if (!M) { e.push(`unknown mode: ${c.mode} (use ${Object.keys(MODES).join(', ')})`); return e; }
    if (c.params != null) {
      if (typeof c.params !== 'object' || Array.isArray(c.params)) { e.push('params must be an object of numbers'); return e; }
      Object.keys(c.params).forEach((k) => {
        const s = M.spec[k], v = c.params[k];
        if (!s) { e.push(`unknown param for ${c.mode}: ${k} (use ${Object.keys(M.spec).join(', ')})`); return; }
        if (typeof v !== 'number' || !isFinite(v)) { e.push(`${k} must be a number`); return; }
        if (v < s[0] || v > s[1]) e.push(`${k} must be between ${s[0]} and ${s[1]}`);
        else if (s[2] === 'int' && v !== Math.round(v)) e.push(`${k} must be a whole number`);
      });
    }
    if (e.length) return e;
    return M.check ? M.check(fill(M, c.params || {})) : [];
  }
  function keys(c) {
    const M = c && MODES[c.mode];
    if (!M) return { targets: [], events: [] };
    const tg = (M.sl || []).map((n) => 'slider:' + n).concat((M.tog || []).map((n) => 'toggle:' + n));
    if (M.shifts) tg.push('shift:demand:left', 'shift:demand:right', 'shift:supply:left', 'shift:supply:right');
    if (M.play) tg.push('play');
    if (M.quiz || M.answer) tg.push('answer');
    return { targets: tg, events: M.events.slice() };
  }

  // ---------------------------------------------------------------- the view
  function mount(root, cfg, api) {
    const M = MODES[cfg.mode];
    const p = fill(M, cfg.params || {});
    const t = (x) => api.t(x);
    const cid = 'ec' + ++UID;
    const S = M.init(p);
    S.tg = S.tg || {};
    if (!M.noTogParams) (M.tog || []).forEach((n) => (S.tg[n] = !!p[n]));
    if (M.after) M.after(S);
    let narrow = false, wide = false, active = 0, locks = 0, stops = [], seed = (hashStr(cfg.mode) % 997) + 1, Q = null, ro = null;
    const sliders = M.sliders ? M.sliders(S) : [];
    const val = (x, d) => (typeof x === 'function' ? x() : x == null ? d : x);
    const tog = M.tog || [];
    const slHTML = sliders.length ? `<div class="ec-card ec-ctl"><div class="ec-sls">${sliders.map((s) => `<div class="ec-sl" data-sl="${s.name}"><label for="${cid}-${s.name}">${esc(t(s.label))}</label><output id="${cid}-${s.name}-o" for="${cid}-${s.name}"></output><input type="range" id="${cid}-${s.name}" data-key="slider:${s.name}" min="${val(s.min, 0)}" max="${val(s.max, 100)}" step="${s.step}" value="${s.get()}"></div>`).join('')}</div></div>` : '';
    const shHTML = M.shifts ? `<div class="ec-shifts">${['demand', 'supply'].map((w) => ['left', 'right'].map((d) => { const nm = t(w === 'demand' ? M.shiftLabel.d : M.shiftLabel.s); return `<button type="button" class="ec-btn ec-shift ${w[0]}" data-key="shift:${w}:${d}" aria-label="${esc(t(d === 'left' ? T2('Shift ' + (w === 'demand' ? M.shiftLabel.d.en : M.shiftLabel.s.en) + ' left', (w === 'demand' ? M.shiftLabel.d.hi : M.shiftLabel.s.hi) + ' बाईं ओर खिसकाओ') : T2('Shift ' + (w === 'demand' ? M.shiftLabel.d.en : M.shiftLabel.s.en) + ' right', (w === 'demand' ? M.shiftLabel.d.hi : M.shiftLabel.s.hi) + ' दाईं ओर खिसकाओ')))}">${d === 'left' ? '← ' : ''}${esc(nm)}${d === 'right' ? ' →' : ''}</button>`; }).join('')).join('')}</div>` : '';
    const btnHTML = tog.length || M.play ? `<div class="ec-btns">${tog.map((n) => `<button type="button" class="ec-btn ec-tog" data-key="toggle:${n}" aria-pressed="false">${esc(t(M.togLabel[n]))}</button>`).join('')}${M.play ? `<button type="button" class="ec-btn ec-play" data-key="play"></button>` : ''}</div>` : '';
    root.innerHTML = `<div class="ec ec-m-${esc(cfg.mode)}">
        <div class="ec-head"><span class="ec-badge" aria-hidden="true">${ICON_BADGE}</span><div class="ec-ht"><h3 class="ec-title">${esc(t(M.name))}</h3><p class="ec-sub">${esc(t(M.sub))}</p></div>${M.noNumbers ? '' : `<span class="ec-tag">${esc(t(T2('Illustrative numbers', 'उदाहरण के अंक')))}</span>`}</div>
        <div class="ec-main">
          <div class="ec-stage">${M.stage ? '<div class="ec-html"></div>' : `<svg class="ec-svg ec-chart" role="img" aria-label="${esc(t(M.name))}"></svg>`}<div class="ec-extra"></div></div>
          <div class="ec-side"><div class="ec-card ec-read"></div><p class="ec-live" aria-live="polite"></p>${shHTML}${slHTML}${btnHTML}</div>
        </div>
        ${M.quiz ? `<section class="ec-quiz" data-key="answer" aria-label="${esc(t(T2('Quick check', 'झटपट जाँच')))}"><div class="ec-qbody"></div><p class="ec-qfb" aria-live="polite"></p></section>` : ''}
      </div>`;
    const box = root.querySelector('.ec'), svg = root.querySelector('.ec-chart'), htmlEl = root.querySelector('.ec-html'), extraEl = root.querySelector('.ec-extra'), readEl = root.querySelector('.ec-read'), liveEl = root.querySelector('.ec-live'), playEl = root.querySelector('[data-key="play"]'), qBody = root.querySelector('.ec-qbody'), qfb = root.querySelector('.ec-qfb');
    const inputs = {};
    sliders.forEach((s) => { inputs[s.name] = { el: root.querySelector(`#${cid}-${s.name}`), out: root.querySelector(`#${cid}-${s.name}-o`), wrap: root.querySelector(`[data-sl="${s.name}"]`) }; });
    const C = {
      t, root,
      emit: (e) => api.emit(e), toast: (x) => api.toast(x), record: (s) => api.record(s), celebrate: () => { if (api.celebrate) api.celebrate(); },
      live: (s) => { liveEl.textContent = s; },
      render: () => render(),
      anim(ms, step, done, lock) {
        active++; if (lock) locks++;
        let fin = false;
        const end = () => { if (fin) return; fin = true; active = Math.max(0, active - 1); if (lock) locks = Math.max(0, locks - 1); syncPlay(); };
        const stop = L.tween(ms, step, () => { end(); if (done) done(); });
        stops.push(() => { stop(); end(); });
        syncPlay();
        return stop;
      },
    };
    function stopAll() { const s = stops; stops = []; s.forEach((f) => f()); active = 0; locks = 0; if ('ph' in S) S.ph = -1; if ('grow' in S) S.grow = 1; syncPlay(); }
    function syncPlay() {
      if (!playEl) return;
      const on = active > 0 && !locks;
      playEl.classList.toggle('on', on);
      playEl.innerHTML = (on ? ICON_STOP : ICON_PLAY) + '<span>' + esc(on ? t(T2('Stop', 'रोको')) : t(M.playLabel)) + '</span>';
    }
    const dims = () => { const d = M.dims ? M.dims(narrow) : narrow ? [340, 360] : [640, 420]; return { W: d[0], H: d[1], t, cid, narrow }; };
    function render() {
      const X = dims();
      if (svg) { svg.setAttribute('viewBox', `0 0 ${X.W} ${X.H}`); svg.innerHTML = M.svg(S, X); }
      if (htmlEl) htmlEl.innerHTML = M.stage(S, X);
      extraEl.innerHTML = M.extra ? M.extra(S, X) : '';
      readEl.innerHTML = M.read(S, X);
      sliders.forEach((s) => {
        const I = inputs[s.name], lo = val(s.min, 0), hi = val(s.max, 100), v = s.get();
        I.el.min = lo; I.el.max = hi; I.el.value = v;
        I.el.disabled = !!val(s.off, false);
        I.wrap.hidden = !!val(s.hide, false);
        I.out.textContent = s.fmt(v);
        I.el.setAttribute('aria-valuetext', s.fmt(v));
        I.el.style.setProperty('--pct', (hi > lo ? clamp(((v - lo) / (hi - lo)) * 100, 0, 100) : 0) + '%');
      });
      tog.forEach((n) => { const b = root.querySelector(`[data-key="toggle:${n}"]`); if (b) b.setAttribute('aria-pressed', String(!!S.tg[n])); });
      syncPlay();
    }
    function newQuiz() { Q = M.quiz(S, rng(seed++ * 7919 + 13), C); Q.pick = null; drawQuiz(); }
    function drawQuiz() {
      if (!qBody || !Q) return;
      const done = Q.pick != null;
      qBody.innerHTML = `<div class="ec-qh"><span class="ec-qi" aria-hidden="true">?</span>${esc(t(T2('Quick check', 'झटपट जाँच')))}</div><p class="ec-q">${esc(Q.q)}</p><div class="ec-opts">${Q.opts.map((o, i) => `<button type="button" class="ec-opt${done ? (i === Q.ans ? ' right' : i === Q.pick ? ' wrong' : '') : ''}" data-opt="${i}"${done ? ' disabled' : ''}>${esc(o)}</button>`).join('')}</div>${done ? `<button type="button" class="ec-btn ec-next" data-next="1">${esc(t(T2('Next question', 'अगला प्रश्न')))}</button>` : ''}`;
    }
    function quizClick(target) {
      const b = target.closest('button');
      if (!b || !Q) return;
      if (b.dataset.next) { qfb.textContent = ''; qfb.className = 'ec-qfb'; newQuiz(); const f = qBody.querySelector('.ec-opt'); if (f) f.focus(); return; }
      if (b.dataset.opt == null || Q.pick != null) return;
      Q.pick = +b.dataset.opt;
      const ok = Q.pick === Q.ans;
      drawQuiz();
      qfb.className = 'ec-qfb ' + (ok ? 'ok' : 'no');
      qfb.textContent = (ok ? t(T2('Right! ', 'सही! ')) : t(T2('Not quite. The answer is: ', 'पूरी तरह सही नहीं। सही उत्तर: ')) + Q.opts[Q.ans] + '. ') + Q.why;
      api.record(t(T2('Answered: ', 'उत्तर दिया: ')) + Q.opts[Q.pick] + (ok ? ' ✓' : ' ✗'));
      api.emit(ok ? 'answered:right' : 'answered:wrong');
      if (ok) C.celebrate();
      const nx = qBody.querySelector('.ec-next');
      if (nx) nx.focus();
    }
    function onInput(e) {
      const el = e.target;
      if (!el.matches || !el.matches('input[type="range"][data-key]')) return;
      const key = el.dataset.key, s = sliders.find((x) => 'slider:' + x.name === key);
      if (!s) return;
      if (!api.allowed(key) || locks) { if (!locks) api.nudge(key); el.value = s.get(); return; }
      if (active) stopAll();
      M.slide(S, s.name, +el.value, C);
      render();
    }
    function onChange(e) {
      const el = e.target;
      if (!el.matches || !el.matches('input[type="range"][data-key]')) return;
      const key = el.dataset.key, s = sliders.find((x) => 'slider:' + x.name === key);
      if (!s || !api.allowed(key) || locks) return;
      api.record(t(s.label) + ': ' + s.fmt(s.get()));
      if (M.release) M.release(S, s.name, C); else C.emit('computed');
    }
    function onClick(e) {
      const el = e.target.closest('[data-key]');
      if (!el || !root.contains(el) || el.tagName === 'INPUT') return;
      const key = el.dataset.key;
      if (key === 'answer' && !e.target.closest('button')) return;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key === 'play') {
        if (active && !locks) { stopAll(); render(); return; }
        if (locks) return;
        api.record(t(M.playLabel));
        M.play(S, C);
        syncPlay();
        return;
      }
      if (locks) return;
      if (active) stopAll();
      if (key.startsWith('toggle:')) {
        const n = key.slice(7);
        if (M.toggle) M.toggle(S, n, C); else S.tg[n] = !S.tg[n];
        render();
        api.record(t(M.togLabel[n]) + (S.tg[n] ? ' ✓' : ' ✗'));
        C.emit('computed');
        return;
      }
      if (key.startsWith('shift:')) { const [, w, d] = key.split(':'); M.shift(S, w, d, C); return; }
      if (key === 'answer') { if (M.answer) M.answer(S, e.target, C); else quizClick(e.target); }
    }
    // the shift animation must finish before anything else moves
    if (M.shift) { const sh = M.shift; M.shift = (S2, w, d, C2) => sh(S2, w, d, Object.assign({}, C2, { anim: (ms, st, dn) => C2.anim(ms, st, dn, true) })); }
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('click', onClick);
    const measure = () => {
      const w = root.clientWidth || 800, nn = w < 560, ww = w >= 900;
      if (nn !== narrow || ww !== wide) { narrow = nn; wide = ww; box.classList.toggle('wide', wide); box.classList.toggle('narrow', narrow); render(); }
    };
    narrow = (root.clientWidth || 800) < 560; wide = (root.clientWidth || 800) >= 900;
    box.classList.toggle('wide', wide); box.classList.toggle('narrow', narrow);
    render();
    if (M.quiz) newQuiz();
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(measure); ro.observe(root); }
    return {
      destroy() {
        stopAll();
        if (ro) ro.disconnect();
        root.removeEventListener('input', onInput);
        root.removeEventListener('change', onChange);
        root.removeEventListener('click', onClick);
      },
    };
  }

  NCA_T.register({
    id: 'economy',
    css: CSS,
    validate,
    keys,
    demo: { mode: 'demand-supply', params: { a: 100, b: 2, c: 10, d: 1, price: 40, step: 10 } },
    modes: Object.keys(MODES),
    // Pure models, for tests under Node.
    model: { costFns, bestQ, prodInfo, aggr, bud, fill: (mode, params) => fill(MODES[mode], params || {}) },
    mount,
  });
})();
