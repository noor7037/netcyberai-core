// Template: Chance lab. Toss a coin, roll one or two dice, spin a spinner, draw a ball from a bag or a card from a pack,
// again and again, and watch the experimental probability (hits / trials) settle towards the theoretical probability
// (favourable outcomes / all equally likely outcomes). The draws are fair random draws made in code; the theory is
// computed by counting outcomes (never typed in), so every fraction on screen is exact. Config:
//   { device: 'coin'|'die'|'two-dice'|'spinner'|'bag'|'cards',
//     spinner?: [{ label: text or {en,hi}, weight: whole number 1-12 }] (2-8 segments, weights add to at most 24; wedge
//               sizes are proportional to the weights; only with device 'spinner'),
//     bag?: [{ colour: red|blue|green|yellow|orange|purple|white|black, count: 1-12 }] (2-6 colours, at most 30 balls;
//               only with device 'bag'),
//     ask?: id of the event the child is asked about (default per device). The ids by device:
//       coin: head, tail
//       die: one, six, even, odd, prime, lt3, gt4, mult3
//       two-dice: sum-2 ... sum-12, doubles, sum-even, sum-odd, sum-gt8, sum-lt5
//       spinner: seg-1 ... seg-N (the segments in order)
//       bag: <colour in the bag>, not-<colour in the bag>
//       cards: red, black, heart, spade, diamond, club, ace, king, queen, jack, face, red-face, number }
// Bag balls and cards go back before the next draw (with replacement), so every draw has the same chances.
(function () {
  const L = window.NCA_LIB;
  const { esc, ease, lerp, tween } = L;
  const T = (en, hi) => ({ en, hi });
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const simp = (n, d) => { const g = gcd(n, d) || 1; return [n / g, d / g]; };
  const PAL = ['#E11D48', '#2563EB', '#F5B90A', '#14B8A6', '#8B3DFF', '#FF7A1A', '#22C55E', '#02CFF9', '#FF6B57', '#4400F0', '#0F766E'];
  const DEVICES = ['coin', 'die', 'two-dice', 'spinner', 'bag', 'cards'];
  const MAXN = 2000;

  const BALLS = {
    red: { c: '#DC2626', n: T('red', 'लाल') }, blue: { c: '#2563EB', n: T('blue', 'नीली') }, green: { c: '#16A34A', n: T('green', 'हरी') },
    yellow: { c: '#FACC15', n: T('yellow', 'पीली') }, orange: { c: '#F97316', n: T('orange', 'नारंगी') }, purple: { c: '#8B3DFF', n: T('purple', 'बैंगनी') },
    white: { c: '#F1F5F9', n: T('white', 'सफ़ेद') }, black: { c: '#1F2937', n: T('black', 'काली') },
  };
  const SUITS = [
    { id: 'spade', sym: '♠', red: false, en: 'spades', hi: 'हुकुम' }, { id: 'heart', sym: '♥', red: true, en: 'hearts', hi: 'पान' },
    { id: 'diamond', sym: '♦', red: true, en: 'diamonds', hi: 'ईंट' }, { id: 'club', sym: '♣', red: false, en: 'clubs', hi: 'चिड़ी' },
  ];
  const RANKEN = { 1: 'Ace', 11: 'Jack', 12: 'Queen', 13: 'King' };
  const RANKHI = { 1: 'इक्का', 11: 'गुलाम', 12: 'बेगम', 13: 'बादशाह' };
  const rankSym = (r) => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[r] || String(r);
  const SEGCOL = ['#E11D48', '#2563EB', '#F5B90A', '#14B8A6', '#8B3DFF', '#FF7A1A', '#22C55E', '#02CFF9'];
  const darkOn = (hex) => { const [r, g, b] = L.hex(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55; };
  const isPlain = (o) => o && typeof o === 'object' && !Array.isArray(o);

  // ---------------------------------------------------------------- the sample space of each device (pure)
  function normLabel(l, i) {
    if (typeof l === 'string' || typeof l === 'number') return T(String(l), String(l));
    if (isPlain(l)) return T(l.en, l.hi);
    return T(String(i + 1), String(i + 1));
  }
  function spinnerOf(cfg) { return Array.isArray(cfg.spinner) ? cfg.spinner : [1, 2, 3, 4].map((n) => ({ label: String(n), weight: 1 })); }
  function bagOf(cfg) { return Array.isArray(cfg.bag) ? cfg.bag : [{ colour: 'red', count: 3 }, { colour: 'blue', count: 2 }, { colour: 'green', count: 1 }]; }

  // build(cfg): outs = every distinct outcome with its weight (equally likely units); groups = what the bar chart counts;
  // events = the questions that can be asked, each with a test over one outcome.
  function build(cfg) {
    const d = cfg.device;
    const outs = [], groups = [], events = {};
    const ev = (id, en, hi, test) => { events[id] = { ph: T(en, hi), test }; };
    let def, verb, cols;
    if (d === 'coin') {
      [['head', T('Head', 'चित'), PAL[0]], ['tail', T('Tail', 'पट'), PAL[1]]].forEach(([id, lab, col]) => { outs.push({ id, w: 1, g: id }); groups.push({ id, lab, col }); });
      ev('head', 'getting a head', 'चित आने', (o) => o.id === 'head');
      ev('tail', 'getting a tail', 'पट आने', (o) => o.id === 'tail');
      def = 'head'; verb = { one: T('Toss', 'उछालो'), many: (n) => T(`Toss ${n} times`, `${n} बार उछालो`) }; cols = 2;
    } else if (d === 'die') {
      for (let v = 1; v <= 6; v++) { outs.push({ v, w: 1, g: String(v) }); groups.push({ id: String(v), lab: T(String(v), String(v)), col: PAL[v - 1] }); }
      ev('one', 'rolling a 1', '1 आने', (o) => o.v === 1);
      ev('six', 'rolling a 6', '6 आने', (o) => o.v === 6);
      ev('even', 'rolling an even number', 'सम संख्या आने', (o) => o.v % 2 === 0);
      ev('odd', 'rolling an odd number', 'विषम संख्या आने', (o) => o.v % 2 === 1);
      ev('prime', 'rolling a prime number', 'अभाज्य संख्या आने', (o) => [2, 3, 5].includes(o.v));
      ev('lt3', 'rolling a number less than 3', '3 से छोटी संख्या आने', (o) => o.v < 3);
      ev('gt4', 'rolling a number greater than 4', '4 से बड़ी संख्या आने', (o) => o.v > 4);
      ev('mult3', 'rolling a multiple of 3', '3 का गुणज आने', (o) => o.v % 3 === 0);
      def = 'even'; verb = { one: T('Roll', 'फेंको'), many: (n) => T(`Roll ${n} times`, `${n} बार फेंको`) }; cols = 6;
    } else if (d === 'two-dice') {
      for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) outs.push({ a, b, w: 1, g: String(a + b) });
      for (let s = 2; s <= 12; s++) {
        groups.push({ id: String(s), lab: T(String(s), String(s)), col: PAL[(s - 2) % PAL.length] });
        ev('sum-' + s, `getting a sum of ${s}`, `योग ${s} आने`, (o) => o.a + o.b === s);
      }
      ev('doubles', 'getting a double (the same number on both dice)', 'दोनों पासों पर एक-सी संख्या आने', (o) => o.a === o.b);
      ev('sum-even', 'getting an even sum', 'योग सम आने', (o) => (o.a + o.b) % 2 === 0);
      ev('sum-odd', 'getting an odd sum', 'योग विषम आने', (o) => (o.a + o.b) % 2 === 1);
      ev('sum-gt8', 'getting a sum greater than 8', 'योग 8 से बड़ा आने', (o) => o.a + o.b > 8);
      ev('sum-lt5', 'getting a sum less than 5', 'योग 5 से छोटा आने', (o) => o.a + o.b < 5);
      def = 'sum-7'; verb = { one: T('Roll both', 'दोनों फेंको'), many: (n) => T(`Roll ${n} times`, `${n} बार फेंको`) }; cols = 6;
    } else if (d === 'spinner') {
      spinnerOf(cfg).forEach((s, i) => {
        const lab = normLabel(s.label, i);
        outs.push({ i, w: s.weight, g: 's' + i, lab });
        groups.push({ id: 's' + i, lab, col: SEGCOL[i % SEGCOL.length] });
        ev('seg-' + (i + 1), `the spinner stopping on “${lab.en}”`, `चक्री “${lab.hi}” पर रुकने`, (o) => o.i === i);
      });
      def = 'seg-1'; verb = { one: T('Spin', 'घुमाओ'), many: (n) => T(`Spin ${n} times`, `${n} बार घुमाओ`) }; cols = 8;
    } else if (d === 'bag') {
      bagOf(cfg).forEach((b) => {
        const B = BALLS[b.colour];
        outs.push({ c: b.colour, w: b.count, g: b.colour });
        groups.push({ id: b.colour, lab: B.n, col: B.c });
        ev(b.colour, `drawing a ${B.n.en} ball`, `${B.n.hi} गेंद निकलने`, (o) => o.c === b.colour);
        ev('not-' + b.colour, `drawing a ball that is not ${B.n.en}`, `${B.n.hi} के अलावा गेंद निकलने`, (o) => o.c !== b.colour);
      });
      def = bagOf(cfg)[0].colour; verb = { one: T('Draw a ball', 'गेंद निकालो'), many: (n) => T(`Draw ${n} times`, `${n} बार निकालो`) }; cols = 10;
    } else if (d === 'cards') {
      SUITS.forEach((s) => {
        for (let r = 1; r <= 13; r++) outs.push({ r, s: s.id, w: 1, g: s.id });
        groups.push({ id: s.id, lab: T(s.sym, s.sym), col: s.red ? '#E11D48' : '#334155' });
      });
      const suit = (id) => SUITS.find((x) => x.id === id);
      ev('red', 'drawing a red card', 'लाल पत्ता निकलने', (o) => suit(o.s).red);
      ev('black', 'drawing a black card', 'काला पत्ता निकलने', (o) => !suit(o.s).red);
      SUITS.forEach((s) => ev(s.id, `drawing a ${s.id}`, `${s.hi} का पत्ता निकलने`, (o) => o.s === s.id));
      ev('ace', 'drawing an ace', 'इक्का निकलने', (o) => o.r === 1);
      ev('king', 'drawing a king', 'बादशाह निकलने', (o) => o.r === 13);
      ev('queen', 'drawing a queen', 'बेगम निकलने', (o) => o.r === 12);
      ev('jack', 'drawing a jack', 'गुलाम निकलने', (o) => o.r === 11);
      ev('face', 'drawing a face card (king, queen or jack)', 'तस्वीर वाला पत्ता (बादशाह, बेगम या गुलाम) निकलने', (o) => o.r >= 11);
      ev('red-face', 'drawing a red face card', 'लाल तस्वीर वाला पत्ता निकलने', (o) => o.r >= 11 && suit(o.s).red);
      ev('number', 'drawing a number card (2 to 10)', 'अंक वाला पत्ता (2 से 10) निकलने', (o) => o.r >= 2 && o.r <= 10);
      def = 'ace'; verb = { one: T('Draw a card', 'पत्ता निकालो'), many: (n) => T(`Draw ${n} times`, `${n} बार निकालो`) }; cols = 13;
    }
    const total = outs.reduce((s, o) => s + o.w, 0);
    return { d, outs, groups, events, total, def, verb, cols };
  }

  // ---------------------------------------------------------------- validate / keys
  function validate(c) {
    if (!isPlain(c)) return ['config must be an object'];
    const e = [];
    Object.keys(c).forEach((k) => { if (!['device', 'spinner', 'bag', 'ask'].includes(k)) e.push('unknown key: ' + k); });
    if (!DEVICES.includes(c.device)) { e.push('device must be one of ' + DEVICES.join(', ')); return e; }
    if (c.spinner != null) {
      if (c.device !== 'spinner') e.push("spinner is only for device 'spinner'");
      else if (!Array.isArray(c.spinner) || c.spinner.length < 2 || c.spinner.length > 8) e.push('spinner: 2 to 8 segments');
      else {
        let tot = 0;
        c.spinner.forEach((s, i) => {
          const w = `spinner[${i}]`;
          if (!isPlain(s)) { e.push(w + ': must be { label, weight }'); return; }
          Object.keys(s).forEach((k) => { if (!['label', 'weight'].includes(k)) e.push(`${w}: unknown key ${k}`); });
          const okTxt = (t) => typeof t === 'string' && t.trim().length > 0 && t.length <= 14;
          const l = s.label;
          if (!(okTxt(l) || (isPlain(l) && okTxt(l.en) && okTxt(l.hi)))) e.push(`${w}: label must be a short text (1-14 characters) or { en, hi }`);
          if (!Number.isInteger(s.weight) || s.weight < 1 || s.weight > 12) e.push(`${w}: weight must be a whole number from 1 to 12`);
          else tot += s.weight;
        });
        if (tot > 24) e.push('spinner: weights must add up to at most 24');
      }
    }
    if (c.bag != null) {
      if (c.device !== 'bag') e.push("bag is only for device 'bag'");
      else if (!Array.isArray(c.bag) || c.bag.length < 2 || c.bag.length > 6) e.push('bag: 2 to 6 colours');
      else {
        let tot = 0; const seen = new Set();
        c.bag.forEach((b, i) => {
          const w = `bag[${i}]`;
          if (!isPlain(b)) { e.push(w + ': must be { colour, count }'); return; }
          Object.keys(b).forEach((k) => { if (!['colour', 'count'].includes(k)) e.push(`${w}: unknown key ${k}`); });
          if (!BALLS[b.colour]) e.push(`${w}: colour must be one of ${Object.keys(BALLS).join(', ')}`);
          else if (seen.has(b.colour)) e.push(`${w}: colour ${b.colour} is listed twice`);
          else seen.add(b.colour);
          if (!Number.isInteger(b.count) || b.count < 1 || b.count > 12) e.push(`${w}: count must be a whole number from 1 to 12`);
          else tot += b.count;
        });
        if (tot > 30) e.push('bag: at most 30 balls in all');
      }
    }
    if (c.ask != null) {
      if (typeof c.ask !== 'string') e.push('ask must be an event id (text)');
      else if (!e.length) {
        const m = build(c);
        if (!m.events[c.ask]) e.push(`ask '${c.ask}' is not an event of device '${c.device}'; use one of: ${Object.keys(m.events).join(', ')}`);
      }
    }
    return e;
  }
  function keys() {
    return { targets: ['toss', 'toss:10', 'toss:100', 'answer', 'reset'], events: ['tossed', 'trend', 'answered:right', 'answered:wrong', 'reset'] };
  }

  const frHTML = (n, d) => (d === 1 ? `<b class="pb-whole">${n}</b>` : `<span class="pb-fr"><b>${n}</b><b>${d}</b></span>`);
  const dec = (p) => String(Number(p.toFixed(3)));

  // ---------------------------------------------------------------- drawing pieces
  const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]] };
  function dieSVG(x, y, size, v, rot, sc) {
    const u = size * 0.27, r = size * 0.095;
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${sc.toFixed(3)})">
      <rect x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#pb-die)" stroke="#94A3B8" stroke-width="2"/>
      <rect x="${-size / 2 + 5}" y="${-size / 2 + 4}" width="${size - 10}" height="${size * 0.3}" rx="${size * 0.14}" fill="#fff" opacity=".55"/>
      ${PIPS[v].map(([a, b]) => `<circle cx="${a * u}" cy="${b * u}" r="${v === 1 ? r * 1.5 : r}" fill="${v === 1 ? '#E11D48' : '#1E293B'}"/>`).join('')}</g>`;
  }
  function ballSVG(x, y, r, colour) {
    return `<g><ellipse cx="${x}" cy="${y + r * 0.98}" rx="${r * 0.8}" ry="${r * 0.22}" fill="#000" opacity=".22"/>
      <circle cx="${x}" cy="${y}" r="${r}" fill="url(#pb-b-${colour})" stroke="rgba(15,23,42,.35)" stroke-width="1.5"/>
      <ellipse cx="${x - r * 0.35}" cy="${y - r * 0.4}" rx="${r * 0.26}" ry="${r * 0.15}" fill="#fff" opacity=".6" transform="rotate(-30 ${x - r * 0.35} ${y - r * 0.4})"/></g>`;
  }
  function cardFace(w, h, r, suitId) {
    const s = SUITS.find((x) => x.id === suitId), col = s.red ? '#DC2626' : '#1E293B', rs = rankSym(r);
    const corner = `<text x="${-w / 2 + 11}" y="${-h / 2 + 22}" text-anchor="middle" font-size="19" font-weight="800" fill="${col}">${rs}</text>
      <text x="${-w / 2 + 11}" y="${-h / 2 + 40}" text-anchor="middle" font-size="17" fill="${col}">${s.sym}</text>`;
    let mid = '';
    if (r === 1) mid = `<text x="0" y="20" text-anchor="middle" font-size="62" fill="${col}">${s.sym}</text>`;
    else if (r >= 11) {
      mid = `<rect x="${-w / 2 + 22}" y="${-h / 2 + 18}" width="${w - 44}" height="${h - 36}" rx="6" fill="${s.red ? '#FEE2E2' : '#E2E8F0'}" stroke="${col}" stroke-width="1.5"/>
        <text x="0" y="14" text-anchor="middle" font-size="46" font-weight="800" font-family="Baloo 2, serif" fill="${col}">${rs}</text>
        ${r >= 12 ? `<path d="M-16 -22l5 -14 6 9 5 -12 5 12 6 -9 5 14z" fill="#F5B90A" stroke="#B7860B" stroke-width="1.2"/>` : `<circle cx="0" cy="-30" r="7" fill="#F5B90A" stroke="#B7860B"/>`}
        <text x="0" y="40" text-anchor="middle" font-size="20" fill="${col}">${s.sym}</text>`;
    } else {
      const P = { 2: [[0, -2], [0, 2]], 3: [[0, -2], [0, 0], [0, 2]], 4: [[-1, -2], [1, -2], [-1, 2], [1, 2]], 5: [[-1, -2], [1, -2], [0, 0], [-1, 2], [1, 2]], 6: [[-1, -2], [1, -2], [-1, 0], [1, 0], [-1, 2], [1, 2]], 7: [[-1, -2], [1, -2], [-1, 0], [1, 0], [-1, 2], [1, 2], [0, -1]], 8: [[-1, -2], [1, -2], [-1, 0], [1, 0], [-1, 2], [1, 2], [0, -1], [0, 1]], 9: [[-1, -2], [1, -2], [-1, -0.67], [1, -0.67], [-1, 0.67], [1, 0.67], [-1, 2], [1, 2], [0, 0]], 10: [[-1, -2], [1, -2], [-1, -0.67], [1, -0.67], [-1, 0.67], [1, 0.67], [-1, 2], [1, 2], [0, -1.33], [0, 1.33]] }[r];
      mid = P.map(([a, b]) => `<text x="${a * 21}" y="${b * 19 + 8}" text-anchor="middle" font-size="22" fill="${col}"${b > 0 ? ` transform="rotate(180 ${a * 21} ${b * 19 + 1})"` : ''}>${s.sym}</text>`).join('');
    }
    return `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="9" fill="#FFFEFA" stroke="#94A3B8" stroke-width="2"/>${corner}<g transform="rotate(180)">${corner}</g>${mid}`;
  }
  function cardBack(w, h) {
    return `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="9" fill="#FFFEFA" stroke="#94A3B8" stroke-width="2"/>
      <rect x="${-w / 2 + 6}" y="${-h / 2 + 6}" width="${w - 12}" height="${h - 12}" rx="6" fill="url(#pb-back)"/>
      <circle cx="0" cy="0" r="14" fill="#FFD23F" opacity=".9"/><text x="0" y="6" text-anchor="middle" font-size="16" font-weight="800" fill="#1D4ED8">N</text>`;
  }

  const CSS = `
.pb { display: grid; gap: 14px; color: var(--ink); font-family: var(--font-body); }
.pb.wide { grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); align-items: start; }
.pb-main, .pb-side { display: grid; gap: 14px; align-content: start; min-width: 0; }
.pb-card { background: var(--surface); border: 1.5px solid var(--line); border-radius: 18px; padding: 12px 14px; min-width: 0; }
.pb-h { font-family: var(--font-display); font-weight: 700; font-size: 1.02rem; margin: 0 0 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pb-stage { max-width: 560px; margin-inline: auto; border-radius: 18px; overflow: hidden; box-shadow: 0 8px 24px rgba(6, 18, 51, .28); background: #1B1456; line-height: 0; }
.pb-svg { width: 100%; height: auto; display: block; }
.pb-recent { display: flex; gap: 5px; flex-wrap: wrap; min-height: 32px; margin: 10px 0 2px; align-items: center; }
.pb-recent .pb-lab { font-size: .8rem; color: var(--ink-2); margin-right: 4px; }
.pb-chip { min-width: 30px; height: 30px; padding: 0 6px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: .82rem; border: 1.5px solid rgba(15, 23, 42, .25); box-shadow: 0 1px 2px rgba(0, 0, 0, .15); }
.pb-chip.ball { width: 28px; min-width: 28px; padding: 0; border-radius: 50%; }
.pb-btns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.pb-btns button { flex: 1 1 100px; min-height: 52px; border: 0; border-radius: 14px; font-weight: 800; font-size: 1rem; padding: 0 12px; transition: transform .12s, box-shadow .12s, opacity .12s; box-shadow: 0 3px 0 rgba(6, 18, 51, .25); }
.pb-btns button:active { transform: translateY(2px); box-shadow: 0 1px 0 rgba(6, 18, 51, .25); }
.pb-btns .pb-go { background: #FF7A1A; color: #1E293B; flex: 2 1 150px; font-size: 1.12rem; }
.pb-btns .pb-go2 { background: #1D4ED8; color: #fff; }
.pb-btns .pb-reset { background: var(--surface); color: var(--ink); border: 1.5px solid var(--line); box-shadow: none; flex: 1 1 80px; }
.pb-btns button[aria-disabled="true"] { opacity: .5; cursor: progress; }
.pb-btns button:focus-visible, .pb-opt:focus-visible { outline: 3px solid var(--cyan); outline-offset: 2px; }
.pb-live { font-size: .95rem; margin-top: 10px; min-height: 1.4em; color: var(--ink); font-weight: 600; }
.pb-tiles { display: grid; gap: 4px; }
.pb-tile { aspect-ratio: 1 / 1; min-height: 20px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: .72rem; font-weight: 800; background: var(--sunk); border: 1.5px solid var(--line); line-height: 1; overflow: hidden; transition: opacity .25s, transform .25s; }
.pb-tile.ball { border-radius: 50%; }
.pb-tile.dim { opacity: .38; }
.pb-tile.fav { opacity: 1; outline: 3px solid #FF7A1A; outline-offset: 1px; transform: scale(1.04); z-index: 1; box-shadow: 0 0 10px rgba(255, 122, 26, .6); }
.pb-note { font-size: .88rem; color: var(--ink-2); margin: 8px 0 0; }
.pb-ev { font-family: var(--font-display); font-weight: 700; font-size: 1.12rem; margin: 2px 0 10px; line-height: 1.3; }
.pb-ev em { font-style: normal; color: #E11D48; }
.pb-opts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.pb-opt { min-height: 68px; border-radius: 14px; border: 2px solid var(--line); background: var(--sunk); font-size: 1.3rem; display: flex; align-items: center; justify-content: center; font-weight: 800; transition: transform .12s, background .2s; }
.pb-opt:hover { border-color: var(--royal); }
.pb-opt.wrong { background: var(--bad-t); border-color: var(--bad); opacity: .65; }
.pb-opt.right { background: var(--good-t); border-color: var(--good); }
.pb-opt[aria-disabled="true"] { cursor: default; }
.pb-fr { display: inline-flex; flex-direction: column; align-items: center; line-height: 1.1; }
.pb-fr b:first-child { border-bottom: 2.5px solid currentColor; padding: 0 6px 2px; }
.pb-fr b:last-child { padding-top: 2px; }
.pb-fb { margin: 10px 0 0; padding: 10px 12px; border-radius: 12px; font-size: .95rem; line-height: 1.45; background: var(--sunk); }
.pb-fb.good { background: var(--good-t); }
.pb-fb.bad { background: var(--bad-t); }
.pb-fb .pb-fr { vertical-align: middle; margin: 0 2px; font-size: .95em; }
.pb-chart { width: 100%; height: auto; display: block; }
.pb-chart text { font-family: var(--font-body); }
.pb-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: .82rem; color: var(--ink-2); margin-top: 6px; align-items: center; }
.pb-legend i { display: inline-block; width: 16px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: middle; }
.pb-legend i.ln { height: 0; border-top: 3px solid var(--ink); border-radius: 0; }
.pb-legend i.ds { height: 0; border-top: 3px dashed #E11D48; border-radius: 0; }
.pb-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.pb-stat { background: var(--sunk); border-radius: 14px; padding: 10px 12px; min-width: 0; }
.pb-stat small { display: block; font-size: .78rem; color: var(--ink-2); font-weight: 600; }
.pb-stat strong { font-family: var(--font-display); font-size: 1.35rem; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pb-stat .pb-fr { font-size: 1rem; }
.pb-stat.th { background: var(--sun-t); }
.pb-stat span { font-size: .85rem; color: var(--ink-2); font-weight: 600; }
@media (prefers-reduced-motion: reduce) { .pb *, .pb { transition: none !important; } }
`;

  // ---------------------------------------------------------------- the view
  function mountLab(root, cfg, api) {
    const M = build(cfg);
    const askId = cfg.ask || M.def;
    const EV = M.events[askId];
    const lang = () => (api.lang ? api.lang() : 'en');
    const t = (x) => api.t(x);
    const N = M.total;
    let fav = 0;
    M.outs.forEach((o) => { if (EV.test(o)) fav += o.w; });
    const P = simp(fav, N), pv = fav / N;

    // state
    const S = { n: 0, hits: 0, gcnt: {}, hist: [], recent: [], last: null, solved: false, wrong: [], fb: null, rot: 0, trendAt: 0, busy: false };
    M.groups.forEach((g) => { S.gcnt[g.id] = 0; });
    let stop = null, ro = null;
    const sample = () => { let r = Math.floor(Math.random() * N); for (const o of M.outs) { if (r < o.w) return o; r -= o.w; } return M.outs[M.outs.length - 1]; };

    const describe = (o) => {
      if (M.d === 'coin') return o.id === 'head' ? T('Head', 'चित') : T('Tail', 'पट');
      if (M.d === 'die') return T(String(o.v), String(o.v));
      if (M.d === 'two-dice') return T(`${o.a} + ${o.b} = ${o.a + o.b}`, `${o.a} + ${o.b} = ${o.a + o.b}`);
      if (M.d === 'spinner') return o.lab;
      if (M.d === 'bag') return T(`a ${BALLS[o.c].n.en} ball`, `${BALLS[o.c].n.hi} गेंद`);
      const s = SUITS.find((x) => x.id === o.s);
      return T(`${RANKEN[o.r] || o.r} of ${s.en}`, `${s.hi} का ${RANKHI[o.r] || o.r}`);
    };
    const chipOf = (o) => {
      if (M.d === 'coin') return { txt: o.id === 'head' ? t(T('H', 'चित')) : t(T('T', 'पट')), bg: o.id === 'head' ? '#F5B90A' : '#CBD5E1', fg: '#1E293B' };
      if (M.d === 'die') return { txt: String(o.v), bg: '#fff', fg: '#1E293B' };
      if (M.d === 'two-dice') return { txt: `${o.a}+${o.b}`, bg: '#fff', fg: '#1E293B' };
      if (M.d === 'spinner') { const c = SEGCOL[o.i % SEGCOL.length]; return { txt: t(o.lab), bg: c, fg: darkOn(c) ? '#1E293B' : '#fff' }; }
      if (M.d === 'bag') return { txt: '', bg: BALLS[o.c].c, fg: '#fff', ball: true };
      const s = SUITS.find((x) => x.id === o.s);
      return { txt: rankSym(o.r) + s.sym, bg: '#fff', fg: s.red ? '#DC2626' : '#1E293B' };
    };

    root.innerHTML = `<div class="pb">
      <div class="pb-main">
        <section class="pb-card" aria-label="${esc(t(T('The experiment', 'प्रयोग')))}">
          <div class="pb-stage"><svg class="pb-svg" viewBox="0 0 360 220" role="img"></svg></div>
          <div class="pb-recent" aria-hidden="true"></div>
          <div class="pb-btns">
            <button type="button" class="pb-go" data-key="toss">${esc(t(M.verb.one))}</button>
            <button type="button" class="pb-go2" data-key="toss:10">${esc(t(M.verb.many(10)))}</button>
            <button type="button" class="pb-go2" data-key="toss:100">${esc(t(M.verb.many(100)))}</button>
            <button type="button" class="pb-reset" data-key="reset">${esc(t(T('Start again', 'फिर से शुरू')))}</button>
          </div>
          <div class="pb-live" aria-live="polite"></div>
        </section>
        <section class="pb-card pb-ask" data-key="answer" aria-label="${esc(t(T('Question', 'प्रश्न')))}">
          <div class="pb-ev"></div>
          <div class="pb-opts" role="group"></div>
          <div class="pb-fb" hidden aria-live="polite"></div>
        </section>
        <section class="pb-card">
          <h3 class="pb-h">${esc(t(T('All possible outcomes', 'सारे संभावित परिणाम')))}</h3>
          <div class="pb-tiles" style="grid-template-columns:repeat(${M.cols},minmax(0,1fr));max-width:${M.cols * 52}px"></div>
          <p class="pb-note">${esc(t(M.d === 'spinner' || M.d === 'bag'
            ? T('Each box is one equal chance (a bigger wedge or more balls means more boxes). The glowing boxes match your event.', 'हर डिब्बा एक बराबर मौक़ा है (बड़ा हिस्सा या ज़्यादा गेंदें यानी ज़्यादा डिब्बे)। चमकते डिब्बे तुम्हारी घटना से मेल खाते हैं।')
            : M.d === 'cards' ? T('A full pack of 52 cards. The glowing cards match your event. The card goes back and the pack is shuffled before the next draw.', '52 पत्तों की पूरी गड्डी। चमकते पत्ते तुम्हारी घटना से मेल खाते हैं। अगली बार से पहले पत्ता वापस रखकर गड्डी फेंटी जाती है।')
              : T('Every box is equally likely. The glowing boxes match your event.', 'हर डिब्बे के आने की संभावना बराबर है। चमकते डिब्बे तुम्हारी घटना से मेल खाते हैं।')))}</p>
        </section>
      </div>
      <div class="pb-side">
        <section class="pb-card">
          <h3 class="pb-h">${esc(t(T('How often each outcome came', 'हर परिणाम कितनी बार आया')))}</h3>
          <div class="pb-bars"></div>
          <div class="pb-legend"><span><i style="background:#2563EB"></i>${esc(t(T('your results', 'तुम्हारे नतीजे')))}</span><span><i class="ln"></i>${esc(t(T('equal-chance line (theory)', 'बराबर-संभावना रेखा (सिद्धांत)')))}</span></div>
        </section>
        <section class="pb-card">
          <h3 class="pb-h">${esc(t(T('Your event, trial after trial', 'तुम्हारी घटना, बार-बार')))}</h3>
          <div class="pb-trend"></div>
          <div class="pb-legend"><span><i class="ln" style="border-color:#2563EB"></i>${esc(t(T('experimental: hits ÷ trials', 'प्रायोगिक: सफल ÷ कुल बार')))}</span><span><i class="ds"></i>${esc(t(T('theoretical', 'सैद्धांतिक')))}</span></div>
          <p class="pb-note pb-insight"></p>
        </section>
        <section class="pb-card pb-stats"></section>
      </div>
    </div>`;
    const el = (c) => root.querySelector(c);
    const svg = el('.pb-svg'), live = el('.pb-live'), askBox = el('.pb-ask');
    const btns = [...root.querySelectorAll('.pb-btns button')];

    // ------------- the stage
    const defs = () => `<defs>
      <radialGradient id="pb-bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#4C3BB5"/><stop offset=".6" stop-color="#2A1F82"/><stop offset="1" stop-color="#150F4D"/></radialGradient>
      <radialGradient id="pb-gold" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#FFF1A8"/><stop offset=".5" stop-color="#F5B90A"/><stop offset="1" stop-color="#B7860B"/></radialGradient>
      <linearGradient id="pb-die" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DDE5F0"/></linearGradient>
      <linearGradient id="pb-bag" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#A9743C"/><stop offset=".45" stop-color="#D49A5C"/><stop offset="1" stop-color="#8B5A2B"/></linearGradient>
      <pattern id="pb-back" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#1D4ED8"/><rect width="5" height="10" fill="#2563EB"/></pattern>
      ${Object.keys(BALLS).map((k) => `<radialGradient id="pb-b-${k}" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${L.mixHex(BALLS[k].c, '#ffffff', 0.45)}"/><stop offset=".55" stop-color="${BALLS[k].c}"/><stop offset="1" stop-color="${L.mixHex(BALLS[k].c, '#000000', 0.35)}"/></radialGradient>`).join('')}
    </defs>
    <rect width="360" height="220" fill="url(#pb-bg)"/>
    <ellipse cx="180" cy="196" rx="150" ry="16" fill="#000" opacity=".22"/>
    ${[[30, 24], [330, 30], [60, 190], [310, 180], [180, 14]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 2 ? 2 : 1.5}" fill="#fff" opacity=".35"/>`).join('')}`;

  function stageInner(a) {
      const o = a ? a.o : S.last;
      let out = '';
      if (M.d === 'coin') {
        let face = S.last ? S.last.id : 'head', sy = 1, lift = 0;
        if (a) {
          const from = a.from, to = a.o.id, Nh = from === to ? 6 : 7, half = ease(a.t) * Nh;
          face = Math.floor(half) % 2 === 0 ? from : from === 'head' ? 'tail' : 'head';
          sy = Math.abs(Math.cos(half * Math.PI)); lift = Math.sin(a.t * Math.PI) * 46;
        }
        sy = Math.max(sy, 0.07);
        const faceG = face === 'head'
          ? `<circle r="52" fill="none" stroke="#B7860B" stroke-width="2" stroke-dasharray="3 4"/>
             <path d="M0 -34l9 20 22 2-17 14 5 22-19-12-19 12 5-22-17-14 22-2z" fill="#FFE27A" stroke="#B7860B" stroke-width="2"/>
             <text y="48" text-anchor="middle" font-size="17" font-weight="800" fill="#7A5200" transform="scale(1 ${(1).toFixed(2)})">${esc(t(T('HEAD', 'चित')))}</text>`
          : `<circle r="52" fill="none" stroke="#B7860B" stroke-width="2" stroke-dasharray="3 4"/>
             <text y="16" text-anchor="middle" font-size="58" font-weight="800" fill="#7A5200" font-family="Baloo 2, sans-serif">₹</text>
             <text y="48" text-anchor="middle" font-size="17" font-weight="800" fill="#7A5200">${esc(t(T('TAIL', 'पट')))}</text>`;
        out = `<ellipse cx="180" cy="188" rx="${(60 - lift * 0.3).toFixed(1)}" ry="${(9 - lift * 0.06).toFixed(1)}" fill="#000" opacity=".3"/>
          <g transform="translate(180 ${(116 - lift).toFixed(1)}) scale(1 ${sy.toFixed(3)})"><circle r="68" fill="url(#pb-gold)" stroke="#B7860B" stroke-width="4"/>${faceG}
          <ellipse cx="-24" cy="-38" rx="22" ry="9" fill="#fff" opacity=".35" transform="rotate(-25 -24 -38)"/></g>`;
      } else if (M.d === 'die' || M.d === 'two-dice') {
        const two = M.d === 'two-dice', xs = two ? [112, 248] : [180], size = two ? 82 : 100;
        const vals = (oo) => (!oo ? (two ? [4, 2] : [5]) : two ? [oo.a, oo.b] : [oo.v]);
        const to = vals(o), fromV = vals(S.last);
        xs.forEach((x, i) => {
          let v = to[i], rot = 0, lift = 0, sc = 1;
          if (a) {
            const tt = a.t;
            v = tt < 0.82 ? ((Math.floor(tt * 14) * (3 + i * 2) + i * 2 + fromV[i]) % 6) + 1 : to[i];
            rot = (1 - ease(tt)) * (i ? -420 : 380); lift = Math.abs(Math.sin(tt * Math.PI * 3)) * (1 - tt) * 60;
            sc = 1 + lift / 400;
          }
          out += `<ellipse cx="${x}" cy="186" rx="${(size * 0.5 - lift * 0.2).toFixed(1)}" ry="8" fill="#000" opacity="${(0.32 - lift / 300).toFixed(2)}"/>` + dieSVG(x, 112 - lift, size, v, rot, sc);
        });
      } else if (M.d === 'spinner') {
        const cx = 180, cy = 112, R = 88, rot = a ? lerp(a.r0, a.r1, 1 - Math.pow(1 - a.t, 3)) : S.rot;
        let acc = 0, wedges = '', labels = '';
        const pt = (deg, r) => [cx + r * Math.sin((deg * Math.PI) / 180), cy - r * Math.cos((deg * Math.PI) / 180)];
        M.outs.forEach((s, i) => {
          const span = (s.w / N) * 360, a0 = acc, a1 = acc + span, mid = (a0 + a1) / 2; acc = a1;
          const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R), col = SEGCOL[i % SEGCOL.length];
          wedges += `<path d="M${cx} ${cy}L${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 ${span > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z" fill="${col}" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>`;
          if (span >= 20) {
            const [lx, ly] = pt(mid, R * (span > 70 ? 0.6 : 0.68)), flip = mid > 180 ? mid + 90 : mid - 90;
            labels += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="${span > 60 ? 16 : 13}" font-weight="800" fill="${darkOn(col) ? '#1E293B' : '#fff'}" transform="rotate(${flip.toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})">${esc(t(s.lab))}</text>`;
          }
        });
        out = `<circle cx="${cx}" cy="${cy}" r="${R + 8}" fill="#0F172A" stroke="#FFD23F" stroke-width="3"/>
          <g transform="rotate(${rot.toFixed(2)} ${cx} ${cy})">${wedges}${labels}</g>
          ${Array.from({ length: 16 }, (_, k) => { const [x, y] = pt(k * 22.5, R + 4); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2" fill="#FFD23F"/>`; }).join('')}
          <circle cx="${cx}" cy="${cy}" r="13" fill="#fff" stroke="#1E293B" stroke-width="3"/>
          <path d="M${cx - 11} 6 L${cx + 11} 6 L${cx} 34Z" fill="#FFD23F" stroke="#1E293B" stroke-width="3" stroke-linejoin="round"/>`;
      } else if (M.d === 'bag') {
        let wob = 0, ball = null;
        if (a) {
          wob = Math.sin(a.t * 26) * 4 * (1 - a.t);
          if (a.t < 0.4) { const u = ease(a.t / 0.4); ball = [110, lerp(104, 46, u), lerp(8, 24, u)]; }
          else { const u = ease((a.t - 0.4) / 0.6); ball = [lerp(110, 262, u), lerp(46, 150, u) - Math.sin(u * Math.PI) * 34, lerp(24, 28, u)]; }
        }
        const trayBall = a ? (a.t >= 1 ? a.o : S.last) : S.last;
        out = `<ellipse cx="262" cy="176" rx="52" ry="14" fill="#CBD5E1" stroke="#94A3B8" stroke-width="2"/><ellipse cx="262" cy="172" rx="44" ry="10" fill="#E2E8F0"/>
          ${trayBall && !(ball && a.t < 1) ? ballSVG(262, 150, 28, trayBall.c) : ''}
          ${!trayBall && !ball ? `<text x="262" y="156" text-anchor="middle" font-size="40" font-weight="800" fill="#fff" opacity=".5">?</text>` : ''}
          ${ball ? ballSVG(ball[0], ball[1], ball[2], a.o.c) : ''}
          <g transform="rotate(${wob.toFixed(2)} 110 190)">
            <ellipse cx="110" cy="196" rx="76" ry="10" fill="#000" opacity=".28"/>
            <path d="M66 98C34 134 30 184 56 196H164C190 184 186 134 154 98Z" fill="url(#pb-bag)" stroke="#6B4423" stroke-width="3" stroke-linejoin="round"/>
            <path d="M70 100C84 108 136 108 150 100L156 90C140 80 80 80 64 90Z" fill="#B97F44" stroke="#6B4423" stroke-width="3"/>
            <rect x="82" y="98" width="56" height="9" rx="4.5" fill="#E11D48" stroke="#9F1239" stroke-width="2"/>
            <text x="110" y="168" text-anchor="middle" font-size="46" font-weight="800" fill="#FFF1D6" opacity=".9" font-family="Baloo 2, sans-serif">?</text></g>`;
      } else {
        const hasLast = !!S.last, w = 96, h = 134;
        let moving = '';
        if (a) {
          const e = ease(a.t), x = lerp(84, 244, e), y = 112 - Math.sin(e * Math.PI) * 34, sx = Math.max(Math.abs(Math.cos(e * Math.PI)), 0.04), sc = lerp(0.9, 1, e);
          moving = `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(sx * sc).toFixed(3)} ${sc.toFixed(3)})">${e >= 0.5 ? cardFace(w, h, a.o.r, a.o.s) : cardBack(w, h)}</g>`;
        }
        const rest = !a && hasLast ? `<g transform="translate(244 112)">${cardFace(w, h, S.last.r, S.last.s)}</g>`
          : a && hasLast ? `<g transform="translate(244 112)">${cardFace(w, h, S.last.r, S.last.s)}</g>`
            : !a ? `<g transform="translate(244 112)"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="9" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2.5" stroke-dasharray="7 6"/><text y="14" text-anchor="middle" font-size="44" font-weight="800" fill="#fff" opacity=".5">?</text></g>` : '';
        out = `${[6, 3, 0].map((d) => `<g transform="translate(${84 - d} ${112 - d})">${cardBack(84, 118)}</g>`).join('')}${rest}${moving}`;
      }
      return out;
    }
    function paintStage(a) {
      svg.setAttribute('aria-label', (S.last ? t(T('Last result: ', 'पिछला परिणाम: ')) + t(describe(S.last)) : t(T('Nothing yet. Press the big button.', 'अभी कुछ नहीं। बड़ा बटन दबाओ।'))));
      svg.innerHTML = defs() + stageInner(a);
    }

    // ------------- tiles (the sample space)
    function tileSpec(o) {
      if (M.d === 'coin') return { txt: o.id === 'head' ? t(T('H', 'चित')) : t(T('T', 'पट')), bg: o.id === 'head' ? '#F5B90A' : '#CBD5E1', fg: '#1E293B' };
      if (M.d === 'die') return { txt: String(o.v), bg: '#fff', fg: '#1E293B' };
      if (M.d === 'two-dice') return { txt: `${o.a},${o.b}`, bg: '#fff', fg: '#1E293B' };
      if (M.d === 'spinner') { const c = SEGCOL[o.i % SEGCOL.length]; return { txt: t(o.lab), bg: c, fg: darkOn(c) ? '#1E293B' : '#fff' }; }
      if (M.d === 'bag') return { txt: '', bg: BALLS[o.c].c, fg: '#fff', ball: true };
      const s = SUITS.find((x) => x.id === o.s);
      return { txt: rankSym(o.r) + s.sym, bg: '#fff', fg: s.red ? '#DC2626' : '#1E293B' };
    }
    function paintTiles() {
      let h = '';
      M.outs.forEach((o) => {
        const sp = tileSpec(o), f = EV.test(o);
        for (let k = 0; k < o.w; k++) h += `<span class="pb-tile ${sp.ball ? 'ball' : ''} ${f ? 'fav' : 'dim'}" style="background:${sp.bg};color:${sp.fg}">${esc(sp.txt)}</span>`;
      });
      el('.pb-tiles').innerHTML = h;
    }

    // ------------- recent chips, live line
    function paintRecent() {
      el('.pb-recent').innerHTML = (S.recent.length ? `<span class="pb-lab">${esc(t(T('Latest:', 'ताज़ा:')))}</span>` : `<span class="pb-lab">${esc(t(T('Your results will appear here.', 'तुम्हारे नतीजे यहाँ दिखेंगे।')))}</span>`)
        + S.recent.map((o) => { const c = chipOf(o); return `<span class="pb-chip ${c.ball ? 'ball' : ''}" style="background:${c.bg};color:${c.fg}">${esc(c.txt)}</span>`; }).join('');
    }

    // ------------- charts
    const niceY = (v) => [0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 1].find((x) => x >= v) || 1;
    function paintBars() {
      const W = 340, H = 176, pl = 30, pr = 8, top = 12, bot = 40, ph = H - top - bot, m = M.groups.length;
      const gp = M.groups.map((g) => M.outs.filter((o) => o.g === g.id).reduce((s, o) => s + o.w, 0) / N);
      const fr = M.groups.map((g) => (S.n ? S.gcnt[g.id] / S.n : 0));
      const ymax = niceY(Math.max(Math.max(...gp) * 1.35, Math.max(...fr) * 1.08, 0.1));
      const Y = (v) => top + ph - (v / ymax) * ph;
      const slot = (W - pl - pr) / m, bw = Math.min(36, slot * 0.64);
      let g = `<rect x="0" y="0" width="${W}" height="${H}" rx="12" fill="var(--sunk)"/>`;
      [0, ymax / 2, ymax].forEach((v) => { g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)" stroke-width="1"/><text x="${pl - 4}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--ink-2)">${dec(v)}</text>`; });
      M.groups.forEach((gr, i) => {
        const cx = pl + slot * (i + 0.5), bh = ph - (Y(fr[i]) - top);
        let lab = t(gr.lab); if (lab.length > 7) lab = lab.slice(0, 6) + '…';
        g += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${Y(fr[i]).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(bh, 0).toFixed(1)}" rx="4" fill="${gr.col}" style="transition:none"/>
          <line x1="${(cx - bw / 2 - 4).toFixed(1)}" x2="${(cx + bw / 2 + 4).toFixed(1)}" y1="${Y(gp[i]).toFixed(1)}" y2="${Y(gp[i]).toFixed(1)}" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round"/>
          <text x="${cx.toFixed(1)}" y="${H - 22}" text-anchor="middle" font-size="${m > 8 ? 10 : 11}" font-weight="700" fill="var(--ink)">${esc(lab)}</text>
          <text x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9.5" fill="var(--ink-2)">${S.gcnt[gr.id]}</text>`;
      });
      const desc = M.groups.map((gr, i) => `${t(gr.lab)}: ${S.gcnt[gr.id]}`).join(', ');
      el('.pb-bars').innerHTML = `<svg class="pb-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t(T('Bar chart of results. ', 'नतीजों का स्तंभ-आलेख। ')) + (S.n ? desc : t(T('No results yet.', 'अभी कोई नतीजा नहीं।'))))}">${g}</svg>`;
    }
    function paintTrend() {
      const W = 340, H = 176, pl = 34, pr = 12, top = 14, bot = 30, pw = W - pl - pr, ph = H - top - bot;
      const n = S.hist.length, xmax = [20, 50, 100, 200, 500, 1000, 2000].find((x) => x >= Math.max(n, 20)) || 2000;
      const hmax = n ? Math.max(...S.hist) : 0;
      const ymax = niceY(Math.max(hmax * 1.12, S.solved ? pv * 1.4 : 0, 0.1));
      const X = (i) => pl + (i / xmax) * pw, Y = (v) => top + ph - (Math.min(v, ymax) / ymax) * ph;
      let g = `<rect width="${W}" height="${H}" rx="12" fill="var(--sunk)"/>`;
      [0, ymax / 2, ymax].forEach((v) => { g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)"/><text x="${pl - 4}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--ink-2)">${dec(v)}</text>`; });
      [0, xmax / 2, xmax].forEach((v) => { g += `<text x="${X(v).toFixed(1)}" y="${H - 14}" text-anchor="${v === 0 ? 'start' : v === xmax ? 'end' : 'middle'}" font-size="9.5" fill="var(--ink-2)">${v}</text>`; });
      g += `<text x="${(pl + pw / 2).toFixed(1)}" y="${H - 3}" text-anchor="middle" font-size="9.5" fill="var(--ink-2)">${esc(t(T('number of trials', 'कुल बार')))}</text>`;
      if (S.solved) {
        g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(pv).toFixed(1)}" y2="${Y(pv).toFixed(1)}" stroke="#E11D48" stroke-width="2.5" stroke-dasharray="7 5"/>
          <text x="${W - pr - 2}" y="${(Y(pv) - 5).toFixed(1)}" text-anchor="end" font-size="11" font-weight="800" fill="#E11D48">${P[0]}${P[1] === 1 ? '' : '/' + P[1]} = ${dec(pv)}</text>`;
      } else {
        g += `<text x="${W - pr - 4}" y="${top + 14}" text-anchor="end" font-size="10.5" fill="var(--ink-2)">${esc(t(T('Answer the question to see the theory line', 'सिद्धांत की रेखा देखने के लिए प्रश्न हल करो')))}</text>`;
      }
      if (n) {
        const step = Math.max(1, Math.ceil(n / 280)), pts = [];
        for (let i = 0; i < n; i += step) pts.push(`${X(i + 1).toFixed(1)},${Y(S.hist[i]).toFixed(1)}`);
        if ((n - 1) % step) pts.push(`${X(n).toFixed(1)},${Y(S.hist[n - 1]).toFixed(1)}`);
        g += `<polyline points="${pts.join(' ')}" fill="none" stroke="#2563EB" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${X(n).toFixed(1)}" cy="${Y(S.hist[n - 1]).toFixed(1)}" r="4.5" fill="#2563EB" stroke="#fff" stroke-width="2"/>`;
      } else g += `<text x="${(pl + pw / 2).toFixed(1)}" y="${(top + ph / 2 + 4).toFixed(1)}" text-anchor="middle" font-size="12" fill="var(--ink-2)">${esc(t(T('Start the experiment to draw the line.', 'रेखा बनाने के लिए प्रयोग शुरू करो।')))}</text>`;
      el('.pb-trend').innerHTML = `<svg class="pb-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t(T('Line graph of the experimental probability of your event against the number of trials. ', 'प्रयोग की संख्या के साथ तुम्हारी घटना की प्रायोगिक प्रायिकता का रेखा-आलेख। ')) + (n ? dec(S.hits / n) : ''))}">${g}</svg>`;
      el('.pb-insight').textContent = n >= 30
        ? t(S.solved ? T('See how the wiggles get smaller? With more trials the blue line settles close to the dashed theory line.', 'देखा, उतार-चढ़ाव कम हो रहे हैं? ज़्यादा बार करने पर नीली रेखा सैद्धांतिक रेखा के पास टिक जाती है।') : T('See how the line wiggles less as trials grow? Answer the question to find out where it is heading.', 'देखा, बार बढ़ने पर रेखा कम हिलती है? यह कहाँ जा रही है, जानने के लिए प्रश्न हल करो।'))
        : t(T('Do at least 30 trials to see the line steady down.', 'रेखा को टिकते देखने के लिए कम से कम 30 बार करो।'));
    }
    function paintStats() {
      const ex = S.n ? S.hits / S.n : 0, exF = S.n ? simp(S.hits, S.n) : null;
      let diff = '';
      if (S.solved && S.n) diff = `<span>${esc(t(T('Difference from theory: ', 'सिद्धांत से अंतर: ')))}${dec(Math.abs(ex - pv))}</span>`;
      el('.pb-stats').innerHTML = `
        <div class="pb-stat"><small>${esc(t(T('Trials done', 'कुल बार')))}</small><strong>${S.n}</strong></div>
        <div class="pb-stat"><small>${esc(t(T('Times your event happened', 'घटना कितनी बार हुई')))}</small><strong>${S.hits}</strong></div>
        <div class="pb-stat"><small>${esc(t(T('Experimental probability', 'प्रायोगिक प्रायिकता')))}</small><strong>${S.n ? `${frHTML(S.hits, S.n)} = ${dec(ex)}` : '--'}</strong></div>
        <div class="pb-stat th"><small>${esc(t(T('Theoretical probability', 'सैद्धांतिक प्रायिकता')))}</small><strong>${S.solved ? `${frHTML(P[0], P[1])} = ${dec(pv)}` : '?'}</strong>${diff}</div>`;
    }
    function paintAsk() {
      el('.pb-ev').innerHTML = `${esc(t(T('Your event: ', 'तुम्हारी घटना: ')))}<em>${esc(t(EV.ph))}</em><br>${esc(lang() === 'hi' ? t(EV.ph) + ' की प्रायिकता क्या है?' : 'What is the probability of ' + EV.ph.en + '?')}`;
      el('.pb-opts').setAttribute('aria-label', t(T('Choose the probability', 'प्रायिकता चुनो')));
      el('.pb-opts').innerHTML = S.opts.map((f, i) => `<button type="button" class="pb-opt ${S.solved && i === S.ans ? 'right' : S.wrong.includes(i) ? 'wrong' : ''}" data-i="${i}" aria-disabled="${S.solved || S.wrong.includes(i) ? 'true' : 'false'}" aria-label="${f[0]}${f[1] === 1 ? '' : ' / ' + f[1]}">${frHTML(f[0], f[1])}</button>`).join('');
      const fb = el('.pb-fb');
      if (!S.fb) fb.hidden = true;
      else { fb.hidden = false; fb.className = 'pb-fb ' + S.fb.kind; fb.innerHTML = S.fb.html; }
    }

    // answer options: the right one plus the usual slips (odds instead of probability, the complement, 1 over the number of
    // kinds, 50-50, one more or one fewer favourable outcome), sorted by value so the order gives nothing away.
    function makeOptions() {
      const same = (a, b) => a[0] * b[1] === b[0] * a[1];
      const kinds = M.outs.length, cand = [];
      if (N - fav > 0) cand.push(simp(fav, N - fav));
      cand.push(simp(N - fav, N), simp(1, kinds), [1, 2], simp(fav + 1, N), simp(Math.max(fav - 1, 0), N), simp(fav, N + 1), simp(1, N), [1, 3], [1, 4], [2, 3], [3, 4], [1, 5], [2, 5], [3, 5], [1, 8], [0, 1], [1, 1]);
      const out = [P];
      [true, false].forEach((strict) => cand.forEach((c) => { if (c[1] > 0 && c[0] >= 0 && c[0] <= c[1] && (!strict || (c[0] > 0 && c[0] < c[1])) && out.length < 4 && !out.some((x) => same(x, c))) out.push(c); }));
      out.sort((a, b) => a[0] / a[1] - b[0] / b[1]);
      S.opts = out; S.ans = out.findIndex((x) => same(x, P));
      S.compl = out.findIndex((x) => x[0] * N === (N - fav) * x[1]);
      S.odds = N - fav > 0 ? out.findIndex((x) => x[0] * (N - fav) === fav * x[1]) : -1;
    }
    makeOptions();

    function paintAll() { paintRecent(); paintBars(); paintTrend(); paintStats(); }

    // ------------- doing the experiment
    function addTrial(o) {
      const prev = S.last;
      S.n++; S.gcnt[o.g]++;
      if (EV.test(o)) S.hits++;
      S.hist.push(S.hits / S.n);
      S.recent.unshift(o); if (S.recent.length > 14) S.recent.pop();
      S.last = o;
      return prev;
    }
    function crossed(before) {
      let hit = false;
      [30, 100, 500].forEach((th) => { if (before < th && S.n >= th) hit = true; });
      if (hit) api.emit('trend');
    }
    function setBusy(b) { S.busy = b; btns.forEach((x) => { if (x.dataset.key !== 'reset') x.setAttribute('aria-disabled', b ? 'true' : 'false'); }); }
    function finish(before, summary) {
      setBusy(false); stop = null;
      paintStage(null); paintAll();
      live.textContent = summary;
      api.record(summary);
      api.emit('tossed'); crossed(before);
    }
    const SPEED = { coin: 1250, die: 1000, 'two-dice': 1000, spinner: 2800, bag: 1200, cards: 950 };
    function run(count) {
      if (S.busy) return;
      if (S.n + count > MAXN) { api.toast(T('That is plenty of trials! Press “Start again” to try once more.', 'बहुत बार हो चुका! फिर से करने के लिए “फिर से शुरू” दबाओ।')); return; }
      setBusy(true);
      const before = S.n;
      if (count === 1) {
        const o = sample(), from = S.last ? S.last.id : 'head', r0 = S.rot;
        let r1 = r0;
        if (M.d === 'spinner') {
          let acc = 0;
          for (let i = 0; i < o.i; i++) acc += (M.outs[i].w / N) * 360;
          const span = (o.w / N) * 360, aPt = acc + span * (0.15 + Math.random() * 0.7);
          const need = (((-aPt - r0) % 360) + 360) % 360;
          r1 = r0 + 360 * (4 + Math.floor(Math.random() * 2)) + need;
        }
        stop = tween(SPEED[M.d], (tt) => {
          paintStage({ t: tt, o, from, r0, r1 });
        }, () => {
          S.rot = r1;
          addTrial(o);
          finish(before, `${t(T('Result ', 'परिणाम '))}${S.n}: ${t(describe(o))}. ${t(T('Your event has happened ', 'तुम्हारी घटना '))}${S.hits}${t(T(' of ', ' बार हुई, कुल '))}${S.n}${t(T(' times.', ' में से।'))}`);
        });
        return;
      }
      // many trials at once: the results are drawn and counted as the clock runs
      let done = 0;
      stop = tween(count === 10 ? 1000 : 1700, (tt) => {
        const target = Math.round(tt * count);
        while (done < target) { addTrial(sample()); done++; }
        if (done) { paintStage(null); paintAll(); }
      }, () => {
        while (done < count) { addTrial(sample()); done++; }
        finish(before, `${count}${t(T(' trials done. Your event has happened ', ' बार हो गया। तुम्हारी घटना '))}${S.hits}${t(T(' of ', ' बार हुई, कुल '))}${S.n}${t(T(' times.', ' में से।'))}`);
      });
    }
    function reset() {
      if (stop) { stop(); stop = null; }
      S.n = 0; S.hits = 0; S.hist = []; S.recent = []; S.last = null; S.rot = 0; S.solved = false; S.wrong = []; S.fb = null;
      M.groups.forEach((g) => { S.gcnt[g.id] = 0; });
      setBusy(false); paintStage(null); paintAll(); paintAsk();
      live.textContent = t(T('Everything is cleared. Start again!', 'सब साफ़ हो गया। फिर से शुरू करो!'));
      api.record(t(T('Started the experiment again', 'प्रयोग फिर से शुरू किया')));
      api.emit('reset');
    }
    function answer(i) {
      if (S.solved || S.wrong.includes(i)) return;
      const f = S.opts[i];
      if (i === S.ans) {
        S.solved = true;
        const same = P[0] === fav && P[1] === N;
        const fr = `${frHTML(fav, N)}${same ? '' : ` = ${frHTML(P[0], P[1])}`} = ${dec(pv)}`;
        S.fb = { kind: 'good', html: lang() === 'hi'
          ? `सही! ${N} बराबर संभावना वाले परिणामों में से ${fav} तुम्हारी घटना से मेल खाते हैं। प्रायिकता = ${fr}। अब ऊपर की रेखा देखो: ज़्यादा बार करने पर प्रायोगिक प्रायिकता इसी के पास आती है।`
          : `Correct! ${fav} of the ${N} equally likely outcomes match your event. Probability = ${fr}. Look at the graph: with more trials the experimental probability moves towards this.` };
        api.record(t(T('Answered right: probability ', 'सही उत्तर: प्रायिकता ')) + `${P[0]}/${P[1]}`);
        api.emit('answered:right'); api.celebrate();
      } else {
        S.wrong.push(i);
        let msg;
        if (i === S.compl) msg = T('That is the chance that your event does NOT happen. Count the glowing outcomes instead.', 'यह तो घटना के न होने की संभावना है। चमकते परिणाम गिनो।');
        else if (i === S.odds) msg = T('That compares the glowing outcomes with the others. A probability divides by ALL the outcomes.', 'यह चमकते परिणामों की तुलना बाक़ी से करता है। प्रायिकता में सारे परिणामों से भाग देते हैं।');
        else msg = T('Not quite. Count the glowing outcomes, then divide by the number of all outcomes.', 'ठीक नहीं। चमकते परिणाम गिनो, फिर सारे परिणामों की संख्या से भाग दो।');
        S.fb = { kind: 'bad', html: esc(t(msg)) };
        api.record(t(T('Tried the wrong probability ', 'ग़लत प्रायिकता चुनी ')) + `${f[0]}/${f[1]}`);
        api.emit('answered:wrong');
      }
      paintAsk(); paintTrend(); paintStats();
    }

    // ------------- events
    function onClick(ev) {
      const opt = ev.target.closest('.pb-opt');
      if (opt && root.contains(opt)) {
        if (!api.allowed('answer')) { api.nudge('answer'); return; }
        answer(+opt.dataset.i); return;
      }
      const b = ev.target.closest('.pb-btns button');
      if (!b) return;
      const key = b.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key === 'reset') reset();
      else if (key === 'toss') run(1);
      else if (key === 'toss:10') run(10);
      else if (key === 'toss:100') run(100);
    }
    root.addEventListener('click', onClick);

    paintStage(null); paintTiles(); paintAll(); paintAsk();
    live.textContent = '';
    const fit = () => { const w = root.clientWidth || 800; root.firstElementChild.classList.toggle('wide', w >= 760); };
    fit();
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(fit); ro.observe(root); }
    return { destroy() { if (stop) stop(); if (ro) ro.disconnect(); root.removeEventListener('click', onClick); } };
  }

  NCA_T.register({
    id: 'probability',
    css: CSS,
    validate,
    keys,
    demo: { device: 'two-dice', ask: 'sum-7' },
    mount: mountLab,
  });
})();
