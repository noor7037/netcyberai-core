// Template: Business builder. Run a small business: forms of organisation, organisation charts, the planning process,
// the marketing mix, pricing, break-even, working capital, consumer protection and trade channels. The rules are in
// code: break-even = fixed cost / (price - variable cost), profit = (price - cost) x units - fixed cost, working
// capital need = daily cost x (stock days + debtor days - creditor days), the consumer forum is chosen by the value
// paid (District up to Rs 50 lakh, State above 50 lakh up to 2 crore, National above 2 crore, Consumer Protection Act
// 2019 and its 2021 Rules). A lab can only choose among the modes, cases and cards below. Config:
//   { mode: 'form-of-org'|'org-chart'|'planning'|'marketing-mix'|'pricing'|'break-even'|'working-capital'|'consumer'|'trade-channels',
//     business?: { name?: {en,hi}, type?: 'bakery'|'tea'|'tailor'|'stationery'|'repair'|'juice' },
//     params?: object, allowed keys by mode:
//       form-of-org: { case }            org-chart: { chart: 'line'|'functional' }
//       planning: { budget }             marketing-mix: { perP: 1-3 }
//       pricing: { price, fixed }        break-even: { price, variable, fixed, units }
//       working-capital: { stock, debtors, creditors, dailyCost }
//       consumer: { focus: 'rights'|'forum', case, claim }      trade-channels: { product } }
// Targets: choice:<id>, slider:<name>, drag:<card>, slot:<id>, answer, next, reset.
// Events: decided, placed, break-even, answered:right, answered:wrong, moved:<slider>.
(function () {
  const L = window.NCA_LIB;
  const { esc } = L;
  const T2 = (en, hi) => ({ en, hi });
  const MODES = ['form-of-org', 'org-chart', 'planning', 'marketing-mix', 'pricing', 'break-even', 'working-capital', 'consumer', 'trade-channels'];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isInt = (v) => typeof v === 'number' && Number.isInteger(v);
  const fmtInt = (n) => {
    let s = String(Math.abs(Math.round(n)));
    if (s.length > 3) s = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + s.slice(-3);
    return (n < 0 ? '−' : '') + s;
  };
  const R = (n) => (n < 0 ? '−' : '') + '₹' + fmtInt(Math.abs(n));
  const num = (x) => String(Math.round(x * 100) / 100);
  const lakh = (v) => (v >= 1e7 ? num(v / 1e7) + ' crore' : v >= 1e5 ? num(v / 1e5) + ' lakh' : fmtInt(v));
  const lakhHi = (v) => (v >= 1e7 ? num(v / 1e7) + ' करोड़' : v >= 1e5 ? num(v / 1e5) + ' लाख' : fmtInt(v));
  const RL = (v) => T2('₹' + lakh(v), '₹' + lakhHi(v));

  // ---------------------------------------------------------------- the six small businesses
  // v = cost of one unit, F = fixed cost a month, p = usual price, demand = a - b x price, day = money spent a day,
  // st/de/cr = days of stock held, credit given to customers, credit taken from suppliers.
  const BT = {
    bakery: { n: T2('Sweet Bakes', 'स्वीट बेक्स'), u: T2('loaf', 'डबलरोटी'), pl: T2('loaves', 'डबलरोटियाँ'), v: 22, F: 12000, p: 40, a: 3000, b: 50, day: 3000, st: 5, de: 10, cr: 7, col: '#FF7A1A' },
    tea: { n: T2('Chai Point', 'चाय पॉइंट'), u: T2('cup of tea', 'कप चाय'), pl: T2('cups of tea', 'कप चाय'), v: 4, F: 4500, p: 10, a: 2400, b: 100, day: 1500, st: 4, de: 5, cr: 7, col: '#0F766E' },
    tailor: { n: T2('Style Tailors', 'स्टाइल टेलर्स'), u: T2('shirt', 'कमीज़'), pl: T2('shirts', 'कमीज़ें'), v: 150, F: 9000, p: 400, a: 150, b: 0.25, day: 2500, st: 15, de: 20, cr: 10, col: '#8B3DFF' },
    stationery: { n: T2('Pen and Paper', 'पेन और पेपर'), u: T2('notebook', 'कॉपी'), pl: T2('notebooks', 'कॉपियाँ'), v: 28, F: 3000, p: 40, a: 1200, b: 20, day: 2000, st: 30, de: 10, cr: 20, col: '#1D4ED8' },
    repair: { n: T2('Quick Fix Mobile', 'क्विक फ़िक्स मोबाइल'), u: T2('repair job', 'मरम्मत का काम'), pl: T2('repair jobs', 'मरम्मत के काम'), v: 100, F: 8000, p: 300, a: 150, b: 0.25, day: 1800, st: 20, de: 3, cr: 15, col: '#02CFF9' },
    juice: { n: T2('Fresh Sip', 'फ्रेश सिप'), u: T2('glass of juice', 'गिलास जूस'), pl: T2('glasses of juice', 'गिलास जूस'), v: 12, F: 6000, p: 30, a: 1500, b: 30, day: 1200, st: 2, de: 0, cr: 3, col: '#FF6B57' },
  };
  const TYPES = Object.keys(BT);
  const stepOf = (T) => (T.p >= 100 ? 5 : 1);
  const bepOf = (p, v, F) => (p > v ? F / (p - v) : null);
  const demand = (T, p) => Math.max(0, Math.round(T.a - T.b * p));
  const profitAt = (T, F, p) => (p - T.v) * demand(T, p) - F;
  function bestPrice(T, F) {
    let best = null;
    const pz = Math.floor(T.a / T.b);
    for (let p = 1; p <= pz; p++) { const pr = profitAt(T, F, p); if (!best || pr > best.pr) best = { p, pr }; }
    return best;
  }

  // ---------------------------------------------------------------- forms of organisation
  const FORMS = {
    sole: {
      n: T2('Sole proprietor', 'एकल स्वामी'), col: '#FF7A1A',
      p: { owners: T2('One person', 'एक व्यक्ति'), liab: T2('Unlimited: the owner\'s own property can pay the business debts', 'असीमित: व्यवसाय के कर्ज़ चुकाने में मालिक की निजी संपत्ति भी लग सकती है'), cap: T2('Owner\'s savings and loans', 'मालिक की बचत और कर्ज़'), cont: T2('Ends when the owner dies or stops', 'मालिक के न रहने या छोड़ने पर बंद'), law: T2('Easy to start; no special Act', 'शुरू करना आसान; कोई अलग अधिनियम नहीं') },
      trait: T2('one owner who keeps all the profit and takes all the decisions', 'एक मालिक जो सारा लाभ रखता है और सारे निर्णय लेता है'),
    },
    partnership: {
      n: T2('Partnership', 'साझेदारी'), col: '#1D4ED8',
      p: { owners: T2('2 to 50 partners', '2 से 50 साझेदार'), liab: T2('Unlimited: partners together are liable for all the debts', 'असीमित: सभी कर्ज़ों के लिए साझेदार मिलकर ज़िम्मेदार'), cap: T2('Money pooled by the partners', 'साझेदारों की जुटाई हुई पूँजी'), cont: T2('May end when a partner dies or leaves, unless the deed says otherwise', 'साझेदार के न रहने या छोड़ने पर समाप्त हो सकती है, जब तक विलेख में कुछ और न लिखा हो'), law: T2('Indian Partnership Act, 1932', 'भारतीय साझेदारी अधिनियम, 1932') },
      trait: T2('two or more people who share profit and loss by an agreement', 'दो या अधिक लोग जो समझौते के अनुसार लाभ-हानि बाँटते हैं'),
    },
    huf: {
      n: T2('Joint Hindu family', 'संयुक्त हिंदू परिवार'), col: '#8B3DFF',
      p: { owners: T2('Members of one family by birth; the eldest, the Karta, manages', 'एक परिवार के सदस्य (जन्म से); सबसे बड़ा सदस्य, कर्ता, प्रबंध करता है'), liab: T2('Karta: unlimited. Other members: limited to their share in the family property', 'कर्ता: असीमित। अन्य सदस्य: परिवार की संपत्ति में अपने हिस्से तक सीमित'), cap: T2('Family property', 'पारिवारिक संपत्ति'), cont: T2('Continues after the Karta; the next elder takes over', 'कर्ता के बाद भी चलता है; अगला बड़ा सदस्य कर्ता बनता है'), law: T2('Hindu Law', 'हिंदू विधि') },
      trait: T2('a family business where the eldest member (Karta) manages and members join by birth', 'पारिवारिक व्यवसाय जिसे सबसे बड़ा सदस्य (कर्ता) चलाता है और सदस्य जन्म से जुड़ते हैं'),
    },
    coop: {
      n: T2('Co-operative society', 'सहकारी समिति'), col: '#0F766E',
      p: { owners: T2('At least 10 adult members', 'कम से कम 10 वयस्क सदस्य'), liab: T2('Limited to the money each member put in', 'हर सदस्य द्वारा लगाई रक़म तक सीमित'), cap: T2('Members\' shares, loans and help from government', 'सदस्यों के शेयर, कर्ज़ और सरकारी सहायता'), cont: T2('Continues; it does not depend on any one member', 'चलती रहती है; किसी एक सदस्य पर निर्भर नहीं'), law: T2('Co-operative Societies Act, 1912 (and State Acts)', 'सहकारी समिति अधिनियम, 1912 (और राज्यों के अधिनियम)') },
      trait: T2('members join to help each other, and every member has one vote', 'सदस्य एक-दूसरे की मदद के लिए जुड़ते हैं और हर सदस्य का एक ही वोट होता है'),
    },
    private: {
      n: T2('Private company', 'निजी कंपनी'), col: '#02CFF9',
      p: { owners: T2('2 to 200 members', '2 से 200 सदस्य'), liab: T2('Limited to the unpaid value of the shares held', 'रखे हुए शेयरों के अदत्त मूल्य तक सीमित'), cap: T2('Shares sold to members only, not to the public', 'शेयर केवल सदस्यों को, जनता को नहीं'), cont: T2('Continues: the company is a separate legal person', 'चलती रहती है: कंपनी अलग कानूनी व्यक्ति है'), law: T2('Companies Act, 2013', 'कंपनी अधिनियम, 2013') },
      trait: T2('a company with a few members, limited liability, and no shares offered to the public', 'कुछ सदस्यों वाली कंपनी, सीमित दायित्व, जनता को शेयर नहीं'),
    },
    public: {
      n: T2('Public company', 'सार्वजनिक कंपनी'), col: '#14B8A6',
      p: { owners: T2('At least 7 members, no upper limit', 'कम से कम 7 सदस्य, ऊपरी सीमा नहीं'), liab: T2('Limited to the unpaid value of the shares held', 'रखे हुए शेयरों के अदत्त मूल्य तक सीमित'), cap: T2('Shares can be sold to the public; they trade on stock exchanges', 'शेयर जनता को बेचे जा सकते हैं; स्टॉक एक्सचेंज पर बिकते हैं'), cont: T2('Continues: the company is a separate legal person', 'चलती रहती है: कंपनी अलग कानूनी व्यक्ति है'), law: T2('Companies Act, 2013', 'कंपनी अधिनियम, 2013') },
      trait: T2('a company that may invite the public to buy its shares', 'कंपनी जो जनता को अपने शेयर ख़रीदने के लिए बुला सकती है'),
    },
  };
  const FORM_IDS = Object.keys(FORMS);
  const ORG_CASES = [
    { id: 'tea-stall', a: 'sole', q: T2('Ramu sells tea from a small stall. He put in his own savings, keeps all the profit, and decides everything himself.', 'रामू छोटे ठेले पर चाय बेचता है। उसने अपनी बचत लगाई है, सारा लाभ वही रखता है और सारे निर्णय ख़ुद लेता है।'), why: T2('One owner, own money, no one else to ask: a sole proprietor.', 'एक मालिक, अपना पैसा, किसी से पूछना नहीं: यह एकल स्वामी है।') },
    { id: 'printing', a: 'partnership', q: T2('Three friends put money together for a printing shop. A written deed says how they share profit and loss.', 'तीन दोस्तों ने मिलकर छपाई की दुकान के लिए पैसे लगाए। लिखित विलेख बताता है कि लाभ-हानि कैसे बँटेगी।'), why: T2('Two or more people sharing profit and loss by an agreement: a partnership.', 'दो या अधिक लोग समझौते से लाभ-हानि बाँटें: यह साझेदारी है।') },
    { id: 'family-cloth', a: 'huf', q: T2('A family runs the cloth shop it has had for generations. The eldest member decides, and children become members by birth.', 'एक परिवार पीढ़ियों पुरानी कपड़ा दुकान चलाता है। सबसे बड़ा सदस्य निर्णय लेता है और बच्चे जन्म से सदस्य बनते हैं।'), why: T2('Run by the eldest member (Karta), members by birth: a joint Hindu family business.', 'सबसे बड़े सदस्य (कर्ता) के हाथ में प्रबंध, सदस्य जन्म से: संयुक्त हिंदू परिवार का व्यवसाय।') },
    { id: 'milk', a: 'coop', q: T2('250 farmers sell their milk together so that no middleman takes a big cut. Every farmer has one vote.', '250 किसान अपना दूध मिलकर बेचते हैं ताकि बिचौलिया बड़ा हिस्सा न ले। हर किसान का एक वोट है।'), why: T2('Members helping each other, one member one vote: a co-operative society.', 'सदस्य एक-दूसरे की मदद करें, एक सदस्य एक वोट: सहकारी समिति।') },
    { id: 'cousins', a: 'private', q: T2('Two cousins want a business where their homes are safe if it fails. They will not sell shares to the public.', 'दो चचेरे भाई ऐसा व्यवसाय चाहते हैं जो डूबे तो उनके घर सुरक्षित रहें। वे जनता को शेयर नहीं बेचेंगे।'), why: T2('Limited liability with few members and no public shares: a private company.', 'सीमित दायित्व, कम सदस्य और जनता को शेयर नहीं: निजी कंपनी।') },
    { id: 'big-raise', a: 'public', q: T2('A company wants to raise ₹500 crore by selling its shares to anyone, through the stock exchange.', 'एक कंपनी स्टॉक एक्सचेंज के ज़रिए किसी को भी शेयर बेचकर ₹500 करोड़ जुटाना चाहती है।'), why: T2('Only a public company may invite the public to buy its shares.', 'केवल सार्वजनिक कंपनी ही जनता को शेयर ख़रीदने के लिए बुला सकती है।') },
    { id: 'tailoring', a: 'sole', q: T2('Sunita wants to open a tailoring shop alone next week, with the least paperwork.', 'सुनीता अगले हफ़्ते अकेले दर्ज़ी की दुकान खोलना चाहती है, कम से कम कागज़ी काम के साथ।'), why: T2('One owner, quick and easy to start: a sole proprietor.', 'एक मालिक, जल्दी और आसानी से शुरू: एकल स्वामी।') },
    { id: 'weavers', a: 'coop', q: T2('30 village weavers want to buy yarn together at a lower price. No one should have more say than another.', 'गाँव के 30 बुनकर मिलकर सस्ता धागा ख़रीदना चाहते हैं। किसी की बात दूसरे से ज़्यादा नहीं चलनी चाहिए।'), why: T2('Equal say and joint buying for members\' benefit: a co-operative society.', 'बराबर अधिकार और सदस्यों के लाभ के लिए मिलकर ख़रीद: सहकारी समिति।') },
    { id: 'sisters', a: 'partnership', q: T2('Two sisters run a bakery and share profit 60:40. If the bakery cannot pay its loan, the bank can claim their own houses too.', 'दो बहनें बेकरी चलाती हैं और लाभ 60:40 बाँटती हैं। बेकरी कर्ज़ न चुका पाए तो बैंक उनके निजी घर भी ले सकता है।'), why: T2('Two owners with unlimited liability: a partnership.', 'दो मालिक और असीमित दायित्व: साझेदारी।') },
  ];

  // ---------------------------------------------------------------- organisation charts
  const ORG = {
    line: {
      root: { id: 'top', lv: T2('Top management', 'उच्च प्रबंधन') },
      branches: [
        { h: T2('Production side', 'उत्पादन की ओर'), slots: [{ id: 'pm', lv: T2('Middle management', 'मध्य प्रबंधन') }, { id: 'ps', lv: T2('Supervisory level', 'पर्यवेक्षी स्तर') }, { id: 'pw', lv: T2('Operating level', 'संचालन स्तर') }] },
        { h: T2('Sales side', 'बिक्री की ओर'), slots: [{ id: 'sm', lv: T2('Middle management', 'मध्य प्रबंधन') }, { id: 'ss', lv: T2('Supervisory level', 'पर्यवेक्षी स्तर') }, { id: 'sw', lv: T2('Operating level', 'संचालन स्तर') }] },
      ],
      cards: [
        { id: 'ss', slot: 'ss', n: T2('Sales supervisor', 'बिक्री पर्यवेक्षक'), d: T2('Watches the sales staff day by day', 'बिक्री कर्मचारियों पर रोज़ नज़र रखता है'), hint: T2('A supervisor works just above the workers and reports to a manager.', 'पर्यवेक्षक कर्मचारियों से ठीक ऊपर होता है और प्रबंधक को रिपोर्ट करता है।') },
        { id: 'pw', slot: 'pw', n: T2('Production worker', 'उत्पादन कर्मचारी'), d: T2('Makes the goods; follows the supervisor', 'माल बनाता है; पर्यवेक्षक की बात मानता है'), hint: T2('Workers do the actual work and are at the bottom of the chart.', 'कर्मचारी असली काम करते हैं और चार्ट में सबसे नीचे होते हैं।') },
        { id: 'top', slot: 'top', n: T2('Owner / Director', 'मालिक / निदेशक'), d: T2('Sets the aim and takes the biggest decisions', 'उद्देश्य तय करता है और सबसे बड़े निर्णय लेता है'), hint: T2('Everyone reports up to this person, so it goes at the very top.', 'सब इसी व्यक्ति को रिपोर्ट करते हैं, इसलिए यह सबसे ऊपर रखो।') },
        { id: 'sm', slot: 'sm', n: T2('Sales manager', 'बिक्री प्रबंधक'), d: T2('Plans how to sell; guides the sales supervisor', 'बिक्री की योजना बनाता है; बिक्री पर्यवेक्षक को दिशा देता है'), hint: T2('A manager plans for a whole side of the business and sits just below the owner.', 'प्रबंधक व्यवसाय के एक पूरे भाग की योजना बनाता है और मालिक से ठीक नीचे होता है।') },
        { id: 'ps', slot: 'ps', n: T2('Production supervisor', 'उत्पादन पर्यवेक्षक'), d: T2('Watches the makers day by day', 'बनाने वालों पर रोज़ नज़र रखता है'), hint: T2('A supervisor works just above the workers and reports to a manager.', 'पर्यवेक्षक कर्मचारियों से ठीक ऊपर होता है और प्रबंधक को रिपोर्ट करता है।') },
        { id: 'sw', slot: 'sw', n: T2('Salesperson', 'विक्रेता'), d: T2('Serves customers at the counter', 'काउंटर पर ग्राहकों को सँभालता है'), hint: T2('Workers do the actual work and are at the bottom of the chart.', 'कर्मचारी असली काम करते हैं और चार्ट में सबसे नीचे होते हैं।') },
        { id: 'pm', slot: 'pm', n: T2('Production manager', 'उत्पादन प्रबंधक'), d: T2('Plans what to make; guides the production supervisor', 'क्या बनाना है इसकी योजना बनाता है; उत्पादन पर्यवेक्षक को दिशा देता है'), hint: T2('A manager plans for a whole side of the business and sits just below the owner.', 'प्रबंधक व्यवसाय के एक पूरे भाग की योजना बनाता है और मालिक से ठीक नीचे होता है।') },
      ],
    },
    functional: {
      root: { id: 'top', lv: T2('Owner', 'मालिक') },
      branches: [
        { h: T2('Production', 'उत्पादन'), slots: [{ id: 'fp', lv: T2('Department head', 'विभाग प्रमुख') }, { id: 'fpw', lv: T2('Staff', 'कर्मचारी') }] },
        { h: T2('Marketing', 'विपणन'), slots: [{ id: 'fm', lv: T2('Department head', 'विभाग प्रमुख') }, { id: 'fmw', lv: T2('Staff', 'कर्मचारी') }] },
        { h: T2('Finance', 'वित्त'), slots: [{ id: 'ff', lv: T2('Department head', 'विभाग प्रमुख') }, { id: 'ffw', lv: T2('Staff', 'कर्मचारी') }] },
      ],
      cards: [
        { id: 'ffw', slot: 'ffw', n: T2('Accountant', 'लेखाकार'), d: T2('Writes the accounts and keeps records of money', 'हिसाब लिखता है और पैसों का रिकॉर्ड रखता है'), hint: T2('Records of money belong to the finance department, below its head.', 'पैसों का रिकॉर्ड वित्त विभाग का काम है, उसके प्रमुख के नीचे।') },
        { id: 'fm', slot: 'fm', n: T2('Marketing head', 'विपणन प्रमुख'), d: T2('Leads selling, advertising and customer care', 'बिक्री, विज्ञापन और ग्राहक-सेवा का नेतृत्व करता है'), hint: T2('Selling and advertising belong to marketing; a head sits just below the owner.', 'बिक्री और विज्ञापन विपणन का काम है; प्रमुख मालिक से ठीक नीचे होता है।') },
        { id: 'top', slot: 'top', n: T2('Owner', 'मालिक'), d: T2('Heads the whole business; the department heads report here', 'पूरे व्यवसाय का प्रमुख; विभाग प्रमुख इसी को रिपोर्ट करते हैं'), hint: T2('Every department head reports to this person, so it goes at the top.', 'हर विभाग प्रमुख इसी व्यक्ति को रिपोर्ट करता है, इसलिए यह सबसे ऊपर है।') },
        { id: 'fpw', slot: 'fpw', n: T2('Machine operator', 'मशीन ऑपरेटर'), d: T2('Works the machines or ovens that make the goods', 'माल बनाने वाली मशीनें या भट्टियाँ चलाता है'), hint: T2('Making the goods is production work, below the production head.', 'माल बनाना उत्पादन का काम है, उत्पादन प्रमुख के नीचे।') },
        { id: 'ff', slot: 'ff', n: T2('Finance head', 'वित्त प्रमुख'), d: T2('Leads money matters: payments, loans, accounts', 'पैसों के काम का नेतृत्व करता है: भुगतान, कर्ज़, हिसाब'), hint: T2('Money matters belong to finance; a head sits just below the owner.', 'पैसों के काम वित्त के हैं; प्रमुख मालिक से ठीक नीचे होता है।') },
        { id: 'fmw', slot: 'fmw', n: T2('Salesperson', 'विक्रेता'), d: T2('Meets customers and takes orders', 'ग्राहकों से मिलता है और ऑर्डर लेता है'), hint: T2('Meeting customers is marketing work, below the marketing head.', 'ग्राहकों से मिलना विपणन का काम है, विपणन प्रमुख के नीचे।') },
        { id: 'fp', slot: 'fp', n: T2('Production head', 'उत्पादन प्रमुख'), d: T2('Leads making the goods and their quality', 'माल बनाने और उसकी गुणवत्ता का नेतृत्व करता है'), hint: T2('Making goods belongs to production; a head sits just below the owner.', 'माल बनाना उत्पादन का काम है; प्रमुख मालिक से ठीक नीचे होता है।') },
      ],
    },
  };

  // ---------------------------------------------------------------- planning
  const STEPS = [
    { id: 's5', n: T2('Select the best plan', 'सबसे अच्छी योजना चुनो'), d: T2('Pick the choice that fits the aim best', 'वह विकल्प चुनो जो उद्देश्य से सबसे ठीक बैठे'), hint: T2('You can only pick after you have compared the choices.', 'चुनने से पहले विकल्पों की तुलना करनी पड़ती है।') },
    { id: 's2', n: T2('Make assumptions', 'अनुमान लगाओ'), d: T2('Guess what will happen: prices, customers, costs', 'अंदाज़ा लगाओ कि क्या होगा: दाम, ग्राहक, लागत'), hint: T2('You guess the future after you know the aim, before you list choices.', 'उद्देश्य जानने के बाद और विकल्प गिनाने से पहले भविष्य का अंदाज़ा लगाते हैं।') },
    { id: 's7', n: T2('Follow up', 'अनुवर्तन करो'), d: T2('Check the results and correct mistakes', 'नतीजे जाँचो और ग़लतियाँ सुधारो'), hint: T2('You can only check results after the plan has been carried out.', 'योजना पर अमल होने के बाद ही नतीजे जाँचे जाते हैं।') },
    { id: 's1', n: T2('Set the aim', 'उद्देश्य तय करो'), d: T2('Decide what you want, for example ₹30,000 profit a month', 'तय करो कि क्या चाहिए, जैसे महीने में ₹30,000 लाभ'), hint: T2('You cannot plan a journey before you know where you are going.', 'जाना कहाँ है यह जाने बिना यात्रा की योजना नहीं बनती।') },
    { id: 's4', n: T2('Compare the choices', 'विकल्पों की तुलना करो'), d: T2('Weigh the good and bad points and the money of each', 'हर विकल्प के अच्छे-बुरे पहलू और पैसे तौलो'), hint: T2('First list the choices, then compare them.', 'पहले विकल्प गिनाओ, फिर उनकी तुलना करो।') },
    { id: 's6', n: T2('Carry out the plan', 'योजना पर अमल करो'), d: T2('Start work as planned', 'योजना के अनुसार काम शुरू करो'), hint: T2('Carry out the plan only once the best choice is picked.', 'सबसे अच्छा विकल्प चुनने के बाद ही अमल करो।') },
    { id: 's3', n: T2('List the choices', 'विकल्प गिनाओ'), d: T2('Find different ways to reach the aim', 'उद्देश्य तक पहुँचने के अलग-अलग रास्ते खोजो'), hint: T2('After assumptions, find the ways to reach the aim.', 'अनुमान के बाद उद्देश्य तक पहुँचने के रास्ते खोजो।') },
  ].map((s) => Object.assign({ slot: s.id }, s));
  const STEP_SLOTS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'];
  const ALTS = [
    { id: 'stall', n: T2('Roadside stall', 'सड़क किनारे ठेला'), inv: 20000, prof: 8000 },
    { id: 'shop', n: T2('Small rented shop', 'छोटी किराए की दुकान'), inv: 60000, prof: 27000 },
    { id: 'franchise', n: T2('Branded shop (franchise)', 'ब्रांडेड दुकान (फ़्रैंचाइज़)'), inv: 100000, prof: 50000 },
    { id: 'mall', n: T2('Big shop in a mall', 'मॉल में बड़ी दुकान'), inv: 150000, prof: 48000 },
  ];
  const bestAlt = (budget) => ALTS.filter((a) => a.inv <= budget).sort((x, y) => y.prof / y.inv - x.prof / x.inv)[0];

  // ---------------------------------------------------------------- marketing mix
  const PS = {
    product: { n: T2('Product', 'उत्पाद'), col: '#FF7A1A', t: T2('What you sell', 'आप क्या बेचते हैं') },
    price: { n: T2('Price', 'क़ीमत'), col: '#8B3DFF', t: T2('What the buyer pays', 'ख़रीदार क्या चुकाता है') },
    place: { n: T2('Place', 'स्थान'), col: '#0F766E', t: T2('How it reaches the buyer', 'यह ख़रीदार तक कैसे पहुँचता है') },
    promotion: { n: T2('Promotion', 'प्रचार'), col: '#1D4ED8', t: T2('How buyers hear about it', 'ख़रीदार इसके बारे में कैसे जानते हैं') },
  };
  const P_IDS = Object.keys(PS);
  const MIX = [
    { id: 'brand', slot: 'product', n: T2('Choose a brand name and logo', 'ब्रांड नाम और लोगो चुनना'), why: T2('A brand name is part of the product itself.', 'ब्रांड नाम उत्पाद का ही हिस्सा है।') },
    { id: 'rival', slot: 'price', n: T2('Fix the price a little above rivals', 'दाम प्रतिस्पर्धियों से थोड़ा ऊपर तय करना'), why: T2('Deciding how much the buyer pays is price.', 'ख़रीदार कितना चुकाएगा यह तय करना क़ीमत है।') },
    { id: 'bus', slot: 'place', n: T2('Open a shop near the bus stand', 'बस अड्डे के पास दुकान खोलना'), why: T2('Where the buyer can find it is place.', 'ख़रीदार को यह कहाँ मिलेगा, यह स्थान है।') },
    { id: 'radio', slot: 'promotion', n: T2('Advertise on the radio', 'रेडियो पर विज्ञापन देना'), why: T2('Telling people about it is promotion.', 'लोगों को इसके बारे में बताना प्रचार है।') },
    { id: 'pack', slot: 'product', n: T2('Pack it in a strong, neat box', 'इसे मज़बूत, साफ़ डिब्बे में पैक करना'), why: T2('Packaging is part of the product.', 'पैकेजिंग उत्पाद का हिस्सा है।') },
    { id: 'inst', slot: 'price', n: T2('Let buyers pay in 3 monthly instalments', 'ख़रीदारों को 3 मासिक किस्तों में भुगतान देना'), why: T2('How and when the buyer pays belongs to price.', 'ख़रीदार कैसे और कब चुकाए, यह क़ीमत का हिस्सा है।') },
    { id: 'home', slot: 'place', n: T2('Deliver to homes', 'घर तक पहुँचाना'), why: T2('Getting it to the buyer is place.', 'इसे ख़रीदार तक पहुँचाना स्थान है।') },
    { id: 'sample', slot: 'promotion', n: T2('Give free samples at the market', 'बाज़ार में मुफ़्त नमूने बाँटना'), why: T2('Free samples make people notice it: promotion.', 'मुफ़्त नमूने लोगों का ध्यान खींचते हैं: प्रचार।') },
    { id: 'range', slot: 'product', n: T2('Make new flavours and sizes', 'नए स्वाद और आकार बनाना'), why: T2('The range of things you make is the product.', 'आप जो-जो चीज़ें बनाते हैं वही उत्पाद है।') },
    { id: 'intro', slot: 'price', n: T2('Charge less at first to win customers', 'शुरू में कम दाम रखकर ग्राहक जोड़ना'), why: T2('Setting a low starting price is a price decision.', 'शुरू में कम दाम रखना क़ीमत का निर्णय है।') },
    { id: 'whole', slot: 'place', n: T2('Sell through wholesalers to other towns', 'थोक व्यापारियों के ज़रिए दूसरे शहरों में बेचना'), why: T2('The route the goods travel is place.', 'माल जिस रास्ते से पहुँचता है, वह स्थान है।') },
    { id: 'poster', slot: 'promotion', n: T2('Put posters outside the school', 'स्कूल के बाहर पोस्टर लगाना'), why: T2('Posters tell people about it: promotion.', 'पोस्टर लोगों को इसके बारे में बताते हैं: प्रचार।') },
  ];

  // ---------------------------------------------------------------- consumer protection
  const RIGHTS = {
    safety: { n: T2('Right to safety', 'सुरक्षा का अधिकार'), m: T2('Be protected from goods and services that can hurt life or health.', 'ऐसे माल और सेवाओं से बचाव जो जान या सेहत को नुक़सान पहुँचा सकें।') },
    information: { n: T2('Right to information', 'सूचना का अधिकार'), m: T2('Know the quality, quantity, price, ingredients and date of what you buy.', 'जो ख़रीदते हो उसकी गुणवत्ता, मात्रा, दाम, सामग्री और तारीख़ जानना।') },
    choose: { n: T2('Right to choose', 'चुनाव का अधिकार'), m: T2('Pick from many goods at fair prices.', 'उचित दामों पर कई चीज़ों में से चुनना।') },
    heard: { n: T2('Right to be heard', 'सुनवाई का अधिकार'), m: T2('Have your complaint listened to by the right place.', 'अपनी शिकायत सही जगह सुनवाई पाना।') },
    redressal: { n: T2('Right to seek redressal', 'निवारण पाने का अधिकार'), m: T2('Get a fair remedy: replacement, repair or refund.', 'उचित उपाय पाना: बदलना, मरम्मत या पैसे वापस।') },
    education: { n: T2('Right to consumer education', 'उपभोक्ता शिक्षा का अधिकार'), m: T2('Learn your rights and how to use them.', 'अपने अधिकार और उनका उपयोग करना सीखना।') },
  };
  const RIGHT_IDS = Object.keys(RIGHTS);
  const C_CASES = [
    { id: 'cooker', a: 'safety', q: T2('A pressure cooker\'s lid flew off and hurt a family. Which right was broken?', 'प्रेशर कुकर का ढक्कन उछलकर परिवार को चोट पहुँचा गया। कौन-सा अधिकार टूटा?') },
    { id: 'packet', a: 'information', q: T2('A packet of biscuits shows no price, no weight and no expiry date. Which right is missed?', 'बिस्कुट के पैकेट पर न दाम है, न वज़न, न एक्सपायरी तारीख़। कौन-सा अधिकार छूटा?') },
    { id: 'cement', a: 'choose', q: T2('Only one brand is sold in the town and the shopkeeper refuses to show any other. Which right is missed?', 'शहर में एक ही ब्रांड बिकता है और दुकानदार दूसरा दिखाने से मना करता है। कौन-सा अधिकार छूटा?') },
    { id: 'fan', a: 'heard', q: T2('Meena complains about a faulty fan, and the company must listen to her side. Which right is that?', 'मीना ख़राब पंखे की शिकायत करती है और कंपनी को उसकी बात सुननी होगी। यह कौन-सा अधिकार है?') },
    { id: 'refund', a: 'redressal', q: T2('The forum orders the shop to replace a faulty phone or pay the money back. Which right is that?', 'आयोग दुकान को ख़राब फ़ोन बदलने या पैसे लौटाने का आदेश देता है। यह कौन-सा अधिकार है?') },
    { id: 'school', a: 'education', q: T2('A school teaches children to read labels and spot the ISI mark. Which right is that?', 'स्कूल बच्चों को लेबल पढ़ना और ISI चिह्न पहचानना सिखाता है। यह कौन-सा अधिकार है?') },
    { id: 'medicine', a: 'safety', q: T2('A shop sells medicine after its expiry date. Which right is in danger?', 'दुकान एक्सपायरी के बाद की दवा बेचती है। कौन-सा अधिकार ख़तरे में है?') },
    { id: 'honey', a: 'information', q: T2('A jar says "pure honey" but hides the list of ingredients. Which right is missed?', 'जार पर "शुद्ध शहद" लिखा है पर सामग्री की सूची छिपाई गई है। कौन-सा अधिकार छूटा?') },
  ];
  const CLAIMS = [5000, 25000, 100000, 1000000, 4000000, 5000000, 7500000, 15000000, 20000000, 30000000, 50000000];
  const forumOf = (v) => (v <= 5000000 ? 'district' : v <= 20000000 ? 'state' : 'national');
  const FORUMS = {
    district: { n: T2('District Commission', 'ज़िला आयोग'), r: T2('up to ₹50 lakh', '₹50 लाख तक'), col: '#0F766E' },
    state: { n: T2('State Commission', 'राज्य आयोग'), r: T2('above ₹50 lakh, up to ₹2 crore', '₹50 लाख से ऊपर, ₹2 करोड़ तक'), col: '#1D4ED8' },
    national: { n: T2('National Commission', 'राष्ट्रीय आयोग'), r: T2('above ₹2 crore', '₹2 करोड़ से ऊपर'), col: '#8B3DFF' },
  };
  const FORUM_IDS = Object.keys(FORUMS);

  // ---------------------------------------------------------------- trade channels
  const CHANNELS = {
    direct: { n: T2('Producer to consumer', 'उत्पादक से उपभोक्ता'), chain: [] },
    one: { n: T2('Through a retailer', 'खुदरा विक्रेता के ज़रिए'), chain: ['retailer'] },
    two: { n: T2('Wholesaler and retailer', 'थोक और खुदरा विक्रेता के ज़रिए'), chain: ['wholesaler', 'retailer'] },
    three: { n: T2('Agent, wholesaler, retailer', 'एजेंट, थोक और खुदरा विक्रेता के ज़रिए'), chain: ['agent', 'wholesaler', 'retailer'] },
  };
  const CH_IDS = Object.keys(CHANNELS);
  const MARGIN = { agent: 0.05, wholesaler: 0.1, retailer: 0.2 };
  const MID = { agent: T2('Agent', 'एजेंट'), wholesaler: T2('Wholesaler', 'थोक व्यापारी'), retailer: T2('Retailer', 'खुदरा व्यापारी') };
  const PRODUCTS = {
    milk: { n: T2('Fresh milk, 1 litre', 'ताज़ा दूध, 1 लीटर'), base: 50, a: 'direct', tr: [T2('Spoils in hours', 'कुछ घंटों में ख़राब'), T2('Buyers live in the same town', 'ख़रीदार उसी शहर में रहते हैं'), T2('Needed fresh every morning', 'रोज़ सुबह ताज़ा चाहिए')], why: T2('Milk spoils fast and buyers are close, so the dairy delivers straight to homes. Fewer hands means fresher milk.', 'दूध जल्दी ख़राब होता है और ख़रीदार पास हैं, इसलिए डेयरी सीधे घर पहुँचाती है। कम हाथ यानी ताज़ा दूध।') },
    tea: { n: T2('Packet of tea, 250 g', 'चाय का पैकेट, 250 ग्राम'), base: 100, a: 'two', tr: [T2('Keeps for months', 'महीनों तक चलती है'), T2('Buyers in every town of India', 'पूरे भारत के हर शहर में ख़रीदार'), T2('Thousands of small shops sell it', 'हज़ारों छोटी दुकानें बेचती हैं')], why: T2('One company cannot reach every small shop alone. Wholesalers collect big lots and retailers sell small packets.', 'एक कंपनी अकेले हर छोटी दुकान तक नहीं पहुँच सकती। थोक व्यापारी बड़ी खेप लेते हैं और खुदरा विक्रेता छोटे पैकेट बेचते हैं।') },
    sofa: { n: T2('Sofa made to order', 'ऑर्डर पर बना सोफ़ा'), base: 12000, a: 'direct', tr: [T2('Made only after a customer orders', 'ग्राहक के ऑर्डर के बाद ही बनता है'), T2('Size and colour chosen by the buyer', 'आकार और रंग ख़रीदार चुनता है'), T2('Few buyers, near the workshop', 'कम ख़रीदार, कार्यशाला के पास')], why: T2('The buyer and the carpenter talk directly about the size and colour. No middleman is needed.', 'ख़रीदार और बढ़ई आकार और रंग पर सीधे बात करते हैं। बिचौलिए की ज़रूरत नहीं।') },
    veg: { n: T2('Vegetables from a farm', 'खेत की सब्ज़ियाँ'), base: 20, a: 'one', tr: [T2('Fresh for only a few days', 'कुछ ही दिन ताज़ा रहती हैं'), T2('Farm is near the town', 'खेत शहर के पास है'), T2('Sold in small lots', 'छोटी खेप में बिकती हैं')], why: T2('The farmer sells to local vegetable shops. One retailer is enough because the town is near and speed matters.', 'किसान स्थानीय सब्ज़ी दुकानों को बेचता है। शहर पास है और समय की क़ीमत है, इसलिए एक खुदरा विक्रेता काफ़ी है।') },
    saree: { n: T2('Handloom saree from a village', 'गाँव की हथकरघा साड़ी'), base: 800, a: 'three', tr: [T2('Made by many small weavers', 'कई छोटे बुनकर बनाते हैं'), T2('Buyers all over India', 'पूरे भारत में ख़रीदार'), T2('Weavers cannot travel to markets', 'बुनकर बाज़ारों तक नहीं जा सकते')], why: T2('An agent gathers sarees from many weavers, wholesalers move them to cities, and shops sell to buyers.', 'एजेंट कई बुनकरों से साड़ियाँ जुटाता है, थोक व्यापारी उन्हें शहरों तक ले जाते हैं और दुकानें ख़रीदारों को बेचती हैं।') },
    biscuit: { n: T2('Biscuit packet', 'बिस्कुट का पैकेट'), base: 8, a: 'two', tr: [T2('Made in a big factory', 'बड़े कारख़ाने में बनता है'), T2('Sold in lakhs of shops', 'लाखों दुकानों में बिकता है'), T2('Cheap and bought every day', 'सस्ता और रोज़ ख़रीदा जाता है')], why: T2('Lakhs of tiny shops cannot be served by the factory. Wholesalers supply them in bulk.', 'कारख़ाना लाखों छोटी दुकानों तक नहीं पहुँच सकता। थोक व्यापारी उन्हें बड़ी मात्रा में माल देते हैं।') },
  };
  const PROD_IDS = Object.keys(PRODUCTS);
  const priceAlong = (base, chain) => chain.reduce((p, m) => p * (1 + MARGIN[m]), base);

  // ---------------------------------------------------------------- text for each mode
  const META = {
    'form-of-org': [T2('Which form of business?', 'कौन-सा व्यवसाय रूप?'), T2('Read each case and choose the form of organisation that fits it best.', 'हर मामला पढ़ो और वह संगठन रूप चुनो जो उसमें सबसे ठीक बैठे।')],
    'org-chart': [T2('Build the organisation chart', 'संगठन चार्ट बनाओ'), T2('Drag each role to its place. Every box reports to the box above it.', 'हर पद को उसकी जगह पर खींचो। हर बॉक्स अपने ऊपर वाले को रिपोर्ट करता है।')],
    planning: [T2('Plan before you start', 'शुरू करने से पहले योजना बनाओ'), T2('Put the steps of planning in order, then choose the best plan for your money.', 'योजना के चरण क्रम में रखो, फिर अपने पैसे के हिसाब से सबसे अच्छी योजना चुनो।')],
    'marketing-mix': [T2('The marketing mix', 'विपणन मिश्रण'), T2('Sort each decision into Product, Price, Place or Promotion.', 'हर निर्णय को उत्पाद, क़ीमत, स्थान या प्रचार में रखो।')],
    pricing: [T2('Set the best price', 'सबसे अच्छा दाम तय करो'), T2('A higher price earns more on each one, but fewer people buy. Find the price that earns the most.', 'ऊँचे दाम पर हर चीज़ से ज़्यादा कमाई होती है, पर कम लोग ख़रीदते हैं। वह दाम खोजो जिस पर सबसे ज़्यादा कमाई हो।')],
    'break-even': [T2('Find the break-even point', 'सम-विच्छेद बिंदु खोजो'), T2('Break-even is where the money earned just covers all the costs. Move the sliders and watch.', 'सम-विच्छेद वहाँ है जहाँ कमाई ठीक सारी लागत के बराबर हो। स्लाइडर चलाओ और देखो।')],
    'working-capital': [T2('Working capital', 'कार्यशील पूँजी'), T2('Money gets tied up in stock and in unpaid bills. Move the sliders to see how many days your own money is stuck.', 'पैसा माल और बिना चुकाए बिलों में फँस जाता है। स्लाइडर चलाकर देखो कि तुम्हारा अपना पैसा कितने दिन फँसा रहता है।')],
    consumer: [T2('Consumer protection', 'उपभोक्ता संरक्षण'), T2('Know your rights as a buyer, and where to complain.', 'ख़रीदार के रूप में अपने अधिकार जानो, और शिकायत कहाँ करनी है।')],
    'trade-channels': [T2('Channels of distribution', 'वितरण के माध्यम'), T2('Choose how the goods should travel from the maker to the buyer.', 'चुनो कि माल बनाने वाले से ख़रीदार तक कैसे पहुँचे।')],
  };

  // ---------------------------------------------------------------- shop pictures (48 x 48)
  const ICO = {
    bakery: '<rect x="6" y="18" width="36" height="20" rx="10" fill="#C8782B"/><rect x="6" y="18" width="36" height="12" rx="8" fill="#E39A4A"/><path d="M16 20l-3 8M24 19v9M32 20l3 8" stroke="#8A4B14" stroke-width="2.4" stroke-linecap="round"/>',
    tea: '<path d="M9 20h24v10a10 10 0 0 1-10 10h-4A10 10 0 0 1 9 30z" fill="#fff" stroke="#0F766E" stroke-width="2.4"/><path d="M33 23h4a4 4 0 0 1 0 8h-4" fill="none" stroke="#0F766E" stroke-width="2.4"/><path d="M15 14c-2-3 2-4 0-7M22 14c-2-3 2-4 0-7M29 14c-2-3 2-4 0-7" stroke="#9AA6B2" stroke-width="2" fill="none" stroke-linecap="round"/><rect x="9" y="20" width="24" height="5" fill="#B45F1E"/>',
    tailor: '<path d="M16 8l8 5 8-5 10 8-6 7-4-3v21H16V20l-4 3-6-7z" fill="#8B3DFF"/><path d="M24 13v26" stroke="#fff" stroke-width="2" stroke-dasharray="3 3"/>',
    stationery: '<rect x="10" y="7" width="26" height="34" rx="3" fill="#1D4ED8"/><rect x="14" y="7" width="22" height="34" rx="2" fill="#fff"/><path d="M18 16h14M18 22h14M18 28h10" stroke="#9FB4E8" stroke-width="2"/><path d="M34 34l9-18 4 2-9 18-5 2z" fill="#FFD23F" stroke="#B8860B" stroke-width="1.5"/>',
    repair: '<rect x="14" y="5" width="20" height="38" rx="4" fill="#061233"/><rect x="17" y="10" width="14" height="24" rx="1" fill="#02CFF9"/><path d="M19 14l5 9-3 4 7 4" stroke="#fff" stroke-width="1.6" fill="none"/><circle cx="24" cy="39" r="1.8" fill="#9AA6B2"/>',
    juice: '<path d="M11 12h26l-3 28a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill="#FFE9C2" stroke="#FF7A1A" stroke-width="2.2"/><path d="M13 22h22l-2 18a3 3 0 0 1-3 3H18a3 3 0 0 1-3-3z" fill="#FF9F43"/><circle cx="36" cy="12" r="7" fill="#FFD23F" stroke="#FF7A1A" stroke-width="2"/><path d="M36 5v14M29 12h14" stroke="#FF7A1A" stroke-width="1.4"/>',
  };
  const icon = (type) => `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">${ICO[type]}</svg>`;

  // ---------------------------------------------------------------- config checks
  const spec = (type) => {
    const T = BT[type];
    const maxPz = Math.floor(T.a / T.b);
    return {
      'form-of-org': { case: (v) => (ORG_CASES.some((c) => c.id === v) ? null : 'case: one of ' + ORG_CASES.map((c) => c.id).join(', ')) },
      'org-chart': { chart: (v) => (v === 'line' || v === 'functional' ? null : "chart: 'line' or 'functional'") },
      planning: { budget: (v) => (isInt(v) && v >= 20000 && v <= 200000 && v % 10000 === 0 ? null : 'budget: a multiple of 10000 from 20000 to 200000') },
      'marketing-mix': { perP: (v) => (isInt(v) && v >= 1 && v <= 3 ? null : 'perP: 1, 2 or 3') },
      pricing: {
        price: (v) => (isInt(v) && v >= 1 && v < maxPz ? null : `price: a whole number from 1 to ${maxPz - 1} for this business`),
        fixed: (v) => (isInt(v) && v >= 0 && v <= 100000 ? null : 'fixed: a whole number from 0 to 100000'),
      },
      'break-even': {
        price: (v) => (isInt(v) && v >= 1 && v <= 5000 ? null : 'price: a whole number from 1 to 5000'),
        variable: (v) => (isInt(v) && v >= 0 && v <= 5000 ? null : 'variable: a whole number from 0 to 5000'),
        fixed: (v) => (isInt(v) && v >= 0 && v <= 1000000 ? null : 'fixed: a whole number from 0 to 1000000'),
        units: (v) => (isInt(v) && v >= 0 && v <= 100000 ? null : 'units: a whole number from 0 to 100000'),
      },
      'working-capital': {
        stock: (v) => (isInt(v) && v >= 0 && v <= 60 ? null : 'stock: days, 0 to 60'),
        debtors: (v) => (isInt(v) && v >= 0 && v <= 90 ? null : 'debtors: days, 0 to 90'),
        creditors: (v) => (isInt(v) && v >= 0 && v <= 90 ? null : 'creditors: days, 0 to 90'),
        dailyCost: (v) => (isInt(v) && v >= 500 && v <= 20000 ? null : 'dailyCost: rupees a day, 500 to 20000'),
      },
      consumer: {
        focus: (v) => (v === 'rights' || v === 'forum' ? null : "focus: 'rights' or 'forum'"),
        case: (v) => (C_CASES.some((c) => c.id === v) ? null : 'case: one of ' + C_CASES.map((c) => c.id).join(', ')),
        claim: (v) => (CLAIMS.includes(v) ? null : 'claim: one of ' + CLAIMS.join(', ')),
      },
      'trade-channels': { product: (v) => (PRODUCTS[v] ? null : 'product: one of ' + PROD_IDS.join(', ')) },
    };
  };
  const typeOf = (c) => (c && c.business && c.business.type) || 'bakery';
  function norm(c) {
    const type = BT[typeOf(c)] ? typeOf(c) : 'bakery';
    const T = BT[type];
    const nm = c.business && c.business.name && c.business.name.en ? c.business.name : T.n;
    return { mode: c.mode, type, T, name: nm, P: c.params || {} };
  }

  // ---------------------------------------------------------------- styles
  const CSS = `
.bz{--bz-a:#1D4ED8;--bz-g:#0F766E;--bz-o:#FF7A1A;--bz-p:#8B3DFF;--bz-r:#E11D48;max-width:760px;margin:0 auto;font-family:var(--font-body,'Mukta',system-ui,sans-serif);color:var(--ink,#1E293B);display:block}
.bz *{box-sizing:border-box}
.bz svg{display:block}
.bz-head{border-radius:18px;overflow:hidden;background:linear-gradient(135deg,#061233,#1D4ED8);color:#fff;box-shadow:0 8px 22px rgba(6,18,51,.22)}
.bz-awn{height:14px;background:repeating-linear-gradient(90deg,var(--bz-acc) 0 26px,#fff 26px 52px);box-shadow:0 4px 0 rgba(0,0,0,.12)}
.bz-hrow{display:flex;align-items:center;gap:12px;padding:12px 14px 14px}
.bz-hico{flex:none;width:52px;height:52px;border-radius:14px;background:#fff;display:grid;place-items:center;box-shadow:0 3px 8px rgba(0,0,0,.25)}
.bz-hico svg{width:38px;height:38px}
.bz-htxt{min-width:0}
.bz-htxt b{display:block;font-family:var(--font-display,'Baloo 2',sans-serif);font-size:1.15rem;line-height:1.2}
.bz-htxt span{display:block;font-size:.88rem;opacity:.92;line-height:1.3}
.bz-intro{margin:10px 2px 8px;font-size:1rem;line-height:1.45;color:var(--ink-2,#475569)}
.bz-live{margin:8px 0;padding:10px 14px;border-radius:12px;font-size:1rem;line-height:1.4;background:var(--sunk,#EEF2F7);border:2px solid transparent;min-height:46px;display:flex;align-items:center}
.bz-live.good{background:var(--good-t,#DCFCE7);border-color:var(--good,#15803D);color:var(--ink,#1E293B)}
.bz-live.bad{background:var(--bad-t,#FEE2E2);border-color:var(--bad,#DC2626);color:var(--ink,#1E293B)}
.bz-panel{background:var(--surface,#fff);border:1.5px solid var(--line,#D8DEE8);border-radius:16px;padding:12px;margin:8px 0;box-shadow:0 2px 8px rgba(15,23,42,.06)}
.bz-panel h4{margin:0 0 8px;font-family:var(--font-display,'Baloo 2',sans-serif);font-size:1.02rem}
.bz-case{display:flex;gap:10px;align-items:flex-start}
.bz-case .no{flex:none;background:var(--bz-a);color:#fff;border-radius:10px;padding:2px 10px;font-weight:700;font-size:.85rem}
.bz-case p{margin:0;font-size:1.05rem;line-height:1.5}
.bz-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.bz-ch{min-height:56px;border-radius:14px;border:2px solid var(--line,#D8DEE8);background:var(--surface,#fff);padding:8px 10px;text-align:left;cursor:pointer;font:inherit;color:inherit;display:flex;flex-direction:column;justify-content:center;gap:2px;position:relative;border-left:8px solid var(--c,#1D4ED8);transition:transform .15s,box-shadow .15s}
.bz-ch:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 6px 14px rgba(15,23,42,.14)}
.bz-ch:focus-visible,.bz-card:focus-visible,.bz-slot:focus-visible,.bz-btn:focus-visible,.bz-in:focus-visible{outline:3px solid var(--cyan,#02CFF9);outline-offset:2px}
.bz-ch b{font-size:1rem;line-height:1.2}
.bz-ch small{font-size:.82rem;color:var(--ink-2,#475569);line-height:1.25}
.bz-ch.right{background:var(--good-t,#DCFCE7);border-color:var(--good,#15803D)}
.bz-ch.wrong{background:var(--bad-t,#FEE2E2);border-color:var(--bad,#DC2626);opacity:.8}
.bz-ch:disabled{cursor:default}
.bz-table{width:100%;border-collapse:collapse;font-size:.95rem}
.bz-table th{text-align:left;width:34%;padding:6px 8px 6px 0;vertical-align:top;color:var(--ink-2,#475569);font-weight:600}
.bz-table td{padding:6px 0;vertical-align:top;border-top:1px solid var(--line,#D8DEE8);line-height:1.35}
.bz-table th{border-top:1px solid var(--line,#D8DEE8)}
.bz-btn{min-height:46px;padding:8px 18px;border:0;border-radius:23px;background:var(--bz-a);color:#fff;font:700 1rem var(--font-display,'Baloo 2',sans-serif);cursor:pointer;box-shadow:0 4px 0 rgba(6,18,51,.3);transition:transform .1s}
.bz-btn:active{transform:translateY(2px);box-shadow:0 2px 0 rgba(6,18,51,.3)}
.bz-btn.ghost{background:var(--surface,#fff);color:var(--bz-a);border:2px solid var(--bz-a);box-shadow:none}
.bz-btn:disabled{opacity:.5;cursor:default}
.bz-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:8px}
.bz-tray{display:flex;flex-wrap:wrap;gap:8px;min-height:56px;padding:10px;border-radius:14px;background:var(--sunk,#EEF2F7);border:2px dashed var(--line,#C5CEDB)}
.bz-card{touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;min-height:46px;flex:1 1 140px;max-width:100%;padding:8px 10px;border-radius:12px;border:2px solid var(--bz-a);background:var(--surface,#fff);color:inherit;font:inherit;text-align:left;box-shadow:0 3px 0 rgba(29,78,216,.28);display:flex;flex-direction:column;gap:2px}
.bz-card b{font-size:.95rem;line-height:1.2}
.bz-card span{font-size:.8rem;color:var(--ink-2,#475569);line-height:1.25}
.bz-card.sel{background:#FFD23F;color:#1E293B;border-color:#B8860B;transform:translateY(-2px)}
.bz-card.sel span{color:#334155}
.bz-ghost{position:fixed;z-index:9999;pointer-events:none;opacity:.92;transform:rotate(-3deg) scale(1.04);box-shadow:0 12px 28px rgba(6,18,51,.35)}
.bz-slot{position:relative;min-height:58px;width:100%;border-radius:12px;border:2px dashed var(--bz-a);background:var(--surface,#fff);color:inherit;font:inherit;padding:6px 8px;display:flex;flex-direction:column;gap:4px;align-items:stretch;justify-content:center;cursor:pointer;text-align:center;transition:background .15s,box-shadow .15s}
.bz-slot i{font-style:normal;font-size:.76rem;color:var(--ink-2,#475569);line-height:1.2}
.bz-slot.hot,.bz-slot.can{background:var(--royal-t,#DBEAFE);box-shadow:0 0 0 3px rgba(2,207,249,.55)}
.bz-slot.full{border-style:solid;background:var(--good-t,#DCFCE7);border-color:var(--bz-g)}
.bz-slot.shake{animation:bz-shake .4s}
.bz-chip{display:block;border-radius:9px;background:var(--bz-g);color:#fff;padding:4px 6px;font-size:.84rem;font-weight:700;line-height:1.2}
.bz-tree{display:flex;flex-direction:column;align-items:center;gap:0}
.bz-tree .bz-slot{max-width:210px}
.bz-v{width:2px;height:14px;background:var(--bz-a);flex:none}
.bz-fork{display:grid;gap:8px;width:100%;position:relative;padding-top:14px;margin-top:0}
.bz-fork::before{content:'';position:absolute;top:0;height:2px;background:var(--bz-a);left:var(--ins);right:var(--ins)}
.bz-br{display:flex;flex-direction:column;align-items:center;position:relative;min-width:0}
.bz-br::before{content:'';position:absolute;top:-14px;height:14px;width:2px;background:var(--bz-a)}
.bz-br h5{margin:0 0 4px;font-size:.8rem;color:var(--bz-a);font-family:var(--font-display,'Baloo 2',sans-serif);text-align:center;line-height:1.1}
.bz-br .bz-slot{max-width:none}
.bz-steps{display:grid;gap:6px}
.bz-step{display:flex;gap:8px;align-items:stretch}
.bz-step .n{flex:none;width:34px;border-radius:10px;background:var(--bz-a);color:#fff;font:700 1rem var(--font-display,'Baloo 2',sans-serif);display:grid;place-items:center}
.bz-step .bz-slot{flex:1;flex-direction:row;align-items:center;justify-content:flex-start;gap:8px;text-align:left}
.bz-step .bz-chip{flex:1}
.bz-buckets{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.bz-bk{border-radius:14px;overflow:hidden;border:2px solid var(--c);background:var(--surface,#fff)}
.bz-bk h5{margin:0;padding:6px 10px;background:var(--c);color:var(--fg,#fff);font-family:var(--font-display,'Baloo 2',sans-serif);font-size:1rem}
.bz-bk h5 small{display:block;font:400 .74rem var(--font-body,'Mukta',sans-serif);opacity:.95}
.bz-bk .bz-slot{border:0;border-radius:0;min-height:76px;background:transparent;align-items:stretch;justify-content:flex-start}
.bz-bk .bz-slot.full{background:transparent}
.bz-bk .bz-slot i{text-align:left}
.bz-bk .bz-chip{background:var(--c);color:var(--fg,#fff);text-align:left}
.bz-sl{display:block;margin:6px 0 10px}
.bz-sl-t{display:flex;justify-content:space-between;gap:8px;font-weight:700;font-size:.98rem}
.bz-sl output{font-family:var(--font-display,'Baloo 2',sans-serif);color:var(--bz-a);font-size:1.05rem;white-space:nowrap}
.bz-sl input[type=range]{width:100%;height:44px;margin:0;background:transparent;-webkit-appearance:none;appearance:none;cursor:pointer}
.bz-sl input[type=range]::-webkit-slider-runnable-track{height:10px;border-radius:5px;background:linear-gradient(90deg,#02CFF9,#1D4ED8)}
.bz-sl input[type=range]::-moz-range-track{height:10px;border-radius:5px;background:linear-gradient(90deg,#02CFF9,#1D4ED8)}
.bz-sl input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:30px;height:30px;margin-top:-10px;border-radius:50%;background:#FFD23F;border:3px solid #061233;box-shadow:0 2px 6px rgba(0,0,0,.35)}
.bz-sl input[type=range]::-moz-range-thumb{width:26px;height:26px;border-radius:50%;background:#FFD23F;border:3px solid #061233}
.bz-sl input[type=range]:focus-visible{outline:3px solid var(--cyan,#02CFF9);outline-offset:2px;border-radius:8px}
.bz-ans{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}
.bz-ans label{flex:1 1 100%;font-weight:700}
.bz-in{flex:1 1 120px;min-width:0;height:46px;border-radius:12px;border:2px solid var(--line,#C5CEDB);background:var(--surface,#fff);color:inherit;padding:0 12px;font:700 1.1rem var(--font-display,'Baloo 2',sans-serif)}
.bz-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:6px 0}
.bz-stat{border-radius:12px;padding:8px 10px;background:var(--sunk,#EEF2F7);border-left:6px solid var(--c,#1D4ED8)}
.bz-stat small{display:block;font-size:.8rem;color:var(--ink-2,#475569);line-height:1.2}
.bz-stat b{font-family:var(--font-display,'Baloo 2',sans-serif);font-size:1.15rem;line-height:1.25}
.bz-stat.pos{border-color:#15803D;background:var(--good-t,#DCFCE7)}
.bz-stat.neg{border-color:#DC2626;background:var(--bad-t,#FEE2E2)}
.bz-chart{width:100%;height:auto;max-height:300px}
.bz-chart text{font-family:var(--font-body,'Mukta',sans-serif);fill:var(--ink,#1E293B);paint-order:stroke;stroke:var(--surface,#fff);stroke-width:3px;stroke-linejoin:round}
.bz-chart .ax{stroke:var(--ink-2,#64748B);stroke-width:1.2}
.bz-chart .gr{stroke:var(--line,#D8DEE8);stroke-width:1}
.bz-draw{stroke-dasharray:900;stroke-dashoffset:900;animation:bz-dash 1.1s ease-out forwards}
.bz-pulse{animation:bz-pulse 1.2s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.bz-flow{display:grid;gap:6px}
.bz-ladder{display:grid;gap:6px}
.bz-rung{border-radius:12px;padding:8px 12px;border:2px solid var(--c);background:var(--surface,#fff);display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;transition:all .2s}
.bz-rung.on{background:var(--c);color:var(--fg,#fff);transform:scale(1.02);box-shadow:0 6px 14px rgba(15,23,42,.22)}
.bz-rung b{font-family:var(--font-display,'Baloo 2',sans-serif)}
.bz-people{display:flex;flex-wrap:wrap;gap:3px;margin:6px 0}
.bz-people svg{width:20px;height:28px}
.bz-alt{display:grid;grid-template-columns:1fr auto;gap:2px 10px}
.bz-alt.out{opacity:.55}
.bz-pill{display:inline-block;border-radius:10px;padding:1px 8px;font-size:.78rem;font-weight:700;background:var(--sunk,#EEF2F7)}
.bz-trait{display:inline-block;margin:2px 4px 2px 0;border-radius:12px;padding:3px 10px;background:var(--sun-t,#FEF3C7);border:1.5px solid #F5B90A;font-size:.9rem}
.bz-done{margin:6px;font-weight:700;color:var(--bz-g)}
@keyframes bz-dash{to{stroke-dashoffset:0}}
@keyframes bz-pulse{50%{transform:scale(1.35)}}
@keyframes bz-shake{20%{transform:translateX(-6px)}50%{transform:translateX(6px)}80%{transform:translateX(-3px)}}
@media (prefers-reduced-motion:reduce){.bz *{animation:none!important;transition:none!important}.bz-draw{stroke-dashoffset:0}}
@media (min-width:640px){.bz-card{flex:0 1 200px}}
`;

  // ---------------------------------------------------------------- the template
  NCA_T.register({
    id: 'business',
    css: CSS,
    validate(c) {
      const e = [];
      if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
      Object.keys(c).forEach((k) => { if (!['mode', 'business', 'params'].includes(k)) e.push('unknown key: ' + k); });
      if (!MODES.includes(c.mode)) { e.push('mode: one of ' + MODES.join(', ')); return e; }
      if (c.business != null) {
        const b = c.business;
        if (typeof b !== 'object' || Array.isArray(b)) e.push('business: an object');
        else {
          Object.keys(b).forEach((k) => { if (!['name', 'type'].includes(k)) e.push('business: unknown key ' + k); });
          if (b.type != null && !BT[b.type]) e.push('business.type: one of ' + TYPES.join(', '));
          if (b.name != null) {
            const n = b.name;
            const okS = (s) => typeof s === 'string' && s.trim().length > 0 && s.length <= 40;
            if (!n || typeof n !== 'object' || !okS(n.en) || !okS(n.hi)) e.push('business.name: { en, hi } text of 1 to 40 characters each');
          }
        }
      }
      if (c.params != null) {
        const p = c.params;
        if (typeof p !== 'object' || Array.isArray(p)) e.push('params: an object');
        else {
          const sp = spec(BT[typeOf(c)] ? typeOf(c) : 'bakery')[c.mode];
          Object.keys(p).forEach((k) => {
            if (!sp[k]) e.push(`params.${k}: not used by ${c.mode} (use ${Object.keys(sp).join(', ')})`);
            else { const m = sp[k](p[k]); if (m) e.push('params.' + m); }
          });
          if (c.mode === 'break-even' && !e.length) {
            const T = BT[BT[typeOf(c)] ? typeOf(c) : 'bakery'];
            const pr = p.price != null ? p.price : T.p, v = p.variable != null ? p.variable : T.v;
            if (pr <= v) e.push('params: price must be more than the variable cost, or there is no break-even');
          }
        }
      }
      return e;
    },
    keys(c) {
      const m = (c && c.mode) || 'break-even';
      const p = (c && c.params) || {};
      const dnd = (cards, slots) => cards.map((x) => 'drag:' + x.id).concat(slots.map((s) => 'slot:' + s), ['reset']);
      if (m === 'form-of-org') return { targets: FORM_IDS.map((f) => 'choice:' + f).concat(['next']), events: ['decided', 'answered:right', 'answered:wrong'] };
      if (m === 'org-chart') {
        const o = ORG[p.chart === 'functional' ? 'functional' : 'line'];
        return { targets: dnd(o.cards, o.cards.map((x) => x.slot)), events: ['placed', 'answered:right', 'answered:wrong'] };
      }
      if (m === 'planning') return { targets: dnd(STEPS, STEP_SLOTS).concat(['slider:budget'], ALTS.map((a) => 'choice:' + a.id)), events: ['placed', 'decided', 'moved:budget', 'answered:right', 'answered:wrong'] };
      if (m === 'marketing-mix') return { targets: dnd(MIX, P_IDS), events: ['placed', 'decided', 'answered:right', 'answered:wrong'] };
      if (m === 'pricing') return { targets: ['slider:price', 'choice:fix', 'reset'], events: ['moved:price', 'decided', 'answered:right', 'answered:wrong'] };
      if (m === 'break-even') return { targets: ['slider:price', 'slider:variable', 'slider:fixed', 'slider:units', 'answer'], events: ['break-even', 'moved:price', 'moved:variable', 'moved:fixed', 'moved:units', 'answered:right', 'answered:wrong'] };
      if (m === 'working-capital') return { targets: ['slider:stock', 'slider:debtors', 'slider:creditors', 'answer'], events: ['moved:stock', 'moved:debtors', 'moved:creditors', 'answered:right', 'answered:wrong'] };
      if (m === 'consumer') {
        if (p.focus === 'forum') return { targets: FORUM_IDS.map((f) => 'choice:' + f).concat(['slider:claim']), events: ['decided', 'moved:claim', 'answered:right', 'answered:wrong'] };
        return { targets: RIGHT_IDS.map((r) => 'choice:' + r).concat(['next']), events: ['decided', 'answered:right', 'answered:wrong'] };
      }
      return { targets: CH_IDS.map((x) => 'choice:' + x).concat(['next']), events: ['decided', 'answered:right', 'answered:wrong'] };
    },
    demo: { mode: 'break-even', business: { name: T2('Sweet Bakes', 'स्वीट बेक्स'), type: 'bakery' } },
    modes: MODES,
    // The pure rules, for tests under Node.
    model: { bepOf, profitAt, demand, bestPrice, forumOf, priceAlong, bestAlt, BT },
    mount(root, config, api) { return build(root, config, api); },
  });

  function build(root, config, api) {
    const C = norm(config);
    const mode = C.mode, T = C.T, P = C.P;
    const t = (x) => esc(api.t(x));
    const raw = (x) => api.t(x);
    const reduced = L.reducedMotion();
    const S = { in: {}, sel: null, shake: null, msg: null };
    const stops = [];
    const unit = raw(T.u);
    root.innerHTML = `<div class="bz" style="--bz-acc:${T.col}"><div class="bz-head"><div class="bz-awn"></div><div class="bz-hrow"><span class="bz-hico">${icon(C.type)}</span><div class="bz-htxt"><b>${t(C.name)}</b><span>${t(META[mode][0])}</span></div></div></div><p class="bz-intro">${t(META[mode][1])}</p><div class="bz-live info" role="status" aria-live="polite"></div><div class="bz-a"></div><div class="bz-ctl"></div><div class="bz-b"></div></div>`;
    const elA = root.querySelector('.bz-a'), elC = root.querySelector('.bz-ctl'), elB = root.querySelector('.bz-b'), live = root.querySelector('.bz-live');
    const say = (k, x) => { S.msg = { k, x }; live.className = 'bz-live ' + k; live.textContent = raw(x); };
    const ev = (e) => api.emit(e);
    const sayR = (k, en, hi) => say(k, T2(en, hi));

    // ---- shared pieces
    const slider = (name, label, min, max, step, val, f) => `<label class="bz-sl"><span class="bz-sl-t"><span>${t(label)}</span><output data-out="${name}">${esc(f(val))}</output></span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-act="slide" data-s="${name}" data-key="slider:${name}" aria-label="${esc(raw(label))}"></label>`;
    const profileTable = (f) => { const p = FORMS[f].p; const row = (k, lab) => `<tr><th scope="row">${t(lab)}</th><td>${t(p[k])}</td></tr>`; return `<table class="bz-table"><caption class="sr" style="position:absolute;left:-9999px">${t(FORMS[f].n)}</caption><tbody>${row('owners', T2('Owners', 'मालिक'))}${row('liab', T2('Liability', 'दायित्व'))}${row('cap', T2('Capital', 'पूँजी'))}${row('cont', T2('Lifetime', 'अवधि'))}${row('law', T2('Law', 'कानून'))}</tbody></table>`; };

    // ---- drag and drop (org-chart, planning steps, marketing-mix)
    const drag = { st: null, ghost: null, suppress: false };
    let CARDS = [], CAP = () => 1;
    const cardBtn = (c) => `<button type="button" class="bz-card${S.sel === c.id ? ' sel' : ''}" data-card="${c.id}" data-act="card" data-key="drag:${c.id}" aria-pressed="${S.sel === c.id}"><b>${t(c.n)}</b>${c.d ? `<span>${t(c.d)}</span>` : ''}</button>`;
    const trayHtml = () => {
      const left = CARDS.filter((c) => !S.in[c.id]);
      return `<div class="bz-tray" role="group" aria-label="${t(T2('Cards to place', 'रखने के कार्ड'))}">${left.map(cardBtn).join('') || `<p class="bz-done">${t(T2('All cards are placed. Well done!', 'सारे कार्ड रख दिए। शाबाश!'))}</p>`}</div>`;
    };
    const slotBtn = (id, label, extra) => {
      const inn = CARDS.filter((c) => S.in[c.id] === id);
      const full = inn.length >= CAP(id);
      const nm = raw(label) + ': ' + (inn.length ? inn.map((c) => raw(c.n)).join(', ') : raw(T2('empty', 'ख़ाली')));
      return `<button type="button" class="bz-slot${full ? ' full' : ''}${S.sel && !full ? ' can' : ''}${S.shake === id ? ' shake' : ''}" data-slot="${id}" data-act="slot" data-key="slot:${id}" aria-label="${esc(nm)}">${inn.length ? '' : `<i>${t(label)}</i>`}${inn.map((c) => `<span class="bz-chip">${t(c.n)}</span>`).join('')}${extra || ''}</button>`;
    };
    function tryPlace(cid, sid) {
      const c = CARDS.find((x) => x.id === cid);
      if (!c || S.in[cid]) return;
      S.sel = null;
      if (c.slot !== sid) {
        S.shake = sid; ev('answered:wrong'); api.record(`Put "${c.n.en}" in the wrong place (${sid})`);
        if (mode !== 'marketing-mix') say('bad', { en: 'Not there. ' + c.hint.en, hi: 'वहाँ नहीं। ' + c.hint.hi });
        else say('bad', { en: `That does not belong in ${PS[sid].n.en}. ${PS[sid].n.en} is ${PS[sid].t.en.toLowerCase()}, and this decision is about something else.`, hi: `यह ${PS[sid].n.hi} में नहीं आता। ${PS[sid].n.hi} यानी ${PS[sid].t.hi}, और यह निर्णय किसी और बारे में है।` });
        draw(); return;
      }
      S.in[cid] = sid; S.shake = null; ev('placed'); api.record(`Placed "${c.n.en}" correctly`);
      const total = CARDS.length, done = Object.keys(S.in).length;
      if (done === total) {
        ev('answered:right'); if (mode === 'marketing-mix') ev('decided'); api.celebrate();
        say('good', mode === 'org-chart' ? T2('The chart is complete. Each person reports to the box above.', 'चार्ट पूरा हुआ। हर व्यक्ति अपने ऊपर वाले बॉक्स को रिपोर्ट करता है।') : mode === 'planning' ? T2('The steps are in order. Now choose the best plan below.', 'चरण क्रम में हैं। अब नीचे सबसे अच्छी योजना चुनो।') : T2('All four Ps are sorted. A good business plans all of them together.', 'चारों P सही जगह हैं। अच्छा व्यवसाय चारों की योजना साथ बनाता है।'));
      } else if (mode === 'marketing-mix') say('good', { en: 'Yes! ' + c.why.en, hi: 'हाँ! ' + c.why.hi });
      else say('good', T2('Right place. ' + (total - done) + ' to go.', 'सही जगह। ' + (total - done) + ' और बाक़ी।'));
      draw();
    }
    const dndActs = {
      card: (el) => { if (drag.suppress) { drag.suppress = false; return; } const id = el.dataset.card; S.sel = S.sel === id ? null : id; if (S.sel) say('info', T2('Now tap the place where it belongs.', 'अब वह जगह दबाओ जहाँ यह आता है।')); draw(); },
      slot: (el) => { if (drag.suppress) { drag.suppress = false; return; } if (!S.sel) { say('info', T2('First tap a card, or drag it here.', 'पहले एक कार्ड दबाओ, या उसे यहाँ खींचो।')); return; } tryPlace(S.sel, el.dataset.slot); },
      reset: () => { S.in = {}; S.sel = null; S.shake = null; say('info', startMsg()); draw(); },
    };
    const resetBtn = () => `<div class="bz-row"><button type="button" class="bz-btn ghost" data-act="reset" data-key="reset">${t(T2('Start again', 'फिर से शुरू करो'))}</button></div>`;
    const startMsg = () => (mode === 'marketing-mix' ? T2('Tap a card, then tap the P it belongs to. You can also drag it.', 'एक कार्ड दबाओ, फिर उसका P दबाओ। तुम उसे खींच भी सकते हो।') : mode === 'planning' ? T2('Tap a step, then tap the number where it belongs. You can also drag it.', 'एक चरण दबाओ, फिर वह संख्या दबाओ जहाँ वह आता है। तुम उसे खींच भी सकते हो।') : T2('Tap a role, then tap its box. You can also drag it.', 'एक पद दबाओ, फिर उसका बॉक्स दबाओ। तुम उसे खींच भी सकते हो।'));

    const onDown = (e) => {
      const c = e.target.closest && e.target.closest('[data-card]');
      if (!c || !root.contains(c) || (e.button != null && e.button > 0)) return;
      drag.st = { id: c.dataset.card, x: e.clientX, y: e.clientY, el: c, on: false };
    };
    const slotAt = (x, y) => { const n = document.elementFromPoint(x, y); return n && n.closest ? n.closest('[data-slot]') : null; };
    const onMove = (e) => {
      const d = drag.st; if (!d) return;
      if (!d.on) {
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
        if (!api.allowed('drag:' + d.id)) { api.nudge('drag:' + d.id); drag.st = null; return; }
        d.on = true; S.sel = d.id;
        const g = d.el.cloneNode(true); g.className = 'bz-card bz-ghost'; g.style.width = d.el.offsetWidth + 'px'; g.removeAttribute('data-card'); g.removeAttribute('data-key');
        document.body.appendChild(g); drag.ghost = g; d.el.style.opacity = '.35';
      }
      e.preventDefault();
      drag.ghost.style.left = e.clientX - drag.ghost.offsetWidth / 2 + 'px'; drag.ghost.style.top = e.clientY - 24 + 'px';
      root.querySelectorAll('.bz-slot.hot').forEach((n) => n.classList.remove('hot'));
      const s = slotAt(e.clientX, e.clientY); if (s && root.contains(s)) s.classList.add('hot');
    };
    const endDrag = (e, cancel) => {
      const d = drag.st; drag.st = null; if (!d) return;
      if (drag.ghost) { drag.ghost.remove(); drag.ghost = null; }
      if (!d.on) return;
      drag.suppress = true; setTimeout(() => { drag.suppress = false; }, 60);
      d.el.style.opacity = '';
      const s = cancel ? null : slotAt(e.clientX, e.clientY);
      if (s && root.contains(s)) { if (!api.allowed('slot:' + s.dataset.slot)) { api.nudge('slot:' + s.dataset.slot); S.sel = null; draw(); } else tryPlace(d.id, s.dataset.slot); }
      else { S.sel = null; draw(); }
    };
    const onUp = (e) => endDrag(e, false);
    const onCancel = (e) => endDrag(e, true);

    // ---- generic answer box (break-even, working capital)
    S.ans = ''; S.solved = false; S.tries = 0;
    const ansHtml = (label) => `<div class="bz-ans"><label for="bz-ans">${t(label)}</label><input id="bz-ans" class="bz-in" data-key="answer" inputmode="decimal" autocomplete="off" value="${esc(S.ans)}"${S.solved ? ' readonly' : ''}><button type="button" class="bz-btn" data-act="check" data-key="answer"${S.solved ? ' disabled' : ''}>${t(T2('Check', 'जाँचो'))}</button></div>`;
    const readAns = () => { const el = elB.querySelector('#bz-ans'); if (el) S.ans = el.value; const s = String(S.ans).replace(/[₹,\s]/g, ''); return /^\d*\.?\d+$/.test(s) ? parseFloat(s) : null; };
    function grade(ok, rightMsg, wrongMsg) {
      if (ok === 'empty') { sayR('info', 'Type a number first.', 'पहले एक संख्या लिखो।'); const el = elB.querySelector('#bz-ans'); if (el) el.focus(); return; }
      if (ok) { S.solved = true; ev('answered:right'); api.record('Answered ' + S.ans + ': right'); api.celebrate(); say('good', rightMsg); draw(); }
      else { S.tries++; ev('answered:wrong'); api.record('Answered ' + S.ans + ': wrong'); say('bad', wrongMsg); draw(); const el = elB.querySelector('#bz-ans'); if (el) { el.focus(); el.select(); } }
    }

    // ============================================================ the modes
    const M = {};

    // ---- form of organisation
    M['form-of-org'] = () => {
      const start = P.case ? ORG_CASES.findIndex((x) => x.id === P.case) : 0;
      const order = ORG_CASES.map((_, i) => (i + start) % ORG_CASES.length);
      const s = { i: 0, got: null, wrong: [], tries: 0, right: 0 };
      const cur = () => ORG_CASES[order[s.i]];
      return {
        init() { say('info', T2('Read the case, then tap the form of business that fits.', 'मामला पढ़ो, फिर वह व्यवसाय रूप दबाओ जो ठीक बैठे।')); },
        a() {
          const c = cur();
          return `<div class="bz-panel"><div class="bz-case"><span class="no">${s.i + 1}/${order.length}</span><p>${t(c.q)}</p></div></div>`;
        },
        b() {
          const c = cur();
          const btns = FORM_IDS.map((f) => `<button type="button" class="bz-ch${s.got === f ? ' right' : ''}${s.wrong.includes(f) ? ' wrong' : ''}" style="--c:${FORMS[f].col}" data-act="choice" data-id="${f}" data-key="choice:${f}"${s.got ? ' disabled' : ''}><b>${t(FORMS[f].n)}</b></button>`).join('');
          let out = '';
          if (s.got) out = `<div class="bz-panel"><h4>${t(FORMS[c.a].n)}</h4>${profileTable(c.a)}</div><div class="bz-row"><button type="button" class="bz-btn" data-act="next" data-key="next">${t(s.i + 1 < order.length ? T2('Next case', 'अगला मामला') : T2('Play again', 'फिर से खेलो'))}</button></div>`;
          return `<div class="bz-grid" role="group" aria-label="${t(T2('Forms of business', 'व्यवसाय के रूप'))}">${btns}</div>${out}`;
        },
        act: {
          choice(el) {
            if (s.got) return;
            const f = el.dataset.id, c = cur();
            ev('decided');
            if (f === c.a) { s.got = f; ev('answered:right'); api.celebrate(); api.record('Chose ' + FORMS[f].n.en + ': right'); say('good', { en: 'Yes! ' + c.why.en, hi: 'हाँ! ' + c.why.hi }); }
            else { s.wrong.push(f); ev('answered:wrong'); api.record('Chose ' + FORMS[f].n.en + ': wrong'); say('bad', { en: `${FORMS[f].n.en} means ${FORMS[f].trait.en}. Read the case again.`, hi: `${FORMS[f].n.hi} यानी ${FORMS[f].trait.hi}। मामला फिर से पढ़ो।` }); }
            draw();
          },
          next() { s.i = (s.i + 1) % order.length; s.got = null; s.wrong = []; say('info', T2('Read the case, then tap the form of business that fits.', 'मामला पढ़ो, फिर वह व्यवसाय रूप दबाओ जो ठीक बैठे।')); draw(); },
        },
      };
    };

    // ---- organisation chart
    M['org-chart'] = () => {
      const o = ORG[P.chart === 'functional' ? 'functional' : 'line'];
      CARDS = o.cards; CAP = () => 1;
      const nb = o.branches.length;
      const ins = nb === 3 ? '16.66%' : '25%';
      return {
        init() { say('info', startMsg()); },
        a() {
          const br = o.branches.map((b) => `<div class="bz-br"><h5>${t(b.h)}</h5>${b.slots.map((sl, i) => (i ? '<span class="bz-v"></span>' : '') + slotBtn(sl.id, sl.lv)).join('')}</div>`).join('');
          return `<div class="bz-panel"><div class="bz-tree">${slotBtn(o.root.id, o.root.lv)}<span class="bz-v"></span><div class="bz-fork" style="grid-template-columns:repeat(${nb},minmax(0,1fr));--ins:${ins}">${br}</div></div></div>${trayHtml()}${Object.keys(S.in).length ? resetBtn() : ''}`;
        },
        act: dndActs,
      };
    };

    // ---- planning
    M.planning = () => {
      CARDS = STEPS; CAP = () => 1;
      const s = { budget: P.budget != null ? P.budget : 80000, got: null };
      return {
        init() { say('info', startMsg()); },
        cur: (name) => s[name],
        a() {
          const rows = STEP_SLOTS.map((id, i) => `<div class="bz-step"><span class="n" aria-hidden="true">${i + 1}</span>${slotBtn(id, T2('Step ' + (i + 1), 'चरण ' + (i + 1)))}</div>`).join('');
          return `<div class="bz-panel"><h4>${t(T2('1. The steps of planning', '1. योजना के चरण'))}</h4><div class="bz-steps">${rows}</div></div>${trayHtml()}${Object.keys(S.in).length ? resetBtn() : ''}`;
        },
        ctl: () => `<div class="bz-panel"><h4>${t(T2('2. Choose a plan for your money', '2. अपने पैसे के लिए योजना चुनो'))}</h4>${slider('budget', T2('Money you have', 'तुम्हारे पास पैसा'), 20000, 200000, 10000, s.budget, R)}</div>`,
        b() {
          const best = bestAlt(s.budget);
          const rows = ALTS.map((x) => {
            const ok = x.inv <= s.budget;
            return `<button type="button" class="bz-ch${s.got === x.id ? ' right' : ''}${ok ? '' : ' out'}" style="--c:${ok ? '#1D4ED8' : '#94A3B8'}" data-act="alt" data-id="${x.id}" data-key="choice:${x.id}"${s.got ? ' disabled' : ''}><b>${t(x.n)}</b><small>${t(T2('Cost', 'लागत'))} ${R(x.inv)} · ${t(T2('Profit a year', 'वार्षिक लाभ'))} ${R(x.prof)}</small><small>${t(T2('Earns', 'कमाई'))} ${num((x.prof / x.inv) * 100)}% · ${t(T2('Pays back in', 'लागत वापस'))} ${num(x.inv / x.prof)} ${t(T2('years', 'वर्ष'))}${ok ? '' : ' · ' + t(T2('too costly', 'बहुत महँगा'))}</small></button>`;
          }).join('');
          return `<div class="bz-grid" role="group" aria-label="${t(T2('Plans', 'योजनाएँ'))}">${rows}</div>${s.got ? `<p class="bz-done">${t({ en: `Best plan for ${R(s.budget)}: ${best.n.en}.`, hi: `${R(s.budget)} के लिए सबसे अच्छी योजना: ${best.n.hi}।` })}</p>` : ''}`;
        },
        slide(name, v) { s.budget = v; s.got = null; const b = bestAlt(v); sayR('info', `With ${R(v)} you can afford ${ALTS.filter((x) => x.inv <= v).length} of the 4 plans. Compare what each earns per rupee.`, `${R(v)} में तुम 4 में से ${ALTS.filter((x) => x.inv <= v).length} योजनाओं का ख़र्च उठा सकते हो। देखो हर रुपये पर कौन ज़्यादा कमाती है।`); },
        act: Object.assign({}, dndActs, {
          alt(el) {
            const x = ALTS.find((q) => q.id === el.dataset.id), best = bestAlt(s.budget);
            ev('decided');
            if (x.inv > s.budget) { ev('answered:wrong'); sayR('bad', `${x.n.en} costs ${R(x.inv)}, more than the ${R(s.budget)} you have.`, `${x.n.hi} की लागत ${R(x.inv)} है, जो तुम्हारे ${R(s.budget)} से ज़्यादा है।`); return; }
            if (x.id === best.id) { s.got = x.id; ev('answered:right'); api.celebrate(); say('good', { en: `Right. Among plans you can afford, ${x.n.en} earns the most on each rupee: ${num((x.prof / x.inv) * 100)}% a year.`, hi: `सही। जिन योजनाओं का ख़र्च तुम उठा सकते हो, उनमें ${x.n.hi} हर रुपये पर सबसे ज़्यादा कमाती है: ${num((x.prof / x.inv) * 100)}% वार्षिक।` }); draw(); }
            else { ev('answered:wrong'); say('bad', { en: `${x.n.en} earns ${num((x.prof / x.inv) * 100)}% a year. Another plan you can afford earns more on each rupee.`, hi: `${x.n.hi} ${num((x.prof / x.inv) * 100)}% वार्षिक कमाती है। तुम्हारे बजट की एक और योजना हर रुपये पर ज़्यादा कमाती है।` }); }
          },
        }),
      };
    };

    // ---- marketing mix
    M['marketing-mix'] = () => {
      const per = P.perP != null ? P.perP : 3;
      const cnt = {};
      CARDS = MIX.filter((c) => { cnt[c.slot] = (cnt[c.slot] || 0) + 1; return cnt[c.slot] <= per; });
      CAP = () => per;
      return {
        init() { say('info', startMsg()); },
        a() {
          const bk = P_IDS.map((id) => `<div class="bz-bk" style="--c:${PS[id].col};--fg:${id === 'product' ? '#1E293B' : '#fff'}"><h5>${t(PS[id].n)}<small>${t(PS[id].t)}</small></h5>${slotBtn(id, T2('Drop here', 'यहाँ रखो'))}</div>`).join('');
          return `<div class="bz-buckets">${bk}</div><h4 style="margin:12px 0 4px">${t(T2('Decisions to sort', 'छाँटने के निर्णय'))}</h4>${trayHtml()}${Object.keys(S.in).length ? resetBtn() : ''}`;
        },
        act: dndActs,
      };
    };

    // ---- pricing
    M.pricing = () => {
      const F = P.fixed != null ? P.fixed : T.F;
      const pz = Math.floor(T.a / T.b), st = stepOf(T);
      const lo = Math.max(st, Math.ceil((T.v * 0.5) / st) * st), hi = pz - st;
      const s = { p: P.price != null ? P.price : clamp(Math.round((T.v + (pz - T.v) * 0.15) / st) * st, lo, hi), fixed: false, reveal: false };
      const best = bestPrice(T, F);
      const people = (n) => { const tot = 20; const on = Math.round(clamp(n / T.a, 0, 1) * tot); let h = ''; for (let i = 0; i < tot; i++) h += `<svg viewBox="0 0 20 28" aria-hidden="true"><circle cx="10" cy="7" r="5" fill="${i < on ? T.col : '#CBD5E1'}"/><path d="M2 27v-8a8 8 0 0 1 16 0v8z" fill="${i < on ? T.col : '#CBD5E1'}"/></svg>`; return h; };
      const chart = () => {
        const W = 360, H = 220, l = 46, r = 10, tp = 16, bt = 32;
        const xs = (p) => l + ((p - T.v) / (pz - T.v)) * (W - l - r);
        const pts = []; let mn = Infinity, mx = -Infinity;
        for (let p = Math.ceil(T.v); p <= pz; p += pz - T.v > 80 ? 2 : 1) { const y = profitAt(T, F, p); pts.push([p, y]); mn = Math.min(mn, y); mx = Math.max(mx, y); }
        mn = Math.min(mn, 0); mx = Math.max(mx, 0, 1);
        const ys = (y) => tp + (1 - (y - mn) / (mx - mn)) * (H - tp - bt);
        const d = pts.map((q, i) => (i ? 'L' : 'M') + xs(q[0]).toFixed(1) + ' ' + ys(q[1]).toFixed(1)).join('');
        s.drawn = true;
        const cp = profitAt(T, F, s.p);
        const ticks = [mn, 0, mx].filter((v, i, a) => a.indexOf(v) === i);
        return `<svg class="bz-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(raw(T2('Profit at each price', 'हर दाम पर लाभ')))}">
          <rect x="${l}" y="${ys(0)}" width="${W - l - r}" height="${Math.max(0, H - bt - ys(0))}" fill="#DC2626" opacity=".08"/>
          ${ticks.map((v) => `<line class="gr" x1="${l}" x2="${W - r}" y1="${ys(v)}" y2="${ys(v)}"/><text x="${l - 4}" y="${ys(v) + 4}" font-size="11" text-anchor="end">${fmtInt(v)}</text>`).join('')}
          <line class="ax" x1="${l}" x2="${l}" y1="${tp}" y2="${H - bt}"/><line class="ax" x1="${l}" x2="${W - r}" y1="${ys(0)}" y2="${ys(0)}"/>
          <path class="${s.drawn ? '' : 'bz-draw'}" d="${d}" fill="none" stroke="${T.col}" stroke-width="3.5" stroke-linejoin="round"/>
          ${s.reveal ? `<line x1="${xs(best.p)}" x2="${xs(best.p)}" y1="${tp}" y2="${H - bt}" stroke="#15803D" stroke-width="2" stroke-dasharray="4 4"/><text x="${xs(best.p)}" y="${tp + 8}" font-size="11" text-anchor="middle" font-weight="700" fill="#15803D" style="fill:#15803D">${R(best.p)}</text>` : ''}
          <line x1="${xs(s.p)}" x2="${xs(s.p)}" y1="${ys(cp)}" y2="${ys(0)}" stroke="#061233" stroke-width="1.5" stroke-dasharray="3 3"/>
          <circle class="bz-pulse" cx="${xs(s.p)}" cy="${ys(cp)}" r="8" fill="#FFD23F" stroke="#061233" stroke-width="3"/>
          <text x="${(l + W - r) / 2}" y="${H - 8}" font-size="12" text-anchor="middle">${esc(raw(T2('Price of one ' + T.u.en, 'एक ' + T.u.hi + ' का दाम')))} (₹)</text>
          <text x="${l + 4}" y="${ys(mx) + 12}" font-size="11">${esc(raw(T2('Profit a month (₹)', 'मासिक लाभ (₹)')))}</text></svg>`;
      };
      return {
        init() { say('info', { en: `Move the price. Each ${unit} costs ${R(T.v)} to make, and ${R(F)} a month is paid whatever you sell.`, hi: `दाम चलाओ। हर ${unit} बनाने में ${R(T.v)} लगते हैं और बिके या न बिके, महीने के ${R(F)} देने ही हैं।` }); },
        cur: () => s.p,
        a() { return `<div class="bz-panel">${chart()}</div>`; },
        ctl: () => `<div class="bz-panel">${slider('price', T2('Price of one ' + T.u.en, 'एक ' + T.u.hi + ' का दाम'), lo, hi, st, s.p, R)}</div>`,
        b() {
          const q = demand(T, s.p), rev = q * s.p, cost = F + q * T.v, pr = rev - cost;
          return `<div class="bz-panel"><div class="bz-people" role="img" aria-label="${esc(raw(T2('Buyers each month', 'हर महीने ख़रीदार')) + ': ' + q)}">${people(q)}</div>
          <div class="bz-stats"><div class="bz-stat" style="--c:${T.col}"><small>${t(T2('Buyers a month', 'मासिक ख़रीदार'))}</small><b>${fmtInt(q)}</b></div>
          <div class="bz-stat" style="--c:#1D4ED8"><small>${t(T2('Money coming in', 'आमदनी'))}</small><b>${R(rev)}</b></div>
          <div class="bz-stat" style="--c:#8B3DFF"><small>${t(T2('All costs', 'कुल लागत'))}</small><b>${R(cost)}</b></div>
          <div class="bz-stat ${pr >= 0 ? 'pos' : 'neg'}"><small>${t(pr >= 0 ? T2('Profit', 'लाभ') : T2('Loss', 'हानि'))}</small><b>${R(Math.abs(pr))}</b></div></div>
          <p style="margin:6px 0 0;font-size:.9rem;color:var(--ink-2)">${t(T2('Extra over the cost of one', 'एक की लागत से ऊपर'))}: ${R(s.p - T.v)} (${num(((s.p - T.v) / T.v) * 100)}%)</p>
          <div class="bz-row"><button type="button" class="bz-btn" data-act="fix" data-key="choice:fix"${s.fixed ? ' disabled' : ''}>${t(T2('Fix this price', 'यही दाम पक्का करो'))}</button>${s.fixed ? `<button type="button" class="bz-btn ghost" data-act="again" data-key="reset">${t(T2('Try again', 'फिर से कोशिश करो'))}</button>` : ''}</div></div>`;
        },
        slide(name, v) { s.p = v; s.fixed = false; s.reveal = false; const q = demand(T, v), pr = profitAt(T, F, v); say('info', { en: `At ${R(v)}, ${fmtInt(q)} people buy and the ${pr >= 0 ? 'profit' : 'loss'} is ${R(Math.abs(pr))} a month.`, hi: `${R(v)} पर ${fmtInt(q)} लोग ख़रीदते हैं और मासिक ${pr >= 0 ? 'लाभ' : 'हानि'} ${R(Math.abs(pr))} है।` }); },
        redraw: 'ab',
        act: {
          fix() {
            const pr = profitAt(T, F, s.p); s.fixed = true; s.reveal = true; ev('decided');
            if (pr >= best.pr * 0.97 && pr > 0) { ev('answered:right'); api.celebrate(); say('good', { en: `Well chosen! You earn ${R(pr)} a month. The best price is about ${R(best.p)}, earning ${R(best.pr)}.`, hi: `बढ़िया चुना! तुम महीने में ${R(pr)} कमाते हो। सबसे अच्छा दाम लगभग ${R(best.p)} है, जिस पर ${R(best.pr)} मिलते हैं।` }); }
            else { ev('answered:wrong'); say('bad', s.p < best.p ? { en: `At ${R(s.p)} you ${pr < 0 ? 'lose ' + R(-pr) : 'earn ' + R(pr)}. Many buy, but each gives you little. A higher price earns more (best: ${R(best.p)}).`, hi: `${R(s.p)} पर ${pr < 0 ? R(-pr) + ' की हानि' : 'कमाई ' + R(pr)}। ख़रीदार बहुत हैं पर हर एक से कम मिलता है। ऊँचा दाम ज़्यादा कमाएगा (सबसे अच्छा: ${R(best.p)})।` } : { en: `At ${R(s.p)} you ${pr < 0 ? 'lose ' + R(-pr) : 'earn ' + R(pr)}. Each sale gives a lot, but too many people stop buying. A lower price earns more (best: ${R(best.p)}).`, hi: `${R(s.p)} पर ${pr < 0 ? R(-pr) + ' की हानि' : 'कमाई ' + R(pr)}। हर बिक्री से बहुत मिलता है पर बहुत लोग ख़रीदना छोड़ देते हैं। कम दाम ज़्यादा कमाएगा (सबसे अच्छा: ${R(best.p)})।` }); }
            draw();
          },
          again() { s.fixed = false; s.reveal = false; say('info', T2('Move the price and try again.', 'दाम चलाओ और फिर कोशिश करो।')); draw(); },
        },
      };
    };

    // ---- break-even
    M['break-even'] = () => {
      const st = T.p >= 100 ? 5 : 1;
      const v0 = P.variable != null ? P.variable : T.v, p0 = P.price != null ? P.price : T.p, F0 = P.fixed != null ? P.fixed : T.F;
      const b0 = bepOf(p0, v0, F0);
      const s = { p: p0, v: v0, F: F0, u: P.units != null ? P.units : Math.round(b0 * 0.45), pass: false };
      const fstep = F0 >= 50000 ? 1000 : F0 >= 5000 ? 500 : 100;
      const uMax = Math.max(10, Math.ceil((b0 * 2.4) / 10) * 10);
      s.pass = s.p > s.v && s.u >= bepOf(s.p, s.v, s.F);
      const bep = () => bepOf(s.p, s.v, s.F);
      const chart = () => {
        const W = 360, H = 230, l = 50, r = 10, tp = 14, bt = 34;
        const b = bep();
        const xm = Math.max(10, niceCeil(Math.max(b ? b * 1.8 : 0, s.u * 1.15, uMax * 0.6)));
        const ym = Math.max(s.p * xm, s.F + s.v * xm, 1);
        const xs = (x) => l + (x / xm) * (W - l - r), ys = (y) => tp + (1 - y / ym) * (H - tp - bt);
        const rev = (x) => s.p * x, tc = (x) => s.F + s.v * x;
        let area = '';
        if (b && b < xm) area = `<polygon points="${xs(0)},${ys(rev(0))} ${xs(b)},${ys(rev(b))} ${xs(0)},${ys(tc(0))}" fill="#DC2626" opacity=".16"/><polygon points="${xs(b)},${ys(rev(b))} ${xs(xm)},${ys(rev(xm))} ${xs(xm)},${ys(tc(xm))}" fill="#15803D" opacity=".18"/>`;
        else area = `<polygon points="${xs(0)},${ys(rev(0))} ${xs(xm)},${ys(rev(xm))} ${xs(xm)},${ys(tc(xm))} ${xs(0)},${ys(tc(0))}" fill="#DC2626" opacity=".16"/>`;
        const xt = [0, 1, 2, 3, 4].map((i) => (xm / 4) * i), yt = [0, 1, 2, 3, 4].map((i) => (ym / 4) * i);
        const uy = Math.max(rev(s.u), tc(s.u));
        return `<svg class="bz-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(raw(T2('Chart of income and total cost against ' + T.pl.en + ' sold', 'बिके हुए ' + T.pl.hi + ' के हिसाब से आमदनी और कुल लागत का चार्ट')))}">
          ${yt.map((y) => `<line class="gr" x1="${l}" x2="${W - r}" y1="${ys(y)}" y2="${ys(y)}"/><text x="${l - 4}" y="${ys(y) + 4}" font-size="10.5" text-anchor="end">${shortN(y)}</text>`).join('')}
          ${xt.map((x) => `<text x="${xs(x)}" y="${H - bt + 14}" font-size="10.5" text-anchor="middle">${shortN(x)}</text>`).join('')}
          <line class="ax" x1="${l}" x2="${l}" y1="${tp}" y2="${H - bt}"/><line class="ax" x1="${l}" x2="${W - r}" y1="${H - bt}" y2="${H - bt}"/>
          ${area}
          <line x1="${xs(0)}" x2="${xs(xm)}" y1="${ys(tc(0))}" y2="${ys(tc(xm))}" stroke="#8B3DFF" stroke-width="3.5" stroke-linecap="round"/>
          <line x1="${xs(0)}" x2="${xs(xm)}" y1="${ys(0)}" y2="${ys(rev(xm))}" stroke="#1D4ED8" stroke-width="3.5" stroke-linecap="round"/>
          <line x1="${l}" x2="${xs(xm)}" y1="${ys(s.F)}" y2="${ys(s.F)}" stroke="#8B3DFF" stroke-width="1.5" stroke-dasharray="5 4" opacity=".7"/>
          ${b && b < xm ? `<line x1="${xs(b)}" x2="${xs(b)}" y1="${ys(rev(b))}" y2="${H - bt}" stroke="#061233" stroke-width="1.5" stroke-dasharray="4 4"/><circle class="bz-pulse" cx="${xs(b)}" cy="${ys(rev(b))}" r="8" fill="#FFD23F" stroke="#061233" stroke-width="3"/><text x="${clamp(xs(b), 70, W - 60)}" y="${ys(rev(b)) - 14}" font-size="11.5" font-weight="700" text-anchor="middle">${esc(raw(T2('Break-even', 'सम-विच्छेद')))}: ${fmtInt(Math.ceil(b))}</text>` : ''}
          <line x1="${xs(s.u)}" x2="${xs(s.u)}" y1="${ys(uy)}" y2="${H - bt}" stroke="#E11D48" stroke-width="2"/><circle cx="${xs(s.u)}" cy="${ys(uy)}" r="5" fill="#E11D48"/>
          <text x="${xs(xm) - 2}" y="${ys(rev(xm)) + 14}" font-size="11" text-anchor="end" fill="#1D4ED8" style="fill:#1D4ED8;font-weight:700">${esc(raw(T2('Income', 'आमदनी')))}</text>
          <text x="${xs(xm) - 2}" y="${ys(tc(xm)) - 5}" font-size="11" text-anchor="end" style="fill:#8B3DFF;font-weight:700">${esc(raw(T2('Total cost', 'कुल लागत')))}</text>
          <text x="${(l + W - r) / 2}" y="${H - 6}" font-size="11.5" text-anchor="middle">${esc(raw(T2(T.pl.en + ' sold in a month', 'महीने में बिके ' + T.pl.hi)))}</text></svg>`;
      };
      return {
        init() { say('info', { en: `Slide the number of ${T.pl.en} sold until the red dot crosses the break-even point.`, hi: `बिके हुए ${T.pl.hi} का स्लाइडर तब तक चलाओ जब तक लाल बिंदु सम-विच्छेद बिंदु पार न कर ले।` }); },
        cur: (n) => ({ price: s.p, variable: s.v, fixed: s.F, units: s.u })[n],
        a() { return `<div class="bz-panel">${chart()}</div>`; },
        ctl() {
          const pMax = Math.max(T.p * 3, p0 * 2), vMax = Math.max(T.p * 2, v0 * 2), fMax = Math.max(F0 * 3, 1000);
          return `<div class="bz-panel">${slider('units', T2(T.pl.en + ' sold a month', 'महीने में बिके ' + T.pl.hi), 0, uMax, 1, s.u, fmtInt)}${slider('price', T2('Selling price of one', 'एक का बिक्री दाम'), 1, pMax, st, s.p, R)}${slider('variable', T2('Cost to make one', 'एक बनाने की लागत'), 0, vMax, st, s.v, R)}${slider('fixed', T2('Fixed cost a month (rent, salary)', 'मासिक स्थिर लागत (किराया, वेतन)'), 0, fMax, fstep, s.F, R)}</div>`;
        },
        b() {
          const b = bep(), rev = s.p * s.u, cost = s.F + s.v * s.u, pr = rev - cost, cm = s.p - s.v;
          const msg = b == null ? `<div class="bz-panel"><b>${t(T2('No break-even: the price is not above the cost of making one, so every sale loses money.', 'सम-विच्छेद नहीं: दाम एक बनाने की लागत से ऊपर नहीं है, इसलिए हर बिक्री से घाटा होता है।'))}</b></div>` : '';
          const cell = (cls, lab, val, c) => `<div class="bz-stat ${cls}" style="--c:${c}"><small>${t(lab)}</small><b>${val}</b></div>`;
          const stats = b == null ? '' : `<div class="bz-stats">${cell('', T2('Extra from each sale', 'हर बिक्री से बचत'), R(cm), '#1D4ED8')}${cell('', T2('Break-even point', 'सम-विच्छेद बिंदु'), `${num(b)} ${t(T2('units', 'इकाई'))}`, '#FFD23F')}${cell('', T2('Break-even income', 'सम-विच्छेद आमदनी'), R(Math.round(b * s.p)), '#8B3DFF')}${cell(pr >= 0 ? 'pos' : 'neg', pr >= 0 ? T2('Profit now', 'अभी लाभ') : T2('Loss now', 'अभी हानि'), R(Math.abs(pr)), '#15803D')}</div>`;
          const f = b == null ? '' : `<p style="margin:4px 0;font-size:.95rem;font-weight:600">${t(T2('Break-even = fixed cost ÷ (price − cost of one)', 'सम-विच्छेद = स्थिर लागत ÷ (दाम − एक की लागत)'))} = ${R(s.F)} ÷ ${R(cm)} = ${num(b)}</p>`;
          const mos = b != null && s.u > b ? `<p style="margin:4px 0;font-size:.95rem">${t(T2('Margin of safety', 'सुरक्षा-सीमा'))}: ${num(((s.u - b) / s.u) * 100)}%</p>` : '';
          return `${msg}<div class="bz-panel">${f}${stats}${mos}${b == null ? '' : ansHtml(T2('How many ' + T.pl.en + ' must be sold a month to break even?', 'बराबरी पर आने के लिए महीने में कितने ' + T.pl.hi + ' बेचने होंगे?'))}</div>`;
        },
        slide(name, v) {
          const before = s.pass;
          if (name === 'price') s.p = v; else if (name === 'variable') s.v = v; else if (name === 'fixed') s.F = v; else s.u = v;
          const b = bep(); s.pass = b != null && s.u >= b;
          S.ans = ''; S.solved = false; S.tries = 0;
          if (b == null) sayR('bad', 'The price is not above the cost of one. You can never break even.', 'दाम एक की लागत से ऊपर नहीं है। बराबरी कभी नहीं होगी।');
          else if (s.pass && !before) { ev('break-even'); api.record('Reached break-even at ' + s.u); api.celebrate(); say('good', { en: `Break-even reached: ${fmtInt(s.u)} sold covers all costs. Every one after this is profit.`, hi: `सम-विच्छेद आ गया: ${fmtInt(s.u)} की बिक्री से सारी लागत निकल गई। इसके बाद की हर बिक्री लाभ है।` }); }
          else if (s.pass) sayR('good', 'In profit. Every extra sale adds ' + R(s.p - s.v) + '.', 'लाभ में हो। हर अतिरिक्त बिक्री ' + R(s.p - s.v) + ' जोड़ती है।');
          else { const need = Math.ceil(b) - s.u; sayR('info', `In loss. ${fmtInt(need)} more to sell before break-even.`, `हानि में हो। सम-विच्छेद तक ${fmtInt(need)} और बेचने होंगे।`); }
        },
        redraw: 'ab',
        act: {
          check() {
            const b = bep(); if (b == null) return;
            const v = readAns();
            if (v == null) return grade('empty');
            const ok = v === Math.ceil(b) || Math.abs(v - b) < 0.01;
            grade(ok, { en: `Yes! ${R(s.F)} ÷ ${R(s.p - s.v)} = ${num(b)}, so sell at least ${fmtInt(Math.ceil(b))} (whole units).`, hi: `हाँ! ${R(s.F)} ÷ ${R(s.p - s.v)} = ${num(b)}, इसलिए कम से कम ${fmtInt(Math.ceil(b))} (पूरी इकाइयाँ) बेचो।` }, { en: `Not yet. Divide the fixed cost ${R(s.F)} by what each sale leaves after cost (${R(s.p)} − ${R(s.v)} = ${R(s.p - s.v)}).`, hi: `अभी नहीं। स्थिर लागत ${R(s.F)} को हर बिक्री की बचत (${R(s.p)} − ${R(s.v)} = ${R(s.p - s.v)}) से भाग दो।` });
          },
        },
      };
    };

    // ---- working capital
    M['working-capital'] = () => {
      const s = { st: P.stock != null ? P.stock : T.st, de: P.debtors != null ? P.debtors : T.de, cr: P.creditors != null ? P.creditors : T.cr, day: P.dailyCost != null ? P.dailyCost : T.day };
      const ccc = () => s.st + s.de - s.cr;
      const chart = () => {
        const W = 360, H = 140, l = 12, r = 12, tp = 24, bw = 28;
        const mx = Math.max(20, niceCeil(Math.max(s.st + s.de, s.cr) * 1.1));
        const xs = (d) => l + (d / mx) * (W - l - r);
        const gap = Math.max(0, ccc());
        const lab = (a, b2, y, txt, col) => { const w = xs(b2) - xs(a), n = b2 - a; const full = txt + ' ' + n; if (w > full.length * 6.4 + 8) return `<text x="${(xs(a) + xs(b2)) / 2}" y="${y}" font-size="11" text-anchor="middle" style="fill:${col};stroke:none;font-weight:700">${esc(full)}</text>`; if (w > String(n).length * 7 + 6) return `<text x="${(xs(a) + xs(b2)) / 2}" y="${y}" font-size="11" text-anchor="middle" style="fill:${col};stroke:none;font-weight:700">${n}</text>`; return ''; };
        return `<svg class="bz-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(raw(T2(`Stock ${s.st} days, customers pay after ${s.de} days, suppliers paid after ${s.cr} days. Your money is tied up ${gap} days.`, `माल ${s.st} दिन, ग्राहक ${s.de} दिन में चुकाते हैं, आपूर्तिकर्ता को ${s.cr} दिन में चुकाते हैं। तुम्हारा पैसा ${gap} दिन फँसा रहता है।`)))}">
          <text x="${l}" y="14" font-size="11.5" font-weight="700">${esc(raw(T2('Money goes out and comes back', 'पैसा जाता है और लौटता है')))}</text>
          <rect x="${xs(0)}" y="${tp}" width="${Math.max(0, xs(s.st) - xs(0))}" height="${bw}" rx="6" fill="#FF7A1A"/><rect x="${xs(s.st)}" y="${tp}" width="${Math.max(0, xs(s.st + s.de) - xs(s.st))}" height="${bw}" rx="6" fill="#1D4ED8"/>
          ${lab(0, s.st, tp + 18, raw(T2('Stock', 'माल')), '#1E293B')}${lab(s.st, s.st + s.de, tp + 18, raw(T2('Customers', 'ग्राहक')), '#fff')}
          <rect x="${xs(0)}" y="${tp + bw + 14}" width="${Math.max(0, xs(s.cr) - xs(0))}" height="${bw}" rx="6" fill="#14B8A6"/>${lab(0, s.cr, tp + bw + 32, raw(T2('Suppliers wait', 'आपूर्तिकर्ता रुकते')), '#1E293B')}
          ${gap > 0 ? `<rect x="${xs(s.cr)}" y="${tp + bw + 14}" width="${xs(s.st + s.de) - xs(s.cr)}" height="${bw}" rx="6" fill="#DC2626" opacity=".85"/>${lab(s.cr, s.st + s.de, tp + bw + 32, raw(T2('Your money', 'तुम्हारा पैसा')), '#fff')}` : ''}
          <line class="ax" x1="${l}" x2="${W - r}" y1="${H - 34}" y2="${H - 34}"/>
          ${[0, 1, 2, 3, 4].map((i) => `<text x="${xs((mx / 4) * i)}" y="${H - 18}" font-size="10.5" text-anchor="${i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}">${Math.round((mx / 4) * i)}</text>`).join('')}
          <text x="${W / 2}" y="${H - 3}" font-size="11" text-anchor="middle">${esc(raw(T2('days', 'दिन')))}</text></svg>`;
      };
      return {
        init() { say('info', { en: `Daily spending is ${R(s.day)}. Slide the days and watch how long your own money is stuck.`, hi: `रोज़ का ख़र्च ${R(s.day)} है। दिन चलाओ और देखो कि तुम्हारा अपना पैसा कितने दिन फँसता है।` }); },
        cur: (n) => ({ stock: s.st, debtors: s.de, creditors: s.cr })[n],
        a() { return `<div class="bz-panel">${chart()}</div>`; },
        ctl: () => `<div class="bz-panel">${slider('stock', T2('Days the stock sits in the shop', 'माल कितने दिन दुकान में रहता है'), 0, 60, 1, s.st, (v) => v + ' ' + raw(T2('days', 'दिन')))}${slider('debtors', T2('Days customers take to pay', 'ग्राहक कितने दिन में पैसे चुकाते हैं'), 0, 90, 1, s.de, (v) => v + ' ' + raw(T2('days', 'दिन')))}${slider('creditors', T2('Days you take to pay suppliers', 'तुम आपूर्तिकर्ता को कितने दिन में चुकाते हो'), 0, 90, 1, s.cr, (v) => v + ' ' + raw(T2('days', 'दिन')))}</div>`,
        b() {
          const c = ccc(), g = Math.max(0, c), need = s.day * g;
          const cell = (lab, val, col) => `<div class="bz-stat" style="--c:${col}"><small>${t(lab)}</small><b>${val}</b></div>`;
          return `<div class="bz-panel"><p style="margin:0 0 6px;font-size:.95rem;font-weight:600">${t(T2('Days your money is stuck = stock days + customer days − supplier days', 'पैसा फँसने के दिन = माल के दिन + ग्राहकों के दिन − आपूर्तिकर्ता के दिन'))} = ${s.st} + ${s.de} − ${s.cr} = ${c}</p>
            <div class="bz-stats">${cell(T2('Operating cycle', 'परिचालन चक्र'), `${s.st + s.de} ${t(T2('days', 'दिन'))}`, '#FF7A1A')}${cell(T2('Money stuck', 'फँसा पैसा'), `${g} ${t(T2('days', 'दिन'))}`, '#DC2626')}${cell(T2('Working capital needed', 'ज़रूरी कार्यशील पूँजी'), R(need), '#1D4ED8')}</div>
            ${c < 0 ? `<p style="margin:4px 0">${t(T2('Suppliers wait longer than your stock and customers do, so they finance you. You need no extra working capital.', 'आपूर्तिकर्ता तुम्हारे माल और ग्राहकों से ज़्यादा इंतज़ार करते हैं, इसलिए वे तुम्हें पैसा देते हैं। अतिरिक्त कार्यशील पूँजी नहीं चाहिए।'))}</p>` : ''}
            ${ansHtml(T2('How many days is your own money stuck?', 'तुम्हारा अपना पैसा कितने दिन फँसा है?'))}</div>`;
        },
        slide(name, v) {
          if (name === 'stock') s.st = v; else if (name === 'debtors') s.de = v; else s.cr = v;
          S.ans = ''; S.solved = false; S.tries = 0;
          const g = Math.max(0, ccc());
          sayR('info', `Your money is stuck for ${g} days. You need about ${R(s.day * g)} of working capital.`, `तुम्हारा पैसा ${g} दिन फँसा है। लगभग ${R(s.day * g)} कार्यशील पूँजी चाहिए।`);
        },
        redraw: 'ab',
        act: {
          check() {
            const v = readAns(); if (v == null) return grade('empty');
            const g = Math.max(0, ccc());
            grade(v === g, { en: `Yes! ${s.st} + ${s.de} − ${s.cr}: money is stuck ${g} days, so you need about ${R(s.day * g)}.`, hi: `हाँ! ${s.st} + ${s.de} − ${s.cr}: पैसा ${g} दिन फँसा है, इसलिए लगभग ${R(s.day * g)} चाहिए।` }, { en: 'Not yet. Add the stock days and the customer days, then take away the days suppliers wait. If the answer is below zero, it is 0.', hi: 'अभी नहीं। माल के दिन और ग्राहकों के दिन जोड़ो, फिर आपूर्तिकर्ता के दिन घटाओ। उत्तर शून्य से कम हो तो 0 है।' });
          },
        },
      };
    };

    // ---- consumer protection
    M.consumer = () => {
      const forum = P.focus === 'forum';
      if (!forum) {
        const start = P.case ? C_CASES.findIndex((x) => x.id === P.case) : 0;
        const s = { i: 0, got: null, wrong: [] };
        const cur = () => C_CASES[(s.i + start) % C_CASES.length];
        return {
          init() { say('info', T2('Read the case and tap the right that applies.', 'मामला पढ़ो और लागू होने वाला अधिकार दबाओ।')); },
          a: () => `<div class="bz-panel"><div class="bz-case"><span class="no">${s.i + 1}/${C_CASES.length}</span><p>${t(cur().q)}</p></div></div>`,
          b() {
            const c = cur();
            const btns = RIGHT_IDS.map((r) => `<button type="button" class="bz-ch${s.got === r ? ' right' : ''}${s.wrong.includes(r) ? ' wrong' : ''}" style="--c:#1D4ED8" data-act="choice" data-id="${r}" data-key="choice:${r}"${s.got ? ' disabled' : ''}><b>${t(RIGHTS[r].n)}</b></button>`).join('');
            return `<div class="bz-grid" role="group" aria-label="${t(T2('Consumer rights', 'उपभोक्ता के अधिकार'))}">${btns}</div>${s.got ? `<div class="bz-panel"><h4>${t(RIGHTS[c.a].n)}</h4><p style="margin:0">${t(RIGHTS[c.a].m)}</p></div><div class="bz-row"><button type="button" class="bz-btn" data-act="next" data-key="next">${t(T2('Next case', 'अगला मामला'))}</button></div>` : ''}`;
          },
          act: {
            choice(el) {
              if (s.got) return;
              const r = el.dataset.id, c = cur(); ev('decided');
              if (r === c.a) { s.got = r; ev('answered:right'); api.celebrate(); say('good', { en: 'Yes! ' + RIGHTS[r].m.en, hi: 'हाँ! ' + RIGHTS[r].m.hi }); }
              else { s.wrong.push(r); ev('answered:wrong'); say('bad', { en: `${RIGHTS[r].n.en} means: ${RIGHTS[r].m.en} Read the case again.`, hi: `${RIGHTS[r].n.hi} का मतलब: ${RIGHTS[r].m.hi} मामला फिर से पढ़ो।` }); }
              draw();
            },
            next() { s.i = (s.i + 1) % C_CASES.length; s.got = null; s.wrong = []; say('info', T2('Read the case and tap the right that applies.', 'मामला पढ़ो और लागू होने वाला अधिकार दबाओ।')); draw(); },
          },
        };
      }
      const s = { ci: P.claim != null ? CLAIMS.indexOf(P.claim) : 3, got: null, wrong: [] };
      const claimF = (i) => RL(CLAIMS[i]);
      return {
        init() { say('info', T2('Set the value paid for the goods or service, then choose where the complaint goes.', 'माल या सेवा के लिए चुकाया मूल्य तय करो, फिर चुनो कि शिकायत कहाँ जाएगी।')); },
        cur: () => s.ci,
        a() {
          const f = forumOf(CLAIMS[s.ci]);
          return `<div class="bz-panel"><h4>${t(T2('Where to complain', 'शिकायत कहाँ करें'))}</h4><div class="bz-ladder">${FORUM_IDS.slice().reverse().map((id) => `<div class="bz-rung${f === id ? ' on' : ''}" style="--c:${FORUMS[id].col};--fg:#fff"><b>${t(FORUMS[id].n)}</b><span>${t(FORUMS[id].r)}</span></div>`).join('')}</div><p style="margin:8px 0 0;font-size:.9rem;color:var(--ink-2)">${t(T2('The value is what the buyer paid for the goods or service. Appeals go upward. A complaint must be made within 2 years.', 'मूल्य वह है जो ख़रीदार ने माल या सेवा के लिए चुकाया। अपील ऊपर के आयोग में होती है। शिकायत 2 साल के भीतर करनी होती है।'))}</p></div>`;
        },
        ctl: () => `<div class="bz-panel">${slider('claim', T2('Value paid', 'चुकाया मूल्य'), 0, CLAIMS.length - 1, 1, s.ci, (i) => raw(claimF(i)))}</div>`,
        b() {
          return `<div class="bz-grid" role="group" aria-label="${t(T2('Commissions', 'आयोग'))}">${FORUM_IDS.map((id) => `<button type="button" class="bz-ch${s.got === id ? ' right' : ''}${s.wrong.includes(id) ? ' wrong' : ''}" style="--c:${FORUMS[id].col}" data-act="choice" data-id="${id}" data-key="choice:${id}"><b>${t(FORUMS[id].n)}</b></button>`).join('')}</div>`;
        },
        slide(name, v) { s.ci = v; s.got = null; s.wrong = []; sayR('info', `Value paid: ${raw(claimF(v))}. Which commission hears it?`, `चुकाया मूल्य: ${raw(claimF(v))}। कौन-सा आयोग सुनेगा?`); },
        redraw: 'ab',
        act: {
          choice(el) {
            const id = el.dataset.id, right = forumOf(CLAIMS[s.ci]); ev('decided');
            if (id === right) { s.got = id; ev('answered:right'); api.celebrate(); say('good', { en: `Yes! ${raw(claimF(s.ci))} is ${FORUMS[id].r.en}, so the ${FORUMS[id].n.en} hears it.`, hi: `हाँ! ${raw(claimF(s.ci))} ${FORUMS[id].r.hi} में आता है, इसलिए ${FORUMS[id].n.hi} सुनेगा।` }); }
            else { s.wrong.push(id); ev('answered:wrong'); say('bad', { en: `${FORUMS[id].n.en} hears claims ${FORUMS[id].r.en}. Compare it with ${raw(claimF(s.ci))}.`, hi: `${FORUMS[id].n.hi} ${FORUMS[id].r.hi} के दावे सुनता है। इसकी तुलना ${raw(claimF(s.ci))} से करो।` }); }
            draw();
          },
        },
      };
    };

    // ---- trade channels
    M['trade-channels'] = () => {
      const start = P.product ? PROD_IDS.indexOf(P.product) : 0;
      const s = { i: 0, got: null, wrong: [], shown: 'direct' };
      const cur = () => PRODUCTS[PROD_IDS[(s.i + start) % PROD_IDS.length]];
      const chainSvg = (ch) => {
        const nodes = [T2('Maker', 'उत्पादक')].concat(CHANNELS[ch].chain.map((m) => MID[m]), [T2('You', 'तुम')]);
        const n = nodes.length, W = 360, step = (W - 60) / (n - 1);
        const prices = [cur().base]; CHANNELS[ch].chain.forEach((m) => prices.push(prices[prices.length - 1] * (1 + MARGIN[m])));
        prices.push(prices[prices.length - 1]);
        const cols = ['#FF7A1A', ...CHANNELS[ch].chain.map((m) => (m === 'agent' ? '#8B3DFF' : m === 'wholesaler' ? '#0F766E' : '#1D4ED8')), '#E11D48'];
        const pathD = `M30 40 L${30 + step * (n - 1)} 40`;
        return `<svg class="bz-chart" viewBox="0 0 ${W} 112" role="img" aria-label="${esc(nodes.map((q, k) => raw(q) + ' ' + R(Math.round(prices[k] * 100) / 100)).join(' → '))}"><line x1="30" x2="${30 + step * (n - 1)}" y1="40" y2="40" stroke="#94A3B8" stroke-width="4" stroke-dasharray="2 8" stroke-linecap="round"/>${nodes.map((q, k) => `<circle cx="${30 + step * k}" cy="40" r="19" fill="${cols[k]}"/><text x="${30 + step * k}" y="45" font-size="14" text-anchor="middle" style="fill:#fff;font-weight:700">${k + 1}</text><text x="${30 + step * k}" y="78" font-size="11" text-anchor="middle" font-weight="700">${esc(raw(q))}</text><text x="${30 + step * k}" y="95" font-size="11.5" text-anchor="middle">${R(Math.round(prices[k] * 100) / 100)}</text>`).join('')}${reduced ? '' : `<circle r="7" fill="#FFD23F" stroke="#061233" stroke-width="2.5"><animateMotion dur="${1.2 * n}s" repeatCount="indefinite" path="${pathD}"/></circle>`}</svg>`;
      };
      return {
        init() { say('info', T2('Read what is true about the goods, then choose the best way to send them.', 'माल के बारे में सही बातें पढ़ो, फिर भेजने का सबसे अच्छा तरीक़ा चुनो।')); },
        a() {
          const p = cur();
          return `<div class="bz-panel"><div class="bz-case"><span class="no">${s.i + 1}/${PROD_IDS.length}</span><p><b>${t(p.n)}</b></p></div><div style="margin-top:6px">${p.tr.map((x) => `<span class="bz-trait">${t(x)}</span>`).join('')}</div></div>${s.got ? `<div class="bz-panel">${chainSvg(s.got)}<p style="margin:6px 0 0;font-size:.88rem;color:var(--ink-2)">${t(T2('Example margins: agent 5%, wholesaler 10%, retailer 20% of what they pay.', 'उदाहरण मार्जिन: एजेंट 5%, थोक 10%, खुदरा 20% (जो वे चुकाते हैं उस पर)।'))}</p></div>` : ''}`;
        },
        b() {
          const p = cur();
          const btns = CH_IDS.map((id) => {
            const total = priceAlong(p.base, CHANNELS[id].chain);
            return `<button type="button" class="bz-ch${s.got === id ? ' right' : ''}${s.wrong.includes(id) ? ' wrong' : ''}" style="--c:#0F766E" data-act="choice" data-id="${id}" data-key="choice:${id}"${s.got ? ' disabled' : ''}><b>${t(CHANNELS[id].n)}</b><small>${t(T2('Buyer pays', 'ख़रीदार चुकाता है'))} ${R(Math.round(total * 100) / 100)}</small></button>`;
          }).join('');
          return `<div class="bz-grid" role="group" aria-label="${t(T2('Channels', 'माध्यम'))}">${btns}</div>${s.got ? `<div class="bz-row"><button type="button" class="bz-btn" data-act="next" data-key="next">${t(T2('Next goods', 'अगला माल'))}</button></div>` : ''}`;
        },
        act: {
          choice(el) {
            if (s.got) return;
            const id = el.dataset.id, p = cur(); ev('decided');
            if (id === p.a) { s.got = id; ev('answered:right'); api.celebrate(); say('good', { en: 'Yes! ' + p.why.en, hi: 'हाँ! ' + p.why.hi }); }
            else {
              s.wrong.push(id); ev('answered:wrong');
              const mid = CHANNELS[id].chain.length;
              say('bad', mid < CHANNELS[p.a].chain.length ? T2('Too few middlemen for these goods. Think about how far and to how many buyers they must go.', 'इस माल के लिए बिचौलिए बहुत कम हैं। सोचो कि इसे कितनी दूर और कितने ख़रीदारों तक पहुँचना है।') : T2('Too many middlemen for these goods. Each one adds a margin and takes time. Is that needed?', 'इस माल के लिए बिचौलिए बहुत ज़्यादा हैं। हर एक मार्जिन जोड़ता है और समय लेता है। क्या यह ज़रूरी है?'));
            }
            draw();
          },
          next() { s.i = (s.i + 1) % PROD_IDS.length; s.got = null; s.wrong = []; say('info', T2('Read what is true about the goods, then choose the best way to send them.', 'माल के बारे में सही बातें पढ़ो, फिर भेजने का सबसे अच्छा तरीक़ा चुनो।')); draw(); },
        },
      };
    };

    // ============================================================ wiring
    const m = M[mode]();
    function niceCeil(x) { const p = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1)))); const f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 8 ? 8 : 10) * p; }
    function shortN(n) { return n >= 1e5 ? num(n / 1e5) + 'L' : n >= 1e3 ? num(n / 1e3) + 'k' : String(Math.round(n * 10) / 10); }
    function focusKey() { const a = document.activeElement; return a && root.contains(a) ? a.dataset.key || a.id || null : null; }
    function restore(k) { if (!k) return; const n = [...root.querySelectorAll('[data-key],#bz-ans')].find((el) => (el.dataset.key || el.id) === k && !el.disabled); if (n) n.focus({ preventScroll: true }); }
    function draw(which) {
      const fk = focusKey();
      if (!which || which.includes('a')) elA.innerHTML = m.a();
      if (!which || which.includes('b')) elB.innerHTML = m.b ? m.b() : '';
      restore(fk);
    }
    m.init(); draw();
    if (m.ctl) elC.innerHTML = m.ctl();
    if (S.msg == null) say('info', startMsg());

    const onClick = (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || !root.contains(el) || el.disabled || el.dataset.act === 'slide') return;
      const key = el.dataset.key;
      if (key && !api.allowed(key)) { api.nudge(key); return; }
      if (el.dataset.act === 'slot' && !api.allowed('slot:' + el.dataset.slot)) { api.nudge('slot:' + el.dataset.slot); return; }
      const f = m.act[el.dataset.act]; if (f) f(el, e);
    };
    const onInput = (e) => {
      const el = e.target;
      if (el.id === 'bz-ans') { S.ans = el.value; return; }
      if (el.dataset.act !== 'slide') return;
      const key = el.dataset.key, name = el.dataset.s;
      if (!api.allowed(key)) { el.value = m.cur(name); api.nudge(key); return; }
      const v = parseFloat(el.value);
      m.slide(name, v);
      const o = el.parentNode.querySelector('output');
      if (o) o.textContent = sliderText(name, v);
      draw(m.redraw || 'b');
    };
    // The text next to a slider is rebuilt from the same formatter the slider was made with.
    function sliderText(name, v) {
      const d = { price: R, variable: R, fixed: R, units: fmtInt, budget: R };
      if (mode === 'working-capital') return v + ' ' + raw(T2('days', 'दिन'));
      if (mode === 'consumer') return raw(RL(CLAIMS[v]));
      return (d[name] || String)(v);
    }
    const onChange = (e) => { const el = e.target; if (el.dataset && el.dataset.act === 'slide') { ev('moved:' + el.dataset.s); api.record(`Moved ${el.dataset.s} to ${el.value}`); } };
    const onKey = (e) => { if (e.key === 'Enter' && e.target.id === 'bz-ans') { e.preventDefault(); if (api.allowed('answer')) m.act.check(); else api.nudge('answer'); } };
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('keydown', onKey);
    root.addEventListener('pointerdown', onDown);
    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    return {
      destroy() {
        root.removeEventListener('click', onClick); root.removeEventListener('input', onInput); root.removeEventListener('change', onChange);
        root.removeEventListener('keydown', onKey); root.removeEventListener('pointerdown', onDown);
        document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); document.removeEventListener('pointercancel', onCancel);
        if (drag.ghost) drag.ghost.remove();
        stops.forEach((f) => f && f());
        root.innerHTML = '';
      },
    };
  }
})();
