// NetCyberAI Labs: the engine. The gallery (every lab, filtered by class, subject and words) and the player that runs
// any lab on its template: Guide → Predict → Run → Explain → Check → Explore, in English or Hindi, with the glowing
// spotlight, read-aloud, the tutor's view, and the child's results. Labs are data (defs/…json); templates are
// templates/<id>.js. Nothing here knows a particular subject.
(() => {
  const L = window.NCA_LIB;
  const { esc } = L;
  const reduced = L.reducedMotion;
  const app = document.getElementById('app');
  const S = { lang: 'en', prevLang: null, idx: null, filter: { cls: 'all', subject: 'all', q: '' }, shown: 48, lab: null, chapter: null, mode: 'guided', step: 0, guess: null, guessRight: null, checksRight: 0, checksTotal: 0, log: [], inst: null, done: false, started: 0 };
  try { const v = localStorage.getItem('nca.labs.lang'); if (v === 'hi' || v === 'en') S.lang = v; } catch (e) {}
  const t = (x) => L.tx(x, S.lang);
  const U = {
    eyebrow: { en: 'NetCyberAI', hi: 'NetCyberAI' },
    hero: { en: 'Touch it. See it. <span>Get it.</span>', hi: 'छुओ, देखो, <span>समझो</span>' },
    tagline: { en: 'Real experiments and hands-on labs for every class from 1 to 12, guided step by step, in English or Hindi.', hi: 'कक्षा 1 से 12 तक हर कक्षा के लिए असली प्रयोग और करके सीखने वाली लैब, क़दम-दर-क़दम, अंग्रेज़ी या हिंदी में।' },
    loop: [{ en: 'Guide', hi: 'मार्गदर्शन' }, { en: 'Predict', hi: 'अनुमान' }, { en: 'Run', hi: 'प्रयोग' }, { en: 'Explain', hi: 'समझो' }, { en: 'Check', hi: 'जाँचो' }, { en: 'Explore', hi: 'खोजो' }],
    cls: { en: 'Class', hi: 'कक्षा' }, all: { en: 'All', hi: 'सभी' }, allClasses: { en: 'All classes', hi: 'सभी कक्षाएँ' }, subject: { en: 'Subject', hi: 'विषय' },
    search: { en: 'Search labs, chapters, topics', hi: 'लैब, अध्याय, विषय खोजो' }, found: { en: '{n} labs', hi: '{n} लैब' }, more: { en: 'Show more', hi: 'और दिखाओ' },
    open: { en: 'Open the lab', hi: 'लैब खोलो' }, min: { en: 'min', hi: 'मिनट' }, stretch: { en: 'For the curious', hi: 'जिज्ञासुओं के लिए' },
    tplHead: { en: 'Templates, built once', hi: 'टेम्पलेट, एक बार बने' },
    tplSub: { en: 'Every lab is one of these templates with its own settings. A new chapter adds settings, not code.', hi: 'हर लैब इन्हीं टेम्पलेट में से एक है, अपनी सेटिंग के साथ। नया अध्याय केवल सेटिंग जोड़ता है, कोड नहीं।' },
    uses: { en: 'labs', hi: 'लैब' },
    back: { en: 'All labs', hi: 'सभी लैब' }, guided: { en: 'Guided', hi: 'मार्गदर्शन' }, explore: { en: 'Explore', hi: 'खोजो' }, tutor: { en: 'Ask the tutor', hi: 'ट्यूटर से पूछो' },
    stepOf: { en: 'Step {a} of {b}', hi: 'चरण {a} / {b}' },
    kinds: { do: { en: 'Do this', hi: 'यह करो' }, predict: { en: 'Predict', hi: 'अनुमान लगाओ' }, explain: { en: 'Why it happened', hi: 'ऐसा क्यों हुआ' }, check: { en: 'Check', hi: 'जाँचो' }, explore: { en: 'Explore', hi: 'खोजो' } },
    showMe: { en: 'Show me where', hi: 'मुझे दिखाओ' }, listen: { en: 'Listen', hi: 'सुनो' }, gotIt: { en: 'Got it', hi: 'समझ गया' },
    saved: { en: 'Your guess is saved. Now let us find out.', hi: 'तुम्हारा अनुमान सहेज लिया। अब पता करते हैं।' },
    youGuessed: { en: 'You guessed: ', hi: 'तुम्हारा अनुमान: ' }, guessRight: { en: 'Spot on!', hi: 'बिल्कुल सही!' }, guessWrong: { en: 'Now you know what really happens.', hi: 'अब तुम जानते हो कि असल में क्या होता है।' },
    right: { en: 'Right.', hi: 'सही।' }, notQuite: { en: 'Not quite. Here is why.', hi: 'पूरी तरह सही नहीं। इसका कारण:' }, tryAgain: { en: 'Try once more.', hi: 'एक बार और कोशिश करो।' }, answerIs: { en: 'The answer is: ', hi: 'सही उत्तर: ' }, next: { en: 'Next', hi: 'आगे' },
    finish: { en: 'Finish the lab', hi: 'लैब पूरी करो' }, complete: { en: 'Lab complete', hi: 'लैब पूरी हुई' },
    guesses: { en: 'guess right', hi: 'सही अनुमान' }, checks: { en: 'checks right', hi: 'सही उत्तर' }, minutes: { en: 'minutes', hi: 'मिनट' },
    again: { en: 'Do it again', hi: 'फिर से करो' }, toChapter: { en: 'Back to the chapter', hi: 'अध्याय पर लौटो' }, another: { en: 'Try another lab', hi: 'दूसरी लैब आज़माओ' },
    chapterNote: { en: 'In the app, this returns to the exact step of the lesson the lab was opened from.', hi: 'ऐप में यह पाठ के उसी चरण पर लौटाता है जहाँ से लैब खोली गई थी।' },
    exploreHead: { en: 'Explore freely', hi: 'खुलकर खोजो' }, exploreNote: { en: 'Every control works now. Change one thing at a time and watch what happens.', hi: 'अब हर बटन काम करता है। एक बार में एक चीज़ बदलो और देखो क्या होता है।' }, backGuided: { en: 'Back to the guided steps', hi: 'मार्गदर्शन पर लौटो' },
    follow: { en: 'Follow the glowing step first.', hi: 'पहले चमकते हुए चरण का पालन करो।' }, answerFirst: { en: 'Answer in the guide first.', hi: 'पहले गाइड में उत्तर दो।' },
    knows: { en: 'The tutor sees which lab you are in, the step, your guess and what you did, so it can answer about your experiment.', hi: 'ट्यूटर देखता है कि तुम किस लैब में हो, कौन-सा चरण है, तुम्हारा अनुमान और तुमने क्या किया, ताकि वह तुम्हारे प्रयोग के बारे में बता सके।' },
    tHead: { en: 'Ask the tutor', hi: 'ट्यूटर से पूछो' }, tLab: { en: 'Lab', hi: 'लैब' }, tChapter: { en: 'Chapter', hi: 'अध्याय' }, tStep: { en: 'Step now', hi: 'अभी का चरण' }, tGuess: { en: 'Your guess', hi: 'तुम्हारा अनुमान' }, tDid: { en: 'What you did', hi: 'तुमने क्या किया' }, tNone: { en: 'Nothing yet', hi: 'अभी कुछ नहीं' },
    tAsk: { en: 'Your question', hi: 'तुम्हारा सवाल' }, tSend: { en: 'Send', hi: 'भेजो' }, tClose: { en: 'Close', hi: 'बंद करो' },
    tProto: { en: 'Preview: nothing is sent from this page. In the app, your question goes to the tutor with everything listed above, in your language.', hi: 'प्रीव्यू: इस पेज से कुछ नहीं भेजा जाता। ऐप में तुम्हारा सवाल ऊपर दी गई सारी जानकारी के साथ, तुम्हारी भाषा में, ट्यूटर तक जाता है।' },
    notSent: { en: 'Not sent: this is the preview.', hi: 'नहीं भेजा गया: यह प्रीव्यू है।' },
    loading: { en: 'Opening the lab…', hi: 'लैब खुल रही है…' }, failed: { en: 'This lab could not be opened. Go back and try another; we will fix this one.', hi: 'यह लैब नहीं खुल सकी। वापस जाकर दूसरी आज़माओ; इसे हम ठीक करेंगे।' },
  };
  const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k]);
  const SUBJ = { english: { en: 'English', hi: 'अंग्रेज़ी' }, hindi: { en: 'Hindi', hi: 'हिंदी' }, sanskrit: { en: 'Sanskrit', hi: 'संस्कृत' }, mathematics: { en: 'Maths', hi: 'गणित' }, evs: { en: 'EVS', hi: 'पर्यावरण' }, science: { en: 'Science', hi: 'विज्ञान' }, social_science: { en: 'Social Science', hi: 'सामाजिक विज्ञान' }, physics: { en: 'Physics', hi: 'भौतिकी' }, chemistry: { en: 'Chemistry', hi: 'रसायन' }, biology: { en: 'Biology', hi: 'जीव विज्ञान' }, accountancy: { en: 'Accountancy', hi: 'लेखाशास्त्र' }, business_studies: { en: 'Business Studies', hi: 'व्यवसाय अध्ययन' }, economics: { en: 'Economics', hi: 'अर्थशास्त्र' }, history: { en: 'History', hi: 'इतिहास' }, geography: { en: 'Geography', hi: 'भूगोल' }, political_science: { en: 'Political Science', hi: 'राजनीति विज्ञान' }, sociology: { en: 'Sociology', hi: 'समाजशास्त्र' }, psychology: { en: 'Psychology', hi: 'मनोविज्ञान' }, computer_science: { en: 'Computer Science', hi: 'कंप्यूटर विज्ञान' }, informatics_practices: { en: 'Informatics Practices', hi: 'सूचना विज्ञान अभ्यास' } };

  // ---- speech ----
  const canSpeak = 'speechSynthesis' in window;
  function speak(text, lang) {
    if (!canSpeak || !text) return;
    const Lg = lang || S.lang;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text).replace(/->/g, ' gives '));
    const vs = speechSynthesis.getVoices();
    const v = Lg === 'hi' ? vs.find((x) => /^hi/i.test(x.lang)) : vs.find((x) => x.lang === 'en-IN') || vs.find((x) => /^en/i.test(x.lang));
    if (v) u.voice = v;
    u.lang = Lg === 'hi' ? 'hi-IN' : 'en-IN';
    u.rate = 0.92;
    speechSynthesis.speak(u);
  }

  // ---- data ----
  let assets = {};
  async function loadIndex() {
    if (S.idx) return S.idx;
    const r = await fetch('index.json');
    S.idx = await r.json();
    try { assets = await (await fetch('assets/manifest.json')).json(); } catch (e) { assets = {}; }
    return S.idx;
  }
  const subjName = (id) => t(SUBJ[id] || { en: id, hi: id });
  const cardArt = (tpl) => {
    const c = (tpl && tpl.colour) || '#1D4ED8';
    const n = tpl ? t(tpl.name) : '';
    return `<svg class="art" viewBox="0 0 320 150" aria-hidden="true"><defs><linearGradient id="g-${esc(tpl && tpl.id)}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${esc(c)}"/><stop offset="1" stop-color="#061233"/></linearGradient></defs><rect width="320" height="150" fill="url(#g-${esc(tpl && tpl.id)})"/><circle cx="268" cy="34" r="54" fill="#ffffff" opacity=".08"/><circle cx="40" cy="132" r="64" fill="#ffffff" opacity=".06"/><text x="20" y="128" font-family="Baloo 2, sans-serif" font-weight="800" font-size="22" fill="#ffffff">${esc(n)}</text></svg>`;
  };

  // ---- gallery ----
  async function gallery() {
    stopLab();
    S.lab = null;
    app.innerHTML = `<div class="wrap"><p class="muted" style="padding:24px 0">${esc(t(U.loading))}</p></div>`;
    let idx;
    try { idx = await loadIndex(); } catch (e) { app.innerHTML = `<div class="wrap"><p class="err">${esc(t(U.failed))}</p></div>`; return; }
    const tpl = idx.templates || {};
    const q = S.filter.q.trim().toLowerCase();
    const inClass = idx.labs.filter((l) => S.filter.cls === 'all' || String(l.class) === S.filter.cls);
    const subjects = [...new Set(inClass.map((l) => l.subject_id))];
    if (S.filter.subject !== 'all' && !subjects.includes(S.filter.subject)) S.filter.subject = 'all';
    const list = inClass.filter((l) => (S.filter.subject === 'all' || l.subject_id === S.filter.subject) && (!q || [t(l.title), l.chapter_title, l.topic_title || '', l.id].join(' ').toLowerCase().includes(q)));
    const classes = [...new Set(idx.labs.map((l) => l.class))].sort((a, b) => a - b);
    app.innerHTML = `
      <section class="hero"><div class="wrap">
        <div><div class="eyebrow">${esc(t(U.eyebrow))}</div><h1>${t(U.hero)}</h1><p>${esc(t(U.tagline))}</p>
          <ol class="loop">${U.loop.map((x, i) => `<li><b>${i + 1}</b>${esc(t(x))}</li>`).join('')}</ol></div>
        <div class="orbit" aria-hidden="true"><svg viewBox="0 0 500 400"><defs><radialGradient id="core" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFE27A"/><stop offset="1" stop-color="#FF7A1A"/></radialGradient></defs>
          <circle cx="250" cy="200" r="150" fill="none" stroke="rgba(127,230,255,.25)" stroke-width="2" stroke-dasharray="4 8"/><circle cx="250" cy="200" r="95" fill="none" stroke="rgba(255,210,63,.25)" stroke-width="2"/><circle cx="250" cy="200" r="46" fill="url(#core)"/>
          <text x="250" y="212" text-anchor="middle" font-family="Baloo 2" font-weight="800" font-size="30" fill="#061233">${idx.labs.length}</text>
          <g class="spin"><circle cx="400" cy="200" r="22" fill="#1D4ED8"/><circle cx="100" cy="200" r="22" fill="#0F766E"/></g><g class="spin2"><circle cx="250" cy="105" r="18" fill="#6D28D9"/><circle cx="250" cy="295" r="18" fill="#FF7A1A"/></g></svg></div>
      </div></section>
      <div class="wrap">
        <div class="filters">
          <label class="lbl" for="fcls">${esc(t(U.cls))}</label>
          <select id="fcls" class="sel"><option value="all">${esc(t(U.allClasses))}</option>${classes.map((c) => `<option value="${c}" ${String(c) === S.filter.cls ? 'selected' : ''}>${esc(t(U.cls))} ${c}</option>`).join('')}</select>
          <input id="fq" class="search" type="search" placeholder="${esc(t(U.search))}" value="${esc(S.filter.q)}" aria-label="${esc(t(U.search))}">
        </div>
        <div class="filters" role="group" aria-label="${esc(t(U.subject))}"><span class="lbl">${esc(t(U.subject))}</span><button type="button" class="chip" data-fs="all" aria-pressed="${S.filter.subject === 'all'}">${esc(t(U.all))}</button>${subjects.map((s) => `<button type="button" class="chip" data-fs="${esc(s)}" aria-pressed="${S.filter.subject === s}">${esc(subjName(s))}</button>`).join('')}</div>
        <div class="count">${esc(fill(t(U.found), { n: list.length }))}</div>
        <div class="grid">${list.slice(0, S.shown).map((l) => `<button type="button" class="card" data-open="${esc(l.id)}">${cardArt(tpl[l.template] ? Object.assign({ id: l.template }, tpl[l.template]) : null)}<span class="body">
          <span class="meta"><span class="tag t" style="background:${esc((tpl[l.template] && tpl[l.template].colour) || '#1D4ED8')}">${esc(subjName(l.subject_id))}</span><span class="tag">${esc(t(U.cls))} ${l.class}</span><span class="tag">${l.minutes || 5} ${esc(t(U.min))}</span>${l.level === 'stretch' ? `<span class="tag">${esc(t(U.stretch))}</span>` : ''}</span>
          <h3>${esc(t(l.title))}</h3><p class="fits">${esc(l.chapter_title)}${l.topic_title ? ' · ' + esc(l.topic_title) : ''}</p>
          <span class="go">${esc(t(U.open))} →</span></span></button>`).join('')}</div>
        ${list.length > S.shown ? `<div class="more"><button type="button" class="btn" id="more">${esc(t(U.more))}</button></div>` : ''}
        <section class="tpls"><h2>${esc(t(U.tplHead))}</h2><p>${esc(t(U.tplSub))}</p>
          <div class="tplrow">${Object.keys(tpl).filter((k) => idx.labs.some((l) => l.template === k)).map((k) => { const n = idx.labs.filter((l) => l.template === k).length; return `<div class="tpl"><span class="sw" style="background:${esc(tpl[k].colour || '#1D4ED8')}"></span><b>${esc(t(tpl[k].name))}</b><small>${esc(t(tpl[k].about))}</small><span class="uses">${n} ${esc(t(U.uses))}</span></div>`; }).join('')}</div></section>
      </div>`;
    const fq = document.getElementById('fq');
    fq.addEventListener('input', () => { S.filter.q = fq.value; S.shown = 48; clearTimeout(fq._t); fq._t = setTimeout(() => { gallery().then(() => { const n = document.getElementById('fq'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); }, 250); });
    document.getElementById('fcls').addEventListener('change', (e) => { S.filter.cls = e.target.value; S.shown = 48; gallery(); });
  }

  // ---- player ----
  let spotTimer = 0, ci = 0, tries = 0;
  function stopLab() { clearInterval(spotTimer); if (S.inst && S.inst.destroy) { try { S.inst.destroy(); } catch (e) {} } S.inst = null; if (canSpeak) speechSynthesis.cancel(); }
  async function openLab(id, keepLang) {
    stopLab();
    app.innerHTML = `<div class="wrap"><p class="muted" style="padding:24px 0">${esc(t(U.loading))}</p></div>`;
    try {
      const idx = await loadIndex();
      const meta = idx.labs.find((l) => l.id === id);
      if (!meta) return gallery();
      const chapter = await (await fetch(meta.file)).json();
      const lab = chapter.labs.find((l) => l.id === id);
      if (!NCA_T.get(lab.template)) await L.loadScript(`templates/${lab.template}.js`);
      const T = NCA_T.get(lab.template);
      if (!T) throw new Error('no template');
      if (!keepLang && lab.lang && lab.lang !== S.lang) { S.prevLang = S.lang; S.lang = lab.lang; }
      syncLang();
      Object.assign(S, { lab, chapter, meta, mode: 'guided', step: 0, guess: null, guessRight: null, checksRight: 0, checksTotal: 0, log: [], done: false, started: Date.now() });
      ci = 0; tries = 0;
      try { history.replaceState(null, '', '#' + id); } catch (e) {}
      const topic = (chapter.topics || []).find((x) => x.n === lab.topic);
      app.innerHTML = `<div class="wrap">
        <div class="labtop">
          <button type="button" class="back" id="back">← ${esc(t(U.back))}</button>
          <div><h1 id="labtitle">${esc(t(lab.title))}</h1><div class="sub2">${esc(t(U.cls))} ${chapter.class} · ${esc(subjName(chapter.subject_id))} · ${esc(chapter.title)}${topic ? ' · ' + esc(topic.title) : ''}</div></div>
          <div class="right"><div class="mode" role="group" aria-label="Mode"><button type="button" data-mode="guided" aria-pressed="true">${esc(t(U.guided))}</button><button type="button" data-mode="explore" aria-pressed="false">${esc(t(U.explore))}</button></div>
          <button type="button" class="tutorbtn" id="tutor"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/></svg>${esc(t(U.tutor))}</button></div>
        </div>
        <div class="player">
          <section class="stagewrap" id="stagewrap"><div class="cue" id="cue" hidden><span class="dot"></span><span id="cuetext"></span></div><div id="stage"></div><div class="spot" id="spot" hidden></div></section>
          <aside class="guide" id="guide" aria-live="polite"></aside>
        </div></div>`;
      S.inst = T.mount(document.getElementById('stage'), lab.config, api) || {};
      renderGuide();
      spotTimer = setInterval(placeSpot, 300);
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (e) {
      console.error(e);
      app.innerHTML = `<div class="wrap"><div class="labtop"><button type="button" class="back" id="back">← ${esc(t(U.back))}</button></div><p class="err">${esc(t(U.failed))}</p></div>`;
    }
  }
  const cur = () => S.lab && S.lab.steps[S.step];
  const api = {
    t, lang: () => S.lang,
    allowed(key) {
      if (S.mode === 'explore' || S.done) return true;
      const s = cur();
      if (!s || s.kind === 'explore') return true;
      return s.kind === 'do' && L.matches(s.target, key);
    },
    nudge() { const s = cur(); toast(s && s.kind !== 'do' ? U.answerFirst : U.follow); const sp = document.getElementById('spot'); if (sp) { sp.classList.remove('loud'); void sp.offsetWidth; sp.classList.add('loud'); } },
    emit(evt) {
      const s = cur();
      if (S.mode !== 'guided' || S.done || !s || s.kind !== 'do' || !L.matches(s.expect, evt)) return;
      celebrate();
      const at = S.step;
      setTimeout(() => { if (S.step === at) advance(); }, reduced() ? 0 : 750);
    },
    speak, record(line) { S.log.push(String(line)); if (S.log.length > 30) S.log.shift(); },
    toast, celebrate,
    asset(id) { return assets[id] ? 'assets/' + assets[id] : null; },
  };
  function advance() { if (S.step < S.lab.steps.length - 1) S.step++; renderGuide(); const s = cur(); if (s && s.kind !== 'check') speak(t(s.say)); }
  function toast(x) {
    const w = document.getElementById('stagewrap');
    if (!w) return;
    const old = w.querySelector('.toast'); if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = t(x);
    w.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }
  function celebrate() {
    if (reduced()) return;
    const w = document.getElementById('stagewrap');
    if (!w) return;
    const cols = ['#FFD23F', '#02CFF9', '#FF7A1A', '#8B3DFF', '#22C55E'];
    const r = w.getBoundingClientRect();
    for (let i = 0; i < 18; i++) {
      const s = document.createElement('span');
      s.className = 'spark'; s.style.background = cols[i % cols.length];
      s.style.left = r.width / 2 + 'px'; s.style.top = '40%';
      const a = (i / 18) * 2 * Math.PI;
      s.style.setProperty('--dx', Math.cos(a) * (80 + (i % 4) * 30) + 'px');
      s.style.setProperty('--dy', Math.sin(a) * (60 + (i % 3) * 30) + 'px');
      w.appendChild(s);
      setTimeout(() => s.remove(), 950);
    }
  }
  function placeSpot() {
    const w = document.getElementById('stagewrap'), sp = document.getElementById('spot'), cue = document.getElementById('cue');
    if (!w || !sp) return;
    document.querySelectorAll('[data-glow]').forEach((e) => e.removeAttribute('data-glow'));
    const s = cur();
    const on = S.mode === 'guided' && !S.done && s && s.kind === 'do';
    cue.hidden = !on;
    if (on) document.getElementById('cuetext').textContent = t(s.say);
    let el = null;
    if (on) {
      const tgt = s.target;
      el = tgt.endsWith('*') ? [...w.querySelectorAll('[data-key]')].find((x) => L.matches(tgt, x.dataset.key)) : w.querySelector(`[data-key="${CSS.escape(tgt)}"]`);
    }
    if (!el) { sp.hidden = true; return; }
    el.setAttribute('data-glow', '');
    const a = el.getBoundingClientRect(), b = w.getBoundingClientRect();
    if (!a.width && !a.height) { sp.hidden = true; return; }
    sp.hidden = false;
    const pad = 8;
    sp.style.left = a.left - b.left - pad + 'px'; sp.style.top = a.top - b.top - pad + 'px';
    sp.style.width = a.width + pad * 2 + 'px'; sp.style.height = a.height + pad * 2 + 'px';
  }
  function stepperHTML() { return `<div class="stepper" aria-hidden="true">${S.lab.steps.map((_, i) => `<i class="${i < S.step || S.done ? 'done' : i === S.step ? 'now' : ''}"></i>`).join('')}</div>`; }
  function renderGuide() {
    const g = document.getElementById('guide');
    if (!g) return;
    const lab = S.lab, s = cur();
    if (S.mode === 'explore') {
      const ex = lab.steps.find((x) => x.kind === 'explore');
      g.innerHTML = `<div class="kind"><span class="k explore">${esc(t(U.exploreHead))}</span></div><p class="say" lang="${S.lang}">${esc(t(U.exploreNote))}</p>${ex ? `<p class="muted">${esc(t(ex.say))}</p>` : ''}<div class="row"><button type="button" class="btn" data-mode="guided">${esc(t(U.backGuided))}</button></div>`;
      return;
    }
    if (S.done) {
      const mins = Math.max(1, Math.round((Date.now() - S.started) / 60000));
      g.innerHTML = `${stepperHTML()}<div class="complete">
        <svg class="medal" viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="38" fill="#FFD23F" stroke="#F5B90A" stroke-width="4"/><path d="M26 43l11 11 21-23" fill="none" stroke="#061233" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <h3>${esc(t(U.complete))}</h3>
        <div class="stats"><div><b>${S.guessRight === null ? '–' : S.guessRight ? '1/1' : '0/1'}</b>${esc(t(U.guesses))}</div><div><b>${S.checksRight}/${S.checksTotal}</b>${esc(t(U.checks))}</div><div><b>${mins}</b>${esc(t(U.minutes))}</div></div>
        <div class="row" style="justify-content:center"><button type="button" class="btn-go" id="tochapter">${esc(t(U.toChapter))}</button><button type="button" class="btn" data-again>${esc(t(U.again))}</button><button type="button" class="btn" id="another">${esc(t(U.another))}</button></div>
        <p class="knows" id="chapnote" hidden>${esc(t(U.chapterNote))}</p></div>`;
      return;
    }
    const head = `${stepperHTML()}<div class="kind"><span class="k ${esc(s.kind)}">${esc(t(U.kinds[s.kind]))}</span>${esc(fill(t(U.stepOf), { a: S.step + 1, b: lab.steps.length }))}</div>`;
    const sayP = `<p class="say" lang="${S.lang}">${esc(t(s.say || ''))}</p>`;
    const listen = canSpeak ? `<button type="button" class="ghost" data-say>${esc(t(U.listen))}</button>` : '';
    let body = '';
    if (s.kind === 'do') body = `${sayP}<div class="row"><button type="button" class="btn-go" data-show>${esc(t(U.showMe))}</button>${listen}</div>`;
    else if (s.kind === 'predict') body = `${sayP}<div class="opts" data-predict>${s.options.map((o) => `<button type="button" class="opt" data-o="${esc(o.id)}">${esc(t(o))}</button>`).join('')}</div>${listen ? `<div class="row">${listen}</div>` : ''}`;
    else if (s.kind === 'explain') {
      const pr = lab.steps.find((x) => x.kind === 'predict');
      const go = pr && S.guess ? pr.options.find((o) => o.id === S.guess) : null;
      const guessLine = go ? `<div class="guess"><b>${esc(t(U.youGuessed))}${esc(t(go))}</b> ${esc(t(S.guessRight ? U.guessRight : U.guessWrong))}</div>` : '';
      body = `${guessLine}${sayP}<div class="row"><button type="button" class="btn-go" data-next>${esc(t(U.gotIt))}</button>${listen}</div>`;
    } else if (s.kind === 'check') {
      const it = s.items[ci];
      body = `<p class="say" lang="${S.lang}">${esc(t(it.q))}</p><div class="opts" data-check>${it.options.map((o, i) => `<button type="button" class="opt" data-c="${i}">${esc(t(o))}</button>`).join('')}</div><div id="cfb"></div>`;
    } else if (s.kind === 'explore') body = `${sayP}<div class="row"><button type="button" class="btn-go" data-finish>${esc(t(U.finish))}</button>${listen}</div>`;
    g.innerHTML = head + body + `<p class="knows">${esc(t(U.knows))}</p>`;
    if (s.kind === 'check') wireCheck(g, s);
  }
  function wireCheck(g, s) {
    const it = s.items[ci];
    g.querySelector('[data-check]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]');
      if (!b || b.disabled) return;
      const k = +b.dataset.c;
      const fb = g.querySelector('#cfb');
      const nextBtn = `<div class="row" style="margin-top:8px"><button type="button" class="btn-go" data-cnext>${esc(t(U.next))} →</button></div>`;
      if (k === it.answer) {
        if (tries === 0) S.checksRight++;
        S.checksTotal++;
        b.classList.add('right');
        g.querySelectorAll('[data-c]').forEach((x) => (x.disabled = true));
        fb.innerHTML = `<div class="fb ok"><b>${esc(t(U.right))}</b>${esc(t(it.why))}</div>${nextBtn}`;
        celebrate(); speak(t(it.why));
      } else {
        tries++;
        b.classList.add('wrong'); b.disabled = true;
        const why = t(it.wrong && it.wrong[k]);
        if (tries === 1) fb.innerHTML = `<div class="fb no"><b>${esc(t(U.notQuite))}</b>${esc(why)}</div><p class="muted">${esc(t(U.tryAgain))}</p>`;
        else {
          S.checksTotal++;
          g.querySelectorAll('[data-c]').forEach((x) => (x.disabled = true));
          g.querySelector(`[data-c="${it.answer}"]`).classList.add('right');
          fb.innerHTML = `<div class="fb no"><b>${esc(t(U.notQuite))}</b>${esc(why)}</div><div class="fb ok" style="margin-top:8px"><b>${esc(t(U.answerIs))}${esc(t(it.options[it.answer]))}</b>${esc(t(it.why))}</div>${nextBtn}`;
        }
        speak(why);
        S.log.push(t({ en: 'Check answer was wrong: ', hi: 'जाँच का उत्तर ग़लत: ' }) + t(it.options[k]));
      }
    });
  }

  // ---- tutor drawer ----
  function tutor() {
    const s = cur();
    const pr = S.lab.steps.find((x) => x.kind === 'predict');
    const go = pr && S.guess ? pr.options.find((o) => o.id === S.guess) : null;
    const d = document.createElement('div');
    d.className = 'drawer';
    d.innerHTML = `<div class="pane" role="dialog" aria-modal="true" aria-labelledby="th">
      <h2 id="th">${esc(t(U.tHead))}</h2>
      <dl><dt>${esc(t(U.tLab))}</dt><dd>${esc(t(S.lab.title))}</dd>
        <dt>${esc(t(U.tChapter))}</dt><dd>${esc(t(U.cls))} ${S.chapter.class} · ${esc(S.chapter.title)}</dd>
        <dt>${esc(t(U.tStep))}</dt><dd>${S.mode === 'explore' ? esc(t(U.exploreHead)) : S.done ? esc(t(U.complete)) : `${S.step + 1}. ${esc(t(s.say || (s.items && s.items[0].q)))}`}</dd>
        <dt>${esc(t(U.tGuess))}</dt><dd>${go ? esc(t(go)) : esc(t(U.tNone))}</dd>
        <dt>${esc(t(U.tDid))}</dt><dd>${S.log.length ? `<ol>${S.log.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>` : esc(t(U.tNone))}</dd></dl>
      <label for="q"><b>${esc(t(U.tAsk))}</b></label><textarea id="q" lang="${S.lang}"></textarea>
      <div class="row"><button type="button" class="btn-go" id="tsend">${esc(t(U.tSend))}</button><button type="button" class="btn" id="tclose">${esc(t(U.tClose))}</button></div>
      <p class="muted" id="tmsg">${esc(t(U.tProto))}</p></div>`;
    document.body.appendChild(d);
    const close = () => { d.remove(); const b = document.getElementById('tutor'); if (b) b.focus(); };
    d.addEventListener('click', (e) => { if (e.target === d || e.target.id === 'tclose') close(); if (e.target.id === 'tsend') d.querySelector('#tmsg').textContent = t(U.notSent); });
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    d.querySelector('#q').focus();
  }

  // ---- events ----
  function syncLang() {
    document.documentElement.lang = S.lang;
    document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === S.lang)));
    try { localStorage.setItem('nca.labs.lang', S.lang); } catch (e) {}
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.lang) {
      S.lang = b.dataset.lang; S.prevLang = null; syncLang();
      if (S.lab && document.getElementById('guide')) {
        document.getElementById('labtitle').textContent = t(S.lab.title);
        document.querySelectorAll('.mode [data-mode]').forEach((x) => (x.textContent = t(x.dataset.mode === 'guided' ? U.guided : U.explore)));
        renderGuide();
      } else if (!S.lab) gallery();
    } else if (b.id === 'home' || b.id === 'back' || b.id === 'another') {
      S.lab = null; if (S.prevLang) { S.lang = S.prevLang; S.prevLang = null; syncLang(); }
      try { history.replaceState(null, '', location.pathname + location.search); } catch (err) {}
      gallery(); window.scrollTo({ top: 0 });
    } else if (b.dataset.open) openLab(b.dataset.open);
    else if (b.dataset.fs) { S.filter.subject = b.dataset.fs; S.shown = 48; gallery(); }
    else if (b.id === 'more') { S.shown += 48; gallery(); }
    else if (b.dataset.mode && S.lab) { S.mode = b.dataset.mode; document.querySelectorAll('.mode [data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.mode === S.mode))); renderGuide(); }
    else if (b.id === 'tutor') tutor();
    else if (b.hasAttribute('data-show')) { const sp = document.getElementById('spot'); document.getElementById('stagewrap').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); placeSpot(); if (sp) { sp.classList.remove('loud'); void sp.offsetWidth; sp.classList.add('loud'); } }
    else if (b.hasAttribute('data-say')) { const s = cur(); if (s) speak(t(s.say)); }
    else if (b.dataset.o !== undefined && b.closest('[data-predict]')) {
      const s = cur();
      S.guess = b.dataset.o; S.guessRight = S.guess === s.answer;
      b.closest('[data-predict]').querySelectorAll('.opt').forEach((x) => (x.disabled = true));
      b.classList.add('picked');
      S.log.push(t({ en: 'Guessed: ', hi: 'अनुमान: ' }) + b.textContent);
      b.closest('.guide').insertAdjacentHTML('beforeend', `<div class="fb ok"><b>${esc(t(U.saved))}</b></div>`);
      const at = S.step;
      setTimeout(() => { if (S.step === at) advance(); }, reduced() ? 0 : 900);
    }
    else if (b.hasAttribute('data-next')) advance();
    else if (b.hasAttribute('data-cnext')) { const s = cur(); tries = 0; if (ci < s.items.length - 1) { ci++; renderGuide(); } else { ci = 0; advance(); } }
    else if (b.hasAttribute('data-finish')) { S.done = true; renderGuide(); celebrate(); }
    else if (b.hasAttribute('data-again')) openLab(S.lab.id, true);
    else if (b.id === 'tochapter') { const n = document.getElementById('chapnote'); if (n) n.hidden = false; }
  });
  window.addEventListener('resize', () => placeSpot());

  syncLang();
  const h = location.hash.slice(1);
  if (h) openLab(h); else gallery();
})();
