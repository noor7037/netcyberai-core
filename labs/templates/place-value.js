// Template: Place value blocks. Ones, tens, hundreds, thousands (and ten thousands, lakhs) with blocks and an
// abacus, in the Indian system (12,34,567). Six modes, all computed from the numbers, nothing scripted:
//   build    add blocks to places; 10 in a place trade up to 1 in the next place (optional target to build)
//   abacus   tap beads on rods (9 per rod; a tenth moves to the next rod)
//   add      a + b as blocks per place; "regroup" 10 of a place into 1 of the next place; type the answer
//   subtract a - b; take away b's blocks per place; "regroup" breaks 1 of the next place into 10; type the answer
//   expand   a number's blocks with its expanded form and the face value / place value of every digit
//   compare  two numbers side by side: choose <, = or > and see which place decides
// Config: { mode, target?: 0–999999, a?, b?: 0–999999, places?: 2–6 }. The default number of places fits the numbers
// (4 when there is none); lakhs appear only at 6 places. a + b and a - b must fit the places and stay whole numbers.
(function () {
  const L = window.NCA_LIB;
  const { esc } = L;
  const T2 = (en, hi) => ({ en, hi });
  const MODES = ['build', 'abacus', 'add', 'subtract', 'expand', 'compare'];
  const CONFIG_KEYS = ['mode', 'target', 'a', 'b', 'places'];
  const DARK = '#1E293B', WHITE = '#FFFFFF';

  // ---------------------------------------------------------------- the places (Indian system)
  const PL = [
    { id: 'ones', col: '#FFD23F', dk: '#B58900', txt: DARK, hdr: T2('Ones', 'इकाई'), se: 'one', pe: 'ones', sh: 'इकाई', ph: 'इकाइयाँ', val: 1 },
    { id: 'tens', col: '#22C55E', dk: '#15803D', txt: DARK, hdr: T2('Tens', 'दहाई'), se: 'ten', pe: 'tens', sh: 'दहाई', ph: 'दहाइयाँ', val: 10 },
    { id: 'hundreds', col: '#02CFF9', dk: '#0891B2', txt: DARK, hdr: T2('Hundreds', 'सैकड़ा'), se: 'hundred', pe: 'hundreds', sh: 'सैकड़ा', ph: 'सैकड़े', val: 100 },
    { id: 'thousands', col: '#2563EB', dk: '#1E3A8A', txt: WHITE, hdr: T2('Thousands', 'हज़ार'), se: 'thousand', pe: 'thousands', sh: 'हज़ार', ph: 'हज़ार', val: 1000 },
    { id: 'tenthousands', col: '#8B3DFF', dk: '#5B21B6', txt: WHITE, hdr: T2('Ten thousands', 'दस हज़ार'), se: 'ten thousand', pe: 'ten thousands', sh: 'दस हज़ार', ph: 'दस हज़ार', val: 10000 },
    { id: 'lakhs', col: '#FF6B57', dk: '#C2410C', txt: DARK, hdr: T2('Lakhs', 'लाख'), se: 'lakh', pe: 'lakhs', sh: 'लाख', ph: 'लाख', val: 100000 },
  ];
  const sing = (p) => T2(PL[p].se, PL[p].sh);
  const plur = (p) => T2(PL[p].pe, PL[p].ph);

  // ---------------------------------------------------------------- numbers: Indian grouping, words in English and Hindi
  const isInt = (v) => typeof v === 'number' && Number.isInteger(v);
  const grp = (n) => {
    const s = String(n);
    if (s.length <= 3) return s;
    return s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + s.slice(-3);
  };
  const E1 = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
  const ETY = ',,twenty,thirty,forty,fifty,sixty,seventy,eighty,ninety'.split(',');
  const e2 = (n) => (n < 20 ? E1[n] : ETY[Math.floor(n / 10)] + (n % 10 ? '-' + E1[n % 10] : ''));
  function wordsEn(n) {
    if (n === 0) return 'zero';
    const l = Math.floor(n / 100000), th = Math.floor((n % 100000) / 1000), h = Math.floor((n % 1000) / 100), r = n % 100, o = [];
    if (l) o.push(e2(l) + ' lakh');
    if (th) o.push(e2(th) + ' thousand');
    if (h) o.push(E1[h] + ' hundred');
    if (r) o.push(e2(r));
    return o.join(' ');
  }
  const HI = ('शून्य एक दो तीन चार पाँच छह सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस बीस इक्कीस बाईस तेईस चौबीस पच्चीस छब्बीस सत्ताईस अट्ठाईस उनतीस ' +
    'तीस इकतीस बत्तीस तैंतीस चौंतीस पैंतीस छत्तीस सैंतीस अड़तीस उनतालीस चालीस इकतालीस बयालीस तैंतालीस चौवालीस पैंतालीस छियालीस सैंतालीस अड़तालीस उनचास ' +
    'पचास इक्यावन बावन तिरपन चौवन पचपन छप्पन सत्तावन अट्ठावन उनसठ साठ इकसठ बासठ तिरसठ चौंसठ पैंसठ छियासठ सड़सठ अड़सठ उनहत्तर ' +
    'सत्तर इकहत्तर बहत्तर तिहत्तर चौहत्तर पचहत्तर छिहत्तर सतत्तर अठहत्तर उनासी अस्सी इक्यासी बयासी तिरासी चौरासी पचासी छियासी सत्तासी अट्ठासी नवासी ' +
    'नब्बे इक्यानवे बानवे तिरानवे चौरानवे पंचानवे छियानवे सत्तानवे अट्ठानवे निन्यानवे').split(' ');
  function wordsHi(n) {
    if (n === 0) return HI[0];
    const l = Math.floor(n / 100000), th = Math.floor((n % 100000) / 1000), h = Math.floor((n % 1000) / 100), r = n % 100, o = [];
    if (l) o.push(HI[l] + ' लाख');
    if (th) o.push(HI[th] + ' हज़ार');
    if (h) o.push(HI[h] + ' सौ');
    if (r) o.push(HI[r]);
    return o.join(' ');
  }
  const words = (n) => T2(wordsEn(n), wordsHi(n));
  const digs = (n, P) => { const d = []; for (let i = 0; i < P; i++) d.push(Math.floor(n / PL[i].val) % 10); return d; };
  const nDigits = (n) => String(n).length;

  // ---------------------------------------------------------------- config rules
  function placesFor(c) {
    if (isInt(c.places)) return c.places;
    let m = 0;
    for (const k of ['target', 'a', 'b']) if (isInt(c[k])) m = Math.max(m, c[k]);
    if (c.mode === 'add' && isInt(c.a) && isInt(c.b)) m = Math.max(m, c.a + c.b);
    const has = ['target', 'a', 'b'].some((k) => isInt(c[k]));
    if (!has) return 4;
    return Math.min(6, Math.max(2, nDigits(m)));
  }
  function validate(config) {
    const e = [];
    if (!config || typeof config !== 'object' || Array.isArray(config)) return ['config must be an object'];
    Object.keys(config).forEach((k) => { if (!CONFIG_KEYS.includes(k)) e.push(`unknown key "${k}"`); });
    if (!MODES.includes(config.mode)) e.push(`mode must be one of ${MODES.join(', ')}`);
    ['target', 'a', 'b'].forEach((k) => {
      const v = config[k];
      if (v !== undefined && (!isInt(v) || v < 0 || v > 999999)) e.push(`${k} must be a whole number from 0 to 999999`);
    });
    if (config.places !== undefined && (!isInt(config.places) || config.places < 2 || config.places > 6)) e.push('places must be a whole number from 2 to 6');
    if (e.length) return e;
    const P = placesFor(config), max = Math.pow(10, P) - 1, m = config.mode;
    ['target', 'a', 'b'].forEach((k) => { if (config[k] !== undefined && config[k] > max) e.push(`${k} ${config[k]} does not fit in ${P} places (largest is ${max})`); });
    if (m === 'add' || m === 'subtract' || m === 'compare') {
      if (config.a === undefined || config.b === undefined) e.push(`${m} needs both a and b`);
    }
    if (m === 'expand' && config.target === undefined) e.push('expand needs a target number');
    if (e.length) return e;
    if (m === 'add') {
      if (config.a + config.b > max) e.push(`a + b = ${config.a + config.b} does not fit in ${P} places`);
      if (config.target !== undefined && config.target !== config.a + config.b) e.push('target must equal a + b (or be left out)');
    }
    if (m === 'subtract') {
      if (config.a < config.b) e.push('subtract needs a to be at least b (no negative numbers at this level)');
      else if (config.target !== undefined && config.target !== config.a - config.b) e.push('target must equal a - b (or be left out)');
    }
    return e;
  }
  function keys(config) {
    const c = config || {};
    const P = Math.max(2, Math.min(6, placesFor(c)));
    const ids = PL.slice(0, P).map((p) => p.id);
    const per = (v) => ids.map((i) => v + ':' + i);
    switch (c.mode) {
      case 'abacus': return { targets: [...per('bead'), ...per('add'), ...per('remove'), 'reset'], events: ['built:*', 'regrouped'] };
      case 'add': case 'subtract': return { targets: ['regroup', 'answer', 'reset'], events: ['regrouped', 'answered:right', 'answered:wrong'] };
      case 'compare': return { targets: ['answer', 'reset'], events: ['answered:right', 'answered:wrong'] };
      default: return { targets: [...per('add'), ...per('remove'), 'reset'], events: ['built:*', 'regrouped'] };
    }
  }

  // ---------------------------------------------------------------- drawing the blocks
  const SHAPE = [
    { w: 20, h: 20, cols: 3, gx: 5, gy: 5 },
    { w: 10, h: 46, cols: 6, gx: 4, gy: 5 },
    { w: 28, h: 28, cols: 3, gx: 4, gy: 4 },
    { w: 28, h: 28, cols: 3, gx: 4, gy: 4 },
    { w: 28, h: 28, cols: 3, gx: 4, gy: 4 },
    { w: 28, h: 28, cols: 3, gx: 4, gy: 4 },
  ];
  function shapeSVG(p) {
    const c = PL[p], f = `fill="${c.col}" stroke="${c.dk}" stroke-width="1.4"`;
    if (p === 0) return `<rect width="20" height="20" rx="4" ${f}/><rect x="3" y="3" width="9" height="4" rx="2" fill="#fff" opacity=".5"/>`;
    if (p === 1) {
      let d = '';
      for (let k = 1; k < 10; k++) d += `M0 ${(k * 4.6).toFixed(1)}h10`;
      return `<rect width="10" height="46" rx="3" ${f}/><path d="${d}" stroke="${c.dk}" stroke-width=".6" opacity=".55" fill="none"/><rect x="1.6" y="2" width="2" height="42" rx="1" fill="#fff" opacity=".4"/>`;
    }
    if (p === 2) {
      let d = '';
      for (let k = 1; k < 10; k++) d += `M${(k * 2.8).toFixed(1)} 0v28M0 ${(k * 2.8).toFixed(1)}h28`;
      return `<rect width="28" height="28" rx="3" ${f}/><path d="${d}" stroke="${c.dk}" stroke-width=".5" opacity=".5" fill="none"/>`;
    }
    if (p === 3) {
      return `<rect x="0" y="6" width="22" height="22" rx="2" ${f}/><path d="M4.4 6v22M8.8 6v22M13.2 6v22M17.6 6v22M0 10.4h22M0 14.8h22M0 19.2h22M0 23.6h22" stroke="${c.dk}" stroke-width=".5" opacity=".5" fill="none"/>` +
        `<polygon points="0,6 6,0 28,0 22,6" fill="#fff" fill-opacity=".38" stroke="${c.dk}" stroke-width="1.2"/><polygon points="22,6 28,0 28,22 22,28" fill="#000" fill-opacity=".22" stroke="${c.dk}" stroke-width="1.2"/>`;
    }
    const lab = p === 4 ? '10K' : '1L';
    return `<circle cx="14" cy="14" r="13" ${f}/><circle cx="14" cy="14" r="9.4" fill="none" stroke="${c.txt}" stroke-width=".9" opacity=".6"/><text x="14" y="17.2" text-anchor="middle" font-size="8.5" font-weight="800" fill="${c.txt}" font-family="sans-serif">${lab}</text>`;
  }
  function itemSVG(p, i, o) {
    const S = SHAPE[p];
    const col = i % S.cols, row = Math.floor(i / S.cols);
    const x0 = (100 - (S.cols * S.w + (S.cols - 1) * S.gx)) / 2;
    const x = x0 + col * (S.w + S.gx), y = 4 + row * (S.h + S.gy);
    const cross = o.cross ? `<path d="M2 2L${S.w - 2} ${S.h - 2}M${S.w - 2} 2L2 ${S.h - 2}" stroke="#E11D48" stroke-width="3.2" stroke-linecap="round"/>` : '';
    return `<g transform="translate(${x.toFixed(1)},${y})" class="pv-it ${o.cls || ''}" style="--d:${o.d || 0}s"><g class="pv-an"><g class="pv-sh">${shapeSVG(p)}</g>${cross}</g></g>`;
  }
  function blocksSVG(p, items) {
    return `<svg class="pv-svg" viewBox="0 0 100 200" aria-hidden="true" focusable="false">${items.map((o, i) => itemSVG(p, i, o)).join('')}</svg>`;
  }
  function abacusSVG(p, n, api) {
    const c = PL[p], shown = Math.min(n, 9);
    let h = `<rect x="6" y="4" width="88" height="8" rx="4" fill="#92400E"/><rect x="6" y="188" width="88" height="8" rx="4" fill="#92400E"/><rect x="48.5" y="10" width="3" height="180" rx="1.5" fill="#64748B"/>`;
    h += `<g data-key="bead:${c.id}" class="${n >= 10 ? 'pv-glow' : ''}">`;
    for (let i = 0; i < 9; i++) {
      const on = i < shown, y = 20 + i * 15 + (on ? 0 : 25);
      const lab = api.t(T2(`Bead ${i + 1} on the ${c.se} rod`, `${c.sh} की छड़ का मनका ${i + 1}`));
      h += `<g class="pv-bead${on ? ' on' : ''}" data-bead="${c.id}:${i}" role="button" tabindex="0" aria-label="${esc(lab)}" aria-pressed="${on}" style="transform:translateY(${y}px)">` +
        `<rect x="4" y="-1" width="92" height="17" fill="transparent"/><ellipse cx="50" cy="7" rx="22" ry="7" fill="${c.col}" stroke="${c.dk}" stroke-width="1.4"/><ellipse cx="43" cy="4.4" rx="9" ry="2.2" fill="#fff" opacity=".5"/></g>`;
    }
    return `<svg class="pv-svg" viewBox="0 0 100 200" focusable="false">${h}</g></svg>`;
  }

  // ---------------------------------------------------------------- CSS
  const CSS = `
.pv{display:flex;flex-direction:column;gap:12px;padding:12px;max-width:820px;margin:0 auto;color:var(--ink);font-family:var(--font-body,system-ui,sans-serif)}
.pv *{box-sizing:border-box}
.pv-task{background:linear-gradient(135deg,#FFEDD5,#FED7AA);color:#7C2D12;border:1px solid #FDBA74;border-radius:14px;padding:10px 14px;font-size:15px;line-height:1.4;font-weight:600}
.pv-task .pv-st{display:block;margin-top:6px;padding-top:6px;border-top:1px dashed #FB923C;font-weight:700;color:#9A3412}
.pv-live{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;background:var(--sunk);border-radius:14px;padding:10px 12px}
.pv-vals{display:flex;align-items:center;gap:3px;flex-wrap:wrap}
.pv-dt{display:inline-grid;place-items:center;min-width:30px;height:42px;border-radius:9px;font:800 25px/1 var(--font-display,inherit);box-shadow:0 2px 0 rgba(0,0,0,.2)}
.pv-cm{font:800 25px/1 var(--font-display,inherit);color:var(--ink-2);font-style:normal;padding:0 1px}
.pv-words{font-size:14px;color:var(--ink-2);flex:1 1 180px;line-height:1.35}
.pv-goal{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;border:2px dashed #F97316;border-radius:14px;padding:8px 12px;background:var(--surface)}
.pv-goal b{font:800 28px/1 var(--font-display,inherit)}
.pv-goal small{color:var(--ink-2);font-size:13px;flex:1 1 150px}
.pv-goal.met{border:2px solid var(--good);background:var(--good-t)}
.pv-tick{font:800 22px/1 var(--font-display,inherit);color:var(--good)}
.pv-eq{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 12px;background:var(--sunk);border-radius:14px;padding:10px 12px;font:800 28px/1.1 var(--font-display,inherit)}
.pv-eq .pv-op{color:#F97316}
.pv-eq .pv-q{background:var(--surface);border:2px dashed #F97316;border-radius:10px;padding:2px 12px;min-width:48px;text-align:center}
.pv-eq .pv-q.ok{border:2px solid var(--good);color:var(--good)}
.pv-chart{width:100%}
.pv-grid{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:6px}
.pv-col{display:flex;flex-direction:column;min-width:0;border-radius:14px;border:2px solid var(--c);background:var(--surface);background:color-mix(in srgb,var(--c) 13%,var(--surface));overflow:hidden}
.pv-col.alert{box-shadow:0 0 0 3px #F97316;animation:pvAlert 1.3s ease-in-out infinite}
.pv-ch{background:var(--c);color:var(--t);text-align:center;padding:4px 2px;min-height:46px;display:flex;flex-direction:column;justify-content:center;align-items:center;font:700 11.5px/1.15 var(--font-display,inherit);overflow-wrap:anywhere}
.pv-ch small{font:600 10px/1.2 var(--font-body,inherit);opacity:.9}
.pv-svg{display:block;width:100%;height:auto;aspect-ratio:1/2}
.pv-it .pv-sh{filter:drop-shadow(0 1.5px 1.5px rgba(0,0,0,.28))}
.pv-an{transform-box:fill-box;transform-origin:center}
.pv-new .pv-an{animation:pvPop .45s cubic-bezier(.3,1.6,.5,1) both;animation-delay:var(--d,0s)}
.pv-merge .pv-an{animation:pvMerge .55s ease-in both}
.pv-brk .pv-an{animation:pvBreak .55s ease-in both}
.pv-kb .pv-sh{filter:brightness(1.22) saturate(.85) drop-shadow(0 1.5px 1.5px rgba(0,0,0,.28))}
.pv-kr .pv-sh{filter:drop-shadow(0 0 2.5px #F59E0B) drop-shadow(0 1.5px 1.5px rgba(0,0,0,.28))}
.pv-xx .pv-sh{opacity:.4}
.pv-bead{cursor:pointer;transition:transform .38s cubic-bezier(.4,1.3,.5,1)}
.pv-bead:hover ellipse:first-of-type{filter:brightness(1.1)}
.pv-glow ellipse{filter:drop-shadow(0 0 4px #F97316)}
.pv-cnt{text-align:center;font:800 24px/1.1 var(--font-display,inherit);padding:3px 0 0}
.pv-cnt.warn{color:var(--bad)}
.pv-sub{text-align:center;font:700 13px/1.3 var(--font-display,inherit);color:var(--ink-2);padding-bottom:4px}
.pv-sub.bad{color:var(--bad)}
.pv-sub.res{color:var(--good);font-size:15px}
.pv-btns{display:flex;flex-direction:column;gap:4px;padding:4px}
.pv-btn{min-height:44px;min-width:44px;border-radius:12px;border:2px solid var(--line);background:var(--surface);color:var(--ink);font:800 22px/1 var(--font-display,inherit);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 12px;transition:transform .12s,box-shadow .12s}
.pv-btn:hover{box-shadow:0 3px 8px rgba(0,0,0,.15)}
.pv-btn:active{transform:scale(.94)}
.pv-btn:focus-visible,.pv-bead:focus-visible,.pv-in:focus-visible,.pv-cb:focus-visible{outline:3px solid var(--action,#2563EB);outline-offset:2px}
.pv-plus{background:var(--c);color:var(--t);border-color:transparent}
.pv-reg{font-size:17px;background:#F97316;color:#fff;border-color:transparent;padding:0 18px}
.pv-reg.need{animation:pvAlert 1.3s ease-in-out infinite}
.pv-reset{font-size:15px;font-family:var(--font-body,inherit);font-weight:700}
.pv-foot{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:center}
.pv-ans{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center}
.pv-ans label{font-weight:700;font-size:15px}
.pv-in{width:170px;height:52px;border-radius:12px;border:2px solid var(--line);background:var(--surface);color:var(--ink);font:800 24px/1 var(--font-display,inherit);text-align:center}
.pv-chk{font-size:17px;background:var(--royal,#1D4ED8);color:#fff;border-color:transparent;padding:0 20px}
.pv-cmp{display:flex;flex-direction:column;gap:8px;width:100%}
.pv-cb{min-height:52px;border-radius:14px;border:2px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:12px;font:800 22px/1 var(--font-display,inherit);padding:6px 10px;flex-wrap:wrap}
.pv-cb .pv-cs{font-size:30px;color:#F97316}
.pv-cb.right{background:var(--good-t);border-color:var(--good)}
.pv-cb.wrong{background:var(--bad-t);border-color:var(--bad)}
.pv-cb:disabled{cursor:default;opacity:.6}
.pv-cb.right:disabled{opacity:1}
.pv-msg{margin:0;min-height:24px;font-size:15px;line-height:1.45;font-weight:600;border-radius:12px;padding:0}
.pv-msg.ok,.pv-msg.bad,.pv-msg.info{padding:8px 12px}
.pv-msg.ok{background:var(--good-t);color:var(--ink)}
.pv-msg.bad{background:var(--bad-t);color:var(--ink)}
.pv-msg.info{background:var(--sun-t);color:var(--ink)}
.pv-legend{display:flex;flex-wrap:wrap;gap:6px 14px;justify-content:center;margin-top:8px;font-size:13px;color:var(--ink-2)}
.pv-legend i{display:inline-block;width:14px;height:14px;border-radius:4px;background:#FFD23F;border:1.5px solid #B58900;vertical-align:-2px;margin-right:5px}
.pv-legend i.b{filter:brightness(1.22);background:#FFE585}
.pv-legend i.r{box-shadow:0 0 4px #F59E0B}
.pv-exp{width:100%;border-collapse:separate;border-spacing:0 5px;font-size:14px}
.pv-exp td{padding:6px 8px;vertical-align:middle}
.pv-exp td:first-child{border-radius:10px 0 0 10px;font-weight:700}
.pv-exp td:last-child{border-radius:0 10px 10px 0;text-align:right;font:800 17px/1 var(--font-display,inherit)}
.pv-exp tr{background:var(--sunk)}
.pv-exp tr.zero{opacity:.55}
.pv-exp .sw{display:inline-block;width:12px;height:12px;border-radius:4px;margin-right:6px;vertical-align:-1px}
.pv-sum{background:var(--sunk);border-radius:14px;padding:10px 12px;font:700 17px/1.5 var(--font-display,inherit);overflow-wrap:anywhere}
.pv-sum span{border-radius:8px;padding:1px 8px;margin:2px 0;display:inline-block}
.pv-sum .pv-op{background:none;padding:0 3px;color:#F97316}
.pv-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:10px}
.pv-card{background:var(--sunk);border-radius:14px;padding:10px}
.pv-card h3{margin:0 0 6px;font:800 26px/1.1 var(--font-display,inherit);text-align:center}
.pv-card .pv-w{margin:0 0 8px;text-align:center;font-size:13px;color:var(--ink-2)}
.pv-tiles{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:4px}
.pv-tl{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0;border-radius:10px;padding:2px 0 4px;border:2px solid transparent}
.pv-tl small{font:700 10.5px/1.1 var(--font-display,inherit);text-align:center;overflow-wrap:anywhere;color:var(--ink-2)}
.pv-tl b{display:grid;place-items:center;width:100%;max-width:46px;height:44px;border-radius:10px;font:800 24px/1 var(--font-display,inherit);box-shadow:0 2px 0 rgba(0,0,0,.2)}
.pv-tl b.ghost{background:var(--surface)!important;color:var(--ink-2)!important;box-shadow:none;border:2px dashed var(--line)}
.pv-tl.dec{border-color:#F97316;background:var(--sun-t)}
.pv-bar{height:12px;border-radius:6px;background:var(--surface);margin-top:8px;overflow:hidden;border:1px solid var(--line)}
.pv-bar i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,#F97316,#FFD23F);transition:width .5s}
@keyframes pvPop{0%{transform:scale(0);opacity:0}60%{transform:scale(1.25);opacity:1}100%{transform:scale(1);opacity:1}}
@keyframes pvMerge{0%{transform:scale(1);opacity:1}55%{transform:scale(1.15);opacity:1;filter:brightness(1.35)}100%{transform:scale(.1);opacity:0}}
@keyframes pvBreak{0%{transform:scale(1)}30%{transform:scale(1.2) rotate(-7deg)}60%{transform:scale(1.2) rotate(7deg)}100%{transform:scale(.2);opacity:0}}
@keyframes pvAlert{0%,100%{box-shadow:0 0 0 0 rgba(249,115,22,.7)}50%{box-shadow:0 0 0 6px rgba(249,115,22,.0)}}
@media (max-width:699px){.pv-wide{grid-template-columns:repeat(3,minmax(0,1fr))}.pv-wide .pv-ch{font-size:12.5px}}
@media (min-width:700px){.pv{padding:18px}.pv-cmp{flex-direction:row}.pv-cb{flex:1}.pv-ch{font-size:13.5px}.pv-svg{max-height:340px}.pv-dt{min-width:36px;height:50px;font-size:30px}}
@media (prefers-reduced-motion:reduce){.pv *,.pv *::before,.pv *::after{animation:none!important;transition:none!important}}
`;

  // ---------------------------------------------------------------- the lab
  function mount(root, config, api) {
    const t = (x) => api.t(x);
    const lang = () => (api.lang ? api.lang() : 'en');
    const mode = config.mode, P = placesFor(config), maxV = Math.pow(10, P) - 1;
    const target = isInt(config.target) ? config.target : null;
    const A = isInt(config.a) ? config.a : 0, B = isInt(config.b) ? config.b : 0;
    const timers = [];
    const wait = (ms, fn) => timers.push(setTimeout(fn, L.reducedMotion() ? 0 : ms));
    const S = { D: [], C: [], N: [], da: [], db: [], touched: [], over: -1, mergeP: -1, brk: -1, fresh: null, busy: false, msg: null, kind: '', done: false, pick: null, ans: '', met: false, dec: -1, regs: 0 };
    let lastLang = null;

    root.innerHTML = '<div class="pv"><div class="pv-task"></div><div class="pv-top"></div><div class="pv-chart"></div><div class="pv-foot"></div><p class="pv-msg" aria-live="polite"></p></div>';
    const $ = (s) => root.querySelector(s);
    const elTask = $('.pv-task'), elTop = $('.pv-top'), elChart = $('.pv-chart'), elFoot = $('.pv-foot'), elMsg = $('.pv-msg');
    const say = (en, hi, kind) => { S.msg = T2(en, hi); S.kind = kind || 'info'; };
    const val = () => S.D.reduce((s, d, i) => s + d * PL[i].val, 0);

    function init() {
      S.over = -1; S.mergeP = -1; S.brk = -1; S.fresh = null; S.busy = false; S.msg = null; S.kind = ''; S.done = false; S.pick = null; S.ans = ''; S.met = false; S.dec = -1; S.regs = 0;
      S.touched = new Array(P).fill(false);
      if (mode === 'expand') S.D = digs(target, P);
      else S.D = new Array(P).fill(0);
      if (mode === 'add' || mode === 'subtract') {
        S.da = digs(A, P); S.db = digs(B, P);
        S.C = mode === 'add' ? S.da.map((x, i) => x + S.db[i]) : S.da.slice();
        S.N = mode === 'subtract' ? S.db.slice() : new Array(P).fill(0);
      }
    }

    // ---- text
    const task = () => {
      if (mode === 'build') return target != null
        ? T2(`Make ${grp(target)} with blocks. Tap + to add a block to a place. 10 blocks in one place trade up for 1 block in the next place.`, `ब्लॉक से ${grp(target)} बनाओ। किसी स्थान में ब्लॉक जोड़ने के लिए + दबाओ। एक स्थान के 10 ब्लॉक अगले स्थान के 1 ब्लॉक में बदल जाते हैं।`)
        : T2('Tap + to add blocks to a place. 10 blocks in one place trade up for 1 block in the next place.', '+ दबाकर किसी स्थान में ब्लॉक जोड़ो। एक स्थान के 10 ब्लॉक अगले स्थान के 1 ब्लॉक में बदल जाते हैं।');
      if (mode === 'abacus') return T2((target != null ? `Show ${grp(target)} on the abacus. ` : '') + 'Tap a bead to count it on its rod. A rod holds 9 beads: one more makes 10, and that moves to the next rod as 1 bead.',
          (target != null ? `गिनतारे पर ${grp(target)} दिखाओ। ` : '') + 'मनके को दबाकर उसकी छड़ पर गिनो। एक छड़ पर 9 मनके आते हैं: एक और जोड़ने से 10 बनते हैं और वह अगली छड़ पर 1 मनका बन जाता है।');
      if (mode === 'expand') return T2('Every digit has a value that depends on its place. Add or take away blocks and watch the expanded form change.', 'हर अंक का मान उसके स्थान पर निर्भर करता है। ब्लॉक जोड़ो या हटाओ और विस्तारित रूप को बदलते देखो।');
      if (mode === 'add') return T2('Count the blocks in each place. When a place has 10 or more, tap Regroup: 10 blocks become 1 block in the next place. Then type the answer.', 'हर स्थान के ब्लॉक गिनो। जिस स्थान में 10 या अधिक हों, वहाँ पुनः समूह बनाओ दबाओ: 10 ब्लॉक अगले स्थान का 1 ब्लॉक बन जाते हैं। फिर उत्तर लिखो।');
      if (mode === 'subtract') return T2(`Take away the blocks of ${grp(B)} from each place. If a place does not have enough, tap Regroup: break 1 block of the next place into 10. Then type the answer.`, `हर स्थान से ${grp(B)} के ब्लॉक हटाओ। जिस स्थान में काफ़ी ब्लॉक न हों, वहाँ पुनः समूह बनाओ दबाओ: अगले स्थान का 1 ब्लॉक तोड़कर 10 बनाओ। फिर उत्तर लिखो।`);
      return T2('Which number is greater? Compare the places from the left, starting with the biggest place.', 'कौन-सी संख्या बड़ी है? सबसे बड़े स्थान से बाईं ओर से स्थानों की तुलना करो।');
    };
    const needAdd = () => S.C.findIndex((c) => c >= 10);
    const needSub = () => S.C.findIndex((c, i) => c < S.N[i]);
    const status = () => {
      if (S.done) return null;
      if (mode === 'add') { const p = needAdd(); return p >= 0 ? T2(`The ${PL[p].pe} place has ${S.C[p]}: that is 10 or more. Tap Regroup.`, `${PL[p].sh} के स्थान पर ${S.C[p]} हैं: यह 10 या अधिक है। पुनः समूह बनाओ दबाओ।`) : T2('Every place has fewer than 10 blocks. Count them all and type the answer.', 'हर स्थान पर 10 से कम ब्लॉक हैं। सब गिनकर उत्तर लिखो।'); }
      if (mode === 'subtract') { const p = needSub(); return p >= 0 ? T2(`The ${PL[p].pe} place has ${S.C[p]} but must lose ${S.N[p]}: not enough. Tap Regroup.`, `${PL[p].sh} के स्थान पर ${S.C[p]} ब्लॉक हैं पर ${S.N[p]} हटाने हैं: काफ़ी नहीं। पुनः समूह बनाओ दबाओ।`) : T2('Every place has enough blocks. What is left? Type the answer.', 'हर स्थान पर काफ़ी ब्लॉक हैं। क्या बचा? उत्तर लिखो।'); }
      return null;
    };

    // ---- drawing
    const tiles = (n) => {
      const s = grp(n); let idx = String(n).length, o = '';
      for (const ch of s) {
        if (ch === ',') o += '<i class="pv-cm">,</i>';
        else { idx--; o += `<span class="pv-dt" style="background:${PL[idx].col};color:${PL[idx].txt}">${ch}</span>`; }
      }
      return o;
    };
    const colHTML = (p, count, inner, extra, cls) => {
      const c = PL[p];
      return `<div class="pv-col ${cls || ''}" style="--c:${c.col};--t:${c.txt}" role="group" aria-label="${esc(t(c.hdr))}: ${count}">` +
        `<div class="pv-ch">${esc(t(c.hdr))}<small>×${grp(c.val)}</small></div>${inner}${extra || ''}</div>`;
    };
    const btns = (p) => {
      const c = PL[p];
      const a = t(T2(`Add one ${c.se}`, `एक ${c.sh} जोड़ो`)), r = t(T2(`Take away one ${c.se}`, `एक ${c.sh} हटाओ`));
      return `<div class="pv-btns"><button type="button" class="pv-btn pv-plus" data-key="add:${c.id}" aria-label="${esc(a)}" title="${esc(a)}">+</button>` +
        `<button type="button" class="pv-btn" data-key="remove:${c.id}" aria-label="${esc(r)}" title="${esc(r)}">−</button></div>`;
    };
    const freshCls = (p, i) => (S.fresh && S.fresh.p === p && i >= S.fresh.from && i < S.fresh.to ? { cls: 'pv-new', d: (i - S.fresh.from) * 0.04 } : {});

    function liveHTML() {
      const v = val();
      const w = t(words(v));
      return `<div class="pv-live" aria-live="polite" aria-atomic="true"><div class="pv-vals" role="img" aria-label="${esc(grp(v))}">${tiles(v)}</div><div class="pv-words">${esc(w)}</div></div>`;
    }
    function topHTML() {
      if (mode === 'build' || mode === 'abacus') {
        let h = '';
        if (target != null) {
          h += `<div class="pv-goal ${S.met ? 'met' : ''}"><span>${esc(t(T2('Make', 'बनाओ')))}</span><b>${grp(target)}</b><small>${esc(t(words(target)))}</small>${S.met ? `<span class="pv-tick" aria-hidden="true">✓</span>` : ''}</div>`;
        }
        return h + liveHTML();
      }
      if (mode === 'expand') return liveHTML();
      if (mode === 'compare') return '';
      const op = mode === 'add' ? '+' : '−';
      const res = S.done ? grp(mode === 'add' ? A + B : A - B) : '?';
      return `<div class="pv-eq" role="img" aria-label="${esc(grp(A))} ${mode === 'add' ? esc(t(T2('plus', 'जमा'))) : esc(t(T2('minus', 'घटा')))} ${esc(grp(B))}"><span>${grp(A)}</span><span class="pv-op">${op}</span><span>${grp(B)}</span><span class="pv-op">=</span><span class="pv-q ${S.done ? 'ok' : ''}">${res}</span></div>`;
    }

    function chartHTML() {
      if (mode === 'compare') return compareHTML();
      let g = `<div class="pv-grid${P > 4 ? ' pv-wide' : ''}" style="--n:${P}">`;
      for (let p = P - 1; p >= 0; p--) {
        if (mode === 'build' || mode === 'expand') {
          const n = S.D[p], items = [];
          for (let i = 0; i < n; i++) items.push(Object.assign({}, freshCls(p, i), S.mergeP === p ? { cls: 'pv-merge' } : {}));
          g += colHTML(p, n, blocksSVG(p, items), `<div class="pv-cnt ${n >= 10 ? 'warn' : ''}">${n}</div>` + btns(p));
        } else if (mode === 'abacus') {
          g += colHTML(p, S.D[p], abacusSVG(p, S.D[p], api), `<div class="pv-cnt">${Math.min(S.D[p], 9)}</div>` + btns(p));
        } else if (mode === 'add') {
          const n = S.C[p], items = [];
          for (let i = 0; i < n; i++) {
            const kind = S.touched[p] ? 'r' : i < S.da[p] ? 'a' : i < S.da[p] + S.db[p] ? 'b' : 'r';
            const o = freshCls(p, i);
            items.push({ cls: `pv-k${kind} ${o.cls || ''} ${S.mergeP === p && i >= n - 10 ? 'pv-merge' : ''}`, d: o.d });
          }
          const warn = n >= 10;
          g += colHTML(p, n, blocksSVG(p, items), `<div class="pv-cnt ${warn ? 'warn' : ''}">${n}</div><div class="pv-sub ${warn ? 'bad' : ''}">${warn ? '10+' : '&nbsp;'}</div>`, warn && !S.busy ? 'alert' : '');
        } else {
          const n = S.C[p], need = S.N[p], enough = n >= need, items = [];
          for (let i = 0; i < n; i++) {
            const o = freshCls(p, i);
            const brk = S.brk === p && i === n - 1 ? 'pv-brk' : '';
            items.push({ cls: `${enough && i < need ? 'pv-xx' : ''} ${o.cls || ''} ${brk}`, cross: enough && i < need, d: o.d });
          }
          const low = needSub() >= 0 ? '' : `<div class="pv-sub res">= ${n - need}</div>`;
          g += colHTML(p, n, blocksSVG(p, items), `<div class="pv-cnt ${enough ? '' : 'warn'}">${n}</div><div class="pv-sub ${enough ? '' : 'bad'}">−${need}${enough ? '' : ' ✗'}</div>${low}`, !enough && !S.busy && needSub() === p ? 'alert' : '');
        }
      }
      g += '</div>';
      if (mode === 'add') g += `<div class="pv-legend"><span><i></i>${esc(t(T2('from ' + grp(A), grp(A) + ' से')))}</span><span><i class="b"></i>${esc(t(T2('from ' + grp(B), grp(B) + ' से')))}</span><span><i class="r"></i>${esc(t(T2('after regrouping', 'समूह बदलने के बाद')))}</span></div>`;
      if (mode === 'subtract') g += `<div class="pv-legend"><span>✗ ${esc(t(T2('crossed = taken away', 'कटे हुए = हटाए गए')))}</span></div>`;
      if (mode === 'expand') g += expandHTML();
      return g;
    }
    function expandHTML() {
      const v = val(), rows = [], terms = [];
      for (let p = P - 1; p >= 0; p--) {
        const d = S.D[p], c = PL[p];
        if (d === 10) continue;
        rows.push(`<tr class="${d ? '' : 'zero'}"><td><span class="sw" style="background:${c.col}"></span>${esc(t(c.hdr))}</td><td>${d} × ${grp(c.val)}</td><td>${grp(d * c.val)}</td></tr>`);
        if (d) terms.push(`<span style="background:${c.col};color:${c.txt}">${grp(d * c.val)}</span>`);
      }
      const sumLine = v === 0 ? '0' : terms.join('<span class="pv-op">+</span>');
      return `<table class="pv-exp" style="margin-top:10px"><caption style="text-align:left;font-weight:700;padding:4px 0">${esc(t(T2('Value of each digit', 'हर अंक का मान')))}</caption><tbody>${rows.join('')}</tbody></table>` +
        `<div class="pv-sum" aria-live="polite"><div>${esc(t(T2('Expanded form', 'विस्तारित रूप')))}</div>${sumLine}<span class="pv-op">=</span><span style="background:var(--surface)">${grp(v)}</span></div>`;
    }
    function compareHTML() {
      const mx = Math.max(A, B, 1);
      const card = (n, label) => {
        const d = digs(n, P), lead = nDigits(n);
        let tl = '';
        for (let p = P - 1; p >= 0; p--) {
          const c = PL[p], ghost = p >= lead;
          tl += `<div class="pv-tl ${S.dec === p ? 'dec' : ''}"><small>${esc(t(c.hdr))}</small><b class="${ghost ? 'ghost' : ''}" style="background:${c.col};color:${c.txt}">${ghost ? '·' : d[p]}</b></div>`;
        }
        return `<div class="pv-card" role="group" aria-label="${esc(label)}"><h3>${grp(n)}</h3><p class="pv-w">${esc(t(words(n)))}</p><div class="pv-tiles" style="--n:${P}">${tl}</div><div class="pv-bar" aria-hidden="true"><i style="width:${Math.max(3, (100 * n) / mx)}%"></i></div></div>`;
      };
      return `<div class="pv-cards">${card(A, t(T2('First number', 'पहली संख्या')))}${card(B, t(T2('Second number', 'दूसरी संख्या')))}</div>`;
    }

    // ---- the foot (buttons that stay in place while the chart redraws)
    function buildFoot() {
      let h = '';
      if (mode === 'add' || mode === 'subtract') {
        h += `<button type="button" class="pv-btn pv-reg" data-key="regroup"><span aria-hidden="true">⇄</span> ${esc(t(T2('Regroup', 'पुनः समूह बनाओ')))}</button>`;
        h += `<form class="pv-ans" data-key="answer" novalidate><label for="pv-in">${esc(t(T2('Your answer', 'तुम्हारा उत्तर')))}</label>` +
          `<input id="pv-in" class="pv-in" type="text" inputmode="numeric" autocomplete="off" maxlength="9" value="${esc(S.ans)}" aria-label="${esc(t(T2('Type your answer', 'अपना उत्तर लिखो')))}">` +
          `<button type="submit" class="pv-btn pv-chk">${esc(t(T2('Check', 'जाँचो')))}</button></form>`;
      }
      if (mode === 'compare') {
        const o = (s, en, hi) => `<button type="button" class="pv-cb" data-cmp="${s}" aria-label="${esc(t(T2(en, hi)))}"><span class="pv-cn">${grp(A)}</span><span class="pv-cs" aria-hidden="true">${s === '<' ? '&lt;' : s === '>' ? '&gt;' : '='}</span><span class="pv-cn">${grp(B)}</span></button>`;
        h += `<div class="pv-cmp" data-key="answer" role="group" aria-label="${esc(t(T2('Choose less than, equal or greater than', 'छोटा, बराबर या बड़ा चुनो')))}">` +
          o('<', `${grp(A)} is less than ${grp(B)}`, `${grp(A)}, ${grp(B)} से छोटा है`) + o('=', `${grp(A)} is equal to ${grp(B)}`, `${grp(A)}, ${grp(B)} के बराबर है`) + o('>', `${grp(A)} is greater than ${grp(B)}`, `${grp(A)}, ${grp(B)} से बड़ा है`) + '</div>';
      }
      const rl = mode === 'build' || mode === 'abacus' || mode === 'expand' ? T2('Clear', 'साफ़ करो') : T2('Start again', 'फिर से शुरू करो');
      h += `<button type="button" class="pv-btn pv-reset" data-key="reset">↺ ${esc(t(mode === 'expand' ? T2('Start again', 'फिर से शुरू करो') : rl))}</button>`;
      elFoot.innerHTML = h;
      lastLang = lang();
    }
    function updateFoot() {
      const reg = elFoot.querySelector('.pv-reg');
      if (reg) reg.classList.toggle('need', !S.done && !S.busy && (mode === 'add' ? needAdd() >= 0 : needSub() >= 0));
      const inp = elFoot.querySelector('.pv-in'), chk = elFoot.querySelector('.pv-chk');
      if (inp) { inp.disabled = S.done; chk.disabled = S.done; }
      elFoot.querySelectorAll('.pv-cb').forEach((b) => {
        b.classList.toggle('right', S.done && S.pick === b.dataset.cmp);
        b.classList.toggle('wrong', !S.done && S.pick === b.dataset.cmp);
        b.disabled = S.done;
        b.setAttribute('aria-pressed', S.pick === b.dataset.cmp ? 'true' : 'false');
      });
    }

    function render() {
      if (lastLang !== lang()) buildFoot();
      elTask.innerHTML = esc(t(task())) + (status() ? `<span class="pv-st">${esc(t(status()))}</span>` : '');
      elTop.innerHTML = topHTML();
      elChart.innerHTML = chartHTML();
      elMsg.className = 'pv-msg ' + (S.msg ? S.kind : '');
      elMsg.textContent = S.msg ? t(S.msg) : '';
      updateFoot();
    }

    // ---- build / abacus / expand
    function checkTarget() {
      if (target == null || mode === 'expand') return;
      const ok = val() === target;
      if (ok && !S.met) {
        S.met = true;
        say(`You made ${grp(target)}: ${wordsEn(target)}.`, `तुमने ${grp(target)} बना लिया: ${wordsHi(target)}।`, 'ok');
        api.record(t(T2(`Made ${grp(target)}`, `${grp(target)} बनाया`)));
        api.celebrate();
        api.speak(t(words(target)), lang());
      } else if (!ok) S.met = false;
    }
    function changed() {
      const v = val();
      api.emit('built:' + v);
      checkTarget();
      render();
    }
    function carryFrom(p, popped, first) {
      S.busy = true;
      if (first) say(`10 ${PL[p].pe} = 1 ${PL[p + 1].se}. Trading up!`, `10 ${PL[p].ph} = 1 ${PL[p + 1].sh}। अगले स्थान में बदल रहे हैं!`, 'info');
      render();
      wait(popped ? 380 : 480, () => {
        S.mergeP = p; render();
        wait(560, () => {
          S.D[p] = 0; S.mergeP = -1; S.D[p + 1]++;
          S.fresh = { p: p + 1, from: S.D[p + 1] - 1, to: S.D[p + 1] };
          if (S.D[p + 1] >= 10) { carryFrom(p + 1, true, false); return; }
          S.busy = false;
          api.emit('regrouped');
          api.record(t(T2(`Traded 10 ${PL[p].pe} for 1 ${PL[p + 1].se}`, `10 ${PL[p].ph} के बदले 1 ${PL[p + 1].sh} लिया`)));
          changed();
        });
      });
    }
    function addTo(p) {
      if (S.D[p] < 9) { S.D[p]++; S.fresh = { p, from: S.D[p] - 1, to: S.D[p] }; if (!S.msg || S.kind !== 'ok') S.msg = null; changed(); return; }
      if (val() + PL[p].val > maxV) { say(`This chart stops at ${grp(maxV)}.`, `यह चार्ट ${grp(maxV)} तक ही जाता है।`, 'bad'); render(); return; }
      S.D[p] = 10; S.fresh = { p, from: 9, to: 10 };
      carryFrom(p, false, true);
    }
    function removeFrom(p) {
      if (S.D[p] <= 0) { say(`There are no ${PL[p].pe} here to take away.`, `यहाँ हटाने के लिए कोई ${PL[p].sh} नहीं है।`, 'bad'); render(); return; }
      S.D[p]--; S.fresh = null; S.msg = null; changed();
    }
    function beadTap(p, i) {
      const n = S.D[p];
      S.D[p] = i < n ? i : i + 1;
      S.fresh = null; S.msg = null;
      changed();
    }

    // ---- add / subtract
    function regroup() {
      if (S.busy || S.done) return;
      if (mode === 'add') {
        const p = needAdd();
        if (p < 0) { say('No place has 10 or more blocks, so there is nothing to regroup. Type the answer.', 'किसी स्थान पर 10 या अधिक ब्लॉक नहीं हैं, इसलिए समूह बदलने की ज़रूरत नहीं। उत्तर लिखो।', 'info'); render(); return; }
        S.busy = true; S.mergeP = p;
        say(`10 ${PL[p].pe} = 1 ${PL[p + 1].se}.`, `10 ${PL[p].ph} = 1 ${PL[p + 1].sh}।`, 'info');
        render();
        wait(600, () => {
          S.C[p] -= 10; S.C[p + 1]++; S.touched[p] = true; S.mergeP = -1; S.busy = false; S.regs++;
          S.fresh = { p: p + 1, from: S.C[p + 1] - 1, to: S.C[p + 1] };
          const q = needAdd();
          say(`Regrouped: 10 ${PL[p].pe} became 1 ${PL[p + 1].se}. ${q >= 0 ? `The ${PL[q].pe} place still has 10 or more.` : 'Now count each place.'}`, `समूह बदला: 10 ${PL[p].ph} से 1 ${PL[p + 1].sh} बना। ${q >= 0 ? `${PL[q].sh} के स्थान पर अब भी 10 या अधिक हैं।` : 'अब हर स्थान गिनो।'}`, 'info');
          api.record(t(T2(`Regrouped 10 ${PL[p].pe} into 1 ${PL[p + 1].se}`, `10 ${PL[p].ph} का 1 ${PL[p + 1].sh} बनाया`)));
          api.emit('regrouped');
          render();
        });
      } else {
        const p = needSub();
        if (p < 0) { say('Every place has enough blocks, so there is nothing to regroup. Type the answer.', 'हर स्थान पर काफ़ी ब्लॉक हैं, इसलिए समूह बदलने की ज़रूरत नहीं। उत्तर लिखो।', 'info'); render(); return; }
        let q = p + 1;
        while (q < P && S.C[q] === 0) q++;
        if (q >= P) { say('There is nothing left to regroup from.', 'समूह बदलने के लिए कुछ बचा नहीं है।', 'bad'); render(); return; }
        S.busy = true; S.brk = q;
        say(`Break 1 ${PL[q].se} into 10 ${PL[q - 1].pe}.`, `1 ${PL[q].sh} को तोड़कर 10 ${PL[q - 1].ph} बनाओ।`, 'info');
        render();
        wait(600, () => {
          S.C[q]--; S.C[q - 1] += 10; S.brk = -1; S.busy = false; S.regs++;
          S.fresh = { p: q - 1, from: S.C[q - 1] - 10, to: S.C[q - 1] };
          const r = needSub();
          say(`Regrouped: 1 ${PL[q].se} = 10 ${PL[q - 1].pe}. ${r >= 0 ? `The ${PL[r].pe} place may still need more.` : 'Now every place has enough.'}`, `समूह बदला: 1 ${PL[q].sh} = 10 ${PL[q - 1].ph}। ${r >= 0 ? `${PL[r].sh} के स्थान को शायद और चाहिए।` : 'अब हर स्थान पर काफ़ी ब्लॉक हैं।'}`, 'info');
          api.record(t(T2(`Regrouped 1 ${PL[q].se} into 10 ${PL[q - 1].pe}`, `1 ${PL[q].sh} के 10 ${PL[q - 1].ph} बनाए`)));
          api.emit('regrouped');
          render();
        });
      }
    }
    function checkAnswer() {
      if (S.done || S.busy) return;
      const raw = (S.ans || '').replace(/[,\s]/g, '');
      if (!/^\d+$/.test(raw)) { api.toast(T2('Type the answer using digits.', 'अंकों में उत्तर लिखो।')); return; }
      const v = +raw, want = mode === 'add' ? A + B : A - B;
      if (v === want) {
        S.done = true;
        say(`Yes! ${grp(A)} ${mode === 'add' ? '+' : '−'} ${grp(B)} = ${grp(want)} (${wordsEn(want)}).`, `हाँ! ${grp(A)} ${mode === 'add' ? '+' : '−'} ${grp(B)} = ${grp(want)} (${wordsHi(want)})।`, 'ok');
        api.record(t(T2(`Answered ${grp(v)}: right`, `उत्तर ${grp(v)}: सही`)));
        api.emit('answered:right');
        api.celebrate();
      } else {
        const pend = mode === 'add' ? needAdd() : needSub();
        if (pend >= 0) say(`Not yet. The ${PL[pend].pe} place still needs regrouping. Tap Regroup first.`, `अभी नहीं। ${PL[pend].sh} के स्थान पर अभी समूह बदलना बाकी है। पहले पुनः समूह बनाओ दबाओ।`, 'bad');
        else {
          const dw = digs(want, P), dv = digs(v, P);
          const lo = dw.findIndex((d, i) => d !== dv[i]);
          const p = lo < 0 || v >= Math.pow(10, P) ? 0 : lo;
          say(`Not quite. Look at the ${PL[p].pe} place again and count the blocks there.`, `अभी सही नहीं। ${PL[p].sh} के स्थान को फिर देखो और वहाँ के ब्लॉक गिनो।`, 'bad');
        }
        api.record(t(T2(`Answered ${grp(v)}: wrong`, `उत्तर ${grp(v)}: ग़लत`)));
        api.emit('answered:wrong');
      }
      render();
    }

    // ---- compare
    function pickCmp(s) {
      if (S.done) return;
      const truth = A < B ? '<' : A > B ? '>' : '=';
      S.pick = s;
      if (s === truth) {
        S.done = true;
        let en, hi;
        if (A === B) { en = 'Every place matches, so the numbers are equal.'; hi = 'हर स्थान का अंक एक-सा है, इसलिए संख्याएँ बराबर हैं।'; S.dec = -1; }
        else if (nDigits(A) !== nDigits(B)) {
          const big = A > B ? A : B;
          en = `${grp(big)} has more digits, so it is greater: ${grp(Math.max(A, B))} > ${grp(Math.min(A, B))}.`; hi = `${grp(big)} में अधिक अंक हैं, इसलिए वह बड़ी है: ${grp(Math.max(A, B))} > ${grp(Math.min(A, B))}।`;
          S.dec = nDigits(big) - 1;
        } else {
          let p = P - 1;
          const da = digs(A, P), db = digs(B, P);
          while (p > 0 && da[p] === db[p]) p--;
          S.dec = p;
          const hi_ = Math.max(da[p], db[p]), lo_ = Math.min(da[p], db[p]);
          en = `Both have ${nDigits(A)} digits. Compare from the left: the first place that differs is ${PL[p].pe}, ${hi_} against ${lo_}. So ${grp(Math.max(A, B))} is greater.`;
          hi = `दोनों में ${nDigits(A)} अंक हैं। बाईं ओर से तुलना करो: पहला अलग स्थान ${PL[p].sh} का है, ${hi_} और ${lo_}। इसलिए ${grp(Math.max(A, B))} बड़ी है।`;
        }
        say(en, hi, 'ok');
        api.record(t(T2(`Compared: ${grp(A)} ${s} ${grp(B)} (right)`, `तुलना: ${grp(A)} ${s} ${grp(B)} (सही)`)));
        api.emit('answered:right');
        api.celebrate();
      } else {
        say('Not quite. Start at the biggest place on the left and compare the digits one place at a time.', 'अभी नहीं। बाईं ओर के सबसे बड़े स्थान से शुरू करो और एक-एक स्थान के अंक मिलाओ।', 'bad');
        api.record(t(T2(`Compared: ${grp(A)} ${s} ${grp(B)} (wrong)`, `तुलना: ${grp(A)} ${s} ${grp(B)} (ग़लत)`)));
        api.emit('answered:wrong');
      }
      render();
    }

    function reset() {
      if (S.busy) return;
      init();
      if (elFoot.querySelector('.pv-in')) elFoot.querySelector('.pv-in').value = '';
      render();
    }

    // ---- events
    function act(key, fn) {
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (S.busy) return;
      fn();
    }
    function onClick(e) {
      const bead = e.target.closest && e.target.closest('[data-bead]');
      if (bead && root.contains(bead)) { const [id, i] = bead.dataset.bead.split(':'); const p = PL.findIndex((x) => x.id === id); act('bead:' + id, () => beadTap(p, +i)); return; }
      const cb = e.target.closest && e.target.closest('[data-cmp]');
      if (cb && root.contains(cb)) { act('answer', () => pickCmp(cb.dataset.cmp)); return; }
      const el = e.target.closest && e.target.closest('button[data-key]');
      if (!el || !root.contains(el)) return;
      const key = el.dataset.key, [verb, id] = key.split(':'), p = PL.findIndex((x) => x.id === id);
      if (verb === 'add' && p >= 0) act(key, () => addTo(p));
      else if (verb === 'remove' && p >= 0) act(key, () => removeFrom(p));
      else if (verb === 'regroup') act(key, regroup);
      else if (verb === 'reset') act(key, reset);
    }
    function onKey(e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('[data-bead]')) { e.preventDefault(); onClick(e); }
    }
    function onSubmit(e) {
      e.preventDefault();
      act('answer', checkAnswer);
    }
    function onInput(e) {
      if (e.target.classList && e.target.classList.contains('pv-in')) {
        const clean = e.target.value.replace(/[^\d,\s]/g, '');
        if (clean !== e.target.value) e.target.value = clean;
        S.ans = clean;
      }
    }
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    root.addEventListener('submit', onSubmit);
    root.addEventListener('input', onInput);

    init();
    buildFoot();
    render();
    return {
      destroy() {
        timers.forEach(clearTimeout);
        root.removeEventListener('click', onClick);
        root.removeEventListener('keydown', onKey);
        root.removeEventListener('submit', onSubmit);
        root.removeEventListener('input', onInput);
      },
    };
  }

  NCA_T.register({
    id: 'place-value',
    css: CSS,
    validate,
    keys,
    demo: { mode: 'add', a: 4678, b: 2547 },
    mount,
  });
})();
