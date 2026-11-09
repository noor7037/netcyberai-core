// Template: Algebra balance. Six modes, all computed exactly with fractions (never floating point):
//   balance    a pan balance holds an equation (bags of x and unit blocks, balloons for negatives); the child does the
//              same operation to both sides; one-sided operations tip the scale; a slider tests trial values of x
//   tiles      algebra tiles (x2, x, 1 and the negatives): build a polynomial, cancel zero pairs, evaluate at x
//   expand     area model of (ax+b)(cx+d), (x+b)^2 and (x+b)(x-b): fill the cells, add like terms, type the result
//   factorise  find the two binomials whose product is a given quadratic, with a live area model and the "ac" hint
//   pattern    dot patterns for the rule an+b: pictures, table, differences, the 10th+ term, the rule
//   solve-pair two linear equations on a graph with a probe line; the crossing point is the solution
// Config: { mode, equation?: '3x+5=2x+12' | '(x+2)(x+3)' | 'x^2+5x+6' | '3n+2' | 'x+y=10, x-y=2', unknown?: single letter }
(function () {
  const L = window.NCA_LIB;
  const { esc } = L;

  // ------------------------------------------------------------------ exact arithmetic
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; };
  const fr = (n, d = 1) => { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d) || 1; return { n: n / g, d: d / g }; };
  const F0 = fr(0), F1 = fr(1);
  const fadd = (x, y) => fr(x.n * y.d + y.n * x.d, x.d * y.d);
  const fneg = (x) => fr(-x.n, x.d);
  const fsub = (x, y) => fadd(x, fneg(y));
  const fmul = (x, y) => fr(x.n * y.n, x.d * y.d);
  const fdiv = (x, y) => fr(x.n * y.d, x.d * y.n);
  const feq = (x, y) => x.n === y.n && x.d === y.d;
  const fz = (x) => x.n === 0;
  const fnum = (x) => x.n / x.d;
  const fint = (x) => x.d === 1;
  const fbig = (x) => Math.abs(x.n) > 2000 || x.d > 2000;
  const fstr = (x) => (x.d === 1 ? String(x.n) : x.n + '/' + x.d).replace('-', '−');
  const gcdl = (arr) => arr.reduce((g, x) => gcd(g, x), 0);

  // polynomials: arrays of fractions, index = degree
  const ptrim = (p) => { const q = p.slice(); while (q.length > 1 && fz(q[q.length - 1])) q.pop(); return q.length ? q : [F0]; };
  const padd = (p, q) => { const r = []; for (let i = 0; i < Math.max(p.length, q.length); i++) r.push(fadd(p[i] || F0, q[i] || F0)); return ptrim(r); };
  const pneg = (p) => p.map(fneg);
  const pmul = (p, q) => { const r = Array.from({ length: p.length + q.length - 1 }, () => F0); p.forEach((a, i) => q.forEach((b, j) => { r[i + j] = fadd(r[i + j], fmul(a, b)); })); return ptrim(r); };
  const pscale = (p, k) => ptrim(p.map((a) => fmul(a, k)));
  const pdeg = (p) => ptrim(p).length - 1;
  const peq = (p, q) => { p = ptrim(p); q = ptrim(q); return p.length === q.length && p.every((a, i) => feq(a, q[i])); };
  const peval = (p, t) => p.reduceRight((acc, a) => fadd(fmul(acc, t), a), F0);
  const co = (p, i) => (p && p[i]) || F0;

  // Parser for one-variable polynomials: + - * / (by whole numbers) ^ (0..3), implicit multiplication, brackets.
  function parsePoly(src, v) {
    const s = String(src).replace(/\s+/g, '').replace(/[−–]/g, '-').replace(/[×·]/g, '*').replace(/²/g, '^2').replace(/³/g, '^3');
    if (!s) throw new Error('empty');
    let i = 0;
    const chk = (p) => { if (p.length > 5) throw new Error('degree too high'); return p; };
    const expr = () => {
      let r = term();
      while (s[i] === '+' || s[i] === '-') { const op = s[i++]; const t = term(); r = padd(r, op === '+' ? t : pneg(t)); }
      return r;
    };
    const term = () => {
      let r = unary();
      for (;;) {
        if (s[i] === '*') { i++; r = chk(pmul(r, unary())); }
        else if (s[i] === '/') {
          i++; let d = ''; while (/\d/.test(s[i] || '')) d += s[i++];
          if (!d || +d === 0) throw new Error('bad division');
          r = pscale(r, fr(1, +d));
        } else if (s[i] === v || s[i] === '(') r = chk(pmul(r, unary()));
        else return r;
      }
    };
    const unary = () => { if (s[i] === '-') { i++; return pneg(unary()); } if (s[i] === '+') { i++; return unary(); } return power(); };
    const power = () => {
      const a = atom();
      if (s[i] === '^') {
        i++; let d = ''; while (/\d/.test(s[i] || '')) d += s[i++];
        if (d === '' || +d > 3) throw new Error('bad power');
        let r = [F1]; for (let k = 0; k < +d; k++) r = chk(pmul(r, a)); return r;
      }
      return a;
    };
    const atom = () => {
      const c = s[i];
      if (c === undefined) throw new Error('unexpected end');
      if (/\d/.test(c)) { let d = ''; while (/\d/.test(s[i] || '')) d += s[i++]; if (s[i] === '.') throw new Error('decimals are not allowed'); return [fr(+d)]; }
      if (c === v) { i++; if (/[23]/.test(s[i] || '')) { const d = +s[i++]; let r = [F1]; for (let k = 0; k < d; k++) r = chk(pmul(r, [F0, F1])); return r; } return [F0, F1]; }
      if (c === '(') { i++; const r = expr(); if (s[i] !== ')') throw new Error('missing )'); i++; return r; }
      throw new Error('unexpected ' + c);
    };
    const r = expr();
    if (i < s.length) throw new Error('unexpected ' + s[i]);
    return ptrim(r);
  }
  // Polynomial to text (html: fractions as stacked spans). v is the unknown's letter.
  function pfmt(p, v, html) {
    const sup = ['', '', '²', '³', '⁴'];
    const out = [];
    for (let d = p.length - 1; d >= 0; d--) {
      const c = p[d];
      if (fz(c)) continue;
      const neg = c.n < 0, a = fr(Math.abs(c.n), c.d);
      let body;
      if (d > 0 && feq(a, F1)) body = '';
      else if (a.d === 1) body = String(a.n);
      else body = html ? `<span class="alg-fr"><i>${a.n}</i><b>${a.d}</b></span>` : `(${a.n}/${a.d})`;
      if (d > 0) body += v + sup[d];
      out.push({ neg, body });
    }
    if (!out.length) return '0';
    return out.map((t, k) => (k === 0 ? (t.neg ? '−' : '') + t.body : (t.neg ? ' − ' : ' + ') + t.body)).join('');
  }
  const parseNum = (s) => {
    s = String(s == null ? '' : s).trim().replace(/[−–]/g, '-');
    let m = s.match(/^(-?\d+)\s*\/\s*(\d+)$/);
    if (m) return +m[2] === 0 ? null : fr(+m[1], +m[2]);
    m = s.match(/^(-?)(\d+)(?:\.(\d{1,3}))?$/);
    if (m) { const dp = (m[3] || '').length; return fr((m[1] ? -1 : 1) * +(m[2] + (m[3] || '')), Math.pow(10, dp)); }
    return null;
  };

  // ------------------------------------------------------------------ equation parsing and domain checks
  const MODES = ['balance', 'tiles', 'expand', 'factorise', 'pattern', 'solve-pair'];
  const unkOf = (c) => (c && c.unknown) || (c && c.mode === 'pattern' ? 'n' : 'x');

  function parseEquation(str, v) {
    const parts = String(str).split('=');
    if (parts.length !== 2) throw new Error('an equation has exactly one = sign');
    return { L: parsePoly(parts[0], v), R: parsePoly(parts[1], v) };
  }
  function parseBinomials(str, v) {
    const s = String(str).replace(/\s+/g, '').replace(/[−–]/g, '-').replace(/²/g, '^2');
    let m = s.match(/^\(([^()]+)\)\(([^()]+)\)$/), f1, f2;
    if (m) { f1 = m[1]; f2 = m[2]; } else { m = s.match(/^\(([^()]+)\)\^2$/); if (m) { f1 = f2 = m[1]; } else throw new Error("write it as (ax+b)(cx+d) or (ax+b)^2"); }
    return [parsePoly(f1, v), parsePoly(f2, v)];
  }
  function findFactors(a, b, c) {
    for (let p = 1; p <= a; p++) {
      if (a % p) continue;
      const r = a / p;
      for (let q = -12; q <= 12; q++) {
        if (q === 0 || c % q) continue;
        const s = c / q;
        if (!s || Math.abs(s) > 12) continue;
        if (p * s + q * r === b) return [p, q, r, s];
      }
    }
    return null;
  }
  function parseLin2(str) {
    const s = String(str).replace(/\s+/g, '').replace(/[−–]/g, '-');
    const m = s.split('=');
    if (m.length !== 2) return null;
    const side = (t) => {
      if (!t) return null;
      const r = { x: 0, y: 0, k: 0 };
      let rest = t, first = true;
      while (rest) {
        const mm = rest.match(/^([+-]?)(\d*)([xy])?/);
        if (!mm || !mm[0] || (!mm[2] && !mm[3]) || (!first && !mm[1])) return null;
        const val = (mm[1] === '-' ? -1 : 1) * (mm[2] === '' ? 1 : +mm[2]);
        if (mm[3]) r[mm[3]] += val; else r.k += val;
        rest = rest.slice(mm[0].length); first = false;
      }
      return r;
    };
    const l = side(m[0]), r = side(m[1]);
    if (!l || !r) return null;
    return { a: l.x - r.x, b: l.y - r.y, c: r.k - l.k };
  }
  function parsePair(str) {
    const parts = String(str).split(/[;,]/);
    if (parts.length !== 2) return null;
    const e = parts.map(parseLin2);
    if (!e[0] || !e[1]) return null;
    const det = e[0].a * e[1].b - e[1].a * e[0].b;
    if (det === 0) return { e, det };
    const x = fr(e[0].c * e[1].b - e[1].c * e[0].b, det), y = fr(e[0].a * e[1].c - e[1].a * e[0].c, det);
    return { e, det, x, y };
  }
  const maxTrial = (w) => Math.max(10, Math.ceil(Math.abs(fnum(w))) + 5);

  function validate(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
    const e = [];
    Object.keys(c).forEach((k) => { if (!['mode', 'equation', 'unknown'].includes(k)) e.push('unknown key: ' + k); });
    if (!MODES.includes(c.mode)) { e.push('mode must be one of ' + MODES.join(', ')); return e; }
    if (c.unknown != null && !(typeof c.unknown === 'string' && /^[a-z]$/.test(c.unknown))) { e.push('unknown must be a single lowercase letter'); return e; }
    if (c.mode === 'solve-pair' && c.unknown != null && c.unknown !== 'x') e.push("solve-pair always uses x and y: leave 'unknown' out");
    const v = unkOf(c);
    if (c.equation == null) {
      if (c.mode !== 'tiles') e.push(`mode '${c.mode}' needs an equation`);
      return e;
    }
    if (typeof c.equation !== 'string' || !c.equation.trim() || c.equation.length > 60) { e.push('equation must be a short string'); return e; }
    try {
      if (c.mode === 'balance') {
        const q = parseEquation(c.equation, v);
        if (pdeg(q.L) > 1 || pdeg(q.R) > 1) { e.push('balance: only linear equations (no x squared)'); return e; }
        const all = [co(q.L, 0), co(q.L, 1), co(q.R, 0), co(q.R, 1)];
        if (!all.every(fint)) e.push('balance: start with whole-number coefficients');
        if (all.some((x) => Math.abs(x.n) > 30)) e.push('balance: numbers up to 30 only');
        const da = fsub(co(q.L, 1), co(q.R, 1));
        if (fz(da)) { e.push(`balance: the ${v} terms cancel, so the equation has no single answer`); return e; }
        const w = fdiv(fsub(co(q.R, 0), co(q.L, 0)), da);
        if (w.d > 10) e.push('balance: the answer must be a whole number or a simple fraction (denominator up to 10)');
        if (Math.abs(fnum(w)) > 20) e.push('balance: the answer must lie between -20 and 20');
        if ((feq(co(q.L, 1), F1) && fz(co(q.L, 0)) && fz(co(q.R, 1))) || (feq(co(q.R, 1), F1) && fz(co(q.R, 0)) && fz(co(q.L, 1)))) e.push(`balance: already solved (${v} alone), nothing to do`);
      } else if (c.mode === 'tiles') {
        const p = parsePoly(c.equation, v);
        if (pdeg(p) > 2) e.push('tiles: at most x squared');
        else {
          if (!p.every(fint)) e.push('tiles: whole-number coefficients only');
          else if (p.some((x) => Math.abs(x.n) > 9)) e.push('tiles: each coefficient from -9 to 9');
          if (fz(p[0]) && p.length === 1) e.push('tiles: the target polynomial is zero');
          if (co(p, 2).n < 0) e.push('tiles: the x squared coefficient cannot be negative');
        }
      } else if (c.mode === 'expand') {
        const [f, g] = parseBinomials(c.equation, v);
        [f, g].forEach((h, i) => {
          if (pdeg(h) !== 1) e.push(`expand: factor ${i + 1} must have the form ax+b`);
          else if (!h.every(fint)) e.push('expand: whole numbers only');
          else if (co(h, 1).n < 1 || co(h, 1).n > 3) e.push('expand: the coefficient of the unknown must be 1, 2 or 3');
          else if (fz(co(h, 0)) || Math.abs(co(h, 0).n) > 9) e.push('expand: the constant must be from -9 to 9 and not 0');
        });
      } else if (c.mode === 'factorise') {
        const p = parsePoly(c.equation, v);
        if (pdeg(p) !== 2) e.push('factorise: needs a quadratic ax^2+bx+c');
        else if (!p.every(fint)) e.push('factorise: whole-number coefficients only');
        else {
          const [cc, bb, aa] = p.map((x) => x.n);
          if (aa < 1 || aa > 6) e.push('factorise: the x squared coefficient must be 1 to 6');
          else if (cc === 0) e.push('factorise: the constant term must not be 0');
          else if (gcdl([aa, bb, cc]) !== 1) e.push('factorise: take out the common number first; give a quadratic with no common factor');
          else if (!findFactors(aa, bb, cc)) e.push('factorise: this quadratic does not factorise over whole numbers');
        }
      } else if (c.mode === 'pattern') {
        const p = parsePoly(c.equation, v);
        if (pdeg(p) !== 1 || !p.every(fint)) e.push("pattern: the rule must look like 3n+2 (whole numbers)");
        else if (co(p, 1).n < 1 || co(p, 1).n > 9) e.push('pattern: the step must be 1 to 9');
        else if (co(p, 0).n < 0 || co(p, 0).n > 9) e.push('pattern: the extra dots must be 0 to 9 (a negative number of dots cannot be drawn)');
      } else if (c.mode === 'solve-pair') {
        const q = parsePair(c.equation);
        if (!q) e.push("solve-pair: write two equations in x and y, like 'x+y=10, x-y=2'");
        else if (q.e.some((z) => (z.a === 0 && z.b === 0) || Math.abs(z.a) > 20 || Math.abs(z.b) > 20 || Math.abs(z.c) > 60)) e.push('solve-pair: each equation needs x or y; numbers up to 20 (constant up to 60)');
        else if (q.det === 0) e.push('solve-pair: the two lines are parallel or the same, so there is no single solution');
        else if (!fint(q.x) || !fint(q.y) || Math.abs(q.x.n) > 10 || Math.abs(q.y.n) > 10) e.push('solve-pair: the solution must be whole numbers from -10 to 10');
      }
    } catch (err) { e.push(`${c.mode}: cannot read the equation (${err.message})`); }
    return e;
  }

  function cellKeys(cfg) {
    const out = new Set();
    try {
      const [f, g] = parseBinomials(cfg.equation, unkOf(cfg));
      [[1, 1], [1, 0], [0, 1], [0, 0]].forEach(([i, j]) => {
        const k = fmul(co(f, i), co(g, j)), d = i + j;
        out.add('tile:' + (d === 2 ? 'x2' : (k.n < 0 ? '-' : '') + (d === 1 ? 'x' : '1')));
      });
    } catch (e) { /* validate reports it */ }
    return [...out];
  }
  function keys(c) {
    const mode = c && c.mode;
    if (mode === 'balance') return { targets: ['side:left', 'side:right', 'op:+', 'op:-', 'op:×', 'op:÷', 'slider:x', 'answer'], events: ['balanced', 'solved:*', 'answered:right', 'answered:wrong'] };
    if (mode === 'tiles') {
      const goal = c.equation != null;
      return { targets: ['tile:x2', 'tile:x', 'tile:1', 'tile:-x', 'tile:-1', 'slider:x'].concat(goal ? ['answer'] : []), events: ['balanced'].concat(goal ? ['answered:right', 'answered:wrong'] : []) };
    }
    if (mode === 'expand') return { targets: ['answer', 'slider:x'].concat(cellKeys(c)), events: ['expanded', 'answered:right', 'answered:wrong'] };
    if (mode === 'factorise') return { targets: ['answer', 'slider:x'], events: ['factorised', 'answered:right', 'answered:wrong'] };
    if (mode === 'pattern') return { targets: ['slider:x', 'answer'], events: ['answered:right', 'answered:wrong'] };
    if (mode === 'solve-pair') return { targets: ['slider:x', 'answer'], events: ['solved:*', 'answered:right', 'answered:wrong'] };
    return { targets: [], events: [] };
  }

  // ------------------------------------------------------------------ CSS
  const CSS = `
.alg { --alg-x: #2563EB; --alg-1: #D99A00; --alg-neg: #E0553F; --alg-acc: #7C3AED; display: flex; flex-direction: column; gap: 14px; color: var(--ink); font-family: var(--font-body); min-width: 0; }
.alg * { box-sizing: border-box; }
.alg-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr)); gap: 14px; align-items: start; }
.alg-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.alg-card { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; box-shadow: 0 4px 14px rgba(15,23,42,.08); }
.alg-card h3 { margin: 0; font-family: var(--font-display); font-size: 1rem; color: var(--ink-2); font-weight: 700; }
.alg-eq { font-family: var(--font-display); font-weight: 800; font-size: clamp(1.5rem, 6vw, 2.2rem); text-align: center; line-height: 1.3; color: var(--alg-acc); display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 4px 12px; min-height: 2.6rem; }
:root[data-theme="dark"] .alg-eq { color: #C4B0FF; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .alg-eq { color: #C4B0FF; } }
.alg-eq.alg-tip { color: var(--alg-neg); }
.alg-fr { display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; font-size: .62em; line-height: 1.05; margin: 0 2px; }
.alg-fr i { font-style: normal; border-bottom: 2px solid currentColor; padding: 0 3px; }
.alg-fr b { font-weight: 800; }
.alg-svg { width: 100%; height: auto; display: block; margin-inline: auto; max-width: 640px; touch-action: manipulation; }
.alg-status { text-align: center; font-weight: 700; padding: 8px 12px; border-radius: 12px; background: var(--sunk); border: 1px solid var(--line); min-height: 44px; display: flex; align-items: center; justify-content: center; }
.alg-status.good { background: var(--good-t); border-color: var(--good); }
.alg-status.bad { background: var(--bad-t); border-color: var(--bad); }
.alg-live { font-weight: 700; padding: 10px 14px; border-radius: 14px; background: var(--sunk); border: 1px solid var(--line); min-height: 44px; }
.alg-live:empty { display: none; }
.alg-live.good { background: var(--good-t); border-color: var(--good); }
.alg-live.bad { background: var(--bad-t); border-color: var(--bad); }
.alg-row { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; }
.alg-lab { font-weight: 700; color: var(--ink-2); font-size: .9rem; }
.alg-seg { display: inline-flex; border: 2px solid var(--alg-acc); border-radius: 14px; overflow: hidden; flex-wrap: wrap; }
.alg-seg button { min-height: 44px; padding: 0 12px; border: 0; background: var(--surface); color: var(--ink); font: 700 .9rem var(--font-body); cursor: pointer; }
.alg-seg button + button { border-left: 2px solid var(--alg-acc); }
.alg-seg button[aria-pressed="true"] { background: var(--alg-acc); color: #fff; }
.alg-step { display: inline-flex; align-items: center; border: 2px solid var(--alg-acc); border-radius: 14px; overflow: hidden; background: var(--surface); }
.alg-step button { border: 0; background: var(--sunk); color: var(--ink); width: 46px; height: 44px; font-size: 1.5rem; font-weight: 800; cursor: pointer; font-family: var(--font-display); }
.alg-step button:hover { background: var(--grape-t); }
.alg-step output { min-width: 52px; text-align: center; font-family: var(--font-display); font-weight: 800; font-size: 1.3rem; padding: 0 4px; }
.alg-ops { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.alg-op { min-height: 56px; border-radius: 16px; border: 0; font: 800 1.8rem var(--font-display); color: #fff; cursor: pointer; box-shadow: 0 4px 0 rgba(0,0,0,.22); transition: transform .12s, box-shadow .12s; }
.alg-op:active { transform: translateY(3px); box-shadow: 0 1px 0 rgba(0,0,0,.22); }
.alg-op[data-op="+"] { background: #0F766E; } .alg-op[data-op="-"] { background: #1D4ED8; } .alg-op[data-op="×"] { background: #8B3DFF; } .alg-op[data-op="÷"] { background: #4400F0; }
.alg-btn { min-height: 44px; padding: 0 16px; border-radius: 14px; border: 2px solid var(--alg-acc); background: var(--surface); color: var(--ink); font: 700 .95rem var(--font-body); cursor: pointer; }
.alg-btn:hover:not(:disabled) { background: var(--grape-t); }
.alg-btn.pri { background: var(--alg-acc); color: #fff; }
.alg-btn.pri:hover:not(:disabled) { background: #6D28D9; }
.alg-btn:disabled { opacity: .4; cursor: not-allowed; }
.alg button:focus-visible, .alg input:focus-visible, .alg [role="button"]:focus-visible { outline: 3px solid var(--sun); outline-offset: 2px; }
.alg input[type="text"] { min-height: 44px; width: 110px; border-radius: 12px; border: 2px solid var(--line); background: var(--surface); color: var(--ink); font: 700 1.2rem var(--font-display); padding: 0 10px; text-align: center; }
.alg input[type="range"] { width: 100%; min-height: 44px; accent-color: var(--alg-acc); }
.alg-br { display: flex; align-items: center; gap: 4px; flex-wrap: nowrap; }
.alg-br .alg-step button { width: 44px; }
.alg-br .alg-step output { min-width: 30px; font-size: 1.1rem; }
@media (max-width: 420px) { .alg-br .alg-step button { width: 44px; } .alg-br { font-size: 1.1rem; } }
.alg-read { font-weight: 600; line-height: 1.5; }
.alg-read b { font-family: var(--font-display); }
.alg-ok { color: var(--good); font-weight: 800; }
.alg-work ol { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; max-height: 240px; overflow-y: auto; }
.alg-work li { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 4px 10px; padding: 6px 10px; border-radius: 10px; background: var(--sunk); font-weight: 700; }
.alg-work li span.n { font-size: .82rem; color: var(--ink-2); }
.alg-work li:last-child { background: var(--grape-t); }
.alg-hint { background: var(--sun-t); border: 1px solid var(--sun); border-radius: 12px; padding: 8px 12px; font-weight: 600; }
.alg-hint:empty { display: none; }
.alg-ans { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-family: var(--font-display); font-weight: 800; font-size: 1.3rem; }
/* pans and bags */
.alg-pop { animation: alg-pop .38s cubic-bezier(.3,1.5,.5,1) both; transform-box: fill-box; transform-origin: 50% 100%; }
@keyframes alg-pop { from { transform: scale(.2); opacity: 0; } to { transform: none; opacity: 1; } }
.alg-float { animation: alg-float 1.4s ease-out both; font: 800 24px var(--font-display); }
@keyframes alg-float { 0% { opacity: 0; transform: translateY(8px); } 20% { opacity: 1; } 100% { opacity: 0; transform: translateY(-26px); } }
.alg-pan { cursor: pointer; }
.alg-pan.sel .alg-platform { stroke: #FFD23F; stroke-width: 4; }
.alg-svgtxt { font-family: var(--font-display); font-weight: 800; }
/* tiles */
.alg-tray { display: flex; flex-wrap: wrap; gap: 8px; }
.alg-tray button { min-height: 64px; min-width: 64px; flex: 1 1 64px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 6px; border-radius: 14px; border: 2px solid var(--line); background: var(--surface); color: var(--ink); font: 700 .8rem var(--font-body); cursor: pointer; }
.alg-tray button:hover { border-color: var(--alg-acc); background: var(--grape-t); }
.alg { --u: 22px; }
@media (min-width: 700px) { .alg { --u: 28px; } }
.alg-tile { display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; font: 800 calc(var(--u) * .62) var(--font-display); color: #0B1B4D; border: 2px solid rgba(0,0,0,.28); flex: none; line-height: 1; box-shadow: inset 0 -4px 0 rgba(0,0,0,.12); }
.alg-tile.t-x2 { width: calc(var(--u) * 3.4); height: calc(var(--u) * 3.4); background: linear-gradient(135deg, #B7CCFF, #7FA2FF); }
.alg-tile.t-x { width: calc(var(--u) * 3.4); height: var(--u); background: linear-gradient(135deg, #9EF0D8, #4FD3B0); }
.alg-tile.t-1 { width: var(--u); height: var(--u); background: linear-gradient(135deg, #FFE9A3, #FFC93C); }
.alg-tile.neg { color: #5C1408; border-style: dashed; background-image: repeating-linear-gradient(45deg, rgba(255,255,255,.35) 0 5px, transparent 5px 10px), linear-gradient(135deg, #FFC2B6, #FF8D79); }
.alg-tile.neg.t-x2 { width: calc(var(--u) * 3.4); height: calc(var(--u) * 3.4); }
.alg-bench { display: flex; flex-direction: column; gap: 12px; min-height: 150px; padding: 12px; border-radius: 14px; background: var(--sunk); border: 2px dashed var(--line); }
.alg-bench .grp { display: flex; flex-wrap: wrap; gap: 6px; align-items: flex-end; }
.alg-bench button.alg-tile { cursor: pointer; padding: 0; }
.alg-bench button.alg-tile:hover { filter: brightness(1.08); transform: scale(1.04); }
.alg-bench .alg-tile.zp { animation: alg-zp 1s ease-in-out infinite alternate; outline: 3px solid var(--sun); }
@keyframes alg-zp { to { opacity: .55; } }
.alg-bench .alg-tile.new { animation: alg-pop .35s cubic-bezier(.3,1.5,.5,1) both; }
.alg-empty { color: var(--ink-2); font-weight: 600; align-self: center; margin: auto; text-align: center; }
/* area model */
.alg-cell { cursor: pointer; transition: filter .2s; }
.alg-cell:hover { filter: brightness(1.06); }
.alg-cell.hid text.val { opacity: 0; }
.alg-cell text.val { transition: opacity .35s; }
.alg-cell.open { cursor: default; }
.alg-mark { animation: alg-pulse 1.1s ease-in-out infinite alternate; }
@keyframes alg-pulse { to { opacity: .35; } }
.alg-chip { display: inline-block; border-radius: 99px; padding: 4px 12px; font-weight: 800; background: var(--sunk); border: 1px solid var(--line); margin: 2px; }
.alg-chip.good { background: var(--good-t); border-color: var(--good); }
.alg-chip.bad { background: var(--bad-t); border-color: var(--bad); }
.alg-table { border-collapse: collapse; width: 100%; text-align: center; font-weight: 700; }
.alg-table td, .alg-table th { border: 1px solid var(--line); padding: 4px 6px; min-width: 32px; }
.alg-table th { background: var(--sunk); font-family: var(--font-display); }
.alg-table td.sel { background: var(--grape-t); }
.alg-tablewrap { overflow-x: auto; }
@media (prefers-reduced-motion: reduce) { .alg *, .alg-pop, .alg-float, .alg-mark { animation: none !important; transition: none !important; } }
`;

  // ------------------------------------------------------------------ shared UI helpers
  let UID = 0;
  const clamp = L.clamp;

  function makeCtx(shell, el, cfg, api) {
    const tt = (en, hi) => api.t({ en, hi });
    const v = unkOf(cfg);
    const liveEl = shell.querySelector('.alg-live');
    const say = (txt, kind) => { liveEl.textContent = txt || ''; liveEl.className = 'alg-live' + (kind ? ' ' + kind : ''); };
    const guard = (key) => { if (api.allowed(key)) return true; api.nudge(key); return false; };
    const stepper = (id, val, label) => `<div class="alg-step" data-st="${id}" role="group" aria-label="${esc(label)}"><button type="button" data-d="-1" aria-label="${esc(tt('Less', 'कम'))}">−</button><output>${esc(String(val).replace('-', '−'))}</output><button type="button" data-d="1" aria-label="${esc(tt('More', 'ज़्यादा'))}">+</button></div>`;
    // st: { id: { min, max, skip0, get(), set(n) } } ; onChange(id)
    const bindSteppers = (st, onChange) => {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('.alg-step button');
        if (!b) return;
        const box = b.closest('.alg-step'), s = st[box.dataset.st];
        if (!s) return;
        const key = box.closest('[data-key]');
        if (key && !guard(key.dataset.key)) return;
        const d = +b.dataset.d;
        let n = clamp(s.get() + d, s.min, s.max);
        if (s.skip0 && n === 0) n = clamp(n + d, s.min, s.max);
        s.set(n);
        box.querySelector('output').textContent = String(n).replace('-', '−');
        if (onChange) onChange(box.dataset.st);
      });
    };
    const activate = (e, fn) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
    return { api, cfg, tt, v, el, say, guard, stepper, bindSteppers, activate };
  }

  // ------------------------------------------------------------------ mode: balance
  function mountBalance(c) {
    const { api, cfg, tt, v, el, say, guard, stepper, bindSteppers } = c;
    const uid = 'alb' + ++UID;
    const q = parseEquation(cfg.equation, v);
    const side = (p) => ({ a: co(p, 1), b: co(p, 0) });
    const start = { L: side(q.L), R: side(q.R) };
    const w = fdiv(fsub(start.R.b, start.L.b), fsub(start.L.a, start.R.a)); // the hidden weight of one bag
    let hist = [{ s: start, note: null }];
    let sideSel = 'both', kind = 'n', num = 3;
    let lastOp = null, wasLevel = true, solved = false, angle = 0, stopTw = null, hintTxt = '', tryX = fr(0);
    const cur = () => hist[hist.length - 1].s;
    const lin = (s, html) => pfmt([s.b, s.a], v, html);
    const val = (s, t) => fadd(fmul(s.a, t), s.b);
    const level = (s) => feq(val(s.L, w), val(s.R, w));
    const eqHTML = (s) => `<span>${lin(s.L, true)}</span><span>=</span><span>${lin(s.R, true)}</span>`;
    const eqAria = (s) => `${lin(s.L, false)} = ${lin(s.R, false)}`;

    const trial = maxTrial(w), tstep = 1 / w.d;
    el.innerHTML = `<div class="alg-grid">
      <div class="alg-col">
        <div class="alg-card"><div class="alg-eq" data-eq role="img"></div>
          <svg class="alg-svg" viewBox="0 0 600 330" role="img" aria-label="${esc(tt('A pan balance holding the equation', 'समीकरण को पकड़े हुए पलड़े वाला तराज़ू'))}">
            <defs>
              <linearGradient id="${uid}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A78BFA"/><stop offset="1" stop-color="#6D28D9"/></linearGradient>
              <linearGradient id="${uid}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE08A"/><stop offset="1" stop-color="#E0A100"/></linearGradient>
              <linearGradient id="${uid}x" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#60A5FA"/><stop offset="1" stop-color="#1D4ED8"/></linearGradient>
              <linearGradient id="${uid}k" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE9A3"/><stop offset="1" stop-color="#F5B90A"/></linearGradient>
              <radialGradient id="${uid}n" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#FFB3A6"/><stop offset="1" stop-color="#E0553F"/></radialGradient>
              <linearGradient id="${uid}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E0E7FF" stop-opacity=".55"/><stop offset="1" stop-color="#C4B5FD" stop-opacity=".18"/></linearGradient>
            </defs>
            <rect x="0" y="0" width="600" height="330" rx="18" fill="url(#${uid}s)"/>
            <ellipse cx="300" cy="316" rx="120" ry="9" fill="rgba(15,23,42,.25)"/>
            <path d="M262 312 L338 312 L318 262 L282 262 Z" fill="#4C1D95"/>
            <rect x="291" y="70" width="18" height="196" rx="6" fill="#5B21B6"/>
            <g data-beam><rect x="90" y="63" width="420" height="14" rx="7" fill="url(#${uid}b)"/><circle cx="90" cy="70" r="7" fill="#FFD23F"/><circle cx="510" cy="70" r="7" fill="#FFD23F"/></g>
            <circle cx="300" cy="70" r="13" fill="#FFD23F" stroke="#B8860B" stroke-width="3"/>
            <g data-str><line data-s="L1" stroke="#7C3AED" stroke-width="3"/><line data-s="L2" stroke="#7C3AED" stroke-width="3"/><line data-s="R1" stroke="#7C3AED" stroke-width="3"/><line data-s="R2" stroke="#7C3AED" stroke-width="3"/></g>
            <g class="alg-pan" data-pan="L" data-key="side:left" role="button" tabindex="0" aria-pressed="false"><rect class="alg-platform" x="-86" y="0" width="172" height="13" rx="6.5" fill="url(#${uid}p)" stroke="#B8860B" stroke-width="2"/><g data-items></g></g>
            <g class="alg-pan" data-pan="R" data-key="side:right" role="button" tabindex="0" aria-pressed="false"><rect class="alg-platform" x="-86" y="0" width="172" height="13" rx="6.5" fill="url(#${uid}p)" stroke="#B8860B" stroke-width="2"/><g data-items></g></g>
          </svg>
          <div class="alg-status" data-status></div>
        </div>
        <div class="alg-card alg-work"><h3>${esc(tt('Your working', 'तुम्हारा हल'))}</h3><ol data-work></ol></div>
      </div>
      <div class="alg-col">
        <div class="alg-card">
          <h3>${esc(tt('Do the same to both sides', 'दोनों पलड़ों में एक जैसा करो'))}</h3>
          <div class="alg-row"><span class="alg-lab">${esc(tt('Apply to', 'किस पर'))}</span>
            <div class="alg-seg" role="group" aria-label="${esc(tt('Which side', 'कौन-सा पलड़ा'))}">
              <button type="button" data-side="both" aria-pressed="true">${esc(tt('Both sides', 'दोनों'))}</button>
              <button type="button" data-side="left" data-key="side:left" aria-pressed="false">${esc(tt('Left only', 'सिर्फ़ बायाँ'))}</button>
              <button type="button" data-side="right" data-key="side:right" aria-pressed="false">${esc(tt('Right only', 'सिर्फ़ दायाँ'))}</button>
            </div></div>
          <div class="alg-row"><span class="alg-lab">${esc(tt('Number', 'संख्या'))}</span>${stepper('num', num, tt('Number to use', 'प्रयोग की संख्या'))}
            <div class="alg-seg" role="group" aria-label="${esc(tt('Number or x', 'संख्या या x'))}" data-kindseg>
              <button type="button" data-kind="n" aria-pressed="true">${esc(tt('number', 'संख्या'))}</button>
              <button type="button" data-kind="x" aria-pressed="false">${esc(v)}</button>
            </div></div>
          <div class="alg-ops">
            <button type="button" class="alg-op" data-op="+" data-key="op:+" aria-label="${esc(tt('Add', 'जोड़ो'))}">+</button>
            <button type="button" class="alg-op" data-op="-" data-key="op:-" aria-label="${esc(tt('Subtract', 'घटाओ'))}">−</button>
            <button type="button" class="alg-op" data-op="×" data-key="op:×" aria-label="${esc(tt('Multiply', 'गुणा करो'))}">×</button>
            <button type="button" class="alg-op" data-op="÷" data-key="op:÷" aria-label="${esc(tt('Divide', 'भाग दो'))}">÷</button>
          </div>
          <div class="alg-read" data-doing></div>
          <div class="alg-row">
            <button type="button" class="alg-btn" data-act="undo">${esc(tt('Undo', 'पीछे'))}</button>
            <button type="button" class="alg-btn" data-act="reset">${esc(tt('Start again', 'फिर से'))}</button>
            <button type="button" class="alg-btn" data-act="hint">${esc(tt('Hint', 'संकेत'))}</button>
          </div>
          <div class="alg-hint" data-hint aria-live="polite"></div>
        </div>
        <div class="alg-card">
          <h3>${esc(tt('Try a value', 'कोई मान आज़माओ'))}</h3>
          <label class="alg-row"><span class="alg-lab">${esc(v)} = <b data-tx>0</b></span>
            <input type="range" data-key="slider:x" min="${-trial}" max="${trial}" step="${tstep}" value="0" aria-label="${esc(tt('Try a value for ' + v, v + ' के लिए मान आज़माओ'))}"></label>
          <div class="alg-read" data-try aria-live="polite"></div>
        </div>
        <div class="alg-card">
          <h3>${esc(tt('Your answer', 'तुम्हारा उत्तर'))}</h3>
          <div class="alg-ans" data-key="answer" role="group" aria-label="${esc(tt('Answer', 'उत्तर'))}"><span>${esc(v)} =</span><input type="text" inputmode="text" autocomplete="off" aria-label="${esc(tt('Value of ' + v, v + ' का मान'))}" data-in><button type="button" class="alg-btn pri" data-act="check">${esc(tt('Check', 'जाँचो'))}</button></div>
        </div>
      </div></div>`;

    const $ = (s) => el.querySelector(s);
    const beam = $('[data-beam]'), pans = { L: $('[data-pan="L"]'), R: $('[data-pan="R"]') };
    const strs = {}; el.querySelectorAll('[data-s]').forEach((n) => { strs[n.dataset.s] = n; });

    function place(deg) {
      const th = (deg * Math.PI) / 180, cx = 300, cy = 70, R = 210, drop = 150;
      const lx = cx - R * Math.cos(th), ly = cy + R * Math.sin(th), rx = cx + R * Math.cos(th), ry = cy - R * Math.sin(th);
      beam.setAttribute('transform', `rotate(${-deg} 300 70)`);
      pans.L.setAttribute('transform', `translate(${lx.toFixed(1)} ${(ly + drop).toFixed(1)})`);
      pans.R.setAttribute('transform', `translate(${rx.toFixed(1)} ${(ry + drop).toFixed(1)})`);
      const sl = (n, x1, y1, x2, y2) => { n.setAttribute('x1', x1.toFixed(1)); n.setAttribute('y1', y1.toFixed(1)); n.setAttribute('x2', x2.toFixed(1)); n.setAttribute('y2', y2.toFixed(1)); };
      sl(strs.L1, lx, ly, lx - 80, ly + drop); sl(strs.L2, lx, ly, lx + 80, ly + drop);
      sl(strs.R1, rx, ry, rx - 80, ry + drop); sl(strs.R2, rx, ry, rx + 80, ry + drop);
    }
    const bagSVG = (x, y, neg) => `<g transform="translate(${x} ${y})"><g class="alg-pop"><path d="M10 6 Q22 -3 34 6 L39 15 Q46 27 41 38 Q22 46 3 38 Q-2 27 5 15 Z" fill="url(#${uid}${neg ? 'n' : 'x'})" stroke="${neg ? '#9B2C1B' : '#1E3A8A'}" stroke-width="2"${neg ? ' stroke-dasharray="5 3"' : ''}/><path d="M15 5 Q22 -6 29 5" fill="none" stroke="#FFD23F" stroke-width="3" stroke-linecap="round"/><text class="alg-svgtxt" x="22" y="31" text-anchor="middle" font-size="${neg ? 17 : 22}" fill="#fff">${neg ? '−' : ''}${esc(v)}</text></g></g>`;
    const blockSVG = (x, y, neg) => `<g transform="translate(${x} ${y})"><g class="alg-pop"><rect width="22" height="22" rx="4" fill="url(#${uid}${neg ? 'n' : 'k'})" stroke="${neg ? '#9B2C1B' : '#B8860B'}" stroke-width="2"${neg ? ' stroke-dasharray="4 2"' : ''}/><text class="alg-svgtxt" x="11" y="16" text-anchor="middle" font-size="${neg ? 11 : 13}" fill="${neg ? '#5C1408' : '#5B3A00'}">${neg ? '−' : ''}1</text></g></g>`;
    const balloonSVG = (x, y, label) => `<g transform="translate(${x} ${y})"><g class="alg-pop"><line x1="0" y1="14" x2="0" y2="34" stroke="#9B2C1B" stroke-width="2"/><ellipse cx="0" cy="0" rx="15" ry="18" fill="url(#${uid}n)" stroke="#9B2C1B" stroke-width="2"/><text class="alg-svgtxt" x="0" y="5" text-anchor="middle" font-size="14" fill="#5C1408">${esc(label)}</text></g></g>`;
    const chipSVG = (x, y, label, neg) => `<g transform="translate(${x} ${y})"><g class="alg-pop"><rect x="-70" y="-30" width="140" height="30" rx="10" fill="${neg ? '#FFC2B6' : '#DDD6FE'}" stroke="${neg ? '#9B2C1B' : '#5B21B6'}" stroke-width="2"/><text class="alg-svgtxt" x="0" y="-9" text-anchor="middle" font-size="16" fill="#1E293B">${label}</text></g></g>`;

    // The items of one pan: bags then blocks stacked from the platform up; balloons float above.
    function panItems(s, badge, key) {
      let out = '', y = 0;
      const pile = (n, neg, w, h, cols, fn) => {
        const rows = Math.ceil(n / cols);
        for (let r = 0; r < rows; r++) {
          const inRow = Math.min(cols, n - r * cols), x0 = -(inRow * w) / 2 + (w - (w === 44 ? 44 : w)) / 2;
          for (let k = 0; k < inRow; k++) out += fn(x0 + k * w + 1, -(y + (r + 1) * h) - 1);
        }
        y += rows * h;
      };
      const a = s.a, b = s.b, balloons = [];
      const small = (z, cap) => fint(z) && Math.abs(z.n) <= cap;
      // positive bags and blocks sit on the pan; negatives become balloons
      if (!fz(b) && small(b, 24) && b.n > 0) pile(b.n, false, 24, 24, 6, (x, yy) => blockSVG(x, yy, false));
      if (!fz(a) && small(a, 9) && a.n > 0) pile(a.n, false, 44, 44, 3, (x, yy) => bagSVG(x, yy, false));
      const chips = [];
      if (!fz(a) && !(small(a, 9) && a.n > 0)) { if (small(a, 9) && a.n < 0) for (let k = 0; k < -a.n; k++) balloons.push(v); else chips.push([pfmt([F0, a], v, false), a.n < 0]); }
      if (!fz(b) && !(small(b, 24) && b.n > 0)) { if (small(b, 24) && b.n < 0) for (let k = 0; k < -b.n; k++) balloons.push('1'); else chips.push([pfmt([b], v, false), b.n < 0]); }
      chips.forEach((cp) => { y += 34; out += chipSVG(0, -y + 34, esc(cp[0]), cp[1]); });
      if (balloons.length) {
        const cols = 5, rows = Math.ceil(balloons.length / cols);
        const baseY = -y - 44;
        balloons.forEach((lb, k) => {
          const r = Math.floor(k / cols), inRow = Math.min(cols, balloons.length - r * cols), cx = (k % cols - (inRow - 1) / 2) * 34;
          out += balloonSVG(cx, baseY - r * 38, '−' + lb);
        });
        out += `<line x1="0" y1="${-y}" x2="0" y2="${baseY + 34}" stroke="#9B2C1B" stroke-width="1.5" stroke-dasharray="3 3"/>`;
        y += rows * 38 + 44;
      }
      if (fz(a) && fz(b)) out += `<text class="alg-svgtxt" x="0" y="-12" text-anchor="middle" font-size="20" fill="var(--ink-2)">0</text>`;
      if (badge) out += `<text class="alg-float" x="0" y="${-Math.max(y, 30) - 24}" text-anchor="middle" fill="#7C3AED">${esc(badge)}</text>`;
      return out;
    }
    function drawPans() {
      const s = cur();
      ['L', 'R'].forEach((k) => {
        const badge = lastOp && (lastOp.sides.includes(k)) ? lastOp.text : '';
        pans[k].querySelector('[data-items]').innerHTML = panItems(s[k], badge, k);
        const side = k === 'L' ? tt('Left pan', 'बायाँ पलड़ा') : tt('Right pan', 'दायाँ पलड़ा');
        pans[k].setAttribute('aria-label', `${side}: ${lin(s[k], false)}. ${tt('Tap to work on this side only', 'सिर्फ़ इस पलड़े पर काम करने के लिए छुओ')}`);
        const on = sideSel === (k === 'L' ? 'left' : 'right');
        pans[k].classList.toggle('sel', on); pans[k].setAttribute('aria-pressed', String(on));
      });
    }
    function tiltFor(s) {
      const d = fnum(fsub(val(s.L, w), val(s.R, w)));
      return d === 0 ? 0 : Math.sign(d) * clamp(5 + Math.abs(d) * 0.9, 5, 14);
    }
    function setAngle(target, instant) {
      if (stopTw) stopTw();
      const from = angle;
      if (instant) { angle = target; place(angle); return; }
      stopTw = L.tween(650, (t) => { const k = 1 - Math.pow(1 - t, 3); angle = from + (target - from) * k * (1 + Math.sin(t * Math.PI * 3) * (1 - t) * 0.12); place(angle); }, () => { angle = target; place(angle); });
    }
    function drawWork() {
      $('[data-work]').innerHTML = hist.map((h, i) => `<li><span>${lin(h.s.L, true)} = ${lin(h.s.R, true)}</span><span class="n">${i === 0 ? esc(tt('start', 'शुरुआत')) : esc(h.note)}</span></li>`).join('');
      const ol = $('[data-work]'); ol.scrollTop = ol.scrollHeight;
    }
    function drawDoing() {
      const op = null; void op;
      $('[data-doing]').textContent = tt('Choose a number, then tap + − × ÷. It is done to ', 'संख्या चुनो, फिर + − × ÷ छुओ। यह किया जाएगा ') + (sideSel === 'both' ? tt('both sides.', 'दोनों पलड़ों पर।') : sideSel === 'left' ? tt('the left side only: watch the scale.', 'सिर्फ़ बाएँ पलड़े पर: तराज़ू देखो।') : tt('the right side only: watch the scale.', 'सिर्फ़ दाएँ पलड़े पर: तराज़ू देखो।'));
    }
    function drawAll(animate) {
      const s = cur();
      const eqE = $('[data-eq]');
      eqE.innerHTML = eqHTML(s); eqE.setAttribute('aria-label', eqAria(s));
      const lv = level(s);
      eqE.classList.toggle('alg-tip', !lv);
      drawPans(); drawWork(); drawDoing();
      const st = $('[data-status]');
      if (lv) { st.className = 'alg-status good'; st.textContent = solved ? tt(`Solved! ${v} = ${fstr(w)}`, `हल हो गया! ${v} = ${fstr(w)}`) : tt('Balanced: both sides weigh the same.', 'संतुलित: दोनों पलड़े बराबर हैं।'); }
      else { st.className = 'alg-status bad'; st.textContent = tt('Tipped! You changed only one side. Undo it, or do the same to the other side.', 'तराज़ू झुक गया! तुमने एक ही पलड़ा बदला। पीछे जाओ या दूसरे पलड़े पर भी वही करो।'); }
      setAngle(tiltFor(s), !animate);
      $('[data-hint]').textContent = hintTxt;
      $('[data-kindseg]').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
      el.querySelectorAll('[data-side]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.side === sideSel)));
      el.querySelector('[data-act="undo"]').disabled = hist.length < 2;
      updateTry();
    }
    function updateTry() {
      const s = cur(), t = tryX;
      $('[data-tx]').textContent = fstr(t);
      const lv = val(s.L, t), rv = val(s.R, t), same = feq(lv, rv);
      $('[data-try]').innerHTML = `${esc(tt('Left', 'बायाँ'))} = <b>${fstr(lv)}</b> &nbsp; ${esc(tt('Right', 'दायाँ'))} = <b>${fstr(rv)}</b> &nbsp; ${same ? `<span class="alg-ok">✓ ${esc(tt('equal: this value makes the equation true', 'बराबर: यह मान समीकरण को सही बनाता है'))}</span>` : `<span>${lv.n * rv.d > rv.n * lv.d ? esc(tt('Left is bigger', 'बायाँ बड़ा')) : esc(tt('Right is bigger', 'दायाँ बड़ा'))}</span>`}`;
    }
    function checkSolved() {
      const s = cur();
      const forms = [[s.L, s.R], [s.R, s.L]];
      for (const [a, b] of forms) {
        if (feq(a.a, F1) && fz(a.b) && fz(b.a) && level(s)) {
          if (!solved) { solved = true; api.emit('solved:' + fstr(b.b).replace('−', '-')); api.record(`solved ${v} = ${fstr(b.b)}`); api.celebrate(); say(tt(`${v} = ${fstr(b.b)}. Put it back in the first equation to check.`, `${v} = ${fstr(b.b)}। पहले समीकरण में रखकर जाँचो।`), 'good'); }
          return;
        }
      }
    }
    function applyOp(op) {
      const n = fr(num);
      const k = op === '×' || op === '÷' ? 'n' : kind;
      const sides = sideSel === 'both' ? ['L', 'R'] : [sideSel === 'left' ? 'L' : 'R'];
      const ns = { L: { ...cur().L }, R: { ...cur().R } };
      sides.forEach((sd) => {
        const t = ns[sd];
        if (op === '+') { if (k === 'x') t.a = fadd(t.a, n); else t.b = fadd(t.b, n); }
        else if (op === '-') { if (k === 'x') t.a = fsub(t.a, n); else t.b = fsub(t.b, n); }
        else if (op === '×') { t.a = fmul(t.a, n); t.b = fmul(t.b, n); }
        else { t.a = fdiv(t.a, n); t.b = fdiv(t.b, n); }
      });
      if ([ns.L.a, ns.L.b, ns.R.a, ns.R.b].some(fbig)) { say(tt('That makes the numbers too big. Try something else.', 'इससे संख्याएँ बहुत बड़ी हो जाएँगी। कुछ और करो।'), 'bad'); return; }
      const opTxt = (op === '-' ? '−' : op) + ' ' + num + (k === 'x' ? v : '').replace('-', '−');
      const sideTxt = sideSel === 'both' ? tt('both sides', 'दोनों ओर') : sideSel === 'left' ? tt('left only', 'सिर्फ़ बाएँ') : tt('right only', 'सिर्फ़ दाएँ');
      lastOp = { sides, text: opTxt.replace('-', '−') };
      hist.push({ s: ns, note: `${opTxt.replace('-', '−')} (${sideTxt})` });
      hintTxt = '';
      api.record(`${opTxt} ${sideTxt}: ${eqAria(ns)}`);
      const lv = level(ns);
      drawAll(true);
      if (lv) { say(tt('Still balanced: the same was done to both sides.', 'अब भी संतुलित: दोनों ओर एक जैसा किया।'), 'good'); api.emit('balanced'); checkSolved(); }
      else { say(tt('The scale tips. Only operations done to both sides keep it balanced.', 'तराज़ू झुक गया। जो क्रिया दोनों ओर की जाती है वही संतुलन रखती है।'), 'bad'); }
      wasLevel = lv;
    }
    function hint() {
      const s = cur();
      const hx = (z, signWord) => z;
      void hx;
      let txt;
      const T = tt;
      if (!level(s)) txt = T('First press Undo, so the scale is level again.', 'पहले "पीछे" दबाओ ताकि तराज़ू बराबर हो जाए।');
      else if (!fz(s.L.a) && !fz(s.R.a)) {
        const z = s.R.a;
        txt = z.n > 0 ? T(`Both sides have ${v}. Subtract ${fstr(z)}${v} from both sides (choose ${v}, then −).`, `दोनों ओर ${v} है। दोनों ओर से ${fstr(z)}${v} घटाओ (${v} चुनो, फिर −)।`)
          : T(`Both sides have ${v}. Add ${fstr(fneg(z))}${v} to both sides (choose ${v}, then +).`, `दोनों ओर ${v} है। दोनों ओर ${fstr(fneg(z))}${v} जोड़ो (${v} चुनो, फिर +)।`);
      } else {
        const X = !fz(s.L.a) ? s.L : s.R;
        if (!fz(X.b)) txt = X.b.n > 0 ? T(`Remove the plain number ${fstr(X.b)} from the ${v} side: subtract ${fstr(X.b)} from both sides.`, `${v} वाले पलड़े से सादी संख्या ${fstr(X.b)} हटाओ: दोनों ओर से ${fstr(X.b)} घटाओ।`) : T(`Add ${fstr(fneg(X.b))} to both sides to remove ${fstr(X.b)}.`, `${fstr(X.b)} हटाने के लिए दोनों ओर ${fstr(fneg(X.b))} जोड़ो।`);
        else if (!feq(X.a, F1)) txt = fint(X.a) ? T(`Now ${fstr(X.a)} bags of ${v} balance a number. Divide both sides by ${fstr(X.a)}.`, `अब ${fstr(X.a)} थैले ${v} एक संख्या के बराबर हैं। दोनों ओर ${fstr(X.a)} से भाग दो।`) : T(`Multiply both sides by ${X.a.d} to clear the fraction.`, `भिन्न हटाने के लिए दोनों ओर ${X.a.d} से गुणा करो।`);
        else txt = T(`${v} is alone. Type its value in the answer box.`, `${v} अकेला है। उत्तर वाले डिब्बे में उसका मान लिखो।`);
      }
      hintTxt = txt; $('[data-hint]').textContent = txt; api.record('asked for a hint');
    }

    el.addEventListener('click', (e) => {
      const t = e.target;
      const op = t.closest('[data-op]');
      if (op) { if (guard(op.dataset.key)) applyOp(op.dataset.op); return; }
      const sd = t.closest('button[data-side]');
      if (sd) { if (sd.dataset.key && !guard(sd.dataset.key)) return; sideSel = sd.dataset.side; drawAll(false); return; }
      const kd = t.closest('button[data-kind]');
      if (kd) { kind = kd.dataset.kind; drawAll(false); return; }
      const act = t.closest('[data-act]');
      if (act) {
        const a = act.dataset.act;
        if (a === 'undo' && hist.length > 1) { hist.pop(); lastOp = null; solved = false; hintTxt = ''; say(''); drawAll(true); if (level(cur())) api.emit('balanced'); }
        else if (a === 'reset') { hist = [hist[0]]; lastOp = null; solved = false; hintTxt = ''; say(''); drawAll(true); }
        else if (a === 'hint') hint();
        else if (a === 'check') { if (guard('answer')) check(); }
        return;
      }
      const pan = t.closest('.alg-pan');
      if (pan && guard(pan.dataset.key)) { sideSel = sideSel === (pan.dataset.pan === 'L' ? 'left' : 'right') ? 'both' : (pan.dataset.pan === 'L' ? 'left' : 'right'); drawAll(false); }
    });
    el.addEventListener('keydown', (e) => { const pan = e.target.closest && e.target.closest('.alg-pan'); if (pan && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pan.dispatchEvent(new MouseEvent('click', { bubbles: true })); } if (e.key === 'Enter' && e.target.matches('[data-in]')) check(); });
    bindSteppers({ num: { min: -12, max: 12, skip0: true, get: () => num, set: (n) => { num = n; } } });
    const sl = $('[data-key="slider:x"]');
    sl.addEventListener('input', () => {
      if (!guard('slider:x')) { sl.value = fnum(tryX); return; }
      tryX = fr(Math.round(+sl.value * w.d), w.d);
      updateTry();
      if (feq(val(cur().L, tryX), val(cur().R, tryX)) && feq(tryX, w)) { api.emit('balanced'); api.record('found the balancing value ' + fstr(w)); }
    });
    function check() {
      const g = parseNum($('[data-in]').value);
      if (!g) { say(tt('Type a number like 4, -3 or 7/2.', '4, -3 या 7/2 जैसी संख्या लिखो।'), 'bad'); return; }
      if (feq(g, w)) { api.emit('answered:right'); api.record('answered right ' + fstr(w)); say(tt(`Yes! ${v} = ${fstr(w)}. Left = ${fstr(val(start.L, w))} and right = ${fstr(val(start.R, w))}.`, `हाँ! ${v} = ${fstr(w)}। बायाँ = ${fstr(val(start.L, w))} और दायाँ = ${fstr(val(start.R, w))}।`), 'good'); if (!solved) { solved = true; api.emit('solved:' + fstr(w).replace('−', '-')); } api.celebrate(); drawAll(false); }
      else { api.emit('answered:wrong'); api.record('answered wrong ' + fstr(g)); say(tt(`Not yet. Put ${fstr(g)} in place of ${v} in the first equation: left = ${fstr(val(start.L, g))}, right = ${fstr(val(start.R, g))}. They are not equal.`, `अभी नहीं। पहले समीकरण में ${v} की जगह ${fstr(g)} रखो: बायाँ = ${fstr(val(start.L, g))}, दायाँ = ${fstr(val(start.R, g))}। ये बराबर नहीं हैं।`), 'bad'); }
    }
    drawAll(false);
    say(tt(`Goal: get ${v} alone on one side, keeping the scale level.`, `लक्ष्य: ${v} को अकेला करो और तराज़ू बराबर रखो।`));
    return { destroy() { if (stopTw) stopTw(); } };
  }

  // ------------------------------------------------------------------ mode: tiles
  const TILE_TYPES = ['x2', 'x', '1', '-x', '-1'];
  function mountTiles(c) {
    const { api, cfg, tt, v, el, say, guard } = c;
    const goal = cfg.equation != null ? parsePoly(cfg.equation, v) : null;
    const cnt = { x2: 0, x: 0, '1': 0, '-x': 0, '-1': 0 };
    let lastAdded = null, xval = fr(0), wasZero = false, cancelled = 0;
    const label = (t) => (t === 'x2' ? v + '²' : t === 'x' ? v : t === '1' ? '1' : t === '-x' ? '−' + v : '−1');
    const tileName = (t) => ({ x2: tt(v + ' squared tile', v + ' वर्ग टाइल'), x: tt(v + ' tile', v + ' टाइल'), '1': tt('1 tile', '1 टाइल'), '-x': tt('negative ' + v + ' tile', 'ऋणात्मक ' + v + ' टाइल'), '-1': tt('negative 1 tile', 'ऋणात्मक 1 टाइल') })[t];
    const tileHTML = (t, tag, extra) => `<${tag} class="alg-tile t-${t.replace('-', '')}${t[0] === '-' ? ' neg' : ''}${extra || ''}"${tag === 'button' ? ` type="button" data-rm="${t}" aria-label="${esc(tileName(t) + '. ' + tt('Tap to remove', 'हटाने के लिए छुओ'))}"` : ' aria-hidden="true"'}>${esc(label(t))}</${tag}>`;
    const net = () => ptrim([fr(cnt['1'] - cnt['-1']), fr(cnt.x - cnt['-x']), fr(cnt.x2)]);
    const total = () => TILE_TYPES.reduce((s, t) => s + cnt[t], 0);

    el.innerHTML = `<div class="alg-grid">
      <div class="alg-col">
        ${goal ? `<div class="alg-card"><h3>${esc(tt('Build this with tiles', 'टाइलों से यह बनाओ'))}</h3><div class="alg-eq" role="img" aria-label="${esc(pfmt(goal, v, false))}">${pfmt(goal, v, true)}</div></div>` : ''}
        <div class="alg-card"><h3>${esc(tt('Tiles: tap to add', 'टाइलें: जोड़ने के लिए छुओ'))}</h3>
          <div class="alg-tray" role="group" aria-label="${esc(tt('Tile tray', 'टाइलों की ट्रे'))}">${TILE_TYPES.map((t) => `<button type="button" data-add="${t}" data-key="tile:${t}" aria-label="${esc(tt('Add a ', 'जोड़ो: ') + tileName(t))}">${tileHTML(t, 'span')}<span>${esc(tileName(t).toString().replace(/ tile| टाइल/, ''))}</span></button>`).join('')}</div>
          <div class="alg-read">${esc(tt('Green and yellow are positive. Dashed red tiles are negative. One positive and one negative of the same kind make a zero pair.', 'हरी और पीली टाइलें धनात्मक हैं। लाल धारीदार टाइलें ऋणात्मक हैं। एक ही प्रकार की धनात्मक और ऋणात्मक टाइल मिलकर शून्य जोड़ी बनाती हैं।'))}</div>
        </div>
      </div>
      <div class="alg-col">
        <div class="alg-card"><h3>${esc(tt('Your tiles (tap one to remove it)', 'तुम्हारी टाइलें (हटाने के लिए छुओ)'))}</h3>
          <div class="alg-bench" data-bench></div>
          <div class="alg-eq" data-net role="img"></div>
          <div class="alg-row"><button type="button" class="alg-btn" data-act="cancel">${esc(tt('Cancel zero pairs', 'शून्य जोड़ियाँ हटाओ'))}</button><button type="button" class="alg-btn" data-act="clear">${esc(tt('Clear all', 'सब हटाओ'))}</button></div>
        </div>
        <div class="alg-card"><h3>${esc(tt('Put in a value', 'कोई मान रखो'))}</h3>
          <label class="alg-row"><span class="alg-lab">${esc(v)} = <b data-tx>0</b></span><input type="range" data-key="slider:x" min="-10" max="10" step="1" value="0" aria-label="${esc(tt('Value of ' + v, v + ' का मान'))}"></label>
          <div class="alg-read" data-ev aria-live="polite"></div></div>
        ${goal ? `<div class="alg-card"><div class="alg-row" data-key="answer" role="group" aria-label="${esc(tt('Check your tiles', 'अपनी टाइलें जाँचो'))}"><button type="button" class="alg-btn pri" data-act="check">${esc(tt('Check my tiles', 'मेरी टाइलें जाँचो'))}</button></div></div>` : ''}
      </div></div>`;
    const $ = (s) => el.querySelector(s);
    const zp = () => ({ x: Math.min(cnt.x, cnt['-x']), u: Math.min(cnt['1'], cnt['-1']) });

    function draw() {
      const bench = $('[data-bench]');
      if (!total()) bench.innerHTML = `<div class="alg-empty">${esc(tt('Tap a tile in the tray to put it here.', 'ट्रे की कोई टाइल छुओ, वह यहाँ आ जाएगी।'))}</div>`;
      else {
        const z = zp();
        const grp = (types) => {
          const s = types.map((t) => {
            let h = '';
            const pairs = t === 'x' || t === '-x' ? z.x : t === '1' || t === '-1' ? z.u : 0;
            for (let i = 0; i < cnt[t]; i++) h += tileHTML(t, 'button', (i < pairs ? ' zp' : '') + (lastAdded === t && i === cnt[t] - 1 ? ' new' : ''));
            return h;
          }).join('');
          return s ? `<div class="grp">${s}</div>` : '';
        };
        bench.innerHTML = grp(['x2']) + grp(['x', '-x']) + grp(['1', '-1']);
      }
      const n = net();
      $('[data-net]').innerHTML = '= ' + pfmt(n, v, true);
      $('[data-net]').setAttribute('aria-label', tt('Total', 'कुल') + ' ' + pfmt(n, v, false));
      const z = zp();
      $('[data-act="cancel"]').disabled = !(z.x || z.u);
      $('[data-act="clear"]').disabled = !total();
      ev();
    }
    function ev() {
      const n = net(); $('[data-tx]').textContent = fstr(xval);
      $('[data-ev]').innerHTML = `${esc(pfmt(n, v, false))} ${esc(tt('at', 'पर'))} ${esc(v)} = ${fstr(xval)}: <b>${fstr(peval(n, xval))}</b>`;
    }
    function after() {
      draw();
      const zero = total() >= 2 && peq(net(), [F0]);
      if (zero && !wasZero) { api.emit('balanced'); say(tt('Everything cancels: the total is 0.', 'सब कट गया: कुल 0 है।'), 'good'); }
      wasZero = zero;
    }
    el.addEventListener('click', (e) => {
      const add = e.target.closest('[data-add]');
      if (add) {
        if (!guard(add.dataset.key)) return;
        if (total() >= 40) { say(tt('That is a lot of tiles. Remove some first.', 'टाइलें बहुत हो गईं। पहले कुछ हटाओ।'), 'bad'); return; }
        cnt[add.dataset.add]++; lastAdded = add.dataset.add; say(''); api.record('added ' + add.dataset.add); after(); return;
      }
      const rm = e.target.closest('[data-rm]');
      if (rm) { cnt[rm.dataset.rm]--; lastAdded = null; say(''); after(); return; }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'cancel') { const z = zp(); cnt.x -= z.x; cnt['-x'] -= z.x; cnt['1'] -= z.u; cnt['-1'] -= z.u; lastAdded = null; cancelled++; say(tt('Zero pairs removed. The total did not change.', 'शून्य जोड़ियाँ हट गईं। कुल नहीं बदला।'), 'good'); api.record('cancelled zero pairs'); after(); }
      else if (act.dataset.act === 'clear') { TILE_TYPES.forEach((t) => { cnt[t] = 0; }); lastAdded = null; say(''); after(); }
      else if (act.dataset.act === 'check') {
        if (!guard('answer')) return;
        if (peq(net(), goal)) { api.emit('answered:right'); api.record('built ' + pfmt(goal, v, false)); say(tt('Yes! Your tiles show ' + pfmt(goal, v, false) + '.', 'हाँ! तुम्हारी टाइलें ' + pfmt(goal, v, false) + ' दिखाती हैं।'), 'good'); api.celebrate(); }
        else { api.emit('answered:wrong'); say(tt('Not yet. Your tiles show ' + pfmt(net(), v, false) + ' but the target is ' + pfmt(goal, v, false) + '. Remember: a zero pair adds nothing.', 'अभी नहीं। तुम्हारी टाइलें ' + pfmt(net(), v, false) + ' दिखाती हैं पर लक्ष्य ' + pfmt(goal, v, false) + ' है। याद रखो: शून्य जोड़ी कुछ नहीं जोड़ती।'), 'bad'); }
      }
    });
    const sl = $('[data-key="slider:x"]');
    sl.addEventListener('input', () => { if (!guard('slider:x')) { sl.value = fnum(xval); return; } xval = fr(+sl.value); ev(); });
    draw();
    say(goal ? tt('Tap tiles to build the polynomial, then press Check.', 'टाइलें छूकर बहुपद बनाओ, फिर जाँचो दबाओ।') : tt('Tap tiles to build any expression. Try a ' + v + ' tile and a negative ' + v + ' tile together.', 'टाइलें छूकर कोई व्यंजक बनाओ। एक ' + v + ' टाइल और एक ऋणात्मक ' + v + ' टाइल साथ रखकर देखो।'));
    return { destroy() {} };
  }

  // ------------------------------------------------------------------ area model (expand, factorise)
  // f1 = [a1, b1] (columns), f2 = [a2, b2] (rows); open(i,j) says whether the cell shows its product.
  function areaSVG(uid, v, f1, f2, open, interactive) {
    const [a1, b1] = f1, [a2, b2] = f2;
    const X0 = 74, Y0 = 46, W0 = 190, W1 = 130, H0 = 104, H1 = 80;
    const cols = [{ w: W0, coef: a1, deg: 1, x: X0 }, { w: W1, coef: b1, deg: 0, x: X0 + W0 }];
    const rows = [{ h: H0, coef: a2, deg: 1, y: Y0 }, { h: H1, coef: b2, deg: 0, y: Y0 + H0 }];
    const term = (coef, deg) => (deg === 0 ? String(coef) : (coef === 1 ? '' : coef === -1 ? '−' : String(coef)) + v + (deg === 2 ? '²' : '')).replace('-', '−');
    const head = (coef, deg) => (deg === 0 ? (coef < 0 ? '−' + Math.abs(coef) : '+' + coef) : (coef === 1 ? '' : coef) + v);
    let out = `<defs><pattern id="${uid}h" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="9" height="9" fill="none"/><line x1="0" y1="0" x2="0" y2="9" stroke="#fff" stroke-opacity=".5" stroke-width="3"/></pattern></defs>`;
    cols.forEach((c, j) => { out += `<text class="alg-svgtxt" x="${c.x + c.w / 2}" y="${Y0 - 14}" text-anchor="middle" font-size="26" fill="var(--ink)">${esc(head(c.coef, c.deg))}</text>`; });
    rows.forEach((r) => { out += `<text class="alg-svgtxt" x="${X0 - 12}" y="${r.y + r.h / 2 + 9}" text-anchor="end" font-size="26" fill="var(--ink)">${esc(head(r.coef, r.deg))}</text>`; });
    rows.forEach((r, i) => cols.forEach((c, j) => {
      const k = c.coef * r.coef, d = c.deg + r.deg;
      const cls = d === 2 ? 'x2' : d === 1 ? 'x' : '1';
      const fill = k < 0 ? '#FF9C8A' : d === 2 ? '#8FB0FF' : d === 1 ? '#6FE0C0' : '#FFD968';
      const isOpen = open(i, j);
      const shown = k === 0 ? '0' : term(k, d);
      const prod = `${term(c.coef, c.deg) || ''}`.length ? '' : '';
      void prod;
      const hid = (d === 0 ? '' : '') + '?';
      out += `<g class="alg-cell ${isOpen ? 'open' : 'hid'}" data-cell="${i}${j}" ${interactive && !isOpen ? `role="button" tabindex="0" data-key="tile:${d === 2 ? 'x2' : (k < 0 ? '-' : '') + (d === 1 ? 'x' : '1')}" aria-label="${esc((head(c.coef, c.deg) + ' × ' + head(r.coef, r.deg)).replace(/\+/g, ''))}"` : 'role="img"'}${interactive ? '' : ` aria-label="${esc(shown)}"`}>
        <rect x="${c.x + 3}" y="${r.y + 3}" width="${c.w - 6}" height="${r.h - 6}" rx="12" fill="${fill}" stroke="#1E293B" stroke-opacity=".35" stroke-width="2"/>${k < 0 ? `<rect x="${c.x + 3}" y="${r.y + 3}" width="${c.w - 6}" height="${r.h - 6}" rx="12" fill="url(#${uid}h)"/>` : ''}
        <text class="alg-svgtxt val" x="${c.x + c.w / 2}" y="${r.y + r.h / 2 + 10}" text-anchor="middle" font-size="${d === 2 ? 34 : 30}" fill="#0F172A">${esc(shown)}</text>
        ${isOpen ? '' : `<text class="alg-svgtxt" x="${c.x + c.w / 2}" y="${r.y + r.h / 2 + 10}" text-anchor="middle" font-size="30" fill="#0F172A" opacity=".55">?</text>`}</g>`;
    }));
    return out;
  }
  const AREA_VIEW = '0 0 400 250';

  function squareNote(tt, f, g, v) {
    const [a1, b1] = [co(f, 1).n, co(f, 0).n], [a2, b2] = [co(g, 1).n, co(g, 0).n];
    if (a1 === a2 && b1 === b2) return b1 > 0 ? tt('Identity: (a + b)² = a² + 2ab + b²', 'सर्वसमिका: (a + b)² = a² + 2ab + b²') : tt('Identity: (a − b)² = a² − 2ab + b²', 'सर्वसमिका: (a − b)² = a² − 2ab + b²');
    if (a1 === a2 && b1 === -b2) return tt('Identity: (a + b)(a − b) = a² − b²', 'सर्वसमिका: (a + b)(a − b) = a² − b²');
    return '';
  }

  // ------------------------------------------------------------------ mode: expand
  function mountExpand(c) {
    const { api, cfg, tt, v, el, say, guard, stepper, bindSteppers } = c;
    const uid = 'ale' + ++UID;
    const [f, g] = parseBinomials(cfg.equation, v);
    const prod = pmul(f, g);
    const F1v = [co(f, 1).n, co(f, 0).n], F2v = [co(g, 1).n, co(g, 0).n];
    const given = `(${pfmt(f, v, false)})(${pfmt(g, v, false)})`.replace(/\(([^()]+)\)\(\1\)/, '($1)²');
    const givenH = given.replace(/\n/g, '');
    const opened = new Set();
    let ans = { 2: 0, 1: 0, 0: 0 }, xv = fr(0), done = false;
    const note = squareNote(tt, f, g, v);
    const all = () => opened.size === 4;

    el.innerHTML = `<div class="alg-grid">
      <div class="alg-col">
        <div class="alg-card"><h3>${esc(tt('Expand', 'फैलाओ (गुणा करो)'))}</h3><div class="alg-eq" role="img" aria-label="${esc(given)}">${esc(givenH)}</div>
          ${note ? `<div class="alg-status good">${esc(note)}</div>` : ''}
          <svg class="alg-svg" viewBox="${AREA_VIEW}" data-area role="group" aria-label="${esc(tt('Area model: tap each box to see its product', 'क्षेत्रफल मॉडल: हर डिब्बा छूकर गुणनफल देखो'))}"></svg>
          <div class="alg-row"><button type="button" class="alg-btn" data-act="show">${esc(tt('Show all boxes', 'सब डिब्बे दिखाओ'))}</button></div>
          <div class="alg-read" data-like aria-live="polite">${esc(tt('Tap each box: its width times its height.', 'हर डिब्बा छुओ: उसकी चौड़ाई × ऊँचाई।'))}</div>
        </div>
      </div>
      <div class="alg-col">
        <div class="alg-card"><h3>${esc(tt('Write the answer: add the like terms', 'उत्तर लिखो: समान पद जोड़ो'))}</h3>
          <div class="alg-ans" data-key="answer" role="group" aria-label="${esc(tt('Your answer', 'तुम्हारा उत्तर'))}">
            ${stepper('c2', 0, tt('Number of ' + v + ' squared', v + ' वर्ग की संख्या'))}<span>${esc(v)}²</span> <span>+</span>
            ${stepper('c1', 0, tt('Number of ' + v, v + ' की संख्या'))}<span>${esc(v)}</span> <span>+</span>
            ${stepper('c0', 0, tt('Plain number', 'सादी संख्या'))}
            <button type="button" class="alg-btn pri" data-act="check">${esc(tt('Check', 'जाँचो'))}</button></div>
          <div class="alg-read" data-yours></div>
        </div>
        <div class="alg-card"><h3>${esc(tt('Test with a number', 'किसी संख्या से परखो'))}</h3>
          <label class="alg-row"><span class="alg-lab">${esc(v)} = <b data-tx>0</b></span><input type="range" data-key="slider:x" min="-10" max="10" step="1" value="0" aria-label="${esc(tt('Value of ' + v, v + ' का मान'))}"></label>
          <div class="alg-read" data-ev aria-live="polite"></div></div>
      </div></div>`;
    const $ = (s) => el.querySelector(s);
    const svg = $('[data-area]');
    const termS = (k, d) => pfmt(d === 2 ? [F0, F0, fr(k)] : d === 1 ? [F0, fr(k)] : [fr(k)], v, false);
    const mine = () => ptrim([fr(ans[0]), fr(ans[1]), fr(ans[2])]);
    function drawArea() {
      svg.innerHTML = areaSVG(uid, v, F1v, F2v, (i, j) => opened.has(i + '' + j), true);
      const like = $('[data-like]');
      if (all()) {
        const mid = F1v[0] * F2v[1] + F1v[1] * F2v[0];
        like.innerHTML = `${esc(tt('The two middle boxes are like terms: ', 'बीच के दोनों डिब्बे समान पद हैं: '))}<b>${esc(termS(F1v[0] * F2v[1], 1))}</b> + <b>${esc(termS(F1v[1] * F2v[0], 1).replace(/^−/, '−'))}</b> = <b>${esc(termS(mid, 1))}</b>.<br>${esc(tt('Full answer: ', 'पूरा उत्तर: '))}<b>${esc(pfmt(prod, v, false))}</b>`;
      }
    }
    function revealCell(key) { opened.add(key); drawArea(); api.record('opened box ' + key); }
    function evalRow() {
      $('[data-tx]').textContent = fstr(xv);
      const a = peval(prod, xv), m = peval(mine(), xv), orig = fmul(peval(f, xv), peval(g, xv));
      $('[data-ev]').innerHTML = `${esc(given)} ${esc(tt('at', 'पर'))} ${esc(v)} = ${fstr(xv)}: <b>${fstr(orig)}</b><br>${esc(tt('Your answer at the same value: ', 'तुम्हारा उत्तर उसी मान पर: '))}<b>${fstr(m)}</b> ${feq(m, orig) ? '<span class="alg-ok">✓</span>' : `<span>${esc(tt('(different, so something is off)', '(अलग है, यानी कुछ गड़बड़ है)'))}</span>`}`;
      void a;
    }
    el.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-cell]');
      if (cell && !cell.classList.contains('open')) { const k = cell.dataset.cell; if (guard(cell.dataset.key || 'answer')) revealCell(k); return; }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'show') { ['00', '01', '10', '11'].forEach((k) => opened.add(k)); drawArea(); return; }
      if (act.dataset.act === 'check') {
        if (!guard('answer')) return;
        if (peq(mine(), prod)) {
          done = true; ['00', '01', '10', '11'].forEach((k) => opened.add(k)); drawArea();
          api.emit('expanded'); api.emit('answered:right'); api.record('expanded ' + given + ' = ' + pfmt(prod, v, false)); api.celebrate();
          say(tt(`Yes! ${given} = ${pfmt(prod, v, false)}.`, `हाँ! ${given} = ${pfmt(prod, v, false)}।`), 'good');
        } else {
          api.emit('answered:wrong');
          const bad = [2, 1, 0].filter((d) => !feq(co(mine(), d), co(prod, d)));
          const w = bad[0];
          const msg = w === 2 ? tt(`Check the ${v}² part: it comes from multiplying the two ${v} parts.`, `${v}² वाला भाग देखो: यह दोनों ${v} वाले भागों के गुणा से आता है।`)
            : w === 1 ? tt(`Check the ${v} part: add the two middle boxes. Watch the signs.`, `${v} वाला भाग देखो: बीच के दोनों डिब्बे जोड़ो। चिह्न ध्यान से देखो।`)
              : tt('Check the plain number: multiply the two plain numbers. Watch the sign.', 'सादी संख्या देखो: दोनों सादी संख्याएँ गुणा करो। चिह्न ध्यान से देखो।');
          say(msg, 'bad');
        }
      }
    });
    el.addEventListener('keydown', (e) => { const cell = e.target.closest && e.target.closest('[data-cell]'); if (cell && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); cell.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
    bindSteppers({
      c2: { min: -30, max: 30, get: () => ans[2], set: (n) => { ans[2] = n; } },
      c1: { min: -60, max: 60, get: () => ans[1], set: (n) => { ans[1] = n; } },
      c0: { min: -90, max: 90, get: () => ans[0], set: (n) => { ans[0] = n; } },
    }, () => { $('[data-yours]').textContent = tt('You wrote: ', 'तुमने लिखा: ') + pfmt(mine(), v, false); evalRow(); });
    const sl = $('[data-key="slider:x"]');
    sl.addEventListener('input', () => { if (!guard('slider:x')) { sl.value = fnum(xv); return; } xv = fr(+sl.value); evalRow(); });
    drawArea(); evalRow();
    say(tt('Tap each box to multiply, then add the like terms.', 'हर डिब्बा छूकर गुणा करो, फिर समान पद जोड़ो।'));
    void done;
    return { destroy() {} };
  }

  // ------------------------------------------------------------------ mode: factorise
  function mountFactorise(c) {
    const { api, cfg, tt, v, el, say, guard, stepper, bindSteppers } = c;
    const uid = 'alf' + ++UID;
    const target = parsePoly(cfg.equation, v);
    const [tc, tb, ta] = target.map((x) => x.n);
    const st = { p: 1, q: 1, r: 1, s: 1 };
    let xv = fr(0), hintOn = false;
    const fac = () => [ptrim([fr(st.q), fr(st.p)]), ptrim([fr(st.s), fr(st.r)])];
    const prodNow = () => pmul(fac()[0], fac()[1]);
    const bin = (p, q) => pfmt([fr(q), fr(p)], v, false);

    el.innerHTML = `<div class="alg-grid">
      <div class="alg-col">
        <div class="alg-card"><h3>${esc(tt('Factorise', 'गुणनखंड करो'))}</h3><div class="alg-eq" role="img" aria-label="${esc(pfmt(target, v, false))}">${pfmt(target, v, true)}</div>
          <svg class="alg-svg" viewBox="${AREA_VIEW}" data-area role="img" aria-label="${esc(tt('Area model of your two brackets', 'तुम्हारे दोनों कोष्ठकों का क्षेत्रफल मॉडल'))}"></svg>
          <div data-chips></div>
        </div>
      </div>
      <div class="alg-col">
        <div class="alg-card"><h3>${esc(tt('Choose the two brackets', 'दो कोष्ठक चुनो'))}</h3>
          <div class="alg-ans" data-key="answer" role="group" aria-label="${esc(tt('Your brackets', 'तुम्हारे कोष्ठक'))}">
            <div class="alg-br"><span>(</span>${stepper('p', 1, tt('Number of ' + v + ' in bracket 1', 'कोष्ठक 1 में ' + v + ' की संख्या'))}<span>${esc(v)} +</span>${stepper('q', 1, tt('Plain number in bracket 1', 'कोष्ठक 1 की सादी संख्या'))}<span>)</span></div>
            <div class="alg-br"><span>(</span>${stepper('r', 1, tt('Number of ' + v + ' in bracket 2', 'कोष्ठक 2 में ' + v + ' की संख्या'))}<span>${esc(v)} +</span>${stepper('s', 1, tt('Plain number in bracket 2', 'कोष्ठक 2 की सादी संख्या'))}<span>)</span></div>
          </div>
          <div class="alg-read" data-now></div>
          <div class="alg-row"><button type="button" class="alg-btn pri" data-act="check">${esc(tt('Check', 'जाँचो'))}</button><button type="button" class="alg-btn" data-act="hint" aria-expanded="false">${esc(tt('Hint', 'संकेत'))}</button></div>
          <div class="alg-hint" data-hint aria-live="polite"></div>
        </div>
        <div class="alg-card"><h3>${esc(tt('Test with a number', 'किसी संख्या से परखो'))}</h3>
          <label class="alg-row"><span class="alg-lab">${esc(v)} = <b data-tx>0</b></span><input type="range" data-key="slider:x" min="-10" max="10" step="1" value="0" aria-label="${esc(tt('Value of ' + v, v + ' का मान'))}"></label>
          <div class="alg-read" data-ev aria-live="polite"></div></div>
      </div></div>`;
    const $ = (s) => el.querySelector(s);
    function draw() {
      $('[data-area]').innerHTML = areaSVG(uid, v, [st.p, st.q], [st.r, st.s], () => true, false);
      const pr = prodNow();
      $('[data-now]').innerHTML = `(${esc(bin(st.p, st.q))})(${esc(bin(st.r, st.s))}) = <b>${pfmt(pr, v, true)}</b>`;
      const chip = (ok, txt) => `<span class="alg-chip ${ok ? 'good' : 'bad'}">${ok ? '✓' : '✗'} ${esc(txt)}</span>`;
      $('[data-chips]').innerHTML = chip(co(pr, 2).n === ta, `${v}²: ${co(pr, 2).n} ${tt('needs', 'चाहिए')} ${ta}`) + chip(co(pr, 1).n === tb, `${v}: ${co(pr, 1).n} ${tt('needs', 'चाहिए')} ${tb}`) + chip(co(pr, 0).n === tc, `${tt('number', 'संख्या')}: ${co(pr, 0).n} ${tt('needs', 'चाहिए')} ${tc}`);
      ev();
    }
    function ev() {
      $('[data-tx]').textContent = fstr(xv);
      const a = peval(target, xv), b = peval(prodNow(), xv);
      $('[data-ev]').innerHTML = `${esc(tt('Target at this value', 'इस मान पर लक्ष्य'))}: <b>${fstr(a)}</b><br>${esc(tt('Your brackets', 'तुम्हारे कोष्ठक'))}: <b>${fstr(b)}</b> ${feq(a, b) ? '<span class="alg-ok">✓</span>' : ''}`;
    }
    function hintHTML() {
      const ac = ta * tc, pairs = [];
      for (let m = -Math.abs(ac); m <= Math.abs(ac); m++) { if (m !== 0 && ac % m === 0) { const n = ac / m; if (m <= n) pairs.push([m, n]); } }
      const rows = pairs.map(([m, n]) => `<tr${m + n === tb ? ' class="sel"' : ''}><td>${m}</td><td>${n}</td><td>${m + n}</td></tr>`).join('');
      return `${esc(tt(`Find two numbers that multiply to ${ta} × ${tc} = ${ac} and add to ${tb}. Split the middle term with them, then group.`, `ऐसी दो संख्याएँ खोजो जिनका गुणनफल ${ta} × ${tc} = ${ac} और योग ${tb} हो। उनसे बीच का पद तोड़ो, फिर समूह बनाओ।`))}<div class="alg-tablewrap"><table class="alg-table"><tr><th>${esc(tt('number 1', 'संख्या 1'))}</th><th>${esc(tt('number 2', 'संख्या 2'))}</th><th>${esc(tt('sum', 'योग'))}</th></tr>${rows.replace(/<tr class="sel">/g, '<tr style="background:var(--good-t)">')}</table></div>`;
    }
    bindSteppers({
      p: { min: 1, max: 6, get: () => st.p, set: (n) => { st.p = n; } },
      q: { min: -12, max: 12, get: () => st.q, set: (n) => { st.q = n; } },
      r: { min: 1, max: 6, get: () => st.r, set: (n) => { st.r = n; } },
      s: { min: -12, max: 12, get: () => st.s, set: (n) => { st.s = n; } },
    }, draw);
    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'hint') { hintOn = !hintOn; act.setAttribute('aria-expanded', String(hintOn)); $('[data-hint]').innerHTML = hintOn ? hintHTML() : ''; return; }
      if (act.dataset.act === 'check') {
        if (!guard('answer')) return;
        if (peq(prodNow(), target)) {
          api.emit('factorised'); api.emit('answered:right'); api.record('factorised ' + pfmt(target, v, false)); api.celebrate();
          say(tt(`Yes! ${pfmt(target, v, false)} = (${bin(st.p, st.q)})(${bin(st.r, st.s)}). Expand it again to check.`, `हाँ! ${pfmt(target, v, false)} = (${bin(st.p, st.q)})(${bin(st.r, st.s)})। दोबारा गुणा करके जाँच लो।`), 'good');
        } else {
          api.emit('answered:wrong');
          const pr = prodNow();
          say(co(pr, 2).n !== ta ? tt(`The ${v}² part must be ${ta}: the two ${v} numbers multiply to ${ta}.`, `${v}² वाला भाग ${ta} होना चाहिए: दोनों ${v} वाली संख्याओं का गुणनफल ${ta} हो।`)
            : co(pr, 0).n !== tc ? tt(`The plain numbers must multiply to ${tc}.`, `सादी संख्याओं का गुणनफल ${tc} होना चाहिए।`)
              : tt(`The ${v} part is ${co(pr, 1).n} but it must be ${tb}. Try other number pairs.`, `${v} वाला भाग ${co(pr, 1).n} है पर ${tb} होना चाहिए। दूसरी जोड़ियाँ आज़माओ।`), 'bad');
        }
      }
    });
    const sl = $('[data-key="slider:x"]');
    sl.addEventListener('input', () => { if (!guard('slider:x')) { sl.value = fnum(xv); return; } xv = fr(+sl.value); ev(); });
    draw();
    say(tt('Change the numbers in the brackets until the chips turn green.', 'कोष्ठकों की संख्याएँ बदलो जब तक सब चिप्स हरे न हो जाएँ।'));
    return { destroy() {} };
  }

  // ------------------------------------------------------------------ mode: pattern
  function mountPattern(c) {
    const { api, cfg, tt, v, el, say, guard, bindSteppers } = c;
    const p = parsePoly(cfg.equation, v);
    const A = co(p, 1).n, B = co(p, 0).n;
    const N = 10 + ((A + B) % 5);
    let n = 3, shown = false;
    const term = (k) => A * k + B;
    el.innerHTML = `<div class="alg-grid">
      <div class="alg-col">
        <div class="alg-card"><h3 data-title></h3>
          <svg class="alg-svg" data-pic role="img"></svg>
          <label class="alg-row"><span class="alg-lab">${esc(tt('Term number', 'पद संख्या'))} = <b data-tn>3</b></span><input type="range" data-key="slider:x" min="1" max="10" step="1" value="3" aria-label="${esc(tt('Term number', 'पद संख्या'))}"></label>
          <div class="alg-read" data-desc aria-live="polite"></div>
        </div>
        <div class="alg-card"><h3>${esc(tt('Table of terms', 'पदों की तालिका'))}</h3><div class="alg-tablewrap" data-table></div></div>
      </div>
      <div class="alg-col">
        <div class="alg-card"><h3>${esc(tt(`How many dots will term ${N} have?`, `पद ${N} में कितने बिंदु होंगे?`))}</h3>
          <div class="alg-read">${esc(tt('You cannot draw it all. Find the pattern and work it out.', 'इसे पूरा बनाना मुश्किल है। पैटर्न ढूँढो और हल निकालो।'))}</div>
          <div class="alg-ans" data-key="answer" role="group" aria-label="${esc(tt('Answer', 'उत्तर'))}"><input type="text" inputmode="numeric" autocomplete="off" data-in aria-label="${esc(tt('Number of dots', 'बिंदुओं की संख्या'))}"><button type="button" class="alg-btn pri" data-act="check">${esc(tt('Check', 'जाँचो'))}</button></div>
          <div class="alg-row"><button type="button" class="alg-btn" data-act="rule" aria-expanded="false">${esc(tt('Show the rule', 'नियम दिखाओ'))}</button></div>
          <div class="alg-eq" data-rule hidden></div>
        </div></div></div>`;
    const $ = (s) => el.querySelector(s);
    function drawPic() {
      const cell = 24, h = Math.max(A, 1), cols = n, ex = B;
      const exCols = ex ? Math.ceil(ex / h) : 0;
      const W = (cols + (exCols ? exCols + 0.8 : 0)) * cell + 24, H = h * cell + 24;
      const svg = $('[data-pic]');
      svg.setAttribute('viewBox', `0 0 ${Math.max(W, 220)} ${Math.max(H, 90)}`);
      svg.setAttribute('aria-label', tt(`Term ${n}: ${term(n)} dots`, `पद ${n}: ${term(n)} बिंदु`));
      svg.style.maxWidth = Math.min(640, Math.max(W, 220) * 2.2) + 'px';
      let o = '';
      for (let i = 0; i < cols; i++) {
        o += `<rect x="${12 + i * cell + 1}" y="9" width="${cell - 2}" height="${h * cell + 6}" rx="9" fill="${i % 2 ? '#DDD6FE' : '#C7D2FE'}" opacity=".7"/>`;
        for (let j = 0; j < A; j++) o += `<circle class="alg-pop" cx="${12 + i * cell + cell / 2}" cy="${12 + j * cell + cell / 2 + 2}" r="${cell * 0.36}" fill="${i % 2 ? '#8B3DFF' : '#2563EB'}"/>`;
      }
      const x0 = 12 + cols * cell + cell * 0.8;
      for (let k = 0; k < ex; k++) o += `<circle class="alg-pop" cx="${x0 + Math.floor(k / h) * cell + cell / 2}" cy="${12 + (k % h) * cell + cell / 2 + 2}" r="${cell * 0.36}" fill="#FF7A1A"/>`;
      svg.innerHTML = o;
      $('[data-tn]').textContent = n;
      $('[data-title]').textContent = tt(`Term ${n} has ${term(n)} dots`, `पद ${n} में ${term(n)} बिंदु हैं`);
      $('[data-desc]').textContent = tt(`${n} group${n > 1 ? 's' : ''} of ${A} blue/purple dot${A > 1 ? 's' : ''}${B ? ` and ${B} orange extra dot${B > 1 ? 's' : ''}` : ''}.`, `${n} समूह, हर समूह में ${A} नीले/बैंगनी बिंदु${B ? ` और ${B} नारंगी अतिरिक्त बिंदु` : ''}।`);
    }
    function drawTable() {
      const ks = Array.from({ length: 10 }, (_, i) => i + 1);
      $('[data-table]').innerHTML = `<table class="alg-table"><tr><th>${esc(tt('Term', 'पद'))}</th>${ks.map((k) => `<td${k === n ? ' class="sel"' : ''}>${k}</td>`).join('')}</tr><tr><th>${esc(tt('Dots', 'बिंदु'))}</th>${ks.map((k) => `<td${k === n ? ' class="sel"' : ''}>${term(k)}</td>`).join('')}</tr></table><div class="alg-read">${esc(tt(`Each term is ${A} more than the one before.`, `हर पद पिछले से ${A} ज़्यादा है।`))}</div>`;
    }
    const sl = $('[data-key="slider:x"]');
    sl.addEventListener('input', () => { if (!guard('slider:x')) { sl.value = n; return; } n = +sl.value; drawPic(); drawTable(); });
    function check() {
      if (!guard('answer')) return;
      const g = parseNum($('[data-in]').value);
      if (!g) { say(tt('Type a whole number.', 'पूरी संख्या लिखो।'), 'bad'); return; }
      if (feq(g, fr(term(N)))) { api.emit('answered:right'); api.record('pattern term ' + N + ' = ' + term(N)); api.celebrate(); say(tt(`Yes! Term ${N} = ${A} × ${N} + ${B} = ${term(N)}.`, `हाँ! पद ${N} = ${A} × ${N} + ${B} = ${term(N)}।`), 'good'); showRule(); }
      else { api.emit('answered:wrong'); say(g.n === A * N ? tt(`You forgot the ${B} extra dots.`, `तुम ${B} अतिरिक्त बिंदु भूल गए।`) : tt(`Not yet. Look at the table: each term adds ${A}. Term 1 has ${term(1)}.`, `अभी नहीं। तालिका देखो: हर पद में ${A} बढ़ता है। पद 1 में ${term(1)} हैं।`), 'bad'); }
    }
    function showRule() {
      shown = true; const r = $('[data-rule]'); r.hidden = false;
      r.innerHTML = `${esc(tt('Term', 'पद'))} ${esc(v)} = ${pfmt(p, v, true)}`;
      $('[data-act="rule"]').setAttribute('aria-expanded', 'true');
    }
    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'check') check();
      else if (act.dataset.act === 'rule') { if (shown) { shown = false; $('[data-rule]').hidden = true; act.setAttribute('aria-expanded', 'false'); } else showRule(); }
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-in]')) check(); });
    void bindSteppers;
    drawPic(); drawTable();
    say(tt('Move the slider and watch how the dots grow.', 'स्लाइडर चलाओ और देखो बिंदु कैसे बढ़ते हैं।'));
    return { destroy() {} };
  }

  // ------------------------------------------------------------------ mode: solve-pair
  function mountPair(c) {
    const { api, cfg, tt, el, say, guard, stepper, bindSteppers } = c;
    const uid = 'alp' + ++UID;
    const q = parsePair(cfg.equation);
    const [E1, E2] = q.e;
    const xs = q.x.n, ys = q.y.n;
    const R = Math.max(6, Math.min(12, 2 * Math.ceil((Math.max(Math.abs(xs), Math.abs(ys)) + 3) / 2)));
    let xp = -R, guess = { x: 0, y: 0 }, steps = false, found = false;
    const lin2 = (e) => {
      const t = [];
      if (e.a) t.push({ s: e.a, b: 'x' }); if (e.b) t.push({ s: e.b, b: 'y' });
      const body = t.map((z, i) => { const m = Math.abs(z.s) === 1 ? '' : Math.abs(z.s); return (i === 0 ? (z.s < 0 ? '−' : '') : z.s < 0 ? ' − ' : ' + ') + m + z.b; }).join('');
      return `${body} = ${String(e.c).replace('-', '−')}`;
    };
    const yAt = (e, x) => (e.b === 0 ? null : fr(e.c - e.a * x, e.b));
    const S = 360, PAD = 24, IN = S - 2 * PAD;
    const X = (x) => PAD + ((x + R) / (2 * R)) * IN, Y = (y) => PAD + ((R - y) / (2 * R)) * IN;
    el.innerHTML = `<div class="alg-grid">
      <div class="alg-col">
        <div class="alg-card"><h3>${esc(tt('Two equations, one crossing point', 'दो समीकरण, एक कटान बिंदु'))}</h3>
          <div class="alg-eq" style="flex-direction:column;gap:2px"><span style="color:#1D4ED8" aria-label="${esc(tt('Equation 1', 'समीकरण 1'))}: ${esc(lin2(E1))}">${esc(lin2(E1))}</span><span style="color:#E0620A" aria-label="${esc(tt('Equation 2', 'समीकरण 2'))}: ${esc(lin2(E2))}">${esc(lin2(E2))}</span></div>
          <svg class="alg-svg" viewBox="0 0 ${S} ${S}" data-graph role="img" aria-label="${esc(tt('Graph of the two lines', 'दोनों रेखाओं का ग्राफ़'))}" style="max-width:480px"></svg>
        </div></div>
      <div class="alg-col">
        <div class="alg-card"><h3>${esc(tt('Slide along x', 'x के साथ खिसकाओ'))}</h3>
          <label class="alg-row"><span class="alg-lab">x = <b data-tx></b></span><input type="range" data-key="slider:x" min="${-R}" max="${R}" step="1" value="${-R}" aria-label="${esc(tt('Value of x', 'x का मान'))}"></label>
          <div class="alg-read" data-probe aria-live="polite"></div></div>
        <div class="alg-card"><h3>${esc(tt('Your answer', 'तुम्हारा उत्तर'))}</h3>
          <div class="alg-ans" data-key="answer" role="group" aria-label="${esc(tt('Answer', 'उत्तर'))}"><span>x =</span>${stepper('gx', 0, tt('Value of x', 'x का मान'))}<span>y =</span>${stepper('gy', 0, tt('Value of y', 'y का मान'))}<button type="button" class="alg-btn pri" data-act="check">${esc(tt('Check', 'जाँचो'))}</button></div>
          <div class="alg-row"><button type="button" class="alg-btn" data-act="steps" aria-expanded="false">${esc(tt('Show the steps', 'चरण दिखाओ'))}</button></div>
          <div class="alg-hint" data-steps aria-live="polite"></div></div>
      </div></div>`;
    const $ = (s) => el.querySelector(s);
    function lineSVG(e, col) {
      if (e.b === 0) { const x = e.c / e.a; return `<line x1="${X(x)}" y1="${Y(-R)}" x2="${X(x)}" y2="${Y(R)}" stroke="${col}" stroke-width="4" stroke-linecap="round"/>`; }
      const y0 = (e.c - e.a * -R) / e.b, y1 = (e.c - e.a * R) / e.b;
      return `<line x1="${X(-R)}" y1="${Y(y0)}" x2="${X(R)}" y2="${Y(y1)}" stroke="${col}" stroke-width="4" stroke-linecap="round" clip-path="url(#${uid}c)"/>`;
    }
    function draw() {
      let o = `<defs><clipPath id="${uid}c"><rect x="${PAD}" y="${PAD}" width="${IN}" height="${IN}"/></clipPath></defs><rect x="${PAD}" y="${PAD}" width="${IN}" height="${IN}" fill="var(--sunk)" stroke="var(--line)" stroke-width="2" rx="6"/>`;
      const stepG = R > 8 ? 2 : 1;
      for (let k = -R; k <= R; k += stepG) {
        o += `<line x1="${X(k)}" y1="${PAD}" x2="${X(k)}" y2="${PAD + IN}" stroke="var(--line)" stroke-width="${k === 0 ? 0 : 1}"/><line x1="${PAD}" y1="${Y(k)}" x2="${PAD + IN}" y2="${Y(k)}" stroke="var(--line)" stroke-width="${k === 0 ? 0 : 1}"/>`;
        if (k !== 0 && k % 2 === 0) o += `<text x="${X(k)}" y="${Y(0) + 14}" text-anchor="middle" font-size="10" fill="var(--ink-2)">${k}</text><text x="${X(0) - 5}" y="${Y(k) + 4}" text-anchor="end" font-size="10" fill="var(--ink-2)">${k}</text>`;
      }
      o += `<line x1="${PAD}" y1="${Y(0)}" x2="${PAD + IN}" y2="${Y(0)}" stroke="var(--ink-2)" stroke-width="2"/><line x1="${X(0)}" y1="${PAD}" x2="${X(0)}" y2="${PAD + IN}" stroke="var(--ink-2)" stroke-width="2"/>`;
      o += `<text x="${PAD + IN - 4}" y="${Y(0) - 6}" text-anchor="end" font-size="13" font-weight="800" fill="var(--ink)">x</text><text x="${X(0) + 6}" y="${PAD + 12}" font-size="13" font-weight="800" fill="var(--ink)">y</text>`;
      o += lineSVG(E1, '#1D4ED8') + lineSVG(E2, '#FF7A1A');
      // probe
      o += `<line x1="${X(xp)}" y1="${PAD}" x2="${X(xp)}" y2="${PAD + IN}" stroke="#8B3DFF" stroke-width="2.5" stroke-dasharray="6 5"/>`;
      [[E1, '#1D4ED8'], [E2, '#FF7A1A']].forEach(([e, col]) => {
        const y = yAt(e, xp);
        if (y && Math.abs(fnum(y)) <= R) o += `<circle cx="${X(xp)}" cy="${Y(fnum(y))}" r="6" fill="${col}" stroke="#fff" stroke-width="2"/>`;
      });
      if (xp === xs) o += `<circle class="alg-mark" cx="${X(xs)}" cy="${Y(ys)}" r="15" fill="none" stroke="#22C55E" stroke-width="4"/><circle cx="${X(xs)}" cy="${Y(ys)}" r="7" fill="#22C55E" stroke="#fff" stroke-width="2"/><text class="alg-svgtxt" x="${X(xs) + (xs > R / 2 ? -14 : 14)}" y="${Y(ys) - 14}" text-anchor="${xs > R / 2 ? 'end' : 'start'}" font-size="14" fill="var(--ink)">(${xs}, ${ys})</text>`.replace(/-(\d)/g, '−$1');
      $('[data-graph]').innerHTML = o;
    }
    function probe() {
      $('[data-tx]').textContent = String(xp).replace('-', '−');
      const t = (e, n) => { const y = yAt(e, xp); return y ? `${tt('Equation', 'समीकरण')} ${n}: y = <b>${fstr(y)}</b>` : (e.c / e.a === xp ? `${tt('Equation', 'समीकरण')} ${n}: ${tt('every y works here', 'यहाँ हर y चलता है')}` : `${tt('Equation', 'समीकरण')} ${n}: ${tt('this line is not at this x', 'रेखा इस x पर नहीं है')}`); };
      $('[data-probe]').innerHTML = `${t(E1, 1)}<br>${t(E2, 2)}${xp === xs ? `<br><span class="alg-ok">✓ ${esc(tt(`Both lines meet here: x = ${xs}, y = ${ys}`, `दोनों रेखाएँ यहाँ मिलती हैं: x = ${xs}, y = ${ys}`).replace(/-(\d)/g, '−$1'))}</span>` : ''}`;
    }
    function stepsHTML() {
      const L2 = [];
      const sgn = (n) => String(n).replace('-', '−');
      const pr = (n) => (n < 0 ? '(' + sgn(n) + ')' : String(n));
      if (E1.b === 0 || E2.b === 0) {
        const e = E1.b === 0 ? E1 : E2, i = E1.b === 0 ? 1 : 2;
        L2.push(tt(`Equation ${i} has no y, so ${lin2(e)} gives x = ${sgn(xs)}.`, `समीकरण ${i} में y नहीं है, इसलिए ${lin2(e)} से x = ${sgn(xs)}।`));
      } else {
        const d = E1.a * E2.b - E2.a * E1.b, n = E1.c * E2.b - E2.c * E1.b;
        L2.push(tt(`Make the y parts match: multiply equation 1 by ${sgn(E2.b)} and equation 2 by ${sgn(E1.b)}, then subtract.`, `y वाले भाग बराबर करो: समीकरण 1 को ${sgn(E2.b)} से और समीकरण 2 को ${sgn(E1.b)} से गुणा करो, फिर घटाओ।`));
        L2.push(`(${pr(E1.a)}·${pr(E2.b)} − ${pr(E2.a)}·${pr(E1.b)}) x = ${pr(E1.c)}·${pr(E2.b)} − ${pr(E2.c)}·${pr(E1.b)} → ${sgn(d)}x = ${sgn(n)} → x = ${sgn(xs)}`);
      }
      const e = E1.b !== 0 ? E1 : E2, i = E1.b !== 0 ? 1 : 2;
      L2.push(tt(`Put x = ${sgn(xs)} in equation ${i}: ${lin2(e)} gives y = ${sgn(ys)}.`, `समीकरण ${i} में x = ${sgn(xs)} रखो: ${lin2(e)} से y = ${sgn(ys)}।`));
      L2.push(tt('Check in the other equation too.', 'दूसरे समीकरण में भी जाँच लो।'));
      return L2.map((s) => `<div>${esc(s)}</div>`).join('');
    }
    bindSteppers({
      gx: { min: -20, max: 20, get: () => guess.x, set: (n) => { guess.x = n; } },
      gy: { min: -20, max: 20, get: () => guess.y, set: (n) => { guess.y = n; } },
    });
    const sl = $('[data-key="slider:x"]');
    sl.addEventListener('input', () => {
      if (!guard('slider:x')) { sl.value = xp; return; }
      xp = +sl.value; draw(); probe();
      if (xp === xs && !found) { found = true; api.emit('solved:' + xs + ',' + ys); api.record(`found the crossing (${xs}, ${ys})`); api.celebrate(); say(tt('The lines cross here. This (x, y) fits both equations.', 'रेखाएँ यहाँ कटती हैं। यह (x, y) दोनों समीकरणों में सही बैठता है।'), 'good'); }
    });
    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'steps') { steps = !steps; act.setAttribute('aria-expanded', String(steps)); $('[data-steps]').innerHTML = steps ? stepsHTML() : ''; }
      else if (act.dataset.act === 'check') {
        if (!guard('answer')) return;
        if (guess.x === xs && guess.y === ys) { api.emit('answered:right'); if (!found) { found = true; api.emit('solved:' + xs + ',' + ys); } api.celebrate(); say(tt(`Yes! x = ${xs}, y = ${ys} fits both equations.`, `हाँ! x = ${xs}, y = ${ys} दोनों समीकरणों में सही बैठता है।`).replace(/-(\d)/g, '−$1'), 'good'); xp = xs; sl.value = xs; draw(); probe(); }
        else {
          api.emit('answered:wrong');
          const f1 = E1.a * guess.x + E1.b * guess.y === E1.c, f2 = E2.a * guess.x + E2.b * guess.y === E2.c;
          say(f1 && !f2 ? tt('It fits equation 1 but not equation 2. A solution must fit both.', 'यह समीकरण 1 में बैठता है पर 2 में नहीं। हल दोनों में बैठना चाहिए।') : f2 && !f1 ? tt('It fits equation 2 but not equation 1. A solution must fit both.', 'यह समीकरण 2 में बैठता है पर 1 में नहीं। हल दोनों में बैठना चाहिए।') : tt('It fits neither equation. Slide along x to find where the lines meet.', 'यह किसी समीकरण में नहीं बैठता। x के साथ खिसकाकर देखो रेखाएँ कहाँ मिलती हैं।'), 'bad');
        }
      }
    });
    draw(); probe();
    say(tt('Slide x until the two dots meet on the same point.', 'x खिसकाओ जब तक दोनों बिंदु एक ही जगह न मिल जाएँ।'));
    return { destroy() {} };
  }

  // ------------------------------------------------------------------ mount
  function mount(root, cfg, api) {
    root.innerHTML = '<div class="alg"><div class="alg-inner"></div><div class="alg-live" aria-live="polite"></div></div>';
    const shell = root.querySelector('.alg');
    const c = makeCtx(shell, shell.querySelector('.alg-inner'), cfg, api);
    const fn = { balance: mountBalance, tiles: mountTiles, expand: mountExpand, factorise: mountFactorise, pattern: mountPattern, 'solve-pair': mountPair }[cfg.mode];
    const inst = fn(c);
    return { destroy() { if (inst && inst.destroy) inst.destroy(); root.innerHTML = ''; } };
  }

  NCA_T.register({
    id: 'algebra',
    css: CSS,
    validate,
    keys,
    demo: { mode: 'balance', equation: '3x+4=x+12', unknown: 'x' },
    mount,
  });
})();
