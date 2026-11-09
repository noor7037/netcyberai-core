// Template: Data table lab. Tables, SQL queries, sorting, filtering, grouping, joining and spreadsheet formulas on a
// sample dataset. The work is computed, not scripted: a real (small) SQL interpreter runs every query, including
// the ones the sort, filter, group and join screens write for the child, so what the child sees is what SQL would
// give. SQL subset: SELECT [DISTINCT] (columns, expressions, COUNT/SUM/AVG/MIN/MAX, ROUND/UPPER/LOWER/LENGTH/ABS)
// FROM t [alias] [INNER|LEFT] JOIN t2 ON ... WHERE (= <> < <= > >= AND OR NOT LIKE IN BETWEEN IS NULL) GROUP BY ...
// HAVING ... ORDER BY ... [ASC|DESC] LIMIT n. The spreadsheet has a formula parser: cell refs, ranges, + - * / ^,
// SUM AVERAGE MIN MAX COUNT ROUND. Config:
//   { mode: 'sql'|'sort-filter'|'group'|'join'|'spreadsheet',
//     tables: { <name>: { columns: [string], rows: [[number|string|null]] } },   // 1-4 tables, <=8 columns, 1-60 rows
//     task?: { en, hi },            // the job the child is given
//     query?: string }              // sql mode only: the query the editor starts with (it must run)
(function () {
  const L = window.NCA_LIB;
  const { esc } = L;
  const reduced = L.reducedMotion;
  const T2 = (en, hi) => ({ en, hi });
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const MODES = ['sql', 'sort-filter', 'group', 'join', 'spreadsheet'];
  const IDENT = /^[\p{L}_][\p{L}\p{M}\p{N}_]*$/u;

  // ---------------------------------------------------------------- the SQL interpreter (pure)
  const E = (en, hi) => { const e = new Error(en); e.en = en; e.hi = hi; e.sql = true; return e; };
  const AGG = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
  const SCALAR = ['ROUND', 'UPPER', 'LOWER', 'LENGTH', 'ABS'];
  const RESERVED = ['SELECT', 'FROM', 'WHERE', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'JOIN', 'INNER', 'LEFT', 'OUTER', 'ON', 'AS', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS', 'ASC', 'DESC', 'BY', 'DISTINCT', 'NULL'];

  function tokenize(s) {
    const out = [];
    let i = 0;
    const n = s.length;
    while (i < n) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '-' && s[i + 1] === '-') { while (i < n && s[i] !== '\n') i++; continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
        const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
        out.push({ t: 'num', v: parseFloat(m[1]), p: i }); i += m[1].length; continue;
      }
      if (c === "'" || c === '"') {
        let j = i + 1, v = '';
        for (;;) {
          if (j >= n) throw E(`The text starting at position ${i + 1} is missing its closing ${c}.`, `स्थान ${i + 1} से शुरू हुए पाठ में बंद करने वाला ${c} नहीं है।`);
          if (s[j] === c) { if (s[j + 1] === c) { v += c; j += 2; continue; } break; }
          v += s[j++];
        }
        out.push(c === "'" ? { t: 'str', v, p: i } : { t: 'id', v, u: v.toUpperCase(), q: true, p: i }); i = j + 1; continue;
      }
      const idm = /^[\p{L}_][\p{L}\p{M}\p{N}_]*/u.exec(s.slice(i));
      if (idm) { out.push({ t: 'id', v: idm[0], u: idm[0].toUpperCase(), p: i }); i += idm[0].length; continue; }
      const two = s.substr(i, 2);
      if (['<=', '>=', '<>', '!='].includes(two)) { out.push({ t: 'op', v: two === '!=' ? '<>' : two, p: i }); i += 2; continue; }
      if ('=<>+-*/(),.;'.includes(c)) { out.push({ t: 'op', v: c, p: i }); i++; continue; }
      throw E(`I do not understand the character "${c}" at position ${i + 1}.`, `स्थान ${i + 1} पर अक्षर "${c}" समझ नहीं आया।`);
    }
    out.push({ t: 'eof', p: n });
    return out;
  }

  function parse(sql) {
    const tk = tokenize(sql);
    let p = 0;
    const peek = () => tk[p];
    const near = () => {
      const x = peek();
      if (x.t === 'eof') return T2(', but the query ended', ', पर क्वेरी खत्म हो गई');
      const w = x.t === 'str' ? `'${x.v}'` : String(x.v);
      return T2(`, but found "${w}"`, `, पर "${w}" मिला`);
    };
    const bad = (needEn, needHi) => { const n = near(); return E(`Expected ${needEn}${n.en}.`, `${needHi} चाहिए${n.hi}।`); };
    const isKw = (w) => peek().t === 'id' && !peek().q && peek().u === w;
    const acceptKw = (w) => (isKw(w) ? (p++, true) : false);
    const expectKw = (w) => { if (!acceptKw(w)) throw bad(w, w); };
    const isOp = (v) => peek().t === 'op' && peek().v === v;
    const acceptOp = (v) => (isOp(v) ? (p++, true) : false);
    const expectOp = (v) => { if (!acceptOp(v)) throw bad(`"${v}"`, `"${v}"`); };
    const ident = (what) => {
      const x = peek();
      if (x.t !== 'id' || (!x.q && RESERVED.includes(x.u))) throw bad(what.en, what.hi);
      p++; return x.v;
    };

    function exprOr() { let a = exprAnd(); while (acceptKw('OR')) a = { k: 'bin', op: 'OR', a, b: exprAnd() }; return a; }
    function exprAnd() { let a = exprNot(); while (acceptKw('AND')) a = { k: 'bin', op: 'AND', a, b: exprNot() }; return a; }
    function exprNot() { if (acceptKw('NOT')) return { k: 'not', a: exprNot() }; return exprCmp(); }
    function exprCmp() {
      const a = exprAdd();
      const x = peek();
      if (x.t === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes(x.v)) { p++; return { k: 'bin', op: x.v, a, b: exprAdd() }; }
      let neg = false;
      const save = p;
      if (isKw('NOT')) { p++; neg = true; }
      if (acceptKw('LIKE')) return { k: 'like', a, b: exprAdd(), neg };
      if (acceptKw('IN')) {
        expectOp('(');
        const list = [exprOr()];
        while (acceptOp(',')) list.push(exprOr());
        expectOp(')');
        return { k: 'in', a, list, neg };
      }
      if (acceptKw('BETWEEN')) { const lo = exprAdd(); expectKw('AND'); const hi = exprAdd(); return { k: 'between', a, lo, hi, neg }; }
      if (neg) { p = save; return a; }
      if (acceptKw('IS')) { const ng = acceptKw('NOT'); expectKw('NULL'); return { k: 'isnull', a, neg: ng }; }
      return a;
    }
    function exprAdd() {
      let a = exprMul();
      while (isOp('+') || isOp('-')) { const op = peek().v; p++; a = { k: 'bin', op, a, b: exprMul() }; }
      return a;
    }
    function exprMul() {
      let a = exprUn();
      while (isOp('*') || isOp('/')) { const op = peek().v; p++; a = { k: 'bin', op, a, b: exprUn() }; }
      return a;
    }
    function exprUn() { if (acceptOp('-')) return { k: 'neg', a: exprUn() }; return exprPrim(); }
    function exprPrim() {
      const x = peek();
      if (x.t === 'num') { p++; return { k: 'num', v: x.v }; }
      if (x.t === 'str') { p++; return { k: 'str', v: x.v }; }
      if (acceptOp('(')) { const e = exprOr(); expectOp(')'); return e; }
      if (isKw('NULL')) { p++; return { k: 'null' }; }
      if (x.t === 'id' && !(!x.q && RESERVED.includes(x.u))) {
        p++;
        if (!x.q && isOp('(')) {
          const name = x.u;
          if (!AGG.includes(name) && !SCALAR.includes(name)) throw E(`I do not know the function ${x.v}(). Use ${AGG.join(', ')}.`, `फ़ंक्शन ${x.v}() मुझे नहीं पता। इनमें से चुनो: ${AGG.join(', ')}।`);
          p++;
          if (AGG.includes(name)) {
            if (acceptOp('*')) {
              if (name !== 'COUNT') throw E(`${name}(*) does not make sense; only COUNT(*) does. Give ${name} a column.`, `${name}(*) सही नहीं है; केवल COUNT(*) चलता है। ${name} को स्तंभ दो।`);
              expectOp(')');
              return { k: 'fn', name, star: true, args: [] };
            }
            const distinct = acceptKw('DISTINCT');
            const a = exprOr();
            expectOp(')');
            return { k: 'fn', name, args: [a], distinct };
          }
          const args = [];
          if (!isOp(')')) { args.push(exprOr()); while (acceptOp(',')) args.push(exprOr()); }
          expectOp(')');
          if (args.length < 1 || args.length > (name === 'ROUND' ? 2 : 1)) throw E(`${name}() is given the wrong number of values.`, `${name}() को गलत संख्या में मान दिए हैं।`);
          return { k: 'fn', name, args };
        }
        if (isOp('.')) { p++; const c = ident(T2('a column name', 'स्तंभ का नाम')); return { k: 'col', t: x.v, n: c }; }
        return { k: 'col', n: x.v };
      }
      throw bad('a column name, a number or a text value', 'स्तंभ का नाम, संख्या या पाठ');
    }

    expectKw('SELECT');
    const q = { distinct: false, items: [], from: null, joins: [], where: null, group: [], having: null, order: [], limit: null };
    q.distinct = acceptKw('DISTINCT');
    for (;;) {
      if (isOp('*')) { p++; q.items.push({ star: true }); } else {
        const x = peek(), y = tk[p + 1], z = tk[p + 2];
        if (x.t === 'id' && y.t === 'op' && y.v === '.' && z.t === 'op' && z.v === '*') { p += 3; q.items.push({ star: true, t: x.v }); } else {
          const e = exprOr();
          let alias = null;
          if (acceptKw('AS')) alias = ident(T2('a name after AS', 'AS के बाद नाम'));
          else if (peek().t === 'id' && (peek().q || !RESERVED.includes(peek().u))) alias = tk[p++].v;
          q.items.push({ e, alias });
        }
      }
      if (!acceptOp(',')) break;
    }
    if (!isKw('FROM')) throw bad('FROM and a table name', 'FROM और तालिका का नाम');
    p++;
    const tname = () => { const n = ident(T2('a table name', 'तालिका का नाम')); let al = null; if (acceptKw('AS')) al = ident(T2('an alias', 'उपनाम')); else if (peek().t === 'id' && (peek().q || !RESERVED.includes(peek().u))) al = tk[p++].v; return { name: n, alias: al }; };
    q.from = tname();
    for (;;) {
      let left = false;
      if (isKw('INNER')) { p++; expectKw('JOIN'); } else if (isKw('LEFT')) { p++; acceptKw('OUTER'); expectKw('JOIN'); left = true; } else if (isKw('JOIN')) { p++; } else if (isOp(',')) throw E('Join tables with JOIN ... ON, not with a comma.', 'तालिकाएँ अल्पविराम से नहीं, JOIN ... ON से जोड़ो।'); else break;
      const t = tname();
      if (!isKw('ON')) throw bad('ON and the matching columns, like ON a.id = b.id', 'ON और मिलते स्तंभ, जैसे ON a.id = b.id');
      p++;
      q.joins.push({ left, t, on: exprOr() });
    }
    if (acceptKw('WHERE')) q.where = exprOr();
    if (isKw('GROUP')) { p++; expectKw('BY'); q.group.push(exprOr()); while (acceptOp(',')) q.group.push(exprOr()); }
    if (acceptKw('HAVING')) q.having = exprOr();
    if (isKw('ORDER')) {
      p++; expectKw('BY');
      for (;;) { const e = exprOr(); let desc = false; if (acceptKw('DESC')) desc = true; else acceptKw('ASC'); q.order.push({ e, desc }); if (!acceptOp(',')) break; }
    }
    if (acceptKw('LIMIT')) { const x = peek(); if (x.t !== 'num' || x.v < 0 || x.v !== Math.floor(x.v)) throw bad('a whole number after LIMIT', 'LIMIT के बाद पूरी संख्या'); p++; q.limit = x.v; }
    acceptOp(';');
    if (peek().t !== 'eof') {
      const x = peek();
      if (x.t === 'id' && !x.q && ['SELECT', 'FROM', 'WHERE', 'GROUP', 'ORDER', 'HAVING'].includes(x.u)) throw E(`${x.u} is in the wrong place. The order is SELECT, FROM, JOIN, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT.`, `${x.u} गलत जगह है। क्रम है: SELECT, FROM, JOIN, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT।`);
      throw bad('the end of the query', 'क्वेरी का अंत');
    }
    return q;
  }

  const walk = (n, f) => {
    if (!n) return;
    f(n);
    if (n.a) walk(n.a, f);
    if (n.b) walk(n.b, f);
    if (n.lo) walk(n.lo, f);
    if (n.hi) walk(n.hi, f);
    (n.list || []).forEach((x) => walk(x, f));
    (n.args || []).forEach((x) => walk(x, f));
  };
  const hasAgg = (n) => { let r = false; walk(n, (x) => { if (x.k === 'fn' && AGG.includes(x.name)) r = true; }); return r; };

  function exprText(n, top) {
    const w = (s) => (top ? s : `(${s})`);
    switch (n.k) {
      case 'num': return String(n.v);
      case 'str': return `'${n.v.replace(/'/g, "''")}'`;
      case 'null': return 'NULL';
      case 'col': return (n.t ? n.t + '.' : '') + n.n;
      case 'neg': return '-' + exprText(n.a);
      case 'not': return w('NOT ' + exprText(n.a));
      case 'bin': return w(`${exprText(n.a)} ${n.op} ${exprText(n.b)}`);
      case 'like': return w(`${exprText(n.a)} ${n.neg ? 'NOT ' : ''}LIKE ${exprText(n.b)}`);
      case 'in': return w(`${exprText(n.a)} ${n.neg ? 'NOT ' : ''}IN (${n.list.map((x) => exprText(x, true)).join(', ')})`);
      case 'between': return w(`${exprText(n.a)} ${n.neg ? 'NOT ' : ''}BETWEEN ${exprText(n.lo)} AND ${exprText(n.hi)}`);
      case 'isnull': return w(`${exprText(n.a)} IS ${n.neg ? 'NOT ' : ''}NULL`);
      case 'fn': return n.star ? `${n.name}(*)` : `${n.name}(${n.distinct ? 'DISTINCT ' : ''}${n.args.map((x) => exprText(x, true)).join(', ')})`;
      default: return '?';
    }
  }

  const cmpVals = (a, b) => {
    if (isNum(a) && isNum(b)) return a - b;
    const x = String(a).toLowerCase(), y = String(b).toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  };
  const toNumLoose = (v) => (isNum(v) ? v : typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)) ? Number(v) : NaN);

  function runSQL(sql, tables) {
    const q = parse(sql);
    const tmap = {};
    Object.keys(tables).forEach((k) => { tmap[k.toLowerCase()] = k; });
    const srcs = [];
    const addSrc = (r) => {
      const key = tmap[r.name.toLowerCase()];
      if (!key) throw E(`There is no table called "${r.name}". The tables are: ${Object.keys(tables).join(', ')}.`, `"${r.name}" नाम की कोई तालिका नहीं है। तालिकाएँ हैं: ${Object.keys(tables).join(', ')}।`);
      const al = r.alias || key;
      if (srcs.some((s) => s.alias.toLowerCase() === al.toLowerCase())) throw E(`The name "${al}" is used twice. Give the second table an alias, like FROM ${key} ${key[0].toLowerCase()}2.`, `नाम "${al}" दो बार आया है। दूसरी तालिका को उपनाम दो।`);
      srcs.push({ alias: al, name: key, t: tables[key] });
    };
    addSrc(q.from);
    q.joins.forEach((j) => addSrc(j.t));

    const cache = new Map();
    function resolve(n) {
      const key = (n.t || '').toLowerCase() + '.' + n.n.toLowerCase();
      if (cache.has(key)) return cache.get(key);
      const found = [];
      srcs.forEach((s, si) => {
        if (n.t && s.alias.toLowerCase() !== n.t.toLowerCase()) return;
        const ci = s.t.columns.findIndex((c) => c.toLowerCase() === n.n.toLowerCase());
        if (ci >= 0) found.push({ si, ci });
      });
      if (n.t && !srcs.some((s) => s.alias.toLowerCase() === n.t.toLowerCase())) throw E(`"${n.t}" is not a table in this query. Use the table name (or its alias) before the dot.`, `"${n.t}" इस क्वेरी की तालिका नहीं है। बिंदु से पहले तालिका का नाम (या उपनाम) लिखो।`);
      if (!found.length) {
        const all = srcs.map((s) => s.t.columns.join(', ')).join(' | ');
        throw E(n.t ? `The table ${n.t} has no column "${n.n}".` : `There is no column called "${n.n}". Columns here: ${all}.`, n.t ? `तालिका ${n.t} में "${n.n}" नाम का स्तंभ नहीं है।` : `"${n.n}" नाम का कोई स्तंभ नहीं है। यहाँ के स्तंभ: ${all}।`);
      }
      if (found.length > 1) throw E(`The column "${n.n}" is in more than one table. Write it as table.${n.n}.`, `स्तंभ "${n.n}" एक से ज़्यादा तालिकाओं में है। इसे तालिका.${n.n} लिखो।`);
      cache.set(key, found[0]);
      return found[0];
    }

    const truthy = (v) => v === true || (isNum(v) && v !== 0);
    const num = (v) => {
      if (v == null) return null;
      const x = toNumLoose(v);
      if (isNaN(x)) throw E(`Cannot do arithmetic on the text "${v}".`, `पाठ "${v}" पर गणित नहीं हो सकता।`);
      return x;
    };
    function likeRe(pat) { return new RegExp('^' + String(pat).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'is'); }

    function agg(n, group) {
      if (n.star) return group.length;
      let vals = group.map((e) => ev(n.args[0], { rows: e.rows })).filter((v) => v != null);
      if (n.distinct) vals = [...new Set(vals)];
      if (n.name === 'COUNT') return vals.length;
      if (!vals.length) return null;
      if (n.name === 'MIN' || n.name === 'MAX') return vals.reduce((a, b) => ((cmpVals(b, a) < 0) === (n.name === 'MIN') ? b : a));
      const ns = vals.map((v) => { if (!isNum(v)) throw E(`${n.name}() needs a number column, but it found the text "${v}".`, `${n.name}() को संख्या वाला स्तंभ चाहिए, पर पाठ "${v}" मिला।`); return v; });
      const s = ns.reduce((a, b) => a + b, 0);
      return n.name === 'SUM' ? s : s / ns.length;
    }

    function ev(n, env) {
      switch (n.k) {
        case 'num': case 'str': return n.v;
        case 'null': return null;
        case 'col': { const r = resolve(n); const row = env.rows[r.si]; return row ? row[r.ci] : null; }
        case 'neg': { const v = num(ev(n.a, env)); return v == null ? null : -v; }
        case 'not': { const v = ev(n.a, env); return v == null ? null : !truthy(v); }
        case 'bin': {
          if (n.op === 'AND' || n.op === 'OR') {
            const a = ev(n.a, env), b = ev(n.b, env);
            const ta = a == null ? null : truthy(a), tb = b == null ? null : truthy(b);
            if (n.op === 'AND') return ta === false || tb === false ? false : ta == null || tb == null ? null : true;
            return ta === true || tb === true ? true : ta == null || tb == null ? null : false;
          }
          const a = ev(n.a, env), b = ev(n.b, env);
          if (['+', '-', '*', '/'].includes(n.op)) {
            const x = num(a), y = num(b);
            if (x == null || y == null) return null;
            return n.op === '+' ? x + y : n.op === '-' ? x - y : n.op === '*' ? x * y : y === 0 ? null : x / y;
          }
          if (a == null || b == null) return null;
          let c;
          if (isNum(a) !== isNum(b)) { const x = toNumLoose(a), y = toNumLoose(b); if (isNaN(x) || isNaN(y)) return n.op === '<>'; c = x - y; } else c = cmpVals(a, b);
          return n.op === '=' ? c === 0 : n.op === '<>' ? c !== 0 : n.op === '<' ? c < 0 : n.op === '<=' ? c <= 0 : n.op === '>' ? c > 0 : c >= 0;
        }
        case 'like': { const a = ev(n.a, env), b = ev(n.b, env); if (a == null || b == null) return null; const r = likeRe(b).test(String(a)); return n.neg ? !r : r; }
        case 'in': {
          const a = ev(n.a, env);
          if (a == null) return null;
          const vs = n.list.map((x) => ev(x, env));
          const hit = vs.some((v) => v != null && (isNum(a) !== isNum(v) ? toNumLoose(a) === toNumLoose(v) : cmpVals(a, v) === 0));
          return n.neg ? !hit : hit;
        }
        case 'between': {
          const a = ev(n.a, env), lo = ev(n.lo, env), hi = ev(n.hi, env);
          if (a == null || lo == null || hi == null) return null;
          const r = cmpVals(a, lo) >= 0 && cmpVals(a, hi) <= 0;
          return n.neg ? !r : r;
        }
        case 'isnull': { const r = ev(n.a, env) == null; return n.neg ? !r : r; }
        case 'fn': {
          if (AGG.includes(n.name)) {
            if (!env.group) throw E(`${n.name}() adds up many rows, so it cannot be used in WHERE or ON. Use WHERE first, then GROUP BY, then HAVING ${n.name}(...).`, `${n.name}() कई पंक्तियों पर काम करता है, इसलिए WHERE या ON में नहीं चलता। पहले WHERE, फिर GROUP BY, फिर HAVING ${n.name}(...) लिखो।`);
            return agg(n, env.group);
          }
          const v = ev(n.args[0], env);
          if (v == null) return null;
          if (n.name === 'UPPER') return String(v).toUpperCase();
          if (n.name === 'LOWER') return String(v).toLowerCase();
          if (n.name === 'LENGTH') return String(v).length;
          const x = num(v);
          if (n.name === 'ABS') return Math.abs(x);
          const d = n.args[1] ? num(ev(n.args[1], env)) : 0;
          const f = Math.pow(10, d || 0);
          return Math.round(x * f) / f;
        }
        default: return null;
      }
    }

    // FROM and JOIN
    const stages = [];
    let envs = srcs[0].t.rows.map((r, i) => ({ rows: [r], rid: i }));
    stages.push({ k: 'from', n: envs.length });
    q.joins.forEach((j, ji) => {
      const si = ji + 1;
      const next = [];
      envs.forEach((env) => {
        let matched = false;
        for (const row of srcs[si].t.rows) {
          const e2 = { rows: env.rows.concat([row]), rid: env.rid };
          if (truthy(ev(j.on, e2))) { next.push(e2); matched = true; }
        }
        if (j.left && !matched) next.push({ rows: env.rows.concat([null]), rid: env.rid });
      });
      envs = next;
      if (next.length > 20000) throw E('That join makes too many rows. Check the ON condition.', 'यह जोड़ बहुत अधिक पंक्तियाँ बनाता है। ON शर्त जाँचो।');
    });
    if (q.joins.length) stages.push({ k: 'join', n: envs.length });
    if (q.where) {
      envs = envs.filter((e) => truthy(ev(q.where, e)));
      stages.push({ k: 'where', n: envs.length });
    }

    const itemsAgg = q.items.some((it) => it.e && hasAgg(it.e));
    const grouped = q.group.length > 0 || itemsAgg || (q.having && hasAgg(q.having));
    // column names of the output
    const cols = [];
    const sels = []; // {e, alias} after star expansion
    const dupCount = {};
    srcs.forEach((s) => s.t.columns.forEach((c) => { dupCount[c.toLowerCase()] = (dupCount[c.toLowerCase()] || 0) + 1; }));
    q.items.forEach((it) => {
      if (it.star) {
        if (grouped) throw E('* cannot be used together with GROUP BY or COUNT/SUM. Name the columns you want.', '* को GROUP BY या COUNT/SUM के साथ नहीं रख सकते। जो स्तंभ चाहिए उनके नाम लिखो।');
        srcs.forEach((s, si) => {
          if (it.t && s.alias.toLowerCase() !== it.t.toLowerCase()) return;
          s.t.columns.forEach((c) => { sels.push({ e: { k: 'col', t: s.alias, n: c }, name: dupCount[c.toLowerCase()] > 1 && srcs.length > 1 ? s.alias + '.' + c : c }); });
        });
        if (it.t && !srcs.some((s) => s.alias.toLowerCase() === it.t.toLowerCase())) throw E(`"${it.t}" is not a table in this query.`, `"${it.t}" इस क्वेरी की तालिका नहीं है।`);
      } else {
        let name = it.alias;
        if (!name) { if (it.e.k === 'col') { const r = resolve(it.e); name = srcs[r.si].t.columns[r.ci]; } else name = exprText(it.e, true); }
        sels.push({ e: it.e, name });
      }
    });
    sels.forEach((s) => cols.push(s.name));

    let outs; // {vals, env}
    if (grouped) {
      const gsig = (n) => { if (n.k === 'col') { const r = resolve(n); return 'c' + r.si + '.' + r.ci; } return exprText(n).toLowerCase(); };
      const gs = q.group.map(gsig);
      const check = (n, where) => {
        if (n.k === 'fn' && AGG.includes(n.name)) { walk(n.args[0] || null, (x) => { if (x.k === 'fn' && AGG.includes(x.name)) throw E('One aggregate cannot sit inside another.', 'एक एग्रीगेट दूसरे के अंदर नहीं आ सकता।'); }); return; }
        if (gs.includes(gsig(n))) return;
        if (n.k === 'col') throw E(`The column "${n.n}" must be in GROUP BY (or inside COUNT/SUM/AVG/MIN/MAX) because each group shows one row.${where ? '' : ''}`, `स्तंभ "${n.n}" GROUP BY में (या COUNT/SUM/AVG/MIN/MAX के अंदर) होना चाहिए, क्योंकि हर समूह एक पंक्ति दिखाता है।`);
        ['a', 'b', 'lo', 'hi'].forEach((k) => { if (n[k]) check(n[k], where); });
        (n.list || []).concat(n.args || []).forEach((x) => check(x, where));
      };
      sels.forEach((s) => check(s.e));
      if (q.having) check(q.having);
      q.order.forEach((o) => { if (!(o.e.k === 'num' || (o.e.k === 'col' && !o.e.t && sels.some((s) => s.name.toLowerCase() === o.e.n.toLowerCase())))) check(o.e); });
      const map = new Map();
      envs.forEach((e) => {
        const key = JSON.stringify(q.group.map((g) => ev(g, e)));
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(e);
      });
      let groups = [...map.values()];
      if (!q.group.length && !groups.length) groups = [[]];
      let genvs = groups.map((g) => ({ rows: g.length ? g[0].rows : [], group: g, rid: -1 }));
      stages.push({ k: 'group', n: genvs.length });
      if (q.having) { genvs = genvs.filter((e) => truthy(ev(q.having, e))); stages.push({ k: 'having', n: genvs.length }); }
      outs = genvs.map((e) => ({ vals: sels.map((s) => ev(s.e, e)), env: e }));
    } else {
      if (q.having) throw E('HAVING needs GROUP BY (or COUNT/SUM). To keep rows, use WHERE.', 'HAVING के लिए GROUP BY (या COUNT/SUM) चाहिए। पंक्तियाँ छाँटने के लिए WHERE लिखो।');
      outs = envs.map((e) => ({ vals: sels.map((s) => ev(s.e, e)), env: e }));
    }
    if (q.order.length) {
      const keyOf = (o, out) => {
        if (o.e.k === 'num') { if (o.e.v < 1 || o.e.v > sels.length) throw E(`ORDER BY ${o.e.v} is out of range; there are ${sels.length} columns.`, `ORDER BY ${o.e.v} सीमा से बाहर है; ${sels.length} स्तंभ हैं।`); return out.vals[o.e.v - 1]; }
        if (o.e.k === 'col' && !o.e.t) { const i = sels.findIndex((s) => s.name.toLowerCase() === o.e.n.toLowerCase()); if (i >= 0) return out.vals[i]; }
        return ev(o.e, out.env);
      };
      const keyed = outs.map((o, i) => ({ o, i, k: q.order.map((d) => keyOf(d, o)) }));
      keyed.sort((x, y) => {
        for (let j = 0; j < q.order.length; j++) {
          const a = x.k[j], b = y.k[j];
          if (a == null && b == null) continue;
          const c = a == null ? -1 : b == null ? 1 : cmpVals(a, b);
          if (c) return q.order[j].desc ? -c : c;
        }
        return x.i - y.i;
      });
      outs = keyed.map((x) => x.o);
      stages.push({ k: 'order' });
    }
    if (q.distinct) {
      const seen = new Set();
      outs = outs.filter((o) => { const k = JSON.stringify(o.vals); if (seen.has(k)) return false; seen.add(k); return true; });
      stages.push({ k: 'distinct', n: outs.length });
    }
    if (q.limit != null) { outs = outs.slice(0, q.limit); stages.push({ k: 'limit', n: outs.length }); }
    stages.push({ k: 'select', n: outs.length });
    return { columns: cols, rows: outs.map((o) => o.vals), ids: outs.map((o) => (grouped ? -1 : o.env.rid)), stages, grouped, joined: q.joins.length > 0 };
  }

  // ---------------------------------------------------------------- spreadsheet formulas (pure)
  const FE = (code) => { const e = new Error(code); e.fcode = code; return e; };
  const colLetter = (i) => String.fromCharCode(65 + i);
  function evalFormula(src, get, ncols) {
    let s = String(src).trim();
    if (s[0] === '=') s = s.slice(1);
    if (!s.trim()) throw FE('#EMPTY');
    const toks = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      let m;
      if ((m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i)))) { toks.push({ t: 'n', v: parseFloat(m[1]) }); i += m[1].length; continue; }
      if ((m = /^[A-Za-z]+\d*/.exec(s.slice(i)))) {
        const w = m[0].toUpperCase();
        const cell = /^([A-Z])(\d+)$/.exec(w);
        if (cell) toks.push({ t: 'r', c: cell[1].charCodeAt(0) - 65, r: parseInt(cell[2], 10) });
        else if (/^[A-Z]+$/.test(w)) toks.push({ t: 'f', v: w });
        else throw FE('#NAME?');
        i += m[0].length; continue;
      }
      if ('+-*/^(),:'.includes(c)) { toks.push({ t: 'o', v: c }); i++; continue; }
      throw FE('#NAME?');
    }
    let p = 0;
    const refs = [];
    const peek = () => toks[p];
    const isO = (v) => peek() && peek().t === 'o' && peek().v === v;
    function cellVal(c, r) {
      if (c < 0 || c >= ncols || r < 1) throw FE('#REF!');
      return get(c, r);
    }
    function expr() {
      let a = term();
      while (isO('+') || isO('-')) { const op = toks[p++].v; const b = term(); a = op === '+' ? a + b : a - b; }
      return a;
    }
    function term() {
      let a = pow();
      while (isO('*') || isO('/')) { const op = toks[p++].v; const b = pow(); if (op === '/') { if (b === 0) throw FE('#DIV/0!'); a /= b; } else a *= b; }
      return a;
    }
    function pow() { const a = un(); if (isO('^')) { p++; return Math.pow(a, pow()); } return a; }
    function un() { if (isO('-')) { p++; return -un(); } if (isO('+')) { p++; return un(); } return prim(); }
    function asNum(v) { if (v == null || v === '') return 0; if (isNum(v)) return v; throw FE('#VALUE!'); }
    function argList() {
      const out = [];
      if (isO(')')) return out;
      for (;;) {
        const t = peek();
        if (t && t.t === 'r' && toks[p + 1] && toks[p + 1].t === 'o' && toks[p + 1].v === ':') {
          const t2 = toks[p + 2];
          if (!t2 || t2.t !== 'r') throw FE('#NAME?');
          p += 3;
          const c1 = Math.min(t.c, t2.c), c2 = Math.max(t.c, t2.c), r1 = Math.min(t.r, t2.r), r2 = Math.max(t.r, t2.r);
          if (c2 >= ncols || r1 < 1) throw FE('#REF!');
          refs.push({ c1, c2, r1, r2 });
          const vals = [];
          for (let c = c1; c <= c2; c++) for (let r = r1; r <= r2; r++) vals.push({ range: true, v: cellVal(c, r) });
          vals.forEach((x) => out.push(x));
        } else out.push({ range: false, v: expr(), direct: true });
        if (isO(',')) { p++; continue; }
        break;
      }
      return out;
    }
    function prim() {
      const t = toks[p++];
      if (!t) throw FE('#SYNTAX');
      if (t.t === 'n') return t.v;
      if (t.t === 'r') {
        if (isO(':')) throw FE('#SYNTAX');
        const v = cellVal(t.c, t.r);
        refs.push({ c1: t.c, c2: t.c, r1: t.r, r2: t.r });
        return asNum(v);
      }
      if (t.t === 'o' && t.v === '(') { const v = expr(); if (!isO(')')) throw FE('#SYNTAX'); p++; return v; }
      if (t.t === 'f') {
        if (!isO('(')) throw FE('#NAME?');
        p++;
        const args = argList();
        if (!isO(')')) throw FE('#SYNTAX');
        p++;
        const nums = args.filter((a) => isNum(a.v)).map((a) => a.v);
        switch (t.v) {
          case 'SUM': return nums.reduce((a, b) => a + b, 0);
          case 'AVERAGE': case 'AVG': if (!nums.length) throw FE('#DIV/0!'); return nums.reduce((a, b) => a + b, 0) / nums.length;
          case 'MIN': return nums.length ? Math.min(...nums) : 0;
          case 'MAX': return nums.length ? Math.max(...nums) : 0;
          case 'COUNT': return nums.length;
          case 'ROUND': { if (args.length < 1 || args.length > 2) throw FE('#VALUE!'); const x = asNum(args[0].v), d = args[1] ? asNum(args[1].v) : 0; const f = Math.pow(10, d); return Math.round(x * f) / f; }
          default: throw FE('#NAME?');
        }
      }
      throw FE('#SYNTAX');
    }
    const v = expr();
    if (p < toks.length) throw FE('#SYNTAX');
    if (!isFinite(v)) throw FE('#NUM!');
    return { v: Math.round(v * 1e9) / 1e9, refs };
  }
  const FERR = {
    '#DIV/0!': T2('You divided by zero. Check the cells you divide by.', 'तुमने शून्य से भाग दिया। भाजक वाले खानों को जाँचो।'),
    '#NAME?': T2('I do not know a word in the formula. Use SUM, AVERAGE, MIN, MAX, COUNT or ROUND, and cells like B2.', 'सूत्र का कोई शब्द मुझे नहीं पता। SUM, AVERAGE, MIN, MAX, COUNT या ROUND और B2 जैसे खाने लिखो।'),
    '#VALUE!': T2('A cell with words was used in a sum. Only numbers can be added.', 'शब्दों वाला खाना जोड़ में आ गया। केवल संख्याएँ जोड़ी जा सकती हैं।'),
    '#REF!': T2('That cell or column is not in the sheet.', 'यह खाना या स्तंभ शीट में नहीं है।'),
    '#SYNTAX': T2('The formula is not complete. Check the brackets and commas, like =SUM(B2:B9).', 'सूत्र पूरा नहीं है। कोष्ठक और अल्पविराम जाँचो, जैसे =SUM(B2:B9)।'),
    '#NUM!': T2('The answer is too big or not a number.', 'उत्तर बहुत बड़ा है या संख्या नहीं है।'),
    '#EMPTY': T2('Type a formula first, like =SUM(B2:B9).', 'पहले सूत्र लिखो, जैसे =SUM(B2:B9)।'),
  };

  // ---------------------------------------------------------------- data helpers
  const colType = (tb, i) => {
    const vs = tb.rows.map((r) => r[i]).filter((v) => v != null);
    return vs.length && vs.every(isNum) ? 'num' : 'text';
  };
  const ID_LIKE = /^(id|roll|no|code|year|pin|class|sr|s_no|sno)$|_id$|^id_|_no$/i;
  const measureCols = (tb) => {
    const all = tb.columns.map((c, i) => i).filter((i) => colType(tb, i) === 'num');
    const m = all.filter((i) => !ID_LIKE.test(tb.columns[i]));
    return m.length ? m : all;
  };
  const textCols = (tb) => tb.columns.map((c, i) => i).filter((i) => colType(tb, i) === 'text');
  const distinctOf = (tb, i) => [...new Set(tb.rows.map((r) => r[i]).filter((v) => v != null))];
  const hash = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619); return x >>> 0; };
  const rnd = (v) => (isNum(v) ? Math.round(v * 100) / 100 : v);
  const fmt = (v) => (v == null ? 'NULL' : isNum(v) ? String(rnd(v)) : String(v));
  const lit = (v) => (isNum(v) ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
  const sharedCols = (a, b) => a.columns.filter((c) => b.columns.some((d) => d.toLowerCase() === c.toLowerCase()) && colType(a, a.columns.indexOf(c)) === colType(b, b.columns.findIndex((d) => d.toLowerCase() === c.toLowerCase())));

  // ---------------------------------------------------------------- validation
  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
    Object.keys(c).forEach((k) => { if (!['mode', 'tables', 'task', 'query'].includes(k)) e.push('unknown key: ' + k); });
    if (!MODES.includes(c.mode)) e.push('mode must be one of ' + MODES.join(', '));
    const tb = c.tables;
    if (!tb || typeof tb !== 'object' || Array.isArray(tb)) { e.push('tables: an object {name: {columns, rows}}'); return e; }
    const names = Object.keys(tb);
    if (names.length < 1 || names.length > 4) e.push('tables: 1 to 4 tables');
    if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) e.push('tables: names must differ ignoring capitals');
    names.forEach((n) => {
      const t = tb[n];
      if (!IDENT.test(n)) e.push(`table name "${n}": letters, digits and _ only, not starting with a digit`);
      if (!t || !Array.isArray(t.columns) || !Array.isArray(t.rows)) { e.push(`table ${n}: needs columns [..] and rows [[..]]`); return; }
      Object.keys(t).forEach((k) => { if (!['columns', 'rows'].includes(k)) e.push(`table ${n}: unknown key ${k}`); });
      if (t.columns.length < 1 || t.columns.length > 8) e.push(`table ${n}: 1 to 8 columns`);
      t.columns.forEach((col) => { if (typeof col !== 'string' || !IDENT.test(col)) e.push(`table ${n}: column name "${col}" must be letters, digits and _ (no spaces)`); else if (RESERVED.includes(col.toUpperCase())) e.push(`table ${n}: column name "${col}" is an SQL word; choose another`); });
      if (new Set(t.columns.map((x) => String(x).toLowerCase())).size !== t.columns.length) e.push(`table ${n}: column names must differ`);
      if (t.rows.length < 1 || t.rows.length > 60) e.push(`table ${n}: 1 to 60 rows`);
      let shapeOk = true;
      t.rows.forEach((r, ri) => {
        if (!Array.isArray(r) || r.length !== t.columns.length) { e.push(`table ${n} row ${ri + 1}: needs ${t.columns.length} values`); shapeOk = false; return; }
        r.forEach((v, ci) => { if (!(v === null || isNum(v) || (typeof v === 'string' && v.length <= 60))) e.push(`table ${n} row ${ri + 1}, column ${t.columns[ci]}: use a number, a short text or null`); });
      });
      if (shapeOk) t.columns.forEach((col, ci) => {
        const kinds = new Set(t.rows.map((r) => r[ci]).filter((v) => v != null).map((v) => typeof v));
        if (kinds.size > 1) e.push(`table ${n}: column ${col} mixes numbers and text`);
      });
    });
    if (e.length) return e;
    const first = tb[names[0]];
    if (c.mode === 'group') {
      if (!measureCols(first).length) e.push('group mode: the first table needs a number column to add up');
      if (first.columns.length < 2) e.push('group mode: the first table needs at least 2 columns');
    }
    if (c.mode === 'join') {
      if (names.length !== 2) e.push('join mode: exactly 2 tables');
      else if (!sharedCols(tb[names[0]], tb[names[1]]).length) e.push('join mode: the two tables need a column with the same name and kind (to join on)');
    }
    if (c.mode === 'spreadsheet' && !measureCols(first).length) e.push('spreadsheet mode: the first table needs a number column');
    if (c.task != null) {
      if (!c.task || typeof c.task.en !== 'string' || typeof c.task.hi !== 'string' || !c.task.en.trim() || !c.task.hi.trim() || c.task.en.length > 400 || c.task.hi.length > 400) e.push('task: {en, hi} non-empty texts, at most 400 characters');
    }
    if (c.query != null) {
      if (c.mode !== 'sql') e.push('query: only for sql mode');
      else if (typeof c.query !== 'string' || !c.query.trim() || c.query.length > 600) e.push('query: a non-empty text of at most 600 characters');
      else { try { runSQL(c.query, tb); } catch (x) { e.push('query does not run: ' + (x.en || x.message)); } }
    }
    return e;
  }

  function keys(c) {
    const out = { targets: [], events: ['queried', 'result', 'answered:right', 'answered:wrong'] };
    const tb = c && c.tables && typeof c.tables === 'object' ? c.tables : {};
    const names = Object.keys(tb).filter((n) => tb[n] && Array.isArray(tb[n].columns));
    const mode = c && c.mode;
    const colsOf = (list) => [...new Set(list.flatMap((n) => tb[n].columns))].map((x) => 'column:' + x);
    if (mode === 'sql') out.targets = ['run'].concat(colsOf(names), ['answer']);
    else if (mode === 'sort-filter') out.targets = colsOf(names.slice(0, 1)).concat(['filter', 'answer']);
    else if (mode === 'group') out.targets = ['run'].concat(colsOf(names.slice(0, 1)), ['filter', 'answer']);
    else if (mode === 'join') {
      const sh = names.length >= 2 ? sharedCols(tb[names[0]], tb[names[1]]) : [];
      out.targets = ['run'].concat(sh.map((x) => 'column:' + x), ['answer']);
    } else if (mode === 'spreadsheet') out.targets = ['run'].concat(colsOf(names.slice(0, 1)), ['answer']);
    else out.targets = ['run', 'column:*', 'filter', 'answer'];
    return out;
  }

  // ---------------------------------------------------------------- questions (computed from the data)
  function numOptions(correct, seed) {
    const base = Math.max(1, Math.pow(10, Math.floor(Math.log10(Math.max(1, Math.abs(correct)))) - 1));
    const cand = correct >= 30 ? [correct, Math.round(correct * 1.1), Math.round(correct * 0.9), correct + base * 10, Math.round(correct * 1.25), Math.round(correct * 0.75)] : [correct, correct + 1, correct - 1, correct + 2, correct - 2, Math.round(correct * 1.1), correct * 2];
    const seen = new Set();
    const pool = cand.map((v) => rnd(v)).filter((v) => v >= 0 && !seen.has(v) && seen.add(v));
    const pick = [correct].concat(pool.filter((v) => v !== correct).sort((a, b) => hash(seed + a) - hash(seed + b)).slice(0, 3));
    return pick.sort((a, b) => a - b).map((v) => ({ label: fmt(v), ok: v === correct }));
  }
  function textOptions(vals, correct, seed) {
    const pool = vals.filter((v) => v !== correct).sort((a, b) => hash(seed + a) - hash(seed + b)).slice(0, 3);
    return pool.concat([correct]).sort((a, b) => hash(seed + 'x' + a) - hash(seed + 'x' + b)).map((v) => ({ label: String(v), ok: v === correct }));
  }
  function buildQuestion(c) {
    const tb = c.tables;
    const names = Object.keys(tb);
    const A = tb[names[0]], an = names[0];
    const count = () => ({ q: T2(`How many rows does the table ${an} have?`, `तालिका ${an} में कितनी पंक्तियाँ हैं?`), opts: numOptions(A.rows.length, an), hint: T2('Run SELECT COUNT(*) FROM ' + an + ' or count the rows.', 'SELECT COUNT(*) FROM ' + an + ' चलाओ या पंक्तियाँ गिनो।') });
    const keyCol = textCols(A)[0];
    const meas = measureCols(A);
    if (c.mode === 'sort-filter') {
      if (keyCol != null) {
        for (const ni of meas) {
          const vs = A.rows.map((r) => r[ni]).filter(isNum);
          const mx = Math.max(...vs), mn = Math.min(...vs);
          const nm = A.columns[ni], kn = A.columns[keyCol];
          for (const [target, hi] of [[mx, true], [mn, false]]) {
            const rows = A.rows.filter((r) => r[ni] === target);
            if (rows.length !== 1) continue;
            const ans = rows[0][keyCol];
            const vals = distinctOf(A, keyCol);
            if (vals.length < 2 || !vals.includes(ans)) continue;
            return {
              q: hi ? T2(`Sort ${nm} from high to low. Which ${kn} is at the top?`, `${nm} को बड़े से छोटे क्रम में लगाओ। सबसे ऊपर कौन-सा ${kn} है?`) : T2(`Sort ${nm} from low to high. Which ${kn} is at the top?`, `${nm} को छोटे से बड़े क्रम में लगाओ। सबसे ऊपर कौन-सा ${kn} है?`),
              opts: textOptions(vals, ans, an + nm), hint: T2(`Tap the column name ${nm} to sort. Tap again to flip the order.`, `छाँटने के लिए स्तंभ ${nm} दबाओ। क्रम पलटने के लिए फिर दबाओ।`),
            };
          }
        }
      }
      return count();
    }
    if (c.mode === 'group') {
      for (const gi of textCols(A)) {
        const gv = distinctOf(A, gi);
        if (gv.length < 2 || gv.length > 8) continue;
        for (const ni of meas) {
          const tot = gv.map((g) => ({ g, s: A.rows.filter((r) => r[gi] === g).reduce((a, r) => a + (isNum(r[ni]) ? r[ni] : 0), 0) })).sort((a, b) => b.s - a.s);
          if (tot.length > 1 && tot[0].s === tot[1].s) continue;
          return {
            q: T2(`Group by ${A.columns[gi]} and add up ${A.columns[ni]}. Which ${A.columns[gi]} has the largest total?`, `${A.columns[gi]} से समूह बनाओ और ${A.columns[ni]} जोड़ो। किस ${A.columns[gi]} का कुल सबसे बड़ा है?`),
            opts: textOptions(gv, tot[0].g, an + A.columns[ni]), hint: T2('Pick the group column, choose SUM, pick the number column, then press Run.', 'समूह वाला स्तंभ चुनो, SUM चुनो, संख्या वाला स्तंभ चुनो, फिर चलाओ दबाओ।'),
          };
        }
      }
      return count();
    }
    if (c.mode === 'join') {
      const B = tb[names[1]], bn = names[1];
      const key = sharedCols(A, B)[0];
      const r = runSQL(`SELECT * FROM ${an} JOIN ${bn} ON ${an}.${key} = ${bn}.${key}`, tb);
      return { q: T2(`How many rows does the inner join of ${an} and ${bn} on ${key} give?`, `${key} पर ${an} और ${bn} का इनर जॉइन कितनी पंक्तियाँ देता है?`), opts: numOptions(r.rows.length, an + bn + key), hint: T2('Choose INNER join, then press Run and count the rows. Rows with no partner are left out.', 'INNER जोड़ चुनो, चलाओ दबाओ और पंक्तियाँ गिनो। जिनका जोड़ीदार नहीं है वे छूट जाती हैं।') };
    }
    if (c.mode === 'spreadsheet') {
      const ni = meas[0], nm = A.columns[ni];
      const sum = A.rows.reduce((a, r) => a + (isNum(r[ni]) ? r[ni] : 0), 0);
      const col = colLetter(ni);
      return { q: T2(`What is the sum of the column ${nm}?`, `स्तंभ ${nm} का योग क्या है?`), opts: numOptions(rnd(sum), an + nm), hint: T2(`Tap the column ${nm}, type =SUM(${col}2:${col}${A.rows.length + 1}) and calculate.`, `स्तंभ ${nm} दबाओ, =SUM(${col}2:${col}${A.rows.length + 1}) लिखो और गणना करो।`) };
    }
    // sql
    if (meas.length) {
      const ni = meas[meas.length - 1], nm = A.columns[ni];
      const sorted = A.rows.map((r) => r[ni]).filter(isNum).sort((a, b) => a - b);
      const m = sorted[Math.floor(sorted.length / 2)];
      const r = runSQL(`SELECT COUNT(*) FROM ${an} WHERE ${nm} > ${m}`, tb);
      const ans = r.rows[0][0];
      return { q: T2(`How many rows in ${an} have ${nm} greater than ${m}?`, `${an} की कितनी पंक्तियों में ${nm} का मान ${m} से बड़ा है?`), opts: numOptions(ans, an + nm), hint: T2(`Write SELECT COUNT(*) FROM ${an} WHERE ${nm} > ${m} and run it.`, `SELECT COUNT(*) FROM ${an} WHERE ${nm} > ${m} लिखकर चलाओ।`) };
    }
    return count();
  }

  // ---------------------------------------------------------------- UI text
  const U = {
    sample: T2('Sample data', 'नमूना डेटा'),
    modes: { sql: T2('SQL lab', 'SQL प्रयोगशाला'), 'sort-filter': T2('Sort and filter', 'छाँटो और फ़िल्टर करो'), group: T2('Group and total', 'समूह बनाओ और जोड़ो'), join: T2('Join two tables', 'दो तालिकाएँ जोड़ो'), spreadsheet: T2('Spreadsheet', 'स्प्रेडशीट') },
    task: T2('Your task', 'तुम्हारा काम'),
    question: T2('Question', 'प्रश्न'),
    run: T2('Run', 'चलाओ'),
    runTip: T2('Run the query (Ctrl + Enter)', 'क्वेरी चलाओ (Ctrl + Enter)'),
    tables: T2('Tables', 'तालिकाएँ'),
    tapToAdd: T2('Tap a name to add it to your query.', 'नाम दबाकर उसे क्वेरी में जोड़ो।'),
    words: T2('SQL words', 'SQL के शब्द'),
    examples: T2('Try one', 'एक आज़माओ'),
    query: T2('Your SQL query', 'तुम्हारी SQL क्वेरी'),
    result: T2('Result', 'परिणाम'),
    rowsN: (n) => T2(n === 1 ? '1 row' : n + ' rows', n + ' पंक्ति' + (n === 1 ? '' : 'याँ')),
    noRows: T2('No row matches. That is a valid answer: the table is empty.', 'कोई पंक्ति नहीं मिली। यह भी सही उत्तर है: परिणाम खाली है।'),
    pressRun: T2('Press Run to see the result.', 'परिणाम देखने के लिए चलाओ दबाओ।'),
    errorHead: T2('Check your query', 'अपनी क्वेरी जाँचो'),
    stage: { from: T2('rows to start', 'शुरू की पंक्तियाँ'), join: T2('rows after JOIN', 'JOIN के बाद'), where: T2('rows kept by WHERE', 'WHERE से बचीं'), group: T2('groups', 'समूह'), having: T2('groups kept', 'बचे समूह'), order: T2('sorted', 'क्रम में'), distinct: T2('different rows', 'अलग पंक्तियाँ'), limit: T2('rows after LIMIT', 'LIMIT के बाद'), select: T2('rows shown', 'दिखाई गईं') },
    pipe: T2('How the query ran', 'क्वेरी कैसे चली'),
    asSql: T2('The same in SQL', 'यही SQL में'),
    filterHead: T2('Filter the rows', 'पंक्तियाँ छाँटो'),
    col: T2('Column', 'स्तंभ'),
    cond: T2('Condition', 'शर्त'),
    val: T2('Value', 'मान'),
    apply: T2('Apply filter', 'फ़िल्टर लगाओ'),
    clearAll: T2('Clear all', 'सब हटाओ'),
    sortHint: T2('Tap a column name to sort. Tap again to reverse. A third tap clears.', 'छाँटने के लिए स्तंभ का नाम दबाओ। उलटने के लिए फिर दबाओ। तीसरी बार दबाने पर हट जाता है।'),
    ops: { '=': T2('is', 'बराबर'), '<>': T2('is not', 'बराबर नहीं'), '>': T2('is more than', 'से अधिक'), '>=': T2('is at least', 'कम से कम'), '<': T2('is less than', 'से कम'), '<=': T2('is at most', 'अधिक से अधिक'), like: T2('contains', 'में शामिल है') },
    groupBy: T2('Group by', 'समूह का आधार'),
    valueCol: T2('Add up the column', 'जोड़ने वाला स्तंभ'),
    howCalc: T2('Work out', 'क्या निकालें'),
    fns: { COUNT: T2('COUNT: how many', 'COUNT: कितने'), SUM: T2('SUM: total', 'SUM: कुल'), AVG: T2('AVG: average', 'AVG: औसत'), MIN: T2('MIN: smallest', 'MIN: सबसे छोटा'), MAX: T2('MAX: largest', 'MAX: सबसे बड़ा') },
    groupHint: T2('Tap a text column to group by it, or a number column to add up.', 'समूह के लिए शब्दों वाला स्तंभ और जोड़ने के लिए संख्या वाला स्तंभ दबाओ।'),
    joinKind: T2('Kind of join', 'जोड़ का प्रकार'),
    inner: T2('INNER: only rows with a partner', 'INNER: केवल जोड़ीदार वाली पंक्तियाँ'),
    leftJ: T2('LEFT: keep every row of the first table', 'LEFT: पहली तालिका की हर पंक्ति रखो'),
    joinOn: T2('Join on the column', 'जोड़ का स्तंभ'),
    joinHint: T2('Rows with the same colour in the joining column belong together. Grey rows have no partner.', 'जोड़ वाले स्तंभ में एक रंग की पंक्तियाँ साथ-साथ हैं। स्लेटी पंक्तियों का जोड़ीदार नहीं है।'),
    noPartner: T2('no partner', 'जोड़ीदार नहीं'),
    matchNote: (m, a, b, an, bn) => T2(`${m} rows joined. ${a} of ${an} and ${b} of ${bn} found no partner.`, `${m} पंक्तियाँ जुड़ीं। ${an} की ${a} और ${bn} की ${b} पंक्तियों को जोड़ीदार नहीं मिला।`),
    formula: T2('Formula', 'सूत्र'),
    calc: T2('Calculate', 'गणना करो'),
    sheetHint: T2('Tap a column letter to put its cells in the formula. Change a number in the grid and watch the results update.', 'सूत्र में उसके खाने डालने के लिए स्तंभ का अक्षर दबाओ। ग्रिड में कोई संख्या बदलो और परिणाम बदलते देखो।'),
    results: T2('Results', 'परिणाम'),
    answerHead: T2('Choose the answer', 'उत्तर चुनो'),
    right: T2('Yes, that is right.', 'हाँ, यह सही है।'),
    wrong: T2('Not this one. Look at the data again.', 'यह नहीं। डेटा को फिर देखो।'),
    hintHead: T2('Hint', 'संकेत'),
    numCol: T2('number column', 'संख्या वाला स्तंभ'),
    textCol: T2('text column', 'शब्दों वाला स्तंभ'),
    more: (n) => T2(`Showing the first ${n} rows.`, `पहली ${n} पंक्तियाँ दिखाई गई हैं।`),
    needLiquid: T2('Type something first.', 'पहले कुछ लिखो।'),
    needNum: T2('Pick a number column to add up.', 'जोड़ने के लिए संख्या वाला स्तंभ चुनो।'),
    notShared: T2('Only a column that is in both tables can join them.', 'केवल वह स्तंभ जो दोनों तालिकाओं में है, उन्हें जोड़ सकता है।'),
    empty: T2('(empty)', '(खाली)'),
  };
  const PALETTE = [
    { bg: '#1D4ED8', fg: '#fff' }, { bg: '#FF7A1A', fg: '#1E293B' }, { bg: '#14B8A6', fg: '#1E293B' }, { bg: '#8B3DFF', fg: '#fff' },
    { bg: '#F5B90A', fg: '#1E293B' }, { bg: '#FF6B57', fg: '#1E293B' }, { bg: '#22C55E', fg: '#1E293B' }, { bg: '#02CFF9', fg: '#1E293B' },
  ];
  const SQLKW = /('(?:[^']|'')*')|\b(SELECT|DISTINCT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|INNER JOIN|LEFT JOIN|LEFT OUTER JOIN|JOIN|ON|AS|AND|OR|NOT|IN|LIKE|BETWEEN|IS|NULL|ASC|DESC)\b|\b(COUNT|SUM|AVG|MIN|MAX|ROUND|UPPER|LOWER|LENGTH|ABS)(?=\s*\()|(\b\d+\.?\d*\b)/gi;
  function sqlHTML(sql) {
    let out = '', last = 0, m;
    SQLKW.lastIndex = 0;
    while ((m = SQLKW.exec(sql))) {
      out += esc(sql.slice(last, m.index));
      const cls = m[1] ? 'tb-s' : m[2] ? 'tb-k' : m[3] ? 'tb-f' : 'tb-n';
      out += `<span class="${cls}">${esc(m[0])}</span>`;
      last = m.index + m[0].length;
    }
    return out + esc(sql.slice(last));
  }

  // ---------------------------------------------------------------- CSS
  const CSS = `
.tb { --tb-ink: var(--ink, #1E293B); --tb-ink2: var(--ink-2, #475569); --tb-surf: var(--surface, #fff); --tb-sunk: var(--sunk, #F1F5F9); --tb-line: var(--line, #D8DEE9);
  font-family: var(--font-body, system-ui, sans-serif); color: var(--tb-ink); display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.tb *, .tb *::before, .tb *::after { box-sizing: border-box; }
.tb button { font: inherit; }
.tb-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tb-badge { font-family: var(--font-display, inherit); font-weight: 800; font-size: 1.05rem; color: #fff; background: linear-gradient(120deg, #061233, #1D4ED8 70%, #02CFF9); padding: 6px 14px; border-radius: 999px; }
.tb-sample { font-size: .8rem; font-weight: 700; color: #1E293B; background: #FFD23F; padding: 4px 10px; border-radius: 999px; }
.tb-card { background: var(--tb-surf); border: 1px solid var(--tb-line); border-radius: 16px; padding: 12px 14px; box-shadow: 0 2px 10px rgba(6, 18, 51, .06); min-width: 0; }
.tb-task { background: linear-gradient(135deg, #8B3DFF, #4400F0); color: #fff; border: 0; }
.tb-task b, .tb-lbl { font-family: var(--font-display, inherit); font-weight: 800; letter-spacing: .02em; }
.tb-task p { margin: 4px 0 0; font-size: 1.02rem; line-height: 1.45; }
.tb-lbl { font-size: .86rem; color: var(--tb-ink2); text-transform: none; margin: 0 0 6px; display: block; }
.tb-grid { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); }
.tb-sg { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); grid-template-areas: "ed" "re" "sc"; }
.tb-sg > .a-ed { grid-area: ed; } .tb-sg > .a-re { grid-area: re; } .tb-sg > .a-sc { grid-area: sc; } .tb-sg > * { min-width: 0; }
@media (min-width: 900px) { .tb-sg { grid-template-columns: minmax(300px, 400px) minmax(0, 1fr); grid-template-areas: "ed re" "sc re"; align-items: start; } }
@media (min-width: 900px) { .tb-grid.tb-two { grid-template-columns: minmax(300px, 400px) minmax(0, 1fr); align-items: start; } }
.tb-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.tb-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.tb-chips.tb-scrollx .tb-chip { flex: none; }
.tb-chips.tb-scrollx { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
.tb-chip { min-height: 44px; min-width: 44px; padding: 6px 12px; border-radius: 12px; border: 1.5px solid var(--tb-line); background: var(--tb-sunk); color: var(--tb-ink); cursor: pointer; font-weight: 600; white-space: nowrap; transition: transform .12s, background .15s, box-shadow .15s; }
.tb-chip:hover { background: #E0E9FF; border-color: #2563EB; }
.tb-chip:active { transform: scale(.96); }
.tb-chip:focus-visible, .tb-btn:focus-visible, .tb-th:focus-visible, .tb-opt:focus-visible, .tb-sel:focus-visible, .tb-in:focus-visible, .tb-ta:focus-visible, .tb-cell:focus-visible, .tb-seg button:focus-visible { outline: 3px solid #02CFF9; outline-offset: 2px; }
.tb-chip.tb-tbl { background: #1D4ED8; color: #fff; border-color: #1D4ED8; }
.tb-chip.tb-num::after, .tb-chip.tb-txt::after { content: ''; }
.tb-ty { display: inline-block; font-size: .68rem; font-weight: 800; padding: 1px 5px; border-radius: 6px; margin-right: 5px; vertical-align: 1px; background: #02CFF9; color: #1E293B; }
.tb-ty.t { background: #FFD23F; }
.tb-tblbox { border: 1px solid var(--tb-line); border-radius: 12px; padding: 8px; background: var(--tb-sunk); }
.tb-tblbox + .tb-tblbox { margin-top: 8px; }
.tb-ta { width: 100%; min-height: 128px; resize: vertical; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 1rem; line-height: 1.5; padding: 12px; border-radius: 12px; border: 2px solid #2563EB; background: #0B1530; color: #E8EEFF; caret-color: #02CFF9; }
.tb-btn { min-height: 48px; min-width: 48px; padding: 8px 22px; border: 0; border-radius: 14px; font-family: var(--font-display, inherit); font-weight: 800; font-size: 1.05rem; cursor: pointer; color: #1E293B; background: linear-gradient(180deg, #FFD23F, #F5B90A); box-shadow: 0 4px 0 #B88A00, 0 6px 14px rgba(245, 185, 10, .35); transition: transform .1s, box-shadow .1s; }
.tb-btn:hover { filter: brightness(1.05); }
.tb-btn:active { transform: translateY(3px); box-shadow: 0 1px 0 #B88A00; }
.tb-btn.alt { background: var(--tb-sunk); box-shadow: none; border: 1.5px solid var(--tb-line); color: var(--tb-ink); font-size: .95rem; }
.tb-btn.go { background: linear-gradient(180deg, #22C55E, #0F766E); color: #fff; box-shadow: 0 4px 0 #0A5A53, 0 6px 14px rgba(15, 118, 110, .3); }
.tb-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.tb-scroll { overflow: auto; max-width: 100%; border-radius: 12px; border: 1px solid var(--tb-line); background: var(--tb-surf); max-height: 440px; }
.tb-t { border-collapse: separate; border-spacing: 0; width: 100%; font-size: .95rem; font-variant-numeric: tabular-nums; }
.tb-t th, .tb-t td { padding: 8px 12px; text-align: left; white-space: nowrap; border-bottom: 1px solid var(--tb-line); }
.tb-t thead th { position: sticky; top: 0; z-index: 2; background: linear-gradient(180deg, #0F1F55, #061233); color: #fff; font-family: var(--font-display, inherit); font-weight: 700; padding: 0; }
.tb-t thead th > span, .tb-th { display: flex; align-items: center; gap: 4px; padding: 10px 12px; min-height: 44px; }
.tb-th { width: 100%; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; text-align: left; }
.tb-th:hover { background: rgba(255, 255, 255, .12); }
.tb-th .ar { margin-left: auto; opacity: .35; font-size: .8rem; }
.tb-th.on .ar { opacity: 1; color: #FFD23F; }
.tb-th.pick { background: rgba(255, 210, 63, .28); box-shadow: inset 0 -3px 0 #FFD23F; }
.tb-t td.n, .tb-t th.n { text-align: right; }
.tb-t th.n .tb-th, .tb-t th.n > span { justify-content: flex-end; }
.tb-t td.n .tb-cellv { justify-content: flex-end; }
.tb-t tbody tr:nth-child(even) td { background: rgba(37, 99, 235, .05); }
.tb-t tbody tr:hover td { background: rgba(2, 207, 249, .14); }
.tb-t td.nul { color: var(--tb-ink2); font-style: italic; opacity: .7; }
.tb-t tr.tb-dim td { opacity: .45; background: repeating-linear-gradient(135deg, transparent 0 6px, rgba(100, 116, 139, .12) 6px 12px); }
.tb-t tr.tb-g td:first-child { box-shadow: inset 6px 0 0 var(--g); }
.tb-rowin { animation: tb-in .35s both; animation-delay: calc(var(--i, 0) * 28ms); }
@keyframes tb-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.tb-key { display: inline-block; min-width: 1.4em; padding: 1px 9px; border-radius: 999px; font-weight: 700; background: var(--kb, #CBD5E1); color: var(--kf, #1E293B); }
.tb-key.none { background: #CBD5E1; color: #475569; }
.tb-pipe { display: flex; flex-wrap: wrap; gap: 6px; align-items: stretch; }
.tb-step { display: flex; flex-direction: column; justify-content: center; padding: 5px 10px; border-radius: 12px; background: var(--tb-sunk); border: 1px solid var(--tb-line); line-height: 1.15; min-width: 78px; }
.tb-step b { font-size: 1.2rem; font-family: var(--font-display, inherit); color: #1D4ED8; }
.tb-step small { color: var(--tb-ink2); font-size: .72rem; }
.tb-step em { font-style: normal; font-size: .7rem; font-weight: 800; color: #8B3DFF; letter-spacing: .04em; }
.tb-arrowc { align-self: center; color: var(--tb-ink2); }
.tb-sqlbox { margin: 0; padding: 10px 12px; border-radius: 12px; background: #0B1530; color: #E8EEFF; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .92rem; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
.tb-k { color: #02CFF9; font-weight: 700; } .tb-f { color: #FFD23F; } .tb-s { color: #5BE0A0; } .tb-n { color: #FF9D5C; }
.tb-err { background: #FFEDEA; color: #8A1C0F; border: 1.5px solid #FF6B57; border-radius: 12px; padding: 10px 14px; line-height: 1.45; }
.tb-err b { display: block; margin-bottom: 2px; }
:root[data-theme="dark"] .tb-err { background: #3A1612; color: #FFD9D3; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .tb-err { background: #3A1612; color: #FFD9D3; } :root:not([data-theme="light"]) .tb-chip:hover { background: #1E3A8A; } }
.tb-note { color: var(--tb-ink2); font-size: .92rem; line-height: 1.4; margin: 0; }
.tb-sel, .tb-in { min-height: 44px; padding: 6px 10px; border-radius: 10px; border: 1.5px solid var(--tb-line); background: var(--tb-surf); color: var(--tb-ink); font: inherit; max-width: 100%; }
.tb-fbar { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); align-items: end; }
.tb-fbar label { display: flex; flex-direction: column; gap: 3px; font-size: .8rem; font-weight: 700; color: var(--tb-ink2); }
.tb-fchips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.tb-fc { display: inline-flex; align-items: center; gap: 6px; padding: 4px 6px 4px 12px; border-radius: 999px; background: #E0E9FF; color: #1E3A8A; font-weight: 700; font-size: .9rem; }
.tb-fc button { min-width: 44px; min-height: 44px; margin: -10px -6px -10px 0; border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 1.1rem; }
.tb-seg { display: inline-flex; border-radius: 14px; overflow: hidden; border: 1.5px solid var(--tb-line); max-width: 100%; flex-wrap: wrap; }
.tb-seg button { min-height: 44px; padding: 6px 14px; border: 0; background: var(--tb-sunk); color: var(--tb-ink); cursor: pointer; font-weight: 700; text-align: left; }
.tb-seg button[aria-pressed="true"] { background: #1D4ED8; color: #fff; }
.tb-bars { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.tb-bar { display: grid; grid-template-columns: minmax(70px, 28%) 1fr; gap: 8px; align-items: center; }
.tb-bar > span { font-weight: 700; overflow-wrap: anywhere; }
.tb-track { background: var(--tb-sunk); border-radius: 10px; height: 36px; position: relative; overflow: hidden; }
.tb-fill { height: 100%; border-radius: 10px; width: var(--w); background: var(--bg); color: var(--fg); display: flex; align-items: center; justify-content: flex-end; padding: 0 10px; font-weight: 800; font-variant-numeric: tabular-nums; min-width: 44px; animation: tb-grow .7s cubic-bezier(.2, .8, .2, 1) both; animation-delay: calc(var(--i, 0) * 70ms); transform-origin: left; }
@keyframes tb-grow { from { width: 0; } to { width: var(--w); } }
.tb-sheet td, .tb-sheet th { padding: 0; }
.tb-sheet td.tb-rn, .tb-sheet th.tb-rn { background: var(--tb-sunk); color: var(--tb-ink2); text-align: center; font-weight: 700; width: 44px; min-width: 44px; padding: 0 6px; position: sticky; left: 0; z-index: 1; }
.tb-sheet thead th.tb-rn { z-index: 3; background: #061233; }
.tb-sheet td > .tb-cellv { display: flex; align-items: center; min-height: 44px; padding: 0 12px; }
.tb-cell { width: 100%; min-width: 72px; min-height: 44px; border: 0; background: transparent; color: inherit; font: inherit; padding: 0 12px; text-align: right; font-variant-numeric: tabular-nums; }
.tb-cell:focus { background: #FFF6CC; color: #1E293B; }
.tb-sheet td.tb-ref { background: rgba(255, 210, 63, .38) !important; box-shadow: inset 0 0 0 2px #F5B90A; }
.tb-sheet th .letter { font-size: .75rem; opacity: .75; display: block; line-height: 1; }
.tb-fx { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tb-fx .tb-in { flex: 1 1 200px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 1rem; }
.tb-fx .lab { font-family: var(--font-display, inherit); font-weight: 800; color: #8B3DFF; font-size: 1.1rem; }
.tb-rc { display: flex; justify-content: space-between; gap: 10px; align-items: center; padding: 10px 14px; border-radius: 12px; background: linear-gradient(120deg, #E0F7FF, #EFE6FF); color: #1E293B; margin: 0; list-style: none; }
.tb-rc code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .9rem; overflow-wrap: anywhere; }
.tb-rc b { font-size: 1.3rem; font-family: var(--font-display, inherit); color: #1D4ED8; font-variant-numeric: tabular-nums; }
.tb-rcs { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; }
.tb-q { background: linear-gradient(135deg, #FFF8DC, #FFF); border: 2px solid #FFD23F; color: #1E293B; }
:root[data-theme="dark"] .tb-q { background: #2A2410; color: #FFF3C4; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .tb-q { background: #2A2410; color: #FFF3C4; } }
.tb-q p { margin: 0 0 10px; font-size: 1.05rem; line-height: 1.45; font-weight: 600; }
.tb-opts { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); }
.tb-opt { min-height: 48px; padding: 8px 12px; border-radius: 12px; border: 2px solid #CBD5E1; background: #fff; color: #1E293B; font-weight: 700; cursor: pointer; transition: transform .12s, background .15s; overflow-wrap: anywhere; }
.tb-opt:hover:not(:disabled) { border-color: #2563EB; background: #EAF1FF; }
.tb-opt:active { transform: scale(.97); }
.tb-opt.ok { background: #22C55E; border-color: #0F766E; color: #1E293B; }
.tb-opt.no { background: #FFD9D3; border-color: #FF6B57; color: #8A1C0F; text-decoration: line-through; }
.tb-fb { margin: 10px 0 0; font-weight: 700; }
.tb-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.tb-hintbox { margin-top: 8px; font-size: .92rem; color: #7A5B00; }
@media (max-width: 480px) { .tb-t th, .tb-t td { padding: 7px 9px; } .tb-bar { grid-template-columns: minmax(60px, 32%) 1fr; } .tb-btn { width: 100%; } }
@media (prefers-reduced-motion: reduce) { .tb-rowin, .tb-fill { animation: none; } .tb-chip, .tb-btn, .tb-opt { transition: none; } }`;

  // ---------------------------------------------------------------- mount
  function mount(root, config, api) {
    const t = (x) => api.t(x);
    const tables = config.tables;
    const names = Object.keys(tables);
    const A = tables[names[0]], an = names[0];
    const mode = config.mode;
    const question = buildQuestion(config);
    const S = {
      q: '', err: null, res: null, status: '', ran: false, ans: { wrong: new Set(), done: false },
      sortCol: null, sortDir: null, filters: [], fb: { col: A.columns[0], op: '=', val: '' },
      g: { gcol: null, vcol: null, fn: 'COUNT' }, j: { type: 'INNER', key: null }, jRan: false,
      cells: A.rows.map((r) => r.slice()), f: '', cards: [], fmsg: null,
    };
    const timers = [];
    const tmo = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
    const can = (key) => { if (api.allowed && !api.allowed(key)) { if (api.nudge) api.nudge(key); return false; } return true; };
    const toast = (x) => { if (api.toast) api.toast(x); };

    // defaults per mode
    if (mode === 'group') {
      const cand = textCols(A).map((i) => ({ i, n: distinctOf(A, i).length })).filter((x) => x.n >= 2 && x.n <= 12).sort((a, b) => a.n - b.n || a.i - b.i);
      S.g.gcol = cand.length ? cand[0].i : 0;
      S.g.vcol = measureCols(A)[0];
    }
    if (mode === 'join') S.j.key = sharedCols(A, tables[names[1]])[0];
    if (mode === 'sort-filter') {
      const f0 = textCols(A)[0];
      S.fb.col = A.columns[f0 != null ? f0 : 0];
    }
    const examples = () => {
      const ex = [`SELECT * FROM ${an}`];
      const ms = measureCols(A);
      const kc = textCols(A)[0];
      if (ms.length) {
        const ni = ms[ms.length - 1], nm = A.columns[ni];
        const sorted = A.rows.map((r) => r[ni]).filter(isNum).sort((a, b) => a - b);
        const m = sorted[Math.floor(sorted.length / 2)];
        ex.push(`SELECT ${kc != null ? A.columns[kc] + ', ' : ''}${nm} FROM ${an} WHERE ${nm} > ${m} ORDER BY ${nm} DESC`);
        const gi = textCols(A).find((i) => { const n = distinctOf(A, i).length; return n >= 2 && n <= 8; });
        if (gi != null) ex.push(`SELECT ${A.columns[gi]}, COUNT(*) AS how_many, AVG(${nm}) AS average FROM ${an} GROUP BY ${A.columns[gi]}`);
      }
      if (names.length >= 2) {
        const B = tables[names[1]], bn = names[1];
        const sh = sharedCols(A, B)[0];
        if (sh) ex.push(`SELECT * FROM ${an} JOIN ${bn} ON ${an}.${sh} = ${bn}.${sh}`);
      }
      return ex;
    };
    const exList = examples();
    S.q = config.query || exList[exList.length > 2 ? 2 : exList.length - 1];

    // ---- the query behind sort-filter / group / join
    const whereOf = () => (S.filters.length ? ' WHERE ' + S.filters.map((f) => (f.op === 'like' ? `${f.col} LIKE ${lit('%' + f.val + '%')}` : `${f.col} ${f.op} ${lit(f.val)}`)).join(' AND ') : '');
    const sortSql = () => `SELECT * FROM ${an}${whereOf()}${S.sortCol ? ` ORDER BY ${S.sortCol} ${S.sortDir === 'desc' ? 'DESC' : 'ASC'}` : ''}`;
    const groupSql = () => {
      const g = A.columns[S.g.gcol], v = S.g.vcol != null ? A.columns[S.g.vcol] : null;
      const fn = S.g.fn;
      const expr = fn === 'COUNT' ? 'COUNT(*)' : `${fn}(${v})`;
      const alias = fn === 'COUNT' ? 'how_many' : fn.toLowerCase() + '_' + v;
      return `SELECT ${g}, ${expr} AS ${alias} FROM ${an}${whereOf()} GROUP BY ${g} ORDER BY ${alias} DESC`;
    };
    const joinSql = () => { const bn = names[1]; return `SELECT * FROM ${an} ${S.j.type === 'LEFT' ? 'LEFT JOIN' : 'JOIN'} ${bn} ON ${an}.${S.j.key} = ${bn}.${S.j.key}`; };
    const currentSql = () => (mode === 'sql' ? S.q : mode === 'sort-filter' ? sortSql() : mode === 'group' ? groupSql() : mode === 'join' ? joinSql() : '');

    // run the current query (emit = child action), keeping the result in S.res
    function execute(emit) {
      const sql = currentSql();
      S.ran = true;
      try {
        S.res = runSQL(sql, tables);
        S.err = null;
        const n = S.res.rows.length;
        S.status = t(T2(`Result: ${n === 1 ? '1 row' : n + ' rows'}.`, `परिणाम: ${n} पंक्ति${n === 1 ? '' : 'याँ'}।`));
        if (emit) { api.record(t(T2('Ran: ', 'चलाया: ')) + sql.replace(/\s+/g, ' ') + ' -> ' + n); api.emit('queried'); api.emit('result'); }
      } catch (x) {
        if (!x.sql) throw x;
        S.res = null;
        S.err = T2(x.en, x.hi);
        S.status = t(U.errorHead) + ': ' + t(S.err);
        if (emit) { api.record(t(T2('Query failed: ', 'क्वेरी गलत: ')) + x.en); api.emit('queried'); }
      }
    }

    // ---- html builders
    const typeBadge = (tb, i) => (colType(tb, i) === 'num' ? `<span class="tb-ty" aria-hidden="true">123</span>` : `<span class="tb-ty t" aria-hidden="true">Abc</span>`);
    const cellHTML = (v, isn) => (v == null ? `<td class="nul${isn ? ' n' : ''}">NULL</td>` : `<td${isn ? ' class="n"' : ''}>${esc(fmt(v))}</td>`);

    function resultTable(res, o) {
      o = o || {};
      const numc = res.columns.map((c, i) => res.rows.length && res.rows.every((r) => r[i] == null || isNum(r[i])) && res.rows.some((r) => isNum(r[i])));
      const head = res.columns.map((c, i) => {
        const base = o.srcCols && o.srcCols.includes(c) ? c : null;
        if (o.click && base) {
          const on = o.sortCol && o.sortCol.toLowerCase() === c.toLowerCase();
          const ar = on ? (o.sortDir === 'desc' ? '▼' : '▲') : '↕';
          const pick = o.pick && o.pick(c);
          return `<th class="${numc[i] ? 'n' : ''}" scope="col"${on ? ` aria-sort="${o.sortDir === 'desc' ? 'descending' : 'ascending'}"` : ''}><button type="button" class="tb-th${on ? ' on' : ''}${pick ? ' pick' : ''}" data-key="column:${esc(c)}" data-col="${esc(c)}" aria-label="${esc(c)}${pick ? ' (' + esc(pick) + ')' : ''}">${o.typeOf ? o.typeOf(c) : ''}${esc(c)}<span class="ar" aria-hidden="true">${o.noArrow ? '' : ar}</span></button></th>`;
        }
        return `<th class="${numc[i] ? 'n' : ''}" scope="col"><span>${esc(c)}</span></th>`;
      }).join('');
      const MAXR = 100;
      const rows = res.rows.slice(0, MAXR).map((r, ri) => {
        const style = o.rowStyle ? o.rowStyle(r, ri) : '';
        return `<tr class="tb-rowin${o.rowClass ? ' ' + o.rowClass(r, ri) : ''}" style="--i:${Math.min(ri, 14)};${style}"${res.ids[ri] >= 0 ? ` data-rid="${res.ids[ri]}"` : ''}>${r.map((v, ci) => (o.cellHook ? o.cellHook(v, ci, r, numc[ci]) : cellHTML(v, numc[ci]))).join('')}</tr>`;
      }).join('');
      const more = res.rows.length > MAXR ? `<p class="tb-note">${esc(t(U.more(MAXR)))}</p>` : '';
      return `<div class="tb-scroll" tabindex="0" role="region" aria-label="${esc(t(U.result))}"><table class="tb-t"><thead><tr>${head}</tr></thead><tbody>${rows || `<tr><td colspan="${res.columns.length}" class="nul">${esc(t(U.empty))}</td></tr>`}</tbody></table></div>${more}`;
    }
    function srcTable(name, o) {
      const tb = tables[name];
      const res = { columns: tb.columns, rows: tb.rows, ids: tb.rows.map((r, i) => i) };
      return resultTable(res, Object.assign({ srcCols: tb.columns }, o || {}));
    }
    const pipeHTML = (res) => {
      if (!res) return '';
      const parts = res.stages.filter((s) => s.k !== 'order' || true).map((s) => {
        const label = t(U.stage[s.k]);
        const kw = { from: 'FROM', join: 'JOIN', where: 'WHERE', group: 'GROUP BY', having: 'HAVING', order: 'ORDER BY', distinct: 'DISTINCT', limit: 'LIMIT', select: 'SELECT' }[s.k];
        return `<div class="tb-step"><em>${kw}</em>${s.n != null ? `<b>${s.n}</b>` : '<b>✓</b>'}<small>${esc(label)}</small></div>`;
      });
      return `<div class="tb-pipe" role="group" aria-label="${esc(t(U.pipe))}">${parts.join('<span class="tb-arrowc" aria-hidden="true">→</span>')}</div>`;
    };
    const errHTML = () => (S.err ? `<div class="tb-err" role="alert"><b>${esc(t(U.errorHead))}</b>${esc(t(S.err))}</div>` : '');
    const sqlBox = (sql, cap) => `<div><span class="tb-lbl">${esc(t(cap || U.asSql))}</span><pre class="tb-sqlbox" tabindex="0">${sqlHTML(sql)}</pre></div>`;

    function filterBar() {
      const tb = A, ci = tb.columns.indexOf(S.fb.col), isn = colType(tb, ci) === 'num';
      const ops = isn ? ['=', '<>', '>', '>=', '<', '<='] : ['=', '<>', 'like'];
      if (!ops.includes(S.fb.op)) S.fb.op = '=';
      let valCtl;
      if (!isn && S.fb.op !== 'like') {
        const vs = distinctOf(tb, ci);
        if (!vs.includes(S.fb.val)) S.fb.val = vs[0];
        valCtl = `<select class="tb-sel" id="tb-fv" data-f="val" aria-label="${esc(t(U.val))}">${vs.map((v) => `<option value="${esc(v)}"${v === S.fb.val ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
      } else valCtl = `<input class="tb-in" id="tb-fv" data-f="val" ${isn ? 'type="number" inputmode="decimal"' : 'type="text"'} value="${esc(S.fb.val)}" aria-label="${esc(t(U.val))}">`;
      const chips = S.filters.map((f, i) => `<span class="tb-fc">${esc(f.col)} ${esc(t(U.ops[f.op]))} ${esc(f.val)}<button type="button" data-rm="${i}" aria-label="${esc(t(T2('Remove filter', 'फ़िल्टर हटाओ')))}">✕</button></span>`).join('');
      return `<section class="tb-card" data-key="filter" aria-label="${esc(t(U.filterHead))}"><span class="tb-lbl">${esc(t(U.filterHead))}</span>
        <div class="tb-fbar">
          <label>${esc(t(U.col))}<select class="tb-sel" data-f="col">${tb.columns.map((c) => `<option${c === S.fb.col ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
          <label>${esc(t(U.cond))}<select class="tb-sel" data-f="op">${ops.map((o) => `<option value="${o}"${o === S.fb.op ? ' selected' : ''}>${esc(t(U.ops[o]))}</option>`).join('')}</select></label>
          <label>${esc(t(U.val))}${valCtl}</label>
          <button type="button" class="tb-btn go" data-act="apply">${esc(t(U.apply))}</button>
        </div>
        <div class="tb-fchips">${chips}${S.filters.length ? `<button type="button" class="tb-chip" data-act="clearf">${esc(t(U.clearAll))}</button>` : ''}</div></section>`;
    }

    function questionHTML() {
      const done = S.ans.done;
      const opts = question.opts.map((o, i) => `<button type="button" class="tb-opt${done && o.ok ? ' ok' : ''}${S.ans.wrong.has(i) ? ' no' : ''}" data-ans="${i}"${done || S.ans.wrong.has(i) ? ' disabled' : ''}>${esc(o.label)}</button>`).join('');
      const fb = done ? `<p class="tb-fb" style="color:#0F766E">✔ ${esc(t(U.right))}</p>` : S.ans.wrong.size ? `<p class="tb-fb" style="color:#B3261E">${esc(t(U.wrong))}</p><p class="tb-hintbox"><b>${esc(t(U.hintHead))}:</b> ${esc(t(question.hint))}</p>` : '';
      return `<section class="tb-card tb-q" aria-label="${esc(t(U.question))}"><span class="tb-lbl">${esc(t(U.question))}</span><p lang="${api.lang ? api.lang() : 'en'}">${esc(t(question.q))}</p><div class="tb-opts" role="group" data-key="answer" aria-label="${esc(t(U.answerHead))}">${opts}</div>${fb}</section>`;
    }

    // ---- per-mode bodies
    function sqlBody() {
      const schema = names.map((n) => {
        const tb = tables[n];
        return `<div class="tb-tblbox"><div class="tb-chips"><button type="button" class="tb-chip tb-tbl" data-ins="${esc(n)}">${esc(n)}</button>${tb.columns.map((c, i) => `<button type="button" class="tb-chip" data-key="column:${esc(c)}" data-ins="${esc(names.length > 1 && sharedCols(tb, tables[names.find((x) => x !== n)] || tb).includes(c) && false ? n + '.' + c : c)}">${typeBadge(tb, i)}${esc(c)}</button>`).join('')}</div></div>`;
      }).join('');
      const words = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'JOIN', 'ON', 'AND', 'OR', 'COUNT(*)', 'SUM(', 'AVG(', 'DESC', 'LIKE', '>', '=', "'"];
      const exs = exList.map((q, i) => `<button type="button" class="tb-chip" data-ex="${i}" title="${esc(q)}">${i + 1}</button>`).join('');
      const schemaCard = `<section class="tb-card a-sc"><span class="tb-lbl">${esc(t(U.tables))}</span><p class="tb-note" style="margin-bottom:8px">${esc(t(U.tapToAdd))}</p>${schema}</section>`;
      const edCard = `<section class="tb-card a-ed"><label class="tb-lbl" for="tb-q">${esc(t(U.query))}</label>
          <textarea class="tb-ta" id="tb-q" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" aria-label="${esc(t(U.query))}">${esc(S.q)}</textarea>
          <div class="tb-chips tb-scrollx" style="margin-top:8px" role="group" aria-label="${esc(t(U.words))}">${words.map((w) => `<button type="button" class="tb-chip" data-ins="${esc(w)}" data-raw="1">${esc(w)}</button>`).join('')}</div>
          <div class="tb-row" style="margin-top:10px"><button type="button" class="tb-btn" data-key="run" data-act="run" title="${esc(t(U.runTip))}">▶ ${esc(t(U.run))}</button><span class="tb-row"><span class="tb-lbl" style="margin:0">${esc(t(U.examples))}</span>${exs}</span></div>
        </section>`;
      const reCard = `<section class="tb-card a-re"><span class="tb-lbl">${esc(t(U.result))}</span>${S.err ? errHTML() : S.res ? `${pipeHTML(S.res)}<div style="height:10px"></div>${resultTable(S.res)}` : `<p class="tb-note">${esc(t(U.pressRun))}</p>`}</section>`;
      return `<div class="tb-sg">${edCard}${reCard}${schemaCard}</div>`;
    }

    function sortBody() {
      const res = S.res;
      const tbl = res ? resultTable(res, { click: true, srcCols: A.columns, sortCol: S.sortCol, sortDir: S.sortDir, typeOf: (c) => typeBadge(A, A.columns.indexOf(c)) }) : '';
      return `<div class="tb-grid tb-two"><div class="tb-col">${filterBar()}<p class="tb-note">${esc(t(U.sortHint))}</p>${sqlBox(sortSql())}</div>
        <div class="tb-col"><section class="tb-card"><span class="tb-lbl">${esc(an)} · ${esc(t(U.rowsN(res ? res.rows.length : 0)))}</span>${tbl}</section></div></div>`;
    }

    function groupBody() {
      const res = S.res;
      const gname = A.columns[S.g.gcol], vname = S.g.vcol != null ? A.columns[S.g.vcol] : null;
      const gvals = distinctOf(A, S.g.gcol);
      const colourOf = (v) => PALETTE[Math.max(0, gvals.indexOf(v)) % PALETTE.length];
      const src = resultTable({ columns: A.columns, rows: A.rows.filter((r) => !S.filters.length || (S.res && S.res.srcOk ? true : true)), ids: A.rows.map((r, i) => i) }, {
        click: true, srcCols: A.columns, noArrow: true, typeOf: (c) => typeBadge(A, A.columns.indexOf(c)),
        pick: (c) => (A.columns.indexOf(c) === S.g.gcol ? t(U.groupBy) : A.columns.indexOf(c) === S.g.vcol && S.g.fn !== 'COUNT' ? t(U.valueCol) : ''),
        rowClass: () => 'tb-g', rowStyle: (r) => `--g:${S.ran && S.res ? colourOf(r[S.g.gcol]).bg : 'transparent'}`,
      });
      let out = '';
      if (S.err) out = errHTML();
      else if (res) {
        const max = Math.max(...res.rows.map((r) => Math.abs(r[1]) || 0), 1);
        out = `<ul class="tb-bars">${res.rows.map((r, i) => { const c = colourOf(r[0]); return `<li class="tb-bar"><span>${esc(fmt(r[0]))}</span><div class="tb-track"><div class="tb-fill" style="--w:${Math.max(6, Math.round((Math.abs(r[1]) || 0) / max * 100))}%;--bg:${c.bg};--fg:${c.fg};--i:${i}">${esc(fmt(r[1]))}</div></div></li>`; }).join('')}</ul>${pipeHTML(res)}`;
      } else out = `<p class="tb-note">${esc(t(U.pressRun))}</p>`;
      const fns = Object.keys(U.fns).map((f) => `<button type="button" aria-pressed="${S.g.fn === f}" data-fn="${f}">${esc(t(U.fns[f]))}</button>`).join('');
      const selG = `<select class="tb-sel" data-g="gcol" aria-label="${esc(t(U.groupBy))}">${A.columns.map((c, i) => `<option value="${i}"${i === S.g.gcol ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
      const selV = `<select class="tb-sel" data-g="vcol" aria-label="${esc(t(U.valueCol))}">${measureCols(A).map((i) => `<option value="${i}"${i === S.g.vcol ? ' selected' : ''}>${esc(A.columns[i])}</option>`).join('')}</select>`;
      return `<div class="tb-grid tb-two"><div class="tb-col">
        <section class="tb-card"><div class="tb-fbar" style="margin-bottom:10px"><label>${esc(t(U.groupBy))}${selG}</label><label>${esc(t(U.valueCol))}${selV}</label></div>
          <span class="tb-lbl">${esc(t(U.howCalc))}</span><div class="tb-seg" role="group" aria-label="${esc(t(U.howCalc))}">${fns}</div>
          <div class="tb-row" style="margin-top:12px"><button type="button" class="tb-btn" data-key="run" data-act="run">▶ ${esc(t(U.run))}</button></div></section>
        ${filterBar()}${sqlBox(groupSql())}</div>
        <div class="tb-col"><section class="tb-card"><span class="tb-lbl">${esc(t(U.result))}${vname && S.g.fn !== 'COUNT' ? ` · ${esc(S.g.fn)}(${esc(vname)}) / ${esc(gname)}` : ` · COUNT / ${esc(gname)}`}</span>${out}</section>
        <section class="tb-card"><span class="tb-lbl">${esc(an)}</span><p class="tb-note" style="margin-bottom:8px">${esc(t(U.groupHint))}</p>${src}</section></div></div>`;
    }

    function joinBody() {
      const bn = names[1], B = tables[bn];
      const key = S.j.key;
      const ka = A.columns.indexOf(key), kb = B.columns.findIndex((c) => c.toLowerCase() === key.toLowerCase());
      const va = new Set(A.rows.map((r) => r[ka]).filter((v) => v != null)), vb = new Set(B.rows.map((r) => r[kb]).filter((v) => v != null));
      const common = [...va].filter((v) => vb.has(v));
      const colour = (v) => { const i = common.indexOf(v); return i < 0 ? null : PALETTE[i % PALETTE.length]; };
      const keyCell = (v, isn) => { const c = colour(v); return v == null ? `<td class="nul">NULL</td>` : `<td${isn ? ' class="n"' : ''}><span class="tb-key${c ? '' : ' none'}"${c ? ` style="--kb:${c.bg};--kf:${c.fg}"` : ''}>${esc(fmt(v))}</span></td>`; };
      const mk = (name, tb, ki) => resultTable({ columns: tb.columns, rows: tb.rows, ids: tb.rows.map((r, i) => i) }, {
        click: true, srcCols: tb.columns.filter((c) => sharedCols(A, B).some((s) => s.toLowerCase() === c.toLowerCase())), noArrow: true,
        pick: (c) => (c.toLowerCase() === key.toLowerCase() ? t(U.joinOn) : ''),
        rowClass: (r) => (S.jRan && colour(r[ki]) == null ? 'tb-dim' : ''),
        cellHook: (v, ci, r, isn) => (ci === ki ? keyCell(v, isn) : cellHTML(v, isn)),
      });
      const res = S.res;
      let out = S.err ? errHTML() : '';
      if (!S.err && S.jRan && res) {
        const rcols = res.columns;
        const kidx = rcols.map((c, i) => (c.toLowerCase().endsWith(key.toLowerCase()) ? i : -1)).filter((i) => i >= 0);
        const noA = A.rows.filter((r) => colour(r[ka]) == null).length, noB = B.rows.filter((r) => colour(r[kb]) == null).length;
        const lostA = S.j.type === 'LEFT' ? 0 : noA;
        out = `${resultTable(res, { cellHook: (v, ci, r, isn) => (kidx.includes(ci) ? (v == null ? `<td><span class="tb-key none">${esc(t(U.noPartner))}</span></td>` : keyCell(v, isn)) : cellHTML(v, isn)) })}<p class="tb-note" style="margin-top:8px">${esc(t(U.matchNote(res.rows.length, lostA ? noA : S.j.type === 'LEFT' ? noA : noA, noB, an, bn)))}</p>`;
      } else if (!S.err) out = `<p class="tb-note">${esc(t(U.pressRun))}</p>`;
      const sh = sharedCols(A, B);
      const keySel = sh.length > 1 ? `<label class="tb-lbl" style="margin:0">${esc(t(U.joinOn))} <select class="tb-sel" data-j="key">${sh.map((c) => `<option${c === key ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>` : '';
      return `<div class="tb-grid"><section class="tb-card"><div class="tb-row" style="gap:14px"><div><span class="tb-lbl">${esc(t(U.joinKind))}</span><div class="tb-seg" role="group" aria-label="${esc(t(U.joinKind))}"><button type="button" aria-pressed="${S.j.type === 'INNER'}" data-jt="INNER">${esc(t(U.inner))}</button><button type="button" aria-pressed="${S.j.type === 'LEFT'}" data-jt="LEFT">${esc(t(U.leftJ))}</button></div></div>${keySel}
        <button type="button" class="tb-btn" data-key="run" data-act="run">▶ ${esc(t(U.run))}</button></div><p class="tb-note" style="margin-top:10px">${esc(t(U.joinHint))}</p></section>
        <div class="tb-grid tb-twoeq" style="display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))"><section class="tb-card" style="min-width:0"><span class="tb-lbl">${esc(an)}</span>${mk(an, A, ka)}</section><section class="tb-card" style="min-width:0"><span class="tb-lbl">${esc(bn)}</span>${mk(bn, B, kb)}</section></div>
        ${sqlBox(joinSql())}
        <section class="tb-card"><span class="tb-lbl">${esc(t(U.result))}</span>${out}</section></div>`;
    }

    // spreadsheet
    const sheetGet = (c, r) => (r === 1 ? A.columns[c] : r - 2 < S.cells.length && r >= 2 ? S.cells[r - 2][c] : null);
    const recalc = () => {
      S.cards.forEach((cd) => {
        try { const r = evalFormula(cd.f, sheetGet, A.columns.length); cd.v = r.v; cd.refs = r.refs; cd.err = null; } catch (x) { if (!x.fcode) throw x; cd.err = x.fcode; cd.v = null; }
      });
    };
    function sheetBody() {
      const nc = A.columns.length;
      const refSet = new Set();
      const last = S.cards[S.cards.length - 1];
      if (last && !last.err) last.refs.forEach((rg) => { for (let c = rg.c1; c <= rg.c2; c++) for (let r = rg.r1; r <= rg.r2; r++) refSet.add(c + ',' + r); });
      const head = A.columns.map((c, i) => `<th scope="col" class="${colType(A, i) === 'num' ? 'n' : ''}"><button type="button" class="tb-th" data-key="column:${esc(c)}" data-col="${esc(c)}" aria-label="${esc(c)} (${colLetter(i)})"><span><span class="letter">${colLetter(i)}</span>${esc(c)}</span></button></th>`).join('');
      const rows = S.cells.map((r, ri) => `<tr><td class="tb-rn">${ri + 2}</td>${r.map((v, ci) => {
        const isn = colType(A, ci) === 'num';
        const cls = (isn ? 'n' : '') + (refSet.has(ci + ',' + (ri + 2)) ? ' tb-ref' : '');
        return isn ? `<td class="${cls}"><input class="tb-cell" inputmode="decimal" data-c="${ci}" data-r="${ri}" value="${esc(v == null ? '' : v)}" aria-label="${colLetter(ci)}${ri + 2}"></td>` : `<td class="${cls}"><span class="tb-cellv">${esc(v == null ? '' : v)}</span></td>`;
      }).join('')}</tr>`).join('');
      const fnb = ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'ROUND'].map((f) => `<button type="button" class="tb-chip" data-f1="${f}">${f}</button>`).join('');
      const cards = S.cards.length ? `<ul class="tb-rcs">${S.cards.slice().reverse().map((cd) => `<li class="tb-rc"><code>${esc(cd.f)}</code><b>${cd.err ? esc(cd.err) : esc(fmt(cd.v))}</b></li>`).join('')}</ul>` : '';
      return `<div class="tb-grid tb-two"><div class="tb-col"><section class="tb-card"><span class="tb-lbl">${esc(t(U.formula))}</span>
          <div class="tb-fx"><span class="lab" aria-hidden="true">fx</span><input class="tb-in" id="tb-f" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="=SUM(B2:B9)" value="${esc(S.f)}" aria-label="${esc(t(U.formula))}">
          <button type="button" class="tb-btn" data-key="run" data-act="run">${esc(t(U.calc))}</button></div>
          <div class="tb-chips tb-scrollx" style="margin-top:8px" role="group" aria-label="${esc(t(U.words))}">${fnb}</div>
          ${S.fmsg ? `<div class="tb-err" role="alert" style="margin-top:8px">${esc(t(S.fmsg))}</div>` : ''}
          <p class="tb-note" style="margin-top:8px">${esc(t(U.sheetHint))}</p></section>
          <section class="tb-card"><span class="tb-lbl">${esc(t(U.results))}</span>${cards || `<p class="tb-note">${esc(t(U.pressRun))}</p>`}</section></div>
        <div class="tb-col"><section class="tb-card"><span class="tb-lbl">${esc(an)}</span><div class="tb-scroll" tabindex="0" role="region" aria-label="${esc(an)}"><table class="tb-t tb-sheet"><thead><tr><th class="tb-rn" scope="col"><span></span></th>${head}</tr></thead><tbody>${rows}</tbody></table></div></section></div></div>`;
    }

    // ---- paint
    let flipPrev = null;
    function paint() {
      const body = mode === 'sql' ? sqlBody() : mode === 'sort-filter' ? sortBody() : mode === 'group' ? groupBody() : mode === 'join' ? joinBody() : sheetBody();
      const task = config.task ? `<section class="tb-card tb-task"><b>${esc(t(U.task))}</b><p lang="${api.lang ? api.lang() : 'en'}">${esc(t(config.task))}</p></section>` : '';
      const focusId = document.activeElement && root.contains(document.activeElement) ? (document.activeElement.id || document.activeElement.getAttribute('data-key') || '') : '';
      const focusAct = document.activeElement && root.contains(document.activeElement) ? document.activeElement.getAttribute('data-act') || document.activeElement.getAttribute('data-fn') || document.activeElement.getAttribute('data-jt') || '' : '';
      root.innerHTML = `<div class="tb"><div class="tb-top"><span class="tb-badge">${esc(t(U.modes[mode]))}</span><span class="tb-sample">${esc(t(U.sample))}</span></div>${task}${body}${questionHTML()}<div class="tb-live" aria-live="polite" role="status">${esc(S.status)}</div></div>`;
      if (focusId || focusAct) {
        const el = (focusId && (root.querySelector('#' + CSS_ESC(focusId)) || root.querySelector(`[data-key="${focusId.replace(/"/g, '')}"]`))) || (focusAct && root.querySelector(`[data-act="${focusAct}"],[data-fn="${focusAct}"],[data-jt="${focusAct}"]`));
        if (el && el.focus) el.focus({ preventScroll: true });
      }
      if (flipPrev && !reduced() && root.animate !== undefined) {
        root.querySelectorAll('tr[data-rid]').forEach((tr) => {
          const old = flipPrev[tr.getAttribute('data-rid')];
          if (old == null) return;
          const d = old - tr.getBoundingClientRect().top;
          if (Math.abs(d) > 1 && tr.animate) tr.animate([{ transform: `translateY(${d}px)` }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
        });
      }
      flipPrev = null;
    }
    const CSS_ESC = (s) => (window.CSS && window.CSS.escape ? window.CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&'));
    const snapRows = () => { if (mode !== 'sort-filter') return; flipPrev = {}; root.querySelectorAll('tr[data-rid]').forEach((tr) => { flipPrev[tr.getAttribute('data-rid')] = tr.getBoundingClientRect().top; }); };

    // ---- actions
    function insertAt(text, raw) {
      const ta = root.querySelector('#tb-q');
      if (!ta) return;
      const a = ta.selectionStart == null ? ta.value.length : ta.selectionStart, b = ta.selectionEnd == null ? a : ta.selectionEnd;
      const before = ta.value.slice(0, a), after = ta.value.slice(b);
      const pre = before && !/[\s(.,]$/.test(before) && !/^[(),.]/.test(text) ? ' ' : '';
      const ins = pre + text + (raw && /^[A-Z ]+$/.test(text) ? ' ' : '');
      ta.value = before + ins + after;
      S.q = ta.value;
      const pos = (before + ins).length;
      try { ta.setSelectionRange(pos, pos); if (window.matchMedia && matchMedia('(pointer:fine)').matches) ta.focus({ preventScroll: true }); } catch (e) {}
    }
    function insertF(text) {
      const inp = root.querySelector('#tb-f');
      if (!inp) return;
      let v = inp.value;
      if (!v.trim()) v = '=';
      const a = inp === document.activeElement || inp.selectionStart != null ? Math.max(inp.selectionStart || 0, inp.value.trim() ? 0 : 1) : v.length;
      const pos = inp.value.trim() ? (inp.selectionStart == null ? v.length : inp.selectionStart) : 1;
      const end = inp.value.trim() ? (inp.selectionEnd == null ? pos : inp.selectionEnd) : 1;
      const out = v.slice(0, pos) + text + v.slice(end);
      inp.value = out; S.f = out;
      const np = pos + text.length;
      try { inp.setSelectionRange(np, np); if (window.matchMedia && matchMedia('(pointer:fine)').matches) inp.focus({ preventScroll: true }); } catch (e) {}
      void a;
    }
    function onClick(ev) {
      const el = ev.target.closest('button');
      if (!el || !root.contains(el)) return;
      // answer
      if (el.hasAttribute('data-ans')) {
        if (!can('answer')) return;
        const i = +el.getAttribute('data-ans');
        if (S.ans.done) return;
        if (question.opts[i].ok) {
          S.ans.done = true;
          api.record(t(T2('Answered correctly: ', 'सही उत्तर दिया: ')) + question.opts[i].label);
          api.emit('answered:right');
          paint();
          if (api.celebrate) api.celebrate();
        } else {
          S.ans.wrong.add(i);
          api.record(t(T2('Answered wrongly: ', 'गलत उत्तर दिया: ')) + question.opts[i].label);
          api.emit('answered:wrong');
          paint();
        }
        return;
      }
      if (el.hasAttribute('data-ins')) {
        const key = el.getAttribute('data-key');
        if (key && !can(key)) return;
        insertAt(el.getAttribute('data-ins'), el.hasAttribute('data-raw'));
        return;
      }
      if (el.hasAttribute('data-ex')) { S.q = exList[+el.getAttribute('data-ex')]; paint(); const ta = root.querySelector('#tb-q'); if (ta) ta.focus({ preventScroll: true }); return; }
      if (el.hasAttribute('data-f1')) { if (!can('run') && false) return; insertF(el.getAttribute('data-f1') + '('); return; }
      const act = el.getAttribute('data-act');
      if (act === 'run') {
        if (!can('run')) return;
        if (mode === 'spreadsheet') return calcSheet();
        if (mode === 'sql') { const ta = root.querySelector('#tb-q'); if (ta) S.q = ta.value; if (!S.q.trim()) { toast(U.needLiquid); return; } }
        if (mode === 'group' && S.g.fn !== 'COUNT' && S.g.vcol == null) { toast(U.needNum); return; }
        if (mode === 'join') S.jRan = true;
        execute(true); paint(); return;
      }
      if (act === 'apply') {
        if (!can('filter')) return;
        const f = S.fb;
        if (f.val === '' || f.val == null) return;
        const ci = A.columns.indexOf(f.col), isn = colType(A, ci) === 'num';
        const val = isn ? Number(f.val) : String(f.val);
        if (isn && !isFinite(val)) return;
        snapRows();
        S.filters.push({ col: f.col, op: f.op, val });
        S.fb.val = '';
        execute(true); paint(); return;
      }
      if (act === 'clearf') { if (!can('filter')) return; snapRows(); S.filters = []; execute(true); paint(); return; }
      if (el.hasAttribute('data-rm')) { if (!can('filter')) return; snapRows(); S.filters.splice(+el.getAttribute('data-rm'), 1); execute(true); paint(); return; }
      if (el.hasAttribute('data-fn')) { S.g.fn = el.getAttribute('data-fn'); if (S.g.fn !== 'COUNT' && S.g.vcol == null) S.g.vcol = measureCols(A)[0]; paint(); return; }
      if (el.hasAttribute('data-jt')) { S.j.type = el.getAttribute('data-jt'); S.jRan = false; S.res = null; S.err = null; paint(); return; }
      if (el.classList.contains('tb-th')) {
        const col = el.getAttribute('data-col');
        if (!can('column:' + col)) return;
        const ci = A.columns.findIndex((c) => c === col);
        if (mode === 'sort-filter') {
          snapRows();
          if (S.sortCol !== col) { S.sortCol = col; S.sortDir = 'asc'; } else if (S.sortDir === 'asc') S.sortDir = 'desc'; else { S.sortCol = null; S.sortDir = null; }
          execute(true); paint(); return;
        }
        if (mode === 'group') {
          if (colType(A, ci) === 'num') { S.g.vcol = ci; if (S.g.fn === 'COUNT') S.g.fn = 'SUM'; } else S.g.gcol = ci;
          S.res = null; paint(); return;
        }
        if (mode === 'join') {
          const sh = sharedCols(A, tables[names[1]]);
          if (!sh.some((s) => s.toLowerCase() === col.toLowerCase())) { toast(U.notShared); return; }
          S.j.key = sh.find((s) => s.toLowerCase() === col.toLowerCase()); S.jRan = false; S.res = null; paint(); return;
        }
        if (mode === 'spreadsheet') {
          const L1 = colLetter(ci), rg = `${L1}2:${L1}${S.cells.length + 1}`;
          const inp = root.querySelector('#tb-f');
          if (inp && !inp.value.trim()) { const f = '=' + (colType(A, ci) === 'num' ? 'SUM(' + rg + ')' : 'COUNT(' + rg + ')'); inp.value = f; S.f = f; } else insertF(rg);
          return;
        }
      }
    }
    function calcSheet() {
      const inp = root.querySelector('#tb-f');
      if (inp) S.f = inp.value;
      api.emit('queried');
      try {
        const r = evalFormula(S.f, sheetGet, A.columns.length);
        S.fmsg = null;
        const f = (S.f.trim()[0] === '=' ? '' : '=') + S.f.trim();
        S.cards.push({ f, v: r.v, refs: r.refs, err: null });
        if (S.cards.length > 6) S.cards.shift();
        S.status = t(T2('Result: ', 'परिणाम: ')) + fmt(r.v);
        api.record(t(T2('Calculated ', 'गणना की ')) + f + ' = ' + fmt(r.v));
        paint();
        api.emit('result');
      } catch (x) {
        if (!x.fcode) throw x;
        S.fmsg = FERR[x.fcode] || FERR['#SYNTAX'];
        S.status = t(S.fmsg);
        api.record(t(T2('Formula error ', 'सूत्र में गलती ')) + x.fcode);
        paint();
      }
    }
    function onInput(ev) {
      const el = ev.target;
      if (el.id === 'tb-q') { S.q = el.value; return; }
      if (el.id === 'tb-f') { S.f = el.value; return; }
      if (el.getAttribute('data-f') === 'val') { S.fb.val = el.value; }
    }
    function onChange(ev) {
      const el = ev.target;
      const f = el.getAttribute('data-f');
      if (f) { S.fb[f] = el.value; if (f === 'col' || f === 'op') { S.fb.val = ''; paint(); } return; }
      const g = el.getAttribute('data-g');
      if (g) { S.g[g] = +el.value; S.res = null; paint(); return; }
      if (el.getAttribute('data-j') === 'key') { S.j.key = el.value; S.jRan = false; S.res = null; paint(); return; }
      if (el.classList.contains('tb-cell')) {
        const c = +el.dataset.c, r = +el.dataset.r;
        const raw = el.value.trim();
        const x = Number(raw);
        if (raw === '') S.cells[r][c] = null;
        else if (isFinite(x)) S.cells[r][c] = x;
        else { el.value = S.cells[r][c] == null ? '' : S.cells[r][c]; toast(T2('Type a number here.', 'यहाँ संख्या लिखो।')); return; }
        recalc();
        tmo(paint, 0);
      }
    }
    function onKey(ev) {
      const el = ev.target;
      if (el.id === 'tb-q' && ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); if (can('run')) { S.q = el.value; execute(true); paint(); } }
      else if (el.id === 'tb-f' && ev.key === 'Enter') { ev.preventDefault(); if (can('run')) calcSheet(); }
      else if (el.getAttribute && el.getAttribute('data-f') === 'val' && ev.key === 'Enter') { ev.preventDefault(); const b = root.querySelector('[data-act="apply"]'); if (b) b.click(); }
    }
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('keydown', onKey);

    // start state: show something useful without counting it as the child's action
    if (mode === 'sql' || mode === 'sort-filter' || mode === 'group') execute(false);
    paint();
    return { destroy() { timers.forEach(clearTimeout); root.removeEventListener('click', onClick); root.removeEventListener('input', onInput); root.removeEventListener('change', onChange); root.removeEventListener('keydown', onKey); root.innerHTML = ''; } };
  }

  // ---------------------------------------------------------------- the demo (invented sample data)
  const DEMO = {
    mode: 'sql',
    tables: {
      students: {
        columns: ['roll', 'name', 'house', 'city', 'maths', 'science'],
        rows: [
          [1, 'Aarav', 'Aravali', 'Jaipur', 78, 82], [2, 'Diya', 'Nilgiri', 'Chennai', 91, 88], [3, 'Kabir', 'Himalaya', 'Shimla', 65, 70],
          [4, 'Meera', 'Vindhya', 'Bhopal', 84, 79], [5, 'Ishaan', 'Aravali', 'Udaipur', 72, 68], [6, 'Anaya', 'Nilgiri', 'Kochi', 95, 93],
          [7, 'Rohan', 'Himalaya', 'Dehradun', 58, 64], [8, 'Sara', 'Vindhya', 'Indore', 88, 90], [9, 'Vihaan', 'Aravali', 'Ajmer', 81, 77],
          [10, 'Tara', 'Nilgiri', 'Madurai', 69, 74], [11, 'Dev', 'Himalaya', 'Manali', 76, 71], [12, 'Zoya', 'Sahyadri', 'Pune', 87, 85],
        ],
      },
      houses: {
        columns: ['house', 'colour', 'captain'],
        rows: [['Aravali', 'Red', 'Neha'], ['Nilgiri', 'Blue', 'Arjun'], ['Himalaya', 'White', 'Isha'], ['Vindhya', 'Green', 'Kunal'], ['Satpura', 'Yellow', 'Ritu']],
      },
    },
    task: T2('Find which house has the best average marks in maths. Then join the two tables to see each house colour.', 'पता करो किस हाउस के गणित में औसत अंक सबसे अच्छे हैं। फिर दोनों तालिकाएँ जोड़कर हर हाउस का रंग देखो।'),
    query: 'SELECT house, COUNT(*) AS how_many, AVG(maths) AS average_maths FROM students GROUP BY house ORDER BY average_maths DESC',
  };

  NCA_T.register({
    id: 'table',
    css: CSS,
    validate,
    keys,
    demo: DEMO,
    modes: MODES,
    // pure engines, for tests under Node
    model: { runSQL, parse, evalFormula, buildQuestion, sharedCols, measureCols },
    mount,
  });
})();
