// Template: Clock and calendar. Read an analogue clock, set the hands, work out how much time has passed, use the
// 24-hour clock, and explore a real calendar (true month lengths, leap years, weekdays computed from the date).
// Everything is computed, not scripted: the hour hand moves with the minutes (0.5 degree per minute), the minute hand
// 6 degrees per minute, the weekday of any date comes from the Gregorian rule, February has 29 days only in a leap
// year (divisible by 4, but a century year only if divisible by 400). Config:
//   { mode: 'read' | 'set' | 'elapsed' | 'calendar' | '24h',
//     time?: 'HH:MM'                  read: the time shown (required); set / 24h: where the hands start; elapsed: the start time (required)
//     ask?: 'HH:MM' or minutes        set / 24h: the time to set ('HH:MM'); elapsed: minutes to add (a number, the child sets the end time)
//                                     or an end time 'HH:MM' (the child says how long it took); calendar: a date 1..31 (which weekday?)
//     month?: 1-12, year?: 1900-2100 calendar only (default January 2026) }
(function () {
  const L = window.NCA_LIB;
  const { esc, mixHex } = L;
  const tween = L.tween;
  const T2 = (en, hi) => ({ en, hi });
  const MODES = ['read', 'set', 'elapsed', 'calendar', '24h'];
  const pad = (n) => String(n).padStart(2, '0');
  const mod = (a, n) => ((a % n) + n) % n;
  const parseHM = (s) => { const m = typeof s === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s); return m ? +m[1] * 60 + +m[2] : null; };

  // ---------------------------------------------------------------- calendar facts
  const MONTHS = [
    T2('January', 'जनवरी'), T2('February', 'फ़रवरी'), T2('March', 'मार्च'), T2('April', 'अप्रैल'), T2('May', 'मई'), T2('June', 'जून'),
    T2('July', 'जुलाई'), T2('August', 'अगस्त'), T2('September', 'सितंबर'), T2('October', 'अक्तूबर'), T2('November', 'नवंबर'), T2('December', 'दिसंबर'),
  ];
  const WD = [
    T2('Sunday', 'रविवार'), T2('Monday', 'सोमवार'), T2('Tuesday', 'मंगलवार'), T2('Wednesday', 'बुधवार'), T2('Thursday', 'गुरुवार'), T2('Friday', 'शुक्रवार'), T2('Saturday', 'शनिवार'),
  ];
  const WDS = [T2('Sun', 'रवि'), T2('Mon', 'सोम'), T2('Tue', 'मंगल'), T2('Wed', 'बुध'), T2('Thu', 'गुरु'), T2('Fri', 'शुक्र'), T2('Sat', 'शनि')];
  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysIn = (m, y) => (m === 2 ? (isLeap(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31);
  const dow = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday; the Gregorian rule, built into Date
  const dayOfYear = (y, m, d) => { let n = d; for (let i = 1; i < m; i++) n += daysIn(i, y); return n; };
  const DEFAULT_YEAR = 2026;

  // ---------------------------------------------------------------- time words and formats
  const HN = ['बारह', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस', 'ग्यारह', 'बारह'];
  const h12 = (mins) => { const h = Math.floor(mod(mins, 720) / 60); return h === 0 ? 12 : h; };
  const mm = (mins) => mod(mins, 60);
  const dig12 = (mins) => `${h12(mins)}:${pad(mm(mins))}`;
  const dig24 = (mins) => `${pad(Math.floor(mod(mins, 1440) / 60))}:${pad(mm(mins))}`;
  const isPM = (mins) => mod(mins, 1440) >= 720;
  const ampm = (mins) => (isPM(mins) ? 'PM' : 'AM');
  function period(mins) {
    const h = Math.floor(mod(mins, 1440) / 60);
    if (h >= 5 && h < 12) return T2('morning', 'सुबह');
    if (h >= 12 && h < 16) return T2('afternoon', 'दोपहर');
    if (h >= 16 && h < 19) return T2('evening', 'शाम');
    return T2('night', 'रात');
  }
  // "quarter past 3", "सवा तीन", "10 minutes to 5", "पाँच बजकर 50 मिनट" ...
  function words(mins) {
    const H = h12(mins), M = mm(mins), N = (H % 12) + 1;
    if (M === 0) return T2(`${H} o'clock`, `${HN[H]} बजे`);
    if (M === 15) return T2(`quarter past ${H}`, `सवा ${HN[H]}`);
    if (M === 30) return T2(`half past ${H}`, H === 1 ? 'डेढ़' : H === 2 ? 'ढाई' : `साढ़े ${HN[H]}`);
    if (M === 45) return T2(`quarter to ${N}`, `पौने ${HN[N]}`);
    if (M < 30) return T2(`${M} minute${M === 1 ? '' : 's'} past ${H}`, `${HN[H]} बजकर ${M} मिनट`);
    return T2(`${60 - M} minute${60 - M === 1 ? '' : 's'} to ${N}`, `${HN[H]} बजकर ${M} मिनट`);
  }
  function durText(d) {
    const h = Math.floor(d / 60), m = d % 60;
    const en = [], hi = [];
    if (h) { en.push(`${h} hour${h > 1 ? 's' : ''}`); hi.push(h === 1 ? '1 घंटा' : `${h} घंटे`); }
    if (m) { en.push(`${m} minute${m > 1 ? 's' : ''}`); hi.push(`${m} मिनट`); }
    return T2(en.join(' '), hi.join(' '));
  }
  // events: the 12-hour clock has no AM/PM, so a set time is announced in every spelling a lab author may use.
  function setEvents(mins, is24) {
    if (is24) return ['set:' + dig24(mins)];
    const H = Math.floor(mod(mins, 720) / 60), M = pad(mm(mins));
    return [...new Set([`set:${pad(H === 0 ? 12 : H)}:${M}`, `set:${pad(H)}:${M}`, `set:${pad(H + 12)}:${M}`])];
  }

  // ---------------------------------------------------------------- questions
  function rngOf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const shuffle = (arr, rnd) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const gran = (M) => (M % 5 ? 1 : M % 15 ? 5 : M % 30 ? 15 : M ? 30 : 60);
  const dgran = (d) => (d % 15 === 0 ? 15 : d % 5 === 0 ? 5 : 1);
  const randTime = (g, rnd, span) => Math.floor(rnd() * Math.floor(span / g)) * g;

  // Read: the right time and three tempting wrong ones, each tagged with the mistake that leads to it.
  function readQuestion(t, rnd) {
    t = mod(t, 720);
    const H = Math.floor(t / 60), M = t % 60, cand = [];
    const add = (x, r) => { x = mod(x, 720); if (x !== t && !cand.some((c) => c.t === x)) cand.push({ t: x, r }); };
    if (M % 5 === 0 && !(M / 5 === H)) add((M / 5) * 60 + H * 5, 'swap');
    if (M !== 30 && M !== 0) add(H * 60 + (60 - M), 'mirror');
    add(t + 60, 'hour'); add(t - 60, 'hour');
    const st = M % 5 === 0 ? 5 : 1;
    add(t + st, 'minute'); add(t - st, 'minute'); add(t + 2 * st, 'minute');
    const picked = [];
    const swap = cand.find((c) => c.r === 'swap');
    if (swap) picked.push(swap);
    shuffle(cand.filter((c) => c !== swap), rnd).forEach((c) => { if (picked.length < 3) picked.push(c); });
    const options = shuffle([{ t, r: 'right' }].concat(picked), rnd).map((o) => ({ t: o.t, r: o.r, label: dig12(o.t) }));
    return { type: 'read', mins: t, options };
  }
  function durOptions(d, start, end, rnd) {
    const cand = [];
    const add = (x, r) => { if (x > 0 && x !== d && !cand.some((c) => c.d === x)) cand.push({ d: x, r }); };
    const wrongSub = (Math.floor(mod(end, 1440) / 60) - Math.floor(mod(start, 1440) / 60)) * 60 + Math.abs(mm(end) - mm(start));
    add(mod(wrongSub, 1440), 'borrow');
    [10, 15, 30, 60, 5, 20, 45].forEach((s) => { add(d + s, 'count'); add(d - s, 'count'); });
    const picked = [];
    const b = cand.find((c) => c.r === 'borrow');
    if (b) picked.push(b);
    shuffle(cand.filter((c) => c !== b).slice(0, 8), rnd).forEach((c) => { if (picked.length < 3) picked.push(c); });
    return shuffle([{ d, r: 'right' }].concat(picked), rnd).map((o) => ({ d: o.d, r: o.r, label: durText(o.d) }));
  }

  // ---------------------------------------------------------------- validate / keys
  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
    Object.keys(c).forEach((k) => { if (!['mode', 'time', 'ask', 'month', 'year'].includes(k)) e.push('unknown key: ' + k); });
    if (!MODES.includes(c.mode)) { e.push("mode: one of " + MODES.join(', ')); return e; }
    const has = (k) => c[k] !== undefined && c[k] !== null;
    const hm = (k) => { if (!has(k)) return null; const v = parseHM(c[k]); if (v === null) e.push(`${k}: a time as "HH:MM" (00:00 to 23:59)`); return v; };
    const mode = c.mode;
    if (mode !== 'calendar') {
      if (has('month') || has('year')) e.push('month and year are only for mode "calendar"');
    }
    if (mode === 'read') {
      if (!has('time')) e.push('time: required in mode "read" ("HH:MM")'); else hm('time');
      if (has('ask')) e.push('ask: not used in mode "read" (the question is "what time is it?")');
    } else if (mode === 'set' || mode === '24h') {
      const start = hm('time');
      if (mode === 'set' && !has('ask')) e.push('ask: required in mode "set" (the time to set, "HH:MM")');
      if (has('ask')) {
        if (typeof c.ask !== 'string') e.push(`ask: in mode "${mode}" use a time "HH:MM"`);
        else {
          const target = hm('ask');
          if (target !== null) {
            const st = start === null ? (mode === 'set' ? 0 : 480) : start;
            if (mode === 'set' ? mod(target - st, 720) === 0 : target === st) e.push('ask: equals the starting time, so there is nothing to set (change time or ask)');
          }
        }
      }
    } else if (mode === 'elapsed') {
      const start = has('time') ? hm('time') : (e.push('time: required in mode "elapsed" (the start time)'), null);
      if (!has('ask')) e.push('ask: required in mode "elapsed" (minutes to add, or an end time "HH:MM")');
      else if (typeof c.ask === 'number') {
        if (!Number.isInteger(c.ask) || c.ask < 1 || c.ask > 719) e.push('ask: minutes must be a whole number from 1 to 719');
      } else if (typeof c.ask === 'string') {
        const end = hm('ask');
        if (end !== null && start !== null && end === start) e.push('ask: the end time equals the start time (nothing has passed)');
      } else e.push('ask: minutes (a number) or an end time "HH:MM"');
    } else if (mode === 'calendar') {
      if (has('time')) e.push('time: not used in mode "calendar"');
      let m = 1, y = DEFAULT_YEAR;
      if (has('month')) { if (!Number.isInteger(c.month) || c.month < 1 || c.month > 12) e.push('month: a whole number 1 to 12'); else m = c.month; }
      if (has('year')) { if (!Number.isInteger(c.year) || c.year < 1900 || c.year > 2100) e.push('year: a whole number 1900 to 2100'); else y = c.year; }
      if (has('ask')) {
        if (!Number.isInteger(c.ask) || c.ask < 1) e.push('ask: in mode "calendar" a date, a whole number from 1');
        else if (c.ask > daysIn(m, y)) e.push(`ask: ${MONTHS[m - 1].en} ${y} has only ${daysIn(m, y)} days`);
      }
    }
    return e;
  }
  function keys(c) {
    const mode = c && c.mode;
    const T = ['hand:hour', 'hand:minute'];
    const E = [];
    if (mode === 'read') { T.push('hint', 'answer', 'next'); E.push('answered:right', 'answered:wrong', 'next'); }
    else if (mode === 'set') { T.push('step:*', 'hint', 'answer', 'next'); E.push('set:*', 'answered:right', 'answered:wrong', 'next'); }
    else if (mode === 'elapsed') {
      if (c && typeof c.ask === 'string') { T.push('answer', 'next'); E.push('answered:right', 'answered:wrong', 'next'); }
      else { T.push('step:*', 'hint', 'answer', 'next'); E.push('set:*', 'answered:right', 'answered:wrong', 'next'); }
    } else if (mode === '24h') {
      T.push('step:*', 'hour:*', 'ampm', 'hint'); E.push('set:*');
      if (c && c.ask) { T.push('answer', 'next'); E.push('answered:right', 'answered:wrong', 'next'); }
    } else if (mode === 'calendar') {
      T.length = 0;
      T.push('day:*', 'month:*', 'year:*', 'answer', 'next');
      E.push('day:*', 'month:*', 'year:*', 'answered:right', 'answered:wrong', 'next');
    } else { T.push('answer'); E.push('answered:right', 'answered:wrong'); }
    return { targets: T, events: E };
  }

  // ---------------------------------------------------------------- the clock face (SVG)
  function clockSVG(uid, o) {
    const ticks = [];
    for (let i = 0; i < 60; i++) {
      const a = (i * 6 * Math.PI) / 180, big = i % 5 === 0, r1 = big ? 150 : 158, r2 = 168;
      ticks.push(`<line x1="${(200 + Math.sin(a) * r1).toFixed(1)}" y1="${(200 - Math.cos(a) * r1).toFixed(1)}" x2="${(200 + Math.sin(a) * r2).toFixed(1)}" y2="${(200 - Math.cos(a) * r2).toFixed(1)}" stroke="${big ? '#0F2A43' : '#5B7A99'}" stroke-width="${big ? 4 : 1.6}" stroke-linecap="round"/>`);
    }
    const nums = [], mins = [];
    for (let i = 1; i <= 12; i++) {
      const a = (i * 30 * Math.PI) / 180;
      nums.push(`<text x="${(200 + Math.sin(a) * 122).toFixed(1)}" y="${(200 - Math.cos(a) * 122 + 10).toFixed(1)}" text-anchor="middle" class="cl-num">${i}</text>`);
      mins.push(`<text x="${(200 + Math.sin(a) * 181).toFixed(1)}" y="${(200 - Math.cos(a) * 181 + 5).toFixed(1)}" text-anchor="middle" class="cl-mnum">${i * 5}</text>`);
    }
    const hourShape = 'M200 214 L191 200 L195 100 L200 86 L205 100 L209 200 Z';
    const minShape = 'M200 222 L195 200 L197 62 L200 42 L203 62 L205 200 Z';
    const hand = (name, shape, hit, extra) => `<g class="cl-hand cl-hand-${name}" data-hand="${name}" data-key="hand:${name}" ${extra}>
        <g class="cl-rot cl-rot-${name}" transform="rotate(0 200 200)"><line class="cl-hit" ${hit} stroke="transparent" stroke-linecap="round"/>
        <path class="cl-shape" d="${shape}"/></g></g>`;
    const hr = hand('hour', hourShape, 'x1="200" y1="204" x2="200" y2="110" stroke-width="46"', o.hourAttr);
    const mn = hand('minute', minShape, 'x1="200" y1="150" x2="200" y2="52" stroke-width="34"', o.minAttr);
    return `<svg class="cl-svg" viewBox="0 0 400 400" role="group" aria-label="${esc(o.label)}">
      <defs>
        <radialGradient id="${uid}f" cx="50%" cy="42%" r="62%"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E7F3FD"/></radialGradient>
        <linearGradient id="${uid}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0EA5E9"/><stop offset=".55" stop-color="#0369A1"/><stop offset="1" stop-color="#1D4ED8"/></linearGradient>
        <filter id="${uid}s" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="7" stdDeviation="7" flood-color="#061233" flood-opacity=".28"/></filter>
        <filter id="${uid}h" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="1.5" dy="3" stdDeviation="2" flood-color="#061233" flood-opacity=".35"/></filter>
      </defs>
      <circle cx="200" cy="200" r="194" fill="url(#${uid}r)" filter="url(#${uid}s)"/>
      <circle cx="200" cy="200" r="170" fill="url(#${uid}f)" stroke="#0F2A43" stroke-opacity=".18" stroke-width="2"/>
      <path class="cl-wedge" d="" fill="#02CFF9" fill-opacity=".30"/>
      <g class="cl-minnums" aria-hidden="true">${mins.join('')}</g>
      <g aria-hidden="true">${ticks.join('')}${nums.join('')}</g>
      <g class="cl-ghost" aria-hidden="true" visibility="hidden">
        <g class="cl-grot-hour" transform="rotate(0 200 200)"><path d="${hourShape}" fill="none" stroke="#FF7A1A" stroke-width="3" stroke-dasharray="7 5"/></g>
        <g class="cl-grot-minute" transform="rotate(0 200 200)"><path d="${minShape}" fill="none" stroke="#1D4ED8" stroke-width="3" stroke-dasharray="7 5"/></g>
      </g>
      <g filter="url(#${uid}h)">${hr}${mn}</g>
      <circle cx="200" cy="200" r="13" fill="#0F2A43"/><circle cx="200" cy="200" r="6" fill="#FFD23F"/>
    </svg>`;
  }
  const wedgePath = (deg) => {
    if (deg <= 0.01) return '';
    if (deg >= 359.99) deg = 359.99;
    const a = (deg * Math.PI) / 180, x = 200 + Math.sin(a) * 168, y = 200 - Math.cos(a) * 168;
    return `M200 200 L200 32 A168 168 0 ${deg > 180 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`;
  };

  // ---------------------------------------------------------------- sky strip for the 24-hour clock
  function skySVG(mins) {
    const h = mod(mins, 1440) / 60;
    const KF = [[0, '#0B1B4D'], [5, '#2B2F77'], [6.5, '#FF9E5E'], [8, '#7DD3FC'], [12, '#38BDF8'], [16, '#60A5FA'], [17.8, '#FB923C'], [19.2, '#4338CA'], [21, '#0B1B4D'], [24, '#0B1B4D']];
    let col = KF[0][1];
    for (let i = 0; i < KF.length - 1; i++) if (h >= KF[i][0] && h <= KF[i + 1][0]) col = mixHex(KF[i][1], KF[i + 1][1], (h - KF[i][0]) / (KF[i + 1][0] - KF[i][0]));
    const day = h >= 6 && h < 18;
    const u = day ? (h - 6) / 12 : mod(h - 18, 24) / 12;
    const x = 30 + u * 340, y = 62 - Math.sin(Math.PI * u) * 44;
    const body = day
      ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="17" fill="#FFD23F"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="25" fill="#FFD23F" opacity=".3"/>`
      : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" fill="#F4F1DE"/><circle cx="${(x + 6).toFixed(1)}" cy="${(y - 3).toFixed(1)}" r="12" fill="${col}"/>`;
    const stars = !day ? [[40, 14], [90, 38], [150, 12], [210, 30], [270, 10], [330, 34], [370, 16], [120, 26]].map(([a, b]) => `<circle cx="${a}" cy="${b}" r="1.6" fill="#fff" opacity=".85"/>`).join('') : '';
    return `<svg class="cl-sky" viewBox="0 0 400 80" aria-hidden="true"><rect width="400" height="80" fill="${col}"/>${stars}${body}
      <path d="M0 80 L0 66 Q60 54 120 64 T240 62 T400 60 L400 80 Z" fill="${day ? '#2F9E5B' : '#0F3B33'}"/></svg>`;
  }

  // ---------------------------------------------------------------- CSS
  const CSS = `.cl { --cl-ink: #0F2A43; display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); min-width: 0; }
.cl * { box-sizing: border-box; }
.cl-card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px 14px; color: var(--ink); }
.cl-q { display: flex; align-items: flex-start; gap: 10px; justify-content: space-between; border-left: 6px solid #0369A1; }
.cl-qtext { margin: 0; font: 700 1.08rem/1.35 var(--font-display); color: var(--ink); min-width: 0; }
.cl-qtext small { display: block; font: 500 .88rem/1.4 var(--font-body); color: var(--ink-2); margin-top: 4px; }
.cl-score { flex: none; border-radius: 999px; background: var(--sun-t, #FFF4C2); color: #7A4B00; font: 800 .9rem var(--font-display); padding: 4px 12px; border: 1.5px solid #F5B90A; white-space: nowrap; }
.cl-stage { border-radius: 20px; padding: 14px 10px; background: radial-gradient(circle at 30% 20%, #F2FAFF 0%, #CDE9FB 55%, #A9D6F5 100%); box-shadow: inset 0 0 0 1px rgba(6,18,51,.08); display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; justify-content: center; }
.cl-box { flex: 1 1 240px; max-width: 400px; min-width: 0; text-align: center; }
.cl-box .cl-cap { margin: 4px 0 0; font: 700 1rem var(--font-display); color: var(--cl-ink); }
.cl-box .cl-cap b { font-size: 1.5rem; }
.cl-svg { width: 100%; height: auto; display: block; overflow: visible; }
.cl-num { font: 700 30px var(--font-display); fill: #0F2A43; }
.cl-mnum { font: 800 15px var(--font-display); fill: #fff; }
.cl-minnums { opacity: 0; transition: opacity .25s; }
.cl-hint-on .cl-minnums { opacity: 1; }
.cl-hand .cl-shape { stroke: #061233; stroke-opacity: .55; stroke-width: 1.5; stroke-linejoin: round; }
.cl-hand-hour .cl-shape { fill: #FF7A1A; }
.cl-hand-minute .cl-shape { fill: #1D4ED8; }
.cl-hand { outline: none; }
.cl-hand.cl-live { cursor: grab; touch-action: none; }
.cl-hand.cl-live .cl-hit { touch-action: none; }
.cl-hand.cl-live:active { cursor: grabbing; }
.cl-hand.cl-live:hover .cl-shape { filter: brightness(1.12); }
.cl-hand:focus-visible .cl-shape { stroke: #8B3DFF; stroke-width: 5; stroke-opacity: 1; }
.cl-hand.cl-tapme { cursor: pointer; }
.cl-hand.cl-pulse .cl-shape { animation: cl-pulse 1s ease-in-out 2; }
@keyframes cl-pulse { 50% { filter: brightness(1.35) drop-shadow(0 0 6px #FFD23F); } }
.cl-skywrap { flex: 1 1 100%; max-width: 400px; }
.cl-sky { width: 100%; height: auto; display: block; border-radius: 12px; }
.cl-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.cl-read { display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: baseline; }
.cl-big { font: 800 2.3rem/1 var(--font-display); color: #0369A1; letter-spacing: .02em; }
:root[data-theme="dark"] .cl-big { color: #7DD3FC; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .cl-big { color: #7DD3FC; } }
.cl-sub { font: 600 .95rem var(--font-body); color: var(--ink-2); }
.cl-words { font: 700 1rem var(--font-body); color: var(--ink); }
.cl-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.cl-btn { min-height: 48px; min-width: 44px; border-radius: 14px; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); font: 700 .95rem var(--font-body); cursor: pointer; padding: 6px 10px; transition: transform .12s, box-shadow .15s, border-color .15s, background .15s; display: inline-flex; align-items: center; justify-content: center; gap: 6px; text-align: center; }
.cl-btn:hover { border-color: #0369A1; transform: translateY(-1px); box-shadow: 0 4px 10px rgba(6,18,51,.14); }
.cl-btn:focus-visible { outline: 3px solid #8B3DFF; outline-offset: 2px; }
.cl-btn:disabled { opacity: .5; cursor: default; transform: none; box-shadow: none; }
.cl-btn.hr { border-color: #FF7A1A; }
.cl-btn.mn { border-color: #2563EB; }
.cl-btn.main { background: #0369A1; border-color: #0369A1; color: #fff; font-size: 1.05rem; box-shadow: 0 4px 12px rgba(3,105,161,.35); }
.cl-btn.main:disabled { background: var(--sunk); color: var(--ink-2); border-color: var(--line); box-shadow: none; opacity: 1; }
.cl-btn.ghost { background: transparent; }
.cl-btn[aria-pressed="true"] { background: #0369A1; color: #fff; border-color: #0369A1; }
.cl-row { display: flex; flex-wrap: wrap; gap: 8px; }
.cl-row > .cl-btn { flex: 1 1 120px; }
.cl-opts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.cl-opt { min-height: 60px; font: 800 1.35rem var(--font-display); }
.cl-opt.t { font: 700 1rem var(--font-body); }
.cl-opt.right, .cl-opt.wrong { opacity: 1 !important; }
.cl-opt.right { background: var(--good); border-color: var(--good); color: #fff; }
.cl-opt.wrong { background: var(--bad-t, #FDE2E0); border-color: var(--bad); color: var(--ink); text-decoration: line-through; }
:root[data-theme="dark"] .cl-opt.right { color: #08201D; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .cl-opt.right { color: #08201D; } }
.cl-fb { min-height: 52px; border-radius: 14px; padding: 10px 14px; background: var(--sunk); color: var(--ink); font: 600 .95rem/1.45 var(--font-body); border: 1px dashed var(--line); }
.cl-fb.good { background: var(--good-t, #DDF5EA); border: 1.5px solid var(--good); }
.cl-fb.bad { background: var(--bad-t, #FDE2E0); border: 1.5px solid var(--bad); }
.cl-fb p { margin: 0; }
.cl-count { border-radius: 14px; padding: 8px 12px; background: var(--sunk); border: 1px solid var(--line); font: 700 .95rem var(--font-body); color: var(--ink); }
.cl-count b { color: #0369A1; font-family: var(--font-display); font-size: 1.15rem; }
:root[data-theme="dark"] .cl-count b { color: #7DD3FC; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .cl-count b { color: #7DD3FC; } }
.cl-arrow { font: 800 1.6rem var(--font-display); color: #0369A1; align-self: center; }
.cl-strip { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 4px; }
.cl-hr { min-height: 44px; border-radius: 10px; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.05; padding: 2px; font-family: var(--font-body); }
.cl-hr b { font: 800 1rem var(--font-display); }
.cl-hr span { font-size: .7rem; font-weight: 700; color: var(--ink-2); }
.cl-hr.night { background: #E4E7F7; }
.cl-hr.day { background: #FFF6D1; }
:root[data-theme="dark"] .cl-hr.night { background: #1B2250; }
:root[data-theme="dark"] .cl-hr.day { background: #4A3A10; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .cl-hr.night { background: #1B2250; } :root:not([data-theme="light"]) .cl-hr.day { background: #4A3A10; } }
.cl-hr.on { border-color: #0369A1; box-shadow: 0 0 0 3px rgba(3,105,161,.35); }
.cl-hr:focus-visible { outline: 3px solid #8B3DFF; outline-offset: 1px; }
/* calendar */
.cl-months { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.cl-mo { min-height: 52px; border-radius: 12px; border: 1.5px solid transparent; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; font: 700 .82rem/1.1 var(--font-body); color: #1E293B; padding: 3px 2px; }
.cl-mo small { font: 800 .72rem var(--font-display); opacity: .85; }
.cl-mo.d31 { background: #BFD4FF; } .cl-mo.d30 { background: #A5F3FC; } .cl-mo.dfeb { background: #FFC9BF; }
.cl-mo[aria-pressed="true"] { border-color: #061233; box-shadow: 0 0 0 3px rgba(6,18,51,.28); transform: translateY(-2px); }
.cl-mo:focus-visible { outline: 3px solid #8B3DFF; outline-offset: 1px; }
.cl-legend { display: flex; flex-wrap: wrap; gap: 6px 12px; font: 600 .8rem var(--font-body); color: var(--ink-2); }
.cl-legend i { display: inline-block; width: 12px; height: 12px; border-radius: 4px; vertical-align: -1px; margin-right: 4px; }
.cl-yr { display: flex; align-items: center; justify-content: center; gap: 10px; }
.cl-yr .cl-btn { flex: none; width: 48px; }
.cl-ytitle { font: 800 1.35rem var(--font-display); color: var(--ink); text-align: center; min-width: 0; }
.cl-ytitle small { display: block; font: 700 .82rem var(--font-body); color: var(--ink-2); }
.cl-leap { color: #0F766E !important; }
.cl-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.cl-wdh { text-align: center; font: 800 .8rem var(--font-display); color: var(--ink-2); padding: 4px 0; }
.cl-wdh.sun { color: #C0392B; }
.cl-day { min-height: 46px; border-radius: 12px; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); font: 700 1.05rem var(--font-display); cursor: pointer; padding: 0; transition: transform .12s, background .15s; }
.cl-day.sun { color: #C0392B; background: #FFF1EE; }
:root[data-theme="dark"] .cl-day.sun { background: #3A1F1B; color: #FF9A8B; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .cl-day.sun { background: #3A1F1B; color: #FF9A8B; } }
.cl-day:hover { transform: translateY(-1px); border-color: #0369A1; }
.cl-day[aria-pressed="true"] { background: #1D4ED8; border-color: #1D4ED8; color: #fff; box-shadow: 0 4px 10px rgba(29,78,216,.4); }
.cl-day.ask { outline: 3px solid #FF7A1A; outline-offset: 1px; animation: cl-ring 1.4s ease-in-out infinite; }
@keyframes cl-ring { 50% { outline-color: #FFD23F; } }
.cl-day:focus-visible { outline: 3px solid #8B3DFF; outline-offset: 2px; }
.cl-blank { min-height: 46px; }
@media (prefers-reduced-motion: reduce) { .cl-day.ask, .cl-hand.cl-pulse .cl-shape { animation: none; } .cl-btn, .cl-day, .cl-minnums { transition: none; } }
.cl.cl-wide { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); align-items: start; }
.cl.cl-wide .cl-q { grid-column: 1 / -1; }
.cl.cl-wide .cl-strip { grid-template-columns: repeat(12, minmax(0, 1fr)); }
.cl.cl-wide .cl-months { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.cl.cl-wide .cl-opts.four { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.cl.cl-wide.cl-calendar { grid-template-columns: minmax(0, 1fr); }
.cl.cl-wide.cl-calendar .cl-calwrap { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.cl-calwrap { display: flex; flex-direction: column; gap: 10px; }`;

  // ---------------------------------------------------------------- mount
  let UID = 0;
  function mount(root, cfg, api) {
    const t = (x) => api.t(x);
    const lang = () => (api.lang ? api.lang() : 'en');
    const mode = cfg.mode;
    const uid = 'clk' + ++UID;
    const seedBase = (JSON.stringify(cfg).split('').reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7)) >>> 0;
    let qn = 0;
    const rnd = rngOf(seedBase);
    const startCfg = cfg.time ? parseHM(cfg.time) : null;
    const S = { mins: 0, vis: 0, q: null, picked: new Set(), solved: false, wrongN: 0, score: 0, hint: false, fb: null, tip: null, m: 1, y: DEFAULT_YEAR, sel: null, drag: null, dragPrev: 0, changed: false };
    const stops = [];
    let ro = null;

    // ---- question setup
    function makeQuestion(first) {
      qn++;
      S.picked = new Set(); S.solved = false; S.wrongN = 0; S.fb = null; S.tip = null;
      if (mode === 'read') {
        let tm = startCfg;
        if (!first) { const g = gran(mm(startCfg)); do { tm = randTime(g, rnd, 720); } while (tm === S.q.mins); }
        S.q = readQuestion(tm, rnd); S.mins = S.vis = S.q.mins;
      } else if (mode === 'set') {
        const st = startCfg == null ? 0 : startCfg;
        let target = parseHM(cfg.ask);
        if (!first) { const g = gran(mm(parseHM(cfg.ask))); do { target = randTime(g, rnd, 720); } while (mod(target - st, 720) === 0 || target === S.q.target); }
        S.q = { type: 'set', target, start: st }; S.mins = S.vis = st;
      } else if (mode === '24h') {
        const st = startCfg == null ? 480 : startCfg;
        S.mins = S.vis = st;
        if (cfg.ask) {
          let target = parseHM(cfg.ask);
          if (!first) { const g = gran(mm(target)); do { target = randTime(g, rnd, 1440); } while (target === st || target === S.q.target); }
          S.q = { type: 'set', target, start: st, exact: true };
        } else S.q = null;
      } else if (mode === 'elapsed') {
        let start = startCfg;
        if (typeof cfg.ask === 'string') {
          let end = parseHM(cfg.ask);
          if (!first) { const g = gran(mm(start)); start = randTime(g, rnd, 720); const dd = dgran(mod(end - startCfg, 1440)); end = start + dd * (1 + Math.floor(rnd() * Math.max(1, Math.floor(180 / dd)))); }
          const d = mod(end - start, 1440);
          S.q = { type: 'dur', start, end: mod(end, 1440), dur: d, options: durOptions(d, start, end, rnd) };
          S.mins = S.vis = start;
        } else {
          let dur = cfg.ask;
          if (!first) { const g = gran(mm(startCfg)); start = randTime(g, rnd, 720); const dd = dgran(cfg.ask); dur = dd * (1 + Math.floor(rnd() * Math.max(1, Math.floor(180 / dd)))); }
          S.q = { type: 'set', start, dur, target: mod(start + dur, 1440) }; S.mins = S.vis = start;
        }
      } else {
        // calendar
        if (first) { S.m = cfg.month || 1; S.y = cfg.year || DEFAULT_YEAR; S.q = { m: S.m, y: S.y, d: cfg.ask || null }; }
        else { const m = 1 + Math.floor(rnd() * 12); S.q = { m, y: S.y, d: cfg.ask ? 1 + Math.floor(rnd() * daysIn(m, S.y)) : null }; S.m = m; }
        S.sel = null;
        if (S.q.d) {
          const w = dow(S.q.y, S.q.m, S.q.d);
          S.q.ans = w; // all seven weekdays are offered
        } else {
          S.q.ans = daysIn(S.q.m, S.q.y);
        }
      }
    }

    // ---- common bits of HTML
    const tx = (x) => esc(t(x));
    const btn = (key, cls, label, extra) => `<button type="button" class="cl-btn ${cls || ''}" data-key="${key}" ${extra || ''}>${label}</button>`;
    const scoreChip = () => (S.score ? `<span class="cl-score" aria-label="${esc(t(T2('Right answers', 'सही उत्तर')))}">★ ${S.score}</span>` : '');
    const isSetMode = () => S.q && S.q.type === 'set';

    function promptHTML() {
      const q = S.q;
      if (mode === 'read') return `<p class="cl-qtext">${tx(T2('What time does the clock show?', 'घड़ी में कितना समय हुआ है?'))}<small>${tx(T2('Look at the short hour hand first, then the long minute hand.', 'पहले छोटी घंटे की सुई देखो, फिर लंबी मिनट की सुई।'))}</small></p>`;
      if (mode === 'set') {
        return `<p class="cl-qtext">${tx(T2(`Set the clock to ${dig12(q.target)}`, `घड़ी में ${dig12(q.target)} लगाओ`))}<small>${tx(words(q.target))}. ${tx(T2('Drag the hands, or use the buttons.', 'सुइयों को खींचो या बटन दबाओ।'))}</small></p>`;
      }
      if (mode === '24h') {
        if (!q) return `<p class="cl-qtext">${tx(T2('Move the hands and watch the sun and the 24-hour time.', 'सुइयाँ चलाओ और सूरज व 24-घंटे वाला समय देखो।'))}<small>${tx(T2('After noon the 24-hour clock goes on: 13:00 is 1 PM.', 'दोपहर के बाद 24-घंटे की घड़ी आगे चलती है: 13:00 यानी 1 PM।'))}</small></p>`;
        return `<p class="cl-qtext">${tx(T2(`Set the clock to ${dig24(q.target)} (24-hour time)`, `घड़ी में 24-घंटे का समय ${dig24(q.target)} लगाओ`))}<small>${tx(T2('Think: is it before noon (AM) or after noon (PM)?', 'सोचो: दोपहर से पहले (AM) है या बाद (PM)?'))}</small></p>`;
      }
      if (mode === 'elapsed') {
        if (q.type === 'dur') return `<p class="cl-qtext">${tx(T2(`How much time passed from ${dig12(q.start)} to ${dig12(q.end)}?`, `${dig12(q.start)} से ${dig12(q.end)} तक कितना समय बीता?`))}<small>${tx(T2('Count on from the start clock to the end clock.', 'शुरू की घड़ी से अंत की घड़ी तक गिनो।'))}</small></p>`;
        return `<p class="cl-qtext">${tx(T2(`It starts at ${dig12(q.start)} ${ampm(q.start)}. What time is it after ${durText(q.dur).en}?`, `शुरू: ${dig12(q.start)} ${ampm(q.start)}। ${durText(q.dur).hi} बाद कितना समय होगा?`))}<small>${tx(T2('Move the clock forward to the end time.', 'घड़ी को आगे बढ़ाकर अंत का समय लगाओ।'))}</small></p>`;
      }
      return '';
    }

    function clockBox(role, mins, interactive, capKey) {
      const lab = t(role === 'start' ? T2('Start clock', 'शुरू की घड़ी') : role === 'end' ? T2('End clock', 'अंत की घड़ी') : T2('Analogue clock', 'सुई वाली घड़ी'));
      const live = interactive ? 'role="slider" tabindex="0" aria-orientation="horizontal"' : 'role="button" tabindex="0"';
      const svg = clockSVG(uid + role, {
        label: lab,
        hourAttr: `${live} data-role="${role}" aria-label="${esc(t(T2('Hour hand', 'घंटे की सुई')))}"`,
        minAttr: `${live} data-role="${role}" aria-label="${esc(t(T2('Minute hand', 'मिनट की सुई')))}"`,
      });
      return `<div class="cl-box" data-box="${role}" data-interactive="${interactive ? 1 : 0}">${svg}${capKey ? `<p class="cl-cap" data-cap="${role}"></p>` : ''}</div>`;
    }

    // ---- build the whole page for the current question
    function build() {
      const q = S.q;
      root.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = `cl cl-${mode === '24h' ? 'h24' : mode}${root.clientWidth >= 700 ? ' cl-wide' : ''}`;
      root.appendChild(wrap);
      S.wrap = wrap;
      if (mode === 'calendar') return buildCalendar(wrap);
      const interactiveClock = mode === 'set' || mode === '24h' || (mode === 'elapsed' && q.type === 'set');
      let stage = '';
      if (mode === 'elapsed' && q.type === 'dur') {
        stage = clockBox('start', q.start, false, true) + '<div class="cl-arrow" aria-hidden="true">➜</div>' + clockBox('end', q.end, false, true);
      } else if (mode === 'elapsed') {
        stage = clockBox('main', S.mins, true, false);
      } else {
        stage = clockBox('main', S.mins, interactiveClock, false);
      }
      const sky = mode === '24h' ? `<div class="cl-skywrap" data-sky></div>` : '';
      let side = '';
      if (mode === 'read') {
        side = `<div class="cl-card cl-opts-card"><div class="cl-opts" role="group" aria-label="${esc(t(T2('Choose the time', 'समय चुनो')))}">${q.options.map((o, i) => `<button type="button" class="cl-btn cl-opt" data-key="answer" data-i="${i}">${esc(o.label)}</button>`).join('')}</div></div>`;
      } else if (mode === 'elapsed' && q.type === 'dur') {
        side = `<div class="cl-card"><div class="cl-opts t" role="group" aria-label="${esc(t(T2('Choose how long', 'कितना समय, चुनो')))}">${q.options.map((o, i) => `<button type="button" class="cl-btn cl-opt t" data-key="answer" data-i="${i}">${tx(o.label)}</button>`).join('')}</div></div>`;
      } else {
        const stepRow = `<div class="cl-steps" role="group" aria-label="${esc(t(T2('Move the hands', 'सुइयाँ चलाओ')))}">
          ${btn('step:hour-1', 'hr', `− ${tx(T2('1 hour', '1 घंटा'))}`)}${btn('step:min-5', 'mn', `− ${tx(T2('5 min', '5 मिनट'))}`)}${btn('step:min-1', 'mn', `− ${tx(T2('1 min', '1 मिनट'))}`)}
          ${btn('step:hour+1', 'hr', `+ ${tx(T2('1 hour', '1 घंटा'))}`)}${btn('step:min+5', 'mn', `+ ${tx(T2('5 min', '5 मिनट'))}`)}${btn('step:min+1', 'mn', `+ ${tx(T2('1 min', '1 मिनट'))}`)}</div>`;
        const strip = mode === '24h' ? `<div class="cl-strip" role="group" aria-label="${esc(t(T2('Pick an hour of the day', 'दिन का एक घंटा चुनो')))}">${Array.from({ length: 24 }, (_, h) => {
          const p12 = h % 12 === 0 ? 12 : h % 12;
          return `<button type="button" class="cl-hr ${h >= 6 && h < 18 ? 'day' : 'night'}" data-key="hour:${h}" data-h="${h}" aria-pressed="false" aria-label="${pad(h)}:00, ${p12} ${h < 12 ? 'AM' : 'PM'}"><b>${pad(h)}</b><span>${p12} ${h < 12 ? 'AM' : 'PM'}</span></button>`;
        }).join('')}</div>` : '';
        side = `<div class="cl-card cl-readout" data-readout></div>
          ${mode === 'elapsed' ? '<div class="cl-count" data-count></div>' : ''}
          ${stepRow}${mode === '24h' ? `<div class="cl-row">${btn('ampm', '', '', 'data-ampm')}</div>` : ''}${strip}
          ${q ? `<div class="cl-row">${btn('answer', 'main', tx(T2('Check my clock', 'मेरी घड़ी जाँचो')))}</div>` : ''}`;
      }
      const hintBtn = mode === 'elapsed' && q.type === 'dur' ? '' : btn('hint', 'ghost', '', 'data-hintbtn aria-pressed="false"');
      const nextRow = `<div class="cl-row" data-nextrow>${hintBtn}${q ? btn('next', 'ghost', tx(T2('New question', 'नया सवाल'))) : ''}</div>`;
      wrap.innerHTML = `<div class="cl-card cl-q" data-qcard></div>
        <div class="cl-stagecol"><div class="cl-stage">${stage}${sky}</div></div>
        <div class="cl-side">${side}<div class="cl-fb" data-fb aria-live="polite"></div>${nextRow}</div>`;
      refresh();
    }

    // ---- update what changes while the child plays
    const q$ = (s) => (S.wrap ? S.wrap.querySelector(s) : null);
    function setRot(g, deg) { if (g) g.setAttribute('transform', `rotate(${deg.toFixed(2)} 200 200)`); }
    function paintClock(box, mins, ghostMins) {
      const hourA = 0.5 * mod(mins, 720), minA = 6 * mod(mins, 60);
      setRot(box.querySelector('.cl-rot-hour'), hourA);
      setRot(box.querySelector('.cl-rot-minute'), minA);
      const w = box.querySelector('.cl-wedge'); if (w) w.setAttribute('d', wedgePath(minA));
      const gh = box.querySelector('.cl-ghost');
      if (gh) {
        if (ghostMins == null) gh.setAttribute('visibility', 'hidden');
        else { gh.setAttribute('visibility', 'visible'); setRot(box.querySelector('.cl-grot-hour'), 0.5 * mod(ghostMins, 720)); setRot(box.querySelector('.cl-grot-minute'), 6 * mod(ghostMins, 60)); }
      }
    }
    function paintHands() {
      if (!S.wrap) return;
      const q = S.q;
      S.wrap.querySelectorAll('.cl-box').forEach((box) => {
        const role = box.dataset.box;
        const m = role === 'start' ? q.start : role === 'end' ? q.end : S.vis;
        const ghost = role === 'main' && q && q.type === 'set' && S.wrongN >= 2 && !S.solved ? q.target : null;
        paintClock(box, m, ghost);
      });
      const sky = q$('[data-sky]'); if (sky) sky.innerHTML = skySVG(S.vis);
    }
    function refresh() {
      if (!S.wrap) return;
      const q = S.q;
      S.wrap.classList.toggle('cl-hint-on', S.hint);
      const qc = q$('[data-qcard]');
      if (qc) qc.innerHTML = promptHTML() + (q ? scoreChip() : '');
      if (mode === 'elapsed' && q.type === 'dur') {
        const caps = { start: q.start, end: q.end };
        Object.keys(caps).forEach((r) => { const c = S.wrap.querySelector(`[data-cap="${r}"]`); if (c) c.innerHTML = `${esc(t(r === 'start' ? T2('Start', 'शुरू') : T2('End', 'अंत')))}: <b>${dig12(caps[r])}</b> ${ampm(caps[r])}`; });
      }
      const hb = q$('[data-hintbtn]');
      if (hb) { hb.setAttribute('aria-pressed', S.hint ? 'true' : 'false'); hb.textContent = t(S.hint ? T2('Hide minute numbers', 'मिनट के अंक छिपाओ') : T2('Show minute numbers', 'मिनट के अंक दिखाओ')); }
      // interactive hands
      const live = mode === 'set' || mode === '24h' || (mode === 'elapsed' && q.type === 'set');
      S.wrap.querySelectorAll('.cl-hand').forEach((h) => {
        const isLive = live && h.closest('.cl-box').dataset.interactive === '1';
        h.classList.toggle('cl-live', isLive);
        h.classList.toggle('cl-tapme', !isLive);
        const minute = h.dataset.hand === 'minute';
        const role = h.closest('.cl-box').dataset.box;
        const m = role === 'start' ? q.start : role === 'end' ? q.end : S.mins;
        if (isLive) {
          h.setAttribute('role', 'slider');
          h.setAttribute('aria-valuemin', '0');
          h.setAttribute('aria-valuemax', minute ? '59' : '11');
          h.setAttribute('aria-valuenow', String(minute ? mm(m) : Math.floor(mod(m, 720) / 60)));
          h.setAttribute('aria-valuetext', (mode === '24h' ? dig24(m) : dig12(m)));
        } else { h.setAttribute('role', 'button'); h.removeAttribute('aria-valuenow'); h.removeAttribute('aria-valuemin'); h.removeAttribute('aria-valuemax'); }
      });
      // readout (set / 24h / elapsed-set)
      const ro$ = q$('[data-readout]');
      if (ro$) {
        const m = S.mins;
        if (mode === '24h') {
          ro$.innerHTML = `<div class="cl-read"><span class="cl-big">${dig24(m)}</span><span class="cl-sub">${esc(t(T2('24-hour time', '24-घंटे का समय')))}</span></div>
            <div class="cl-read"><span class="cl-words">${dig12(m)} ${ampm(m)}</span><span class="cl-sub">${tx(period(m))} · ${tx(words(m))}</span></div>
            <p class="cl-sub" style="margin:6px 0 0">${tx(isPM(m) && Math.floor(mod(m, 1440) / 60) !== 12 ? T2(`${Math.floor(m / 60) % 12 || 12} PM + 12 = ${Math.floor(mod(m, 1440) / 60)}`, `${Math.floor(m / 60) % 12 || 12} PM + 12 = ${Math.floor(mod(m, 1440) / 60)}`) : T2('Before 1 PM the hour number is the same on both clocks (12 AM is 00).', '1 PM से पहले दोनों घड़ियों में घंटे का अंक वही रहता है (12 AM यानी 00)।'))}</p>`;
        } else {
          ro$.innerHTML = `<div class="cl-read"><span class="cl-big">${dig12(m)}</span><span class="cl-sub">${esc(t(T2('Your clock', 'तुम्हारी घड़ी')))}</span></div><div class="cl-words">${tx(words(m))}</div>`;
        }
      }
      const ap = q$('[data-ampm]'); if (ap) ap.textContent = t(isPM(S.mins) ? T2('Now PM (after noon): switch to AM', 'अभी PM (दोपहर बाद): AM करो') : T2('Now AM (before noon): switch to PM', 'अभी AM (दोपहर से पहले): PM करो'));
      S.wrap.querySelectorAll('.cl-hr').forEach((b) => b.setAttribute('aria-pressed', String(Math.floor(mod(S.mins, 1440) / 60) === +b.dataset.h)));
      S.wrap.querySelectorAll('.cl-hr').forEach((b) => b.classList.toggle('on', Math.floor(mod(S.mins, 1440) / 60) === +b.dataset.h));
      const cnt = q$('[data-count]');
      if (cnt && q.type === 'set' && q.dur != null) {
        const passed = mod(S.mins - q.start, 720);
        cnt.innerHTML = `${esc(t(T2('Time passed on your clock:', 'तुम्हारी घड़ी में बीता समय:')))} <b>${passed ? esc(t(durText(passed))) : esc(t(T2('0 minutes', '0 मिनट')))}</b> ${esc(t(T2('of', 'में से')))} <b>${esc(t(durText(q.dur)))}</b>`;
      }
      // answer buttons
      const ab = q$('.cl-btn.main[data-key="answer"]'); if (ab) ab.disabled = S.solved;
      S.wrap.querySelectorAll('.cl-opt').forEach((b) => {
        const i = +b.dataset.i;
        b.classList.toggle('right', S.solved && q.options[i].r === 'right');
        b.classList.toggle('wrong', S.picked.has(i) && q.options[i].r !== 'right');
        b.disabled = S.solved || S.picked.has(i);
        b.setAttribute('aria-pressed', String(S.picked.has(i)));
      });
      const fb = q$('[data-fb]');
      if (fb) {
        fb.className = 'cl-fb' + (S.fb ? (S.fb.good ? ' good' : ' bad') : '');
        fb.innerHTML = S.fb ? `<p>${esc(t(S.fb.text))}</p>` : (S.tip ? `<p>${esc(t(S.tip))}</p>` : `<p>${esc(t(defaultHint()))}</p>`);
      }
      paintHands();
    }
    function defaultHint() {
      if (mode === 'read') return T2('Tap an answer. Tap a hand to learn what it shows.', 'एक उत्तर चुनो। सुई पर टैप करो, पता चलेगा वह क्या बताती है।');
      if (mode === 'elapsed' && S.q.type === 'dur') return T2('Tap the answer you think is right.', 'जो उत्तर सही लगे उसे टैप करो।');
      if (mode === '24h' && !S.q) return T2('Drag a hand, or tap an hour below.', 'सुई खींचो या नीचे से कोई घंटा चुनो।');
      return T2('Drag the hands (or use the buttons), then check.', 'सुइयाँ खींचो (या बटन दबाओ), फिर जाँचो।');
    }

    // ---- clock changes
    function afterChange(announce) {
      refresh();
      if (announce) setEvents(S.mins, mode === '24h').forEach((e) => api.emit(e));
    }
    function moveTo(newMins, animate, announce) {
      newMins = mod(newMins, 1440);
      const from = S.vis;
      const delta = mod(newMins - from + 720, 1440) - 720;
      S.mins = newMins;
      if (animate && delta !== 0) {
        if (S.tw) S.tw();
        S.tw = tween(260, (k) => { const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; S.vis = mod(from + delta * e, 1440); paintHands(); }, () => { S.vis = S.mins; paintHands(); });
        stops.push(S.tw);
      } else { S.vis = S.mins; }
      if (S.q) { /* a changed clock clears old feedback only when the child tries again */ }
      afterChange(announce);
    }
    function stepBy(key) {
      const m = /^step:(hour|min)([+-]\d+)$/.exec(key);
      if (!m) return;
      const d = +m[2] * (m[1] === 'hour' ? 60 : 1);
      moveTo(S.mins + d, true, true);
    }
    const angleOf = (ev, svg) => {
      const r = svg.getBoundingClientRect();
      const a = (Math.atan2(ev.clientX - (r.left + r.width / 2), -(ev.clientY - (r.top + r.height / 2))) * 180) / Math.PI;
      return mod(a, 360);
    };
    function onDragMove(ev) {
      if (!S.drag) return;
      const svg = S.drag.svg, ang = angleOf(ev, svg);
      if (S.drag.hand === 'minute') {
        const m = Math.round(ang / 6) % 60, prev = mm(S.mins);
        let d = m - prev;
        if (d < -30) d += 60; else if (d > 30) d -= 60;
        if (d !== 0) { S.mins = mod(S.mins + d, 1440); S.vis = S.mins; S.changed = true; }
      } else {
        const curMin = mm(S.mins), h = mod(Math.round((ang - 0.5 * curMin) / 30), 12), half = Math.floor(mod(S.mins, 1440) / 720);
        const nm = half * 720 + h * 60 + curMin;
        if (nm !== S.mins) { S.mins = nm; S.vis = nm; S.changed = true; }
      }
      refresh();
    }
    function endDrag() {
      if (!S.drag) return;
      S.drag = null;
      if (S.changed) { S.changed = false; setEvents(S.mins, mode === '24h').forEach((e) => api.emit(e)); api.record(t(T2('Set the clock to ', 'घड़ी में लगाया: ')) + dig12(S.mins)); }
    }

    // ---- answers
    function rightFeedback() {
      S.solved = true; S.score++;
      api.emit('answered:right'); api.celebrate();
      return true;
    }
    function checkSet() {
      const q = S.q;
      if (S.solved) return;
      const ok = q.exact ? S.mins === q.target : mod(S.mins - q.target, 720) === 0;
      api.record(t(T2('Checked the clock: ', 'घड़ी जाँची: ')) + (mode === '24h' ? dig24(S.mins) : dig12(S.mins)) + ' ' + (ok ? '✓' : '✗'));
      if (ok) {
        rightFeedback();
        let text;
        if (mode === '24h') text = T2(`Yes! ${dig24(q.target)} is ${dig12(q.target)} ${ampm(q.target)}. ${isPM(q.target) && Math.floor(q.target / 60) !== 12 ? 'After noon, add 12 to the PM hour.' : 'Before noon the hour is the same on both clocks.'}`, `सही! ${dig24(q.target)} यानी ${dig12(q.target)} ${ampm(q.target)}। ${isPM(q.target) && Math.floor(q.target / 60) !== 12 ? 'दोपहर के बाद PM वाले घंटे में 12 जोड़ते हैं।' : 'दोपहर से पहले दोनों घड़ियों में घंटा वही रहता है।'}`);
        else if (q.dur != null) text = T2(`Yes! ${dig12(q.start)} plus ${durText(q.dur).en} is ${dig12(q.target)}.`, `सही! ${dig12(q.start)} में ${durText(q.dur).hi} जोड़ने पर ${dig12(q.target)} होता है।`);
        else text = T2(`Yes! That is ${words(q.target).en}.`, `सही! यह ${words(q.target).hi} है।`);
        S.fb = { good: true, text };
      } else {
        S.wrongN++;
        api.emit('answered:wrong');
        const hourBad = (mod(S.mins, 720) / 60 | 0) !== (mod(q.target, 720) / 60 | 0), minBad = mm(S.mins) !== mm(q.target);
        const tH = h12(q.target), tM = mm(q.target);
        let text;
        if (minBad && !hourBad) text = T2(`The hour is right. Check the long minute hand: ${tM} minutes means counting ${tM % 5 === 0 ? 'to the number ' + tM / 5 : 'past the number ' + Math.floor(tM / 5)}.`, `घंटा सही है। लंबी मिनट की सुई देखो: ${tM} मिनट के लिए ${tM % 5 === 0 ? tM / 5 + ' के अंक तक' : Math.floor(tM / 5) + ' के अंक के आगे'} गिनो।`);
        else if (hourBad && !minBad) text = T2(`The minutes are right. Check the short hour hand: it should be just past ${tH}${tM >= 45 ? ' (close to the next number)' : ''}.`, `मिनट सही हैं। छोटी घंटे की सुई देखो: वह ${tH} के ठीक आगे होनी चाहिए${tM >= 45 ? ' (अगले अंक के पास)' : ''}।`);
        else text = T2('Not yet. First put the long minute hand right (each number is 5 minutes), then move the short hour hand.', 'अभी नहीं। पहले लंबी मिनट की सुई ठीक करो (हर अंक 5 मिनट है), फिर छोटी घंटे की सुई।');
        if (mode === '24h' && !hourBad && !minBad) text = T2('The hands match, but AM and PM are different. Is 24-hour time before or after noon?', 'सुइयाँ ठीक हैं, पर AM और PM अलग हैं। 24-घंटे का यह समय दोपहर से पहले है या बाद?');
        if (S.wrongN >= 2) text = { en: text.en + ' The dotted hands show the answer.', hi: text.hi + ' बिंदु वाली सुइयाँ उत्तर दिखा रही हैं।' };
        S.fb = { good: false, text };
      }
      refresh();
    }
    function pickOption(i) {
      const q = S.q;
      if (S.solved || S.picked.has(i)) return;
      S.picked.add(i);
      const o = q.options[i];
      if (o.r === 'right') {
        rightFeedback();
        S.fb = { good: true, text: mode === 'read' ? T2(`Yes! ${dig12(q.mins)} is ${words(q.mins).en}.`, `सही! ${dig12(q.mins)} यानी ${words(q.mins).hi}।`) : T2(`Yes! ${durText(q.dur).en} passed.`, `सही! ${durText(q.dur).hi} बीते।`) };
        api.record(t(T2('Answered: ', 'उत्तर: ')) + (mode === 'read' ? o.label : t(o.label)) + ' ✓');
      } else {
        api.emit('answered:wrong');
        S.wrongN++;
        let text;
        if (mode === 'read') {
          const H = Math.floor(q.mins / 60) % 12 || 12;
          text = o.r === 'swap' ? T2('You may have swapped the hands. The short, thick hand shows the hour; the long, thin hand shows the minutes.', 'शायद सुइयाँ उलट गईं। छोटी, मोटी सुई घंटा बताती है; लंबी, पतली सुई मिनट।')
            : o.r === 'mirror' ? T2('Count the minutes from 12 going clockwise, not from the other side.', 'मिनट 12 से घड़ी की दिशा में गिनो, दूसरी तरफ़ से नहीं।')
            : o.r === 'hour' ? T2(`Check the hour hand: it has passed ${H} but not reached ${H % 12 + 1} yet, so the hour is ${H}.`, `घंटे की सुई देखो: वह ${H} पार कर चुकी है पर ${H % 12 + 1} तक नहीं पहुँची, इसलिए घंटा ${H} है।`)
            : T2('Count the minutes again: every number on the clock is 5 minutes, and each small tick is 1 minute.', 'मिनट फिर गिनो: घड़ी का हर अंक 5 मिनट है और हर छोटी लकीर 1 मिनट।');
        } else {
          text = o.r === 'borrow' ? T2('When the end minutes are fewer than the start minutes, you cannot simply subtract. Count up to the next full hour first, then on to the end.', 'जब अंत के मिनट शुरू के मिनट से कम हों तो सीधे घटा नहीं सकते। पहले अगले पूरे घंटे तक गिनो, फिर अंत तक।')
            : T2('Count on from the start: first to the next full hour, then the remaining hours, then the minutes.', 'शुरू से आगे गिनो: पहले अगले पूरे घंटे तक, फिर बचे घंटे, फिर मिनट।');
        }
        S.fb = { good: false, text };
        api.record(t(T2('Answered: ', 'उत्तर: ')) + (mode === 'read' ? o.label : t(o.label)) + ' ✗');
      }
      refresh();
    }
    function nextQuestion() {
      makeQuestion(false);
      build();
      api.emit('next');
    }

    // ---- calendar
    function buildCalendar(wrap) {
      const q = S.q;
      const lng = lang();
      const y = S.y, m = S.m, n = daysIn(m, y), first = dow(y, m, 1);
      const monthChips = Array.from({ length: 12 }, (_, i) => {
        const L12 = daysIn(i + 1, y), cls = i === 1 ? 'dfeb' : L12 === 31 ? 'd31' : 'd30';
        return `<button type="button" class="cl-mo ${cls}" data-key="month:${i + 1}" aria-pressed="${i + 1 === m}" aria-label="${esc(t(MONTHS[i]))}, ${L12} ${esc(t(T2('days', 'दिन')))}">${esc(t(MONTHS[i]))}<small>${L12}</small></button>`;
      }).join('');
      let cells = '';
      for (let i = 0; i < first; i++) cells += '<div class="cl-blank" aria-hidden="true"></div>';
      for (let d = 1; d <= n; d++) {
        const w = (first + d - 1) % 7;
        const ask = q.d && q.m === m && q.y === y && q.d === d;
        cells += `<button type="button" class="cl-day ${w === 0 ? 'sun' : ''} ${ask ? 'ask' : ''}" data-key="day:${d}" aria-pressed="${S.sel === d}" aria-label="${d} ${esc(t(MONTHS[m - 1]))} ${y}${ask ? '' : ', ' + esc(t(WD[w]))}">${d}</button>`;
      }
      const head = WDS.map((w, i) => `<div class="cl-wdh ${i === 0 ? 'sun' : ''}" aria-hidden="true">${esc(t(w))}</div>`).join('');
      let opts;
      if (q.d) opts = WD.map((w, i) => `<button type="button" class="cl-btn cl-opt t" data-key="answer" data-i="${i}">${esc(t(w))}</button>`).join('');
      else {
        const base = [28, 29, 30, 31];
        opts = base.map((v) => `<button type="button" class="cl-btn cl-opt" data-key="answer" data-i="${v}">${v}</button>`).join('');
      }
      const qText = q.d
        ? T2(`Which day of the week is ${q.d} ${MONTHS[q.m - 1].en} ${q.y}?`, `${q.d} ${MONTHS[q.m - 1].hi} ${q.y} को सप्ताह का कौन-सा दिन है?`)
        : T2(`How many days does ${MONTHS[q.m - 1].en} ${q.y} have?`, `${MONTHS[q.m - 1].hi} ${q.y} में कितने दिन होते हैं?`);
      const sub = q.d ? T2('Find the date on the calendar and read its column.', 'कैलेंडर में तारीख़ ढूँढो और उसका स्तंभ पढ़ो।') : T2('Use the month buttons: they show the days of each month.', 'महीनों के बटन देखो: उनमें हर महीने के दिन लिखे हैं।');
      const leapNote = isLeap(y) ? T2('Leap year: February has 29 days', 'लीप वर्ष: फ़रवरी में 29 दिन') : T2('Not a leap year: February has 28 days', 'लीप वर्ष नहीं: फ़रवरी में 28 दिन');
      wrap.className = `cl cl-calendar${root.clientWidth >= 700 ? ' cl-wide' : ''}`;
      wrap.innerHTML = `<div class="cl-card cl-q"><p class="cl-qtext">${tx(qText)}<small>${tx(sub)}</small></p>${scoreChip()}</div>
        <div class="cl-calwrap">
          <div class="cl-calcol">
            <div class="cl-card" style="display:flex;flex-direction:column;gap:10px">
              <div class="cl-yr">${btn('year:prev', '', '◀', `aria-label="${esc(t(T2('Previous year', 'पिछला वर्ष')))}"`)}
                <div class="cl-ytitle" aria-live="polite">${esc(t(MONTHS[m - 1]))} ${y}<small class="${isLeap(y) ? 'cl-leap' : ''}">${n} ${esc(t(T2('days', 'दिन')))}${m === 2 ? ' · ' + esc(t(leapNote)) : ''}</small></div>
                ${btn('year:next', '', '▶', `aria-label="${esc(t(T2('Next year', 'अगला वर्ष')))}"`)}</div>
              <div class="cl-grid" role="group" aria-label="${esc(t(MONTHS[m - 1]))} ${y}">${head}${cells}</div>
            </div>
          </div>
          <div class="cl-side">
            <div class="cl-card" data-selinfo></div>
            <div class="cl-card"><div class="cl-months" role="group" aria-label="${esc(t(T2('Choose a month', 'महीना चुनो')))}">${monthChips}</div>
              <div class="cl-legend" style="margin-top:8px"><span><i style="background:#BFD4FF"></i>31 ${esc(t(T2('days', 'दिन')))}</span><span><i style="background:#A5F3FC"></i>30 ${esc(t(T2('days', 'दिन')))}</span><span><i style="background:#FFC9BF"></i>${esc(t(T2('February: 28 or 29', 'फ़रवरी: 28 या 29')))}</span></div></div>
            <div class="cl-card"><div class="${q.d ? 'cl-opts four' : 'cl-opts'}" role="group" aria-label="${esc(t(T2('Choose the answer', 'उत्तर चुनो')))}">${opts}</div></div>
            <div class="cl-fb" data-fb aria-live="polite"></div>
            <div class="cl-row">${btn('next', 'ghost', tx(T2('New question', 'नया सवाल')))}</div>
          </div>
        </div>`;
      void lng;
      refreshCal();
    }
    function refreshCal() {
      const q = S.q, y = S.y, m = S.m;
      const info = q$('[data-selinfo]');
      if (info) {
        if (S.sel) {
          const w = dow(y, m, S.sel), n = daysIn(m, y);
          info.innerHTML = `<div class="cl-big" style="font-size:1.5rem">${S.sel} ${esc(t(MONTHS[m - 1]))} ${y}</div><div class="cl-words">${tx(WD[w])}</div>
            ${w === 0 ? `<p class="cl-sub" style="margin:4px 0 0">${tx(T2('A holiday for many people.', 'बहुत लोगों की छुट्टी का दिन।'))}</p>` : ''}<p class="cl-sub" style="margin:6px 0 0">${tx(T2(`Day ${dayOfYear(y, m, S.sel)} of ${isLeap(y) ? 366 : 365} in the year · ${n - S.sel} days left in the month`, `वर्ष का ${dayOfYear(y, m, S.sel)} वाँ दिन (कुल ${isLeap(y) ? 366 : 365}) · महीने में ${n - S.sel} दिन बाकी`))}</p>`;
        } else info.innerHTML = `<p class="cl-sub" style="margin:0">${tx(T2('Tap a date to see its day of the week.', 'किसी तारीख़ पर टैप करो, सप्ताह का दिन दिखेगा।'))}</p>`;
      }
      S.wrap.querySelectorAll('.cl-opt').forEach((b) => {
        const i = +b.dataset.i;
        b.disabled = S.solved || S.picked.has(i);
        const right = q.d ? i === q.ans : i === q.ans;
        b.classList.toggle('right', S.solved && right);
        b.classList.toggle('wrong', S.picked.has(i) && !right);
      });
      const fb = q$('[data-fb]');
      if (fb) { fb.className = 'cl-fb' + (S.fb ? (S.fb.good ? ' good' : ' bad') : ''); fb.innerHTML = `<p>${esc(t(S.fb ? S.fb.text : T2('Tap an answer.', 'एक उत्तर चुनो।')))}</p>`; }
    }
    function calAnswer(i) {
      const q = S.q;
      if (S.solved || S.picked.has(i)) return;
      S.picked.add(i);
      const right = i === q.ans;
      if (right) {
        S.solved = true; S.score++; api.emit('answered:right'); api.celebrate();
        S.fb = { good: true, text: q.d ? T2(`Yes! ${q.d} ${MONTHS[q.m - 1].en} ${q.y} is a ${WD[q.ans].en}.`, `सही! ${q.d} ${MONTHS[q.m - 1].hi} ${q.y} को ${WD[q.ans].hi} है।`) : T2(`Yes! ${MONTHS[q.m - 1].en} ${q.y} has ${q.ans} days.`, `सही! ${MONTHS[q.m - 1].hi} ${q.y} में ${q.ans} दिन हैं।`) };
        api.record(t(T2('Calendar answer right', 'कैलेंडर का उत्तर सही')));
        if (S.m !== q.m || S.y !== q.y) { S.m = q.m; S.y = q.y; buildCalendar(S.wrap); return; }
      } else {
        api.emit('answered:wrong');
        S.fb = { good: false, text: q.d ? T2('Dates 7 days apart fall on the same weekday. Use the columns: read the weekday at the top of the date\'s column.', 'सात दिन के अंतर वाली तारीख़ें एक ही वार पर पड़ती हैं। तारीख़ के स्तंभ के ऊपर लिखा वार पढ़ो।')
          : T2('Use the knuckle rule: 30 days in April, June, September, November. February has 28 (29 in a leap year). All the others have 31.', 'गाँठ वाला नियम: अप्रैल, जून, सितंबर, नवंबर में 30 दिन। फ़रवरी में 28 (लीप वर्ष में 29)। बाकी सब में 31।') };
        api.record(t(T2('Calendar answer wrong', 'कैलेंडर का उत्तर ग़लत')));
      }
      refreshCal();
    }
    function calNav(key) {
      if (key.startsWith('month:')) { S.m = +key.slice(6); if (S.sel && S.sel > daysIn(S.m, S.y)) S.sel = null; api.emit('month:' + S.m); }
      else { S.y = clampY(S.y + (key === 'year:next' ? 1 : -1)); if (S.sel && S.sel > daysIn(S.m, S.y)) S.sel = null; api.emit('year:' + S.y); }
      buildCalendar(S.wrap);
      const again = S.wrap.querySelector(`[data-key="${key}"]`); if (again) again.focus();
    }
    const clampY = (y) => Math.max(1900, Math.min(2100, y));

    // ---- events
    const keepFocus = (key) => { const again = root.querySelector(`[data-key="${key}"]:not(:disabled)`); if (again && document.activeElement !== again) again.focus(); };
    function onClick(e) {
      const el = e.target.closest('[data-key]');
      if (!el || !root.contains(el) || el.disabled) return;
      const key = el.dataset.key;
      if (S.dragMoved) { S.dragMoved = false; return; }
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (mode === 'calendar') {
        if (key.startsWith('day:')) { S.sel = +key.slice(4); api.emit(key); buildCalendar(S.wrap); keepFocus(key); api.record(t(T2('Looked at date ', 'तारीख़ देखी: ')) + S.sel); }
        else if (key.startsWith('month:') || key.startsWith('year:')) calNav(key);
        else if (key === 'answer') calAnswer(+el.dataset.i);
        else if (key === 'next') nextQuestion();
        return;
      }
      if (key.startsWith('step:')) stepBy(key);
      else if (key.startsWith('hour:')) { const h = +key.slice(5); moveTo(h * 60 + mm(S.mins), true, true); }
      else if (key === 'ampm') { moveTo(S.mins + 720, true, true); }
      else if (key === 'hint') { S.hint = !S.hint; refresh(); }
      else if (key === 'next') nextQuestion();
      else if (key === 'answer') {
        if (el.dataset.i != null) pickOption(+el.dataset.i); else checkSet();
      } else if (key.startsWith('hand:')) {
        const live = el.classList.contains('cl-live');
        if (!live) {
          const hour = key === 'hand:hour';
          S.tip = hour ? T2('The short, thick hand is the hour hand. It tells the hour. It moves a little as the minutes pass.', 'छोटी, मोटी सुई घंटे की सुई है। वह घंटा बताती है। मिनट बीतने पर वह थोड़ा-थोड़ा खिसकती है।')
            : T2('The long, thin hand is the minute hand. Every number is 5 minutes. One full round is 60 minutes.', 'लंबी, पतली सुई मिनट की सुई है। हर अंक 5 मिनट है। एक पूरा चक्कर 60 मिनट का है।');
          if (!S.fb) refresh(); else { S.fb = null; refresh(); }
          el.classList.add('cl-pulse'); setTimeout(() => el.classList.remove('cl-pulse'), 2200);
          api.speak(t(S.tip));
        }
      }
    }
    function onKey(e) {
      const hand = e.target.closest && e.target.closest('.cl-hand');
      if (hand) {
        if (hand.classList.contains('cl-live')) {
          const key = hand.dataset.key;
          let d = 0;
          const minute = hand.dataset.hand === 'minute';
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') d = 1; else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') d = -1;
          else if (e.key === 'PageUp') d = 5; else if (e.key === 'PageDown') d = -5; else return;
          e.preventDefault();
          if (!api.allowed(key)) { api.nudge(key); return; }
          const step = minute ? d : d * 60;
          S.mins = mod(S.mins + step, 1440); S.vis = S.mins; afterChange(true);
          const again = root.querySelector(`.cl-hand[data-key="${key}"]`); if (again) again.focus();
        } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hand.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
      }
    }
    function onDown(e) {
      const hand = e.target.closest && e.target.closest('.cl-hand.cl-live');
      if (!hand) return;
      const key = hand.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (S.tw) { S.tw(); S.vis = S.mins; }
      S.drag = { hand: hand.dataset.hand, svg: hand.closest('svg') };
      S.changed = false;
      try { hand.setPointerCapture(e.pointerId); } catch (x) { /* synthetic pointer */ }
      e.preventDefault();
      hand.focus({ preventScroll: true });
    }
    const onMove = (e) => { if (S.drag) { S.dragMoved = true; onDragMove(e); } };
    const onUp = () => { endDrag(); setTimeout(() => { S.dragMoved = false; }, 0); };
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);

    makeQuestion(true);
    build();
    let lastWide = root.clientWidth >= 700;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => { const w = root.clientWidth >= 700; if (w !== lastWide && S.wrap) { lastWide = w; S.wrap.classList.toggle('cl-wide', w); } });
      ro.observe(root);
    }
    return {
      destroy() {
        stops.forEach((s) => { try { s(); } catch (x) { /* already finished */ } });
        if (S.tw) S.tw();
        if (ro) ro.disconnect();
        root.removeEventListener('click', onClick);
        root.removeEventListener('keydown', onKey);
        root.removeEventListener('pointerdown', onDown);
        root.removeEventListener('pointermove', onMove);
        root.removeEventListener('pointerup', onUp);
        root.removeEventListener('pointercancel', onUp);
      },
    };
  }

  NCA_T.register({
    id: 'clock',
    css: CSS,
    validate,
    keys,
    demo: { mode: 'set', time: '03:00', ask: '04:35' },
    // The pure helpers, for tests under Node.
    model: { daysIn, isLeap, dow, dayOfYear, words, durText, readQuestion, setEvents, dig12, dig24, parseHM },
    mount,
  });
})();
