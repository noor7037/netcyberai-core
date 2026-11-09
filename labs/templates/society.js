// Template: Society explorer. Families, communities, institutions, diversity and change, explored through cards,
// maps of relationships and simple surveys. Six modes:
//   family-tree   people are placed in generations; the child links people who are related (parents above children,
//                 couples and brothers and sisters side by side) and each link names the relationship
//   web           a web of who helps whom; the first node sits in the middle
//   institutions  match each institution with the work it does
//   change        match things from long ago with what does their job today
//   compare       match what is alike in two places or groups (village and city by default)
//   survey        a short, private class survey: pick an answer, see the tally of answers kept on this device only
// Domain rules in code: a link the child makes is accepted only if the lab listed it; generations are computed from
// the links (no parent below a child, no loop); every node must have a link; a survey may not ask for private or
// sensitive details and has no right answer; a quiz question must have an answer. Every mode has a built-in set
// (an Indian joint family, community helpers, institutions, then and now, village and city, four neutral survey
// questions), so { mode } alone is a complete config. Config:
//   { mode, nodes?: [{ id, label: {en,hi}, icon?, note?: {en,hi} }], links?: [[from, to, {en,hi}, kind?]],
//     questions?: [{ id, q: {en,hi}, options: [{en,hi,id?}] (2–5), answer?: index, why?: {en,hi} }] (1–8),
//     columns?: [{en,hi}, {en,hi}] (institutions, change, compare), title?: {en,hi}, intro?: {en,hi} }
//   links: [from, to, label]; in family-tree "from" is the parent (the upper generation) and a 4th item
//   'couple' | 'sibling' | 'cousin' | 'same' puts both people in the same generation. In institutions, change and
//   compare, every "from" is in the left column and every "to" in the right column.
//   Targets: node:<id>, link, option:<id> (an option's id, else <question id>-<number from 1>), answer, reset (+ again, clear in survey).
//   Events: linked, answered, answered:right, answered:wrong, complete.
(function () {
  const { esc, tx } = window.NCA_LIB;
  const reduced = window.NCA_LIB.reducedMotion;
  const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
  const DEV = /[ऀ-ॿ]/;
  const isBi = (x) => x && typeof x === 'object' && !Array.isArray(x) && typeof x.en === 'string' && typeof x.hi === 'string' && x.en.trim() && x.hi.trim();
  const T2 = (en, hi) => ({ en, hi });
  const MODES = ['family-tree', 'web', 'institutions', 'change', 'compare', 'survey'];
  const GRAPH = ['family-tree', 'web', 'institutions', 'change', 'compare'];
  const BIP = ['institutions', 'change', 'compare'];
  const SAME = ['same', 'couple', 'sibling', 'cousin'];

  // ---------------------------------------------------------------- icons (24 x 24, drawn with strokes)
  const ICONS = {
    dot: '<circle cx="12" cy="12" r="4.5"/>',
    person: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-4.2 3.1-6.6 7-6.6s7 2.4 7 6.6"/>',
    child: '<circle cx="12" cy="10" r="3"/><path d="M6.5 20c0-3.4 2.4-5.4 5.5-5.4s5.5 2 5.5 5.4"/>',
    elder: '<circle cx="10.5" cy="7.5" r="3.2"/><path d="M4.5 20c0-3.8 2.6-6 6-6s6 2.2 6 6"/><path d="M19.5 14v7M18 14h3"/>',
    people: '<circle cx="12" cy="8" r="3"/><circle cx="5.5" cy="10" r="2.2"/><circle cx="18.5" cy="10" r="2.2"/><path d="M7 20c0-3.3 2.2-5.2 5-5.2s5 1.9 5 5.2"/><path d="M1.8 19c0-2.4 1.5-3.9 3.7-3.9M22.2 19c0-2.4-1.5-3.9-3.7-3.9"/>',
    house: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5.5h4V20"/>',
    school: '<path d="M2.5 9 12 4l9.5 5-9.5 5z"/><path d="M6.5 11.5V16c0 1.4 2.5 2.8 5.5 2.8s5.5-1.4 5.5-2.8v-4.5"/><path d="M21.5 9v6"/>',
    market: '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5c0 1.7 1.3 2.5 2.7 2.5S9.3 11.2 9.3 9.5c0 1.7 1.3 2.5 2.7 2.5s2.7-.8 2.7-2.5c0 1.7 1.3 2.5 2.7 2.5S20 11.2 20 9.5"/><path d="M5.5 12.5V20h13v-7.5"/><path d="M10 20v-4h4v4"/>',
    hospital: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    building: '<path d="M3 20h18M5 20V10M9 20V10M15 20V10M19 20V10"/><path d="M2.5 10 12 4l9.5 6z"/>',
    court: '<path d="M12 4v16M7 20h10M4 7h16"/><path d="M4 7l-2.5 6h5zM20 7l-2.5 6h5z"/>',
    farm: '<path d="M12 21v-9"/><path d="M12 12C12 8 9 6 5 6c0 4 2.5 6 7 6z"/><path d="M12 14c0-3.2 2.4-5 6-5 0 3.2-2.2 5-6 5z"/>',
    bus: '<rect x="4" y="4" width="16" height="13" rx="3"/><path d="M4 11h16M8 17v3M16 17v3"/><circle cx="8" cy="14" r=".9"/><circle cx="16" cy="14" r=".9"/>',
    cart: '<circle cx="9" cy="17" r="3.5"/><path d="M3 13h13l2-5h4"/><path d="M9 17v0"/>',
    letter: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 7 8.5 6.5L20.5 7"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    lamp: '<path d="M4 14c0 3 3.6 5 8 5s8-2 8-5z"/><path d="M12 4c2 2.5 2.4 4.2 0 6-2.4-1.8-2-3.5 0-6z"/>',
    bulb: '<path d="M9 17.5h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.7.6 1 1.3 1 2.1h5c0-.8.3-1.5 1-2.1A6 6 0 0 0 12 3z"/>',
    flame: '<path d="M12 3c3.5 3.5 6 6 6 10a6 6 0 0 1-12 0c0-2 1-3.5 2.5-5 .4 1.6 1.2 2.4 2 2.6C10.3 8.5 10.5 5.5 12 3z"/>',
    mixer: '<path d="M7 9h10l-1.2 10H8.2z"/><path d="M6 9h12M12 3v4"/>',
    stone: '<circle cx="12" cy="13" r="8"/><circle cx="12" cy="13" r="2.5"/><path d="M12 5V3M20 5l-1.5 1.5"/>',
    tap: '<path d="M6 8h8a3 3 0 0 1 3 3v1"/><path d="M5 6h4v4H5zM17 15c-1.3 1.8-2 2.8-2 3.8a2 2 0 1 0 4 0c0-1-.7-2-2-3.8z"/>',
    well: '<path d="M5 12h14v8H5z"/><path d="M7 12V5h10v7M12 5v4"/>',
    factory: '<path d="M3 20V11l6 3v-3l6 3V6h3v14z"/><path d="M3 20h18"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10a4.3 4.3 0 0 1 7.5-2.8A4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
    book: '<path d="M4 5.5c3-1 5.5-.8 8 .8 2.5-1.6 5-1.8 8-.8V18c-3-1-5.5-.8-8 .8-2.5-1.6-5-1.8-8-.8z"/><path d="M12 6.3v12.5"/>',
    coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.5 10c0-1 1-1.6 2.5-1.6s2.5.6 2.5 1.6-1 1.5-2.5 2-2.5 1-2.5 2 1 1.6 2.5 1.6 2.5-.6 2.5-1.6"/>',
    tree: '<circle cx="12" cy="9" r="5.5"/><path d="M12 14.5V21M9 21h6"/>',
    speech: '<path d="M4 5h16v11H11l-5 4v-4H4z"/>',
    broom: '<path d="M14 3l-4.5 9"/><path d="M6.5 12h6.8l2 8H4.5z"/>',
  };
  const iconSVG = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[n] || ICONS.dot}</svg>`;

  // Fixed colours (logo palette); each has the text colour the contract allows on it.
  const PAL = [
    { c: '#1D4ED8', c2: '#2563EB', t: '#FFFFFF' }, { c: '#0F766E', c2: '#14B8A6', t: '#FFFFFF' }, { c: '#8B3DFF', c2: '#4400F0', t: '#FFFFFF' },
    { c: '#FF7A1A', c2: '#FFD23F', t: '#1E293B' }, { c: '#FF6B57', c2: '#FF7A1A', t: '#1E293B' }, { c: '#02CFF9', c2: '#14B8A6', t: '#1E293B' },
    { c: '#22C55E', c2: '#02CFF9', t: '#1E293B' }, { c: '#F5B90A', c2: '#FFD23F', t: '#1E293B' },
  ];

  // ---------------------------------------------------------------- built-in sets
  const N = (id, en, hi, icon, note) => { const o = { id, label: T2(en, hi), icon }; if (note) o.note = note; return o; };
  const K = (a, b, en, hi, kind) => (kind ? [a, b, T2(en, hi), kind] : [a, b, T2(en, hi)]);
  const PRESET = {
    'family-tree': {
      title: T2('Build the family tree', 'परिवार का वंश-वृक्ष बनाओ'),
      intro: T2('Tap two people who are related, then press "Link them". Parents are above their children.', 'आपस में रिश्तेदार दो लोगों को छुओ, फिर "इन्हें जोड़ो" दबाओ। माता-पिता अपने बच्चों के ऊपर हैं।'),
      nodes: [
        N('dadaji', 'Dadaji', 'दादाजी', 'elder', T2("Papa's father", 'पापा के पिता')),
        N('dadiji', 'Dadiji', 'दादीजी', 'elder', T2("Papa's mother", 'पापा की माँ')),
        N('papa', 'Papa', 'पापा', 'person'),
        N('mummy', 'Mummy', 'मम्मी', 'person'),
        N('chacha', 'Chacha', 'चाचा', 'person', T2("Papa's younger brother", 'पापा के छोटे भाई')),
        N('chachi', 'Chachi', 'चाची', 'person', T2("Chacha's wife", 'चाचा की पत्नी')),
        N('me', 'Me', 'मैं', 'child'),
        N('sib', 'My brother or sister', 'मेरा भाई या बहन', 'child'),
        N('cousin', 'My cousin', 'मेरा चचेरा भाई या बहन', 'child', T2("Chacha's child", 'चाचा की संतान')),
      ],
      links: [
        K('dadaji', 'dadiji', 'married couple', 'विवाहित जोड़ा', 'couple'),
        K('dadaji', 'papa', 'father and son', 'पिता और पुत्र'),
        K('dadiji', 'chacha', 'mother and son', 'माँ और पुत्र'),
        K('papa', 'mummy', 'married couple', 'विवाहित जोड़ा', 'couple'),
        K('chacha', 'chachi', 'married couple', 'विवाहित जोड़ा', 'couple'),
        K('papa', 'me', 'parent and child', 'माता-पिता और बच्चा'),
        K('mummy', 'sib', 'parent and child', 'माता-पिता और बच्चा'),
        K('chachi', 'cousin', 'parent and child', 'माता-पिता और बच्चा'),
        K('me', 'sib', 'brother and sister', 'भाई-बहन', 'sibling'),
        K('me', 'cousin', 'cousins', 'चचेरे भाई-बहन', 'cousin'),
      ],
    },
    web: {
      title: T2('Who helps whom?', 'कौन किसकी मदद करता है?'),
      intro: T2('Our family is in the middle. Tap two helpers who work together, then press "Link them".', 'बीच में हमारा परिवार है। साथ काम करने वाले दो सहायकों को छुओ, फिर "इन्हें जोड़ो" दबाओ।'),
      nodes: [
        N('family', 'Our family', 'हमारा परिवार', 'house'),
        N('farmer', 'Farmer', 'किसान', 'farm'),
        N('shop', 'Shopkeeper', 'दुकानदार', 'market'),
        N('teacher', 'Teacher', 'शिक्षक', 'book'),
        N('doctor', 'Doctor', 'डॉक्टर', 'heart'),
        N('driver', 'Bus driver', 'बस चालक', 'bus'),
        N('sweeper', 'Sanitation worker', 'सफ़ाई कर्मचारी', 'broom'),
        N('electrician', 'Electrician', 'बिजली मिस्त्री', 'bulb'),
      ],
      links: [
        K('farmer', 'shop', 'sells grain and vegetables', 'अनाज और सब्ज़ियाँ बेचता है'),
        K('shop', 'family', 'sells us groceries', 'हमें राशन देता है'),
        K('teacher', 'family', 'teaches the children', 'बच्चों को पढ़ाते हैं'),
        K('doctor', 'family', 'treats us when we are ill', 'बीमार होने पर इलाज करते हैं'),
        K('driver', 'family', 'takes us to school and work', 'स्कूल और काम पर ले जाता है'),
        K('sweeper', 'family', 'keeps our streets clean', 'हमारी गलियाँ साफ़ रखते हैं'),
        K('electrician', 'family', 'fixes our wiring', 'हमारे घर की बिजली ठीक करते हैं'),
        K('electrician', 'doctor', 'keeps the clinic lit', 'अस्पताल में रोशनी रखता है'),
        K('driver', 'teacher', 'brings the teacher to school', 'शिक्षक को स्कूल पहुँचाता है'),
      ],
    },
    institutions: {
      title: T2('Match each institution with its work', 'हर संस्था को उसके काम से जोड़ो'),
      intro: T2('Tap an institution on the left and the work it does on the right, then press "Link them".', 'बाईं ओर की संस्था और दाईं ओर उसका काम छुओ, फिर "इन्हें जोड़ो" दबाओ।'),
      columns: [T2('Institution', 'संस्था'), T2('What it does', 'वह क्या करती है')],
      nodes: [
        N('family', 'Family', 'परिवार', 'house'), N('school', 'School', 'विद्यालय', 'school'), N('panchayat', 'Gram Panchayat', 'ग्राम पंचायत', 'building'),
        N('market', 'Market', 'बाज़ार', 'market'), N('hospital', 'Hospital', 'अस्पताल', 'hospital'), N('court', 'Court', 'न्यायालय', 'court'),
        N('f-care', 'Gives first care, language and values', 'पहली देखभाल, भाषा और संस्कार देता है', 'heart'),
        N('f-learn', 'Teaches reading, writing and skills', 'पढ़ना, लिखना और हुनर सिखाता है', 'book'),
        N('f-serve', 'Runs village services such as water and roads', 'पानी, सड़क जैसी गाँव की सेवाएँ चलाती है', 'tap'),
        N('f-trade', 'Where goods are bought and sold', 'जहाँ चीज़ें खरीदी और बेची जाती हैं', 'coin'),
        N('f-heal', 'Treats illness and keeps people healthy', 'बीमारी का इलाज करता है, लोगों को स्वस्थ रखता है', 'plus'),
        N('f-law', 'Settles disputes by the law', 'विवादों को कानून से सुलझाता है', 'court'),
      ],
      links: [
        K('family', 'f-care', 'the first group a child belongs to', 'बच्चा सबसे पहले इसी समूह का हिस्सा होता है'),
        K('school', 'f-learn', 'children learn together here', 'यहाँ बच्चे साथ मिलकर सीखते हैं'),
        K('panchayat', 'f-serve', 'villagers elect its members', 'गाँव के लोग इसके सदस्य चुनते हैं'),
        K('market', 'f-trade', 'sellers and buyers meet here', 'यहाँ बेचने और खरीदने वाले मिलते हैं'),
        K('hospital', 'f-heal', 'doctors and nurses work here', 'यहाँ डॉक्टर और नर्स काम करते हैं'),
        K('court', 'f-law', 'judges listen to both sides', 'न्यायाधीश दोनों पक्षों की बात सुनते हैं'),
      ],
    },
    change: {
      title: T2('Then and now', 'पहले और अब'),
      intro: T2('Tap something from long ago and the thing that does its job today, then press "Link them".', 'पुराने ज़माने की कोई चीज़ और आज उसका काम करने वाली चीज़ छुओ, फिर "इन्हें जोड़ो" दबाओ।'),
      columns: [T2('Long ago', 'पहले'), T2('Today', 'आज')],
      nodes: [
        N('letter', 'Letter by post', 'डाक से चिट्ठी', 'letter'), N('cart', 'Bullock cart', 'बैलगाड़ी', 'cart'), N('lamp', 'Oil lamp', 'तेल का दीया', 'lamp'),
        N('stone', 'Hand grinding stone', 'हाथ की चक्की', 'stone'), N('chulha', 'Wood chulha', 'लकड़ी का चूल्हा', 'flame'), N('well', 'Water from a well', 'कुएँ का पानी', 'well'),
        N('phone', 'Mobile phone message', 'मोबाइल संदेश', 'phone'), N('bus', 'Bus and train', 'बस और रेलगाड़ी', 'bus'), N('bulb', 'Electric bulb', 'बिजली का बल्ब', 'bulb'),
        N('mixer', 'Electric mixer-grinder', 'बिजली की मिक्सी', 'mixer'), N('lpg', 'LPG gas stove', 'एलपीजी गैस चूल्हा', 'flame'), N('tap', 'Tap water at home', 'घर में नल का पानी', 'tap'),
      ],
      links: [
        K('letter', 'phone', 'news now travels in seconds', 'खबर अब सेकंडों में पहुँचती है'),
        K('cart', 'bus', 'carries more people, faster', 'ज़्यादा लोगों को तेज़ी से ले जाती है'),
        K('lamp', 'bulb', 'steady light at the flick of a switch', 'स्विच दबाते ही एक-सी रोशनी'),
        K('stone', 'mixer', 'grinds in minutes with electricity', 'बिजली से मिनटों में पीसती है'),
        K('chulha', 'lpg', 'less smoke inside the kitchen', 'रसोई में कम धुआँ'),
        K('well', 'tap', 'water reaches the house through pipes', 'पानी पाइप से घर तक पहुँचता है'),
      ],
    },
    compare: {
      title: T2('Village and city: what is alike?', 'गाँव और शहर: क्या एक-जैसा है?'),
      intro: T2('Tap a village thing and the city thing that does a similar job, then press "Link them".', 'गाँव की कोई चीज़ और शहर की वैसा ही काम करने वाली चीज़ छुओ, फिर "इन्हें जोड़ो" दबाओ।'),
      columns: [T2('Village', 'गाँव'), T2('City', 'शहर')],
      nodes: [
        N('fields', 'Farm fields', 'खेत', 'farm', T2('Many village families earn their living from farming.', 'गाँव के कई परिवार खेती से अपनी रोज़ी कमाते हैं।')),
        N('panchayat', 'Gram Panchayat', 'ग्राम पंचायत', 'building'), N('haat', 'Weekly haat', 'साप्ताहिक हाट', 'market'),
        N('handpump', 'Handpump or well', 'हैंडपंप या कुआँ', 'well'), N('tractor', 'Tractor or bullock cart', 'ट्रैक्टर या बैलगाड़ी', 'cart'), N('vschool', 'Village school', 'गाँव का स्कूल', 'school'),
        N('factory', 'Factory', 'कारख़ाना', 'factory', T2('Many city families work in factories, offices and shops.', 'शहर के कई परिवार कारख़ानों, दफ़्तरों और दुकानों में काम करते हैं।')),
        N('corp', 'Municipal Corporation', 'नगर निगम', 'building'), N('mall', 'Shopping mall', 'शॉपिंग मॉल', 'market'),
        N('pipes', 'Piped water supply', 'पाइप से पानी की आपूर्ति', 'tap'), N('metro', 'Metro, bus and auto', 'मेट्रो, बस और ऑटो', 'bus'), N('cschool', 'City school', 'शहर का स्कूल', 'school'),
      ],
      links: [
        K('fields', 'factory', 'both are places where people work', 'दोनों जगह लोग काम करते हैं'),
        K('panchayat', 'corp', 'both run local services', 'दोनों स्थानीय सेवाएँ चलाते हैं'),
        K('haat', 'mall', 'both are places to buy and sell', 'दोनों जगह खरीद-बिक्री होती है'),
        K('handpump', 'pipes', 'both bring drinking water', 'दोनों पीने का पानी देते हैं'),
        K('tractor', 'metro', 'both carry people and goods', 'दोनों लोगों और सामान को ले जाते हैं'),
        K('vschool', 'cschool', 'both teach children', 'दोनों बच्चों को पढ़ाते हैं'),
      ],
    },
    survey: {
      title: T2('Class survey', 'कक्षा का सर्वेक्षण'),
      intro: T2('Pick your answer and see how answers are counted. Ask a friend to answer too!', 'अपना उत्तर चुनो और देखो कि उत्तर कैसे गिने जाते हैं। किसी दोस्त से भी उत्तर दिलवाओ!'),
      questions: [
        { id: 'travel', q: T2('How do you usually come to school?', 'तुम आमतौर पर स्कूल कैसे आते हो?'), options: [T2('I walk', 'पैदल'), T2('Cycle', 'साइकिल से'), T2('Bus or school van', 'बस या स्कूल वैन से'), T2('Car, scooter or motorcycle', 'कार, स्कूटर या मोटरसाइकिल से'), T2('Some other way', 'किसी और तरह से')] },
        { id: 'home', q: T2('How many people live in your home?', 'तुम्हारे घर में कितने लोग रहते हैं?'), options: [T2('2 or 3', '2 या 3'), T2('4 or 5', '4 या 5'), T2('6 or 7', '6 या 7'), T2('8 or more', '8 या ज़्यादा')] },
        { id: 'free', q: T2('What do you like to do after school?', 'स्कूल के बाद तुम्हें क्या करना पसंद है?'), options: [T2('Play outside', 'बाहर खेलना'), T2('Read or draw', 'पढ़ना या चित्र बनाना'), T2('Help at home', 'घर के काम में हाथ बँटाना'), T2('Watch TV or use a phone', 'टीवी देखना या फ़ोन चलाना')] },
        { id: 'lang', q: T2('How many languages can you speak?', 'तुम कितनी भाषाएँ बोल सकते हो?'), options: [T2('One', 'एक'), T2('Two', 'दो'), T2('Three', 'तीन'), T2('Four or more', 'चार या ज़्यादा')] },
      ],
    },
  };
  const DEFCOL = {
    institutions: [T2('Institution', 'संस्था'), T2('What it does', 'वह क्या करती है')],
    change: [T2('Long ago', 'पहले'), T2('Today', 'आज')],
    compare: [T2('Group A', 'समूह क'), T2('Group B', 'समूह ख')],
  };

  // ---------------------------------------------------------------- resolving a config (pure)
  function resolve(c) {
    c = c && typeof c === 'object' && !Array.isArray(c) ? c : {};
    const mode = MODES.includes(c.mode) ? c.mode : 'family-tree';
    const p = PRESET[mode];
    const out = { mode, title: isBi(c.title) ? c.title : p.title, intro: isBi(c.intro) ? c.intro : p.intro, nodes: [], links: [], questions: [], columns: null };
    if (mode === 'survey') out.questions = Array.isArray(c.questions) && c.questions.length ? c.questions : p.questions;
    else {
      const own = Array.isArray(c.nodes) && Array.isArray(c.links);
      out.nodes = own ? c.nodes : p.nodes;
      out.links = own ? c.links : p.links;
      if (BIP.includes(mode)) out.columns = Array.isArray(c.columns) && c.columns.length === 2 ? c.columns : own ? DEFCOL[mode] : p.columns;
      out.questions = Array.isArray(c.questions) ? c.questions : [];
    }
    out.nodes = out.nodes.filter((n) => n && typeof n === 'object');
    out.links = out.links.filter((l) => Array.isArray(l));
    out.questions = out.questions.filter((q) => q && typeof q === 'object' && Array.isArray(q.options)).map((q) => Object.assign({}, q, {
      options: q.options.map((o, i) => Object.assign({}, o, { id: (o && o.id) || String(q.id) + '-' + (i + 1) })),
    }));
    return out;
  }

  // ---------------------------------------------------------------- family-tree generations (pure)
  // Groups people who share a generation (couples, siblings, cousins), then puts every group one level below its
  // parents' group (longest path). Returns { err } or { rows: [[node ids]], pos: { id: { r, i } } }.
  function treeRows(nodes, links) {
    const idx = {}; nodes.forEach((n, i) => { idx[n.id] = i; });
    const par = nodes.map((_, i) => i);
    const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    links.forEach((l) => { if (l[3]) par[find(idx[l[0]])] = find(idx[l[1]]); });
    const g = nodes.map((_, i) => find(i));
    const groups = []; g.forEach((x) => { if (!groups.includes(x)) groups.push(x); });
    const edges = [];
    for (const l of links) {
      if (l[3]) continue;
      const a = g[idx[l[0]]], b = g[idx[l[1]]];
      if (a === b) return { err: 'a parent link (' + l[0] + ' to ' + l[1] + ') joins two people who are in the same generation through couple/sibling/cousin links' };
      edges.push([a, b]);
    }
    const depth = {}; groups.forEach((x) => { depth[x] = 0; });
    let changed = true, pass = 0;
    while (changed && pass <= groups.length + 1) {
      changed = false; pass++;
      edges.forEach(([a, b]) => { if (depth[b] < depth[a] + 1) { depth[b] = depth[a] + 1; changed = true; } });
    }
    if (changed) return { err: 'the parent links go round in a circle (someone would be their own ancestor)' };
    const nrows = Math.max.apply(null, groups.map((x) => depth[x])) + 1;
    const rows = [], pos = {}, xs = {};
    for (let r = 0; r < nrows; r++) {
      let gs = groups.filter((x) => depth[x] === r);
      const bary = (gr) => {
        const mem = nodes.filter((_, i) => g[i] === gr).map((n) => n.id);
        const ps = links.filter((l) => !l[3] && mem.includes(l[1]) && xs[l[0]] != null).map((l) => xs[l[0]]);
        return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 50;
      };
      if (r > 0) { const first = {}; gs.forEach((x, k) => { first[x] = k; }); gs = gs.slice().sort((a, b) => bary(a) - bary(b) || first[a] - first[b]); }
      const row = []; gs.forEach((gr) => nodes.forEach((n, i) => { if (g[i] === gr) row.push(n.id); }));
      rows.push(row);
      row.forEach((id, i) => { pos[id] = { r, i }; xs[id] = row.length === 1 ? 50 : (i / (row.length - 1)) * 100; });
    }
    return { rows, pos };
  }

  // ---------------------------------------------------------------- geometry (pure): percent positions, link paths
  const NODE_HALF = 44; // px, half the height of a node, used to place badges clear of nodes
  function layout(R) {
    const { mode, nodes, links } = R;
    const pos = {}, side = {};
    let kind = 'web', h = 460, M = 3;
    if (mode === 'family-tree') {
      kind = 'tree';
      const tr = treeRows(nodes, links);
      const rows = tr.rows;
      M = Math.max(3, Math.max.apply(null, rows.map((r) => r.length)));
      h = rows.length * 142 + 16;
      rows.forEach((row, r) => row.forEach((id, i) => { pos[id] = { x: 50 + (i - (row.length - 1) / 2) * (100 / M), y: ((r + 0.5) / rows.length) * 100, r, i }; }));
    } else if (mode === 'web') {
      kind = 'web';
      const rest = nodes.length - 1;
      pos[nodes[0].id] = { x: 50, y: 50 };
      // Helpers who are linked to each other sit side by side on the ring, so lines do not cross the middle.
      const outerIds = nodes.slice(1).map((n) => n.id), ring = [];
      const nbr = (id) => links.filter((l) => l[0] === id || l[1] === id).map((l) => (l[0] === id ? l[1] : l[0])).filter((o) => o !== nodes[0].id && outerIds.includes(o));
      outerIds.forEach((id) => { let cur = id; while (cur && !ring.includes(cur)) { ring.push(cur); cur = nbr(cur).find((o) => !ring.includes(o)); } });
      ring.forEach((id, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / rest; pos[id] = { x: 50 + 37 * Math.cos(a), y: 50 + 37 * Math.sin(a) }; });
      h = 470;
    } else {
      kind = 'bip';
      const lefts = [], rights = [];
      links.forEach((l) => { if (!lefts.includes(l[0])) lefts.push(l[0]); if (!rights.includes(l[1])) rights.push(l[1]); });
      const lo = nodes.map((n) => n.id).filter((id) => lefts.includes(id));
      let ro = nodes.map((n) => n.id).filter((id) => rights.includes(id));
      // A fixed scramble of the right column, so the position of a card never gives its partner away.
      let seed = 11; ro.forEach((id) => { for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0; });
      for (let i = ro.length - 1; i > 0; i--) { seed = (seed * 1664525 + 1013904223) >>> 0; const j = seed % (i + 1); const t = ro[i]; ro[i] = ro[j]; ro[j] = t; }
      if (ro.length > 1 && ro.every((id, i) => id === nodes.map((n) => n.id).filter((x) => rights.includes(x))[i])) ro = ro.slice(1).concat(ro[0]);
      const PAD = 34, ROW = 94;
      h = Math.max(lo.length, ro.length) * ROW + PAD + 8;
      const yy = (i, n) => ((PAD + (i + 0.5) * ((h - PAD - 8) / n)) / h) * 100;
      lo.forEach((id, i) => { pos[id] = { x: 24, y: yy(i, lo.length) }; side[id] = 'l'; });
      ro.forEach((id, i) => { pos[id] = { x: 76, y: yy(i, ro.length) }; side[id] = 'r'; });
    }
    const into = {}, out = {};
    const lg = links.map((l) => {
      const a = pos[l[0]], b = pos[l[1]];
      if (!a || !b) return { d: '', bx: 50, by: 50 };
      if (kind === 'tree') {
        if (l[3]) {
          const gap = Math.abs(a.i - b.i);
          if (gap <= 1) return { d: `M${a.x} ${a.y}L${b.x} ${b.y}`, bx: (a.x + b.x) / 2, by: a.y };
          const up = Math.min(14, 8 + gap * 2);
          return { d: `M${a.x} ${a.y}Q${(a.x + b.x) / 2} ${a.y - up * 2} ${b.x} ${b.y}`, bx: (a.x + b.x) / 2, by: a.y - up };
        }
        const mid = (a.y + b.y) / 2;
        const k = (into[l[1]] = (into[l[1]] || 0) + 1) - 1;
        return { d: `M${a.x} ${a.y}L${a.x} ${mid}L${b.x} ${mid}L${b.x} ${b.y}`, bx: b.x, by: mid + k * (28 / h) * 100 };
      }
      if (kind === 'bip') {
        const k = (out[l[0]] = (out[l[0]] || 0) + 1) - 1;
        return { d: `M${a.x + 21} ${a.y}C${a.x + 29} ${a.y} ${b.x - 29} ${b.y} ${b.x - 21} ${b.y}`, bx: 50, by: a.y + k * (28 / h) * 100 };
      }
      const hub = nodes[0].id, t = l[0] === hub ? 0.62 : l[1] === hub ? 0.38 : 0.5;
      return { d: `M${a.x} ${a.y}L${b.x} ${b.y}`, bx: a.x + (b.x - a.x) * t, by: a.y + (b.y - a.y) * t };
    });
    return { kind, pos, side, h, M, links: lg };
  }

  // ---------------------------------------------------------------- validation (pure)
  const SENSITIVE_EN = /\b(caste|religion|income|salary|earn|pocket money|phone number|address|aadhaar|aadhar|password|surname|skin colou?r|rich|poor|disabilit|illness|diseases?|medicine|pregnan|boyfriend|girlfriend)\b/i;
  const SENSITIVE_HI = /(जाति|धर्म|आय\b|वेतन|कमाई|पता\b|आधार|पासवर्ड|उपनाम|गरीब|अमीर|विकलांग|बीमारी)/;

  function validateQuestions(qs, mode, e) {
    if (!Array.isArray(qs) || qs.length < 1 || qs.length > 8) { e.push('questions: an array of 1 to 8 questions'); return; }
    const qids = new Set(), oids = new Set();
    qs.forEach((q, i) => {
      const w = 'questions[' + i + ']';
      if (!q || typeof q !== 'object' || Array.isArray(q)) { e.push(w + ': an object { id, q, options }'); return; }
      Object.keys(q).forEach((k) => { if (!['id', 'q', 'options', 'answer', 'why'].includes(k)) e.push(w + ': unknown key ' + k); });
      if (typeof q.id !== 'string' || !ID.test(q.id)) e.push(w + ': id must be letters, digits, - or _');
      else if (qids.has(q.id)) e.push(w + ': duplicate question id ' + q.id);
      else qids.add(q.id);
      if (!isBi(q.q)) e.push(w + ': q needs both en and hi text');
      else {
        if (q.q.en.length > 140 || q.q.hi.length > 200) e.push(w + ': q is too long for a child');
        if (!DEV.test(q.q.hi)) e.push(w + ': the hi question must be written in Devanagari');
      }
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 5) { e.push(w + ': options: 2 to 5 answers'); return; }
      const seen = new Set();
      q.options.forEach((o, j) => {
        const v = w + '.options[' + j + ']';
        if (!isBi(o)) { e.push(v + ': needs both en and hi text'); return; }
        Object.keys(o).forEach((k) => { if (!['en', 'hi', 'id'].includes(k)) e.push(v + ': unknown key ' + k); });
        if (o.en.length > 70 || o.hi.length > 100) e.push(v + ': too long');
        if (!DEV.test(o.hi) && /[A-Za-z]{3,}/.test(o.en)) e.push(v + ': the hi text must be written in Devanagari');
        if (seen.has(o.en.trim().toLowerCase())) e.push(v + ': the same answer appears twice');
        seen.add(o.en.trim().toLowerCase());
        if (o.id != null && (typeof o.id !== 'string' || !ID.test(o.id))) e.push(v + ': id must be letters, digits, - or _');
        const oid = o.id || String(q.id) + '-' + (j + 1);
        if (oids.has(oid)) e.push(v + ': duplicate option id ' + oid);
        oids.add(oid);
      });
      if (mode === 'survey') {
        if (q.answer != null) e.push(w + ': a survey question has no right answer; remove "answer" (use another mode for a quiz)');
        if (q.why != null) e.push(w + ': a survey question has no "why"');
        const all = [q.q].concat(q.options).filter(isBi);
        all.forEach((t) => { if (SENSITIVE_EN.test(t.en) || SENSITIVE_HI.test(t.hi)) e.push(w + ': a class survey must not ask about private or sensitive things (money, religion, caste, health, address, looks): "' + t.en + '"'); });
      } else {
        if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) e.push(w + ': answer must be the index (from 0) of the right option');
        if (q.why != null && !isBi(q.why)) e.push(w + ': why needs both en and hi');
        else if (q.why && q.why.en.length > 260) e.push(w + ': why is too long (260 characters)');
      }
    });
  }

  function validateGraph(c, e) {
    const mode = c.mode;
    const lim = mode === 'family-tree' ? [3, 14] : mode === 'web' ? [3, 9] : [4, 14];
    if (!Array.isArray(c.nodes) || c.nodes.length < lim[0] || c.nodes.length > lim[1]) { e.push('nodes: an array of ' + lim[0] + ' to ' + lim[1] + ' nodes for ' + mode); return; }
    const ids = new Set();
    c.nodes.forEach((n, i) => {
      const w = 'nodes[' + i + ']';
      if (!n || typeof n !== 'object' || Array.isArray(n)) { e.push(w + ': an object { id, label }'); return; }
      Object.keys(n).forEach((k) => { if (!['id', 'label', 'icon', 'note'].includes(k)) e.push(w + ': unknown key ' + k + ' (use id, label, icon, note)'); });
      if (typeof n.id !== 'string' || !ID.test(n.id)) e.push(w + ': id must be letters, digits, - or _ (no spaces or colons)');
      else if (ids.has(n.id)) e.push(w + ': duplicate node id ' + n.id);
      else ids.add(n.id);
      if (!isBi(n.label)) e.push(w + ': label needs both en and hi');
      else {
        if (n.label.en.length > 60 || n.label.hi.length > 80) e.push(w + ': label is too long (60 characters in English at most)');
        if (!DEV.test(n.label.hi)) e.push(w + ': the hi label must be written in Devanagari');
      }
      if (n.icon != null && !(typeof n.icon === 'string' && Object.prototype.hasOwnProperty.call(ICONS, n.icon))) e.push(w + ': icon "' + n.icon + '" is not one of: ' + Object.keys(ICONS).join(', '));
      if (n.note != null && (!isBi(n.note) || n.note.en.length > 120)) e.push(w + ': note needs both en and hi (120 characters at most)');
    });
    if (!Array.isArray(c.links) || c.links.length < 2 || c.links.length > (BIP.includes(mode) ? 14 : 20)) { e.push('links: an array of 2 to ' + (BIP.includes(mode) ? 14 : 20) + ' links'); return; }
    const pairs = new Set(), used = new Set();
    let bad = false;
    c.links.forEach((l, i) => {
      const w = 'links[' + i + ']';
      if (!Array.isArray(l) || l.length < 3 || l.length > 4) { e.push(w + ': [from, to, {en,hi}' + (mode === 'family-tree' ? ', kind?' : '') + ']'); bad = true; return; }
      if (!ids.has(l[0]) || !ids.has(l[1])) { e.push(w + ': "' + l[0] + '" and "' + l[1] + '" must both be node ids'); bad = true; return; }
      if (l[0] === l[1]) { e.push(w + ': a node cannot link to itself'); bad = true; return; }
      const key = [l[0], l[1]].sort().join('|');
      if (pairs.has(key)) { e.push(w + ': the pair ' + l[0] + ' and ' + l[1] + ' is linked twice'); bad = true; }
      pairs.add(key); used.add(l[0]); used.add(l[1]);
      if (!isBi(l[2])) { e.push(w + ': the label needs both en and hi'); bad = true; }
      else {
        if (l[2].en.length > 70 || l[2].hi.length > 110) e.push(w + ': the label is too long (70 characters in English at most)');
        if (!DEV.test(l[2].hi)) e.push(w + ': the hi label must be written in Devanagari');
      }
      if (l.length === 4) {
        if (mode !== 'family-tree') { e.push(w + ': a 4th item (kind) is only for family-tree'); bad = true; }
        else if (!SAME.includes(l[3])) { e.push(w + ': kind must be one of ' + SAME.join(', ') + ' (people in the same generation); leave it out for parent and child'); bad = true; }
      }
    });
    c.nodes.forEach((n) => { if (n && typeof n.id === 'string' && ids.has(n.id) && !used.has(n.id)) e.push('node "' + n.id + '" has no link; every node must be linkable'); });
    if (bad) return;
    if (mode === 'family-tree') {
      const tr = treeRows(c.nodes, c.links);
      if (tr.err) e.push('family-tree: ' + tr.err);
      else {
        if (tr.rows.length > 5) e.push('family-tree: at most 5 generations (found ' + tr.rows.length + ')');
        tr.rows.forEach((r) => { if (r.length > 5) e.push('family-tree: at most 5 people in one generation (found ' + r.length + ')'); });
        if (tr.rows.length < 2) e.push('family-tree: needs at least two generations (add a parent and child link)');
      }
    } else if (BIP.includes(mode)) {
      const lefts = new Set(c.links.map((l) => l[0])), rights = new Set(c.links.map((l) => l[1]));
      lefts.forEach((x) => { if (rights.has(x)) e.push(mode + ': "' + x + '" is on both sides; every link must go from the left column to the right column'); });
      if (lefts.size < 2 || rights.size < 2) e.push(mode + ': needs at least two cards on each side');
      if (lefts.size > 7 || rights.size > 7) e.push(mode + ': at most 7 cards on each side');
    }
  }

  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object { mode, … }'];
    Object.keys(c).forEach((k) => { if (!['mode', 'nodes', 'links', 'questions', 'columns', 'title', 'intro'].includes(k)) e.push('unknown key: ' + k + ' (use mode, nodes, links, questions, columns, title, intro)'); });
    if (!MODES.includes(c.mode)) { e.push('mode must be one of ' + MODES.join(', ')); return e; }
    if (c.title != null && !isBi(c.title)) e.push('title needs both en and hi');
    if (c.intro != null && !isBi(c.intro)) e.push('intro needs both en and hi');
    if (c.mode === 'survey') {
      if (c.nodes != null || c.links != null) e.push('survey mode takes questions only (no nodes or links)');
      if (c.columns != null) e.push('columns are only for institutions, change and compare');
    } else {
      if ((c.nodes == null) !== (c.links == null)) e.push('give nodes and links together, or neither to use the built-in set');
      else if (c.nodes != null) validateGraph(c, e);
      if (c.columns != null) {
        if (!BIP.includes(c.mode)) e.push('columns are only for institutions, change and compare');
        else if (!Array.isArray(c.columns) || c.columns.length !== 2 || !c.columns.every((x) => isBi(x) && x.en.length <= 30 && DEV.test(x.hi))) e.push('columns: two headings { en, hi } of 30 characters at most, hi in Devanagari');
      }
    }
    if (c.questions != null) validateQuestions(c.questions, c.mode, e);
    return e;
  }

  function keys(c) {
    const targets = [], events = [];
    let R;
    try { R = resolve(c); } catch (err) { return { targets, events }; }
    if (R.mode !== 'survey') { R.nodes.forEach((n) => { if (n && typeof n.id === 'string') targets.push('node:' + n.id); }); targets.push('link', 'reset'); events.push('linked'); }
    R.questions.forEach((q) => q.options.forEach((o) => targets.push('option:' + o.id)));
    if (R.questions.length) {
      targets.push('answer'); events.push('answered');
      if (R.questions.some((q) => q.answer != null)) events.push('answered:right', 'answered:wrong');
      if (R.mode === 'survey') targets.push('again', 'clear');
    }
    events.push('complete');
    return { targets, events };
  }

  // ---------------------------------------------------------------- styles
  const css = `
.sc { --sc-acc: #BE185D; --sc-on: #fff; --sc-r: 18px; display: grid; gap: 14px; min-width: 0; color: var(--ink); font-family: var(--font-body, system-ui, sans-serif); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .sc { --sc-acc: #F472B6; --sc-on: #1E293B; } }
:root[data-theme="dark"] .sc { --sc-acc: #F472B6; --sc-on: #1E293B; }
.sc *, .sc *::before, .sc *::after { box-sizing: border-box; }
.sc-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
.sc-title { margin: 0; flex: 1 1 200px; font-family: var(--font-display, inherit); font-weight: 800; font-size: 1.3rem; line-height: 1.2; }
.sc-prog { display: flex; align-items: center; gap: 10px; flex: 1 1 160px; max-width: 280px; }
.sc-bar { flex: 1; height: 12px; border-radius: 999px; background: var(--sunk); border: 1px solid var(--line); overflow: hidden; }
.sc-bar > i { display: block; height: 100%; width: 0; border-radius: 999px; background: linear-gradient(90deg, #02CFF9, #14B8A6, #22C55E); transition: width .45s cubic-bezier(.3,1.3,.5,1); }
.sc-cnt { font-family: var(--font-display, inherit); font-weight: 700; white-space: nowrap; }
.sc-intro { margin: 0; color: var(--ink-2); font-size: .98rem; line-height: 1.45; }
.sc-stage { position: relative; height: var(--sc-h, 460px); border-radius: var(--sc-r); overflow: hidden; container-type: inline-size;
  background: radial-gradient(circle at 12% 10%, color-mix(in srgb, #FFD23F 22%, transparent), transparent 40%), radial-gradient(circle at 90% 90%, color-mix(in srgb, #02CFF9 20%, transparent), transparent 42%), linear-gradient(160deg, color-mix(in srgb, #BE185D 8%, var(--surface)), color-mix(in srgb, #8B3DFF 8%, var(--surface)));
  border: 2px solid var(--line); box-shadow: inset 0 2px 10px rgba(6,18,51,.06); }
.sc-colh { position: absolute; top: 8px; z-index: 5; margin: 0; width: 42%; text-align: center; font-family: var(--font-display, inherit); font-weight: 800; font-size: .9rem; color: var(--ink-2); pointer-events: none; }
.sc-bip { padding-top: 26px; }
.sc-lines { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; overflow: visible; }
.sc-lines path { fill: none; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.sc-ln-o { stroke: var(--surface); stroke-width: 9px; opacity: .9; }
.sc-ln { stroke: var(--sc-acc); stroke-width: 4px; }
.sc-ln.sc-new, .sc-ln-o.sc-new { animation: sc-draw .7s ease-out; }
.sc-node { position: absolute; z-index: 3; translate: -50% -50%; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 4px 8px; border-radius: 16px; border: 2px solid transparent; background: transparent; color: var(--ink); font: inherit; cursor: pointer; touch-action: manipulation; transition: transform .18s, background .18s, border-color .18s, box-shadow .18s; -webkit-tap-highlight-color: transparent; }
.sc-node:hover { transform: translateY(-2px); background: color-mix(in srgb, var(--surface) 70%, transparent); }
.sc-node:focus-visible, .sc-btn:focus-visible, .sc-opt:focus-visible { outline: 3px solid var(--cyan, #02CFF9); outline-offset: 2px; }
.sc-node[aria-pressed="true"] { background: var(--surface); border-color: var(--sc-acc); box-shadow: 0 0 0 4px color-mix(in srgb, var(--sc-acc) 30%, transparent), 0 10px 20px rgba(6,18,51,.16); transform: translateY(-3px) scale(1.04); }
.sc-av { position: relative; width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; flex: none; background: linear-gradient(145deg, var(--c2), var(--c)); color: var(--tc); box-shadow: 0 4px 10px rgba(6,18,51,.22), inset 0 2px 0 rgba(255,255,255,.35); }
.sc-av svg { width: 26px; height: 26px; }
.sc-nl { font-weight: 700; font-size: .78rem; line-height: 1.2; text-align: center; overflow-wrap: anywhere; hyphens: auto; max-width: 100%; background: color-mix(in srgb, var(--surface) 88%, transparent); border-radius: 8px; padding: 1px 4px; }
.sc-dots { display: flex; gap: 3px; min-height: 8px; }
.sc-dots i { width: 8px; height: 8px; border-radius: 50%; border: 2px solid var(--sc-acc); }
.sc-dots i.on { background: var(--sc-acc); }
.sc-ok { position: absolute; top: -4px; right: -4px; width: 20px; height: 20px; border-radius: 50%; background: #22C55E; color: #1E293B; font-size: .75rem; font-weight: 800; display: grid; place-items: center; border: 2px solid var(--surface); }
.sc-tree .sc-node { width: calc(100% / var(--m) - 4px); max-width: 124px; }
.sc-web .sc-node { width: 96px; }
.sc-bip .sc-node { width: 42%; flex-direction: row; justify-content: flex-start; gap: 8px; padding: 6px 8px; background: var(--surface); border-color: var(--line); box-shadow: 0 3px 8px rgba(6,18,51,.10); text-align: left; }
.sc-bip .sc-av { width: 38px; height: 38px; } .sc-bip .sc-av svg { width: 22px; height: 22px; }
.sc-bip .sc-nl { text-align: left; background: none; padding: 0; font-size: .8rem; flex: 1; min-width: 0; }
.sc-bip .sc-col { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.sc-bip .sc-node[aria-pressed="true"] { transform: translateY(-2px) scale(1.03); }
.sc-bd { position: absolute; z-index: 4; translate: -50% -50%; display: inline-flex; align-items: center; gap: 5px; max-width: 46%; pointer-events: none; animation: sc-pop .5s cubic-bezier(.3,1.6,.5,1); }
.sc-bd b { flex: none; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--sc-acc); color: var(--sc-on); font-size: .78rem; font-weight: 800; border: 2px solid var(--surface); box-shadow: 0 2px 6px rgba(6,18,51,.3); }
.sc-bd i { display: none; font-style: normal; font-size: .72rem; font-weight: 700; line-height: 1.15; padding: 3px 8px; border-radius: 10px; background: var(--surface); border: 1px solid var(--sc-acc); box-shadow: 0 2px 6px rgba(6,18,51,.15); }
@container (min-width: 620px) { .sc-web .sc-bd i, .sc-tree .sc-bd i { display: inline-block; } }
.sc-fb { display: flex; gap: 10px; align-items: center; min-height: 64px; padding: 10px 14px; border-radius: var(--sc-r); background: var(--sunk); border: 1px solid var(--line); line-height: 1.45; }
.sc-fb-i { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; background: var(--royal-t); color: var(--royal); }
.sc-fb-t { min-width: 0; overflow-wrap: anywhere; } .sc-fb-t strong { font-family: var(--font-display, inherit); }
.sc-fb.sc-good { background: var(--good-t); border-color: var(--good); } .sc-fb.sc-good .sc-fb-i { background: var(--good); color: #fff; }
.sc-fb.sc-bad { background: var(--bad-t); border-color: var(--bad); } .sc-fb.sc-bad .sc-fb-i { background: var(--bad); color: #fff; }
.sc-fb.sc-win { background: var(--sun-t); border-color: var(--sun); } .sc-fb.sc-win .sc-fb-i { background: var(--sun); color: #1E293B; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .sc-fb.sc-good .sc-fb-i, :root:not([data-theme="light"]) .sc-fb.sc-bad .sc-fb-i { color: #1E293B; } }
:root[data-theme="dark"] .sc-fb.sc-good .sc-fb-i, :root[data-theme="dark"] .sc-fb.sc-bad .sc-fb-i { color: #1E293B; }
.sc-act { display: flex; flex-wrap: wrap; gap: 10px; }
.sc-btn { min-height: 48px; min-width: 120px; padding: 10px 20px; border-radius: 14px; border: 2px solid var(--line); border-bottom-width: 4px; background: var(--surface); color: var(--ink); font-family: var(--font-display, inherit); font-weight: 700; font-size: 1.05rem; cursor: pointer; transition: transform .15s, opacity .15s; }
.sc-btn:hover { transform: translateY(-2px); }
.sc-btn.sc-main { background: var(--sc-acc); border-color: color-mix(in srgb, var(--sc-acc) 70%, #000); color: var(--sc-on); }
.sc-btn[aria-disabled="true"] { opacity: .55; }
.sc-h4 { margin: 0 0 6px; font-family: var(--font-display, inherit); font-weight: 700; font-size: 1.02rem; color: var(--ink-2); }
.sc-found { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.sc-found li { display: flex; align-items: flex-start; gap: 10px; padding: 8px 12px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); font-size: .92rem; line-height: 1.35; animation: sc-fade .4s ease-out; }
.sc-found li > b { flex: none; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--sc-acc); color: var(--sc-on); font-size: .78rem; }
.sc-found li > span { min-width: 0; overflow-wrap: anywhere; } .sc-found em { font-style: normal; color: var(--ink-2); }
.sc-q { display: grid; gap: 10px; padding: 14px; border-radius: var(--sc-r); background: var(--surface); border: 2px solid var(--line); box-shadow: 0 3px 10px rgba(6,18,51,.07); }
.sc-q.sc-on { border-color: var(--sc-acc); }
.sc-q.sc-lock { opacity: .6; }
.sc-qh { margin: 0; font-family: var(--font-display, inherit); font-weight: 700; font-size: 1.08rem; line-height: 1.3; }
.sc-qn { display: inline-grid; place-items: center; width: 28px; height: 28px; margin-right: 8px; border-radius: 50%; background: var(--sc-acc); color: var(--sc-on); font-size: .85rem; vertical-align: middle; }
.sc-opts { display: grid; gap: 8px; }
.sc-opt { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 48px; padding: 8px 12px; border-radius: 14px; border: 2px solid var(--line); border-bottom-width: 4px; background: var(--surface); color: var(--ink); font: inherit; font-weight: 600; text-align: left; cursor: pointer; transition: transform .15s, border-color .15s, background .15s; }
.sc-opt:hover { transform: translateY(-1px); border-color: var(--sc-acc); }
.sc-opt .sc-ol { flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-size: .85rem; font-weight: 800; background: var(--sunk); border: 2px solid var(--line); }
.sc-opt[aria-checked="true"] { border-color: var(--sc-acc); background: color-mix(in srgb, var(--sc-acc) 12%, var(--surface)); }
.sc-opt[aria-checked="true"] .sc-ol { background: var(--sc-acc); color: var(--sc-on); border-color: var(--sc-acc); }
.sc-opt.sc-x { opacity: .5; text-decoration: line-through; cursor: not-allowed; }
.sc-opt.sc-right { border-color: var(--good); background: var(--good-t); }
.sc-res { display: grid; gap: 8px; }
.sc-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; align-items: center; font-size: .92rem; }
.sc-row .sc-lab { min-width: 0; overflow-wrap: anywhere; font-weight: 600; }
.sc-row .sc-n { font-family: var(--font-display, inherit); font-weight: 700; white-space: nowrap; }
.sc-track { grid-column: 1 / -1; height: 14px; border-radius: 999px; background: var(--sunk); border: 1px solid var(--line); overflow: hidden; }
.sc-track > i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--c2), var(--c)); transition: width .6s cubic-bezier(.3,1.1,.5,1); }
.sc-you { font-size: .72rem; font-weight: 800; padding: 1px 7px; margin-left: 6px; border-radius: 999px; background: var(--sc-acc); color: var(--sc-on); }
.sc-note { margin: 0; font-size: .86rem; color: var(--ink-2); display: flex; gap: 8px; align-items: flex-start; }
.sc-why { margin: 0; padding: 8px 12px; border-radius: 12px; background: var(--good-t); border: 1px solid var(--good); font-size: .95rem; line-height: 1.4; }
.sc-qfb { margin: 0; padding: 8px 12px; border-radius: 12px; background: var(--sunk); border: 1px solid var(--line); font-size: .95rem; line-height: 1.4; }
.sc-qfb.sc-bad { background: var(--bad-t); border-color: var(--bad); }
.sc-shake { animation: sc-shake .45s; }
@keyframes sc-draw { from { stroke-opacity: 0; stroke-width: 12px; } to { stroke-opacity: 1; } }
@keyframes sc-pop { 0% { transform: scale(.4); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@keyframes sc-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes sc-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-7px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(2px); } }
@media (prefers-reduced-motion: reduce) { .sc *, .sc *::before { animation: none !important; transition: none !important; } }
@media (max-width: 420px) { .sc-title { font-size: 1.15rem; } .sc-av { width: 40px; height: 40px; } .sc-av svg { width: 23px; height: 23px; } .sc-nl { font-size: .72rem; } .sc-web .sc-node { width: 82px; } .sc-btn { flex: 1; min-width: 0; padding: 10px 12px; }
  .sc-bip .sc-node { padding: 5px 6px; gap: 6px; } .sc-bip .sc-av { width: 32px; height: 32px; } .sc-bip .sc-av svg { width: 19px; height: 19px; } .sc-bip .sc-nl { font-size: .72rem; } }
`;

  // ---------------------------------------------------------------- the interactive part
  function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }

  function mount(root, config, api) {
    const R = resolve(config);
    const mode = R.mode, isSurvey = mode === 'survey', isBip = BIP.includes(mode);
    const nodes = R.nodes, links = R.links, qs = R.questions;
    const byNode = {}, nidx = {}; nodes.forEach((n, i) => { byNode[n.id] = n; nidx[n.id] = i; });
    const geo = isSurvey ? null : layout(R);
    const linkAt = {}; links.forEach((l, i) => { linkAt[[l[0], l[1]].sort().join('|')] = i; });
    const degree = {}; links.forEach((l) => { degree[l[0]] = (degree[l[0]] || 0) + 1; degree[l[1]] = (degree[l[1]] || 0) + 1; });
    const m = (en, hi) => api.t({ en, hi });
    const T = (x) => api.t(x);
    let destroyed = false, timer = 0, clearTimer = 0;

    // survey tallies: kept in this browser only
    const skey = 'nca-society-survey:' + hash(qs.map((q) => q.id + q.q.en).join('|'));
    let tally = {};
    if (isSurvey) {
      try { const j = JSON.parse(window.localStorage.getItem(skey) || '{}'); qs.forEach((q) => { if (Array.isArray(j[q.id]) && j[q.id].length === q.options.length && j[q.id].every((v) => Number.isInteger(v) && v >= 0)) tally[q.id] = j[q.id]; }); } catch (e) { tally = {}; }
    }
    const saveTally = () => { try { window.localStorage.setItem(skey, JSON.stringify(tally)); } catch (e) { /* private mode: the tally stays in memory */ } };

    const fresh = () => ({ sel: [], found: [], wrong: 0, msg: null, newLink: -1, done: false, qs: {}, qdone: false, confirmClear: false });
    let st = fresh();
    const qstate = (q) => st.qs[q.id] || (st.qs[q.id] = { pick: null, tries: 0, done: false, mine: null, bad: [], msg: null });
    const curQ = () => qs.findIndex((q) => !qstate(q).done);
    const name = (id) => T(byNode[id].label);

    // ----- graph pieces
    function nodeHTML(n) {
      const p = geo.pos[n.id]; if (!p) return '';
      const pal = PAL[nidx[n.id] % PAL.length];
      const got = st.found.filter((li) => links[li][0] === n.id || links[li][1] === n.id).length;
      const dots = Array.from({ length: degree[n.id] || 0 }, (_, i) => `<i class="${i < got ? 'on' : ''}"></i>`).join('');
      const full = got === degree[n.id];
      const sel = st.sel.includes(n.id);
      const label = T(n.label);
      const aria = label + ', ' + m(got + ' of ' + degree[n.id] + ' links found', degree[n.id] + ' में से ' + got + ' जोड़ मिले');
      const bar = geo.kind === 'bip' ? `<span class="sc-col"><span class="sc-nl">${esc(label)}</span><span class="sc-dots" aria-hidden="true">${dots}</span></span>` : `<span class="sc-nl">${esc(label)}</span><span class="sc-dots" aria-hidden="true">${dots}</span>`;
      return `<button type="button" class="sc-node${st.shake === n.id ? ' sc-shake' : ''}" data-key="node:${esc(n.id)}" data-node="${esc(n.id)}" aria-pressed="${sel}" aria-label="${esc(aria)}" style="left:${p.x.toFixed(2)}%;top:${p.y.toFixed(2)}%;--c:${pal.c};--c2:${pal.c2};--tc:${pal.t}"><span class="sc-av" aria-hidden="true">${iconSVG(n.icon)}${full ? '<span class="sc-ok">✓</span>' : ''}</span>${bar}</button>`;
    }

    function stageHTML() {
      const paths = st.found.map((li) => {
        const g = geo.links[li], nw = li === st.newLink ? ' sc-new' : '';
        return `<path class="sc-ln-o${nw}" d="${g.d}"/><path class="sc-ln${nw}" d="${g.d}"/>`;
      }).join('');
      const badges = st.found.map((li, k) => {
        const g = geo.links[li];
        return `<span class="sc-bd" style="left:${g.bx.toFixed(2)}%;top:${g.by.toFixed(2)}%"><b>${k + 1}</b><i>${esc(T(links[li][2]))}</i></span>`;
      }).join('');
      let heads = '';
      if (isBip) heads = `<p class="sc-colh" style="left:3%">${esc(T(R.columns[0]))}</p><p class="sc-colh" style="left:55%">${esc(T(R.columns[1]))}</p>`;
      return `<div class="sc-stage sc-${geo.kind}" style="--sc-h:${geo.h}px;--m:${geo.M}">${heads}<svg class="sc-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>${nodes.map(nodeHTML).join('')}${badges}</div>`;
    }

    function foundHTML() {
      if (!st.found.length) return '';
      const items = st.found.map((li, k) => `<li><b>${k + 1}</b><span><strong>${esc(name(links[li][0]))}</strong> <em>↔</em> <strong>${esc(name(links[li][1]))}</strong><br>${esc(T(links[li][2]))}</span></li>`).join('');
      return `<div><p class="sc-h4">${esc(m('What you have found', 'तुमने क्या खोजा'))}</p><ol class="sc-found">${items}</ol></div>`;
    }

    // ----- questions
    function barsHTML(q, s) {
      const counts = tally[q.id] || q.options.map(() => 0);
      const total = counts.reduce((a, b) => a + b, 0) || 1;
      return `<div class="sc-res">${q.options.map((o, i) => {
        const pal = PAL[i % PAL.length], pct = Math.round((100 * counts[i]) / total);
        return `<div class="sc-row"><span class="sc-lab">${esc(T(o))}${s.mine === i ? `<span class="sc-you">${esc(m('You', 'तुम'))}</span>` : ''}</span><span class="sc-n">${counts[i]} · ${pct}%</span><div class="sc-track" role="img" aria-label="${esc(T(o) + ': ' + counts[i])}"><i style="width:${pct}%;--c:${pal.c};--c2:${pal.c2}"></i></div></div>`;
      }).join('')}</div>`;
    }

    function qHTML(q, qi, cur) {
      const s = qstate(q);
      const head = `<h4 class="sc-qh"><span class="sc-qn" aria-hidden="true">${qi + 1}</span>${esc(T(q.q))}</h4>`;
      if (s.done) {
        if (isSurvey) {
          const total = (tally[q.id] || []).reduce((a, b) => a + b, 0);
          return `<section class="sc-q">${head}${barsHTML(q, s)}<p class="sc-note"><span aria-hidden="true">🔒</span><span>${esc(m(total + (total === 1 ? ' answer' : ' answers') + ' counted on this device.', 'इस उपकरण पर ' + total + ' उत्तर गिने गए।'))}</span></p></section>`;
        }
        return `<section class="sc-q">${head}<div class="sc-opts">${q.options.map((o, i) => `<div class="sc-opt${i === q.answer ? ' sc-right' : ' sc-x'}"><span class="sc-ol" aria-hidden="true">${i === q.answer ? '✓' : String.fromCharCode(65 + i)}</span><span>${esc(T(o))}</span></div>`).join('')}</div>${q.why ? `<p class="sc-why">${esc(T(q.why))}</p>` : ''}</section>`;
      }
      if (!cur) return `<section class="sc-q sc-lock" aria-label="${esc(m('Question ' + (qi + 1) + ', waiting', 'प्रश्न ' + (qi + 1) + ', प्रतीक्षा में'))}">${head}</section>`;
      const opts = q.options.map((o, i) => {
        const bad = s.bad.includes(i);
        const reveal = !isSurvey && s.tries >= 2 && i === q.answer;
        return `<button type="button" role="radio" class="sc-opt${bad ? ' sc-x' : ''}${reveal ? ' sc-right' : ''}" data-key="option:${esc(o.id)}" data-opt="${i}" aria-checked="${s.pick === i}"${bad ? ' aria-disabled="true"' : ''}><span class="sc-ol" aria-hidden="true">${String.fromCharCode(65 + i)}</span><span>${esc(T(o))}</span></button>`;
      }).join('');
      const fb = s.msg ? `<p class="sc-qfb ${s.msg.kind === 'bad' ? 'sc-bad' : ''}" role="status" aria-live="polite">${esc(s.msg.text)}</p>` : '<p class="sc-qfb" role="status" aria-live="polite">' + esc(isSurvey ? m('There is no right or wrong answer. Pick the one that is true for you.', 'कोई उत्तर सही या ग़लत नहीं है। जो तुम्हारे लिए सच है वही चुनो।') : m('Pick one answer, then press "Answer".', 'एक उत्तर चुनो, फिर "उत्तर दो" दबाओ।')) + '</p>';
      return `<section class="sc-q sc-on">${head}<div class="sc-opts" role="radiogroup" aria-label="${esc(T(q.q))}">${opts}</div>${fb}<div class="sc-act"><button type="button" class="sc-btn sc-main" data-key="answer" aria-disabled="${s.pick == null}">${esc(m('Answer', 'उत्तर दो'))}</button></div></section>`;
    }

    function qsHTML() {
      if (!qs.length) return '';
      const cur = curQ();
      const h = isSurvey ? '' : `<p class="sc-h4">${esc(m('Think about it', 'ज़रा सोचो'))}</p>`;
      let extra = '';
      if (isSurvey) {
        extra = `<p class="sc-note"><span aria-hidden="true">🔒</span><span>${esc(m('Answers stay on this device only. Nothing is sent anywhere.', 'उत्तर केवल इसी उपकरण पर रहते हैं। कहीं कुछ भेजा नहीं जाता।'))}</span></p>`;
        if (cur < 0) extra += `<div class="sc-fb sc-win" role="status"><span class="sc-fb-i" aria-hidden="true">★</span><div class="sc-fb-t"><strong>${esc(m('Survey complete!', 'सर्वेक्षण पूरा हुआ!'))}</strong> ${esc(m('Now ask a friend to answer too and watch the bars change.', 'अब किसी दोस्त से भी उत्तर दिलवाओ और देखो पट्टियाँ कैसे बदलती हैं।'))}</div></div>`;
        extra += `<div class="sc-act"><button type="button" class="sc-btn sc-main" data-key="again">${esc(m('Ask another person', 'किसी और से पूछो'))}</button><button type="button" class="sc-btn" data-key="clear">${esc(st.confirmClear ? m('Press again to erase', 'मिटाने के लिए फिर दबाओ') : m('Erase answers', 'उत्तर मिटाओ'))}</button></div>`;
      }
      return `<div style="display:grid;gap:10px">${h}${qs.map((q, i) => qHTML(q, i, i === cur)).join('')}${extra}</div>`;
    }

    function render() {
      if (destroyed) return;
      const act = root.contains(document.activeElement) ? document.activeElement.getAttribute('data-key') : null;
      let progress, total;
      if (isSurvey) { total = qs.length; progress = qs.filter((q) => qstate(q).done).length; } else { total = links.length; progress = st.found.length; }
      const unit = isSurvey ? m('answered', 'उत्तर दिए') : m('links', 'जोड़');
      const head = `<div class="sc-head"><h3 class="sc-title">${esc(T(R.title))}</h3><div class="sc-prog"><div class="sc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${progress}" aria-label="${esc(unit)}"><i style="width:${(100 * progress) / total}%"></i></div><span class="sc-cnt">${progress} / ${total}</span></div></div><p class="sc-intro">${esc(T(R.intro))}</p>`;
      let body = '';
      if (!isSurvey) {
        const mm = st.msg;
        const ready = st.sel.length === 2;
        const icon = !mm ? '?' : mm.kind === 'good' ? '✓' : mm.kind === 'bad' ? '✗' : mm.kind === 'win' ? '★' : 'i';
        const dflt = isBip ? m('Pick one card on the left and one on the right.', 'बाईं ओर से एक और दाईं ओर से एक कार्ड चुनो।') : m('Pick two cards, then press "Link them".', 'दो कार्ड चुनो, फिर "इन्हें जोड़ो" दबाओ।');
        body = `${stageHTML()}<div class="sc-fb ${mm ? 'sc-' + mm.kind : ''}" role="status" aria-live="polite"><span class="sc-fb-i" aria-hidden="true">${icon}</span><div class="sc-fb-t">${mm ? mm.html : esc(dflt)}</div></div>
<div class="sc-act"><button type="button" class="sc-btn sc-main" data-key="link" aria-disabled="${!ready}">${esc(m('Link them', 'इन्हें जोड़ो'))}</button><button type="button" class="sc-btn" data-key="reset">${esc(m('Start again', 'फिर से शुरू'))}</button></div>${foundHTML()}`;
      }
      root.innerHTML = `<div class="sc">${head}${body}${qsHTML()}</div>`;
      st.shake = null;
      if (act) { const el = root.querySelector('[data-key="' + act.replace(/"/g, '\\"') + '"]'); if (el) el.focus({ preventScroll: true }); }
    }

    const say = (kind, html) => { st.msg = { kind, html }; };

    // ----- linking
    function pickNode(id) {
      if (!api.allowed('node:' + id)) { api.nudge('node:' + id); return; }
      const i = st.sel.indexOf(id);
      if (i >= 0) { st.sel.splice(i, 1); say('info', esc(m('Choose again.', 'फिर से चुनो।'))); render(); return; }
      if (isBip && st.sel.length === 1 && geo.side[st.sel[0]] === geo.side[id]) st.sel = [];
      if (st.sel.length === 2) st.sel.shift();
      st.sel.push(id);
      const n = byNode[id];
      if (st.sel.length === 1) say('info', `<strong>${esc(name(id))}.</strong> ${n.note ? esc(T(n.note)) + ' ' : ''}${esc(isBip ? m('Now pick its partner on the other side.', 'अब दूसरी ओर से इसका जोड़ीदार चुनो।') : m('Now pick who is linked to it.', 'अब चुनो कि इससे कौन जुड़ा है।'))}`);
      else say('info', `<strong>${esc(name(st.sel[0]))}</strong> + <strong>${esc(name(st.sel[1]))}.</strong> ${esc(m('Press "Link them".', '"इन्हें जोड़ो" दबाओ।'))}`);
      render();
    }

    function tryLink() {
      if (!api.allowed('link')) { api.nudge('link'); return; }
      if (st.sel.length < 2) { say('info', esc(m('Pick two cards first.', 'पहले दो कार्ड चुनो।'))); render(); return; }
      const [a, b] = st.sel;
      const li = linkAt[[a, b].sort().join('|')];
      if (li != null && st.found.includes(li)) { say('info', esc(m('You have already linked these two.', 'इन दोनों को तुम पहले ही जोड़ चुके हो।'))); st.sel = []; render(); return; }
      if (li != null) {
        st.found.push(li); st.newLink = li; st.sel = [];
        const l = links[li];
        say('good', `<strong>${esc(name(l[0]))} ↔ ${esc(name(l[1]))}:</strong> ${esc(T(l[2]))}.`);
        api.record(m('Linked ' + tx(byNode[l[0]].label, 'en') + ' and ' + tx(byNode[l[1]].label, 'en') + ': ' + l[2].en, byNode[l[0]].label.hi + ' और ' + byNode[l[1]].label.hi + ' को जोड़ा: ' + l[2].hi));
        api.emit('linked');
        api.speak(name(l[0]) + ', ' + name(l[1]) + ': ' + T(l[2]), api.lang());
        if (st.found.length === links.length) {
          st.done = true;
          say('win', `<strong>${esc(m('All linked!', 'सब जुड़ गया!'))}</strong> ${esc(m('You found all ' + links.length + ' links. Tap a card to read about it again.', 'तुमने सभी ' + links.length + ' जोड़ खोज लिए। किसी कार्ड को छूकर फिर पढ़ सकते हो।'))}`);
          api.record(m('Found all ' + links.length + ' links', 'सभी ' + links.length + ' जोड़ खोजे'));
          api.emit('complete'); api.celebrate();
        }
      } else {
        st.wrong++; st.shake = b; st.sel = [];
        const left = (degree[a] || 0) - st.found.filter((x) => links[x][0] === a || links[x][1] === a).length;
        const hint = st.wrong >= 2 ? ' ' + (left > 0 ? m(name(a) + ' still has ' + left + (left === 1 ? ' link' : ' links') + ' to find (see the dots).', name(a) + ' के ' + left + ' जोड़ अभी खोजने बाकी हैं (बिंदुओं को देखो)।') : m(name(a) + ' has all its links. Try another card.', name(a) + ' के सारे जोड़ मिल चुके हैं। कोई दूसरा कार्ड आज़माओ।')) : '';
        say('bad', `<strong>${esc(m('Not linked. Try another pair.', 'ये आपस में जुड़े नहीं हैं। दूसरी जोड़ी आज़माओ।'))}</strong>${esc(hint)}`);
        api.record(m('Tried a wrong link: ' + tx(byNode[a].label, 'en') + ' and ' + tx(byNode[b].label, 'en'), 'ग़लत जोड़ आज़माया: ' + byNode[a].label.hi + ' और ' + byNode[b].label.hi));
      }
      render();
    }

    function reset() {
      if (!api.allowed('reset')) { api.nudge('reset'); return; }
      st = fresh();
      say('info', esc(m('All cleared. Start linking again!', 'सब साफ़ हो गया। फिर से जोड़ना शुरू करो!')));
      api.record(m('Started again', 'फिर से शुरू किया'));
      render();
    }

    // ----- questions
    function pickOption(qi, oi) {
      const q = qs[qi], o = q.options[oi], s = qstate(q);
      if (!api.allowed('option:' + o.id)) { api.nudge('option:' + o.id); return; }
      if (s.bad.includes(oi)) return;
      s.pick = oi; s.msg = null;
      render();
    }

    function answer() {
      if (!api.allowed('answer')) { api.nudge('answer'); return; }
      const qi = curQ(); if (qi < 0) return;
      const q = qs[qi], s = qstate(q);
      if (s.pick == null) { s.msg = { kind: 'info', text: m('Pick an answer first.', 'पहले एक उत्तर चुनो।') }; render(); return; }
      const picked = s.pick;
      api.emit('answered');
      if (isSurvey) {
        const c = tally[q.id] || (tally[q.id] = q.options.map(() => 0));
        c[picked]++; saveTally();
        s.done = true; s.mine = picked; s.pick = null;
        api.record(m('Survey: "' + q.q.en + '" answered "' + q.options[picked].en + '"', 'सर्वेक्षण: "' + q.q.hi + '" का उत्तर "' + q.options[picked].hi + '"'));
        if (curQ() < 0) { st.qdone = true; api.emit('complete'); api.celebrate(); }
      } else if (picked === q.answer) {
        s.done = true; s.pick = null;
        api.record(m('Answered "' + q.q.en + '" correctly', '"' + q.q.hi + '" का उत्तर सही दिया'));
        api.emit('answered:right');
        if (q.why) api.speak(T(q.why), api.lang());
      } else {
        s.tries++; s.bad.push(picked); s.pick = null;
        s.msg = { kind: 'bad', text: s.tries >= 2 ? m('Not this one. Look at the highlighted answer.', 'यह नहीं। चमकता हुआ उत्तर देखो।') : m('Not quite. Think again and try another answer.', 'लगभग। फिर सोचो और दूसरा उत्तर चुनो।') };
        api.record(m('Wrong answer to "' + q.q.en + '": "' + q.options[picked].en + '"', '"' + q.q.hi + '" का ग़लत उत्तर: "' + q.options[picked].hi + '"'));
        api.emit('answered:wrong');
      }
      render();
    }

    function again() {
      if (!api.allowed('again')) { api.nudge('again'); return; }
      st.qs = {}; st.qdone = false; st.confirmClear = false;
      api.record(m('Asked another person', 'किसी और से पूछा'));
      render();
    }

    function clearTally() {
      if (!api.allowed('clear')) { api.nudge('clear'); return; }
      if (!st.confirmClear) { st.confirmClear = true; clearTimeout(clearTimer); clearTimer = setTimeout(() => { st.confirmClear = false; render(); }, 4000); render(); return; }
      clearTimeout(clearTimer);
      tally = {}; saveTally(); st.qs = {}; st.confirmClear = false;
      api.record(m('Erased the survey answers on this device', 'इस उपकरण के सर्वेक्षण उत्तर मिटाए'));
      render();
    }

    function onClick(ev) {
      const k = ev.target.closest('[data-key]');
      if (!k || !root.contains(k)) return;
      const key = k.getAttribute('data-key');
      if (k.hasAttribute('data-node')) pickNode(k.getAttribute('data-node'));
      else if (k.hasAttribute('data-opt')) pickOption(curQ(), +k.getAttribute('data-opt'));
      else if (key === 'link') tryLink();
      else if (key === 'reset') reset();
      else if (key === 'answer') answer();
      else if (key === 'again') again();
      else if (key === 'clear') clearTally();
    }
    root.addEventListener('click', onClick);
    render();
    return {
      destroy() { destroyed = true; clearTimeout(timer); clearTimeout(clearTimer); root.removeEventListener('click', onClick); root.innerHTML = ''; },
    };
  }

  NCA_T.register({
    id: 'society',
    css,
    validate,
    keys,
    demo: {
      mode: 'family-tree',
      questions: [
        { id: 'fam', q: T2('A home where grandparents, parents and children live together is usually called a…', 'जिस घर में दादा-दादी, माता-पिता और बच्चे साथ रहते हैं, उसे आमतौर पर क्या कहते हैं?'),
          options: [T2('Nuclear family', 'एकल परिवार'), T2('Joint family', 'संयुक्त परिवार'), T2('Single-parent family', 'एकल-अभिभावक परिवार')], answer: 1,
          why: T2('A joint family has parents, their children and other relatives such as grandparents, uncles and aunts living together in one household.', 'संयुक्त परिवार में माता-पिता, बच्चे और दादा-दादी, चाचा-चाची जैसे दूसरे रिश्तेदार एक ही घर में साथ रहते हैं।') },
        { id: 'cous', q: T2("What is your relation to your uncle's child?", 'तुम्हारे चाचा की संतान तुम्हारी क्या लगती है?'),
          options: [T2('Cousin', 'चचेरा भाई या बहन'), T2('Own brother or sister', 'सगा भाई या बहन'), T2('Uncle', 'चाचा')], answer: 0,
          why: T2('The children of your uncles and aunts are your cousins.', 'चाचा-चाची की संतान तुम्हारे चचेरे भाई-बहन होते हैं।') },
      ],
    },
    mount,
  });
})();
