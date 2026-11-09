// Template: Number line. Hop, place, compare, zoom and construct numbers on a line: counting, adding and subtracting,
// integers, fractions and decimals, decimal zoom (terminating, repeating, never-ending) and square roots built with
// compass-and-ruler (the square-root spiral and the semicircle method). All arithmetic is exact (fractions with whole
// numbers, square roots as a + b*sqrt(r), decimal digits by whole-number maths), so no floating-point drift is ever
// shown. Config:
//   { mode: 'count'|'add'|'subtract'|'place'|'compare'|'zoom'|'integers'|'irrational',
//     min, max,            the visible range (numbers, or text like '1/2')
//     step?,               the grid: ticks and snapping (default: the finest grid the numbers in the lab need)
//     start?,              where the marker begins
//     jumps?: [sizes],     hop sizes the child can pick (up to 6)
//     ask?: number | text  a target ('12', '3/4', '-3+5', 'sqrt(2)', 'sqrt(9.3)')
//     format?: 'fraction'|'decimal',  method?: 'spiral'|'semicircle' (irrational) }
(function () {
  const L = window.NCA_LIB;
  const { esc, tween } = L;
  const T2 = (en, hi) => ({ en, hi });
  const MINUS = '−';
  const INK = '#1E293B';
  let UID = 0;

  // ---------------------------------------------------------------- exact rationals
  const SAFE = Math.pow(2, 50);
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; };
  function R(n, d) {
    if (d === undefined) d = 1;
    if (d === 0) throw new Error('division by zero');
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d) || 1;
    n /= g; d /= g;
    if (Math.abs(n) > SAFE || d > SAFE) throw new Error('number too large');
    return { n, d };
  }
  const ZERO = R(0), ONE = R(1);
  const rAdd = (a, b) => R(a.n * b.d + b.n * a.d, a.d * b.d);
  const rSub = (a, b) => R(a.n * b.d - b.n * a.d, a.d * b.d);
  const rMul = (a, b) => R(a.n * b.n, a.d * b.d);
  const rDiv = (a, b) => R(a.n * b.d, a.d * b.n);
  const rNeg = (a) => R(-a.n, a.d);
  const rCmp = (a, b) => Math.sign(a.n * b.d - b.n * a.d);
  const rEq = (a, b) => a.n === b.n && a.d === b.d;
  const rNum = (a) => a.n / a.d;
  const rAbs = (a) => R(Math.abs(a.n), a.d);
  const isZero = (a) => a.n === 0;
  const lcm = (a, b) => (a / gcd(a, b)) * b;
  // a number (float) to an exact rational: a decimal of up to 6 places, or a fraction with a small denominator
  function toRat(x) {
    if (!isFinite(x)) return null;
    if (Number.isInteger(x)) return R(x);
    for (let k = 1; k <= 6; k++) { const m = x * Math.pow(10, k); if (Math.abs(m - Math.round(m)) < 1e-7) return R(Math.round(m), Math.pow(10, k)); }
    for (let d = 2; d <= 120; d++) { const n = Math.round(x * d); if (Math.abs(n / d - x) < 1e-9) return R(n, d); }
    return null;
  }
  const termDec = (d) => { let x = d; while (x % 2 === 0) x /= 2; while (x % 5 === 0) x /= 5; return x === 1; };
  function decStr(r) {
    if (r.d === 1) return String(r.n);
    let k = 0, p = 1;
    while (p % r.d !== 0) { p *= 10; k++; if (k > 12) return null; }
    const s = String(Math.abs(r.n) * (p / r.d)).padStart(k + 1, '0');
    return (r.n < 0 ? '-' : '') + s.slice(0, s.length - k) + '.' + s.slice(s.length - k);
  }
  // long division: the digits before the repeating block and the block itself
  function decType(r) {
    if (r.d === 1) return { kind: 'int' };
    if (termDec(r.d)) return { kind: 'term', places: (decStr(r).split('.')[1] || '').length };
    let rem = Math.abs(r.n) % r.d;
    const seen = {};
    let digits = '';
    while (rem && seen[rem] === undefined && digits.length < 80) { seen[rem] = digits.length; rem *= 10; digits += Math.floor(rem / r.d); rem %= r.d; }
    const at = seen[rem];
    return { kind: 'rep', pre: digits.slice(0, at), rep: digits.slice(at), whole: Math.floor(Math.abs(r.n) / r.d), neg: r.n < 0 };
  }

  // ---------------------------------------------------------------- numbers of the form a + b*sqrt(r)
  const nR = (r) => ({ a: r, b: ZERO, r: ZERO });
  const nNorm = (x) => (isZero(x.b) ? nR(x.a) : x);
  const nIsRat = (x) => isZero(x.b);
  function nAdd(x, y) {
    if (!isZero(x.b) && !isZero(y.b) && !rEq(x.r, y.r)) throw new Error('different square roots cannot be added here');
    return nNorm({ a: rAdd(x.a, y.a), b: rAdd(x.b, y.b), r: !isZero(x.b) ? x.r : y.r });
  }
  const nNeg = (x) => ({ a: rNeg(x.a), b: rNeg(x.b), r: x.r });
  const nSub = (x, y) => nAdd(x, nNeg(y));
  function nMul(x, y) {
    if (!isZero(x.b) && !isZero(y.b)) {
      if (!rEq(x.r, y.r)) throw new Error('two different square roots cannot be multiplied here');
      return nNorm({ a: rAdd(rMul(x.a, y.a), rMul(rMul(x.b, y.b), x.r)), b: rAdd(rMul(x.a, y.b), rMul(y.a, x.b)), r: x.r });
    }
    return nNorm({ a: rMul(x.a, y.a), b: rAdd(rMul(x.b, y.a), rMul(x.a, y.b)), r: !isZero(x.b) ? x.r : y.r });
  }
  function nDiv(x, y) {
    if (!isZero(y.b)) throw new Error('cannot divide by a square root here');
    if (isZero(y.a)) throw new Error('division by zero');
    return nMul(x, nR(rDiv(ONE, y.a)));
  }
  function nSqrt(x) {
    if (!isZero(x.b)) throw new Error('square root of a square root is not supported');
    if (x.a.n < 0) throw new Error('square root of a negative number');
    let nd = x.a.n * x.a.d, s = 1;
    for (let i = 2; i * i <= nd; i++) { const q = i * i; while (nd % q === 0) { nd /= q; s *= i; } }
    if (nd === 1) return nR(R(s, x.a.d));
    return { a: ZERO, b: R(s, x.a.d), r: R(nd) };
  }
  const nF = (x) => rNum(x.a) + (isZero(x.b) ? 0 : rNum(x.b) * Math.sqrt(rNum(x.r)));
  const nSign = (x) => (isZero(x.b) ? Math.sign(x.a.n) : Math.sign(nF(x)));
  const nCmp = (x, y) => nSign(nSub(x, y));

  // ---------------------------------------------------------------- expression parser: numbers, fractions, + - * / ( ) sqrt
  function parseExpr(src) {
    let s = String(src).trim();
    if (!s) throw new Error('empty text');
    s = s.replace(/−|–/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/√/g, 'sqrt');
    const toks = [];
    const re = /\s*(?:(\d+\.?\d*|\.\d+)|(sqrt)|([-+*/(),]))/y;
    let pos = 0;
    while (pos < s.length) {
      re.lastIndex = pos;
      const m = re.exec(s);
      if (!m) throw new Error('cannot read "' + s.slice(pos).trim().slice(0, 12) + '"');
      if (m[1] !== undefined) {
        const parts = m[1].split('.');
        const fr = parts[1] || '';
        toks.push({ num: R(parseInt(parts[0] || '0', 10) * Math.pow(10, fr.length) + (fr ? parseInt(fr, 10) : 0), Math.pow(10, fr.length)) });
      } else toks.push(m[2] || m[3]);
      pos = re.lastIndex;
    }
    let i = 0;
    const peek = () => toks[i];
    const take = () => toks[i++];
    function atom() {
      const t = take();
      if (t === undefined) throw new Error('the text ends too early');
      if (typeof t === 'object') return nR(t.num);
      if (t === '(') { const v = expr().v; if (take() !== ')') throw new Error('missing )'); return v; }
      if (t === 'sqrt') return nSqrt(peek() === '(' ? atom() : atom());
      throw new Error('unexpected ' + t);
    }
    function unary() { if (peek() === '-') { take(); return nNeg(unary()); } if (peek() === '+') { take(); return unary(); } return atom(); }
    function term() { let a = unary(); while (peek() === '*' || peek() === '/') { const op = take(); const b = unary(); a = op === '*' ? nMul(a, b) : nDiv(a, b); } return a; }
    function expr() {
      let acc = term();
      const tl = [acc];
      while (peek() === '+' || peek() === '-') { const op = take(); const t = term(); acc = op === '+' ? nAdd(acc, t) : nSub(acc, t); tl.push(op === '+' ? t : nNeg(t)); }
      return { v: acc, tl };
    }
    const out = expr();
    if (i < toks.length) throw new Error('unexpected ' + (typeof toks[i] === 'object' ? 'number' : toks[i]));
    return { val: out.v, terms: out.tl.every((x) => nIsRat(x)) ? out.tl.map((x) => x.a) : null, plain: /^\s*[-+−]?\s*(\d+\.?\d*|\.\d+)(\s*\/\s*(\d+\.?\d*|\.\d+))?\s*$/.test(String(src)), text: String(src) };
  }
  // a config value (number or text) -> { val, terms, plain, text }
  function parseAny(v) {
    if (typeof v === 'number') {
      const r = toRat(v);
      if (!r) throw new Error(v + ' cannot be shown exactly; write it as text like "1/3"');
      return { val: nR(r), terms: [r], plain: true, text: String(v) };
    }
    if (typeof v === 'string') return parseExpr(v);
    throw new Error('must be a number or text');
  }

  // ---------------------------------------------------------------- exact decimal digits (whole-number maths)
  const BI = (x) => BigInt(x);
  function isqrtB(n) {
    if (n < 2n) return n;
    let x = BI(Math.floor(Math.sqrt(Number(n))));
    if (x < 1n) x = 1n;
    for (let k = 0; k < 8; k++) x = (x + n / x) >> 1n;
    while (x * x > n) x -= 1n;
    while ((x + 1n) * (x + 1n) <= n) x += 1n;
    return x;
  }
  const floorDivB = (a, b) => { let q = a / b; if (a % b !== 0n && a < 0n) q -= 1n; return q; };
  // floor(x * 10^Lv) as a BigInt
  function floorScaled(x, Lv) {
    const E = 12, S = 10n ** BI(Lv + E);
    let t = floorDivB(BI(x.a.n) * S, BI(x.a.d));
    if (!isZero(x.b)) {
      const bn = BI(Math.abs(x.b.n)), bd = BI(x.b.d), r = BI(x.r.n);
      const q = isqrtB((bn * bn * r * S * S) / (bd * bd));
      t += x.b.n < 0 ? -q : q;
    }
    return floorDivB(t, 10n ** BI(E));
  }
  function scaledStr(m, Lv) {
    const neg = m < 0n;
    let s = (neg ? -m : m).toString().padStart(Lv + 1, '0');
    if (Lv > 0) s = s.slice(0, s.length - Lv) + '.' + s.slice(s.length - Lv);
    return (neg ? MINUS : '') + s;
  }

  // ---------------------------------------------------------------- showing numbers
  const sgn = (s) => s.replace(/-/g, MINUS);
  // plain text of a rational: whole, a decimal, or n/d
  function txt(r, frac) {
    if (r.d === 1) return sgn(String(r.n));
    if (!frac && termDec(r.d)) return sgn(decStr(r));
    return sgn(r.n + '/' + r.d);
  }
  // HTML with a stacked fraction
  function htm(r, frac) {
    if (r.d === 1 || (!frac && termDec(r.d))) return esc(txt(r, frac));
    return (r.n < 0 ? MINUS : '') + `<span class="nl-fr"><i>${Math.abs(r.n)}</i><b>${r.d}</b></span>`;
  }
  // a number with a square root: text only
  function txtN(x, frac) {
    if (nIsRat(x)) return txt(x.a, frac);
    const root = '√' + x.r.n;
    const bn = Math.abs(x.b.n);
    const coef = x.b.d === 1 ? (bn === 1 ? '' : String(bn)) : null;
    let bpart = coef !== null ? coef + root : (bn === 1 ? '' : bn) + root + '/' + x.b.d;
    if (isZero(x.a)) return (x.b.n < 0 ? MINUS : '') + bpart;
    return txt(x.a, frac) + (x.b.n < 0 ? ' ' + MINUS + ' ' : ' + ') + bpart;
  }
  const htmN = (x, frac) => (nIsRat(x) ? htm(x.a, frac) : esc(txtN(x, frac)));
  // the word used in event names: 5, -3, 0.5 or 1/2
  const evName = (r, frac) => (r.d === 1 ? String(r.n) : frac || !termDec(r.d) ? r.n + '/' + r.d : decStr(r));
  // an SVG label (stacked when a fraction)
  function labSVG(x, y, r, frac, cls, fs) {
    fs = fs || 15;
    if (r.d === 1 || (!frac && termDec(r.d))) return `<text x="${x}" y="${y}" text-anchor="middle" class="${cls}" style="font-size:${fs}px">${esc(txt(r, frac))}</text>`;
    const a = String(Math.abs(r.n)), b = String(r.d);
    const w = Math.max(a.length, b.length) * fs * 0.56 + 6;
    return `<g class="${cls}" style="font-size:${fs}px">${r.n < 0 ? `<text x="${x - w / 2 - 3}" y="${y - fs * 0.35}" text-anchor="end">${MINUS}</text>` : ''}
      <text x="${x}" y="${y - 2}" text-anchor="middle">${a}</text><line x1="${x - w / 2}" x2="${x + w / 2}" y1="${y + 1.5}" y2="${y + 1.5}" stroke="currentColor" stroke-width="1.6"/>
      <text x="${x}" y="${y + fs * 0.9}" text-anchor="middle">${b}</text></g>`;
  }
  // an expression typed by an author -> readable HTML
  function prettyExpr(s) {
    let h = esc(String(s).replace(/\s+/g, ' ').trim());
    h = h.replace(/sqrt\s*\(([^()]*)\)/g, '√$1').replace(/sqrt\s*([0-9.]+)/g, '√$1');
    h = h.replace(/(\d+)\s*\/\s*(\d+)/g, '<span class="nl-fr"><i>$1</i><b>$2</b></span>');
    h = h.replace(/\*/g, '×').replace(/-/g, MINUS).replace(/\+/g, ' + ').replace(new RegExp(MINUS, 'g'), ' ' + MINUS + ' ');
    return h.replace(/^\s*−\s/, MINUS).replace(/\(\s*−\s/g, '(' + MINUS).trim();
  }

  // ---------------------------------------------------------------- config
  const MODES = ['count', 'add', 'subtract', 'place', 'compare', 'zoom', 'integers', 'irrational'];
  const KEYSOK = ['mode', 'min', 'max', 'step', 'start', 'jumps', 'ask', 'format', 'method'];
  const onGrid = (r, step) => rDiv(r, step).d === 1;
  const nonSquare = (k) => { const q = Math.round(Math.sqrt(k)); return q * q !== k; };

  function norm(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return { e: ['config must be an object'] };
    Object.keys(c).forEach((k) => { if (!KEYSOK.includes(k)) e.push('unknown key: ' + k); });
    const mode = c.mode;
    if (!MODES.includes(mode)) { e.push('mode must be one of: ' + MODES.join(', ')); return { e }; }
    const P = { mode, e };
    const get = (key, v) => { try { return parseAny(v); } catch (err) { e.push(`${key}: ${err.message}`); return null; } };
    const rat = (key, v) => { const p = get(key, v); if (!p) return null; if (!nIsRat(p.val)) { e.push(`${key} must be a rational number (a whole number, decimal or fraction)`); return null; } return p.val.a; };
    P.lo = c.min === undefined ? (e.push('min is required'), null) : rat('min', c.min);
    P.hi = c.max === undefined ? (e.push('max is required'), null) : rat('max', c.max);
    if (P.lo && P.hi) {
      if (rCmp(P.lo, P.hi) >= 0) e.push('min must be less than max');
      if (Math.abs(rNum(P.lo)) > 10000 || Math.abs(rNum(P.hi)) > 10000) e.push('min and max must be within 10000');
    }
    if (c.format !== undefined && !['fraction', 'decimal'].includes(c.format)) e.push("format: 'fraction' or 'decimal'");
    if (c.method !== undefined && mode !== 'irrational') e.push('method is only for irrational mode');
    if (c.method !== undefined && !['spiral', 'semicircle'].includes(c.method)) e.push("method: 'spiral' or 'semicircle'");
    const strs = [];
    // ---- ask
    let askP = null;
    if (c.ask !== undefined) { askP = get('ask', c.ask); if (askP && typeof c.ask === 'string') strs.push(c.ask); }
    P.askP = askP;
    P.ask = askP ? askP.val : null;

    if (e.length && (!P.lo || !P.hi)) return { e };
    const span = rNum(rSub(P.hi, P.lo));

    // ---- zoom
    if (mode === 'zoom') {
      ['step', 'start', 'jumps', 'method'].forEach((k) => { if (c[k] !== undefined) e.push(`${k} is not used in zoom mode`); });
      if (P.lo.d !== 1 || P.hi.d !== 1) e.push('zoom: min and max must be whole numbers');
      else if (span > 20) e.push('zoom: the range may be at most 20 units wide');
      if (!P.ask && P.lo.d === 1 && P.hi.d === 1) P.ask = nR(rAdd(P.lo, R(Math.round(span * 347), 1000)));
      if (!P.ask) { /* range already reported */ }
      else {
        const v = nF(P.ask);
        if (v < rNum(P.lo) || v > rNum(P.hi)) e.push('zoom: ask must lie between min and max');
        if (Math.abs(v) > 1000) e.push('zoom: ask must be within 1000');
      }
      P.frac = false;
      return e.length ? { e } : { e, P };
    }
    // ---- irrational
    if (mode === 'irrational') {
      ['step', 'start', 'jumps'].forEach((k) => { if (c[k] !== undefined) e.push(`${k} is not used in irrational mode`); });
      const m = typeof c.ask === 'string' ? c.ask.match(/^\s*(?:sqrt|√)\s*\(?\s*([0-9./\s]+?)\s*\)?\s*$/) : null;
      if (!m) e.push("irrational: ask must look like 'sqrt(2)' or 'sqrt(9.3)'");
      else {
        let rad = null;
        try { const p = parseExpr(m[1]); if (nIsRat(p.val)) rad = p.val.a; } catch (err) { /* reported below */ }
        if (!rad || rad.n <= 0) e.push('irrational: the number under the root must be positive');
        else if (rad.d === 1 && !nonSquare(rad.n)) e.push(`irrational: sqrt(${rad.n}) is a whole number, not an irrational number`);
        else if (rad.d !== 1 && !termDec(rad.d)) e.push('irrational: write the number under the root as a whole number or a decimal');
        else {
          const x = rNum(rad);
          if (x > 30) e.push('irrational: the number under the root may be at most 30');
          let method = c.method || (rad.d === 1 && rad.n <= 17 ? 'spiral' : 'semicircle');
          if (method === 'spiral' && !(rad.d === 1 && rad.n >= 2 && rad.n <= 17)) e.push('irrational: the spiral method needs a whole number from 2 to 17 under the root');
          P.rad = rad; P.method = method;
          if (rCmp(P.lo, ZERO) > 0) e.push('irrational: min must be 0 or less so the line shows 0');
          const need = method === 'spiral' ? Math.ceil(Math.sqrt(x)) : x + 1;
          if (rNum(P.hi) < need) e.push(`irrational: max must be at least ${Math.ceil(need)}`);
          P.ask = nSqrt(nR(rad));
        }
      }
      P.frac = false;
      return e.length ? { e } : { e, P };
    }
    // ---- the line modes
    if (c.method !== undefined) { /* reported above */ }
    let startR = null;
    if (c.start !== undefined) startR = rat('start', c.start);
    let sizesIn = null;
    if (c.jumps !== undefined) {
      if (!Array.isArray(c.jumps) || c.jumps.length < 1 || c.jumps.length > 6) e.push('jumps: 1 to 6 hop sizes');
      else {
        sizesIn = c.jumps.map((j, i) => { const r = rat('jumps[' + i + ']', j); if (r && r.n <= 0) { e.push('jumps: each size must be more than 0'); return null; } if (typeof j === 'string') strs.push(j); return r; });
        if (sizesIn.some((x) => !x)) sizesIn = null;
        else if (new Set(sizesIn.map((x) => x.n + '/' + x.d)).size !== sizesIn.length) e.push('jumps: each size once');
      }
      if (mode === 'place' || mode === 'compare') e.push(`jumps are not used in ${mode} mode`);
    }
    let stepR = null;
    if (c.step !== undefined) { stepR = rat('step', c.step); if (stepR && stepR.n <= 0) { e.push('step must be more than 0'); stepR = null; } if (typeof c.step === 'string') strs.push(c.step); }
    if (typeof c.start === 'string') strs.push(c.start);
    const askRat = P.ask && nIsRat(P.ask) ? P.ask.a : null;
    const irrAsk = P.ask && !nIsRat(P.ask);
    if (irrAsk && mode !== 'place') e.push(`ask: a square root can only be used in place, zoom or irrational mode`);
    if (irrAsk && mode === 'place' && stepR === null) { /* free marker */ }
    const terms = askP && askP.terms && !irrAsk ? askP.terms : null;
    if (e.length) return { e };

    // the grid
    if (stepR === null) {
      let l = 1;
      const dens = [];
      if (startR) dens.push(startR.d);
      if (askRat) dens.push(askRat.d);
      if (terms) terms.forEach((t) => dens.push(t.d));
      if (sizesIn) sizesIn.forEach((s) => dens.push(s.d));
      dens.forEach((d) => { l = lcm(l, d); });
      if (l > 1000) { e.push('the numbers need a grid finer than 1/1000; give a step'); return { e }; }
      stepR = R(1, l);
    }
    P.free = mode === 'place' && irrAsk;
    P.step = stepR;
    const kLo = Math.ceil(rNum(rDiv(P.lo, stepR)) - 1e-9), kHi = Math.floor(rNum(rDiv(P.hi, stepR)) + 1e-9);
    if (kHi - kLo < 1) e.push('the range must hold at least two grid points');
    if (kHi - kLo > 1000) e.push('too many ticks (' + (kHi - kLo) + '); make the range smaller or the step bigger (at most 1000)');
    P.kLo = kLo; P.kHi = kHi;
    const inR = (r) => rCmp(r, P.lo) >= 0 && rCmp(r, P.hi) <= 0;
    if (startR && !P.free) { if (!inR(startR)) e.push('start must be between min and max'); else if (!onGrid(startR, stepR)) e.push('start must be on the grid (a multiple of the step)'); }
    if (startR && P.free && !inR(startR)) e.push('start must be between min and max');
    if (askRat && !P.free) {
      if (!inR(askRat)) e.push('ask must be between min and max');
      else if (!onGrid(askRat, stepR)) e.push('ask must be on the grid (a multiple of the step)');
    }
    if (irrAsk) { const v = nF(P.ask); if (v < rNum(P.lo) || v > rNum(P.hi)) e.push('ask must be between min and max'); }
    if (sizesIn) sizesIn.forEach((s) => { if (!onGrid(s, stepR)) e.push('each jump must be a multiple of the step'); if (rCmp(s, rSub(P.hi, P.lo)) > 0) e.push('a jump is larger than the whole line'); });
    if (mode === 'integers' && !(rCmp(P.lo, ZERO) < 0 && rCmp(P.hi, ZERO) > 0)) e.push('integers: min must be below 0 and max above 0');
    if (mode === 'integers' && stepR.d !== 1) e.push('integers: step must be a whole number');
    if (mode === 'integers' && askRat && askRat.d !== 1) e.push('integers: ask must be a whole number');
    if (mode === 'compare') {
      if (c.ask !== undefined && !askRat) e.push('compare: ask must be a rational number (the second number)');
    }
    if (mode === 'place' && !P.ask) { /* free exploring is allowed */ }
    if (terms && (mode === 'add' || mode === 'subtract' || mode === 'integers' || mode === 'count')) {
      terms.forEach((t) => { if (!onGrid(t, stepR) && !askP.plain) e.push('each number in ask must be a multiple of the step'); });
    }
    // where the marker starts
    const zeroIn = rCmp(P.lo, ZERO) <= 0 && rCmp(P.hi, ZERO) >= 0;
    const gridPt = (k) => R(k * stepR.n, stepR.d);
    let sR = startR;
    if (!sR) {
      if (mode === 'compare') sR = gridPt(Math.round(kLo + (kHi - kLo) * 0.3));
      else if (zeroIn && !P.free) sR = ZERO;
      else sR = gridPt(kLo);
      if (P.free && zeroIn) sR = ZERO;
      if (mode === 'place' && askRat && rEq(sR, askRat)) sR = gridPt(kLo);
    }
    P.startR = sR;
    P.startGiven = !!startR;
    // walking the expression from the start must stay on the line
    if (terms && terms.length > 1 && !startR) {
      let acc = sR;
      terms.forEach((t) => { acc = rAdd(acc, t); if (!inR(acc)) e.push('ask: the hops of this sum leave the line from the start point; widen min/max or set start'); });
    }
    // hop sizes
    let sizes;
    if (mode === 'count') sizes = sizesIn || [stepR];
    else if (sizesIn) sizes = sizesIn;
    else if (terms && terms.length > 1 && !askP.plain) { const seen = {}; sizes = []; terms.forEach((t) => { const a = rAbs(t); const k = a.n + '/' + a.d; if (!seen[k] && a.n > 0) { seen[k] = 1; sizes.push(a); } }); sizes = sizes.slice(0, 6); if (!sizes.length) sizes = [stepR]; }
    else sizes = [stepR];
    P.sizes = sizes;
    if (mode === 'compare') {
      let b = askRat;
      if (!b) { b = gridPt(Math.round(kLo + (kHi - kLo) * 0.72)); if (rEq(b, sR)) b = gridPt(kHi); }
      P.ask = nR(b); P.askRat = b;
    } else P.askRat = askRat;
    // expression text kept for the question
    P.askText = askP ? (typeof c.ask === 'number' ? String(c.ask) : c.ask) : null;
    P.askPlain = askP ? askP.plain : false;
    P.terms = terms;
    // number style
    let frac;
    if (c.format) frac = c.format === 'fraction';
    else frac = strs.some((s) => /\d\s*\/\s*\d/.test(s) && !/sqrt|√/.test(s)) || !termDec(stepR.d);
    P.frac = frac;
    return e.length ? { e } : { e, P };
  }

  // ---------------------------------------------------------------- the demo and the keys
  const DEMO = { mode: 'integers', min: -10, max: 10, start: 0, jumps: [1, 3, 5], ask: '-3+5' };

  function keysFor(c) {
    const out = { targets: [], events: [] };
    let mode = c && c.mode;
    const n = norm(c);
    const P = n.P;
    if (!MODES.includes(mode)) mode = 'count';
    const ask = !!(c && c.ask !== undefined);
    const jumpM = ['count', 'add', 'subtract', 'integers'].includes(mode);
    if (jumpM) {
      out.targets.push('jump:+', 'jump:-', 'slider:value', 'marker', 'reset');
      if (P && P.sizes.length > 1) out.targets.push('size:*');
      if (mode === 'integers') out.targets.push('opposite');
      out.events.push('landed:*');
    } else if (mode === 'place') { out.targets.push('slider:value', 'marker'); out.events.push('placed'); }
    else if (mode === 'compare') { out.targets.push('slider:value', 'marker', 'answer'); out.events.push('placed', 'compared'); }
    else if (mode === 'zoom') { out.targets.push('zoom', 'marker', 'answer', 'reset'); out.events.push('zoomed'); }
    else if (mode === 'irrational') { out.targets.push('jump:+', 'jump:-', 'marker', 'reset', 'answer'); out.events.push('landed:*'); }
    if (ask && mode !== 'zoom' && mode !== 'irrational' && mode !== 'compare') out.targets.push('answer');
    if (ask || mode === 'compare' || mode === 'zoom' || mode === 'irrational') out.events.push('answered:right', 'answered:wrong');
    return out;
  }

  // ---------------------------------------------------------------- styles
  const CSS = `
.nl { display: grid; gap: 12px; min-width: 0; color: var(--ink); }
.nl-scene { border-radius: 20px; overflow: hidden; background: linear-gradient(180deg, #E4F0FF 0%, #F4F1FF 55%, #FFF3E2 100%); box-shadow: 0 8px 24px rgba(29,78,216,.16), inset 0 0 0 1px rgba(29,78,216,.12); }
.nl-svg { display: block; width: 100%; height: auto; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
.nl-svg text { font-family: var(--font-display), system-ui, sans-serif; fill: ${INK}; }
.nl-svg .nl-lab { font-weight: 700; }
.nl-svg .nl-neg { fill: #B42318; color: #B42318; }
.nl-svg .nl-neg text { fill: #B42318; }
.nl-svg .nl-small { font-weight: 600; fill: #475569; }
.nl-svg .nl-pill { font-weight: 800; }
.nl-svg [role=button] { cursor: grab; outline: none; }
.nl-svg [role=button]:focus-visible .nl-focus { stroke: #FF7A1A; stroke-width: 3; opacity: 1; }
.nl-focus { fill: none; opacity: 0; }
.nl-panel { display: grid; gap: 10px; }
.nl-q { margin: 0; font: 600 1.08rem/1.45 var(--font-body); }
.nl-q b { font-family: var(--font-display); color: var(--royal); font-size: 1.18em; }
.nl-eq { font: 700 1.3rem/1.5 var(--font-display); background: var(--surface); border: 1.5px solid var(--line); border-radius: 14px; padding: 6px 14px; min-height: 52px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; overflow-wrap: anywhere; }
.nl-eq .nl-res { color: var(--good); }
.nl-eq .nl-dim { color: var(--ink-2); font-size: .85em; font-weight: 600; }
.nl-fr { display: inline-flex; flex-direction: column; vertical-align: middle; text-align: center; line-height: 1.05; font-size: .82em; margin: 0 2px; }
.nl-fr i { font-style: normal; border-bottom: 2px solid currentColor; padding: 0 3px; }
.nl-fr b { font-weight: inherit; padding: 0 3px; }
.nl-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.nl-chip, .nl-btn, .nl-sign { min-height: 48px; min-width: 48px; border-radius: 14px; border: 2px solid var(--line); background: var(--surface); color: var(--ink); font: 800 1.15rem var(--font-display); padding: 0 16px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; transition: transform .12s, box-shadow .12s, background .12s; }
.nl-chip[aria-pressed=true] { background: var(--royal-t); border-color: var(--royal); color: var(--royal); }
.nl-btn:hover, .nl-chip:hover, .nl-sign:hover { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(30,41,59,.15); }
.nl-btn:active, .nl-sign:active { transform: translateY(1px) scale(.97); }
.nl-fwd { background: #2563EB; border-color: #1D4ED8; color: #fff; min-width: 120px; }
.nl-back { background: #FF6B57; border-color: #E5503C; color: ${INK}; min-width: 120px; }
.nl-btn.nl-plain { font-size: 1rem; font-family: var(--font-body); font-weight: 700; }
.nl-btn.nl-go { background: var(--action); border-color: var(--action); color: var(--on-action); }
.nl-btn:disabled, .nl-chip:disabled { opacity: .45; cursor: default; }
.nl-btn:focus-visible, .nl-chip:focus-visible, .nl-sign:focus-visible, .nl-range:focus-visible, .nl-in:focus-visible { outline: 3px solid #FF7A1A; outline-offset: 2px; }
.nl-sign { font-size: 1.5rem; min-width: 84px; }
.nl-sign[aria-pressed=true] { background: var(--royal-t); border-color: var(--royal); }
.nl-range { width: 100%; min-height: 44px; accent-color: #2563EB; margin: 0; }
.nl-fb { margin: 0; min-height: 1.4em; font: 700 1rem/1.4 var(--font-body); }
.nl-fb.good { color: var(--good); }
.nl-fb.bad { color: var(--bad); }
.nl-fb.info { color: var(--ink-2); }
.nl-in { min-height: 48px; width: 9.5em; max-width: 100%; border-radius: 12px; border: 2px solid var(--line); background: var(--surface); color: var(--ink); font: 700 1.15rem var(--font-display); padding: 0 12px; }
.nl-trail { display: flex; flex-wrap: wrap; gap: 6px; }
.nl-step { background: var(--sunk); border-radius: 999px; padding: 4px 12px; font: 700 .95rem var(--font-body); }
.nl-step.on { background: var(--sun-t); outline: 2px solid #F5B90A; }
.nl-note { background: var(--sun-t); border-radius: 14px; padding: 8px 14px; font: 600 1rem/1.45 var(--font-body); margin: 0; }
.nl-note b { font-family: var(--font-display); }
.nl-zoombox { display: flex; align-items: center; gap: 10px; flex-wrap: nowrap; }
.nl-zoombox .nl-range { flex: 1; min-width: 80px; }
.nl-pop { animation: nlpop .5s ease; }
@keyframes nlpop { 0% { transform: scale(.9); } 50% { transform: scale(1.06); } 100% { transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .nl-pop { animation: none; } .nl-btn, .nl-chip, .nl-sign { transition: none; } }
@media (max-width: 480px) { .nl-btn, .nl-chip { padding: 0 12px; } .nl-eq { font-size: 1.15rem; } .nl-fwd, .nl-back { min-width: 0; flex: 1; } }
`;

  // ---------------------------------------------------------------- shared helpers for the mounts
  const wOf = (root) => Math.max(300, Math.min(960, Math.round(root.getBoundingClientRect().width || 360)));
  function watchSize(root, onChange) {
    let ro = null, last = wOf(root), timer = null;
    const check = () => { const w = wOf(root); if (Math.abs(w - last) > 6) { last = w; onChange(); } };
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(check, 60); }); ro.observe(root); }
    return () => { if (ro) ro.disconnect(); clearTimeout(timer); };
  }
  const pinPath = 'M0 0 L-14.7 -25.5 A17 17 0 1 1 14.7 -25.5 Z';
  const gradDefs = (u) => `<defs>
      <linearGradient id="${u}-pos" x1="0" x2="1"><stop offset="0" stop-color="#2563EB"/><stop offset="1" stop-color="#02CFF9"/></linearGradient>
      <linearGradient id="${u}-neg" x1="0" x2="1"><stop offset="0" stop-color="#FF7A1A"/><stop offset="1" stop-color="#FF6B57"/></linearGradient>
      <radialGradient id="${u}-pb" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#7FB0FF"/><stop offset="1" stop-color="#1D4ED8"/></radialGradient>
      <radialGradient id="${u}-pr" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#FFB19C"/><stop offset="1" stop-color="#E5503C"/></radialGradient>
      <radialGradient id="${u}-po" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#FFD08A"/><stop offset="1" stop-color="#FF7A1A"/></radialGradient>
      <radialGradient id="${u}-pg" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#FFE98A"/><stop offset="1" stop-color="#F5B90A"/></radialGradient>
      <filter id="${u}-sh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#0F172A" flood-opacity=".28"/></filter>
    </defs>`;
  const faceSVG = (happy, dark) => `<circle cx="-6" cy="-38" r="4" fill="#fff"/><circle cx="6" cy="-38" r="4" fill="#fff"/><circle cx="-5.4" cy="-37.6" r="2" fill="${INK}"/><circle cx="6.6" cy="-37.6" r="2" fill="${INK}"/>
      <path d="${happy ? 'M-7 -30 Q0 -21 7 -30' : 'M-6 -29 Q0 -25 6 -29'}" fill="none" stroke="${dark ? INK : '#fff'}" stroke-width="2.2" stroke-linecap="round"/>`;
  const pinSVG = (u, grad, label, happy, dark) => `<path d="${pinPath}" fill="url(#${u}-${grad})" stroke="#fff" stroke-width="2.4" stroke-linejoin="round" filter="url(#${u}-sh)"/>${label ? `<text x="0" y="-31" text-anchor="middle" style="font-size:20px;font-weight:800;fill:#fff">${label}</text>` : faceSVG(happy, dark)}`;
  function bubble(x, y, text, col, W) {
    const w = Math.max(34, text.length * 9.4 + 18);
    const cx = Math.max(w / 2 + 2, Math.min(W - w / 2 - 2, x));
    return `<g><rect x="${cx - w / 2}" y="${y - 24}" width="${w}" height="26" rx="13" fill="#fff" stroke="${col}" stroke-width="2.2"/><path d="M${x - 5} ${y + 1.6} L${x} ${y + 8} L${x + 5} ${y + 1.6}" fill="#fff" stroke="${col}" stroke-width="2.2" stroke-linejoin="round"/><path d="M${x - 4} ${y + 0.4} h8" stroke="#fff" stroke-width="3"/>
      <text x="${cx}" y="${y - 6}" text-anchor="middle" class="nl-lab" style="font-size:15px">${esc(text)}</text></g>`;
  }

  // ================================================================ the line modes
  function mountLine(root, C, api) {
    const t = (x) => api.t(x);
    const u = 'nl' + ++UID;
    const mode = C.mode;
    const jumpM = mode !== 'place' && mode !== 'compare';
    const cmpM = mode === 'compare';
    const step = C.step, stepF = rNum(step), frac = C.frac, free = !!C.free;
    const loF = rNum(C.lo), hiF = rNum(C.hi), span = hiF - loF;
    const kLo = C.kLo, kHi = C.kHi;
    const askN = C.ask, askF = askN ? nF(askN) : null;
    const askRat = C.askRat;
    const flagShown = jumpM && askRat && C.askPlain;
    const S = { cur: free ? rNum(C.startR) : C.startR, base: C.startR, arcs: [], size: C.sizes[0], anim: null, drag: null, fb: null, fbKind: '', opp: false, W: 0, pick: null, stops: [] };
    const gridPt = (k) => R(k * step.n, step.d);
    const curF = () => (free ? S.cur : rNum(S.cur));
    const ev = (r) => evName(r, frac);
    const T = (en, hi) => t(T2(en, hi));

    root.innerHTML = `<div class="nl" data-mode="${mode}">
      <div class="nl-scene"><svg class="nl-svg" role="group" aria-label="${esc(T('Number line', 'संख्या रेखा'))}"></svg></div>
      <div class="nl-panel">
        <p class="nl-q"></p>
        <div class="nl-eq" aria-live="polite"></div>
        ${jumpM && C.sizes.length > 1 ? '<div class="nl-row nl-sizes" role="group" aria-label="' + esc(T('Hop size', 'छलाँग का माप')) + '"></div>' : ''}
        ${jumpM ? `<div class="nl-row nl-btns">
          <button type="button" class="nl-btn nl-back" data-key="jump:-"></button>
          <button type="button" class="nl-btn nl-fwd" data-key="jump:+"></button>
          ${mode === 'integers' ? `<button type="button" class="nl-chip nl-opp" data-key="opposite" aria-pressed="false">${esc(T('Show the opposite', 'विपरीत संख्या दिखाओ'))}</button>` : ''}
          <button type="button" class="nl-btn nl-plain" data-key="reset">${esc(T('Start again', 'फिर से शुरू'))}</button></div>` : ''}
        <input class="nl-range" type="range" data-key="slider:value" aria-label="${esc(T('Slide the marker along the line', 'निशान को रेखा पर सरकाओ'))}" min="${free ? 0 : kLo}" max="${free ? 1000 : kHi}" step="1" value="0">
        ${cmpM ? `<div class="nl-row nl-signs" data-key="answer" role="group" aria-label="${esc(T('Which sign is true?', 'कौन-सा चिह्न सही है?'))}">
            <button type="button" class="nl-sign" data-sign="lt" aria-label="${esc(T('A is less than B', 'A, B से छोटा है'))}">&lt;</button>
            <button type="button" class="nl-sign" data-sign="eq" aria-label="${esc(T('A equals B', 'A और B बराबर हैं'))}">=</button>
            <button type="button" class="nl-sign" data-sign="gt" aria-label="${esc(T('A is greater than B', 'A, B से बड़ा है'))}">&gt;</button></div>`
        : (C.ask ? `<div class="nl-row"><button type="button" class="nl-btn nl-go" data-key="answer">${esc(T('Check my answer', 'मेरा उत्तर जाँचो'))}</button></div>` : '')}
        <p class="nl-fb" aria-live="polite"></p>
      </div></div>`;
    const svg = root.querySelector('svg');
    const qEl = root.querySelector('.nl-q'), eqEl = root.querySelector('.nl-eq'), fbEl = root.querySelector('.nl-fb');
    const range = root.querySelector('.nl-range');
    const btnF = root.querySelector('[data-key="jump:+"]'), btnB = root.querySelector('[data-key="jump:-"]');
    const sizesEl = root.querySelector('.nl-sizes');
    let geo = null, pinEl = null, backEl = null, bEl = null;

    // ---------- geometry
    function layout() {
      const W = wOf(root), H = 262, LY = 172, PL = 28, PR = 28;
      geo = { W, H, LY, PL, PR, pw: W - PL - PR };
      geo.X = (v) => PL + ((v - loF) / span) * geo.pw;
      geo.V = (px) => loF + ((px - PL) / geo.pw) * span;
    }
    function snapV(vf) {
      vf = Math.max(loF, Math.min(hiF, vf));
      if (free) return vf;
      const k = Math.max(kLo, Math.min(kHi, Math.round(vf / stepF)));
      return gridPt(k);
    }
    const vOfIdx = (i) => (free ? loF + (i / 1000) * span : gridPt(i));

    // ---------- the fixed part of the drawing
    function drawStatic() {
      const { W, H, LY, PL, pw } = geo, X = geo.X;
      const nGrid = kHi - kLo;
      const pxGrid = pw / Math.max(1, nGrid);
      const sample = [C.lo, C.hi, gridPt(Math.round((kLo + kHi) / 2) + 1)].map((r) => txt(r, frac).length);
      const lw = frac && step.d > 1 ? 40 : Math.max(...sample, 2) * 9 + 16;
      const cands = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 100, 200, 250, 500, 1000];
      let m = cands[cands.length - 1];
      for (const c of cands) if (pxGrid * c >= lw) { m = c; break; }
      // when the grid is fine and the labels are whole numbers, label the wholes
      let ticks = '', labs = '';
      for (let k = kLo; k <= kHi; k++) {
        const x = X(k * stepF), major = k % m === 0;
        if (major) {
          ticks += `<line x1="${x}" x2="${x}" y1="${LY - 10}" y2="${LY + 10}" stroke="${INK}" stroke-width="2" opacity=".85"/>`;
          const r = gridPt(k);
          labs += labSVG(x, LY + 36, r, frac, 'nl-lab' + (r.n < 0 ? ' nl-neg' : ''), 15);
        } else if (pxGrid >= 3.5) ticks += `<line x1="${x}" x2="${x}" y1="${LY - 5}" y2="${LY + 5}" stroke="#64748B" stroke-width="1.4" opacity=".8"/>`;
      }
      const zx = X(0), hasZero = loF <= 0 && hiF >= 0;
      const x0 = X(loF) - 12, x1 = X(hiF) + 12;
      let bar = '';
      if (hasZero && loF < 0) bar += `<line x1="${x0}" x2="${zx}" y1="${LY}" y2="${LY}" stroke="url(#${u}-neg)" stroke-width="10" stroke-linecap="round"/>`;
      if (hasZero && hiF > 0) bar += `<line x1="${loF < 0 ? zx : x0}" x2="${x1}" y1="${LY}" y2="${LY}" stroke="url(#${u}-pos)" stroke-width="10" stroke-linecap="round"/>`;
      if (!hasZero) bar += `<line x1="${x0}" x2="${x1}" y1="${LY}" y2="${LY}" stroke="url(#${u}-pos)" stroke-width="10" stroke-linecap="round"/>`;
      const arrows = `<path d="M${x0 - 4} ${LY} l12 -8 v16z" fill="${loF < 0 ? '#FF7A1A' : '#2563EB'}"/><path d="M${x1 + 4} ${LY} l-12 -8 v16z" fill="#02CFF9"/>`;
      const zero = hasZero ? `<circle cx="${zx}" cy="${LY}" r="7" fill="#fff" stroke="${INK}" stroke-width="3"/>` : '';
      const sideTxt = mode === 'integers' ? `<text x="${Math.max(PL + 4, X(loF) + 4)}" y="${LY - 142}" class="nl-small" style="font-size:12px">${esc(T('smaller ◀', '◀ छोटी'))}</text><text x="${Math.min(W - PL - 4, X(hiF) - 4)}" y="${LY - 142}" text-anchor="end" class="nl-small" style="font-size:12px">${esc(T('▶ bigger', 'बड़ी ▶'))}</text>` : '';
      return `${gradDefs(u)}${sideTxt}${bar}${arrows}${ticks}${zero}${labs}`;
    }
    function build() {
      layout();
      S.W = geo.W;
      svg.setAttribute('viewBox', `0 0 ${geo.W} ${geo.H}`);
      svg.innerHTML = `${drawStatic()}<g class="nl-back"></g><g class="nl-bpin"></g>
        <g class="nl-pin" data-key="marker" role="button" tabindex="0"><circle class="nl-focus" cx="0" cy="-26" r="26"/><g class="nl-pinbody"></g><g class="nl-bub"></g></g>`;
      backEl = svg.querySelector('.nl-back'); bEl = svg.querySelector('.nl-bpin'); pinEl = svg.querySelector('.nl-pin');
      draw();
    }

    // ---------- the moving part
    const arcColor = (a) => (rCmp(a.to, a.from) >= 0 ? '#2563EB' : '#E5503C');
    function arcSVG(a, idx, total) {
      const { LY, X } = geo;
      const x1 = X(rNum(a.from)), x2 = X(rNum(a.to)), mid = (x1 + x2) / 2, dx = Math.abs(x2 - x1);
      const h = Math.max(20, Math.min(62, 16 + dx * 0.2));
      const y0 = LY - 8, cy = y0 - 2 * h, col = arcColor(a), last = idx === total - 1;
      const ang = (Math.atan2(y0 - cy, x2 - mid) * 180) / Math.PI;
      const d = rSub(a.to, a.from);
      const label = (d.n >= 0 ? '+' : MINUS) + txt(rAbs(d), frac);
      const w = label.length * 8.8 + 14;
      return `<g opacity="${last ? 1 : 0.72}"><path d="M${x1} ${y0} Q${mid} ${cy} ${x2} ${y0}" fill="none" stroke="${col}" stroke-width="${last ? 4 : 3.2}" stroke-linecap="round" stroke-dasharray="${last ? '0' : '0'}"/>
        <path d="M0 0 L-9 -5 L-9 5z" fill="${col}" transform="translate(${x2} ${y0}) rotate(${ang})"/>
        <rect x="${mid - w / 2}" y="${y0 - h - 24}" width="${w}" height="22" rx="11" fill="#fff" stroke="${col}" stroke-width="2"/><text x="${mid}" y="${y0 - h - 8}" text-anchor="middle" class="nl-pill" style="font-size:14px;fill:${col}">${esc(label)}</text></g>`;
    }
    const pinX = () => {
      if (S.anim) return S.anim.x;
      if (S.drag) return S.drag.x;
      return curF();
    };
    function draw() {
      if (!geo) return;
      const { LY, X, W } = geo;
      const xv = pinX(), cur = xv;
      let h = '';
      if (flagShown) {
        const fx = X(askF);
        h += `<g><line x1="${fx}" x2="${fx}" y1="${LY - 6}" y2="${LY - 64}" stroke="${INK}" stroke-width="2.4"/><path d="M${fx} ${LY - 64} l26 9 -26 9z" fill="#F5B90A" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
          <circle cx="${fx}" cy="${LY}" r="5" fill="#F5B90A" stroke="${INK}" stroke-width="2"/><text x="${fx}" y="${LY - 70}" text-anchor="middle" class="nl-lab" style="font-size:13px">${esc(T('goal', 'लक्ष्य'))}</text></g>`;
      }
      if (mode === 'integers' && S.opp && cur !== 0) {
        const ox = X(-cur), cx = X(cur), z = X(0);
        h += `<g><path d="M${cx} ${LY + 12} Q${z} ${LY + 62} ${ox} ${LY + 12}" fill="none" stroke="#8B3DFF" stroke-width="3" stroke-dasharray="6 6" stroke-linecap="round"/>
          <g transform="translate(${ox} ${LY})" opacity=".78"><path d="${pinPath}" fill="url(#${u}-${cur < 0 ? 'pb' : 'pr'})" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></g>
          <text x="${z}" y="${LY + 80}" text-anchor="middle" class="nl-lab" style="font-size:13px;fill:#6D28D9">${esc(T(`${txt(R(Math.round(cur)))} and ${txt(R(-Math.round(cur)))} are opposites: both are ${Math.abs(Math.round(cur))} from 0`, `${txt(R(Math.round(cur)))} और ${txt(R(-Math.round(cur)))} विपरीत हैं: दोनों 0 से ${Math.abs(Math.round(cur))} दूर हैं`))}</text></g>`;
      }
      if (jumpM) h += S.arcs.map((a, i) => arcSVG(a, i, S.arcs.length)).join('');
      backEl.innerHTML = h;
      // second marker in compare mode
      if (cmpM) {
        const bx = X(askF), near = Math.abs(bx - X(cur)) < 80;
        bEl.innerHTML = `<g transform="translate(${bx} ${LY})">${pinSVG(u, 'po', 'B', false, true)}</g>${bubble(bx, LY - 66 - (near ? 30 : 0), 'B = ' + txt(C.askRat, frac), '#FF7A1A', W)}`;
      }
      // the pin
      const lift = S.anim ? S.anim.lift : 0;
      const neg = mode === 'integers' && cur < -1e-9;
      const grad = cmpM ? 'pb' : neg ? 'pr' : 'pb';
      const val = free ? (Math.round(cur * 100) / 100).toString().replace('-', MINUS) : txt(S.drag ? S.drag.r : S.anim ? S.anim.r : S.cur, frac);
      const happy = !!S.happy;
      pinEl.setAttribute('transform', `translate(${X(cur)} ${LY - lift})`);
      pinEl.querySelector('.nl-pinbody').innerHTML = pinSVG(u, grad, cmpM ? 'A' : '', happy, neg);
      pinEl.querySelector('.nl-bub').innerHTML = bubble(0, -66, (cmpM ? 'A = ' : '') + val, neg ? '#E5503C' : '#1D4ED8', W).replace(/<g>/, '<g>');
      // the bubble may need to slide inside the picture
      const bub = pinEl.querySelector('.nl-bub');
      const bx = X(cur);
      const w = Math.max(34, (cmpM ? 4 : 0) + val.length * 9.4 + 18);
      const shift = Math.max(w / 2 + 2 - bx, Math.min(0, W - w / 2 - 2 - bx));
      bub.setAttribute('transform', `translate(${shift} 0)`);
      const label = T(`Marker at ${val}. Arrow keys move it; Enter hops.`, `निशान ${val} पर है। तीर वाली कुंजियों से सरकाओ; Enter से छलाँग।`);
      pinEl.setAttribute('aria-label', label);
      // slider
      if (document.activeElement !== range || !S.drag) range.value = free ? Math.round(((curF() - loF) / span) * 1000) : Math.round(curF() / stepF);
      range.setAttribute('aria-valuetext', val);
      writeText();
    }

    // ---------- words
    function qHTML() {
      const a = C.askText ? prettyExpr(C.askText) : '';
      if (mode === 'count') {
        const by = htm(C.sizes[0], frac);
        return (askRat ? T(`Count in steps of <b>${by}</b>. Hop the marker to <b>${htm(askRat, frac)}</b>.`, `<b>${by}</b> के अंतर से गिनो। निशान को <b>${htm(askRat, frac)}</b> तक पहुँचाओ।`) : T(`Count in steps of <b>${by}</b>. Hop along the line and see which numbers you land on.`, `<b>${by}</b> के अंतर से गिनो। रेखा पर छलाँग लगाओ और देखो किन संख्याओं पर पहुँचते हो।`));
      }
      if (mode === 'add' || mode === 'subtract' || mode === 'integers') {
        const verb = mode === 'add' ? T('Add', 'जोड़ो') : mode === 'subtract' ? T('Subtract', 'घटाओ') : T('Work out', 'निकालो');
        if (C.askText && !C.askPlain) return T(`${verb}: <b>${a}</b> = ? Hop on the line and stop on the answer.`, `${verb}: <b>${a}</b> = ? रेखा पर छलाँग लगाओ और उत्तर पर रुको।`);
        if (askRat) return T(`Start at <b>${htm(S.base, frac)}</b>. Hop to reach <b>${htm(askRat, frac)}</b>.`, `<b>${htm(S.base, frac)}</b> से शुरू करो। <b>${htm(askRat, frac)}</b> तक पहुँचने के लिए छलाँग लगाओ।`);
        const how = mode === 'add' ? T('Hop to the right to add.', 'जोड़ने के लिए दाईं ओर छलाँग लगाओ।') : mode === 'subtract' ? T('Hop to the left to subtract.', 'घटाने के लिए बाईं ओर छलाँग लगाओ।') : T('Right is bigger, left is smaller. Hop and watch the sum.', 'दाईं ओर बड़ी, बाईं ओर छोटी संख्या। छलाँग लगाओ और योग देखो।');
        return how;
      }
      if (mode === 'place') return askN ? T(`Place the number <b>${C.askPlain ? htm(askRat, frac) : a}</b> on the line. Drag the marker, then check.`, `संख्या <b>${C.askPlain ? htm(askRat, frac) : a}</b> को रेखा पर रखो। निशान को खींचो, फिर जाँचो।`) : T('Drag the marker anywhere and read its number.', 'निशान को कहीं भी खींचो और उसकी संख्या पढ़ो।');
      return T('Slide <b>A</b> along the line. Then choose the sign that makes the comparison true.', '<b>A</b> को रेखा पर सरकाओ। फिर वह चिह्न चुनो जिससे तुलना सही हो।');
    }
    function eqText() {
      if (cmpM) {
        const c = nCmp(nR(S.cur), askN);
        const sym = c < 0 ? '<' : c > 0 ? '>' : '=';
        return `<span>${htm(S.cur, frac)}</span><span class="nl-res">${sym.replace('<', '&lt;').replace('>', '&gt;')}</span><span>${htm(askRat, frac)}</span><span class="nl-dim">A ${T('and', 'और')} B</span>`;
      }
      if (!jumpM) {
        if (free) return `<span>${esc(T('Marker at', 'निशान यहाँ'))} </span><span class="nl-res">${esc((Math.round(curF() * 1000) / 1000).toString().replace('-', MINUS))}</span>`;
        return `<span>${esc(T('Marker at', 'निशान यहाँ'))}</span><span class="nl-res">${htm(S.cur, frac)}</span>`;
      }
      const arcs = S.arcs;
      if (mode === 'count') {
        const pts = [S.base].concat(arcs.map((a) => a.to)).slice(-9);
        return (arcs.length > 8 ? '<span class="nl-dim">…</span>' : '') + pts.map((p, i) => `${i ? '<span class="nl-dim">,</span>' : ''}<span${i === pts.length - 1 ? ' class="nl-res"' : ''}>${htm(p, frac)}</span>`).join('');
      }
      const shown = arcs.slice(-7);
      let h = (arcs.length > 7 ? '<span class="nl-dim">…</span>' : '') + `<span>${htm(arcs.length > 7 ? arcs[arcs.length - 8].to : S.base, frac)}</span>`;
      shown.forEach((a) => { const d = rSub(a.to, a.from); h += `<span>${d.n >= 0 ? '+' : MINUS}</span><span>${htm(rAbs(d), frac)}</span>`; });
      return h + `<span>=</span><span class="nl-res">${htm(S.cur, frac)}</span>`;
    }
    function writeText() {
      qEl.innerHTML = qHTML();
      eqEl.innerHTML = eqText();
      fbEl.className = 'nl-fb ' + (S.fbKind || '');
      fbEl.textContent = S.fb ? t(S.fb) : '';
      if (jumpM) {
        const sz = S.size, st = htm(sz, frac);
        const canF = rCmp(rAdd(S.cur, sz), C.hi) <= 0, canB = rCmp(rSub(S.cur, sz), C.lo) >= 0;
        btnF.innerHTML = `<span>${st.startsWith('<') ? '+' + st : '+' + st}</span><span aria-hidden="true">▶</span>`;
        btnB.innerHTML = `<span aria-hidden="true">◀</span><span>${MINUS}${st}</span>`;
        btnF.setAttribute('aria-label', T(`Hop forward by ${txt(sz, frac)}`, `${txt(sz, frac)} आगे छलाँग`));
        btnB.setAttribute('aria-label', T(`Hop back by ${txt(sz, frac)}`, `${txt(sz, frac)} पीछे छलाँग`));
        btnF.disabled = !canF && !S.busy ? true : false; btnB.disabled = !canB && !S.busy ? true : false;
        if (sizesEl) sizesEl.innerHTML = C.sizes.map((s) => `<button type="button" class="nl-chip" data-key="size:${ev(s)}" data-size="${s.n}/${s.d}" aria-pressed="${rEq(s, S.size)}">${htm(s, frac)}</button>`).join('');
        if (sizesEl) sizesEl.insertAdjacentHTML('afterbegin', `<span class="nl-dim" style="font:600 .95rem var(--font-body);color:var(--ink-2)">${esc(T('Hop size:', 'छलाँग का माप:'))}</span>`);
      }
      if (cmpM) root.querySelectorAll('.nl-sign').forEach((b) => b.setAttribute('aria-pressed', String(S.pick === b.dataset.sign)));
      const op = root.querySelector('.nl-opp');
      if (op) op.setAttribute('aria-pressed', String(S.opp));
    }
    const say = (kind, en, hi) => { S.fbKind = kind; S.fb = T2(en, hi); };

    // ---------- actions
    const stopAll = () => { S.stops.forEach((f) => f()); S.stops = []; };
    function moveTo(target, how) {
      // target: a Rat on the grid (or a number when free)
      if (S.busy) return;
      S.fb = null; S.fbKind = ''; S.happy = false;
      const from = S.cur;
      const sameCmp = free ? Math.abs(target - from) < 1e-9 : rEq(target, from);
      if (sameCmp) { S.drag = null; draw(); return; }
      S.busy = true;
      const f0 = free ? from : rNum(from), f1 = free ? target : rNum(target);
      const dist = Math.abs(f1 - f0) / span;
      const stop = tween(jumpM ? 280 + 600 * Math.min(1, dist * 1.4) : 260, (p) => {
        const e = L.ease(p);
        S.anim = { x: f0 + (f1 - f0) * e, lift: jumpM ? Math.sin(Math.PI * p) * 30 : 0, r: free ? target : (p < 0.5 ? from : target) };
        if (p === 1) S.anim = null;
        draw();
      }, () => {
        S.anim = null; S.busy = false; S.drag = null;
        S.cur = target;
        if (jumpM) {
          const last = S.arcs[S.arcs.length - 1];
          if (last && rEq(last.from, target) && rEq(last.to, from)) S.arcs.pop();
          else S.arcs.push({ from, to: target });
          if (S.arcs.length > 40) { S.base = S.arcs[0].to; S.arcs.shift(); }
          api.emit('landed:' + ev(target));
          api.record(T2(`Hopped to ${txt(target, frac)}`, `${txt(target, frac)} पर पहुँचा`) && t(T2(`Hopped to ${txt(target, frac)}`, `${txt(target, frac)} पर पहुँचा`)));
        } else {
          api.emit('placed');
          api.record(t(T2(`Placed the marker at ${free ? (Math.round(target * 100) / 100) : txt(target, frac)}`, `निशान ${free ? (Math.round(target * 100) / 100) : txt(target, frac)} पर रखा`)));
        }
        draw();
      });
      S.stops.push(stop);
    }
    function hop(dir) {
      const key = dir > 0 ? 'jump:+' : 'jump:-';
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (S.busy) return;
      const target = dir > 0 ? rAdd(S.cur, S.size) : rSub(S.cur, S.size);
      if (rCmp(target, C.lo) < 0 || rCmp(target, C.hi) > 0) {
        say('info', 'That hop would go off the end of the line. Try a smaller hop or the other way.', 'यह छलाँग रेखा के सिरे से बाहर चली जाएगी। छोटी छलाँग या दूसरी दिशा आज़माओ।');
        draw(); return;
      }
      moveTo(target);
    }
    function commit(vf) {
      if (!api.allowed('slider:value')) { api.nudge('slider:value'); S.drag = null; draw(); return; }
      const target = snapV(vf);
      moveTo(target);
    }
    function check() {
      if (!api.allowed('answer')) { api.nudge('answer'); return; }
      if (S.busy) return;
      let ok, dirHint = 0;
      const cf = curF();
      if (free) { ok = Math.abs(cf - askF) <= Math.max(span / 120, 1e-9); dirHint = cf < askF ? 1 : -1; }
      else { const c = nCmp(nR(S.cur), askN); ok = c === 0; dirHint = c < 0 ? 1 : -1; }
      if (ok) {
        S.happy = true;
        say('good', jumpM ? 'Yes! You landed on the right number.' : free ? 'Yes! That is very close to the real place of this number.' : 'Yes! The marker is exactly on the number.', jumpM ? 'हाँ! तुम सही संख्या पर पहुँच गए।' : free ? 'हाँ! यह इस संख्या की असली जगह के बहुत पास है।' : 'हाँ! निशान ठीक उस संख्या पर है।');
        api.emit('answered:right'); api.celebrate(); api.record(t(T2('Answered right', 'सही उत्तर दिया')));
        const sc = root.querySelector('.nl-eq'); sc.classList.remove('nl-pop'); void sc.offsetWidth; sc.classList.add('nl-pop');
      } else {
        S.happy = false;
        const right = dirHint > 0;
        if (jumpM && !C.askPlain) say('bad', `Not yet. You are on ${txt(S.cur, frac)}. The answer is a little ${right ? 'to the right' : 'to the left'}. ${mode === 'integers' ? 'Remember: adding goes right, subtracting goes left.' : ''}`, `अभी नहीं। तुम ${txt(S.cur, frac)} पर हो। उत्तर थोड़ा ${right ? 'दाईं ओर' : 'बाईं ओर'} है। ${mode === 'integers' ? 'याद रखो: जोड़ने पर दाईं ओर, घटाने पर बाईं ओर।' : ''}`);
        else say('bad', `Not yet. The marker is on ${free ? Math.round(cf * 100) / 100 : txt(S.cur, frac)}. The number is more to the ${right ? 'right' : 'left'}.`, `अभी नहीं। निशान ${free ? Math.round(cf * 100) / 100 : txt(S.cur, frac)} पर है। संख्या और ${right ? 'दाईं' : 'बाईं'} ओर है।`);
        api.emit('answered:wrong'); api.record(t(T2('Answered wrong', 'गलत उत्तर दिया')));
      }
      draw();
    }
    function pickSign(sg) {
      if (!api.allowed('answer')) { api.nudge('answer'); return; }
      S.pick = sg;
      const c = nCmp(nR(S.cur), askN);
      const truth = c < 0 ? 'lt' : c > 0 ? 'gt' : 'eq';
      api.emit('compared');
      const txtRel = { lt: T2('A is less than B: A is to the left of B.', 'A, B से छोटा है: A, B के बाईं ओर है।'), gt: T2('A is greater than B: A is to the right of B.', 'A, B से बड़ा है: A, B के दाईं ओर है।'), eq: T2('A equals B: they sit at the same place.', 'A और B बराबर हैं: दोनों एक ही जगह हैं।') };
      if (sg === truth) { S.fbKind = 'good'; S.fb = T2('Yes! ' + txtRel[truth].en, 'हाँ! ' + txtRel[truth].hi); S.happy = true; api.emit('answered:right'); api.celebrate(); }
      else { S.fbKind = 'bad'; S.fb = T2('Look again. ' + txtRel[truth].en, 'फिर से देखो। ' + txtRel[truth].hi); S.happy = false; api.emit('answered:wrong'); }
      api.record(t(txtRel[truth]));
      draw();
    }
    function reset() {
      if (!api.allowed('reset')) { api.nudge('reset'); return; }
      stopAll(); S.busy = false; S.anim = null; S.drag = null;
      S.cur = free ? rNum(C.startR) : C.startR; S.base = C.startR; S.arcs = []; S.fb = null; S.fbKind = ''; S.happy = false; S.opp = false;
      draw();
    }

    // ---------- events
    const onDown = (e) => {
      if (e.button !== undefined && e.button > 0) return;
      if (S.busy) return;
      if (!api.allowed('marker')) { api.nudge('marker'); return; }
      const rect = svg.getBoundingClientRect();
      const toV = (ev2) => geo.V(((ev2.clientX - rect.left) * geo.W) / rect.width);
      try { svg.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
      const upd = (ev2) => { const vf = toV(ev2); const r = snapV(vf); S.drag = { x: free ? r : rNum(r), r }; draw(); return vf; };
      upd(e);
      const mv = (ev2) => upd(ev2);
      const up = (ev2) => {
        svg.removeEventListener('pointermove', mv); svg.removeEventListener('pointerup', up); svg.removeEventListener('pointercancel', up);
        const d = S.drag; S.drag = null;
        if (d) { if (!api.allowed('slider:value') && !api.allowed('marker')) { draw(); return; } moveTo(d.r); }
      };
      svg.addEventListener('pointermove', mv); svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
    };
    const onKey = (e) => {
      if (!e.target.closest || !e.target.closest('.nl-pin')) return;
      const k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowLeft' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'Home' || k === 'End') {
        e.preventDefault();
        if (!api.allowed('marker')) { api.nudge('marker'); return; }
        if (S.busy) return;
        const dir = k === 'ArrowRight' || k === 'ArrowUp' ? 1 : -1;
        if (k === 'Home' || k === 'End') { moveTo(k === 'Home' ? (free ? loF : gridPt(kLo)) : (free ? hiF : gridPt(kHi))); return; }
        if (free) { moveTo(snapV(S.cur + dir * span / 100)); return; }
        const sz = jumpM ? S.size : step;
        const tg = dir > 0 ? rAdd(S.cur, sz) : rSub(S.cur, sz);
        if (rCmp(tg, C.lo) >= 0 && rCmp(tg, C.hi) <= 0) moveTo(tg);
      } else if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        if (jumpM) hop(1);
        else api.toast(t(T2('The marker is at ' + (free ? Math.round(curF() * 100) / 100 : txt(S.cur, frac)), 'निशान ' + (free ? Math.round(curF() * 100) / 100 : txt(S.cur, frac)) + ' पर है')));
      }
    };
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('keydown', onKey);
    range.addEventListener('input', () => {
      if (!api.allowed('slider:value')) { api.nudge('slider:value'); draw(); return; }
      if (S.busy) return;
      const r = vOfIdx(+range.value);
      S.drag = { x: free ? r : rNum(r), r };
      draw();
    });
    range.addEventListener('change', () => { if (S.busy) { draw(); return; } const d = S.drag; S.drag = null; if (!d) return; if (!api.allowed('slider:value')) { draw(); return; } moveTo(d.r); });
    if (jumpM) {
      btnF.addEventListener('click', () => hop(1));
      btnB.addEventListener('click', () => hop(-1));
      root.querySelector('[data-key="reset"]').addEventListener('click', reset);
      if (sizesEl) sizesEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-size]');
        if (!b) return;
        if (!api.allowed(b.dataset.key)) { api.nudge(b.dataset.key); return; }
        const [n, d] = b.dataset.size.split('/').map(Number);
        S.size = R(n, d); S.fb = null; S.fbKind = ''; draw();
      });
      const op = root.querySelector('.nl-opp');
      if (op) op.addEventListener('click', () => { if (!api.allowed('opposite')) { api.nudge('opposite'); return; } S.opp = !S.opp; if (S.opp) api.record(t(T2('Looked at the opposite number', 'विपरीत संख्या देखी'))); draw(); });
    }
    const ans = root.querySelector('button[data-key="answer"]');
    if (ans) ans.addEventListener('click', check);
    root.querySelectorAll('.nl-sign').forEach((b) => b.addEventListener('click', () => pickSign(b.dataset.sign)));

    build();
    const unwatch = watchSize(root, () => { if (!S.busy) build(); });
    return { destroy() { stopAll(); unwatch(); svg.removeEventListener('pointerdown', onDown); svg.removeEventListener('keydown', onKey); } };
  }

  // ================================================================ zoom mode
  function mountZoom(root, C, api) {
    const t = (x) => api.t(x);
    const T = (en, hi) => t(T2(en, hi));
    const u = 'nl' + ++UID;
    const v = C.ask, vF = nF(v), loF = rNum(C.lo), hiF = rNum(C.hi);
    const MAXL = 6;
    const S = { level: 0, view: { lo: loF, hi: hiF, u: 0 }, stop: null, fb: null, fbKind: '', done: false, W: 0 };
    const exactRat = nIsRat(v) ? v.a : null;
    const dt = exactRat ? decType(exactRat) : { kind: 'irr' };
    const viewOf = (Lv) => {
      if (Lv === 0) return { lo: loF, hi: hiF, u: 0 };
      const m = Number(floorScaled(v, Lv - 1)), w = Math.pow(10, -(Lv - 1));
      return { lo: m * w, hi: m * w + w, u: -Lv };
    };
    const tickLo = (Lv) => floorScaled(v, Lv);
    root.innerHTML = `<div class="nl" data-mode="zoom">
      <div class="nl-scene"><svg class="nl-svg" role="img" aria-label="${esc(T('A number line that you can zoom into', 'संख्या रेखा जिसमें तुम ज़ूम कर सकते हो'))}"></svg></div>
      <div class="nl-panel">
        <p class="nl-q">${T('A mystery number sits at the <b>?</b> marker. Zoom in to see between which ticks it lies, then type the tick it is closest to.', '<b>?</b> वाले निशान पर एक रहस्य संख्या है। ज़ूम करके देखो वह किन टिक के बीच है, फिर वह टिक लिखो जिसके सबसे पास है।')}</p>
        <div class="nl-trail" aria-label="${esc(T('Where the number lies at each zoom', 'हर ज़ूम पर संख्या कहाँ है'))}"></div>
        <div class="nl-zoombox" data-key="zoom">
          <button type="button" class="nl-btn" data-z="-1" aria-label="${esc(T('Zoom out', 'ज़ूम आउट'))}">−</button>
          <input class="nl-range" type="range" min="0" max="${MAXL}" step="1" value="0" aria-label="${esc(T('Zoom level', 'ज़ूम का स्तर'))}">
          <button type="button" class="nl-btn" data-z="1" aria-label="${esc(T('Zoom in', 'ज़ूम इन'))}">+</button>
        </div>
        <div class="nl-eq" aria-live="polite"></div>
        <p class="nl-note"></p>
        <div class="nl-row" data-key="answer"><input class="nl-in" type="text" inputmode="decimal" autocomplete="off" aria-label="${esc(T('Your answer', 'तुम्हारा उत्तर'))}" placeholder="${esc(T('type here', 'यहाँ लिखो'))}">
          <button type="button" class="nl-btn nl-go">${esc(T('Check', 'जाँचो'))}</button>
          <button type="button" class="nl-btn nl-plain" data-key="reset">${esc(T('Zoom back out', 'वापस ज़ूम आउट'))}</button></div>
        <p class="nl-fb" aria-live="polite"></p>
      </div></div>`;
    const svg = root.querySelector('svg'), range = root.querySelector('.nl-range');
    const trail = root.querySelector('.nl-trail'), eqEl = root.querySelector('.nl-eq'), noteEl = root.querySelector('.nl-note'), fbEl = root.querySelector('.nl-fb');
    const inp = root.querySelector('.nl-in');
    let stops = [];

    function render(view, W) {
      const H = 292, PL = 28, PR = 28, pw = W - PL - PR, LY = 200, MY = 44;
      const X = (x) => PL + ((x - view.lo) / (view.hi - view.lo)) * pw;
      const mini = (x) => PL + ((x - loF) / (hiF - loF)) * pw;
      let g = `${gradDefs(u)}`;
      // the mini map (the whole range) and the funnel to the zoomed line
      const wx0 = Math.max(PL, mini(view.lo)), wx1 = Math.min(PL + pw, mini(view.hi)), ww = Math.max(5, wx1 - wx0);
      g += `<line x1="${PL}" x2="${PL + pw}" y1="${MY}" y2="${MY}" stroke="#94A3B8" stroke-width="5" stroke-linecap="round"/>`;
      for (let k = Math.ceil(loF); k <= hiF; k++) g += `<line x1="${mini(k)}" x2="${mini(k)}" y1="${MY - 6}" y2="${MY + 6}" stroke="#64748B" stroke-width="1.6"/><text x="${mini(k)}" y="${MY - 12}" text-anchor="middle" class="nl-small" style="font-size:11px">${k}</text>`;
      g += `<path d="M${wx0} ${MY + 3} L${PL - 4} ${LY - 24} L${PL + pw + 4} ${LY - 24} L${wx0 + ww} ${MY + 3}z" fill="#FF7A1A" opacity=".13"/>
        <path d="M${wx0} ${MY + 3} L${PL - 4} ${LY - 24} M${wx0 + ww} ${MY + 3} L${PL + pw + 4} ${LY - 24}" stroke="#FF7A1A" stroke-width="2" stroke-dasharray="5 5" fill="none" opacity=".75"/>
        <rect x="${wx0 - 2}" y="${MY - 9}" width="${ww + 4}" height="18" rx="9" fill="none" stroke="#FF7A1A" stroke-width="3"/>`;
      // the zoomed line
      g += `<line x1="${PL - 14}" x2="${PL + pw + 14}" y1="${LY}" y2="${LY}" stroke="url(#${u}-pos)" stroke-width="10" stroke-linecap="round"/>`;
      const layers = [Math.floor(view.u + 1e-9), Math.floor(view.u + 1e-9) + 1];
      for (const k of layers) {
        const a = Math.max(0, 1 - Math.abs(view.u - k));
        if (a < 0.03) continue;
        const sp = Math.pow(10, k), dec = Math.max(0, -k);
        const j0 = Math.ceil(view.lo / sp - 1e-9), j1 = Math.floor(view.hi / sp + 1e-9);
        if (j1 - j0 > 250) continue;
        const px = (sp / (view.hi - view.lo)) * pw;
        for (let j = j0; j <= j1; j++) {
          const x = X(j * sp), val = j * sp;
          g += `<line x1="${x}" x2="${x}" y1="${LY - 11}" y2="${LY + 11}" stroke="${INK}" stroke-width="2" opacity="${a * 0.9}"/>`;
          if (px >= 34 || (px >= 18 && j % 2 === 0)) g += `<text x="${x}" y="${LY + 36}" text-anchor="middle" class="nl-lab" style="font-size:${px >= 50 ? 15 : 13}px" opacity="${a}">${esc(sgn(val.toFixed(dec)))}</text>`;
        }
      }
      // the mystery marker
      const mx = X(vF);
      const known = S.done ? txtN(v, false) : '?';
      if (mx >= PL - 10 && mx <= PL + pw + 10) g += `<g data-key="marker" role="img" aria-label="${esc(T('The mystery number', 'रहस्य संख्या'))}" transform="translate(${mx} ${LY})">${pinSVG(u, 'po', '?', false, true)}</g>`;
      void known;
      return { svg: g, H };
    }
    function paint(view) {
      const W = wOf(root);
      S.W = W;
      const r = render(view, W);
      svg.setAttribute('viewBox', `0 0 ${W} ${r.H}`);
      svg.innerHTML = r.svg;
    }
    function text() {
      const Lv = S.level;
      trail.innerHTML = '';
      for (let i = 0; i <= Lv; i++) {
        const m = tickLo(i);
        const a = scaledStr(m, i), b = scaledStr(m + 1n, i);
        trail.insertAdjacentHTML('beforeend', `<span class="nl-step${i === Lv ? ' on' : ''}">${esc(a)} – ${esc(b)}</span>`);
      }
      const m = tickLo(Lv), lo = scaledStr(m, Lv), hi = scaledStr(m + 1n, Lv);
      eqEl.innerHTML = `<span class="nl-dim">${esc(T('The number is between', 'संख्या इनके बीच है'))}</span><span>${esc(lo)}</span><span class="nl-dim">${esc(T('and', 'और'))}</span><span>${esc(hi)}</span>`;
      // what the digits tell us
      let note;
      const exactHere = exactRat && termDec(exactRat.d) && rDiv(exactRat, R(1, Math.pow(10, Lv))).d === 1;
      const digits = scaledStr(floorScaled(v, Math.min(Lv + 2, 8)), Math.min(Lv + 2, 8));
      if (exactHere) {
        note = T(`The marker is exactly on a tick: <b>${esc(scaledStr(m, Lv))}</b>. The digits stop here, so this is a ${dt.kind === 'int' ? 'whole number' : 'terminating decimal'}.`, `निशान ठीक एक टिक पर है: <b>${esc(scaledStr(m, Lv))}</b>। अंक यहीं रुक जाते हैं, इसलिए यह ${dt.kind === 'int' ? 'पूर्ण संख्या' : 'सांत दशमलव'} है।`);
      } else if (Lv >= 3 && dt.kind === 'rep') {
        const rp = dt.rep, pre = dt.pre;
        note = T(`Digits so far: <b>${esc(digits)}…</b> They never stop, but they repeat: <b>${esc(rp)}</b> comes round again and again. A repeating decimal is a fraction, so it is a rational number.`, `अब तक के अंक: <b>${esc(digits)}…</b> ये रुकते नहीं, पर दोहराते हैं: <b>${esc(rp)}</b> बार-बार आता है। दोहराने वाला दशमलव भिन्न होता है, इसलिए यह परिमेय संख्या है।${pre ? '' : ''}`);
      } else if (Lv >= 3 && dt.kind === 'irr') {
        note = T(`Digits so far: <b>${esc(digits)}…</b> However far you zoom, the number is never exactly on a tick. The digits never stop and never repeat: this is an irrational number.`, `अब तक के अंक: <b>${esc(digits)}…</b> चाहे जितना ज़ूम करो, संख्या कभी ठीक टिक पर नहीं आती। अंक न रुकते हैं, न दोहराते हैं: यह अपरिमेय संख्या है।`);
      } else if (Lv >= 3 && exactRat && termDec(exactRat.d)) {
        note = T(`Digits so far: <b>${esc(digits)}</b>. Keep zooming until the marker lands exactly on a tick.`, `अब तक के अंक: <b>${esc(digits)}</b>। तब तक ज़ूम करो जब तक निशान ठीक टिक पर न आ जाए।`);
      } else note = T(`Each zoom makes the ticks 10 times closer. The marker stays between two ticks: read the left one, then zoom again.`, `हर ज़ूम पर टिक 10 गुना पास आ जाते हैं। निशान दो टिक के बीच रहता है: बायाँ टिक पढ़ो, फिर ज़ूम करो।`);
      noteEl.innerHTML = note;
      fbEl.className = 'nl-fb ' + (S.fbKind || '');
      fbEl.textContent = S.fb ? t(S.fb) : '';
      range.value = Lv;
      range.setAttribute('aria-valuetext', T(`Zoom level ${Lv}`, `ज़ूम स्तर ${Lv}`));
      root.querySelector('[data-z="-1"]').disabled = Lv <= 0;
      root.querySelector('[data-z="1"]').disabled = Lv >= MAXL;
    }
    function zoomTo(Lv, byUser) {
      Lv = Math.max(0, Math.min(MAXL, Lv));
      if (Lv === S.level) { text(); return; }
      if (byUser && !api.allowed('zoom')) { api.nudge('zoom'); text(); return; }
      stops.forEach((f) => f()); stops = [];
      const from = S.view, to = viewOf(Lv);
      S.level = Lv; S.fb = null; S.fbKind = '';
      const gw0 = Math.log(from.hi - from.lo), gw1 = Math.log(to.hi - to.lo);
      const c0 = (from.lo + from.hi) / 2, c1 = (to.lo + to.hi) / 2;
      stops.push(tween(750, (p) => {
        const e = L.ease(p), w = Math.exp(gw0 + (gw1 - gw0) * e), c = c0 + (c1 - c0) * e;
        S.view = { lo: c - w / 2, hi: c + w / 2, u: from.u + (to.u - from.u) * e };
        paint(S.view);
      }, () => { S.view = to; paint(S.view); }));
      text();
      if (byUser) { api.emit('zoomed'); api.record(t(T2(`Zoomed to level ${Lv}`, `ज़ूम स्तर ${Lv} पर गया`))); }
    }
    function check() {
      if (!api.allowed('answer')) { api.nudge('answer'); return; }
      const Lv = S.level;
      let typed = null;
      try { const p = parseExpr(inp.value.replace(',', '.')); if (nIsRat(p.val)) typed = p.val.a; } catch (err) { typed = null; }
      if (!typed) { S.fbKind = 'info'; S.fb = T2('Type a number, like 2.6', 'कोई संख्या लिखो, जैसे 2.6'); text(); return; }
      const m = tickLo(Lv), next = floorScaled(v, Lv + 1) - m * 10n;
      const M = next >= 5n ? m + 1n : m;
      const expect = R(Number(M), Math.pow(10, Lv));
      if (rEq(typed, expect)) {
        S.done = true; S.fbKind = 'good';
        S.fb = T2(`Yes! At this zoom the marker is closest to ${scaledStr(M, Lv)}.`, `हाँ! इस ज़ूम पर निशान ${scaledStr(M, Lv)} के सबसे पास है।`);
        api.emit('answered:right'); api.celebrate(); api.record(t(T2('Answered right', 'सही उत्तर दिया')));
      } else {
        S.fbKind = 'bad';
        S.fb = T2(`Not yet. The marker is between ${scaledStr(m, Lv)} and ${scaledStr(m + 1n, Lv)}. Which tick is it closer to?`, `अभी नहीं। निशान ${scaledStr(m, Lv)} और ${scaledStr(m + 1n, Lv)} के बीच है। वह किस टिक के ज़्यादा पास है?`);
        api.emit('answered:wrong'); api.record(t(T2('Answered wrong', 'गलत उत्तर दिया')));
      }
      text();
    }
    root.querySelectorAll('[data-z]').forEach((b) => b.addEventListener('click', () => zoomTo(S.level + +b.dataset.z, true)));
    range.addEventListener('input', () => zoomTo(+range.value, true));
    root.querySelector('.nl-go').addEventListener('click', check);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
    root.querySelector('[data-key="reset"]').addEventListener('click', () => { if (!api.allowed('reset')) { api.nudge('reset'); return; } S.done = false; inp.value = ''; zoomTo(0, false); });
    paint(S.view); text();
    const unwatch = watchSize(root, () => paint(S.view));
    return { destroy() { stops.forEach((f) => f()); unwatch(); } };
  }

  // ================================================================ irrational mode (compass-and-ruler)
  const PAL = ['#02CFF9', '#FFD23F', '#22C55E', '#FF9E57', '#C4A5FF', '#FF8A7A'];
  function spiralPts(k) {
    const P = [{ x: 1, y: 0 }], th = [0];
    for (let i = 1; i <= k - 1; i++) {
      const p = P[i - 1], a = Math.atan2(p.y, p.x), r = Math.hypot(p.x, p.y);
      P.push({ x: p.x - Math.sin(a), y: p.y + Math.cos(a) });
      th.push(Math.atan2(P[i].y, P[i].x));
      void r;
    }
    return P;
  }
  function mountIrr(root, C, api) {
    const t = (x) => api.t(x);
    const T = (en, hi) => t(T2(en, hi));
    const u = 'nl' + ++UID;
    const rad = C.rad, x = rNum(rad), method = C.method;
    const spiral = method === 'spiral';
    const N = spiral ? rad.n - 1 : 5;
    const sp = spiral ? spiralPts(rad.n) : null;
    const S = { step: 0, p: 1, stop: null, fb: null, fbKind: '', W: 0, done: false };
    const sqrtTxt = (r) => '√' + txt(r, false);
    root.innerHTML = `<div class="nl" data-mode="irrational">
      <div class="nl-scene"><svg class="nl-svg" role="img" aria-label="${esc(T('Drawing of the construction', 'रचना का चित्र'))}"></svg></div>
      <div class="nl-panel">
        <p class="nl-q">${spiral ? T(`Build <b>√${rad.n}</b> on the number line with the square-root spiral. Press <b>Next step</b> and watch.`, `वर्गमूल सर्पिल से संख्या रेखा पर <b>√${rad.n}</b> बनाओ। <b>अगला चरण</b> दबाओ और देखो।`) : T(`Build <b>√${txt(rad, false)}</b> on the number line with a semicircle. Press <b>Next step</b> and watch.`, `अर्धवृत्त से संख्या रेखा पर <b>√${txt(rad, false)}</b> बनाओ। <b>अगला चरण</b> दबाओ और देखो।`)}</p>
        <div class="nl-row nl-btns">
          <button type="button" class="nl-btn nl-back" data-key="jump:-"><span aria-hidden="true">◀</span><span>${esc(T('Back', 'पीछे'))}</span></button>
          <button type="button" class="nl-btn nl-fwd" data-key="jump:+"><span>${esc(T('Next step', 'अगला चरण'))}</span><span aria-hidden="true">▶</span></button>
          <button type="button" class="nl-btn nl-plain" data-key="reset">${esc(T('Start again', 'फिर से शुरू'))}</button></div>
        <div class="nl-eq" aria-live="polite"></div>
        <p class="nl-note"></p>
        <div class="nl-row" data-key="answer"><span class="nl-dim" style="font:600 1rem var(--font-body)">√${esc(txt(rad, false))} ≈</span>
          <input class="nl-in" type="text" inputmode="decimal" autocomplete="off" aria-label="${esc(T('Your answer to 2 decimal places', 'दो दशमलव स्थान तक तुम्हारा उत्तर'))}" placeholder="${esc(T('2 decimals', '2 दशमलव'))}">
          <button type="button" class="nl-btn nl-go">${esc(T('Check', 'जाँचो'))}</button></div>
        <p class="nl-fb" aria-live="polite"></p>
      </div></div>`;
    const svg = root.querySelector('svg'), eqEl = root.querySelector('.nl-eq'), noteEl = root.querySelector('.nl-note'), fbEl = root.querySelector('.nl-fb');
    const bF = root.querySelector('[data-key="jump:+"]'), bB = root.querySelector('[data-key="jump:-"]'), inp = root.querySelector('.nl-in');
    const digitsOf = (r, d) => { const n = nSqrt(r); return scaledStr(floorScaled(n, d), d); };

    // ---------- geometry in "units" then to pixels
    function geom(W) {
      let xmin = -0.4, xmax = Math.max(rNum(C.hi), 1.4) + 0.2, ymin = -0.2, ymax = 0.6;
      if (spiral) { sp.forEach((p) => { xmin = Math.min(xmin, p.x - 0.3); xmax = Math.max(xmax, p.x + 0.3); ymin = Math.min(ymin, p.y - 0.3); ymax = Math.max(ymax, p.y + 0.3); }); xmax = Math.max(xmax, Math.sqrt(x) + 0.4); }
      else { xmin = -0.6; xmax = x + 1.8; ymax = (x + 1) / 2 + 0.7; ymin = -0.3; xmax = Math.max(xmax, Math.sqrt(x) + 0.6); }
      xmin = Math.floor(xmin * 2) / 2;
      const pad = 24;
      let s = (W - 2 * pad) / (xmax - xmin);
      const hFor = (sc) => pad + ymax * sc + Math.max(0, -ymin) * sc + 62;
      if (hFor(s) > 520) s = (520 - pad - 62) / (ymax - Math.min(ymin, 0));
      s = Math.min(s, 130);
      const ox = pad + (W - 2 * pad - (xmax - xmin) * s) / 2 - xmin * s, oy = pad + ymax * s;
      return { s, ox, oy, H: Math.ceil(hFor(s)), W, xmin, xmax, pad };
    }
    const arcPts = (r, a0, a1, n) => { const out = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([r * Math.cos(a), r * Math.sin(a)]); } return out; };
    function paint() {
      const W = wOf(root); S.W = W;
      const G = geom(W), { s, ox, oy } = G;
      const PX = (px) => ox + px * s, PY = (py) => oy - py * s;
      const poly = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + PX(p[0]).toFixed(1) + ' ' + PY(p[1]).toFixed(1)).join(' ');
      let g = gradDefs(u);
      // the number line
      const xa = PX(G.xmin) - 4, xb = PX(G.xmax) + 4;
      g += `<line x1="${xa}" x2="${xb}" y1="${oy}" y2="${oy}" stroke="url(#${u}-pos)" stroke-width="8" stroke-linecap="round"/><path d="M${xb + 6} ${oy} l-11 -7 v14z" fill="#02CFF9"/>`;
      for (let k = Math.ceil(G.xmin); k <= Math.floor(G.xmax); k++) {
        g += `<line x1="${PX(k)}" x2="${PX(k)}" y1="${oy - 8}" y2="${oy + 8}" stroke="${INK}" stroke-width="2"/>`;
        if (s >= 24 || k % 2 === 0) g += `<text x="${PX(k)}" y="${oy + 28}" text-anchor="middle" class="nl-lab${k < 0 ? ' nl-neg' : ''}" style="font-size:14px">${sgn(String(k))}</text>`;
      }
      g += `<circle cx="${PX(0)}" cy="${oy}" r="5.5" fill="#fff" stroke="${INK}" stroke-width="2.6"/><text x="${PX(0) - 4}" y="${oy + 46}" text-anchor="end" class="nl-lab" style="font-size:14px">O</text>`;
      const cur = S.step, pr = S.p;
      const dots = []; // landings on the line
      if (spiral) {
        // unit segment O -> A
        g += `<path d="M${PX(0)} ${oy} L${PX(1)} ${oy}" stroke="#F5B90A" stroke-width="6" stroke-linecap="round"/>`;
        g += `<circle cx="${PX(1)}" cy="${oy}" r="5" fill="#F5B90A" stroke="${INK}" stroke-width="2"/>`;
        for (let i = 1; i <= cur; i++) {
          const q = i === cur ? pr : 1, A = sp[i - 1], B = sp[i];
          const Bq = { x: A.x + (B.x - A.x) * Math.min(1, q * 2), y: A.y + (B.y - A.y) * Math.min(1, q * 2) };
          const col = PAL[(i - 1) % PAL.length], isCur = i === cur;
          g += `<path d="M${PX(0)} ${PY(0)} L${PX(A.x)} ${PY(A.y)} L${PX(Bq.x)} ${PY(Bq.y)} ${q >= 0.5 ? 'Z' : ''}" fill="${col}" fill-opacity="${isCur ? 0.6 : 0.34}" stroke="${INK}" stroke-width="${isCur ? 2.2 : 1.3}" stroke-linejoin="round"/>`;
          // right-angle mark at A
          const ang = Math.atan2(A.y, A.x), ca = Math.cos(ang), sa = Math.sin(ang), m = 0.12;
          if (q >= 0.5) g += `<path d="M${PX(A.x - ca * m)} ${PY(A.y - sa * m)} L${PX(A.x - ca * m - sa * m)} ${PY(A.y - sa * m + ca * m)} L${PX(A.x - sa * m)} ${PY(A.y + ca * m)}" fill="none" stroke="${INK}" stroke-width="1.4"/>`;
          if (q >= 0.5 && (isCur || s > 50)) {
            const r2 = Math.hypot(B.x, B.y), mx = (B.x / 2) * 1, my = (B.y / 2) * 1;
            const nx = B.y / r2, ny = -B.x / r2; // outward-ish normal
            g += `<text x="${PX(mx + nx * 0.22)}" y="${PY(my + ny * 0.22) + 4}" text-anchor="middle" class="nl-pill" style="font-size:${isCur ? 14 : 12}px">√${i + 1}</text>`;
            const ux = (A.x + B.x) / 2, uy = (A.y + B.y) / 2;
            g += `<text x="${PX(ux + (ux / Math.hypot(ux, uy)) * 0.2)}" y="${PY(uy + (uy / Math.hypot(ux, uy)) * 0.2) + 4}" text-anchor="middle" class="nl-small" style="font-size:12px">1</text>`;
          }
          // the compass arc down to the line
          const r = Math.hypot(B.x, B.y), a1 = Math.atan2(B.y, B.x);
          let d = a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
          const prog = isCur ? Math.max(0, (q - 0.5) * 2) : 1;
          if (prog > 0) {
            const pts = arcPts(r, d, d - d * prog, Math.max(6, Math.round(Math.abs(d) * 14)));
            g += `<path d="${poly(pts)}" fill="none" stroke="${isCur ? '#8B3DFF' : '#8B3DFF99'}" stroke-width="${isCur ? 3 : 2}" stroke-dasharray="${isCur ? '7 5' : '4 5'}" stroke-linecap="round"/>`;
          }
          if (prog >= 1) dots.push({ v: Math.sqrt(i + 1), i, cur: isCur });
        }
      } else {
        const R2 = (x + 1) / 2;
        const sg = Math.sqrt(x);
        // step 1: P at x on the line; step 2: Q at x+1
        if (cur >= 1) { g += `<path d="M${PX(0)} ${oy - 12} L${PX(x)} ${oy - 12}" stroke="#F5B90A" stroke-width="5" stroke-linecap="round"/><circle cx="${PX(x)}" cy="${oy}" r="5.5" fill="#F5B90A" stroke="${INK}" stroke-width="2"/><text x="${PX(x)}" y="${oy + 48}" text-anchor="middle" class="nl-lab" style="font-size:14px">P</text><text x="${PX(x / 2)}" y="${oy - 20}" text-anchor="middle" class="nl-pill" style="font-size:13px">${esc(txt(rad, false))}</text>`; }
        if (cur >= 2) { const q2 = cur === 2 ? pr : 1; g += `<path d="M${PX(x)} ${oy - 12} L${PX(x + q2)} ${oy - 12}" stroke="#22C55E" stroke-width="5" stroke-linecap="round"/>${q2 >= 1 ? `<circle cx="${PX(x + 1)}" cy="${oy}" r="5.5" fill="#22C55E" stroke="${INK}" stroke-width="2"/><text x="${PX(x + 1)}" y="${oy + 48}" text-anchor="middle" class="nl-lab" style="font-size:14px">Q</text><text x="${PX(x + 0.5)}" y="${oy - 20}" text-anchor="middle" class="nl-pill" style="font-size:13px">1</text>` : ''}`; }
        if (cur >= 3) {
          const q3 = cur === 3 ? pr : 1;
          const pts = arcPts(R2, Math.PI, Math.PI - Math.PI * q3, 60).map((p) => [p[0] + R2, p[1]]);
          g += `<path d="${poly(pts)}" fill="${q3 >= 1 ? '#C4A5FF' : 'none'}" fill-opacity=".22" stroke="#8B3DFF" stroke-width="3.2" stroke-linecap="round"/><circle cx="${PX(R2)}" cy="${PY(0)}" r="3.5" fill="#8B3DFF"/>`;
        }
        if (cur >= 4) {
          const q4 = cur === 4 ? pr : 1;
          g += `<path d="M${PX(x)} ${oy} L${PX(x)} ${PY(sg * q4)}" stroke="#E5503C" stroke-width="4.2" stroke-linecap="round"/>`;
          if (q4 >= 1) g += `<circle cx="${PX(x)}" cy="${PY(sg)}" r="5.5" fill="#E5503C" stroke="${INK}" stroke-width="2"/><text x="${PX(x) + 10}" y="${PY(sg / 2) + 4}" class="nl-pill" style="font-size:14px;fill:#B42318">${esc(T('BD', 'BD'))}</text><text x="${PX(x) + 8}" y="${PY(sg) - 8}" class="nl-lab" style="font-size:14px">D</text>
            <path d="M${PX(x) - 10} ${oy} v-10 h10" fill="none" stroke="${INK}" stroke-width="1.4"/>`;
        }
        if (cur >= 5) {
          const q5 = cur === 5 ? pr : 1;
          g += `<path d="M${PX(0)} ${oy} L${PX(0)} ${PY(sg)}" stroke="#E5503C" stroke-width="3" stroke-dasharray="3 5" opacity=".55"/>`;
          const pts = arcPts(sg, Math.PI / 2, Math.PI / 2 - (Math.PI / 2) * q5, 40);
          g += `<path d="${poly(pts)}" fill="none" stroke="#8B3DFF" stroke-width="3.2" stroke-dasharray="7 5" stroke-linecap="round"/>`;
          if (q5 >= 1) dots.push({ v: sg, i: 0, cur: true });
        }
        g += `<text x="${PX(0) - 8}" y="${oy - 8}" text-anchor="end" class="nl-lab" style="font-size:13px"></text>`;
      }
      // the landing dots on the number line
      dots.forEach((d) => {
        const dx = PX(d.v);
        if (d.cur) g += `<g data-key="marker" role="img" aria-label="${esc(T('Point on the number line', 'संख्या रेखा पर बिंदु'))}"><circle cx="${dx}" cy="${oy}" r="9" fill="url(#${u}-pg)" stroke="${INK}" stroke-width="2.6"/><rect x="${dx - 28}" y="${oy + 36}" width="56" height="24" rx="12" fill="#fff" stroke="#8B3DFF" stroke-width="2.2"/><text x="${dx}" y="${oy + 53}" text-anchor="middle" class="nl-pill" style="font-size:14px;fill:#6D28D9">√${spiral ? d.i + 1 : esc(txt(rad, false))}</text></g>`;
        else g += `<circle cx="${dx}" cy="${oy}" r="4.5" fill="#8B3DFF" opacity=".75"><title>√${d.i + 1}</title></circle>`;
      });
      if (!svg.querySelector('[data-key=marker]') && !dots.some((d) => d.cur)) g += `<g data-key="marker" role="img" aria-label="${esc(T('Point on the number line', 'संख्या रेखा पर बिंदु'))}"><circle cx="${PX(spiral ? 1 : 0)}" cy="${oy}" r="1" fill="none"/></g>`;
      svg.setAttribute('viewBox', `0 0 ${W} ${G.H}`);
      svg.innerHTML = g;
    }
    function words() {
      const cur = S.step;
      let eq, note;
      if (spiral) {
        if (cur === 0) {
          eq = `<span>OA = 1</span><span class="nl-dim">${esc(T('one unit on the line', 'रेखा पर एक इकाई'))}</span>`;
          note = T('Start with the segment from 0 to 1. Its length is 1 unit. At its end we will build a right angle.', '0 से 1 तक का खंड लो। उसकी लंबाई 1 इकाई है। उसके सिरे पर हम समकोण बनाएँगे।');
        } else {
          const n = cur + 1, prev = cur;
          eq = `<span>${prev === 1 ? '1<sup>2</sup>' : `(√${prev})<sup>2</sup>`} + 1<sup>2</sup> = ${n}</span><span class="nl-res">⇒ OB = √${n}</span><span class="nl-dim">≈ ${esc(digitsOf(R(n), 6))}…</span>`;
          note = T(`Draw a line of length 1 at right angles to the last hypotenuse. By Pythagoras the new hypotenuse is √${n}. Put the compass point on O and swing the arc down to the line: it lands exactly on √${n}.`, `पिछले कर्ण से समकोण पर लंबाई 1 की रेखा खींचो। पाइथागोरस से नया कर्ण √${n} है। कंपास की नोक O पर रखकर चाप को रेखा तक घुमाओ: यह ठीक √${n} पर गिरता है।`);
          if (cur === N) note = { en: note.en + ` Done! √${n} is not a whole number or a fraction: its digits never end and never repeat.`, hi: note.hi + ` हो गया! √${n} न पूर्ण संख्या है, न भिन्न: इसके अंक न रुकते हैं, न दोहराते हैं।` };
        }
      } else {
        const xs = txt(rad, false);
        const dg = digitsOf(rad, 6);
        const NOTES = [
          T2(`We want √${xs}. First mark P at ${xs} on the line, measured from O.`, `हमें √${xs} चाहिए। पहले O से ${xs} दूरी पर रेखा पर P अंकित करो।`),
          T2(`Mark Q one unit to the right of P, so OQ = ${xs} + 1.`, `P से एक इकाई दाईं ओर Q अंकित करो, इसलिए OQ = ${xs} + 1।`),
          T2('Draw a semicircle with OQ as its diameter.', 'OQ को व्यास मानकर अर्धवृत्त खींचो।'),
          T2(`At P draw a line at right angles to OQ up to the semicircle, meeting it at D. In a semicircle, BD² = OP × PQ = ${xs} × 1, so PD = √${xs}.`, `P पर OQ से समकोण रेखा खींचो जो अर्धवृत्त को D पर मिले। अर्धवृत्त में PD² = OP × PQ = ${xs} × 1, इसलिए PD = √${xs}।`),
          T2(`Set the compass to the length PD, put its point on O and swing an arc to the number line. It lands exactly on √${xs} ≈ ${dg}…`, `कंपास को PD की लंबाई पर रखो, नोक O पर रखकर चाप को रेखा तक घुमाओ। यह ठीक √${xs} ≈ ${dg}… पर गिरता है।`),
        ];
        eq = cur === 0 ? `<span>${esc(T('Number under the root:', 'मूल के नीचे की संख्या:'))}</span><span class="nl-res">${esc(xs)}</span>` : cur < 4 ? `<span>OP = ${esc(xs)}</span><span>PQ = 1</span>` : cur === 4 ? `<span>PD² = ${esc(xs)} × 1</span><span class="nl-res">PD = √${esc(xs)}</span>` : `<span class="nl-res">√${esc(xs)} ≈ ${esc(dg)}…</span>`;
        note = cur === 0 ? T(`Press <b>Next step</b>. We will build a line of length √${xs} with a compass and ruler.`, `<b>अगला चरण</b> दबाओ। हम कंपास और पटरी से √${xs} लंबाई की रेखा बनाएँगे।`) : NOTES[cur - 1];
      }
      eqEl.innerHTML = eq;
      noteEl.innerHTML = typeof note === 'string' ? note : t(note);
      fbEl.className = 'nl-fb ' + (S.fbKind || '');
      fbEl.textContent = S.fb ? t(S.fb) : '';
      bB.disabled = cur <= 0 || !!S.stop; bF.disabled = cur >= N || !!S.stop;
      bF.setAttribute('aria-label', T(`Next step (step ${Math.min(N, cur + 1)} of ${N})`, `अगला चरण (${N} में से चरण ${Math.min(N, cur + 1)})`));
      bB.setAttribute('aria-label', T('Previous step', 'पिछला चरण'));
    }
    function go(dir) {
      const key = dir > 0 ? 'jump:+' : 'jump:-';
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (S.stop) return;
      const n = S.step + dir;
      if (n < 0 || n > N) return;
      S.fb = null; S.fbKind = '';
      if (dir < 0) { S.step = n; S.p = 1; paint(); words(); return; }
      S.step = n;
      const done = () => { S.stop = null; S.p = 1; paint(); words(); const name = spiral ? 'sqrt(' + (n + 1) + ')' : n === N ? 'sqrt(' + txt(rad, false) + ')' : 'step' + n; api.emit('landed:' + name); api.record(t(T2(`Construction step ${n}`, `रचना का चरण ${n}`))); };
      S.stop = tween(1100, (p) => { S.p = p; paint(); }, done);
      words();
    }
    function check() {
      if (!api.allowed('answer')) { api.nudge('answer'); return; }
      if (S.step < N) { S.fbKind = 'info'; S.fb = T2('Finish the construction first: press Next step until the last step.', 'पहले रचना पूरी करो: आख़िरी चरण तक अगला चरण दबाओ।'); words(); return; }
      let typed = null;
      try { const p = parseExpr(inp.value.replace(',', '.')); if (nIsRat(p.val)) typed = p.val.a; } catch (err) { typed = null; }
      if (!typed) { S.fbKind = 'info'; S.fb = T2('Type a number, like 1.41', 'कोई संख्या लिखो, जैसे 1.41'); words(); return; }
      const m = floorScaled(C.ask, 2), nx = floorScaled(C.ask, 3) - m * 10n;
      const expect = R(Number(nx >= 5n ? m + 1n : m), 100);
      if (rEq(typed, expect)) {
        S.fbKind = 'good'; S.fb = T2(`Yes! √${txt(rad, false)} is about ${scaledStr(nx >= 5n ? m + 1n : m, 2)}. The digits really go on for ever.`, `हाँ! √${txt(rad, false)} लगभग ${scaledStr(nx >= 5n ? m + 1n : m, 2)} है। इसके अंक सचमुच कभी नहीं रुकते।`);
        api.emit('answered:right'); api.celebrate(); api.record(t(T2('Answered right', 'सही उत्तर दिया')));
      } else {
        S.fbKind = 'bad'; S.fb = T2('Not yet. Round the long number to 2 decimal places: look at the third digit after the point.', 'अभी नहीं। लंबी संख्या को 2 दशमलव स्थान तक पूर्णांकित करो: बिंदु के बाद का तीसरा अंक देखो।');
        api.emit('answered:wrong'); api.record(t(T2('Answered wrong', 'गलत उत्तर दिया')));
      }
      words();
    }
    bF.addEventListener('click', () => go(1));
    bB.addEventListener('click', () => go(-1));
    root.querySelector('[data-key="reset"]').addEventListener('click', () => { if (!api.allowed('reset')) { api.nudge('reset'); return; } if (S.stop) S.stop(); S.stop = null; S.step = 0; S.p = 1; S.fb = null; S.fbKind = ''; paint(); words(); });
    root.querySelector('.nl-go').addEventListener('click', check);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
    paint(); words();
    const unwatch = watchSize(root, () => { if (!S.stop) paint(); });
    return { destroy() { if (S.stop) S.stop(); unwatch(); } };
  }

  // ================================================================ register
  NCA_T.register({
    id: 'number-line',
    css: CSS,
    validate(c) {
      try { return norm(c).e; } catch (err) { return ['config could not be read: ' + err.message]; }
    },
    keys(c) {
      try { return keysFor(c); } catch (err) { return { targets: ['marker'], events: [] }; }
    },
    demo: DEMO,
    mount(root, config, api) {
      const n = norm(config);
      if (!n.P) throw new Error('number-line: ' + n.e.join('; '));
      const P = n.P;
      if (P.mode === 'zoom') return mountZoom(root, P, api);
      if (P.mode === 'irrational') return mountIrr(root, P, api);
      return mountLine(root, P, api);
    },
  });
})();
