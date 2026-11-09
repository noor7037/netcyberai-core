// Template: Democracy lab. Hold an election (first past the post or proportional), pass a law (ordinary, money bill,
// constitutional amendment) or a Union Budget through Parliament, sort the work of the three organs, the three levels
// of government, the Union / State / Concurrent lists, fundamental rights and the court system, and see how the
// three-tier panchayat is built. Procedures follow the Constitution of India as school books describe them; all
// candidates, parties and budget figures are fictional. Config:
//   { mode: 'election'|'law-making'|'organs'|'levels'|'rights'|'federalism'|'courts'|'panchayat'|'budget-session',
//     options?: { question?: 0.. (which check question first),
//       election:  candidates?: ids (2-5), shares?: {id: percent, sum 100}, voters?, turnout?, nota?, notaPercent?, system?: 'fptp'|'pr', seats?
//       law-making: bill?: 'ordinary'|'money'|'amendment', supportLs?: 0-100, supportRs?: 0-100
//       organs, levels, rights, federalism, courts: cards?: [card ids] (a subset to sort)
//       panchayat: wards?: 6-30
//       budget-session: support?: 0-100 (Lok Sabha), spend?: {education, health, farming, roads, defence} } }
(function () {
  const L = window.NCA_LIB;
  const { esc, tween, ease } = L;
  const T2 = (en, hi) => ({ en, hi });
  const MODES = ['election', 'law-making', 'organs', 'levels', 'rights', 'federalism', 'courts', 'panchayat', 'budget-session'];
  const SORT_MODES = ['organs', 'levels', 'rights', 'federalism', 'courts'];
  const LS = 543, RS = 245;

  // ================================================================ election data (fictional people and parties)
  const CANDS = {
    asha: { n: T2('Asha Verma', 'आशा वर्मा'), p: T2('Nai Disha Party', 'नई दिशा पार्टी'), sym: 'star', c: '#FF7A1A' },
    imran: { n: T2('Imran Qureshi', 'इमरान क़ुरैशी'), p: T2('Jan Vikas Dal', 'जन विकास दल'), sym: 'bell', c: '#2563EB' },
    gurpreet: { n: T2('Gurpreet Kaur', 'गुरप्रीत कौर'), p: T2('Gram Seva Manch', 'ग्राम सेवा मंच'), sym: 'leaf', c: '#16A34A' },
    ravi: { n: T2('Ravi Naidu', 'रवि नायडू'), p: T2('Ekta Morcha', 'एकता मोर्चा'), sym: 'kite', c: '#8B3DFF' },
    meena: { n: T2('Meena Das', 'मीना दास'), p: T2('Independent', 'निर्दलीय'), sym: 'umbrella', c: '#0F766E' },
  };
  const NOTA = { n: T2('None of the Above (NOTA)', 'इनमें से कोई नहीं (नोटा)'), p: T2('No candidate chosen', 'कोई उम्मीदवार नहीं'), sym: 'nota', c: '#64748B' };
  const DEF_CANDS = ['asha', 'imran', 'gurpreet', 'ravi'];
  const DEF_SHARES = { 2: [55, 45], 3: [42, 35, 23], 4: [36, 31, 20, 13], 5: [30, 27, 20, 14, 9] };
  function symSvg(s, col) {
    const f = `fill="${col}"`;
    const body = {
      star: `<polygon ${f} points="14,2.5 17.2,10.6 26,11 19.2,16.6 21.5,25 14,20.3 6.5,25 8.8,16.6 2,11 10.8,10.6"/>`,
      bell: `<path ${f} d="M14 3.5c-5 0-7.2 4-7.2 9v5L4.5 20.5h19l-2.3-3v-5c0-5-2.2-9-7.2-9z"/><circle ${f} cx="14" cy="24" r="2.6"/>`,
      leaf: `<path ${f} d="M4 23C4 11 11 4.5 24.5 4.5 24.5 17 18 24 4 23z"/><path d="M5 23 18 10" stroke="#fff" stroke-width="1.6" fill="none"/>`,
      kite: `<path ${f} d="M14 2 23.5 12 14 23 4.5 12z"/><path d="M14 23c-3 2 3 3 0 5" stroke="${col}" stroke-width="1.6" fill="none"/>`,
      umbrella: `<path ${f} d="M2.5 14a11.5 11.5 0 0 1 23 0z"/><path d="M14 14v8.5a2.3 2.3 0 0 1-4.6 0" stroke="${col}" stroke-width="2" fill="none"/>`,
      nota: `<rect x="5" y="4" width="18" height="20" rx="2.5" fill="#fff" stroke="${col}" stroke-width="2"/><path d="M9.5 9.5l9 9m0-9-9 9" stroke="${col}" stroke-width="2.6" stroke-linecap="round"/>`,
    }[s];
    return `<svg class="gv-sym" viewBox="0 0 28 28" aria-hidden="true" focusable="false">${body}</svg>`;
  }

  function largestRemainder(ws, total) {
    const sum = ws.reduce((a, b) => a + b, 0) || 1;
    const ex = ws.map((w) => (w * total) / sum);
    const out = ex.map(Math.floor);
    let left = total - out.reduce((a, b) => a + b, 0);
    ex.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (left > 0) { out[i]++; left--; } });
    return out;
  }
  function eOpts(o) {
    o = o || {};
    const cands = o.candidates || DEF_CANDS;
    const nota = o.nota !== false;
    const shares = o.shares || Object.fromEntries(cands.map((c, i) => [c, DEF_SHARES[cands.length][i]]));
    return { cands, nota, notaPercent: nota ? (o.notaPercent == null ? 2 : o.notaPercent) : 0, shares, voters: o.voters || 1200, turnout: o.turnout || 65, system: o.system || 'fptp', seats: o.seats || 10 };
  }
  // The count: every polled ballot is placed; the child's own vote is one of them. Pure, so it can be tested.
  function electionCount(o, childVote) {
    const e = eOpts(o);
    const P = Math.max(2, Math.round((e.voters * e.turnout) / 100));
    const ids = e.cands.slice();
    const ws = ids.map((c) => (e.shares[c] * (100 - e.notaPercent)) / 100);
    if (e.nota) { ids.push('nota'); ws.push(e.notaPercent); }
    const counts = largestRemainder(ws, P - 1);
    const votes = {};
    ids.forEach((id, i) => { votes[id] = counts[i] + (id === childVote ? 1 : 0); });
    const ranked = e.cands.slice().sort((a, b) => votes[b] - votes[a]);
    const tie = ranked.length > 1 && votes[ranked[0]] === votes[ranked[1]];
    const valid = e.cands.reduce((a, c) => a + votes[c], 0);
    const res = { ids, votes, polled: P, winner: ranked[0], tie, runnerUp: ranked[1], margin: votes[ranked[0]] - votes[ranked[1]], pct: Math.round((votes[ranked[0]] * 1000) / P) / 10, belowHalf: votes[ranked[0]] * 2 <= P };
    if (e.system === 'pr') {
      const seats = largestRemainder(e.cands.map((c) => votes[c]), e.seats);
      res.seats = Object.fromEntries(e.cands.map((c, i) => [c, seats[i]]));
      res.valid = valid;
    }
    return res;
  }

  // ================================================================ sorting modes: columns and cards
  const COL_STYLE = [['#1D4ED8', '#fff'], ['#FF7A1A', '#1E293B'], ['#0F766E', '#fff'], ['#8B3DFF', '#fff'], ['#FF6B57', '#1E293B'], ['#14B8A6', '#1E293B']];
  const C = (id, col, en, hi, why_en, why_hi) => ({ id, col, t: T2(en, hi), why: T2(why_en, why_hi) });
  const SORT = {
    organs: {
      title: T2('Three organs of government', 'सरकार के तीन अंग'),
      intro: T2('Tap a job, then tap the organ that does it. Each organ has its own work, so no one holds all the power.', 'कोई काम चुनो, फिर उस अंग को छुओ जो उसे करता है। हर अंग का अपना काम है, इसलिए सारी ताक़त किसी एक के पास नहीं रहती।'),
      cols: [
        { id: 'legislature', n: T2('Legislature', 'विधायिका'), s: T2('makes laws', 'क़ानून बनाती है'), ic: 'dome' },
        { id: 'executive', n: T2('Executive', 'कार्यपालिका'), s: T2('carries out laws', 'क़ानून लागू करती है'), ic: 'pillars' },
        { id: 'judiciary', n: T2('Judiciary', 'न्यायपालिका'), s: T2('settles disputes', 'विवाद सुलझाती है'), ic: 'scales' },
      ],
      cards: [
        C('debate-bill', 'legislature', 'Debates a bill and votes on it', 'विधेयक पर बहस करके मतदान करती है', 'Parliament and the State Assemblies make laws by debating and voting.', 'संसद और विधान सभाएँ बहस और मतदान से क़ानून बनाती हैं।'),
        C('question-hour', 'legislature', 'Asks ministers questions in Question Hour', 'प्रश्नकाल में मंत्रियों से सवाल पूछती है', 'Members of the legislature question ministers, so the government stays answerable.', 'विधायिका के सदस्य मंत्रियों से सवाल पूछते हैं, इसलिए सरकार जवाबदेह रहती है।'),
        C('no-confidence', 'legislature', 'Can pass a no-confidence motion against the ministers', 'मंत्रिपरिषद के विरुद्ध अविश्वास प्रस्ताव पास कर सकती है', 'The ministers stay in office only while the Lok Sabha trusts them.', 'मंत्री तभी तक पद पर रहते हैं जब तक लोक सभा का विश्वास उन पर है।'),
        C('pass-budget', 'legislature', 'Approves how the government raises and spends money', 'सरकार के धन जुटाने और ख़र्च करने को मंज़ूरी देती है', 'No tax or spending is allowed without the legislature’s approval.', 'विधायिका की मंज़ूरी के बिना कोई कर या ख़र्च नहीं हो सकता।'),
        C('run-scheme', 'executive', 'A ministry runs a scheme such as school meals', 'मंत्रालय मिड-डे मील जैसी योजना चलाता है', 'Running schemes and services is the daily work of the executive.', 'योजनाएँ और सेवाएँ चलाना कार्यपालिका का रोज़ का काम है।'),
        C('district-officer', 'executive', 'A district officer (IAS) looks after the work of the district', 'ज़िले का अधिकारी (आई.ए.एस.) ज़िले के काम की देखरेख करता है', 'Civil servants are part of the permanent executive.', 'सिविल सेवक स्थायी कार्यपालिका का भाग हैं।'),
        C('police-order', 'executive', 'The police keep law and order', 'पुलिस क़ानून-व्यवस्था बनाए रखती है', 'Enforcing laws on the ground is done by the executive.', 'क़ानूनों को ज़मीन पर लागू करना कार्यपालिका करती है।'),
        C('prepare-budget', 'executive', 'The Finance Ministry prepares the budget', 'वित्त मंत्रालय बजट तैयार करता है', 'The government plans the budget; the legislature then passes it.', 'सरकार बजट बनाती है; फिर विधायिका उसे पास करती है।'),
        C('settle-dispute', 'judiciary', 'Decides a dispute between two neighbours', 'दो पड़ोसियों के विवाद का फ़ैसला करती है', 'Settling disputes by law is the work of the courts.', 'क़ानून के अनुसार विवाद सुलझाना अदालतों का काम है।'),
        C('judicial-review', 'judiciary', 'Can declare a law invalid if it breaks the Constitution', 'संविधान के विरुद्ध क़ानून को अमान्य घोषित कर सकती है', 'This power is called judicial review.', 'इस शक्ति को न्यायिक समीक्षा कहते हैं।'),
        C('punish', 'judiciary', 'Punishes a person found guilty of a crime', 'अपराधी पाए गए व्यक्ति को दंड देती है', 'Only a court can hold a trial and give a sentence.', 'मुक़दमा चलाना और सज़ा देना केवल अदालत का काम है।'),
        C('writ', 'judiciary', 'Protects a citizen’s fundamental right by issuing a writ', 'रिट जारी करके नागरिक के मौलिक अधिकार की रक्षा करती है', 'Courts guard the fundamental rights of citizens.', 'अदालतें नागरिकों के मौलिक अधिकारों की रक्षा करती हैं।'),
      ],
    },
    levels: {
      title: T2('Levels of government', 'सरकार के स्तर'),
      intro: T2('India has government at three levels. Tap a job, then tap the level that looks after it.', 'भारत में सरकार तीन स्तरों पर है। कोई काम चुनो, फिर उस स्तर को छुओ जो उसे सँभालता है।'),
      cols: [
        { id: 'union', n: T2('Union (Centre)', 'केंद्र सरकार'), s: T2('the whole country', 'पूरा देश'), ic: 'flag' },
        { id: 'state', n: T2('State', 'राज्य सरकार'), s: T2('one State', 'एक राज्य'), ic: 'pillars' },
        { id: 'local', n: T2('Local', 'स्थानीय शासन'), s: T2('village, town, city', 'गाँव, क़स्बा, शहर'), ic: 'house' },
      ],
      cards: [
        C('defence', 'union', 'Defence of the whole country', 'पूरे देश की रक्षा', 'Army, navy and air force serve the whole nation, so the Union looks after them.', 'थल, जल और वायु सेना पूरे देश की हैं, इसलिए केंद्र उन्हें सँभालता है।'),
        C('foreign', 'union', 'Relations with other countries', 'दूसरे देशों से संबंध', 'Foreign affairs belong to the Union Government.', 'विदेश संबंध केंद्र सरकार के पास हैं।'),
        C('railways', 'union', 'Running the railways across States', 'राज्यों के आर-पार रेलें चलाना', 'Railways connect many States, so the Union runs them.', 'रेलें कई राज्यों को जोड़ती हैं, इसलिए केंद्र उन्हें चलाता है।'),
        C('coins', 'union', 'Minting the country’s coins', 'देश के सिक्के ढालना', 'Coinage is a Union subject.', 'सिक्के ढालना केंद्र का विषय है।'),
        C('police', 'state', 'Police and law and order in the State', 'राज्य में पुलिस और क़ानून-व्यवस्था', 'Police is on the State List.', 'पुलिस राज्य सूची में है।'),
        C('hospitals', 'state', 'Hospitals and public health in the State', 'राज्य में अस्पताल और जन-स्वास्थ्य', 'Public health is mostly a State subject.', 'जन-स्वास्थ्य मुख्यतः राज्य का विषय है।'),
        C('farming', 'state', 'Helping farmers and keeping land records', 'किसानों की मदद और ज़मीन के रिकॉर्ड', 'Agriculture and land are State subjects.', 'कृषि और भूमि राज्य के विषय हैं।'),
        C('state-law', 'state', 'The State Assembly makes laws for the State', 'विधान सभा राज्य के लिए क़ानून बनाती है', 'Each State has its own Assembly and Chief Minister.', 'हर राज्य की अपनी विधान सभा और मुख्यमंत्री होता है।'),
        C('garbage', 'local', 'Cleaning streets and clearing garbage', 'सड़कें साफ़ करना और कचरा उठाना', 'Municipalities and panchayats keep the locality clean.', 'नगरपालिकाएँ और पंचायतें इलाक़े को साफ़ रखती हैं।'),
        C('lanes', 'local', 'Mending village lanes and drains', 'गाँव की गलियाँ और नालियाँ ठीक करना', 'The Gram Panchayat looks after village lanes.', 'ग्राम पंचायत गाँव की गलियों की देखभाल करती है।'),
        C('taps', 'local', 'Street lights and public taps', 'सड़क की बत्तियाँ और सार्वजनिक नल', 'These are everyday local services.', 'ये रोज़ की स्थानीय सेवाएँ हैं।'),
        C('market', 'local', 'Running the weekly local market', 'साप्ताहिक स्थानीय बाज़ार चलाना', 'Local bodies manage markets in their area.', 'स्थानीय संस्थाएँ अपने क्षेत्र के बाज़ार सँभालती हैं।'),
      ],
    },
    federalism: {
      title: T2('Union, State and Concurrent lists', 'संघ, राज्य और समवर्ती सूची'),
      intro: T2('The Constitution divides subjects into three lists. Tap a subject, then tap the list it belongs to.', 'संविधान विषयों को तीन सूचियों में बाँटता है। कोई विषय चुनो, फिर उसकी सूची को छुओ।'),
      cols: [
        { id: 'union', n: T2('Union List', 'संघ सूची'), s: T2('only Parliament', 'केवल संसद'), ic: 'flag' },
        { id: 'state', n: T2('State List', 'राज्य सूची'), s: T2('mainly the State', 'मुख्यतः राज्य'), ic: 'pillars' },
        { id: 'concurrent', n: T2('Concurrent List', 'समवर्ती सूची'), s: T2('both make laws', 'दोनों क़ानून बनाते हैं'), ic: 'overlap' },
      ],
      cards: [
        C('f-defence', 'union', 'Defence', 'रक्षा', 'Defence of the whole country is on the Union List.', 'पूरे देश की रक्षा संघ सूची में है।'),
        C('f-foreign', 'union', 'Foreign affairs', 'विदेश मामले', 'Dealing with other countries is a Union subject.', 'दूसरे देशों से व्यवहार संघ का विषय है।'),
        C('f-currency', 'union', 'Currency and banking', 'मुद्रा और बैंकिंग', 'One currency for the whole country, so it is a Union subject.', 'पूरे देश की एक मुद्रा होती है, इसलिए यह संघ का विषय है।'),
        C('f-software', 'union', 'Computer software (a new subject in no list)', 'कंप्यूटर सॉफ़्टवेयर (नया विषय, किसी सूची में नहीं)', 'A subject in no list is a residuary subject. Residuary powers belong to the Union.', 'जो विषय किसी सूची में नहीं है वह अवशिष्ट विषय है। अवशिष्ट अधिकार केंद्र के पास हैं।'),
        C('f-police', 'state', 'Police', 'पुलिस', 'Police and public order are on the State List.', 'पुलिस और लोक व्यवस्था राज्य सूची में हैं।'),
        C('f-health', 'state', 'Public health and hospitals', 'जन-स्वास्थ्य और अस्पताल', 'Public health is on the State List.', 'जन-स्वास्थ्य राज्य सूची में है।'),
        C('f-agri', 'state', 'Agriculture', 'कृषि', 'Agriculture is on the State List.', 'कृषि राज्य सूची में है।'),
        C('f-local', 'state', 'Local government', 'स्थानीय शासन', 'Local government is on the State List.', 'स्थानीय शासन राज्य सूची में है।'),
        C('f-education', 'concurrent', 'Education', 'शिक्षा', 'Education was moved to the Concurrent List in 1976.', 'शिक्षा को 1976 में समवर्ती सूची में ले जाया गया।'),
        C('f-forests', 'concurrent', 'Forests', 'वन', 'Forests are on the Concurrent List.', 'वन समवर्ती सूची में हैं।'),
        C('f-marriage', 'concurrent', 'Marriage and divorce', 'विवाह और तलाक़', 'Marriage and divorce are on the Concurrent List.', 'विवाह और तलाक़ समवर्ती सूची में हैं।'),
        C('f-unions', 'concurrent', 'Trade unions', 'श्रमिक संघ', 'Trade unions are on the Concurrent List.', 'श्रमिक संघ समवर्ती सूची में हैं।'),
      ],
    },
    rights: {
      title: T2('Fundamental Rights', 'मौलिक अधिकार'),
      intro: T2('Part III of the Constitution gives six groups of fundamental rights. Read each story and tap the right it shows.', 'संविधान का भाग III मौलिक अधिकारों के छह समूह देता है। हर कहानी पढ़ो और जो अधिकार दिखता है उसे छुओ।'),
      cols: [
        { id: 'equality', n: T2('Right to Equality', 'समता का अधिकार'), s: T2('Articles 14–18', 'अनुच्छेद 14–18'), ic: 'equal' },
        { id: 'freedom', n: T2('Right to Freedom', 'स्वतंत्रता का अधिकार'), s: T2('Articles 19–22', 'अनुच्छेद 19–22'), ic: 'bird' },
        { id: 'exploitation', n: T2('Against Exploitation', 'शोषण के विरुद्ध अधिकार'), s: T2('Articles 23–24', 'अनुच्छेद 23–24'), ic: 'chain' },
        { id: 'religion', n: T2('Freedom of Religion', 'धार्मिक स्वतंत्रता का अधिकार'), s: T2('Articles 25–28', 'अनुच्छेद 25–28'), ic: 'sun' },
        { id: 'cultural', n: T2('Cultural and Educational Rights', 'संस्कृति और शिक्षा संबंधी अधिकार'), s: T2('Articles 29–30', 'अनुच्छेद 29–30'), ic: 'book' },
        { id: 'remedies', n: T2('Constitutional Remedies', 'संवैधानिक उपचारों का अधिकार'), s: T2('Article 32', 'अनुच्छेद 32'), ic: 'gavel' },
      ],
      cards: [
        C('r-merit', 'equality', 'A government job is open to every candidate, chosen on merit', 'सरकारी नौकरी सभी उम्मीदवारों के लिए खुली है, चयन योग्यता से', 'Equality of opportunity in public employment (Article 16).', 'सरकारी नौकरी में अवसर की समानता (अनुच्छेद 16)।'),
        C('r-well', 'equality', 'Everyone draws water from the village well, whatever their caste', 'जाति कुछ भी हो, सब गाँव के कुएँ से पानी भरते हैं', 'Untouchability is abolished (Article 17).', 'अस्पृश्यता का अंत कर दिया गया है (अनुच्छेद 17)।'),
        C('r-speech', 'freedom', 'Priya speaks her mind in a school debate', 'प्रिया स्कूल की बहस में अपनी बात खुलकर कहती है', 'Freedom of speech and expression (Article 19).', 'वाक् और अभिव्यक्ति की स्वतंत्रता (अनुच्छेद 19)।'),
        C('r-move', 'freedom', 'A family moves to another city to live and work', 'एक परिवार दूसरे शहर में रहने और काम करने जाता है', 'Freedom to move and settle anywhere in India (Article 19).', 'भारत में कहीं भी आने-जाने और बसने की स्वतंत्रता (अनुच्छेद 19)।'),
        C('r-school', 'freedom', 'Every child aged 6 to 14 gets free schooling', '6 से 14 वर्ष के हर बच्चे को मुफ़्त शिक्षा मिलती है', 'Right to education, Article 21A, sits under the Right to Freedom.', 'शिक्षा का अधिकार, अनुच्छेद 21A, स्वतंत्रता के अधिकार में आता है।'),
        C('r-arrest', 'freedom', 'The police must tell a person why he is arrested', 'पुलिस को बताना होता है कि व्यक्ति को क्यों गिरफ़्तार किया गया', 'Protection on arrest and detention (Article 22).', 'गिरफ़्तारी और निरोध में संरक्षण (अनुच्छेद 22)।'),
        C('r-child', 'exploitation', 'A factory cannot employ a child of ten', 'कोई कारख़ाना दस साल के बच्चे को काम पर नहीं रख सकता', 'No child below 14 may work in a factory or mine (Article 24).', '14 वर्ष से छोटे बच्चे से कारख़ाने या खान में काम नहीं कराया जा सकता (अनुच्छेद 24)।'),
        C('r-bonded', 'exploitation', 'No one can be forced to work without pay', 'किसी से बिना मज़दूरी ज़बरदस्ती काम नहीं कराया जा सकता', 'Forced labour and trafficking are banned (Article 23).', 'बंधुआ मज़दूरी और मानव-व्यापार पर रोक है (अनुच्छेद 23)।'),
        C('r-festival', 'religion', 'Families celebrate Diwali, Eid and Christmas freely', 'परिवार दीवाली, ईद और क्रिसमस खुलकर मनाते हैं', 'Every person may follow and practise any religion (Article 25).', 'हर व्यक्ति कोई भी धर्म मान सकता और उसका पालन कर सकता है (अनुच्छेद 25)।'),
        C('r-tax', 'religion', 'No one is forced to pay a tax to support one religion', 'किसी को एक धर्म के लिए कर देने पर मजबूर नहीं किया जा सकता', 'Freedom from paying taxes for a religion (Article 27).', 'किसी धर्म के लिए कर देने से स्वतंत्रता (अनुच्छेद 27)।'),
        C('r-script', 'cultural', 'A community runs its own school and keeps its own language and script', 'एक समुदाय अपना स्कूल चलाता है और अपनी भाषा-लिपि बचाए रखता है', 'Minorities may protect their culture and run schools (Articles 29–30).', 'अल्पसंख्यक अपनी संस्कृति बचा सकते हैं और स्कूल चला सकते हैं (अनुच्छेद 29–30)।'),
        C('r-court', 'remedies', 'A citizen goes to the Supreme Court because a right was denied', 'अधिकार छीने जाने पर नागरिक सर्वोच्च न्यायालय जाता है', 'This right makes all other rights enforceable. Dr Ambedkar called it the heart of the Constitution.', 'यह अधिकार बाक़ी सब अधिकारों को लागू कराता है। डॉ. आंबेडकर ने इसे संविधान की आत्मा कहा था।'),
      ],
    },
    courts: {
      title: T2('Courts of India', 'भारत की अदालतें'),
      intro: T2('India has one connected system of courts. Tap a case, then tap the court where it is heard.', 'भारत में अदालतों की एक जुड़ी हुई व्यवस्था है। कोई मामला चुनो, फिर उस अदालत को छुओ जहाँ उसकी सुनवाई होती है।'),
      cols: [
        { id: 'supreme', n: T2('Supreme Court', 'सर्वोच्च न्यायालय'), s: T2('highest court, in Delhi', 'सबसे बड़ी अदालत, दिल्ली'), ic: 'scales' },
        { id: 'high', n: T2('High Court', 'उच्च न्यायालय'), s: T2('in each State or group of States', 'हर राज्य या राज्य-समूह में'), ic: 'gavel' },
        { id: 'district', n: T2('District Court', 'ज़िला न्यायालय'), s: T2('in each district', 'हर ज़िले में'), ic: 'book' },
      ],
      cards: [
        C('c-states', 'supreme', 'A river-water dispute between two States', 'दो राज्यों के बीच नदी के पानी का विवाद', 'Disputes between States are heard by the Supreme Court.', 'राज्यों के बीच विवाद सर्वोच्च न्यायालय सुनता है।'),
        C('c-union', 'supreme', 'A dispute between the Union Government and a State', 'केंद्र सरकार और एक राज्य के बीच विवाद', 'Only the Supreme Court hears Union–State disputes.', 'केंद्र और राज्य के विवाद केवल सर्वोच्च न्यायालय सुनता है।'),
        C('c-appeal-hc', 'supreme', 'An appeal against a High Court judgement', 'उच्च न्यायालय के फ़ैसले के विरुद्ध अपील', 'The Supreme Court is the final court of appeal.', 'सर्वोच्च न्यायालय अपील की अंतिम अदालत है।'),
        C('c-advice', 'supreme', 'The President asks for advice on a question of law', 'राष्ट्रपति किसी क़ानूनी प्रश्न पर सलाह माँगते हैं', 'The Supreme Court gives advisory opinions when the President asks.', 'राष्ट्रपति के माँगने पर सर्वोच्च न्यायालय सलाह देता है।'),
        C('c-appeal-dc', 'high', 'An appeal against a District Court judgement', 'ज़िला न्यायालय के फ़ैसले के विरुद्ध अपील', 'Appeals from the district courts go to the High Court.', 'ज़िला अदालतों की अपीलें उच्च न्यायालय जाती हैं।'),
        C('c-supervise', 'high', 'Watching over the courts below it in the State', 'राज्य में अपने से नीचे की अदालतों की निगरानी', 'The High Court supervises the subordinate courts of its State.', 'उच्च न्यायालय अपने राज्य की अधीनस्थ अदालतों की निगरानी करता है।'),
        C('c-death', 'high', 'Confirming a death sentence given by a Sessions Court', 'सत्र न्यायालय की मृत्युदंड की सज़ा की पुष्टि', 'A death sentence from a lower court must be confirmed by the High Court.', 'निचली अदालत की मृत्युदंड की सज़ा की पुष्टि उच्च न्यायालय करता है।'),
        C('c-land', 'district', 'A land dispute between two neighbours', 'दो पड़ोसियों के बीच ज़मीन का विवाद', 'Most ordinary civil cases begin in the District Court.', 'अधिकतर सामान्य दीवानी मामले ज़िला न्यायालय से शुरू होते हैं।'),
        C('c-theft', 'district', 'The trial of a person accused of theft', 'चोरी के आरोपी पर मुक़दमा', 'Criminal trials usually begin in the courts of the district.', 'आपराधिक मुक़दमे आम तौर पर ज़िले की अदालतों में शुरू होते हैं।'),
        C('c-murder', 'district', 'A murder trial, heard by the Sessions Court', 'हत्या का मुक़दमा, सत्र न्यायालय में', 'The Sessions Court of the district tries serious crimes.', 'ज़िले का सत्र न्यायालय गंभीर अपराधों का मुक़दमा चलाता है।'),
        C('c-rent', 'district', 'A dispute between a tenant and a landlord over rent', 'किराएदार और मकान-मालिक के बीच किराए का विवाद', 'Rent cases are civil cases heard first at the district level.', 'किराए के मामले दीवानी हैं और पहले ज़िला स्तर पर सुने जाते हैं।'),
      ],
    },
  };

  // ================================================================ process modes (law-making, budget-session)
  const S = (id, kind, house, en, hi, den, dhi) => ({ id, kind, house, t: T2(en, hi), d: T2(den, dhi) });
  function stagesFor(mode, bill) {
    if (mode === 'budget-session') {
      return [
        S('present', 'step', 'ls', 'Finance Minister presents the Budget', 'वित्त मंत्री बजट पेश करते हैं', 'In February the Finance Minister reads the Budget speech in the Lok Sabha: what the government expects to earn and plans to spend in the coming financial year (April to March).', 'फ़रवरी में वित्त मंत्री लोक सभा में बजट भाषण पढ़ते हैं: आने वाले वित्त वर्ष (अप्रैल से मार्च) में सरकार कितना कमाएगी और कितना ख़र्च करेगी।'),
        S('discuss', 'step', 'ls', 'General discussion', 'सामान्य चर्चा', 'Members of both Houses discuss the Budget as a whole. No vote is taken yet.', 'दोनों सदनों के सदस्य पूरे बजट पर चर्चा करते हैं। अभी मतदान नहीं होता।'),
        S('committees', 'step', 'ls', 'Committees study the demands', 'समितियाँ माँगों की जाँच करती हैं', 'Standing committees examine each ministry’s demand for money in detail while the House takes a break.', 'सदन के अवकाश में स्थायी समितियाँ हर मंत्रालय की धन की माँग की बारीकी से जाँच करती हैं।'),
        S('demands', 'vote', 'ls', 'Vote on demands for grants', 'अनुदान माँगों पर मतदान', 'Only the Lok Sabha votes on the demands for grants. A majority must say yes.', 'अनुदान माँगों पर केवल लोक सभा मतदान करती है। बहुमत का हाँ कहना ज़रूरी है।'),
        S('appropriation', 'vote', 'ls', 'Appropriation Bill', 'विनियोग विधेयक', 'This Bill lets the government take the voted money out of the Consolidated Fund of India. It is a Money Bill.', 'यह विधेयक सरकार को भारत की संचित निधि से मंज़ूर धन निकालने देता है। यह धन विधेयक है।'),
        S('finance', 'vote', 'ls', 'Finance Bill', 'वित्त विधेयक', 'The Finance Bill carries the tax proposals of the Budget. If the Lok Sabha rejects it, the government has lost its majority.', 'वित्त विधेयक में बजट के कर-प्रस्ताव होते हैं। लोक सभा इसे ठुकराए तो सरकार का बहुमत ख़त्म माना जाता है।'),
        S('rs-recommend', 'step', 'rs', 'Rajya Sabha suggests changes', 'राज्य सभा सुझाव देती है', 'The Rajya Sabha can only recommend changes within 14 days. The Lok Sabha may accept or ignore them.', 'राज्य सभा 14 दिन के भीतर केवल सुझाव दे सकती है। लोक सभा उन्हें मान भी सकती है और छोड़ भी सकती है।'),
        S('assent', 'step', 'pres', 'President gives assent', 'राष्ट्रपति की स्वीकृति', 'The President signs the Bills. Money Bills cannot be sent back.', 'राष्ट्रपति विधेयकों पर हस्ताक्षर करते हैं। धन विधेयक लौटाए नहीं जा सकते।'),
        S('act', 'final', 'pres', 'The government can spend from 1 April', 'सरकार 1 अप्रैल से ख़र्च कर सकती है', 'The financial year begins on 1 April, so Parliament finishes the money Bills by the end of March.', 'वित्त वर्ष 1 अप्रैल से शुरू होता है, इसलिए संसद मार्च के अंत तक धन विधेयक पूरे कर देती है।'),
      ];
    }
    if (bill === 'money') {
      return [
        S('introduce', 'step', 'ls', 'Introduced in the Lok Sabha only', 'केवल लोक सभा में पेश', 'A Money Bill (about tax or government spending) can start only in the Lok Sabha, and only with the President’s recommendation.', 'धन विधेयक (कर या सरकारी ख़र्च का) केवल लोक सभा में और राष्ट्रपति की सिफ़ारिश से ही शुरू हो सकता है।'),
        S('ls-debate', 'step', 'ls', 'Lok Sabha debates it', 'लोक सभा में बहस', 'All members of the Lok Sabha discuss the bill.', 'लोक सभा के सभी सदस्य विधेयक पर चर्चा करते हैं।'),
        S('ls-vote', 'vote', 'ls', 'Lok Sabha votes', 'लोक सभा में मतदान', 'More members must vote yes than no.', 'हाँ कहने वाले सदस्य न कहने वालों से अधिक होने चाहिए।'),
        S('rs-recommend', 'step', 'rs', 'Rajya Sabha suggests changes', 'राज्य सभा सुझाव देती है', 'The Rajya Sabha has 14 days only to recommend changes. It cannot reject a Money Bill. The Lok Sabha decides.', 'राज्य सभा के पास केवल सुझाव देने के लिए 14 दिन हैं। वह धन विधेयक को ठुकरा नहीं सकती। निर्णय लोक सभा का है।'),
        S('assent', 'step', 'pres', 'President gives assent', 'राष्ट्रपति की स्वीकृति', 'The President must sign a Money Bill; it cannot be returned.', 'राष्ट्रपति को धन विधेयक पर हस्ताक्षर करने ही होते हैं; वे इसे लौटा नहीं सकते।'),
        S('act', 'final', 'pres', 'It becomes an Act', 'यह अधिनियम बन जाता है', 'The law is published in the Gazette of India.', 'क़ानून भारत के राजपत्र में छपता है।'),
      ];
    }
    const voteD = bill === 'amendment'
      ? T2('An amendment of the Constitution needs two-thirds of the members present and voting, and also a majority of all the members of the House (Article 368).', 'संविधान संशोधन के लिए उपस्थित और मतदान करने वाले सदस्यों के दो-तिहाई तथा सदन की कुल सदस्य संख्या के बहुमत की ज़रूरत होती है (अनुच्छेद 368)।')
      : T2('More members must vote yes than no.', 'हाँ कहने वाले सदस्य न कहने वालों से अधिक होने चाहिए।');
    const out = [
      S('introduce', 'step', 'ls', 'Bill introduced', 'विधेयक पेश', 'A bill is a draft of a law. A minister brings it to the Lok Sabha and reads its title. An ordinary bill may also start in the Rajya Sabha.', 'विधेयक क़ानून का मसौदा होता है। मंत्री उसे लोक सभा में लाकर शीर्षक पढ़ता है। साधारण विधेयक राज्य सभा में भी शुरू हो सकता है।'),
      S('committee', 'step', 'ls', 'A committee studies it', 'समिति उसकी जाँच करती है', 'A small group of members studies the bill closely and may suggest changes.', 'सदस्यों का एक छोटा समूह विधेयक की बारीकी से जाँच करता है और बदलाव सुझा सकता है।'),
      S('ls-debate', 'step', 'ls', 'Lok Sabha debates it', 'लोक सभा में बहस', 'All members of the Lok Sabha discuss the bill clause by clause.', 'लोक सभा के सभी सदस्य विधेयक की धारा-दर-धारा चर्चा करते हैं।'),
      { id: 'ls-vote', kind: 'vote', house: 'ls', t: T2('Lok Sabha votes', 'लोक सभा में मतदान'), d: voteD },
      { id: 'rs-vote', kind: 'vote', house: 'rs', t: T2('Rajya Sabha votes', 'राज्य सभा में मतदान'), d: T2('The Rajya Sabha, the council of the States, debates and votes too. ', 'राज्यों की परिषद, राज्य सभा, भी बहस और मतदान करती है। ') },
      S('assent', 'step', 'pres', 'President gives assent', 'राष्ट्रपति की स्वीकृति', 'When both Houses have passed the bill, the President signs it. Only then does it become law.', 'दोनों सदनों के पास करने पर राष्ट्रपति हस्ताक्षर करते हैं। तभी वह क़ानून बनता है।'),
      S('act', 'final', 'pres', 'It becomes an Act', 'यह अधिनियम बन जाता है', 'The law is published in the Gazette of India and comes into force.', 'क़ानून भारत के राजपत्र में छपता है और लागू हो जाता है।'),
    ];
    out[4].d = T2(out[4].d.en + voteD.en, out[4].d.hi + voteD.hi);
    return out;
  }
  const JOINT = { id: 'joint', kind: 'vote', house: 'joint', t: T2('Joint sitting of both Houses', 'दोनों सदनों की संयुक्त बैठक'), d: T2('The Houses disagree on an ordinary bill, so the President calls a joint sitting (Article 108). All 788 members sit and vote together. Because the Lok Sabha is larger, it usually decides.', 'दोनों सदन साधारण विधेयक पर असहमत हैं, इसलिए राष्ट्रपति संयुक्त बैठक बुलाते हैं (अनुच्छेद 108)। सभी 788 सदस्य साथ बैठकर मतदान करते हैं। लोक सभा बड़ी है, इसलिए प्रायः उसी की बात चलती है।') };
  const HOUSE = { ls: [LS, T2('Lok Sabha', 'लोक सभा')], rs: [RS, T2('Rajya Sabha', 'राज्य सभा')], joint: [LS + RS, T2('Joint sitting', 'संयुक्त बैठक')] };
  // The vote: all members of the house are present and vote. Returns the numbers and the verdict.
  function voteResult(house, supportPct, special) {
    const total = HOUSE[house][0];
    const yes = Math.round((total * supportPct) / 100), no = total - yes;
    const simple = Math.floor(total / 2) + 1;
    const need = special ? Math.max(simple, Math.ceil((total * 2) / 3)) : simple;
    return { total, yes, no, need, pass: yes >= need };
  }
  const HEADS = {
    education: T2('Education', 'शिक्षा'), health: T2('Health', 'स्वास्थ्य'), farming: T2('Farming', 'खेती'), roads: T2('Roads and railways', 'सड़कें और रेल'), defence: T2('Defence', 'रक्षा'),
  };
  const DEF_SPEND = { education: 18, health: 14, farming: 12, roads: 16, defence: 22 };
  const FIXED = 20, RECEIPTS = 100, SPEND_MAX = 40;
  function budgetFigures(spend) {
    const total = Object.values(spend).reduce((a, b) => a + b, 0) + FIXED;
    return { total, gap: total - RECEIPTS };
  }

  // ================================================================ panchayat
  const TIERS = [
    { id: 'gram-sabha', n: T2('Gram Sabha', 'ग्राम सभा'), s: T2('all adult voters of the village', 'गाँव के सभी वयस्क मतदाता'), d: T2('Every adult who is on the village voters’ list is a member. It meets to discuss the village budget and the work of the Gram Panchayat, and it can ask questions.', 'गाँव की मतदाता सूची में नाम वाला हर वयस्क इसका सदस्य है। यह गाँव के बजट और ग्राम पंचायत के काम पर चर्चा करती है और सवाल पूछ सकती है।') },
    { id: 'gram-panchayat', n: T2('Gram Panchayat', 'ग्राम पंचायत'), s: T2('ward members and a Sarpanch', 'वार्ड सदस्य और सरपंच'), d: T2('Villagers elect ward members (panches) and a Sarpanch for five years. It looks after village lanes, drinking water, street lights and the village school building.', 'ग्रामीण पाँच साल के लिए वार्ड सदस्य (पंच) और सरपंच चुनते हैं। यह गलियों, पीने के पानी, बत्तियों और स्कूल-भवन की देखभाल करती है।') },
    { id: 'panchayat-samiti', n: T2('Panchayat Samiti', 'पंचायत समिति'), s: T2('the block', 'खंड (ब्लॉक)'), d: T2('Works at the level of a block, a group of villages. Its members are elected, and the Sarpanches of the Gram Panchayats take part. It plans work for the whole block.', 'यह खंड, यानी गाँवों के समूह, के स्तर पर काम करती है। इसके सदस्य चुने जाते हैं और ग्राम पंचायतों के सरपंच भी भाग लेते हैं। यह पूरे खंड के काम की योजना बनाती है।') },
    { id: 'zila-parishad', n: T2('Zila Parishad', 'ज़िला परिषद'), s: T2('the district', 'ज़िला'), d: T2('The top tier, at the district level. It guides the Panchayat Samitis, and plans rural development for the whole district.', 'सबसे ऊपर का स्तर, ज़िला स्तर पर। यह पंचायत समितियों का मार्गदर्शन करती है और पूरे ज़िले के ग्रामीण विकास की योजना बनाती है।') },
  ];

  // ================================================================ the check questions (3 or 4 for every mode)
  const Q = (q, o, a, w) => ({ q, o, a, w });
  const QS = {
    election: [
      Q(T2('Who wins in our election system, called first past the post?', 'हमारी चुनाव-व्यवस्था (सर्वाधिक वोट पाने वाला जीतता है) में कौन जीतता है?'), [T2('Whoever gets more than half of all votes', 'जिसे कुल वोटों के आधे से अधिक मिलें'), T2('Whoever gets more votes than every other candidate', 'जिसे बाक़ी हर उम्मीदवार से अधिक वोट मिलें'), T2('Whoever the oldest voter chooses', 'जिसे सबसे बुज़ुर्ग मतदाता चुने')], 1, T2('The candidate with the most votes wins, even if that is less than half of all votes.', 'सबसे अधिक वोट पाने वाला जीतता है, चाहे वह कुल वोटों के आधे से कम ही हो।')),
      Q(T2('What does the VVPAT slip let a voter do?', 'वीवीपैट पर्ची से मतदाता क्या कर पाता है?'), [T2('See for seven seconds that the vote went to the chosen candidate', 'सात सेकंड देखना कि वोट चुने हुए उम्मीदवार को गया'), T2('Vote a second time', 'दूसरी बार वोट देना'), T2('Take the slip home as proof', 'पर्ची प्रमाण के रूप में घर ले जाना')], 0, T2('The slip is visible for seven seconds and then drops into a sealed box, so the voter can check it.', 'पर्ची सात सेकंड दिखती है, फिर सील बंद डिब्बे में गिर जाती है, ताकि मतदाता जाँच सके।')),
      Q(T2('From what age can an Indian citizen vote in elections?', 'भारत का नागरिक किस उम्र से चुनाव में वोट दे सकता है?'), [T2('16 years', '16 वर्ष'), T2('18 years', '18 वर्ष'), T2('21 years', '21 वर्ष')], 1, T2('The voting age was lowered from 21 to 18 in 1988.', 'मतदान की आयु 1988 में 21 से घटाकर 18 की गई।')),
      Q(T2('What does a vote for NOTA mean?', 'नोटा को वोट देने का क्या अर्थ है?'), [T2('The voter likes all the candidates', 'मतदाता को सभी उम्मीदवार पसंद हैं'), T2('The voter chooses none of the candidates', 'मतदाता किसी भी उम्मीदवार को नहीं चुनता'), T2('The vote is thrown away by mistake', 'वोट ग़लती से बेकार हो गया')], 1, T2('NOTA lets a voter say “none of the above”. Even so, the candidate with the most votes still wins.', 'नोटा से मतदाता “इनमें से कोई नहीं” कह सकता है। फिर भी सबसे अधिक वोट पाने वाला उम्मीदवार ही जीतता है।')),
    ],
    'law-making': [
      Q(T2('If all 543 Lok Sabha members vote, at least how many yes votes pass an ordinary bill?', 'यदि लोक सभा के सभी 543 सदस्य मतदान करें, तो साधारण विधेयक पास होने के लिए कम से कम कितने हाँ चाहिए?'), [T2('200', '200'), T2('272', '272'), T2('362', '362')], 1, T2('272 is more than half of 543, so yes beats no.', '272, 543 के आधे से अधिक है, इसलिए हाँ की संख्या न से अधिक होती है।')),
      Q(T2('Who gives the final assent that turns a bill into an Act?', 'विधेयक को अधिनियम बनाने वाली अंतिम स्वीकृति कौन देता है?'), [T2('The Prime Minister', 'प्रधानमंत्री'), T2('The President', 'राष्ट्रपति'), T2('The Speaker', 'अध्यक्ष')], 1, T2('A bill becomes law only after the President signs it.', 'विधेयक राष्ट्रपति के हस्ताक्षर के बाद ही क़ानून बनता है।')),
      Q(T2('Which bill can start only in the Lok Sabha, where the Rajya Sabha can only suggest changes?', 'कौन-सा विधेयक केवल लोक सभा में शुरू हो सकता है और राज्य सभा केवल सुझाव दे सकती है?'), [T2('Money Bill', 'धन विधेयक'), T2('Ordinary Bill', 'साधारण विधेयक'), T2('Any bill about schools', 'स्कूल से जुड़ा कोई भी विधेयक')], 0, T2('Money Bills are about tax and spending. The directly elected Lok Sabha holds the purse.', 'धन विधेयक कर और ख़र्च के होते हैं। सीधे चुनी गई लोक सभा के हाथ में धन की चाबी है।')),
      Q(T2('What happens if the Rajya Sabha rejects an ordinary bill that the Lok Sabha passed?', 'लोक सभा द्वारा पास साधारण विधेयक को राज्य सभा ठुकरा दे तो क्या होता है?'), [T2('The bill is dead for ever', 'विधेयक सदा के लिए समाप्त'), T2('The President can call a joint sitting of both Houses', 'राष्ट्रपति दोनों सदनों की संयुक्त बैठक बुला सकते हैं'), T2('The Supreme Court decides', 'सर्वोच्च न्यायालय तय करता है')], 1, T2('A joint sitting settles the dispute between the Houses (Article 108). It is not used for Money Bills or Constitution amendments.', 'संयुक्त बैठक दोनों सदनों के विवाद को सुलझाती है (अनुच्छेद 108)। यह धन विधेयक या संविधान संशोधन के लिए नहीं होती।')),
    ],
    organs: [
      Q(T2('Which organ of government makes laws?', 'सरकार का कौन-सा अंग क़ानून बनाता है?'), [T2('Legislature', 'विधायिका'), T2('Executive', 'कार्यपालिका'), T2('Judiciary', 'न्यायपालिका')], 0, T2('Parliament and the State Assemblies are the legislature.', 'संसद और विधान सभाएँ विधायिका हैं।')),
      Q(T2('Which organ can say a law is against the Constitution?', 'कौन-सा अंग कह सकता है कि कोई क़ानून संविधान के विरुद्ध है?'), [T2('Executive', 'कार्यपालिका'), T2('Judiciary', 'न्यायपालिका'), T2('Election Commission', 'चुनाव आयोग')], 1, T2('The courts can strike down a law that breaks the Constitution.', 'अदालतें संविधान तोड़ने वाले क़ानून को रद्द कर सकती हैं।')),
      Q(T2('Why are the three organs kept separate?', 'तीनों अंगों को अलग क्यों रखा गया है?'), [T2('So that no one holds all the power and each can check the others', 'ताकि सारी ताक़त किसी एक के पास न रहे और हर अंग दूसरों पर नज़र रखे'), T2('To make government slow', 'ताकि सरकार धीमी चले'), T2('Because they work in different cities', 'क्योंकि वे अलग-अलग शहरों में काम करते हैं')], 0, T2('This sharing of power is called separation of powers, with checks and balances.', 'शक्तियों के इस बँटवारे को शक्ति-पृथक्करण कहते हैं, जिसमें हर अंग दूसरे पर अंकुश रखता है।')),
    ],
    levels: [
      Q(T2('Who looks after street lights and drinking-water taps in a village?', 'गाँव में बत्तियों और पीने के पानी के नलों की देखभाल कौन करता है?'), [T2('Gram Panchayat', 'ग्राम पंचायत'), T2('Union Government', 'केंद्र सरकार'), T2('Supreme Court', 'सर्वोच्च न्यायालय')], 0, T2('Gram Panchayat is the local government of the village.', 'ग्राम पंचायत गाँव की स्थानीय सरकार है।')),
      Q(T2('Which government runs the army, navy and air force?', 'थल, जल और वायु सेना किस सरकार के अधीन हैं?'), [T2('State', 'राज्य सरकार'), T2('Union', 'केंद्र सरकार'), T2('Municipality', 'नगरपालिका')], 1, T2('Defence is a Union subject.', 'रक्षा केंद्र का विषय है।')),
      Q(T2('Which amendments gave local government its constitutional status?', 'किन संशोधनों ने स्थानीय शासन को संवैधानिक दर्जा दिया?'), [T2('73rd and 74th (1992)', '73वाँ और 74वाँ (1992)'), T2('42nd (1976)', '42वाँ (1976)'), T2('1st (1951)', 'पहला (1951)')], 0, T2('The 73rd Amendment is for panchayats and the 74th for municipalities.', '73वाँ संशोधन पंचायतों के लिए और 74वाँ नगरपालिकाओं के लिए है।')),
    ],
    federalism: [
      Q(T2('Who makes laws on defence?', 'रक्षा पर क़ानून कौन बनाता है?'), [T2('Only Parliament', 'केवल संसद'), T2('Only State Assemblies', 'केवल राज्य विधान सभाएँ'), T2('Both equally', 'दोनों बराबर')], 0, T2('Defence is on the Union List, so only Parliament makes laws on it.', 'रक्षा संघ सूची में है, इसलिए उस पर केवल संसद क़ानून बनाती है।')),
      Q(T2('Who has the power over a subject that is in no list, like computer software?', 'किसी सूची में न आने वाले विषय (जैसे कंप्यूटर सॉफ़्टवेयर) पर अधिकार किसका है?'), [T2('The Union Government', 'केंद्र सरकार'), T2('The State Government', 'राज्य सरकार'), T2('The Supreme Court', 'सर्वोच्च न्यायालय')], 0, T2('These are residuary subjects, and residuary powers go to the Union.', 'ये अवशिष्ट विषय हैं और अवशिष्ट शक्तियाँ केंद्र के पास हैं।')),
      Q(T2('A Union law and a State law clash on a Concurrent List subject. Which one holds?', 'समवर्ती सूची के विषय पर केंद्र और राज्य के क़ानून टकराएँ तो कौन मान्य होता है?'), [T2('The State law', 'राज्य का क़ानून'), T2('The Union law', 'केंद्र का क़ानून'), T2('The older law', 'जो पुराना हो')], 1, T2('On the Concurrent List the Union law prevails.', 'समवर्ती सूची में केंद्र का क़ानून मान्य होता है।')),
    ],
    rights: [
      Q(T2('How many groups of fundamental rights does the Constitution give?', 'संविधान मौलिक अधिकारों के कितने समूह देता है?'), [T2('Three', 'तीन'), T2('Six', 'छह'), T2('Ten', 'दस')], 1, T2('Equality, Freedom, Against Exploitation, Religion, Cultural and Educational, and Constitutional Remedies.', 'समता, स्वतंत्रता, शोषण के विरुद्ध, धार्मिक स्वतंत्रता, संस्कृति और शिक्षा, तथा संवैधानिक उपचार।')),
      Q(T2('Which right lets a citizen go to court when another right is denied?', 'किसी अधिकार के छिनने पर नागरिक को अदालत जाने देने वाला अधिकार कौन-सा है?'), [T2('Right to Equality', 'समता का अधिकार'), T2('Right to Constitutional Remedies', 'संवैधानिक उपचारों का अधिकार'), T2('Right to Freedom of Religion', 'धार्मिक स्वतंत्रता का अधिकार')], 1, T2('Article 32 makes the other rights enforceable.', 'अनुच्छेद 32 बाक़ी अधिकारों को लागू कराने योग्य बनाता है।')),
      Q(T2('The right to property today is:', 'संपत्ति का अधिकार आज है:'), [T2('A fundamental right', 'मौलिक अधिकार'), T2('A legal right (Article 300A), not a fundamental right', 'एक क़ानूनी अधिकार (अनुच्छेद 300A), मौलिक अधिकार नहीं'), T2('Not a right at all', 'कोई अधिकार नहीं')], 1, T2('The 44th Amendment (1978) removed it from the fundamental rights; it stays a legal right.', '44वें संशोधन (1978) ने इसे मौलिक अधिकारों से हटाया; यह क़ानूनी अधिकार बना रहा।')),
    ],
    courts: [
      Q(T2('Which is the highest court of India?', 'भारत की सबसे ऊँची अदालत कौन-सी है?'), [T2('Supreme Court', 'सर्वोच्च न्यायालय'), T2('High Court', 'उच्च न्यायालय'), T2('District Court', 'ज़िला न्यायालय')], 0, T2('The Supreme Court sits in Delhi and its judgement binds all courts.', 'सर्वोच्च न्यायालय दिल्ली में है और उसका फ़ैसला सभी अदालतों को मानना पड़ता है।')),
      Q(T2('Where does a person appeal against a District Court judgement?', 'ज़िला न्यायालय के फ़ैसले के विरुद्ध अपील कहाँ होती है?'), [T2('High Court', 'उच्च न्यायालय'), T2('Panchayat', 'पंचायत'), T2('Parliament', 'संसद')], 0, T2('Appeals climb the ladder: District Court, High Court, Supreme Court.', 'अपील सीढ़ी चढ़ती है: ज़िला न्यायालय, उच्च न्यायालय, सर्वोच्च न्यायालय।')),
      Q(T2('What is a Public Interest Litigation (PIL)?', 'जनहित याचिका (पी.आई.एल.) क्या है?'), [T2('A case that anyone can bring to the court for the benefit of people whose rights are harmed', 'ऐसा मामला जो कोई भी उन लोगों के हित में अदालत ला सकता है जिनके अधिकार छिने हैं'), T2('A case only the government can file', 'ऐसा मामला जो केवल सरकार दायर कर सकती है'), T2('A tax on lawyers', 'वकीलों पर कर')], 0, T2('PIL opened the courts to ordinary people who cannot afford a case.', 'जनहित याचिका ने उन आम लोगों के लिए अदालत के दरवाज़े खोले जो मुक़दमा नहीं लड़ सकते।')),
    ],
    panchayat: [
      Q(T2('What share of seats in a panchayat is reserved for women?', 'पंचायत की कितनी सीटें महिलाओं के लिए आरक्षित हैं?'), [T2('At least one-third', 'कम से कम एक-तिहाई'), T2('One-tenth', 'दसवाँ भाग'), T2('None', 'कोई नहीं')], 0, T2('The 73rd Amendment reserves at least one-third of seats for women, rotating among wards.', '73वें संशोधन ने कम से कम एक-तिहाई सीटें महिलाओं के लिए आरक्षित की हैं, जो वार्डों में बदलती रहती हैं।')),
      Q(T2('For how many years is a panchayat elected?', 'पंचायत कितने वर्ष के लिए चुनी जाती है?'), [T2('Three', 'तीन'), T2('Five', 'पाँच'), T2('Seven', 'सात')], 1, T2('Panchayats have a five-year term, and elections are held by the State Election Commission.', 'पंचायतों का कार्यकाल पाँच साल है और चुनाव राज्य निर्वाचन आयोग कराता है।')),
      Q(T2('Who are the members of the Gram Sabha?', 'ग्राम सभा के सदस्य कौन हैं?'), [T2('Only the Sarpanch', 'केवल सरपंच'), T2('All adult voters of the village', 'गाँव के सभी वयस्क मतदाता'), T2('Government officers', 'सरकारी अधिकारी')], 1, T2('The Gram Sabha is the whole village assembly. It keeps the Gram Panchayat answerable.', 'ग्राम सभा पूरे गाँव की सभा है। वह ग्राम पंचायत को जवाबदेह रखती है।')),
    ],
    'budget-session': [
      Q(T2('When does the financial year of the Government of India begin?', 'भारत सरकार का वित्त वर्ष कब शुरू होता है?'), [T2('1 January', '1 जनवरी'), T2('1 April', '1 अप्रैल'), T2('1 October', '1 अक्टूबर')], 1, T2('The year runs from 1 April to 31 March.', 'वर्ष 1 अप्रैल से 31 मार्च तक चलता है।')),
      Q(T2('Who presents the Union Budget in the Lok Sabha?', 'लोक सभा में केंद्रीय बजट कौन पेश करता है?'), [T2('The Finance Minister', 'वित्त मंत्री'), T2('The Speaker', 'अध्यक्ष'), T2('The Chief Justice', 'मुख्य न्यायाधीश')], 0, T2('The Finance Minister reads the Budget speech.', 'वित्त मंत्री बजट भाषण पढ़ते हैं।')),
      Q(T2('When a government spends more than it earns, what must it do?', 'सरकार कमाई से अधिक ख़र्च करे तो उसे क्या करना पड़ता है?'), [T2('Borrow the difference', 'अंतर के लिए उधार लेना'), T2('Close the Parliament', 'संसद बंद करना'), T2('Nothing at all', 'कुछ नहीं')], 0, T2('The gap is the fiscal deficit, covered by borrowing.', 'यह अंतर राजकोषीय घाटा है, जिसे उधार से पूरा किया जाता है।')),
    ],
  };

  // ================================================================ icons (48 x 48)
  const ICONS = {
    dome: '<path d="M7 40h34M10 40V26M18 40V26M26 40V26M34 40V26M8 26h34M12 26c0-8 5-12 11-12s11 4 11 12" /><path d="M23 14V8M23 8l6 2-6 2" />',
    pillars: '<path d="M6 40h36M8 14l16-8 16 8zM12 18v18M20 18v18M28 18v18M36 18v18"/>',
    scales: '<path d="M24 8v30M14 40h20M10 14h28M10 14l-5 12h10zM38 14l-5 12h10z"/>',
    flag: '<path d="M12 6v38"/><path d="M12 8h26v22H12z" fill="#fff" fill-opacity=".15"/><path d="M12 8h26v7H12z" fill="#FF7A1A" stroke="none"/><path d="M12 23h26v7H12z" fill="#22C55E" stroke="none"/><circle cx="25" cy="19" r="2.6" stroke="#1D4ED8"/>',
    house: '<path d="M6 24 24 8l18 16M11 21v19h26V21M20 40V28h8v12"/>',
    overlap: '<circle cx="18" cy="24" r="12"/><circle cx="30" cy="24" r="12"/>',
    equal: '<circle cx="24" cy="24" r="17"/><path d="M15 20h18M15 28h18"/>',
    bird: '<path d="M6 28c8 2 12-2 14-8 2 6 8 8 14 6-3 5-8 8-14 8-6 0-11-2-14-6zM34 26l8-8"/>',
    chain: '<rect x="6" y="18" width="16" height="12" rx="6"/><rect x="26" y="18" width="16" height="12" rx="6"/><path d="M24 10l-2 6M24 38l2-6" />',
    sun: '<circle cx="24" cy="24" r="8"/><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10 10l4 4M34 34l4 4M38 10l-4 4M14 34l-4 4"/>',
    book: '<path d="M24 12c-4-3-10-4-17-3v26c7-1 13 0 17 3 4-3 10-4 17-3V9c-7-1-13 0-17 3zM24 12v26"/>',
    gavel: '<path d="M10 40h22M26 8l10 10-6 6-10-10zM22 22l-12 12"/><path d="M14 30l6 6"/>',
  };
  const icon = (n, col, size) => `<svg class="gv-ic" viewBox="0 0 48 48" width="${size || 40}" height="${size || 40}" fill="none" stroke="${col || 'currentColor'}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[n]}</svg>`;
  const chakra = (() => {
    let s = '<circle cx="24" cy="24" r="21" fill="none" stroke="#fff" stroke-width="2.4"/><circle cx="24" cy="24" r="3" fill="#fff"/>';
    for (let i = 0; i < 24; i++) { const a = (i * Math.PI) / 12; s += `<line x1="${24 + 4 * Math.cos(a)}" y1="${24 + 4 * Math.sin(a)}" x2="${24 + 20 * Math.cos(a)}" y2="${24 + 20 * Math.sin(a)}" stroke="#fff" stroke-width="1.2"/>`; }
    return `<svg class="gv-chakra" viewBox="0 0 48 48" width="46" height="46" aria-hidden="true" focusable="false">${s}</svg>`;
  })();

  // ================================================================ css
  const CSS = `
.gv{--gv-navy:#1E3A8A;font-family:var(--font-body,system-ui,sans-serif);color:var(--ink,#1E293B);display:grid;gap:12px;width:100%;max-width:1100px;margin:0 auto;box-sizing:border-box}
.gv *{box-sizing:border-box}
.gv button{font:inherit;cursor:pointer;min-height:44px;touch-action:manipulation}
.gv button:focus-visible{outline:3px solid var(--cyan,#02CFF9);outline-offset:2px}
.gv-head{display:flex;gap:12px;align-items:center;padding:14px 16px 18px;border-radius:18px;background:linear-gradient(120deg,#1E3A8A,#2563EB 62%,#8B3DFF);color:#fff;position:relative;overflow:hidden;box-shadow:0 6px 18px rgba(30,58,138,.28)}
.gv-head::after{content:"";position:absolute;left:0;right:0;bottom:0;height:6px;background:linear-gradient(90deg,#FF7A1A 33.3%,#fff 33.3% 66.6%,#22C55E 66.6%)}
.gv-chakra{flex:none;animation:gv-spin 40s linear infinite}
@keyframes gv-spin{to{transform:rotate(360deg)}}
.gv-head h2{margin:0;font-family:var(--font-display,inherit);font-size:1.3rem;line-height:1.2;color:#fff}
.gv-head p{margin:3px 0 0;font-size:.95rem;opacity:.95;line-height:1.4}
.gv-stage{display:grid;gap:12px}
.gv-card{background:var(--surface,#fff);border:1px solid var(--line,#D8DFEC);border-radius:16px;padding:14px;box-shadow:0 2px 8px rgba(30,58,138,.07)}
.gv-card h3{margin:0 0 8px;font-family:var(--font-display,inherit);font-size:1.05rem}
.gv-two{display:grid;gap:12px;grid-template-columns:1fr}
@media(min-width:760px){.gv-two{grid-template-columns:1fr 1fr}.gv-two.gv-wide{grid-template-columns:5fr 4fr}}
.gv-btn{border:0;border-radius:14px;padding:10px 18px;font-weight:700;background:var(--action,#2563EB);color:#fff;box-shadow:0 3px 0 rgba(0,0,0,.2);transition:transform .15s}
.gv-btn:hover:not(:disabled){transform:translateY(-1px)}
.gv-btn:active:not(:disabled){transform:translateY(2px);box-shadow:none}
.gv-btn:disabled,.gv-btn[aria-disabled="true"]{background:#94A3B8;box-shadow:none;cursor:not-allowed}
.gv-btn.gv-alt{background:var(--sun,#FFD23F);color:#1E293B}
.gv-btn.gv-ghost{background:var(--sunk,#EEF2F9);color:var(--ink,#1E293B);box-shadow:none;border:1px solid var(--line,#D8DFEC)}
.gv-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.gv-live{min-height:44px;display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:14px;background:var(--royal-t,#E8EEFF);border:1px solid var(--line,#D8DFEC);font-weight:600;line-height:1.4}
.gv-live.gv-good{background:var(--good-t,#DDF7F0)}.gv-live.gv-bad{background:var(--bad-t,#FFE8E5)}
/* election */
.gv-evm{background:linear-gradient(#CFD6E2,#B9C2D2);border-radius:16px;padding:12px;border:2px solid #8C97AB;box-shadow:inset 0 2px 0 rgba(255,255,255,.6),0 6px 14px rgba(15,23,42,.18);color:#1E293B}
.gv-evm h3{color:#1E293B}
.gv-erow{display:grid;grid-template-columns:26px 1fr 22px 56px;gap:8px;align-items:center;background:#F8FAFC;border-radius:10px;padding:6px 8px;margin-bottom:6px;border:1px solid #A5AFC2}
.gv-erow .gv-no{font-weight:800;color:#475569;text-align:center}
.gv-erow b{display:block;line-height:1.2}.gv-erow small{color:#475569}
.gv-who{display:flex;align-items:center;gap:8px;min-width:0}
.gv-who>span{min-width:0}
.gv-sym{width:30px;height:30px;flex:none;background:#fff;border-radius:6px;border:1px solid #CBD5E1;padding:2px}
.gv-lamp{width:18px;height:18px;border-radius:50%;background:#7F1D1D;border:2px solid #450A0A}
.gv-lamp.gv-on{background:#FF2D2D;box-shadow:0 0 12px 3px rgba(255,45,45,.8);animation:gv-blink 1s ease-out}
@keyframes gv-blink{0%{opacity:.2}30%{opacity:1}}
.gv-vbtn{width:56px;height:44px;border-radius:22px;border:0;background:linear-gradient(#3B82F6,#1D4ED8);box-shadow:0 3px 0 #1E3A8A;color:#fff;font-weight:800}
.gv-vbtn:disabled{background:#64748B;box-shadow:none;cursor:not-allowed}
.gv-slip{margin-top:8px;display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:#FFFEF3;border:1px dashed #94A3B8;transition:transform 1.2s ease-in,opacity 1.2s}
.gv-slip.gv-gone{transform:translateY(40px);opacity:0}
.gv-bars{display:grid;gap:8px;position:relative}
.gv-bar{display:grid;grid-template-columns:minmax(90px,1.1fr) 3fr;gap:8px;align-items:center}
.gv-bar .gv-track{height:28px;border-radius:8px;background:var(--sunk,#EEF2F9);position:relative;overflow:hidden;border:1px solid var(--line,#D8DFEC)}
.gv-bar .gv-fill{height:100%;border-radius:7px;min-width:2px;display:flex;align-items:center;justify-content:flex-end;padding:0 8px;font-weight:800;font-size:.85rem;white-space:nowrap}
.gv-bar .gv-nm{font-weight:700;line-height:1.2;font-size:.92rem}
.gv-win{outline:3px solid var(--sun,#FFD23F);border-radius:10px;background:var(--sun-t,#FFF6D2);padding:2px}
.gv-half{position:absolute;right:0;top:-4px;bottom:-4px;width:0;border-left:2px dashed var(--bad,#DC2626);pointer-events:none}
.gv-half i{position:absolute;top:-16px;right:4px;font-size:.7rem;font-style:normal;white-space:nowrap;color:var(--bad,#DC2626);font-weight:700}
.gv-table{width:100%;border-collapse:collapse;font-size:.92rem}
.gv-table th,.gv-table td{padding:6px 8px;border-bottom:1px solid var(--line,#D8DFEC);text-align:left}
.gv-seat{display:inline-block;width:14px;height:14px;border-radius:4px;margin:1px}
/* sorting */
.gv-cols{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr))}
.gv-col{border-radius:16px;padding:0;border:2px solid transparent;text-align:left;display:flex;flex-direction:column;gap:0;background:var(--surface,#fff);overflow:hidden;color:var(--ink,#1E293B);box-shadow:0 2px 8px rgba(30,58,138,.1);transition:transform .15s,box-shadow .15s}
.gv-col.gv-hot{transform:translateY(-2px);box-shadow:0 8px 20px rgba(30,58,138,.28);border-color:var(--sun,#FFD23F)}
.gv-colhead{display:flex;align-items:center;gap:10px;padding:10px 12px;min-height:56px;width:100%}
.gv-colhead b{display:block;font-family:var(--font-display,inherit);line-height:1.15}.gv-colhead small{opacity:.92;font-size:.82rem;line-height:1.25;display:block}
.gv-colbody{padding:8px 10px 10px;display:flex;flex-wrap:wrap;gap:6px;align-content:flex-start;width:100%;background:var(--sunk,#EEF2F9)}
.gv-colbody:empty{display:none}
.gv-many{grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))}
.gv-many .gv-colhead{padding:8px 8px;gap:6px;min-height:64px}.gv-many .gv-colhead b{font-size:.88rem}
.gv-chip{padding:5px 9px;border-radius:10px;font-size:.84rem;line-height:1.25;font-weight:600;animation:gv-pop .3s ease-out;text-align:left}
@keyframes gv-pop{from{transform:scale(.7);opacity:0}}
.gv-tray{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr))}
.gv-item{text-align:left;padding:10px 12px;border-radius:14px;background:var(--surface,#fff);border:2px solid var(--line,#D8DFEC);color:var(--ink,#1E293B);font-weight:600;line-height:1.35;box-shadow:0 2px 0 var(--line,#D8DFEC);transition:transform .15s,border-color .15s;min-height:56px}
.gv-item:hover{border-color:var(--royal,#1D4ED8)}
.gv-item[aria-pressed="true"]{border-color:var(--grape,#8B3DFF);background:var(--grape-t,#F0E8FF);transform:translateY(-2px) scale(1.02);box-shadow:0 6px 14px rgba(139,61,255,.25)}
.gv-item.gv-shake{animation:gv-shake .4s}
@keyframes gv-shake{25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}
.gv-prog{height:10px;border-radius:99px;background:var(--sunk,#EEF2F9);overflow:hidden;border:1px solid var(--line,#D8DFEC)}
.gv-prog i{display:block;height:100%;background:linear-gradient(90deg,#FF7A1A,#FFD23F,#22C55E);transition:width .5s}
/* process */
.gv-flow{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.gv-stg{display:grid;grid-template-columns:36px 1fr;gap:10px;align-items:center;width:100%;text-align:left;padding:8px 12px;border-radius:14px;border:2px solid var(--line,#D8DFEC);background:var(--surface,#fff);color:var(--ink,#1E293B);position:relative}
.gv-stg .gv-n{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:800;background:var(--sunk,#EEF2F9);border:2px solid var(--line,#D8DFEC);color:var(--ink-2,#475569)}
.gv-stg.gv-done{background:var(--good-t,#DDF7F0);border-color:var(--good,#0F766E)}
.gv-stg.gv-done .gv-n{background:var(--good,#0F766E);border-color:var(--good,#0F766E);color:#fff}
.gv-stg.gv-now{border-color:var(--action,#2563EB);box-shadow:0 0 0 4px rgba(37,99,235,.2);animation:gv-pulse 1.8s ease-in-out infinite}
.gv-stg.gv-now .gv-n{background:var(--action,#2563EB);border-color:var(--action,#2563EB);color:#fff}
.gv-stg.gv-late{opacity:.62}
.gv-stg.gv-fail{border-color:var(--bad,#DC2626);background:var(--bad-t,#FFE8E5)}
.gv-stg small{display:block;color:var(--ink-2,#475569);font-weight:500}
@keyframes gv-pulse{50%{box-shadow:0 0 0 8px rgba(37,99,235,.08)}}
.gv-vote{display:grid;gap:8px}
.gv-vbar{position:relative;height:34px;border-radius:10px;overflow:hidden;display:flex;background:var(--sunk,#EEF2F9);border:1px solid var(--line,#D8DFEC)}
.gv-vbar span{display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:.9rem;overflow:hidden;white-space:nowrap}
.gv-need{position:absolute;top:-2px;bottom:-2px;width:0;border-left:3px solid #1E293B;z-index:2}
.gv-need::after{content:attr(data-l);position:absolute;top:100%;left:4px;font-size:.72rem;font-weight:700;white-space:nowrap;color:var(--ink,#1E293B)}
.gv-slide{display:grid;grid-template-columns:minmax(120px,1fr) 2fr 54px;gap:8px;align-items:center;font-weight:600}
.gv-slide input{width:100%;min-height:44px;accent-color:#2563EB}
.gv-slide output{font-weight:800;text-align:right}
.gv-seal{display:inline-block;padding:2px 10px;border-radius:99px;font-weight:800;font-size:.85rem}
/* panchayat */
.gv-tier{display:block;width:100%;text-align:center;padding:10px 12px;border:2px solid transparent;color:#fff;font-weight:700;line-height:1.25;margin:0 auto;box-shadow:0 3px 0 rgba(0,0,0,.18);transition:transform .15s}
.gv-tier small{display:block;font-weight:500;opacity:.95}
.gv-tier[aria-pressed="true"]{border-color:var(--sun,#FFD23F);transform:scale(1.03)}
.gv-ward{display:grid;place-items:center;gap:2px;padding:6px 2px;border-radius:12px;border:2px solid var(--line,#D8DFEC);background:var(--surface,#fff);font-weight:700;font-size:.78rem;transition:background .4s,transform .4s}
.gv-ward.gv-res{background:#FFD6E8;border-color:#D6336C;transform:translateY(-3px);color:#1E293B}
.gv-wards{display:grid;grid-template-columns:repeat(auto-fill,minmax(54px,1fr));gap:6px}
/* quiz */
.gv-quiz{border-left:6px solid var(--grape,#8B3DFF)}
.gv-opts{display:grid;gap:8px;margin-top:8px}
.gv-opt{text-align:left;padding:10px 14px;border-radius:12px;border:2px solid var(--line,#D8DFEC);background:var(--surface,#fff);color:var(--ink,#1E293B);font-weight:600;line-height:1.35}
.gv-opt:hover:not(:disabled){border-color:var(--royal,#1D4ED8)}
.gv-opt.gv-ok{border-color:var(--good,#0F766E);background:var(--good-t,#DDF7F0)}
.gv-opt.gv-no{border-color:var(--bad,#DC2626);background:var(--bad-t,#FFE8E5)}
.gv-note{font-size:.88rem;color:var(--ink-2,#475569);line-height:1.45}
.gv-ic{flex:none}
@media(max-width:480px){.gv-head h2{font-size:1.1rem}.gv-bar{grid-template-columns:1fr}.gv-slide{grid-template-columns:1fr 54px}.gv-slide input{grid-column:1/3}.gv-erow{grid-template-columns:22px 1fr 18px 54px;gap:6px}}
@media(prefers-reduced-motion:reduce){.gv *{animation:none!important;transition:none!important}}
`;

  // ================================================================ mount
  function mount(root, config, api) {
    const mode = config.mode;
    const o = config.options || {};
    const E = eOpts(o);
    const stop = [];
    let timers = [];
    let langSeen = api.lang();
    const t = (x) => esc(api.t(x));
    const tr = (x) => api.t(x);
    const st = { qi: (o.question || 0), picked: null, ans: null, live: '', livecls: '', busy: false };
    const quiz = QS[mode];
    const sort = SORT[mode];
    // election
    Object.assign(st, { voted: null, slipGone: false, count: null, cntk: 0 });
    // sorting
    Object.assign(st, { placed: {}, tries: {}, shake: null, hot: null });
    // process
    let stages = null;
    if (mode === 'law-making' || mode === 'budget-session') {
      stages = stagesFor(mode, o.bill || 'ordinary');
      Object.assign(st, { idx: 0, view: 0, failed: null, votes: {}, joint: false, special: mode === 'law-making' && o.bill === 'amendment' });
      st.ls = o.supportLs != null ? o.supportLs : mode === 'budget-session' ? (o.support != null ? o.support : 58) : 62;
      st.rs = o.supportRs != null ? o.supportRs : 45;
      st.spend = Object.assign({}, DEF_SPEND, o.spend || {});
      st.budget = null;
    }
    // panchayat
    Object.assign(st, { tier: 'gram-panchayat', draws: 0 });
    const wards = o.wards || 12;
    const reservedCount = Math.ceil(wards / 3);
    const reservedSet = () => { const s = new Set(); if (!st.draws) return s; const start = ((st.draws - 1) * reservedCount) % wards; for (let j = 0; j < reservedCount; j++) s.add((start + j) % wards); return s; };

    const live = (text, cls) => { st.live = text; st.livecls = cls || ''; const el = root.querySelector('.gv-live'); if (el) { el.className = 'gv-live ' + (cls || ''); el.querySelector('span').textContent = text; } };
    const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
    const run = (ms, step, done) => { st.busy = true; const s = tween(ms, step, () => { st.busy = false; if (done) done(); }); stop.push(s); };

    // ------------------------------------------------ election
    function electionHTML() {
      const rows = E.cands.concat(E.nota ? ['nota'] : []).map((id, i) => {
        const c = id === 'nota' ? NOTA : CANDS[id];
        const on = st.voted === id;
        return `<div class="gv-erow"><span class="gv-no">${i + 1}</span><span class="gv-who">${symSvg(c.sym, c.c)}<span><b>${t(c.n)}</b><small>${t(c.p)}</small></span></span><span class="gv-lamp${on ? ' gv-on' : ''}" aria-hidden="true"></span><button class="gv-vbtn" data-key="vote:${id}" aria-label="${esc(tr(T2('Vote for ', 'वोट दें: ')) + tr(c.n))}"${st.voted ? ' disabled' : ''}>${on ? '✔' : ''}</button></div>`;
      }).join('');
      let slip = '';
      if (st.voted) {
        const c = st.voted === 'nota' ? NOTA : CANDS[st.voted];
        slip = `<div class="gv-slip${st.slipGone ? ' gv-gone' : ''}">${symSvg(c.sym, c.c)}<span><b>${i18n('VVPAT slip', 'वीवीपैट पर्ची')}</b><br><small>${t(c.n)}, ${t(c.p)}</small></span></div>`;
      }
      const res = resultHTML(st.count ? st.cntk : 0);
      return `<div class="gv-two"><section class="gv-evm" aria-label="${i18n('Electronic voting machine', 'इलेक्ट्रॉनिक वोटिंग मशीन')}"><h3>${i18n('Your ballot: press the blue button next to your choice', 'आपका मतपत्र: अपनी पसंद के आगे का नीला बटन दबाओ')}</h3>${rows}${slip}</section>
      <section class="gv-card"><h3>${i18n('Counting day', 'मतगणना का दिन')}</h3><div class="gv-row"><button class="gv-btn" data-key="play"${st.busy ? ' disabled' : ''}>${i18n('Count the votes', 'वोटों की गिनती करो')}</button><span class="gv-note">${i18n(`${E.voters} voters on the list, about ${E.turnout}% will vote.`, `सूची में ${E.voters} मतदाता, लगभग ${E.turnout}% वोट डालेंगे।`)}</span></div><div class="gv-res" style="margin-top:12px">${res}</div></section></div>`;
    }
    function resultHTML(k) {
      const ids = E.cands.concat(E.nota ? ['nota'] : []);
      const r = st.count;
      const P = r ? r.polled : Math.max(2, Math.round((E.voters * E.turnout) / 100));
      if (!r) return `<p class="gv-note">${i18n('Nothing is counted yet. Cast your vote on the machine first, then count.', 'अभी कुछ गिना नहीं गया। पहले मशीन पर वोट डालो, फिर गिनती करो।')}</p>`;
      const done = k >= 1;
      const bars = ids.map((id) => {
        const c = id === 'nota' ? NOTA : CANDS[id];
        const v = Math.floor(r.votes[id] * k);
        const w = Math.max(0, (v / P) * 100);
        const win = done && id === r.winner;
        const fg = ['#FF7A1A', '#14B8A6', '#22C55E', '#FFD23F'].includes(c.c) ? '#1E293B' : '#fff';
        return `<div class="gv-bar${win ? ' gv-win' : ''}"><span class="gv-nm">${win ? '★ ' : ''}${t(c.n)}</span><span class="gv-track"><span class="gv-fill" style="width:${w}%;background:${c.c};color:${fg}">${v}</span></span></div>`;
      }).join('');
      const round = Math.min(5, Math.max(1, Math.ceil(k * 5)));
      let tail = `<p class="gv-note">${done ? i18n(`${P} votes counted.`, `${P} वोट गिने गए।`) : i18n(`Counting round ${round} of 5...`, `गिनती का दौर ${round} / 5...`)}</p>`;
      if (done) {
        const w = CANDS[r.winner];
        if (r.tie) tail += `<p class="gv-live gv-bad" style="display:block">${i18n('Tie! The returning officer decides by drawing lots.', 'बराबरी! रिटर्निंग ऑफ़िसर पर्ची डालकर फ़ैसला करता है।')}</p>`;
        else tail += `<p><b>${t(w.n)}</b> (${t(w.p)}) ${i18n(`wins by ${r.margin} votes with ${r.pct}% of the votes.`, `ने ${r.margin} वोट से जीत हासिल की, ${r.pct}% वोट के साथ।`)} ${r.belowHalf ? i18n('That is less than half of the votes, but the most votes wins: first past the post.', 'यह आधे से कम वोट है, पर सबसे अधिक वोट वाला जीतता है: सर्वाधिक वोट प्रणाली।') : i18n('That is more than half of the votes.', 'यह आधे से अधिक वोट है।')}</p>`;
        if (r.seats) {
          const seats = E.cands.map((id) => { const c = CANDS[id]; return `<tr><td>${t(c.p)}</td><td>${Math.round((r.votes[id] * 1000) / r.valid) / 10}%</td><td><b>${r.seats[id]}</b> ${Array.from({ length: r.seats[id] }, () => `<span class="gv-seat" style="background:${c.c}"></span>`).join('')}</td></tr>`; }).join('');
          tail += `<table class="gv-table"><caption class="gv-note" style="text-align:left">${i18n(`Proportional representation: ${E.seats} seats shared by vote share`, `समानुपातिक प्रतिनिधित्व: ${E.seats} सीटें वोट-प्रतिशत के अनुसार बँटीं`)}</caption><thead><tr><th>${i18n('Party', 'दल')}</th><th>${i18n('Votes', 'वोट')}</th><th>${i18n('Seats', 'सीटें')}</th></tr></thead><tbody>${seats}</tbody></table>`;
        }
      }
      return `<div class="gv-bars">${bars}</div>${tail}`;
    }
    function vote(id) {
      if (st.voted) { api.toast(T2('One person, one vote: your vote is already cast.', 'एक व्यक्ति, एक वोट: आपका वोट पड़ चुका है।')); return; }
      st.voted = id; st.slipGone = false;
      const c = id === 'nota' ? NOTA : CANDS[id];
      live(tr(T2('Beep! Your vote for ', 'बीप! आपका वोट: ')) + tr(c.n) + tr(T2('. The slip shows for seven seconds.', '। पर्ची सात सेकंड दिखती है।')), 'gv-good');
      api.record(tr(T2('Voted for ', 'वोट दिया: ')) + tr(c.n));
      render();
      api.emit('voted:' + id);
      later(() => { st.slipGone = true; const s = root.querySelector('.gv-slip'); if (s) s.classList.add('gv-gone'); }, 7000);
    }
    function countVotes() {
      if (st.busy) return;
      if (!st.voted) { api.toast(T2('Cast your vote first.', 'पहले अपना वोट डालो।')); return; }
      if (st.count && st.cntk >= 1) { api.toast(T2('The votes are already counted.', 'वोटों की गिनती हो चुकी है।')); return; }
      st.count = electionCount(o, st.voted); st.cntk = 0;
      render();
      live(tr(T2('The counting has begun...', 'गिनती शुरू हुई...')), '');
      run(3600, (k) => { st.cntk = k; const el = root.querySelector('.gv-res'); if (el) el.innerHTML = resultHTML(k); }, () => {
        st.cntk = 1; const el = root.querySelector('.gv-res'); if (el) el.innerHTML = resultHTML(1);
        const r = st.count, w = CANDS[r.winner];
        live(r.tie ? tr(T2('A tie! Lots will be drawn.', 'बराबरी! पर्ची डाली जाएगी।')) : tr(w.n) + tr(T2(' wins the seat.', ' ने सीट जीती।')), 'gv-good');
        api.record(tr(T2('Counted the votes. Winner: ', 'गिनती की। विजेता: ')) + tr(w.n));
        api.emit('counted'); api.celebrate();
      });
    }

    // ------------------------------------------------ sorting
    function cardsList() { const ids = o.cards; return ids ? sort.cards.filter((c) => ids.includes(c.id)) : sort.cards; }
    function sortHTML() {
      const cards = cardsList();
      const done = cards.filter((c) => st.placed[c.id]).length;
      const cols = sort.cols.map((col, i) => {
        const [bg, fg] = COL_STYLE[i % COL_STYLE.length];
        const mine = cards.filter((c) => st.placed[c.id] && c.col === col.id).map((c) => `<span class="gv-chip" style="background:${bg};color:${fg}">${t(c.t)}</span>`).join('');
        return `<button class="gv-col${st.hot === col.id ? ' gv-hot' : ''}" data-key="stage:${col.id}" data-col="${col.id}" aria-label="${esc(tr(col.n) + '. ' + tr(col.s))}"><span class="gv-colhead" style="background:${bg};color:${fg}">${icon(col.ic, fg, 38)}<span><b>${t(col.n)}</b><small>${t(col.s)}</small></span></span><span class="gv-colbody" aria-hidden="false">${mine}</span></button>`;
      }).join('');
      const tray = cards.filter((c) => !st.placed[c.id]).map((c) => `<button class="gv-item${st.shake === c.id ? ' gv-shake' : ''}" data-key="card:${c.id}" draggable="true" aria-pressed="${st.picked === c.id}">${t(c.t)}</button>`).join('');
      return `<section class="gv-card"><h3>${t(sort.title)}</h3><p class="gv-note" style="margin:0 0 10px">${t(sort.intro)}</p><div class="gv-prog" role="progressbar" aria-valuemin="0" aria-valuemax="${cards.length}" aria-valuenow="${done}"><i style="width:${(done / cards.length) * 100}%"></i></div><p class="gv-note" style="margin:4px 0 10px">${done} / ${cards.length} ${i18n('sorted', 'छाँटे गए')}</p>
      <div class="gv-cols${sort.cols.length > 3 ? ' gv-many' : ''}" role="group" aria-label="${i18n('Where does it belong?', 'यह कहाँ आता है?')}">${cols}</div></section>
      <section class="gv-card"><h3>${i18n('Pick one and place it', 'एक चुनो और रखो')}</h3>${tray ? `<div class="gv-tray">${tray}</div>` : `<p><b>${i18n('All sorted. Well done!', 'सब छँट गया। शाबाश!')}</b></p><button class="gv-btn gv-ghost" data-key="reset">${i18n('Start again', 'फिर से शुरू करो')}</button>`}</section>`;
    }
    function place(colId) {
      const cards = cardsList();
      if (!st.picked) { api.toast(T2('Tap a card first, then the box it belongs in.', 'पहले कोई कार्ड छुओ, फिर वह डिब्बा जिसमें वह आता है।')); return; }
      const c = cards.find((x) => x.id === st.picked);
      if (!c) return;
      const col = sort.cols.find((x) => x.id === colId);
      if (c.col === colId) {
        st.placed[c.id] = colId; st.picked = null; st.hot = colId;
        live(tr(T2('Correct! ', 'सही! ')) + tr(c.why), 'gv-good');
        api.record(tr(c.t) + ' → ' + tr(col.n));
        render();
        later(() => { st.hot = null; const e = root.querySelector('.gv-col.gv-hot'); if (e) e.classList.remove('gv-hot'); }, 700);
        api.emit('placed'); api.emit('answered:right');
        if (cards.every((x) => st.placed[x.id])) { api.celebrate(); api.speak(tr(T2('All sorted!', 'सब छँट गया!'))); }
      } else {
        st.tries[c.id] = (st.tries[c.id] || 0) + 1;
        st.shake = c.id;
        live(st.tries[c.id] >= 2 ? tr(T2('Not there. ', 'यहाँ नहीं। ')) + tr(c.why) : tr(T2('Not quite. It does not belong with ', 'ठीक नहीं। यह नहीं आता: ')) + tr(col.n) + tr(T2('. Think about who does this job and try again.', '। सोचो यह काम कौन करता है, और फिर कोशिश करो।')), 'gv-bad');
        render();
        later(() => { st.shake = null; }, 500);
        api.emit('answered:wrong');
      }
    }

    // ------------------------------------------------ process
    const cur = () => stages[st.idx];
    function stageById(id) { return stages.find((s) => s.id === id); }
    function processHTML() {
      const list = stages.map((s, i) => {
        const cls = i < st.idx ? 'gv-done' : i === st.idx ? (st.failed === s.id ? 'gv-now gv-fail' : 'gv-now') : 'gv-late';
        const mark = i < st.idx ? '✔' : String(i + 1);
        return `<li><button class="gv-stg ${cls}" data-key="stage:${s.id}" aria-current="${i === st.idx ? 'step' : 'false'}"><span class="gv-n" aria-hidden="true">${mark}</span><span><b>${t(s.t)}</b><small>${t(HOUSE[s.house] ? HOUSE[s.house][1] : s.house === 'pres' ? T2('President', 'राष्ट्रपति') : '')}</small></span></button></li>`;
      }).join('');
      const s = stages[Math.min(st.view, stages.length - 1)];
      const detail = detailHTML(s);
      return `<div class="gv-two gv-wide"><section class="gv-card"><h3>${mode === 'law-making' ? i18n('A bill’s journey', 'विधेयक की यात्रा') : i18n('The Budget’s journey', 'बजट की यात्रा')}</h3><ol class="gv-flow">${list}</ol></section><section class="gv-card">${detail}</section></div>`;
    }
    function slider(id, label, val) {
      return `<label class="gv-slide"><span>${label}</span><input type="range" min="0" max="100" step="1" value="${val}" data-key="slider:${id}" aria-label="${esc(typeof label === 'string' ? label.replace(/<[^>]+>/g, '') : id)}"><output>${val}%</output></label>`;
    }
    function detailHTML(s) {
      let h = `<h3>${t(s.t)}</h3><p>${t(s.d)}</p>`;
      const isCur = stages[st.idx] === s;
      if (mode === 'budget-session' && s.id === 'present') h += budgetHTML(isCur && !st.budget);
      if (s.kind === 'vote') {
        const v = st.votes[s.id];
        const house = s.house;
        const hasSl = house === 'ls' || house === 'rs';
        if (isCur && hasSl && !st.busy) {
          h += slider(house, `${i18n('Members who support it in', 'इस सदन में समर्थन करने वाले')} ${t(HOUSE[house][1])}`, house === 'ls' ? st.ls : st.rs);
          h += `<p class="gv-note">${i18n('Move the slider to change how many members vote yes.', 'स्लाइडर हिलाकर बदलो कि कितने सदस्य हाँ कहें।')}</p>`;
        }
        if (v) h += voteBarHTML(v, house, v.k);
        else {
          const sp = voteResult(house, house === 'ls' ? st.ls : house === 'rs' ? st.rs : 50, st.special);
          h += `<p class="gv-note">${i18n(`${HOUSE[house][0]} members. At least ${sp.need} yes votes are needed.`, `${HOUSE[house][0]} सदस्य। पास होने के लिए कम से कम ${sp.need} हाँ चाहिए।`)}</p>`;
        }
      }
      if (isCur && s.kind !== 'final') h += `<div class="gv-row" style="margin-top:12px"><button class="gv-btn" data-key="play"${st.busy ? ' disabled' : ''}>${playLabel(s)}</button>${st.failed ? `<button class="gv-btn gv-ghost" data-key="reset">${i18n('Start again', 'फिर से शुरू करो')}</button>` : ''}</div>`;
      if (s.kind === 'final' && st.idx >= stages.length - 1 && st.finished) h += `<div class="gv-row" style="margin-top:12px"><button class="gv-btn gv-ghost" data-key="reset">${i18n('Start again', 'फिर से शुरू करो')}</button></div>`;
      return h;
    }
    function playLabel(s) {
      if (s.kind === 'vote') return tr(T2('Hold the vote', 'मतदान कराओ'));
      if (s.id === 'present') return tr(T2('Present the Budget', 'बजट पेश करो'));
      if (s.id === 'assent') return tr(T2('Ask for the President’s signature', 'राष्ट्रपति के हस्ताक्षर माँगो'));
      return tr(T2('Go to the next step', 'अगले चरण पर चलो'));
    }
    function voteBarHTML(v, house, k) {
      const total = v.total, y = Math.round(v.yes * k), n = Math.round(v.no * k);
      const kk = Math.min(1, k);
      return `<div class="gv-vote" style="margin-top:6px"><div class="gv-vbar" role="img" aria-label="${esc(`${tr(T2('Yes', 'हाँ'))} ${v.yes}, ${tr(T2('No', 'न'))} ${v.no}`)}"><span style="width:${(y / total) * 100}%;background:#0F766E">${y ? y : ''}</span><span style="width:${(n / total) * 100}%;background:#B91C1C">${n ? n : ''}</span><i class="gv-need" style="left:${(v.need / total) * 100}%" data-l="${esc(tr(T2('needed ', 'ज़रूरी ')) + v.need)}"></i></div><p class="gv-note" style="margin-top:14px">${kk >= 1 ? `<span class="gv-seal" style="background:${v.pass ? '#0F766E' : '#B91C1C'};color:#fff">${v.pass ? i18n('PASSED', 'पास') : i18n('REJECTED', 'अस्वीकृत')}</span> ${i18n(`Yes ${v.yes}, No ${v.no}. Needed ${v.need}.`, `हाँ ${v.yes}, न ${v.no}। ज़रूरी ${v.need}।`)}` : ''}</p></div>`;
    }
    function budgetHTML(editable) {
      const f = budgetFigures(st.spend);
      const rows = Object.keys(HEADS).map((k) => `<label class="gv-slide"><span>${t(HEADS[k])}</span><input type="range" min="0" max="${SPEND_MAX}" step="1" value="${st.spend[k]}" data-key="slider:${k}" aria-label="${esc(tr(HEADS[k]))}"${editable ? '' : ' disabled'}><output>${st.spend[k]}</output></label>`).join('');
      return `<div style="margin-top:8px"><p class="gv-note">${i18n('A make-believe country. It will earn 100 units this year. Interest and salaries (20 units) are fixed. Plan the rest.', 'एक काल्पनिक देश। इस वर्ष वह 100 इकाई कमाएगा। ब्याज और वेतन (20 इकाई) तय हैं। बाक़ी की योजना बनाओ।')}</p>${rows}<p id="gv-budgetline" class="gv-live ${f.gap > 0 ? 'gv-bad' : 'gv-good'}"><span>${budgetLine(f)}</span></p></div>`;
    }
    function budgetLine(f) {
      return f.gap > 0 ? tr(T2(`Spending ${f.total} is more than earnings 100: a deficit of ${f.gap}. The government must borrow ${f.gap}.`, `ख़र्च ${f.total}, कमाई 100 से अधिक: घाटा ${f.gap}। सरकार को ${f.gap} उधार लेना होगा।`))
        : f.gap < 0 ? tr(T2(`Spending ${f.total} is less than earnings 100: a surplus of ${-f.gap}.`, `ख़र्च ${f.total}, कमाई 100 से कम: बचत ${-f.gap}।`))
          : tr(T2('Spending equals earnings: a balanced budget.', 'ख़र्च और कमाई बराबर: संतुलित बजट।'));
    }
    function advance() {
      const s = cur();
      api.emit('advanced:' + s.id);
      api.record(tr(s.t));
      st.idx++; st.view = Math.min(st.idx, stages.length - 1); st.failed = null;
      if (st.idx >= stages.length - 1 && stages[stages.length - 1].kind === 'final') { st.finished = true; }
      live(tr(s.t) + tr(T2(' is done.', ' पूरा हुआ।')), 'gv-good');
      if (stages[st.idx] && stages[st.idx].kind === 'final') { live(tr(stages[st.idx].t) + '!', 'gv-good'); api.celebrate(); }
      render();
    }
    function doVote() {
      const s = cur();
      const house = s.house;
      const r = voteResult(house, house === 'ls' ? st.ls : house === 'rs' ? st.rs : 0, st.special);
      if (house === 'joint') {
        const lsY = voteResult('ls', st.ls, false).yes, rsY = voteResult('rs', st.rs, false).yes;
        r.yes = lsY + rsY; r.no = r.total - r.yes; r.pass = r.yes >= r.need;
      }
      r.k = 0; st.votes[s.id] = r;
      render();
      run(1500, (k) => { r.k = k; const el = root.querySelector('.gv-vote'); if (el) { const tmp = document.createElement('div'); tmp.innerHTML = voteBarHTML(r, house, k); el.replaceWith(tmp.firstChild); } }, () => {
        r.k = 1;
        if (r.pass) {
          api.emit('passed'); live(tr(s.t) + ': ' + tr(T2('passed', 'पास')) + ` (${r.yes}–${r.no})`, 'gv-good');
          advance();
        } else {
          st.failed = s.id; delete st.votes[s.id];
          api.emit('rejected');
          let msg = tr(s.t) + ': ' + tr(T2('rejected', 'अस्वीकृत')) + ` (${r.yes}–${r.no}, ${tr(T2('needed', 'ज़रूरी'))} ${r.need}). `;
          if (mode === 'budget-session' && house === 'ls' && s.id !== 'demands') msg += tr(T2('A Money Bill defeated in the Lok Sabha means the government has lost its majority and must resign.', 'लोक सभा में धन विधेयक हारने का अर्थ है कि सरकार ने बहुमत खो दिया और उसे इस्तीफ़ा देना होगा।'));
          else if (mode === 'budget-session') msg += tr(T2('Without a majority for its demands the government cannot spend. Win more members and try again.', 'माँगों पर बहुमत के बिना सरकार ख़र्च नहीं कर सकती। और सदस्यों को मनाओ और फिर कोशिश करो।'));
          else if (house === 'rs' && o.bill !== 'amendment' && !st.joint) {
            msg += tr(T2('The Houses disagree, so a joint sitting can be called.', 'दोनों सदन असहमत हैं, इसलिए संयुक्त बैठक बुलाई जा सकती है।'));
            st.joint = true; stages.splice(st.idx + 1, 0, JOINT); st.failed = null; st.votes = Object.assign({}, st.votes); st.idx++; st.view = st.idx;
          } else if (house === 'joint') msg += tr(T2('Even the joint sitting did not pass it. In real life the bill would lapse.', 'संयुक्त बैठक में भी पास नहीं हुआ। वास्तव में विधेयक समाप्त हो जाता।'));
          else if (house === 'rs') msg += tr(T2('A Constitution amendment cannot go to a joint sitting. It fails.', 'संविधान संशोधन संयुक्त बैठक में नहीं जा सकता। वह विफल हो गया।'));
          else msg += tr(T2('Win more support and bring the bill again.', 'और समर्थन जुटाओ और विधेयक फिर लाओ।'));
          live(msg, 'gv-bad');
          render();
        }
      });
    }
    function play() {
      if (mode === 'election') return countVotes();
      if (mode === 'panchayat') {
        if (st.busy) return;
        st.draws++;
        const rs = reservedSet();
        live(tr(T2(`Election ${st.draws}: ${rs.size} of ${wards} wards are reserved for women. Next time other wards get their turn.`, `चुनाव ${st.draws}: ${wards} में से ${rs.size} वार्ड महिलाओं के लिए आरक्षित हैं। अगली बार दूसरे वार्डों की बारी आएगी।`)), 'gv-good');
        api.record(tr(T2('Drew the reserved wards', 'आरक्षित वार्ड तय किए')));
        render(); api.emit('placed'); return;
      }
      if (!stages || st.busy) return;
      const s = cur();
      if (!s || s.kind === 'final') return;
      if (s.kind === 'vote') return doVote();
      if (s.id === 'present') {
        st.budget = budgetFigures(st.spend);
        api.emit('counted');
        live(budgetLine(st.budget), st.budget.gap > 0 ? 'gv-bad' : 'gv-good');
      }
      advance();
    }

    // ------------------------------------------------ panchayat
    function panchayatHTML() {
      const colours = ['#1D4ED8', '#0F766E', '#8B3DFF', '#FF7A1A'];
      const widths = [100, 88, 76, 64];
      const tiers = TIERS.slice().reverse().map((tt) => { const i = TIERS.indexOf(tt); return `<button class="gv-tier" style="background:${colours[i]};width:${widths[i]}%;border-radius:${i === 3 ? '16px 16px 6px 6px' : i === 0 ? '6px 6px 16px 16px' : '6px'}${colours[i] === '#FF7A1A' ? ';color:#1E293B' : ''}" data-key="stage:${tt.id}" aria-pressed="${st.tier === tt.id}">${t(tt.n)}<small>${t(tt.s)}</small></button>`; });
      const tier = TIERS.find((x) => x.id === st.tier);
      const rs = reservedSet();
      const wd = Array.from({ length: wards }, (_, i) => `<div class="gv-ward${rs.has(i) ? ' gv-res' : ''}">${icon('house', rs.has(i) ? '#9D174D' : 'currentColor', 26)}<span>${i18n('Ward', 'वार्ड')} ${i + 1}</span>${rs.has(i) ? `<span>${i18n('women', 'महिला')}</span>` : ''}</div>`).join('');
      return `<div class="gv-two"><section class="gv-card"><h3>${i18n('Three tiers of rural local government', 'ग्रामीण स्थानीय शासन के तीन स्तर')}</h3><div style="display:grid;gap:6px;justify-items:center">${tiers.join('')}</div><div style="margin-top:12px"><h3>${t(tier.n)}</h3><p>${t(tier.d)}</p></div></section>
      <section class="gv-card"><h3>${i18n('Reserving seats for women', 'महिलाओं के लिए सीटों का आरक्षण')}</h3><p class="gv-note">${i18n(`This Gram Panchayat has ${wards} wards. At least one-third, so ${reservedCount} wards, are reserved for women, and the reserved wards change at every election.`, `इस ग्राम पंचायत में ${wards} वार्ड हैं। कम से कम एक-तिहाई, यानी ${reservedCount} वार्ड, महिलाओं के लिए आरक्षित हैं और हर चुनाव में बदल जाते हैं।`)}</p><div class="gv-wards">${wd}</div><div class="gv-row" style="margin-top:12px"><button class="gv-btn" data-key="play">${st.draws ? i18n('Next election: rotate', 'अगला चुनाव: बदलाव') : i18n('Hold the draw', 'आरक्षण तय करो')}</button></div></section></div>`;
    }

    // ------------------------------------------------ shared chrome
    function i18n(en, hi) { return esc(api.t(T2(en, hi))); }
    const TITLES = {
      election: [T2('Election day', 'चुनाव का दिन'), T2('Vote on the machine, then count and see who wins the seat.', 'मशीन पर वोट डालो, फिर गिनती करो और देखो सीट कौन जीतता है।')],
      'law-making': [T2('Make a law', 'क़ानून बनाओ'), T2('Take a bill through Parliament, step by step, to the President’s signature.', 'विधेयक को संसद से होकर राष्ट्रपति के हस्ताक्षर तक, चरण-दर-चरण पहुँचाओ।')],
      organs: [SORT.organs.title, T2('Who does which job?', 'कौन-सा काम कौन करता है?')],
      levels: [SORT.levels.title, T2('Who looks after what?', 'किसकी क्या ज़िम्मेदारी है?')],
      rights: [SORT.rights.title, T2('Match each story to the right it shows.', 'हर कहानी को उस अधिकार से मिलाओ जो वह दिखाती है।')],
      federalism: [SORT.federalism.title, T2('Who can make laws on what?', 'किस विषय पर कौन क़ानून बना सकता है?')],
      courts: [SORT.courts.title, T2('Which court hears which case?', 'कौन-सा मामला किस अदालत में जाता है?')],
      panchayat: [T2('Panchayati Raj', 'पंचायती राज'), T2('See how the village governs itself.', 'देखो गाँव अपना शासन कैसे चलाता है।')],
      'budget-session': [T2('The Budget Session', 'बजट सत्र'), T2('Plan a make-believe budget, then take it through the Lok Sabha.', 'काल्पनिक बजट बनाओ, फिर उसे लोक सभा से पास कराओ।')],
    };
    function quizHTML() {
      const q = quiz[st.qi % quiz.length];
      const opts = q.o.map((op, i) => {
        const cls = st.ans == null ? '' : i === q.a ? ' gv-ok' : i === st.ans ? ' gv-no' : '';
        return `<button class="gv-opt${cls}" data-i="${i}"${st.ans != null ? ' disabled' : ''}>${t(op)}</button>`;
      }).join('');
      const fb = st.ans == null ? '' : `<p class="gv-live ${st.ans === q.a ? 'gv-good' : 'gv-bad'}" style="margin-top:10px"><span>${st.ans === q.a ? i18n('Right! ', 'सही! ') : i18n('Not quite. ', 'ठीक नहीं। ')}${t(q.w)}</span></p>`;
      return `<section class="gv-card gv-quiz"><h3>${i18n('Check yourself', 'खुद जाँचो')}</h3><p style="margin:0;font-weight:600">${t(q.q)}</p><div class="gv-opts" role="group" data-key="answer" aria-label="${i18n('Answers', 'उत्तर')}">${opts}</div>${fb}<div class="gv-row" style="margin-top:10px"><button class="gv-btn gv-ghost" data-key="next">${i18n('Another question', 'एक और प्रश्न')}</button><button class="gv-btn gv-ghost" data-key="reset">${i18n('Start over', 'शुरू से करो')}</button></div></section>`;
    }
    function render() {
      const active = document.activeElement && root.contains(document.activeElement) ? document.activeElement : null;
      const ak = active && (active.dataset.key || null), ai = active && active.dataset.i, ac = active && active.dataset.col;
      let body;
      if (mode === 'election') body = electionHTML();
      else if (SORT_MODES.includes(mode)) body = sortHTML();
      else if (mode === 'panchayat') body = panchayatHTML();
      else body = processHTML();
      const [h, sub] = TITLES[mode];
      root.innerHTML = `<div class="gv" lang="${api.lang() === 'hi' ? 'hi' : 'en'}"><header class="gv-head">${chakra}<div><h2>${t(h)}</h2><p>${t(sub)}</p></div></header><div class="gv-stage">${body}</div><div class="gv-live ${st.livecls}" role="status" aria-live="polite"><span>${esc(st.live || tr(T2('Welcome! Try it yourself.', 'स्वागत है! खुद करके देखो।')))}</span></div>${quizHTML()}</div>`;
      if (ak) {
        const sel = ak === 'answer' ? `[data-key="answer"] [data-i="${ai}"]` : ac ? `[data-col="${ac}"]` : `[data-key="${ak}"]`;
        const n = root.querySelector(sel) || root.querySelector(`[data-key="${ak}"]`);
        if (n && !n.disabled) n.focus();
      }
      langSeen = api.lang();
    }

    // ------------------------------------------------ events
    function onClick(e) {
      const opt = e.target.closest('.gv-opt');
      if (opt && root.contains(opt)) {
        if (!api.allowed('answer')) { api.nudge('answer'); return; }
        if (st.ans != null) return;
        const i = +opt.dataset.i, q = quiz[st.qi % quiz.length];
        st.ans = i;
        api.record(tr(q.q) + ' → ' + tr(q.o[i]));
        render();
        const right = i === q.a;
        api.emit(right ? 'answered:right' : 'answered:wrong');
        if (right) api.celebrate();
        return;
      }
      const el = e.target.closest('[data-key]');
      if (!el || !root.contains(el) || el.disabled) return;
      const key = el.dataset.key;
      if (key === 'answer') return;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key === 'next') { st.qi = (st.qi + 1) % quiz.length; st.ans = null; render(); return; }
      if (st.busy) return;
      if (key === 'play') return play();
      if (key === 'reset') { resetAll(); return; }
      if (key.startsWith('vote:')) return vote(key.slice(5));
      if (key.startsWith('card:')) { st.picked = st.picked === key.slice(5) ? null : key.slice(5); render(); api.emit('picked:' + key.slice(5)); return; }
      if (key.startsWith('stage:')) {
        const id = key.slice(6);
        if (SORT_MODES.includes(mode)) return place(id);
        if (mode === 'panchayat') { st.tier = id; api.speak(tr(TIERS.find((x) => x.id === id).n)); render(); api.emit('opened:' + id); return; }
        const i = stages.findIndex((s) => s.id === id);
        if (i < 0) return;
        if (i > st.idx) { api.toast(T2('Finish the earlier steps first.', 'पहले पिछले चरण पूरे करो।')); return; }
        if (i < st.idx) { st.view = i; render(); return; }
        st.view = i;
        return play();
      }
    }
    function onInput(e) {
      const el = e.target.closest('input[data-key^="slider:"]');
      if (!el) return;
      const id = el.dataset.key.slice(7);
      if (!api.allowed(el.dataset.key)) { api.nudge(el.dataset.key); el.value = id === 'ls' ? st.ls : id === 'rs' ? st.rs : st.spend[id]; return; }
      const v = +el.value;
      if (id === 'ls') st.ls = v; else if (id === 'rs') st.rs = v; else st.spend[id] = v;
      const out = el.parentElement.querySelector('output'); if (out) out.textContent = id === 'ls' || id === 'rs' ? v + '%' : v;
      if (id !== 'ls' && id !== 'rs') { const line = root.querySelector('#gv-budgetline'); const f = budgetFigures(st.spend); if (line) { line.className = 'gv-live ' + (f.gap > 0 ? 'gv-bad' : 'gv-good'); line.querySelector('span').textContent = budgetLine(f); } }
      else { const nd = root.querySelector('.gv-vote'); const s = cur(); if (!nd && s && s.kind === 'vote') { const p = root.querySelector('.gv-stage .gv-note:last-of-type'); const r = voteResult(s.house, id === 'ls' ? st.ls : st.rs, st.special); if (p && /\d/.test(p.textContent)) p.textContent = tr(T2(`${HOUSE[s.house][0]} members. At least ${r.need} yes votes are needed.`, `${HOUSE[s.house][0]} सदस्य। पास होने के लिए कम से कम ${r.need} हाँ चाहिए।`)) + ' ' + tr(T2(`Yes now: ${r.yes}.`, `अभी हाँ: ${r.yes}।`)); } }
    }
    function onChange(e) { const el = e.target.closest('input[data-key^="slider:"]'); if (el) api.emit('moved:' + el.dataset.key.slice(7)); }
    function resetAll() {
      st.placed = {}; st.tries = {}; st.picked = null; st.shake = null; st.hot = null; st.voted = null; st.count = null; st.cntk = 0; st.slipGone = false;
      st.ans = null; st.draws = 0;
      if (stages) { stages = stagesFor(mode, o.bill || 'ordinary'); Object.assign(st, { idx: 0, view: 0, failed: null, votes: {}, joint: false, finished: false, budget: null }); }
      live('', ''); st.live = '';
      render(); api.emit('reset');
    }
    // drag and drop (tap-to-place works everywhere; this is a bonus for a mouse)
    let dragId = null;
    function onDragStart(e) { const c = e.target.closest('[data-key^="card:"]'); if (!c) return; dragId = c.dataset.key.slice(5); st.picked = dragId; try { e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; } catch (x) { /* ignore */ } }
    function onDragOver(e) { if (dragId && e.target.closest('[data-col]')) e.preventDefault(); }
    function onDrop(e) { const col = e.target.closest('[data-col]'); if (!col || !dragId) return; e.preventDefault(); st.picked = dragId; dragId = null; if (api.allowed('stage:' + col.dataset.col)) place(col.dataset.col); }
    function onKey(e) { if (e.key === 'Escape' && st.picked) { st.picked = null; render(); } }
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('dragstart', onDragStart);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('drop', onDrop);
    root.addEventListener('keydown', onKey);
    render();
    const poll = setInterval(() => { if (api.lang() !== langSeen && !st.busy) render(); }, 400);
    return {
      destroy() {
        clearInterval(poll); timers.forEach(clearTimeout); stop.forEach((s) => s());
        ['click', 'input', 'change', 'dragstart', 'dragover', 'drop', 'keydown'].forEach((ev) => root.removeEventListener(ev, { click: onClick, input: onInput, change: onChange, dragstart: onDragStart, dragover: onDragOver, drop: onDrop, keydown: onKey }[ev]));
      },
    };
  }

  // ================================================================ validate and keys
  const OPTION_KEYS = {
    election: ['candidates', 'shares', 'voters', 'turnout', 'nota', 'notaPercent', 'system', 'seats'],
    'law-making': ['bill', 'supportLs', 'supportRs'],
    organs: ['cards'], levels: ['cards'], rights: ['cards'], federalism: ['cards'], courts: ['cards'],
    panchayat: ['wards'],
    'budget-session': ['support', 'spend'],
  };
  const isInt = (v) => typeof v === 'number' && Number.isInteger(v);
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
    Object.keys(c).forEach((k) => { if (!['mode', 'options'].includes(k)) e.push('unknown key: ' + k); });
    if (!MODES.includes(c.mode)) return e.concat('mode: one of ' + MODES.join(', '));
    const o = c.options == null ? {} : c.options;
    if (typeof o !== 'object' || Array.isArray(o)) return e.concat('options must be an object');
    const allowed = OPTION_KEYS[c.mode].concat(['question']);
    Object.keys(o).forEach((k) => { if (!allowed.includes(k)) e.push(`options.${k}: not used by mode ${c.mode} (use ${allowed.join(', ')})`); });
    if (o.question != null && !(isInt(o.question) && o.question >= 0 && o.question < QS[c.mode].length)) e.push(`options.question: 0 to ${QS[c.mode].length - 1}`);
    const pct = (v, name) => { if (v != null && !(isNum(v) && v >= 0 && v <= 100)) e.push(`options.${name}: a number from 0 to 100`); };
    if (c.mode === 'election') {
      if (o.candidates != null) {
        if (!Array.isArray(o.candidates) || o.candidates.length < 2 || o.candidates.length > 5) e.push('options.candidates: 2 to 5 candidate ids');
        else {
          o.candidates.forEach((id) => { if (!CANDS[id]) e.push('options.candidates: unknown candidate ' + id + ' (use ' + Object.keys(CANDS).join(', ') + ')'); });
          if (new Set(o.candidates).size !== o.candidates.length) e.push('options.candidates: each candidate once');
        }
      }
      const cands = Array.isArray(o.candidates) && o.candidates.length >= 2 && o.candidates.length <= 5 ? o.candidates : DEF_CANDS;
      if (o.shares != null) {
        if (typeof o.shares !== 'object' || Array.isArray(o.shares)) e.push('options.shares: an object {candidate id: percent}');
        else {
          const ks = Object.keys(o.shares);
          ks.forEach((k) => { if (!cands.includes(k)) e.push('options.shares: ' + k + ' is not a candidate'); else if (!(isNum(o.shares[k]) && o.shares[k] >= 0)) e.push('options.shares.' + k + ': a number of 0 or more'); });
          cands.forEach((k) => { if (!(k in o.shares)) e.push('options.shares: missing ' + k); });
          const sum = cands.reduce((a, k) => a + (isNum(o.shares[k]) ? o.shares[k] : 0), 0);
          if (Math.abs(sum - 100) > 0.01) e.push('options.shares: must add up to 100 (now ' + sum + ')');
          else {
            const top = cands.map((k) => o.shares[k]).sort((a, b) => b - a);
            if (top[0] === top[1]) e.push('options.shares: the two highest shares must differ, so the winner is clear');
          }
        }
      } else if (cands.length > 5) e.push('options.candidates: at most 5');
      if (o.voters != null && !(isInt(o.voters) && o.voters >= 100 && o.voters <= 1000000)) e.push('options.voters: a whole number from 100 to 1000000');
      if (o.turnout != null && !(isNum(o.turnout) && o.turnout >= 30 && o.turnout <= 100)) e.push('options.turnout: 30 to 100 (percent)');
      if (o.nota != null && typeof o.nota !== 'boolean') e.push('options.nota: true or false');
      if (o.notaPercent != null && !(isNum(o.notaPercent) && o.notaPercent >= 0 && o.notaPercent <= 20)) e.push('options.notaPercent: 0 to 20');
      if (o.notaPercent != null && o.nota === false && o.notaPercent > 0) e.push('options.notaPercent: set nota to true to give NOTA votes');
      if (o.system != null && !['fptp', 'pr'].includes(o.system)) e.push("options.system: 'fptp' or 'pr'");
      if (o.seats != null && !(isInt(o.seats) && o.seats >= 3 && o.seats <= 20)) e.push('options.seats: a whole number from 3 to 20');
      if (o.seats != null && o.system !== 'pr') e.push("options.seats: only with system 'pr'");
    } else if (c.mode === 'law-making') {
      if (o.bill != null && !['ordinary', 'money', 'amendment'].includes(o.bill)) e.push("options.bill: 'ordinary', 'money' or 'amendment'");
      pct(o.supportLs, 'supportLs'); pct(o.supportRs, 'supportRs');
      if (o.bill === 'money' && o.supportRs != null) e.push('options.supportRs: the Rajya Sabha does not vote on a Money Bill');
    } else if (SORT_MODES.includes(c.mode)) {
      if (o.cards != null) {
        const all = SORT[c.mode].cards;
        if (!Array.isArray(o.cards) || o.cards.length < 3) e.push('options.cards: at least 3 card ids');
        else {
          o.cards.forEach((id) => { if (!all.some((x) => x.id === id)) e.push(`options.cards: unknown card ${id} for ${c.mode}`); });
          if (new Set(o.cards).size !== o.cards.length) e.push('options.cards: each card once');
          const used = new Set(o.cards.map((id) => (all.find((x) => x.id === id) || {}).col));
          if (used.size < 2) e.push('options.cards: choose cards that belong in at least two different boxes');
        }
      }
    } else if (c.mode === 'panchayat') {
      if (o.wards != null && !(isInt(o.wards) && o.wards >= 6 && o.wards <= 30)) e.push('options.wards: a whole number from 6 to 30');
    } else if (c.mode === 'budget-session') {
      pct(o.support, 'support');
      if (o.spend != null) {
        if (typeof o.spend !== 'object' || Array.isArray(o.spend)) e.push('options.spend: an object');
        else Object.keys(o.spend).forEach((k) => { if (!HEADS[k]) e.push('options.spend: unknown head ' + k + ' (use ' + Object.keys(HEADS).join(', ') + ')'); else if (!(isInt(o.spend[k]) && o.spend[k] >= 0 && o.spend[k] <= SPEND_MAX)) e.push(`options.spend.${k}: a whole number from 0 to ${SPEND_MAX}`); });
      }
    }
    return e;
  }
  function keys(c) {
    const mode = c && c.mode;
    const o = (c && c.options) || {};
    const targets = ['answer', 'next'], events = ['answered:right', 'answered:wrong'];
    if (mode === 'election') {
      const E = eOpts(o);
      E.cands.concat(E.nota ? ['nota'] : []).forEach((id) => { targets.push('vote:' + id); events.push('voted:' + id); });
      targets.push('play', 'reset'); events.push('counted', 'reset');
    } else if (mode === 'law-making' || mode === 'budget-session') {
      const st = stagesFor(mode, o.bill || 'ordinary');
      if (mode === 'law-making' && o.bill !== 'money' && o.bill !== 'amendment') st.splice(5, 0, JOINT);
      st.forEach((s) => { targets.push('stage:' + s.id); events.push('advanced:' + s.id); });
      targets.push('play', 'reset', 'slider:ls');
      events.push('passed', 'rejected', 'reset', 'moved:ls');
      if (mode === 'law-making' && o.bill !== 'money') { targets.push('slider:rs'); events.push('moved:rs'); }
      if (mode === 'budget-session') { Object.keys(HEADS).forEach((k) => { targets.push('slider:' + k); events.push('moved:' + k); }); events.push('counted'); }
    } else if (SORT_MODES.includes(mode)) {
      const S0 = SORT[mode];
      const ids = o.cards || S0.cards.map((x) => x.id);
      S0.cols.forEach((x) => targets.push('stage:' + x.id));
      ids.forEach((id) => { targets.push('card:' + id); events.push('picked:' + id); });
      targets.push('reset'); events.push('placed', 'reset');
    } else if (mode === 'panchayat') {
      TIERS.forEach((x) => { targets.push('stage:' + x.id); events.push('opened:' + x.id); });
      targets.push('play'); events.push('placed');
    }
    return { targets, events };
  }

  NCA_T.register({
    id: 'govern',
    css: CSS,
    validate,
    keys,
    demo: { mode: 'election', options: { candidates: ['asha', 'imran', 'gurpreet', 'ravi'], voters: 1200, turnout: 65 } },
    modes: MODES,
    model: { electionCount, voteResult, stagesFor, budgetFigures, largestRemainder },
    mount,
  });
})();
