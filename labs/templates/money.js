// Template: Shop and money. Indian coins and notes (count them, pay exactly, give change), bills, profit and loss,
// discount, simple and compound interest, and a shopping budget. All arithmetic is exact: money is held in paise
// (whole numbers), interest uses BigInt so compound interest has no floating-point drift. A lab can only choose
// among the modes below, so it can never show an impossible result. Current Indian denominations: coins 1, 2, 5, 10,
// 20 rupees; notes 10, 20, 50, 100, 200, 500 rupees. Pictures are play money for learning.
// Config:
//   { mode: 'count'|'pay'|'change'|'bill'|'profit-loss'|'discount'|'simple-interest'|'compound-interest'|'budget',
//     items?: [{ name: {en,hi}, price: whole rupees, qty?: 0-20 (bill only: how many the bill starts with) }] (1-8; bill 1-6),
//     budget?: whole rupees (count: the pile to count, 1-2000; change: what the customer hands over, more than every price;
//              simple/compound-interest: the principal; budget: the amount to spend, default 100),
//     rate?: percent in steps of 0.5 (profit-loss: starting profit, negative = loss; discount: % off; interest: % a year),
//     years?: 1-20 (interest modes),
//     pick?: [item indexes already chosen] (pay, change, profit-loss, discount: at most the stated number; budget: any) }
// Items are needed in pay, change, bill, profit-loss, discount and budget. In the interest modes an item is optional
// and becomes the goal ("saving for ...") drawn as a dashed line on the chart.
// Targets: coin:<v>, note:<v>, item:<i>, pay, answer, slider:<rate|years|price>.
// Events: paid, change:<amount>, answered:right, answered:wrong, over-budget; also picked:<i>, placed:<coin|note>:<v>,
// moved:<rate|years|price>.
(function () {
  const L = window.NCA_LIB;
  const { esc } = L;
  const T2 = (en, hi) => ({ en, hi });
  const COINS = [1, 2, 5, 10, 20];
  const NOTES = [10, 20, 50, 100, 200, 500];
  const MODES = ['count', 'pay', 'change', 'bill', 'profit-loss', 'discount', 'simple-interest', 'compound-interest', 'budget'];
  const KEYS = ['mode', 'items', 'budget', 'rate', 'years', 'pick'];
  const ALLOW = {
    count: ['budget'], pay: ['items', 'pick'], change: ['items', 'budget', 'pick'], bill: ['items'],
    'profit-loss': ['items', 'rate', 'pick'], discount: ['items', 'rate', 'pick'],
    'simple-interest': ['items', 'budget', 'rate', 'years'], 'compound-interest': ['items', 'budget', 'rate', 'years'],
    budget: ['items', 'budget', 'pick'],
  };
  const NEEDS_ITEMS = ['pay', 'change', 'bill', 'profit-loss', 'discount', 'budget'];
  const INTEREST = (m) => m === 'simple-interest' || m === 'compound-interest';

  // ---------------------------------------------------------------- exact money (paise are whole numbers)
  const fmtInt = (n) => {
    let s = String(Math.abs(Math.round(n)));
    if (s.length > 3) s = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + s.slice(-3);
    return s;
  };
  const rs = (p) => { const neg = p < 0; p = Math.abs(p); const r = Math.floor(p / 100), q = p % 100; return (neg ? '−' : '') + '₹' + fmtInt(r) + (q ? '.' + String(q).padStart(2, '0') : ''); };
  const R = (n) => rs(n * 100);
  const num = (x) => String(Math.round(x * 100) / 100);
  const mulDivRound = (a, b, c) => { const n = BigInt(a) * BigInt(b), d = BigInt(c); return Number((2n * n + d) / (2n * d)); };
  const pctOf = (paise, r2) => mulDivRound(paise, r2, 200); // r2 = rate in half-percents
  const siOf = (P, r2, n) => mulDivRound(P, r2 * n, 200);
  const ciAmount = (P, r2, k) => { if (k === 0) return P; const nu = BigInt(P) * BigInt(200 + r2) ** BigInt(k), de = 200n ** BigInt(k); return Number((2n * nu + de) / (2n * de)); };
  const short = (rupees) => (rupees >= 1e7 ? num(rupees / 1e7) + 'Cr' : rupees >= 1e5 ? num(rupees / 1e5) + 'L' : rupees >= 1e4 ? num(rupees / 1e3) + 'k' : fmtInt(rupees));

  const DENOMS = [['note', 500], ['note', 200], ['note', 100], ['note', 50], ['note', 20], ['note', 10], ['coin', 5], ['coin', 2], ['coin', 1]].map(([k, v]) => ({ k, v }));
  const ALLD = [['note', 500], ['note', 200], ['note', 100], ['note', 50], ['note', 20], ['coin', 20], ['note', 10], ['coin', 10], ['coin', 5], ['coin', 2], ['coin', 1]].map(([k, v]) => ({ k, v }));
  function greedy(amount) { const out = []; let r = amount; DENOMS.forEach((d) => { while (r >= d.v) { out.push(d); r -= d.v; } }); return out; }
  function rng(seed) { let a = (seed * 2654435761 + 12345) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // A pile of coins and notes that adds up to exactly `amount`, mixed but always the same for the same amount.
  function pile(amount) {
    const rand = rng(amount * 7919 + 13);
    let r = amount, out = [];
    while (r > 0) {
      const c = ALLD.filter((d) => d.v <= r);
      const d = out.length >= 10 ? c[0] : c[rand() < 0.5 ? 0 : Math.floor(rand() * Math.min(c.length, 4))];
      out.push(d); r -= d.v;
    }
    if (out.length > 16) out = greedy(amount);
    return out.sort((a, b) => (a.k === b.k ? b.v - a.v : a.k === 'note' ? -1 : 1));
  }
  const autoPaid = (price) => { const n = NOTES.find((v) => v > price); return n || Math.ceil((price + 1) / 500) * 500; };
  const pName = (k, v) => (k === 'coin' ? T2(`₹${v} coin`, `₹${v} का सिक्का`) : T2(`₹${v} note`, `₹${v} का नोट`));

  // ---------------------------------------------------------------- config
  const isInt = (x) => typeof x === 'number' && Number.isInteger(x);
  const okName = (n) => n && typeof n === 'object' && typeof n.en === 'string' && n.en.trim() && typeof n.hi === 'string' && n.hi.trim();
  const priceCap = (m) => (m === 'bill' ? 10000 : m === 'pay' || m === 'change' || m === 'budget' ? 2000 : 100000);
  function validate(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
    const e = [], m = c.mode;
    if (!MODES.includes(m)) return ['mode: one of ' + MODES.join(', ')];
    Object.keys(c).forEach((k) => {
      if (!KEYS.includes(k)) e.push('unknown key: ' + k);
      else if (k !== 'mode' && !ALLOW[m].includes(k)) e.push(`"${k}" is not used in mode "${m}"`);
    });
    const it = c.items;
    if (it != null) {
      if (!Array.isArray(it) || it.length < 1 || it.length > (m === 'bill' ? 6 : 8)) e.push(`items: 1 to ${m === 'bill' ? 6 : 8} entries`);
      else {
        it.forEach((x, i) => {
          if (!x || typeof x !== 'object') { e.push(`items[${i}]: an object { name: {en,hi}, price }`); return; }
          Object.keys(x).forEach((k) => { if (!['name', 'price', 'qty'].includes(k)) e.push(`items[${i}]: unknown key ${k}`); });
          if (!okName(x.name)) e.push(`items[${i}].name: needs both en and hi text`);
          if (!isInt(x.price) || x.price < 1 || x.price > priceCap(m)) e.push(`items[${i}].price: a whole number of rupees, 1 to ${priceCap(m)}`);
          if (x.qty != null && (m !== 'bill' || !isInt(x.qty) || x.qty < 0 || x.qty > 20)) e.push(`items[${i}].qty: only in mode bill, a whole number 0 to 20`);
        });
      }
    } else if (NEEDS_ITEMS.includes(m)) e.push(`mode "${m}" needs items`);
    const okItems = Array.isArray(it) && it.every((x) => x && isInt(x.price));
    const prices = okItems ? it.map((x) => x.price) : [];
    if (c.budget != null) {
      const b = c.budget;
      const lim = m === 'count' ? 2000 : m === 'change' ? 5000 : m === 'budget' ? 5000 : 1000000;
      const lo = INTEREST(m) ? 100 : 1;
      if (!isInt(b) || b < lo || b > lim) e.push(`budget: a whole number of rupees, ${lo} to ${lim}`);
      else if (m === 'change' && prices.length && b <= Math.max(...prices)) e.push('budget: the money handed over must be more than every price (else there is no change)');
      else if (m === 'budget' && prices.length && b < Math.min(...prices)) e.push('budget: must buy at least the cheapest item');
    } else if (m === 'count') e.push('count needs budget (the amount of money to count)');
    if (c.rate != null) {
      const r = c.rate, [lo, hi] = m === 'discount' ? [0, 90] : m === 'profit-loss' ? [-50, 100] : [0.5, 25];
      if (typeof r !== 'number' || !isFinite(r) || r < lo || r > hi || !Number.isInteger(r * 2)) e.push(`rate: a percent from ${lo} to ${hi} in steps of 0.5`);
    }
    if (c.years != null && (!isInt(c.years) || c.years < 1 || c.years > 20)) e.push('years: a whole number 1 to 20');
    if (c.pick != null) {
      const cap = m === 'budget' ? 30 : m === 'pay' ? 8 : 1;
      if (!Array.isArray(c.pick) || c.pick.length > cap || c.pick.some((i) => !isInt(i) || i < 0 || !Array.isArray(it) || i >= it.length)) e.push(`pick: at most ${cap} valid item indexes`);
      else if (m !== 'budget' && new Set(c.pick).size !== c.pick.length) e.push('pick: each item once');
    }
    return e;
  }
  function norm(c) {
    const o = { mode: c.mode, items: (c.items || []).map((x) => ({ name: x.name, price: x.price, qty: x.qty })), pick: (c.pick || []).slice() };
    const m = c.mode;
    o.budget = c.budget != null ? c.budget : m === 'budget' ? 100 : INTEREST(m) ? 10000 : null;
    o.rate = c.rate != null ? c.rate : m === 'discount' ? 20 : m === 'profit-loss' ? 20 : m === 'compound-interest' ? 10 : 8;
    o.years = c.years != null ? c.years : 3;
    return o;
  }
  function keys(c) {
    const m = c && c.mode;
    const n = (c && Array.isArray(c.items) && c.items.length) || 0;
    const itemT = Array.from({ length: n }, (_, i) => 'item:' + i);
    const wallet = COINS.map((v) => 'coin:' + v).concat(NOTES.map((v) => 'note:' + v));
    const placed = ['placed:*'];
    if (m === 'count') {
      const have = c && isInt(c.budget) && c.budget > 0 ? pile(c.budget) : [];
      return { targets: [...new Set(have.map((d) => d.k + ':' + d.v))].concat(['answer']), events: ['answered:right', 'answered:wrong'] };
    }
    if (m === 'pay') return { targets: wallet.concat(itemT, ['pay']), events: ['paid', 'answered:right', 'answered:wrong', 'picked:*'].concat(placed) };
    if (m === 'change') return { targets: wallet.concat(itemT, ['answer']), events: ['change:*', 'answered:right', 'answered:wrong', 'picked:*'].concat(placed) };
    if (m === 'bill') return { targets: itemT.concat(['answer']), events: ['answered:right', 'answered:wrong', 'picked:*'] };
    if (m === 'profit-loss') return { targets: itemT.concat(['slider:price', 'answer']), events: ['answered:right', 'answered:wrong', 'picked:*', 'moved:price'] };
    if (m === 'discount') return { targets: itemT.concat(['slider:rate', 'slider:price', 'answer']), events: ['answered:right', 'answered:wrong', 'picked:*', 'moved:rate', 'moved:price'] };
    if (INTEREST(m)) return { targets: ['slider:rate', 'slider:years', 'slider:price', 'answer'], events: ['answered:right', 'answered:wrong', 'moved:rate', 'moved:years', 'moved:price'] };
    if (m === 'budget') return { targets: itemT.concat(['pay']), events: ['paid', 'over-budget', 'picked:*'] };
    return { targets: [], events: [] };
  }

  // ---------------------------------------------------------------- art: coins, notes, goods, piggy bank
  const NOTE_COL = {
    10: ['#C98F63', '#7A4A2B', '#EBC9A8'], 20: ['#CBD85F', '#66751C', '#EEF3B5'], 50: ['#5ED3DA', '#17747E', '#BDF1F4'],
    100: ['#BBA7DC', '#5F4796', '#E5DAF5'], 200: ['#F8BA55', '#A5620B', '#FFE3A8'], 500: ['#BDBAB1', '#5F5C53', '#E8E6DF'],
  };
  const ngon = (n, r, cx, cy) => Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return (cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1); }).join(' ');
  function coinSVG(v) {
    const sides = v === 2 ? 11 : v === 20 ? 12 : 0, bi = v >= 10;
    const shape = (r, fill, stroke, sw) => (sides ? `<polygon points="${ngon(sides, r, 32, 32)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>` : `<circle cx="32" cy="32" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`);
    const gold = v === 5 || bi;
    const dark = gold ? '#5E4408' : '#3C4856';
    const fs = v >= 10 ? 19 : 25;
    return `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      ${shape(30, gold ? 'url(#mn-g-gold)' : 'url(#mn-g-silver)', gold ? '#8D6A10' : '#7A8794', 1.6)}
      ${bi ? shape(20, 'url(#mn-g-silver)', '#7A8794', 1.4) : `<circle cx="32" cy="32" r="24.5" fill="none" stroke="${gold ? '#A57C14' : '#8E99A6'}" stroke-width="1.2" stroke-dasharray="1.6 2.4"/>`}
      <text x="32" y="${32 + fs * 0.36}" text-anchor="middle" class="mn-ft" font-size="${fs}" fill="${dark}">${v}</text>
      <ellipse cx="22" cy="17" rx="11" ry="5" transform="rotate(-30 22 17)" fill="#fff" opacity=".38"/></svg>`;
  }
  function noteSVG(v) {
    const [a, d, l] = NOTE_COL[v];
    return `<svg viewBox="0 0 140 70" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="138" height="68" rx="7" fill="url(#mn-n-${v})" stroke="${d}" stroke-width="1.6"/>
      <rect x="6" y="6" width="128" height="58" rx="4" fill="none" stroke="${d}" stroke-width="1" opacity=".5"/>
      <circle cx="100" cy="36" r="25" fill="${l}" opacity=".4"/><circle cx="100" cy="36" r="17" fill="none" stroke="${d}" stroke-width=".8" opacity=".45"/>
      <circle cx="100" cy="36" r="9" fill="none" stroke="${d}" stroke-width=".8" opacity=".45"/>
      <ellipse cx="30" cy="35" rx="19" ry="26" fill="${l}" opacity=".75" stroke="${d}" stroke-width="1"/>
      <circle cx="30" cy="27" r="8" fill="${d}" opacity=".6"/><path d="M13 58 Q30 36 47 58 Z" fill="${d}" opacity=".6"/>
      <rect x="58" y="4" width="4" height="62" fill="${d}" opacity=".45"/>
      <text x="9" y="17" font-size="9" class="mn-ft" fill="${d}">${v}</text><text x="131" y="64" font-size="9" text-anchor="end" class="mn-ft" fill="${d}">${v}</text>
      <text x="130" y="${v === 500 || v === 200 || v === 100 ? 44 : 43}" text-anchor="end" font-size="${v >= 100 ? 25 : 28}" class="mn-ft" fill="${d}">₹${v}</text></svg>`;
  }
  const pieceSVG = (k, v) => (k === 'coin' ? coinSVG(v) : noteSVG(v));
  function defsSVG() {
    const grads = NOTES.map((v) => { const [a, , l] = NOTE_COL[v]; return `<linearGradient id="mn-n-${v}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${l}"/><stop offset=".45" stop-color="${a}"/><stop offset="1" stop-color="${a}"/></linearGradient>`; }).join('');
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
      <linearGradient id="mn-g-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE98A"/><stop offset=".55" stop-color="#F2B91E"/><stop offset="1" stop-color="#C58A0C"/></linearGradient>
      <linearGradient id="mn-g-silver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#C9D1DB"/><stop offset="1" stop-color="#97A3B1"/></linearGradient>${grads}</defs></svg>`;
  }
  // Goods drawn in 48 x 48; chosen by the English name, a coloured box otherwise.
  const BOXCOL = ['#FF6B57', '#1D4ED8', '#14B8A6', '#8B3DFF', '#FF7A1A', '#F5B90A'];
  function icon(it, i) {
    const n = (it.name.en || '').toLowerCase();
    const has = (re) => re.test(n);
    if (has(/pencil/)) return '<g transform="rotate(-40 24 24)"><rect x="19" y="3" width="10" height="34" rx="2" fill="#FFD23F"/><rect x="19" y="3" width="10" height="7" rx="2" fill="#FF6B57"/><path d="M19 37h10l-5 9z" fill="#F3D9B1"/><path d="M22 42h4l-2 4z" fill="#1E293B"/><rect x="22" y="10" width="2" height="27" fill="#fff" opacity=".45"/></g>';
    if (has(/\bpen\b|marker/)) return '<g transform="rotate(-40 24 24)"><rect x="19" y="3" width="10" height="32" rx="4" fill="#1D4ED8"/><rect x="19" y="3" width="10" height="8" rx="3" fill="#061233"/><path d="M20 35h8l-4 10z" fill="#CBD5E1"/><rect x="22" y="12" width="2" height="22" fill="#fff" opacity=".4"/></g>';
    if (has(/book|copy|diary|register/)) return '<rect x="9" y="6" width="31" height="37" rx="3" fill="#1D4ED8"/><rect x="12" y="6" width="28" height="37" rx="3" fill="#2563EB"/><rect x="17" y="12" width="17" height="9" rx="2" fill="#FFD23F"/><rect x="17" y="26" width="17" height="2.5" rx="1" fill="#fff" opacity=".7"/><rect x="17" y="32" width="12" height="2.5" rx="1" fill="#fff" opacity=".7"/>';
    if (has(/apple/)) return '<path d="M24 14c-6-5-16-1-15 10 1 9 7 18 12 17 2 0 2-1 3-1s1 1 3 1c5 1 11-8 12-17 1-11-9-15-15-10z" fill="#E11D2E"/><path d="M24 14c0-4 1-7 5-9" stroke="#6B4A2E" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M27 9c4-3 8-1 8 2-4 2-7 1-8-2z" fill="#22C55E"/><ellipse cx="16" cy="22" rx="3" ry="5" fill="#fff" opacity=".35"/>';
    if (has(/banana/)) return '<path d="M8 14c1 14 12 26 30 24 2 0 3-2 1-3-12-2-18-9-20-21 0-3-4-3-5-1z" fill="#FFD23F" stroke="#C99A1C" stroke-width="1.5"/><path d="M8 14c-1-3 1-6 4-5" stroke="#6B4A2E" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M14 18c3 9 9 15 20 18" stroke="#fff" stroke-width="2" fill="none" opacity=".5"/>';
    if (has(/ball/)) return '<circle cx="24" cy="24" r="18" fill="#fff" stroke="#1E293B" stroke-width="2"/><path d="M24 14l8 6-3 9h-10l-3-9z" fill="#1E293B"/><path d="M24 6v8M32 20l9-3M29 29l6 8M19 29l-6 8M16 20l-9-3" stroke="#1E293B" stroke-width="2" fill="none"/>';
    if (has(/milk|juice|bottle|water|lassi/)) return '<rect x="17" y="3" width="14" height="8" rx="2" fill="#1D4ED8"/><path d="M16 11h16l4 8v22a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V19z" fill="#F8FAFC" stroke="#94A3B8" stroke-width="1.6"/><rect x="14" y="24" width="20" height="12" rx="2" fill="#2563EB"/><circle cx="24" cy="30" r="3" fill="#fff"/>';
    if (has(/bread|roti|biscuit|bun|cake/)) return '<path d="M7 24c0-9 8-15 17-15s17 6 17 15c0 2-1 3-3 3v13c0 2-1 3-3 3H13c-2 0-3-1-3-3V27c-2 0-3-1-3-3z" fill="#E9A445" stroke="#B9770E" stroke-width="1.6"/><path d="M16 17c1 3 3 4 5 3M26 14c1 3 3 4 5 3" stroke="#fff" stroke-width="2" opacity=".5" fill="none" stroke-linecap="round"/>';
    if (has(/toffee|sweet|candy|chocolate|laddu/)) return '<circle cx="24" cy="24" r="10" fill="#FF6B57"/><path d="M14 24L5 16v16zM34 24l9-8v16z" fill="#FFD23F"/><path d="M19 20c2-3 6-3 8 0" stroke="#fff" stroke-width="2" fill="none" opacity=".6" stroke-linecap="round"/>';
    if (has(/bag|school/)) return '<path d="M17 14v-3a7 7 0 0 1 14 0v3" stroke="#6D28D9" stroke-width="3" fill="none"/><rect x="8" y="14" width="32" height="29" rx="7" fill="#8B3DFF"/><rect x="14" y="26" width="20" height="11" rx="3" fill="#6D28D9"/><rect x="21" y="30" width="6" height="3" rx="1" fill="#FFD23F"/>';
    if (has(/eraser|rubber/)) return '<g transform="rotate(-25 24 24)"><rect x="6" y="15" width="36" height="18" rx="4" fill="#fff" stroke="#94A3B8" stroke-width="1.5"/><rect x="6" y="15" width="16" height="18" rx="4" fill="#FF6B57"/></g>';
    if (has(/cap|hat/)) return '<path d="M8 30c0-10 7-17 16-17s16 7 16 17z" fill="#1D4ED8"/><path d="M8 30h32c3 0 5 2 5 4H5c0-2 1-4 3-4z" fill="#061233"/><circle cx="24" cy="12" r="2.5" fill="#FFD23F"/>';
    const c = BOXCOL[i % BOXCOL.length];
    return `<rect x="8" y="16" width="32" height="26" rx="3" fill="${c}"/><rect x="6" y="11" width="36" height="9" rx="3" fill="${c}" stroke="#fff" stroke-opacity=".35"/><rect x="21" y="11" width="6" height="31" fill="#FFD23F"/><path d="M24 11c-6-8-12-2-6 0zM24 11c6-8 12-2 6 0z" fill="#FFD23F"/>`;
  }
  const awning = () => { let s = ''; for (let i = 0; i < 12; i++) s += `<rect x="${i * 30}" y="0" width="30" height="26" fill="${i % 2 ? '#FFFFFF' : '#FF6B57'}"/><path d="M${i * 30} 26a15 13 0 0 0 30 0z" fill="${i % 2 ? '#FFFFFF' : '#FF6B57'}"/>`; return `<svg class="mn-awn" viewBox="0 0 360 40" preserveAspectRatio="xMidYMin slice" aria-hidden="true" focusable="false">${s}<rect x="0" y="0" width="360" height="3" fill="#000" opacity=".12"/></svg>`; };
  const piggy = () => '<svg class="mn-pig" viewBox="0 0 90 70" aria-hidden="true" focusable="false"><g class="mn-drop"><circle cx="44" cy="8" r="8" fill="url(#mn-g-gold)" stroke="#8D6A10"/><text x="44" y="12" text-anchor="middle" font-size="10" class="mn-ft" fill="#5E4408">₹</text></g><rect x="22" y="52" width="9" height="14" rx="3" fill="#E5708F"/><rect x="52" y="52" width="9" height="14" rx="3" fill="#E5708F"/><ellipse cx="42" cy="40" rx="30" ry="22" fill="#FF9FB5"/><path d="M26 22l-2-12 12 7z" fill="#F57C9C"/><ellipse cx="68" cy="42" rx="10" ry="8" fill="#FF7C9C"/><circle cx="65" cy="42" r="1.8" fill="#8A2342"/><circle cx="71" cy="42" r="1.8" fill="#8A2342"/><circle cx="58" cy="32" r="2.6" fill="#1E293B"/><rect x="34" y="20" width="16" height="3.5" rx="1.7" fill="#8A2342"/><path d="M12 36q-9-2-7 6" stroke="#FF7C9C" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="30" cy="34" rx="8" ry="5" fill="#fff" opacity=".25"/></svg>';

  // ---------------------------------------------------------------- styles
  const CSS = `
.mn { container-type: inline-size; max-width: 1040px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; color: var(--ink); font-family: var(--font-body); }
.mn *, .mn *::before, .mn *::after { box-sizing: border-box; }
.mn-ft { font-family: var(--font-display); font-weight: 800; }
.mn-head { position: relative; border-radius: 20px; overflow: hidden; color: #fff; background: linear-gradient(135deg, #15803D, #0F766E); box-shadow: 0 10px 24px -14px rgba(6,18,51,.6); }
.mn-head.bank { background: linear-gradient(135deg, #1D4ED8, #4400F0); }
.mn-awn { display: block; width: 100%; height: 30px; }
.mn-hrow { display: flex; align-items: center; gap: 12px; padding: 10px 16px 14px; }
.mn-head.bank .mn-hrow { padding-top: 14px; }
.mn-hico { flex: 0 0 auto; width: 74px; height: 62px; }
.mn-pig { width: 78px; height: 62px; }
.mn-drop { animation: mn-drop 2.6s ease-in infinite; transform-origin: 44px 8px; }
@keyframes mn-drop { 0% { transform: translateY(-6px); opacity: 0; } 15% { opacity: 1; } 70% { transform: translateY(16px); opacity: 1; } 100% { transform: translateY(20px); opacity: 0; } }
.mn-htxt h3 { margin: 0; font: 800 1.35rem/1.15 var(--font-display); }
.mn-htxt p { margin: 4px 0 0; font-size: 1rem; line-height: 1.35; opacity: .96; }
.mn-live { border-radius: 14px; padding: 10px 14px; min-height: 46px; display: flex; align-items: center; background: var(--surface); border: 1.5px solid var(--line); font-size: 1rem; line-height: 1.4; font-weight: 600; }
.mn-live.good { background: var(--good-t); border-color: var(--good); }
.mn-live.bad { background: var(--bad-t); border-color: var(--bad); }
.mn-live.info { background: var(--sun-t); border-color: var(--sun); }
.mn-body { display: grid; gap: 12px; min-width: 0; }
.mn-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
@container (min-width: 760px) { .mn-body.two { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .mn-body.two.wide-l { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); } }
.mn-card { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 12px 14px; box-shadow: 0 8px 20px -14px rgba(6,18,51,.35); min-width: 0; }
.mn-card h4 { margin: 0 0 8px; font: 800 1rem var(--font-display); color: var(--ink-2); letter-spacing: .01em; }
.mn-items { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; }
.mn-item { position: relative; min-height: 112px; border: 2px solid var(--line); border-radius: 16px; background: var(--sunk); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 8px 4px; cursor: pointer; text-align: center; transition: transform .15s, box-shadow .15s, border-color .15s; }
.mn-item:hover { transform: translateY(-2px); }
.mn-item.on { border-color: #15803D; background: var(--good-t); box-shadow: 0 0 0 3px rgba(21,128,61,.3); }
.mn-ico svg { width: 48px; height: 48px; display: block; }
.mn-iname { font-weight: 700; font-size: .88rem; line-height: 1.15; color: var(--ink); }
.mn-tag { background: #FFD23F; color: #1E293B; border-radius: 999px; padding: 1px 10px; font: 800 .95rem var(--font-display); box-shadow: 0 2px 0 #C99A1C; }
.mn-badge { position: absolute; top: -8px; right: -6px; min-width: 26px; height: 26px; border-radius: 13px; background: #8B3DFF; color: #fff; font: 800 .85rem/26px var(--font-display); padding: 0 6px; }
.mn-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.mn-chip { min-height: 48px; border-radius: 999px; border: 2px solid var(--line); background: var(--sunk); display: inline-flex; align-items: center; gap: 6px; padding: 2px 14px 2px 6px; cursor: pointer; font-weight: 700; color: var(--ink); }
.mn-chip svg { width: 36px; height: 36px; }
.mn-chip[aria-pressed="true"] { border-color: #15803D; background: var(--good-t); box-shadow: 0 0 0 3px rgba(21,128,61,.25); }
.mn-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 3px 0; flex-wrap: wrap; }
.mn-row span { color: var(--ink-2); font-weight: 600; }
.mn-big { font: 800 1.65rem/1.1 var(--font-display); color: var(--ink); }
.mn-big.bump { animation: mn-bump .35s; }
@keyframes mn-bump { 40% { transform: scale(1.18); } }
.mn-tray { min-height: 96px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 10px; margin: 8px 0; border-radius: 16px; border: 2.5px dashed #C9A56A; background: linear-gradient(180deg, #FBEFD9, #F2DDB6); color: #5C4318; }
.mn-tray .mn-hint { width: 100%; text-align: center; font-weight: 600; opacity: .8; }
.mn-pc { border: 0; background: transparent; padding: 2px; cursor: pointer; border-radius: 10px; min-width: 44px; min-height: 44px; filter: drop-shadow(0 3px 2px rgba(60,40,10,.35)); }
.mn-pc.coin svg { width: 46px; height: 46px; display: block; }
.mn-pc.note svg { width: 84px; height: 42px; display: block; }
.mn-pc:hover { transform: translateY(-2px) rotate(-2deg); }
.mn-pc.counted { opacity: .55; filter: grayscale(.25) drop-shadow(0 1px 1px rgba(60,40,10,.3)); outline: 3px solid #15803D; outline-offset: 1px; }
.mn-pc[disabled] { cursor: default; }
.mn-pop { animation: mn-pop .32s cubic-bezier(.3,1.6,.5,1); }
@keyframes mn-pop { from { transform: scale(.3) translateY(26px); opacity: 0; } to { transform: none; opacity: 1; } }
.mn-coins { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; margin-bottom: 8px; }
.mn-notes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.mn-m { border: 2px solid var(--line); border-radius: 14px; background: var(--sunk); min-height: 52px; padding: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform .12s, box-shadow .12s; }
.mn-m:hover { transform: translateY(-2px); box-shadow: 0 6px 10px -6px rgba(6,18,51,.5); }
.mn-m:active { transform: scale(.94); }
.mn-m.coin svg { width: 100%; max-width: 54px; height: auto; display: block; }
.mn-m.note svg { width: 100%; height: auto; display: block; }
.mn-m[disabled] { opacity: .5; cursor: default; }
.mn-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; }
.mn-btn { min-height: 48px; padding: 0 22px; border: 0; border-radius: 14px; background: #15803D; color: #fff; font: 800 1.05rem var(--font-body); cursor: pointer; box-shadow: 0 4px 0 #0B5A28; transition: transform .1s, box-shadow .1s; }
.mn-btn:active { transform: translateY(3px); box-shadow: 0 1px 0 #0B5A28; }
.mn-btn.ghost { background: var(--sunk); color: var(--ink); box-shadow: 0 3px 0 var(--line); border: 1.5px solid var(--line); }
.mn-btn[disabled] { opacity: .5; cursor: default; }
.mn-in { min-height: 48px; width: 150px; max-width: 100%; border: 2.5px solid var(--line); border-radius: 12px; padding: 0 12px; font: 800 1.25rem var(--font-display); background: var(--surface); color: var(--ink); }
.mn-in:focus-visible, .mn .mn-btn:focus-visible, .mn-item:focus-visible, .mn-chip:focus-visible, .mn-m:focus-visible, .mn-pc:focus-visible, .mn-step:focus-visible { outline: 3px solid #8B3DFF; outline-offset: 2px; }
.mn-ans { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 8px; }
.mn-ans label { font-weight: 700; flex: 1 1 100%; }
.mn-unit { font: 800 1.2rem var(--font-display); }
.mn-sl { display: block; margin: 4px 0 10px; }
.mn-sl-t { display: flex; justify-content: space-between; font-weight: 700; }
.mn-sl output { font: 800 1.15rem var(--font-display); color: #15803D; }
:root[data-theme="dark"] .mn-sl output { color: var(--good); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .mn-sl output { color: var(--good); } }
.mn-sl input[type=range] { width: 100%; height: 44px; accent-color: #15803D; margin: 0; }
.mn-work { background: var(--sunk); border-radius: 14px; padding: 10px 14px; margin: 8px 0; font-weight: 600; line-height: 1.7; border-left: 5px solid #8B3DFF; }
.mn-work b { font-family: var(--font-display); font-size: 1.1rem; }
.mn-q { display: inline-block; min-width: 1.6em; text-align: center; background: #FFD23F; color: #1E293B; border-radius: 8px; padding: 0 6px; font: 800 1.1rem var(--font-display); animation: mn-pulse 1.6s infinite; }
@keyframes mn-pulse { 50% { transform: scale(1.12); } }
.mn-pill { display: inline-block; border-radius: 999px; padding: 4px 16px; font: 800 1.15rem var(--font-display); color: #fff; }
.mn-pill.gain { background: #15803D; } .mn-pill.lose { background: #C2362B; } .mn-pill.even { background: #475569; }
.mn-receipt { background: #FFFEF6; color: #2B2A24; border-radius: 6px; padding: 14px 16px 18px; box-shadow: 0 8px 18px -10px rgba(0,0,0,.45); background-image: radial-gradient(circle at 6px 100%, transparent 6px, #FFFEF6 6.5px); font-variant-numeric: tabular-nums; border-bottom: 6px dotted #D9D3B8; }
.mn-receipt h4 { color: #5A5640; text-align: center; margin: 0 0 6px; }
.mn-rl { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; border-bottom: 1px dashed #D9D3B8; font-weight: 600; }
.mn-rl.tot { border: 0; border-top: 2px solid #2B2A24; margin-top: 6px; padding-top: 8px; font: 800 1.2rem var(--font-display); }
.mn-bill-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--line); }
.mn-bill-row:last-child { border-bottom: 0; }
.mn-bill-row .nm { flex: 1; font-weight: 700; line-height: 1.2; min-width: 0; }
.mn-bill-row .nm small { display: block; color: var(--ink-2); font-weight: 600; }
.mn-bill-row svg { width: 38px; height: 38px; flex: 0 0 auto; }
.mn-step { width: 44px; height: 44px; border-radius: 12px; border: 2px solid var(--line); background: var(--sunk); font: 800 1.4rem var(--font-display); color: var(--ink); cursor: pointer; }
.mn-step.plus { background: #15803D; border-color: #15803D; color: #fff; }
.mn-qty { min-width: 28px; text-align: center; font: 800 1.2rem var(--font-display); }
.mn-cust { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.mn-cust svg { filter: drop-shadow(0 2px 2px rgba(0,0,0,.3)); }
.mn-cust .note svg { width: 84px; height: 42px; } .mn-cust .coin svg { width: 40px; height: 40px; }
.mn-bar { position: relative; height: 38px; border-radius: 12px; overflow: hidden; background: var(--sunk); border: 1.5px solid var(--line); display: flex; }
.mn-bar > i { display: flex; align-items: center; justify-content: center; font: 800 .88rem var(--font-display); color: #fff; white-space: nowrap; overflow: hidden; transition: width .4s; font-style: normal; }
.mn-meter { height: 30px; border-radius: 15px; background: var(--sunk); border: 1.5px solid var(--line); overflow: hidden; }
.mn-meter > i { display: block; height: 100%; border-radius: 15px; background: linear-gradient(90deg, #22C55E, #F5B90A); transition: width .35s; }
.mn-meter.over > i { background: linear-gradient(90deg, #FF6B57, #C2362B); }
.mn-shake { animation: mn-shake .4s; }
@keyframes mn-shake { 20% { transform: translateX(-7px); } 40% { transform: translateX(7px); } 60% { transform: translateX(-5px); } 80% { transform: translateX(4px); } }
.mn-chart svg { width: 100%; height: auto; display: block; }
.mn-chart text { font-family: var(--font-body); fill: var(--ink-2); font-weight: 700; }
.mn-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 4px; font-size: .88rem; font-weight: 600; }
.mn-legend i { display: inline-block; width: 12px; height: 12px; border-radius: 4px; margin-right: 5px; vertical-align: -1px; }
.mn-tb { width: 100%; border-collapse: collapse; font-size: .9rem; font-variant-numeric: tabular-nums; }
.mn-tb th, .mn-tb td { text-align: right; padding: 4px 6px; border-bottom: 1px solid var(--line); }
.mn-tb th:first-child, .mn-tb td:first-child { text-align: left; }
.mn-tb th { color: var(--ink-2); font-weight: 700; }
.mn-tags { display: flex; flex-wrap: wrap; gap: 10px; margin: 6px 0; }
.mn-pt { position: relative; background: #FFF6D2; color: #1E293B; border: 2px solid #C99A1C; border-radius: 6px 14px 14px 6px; padding: 6px 14px 6px 24px; font-weight: 700; min-width: 120px; }
.mn-pt::before { content: ""; position: absolute; left: 8px; top: 50%; width: 9px; height: 9px; margin-top: -4.5px; border-radius: 50%; background: var(--surface); border: 2px solid #C99A1C; }
.mn-pt b { display: block; font: 800 1.35rem var(--font-display); }
.mn-pt small { font-weight: 700; }
.mn-strike { text-decoration: line-through; text-decoration-thickness: 3px; text-decoration-color: #C2362B; }
.mn-save { color: #15803D; font-weight: 800; }
:root[data-theme="dark"] .mn-save { color: var(--good); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .mn-save { color: var(--good); } }
.mn-foot { font-size: .8rem; color: var(--ink-2); text-align: center; margin: 2px 0 0; }
.mn-done { text-align: center; padding: 6px 0; }
.mn-done b { font: 800 1.3rem var(--font-display); }
@media (prefers-reduced-motion: reduce) { .mn *, .mn *::before, .mn *::after { animation: none !important; transition: none !important; } }
`;

  // ---------------------------------------------------------------- mount
  function mount(root, config, api) {
    const C = norm(config);
    const mode = C.mode, items = C.items;
    const t = (x) => esc(api.t(x));
    const raw = (x) => api.t(x);
    const reduced = L.reducedMotion();
    const isInt2 = INTEREST(mode);
    const S = { sel: [], tray: [], counted: [], qty: [], sp: 0, mp: 0, rate: 0, years: 0, principal: 0, ans: '', solved: false, shown: false, tries: 0, done: false, lastAdd: -1, over: false, msg: null, grow: 1, bump: false };
    const stops = [];
    let pileList = [];

    // ---- per-mode starting state
    function resetState() {
      S.tray = []; S.counted = []; S.ans = ''; S.solved = false; S.shown = false; S.tries = 0; S.done = false; S.lastAdd = -1;
      if (mode === 'count') pileList = pile(C.budget);
      if (mode === 'pay') S.sel = C.pick.slice();
      if (mode === 'change') S.sel = [C.pick.length ? C.pick[0] : 0];
      if (mode === 'bill') S.qty = items.map((x, i) => (x.qty != null ? x.qty : [2, 1, 3, 2, 1, 2][i % 6]));
      if (mode === 'profit-loss' || mode === 'discount') {
        S.sel = [C.pick.length ? C.pick[0] : 0];
        S.rate = C.rate; S.mp = items[S.sel[0]].price;
        S.sp = clamp(Math.round((items[S.sel[0]].price * (100 + C.rate)) / 100), plRange(items[S.sel[0]].price).min, plRange(items[S.sel[0]].price).max);
      }
      if (isInt2) { S.rate = C.rate; S.years = C.years; S.principal = C.budget; }
      if (mode === 'budget') { S.sel = C.pick.slice(); S.over = spent() > C.budget; }
      S.msg = hint();
    }
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const plRange = (cp) => ({ min: Math.max(1, Math.round(cp * 0.4)), max: Math.max(Math.ceil(cp * 1.8), Math.max(1, Math.round(cp * 0.4)) + 1) });
    const mpRange = (p) => ({ min: Math.max(1, Math.round(p * 0.5)), max: Math.round(p * 2) + 1 });
    const pStep = (P) => { const s = P >= 100000 ? 1000 : P >= 10000 ? 500 : P >= 1000 ? 100 : P >= 200 ? 10 : 1; return P % s === 0 ? s : 1; };
    const pRange = (P) => { const s = pStep(P); return { step: s, min: Math.max(s, Math.floor(P / 5 / s) * s), max: Math.ceil((P * 2) / s) * s }; };
    const itemSum = (idx) => idx.reduce((a, i) => a + items[i].price, 0);
    const trayTotal = () => S.tray.reduce((a, p) => a + p.v, 0);
    const spent = () => itemSum(S.sel);
    const paidFor = () => (C.budget != null ? C.budget : autoPaid(items[S.sel[0]].price));

    function hint() {
      switch (mode) {
        case 'count': return { k: 'info', x: T2('Tap each note and coin to count it. The counted total shows above.', 'हर नोट और सिक्के पर दबाओ। गिना हुआ कुल ऊपर दिखेगा।') };
        case 'pay': return { k: 'info', x: T2('Tap what you want to buy, then pay with coins and notes.', 'जो ख़रीदना है उस पर दबाओ, फिर सिक्कों और नोटों से दाम चुकाओ।') };
        case 'change': return { k: 'info', x: T2('Change = money given − price. Tap coins and notes to give it back.', 'बाक़ी पैसे = दिए हुए पैसे − दाम। सिक्के और नोट दबाकर लौटाओ।') };
        case 'bill': return { k: 'info', x: T2('Add or remove items. Each line is quantity × price. Then find the total.', 'चीज़ें जोड़ो या घटाओ। हर पंक्ति है मात्रा × दाम। फिर कुल निकालो।') };
        case 'profit-loss': return { k: 'info', x: T2('Slide the selling price. If you sell for more than you paid, that is profit.', 'बेचने का दाम खिसकाओ। जितने में ख़रीदा उससे ज़्यादा में बेचो तो लाभ होता है।') };
        case 'discount': return { k: 'info', x: T2('Slide the discount and watch the price you pay change.', 'छूट खिसकाओ और देखो चुकाया जाने वाला दाम कैसे बदलता है।') };
        case 'simple-interest': return { k: 'info', x: T2('Slide the rate, the years and the money saved. Simple interest is the same every year.', 'दर, साल और जमा रक़म खिसकाओ। साधारण ब्याज हर साल एक जैसा होता है।') };
        case 'compound-interest': return { k: 'info', x: T2('Slide the rate and the years. Each year the interest is added, then earns interest too.', 'दर और साल खिसकाओ। हर साल ब्याज मूलधन में जुड़ता है और फिर उस पर भी ब्याज मिलता है।') };
        default: return { k: 'info', x: T2(`You have ${R(C.budget)}. Tap things to add them. Stay within your budget.`, `तुम्हारे पास ${R(C.budget)} हैं। चीज़ें जोड़ने के लिए दबाओ। बजट के अंदर रहो।`) };
      }
    }
    const say = (k, x) => { S.msg = { k, x }; paintLive(); };

    // ---- shared builders
    const pcs = (arr, cls) => arr.map((d) => `<span class="${d.k}">${pieceSVG(d.k, d.v)}</span>`).join('');
    const itemCard = (i, pressed, badge) => `<button type="button" class="mn-item${pressed ? ' on' : ''}" data-act="item" data-i="${i}" data-key="item:${i}" aria-pressed="${pressed}"><span class="mn-ico"><svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">${icon(items[i], i)}</svg></span><span class="mn-iname">${t(items[i].name)}</span><span class="mn-tag">${R(items[i].price)}</span>${badge ? `<span class="mn-badge" aria-label="${badge}">${badge}</span>` : ''}</button>`;
    const chipsHtml = () => `<div class="mn-chips" role="group" aria-label="${t(T2('Choose one thing', 'एक चीज़ चुनो'))}">${items.map((x, i) => `<button type="button" class="mn-chip" data-act="pick1" data-i="${i}" data-key="item:${i}" aria-pressed="${S.sel[0] === i}"><svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">${icon(x, i)}</svg><span>${t(x.name)} ${R(x.price)}</span></button>`).join('')}</div>`;
    const walletHtml = () => `<div class="mn-card"><h4>${t(T2('Your wallet: tap to add', 'तुम्हारा बटुआ: जोड़ने के लिए दबाओ'))}</h4>
      <div class="mn-coins">${COINS.map((v) => `<button type="button" class="mn-m coin" data-act="add" data-k="coin" data-v="${v}" data-key="coin:${v}" aria-label="${t(pName('coin', v))}"${S.done ? ' disabled' : ''}>${coinSVG(v)}</button>`).join('')}</div>
      <div class="mn-notes">${NOTES.map((v) => `<button type="button" class="mn-m note" data-act="add" data-k="note" data-v="${v}" data-key="note:${v}" aria-label="${t(pName('note', v))}"${S.done ? ' disabled' : ''}>${noteSVG(v)}</button>`).join('')}</div>
      <p class="mn-foot">${t(T2('Pictures are play money for learning.', 'ये तस्वीरें सीखने के लिए खेल के पैसे हैं।'))}</p></div>`;
    const trayHtml = (emptyText) => `<div class="mn-tray" role="group" aria-label="${t(T2('Money on the counter', 'काउंटर पर रखे पैसे'))}">${S.tray.length ? S.tray.map((p, j) => `<button type="button" class="mn-pc ${p.k}${j === S.lastAdd && !reduced ? ' mn-pop' : ''}" data-act="rm" data-j="${j}" data-fid="rm${j}"${S.done ? ' disabled' : ''} aria-label="${esc(api.t(T2('Take back ', 'वापस उठाओ: ')) + api.t(pName(p.k, p.v)))}">${pieceSVG(p.k, p.v)}</button>`).join('') : `<span class="mn-hint">${t(emptyText)}</span>`}</div>`;
    const ansHtml = (label, unit, cls) => `<div class="mn-ans"><label for="mn-ans">${t(label)}</label><input id="mn-ans" class="mn-in" data-key="answer" inputmode="decimal" autocomplete="off" value="${esc(S.ans)}"${S.solved ? ' readonly' : ''}>${unit ? `<span class="mn-unit">${unit}</span>` : ''}<button type="button" class="mn-btn" data-act="check" data-allow="answer"${S.solved ? ' disabled' : ''}>${t(T2('Check', 'जाँचो'))}</button>${S.tries >= 2 && !S.shown && !S.solved ? `<button type="button" class="mn-btn ghost" data-act="show">${t(T2('Show me', 'मुझे दिखाओ'))}</button>` : ''}</div>`;
    const sliderHtml = (name, label, min, max, step, val, f) => `<label class="mn-sl"><span class="mn-sl-t"><span>${t(label)}</span><output data-out="${name}">${esc(f(val))}</output></span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-act="slide" data-s="${name}" data-key="slider:${name}" aria-label="${esc(raw(label))}"></label>`;
    const Q = '<b class="mn-q" aria-label="?">?</b>';
    const val = (revealed, text) => (revealed ? `<b>${text}</b>` : Q);

    // ---- bodies
    function bodyCount() {
      const cs = S.counted.reduce((a, i) => a + pileList[i].v, 0);
      return `<div class="mn-body"><div class="mn-card"><h4>${t(T2('A pile of money', 'पैसों का ढेर'))}</h4>
        <div class="mn-row"><span>${t(T2('Counted so far', 'अब तक गिना'))}</span><b class="mn-big">${R(cs)}</b></div>
        <div class="mn-tray" role="group" aria-label="${t(T2('Money to count', 'गिनने के पैसे'))}">${pileList.map((d, i) => `<button type="button" class="mn-pc ${d.k}${S.counted.includes(i) ? ' counted' : ''}" data-act="cpiece" data-i="${i}" data-fid="p${i}" data-key="${d.k}:${d.v}" aria-pressed="${S.counted.includes(i)}" aria-label="${t(pName(d.k, d.v))}">${pieceSVG(d.k, d.v)}</button>`).join('')}</div>
        ${ansHtml(T2('How much money is this in all?', 'यह कुल कितने पैसे हैं?'), '₹')}
        <p class="mn-foot">${t(T2('Pictures are play money for learning.', 'ये तस्वीरें सीखने के लिए खेल के पैसे हैं।'))}</p></div></div>`;
    }
    function bodyPay() {
      const tot = spent(), paid = trayTotal();
      const basket = S.sel.length ? S.sel.map((i) => `${t(items[i].name)} ${R(items[i].price)}`).join(' + ') : t(T2('Nothing picked yet', 'अभी कुछ नहीं चुना'));
      return `<div class="mn-body two"><div class="mn-card"><h4>${t(T2('On the shelf: tap to buy', 'दुकान की अलमारी: ख़रीदने के लिए दबाओ'))}</h4>
        <div class="mn-items">${items.map((_, i) => itemCard(i, S.sel.includes(i))).join('')}</div></div>
        <div class="mn-col"><div class="mn-card">
          <div class="mn-row"><span>${t(T2('You are buying', 'तुम ख़रीद रहे हो'))}</span><span style="text-align:right">${basket}</span></div>
          <div class="mn-row"><span>${t(T2('Price to pay', 'चुकाने का दाम'))}</span><b class="mn-big${S.bump ? ' bump' : ''}">${R(tot)}</b></div>
          <div class="mn-row"><span>${t(T2('You are paying', 'तुम दे रहे हो'))}</span><b class="mn-big${S.bump ? ' bump' : ''}">${R(paid)}</b></div>
          ${trayHtml(T2('Tap coins and notes to put them on the counter. Tap one here to take it back.', 'सिक्के और नोट दबाकर काउंटर पर रखो। वापस लेने के लिए यहाँ उन पर दबाओ।'))}
          <div class="mn-actions">${S.done ? `<span class="mn-done"><b>${t(T2('Thank you! Come again.', 'धन्यवाद! फिर आना।'))}</b></span><button type="button" class="mn-btn ghost" data-act="again">${t(T2('Buy something else', 'कुछ और ख़रीदो'))}</button>` : `<button type="button" class="mn-btn" data-act="pay" data-key="pay">${t(T2('Pay', 'भुगतान करो'))}</button>`}</div></div>
          ${walletHtml()}</div></div>`;
    }
    function bodyChange() {
      const price = items[S.sel[0]].price, paid = paidFor(), need = paid - price, given = trayTotal();
      const steps = S.done ? (() => { let s = price; return greedy(need).map((d) => d.v).sort((a, b) => a - b).map((v) => { s += v; return { v, to: s }; }); })() : [];
      return `<div class="mn-body two"><div class="mn-col"><div class="mn-card"><h4>${t(T2('What is the customer buying?', 'ग्राहक क्या ख़रीद रहा है?'))}</h4>${chipsHtml()}</div>
        <div class="mn-card"><div class="mn-row"><span>${t(T2('Price', 'दाम'))}</span><b class="mn-big">${R(price)}</b></div>
          <h4 style="margin-top:6px">${t(T2('The customer gives you', 'ग्राहक तुम्हें देता है'))}</h4><div class="mn-cust" role="img" aria-label="${esc(api.t(T2('The customer gives ', 'ग्राहक ने दिए ')) + R(paid))}">${greedy(paid).map((d) => `<span class="${d.k}">${pieceSVG(d.k, d.v)}</span>`).join('')}</div>
          <div class="mn-row"><span>${t(T2('Money given', 'दिए हुए पैसे'))}</span><b>${R(paid)}</b></div>
          <div class="mn-work">${t(T2('Change = money given − price', 'बाक़ी = दिए हुए पैसे − दाम'))}<br>${R(paid)} − ${R(price)} = ${val(S.done, R(need))}
          ${S.done ? `<br><span>${t(T2('Count up from the price:', 'दाम से गिनते हुए चलो:'))}</span><br>${R(price)} ${steps.map((s) => `→ +${s.v} → ${R(s.to)}`).join(' ')}` : ''}</div></div></div>
        <div class="mn-col"><div class="mn-card"><div class="mn-row"><span>${t(T2('Change you give back', 'तुम्हारे लौटाए बाक़ी पैसे'))}</span><b class="mn-big${S.bump ? ' bump' : ''}">${R(given)}</b></div>
          ${trayHtml(T2('Tap coins and notes below to give the change.', 'बाक़ी पैसे देने के लिए नीचे के सिक्के और नोट दबाओ।'))}
          <div class="mn-actions">${S.done ? `<button type="button" class="mn-btn ghost" data-act="again">${t(T2('Next customer', 'अगला ग्राहक'))}</button>` : `<button type="button" class="mn-btn" data-act="gchange" data-key="answer">${t(T2('Give the change', 'बाक़ी पैसे दो'))}</button>`}</div></div>
          ${walletHtml()}</div></div>`;
    }
    const billTotal = () => items.reduce((a, x, i) => a + x.price * S.qty[i], 0);
    function bodyBill() {
      const tot = billTotal();
      const rows = items.map((x, i) => S.qty[i] > 0 ? `<div class="mn-rl"><span>${t(x.name)} ${S.qty[i]} × ${R(x.price)}</span><span>${R(x.price * S.qty[i])}</span></div>` : '').join('');
      return `<div class="mn-body two"><div class="mn-card"><h4>${t(T2('What the customer buys', 'ग्राहक क्या ख़रीदता है'))}</h4>
        ${items.map((x, i) => `<div class="mn-bill-row"><svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">${icon(x, i)}</svg><div class="nm">${t(x.name)}<small>${R(x.price)} ${t(T2('each', 'प्रति'))}</small></div>
          <button type="button" class="mn-step" data-act="dec" data-i="${i}" aria-label="${esc(api.t(T2('One less ', 'एक कम ')) + raw(x.name))}"${S.qty[i] === 0 ? ' disabled' : ''}>−</button><span class="mn-qty" aria-live="off">${S.qty[i]}</span>
          <button type="button" class="mn-step plus" data-act="item" data-i="${i}" data-key="item:${i}" aria-label="${esc(api.t(T2('One more ', 'एक और ')) + raw(x.name))}">+</button></div>`).join('')}</div>
        <div class="mn-col"><div class="mn-receipt"><h4>${t(T2('BILL', 'बिल'))}</h4>${rows || `<div class="mn-rl"><span>${t(T2('Nothing yet', 'अभी कुछ नहीं'))}</span><span>—</span></div>`}
          <div class="mn-rl tot"><span>${t(T2('Total', 'कुल'))}</span><span>${S.solved ? R(tot) : Q}</span></div></div>
          <div class="mn-card">${ansHtml(T2('What is the total bill?', 'कुल बिल कितना है?'), '₹')}</div></div></div>`;
    }
    function plOut() {
      const cp = items[S.sel[0]].price, sp = S.sp, d = sp - cp, pc = Math.abs(d) / cp * 100;
      const gain = d > 0, even = d === 0;
      const rg = plRange(cp), W = 320, x = (v) => 14 + ((v - rg.min) / (rg.max - rg.min)) * (W - 28);
      const xc = x(cp), xs = x(sp);
      const bar = `<svg viewBox="0 0 ${W} 74" role="img" aria-label="${esc(api.t(T2('Cost price and selling price on a line', 'क्रय मूल्य और विक्रय मूल्य एक रेखा पर')))}"><rect x="14" y="30" width="${W - 28}" height="10" rx="5" fill="var(--line)"/>
        ${even ? '' : `<rect x="${Math.min(xc, xs)}" y="30" width="${Math.abs(xs - xc)}" height="10" fill="${gain ? '#22C55E' : '#FF6B57'}"/>`}
        <line x1="${xc}" y1="20" x2="${xc}" y2="50" stroke="#1D4ED8" stroke-width="3"/><text x="${xc}" y="14" text-anchor="middle" font-size="12">${esc(api.t(T2('Cost', 'क्रय')))} ${R(cp)}</text>
        <circle cx="${xs}" cy="35" r="11" fill="${even ? '#475569' : gain ? '#15803D' : '#C2362B'}" stroke="#fff" stroke-width="3"/><text x="${xs}" y="66" text-anchor="middle" font-size="12">${esc(api.t(T2('Sell', 'विक्रय')))} ${R(sp)}</text></svg>`;
      const pill = even ? `<span class="mn-pill even">${t(T2('No profit, no loss', 'न लाभ, न हानि'))}</span>` : `<span class="mn-pill ${gain ? 'gain' : 'lose'}">${gain ? t(T2('Profit', 'लाभ')) : t(T2('Loss', 'हानि'))} ${R(Math.abs(d))}</span>`;
      const word = gain ? T2('Profit', 'लाभ') : T2('Loss', 'हानि');
      const pct = num(pc);
      return `<div class="mn-tags"><div class="mn-pt"><small>${t(T2('Cost price (bought at)', 'क्रय मूल्य (ख़रीदा)'))}</small><b>${R(cp)}</b></div><div class="mn-pt"><small>${t(T2('Selling price (sold at)', 'विक्रय मूल्य (बेचा)'))}</small><b>${R(sp)}</b></div></div>
        <div class="mn-chart">${bar}</div><div style="margin:4px 0">${pill}</div>
        <div class="mn-work">${even ? t(T2('Selling price = cost price, so there is no profit and no loss.', 'विक्रय मूल्य = क्रय मूल्य, इसलिए न लाभ है न हानि।')) : `${t(gain ? T2('Profit = selling price − cost price', 'लाभ = विक्रय मूल्य − क्रय मूल्य') : T2('Loss = cost price − selling price', 'हानि = क्रय मूल्य − विक्रय मूल्य'))}<br>${gain ? `${R(sp)} − ${R(cp)}` : `${R(cp)} − ${R(sp)}`} = <b>${R(Math.abs(d))}</b><br>${t(T2(`${word.en} % = ${word.en.toLowerCase()} ÷ cost price × 100`, `${word.hi} % = ${word.hi} ÷ क्रय मूल्य × 100`))}<br>${R(Math.abs(d))} ÷ ${R(cp)} × 100 = ${val(S.shown || S.solved, pct + '%')}`}</div>
        ${even ? '' : ansHtml(gain ? T2('What is the profit percent? (1 decimal place if needed)', 'लाभ प्रतिशत कितना है? (ज़रूरत हो तो एक दशमलव)') : T2('What is the loss percent? (1 decimal place if needed)', 'हानि प्रतिशत कितना है? (ज़रूरत हो तो एक दशमलव)'), '%')}`;
    }
    const discSale = () => { const mp = S.mp * 100, off = pctOf(mp, S.rate * 2); return { mp, off, sale: mp - off }; };
    function discOut() {
      const { mp, off, sale } = discSale(), shown = S.shown || S.solved;
      const r = S.rate;
      return `<div class="mn-tags"><div class="mn-pt"><small>${t(T2('Marked price', 'अंकित मूल्य'))}</small><b class="${r > 0 ? 'mn-strike' : ''}">${rs(mp)}</b></div><div class="mn-pt"><small>${t(T2('Discount', 'छूट'))}</small><b>${num(r)}%</b></div></div>
        <div class="mn-bar" role="img" aria-label="${esc(api.t(T2(`You pay ${num(100 - r)} percent, the discount is ${num(r)} percent`, `तुम ${num(100 - r)} प्रतिशत देते हो, छूट ${num(r)} प्रतिशत है`)))}"><i style="width:${100 - r}%;background:#15803D">${100 - r >= 18 ? esc(api.t(T2('You pay', 'तुम देते हो'))) + ' ' + num(100 - r) + '%' : ''}</i><i style="width:${r}%;background:#FF7A1A;color:#1E293B">${r >= 12 ? num(r) + '%' : ''}</i></div>
        <div class="mn-work">${t(T2(`Discount = ${num(r)}% of ${rs(mp)}`, `छूट = ${rs(mp)} का ${num(r)}%`))} = <b>${rs(off)}</b><br>${t(T2('Price you pay = marked price − discount', 'चुकाया दाम = अंकित मूल्य − छूट'))}<br>${rs(mp)} − ${rs(off)} = ${val(shown, rs(sale))}</div>
        ${shown ? `<p class="mn-save">${t(T2(`You save ${rs(off)}!`, `तुम्हारी बचत ${rs(off)}!`))}</p>` : ''}
        ${ansHtml(T2('How much do you pay? (in rupees)', 'तुम कितने रुपये चुकाओगे?'), '₹')}`;
    }
    function interestOut() {
      const P = S.principal * 100, r2 = S.rate * 2, n = S.years, ci = mode === 'compound-interest';
      const A = ci ? ciAmount(P, r2, n) : P + siOf(P, r2, n), I = A - P, shown = S.shown || S.solved;
      const SI = siOf(P, r2, n);
      const goal = items[0] ? items[0].price : null;
      let work;
      if (!ci) work = `${t(T2('Interest = Principal × Rate × Time ÷ 100', 'ब्याज = मूलधन × दर × समय ÷ 100'))}<br>${R(S.principal)} × ${num(S.rate)} × ${n} ÷ 100 = ${val(shown, rs(I))}<br>${t(T2('Amount = Principal + Interest', 'मिश्रधन = मूलधन + ब्याज'))} = ${val(shown, rs(A))}`;
      else work = `${t(T2('Amount = Principal × (1 + Rate ÷ 100)', 'मिश्रधन = मूलधन × (1 + दर ÷ 100)'))}<sup>${n}</sup><br>${R(S.principal)} × (1 + ${num(S.rate)}÷100)<sup>${n}</sup> = ${val(shown, rs(A))}<br>${t(T2('Compound interest = Amount − Principal', 'चक्रवृद्धि ब्याज = मिश्रधन − मूलधन'))} = ${val(shown, rs(I))}`;
      let table = '';
      if (ci && shown) {
        let rows = '';
        for (let k = 1; k <= n; k++) { const a0 = ciAmount(P, r2, k - 1), a1 = ciAmount(P, r2, k); rows += `<tr><td>${k}</td><td>${rs(a0)}</td><td>${rs(a1 - a0)}</td><td>${rs(a1)}</td></tr>`; }
        table = `<div style="overflow-x:auto"><table class="mn-tb"><thead><tr><th>${t(T2('Year', 'साल'))}</th><th>${t(T2('Start', 'शुरू'))}</th><th>${t(T2('Interest', 'ब्याज'))}</th><th>${t(T2('End', 'अंत'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
          <p class="mn-save">${t(T2(`Compound interest is ${rs(I - SI)} more than simple interest (${rs(SI)}).`, `चक्रवृद्धि ब्याज साधारण ब्याज (${rs(SI)}) से ${rs(I - SI)} ज़्यादा है।`))}</p>`;
      }
      let goalNote = '';
      if (goal != null && shown) { let k = 0; while (k <= n && (ci ? ciAmount(P, r2, k) : P + siOf(P, r2, k)) < goal * 100) k++; goalNote = `<p class="mn-save">${k <= n ? t(T2(`Goal ${R(goal)} reached in year ${k}.`, `${R(goal)} का लक्ष्य ${k} साल में पूरा।`)) : t(T2(`Goal ${R(goal)} is not reached in ${n} years.`, `${n} साल में ${R(goal)} का लक्ष्य पूरा नहीं होता।`))}</p>`; }
      return `${goal != null ? `<p style="margin:0 0 6px;font-weight:700">${t(T2('Saving for', 'इसके लिए बचत'))}: ${t(items[0].name)} ${R(goal)}</p>` : ''}<div class="mn-chart">${chart()}</div>
        <div class="mn-legend"><span><i style="background:#1D4ED8"></i>${t(T2('Money saved', 'जमा रक़म'))}</span><span><i style="background:#22C55E"></i>${t(ci ? T2('Simple interest part', 'साधारण ब्याज वाला भाग') : T2('Interest', 'ब्याज'))}</span>${ci ? `<span><i style="background:#FF7A1A"></i>${t(T2('Interest on interest', 'ब्याज पर ब्याज'))}</span>` : ''}</div>
        <div class="mn-work">${work}</div>${table}${goalNote}
        ${ansHtml(ci ? T2('What is the compound interest? (to the nearest rupee)', 'चक्रवृद्धि ब्याज कितना है? (निकटतम रुपये में)') : T2('What is the simple interest? (in rupees)', 'साधारण ब्याज कितना है? (रुपये में)'), '₹')}`;
    }
    function chart() {
      const P = S.principal * 100, r2 = S.rate * 2, n = S.years, ci = mode === 'compound-interest', shown = S.shown || S.solved;
      const W = 340, H = 190, ml = 6, mt = 20, mb = 24, ph = H - mt - mb;
      const A = (k) => (ci ? ciAmount(P, r2, k) : P + siOf(P, r2, k));
      const goal = items[0] ? items[0].price * 100 : null;
      let ymax = A(n);
      if (goal != null && goal <= ymax * 1.5) ymax = Math.max(ymax, goal);
      const bw = (W - ml * 2) / (n + 1), w = Math.min(34, bw * 0.68);
      let s = '';
      for (let k = 0; k <= n; k++) {
        const cx = ml + bw * (k + 0.5), g = S.grow;
        const hP = (P / ymax) * ph * g, hS = (siOf(P, r2, k) / ymax) * ph * g, hE = ((A(k) - P - siOf(P, r2, k)) / ymax) * ph * g;
        const y0 = mt + ph;
        s += `<rect x="${cx - w / 2}" y="${y0 - hP}" width="${w}" height="${hP}" fill="#1D4ED8"/>`;
        if (hS > 0.3) s += `<rect x="${cx - w / 2}" y="${y0 - hP - hS}" width="${w}" height="${hS}" fill="#22C55E"/>`;
        if (ci && hE > 0.3) s += `<rect x="${cx - w / 2}" y="${y0 - hP - hS - hE}" width="${w}" height="${hE}" fill="#FF7A1A"/>`;
        s += `<text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="${n > 12 ? 8 : 11}">${k}</text>`;
        if (shown && (n <= 6 || k === n)) s += `<text x="${cx}" y="${y0 - hP - hS - hE - 4}" text-anchor="middle" font-size="10">₹${short(Math.round(A(k) / 100))}</text>`;
      }
      if (goal != null && goal <= ymax) { const gy = mt + ph - (goal / ymax) * ph; s += `<line x1="0" y1="${gy}" x2="${W}" y2="${gy}" stroke="#C2362B" stroke-width="2" stroke-dasharray="6 4"/><text x="${W - 4}" y="${gy - 4}" text-anchor="end" font-size="11" style="fill:#C2362B">${esc(api.t(T2('goal', 'लक्ष्य')))}</text>`; }
      s += `<line x1="0" y1="${mt + ph}" x2="${W}" y2="${mt + ph}" stroke="var(--line)" stroke-width="2"/><text x="${W - 4}" y="12" text-anchor="end" font-size="10">${esc(api.t(T2('years →', 'साल →')))}</text>`;
      return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(api.t(T2(`Bars for each year, 0 to ${n}: money saved plus interest`, `0 से ${n} तक हर साल के स्तंभ: जमा रक़म और ब्याज`)))}">${s}</svg>`;
    }
    const fR = (v) => R(v), fP = (v) => `${num(v)}%`, fY = (v) => `${v} ${raw(T2(v === 1 ? 'year' : 'years', 'साल'))}`;
    function bodyModel() {
      let controls = '';
      if (mode === 'profit-loss') { const r = plRange(items[S.sel[0]].price); controls = `<h4>${t(T2('What did you buy?', 'तुमने क्या ख़रीदा?'))}</h4>${chipsHtml()}<div style="height:8px"></div>${sliderHtml('price', T2('Selling price', 'विक्रय मूल्य'), r.min, r.max, 1, S.sp, fR)}`; }
      else if (mode === 'discount') { const r = mpRange(items[S.sel[0]].price); controls = `<h4>${t(T2('What are you buying?', 'तुम क्या ख़रीद रहे हो?'))}</h4>${chipsHtml()}<div style="height:8px"></div>${sliderHtml('rate', T2('Discount', 'छूट'), 0, 90, C.rate % 5 === 0 ? 5 : 1, S.rate, fP)}${sliderHtml('price', T2('Marked price', 'अंकित मूल्य'), r.min, r.max, 1, S.mp, fR)}`; }
      else { const pr = pRange(C.budget); controls = `<h4>${t(T2('Choose the numbers', 'संख्याएँ चुनो'))}</h4>${sliderHtml('price', T2('Money saved (principal)', 'जमा रक़म (मूलधन)'), pr.min, pr.max, pr.step, S.principal, fR)}${sliderHtml('rate', T2('Rate of interest a year', 'ब्याज की दर प्रति वर्ष'), 0.5, 25, 0.5, S.rate, fP)}${sliderHtml('years', T2('Time', 'समय'), 1, Math.max(10, C.years), 1, S.years, fY)}`; }
      return `<div class="mn-body two"><div class="mn-card">${controls}</div><div class="mn-card mn-out">${outHtml()}</div></div>`;
    }
    const outHtml = () => (mode === 'profit-loss' ? plOut() : mode === 'discount' ? discOut() : interestOut());
    function bodyBudget() {
      const tot = spent(), left = C.budget - tot, pctf = Math.min(100, (tot / C.budget) * 100), over = tot > C.budget;
      const counts = items.map((_, i) => S.sel.filter((j) => j === i).length);
      return `<div class="mn-body two"><div class="mn-card"><h4>${t(T2('Tap to add to your basket', 'टोकरी में जोड़ने के लिए दबाओ'))}</h4><div class="mn-items">${items.map((_, i) => itemCard(i, counts[i] > 0, counts[i] || 0)).join('')}</div></div>
        <div class="mn-col"><div class="mn-card"><div class="mn-row"><span>${t(T2('Your budget', 'तुम्हारा बजट'))}</span><b>${R(C.budget)}</b></div>
          <div class="mn-meter${over ? ' over' : ''}${over && S.shake && !reduced ? ' mn-shake' : ''}" role="img" aria-label="${esc(api.t(T2(`Spent ${R(tot)} of ${R(C.budget)}`, `${R(C.budget)} में से ${R(tot)} ख़र्च`)))}"><i style="width:${pctf}%"></i></div>
          <div class="mn-row"><span>${t(T2('Spent', 'ख़र्च'))}</span><b class="mn-big">${R(tot)}</b></div>
          <div class="mn-row"><span>${t(over ? T2('Over budget by', 'बजट से ज़्यादा') : T2('Money left', 'बचे हुए पैसे'))}</span><b class="mn-big" style="color:${over ? '#C2362B' : '#15803D'}">${R(Math.abs(left))}</b></div></div>
          <div class="mn-card"><h4>${t(T2('Your basket', 'तुम्हारी टोकरी'))}</h4>
          ${S.sel.length ? items.map((x, i) => counts[i] ? `<div class="mn-bill-row"><svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">${icon(x, i)}</svg><div class="nm">${t(x.name)}<small>${counts[i]} × ${R(x.price)}</small></div><b>${R(counts[i] * x.price)}</b><button type="button" class="mn-step" data-act="dec" data-i="${i}" aria-label="${esc(api.t(T2('Take out one ', 'एक निकालो ')) + raw(x.name))}">−</button></div>` : '').join('') : `<p class="mn-foot">${t(T2('The basket is empty.', 'टोकरी ख़ाली है।'))}</p>`}
          <div class="mn-actions">${S.done ? `<span class="mn-done"><b>${t(T2(`Bought! You kept ${R(left)}.`, `ख़रीद लिया! तुमने ${R(left)} बचाए।`))}</b></span><button type="button" class="mn-btn ghost" data-act="again">${t(T2('Start again', 'फिर से शुरू करो'))}</button>` : `<button type="button" class="mn-btn" data-act="pay" data-key="pay">${t(T2('Buy these', 'ये ख़रीदो'))}</button>`}</div></div></div></div>`;
    }

    const META = {
      count: [T2('Count the money', 'पैसे गिनो'), T2('Count every note and coin. Then say how much money there is.', 'हर नोट और सिक्के को गिनो। फिर बताओ कुल कितने पैसे हैं।'), 'shop'],
      pay: [T2('At the shop', 'दुकान पर'), T2('Pick what you want. Pay the exact price with coins and notes.', 'जो चाहिए वह चुनो। सिक्कों और नोटों से ठीक दाम चुकाओ।'), 'shop'],
      change: [T2('Give the change', 'बाक़ी पैसे लौटाओ'), T2('The customer gives you money. Give back the right change.', 'ग्राहक ने तुम्हें पैसे दिए हैं। सही बाक़ी पैसे लौटाओ।'), 'shop'],
      bill: [T2('Make the bill', 'बिल बनाओ'), T2('Add the things bought. Then work out the total bill.', 'ख़रीदी चीज़ें जोड़ो। फिर कुल बिल निकालो।'), 'shop'],
      'profit-loss': [T2('Profit or loss?', 'लाभ या हानि?'), T2('You bought at the cost price. Choose the selling price.', 'तुमने क्रय मूल्य पर ख़रीदा। विक्रय मूल्य चुनो।'), 'shop'],
      discount: [T2('Sale! Discount', 'सेल! छूट'), T2('The shop gives a discount on the marked price.', 'दुकान अंकित मूल्य पर छूट देती है।'), 'shop'],
      'simple-interest': [T2('Simple interest', 'साधारण ब्याज'), T2('The bank pays you for keeping money with it.', 'बैंक तुम्हारा पैसा जमा रखने के बदले तुम्हें ब्याज देता है।'), 'bank'],
      'compound-interest': [T2('Compound interest', 'चक्रवृद्धि ब्याज'), T2('Interest is added every year, and then earns interest too.', 'हर साल ब्याज जुड़ता है और फिर उस पर भी ब्याज मिलता है।'), 'bank'],
      budget: [T2('Shop within your budget', 'बजट में ख़रीदारी'), T2('Choose what to buy without spending more than you have.', 'जितने पैसे हैं उससे ज़्यादा ख़र्च किए बिना चुनो क्या ख़रीदना है।'), 'shop'],
    };
    const BODY = { count: bodyCount, pay: bodyPay, change: bodyChange, bill: bodyBill, 'profit-loss': bodyModel, discount: bodyModel, 'simple-interest': bodyModel, 'compound-interest': bodyModel, budget: bodyBudget };

    root.innerHTML = `<div class="mn">${defsSVG()}<div class="mn-head${META[mode][2] === 'bank' ? ' bank' : ''}">${META[mode][2] === 'shop' ? awning() : ''}<div class="mn-hrow"><div class="mn-hico">${META[mode][2] === 'bank' ? piggy() : ''}</div><div class="mn-htxt"><h3></h3><p></p></div></div></div>
      <div class="mn-live info" role="status" aria-live="polite"></div><div class="mn-main"></div></div>`;
    if (META[mode][2] === 'shop') root.querySelector('.mn-hico').remove();
    const h3 = root.querySelector('.mn-htxt h3'), hp = root.querySelector('.mn-htxt p'), live = root.querySelector('.mn-live'), main = root.querySelector('.mn-main');
    function paintLive() { live.className = 'mn-live ' + S.msg.k; live.innerHTML = t(S.msg.x); }
    function draw() {
      const a = document.activeElement;
      const fid = a && root.contains(a) ? a.dataset.fid || a.dataset.key || null : null;
      h3.textContent = raw(META[mode][0]); hp.textContent = raw(META[mode][1]);
      main.innerHTML = BODY[mode]();
      paintLive();
      S.bump = false; S.shake = false;
      if (fid) { const n = [...main.querySelectorAll('[data-fid],[data-key]')].find((el) => (el.dataset.fid || el.dataset.key) === fid); if (n && !n.disabled) n.focus({ preventScroll: true }); }
    }
    const refreshOut = () => { const o = main.querySelector('.mn-out'); if (o) o.innerHTML = outHtml(); };
    const ev = (e) => api.emit(e);

    // ---- actions
    const resetProblem = () => { S.ans = ''; S.solved = false; S.shown = false; S.tries = 0; S.msg = hint(); paintLive(); };
    function addPiece(k, v) {
      if (S.done) return;
      S.tray.push({ k, v }); S.lastAdd = S.tray.length - 1; S.bump = true;
      ev(`placed:${k}:${v}`); api.record(`Put ${pName(k, v).en} on the counter (total ${R(trayTotal())})`);
      if (mode === 'pay') say('info', S.sel.length ? T2(`You are paying ${R(trayTotal())}. The price is ${R(spent())}.`, `तुम ${R(trayTotal())} दे रहे हो। दाम ${R(spent())} है।`) : T2('First tap what you want to buy.', 'पहले दबाकर चुनो कि क्या ख़रीदना है।'));
      else say('info', T2(`You are giving back ${R(trayTotal())}.`, `तुम ${R(trayTotal())} लौटा रहे हो।`));
      draw();
    }
    function parseAns() {
      const el = main.querySelector('.mn-in'); if (el) S.ans = el.value;
      const s = String(S.ans).replace(/[₹,%\s]/g, '');
      return /^\d*\.?\d+$/.test(s) ? parseFloat(s) : null;
    }
    function grade(expected, tol, wrongHint) {
      const v = parseAns();
      if (v == null) { say('info', T2('Type a number first.', 'पहले एक संख्या लिखो।')); const el = main.querySelector('.mn-in'); if (el) el.focus(); return; }
      if (Math.abs(v - expected) <= tol) {
        S.solved = true; S.shown = true; ev('answered:right'); api.record(`Answered ${S.ans}: right`); api.celebrate();
        say('good', T2(`Yes! The answer is ${wrongHint.r}.`, `हाँ! उत्तर ${wrongHint.r} है।`));
        draw();
      } else {
        S.tries++; ev('answered:wrong'); api.record(`Answered ${S.ans}: wrong (should be ${wrongHint.r})`);
        const dir = v > expected ? T2('That is too big.', 'यह बहुत बड़ा है।') : T2('That is too small.', 'यह बहुत छोटा है।');
        say('bad', { en: `${dir.en} ${wrongHint.h.en}`, hi: `${dir.hi} ${wrongHint.h.hi}` });
        draw(); const el = main.querySelector('.mn-in'); if (el) { el.focus(); el.select(); }
      }
    }
    function check() {
      if (mode === 'count') return grade(C.budget, 0.001, { r: R(C.budget), h: T2('Count again: notes first, then coins.', 'फिर से गिनो: पहले नोट, फिर सिक्के।') });
      if (mode === 'bill') {
        const tot = billTotal(); if (!tot) { say('info', T2('Add something to the bill first.', 'पहले बिल में कुछ जोड़ो।')); return; }
        return grade(tot, 0.001, { r: R(tot), h: T2('Multiply each line, then add the lines.', 'हर पंक्ति का गुणा करो, फिर पंक्तियाँ जोड़ो।') });
      }
      if (mode === 'profit-loss') {
        const cp = items[S.sel[0]].price, d = Math.abs(S.sp - cp); if (!d) return;
        const pc = (d / cp) * 100;
        return grade(pc, 0.06, { r: `${num(pc)}%`, h: T2('Divide the profit or loss by the cost price, then multiply by 100.', 'लाभ या हानि को क्रय मूल्य से भाग दो, फिर 100 से गुणा करो।') });
      }
      if (mode === 'discount') { const { sale } = discSale(); return grade(sale / 100, 0.004, { r: rs(sale), h: T2('Find the discount first, then take it away from the marked price.', 'पहले छूट निकालो, फिर उसे अंकित मूल्य में से घटाओ।') }); }
      const P = S.principal * 100, r2 = S.rate * 2, n = S.years;
      const I = mode === 'simple-interest' ? siOf(P, r2, n) : ciAmount(P, r2, n) - P;
      const tol = I % 100 ? 0.5 : 0.004;
      return grade(I / 100, tol, { r: rs(I), h: mode === 'simple-interest' ? T2('Use Principal × Rate × Time ÷ 100.', 'मूलधन × दर × समय ÷ 100 का प्रयोग करो।') : T2('Add the interest each year to the money, then take away the principal.', 'हर साल का ब्याज रक़म में जोड़ते जाओ, फिर मूलधन घटाओ।') });
    }
    function payNow() {
      if (mode === 'budget') {
        if (!S.sel.length) { say('info', T2('Your basket is empty. Tap things to add them.', 'टोकरी ख़ाली है। चीज़ें जोड़ने के लिए दबाओ।')); return; }
        if (spent() > C.budget) { S.shake = true; say('bad', T2(`You are ${R(spent() - C.budget)} over budget. Take something out.`, `तुम बजट से ${R(spent() - C.budget)} ज़्यादा हो। कुछ निकालो।`)); draw(); return; }
        S.done = true; ev('paid'); api.celebrate(); api.record(`Bought for ${R(spent())} within budget ${R(C.budget)}`);
        say('good', T2(`Well planned! You spent ${R(spent())} and kept ${R(C.budget - spent())}.`, `बढ़िया योजना! तुमने ${R(spent())} ख़र्च किए और ${R(C.budget - spent())} बचाए।`)); draw(); return;
      }
      if (!S.sel.length) { say('info', T2('First tap what you want to buy.', 'पहले दबाकर चुनो कि क्या ख़रीदना है।')); return; }
      const price = spent(), got = trayTotal();
      if (got === price) { S.done = true; ev('paid'); ev('answered:right'); api.celebrate(); api.record(`Paid exactly ${R(price)}`); say('good', T2(`Paid exactly ${R(price)}. Well done!`, `ठीक ${R(price)} चुकाए। शाबाश!`)); }
      else if (got < price) { ev('answered:wrong'); api.record(`Paid ${R(got)} for ${R(price)}: not enough`); say('bad', T2(`Not enough. ${R(price - got)} more is needed.`, `पैसे कम हैं। ${R(price - got)} और चाहिए।`)); }
      else { ev('answered:wrong'); api.record(`Paid ${R(got)} for ${R(price)}: too much`); say('bad', T2(`That is ${R(got - price)} too much. Tap a coin or note on the counter to take it back.`, `यह ${R(got - price)} ज़्यादा है। काउंटर पर रखा कोई सिक्का या नोट दबाकर वापस उठाओ।`)); }
      draw();
    }
    function giveChange() {
      const price = items[S.sel[0]].price, paid = paidFor(), need = paid - price, got = trayTotal();
      if (got === need) { S.done = true; ev(`change:${need}`); ev('answered:right'); api.celebrate(); api.record(`Gave the right change ${R(need)}`); say('good', T2(`Right! ${R(paid)} − ${R(price)} = ${R(need)} change.`, `सही! ${R(paid)} − ${R(price)} = ${R(need)} बाक़ी।`)); }
      else if (got < need) { ev('answered:wrong'); api.record(`Change ${R(got)} is less than ${R(need)}`); say('bad', T2(`The customer is short by ${R(need - got)}. Give more.`, `ग्राहक को ${R(need - got)} कम मिले हैं। और दो।`)); }
      else { ev('answered:wrong'); api.record(`Change ${R(got)} is more than ${R(need)}`); say('bad', T2(`That is ${R(got - need)} too much. Take some back.`, `यह ${R(got - need)} ज़्यादा है। कुछ वापस उठाओ।`)); }
      draw();
    }
    const actions = {
      add: (el) => addPiece(el.dataset.k, +el.dataset.v),
      rm: (el) => { if (S.done) return; const j = +el.dataset.j; S.tray.splice(j, 1); S.lastAdd = -1; S.bump = true; say('info', T2(`You are now paying ${R(trayTotal())}.`, `अब तुम ${R(trayTotal())} दे रहे हो।`)); draw(); },
      item: (el) => {
        const i = +el.dataset.i;
        if (mode === 'pay') { if (S.done) return; const at = S.sel.indexOf(i); if (at >= 0) S.sel.splice(at, 1); else { S.sel.push(i); ev('picked:' + i); } S.bump = true; say('info', S.sel.length ? T2(`Price to pay: ${R(spent())}. Now pay with coins and notes.`, `चुकाने का दाम: ${R(spent())}। अब सिक्कों और नोटों से चुकाओ।`) : hint().x); }
        else if (mode === 'bill') { if (S.qty[i] >= 20) return; S.qty[i]++; ev('picked:' + i); resetProblem(); }
        else if (mode === 'budget') {
          if (S.done) return;
          const before = spent(); S.sel.push(i); ev('picked:' + i); S.bump = true;
          const after = spent();
          if (before <= C.budget && after > C.budget) { S.shake = true; ev('over-budget'); api.record(`Over budget: ${R(after)} of ${R(C.budget)}`); say('bad', T2(`Over budget by ${R(after - C.budget)}! Take something out.`, `बजट से ${R(after - C.budget)} ज़्यादा! कुछ निकालो।`)); }
          else if (after <= C.budget) say('info', T2(`Spent ${R(after)}. You still have ${R(C.budget - after)}.`, `${R(after)} ख़र्च हुए। अब भी ${R(C.budget - after)} बचे हैं।`));
        }
        draw();
      },
      dec: (el) => {
        const i = +el.dataset.i;
        if (mode === 'bill') { if (S.qty[i] > 0) S.qty[i]--; resetProblem(); }
        else if (mode === 'budget') { if (S.done) return; const at = S.sel.lastIndexOf(i); if (at >= 0) S.sel.splice(at, 1); const o = spent() > C.budget; S.shake = false; if (o) say('bad', T2(`Still ${R(spent() - C.budget)} over budget.`, `अब भी बजट से ${R(spent() - C.budget)} ज़्यादा।`)); else say('info', T2(`Spent ${R(spent())}. You have ${R(C.budget - spent())} left.`, `${R(spent())} ख़र्च हुए। ${R(C.budget - spent())} बचे हैं।`)); }
        draw();
      },
      pick1: (el) => {
        const i = +el.dataset.i; if (S.sel[0] === i && mode !== 'change') return;
        S.sel = [i]; ev('picked:' + i);
        if (mode === 'change') { S.tray = []; S.done = false; S.lastAdd = -1; say('info', hint().x); }
        else { S.mp = items[i].price; S.sp = clamp(Math.round((items[i].price * (100 + C.rate)) / 100), plRange(items[i].price).min, plRange(items[i].price).max); resetProblem(); }
        draw();
      },
      cpiece: (el) => { const i = +el.dataset.i, at = S.counted.indexOf(i); if (at >= 0) S.counted.splice(at, 1); else S.counted.push(i); const cs = S.counted.reduce((a, j) => a + pileList[j].v, 0); S.bump = true; if (!S.solved) say('info', T2(`Counted so far: ${R(cs)}.`, `अब तक गिना: ${R(cs)}।`)); draw(); },
      pay: payNow,
      gchange: giveChange,
      check,
      show: () => { S.shown = true; say('info', T2('Here is the working. Read each line, then try again.', 'यह रहा हल। हर पंक्ति पढ़ो, फिर कोशिश करो।')); draw(); },
      again: () => { resetState(); if (mode === 'change' || mode === 'pay') { S.sel = mode === 'pay' ? [] : S.sel; } draw(); },
    };
    const onClick = (e) => {
      const el = e.target.closest('[data-act]'); if (!el || !root.contains(el) || el.disabled) return;
      const key = el.dataset.key || el.dataset.allow;
      if (el.dataset.act === 'slide') return;
      if (key && !api.allowed(key)) { api.nudge(key); return; }
      actions[el.dataset.act](el);
    };
    const onInput = (e) => {
      const el = e.target;
      if (el.id === 'mn-ans') { S.ans = el.value; return; }
      if (el.dataset.act !== 'slide') return;
      const key = el.dataset.key, name = el.dataset.s;
      const cur = name === 'price' ? (mode === 'profit-loss' ? S.sp : mode === 'discount' ? S.mp : S.principal) : name === 'rate' ? S.rate : S.years;
      if (!api.allowed(key)) { el.value = cur; api.nudge(key); return; }
      const v = parseFloat(el.value);
      if (name === 'price') { if (mode === 'profit-loss') S.sp = v; else if (mode === 'discount') S.mp = v; else S.principal = v; }
      else if (name === 'rate') S.rate = v; else S.years = v;
      const o = el.parentNode.querySelector('output'); if (o) o.textContent = ({ price: fR, rate: fP, years: fY })[name](v);
      S.ans = ''; S.solved = false; S.shown = false; S.tries = 0; S.grow = 1; S.msg = hint(); paintLive();
      refreshOut();
    };
    const onChange = (e) => {
      const el = e.target; if (el.dataset.act !== 'slide') return;
      ev('moved:' + el.dataset.s); api.record(`Moved ${el.dataset.s} to ${el.value}`);
    };
    const onKey = (e) => { if (e.key === 'Enter' && e.target.id === 'mn-ans') { e.preventDefault(); if (api.allowed('answer')) check(); else api.nudge('answer'); } };
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('keydown', onKey);

    resetState();
    draw();
    if (isInt2 && !reduced) {
      S.grow = 0;
      stops.push(L.tween(900, (p) => { S.grow = L.ease(p); const c = main.querySelector('.mn-chart'); if (c) c.innerHTML = chart(); }));
    }
    return {
      destroy() {
        stops.forEach((s) => s());
        root.removeEventListener('click', onClick); root.removeEventListener('input', onInput);
        root.removeEventListener('change', onChange); root.removeEventListener('keydown', onKey);
      },
    };
  }

  NCA_T.register({
    id: 'money',
    css: CSS,
    validate,
    keys,
    demo: {
      mode: 'pay',
      items: [
        { name: T2('Pencil', 'पेंसिल'), price: 6 },
        { name: T2('Notebook', 'कॉपी'), price: 35 },
        { name: T2('Apple', 'सेब'), price: 12 },
        { name: T2('Milk packet', 'दूध का पैकेट'), price: 27 },
        { name: T2('Ball', 'गेंद'), price: 48 },
        { name: T2('Biscuits', 'बिस्कुट'), price: 10 },
      ],
      pick: [1, 3],
    },
    model: { rs, siOf, ciAmount, pctOf, greedy, pile, autoPaid },
    mount,
  });
})();
