// Template: Geometry studio. Draw, measure and construct with a ruler, compass and protractor: shapes and solids,
// angles, triangles, quadrilaterals, circles, constructions, symmetry, congruence, similarity, transformations, the
// tangram and Pythagoras. All geometry is computed: lengths, angles, intersections, reflections and areas come from
// coordinates, so every number on the screen is the true measure of what is drawn (shown to 1 decimal). Properties
// and names (isosceles, rhombus, line of symmetry, congruent…) are decided by measuring the figure, never by a label.
// Theorems are demonstrated on the child's own figure (angle sum by tearing corners, Pythagoras by rearranging, angle
// at the centre by dragging). Constructions use only the ruler and compass (the protractor only where the method
// allows it, and to check at the end). Config:
//   { mode: 'identify'|'angle'|'triangle'|'quadrilateral'|'circle'|'construct'|'symmetry'|'congruence'|'similarity'
//           |'transform'|'tangram'|'pythagoras',
//     task?: a task id of that mode (TASKS below; the first is the default),
//     given?: { lengths?: [cm…], angles?: [degrees…], ratio?: [m, n] } (only where the task uses them; see GIVEN) }
(function () {
  const L = window.NCA_LIB;
  const esc = L.esc;
  const T = (en, hi) => ({ en, hi });
  const PI = Math.PI;
  const rad = (d) => (d * PI) / 180;
  const deg = (r) => (r * 180) / PI;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r1 = (v) => Math.round(v * 10) / 10;
  const f1 = (v) => { const x = r1(v); return (Object.is(x, -0) ? 0 : x).toFixed(1); };
  const f2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
  const fn = (v) => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : f1(v));
  const V = (x, y) => ({ x, y });
  const add = (a, b) => V(a.x + b.x, a.y + b.y);
  const sub = (a, b) => V(a.x - b.x, a.y - b.y);
  const mul = (a, k) => V(a.x * k, a.y * k);
  const len = (a) => Math.hypot(a.x, a.y);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const crs = (a, b) => a.x * b.y - a.y * b.x;
  const unit = (a) => { const l = len(a) || 1; return V(a.x / l, a.y / l); };
  const perp = (a) => V(-a.y, a.x);
  const mid = (a, b) => V((a.x + b.x) / 2, (a.y + b.y) / 2);
  const lerpP = (a, b, t) => V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  const polar = (c, r, a) => V(c.x + r * Math.cos(rad(a)), c.y + r * Math.sin(rad(a)));
  const dirA = (a, b) => deg(Math.atan2(b.y - a.y, b.x - a.x));
  const n360 = (a) => ((a % 360) + 360) % 360;
  const angAt = (p, q, r) => { const u = sub(p, q), v = sub(r, q); return deg(Math.acos(clamp(dot(u, v) / ((len(u) * len(v)) || 1), -1, 1))); };
  const rotP = (p, c, a) => { const s = Math.sin(rad(a)), k = Math.cos(rad(a)), d = sub(p, c); return V(c.x + d.x * k - d.y * s, c.y + d.x * s + d.y * k); };
  const reflP = (p, a, b) => { const d = unit(sub(b, a)), w = sub(p, a), f = add(a, mul(d, dot(w, d))); return sub(mul(f, 2), p); };
  const foot = (p, a, b) => { const d = unit(sub(b, a)); return add(a, mul(d, dot(sub(p, a), d))); };
  const centroid = (pts) => V(pts.reduce((s, p) => s + p.x, 0) / pts.length, pts.reduce((s, p) => s + p.y, 0) / pts.length);
  const area = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) s += crs(pts[i], pts[(i + 1) % pts.length]); return s / 2; };
  const snap = (v, g) => Math.round(v / g) * g;
  const snapP = (p, g) => V(r1(snap(p.x, g)), r1(snap(p.y, g)));
  // circle–circle intersections (0, 1 or 2 points)
  function ccx(c1, ra, c2, rb) {
    const d = dist(c1, c2);
    if (d < 1e-9 || d > ra + rb + 1e-9 || d < Math.abs(ra - rb) - 1e-9) return [];
    const a = (ra * ra - rb * rb + d * d) / (2 * d), h = Math.sqrt(Math.max(0, ra * ra - a * a));
    const u = unit(sub(c2, c1)), m = add(c1, mul(u, a));
    return h < 1e-9 ? [m] : [add(m, mul(perp(u), h)), sub(m, mul(perp(u), h))];
  }
  // line (through p, direction d) and circle: points sorted by the line parameter
  function lcx(p, d, c, r) {
    d = unit(d);
    const w = sub(p, c), b = dot(w, d), q = dot(w, w) - r * r, disc = b * b - q;
    if (disc < 0) return [];
    const s = Math.sqrt(disc);
    return [-b - s, -b + s].map((t) => add(p, mul(d, t)));
  }
  function llx(p1, d1, p2, d2) {
    const den = crs(d1, d2);
    if (Math.abs(den) < 1e-12) return null;
    const t = crs(sub(p2, p1), d2) / den;
    return add(p1, mul(d1, t));
  }
  function segX(a, b, c, d) { // proper intersection of segments ab and cd
    const o = (p, q, r) => Math.sign(crs(sub(q, p), sub(r, p)));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  }
  function inPoly(p, pts) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  }
  // three angles rounded to 1 decimal so that the shown values add up to the shown total (largest remainder)
  function roundSum(vals, total) {
    const t10 = Math.round(total * 10), raw = vals.map((v) => v * 10), fl = raw.map(Math.floor);
    let left = t10 - fl.reduce((a, b) => a + b, 0);
    const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
    for (let k = 0; k < order.length && left > 0; k++, left--) fl[order[k][1]]++;
    return fl.map((v) => (v / 10).toFixed(1));
  }
  const regular = (n, r, a0, c) => Array.from({ length: n }, (_, i) => polar(c || V(0, 0), r, (a0 == null ? 90 : a0) + (360 * i) / n));
  // a small seeded shuffle (the same order every time for the same seed)
  function shuffle(arr, seed) {
    const a = arr.slice();
    let s = 0;
    for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
    for (let i = a.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) >>> 0; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  const C = { ink: '#1E293B', ink2: '#475569', royal: '#1D4ED8', elec: '#2563EB', cyan: '#02CFF9', turq: '#14B8A6', emer: '#0F766E', leaf: '#22C55E', grape: '#8B3DFF', violet: '#4400F0', tang: '#FF7A1A', coral: '#FF6B57', sun: '#FFD23F', gold: '#F5B90A', pink: '#DB2777', mid: '#061233', paper: '#FFFDF7', grid: '#E2E8F4', grid2: '#C8D3EA', good: '#0F9D58', bad: '#DC2626' };
  const PAL = [C.pink, C.royal, C.tang, C.turq, C.grape, C.gold, C.leaf, C.coral];

  // ---------------------------------------------------------------- words
  const W = {
    cm: T('cm', 'सेमी'), next: T('Next', 'अगला'), again: T('Start again', 'फिर से शुरू करो'), prove: T('Show why', 'कारण दिखाओ'),
    ruler: T('Ruler', 'रूलर'), compass: T('Compass', 'परकार'), protractor: T('Protractor', 'चाँदा'),
    right: T('Yes, that is right!', 'हाँ, बिल्कुल सही!'), wrong: T('Not quite. Look again and try once more.', 'पूरी तरह सही नहीं। फिर से देखो और एक बार और कोशिश करो।'),
    yes: T('yes', 'हाँ'), no: T('no', 'नहीं'), drag: T('Drag point', 'बिंदु खिसकाओ'),
  };
  const MODE_NAME = {
    identify: T('Shapes', 'आकृतियाँ'), angle: T('Angles', 'कोण'), triangle: T('Triangles', 'त्रिभुज'), quadrilateral: T('Quadrilaterals', 'चतुर्भुज'),
    circle: T('Circles', 'वृत्त'), construct: T('Constructions', 'रचनाएँ'), symmetry: T('Symmetry', 'सममिति'), congruence: T('Congruence', 'सर्वांगसमता'),
    similarity: T('Similarity', 'समरूपता'), transform: T('Moving shapes', 'आकृतियों का रूपांतरण'), tangram: T('Tangram', 'टैनग्राम'), pythagoras: T('Pythagoras', 'पाइथागोरस'),
  };

  // ---------------------------------------------------------------- CSS
  const CSS = `
.sh { display: flex; flex-direction: column; gap: 12px; color: var(--ink); font-family: var(--font-body); }
.sh-head { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; }
.sh-badge { background: linear-gradient(135deg, #DB2777, #8B3DFF); color: #fff; font: 800 .95rem/1 var(--font-display); padding: 8px 14px; border-radius: 999px; box-shadow: 0 2px 8px rgba(139,61,255,.3); }
.sh-title { font: 800 1.15rem/1.2 var(--font-display); color: var(--ink); }
.sh-how { margin: 0; font-weight: 600; color: var(--ink-2); line-height: 1.4; }
.sh-stage { position: relative; border-radius: 18px; overflow: hidden; background: #FFFDF7; box-shadow: 0 1px 0 rgba(6,18,51,.06), 0 8px 24px rgba(6,18,51,.12); border: 1px solid rgba(6,18,51,.08); }
.sh-svg { display: block; width: 100%; height: auto; touch-action: pan-y pinch-zoom; user-select: none; -webkit-user-select: none; font-family: var(--font-body); }
.sh-svg text { font-family: var(--font-body); fill: #1E293B; paint-order: stroke; stroke: #FFFDF7; stroke-width: 5px; stroke-linejoin: round; }
.sh-svg text.sh-nm { font: 800 22px var(--font-display); }
.sh-svg text.sh-sm { font-size: 17px; font-weight: 700; }
.sh-svg text.sh-md { font-size: 20px; font-weight: 700; }
.sh-svg text.sh-bg { font: 800 30px var(--font-display); }
.sh-svg text.sh-ns { stroke: none; }
.sh-svg.nw text.sh-nm { font-size: 28px; }
.sh-svg.nw text.sh-md { font-size: 24px; }
.sh-svg.nw text.sh-sm { font-size: 20px; }
.sh-build { display: flex; gap: 12px; align-items: flex-start; width: 100%; flex-wrap: wrap; }
.sh-build .sh-steps { flex: 1 1 220px; }
.sh-rough { flex: none; width: 150px; background: #FFFDF7; border: 1.5px dashed var(--line); border-radius: 12px; padding: 4px 6px 6px; text-align: center; color: #475569; font: 700 .78rem var(--font-body); }
.sh-rough svg { display: block; width: 100%; height: auto; }
.sh-h { cursor: grab; touch-action: none; outline: none; }
.sh-h:active { cursor: grabbing; }
.sh-h .sh-ring { transition: r .15s; }
.sh-h:hover .sh-ring, .sh-h:focus-visible .sh-ring { r: 17; }
.sh-h:focus-visible .sh-foc { stroke: #8B3DFF; stroke-width: 3; stroke-dasharray: 5 4; }
.sh-tap { cursor: pointer; outline: none; }
.sh-tap:focus-visible .sh-foc { stroke: #8B3DFF; stroke-width: 3; stroke-dasharray: 5 4; }
.sh-pulse { animation: sh-pulse 1.1s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes sh-pulse { 0%, 100% { opacity: .9; transform: scale(1); } 50% { opacity: .35; transform: scale(1.35); } }
.sh-read { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-height: 50px; }
.sh-read p { margin: 0; width: 100%; line-height: 1.45; }
.sh-chip { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 5px 12px; font-weight: 700; font-size: .95rem; background: var(--sunk); border: 1px solid var(--line); color: var(--ink); white-space: nowrap; }
.sh-chip i { width: 12px; height: 12px; border-radius: 50%; display: inline-block; flex: none; }
.sh-chip.ok { background: var(--good-t); border-color: var(--good); }
.sh-chip.no { background: var(--bad-t); border-color: var(--bad); }
.sh-chip.big { font: 800 1.05rem var(--font-display); background: linear-gradient(135deg, #FDE7F3, #EDE4FF); color: #3B0764; border-color: #E9B8DA; }
.sh-eq { font: 800 1.1rem var(--font-display); color: var(--ink); width: 100%; }
.sh-ctl { display: flex; flex-wrap: wrap; gap: 10px; align-items: stretch; }
.sh-ctl:empty, .sh-ans:empty { display: none; }
.sh-btn { min-height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 14px; padding: 0 16px; font: 700 1rem var(--font-body); border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); cursor: pointer; transition: transform .12s, box-shadow .12s, background .15s; }
.sh-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 3px 10px rgba(6,18,51,.12); }
.sh-btn:active:not(:disabled) { transform: translateY(1px); }
.sh-btn:disabled { opacity: .45; cursor: default; }
.sh-btn svg { width: 26px; height: 26px; flex: none; }
.sh-btn.main { background: linear-gradient(180deg, #E0479A, #DB2777); color: #fff; border: 0; box-shadow: 0 2px 0 #9D174D; }
.sh-btn[aria-pressed="true"] { background: linear-gradient(180deg, #A266FF, #8B3DFF); color: #fff; border-color: #6D28D9; box-shadow: 0 0 0 3px rgba(139,61,255,.25); }
.sh-sl { display: flex; flex-direction: column; gap: 2px; flex: 1 1 180px; min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 6px 12px 2px; }
.sh-sl-top { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; font-size: .92rem; color: var(--ink-2); }
.sh-sl output { font: 800 1rem var(--font-display); color: var(--ink); }
.sh-sl input { width: 100%; height: 36px; accent-color: #DB2777; cursor: pointer; margin: 0; }
.sh-ans { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.sh-q { margin: 0; font: 700 1.05rem/1.35 var(--font-display); }
.sh-opts { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
.sh-opt { min-height: 48px; border-radius: 12px; border: 1.5px solid var(--line); background: var(--sunk); color: var(--ink); font: 700 1rem var(--font-body); padding: 6px 10px; cursor: pointer; transition: transform .12s, background .15s; }
.sh-opt:hover:not(:disabled) { transform: translateY(-1px); border-color: #DB2777; }
.sh-opt.right { background: var(--good-t); border-color: var(--good); }
.sh-opt.wrong { background: var(--bad-t); border-color: var(--bad); }
.sh-opt:disabled { cursor: default; }
.sh-fb { margin: 0; font-weight: 600; min-height: 1.2em; }
.sh-fb.good { color: var(--good); }
.sh-fb.bad { color: var(--bad); }
.sh-steps { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; width: 100%; counter-reset: shs; }
.sh-steps li { counter-increment: shs; display: flex; gap: 10px; align-items: flex-start; line-height: 1.35; color: var(--ink-2); font-weight: 600; }
.sh-steps li::before { content: counter(shs); flex: none; width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font: 800 .85rem var(--font-display); background: var(--sunk); border: 1.5px solid var(--line); color: var(--ink-2); }
.sh-steps li.now { color: var(--ink); }
.sh-steps li.now::before { background: #DB2777; border-color: #DB2777; color: #fff; }
.sh-steps li.done { opacity: .7; }
.sh-steps li.done::before { content: "✓"; background: var(--good); border-color: var(--good); color: #fff; }
.sh-steps li.later { display: none; }
.sh-cells rect { cursor: pointer; }
@media (prefers-reduced-motion: reduce) { .sh-pulse { animation: none; } .sh-btn, .sh-opt, .sh-h .sh-ring { transition: none; } }
`;

  // ---------------------------------------------------------------- tool icons
  const ICON = {
    ruler: '<svg viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="9" width="24" height="10" rx="2" fill="#FFD23F" stroke="#B45309" stroke-width="1.4"/><path d="M6 9v4M10 9v3M14 9v4M18 9v3M22 9v4" stroke="#7C2D12" stroke-width="1.4"/></svg>',
    compass: '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="5" r="2.6" fill="#64748B"/><path d="M14 6L7 25M14 6l7 19" stroke="#334155" stroke-width="2.4" stroke-linecap="round"/><path d="M19.6 21l2.4 4" stroke="#DB2777" stroke-width="3" stroke-linecap="round"/></svg>',
    protractor: '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M2 21a12 12 0 0 1 24 0z" fill="#BAE6FD" stroke="#0369A1" stroke-width="1.4"/><path d="M14 21L21 12" stroke="#DB2777" stroke-width="2"/><circle cx="14" cy="21" r="1.6" fill="#0369A1"/></svg>',
  };

  // ---------------------------------------------------------------- the drawing kit (world units in cm, y upwards)
  function kit(ctx) {
    const X = (x) => ctx.ox + x * ctx.s, Y = (y) => ctx.oy - y * ctx.s;
    const n = (v) => Math.round(v * 10) / 10;
    const P = (p) => `${n(X(p.x))},${n(Y(p.y))}`;
    const G = { X, Y, P };
    G.w = (px) => px / ctx.s; // pixels to world
    G.line = (a, b, col, w, ex) => `<line x1="${n(X(a.x))}" y1="${n(Y(a.y))}" x2="${n(X(b.x))}" y2="${n(Y(b.y))}" stroke="${col || C.ink}" stroke-width="${w || 3}" stroke-linecap="round" ${ex || ''}/>`;
    G.ext = (a, b, k1, k2, col, w, ex) => { const d = sub(b, a); return G.line(sub(a, mul(d, k1)), add(b, mul(d, k2)), col, w, ex); };
    G.poly = (pts, fill, stroke, w, ex) => `<polygon points="${pts.map(P).join(' ')}" fill="${fill || 'none'}" stroke="${stroke || C.ink}" stroke-width="${w == null ? 3 : w}" stroke-linejoin="round" ${ex || ''}/>`;
    G.pl = (pts, stroke, w, ex) => `<polyline points="${pts.map(P).join(' ')}" fill="none" stroke="${stroke || C.ink}" stroke-width="${w || 3}" stroke-linecap="round" stroke-linejoin="round" ${ex || ''}/>`;
    G.arcPts = (c, r, a0, a1, k) => { k = k || Math.max(8, Math.ceil(Math.abs(a1 - a0) / 4)); return Array.from({ length: k + 1 }, (_, i) => polar(c, r, a0 + ((a1 - a0) * i) / k)); };
    G.circle = (c, r, fill, stroke, w, ex) => `<circle cx="${n(X(c.x))}" cy="${n(Y(c.y))}" r="${n(r * ctx.s)}" fill="${fill || 'none'}" stroke="${stroke || C.ink}" stroke-width="${w == null ? 3 : w}" ${ex || ''}/>`;
    G.text = (p, s, cls, dx, dy, ex) => `<text x="${n(X(p.x) + (dx || 0))}" y="${n(Y(p.y) + (dy || 0))}" text-anchor="middle" dominant-baseline="central" class="${cls || 'sh-md'}" ${ex || ''}>${s}</text>`;
    // a label pushed away from a reference point (e.g. a vertex name pushed out of its polygon)
    G.lab = (p, s, away, px, cls, ex) => { const d = away ? unit(sub(p, away)) : V(0, 1); return `<text x="${n(X(p.x) + d.x * (px || 22))}" y="${n(Y(p.y) - d.y * (px || 22))}" text-anchor="middle" dominant-baseline="central" class="${cls || 'sh-nm'}" ${ex || ''}>${s}</text>`; };
    G.wedge = (q, a0, sweep, rpx, fill, op) => G.poly([q].concat(G.arcPts(q, rpx / ctx.s, a0, a0 + sweep)), fill, 'none', 0, `fill-opacity="${op == null ? 0.35 : op}"`) + G.pl(G.arcPts(q, rpx / ctx.s, a0, a0 + sweep), fill, 2.5);
    // the smaller angle at q between rays q→p and q→r, with an optional label
    G.amark = (p, q, r, o) => {
      o = o || {};
      let a0 = dirA(q, p), d = n360(dirA(q, r) - a0);
      if (d > 180) { a0 = dirA(q, r); d = 360 - d; }
      return G.amarkD(q, a0, d, o);
    };
    G.amarkD = (q, a0, d, o) => {
      o = o || {};
      const rp = o.rpx || 34, col = o.col || C.tang;
      let s = '';
      if (!o.noRight && Math.abs(d - 90) < 0.05) {
        const k = (rp * 0.6) / ctx.s, u = polar(V(0, 0), k, a0), v = polar(V(0, 0), k, a0 + 90);
        s += G.poly([q, add(q, u), add(add(q, u), v), add(q, v)], col, col, 2.5, 'fill-opacity=".3"');
      } else s += G.wedge(q, a0, d, rp, col, o.op);
      if (o.label) s += G.text(polar(q, (rp + (o.lpx || 24)) / ctx.s, a0 + d / 2), o.label, o.cls || 'sh-sm');
      return s;
    };
    G.ticks = (a, b, k, col) => {
      const m = mid(a, b), u = unit(sub(b, a)), v = perp(u), h = 8 / ctx.s, g = 6 / ctx.s;
      let s = '';
      for (let i = 0; i < k; i++) { const c = add(m, mul(u, (i - (k - 1) / 2) * g)); s += G.line(sub(c, mul(v, h)), add(c, mul(v, h)), col || C.ink, 2.5); }
      return s;
    };
    G.slen = (a, b, s, away, px, cls) => {
      const m = mid(a, b);
      let v = perp(unit(sub(b, a)));
      if (away && dot(v, sub(m, away)) < 0) v = mul(v, -1);
      return `<text x="${n(X(m.x) + v.x * (px || 20))}" y="${n(Y(m.y) - v.y * (px || 20))}" text-anchor="middle" dominant-baseline="central" class="${cls || 'sh-sm'}">${s}</text>`;
    };
    G.chev = (a, b, col, k) => { const m = mid(a, b), u = unit(sub(b, a)), v = perp(u), h = 7 / ctx.s; let s = ''; for (let i = 0; i < (k || 1); i++) { const c = add(m, mul(u, (i - ((k || 1) - 1) / 2) * 9 / ctx.s)); s += G.pl([add(sub(c, mul(u, h)), mul(v, h)), c, sub(sub(c, mul(u, h)), mul(v, h))], col || C.ink, 3); } return s; };
    G.dot = (p, col, rpx) => `<circle cx="${n(X(p.x))}" cy="${n(Y(p.y))}" r="${rpx || 6}" fill="${col || C.ink}" stroke="#fff" stroke-width="2"/>`;
    G.pt = (p, name, col, away, px) => G.dot(p, col) + (name ? G.lab(p, name, away, px) : '');
    G.handle = (key, p, col, aria, name, away) => `<g class="sh-h" data-key="${key}" role="button" tabindex="0" aria-label="${aria}"><circle class="sh-foc" cx="${n(X(p.x))}" cy="${n(Y(p.y))}" r="25" fill="rgba(255,255,255,0.01)" stroke="none"/><circle class="sh-ring" cx="${n(X(p.x))}" cy="${n(Y(p.y))}" r="14" fill="${col}" fill-opacity=".22"/><circle cx="${n(X(p.x))}" cy="${n(Y(p.y))}" r="8.5" fill="${col}" stroke="#fff" stroke-width="2.5"/></g>${name ? G.lab(p, name, away, 26) : ''}`;
    G.tap = (key, inner, aria, ex) => `<g class="sh-tap" data-key="${key}" role="button" tabindex="0" aria-label="${aria}" ${ex || ''}>${inner}</g>`;
    G.grid = (step, major, col1, col2) => {
      step = step || 1; major = major || 0;
      const x0 = Math.floor((0 - ctx.ox) / ctx.s / step) * step, x1 = (ctx.W - ctx.ox) / ctx.s, y0 = Math.floor((ctx.oy - ctx.H) / ctx.s / step) * step, y1 = ctx.oy / ctx.s;
      let s = '';
      for (let x = x0, i = 0; x <= x1 && i < 400; x += step, i++) { const mj = major && Math.abs(Math.round(x / step) % major) === 0; s += `<line x1="${n(X(x))}" y1="0" x2="${n(X(x))}" y2="${ctx.H}" stroke="${mj ? col2 || C.grid2 : col1 || C.grid}" stroke-width="${mj ? 1.4 : 1}"/>`; }
      for (let y = y0, i = 0; y <= y1 && i < 400; y += step, i++) { const mj = major && Math.abs(Math.round(y / step) % major) === 0; s += `<line x1="0" y1="${n(Y(y))}" x2="${ctx.W}" y2="${n(Y(y))}" stroke="${mj ? col2 || C.grid2 : col1 || C.grid}" stroke-width="${mj ? 1.4 : 1}"/>`; }
      return s;
    };
    // a protractor with its centre on q and its base line along direction `base`; `read` marks a reading
    G.protractor = (q, base, R, read, flip) => {
      const sg = flip ? -1 : 1, at = (r, a) => polar(q, r, base + sg * a);
      let s = G.poly([at(R * 1.04, 0)].concat(G.arcPts(q, R, base, base + sg * 180, 60), [at(R * 1.04, 180)]), 'rgba(186,230,253,0.62)', '#0369A1', 2);
      s += G.line(at(R * 1.04, 0), at(R * 1.04, 180), '#0369A1', 2);
      for (let a = 0; a <= 180; a++) { const k = a % 10 === 0 ? 0.11 : a % 5 === 0 ? 0.075 : 0.04; s += G.line(at(R, a), at(R * (1 - k), a), '#0C4A6E', a % 10 === 0 ? 1.6 : 1); }
      const fs = Math.max(11, Math.min(15, R * ctx.s * 0.075));
      for (let a = 0; a <= 180; a += 10) {
        const pi = at(R * 0.8, a), po = at(R * 0.68, a);
        s += `<text x="${n(X(pi.x))}" y="${n(Y(pi.y))}" text-anchor="middle" dominant-baseline="central" class="sh-ns" style="font:800 ${fs}px var(--font-body);fill:#1D4ED8;stroke:none">${a}</text>`;
        s += `<text x="${n(X(po.x))}" y="${n(Y(po.y))}" text-anchor="middle" dominant-baseline="central" class="sh-ns" style="font:600 ${fs * 0.85}px var(--font-body);fill:#64748B;stroke:none">${180 - a}</text>`;
      }
      s += G.circle(q, 4 / ctx.s, '#0369A1', 'none', 0);
      if (read != null) {
        s += G.line(q, at(R * 1.12, read), C.pink, 2.5, 'stroke-dasharray="6 4"');
        const b = at(R * 1.2, read);
        s += `<g><rect x="${n(X(b.x) - 30)}" y="${n(Y(b.y) - 16)}" width="60" height="32" rx="10" fill="${C.pink}"/><text x="${n(X(b.x))}" y="${n(Y(b.y))}" text-anchor="middle" dominant-baseline="central" class="sh-ns" style="font:800 17px var(--font-display);fill:#fff;stroke:none">${fn(read)}°</text></g>`;
      }
      return s;
    };
    // a ruler laid along a→b (world), drawn on the side away from `away`, with cm marks from a
    G.ruler = (a, b, away, maxLen) => {
      const u = unit(sub(b, a)), L2 = Math.max(dist(a, b), maxLen || 0) + 0.6;
      let v = perp(u);
      if (away && dot(v, sub(a, away)) < 0) v = mul(v, -1);
      const w = 30 / ctx.s, o = 2 / ctx.s, s0 = sub(a, mul(u, 0.4));
      const pts = [add(s0, mul(v, o)), add(add(s0, mul(u, L2)), mul(v, o)), add(add(s0, mul(u, L2)), mul(v, o + w)), add(s0, mul(v, o + w))];
      let s = G.poly(pts, 'rgba(255,214,79,0.88)', '#B45309', 1.5);
      const step = ctx.s < 18 ? 1 : 0.5;
      for (let k = 0; k <= L2 - 0.4 + 1e-9; k += step) {
        const big = Math.abs(k - Math.round(k)) < 1e-9, c = add(a, mul(u, k));
        s += G.line(add(c, mul(v, o)), add(c, mul(v, o + (big ? 0.42 : 0.26) * w)), '#7C2D12', big ? 1.6 : 1);
        if (big && (ctx.s >= 22 || Math.round(k) % 2 === 0)) { const t = add(c, mul(v, o + 0.72 * w)); s += `<text x="${n(X(t.x))}" y="${n(Y(t.y))}" text-anchor="middle" dominant-baseline="central" class="sh-ns" style="font:700 11px var(--font-body);fill:#7C2D12;stroke:none">${Math.round(k)}</text>`; }
      }
      return s;
    };
    // a compass with its needle at c and its pencil at p
    G.compassG = (c, p) => {
      const a = V(X(c.x), Y(c.y)), b = V(X(p.x), Y(p.y)), m = mid(a, b), d = dist(a, b) || 1;
      const up = V(0, -1), h = add(m, mul(up, Math.max(60, d * 0.6)));
      return `<g pointer-events="none"><line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(h.x)}" y2="${n(h.y)}" stroke="#475569" stroke-width="6" stroke-linecap="round"/><line x1="${n(b.x)}" y1="${n(b.y)}" x2="${n(h.x)}" y2="${n(h.y)}" stroke="#64748B" stroke-width="6" stroke-linecap="round"/><circle cx="${n(b.x)}" cy="${n(b.y)}" r="4" fill="${C.pink}"/><circle cx="${n(h.x)}" cy="${n(h.y)}" r="8" fill="#334155"/><rect x="${n(h.x - 4)}" y="${n(h.y - 24)}" width="8" height="18" rx="3" fill="#334155"/></g>`;
    };
    return G;
  }

  // ---------------------------------------------------------------- the studio (shared shell for every mode)
  function studio(root, cfg, api) {
    const mode = cfg.mode, task = cfg.task || TASKS[mode][0], given = cfg.given || {};
    const ctx = { api, mode, task, given, W: 820, H: 500, narrow: false, s: 40, ox: 0, oy: 0, busy: false, stops: [] };
    const tt = (x) => esc(api.t(x));
    ctx.tt = tt;
    ctx.G = kit(ctx);
    ctx.fit = (b, pad) => {
      pad = pad == null ? 34 : pad;
      const [x0, y0, x1, y1] = b;
      if (ctx.inLayout) ctx.H = Math.round(clamp(((ctx.W - 2 * pad) * (y1 - y0)) / (x1 - x0) + 2 * pad, ctx.narrow ? 330 : 360, ctx.narrow ? 640 : 520));
      ctx.s = Math.min((ctx.W - 2 * pad) / (x1 - x0), (ctx.H - 2 * pad) / (y1 - y0));
      ctx.ox = ctx.W / 2 - (ctx.s * (x0 + x1)) / 2;
      ctx.oy = ctx.H / 2 + (ctx.s * (y0 + y1)) / 2;
    };
    ctx.emit = (e) => api.emit(e);
    ctx.toast = (x) => api.toast(x);
    ctx.say = (x) => api.speak(api.t(x));
    ctx.record = (x) => api.record(typeof x === 'string' ? x : api.t(x));
    ctx.anim = (ms, step, done) => {
      ctx.busy = true;
      const stop = L.tween(ms, (k) => { step(k); paint(); }, () => { ctx.busy = false; if (done) done(); paint(); });
      ctx.stops.push(stop);
    };
    ctx.chip = (txt, cls, col) => `<span class="sh-chip ${cls || ''}">${col ? `<i style="background:${col}"></i>` : ''}${txt}</span>`;
    ctx.btn = (key, label, o) => { o = o || {}; return `<button type="button" class="sh-btn ${o.cls || ''}" data-key="${key}" ${o.pressed != null ? `aria-pressed="${o.pressed}"` : ''} ${o.disabled ? 'disabled' : ''}>${o.icon || ''}<span>${tt(label)}</span></button>`; };
    ctx.toolBtn = (name, pressed) => ctx.btn('tool:' + name, W[name], { icon: ICON[name], pressed: !!pressed });
    ctx.slider = (name, label, min, max, step, val, unitTxt) => `<label class="sh-sl"><span class="sh-sl-top"><span>${tt(label)}</span><output data-out="${name}">${fn(val)}${unitTxt ? ' ' + tt(unitTxt) : ''}</output></span><input type="range" data-key="slider:${name}" data-unit="${unitTxt ? tt(unitTxt) : ''}" min="${min}" max="${max}" step="${step}" value="${val}" aria-label="${tt(label)}"></label>`;
    ctx.setSlider = (name, val) => { const i = root.querySelector(`[data-key="slider:${name}"]`); if (i) { i.value = val; const o = root.querySelector(`[data-out="${name}"]`); if (o) o.textContent = fn(val) + (i.dataset.unit ? ' ' + i.dataset.unit : ''); } };

    // ---- the question box
    let Q = null;
    ctx.ask = (q) => {
      Q = q ? Object.assign({ tried: new Set(), done: false }, q) : null;
      if (Q) {
        const order = shuffle(Q.opts.map((_, i) => i), api.t(Q.q) + (Q.seed || ''));
        Q.order = Q.keep ? Q.opts.map((_, i) => i) : order;
      }
      paintQ();
    };
    ctx.qdone = () => !!(Q && Q.done);
    function paintQ() {
      const box = root.querySelector('.sh-ans');
      if (!Q) { box.innerHTML = ''; return; }
      box.innerHTML = `<p class="sh-q">${tt(Q.q)}</p><div class="sh-opts">${Q.order.map((i) => `<button type="button" class="sh-opt ${Q.done && i === Q.ans ? 'right' : Q.tried.has(i) ? 'wrong' : ''}" data-key="answer" data-opt="${i}" ${Q.done || Q.tried.has(i) ? 'disabled' : ''}>${tt(Q.opts[i])}</button>`).join('')}</div><p class="sh-fb ${Q.done ? 'good' : Q.tried.size ? 'bad' : ''}" aria-live="polite">${Q.done ? tt(W.right) + ' ' + (Q.why ? tt(Q.why) : '') : Q.tried.size ? (Q.hint ? tt(Q.hint) : tt(W.wrong)) : ''}</p>`;
    }
    function answer(i) {
      if (!Q || Q.done || Q.tried.has(i)) return;
      if (i === Q.ans) {
        Q.done = true;
        api.emit('answered:right');
        api.record(api.t(T('Answered right: ', 'सही उत्तर: ')) + api.t(Q.opts[i]));
        api.celebrate();
        paintQ();
        if (Q.onRight) Q.onRight();
      } else {
        Q.tried.add(i);
        api.emit('answered:wrong');
        api.record(api.t(T('Answered: ', 'उत्तर दिया: ')) + api.t(Q.opts[i]));
        paintQ();
        if (Q.onWrong) Q.onWrong(i);
      }
    }

    const M = MAKERS[mode](ctx, task, given);
    root.innerHTML = `<div class="sh">
      <div class="sh-head"><span class="sh-badge">${tt(MODE_NAME[mode])}</span><span class="sh-title">${tt(M.title)}</span></div>
      <p class="sh-how">${tt(M.how)}</p>
      <div class="sh-stage"><svg class="sh-svg" role="group" aria-label="${tt(M.title)}" viewBox="0 0 820 500"></svg></div>
      <div class="sh-read" aria-live="polite"></div>
      <div class="sh-ctl"></div>
      <div class="sh-ans"></div>
    </div>`;
    const svg = root.querySelector('svg'), readEl = root.querySelector('.sh-read'), ctlEl = root.querySelector('.sh-ctl'), howEl = root.querySelector('.sh-how');
    let lastRead = '';
    function paint() {
      const ae = document.activeElement;
      const fk = ae && svg.contains(ae) ? ae.getAttribute('data-key') : null;
      svg.innerHTML = `<rect x="0" y="0" width="${ctx.W}" height="${ctx.H}" fill="${C.paper}"/>` + M.svg();
      const r = M.read ? M.read() : '';
      if (r !== lastRead) { readEl.innerHTML = r; lastRead = r; }
      if (fk) { const el = svg.querySelector(`[data-key="${fk}"]`); if (el) el.focus({ preventScroll: true }); }
    }
    ctx.paint = paint;
    ctx.ctl = () => { ctlEl.innerHTML = M.ctl ? M.ctl() : ''; };
    ctx.how = (x) => { howEl.textContent = api.t(x); };
    function layout() {
      ctx.narrow = (root.clientWidth || 820) < 600;
      ctx.W = ctx.narrow ? 520 : 820; ctx.H = ctx.narrow ? 560 : 500;
      ctx.inLayout = true;
      if (M.layout) M.layout();
      ctx.inLayout = false;
      svg.setAttribute('viewBox', `0 0 ${ctx.W} ${ctx.H}`);
      svg.classList.toggle('nw', ctx.narrow);
    }

    // ---- input
    const toWorld = (e) => {
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const m = svg.getScreenCTM();
      const q = m ? pt.matrixTransform(m.inverse()) : pt;
      return V((q.x - ctx.ox) / ctx.s, (ctx.oy - q.y) / ctx.s);
    };
    let drag = null;
    function onDown(e) {
      const h = e.target.closest && e.target.closest('[data-key]');
      if (!h || ctx.busy || !M.drag) return;
      const key = h.dataset.key;
      if (!/^(drag|piece):/.test(key)) return;
      if (!api.allowed(key)) { api.nudge(key); return; }
      e.preventDefault();
      drag = { key, name: key.slice(key.indexOf(':') + 1), id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
      try { svg.setPointerCapture(e.pointerId); } catch (_) { /* old browsers */ }
      if (M.dragStart) M.dragStart(drag.name, toWorld(e), key);
    }
    function onMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
      drag.moved = true;
      M.drag(drag.name, toWorld(e), drag.key);
      paint();
    }
    function onUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      if (M.dragEnd) M.dragEnd(d.name, d.moved, d.key);
      paint();
    }
    function onClick(e) {
      const el = e.target.closest('[data-key]');
      if (!el || !root.contains(el) || el.disabled) return;
      const key = el.dataset.key;
      if (/^(slider|drag|piece):/.test(key)) return;
      if (ctx.busy) return;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key === 'answer') { answer(+el.dataset.opt); paint(); return; }
      if (M.click) M.click(key, el);
      paint();
    }
    function onKey(e) {
      const el = e.target.closest && e.target.closest('g[data-key]');
      if (!el) return;
      const key = el.dataset.key;
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
      if (arrows[e.key] && /^(drag|piece):/.test(key) && M.pos) {
        e.preventDefault();
        if (ctx.busy) return;
        if (!api.allowed(key)) { api.nudge(key); return; }
        const name = key.slice(key.indexOf(':') + 1), st = (e.shiftKey ? 1 : 0.1) * (M.kstep || 1);
        const p = M.pos(name);
        if (!p) return;
        if (M.dragStart) M.dragStart(name, p, key);
        M.drag(name, add(p, V(arrows[e.key][0] * st, arrows[e.key][1] * st)), key);
        if (M.dragEnd) M.dragEnd(name, true, key);
        paint();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (ctx.busy) return;
        if (!api.allowed(key)) { api.nudge(key); return; }
        if (/^(drag|piece):/.test(key)) { if (M.activate) { M.activate(key.slice(key.indexOf(':') + 1), key); paint(); } }
        else el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    }
    let prevVal = {};
    function onInput(e) {
      const el = e.target;
      if (!el.matches || !el.matches('input[type=range]')) return;
      const key = el.dataset.key, name = key.slice(7);
      if (!api.allowed(key)) { api.nudge(key); if (prevVal[name] != null) el.value = prevVal[name]; return; }
      if (ctx.busy) { if (prevVal[name] != null) el.value = prevVal[name]; return; }
      prevVal[name] = el.value;
      ctx.setSlider(name, +el.value);
      if (M.slider) M.slider(name, +el.value);
      paint();
    }
    function onChange(e) {
      const el = e.target;
      if (!el.matches || !el.matches('input[type=range]')) return;
      const name = el.dataset.key.slice(7);
      if (M.sliderEnd && api.allowed(el.dataset.key)) M.sliderEnd(name, +el.value);
      paint();
    }
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.querySelectorAll('input[type=range]').forEach((i) => { prevVal[i.dataset.key.slice(7)] = i.value; });
    layout();
    ctx.ctl();
    root.querySelectorAll('input[type=range]').forEach((i) => { prevVal[i.dataset.key.slice(7)] = i.value; });
    if (M.start) M.start();
    paint();
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => { const nw = (root.clientWidth || 820) < 600; if (nw !== ctx.narrow && !ctx.busy && !drag) { layout(); paint(); } });
      ro.observe(root);
    }
    return {
      destroy() {
        ctx.stops.forEach((s) => s());
        if (M.destroy) M.destroy();
        if (ro) ro.disconnect();
        svg.removeEventListener('pointerdown', onDown); svg.removeEventListener('pointermove', onMove); svg.removeEventListener('pointerup', onUp); svg.removeEventListener('pointercancel', onUp);
        root.removeEventListener('click', onClick); root.removeEventListener('keydown', onKey); root.removeEventListener('input', onInput); root.removeEventListener('change', onChange);
      },
    };
  }

  // ================================================================ mode: identify (2D shapes, 3D solids, polygons)
  const SH2 = [
    { id: 'circle', n: T('Circle', 'वृत्त'), ex: T('a bangle or a coin', 'चूड़ी या सिक्का'), sides: 0, corners: 0, curved: 1, ell: [3, 3] },
    { id: 'triangle', n: T('Triangle', 'त्रिभुज'), ex: T('a samosa', 'समोसा'), sides: 3, corners: 3, pts: () => regular(3, 3.4, 90, V(0, -0.5)) },
    { id: 'square', n: T('Square', 'वर्ग'), ex: T('a carrom board', 'कैरम बोर्ड'), sides: 4, corners: 4, pts: () => regular(4, 3.4, 45) },
    { id: 'rectangle', n: T('Rectangle', 'आयत'), ex: T('a door or a book', 'दरवाज़ा या किताब'), sides: 4, corners: 4, pts: () => [V(-3.6, -2.2), V(3.6, -2.2), V(3.6, 2.2), V(-3.6, 2.2)] },
    { id: 'pentagon', n: T('Pentagon', 'पंचभुज'), ex: T('the front of a hut', 'झोपड़ी का सामने का हिस्सा'), sides: 5, corners: 5, pts: () => regular(5, 3.2, 90) },
    { id: 'hexagon', n: T('Hexagon', 'षट्भुज'), ex: T('a cell of a honeycomb', 'मधुमक्खी के छत्ते का एक खाना'), sides: 6, corners: 6, pts: () => regular(6, 3.2, 0) },
    { id: 'oval', n: T('Oval', 'अंडाकार'), ex: T('an egg', 'अंडा'), sides: 0, corners: 0, curved: 1, ell: [3.8, 2.5] },
    { id: 'rhombus', n: T('Rhombus', 'समचतुर्भुज'), ex: T('a kite (patang)', 'पतंग'), sides: 4, corners: 4, pts: () => [V(0, 3.4), V(2.3, 0), V(0, -3.4), V(-2.3, 0)] },
    { id: 'octagon', n: T('Octagon', 'अष्टभुज'), ex: T('a STOP sign', 'STOP (रुको) का बोर्ड'), sides: 8, corners: 8, pts: () => regular(8, 3.2, 22.5) },
  ];
  const POLYN = { 3: T('Triangle', 'त्रिभुज'), 4: T('Quadrilateral', 'चतुर्भुज'), 5: T('Pentagon', 'पंचभुज'), 6: T('Hexagon', 'षट्भुज'), 7: T('Heptagon', 'सप्तभुज'), 8: T('Octagon', 'अष्टभुज'), 9: T('Nonagon', 'नवभुज'), 10: T('Decagon', 'दशभुज') };
  const POLYS = [5, 3, 6, 4, 8, 7, 10, 9].map((k) => ({ id: 'p' + k, k, n: POLYN[k] }));
  const box3 = (a, b, c) => ({ v: [[-a, -b, -c], [a, -b, -c], [a, b, -c], [-a, b, -c], [-a, -b, c], [a, -b, c], [a, b, c], [-a, b, c]], f: [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4]] });
  const SOLIDS = [
    { id: 'cube', n: T('Cube', 'घन'), ex: T('a dice', 'पासा'), poly: box3(1.25, 1.25, 1.25) },
    { id: 'cylinder', n: T('Cylinder', 'बेलन'), ex: T('a pipe or a candle', 'पाइप या मोमबत्ती'), curved: 'cyl', faces: T('2 flat faces and 1 curved surface', '2 समतल फलक और 1 वक्र पृष्ठ'), edges: 2, verts: 0 },
    { id: 'cuboid', n: T('Cuboid', 'घनाभ'), ex: T('a brick or a matchbox', 'ईंट या माचिस की डिब्बी'), poly: box3(1.75, 1, 1.05) },
    { id: 'cone', n: T('Cone', 'शंकु'), ex: T('an ice-cream cone or a party cap', 'आइसक्रीम कोन या जन्मदिन की टोपी'), curved: 'cone', faces: T('1 flat face and 1 curved surface', '1 समतल फलक और 1 वक्र पृष्ठ'), edges: 1, verts: 1 },
    { id: 'pyramid', n: T('Square pyramid', 'वर्ग आधार वाला पिरामिड'), ex: T('the pyramids of Egypt', 'मिस्र के पिरामिड'), poly: { v: [[-1.4, -1.1, -1.4], [1.4, -1.1, -1.4], [1.4, -1.1, 1.4], [-1.4, -1.1, 1.4], [0, 1.5, 0]], f: [[0, 1, 2, 3], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]] } },
    { id: 'sphere', n: T('Sphere', 'गोला'), ex: T('a ball or a laddoo', 'गेंद या लड्डू'), curved: 'sph', faces: T('1 curved surface', '1 वक्र पृष्ठ'), edges: 0, verts: 0 },
    { id: 'prism', n: T('Triangular prism', 'त्रिभुजाकार प्रिज़्म'), ex: T('a tent', 'तंबू'), poly: { v: [[-1.4, -1, -1.5], [1.4, -1, -1.5], [0, 1.2, -1.5], [-1.4, -1, 1.5], [1.4, -1, 1.5], [0, 1.2, 1.5]], f: [[0, 1, 2], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]] } },
    { id: 'tetra', n: T('Triangular pyramid', 'त्रिभुजाकार पिरामिड'), ex: null, poly: { v: [[0, -1, 1.6], [1.39, -1, -0.8], [-1.39, -1, -0.8], [0, 1.4, 0]], f: [[0, 1, 2], [0, 1, 3], [1, 2, 3], [2, 0, 3]] } },
  ];
  function polyCounts(P) {
    const E = new Set();
    P.f.forEach((f) => f.forEach((a, i) => { const b = f[(i + 1) % f.length]; E.add(Math.min(a, b) + '-' + Math.max(a, b)); }));
    return { F: P.f.length, E: E.size, V: P.v.length };
  }

  function mkIdentify(ctx, task) {
    const G = ctx.G, tt = ctx.tt, uid = 'sh' + Math.random().toString(36).slice(2, 7);
    const list = task === '3d' ? SOLIDS : task === 'polygons' ? POLYS : SH2;
    let i = 0, shown = false, pop = 0, yaw = 30, diag = false;
    const cur = () => list[i];
    function ask() {
      const c = cur();
      const others = shuffle(list.filter((x) => x !== c), c.id + 'o').slice(0, 3);
      ctx.ask({
        q: task === '3d' ? T('What is this solid called?', 'इस ठोस का नाम क्या है?') : task === 'polygons' ? T('Count the sides. What is this polygon called?', 'भुजाएँ गिनो। इस बहुभुज का नाम क्या है?') : T('What is the name of this shape?', 'इस आकृति का नाम क्या है?'),
        opts: [c, ...others].map((o) => o.n), ans: 0, seed: c.id,
        why: c.k ? T(`It has ${c.k} sides and ${c.k} corners.`, `इसकी ${c.k} भुजाएँ और ${c.k} कोने हैं।`) : null,
        hint: c.k ? T('Count the sides one by one, going round the shape.', 'आकृति के चारों ओर घूमते हुए भुजाएँ एक-एक करके गिनो।') : null,
        onRight: () => { shown = true; ctx.ctl(); ctx.anim(900, (k) => { pop = k; }); },
      });
    }
    function solid(c) {
      const pt = rad(22), y0 = rad(yaw), col = PAL[i % PAL.length];
      if (c.curved) {
        const g = `<defs><linearGradient id="${uid}c" x1="0" x2="1"><stop offset="0" stop-color="${L.mixHex(col, '#061233', 0.35)}"/><stop offset=".45" stop-color="${L.mixHex(col, '#FFFFFF', 0.45)}"/><stop offset="1" stop-color="${L.mixHex(col, '#061233', 0.25)}"/></linearGradient><radialGradient id="${uid}r" cx=".38" cy=".34" r=".7"><stop offset="0" stop-color="${L.mixHex(col, '#FFFFFF', 0.7)}"/><stop offset=".6" stop-color="${col}"/><stop offset="1" stop-color="${L.mixHex(col, '#061233', 0.4)}"/></radialGradient></defs>`;
        const s = ctx.s, X = G.X, Y = G.Y;
        if (c.curved === 'sph') return g + `<circle cx="${X(0)}" cy="${Y(0)}" r="${2.2 * s}" fill="url(#${uid}r)" stroke="${C.ink}" stroke-width="3"/><ellipse cx="${X(0)}" cy="${Y(0)}" rx="${2.2 * s}" ry="${0.62 * s}" fill="none" stroke="${C.ink}" stroke-width="1.6" stroke-dasharray="7 6" opacity=".55"/>`;
        const rx = 1.5 * s, ry = 0.5 * s, yb = Y(-1.5);
        if (c.curved === 'cyl') {
          const yt = Y(1.5);
          return g + `<path d="M${X(-1.5)} ${yt} L${X(-1.5)} ${yb} A${rx} ${ry} 0 0 0 ${X(1.5)} ${yb} L${X(1.5)} ${yt} Z" fill="url(#${uid}c)" stroke="${C.ink}" stroke-width="3"/><path d="M${X(-1.5)} ${yb} A${rx} ${ry} 0 0 1 ${X(1.5)} ${yb}" fill="none" stroke="${C.ink}" stroke-width="1.6" stroke-dasharray="7 6" opacity=".55"/><ellipse cx="${X(0)}" cy="${yt}" rx="${rx}" ry="${ry}" fill="${L.mixHex(col, '#FFFFFF', 0.55)}" stroke="${C.ink}" stroke-width="3"/>`;
        }
        return g + `<path d="M${X(0)} ${Y(1.9)} L${X(-1.6)} ${yb} A${1.6 * s} ${ry} 0 0 0 ${X(1.6)} ${yb} Z" fill="url(#${uid}c)" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/><path d="M${X(-1.6)} ${yb} A${1.6 * s} ${ry} 0 0 1 ${X(1.6)} ${yb}" fill="none" stroke="${C.ink}" stroke-width="1.6" stroke-dasharray="7 6" opacity=".55"/>` + (shown ? G.dot(V(0, 1.9), C.sun, 7 + 3 * pop) : '');
      }
      const P = c.poly;
      const R3 = P.v.map(([x, y, z]) => { const x1 = x * Math.cos(y0) - z * Math.sin(y0), z1 = x * Math.sin(y0) + z * Math.cos(y0); return [x1 * 1.25, (y * Math.cos(pt) - z1 * Math.sin(pt)) * 1.25, y * Math.sin(pt) + z1 * Math.cos(pt)]; });
      const faces = P.f.map((f) => {
        const p = f.map((k) => R3[k]), cx = p.reduce((s, q) => s + q[0], 0) / p.length, cy = p.reduce((s, q) => s + q[1], 0) / p.length, cz = p.reduce((s, q) => s + q[2], 0) / p.length;
        const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], v = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
        let nv = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        if (nv[0] * cx + nv[1] * cy + nv[2] * cz < 0) nv = nv.map((q) => -q);
        const nl = Math.hypot(...nv) || 1;
        return { f, z: cz, vis: nv[2] / nl > 1e-6, lit: (nv[0] * -0.35 + nv[1] * 0.75 + nv[2] * 0.55) / nl / 1.0 };
      });
      const visE = new Set();
      faces.filter((q) => q.vis).forEach((q) => q.f.forEach((a, k) => { const b = q.f[(k + 1) % q.f.length]; visE.add(Math.min(a, b) + '-' + Math.max(a, b)); }));
      let s = '';
      const allE = new Set();
      P.f.forEach((f) => f.forEach((a, k) => { const b = f[(k + 1) % f.length]; allE.add(Math.min(a, b) + '-' + Math.max(a, b)); }));
      allE.forEach((e) => { if (visE.has(e)) return; const [a, b] = e.split('-').map(Number); s += G.line(V(R3[a][0], R3[a][1]), V(R3[b][0], R3[b][1]), C.ink, 1.6, 'stroke-dasharray="7 6" opacity=".5"'); });
      faces.filter((q) => q.vis).sort((a, b) => a.z - b.z).forEach((q) => {
        const k = clamp(q.lit, -1, 1);
        const fill = k >= 0 ? L.mixHex(col, '#FFFFFF', 0.15 + 0.5 * k) : L.mixHex(col, '#061233', -0.35 * k);
        s += G.poly(q.f.map((m) => V(R3[m][0], R3[m][1])), fill, C.ink, 3, 'fill-opacity=".93"');
      });
      if (shown) R3.forEach((p) => { s += G.dot(V(p[0], p[1]), C.sun, 5 + 3 * pop); });
      return s;
    }
    return {
      title: task === '3d' ? T('Name the solid', 'ठोस को पहचानो') : task === 'polygons' ? T('Polygons', 'बहुभुज') : T('Name the shape', 'आकृति को पहचानो'),
      how: task === '3d' ? T('Turn the solid with the slider, look at its faces, then choose its name.', 'स्लाइडर से ठोस को घुमाओ, उसके फलक देखो, फिर उसका नाम चुनो।') : T('Look at the shape, count its sides and corners, then choose its name.', 'आकृति को देखो, उसकी भुजाएँ और कोने गिनो, फिर उसका नाम चुनो।'),
      layout() { ctx.fit([-4.4, -3.9, 4.4, 3.9], 30); },
      start() { ask(); },
      ctl() {
        return (task === '3d' ? ctx.slider('turn', T('Turn', 'घुमाओ'), 0, 355, 5, yaw, '°') : '') + (task === 'polygons' ? ctx.btn('show:diagonals', T('Diagonals', 'विकर्ण'), { pressed: diag }) : '')
          + ctx.btn('next', W.next, { cls: 'main', disabled: !shown });
      },
      slider(nm, v) { if (nm === 'turn') yaw = v; },
      click(key) {
        if (key === 'next') { i = (i + 1) % list.length; shown = false; pop = 0; ctx.ctl(); ask(); }
        else if (key === 'show:diagonals') { diag = !diag; ctx.ctl(); ctx.emit('drawn'); }
      },
      svg() {
        const c = cur();
        let s = `<g opacity=".55">${G.grid(1, 0, '#EEF2FA')}</g><defs><filter id="${uid}s" x="-25%" y="-25%" width="150%" height="160%"><feDropShadow dx="0" dy="9" stdDeviation="8" flood-color="#061233" flood-opacity=".22"/></filter></defs>`;
        if (task === '3d') return s + `<g filter="url(#${uid}s)">${solid(c)}</g>`;
        const col = PAL[i % PAL.length];
        const g = `<defs><linearGradient id="${uid}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${L.mixHex(col, '#FFFFFF', 0.45)}"/><stop offset="1" stop-color="${col}"/></linearGradient></defs>`;
        if (c.ell) return s + g + `<ellipse cx="${G.X(0)}" cy="${G.Y(0)}" rx="${c.ell[0] * ctx.s}" ry="${c.ell[1] * ctx.s}" fill="url(#${uid}f)" stroke="${C.ink}" stroke-width="4" filter="url(#${uid}s)"/>`;
        const pts = c.k ? regular(c.k, 3.2, 90) : c.pts();
        s += g + G.poly(pts, `url(#${uid}f)`, C.ink, 4, `filter="url(#${uid}s)"`);
        if (diag) pts.forEach((p, a) => pts.forEach((q, b) => { if (b > a + 1 && !(a === 0 && b === pts.length - 1)) s += G.line(p, q, C.mid, 2, 'stroke-dasharray="6 5" opacity=".7"'); }));
        if (shown) {
          const o = centroid(pts);
          pts.forEach((p, a) => {
            const q = pts[(a + 1) % pts.length], m = mid(p, q), u = unit(sub(m, o)), b = add(m, mul(u, G.w(24)));
            s += `<g opacity="${pop}"><circle cx="${G.X(b.x)}" cy="${G.Y(b.y)}" r="15" fill="#fff" stroke="${C.ink}" stroke-width="2"/>${G.text(b, a + 1, 'sh-sm sh-ns')}</g>`;
            s += G.dot(p, C.sun, 4 + 5 * pop);
          });
        }
        return s;
      },
      read() {
        const c = cur();
        if (!shown) return `<p>${tt(task === '3d' ? T('Count the flat faces, the edges and the corners (vertices).', 'समतल फलक, किनारे और कोने (शीर्ष) गिनो।') : T('Count the straight sides and the corners.', 'सीधी भुजाएँ और कोने गिनो।'))}</p>`;
        if (task === '3d') {
          if (c.curved) return ctx.chip(tt(c.n), 'big') + ctx.chip(tt(T('Faces: ', 'फलक: ')) + tt(c.faces)) + ctx.chip(tt(T('Edges: ', 'किनारे: ')) + c.edges) + ctx.chip(tt(T('Vertices: ', 'शीर्ष: ')) + c.verts) + (c.ex ? `<p>${tt(T('Like ', 'जैसे '))}${tt(c.ex)}</p>` : '');
          const k = polyCounts(c.poly);
          return ctx.chip(tt(c.n), 'big') + ctx.chip(tt(T('Faces F = ', 'फलक F = ')) + k.F) + ctx.chip(tt(T('Edges E = ', 'किनारे E = ')) + k.E) + ctx.chip(tt(T('Vertices V = ', 'शीर्ष V = ')) + k.V)
            + `<p class="sh-eq">F + V − E = ${k.F} + ${k.V} − ${k.E} = ${k.F + k.V - k.E}</p>` + (c.ex ? `<p>${tt(T('Like ', 'जैसे '))}${tt(c.ex)}</p>` : '');
        }
        if (task === 'polygons') {
          const k = c.k;
          return ctx.chip(tt(c.n), 'big') + ctx.chip(tt(T('Sides: ', 'भुजाएँ: ')) + k) + ctx.chip(tt(T('Diagonals: ', 'विकर्ण: ')) + (k * (k - 3)) / 2)
            + `<p class="sh-eq">${tt(T('Angle sum', 'कोणों का योग'))} = (${k} − 2) × 180° = ${(k - 2) * 180}°</p><p>${tt(T('Each angle of this regular polygon', 'इस सम बहुभुज का हर कोण'))} = ${(k - 2) * 180}° ÷ ${k} = ${fn(((k - 2) * 180) / k)}°</p>`;
        }
        return ctx.chip(tt(c.n), 'big') + (c.curved ? ctx.chip(tt(T('One curved edge, no corners', 'एक घुमावदार किनारा, कोई कोना नहीं'))) : ctx.chip(tt(T('Sides: ', 'भुजाएँ: ')) + c.sides) + ctx.chip(tt(T('Corners: ', 'कोने: ')) + c.corners)) + `<p>${tt(T('Like ', 'जैसे '))}${tt(c.ex)}</p>`;
      },
    };
  }

  // ================================================================ mode: angle
  const ATYPE = {
    zero: T('Zero angle', 'शून्य कोण'), acute: T('Acute angle', 'न्यून कोण'), right: T('Right angle', 'समकोण'), obtuse: T('Obtuse angle', 'अधिक कोण'),
    straight: T('Straight angle', 'ऋजु कोण'), reflex: T('Reflex angle', 'प्रतिवर्ती कोण'), complete: T('Complete angle', 'संपूर्ण कोण'),
  };
  const ATYPE_RULE = {
    acute: T('less than 90°', '90° से कम'), right: T('exactly 90°', 'ठीक 90°'), obtuse: T('between 90° and 180°', '90° और 180° के बीच'),
    straight: T('exactly 180°', 'ठीक 180°'), reflex: T('between 180° and 360°', '180° और 360° के बीच'), zero: T('0°', '0°'), complete: T('360°', '360°'),
  };
  const typeOf = (t) => (t === 0 ? 'zero' : t < 90 ? 'acute' : t === 90 ? 'right' : t < 180 ? 'obtuse' : t === 180 ? 'straight' : t < 360 ? 'reflex' : 'complete');

  function mkAngle(ctx, task, given) {
    const G = ctx.G, tt = ctx.tt, O = V(0, 0), R = 6;
    const ga = (given.angles || [])[0];
    let th = { measure: ga || 50, make: 30, types: 120, 'linear-pair': 60, complementary: 35, vertical: 55, parallel: 60 }[task];
    const target = task === 'make' ? ga || 75 : null;
    let prot = false, ch = 0, tau = 0, pair = null, made = false;
    const CH = ['acute', 'right', 'obtuse', 'straight', 'reflex'];
    const range = { measure: [1, 179], make: [1, 180], types: [1, 359], 'linear-pair': [1, 179], complementary: [1, 89], vertical: [5, 175], parallel: [25, 155] }[task];
    const D = 3.2, P0 = V(-1, 0);
    const tT = () => { const u = polar(V(0, 0), 1, th); return add(P0, mul(u, (D + 2.6) / Math.sin(rad(th)))); };
    const Qp = () => llx(P0, polar(V(0, 0), 1, th), V(0, D), polar(V(0, 0), 1, tau)) || V(0, D);
    function setFrom(p) {
      let a = n360(task === 'parallel' ? dirA(P0, p) : dirA(O, p));
      if (task !== 'types' && a > 180) a = a > 270 ? 0 : 180;
      th = clamp(Math.round(a), range[0], range[1]);
    }
    function askMeasure() {
      const c = [th, 180 - th, th + 10, th - 10, th + 20, th - 20].filter((v, k, a) => v >= 1 && v <= 179 && a.indexOf(v) === k).slice(0, 4);
      ctx.ask({ q: T('How big is angle AOB? Put the protractor on it and read the scale that starts at 0 on arm OA.', 'कोण AOB कितना बड़ा है? उस पर चाँदा रखो और वह पैमाना पढ़ो जो भुजा OA पर 0 से शुरू होता है।'), opts: c.map((v) => v + '°'), ans: 0,
        why: T(`OA lies on 0 of the inner scale, so the inner scale gives ${th}°.`, `OA भीतरी पैमाने के 0 पर है, इसलिए भीतरी पैमाना ${th}° देता है।`),
        hint: T('Start from the 0 that lies on arm OA, and count up to arm OB.', 'भुजा OA पर पड़े 0 से शुरू करो और भुजा OB तक गिनो।'), onRight: () => { ctx.paint(); } });
    }
    const angs = () => { const p = th - tau; return { 1: p, 2: 180 - p, 3: p, 4: 180 - p, 5: th, 6: 180 - th, 7: th, 8: 180 - th }; };
    const PAIRS = { corresponding: [1, 5], alternate: [3, 5], interior: [4, 5] };
    const PAIRN = { corresponding: T('Corresponding angles', 'संगत कोण'), alternate: T('Alternate interior angles', 'एकांतर अंतः कोण'), interior: T('Interior angles on the same side', 'तिर्यक रेखा के एक ही ओर के अंतः कोण') };
    return {
      title: { measure: T('Measure an angle', 'कोण मापो'), make: T('Make an angle', 'कोण बनाओ'), types: T('Kinds of angles', 'कोणों के प्रकार'), 'linear-pair': T('Linear pair', 'रैखिक युग्म'), complementary: T('Complementary angles', 'पूरक कोण'), vertical: T('Vertically opposite angles', 'शीर्षाभिमुख कोण'), parallel: T('Parallel lines and a transversal', 'समांतर रेखाएँ और तिर्यक रेखा') }[task],
      how: {
        measure: T('Tap the protractor to place it on the angle, read it, then answer.', 'चाँदे को कोण पर रखने के लिए उस पर टैप करो, पढ़ो, फिर उत्तर दो।'),
        make: T(`Drag point B to make an angle of exactly ${target}°. The protractor helps you check.`, `बिंदु B को खिसकाकर ठीक ${target}° का कोण बनाओ। चाँदा जाँचने में मदद करता है।`),
        types: T('Drag point B to make each kind of angle that is asked.', 'बिंदु B को खिसकाकर हर माँगा गया प्रकार का कोण बनाओ।'),
        'linear-pair': T('Drag point B. Watch the two angles on the straight line.', 'बिंदु B को खिसकाओ। सीधी रेखा पर बने दोनों कोण देखो।'),
        complementary: T('Drag point B inside the right angle. Watch the two parts.', 'बिंदु B को समकोण के भीतर खिसकाओ। दोनों भाग देखो।'),
        vertical: T('Drag point B to turn one line. Compare the angles opposite each other.', 'बिंदु B को खिसकाकर एक रेखा घुमाओ। आमने-सामने के कोणों की तुलना करो।'),
        parallel: T('Drag point T to tilt the transversal. Tap a pair of angles to compare them.', 'बिंदु T को खिसकाकर तिर्यक रेखा झुकाओ। तुलना करने के लिए कोणों का एक युग्म चुनो।'),
      }[task],
      layout() {
        ctx.fit(task === 'types' || task === 'vertical' ? [-6.8, -6.8, 6.8, 6.8] : task === 'parallel' ? [-7, -2.6, 7, D + 3.3] : task === 'complementary' ? [-1.2, -1.2, 6.8, 6.8] : [-6.8, -1.4, 6.8, 6.9], 30);
      },
      start() { if (task === 'measure') askMeasure(); },
      ctl() {
        if (task === 'measure' || task === 'make') return ctx.toolBtn('protractor', prot);
        if (task === 'parallel') return Object.keys(PAIRS).map((k) => ctx.btn('pair:' + k, PAIRN[k], { pressed: pair === k })).join('') + ctx.slider('tilt', T('Tilt line m', 'रेखा m झुकाओ'), -15, 15, 1, tau, '°');
        return '';
      },
      pos(nm) { return nm === 'T' ? tT() : polar(O, R, th); },
      drag(nm, p) { setFrom(p); },
      dragEnd(nm, moved) {
        if (!moved) return;
        const ty = typeOf(th);
        if (task === 'make' || task === 'measure') { if (prot) ctx.emit('measured:' + th); }
        else if (task !== 'parallel') ctx.emit('measured:' + th);
        ctx.record(T(`Made an angle of ${th}°`, `${th}° का कोण बनाया`));
        if (task === 'make' && th === target && !made) { made = true; ctx.emit('constructed'); ctx.api.celebrate(); }
        if (task === 'make' && th !== target) made = false;
        if (task === 'types' && ch < CH.length && ty === CH[ch]) { ctx.emit('answered:right'); ctx.api.celebrate(); ch++; }
        if (['linear-pair', 'complementary', 'vertical'].includes(task)) ctx.emit('proved');
      },
      slider(nm, v) { if (nm === 'tilt') tau = v; },
      sliderEnd() { if (pair) ctx.emit('measured:' + angs()[PAIRS[pair][0]]); },
      click(key) {
        if (key === 'tool:protractor') {
          prot = !prot; ctx.ctl();
          if (prot) { ctx.emit('measured:' + th); ctx.record(T('Placed the protractor', 'चाँदा रखा')); }
        } else if (key.startsWith('pair:')) {
          pair = key.slice(5); ctx.ctl();
          const a = angs(), [x, y] = PAIRS[pair];
          ctx.emit('measured:' + a[x]);
          if (tau === 0) ctx.emit('proved');
          ctx.record(api_t(ctx, PAIRN[pair]) + `: ${fn(a[x])}°, ${fn(a[y])}°`);
        }
      },
      svg() {
        let s = `<g opacity=".7">${G.grid(1, 0, '#EEF2FA')}</g>`;
        const lbl = (q, txt, away) => G.lab(q, txt, away, 24);
        if (task === 'parallel') {
          const a = angs(), Q = Qp(), u = polar(V(0, 0), 1, th), m = polar(V(0, 0), 1, tau);
          s += G.line(V(-7, 0), V(7, 0), C.royal, 4) + G.line(sub(V(0, D), mul(m, 7.2)), add(V(0, D), mul(m, 7.2)), tau ? C.coral : C.royal, 4);
          s += G.text(V(-6.6, 0), 'l', 'sh-nm', 0, -18) + G.text(add(V(0, D), mul(m, -6.6)), 'm', 'sh-nm', 0, -18);
          if (tau === 0) s += G.chev(V(-6, 0), V(-4.4, 0), C.royal, 2) + G.chev(V(-6, D), V(-4.4, D), C.royal, 2);
          const tEnd = tT();
          s += G.line(sub(P0, mul(u, 2.4)), tEnd, C.ink, 3.5);
          const at = { 1: [Q, tau, a[1]], 2: [Q, th, a[2]], 3: [Q, tau + 180, a[3]], 4: [Q, th + 180, a[4]], 5: [P0, 0, a[5]], 6: [P0, th, a[6]], 7: [P0, 180, a[7]], 8: [P0, th + 180, a[8]] };
          const hi = pair ? PAIRS[pair] : [];
          Object.keys(at).forEach((k) => {
            const [q, a0, d] = at[k], on = hi.includes(+k);
            s += G.amarkD(q, a0, d, { rpx: on ? 34 : 24, col: on ? (hi[0] === +k ? C.pink : C.grape) : '#94A3B8', op: on ? 0.45 : 0.18, label: on ? fn(d) + '°' : k, cls: on ? 'sh-md' : 'sh-sm', lpx: on ? 26 : 14, noRight: true });
          });
          s += G.pt(P0, 'P', C.ink, add(P0, V(0.5, 1))) + G.pt(Q, 'Q', C.ink, add(Q, V(0.6, -1)));
          s += G.handle('drag:T', tEnd, C.pink, tt(T('Point T on the transversal', 'तिर्यक रेखा पर बिंदु T')), 'T', P0);
          return s;
        }
        const A = V(R, 0), B = polar(O, R, th);
        if (task === 'linear-pair' || task === 'vertical') {
          s += G.line(V(-R, 0), A, C.ink, 4);
          if (task === 'vertical') s += G.line(polar(O, R, th + 180), B, C.ink, 4);
          else s += G.line(O, B, C.ink, 4);
          s += G.amarkD(O, 0, th, { col: C.pink, label: th + '°', rpx: 44, lpx: 26 }) + G.amarkD(O, th, 180 - th, { col: C.royal, label: 180 - th + '°', rpx: 36, lpx: 26 });
          if (task === 'vertical') s += G.amarkD(O, 180, th, { col: C.pink, label: th + '°', rpx: 44, lpx: 26 }) + G.amarkD(O, th + 180, 180 - th, { col: C.royal, label: 180 - th + '°', rpx: 36, lpx: 26 });
          s += lbl(A, 'A', O) + lbl(V(-R, 0), 'C', O) + (task === 'vertical' ? lbl(polar(O, R, th + 180), 'D', O) : '') + G.pt(O, 'O', C.ink, polar(O, 1, th + 90 + (task === 'vertical' ? 0 : 180)));
          return s + G.handle('drag:B', B, C.pink, tt(W.drag) + ' B', 'B', O);
        }
        if (task === 'complementary') {
          const Cc = V(0, R);
          s += G.line(O, A, C.ink, 4) + G.line(O, Cc, C.ink, 4) + G.line(O, B, C.ink, 4);
          s += G.amarkD(O, 0, 90, { col: '#94A3B8', rpx: 18, op: 0.2 });
          s += G.amarkD(O, 0, th, { col: C.pink, label: th + '°', rpx: 70, lpx: 24, noRight: true }) + G.amarkD(O, th, 90 - th, { col: C.royal, label: 90 - th + '°', rpx: 56, lpx: 24, noRight: true });
          s += lbl(A, 'A', O) + lbl(Cc, 'C', O) + G.pt(O, 'O', C.ink, V(-1, -1));
          return s + G.handle('drag:B', B, C.pink, tt(W.drag) + ' B', 'B', O);
        }
        s += G.line(O, A, C.ink, 4) + G.line(O, B, C.ink, 4);
        const showVal = task !== 'measure' || (ctxQdone(ctx));
        s += G.amarkD(O, 0, th, { col: task === 'types' && ch < CH.length && typeOf(th) === CH[ch] ? C.leaf : C.pink, label: showVal && !prot ? th + '°' : '', rpx: 46, lpx: 28, op: 0.32 });
        if (prot) s += G.protractor(O, 0, R * 0.8, task === 'make' || showVal ? Math.min(th, 180) : null);
        s += lbl(A, 'A', O) + G.pt(O, 'O', C.ink, V(0.3, -1));
        return s + G.handle('drag:B', B, C.pink, tt(W.drag) + ' B', 'B', O);
      },
      read() {
        if (task === 'measure') return `<p>${tt(prot ? T('Read where arm OB crosses the inner (blue) scale.', 'देखो कि भुजा OB भीतरी (नीले) पैमाने को कहाँ काटती है।') : T('Tap the protractor to place it with its centre on O.', 'चाँदे पर टैप करो ताकि उसका केंद्र O पर रखा जाए।'))}</p>`;
        if (task === 'make') return ctx.chip(tt(T('Target: ', 'लक्ष्य: ')) + target + '°', 'big') + (prot ? ctx.chip(tt(T('Now: ', 'अभी: ')) + th + '°', th === target ? 'ok' : '') : ctx.chip(tt(T('Use the protractor to check', 'जाँचने के लिए चाँदा लगाओ')))) + (th === target ? `<p>${tt(T(`Well done: angle AOB is exactly ${target}°.`, `शाबाश: कोण AOB ठीक ${target}° है।`))}</p>` : '');
        if (task === 'types') {
          const ty = typeOf(th);
          return ctx.chip(`∠AOB = ${th}°`, '') + ctx.chip(tt(ATYPE[ty]) + ' (' + tt(ATYPE_RULE[ty]) + ')', 'big') + `<p>${ch < CH.length ? tt(T('Now make: ', 'अब बनाओ: ')) + '<b>' + tt(ATYPE[CH[ch]]) + '</b> — ' + tt(ATYPE_RULE[CH[ch]]) : tt(T('You made every kind of angle!', 'तुमने हर प्रकार का कोण बना लिया!'))}</p>`;
        }
        if (task === 'linear-pair') return `<p class="sh-eq">∠AOB + ∠BOC = ${th}° + ${180 - th}° = 180°</p><p>${tt(T('The two angles of a linear pair always add up to 180°, because together they make a straight line.', 'रैखिक युग्म के दोनों कोणों का योग हमेशा 180° होता है, क्योंकि मिलकर वे एक सीधी रेखा बनाते हैं।'))}</p>`;
        if (task === 'complementary') return `<p class="sh-eq">∠AOB + ∠BOC = ${th}° + ${90 - th}° = 90°</p><p>${tt(T('Two angles that add up to 90° are complementary.', 'जिन दो कोणों का योग 90° हो, वे पूरक कोण हैं।'))}</p>`;
        if (task === 'vertical') return `<p class="sh-eq">∠AOB = ∠COD = ${th}° &nbsp; · &nbsp; ∠BOC = ∠DOA = ${180 - th}°</p><p>${tt(T('Vertically opposite angles are always equal: each one makes a straight line with the same angle in between.', 'शीर्षाभिमुख कोण हमेशा बराबर होते हैं: हर एक बीच वाले उसी कोण के साथ सीधी रेखा बनाता है।'))}</p>`;
        const a = angs();
        if (!pair) return `<p>${tt(T('Tap a pair of angles below.', 'नीचे कोणों का एक युग्म चुनो।'))} ${tau ? tt(T('Line m is tilted: l and m are not parallel now.', 'रेखा m झुकी है: अब l और m समांतर नहीं हैं।')) : tt(T('Lines l and m are parallel.', 'रेखाएँ l और m समांतर हैं।'))}</p>`;
        const [x, y] = PAIRS[pair], eq = pair === 'interior' ? a[x] + a[y] === 180 : a[x] === a[y];
        const rel = pair === 'interior' ? `${fn(a[x])}° + ${fn(a[y])}° = ${fn(a[x] + a[y])}°` : `${fn(a[x])}° ${eq ? '=' : '≠'} ${fn(a[y])}°`;
        return ctx.chip(tt(PAIRN[pair]), 'big') + `<p class="sh-eq">${rel}</p><p>${tau === 0 ? tt(pair === 'interior' ? T('With parallel lines, interior angles on the same side add up to 180°.', 'समांतर रेखाओं में तिर्यक रेखा के एक ही ओर के अंतः कोणों का योग 180° होता है।') : T('With parallel lines, these angles are always equal.', 'समांतर रेखाओं में ये कोण हमेशा बराबर होते हैं।')) : tt(T('The lines are not parallel, so the rule does not hold.', 'रेखाएँ समांतर नहीं हैं, इसलिए यह नियम लागू नहीं होता।'))}</p>`;
      },
    };
  }
  const api_t = (ctx, x) => ctx.api.t(x);
  const ctxQdone = (ctx) => !!(ctx.qdone && ctx.qdone());

  // ================================================================ mode: triangle
  const TRI_BOX = [-1.5, -1.6, 10.5, 7.6];
  // place a triangle from given lengths [a=BC, b=CA, c=AB] or angles [A, B, C?] (with lengths [a] for the size)
  function triPlace(g) {
    const Ls = g.lengths || [], As = g.angles || [];
    let A, B = V(0, 0), Cc;
    if (Ls.length === 3) {
      const [a, b, c] = Ls;
      const x = (c * c + a * a - b * b) / (2 * a);
      A = V(x, Math.sqrt(Math.max(0, c * c - x * x))); Cc = V(a, 0);
    } else if (As.length >= 2) {
      const a = Ls[0] || 6, aA = As.length === 3 ? As[0] : 180 - As[0] - As[1];
      const aB = As.length === 3 ? As[1] : As[0], aC = 180 - aA - aB;
      const c = (a * Math.sin(rad(aC))) / Math.sin(rad(aA));
      A = polar(B, c, aB); Cc = V(a, 0);
    } else return null;
    const dx = Math.max(0, -A.x) + 0.5;
    return { A: add(A, V(dx, 0.3)), B: add(B, V(dx, 0.3)), C: add(Cc, V(dx, 0.3)) };
  }
  const SIDEK = { scalene: T('Scalene', 'विषमबाहु'), isosceles: T('Isosceles', 'समद्विबाहु'), equilateral: T('Equilateral', 'समबाहु') };
  const ANGK = { acute: T('Acute-angled', 'न्यूनकोण'), right: T('Right-angled', 'समकोण'), obtuse: T('Obtuse-angled', 'अधिककोण') };
  const SIDEW = { scalene: T('no two sides equal', 'कोई दो भुजाएँ बराबर नहीं'), isosceles: T('two sides equal', 'दो भुजाएँ बराबर'), equilateral: T('all three sides equal', 'तीनों भुजाएँ बराबर') };
  function triKinds(P) {
    const s = [dist(P.B, P.C), dist(P.C, P.A), dist(P.A, P.B)].map(f1);
    const side = s[0] === s[1] && s[1] === s[2] ? 'equilateral' : s[0] === s[1] || s[1] === s[2] || s[0] === s[2] ? 'isosceles' : 'scalene';
    const an = roundSum([angAt(P.B, P.A, P.C), angAt(P.A, P.B, P.C), angAt(P.A, P.C, P.B)], 180);
    const ang = an.includes('90.0') ? 'right' : Math.max(...an.map(Number)) > 90 ? 'obtuse' : 'acute';
    return { side, ang, s, an };
  }

  function mkTriangle(ctx, task, given) {
    const G = ctx.G, tt = ctx.tt;
    let P = (task !== 'inequality' && triPlace(given)) || { A: V(2.4, 4.6), B: V(0.3, 0.3), C: V(7, 0.3) };
    if (task === 'classify' && !given.lengths && !given.angles) P = { A: V(1.6, 4.1), B: V(0.3, 0.3), C: V(7.3, 0.3) };
    let ruler = false, prot = false, proof = 0, ch = 0, med = false, alt = false;
    const CHT = ['isosceles', 'right', 'obtuse', 'equilateral'];
    const gl = given.lengths || [];
    let ia = gl[0] || 7, ib = gl[1] || 3, ic = gl[2] || 3, formed = null;
    const cB = (p) => V(clamp(p.x, TRI_BOX[0] + 0.3, TRI_BOX[2] - 0.3), clamp(p.y, TRI_BOX[1] + 0.3, TRI_BOX[3] - 0.3));
    const angs = () => [angAt(P.B, P.A, P.C), angAt(P.A, P.B, P.C), angAt(P.A, P.C, P.B)];
    const canForm = () => ib + ic > ia && ia + ib > ic && ia + ic > ib;
    function wedgePts(q, p1, p2, r) {
      let a0 = dirA(q, p1), d = n360(dirA(q, p2) - a0);
      if (d > 180) { a0 = dirA(q, p2); d = 360 - d; }
      return [q].concat(G.arcPts(q, r, a0, a0 + d));
    }
    function inequality() {
      const B = V(0, 0), Cc = V(ia, 0);
      ctx.fit([Math.min(-ic, ia - ib, 0) - 0.8, -1.4, Math.max(ia + ib, ic, ia) + 0.8, Math.max(ib, ic) + 1], 30);
      let s = `<g opacity=".7">${G.grid(1, 0, '#EEF2FA')}</g>`;
      const pts = ccx(B, ic, Cc, ib).filter((q) => q.y > 1e-6);
      s += G.pl(G.arcPts(B, ic, 0, 180, 90), C.royal, 2.5, 'stroke-dasharray="8 6"') + G.pl(G.arcPts(Cc, ib, 0, 180, 90), C.tang, 2.5, 'stroke-dasharray="8 6"');
      if (pts.length) s += G.poly([pts[0], B, Cc], 'rgba(219,39,119,0.16)', C.pink, 4) + G.pt(pts[0], 'A', C.pink, V(ia / 2, 0));
      s += G.line(B, Cc, C.ink, 5) + G.pt(B, 'B', C.ink, V(ia / 2, 1)) + G.pt(Cc, 'C', C.ink, V(ia / 2, 1));
      s += G.slen(B, Cc, `a = ${fn(ia)} ${tt(W.cm)}`, V(ia / 2, 2), 22);
      s += G.text(polar(B, ic, 128), `c = ${fn(ic)}`, 'sh-sm', 0, -14, `fill="${C.royal}"`) + G.text(polar(Cc, ib, 52), `b = ${fn(ib)}`, 'sh-sm', 0, -14, `fill="${C.tang}"`);
      return s;
    }
    return {
      title: { 'angle-sum': T('Angle sum of a triangle', 'त्रिभुज के कोणों का योग'), classify: T('Kinds of triangles', 'त्रिभुजों के प्रकार'), inequality: T('Can these sides make a triangle?', 'क्या इन भुजाओं से त्रिभुज बनेगा?'), 'exterior-angle': T('Exterior angle', 'बहिष्कोण'), 'median-altitude': T('Medians and altitudes', 'माध्यिकाएँ और शीर्षलंब'), area: T('Area of a triangle', 'त्रिभुज का क्षेत्रफल') }[task],
      how: {
        'angle-sum': T('Drag the corners to change the triangle. Measure the angles, then tap “Show why”.', 'कोनों को खिसकाकर त्रिभुज बदलो। कोण मापो, फिर “कारण दिखाओ” दबाओ।'),
        classify: T('Drag the corners to make the triangle that is asked. Use the ruler and the protractor to check.', 'कोनों को खिसकाकर माँगा गया त्रिभुज बनाओ। जाँचने के लिए रूलर और चाँदा लगाओ।'),
        inequality: T('Change the three sides with the sliders. The arcs from B and C must meet to make corner A.', 'स्लाइडर से तीनों भुजाएँ बदलो। कोना A बनाने के लिए B और C से खींचे चाप मिलने चाहिए।'),
        'exterior-angle': T('Drag the corners and compare the exterior angle with the two opposite inside angles.', 'कोनों को खिसकाओ और बहिष्कोण की तुलना सामने के दो अंतः कोणों से करो।'),
        'median-altitude': T('Show the medians or the altitudes, then drag the corners.', 'माध्यिकाएँ या शीर्षलंब दिखाओ, फिर कोनों को खिसकाओ।'),
        area: T('Drag the corners. The area is half of base × height.', 'कोनों को खिसकाओ। क्षेत्रफल आधार × ऊँचाई का आधा होता है।'),
      }[task],
      layout() { ctx.fit(TRI_BOX, 28); },
      ctl() {
        if (task === 'inequality') return ctx.slider('a', T('Side a = BC', 'भुजा a = BC'), 1, 12, 0.5, ia, W.cm) + ctx.slider('b', T('Side b = CA', 'भुजा b = CA'), 1, 12, 0.5, ib, W.cm) + ctx.slider('c', T('Side c = AB', 'भुजा c = AB'), 1, 12, 0.5, ic, W.cm);
        let s = '';
        if (task === 'median-altitude') s += ctx.btn('show:medians', T('Medians', 'माध्यिकाएँ'), { pressed: med }) + ctx.btn('show:altitudes', T('Altitudes', 'शीर्षलंब'), { pressed: alt });
        if (['classify', 'median-altitude', 'area'].includes(task)) s += ctx.toolBtn('ruler', ruler);
        if (['angle-sum', 'classify', 'exterior-angle'].includes(task)) s += ctx.toolBtn('protractor', prot);
        if (task === 'angle-sum') s += ctx.btn('prove', W.prove, { cls: 'main' });
        return s;
      },
      pos(nm) { return P[nm]; },
      drag(nm, p) {
        if (task === 'inequality' || !P[nm]) return;
        const N = Object.assign({}, P, { [nm]: snapP(cB(p), 0.1) });
        if (Math.abs(area([N.A, N.B, N.C])) < 0.6 || Math.min(dist(N.A, N.B), dist(N.B, N.C), dist(N.C, N.A)) < 1) return;
        P = N; proof = 0;
      },
      dragEnd(nm, moved) {
        if (!moved) return;
        const k = triKinds(P);
        ctx.record(T(`Moved ${nm}: sides ${k.s.join(', ')} cm`, `${nm} खिसकाया: भुजाएँ ${k.s.join(', ')} सेमी`));
        if (task === 'angle-sum' && prot) ctx.emit('measured:180');
        if (task === 'classify' && ch < CHT.length && (k.side === CHT[ch] || k.ang === CHT[ch] || (CHT[ch] === 'isosceles' && k.side === 'equilateral' && false))) { ctx.emit('answered:right'); ctx.api.celebrate(); ch++; }
        if (task === 'exterior-angle') { ctx.emit('proved'); if (prot) ctx.emit('measured:' + f1(180 - angs()[2])); }
        if (task === 'median-altitude' && (med || alt)) ctx.emit('drawn');
        if (task === 'area' && ruler) ctx.emit('measured:' + f1(Math.abs(area([P.A, P.B, P.C]))));
      },
      slider(nm, v) { if (nm === 'a') ia = v; if (nm === 'b') ib = v; if (nm === 'c') ic = v; },
      sliderEnd() {
        const f = canForm();
        ctx.emit('drawn');
        if (f && formed !== true) { ctx.emit('constructed'); ctx.api.celebrate(); }
        ctx.record(T(`Tried sides ${fn(ia)}, ${fn(ib)}, ${fn(ic)} cm: ${f ? 'a triangle' : 'no triangle'}`, `भुजाएँ ${fn(ia)}, ${fn(ib)}, ${fn(ic)} सेमी: ${f ? 'त्रिभुज बना' : 'त्रिभुज नहीं बना'}`));
        formed = f;
      },
      start() { formed = canForm(); },
      click(key) {
        if (key === 'tool:ruler') { ruler = !ruler; ctx.ctl(); if (ruler) ctx.emit('measured:' + (task === 'area' ? f1(Math.abs(area([P.A, P.B, P.C]))) : f1(dist(P.B, P.C)))); }
        else if (key === 'tool:protractor') { prot = !prot; ctx.ctl(); if (prot) ctx.emit('measured:' + (task === 'exterior-angle' ? f1(180 - angs()[2]) : '180')); }
        else if (key === 'show:medians') { med = !med; ctx.ctl(); if (med) ctx.emit('drawn'); }
        else if (key === 'show:altitudes') { alt = !alt; ctx.ctl(); if (alt) ctx.emit('drawn'); }
        else if (key === 'prove') { proof = 0; ctx.anim(2400, (k) => { proof = L.ease(k); }, () => { ctx.emit('proved'); ctx.api.celebrate(); ctx.record(T('Saw the three angles make a straight line', 'तीनों कोणों को सीधी रेखा बनाते देखा')); }); }
      },
      svg() {
        if (task === 'inequality') return inequality();
        const { A, B, C: Cc } = P;
        const k = triKinds(P), an = k.an, o = centroid([A, B, Cc]);
        let s = `<g opacity=".8">${G.grid(1, 5)}</g>`;
        if (task === 'area') {
          const H = foot(A, B, Cc), t = dot(sub(H, B), unit(sub(Cc, B))) / dist(B, Cc);
          if (t < 0) s += G.line(B, H, C.ink2, 2, 'stroke-dasharray="6 5"'); if (t > 1) s += G.line(Cc, H, C.ink2, 2, 'stroke-dasharray="6 5"');
          const u = unit(sub(Cc, B)), hv = sub(A, H);
          s += G.poly([B, Cc, add(Cc, hv), add(B, hv)], 'rgba(20,184,166,0.10)', C.turq, 2, 'stroke-dasharray="7 6"');
          s += G.poly([A, B, Cc], 'rgba(219,39,119,0.18)', C.ink, 3.5);
          s += G.line(A, H, C.grape, 3, 'stroke-dasharray="7 5"') + G.amark(A, H, add(H, u), { col: C.grape, rpx: 16 });
          s += G.slen(A, H, tt(T('height', 'ऊँचाई')) + (ruler ? ' ' + f1(dist(A, H)) : ''), add(A, u), 30) + G.slen(B, Cc, tt(T('base', 'आधार')) + (ruler ? ' ' + f1(dist(B, Cc)) : ''), A, 24);
        } else s += G.poly([A, B, Cc], task === 'classify' && ch < CHT.length && (k.side === CHT[ch] || k.ang === CHT[ch]) ? 'rgba(34,197,94,0.2)' : 'rgba(219,39,119,0.16)', C.ink, 3.5);
        const rr = Math.min(1.3, 0.42 * Math.min(dist(A, B), dist(B, Cc), dist(Cc, A)));
        const cols = [C.pink, C.royal, C.tang];
        if (task === 'angle-sum') {
          const wa = wedgePts(A, B, Cc, rr), wb = wedgePts(B, A, Cc, rr), wc = wedgePts(Cc, A, B, rr);
          const mb = mid(A, B), mc = mid(A, Cc), rb = wb.map((p) => rotP(p, mb, 180 * proof)), rc = wc.map((p) => rotP(p, mc, 180 * proof));
          if (proof > 0) { const u = unit(sub(Cc, B)); s += G.line(sub(A, mul(u, 4.5)), add(A, mul(u, 4.5)), C.ink2, 2.5, 'stroke-dasharray="8 6"'); s += G.poly(wb, 'none', cols[1], 1.5, 'stroke-dasharray="4 4" opacity=".6"') + G.poly(wc, 'none', cols[2], 1.5, 'stroke-dasharray="4 4" opacity=".6"'); }
          [[wa, 0], [rb, 1], [rc, 2]].forEach(([w, j]) => { s += G.poly(w, cols[j], cols[j], 2, 'fill-opacity=".55"'); if (prot || proof > 0.99) { const c2 = lerpP(w[0], centroid(w.slice(1)), 1.25); s += G.text(c2, an[j] + '°', 'sh-sm'); } });
        } else if (task === 'exterior-angle') {
          const Dp = add(Cc, mul(unit(sub(Cc, B)), 3));
          s += G.line(Cc, Dp, C.ink, 3.5) + G.pt(Dp, 'D', C.ink, add(Dp, V(0, 1)));
          s += G.amark(B, A, Cc, { col: cols[0], rpx: 30, label: prot ? an[0] + '°' : '' }) + G.amark(A, B, Cc, { col: cols[1], rpx: 30, label: prot ? an[1] + '°' : '' });
          s += G.amark(A, Cc, Dp, { col: C.grape, rpx: 40, label: prot ? f1(180 - angs()[2]) + '°' : '', op: 0.4 }) + G.amark(A, Cc, B, { col: '#94A3B8', rpx: 22, op: 0.25 });
        } else if (task !== 'area') {
          s += G.amark(B, A, Cc, { col: cols[0], rpx: 30, label: prot ? an[0] + '°' : '' }) + G.amark(A, B, Cc, { col: cols[1], rpx: 30, label: prot ? an[1] + '°' : '' }) + G.amark(A, Cc, B, { col: cols[2], rpx: 30, label: prot ? an[2] + '°' : '' });
        }
        if (task === 'median-altitude') {
          const Ms = [mid(B, Cc), mid(Cc, A), mid(A, B)], Vs = [A, B, Cc], Gc = centroid([A, B, Cc]);
          if (med) {
            Ms.forEach((m, j) => { s += G.line(Vs[j], m, C.royal, 3) + G.dot(m, C.royal, 5); });
            s += G.ticks(B, Ms[0], 1, C.royal) + G.ticks(Ms[0], Cc, 1, C.royal) + G.pt(Gc, 'G', C.royal, add(Gc, V(0.6, -0.4)));
          }
          if (alt) {
            const sides = [[B, Cc], [Cc, A], [A, B]];
            const fs = Vs.map((v, j) => foot(v, sides[j][0], sides[j][1]));
            fs.forEach((f, j) => {
              const [p, q] = sides[j], t = dot(sub(f, p), unit(sub(q, p))) / dist(p, q);
              if (t < -1e-6) s += G.line(p, f, C.ink2, 2, 'stroke-dasharray="6 5"'); if (t > 1 + 1e-6) s += G.line(q, f, C.ink2, 2, 'stroke-dasharray="6 5"');
              s += G.line(Vs[j], f, C.grape, 3, 'stroke-dasharray="8 5"');
              if (dist(Vs[j], f) > 0.3) s += G.amark(Vs[j], f, dist(f, p) > 0.2 ? p : q, { col: C.grape, rpx: 14 });
            });
            const H = llx(A, sub(fs[0], A), B, sub(fs[1], B));
            if (H && H.x > TRI_BOX[0] && H.x < TRI_BOX[2] && H.y > TRI_BOX[1] && H.y < TRI_BOX[3]) s += G.pt(H, 'H', C.grape, add(H, V(-0.6, 0.4)));
          }
        }
        if (ruler && task !== 'area') { s += G.slen(B, Cc, f1(dist(B, Cc)) + ' ' + tt(W.cm), o) + G.slen(Cc, A, f1(dist(Cc, A)) + ' ' + tt(W.cm), o) + G.slen(A, B, f1(dist(A, B)) + ' ' + tt(W.cm), o); }
        if (task === 'classify' && ruler) { const ss = k.s; if (ss[0] === ss[1] || ss[0] === ss[2]) s += G.ticks(B, Cc, 1, C.pink); if (ss[1] === ss[0] || ss[1] === ss[2]) s += G.ticks(Cc, A, 1, C.pink); if (ss[2] === ss[0] || ss[2] === ss[1]) s += G.ticks(A, B, 1, C.pink); }
        s += G.handle('drag:A', A, C.pink, tt(W.drag) + ' A', 'A', o) + G.handle('drag:B', B, C.royal, tt(W.drag) + ' B', 'B', o) + G.handle('drag:C', Cc, C.tang, tt(W.drag) + ' C', 'C', o);
        return s;
      },
      read() {
        if (task === 'inequality') {
          const row = (x, y, z, nx, ny, nz) => { const ok = x + y > z; return ctx.chip(`${nx} + ${ny} = ${fn(x)} + ${fn(y)} = ${fn(x + y)} ${ok ? '>' : '≯'} ${fn(z)} (${nz})`, ok ? 'ok' : 'no'); };
          const f = canForm();
          return row(ib, ic, ia, 'b', 'c', 'a') + row(ia, ic, ib, 'a', 'c', 'b') + row(ia, ib, ic, 'a', 'b', 'c') + `<p>${f ? tt(T('The arcs meet: a triangle can be made. Any two sides together are longer than the third.', 'चाप मिलते हैं: त्रिभुज बन सकता है। कोई भी दो भुजाएँ मिलकर तीसरी से लंबी हैं।')) : tt(T('The arcs do not meet above BC: no triangle. Two sides together must be longer than the third side.', 'चाप BC के ऊपर नहीं मिलते: त्रिभुज नहीं बनता। दो भुजाएँ मिलकर तीसरी भुजा से लंबी होनी चाहिए।'))}</p>`;
        }
        const k = triKinds(P), an = k.an;
        if (task === 'angle-sum') return prot || proof > 0.99 ? `<p class="sh-eq">∠A + ∠B + ∠C = ${an[0]}° + ${an[1]}° + ${an[2]}° = 180.0°</p>${proof > 0.99 ? `<p>${tt(T('The three corners fit together on a straight line through A, parallel to BC. A straight angle is 180°, so the angles of every triangle add up to 180°.', 'तीनों कोने A से होकर BC के समांतर सीधी रेखा पर एक साथ बैठ जाते हैं। ऋजु कोण 180° का होता है, इसलिए हर त्रिभुज के कोणों का योग 180° होता है।'))}</p>` : ''}` : `<p>${tt(T('Tap the protractor to measure the three angles.', 'तीनों कोण मापने के लिए चाँदे पर टैप करो।'))}</p>`;
        if (task === 'classify') return ctx.chip(tt(T('By sides: ', 'भुजाओं से: ')) + tt(SIDEK[k.side]), 'big') + ctx.chip(tt(T('By angles: ', 'कोणों से: ')) + tt(ANGK[k.ang]), 'big') + `<p>${ch < CHT.length ? tt(T('Now make: ', 'अब बनाओ: ')) + '<b>' + tt(SIDEK[CHT[ch]] || ANGK[CHT[ch]]) + ' ' + tt(T('triangle', 'त्रिभुज')) + '</b>' + (SIDEW[CHT[ch]] ? ' (' + tt(SIDEW[CHT[ch]]) + ')' : CHT[ch] === 'right' ? ' (' + tt(T('one angle 90°', 'एक कोण 90°')) + ')' : ' (' + tt(T('one angle more than 90°', 'एक कोण 90° से बड़ा')) + ')') : tt(T('You made every kind!', 'तुमने हर प्रकार का त्रिभुज बना लिया!'))}</p>`;
        if (task === 'exterior-angle') { const e = f1(180 - angs()[2]); return prot ? `<p class="sh-eq">∠ACD = ${e}° = ∠A + ∠B = ${an[0]}° + ${an[1]}°</p><p>${tt(T('An exterior angle equals the sum of the two interior opposite angles.', 'बहिष्कोण, सामने के दोनों अंतः कोणों के योग के बराबर होता है।'))}</p>` : `<p>${tt(T('Tap the protractor to measure the angles.', 'कोण मापने के लिए चाँदे पर टैप करो।'))}</p>`; }
        if (task === 'median-altitude') {
          const Ma = mid(P.B, P.C), Gc = centroid([P.A, P.B, P.C]);
          let s = '';
          if (med) s += ctx.chip(`BM = MC = ${f1(dist(P.B, Ma))} ${tt(W.cm)}`) + ctx.chip(`AG : GM = ${f2(dist(P.A, Gc) / dist(Gc, Ma))} : 1`);
          if (alt) s += ctx.chip(tt(k.ang === 'acute' ? T('Altitudes meet inside', 'शीर्षलंब भीतर मिलते हैं') : k.ang === 'right' ? T('Altitudes meet at the right-angle corner', 'शीर्षलंब समकोण वाले कोने पर मिलते हैं') : T('Altitudes meet outside', 'शीर्षलंब बाहर मिलते हैं')));
          return s + `<p>${tt(T('A median joins a corner to the middle of the opposite side. An altitude goes from a corner to the opposite side at 90°.', 'माध्यिका कोने को सामने की भुजा के मध्य-बिंदु से मिलाती है। शीर्षलंब कोने से सामने की भुजा पर 90° पर जाता है।'))}</p>`;
        }
        const a = dist(P.B, P.C), h = dist(P.A, foot(P.A, P.B, P.C));
        return ruler ? `<p class="sh-eq">${tt(T('Area', 'क्षेत्रफल'))} = ½ × ${f1(a)} × ${f1(h)} = ${f1(Math.abs(area([P.A, P.B, P.C])))} ${tt(W.cm)}²</p><p>${tt(T('The triangle is exactly half of the dashed rectangle with the same base and height.', 'त्रिभुज, उसी आधार और ऊँचाई वाले बिंदुदार आयत का ठीक आधा है।'))}</p>` : `<p>${tt(T('Tap the ruler to measure the base and the height.', 'आधार और ऊँचाई मापने के लिए रूलर पर टैप करो।'))}</p>`;
      },
    };
  }

  // ================================================================ mode: quadrilateral
  const QBOX = [-1.5, -1.5, 10.5, 6.9];
  const QNAME = { square: T('Square', 'वर्ग'), rectangle: T('Rectangle', 'आयत'), rhombus: T('Rhombus', 'समचतुर्भुज'), parallelogram: T('Parallelogram', 'समांतर चतुर्भुज'), trapezium: T('Trapezium', 'समलंब'), kite: T('Kite', 'पतंग'), general: T('Quadrilateral', 'चतुर्भुज') };
  const QPROP = {
    diagBisect: T('The diagonals cut each other in half', 'विकर्ण एक-दूसरे को समद्विभाजित करते हैं'), diagEqual: T('The diagonals are equal', 'विकर्ण बराबर होते हैं'),
    diagPerp: T('The diagonals meet at 90°', 'विकर्ण 90° पर मिलते हैं'), allSides: T('All four sides are equal', 'चारों भुजाएँ बराबर होती हैं'),
    all90: T('All four angles are 90°', 'चारों कोण 90° के होते हैं'), onePair: T('Only one pair of sides is parallel', 'भुजाओं का केवल एक युग्म समांतर होता है'),
    noRight: T('No angle is 90°', 'कोई कोण 90° का नहीं होता'), somePar: T('At least one pair of opposite sides is parallel', 'आमने-सामने की भुजाओं का कम से कम एक युग्म समांतर होता है'),
    oppPar: T('Both pairs of opposite sides are parallel', 'आमने-सामने की भुजाओं के दोनों युग्म समांतर होते हैं'),
  };
  const QASK = { parallelogram: ['diagBisect', 'diagEqual', 'diagPerp'], rectangle: ['diagEqual', 'diagPerp', 'allSides'], square: ['diagPerp', 'onePair', 'noRight'], rhombus: ['diagPerp', 'diagEqual', 'all90'], trapezium: ['somePar', 'diagEqual', 'allSides'], kite: ['diagPerp', 'diagEqual', 'oppPar'] };
  function quadInfo(Q) {
    const { A, B, C: Cc, D } = Q, pts = [A, B, Cc, D];
    const sg = Math.sign(area(pts));
    const ang = pts.map((v, i) => { const u = pts[(i + 3) % 4], w = pts[(i + 1) % 4], a = angAt(u, v, w); return Math.sign(crs(sub(v, u), sub(w, v))) === sg ? a : 360 - a; });
    const an = roundSum(ang, 360);
    const sd = [dist(A, B), dist(B, Cc), dist(Cc, D), dist(D, A)].map(f1);
    const par = (p, q, r, t) => { const d = Math.abs(n360(dirA(p, q) - dirA(r, t)) % 180); return Math.min(d, 180 - d) < 0.5; };
    const p1 = par(A, B, D, Cc), p2 = par(B, Cc, A, D);
    const dAC = dist(A, Cc), dBD = dist(B, D), dd = Math.abs(n360(dirA(A, Cc) - dirA(B, D)) % 180);
    const props = {
      oppPar: p1 && p2, oppEq: sd[0] === sd[2] && sd[1] === sd[3], allSides: sd.every((x) => x === sd[0]), all90: an.every((x) => x === '90.0'),
      diagEqual: f1(dAC) === f1(dBD), diagBisect: dist(mid(A, Cc), mid(B, D)) < 0.05, diagPerp: Math.abs(dd - 90) < 0.5,
    };
    const convex = ang.every((a) => a < 180);
    const kite = convex && !props.allSides && ((sd[0] === sd[3] && sd[1] === sd[2]) || (sd[0] === sd[1] && sd[2] === sd[3]));
    const kind = props.oppPar ? (props.all90 && props.allSides ? 'square' : props.all90 ? 'rectangle' : props.allSides ? 'rhombus' : 'parallelogram') : p1 || p2 ? 'trapezium' : kite ? 'kite' : 'general';
    return { ang, an, sd, props, kind, convex, dAC, dBD, p1, p2 };
  }
  function mkQuad(ctx, task) {
    const G = ctx.G, tt = ctx.tt, typ = task === 'angle-sum' ? 'general' : task;
    const init = {
      general: [V(0.5, 0.5), V(7, 0), V(8.5, 4.5), V(2, 5)], parallelogram: [V(0.5, 0.5), V(6.5, 0.5), V(8.5, 4.5), V(2.5, 4.5)],
      rectangle: [V(1, 0.5), V(7.5, 0.5), V(7.5, 4.5), V(1, 4.5)], square: [V(2.2, 0.2), V(6.7, 0.2), V(6.7, 4.7), V(2.2, 4.7)],
      rhombus: [V(0.5, 0.5), V(5.5, 0.5), add(V(5.5, 0.5), polar(V(0, 0), 5, 55)), add(V(0.5, 0.5), polar(V(0, 0), 5, 55))],
      trapezium: [V(0.5, 0.5), V(8.5, 0.5), V(6, 4.5), V(2.5, 4.5)], kite: [V(4.5, 5.8), V(7, 4.2), V(4.5, -0.8), V(2, 4.2)],
    }[typ];
    let Q = { A: init[0], B: init[1], C: init[2], D: init[3] };
    let ruler = false, prot = false, diag = false, proof = 0;
    let tz = dist(Q.D, Q.C);
    const cB = (p) => V(clamp(p.x, QBOX[0] + 0.3, QBOX[2] - 0.3), clamp(p.y, QBOX[1] + 0.3, QBOX[3] - 0.3));
    const inBox = (p) => p.x >= QBOX[0] && p.x <= QBOX[2] && p.y >= QBOX[1] && p.y <= QBOX[3];
    const sang = (u, v) => { let a = n360(deg(Math.atan2(crs(u, v), dot(u, v)))); return a > 180 ? a - 360 : a; };
    function solve(nm, p) {
      const N = Object.assign({}, Q);
      const { A, B } = N;
      if (typ === 'general') N[nm] = p;
      else if (typ === 'parallelogram') {
        N[nm] = p;
        const opp = { A: 'C', B: 'D', C: 'A', D: 'B' }[nm], nb = { A: ['B', 'D'], B: ['A', 'C'], C: ['B', 'D'], D: ['A', 'C'] }[nm];
        N[opp] = sub(add(N[nb[0]], N[nb[1]]), p);
      } else if (typ === 'rectangle') {
        let h = dot(sub(Q.D, Q.A), perp(unit(sub(Q.B, Q.A))));
        if (nm === 'A' || nm === 'B') N[nm] = p; else h = dot(sub(p, N.A), perp(unit(sub(N.B, N.A))));
        if (Math.abs(h) < 0.8) return null;
        const n = perp(unit(sub(N.B, N.A)));
        N.D = add(N.A, mul(n, h)); N.C = add(N.B, mul(n, h));
      } else if (typ === 'square') {
        if (nm === 'A' || nm === 'B') { N[nm] = p; const w = sub(N.B, N.A); N.C = add(N.B, perp(w)); N.D = add(N.A, perp(w)); }
        else if (nm === 'C') { N.C = p; const w = mul(perp(sub(p, N.B)), -1); N.A = sub(N.B, w); N.D = add(N.A, perp(w)); }
        else { N.D = p; const w = mul(perp(sub(p, N.A)), -1); N.B = add(N.A, w); N.C = add(N.B, perp(w)); }
      } else if (typ === 'rhombus') {
        let s = dist(Q.A, Q.B), al = sang(sub(Q.B, Q.A), sub(Q.D, Q.A));
        if (nm === 'A' || nm === 'B') { N[nm] = p; s = dist(N.A, N.B); }
        else if (nm === 'D') al = sang(sub(N.B, N.A), sub(p, N.A));
        else al = 2 * sang(sub(N.B, N.A), sub(p, N.A));
        if (Math.abs(al) < 20 || Math.abs(al) > 160) return null;
        N.D = add(N.A, mul(polar(V(0, 0), 1, dirA(N.A, N.B) + al), s)); N.C = sub(add(N.B, N.D), N.A);
      } else if (typ === 'trapezium') {
        let t = tz;
        if (nm === 'C') t = dot(sub(p, N.D), unit(sub(N.B, N.A))); else N[nm] = p;
        if (t < 0.8) return null;
        N.C = add(N.D, mul(unit(sub(N.B, N.A)), t)); tz = t;
      } else if (typ === 'kite') {
        N[nm] = p;
        if (nm === 'D') N.B = reflP(p, N.A, N.C); else N.D = reflP(N.B, N.A, N.C);
      }
      const pts = [N.A, N.B, N.C, N.D];
      if (!pts.every(inBox) || segX(N.A, N.B, N.C, N.D) || segX(N.B, N.C, N.D, N.A) || Math.abs(area(pts)) < 1.5 || pts.some((v, i) => dist(v, pts[(i + 1) % 4]) < 0.8)) return null;
      return N;
    }
    const q0 = QASK[typ];
    function ask() {
      if (q0) ctx.ask({ q: T(`Drag the corners and watch the list. Which of these is true for every ${QNAME[typ].en.toLowerCase()}?`, `कोनों को खिसकाओ और सूची देखो। इनमें से कौन-सी बात हर ${QNAME[typ].hi} के लिए सही है?`), opts: q0.map((k) => QPROP[k]), ans: 0, seed: typ,
        why: T('It stays true however you drag the corners.', 'तुम कोनों को कैसे भी खिसकाओ, यह सही रहती है।'), hint: T('Drag the corners: a rule that is true for every one must never change to ✗.', 'कोनों को खिसकाओ: जो नियम हर एक के लिए सही है, वह कभी ✗ नहीं बनना चाहिए।') });
      else ctx.ask({ q: T('The four angles of a quadrilateral add up to…', 'चतुर्भुज के चारों कोणों का योग होता है…'), opts: ['360°', '180°', '270°', '540°'], ans: 0, seed: 'qs', why: T('A diagonal cuts it into two triangles: 180° + 180° = 360°.', 'एक विकर्ण इसे दो त्रिभुजों में बाँटता है: 180° + 180° = 360°।') });
    }
    return {
      title: task === 'angle-sum' ? T('Angle sum of a quadrilateral', 'चतुर्भुज के कोणों का योग') : QNAME[typ],
      how: typ === 'general' ? T('Drag any corner. Measure the angles and see what they add up to.', 'किसी भी कोने को खिसकाओ। कोण मापो और देखो कि उनका योग कितना है।') : T(`Drag the corners: the shape always stays a ${QNAME[typ].en.toLowerCase()}. Measure it and show the diagonals.`, `कोनों को खिसकाओ: आकृति हमेशा ${QNAME[typ].hi} रहती है। इसे मापो और विकर्ण दिखाओ।`),
      layout() { ctx.fit(QBOX, 26); },
      start() { ask(); },
      ctl() { return ctx.toolBtn('ruler', ruler) + ctx.toolBtn('protractor', prot) + ctx.btn('show:diagonals', T('Diagonals', 'विकर्ण'), { pressed: diag }) + (task === 'angle-sum' ? ctx.btn('prove', W.prove, { cls: 'main' }) : ''); },
      pos(nm) { return Q[nm]; },
      drag(nm, p) { const N = solve(nm, snapP(cB(p), 0.1)); if (N) { Q = N; proof = 0; } },
      dragEnd(nm, moved) {
        if (!moved) return;
        const I = quadInfo(Q);
        ctx.record(T(`Moved ${nm}: it is a ${QNAME[I.kind].en.toLowerCase()}`, `${nm} खिसकाया: यह ${QNAME[I.kind].hi} है`));
        if (prot) ctx.emit('measured:360');
        if (diag) ctx.emit('drawn');
      },
      click(key) {
        if (key === 'tool:ruler') { ruler = !ruler; if (ruler) ctx.emit('measured:' + f1(dist(Q.A, Q.B))); }
        else if (key === 'tool:protractor') { prot = !prot; if (prot) ctx.emit('measured:360'); }
        else if (key === 'show:diagonals') { diag = !diag; if (diag) ctx.emit('drawn'); }
        else if (key === 'prove') { proof = 0; ctx.anim(1400, (k) => { proof = k; }, () => { ctx.emit('proved'); ctx.api.celebrate(); }); }
        ctx.ctl();
      },
      svg() {
        const { A, B, C: Cc, D } = Q, pts = [A, B, Cc, D], I = quadInfo(Q), o = centroid(pts);
        let s = `<g opacity=".8">${G.grid(1, 5)}</g>`;
        s += G.poly(pts, 'rgba(37,99,235,0.13)', C.ink, 3.5);
        if (proof > 0) {
          const ref = I.ang.findIndex((a) => a > 180), useBD = ref === 1 || ref === 3;
          const [p, q] = useBD ? [B, D] : [A, Cc];
          const t1 = useBD ? [A, B, D] : [A, B, Cc], t2 = useBD ? [B, Cc, D] : [A, Cc, D];
          s += `<g opacity="${proof}">${G.poly(t1, 'rgba(219,39,119,0.25)', 'none', 0)}${G.poly(t2, 'rgba(255,122,26,0.25)', 'none', 0)}${G.line(p, q, C.pink, 3.5)}${G.text(centroid(t1), '180°', 'sh-md')}${G.text(centroid(t2), '180°', 'sh-md')}</g>`;
        }
        if (diag) {
          s += G.line(A, Cc, C.grape, 2.5, 'stroke-dasharray="8 5"') + G.line(B, D, C.grape, 2.5, 'stroke-dasharray="8 5"');
          const X = llx(A, sub(Cc, A), B, sub(D, B));
          if (X && I.convex) { s += G.dot(X, C.grape, 5); if (I.props.diagPerp) s += G.amark(Cc, X, B, { col: C.grape, rpx: 14 }); if (I.props.diagBisect) s += G.ticks(A, X, 2, C.grape) + G.ticks(X, Cc, 2, C.grape) + G.ticks(B, X, 3, C.grape) + G.ticks(X, D, 3, C.grape); }
        }
        const cols = [C.pink, C.royal, C.tang, C.turq];
        pts.forEach((v, i) => {
          const u = pts[(i + 3) % 4], w = pts[(i + 1) % 4];
          let a0 = dirA(v, w), d = n360(dirA(v, u) - a0);
          if ((d > 180) !== (I.ang[i] > 180)) { a0 = dirA(v, u); d = 360 - d; }
          s += G.amarkD(v, a0, d, { col: cols[i], rpx: 26, label: prot ? I.an[i] + '°' : '', lpx: 22 });
        });
        if (ruler) pts.forEach((v, i) => { s += G.slen(v, pts[(i + 1) % 4], I.sd[i], o); });
        if (ruler) { const sd = I.sd; pts.forEach((v, i) => { const k = sd.filter((x) => x === sd[i]).length; if (k > 1) s += G.ticks(v, pts[(i + 1) % 4], [...new Set(sd)].indexOf(sd[i]) + 1, C.pink); }); }
        ['A', 'B', 'C', 'D'].forEach((nm, i) => { s += G.handle('drag:' + nm, Q[nm], cols[i], tt(W.drag) + ' ' + nm, nm, o); });
        return s;
      },
      read() {
        const I = quadInfo(Q), pp = I.props, yn = (b, txt) => ctx.chip((b ? '✓ ' : '✗ ') + tt(txt), b ? 'ok' : 'no');
        let s = ctx.chip(tt(T('This is a: ', 'यह है: ')) + tt(QNAME[I.kind]) + (I.convex ? '' : ' (' + tt(T('concave', 'अवतल')) + ')'), 'big');
        if (prot) s += ctx.chip(`${I.an.join('° + ')}° = 360.0°`);
        s += yn(pp.oppPar, T('Opposite sides parallel', 'सम्मुख भुजाएँ समांतर')) + yn(pp.oppEq, T('Opposite sides equal', 'सम्मुख भुजाएँ बराबर')) + yn(pp.allSides, T('All sides equal', 'सभी भुजाएँ बराबर')) + yn(pp.all90, T('All angles 90°', 'सभी कोण 90°'));
        if (diag) s += yn(pp.diagEqual, T('Diagonals equal', 'विकर्ण बराबर')) + yn(pp.diagBisect, T('Diagonals bisect each other', 'विकर्ण एक-दूसरे को समद्विभाजित करते हैं')) + yn(pp.diagPerp, T('Diagonals at 90°', 'विकर्ण 90° पर'));
        else s += `<p>${tt(T('Tap “Diagonals” to test the diagonals too.', 'विकर्णों को भी जाँचने के लिए “विकर्ण” दबाओ।'))}</p>`;
        return s;
      },
    };
  }

  // ================================================================ mode: circle
  const CPART = {
    centre: [T('Centre', 'केंद्र'), T('The fixed point in the middle: every point of the circle is the same distance from it.', 'बीच का स्थिर बिंदु: वृत्त का हर बिंदु इससे बराबर दूरी पर है।')],
    radius: [T('Radius', 'त्रिज्या'), T('A line from the centre to the circle.', 'केंद्र से वृत्त तक की रेखा।')],
    diameter: [T('Diameter', 'व्यास'), T('A chord through the centre. It is 2 × the radius.', 'केंद्र से होकर जाने वाली जीवा। यह त्रिज्या का 2 गुना है।')],
    chord: [T('Chord', 'जीवा'), T('A line joining two points of the circle.', 'वृत्त के दो बिंदुओं को मिलाने वाली रेखा।')],
    arc: [T('Arc', 'चाप'), T('A part of the circle between two of its points.', 'वृत्त के दो बिंदुओं के बीच उसका एक भाग।')],
    sector: [T('Sector', 'त्रिज्यखंड'), T('The region between two radii and an arc.', 'दो त्रिज्याओं और एक चाप के बीच का भाग।')],
    segment: [T('Segment', 'वृत्तखंड'), T('The region between a chord and an arc.', 'एक जीवा और एक चाप के बीच का भाग।')],
    circumference: [T('Circumference', 'परिधि'), T('The distance all the way round the circle.', 'वृत्त के चारों ओर की दूरी।')],
  };
  const CPARTS = Object.keys(CPART);
  function mkCircle(ctx, task, given) {
    const G = ctx.G, tt = ctx.tt, O = V(0, 0);
    let r = (given.lengths || [])[0] || (['parts', 'circumference', 'area'].includes(task) ? 3 : 4);
    const ang = { 'angle-centre': { A: 210, B: 330, P: 100 }, semicircle: { P: 120 }, cyclic: { A: 200, B: 300, C: 30, D: 115 }, tangent: { P: 60 }, chord: { A: 205, B: 335 } }[task] || {};
    let E = V(r + 3.2, -1.2), qi = 0, shown = false, roll = 0, nsec = 12, rearr = 0;
    const thm = ['angle-centre', 'semicircle', 'cyclic', 'tangent', 'chord'].includes(task);
    const pt = (nm) => polar(O, r, ang[nm]);
    function askPart() {
      const p = CPARTS[qi], others = shuffle(CPARTS.filter((x) => x !== p), p).slice(0, 3);
      ctx.ask({ q: T('What is the part shown in pink called?', 'गुलाबी रंग में दिखाए गए भाग का नाम क्या है?'), opts: [p, ...others].map((x) => CPART[x][0]), ans: 0, seed: p, why: CPART[p][1], onRight: () => { shown = true; ctx.ctl(); } });
    }
    function centralSweep() {
      const a = n360(ang.B - ang.A), inArc = n360(ang.P - ang.A) < a;
      return inArc ? [ang.B, 360 - a] : [ang.A, a];
    }
    function okAngle(nm, a) {
      const others = Object.keys(ang).filter((k) => k !== nm).map((k) => ang[k]);
      if (task === 'semicircle') return Math.min(Math.abs(a - 0), Math.abs(a - 180), Math.abs(a - 360)) >= 6;
      if (task === 'cyclic') {
        const order = ['A', 'B', 'C', 'D'], i = order.indexOf(nm), pv = ang[order[(i + 3) % 4]], nx = ang[order[(i + 1) % 4]];
        const span = n360(nx - pv), at = n360(a - pv);
        return at >= 10 && at <= span - 10;
      }
      return others.every((b) => { const d = Math.abs(n360(a - b)); return Math.min(d, 360 - d) >= 8; });
    }
    function sectorSvg() {
      const w = 360 / nsec, c = 2 * r * Math.sin(rad(w / 2)), h = r * Math.cos(rad(w / 2)), x0 = -r, Y1 = h / 2;
      let s = '';
      for (let i = 0; i < nsec; i++) {
        const j = Math.floor(i / 2), even = i % 2 === 0;
        const ap = even ? V(x0 + j * c + c / 2, Y1) : V(x0 + (j + 1) * c, Y1 - h), bis1 = even ? -90 : 90, bis0 = i * w + w / 2;
        let db = n360(bis1 - bis0); if (db > 180) db -= 360;
        const k = rearr, apex = lerpP(O, ap, k), bis = bis0 + db * k;
        s += G.poly([apex].concat(G.arcPts(apex, r, bis - w / 2, bis + w / 2, 10)), even ? C.pink : C.royal, '#fff', 1.5, 'fill-opacity=".85"');
      }
      return s;
    }
    return {
      title: { parts: T('Parts of a circle', 'वृत्त के भाग'), circumference: T('Circumference of a circle', 'वृत्त की परिधि'), area: T('Area of a circle', 'वृत्त का क्षेत्रफल'), 'angle-centre': T('Angle at the centre', 'केंद्र पर बना कोण'), semicircle: T('Angle in a semicircle', 'अर्धवृत्त में कोण'), cyclic: T('Cyclic quadrilateral', 'चक्रीय चतुर्भुज'), tangent: T('Tangents to a circle', 'वृत्त की स्पर्श रेखाएँ'), chord: T('Perpendicular from the centre to a chord', 'केंद्र से जीवा पर लंब') }[task],
      how: {
        parts: T('Look at the pink part and choose its name. Change the radius with the slider.', 'गुलाबी भाग को देखो और उसका नाम चुनो। स्लाइडर से त्रिज्या बदलो।'),
        circumference: T('Choose a radius, then roll the wheel once round and see how far it goes.', 'त्रिज्या चुनो, फिर पहिये को एक पूरा चक्कर घुमाओ और देखो वह कितनी दूर जाता है।'),
        area: T('Cut the circle into sectors and rearrange them into a near-rectangle.', 'वृत्त को त्रिज्यखंडों में काटो और उन्हें लगभग आयत के रूप में जमाओ।'),
        'angle-centre': T('Drag A, B and P along the circle. Compare the angle at the centre with the angle at P.', 'A, B और P को वृत्त पर खिसकाओ। केंद्र पर बने कोण की तुलना P पर बने कोण से करो।'),
        semicircle: T('AB is a diameter. Drag P anywhere on the circle and watch angle APB.', 'AB एक व्यास है। P को वृत्त पर कहीं भी खिसकाओ और कोण APB देखो।'),
        cyclic: T('Drag the corners along the circle. Add the opposite angles.', 'कोनों को वृत्त पर खिसकाओ। सम्मुख कोणों को जोड़ो।'),
        tangent: T('Drag P on the circle and E outside it. Compare the two tangents from E.', 'P को वृत्त पर और E को बाहर खिसकाओ। E से खींची दोनों स्पर्श रेखाओं की तुलना करो।'),
        chord: T('Drag A and B along the circle. Watch where the perpendicular from O meets the chord.', 'A और B को वृत्त पर खिसकाओ। देखो कि O से डाला गया लंब जीवा से कहाँ मिलता है।'),
      }[task],
      layout() {
        if (task === 'circumference') ctx.fit([-r - 0.8, -1.6, 2 * PI * r + r + 0.8, 2 * r + 1], 26);
        else if (task === 'area') ctx.fit([-r - 0.6, -r - 0.6, Math.max(r + 0.6, -r + PI * r + 1.2), r + 0.6], 26);
        else if (task === 'tangent') ctx.fit([-r - 1, -r - 3.2, r + 7, r + 1.4], 26);
        else ctx.fit([-r - 1.6, -r - 1.4, r + 1.6, r + 1.4], 26);
      },
      start() { if (task === 'parts') askPart(); },
      ctl() {
        if (task === 'parts') return ctx.slider('radius', T('Radius', 'त्रिज्या'), 1.5, 4.5, 0.5, r, W.cm) + ctx.btn('next', W.next, { cls: 'main', disabled: !shown });
        if (task === 'circumference') return ctx.slider('radius', T('Radius', 'त्रिज्या'), 1, 4, 0.5, r, W.cm) + ctx.btn('roll', T('Roll the wheel', 'पहिया घुमाओ'), { cls: 'main' });
        if (task === 'area') return ctx.slider('sectors', T('Sectors', 'त्रिज्यखंड'), 4, 32, 2, nsec, '') + ctx.btn('rearrange', rearr > 0.5 ? T('Put back', 'वापस रखो') : T('Rearrange', 'नए ढंग से जमाओ'), { cls: 'main' });
        return '';
      },
      slider(nm, v) { if (nm === 'radius') { r = v; roll = 0; this.layout(); } if (nm === 'sectors') nsec = v; },
      sliderEnd() { ctx.emit('drawn'); },
      click(key) {
        if (key === 'next') { qi = (qi + 1) % CPARTS.length; shown = false; ctx.ctl(); askPart(); }
        else if (key === 'roll') { roll = 0; ctx.anim(2600, (k) => { roll = k; }, () => { ctx.emit('measured:' + f1(2 * PI * r)); ctx.record(T(`Rolled a wheel of radius ${fn(r)} cm: it went ${f1(2 * PI * r)} cm`, `${fn(r)} सेमी त्रिज्या का पहिया घुमाया: वह ${f1(2 * PI * r)} सेमी चला`)); }); }
        else if (key === 'rearrange') { const to = rearr > 0.5 ? 0 : 1, from = rearr; ctx.anim(1500, (k) => { rearr = from + (to - from) * L.ease(k); }, () => { ctx.ctl(); if (to === 1) { ctx.emit('proved'); ctx.api.celebrate(); } }); }
      },
      pos(nm) { return nm === 'E' ? E : pt(nm); },
      drag(nm, p) {
        if (nm === 'E') { const d = len(p); if (d >= r + 1 && p.x < r + 6.8 && p.x > -r - 0.8 && p.y > -r - 3 && p.y < r + 1.2) E = snapP(p, 0.1); return; }
        const a = Math.round(n360(dirA(O, p)));
        if (ang[nm] != null && okAngle(nm, a)) ang[nm] = a;
      },
      kstep: 10,
      dragEnd(nm, moved) {
        if (!moved || !thm) return;
        ctx.emit('proved');
        if (task === 'tangent') ctx.emit('measured:' + f1(Math.sqrt(Math.max(0, dot(E, E) - r * r))));
        if (task === 'chord') ctx.emit('measured:' + f1(dist(pt('A'), pt('B')) / 2));
        if (task === 'angle-centre') ctx.emit('measured:' + centralSweep()[1]);
      },
      svg() {
        let s = `<g opacity=".7">${G.grid(1, 0, '#EEF2FA')}</g>`;
        const faint = '#CBD5E1';
        if (task === 'circumference') {
          const L2 = 2 * PI * r, xc = L2 * roll, c = V(xc, r), turn = -360 * roll;
          s += G.line(V(-r - 0.6, 0), V(L2 + r + 0.6, 0), C.ink2, 3);
          s += G.line(V(0, 0), V(xc, 0), C.pink, 7);
          for (let k = 0; k <= Math.floor(L2); k++) s += G.line(V(k, 0), V(k, -0.25), C.ink2, 1.5) + (k % 2 === 0 || ctx.s > 30 ? G.text(V(k, -0.6), k, 'sh-sm', 0, 0, 'style="font-size:13px"') : '');
          s += G.line(V(L2, 0.4), V(L2, -0.35), C.grape, 2.5, 'stroke-dasharray="4 3"');
          s += G.circle(c, r, 'rgba(255,210,63,0.35)', C.ink, 3);
          if (roll < 1) s += G.pl(G.arcPts(c, r, 270 + turn, 270 + turn + 360 * (1 - roll), 90), C.pink, 7);
          for (let k = 0; k < 6; k++) s += G.line(c, polar(c, r * 0.92, turn + 90 + k * 60), '#B45309', 2.5);
          s += G.circle(c, 0.25, '#B45309', 'none', 0) + G.dot(polar(c, r, 270 + turn), C.pink, 7);
          s += G.line(V(-r - 0.4, 0), V(-r - 0.4, 2 * r), C.turq, 3) + G.text(V(-r - 0.4, r), 'd', 'sh-md', -14, 0);
          return s;
        }
        if (task === 'area') {
          if (rearr < 0.02) s += G.circle(O, r, 'none', C.ink, 2);
          s += sectorSvg();
          if (rearr > 0.98) {
            const w = 360 / nsec, c = 2 * r * Math.sin(rad(w / 2)), h = r * Math.cos(rad(w / 2)), x0 = -r, half = (nsec / 2) * c;
            s += G.line(V(x0, -h / 2 - 0.45), V(x0 + half + c / 2, -h / 2 - 0.45), C.grape, 2.5) + G.text(V(x0 + (half + c / 2) / 2, -h / 2 - 0.45), 'πr', 'sh-md', 0, 16);
            s += G.line(V(x0 + half + c / 2 + 0.35, -h / 2), V(x0 + half + c / 2 + 0.35, h / 2), C.turq, 2.5) + G.text(V(x0 + half + c / 2 + 0.35, 0), 'r', 'sh-md', 14, 0);
          }
          return s;
        }
        if (task === 'parts') {
          const on = shown ? null : CPARTS[qi], col = (k) => (k === on ? C.pink : faint), wd = (k) => (k === on ? 6 : 3);
          s += G.poly([O].concat(G.arcPts(O, r, 60, 110)), on === 'sector' ? 'rgba(219,39,119,0.55)' : 'rgba(203,213,225,0.35)', 'none', 0);
          s += G.poly(G.arcPts(O, r, 225, 315), on === 'segment' ? 'rgba(219,39,119,0.55)' : 'rgba(203,213,225,0.35)', 'none', 0);
          s += G.circle(O, r, 'none', on === 'circumference' ? C.pink : C.ink, on === 'circumference' ? 7 : 3);
          s += G.line(O, polar(O, r, 30), col('radius'), wd('radius')) + G.line(polar(O, r, 190), polar(O, r, 10), col('diameter'), wd('diameter'));
          s += G.line(polar(O, r, 225), polar(O, r, 315), col('chord'), wd('chord')) + G.pl(G.arcPts(O, r, 130, 170), on === 'arc' ? C.pink : C.ink, on === 'arc' ? 8 : 3);
          s += G.line(O, polar(O, r, 60), faint, 2) + G.line(O, polar(O, r, 110), faint, 2);
          s += `<circle cx="${G.X(0)}" cy="${G.Y(0)}" r="${on === 'centre' ? 11 : 6}" fill="${on === 'centre' ? C.pink : C.ink}" stroke="#fff" stroke-width="2"/>` + G.lab(O, 'O', V(0.3, 1), 22);
          if (shown) { const p = CPARTS[qi]; s += G.text(V(0, -r - 0.8), tt(CPART[p][0]), 'sh-nm', 0, 0, `fill="${C.pink}"`); }
          return s;
        }
        s += G.circle(O, r, 'rgba(255,253,247,0)', C.ink, 3.5) + G.pt(O, 'O', C.ink, V(-0.4, -1));
        const hd = (nm, col) => G.handle('drag:' + nm, pt(nm), col, tt(W.drag) + ' ' + nm, nm, O);
        if (task === 'angle-centre') {
          const A = pt('A'), B = pt('B'), P = pt('P'), [a0, sw] = centralSweep();
          s += G.poly([A, B, P], 'none', 'none', 0) + G.line(O, A, C.royal, 3) + G.line(O, B, C.royal, 3) + G.line(P, A, C.pink, 3) + G.line(P, B, C.pink, 3);
          s += G.pl(G.arcPts(O, r, a0, a0 + sw, 60), C.royal, 6, 'opacity=".45"');
          s += G.amarkD(O, a0, sw, { col: C.royal, rpx: 30, label: sw + '°', noRight: true }) + G.amark(A, P, B, { col: C.pink, rpx: 34, label: f1(angAt(A, P, B)) + '°', noRight: true });
          return s + hd('A', C.tang) + hd('B', C.tang) + hd('P', C.pink);
        }
        if (task === 'semicircle') {
          const A = polar(O, r, 180), B = polar(O, r, 0), P = pt('P');
          s += G.line(A, B, C.royal, 3.5) + G.poly([A, P, B], 'rgba(219,39,119,0.14)', C.pink, 3) + G.amark(A, P, B, { col: C.pink, rpx: 26, label: f1(angAt(A, P, B)) + '°' });
          return s + G.pt(A, 'A', C.ink, O) + G.pt(B, 'B', C.ink, O) + hd('P', C.pink);
        }
        if (task === 'cyclic') {
          const ps = ['A', 'B', 'C', 'D'].map(pt), cols = [C.pink, C.royal, C.pink, C.royal];
          s += G.poly(ps, 'rgba(37,99,235,0.12)', C.ink, 3);
          ps.forEach((v, i) => { s += G.amark(ps[(i + 3) % 4], v, ps[(i + 1) % 4], { col: cols[i], rpx: 28, label: f1(angAt(ps[(i + 3) % 4], v, ps[(i + 1) % 4])) + '°', noRight: true }); });
          return s + ['A', 'B', 'C', 'D'].map((nm, i) => hd(nm, cols[i])).join('');
        }
        if (task === 'tangent') {
          const P = pt('P'), u = perp(unit(P));
          s += G.line(sub(P, mul(u, 4)), add(P, mul(u, 4)), C.grape, 3) + G.line(O, P, C.ink2, 2.5) + G.amark(O, P, add(P, u), { col: C.grape, rpx: 16 });
          const d = len(E), base = dirA(O, E), al = deg(Math.acos(r / d)), T1 = polar(O, r, base + al), T2 = polar(O, r, base - al);
          s += G.line(E, T1, C.tang, 3.5) + G.line(E, T2, C.tang, 3.5) + G.line(O, T1, C.ink2, 2, 'stroke-dasharray="5 4"') + G.line(O, T2, C.ink2, 2, 'stroke-dasharray="5 4"');
          s += G.amark(O, T1, E, { col: C.tang, rpx: 14 }) + G.amark(O, T2, E, { col: C.tang, rpx: 14 }) + G.ticks(E, T1, 2, C.tang) + G.ticks(E, T2, 2, C.tang);
          s += G.pt(T1, 'Q', C.tang, O) + G.pt(T2, 'R', C.tang, O);
          return s + hd('P', C.grape) + G.handle('drag:E', E, C.tang, tt(W.drag) + ' E', 'E', O);
        }
        const A = pt('A'), B = pt('B'), Mf = foot(O, A, B);
        s += G.line(A, B, C.pink, 3.5) + G.line(O, Mf, C.royal, 3, 'stroke-dasharray="7 5"') + (dist(O, Mf) > 0.3 ? G.amark(O, Mf, B, { col: C.royal, rpx: 16 }) : '') + G.ticks(A, Mf, 1, C.pink) + G.ticks(Mf, B, 1, C.pink) + G.pt(Mf, 'M', C.royal, O);
        return s + hd('A', C.pink) + hd('B', C.pink);
      },
      read() {
        if (task === 'parts') return ctx.chip(`${tt(T('radius', 'त्रिज्या'))} r = ${f1(r)} ${tt(W.cm)}`) + ctx.chip(`${tt(T('diameter', 'व्यास'))} d = 2r = ${f1(2 * r)} ${tt(W.cm)}`) + ctx.chip(`${tt(T('circumference', 'परिधि'))} = 2πr = ${f1(2 * PI * r)} ${tt(W.cm)}`);
        if (task === 'circumference') return roll < 1 ? `<p>${tt(T(`Radius ${fn(r)} cm, so diameter d = ${fn(2 * r)} cm. Roll the wheel once round.`, `त्रिज्या ${fn(r)} सेमी, इसलिए व्यास d = ${fn(2 * r)} सेमी। पहिये को एक पूरा चक्कर घुमाओ।`))}</p>` : `<p class="sh-eq">C = ${f1(2 * PI * r)} ${tt(W.cm)} &nbsp; · &nbsp; d = ${f1(2 * r)} ${tt(W.cm)} &nbsp; · &nbsp; C ÷ d = ${f2(PI)}</p><p>${tt(T('For every circle, circumference ÷ diameter is the same number, π ≈ 3.14. So C = πd = 2πr.', 'हर वृत्त में परिधि ÷ व्यास एक ही संख्या होती है, π ≈ 3.14। इसलिए C = πd = 2πr।'))}</p>`;
        if (task === 'area') return rearr > 0.98 ? `<p class="sh-eq">${tt(T('Area', 'क्षेत्रफल'))} ≈ πr × r = πr² = 3.14 × ${f1(r)}² ≈ ${f1(PI * r * r)} ${tt(W.cm)}²</p><p>${tt(T('The long side is half the circumference (πr) and the height is the radius (r). More sectors make it closer to a rectangle.', 'लंबी भुजा परिधि की आधी (πr) है और ऊँचाई त्रिज्या (r) है। ज़्यादा त्रिज्यखंडों से यह आयत के और पास आता है।'))}</p>` : `<p>${tt(T(`The circle is cut into ${nsec} equal sectors. Tap “Rearrange”.`, `वृत्त ${nsec} बराबर त्रिज्यखंडों में कटा है। “नए ढंग से जमाओ” दबाओ।`))}</p>`;
        if (task === 'angle-centre') { const [, sw] = centralSweep(), ip = angAt(pt('A'), pt('P'), pt('B')); return `<p class="sh-eq">∠AOB = ${sw}° = 2 × ∠APB = 2 × ${f1(ip)}°</p><p>${tt(T('The angle an arc makes at the centre is double the angle it makes at any point on the rest of the circle.', 'कोई चाप केंद्र पर जो कोण बनाता है, वह वृत्त के बाकी हिस्से के किसी भी बिंदु पर बने कोण का दोगुना होता है।'))}</p>`; }
        if (task === 'semicircle') return `<p class="sh-eq">∠APB = ${f1(angAt(polar(O, r, 180), pt('P'), polar(O, r, 0)))}°</p><p>${tt(T('The angle in a semicircle is always a right angle: the arc AB is half the circle (180°), and half of 180° is 90°.', 'अर्धवृत्त में बना कोण हमेशा समकोण होता है: चाप AB आधा वृत्त (180°) है और 180° का आधा 90° है।'))}</p>`;
        if (task === 'cyclic') { const ps = ['A', 'B', 'C', 'D'].map(pt), a = ps.map((v, i) => angAt(ps[(i + 3) % 4], v, ps[(i + 1) % 4])); return `<p class="sh-eq">∠A + ∠C = ${f1(a[0])}° + ${f1(a[2])}° = ${f1(a[0] + a[2])}° &nbsp; · &nbsp; ∠B + ∠D = ${f1(a[1])}° + ${f1(a[3])}° = ${f1(a[1] + a[3])}°</p><p>${tt(T('In a cyclic quadrilateral, opposite angles add up to 180°.', 'चक्रीय चतुर्भुज में सम्मुख कोणों का योग 180° होता है।'))}</p>`; }
        if (task === 'tangent') { const l = Math.sqrt(Math.max(0, dot(E, E) - r * r)); return ctx.chip('∠OPT = 90°', 'ok') + ctx.chip(`EQ = ER = ${f1(l)} ${tt(W.cm)}`, 'ok') + `<p>${tt(T('A tangent is at 90° to the radius at the point of contact. The two tangents from an outside point are equal in length.', 'स्पर्श रेखा, स्पर्श बिंदु पर त्रिज्या से 90° पर होती है। बाहर के किसी बिंदु से खींची दोनों स्पर्श रेखाएँ बराबर लंबी होती हैं।'))}</p>`; }
        const A = pt('A'), B = pt('B'), Mf = foot(O, A, B);
        return ctx.chip(`AM = ${f1(dist(A, Mf))} ${tt(W.cm)}`, 'ok') + ctx.chip(`MB = ${f1(dist(Mf, B))} ${tt(W.cm)}`, 'ok') + ctx.chip(`OM = ${f1(dist(O, Mf))} ${tt(W.cm)}`) + `<p>${tt(T('The perpendicular from the centre to a chord cuts the chord into two equal halves.', 'केंद्र से जीवा पर डाला गया लंब जीवा को दो बराबर भागों में बाँटता है।'))}</p>`;
      },
    };
  }

  // ================================================================ mode: construct (ruler and compass, step by step)
  const sayC = (X, extra) => T(`Compass: put its point on ${X} and draw ${extra ? extra.en : 'an arc'}.`, `परकार: उसकी नोक ${X} पर रखो और ${extra ? extra.hi : 'एक चाप'} खींचो।`);
  const sayJ = (X, Y) => T(`Ruler: tap ${X}, then ${Y}, to draw the line through them.`, `रूलर: ${X} पर, फिर ${Y} पर टैप करके उनसे होकर रेखा खींचो।`);
  const sayL = (X, Y, l) => T(`Ruler: tap ${X} to draw ${X}${Y} = ${fn(l)} cm.`, `रूलर: ${X} पर टैप करके ${X}${Y} = ${fn(l)} सेमी खींचो।`);
  const sayP = (X, a) => T(`Protractor: tap ${X} to mark ${fn(a)}° and draw the ray.`, `चाँदा: ${X} पर टैप करके ${fn(a)}° का निशान लगाओ और किरण खींचो।`);
  const ARC = (c, r, tg, sp) => {
    sp = sp || 18;
    const as = tg.map((t) => dirA(c, t)).sort((a, b) => a - b), out = [];
    as.forEach((a) => { const l = out[out.length - 1]; if (l && a - sp <= l.a1 + 4) l.a1 = a + sp; else out.push({ k: 'arc', c, r, a0: a - sp, a1: a + sp }); });
    return out;
  };
  const LN = (a, b, k1, k2, x) => { const d = sub(b, a); return Object.assign({ k: 'line', a: sub(a, mul(d, k1 || 0)), b: add(b, mul(d, k2 || 0)) }, x || {}); };
  const st = (tool, taps, say, objs, pts) => ({ tool, taps, say, objs, pts: pts || {} });
  const CONS = {
    segment: { t: T('A line segment of given length', 'दी गई लंबाई का रेखाखंड'), need: { lengths: [1] }, def: { lengths: [7.5] }, build(g) {
      const l = g.lengths[0], A = V(0, 0), B = V(l, 0);
      return { pts: { A }, objs: [], steps: [st('ruler', ['A'], sayL('A', 'B', l), [LN(A, B)], { B })], res: [['AB', fn(l) + ' cm']], val: fn(l), check: { ruler: [A, B] } };
    } },
    'circle-radius': { t: T('A circle of given radius', 'दी गई त्रिज्या का वृत्त'), need: { lengths: [1] }, def: { lengths: [3.5] }, build(g) {
      const r = g.lengths[0], O = V(0, 0), P = polar(O, r, 35);
      return { pts: { O }, objs: [], steps: [st('compass', ['O'], T(`Compass: open it to ${fn(r)} cm on the ruler. Put its point on O and turn it all the way round.`, `परकार: रूलर पर उसे ${fn(r)} सेमी खोलो। नोक O पर रखो और पूरा घुमाओ।`), [{ k: 'arc', c: O, r, a0: 0, a1: 360 }]), st('ruler', ['O'], T('Ruler: tap O to draw a radius OP and check it.', 'रूलर: O पर टैप करके त्रिज्या OP खींचो और जाँचो।'), [LN(O, P)], { P })], res: [['OP', fn(r) + ' cm']], val: fn(r), check: { ruler: [O, P] } };
    } },
    'perpendicular-bisector': { t: T('Perpendicular bisector of a line segment', 'रेखाखंड का लंब समद्विभाजक'), need: { lengths: [1] }, def: { lengths: [7] }, build(g) {
      const l = g.lengths[0], A = V(0, 0), B = V(l, 0), r = 0.7 * l, [P, Q] = ccx(A, r, B, r), M = V(l / 2, 0);
      const more = T('arcs above and below AB (open it to more than half of AB)', 'AB के ऊपर और नीचे चाप (उसे AB के आधे से ज़्यादा खोलो)');
      return { pts: { A, B }, objs: [LN(A, B)], steps: [st('compass', ['A'], sayC('A', more), ARC(A, r, [P, Q])), st('compass', ['B'], sayC('B', T('arcs with the same opening, cutting the first ones at P and Q', 'उसी खुलाव से चाप, जो पहले चापों को P और Q पर काटें')), ARC(B, r, [P, Q]), { P, Q }), st('ruler', ['P', 'Q'], sayJ('P', 'Q'), [LN(P, Q, 0.15, 0.15)], { M })],
        res: [['AM', f1(l / 2) + ' cm'], ['MB', f1(l / 2) + ' cm'], ['∠PMB', '90°']], val: '90', check: { protractor: [M, B, P], ruler: [A, M] } };
    } },
    'perpendicular-at-point': { t: T('Perpendicular to a line at a point on it', 'रेखा के किसी बिंदु पर लंब'), need: {}, def: {}, build() {
      const P = V(0, 0), r1 = 2.5, r2 = 3.6, A = V(-r1, 0), B = V(r1, 0), Q = V(0, Math.sqrt(r2 * r2 - r1 * r1));
      return { pts: { P }, objs: [LN(V(-5, 0), V(5, 0))], steps: [st('compass', ['P'], sayC('P', T('arcs that cut the line at A and B', 'चाप जो रेखा को A और B पर काटें')), ARC(P, r1, [A, B]), { A, B }), st('compass', ['A'], sayC('A', T('an arc above the line (open it wider)', 'रेखा के ऊपर एक चाप (उसे और खोलो)')), ARC(A, r2, [Q])), st('compass', ['B'], sayC('B', T('an arc with the same opening, cutting the first at Q', 'उसी खुलाव से चाप, जो पहले वाले को Q पर काटे')), ARC(B, r2, [Q]), { Q }), st('ruler', ['P', 'Q'], sayJ('P', 'Q'), [LN(P, Q, 0, 0.3)])],
        res: [['∠QPB', '90°']], val: '90', check: { protractor: [P, B, Q] } };
    } },
    'perpendicular-from-point': { t: T('Perpendicular from a point to a line', 'बिंदु से रेखा पर लंब'), need: { lengths: [1] }, def: { lengths: [3] }, build(g) {
      const d = g.lengths[0], P = V(0, d), r1 = d + 1.5, x = Math.sqrt(r1 * r1 - d * d), A = V(-x, 0), B = V(x, 0), Q = V(0, -d), M = V(0, 0);
      return { pts: { P }, objs: [LN(V(-x - 2, 0), V(x + 2, 0))], steps: [st('compass', ['P'], sayC('P', T('an arc that cuts the line at A and B', 'एक चाप जो रेखा को A और B पर काटे')), ARC(P, r1, [A, B]), { A, B }), st('compass', ['A'], sayC('A', T('an arc below the line', 'रेखा के नीचे एक चाप')), ARC(A, r1, [Q])), st('compass', ['B'], sayC('B', T('an arc with the same opening, cutting the first at Q', 'उसी खुलाव से चाप, जो पहले वाले को Q पर काटे')), ARC(B, r1, [Q]), { Q }), st('ruler', ['P', 'Q'], sayJ('P', 'Q'), [LN(P, Q)], { M })],
        res: [['PM', f1(d) + ' cm'], ['∠PMB', '90°']], val: '90', check: { protractor: [M, B, P], ruler: [M, P] } };
    } },
    'parallel-line': { t: T('A line parallel to a given line through a point', 'किसी बिंदु से दी गई रेखा के समांतर रेखा'), need: { lengths: [1] }, def: { lengths: [3] }, build(g) {
      const h = g.lengths[0], Q = V(0, 0), P = V(0.6 * h + 0.6, h), u = unit(sub(P, Q)), r = Math.min(2, 0.6 * dist(P, Q));
      const E = add(Q, V(r, 0)), F = add(Q, mul(u, r)), Gp = add(P, mul(u, r)), H = add(P, V(r, 0)), phi = dirA(Q, P);
      return { pts: { P, Q }, objs: [LN(V(-3, 0), V(8, 0))], steps: [
        st('ruler', ['Q', 'P'], sayJ('Q', 'P'), [LN(Q, P, 0.15, 0.9)]),
        st('compass', ['Q'], sayC('Q', T('an arc that cuts line l at E and line QP at F', 'एक चाप जो रेखा l को E पर और रेखा QP को F पर काटे')), [{ k: 'arc', c: Q, r, a0: -12, a1: phi + 12 }], { E, F }),
        st('compass', ['P'], sayC('P', T('an arc with the same opening, cutting PQ extended at G', 'उसी खुलाव से चाप, जो बढ़ाई गई PQ को G पर काटे')), [{ k: 'arc', c: P, r, a0: -12, a1: phi + 12 }], { G: Gp }),
        st('compass', ['G'], T('Compass: open it to the distance EF. Put its point on G and cut the arc at H.', 'परकार: उसे E से F की दूरी तक खोलो। नोक G पर रखो और चाप को H पर काटो।'), ARC(Gp, dist(E, F), [H], 14), { H }),
        st('ruler', ['P', 'H'], sayJ('P', 'H'), [LN(P, H, 1.8, 2.6)])],
        res: [['∠GPH = ∠FQE', fn(Math.round(phi * 10) / 10) + '°'], [T('distance', 'दूरी'), f1(h) + ' cm']], val: f1(phi), check: { protractor: [P, H, Gp] } };
    } },
    'bisect-angle': { t: T('Bisect an angle', 'कोण को समद्विभाजित करो'), need: { angles: [1] }, def: { angles: [70] }, build(g) {
      const th = g.angles[0], O = V(0, 0), A = V(7, 0), B = polar(O, 7, th), r = 3, P = V(r, 0), Q = polar(O, r, th), r2 = Math.max(0.75 * dist(P, Q), 2.2);
      const t = r * Math.cos(rad(th / 2)) + Math.sqrt(r2 * r2 - Math.pow(r * Math.sin(rad(th / 2)), 2)), R = polar(O, t, th / 2);
      return { pts: { O, A, B }, objs: [LN(O, A), LN(O, B)], steps: [st('compass', ['O'], sayC('O', T('an arc that cuts both arms at P and Q', 'एक चाप जो दोनों भुजाओं को P और Q पर काटे')), [{ k: 'arc', c: O, r, a0: -8, a1: th + 8 }], { P, Q }), st('compass', ['P'], sayC('P', T('an arc inside the angle', 'कोण के भीतर एक चाप')), ARC(P, r2, [R])), st('compass', ['Q'], sayC('Q', T('an arc with the same opening, cutting the first at R', 'उसी खुलाव से चाप, जो पहले वाले को R पर काटे')), ARC(Q, r2, [R]), { R }), st('ruler', ['O', 'R'], sayJ('O', 'R'), [LN(O, R, 0, Math.max(0.1, 7.2 / t - 1))])],
        res: [['∠AOR', f1(th / 2) + '°'], ['∠ROB', f1(th / 2) + '°']], val: f1(th / 2), check: { protractor: [O, A, R] } };
    } },
  };
  // the 60°, 120°, 30°, 90° and 45° angles share their first steps
  function angleCons(target) {
    const O = V(0, 0), A = V(7, 0), r = 3.6, P = V(r, 0), Q = polar(O, r, 60), R = polar(O, r, 120), r2 = 0.8 * r;
    const big = target === 60 || target === 30 ? 75 : 135;
    const steps = [st('compass', ['O'], sayC('O', T('a big arc that cuts OA at P', 'एक बड़ा चाप जो OA को P पर काटे')), [{ k: 'arc', c: O, r, a0: -8, a1: big }], { P }), st('compass', ['P'], sayC('P', T('an arc with the same opening, cutting the big arc at Q', 'उसी खुलाव से चाप, जो बड़े चाप को Q पर काटे')), ARC(P, r, [Q]), { Q })];
    let end;
    if (target === 60) end = Q;
    else if (target === 30) {
      const S = polar(O, r * Math.cos(rad(30)) + Math.sqrt(r2 * r2 - Math.pow(r * Math.sin(rad(30)), 2)), 30);
      steps.push(st('compass', ['P'], sayC('P', T('an arc between P and Q (open it a little less)', 'P और Q के बीच एक चाप (उसे थोड़ा कम खोलो)')), ARC(P, r2, [S])), st('compass', ['Q'], sayC('Q', T('an arc with the same opening, cutting it at S', 'उसी खुलाव से चाप, जो उसे S पर काटे')), ARC(Q, r2, [S]), { S }));
      end = S;
    } else {
      steps.push(st('compass', ['Q'], sayC('Q', T('an arc with the same opening, cutting the big arc at R', 'उसी खुलाव से चाप, जो बड़े चाप को R पर काटे')), ARC(Q, r, [R]), { R }));
      end = R;
      if (target === 90 || target === 45) {
        const S = V(0, r * Math.sin(rad(60)) + Math.sqrt(r2 * r2 - Math.pow(r * Math.cos(rad(60)), 2)));
        steps.push(st('compass', ['Q'], sayC('Q', T('an arc above, between Q and R (open it a little less)', 'ऊपर, Q और R के बीच एक चाप (उसे थोड़ा कम खोलो)')), ARC(Q, r2, [S])), st('compass', ['R'], sayC('R', T('an arc with the same opening, cutting it at S', 'उसी खुलाव से चाप, जो उसे S पर काटे')), ARC(R, r2, [S]), { S }));
        end = S;
      }
    }
    const endName = Object.keys(steps[steps.length - 1].pts)[0];
    if (target === 45) {
      const X = V(0, r), r3 = 0.85 * r, Y = polar(O, r * Math.cos(rad(45)) + Math.sqrt(r3 * r3 - Math.pow(r * Math.sin(rad(45)), 2)), 45);
      steps.push(st('ruler', ['O', endName], sayJ('O', endName), [LN(O, end, 0, 7 / len(end) - 1)], { X }));
      steps.push(st('compass', ['P'], sayC('P', T('an arc between P and X', 'P और X के बीच एक चाप')), ARC(P, r3, [Y])), st('compass', ['X'], sayC('X', T('an arc with the same opening, cutting it at Y', 'उसी खुलाव से चाप, जो उसे Y पर काटे')), ARC(X, r3, [Y]), { Y }));
      steps.push(st('ruler', ['O', 'Y'], sayJ('O', 'Y'), [LN(O, Y, 0, 7 / len(Y) - 1)]));
    } else steps.push(st('ruler', ['O', endName], sayJ('O', endName), [LN(O, end, 0, 7 / len(end) - 1)]));
    const last = target === 45 ? 'Y' : endName;
    return { pts: { O, A }, objs: [LN(O, A)], steps, res: [[`∠AO${last}`, target + '°']], val: String(target), check: { protractor: [O, A, target === 45 ? steps[steps.length - 1].objs[0].b : end] } };
  }
  [60, 120, 30, 90, 45].forEach((a) => { CONS['angle-' + a] = { t: T(`An angle of ${a}° with ruler and compass`, `रूलर और परकार से ${a}° का कोण`), need: {}, def: {}, build: () => angleCons(a) }; });
  Object.assign(CONS, {
    'triangle-sss': { t: T('Triangle from three sides (SSS)', 'तीन भुजाओं से त्रिभुज (SSS)'), need: { lengths: [3] }, def: { lengths: [6, 5, 4.5] }, build(g) {
      const [a, b, c] = g.lengths, B = V(0, 0), Cc = V(a, 0), A = ccx(B, c, Cc, b).find((p) => p.y > 0);
      return { pts: { B }, objs: [], steps: [st('ruler', ['B'], sayL('B', 'C', a), [LN(B, Cc)], { C: Cc }), st('compass', ['B'], T(`Compass: open it to ${fn(c)} cm. Put its point on B and draw an arc above BC.`, `परकार: उसे ${fn(c)} सेमी खोलो। नोक B पर रखो और BC के ऊपर चाप खींचो।`), ARC(B, c, [A])), st('compass', ['C'], T(`Compass: open it to ${fn(b)} cm. Put its point on C and cut the first arc at A.`, `परकार: उसे ${fn(b)} सेमी खोलो। नोक C पर रखो और पहले चाप को A पर काटो।`), ARC(Cc, b, [A]), { A }), st('ruler', ['A', 'B'], sayJ('A', 'B'), [LN(A, B)]), st('ruler', ['A', 'C'], sayJ('A', 'C'), [LN(A, Cc)])],
        res: [['AB', fn(c) + ' cm'], ['BC', fn(a) + ' cm'], ['CA', fn(b) + ' cm'], ['∠B', f1(angAt(A, B, Cc)) + '°']], val: f1(angAt(A, B, Cc)), check: { protractor: [B, Cc, A], ruler: [B, A] } };
    } },
    'triangle-sas': { t: T('Triangle from two sides and the angle between (SAS)', 'दो भुजाओं और उनके बीच के कोण से त्रिभुज (SAS)'), need: { lengths: [2], angles: [1] }, def: { lengths: [5, 6.5], angles: [60] }, build(g) {
      const [c, a] = g.lengths, aB = g.angles[0], B = V(0, 0), Cc = V(a, 0), A = polar(B, c, aB);
      return { pts: { B }, objs: [], steps: [st('ruler', ['B'], sayL('B', 'C', a), [LN(B, Cc)], { C: Cc }), st('protractor', ['B'], sayP('B', aB), [LN(B, polar(B, c + 1.8, aB))]), st('compass', ['B'], T(`Compass: open it to ${fn(c)} cm. Put its point on B and cut the ray at A.`, `परकार: उसे ${fn(c)} सेमी खोलो। नोक B पर रखो और किरण को A पर काटो।`), ARC(B, c, [A]), { A }), st('ruler', ['A', 'C'], sayJ('A', 'C'), [LN(A, Cc)])],
        res: [['AB', fn(c) + ' cm'], ['BC', fn(a) + ' cm'], ['∠B', fn(aB) + '°'], ['CA', f1(dist(A, Cc)) + ' cm']], val: f1(dist(A, Cc)), check: { ruler: [Cc, A] } };
    } },
    'triangle-asa': { t: T('Triangle from two angles and the side between (ASA)', 'दो कोणों और उनके बीच की भुजा से त्रिभुज (ASA)'), need: { lengths: [1], angles: [2] }, def: { lengths: [6.5], angles: [50, 65] }, build(g) {
      const a = g.lengths[0], [aB, aC] = g.angles, B = V(0, 0), Cc = V(a, 0), A = llx(B, polar(V(0, 0), 1, aB), Cc, polar(V(0, 0), 1, 180 - aC));
      return { pts: { B }, objs: [], steps: [st('ruler', ['B'], sayL('B', 'C', a), [LN(B, Cc)], { C: Cc }), st('protractor', ['B'], sayP('B', aB), [LN(B, polar(B, dist(A, B) + 1.3, aB))]), st('protractor', ['C'], T(`Protractor: tap C to mark ${fn(aC)}° and draw the ray. The two rays meet at A.`, `चाँदा: C पर टैप करके ${fn(aC)}° का निशान लगाओ और किरण खींचो। दोनों किरणें A पर मिलती हैं।`), [LN(Cc, polar(Cc, dist(A, Cc) + 1.3, 180 - aC))], { A })],
        res: [['BC', fn(a) + ' cm'], ['∠B', fn(aB) + '°'], ['∠C', fn(aC) + '°'], ['∠A', fn(180 - aB - aC) + '°']], val: fn(180 - aB - aC), check: { protractor: [A, B, Cc] } };
    } },
    'triangle-rhs': { t: T('Right triangle from hypotenuse and one side (RHS)', 'कर्ण और एक भुजा से समकोण त्रिभुज (RHS)'), need: { lengths: [2] }, def: { lengths: [7, 4.5] }, build(g) {
      const [h, s] = g.lengths, B = V(0, 0), Cc = V(s, 0), A = V(0, Math.sqrt(h * h - s * s));
      return { pts: { B }, objs: [], steps: [st('ruler', ['B'], sayL('B', 'C', s), [LN(B, Cc)], { C: Cc }), st('protractor', ['B'], sayP('B', 90), [LN(B, V(0, A.y + 1.5))]), st('compass', ['C'], T(`Compass: open it to ${fn(h)} cm (the hypotenuse). Put its point on C and cut the ray at A.`, `परकार: उसे ${fn(h)} सेमी (कर्ण) खोलो। नोक C पर रखो और किरण को A पर काटो।`), ARC(Cc, h, [A]), { A }), st('ruler', ['A', 'C'], sayJ('A', 'C'), [LN(A, Cc)])],
        res: [['∠B', '90°'], ['BC', fn(s) + ' cm'], ['AC', fn(h) + ' cm'], ['AB', f1(A.y) + ' cm']], val: f1(A.y), check: { ruler: [B, A] } };
    } },
    'divide-segment': { t: T('Divide a line segment in a given ratio', 'रेखाखंड को दिए गए अनुपात में बाँटो'), need: { lengths: [1], ratio: 1 }, def: { lengths: [7.5], ratio: [3, 2] }, build(g) {
      const l = g.lengths[0], [m, n] = g.ratio, k = m + n, A = V(0, 0), B = V(l, 0), u = clamp((0.85 * l) / k, 0.6, 1.4), dir = -35;
      const Ai = Array.from({ length: k + 1 }, (_, i) => polar(A, i * u, dir)), X = polar(A, k * u + 1, dir), Cc = V((l * m) / k, 0);
      const pts = {}; for (let i = 1; i <= k; i++) pts['A' + i] = Ai[i];
      return { pts: { A, B }, objs: [LN(A, B)], steps: [
        st('ruler', ['A'], T('Ruler: tap A to draw a ray AX going down at a slant.', 'रूलर: A पर टैप करके नीचे की ओर तिरछी किरण AX खींचो।'), [LN(A, X)], { X }),
        st('compass', ['A'], T(`Compass: keep one small opening and step it ${k} times along AX from A, marking A1 to A${k}.`, `परकार: एक छोटा खुलाव रखो और A से AX पर ${k} बार कदम रखते हुए A1 से A${k} तक निशान लगाओ।`), Ai.slice(1).map((p, i) => ({ k: 'arc', c: Ai[i], r: u, a0: dir - 14, a1: dir + 14 })), pts),
        st('ruler', ['A' + k, 'B'], sayJ('A' + k, 'B'), [LN(Ai[k], B)]),
        st('ruler', ['A' + m], T(`Ruler: tap A${m} to draw a line parallel to A${k}B. It meets AB at C.`, `रूलर: A${m} पर टैप करके A${k}B के समांतर रेखा खींचो। वह AB से C पर मिलती है।`), [LN(Ai[m], Cc, 0, 0.12)], { C: Cc })],
        res: [['AC', f1((l * m) / k) + ' cm'], ['CB', f1((l * n) / k) + ' cm'], ['AC : CB', `${m} : ${n}`]], val: f1((l * m) / k), check: { ruler: [A, Cc] } };
    } },
    'tangent-from-point': { t: T('Tangents to a circle from a point outside', 'बाहर के बिंदु से वृत्त पर स्पर्श रेखाएँ'), need: { lengths: [2] }, def: { lengths: [3, 7] }, build(g) {
      const [r, d] = g.lengths, O = V(0, 0), P = V(d, 0), r2 = 0.65 * d, [X, Y] = ccx(O, r2, P, r2), M = V(d / 2, 0), [Q, R] = ccx(O, r, M, d / 2), l = Math.sqrt(d * d - r * r);
      return { pts: { O, P }, objs: [{ k: 'arc', c: O, r, a0: 0, a1: 360 }], steps: [
        st('ruler', ['O', 'P'], sayJ('O', 'P'), [LN(O, P)]),
        st('compass', ['O'], sayC('O', T('arcs above and below OP (more than half of OP)', 'OP के ऊपर और नीचे चाप (OP के आधे से ज़्यादा)')), ARC(O, r2, [X, Y], 14)),
        st('compass', ['P'], sayC('P', T('arcs with the same opening, cutting them at X and Y', 'उसी खुलाव से चाप, जो उन्हें X और Y पर काटें')), ARC(P, r2, [X, Y], 14), { X, Y }),
        st('ruler', ['X', 'Y'], T('Ruler: tap X, then Y. The line cuts OP at its midpoint M.', 'रूलर: X पर, फिर Y पर टैप करो। रेखा OP को उसके मध्य-बिंदु M पर काटती है।'), [LN(X, Y)], { M }),
        st('compass', ['M'], T('Compass: open it to MO. Put its point on M and cut the circle at Q and R.', 'परकार: उसे MO तक खोलो। नोक M पर रखो और वृत्त को Q और R पर काटो।'), ARC(M, d / 2, [Q, R], 16), { Q, R }),
        st('ruler', ['P', 'Q'], sayJ('P', 'Q'), [LN(P, Q, 0, 0.3)]),
        st('ruler', ['P', 'R'], sayJ('P', 'R'), [LN(P, R, 0, 0.3)])],
        res: [['PQ', f1(l) + ' cm'], ['PR', f1(l) + ' cm'], ['∠OQP', '90°']], val: f1(l), check: { ruler: [P, Q] } };
    } },
  });

  const objPts = (G, o) => (o.k === 'line' ? [o.a, o.b] : G.arcPts(o.c, o.r, o.a0, o.a1, 24));
  function mkConstruct(ctx, task, given) {
    const G = ctx.G, tt = ctx.tt, def = CONS[task];
    const B = def.build(Object.assign({}, def.def, given));
    const usesProt = B.steps.some((s) => s.tool === 'protractor');
    let pts, objs, si, ti, tool, anim, done, chk;
    const reset = () => { pts = Object.assign({}, B.pts); objs = B.objs.map((o) => Object.assign({ given: 1 }, o)); si = 0; ti = 0; tool = null; anim = null; done = false; chk = null; };
    reset();
    const all = [].concat(Object.values(B.pts), ...B.objs.map((o) => objPts(G, o)), ...B.steps.map((s) => [].concat(Object.values(s.pts), ...s.objs.map((o) => objPts(G, o)))));
    const bb = [Math.min(...all.map((p) => p.x)) - 1, Math.min(...all.map((p) => p.y)) - 1, Math.max(...all.map((p) => p.x)) + 1, Math.max(...all.map((p) => p.y)) + 1];
    const mid0 = V((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2);
    const TOOLW = { ruler: W.ruler, compass: W.compass, protractor: W.protractor };
    // a small rough sketch of the finished figure (as in a notebook), drawn once
    const rough = (() => {
      const fin = Object.assign({}, B.pts), lines = B.objs.concat(...B.steps.map((s) => s.objs));
      B.steps.forEach((s) => Object.assign(fin, s.pts));
      const keep = Object.keys(fin).filter((k) => !/^[A-Z]\d/.test(k) || k === 'A' + (Object.keys(fin).filter((x) => /^A\d/.test(x)).length));
      const ps = Object.values(fin), x0 = Math.min(...ps.map((p) => p.x)) - 0.8, x1 = Math.max(...ps.map((p) => p.x)) + 0.8, y0 = Math.min(...ps.map((p) => p.y)) - 0.8, y1 = Math.max(...ps.map((p) => p.y)) + 0.8;
      const sc = Math.min(140 / (x1 - x0), 96 / (y1 - y0)), X = (x) => 5 + (x - x0) * sc + (140 - (x1 - x0) * sc) / 2, Y = (y) => 101 - (y - y0) * sc - (96 - (y1 - y0) * sc) / 2;
      let g = '';
      lines.forEach((o) => {
        if (o.k === 'line') g += `<line x1="${X(o.a.x).toFixed(1)}" y1="${Y(o.a.y).toFixed(1)}" x2="${X(o.b.x).toFixed(1)}" y2="${Y(o.b.y).toFixed(1)}" stroke="#334155" stroke-width="1.6" stroke-linecap="round"/>`;
        else if (o.a1 - o.a0 >= 359) g += `<circle cx="${X(o.c.x).toFixed(1)}" cy="${Y(o.c.y).toFixed(1)}" r="${(o.r * sc).toFixed(1)}" fill="none" stroke="#334155" stroke-width="1.6"/>`;
      });
      const c = V((x0 + x1) / 2, (y0 + y1) / 2);
      keep.forEach((k) => { const p = fin[k], u = unit(sub(p, c)); g += `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="2.6" fill="#DB2777"/><text x="${(X(p.x) + u.x * 9).toFixed(1)}" y="${(Y(p.y) - u.y * 9).toFixed(1)}" text-anchor="middle" dominant-baseline="central" style="font:800 10px var(--font-body);fill:#1E293B">${esc(k)}</text>`; });
      return `<div class="sh-rough"><svg viewBox="0 0 150 106" aria-hidden="true">${g}</svg>${tt(T('Rough sketch', 'कच्चा चित्र'))}</div>`;
    })();
    function runStep() {
      const s = B.steps[si], ms = s.tool === 'compass' ? 1000 + 280 * (s.objs.length - 1) : s.tool === 'protractor' ? 1500 : 900;
      anim = { s, k: 0 };
      ctx.anim(ms, (k) => { anim.k = k; }, () => {
        objs.push(...s.objs); Object.assign(pts, s.pts); anim = null; si++; ti = 0;
        ctx.emit('drawn');
        ctx.record(T(`Step ${si} done`, `चरण ${si} पूरा`));
        if (si === B.steps.length) { done = true; tool = null; ctx.ctl(); ctx.emit('constructed'); ctx.api.celebrate(); ctx.say(T('Done! Now check it.', 'हो गया! अब इसे जाँचो।')); }
      });
    }
    function drawObj(o, k) {
      const col = o.given ? C.ink : o.k === 'arc' ? C.grape : C.royal, w = o.given ? 3.5 : o.k === 'arc' ? 2.5 : 3;
      if (o.k === 'line') return G.line(o.a, lerpP(o.a, o.b, k == null ? 1 : k), col, w);
      return G.pl(G.arcPts(o.c, o.r, o.a0, o.a0 + (o.a1 - o.a0) * (k == null ? 1 : k)), col, w);
    }
    function protractorFor(q, p1, p2) {
      const base = dirA(q, p1), d = n360(dirA(q, p2) - base);
      return d > 180 ? G.protractor(q, base, 2.6, r1(360 - d), true) : G.protractor(q, base, 2.6, r1(d), false);
    }
    return {
      title: def.t,
      how: T('Pick the tool the step asks for, then tap the point. Follow the steps one by one.', 'चरण में माँगा गया औज़ार चुनो, फिर बिंदु पर टैप करो। चरणों को एक-एक करके करो।'),
      layout() { ctx.fit(bb, 30); },
      ctl() {
        const pr = (x) => (done ? chk === x : tool === x);
        return ctx.toolBtn('ruler', pr('ruler')) + ctx.toolBtn('compass', pr('compass')) + ctx.toolBtn('protractor', pr('protractor')) + ctx.btn('reset', W.again);
      },
      click(key) {
        if (key === 'reset') { reset(); ctx.ctl(); return; }
        if (key.startsWith('tool:')) {
          const x = key.slice(5);
          if (done) {
            const c = B.check[x];
            if (!c) { ctx.toast(T('Nothing to measure with this tool here. Try the other one.', 'यहाँ इस औज़ार से मापने को कुछ नहीं है। दूसरा औज़ार आज़माओ।')); return; }
            chk = chk === x ? null : x; ctx.ctl();
            if (chk) { ctx.emit('measured:' + B.val); ctx.record(T('Checked the construction', 'रचना की जाँच की')); }
            return;
          }
          tool = x; ctx.ctl();
          const need = B.steps[si].tool;
          if (x === 'protractor' && !usesProt) ctx.toast(T('In this construction only the ruler and the compass are allowed. Use the protractor at the end to check.', 'इस रचना में केवल रूलर और परकार की अनुमति है। अंत में जाँचने के लिए चाँदा लगाना।'));
          else if (x !== need) ctx.toast(T(`This step needs the ${TOOLW[need].en.toLowerCase()}.`, `इस चरण में ${TOOLW[need].hi} चाहिए।`));
          return;
        }
        if (key.startsWith('point:') && !done) {
          const nm = key.slice(6), s = B.steps[si];
          if (!tool) { ctx.toast(T(`First pick the ${TOOLW[s.tool].en.toLowerCase()}.`, `पहले ${TOOLW[s.tool].hi} चुनो।`)); ctx.api.nudge('tool:' + s.tool); return; }
          if (tool !== s.tool) { ctx.toast(T(`This step needs the ${TOOLW[s.tool].en.toLowerCase()}.`, `इस चरण में ${TOOLW[s.tool].hi} चाहिए।`)); return; }
          if (nm !== s.taps[ti]) { ctx.toast(T(`Put it on ${s.taps[ti]}.`, `इसे ${s.taps[ti]} पर रखो।`)); return; }
          ti++;
          if (ti === s.taps.length) runStep();
        }
      },
      svg() {
        let s = `<g opacity=".75">${G.grid(1, 5)}</g>`;
        objs.forEach((o) => { s += drawObj(o); });
        if (anim) {
          const st0 = anim.s, k = anim.k, n = st0.objs.length;
          if (st0.tool === 'compass') {
            const i = Math.min(n - 1, Math.floor(k * n)), kk = k * n - i;
            st0.objs.slice(0, i).forEach((o) => { s += drawObj(o); });
            const o = st0.objs[i];
            s += drawObj(o, kk) + G.compassG(o.c, polar(o.c, o.r, o.a0 + (o.a1 - o.a0) * kk));
          } else if (st0.tool === 'protractor') {
            const o = st0.objs[0], q = o.a, base = st0.taps[0] === 'B' ? 0 : 180, d = n360(dirA(q, o.b) - base);
            s += `<g opacity="${Math.min(1, k * 2.5)}">${d > 180 ? G.protractor(q, base, 2.4, r1(360 - d), true) : G.protractor(q, base, 2.4, r1(d), false)}</g>`;
            if (k > 0.5) s += drawObj(o, (k - 0.5) * 2);
          } else {
            const o = st0.objs[0];
            s += G.ruler(o.a, o.b, mid0) + drawObj(o, k);
          }
        }
        if (done && chk === 'protractor' && B.check.protractor) s += protractorFor(...B.check.protractor);
        if (done && chk === 'ruler' && B.check.ruler) { const [a, b] = B.check.ruler; s += G.ruler(a, b, mid0) + G.slen(a, b, f1(dist(a, b)) + ' ' + tt(W.cm), mid0, 44, 'sh-md'); }
        const want = !done && !anim && tool === (B.steps[si] || {}).tool ? B.steps[si].taps[ti] : null;
        const small = Object.keys(pts).length > 8;
        Object.keys(pts).forEach((nm) => {
          const p = pts[nm], x = G.X(p.x), y = G.Y(p.y);
          const ring = nm === want ? `<circle class="sh-pulse" cx="${x}" cy="${y}" r="15" fill="none" stroke="${C.pink}" stroke-width="3"/>` : '';
          s += G.tap('point:' + nm, `<circle class="sh-foc" cx="${x}" cy="${y}" r="22" fill="rgba(255,255,255,0.01)" stroke="none"/>${ring}<circle cx="${x}" cy="${y}" r="${nm === want ? 8 : 6}" fill="${nm === want ? C.pink : C.ink}" stroke="#fff" stroke-width="2"/>`, tt(T('Point ', 'बिंदु ')) + nm) + G.lab(p, nm, mid0, small && /\d/.test(nm) ? 17 : 22, small && /\d/.test(nm) ? 'sh-sm' : 'sh-nm');
        });
        return s;
      },
      read() {
        const li = B.steps.map((s, i) => `<li class="${i < si ? 'done' : i === si && !done ? 'now' : i === si + 1 ? '' : 'later'}"><span><b>${tt(TOOLW[s.tool])}</b> · ${tt(s.say).replace(/^[^:：]+:\s*/, '')}</span></li>`).join('');
        let r = `<div class="sh-build">${done ? '' : rough}<ol class="sh-steps">${li}</ol></div>`;
        if (done) r += B.res.map(([k, v]) => ctx.chip(`${tt(k)} = ${v.replace(' cm', ' ' + tt(W.cm))}`, 'ok')).join('') + `<p>${tt(T('Done! Tap the ruler or the protractor to check your construction.', 'हो गया! अपनी रचना जाँचने के लिए रूलर या चाँदे पर टैप करो।'))}</p>`;
        return r;
      },
    };
  }

  // ================================================================ mode: symmetry
  const SYM_DESIGNS = [
    { n: T('Butterfly', 'तितली'), col: C.pink, rows: ['...#.', '##..#', '###.#', '#####', '.####', '###.#', '##..#', '.....'] },
    { n: T('Rangoli', 'रंगोली'), col: C.tang, rows: ['....#', '...#.', '..#.#', '.#.##', '#.###', '.#.##', '..#.#', '...#.'] },
    { n: T('Rocket', 'रॉकेट'), col: C.royal, rows: ['....#', '...##', '..###', '...##', '...##', '..###', '.#..#', '#....'] },
  ];
  const SYM_SHAPES = [
    { n: T('Isosceles triangle', 'समद्विबाहु त्रिभुज'), p: [V(-2.4, -2.2), V(2.4, -2.2), V(0, 3)] },
    { n: T('Rectangle', 'आयत'), p: [V(-3, -1.8), V(3, -1.8), V(3, 1.8), V(-3, 1.8)] },
    { n: T('Square', 'वर्ग'), p: [V(-2.4, -2.4), V(2.4, -2.4), V(2.4, 2.4), V(-2.4, 2.4)] },
    { n: T('Equilateral triangle', 'समबाहु त्रिभुज'), p: regular(3, 3, 90, V(0, -0.4)) },
    { n: T('Rhombus', 'समचतुर्भुज'), p: [V(0, 3.1), V(2.1, 0), V(0, -3.1), V(-2.1, 0)] },
    { n: T('Parallelogram', 'समांतर चतुर्भुज'), p: [V(-3.1, -1.6), V(1.5, -1.6), V(3.1, 1.6), V(-1.5, 1.6)] },
    { n: T('Regular pentagon', 'सम पंचभुज'), p: regular(5, 3, 90) },
    { n: T('Regular hexagon', 'सम षट्भुज'), p: regular(6, 3, 0) },
    { n: T('Kite', 'पतंग'), p: [V(0, 3.2), V(1.8, 1.2), V(0, -3), V(-1.8, 1.2)] },
    { n: T('Scalene triangle', 'विषमबाहु त्रिभुज'), p: [V(-3, -2), V(2.6, -1.4), V(-0.8, 2.6)] },
  ];
  const blade = (k) => [V(0, 0), V(3.1, 0.5), V(2.2, 1.7)].map((p) => rotP(p, V(0, 0), 120 * k));
  const ROT_SHAPES = [
    { n: T('Square', 'वर्ग'), parts: [[V(-2.4, -2.4), V(2.4, -2.4), V(2.4, 2.4), V(-2.4, 2.4)]] },
    { n: T('Windmill', 'पवनचक्की'), parts: [blade(0), blade(1), blade(2)] },
    { n: T('Rectangle', 'आयत'), parts: [[V(-3, -1.7), V(3, -1.7), V(3, 1.7), V(-3, 1.7)]] },
    { n: T('Equilateral triangle', 'समबाहु त्रिभुज'), parts: [regular(3, 3, 90)] },
    { n: T('Letter Z', 'अक्षर Z'), parts: [[V(-2.2, 2.2), V(2.2, 2.2), V(2.2, 1.3), V(-0.7, -1.3), V(2.2, -1.3), V(2.2, -2.2), V(-2.2, -2.2), V(-2.2, -1.3), V(0.7, 1.3), V(-2.2, 1.3)]] },
    { n: T('Regular hexagon', 'सम षट्भुज'), parts: [regular(6, 3, 0)] },
    { n: T('Parallelogram', 'समांतर चतुर्भुज'), parts: [[V(-3.1, -1.6), V(1.5, -1.6), V(3.1, 1.6), V(-1.5, 1.6)]] },
  ];
  const sameSet = (a, b) => { const used = new Array(b.length).fill(false); return a.length === b.length && a.every((p) => { const j = b.findIndex((q, k) => !used[k] && dist(p, q) < 1e-6); if (j < 0) return false; used[j] = true; return true; }); };
  function symLines(pts) {
    const c = centroid(pts), dirs = [];
    pts.forEach((p, i) => { [p, mid(p, pts[(i + 1) % pts.length])].forEach((q) => { if (dist(q, c) < 1e-6) return; const a = n360(dirA(c, q)) % 180; if (!dirs.some((d) => Math.min(Math.abs(d - a), 180 - Math.abs(d - a)) < 1)) dirs.push(a); }); });
    return dirs.sort((a, b) => a - b).map((a) => { const b2 = add(c, polar(V(0, 0), 1, a)); return { c, a, ok: sameSet(pts.map((p) => reflP(p, c, b2)), pts) }; });
  }
  const rotOrder = (parts) => { const all = [].concat(...parts); for (let n = 12; n >= 1; n--) if (360 % n === 0 && sameSet(all.map((p) => rotP(p, V(0, 0), 360 / n)), all)) return n; return 1; };
  function mkSymmetry(ctx, task) {
    const G = ctx.G, tt = ctx.tt;
    let di = 0, cells = new Set(), fold = 0, verdict = null, si = 0, lines = [], seen = {}, foldL = null, fk = 0, turn = 0, fits = new Set();
    const prep = () => { if (task === 'lines') { lines = symLines(SYM_SHAPES[si].p); seen = {}; foldL = null; fk = 0; } };
    prep();
    function ask() {
      if (task === 'lines') {
        const n = lines.filter((l) => l.ok).length, opts = [...new Set([n, n + 1, n === 0 ? 2 : n - 1, n + 2])].slice(0, 4);
        ctx.ask({ q: T('How many lines of symmetry does this shape have? Tap the dashed lines to fold and test.', 'इस आकृति में सममिति की कितनी रेखाएँ हैं? मोड़कर जाँचने के लिए बिंदुदार रेखाओं पर टैप करो।'), opts: opts.map(String), ans: 0, seed: 'sl' + si,
          why: n ? T(`Folding along each of these ${n} lines makes the two halves match exactly.`, `इन ${n} रेखाओं में से हर एक पर मोड़ने से दोनों आधे भाग ठीक मिल जाते हैं।`) : T('No fold makes the two halves match.', 'किसी भी मोड़ से दोनों आधे भाग नहीं मिलते।'), onRight: () => ctx.ctl() });
      } else if (task === 'rotation') {
        const n = rotOrder(ROT_SHAPES[si].parts), opts = [...new Set([n, n + 1, n === 1 ? 3 : n - 1, n * 2])].slice(0, 4);
        ctx.ask({ q: T('In one full turn, how many times does the shape fit onto its outline? (its order of rotational symmetry)', 'एक पूरे चक्कर में आकृति कितनी बार अपनी रूपरेखा पर ठीक बैठती है? (घूर्णन सममिति का क्रम)'), opts: opts.map(String), ans: 0, seed: 'ro' + si,
          why: T(`It fits every ${360 / n}°, so ${n} times in 360°.`, `यह हर ${360 / n}° पर ठीक बैठती है, इसलिए 360° में ${n} बार।`), onRight: () => ctx.ctl() });
      } else ctx.ask(null);
    }
    const isDone = () => !!(ctx.qdone && ctx.qdone());
    return {
      title: { complete: T('Complete the mirror image', 'दर्पण प्रतिबिंब पूरा करो'), lines: T('Lines of symmetry', 'सममिति रेखाएँ'), rotation: T('Rotational symmetry', 'घूर्णन सममिति') }[task],
      how: { complete: T('Colour the squares on the right so that the picture matches its mirror image. Then fold along the mirror to check.', 'दाईं ओर के खाने रंगो ताकि चित्र अपने दर्पण प्रतिबिंब जैसा बने। फिर दर्पण रेखा पर मोड़कर जाँचो।'), lines: T('Tap a dashed line to fold the shape along it. Do the two halves match?', 'किसी बिंदुदार रेखा पर टैप करके आकृति को उस पर मोड़ो। क्या दोनों आधे भाग मिलते हैं?'), rotation: T('Turn the shape with the slider. Each time it fits its outline exactly, count it.', 'स्लाइडर से आकृति घुमाओ। जब भी वह अपनी रूपरेखा पर ठीक बैठे, उसे गिनो।') }[task],
      layout() { ctx.fit(task === 'complete' ? [-0.4, -0.4, 10.4, 8.4] : [-4.2, -4.2, 4.2, 4.2], 28); },
      start() { ask(); },
      ctl() {
        if (task === 'complete') return ctx.btn('mirror', T('Fold along the mirror', 'दर्पण रेखा पर मोड़ो'), { cls: 'main' }) + ctx.btn('next', T('Next picture', 'अगला चित्र'), { disabled: verdict !== true });
        if (task === 'rotation') return ctx.slider('turn', T('Turn', 'घुमाओ'), 0, 360, 15, turn, '°') + ctx.btn('next', W.next, { cls: 'main', disabled: !isDone() });
        return ctx.btn('next', W.next, { cls: 'main', disabled: !isDone() });
      },
      slider(nm, v) { turn = v; },
      sliderEnd() {
        const all = [].concat(...ROT_SHAPES[si].parts);
        if (turn > 0 && sameSet(all.map((p) => rotP(p, V(0, 0), turn)), all)) { fits.add(turn); ctx.emit('symmetric'); ctx.record(T(`It fits after ${turn}°`, `${turn}° पर ठीक बैठी`)); }
      },
      click(key, el) {
        if (key.startsWith('cell:')) {
          if (fold) { fold = 0; verdict = null; }
          const k = key.slice(5);
          if (cells.has(k)) cells.delete(k); else cells.add(k);
          ctx.emit('drawn'); ctx.ctl();
        } else if (key === 'mirror' && task === 'complete') {
          verdict = null;
          ctx.anim(1300, (k) => { fold = k; }, () => {
            const d = SYM_DESIGNS[di];
            let ok = true;
            for (let r = 0; r < 8; r++) for (let c = 0; c < 5; c++) if ((d.rows[r][c] === '#') !== cells.has(`${9 - c}-${r}`)) ok = false;
            verdict = ok; ctx.ctl();
            if (ok) { ctx.emit('symmetric'); ctx.api.celebrate(); ctx.record(T('Completed a symmetric picture', 'एक सममित चित्र पूरा किया')); }
            else ctx.record(T('The halves did not match yet', 'दोनों आधे अभी नहीं मिले'));
          });
        } else if (key === 'mirror' && task === 'lines') {
          const i = +el.dataset.axis, l = lines[i];
          foldL = i; seen[i] = true;
          ctx.anim(1100, (k) => { fk = k < 0.5 ? k * 2 : 2 - k * 2; }, () => { fk = 0; if (l.ok) { ctx.emit('symmetric'); ctx.api.celebrate(); } ctx.record(l.ok ? T('Found a line of symmetry', 'एक सममिति रेखा मिली') : T('That line is not a line of symmetry', 'वह सममिति रेखा नहीं है')); });
        } else if (key === 'next') {
          if (task === 'complete') { di = (di + 1) % SYM_DESIGNS.length; cells = new Set(); fold = 0; verdict = null; }
          else if (task === 'lines') { si = (si + 1) % SYM_SHAPES.length; prep(); ask(); }
          else { si = (si + 1) % ROT_SHAPES.length; turn = 0; fits = new Set(); ask(); }
          ctx.ctl();
        }
      },
      svg() {
        let s = '';
        if (task === 'complete') {
          const d = SYM_DESIGNS[di];
          s += `<g opacity=".9">${G.grid(1, 0, '#DCE3F1')}</g>`;
          for (let r = 0; r < 8; r++) for (let c = 0; c < 5; c++) if (d.rows[r][c] === '#') s += G.poly([V(c, 7 - r), V(c + 1, 7 - r), V(c + 1, 8 - r), V(c, 8 - r)], d.col, '#fff', 1.5);
          s += '<g class="sh-cells">';
          for (let r = 0; r < 8; r++) for (let c = 5; c < 10; c++) {
            const k = `${c}-${r}`, on = cells.has(k), want = d.rows[r][9 - c] === '#';
            const bad = verdict === false && on !== want;
            s += G.tap('cell:' + k, G.poly([V(c, 7 - r), V(c + 1, 7 - r), V(c + 1, 8 - r), V(c, 8 - r)], on ? d.col : 'rgba(255,255,255,0.01)', bad ? C.bad : on ? '#fff' : 'none', bad ? 3 : 1.5, 'class="sh-foc"'), tt(T(`Square, column ${c - 4}, row ${r + 1}`, `खाना, स्तंभ ${c - 4}, पंक्ति ${r + 1}`)) + (on ? ' ✓' : ''));
          }
          s += '</g>';
          if (fold > 0) {
            const sc = 1 - 2 * fold;
            for (let r = 0; r < 8; r++) for (let c = 0; c < 5; c++) if (d.rows[r][c] === '#') { const x0 = 5 + (c - 5) * sc, x1 = 5 + (c + 1 - 5) * sc; s += G.poly([V(x0, 7 - r), V(x1, 7 - r), V(x1, 8 - r), V(x0, 8 - r)], d.col, 'none', 0, `fill-opacity="${0.25 + 0.2 * (1 - fold)}"`); }
          }
          s += G.tap('mirror', `${G.line(V(5, -0.3), V(5, 8.3), 'rgba(255,255,255,0.01)', 24)}${G.line(V(5, -0.3), V(5, 8.3), C.grape, 4, 'stroke-dasharray="10 6"')}`, tt(T('Mirror line: tap to fold', 'दर्पण रेखा: मोड़ने के लिए टैप करो')));
          return s;
        }
        s += `<g opacity=".6">${G.grid(1, 0, '#EEF2FA')}</g>`;
        if (task === 'lines') {
          const sh = SYM_SHAPES[si], col = PAL[si % PAL.length];
          s += G.poly(sh.p, L.mixHex(col, '#FFFFFF', 0.55), C.ink, 3.5);
          if (foldL != null && fk > 0) { const l = lines[foldL], b2 = add(l.c, polar(V(0, 0), 1, l.a)); s += G.poly(sh.p.map((p) => lerpP(p, reflP(p, l.c, b2), fk)), col, l.ok ? C.good : C.bad, 2.5, 'fill-opacity=".45"'); }
          if (foldL != null && fk === 0 && !lines[foldL].ok) { const l = lines[foldL], b2 = add(l.c, polar(V(0, 0), 1, l.a)); s += G.poly(sh.p.map((p) => reflP(p, l.c, b2)), 'none', C.bad, 2.5, 'stroke-dasharray="6 5"'); }
          lines.forEach((l, i) => {
            const a = add(l.c, polar(V(0, 0), 4, l.a)), b = add(l.c, polar(V(0, 0), -4, l.a)), sc = seen[i] ? (l.ok ? C.good : C.bad) : C.grape;
            s += G.tap('mirror', `${G.line(a, b, 'rgba(255,255,255,0.01)', 22, 'class="sh-foc"')}${G.line(a, b, sc, seen[i] ? 4 : 3, seen[i] && l.ok ? '' : 'stroke-dasharray="9 7"')}`, tt(T(`Fold line ${i + 1}`, `मोड़ने की रेखा ${i + 1}`)), `data-axis="${i}"`);
          });
          return s;
        }
        const sh = ROT_SHAPES[si], col = PAL[(si + 2) % PAL.length], all = [].concat(...sh.parts), fit = turn > 0 && sameSet(all.map((p) => rotP(p, V(0, 0), turn)), all);
        sh.parts.forEach((p) => { s += G.poly(p, 'none', '#94A3B8', 2.5, 'stroke-dasharray="7 6"'); });
        sh.parts.forEach((p) => { s += G.poly(p.map((q) => rotP(q, V(0, 0), turn)), fit ? 'rgba(34,197,94,0.55)' : L.mixHex(col, '#FFFFFF', 0.35), C.ink, 3, 'fill-opacity=".85"'); });
        const mk = rotP(all[1], V(0, 0), turn);
        s += G.dot(mk, C.pink, 8) + G.dot(V(0, 0), C.ink, 5);
        return s;
      },
      read() {
        if (task === 'complete') {
          const d = SYM_DESIGNS[di];
          return ctx.chip(tt(d.n), 'big') + `<p>${verdict === true ? tt(T('Both halves match: the picture is symmetric about the mirror line.', 'दोनों आधे भाग मिलते हैं: चित्र दर्पण रेखा के सापेक्ष सममित है।')) : verdict === false ? tt(T('Not yet: the red squares do not match the other side. Fix them and fold again.', 'अभी नहीं: लाल खाने दूसरी ओर से मेल नहीं खाते। उन्हें ठीक करो और फिर मोड़ो।')) : tt(T('Each coloured square on the left must have a partner at the same distance on the right.', 'बाईं ओर के हर रंगीन खाने का दाईं ओर उतनी ही दूरी पर एक जोड़ीदार होना चाहिए।'))}</p>`;
        }
        if (task === 'lines') {
          const sh = SYM_SHAPES[si], found = lines.filter((l, i) => l.ok && seen[i]).length;
          return ctx.chip(tt(sh.n), 'big') + ctx.chip(tt(T('Lines found: ', 'मिली रेखाएँ: ')) + found, found ? 'ok' : '') + (foldL != null ? ctx.chip(lines[foldL].ok ? tt(T('Halves match', 'आधे भाग मिलते हैं')) : tt(T('Halves do not match', 'आधे भाग नहीं मिलते')), lines[foldL].ok ? 'ok' : 'no') : '');
        }
        return ctx.chip(tt(ROT_SHAPES[si].n), 'big') + ctx.chip(tt(T('Turned: ', 'घुमाया: ')) + turn + '°') + (fits.size ? ctx.chip(tt(T('It fitted at: ', 'ठीक बैठी: ')) + [...fits].sort((a, b) => a - b).map((x) => x + '°').join(', '), 'ok') : '');
      },
    };
  }

  // ================================================================ mode: congruence
  const RULES = ['SSS', 'SAS', 'ASA', 'AAS', 'RHS'];
  const RULEW = { SSS: T('SSS: three sides equal', 'SSS: तीनों भुजाएँ बराबर'), SAS: T('SAS: two sides and the angle between them', 'SAS: दो भुजाएँ और उनके बीच का कोण'), ASA: T('ASA: two angles and the side between them', 'ASA: दो कोण और उनके बीच की भुजा'), AAS: T('AAS: two angles and a side not between them', 'AAS: दो कोण और एक भुजा जो उनके बीच नहीं है'), RHS: T('RHS: right angle, hypotenuse and one side', 'RHS: समकोण, कर्ण और एक भुजा') };
  const CPARTS2 = { sss: { s: ['AB', 'BC', 'CA'], a: [] }, sas: { s: ['AB', 'BC'], a: ['B'] }, asa: { s: ['BC'], a: ['B', 'C'] }, aas: { s: ['BC'], a: ['A', 'B'] }, rhs: { s: ['CA', 'BC'], a: ['B'] }, aaa: { s: [], a: ['A', 'B', 'C'] }, ssa: { s: ['AB', 'CA'], a: ['B'] } };
  function congPlace(task, g) {
    const Ls = g.lengths || [];
    if (task === 'rhs') { const [h, s] = Ls.length ? Ls : [6.5, 3.9]; return { A: V(0, Math.sqrt(h * h - s * s)), B: V(0, 0), C: V(s, 0) }; }
    if (task === 'ssa') {
      const [c, b] = Ls.length ? Ls : [5.5, 4.2], aB = (g.angles || [40])[0], A = polar(V(0, 0), c, aB), w = Math.sqrt(b * b - A.y * A.y);
      return { A, B: V(0, 0), C: V(A.x + w, 0), C2: V(A.x - w, 0) };
    }
    const [a, b, c] = Ls.length ? Ls : [6, 4.8, 4], x = (c * c + a * a - b * b) / (2 * a);
    return { A: V(x, Math.sqrt(Math.max(0, c * c - x * x))), B: V(0, 0), C: V(a, 0) };
  }
  function mkCongruence(ctx, task, given) {
    const G = ctx.G, tt = ctx.tt, base = congPlace(task, given), congruentTask = RULES.includes(task.toUpperCase());
    let T1, home, T2, off = null, placed = false;
    function build() {
      const shift = (P, d) => ({ A: add(P.A, d), B: add(P.B, d), C: add(P.C, d) });
      const minx = Math.min(base.A.x, base.B.x, base.C.x);
      T1 = shift({ A: base.A, B: base.B, C: base.C }, V(0.4 - minx, 0.4));
      let S = { A: base.A, B: base.B, C: base.C };
      if (task === 'aaa') S = { A: mul(base.A, 1.35), B: base.B, C: mul(base.C, 1.35) };
      if (task === 'ssa') S = { A: base.A, B: base.B, C: base.C2 };
      const c0 = centroid([S.A, S.B, S.C]), rotA = task === 'sas' || task === 'rhs' ? 0 : 150, refl = task === 'sas' || task === 'asa' || task === 'rhs';
      const tf = (p) => { let q = sub(p, c0); if (refl) q = V(-q.x, q.y); return rotP(q, V(0, 0), rotA); };
      const R = { A: tf(S.A), B: tf(S.B), C: tf(S.C) }, b1 = [T1.A, T1.B, T1.C];
      const w1 = Math.max(...b1.map((p) => p.x)), h1 = Math.max(...b1.map((p) => p.y));
      const rs = [R.A, R.B, R.C], rx0 = Math.min(...rs.map((p) => p.x)), ry1 = Math.max(...rs.map((p) => p.y)), ry0 = Math.min(...rs.map((p) => p.y));
      const d = ctx.narrow ? V(0.4 - rx0, -1.2 - ry1) : V(w1 + 1.8 - rx0, 0.4 - ry0);
      home = { A: add(R.A, d), B: add(R.B, d), C: add(R.C, d) };
      T2 = Object.assign({}, home); placed = false;
      const all = b1.concat([home.A, home.B, home.C]);
      ctx.fit([Math.min(...all.map((p) => p.x)) - 1, Math.min(...all.map((p) => p.y)) - 1, Math.max(...all.map((p) => p.x)) + 1, Math.max(...all.map((p) => p.y)) + 1.1], 26);
    }
    const nm2 = { A: 'P', B: 'Q', C: 'R' };
    function marks(P, isT2) {
      const pp = CPARTS2[task], o = centroid([P.A, P.B, P.C]);
      let s = '';
      pp.s.forEach((sd, i) => { const a = P[sd[0]], b = P[sd[1]]; s += G.ticks(a, b, i + 1, C.pink) + G.slen(a, b, f1(dist(a, b)) + ' ' + tt(W.cm), o, 22); });
      pp.a.forEach((v, i) => { const k = { A: ['B', 'C'], B: ['A', 'C'], C: ['A', 'B'] }[v]; s += G.amark(P[k[0]], P[v], P[k[1]], { col: [C.royal, C.tang, C.grape][i], rpx: 28 + 5 * i, label: f1(angAt(P[k[0]], P[v], P[k[1]])) + '°' }); });
      return s;
    }
    function target() {
      const s1 = Math.sign(area([T1.A, T1.B, T1.C])), s2 = Math.sign(area([T2.A, T2.B, T2.C])), flip = s1 !== s2;
      const a2 = dirA(T2.B, T2.A), a1 = dirA(T1.B, T1.A);
      const map = (p) => { let q = sub(p, T2.B); q = rotP(q, V(0, 0), -a2); if (flip) q = V(q.x, -q.y); return add(T1.B, rotP(q, V(0, 0), a1)); };
      return { A: map(T2.A), B: map(T2.B), C: map(T2.C) };
    }
    function place() {
      const from = Object.assign({}, T2), to = target();
      ctx.anim(1100, (k) => { const e = L.ease(k); T2 = { A: lerpP(from.A, to.A, e), B: lerpP(from.B, to.B, e), C: lerpP(from.C, to.C, e) }; }, () => {
        placed = true;
        const fits = dist(T2.A, T1.A) < 0.05 && dist(T2.B, T1.B) < 0.05 && dist(T2.C, T1.C) < 0.05;
        if (fits) { ctx.emit('congruent'); ctx.api.celebrate(); ctx.record(T('The triangles fit exactly', 'त्रिभुज ठीक एक-दूसरे पर बैठ गए')); }
        else ctx.record(T('The triangles do not fit exactly', 'त्रिभुज ठीक नहीं बैठे'));
      });
    }
    function ask() {
      if (congruentTask) {
        const R0 = task.toUpperCase(), others = shuffle(RULES.filter((x) => x !== R0 && !(R0 === 'RHS' && x === 'SAS')), R0).slice(0, 2);
        ctx.ask({ q: T('The marked parts are equal. Which rule shows that △ABC ≅ △PQR?', 'चिह्नित भाग बराबर हैं। कौन-सा नियम दिखाता है कि △ABC ≅ △PQR?'), opts: [RULEW[R0], RULEW[others[0]], RULEW[others[1]], T('They need not be congruent', 'ज़रूरी नहीं कि वे सर्वांगसम हों')], ans: 0, seed: task, why: T('These equal parts fix the whole triangle, so the two triangles fit exactly.', 'ये बराबर भाग पूरे त्रिभुज को तय कर देते हैं, इसलिए दोनों त्रिभुज ठीक एक-दूसरे पर बैठते हैं।') });
      } else ctx.ask({ q: T('The marked parts are equal. Are △ABC and △PQR sure to be congruent?', 'चिह्नित भाग बराबर हैं। क्या △ABC और △PQR निश्चित रूप से सर्वांगसम हैं?'), opts: [T('No: these parts are not enough', 'नहीं: ये भाग काफ़ी नहीं हैं'), T('Yes, by SSS', 'हाँ, SSS से'), T('Yes, by SAS', 'हाँ, SAS से')], ans: 0, seed: task, why: task === 'aaa' ? T('Equal angles give the same shape, but the size can differ: the triangles are similar, not congruent.', 'बराबर कोणों से आकार (रूप) वही रहता है, पर माप अलग हो सकता है: त्रिभुज समरूप हैं, सर्वांगसम नहीं।') : T('With two sides and an angle that is not between them, two different triangles can be made.', 'दो भुजाएँ और ऐसा कोण जो उनके बीच नहीं है, उनसे दो अलग त्रिभुज बन सकते हैं।') });
    }
    return {
      title: { sss: T('Congruence: SSS', 'सर्वांगसमता: SSS'), sas: T('Congruence: SAS', 'सर्वांगसमता: SAS'), asa: T('Congruence: ASA', 'सर्वांगसमता: ASA'), aas: T('Congruence: AAS', 'सर्वांगसमता: AAS'), rhs: T('Congruence: RHS', 'सर्वांगसमता: RHS'), aaa: T('Are equal angles enough?', 'क्या बराबर कोण काफ़ी हैं?'), ssa: T('Is SSA enough?', 'क्या SSA काफ़ी है?') }[task],
      how: T('Drag triangle PQR onto triangle ABC (or press Enter on it). It turns and flips to try to fit.', 'त्रिभुज PQR को त्रिभुज ABC पर खिसकाओ (या उस पर Enter दबाओ)। वह घूमकर और पलटकर ठीक बैठने की कोशिश करता है।'),
      layout() { build(); },
      start() { ask(); },
      ctl() { return ctx.btn('reset', T('Move PQR back', 'PQR को वापस रखो')); },
      click(key) { if (key === 'reset') { T2 = Object.assign({}, home); placed = false; } },
      pos() { return centroid([T2.A, T2.B, T2.C]); },
      kstep: 5,
      dragStart(nm, p) { off = sub(centroid([T2.A, T2.B, T2.C]), p); placed = false; },
      drag(nm, p) { const c = centroid([T2.A, T2.B, T2.C]), d = sub(add(p, off || V(0, 0)), c); T2 = { A: add(T2.A, d), B: add(T2.B, d), C: add(T2.C, d) }; },
      dragEnd(nm, moved) { if (!moved) return; if (dist(centroid([T2.A, T2.B, T2.C]), centroid([T1.A, T1.B, T1.C])) < 3) place(); },
      activate() { place(); },
      svg() {
        let s = `<g opacity=".6">${G.grid(1, 0, '#EEF2FA')}</g>`;
        const o1 = centroid([T1.A, T1.B, T1.C]);
        s += G.poly([T1.A, T1.B, T1.C], 'rgba(37,99,235,0.16)', C.royal, 3.5) + (placed ? '' : marks(T1));
        ['A', 'B', 'C'].forEach((k) => { s += G.pt(T1[k], k, C.royal, o1); });
        const o2 = centroid([T2.A, T2.B, T2.C]);
        s += `<g class="sh-h" data-key="drag:T2" role="button" tabindex="0" aria-label="${tt(T('Triangle PQR: drag it onto ABC', 'त्रिभुज PQR: इसे ABC पर खिसकाओ'))}">${G.poly([T2.A, T2.B, T2.C], 'rgba(219,39,119,0.30)', C.pink, 3.5, 'class="sh-foc"')}</g>`;
        if (!placed && !ctx.busy) s += marks(T2, true);
        ['A', 'B', 'C'].forEach((k) => { s += G.pt(T2[k], nm2[k], C.pink, o2, 20); });
        if (placed) { const fits = dist(T2.C, T1.C) < 0.05 && dist(T2.A, T1.A) < 0.05; s += G.text(V(o1.x, Math.max(T1.A.y, T1.B.y, T1.C.y) + 1.5), fits ? tt(T('They fit exactly!', 'ये ठीक बैठ गए!')) : tt(T('They do not fit!', 'ये ठीक नहीं बैठते!')), 'sh-nm', 0, 0, `fill="${fits ? C.good : C.bad}"`); }
        return s;
      },
      read() {
        const pp = CPARTS2[task], fits = placed && dist(T2.C, T1.C) < 0.05 && dist(T2.A, T1.A) < 0.05;
        const parts = pp.s.map((x) => x + ' = ' + x.split('').map((k) => nm2[k]).join('')).concat(pp.a.map((x) => '∠' + x + ' = ∠' + nm2[x]));
        return parts.map((p) => ctx.chip(p)).join('') + (placed ? `<p>${fits ? tt(T('Every side and angle matches: △ABC ≅ △PQR.', 'हर भुजा और हर कोण मिलता है: △ABC ≅ △PQR।')) : tt(T('The marked parts match, but the third corner lands somewhere else, so these triangles are not congruent.', 'चिह्नित भाग मिलते हैं, पर तीसरा कोना कहीं और पड़ता है, इसलिए ये त्रिभुज सर्वांगसम नहीं हैं।'))}</p>` : '');
      },
    };
  }

  // ================================================================ mode: similarity
  function mkSimilarity(ctx, task, given) {
    const G = ctx.G, tt = ctx.tt, gl = given.lengths || [], ga = given.angles || [];
    let k = 1.5, ruler = false, prot = false, sun = 45;
    const T1 = { A: V(1.8, 2.6), B: V(1.2, 0.8), C: V(3.8, 0.8) };
    let A = V(3.5, 6), t = 0.4;
    const Bb = V(0, 0), Cb = V(8, 0);
    const [aB, aC] = ga.length === 2 ? ga : [50, 65];
    const tri = (side, at) => { const Bq = at, Cq = add(at, V(side, 0)), Aq = llx(Bq, polar(V(0, 0), 1, aB), Cq, polar(V(0, 0), 1, 180 - aC)); return { A: Aq, B: Bq, C: Cq }; };
    const S1 = tri(4, V(0.3, 0.3)), S2 = tri(6.4, V(5.4, 0.3));
    const h = gl[0] || 1.5, H = gl[1] || 9;
    const shade = (e) => [h / Math.tan(rad(e)), H / Math.tan(rad(e))];
    const sides = (P) => [dist(P.A, P.B), dist(P.B, P.C), dist(P.C, P.A)];
    function ask() {
      if (task === 'aa') ctx.ask({ q: T('Are △ABC and △PQR similar?', 'क्या △ABC और △PQR समरूप हैं?'), opts: [T('Yes: two angles are equal (AA)', 'हाँ: दो कोण बराबर हैं (AA)'), T('No: they are not the same size', 'नहीं: वे एक ही माप के नहीं हैं'), T('Only if all the sides are equal', 'केवल तब जब सभी भुजाएँ बराबर हों')], ans: 0, seed: 'aa',
        why: T('If two angles match, the third matches too (they add up to 180°), and every side is multiplied by the same number, 1.6.', 'यदि दो कोण मिलते हैं, तो तीसरा भी मिलता है (योग 180° है), और हर भुजा एक ही संख्या 1.6 से गुणा होती है।'), onRight: () => { ctx.emit('similar'); } });
      if (task === 'shadow') {
        const [s, S] = shade(sun), cand = [H, r1(S), H + 3, Math.max(1, H - 4), r1(H * 1.5)], vals = cand.filter((v, i) => cand.findIndex((w) => Math.abs(w - v) < 0.05) === i).slice(0, 4), opts = vals.map(fn);
        ctx.ask({ q: T(`The stick is ${fn(h)} m tall. Measure both shadows. How tall is the tree?`, `डंडा ${fn(h)} मी ऊँचा है। दोनों परछाइयाँ मापो। पेड़ कितना ऊँचा है?`), opts: opts.map((x) => x + ' m'), ans: 0, seed: 'sh',
          why: T(`Height ÷ shadow is the same for both, so tree = ${fn(h)} × ${f1(S)} ÷ ${f1(s)} = ${fn(H)} m.`, `दोनों के लिए ऊँचाई ÷ परछाई बराबर है, इसलिए पेड़ = ${fn(h)} × ${f1(S)} ÷ ${f1(s)} = ${fn(H)} मी।`), hint: T('Compare: the tree’s shadow is how many times the stick’s shadow?', 'तुलना करो: पेड़ की परछाई डंडे की परछाई की कितनी गुनी है?') });
      }
    }
    const lab3 = (P, nms, col) => { const o = centroid([P.A, P.B, P.C]); return ['A', 'B', 'C'].map((q, i) => G.pt(P[q], nms[i], col, o)).join(''); };
    return {
      title: { scale: T('Enlarge a triangle', 'त्रिभुज को बड़ा करो'), bpt: T('Basic proportionality theorem', 'आधारभूत समानुपातिकता प्रमेय'), aa: T('Similar triangles (AA)', 'समरूप त्रिभुज (AA)'), shadow: T('Heights from shadows', 'परछाई से ऊँचाई') }[task],
      how: {
        scale: T('Change the scale factor. Every side is multiplied by it; the angles stay the same.', 'पैमाना गुणक बदलो। हर भुजा उससे गुणा होती है; कोण वही रहते हैं।'),
        bpt: T('Drag D along AB. Line DE stays parallel to BC. Compare the two ratios.', 'D को AB पर खिसकाओ। रेखा DE, BC के समांतर रहती है। दोनों अनुपातों की तुलना करो।'),
        aa: T('Measure the angles and the sides of both triangles, then answer.', 'दोनों त्रिभुजों के कोण और भुजाएँ मापो, फिर उत्तर दो।'),
        shadow: T('Move the sun. The stick and the tree make similar triangles with their shadows.', 'सूरज को खिसकाओ। डंडा और पेड़ अपनी परछाइयों के साथ समरूप त्रिभुज बनाते हैं।'),
      }[task],
      layout() {
        if (task === 'scale') ctx.fit([-0.8, -0.8, 10, 7], 26);
        else if (task === 'bpt') ctx.fit([-1, -1.2, 9, 7.6], 26);
        else if (task === 'aa') ctx.fit([-0.5, -0.6, 12.2, 6.6], 26);
        else { const [s, S] = shade(sun); ctx.fit([-0.6, -1.2, 0.5 + s + 2.5 + S + 0.8, H + 1.6], 26); }
      },
      start() { ask(); },
      ctl() {
        if (task === 'scale') return ctx.slider('scale', T('Scale factor', 'पैमाना गुणक'), 0.5, 2.5, 0.1, k, '');
        if (task === 'aa') return ctx.toolBtn('protractor', prot) + ctx.toolBtn('ruler', ruler);
        if (task === 'shadow') return ctx.slider('sun', T('Height of the sun', 'सूरज की ऊँचाई'), 25, 70, 5, sun, '°') + ctx.toolBtn('ruler', ruler);
        return '';
      },
      slider(nm, v) { if (nm === 'scale') k = r1(v); if (nm === 'sun') { sun = v; this.layout(); } },
      sliderEnd(nm) { ctx.emit('drawn'); if (nm === 'scale' && k !== 1) ctx.emit('similar'); if (nm === 'sun' && ruler) ctx.emit('measured:' + f1(shade(sun)[1])); if (nm === 'sun') ask(); },
      click(key) {
        if (key === 'tool:ruler') { ruler = !ruler; if (ruler) ctx.emit('measured:' + (task === 'shadow' ? f1(shade(sun)[1]) : f1(dist(S2.B, S2.C)))); }
        if (key === 'tool:protractor') { prot = !prot; if (prot) ctx.emit('measured:' + aB); }
        ctx.ctl();
      },
      pos(nm) { return nm === 'D' ? lerpP(A, Bb, t) : A; },
      drag(nm, p) {
        if (nm === 'D') { const u = sub(Bb, A); t = clamp(dot(sub(p, A), u) / dot(u, u), 0.12, 0.88); t = Math.round(t * 100) / 100; }
        else if (nm === 'A') { const q = snapP(p, 0.1); if (q.y >= 2.5 && q.y <= 7.2 && q.x >= -0.5 && q.x <= 8.5) A = q; }
      },
      dragEnd(nm, moved) { if (moved && task === 'bpt') { ctx.emit('proved'); ctx.emit('measured:' + f2(t / (1 - t))); } },
      svg() {
        let s = `<g opacity=".7">${G.grid(1, 0, '#EEF2FA')}</g>`;
        if (task === 'scale') {
          const O = V(0, 0), I = { A: mul(T1.A, k), B: mul(T1.B, k), C: mul(T1.C, k) };
          ['A', 'B', 'C'].forEach((q) => { s += G.line(O, mul(T1[q], Math.max(k, 1) * 1.08), '#94A3B8', 1.6, 'stroke-dasharray="5 5"'); });
          s += G.poly([I.A, I.B, I.C], 'rgba(219,39,119,0.18)', C.pink, 3.5) + G.poly([T1.A, T1.B, T1.C], 'rgba(37,99,235,0.2)', C.royal, 3.5);
          const o = centroid([I.A, I.B, I.C]);
          s += G.amark(I.B, I.A, I.C, { col: C.tang, rpx: 22 }) + G.amark(T1.B, T1.A, T1.C, { col: C.tang, rpx: 16 });
          s += lab3(T1, ['A', 'B', 'C'], C.royal) + ['A', 'B', 'C'].map((q) => G.pt(I[q], q + '′', C.pink, o)).join('') + G.pt(O, 'O', C.ink, V(1, 1));
          return s;
        }
        if (task === 'bpt') {
          const D = lerpP(A, Bb, t), E = lerpP(A, Cb, t);
          s += G.poly([A, Bb, Cb], 'rgba(37,99,235,0.12)', C.ink, 3.5) + G.poly([A, D, E], 'rgba(219,39,119,0.18)', 'none', 0);
          s += G.line(D, E, C.pink, 4) + G.chev(D, E, C.pink) + G.chev(Bb, Cb, C.ink);
          s += G.pt(Bb, 'B', C.ink, V(4, 3)) + G.pt(Cb, 'C', C.ink, V(4, 3)) + G.pt(E, 'E', C.pink, V(D.x, E.y));
          return s + G.handle('drag:D', D, C.pink, tt(W.drag) + ' D', 'D', V(E.x, D.y)) + G.handle('drag:A', A, C.royal, tt(W.drag) + ' A', 'A', V(4, 2));
        }
        if (task === 'aa') {
          [[S1, ['A', 'B', 'C'], C.royal], [S2, ['P', 'Q', 'R'], C.pink]].forEach(([P, nms, col]) => {
            const o = centroid([P.A, P.B, P.C]);
            s += G.poly([P.A, P.B, P.C], col === C.royal ? 'rgba(37,99,235,0.16)' : 'rgba(219,39,119,0.16)', col, 3.5);
            s += G.amark(P.A, P.B, P.C, { col: C.tang, rpx: 26, label: prot ? f1(aB) + '°' : '' }) + G.amark(P.A, P.C, P.B, { col: C.grape, rpx: 30, label: prot ? f1(aC) + '°' : '' }) + G.amark(P.B, P.A, P.C, { col: C.turq, rpx: 22, label: prot ? f1(180 - aB - aC) + '°' : '' });
            if (ruler) sides(P).forEach((l, i) => { const ab = [[P.A, P.B], [P.B, P.C], [P.C, P.A]][i]; s += G.slen(ab[0], ab[1], f1(l), o); });
            s += lab3(P, nms, col);
          });
          return s;
        }
        const [sh, SH] = shade(sun), x1 = 0.5, x2 = x1 + sh + 2.5;
        s = `<rect x="0" y="0" width="${ctx.W}" height="${G.Y(0)}" fill="#E0F2FE"/><rect x="0" y="${G.Y(0)}" width="${ctx.W}" height="${ctx.H - G.Y(0)}" fill="#BBF7D0"/>`;
        const sunP = add(V(x1, h), polar(V(0, 0), Math.min(H + 0.5, 30) / Math.sin(rad(sun)) * 0.9, 180 - sun));
        s += G.circle(V(clamp(sunP.x, -0.3, x2), clamp(sunP.y, 1, H + 1.2)), G.w(22), C.sun, C.gold, 3);
        s += G.poly([V(x1, 0), V(x1 + sh, 0), V(x1, h)], 'rgba(219,39,119,0.25)', 'none', 0) + G.poly([V(x2, 0), V(x2 + SH, 0), V(x2, H)], 'rgba(37,99,235,0.18)', 'none', 0);
        s += G.line(V(x1, h), V(x1 + sh, 0), C.gold, 2.5, 'stroke-dasharray="7 5"') + G.line(V(x2, H), V(x2 + SH, 0), C.gold, 2.5, 'stroke-dasharray="7 5"');
        s += G.line(V(x1, 0), V(x1 + sh, 0), '#334155', 6) + G.line(V(x2, 0), V(x2 + SH, 0), '#334155', 6);
        s += G.line(V(x1, 0), V(x1, h), '#92400E', 5);
        s += G.line(V(x2, 0), V(x2, H * 0.62), '#78350F', Math.max(6, G.w(0) + 0.35 * ctx.s));
        s += G.circle(V(x2 - H * 0.13, H * 0.64), H * 0.15, '#22C55E', '#166534', 2) + G.circle(V(x2 + H * 0.13, H * 0.66), H * 0.14, '#22C55E', '#166534', 2) + G.circle(V(x2, H * 0.8), H * 0.2, '#16A34A', '#166534', 2.5) + G.dot(V(x2, H), C.pink, 6);
        s += G.amark(V(x1, h), V(x1 + sh, 0), V(x1, 0), { col: C.tang, rpx: 22, label: sun + '°' }) + G.amark(V(x2, H), V(x2 + SH, 0), V(x2, 0), { col: C.tang, rpx: 22, label: sun + '°' });
        s += G.text(V(x1, h), `${fn(h)} m`, 'sh-sm', -30, -10) + G.text(V(x2, H), isDoneQ(ctx) ? `${fn(H)} m` : '?', 'sh-nm', -26, -8);
        if (ruler) s += G.text(V(x1 + sh / 2, 0), `${f1(sh)} m`, 'sh-sm', 0, 18) + G.text(V(x2 + SH / 2, 0), `${f1(SH)} m`, 'sh-sm', 0, 18);
        return s;
      },
      read() {
        if (task === 'scale') {
          const I = sides({ A: mul(T1.A, k), B: mul(T1.B, k), C: mul(T1.C, k) }), O1 = sides(T1);
          return ['A′B′ ÷ AB', 'B′C′ ÷ BC', 'C′A′ ÷ CA'].map((nm, i) => ctx.chip(`${nm} = ${f1(I[i])} ÷ ${f1(O1[i])} = ${fn(k)}`)).join('') + ctx.chip(tt(T('Angles: unchanged', 'कोण: वही')), 'ok') + `<p>${tt(k === 1 ? T('Scale factor 1: the copy is the same size (congruent).', 'पैमाना गुणक 1: प्रति उसी माप की है (सर्वांगसम)।') : T('Same shape, different size: the triangles are similar. Sides are in the same ratio; angles are equal.', 'आकार वही, माप अलग: त्रिभुज समरूप हैं। भुजाएँ एक ही अनुपात में हैं; कोण बराबर हैं।'))}</p>`;
        }
        if (task === 'bpt') { const D = lerpP(A, Bb, t), E = lerpP(A, Cb, t); return ctx.chip(`AD ÷ DB = ${f1(dist(A, D))} ÷ ${f1(dist(D, Bb))} = ${f2(t / (1 - t))}`, 'ok') + ctx.chip(`AE ÷ EC = ${f1(dist(A, E))} ÷ ${f1(dist(E, Cb))} = ${f2(t / (1 - t))}`, 'ok') + `<p>${tt(T('A line parallel to one side of a triangle divides the other two sides in the same ratio.', 'त्रिभुज की एक भुजा के समांतर रेखा अन्य दो भुजाओं को एक ही अनुपात में बाँटती है।'))}</p>`; }
        if (task === 'aa') return (prot ? ctx.chip(`∠B = ∠Q = ${fn(aB)}°`, 'ok') + ctx.chip(`∠C = ∠R = ${fn(aC)}°`, 'ok') : '') + (ruler ? ctx.chip(`QR ÷ BC = ${f1(dist(S2.B, S2.C))} ÷ ${f1(dist(S1.B, S1.C))} = 1.6`) + ctx.chip(`PQ ÷ AB = ${f1(dist(S2.A, S2.B))} ÷ ${f1(dist(S1.A, S1.B))} = 1.6`) : '') + (!prot && !ruler ? `<p>${tt(T('Use the protractor and the ruler to compare the triangles.', 'त्रिभुजों की तुलना के लिए चाँदा और रूलर लगाओ।'))}</p>` : '');
        const [sh, SH] = shade(sun);
        return ruler ? ctx.chip(`${tt(T('stick shadow', 'डंडे की परछाई'))} = ${f1(sh)} m`) + ctx.chip(`${tt(T('tree shadow', 'पेड़ की परछाई'))} = ${f1(SH)} m`) + `<p>${tt(T('The sun’s rays are parallel, so both triangles have the same angles: they are similar.', 'सूरज की किरणें समांतर हैं, इसलिए दोनों त्रिभुजों के कोण बराबर हैं: वे समरूप हैं।'))}</p>` : `<p>${tt(T('Tap the ruler to measure the shadows.', 'परछाइयाँ मापने के लिए रूलर पर टैप करो।'))}</p>`;
      },
    };
  }
  const isDoneQ = (ctx) => !!(ctx.qdone && ctx.qdone());

  // ================================================================ mode: transform (on a coordinate grid)
  const MIRRORS = ['x', 'y', 'yx', 'ynx'];
  const MIRN = { x: T('the x-axis', 'x-अक्ष'), y: T('the y-axis', 'y-अक्ष'), yx: T('the line y = x', 'रेखा y = x'), ynx: T('the line y = −x', 'रेखा y = −x') };
  const mirrorP = (m, p) => (m === 'x' ? V(p.x, -p.y) : m === 'y' ? V(-p.x, p.y) : m === 'yx' ? V(p.y, p.x) : V(-p.y, -p.x));
  const cxy = (p) => `(${fn(p.x).replace('-', '−')}, ${fn(p.y).replace('-', '−')})`;
  function mkTransform(ctx, task) {
    const G = ctx.G, tt = ctx.tt;
    const F = task === 'enlarge' ? [V(-5, -4), V(-3, -4), V(-5, -2)] : [V(1, 1), V(3, 1), V(1, 4)];
    const Z = task === 'enlarge' ? V(-6, -5) : V(0, 0);
    let dx = 0, dy = 0, mi = 0, rot = 0, k = 1, matched = false;
    const img = () => F.map((p) => (task === 'translate' ? add(p, V(dx, dy)) : task === 'reflect' ? mirrorP(MIRRORS[mi], p) : task === 'rotate' ? rotP(p, Z, rot) : add(Z, mul(sub(p, Z), k))));
    const goal = [V(-5, -4), V(-3, -4), V(-5, -1)];
    function ask() {
      if (task === 'reflect') ctx.ask({ q: T('Reflect the flag in the x-axis. Where does C(1, 4) go?', 'झंडे का x-अक्ष में परावर्तन करो। C(1, 4) कहाँ जाता है?'), opts: ['(1, −4)', '(−1, 4)', '(−1, −4)', '(4, 1)'], ans: 0, seed: 'rf', why: T('In the x-axis, x stays the same and y changes sign: (x, y) → (x, −y).', 'x-अक्ष में x वही रहता है और y का चिह्न बदलता है: (x, y) → (x, −y)।') });
      if (task === 'rotate') ctx.ask({ q: T('Turn the flag 90° anticlockwise about O. Where does B(3, 1) go?', 'झंडे को O के चारों ओर 90° वामावर्त घुमाओ। B(3, 1) कहाँ जाता है?'), opts: ['(−1, 3)', '(1, −3)', '(−3, −1)', '(3, −1)'], ans: 0, seed: 'rt', why: T('A quarter turn anticlockwise sends (x, y) to (−y, x).', 'चौथाई चक्कर वामावर्त (x, y) को (−y, x) पर भेजता है।') });
      if (task === 'enlarge') ctx.ask({ q: T('AB is 2 units long. With scale factor 2, how long is A′B′?', 'AB की लंबाई 2 इकाई है। पैमाना गुणक 2 से A′B′ कितनी लंबी होगी?'), opts: ['4', '2', '8', '6'], ans: 0, seed: 'en', why: T('Every length is multiplied by the scale factor: 2 × 2 = 4.', 'हर लंबाई पैमाना गुणक से गुणा होती है: 2 × 2 = 4।') });
    }
    return {
      title: { translate: T('Translation (slide)', 'स्थानांतरण (खिसकाना)'), reflect: T('Reflection (flip)', 'परावर्तन (पलटना)'), rotate: T('Rotation (turn)', 'घूर्णन (घुमाना)'), enlarge: T('Enlargement', 'आवर्धन (बड़ा करना)') }[task],
      how: { translate: T('Slide the flag with the sliders until it covers the dashed target.', 'स्लाइडर से झंडे को खिसकाओ ताकि वह बिंदुदार लक्ष्य को ढक ले।'), reflect: T('Change the mirror line and watch the image A′B′C′.', 'दर्पण रेखा बदलो और प्रतिबिंब A′B′C′ देखो।'), rotate: T('Turn the flag about O in quarter turns.', 'झंडे को O के चारों ओर चौथाई चक्करों में घुमाओ।'), enlarge: T('Change the scale factor. The centre of enlargement is Z.', 'पैमाना गुणक बदलो। आवर्धन का केंद्र Z है।') }[task],
      layout() { ctx.fit([-8.6, -6.6, 8.6, 6.6], 18); },
      start() { ask(); },
      ctl() {
        if (task === 'translate') return ctx.slider('dx', T('Right / left', 'दाएँ / बाएँ'), -8, 5, 1, dx, '') + ctx.slider('dy', T('Up / down', 'ऊपर / नीचे'), -7, 2, 1, dy, '');
        if (task === 'reflect') return ctx.btn('mirror', T('Change the mirror', 'दर्पण बदलो'), { cls: 'main' });
        if (task === 'rotate') return ctx.slider('angle', T('Turn anticlockwise', 'वामावर्त घुमाओ'), 0, 270, 90, rot, '°');
        return ctx.slider('scale', T('Scale factor', 'पैमाना गुणक'), 0.5, 3, 0.5, k, '');
      },
      slider(nm, v) { if (nm === 'dx') dx = v; if (nm === 'dy') dy = v; if (nm === 'angle') rot = v; if (nm === 'scale') k = v; },
      sliderEnd() {
        ctx.emit('drawn');
        if (task === 'translate' && !matched && dx === -6 && dy === -5) { matched = true; ctx.emit('answered:right'); ctx.api.celebrate(); }
        ctx.record(T('Image: ', 'प्रतिबिंब: ') + img().map(cxy).join(' '));
      },
      click(key) { if (key === 'mirror') { mi = (mi + 1) % MIRRORS.length; ctx.emit('drawn'); ctx.record(T('Mirror: ', 'दर्पण: ') + ctx.api.t(MIRN[MIRRORS[mi]])); } },
      svg() {
        let s = G.grid(1, 0, '#DCE3F1');
        s += G.line(V(-8.6, 0), V(8.6, 0), C.ink2, 2) + G.line(V(0, -6.6), V(0, 6.6), C.ink2, 2) + G.text(V(8.3, 0), 'x', 'sh-md', 0, -14) + G.text(V(0, 6.3), 'y', 'sh-md', 14, 0);
        for (let i = -8; i <= 8; i += 2) if (i) s += G.text(V(i, 0), String(i).replace('-', '−'), 'sh-sm', 0, 15, 'style="font-size:15px"');
        for (let i = -6; i <= 6; i += 2) if (i) s += G.text(V(0, i), String(i).replace('-', '−'), 'sh-sm', -15, 0, 'style="font-size:15px"');
        s += G.text(V(0, 0), 'O', 'sh-sm', -12, 12);
        if (task === 'reflect') { const m = MIRRORS[mi], a = { x: [V(-8.6, 0), V(8.6, 0)], y: [V(0, -6.6), V(0, 6.6)], yx: [V(-6.6, -6.6), V(6.6, 6.6)], ynx: [V(-6.6, 6.6), V(6.6, -6.6)] }[m]; s += G.tap('mirror', `${G.line(a[0], a[1], 'rgba(255,255,255,0.01)', 22)}${G.line(a[0], a[1], C.grape, 4, 'stroke-dasharray="10 6"')}`, tt(T('Mirror line: tap to change', 'दर्पण रेखा: बदलने के लिए टैप करो'))); }
        if (task === 'translate') s += G.poly(goal, 'rgba(34,197,94,0.12)', C.good, 2.5, 'stroke-dasharray="7 5"');
        if (task === 'enlarge') { s += G.pt(Z, 'Z', C.ink, V(-7, -6)); img().forEach((p) => { s += G.line(Z, p, '#94A3B8', 1.5, 'stroke-dasharray="4 4"'); }); }
        const flag = (P, fill, col, nm) => G.poly(P, fill, col, 3) + P.map((p, i) => G.dot(p, col, 5) + G.text(p, nm[i], 'sh-sm', -14, -12)).join('');
        s += flag(F, 'rgba(37,99,235,0.25)', C.royal, ['A', 'B', 'C']);
        const I = img(), same = task === 'translate' && dx === -6 && dy === -5;
        s += flag(I, same ? 'rgba(34,197,94,0.45)' : 'rgba(219,39,119,0.35)', same ? C.good : C.pink, ['A′', 'B′', 'C′']);
        if (task === 'rotate' && rot) s += G.pl(G.arcPts(Z, len(F[1]), dirA(Z, F[1]), dirA(Z, F[1]) + rot), C.tang, 2.5, 'stroke-dasharray="5 4"');
        return s;
      },
      read() {
        const I = img();
        const rule = task === 'translate' ? `(x, y) → (x ${dx < 0 ? '−' : '+'} ${Math.abs(dx)}, y ${dy < 0 ? '−' : '+'} ${Math.abs(dy)})` : task === 'reflect' ? tt(T('Mirror: ', 'दर्पण: ')) + tt(MIRN[MIRRORS[mi]]) : task === 'rotate' ? tt(T(`Turned ${rot}° anticlockwise about O`, `O के चारों ओर ${rot}° वामावर्त घुमाया`)) : tt(T(`Scale factor ${fn(k)}: every length × ${fn(k)}`, `पैमाना गुणक ${fn(k)}: हर लंबाई × ${fn(k)}`));
        return `<p class="sh-eq">${rule}</p>` + ['A', 'B', 'C'].map((n, i) => ctx.chip(`${n}${cxy(F[i])} → ${n}′${cxy(I[i])}`)).join('') + (task === 'translate' ? `<p>${tt(dx === -6 && dy === -5 ? T('It covers the target exactly. A slide moves every point the same way: size and shape stay the same.', 'यह लक्ष्य को ठीक ढक लेता है। खिसकाने से हर बिंदु एक जैसा चलता है: माप और आकार वही रहते हैं।') : T('Slide it onto the green dashed target.', 'इसे हरे बिंदुदार लक्ष्य पर खिसकाओ।'))}</p>` : '');
      },
    };
  }

  // ================================================================ mode: tangram (7 pieces of a 4 × 4 square)
  const TAN = [
    { n: T('large triangle', 'बड़ा त्रिभुज'), p: [V(0, 0), V(4, 0), V(2, 2)], c: C.pink, a: 4 },
    { n: T('large triangle', 'बड़ा त्रिभुज'), p: [V(0, 0), V(2, 2), V(0, 4)], c: C.royal, a: 4 },
    { n: T('medium triangle', 'मध्यम त्रिभुज'), p: [V(2, 4), V(4, 4), V(4, 2)], c: C.tang, a: 2 },
    { n: T('parallelogram', 'समांतर चतुर्भुज'), p: [V(0, 4), V(1, 3), V(3, 3), V(2, 4)], c: C.turq, a: 2 },
    { n: T('small triangle', 'छोटा त्रिभुज'), p: [V(4, 0), V(4, 2), V(3, 1)], c: C.grape, a: 1 },
    { n: T('square', 'वर्ग'), p: [V(3, 1), V(4, 2), V(3, 3), V(2, 2)], c: C.gold, a: 2 },
    { n: T('small triangle', 'छोटा त्रिभुज'), p: [V(1, 3), V(2, 2), V(3, 3)], c: C.leaf, a: 1 },
  ];
  const R2 = Math.SQRT2;
  const TAN_T = {
    square: { n: T('a square', 'एक वर्ग'), p: (c) => [V(-2, -2), V(2, -2), V(2, 2), V(-2, 2)].map((q) => add(q, c)) },
    triangle: { n: T('a big triangle', 'एक बड़ा त्रिभुज'), p: (c) => [V(-4, -2), V(4, -2), V(0, 2)].map((q) => add(q, c)) },
    rectangle: { n: T('a rectangle', 'एक आयत'), p: (c) => [V(-2 * R2, -R2), V(2 * R2, -R2), V(2 * R2, R2), V(-2 * R2, R2)].map((q) => add(q, c)) },
  };
  // the pieces tile the outline when every sample point inside it lies in exactly one piece and none lies outside
  function tanCover(polys, tp) {
    const xs = tp.map((p) => p.x), ys = tp.map((p) => p.y);
    let bad = 0, n = 0;
    for (let x = Math.min(...xs) - 0.3 + 0.0371; x < Math.max(...xs) + 0.3; x += 0.1) for (let y = Math.min(...ys) - 0.3 + 0.0613; y < Math.max(...ys) + 0.3; y += 0.1) {
      const p = V(x, y), inT = inPoly(p, tp), k = polys.filter((q) => inPoly(p, q)).length;
      if (inT) { n++; if (k !== 1) bad++; } else if (k) bad++;
    }
    return bad <= Math.max(2, n * 0.006);
  }
  function mkTangram(ctx, task) {
    const G = ctx.G, tt = ctx.tt;
    let ti = Object.keys(TAN_T).indexOf(task), pcs, wide = true, off = null, solved = false, sel = null;
    const local = TAN.map((t) => { const c = centroid(t.p); return t.p.map((q) => sub(q, c)); });
    const verts = (i) => { const P = pcs[i]; return local[i].map((q) => add(P.pos, rotP(P.flip ? V(-q.x, q.y) : q, V(0, 0), P.ang))); };
    const tgtC = () => (wide ? V(4.5, 4.5) : V(4.5, 8.2));
    const tgt = () => TAN_T[Object.keys(TAN_T)[ti]].p(tgtC());
    function deal() {
      const angs = [0, 90, 0, 0, 0, 0, 0];
      pcs = TAN.map((t, i) => ({ pos: V(0, 0), ang: angs[i], flip: false }));
      const tray = wide ? { x0: 9.1, x1: 14.9, y: 8.7 } : { x0: 0.3, x1: 8.7, y: 5.8 };
      let x = tray.x0, y = tray.y, rowH = 0;
      (wide ? [0, 5, 1, 4, 2, 3, 6] : [0, 1, 5, 4, 2, 3, 6]).forEach((i) => {
        pcs[i].pos = V(0, 0);
        const v = verts(i), w = Math.max(...v.map((p) => p.x)) - Math.min(...v.map((p) => p.x)), h = Math.max(...v.map((p) => p.y)) - Math.min(...v.map((p) => p.y));
        if (x + w > tray.x1 + 1e-6) { x = tray.x0; y -= rowH + 0.25; rowH = 0; }
        pcs[i].pos = V(x - Math.min(...v.map((p) => p.x)), y - Math.max(...v.map((p) => p.y)));
        x += w + 0.25; rowH = Math.max(rowH, h);
      });
      solved = false;
    }
    function snapPiece(i) {
      const v = verts(i), cand = tgt().concat(...pcs.map((_, j) => (j === i ? [] : verts(j))));
      let best = null, bd = 0.32;
      v.forEach((p) => cand.forEach((q) => { const d = dist(p, q); if (d < bd) { bd = d; best = sub(q, p); } }));
      if (best) pcs[i].pos = add(pcs[i].pos, best);
    }
    const check = () => tanCover(pcs.map((_, i) => verts(i)), tgt());
    function after() {
      ctx.emit('drawn');
      const ok = check();
      if (ok && !solved) { solved = true; ctx.emit('constructed'); ctx.api.celebrate(); ctx.record(T('Finished the tangram picture', 'टैनग्राम चित्र पूरा किया')); }
      if (!ok) solved = false;
    }
    return {
      title: T('Tangram', 'टैनग्राम'),
      how: T('Drag the 7 pieces into the outline. Tap a piece to turn it by 45°. Pieces snap together at their corners.', '7 टुकड़ों को रूपरेखा में खिसकाओ। किसी टुकड़े को 45° घुमाने के लिए उस पर टैप करो। टुकड़े कोनों पर आपस में जुड़ जाते हैं।'),
      layout() { const was = wide; wide = !ctx.narrow; ctx.fit(wide ? [0, 0, 15, 9] : [0, 0, 9, 10.6], 16); if (!pcs || was !== wide) deal(); },
      kstep: 2.5,
      ctl() { return ctx.btn('flip', T('Flip the parallelogram', 'समांतर चतुर्भुज पलटो')) + ctx.btn('reset', W.again) + ctx.btn('next', T('Next outline', 'अगली रूपरेखा'), { cls: 'main' }); },
      click(key) {
        if (key === 'flip') { pcs[3].flip = !pcs[3].flip; snapPiece(3); after(); }
        else if (key === 'reset') deal();
        else if (key === 'next') { ti = (ti + 1) % 3; deal(); }
      },
      pos(nm) { return pcs[+nm - 1].pos; },
      dragStart(nm, p) { const i = +nm - 1; off = sub(pcs[i].pos, p); sel = i; },
      drag(nm, p) { const i = +nm - 1, q = add(p, off || V(0, 0)), bx = wide ? [0, 0, 15, 9] : [0, 0, 9, 10.6]; pcs[i].pos = V(clamp(q.x, bx[0] + 0.3, bx[2] - 0.3), clamp(q.y, bx[1] + 0.3, bx[3] - 0.3)); },
      dragEnd(nm, moved) { const i = +nm - 1; if (!moved) pcs[i].ang = (pcs[i].ang + 45) % 360; snapPiece(i); after(); ctx.record(T(`Moved the ${TAN[i].n.en}`, `${TAN[i].n.hi} खिसकाया`)); },
      activate(nm) { const i = +nm - 1; pcs[i].ang = (pcs[i].ang + 45) % 360; snapPiece(i); after(); },
      svg() {
        let s = `<g opacity=".5">${G.grid(0.5, 0, '#EEF2FA')}</g>`;
        s += G.poly(tgt(), solved ? 'rgba(34,197,94,0.25)' : 'rgba(6,18,51,0.10)', solved ? C.good : C.ink, 3, 'stroke-dasharray="9 6"');
        const order = pcs.map((_, i) => i).filter((i) => i !== sel).concat(sel != null ? [sel] : []);
        order.forEach((i) => {
          const v = verts(i);
          s += `<g class="sh-h" data-key="piece:${i + 1}" role="button" tabindex="0" aria-label="${tt(TAN[i].n)} ${i + 1}">${G.poly(v, TAN[i].c, '#fff', 2.5, 'class="sh-foc" stroke-linejoin="round"')}${G.poly(v, 'none', 'rgba(6,18,51,0.35)', 1)}</g>`;
        });
        return s;
      },
      read() {
        return ctx.chip(tt(T('Make: ', 'बनाओ: ')) + tt(TAN_T[Object.keys(TAN_T)[ti]].n), solved ? 'ok' : 'big') + `<p>${solved ? tt(T('Done! The same 7 pieces always cover the same area: 16 small squares, whatever shape they make.', 'हो गया! वही 7 टुकड़े हमेशा उतना ही क्षेत्रफल ढकते हैं: 16 छोटे वर्ग, चाहे कोई भी आकार बनाएँ।')) : tt(T('Area in small-triangle units: large 4, medium 2, square 2, parallelogram 2, small 1. Total 16.', 'छोटे त्रिभुज की इकाई में क्षेत्रफल: बड़ा 4, मध्यम 2, वर्ग 2, समांतर चतुर्भुज 2, छोटा 1। कुल 16।'))}</p>`;
      },
    };
  }

  // ================================================================ mode: pythagoras
  function rotCentre(p, q, th) { const c = Math.cos(rad(th)), s = Math.sin(rad(th)), Rp = V(c * p.x - s * p.y, s * p.x + c * p.y), b = sub(q, Rp), det = 2 - 2 * c; return V(((1 - c) * b.x - s * b.y) / det, (s * b.x + (1 - c) * b.y) / det); }
  function mkPythagoras(ctx, task, given) {
    const G = ctx.G, tt = ctx.tt, gl = given.lengths || [];
    let a = gl[0] || 3, b = gl[1] || 4, c3 = gl[2] || 6, proof = -1, ruler = false;
    if (task === 'find-side') { a = gl[0] || 6; b = gl[1] || 8; }
    if (task === 'converse') { a = gl[0] || 3; b = gl[1] || 4; c3 = gl[2] || 6; }
    const hyp = () => Math.sqrt(a * a + b * b);
    function fitSq() { if (proof >= 0) ctx.fit([-0.6, -0.8, a + b + 0.6, a + b + 0.6], 26); else ctx.fit([-b - 0.7, -a - 0.7, a + b + 0.7, a + b + 0.7], 22); }
    function ask() {
      if (task !== 'find-side') return;
      const c = hyp(), opts = [...new Set([f1(c), f1(a + b), f1(Math.abs(b - a) || c + 2), f1(c + 1)])].slice(0, 4);
      ctx.ask({ q: T(`The two shorter sides are ${fn(a)} cm and ${fn(b)} cm. How long is the hypotenuse?`, `दो छोटी भुजाएँ ${fn(a)} सेमी और ${fn(b)} सेमी हैं। कर्ण कितना लंबा है?`), opts: opts.map((x) => x + ' cm'), ans: 0, seed: 'fs' + a + b,
        why: T(`c² = ${fn(a)}² + ${fn(b)}² = ${fn(a * a)} + ${fn(b * b)} = ${fn(a * a + b * b)}, so c = ${f1(c)} cm.`, `c² = ${fn(a)}² + ${fn(b)}² = ${fn(a * a)} + ${fn(b * b)} = ${fn(a * a + b * b)}, इसलिए c = ${f1(c)} सेमी।`), hint: T('Square each short side, add them, then find the square root.', 'हर छोटी भुजा का वर्ग करो, उन्हें जोड़ो, फिर वर्गमूल निकालो।') });
    }
    const conv = () => { const s = [a, b, c3].sort((x, y) => x - y); return { s, ok: s[0] + s[1] > s[2], right: s[0] * s[0] + s[1] * s[1] === s[2] * s[2] }; };
    function sq(p, q, col, lbl, grid) {
      const d = sub(q, p), n = V(d.y, -d.x), pts = [p, q, add(q, n), add(p, n)], l = len(d);
      let s = G.poly(pts, col, C.ink, 2.5, 'fill-opacity=".45"');
      if (grid && Math.abs(l - Math.round(l)) < 1e-9 && l <= 10) { const u = mul(d, 1 / l), v = mul(n, 1 / l); for (let i = 1; i < l; i++) s += G.line(add(p, mul(u, i)), add(add(p, mul(u, i)), n), '#fff', 1.4, 'opacity=".9"') + G.line(add(p, mul(v, i)), add(add(p, mul(v, i)), d), '#fff', 1.4, 'opacity=".9"'); }
      return s + G.text(centroid(pts), lbl, 'sh-md');
    }
    return {
      title: { squares: T('Pythagoras theorem', 'पाइथागोरस प्रमेय'), converse: T('Is it a right triangle?', 'क्या यह समकोण त्रिभुज है?'), 'find-side': T('Find the hypotenuse', 'कर्ण ज्ञात करो') }[task],
      how: { squares: T('Change the two shorter sides. Compare the areas of the squares, then tap “Show why”.', 'दो छोटी भुजाएँ बदलो। वर्गों के क्षेत्रफल की तुलना करो, फिर “कारण दिखाओ” दबाओ।'), converse: T('Choose three sides. The triangle has a right angle only when the two smaller squares add up to the biggest.', 'तीन भुजाएँ चुनो। त्रिभुज में समकोण तभी होता है जब दो छोटे वर्गों का योग सबसे बड़े वर्ग के बराबर हो।'), 'find-side': T('Use the rule a² + b² = c² to find the long side, then check it with the ruler.', 'लंबी भुजा ज्ञात करने के लिए नियम a² + b² = c² लगाओ, फिर रूलर से जाँचो।') }[task],
      layout() {
        if (task === 'squares') fitSq();
        else if (task === 'converse') { const { s } = conv(); ctx.fit([-0.6, -0.8, s[2] + 0.6, Math.max(...s) * 0.75 + 0.8], 30); }
        else ctx.fit([-1.5, -1.2, a + 1.5, b + 1.2], 30);
      },
      start() { ask(); },
      ctl() {
        if (task === 'squares') return ctx.slider('a', T('Side a', 'भुजा a'), 1, 6, 1, a, W.cm) + ctx.slider('b', T('Side b', 'भुजा b'), 1, 6, 1, b, W.cm) + ctx.btn('prove', proof >= 0 ? T('Show the squares', 'वर्ग दिखाओ') : W.prove, { cls: 'main' });
        if (task === 'converse') return ['a', 'b', 'c'].map((n) => ctx.slider(n, T('Side ' + n, 'भुजा ' + n), 1, 10, 0.5, { a, b, c: c3 }[n], W.cm)).join('');
        return ctx.toolBtn('ruler', ruler);
      },
      slider(nm, v) { if (nm === 'a') a = v; if (nm === 'b') b = v; if (nm === 'c') c3 = v; if (task === 'squares') proof = -1; this.layout(); },
      sliderEnd() { ctx.emit('drawn'); if (task === 'converse' && conv().ok && conv().right) { ctx.emit('proved'); ctx.api.celebrate(); } if (task === 'squares') ctx.ctl(); },
      click(key) {
        if (key === 'prove') {
          if (proof >= 0) { proof = -1; fitSq(); ctx.ctl(); return; }
          proof = 0; fitSq(); ctx.ctl();
          ctx.anim(3200, (k) => { proof = k; }, () => { proof = 1; ctx.emit('proved'); ctx.api.celebrate(); ctx.record(T('Saw the rearrangement proof', 'पुनर्व्यवस्था वाली उपपत्ति देखी')); });
        } else if (key === 'tool:ruler') { ruler = !ruler; ctx.ctl(); if (ruler) ctx.emit('measured:' + f1(hyp())); }
      },
      svg() {
        let s = `<g opacity=".6">${G.grid(1, 0, '#EEF2FA')}</g>`;
        if (task === 'converse') {
          const { s: sd, ok, right } = conv(), [p, q, r] = sd, B0 = V(0, 0), C0 = V(r, 0);
          if (!ok) return s + G.line(B0, C0, C.ink, 4) + G.pl(G.arcPts(B0, q, 0, 180, 60), C.royal, 2, 'stroke-dasharray="6 5"') + G.pl(G.arcPts(C0, p, 0, 180, 60), C.tang, 2, 'stroke-dasharray="6 5"') + G.text(V(r / 2, Math.max(p, q) * 0.5), tt(T('No triangle', 'त्रिभुज नहीं बनता')), 'sh-nm', 0, 0, `fill="${C.bad}"`);
          const A0 = ccx(B0, q, C0, p).find((x) => x.y > 0) || V(0, 0);
          s += G.poly([A0, B0, C0], right ? 'rgba(34,197,94,0.25)' : 'rgba(219,39,119,0.15)', C.ink, 3.5) + G.amark(B0, A0, C0, { col: right ? C.good : C.tang, rpx: 30, label: f1(angAt(B0, A0, C0)) + '°' });
          return s + G.slen(B0, C0, fn(r), A0) + G.slen(A0, B0, fn(q), C0) + G.slen(A0, C0, fn(p), B0);
        }
        if (task === 'find-side') {
          const Cc = V(0, 0), Bq = V(a, 0), Aq = V(0, b);
          s += G.poly([Aq, Bq, Cc], 'rgba(37,99,235,0.15)', C.ink, 3.5) + G.amark(Aq, Cc, Bq, { col: C.tang, rpx: 22 });
          s += G.slen(Cc, Bq, fn(a) + ' ' + tt(W.cm), Aq) + G.slen(Cc, Aq, fn(b) + ' ' + tt(W.cm), Bq) + G.slen(Aq, Bq, ruler || isDoneQ(ctx) ? f1(hyp()) + ' ' + tt(W.cm) : 'c = ?', Cc, 26, 'sh-md');
          if (ruler) s += G.ruler(Aq, Bq, Cc);
          return s;
        }
        if (proof >= 0) {
          const n = a + b, Tm = [[V(0, 0), V(a, 0), V(0, b)], [V(a, 0), V(n, 0), V(n, a)], [V(n, a), V(n, n), V(b, n)], [V(b, n), V(0, n), V(0, b)]];
          const rots = [[180, V(0, 0), V(a, n)], [0], [90, V(n, n), V(a, a)], [90, V(0, n), V(0, a)]], k = clamp((proof - 0.15) / 0.75, 0, 1), e = L.ease(k);
          s += G.poly([V(0, 0), V(n, 0), V(n, n), V(0, n)], 'rgba(255,210,63,0.30)', C.ink, 3.5);
          Tm.forEach((t, i) => { const r = rots[i]; let pts = t; if (r[0]) { const cc = rotCentre(r[1], r[2], r[0]); pts = t.map((p) => rotP(p, cc, r[0] * e)); } s += G.poly(pts, [C.royal, C.tang, C.turq, C.grape][i], '#fff', 2, 'fill-opacity=".85"'); });
          if (k < 0.05) s += G.text(V(n / 2, n / 2), 'c²', 'sh-bg');
          if (k > 0.98) s += G.text(V(a / 2, a / 2), 'a²', 'sh-bg') + G.text(V(a + b / 2, a + b / 2), 'b²', 'sh-bg');
          s += G.slen(V(0, 0), V(a, 0), 'a', V(0, 1), 16) + G.slen(V(a, 0), V(n, 0), 'b', V(n, 1), 16);
          return s;
        }
        const Cc = V(0, 0), Bq = V(a, 0), Aq = V(0, b), c = hyp();
        s += sq(Cc, Bq, C.royal, `a² = ${fn(a * a)}`, true) + sq(Aq, Cc, C.tang, `b² = ${fn(b * b)}`, true) + sq(Bq, Aq, C.pink, `c² = ${fn(a * a + b * b)}`, true);
        s += G.poly([Aq, Bq, Cc], '#FFFDF7', C.ink, 3.5) + G.amark(Aq, Cc, Bq, { col: C.ink2, rpx: 16 });
        s += G.text(mid(Cc, Bq), 'a', 'sh-nm', 0, -18) + G.text(mid(Cc, Aq), 'b', 'sh-nm', 14, 0) + G.lab(mid(Aq, Bq), 'c', Cc, 16);
        return s;
      },
      read() {
        if (task === 'converse') {
          const { s: sd, ok, right } = conv();
          if (!ok) return `<p>${tt(T('These three lengths cannot make a triangle: the two shorter sides are not longer than the longest together.', 'इन तीन लंबाइयों से त्रिभुज नहीं बनता: दो छोटी भुजाएँ मिलकर सबसे लंबी से बड़ी नहीं हैं।'))}</p>`;
          const L1 = sd[0] * sd[0] + sd[1] * sd[1], L2 = sd[2] * sd[2];
          return `<p class="sh-eq">${fn(sd[0])}² + ${fn(sd[1])}² = ${fn(L1)} ${L1 === L2 ? '=' : L1 > L2 ? '>' : '<'} ${fn(L2)} = ${fn(sd[2])}²</p><p>${tt(right ? T('Equal, so the angle opposite the longest side is exactly 90°: a right triangle!', 'बराबर, इसलिए सबसे लंबी भुजा के सामने का कोण ठीक 90° है: समकोण त्रिभुज!') : L1 > L2 ? T('Bigger: the largest angle is less than 90° (acute).', 'बड़ा: सबसे बड़ा कोण 90° से कम है (न्यून)।') : T('Smaller: the largest angle is more than 90° (obtuse).', 'छोटा: सबसे बड़ा कोण 90° से अधिक है (अधिक कोण)।'))}</p>`;
        }
        if (task === 'find-side') return ruler ? ctx.chip(`c = ${f1(hyp())} ${tt(W.cm)}`, 'ok') + `<p class="sh-eq">${fn(a)}² + ${fn(b)}² = ${fn(a * a + b * b)} = ${f1(hyp())}²</p>` : `<p>${tt(T('Work it out, then tap the ruler to measure c.', 'हल करो, फिर c मापने के लिए रूलर पर टैप करो।'))}</p>`;
        const c = hyp();
        if (proof >= 0) return `<p>${tt(proof >= 1 ? T('The big square and the four triangles are the same in both pictures. So what is left over is equal too: c² = a² + b².', 'दोनों चित्रों में बड़ा वर्ग और चारों त्रिभुज एक जैसे हैं। इसलिए बचा हुआ भाग भी बराबर है: c² = a² + b²।') : T('Watch the four triangles move inside the same big square…', 'उसी बड़े वर्ग के भीतर चारों त्रिभुजों को खिसकते देखो…'))}</p>`;
        return `<p class="sh-eq">a² + b² = ${fn(a * a)} + ${fn(b * b)} = ${fn(a * a + b * b)} = c² &nbsp; → &nbsp; c = ${f1(c)} ${tt(W.cm)}</p><p>${tt(T('In a right triangle, the square on the hypotenuse equals the sum of the squares on the other two sides.', 'समकोण त्रिभुज में कर्ण पर बना वर्ग, अन्य दो भुजाओं पर बने वर्गों के योग के बराबर होता है।'))}</p>`;
      },
    };
  }

  // ================================================================ config: tasks, validation, keys
  const TASKS = {
    identify: ['2d', '3d', 'polygons'],
    angle: ['measure', 'make', 'types', 'linear-pair', 'complementary', 'vertical', 'parallel'],
    triangle: ['angle-sum', 'classify', 'inequality', 'exterior-angle', 'median-altitude', 'area'],
    quadrilateral: ['parallelogram', 'rectangle', 'square', 'rhombus', 'trapezium', 'kite', 'general', 'angle-sum'],
    circle: ['parts', 'circumference', 'area', 'angle-centre', 'semicircle', 'cyclic', 'tangent', 'chord'],
    construct: Object.keys(CONS),
    symmetry: ['complete', 'lines', 'rotation'],
    congruence: ['sss', 'sas', 'asa', 'aas', 'rhs', 'aaa', 'ssa'],
    similarity: ['scale', 'bpt', 'aa', 'shadow'],
    transform: ['translate', 'reflect', 'rotate', 'enlarge'],
    tangram: ['square', 'triangle', 'rectangle'],
    pythagoras: ['squares', 'converse', 'find-side'],
  };
  const MAKERS = { identify: mkIdentify, angle: mkAngle, triangle: mkTriangle, quadrilateral: mkQuad, circle: mkCircle, construct: mkConstruct, symmetry: mkSymmetry, congruence: mkCongruence, similarity: mkSimilarity, transform: mkTransform, tangram: mkTangram, pythagoras: mkPythagoras };
  // what `given` each task accepts: [lengths count(s), angles count(s), ratio?]; anything else is rejected
  const GIVEN = {
    'angle:measure': { angles: [1] }, 'angle:make': { angles: [1] },
    'triangle:angle-sum': { lengths: [3, 1], angles: [2, 3] }, 'triangle:classify': { lengths: [3, 1], angles: [2, 3] }, 'triangle:exterior-angle': { lengths: [3, 1], angles: [2, 3] }, 'triangle:median-altitude': { lengths: [3, 1], angles: [2, 3] }, 'triangle:area': { lengths: [3, 1], angles: [2, 3] }, 'triangle:inequality': { lengths: [3] },
    'circle:parts': { lengths: [1] }, 'circle:circumference': { lengths: [1] }, 'circle:area': { lengths: [1] },
    'congruence:sss': { lengths: [3] }, 'congruence:sas': { lengths: [3] }, 'congruence:asa': { lengths: [3] }, 'congruence:aas': { lengths: [3] }, 'congruence:aaa': { lengths: [3] }, 'congruence:rhs': { lengths: [2] }, 'congruence:ssa': { lengths: [2], angles: [1] },
    'similarity:aa': { angles: [2] }, 'similarity:shadow': { lengths: [2] },
    'pythagoras:squares': { lengths: [2] }, 'pythagoras:converse': { lengths: [3] }, 'pythagoras:find-side': { lengths: [2] },
  };
  Object.keys(CONS).forEach((k) => { const n = CONS[k].need; if (n.lengths || n.angles || n.ratio) GIVEN['construct:' + k] = { lengths: n.lengths, angles: n.angles, ratio: n.ratio }; });
  const num = (v) => typeof v === 'number' && isFinite(v);
  const okTri = (a, b, c) => a + b > c + 0.05 && a + c > b + 0.05 && b + c > a + 0.05;
  function validate(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
    const e = [];
    Object.keys(c).forEach((k) => { if (!['mode', 'task', 'given'].includes(k)) e.push('unknown key: ' + k); });
    if (!TASKS[c.mode]) return e.concat(['mode must be one of ' + Object.keys(TASKS).join(', ')]);
    if (c.task != null && !TASKS[c.mode].includes(c.task)) return e.concat([`task for mode '${c.mode}' must be one of ${TASKS[c.mode].join(', ')}`]);
    const task = c.task || TASKS[c.mode][0], spec = GIVEN[c.mode + ':' + task];
    if (c.given == null) return e;
    const g = c.given;
    if (typeof g !== 'object' || Array.isArray(g)) return e.concat(['given must be an object { lengths?, angles?, ratio? }']);
    if (!spec) return e.concat([`given is not used by ${c.mode}/${task}; leave it out`]);
    Object.keys(g).forEach((k) => { if (!['lengths', 'angles', 'ratio'].includes(k)) e.push('unknown key in given: ' + k); else if (!spec[k]) e.push(`given.${k} is not used by ${c.mode}/${task}`); });
    if (e.length) return e;
    const Ls = g.lengths, As = g.angles;
    if (Ls != null && (!Array.isArray(Ls) || !spec.lengths.includes(Ls.length) || !Ls.every((x) => num(x) && x >= 0.5 && x <= 15))) e.push(`given.lengths: ${spec.lengths.join(' or ')} lengths in cm, each 0.5 to 15`);
    if (As != null && (!Array.isArray(As) || !spec.angles.includes(As.length) || !As.every((x) => num(x) && x > 0 && x < 180))) e.push(`given.angles: ${spec.angles.join(' or ')} angles in degrees, each between 0 and 180`);
    if (g.ratio != null && (!Array.isArray(g.ratio) || g.ratio.length !== 2 || !g.ratio.every((x) => Number.isInteger(x) && x >= 1 && x <= 9) || g.ratio[0] + g.ratio[1] > 12)) e.push('given.ratio: two whole numbers [m, n] from 1 to 9, with m + n at most 12');
    if (e.length) return e;
    const id = c.mode + ':' + task;
    // task rules: only figures that can exist and be drawn truthfully
    if (c.mode === 'angle') { const a = As && As[0]; if (a != null && (!Number.isInteger(a) || a < 1 || a > (task === 'make' ? 180 : 179))) e.push(`given.angles[0]: a whole number of degrees from 1 to ${task === 'make' ? 180 : 179}`); }
    if (c.mode === 'triangle' && task !== 'inequality') {
      if (Ls && As && Ls.length === 3) e.push('give either three lengths, or the angles (with at most one length for the size), not both');
      if (Ls && Ls.length === 1 && !As) e.push('one length needs the angles too');
      if (Ls && Ls.length === 3 && !okTri(...Ls)) e.push('given.lengths: these sides cannot make a triangle (each side must be shorter than the other two together)');
      if (As) { const s = As.reduce((x, y) => x + y, 0); if (As.length === 3 && Math.abs(s - 180) > 1e-9) e.push('given.angles: the three angles of a triangle must add up to 180'); if (As.length === 2 && s >= 179) e.push('given.angles: two angles must add up to less than 179'); }
      if (!e.length) { const P = triPlace(g); if (P) { const xs = [P.A.x, P.B.x, P.C.x], ys = [P.A.y, P.B.y, P.C.y]; if (Math.max(...xs) > TRI_BOX[2] - 0.4 || Math.max(...ys) > TRI_BOX[3] - 0.4) e.push('the triangle is too big to drag on the stage: keep it within about 9 cm wide and 7 cm tall'); if (Math.abs(area([P.A, P.B, P.C])) < 0.6) e.push('the triangle is too flat to draw'); } }
    }
    if (c.mode === 'triangle' && task === 'inequality' && Ls && !Ls.every((x) => x >= 1 && x <= 12 && Math.abs(x * 2 - Math.round(x * 2)) < 1e-9)) e.push('given.lengths: each from 1 to 12 in steps of 0.5 (the sliders)');
    if (c.mode === 'circle' && Ls) { const lim = task === 'circumference' ? [1, 4] : [1.5, 4.5]; if (Ls[0] < lim[0] || Ls[0] > lim[1] || Math.abs(Ls[0] * 2 - Math.round(Ls[0] * 2)) > 1e-9) e.push(`given.lengths[0]: the radius, ${lim[0]} to ${lim[1]} cm in steps of 0.5`); }
    if (c.mode === 'congruence' && Ls) {
      if (Ls.length === 3 && !okTri(...Ls)) e.push('given.lengths: these sides cannot make a triangle');
      if (Ls.length === 3 && Math.max(...Ls) > 9) e.push('given.lengths: keep each side at most 9 cm');
      if (task === 'rhs' && !(Ls[0] > Ls[1] + 0.3 && Ls[0] <= 9)) e.push('given.lengths: [hypotenuse, side], the hypotenuse longer than the side and at most 9 cm');
      if (task === 'ssa') { const aB = (As || [40])[0], [cc, bb] = Ls, hgt = cc * Math.sin(rad(aB)); if (!(aB < 90 && bb > hgt + 0.3 && bb < cc - 0.3 && cc <= 9)) e.push('ssa: needs [AB, AC] and an acute angle B with AB·sin B < AC < AB, so that two different triangles exist'); }
    }
    if (c.mode === 'congruence' && task === 'ssa' && As && !Ls) e.push('ssa: given.angles needs given.lengths [AB, AC] too');
    if (id === 'similarity:aa' && As && !(As[0] + As[1] < 160 && As[0] >= 20 && As[1] >= 20)) e.push('given.angles: two angles, each at least 20, adding up to less than 160');
    if (id === 'similarity:shadow' && Ls && !(Ls[0] >= 0.5 && Ls[0] <= 3 && Ls[1] > Ls[0] && Ls[1] <= 15)) e.push('given.lengths: [stick height 0.5 to 3 m, tree height taller than the stick, at most 15 m]');
    if (c.mode === 'pythagoras' && Ls) {
      if (task === 'squares' && !Ls.every((x) => Number.isInteger(x) && x >= 1 && x <= 6)) e.push('given.lengths: two whole numbers from 1 to 6 (the sliders)');
      if (task === 'converse' && !Ls.every((x) => x >= 1 && x <= 10 && Math.abs(x * 2 - Math.round(x * 2)) < 1e-9)) e.push('given.lengths: three lengths from 1 to 10 in steps of 0.5');
      if (task === 'find-side' && !Ls.every((x) => x >= 1 && x <= 12)) e.push('given.lengths: the two shorter sides, each 1 to 12 cm');
    }
    if (c.mode === 'construct' && !e.length) {
      const d = CONS[task], gg = Object.assign({}, d.def, g);
      if (Ls && d.need.lengths && Ls.length !== d.need.lengths[0]) e.push(`given.lengths: ${task} needs ${d.need.lengths[0]}`);
      if (As && d.need.angles && As.length !== d.need.angles[0]) e.push(`given.angles: ${task} needs ${d.need.angles[0]}`);
      if (e.length) return e;
      const L0 = gg.lengths || [], A0 = gg.angles || [];
      if (L0.some((x) => x < 1 || x > 12)) e.push('given.lengths: each from 1 to 12 cm for a construction');
      if (task === 'circle-radius' && L0[0] > 6) e.push('given.lengths[0]: the radius, at most 6 cm');
      if (task === 'perpendicular-from-point' && L0[0] > 6) e.push('given.lengths[0]: the distance of the point from the line, at most 6 cm');
      if (task === 'parallel-line' && (L0[0] < 1.5 || L0[0] > 6)) e.push('given.lengths[0]: the distance between the lines, 1.5 to 6 cm');
      if (task === 'perpendicular-bisector' && L0[0] < 2) e.push('given.lengths[0]: at least 2 cm');
      if (task === 'bisect-angle' && (A0[0] < 20 || A0[0] > 170)) e.push('given.angles[0]: an angle from 20 to 170 degrees');
      if (task === 'triangle-sss' && !okTri(...L0)) e.push('given.lengths [BC, CA, AB]: these sides cannot make a triangle');
      if (task === 'triangle-sas' && (A0[0] < 10 || A0[0] > 170)) e.push('given.angles[0]: angle B from 10 to 170 degrees');
      if (task === 'triangle-asa' && (A0[0] + A0[1] > 165 || A0[0] < 10 || A0[1] < 10)) e.push('given.angles [B, C]: each at least 10, and B + C at most 165 so the rays meet on the stage');
      if (task === 'triangle-rhs' && !(L0[0] > L0[1] + 0.3)) e.push('given.lengths [hypotenuse, side]: the hypotenuse must be longer than the side');
      if (task === 'tangent-from-point' && !(L0[1] > L0[0] + 0.8 && L0[0] >= 1.5 && L0[0] <= 6)) e.push('given.lengths [r, d]: radius 1.5 to 6 cm and the point at least 0.8 cm outside the circle (d > r)');
      if (task === 'divide-segment' && L0[0] < 3) e.push('given.lengths[0]: at least 3 cm');
    }
    return e;
  }
  function keys(c) {
    if (!c || !TASKS[c.mode]) return { targets: [], events: [] };
    const task = c.task || TASKS[c.mode][0], A = ['answered:right', 'answered:wrong'];
    const K = {
      identify: () => ({ targets: ['answer', 'next'].concat(task === '3d' ? ['slider:turn'] : task === 'polygons' ? ['show:diagonals'] : []), events: A.concat(task === 'polygons' ? ['drawn'] : []) }),
      angle: () => ({
        measure: { targets: ['tool:protractor', 'drag:B', 'answer'], events: ['measured:*'].concat(A) }, make: { targets: ['tool:protractor', 'drag:B'], events: ['measured:*', 'constructed'] },
        types: { targets: ['drag:B'], events: ['measured:*', 'answered:right'] }, parallel: { targets: ['drag:T', 'slider:tilt', 'pair:corresponding', 'pair:alternate', 'pair:interior'], events: ['measured:*', 'proved'] },
      }[task] || { targets: ['drag:B'], events: ['measured:*', 'proved'] }),
      triangle: () => {
        if (task === 'inequality') return { targets: ['slider:a', 'slider:b', 'slider:c'], events: ['drawn', 'constructed'] };
        const t = ['drag:A', 'drag:B', 'drag:C'], ev = [];
        if (['classify', 'median-altitude', 'area'].includes(task)) { t.push('tool:ruler'); ev.push('measured:*'); }
        if (['angle-sum', 'classify', 'exterior-angle'].includes(task)) { t.push('tool:protractor'); if (!ev.length) ev.push('measured:*'); }
        if (task === 'angle-sum') { t.push('prove'); ev.push('proved'); }
        if (task === 'exterior-angle') ev.push('proved');
        if (task === 'classify') ev.push('answered:right');
        if (task === 'median-altitude') { t.push('show:medians', 'show:altitudes'); ev.push('drawn'); }
        return { targets: t, events: ev };
      },
      quadrilateral: () => ({ targets: ['drag:A', 'drag:B', 'drag:C', 'drag:D', 'tool:ruler', 'tool:protractor', 'show:diagonals', 'answer'].concat(task === 'angle-sum' ? ['prove'] : []), events: ['measured:*', 'drawn'].concat(A, task === 'angle-sum' ? ['proved'] : []) }),
      circle: () => ({
        parts: { targets: ['slider:radius', 'answer', 'next'], events: A.concat(['drawn']) }, circumference: { targets: ['slider:radius', 'roll'], events: ['measured:*', 'drawn'] }, area: { targets: ['slider:sectors', 'rearrange'], events: ['proved', 'drawn'] },
        'angle-centre': { targets: ['drag:A', 'drag:B', 'drag:P'], events: ['proved', 'measured:*'] }, semicircle: { targets: ['drag:P'], events: ['proved'] }, cyclic: { targets: ['drag:A', 'drag:B', 'drag:C', 'drag:D'], events: ['proved'] },
        tangent: { targets: ['drag:P', 'drag:E'], events: ['proved', 'measured:*'] }, chord: { targets: ['drag:A', 'drag:B'], events: ['proved', 'measured:*'] },
      }[task]),
      construct: () => ({ targets: ['tool:ruler', 'tool:compass', 'tool:protractor', 'point:*', 'reset'], events: ['drawn', 'constructed', 'measured:*'] }),
      symmetry: () => ({ complete: { targets: ['cell:*', 'mirror', 'next'], events: ['drawn', 'symmetric'] }, lines: { targets: ['mirror', 'answer', 'next'], events: ['symmetric'].concat(A) }, rotation: { targets: ['slider:turn', 'answer', 'next'], events: ['symmetric'].concat(A) } }[task]),
      congruence: () => ({ targets: ['drag:T2', 'answer', 'reset'], events: (RULES.includes(task.toUpperCase()) ? ['congruent'] : []).concat(A) }),
      similarity: () => ({ scale: { targets: ['slider:scale'], events: ['similar', 'drawn'] }, bpt: { targets: ['drag:D', 'drag:A'], events: ['proved', 'measured:*'] }, aa: { targets: ['tool:protractor', 'tool:ruler', 'answer'], events: ['measured:*', 'similar'].concat(A) }, shadow: { targets: ['slider:sun', 'tool:ruler', 'answer'], events: ['measured:*', 'drawn'].concat(A) } }[task]),
      transform: () => ({ translate: { targets: ['slider:dx', 'slider:dy'], events: ['drawn', 'answered:right'] }, reflect: { targets: ['mirror', 'answer'], events: ['drawn'].concat(A) }, rotate: { targets: ['slider:angle', 'answer'], events: ['drawn'].concat(A) }, enlarge: { targets: ['slider:scale', 'answer'], events: ['drawn'].concat(A) } }[task]),
      tangram: () => ({ targets: ['piece:*', 'flip', 'reset', 'next'], events: ['drawn', 'constructed'] }),
      pythagoras: () => ({ squares: { targets: ['slider:a', 'slider:b', 'prove'], events: ['proved', 'drawn'] }, converse: { targets: ['slider:a', 'slider:b', 'slider:c'], events: ['proved', 'drawn'] }, 'find-side': { targets: ['tool:ruler', 'answer'], events: ['measured:*'].concat(A) } }[task]),
    };
    return K[c.mode]();
  }

  NCA_T.register({
    id: 'shapes',
    css: CSS,
    validate,
    keys,
    demo: { mode: 'pythagoras', task: 'squares', given: { lengths: [3, 4] } },
    modes: TASKS,
    // pure helpers, for tests under Node
    model: { tanCover, TAN, TAN_T, ccx, lcx, llx, angAt, roundSum, triKinds, quadInfo, symLines, rotOrder, polyCounts, CONS, triPlace },
    mount(root, config, api) { return studio(root, config, api); },
  });
})();
