// Template: Timeline. Place events, people and inventions in time (BCE and CE), put them in order, find cause and
// effect, and compare how far apart they are. The template does the date arithmetic itself: years are counted the
// historian's way (there is no year 0, so 1 BCE is followed by 1 CE), BCE numbers run backwards, and every answer is
// computed from the years in the config, never typed in by a lab author. Config:
//   { range: [start year, end year] (negative = BCE),
//     events: [{ id, year, label: {en,hi}, detail?: {en,hi}, image?: asset id }],
//     task: 'order' | 'place' | 'cause-effect' | 'compare',
//     links?: [{ from: event id, to: event id, why?: {en,hi} }]   // cause-effect: which event led to which
//     step?: bin width in years for 'place' (default: a round number giving about 8 slots),
//     title?, prompt?: {en,hi} }
(function () {
  const L = window.NCA_LIB;
  const { esc } = L;
  const T2 = (en, hi) => ({ en, hi });
  const KEYS = ['range', 'events', 'task', 'links', 'step', 'title', 'prompt'];
  const TASKS = ['order', 'place', 'cause-effect', 'compare'];
  const NICE = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const PAL = [['#1D4ED8', '#fff'], ['#8B3DFF', '#fff'], ['#0F766E', '#fff'], ['#FF7A1A', '#1E293B'], ['#FF6B57', '#1E293B'], ['#14B8A6', '#1E293B'],
    ['#4400F0', '#fff'], ['#F5B90A', '#1E293B'], ['#2563EB', '#fff'], ['#22C55E', '#1E293B'], ['#02CFF9', '#1E293B'], ['#FFD23F', '#1E293B']];
  const LET = { en: 'ABCDEFGHIJKL'.split(''), hi: 'कखगघचछजझटठडढ'.split('') };
  const isBi = (x) => !!x && typeof x === 'object' && typeof x.en === 'string' && x.en.trim() !== '' && typeof x.hi === 'string' && x.hi.trim() !== '';
  const isInt = (n) => typeof n === 'number' && Number.isInteger(n);
  // Calendar year to a continuous count (no year 0): 1 BCE -> 0, 1 CE -> 1.
  const lin = (y) => (y < 0 ? y + 1 : y);
  const gapYears = (a, b) => lin(b) - lin(a);

  // Width of one slot for the "place" task and the slots themselves.
  function binInfo(cfg) {
    const a = cfg.range[0], b = cfg.range[1];
    const span = lin(b) - lin(a);
    let step = cfg.step;
    if (!step) step = NICE.find((s) => Math.ceil(span / s) + 1 <= 10) || 5000;
    const first = Math.floor(a / step) * step;
    const bins = [];
    for (let s = first; bins.length < 400; s += step) { bins.push(s); if (b < s + step) break; }
    return { step, first, bins, end: first + bins.length * step };
  }
  const binOf = (y, step) => Math.floor(y / step) * step;

  // The questions of the cause-effect and compare tasks, computed from the years (and the links).
  function buildQuestions(cfg) {
    const evs = cfg.events, by = Object.fromEntries(evs.map((e) => [e.id, e]));
    const qs = [];
    if (cfg.task === 'cause-effect') {
      const links = cfg.links || [];
      if (links.length) {
        const seen = new Set();
        links.forEach((l, i) => {
          const effect = i % 2 === 0;
          const subject = effect ? l.from : l.to;
          const key = (effect ? 'e:' : 'c:') + subject;
          if (seen.has(key)) return;
          seen.add(key);
          const valid = links.filter((k) => (effect ? k.from === subject : k.to === subject)).map((k) => (effect ? k.to : k.from));
          const why = links.find((k) => (effect ? k.from === subject : k.to === subject) && k.why);
          qs.push({ kind: effect ? 'effect' : 'cause', subject, valid, linked: true, why: why ? why.why : null, pair: [l.from, l.to] });
        });
      } else {
        const order = evs.slice().sort((a, b) => lin(a.year) - lin(b.year));
        order.forEach((e) => {
          const later = evs.filter((x) => lin(x.year) > lin(e.year)), earlier = evs.filter((x) => lin(x.year) < lin(e.year));
          if (qs.length % 2 === 0 && later.length && earlier.length) qs.push({ kind: 'effect', subject: e.id, valid: later.map((x) => x.id), linked: false });
          else if (earlier.length && later.length) qs.push({ kind: 'cause', subject: e.id, valid: earlier.map((x) => x.id), linked: false });
        });
        qs.splice(5);
      }
    } else if (cfg.task === 'compare') {
      const order = evs.slice().sort((a, b) => lin(a.year) - lin(b.year));
      const pairs = [];
      for (let i = 0; i + 1 < order.length && pairs.length < 3; i += 1) {
        if (order[i].year !== order[i + 1].year) pairs.push([order[i], order[i + 1]]);
      }
      // alternate the order the pair is listed in
      pairs.forEach((p, i) => {
        const [x, y] = i % 2 ? [p[1], p[0]] : p;
        qs.push({ kind: 'first', subject: null, cand: [x.id, y.id], valid: [p[0].id], pair: [p[0].id, p[1].id] });
      });
      // closest in time: three others with different distances
      for (const e of order) {
        if (qs.length >= 6 || order.length < 4) break;
        const others = order.filter((o) => o.id !== e.id).map((o) => ({ id: o.id, d: Math.abs(gapYears(e.year, o.year)) })).sort((a, b) => a.d - b.d);
        const ds = [others[0], others[Math.floor(others.length / 2)], others[others.length - 1]];
        if (new Set(ds.map((d) => d.d)).size === 3 && ds.every((d) => d.d > 0) && qs.filter((q) => q.kind === 'closest').length < 2 && order.indexOf(e) > 0) {
          qs.push({ kind: 'closest', subject: e.id, cand: ds.map((d) => d.id), valid: [ds[0].id], pair: [e.id, ds[0].id] });
        }
      }
      if (order.length >= 3) {
        const pick = [order[0], order[Math.floor(order.length / 2)], order[order.length - 1]];
        if (new Set(pick.map((p) => p.year)).size === 3) qs.push({ kind: 'oldest', subject: null, cand: pick.map((p) => p.id).reverse(), valid: [pick[0].id], pair: null });
      }
    }
    qs.forEach((q) => { if (!q.cand) q.cand = evs.filter((e) => e.id !== q.subject).map((e) => e.id); });
    return qs.filter((q) => q.cand.every((id) => by[id]));
  }

  function validate(config) {
    const errs = [];
    const c = config;
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
    Object.keys(c).forEach((k) => { if (!KEYS.includes(k)) errs.push(`unknown config key "${k}"`); });
    if (!TASKS.includes(c.task)) errs.push(`task must be one of ${TASKS.join(', ')}`);
    let rangeOK = false;
    if (!Array.isArray(c.range) || c.range.length !== 2 || !isInt(c.range[0]) || !isInt(c.range[1])) errs.push('range must be [start year, end year] as whole numbers (negative = BCE)');
    else if (c.range[0] >= c.range[1]) errs.push('range start must be earlier than range end');
    else if (lin(c.range[1]) - lin(c.range[0]) < 3) errs.push('range must cover at least 3 years');
    else if (lin(c.range[1]) - lin(c.range[0]) > 20000) errs.push('range may cover at most 20000 years');
    else rangeOK = true;
    const ids = new Set();
    let evOK = false;
    if (!Array.isArray(c.events)) errs.push('events must be an array');
    else {
      const min = c.task === 'compare' ? 2 : 3;
      if (c.events.length < min) errs.push(`events: at least ${min} needed for task "${c.task}"`);
      const max = c.task === 'order' || c.task === 'place' ? 12 : 10;
      if (c.events.length > max) errs.push(`events: at most ${max} for task "${c.task}"`);
      c.events.forEach((e, i) => {
        const w = `events[${i}]`;
        if (!e || typeof e !== 'object') { errs.push(`${w} must be an object`); return; }
        if (typeof e.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(e.id)) errs.push(`${w}.id must be letters, digits, - or _`);
        else if (ids.has(e.id)) errs.push(`${w}.id "${e.id}" is repeated`);
        else ids.add(e.id);
        if (!isInt(e.year)) errs.push(`${w}.year must be a whole number`);
        else if (e.year === 0) errs.push(`${w}.year cannot be 0 (there is no year 0: 1 BCE is followed by 1 CE)`);
        else if (rangeOK && (e.year < c.range[0] || e.year > c.range[1])) errs.push(`${w}.year ${e.year} is outside range`);
        if (!isBi(e.label)) errs.push(`${w}.label needs both en and hi`);
        if (e.detail != null && !isBi(e.detail)) errs.push(`${w}.detail needs both en and hi`);
        if (e.image != null && (typeof e.image !== 'string' || !e.image)) errs.push(`${w}.image must be an asset id`);
        Object.keys(e).forEach((k) => { if (!['id', 'year', 'label', 'detail', 'image'].includes(k)) errs.push(`${w}: unknown key "${k}"`); });
      });
      evOK = !errs.length;
      if (c.task === 'order' && c.events.length) {
        const ys = c.events.map((e) => e && e.year);
        if (new Set(ys).size !== ys.length) errs.push('task "order" needs a different year for every event (two events in one year cannot be ordered)');
      }
    }
    if (c.title != null && !isBi(c.title)) errs.push('title needs both en and hi');
    if (c.prompt != null && !isBi(c.prompt)) errs.push('prompt needs both en and hi');
    if (c.step != null) {
      if (c.task !== 'place') errs.push('step is only for task "place"');
      else if (!isInt(c.step) || c.step < 1) errs.push('step must be a whole number of years, 1 or more');
      else if (rangeOK && binInfo(c).bins.length > 24) errs.push('step is too small: the slots would be more than 24');
      else if (rangeOK && binInfo(c).bins.length < 2) errs.push('step is too large: at least 2 slots are needed');
    }
    if (c.links != null) {
      if (!Array.isArray(c.links)) errs.push('links must be an array');
      else {
        const by = Array.isArray(c.events) ? Object.fromEntries(c.events.filter((e) => e && typeof e.id === 'string').map((e) => [e.id, e])) : {};
        const seen = new Set();
        c.links.forEach((l, i) => {
          const w = `links[${i}]`;
          if (!l || typeof l !== 'object') { errs.push(`${w} must be an object`); return; }
          if (!by[l.from]) errs.push(`${w}.from "${l.from}" is not an event id`);
          if (!by[l.to]) errs.push(`${w}.to "${l.to}" is not an event id`);
          if (by[l.from] && by[l.to]) {
            if (l.from === l.to) errs.push(`${w}: an event cannot cause itself`);
            else if (by[l.from].year > by[l.to].year) errs.push(`${w}: "${l.from}" (${by[l.from].year}) is after "${l.to}" (${by[l.to].year}), so it cannot be its cause`);
            if (seen.has(l.from + '>' + l.to)) errs.push(`${w} repeats an earlier link`);
            seen.add(l.from + '>' + l.to);
          }
          if (l.why != null && !isBi(l.why)) errs.push(`${w}.why needs both en and hi`);
          Object.keys(l).forEach((k) => { if (!['from', 'to', 'why'].includes(k)) errs.push(`${w}: unknown key "${k}"`); });
        });
        if (c.task !== 'cause-effect' && c.links.length && !errs.length) { /* harmless: only cause-effect asks about links */ }
      }
    }
    if (!errs.length && evOK && rangeOK && (c.task === 'cause-effect' || c.task === 'compare')) {
      if (!buildQuestions(c).length) errs.push(c.task === 'compare' ? 'compare needs at least two events in different years' : 'cause-effect needs links, or at least three events in three different years');
    }
    return errs;
  }

  function keys(config) {
    const c = config || {};
    const evs = Array.isArray(c.events) ? c.events.filter((e) => e && typeof e.id === 'string') : [];
    const targets = evs.map((e) => 'event:' + e.id);
    const events = [];
    if (c.task === 'place' && Array.isArray(c.range) && isInt(c.range[0]) && isInt(c.range[1]) && c.range[0] < c.range[1]) binInfo(c).bins.forEach((s) => targets.push('slot:' + s));
    targets.push('answer', 'zoom', 'reset');
    if (c.task === 'order' || c.task === 'place') { evs.forEach((e) => events.push('placed:' + e.id)); events.push('ordered'); }
    events.push('answered:right', 'answered:wrong', 'zoomed');
    return { targets, events };
  }

  const demo = {
    range: [1850, 1950],
    task: 'cause-effect',
    events: [
      { id: 'revolt', year: 1857, label: T2('The Revolt of 1857', '1857 का विद्रोह'), detail: T2('Soldiers and many other people rose against the rule of the East India Company.', 'सिपाहियों और कई और लोगों ने ईस्ट इंडिया कंपनी के शासन के विरुद्ध विद्रोह किया।') },
      { id: 'crown', year: 1858, label: T2('The British Crown takes over', 'ब्रिटिश ताज ने शासन सँभाला'), detail: T2('The Company\'s rule ended and India was ruled directly by the British Crown.', 'कंपनी का शासन समाप्त हुआ और भारत पर सीधे ब्रिटिश ताज का शासन हो गया।') },
      { id: 'inc', year: 1885, label: T2('Indian National Congress founded', 'भारतीय राष्ट्रीय कांग्रेस की स्थापना'), detail: T2('Educated Indians from many regions met to speak together about the country\'s problems.', 'कई क्षेत्रों के पढ़े-लिखे भारतीय देश की समस्याओं पर साथ बोलने के लिए मिले।') },
      { id: 'partition', year: 1905, label: T2('Partition of Bengal', 'बंगाल का विभाजन'), detail: T2('Bengal was divided into two parts, and many people protested.', 'बंगाल को दो भागों में बाँटा गया और बहुत लोगों ने विरोध किया।') },
      { id: 'rowlatt', year: 1919, label: T2('The Rowlatt Act', 'रॉलेट एक्ट'), detail: T2('A law that let the government jail people without trial. Indians protested against it.', 'एक कानून जिससे सरकार बिना मुकदमे के लोगों को जेल में डाल सकती थी। भारतीयों ने इसका विरोध किया।') },
      { id: 'jallianwala', year: 1919, label: T2('Jallianwala Bagh massacre', 'जलियाँवाला बाग हत्याकांड'), detail: T2('On 13 April, soldiers fired on a peaceful crowd gathered in a garden in Amritsar.', '13 अप्रैल को अमृतसर के एक बाग में इकट्ठा शांतिपूर्ण भीड़ पर सैनिकों ने गोलियाँ चलाईं।') },
      { id: 'noncoop', year: 1920, label: T2('Non-Cooperation Movement', 'असहयोग आंदोलन'), detail: T2('Gandhiji asked Indians to refuse to cooperate with British rule, peacefully.', 'गांधीजी ने भारतीयों से शांति से अंग्रेज़ी शासन के साथ सहयोग न करने को कहा।') },
      { id: 'dandi', year: 1930, label: T2('Dandi March', 'दांडी मार्च'), detail: T2('Gandhiji walked to the sea at Dandi to break the salt law.', 'गांधीजी नमक कानून तोड़ने के लिए पैदल चलकर दांडी में समुद्र तक पहुँचे।') },
      { id: 'freedom', year: 1947, label: T2('India becomes independent', 'भारत स्वतंत्र हुआ'), detail: T2('On 15 August India became a free country.', '15 अगस्त को भारत स्वतंत्र देश बना।') },
    ],
    links: [
      { from: 'revolt', to: 'crown', why: T2('After the Revolt, the British government ended Company rule and took charge itself.', 'विद्रोह के बाद ब्रिटिश सरकार ने कंपनी का शासन समाप्त करके स्वयं शासन सँभाला।') },
      { from: 'rowlatt', to: 'jallianwala', why: T2('People gathered in Amritsar to protest against the Rowlatt Act when the firing happened.', 'रॉलेट एक्ट के विरोध में अमृतसर में लोग इकट्ठा हुए थे, तभी गोलीबारी हुई।') },
      { from: 'jallianwala', to: 'noncoop', why: T2('Anger at the massacre helped many Indians join the Non-Cooperation Movement.', 'हत्याकांड के गुस्से ने कई भारतीयों को असहयोग आंदोलन से जोड़ा।') },
    ],
  };

  const CSS = `
.tl{font-family:var(--font-body);color:var(--ink);display:flex;flex-direction:column;gap:12px;max-width:100%;min-width:0}
.tl *{box-sizing:border-box}
.tl-head{display:flex;align-items:flex-start;gap:10px;justify-content:space-between}
.tl-head>div{min-width:0;flex:1}
.tl-ttl{font-family:var(--font-display);font-size:1.1rem;font-weight:700;margin:0;color:#B45309;letter-spacing:.01em}
.tl-prompt{margin:2px 0 0;font-size:1.05rem;font-weight:600;line-height:1.4}
.tl-prog{display:flex;gap:6px;margin:8px 0 0}
.tl-dot{width:26px;height:8px;border-radius:5px;background:var(--line)}
.tl-dot.on{background:#B45309}.tl-dot.ok{background:var(--good)}
.tl-btn{min-height:44px;min-width:44px;padding:0 16px;border-radius:14px;border:2px solid var(--line);background:var(--surface);color:var(--ink);font:600 1rem var(--font-body);cursor:pointer;display:inline-flex;align-items:center;gap:8px;justify-content:center;transition:transform .15s,box-shadow .15s}
.tl-btn:hover{box-shadow:0 3px 10px rgba(0,0,0,.14)}.tl-btn:active{transform:scale(.97)}
.tl-btn.main{background:var(--royal);border-color:var(--royal);color:#fff}
.tl-btn[disabled]{opacity:.5;cursor:default;box-shadow:none}
.tl-btn:focus-visible,.tl-card:focus-visible,.tl-scroll:focus-visible{outline:3px solid var(--action,#2563EB);outline-offset:2px}
.tl-scroll{overflow-x:auto;overflow-y:hidden;border-radius:18px;border:1px solid #E3CC98;background:#FFF7E6;box-shadow:0 4px 16px rgba(120,70,10,.12);-webkit-overflow-scrolling:touch}
.tl-svg{display:block;font-family:var(--font-body);user-select:none;-webkit-user-select:none}
.tl-svg [role=button]{cursor:pointer;outline:none}
.tl-svg [role=button]:focus-visible .tl-fo{stroke:#2563EB;stroke-width:3}
.tl-pin{animation:tl-drop .45s cubic-bezier(.3,1.5,.5,1) both;transform-box:fill-box;transform-origin:50% 100%}
@keyframes tl-drop{from{opacity:0;transform:translateY(-22px) scale(.7)}to{opacity:1;transform:none}}
@keyframes tl-pulse{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.18)}}
.tl-pulse{animation:tl-pulse 1.4s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes tl-pop{from{transform:scale(.85);opacity:.4}to{transform:none;opacity:1}}
@keyframes tl-shake{0%,100%{transform:none}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
.tl-lab{font-family:var(--font-display);font-weight:600;font-size:.95rem;color:var(--ink-2);margin:0 0 6px}
.tl-tray{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,210px),1fr));gap:10px}
.tl-seq{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr;gap:8px}
@media(min-width:620px){.tl-seq{grid-template-columns:1fr 1fr}}
.tl-slot{display:flex;align-items:center;gap:8px;min-height:56px;border:2px dashed var(--line);border-radius:14px;padding:4px 8px 4px 4px;background:var(--sunk);min-width:0}
.tl-slot>b{flex:none;width:30px;height:30px;border-radius:50%;background:var(--surface);border:2px solid var(--line);display:grid;place-items:center;font-family:var(--font-display);font-size:.95rem;color:var(--ink-2)}
.tl-slot.full{border-style:solid;border-color:transparent;background:transparent;padding:0}
.tl-slot.full>b{display:none}
.tl-slot .tl-card{flex:1}
.tl-card{display:flex;align-items:center;gap:10px;min-height:56px;width:100%;text-align:left;padding:6px 12px 6px 6px;border-radius:14px;border:2px solid var(--line);background:var(--surface);color:var(--ink);font:600 1rem/1.25 var(--font-body);cursor:pointer;transition:transform .15s,box-shadow .15s,border-color .15s;animation:tl-pop .3s ease both;min-width:0}
.tl-card:hover:not([disabled]){box-shadow:0 4px 12px rgba(0,0,0,.16);transform:translateY(-1px)}
.tl-card[aria-pressed=true]{border-color:var(--royal);box-shadow:0 0 0 3px var(--royal-t,#DBE7FF)}
.tl-card.subject{border-color:#B45309;background:var(--sun-t,#FFF1C9);cursor:default}
.tl-card.good{border-color:var(--good);background:var(--good-t,#DDF5E6)}
.tl-card.bad{border-color:var(--bad);background:var(--bad-t,#FFE0DC);animation:tl-shake .4s}
.tl-card[disabled]{opacity:.45;cursor:default}
.tl-badge{flex:none;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font:700 1.05rem var(--font-display);box-shadow:inset 0 -3px 0 rgba(0,0,0,.18)}
.tl-th{flex:none;width:36px;height:36px;border-radius:10px;object-fit:cover}
.tl-ct{display:flex;flex-direction:column;min-width:0;flex:1}
.tl-cl{overflow-wrap:anywhere}
.tl-cy{font-size:.85rem;font-weight:700;color:#B45309}
.tl-msg{min-height:3em;padding:10px 14px;border-radius:14px;background:var(--sunk);font-size:1rem;line-height:1.45}
.tl-msg.good{background:var(--good-t,#DDF5E6);color:var(--ink)}.tl-msg.bad{background:var(--bad-t,#FFE0DC);color:var(--ink)}
.tl-act{display:flex;flex-wrap:wrap;gap:10px}
.tl-story{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.tl-story li{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-radius:14px;background:var(--surface);border:1px solid var(--line);animation:tl-pop .35s ease both}
.tl-story .tl-badge{width:34px;height:34px;font-size:.95rem}
.tl-story p{margin:0;line-height:1.4}.tl-story .y{font-weight:700;color:#B45309}
.tl-hint{font-size:.95rem;color:var(--ink-2);margin:0}
@media (prefers-reduced-motion:reduce){.tl *{animation:none!important;transition:none!important}}
`;

  function mount(root, cfg, api) {
    const evs = cfg.events.map((e, i) => Object.assign({ i }, e));
    const by = Object.fromEntries(evs.map((e) => [e.id, e]));
    const task = cfg.task;
    const showCE = cfg.range[0] < 1000;
    const sortedIds = evs.slice().sort((a, b) => lin(a.year) - lin(b.year)).map((e) => e.id);
    const bi = task === 'place' ? binInfo(cfg) : null;
    const qs = task === 'cause-effect' || task === 'compare' ? buildQuestions(cfg) : [];
    const uid = 'tl' + Math.random().toString(36).slice(2, 7);
    const lang = () => (api.lang ? api.lang() : 'en');
    const t = (x) => api.t(x);
    const S = { zoom: 1, seq: [], sel: null, placed: {}, locked: {}, bad: {}, done: false, qi: 0, pick: null, badPick: null, qOK: false, msg: null, tries: 0 };
    const order = (() => {
      let s = 7;
      for (const ch of evs.map((e) => e.id).join('|')) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
      const a = evs.map((e) => e.id);
      for (let i = a.length - 1; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
      if (a.every((v, i) => v === sortedIds[i])) a.push(a.shift());
      return a;
    })();

    const fy = (y) => (y < 0 ? (lang() === 'hi' ? `${-y} ई.पू.` : `${-y} BCE`) : showCE ? (lang() === 'hi' ? `${y} ई.` : `${y} CE`) : String(y));
    const yrs = (n) => (lang() === 'hi' ? `${n} वर्ष` : `${n} year${n === 1 ? '' : 's'}`);
    const lab = (id) => t(by[id].label);
    const hasBCE = cfg.range[0] < 0;
    const ui = {
      title: { order: T2('Put in order', 'क्रम में लगाओ'), place: T2('Place on the timeline', 'समयरेखा पर रखो'), 'cause-effect': T2('Cause and effect', 'कारण और परिणाम'), compare: T2('Compare in time', 'समय में तुलना करो') },
      prompt: {
        order: T2('Tap the events one by one to build the timeline. Start with the oldest.', 'घटनाओं पर एक-एक करके टैप करके समयरेखा बनाओ। सबसे पुरानी से शुरू करो।'),
        place: T2('Tap an event, then tap the time slot on the ruler where it belongs.', 'किसी घटना पर टैप करो, फिर पैमाने पर वह समय-खाना चुनो जहाँ वह आती है।'),
      },
    };

    function ready(id) { return typeof id === 'string'; }
    const msg = (text, kind) => { S.msg = { text, kind: kind || '' }; };

    function question() { return qs[S.qi]; }
    function qPrompt(q) {
      const A = q.subject ? by[q.subject].label : null;
      if (q.kind === 'effect') return T2(`What was a result of “${A.en}”?`, `“${A.hi}” का क्या परिणाम हुआ?`);
      if (q.kind === 'cause') return T2(`What led to “${A.en}”?`, `“${A.hi}” के पीछे क्या कारण था?`);
      if (q.kind === 'first') return T2(`Which came first: “${by[q.cand[0]].label.en}” or “${by[q.cand[1]].label.en}”?`, `पहले क्या हुआ: “${by[q.cand[0]].label.hi}” या “${by[q.cand[1]].label.hi}”?`);
      if (q.kind === 'closest') return T2(`Which of these happened closest in time to “${A.en}”?`, `इनमें से कौन-सी घटना “${A.hi}” के समय के सबसे पास हुई?`);
      return T2('Which of these happened longest ago?', 'इनमें से कौन-सी घटना सबसे पहले (सबसे पुरानी) हुई?');
    }

    // ---------------------------------------------------------------- the ruler
    function ruler() {
      const place = task === 'place';
      const cw = Math.max(300, (root.clientWidth || 360) - 2);
      const base = place ? Math.max(cw, bi.bins.length * 66) : cw;
      const W = Math.round(base * S.zoom);
      const padL = 28, padR = 28, inner = W - padL - padR;
      const lo = place ? bi.first : cfg.range[0], hi = place ? bi.end : cfg.range[1];
      const span = lin(hi) - lin(lo);
      const X = (y) => padL + ((lin(y) - lin(lo)) / span) * inner;
      const axisY = place ? 220 : 176;
      const H = axisY + 64;
      const out = [];
      out.push(`<defs><linearGradient id="${uid}a" x1="0" x2="1"><stop offset="0" stop-color="#B45309"/><stop offset=".5" stop-color="#FF7A1A"/><stop offset="1" stop-color="#F5B90A"/></linearGradient>
        <linearGradient id="${uid}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF9EC"/><stop offset="1" stop-color="#FCE8BE"/></linearGradient>
        <marker id="${uid}m" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#B45309"/></marker></defs>`);
      out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="url(#${uid}b)"/>`);
      // alternating bands
      let marks = [];
      if (place) marks = bi.bins.map((s) => s).concat([bi.end]);
      else {
        const ts = NICE.find((s) => (s / span) * inner >= 72) || 5000;
        marks = [lo];
        for (let tk = Math.ceil(lo / ts) * ts; tk <= hi; tk += ts) { if (tk === 0 || tk === lo) continue; marks.push(tk); }
        if (hi !== marks[marks.length - 1]) marks.push(hi);
      }
      for (let k = 0; k + 1 < marks.length; k++) {
        if (k % 2 === 0) out.push(`<rect x="${X(marks[k])}" y="0" width="${Math.max(0, X(marks[k + 1]) - X(marks[k]))}" height="${H}" fill="#F5B90A" opacity=".10"/>`);
      }
      // BCE | CE divider
      if (lo < 0 && hi > 0) {
        const x0 = X(0);
        out.push(`<line x1="${x0}" x2="${x0}" y1="12" y2="${axisY + 22}" stroke="#B45309" stroke-width="2" stroke-dasharray="5 4" opacity=".7"/>
          <text x="${x0 - 8}" y="22" text-anchor="end" font-size="12" font-weight="700" fill="#7C3F06">◂ ${lang() === 'hi' ? 'ई.पू.' : 'BCE'}</text>
          <text x="${x0 + 8}" y="22" font-size="12" font-weight="700" fill="#7C3F06">${lang() === 'hi' ? 'ई.' : 'CE'} ▸</text>`);
      }
      // axis
      out.push(`<rect x="${padL - 10}" y="${axisY - 5}" width="${inner + 20}" height="10" rx="5" fill="url(#${uid}a)"/>`);
      // ticks / slot labels
      if (!place) {
        marks.slice(1, -1).forEach((tk) => {
          const x = X(tk);
          if (x - X(lo) < 62 || X(hi) - x < 62) return;
          out.push(`<line x1="${x}" x2="${x}" y1="${axisY - 9}" y2="${axisY + 12}" stroke="#7C3F06" stroke-width="2"/><text x="${x}" y="${axisY + 30}" text-anchor="middle" font-size="12" font-weight="600" fill="#3B2A14">${esc(fy(tk))}</text>`);
        });
        [[cfg.range[0], 'start'], [cfg.range[1], 'end']].forEach(([y, a]) => {
          const x = X(y);
          out.push(`<line x1="${x}" x2="${x}" y1="${axisY - 9}" y2="${axisY + 12}" stroke="#7C3F06" stroke-width="2"/><text x="${a === 'start' ? Math.max(x - 4, 4) : Math.min(x + 4, W - 4)}" y="${axisY + 30}" text-anchor="${a}" font-size="12" font-weight="700" fill="#3B2A14">${esc(fy(y))}</text>`);
        });
      }
      // slots (place)
      if (place) {
        bi.bins.forEach((s, k) => {
          const x0 = X(s), x1 = X(s + bi.step), w = x1 - x0;
          const a = fy(s === 0 ? 1 : s), b = fy(s + bi.step - 1 === 0 ? -1 : s + bi.step - 1);
          const sel = !!S.sel;
          out.push(`<g role="button" tabindex="0" data-key="slot:${s}" aria-label="${esc(lang() === 'hi' ? `समय-खाना ${a} से ${b}` : `Time slot ${a} to ${b}`)}">
            <rect class="tl-fo" x="${x0 + 2}" y="30" width="${Math.max(10, w - 4)}" height="${axisY + 52 - 30}" rx="12" fill="${sel ? '#FFFFFF' : 'transparent'}" fill-opacity="${sel ? '.55' : '0'}" stroke="${sel ? '#B45309' : 'transparent'}" stroke-width="2" stroke-dasharray="6 4"/>
            <text x="${(x0 + x1) / 2}" y="${axisY + 26}" text-anchor="middle" font-size="12" font-weight="700" fill="#3B2A14">${esc(a)}</text>
            <text x="${(x0 + x1) / 2}" y="${axisY + 42}" text-anchor="middle" font-size="12" fill="#6B4A1F">– ${esc(b)}</text>
          </g>`);
          if (k) out.push(`<line x1="${x0}" x2="${x0}" y1="${axisY - 9}" y2="${axisY + 12}" stroke="#7C3F06" stroke-width="2"/>`);
        });
        // tentative chips
        const stack = {};
        Object.keys(S.placed).forEach((id) => {
          if (S.locked[id]) return;
          const s = S.placed[id];
          const k = (stack[s] = (stack[s] || 0) + 1) - 1;
          const cx = X(s) + (X(s + bi.step) - X(s)) / 2 + (k >= 6 ? 17 : 0) - (k >= 6 ? 0 : 0);
          const cy = axisY - 24 - (k % 6) * 32;
          const [bg, fg] = PAL[by[id].i % 12];
          const bad = S.bad[id];
          out.push(`<g role="button" tabindex="0" data-key="event:${id}" class="tl-pin" aria-label="${esc((lang() === 'hi' ? 'वापस लो: ' : 'Take back: ') + lab(id))}">
            <circle class="tl-fo" cx="${cx}" cy="${cy}" r="15" fill="${bg}" stroke="${bad ? '#C0392B' : '#fff'}" stroke-width="3"/>
            <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="${fg}">${esc(LET[lang()][by[id].i])}</text></g>`);
        });
      }
      // pins at true positions
      let ids = [];
      if (task === 'order') ids = S.done ? sortedIds.slice() : [];
      else if (place) ids = sortedIds.filter((id) => S.locked[id]);
      else ids = sortedIds.slice();
      const q = qs.length && !S.done ? question() : (qs.length ? question() : null);
      const lastX = [];
      const pos = {};
      ids.forEach((id, n) => {
        const x = X(by[id].year);
        let lvl = 0;
        while (lvl < 4 && lastX[lvl] != null && x - lastX[lvl] < 34) lvl++;
        if (lvl > 3) lvl = n % 4;
        lastX[lvl] = x;
        pos[id] = { x, y: axisY - 26 - lvl * 38 };
      });
      // arrow / bracket for a correct answer
      if (q && S.qOK && q.pair) {
        const pa = pos[q.pair[0]], pb = pos[q.pair[1]];
        if (q.kind === 'effect' || q.kind === 'cause') {
          const from = q.kind === 'effect' ? q.subject : S.pick, to = q.kind === 'effect' ? S.pick : q.subject;
          if (pos[from] && pos[to] && from !== to) {
            const f = pos[from], g = pos[to], top = Math.max(10, Math.min(f.y, g.y) - 54);
            out.push(`<path d="M${f.x} ${f.y - 16} Q${(f.x + g.x) / 2} ${top} ${g.x} ${g.y - 18}" fill="none" stroke="#B45309" stroke-width="3" stroke-linecap="round" marker-end="url(#${uid}m)" class="tl-pin"/>`);
          }
        } else if (pa && pb && q.kind !== 'oldest') {
          const bx1 = pa.x, bx2 = pb.x, by2 = axisY + 40, d = Math.abs(gapYears(by[q.pair[0]].year, by[q.pair[1]].year));
          out.push(`<path d="M${bx1} ${by2 - 6}V${by2}H${bx2}V${by2 - 6}" fill="none" stroke="#0F766E" stroke-width="3" stroke-linecap="round"/><text x="${(bx1 + bx2) / 2}" y="${by2 + 16}" text-anchor="middle" font-size="13" font-weight="700" fill="#0F766E">${esc(yrs(d))}</text>`);
        }
      }
      ids.forEach((id) => {
        const p = pos[id], bg = PAL[by[id].i % 12][0];
        out.push(`<g class="tl-pin" style="animation-delay:${Math.min(ids.indexOf(id) * 40, 400)}ms" aria-hidden="true"><line x1="${p.x}" x2="${p.x}" y1="${p.y + 15}" y2="${axisY - 5}" stroke="${bg}" stroke-width="3"/><circle cx="${p.x}" cy="${axisY}" r="5.5" fill="${bg}" stroke="#fff" stroke-width="2"/></g>`);
      });
      ids.forEach((id) => {
        const p = pos[id], e = by[id], [bg, fg] = PAL[e.i % 12];
        const subj = q && q.subject === id, pick = q && S.pick === id, ok = q && S.qOK && (q.valid.includes(id) && S.pick === id), badp = q && S.badPick === id;
        const ring = badp ? '#C0392B' : ok ? '#15803D' : pick ? '#1D4ED8' : subj ? '#B45309' : '#fff';
        out.push(`<g class="tl-pin" style="animation-delay:${Math.min(ids.indexOf(id) * 40, 400)}ms" aria-hidden="true">
          ${subj ? `<circle class="tl-pulse" cx="${p.x}" cy="${p.y}" r="22" fill="none" stroke="#B45309" stroke-width="3"/>` : ''}
          <circle cx="${p.x}" cy="${p.y}" r="15" fill="${bg}" stroke="${ring}" stroke-width="${subj || pick || ok || badp ? 4 : 3}"/>
          <text x="${p.x}" y="${p.y + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="${fg}">${esc(LET[lang()][e.i])}</text></g>`);
      });
      const hint = task === 'place' ? (lang() === 'hi' ? 'समयरेखा का पैमाना, घटनाएँ यहाँ रखी जाती हैं' : 'Timeline ruler: events are placed here') : (lang() === 'hi' ? 'समयरेखा का पैमाना' : 'Timeline ruler');
      return { svg: `<svg class="tl-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(hint + ', ' + fy(cfg.range[0]) + ' – ' + fy(cfg.range[1]))}">${out.join('')}</svg>`, W };
    }

    // ---------------------------------------------------------------- the page
    function cardHTML(id, o) {
      o = o || {};
      const e = by[id], [bg, fg] = PAL[e.i % 12];
      const img = e.image && api.asset ? api.asset(e.image) : null;
      return `<button type="button" class="tl-card ${o.cls || ''}" data-key="event:${id}" data-id="${id}" ${o.disabled ? 'disabled' : ''} ${o.pressed != null ? `aria-pressed="${o.pressed}"` : ''}>
        <span class="tl-badge" style="background:${bg};color:${fg}" aria-hidden="true">${esc(LET[lang()][e.i])}</span>${img ? `<img class="tl-th" src="${esc(img)}" alt="">` : ''}
        <span class="tl-ct"><span class="tl-cl">${esc(t(e.label))}</span>${o.year ? `<span class="tl-cy">${esc(fy(e.year))}</span>` : ''}</span></button>`;
    }
    function storyHTML(idList) {
      return `<ol class="tl-story">${idList.map((id) => {
        const e = by[id], [bg, fg] = PAL[e.i % 12];
        return `<li><span class="tl-badge" style="background:${bg};color:${fg}" aria-hidden="true">${esc(LET[lang()][e.i])}</span><p><span class="y">${esc(fy(e.year))}</span> · <b>${esc(t(e.label))}</b>${e.detail ? `<br>${esc(t(e.detail))}` : ''}</p></li>`;
      }).join('')}</ol>`;
    }
    function draw() {
      const scroller = root.querySelector('.tl-scroll');
      const keep = scroller ? scroller.scrollLeft / Math.max(1, scroller.scrollWidth) : 0;
      const fk = root.contains(document.activeElement) && document.activeElement.closest ? (document.activeElement.closest('[data-key]') || {}).dataset : null;
      const focusKey = fk && fk.key;
      const q = qs.length ? question() : null;
      const r = ruler();
      const zlab = lang() === 'hi' ? `ज़ूम ×${S.zoom}` : `Zoom ×${S.zoom}`;
      let promptText, body = '', ttl = cfg.title ? t(cfg.title) : t(ui.title[task]);
      if (q) promptText = t(qPrompt(q));
      else promptText = cfg.prompt ? t(cfg.prompt) : t(ui.prompt[task]);
      if (q && cfg.prompt) promptText = t(cfg.prompt) + ' ' + promptText;
      const prog = q ? `<div class="tl-prog" aria-label="${esc(lang() === 'hi' ? `प्रश्न ${S.qi + 1} / ${qs.length}` : `Question ${S.qi + 1} of ${qs.length}`)}">${qs.map((_, i) => `<span class="tl-dot ${i < S.qi || (i === S.qi && S.done) ? 'ok' : i === S.qi ? 'on' : ''}"></span>`).join('')}</div>` : '';
      let answerLabel = '', answerOff = false;
      if (task === 'order') {
        const slots = evs.map((_, k) => {
          const id = S.seq[k];
          return id ? `<li class="tl-slot full">${cardHTML(id, { cls: S.bad[id] ? 'bad' : S.done ? 'good' : '', disabled: S.done })}</li>` : `<li class="tl-slot"><b>${k + 1}</b></li>`;
        }).join('');
        const tray = order.filter((id) => !S.seq.includes(id));
        body = `<div><p class="tl-lab">${esc(lang() === 'hi' ? 'तुम्हारी समयरेखा: सबसे पुरानी ऊपर' : 'Your timeline: oldest at the top')}</p><ol class="tl-seq" aria-label="${esc(lang() === 'hi' ? 'क्रम' : 'Your order')}">${slots}</ol></div>
          ${tray.length ? `<div><p class="tl-lab">${esc(lang() === 'hi' ? 'घटनाएँ' : 'Events')}</p><div class="tl-tray">${tray.map((id) => cardHTML(id)).join('')}</div></div>` : ''}
          ${S.done ? `<div><p class="tl-lab">${esc(lang() === 'hi' ? 'क्रम से, क्या हुआ' : 'What happened, in order')}</p>${storyHTML(sortedIds)}</div>` : ''}`;
        answerLabel = lang() === 'hi' ? 'क्रम जाँचो' : 'Check my order';
        answerOff = S.done;
      } else if (task === 'place') {
        const tray = order.filter((id) => !S.placed[id] && !S.locked[id]);
        body = `${tray.length ? `<div><p class="tl-lab">${esc(lang() === 'hi' ? 'घटनाएँ: एक चुनो, फिर पैमाने पर समय-खाना चुनो' : 'Events: pick one, then pick a slot on the ruler')}</p><div class="tl-tray">${tray.map((id) => cardHTML(id, { pressed: S.sel === id })).join('')}</div></div>` : ''}
          ${Object.keys(S.locked).length ? `<div><p class="tl-lab">${esc(lang() === 'hi' ? 'सही जगह पर' : 'In the right place')}</p>${storyHTML(sortedIds.filter((id) => S.locked[id]))}</div>` : ''}`;
        answerLabel = lang() === 'hi' ? 'जाँचो' : 'Check';
        answerOff = S.done;
      } else {
        const cand = q.cand;
        body = `<div><p class="tl-lab">${esc(lang() === 'hi' ? 'अपना उत्तर चुनो' : 'Choose your answer')}</p><div class="tl-tray">${evs.map((e) => {
          const subj = q.subject === e.id, isC = cand.includes(e.id) && !subj;
          const cls = subj ? 'subject' : S.qOK && q.valid.includes(e.id) && S.pick === e.id ? 'good' : S.badPick === e.id ? 'bad' : '';
          return cardHTML(e.id, { year: true, cls, disabled: subj ? false : !isC || (S.qOK && S.pick !== e.id), pressed: subj ? null : S.pick === e.id });
        }).join('')}</div></div>
          ${S.qOK && q.kind !== 'oldest' ? storyHTML([q.subject || q.pair[0], S.pick || q.pair[1]].filter((x, i, a) => x && a.indexOf(x) === i)) : ''}`;
        answerLabel = S.done ? (lang() === 'hi' ? 'पूरा हुआ' : 'All done') : S.qOK ? (lang() === 'hi' ? 'अगला प्रश्न' : 'Next question') : (lang() === 'hi' ? 'उत्तर जाँचो' : 'Check my answer');
        answerOff = S.done;
      }
      const m = S.msg || { text: '', kind: '' };
      root.innerHTML = `<div class="tl">
        <div class="tl-head"><div><h3 class="tl-ttl">${esc(ttl)}</h3><p class="tl-prompt">${esc(promptText)}</p>${prog}</div>
          <button type="button" class="tl-btn" data-key="zoom" aria-label="${esc(zlab)}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="M15 15l6 6M7 10h6M10 7v6"/></svg><span>${esc(zlab)}</span></button></div>
        <div class="tl-scroll" tabindex="0" role="region" aria-label="${esc(lang() === 'hi' ? 'समयरेखा (खिसकाकर देखो)' : 'Timeline (scroll sideways)')}">${r.svg}</div>
        ${task === 'place' ? `<p class="tl-hint">${esc(lang() === 'hi' ? 'सारे समय-खाने देखने के लिए पैमाने को बगल में सरकाओ, या ज़ूम बदलो।' : 'Slide the ruler sideways to see every time slot.')}</p>` : ''}
        ${body}
        <div class="tl-msg ${m.kind}" aria-live="polite">${esc(m.text)}</div>
        <div class="tl-act"><button type="button" class="tl-btn main" data-key="answer" ${answerOff ? 'disabled' : ''}>${esc(answerLabel)}</button><button type="button" class="tl-btn" data-key="reset">${esc(lang() === 'hi' ? 'फिर से शुरू करो' : 'Start again')}</button></div>
      </div>`;
      const sc = root.querySelector('.tl-scroll');
      if (sc) sc.scrollLeft = keep * sc.scrollWidth;
      if (focusKey) { const again = root.querySelector(`[data-key="${CSS_escape(focusKey)}"]`); if (again && !again.disabled) again.focus({ preventScroll: true }); }
    }
    const CSS_escape = (s) => String(s).replace(/"/g, '\\"');

    // ---------------------------------------------------------------- actions
    function resetAll() {
      Object.assign(S, { seq: [], sel: null, placed: {}, locked: {}, bad: {}, done: false, qi: 0, pick: null, badPick: null, qOK: false, msg: null, tries: 0 });
    }
    function checkOrder() {
      if (S.seq.length < evs.length) { msg(lang() === 'hi' ? 'पहले सारी घटनाएँ क्रम में रखो।' : 'Put all the events in the timeline first.', ''); api.toast && api.toast(T2('Put all the events in the timeline first.', 'पहले सारी घटनाएँ क्रम में रखो।')); return; }
      S.bad = {};
      const wrong = S.seq.filter((id, i) => id !== sortedIds[i]);
      if (!wrong.length) {
        S.done = true;
        msg(lang() === 'hi' ? `शाबाश! तुमने सारी ${evs.length} घटनाएँ सही क्रम में लगाईं।` : `Well done! All ${evs.length} events are in the right order.`, 'good');
        api.emit('ordered'); api.emit('answered:right'); api.celebrate && api.celebrate();
        api.record && api.record(api.t(T2('Put the events in the right order', 'घटनाओं को सही क्रम में लगाया')));
      } else {
        wrong.forEach((id) => { S.bad[id] = true; });
        S.tries++;
        const first = S.seq.findIndex((id, i) => id !== sortedIds[i]) + 1;
        msg(lang() === 'hi' ? `अभी नहीं। लाल कार्ड गलत जगह पर हैं। स्थान ${first} से देखो: कौन-सी घटना पहले हुई? ${hasBCE ? 'याद रखो: ई.पू. में बड़ी संख्या का मतलब ज़्यादा पुराना।' : ''}` : `Not yet. The red cards are in the wrong place. Start at place ${first}: which event came first? ${hasBCE ? 'Remember: in BCE a bigger number means longer ago.' : ''}`, 'bad');
        api.emit('answered:wrong');
        api.record && api.record(api.t(T2('Tried an order that was not right', 'एक गलत क्रम आज़माया')));
      }
    }
    function checkPlace() {
      const ids = Object.keys(S.placed).filter((id) => !S.locked[id]);
      if (!ids.length) { msg(lang() === 'hi' ? 'पहले कोई घटना पैमाने पर रखो।' : 'Place an event on the ruler first.', ''); api.toast && api.toast(T2('Place an event on the ruler first.', 'पहले कोई घटना पैमाने पर रखो।')); return; }
      S.bad = {};
      const lines = [];
      ids.forEach((id) => {
        const right = binOf(by[id].year, bi.step);
        if (S.placed[id] === right) S.locked[id] = true;
        else {
          const later = S.placed[id] < right;
          lines.push(lang() === 'hi' ? `${lab(id)}: यह ${later ? 'और बाद में' : 'और पहले'} हुई।` : `${lab(id)}: it happened ${later ? 'later' : 'earlier'} than that.`);
          delete S.placed[id];
        }
      });
      const nright = ids.filter((id) => S.locked[id]).length;
      if (Object.keys(S.locked).length === evs.length) {
        S.done = true;
        msg(lang() === 'hi' ? 'शाबाश! सारी घटनाएँ सही जगह पर हैं।' : 'Well done! Every event is in the right place.', 'good');
        if (lines.length) api.emit('answered:wrong'); else api.emit('answered:right');
        api.emit('ordered'); api.celebrate && api.celebrate();
      } else if (lines.length) {
        msg((nright ? (lang() === 'hi' ? `${nright} सही। ` : `${nright} right. `) : '') + lines.join(' ') + ' ' + (lang() === 'hi' ? 'कार्ड वापस ट्रे में है। फिर कोशिश करो।' : 'The card is back in the tray. Try again.'), 'bad');
        api.emit('answered:wrong');
      } else {
        msg(lang() === 'hi' ? `सही! ${nright} घटना अपनी जगह पर बैठ गई।` : `Right! ${nright} event${nright === 1 ? '' : 's'} sat in the correct place.`, 'good');
        api.emit('answered:right');
      }
      api.record && api.record(api.t(T2('Checked the events on the timeline', 'समयरेखा पर घटनाओं को जाँचा')));
    }
    function checkQuestion() {
      const q = question();
      if (S.qOK) {
        if (S.qi + 1 < qs.length) { S.qi++; S.pick = null; S.badPick = null; S.qOK = false; msg('', ''); }
        return;
      }
      if (!S.pick) { msg(lang() === 'hi' ? 'पहले एक घटना चुनो।' : 'Choose an event first.', ''); api.toast && api.toast(T2('Choose an event first.', 'पहले एक घटना चुनो।')); return; }
      const p = by[S.pick];
      if (q.valid.includes(S.pick)) {
        S.qOK = true; S.badPick = null;
        let text;
        const sub = q.subject ? by[q.subject] : null;
        if (q.kind === 'effect' || q.kind === 'cause') {
          const w = q.why ? t(q.why) : '';
          text = (lang() === 'hi' ? 'सही! ' : 'Right! ') + (w || (q.kind === 'effect'
            ? (lang() === 'hi' ? `${fy(sub.year)} में “${t(sub.label)}” हुआ, और उसके बाद, ${fy(p.year)} में, “${t(p.label)}” हुआ।` : `“${t(sub.label)}” was in ${fy(sub.year)}. “${t(p.label)}” came after it, in ${fy(p.year)}.`)
            : (lang() === 'hi' ? `“${t(p.label)}” (${fy(p.year)}) पहले हुआ, इसलिए वह “${t(sub.label)}” का कारण हो सकता है।` : `“${t(p.label)}” (${fy(p.year)}) came before it, so it could be the cause.`)));
        } else if (q.kind === 'first') {
          const o = by[q.pair[1]], d = Math.abs(gapYears(p.year, o.year));
          text = lang() === 'hi' ? `सही! “${t(p.label)}” (${fy(p.year)}) पहले हुई, “${t(o.label)}” (${fy(o.year)}) से ${yrs(d)} पहले।` : `Right! “${t(p.label)}” (${fy(p.year)}) came first, ${yrs(d)} before “${t(o.label)}” (${fy(o.year)}).`;
        } else if (q.kind === 'closest') {
          text = (lang() === 'hi' ? 'सही! ' : 'Right! ') + q.cand.map((id) => (lang() === 'hi' ? `${lab(id)}: ${yrs(Math.abs(gapYears(sub.year, by[id].year)))} का अंतर` : `${lab(id)}: ${yrs(Math.abs(gapYears(sub.year, by[id].year)))} apart`)).join(' · ');
        } else text = lang() === 'hi' ? `सही! “${t(p.label)}” सबसे पुरानी है, ${fy(p.year)} की।` : `Right! “${t(p.label)}” is the oldest, from ${fy(p.year)}.`;
        const last = S.qi + 1 === qs.length;
        if (last) { S.done = true; text += ' ' + (lang() === 'hi' ? 'सारे प्रश्न पूरे हुए!' : 'You finished every question!'); api.celebrate && api.celebrate(); }
        msg(text, 'good');
        api.emit('answered:right');
        api.record && api.record(api.t(T2('Answered a timeline question correctly', 'समयरेखा का एक प्रश्न सही किया')));
      } else {
        S.badPick = S.pick; S.tries++;
        let text;
        const sub = q.subject ? by[q.subject] : null;
        if (q.kind === 'effect') {
          text = lwr(p.year, sub.year) <= 0
            ? (lang() === 'hi' ? `“${t(p.label)}” (${fy(p.year)}) पहले या उसी समय हुई। परिणाम हमेशा बाद में आता है।` : `“${t(p.label)}” (${fy(p.year)}) was not later. A result always comes after its cause.`)
            : (lang() === 'hi' ? `यह बाद में हुई, पर इस समयरेखा में यह “${t(sub.label)}” का परिणाम नहीं है। सोचो: उसके बाद सीधे क्या हुआ?` : `It came later, but it is not what “${t(sub.label)}` + '” led to here. Think: what followed from it?');
        } else if (q.kind === 'cause') {
          text = lwr(p.year, sub.year) >= 0
            ? (lang() === 'hi' ? `“${t(p.label)}” (${fy(p.year)}) बाद में या उसी समय हुई। कारण हमेशा पहले आता है।` : `“${t(p.label)}” (${fy(p.year)}) was not earlier. A cause always comes before its result.`)
            : (lang() === 'hi' ? `यह पहले हुई, पर इस समयरेखा में यह “${t(sub.label)}” का कारण नहीं है। सोचो: उसके ठीक पहले क्या हुआ?` : `It came earlier, but it is not what led to “${t(sub.label)}` + '” here. Think: what happened just before it?');
        } else if (q.kind === 'first') {
          text = lang() === 'hi' ? `${fy(p.year)} बाद की तारीख़ है। ${hasBCE ? 'याद रखो: ई.पू. में बड़ी संख्या का मतलब ज़्यादा पुराना।' : 'छोटा वर्ष पहले आता है।'}` : `${fy(p.year)} is the later date. ${hasBCE ? 'Remember: in BCE a bigger number means longer ago.' : 'The smaller year comes first.'}`;
        } else if (q.kind === 'closest') {
          text = lang() === 'hi' ? `“${t(p.label)}” और “${t(sub.label)}” के बीच ${yrs(Math.abs(gapYears(sub.year, p.year)))} हैं। किसी और का अंतर कम है।` : `Between “${t(p.label)}” and “${t(sub.label)}” there are ${yrs(Math.abs(gapYears(sub.year, p.year)))}. Another one is closer.`;
        } else text = lang() === 'hi' ? `${fy(p.year)} सबसे पुरानी तारीख़ नहीं है। ${hasBCE ? 'ई.पू. में बड़ी संख्या का मतलब ज़्यादा पुराना।' : 'सबसे छोटा वर्ष खोजो।'}` : `${fy(p.year)} is not the oldest date. ${hasBCE ? 'In BCE a bigger number means longer ago.' : 'Look for the smallest year.'}`;
        msg(text, 'bad');
        api.emit('answered:wrong');
        api.record && api.record(api.t(T2('Answered a timeline question wrongly', 'समयरेखा का एक प्रश्न गलत किया')));
      }
    }
    const lwr = (a, b) => Math.sign(lin(a) - lin(b));

    function act(key) {
      if (key === 'zoom') {
        S.zoom = S.zoom === 1 ? 2 : S.zoom === 2 ? 4 : 1;
        api.emit('zoomed');
        msg(lang() === 'hi' ? `पैमाना ×${S.zoom} बड़ा है। सरकाकर देखो।` : `The ruler is ×${S.zoom}. Slide it sideways to look around.`, '');
      } else if (key === 'reset') {
        resetAll();
      } else if (key === 'answer') {
        if (task === 'order') { if (!S.done) checkOrder(); }
        else if (task === 'place') { if (!S.done) checkPlace(); }
        else checkQuestion();
      } else if (key.startsWith('event:')) {
        const id = key.slice(6);
        if (!by[id]) return;
        if (task === 'order') {
          if (S.done) return;
          S.bad = {};
          const at = S.seq.indexOf(id);
          if (at >= 0) S.seq.splice(at, 1);
          else { S.seq.push(id); api.emit('placed:' + id); api.speak && api.speak(lab(id)); }
          msg('', '');
        } else if (task === 'place') {
          if (S.locked[id] || S.done) return;
          if (S.placed[id] != null) { delete S.placed[id]; S.sel = id; }
          else { S.sel = S.sel === id ? null : id; if (S.sel) api.speak && api.speak(lab(id)); }
          msg(S.sel ? (lang() === 'hi' ? `“${lab(id)}” चुनी। अब पैमाने पर उसका समय-खाना चुनो।` : `“${lab(id)}” picked. Now tap its time slot on the ruler.`) : '', '');
        } else {
          const q = question();
          if (!q || S.qOK || q.subject === id || !q.cand.includes(id)) return;
          S.pick = S.pick === id ? null : id; S.badPick = null; msg('', '');
          if (S.pick) api.speak && api.speak(lab(id));
        }
      } else if (key.startsWith('slot:')) {
        if (task !== 'place' || S.done) return;
        const s = Number(key.slice(5));
        if (!S.sel) { msg(lang() === 'hi' ? 'पहले नीचे से कोई घटना चुनो।' : 'Pick an event card first.', ''); api.toast && api.toast(T2('Pick an event card first.', 'पहले कोई घटना का कार्ड चुनो।')); draw(); return; }
        const id = S.sel;
        S.placed[id] = s; S.sel = null;
        api.emit('placed:' + id);
        msg(lang() === 'hi' ? 'रख दिया। और घटनाएँ रखो, फिर “जाँचो” दबाओ।' : 'Placed. Add more events, then press “Check”.', '');
      }
      draw();
    }

    function onClick(ev) {
      const el = ev.target.closest && ev.target.closest('[data-key]');
      if (!el || !root.contains(el) || el.disabled) return;
      const key = el.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      act(key);
    }
    function onKey(ev) {
      if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.closest && ev.target.closest('g[data-key]')) {
        ev.preventDefault();
        ev.target.closest('g[data-key]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    }
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    draw();
    let lastW = root.clientWidth, ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => { const w = root.clientWidth; if (w && Math.abs(w - lastW) > 8) { lastW = w; draw(); } });
      ro.observe(root);
    }
    return { destroy() { if (ro) ro.disconnect(); root.removeEventListener('click', onClick); root.removeEventListener('keydown', onKey); } };
  }

  NCA_T.register({ id: 'timeline', css: CSS, validate, keys, demo, mount });
})();
