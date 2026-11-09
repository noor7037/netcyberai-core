// NetCyberAI chapter reader. Teaches a chapter topic by topic (reader/CONTRACT.md): retrieve → hook → explain →
// figures → worked example and "your turn" → lab → guided practice → misconception → key points → exam tip → close,
// then a 5-question check drawn from 8 (4 of 5 opens the next topic, retry without shame), a 20-item chapter test in the
// CBSE mix, and a 7-day "remember it?" card. English or Hindi, read aloud, offline-friendly, progress on this device.
(() => {
  const app = document.getElementById('app');
  const ROOT = 'content/';
  const STORE = 'nca.reader.v1.';
  const S = { lang: 'en', idx: null, ch: null, view: 'home', ti: 0, mode: 'teach', listen: false, parentOpen: false, answers: {}, check: null, test: null, sheet: null };
  try { const v = localStorage.getItem(STORE + 'lang'); if (v === 'en' || v === 'hi') S.lang = v; } catch (e) {}
  const qp = new URLSearchParams(location.search); if (qp.get('lang') === 'hi' || qp.get('lang') === 'en') S.lang = qp.get('lang');

  // ---------- words ----------
  const U = {
    brand: { en: 'NetCyberAI Learn', hi: 'NetCyberAI Learn' },
    cls: { en: 'Class', hi: 'कक्षा' }, science: { en: 'Science', hi: 'विज्ञान' }, chapter: { en: 'Chapter', hi: 'चैप्टर' },
    topic: { en: 'Topic', hi: 'टॉपिक' }, of: { en: 'of', hi: 'में से' }, min: { en: 'min', hi: 'मिनट' },
    topics: { en: 'Topics', hi: 'टॉपिक' }, terms: { en: 'Key terms', hi: 'मुख्य शब्द' }, inTopic: { en: 'In this topic', hi: 'इस टॉपिक में' },
    start: { en: 'Start', hi: 'शुरू करो' }, cont: { en: 'Continue', hi: 'आगे बढ़ो' }, next: { en: 'Next topic', hi: 'अगला टॉपिक' }, prev: { en: 'Previous topic', hi: 'पिछला टॉपिक' },
    teach: { en: 'Teach me', hi: 'मुझे सिखाओ' }, read: { en: 'Read all', hi: 'पूरा पढ़ो' }, listen: { en: 'Listen', hi: 'सुनो' }, lang: { en: 'Language', hi: 'भाषा' },
    bigIdea: { en: 'What you will be able to do', hi: 'तुम क्या कर पाओगे' }, hookQ: { en: 'Think about it', hi: 'सोचो' },
    retrieve: { en: 'Remember from before', hi: 'पहले से याद करो' }, hook: { en: 'Look around you', hi: 'अपने आस-पास देखो' },
    explain: { en: 'The idea', hi: 'मुख्य बात' }, inSimple: { en: 'In simple words', hi: 'आसान शब्दों में' }, boardWords: { en: 'Board wording', hi: 'बोर्ड की भाषा में' },
    figure: { en: 'Look closely', hi: 'ध्यान से देखो' }, diagram: { en: 'See the whole idea', hi: 'पूरी बात एक नज़र में' }, notice: { en: 'What to notice', hi: 'क्या ध्यान देना है' }, frame: { en: 'Picture', hi: 'चित्र' },
    equation: { en: 'Equation', hi: 'समीकरण' }, table: { en: 'Compare', hi: 'तुलना करो' },
    activity: { en: 'Activity', hi: 'क्रियाकलाप' }, materials: { en: 'You need', hi: 'सामग्री' }, doThis: { en: 'Do this', hi: 'ऐसे करो' }, observe: { en: 'What you see', hi: 'तुम क्या देखते हो' }, why: { en: 'Why it happens', hi: 'ऐसा क्यों होता है' }, safety: { en: 'Safety', hi: 'सावधानी' },
    worked: { en: 'Worked example', hi: 'हल किया हुआ उदाहरण' }, solution: { en: 'Step by step', hi: 'स्टेप बाय स्टेप' }, answer: { en: 'Answer', hi: 'उत्तर' }, yourTurn: { en: 'Your turn', hi: 'अब तुम्हारी बारी' },
    lab: { en: 'Lab', hi: 'लैब' }, openLab: { en: 'Open the lab', hi: 'लैब खोलो' }, closeLab: { en: 'Close the lab', hi: 'लैब बंद करो' }, labDone: { en: 'Lab finished. Well observed.', hi: 'लैब पूरी हुई। बहुत अच्छा देखा।' }, labAfter: { en: 'What the lab showed', hi: 'लैब ने क्या दिखाया' }, labData: { en: 'The lab loads about 1 MB the first time.', hi: 'पहली बार लैब करीब 1 MB डेटा लेती है।' },
    guided: { en: 'Try it with a hint', hi: 'संकेत के साथ करो' }, showHint: { en: 'Show a hint', hi: 'संकेत दिखाओ' },
    misconception: { en: 'Common mix-up', hi: 'आम ग़लतफ़हमी' }, wrongIdea: { en: 'Many students think', hi: 'कई विद्यार्थी सोचते हैं' }, rightIdea: { en: 'Actually', hi: 'असल में' },
    keypoints: { en: 'Key points', hi: 'मुख्य बातें' }, examtip: { en: 'How the board asks this', hi: 'बोर्ड एग्ज़ाम में यह कैसे पूछा जाता है' }, marks: { en: 'Marks', hi: 'मार्क्स' },
    close: { en: 'Now you can answer', hi: 'अब तुम जवाब दे सकते हो' },
    right: { en: 'Right.', hi: 'सही।' }, notQuite: { en: 'Not quite.', hi: 'पूरी तरह सही नहीं।' }, yourPick: { en: 'Your choice', hi: 'तुम्हारा चुनाव' }, correctIs: { en: 'Correct answer', hi: 'सही उत्तर' },
    assertion: { en: 'Assertion (A)', hi: 'अभिकथन (A)' }, reason: { en: 'Reason (R)', hi: 'कारण (R)' },
    arOpts: [
      { en: 'Both A and R are true, and R explains A.', hi: 'A और R दोनों सही हैं, और R, A की सही व्याख्या करता है।' },
      { en: 'Both A and R are true, but R does not explain A.', hi: 'A और R दोनों सही हैं, पर R, A की सही व्याख्या नहीं करता।' },
      { en: 'A is true, but R is false.', hi: 'A सही है, पर R ग़लत है।' },
      { en: 'A is false, but R is true.', hi: 'A ग़लत है, पर R सही है।' },
    ],
    writeHere: { en: 'Write your answer here (optional), then compare.', hi: 'अपना जवाब यहाँ लिखो (चाहो तो), फिर मिलाओ।' }, showModel: { en: 'Show the model answer', hi: 'मॉडल आंसर दिखाओ' }, model: { en: 'Model answer', hi: 'मॉडल आंसर' }, tick: { en: 'Tick each point your answer has. One mark each.', hi: 'तुम्हारे उत्तर में जो पॉइंट हैं, उन पर टिक लगाओ। हर पॉइंट का एक मार्क।' },
    check: { en: 'Check your understanding', hi: 'अपनी समझ चेक करो' }, checkNote: { en: '5 questions. Get 4 right to open the next topic. You can try again as often as you like.', hi: '5 सवाल। अगला टॉपिक खोलने के लिए 4 सही करो। जितनी बार चाहो, फिर से कोशिश कर सकते हो।' },
    startCheck: { en: 'Start the check', hi: 'चेक शुरू करो' }, score: { en: 'You got {a} of {b}.', hi: 'तुमने {b} में से {a} सही किए।' },
    passed: { en: 'Topic complete. The next topic is open.', hi: 'टॉपिक पूरा हुआ। अगला टॉपिक खुल गया है।' }, again: { en: 'Not yet. Read the explanations above, then try a fresh set. Every try helps you learn.', hi: 'अभी नहीं। ऊपर के जवाब और समझाने वाली बातें पढ़ो, फिर नए सवालों के साथ फिर कोशिश करो। हर कोशिश से कुछ सीखते हो।' },
    tryFresh: { en: 'Try a fresh set', hi: 'नए सवालों से फिर करो' }, reviewTopic: { en: 'Go over the topic again', hi: 'टॉपिक फिर से देखो' },
    locked: { en: 'Finish the topic before to open this one.', hi: 'इसे खोलने के लिए पिछला टॉपिक पूरा करो।' }, done: { en: 'Done', hi: 'पूरा' }, open: { en: 'Open', hi: 'खुला' },
    test: { en: 'Chapter test', hi: 'चैप्टर टेस्ट' }, testNote: { en: '20 questions in the board pattern: case-based, assertion-reason, multiple choice, short and long answers. 70% passes. Mark your written answers honestly against the model.', hi: 'बोर्ड पैटर्न में 20 सवाल: केस-बेस्ड, अभिकथन-कारण, MCQ, छोटे और लंबे उत्तर। 70% पर पास। अपने लिखे उत्तरों को मॉडल आंसर से ईमानदारी से मिलाओ।' },
    testLocked: { en: 'Opens when every topic is complete.', hi: 'सारे टॉपिक पूरे होने पर खुलेगा।' }, startTest: { en: 'Start the chapter test', hi: 'चैप्टर टेस्ट शुरू करो' }, finishTest: { en: 'See my result', hi: 'मेरा रिज़ल्ट दिखाओ' },
    testPass: { en: 'Chapter complete. You understood this chapter.', hi: 'चैप्टर पूरा हुआ। तुमने यह चैप्टर समझ लिया।' }, testAgain: { en: 'Not yet. Look at the explanations, revisit the topics you missed, and try again.', hi: 'अभी नहीं। जवाब समझो, जो टॉपिक कमज़ोर रहे उन्हें दोबारा पढ़ो, और फिर कोशिश करो।' },
    answerAll: { en: 'Answer every question first ({n} left).', hi: 'पहले सारे सवालों के जवाब दो ({n} बाक़ी)।' },
    remember: { en: 'Remember it?', hi: 'याद है?' }, rememberNote: { en: 'You finished “{t}” a week ago. Three quick questions keep it in your memory.', hi: 'तुमने एक हफ़्ता पहले “{t}” पूरा किया था। 3 छोटे सवाल इसे याद रखने में मदद करेंगे।' }, rememberGo: { en: 'Quick review', hi: 'झटपट दोहराओ' }, later: { en: 'Later', hi: 'बाद में' },
    parent: { en: 'Parent or teacher: open every topic', hi: 'पेरेंट या टीचर: सारे टॉपिक खोलो' }, settings: { en: 'Settings', hi: 'सेटिंग्स' }, textSize: { en: 'Text size', hi: 'टेक्स्ट साइज़' },
    back: { en: 'Back', hi: 'वापस' }, home: { en: 'All chapters', hi: 'सारे चैप्टर' }, chOverview: { en: 'Chapter home', hi: 'चैप्टर होम' }, closeX: { en: 'Close', hi: 'बंद करो' },
    loading: { en: 'Loading…', hi: 'लोड हो रहा है…' }, failed: { en: 'This could not load. Check the connection and try again.', hi: 'यह लोड नहीं हो सका। इंटरनेट कनेक्शन चेक करके फिर कोशिश करो।' },
    soon: { en: 'Coming soon', hi: 'जल्द आ रहा है' }, topicsN: { en: '{n} topics', hi: '{n} टॉपिक' }, tapZoom: { en: 'Tap the picture to enlarge it.', hi: 'चित्र बड़ा देखने के लिए उस पर टैप करो।' },
  };
  const t = (x) => (x == null ? '' : typeof x === 'string' ? x : x[S.lang] || x.en || '');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k]);
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- equations ----------
  // Words written over an arrow. A content file can also give its own pair as -[english|हिंदी]->.
  const COND = { heat: 'ऊष्मा', sunlight: 'सूर्य का प्रकाश', light: 'प्रकाश', electricity: 'विद्युत', 'electric current': 'विद्युत धारा', catalyst: 'उत्प्रेरक', 'conc. H2SO4': 'सांद्र H2SO4', 'Ni catalyst': 'Ni उत्प्रेरक', 'sunlight, chlorophyll': 'सूर्य का प्रकाश, क्लोरोफिल', 'alkaline KMnO4': 'क्षारीय KMnO4', 'acidified K2Cr2O7': 'अम्लीकृत K2Cr2O7', 'acid': 'अम्ल', 'enzyme': 'एंज़ाइम', 'yeast': 'यीस्ट', 'chlorophyll': 'क्लोरोफिल', 'high temperature': 'तेज़ गर्मी', 'warm': 'गर्म करना', 'H+': 'H+', 'NaOH': 'NaOH', 'in the absence of oxygen': 'ऑक्सीजन की अनुपस्थिति में', 'in the presence of oxygen': 'ऑक्सीजन की उपस्थिति में', 'lack of oxygen': 'ऑक्सीजन की कमी', 'in yeast': 'यीस्ट में', 'in muscle cells': 'पेशी कोशिकाओं में', 'in mitochondria': 'माइटोकॉन्ड्रिया में', 'in cytoplasm': 'कोशिकाद्रव्य में', 'glucose': 'ग्लूकोज़' };
  const condText = (c) => { const [en, hi] = c.split('|'); return S.lang === 'hi' ? hi || COND[en] || en : en; };
  function species(s) {
    s = s.trim();
    let gas = false, ppt = false;
    if (/\^$/.test(s)) { gas = true; s = s.slice(0, -1).trim(); }
    else if (/(\)|\s)v$/.test(s)) { ppt = true; s = s.slice(0, -1).trim(); }
    if (/^[A-Za-z][a-z]{3,}( [a-z]+)*$/.test(s)) return `<span class="sp">${esc(t({ en: s, hi: s.toLowerCase() === 'heat' || s.toLowerCase() === 'energy' ? (s.toLowerCase() === 'heat' ? 'ऊष्मा' : 'ऊर्जा') : s }))}</span>`;
    const m = s.match(/^(\d+)(?=[A-Z(\[])/);
    const co = m ? `<span class="co">${m[1]}</span>` : '';
    let body = m ? s.slice(m[1].length) : s;
    const states = [];
    body = body.replace(/\((s|l|g|aq)\)/g, (_, x) => { states.push(x); return `\u0000${states.length - 1}\u0000`; });
    body = esc(body).replace(/([A-Za-z\)\]])(\d+)/g, '$1<sub>$2</sub>').replace(/\u0000(\d+)\u0000/g, (_, i) => `<span class="st">(${states[+i]})</span>`);
    return `<span class="sp">${co}${body}${gas ? ' <b aria-label="gas">↑</b>' : ''}${ppt ? ' <b aria-label="precipitate">↓</b>' : ''}</span>`;
  }
  function eq(src) {
    const parts = String(src).split(/\s*(-\[[^\]]+\]->|->|⇌)\s*/);
    let out = '';
    parts.forEach((p, i) => {
      if (i % 2 === 1) {
        const c = p.match(/^-\[([^\]]+)\]->$/);
        const cond = c ? condText(c[1]) : '';
        out += `<span class="ar">${cond ? `<small>${eqText(cond)}</small>` : ''}<i>${p === '⇌' ? '⇌' : '→'}</i></span>`;
      } else out += p.split(/\s+\+\s+/).map(species).join('<span class="pl">+</span>');
    });
    return `<span class="eq" role="math" aria-label="${esc(src)}">${out}</span>`;
  }
  const eqText = (s) => esc(s).replace(/([A-Za-z\)])(\d+)/g, '$1<sub>$2</sub>');
  // Rich text: escape, keep {{eq:...}} as formatted equations, and subscript chemical formulas like H2O or CO2.
  function rt(x) {
    const s = t(x);
    return s.split(/(\{\{eq:[^}]+\}\})/).map((seg) => {
      const m = seg.match(/^\{\{eq:([^}]+)\}\}$/);
      if (m) return eq(m[1]);
      return esc(seg).replace(/\b((?:[A-Z][a-z]?\d*|\((?:[A-Z][a-z]?\d*)+\)\d+){2,})\b/g, (f) => (/\d/.test(f) ? f.replace(/([A-Za-z\)])(\d+)/g, '$1<sub>$2</sub>') : f));
    }).join('');
  }
  const L = (x) => `lang="${S.lang}"`;

  // ---------- storage ----------
  const key = () => STORE + S.ch.chapter_key;
  function prog() {
    if (S._prog && S._prog.k === key()) return S._prog;
    let p = {};
    try { p = JSON.parse(localStorage.getItem(key()) || '{}'); } catch (e) {}
    p = Object.assign({ passed: {}, steps: {}, labs: {}, test: null, reviewed: {}, last: null }, p);
    S._prog = { k: key(), p };
    return S._prog;
  }
  const P = () => prog().p;
  function save() { try { localStorage.setItem(key(), JSON.stringify(P())); } catch (e) {} }
  function setLang(l) { S.lang = l; try { localStorage.setItem(STORE + 'lang', l); } catch (e) {} document.documentElement.lang = l; document.querySelectorAll('iframe.labframe').forEach((f) => { try { f.contentWindow.postMessage({ source: 'nca-reader', type: 'lang', lang: l }, '*'); } catch (e) {} }); }

  // ---------- speech ----------
  const canSpeak = 'speechSynthesis' in window;
  function speak(text) {
    if (!canSpeak || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = S.lang === 'hi' ? 'hi-IN' : 'en-IN';
      const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith(S.lang === 'hi' ? 'hi' : 'en-in')) || speechSynthesis.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith(S.lang));
      if (v) u.voice = v;
      u.rate = 0.95;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  const sayEl = (el) => { if (el) speak(el.innerText.replace(/\s+/g, ' ').slice(0, 1800)); };

  // ---------- images ----------
  const imgBase = () => `../labs/assets/c${String(S.ch.class).padStart(2, '0')}/${S.ch.subject_id}/`;
  const pic = (name, alt, eager) => `<picture><source media="(min-width: 900px)" srcset="${imgBase()}${esc(name)}.webp"><img src="${imgBase()}${esc(name)}.640.webp" alt="${esc(alt || '')}" ${eager ? '' : 'loading="lazy"'} decoding="async" data-zoom="${esc(name)}"></picture>`;

  // ---------- items ----------
  const letters = ['A', 'B', 'C', 'D'];
  function optsHTML(o, id, chosen) {
    return `<div class="opts" role="group">${o.options.map((op, i) => {
      const cls = chosen == null ? '' : i === o.answer ? 'right' : i === chosen ? 'wrong' : '';
      return `<button type="button" class="opt ${cls}" data-item="${esc(id)}" data-o="${i}" ${chosen != null ? 'disabled' : ''}><span class="k" aria-hidden="true">${letters[i]}</span><span ${L()}>${rt(op)}</span></button>`;
    }).join('')}</div>${chosen != null ? whyHTML(o, chosen) : ''}`;
  }
  function whyHTML(o, chosen) {
    const ok = chosen === o.answer;
    return `<div class="why" aria-live="polite"><p class="${ok ? 'ok' : 'no'}">${esc(t(ok ? U.right : U.notQuite))}</p>${ok ? '' : `<p><b>${esc(t(U.yourPick))} (${letters[chosen]}):</b> ${rt(o.why[chosen])}</p>`}<p><b>${esc(t(U.correctIs))} (${letters[o.answer]}):</b> ${rt(o.why[o.answer])}</p></div>`;
  }
  function itemHTML(it, ns) {
    const id = `${ns}:${it.id}`;
    const a = S.answers[id];
    if (it.type === 'mcq') return `<div class="item" data-box="${esc(id)}"><p class="qq" ${L()}>${rt(it.q)}</p>${optsHTML(it, id, a)}</div>`;
    if (it.type === 'ar') {
      const o = { options: U.arOpts, answer: it.answer, why: it.why };
      return `<div class="item" data-box="${esc(id)}"><div class="ar-box"><div><b>${esc(t(U.assertion))}:</b> ${rt(it.assertion)}</div><div><b>${esc(t(U.reason))}:</b> ${rt(it.reason)}</div></div>${optsHTML(o, id, a)}</div>`;
    }
    if (it.type === 'case') {
      return `<div class="item case" data-box="${esc(id)}">${it.image ? `<div class="hookimg">${pic(it.image, '')}</div>` : ''}<p ${L()}>${rt(it.stem)}</p>${it.parts.map((p, i) => `<div class="casepart"><p class="qq">${i + 1}. ${rt(p.q)}</p>${optsHTML(p, `${id}#${i}`, S.answers[`${id}#${i}`])}</div>`).join('')}</div>`;
    }
    // short / long: write, see the model answer, tick the rubric
    const st = a || {};
    return `<div class="item written" data-box="${esc(id)}"><p class="qq" ${L()}>${rt(it.q)} <span class="chip">${it.marks} ${esc(t(U.marks))}</span></p>
      <label class="sr" for="ta-${esc(id)}">${esc(t(U.writeHere))}</label><textarea id="ta-${esc(id)}" data-ta="${esc(id)}" placeholder="${esc(t(U.writeHere))}">${esc(st.text || '')}</textarea>
      ${st.shown ? `<div class="answer"><b>${esc(t(U.model))}:</b> <span ${L()}>${rt(it.model)}</span></div><div class="rubric"><p class="mini">${esc(t(U.tick))}</p>${it.rubric.map((r, i) => `<label><input type="checkbox" data-rub="${esc(id)}" data-i="${i}" ${st.ticks && st.ticks[i] ? 'checked' : ''}><span ${L()}>${rt(r)}</span></label>`).join('')}</div>` : `<div class="row"><button type="button" class="btn" data-model="${esc(id)}">${esc(t(U.showModel))}</button></div>`}</div>`;
  }
  function itemScore(it, ns) {
    const id = `${ns}:${it.id}`;
    if (it.type === 'mcq' || it.type === 'ar') return { got: S.answers[id] === it.answer ? 1 : 0, of: 1, done: S.answers[id] != null };
    if (it.type === 'case') { let got = 0, done = true; it.parts.forEach((p, i) => { const v = S.answers[`${id}#${i}`]; if (v == null) done = false; else if (v === p.answer) got++; }); return { got, of: it.parts.length, done }; }
    const a = S.answers[id] || {};
    return { got: (a.ticks || []).filter(Boolean).length, of: it.marks, done: !!a.shown };
  }
  const findItem = (id) => {
    const [ns, rest] = id.split(':');
    const iid = rest.split('#')[0];
    const all = [];
    S.ch.topics.forEach((tp) => { tp.steps.forEach((s) => { if (s.item) all.push(s.item); if (s.faded && s.faded.item) all.push(s.faded.item); }); (tp.check.items || []).forEach((x) => all.push(x)); });
    S.ch.test.items.forEach((x) => all.push(x));
    return all.find((x) => x.id === iid);
  };

  // ---------- steps ----------
  const tag = (u, extra) => `<span class="tag">${esc(t(u))}${extra ? ' · ' + esc(extra) : ''}</span>`;
  function stepHTML(s, si, tp) {
    const ns = `${tp.id}.s${si}`;
    const w = (cls, inner) => `<section class="step ${cls}" id="step-${si}" data-si="${si}" ${L()}>${inner}</section>`;
    switch (s.type) {
      case 'retrieve': return w('retrieve', `${tag(U.retrieve)}<p class="mini">${rt(s.from)}</p>${itemHTML(s.item, ns)}`);
      case 'hook': return w('hook', `${tag(U.hook)}${s.image ? `<div class="hookimg">${pic(s.image, '')}</div>` : ''}<p>${rt(s.scene)}</p><p class="q">${rt(s.question)}</p>`);
      case 'explain': return w('explain', `${tag(U.explain)}<h3>${rt(s.title)}</h3><p class="plain"><span class="sr">${esc(t(U.inSimple))}: </span>${rt(s.plain)}</p>${s.body.map((b) => `<p>${rt(b)}</p>`).join('')}${s.points ? `<ul class="pts">${s.points.map((p) => `<li>${rt(p)}</li>`).join('')}</ul>` : ''}${s.board ? `<div class="board"><b>${esc(t(U.boardWords))}:</b> ${rt(s.board)}</div>` : ''}`);
      case 'figure': {
        const fi = (S.frames && S.frames[ns]) || 0;
        const labels = (s.labels || []).map((l, i) => ({ ...l, n: i + 1 })).filter((l) => (l.img || 0) === fi);
        return w('figure', `${tag(U.figure)}<figure class="fig"><div class="frame" data-zoomwrap>${pic(s.images[fi], t(s.alt))}${labels.map((l) => `<span class="pin" style="left:${l.x}%;top:${l.y}%">${l.n}</span>`).join('')}</div>
          ${s.images.length > 1 ? `<div class="frames" role="group" aria-label="${esc(t(U.frame))}">${s.images.map((_, i) => `<button type="button" data-frame="${esc(ns)}" data-f="${i}" aria-pressed="${i === fi}" aria-label="${esc(t(U.frame))} ${i + 1}">${i + 1}</button>`).join('')}</div>` : ''}
          ${labels.length ? `<ol class="legend">${labels.map((l) => `<li><b>${l.n}</b><span>${rt(l.text)}</span></li>`).join('')}</ol>` : ''}
          <figcaption>${rt(s.caption)}</figcaption><p class="mini">${esc(t(U.tapZoom))}</p></figure>
          <div class="notice"><b>${esc(t(U.notice))}</b><ul class="pts">${s.notice.map((n) => `<li>${rt(n)}</li>`).join('')}</ul></div>`);
      }
      case 'diagram': return w('diagram', `${tag(U.diagram)}<h3>${rt(s.title)}</h3><div class="dgm" role="img" aria-label="${esc(t(s.alt))}">${svgFill(s)}</div><p class="dgmcap">${rt(s.caption)}</p>${s.notice && s.notice.length ? `<div class="notice"><b>${esc(t(U.notice))}</b><ul class="pts">${s.notice.map((n) => `<li>${rt(n)}</li>`).join('')}</ul></div>` : ''}`);
      case 'equation': return w('equation', `${tag(U.equation)}<div class="eqbox">${eq(s.eq)}</div><p>${rt(s.say)}</p>${s.note ? `<p class="mini">${rt(s.note)}</p>` : ''}`);
      case 'table': return w('table', `${tag(U.table)}<h3>${rt(s.caption)}</h3><div class="tblwrap"><table class="tbl stack"><thead><tr>${s.head.map((h) => `<th>${rt(h)}</th>`).join('')}</tr></thead><tbody>${s.rows.map((r) => `<tr>${r.map((c, j) => `<td data-h="${esc(t(s.head[j]))}">${rt(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      case 'activity': return w('activity', `${tag(U.activity, s.ncert.replace('Activity', S.lang === 'hi' ? 'क्रियाकलाप' : 'Activity'))}<h3>${rt(s.title)}</h3>${s.image ? `<div class="hookimg">${pic(s.image, '')}</div>` : ''}<div class="cols2"><div><b>${esc(t(U.materials))}</b><ul class="pts">${s.materials.map((m) => `<li>${rt(m)}</li>`).join('')}</ul></div><div><b>${esc(t(U.doThis))}</b><ol>${s.steps.map((m) => `<li>${rt(m)}</li>`).join('')}</ol></div></div><p><b>${esc(t(U.observe))}:</b> ${rt(s.observe)}</p><p><b>${esc(t(U.why))}:</b> ${rt(s.explain)}</p>${s.safety ? `<div class="safety"><b>${esc(t(U.safety))}:</b> ${rt(s.safety)}</div>` : ''}`);
      case 'worked': return w('worked we', `${tag(U.worked)}<p><b>${rt(s.problem)}</b></p><b>${esc(t(U.solution))}</b><ol>${s.steps.map((x) => `<li>${rt(x)}</li>`).join('')}</ol><div class="answer"><b>${esc(t(U.answer))}:</b> ${rt(s.answer)}</div>
        <div class="yourturn"><span class="tag">${esc(t(U.yourTurn))}</span><p><b>${rt(s.faded.problem)}</b></p><ol>${s.faded.shown.map((x) => `<li>${rt(x)}</li>`).join('')}<li>…</li></ol>${itemHTML(s.faded.item, ns)}</div>`);
      case 'lab': {
        const st = P().labs[s.lab];
        const open = S.openLab === s.lab;
        return w('lab', `${tag(U.lab)}<p>${rt(s.before)}</p>${open ? `<iframe class="labframe" title="${esc(t(U.lab))}" src="../labs/index.html?embed=1&lang=${S.lang}#${encodeURIComponent(s.lab)}" data-lab="${esc(s.lab)}"></iframe><div class="row"><button type="button" class="btn" data-closelab>${esc(t(U.closeLab))}</button></div>` : `<div class="row"><button type="button" class="btn-go" data-openlab="${esc(s.lab)}">${esc(t(U.openLab))}</button><span class="mini">${esc(t(U.labData))}</span></div>`}
          ${st ? `<p class="labdone">✓ ${esc(t(U.labDone))}</p>` : ''}${st || open ? `<div class="notice"><b>${esc(t(U.labAfter))}</b><p>${rt(s.after)}</p></div>` : ''}`);
      }
      case 'guided': {
        const ns2 = `${ns}`;
        const shown = S.hints && S.hints[ns2];
        return w('guided', `${tag(U.guided)}${shown ? `<div class="hintbox">💡 ${rt(s.hint)}</div>` : `<div class="row" style="margin:0 0 8px"><button type="button" class="btn" data-hint="${esc(ns2)}">💡 ${esc(t(U.showHint))}</button></div>`}${itemHTML(s.item, ns)}`);
      }
      case 'misconception': return w('misconception', `${tag(U.misconception)}<div class="mc-row"><div class="mc-wrong"><strong>${esc(t(U.wrongIdea))}</strong><p>${rt(s.wrong)}</p></div><div class="mc-right"><strong>${esc(t(U.rightIdea))}</strong><p>${rt(s.right)}</p></div></div><p style="margin-top:8px">${rt(s.why)}</p>`);
      case 'keypoints': return w('keypoints', `${tag(U.keypoints)}<ul class="pts">${s.points.map((p) => `<li>${rt(p)}</li>`).join('')}</ul>`);
      case 'examtip': return w('examtip', `${tag(U.examtip)}<p>${rt(s.tip)}</p>${s.marks ? `<p class="mini"><b>${esc(t(U.marks))}:</b> ${rt(s.marks)}</p>` : ''}`);
      case 'close': return w('close', `${tag(U.close)}<p>${rt(s.text)}</p>`);
    }
    return '';
  }
  // A diagram's SVG comes from our own content; still strip anything active, then fill every <text data-t="key"> with
  // the current language's words so labels and equations switch with the toggle.
  function svgFill(s) {
    let svg = String(s.svg || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '').replace(/(href|xlink:href)\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, '');
    return svg.replace(/<text([^>]*?)\sdata-t="([^"]+)"([^>]*?)(\/>|>\s*<\/text>)/g, (_, a, k, b) => `<text${a} data-t="${k}"${b}>${esc(t((s.texts || {})[k]))}</text>`);
  }
  const stepTitle = (s) => t(s.title || s.caption || U[s.type] || { en: s.type, hi: s.type });
  const needsAnswer = (s, si, tp) => {
    const ns = `${tp.id}.s${si}`;
    if (s.type === 'retrieve' || s.type === 'guided') return S.answers[`${ns}:${s.item.id}`] == null;
    if (s.type === 'worked') return S.answers[`${ns}:${s.faded.item.id}`] == null;
    return false;
  };

  // ---------- gates ----------
  const passed = (id) => !!P().passed[id];
  const unlocked = (i) => S.parentOpen || i === 0 || passed(S.ch.topics[i - 1].id);
  const allPassed = () => S.ch.topics.every((x) => passed(x.id));

  // ---------- views ----------
  async function loadIndex() { if (!S.idx) S.idx = await (await fetch(ROOT + 'index.json')).json(); return S.idx; }
  async function home() {
    S.view = 'home'; S.ch = null; S._prog = null;
    topbar({ title: t(U.brand), sub: `${t(U.cls)} 10 · ${t(U.science)}` });
    app.innerHTML = `<div class="home"><p class="mini">${esc(t(U.loading))}</p></div>`;
    try {
      const idx = await loadIndex();
      app.innerHTML = `<div class="home"><h1 style="margin:4px 0 14px">${esc(t(U.cls))} 10 · ${esc(t(U.science))}</h1><div class="chgrid">${idx.chapters.map((c) => `<button type="button" class="chcard" data-ch="${esc(c.file)}" ${c.file ? '' : 'disabled'}>${c.image ? `<img src="../labs/assets/c10/science/${esc(c.image)}.640.webp" alt="" loading="lazy">` : ''}<div class="in"><span class="chip">${esc(t(U.chapter))} ${c.number}</span><h3 ${L()}>${esc(t(c.title))}</h3><p class="mini">${c.file ? esc(fill(t(U.topicsN), { n: c.topics })) + ' · ' + c.minutes + ' ' + esc(t(U.min)) : esc(t(U.soon))}</p></div></button>`).join('')}</div></div>`;
    } catch (e) { app.innerHTML = `<div class="home"><p>${esc(t(U.failed))}</p></div>`; }
  }
  async function openChapter(file, ti) {
    app.innerHTML = `<div class="home"><p class="mini">${esc(t(U.loading))}</p></div>`;
    try {
      S.ch = await (await fetch(ROOT + file)).json();
      S.chFile = file; S._prog = null; S.answers = {}; S.check = null; S.test = null; S.openLab = null; S.hints = {}; S.frames = {};
      try { S.parentOpen = localStorage.getItem(STORE + 'parentOpen') === '1'; } catch (e) {}
      if (ti == null) overview(); else openTopic(ti);
    } catch (e) { console.error(e); app.innerHTML = `<div class="home"><p>${esc(t(U.failed))}</p></div>`; }
  }
  function hash(h) { try { history.replaceState(null, '', '#' + h); } catch (e) {} }

  function overview() {
    S.view = 'overview'; hash(S.chFile.replace(/\.json$/, ''));
    const ch = S.ch, p = P();
    topbar({ title: `${t(U.chapter)} ${ch.number}`, sub: t(ch.title), back: 'home' });
    const due = dueReview();
    const done = ch.topics.filter((x) => passed(x.id)).length;
    const body = `
      <section class="hero">${ch.hook.image ? pic(ch.hook.image, '', true) : ''}<div class="in"><span class="chip">${esc(t(U.cls))} ${ch.class} · ${esc(t(U.science))} · ${esc(t(U.chapter))} ${ch.number}</span><h1 ${L()}>${esc(t(ch.title))}</h1><p ${L()}>${rt(ch.hook.scene)}</p><p class="q" ${L()}>${esc(t(U.hookQ))}: ${rt(ch.hook.question)}</p></div></section>
      ${due ? `<section class="card remember"><h3>🧠 ${esc(t(U.remember))}</h3><p>${esc(fill(t(U.rememberNote), { t: t(due.short) }))}</p><div class="row"><button type="button" class="btn-go" data-review="${due.id}">${esc(t(U.rememberGo))}</button><button type="button" class="btn" data-later="${due.id}">${esc(t(U.later))}</button></div></section>` : ''}
      <section class="card"><div class="eyebrow">${esc(t(U.bigIdea))}</div><p style="font-weight:700" ${L()}>${rt(ch.big_idea)}</p><ul class="pts">${ch.outcomes.map((o) => `<li ${L()}>${rt(o)}</li>`).join('')}</ul></section>
      <section class="card"><div class="eyebrow">${esc(t(U.topics))} · ${done}/${ch.topics.length}</div><div class="progressline"><i style="width:${Math.round((done / ch.topics.length) * 100)}%"></i></div>${topicList()}</section>
      <section class="card"><h3>📝 ${esc(t(U.test))}</h3><p class="mini">${esc(t(U.testNote))}</p>${p.test ? `<p><b>${esc(fill(t(U.score), { a: p.test.got, b: p.test.of }))}</b> (${Math.round((p.test.got / p.test.of) * 100)}%)</p>` : ''}<div class="row"><button type="button" class="btn-go" data-test ${allPassed() || S.parentOpen ? '' : 'disabled'}>${esc(t(U.startTest))}</button>${allPassed() || S.parentOpen ? '' : `<span class="mini">${esc(t(U.testLocked))}</span>`}</div></section>
      <section class="card"><label class="parent"><input type="checkbox" data-parent ${S.parentOpen ? 'checked' : ''}><span>${esc(t(U.parent))}</span></label></section>`;
    layout(body, null);
  }
  function topicList() {
    return `<ul class="tlist">${S.ch.topics.map((x, i) => {
      const st = passed(x.id) ? 'done' : unlocked(i) ? (i === S.ti && S.view === 'topic' ? 'now' : '') : '';
      return `<li class="${st}"><button type="button" data-topic="${i}" ${unlocked(i) ? '' : 'disabled'} aria-label="${esc(t(U.topic))} ${i + 1}: ${esc(t(x.title))}${passed(x.id) ? ' (' + esc(t(U.done)) + ')' : ''}"><span class="n">${passed(x.id) ? '✓' : i + 1}</span><span class="tt" ${L()}>${esc(t(x.title))}<small>${x.minutes} ${esc(t(U.min))}${unlocked(i) ? '' : ' · 🔒'}</small></span></button></li>`;
    }).join('')}</ul>`;
  }
  function termsHTML(tp) {
    const list = tp ? tp.terms : S.ch.topics.flatMap((x) => x.terms);
    return `<ul class="terms">${list.map((x) => `<li><b>${esc(x.en)}</b><span class="hi" lang="hi">${esc(x.hi)}</span><div class="mini" ${L()}>${rt(x.gloss)}</div></li>`).join('')}</ul>`;
  }
  function inTopicHTML(tp) {
    const n = S.mode === 'read' ? tp.steps.length : Math.min(tp.steps.length, (P().steps[tp.id] || 0) + 1);
    return `<ul class="intopic">${tp.steps.map((s, i) => (i < n ? `<li class="${i < n - 1 ? 'seen' : ''}"><button type="button" data-jump="${i}">${esc(stepTitle(s))}</button></li>` : '')).join('')}<li><button type="button" data-jump="check">✅ ${esc(t(U.check))}</button></li></ul>`;
  }
  function layout(body, tp) {
    app.innerHTML = `<div class="shell chapter">
      <aside class="side-l side" aria-label="${esc(t(U.topics))}"><h4>${esc(t(U.topics))}</h4><button type="button" class="btn" data-overview style="width:100%;margin-bottom:10px">${esc(t(U.chOverview))}</button>${topicList()}</aside>
      <main class="main" id="main"><div class="content">${body}</div></main>
      <aside class="side-r side" aria-label="${esc(t(U.terms))}">${tp ? `<h4>${esc(t(U.inTopic))}</h4>${inTopicHTML(tp)}<div style="height:16px"></div>` : ''}<h4>${esc(t(U.terms))}</h4>${termsHTML(tp)}</aside>
    </div>
    ${tp ? bottomBar() : ''}`;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function bottomBar() {
    const n = S.ch.topics.length, i = S.ti;
    return `<nav class="bottombar" aria-label="${esc(t(U.topics))}">
      <button type="button" class="ib" data-prevtopic ${i === 0 ? 'disabled' : ''} aria-label="${esc(t(U.prev))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 5l-7 7 7 7"/></svg></button>
      <button type="button" class="mid" data-sheet="topics"><b ${L()}>${i + 1}/${n} · ${esc(t(S.ch.topics[i].short))}</b><span class="dots" aria-hidden="true">${S.ch.topics.map((x, k) => `<i class="${k === i ? 'now' : passed(x.id) ? 'done' : ''}"></i>`).join('')}</span></button>
      <button type="button" class="ib" data-nexttopic ${i < n - 1 && unlocked(i + 1) ? '' : 'disabled'} aria-label="${esc(t(U.next))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 5l7 7-7 7"/></svg></button></nav>`;
  }

  function openTopic(i) {
    if (!unlocked(i)) return toast(U.locked);
    S.view = 'topic'; S.ti = i; S.check = null; S.openLab = null;
    const tp = S.ch.topics[i];
    P().last = i; save();
    hash(`${S.chFile.replace(/\.json$/, '')}~${tp.id}`);
    topbar({ title: `${t(U.topic)} ${i + 1} ${t(U.of)} ${S.ch.topics.length}`, sub: t(tp.title), back: 'overview', topic: true });
    renderTopic(true);
  }
  function renderTopic(top) {
    const tp = S.ch.topics[S.ti];
    const seen = P().steps[tp.id] || 0;
    const n = S.mode === 'read' ? tp.steps.length : Math.min(tp.steps.length, seen + 1);
    const lastStep = tp.steps[n - 1];
    const allShown = n >= tp.steps.length;
    const body = `<header class="card"><div class="eyebrow">${esc(t(U.topic))} ${S.ti + 1} · ${tp.minutes} ${esc(t(U.min))}</div><h1 style="font-size:1.45rem" ${L()}>${esc(t(tp.title))}</h1><ul class="pts">${tp.outcomes.map((o) => `<li ${L()}>${rt(o)}</li>`).join('')}</ul>
        <div class="row"><div class="lang" role="group" aria-label="mode" style="border-color:var(--line)"><button type="button" data-mode="teach" aria-pressed="${S.mode === 'teach'}" style="color:var(--ink)">${esc(t(U.teach))}</button><button type="button" data-mode="read" aria-pressed="${S.mode === 'read'}" style="color:var(--ink)">${esc(t(U.read))}</button></div></div></header>
      ${tp.steps.slice(0, n).map((s, si) => stepHTML(s, si, tp)).join('')}
      ${allShown ? checkHTML(tp) : `<div class="continue"><button type="button" class="btn-go" data-continue ${needsAnswer(lastStep, n - 1, tp) ? 'disabled' : ''}>${esc(t(U.cont))} →</button></div>`}`;
    const y = window.scrollY;
    layout(body, tp);
    if (!top) window.scrollTo({ top: y, behavior: 'auto' });
  }
  function revealNext() {
    const tp = S.ch.topics[S.ti];
    const p = P();
    p.steps[tp.id] = Math.min(tp.steps.length, (p.steps[tp.id] || 0) + 1); save();
    renderTopic(false);
    const el = document.getElementById(`step-${p.steps[tp.id]}`) || document.getElementById('check');
    if (el) { el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); if (S.listen) sayEl(el); }
  }

  // topic check: draw 5 of 8, prefer unseen items on a retry
  function draw(tp) {
    const pool = tp.check.items.slice();
    const seenIds = (S.seenCheck && S.seenCheck[tp.id]) || [];
    pool.sort((a, b) => (seenIds.includes(a.id) - seenIds.includes(b.id)) || (Math.random() - 0.5));
    const pick = pool.slice(0, tp.check.draw);
    S.seenCheck = S.seenCheck || {}; S.seenCheck[tp.id] = [...new Set(seenIds.concat(pick.map((x) => x.id)))].slice(-6);
    return pick;
  }
  function checkHTML(tp) {
    if (!S.check || S.check.tp !== tp.id) return `<section class="card" id="check"><h3>✅ ${esc(t(U.check))}</h3><p class="mini">${esc(t(U.checkNote))}</p>${passed(tp.id) ? `<p class="labdone">✓ ${esc(t(U.passed))}</p>` : ''}<div class="row"><button type="button" class="btn-go" data-startcheck>${esc(t(U.startCheck))}</button>${passed(tp.id) && S.ti < S.ch.topics.length - 1 ? `<button type="button" class="btn" data-nexttopic>${esc(t(U.next))} →</button>` : ''}</div></section>`;
    const c = S.check;
    const scores = c.items.map((it) => itemScore(it, c.ns));
    const finished = scores.every((s) => s.done);
    const got = scores.reduce((a, s) => a + s.got, 0);
    let res = '';
    if (finished) {
      const ok = got >= tp.check.pass;
      if (ok && !passed(tp.id)) { P().passed[tp.id] = Date.now(); save(); }
      res = `<div class="card result" aria-live="polite"><div class="big">${got}/${c.items.length}</div><p><b>${esc(fill(t(U.score), { a: got, b: c.items.length }))}</b></p><p>${esc(t(ok ? U.passed : U.again))}</p><div class="row" style="justify-content:center">${ok ? (S.ti < S.ch.topics.length - 1 ? `<button type="button" class="btn-go" data-nexttopic>${esc(t(U.next))} →</button>` : `<button type="button" class="btn-go" data-overview>${esc(t(U.chOverview))}</button>`) : `<button type="button" class="btn-go" data-startcheck>${esc(t(U.tryFresh))}</button><button type="button" class="btn" data-jump="0">${esc(t(U.reviewTopic))}</button>`}</div></div>`;
    }
    return `<section class="card" id="check"><h3>✅ ${esc(t(U.check))}</h3>${c.items.map((it, i) => `<div style="margin-top:12px"><span class="chip">${i + 1}/${c.items.length}</span>${itemHTML(it, c.ns)}</div>`).join('')}</section>${res}`;
  }

  // chapter test and the 7-day review
  function openTest() {
    S.view = 'test'; S.test = { ns: 'test' + Date.now() };
    hash(`${S.chFile.replace(/\.json$/, '')}~test`);
    topbar({ title: t(U.test), sub: t(S.ch.title), back: 'overview' });
    renderTest(true);
  }
  function renderTest(top, showResult) {
    const items = S.ch.test.items, ns = S.test.ns;
    const scores = items.map((it) => itemScore(it, ns));
    const left = scores.filter((s) => !s.done).length;
    const got = scores.reduce((a, s) => a + s.got, 0), of = scores.reduce((a, s) => a + s.of, 0);
    let res = '';
    if (showResult && !left) {
      const ok = got / of >= S.ch.test.pass;
      const p = P(); if (!p.test || got / of > p.test.got / p.test.of) { p.test = { got, of, at: Date.now() }; save(); }
      res = `<div class="card result" id="result" aria-live="polite"><div class="big">${Math.round((got / of) * 100)}%</div><p><b>${esc(fill(t(U.score), { a: got, b: of }))}</b></p><p>${esc(t(ok ? U.testPass : U.testAgain))}</p><div class="row" style="justify-content:center"><button type="button" class="btn-go" data-overview>${esc(t(U.chOverview))}</button></div></div>`;
    }
    const body = `<header class="card"><h1 style="font-size:1.45rem">📝 ${esc(t(U.test))}</h1><p class="mini">${esc(t(U.testNote))}</p></header>
      ${items.map((it, i) => `<section class="card"><span class="chip">${i + 1}/${items.length} · ${esc(it.type === 'ar' ? 'A–R' : it.type)}</span>${itemHTML(it, ns)}</section>`).join('')}
      ${res || `<div class="continue"><button type="button" class="btn-go" data-finishtest>${esc(t(U.finishTest))}</button></div>${left && showResult ? `<p class="mini" style="text-align:center">${esc(fill(t(U.answerAll), { n: left }))}</p>` : ''}`}`;
    const y = window.scrollY;
    layout(body, null);
    if (!top) window.scrollTo({ top: y, behavior: 'auto' });
    if (res) document.getElementById('result').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' });
  }
  function dueReview() {
    const p = P(), week = 7 * 864e5;
    return S.ch.topics.find((x) => p.passed[x.id] && Date.now() - p.passed[x.id] >= week && !(p.reviewed[x.id] && Date.now() - p.reviewed[x.id] < week));
  }
  function openReview(id) {
    const tp = S.ch.topics.find((x) => x.id === id);
    S.view = 'review';
    const items = tp.check.items.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    S.review = { tp: id, items, ns: 'rev' + Date.now() };
    topbar({ title: t(U.remember), sub: t(tp.title), back: 'overview' });
    renderReview(true);
  }
  function renderReview(top) {
    const r = S.review, tp = S.ch.topics.find((x) => x.id === r.tp);
    const done = r.items.every((it) => itemScore(it, r.ns).done);
    if (done) { P().reviewed[r.tp] = Date.now(); save(); }
    const body = `<header class="card remember"><h1 style="font-size:1.4rem">🧠 ${esc(t(U.remember))}</h1><p ${L()}>${esc(t(tp.title))}</p></header>${r.items.map((it) => `<section class="card">${itemHTML(it, r.ns)}</section>`).join('')}${done ? `<div class="continue"><button type="button" class="btn-go" data-overview>${esc(t(U.chOverview))}</button></div>` : ''}`;
    const y = window.scrollY; layout(body, null); if (!top) window.scrollTo({ top: y });
  }
  function rerender() {
    if (S.view === 'topic') renderTopic(false);
    else if (S.view === 'test') renderTest(false);
    else if (S.view === 'review') renderReview(false);
    else if (S.view === 'overview') overview();
    else home();
  }

  // ---------- chrome ----------
  function topbar(o) {
    S.bar = o;
    const top = document.getElementById('top');
    top.innerHTML = `<div class="in">
      ${o.back ? `<button type="button" class="ib" data-back="${o.back}" aria-label="${esc(t(U.back))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 5l-7 7 7 7"/></svg></button>` : `<span class="ib" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M6 7h9a3 3 0 0 1 3 3v15a2 2 0 0 0-2-2H6zM26 7h-6a3 3 0 0 0-3 3v15a2 2 0 0 1 2-2h7z" fill="none" stroke="#E8702A" stroke-width="2.2" stroke-linejoin="round"/></svg></span>`}
      <div class="title"><b ${L()}>${esc(o.title)}</b><span ${L()}>${esc(o.sub || '')}</span></div>
      ${o.topic ? `<button type="button" class="ib only-narrow" data-sheet="intopic" aria-label="${esc(t(U.inTopic))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg></button><button type="button" class="ib only-narrow" data-sheet="terms" aria-label="${esc(t(U.terms))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M8 7h7M8 11h7"/></svg></button>` : ''}
      ${canSpeak && o.topic ? `<button type="button" class="ib" data-listen aria-pressed="${S.listen}" aria-label="${esc(t(U.listen))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg></button>` : ''}
      <div class="lang" role="group" aria-label="${esc(t(U.lang))}"><button type="button" data-lang="en" aria-pressed="${S.lang === 'en'}">EN</button><button type="button" data-lang="hi" aria-pressed="${S.lang === 'hi'}" lang="hi">हिं</button></div>
    </div>`;
  }
  function openSheet(kind) {
    closeSheet();
    const tp = S.view === 'topic' ? S.ch.topics[S.ti] : null;
    const head = kind === 'topics' ? U.topics : kind === 'terms' ? U.terms : U.inTopic;
    const inner = kind === 'topics' ? `<button type="button" class="btn" data-overview style="width:100%;margin-bottom:10px">${esc(t(U.chOverview))}</button>${topicList()}` : kind === 'terms' ? termsHTML(tp) : inTopicHTML(tp);
    document.body.insertAdjacentHTML('beforeend', `<div class="sheet-back" data-closesheet></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(t(head))}" ${L()}><div class="grab"></div><header><h3>${esc(t(head))}</h3><button type="button" class="ib" data-closesheet aria-label="${esc(t(U.closeX))}" style="color:var(--ink)">✕</button></header>${inner}</div>`);
    const f = document.querySelector('.sheet button'); if (f) f.focus();
  }
  function closeSheet() { document.querySelectorAll('.sheet, .sheet-back').forEach((x) => x.remove()); }
  function toast(x) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = t(x); document.body.appendChild(el); setTimeout(() => el.remove(), 2400); }
  function zoom(name) {
    document.body.insertAdjacentHTML('beforeend', `<div class="lightbox" role="dialog" aria-modal="true" data-closezoom><img src="${imgBase()}${esc(name)}.webp" alt=""><button type="button" class="ib" data-closezoom aria-label="${esc(t(U.closeX))}">✕</button></div>`);
  }

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('button, [data-closesheet], [data-closezoom], img[data-zoom], input[data-parent], input[data-rub]');
    if (!el) return;
    const d = el.dataset;
    if (el.matches('input[data-parent]')) { S.parentOpen = el.checked; try { localStorage.setItem(STORE + 'parentOpen', el.checked ? '1' : '0'); } catch (x) {} return overview(); }
    if (el.matches('input[data-rub]')) { const a = S.answers[d.rub] || (S.answers[d.rub] = { shown: true, ticks: [] }); a.ticks[+d.i] = el.checked; return; }
    if (d.closezoom !== undefined) { document.querySelectorAll('.lightbox').forEach((x) => x.remove()); return; }
    if (el.matches('img[data-zoom]')) return zoom(d.zoom);
    if (d.closesheet !== undefined) return closeSheet();
    if (d.lang) { setLang(d.lang); closeSheet(); topbar(Object.assign({}, S.bar, S.view === 'topic' ? { title: `${t(U.topic)} ${S.ti + 1} ${t(U.of)} ${S.ch.topics.length}`, sub: t(S.ch.topics[S.ti].title) } : S.view === 'overview' ? { title: `${t(U.chapter)} ${S.ch.number}`, sub: t(S.ch.title) } : S.view === 'home' ? { title: t(U.brand), sub: `${t(U.cls)} 10 · ${t(U.science)}` } : {})); return rerender(); }
    if (d.ch) return openChapter(d.ch);
    if (d.back) { closeSheet(); if (canSpeak) speechSynthesis.cancel(); return d.back === 'home' ? (hash(''), home()) : overview(); }
    if (d.overview !== undefined) { closeSheet(); return overview(); }
    if (d.topic !== undefined) { closeSheet(); return openTopic(+d.topic); }
    if (d.sheet) return openSheet(d.sheet);
    if (d.nexttopic !== undefined) return openTopic(S.ti + 1);
    if (d.prevtopic !== undefined) return openTopic(S.ti - 1);
    if (d.mode) { S.mode = d.mode; return renderTopic(false); }
    if (d.continue !== undefined) return revealNext();
    if (d.listen !== undefined) { S.listen = !S.listen; el.setAttribute('aria-pressed', String(S.listen)); if (S.listen) { const steps = document.querySelectorAll('.step'); sayEl(steps[steps.length - 1]); } else if (canSpeak) speechSynthesis.cancel(); return; }
    if (d.jump !== undefined) { closeSheet(); const tgt = d.jump === 'check' ? document.getElementById('check') : document.getElementById(`step-${d.jump}`); if (tgt) tgt.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); else if (d.jump === 'check') { S.mode = 'read'; renderTopic(false); const c = document.getElementById('check'); if (c) c.scrollIntoView(); } return; }
    if (d.frame) { S.frames[d.frame] = +d.f; return renderTopic(false); }
    if (d.hint) { S.hints[d.hint] = true; return renderTopic(false); }
    if (d.openlab) { S.openLab = d.openlab; renderTopic(false); const f = document.querySelector('iframe.labframe'); if (f) f.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }); return; }
    if (d.closelab !== undefined) { S.openLab = null; return renderTopic(false); }
    if (d.item !== undefined && d.o !== undefined) {
      if (S.answers[d.item] != null) return;
      S.answers[d.item] = +d.o;
      const box = el.closest('[data-box]');
      const it = findItem(d.item);
      if (it) {
        const part = d.item.includes('#') ? it.parts[+d.item.split('#')[1]] : it.type === 'ar' ? { options: U.arOpts, answer: it.answer, why: it.why } : it;
        const wrap = el.closest('.opts');
        wrap.outerHTML = optsHTML(part, d.item, +d.o);
        if (S.listen) { const w = box && box.querySelector('.why'); sayEl(w); }
      }
      afterAnswer(); return;
    }
    if (d.model) { const a = S.answers[d.model] || (S.answers[d.model] = { ticks: [] }); a.shown = true; const ta = document.querySelector(`[data-ta="${CSS.escape(d.model)}"]`); if (ta) a.text = ta.value; afterAnswer(true); return; }
    if (d.startcheck !== undefined) { const tp = S.ch.topics[S.ti]; S.check = { tp: tp.id, items: draw(tp), ns: 'chk' + Date.now() }; renderTopic(false); const c = document.getElementById('check'); if (c) c.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); return; }
    if (d.test !== undefined) return openTest();
    if (d.finishtest !== undefined) { document.querySelectorAll('[data-ta]').forEach((ta) => { const a = S.answers[ta.dataset.ta]; if (a) a.text = ta.value; }); return renderTest(false, true); }
    if (d.review) return openReview(d.review);
    if (d.later) { P().reviewed[d.later] = Date.now() - 6 * 864e5; save(); return overview(); }
  });
  document.addEventListener('input', (e) => { const ta = e.target.closest('[data-ta]'); if (ta) { const a = S.answers[ta.dataset.ta] || (S.answers[ta.dataset.ta] = { ticks: [] }); a.text = ta.value; } });
  function afterAnswer(rerenderAll) {
    if (S.view === 'topic') {
      const c = document.querySelector('[data-continue]'); if (c) c.disabled = false;
      if (S.check || rerenderAll) renderTopic(false);
    } else if (S.view === 'test' && rerenderAll) renderTest(false);
    else if (S.view === 'review') renderReview(false);
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSheet(); document.querySelectorAll('.lightbox').forEach((x) => x.remove()); } });
  window.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.source !== 'nca-labs') return;
    const f = [...document.querySelectorAll('iframe.labframe')].find((x) => x.contentWindow === e.source);
    if (m.type === 'height' && f) f.style.height = Math.min(Math.max(560, m.height + 8), 1800) + 'px';
    if (m.type === 'done' && S.ch) { P().labs[m.id] = Date.now(); save(); const st = f && f.closest('.step'); if (st && !st.querySelector('.labdone')) st.insertAdjacentHTML('beforeend', `<p class="labdone">✓ ${esc(t(U.labDone))}</p>`); }
  });

  // ---------- start ----------
  document.documentElement.lang = S.lang;
  const h = decodeURIComponent(location.hash.slice(1));
  if (h) {
    const [file, sub] = h.split('~');
    loadIndex().then(() => openChapter(file + '.json', null)).then(() => {
      if (!S.ch) return;
      if (sub === 'test') openTest();
      else if (sub) { const i = S.ch.topics.findIndex((x) => x.id === sub); if (i >= 0 && unlocked(i)) openTopic(i); }
    }).catch(() => home());
  } else home();
})();
