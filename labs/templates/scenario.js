// Template: Role play. A child steps into a situation (a voter, a panchayat member, a consumer, a manager, a judge...)
// and chooses what to do. Each choice shows feedback and leads to the next scene; the story ends after a few decisions
// and the child sees a recap of the path they took. The branching graph is validated in code: every "next" is a real
// scene or 'end', every scene is reachable from the first, no scene loops back (so every path ends), and every scene
// has at least one choice that is not marked wrong. Config:
//   { setting: string (used to pick the backdrop: village, polling booth, school, market, court, office, home, road,
//                      hospital, online... any other word gets a town backdrop),
//     role: {en,hi},
//     scenes: [{ id, text: {en,hi}, image?: asset id,
//                choices: [{ id, text: {en,hi}, next: scene id | 'end', feedback: {en,hi}, good?: boolean }] }] (2-8) }
// The first scene is the start. good:true = a wise choice, good:false = one to rethink, missing = neutral.
(function () {
  const L = window.NCA_LIB;
  const { esc } = L;
  const T2 = (en, hi) => ({ en, hi });

  // ---------------------------------------------------------------- words
  const W = {
    you: T2('You are', 'आप हैं'),
    step: T2('Decision', 'निर्णय'),
    next: T2('Next', 'आगे'),
    finish: T2('See what happened', 'देखो क्या हुआ'),
    again: T2('Play again', 'फिर से खेलो'),
    listen: T2('Listen', 'सुनो'),
    pick: T2('What will you do? Choose one.', 'आप क्या करेंगे? एक चुनो।'),
    wise: T2('Wise choice', 'समझदारी भरा चुनाव'),
    rethink: T2('Think again', 'फिर सोचो'),
    okay: T2('It depends', 'यह स्थिति पर निर्भर है'),
    story: T2('Your story', 'आपकी कहानी'),
    allwise: T2('Well done! You chose wisely every time.', 'शाबाश! आपने हर बार समझदारी से चुना।'),
    mostwise: T2('A good effort. Look at the choices marked "Think again" and try another path.', 'अच्छा प्रयास। "फिर सोचो" वाले चुनाव देखो और दूसरा रास्ता आज़माओ।'),
    fewwise: T2('Not every choice helped. Play again and try a different path.', 'हर चुनाव मददगार नहीं रहा। फिर से खेलो और दूसरा रास्ता आज़माओ।'),
    neutral: T2('The story is over. Play again to see what other choices lead to.', 'कहानी पूरी हुई। फिर खेलो और देखो दूसरे चुनाव कहाँ ले जाते हैं।'),
    score: T2('wise choices', 'समझदारी भरे चुनाव'),
    of: T2('of', 'में से'),
    the_end: T2('The end', 'कहानी का अंत'),
  };

  // backdrop kinds: [id, keywords, label]
  const KINDS = [
    ['village', /panchayat|village|gram|rural|farm|well/, T2('Village', 'गाँव')],
    ['booth', /booth|poll|elect|vote|voter|ballot/, T2('Polling booth', 'मतदान केंद्र')],
    ['school', /school|class|college|student/, T2('School', 'विद्यालय')],
    ['market', /market|shop|bazaar|bazar|store|consumer|mall/, T2('Market', 'बाज़ार')],
    ['court', /court|judge|law|justice|tribunal/, T2('Court', 'न्यायालय')],
    ['hospital', /hospital|clinic|doctor|health|medic/, T2('Hospital', 'अस्पताल')],
    ['online', /online|internet|phone|cyber|web|app|chat|social/, T2('Online', 'ऑनलाइन')],
    ['road', /road|traffic|street|safety|bus|crossing/, T2('Road', 'सड़क')],
    ['office', /office|company|factory|business|manager|bank|firm/, T2('Office', 'कार्यालय')],
    ['home', /home|house|family|kitchen|neighbour|neighbor/, T2('Home', 'घर')],
  ];
  const kindOf = (setting) => {
    const s = String(setting || '').toLowerCase();
    const k = KINDS.find((x) => x[1].test(s));
    return k ? k[0] : 'town';
  };
  const kindLabel = (id) => (KINDS.find((x) => x[0] === id) || [0, 0, T2('Town', 'कस्बा')])[2];

  // names of living politicians and parties are not allowed in scenarios
  const BANNED = /\b(bjp|aap|tmc|bsp|dmk|aiadmk|shiv sena|bharatiya janata|aam aadmi|trinamool|modi|rahul gandhi|kejriwal|mamata|adityanath|amit shah|stalin|yogi)\b/i;
  const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

  // ---------------------------------------------------------------- the story graph (pure)
  function analyse(c) {
    const by = {};
    c.scenes.forEach((s) => { by[s.id] = s; });
    // can a wise ending be reached: some path with no good:false and a last choice with good:true
    const memo = {};
    const wisePath = (id) => {
      if (id in memo) return memo[id];
      memo[id] = false;
      const ok = by[id].choices.some((ch) => ch.good !== false && (ch.next === 'end' ? ch.good === true : by[ch.next] && wisePath(ch.next)));
      memo[id] = ok;
      return ok;
    };
    return { by, wiseEnd: wisePath(c.scenes[0].id) };
  }

  function bi(x) { return x && typeof x === 'object' && typeof x.en === 'string' && typeof x.hi === 'string' && x.en.trim() && x.hi.trim(); }

  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
    Object.keys(c).forEach((k) => { if (!['setting', 'role', 'scenes'].includes(k)) e.push('unknown key: ' + k); });
    if (typeof c.setting !== 'string' || !c.setting.trim()) e.push('setting: a short word such as "village", "polling booth", "market"');
    if (!bi(c.role)) e.push('role: needs {en, hi}');
    else if (c.role.en.length > 60 || c.role.hi.length > 60) e.push('role: at most 60 characters');
    if (!Array.isArray(c.scenes) || c.scenes.length < 2 || c.scenes.length > 8) { e.push('scenes: 2 to 8 scenes'); return e; }
    const ids = new Set();
    const choiceIds = new Set();
    const noBanned = (x, where) => { if (bi(x) && (BANNED.test(x.en) || BANNED.test(x.hi))) e.push(where + ': no living politicians or parties'); };
    c.scenes.forEach((s, i) => {
      const w = 'scene ' + (i + 1);
      if (!s || typeof s !== 'object') { e.push(w + ': must be an object'); return; }
      Object.keys(s).forEach((k) => { if (!['id', 'text', 'image', 'choices'].includes(k)) e.push(w + ': unknown key ' + k); });
      if (typeof s.id !== 'string' || !ID_RE.test(s.id)) e.push(w + ': id must be lower-case letters, digits and "-"');
      else if (ids.has(s.id)) e.push(w + ': duplicate id ' + s.id);
      else ids.add(s.id);
      if (s.id === 'end') e.push(w + ': "end" is reserved');
      if (!bi(s.text)) e.push(w + ': text needs {en, hi}');
      else { if (s.text.en.length > 420 || s.text.hi.length > 520) e.push(w + ': text too long for a child to read (420 characters)'); noBanned(s.text, w); }
      if (s.image != null && (typeof s.image !== 'string' || !/^[A-Za-z0-9._-]+$/.test(s.image))) e.push(w + ': image must be an asset id');
      if (!Array.isArray(s.choices) || s.choices.length < 2 || s.choices.length > 4) { e.push(w + ': 2 to 4 choices'); return; }
      s.choices.forEach((ch, j) => {
        const cw = w + ' choice ' + (j + 1);
        if (!ch || typeof ch !== 'object') { e.push(cw + ': must be an object'); return; }
        Object.keys(ch).forEach((k) => { if (!['id', 'text', 'next', 'feedback', 'good'].includes(k)) e.push(cw + ': unknown key ' + k); });
        if (typeof ch.id !== 'string' || !ID_RE.test(ch.id)) e.push(cw + ': id must be lower-case letters, digits and "-"');
        else if (choiceIds.has(ch.id)) e.push(cw + ': choice id ' + ch.id + ' is used twice (ids must be unique in the whole lab)');
        else choiceIds.add(ch.id);
        if (!bi(ch.text)) e.push(cw + ': text needs {en, hi}');
        else { if (ch.text.en.length > 180) e.push(cw + ': text too long (180 characters)'); noBanned(ch.text, cw); }
        if (!bi(ch.feedback)) e.push(cw + ': feedback needs {en, hi}');
        else { if (ch.feedback.en.length > 360) e.push(cw + ': feedback too long (360 characters)'); noBanned(ch.feedback, cw); }
        if (typeof ch.next !== 'string' || !ch.next) e.push(cw + ': next must be a scene id or "end"');
        if (ch.good != null && typeof ch.good !== 'boolean') e.push(cw + ': good must be true or false');
      });
      if (s.choices.every((ch) => ch && ch.good === false)) e.push(w + ': at least one choice must not be marked wrong');
    });
    if (e.length) return e;
    // graph checks (only when the shape is sound)
    c.scenes.forEach((s, i) => s.choices.forEach((ch, j) => {
      if (ch.next !== 'end' && !ids.has(ch.next)) e.push(`scene ${i + 1} choice ${j + 1}: next "${ch.next}" is not a scene`);
      if (ch.next === s.id) e.push(`scene ${i + 1} choice ${j + 1}: a choice cannot lead back to its own scene`);
    }));
    if (e.length) return e;
    const by = {};
    c.scenes.forEach((s) => { by[s.id] = s; });
    const state = {};
    let cyc = null;
    const dfs = (id, trail) => {
      if (cyc) return;
      if (state[id] === 1) { cyc = trail.concat(id).join(' > '); return; }
      if (state[id] === 2) return;
      state[id] = 1;
      by[id].choices.forEach((ch) => { if (ch.next !== 'end') dfs(ch.next, trail.concat(id)); });
      state[id] = 2;
    };
    dfs(c.scenes[0].id, []);
    if (cyc) e.push('the story loops (' + cyc + '); every path must end');
    c.scenes.forEach((s) => { if (state[s.id] !== 2) e.push('scene "' + s.id + '" can never be reached from the first scene'); });
    if (!e.length && !analyse(c).wiseEnd) e.push('no path of wise choices reaches an ending: mark at least one full path good (the last choice good:true, none good:false)');
    return e;
  }

  function keys(c) {
    const scenes = c && Array.isArray(c.scenes) ? c.scenes.filter((s) => s && s.id && Array.isArray(s.choices)) : [];
    const targets = [];
    const events = [];
    scenes.forEach((s) => s.choices.forEach((ch) => {
      if (!ch || !ch.id) return;
      targets.push('choice:' + s.id + ':' + ch.id);
      events.push('chose:' + ch.id);
    }));
    targets.push('next', 'restart', 'listen');
    events.push('ended');
    let wise = true;
    try { wise = !validate(c).length ? analyse(c).wiseEnd : true; } catch (err) { wise = true; }
    if (wise) events.push('ended:good');
    return { targets, events };
  }

  // ---------------------------------------------------------------- art
  const PAL = [
    { sky1: '#8FD3FF', sky2: '#FFF1CF', sun: '#FFD23F', hill: '#7CCB6B', hill2: '#4FB06A', ground: '#9AD87B' },
    { sky1: '#4FB3F6', sky2: '#D9F1FF', sun: '#FFE066', hill: '#6BC46A', hill2: '#3F9E62', ground: '#86CF72' },
    { sky1: '#FF9F7A', sky2: '#FFE3B5', sun: '#FF7A1A', hill: '#8BBF5D', hill2: '#5F9E55', ground: '#A6CC72' },
  ];
  const SKIN = ['#E8B48A', '#C98E64', '#A8714B', '#F0C7A0'];
  const SHIRT = ['#1D4ED8', '#8B3DFF', '#0F766E', '#FF6B57', '#F5B90A'];

  const house = (x, y, w, h, wall, roof) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${wall}"/><path d="M${x - 6} ${y + 2}L${x + w / 2} ${y - h * 0.55}L${x + w + 6} ${y + 2}Z" fill="${roof}"/><rect x="${x + w / 2 - 6}" y="${y + h - 22}" width="12" height="22" rx="2" fill="#7A4B2A"/><rect x="${x + 6}" y="${y + 8}" width="11" height="11" rx="2" fill="#BFE6FF"/>`;
  const tree = (x, y, r) => `<rect x="${x - 3}" y="${y}" width="6" height="${r * 1.4}" rx="2" fill="#7A4B2A"/><circle cx="${x}" cy="${y}" r="${r}" fill="#2E9E57"/><circle cx="${x - r * 0.5}" cy="${y + r * 0.3}" r="${r * 0.7}" fill="#3FB56A"/><circle cx="${x + r * 0.5}" cy="${y + r * 0.2}" r="${r * 0.7}" fill="#35A862"/>`;
  const windows = (x, y, cols, rows, gx, gy, w, h, col) => { let s = ''; for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) s += `<rect x="${x + i * gx}" y="${y + j * gy}" width="${w}" height="${h}" rx="1.5" fill="${col}"/>`; return s; };

  const SCENERY = {
    village: () => `${tree(318, 112, 18)}${house(188, 112, 48, 38, '#F6E3B4', '#C2542D')}${house(252, 120, 40, 30, '#F3C9A0', '#9A3F22')}
      <ellipse cx="150" cy="150" rx="26" ry="8" fill="#6F7B8A"/><ellipse cx="150" cy="146" rx="22" ry="6" fill="#2F7FD8"/><path d="M128 146V128h44v18" fill="none" stroke="#8A5A33" stroke-width="5"/><path d="M122 128h56l-28-14z" fill="#B45309"/>`,
    booth: () => `<rect x="170" y="86" width="150" height="64" rx="4" fill="#F5F0E1"/><rect x="164" y="76" width="162" height="14" rx="3" fill="#1D4ED8"/><rect x="238" y="110" width="22" height="40" rx="2" fill="#7A4B2A"/>${windows(182, 98, 2, 1, 20, 0, 14, 16, '#BFE6FF')}${windows(280, 98, 2, 1, 20, 0, 14, 16, '#BFE6FF')}
      <rect x="132" y="122" width="30" height="28" rx="3" fill="#8B3DFF"/><rect x="140" y="118" width="14" height="5" rx="2" fill="#4400F0"/><rect x="138" y="130" width="18" height="10" rx="2" fill="#fff" opacity=".8"/>`,
    school: () => `<rect x="168" y="82" width="160" height="68" rx="4" fill="#FBD5A5"/><path d="M160 84L248 52l88 32z" fill="#C2542D"/><rect x="236" y="116" width="24" height="34" rx="2" fill="#7A4B2A"/>${windows(180, 96, 2, 1, 22, 0, 14, 16, '#BFE6FF')}${windows(272, 96, 2, 1, 22, 0, 14, 16, '#BFE6FF')}<circle cx="248" cy="80" r="9" fill="#fff"/><path d="M248 74v6l4 3" stroke="#1E293B" stroke-width="2" fill="none"/>${tree(138, 118, 15)}`,
    market: () => `<rect x="150" y="110" width="80" height="40" fill="#F3C9A0"/><path d="M144 110h92l-8-22h-76z" fill="#FF6B57"/><path d="M152 88l8 22M172 88l4 22M192 88v22M212 88l-4 22M228 88l-8 22" stroke="#fff" stroke-width="5"/>
      <rect x="250" y="116" width="74" height="34" fill="#E5C88F"/><path d="M244 116h86l-8-20h-70z" fill="#22C55E"/><path d="M252 96l8 20M274 96l4 20M296 96v20M318 96l-6 20" stroke="#fff" stroke-width="5"/>
      <circle cx="172" cy="140" r="6" fill="#FF7A1A"/><circle cx="186" cy="142" r="6" fill="#EF4444"/><circle cx="200" cy="140" r="6" fill="#FFD23F"/><circle cx="272" cy="142" r="6" fill="#8B3DFF"/><circle cx="288" cy="142" r="6" fill="#22C55E"/>`,
    court: () => `<path d="M160 90L248 56l88 34z" fill="#E8E2D2"/><rect x="164" y="90" width="168" height="8" fill="#D6CFBB"/>${[176, 206, 236, 266, 296].map((x) => `<rect x="${x}" y="98" width="14" height="46" rx="2" fill="#F5F0E1"/>`).join('')}<rect x="156" y="144" width="184" height="6" fill="#D6CFBB"/><rect x="150" y="150" width="196" height="4" fill="#BFB8A4"/>
      <g transform="translate(248 76)" stroke="#8A6D1F" stroke-width="2" fill="none"><path d="M0-10v18M-14-4h28"/><path d="M-14-4l-5 9h10zM14-4l-5 9h10z" fill="#F5B90A"/></g>`,
    hospital: () => `<rect x="170" y="70" width="150" height="80" rx="4" fill="#F4F8FC"/><rect x="170" y="70" width="150" height="10" fill="#14B8A6"/><rect x="233" y="116" width="24" height="34" rx="2" fill="#7FD6D0"/>${windows(184, 92, 2, 1, 24, 0, 14, 16, '#BFE6FF')}${windows(276, 92, 2, 1, 24, 0, 14, 16, '#BFE6FF')}<circle cx="245" cy="95" r="14" fill="#fff" stroke="#14B8A6" stroke-width="2"/><path d="M245 88v14M238 95h14" stroke="#0F766E" stroke-width="5" stroke-linecap="round"/>`,
    online: () => `<rect x="170" y="52" width="150" height="92" rx="9" fill="#1E293B"/><rect x="178" y="60" width="134" height="72" rx="4" fill="#DDEBFF"/><rect x="214" y="144" width="62" height="6" rx="3" fill="#475569"/>
      <rect x="186" y="68" width="72" height="20" rx="8" fill="#fff"/><rect x="226" y="94" width="76" height="20" rx="8" fill="#2563EB"/><rect x="190" y="104" width="30" height="22" rx="5" fill="#8B3DFF" opacity=".85"/><path d="M200 112v-4a5 5 0 0110 0v4" stroke="#fff" stroke-width="2" fill="none"/><rect x="196" y="112" width="18" height="10" rx="2" fill="#fff"/>`,
    road: () => `<rect x="0" y="140" width="360" height="40" fill="#556070"/><path d="M0 160h360" stroke="#fff" stroke-width="3" stroke-dasharray="18 14"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="${196 + i * 14}" y="141" width="8" height="38" fill="#fff" opacity=".9"/>`).join('')}
      <rect x="300" y="82" width="6" height="64" fill="#475569"/><rect x="291" y="62" width="24" height="46" rx="6" fill="#1E293B"/><circle cx="303" cy="73" r="6" fill="#EF4444"/><circle cx="303" cy="85" r="6" fill="#4B5563"/><circle cx="303" cy="97" r="6" fill="#22C55E"/>`,
    office: () => `<rect x="170" y="52" width="70" height="98" rx="3" fill="#94A3B8"/><rect x="246" y="76" width="80" height="74" rx="3" fill="#CBD5E1"/>${windows(180, 62, 4, 6, 15, 14, 9, 9, '#E0F2FE')}${windows(256, 86, 4, 4, 17, 14, 10, 9, '#E0F2FE')}<rect x="198" y="132" width="14" height="18" fill="#475569"/>`,
    home: () => `<rect x="172" y="92" width="130" height="58" rx="4" fill="#FBD5A5"/><path d="M164 94L237 50l73 44z" fill="#C2542D"/><rect x="226" y="112" width="22" height="38" rx="2" fill="#7A4B2A"/>${windows(186, 106, 1, 1, 0, 0, 24, 20, '#BFE6FF')}${windows(266, 106, 1, 1, 0, 0, 24, 20, '#BFE6FF')}<rect x="274" y="62" width="12" height="22" fill="#9A3F22"/>${tree(144, 120, 14)}`,
    town: () => `<rect x="170" y="80" width="54" height="70" rx="3" fill="#F3C9A0"/><rect x="230" y="62" width="48" height="88" rx="3" fill="#C7D2FE"/><rect x="284" y="94" width="46" height="56" rx="3" fill="#FDE68A"/>${windows(178, 90, 3, 4, 16, 15, 9, 9, '#fff')}${windows(238, 72, 3, 5, 14, 15, 8, 9, '#fff')}${windows(292, 104, 3, 3, 14, 15, 8, 9, '#fff')}`,
  };

  function figure(x, y, skin, shirt, mood, small) {
    const s = small ? 0.62 : 1;
    const mouth = mood === 'good' ? 'M-6 -3q6 7 12 0' : mood === 'bad' ? 'M-5 2q5-5 10 0' : mood === 'ok' ? 'M-5 -1q5 3 10 0' : 'M-4 0h8';
    return `<g transform="translate(${x} ${y}) scale(${s})" class="${small ? '' : 'sc-bob'}">
      <ellipse cx="0" cy="2" rx="20" ry="4" fill="#000" opacity=".16"/>
      <path d="M-13 0v-26q0-14 13-14t13 14v26z" fill="${shirt}"/>
      <rect x="-9" y="-36" width="18" height="8" rx="3" fill="${skin}"/>
      <circle cx="0" cy="-50" r="15" fill="${skin}"/>
      <path d="M-15-52q1-16 15-16t15 16q-8-8-15-8t-15 8z" fill="#2A1B14"/>
      ${small ? '' : `<circle cx="-5" cy="-52" r="2" fill="#1E293B"/><circle cx="5" cy="-52" r="2" fill="#1E293B"/><path d="${mouth}" transform="translate(0 -42)" stroke="#7A2E1D" stroke-width="2" fill="none" stroke-linecap="round"/>`}
    </g>`;
  }

  function art(kind, idx, mood, t) {
    const p = PAL[idx % PAL.length];
        return `<svg class="sc-art" viewBox="0 0 360 200" role="img" aria-label="${esc(t(kindLabel(kind)))}" preserveAspectRatio="xMidYMax meet">

      <circle cx="${idx % 2 ? 54 : 308}" cy="${idx % 3 === 2 ? 46 : 32}" r="${idx % 3 === 2 ? 22 : 17}" fill="${p.sun}" opacity=".95"/>
      <g class="sc-cloud"><ellipse cx="96" cy="38" rx="26" ry="8" fill="#fff" opacity=".85"/><ellipse cx="112" cy="32" rx="16" ry="7" fill="#fff" opacity=".85"/></g>
      <path d="M0 128q60-36 130-6t140-8q50-14 90 8v78H0z" fill="${p.hill}"/><path d="M0 146q80-22 160-4t200-8v66H0z" fill="${p.hill2}"/>
      ${kind === 'road' ? '' : `<rect x="0" y="150" width="360" height="50" fill="${p.ground}"/>`}
      ${SCENERY[kind]()}
      ${figure(268, 188, SKIN[(idx + 1) % 4], SHIRT[(idx + 2) % 5], 'idle', true)}
      ${figure(98, 188, SKIN[idx % 4], SHIRT[idx % 5], mood)}
    </svg>`;
  }

  // ---------------------------------------------------------------- CSS
  const CSS = `.sc { container-type: inline-size; color: var(--ink); font-family: var(--font-body); max-width: 980px; margin: 0 auto; }
.sc * { box-sizing: border-box; }
.sc-card { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; overflow: hidden; box-shadow: 0 8px 28px rgba(15,23,42,.10); }
.sc-grid { display: grid; grid-template-columns: 1fr; }
.sc-left { position: relative; background: #BFE6FF; }
.sc-art { display: block; width: 100%; height: auto; aspect-ratio: 360 / 200; max-height: 340px; }
.sc-tag { position: absolute; left: 10px; top: 10px; display: inline-flex; align-items: center; gap: 6px; background: #9D174D; color: #fff; border-radius: 999px; padding: 5px 12px 5px 10px; font: 700 .86rem/1.2 var(--font-display); box-shadow: 0 2px 8px rgba(0,0,0,.2); max-width: calc(100% - 20px); }
.sc-tag small { font: 600 .74rem/1.2 var(--font-body); opacity: .9; }
.sc-where { position: absolute; right: 10px; bottom: 8px; background: rgba(255,255,255,.88); color: #1E293B; border-radius: 999px; padding: 4px 10px; font: 700 .76rem/1.2 var(--font-body); }
.sc-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.sc-right { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.sc-trail { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font: 700 .8rem/1 var(--font-body); color: var(--ink-2); min-height: 22px; }
.sc-dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--line); background: var(--sunk); display: inline-block; transition: background .3s, border-color .3s, transform .3s; }
.sc-dot.now { border-color: #9D174D; transform: scale(1.15); }
.sc-dot.good { background: var(--good); border-color: var(--good); }
.sc-dot.bad { background: #F59E0B; border-color: #F59E0B; }
.sc-dot.ok { background: var(--royal); border-color: var(--royal); }
.sc-text { font: 600 1.06rem/1.5 var(--font-body); margin: 0; outline: none; }
.sc-text:focus-visible { outline: 3px solid var(--cyan); outline-offset: 4px; border-radius: 6px; }
.sc-ask { font: 700 .86rem/1.3 var(--font-body); color: var(--ink-2); margin: 0; }
.sc-choices { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.sc-choice { width: 100%; min-height: 56px; text-align: left; display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 16px; border: 2px solid var(--line); background: var(--surface); color: var(--ink); font: 600 1rem/1.35 var(--font-body); cursor: pointer; transition: transform .15s, box-shadow .15s, border-color .15s, background .2s, opacity .25s; }
.sc-choice:hover:not(:disabled) { transform: translateY(-2px); border-color: #9D174D; box-shadow: 0 6px 16px rgba(157,23,77,.16); }
.sc-choice:focus-visible, .sc-btn:focus-visible { outline: 3px solid var(--cyan); outline-offset: 2px; }
.sc-choice:disabled { cursor: default; }
.sc-choice.faded { opacity: .5; }
.sc-choice.picked { opacity: 1; border-width: 3px; }
.sc-choice.picked.good { border-color: var(--good); background: var(--good-t); }
.sc-choice.picked.bad { border-color: #F59E0B; background: #FEF3C7; color: #1E293B; }
.sc-choice.picked.ok { border-color: var(--royal); background: var(--royal-t); }
.sc-key { flex: 0 0 auto; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: #9D174D; color: #fff; font: 800 .95rem/1 var(--font-display); }
.sc-fb { min-height: 0; }
.sc-fbbox { border-radius: 16px; padding: 12px 14px; display: flex; gap: 10px; align-items: flex-start; border: 2px solid; animation: sc-pop .35s ease-out both; }
.sc-fbbox.good { background: var(--good-t); border-color: var(--good); }
.sc-fbbox.bad { background: #FEF3C7; border-color: #F59E0B; color: #1E293B; }
.sc-fbbox.ok { background: var(--royal-t); border-color: var(--royal); }
.sc-fbico { flex: 0 0 auto; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font: 800 1rem/1 var(--font-display); color: #fff; }
.good .sc-fbico { background: var(--good); } .bad .sc-fbico { background: #D97706; } .ok .sc-fbico { background: var(--royal); }
.sc-fbbox b { display: block; font: 800 .9rem/1.2 var(--font-display); margin-bottom: 2px; }
.sc-fbbox p { margin: 0; font: 500 .98rem/1.45 var(--font-body); }
.sc-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.sc-btn { min-height: 48px; min-width: 48px; padding: 0 20px; border-radius: 999px; border: 0; cursor: pointer; font: 700 1rem/1 var(--font-display); display: inline-flex; align-items: center; justify-content: center; gap: 8px; transition: transform .15s, box-shadow .15s, opacity .2s; }
.sc-btn.main { background: #9D174D; color: #fff; box-shadow: 0 4px 12px rgba(157,23,77,.3); }
.sc-btn.main:hover:not(:disabled) { transform: translateY(-2px); }
.sc-btn.main:disabled { opacity: .35; box-shadow: none; cursor: default; }
.sc-btn.soft { background: var(--sunk); color: var(--ink); border: 1.5px solid var(--line); }
.sc-btn.soft:hover { transform: translateY(-1px); }
.sc-sp { flex: 1; }
.sc-in { animation: sc-slide .4s ease-out both; }
.sc-end h3 { font: 800 1.3rem/1.2 var(--font-display); margin: 0; }
.sc-score { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font: 700 1rem/1.3 var(--font-body); }
.sc-star { font-size: 1.6rem; line-height: 1; color: var(--line); } .sc-star.on { color: var(--sun); text-shadow: 0 1px 0 rgba(0,0,0,.15); }
.sc-recap { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; counter-reset: sc; }
.sc-recap li { display: flex; gap: 10px; align-items: flex-start; border-radius: 14px; padding: 10px 12px; border: 1.5px solid var(--line); background: var(--sunk); font: 500 .95rem/1.4 var(--font-body); }
.sc-recap li.good { border-color: var(--good); } .sc-recap li.bad { border-color: #F59E0B; } .sc-recap li.ok { border-color: var(--royal); }
.sc-recap b { display: block; font-weight: 700; }
.sc-recap small { display: block; color: var(--ink-2); font-size: .88rem; margin-top: 2px; }
.sc-bob { animation: sc-bob 2.6s ease-in-out infinite; transform-box: fill-box; }
.sc-cloud { animation: sc-drift 18s ease-in-out infinite alternate; }
@keyframes sc-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
@keyframes sc-drift { from { transform: translateX(-12px); } to { transform: translateX(40px); } }
@keyframes sc-pop { from { opacity: 0; transform: scale(.96) translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes sc-slide { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@container (min-width: 760px) {
  .sc-grid { grid-template-columns: minmax(300px, 5fr) 6fr; }
  .sc-left { display: flex; align-items: flex-end; }
  .sc-stage { width: 100%; }
  .sc-right { padding: 20px 22px 22px; }
  .sc-text { font-size: 1.15rem; }
}
@media (prefers-reduced-motion: reduce) { .sc *, .sc-bob, .sc-cloud { animation: none !important; transition: none !important; } }`;

  // ---------------------------------------------------------------- mount
  function mount(root, config, api) {
    const by = {};
    config.scenes.forEach((s, i) => { by[s.id] = Object.assign({ idx: i }, s); });
    const kind = kindOf(config.setting);
    const t = (x) => api.t(x);
    const S = { id: config.scenes[0].id, picked: null, hist: [], ended: false, mood: 'idle', anim: 'scene', focus: null };
    let alive = true;

    root.innerHTML = `<div class="sc"><div class="sc-card"><div class="sc-grid">
      <div class="sc-left"><div class="sc-stage"></div><div class="sc-tag"></div><div class="sc-where"></div></div>
      <div class="sc-right">
        <div class="sc-trail" aria-hidden="true"></div>
        <div class="sc-body"></div>
        <div class="sc-fb" aria-live="polite"></div>
        <div class="sc-actions"></div>
      </div></div></div></div>`;
    const q = (s) => root.querySelector(s);
    const elStage = q('.sc-stage'), elTag = q('.sc-tag'), elWhere = q('.sc-where'), elTrail = q('.sc-trail'), elBody = q('.sc-body'), elFb = q('.sc-fb'), elAct = q('.sc-actions');

    const kindOfChoice = (ch) => (ch.good === true ? 'good' : ch.good === false ? 'bad' : 'ok');
    const labelOf = (k) => t(k === 'good' ? W.wise : k === 'bad' ? W.rethink : W.okay);
    const iconOf = (k) => (k === 'good' ? '✓' : k === 'bad' ? '!' : 'i');
    const maxDecisions = (() => {
      const memo = {};
      const f = (id) => (id in memo ? memo[id] : (memo[id] = 1 + Math.max(...by[id].choices.map((ch) => (ch.next === 'end' ? 0 : f(ch.next))))));
      return f(config.scenes[0].id);
    })();

    function drawArt() {
      const sc = by[S.id];
      const url = sc.image ? api.asset(sc.image) : null;
      elStage.innerHTML = art(kind, sc.idx, S.mood, t) + (url ? `<img class="sc-photo" src="${esc(url)}" alt="">` : '');
      elTag.innerHTML = `<span aria-hidden="true">🎭</span><span>${esc(t(W.you))}: ${esc(t(config.role))}</span>`;
      elWhere.textContent = t(kindLabel(kind));
      root.querySelector('.sc-left').style.background = `linear-gradient(180deg, ${PAL[sc.idx % PAL.length].sky1} 0%, ${PAL[sc.idx % PAL.length].sky2} 75%)`;
      const img = elStage.querySelector('.sc-photo');
      if (img) img.addEventListener('error', () => img.remove());
    }

    function drawTrail() {
      let h = '';
      const n = Math.max(maxDecisions, S.hist.length + (S.ended ? 0 : 1));
      for (let i = 0; i < n; i++) {
        const done = S.hist[i];
        const cls = done ? done.kind : i === S.hist.length && !S.ended && !S.picked ? 'now' : '';
        h += `<span class="sc-dot ${cls}"></span>`;
      }
      const cur = S.ended || S.picked ? S.hist.length : S.hist.length + 1;
      elTrail.innerHTML = `<span>${esc(t(S.ended ? W.the_end : W.step))}${S.ended ? '' : ' ' + cur}</span>${h}`;
    }

    function drawScene() {
      const sc = by[S.id];
      const cls = S.anim === 'scene' ? ' sc-in' : '';
      elBody.innerHTML = `<div class="${cls.trim()}"><p class="sc-text" tabindex="-1">${esc(t(sc.text))}</p>
        <p class="sc-ask" style="margin-top:12px">${esc(t(W.pick))}</p>
        <ul class="sc-choices" style="margin-top:8px">${sc.choices.map((ch, i) => {
    const k = kindOfChoice(ch);
    const picked = S.picked === ch.id;
    const state = S.picked ? (picked ? ' picked ' + k : ' faded') : '';
    return `<li><button class="sc-choice${state}" type="button" data-key="choice:${esc(sc.id)}:${esc(ch.id)}" data-choice="${esc(ch.id)}" ${S.picked ? 'disabled' : ''} aria-pressed="${picked}"><span class="sc-key" aria-hidden="true">${String.fromCharCode(65 + i)}</span><span>${esc(t(ch.text))}</span></button></li>`;
  }).join('')}</ul></div>`;
    }

    function drawFeedback() {
      if (S.ended) { drawEnd(); return; }
      if (!S.picked) { elFb.innerHTML = ''; return; }
      const ch = by[S.id].choices.find((c) => c.id === S.picked);
      const k = kindOfChoice(ch);
      elFb.innerHTML = `<div class="sc-fbbox ${k}"><span class="sc-fbico" aria-hidden="true">${iconOf(k)}</span><div><b>${esc(labelOf(k))}</b><p>${esc(t(ch.feedback))}</p></div></div>`;
    }

    function drawEnd() {
      const graded = S.hist.filter((h) => h.kind !== 'ok');
      const wise = S.hist.filter((h) => h.kind === 'good').length;
      const bad = S.hist.filter((h) => h.kind === 'bad').length;
      const total = S.hist.length;
      const verdict = bad === 0 && wise > 0 ? W.allwise : graded.length === 0 ? W.neutral : wise * 2 >= total ? W.mostwise : W.fewwise;
      const stars = 3;
      const lit = bad === 0 && wise > 0 ? 3 : wise * 2 >= total ? 2 : wise > 0 ? 1 : 0;
      elBody.innerHTML = `<div class="sc-end sc-in"><h3 class="sc-text" tabindex="-1">${esc(t(W.story))}</h3>
        <ol class="sc-recap" style="margin-top:10px">${S.hist.map((h) => `<li class="${h.kind}"><span class="sc-fbico" style="width:24px;height:24px;font-size:.85rem;border-radius:50%;display:grid;place-items:center;color:#fff;flex:0 0 auto;background:${h.kind === 'good' ? 'var(--good)' : h.kind === 'bad' ? '#D97706' : 'var(--royal)'}" aria-hidden="true">${iconOf(h.kind)}</span><span><b>${esc(t(h.text))}</b><small>${esc(t(h.feedback))}</small></span></li>`).join('')}</ol></div>`;
      elFb.innerHTML = `<div class="sc-fbbox ${bad === 0 && wise > 0 ? 'good' : 'ok'}"><div><div class="sc-score"><span>${wise} ${esc(t(W.of))} ${total} ${esc(t(W.score))}</span><span aria-hidden="true">${Array.from({ length: stars }, (_, i) => `<span class="sc-star ${i < lit ? 'on' : ''}">★</span>`).join('')}</span></div><p>${esc(t(verdict))}</p></div></div>`;
    }

    function drawActions() {
      let h = '';
      if (S.ended) {
        h = `<button class="sc-btn main" type="button" data-key="restart">↺ ${esc(t(W.again))}</button><span class="sc-sp"></span>`;
      } else {
        const ch = S.picked ? by[S.id].choices.find((c) => c.id === S.picked) : null;
        const last = ch && ch.next === 'end';
        h = `<button class="sc-btn main" type="button" data-key="next" ${S.picked ? '' : 'disabled'}>${esc(t(last ? W.finish : W.next))} →</button>
          <button class="sc-btn soft" type="button" data-key="listen" aria-label="${esc(t(W.listen))}">🔊 ${esc(t(W.listen))}</button><span class="sc-sp"></span>
          <button class="sc-btn soft" type="button" data-key="restart">↺ ${esc(t(W.again))}</button>`;
      }
      elAct.innerHTML = h;
    }

    function draw() {
      drawArt(); drawTrail(); drawScene(); drawFeedback(); drawActions();
      if (S.focus) {
        const f = S.focus; S.focus = null;
        const el = f === 'text' ? root.querySelector('.sc-text') : root.querySelector(`[data-key="${f}"]`);
        if (el && el.focus) { try { el.focus({ preventScroll: f !== 'next' }); } catch (e) { el.focus(); } }
      }
    }

    function choose(cid) {
      if (S.picked || S.ended) return;
      const sc = by[S.id];
      const ch = sc.choices.find((c) => c.id === cid);
      if (!ch) return;
      if (!api.allowed('choice:' + sc.id + ':' + cid)) { api.nudge('choice:' + sc.id + ':' + cid); return; }
      S.picked = cid;
      const k = kindOfChoice(ch);
      S.mood = k === 'good' ? 'good' : k === 'bad' ? 'bad' : 'ok';
      S.anim = 'fb';
      S.focus = 'next';
      S.hist.push({ scene: sc.id, choice: cid, kind: k, text: ch.text, feedback: ch.feedback });
      api.record(`${t(W.step)} ${S.hist.length}: ${t(ch.text)} (${labelOf(k)})`);
      draw();
      api.emit('chose:' + cid);
      api.speak(t(ch.feedback), api.lang());
    }

    function next() {
      if (!S.picked || S.ended) return;
      if (!api.allowed('next')) { api.nudge('next'); return; }
      const ch = by[S.id].choices.find((c) => c.id === S.picked);
      S.picked = null; S.mood = 'idle'; S.anim = 'scene';
      if (ch.next === 'end') {
        S.ended = true; S.focus = 'text';
        const good = S.hist.every((h) => h.kind !== 'bad') && S.hist[S.hist.length - 1].kind === 'good';
        api.record(t(W.the_end) + (good ? ': ' + t(W.allwise) : ''));
        draw();
        api.emit('ended');
        if (good) { api.emit('ended:good'); api.celebrate(); }
      } else {
        S.id = ch.next; S.focus = 'text';
        draw();
      }
    }

    function restart() {
      if (!api.allowed('restart')) { api.nudge('restart'); return; }
      S.id = config.scenes[0].id; S.picked = null; S.hist = []; S.ended = false; S.mood = 'idle'; S.anim = 'scene'; S.focus = 'text';
      api.record(t(W.again));
      draw();
    }

    function listen() {
      if (!api.allowed('listen')) { api.nudge('listen'); return; }
      const sc = by[S.id];
      api.speak(t(sc.text) + '. ' + sc.choices.map((c, i) => String.fromCharCode(65 + i) + '. ' + t(c.text)).join('. '), api.lang());
    }

    const onClick = (ev) => {
      const b = ev.target.closest('[data-key]');
      if (!b || !root.contains(b) || b.disabled) return;
      const k = b.dataset.key;
      if (k.startsWith('choice:')) choose(b.dataset.choice);
      else if (k === 'next') next();
      else if (k === 'restart') restart();
      else if (k === 'listen') listen();
    };
    root.addEventListener('click', onClick);
    draw();

    return { destroy() { alive = false; root.removeEventListener('click', onClick); root.innerHTML = ''; } };
  }

  // ---------------------------------------------------------------- demo
  const DEMO = {
    setting: 'village panchayat',
    role: T2('Ward member of the Gram Panchayat', 'ग्राम पंचायत के वार्ड सदस्य (पंच)'),
    scenes: [
      {
        id: 'start',
        text: T2('The village well is almost dry. Many families walk far to fetch water. You are a ward member, and people look to you. How will you begin?',
          'गाँव का कुआँ लगभग सूख गया है। कई परिवार दूर से पानी लाते हैं। आप वार्ड सदस्य हैं और लोग आपकी ओर देख रहे हैं। आप शुरुआत कैसे करेंगे?'),
        choices: [
          { id: 'call-sabha', text: T2('Call a Gram Sabha so every adult voter can discuss it', 'ग्राम सभा बुलाओ ताकि हर वयस्क मतदाता चर्चा कर सके'), next: 'sabha', good: true,
            feedback: T2('The Gram Sabha is the meeting of all the adult voters of the village. A decision made there belongs to everyone.', 'ग्राम सभा गाँव के सभी वयस्क मतदाताओं की बैठक होती है। वहाँ लिया गया निर्णय सबका अपना होता है।') },
          { id: 'decide-alone', text: T2('Decide with a few friends and tell the others later', 'कुछ दोस्तों के साथ तय कर लो, बाकी को बाद में बताओ'), next: 'alone', good: false,
            feedback: T2('The Panchayat works for the whole village. Deciding without asking leaves many voices out and people stop trusting you.', 'पंचायत पूरे गाँव के लिए काम करती है। बिना पूछे तय करने से कई लोगों की बात छूट जाती है और लोगों का भरोसा घटता है।') },
          { id: 'write-block', text: T2('Write to the Block Development Officer for help first', 'पहले खंड विकास अधिकारी को सहायता के लिए पत्र लिखो'), next: 'block',
            feedback: T2('Asking the higher office for help is allowed. But the village must also say what it needs, so involve the people too.', 'ऊपरी कार्यालय से मदद माँगना ठीक है। पर गाँव को भी बताना होगा कि उसे क्या चाहिए, इसलिए लोगों को भी शामिल करो।') },
        ],
      },
      {
        id: 'alone',
        text: T2('Some villagers are upset that nobody asked them. A group comes and asks how the money will be spent.', 'कुछ गाँव वाले नाराज़ हैं कि किसी ने उनसे पूछा नहीं। एक समूह आकर पूछता है कि पैसा कैसे खर्च होगा।'),
        choices: [
          { id: 'admit-call', text: T2('Say sorry and call a Gram Sabha now', 'क्षमा माँगो और अभी ग्राम सभा बुलाओ'), next: 'sabha', good: true,
            feedback: T2('Accepting a mistake and fixing it is a sign of a good leader. Now everyone can speak.', 'गलती मानकर उसे सुधारना अच्छे नेता की पहचान है। अब सब अपनी बात कह सकते हैं।') },
          { id: 'not-your-business', text: T2('Say it is not their business', 'कहो कि यह उनका काम नहीं है'), next: 'end', good: false,
            feedback: T2('Villagers elected you and have the right to know how public money is used. Hiding it breaks their trust.', 'गाँव वालों ने आपको चुना है और उन्हें जानने का अधिकार है कि सार्वजनिक पैसा कैसे लगता है। छिपाने से भरोसा टूटता है।') },
        ],
      },
      {
        id: 'block',
        text: T2('The Block Development Officer says a grant is possible, but the Panchayat must send a plan that shows what the village really needs.', 'खंड विकास अधिकारी कहते हैं कि अनुदान मिल सकता है, पर पंचायत को ऐसी योजना भेजनी होगी जो बताए कि गाँव को सच में क्या चाहिए।'),
        choices: [
          { id: 'plan-sabha', text: T2('Call a Gram Sabha to prepare the plan together', 'योजना साथ मिलकर बनाने के लिए ग्राम सभा बुलाओ'), next: 'sabha', good: true,
            feedback: T2('A plan made with the people shows the real needs and is easier to carry out.', 'लोगों के साथ बनी योजना असली ज़रूरतें दिखाती है और उसे पूरा करना आसान होता है।') },
          { id: 'copy-plan', text: T2('Copy the plan of another village', 'दूसरे गाँव की योजना की नकल कर लो'), next: 'end', good: false,
            feedback: T2('Every village has its own needs. A copied plan may not solve your water problem.', 'हर गाँव की अपनी ज़रूरतें होती हैं। नकल की हुई योजना आपकी पानी की समस्या हल नहीं कर सकती।') },
        ],
      },
      {
        id: 'sabha',
        text: T2('At the Gram Sabha people suggest three ideas: a new hand pump, repairing the old well, or a rainwater tank at the school. The fund is limited.', 'ग्राम सभा में लोग तीन सुझाव देते हैं: नया हैंडपंप, पुराने कुएँ की मरम्मत या स्कूल में वर्षा-जल टंकी। निधि सीमित है।'),
        choices: [
          { id: 'cost-vote', text: T2('Find the cost of each idea, then let the Sabha vote openly', 'हर सुझाव का खर्च पता करो, फिर सभा को खुलकर वोट करने दो'), next: 'funds', good: true,
            feedback: T2('Knowing the costs helps people choose well, and an open vote makes the decision fair.', 'खर्च जानने से लोग अच्छा चुनाव कर पाते हैं और खुला मतदान निर्णय को निष्पक्ष बनाता है।') },
          { id: 'relative', text: T2('Give the work to a relative without asking anyone', 'बिना किसी से पूछे काम अपने रिश्तेदार को दे दो'), next: 'end', good: false,
            feedback: T2('Giving work to relatives for favour is unfair and misuses public money. Work should go to the best, open offer.', 'अपनों को मेहरबानी में काम देना अनुचित है और सार्वजनिक पैसे का दुरुपयोग है। काम सबसे अच्छे, खुले प्रस्ताव को मिलना चाहिए।') },
          { id: 'loudest', text: T2('Pick what the loudest person wants', 'जो सबसे ज़ोर से बोले, वही चुन लो'), next: 'funds', good: false,
            feedback: T2('The loudest voice is not always the village\'s need. Quiet people, women and the poor must be heard too.', 'सबसे ऊँची आवाज़ हमेशा गाँव की ज़रूरत नहीं होती। शांत लोगों, महिलाओं और गरीबों की बात भी सुननी चाहिए।') },
        ],
      },
      {
        id: 'funds',
        text: T2('The work begins. A villager asks to see the bills and how much has been spent so far.', 'काम शुरू हो गया है। एक गाँव वाला बिल और अब तक का खर्च देखना चाहता है।'),
        choices: [
          { id: 'show-all', text: T2('Show the bills and accounts openly at the Gram Sabha', 'ग्राम सभा में बिल और हिसाब खुलकर दिखाओ'), next: 'finish', good: true,
            feedback: T2('Open accounts build trust and stop mistakes and cheating. People then help to look after the work.', 'खुला हिसाब भरोसा बनाता है और गलती व धोखे को रोकता है। फिर लोग काम की देखभाल में भी हाथ बँटाते हैं।') },
          { id: 'secret', text: T2('Say the accounts are a secret', 'कहो कि हिसाब गोपनीय है'), next: 'end', good: false,
            feedback: T2('Village accounts are public. Calling them secret makes people suspect that something is wrong.', 'गाँव का हिसाब सार्वजनिक होता है। उसे गोपनीय कहने से लोग शक करने लगते हैं कि कुछ गड़बड़ है।') },
          { id: 'total-only', text: T2('Tell only the total amount', 'सिर्फ़ कुल रकम बता दो'), next: 'finish',
            feedback: T2('A total is a start, but without the bills people cannot check where each rupee went.', 'कुल रकम बताना शुरुआत है, पर बिल के बिना लोग जाँच नहीं सकते कि हर रुपया कहाँ गया।') },
        ],
      },
      {
        id: 'finish',
        text: T2('Some months later the new hand pump gives clean water. A nearby village asks how you managed it.', 'कुछ महीनों बाद नए हैंडपंप से साफ़ पानी आ रहा है। पास के गाँव वाले पूछते हैं कि आपने यह कैसे किया।'),
        choices: [
          { id: 'share-way', text: T2('Tell them: ask the Gram Sabha, keep a record and show the accounts', 'बताओ: ग्राम सभा से पूछो, रिकॉर्ड रखो और हिसाब दिखाओ'), next: 'end', good: true,
            feedback: T2('Sharing what worked helps other villages. Open meetings, records and accounts make a Panchayat strong.', 'जो काम आया उसे बाँटने से दूसरे गाँवों को मदद मिलती है। खुली बैठकें, रिकॉर्ड और हिसाब पंचायत को मज़बूत बनाते हैं।') },
          { id: 'take-credit', text: T2('Say it was only your own idea', 'कहो कि यह सिर्फ़ आपका अपना विचार था'), next: 'end', good: false,
            feedback: T2('The village decided together. Taking all the credit is not fair to the people who worked and voted.', 'फैसला गाँव ने मिलकर किया था। सारा श्रेय खुद लेना काम करने और वोट देने वालों के साथ अन्याय है।') },
        ],
      },
    ],
  };

  NCA_T.register({
    id: 'scenario',
    css: CSS,
    validate,
    keys,
    demo: DEMO,
    kinds: KINDS.map((k) => k[0]).concat('town'),
    // The pure story model, for tests under Node.
    model: { analyse, kindOf },
    mount(root, config, api) { return mount(root, config, api); },
  });
})();
