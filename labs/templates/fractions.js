// Template: Fraction kitchen. Cut a roti, a chocolate bar, a pizza or a juice jar into equal parts, shade some of them,
// and see the fraction on a number line. With a second bar the child compares, adds, subtracts or finds equivalent
// fractions; the arithmetic (common denominators, cross products, simplest form, mixed numbers) is computed in code,
// so the words on the screen are always true. Config:
//   { object: 'roti'|'bar'|'pizza'|'jar',
//     bars: [{ n: 1-12 equal parts, k?: parts shaded at the start, lock?: true (a fixed bar the child only reads) }] (1-2 bars),
//     op?: 'compare'|'add'|'subtract'|'equivalent' (needs 2 bars; two bars with no op behave as 'compare') }
// A cut resets the shading; in 'equivalent' the child can also cut every part again (x2, x3) or join parts, which keeps
// the shaded amount the same. The jar fills from the bottom: tapping a layer fills up to it.
(function () {
  const L = window.NCA_LIB;
  const { esc } = L;
  const T = (en, hi) => ({ en, hi });
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const lcm = (a, b) => (a / gcd(a, b)) * b;
  const simp = (k, n) => (k === 0 ? [0, 1] : [k / gcd(k, n), n / gcd(k, n)]);
  const f2 = (v) => Math.round(v * 100) / 100;
  const OBJECTS = ['roti', 'bar', 'pizza', 'jar'];
  const OPS = ['compare', 'add', 'subtract', 'equivalent'];
  const MAXN = 12;

  // Words for each object: what a part is called and what the child does to it.
  const OBJ = {
    roti: { name: T('Roti', 'रोटी'), one: T('piece', 'टुकड़ा'), many: T('pieces', 'टुकड़े'), obl: 'टुकड़ों', verb: T('shaded', 'रंगे'), verb1: T('shaded', 'रंगा') },
    bar: { name: T('Chocolate bar', 'चॉकलेट बार'), one: T('piece', 'टुकड़ा'), many: T('pieces', 'टुकड़े'), obl: 'टुकड़ों', verb: T('shaded', 'रंगे'), verb1: T('shaded', 'रंगा') },
    pizza: { name: T('Pizza', 'पिज़्ज़ा'), one: T('slice', 'टुकड़ा'), many: T('slices', 'टुकड़े'), obl: 'टुकड़ों', verb: T('taken', 'निकाले'), verb1: T('taken', 'निकाला') },
    jar: { name: T('Juice jar', 'जूस का जार'), one: T('layer', 'परत'), many: T('layers', 'परतें'), obl: 'परतों', verb: T('filled', 'भरी'), verb1: T('filled', 'भरी') },
  };

  // ---------------------------------------------------------------- pure checks (also used by validate under Node)
  function checkBar(b, where) {
    const e = [];
    if (!b || typeof b !== 'object' || Array.isArray(b)) return [where + ': must be an object { n, k?, lock? }'];
    Object.keys(b).forEach((x) => { if (!['n', 'k', 'lock'].includes(x)) e.push(`${where}: unknown key ${x}`); });
    if (!Number.isInteger(b.n) || b.n < 1 || b.n > MAXN) e.push(`${where}: n must be a whole number from 1 to ${MAXN}`);
    else if (b.k != null && (!Number.isInteger(b.k) || b.k < 0 || b.k > b.n)) e.push(`${where}: k must be a whole number from 0 to n (${b.n})`);
    if (b.k != null && !Number.isInteger(b.k)) e.push(`${where}: k must be a whole number`);
    if (b.lock != null && typeof b.lock !== 'boolean') e.push(`${where}: lock must be true or false`);
    if (b.lock === true && !(b.k > 0)) e.push(`${where}: a locked bar needs k of at least 1 (it is shown, not changed)`);
    return e;
  }
  function validate(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
    const e = [];
    Object.keys(c).forEach((x) => { if (!['object', 'bars', 'op'].includes(x)) e.push('unknown key: ' + x); });
    if (!OBJECTS.includes(c.object)) e.push('object must be one of ' + OBJECTS.join(', '));
    if (!Array.isArray(c.bars) || c.bars.length < 1 || c.bars.length > 2) { e.push('bars: 1 or 2 bars'); return e; }
    c.bars.forEach((b, i) => e.push(...checkBar(b, `bars[${i}]`)));
    if (c.op != null) {
      if (!OPS.includes(c.op)) e.push('op must be one of ' + OPS.join(', '));
      else if (c.bars.length !== 2) e.push(`op '${c.op}' needs 2 bars`);
    }
    if (c.bars.every((b) => b && b.lock === true)) e.push('at least one bar must be unlocked');
    if (c.op === 'subtract' && c.bars.length === 2 && !e.length) {
      const [a, b] = c.bars;
      if ((a.k || 0) * b.n < (b.k || 0) * a.n) e.push('subtract: the first bar must start at least as full as the second');
    }
    return e;
  }
  function keys(c) {
    const bars = c && Array.isArray(c.bars) ? c.bars : [];
    const targets = [], events = [];
    bars.forEach((b, i) => {
      if (!b || b.lock) return;
      targets.push('cut:' + i, 'piece:' + i);
      for (let n = 1; n <= MAXN; n++) events.push(`cut:${i}:${n}`);
      events.push(`shade:${i}:*`);
      if (c.op === 'equivalent') { targets.push('refine:' + i); events.push(`refine:${i}:2`, `refine:${i}:3`, `refine:${i}:join`); }
    });
    if (bars.length === 2) {
      events.push('equal');
      if (!c.op || c.op === 'compare') events.push('bigger:0', 'bigger:1');
      if (c.op === 'add') events.push('sum:*');
      if (c.op === 'subtract') events.push('diff:*');
    }
    return { targets, events };
  }

  // ---------------------------------------------------------------- the arithmetic the panel shows
  const fmtMixed = (p, q) => { const w = Math.floor(p / q), r = p % q; return r === 0 ? String(w) : w === 0 ? `${r}/${q}` : `${w} ${r}/${q}`; };
  const isFinite10 = (d) => { while (d % 2 === 0) d /= 2; while (d % 5 === 0) d /= 5; return d === 1; };
  const trim = (v, dp) => String(Number(v.toFixed(dp)));
  function decimalOf(k, n) {
    const [, d] = simp(k, n);
    const ok = isFinite10(d);
    return { dec: (ok ? '' : '≈ ') + trim(k / n, ok ? 4 : 2), pct: (ok ? '' : '≈ ') + trim((k / n) * 100, 2) + '%' };
  }
  // Everything a two-bar panel needs for one state: [k1,n1], [k2,n2].
  function relation(a, b) {
    const [k1, n1] = a, [k2, n2] = b;
    const cross1 = k1 * n2, cross2 = k2 * n1;
    const Lc = lcm(n1, n2);
    return { k1, n1, k2, n2, cross1, cross2, sign: cross1 === cross2 ? '=' : cross1 > cross2 ? '>' : '<', L: Lc, a: (k1 * Lc) / n1, b: (k2 * Lc) / n2 };
  }

  // ---------------------------------------------------------------- CSS
  const CSS = `
.fk { --fk-a: var(--grape); --fk-b: #C2410C; display: flex; flex-direction: column; gap: 14px; color: var(--ink); font-family: var(--font-body); min-width: 0; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .fk { --fk-b: #FFA05C; } }
:root[data-theme="dark"] .fk { --fk-b: #FFA05C; }
.fk-bars { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 290px), 1fr)); gap: 14px; }
.fk-card { --fk-id: var(--fk-a); background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 12px; display: flex; flex-direction: column; gap: 8px; min-width: 0; box-shadow: 0 4px 14px rgba(15,23,42,.08); }
.fk-card[data-bar="1"] { --fk-id: var(--fk-b); }
.fk-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.fk-big { display: inline-flex; flex-direction: column; align-items: center; font-family: var(--font-display); font-weight: 800; font-size: 1.8rem; line-height: 1; min-width: 46px; color: var(--fk-id); }
.fk-num { border-bottom: 3px solid currentColor; padding: 0 8px 3px; }
.fk-den { padding-top: 3px; }
.fk-say { font-weight: 700; flex: 1; min-width: 150px; font-size: 1rem; }
.fk-pill { border-radius: 99px; background: var(--sunk); border: 1px solid var(--line); padding: 6px 12px; font-weight: 700; font-size: .85rem; color: var(--ink-2); }
.fk-step { display: inline-flex; align-items: center; border: 2px solid var(--fk-id); border-radius: 14px; overflow: hidden; background: var(--surface); }
.fk-step button { border: 0; background: var(--sunk); color: var(--ink); width: 48px; height: 46px; font-size: 1.5rem; font-weight: 800; cursor: pointer; font-family: var(--font-display); }
.fk-step button:hover { background: var(--grape-t); }
.fk-step button:focus-visible, .fk-ref button:focus-visible { outline: 3px solid var(--sun); outline-offset: -3px; }
.fk-step output { min-width: 44px; text-align: center; font-family: var(--font-display); font-weight: 800; font-size: 1.3rem; }
.fk-chips { display: flex; flex-wrap: wrap; gap: 6px; min-height: 0; }
.fk-chip { background: var(--sun-t); border: 1px solid var(--sun); border-radius: 99px; padding: 3px 10px; font-weight: 700; font-size: .85rem; }
.fk-ref { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: .85rem; font-weight: 700; color: var(--ink-2); }
.fk-ref button { min-height: 44px; min-width: 52px; padding: 0 12px; border-radius: 12px; border: 1.5px solid var(--fk-id); background: var(--surface); color: var(--ink); font-weight: 800; cursor: pointer; font-family: var(--font-display); }
.fk-ref button:hover:not(:disabled) { background: var(--grape-t); }
.fk-ref button:disabled { opacity: .4; cursor: not-allowed; }
.fk-svg { width: 100%; height: auto; display: block; margin-inline: auto; max-width: 460px; touch-action: manipulation; }
.fk-svg.fk-bar { max-width: 580px; }
.fk-pc { cursor: pointer; transition: transform .35s cubic-bezier(.3,1.4,.5,1), filter .3s; outline: none; }
.fk-pc.fk-fixed { cursor: default; }
.fk-pc.on { transform: translate(var(--dx), var(--dy)); filter: drop-shadow(0 4px 4px rgba(30,20,10,.35)); }
.fk-jar .fk-pc.on, .fk-bar .fk-pc.on { transform: none; filter: none; }
.fk-pc:not(.fk-fixed):hover .fk-hov { opacity: .22; }
.fk-pc:focus-visible .fk-focus { opacity: 1; }
.fk-hov { fill: #fff; opacity: 0; transition: opacity .2s; pointer-events: none; }
.fk-focus { fill: none; stroke: var(--sun); stroke-width: 5; opacity: 0; pointer-events: none; }
.fk-tint { fill: var(--fk-id); opacity: 0; transition: opacity .3s; pointer-events: none; }
.fk-pc.on .fk-tint { opacity: .32; }
.fk-ring { fill: none; stroke: var(--fk-id); stroke-width: 5; opacity: 0; transition: opacity .3s; pointer-events: none; stroke-linejoin: round; }
.fk-pc.on .fk-ring { opacity: 1; }
.fk-choc-top { transition: fill .3s; }
.fk-pc.on .fk-choc-base { fill: #F29A2E; }
.fk-pc.on .fk-choc-top { fill: #FFC670; }
.fk-pc.on .fk-choc-hi { fill: #FFF3D6; opacity: .75; }
.fk-cut { fill: none; stroke: #6B3F18; stroke-width: 3; stroke-linecap: round; opacity: 0; pointer-events: none; }
.fk-pizza .fk-cut { stroke: #B8741F; }
.fk-new .fk-cut { stroke-dasharray: 1; stroke-dashoffset: 1; opacity: .8; animation: fk-draw .5s ease-out forwards, fk-fade .4s ease-in .7s forwards; }
@keyframes fk-fade { to { opacity: 0; } }
@keyframes fk-draw { to { stroke-dashoffset: 0; } }
.fk-new .fk-pc { animation: fk-pop .45s cubic-bezier(.3,1.5,.5,1); }
@keyframes fk-pop { from { opacity: .2; scale: .94; } to { opacity: 1; scale: 1; } }
.fk-jl { stroke: #fff; stroke-width: 3; stroke-dasharray: 6 5; opacity: .85; pointer-events: none; }
.fk-liquid { transition: transform .6s cubic-bezier(.3,1.2,.4,1); }
.fk-lvl { transition: transform .6s cubic-bezier(.3,1.2,.4,1); }
.fk-bub { animation: fk-bub 3.2s ease-in infinite; }
@keyframes fk-bub { from { transform: translateY(0); opacity: .8; } to { transform: translateY(-70px); opacity: 0; } }
.fk-nl { width: 100%; height: auto; display: block; }
.fk-nl-track { fill: var(--line); }
.fk-nl-fill { fill: var(--fk-id); transform-box: fill-box; transform-origin: 0 50%; transition: transform .45s cubic-bezier(.3,1.2,.4,1); }
.fk-nl-tick { stroke: var(--ink-2); stroke-width: 2.5; }
.fk-nl-lab { font: 800 22px var(--font-display); fill: var(--ink-2); }
.fk-mk { transition: transform .45s cubic-bezier(.3,1.2,.4,1); }
.fk-mk circle { fill: var(--fk-id); stroke: var(--surface); stroke-width: 3; }
.fk-mk text { font: 800 23px var(--font-display); fill: var(--fk-id); paint-order: stroke; stroke: var(--surface); stroke-width: 5px; }
.fk-panel { background: var(--surface); border: 1px solid var(--line); border-left: 6px solid var(--royal); border-radius: 18px; padding: 14px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 4px 14px rgba(15,23,42,.08); min-width: 0; }
.fk-panel.is-eq { border-left-color: var(--good); }
.fk-headline { margin: 0; font: 800 1.15rem/1.35 var(--font-display); }
.fk-eq { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 10px; font-family: var(--font-display); font-weight: 800; font-size: 1.15rem; }
.fk-fr { display: inline-flex; flex-direction: column; align-items: center; line-height: 1.05; font-size: 1.35rem; }
.fk-fr b { font-weight: 800; padding: 0 6px 2px; border-bottom: 3px solid currentColor; }
.fk-fr i { font-style: normal; font-weight: 800; padding-top: 2px; }
.fk-fr.a { color: var(--fk-a); } .fk-fr.b { color: var(--fk-b); } .fk-fr.r { color: var(--good); }
.fk-op { color: var(--ink-2); font-size: 1.3rem; padding: 0 2px; }
.fk-whole { font-size: 1.6rem; color: var(--good); }
.fk-why { margin: 0; color: var(--ink-2); font-size: .95rem; line-height: 1.45; }
.fk-why b { color: var(--ink); }
.fk-axis { width: 100%; max-width: 640px; margin-inline: auto; height: auto; display: block; background: var(--sunk); border-radius: 12px; }
.fk-axis text { font: 800 22px var(--font-display); }
.fk-ca { stroke: var(--fk-a); } .fk-cb { stroke: var(--fk-b); } .fk-cr { stroke: var(--good); }
.fk-ta { fill: var(--fk-a); } .fk-tb { fill: var(--fk-b); } .fk-tr { fill: var(--good); } .fk-tk { fill: var(--ink-2); }
.fk-arc { fill: none; stroke-width: 5; stroke-linecap: round; }
.fk-ah.fk-ca { fill: var(--fk-a); } .fk-ah.fk-cb { fill: var(--fk-b); }
.fk-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: fk-draw .8s ease-out .1s forwards; }
.fk-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) {
  .fk *, .fk *::before, .fk *::after { animation: none !important; transition: none !important; }
  .fk-draw { stroke-dashoffset: 0 !important; }
  .fk-new .fk-cut { opacity: 0 !important; }
}
`;

  // ---------------------------------------------------------------- mount
  let UID = 0;
  function mount(root, cfg, api) {
    const uid = 'fk' + ++UID;
    const tt = (en, hi) => api.t({ en, hi });
    const o = OBJ[cfg.object];
    const op = cfg.bars.length === 2 ? cfg.op || 'compare' : null;
    const bars = cfg.bars.map((b) => ({ n: b.n, sh: new Set(Array.from({ length: b.k || 0 }, (_, i) => i)), lock: !!b.lock }));
    const noun = (n) => api.t(n === 1 ? o.one : o.many);
    const kOf = (b) => b.sh.size;
    const val = (b) => [kOf(b), b.n];
    let wasEqual = false;
    let destroyed = false;
    const nameT = api.t(o.name);

    root.innerHTML = `<div class="fk"><div class="fk-bars">${bars.map((b, i) => `<div class="fk-card" data-bar="${i}"></div>`).join('')}</div>${op ? '<div class="fk-panel" data-panel></div>' : ''}</div>`;
    const cards = bars.map((b, i) => root.querySelector(`[data-bar="${i}"]`));
    const panelEl = root.querySelector('[data-panel]');

    // ---- text helpers
    const frT = (k, n) => `${k}/${n}`;
    const frH = (k, n, cls) => `<span class="fk-fr ${cls || ''}" role="img" aria-label="${k} ${tt('by', 'बटा')} ${n}"><b>${k}</b><i>${n}</i></span>`;
    const opH = (s) => `<span class="fk-op">${s}</span>`;
    const mixedH = (p, q, cls) => { const w = Math.floor(p / q), r = p % q; return (w ? `<span class="fk-whole">${w}</span>` : '') + (r ? frH(r, q, cls) : '') || '<span class="fk-whole">0</span>'; };

    // ---- the objects. Each returns the inner SVG of the stage; piece <g> carry data-p.
    const pieceG = (i, b, p, inner, dx, dy) =>
      `<g class="fk-pc${b.sh.has(p) ? ' on' : ''}${b.lock ? ' fk-fixed' : ''}" data-p="${p}" style="--dx:${f2(dx)}px;--dy:${f2(dy)}px" ${b.lock ? 'role="img"' : 'role="button" tabindex="0" aria-pressed="false"'}>${inner}</g>`;
    const wedge = (cx, cy, r, a0, a1, n) => {
      if (n === 1) return `M${cx - r} ${cy}A${r} ${r} 0 1 1 ${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx - r} ${cy}Z`;
      const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      return `M${cx} ${cy}L${f2(x0)} ${f2(y0)}A${r} ${r} 0 ${a1 - a0 > Math.PI + 1e-6 ? 1 : 0} 1 ${f2(x1)} ${f2(y1)}Z`;
    };
    const rng = (seed) => { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
    const CX = 200, CY = 150;

    function tableBg(w, h) {
      return `<defs><pattern id="${uid}-chk" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#FFF6E6"/><rect width="20" height="40" fill="#FFE2C2" opacity=".55"/><rect width="40" height="20" fill="#FFD3A3" opacity=".35"/></pattern></defs><rect width="${w}" height="${h}" rx="22" fill="url(#${uid}-chk)"/>`;
    }
    function roti(i, b) {
      const n = b.n, span = (2 * Math.PI) / n, R = 128;
      const spots = Array.from({ length: 16 }, (_, j) => { const r = rng(j + 3), ang = r() * 2 * Math.PI, rad = 18 + r() * 96; return { ang, x: CX + rad * Math.cos(ang), y: CY + rad * Math.sin(ang), s: 4 + r() * 8 }; });
      const pieceOf = (ang) => Math.min(n - 1, Math.floor((((ang + Math.PI / 2) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / span));
      let out = `${tableBg(400, 300)}<defs><radialGradient id="${uid}-rg" cx=".42" cy=".38" r=".75"><stop offset="0" stop-color="#F7DDA8"/><stop offset=".65" stop-color="#E5B873"/><stop offset="1" stop-color="#C98E48"/></radialGradient></defs>`;
      out += `<ellipse cx="${CX}" cy="${CY + 6}" rx="${R + 12}" ry="${R + 8}" fill="#000" opacity=".12"/><circle cx="${CX}" cy="${CY}" r="${R + 10}" fill="#EEF2F8" stroke="#D3DAE6" stroke-width="2"/>`;
      out += '<g class="fk-pieces"' + (b.lock ? '' : ` data-key="piece:${i}"`) + '>';
      for (let p = 0; p < n; p++) {
        const a0 = p * span - Math.PI / 2, a1 = (p + 1) * span - Math.PI / 2, am = (a0 + a1) / 2;
        const d = wedge(CX, CY, R, a0, a1, n);
        const sp = spots.filter((s) => pieceOf(s.ang) === p).map((s) => `<ellipse cx="${f2(s.x)}" cy="${f2(s.y)}" rx="${f2(s.s)}" ry="${f2(s.s * 0.7)}" fill="#8A4F1F" opacity=".32"/>`).join('');
        const inner = `<path d="${d}" fill="url(#${uid}-rg)" stroke="#B27A36" stroke-width="1.5"/>${sp}<path d="${d}" class="fk-tint"/><path d="${d}" class="fk-hov"/><path d="${d}" class="fk-ring"/><path d="${d}" class="fk-focus"/>`;
        out += pieceG(i, b, p, inner, n === 1 ? 0 : 14 * Math.cos(am), n === 1 ? 0 : 14 * Math.sin(am));
      }
      out += '</g>';
      out += n > 1 ? cutLines(n, R, -Math.PI / 2) : '';
      return out;
    }
    function cutLines(n, R, start) {
      return Array.from({ length: n }, (_, p) => { const a = start + (p * 2 * Math.PI) / n; return `<line class="fk-cut" pathLength="1" x1="${CX}" y1="${CY}" x2="${f2(CX + R * Math.cos(a))}" y2="${f2(CY + R * Math.sin(a))}"/>`; }).join('');
    }
    function pizza(i, b) {
      const n = b.n, span = (2 * Math.PI) / n, R = 130, Rc = 113;
      let out = `${tableBg(400, 300)}<defs><radialGradient id="${uid}-pc" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#FFE59A"/><stop offset="1" stop-color="#F4B63D"/></radialGradient><radialGradient id="${uid}-pr" cx=".5" cy=".5" r=".6"><stop offset=".8" stop-color="#E3A455"/><stop offset="1" stop-color="#C57A28"/></radialGradient></defs>`;
      out += `<ellipse cx="${CX}" cy="${CY + 7}" rx="${R + 14}" ry="${R + 9}" fill="#000" opacity=".14"/><circle cx="${CX}" cy="${CY}" r="${R + 11}" fill="#9A6B3F"/><circle cx="${CX}" cy="${CY}" r="${R + 8}" fill="#B58353"/>`;
      out += '<g class="fk-pieces"' + (b.lock ? '' : ` data-key="piece:${i}"`) + '>';
      for (let p = 0; p < n; p++) {
        const a0 = p * span - Math.PI / 2, a1 = (p + 1) * span - Math.PI / 2, am = (a0 + a1) / 2;
        const d = wedge(CX, CY, R, a0, a1, n), dc = wedge(CX, CY, Rc, a0, a1, n);
        const r = rng(p * 7 + n);
        const count = n === 1 ? 9 : n <= 3 ? 4 : n <= 6 ? 3 : 2;
        let tops = '';
        for (let t = 0; t < count; t++) {
          const rad = n === 1 ? 20 + r() * 82 : 28 + ((t + 0.5) / count) * 78 + (r() - 0.5) * 8;
          const ang = n === 1 ? r() * 2 * Math.PI : am + (r() - 0.5) * span * 0.45;
          const x = CX + rad * Math.cos(ang), y = CY + rad * Math.sin(ang);
          const sz = n === 1 ? 10 : Math.max(4.5, Math.min(11, span * rad * 0.22));
          const kind = (p + t) % 3;
          if (kind === 0) tops += `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(sz)}" fill="#D93B2B"/><circle cx="${f2(x - sz * 0.25)}" cy="${f2(y - sz * 0.25)}" r="${f2(sz * 0.45)}" fill="#F26B55" opacity=".8"/>`;
          else if (kind === 1) tops += `<path d="M${f2(x - sz)} ${f2(y)}a${f2(sz)} ${f2(sz)} 0 0 1 ${f2(sz * 2)} 0" fill="none" stroke="#2E9B4E" stroke-width="${f2(Math.max(3, sz * 0.5))}" stroke-linecap="round"/>`;
          else tops += `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(sz * 0.7)}" fill="none" stroke="#2A2A2E" stroke-width="${f2(Math.max(2.5, sz * 0.4))}"/>`;
        }
        const inner = `<path d="${d}" fill="url(#${uid}-pr)"/><path d="${dc}" fill="url(#${uid}-pc)"/>${tops}<path d="${d}" fill="none" stroke="#B8741F" stroke-width="2"/><path d="${d}" class="fk-hov"/><path d="${d}" class="fk-ring"/><path d="${d}" class="fk-focus"/>`;
        out += pieceG(i, b, p, inner, n === 1 ? 0 : 16 * Math.cos(am), n === 1 ? 0 : 16 * Math.sin(am));
      }
      out += '</g>';
      out += n > 1 ? cutLines(n, R, -Math.PI / 2) : '';
      return out;
    }
    function barGrid(n) { // a chocolate bar is a grid: rows of equal pieces (a prime or small n stays in one row)
      let rows = 1;
      if (n >= 8) for (let r = 2; r <= n; r++) if (n % r === 0) { rows = r; break; }
      return { rows, cols: n / rows };
    }
    function bar(i, b) {
      const n = b.n, { rows, cols } = barGrid(n);
      const X0 = 22, Y0 = 20, W = 556, H = 160, gap = 5;
      const cw = W / cols, ch = H / rows;
      let out = `${tableBg(600, 200)}<defs><linearGradient id="${uid}-ch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7A4528"/><stop offset="1" stop-color="#4B2614"/></linearGradient></defs>`;
      out += `<rect x="${X0 - 8}" y="${Y0 - 8}" width="${W + 16}" height="${H + 16}" rx="16" fill="#2E170B"/>`;
      out += '<g class="fk-pieces"' + (b.lock ? '' : ` data-key="piece:${i}"`) + '>';
      for (let p = 0; p < n; p++) {
        const r = Math.floor(p / cols), c = p % cols;
        const x = X0 + c * cw + gap / 2, y = Y0 + r * ch + gap / 2, w = cw - gap, h = ch - gap;
        const inset = Math.min(14, w * 0.16, h * 0.16);
        const inner = `<rect class="fk-choc-base" x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" rx="9" fill="url(#${uid}-ch)"/><rect class="fk-choc-top" x="${f2(x + inset)}" y="${f2(y + inset)}" width="${f2(w - 2 * inset)}" height="${f2(h - 2 * inset)}" rx="6" fill="#5E3219"/><rect class="fk-choc-hi" x="${f2(x + inset + 3)}" y="${f2(y + inset + 3)}" width="${f2(Math.max(4, w - 2 * inset - 6))}" height="${f2(Math.min(10, h * 0.12))}" rx="4" fill="#fff" opacity=".13"/><rect class="fk-hov" x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" rx="9"/><rect class="fk-ring" x="${f2(x + 1)}" y="${f2(y + 1)}" width="${f2(w - 2)}" height="${f2(h - 2)}" rx="9"/><rect class="fk-focus" x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" rx="9"/>`;
        out += pieceG(i, b, p, inner, 0, 0);
      }
      out += '</g>';
      return out;
    }
    const JAR = 'M130 44H270V62Q292 70 292 98V252Q292 278 266 278H134Q108 278 108 252V98Q108 70 130 62Z';
    const JY0 = 80, JY1 = 270, JH = 190;
    function jar(i, b) {
      const n = b.n, lh = JH / n;
      let out = `${tableBg(400, 300)}<defs><clipPath id="${uid}-jc"><path d="${JAR}"/></clipPath><linearGradient id="${uid}-jl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFC947"/><stop offset="1" stop-color="#F57C14"/></linearGradient><linearGradient id="${uid}-jg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".25" stop-color="#fff" stop-opacity=".08"/><stop offset=".85" stop-color="#fff" stop-opacity=".02"/><stop offset="1" stop-color="#fff" stop-opacity=".35"/></linearGradient></defs>`;
      out += `<ellipse cx="200" cy="282" rx="104" ry="11" fill="#000" opacity=".16"/>`;
      out += `<path d="${JAR}" fill="#EAF4FB" opacity=".85"/>`;
      out += `<g clip-path="url(#${uid}-jc)"><g class="fk-liquid" data-liquid style="transform:translateY(${JH}px)"><rect x="100" y="${JY0}" width="200" height="${JH + 12}" fill="url(#${uid}-jl)"/><rect x="100" y="${JY0}" width="200" height="8" fill="#FFE29A" opacity=".8"/>${[0, 1, 2, 3].map((j) => `<circle class="fk-bub" cx="${130 + j * 40}" cy="${JY1 - 8}" r="${3 + (j % 2) * 2}" fill="#fff" opacity=".6" style="animation-delay:${j * 0.7}s"/>`).join('')}</g></g>`;
      // layers (hit areas, bottom = layer 1) and the dividing lines
      out += '<g class="fk-pieces"' + (b.lock ? '' : ` data-key="piece:${i}"`) + '>';
      for (let p = 0; p < n; p++) {
        const y = JY1 - (p + 1) * lh;
        const inner = `<rect x="108" y="${f2(y)}" width="184" height="${f2(lh)}" fill="transparent"/><rect class="fk-hov" x="108" y="${f2(y)}" width="184" height="${f2(lh)}"/><rect class="fk-ring" x="112" y="${f2(y + 2)}" width="176" height="${f2(lh - 4)}" rx="6" style="stroke-width:3"/><rect class="fk-focus" x="110" y="${f2(y)}" width="180" height="${f2(lh)}"/>`;
        out += pieceG(i, b, p, inner, 0, 0);
      }
      out += '</g>';
      for (let p = 1; p < n; p++) out += `<line class="fk-jl" x1="108" x2="292" y1="${f2(JY1 - p * lh)}" y2="${f2(JY1 - p * lh)}"/>`;
      out += `<path d="${JAR}" fill="url(#${uid}-jg)" pointer-events="none"/><path d="${JAR}" fill="none" stroke="#9DB6CC" stroke-width="4" pointer-events="none"/>`;
      out += `<rect x="122" y="20" width="156" height="26" rx="9" fill="#F5B90A" stroke="#C78F00" stroke-width="2"/><rect x="132" y="25" width="136" height="5" rx="2.5" fill="#fff" opacity=".4"/>`;
      // level marker on the right
      out += `<g class="fk-lvl" data-lvl style="transform:translateY(${JH}px)"><line x1="292" x2="326" y1="${JY0}" y2="${JY0}" stroke="var(--fk-id)" stroke-width="4" stroke-linecap="round"/><text data-lvl-t x="332" y="${JY0 + 7}" font-size="21" font-weight="800" style="font-family:var(--font-display);fill:var(--fk-id);paint-order:stroke;stroke:#FFF6E6;stroke-width:5px"></text></g>`;
      return out;
    }
    const DRAW = { roti, bar, pizza, jar };
    const VIEW = { roti: '0 0 400 300', pizza: '0 0 400 300', jar: '0 0 400 300', bar: '0 0 600 200' };

    // ---- number line under each bar
    const NX0 = 36, NX1 = 524, NY = 50;
    function numberLine(b) {
      const ticks = Array.from({ length: b.n + 1 }, (_, j) => { const x = NX0 + ((NX1 - NX0) * j) / b.n; return `<line class="fk-nl-tick" x1="${f2(x)}" x2="${f2(x)}" y1="${NY - 11}" y2="${NY + 11}"/>`; }).join('');
      return `<rect class="fk-nl-track" x="${NX0}" y="${NY - 4}" width="${NX1 - NX0}" height="8" rx="4"/><rect class="fk-nl-fill" data-nlfill x="${NX0}" y="${NY - 4}" width="${NX1 - NX0}" height="8" rx="4" style="transform:scaleX(0)"/>${ticks}
        <text class="fk-nl-lab" x="${NX0}" y="${NY + 40}" text-anchor="middle">0</text><text class="fk-nl-lab" x="${NX1}" y="${NY + 40}" text-anchor="middle">1</text>
        <g class="fk-mk" data-mk style="transform:translate(${NX0}px,${NY}px)"><circle r="12"/><text data-mkt y="-22" text-anchor="middle">0</text></g>`;
    }

    // ---- build one card
    function renderCard(i, fresh) {
      const b = bars[i], el = cards[i];
      const active = document.activeElement;
      const had = active && el.contains(active) && active.dataset ? active.dataset.cut || (active.dataset.refine && 'r' + active.dataset.refine) : null;
      const head = b.lock
        ? `<span class="fk-pill">${esc(tt('Fixed', 'तय'))}</span>`
        : `<div class="fk-step" data-key="cut:${i}" role="group" aria-label="${esc(tt('Number of equal parts', 'बराबर भागों की संख्या'))}"><button type="button" data-cut="-1" aria-label="${esc(tt('Fewer parts', 'कम भाग'))}">−</button><output>${b.n}</output><button type="button" data-cut="1" aria-label="${esc(tt('More parts', 'ज़्यादा भाग'))}">+</button></div>`;
      const refine = op === 'equivalent' && !b.lock
        ? `<div class="fk-ref" data-key="refine:${i}" role="group" aria-label="${esc(tt('Change the number of parts, keeping the same amount', 'भागों की संख्या बदलो, मात्रा वही रखो'))}"><span>${esc(tt('Same amount:', 'वही मात्रा:'))}</span><button type="button" data-refine="2" aria-label="${esc(tt('Cut every part into 2', 'हर भाग को 2 भागों में काटो'))}">×2</button><button type="button" data-refine="3" aria-label="${esc(tt('Cut every part into 3', 'हर भाग को 3 भागों में काटो'))}">×3</button><button type="button" data-refine="join" aria-label="${esc(tt('Join parts together', 'भागों को जोड़ो'))}">${esc(tt('Join', 'जोड़ो'))}</button></div>`
        : '';
      el.innerHTML = `<div class="fk-head"><div class="fk-big" aria-hidden="true"><span class="fk-num"></span><span class="fk-den"></span></div><div class="fk-say" aria-live="polite"></div>${head}</div><div class="fk-chips"></div>${refine}
        <svg class="fk-svg fk-${cfg.object}${fresh ? ' fk-new' : ''}" viewBox="${VIEW[cfg.object]}" role="group" aria-label="${esc(nameT)}">${DRAW[cfg.object](i, b)}</svg>
        <svg class="fk-nl" viewBox="0 0 560 96" role="img" aria-label="${esc(tt('Number line from 0 to 1', '0 से 1 तक की संख्या रेखा'))}">${numberLine(b)}</svg>`;
      paint(i);
      if (had) { const again = el.querySelector(had.startsWith('r') ? `[data-refine="${had.slice(1)}"]` : `[data-cut="${had}"]`); if (again && !again.disabled) again.focus(); }
    }

    // ---- update what changes when parts are shaded (no rebuild, so the CSS transitions run)
    function paint(i) {
      const b = bars[i], el = cards[i], k = kOf(b), n = b.n;
      el.querySelector('.fk-num').textContent = k;
      el.querySelector('.fk-den').textContent = n;
      const out = el.querySelector('output'); if (out) out.textContent = n;
      el.querySelector('.fk-say').textContent = tt(`${k} of ${n} equal ${api.t(n === 1 ? o.one : o.many)} ${api.t(o.verb)}`, `${n} बराबर ${o.obl} में से ${k} ${api.t(o.verb)}`);
      const chips = [];
      const [sk, sn] = simp(k, n);
      if (k > 0 && sn !== n) chips.push(`= ${sk === sn ? 1 : frT(sk, sn)} ${tt('in simplest form', 'सरलतम रूप में')}`);
      if (bars.length === 1) { const d = decimalOf(k, n); chips.push(`${tt('Decimal', 'दशमलव')} ${d.dec}`, `${tt('Percent', 'प्रतिशत')} ${d.pct}`); }
      el.querySelector('.fk-chips').innerHTML = chips.map((c) => `<span class="fk-chip">${esc(c)}</span>`).join('');
      el.querySelectorAll('[data-p]').forEach((g) => {
        const p = +g.dataset.p, on = b.sh.has(p);
        g.classList.toggle('on', on);
        const lab = `${api.t(o.one)} ${p + 1} ${tt('of', '/')} ${n}: ${on ? api.t(o.verb1) : tt('not ' + o.verb1.en, api.t(o.verb1) + ' नहीं')}`;
        g.setAttribute('aria-label', lab);
        if (!b.lock) g.setAttribute('aria-pressed', String(on));
      });
      // number line
      const v = k / n;
      const fill = el.querySelector('[data-nlfill]'); if (fill) fill.style.transform = `scaleX(${v})`;
      const mk = el.querySelector('[data-mk]');
      if (mk) {
        mk.style.transform = `translate(${f2(NX0 + (NX1 - NX0) * v)}px,${NY}px)`;
        const t = mk.querySelector('[data-mkt]');
        t.textContent = k === 0 ? '0' : k === n ? '1' : frT(k, n);
        t.setAttribute('text-anchor', v < 0.1 ? 'start' : v > 0.9 ? 'end' : 'middle');
        t.setAttribute('x', v < 0.1 ? -10 : v > 0.9 ? 10 : 0);
      }
      // jar
      const liq = el.querySelector('[data-liquid]');
      if (liq) {
        const ty = JH * (1 - v);
        liq.style.transform = `translateY(${f2(ty)}px)`;
        const lv = el.querySelector('[data-lvl]'); lv.style.transform = `translateY(${f2(ty)}px)`;
        lv.querySelector('[data-lvl-t]').textContent = k === 0 ? '' : frT(k, n);
        lv.style.opacity = k === 0 ? 0 : 1;
      }
    }

    // ---- the panel for two bars
    function axisTwin(r) {
      const X0 = 46, X1 = 514, y = 62, X = (v) => X0 + v * (X1 - X0);
      const t1 = Array.from({ length: r.n1 + 1 }, (_, j) => `<line class="fk-ca" stroke-width="3" x1="${f2(X(j / r.n1))}" x2="${f2(X(j / r.n1))}" y1="${y - 5}" y2="${y - 20}"/>`).join('');
      const t2 = Array.from({ length: r.n2 + 1 }, (_, j) => `<line class="fk-cb" stroke-width="3" x1="${f2(X(j / r.n2))}" x2="${f2(X(j / r.n2))}" y1="${y + 5}" y2="${y + 20}"/>`).join('');
      const v1 = r.k1 / r.n1, v2 = r.k2 / r.n2;
      const eq = r.sign === '=' && r.k1 > 0;
      const lab = (txt, v, yy, cls) => `<text class="${cls}" x="${f2(X(v))}" y="${yy}" text-anchor="${v < 0.08 ? 'start' : v > 0.92 ? 'end' : 'middle'}" ${v < 0.08 ? 'dx="-8"' : v > 0.92 ? 'dx="8"' : ''}>${txt}</text>`;
      return `<svg class="fk-axis" viewBox="0 0 560 124" role="img" aria-label="${esc(tt(`Number line: ${frT(r.k1, r.n1)} and ${frT(r.k2, r.n2)}`, `संख्या रेखा: ${frT(r.k1, r.n1)} और ${frT(r.k2, r.n2)}`))}">
        <line x1="${X0}" x2="${X1}" y1="${y}" y2="${y}" stroke="var(--ink-2)" stroke-width="4" stroke-linecap="round"/>${t1}${t2}
        <text class="fk-tk" x="22" y="${y + 8}" text-anchor="middle">0</text><text class="fk-tk" x="540" y="${y + 8}" text-anchor="middle">1</text>
        ${eq ? `<line x1="${f2(X(v1))}" x2="${f2(X(v1))}" y1="${y - 24}" y2="${y + 24}" stroke="var(--good)" stroke-width="3" stroke-dasharray="4 4"/>` : ''}
        <circle cx="${f2(X(v1))}" cy="${y}" r="11" class="fk-ta" stroke="var(--surface)" stroke-width="3"/><circle cx="${f2(X(v2))}" cy="${y}" r="${eq ? 5.5 : 11}" class="fk-tb" stroke="var(--surface)" stroke-width="3"/>
        ${lab(r.k1 === 0 ? '0' : frT(r.k1, r.n1), v1, 32, 'fk-ta')}${lab(r.k2 === 0 ? '0' : frT(r.k2, r.n2), v2, 108, 'fk-tb')}</svg>`;
    }
    function axisJump(kind, a, b) {
      const v1 = a[0] / a[1], v2 = b[0] / b[1], total = kind === 'add' ? v1 + v2 : v1 - v2;
      const max = kind === 'add' && v1 + v2 > 1 ? 2 : 1, Lc = lcm(a[1], b[1]);
      const X0 = 34, X1 = 526, y = 110, X = (v) => X0 + (v / max) * (X1 - X0);
      let ticks = '';
      if (Lc * max <= 48) for (let j = 0; j <= Lc * max; j++) { const whole = j % Lc === 0; ticks += `<line stroke="var(--ink-2)" stroke-width="${whole ? 3.5 : 2}" x1="${f2(X(j / Lc))}" x2="${f2(X(j / Lc))}" y1="${y - (whole ? 12 : 7)}" y2="${y + (whole ? 12 : 7)}"/>`; }
      else for (let j = 0; j <= max; j++) ticks += `<line stroke="var(--ink-2)" stroke-width="3.5" x1="${f2(X(j))}" x2="${f2(X(j))}" y1="${y - 12}" y2="${y + 12}"/>`;
      const wholes = Array.from({ length: max + 1 }, (_, j) => `<text class="fk-tk" x="${f2(X(j))}" y="${y + 36}" text-anchor="middle">${j}</text>`).join('');
      const arc = (x0, x1, h, cls, label) => {
        const dx = (x1 - x0) / 2, ang = (Math.atan2(2 * h, dx) * 180) / Math.PI;
        return `<path class="fk-arc ${cls}" pathLength="1" d="M${f2(x0)} ${y}Q${f2((x0 + x1) / 2)} ${y - 2 * h} ${f2(x1)} ${y}"/><path class="fk-ah ${cls}" d="M0 0L-11 -7L-11 7Z" transform="translate(${f2(x1)} ${y}) rotate(${f2(ang)})"/><text class="${cls === 'fk-ca' ? 'fk-ta' : 'fk-tb'}" x="${f2((x0 + x1) / 2)}" y="${y - h - 9}" text-anchor="middle">${label}</text>`;
      };
      const [rp, rq] = simp(Math.round(total * Lc), Lc);
      const tx = Math.max(70, Math.min(490, X(total)));
      let s = `<circle cx="${f2(X(total))}" cy="${y}" r="9" class="fk-tr" stroke="var(--surface)" stroke-width="3"/>`;
      if (v1 > 0) s += arc(X(0), X(v1), 40, 'fk-ca', frT(a[0], a[1]));
      if (v2 > 0) s += kind === 'add' ? arc(X(v1), X(v1 + v2), 62, 'fk-cb', '+' + frT(b[0], b[1])) : arc(X(v1), X(v1 - v2), 62, 'fk-cb', '−' + frT(b[0], b[1]));
      s += `<text class="fk-tr" x="${f2(tx)}" y="${y + 66}" text-anchor="middle">= ${fmtMixed(rp, rq)}</text>`;
      return `<svg class="fk-axis" viewBox="0 0 560 184" role="img" aria-label="${esc(tt(`Number line: ${frT(a[0], a[1])} ${kind === 'add' ? 'plus' : 'minus'} ${frT(b[0], b[1])} is ${fmtMixed(rp, rq)}`, `संख्या रेखा: ${frT(a[0], a[1])} ${kind === 'add' ? 'जमा' : 'घटा'} ${frT(b[0], b[1])} बराबर ${fmtMixed(rp, rq)}`))}"><line x1="${X0}" x2="${X1}" y1="${y}" y2="${y}" stroke="var(--ink-2)" stroke-width="4" stroke-linecap="round"/>${ticks}${wholes}${s}</svg>`;
    }

    function panelHTML() {
      const r = relation(val(bars[0]), val(bars[1]));
      const A = frT(r.k1, r.n1), B = frT(r.k2, r.n2);
      const P = (en, hi) => `<p class="fk-why">${esc(tt(en, hi))}</p>`;
      let head = '', rows = '', why = '', axis = '', eq = false;
      if (op === 'compare') {
        axis = axisTwin(r);
        if (r.k1 === 0 && r.k2 === 0) head = tt('Set both amounts to compare them.', 'तुलना के लिए दोनों की मात्रा चुनो।');
        else {
          eq = r.sign === '=';
          head = r.sign === '=' ? tt(`${A} = ${B}: the same amount.`, `${A} = ${B}: मात्रा बराबर है।`) : r.sign === '>' ? tt(`${A} is bigger than ${B}.`, `${A}, ${B} से बड़ा है।`) : tt(`${A} is smaller than ${B}.`, `${A}, ${B} से छोटा है।`);
          rows = `<div class="fk-eq">${frH(r.k1, r.n1, 'a')}${opH(r.sign)}${frH(r.k2, r.n2, 'b')}</div>`;
          if (r.n1 === r.n2) why = P('The parts are the same size, so the one with more parts is bigger.', 'भाग बराबर आकार के हैं, इसलिए जिसमें ज़्यादा भाग हैं वही बड़ा है।');
          else {
            rows += `<div class="fk-eq">${frH(r.a, r.L, 'a')}${opH(r.sign)}${frH(r.b, r.L, 'b')}</div>`;
            why = P(`The parts are different sizes. Change both into parts of size 1/${r.L}: ${A} = ${r.a}/${r.L} and ${B} = ${r.b}/${r.L}. Now compare ${r.a} and ${r.b}.`, `भागों का आकार अलग है। दोनों को 1/${r.L} आकार के भागों में बदलो: ${A} = ${r.a}/${r.L} और ${B} = ${r.b}/${r.L}। अब ${r.a} और ${r.b} की तुलना करो।`);
          }
        }
      } else if (op === 'equivalent') {
        axis = axisTwin(r);
        const both = r.k1 > 0 && r.k2 > 0;
        if (!both) head = tt('Make both amounts match.', 'दोनों की मात्रा बराबर करो।');
        else if (r.sign === '=') {
          eq = true;
          head = tt(`${A} and ${B} are equivalent fractions: the same amount.`, `${A} और ${B} तुल्य भिन्न हैं: मात्रा एक ही है।`);
          const [sk, sn] = simp(r.k1, r.n1);
          if (r.n1 === r.n2) why = P('These are exactly the same fraction.', 'ये बिलकुल एक ही भिन्न हैं।');
          else if (r.n2 % r.n1 === 0) {
            const m = r.n2 / r.n1;
            rows = `<div class="fk-eq">${frH(r.k1, r.n1, 'a')}${opH(`× ${m}/${m} =`)}${frH(r.k2, r.n2, 'b')}</div>`;
            why = P(`Multiply the top and the bottom of ${A} by ${m} and you get ${B}. The amount does not change.`, `${A} के ऊपर और नीचे की संख्या को ${m} से गुणा करो तो ${B} मिलता है। मात्रा नहीं बदलती।`);
          } else if (r.n1 % r.n2 === 0) {
            const m = r.n1 / r.n2;
            rows = `<div class="fk-eq">${frH(r.k1, r.n1, 'a')}${opH(`÷ ${m}/${m} =`)}${frH(r.k2, r.n2, 'b')}</div>`;
            why = P(`Divide the top and the bottom of ${A} by ${m} and you get ${B}. The amount does not change.`, `${A} के ऊपर और नीचे की संख्या को ${m} से भाग दो तो ${B} मिलता है। मात्रा नहीं बदलती।`);
          } else {
            rows = `<div class="fk-eq">${frH(r.k1, r.n1, 'a')}${opH('=')}${frH(sk, sn, 'r')}${opH('=')}${frH(r.k2, r.n2, 'b')}</div>`;
            why = P(`In simplest form both are ${frT(sk, sn)}.`, `सरलतम रूप में दोनों ${frT(sk, sn)} हैं।`);
          }
        } else {
          head = tt(`${A} and ${B} are not equal yet.`, `${A} और ${B} अभी बराबर नहीं हैं।`);
        }
        if (both) why += P(`Cross-multiply to check: ${r.k1} × ${r.n2} = ${r.cross1} and ${r.k2} × ${r.n1} = ${r.cross2}. Equivalent fractions give the same number.`, `क्रॉस गुणा से जाँचो: ${r.k1} × ${r.n2} = ${r.cross1} और ${r.k2} × ${r.n1} = ${r.cross2}। तुल्य भिन्नों में गुणनफल बराबर आता है।`);
      } else if (op === 'add' || op === 'subtract') {
        const add = op === 'add';
        const bad = !add && r.cross1 < r.cross2;
        if (r.k1 === 0 && r.k2 === 0) head = tt('Set both amounts first.', 'पहले दोनों की मात्रा चुनो।');
        else if (bad) {
          head = tt('You cannot take away more than you have.', 'जितना है उससे ज़्यादा नहीं हटा सकते।');
          why = P('Make the second amount smaller than, or equal to, the first.', 'दूसरी मात्रा को पहली से कम या बराबर करो।');
        } else {
          axis = axisJump(op, val(bars[0]), val(bars[1]));
          const s = add ? r.a + r.b : r.a - r.b;
          const [pk, pq] = simp(s, r.L);
          const sign = add ? '+' : '−';
          const res = fmtMixed(pk, pq);
          eq = false;
          head = tt(`${A} ${sign} ${B} = ${res}`, `${A} ${sign} ${B} = ${res}`);
          rows = `<div class="fk-eq">${frH(r.k1, r.n1, 'a')}${opH(sign)}${frH(r.k2, r.n2, 'b')}</div>`;
          if (r.n1 !== r.n2) rows += `<div class="fk-eq">${opH('=')}${frH(r.a, r.L, 'a')}${opH(sign)}${frH(r.b, r.L, 'b')}</div>`;
          if (s === 0) rows += `<div class="fk-eq">${opH('=')}<span class="fk-whole">0</span></div>`;
          else {
            let tail = frH(s, r.L, 'r');
            if (pk >= pq) tail += opH('=') + mixedH(pk, pq, 'r');
            else if (pq !== r.L) tail += opH('=') + frH(pk, pq, 'r');
            rows += `<div class="fk-eq">${opH('=')}${tail}</div>`;
          }
          if (r.n1 === r.n2) why = add ? P(`The parts are the same size, so just add the number of parts: ${r.k1} + ${r.k2} = ${r.k1 + r.k2}.`, `भाग बराबर आकार के हैं, इसलिए भागों की संख्या जोड़ो: ${r.k1} + ${r.k2} = ${r.k1 + r.k2}।`) : P(`The parts are the same size, so just take away the number of parts: ${r.k1} − ${r.k2} = ${r.k1 - r.k2}.`, `भाग बराबर आकार के हैं, इसलिए भागों की संख्या घटाओ: ${r.k1} − ${r.k2} = ${r.k1 - r.k2}।`);
          else why = add
            ? P(`The parts are different sizes, so first change both into parts of size 1/${r.L}: ${A} = ${r.a}/${r.L} and ${B} = ${r.b}/${r.L}. Then add the parts: ${r.a} + ${r.b} = ${s}.`, `भागों का आकार अलग है, इसलिए पहले दोनों को 1/${r.L} आकार के भागों में बदलो: ${A} = ${r.a}/${r.L} और ${B} = ${r.b}/${r.L}। फिर भाग जोड़ो: ${r.a} + ${r.b} = ${s}।`)
            : P(`The parts are different sizes, so first change both into parts of size 1/${r.L}: ${A} = ${r.a}/${r.L} and ${B} = ${r.b}/${r.L}. Then take away the parts: ${r.a} − ${r.b} = ${s}.`, `भागों का आकार अलग है, इसलिए पहले दोनों को 1/${r.L} आकार के भागों में बदलो: ${A} = ${r.a}/${r.L} और ${B} = ${r.b}/${r.L}। फिर भाग घटाओ: ${r.a} − ${r.b} = ${s}।`);
          if (s > 0 && pq !== r.L) why += P(`Simplify: ${s}/${r.L} = ${pk}/${pq}.`, `सरल करो: ${s}/${r.L} = ${pk}/${pq}।`);
          if (pk > pq) why += P(`That is more than 1 whole: ${pk}/${pq} = ${fmtMixed(pk, pq)}.`, `यह 1 पूर्ण से ज़्यादा है: ${pk}/${pq} = ${fmtMixed(pk, pq)}।`);
        }
      }
      return { html: `<p class="fk-headline" aria-live="polite">${esc(head)}</p>${rows ? `<div aria-hidden="true">${rows}</div>` : ''}${why}${axis}`, eq };
    }
    function renderPanel() {
      if (!panelEl) return;
      const p = panelHTML();
      panelEl.innerHTML = p.html;
      panelEl.classList.toggle('is-eq', p.eq);
    }

    // ---- what the child did -> events
    function relate() {
      if (!op) return;
      const [a, b] = [val(bars[0]), val(bars[1])];
      const r = relation(a, b);
      const equalNow = r.sign === '=' && r.k1 > 0 && r.k2 > 0;
      if (equalNow) {
        api.emit('equal');
        if (!wasEqual) { api.speak(tt(`${r.n1} parts, ${r.k1} shaded, equals ${r.n2} parts, ${r.k2} shaded`, `${r.n1} में से ${r.k1}, ${r.n2} में से ${r.k2} के बराबर है`)); api.celebrate(); }
      }
      wasEqual = equalNow;
      if (op === 'compare' && r.sign !== '=') api.emit('bigger:' + (r.sign === '>' ? 0 : 1));
      if (op === 'add' && (r.k1 || r.k2)) { const [pk, pq] = simp(r.a + r.b, r.L); api.emit(`sum:${pk}/${pq}`); }
      if (op === 'subtract' && r.cross1 >= r.cross2 && (r.k1 || r.k2)) { const [pk, pq] = simp(r.a - r.b, r.L); api.emit(`diff:${pk}/${pq}`); }
    }

    function onClick(e) {
      const barEl = e.target.closest && e.target.closest('[data-bar]');
      if (!barEl || destroyed) return;
      const i = +barEl.dataset.bar, b = bars[i];
      const cutBtn = e.target.closest('[data-cut]'), refBtn = e.target.closest('[data-refine]'), piece = e.target.closest('[data-p]');
      if (cutBtn) {
        if (!api.allowed('cut:' + i)) { api.nudge('cut:' + i); return; }
        const nn = b.n + +cutBtn.dataset.cut;
        if (nn < 1 || nn > MAXN) { api.toast(tt(`Choose from 1 to ${MAXN} equal parts.`, `1 से ${MAXN} तक बराबर भाग चुनो।`)); return; }
        b.n = nn; b.sh.clear();
        renderCard(i, true);
        api.emit(`cut:${i}:${nn}`);
        api.record(tt(`Cut into ${nn} equal parts`, `${nn} बराबर भागों में काटा`));
        wasEqual = false;
        renderPanel();
      } else if (refBtn) {
        if (!api.allowed('refine:' + i)) { api.nudge('refine:' + i); return; }
        const m = refBtn.dataset.refine;
        if (m === 'join') {
          let d = 0;
          for (let c = b.n; c >= 2; c--) {
            if (b.n % c) continue;
            let ok = true;
            for (let g = 0; g < b.n / c && ok; g++) { const first = b.sh.has(g * c); for (let q = 1; q < c; q++) if (b.sh.has(g * c + q) !== first) ok = false; }
            if (ok) { d = c; break; }
          }
          if (!d) { api.toast(tt('These parts cannot be joined without changing the shaded amount.', 'इन भागों को जोड़ने पर रंगी हुई मात्रा बदल जाएगी।')); return; }
          const ns = new Set();
          for (let g = 0; g < b.n / d; g++) if (b.sh.has(g * d)) ns.add(g);
          b.n = b.n / d; b.sh = ns;
        } else {
          const mm = +m;
          if (b.n * mm > MAXN) { api.toast(tt(`That would be more than ${MAXN} parts.`, `इससे ${MAXN} से ज़्यादा भाग हो जाएँगे।`)); return; }
          const ns = new Set();
          b.sh.forEach((p) => { for (let q = 0; q < mm; q++) ns.add(p * mm + q); });
          b.n *= mm; b.sh = ns;
        }
        renderCard(i, true);
        api.emit(`refine:${i}:${m}`);
        api.record(m === 'join' ? tt(`Joined parts: now ${kOf(b)}/${b.n}`, `भाग जोड़े: अब ${kOf(b)}/${b.n}`) : tt(`Cut every part into ${m}: now ${kOf(b)}/${b.n}`, `हर भाग को ${m} में काटा: अब ${kOf(b)}/${b.n}`));
        wasEqual = false;
        relate();
        renderPanel();
      } else if (piece && !b.lock) {
        if (!api.allowed('piece:' + i)) { api.nudge('piece:' + i); return; }
        const p = +piece.dataset.p;
        if (cfg.object === 'jar') { const k = kOf(b); b.sh = new Set(Array.from({ length: k === p + 1 ? p : p + 1 }, (_, q) => q)); }
        else if (b.sh.has(p)) b.sh.delete(p); else b.sh.add(p);
        paint(i);
        const [k, n] = val(b);
        api.emit(`shade:${i}:${k}/${n}`);
        api.record(tt(`Shaded ${k}/${n}`, `${k}/${n} रंगा`));
        relate();
        renderPanel();
      }
    }
    function onKey(e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('g[data-p][role="button"]')) {
        e.preventDefault();
        e.target.closest('g[data-p]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    }
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    bars.forEach((b, i) => renderCard(i, false));
    renderPanel();
    return { destroy() { destroyed = true; root.removeEventListener('click', onClick); root.removeEventListener('keydown', onKey); } };
  }

  NCA_T.register({
    id: 'fractions',
    css: CSS,
    validate,
    keys,
    demo: { object: 'pizza', bars: [{ n: 2, k: 1 }, { n: 3, k: 1 }], op: 'add' },
    objects: OBJECTS,
    ops: OPS,
    // The pure arithmetic, for tests under Node.
    model: { simp, lcm, relation, fmtMixed, decimalOf },
    mount,
  });
})();
