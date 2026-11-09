// Template: Code lab. Algorithms step by step: Scratch-like blocks driving a robot, flowcharts, tracing Python-like
// code, sorting (bubble, insertion, selection), searching (linear, binary), stacks, queues, recursion with its call
// stack and call tree, binary numbers, and logic gates with truth tables.
// The code is run by the template's own tiny interpreter (never eval): a safe subset of Python with variables, lists,
// print, if/elif/else, while, for … in range(…) or a list, repeat, def/return and recursion, with a step limit that
// stops infinite loops and a depth limit that stops runaway recursion. Sorting and searching frames are computed from
// the real algorithm on the given data, so a lab can never show an impossible step. Config:
//   { mode: 'blocks'|'flowchart'|'trace'|'sort'|'search'|'stack'|'queue'|'recursion'|'binary'|'boolean',
//     algorithm?: 'bubble'|'insertion'|'selection'|'linear'|'binary',  data?: [numbers],
//     program?: [lines of the tiny language], target?: number (search key, or the number to make in binary),
//     grid?: { size, start: [col, row, 'N'|'E'|'S'|'W'], goal: [col, row], walls: [[col, row]…] } (blocks),
//     capacity?: 2–8 (stack, queue), bits?: 4–8 (binary), expr?: 'A and not B' (boolean: and or not xor nand nor) }
(function () {
  const L = window.NCA_LIB;
  const { esc } = L;
  const T2 = (en, hi) => ({ en, hi });
  const cat = (a, b) => ({ en: a.en + b.en, hi: a.hi + b.hi });
  const MODES = ['blocks', 'flowchart', 'trace', 'sort', 'search', 'stack', 'queue', 'recursion', 'binary', 'boolean'];
  const ALGS = ['bubble', 'insertion', 'selection', 'linear', 'binary'];
  const SORTS = ['bubble', 'insertion', 'selection'];
  const SEARCHES = ['linear', 'binary'];
  const LIMIT = 1500, MAXDEPTH = 25, MAXLINES = 40;

  // ================================================================ the tiny interpreter (pure; no DOM)
  class PyErr { constructor(msg, line, kind) { this.msg = msg; this.line = line; this.kind = kind || 'error'; } }
  class Ret { constructor(v) { this.v = v; } }
  class Fl { constructor(v) { this.v = v; } }
  const BRK = { brk: 1 }, CONT = { cont: 1 };
  const isInt = (x) => typeof x === 'number' && Number.isInteger(x);
  const isNum = (x) => typeof x === 'number' || typeof x === 'boolean' || x instanceof Fl;
  const nv = (x) => (x instanceof Fl ? x.v : Number(x));
  const BIG = 9007199254740991;
  const fmtF = (v) => (!isFinite(v) ? (v > 0 ? 'inf' : v < 0 ? '-inf' : 'nan') : Number.isInteger(v) && Math.abs(v) < 1e16 ? v.toFixed(1) : String(v));
  function repr(x) {
    if (x === null || x === undefined) return 'None';
    if (x === true) return 'True';
    if (x === false) return 'False';
    if (x instanceof Fl) return fmtF(x.v);
    if (typeof x === 'number') return String(x);
    if (typeof x === 'string') return "'" + x.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
    if (Array.isArray(x)) return '[' + x.map(repr).join(', ') + ']';
    return String(x);
  }
  const str = (x) => (typeof x === 'string' ? x : repr(x));
  const tname = (x) => (x === null || x === undefined ? 'None' : typeof x === 'boolean' ? 'bool' : x instanceof Fl ? 'float' : typeof x === 'number' ? 'int' : typeof x === 'string' ? 'str' : Array.isArray(x) ? 'list' : 'value');
  const truthy = (x) => (x === null || x === undefined ? false : typeof x === 'boolean' ? x : isNum(x) ? nv(x) !== 0 : typeof x === 'string' || Array.isArray(x) ? x.length > 0 : true);
  const E = (en, hi, kind) => new PyErr(T2(en, hi), undefined, kind);
  const typeErr = (op, a, b) => E(`TypeError: ${op} cannot be used with ${tname(a)}${b === undefined ? '' : ' and ' + tname(b)}.`, `TypeError: ${op} को ${tname(a)}${b === undefined ? '' : ' और ' + tname(b)} के साथ नहीं लगा सकते।`);
  const bigErr = () => E('This number is too big for the lab to show exactly.', 'यह संख्या इतनी बड़ी है कि लैब इसे ठीक-ठीक नहीं दिखा सकती।');
  const mkN = (v, fl) => { if (fl) return new Fl(v); if (Math.abs(v) > BIG) throw bigErr(); return v; };
  function arith(op, a, b) {
    if (op === '+') {
      if (typeof a === 'string' && typeof b === 'string') return a + b;
      if (Array.isArray(a) && Array.isArray(b)) return a.concat(b);
    }
    if (op === '*') {
      if ((typeof a === 'string' || Array.isArray(a)) && isInt(b)) { if (b * a.length > 5000) throw bigErr(); return typeof a === 'string' ? a.repeat(Math.max(0, b)) : [].concat(...Array.from({ length: Math.max(0, b) }, () => a)); }
      if (isInt(a) && (typeof b === 'string' || Array.isArray(b))) return arith('*', b, a);
    }
    if (!isNum(a) || !isNum(b)) throw typeErr(op, a, b);
    const x = nv(a), y = nv(b), fl = a instanceof Fl || b instanceof Fl;
    const zero = () => E('ZeroDivisionError: you cannot divide by zero.', 'ZeroDivisionError: शून्य से भाग नहीं दे सकते।');
    switch (op) {
      case '+': return mkN(x + y, fl);
      case '-': return mkN(x - y, fl);
      case '*': return mkN(x * y, fl);
      case '/': if (y === 0) throw zero(); return new Fl(x / y);
      case '//': if (y === 0) throw zero(); return mkN(Math.floor(x / y), fl);
      case '%': if (y === 0) throw zero(); return mkN(x - y * Math.floor(x / y), fl);
      case '**': if (!fl && y >= 0) return mkN(Math.pow(x, y), false); if (x === 0 && y < 0) throw zero(); return new Fl(Math.pow(x, y));
    }
    throw typeErr(op, a, b);
  }
  function eq(a, b) {
    if (isNum(a) && isNum(b)) return nv(a) === nv(b);
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => eq(v, b[i]));
    return a === b;
  }
  function lt(a, b) {
    if (isNum(a) && isNum(b)) return nv(a) < nv(b);
    if (typeof a === 'string' && typeof b === 'string') return a < b;
    if (Array.isArray(a) && Array.isArray(b)) { for (let i = 0; i < Math.min(a.length, b.length); i++) { if (!eq(a[i], b[i])) return lt(a[i], b[i]); } return a.length < b.length; }
    throw typeErr('<', a, b);
  }
  function contains(c, x) {
    if (typeof c === 'string') { if (typeof x !== 'string') throw typeErr('in', x, c); return c.includes(x); }
    if (Array.isArray(c)) return c.some((v) => eq(v, x));
    throw typeErr('in', x, c);
  }
  function compare(op, a, b) {
    switch (op) {
      case '==': return eq(a, b);
      case '!=': return !eq(a, b);
      case '<': return lt(a, b);
      case '>': return lt(b, a);
      case '<=': return !lt(b, a);
      case '>=': return !lt(a, b);
      case 'in': return contains(b, a);
      case 'not in': return !contains(b, a);
    }
    return false;
  }
  function idx(a, i) {
    if (!(typeof a === 'string' || Array.isArray(a))) throw E(`TypeError: a ${tname(a)} cannot be indexed with [ ].`, `TypeError: ${tname(a)} में [ ] से स्थान नहीं चुन सकते।`);
    if (!isInt(i)) throw E('TypeError: a list position must be a whole number.', 'TypeError: सूची में स्थान पूर्ण संख्या होना चाहिए।');
    const k = i < 0 ? a.length + i : i;
    if (k < 0 || k >= a.length) throw E(`IndexError: position ${i} is outside the list (it has ${a.length} items, positions 0 to ${a.length - 1}).`, `IndexError: स्थान ${i} सूची से बाहर है (इसमें ${a.length} चीज़ें हैं, स्थान 0 से ${a.length - 1})।`);
    return k;
  }

  // ---------------------------------------------------------------- tokens and parsing
  const TOKRE = /(\d+\.\d*|\.\d+|\d+)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|([A-Za-z_][A-Za-z0-9_]*)|(\*\*|\/\/|==|!=|<=|>=|\+=|-=|\*=|\/=|[-+*/%<>=()[\],:.])/y;
  const KEYWORDS = new Set(['if', 'elif', 'else', 'while', 'for', 'in', 'def', 'return', 'and', 'or', 'not', 'True', 'False', 'None', 'break', 'continue', 'pass', 'repeat', 'import', 'class', 'lambda', 'global']);
  function tokenize(text, line) {
    const out = [];
    let i = 0;
    while (i < text.length) {
      if (text[i] === ' ' || text[i] === '\t') { i++; continue; }
      TOKRE.lastIndex = i;
      const m = TOKRE.exec(text);
      if (!m) throw new PyErr(T2(`SyntaxError: "${text[i]}" cannot be used here.`, `SyntaxError: "${text[i]}" यहाँ नहीं लिख सकते।`), line);
      out.push({ t: m[1] ? 'num' : m[2] ? 'str' : m[3] ? 'name' : 'op', v: m[0], p: i, e: i + m[0].length });
      i += m[0].length;
    }
    return out;
  }
  function stripComment(s) {
    let q = null;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '#') return s.slice(0, i);
    }
    return s;
  }
  const unq = (s) => s.slice(1, -1).replace(/\\(.)/g, (m, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
  const SYN = (line, en, hi) => new PyErr(T2('SyntaxError: ' + en, 'SyntaxError: ' + hi), line);
  function parseExpr(toks, text, line) {
    let i = 0;
    if (!toks.length) throw SYN(line, 'something is missing here.', 'यहाँ कुछ छूट गया है।');
    const isOp = (v) => toks[i] && toks[i].t === 'op' && toks[i].v === v;
    const isKw = (v) => toks[i] && toks[i].t === 'name' && toks[i].v === v;
    const pos = () => (toks[i] ? toks[i].p : text.length);
    const end = () => toks[i - 1].e;
    const nd = (o, s) => { o.src = text.slice(s, end()); return o; };
    const want = (v) => { if (!isOp(v)) throw SYN(line, `"${v}" is missing.`, `"${v}" छूट गया है।`); i++; };
    function args(close) {
      const a = [];
      if (isOp(close)) { i++; return a; }
      for (;;) { a.push(orE()); if (isOp(',')) { i++; if (isOp(close)) { i++; return a; } continue; } want(close); return a; }
    }
    function atom() {
      const s = pos(), t = toks[i];
      if (!t) throw SYN(line, 'the line ends too early.', 'पंक्ति बीच में ख़त्म हो गई।');
      i++;
      if (t.t === 'num') return nd({ k: 'num', v: Number(t.v), f: t.v.includes('.') }, s);
      if (t.t === 'str') return nd({ k: 'str', v: unq(t.v) }, s);
      if (t.t === 'name') {
        if (t.v === 'True' || t.v === 'False') return nd({ k: 'bool', v: t.v === 'True' }, s);
        if (t.v === 'None') return nd({ k: 'none' }, s);
        if (KEYWORDS.has(t.v)) throw SYN(line, `"${t.v}" cannot be used here.`, `"${t.v}" यहाँ नहीं लिख सकते।`);
        if (isOp('(')) { i++; const a = args(')'); return nd({ k: 'call', f: t.v, args: a }, s); }
        return nd({ k: 'name', v: t.v }, s);
      }
      if (t.v === '(') { const e = orE(); want(')'); return nd(Object.assign({}, e), s); }
      if (t.v === '[') return nd({ k: 'list', items: args(']') }, s);
      throw SYN(line, `"${t.v}" cannot be used here.`, `"${t.v}" यहाँ नहीं लिख सकते।`);
    }
    function post() {
      const s = pos();
      let a = atom();
      for (;;) {
        if (isOp('[')) { i++; const k = orE(); want(']'); a = nd({ k: 'idx', a, i: k }, s); }
        else if (isOp('.')) { i++; const m = toks[i]; if (!m || m.t !== 'name') throw SYN(line, 'a name is needed after ".".', '"." के बाद नाम चाहिए।'); i++; want('('); a = nd({ k: 'mcall', obj: a, m: m.v, args: args(')') }, s); }
        else return a;
      }
    }
    function power() { const s = pos(); const b = post(); if (isOp('**')) { i++; return nd({ k: 'bin', op: '**', a: b, b: unary() }, s); } return b; }
    function unary() { const s = pos(); if (isOp('-')) { i++; return nd({ k: 'neg', a: unary() }, s); } if (isOp('+')) { i++; return unary(); } return power(); }
    function mul() { const s = pos(); let a = unary(); while (isOp('*') || isOp('/') || isOp('//') || isOp('%')) { const op = toks[i++].v; a = nd({ k: 'bin', op, a, b: unary() }, s); } return a; }
    function add() { const s = pos(); let a = mul(); while (isOp('+') || isOp('-')) { const op = toks[i++].v; a = nd({ k: 'bin', op, a, b: mul() }, s); } return a; }
    function cmp() {
      const s = pos();
      const items = [add()], ops = [];
      for (;;) {
        let op = null;
        if (toks[i] && toks[i].t === 'op' && ['==', '!=', '<', '>', '<=', '>='].includes(toks[i].v)) { op = toks[i].v; i++; }
        else if (isKw('in')) { op = 'in'; i++; }
        else if (isKw('not') && toks[i + 1] && toks[i + 1].v === 'in') { op = 'not in'; i += 2; }
        if (!op) break;
        ops.push(op); items.push(add());
      }
      return ops.length ? nd({ k: 'cmp', ops, items }, s) : items[0];
    }
    function notE() { const s = pos(); if (isKw('not')) { i++; return nd({ k: 'not', a: notE() }, s); } return cmp(); }
    function andE() { const s = pos(); let a = notE(); while (isKw('and')) { i++; a = nd({ k: 'and', a, b: notE() }, s); } return a; }
    function orE() { const s = pos(); let a = andE(); while (isKw('or')) { i++; a = nd({ k: 'or', a, b: andE() }, s); } return a; }
    const e = orE();
    if (i < toks.length) throw SYN(line, `"${toks[i].v}" is not expected here.`, `"${toks[i].v}" यहाँ अपेक्षित नहीं है।`);
    return e;
  }
  function splitArgs(toks, text, line) {
    const out = [];
    let depth = 0, from = 0;
    toks.forEach((t, k) => { if (t.t === 'op') { if (t.v === '(' || t.v === '[') depth++; else if (t.v === ')' || t.v === ']') depth--; else if (t.v === ',' && depth === 0) { out.push(toks.slice(from, k)); from = k + 1; } } });
    out.push(toks.slice(from));
    return out.filter((x) => x.length).map((x) => parseExpr(x, text, line));
  }
  function parseStmt(r, ctx) {
    const toks = r.toks, line = r.line, text = r.text;
    const t0 = toks[0];
    const kw = t0.t === 'name' ? t0.v : null;
    const last = toks[toks.length - 1];
    const header = last.t === 'op' && last.v === ':';
    const X = (a, b) => parseExpr(toks.slice(a, b), text, line);
    const need = (ok, en, hi) => { if (!ok) throw SYN(line, en, hi); };
    const colon = () => need(header, 'this line must end with ":".', 'यह पंक्ति ":" पर ख़त्म होनी चाहिए।');
    const base = { line, src: text.replace(/:\s*$/, '') };
    if (kw === 'if' || kw === 'elif' || kw === 'while') { colon(); need(toks.length > 2, 'a condition is missing.', 'शर्त छूट गई है।'); return Object.assign(base, { k: kw, cond: X(1, toks.length - 1) }); }
    if (kw === 'else') { need(header && toks.length === 2, 'write else: on its own.', 'else: अकेला लिखो।'); return Object.assign(base, { k: 'else' }); }
    if (kw === 'for') {
      colon();
      need(toks[1] && toks[1].t === 'name' && !KEYWORDS.has(toks[1].v) && toks[2] && toks[2].v === 'in', 'write it like: for i in range(5):', 'ऐसे लिखो: for i in range(5):');
      return Object.assign(base, { k: 'for', name: toks[1].v, iter: X(3, toks.length - 1) });
    }
    if (kw === 'repeat') { colon(); let e = toks.length - 1; if (toks[e - 1] && toks[e - 1].v === 'times') e--; need(e > 1, 'how many times? write: repeat 4:', 'कितनी बार? लिखो: repeat 4:'); return Object.assign(base, { k: 'repeat', count: X(1, e) }); }
    if (kw === 'def') {
      colon();
      need(toks[1] && toks[1].t === 'name' && !KEYWORDS.has(toks[1].v) && toks[2] && toks[2].v === '(' && toks[toks.length - 2].v === ')', 'write it like: def name(a, b):', 'ऐसे लिखो: def name(a, b):');
      const ps = toks.slice(3, toks.length - 2).filter((t) => t.v !== ',');
      need(ps.every((t) => t.t === 'name' && !KEYWORDS.has(t.v)), 'the inputs of a function must be names.', 'फ़ंक्शन के इनपुट नाम होने चाहिए।');
      need(new Set(ps.map((t) => t.v)).size === ps.length, 'each input name only once.', 'हर इनपुट का नाम एक ही बार।');
      return Object.assign(base, { k: 'def', name: toks[1].v, params: ps.map((t) => t.v) });
    }
    need(!header, 'this line should not end with ":".', 'इस पंक्ति के अंत में ":" नहीं आता।');
    if (kw === 'return') { need(ctx.fn, 'return can be used only inside a function (def).', 'return केवल फ़ंक्शन (def) के अंदर लिख सकते हैं।'); return Object.assign(base, { k: 'return', e: toks.length > 1 ? X(1) : null }); }
    if (kw === 'break' || kw === 'continue') { need(ctx.loop && toks.length === 1, `${kw} can be used only inside a loop.`, `${kw} केवल लूप के अंदर लिख सकते हैं।`); return Object.assign(base, { k: kw }); }
    if (kw === 'pass') { need(toks.length === 1, 'write pass on its own.', 'pass अकेला लिखो।'); return Object.assign(base, { k: 'pass' }); }
    if (kw === 'print' && !(toks[1] && toks[1].v === '(' && toks[toks.length - 1].v === ')')) {
      return Object.assign(base, { k: 'expr', e: { k: 'call', f: 'print', args: splitArgs(toks.slice(1), text, line), src: text } });
    }
    if (kw === 'set' && toks[1] && toks[1].t === 'name' && toks[2] && (toks[2].v === '=' || toks[2].v === 'to')) {
      need(!KEYWORDS.has(toks[1].v), 'that name is a keyword.', 'यह नाम एक कीवर्ड है।');
      return Object.assign(base, { k: 'assign', t: { k: 'name', v: toks[1].v, src: toks[1].v }, op: '=', e: X(3) });
    }
    if (kw && KEYWORDS.has(kw) && !['not'].includes(kw)) throw SYN(line, `"${kw}" is not part of this lab's language.`, `"${kw}" इस लैब की भाषा में नहीं है।`);
    let depth = 0, at = -1;
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (t.t !== 'op') continue;
      if (t.v === '(' || t.v === '[') depth++;
      else if (t.v === ')' || t.v === ']') depth--;
      else if (depth === 0 && ['=', '+=', '-=', '*=', '/='].includes(t.v)) { at = k; break; }
    }
    if (at >= 0) {
      need(at > 0 && at < toks.length - 1, 'something is missing around "=".', '"=" के आसपास कुछ छूट गया है।');
      const lhs = X(0, at);
      need(lhs.k === 'name' || lhs.k === 'idx', 'the left of "=" must be a name, like x, or a list place, like a[2].', '"=" के बाईं ओर नाम (जैसे x) या सूची का स्थान (जैसे a[2]) होना चाहिए।');
      return Object.assign(base, { k: 'assign', t: lhs, op: toks[at].v, e: X(at + 1) });
    }
    const e = X(0);
    need(e.k === 'call' || e.k === 'mcall', 'this line does nothing. Did you mean "=" or print( )?', 'यह पंक्ति कुछ नहीं करती। क्या तुम "=" या print( ) लिखना चाहते थे?');
    return Object.assign(base, { k: 'expr', e });
  }
  function parseProgram(lines) {
    if (!Array.isArray(lines)) throw new PyErr(T2('program must be a list of lines.', 'program पंक्तियों की सूची होनी चाहिए।'), 0);
    const rows = [];
    lines.forEach((raw, i) => {
      if (typeof raw !== 'string') throw new PyErr(T2('each line must be text.', 'हर पंक्ति टेक्स्ट होनी चाहिए।'), i);
      const s = stripComment(raw).replace(/\s+$/, '');
      if (!s.trim()) return;
      const ind = s.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
      rows.push({ ind, text: s.trim(), line: i, toks: tokenize(s.trim(), i) });
    });
    const IND = (line) => SYN(line, 'this line is not lined up (indented) correctly.', 'यह पंक्ति सही जगह से शुरू (इंडेंट) नहीं हुई।');
    let k = 0;
    function block(ind, ctx) {
      const out = [];
      while (k < rows.length && rows[k].ind >= ind) {
        const r = rows[k];
        if (r.ind > ind) throw IND(r.line);
        k++;
        const s = parseStmt(r, ctx);
        if (s.k === 'elif' || s.k === 'else') {
          const prev = out[out.length - 1];
          if (!prev || prev.k !== 'if' || prev.closed) throw SYN(r.line, `"${s.k}" needs an "if" just above it, lined up with it.`, `"${s.k}" के ठीक ऊपर उसी सीध में "if" चाहिए।`);
          prev.branches.push({ cond: s.k === 'elif' ? s.cond : null, body: body(r, ctx), line: r.line, src: s.src });
          if (s.k === 'else') prev.closed = true;
          continue;
        }
        if (s.k === 'if') s.branches = [{ cond: s.cond, body: body(r, ctx), line: r.line, src: s.src }];
        else if (s.k === 'while' || s.k === 'for' || s.k === 'repeat') s.body = body(r, Object.assign({}, ctx, { loop: true }));
        else if (s.k === 'def') { if (ind > 0) throw SYN(r.line, 'write def at the left edge, not inside other code.', 'def को बाएँ किनारे से लिखो, किसी और कोड के अंदर नहीं।'); s.body = body(r, { fn: true }); }
        out.push(s);
      }
      return out;
    }
    function body(r, ctx) {
      if (k >= rows.length || rows[k].ind <= r.ind) throw SYN(r.line, 'a line ending in ":" needs lines under it, moved in (indented).', '":" पर ख़त्म होने वाली पंक्ति के नीचे अंदर की ओर (इंडेंट) पंक्तियाँ चाहिए।');
      return block(rows[k].ind, ctx);
    }
    if (rows.length && rows[0].ind > 0) throw IND(rows[0].line);
    const prog = block(0, {});
    if (k < rows.length) throw IND(rows[k].line);
    return prog;
  }

  // ---------------------------------------------------------------- running (generators: one yield per step)
  const top = (st) => st.frames[st.frames.length - 1];
  function tick(st, e) {
    st.steps++;
    if (st.steps > LIMIT) throw new PyErr(T2(`The program ran more than ${LIMIT} steps, so the lab stopped it. A loop whose condition never becomes False is an infinite loop.`, `प्रोग्राम ${LIMIT} से ज़्यादा क़दम चला, इसलिए लैब ने इसे रोक दिया। जिस लूप की शर्त कभी False नहीं होती, वह अनंत लूप है।`), top(st).line, 'limit');
    if (e.line == null) e.line = top(st).line;
    e.depth = st.frames.length - 1;
    return e;
  }
  function look(st, name) {
    const f = top(st);
    if (Object.prototype.hasOwnProperty.call(f.vars, name)) return f.vars[name];
    if (Object.prototype.hasOwnProperty.call(st.frames[0].vars, name)) return st.frames[0].vars[name];
    if (st.funcs[name] || BUILTIN[name]) throw E(`${name} is a function: call it with brackets, like ${name}( ).`, `${name} एक फ़ंक्शन है: इसे कोष्ठक के साथ बुलाओ, जैसे ${name}( )।`);
    throw E(`NameError: "${name}" has no value yet. Give it a value with = first.`, `NameError: "${name}" का अभी कोई मान नहीं है। पहले = से उसे मान दो।`);
  }
  function setVar(st, name, v) {
    const f = top(st);
    f.vars[name] = v;
    if (st.frames.length === 1 && !st.seen.includes(name)) st.seen.push(name);
  }
  const NUM = (x, f) => { if (!isNum(x)) throw typeErr(f, x); return x; };
  const seqOf = (args) => (args.length === 1 && Array.isArray(args[0]) ? args[0] : args);
  function bankers(v) { const f = Math.floor(v), d = v - f; if (Math.abs(d - 0.5) < 1e-12) return f % 2 === 0 ? f : f + 1; return Math.round(v); }
  const BUILTIN = {
    print: [0, 9, (a, st) => { const s = a.map(str).join(' '); if (st.out.length >= 200) throw E('The program printed too many lines for the lab.', 'प्रोग्राम ने लैब के लिए बहुत ज़्यादा पंक्तियाँ छापीं।'); st.out.push(s); st.printed = s; return null; }],
    len: [1, 1, ([x]) => { if (typeof x === 'string' || Array.isArray(x)) return x.length; throw typeErr('len( )', x); }],
    abs: [1, 1, ([x]) => { NUM(x, 'abs( )'); return x instanceof Fl ? new Fl(Math.abs(x.v)) : Math.abs(Number(x)); }],
    min: [1, 9, (a) => { const s = seqOf(a); if (!s.length) throw E('ValueError: min( ) of an empty list.', 'ValueError: ख़ाली सूची का min( ) नहीं होता।'); return s.reduce((m, v) => (lt(v, m) ? v : m)); }],
    max: [1, 9, (a) => { const s = seqOf(a); if (!s.length) throw E('ValueError: max( ) of an empty list.', 'ValueError: ख़ाली सूची का max( ) नहीं होता।'); return s.reduce((m, v) => (lt(m, v) ? v : m)); }],
    sum: [1, 1, ([s]) => { if (!Array.isArray(s)) throw typeErr('sum( )', s); return s.reduce((t, v) => arith('+', t, v), 0); }],
    int: [1, 1, ([x]) => { if (x instanceof Fl) return Math.trunc(x.v); if (isNum(x)) return Number(x); if (typeof x === 'string' && /^\s*[-+]?\d+\s*$/.test(x)) return parseInt(x, 10); throw E(`ValueError: int( ) cannot turn ${repr(x)} into a whole number.`, `ValueError: int( ) ${repr(x)} को पूर्ण संख्या नहीं बना सकता।`); }],
    float: [1, 1, ([x]) => { if (isNum(x)) return new Fl(nv(x)); if (typeof x === 'string' && /^\s*[-+]?(\d+\.?\d*|\.\d+)\s*$/.test(x)) return new Fl(parseFloat(x)); throw E(`ValueError: float( ) cannot turn ${repr(x)} into a number.`, `ValueError: float( ) ${repr(x)} को संख्या नहीं बना सकता।`); }],
    str: [1, 1, ([x]) => str(x)],
    round: [1, 2, ([x, n]) => { NUM(x, 'round( )'); if (n === undefined) return bankers(nv(x)); if (!isInt(n)) throw typeErr('round( )', n); const p = Math.pow(10, n); return new Fl(Math.round(nv(x) * p) / p); }],
    range: [1, 3, (a) => {
      if (!a.every(isInt)) throw E('TypeError: range( ) needs whole numbers.', 'TypeError: range( ) को पूर्ण संख्याएँ चाहिए।');
      const [s, e, d] = a.length === 1 ? [0, a[0], 1] : [a[0], a[1], a.length === 3 ? a[2] : 1];
      if (d === 0) throw E('ValueError: the step of range( ) cannot be 0.', 'ValueError: range( ) का क़दम 0 नहीं हो सकता।');
      const out = [];
      for (let v = s; d > 0 ? v < e : v > e; v += d) { out.push(v); if (out.length > 5000) throw bigErr(); }
      return out;
    }],
  };
  const ROBOT = { move: [0, 1], turn_left: [0, 0], turn_right: [0, 0], at_goal: [0, 0], wall_ahead: [0, 0] };
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const blocked = (w, x, y) => x < 0 || y < 0 || x >= w.size || y >= w.size || w.walls.has(x + ',' + y);
  function* robot(name, args, st) {
    const w = st.world;
    if (name === 'move') {
      const n = args.length ? args[0] : 1;
      if (!isInt(n) || n < 1 || n > 10) throw E('move( ) takes a whole number of squares from 1 to 10.', 'move( ) में 1 से 10 तक ख़ानों की पूर्ण संख्या दो।');
      for (let k = 0; k < n; k++) {
        const [dx, dy] = DIRS[w.dir];
        const x = w.x + dx, y = w.y + dy;
        if (blocked(w, x, y)) throw E('Bump! The robot cannot move into a wall or off the board.', 'धड़ाम! रोबोट दीवार में या बोर्ड से बाहर नहीं जा सकता।', 'bump');
        w.x = x; w.y = y; w.trail.push([x, y]);
        yield tick(st, { kind: 'move', x, y });
      }
      return null;
    }
    if (name === 'turn_left' || name === 'turn_right') { w.dir = (w.dir + (name === 'turn_left' ? 3 : 1)) % 4; yield tick(st, { kind: 'turn', side: name === 'turn_left' ? 'left' : 'right' }); return null; }
    if (name === 'at_goal') return w.x === w.goal[0] && w.y === w.goal[1];
    const [dx, dy] = DIRS[w.dir];
    return blocked(w, w.x + dx, w.y + dy);
  }
  function* callUser(fn, args, st) {
    if (args.length !== fn.params.length) throw E(`TypeError: ${fn.name}( ) needs ${fn.params.length} value(s) but got ${args.length}.`, `TypeError: ${fn.name}( ) को ${fn.params.length} मान चाहिए, पर ${args.length} मिले।`);
    if (st.frames.length > MAXDEPTH) throw E(`RecursionError: more than ${MAXDEPTH} calls are waiting inside each other. A recursive function needs a base case that stops it.`, `RecursionError: ${MAXDEPTH} से ज़्यादा कॉल एक-दूसरे के अंदर रुकी हैं। रिकर्सिव फ़ंक्शन को रुकने के लिए आधार स्थिति (base case) चाहिए।`, 'depth');
    const parent = top(st);
    const call = { id: st.calls.length + 1, parent: parent.id, name: fn.name, args: args.map(repr), ret: null, done: false };
    st.calls.push(call);
    const fr = { name: fn.name, vars: {}, line: fn.line, id: call.id, args: call.args, params: fn.params };
    fn.params.forEach((p, i) => { fr.vars[p] = args[i]; });
    st.frames.push(fr);
    yield tick(st, { kind: 'call', name: fn.name, args: call.args, id: call.id });
    let v = null;
    try { yield* runBlock(fn.body, st); } catch (x) { if (x instanceof Ret) v = x.v; else throw x; }
    st.frames.pop();
    call.ret = repr(v); call.done = true;
    yield tick(st, { kind: 'ret', name: fn.name, args: call.args, value: v, id: call.id });
    return v;
  }
  function* ev(n, st) {
    switch (n.k) {
      case 'num': return n.f ? new Fl(n.v) : n.v;
      case 'str': return n.v;
      case 'bool': return n.v;
      case 'none': return null;
      case 'name': return look(st, n.v);
      case 'list': { const a = []; for (const x of n.items) a.push(yield* ev(x, st)); return a; }
      case 'neg': { const v = yield* ev(n.a, st); if (!isNum(v)) throw typeErr('-', v); return v instanceof Fl ? new Fl(-v.v) : -Number(v); }
      case 'not': { const v = yield* ev(n.a, st); return !truthy(v); }
      case 'and': { const a = yield* ev(n.a, st); if (!truthy(a)) return a; return yield* ev(n.b, st); }
      case 'or': { const a = yield* ev(n.a, st); if (truthy(a)) return a; return yield* ev(n.b, st); }
      case 'bin': { const a = yield* ev(n.a, st); const b = yield* ev(n.b, st); return arith(n.op, a, b); }
      case 'cmp': {
        let a = yield* ev(n.items[0], st);
        for (let k = 0; k < n.ops.length; k++) { const b = yield* ev(n.items[k + 1], st); if (!compare(n.ops[k], a, b)) return false; a = b; }
        return true;
      }
      case 'idx': { const a = yield* ev(n.a, st); const i = yield* ev(n.i, st); return a[idx(a, i)]; }
      case 'call': {
        const args = [];
        for (const a of n.args) args.push(yield* ev(a, st));
        const f = n.f;
        if (st.funcs[f]) return yield* callUser(st.funcs[f], args, st);
        if (ROBOT[f]) {
          if (!st.world) throw E(`${f}( ) works only in the blocks lab, with the robot.`, `${f}( ) केवल ब्लॉक लैब में, रोबोट के साथ चलता है।`);
          if (args.length < ROBOT[f][0] || args.length > ROBOT[f][1]) throw E(`TypeError: ${f}( ) got the wrong number of values.`, `TypeError: ${f}( ) को ग़लत संख्या में मान मिले।`);
          return yield* robot(f, args, st);
        }
        const b = BUILTIN[f];
        if (b) { if (args.length < b[0] || args.length > b[1]) throw E(`TypeError: ${f}( ) got the wrong number of values.`, `TypeError: ${f}( ) को ग़लत संख्या में मान मिले।`); return b[2](args, st); }
        if (f === 'input') throw E('input( ) is not available here: put the value in the program instead.', 'input( ) यहाँ उपलब्ध नहीं है: मान सीधे प्रोग्राम में लिखो।');
        throw E(`NameError: there is no function called ${f}.`, `NameError: ${f} नाम का कोई फ़ंक्शन नहीं है।`);
      }
      case 'mcall': {
        const o = yield* ev(n.obj, st);
        const args = [];
        for (const a of n.args) args.push(yield* ev(a, st));
        const bad = () => E(`AttributeError: a ${tname(o)} has no ${n.m}( ) here.`, `AttributeError: ${tname(o)} में यहाँ ${n.m}( ) नहीं है।`);
        if (Array.isArray(o)) {
          if (n.m === 'append' && args.length === 1) { if (o.length >= 1000) throw bigErr(); o.push(args[0]); return null; }
          if (n.m === 'pop' && args.length <= 1) { if (!o.length) throw E('IndexError: pop from an empty list.', 'IndexError: ख़ाली सूची से pop नहीं कर सकते।'); const k = args.length ? idx(o, args[0]) : o.length - 1; return o.splice(k, 1)[0]; }
          if (n.m === 'insert' && args.length === 2 && isInt(args[0])) { o.splice(Math.max(0, Math.min(o.length, args[0] < 0 ? o.length + args[0] : args[0])), 0, args[1]); return null; }
          if (n.m === 'index' && args.length === 1) { const k = o.findIndex((v) => eq(v, args[0])); if (k < 0) throw E(`ValueError: ${repr(args[0])} is not in the list.`, `ValueError: ${repr(args[0])} सूची में नहीं है।`); return k; }
          if (n.m === 'count' && args.length === 1) return o.filter((v) => eq(v, args[0])).length;
        }
        if (typeof o === 'string' && !args.length && (n.m === 'upper' || n.m === 'lower')) return n.m === 'upper' ? o.toUpperCase() : o.toLowerCase();
        throw bad();
      }
    }
    throw E('This expression is not understood.', 'यह व्यंजक समझ नहीं आया।');
  }
  function* runBlock(stmts, st) { for (const s of stmts) yield* execOne(s, st); }
  function* execOne(s, st) {
    const fr = top(st);
    fr.line = s.line;
    switch (s.k) {
      case 'assign': {
        let v = yield* ev(s.e, st);
        if (s.op !== '=') { const cur = yield* ev(s.t, st); v = arith(s.op[0], cur, v); }
        if (s.t.k === 'name') setVar(st, s.t.v, v);
        else {
          const a = yield* ev(s.t.a, st);
          const i = yield* ev(s.t.i, st);
          if (!Array.isArray(a)) throw E(`TypeError: you cannot change one place of a ${tname(a)}.`, `TypeError: ${tname(a)} का एक स्थान नहीं बदल सकते।`);
          a[idx(a, i)] = v;
        }
        yield tick(st, { kind: 'assign', name: s.t.src, plain: s.t.k === 'name', value: v, base: s.t.k === 'name' ? s.t.v : s.t.a.src });
        return;
      }
      case 'expr': {
        const e = s.e;
        const v = yield* ev(e, st);
        if (e.k === 'call' && st.funcs[e.f]) return;
        if (e.k === 'call' && ROBOT[e.f] && e.f !== 'at_goal' && e.f !== 'wall_ahead') return;
        if (e.k === 'call' && e.f === 'print') { yield tick(st, { kind: 'print', text: st.printed }); return; }
        let objV = null;
        if (e.k === 'mcall') { try { objV = repr(yield* ev(e.obj, st)); } catch (x) { objV = null; } }
        yield tick(st, { kind: 'method', src: e.src, value: v, obj: e.k === 'mcall' ? e.obj.src : null, objV });
        return;
      }
      case 'if':
        for (const br of s.branches) {
          fr.line = br.line;
          if (br.cond) {
            const c = truthy(yield* ev(br.cond, st));
            yield tick(st, { kind: 'cond', src: br.cond.src, value: c, ctl: 'if' });
            if (c) { yield* runBlock(br.body, st); return; }
          } else {
            yield tick(st, { kind: 'else' });
            yield* runBlock(br.body, st);
            return;
          }
        }
        return;
      case 'while':
        for (;;) {
          fr.line = s.line;
          const c = truthy(yield* ev(s.cond, st));
          yield tick(st, { kind: 'cond', src: s.cond.src, value: c, ctl: 'while' });
          if (!c) return;
          try { yield* runBlock(s.body, st); } catch (x) { if (x === BRK) return; if (x !== CONT) throw x; }
        }
      case 'for': {
        const it = yield* ev(s.iter, st);
        let items;
        if (Array.isArray(it)) items = it.slice(); else if (typeof it === 'string') items = it.split(''); else throw E(`TypeError: a for loop cannot go through a ${tname(it)}.`, `TypeError: for लूप ${tname(it)} पर नहीं चल सकता।`);
        for (let k = 0; k < items.length; k++) {
          fr.line = s.line;
          setVar(st, s.name, items[k]);
          yield tick(st, { kind: 'for', name: s.name, value: items[k], k, n: items.length });
          try { yield* runBlock(s.body, st); } catch (x) { if (x === BRK) return; if (x !== CONT) throw x; }
        }
        fr.line = s.line;
        yield tick(st, { kind: 'forend', name: s.name });
        return;
      }
      case 'repeat': {
        const n = yield* ev(s.count, st);
        if (!isInt(n) || n < 0 || n > 1000) throw E('repeat needs a whole number of times, from 0 to 1000.', 'repeat में 0 से 1000 तक बार की पूर्ण संख्या चाहिए।');
        for (let k = 0; k < n; k++) {
          fr.line = s.line;
          yield tick(st, { kind: 'repeat', k: k + 1, n });
          try { yield* runBlock(s.body, st); } catch (x) { if (x === BRK) return; if (x !== CONT) throw x; }
        }
        fr.line = s.line;
        yield tick(st, { kind: 'repeatend', n });
        return;
      }
      case 'def': st.funcs[s.name] = s; yield tick(st, { kind: 'def', name: s.name, params: s.params }); return;
      case 'return': { const v = s.e ? yield* ev(s.e, st) : null; yield tick(st, { kind: 'return', value: v }); throw new Ret(v); }
      case 'break': yield tick(st, { kind: 'break' }); throw BRK;
      case 'continue': yield tick(st, { kind: 'continue' }); throw CONT;
      case 'pass': yield tick(st, { kind: 'pass' }); return;
    }
  }
  const DIRN = { N: 0, E: 1, S: 2, W: 3 };
  function mkWorld(g) {
    return { size: g.size, x: g.start[0], y: g.start[1], dir: DIRN[g.start[2] || 'E'], goal: g.goal.slice(), walls: new Set((g.walls || []).map((w) => w[0] + ',' + w[1])), trail: [[g.start[0], g.start[1]]] };
  }
  function runner(prog, o) {
    o = o || {};
    const st = { frames: [{ name: null, vars: {}, line: -1, id: 0 }], funcs: {}, out: [], printed: null, steps: 0, calls: [], seen: [], world: o.grid ? mkWorld(o.grid) : null };
    if (o.data) setVar(st, 'data', o.data.slice());
    const gen = runBlock(prog, st);
    let finished = false, error = null;
    return {
      st,
      get finished() { return finished; },
      get error() { return error; },
      next() {
        if (finished) return null;
        try {
          const r = gen.next();
          if (r.done) { finished = true; return { kind: 'end', line: -1, depth: 0 }; }
          return r.value;
        } catch (x) {
          finished = true;
          if (x instanceof PyErr) { if (x.line == null) x.line = top(st).line; error = x; return { kind: 'error', err: x, line: x.line, depth: st.frames.length - 1 }; }
          throw x;
        }
      },
    };
  }
  function runAll(prog, o) {
    const r = runner(prog, o);
    const events = [];
    for (let e = r.next(); e; e = r.next()) { events.push(e); if (e.kind === 'end' || e.kind === 'error') break; }
    return { st: r.st, error: r.error, events };
  }

  // ---------------------------------------------------------------- programs the template writes for an algorithm
  const lit = (a) => '[' + a.join(', ') + ']';
  function algProgram(mode, alg, data, x) {
    const A = 'a = ' + lit(data);
    if (mode === 'recursion') {
      if (alg === 'binary') return ['def search(a, x, lo, hi):', '    if lo > hi:', '        return -1', '    mid = (lo + hi) // 2', '    if a[mid] == x:', '        return mid', '    if a[mid] < x:', '        return search(a, x, mid + 1, hi)', '    return search(a, x, lo, mid - 1)', '', A, `print(search(a, ${x}, 0, len(a) - 1))`];
      return ['def find(a, x, i):', '    if i == len(a):', '        return -1', '    if a[i] == x:', '        return i', '    return find(a, x, i + 1)', '', A, `print(find(a, ${x}, 0))`];
    }
    if (alg === 'bubble') return [A, 'n = len(a)', 'for p in range(n - 1):', '    for j in range(n - 1 - p):', '        if a[j] > a[j + 1]:', '            t = a[j]', '            a[j] = a[j + 1]', '            a[j + 1] = t', 'print(a)'];
    if (alg === 'selection') return [A, 'n = len(a)', 'for i in range(n - 1):', '    m = i', '    for j in range(i + 1, n):', '        if a[j] < a[m]:', '            m = j', '    t = a[i]', '    a[i] = a[m]', '    a[m] = t', 'print(a)'];
    if (alg === 'insertion') return [A, 'for i in range(1, len(a)):', '    key = a[i]', '    j = i - 1', '    while j >= 0 and a[j] > key:', '        a[j + 1] = a[j]', '        j = j - 1', '    a[j + 1] = key', 'print(a)'];
    if (alg === 'linear') return [A, `x = ${x}`, 'found = -1', 'i = 0', 'while i < len(a) and found == -1:', '    if a[i] == x:', '        found = i', '    i = i + 1', 'print(found)'];
    return [A, `x = ${x}`, 'lo = 0', 'hi = len(a) - 1', 'found = -1', 'while lo <= hi and found == -1:', '    mid = (lo + hi) // 2', '    if a[mid] == x:', '        found = mid', '    elif a[mid] < x:', '        lo = mid + 1', '    else:', '        hi = mid - 1', 'print(found)'];
  }
  const DEFPROG = {
    trace: ['marks = [72, 85, 64, 90]', 'total = 0', 'best = marks[0]', 'for m in marks:', '    total = total + m', '    if m > best:', '        best = m', 'print("Total:", total)', 'print("Best:", best)'],
    flowchart: ['total = 0', 'i = 1', 'while i <= 4:', '    total = total + i', '    i = i + 1', 'print(total)'],
    recursion: ['def factorial(n):', '    if n <= 1:', '        return 1', '    return n * factorial(n - 1)', '', 'print(factorial(4))'],
    blocks: [],
  };
  const DEFGRID = { size: 5, start: [0, 4, 'E'], goal: [4, 0], walls: [[2, 4], [3, 4], [4, 4], [3, 3], [4, 3], [4, 2], [0, 1], [1, 0]] };
  const DEFDATA = { sort: [5, 2, 8, 1, 9, 3], linear: [7, 3, 9, 4, 1, 8], binary: [3, 8, 12, 19, 24, 31, 40, 47], stack: [10, 20, 30, 40], prog: [5, 2, 8, 1] };
  const isSearch = (c) => SEARCHES.includes(c.algorithm);
  const dataOf = (c) => (Array.isArray(c.data) ? c.data : c.mode === 'sort' ? DEFDATA.sort : c.mode === 'search' ? (c.algorithm === 'linear' ? DEFDATA.linear : DEFDATA.binary) : c.mode === 'stack' || c.mode === 'queue' ? DEFDATA.stack : c.algorithm === 'binary' ? DEFDATA.binary.slice(0, 6) : c.algorithm === 'linear' ? DEFDATA.linear.slice(0, 5) : DEFDATA.prog);
  const targetOf = (c) => (c.target != null ? c.target : c.mode === 'binary' ? 13 : (() => { const d = dataOf(c); return d[Math.min(d.length - 1, Math.floor(d.length * 0.7))]; })());
  const searchAlg = (c) => c.algorithm || 'binary';
  const sortAlg = (c) => c.algorithm || 'bubble';
  function progLines(c) {
    if (Array.isArray(c.program)) return c.program;
    if (c.algorithm) return algProgram(c.mode, c.algorithm, dataOf(c), targetOf(c));
    return DEFPROG[c.mode] || [];
  }
  const progOpts = (c) => ({ grid: c.mode === 'blocks' ? c.grid || DEFGRID : null, data: Array.isArray(c.program) && Array.isArray(c.data) ? c.data : null });

  // ================================================================ sorting and searching frames (pure)
  const PSEUDO = {
    bubble: ['for p in range(n - 1):', '    swapped = False', '    for j in range(n - 1 - p):', '        if a[j] > a[j + 1]:', '            a[j], a[j + 1] = a[j + 1], a[j]', '            swapped = True', '    if not swapped:', '        break'],
    selection: ['for i in range(n - 1):', '    m = i', '    for j in range(i + 1, n):', '        if a[j] < a[m]:', '            m = j', '    a[i], a[m] = a[m], a[i]'],
    insertion: ['for i in range(1, n):', '    key = a[i]', '    j = i - 1', '    while j >= 0 and a[j] > key:', '        a[j + 1] = a[j]', '        j = j - 1', '    a[j + 1] = key'],
    linear: ['for i in range(len(a)):', '    if a[i] == x:', '        return i', 'return -1'],
    binary: ['lo, hi = 0, len(a) - 1', 'while lo <= hi:', '    mid = (lo + hi) // 2', '    if a[mid] == x:', '        return mid', '    elif a[mid] < x:', '        lo = mid + 1', '    else:', '        hi = mid - 1', 'return -1'],
  };
  function sortFrames(alg, arr) {
    const a = arr.slice(), n = a.length, F = [];
    let cmp = 0, swp = 0;
    const done = new Set();
    const push = (o) => F.push(Object.assign({ a: a.slice(), cmp, swp, done: [...done] }, o));
    if (alg === 'bubble') {
      push({ line: -1, note: T2('Bubble sort compares neighbours and swaps them when the left one is bigger.', 'बबल सॉर्ट पड़ोसी संख्याओं की तुलना करता है और बाईं वाली बड़ी हो तो उन्हें अदल-बदल देता है।') });
      for (let p = 0; p < n - 1; p++) {
        let swapped = false;
        push({ line: 1, pass: p + 1, note: T2(`Pass ${p + 1} begins.`, `पास ${p + 1} शुरू।`) });
        for (let j = 0; j < n - 1 - p; j++) {
          cmp++;
          const big = a[j] > a[j + 1];
          push({ line: 3, pass: p + 1, cmpI: [j, j + 1], ptr: { j }, note: big ? T2(`Compare ${a[j]} and ${a[j + 1]}: ${a[j]} is bigger, so swap them.`, `${a[j]} और ${a[j + 1]} की तुलना: ${a[j]} बड़ा है, इसलिए अदला-बदली करो।`) : T2(`Compare ${a[j]} and ${a[j + 1]}: already in order, no swap.`, `${a[j]} और ${a[j + 1]} की तुलना: पहले से क्रम में हैं, अदला-बदली नहीं।`) });
          if (big) { const t = a[j]; a[j] = a[j + 1]; a[j + 1] = t; swp++; swapped = true; push({ line: 4, pass: p + 1, swapI: [j, j + 1], ptr: { j }, note: T2(`Swapped: ${a[j + 1]} moves right.`, `अदला-बदली: ${a[j + 1]} दाईं ओर गया।`) }); }
        }
        done.add(n - 1 - p);
        if (!swapped) {
          for (let k = 0; k < n; k++) done.add(k);
          push({ line: 7, pass: p + 1, note: T2('No swaps in this pass, so the list is already sorted: stop early.', 'इस पास में कोई अदला-बदली नहीं हुई, यानी सूची क्रम में है: जल्दी रुक जाओ।') });
          break;
        }
        push({ line: 6, pass: p + 1, note: T2(`End of pass ${p + 1}: the biggest unsorted number, ${a[n - 1 - p]}, has bubbled to its place.`, `पास ${p + 1} पूरा: बची हुई संख्याओं में सबसे बड़ी, ${a[n - 1 - p]}, अपनी जगह पहुँच गई।`) });
      }
    } else if (alg === 'selection') {
      push({ line: -1, note: T2('Selection sort finds the smallest number left and puts it at the front of the unsorted part.', 'सेलेक्शन सॉर्ट बची हुई सबसे छोटी संख्या ढूँढ़कर उसे बिना छँटे हिस्से के आगे रखता है।') });
      for (let i = 0; i < n - 1; i++) {
        let m = i;
        push({ line: 1, pass: i + 1, minI: m, ptr: { i }, note: T2(`Pass ${i + 1}: start by taking ${a[i]} as the smallest.`, `पास ${i + 1}: शुरू में ${a[i]} को सबसे छोटा मानो।`) });
        for (let j = i + 1; j < n; j++) {
          cmp++;
          const less = a[j] < a[m];
          push({ line: 3, pass: i + 1, cmpI: [j, m], minI: m, ptr: { i, j }, note: less ? T2(`${a[j]} is smaller than ${a[m]}.`, `${a[j]}, ${a[m]} से छोटा है।`) : T2(`${a[j]} is not smaller than ${a[m]}.`, `${a[j]}, ${a[m]} से छोटा नहीं है।`) });
          if (less) { m = j; push({ line: 4, pass: i + 1, minI: m, ptr: { i, j }, note: T2(`New smallest: ${a[m]}.`, `नया सबसे छोटा: ${a[m]}।`) }); }
        }
        if (m !== i) { const t = a[i]; a[i] = a[m]; a[m] = t; swp++; }
        done.add(i);
        push({ line: 5, pass: i + 1, swapI: m !== i ? [i, m] : null, ptr: { i }, note: m !== i ? T2(`Swap ${a[i]} into place ${i}.`, `${a[i]} को स्थान ${i} पर अदला-बदली से रखो।`) : T2(`${a[i]} is already in place ${i}.`, `${a[i]} पहले से स्थान ${i} पर है।`) });
      }
      done.add(n - 1);
    } else {
      push({ line: -1, prefix: 1, note: T2('Insertion sort takes the next number and slides it left into the sorted part, like arranging playing cards.', 'इंसर्शन सॉर्ट अगली संख्या उठाकर उसे छँटे हुए हिस्से में बाईं ओर सही जगह खिसकाता है, जैसे ताश के पत्ते लगाते हैं।') });
      for (let i = 1; i < n; i++) {
        const key = a[i];
        let j = i - 1;
        push({ line: 1, pass: i, prefix: i, key, hole: i, ptr: { i }, note: T2(`Take out key = ${key}.`, `key = ${key} बाहर निकालो।`) });
        for (;;) {
          if (j < 0) { push({ line: 3, pass: i, prefix: i, key, hole: j + 1, ptr: { i }, note: T2('j is below 0: nothing more on the left.', 'j, 0 से कम है: बाईं ओर कुछ नहीं बचा।') }); break; }
          cmp++;
          const big = a[j] > key;
          push({ line: 3, pass: i, prefix: i, key, hole: j + 1, cmpI: [j], ptr: { i, j }, note: big ? T2(`${a[j]} is bigger than ${key}: move it one place right.`, `${a[j]}, ${key} से बड़ा है: उसे एक जगह दाएँ खिसकाओ।`) : T2(`${a[j]} is not bigger than ${key}: stop here.`, `${a[j]}, ${key} से बड़ा नहीं है: यहीं रुको।`) });
          if (!big) break;
          a[j + 1] = a[j]; swp++;
          push({ line: 4, pass: i, prefix: i, key, hole: j, shiftI: j + 1, ptr: { i, j }, note: T2(`a[${j + 1}] = a[${j}]: ${a[j]} is copied one place right.`, `a[${j + 1}] = a[${j}]: ${a[j]} एक जगह दाएँ नक़ल हुआ।`) });
          j--;
        }
        a[j + 1] = key;
        push({ line: 6, pass: i, prefix: i + 1, placeI: j + 1, ptr: { i }, note: T2(`Put ${key} into place ${j + 1}.`, `${key} को स्थान ${j + 1} पर रखो।`) });
      }
      for (let k = 0; k < n; k++) done.add(k);
    }
    for (let k = 0; k < n; k++) done.add(k);
    push({ line: -1, final: true, note: T2(`Sorted! ${cmp} comparisons and ${swp} ${alg === 'insertion' ? 'shifts' : 'swaps'}.`, `छँट गया! ${cmp} तुलनाएँ और ${swp} ${alg === 'insertion' ? 'खिसकाव' : 'अदला-बदली'}।`) });
    return F;
  }
  function searchFrames(alg, a, x) {
    const F = [];
    let checks = 0;
    const push = (o) => F.push(Object.assign({ checks }, o));
    if (alg === 'linear') {
      push({ line: -1, out: [], note: T2(`Linear search looks at each box in turn, from the left, for ${x}.`, `लीनियर खोज बाएँ से हर डिब्बे को बारी-बारी देखती है, ${x} के लिए।`) });
      const out = [];
      for (let i = 0; i < a.length; i++) {
        checks++;
        const hit = a[i] === x;
        push({ line: 1, i, out: out.slice(), note: hit ? T2(`a[${i}] is ${a[i]}: found it!`, `a[${i}] = ${a[i]}: मिल गया!`) : T2(`a[${i}] is ${a[i]}, not ${x}. Move on.`, `a[${i}] = ${a[i]}, ${x} नहीं। आगे बढ़ो।`) });
        if (hit) { push({ line: 2, i, found: i, out: out.slice(), final: true, note: T2(`Found ${x} at position ${i} after looking at ${checks} box${checks > 1 ? 'es' : ''}.`, `${x} स्थान ${i} पर मिला, ${checks} डिब्बे देखने के बाद।`) }); return F; }
        out.push(i);
      }
      push({ line: 3, found: -1, out: out.slice(), final: true, note: T2(`${x} is not in the list: all ${checks} boxes were checked. The answer is -1.`, `${x} सूची में नहीं है: सभी ${checks} डिब्बे देखे गए। उत्तर -1 है।`) });
      return F;
    }
    let lo = 0, hi = a.length - 1;
    const out = [];
    push({ line: 0, lo, hi, out: [], note: T2(`Binary search works on a sorted list. lo = 0 and hi = ${hi}: ${x} could be anywhere.`, `बाइनरी खोज छँटी हुई सूची पर चलती है। lo = 0 और hi = ${hi}: ${x} कहीं भी हो सकता है।`) });
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      push({ line: 2, lo, hi, mid, out: out.slice(), note: T2(`mid = (${lo} + ${hi}) // 2 = ${mid}.`, `mid = (${lo} + ${hi}) // 2 = ${mid}।`) });
      checks++;
      if (a[mid] === x) { push({ line: 4, lo, hi, mid, found: mid, out: out.slice(), final: true, note: T2(`a[${mid}] is ${x}: found at position ${mid} after only ${checks} look${checks > 1 ? 's' : ''}.`, `a[${mid}] = ${x}: स्थान ${mid} पर मिला, केवल ${checks} बार देखकर।`) }); return F; }
      if (a[mid] < x) {
        for (let k = lo; k <= mid; k++) out.push(k);
        push({ line: 6, lo: mid + 1, hi, mid, out: out.slice(), note: T2(`${a[mid]} is less than ${x}, so ${x} can only be on the right. Throw away the left half: lo = ${mid + 1}.`, `${a[mid]}, ${x} से छोटा है, इसलिए ${x} केवल दाईं ओर हो सकता है। बायाँ आधा छोड़ो: lo = ${mid + 1}।`) });
        lo = mid + 1;
      } else {
        for (let k = mid; k <= hi; k++) out.push(k);
        push({ line: 8, lo, hi: mid - 1, mid, out: out.slice(), note: T2(`${a[mid]} is more than ${x}, so ${x} can only be on the left. Throw away the right half: hi = ${mid - 1}.`, `${a[mid]}, ${x} से बड़ा है, इसलिए ${x} केवल बाईं ओर हो सकता है। दायाँ आधा छोड़ो: hi = ${mid - 1}।`) });
        hi = mid - 1;
      }
    }
    push({ line: 9, lo, hi, found: -1, out: out.slice(), final: true, note: T2(`lo is now bigger than hi: nothing is left to check, so ${x} is not in the list (-1). It took ${checks} looks.`, `अब lo, hi से बड़ा है: देखने को कुछ नहीं बचा, इसलिए ${x} सूची में नहीं है (-1)। ${checks} बार देखना पड़ा।`) });
    return F;
  }

  // ================================================================ logic expressions (boolean mode)
  function parseLogic(s) {
    const toks = String(s).match(/\(|\)|[A-Za-z]+|\S/g) || [];
    let i = 0;
    const peek = () => toks[i], is = (v) => toks[i] && toks[i].toLowerCase() === v;
    const fail = (m) => { throw new Error(m); };
    function atom() {
      const t = toks[i++];
      if (t === undefined) fail('the expression ends too early');
      if (t === '(') { const e = orE(); if (toks[i++] !== ')') fail('a ")" is missing'); return e; }
      if (/^[ABCD]$/.test(t)) return { k: 'var', v: t };
      if (t.toLowerCase() === 'not') return { k: 'not', a: atom() };
      return fail(`"${t}" is not allowed (use A, B, C, and, or, not, xor, nand, nor and brackets)`);
    }
    function andE() { let a = atom(); while (is('and') || is('nand')) { const op = toks[i++].toLowerCase(); a = { k: op, a, b: atom() }; } return a; }
    function xorE() { let a = andE(); while (is('xor')) { i++; a = { k: 'xor', a, b: andE() }; } return a; }
    function orE() { let a = xorE(); while (is('or') || is('nor')) { const op = toks[i++].toLowerCase(); a = { k: op, a, b: xorE() }; } return a; }
    const e = orE();
    if (i < toks.length) fail(`"${peek()}" is not expected here`);
    return e;
  }
  function logicEval(n, v) {
    switch (n.k) {
      case 'var': return v[n.v] ? 1 : 0;
      case 'not': return 1 - logicEval(n.a, v);
      case 'and': return logicEval(n.a, v) & logicEval(n.b, v);
      case 'or': return logicEval(n.a, v) | logicEval(n.b, v);
      case 'xor': return logicEval(n.a, v) ^ logicEval(n.b, v);
      case 'nand': return 1 - (logicEval(n.a, v) & logicEval(n.b, v));
      case 'nor': return 1 - (logicEval(n.a, v) | logicEval(n.b, v));
    }
    return 0;
  }
  const logicVars = (n, s) => { s = s || new Set(); if (n.k === 'var') s.add(n.v); else { if (n.a) logicVars(n.a, s); if (n.b) logicVars(n.b, s); } return s; };
  const gateCount = (n) => (n.k === 'var' ? 0 : 1 + gateCount(n.a) + (n.b ? gateCount(n.b) : 0));
  const leafCount = (n) => (n.k === 'var' ? 1 : leafCount(n.a) + (n.b ? leafCount(n.b) : 0));
  const logicDepth = (n) => (n.k === 'var' ? 0 : 1 + Math.max(logicDepth(n.a), n.b ? logicDepth(n.b) : 0));
  const DEFEXPR = '(A and B) or not C';
  const varsOf = (expr) => [...logicVars(parseLogic(expr))].sort();
  const rowsOf = (vars) => Array.from({ length: 1 << vars.length }, (_, r) => Object.fromEntries(vars.map((v, i) => [v, (r >> (vars.length - 1 - i)) & 1])));

  // ================================================================ questions (pure)
  function seededOpts(right, wrongs, seed) {
    const seen = new Set([String(right)]);
    const w = [];
    for (const x of wrongs) { const s = String(x); if (!seen.has(s)) { seen.add(s); w.push(x); } if (w.length === 3) break; }
    const opts = w.slice();
    const at = Math.abs(seed) % (opts.length + 1);
    opts.splice(at, 0, right);
    return { options: opts.map(String), answer: at };
  }
  const hashS = (s) => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 100003; return h; };
  const YES = T2('Yes', 'हाँ'), NO = T2('No', 'नहीं');
  function progQuestion(c) {
    let prog;
    try { prog = parseProgram(progLines(c)); } catch (x) { return null; }
    const R = runAll(prog, progOpts(c));
    if (c.mode === 'blocks') {
      if (!Array.isArray(c.program) || !c.program.some((l) => l.trim())) return null;
      const w = R.st.world, ok = !R.error && w.x === w.goal[0] && w.y === w.goal[1];
      const bump = R.error && R.error.kind === 'bump';
      return { q: T2('Will the starting program take the robot to the star?', 'क्या शुरुआती प्रोग्राम रोबोट को तारे तक पहुँचाएगा?'), options: [YES, NO], answer: ok ? 0 : 1,
        why: ok ? T2('Yes: follow the blocks one by one on the board and the robot ends on the star.', 'हाँ: बोर्ड पर ब्लॉक एक-एक करके चलाओ, रोबोट तारे पर पहुँचता है।') : bump ? T2('No: on the way the robot bumps into a wall, and the program stops.', 'नहीं: रास्ते में रोबोट दीवार से टकराता है और प्रोग्राम रुक जाता है।') : T2('No: the blocks finish with the robot on another square.', 'नहीं: ब्लॉक ख़त्म होने पर रोबोट किसी और ख़ाने पर होता है।') };
    }
    if (R.error) {
      if (R.error.kind === 'limit') return { q: T2('Will this program stop on its own?', 'क्या यह प्रोग्राम अपने-आप रुकेगा?'), options: [YES, NO], answer: 1, why: T2('No: the loop condition never becomes False, so the loop would go on for ever. The lab stops it.', 'नहीं: लूप की शर्त कभी False नहीं होती, इसलिए लूप हमेशा चलता रहता। लैब उसे रोक देती है।') };
      if (R.error.kind === 'depth') return { q: T2('Will the function stop calling itself?', 'क्या फ़ंक्शन ख़ुद को बुलाना बंद करेगा?'), options: [YES, NO], answer: 1, why: T2('No: no base case is ever reached, so the calls pile up until Python gives a RecursionError.', 'नहीं: आधार स्थिति कभी नहीं आती, इसलिए कॉल ढेर होती जाती हैं जब तक RecursionError न आए।') };
      return null;
    }
    if (c.mode === 'recursion' && R.st.calls.length) {
      const calls = R.st.calls, first = calls.find((k) => k.parent === 0);
      const kids = (id) => calls.filter((k) => k.parent === id).length;
      const branching = calls.some((k) => kids(k.id) > 1);
      let depth = 0;
      calls.forEach((k) => { let d = 1, p = k.parent; while (p) { d++; p = calls[p - 1].parent; } depth = Math.max(depth, d); });
      if (branching) {
        const n = calls.length;
        const o = seededOpts(n, [depth, n - 1, n + 1, 2 * depth, n + 2], hashS(n + first.name));
        return { q: T2(`How many times is ${first.name}( ) called in all, counting the first call?`, `पहली कॉल समेत ${first.name}( ) कुल कितनी बार बुलाया जाता है?`), options: o.options, answer: o.answer, why: T2(`${n} calls: each call that is not a base case makes more calls, so the call tree branches. Count the boxes in the tree.`, `${n} कॉल: आधार स्थिति के अलावा हर कॉल और कॉल करती है, इसलिए कॉल ट्री में शाखाएँ बनती हैं। ट्री के डिब्बे गिनो।`) };
      }
      const label = `${first.name}(${first.args.map((a) => (a.length > 12 ? '…' : a)).join(', ')})`;
      const rets = calls.map((k) => k.ret).filter((r) => r !== first.ret).reverse();
      const num = Number(first.ret);
      const o = seededOpts(first.ret, rets.concat(isFinite(num) ? [num + 1, num - 1, num * 2] : []), hashS(label));
      return { q: T2(`What does ${label} give back (return)?`, `${label} क्या लौटाता (return करता) है?`), options: o.options, answer: o.answer, why: T2(`It returns ${first.ret}: the deepest call returns first, and each waiting call uses that answer to finish its own.`, `यह ${first.ret} लौटाता है: सबसे अंदर की कॉल पहले लौटती है, और हर रुकी हुई कॉल उसी उत्तर से अपना काम पूरा करती है।`) };
    }
    const counts = {}, hist = {};
    R.events.forEach((e) => { if (e.kind === 'assign' && e.plain && e.depth === 0) { counts[e.name] = (counts[e.name] || 0) + 1; (hist[e.name] = hist[e.name] || []).push(e.value); } });
    const g = R.st.frames[0].vars;
    let best = null;
    R.st.seen.forEach((nm) => { if (counts[nm] && isInt(g[nm]) && (!best || counts[nm] > counts[best])) best = nm; });
    if (best && counts[best] > 1) {
      const v = g[best];
      const prior = hist[best].slice().reverse().filter((x) => isInt(x) && x !== v);
      const o = seededOpts(v, prior.slice(0, 2).concat([v + 1, v - 1, prior[2] != null ? prior[2] : v + 2]), hashS(best + v));
      return { q: T2(`When the program ends, what is the value of ${best}?`, `प्रोग्राम ख़त्म होने पर ${best} का मान क्या होगा?`), options: o.options, answer: o.answer, why: T2(`${best} is given a new value ${counts[best]} times; the last one is ${v}. Step through and watch the variables box.`, `${best} को ${counts[best]} बार नया मान मिलता है; आख़िरी मान ${v} है। क़दम-दर-क़दम चलाकर वेरिएबल वाला डिब्बा देखो।`) };
    }
    if (R.st.out.length) {
      const last = R.st.out[R.st.out.length - 1];
      const n = R.st.out.length;
      const o = seededOpts(n, [n + 1, n - 1 || n + 2, n + 2], hashS(last));
      return { q: T2('How many lines does the program print?', 'प्रोग्राम कितनी पंक्तियाँ छापता (print करता) है?'), options: o.options, answer: o.answer, why: T2(`It prints ${n} line${n > 1 ? 's' : ''}: each print( ) that runs makes one line. A print inside a loop runs once per round.`, `यह ${n} पंक्ति छापता है: हर चलने वाला print( ) एक पंक्ति बनाता है। लूप के अंदर का print हर चक्कर में एक बार चलता है।`) };
    }
    return null;
  }
  function question(c) {
    const m = c.mode;
    if (m === 'trace' || m === 'flowchart' || m === 'recursion' || m === 'blocks') return progQuestion(c);
    if (m === 'sort') {
      const a = dataOf(c), alg = sortAlg(c), s = a.slice().sort((x, y) => x - y), n = a.length;
      if (alg === 'bubble') { const o = seededOpts(s[n - 1], [a[n - 1], a[0], s[n - 2], s[0]], hashS(a.join())); return { q: T2('After the first pass of bubble sort, which number is at the far right?', 'बबल सॉर्ट के पहले पास के बाद सबसे दाईं ओर कौन-सी संख्या होगी?'), options: o.options, answer: o.answer, why: T2(`${s[n - 1]}: in each pass the biggest unsorted number keeps winning the comparisons and bubbles all the way to the right.`, `${s[n - 1]}: हर पास में बची हुई सबसे बड़ी संख्या हर तुलना जीतकर सबसे दाईं ओर पहुँच जाती है।`) }; }
      if (alg === 'selection') { const o = seededOpts(s[0], [a[0], s[1], s[n - 1], a[1]], hashS(a.join())); return { q: T2('After the first pass of selection sort, which number is at the far left?', 'सेलेक्शन सॉर्ट के पहले पास के बाद सबसे बाईं ओर कौन-सी संख्या होगी?'), options: o.options, answer: o.answer, why: T2(`${s[0]}: the first pass looks through the whole list for the smallest number and swaps it to the front.`, `${s[0]}: पहला पास पूरी सूची में सबसे छोटी संख्या ढूँढ़कर उसे सबसे आगे रख देता है।`) }; }
      let inv = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (a[i] > a[j]) inv++;
      const o = seededOpts(inv, [n - 1, inv + 1, (n * (n - 1)) / 2, inv - 1, inv + 2].filter((x) => x >= 0), hashS(a.join()));
      return { q: T2('How many times will insertion sort shift a number one place right?', 'इंसर्शन सॉर्ट कितनी बार कोई संख्या एक जगह दाएँ खिसकाएगा?'), options: o.options, answer: o.answer, why: T2(`${inv}: every pair of numbers that is in the wrong order needs exactly one shift to fix it.`, `${inv}: ग़लत क्रम वाले हर जोड़े को ठीक करने के लिए ठीक एक खिसकाव चाहिए।`) };
    }
    if (m === 'search') {
      const F = searchFrames(searchAlg(c), dataOf(c), targetOf(c));
      const k = F[F.length - 1].checks, n = dataOf(c).length;
      const o = seededOpts(k, [n, k + 1, k - 1 > 0 ? k - 1 : k + 2, Math.ceil(n / 2)], hashS(String(targetOf(c)) + n));
      return { q: T2(`How many boxes will ${searchAlg(c)} search look at to finish the search for ${targetOf(c)}?`, `${targetOf(c)} की खोज पूरी करने के लिए ${searchAlg(c) === 'linear' ? 'लीनियर' : 'बाइनरी'} खोज कितने डिब्बे देखेगी?`), options: o.options, answer: o.answer, why: searchAlg(c) === 'linear' ? T2(`${k}: linear search checks the boxes one by one from the left until it finds ${targetOf(c)} or runs out.`, `${k}: लीनियर खोज बाएँ से एक-एक डिब्बा देखती है जब तक ${targetOf(c)} न मिले या डिब्बे ख़त्म न हों।`) : T2(`${k}: each look at the middle box throws away half of what is left, so very few looks are needed.`, `${k}: बीच वाले डिब्बे को हर बार देखने से बचे हुए का आधा हिस्सा हट जाता है, इसलिए बहुत कम बार देखना पड़ता है।`) };
    }
    if (m === 'stack' || m === 'queue') {
      const d = dataOf(c);
      if (d.length < 3) return null;
      const st = m === 'stack';
      const right = st ? d[1] : d[1];
      const o = seededOpts(right, [d[0], d[2]], hashS(d.join() + m));
      return st
        ? { q: T2(`Push ${d[0]}, then ${d[1]}, then ${d[2]}. Then pop once. What is on top now?`, `${d[0]}, फिर ${d[1]}, फिर ${d[2]} को push करो। फिर एक बार pop करो। अब सबसे ऊपर क्या है?`), options: o.options, answer: o.answer, why: T2(`${d[1]}: pop takes off the last one pushed (${d[2]}), so the one under it is now on top. Last in, first out.`, `${d[1]}: pop सबसे आख़िर में डाला गया (${d[2]}) निकालता है, तो उसके नीचे वाला अब ऊपर है। अंत में आया, पहले गया।`) }
        : { q: T2(`Enqueue ${d[0]}, then ${d[1]}, then ${d[2]}. Then dequeue once. What is at the front now?`, `${d[0]}, फिर ${d[1]}, फिर ${d[2]} को enqueue करो। फिर एक बार dequeue करो। अब सबसे आगे क्या है?`), options: o.options, answer: o.answer, why: T2(`${d[1]}: dequeue takes the one that joined first (${d[0]}), so the next in line is at the front. First in, first out.`, `${d[1]}: dequeue सबसे पहले आए (${d[0]}) को निकालता है, तो पंक्ति में अगला अब आगे है। पहले आया, पहले गया।`) };
    }
    if (m === 'binary') {
      const n = targetOf(c), bits = c.bits || 8, b = n.toString(2).padStart(bits, '0');
      const flip = (s, k) => s.slice(0, k) + (s[k] === '0' ? '1' : '0') + s.slice(k + 1);
      const o = seededOpts(b, [b.split('').reverse().join(''), flip(b, bits - 1), flip(b, bits - 2), (n + 1).toString(2).padStart(bits, '0')], hashS(b));
      return { q: T2(`What is ${n} in binary (${bits} bits)?`, `${n} बाइनरी में (${bits} बिट) क्या है?`), options: o.options, answer: o.answer, why: T2(`${b}: add the place values of the 1s and you get ${n}. Keep dividing by 2 and read the remainders from the last to the first.`, `${b}: 1 वाले स्थानीय मान जोड़ो तो ${n} आता है। बार-बार 2 से भाग दो और शेषफल आख़िरी से पहले की ओर पढ़ो।`) };
    }
    if (m === 'boolean') {
      const ex = c.expr || DEFEXPR, ast = parseLogic(ex), vars = varsOf(ex), rows = rowsOf(vars);
      const ones = rows.filter((r) => logicEval(ast, r)).length, N = rows.length;
      const o = seededOpts(ones, [N - ones, ones + 1, ones - 1, N].filter((x) => x >= 0 && x <= N), hashS(ex));
      return { q: T2(`In how many of the ${N} rows of the truth table is the output 1?`, `सत्य सारणी की ${N} पंक्तियों में से कितनी में आउटपुट 1 है?`), options: o.options, answer: o.answer, why: T2(`${ones}: try every row (press Step) and count the rows where the lamp lights.`, `${ones}: हर पंक्ति आज़माओ (क़दम दबाओ) और गिनो कि कितनी पंक्तियों में बल्ब जलता है।`) };
    }
    return null;
  }

  // ================================================================ validation (pure)
  const ALLOW = { blocks: ['program', 'grid'], flowchart: ['program', 'algorithm', 'data', 'target'], trace: ['program', 'algorithm', 'data', 'target'], recursion: ['program', 'algorithm', 'data', 'target'], sort: ['algorithm', 'data'], search: ['algorithm', 'data', 'target'], stack: ['data', 'capacity'], queue: ['data', 'capacity'], binary: ['target', 'bits'], boolean: ['expr'] };
  function flowCheck(stmts, depth, e) {
    let shapes = 0;
    for (const s of stmts) {
      if (['def', 'return', 'break', 'continue'].includes(s.k)) e.push(`program line ${s.line + 1}: ${s.k} cannot be drawn in a flowchart here (use the trace or recursion mode)`);
      shapes++;
      const bodies = s.k === 'if' ? s.branches.map((b) => b.body) : s.body ? [s.body] : [];
      if (bodies.length && depth >= 3) e.push(`program line ${s.line + 1}: too deeply nested for a flowchart (3 levels at most)`);
      bodies.forEach((b) => { shapes += flowCheck(b, depth + 1, e); });
      if (s.k === 'if') shapes += s.branches.length - 1;
    }
    return shapes;
  }
  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
    if (!MODES.includes(c.mode)) return [`mode must be one of ${MODES.join(', ')}`];
    const m = c.mode;
    Object.keys(c).forEach((k) => { if (k !== 'mode' && !ALLOW[m].includes(k)) e.push(`${k} is not used in ${m} mode (use ${ALLOW[m].join(', ')})`); });
    if (e.length) return e;
    const ints = (a, lo, hi, n1, n2, what) => {
      if (!Array.isArray(a) || a.length < n1 || a.length > n2) { e.push(`${what}: a list of ${n1} to ${n2} numbers`); return false; }
      if (!a.every((x) => Number.isInteger(x) && x >= lo && x <= hi)) { e.push(`${what}: whole numbers from ${lo} to ${hi}`); return false; }
      return true;
    };
    if (c.algorithm != null) {
      if (!ALGS.includes(c.algorithm)) e.push(`unknown algorithm: ${c.algorithm} (use ${ALGS.join(', ')})`);
      else if (m === 'sort' && !SORTS.includes(c.algorithm)) e.push(`sort mode takes a sorting algorithm: ${SORTS.join(', ')}`);
      else if (m === 'search' && !SEARCHES.includes(c.algorithm)) e.push(`search mode takes a searching algorithm: ${SEARCHES.join(', ')}`);
      else if (m === 'recursion' && !SEARCHES.includes(c.algorithm)) e.push('recursion mode can write a recursive linear or binary search; for anything else give a program');
      if (c.program != null) e.push('give either program or algorithm, not both');
    }
    if (c.target != null && !Number.isInteger(c.target)) e.push('target: a whole number');
    if (['trace', 'flowchart', 'recursion'].includes(m) && c.target != null && !isSearch(c)) e.push('target is used only with a search algorithm (linear or binary)');
    if (e.length) return e;
    if (m === 'sort') { if (c.data != null) ints(c.data, 1, 99, 2, 10, 'data'); return e; }
    if (m === 'search') {
      if (c.data != null && ints(c.data, 0, 999, 2, 12, 'data') && searchAlg(c) === 'binary' && c.data.some((x, i) => i && x < c.data[i - 1])) e.push('data: binary search needs the list sorted from smallest to largest');
      if (c.target != null && (c.target < -999 || c.target > 9999)) e.push('target: from -999 to 9999');
      return e;
    }
    if (m === 'stack' || m === 'queue') {
      if (c.data != null && (!Array.isArray(c.data) || c.data.length < 1 || c.data.length > 8 || !c.data.every((x) => (Number.isInteger(x) && x >= 0 && x <= 999) || (typeof x === 'string' && x.trim() && x.length <= 4)))) e.push('data: 1 to 8 values, each a whole number 0 to 999 or a short label (up to 4 letters)');
      if (c.capacity != null && (!Number.isInteger(c.capacity) || c.capacity < 2 || c.capacity > 8)) e.push('capacity: a whole number from 2 to 8');
      return e;
    }
    if (m === 'binary') {
      if (c.bits != null && (!Number.isInteger(c.bits) || c.bits < 4 || c.bits > 8)) { e.push('bits: a whole number from 4 to 8'); return e; }
      const bits = c.bits || 8;
      if (c.target != null && (c.target < 0 || c.target > (1 << bits) - 1)) e.push(`target: from 0 to ${(1 << bits) - 1} (the biggest number ${bits} bits can hold)`);
      return e;
    }
    if (m === 'boolean') {
      if (c.expr != null) {
        if (typeof c.expr !== 'string' || c.expr.length > 60) { e.push('expr: a short text such as "A and not B"'); return e; }
        try {
          const ast = parseLogic(c.expr);
          if (gateCount(ast) < 1) e.push('expr: needs at least one gate (and, or, not, xor, nand, nor)');
          if (gateCount(ast) > 6 || leafCount(ast) > 6 || logicDepth(ast) > 4) e.push('expr: too big to draw clearly (at most 6 gates, 6 inputs, 4 levels)');
          if (logicVars(ast).size > 3) e.push('expr: use at most 3 inputs (A, B, C)');
        } catch (x) { e.push('expr: ' + x.message); }
      }
      return e;
    }
    // program modes
    if (m === 'blocks' && c.grid != null) {
      const g = c.grid;
      const cell = (p, n) => Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1]) && p[0] >= 0 && p[1] >= 0 && p[0] < n && p[1] < n;
      if (!g || typeof g !== 'object' || !Number.isInteger(g.size) || g.size < 3 || g.size > 8) { e.push('grid.size: a whole number from 3 to 8'); return e; }
      Object.keys(g).forEach((k) => { if (!['size', 'start', 'goal', 'walls'].includes(k)) e.push('grid: unknown key ' + k); });
      if (!cell(g.start, g.size) || (g.start[2] != null && !(g.start[2] in DIRN))) e.push('grid.start: [column, row, "N"|"E"|"S"|"W"] inside the board');
      if (!cell(g.goal, g.size)) e.push('grid.goal: [column, row] inside the board');
      if (g.walls != null && (!Array.isArray(g.walls) || !g.walls.every((w) => cell(w, g.size)))) e.push('grid.walls: a list of [column, row] inside the board');
      if (e.length) return e;
      const wall = new Set((g.walls || []).map((w) => w[0] + ',' + w[1]));
      if (wall.has(g.start[0] + ',' + g.start[1]) || wall.has(g.goal[0] + ',' + g.goal[1])) e.push('grid: the start and the goal cannot be on a wall');
      if (g.start[0] === g.goal[0] && g.start[1] === g.goal[1]) e.push('grid: the goal must be away from the start');
      const seen = new Set([g.start[0] + ',' + g.start[1]]), q = [[g.start[0], g.start[1]]];
      while (q.length) { const [x, y] = q.shift(); DIRS.forEach(([dx, dy]) => { const k = (x + dx) + ',' + (y + dy); if (x + dx >= 0 && y + dy >= 0 && x + dx < g.size && y + dy < g.size && !wall.has(k) && !seen.has(k)) { seen.add(k); q.push([x + dx, y + dy]); } }); }
      if (!seen.has(g.goal[0] + ',' + g.goal[1])) e.push('grid: walls block every path to the goal');
      if (e.length) return e;
    }
    if (c.data != null) {
      if (isSearch(c) || c.algorithm) {
        if (ints(c.data, 0, 999, 2, m === 'recursion' ? 10 : 8, 'data') && c.algorithm === 'binary' && c.data.some((x, i) => i && x < c.data[i - 1])) e.push('data: binary search needs the list sorted from smallest to largest');
      } else if (!Array.isArray(c.data) || c.data.length < 1 || c.data.length > 12 || !c.data.every((x) => (Number.isInteger(x) && Math.abs(x) <= 99999) || (typeof x === 'string' && x.length <= 12))) e.push('data: 1 to 12 whole numbers or short words (the program sees it as the list data)');
      else if (!Array.isArray(c.program)) e.push('data without a program or algorithm does nothing in this mode');
      if (e.length) return e;
    }
    if (c.program != null) {
      if (!Array.isArray(c.program) || c.program.length > MAXLINES || !c.program.every((l) => typeof l === 'string' && l.length <= 80)) { e.push(`program: a list of up to ${MAXLINES} lines, each up to 80 characters`); return e; }
      if (m !== 'blocks' && !c.program.some((l) => l.trim())) { e.push('program: write at least one line'); return e; }
    }
    let prog;
    try { prog = parseProgram(progLines(c)); } catch (x) { e.push(`program line ${(x.line || 0) + 1}: ${x.msg ? x.msg.en : String(x)}`); return e; }
    const R = runAll(prog, progOpts(c));
    if (R.error && !(R.error.kind === 'limit' || (R.error.kind === 'depth' && m === 'recursion') || (R.error.kind === 'bump' && m === 'blocks'))) e.push(`program line ${R.error.line + 1}: when it runs: ${R.error.msg.en}`);
    if (m === 'flowchart') { const n = flowCheck(prog, 0, e); if (n > 18) e.push('program: too long to draw as a flowchart (18 boxes at most)'); }
    if (m === 'recursion') {
      if (!prog.some((s) => s.k === 'def')) e.push('program: recursion mode needs a function (def)');
      else if (!R.st.calls.some((k) => k.parent && R.st.calls[k.parent - 1].name === k.name)) e.push('program: no function calls itself, so there is no recursion to show');
      if (R.st.calls.length > 60) e.push('program: more than 60 calls; use a smaller number so the call tree can be drawn');
    }
    if (m === 'blocks' && prog.some((s) => s.k === 'def')) e.push('program: blocks mode does not take functions (def)');
    return e;
  }
  function keys(c) {
    c = c && typeof c === 'object' ? c : {};
    const m = c.mode;
    const targets = ['step', 'run', 'reset', 'slider:speed'];
    const events = ['stepped', 'done', 'output'];
    if (m === 'blocks') targets.push('block:move', 'block:left', 'block:right', 'block:repeat', 'block:times', 'block:end', 'block:undo', 'block:clear');
    if (m === 'stack') targets.push('block:push', 'block:pop', 'block:peek');
    if (m === 'queue') targets.push('block:enqueue', 'block:dequeue', 'block:peek');
    if (m === 'binary') { const b = Number.isInteger(c.bits) ? c.bits : 8; for (let k = 0; k < b; k++) targets.push('block:bit' + k); }
    if (m === 'boolean') { try { varsOf(c.expr || DEFEXPR).forEach((v) => targets.push('block:' + v)); } catch (x) { /* invalid expr: validate reports it */ } }
    let q = null;
    try { q = MODES.includes(m) && !validate(c).length ? question(c) : null; } catch (x) { q = null; }
    if (q) { targets.push('answer'); events.push('answered:right', 'answered:wrong'); }
    return { targets, events };
  }

  // ================================================================ styles
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
  const CSS = `
.cd { container-type: inline-size; display: flex; flex-direction: column; gap: 12px; min-width: 0; color: var(--ink); font-family: var(--font-body); }
.cd-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.cd-chip { display: inline-flex; align-items: center; gap: 8px; padding: 6px 16px 6px 8px; border-radius: 999px; background: linear-gradient(135deg, #111827, #1D4ED8 60%, #8B3DFF); color: #fff; font: 700 1rem/1.2 var(--font-display); box-shadow: 0 6px 18px -8px rgba(29,78,216,.7); }
.cd-chip svg { width: 26px; height: 26px; flex: none; }
.cd-tag { padding: 5px 12px; border-radius: 999px; background: var(--grape-t); color: var(--ink); font-weight: 700; font-size: .88rem; border: 1px solid var(--line); }
.cd-main { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-items: start; }
@container (min-width: 760px) { .cd-main { grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); } }
.cd-left, .cd-side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.cd-card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px; box-shadow: 0 10px 26px -18px rgba(6,18,51,.45); min-width: 0; }
.cd-h { margin: 0 0 8px; font: 700 .9rem/1.2 var(--font-display); color: var(--ink-2); display: flex; align-items: center; gap: 6px; }
.cd-h i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.cd-scene { border-radius: 18px; padding: 10px; background: radial-gradient(120% 90% at 20% 0%, #1E3A8A 0%, #0B1736 55%, #061233 100%); box-shadow: inset 0 0 0 1px rgba(255,255,255,.06), 0 14px 30px -18px rgba(6,18,51,.8); min-width: 0; }
.cd-scene svg { display: block; width: 100%; height: auto; }
.cd-code { list-style: none; margin: 0; padding: 10px 0; background: linear-gradient(180deg, #0F1E45, #061233); border-radius: 16px; font: 500 .9rem/1.6 ${MONO}; color: #E2E8F0; overflow: auto; max-height: 440px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.07), 0 14px 30px -18px rgba(6,18,51,.8); }
.cd-code li { display: flex; gap: 10px; padding: 0 14px 0 0; border-left: 4px solid transparent; white-space: pre; transition: background .25s, border-color .25s; min-width: max-content; }
.cd-code li.on { background: linear-gradient(90deg, rgba(255,210,63,.42), rgba(255,210,63,.16)); border-left-color: #FFD23F; color: #fff; }
.cd-code li.err { background: rgba(255,107,87,.25); border-left-color: #FF6B57; }
.cd-code li.call { background: rgba(2,207,249,.10); border-left-color: rgba(2,207,249,.6); }
.cd-ln { width: 2.2em; text-align: right; color: #5B6B8C; flex: none; user-select: none; }
.cd-code code { font: inherit; }
.cd-k { color: #D6A3FF; font-weight: 700; } .cd-b { color: #7FB2FF; } .cd-n { color: #FFB27A; } .cd-s { color: #B8F28A; } .cd-c { color: #7F8CA8; font-style: italic; }
.cd-say { margin: 0; min-height: 3.2em; padding: 10px 14px; border-radius: 14px; background: var(--sun-t); border-left: 6px solid #F5B90A; font-weight: 600; line-height: 1.45; color: var(--ink); display: flex; gap: 10px; align-items: flex-start; }
.cd-say svg { width: 24px; height: 24px; flex: none; margin-top: 1px; }
.cd-say.bad { background: var(--bad-t); border-left-color: #FF6B57; }
.cd-say.good { background: var(--good-t); border-left-color: #22C55E; }
.cd-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.cd-btn { min-height: 48px; min-width: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0 18px; border: 0; border-radius: 14px; font: 700 1rem/1 var(--font-body); cursor: pointer; box-shadow: 0 3px 0 rgba(6,18,51,.25); transition: transform .12s, filter .12s, box-shadow .12s; }
.cd-btn svg { width: 20px; height: 20px; flex: none; }
.cd-btn:hover { filter: brightness(1.07); transform: translateY(-1px); }
.cd-btn:active { transform: translateY(1px); box-shadow: 0 1px 0 rgba(6,18,51,.25); }
.cd-btn:focus-visible, .cd-opt:focus-visible, .cd-pb:focus-visible, .cd-bit:focus-visible, .cd-sw:focus-visible, .cd [tabindex]:focus-visible { outline: 3px solid #02CFF9; outline-offset: 2px; }
.cd-btn:disabled { opacity: .5; cursor: not-allowed; transform: none; }
.cd-step { background: linear-gradient(180deg, #3B6EEA, #1D4ED8); color: #fff; }
.cd-run { background: linear-gradient(180deg, #4ADE80, #22C55E); color: #1E293B; }
.cd-run[aria-pressed="true"] { background: linear-gradient(180deg, #FFB067, #FF7A1A); }
.cd-reset { background: var(--surface); color: var(--ink); box-shadow: inset 0 0 0 1.5px var(--line); }
.cd-speed { display: inline-flex; align-items: center; gap: 8px; min-height: 48px; padding: 0 14px; border-radius: 14px; background: var(--sunk); font-weight: 700; color: var(--ink-2); margin-left: auto; }
.cd-speed svg { width: 20px; height: 20px; }
.cd-speed input { width: 104px; accent-color: #8B3DFF; height: 30px; cursor: pointer; }
@container (max-width: 430px) { .cd-btn { padding: 0 14px; flex: 1 1 auto; } .cd-speed { margin-left: 0; flex: 1 1 100%; justify-content: center; } .cd-speed input { flex: 1; } }
.cd-vars { display: flex; flex-wrap: wrap; gap: 8px; min-height: 36px; }
.cd-var { display: flex; align-items: stretch; border-radius: 12px; overflow: hidden; border: 1.5px solid var(--line); background: var(--surface); font: 600 .92rem/1.2 ${MONO}; transition: transform .3s, box-shadow .3s; max-width: 100%; }
.cd-var .nm { padding: 7px 10px; background: var(--grape-t); color: var(--ink); }
.cd-var .vl { padding: 7px 10px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.cd-var.chg { box-shadow: 0 0 0 3px rgba(255,210,63,.85); transform: translateY(-2px); }
.cd-var.chg .vl { background: var(--sun-t); }
.cd-none { color: var(--ink-2); font-size: .92rem; margin: 0; }
.cd-out { background: #061233; color: #A7F3D0; border-radius: 14px; padding: 10px 12px; font: 500 .92rem/1.55 ${MONO}; min-height: 62px; max-height: 190px; overflow: auto; box-shadow: inset 0 0 0 1px rgba(255,255,255,.07); white-space: pre-wrap; overflow-wrap: anywhere; }
.cd-out div::before { content: '> '; color: #02CFF9; }
.cd-out .new { animation: cd-in .45s ease-out; }
.cd-out .ph { color: #6B7BA0; } .cd-out .ph::before { content: ''; }
@keyframes cd-in { from { opacity: 0; transform: translateX(-8px); background: rgba(34,197,94,.25); } to { opacity: 1; transform: none; background: transparent; } }
.cd-ttw { max-height: 210px; overflow: auto; border-radius: 12px; border: 1px solid var(--line); }
.cd-tt { width: 100%; border-collapse: collapse; font: 500 .84rem/1.3 ${MONO}; }
.cd-tt th { position: sticky; top: 0; background: var(--sunk); color: var(--ink-2); font: 700 .8rem var(--font-body); padding: 6px 8px; text-align: left; white-space: nowrap; }
.cd-tt td { padding: 4px 8px; border-top: 1px solid var(--line); white-space: nowrap; max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
.cd-tt td.chg { color: #B45309; font-weight: 800; }
:root[data-theme="dark"] .cd-tt td.chg { color: #FFD23F; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .cd-tt td.chg { color: #FFD23F; } }
.cd-tt tr.on td { background: var(--sun-t); }
.cd-quiz { background: linear-gradient(135deg, var(--grape-t), var(--royal-t)); border-radius: 18px; padding: 14px; border: 1px solid var(--line); }
.cd-q { margin: 0 0 10px; font: 700 1.04rem/1.35 var(--font-display); display: flex; gap: 10px; align-items: flex-start; }
.cd-q svg { width: 28px; height: 28px; flex: none; }
.cd-opts { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; }
.cd-opt { min-height: 50px; border-radius: 12px; border: 2px solid var(--line); background: var(--surface); color: var(--ink); font: 700 1.02rem/1.2 ${MONO}; cursor: pointer; padding: 6px 10px; overflow-wrap: anywhere; transition: transform .12s, border-color .2s, background .2s; }
.cd-opt.word { font-family: var(--font-body); }
.cd-opt:hover { transform: translateY(-1px); border-color: #8B3DFF; }
.cd-opt.right { border-color: #22C55E; background: var(--good-t); }
.cd-opt.wrong { border-color: #FF6B57; background: var(--bad-t); }
.cd-fb { margin: 10px 0 0; font-weight: 600; line-height: 1.4; }
.cd-fb:empty { display: none; }
.cd-fwrap { overflow: auto; max-height: 600px; border-radius: 18px; background: var(--stage); border: 1px solid var(--line); padding: 8px; }
.cd-fwrap svg { display: block; height: auto; margin: 0 auto; }
.cd-fl text { font: 600 14.5px ${MONO}; }
.cd-fl .yn { font: 700 14px var(--font-body); fill: var(--ink-2); }
.cd-fl .ln { fill: none; stroke: var(--ink-2); stroke-width: 2; }
.cd-fl .shp { transition: opacity .3s; }
.cd-fl .shp .bd { transition: stroke .25s, stroke-width .25s; stroke: rgba(6,18,51,.25); stroke-width: 1.5; }
.cd-fl .shp.on .bd { stroke: #FF7A1A; stroke-width: 5; }
.cd-fl .shp.on { filter: drop-shadow(0 0 10px rgba(255,122,26,.75)); }
.cd-fl .shp.seen .tick { opacity: 1; }
.cd-fl .tick { opacity: 0; transition: opacity .3s; }
.cd-blocks { display: flex; flex-direction: column; gap: 5px; min-height: 70px; padding: 10px; background: var(--sunk); border-radius: 14px; border: 1.5px dashed var(--line); overflow-x: auto; }
.cd-blk { display: inline-flex; align-self: flex-start; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 10px 10px 10px 4px; font: 700 .95rem/1.2 var(--font-body); color: #fff; box-shadow: 0 2px 0 rgba(6,18,51,.25); transition: transform .2s, box-shadow .2s; white-space: nowrap; }
.cd-blk svg { width: 18px; height: 18px; flex: none; }
.cd-blk code { font: 600 .85rem ${MONO}; background: rgba(255,255,255,.2); padding: 1px 6px; border-radius: 6px; }
.cd-mo { background: linear-gradient(180deg, #3B82F6, #2563EB); }
.cd-ct { background: linear-gradient(180deg, #FF9A4D, #FF7A1A); color: #1E293B; } .cd-ct code { background: rgba(255,255,255,.45); }
.cd-vr { background: linear-gradient(180deg, #A266FF, #8B3DFF); }
.cd-pr { background: linear-gradient(180deg, #14A394, #0F766E); }
.cd-fn { background: linear-gradient(180deg, #FF8A7A, #FF6B57); color: #1E293B; }
.cd-cbody { display: flex; flex-direction: column; gap: 5px; margin-left: 10px; padding: 5px 0 5px 10px; border-left: 10px solid #FF7A1A; border-radius: 0 0 0 8px; }
.cd-cbody.open { border-left-style: dashed; }
.cd-blk.on { box-shadow: 0 0 0 3px #FFD23F, 0 4px 14px rgba(255,210,63,.6); transform: translateX(6px); }
.cd-blk.err { box-shadow: 0 0 0 3px #FF6B57; }
.cd-slot { font-size: .85rem; color: var(--ink-2); padding: 4px 2px; }
.cd-pal { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.cd-pb { min-height: 50px; border: 0; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 4px 8px; font: 700 .92rem/1.15 var(--font-body); cursor: pointer; color: #fff; box-shadow: 0 3px 0 rgba(6,18,51,.25); transition: transform .12s, filter .12s; text-align: center; }
.cd-pb:hover { filter: brightness(1.08); transform: translateY(-1px); }
.cd-pb:active { transform: translateY(1px); }
.cd-pb svg { width: 20px; height: 20px; flex: none; }
.cd-pb.gh { background: var(--surface); color: var(--ink); box-shadow: inset 0 0 0 1.5px var(--line); }
.cd-pb .cnt { display: inline-grid; place-items: center; min-width: 26px; height: 26px; border-radius: 8px; background: rgba(255,255,255,.55); font: 800 .95rem var(--font-display); }
.cd-bits { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 6px; }
.cd-bit { min-height: 128px; border-radius: 14px; border: 0; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 8px 2px; background: linear-gradient(180deg, #1E293B, #0F172A); color: #94A3B8; transition: background .3s, transform .2s, box-shadow .3s, color .3s; box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); min-width: 0; }
.cd-bit .pv { font: 700 .82rem/1 var(--font-body); }
.cd-bit .bv { font: 800 2rem/1 var(--font-display); }
.cd-bit svg { width: 28px; height: 28px; }
.cd-bit[aria-pressed="true"] { background: linear-gradient(180deg, #FFE48A, #FFD23F 60%, #F5B90A); color: #1E293B; box-shadow: 0 0 24px rgba(255,210,63,.65); transform: translateY(-4px); }
.cd-total { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: center; gap: 8px 14px; margin-top: 14px; color: #E2E8F0; text-align: center; }
.cd-total .big { font: 800 2.6rem/1 var(--font-display); color: #FFD23F; }
.cd-total .sum { font: 600 1rem ${MONO}; color: #BFD3FF; overflow-wrap: anywhere; }
.cd-goal { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; background: rgba(255,255,255,.1); color: #fff; font-weight: 700; }
.cd-goal.ok { background: #22C55E; color: #1E293B; }
.cd-div { width: 100%; border-collapse: collapse; font: 600 .95rem ${MONO}; }
.cd-div td { padding: 6px 8px; border-top: 1px solid var(--line); }
.cd-div td.r { font-weight: 800; color: #1D4ED8; text-align: center; }
:root[data-theme="dark"] .cd-div td.r { color: #8EA9FF; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .cd-div td.r { color: #8EA9FF; } }
.cd-div tr.on td { background: var(--sun-t); }
.cd-sws { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 10px; }
.cd-sw { min-height: 52px; min-width: 96px; border-radius: 14px; border: 0; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 10px; padding: 0 14px; font: 800 1.05rem var(--font-display); background: #1E293B; color: #CBD5E1; box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.15); transition: background .25s, color .25s; }
.cd-sw .kn { width: 40px; height: 22px; border-radius: 11px; background: #475569; position: relative; transition: background .25s; }
.cd-sw .kn::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left .25s; }
.cd-sw[aria-pressed="true"] { background: #FFD23F; color: #1E293B; }
.cd-sw[aria-pressed="true"] .kn { background: #0F766E; }
.cd-sw[aria-pressed="true"] .kn::after { left: 21px; }
.cd-truth { width: 100%; border-collapse: collapse; font: 700 1rem ${MONO}; text-align: center; }
.cd-truth th { background: var(--sunk); color: var(--ink-2); padding: 6px; font-family: var(--font-body); }
.cd-truth td { padding: 6px; border-top: 1px solid var(--line); }
.cd-truth tr.on td { background: var(--sun-t); }
.cd-truth td.o1 { color: #15803D; } .cd-truth td.o0 { color: var(--ink-2); }
:root[data-theme="dark"] .cd-truth td.o1 { color: #5EE0C9; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .cd-truth td.o1 { color: #5EE0C9; } }
.cd-ops { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 8px; }
.cd-log { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 210px; overflow: auto; font: 600 .9rem/1.35 ${MONO}; }
.cd-log li { padding: 6px 10px; border-radius: 10px; background: var(--sunk); overflow-wrap: anywhere; }
.cd-log li.bad { background: var(--bad-t); }
.cd-log li.new { animation: cd-in .45s ease-out; }
.cd-stats { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.cd-stat { flex: 1 1 90px; border-radius: 12px; padding: 8px 10px; background: rgba(255,255,255,.08); color: #E2E8F0; text-align: center; font-weight: 600; font-size: .85rem; }
.cd-stat b { display: block; font: 800 1.5rem/1.1 var(--font-display); color: #FFD23F; }
.cd-frames { display: flex; flex-direction: column; gap: 6px; }
.cd-frame { border-radius: 12px; padding: 8px 12px; background: var(--sunk); border: 1.5px solid var(--line); font: 600 .9rem/1.35 ${MONO}; transition: transform .3s, box-shadow .3s; overflow-wrap: anywhere; }
.cd-frame b { color: var(--ink); }
.cd-frame small { display: block; font-family: var(--font-body); color: var(--ink-2); font-weight: 600; }
.cd-frame.on { background: linear-gradient(135deg, #02CFF9, #14B8A6); color: #1E293B; border-color: transparent; box-shadow: 0 8px 20px -10px rgba(2,207,249,.8); }
.cd-frame.on b, .cd-frame.on small { color: #0F172A; }
.cd-frame.main { border-style: dashed; }
.cd-tree { width: 100%; height: auto; display: block; }
.cd-tree text { font: 700 12px ${MONO}; }
@media (prefers-reduced-motion: reduce) { .cd *, .cd *::before, .cd *::after { transition: none !important; animation: none !important; } }
`;

  // ================================================================ small drawings
  const ICON = {
    step: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l9 7-9 7z" fill="currentColor"/><rect x="16" y="5" width="3" height="14" rx="1" fill="currentColor"/></svg>',
    run: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/></svg>',
    reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12a7 7 0 1 0 2.2-5.1" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M4 3v5h5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    speed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 16a9 9 0 0 1 18 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M12 16l5-6" stroke="#FF7A1A" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="16" r="2" fill="currentColor"/></svg>',
    chip: '<svg viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="13" fill="#FFD23F"/><path d="M9.5 8.5L5 13l4.5 4.5M16.5 8.5L21 13l-4.5 4.5M14.5 7l-3 12" fill="none" stroke="#111827" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bulb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2z" fill="currentColor"/><rect x="8.5" y="19" width="7" height="3" rx="1.2" fill="currentColor" opacity=".7"/></svg>',
    say: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#F5B90A"/><rect x="10.6" y="10" width="2.8" height="8" rx="1.4" fill="#1E293B"/><circle cx="12" cy="6.8" r="1.7" fill="#1E293B"/></svg>',
    q: '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="14" fill="#8B3DFF"/><path d="M10.4 10.6a3.8 3.8 0 1 1 5.4 3.4c-1.2.6-1.8 1.4-1.8 2.6v.6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="14" cy="21" r="1.7" fill="#fff"/></svg>',
    fwd: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 8h-4.5v10h-5V11H5z" fill="currentColor"/></svg>',
    left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 20v-6a6 6 0 0 0-6-6H7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M10 3.5L5 8l5 4.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20v-6a6 6 0 0 1 6-6h6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M14 3.5L19 8l-5 4.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    loop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a6 6 0 0 1 6-6h8M20 12a6 6 0 0 1-6 6H6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M15 3l3 3-3 3M9 21l-3-3 3-3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    end: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4v9a4 4 0 0 0 4 4h9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M15 13l4 4-4 4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9h10a6 6 0 0 1 0 12h-3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    clear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    print: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M7 10l3 2-3 2M12 15h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    box: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M8 12h8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    push: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11M7 9l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="5" y="17" width="14" height="4" rx="2" fill="currentColor"/></svg>',
    pop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7 9l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="5" y="17" width="14" height="4" rx="2" fill="currentColor"/></svg>',
    peek: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>',
  };
  const MODENAME = {
    blocks: T2('Code with blocks', 'ब्लॉक से कोड'), flowchart: T2('Follow the flowchart', 'फ़्लोचार्ट का पालन करो'), trace: T2('Trace the code', 'कोड ट्रेस करो'),
    sort: T2('Sorting step by step', 'क़दम-दर-क़दम छँटाई'), search: T2('Searching a list', 'सूची में खोज'), stack: T2('Stack: last in, first out', 'स्टैक: अंत में आया, पहले गया'),
    queue: T2('Queue: first in, first out', 'क्यू: पहले आया, पहले गया'), recursion: T2('Recursion and the call stack', 'रिकर्शन और कॉल स्टैक'),
    binary: T2('Binary numbers', 'बाइनरी संख्याएँ'), boolean: T2('Logic gates and truth tables', 'लॉजिक गेट और सत्य सारणी'),
  };
  const ALGNAME = {
    bubble: T2('Bubble sort', 'बबल सॉर्ट'), insertion: T2('Insertion sort', 'इंसर्शन सॉर्ट'), selection: T2('Selection sort', 'सेलेक्शन सॉर्ट'),
    linear: T2('Linear search', 'लीनियर खोज'), binary: T2('Binary search', 'बाइनरी खोज'),
  };
  const KW_HL = new Set(['if', 'elif', 'else', 'while', 'for', 'in', 'def', 'return', 'and', 'or', 'not', 'True', 'False', 'None', 'break', 'continue', 'pass', 'repeat', 'times']);
  const BI_HL = new Set(['print', 'len', 'range', 'abs', 'min', 'max', 'sum', 'int', 'float', 'str', 'round', 'append', 'pop', 'insert', 'move', 'turn_left', 'turn_right', 'at_goal', 'wall_ahead']);
  function hl(line) {
    let out = '';
    const re = /(#.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|([^\w"'#]+)/g;
    let m;
    while ((m = re.exec(line))) {
      if (m[1]) out += `<span class="cd-c">${esc(m[1])}</span>`;
      else if (m[2]) out += `<span class="cd-s">${esc(m[2])}</span>`;
      else if (m[3]) out += `<span class="cd-n">${esc(m[3])}</span>`;
      else if (m[4]) out += KW_HL.has(m[4]) ? `<span class="cd-k">${esc(m[4])}</span>` : BI_HL.has(m[4]) ? `<span class="cd-b">${esc(m[4])}</span>` : esc(m[4]);
      else out += esc(m[0]);
      if (m[0] === '') re.lastIndex++;
    }
    return out || ' ';
  }
  const short = (v, n) => { const s = repr(v); n = n || 34; return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  // ================================================================ the view
  function codeLab(root, cfg, api) {
    const t = (x) => api.t(x);
    const mode = cfg.mode;
    let speed = 3, running = false, timer = null, doneSent = false;
    const stops = [];
    const anim = (ms, f, done) => { const s = L.tween(ms, f, done); stops.push(s); return s; };
    const animMs = () => Math.min(520, [1300, 850, 550, 320, 160][speed - 1] * 0.75);
    const Q = (() => { try { return question(cfg); } catch (x) { return null; } })();
    const tag = cfg.algorithm ? t(ALGNAME[cfg.algorithm]) : mode === 'sort' ? t(ALGNAME[sortAlg(cfg)]) : mode === 'search' ? t(ALGNAME[searchAlg(cfg)]) : mode === 'boolean' ? (cfg.expr || DEFEXPR) : mode === 'binary' ? t(T2(`Make ${targetOf(cfg)}`, `${targetOf(cfg)} बनाओ`)) : null;
    root.innerHTML = `<div class="cd cd-m-${mode}">
      <div class="cd-head"><span class="cd-chip">${ICON.chip}${esc(t(MODENAME[mode]))}</span>${tag ? `<span class="cd-tag">${esc(tag)}</span>` : ''}</div>
      <div class="cd-main">
        <div class="cd-left"><div class="cd-stage"></div>
          <p class="cd-say" aria-live="polite"></p>
          <div class="cd-bar">
            <button type="button" class="cd-btn cd-step" data-key="step">${ICON.step}<span>${esc(t(T2('Step', 'एक क़दम')))}</span></button>
            <button type="button" class="cd-btn cd-run" data-key="run" aria-pressed="false">${ICON.run}<span>${esc(t(T2('Run', 'चलाओ')))}</span></button>
            <button type="button" class="cd-btn cd-reset" data-key="reset">${ICON.reset}<span>${esc(t(T2('Reset', 'फिर से')))}</span></button>
            <label class="cd-speed" data-key="slider:speed">${ICON.speed}<span>${esc(t(T2('Speed', 'गति')))}</span><input type="range" min="1" max="5" step="1" value="3" aria-label="${esc(t(T2('Speed', 'गति')))}"></label>
          </div>
        </div>
        <div class="cd-side"></div>
      </div>
      ${Q ? `<div class="cd-quiz" data-key="answer" role="group" aria-label="${esc(t(T2('Question', 'प्रश्न')))}"><p class="cd-q">${ICON.q}<span>${esc(t(Q.q))}</span></p><div class="cd-opts">${Q.options.map((o, i) => `<button type="button" class="cd-opt ${typeof o === 'object' ? 'word' : ''}" data-opt="${i}">${esc(t(o))}</button>`).join('')}</div><p class="cd-fb" aria-live="polite"></p></div>` : ''}
    </div>`;
    const $ = (s) => root.querySelector(s);
    const stage = $('.cd-stage'), side = $('.cd-side'), sayEl = $('.cd-say');
    function say(x, kind) { sayEl.className = 'cd-say' + (kind ? ' ' + kind : ''); sayEl.innerHTML = ICON.say + `<span>${esc(t(x))}</span>`; }
    const D = (DRIVERS[mode])(cfg, { t, api, stage, side, say, anim, animMs, root });
    function setRun(on) {
      running = on;
      const b = $('[data-key="run"]');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.innerHTML = (on ? ICON.pause : ICON.run) + `<span>${esc(t(on ? T2('Pause', 'रुको') : T2('Run', 'चलाओ')))}</span>`;
    }
    function stopRun() { clearTimeout(timer); timer = null; if (running) setRun(false); }
    function finishCheck() { if (D.finished && !doneSent) { doneSent = true; api.emit('done'); stopRun(); } }
    function stepOnce(auto) {
      if (D.finished) { if (!auto) api.toast(T2('It has finished. Press Reset to start again.', 'यह पूरा हो गया। फिर से शुरू करने के लिए "फिर से" दबाओ।')); stopRun(); return; }
      D.step();
      api.emit('stepped');
      finishCheck();
    }
    function loop() { if (!running) return; stepOnce(true); if (running && !D.finished) timer = setTimeout(loop, [1300, 850, 550, 320, 160][speed - 1]); else stopRun(); }
    function onClick(e) {
      const el = e.target.closest('[data-key]');
      if (!el || !root.contains(el) || el.disabled) return;
      const key = el.dataset.key;
      if (key === 'slider:speed') return;
      if (key === 'answer') {
        const b = e.target.closest('[data-opt]');
        if (!b || !Q) return;
        if (!api.allowed('answer')) { api.nudge('answer'); return; }
        const k = +b.dataset.opt, fb = root.querySelector('.cd-fb');
        if (k === Q.answer) {
          root.querySelectorAll('.cd-opt').forEach((x) => { x.classList.remove('wrong'); x.disabled = true; });
          b.classList.add('right');
          fb.textContent = t(T2('Right! ', 'सही! ')) + t(Q.why);
          api.record(t(T2('Answered the question correctly: ', 'प्रश्न का सही उत्तर दिया: ')) + t(Q.options[k]));
          api.emit('answered:right');
        } else {
          b.classList.add('wrong');
          b.disabled = true;
          fb.textContent = t(T2('Not quite. Try another answer, or press Step and watch closely.', 'पूरी तरह सही नहीं। कोई और उत्तर चुनो, या "एक क़दम" दबाकर ध्यान से देखो।'));
          api.record(t(T2('Answered the question wrongly: ', 'प्रश्न का ग़लत उत्तर दिया: ')) + t(Q.options[k]));
          api.emit('answered:wrong');
        }
        return;
      }
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key === 'step') { stopRun(); stepOnce(false); }
      else if (key === 'run') {
        if (running) { stopRun(); return; }
        if (D.finished) { D.reset(); doneSent = false; }
        api.record(t(T2('Pressed Run', '"चलाओ" दबाया')));
        setRun(true);
        loop();
      } else if (key === 'reset') { stopRun(); D.reset(); doneSent = false; api.record(t(T2('Reset', 'फिर से शुरू किया'))); }
      else if (key.startsWith('block:')) {
        if (D.block) { const r = D.block(key.slice(6), { stopRun }); if (r === 'reset') doneSent = false; finishCheck(); }
      }
    }
    function onKey(e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-key]')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    }
    const range = $('.cd-speed input');
    function onInput() {
      if (!api.allowed('slider:speed')) { api.nudge('slider:speed'); range.value = speed; return; }
      speed = +range.value;
    }
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    range.addEventListener('input', onInput);
    D.reset();
    return {
      destroy() {
        clearTimeout(timer);
        stops.forEach((s) => s());
        if (D.destroy) D.destroy();
        root.removeEventListener('click', onClick);
        root.removeEventListener('keydown', onKey);
        range.removeEventListener('input', onInput);
      },
    };
  }

  // ---------------------------------------------------------------- narration of interpreter events
  function narrate(e) {
    const ln = e.line >= 0 ? e.line + 1 : null;
    const pre = ln ? T2(`Line ${ln}: `, `पंक्ति ${ln}: `) : T2('', '');
    const v = (x) => short(x);
    switch (e.kind) {
      case 'assign': return cat(pre, T2(`${e.name} becomes ${v(e.value)}.`, `${e.name} का मान अब ${v(e.value)} है।`));
      case 'cond': {
        const tf = e.value ? 'True' : 'False';
        if (e.ctl === 'while') return cat(pre, e.value ? T2(`is ${e.src}? ${tf}, so the lines inside the loop run.`, `क्या ${e.src}? ${tf}, इसलिए लूप के अंदर की पंक्तियाँ चलेंगी।`) : T2(`is ${e.src}? ${tf}, so the loop stops.`, `क्या ${e.src}? ${tf}, इसलिए लूप रुक गया।`));
        return cat(pre, e.value ? T2(`is ${e.src}? ${tf}, so the lines under it run.`, `क्या ${e.src}? ${tf}, इसलिए इसके नीचे की पंक्तियाँ चलेंगी।`) : T2(`is ${e.src}? ${tf}, so the lines under it are skipped.`, `क्या ${e.src}? ${tf}, इसलिए इसके नीचे की पंक्तियाँ छोड़ दी गईं।`));
      }
      case 'else': return cat(pre, T2('nothing above was True, so the else lines run.', 'ऊपर की कोई शर्त True नहीं थी, इसलिए else वाली पंक्तियाँ चलेंगी।'));
      case 'for': return cat(pre, T2(`${e.name} takes the next value, ${v(e.value)} (round ${e.k + 1} of ${e.n}).`, `${e.name} को अगला मान ${v(e.value)} मिला (${e.n} में से ${e.k + 1}वाँ चक्कर)।`));
      case 'forend': return cat(pre, T2('no values are left, so the loop ends.', 'कोई मान नहीं बचा, इसलिए लूप ख़त्म।'));
      case 'repeat': return cat(pre, T2(`repeat: time ${e.k} of ${e.n}.`, `दोहराओ: ${e.n} में से ${e.k}वीं बार।`));
      case 'repeatend': return cat(pre, T2(`done ${e.n} times, so the repeat ends.`, `${e.n} बार हो गया, इसलिए दोहराना ख़त्म।`));
      case 'print': return cat(pre, T2(`it prints ${e.text}`, `यह छापता (print करता) है: ${e.text}`));
      case 'method': return cat(pre, e.obj && e.objV ? T2(`${e.src} runs; now ${e.obj} = ${short(e.objV === null ? '' : e.objV, 40).replace(/^'|'$/g, '')}.`, `${e.src} चला; अब ${e.obj} = ${short(e.objV === null ? '' : e.objV, 40).replace(/^'|'$/g, '')}।`) : T2(`${e.src} gives ${v(e.value)}.`, `${e.src} का मान ${v(e.value)} है।`));
      case 'def': return cat(pre, T2(`the function ${e.name}(${e.params.join(', ')}) is defined. It runs only when it is called.`, `फ़ंक्शन ${e.name}(${e.params.join(', ')}) बनाया गया। यह तभी चलेगा जब इसे बुलाया (कॉल किया) जाए।`));
      case 'call': return T2(`${e.name}(${e.args.map((a) => cut(a, 14)).join(', ')}) is called: a new box goes on top of the call stack.`, `${e.name}(${e.args.map((a) => cut(a, 14)).join(', ')}) को बुलाया गया: कॉल स्टैक पर सबसे ऊपर एक नया डिब्बा रखा गया।`);
      case 'return': return cat(pre, T2(`return ${v(e.value)}: this call is finished.`, `return ${v(e.value)}: यह कॉल पूरी हुई।`));
      case 'ret': return T2(`${e.name}(${e.args.map((a) => cut(a, 14)).join(', ')}) gives back ${v(e.value)}; its box leaves the stack.`, `${e.name}(${e.args.map((a) => cut(a, 14)).join(', ')}) ने ${v(e.value)} लौटाया; उसका डिब्बा स्टैक से हट गया।`);
      case 'break': return cat(pre, T2('break: leave the loop now.', 'break: अभी लूप से बाहर निकलो।'));
      case 'continue': return cat(pre, T2('continue: jump to the next round of the loop.', 'continue: लूप के अगले चक्कर पर जाओ।'));
      case 'pass': return cat(pre, T2('pass does nothing.', 'pass कुछ नहीं करता।'));
      case 'move': return cat(pre, T2('the robot moves one square forward.', 'रोबोट एक ख़ाना आगे बढ़ा।'));
      case 'turn': return cat(pre, e.side === 'left' ? T2('the robot turns left.', 'रोबोट बाएँ मुड़ा।') : T2('the robot turns right.', 'रोबोट दाएँ मुड़ा।'));
      case 'end': return T2('The program has finished.', 'प्रोग्राम पूरा हुआ।');
      case 'error': return cat(T2(`Stopped at line ${e.line + 1}. `, `पंक्ति ${e.line + 1} पर रुका। `), e.err.msg);
    }
    return pre;
  }
  function codePanel(lines) {
    return `<ol class="cd-code" aria-label="Code">${lines.map((l, i) => `<li data-ln="${i}"><span class="cd-ln">${i + 1}</span><code>${hl(l)}</code></li>`).join('')}</ol>`;
  }
  function markLine(panel, line, cls, extra) {
    if (!panel) return;
    panel.querySelectorAll('li').forEach((li) => { const k = +li.dataset.ln; li.className = k === line ? cls : extra && extra.includes(k) ? 'call' : ''; });
    const li = panel.querySelector(`li[data-ln="${line}"]`);
    if (li) { const top = li.offsetTop - panel.offsetTop, h = panel.clientHeight; if (top < panel.scrollTop + 8 || top > panel.scrollTop + h - 40) panel.scrollTop = Math.max(0, top - h / 3); }
  }
  function varsHTML(t, frame, changed, order) {
    const names = order || Object.keys(frame.vars);
    if (!names.length) return `<p class="cd-none">${esc(t(T2('No variables yet.', 'अभी कोई वेरिएबल नहीं।')))}</p>`;
    return names.filter((n) => Object.prototype.hasOwnProperty.call(frame.vars, n)).map((n) => `<div class="cd-var ${n === changed ? 'chg' : ''}"><span class="nm">${esc(n)}</span><span class="vl">${esc(short(frame.vars[n], 44))}</span></div>`).join('') || `<p class="cd-none">${esc(t(T2('No variables yet.', 'अभी कोई वेरिएबल नहीं।')))}</p>`;
  }
  function outHTML(t, out, fresh) {
    if (!out.length) return `<div class="ph">${esc(t(T2('Nothing printed yet.', 'अभी कुछ नहीं छपा।')))}</div>`;
    return out.map((s, i) => `<div class="${fresh && i === out.length - 1 ? 'new' : ''}">${esc(s)}</div>`).join('');
  }

  // ---------------------------------------------------------------- a program driver shared by trace, flowchart, recursion and blocks
  function programCore(cfg, ctx, lines, hooks) {
    const { t, api, say } = ctx;
    const S = { prog: null, R: null, last: null, hist: [], changed: null, perr: null };
    function load(ls) {
      lines = ls;
      try { S.prog = parseProgram(lines); S.perr = null; } catch (x) { S.prog = null; S.perr = x; }
    }
    load(lines);
    const core = {
      S,
      get lines() { return lines; },
      load,
      get finished() { return !S.prog || (S.R && S.R.finished); },
      reset() {
        S.R = S.prog ? runner(S.prog, Object.assign(progOpts(cfg), hooks.opts ? hooks.opts() : {})) : null;
        S.last = null; S.hist = []; S.changed = null;
        hooks.draw(null, false);
        if (S.perr) say(cat(T2(`Line ${S.perr.line + 1}: `, `पंक्ति ${S.perr.line + 1}: `), S.perr.msg), 'bad');
        else say(hooks.intro());
      },
      step() {
        if (!S.R) return;
        const e = S.R.next();
        if (!e) return;
        S.last = e;
        S.changed = e.kind === 'assign' ? (e.plain ? e.name : e.base) : e.kind === 'for' ? e.name : e.kind === 'method' && e.obj ? e.obj : null;
        if (e.kind !== 'end' && e.kind !== 'error') {
          const g = S.R.st.frames[0].vars;
          S.hist.push({ line: e.line, vars: Object.fromEntries(S.R.st.seen.map((n) => [n, g[n] === undefined ? '' : short(g[n], 18)])), changed: e.depth === 0 ? S.changed : null });
        }
        if (e.kind === 'print') api.emit('output');
        const good = hooks.good && e.kind === 'end' ? hooks.good(e) : null;
        say(e.kind === 'end' && good ? good : narrate(e), e.kind === 'error' ? 'bad' : e.kind === 'end' ? 'good' : null);
        if (e.kind === 'error') api.record(t(T2('The program stopped with a message: ', 'प्रोग्राम एक संदेश के साथ रुका: ')) + t(e.err.msg));
        if (e.kind === 'end') api.record(t(T2('The program finished. Output: ', 'प्रोग्राम पूरा हुआ। आउटपुट: ')) + (S.R.st.out.join(' | ') || '-'));
        hooks.draw(e, true);
      },
    };
    return core;
  }

  // ---------------------------------------------------------------- trace
  function traceDriver(cfg, ctx) {
    const { t, stage, side } = ctx;
    const lines = progLines(cfg);
    stage.innerHTML = codePanel(lines);
    side.innerHTML = `<div class="cd-card"><p class="cd-h"><i style="background:#8B3DFF"></i>${esc(t(T2('Variables', 'वेरिएबल')))}</p><div class="cd-vars"></div></div>
      <div class="cd-card"><p class="cd-h"><i style="background:#22C55E"></i>${esc(t(T2('Output', 'आउटपुट')))}</p><div class="cd-out" aria-label="${esc(t(T2('Output', 'आउटपुट')))}"></div></div>
      <div class="cd-card"><p class="cd-h"><i style="background:#FFD23F"></i>${esc(t(T2('Trace table', 'ट्रेस तालिका')))}</p><div class="cd-ttw"></div></div>`;
    const panel = stage.querySelector('.cd-code');
    const core = programCore(cfg, ctx, lines, {
      intro: () => T2('Press Step to run one line at a time. Watch the yellow line, the variables and the output.', '"एक क़दम" दबाओ: एक बार में एक पंक्ति चलेगी। पीली पंक्ति, वेरिएबल और आउटपुट देखो।'),
      draw(e, fresh) {
        const S = core.S, st = S.R ? S.R.st : null;
        markLine(panel, e ? e.line : -1, e && e.kind === 'error' ? 'err' : 'on');
        const fr = st ? st.frames[st.frames.length - 1] : { vars: {} };
        side.querySelector('.cd-vars').innerHTML = varsHTML(t, fr, S.changed, st && st.frames.length === 1 ? st.seen : null);
        side.querySelector('.cd-out').innerHTML = outHTML(t, st ? st.out : [], fresh && e && e.kind === 'print');
        const cols = st ? st.seen.slice(0, 6) : [];
        const rows = S.hist.slice(-40);
        const tw = side.querySelector('.cd-ttw');
        tw.innerHTML = `<table class="cd-tt"><thead><tr><th>#</th><th>${esc(t(T2('line', 'पंक्ति')))}</th>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr class="${i === rows.length - 1 ? 'on' : ''}"><td>${S.hist.length - rows.length + i + 1}</td><td>${r.line + 1}</td>${cols.map((c) => `<td class="${r.changed === c ? 'chg' : ''}">${esc(r.vars[c] == null ? '' : r.vars[c])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length + 2}" style="font-family:var(--font-body)">${esc(t(T2('Each step adds a row here.', 'हर क़दम पर यहाँ एक पंक्ति जुड़ेगी।')))}</td></tr>`}</tbody></table>`;
        tw.scrollTop = tw.scrollHeight;
      },
    });
    return core;
  }

  // ---------------------------------------------------------------- flowchart
  const FW = 8.7;
  const flab = (s) => (s.length > 30 ? s.slice(0, 29) + '…' : s);
  function fShape(kind, text, id) {
    const w = kind === 'dec' ? Math.max(170, Math.min(300, text.length * FW + 80)) : Math.max(kind === 'term' ? 100 : 130, Math.min(270, text.length * FW + 36));
    const h = kind === 'dec' ? 66 : kind === 'term' ? 40 : 44;
    return { w, h, ax: w / 2, parts: [{ t: 'shape', kind, text, id, x: 0, y: 0, w, h }] };
  }
  const offP = (parts, dx, dy) => parts.map((p) => (p.t === 'shape' || p.t === 'dot' ? Object.assign({}, p, { x: p.x + dx, y: p.y + dy }) : Object.assign({}, p, { pts: p.pts.map(([x, y]) => [x + dx, y + dy]), lx: p.lx + dx, ly: p.ly + dy })));
  const GAP = 30;
  function fSeq(bs) {
    const Lx = Math.max(...bs.map((b) => b.ax)), Rx = Math.max(...bs.map((b) => b.w - b.ax));
    let y = 0;
    const parts = [];
    bs.forEach((b, i) => { if (i) parts.push({ t: 'line', pts: [[Lx, y - GAP], [Lx, y]], arrow: true, lx: 0, ly: 0 }); parts.push(...offP(b.parts, Lx - b.ax, y)); y += b.h + GAP; });
    return { w: Lx + Rx, h: y - GAP, ax: Lx, parts };
  }
  function fIf(brs, mk, map) {
    const br = brs[0];
    const D = fShape('dec', flab(br.cond.src) + ' ?', 'c' + br.line);
    const A = fSeq(br.body.map(mk));
    const rest = brs.slice(1);
    if (rest.length && !rest[0].cond) map[rest[0].line] = 'c' + br.line;
    const B = rest.length ? (rest[0].cond ? fIf(rest, mk, map) : fSeq(rest[0].body.map(mk))) : null;
    const cx = Math.max(D.w / 2, A.ax), R1 = Math.max(D.w / 2, A.w - A.ax), top = D.h + GAP;
    const parts = offP(D.parts, cx - D.w / 2, 0);
    parts.push({ t: 'line', pts: [[cx, D.h], [cx, top]], arrow: true, label: 'yes', lx: cx + 8, ly: D.h + 17 });
    parts.push(...offP(A.parts, cx - A.ax, top));
    let w, my;
    if (B) {
      const bl = cx + R1 + 36, bx = bl + B.ax;
      my = top + Math.max(A.h, B.h) + GAP * 0.8;
      parts.push({ t: 'line', pts: [[cx + D.w / 2, D.h / 2], [bx, D.h / 2], [bx, top]], arrow: true, label: 'no', lx: cx + D.w / 2 + 8, ly: D.h / 2 - 8 });
      parts.push(...offP(B.parts, bl, top));
      parts.push({ t: 'line', pts: [[bx, top + B.h], [bx, my], [cx, my]], lx: 0, ly: 0 });
      w = bl + B.w;
    } else {
      const rx = cx + R1 + 28;
      my = top + A.h + GAP * 0.8;
      parts.push({ t: 'line', pts: [[cx + D.w / 2, D.h / 2], [rx, D.h / 2], [rx, my], [cx, my]], label: 'no', lx: cx + D.w / 2 + 8, ly: D.h / 2 - 8 });
      w = rx + 12;
    }
    parts.push({ t: 'line', pts: [[cx, top + A.h], [cx, my]], lx: 0, ly: 0 });
    parts.push({ t: 'dot', x: cx, y: my });
    return { w, h: my, ax: cx, parts };
  }
  function fLoop(text, id, bodyBlocks) {
    const D = fShape('dec', text, id);
    const A = fSeq(bodyBlocks);
    const cx = Math.max(D.w / 2, A.ax) + 30, R1 = Math.max(D.w / 2, A.w - A.ax), top = D.h + GAP;
    const parts = offP(D.parts, cx - D.w / 2, 0);
    parts.push({ t: 'line', pts: [[cx, D.h], [cx, top]], arrow: true, label: 'yes', lx: cx + 8, ly: D.h + 17 });
    parts.push(...offP(A.parts, cx - A.ax, top));
    const by = top + A.h + 18;
    parts.push({ t: 'line', pts: [[cx, top + A.h], [cx, by], [10, by], [10, D.h / 2], [cx - D.w / 2, D.h / 2]], arrow: true, lx: 0, ly: 0 });
    const rx = cx + R1 + 28, h = by + 28;
    parts.push({ t: 'line', pts: [[cx + D.w / 2, D.h / 2], [rx, D.h / 2], [rx, h], [cx, h]], label: 'no', lx: cx + D.w / 2 + 8, ly: D.h / 2 - 8 });
    parts.push({ t: 'dot', x: cx, y: h });
    return { w: rx + 12, h, ax: cx, parts };
  }
  function flowLayout(prog) {
    const map = {};
    const mk = (s) => {
      if (s.k === 'if') return fIf(s.branches, mk, map);
      if (s.k === 'while') return fLoop(flab(s.cond.src) + ' ?', 'c' + s.line, s.body.map(mk));
      if (s.k === 'for') return fLoop(flab(`next ${s.name} in ${s.iter.src}`) + ' ?', 'c' + s.line, s.body.map(mk));
      if (s.k === 'repeat') return fLoop(flab(`repeat ${s.count.src} times: again`) + ' ?', 'c' + s.line, s.body.map(mk));
      if (s.k === 'expr' && s.e.k === 'call' && s.e.f === 'print') return fShape('io', flab(s.src), 's' + s.line);
      return fShape('proc', flab(s.src), 's' + s.line);
    };
    return { L: fSeq([fShape('term', 'Start', 'start')].concat(prog.map(mk), [fShape('term', 'End', 'end')])), map };
  }
  const FCOL = { term: ['#22C55E', '#1E293B'], proc: ['#1D4ED8', '#FFFFFF'], dec: ['#FFD23F', '#1E293B'], io: ['#8B3DFF', '#FFFFFF'] };
  function flowSVG(Lt, t) {
    const { w, h, parts } = Lt;
    const pad = 18;
    let s = `<svg class="cd-fl" viewBox="${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}" style="width:max(100%, ${Math.round((w + pad * 2) * 0.8)}px);max-width:${Math.round((w + pad * 2) * 1.3)}px" role="img" aria-label="${esc(t(T2('Flowchart of the program', 'प्रोग्राम का फ़्लोचार्ट')))}">
      <defs><marker id="cd-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker>
      <linearGradient id="cd-gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><g style="color:var(--ink-2)">`;
    parts.filter((p) => p.t === 'line').forEach((p) => {
      s += `<polyline class="ln" points="${p.pts.map((q) => q.join(',')).join(' ')}" ${p.arrow ? 'marker-end="url(#cd-ar)"' : ''}/>`;
      if (p.label) s += `<text class="yn" x="${p.lx}" y="${p.ly}">${esc(t(p.label === 'yes' ? T2('Yes', 'हाँ') : T2('No', 'नहीं')))}</text>`;
    });
    parts.filter((p) => p.t === 'dot').forEach((p) => { s += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="currentColor"/>`; });
    s += '</g>';
    parts.filter((p) => p.t === 'shape').forEach((p) => {
      const [fill, ink] = FCOL[p.kind];
      const { x, y, w: W, h: H } = p;
      let body;
      if (p.kind === 'term') body = `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="${H / 2}"`;
      else if (p.kind === 'dec') body = `<path d="M${x + W / 2} ${y}L${x + W} ${y + H / 2}L${x + W / 2} ${y + H}L${x} ${y + H / 2}Z"`;
      else if (p.kind === 'io') body = `<path d="M${x + 14} ${y}H${x + W}L${x + W - 14} ${y + H}H${x}Z"`;
      else body = `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="8"`;
      const label = p.kind === 'term' ? t(p.text === 'Start' ? T2('Start', 'आरंभ') : T2('End', 'अंत')) : p.text;
      const tw = label.length * FW;
      const max = p.kind === 'dec' ? W - 56 : W - 22;
      s += `<g class="shp" data-sid="${p.id}">${body} fill="${fill}" class="bd"/>${body} fill="url(#cd-gl)"/>
        <text x="${x + W / 2}" y="${y + H / 2 + 4.5}" text-anchor="middle" fill="${ink}" ${tw > max ? `textLength="${max}" lengthAdjust="spacingAndGlyphs"` : ''} ${p.kind === 'term' ? 'style="font-family:var(--font-display);font-size:15px;font-weight:800"' : ''}>${esc(label)}</text>
        <g class="tick"><circle cx="${x + W - (p.kind === 'dec' ? W / 2 - 10 : 4)}" cy="${y + (p.kind === 'dec' ? 10 : 4)}" r="8" fill="#22C55E" stroke="#fff" stroke-width="2"/><path d="M${x + W - (p.kind === 'dec' ? W / 2 - 10 : 4) - 4} ${y + (p.kind === 'dec' ? 10 : 4)}l3 3 5-6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></g></g>`;
    });
    return s + '</svg>';
  }
  function flowDriver(cfg, ctx) {
    const { t, stage, side } = ctx;
    const lines = progLines(cfg);
    const prog = parseProgram(lines);
    const { L: Lt, map } = flowLayout(prog);
    stage.innerHTML = `<div class="cd-fwrap">${flowSVG(Lt, t)}</div>`;
    side.innerHTML = `<div class="cd-card"><p class="cd-h"><i style="background:#1D4ED8"></i>${esc(t(T2('The same steps as code', 'यही क़दम कोड में')))}</p>${codePanel(lines)}</div>
      <div class="cd-card"><p class="cd-h"><i style="background:#8B3DFF"></i>${esc(t(T2('Variables', 'वेरिएबल')))}</p><div class="cd-vars"></div></div>
      <div class="cd-card"><p class="cd-h"><i style="background:#22C55E"></i>${esc(t(T2('Output', 'आउटपुट')))}</p><div class="cd-out"></div></div>`;
    const panel = side.querySelector('.cd-code');
    panel.style.maxHeight = '260px';
    const wrap = stage.querySelector('.cd-fwrap');
    const seen = new Set();
    const sidOf = (e) => {
      if (!e) return 'start';
      if (e.kind === 'end') return 'end';
      if (['cond', 'for', 'forend', 'repeat', 'repeatend'].includes(e.kind)) return 'c' + e.line;
      if (e.kind === 'else') return map[e.line] || null;
      return 's' + e.line;
    };
    const core = programCore(cfg, ctx, lines, {
      intro: () => T2('Start at the green oval. Press Step: the glowing box is the step the computer does now. Diamonds ask a question with a Yes or No answer.', 'हरे अंडाकार से शुरू करो। "एक क़दम" दबाओ: चमकता डिब्बा वह क़दम है जो कंप्यूटर अभी करता है। हीरे के आकार वाले डिब्बे हाँ या नहीं वाला प्रश्न पूछते हैं।'),
      draw(e) {
        if (!e) seen.clear();
        const sid = sidOf(e);
        if (sid) seen.add(sid);
        stage.querySelectorAll('.shp').forEach((g) => { g.classList.toggle('on', g.dataset.sid === sid); g.classList.toggle('seen', seen.has(g.dataset.sid) && g.dataset.sid !== sid); });
        const on = sid && stage.querySelector(`.shp[data-sid="${sid}"]`);
        if (on && wrap.scrollHeight > wrap.clientHeight + 4) {
          const r = on.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
          if (r.top < wr.top + 10 || r.bottom > wr.bottom - 10) wrap.scrollTop += r.top - wr.top - wr.height / 3;
          if (r.left < wr.left || r.right > wr.right) wrap.scrollLeft += r.left - wr.left - wr.width / 3;
        }
        const st = core.S.R ? core.S.R.st : null;
        markLine(panel, e ? e.line : -1, e && e.kind === 'error' ? 'err' : 'on');
        side.querySelector('.cd-vars').innerHTML = varsHTML(t, st ? st.frames[0] : { vars: {} }, core.S.changed, st ? st.seen : null);
        side.querySelector('.cd-out').innerHTML = outHTML(t, st ? st.out : [], e && e.kind === 'print');
      },
    });
    return core;
  }

  // ---------------------------------------------------------------- recursion
  function treeSVG(calls, active, t) {
    if (!calls.length) return `<p class="cd-none">${esc(t(T2('The call tree grows here when a function is called.', 'फ़ंक्शन बुलाने पर कॉल ट्री यहाँ बनेगा।')))}</p>`;
    const kids = {};
    calls.forEach((k) => { (kids[k.parent] = kids[k.parent] || []).push(k); });
    const pos = {};
    let leaf = 0, maxD = 0;
    const place = (k, d) => { maxD = Math.max(maxD, d); const ch = kids[k.id] || []; if (!ch.length) pos[k.id] = { x: leaf++, d }; else { ch.forEach((c) => place(c, d + 1)); pos[k.id] = { x: (pos[ch[0].id].x + pos[ch[ch.length - 1].id].x) / 2, d }; } };
    (kids[0] || []).forEach((k) => place(k, 0));
    const lab = (k) => `${k.name}(${k.args.map((a) => (a.length > 6 ? '…' : a)).join(', ')})`;
    const NW = Math.max(74, Math.min(150, Math.max(...calls.map((k) => lab(k).length)) * 7.4 + 18)), NH = 44, XG = NW + 12, YG = 66;
    const W = Math.max(1, leaf) * XG, H = (maxD + 1) * YG;
    let s = `<svg class="cd-tree" viewBox="-6 -6 ${W + 12} ${H + 4}" role="img" aria-label="${esc(t(T2('Call tree', 'कॉल ट्री')))}" style="max-height:${Math.max(160, Math.min(420, H * 1.1 + 20))}px">`;
    calls.forEach((k) => { if (k.parent && pos[k.parent]) { const a = pos[k.parent], b = pos[k.id]; s += `<path d="M${a.x * XG + XG / 2} ${a.d * YG + NH} C${a.x * XG + XG / 2} ${a.d * YG + NH + 14} ${b.x * XG + XG / 2} ${b.d * YG - 14} ${b.x * XG + XG / 2} ${b.d * YG}" fill="none" stroke="#94A3B8" stroke-width="2"/>`; } });
    calls.forEach((k) => {
      const p = pos[k.id], x = p.x * XG + (XG - NW) / 2, y = p.d * YG;
      const on = k.id === active, col = on ? '#02CFF9' : k.done ? '#22C55E' : '#FF7A1A';
      s += `<g><rect x="${x}" y="${y}" width="${NW}" height="${NH}" rx="12" fill="${col}" ${on ? 'stroke="#FFD23F" stroke-width="4"' : ''}/>
        <text x="${x + NW / 2}" y="${y + 18}" text-anchor="middle" fill="#0F172A">${esc(lab(k))}</text>
        <text x="${x + NW / 2}" y="${y + 35}" text-anchor="middle" fill="#0F172A" style="font-size:11px">${esc(k.done ? '= ' + cut(k.ret, 12) : t(T2('waiting…', 'रुकी है…')))}</text></g>`;
    });
    return s + '</svg>';
  }
  function recursionDriver(cfg, ctx) {
    const { t, stage, side } = ctx;
    const lines = progLines(cfg);
    stage.innerHTML = codePanel(lines) + `<div class="cd-card" style="margin-top:12px"><p class="cd-h"><i style="background:#22C55E"></i>${esc(t(T2('Output', 'आउटपुट')))}</p><div class="cd-out"></div></div>`;
    side.innerHTML = `<div class="cd-card"><p class="cd-h"><i style="background:#02CFF9"></i>${esc(t(T2('Call stack (top = running now)', 'कॉल स्टैक (सबसे ऊपर = अभी चल रही)')))}</p><div class="cd-frames"></div></div>
      <div class="cd-card"><p class="cd-h"><i style="background:#FF7A1A"></i>${esc(t(T2('Call tree', 'कॉल ट्री')))} <span style="font-weight:600">· <span style="color:#FF7A1A">■</span> ${esc(t(T2('waiting', 'रुकी')))} <span style="color:#22C55E">■</span> ${esc(t(T2('returned', 'लौट आई')))}</span></p><div class="cd-treew"></div></div>`;
    const panel = stage.querySelector('.cd-code');
    const core = programCore(cfg, ctx, lines, {
      intro: () => T2('Press Step. Each call of a function gets its own box on the call stack, with its own variables. A call waits until the call it made gives back an answer.', '"एक क़दम" दबाओ। फ़ंक्शन की हर कॉल को कॉल स्टैक पर अपना डिब्बा और अपने वेरिएबल मिलते हैं। कोई कॉल तब तक रुकी रहती है जब तक उसकी बुलाई कॉल उत्तर न लौटा दे।'),
      draw(e) {
        const st = core.S.R ? core.S.R.st : null;
        const frames = st ? st.frames : [{ name: null, vars: {}, id: 0 }];
        markLine(panel, e ? e.line : -1, e && e.kind === 'error' ? 'err' : 'on', frames.slice(0, -1).map((f) => f.line));
        side.querySelector('.cd-frames').innerHTML = frames.slice().reverse().map((f, i) => {
          const vs = Object.keys(f.vars).filter((n) => n !== 'data').map((n) => `${n} = ${short(f.vars[n], 16)}`).join(', ');
          return `<div class="cd-frame ${i === 0 ? 'on' : ''} ${f.id === 0 ? 'main' : ''}"><b>${esc(f.id === 0 ? t(T2('main program', 'मुख्य प्रोग्राम')) : `${f.name}(${f.args.map((a) => cut(a, 10)).join(', ')})`)}</b>${vs && f.id !== 0 ? `<small>${esc(vs)}</small>` : ''}${i > 0 ? `<small>${esc(t(T2(`waiting at line ${f.line + 1}`, `पंक्ति ${f.line + 1} पर रुकी है`)))}</small>` : ''}</div>`;
        }).join('');
        const active = frames[frames.length - 1].id || (e && e.kind === 'ret' ? e.id : 0);
        side.querySelector('.cd-treew').innerHTML = treeSVG(st ? st.calls : [], active, t);
        stage.querySelector('.cd-out').innerHTML = outHTML(t, st ? st.out : [], e && e.kind === 'print');
      },
    });
    return core;
  }

  // ---------------------------------------------------------------- blocks (with the robot)
  function blockLabel(s, t) {
    if (s.k === 'expr' && s.e.k === 'call') {
      const f = s.e.f, a = s.e.args.map((x) => x.src).join(', ');
      if (f === 'move') return ['cd-mo', ICON.fwd, t(T2(`move ${a || 1}`, `${a || 1} क़दम चलो`)), s.src];
      if (f === 'turn_left') return ['cd-mo', ICON.left, t(T2('turn left', 'बाएँ मुड़ो')), s.src];
      if (f === 'turn_right') return ['cd-mo', ICON.right, t(T2('turn right', 'दाएँ मुड़ो')), s.src];
      if (f === 'print') return ['cd-pr', ICON.print, t(T2('print', 'छापो')), a];
    }
    if (s.k === 'repeat') return ['cd-ct', ICON.loop, t(T2(`repeat ${s.count.src} times`, `${s.count.src} बार दोहराओ`)), null];
    if (s.k === 'while') return ['cd-ct', ICON.loop, t(T2('while', 'जब तक')), s.cond.src];
    if (s.k === 'for') return ['cd-ct', ICON.loop, t(T2('for', 'हर एक के लिए')), `${s.name} in ${s.iter.src}`];
    if (s.k === 'if') return ['cd-ct', ICON.q.replace('#8B3DFF', 'currentColor'), t(T2('if', 'अगर')), s.branches[0].cond.src];
    if (s.k === 'assign') return ['cd-vr', ICON.box, t(T2('set', 'रखो')), s.src];
    return ['cd-fn', ICON.box, '', s.src];
  }
  function blocksHTML(stmts, t, openLine) {
    return stmts.map((s) => {
      const [cls, ic, word, code] = blockLabel(s, t);
      const head = `<div class="cd-blk ${cls}" data-ln="${s.line}">${ic}<span>${esc(word)}</span>${code ? `<code>${esc(code)}</code>` : ''}</div>`;
      if (s.k === 'if') return s.branches.map((b, i) => (i ? `<div class="cd-blk cd-ct" data-ln="${b.line}">${esc(b.cond ? t(T2('else if', 'नहीं तो अगर')) : t(T2('else', 'नहीं तो')))}${b.cond ? `<code>${esc(b.cond.src)}</code>` : ''}</div>` : head) + `<div class="cd-cbody">${blocksHTML(b.body, t, openLine)}</div>`).join('');
      if (s.body) return head + `<div class="cd-cbody ${s.line === openLine ? 'open' : ''}">${blocksHTML(s.body, t, openLine)}</div>`;
      return head;
    }).join('');
  }
  function worldSVG(w, g, bot, t, img) {
    const N = g.size, C = 60, P = 12, V = N * C + P * 2;
    let s = `<svg viewBox="0 0 ${V} ${V}" role="img" aria-label="${esc(t(T2(`Robot board, ${N} by ${N} squares`, `रोबोट का बोर्ड, ${N} × ${N} ख़ाने`)))}"><defs>
      <linearGradient id="cd-bd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14B8A6"/><stop offset="1" stop-color="#0F766E"/></linearGradient>
      <radialGradient id="cd-st" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF6C9"/><stop offset=".6" stop-color="#FFD23F" stop-opacity=".55"/><stop offset="1" stop-color="#FFD23F" stop-opacity="0"/></radialGradient></defs>
      <rect x="0" y="0" width="${V}" height="${V}" rx="18" fill="url(#cd-bd)"/>`;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) s += `<rect x="${P + x * C + 2}" y="${P + y * C + 2}" width="${C - 4}" height="${C - 4}" rx="9" fill="${(x + y) % 2 ? '#E6FBF4' : '#D2F5E8'}"/>`;
    g.walls.forEach((k) => { const [x, y] = k.split(',').map(Number); const X = P + x * C + 4, Y = P + y * C + 4; s += `<g><rect x="${X}" y="${Y}" width="${C - 8}" height="${C - 8}" rx="7" fill="#9A5B34"/><path d="M${X} ${Y + 17}h${C - 8}M${X} ${Y + 34}h${C - 8}M${X + 18} ${Y}v17M${X + 34} ${Y + 17}v17M${X + 14} ${Y + 34}v18" stroke="#6B3A1F" stroke-width="2.5"/><rect x="${X}" y="${Y}" width="${C - 8}" height="${C - 8}" rx="7" fill="none" stroke="#5A2F17" stroke-width="2"/></g>`; });
    w.trail.forEach(([x, y], i) => { if (i) s += `<circle cx="${P + x * C + C / 2}" cy="${P + y * C + C / 2}" r="5" fill="#2563EB" opacity=".35"/>`; });
    const gx = P + g.goal[0] * C + C / 2, gy = P + g.goal[1] * C + C / 2;
    const star = (r) => Array.from({ length: 10 }, (_, k) => { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r; return `${(gx + rr * Math.cos(a)).toFixed(1)},${(gy + rr * Math.sin(a)).toFixed(1)}`; }).join(' ');
    s += `<circle cx="${gx}" cy="${gy}" r="28" fill="url(#cd-st)"/><polygon points="${star(21)}" fill="#FFD23F" stroke="#F5B90A" stroke-width="2.5" stroke-linejoin="round"/>`;
    const bx = P + bot.x * C + C / 2, by = P + bot.y * C + C / 2;
    s += `<g id="cd-bot" transform="translate(${bx} ${by}) rotate(${bot.rot})">${img ? `<image href="${esc(img)}" x="-24" y="-24" width="48" height="48"/>` : `
      <ellipse cx="0" cy="22" rx="18" ry="4" fill="rgba(6,18,51,.25)"/>
      <path d="M0 -29l7 9h-14z" fill="#FF7A1A"/>
      <rect x="-19" y="-19" width="38" height="38" rx="11" fill="#2563EB" stroke="#1D4ED8" stroke-width="2"/>
      <rect x="-13" y="-13" width="26" height="17" rx="6" fill="#E0F2FE"/>
      <circle cx="-6" cy="-5" r="3.4" fill="#0F172A"/><circle cx="6" cy="-5" r="3.4" fill="#0F172A"/><circle cx="-5" cy="-6" r="1" fill="#fff"/><circle cx="7" cy="-6" r="1" fill="#fff"/>
      <rect x="-8" y="8" width="16" height="4" rx="2" fill="#FFD23F"/>`}</g>`;
    return s + '</svg>';
  }
  function blocksDriver(cfg, ctx) {
    const { t, api, stage, side, say, anim, animMs } = ctx;
    const g0 = cfg.grid || DEFGRID;
    const gw = mkWorld(g0);
    const img = api.asset ? api.asset('code-robot') : null;
    let lines = Array.isArray(cfg.program) ? cfg.program.slice() : [];
    let indent = 0, times = 4;
    const undo = [];
    let bot = { x: gw.x, y: gw.y, rot: gw.dir * 90 };
    stage.innerHTML = `<div class="cd-scene"></div>`;
    side.innerHTML = `<div class="cd-card"><p class="cd-h"><i style="background:#2563EB"></i>${esc(t(T2('Your program', 'तुम्हारा प्रोग्राम')))}</p><div class="cd-blocks" aria-live="polite"></div></div>
      <div class="cd-card"><p class="cd-h"><i style="background:#FF7A1A"></i>${esc(t(T2('Tap a block to add it', 'जोड़ने के लिए ब्लॉक पर टैप करो')))}</p><div class="cd-pal">
        <button type="button" class="cd-pb cd-mo" data-key="block:move">${ICON.fwd}<span>${esc(t(T2('move 1', '1 क़दम चलो')))}</span></button>
        <button type="button" class="cd-pb cd-mo" data-key="block:left">${ICON.left}<span>${esc(t(T2('turn left', 'बाएँ मुड़ो')))}</span></button>
        <button type="button" class="cd-pb cd-mo" data-key="block:right">${ICON.right}<span>${esc(t(T2('turn right', 'दाएँ मुड़ो')))}</span></button>
        <button type="button" class="cd-pb cd-ct" data-key="block:repeat">${ICON.loop}<span class="rp"></span></button>
        <button type="button" class="cd-pb cd-ct" data-key="block:times" aria-label="${esc(t(T2('Change how many times', 'कितनी बार, यह बदलो')))}"><span class="cnt"></span><span>${esc(t(T2('times ±', 'बार ±')))}</span></button>
        <button type="button" class="cd-pb cd-ct" data-key="block:end">${ICON.end}<span>${esc(t(T2('end repeat', 'दोहराना बंद')))}</span></button>
        <button type="button" class="cd-pb gh" data-key="block:undo">${ICON.undo}<span>${esc(t(T2('undo', 'वापस')))}</span></button>
        <button type="button" class="cd-pb gh" data-key="block:clear">${ICON.clear}<span>${esc(t(T2('clear all', 'सब हटाओ')))}</span></button>
      </div></div>
      <div class="cd-card"><p class="cd-h"><i style="background:#22C55E"></i>${esc(t(T2('Output', 'आउटपुट')))}</p><div class="cd-out"></div></div>`;
    const scene = stage.querySelector('.cd-scene'), blk = side.querySelector('.cd-blocks');
    let moveStop = null;
    const openLine = () => { for (let i = lines.length - 1; i >= 0; i--) { const ind = lines[i].match(/^ */)[0].length; if (/^\s*repeat\b/.test(lines[i]) && ind < indent) return i; } return -1; };
    function drawProgram(line, err) {
      const S = core.S;
      if (!lines.length) blk.innerHTML = `<p class="cd-slot">${esc(t(T2('Empty. Tap the blocks below to build a program that takes the robot to the star.', 'ख़ाली है। नीचे के ब्लॉक टैप करके ऐसा प्रोग्राम बनाओ जो रोबोट को तारे तक ले जाए।')))}</p>`;
      else if (!S.prog) blk.innerHTML = `<p class="cd-slot">${esc(lines.join(' / '))}</p>`;
      else blk.innerHTML = blocksHTML(S.prog, t, indent > 0 ? openLine() : -1) + (indent > 0 ? `<p class="cd-slot">${esc(t(T2('New blocks go inside the repeat. Tap "end repeat" to come out.', 'नए ब्लॉक दोहराने के अंदर जाएँगे। बाहर आने के लिए "दोहराना बंद" टैप करो।')))}</p>` : '');
      blk.querySelectorAll('.cd-blk').forEach((b) => b.classList.toggle(err ? 'err' : 'on', +b.dataset.ln === line));
      side.querySelector('.rp').textContent = t(T2(`repeat ${times}`, `${times} बार दोहराओ`));
      side.querySelector('.cnt').textContent = times;
    }
    function drawWorld(w) { scene.innerHTML = worldSVG(w, w, bot, t, img); }
    const atGoal = (w) => w.x === w.goal[0] && w.y === w.goal[1];
    const core = programCore(cfg, ctx, lines, {
      opts: () => ({ grid: g0 }),
      intro: () => (lines.length ? T2('Press Step to run one block at a time, or Run to watch the robot go.', 'एक-एक ब्लॉक चलाने के लिए "एक क़दम" दबाओ, या रोबोट को चलता देखने के लिए "चलाओ"।') : T2('Build a program: tap "move 1", "turn left" and "turn right". Use "repeat" for steps that come again and again.', 'प्रोग्राम बनाओ: "1 क़दम चलो", "बाएँ मुड़ो" और "दाएँ मुड़ो" टैप करो। बार-बार आने वाले क़दमों के लिए "दोहराओ" लगाओ।')),
      good: (e) => { const w = core.S.R.st.world; if (atGoal(w)) { api.celebrate(); return T2('The robot reached the star! Your program works.', 'रोबोट तारे तक पहुँच गया! तुम्हारा प्रोग्राम सही है।'); } return T2('The program finished, but the robot is not on the star. Change the blocks and try again.', 'प्रोग्राम पूरा हुआ, पर रोबोट तारे पर नहीं है। ब्लॉक बदलकर फिर कोशिश करो।'); },
      draw(e) {
        const R = core.S.R, w = R ? R.st.world : mkWorld(g0);
        drawProgram(e ? e.line : -1, e && e.kind === 'error');
        side.querySelector('.cd-out').innerHTML = outHTML(t, R ? R.st.out : [], e && e.kind === 'print');
        if (moveStop) { moveStop(); moveStop = null; }
        if (!e) { bot = { x: w.x, y: w.y, rot: w.dir * 90 }; drawWorld(w); return; }
        if (e.kind === 'move' || e.kind === 'turn') {
          const from = Object.assign({}, bot);
          const to = { x: w.x, y: w.y, rot: bot.rot + (e.kind === 'turn' ? (e.side === 'left' ? -90 : 90) : 0) };
          bot = to;
          drawWorld(w);
          const el = scene.querySelector('#cd-bot');
          const C = 60, P = 12;
          moveStop = anim(animMs(), (k) => { const q = L.ease(k); if (el) el.setAttribute('transform', `translate(${P + L.lerp(from.x, to.x, q) * C + C / 2} ${P + L.lerp(from.y, to.y, q) * C + C / 2}) rotate(${L.lerp(from.rot, to.rot, q)})`); });
        } else drawWorld(w);
        if (e.kind === 'error' && e.err.kind === 'bump') api.speak(t(T2('Bump!', 'धड़ाम!')));
      },
    });
    function edit(fn, rec) {
      undo.push({ lines: lines.slice(), indent });
      if (undo.length > 40) undo.shift();
      fn();
      core.load(lines);
      core.reset();
      api.record(t(rec));
    }
    core.block = (id, h) => {
      h.stopRun();
      const pad = ' '.repeat(indent);
      const full = () => { if (lines.length >= 24) { api.toast(T2('The program is long enough: 24 blocks at most.', 'प्रोग्राम काफ़ी लंबा है: अधिकतम 24 ब्लॉक।')); return true; } return false; };
      if (id === 'move') { if (full()) return; edit(() => lines.push(pad + 'move(1)'), T2('Added the block: move 1', 'ब्लॉक जोड़ा: 1 क़दम चलो')); }
      else if (id === 'left') { if (full()) return; edit(() => lines.push(pad + 'turn_left()'), T2('Added the block: turn left', 'ब्लॉक जोड़ा: बाएँ मुड़ो')); }
      else if (id === 'right') { if (full()) return; edit(() => lines.push(pad + 'turn_right()'), T2('Added the block: turn right', 'ब्लॉक जोड़ा: दाएँ मुड़ो')); }
      else if (id === 'repeat') {
        if (full()) return;
        if (indent >= 8) { api.toast(T2('Two repeats inside each other is the most here.', 'यहाँ अधिकतम दो दोहराने एक-दूसरे के अंदर रख सकते हैं।')); return; }
        edit(() => { lines.push(pad + `repeat ${times}:`); indent += 4; }, T2(`Added the block: repeat ${times} times`, `ब्लॉक जोड़ा: ${times} बार दोहराओ`));
      } else if (id === 'times') { times = times >= 6 ? 2 : times + 1; drawProgram(-1); }
      else if (id === 'end') {
        if (!indent) { api.toast(T2('There is no open repeat to end.', 'बंद करने के लिए कोई खुला दोहराना नहीं है।')); return; }
        const ol = openLine();
        if (ol === lines.length - 1) { api.toast(T2('Put a block inside the repeat first.', 'पहले दोहराने के अंदर कोई ब्लॉक रखो।')); return; }
        undo.push({ lines: lines.slice(), indent }); indent -= 4; core.reset();
      } else if (id === 'undo') {
        const u = undo.pop();
        if (!u) { api.toast(T2('Nothing to undo.', 'वापस लेने को कुछ नहीं।')); return; }
        lines = u.lines; indent = u.indent; core.load(lines); core.reset();
      } else if (id === 'clear') { edit(() => { lines = []; indent = 0; }, T2('Cleared the program', 'प्रोग्राम हटाया')); }
      return 'reset';
    };
    const baseStep = core.step;
    core.step = () => {
      if (!lines.length) { api.toast(T2('Add some blocks first.', 'पहले कुछ ब्लॉक जोड़ो।')); return; }
      if (!core.S.prog) { api.toast(T2('Put a block inside the repeat first.', 'पहले दोहराने के अंदर कोई ब्लॉक रखो।')); return; }
      baseStep();
    };
    Object.defineProperty(core, 'finished', { get: () => (lines.length > 0 && core.S.prog ? !!(core.S.R && core.S.R.finished) : false) });
    return core;
  }

  // ---------------------------------------------------------------- sort
  const SCOL = { base: ['#4F7CF2', '#1D4ED8'], cmp: ['#FFE070', '#F5B90A'], swap: ['#FF8A7A', '#FF6B57'], done: ['#4ADE80', '#16A34A'], min: ['#FFB067', '#FF7A1A'], prefix: ['#5EEAD4', '#0D9488'], key: ['#C4A5FF', '#8B3DFF'] };
  function sortDriver(cfg, ctx) {
    const { t, stage, side, say, anim, animMs, api } = ctx;
    const alg = sortAlg(cfg), data = dataOf(cfg);
    const F = sortFrames(alg, data);
    const mx = Math.max(...data);
    let k = 0, stopA = null;
    const SW = (ctx.root.clientWidth || 800) < 520 ? 380 : 640;
    stage.innerHTML = `<div class="cd-scene"><svg viewBox="0 0 ${SW} 330" role="img" aria-label="${esc(t(T2('Bars for the numbers being sorted', 'छाँटी जा रही संख्याओं के खंभे')))}"></svg>
      <div class="cd-stats"><div class="cd-stat"><b class="ps">0</b>${esc(t(T2('pass', 'पास')))}</div><div class="cd-stat"><b class="cp">0</b>${esc(t(T2('comparisons', 'तुलनाएँ')))}</div><div class="cd-stat"><b class="sw">0</b>${esc(t(alg === 'insertion' ? T2('shifts', 'खिसकाव') : T2('swaps', 'अदला-बदली')))}</div></div></div>`;
    side.innerHTML = `<div class="cd-card"><p class="cd-h"><i style="background:#1D4ED8"></i>${esc(t(T2('The algorithm in Python', 'पायथन में एल्गोरिद्म')))}</p>${codePanel(PSEUDO[alg])}</div>
      <div class="cd-card"><p class="cd-h"><i style="background:#22C55E"></i>${esc(t(T2('Colours', 'रंग')))}</p><div class="cd-vars">${[['cmp', T2('being compared', 'तुलना हो रही')], ['swap', alg === 'insertion' ? T2('moved', 'खिसकाया') : T2('swapped', 'अदला-बदली')], ...(alg === 'selection' ? [['min', T2('smallest so far', 'अब तक सबसे छोटा')]] : []), ...(alg === 'insertion' ? [['key', T2('key', 'key')], ['prefix', T2('sorted part', 'छँटा हिस्सा')]] : []), ['done', T2('in its final place', 'अपनी अंतिम जगह')]].map(([c, w]) => `<div class="cd-var"><span class="nm" style="background:${SCOL[c][1]};width:14px;padding:0"></span><span class="vl">${esc(t(w))}</span></div>`).join('')}</div></div>`;
    const svg = stage.querySelector('svg'), panel = side.querySelector('.cd-code');
    const n = data.length, slot = (SW - 40) / n, bw = Math.min(64, slot - (SW < 500 ? 6 : 10));
    const X = (i) => 20 + i * slot + (slot - bw) / 2;
    const Hh = (v) => 26 + (v / mx) * 196;
    function render(f, prev, q) {
      const done = new Set(f.done);
      let s = `<defs>${Object.entries(SCOL).map(([kk, [a, b]]) => `<linearGradient id="cd-s${kk}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`).join('')}</defs><line x1="10" y1="268" x2="${SW - 10}" y2="268" stroke="rgba(255,255,255,.25)" stroke-width="2"/>`;
      for (let i = 0; i < n; i++) {
        let x = X(i), v = f.a[i], lift = 0;
        if (f.swapI && q < 1 && (i === f.swapI[0] || i === f.swapI[1])) { const o = i === f.swapI[0] ? f.swapI[1] : f.swapI[0]; x = L.lerp(X(o), X(i), q); lift = -Math.sin(Math.PI * q) * 34; }
        const h = prev && !f.swapI ? L.lerp(Hh(prev.a[i]), Hh(v), q) : Hh(v);
        let c = 'base';
        if (f.final || done.has(i)) c = 'done';
        else if (f.prefix != null && i < f.prefix) c = 'prefix';
        if (f.minI === i) c = 'min';
        if (f.cmpI && f.cmpI.includes(i)) c = 'cmp';
        if ((f.swapI && f.swapI.includes(i)) || f.shiftI === i || f.placeI === i) c = 'swap';
        const hole = f.hole === i && f.key != null;
        s += `<g transform="translate(0 ${lift})" ${hole ? 'opacity=".38"' : ''}><rect x="${x}" y="${268 - h}" width="${bw}" height="${h}" rx="10" fill="url(#cd-s${c})" ${hole ? 'stroke="#fff" stroke-dasharray="6 5" stroke-width="2"' : ''}/><rect x="${x + 5}" y="${268 - h + 5}" width="${Math.max(4, bw * 0.22)}" height="${Math.max(0, h - 10)}" rx="4" fill="#fff" opacity=".22"/>
          <text x="${x + bw / 2}" y="${268 - h - 8}" text-anchor="middle" fill="#fff" style="font:800 ${bw > 40 ? 20 : 16}px var(--font-display)">${v}</text></g>
          <text x="${X(i) + bw / 2}" y="290" text-anchor="middle" fill="#94A3B8" style="font:600 13px ${MONO}">${i}</text>`;
      }
      if (f.key != null) { const kx = X(f.hole), kh = 30; s += `<g><rect x="${kx - 4}" y="${8}" width="${bw + 8}" height="${kh + 12}" rx="12" fill="url(#cd-skey)" stroke="#fff" stroke-width="2"/><text x="${kx + bw / 2}" y="${36}" text-anchor="middle" fill="#fff" style="font:800 20px var(--font-display)">${f.key}</text><text x="${kx + bw + 10}" y="${30}" fill="#E9D5FF" style="font:700 13px ${MONO}">key</text></g>`; }
      Object.entries(f.ptr || {}).forEach(([nm, i]) => { if (i >= 0 && i < n) s += `<g><path d="M${X(i) + bw / 2} 300l-7 10h14z" fill="${nm === 'i' ? '#02CFF9' : '#FFD23F'}"/><text x="${X(i) + bw / 2}" y="326" text-anchor="middle" fill="${nm === 'i' ? '#02CFF9' : '#FFD23F'}" style="font:800 14px ${MONO}">${nm}</text></g>`; });
      svg.innerHTML = s;
    }
    function show(prevF) {
      const f = F[k];
      if (stopA) { stopA(); stopA = null; }
      if (prevF && (f.swapI || f.shiftI != null || f.placeI != null)) stopA = anim(animMs(), (q) => render(f, prevF, L.ease(q)));
      else render(f, null, 1);
      markLine(panel, f.line, 'on');
      stage.querySelector('.ps').textContent = f.pass || (f.final ? '✓' : 0);
      stage.querySelector('.cp').textContent = f.cmp;
      stage.querySelector('.sw').textContent = f.swp;
      say(f.note, f.final ? 'good' : null);
    }
    return {
      get finished() { return k >= F.length - 1; },
      reset() { k = 0; show(null); },
      step() {
        if (k >= F.length - 1) return;
        const prev = F[k];
        k++;
        show(prev);
        if (F[k].final) { api.emit('output'); api.record(t(T2('Sorted the list: ', 'सूची छाँटी: ')) + F[k].a.join(', ')); api.celebrate(); }
      },
    };
  }

  // ---------------------------------------------------------------- search
  function searchDriver(cfg, ctx) {
    const { t, stage, side, say, api } = ctx;
    const alg = searchAlg(cfg), a = dataOf(cfg), x = targetOf(cfg);
    const F = searchFrames(alg, a, x);
    let k = 0;
    const SW = (ctx.root.clientWidth || 800) < 520 ? 380 : 640;
    stage.innerHTML = `<div class="cd-scene"><div class="cd-total" style="margin:4px 0 6px"><span class="cd-goal">${esc(t(T2('Looking for', 'खोज रहे हैं')))} <b style="font:800 1.4rem var(--font-display);color:#FFD23F">x = ${x}</b></span></div><svg viewBox="0 0 ${SW} 196" role="img" aria-label="${esc(t(T2('The list in boxes', 'डिब्बों में सूची')))}"></svg>
      <div class="cd-stats"><div class="cd-stat"><b class="ck">0</b>${esc(t(T2('boxes looked at', 'देखे गए डिब्बे')))}</div><div class="cd-stat"><b class="rs">?</b>${esc(t(T2('answer', 'उत्तर')))}</div></div></div>`;
    side.innerHTML = `<div class="cd-card"><p class="cd-h"><i style="background:#1D4ED8"></i>${esc(t(T2('The algorithm in Python', 'पायथन में एल्गोरिद्म')))}</p>${codePanel(PSEUDO[alg])}</div>
      <div class="cd-card"><p class="cd-h"><i style="background:#FF7A1A"></i>${esc(t(alg === 'binary' ? T2('Why it is fast', 'यह तेज़ क्यों है') : T2('How it works', 'यह कैसे काम करती है')))}</p><p class="cd-none" style="color:var(--ink)">${esc(t(alg === 'binary' ? T2(`Each look at the middle box throws away half of what is left. ${a.length} boxes need at most ${Math.floor(Math.log2(a.length)) + 1} looks. The list must be sorted.`, `बीच वाले डिब्बे को हर बार देखने से बचे हुए का आधा हिस्सा हट जाता है। ${a.length} डिब्बों के लिए अधिकतम ${Math.floor(Math.log2(a.length)) + 1} बार देखना पड़ता है। सूची छँटी हुई होनी चाहिए।`) : T2(`It checks the boxes one by one. For ${a.length} boxes it may need up to ${a.length} looks. The list need not be sorted.`, `यह डिब्बे एक-एक करके देखती है। ${a.length} डिब्बों के लिए ${a.length} बार तक देखना पड़ सकता है। सूची का छँटा होना ज़रूरी नहीं।`)))}</p></div>`;
    const svg = stage.querySelector('svg'), panel = side.querySelector('.cd-code');
    const n = a.length, slot = (SW - 40) / n, bw = Math.min(62, slot - (SW < 500 ? 5 : 8));
    const X = (i) => 20 + i * slot + (slot - bw) / 2;
    function render(f) {
      const out = new Set(f.out || []);
      let s = '';
      for (let i = 0; i < n; i++) {
        const isFound = f.found === i, isCur = f.mid === i || f.i === i;
        const fill = isFound ? '#22C55E' : isCur ? '#FFD23F' : out.has(i) ? '#334155' : '#2563EB';
        const ink = isFound || isCur ? '#1E293B' : out.has(i) ? '#94A3B8' : '#fff';
        s += `<g ${out.has(i) && !isCur ? 'opacity=".55"' : ''}><text x="${X(i) + bw / 2}" y="22" text-anchor="middle" fill="#94A3B8" style="font:600 13px ${MONO}">${i}</text>
          <rect x="${X(i)}" y="32" width="${bw}" height="${bw}" rx="12" fill="${fill}" ${isCur || isFound ? 'stroke="#fff" stroke-width="3"' : 'stroke="rgba(255,255,255,.18)"'}/>
          <text x="${X(i) + bw / 2}" y="${32 + bw / 2 + 7}" text-anchor="middle" fill="${ink}" style="font:800 ${bw > 44 ? 20 : 15}px var(--font-display)">${a[i]}</text>${out.has(i) && !isCur ? `<path d="M${X(i) + 10} ${42}l${bw - 20} ${bw - 20}" stroke="#FF6B57" stroke-width="3" stroke-linecap="round" opacity=".8"/>` : ''}</g>`;
      }
      const ptr = (i, nm, col, row) => { if (i == null || i < 0 || i >= n) return ''; return `<g><path d="M${X(i) + bw / 2} ${40 + bw + row * 30}l-7 11h14z" fill="${col}"/><text x="${X(i) + bw / 2}" y="${66 + bw + row * 30}" text-anchor="middle" fill="${col}" style="font:800 14px ${MONO}">${nm}</text></g>`; };
      if (alg === 'linear') s += ptr(f.i, 'i', '#FFD23F', 0);
      else { s += ptr(f.lo, 'lo', '#02CFF9', 1) + ptr(f.hi, 'hi', '#C4A5FF', f.hi === f.lo ? 2 : 1) + ptr(f.mid, 'mid', '#FFD23F', 0); }
      svg.innerHTML = s;
      stage.querySelector('.ck').textContent = f.checks;
      stage.querySelector('.rs').textContent = f.found == null ? '?' : f.found;
      markLine(panel, f.line, 'on');
      say(f.note, f.final ? (f.found >= 0 ? 'good' : null) : null);
    }
    return {
      get finished() { return k >= F.length - 1; },
      reset() { k = 0; render(F[0]); },
      step() {
        if (k >= F.length - 1) return;
        k++;
        render(F[k]);
        if (F[k].final) { api.emit('output'); api.record(t(T2(`Search for ${x} gave `, `${x} की खोज का उत्तर `)) + F[k].found); if (F[k].found >= 0) api.celebrate(); }
      },
    };
  }

  // ---------------------------------------------------------------- stack and queue
  const PLATE = ['#FF7A1A', '#2563EB', '#22C55E', '#8B3DFF', '#FF6B57', '#14B8A6', '#F5B90A', '#1D4ED8'];
  function sqDriver(cfg, ctx, isStack) {
    const { t, api, stage, side, say, anim, animMs } = ctx;
    const data = dataOf(cfg), cap = cfg.capacity || 5;
    const script = data.map((v) => ['in', v]).concat(data.map(() => ['out']));
    const narrow = (ctx.root.clientWidth || 800) < 520;
    const W = isStack ? 360 : narrow ? 380 : 640, H = isStack ? 380 : 230;
    const S = { items: [], next: 0, log: [], k: 0, fresh: null, gone: null, peek: null };
    const NAMES = isStack ? { in: 'push', out: 'pop' } : { in: 'enqueue', out: 'dequeue' };
    stage.innerHTML = `<div class="cd-scene"><svg viewBox="0 0 ${W} ${H}" ${isStack ? 'style="max-width:400px;margin:0 auto"' : ''} role="img" aria-label="${esc(t(isStack ? T2('A stack of plates', 'प्लेटों का स्टैक') : T2('A queue at a ticket counter', 'टिकट खिड़की पर क्यू')))}"></svg></div>`;
    side.innerHTML = `<div class="cd-card"><p class="cd-h"><i style="background:#FF7A1A"></i>${esc(t(T2('Do it yourself', 'ख़ुद करके देखो')))}</p><div class="cd-ops">
        <button type="button" class="cd-pb cd-mo" data-key="block:${NAMES.in}">${ICON.push}<span class="nx"></span></button>
        <button type="button" class="cd-pb cd-fn" data-key="block:${NAMES.out}">${ICON.pop}<span>${NAMES.out}( )</span></button>
        <button type="button" class="cd-pb cd-vr" data-key="block:peek">${ICON.peek}<span>peek( )</span></button></div>
        <p class="cd-none" style="margin-top:8px">${esc(t(isStack ? T2(`This stack holds ${cap} plates. Step does: push every value, then pop them all.`, `इस स्टैक में ${cap} प्लेटें आती हैं। "एक क़दम" से: पहले हर मान push, फिर सब pop।`) : T2(`This queue holds ${cap} people. Step does: enqueue every value, then dequeue them all.`, `इस क्यू में ${cap} लोग आते हैं। "एक क़दम" से: पहले हर मान enqueue, फिर सब dequeue।`)))}</p></div>
      <div class="cd-card"><p class="cd-h"><i style="background:#22C55E"></i>${esc(t(T2('What happened', 'क्या हुआ')))}</p><ul class="cd-log" aria-live="polite"></ul></div>`;
    const svg = stage.querySelector('svg');
    let stopA = null;
    const colOf = (v) => PLATE[Math.abs(hashS(String(v))) % PLATE.length];
    const listS = () => '[' + S.items.map((v) => repr(v)).join(', ') + ']';
    function render(q) {
      let s = '';
      if (isStack) {
        const tw = 200, x0 = (W - tw) / 2, base = 352, ph = Math.min(52, 270 / cap);
        s += `<rect x="${x0 - 14}" y="${base - cap * ph - 22}" width="${tw + 28}" height="${cap * ph + 34}" rx="18" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.35)" stroke-width="2.5" stroke-dasharray="0"/>
          <rect x="${x0 - 30}" y="${base + 6}" width="${tw + 60}" height="14" rx="7" fill="#94A3B8"/>`;
        for (let i = 0; i < cap; i++) s += `<line x1="${x0}" x2="${x0 + tw}" y1="${base - i * ph}" y2="${base - i * ph}" stroke="rgba(255,255,255,.08)"/>`;
        S.items.forEach((v, i) => {
          let y = base - (i + 1) * ph + 4;
          if (S.fresh === i && q < 1) y = L.lerp(-ph, y, q);
          const c = colOf(v);
          s += `<g><rect x="${x0 + 6}" y="${y}" width="${tw - 12}" height="${ph - 8}" rx="${(ph - 8) / 2}" fill="${c}"/><rect x="${x0 + 22}" y="${y + 4}" width="${tw - 44}" height="${(ph - 8) / 3}" rx="4" fill="#fff" opacity=".25"/><text x="${W / 2}" y="${y + (ph - 8) / 2 + 7}" text-anchor="middle" fill="#fff" style="font:800 20px var(--font-display)">${esc(v)}</text></g>`;
        });
        if (S.gone != null && q < 1) { const y = L.lerp(base - (S.items.length + 1) * ph + 4, -ph, q); s += `<g opacity="${1 - q}"><rect x="${x0 + 6 + q * 90}" y="${y}" width="${tw - 12}" height="${ph - 8}" rx="${(ph - 8) / 2}" fill="${colOf(S.gone)}"/><text x="${W / 2 + q * 90}" y="${y + (ph - 8) / 2 + 7}" text-anchor="middle" fill="#fff" style="font:800 20px var(--font-display)">${esc(S.gone)}</text></g>`; }
        if (S.items.length) { const y = base - S.items.length * ph + ph / 2; s += `<g><path d="M${x0 + tw + 20} ${y}l14 -9v18z" fill="#FFD23F"/><text x="${x0 + tw + 38}" y="${y + 5}" fill="#FFD23F" style="font:800 15px ${MONO}">top</text></g>`; }
        else s += `<text x="${W / 2}" y="${base - 30}" text-anchor="middle" fill="#94A3B8" style="font:700 15px var(--font-body)">${esc(t(T2('empty stack', 'ख़ाली स्टैक')))}</text>`;
        if (S.peek != null) s += `<text x="${W / 2}" y="26" text-anchor="middle" fill="#C4A5FF" style="font:800 15px ${MONO}">peek → ${esc(S.peek)}</text>`;
      } else {
        const slot = narrow ? Math.min(66, (W - 112) / cap) : 88, x0 = (W - cap * slot) / 2, y0 = 70, bw = slot - 12;
        const person = (x, v, op) => `<g ${op != null ? `opacity="${op}"` : ''}><circle cx="${x + bw / 2}" cy="${y0 + 20}" r="${Math.min(15, bw * 0.22)}" fill="${colOf(v)}"/><rect x="${x + bw * 0.1}" y="${y0 + 36}" width="${bw * 0.8}" height="40" rx="12" fill="${colOf(v)}"/><text x="${x + bw / 2}" y="${y0 + 63}" text-anchor="middle" fill="#fff" style="font:800 ${narrow ? 16 : 18}px var(--font-display)">${esc(v)}</text></g>`;
        s += `<rect x="${x0 - 12}" y="${y0 - 16}" width="${cap * slot + 24}" height="112" rx="18" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.3)" stroke-width="2"/>
          <path d="M${x0 - 26} ${y0 + 40}h-34" stroke="#22C55E" stroke-width="4" stroke-linecap="round" marker-end="url(#cd-qa)"/><path d="M${x0 + cap * slot + 60} ${y0 + 40}h-34" stroke="#02CFF9" stroke-width="4" stroke-linecap="round" marker-end="url(#cd-qb)"/>
          <defs><marker id="cd-qa" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#22C55E"/></marker><marker id="cd-qb" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#02CFF9"/></marker></defs>
          <text x="${x0 - 44}" y="${y0 + 80}" text-anchor="middle" fill="#22C55E" style="font:700 13px var(--font-body)">${esc(t(T2('out', 'बाहर')))}</text><text x="${x0 + cap * slot + 44}" y="${y0 + 80}" text-anchor="middle" fill="#02CFF9" style="font:700 13px var(--font-body)">${esc(t(T2('in', 'अंदर')))}</text>`;
        for (let i = 0; i < cap; i++) s += `<rect x="${x0 + i * slot + 6}" y="${y0}" width="${slot - 12}" height="80" rx="14" fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.12)" stroke-dasharray="5 5"/>`;
        S.items.forEach((v, i) => {
          let x = x0 + i * slot + 6;
          if (S.fresh === i && q < 1) x = L.lerp(W + 10, x, q);
          else if (S.gone != null && q < 1) x = L.lerp(x + slot, x, q);
          s += person(x, v);
        });
        if (S.gone != null && q < 1) { const x = L.lerp(x0 + 6, x0 - 120, q); s += person(x, S.gone, (1 - q).toFixed(2)); }
        if (S.items.length) {
          s += `<text x="${x0 + slot / 2}" y="${y0 + 124}" text-anchor="middle" fill="#FFD23F" style="font:800 14px ${MONO}">front</text>`;
          s += `<text x="${x0 + (S.items.length - 1) * slot + slot / 2}" y="${y0 + (S.items.length === 1 ? 142 : 124)}" text-anchor="middle" fill="#C4A5FF" style="font:800 14px ${MONO}">rear</text>`;
        } else s += `<text x="${W / 2}" y="${y0 + 46}" text-anchor="middle" fill="#94A3B8" style="font:700 15px var(--font-body)">${esc(t(T2('empty queue', 'ख़ाली क्यू')))}</text>`;
        if (S.peek != null) s += `<text x="${W / 2}" y="30" text-anchor="middle" fill="#C4A5FF" style="font:800 15px ${MONO}">peek → ${esc(S.peek)}</text>`;
      }
      svg.innerHTML = s;
    }
    function drawSide() {
      const nx = side.querySelector('.nx');
      nx.textContent = S.next < data.length ? `${NAMES.in}(${data[S.next]})` : `${NAMES.in}( )`;
      side.querySelector('.cd-log').innerHTML = S.log.length ? S.log.map((l, i) => `<li class="${l.bad ? 'bad' : ''} ${i === S.log.length - 1 ? 'new' : ''}">${esc(l.s)}</li>`).join('') : `<li>${esc(t(T2('Nothing yet.', 'अभी कुछ नहीं।')))}</li>`;
      const lg = side.querySelector('.cd-log'); lg.scrollTop = lg.scrollHeight;
    }
    function op(kind) {
      if (stopA) { stopA(); stopA = null; }
      S.fresh = null; S.gone = null; S.peek = null;
      if (kind === 'in') {
        if (S.next >= data.length) { api.toast(T2('All the values have been used. Press Reset to start again.', 'सारे मान इस्तेमाल हो गए। फिर से शुरू करने के लिए "फिर से" दबाओ।')); return false; }
        const v = data[S.next];
        if (S.items.length >= cap) {
          S.next++;
          S.log.push({ s: `${NAMES.in}(${repr(v)}) → ${t(isStack ? T2('Overflow! The stack is full.', 'ओवरफ़्लो! स्टैक भरा है।') : T2('Overflow! The queue is full.', 'ओवरफ़्लो! क्यू भरी है।'))}`, bad: true });
          say(isStack ? T2(`Stack overflow: there is no room for ${v}. A full stack cannot take more.`, `स्टैक ओवरफ़्लो: ${v} के लिए जगह नहीं है। भरा स्टैक और नहीं ले सकता।`) : T2(`Queue overflow: there is no room for ${v} at the rear.`, `क्यू ओवरफ़्लो: पीछे ${v} के लिए जगह नहीं है।`), 'bad');
          render(1); drawSide(); return true;
        }
        S.next++;
        S.items.push(v);
        S.fresh = S.items.length - 1;
        S.log.push({ s: `${NAMES.in}(${repr(v)}) → ${listS()}` });
        say(isStack ? T2(`push(${v}): ${v} goes on the top of the stack.`, `push(${v}): ${v} स्टैक में सबसे ऊपर रखा गया।`) : T2(`enqueue(${v}): ${v} joins at the rear of the queue.`, `enqueue(${v}): ${v} क्यू में सबसे पीछे जुड़ा।`));
      } else if (kind === 'out') {
        if (!S.items.length) {
          S.log.push({ s: `${NAMES.out}() → ${t(T2('Underflow! It is empty.', 'अंडरफ़्लो! यह ख़ाली है।'))}`, bad: true });
          say(isStack ? T2('Stack underflow: the stack is empty, so there is nothing to pop.', 'स्टैक अंडरफ़्लो: स्टैक ख़ाली है, इसलिए pop करने को कुछ नहीं।') : T2('Queue underflow: the queue is empty, so nobody can leave.', 'क्यू अंडरफ़्लो: क्यू ख़ाली है, इसलिए कोई नहीं निकल सकता।'), 'bad');
          render(1); drawSide(); return true;
        }
        const v = isStack ? S.items.pop() : S.items.shift();
        S.gone = v;
        S.log.push({ s: `${NAMES.out}() → ${repr(v)}   ${listS()}` });
        say(isStack ? T2(`pop() gives ${v}: it was the last one pushed, so it comes off first.`, `pop() ने ${v} दिया: यह सबसे आख़िर में डाला गया था, इसलिए सबसे पहले निकला।`) : T2(`dequeue() gives ${v}: it was at the front, the first to join.`, `dequeue() ने ${v} दिया: यह सबसे आगे था, सबसे पहले आया था।`));
        api.emit('output');
      } else {
        if (!S.items.length) { api.toast(isStack ? T2('The stack is empty.', 'स्टैक ख़ाली है।') : T2('The queue is empty.', 'क्यू ख़ाली है।')); return false; }
        S.peek = isStack ? S.items[S.items.length - 1] : S.items[0];
        S.log.push({ s: `peek() → ${repr(S.peek)}` });
        say(isStack ? T2(`peek() shows the top, ${S.peek}, without taking it off.`, `peek() सबसे ऊपर वाला, ${S.peek}, दिखाता है, बिना निकाले।`) : T2(`peek() shows the front, ${S.peek}, without removing it.`, `peek() सबसे आगे वाला, ${S.peek}, दिखाता है, बिना हटाए।`));
        api.emit('output');
      }
      api.record(S.log[S.log.length - 1].s);
      stopA = anim(animMs(), (q) => render(L.ease(q)));
      drawSide();
      return true;
    }
    return {
      get finished() { return S.k >= script.length; },
      reset() { if (stopA) stopA(); Object.assign(S, { items: [], next: 0, log: [], k: 0, fresh: null, gone: null, peek: null }); render(1); drawSide(); say(isStack ? T2('A stack is like a pile of plates: you add and take only at the top. Press Step, or use the buttons.', 'स्टैक प्लेटों के ढेर जैसा है: सिर्फ़ ऊपर से रखते और निकालते हैं। "एक क़दम" दबाओ, या बटन इस्तेमाल करो।') : T2('A queue is like a line at a ticket counter: people join at the rear and leave from the front. Press Step, or use the buttons.', 'क्यू टिकट खिड़की की पंक्ति जैसी है: लोग पीछे जुड़ते हैं और आगे से निकलते हैं। "एक क़दम" दबाओ, या बटन इस्तेमाल करो।')); },
      step() { if (S.k >= script.length) return; const [kind] = script[S.k]; S.k++; if (kind === 'in' && S.next >= data.length) return; op(kind); },
      block(id) { const kind = id === 'peek' ? 'peek' : id === NAMES.in ? 'in' : 'out'; if (op(kind)) api.emit('stepped'); },
    };
  }

  // ---------------------------------------------------------------- binary
  function binaryDriver(cfg, ctx) {
    const { t, api, stage, side, say } = ctx;
    const bits = cfg.bits || 8, target = targetOf(cfg);
    const rows = [];
    for (let n = target; n > 0; n = Math.floor(n / 2)) rows.push({ n, q: Math.floor(n / 2), r: n % 2 });
    const B = { v: new Array(bits).fill(0), k: 0, hit: false };
    stage.innerHTML = `<div class="cd-scene"><div class="cd-bits" style="--n:${bits}">${Array.from({ length: bits }, (_, i) => { const p = bits - 1 - i; return `<button type="button" class="cd-bit" data-key="block:bit${p}" aria-pressed="false" aria-label="${esc(t(T2(`bit for ${1 << p}`, `${1 << p} वाला बिट`)))}"><span class="pv">${1 << p}</span>${ICON.bulb}<span class="bv">0</span></button>`; }).join('')}</div>
      <div class="cd-total"><span class="big">0</span><span class="sum"></span><span class="cd-goal"></span></div></div>`;
    side.innerHTML = `<div class="cd-card"><p class="cd-h"><i style="background:#1D4ED8"></i>${esc(t(T2(`Divide by 2 to turn ${target} into binary`, `${target} को बाइनरी बनाने के लिए 2 से भाग दो`)))}</p><table class="cd-div"><tbody></tbody></table><p class="cd-none rd" style="margin-top:8px"></p></div>
      <div class="cd-card"><p class="cd-h"><i style="background:#FFD23F"></i>${esc(t(T2('How binary works', 'बाइनरी कैसे काम करती है')))}</p><p class="cd-none" style="color:var(--ink)">${esc(t(T2('Each bulb is a bit: on means 1, off means 0. Each place is worth double the place on its right: 1, 2, 4, 8, … Add the values of the bulbs that are on.', 'हर बल्ब एक बिट है: जला = 1, बुझा = 0। हर स्थान अपने दाएँ वाले स्थान से दुगुना होता है: 1, 2, 4, 8, … जले हुए बल्बों के मान जोड़ो।')))}</p></div>`;
    const total = () => B.v.reduce((s, b, p) => s + (b << p), 0);
    function draw() {
      stage.querySelectorAll('.cd-bit').forEach((el) => { const p = +el.dataset.key.slice(9); el.setAttribute('aria-pressed', B.v[p] ? 'true' : 'false'); el.querySelector('.bv').textContent = B.v[p]; });
      const tt = total();
      stage.querySelector('.big').textContent = tt;
      const on = B.v.map((b, p) => (b ? 1 << p : 0)).filter(Boolean).reverse();
      stage.querySelector('.sum').textContent = on.length ? `= ${on.join(' + ')}` : '';
      const g = stage.querySelector('.cd-goal');
      g.className = 'cd-goal' + (tt === target ? ' ok' : '');
      g.textContent = tt === target ? t(T2(`${target} = ${target.toString(2)} in binary!`, `${target} = बाइनरी में ${target.toString(2)}!`)) : t(T2(`Make ${target}`, `${target} बनाओ`));
      side.querySelector('tbody').innerHTML = rows.slice(0, B.k).map((r, i) => `<tr class="${i === B.k - 1 ? 'on' : ''}"><td>${r.n} ÷ 2</td><td>= ${r.q}</td><td>${esc(t(T2('remainder', 'शेष')))}</td><td class="r">${r.r}</td></tr>`).join('') || `<tr><td>${esc(t(T2('Press Step to divide.', 'भाग देने के लिए "एक क़दम" दबाओ।')))}</td></tr>`;
      side.querySelector('.rd').textContent = B.k >= rows.length && rows.length ? t(T2(`Read the remainders from the bottom up: ${target.toString(2)}.`, `शेषफल नीचे से ऊपर पढ़ो: ${target.toString(2)}।`)) : target === 0 ? t(T2('0 is 0 in binary too.', '0 बाइनरी में भी 0 है।')) : '';
    }
    function checkHit() {
      const hit = total() === target;
      if (hit && !B.hit) { B.hit = true; api.emit('output'); api.celebrate(); api.record(t(T2(`Made ${target} in binary: `, `बाइनरी में ${target} बनाया: `)) + target.toString(2)); }
      if (!hit) B.hit = false;
    }
    return {
      get finished() { return B.k >= rows.length && total() === target; },
      reset() { B.v.fill(0); B.k = 0; B.hit = false; draw(); say(T2(`Turn bulbs on and off to make ${target}, or press Step to find it by dividing by 2.`, `बल्ब जला-बुझाकर ${target} बनाओ, या 2 से भाग देकर पता करने के लिए "एक क़दम" दबाओ।`)); },
      step() {
        if (B.k === 0) B.v.fill(0);
        if (B.k < rows.length) {
          const r = rows[B.k];
          B.v[B.k] = r.r;
          B.k++;
          say(T2(`${r.n} ÷ 2 = ${r.q}, remainder ${r.r}. So the ${1 << (B.k - 1)}s bit is ${r.r}.${r.q === 0 ? ' The answer is 0, so stop.' : ''}`, `${r.n} ÷ 2 = ${r.q}, शेष ${r.r}। इसलिए ${1 << (B.k - 1)} वाला बिट ${r.r} है।${r.q === 0 ? ' भागफल 0 आया, इसलिए रुको।' : ''}`), B.k >= rows.length ? 'good' : null);
        } else B.k = rows.length;
        draw();
        checkHit();
      },
      block(id) {
        const p = +id.slice(3);
        if (!(p >= 0 && p < bits)) return;
        B.v[p] = 1 - B.v[p];
        draw();
        const tt = total();
        say(tt === target ? T2(`Yes! ${on(B.v)} = ${target}.`, `हाँ! ${on(B.v)} = ${target}।`) : tt > target ? T2(`${tt} is too big: turn off a bulb.`, `${tt} बहुत बड़ा है: कोई बल्ब बुझाओ।`) : T2(`${tt} so far: you need ${target - tt} more.`, `अभी ${tt} है: ${target - tt} और चाहिए।`), tt === target ? 'good' : null);
        api.emit('stepped');
        checkHit();
      },
    };
    function on(v) { return v.map((b, p) => (b ? 1 << p : 0)).filter(Boolean).reverse().join(' + ') || '0'; }
  }

  // ---------------------------------------------------------------- boolean (logic gates)
  function gatePath(k, x, y) {
    if (k === 'and' || k === 'nand') return `M${x} ${y - 22}H${x + 28}A22 22 0 0 1 ${x + 28} ${y + 22}H${x}Z`;
    if (k === 'or' || k === 'nor' || k === 'xor') return `M${x} ${y - 22}Q${x + 14} ${y} ${x} ${y + 22}Q${x + 38} ${y + 22} ${x + 52} ${y}Q${x + 38} ${y - 22} ${x} ${y - 22}Z`;
    return `M${x + 4} ${y - 18}L${x + 40} ${y}L${x + 4} ${y + 18}Z`;
  }
  function boolDriver(cfg, ctx) {
    const { t, api, stage, side, say } = ctx;
    const ex = cfg.expr || DEFEXPR, ast = parseLogic(ex), vars = varsOf(ex), rows = rowsOf(vars);
    const V = Object.fromEntries(vars.map((v) => [v, 0]));
    const seen = new Set();
    let k = -1, lastOut = null;
    // layout: leaves get rows, gates columns by depth from the output
    const depth = logicDepth(ast);
    let leaf = 0;
    const CW = 120, RH = 64;
    const nodes = [];
    (function place(n, d) {
      if (n.k === 'var') { n.y = 40 + leaf++ * RH; n.x = 40; n.d = d; nodes.push(n); return; }
      place(n.a, d + 1); if (n.b) place(n.b, d + 1);
      n.d = d; n.x = 120 + (depth - 1 - d) * CW; n.y = n.b ? (n.a.y + n.b.y) / 2 : n.a.y; nodes.push(n);
    })(ast, 0);
    const W = 120 + depth * CW + 110, H = Math.max(150, leaf * RH + 16);
    const outX = (n) => (n.k === 'var' ? n.x + 26 : n.x + (n.k === 'not' ? 54 : n.k === 'nand' || n.k === 'nor' ? 66 : 54));
    stage.innerHTML = `<div class="cd-scene"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t(T2('Logic circuit for ', 'इसका लॉजिक परिपथ: ')) + ex)}"></svg>
      <div class="cd-sws">${vars.map((v) => `<button type="button" class="cd-sw" data-key="block:${v}" aria-pressed="false" aria-label="${esc(t(T2(`Switch ${v}`, `स्विच ${v}`)))}"><span>${v}</span><span class="kn"></span><span class="bv">0</span></button>`).join('')}</div></div>`;
    side.innerHTML = `<div class="cd-card"><p class="cd-h"><i style="background:#FFD23F"></i>${esc(t(T2('Truth table', 'सत्य सारणी')))} · <code style="font-family:${MONO}">${esc(ex)}</code></p><table class="cd-truth"><thead><tr>${vars.map((v) => `<th>${v}</th>`).join('')}<th>${esc(t(T2('output', 'आउटपुट')))}</th></tr></thead><tbody></tbody></table></div>
      <div class="cd-card"><p class="cd-h"><i style="background:#8B3DFF"></i>${esc(t(T2('The gates', 'गेट')))}</p><p class="cd-none" style="color:var(--ink)">${esc(t(T2('AND gives 1 only when both inputs are 1. OR gives 1 when at least one input is 1. NOT flips 1 and 0. XOR gives 1 when the inputs are different. NAND and NOR are AND and OR followed by NOT.', 'AND तभी 1 देता है जब दोनों इनपुट 1 हों। OR तब 1 देता है जब कम से कम एक इनपुट 1 हो। NOT 1 और 0 को उलट देता है। XOR तब 1 देता है जब इनपुट अलग-अलग हों। NAND और NOR, AND और OR के बाद NOT हैं।')))}</p></div>`;
    const svg = stage.querySelector('svg');
    const ON = '#FFD23F', OFF = '#64748B';
    function draw() {
      let s = `<defs><radialGradient id="cd-lamp" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#FFFBEB"/><stop offset=".5" stop-color="#FFD23F"/><stop offset="1" stop-color="#F59E0B"/></radialGradient></defs>`;
      const val = (n) => logicEval(n, V);
      nodes.forEach((n) => {
        if (n.k === 'var') return;
        [n.a, n.b].filter(Boolean).forEach((c, i) => {
          const ty = n.b ? n.y + (i ? 11 : -11) : n.y, x1 = outX(c), x2 = n.x + (n.k === 'xor' ? 2 : n.k === 'or' || n.k === 'nor' ? 6 : 0), mxx = (x1 + x2) / 2, on = val(c);
          s += `<path d="M${x1} ${c.y}H${mxx}V${ty}H${x2}" fill="none" stroke="${on ? ON : OFF}" stroke-width="${on ? 5 : 4}" stroke-linejoin="round" ${on ? 'style="filter:drop-shadow(0 0 4px rgba(255,210,63,.8))"' : ''}/>`;
        });
      });
      nodes.forEach((n) => {
        const on = val(n);
        if (n.k === 'var') { s += `<g><circle cx="${n.x}" cy="${n.y}" r="20" fill="${on ? ON : '#1E293B'}" stroke="${on ? '#fff' : '#475569'}" stroke-width="2.5"/><text x="${n.x}" y="${n.y + 6}" text-anchor="middle" fill="${on ? '#1E293B' : '#E2E8F0'}" style="font:800 17px var(--font-display)">${n.v}</text><text x="${n.x}" y="${n.y + 36}" text-anchor="middle" fill="#94A3B8" style="font:700 12px ${MONO}">${on}</text></g>`; return; }
        const fill = on ? '#22C55E' : '#2563EB';
        s += `<g>${n.k === 'xor' ? `<path d="M${n.x - 7} ${n.y - 22}Q${n.x + 7} ${n.y} ${n.x - 7} ${n.y + 22}" fill="none" stroke="#E2E8F0" stroke-width="3"/>` : ''}<path d="${gatePath(n.k, n.x, n.y)}" fill="${fill}" stroke="#E2E8F0" stroke-width="2.5"/>
          ${n.k === 'not' || n.k === 'nand' || n.k === 'nor' ? `<circle cx="${n.x + (n.k === 'not' ? 46 : 58)}" cy="${n.y}" r="6" fill="#0B1736" stroke="#E2E8F0" stroke-width="2.5"/>` : ''}
          <text x="${n.x + (n.k === 'not' ? 18 : 24)}" y="${n.y + 4}" text-anchor="middle" fill="#fff" style="font:800 ${n.k.length > 3 ? 10 : 11}px ${MONO}">${n.k.toUpperCase()}</text></g>`;
      });
      const o = val(ast), lx = outX(ast) + 50;
      s += `<path d="M${outX(ast)} ${ast.y}H${lx - 22}" stroke="${o ? ON : OFF}" stroke-width="5"/><g>${o ? `<circle cx="${lx}" cy="${ast.y}" r="34" fill="#FFD23F" opacity=".25"/>` : ''}<circle cx="${lx}" cy="${ast.y}" r="22" fill="${o ? 'url(#cd-lamp)' : '#334155'}" stroke="#E2E8F0" stroke-width="2.5"/><path d="M${lx - 8} ${ast.y + 4}l4-8 4 8 4-8" fill="none" stroke="${o ? '#B45309' : '#64748B'}" stroke-width="2"/><text x="${lx}" y="${ast.y + 44}" text-anchor="middle" fill="${o ? ON : '#94A3B8'}" style="font:800 15px ${MONO}">${o}</text></g>`;
      svg.innerHTML = s;
      stage.querySelectorAll('.cd-sw').forEach((b) => { const v = b.dataset.key.slice(6); b.setAttribute('aria-pressed', V[v] ? 'true' : 'false'); b.querySelector('.bv').textContent = V[v]; });
      const cur = rows.findIndex((r) => vars.every((v) => r[v] === V[v]));
      side.querySelector('tbody').innerHTML = rows.map((r, i) => { const s2 = seen.has(i), out = logicEval(ast, r); return `<tr class="${i === cur ? 'on' : ''}">${vars.map((v) => `<td>${r[v]}</td>`).join('')}<td class="${s2 ? 'o' + out : ''}">${s2 ? out : '?'}</td></tr>`; }).join('');
    }
    function changed(fromStep) {
      const cur = rows.findIndex((r) => vars.every((v) => r[v] === V[v]));
      seen.add(cur);
      const o = logicEval(ast, V);
      if (o === 1 && lastOut !== 1) api.emit('output');
      lastOut = o;
      draw();
      const combo = vars.map((v) => `${v} = ${V[v]}`).join(', ');
      say(seen.size === rows.length ? T2(`${combo} gives ${o}. You have tried all ${rows.length} rows: the truth table is complete.`, `${combo} से ${o} आता है। तुमने सारी ${rows.length} पंक्तियाँ आज़मा लीं: सत्य सारणी पूरी हुई।`) : T2(`${combo}: the lamp ${o ? 'lights (1)' : 'stays off (0)'}. ${rows.length - seen.size} row${rows.length - seen.size === 1 ? '' : 's'} still to try.`, `${combo}: बल्ब ${o ? 'जलता है (1)' : 'बुझा रहता है (0)'}। अभी ${rows.length - seen.size} पंक्तियाँ बाक़ी हैं।`), seen.size === rows.length ? 'good' : null);
      if (seen.size === rows.length && !fromStep) api.record(t(T2('Completed the truth table of ', 'सत्य सारणी पूरी की: ')) + ex);
    }
    return {
      get finished() { return seen.size === rows.length; },
      reset() { vars.forEach((v) => { V[v] = 0; }); seen.clear(); k = -1; lastOut = null; draw(); say(T2('Flip the switches, or press Step to try the rows one by one. Yellow wires carry 1, grey wires carry 0.', 'स्विच बदलो, या पंक्तियाँ एक-एक करके आज़माने के लिए "एक क़दम" दबाओ। पीले तारों में 1 है, स्लेटी तारों में 0।')); },
      step() { k = (k + 1) % rows.length; let tries = 0; while (seen.has(k) && tries++ < rows.length) k = (k + 1) % rows.length; Object.assign(V, rows[k]); changed(true); },
      block(id) { if (!(id in V)) return; V[id] = 1 - V[id]; api.record(t(T2(`Switched ${id} to `, `${id} को बदला: `)) + V[id]); changed(false); api.emit('stepped'); },
    };
  }

  const DRIVERS = { trace: traceDriver, flowchart: flowDriver, recursion: recursionDriver, blocks: blocksDriver, sort: sortDriver, search: searchDriver, stack: (c, x) => sqDriver(c, x, true), queue: (c, x) => sqDriver(c, x, false), binary: binaryDriver, boolean: boolDriver };

  NCA_T.register({
    id: 'code',
    css: CSS,
    validate,
    keys,
    demo: { mode: 'trace', program: DEFPROG.trace },
    modes: MODES,
    // The pure parts, for tests under Node.
    model: { parseProgram, runAll, sortFrames, searchFrames, parseLogic, logicEval, question, repr, algProgram },
    mount(root, config, api) { return codeLab(root, config, api); },
  });
})();
