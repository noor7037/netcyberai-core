// Template: Accounts book. Journal, ledger, cash book, trial balance, bank reconciliation, depreciation, final
// accounts, partnership appropriation, issue of shares, accounting ratios and the cash flow statement, on real
// double-entry rules. Every amount is held in paise (whole numbers), so totals are exact; each transaction has one
// debit and one credit of the same amount, so the accounting equation and the trial balance hold by construction,
// and the template checks it. Debit and credit rules are explained both ways: modern (assets, liabilities, capital,
// expenses, incomes) and traditional (personal, real, nominal). Indian formats: ₹, lakh grouping, April–March year.
// Config:
//   { mode: 'equation'|'journal'|'ledger'|'cash-book'|'trial-balance'|'brs'|'depreciation'|'final-accounts'|
//           'partnership'|'shares'|'ratios'|'cash-flow',
//     business?: name (string or {en,hi}),
//     transactions: [{ id, date: 'YYYY-MM-DD', text: {en,hi}, amount: rupees, debit?: account id, credit?: account id,
//                      kind?: brs item kind }],
//     method?: 'slm'|'wdv' (depreciation),
//     accounts?: [{ id, name: {en,hi}, kind: 'debtor'|'creditor' }]   personal accounts of named people (≤ 8),
//     rules?: 'modern'|'traditional'      journal: which rules explain the entry first (the child can switch),
//     closingStock?: rupees               final-accounts (unsold goods at cost, at most the net purchases),
//     balance?: rupees, from?: 'cash-book'|'pass-book'   brs: the starting bank balance (negative = overdraft),
//     rate?: % a year, life?: years, scrap?: rupees, years?: 1–10    depreciation (life and scrap: SLM only),
//     partners?: [{ name, capital, ratio?, salary? }], profit?: rupees (negative = loss), interest?: % on capital,
//     fixed?: true (fixed capitals: appropriations go to current accounts)                   partnership,
//     issue?: { shares, face, premium?, calls: [rupees a share: application, allotment, calls…], applied? }   shares,
//     figures?: { revenue, cogs, … }, ratios?: [ratio ids]     ratios,
//     opening?: rupees                    cash-flow: cash and bank at the start }
// Which modes need what: debit and credit on every transaction in equation, journal, ledger, cash-book (each touches
// cash or bank), trial-balance, final-accounts, cash-flow and depreciation (each debits one fixed asset: the cost and
// its installation); a kind on each brs item; no transactions in partnership, shares and ratios.
// Targets: txn:<id>, account:<id>, debit, credit, post, balance, answer; also rules (journal), method
// (depreciation), ratio:<id> (ratios). In brs, debit is "Add" and credit is "Less".
// Events: journalised:<id>, posted:<id> (txn, account, year-<n>, stage or ratio id), balanced, tallied,
// answered:right, answered:wrong; also selected:<id>, chose:<account>, side:debit, side:credit, rules:<which>,
// compared. "post" with nothing chosen shows the next correct entry (a worked example).
(function () {
  const L = window.NCA_LIB;
  const { esc } = L;
  const T2 = (en, hi) => ({ en, hi });
  const MODES = ['equation', 'journal', 'ledger', 'cash-book', 'trial-balance', 'brs', 'depreciation', 'final-accounts', 'partnership', 'shares', 'ratios', 'cash-flow'];
  const MODE_NAME = {
    equation: T2('Accounting equation', 'लेखांकन समीकरण'),
    journal: T2('Journal', 'रोज़नामचा (जर्नल)'),
    ledger: T2('Ledger', 'खाता बही (लेजर)'),
    'cash-book': T2('Cash book', 'रोकड़ बही'),
    'trial-balance': T2('Trial balance', 'तलपट'),
    brs: T2('Bank reconciliation statement', 'बैंक समाधान विवरण'),
    depreciation: T2('Depreciation', 'मूल्यह्रास'),
    'final-accounts': T2('Final accounts', 'अंतिम खाते'),
    partnership: T2('Partnership: sharing the profit', 'साझेदारी: लाभ का बँटवारा'),
    shares: T2('Issue of shares', 'अंशों का निर्गमन'),
    ratios: T2('Accounting ratios', 'लेखांकन अनुपात'),
    'cash-flow': T2('Cash flow statement', 'रोकड़ प्रवाह विवरण'),
  };
  const MODE_HINT = {
    equation: T2('Tap a transaction, then Post it. Watch both sides of the scale change.', 'कोई लेन-देन चुनो, फिर दर्ज करो। देखो तराज़ू के दोनों पलड़े कैसे बदलते हैं।'),
    journal: T2('Tap a transaction, tap an account, then Debit or Credit. Fill both, then Record.', 'लेन-देन चुनो, खाता चुनो, फिर नाम या जमा दबाओ। दोनों भरकर दर्ज करो।'),
    ledger: T2('Tap a journal entry, then tap the two accounts it touches (or Post).', 'कोई प्रविष्टि चुनो, फिर उसके दोनों खातों पर टैप करो (या खतौनी करो)।'),
    'cash-book': T2('Tap a transaction: money in goes on the Receipts side, money out on Payments.', 'लेन-देन चुनो: आया पैसा प्राप्ति पक्ष में, गया पैसा भुगतान पक्ष में।'),
    'trial-balance': T2('Tap an account, then put its balance in the Debit or Credit column.', 'कोई खाता चुनो, फिर उसका शेष नाम या जमा कॉलम में रखो।'),
    brs: T2('Tap each item and decide: Add it or Less it, to reach the pass book balance.', 'हर मद चुनो और तय करो: जोड़ें या घटाएँ, ताकि पास बुक का शेष मिले।'),
    depreciation: T2('Charge depreciation year by year and watch the book value fall.', 'साल-दर-साल मूल्यह्रास लगाओ और पुस्तक मूल्य घटते देखो।'),
    'final-accounts': T2('Tap a balance and say where it goes: trading, profit and loss, or balance sheet.', 'कोई शेष चुनो और बताओ वह कहाँ जाएगा: व्यापार, लाभ-हानि या तुलन पत्र।'),
    partnership: T2('Share out the profit step by step, as the partnership deed says.', 'साझेदारी विलेख के अनुसार लाभ को एक-एक क़दम बाँटो।'),
    shares: T2('Collect the money stage by stage and see the journal and the balance sheet.', 'एक-एक चरण में राशि लो और रोज़नामचा तथा तुलन पत्र देखो।'),
    ratios: T2('Pick a ratio, work it out, and see what it says about the business.', 'कोई अनुपात चुनो, उसे निकालो और देखो वह व्यापार के बारे में क्या बताता है।'),
    'cash-flow': T2('Tap a transaction and choose its activity: operating, investing or financing.', 'लेन-देन चुनो और उसकी गतिविधि बताओ: प्रचालन, निवेश या वित्तीयन।'),
  };

  // ---------------------------------------------------------------- the chart of accounts
  // type: modern class; cls: traditional class; st: where the balance goes in final accounts; cf: cash-flow activity
  // (null: not allowed in a cash flow lab); fa: a fixed asset that is depreciated; less: a return that is shown as a
  // deduction from that account.
  const A = {};
  const ac = (id, en, hi, type, cls, st, cf, x) => { A[id] = Object.assign({ id, n: T2(en, hi), type, cls, st, cf }, x || {}); };
  ac('cash', 'Cash', 'रोकड़', 'asset', 'real', 'bs', 'cash');
  ac('bank', 'Bank', 'बैंक', 'asset', 'personal', 'bs', 'cash');
  ac('capital', 'Capital', 'पूँजी', 'capital', 'personal', 'bs', 'financing');
  ac('drawings', 'Drawings', 'आहरण', 'drawings', 'personal', 'bs', 'financing');
  ac('land', 'Land', 'भूमि', 'asset', 'real', 'bs', 'investing');
  ac('building', 'Building', 'भवन', 'asset', 'real', 'bs', 'investing', { fa: 1 });
  ac('machinery', 'Machinery', 'मशीनरी', 'asset', 'real', 'bs', 'investing', { fa: 1 });
  ac('furniture', 'Furniture', 'फ़र्नीचर', 'asset', 'real', 'bs', 'investing', { fa: 1 });
  ac('vehicle', 'Motor vehicle', 'मोटर वाहन', 'asset', 'real', 'bs', 'investing', { fa: 1 });
  ac('computer', 'Computers', 'कंप्यूटर', 'asset', 'real', 'bs', 'investing', { fa: 1 });
  ac('stock', 'Stock (goods)', 'माल (स्टॉक)', 'asset', 'real', 'bs', 'operating', { eqOnly: 1 });
  ac('investments', 'Investments', 'निवेश', 'asset', 'real', 'bs', 'investing');
  ac('debtors', 'Debtors', 'देनदार', 'asset', 'personal', 'bs', 'operating');
  ac('creditors', 'Creditors', 'लेनदार', 'liability', 'personal', 'bs', 'operating');
  ac('loan', 'Bank loan', 'बैंक ऋण', 'liability', 'personal', 'bs', 'financing');
  ac('share-capital', 'Share capital', 'अंश पूँजी', 'capital', 'personal', 'bs', 'financing');
  ac('purchases', 'Purchases', 'क्रय', 'expense', 'goods', 'trading', 'operating');
  ac('sales', 'Sales', 'विक्रय', 'revenue', 'goods', 'trading', 'operating');
  ac('purchase-returns', 'Purchases returns', 'क्रय वापसी', 'revenue', 'goods', 'trading', 'operating', { less: 'purchases' });
  ac('sales-returns', 'Sales returns', 'विक्रय वापसी', 'expense', 'goods', 'trading', 'operating', { less: 'sales' });
  ac('wages', 'Wages', 'मज़दूरी', 'expense', 'nominal', 'trading', 'operating');
  ac('carriage-in', 'Carriage inwards', 'आवक ढुलाई', 'expense', 'nominal', 'trading', 'operating');
  ac('carriage-out', 'Carriage outwards', 'जावक ढुलाई', 'expense', 'nominal', 'pl', 'operating');
  ac('salaries', 'Salaries', 'वेतन', 'expense', 'nominal', 'pl', 'operating');
  ac('rent', 'Rent', 'किराया', 'expense', 'nominal', 'pl', 'operating');
  ac('electricity', 'Electricity', 'बिजली', 'expense', 'nominal', 'pl', 'operating');
  ac('advertisement', 'Advertisement', 'विज्ञापन', 'expense', 'nominal', 'pl', 'operating');
  ac('insurance', 'Insurance', 'बीमा', 'expense', 'nominal', 'pl', 'operating');
  ac('stationery', 'Stationery', 'लेखन-सामग्री', 'expense', 'nominal', 'pl', 'operating');
  ac('repairs', 'Repairs', 'मरम्मत', 'expense', 'nominal', 'pl', 'operating');
  ac('telephone', 'Telephone', 'टेलीफ़ोन', 'expense', 'nominal', 'pl', 'operating');
  ac('interest-paid', 'Interest paid', 'दिया गया ब्याज', 'expense', 'nominal', 'pl', 'financing');
  ac('discount-allowed', 'Discount allowed', 'दी गई छूट', 'expense', 'nominal', 'pl', 'operating');
  ac('bad-debts', 'Bad debts', 'अशोध्य ऋण', 'expense', 'nominal', 'pl', 'operating');
  ac('depreciation', 'Depreciation', 'मूल्यह्रास', 'expense', 'nominal', 'pl', 'operating');
  ac('commission', 'Commission received', 'प्राप्त कमीशन', 'revenue', 'nominal', 'pl', 'operating');
  ac('interest-received', 'Interest received', 'प्राप्त ब्याज', 'revenue', 'nominal', 'pl', 'investing');
  ac('dividend-received', 'Dividend received', 'प्राप्त लाभांश', 'revenue', 'nominal', 'pl', 'investing');
  ac('rent-received', 'Rent received', 'प्राप्त किराया', 'revenue', 'nominal', 'pl', null);
  ac('discount-received', 'Discount received', 'प्राप्त छूट', 'revenue', 'nominal', 'pl', 'operating');
  const DISTRACT = ['cash', 'bank', 'capital', 'purchases', 'sales', 'creditors', 'debtors', 'furniture', 'rent', 'drawings'];
  const TYPE_N = {
    asset: T2('an asset', 'एक परिसंपत्ति'), liability: T2('a liability', 'एक देयता'), capital: T2("the owner's capital", 'स्वामी की पूँजी'),
    drawings: T2('drawings (it lowers capital)', 'आहरण (यह पूँजी घटाता है)'), expense: T2('an expense', 'एक व्यय'), revenue: T2('an income', 'एक आय'),
  };
  const TYPE_COL = { asset: '#02CFF9', liability: '#FF6B57', capital: '#8B3DFF', drawings: '#F5B90A', expense: '#FF7A1A', revenue: '#22C55E' };

  function accountsOf(c) {
    const accs = Object.assign({}, A);
    ((c && Array.isArray(c.accounts)) ? c.accounts : []).forEach((a) => {
      if (!a || typeof a.id !== 'string' || A[a.id]) return;
      const nm = typeof a.name === 'string' ? T2(a.name, a.name) : a.name || T2(a.id, a.id);
      accs[a.id] = a.kind === 'creditor'
        ? { id: a.id, n: nm, type: 'liability', cls: 'personal', st: 'bs', cf: 'operating', custom: 1 }
        : { id: a.id, n: nm, type: 'asset', cls: 'personal', st: 'bs', cf: 'operating', custom: 1 };
    });
    return accs;
  }

  // ---------------------------------------------------------------- money and dates
  const P = (r) => Math.round(r * 100);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  function grp(n) { const s = String(n); return s.length <= 3 ? s : s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + s.slice(-3); }
  function amt(p) { const neg = p < 0; p = Math.abs(Math.round(p)); const r = Math.floor(p / 100), ps = p % 100; return (neg ? '−' : '') + grp(r) + (ps ? '.' + String(ps).padStart(2, '0') : ''); }
  const inr = (p) => (p < 0 ? '−₹' + amt(-p) : '₹' + amt(p));
  const MON = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    hi: ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'],
  };
  function parseD(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof s === 'string' ? s : '');
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (y < 1950 || y > 2100 || mo < 1 || mo > 12 || d < 1) return null;
    const dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
    return d > dim ? null : { y, mo, d };
  }
  const dayNo = (s) => { const d = parseD(s); return d ? Date.UTC(d.y, d.mo - 1, d.d) / 864e5 : 0; };
  function fmtD(s, lang, noYear) { const d = parseD(s); if (!d) return String(s || ''); return `${d.d} ${MON[lang === 'hi' ? 'hi' : 'en'][d.mo - 1]}${noYear ? '' : ' ' + d.y}`; }
  function monthEnd(s) { const d = parseD(s); if (!d) return s; const dim = [31, (d.y % 4 === 0 && d.y % 100 !== 0) || d.y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][d.mo - 1]; return `${d.y}-${String(d.mo).padStart(2, '0')}-${dim}`; }
  function nextDay(s) { const t = new Date((dayNo(s) + 1) * 864e5); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`; }
  const isBi = (x) => (typeof x === 'string' ? x.trim().length > 0 : !!(x && typeof x === 'object' && typeof x.en === 'string' && x.en.trim() && typeof x.hi === 'string' && x.hi.trim()));
  const isMoney = (v, zero, neg) => typeof v === 'number' && isFinite(v) && Math.abs(v) <= 1e10 && Math.abs(Math.round(v * 100) - v * 100) < 1e-6 && (neg || v >= 0) && (zero || v !== 0);
  const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;

  // Transactions in date order, amounts in paise.
  function txOf(c) {
    return ((c && Array.isArray(c.transactions)) ? c.transactions : []).map((x, i) => Object.assign({}, x, { p: P(x.amount), i }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.i - b.i));
  }
  // Closing balances (debit positive) and the debit and credit totals of every account.
  function balancesOf(tx) {
    const b = {}, dr = {}, cr = {}, order = [];
    const see = (id) => { if (!(id in b)) { b[id] = 0; dr[id] = 0; cr[id] = 0; order.push(id); } };
    tx.forEach((x) => { see(x.debit); see(x.credit); b[x.debit] += x.p; dr[x.debit] += x.p; b[x.credit] -= x.p; cr[x.credit] += x.p; });
    return { b, dr, cr, order };
  }
  const usedAccounts = (tx) => balancesOf(tx).order;
  function journalChips(c) {
    const tx = txOf(c);
    const used = usedAccounts(tx).filter((id) => id != null);
    const extra = DISTRACT.filter((id) => !used.includes(id)).slice(0, used.length > 6 ? 1 : 3);
    return used.concat(extra);
  }
  const upOf = (type, side) => { const drUp = ['asset', 'expense', 'drawings'].includes(type); return side === 'dr' ? drUp : !drUp; };
  // Effect of one leg on the accounting equation: [group, change in paise].
  function effect(a, side, p) {
    const g = a.type === 'asset' ? 'A' : a.type === 'liability' ? 'L' : 'C';
    const s = side === 'dr' ? 1 : -1;
    if (g === 'A') return [g, s * p];
    return [g, -s * p];
  }

  // ---------------------------------------------------------------- debit and credit rules
  function ruleModern(a, side) {
    const N = a.n, dr = side === 'dr';
    const verbEn = dr ? 'debited' : 'credited', verbHi = dr ? 'नाम (डेबिट)' : 'जमा (क्रेडिट)';
    if (a.less) {
      const B = A[a.less].n;
      return T2(`${N.en} lower ${B.en.toLowerCase()}, so they are ${verbEn}.`, `${N.hi} से ${B.hi} घटता है, इसलिए इसे ${verbHi} करते हैं।`);
    }
    const up = upOf(a.type, side), T = TYPE_N[a.type];
    return T2(`${N.en} is ${T.en}. It ${up ? 'goes up' : 'goes down'}, so it is ${verbEn}.`, `${N.hi} ${T.hi} है। यह ${up ? 'बढ़ता है' : 'घटता है'}, इसलिए इसे ${verbHi} करते हैं।`);
  }
  function ruleTrad(a, side) {
    const N = a.n, dr = side === 'dr';
    if (a.cls === 'personal') return dr
      ? T2(`${N.en} is a personal account and receives: debit the receiver.`, `${N.hi} व्यक्तिगत खाता है और पाने वाला है: पाने वाले को नाम करो।`)
      : T2(`${N.en} is a personal account and gives: credit the giver.`, `${N.hi} व्यक्तिगत खाता है और देने वाला है: देने वाले को जमा करो।`);
    if (a.cls === 'real') return dr
      ? T2(`${N.en} is a real account and comes in: debit what comes in.`, `${N.hi} वास्तविक खाता है और आ रहा है: जो आए उसे नाम करो।`)
      : T2(`${N.en} is a real account and goes out: credit what goes out.`, `${N.hi} वास्तविक खाता है और जा रहा है: जो जाए उसे जमा करो।`);
    if (a.cls === 'nominal') return dr
      ? T2(`${N.en} is a nominal account, an expense or loss: debit all expenses and losses.`, `${N.hi} नाममात्र खाता है, एक व्यय या हानि: सभी व्यय और हानियाँ नाम करो।`)
      : T2(`${N.en} is a nominal account, an income or gain: credit all incomes and gains.`, `${N.hi} नाममात्र खाता है, एक आय या लाभ: सभी आय और लाभ जमा करो।`);
    return dr
      ? T2(`Goods come in (${N.en}): debit the goods account.`, `माल अंदर आता है (${N.hi}): माल वाले खाते को नाम करो।`)
      : T2(`Goods go out (${N.en}): credit the goods account.`, `माल बाहर जाता है (${N.hi}): माल वाले खाते को जमा करो।`);
  }

  // ---------------------------------------------------------------- bank reconciliation items
  // book: where the item is already recorded ('cb' cash book only, 'pb' pass book only); eff: what it did to the bank
  // balance in that book. Pass book balance = cash book balance + (pb ? eff : −eff) × amount.
  const BRS = {
    'cheque-issued': { book: 'cb', eff: -1, n: T2('Cheque issued, not yet presented', 'जारी चेक, अभी भुगतान हेतु प्रस्तुत नहीं') },
    'cheque-deposited': { book: 'cb', eff: 1, n: T2('Cheque deposited, not yet credited', 'जमा किया चेक, अभी खाते में नहीं आया') },
    'bank-charges': { book: 'pb', eff: -1, n: T2('Bank charges', 'बैंक प्रभार') },
    'interest-credited': { book: 'pb', eff: 1, n: T2('Interest credited by the bank', 'बैंक द्वारा जमा किया ब्याज') },
    'direct-deposit': { book: 'pb', eff: 1, n: T2('Paid straight into the bank by a customer', 'ग्राहक ने सीधे बैंक में जमा किया') },
    'direct-payment': { book: 'pb', eff: -1, n: T2('Paid by the bank on standing instructions', 'स्थायी निर्देश पर बैंक ने भुगतान किया') },
    'cheque-dishonoured': { book: 'pb', eff: -1, n: T2('Deposited cheque dishonoured', 'जमा किया चेक अस्वीकृत (अनादृत)') },
    'interest-charged': { book: 'pb', eff: -1, n: T2('Interest charged on overdraft', 'अधिविकर्ष पर लगाया ब्याज') },
  };
  const brsSign = (kind, from) => { const k = BRS[kind]; const s = k.book === 'pb' ? k.eff : -k.eff; return from === 'pass-book' ? -s : s; };

  // ---------------------------------------------------------------- depreciation (Indian accounting year: April to March)
  function depSchedule(c, methodOverride) {
    const tx = txOf(c);
    if (!tx.length) return null;
    const method = methodOverride || c.method || 'slm';
    const cost = sum(tx.map((x) => x.p));
    const d = parseD(tx[0].date);
    const fy0 = d.mo >= 4 ? d.y : d.y - 1;
    let months = (fy0 + 1) * 12 + 3 - (d.y * 12 + d.mo) + 1;
    if (d.d > 15) months -= 1;
    const scrap = method === 'slm' && c.scrap ? P(c.scrap) : 0;
    const nY = c.years || 3;
    const rows = [];
    let open = cost;
    for (let k = 0; k < nY; k++) {
      const m = k === 0 ? months : 12;
      let dep;
      if (method === 'wdv') dep = Math.round((open * c.rate * m) / 1200);
      else if (c.life) dep = Math.round(((cost - scrap) * m) / (12 * c.life));
      else dep = Math.round((cost * c.rate * m) / 1200);
      rows.push({ n: k + 1, fy: `${fy0 + k}-${String((fy0 + k + 1) % 100).padStart(2, '0')}`, end: `${fy0 + k + 1}-03-31`, months: m, open, dep, close: open - dep });
      open -= dep;
    }
    return { asset: tx[0].debit, cost, date: tx[0].date, method, rows, scrap };
  }

  // ---------------------------------------------------------------- partnership appropriation (Indian Partnership Act 1932, s.13)
  function splitP(total, w) {
    const neg = total < 0; total = Math.abs(total);
    const W = sum(w);
    const raw = w.map((x) => (total * x) / W);
    const fl = raw.map(Math.floor);
    let rem = total - sum(fl);
    raw.map((r, i) => [r - fl[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (rem > 0) { fl[i]++; rem--; } });
    return neg ? fl.map((x) => -x) : fl;
  }
  function partnerPlan(c) {
    const ps = c.partners || [];
    const ratio = ps.map((p) => (p.ratio == null ? 1 : p.ratio));
    const profit = P(c.profit || 0);
    const ioc = ps.map((p) => Math.round((P(p.capital) * (c.interest || 0)) / 100));
    const sal = ps.map((p) => P(p.salary || 0));
    const steps = [];
    let left = profit, scaled = false;
    if (profit > 0) {
      const want = sum(ioc) + sum(sal);
      let gi = ioc, gs = sal;
      if (want > profit) {
        scaled = true;
        const all = splitP(profit, ioc.concat(sal));
        gi = all.slice(0, ps.length); gs = all.slice(ps.length);
      }
      if (sum(ioc) > 0) steps.push({ id: 'interest', n: T2('Interest on capital', 'पूँजी पर ब्याज'), a: gi });
      if (sum(sal) > 0) steps.push({ id: 'salary', n: T2('Partner’s salary', 'साझेदार का वेतन'), a: gs });
      left = profit - sum(gi) - sum(gs);
    }
    steps.push({ id: 'share', n: profit < 0 ? T2('Share of loss', 'हानि में हिस्सा') : T2('Share of profit', 'लाभ में हिस्सा'), a: left === 0 ? ps.map(() => 0) : splitP(left, ratio) });
    return { profit, steps, ratio, scaled, left };
  }

  // ---------------------------------------------------------------- shares (Companies Act 2013)
  function stagesOf(n) {
    const S = [{ id: 'application', n: T2('Application', 'आवेदन'), acc: T2('Share Application', 'अंश आवेदन') }, { id: 'allotment', n: T2('Allotment', 'आबंटन'), acc: T2('Share Allotment', 'अंश आबंटन') }];
    if (n === 3) S.push({ id: 'call', n: T2('First and final call', 'प्रथम एवं अंतिम याचना'), acc: T2('Share First and Final Call', 'अंश प्रथम एवं अंतिम याचना') });
    if (n === 4) S.push({ id: 'first-call', n: T2('First call', 'प्रथम याचना'), acc: T2('Share First Call', 'अंश प्रथम याचना') }, { id: 'final-call', n: T2('Second and final call', 'द्वितीय एवं अंतिम याचना'), acc: T2('Share Second and Final Call', 'अंश द्वितीय एवं अंतिम याचना') });
    return S;
  }

  // ---------------------------------------------------------------- ratios (Class 12, Analysis of financial statements)
  const FIG = {
    revenue: T2('Revenue from operations', 'प्रचालन से आगम'),
    creditRevenue: T2('Credit revenue from operations', 'उधार प्रचालन आगम'),
    cogs: T2('Cost of revenue from operations', 'प्रचालन आगम की लागत'),
    operatingExpenses: T2('Operating expenses', 'प्रचालन व्यय'),
    netProfit: T2('Net profit after tax', 'कर के बाद शुद्ध लाभ'),
    currentAssets: T2('Current assets', 'चालू परिसंपत्तियाँ'),
    inventory: T2('Inventory (closing)', 'मालसूची (अंतिम)'),
    openingInventory: T2('Inventory (opening)', 'मालसूची (प्रारंभिक)'),
    prepaid: T2('Prepaid expenses', 'पूर्वदत्त व्यय'),
    currentLiabilities: T2('Current liabilities', 'चालू देयताएँ'),
    debt: T2('Long-term debt', 'दीर्घकालीन ऋण'),
    equity: T2("Shareholders' funds", 'अंशधारक निधियाँ'),
    totalAssets: T2('Total assets', 'कुल परिसंपत्तियाँ'),
    receivables: T2('Trade receivables', 'व्यापारिक प्राप्य'),
  };
  const avgInv = (f) => (f.openingInventory != null ? (f.openingInventory + f.inventory) / 2 : f.inventory);
  const RAT = {
    current: { n: T2('Current ratio', 'चालू अनुपात'), need: ['currentAssets', 'currentLiabilities'], u: ':1', num: (f) => f.currentAssets, den: (f) => f.currentLiabilities, nn: FIG.currentAssets, dn: FIG.currentLiabilities, ideal: 2,
      say: (r) => (r >= 2 ? T2('At least 2 : 1: current assets cover current liabilities twice over, which is usually treated as safe.', 'कम से कम 2 : 1: चालू परिसंपत्तियाँ चालू देयताओं को दो बार चुका सकती हैं, जिसे प्रायः सुरक्षित माना जाता है।') : T2('Below 2 : 1: there is less cushion to pay short-term debts on time.', '2 : 1 से कम: अल्पकालीन देनदारियाँ समय पर चुकाने का सहारा कम है।')),
      bad: (f) => [f.currentLiabilities / f.currentAssets] },
    quick: { n: T2('Quick (liquid) ratio', 'तरल अनुपात'), need: ['currentAssets', 'currentLiabilities', 'inventory'], u: ':1', num: (f) => f.currentAssets - f.inventory - (f.prepaid || 0), den: (f) => f.currentLiabilities,
      nn: T2('Quick assets (current assets − inventory − prepaid expenses)', 'तरल परिसंपत्तियाँ (चालू परिसंपत्तियाँ − मालसूची − पूर्वदत्त व्यय)'), dn: FIG.currentLiabilities, ideal: 1,
      say: (r) => (r >= 1 ? T2('At least 1 : 1: the business can pay its current liabilities without selling its stock.', 'कम से कम 1 : 1: व्यापार स्टॉक बेचे बिना चालू देयताएँ चुका सकता है।') : T2('Below 1 : 1: it would need to sell stock to pay its current liabilities.', '1 : 1 से कम: चालू देयताएँ चुकाने के लिए स्टॉक बेचना पड़ेगा।')),
      bad: (f) => [f.currentAssets / f.currentLiabilities, f.currentLiabilities / (f.currentAssets - f.inventory - (f.prepaid || 0))] },
    'debt-equity': { n: T2('Debt–equity ratio', 'ऋण-समता अनुपात'), need: ['debt', 'equity'], u: ':1', num: (f) => f.debt, den: (f) => f.equity, nn: FIG.debt, dn: FIG.equity, ideal: 2, low: true,
      say: (r) => (r <= 2 ? T2('Up to 2 : 1 is generally treated as safe: lenders are well covered by the owners’ funds.', '2 : 1 तक प्रायः सुरक्षित माना जाता है: ऋणदाता स्वामियों की निधि से सुरक्षित हैं।') : T2('Above 2 : 1: the business depends heavily on borrowed money.', '2 : 1 से अधिक: व्यापार उधार के पैसे पर बहुत निर्भर है।')),
      bad: (f) => [f.equity / f.debt, f.debt / (f.debt + f.equity)] },
    proprietary: { n: T2('Proprietary ratio', 'स्वामित्व अनुपात'), need: ['equity', 'totalAssets'], u: ':1', num: (f) => f.equity, den: (f) => f.totalAssets, nn: FIG.equity, dn: FIG.totalAssets,
      say: (r) => T2(`The owners have provided ${Math.round(r * 100)}% of the assets; the rest comes from outsiders.`, `परिसंपत्तियों का ${Math.round(r * 100)}% स्वामियों ने दिया है; बाक़ी बाहरी लोगों से आया है।`),
      bad: (f) => [f.totalAssets / f.equity] },
    'inventory-turnover': { n: T2('Inventory turnover ratio', 'मालसूची आवर्त अनुपात'), need: ['cogs', 'inventory'], u: 'times', num: (f) => f.cogs, den: avgInv, nn: FIG.cogs, dn: T2('Average inventory', 'औसत मालसूची'),
      say: (r) => T2(`The stock is sold and replaced about ${r.toFixed(1)} times a year. Higher usually means goods move fast.`, `स्टॉक साल में लगभग ${r.toFixed(1)} बार बिकता और भरता है। अधिक होने का अर्थ प्रायः माल जल्दी बिकना है।`),
      bad: (f) => [avgInv(f) / f.cogs, f.openingInventory != null ? f.cogs / f.inventory : f.revenue ? f.revenue / f.inventory : NaN] },
    'receivables-turnover': { n: T2('Trade receivables turnover ratio', 'व्यापारिक प्राप्य आवर्त अनुपात'), need: ['receivables'], u: 'times', num: (f) => (f.creditRevenue != null ? f.creditRevenue : f.revenue), den: (f) => f.receivables,
      nn: FIG.creditRevenue, dn: FIG.receivables,
      say: (r) => T2(`Customers pay in about ${Math.round(365 / r)} days on average (365 ÷ ${r.toFixed(2)}).`, `ग्राहक औसतन लगभग ${Math.round(365 / r)} दिनों में भुगतान करते हैं (365 ÷ ${r.toFixed(2)})।`),
      bad: (f) => [f.receivables / (f.creditRevenue != null ? f.creditRevenue : f.revenue)] },
    'gross-profit': { n: T2('Gross profit ratio', 'सकल लाभ अनुपात'), need: ['revenue', 'cogs'], u: '%', num: (f) => f.revenue - f.cogs, den: (f) => f.revenue, nn: T2('Gross profit (revenue − cost of revenue)', 'सकल लाभ (आगम − आगम की लागत)'), dn: FIG.revenue,
      say: (r) => T2(`Out of every ₹100 of sales, ₹${r.toFixed(2)} is left after the cost of the goods sold.`, `हर ₹100 की बिक्री में से बेचे गए माल की लागत के बाद ₹${r.toFixed(2)} बचते हैं।`),
      bad: (f) => [(f.cogs / f.revenue) * 100, ((f.revenue - f.cogs) / f.cogs) * 100] },
    operating: { n: T2('Operating ratio', 'प्रचालन अनुपात'), need: ['revenue', 'cogs', 'operatingExpenses'], u: '%', num: (f) => f.cogs + f.operatingExpenses, den: (f) => f.revenue, nn: T2('Cost of revenue + operating expenses', 'आगम की लागत + प्रचालन व्यय'), dn: FIG.revenue,
      say: (r) => T2(`Running the business uses ₹${r.toFixed(2)} of every ₹100 of sales. Lower is better.`, `व्यापार चलाने में हर ₹100 की बिक्री में से ₹${r.toFixed(2)} लगते हैं। कम होना अच्छा है।`),
      bad: (f) => [(f.cogs / f.revenue) * 100, 100 - ((f.cogs + f.operatingExpenses) / f.revenue) * 100] },
    'net-profit': { n: T2('Net profit ratio', 'शुद्ध लाभ अनुपात'), need: ['revenue', 'netProfit'], u: '%', num: (f) => f.netProfit, den: (f) => f.revenue, nn: FIG.netProfit, dn: FIG.revenue,
      say: (r) => T2(`The business keeps ₹${r.toFixed(2)} as net profit from every ₹100 of sales.`, `व्यापार हर ₹100 की बिक्री में से ₹${r.toFixed(2)} शुद्ध लाभ के रूप में रखता है।`),
      bad: (f) => [(f.revenue / f.netProfit), (f.netProfit / f.revenue)] },
  };
  const ratioVal = (id, f) => { const r = RAT[id]; const v = r.num(f) / r.den(f); return r.u === '%' ? v * 100 : v; };
  const ratioOK = (id, f) => { const r = RAT[id]; if (!r.need.every((k) => typeof f[k] === 'number')) return false; if (id === 'receivables-turnover' && f.creditRevenue == null && f.revenue == null) return false; const d = r.den(f); return isFinite(d) && d > 0 && r.num(f) >= 0 || (id === 'net-profit' && d > 0); };
  const ratioList = (c) => { const f = (c && c.figures) || {}; return (c && Array.isArray(c.ratios) ? c.ratios : Object.keys(RAT)).filter((id) => RAT[id] && ratioOK(id, f)); };
  const fmtR = (id, v) => (RAT[id].u === '%' ? v.toFixed(2) + '%' : RAT[id].u === ':1' ? v.toFixed(2) + ' : 1' : v.toFixed(2));

  // ---------------------------------------------------------------- cash flow (AS 3, non-financial company)
  const CF = {
    operating: T2('Operating activity', 'प्रचालन गतिविधि'), investing: T2('Investing activity', 'निवेश गतिविधि'),
    financing: T2('Financing activity', 'वित्तीयन गतिविधि'), none: T2('No cash flow', 'कोई रोकड़ प्रवाह नहीं'),
  };
  const CF_WHY = {
    operating: T2('the day-to-day trade: buying, selling and paying the running expenses', 'रोज़ का व्यापार: ख़रीदना, बेचना और चालू ख़र्च चुकाना'),
    investing: T2('buying or selling long-term assets and investments, and interest or dividend received on them', 'दीर्घकालीन परिसंपत्तियाँ और निवेश ख़रीदना-बेचना, और उन पर मिला ब्याज या लाभांश'),
    financing: T2('money from or back to the owners and lenders: capital, shares, loans and interest paid', 'स्वामियों और ऋणदाताओं से आया या उन्हें लौटाया पैसा: पूँजी, अंश, ऋण और दिया गया ब्याज'),
  };
  function cfClass(x, accs) {
    const cd = accs[x.debit].cf === 'cash', cc = accs[x.credit].cf === 'cash';
    if (cd && cc) return { c: 'none', why: 'swap', inflow: 0 };
    if (!cd && !cc) return { c: 'none', why: 'noncash', inflow: 0 };
    const other = cd ? x.credit : x.debit;
    return { c: accs[other].cf, inflow: cd ? 1 : -1, other };
  }

  // ---------------------------------------------------------------- final accounts: where each balance goes
  function faPlace(id, bal, accs) {
    if (id === 'closing-stock') return 'both';
    const a = accs[id];
    return a.st;
  }
  function faItems(c) {
    const accs = accountsOf(c);
    const { b, order } = balancesOf(txOf(c));
    const items = order.filter((id) => b[id] !== 0).map((id) => ({ id, bal: b[id], n: accs[id].n }));
    if (c.closingStock) items.push({ id: 'closing-stock', bal: P(c.closingStock), n: T2('Closing stock', 'अंतिम स्टॉक') });
    return items;
  }

  // ---------------------------------------------------------------- validate
  const COMMON = ['mode', 'business', 'transactions', 'method'];
  const ALLOW = {
    equation: ['accounts'], journal: ['accounts', 'rules'], ledger: ['accounts'], 'cash-book': ['accounts'], 'trial-balance': ['accounts'],
    brs: ['balance', 'from'], depreciation: ['rate', 'life', 'scrap', 'years'], 'final-accounts': ['accounts', 'closingStock'],
    partnership: ['partners', 'profit', 'interest', 'fixed'], shares: ['issue'], ratios: ['figures', 'ratios'], 'cash-flow': ['accounts', 'opening'],
  };
  const NEED = { equation: 'dc', journal: 'dc', ledger: 'dc', 'cash-book': 'dc', 'trial-balance': 'dc', 'final-accounts': 'dc', 'cash-flow': 'dc', depreciation: 'dc', brs: 'kind', partnership: null, shares: null, ratios: null };
  const LIM = { equation: [1, 8], journal: [1, 10], ledger: [1, 10], 'cash-book': [1, 12], 'trial-balance': [2, 14], 'final-accounts': [3, 16], 'cash-flow': [2, 12], brs: [1, 8], depreciation: [1, 3] };
  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
    if (!MODES.includes(c.mode)) return ['mode must be one of: ' + MODES.join(', ')];
    const m = c.mode;
    Object.keys(c).forEach((k) => { if (!COMMON.includes(k) && !ALLOW[m].includes(k)) e.push(`unknown key for ${m} mode: ${k}`); });
    if (c.business != null && !isBi(c.business)) e.push('business: a name (string or {en, hi})');
    if (c.method != null && !['slm', 'wdv'].includes(c.method)) e.push("method: 'slm' or 'wdv'");
    if (c.method != null && m !== 'depreciation') e.push('method is used only in depreciation mode');
    if (c.rules != null && !['modern', 'traditional'].includes(c.rules)) e.push("rules: 'modern' or 'traditional'");
    if (c.accounts != null) {
      if (!Array.isArray(c.accounts) || c.accounts.length > 8) e.push('accounts: an array of at most 8 personal accounts');
      else {
        const seen = new Set();
        c.accounts.forEach((a, i) => {
          const w = `accounts[${i}]`;
          if (!a || typeof a !== 'object' || !ID.test(String(a.id || ''))) { e.push(`${w}: id must be letters, digits, - or _`); return; }
          if (A[a.id]) e.push(`${w}: ${a.id} is already a built-in account`);
          if (seen.has(a.id)) e.push(`${w}: ${a.id} is listed twice`);
          seen.add(a.id);
          if (!isBi(a.name)) e.push(`${w}: name needs en and hi`);
          if (!['debtor', 'creditor'].includes(a.kind)) e.push(`${w}: kind must be 'debtor' or 'creditor'`);
          Object.keys(a).forEach((k) => { if (!['id', 'name', 'kind'].includes(k)) e.push(`${w}: unknown key ${k}`); });
        });
      }
    }
    if (e.length) return e;
    const accs = accountsOf(c);
    const need = NEED[m];
    const list = c.transactions == null ? [] : c.transactions;
    if (!Array.isArray(list)) return ['transactions: an array'];
    if (need === null) { if (list.length) e.push(`transactions are not used in ${m} mode: leave the list empty`); }
    else {
      const [lo, hi] = LIM[m];
      if (list.length < lo || list.length > hi) e.push(`transactions: ${lo} to ${hi} in ${m} mode`);
      const seen = new Set();
      list.forEach((x, i) => {
        const w = `transactions[${i}]`;
        if (!x || typeof x !== 'object') { e.push(`${w}: an object`); return; }
        Object.keys(x).forEach((k) => { if (!['id', 'date', 'text', 'amount', 'debit', 'credit', 'kind'].includes(k)) e.push(`${w}: unknown key ${k}`); });
        if (!ID.test(String(x.id || ''))) e.push(`${w}: id must be letters, digits, - or _`);
        else if (seen.has(x.id)) e.push(`${w}: id ${x.id} is used twice`);
        else seen.add(x.id);
        if (!parseD(x.date)) e.push(`${w}: date must be a real date, YYYY-MM-DD`);
        if (!isBi(x.text)) e.push(`${w}: text needs en and hi`);
        if (!isMoney(x.amount) || x.amount > 1e9) e.push(`${w}: amount must be rupees above 0 (at most 2 decimals, at most 100 crore)`);
        if (need === 'dc') {
          if (x.kind != null) e.push(`${w}: kind is used only in brs mode`);
          if (!accs[x.debit]) e.push(`${w}: unknown debit account: ${x.debit}`);
          if (!accs[x.credit]) e.push(`${w}: unknown credit account: ${x.credit}`);
          if (x.debit === x.credit) e.push(`${w}: debit and credit must be two different accounts`);
          [x.debit, x.credit].forEach((a) => {
            if (accs[a] && accs[a].eqOnly && m !== 'equation') e.push(`${w}: stock is used only in equation mode; elsewhere goods go through purchases and sales`);
            if (m === 'equation' && ['purchases', 'sales', 'purchase-returns', 'sales-returns'].includes(a)) e.push(`${w}: in the accounting equation goods are an asset: debit stock when goods are bought; for a sale credit stock with the cost, and show any profit as a second transaction credited to capital`);
          });
        } else if (!BRS[x.kind]) e.push(`${w}: kind must be one of ${Object.keys(BRS).join(', ')}`);
        else if (x.debit != null || x.credit != null) e.push(`${w}: a brs item has a kind, not debit and credit`);
      });
    }
    if (e.length) return e;
    const tx = txOf(c);
    if (m === 'cash-book') {
      let cash = 0;
      tx.forEach((x) => {
        if (![x.debit, x.credit].some((a) => a === 'cash' || a === 'bank')) e.push(`${x.id}: a cash book records only transactions that touch cash or bank`);
        cash += (x.debit === 'cash' ? x.p : 0) - (x.credit === 'cash' ? x.p : 0);
        if (cash < 0) e.push(`${x.id}: cash in hand would fall below zero on ${x.date}; cash can never be negative`);
      });
    }
    if (m === 'trial-balance' && balancesOf(tx).order.filter((id) => balancesOf(tx).b[id] !== 0).length < 2) e.push('trial-balance: the transactions must leave at least two accounts with a balance');
    if (m === 'final-accounts') {
      if (c.closingStock != null && !isMoney(c.closingStock, true)) e.push('closingStock: rupees, 0 or more');
      const { b } = balancesOf(tx);
      if (!b.sales) e.push('final-accounts: include at least one sale so the trading account has something to show');
      const net = (b.purchases || 0) + (b['purchase-returns'] || 0);
      if (c.closingStock && P(c.closingStock) > net) e.push('closingStock cannot be more than the goods bought (net purchases at cost)');
      if (Object.keys(b).some((id) => accs[id] && accs[id].fa) && !b.depreciation) { /* fixed assets at cost: allowed */ }
      if (b['share-capital']) e.push('final-accounts here are for a sole trader: use capital, not share capital');
    }
    if (m === 'cash-flow') {
      if (c.opening != null && !isMoney(c.opening, true)) e.push('opening: rupees, 0 or more');
      tx.forEach((x) => { [x.debit, x.credit].forEach((a) => { if (accs[a].cf == null) e.push(`${x.id}: ${a} is classified differently by different books; leave it out of a cash flow lab`); }); });
      let cash = P(c.opening || 0);
      tx.forEach((x) => { const k = cfClass(x, accs); cash += k.inflow * x.p; if (cash < 0) e.push(`${x.id}: cash and bank together would fall below zero`); });
    }
    if (m === 'brs') {
      if (!isMoney(c.balance, true, true)) e.push('balance: the starting bank balance in rupees (negative for an overdraft)');
      if (c.from != null && !['cash-book', 'pass-book'].includes(c.from)) e.push("from: 'cash-book' or 'pass-book'");
    }
    if (m === 'depreciation') {
      const asset = tx[0].debit;
      if (!A[asset] || !A[asset].fa) e.push(`depreciation: every transaction debits one fixed asset that wears out (building, machinery, furniture, vehicle, computer); land is not depreciated`);
      tx.forEach((x) => { if (x.debit !== asset) e.push(`${x.id}: debit the same asset (${asset}): installation and carriage are part of its cost`); if (A[x.credit] && A[x.credit].fa) e.push(`${x.id}: credit cash, bank or a creditor`); if (dayNo(x.date) - dayNo(tx[0].date) > 31) e.push(`${x.id}: costs must come within a month of the purchase`); });
      const meth = c.method || 'slm';
      if (c.rate != null && (typeof c.rate !== 'number' || !(c.rate > 0 && c.rate < 100))) e.push('rate: a percentage above 0 and below 100');
      if (meth === 'wdv') { if (c.rate == null) e.push('wdv needs a rate'); if (c.life != null || c.scrap != null) e.push('life and scrap are used only with slm'); }
      else {
        if (c.rate == null && c.life == null) e.push('slm needs a rate or a life in years');
        if (c.rate != null && c.life != null) e.push('slm: give a rate or a life, not both');
        if (c.life != null && !(Number.isInteger(c.life) && c.life >= 1 && c.life <= 50)) e.push('life: whole years, 1 to 50');
        if (c.scrap != null && (!isMoney(c.scrap, true) || c.life == null)) e.push('scrap: rupees, used with life');
      }
      if (c.years != null && !(Number.isInteger(c.years) && c.years >= 1 && c.years <= 10)) e.push('years: 1 to 10');
      if (!e.length) {
        const s = depSchedule(c);
        if (s.scrap >= s.cost) e.push('scrap must be less than the cost');
        const last = s.rows[s.rows.length - 1];
        if (last.close < s.scrap || last.close < 0) e.push('the asset would be fully written off within these years: show fewer years or a lower rate');
      }
    }
    if (m === 'partnership') {
      const ps = c.partners;
      if (!Array.isArray(ps) || ps.length < 2 || ps.length > 4) e.push('partners: 2 to 4 partners');
      else {
        const withR = ps.filter((p) => p && p.ratio != null).length;
        if (withR && withR !== ps.length) e.push('partners: give every partner a ratio, or none (then they share equally, as the Partnership Act says)');
        ps.forEach((p, i) => {
          const w = `partners[${i}]`;
          if (!p || typeof p !== 'object') { e.push(`${w}: an object`); return; }
          Object.keys(p).forEach((k) => { if (!['name', 'capital', 'ratio', 'salary'].includes(k)) e.push(`${w}: unknown key ${k}`); });
          if (!isBi(p.name)) e.push(`${w}: name needs en and hi`);
          if (!isMoney(p.capital) || p.capital > 1e9) e.push(`${w}: capital in rupees, above 0`);
          if (p.ratio != null && !(Number.isInteger(p.ratio) && p.ratio >= 1 && p.ratio <= 20)) e.push(`${w}: ratio a whole number 1 to 20`);
          if (p.salary != null && !isMoney(p.salary, true)) e.push(`${w}: salary in rupees a year`);
        });
      }
      if (!isMoney(c.profit, false, true) || Math.abs(c.profit) > 1e9) e.push('profit: the net profit in rupees (negative for a loss), not 0');
      if (c.interest != null && !(typeof c.interest === 'number' && c.interest >= 0 && c.interest <= 20)) e.push('interest: % a year on capital, 0 to 20');
      if (c.fixed != null && typeof c.fixed !== 'boolean') e.push('fixed: true or false');
    }
    if (m === 'shares') {
      const s = c.issue;
      if (!s || typeof s !== 'object') e.push('issue: { shares, face, premium?, calls: [...], applied? }');
      else {
        Object.keys(s).forEach((k) => { if (!['shares', 'face', 'premium', 'calls', 'applied'].includes(k)) e.push(`issue: unknown key ${k}`); });
        if (!(Number.isInteger(s.shares) && s.shares >= 1 && s.shares <= 1e8)) e.push('issue.shares: a whole number of shares, 1 to 10 crore');
        if (!isMoney(s.face) || s.face > 10000) e.push('issue.face: the face value of a share in rupees');
        if (s.premium != null && !isMoney(s.premium, true)) e.push('issue.premium: rupees a share, 0 or more');
        if (!Array.isArray(s.calls) || s.calls.length < 2 || s.calls.length > 4 || !s.calls.every((v) => isMoney(v))) e.push('issue.calls: 2 to 4 amounts a share (application, allotment, calls), each above 0');
        else if (isMoney(s.face)) {
          const pr = P(s.premium || 0);
          if (sum(s.calls.map(P)) !== P(s.face) + pr) e.push('issue.calls must add up to the face value plus the premium');
          if (P(s.calls[0]) * 100 < P(s.face) * 5) e.push('issue.calls[0]: application money must be at least 5% of the face value (Companies Act 2013, s.39)');
          if (P(s.calls[1]) < pr) e.push('issue.calls[1]: the premium is collected with allotment, so allotment must be at least the premium');
        }
        if (s.applied != null && !(Number.isInteger(s.applied) && s.applied >= s.shares && s.applied <= s.shares * 10)) e.push('issue.applied: whole number, at least the shares offered (excess money is refunded), at most 10 times');
      }
    }
    if (m === 'ratios') {
      const f = c.figures;
      if (!f || typeof f !== 'object') e.push('figures: { revenue, cogs, currentAssets, … } in rupees');
      else {
        Object.keys(f).forEach((k) => { if (!FIG[k]) e.push(`figures: unknown figure ${k} (use ${Object.keys(FIG).join(', ')})`); else if (!isMoney(f[k], true, k === 'netProfit')) e.push(`figures.${k}: rupees`); });
        if (f.currentAssets != null && (f.inventory || 0) + (f.prepaid || 0) > f.currentAssets) e.push('inventory and prepaid expenses are part of current assets, so they cannot be more than current assets');
        if (f.totalAssets != null && f.currentAssets != null && f.currentAssets > f.totalAssets) e.push('current assets cannot be more than total assets');
        if (f.creditRevenue != null && f.revenue != null && f.creditRevenue > f.revenue) e.push('credit revenue cannot be more than the revenue');
        if (c.ratios != null) {
          if (!Array.isArray(c.ratios) || !c.ratios.length) e.push('ratios: a list of ratio ids');
          else c.ratios.forEach((id) => { if (!RAT[id]) e.push(`unknown ratio: ${id} (use ${Object.keys(RAT).join(', ')})`); else if (!ratioOK(id, f)) e.push(`${id}: the figures it needs are missing or zero (${RAT[id].need.join(', ')})`); });
        }
        if (!e.length && !ratioList(c).length) e.push('figures: not enough figures for any ratio');
      }
    }
    return e;
  }

  // ---------------------------------------------------------------- keys
  function keys(c) {
    const m = c && c.mode;
    let tx = [];
    try { tx = txOf(c).filter((x) => x && x.id != null); } catch (err) { tx = []; }
    const ids = tx.map((x) => String(x.id));
    const tt = ids.map((id) => 'txn:' + id), sel = ids.map((id) => 'selected:' + id);
    const ans = ['answered:right', 'answered:wrong'];
    let T = [], E = [];
    try {
      if (m === 'equation') { T = tt.concat(['post', 'answer']); E = sel.concat(ids.map((id) => 'posted:' + id), ['balanced'], ans); }
      else if (m === 'journal') { const ch = journalChips(c); T = tt.concat(ch.map((a) => 'account:' + a), ['debit', 'credit', 'post', 'rules']); E = sel.concat(ch.map((a) => 'chose:' + a), ['side:debit', 'side:credit', 'rules:modern', 'rules:traditional'], ids.map((id) => 'journalised:' + id), ['tallied'], ans); }
      else if (m === 'ledger') { const ac2 = usedAccounts(tx); T = tt.concat(ac2.map((a) => 'account:' + a), ['post', 'balance', 'answer']); E = sel.concat(ids.map((id) => 'posted:' + id), ['balanced'], ans); }
      else if (m === 'cash-book') { T = tt.concat(['debit', 'credit', 'post', 'balance', 'answer']); E = sel.concat(['side:debit', 'side:credit'], ids.map((id) => 'posted:' + id), ['balanced'], ans); }
      else if (m === 'trial-balance') { const { b, order } = balancesOf(tx); const ac2 = order.filter((a) => b[a] !== 0); T = ac2.map((a) => 'account:' + a).concat(['debit', 'credit', 'post', 'balance', 'answer']); E = ac2.map((a) => 'chose:' + a).concat(['side:debit', 'side:credit'], ac2.map((a) => 'posted:' + a), ['tallied'], ans); }
      else if (m === 'brs') { T = tt.concat(['debit', 'credit', 'post', 'balance', 'answer']); E = sel.concat(['side:debit', 'side:credit'], ids.map((id) => 'posted:' + id), ['balanced', 'tallied'], ans); }
      else if (m === 'depreciation') { const n = (c && c.years) || 3; T = ['post', 'balance', 'method', 'answer']; E = Array.from({ length: n }, (_, k) => 'posted:year-' + (k + 1)).concat(['balanced', 'compared'], ans); }
      else if (m === 'final-accounts') { const it = faItems(c).map((x) => x.id); T = it.map((a) => 'account:' + a).concat(['post', 'balance', 'answer']); E = it.map((a) => 'chose:' + a).concat(it.map((a) => 'posted:' + a), ['balanced', 'tallied'], ans); }
      else if (m === 'partnership') { const pl = partnerPlan(c); T = ['post', 'balance', 'answer']; E = pl.steps.map((s) => 'posted:' + s.id).concat(['balanced'], ans); }
      else if (m === 'shares') { const st = stagesOf(((c.issue && c.issue.calls) || []).length); T = ['post', 'balance', 'answer']; E = st.map((s) => 'posted:' + s.id).concat(['tallied'], ans); }
      else if (m === 'ratios') { const rl = ratioList(c); T = rl.map((r) => 'ratio:' + r).concat(['post', 'answer']); E = rl.map((r) => 'selected:' + r).concat(rl.map((r) => 'posted:' + r), ans); }
      else if (m === 'cash-flow') { T = tt.concat(['post', 'balance', 'answer']); E = sel.concat(ids.map((id) => 'posted:' + id), ['tallied'], ans); }
    } catch (err) { /* an invalid config: return what we have */ }
    return { targets: T, events: E };
  }

  // ---------------------------------------------------------------- CSS
  const CSS = `.lg { position: relative; container-type: inline-size; color: var(--ink); font-family: var(--font-body); min-width: 0; }
.lg * { box-sizing: border-box; }
.lg-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.lg-top { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 18px; color: #fff; background: radial-gradient(120% 160% at 100% 0%, #4400F0 0%, transparent 55%), linear-gradient(135deg, #1E3A8A, #1D4ED8); box-shadow: 0 8px 22px rgba(6,18,51,.22); }
.lg-top > svg { width: 46px; height: 46px; flex: none; filter: drop-shadow(0 3px 4px rgba(0,0,0,.25)); }
.lg-ttl { min-width: 0; }
.lg-biz { margin: 0; font: 600 .82rem var(--font-body); color: #BFD3FF; letter-spacing: .3px; }
.lg-top h3 { margin: 0; font: 800 1.2rem/1.15 var(--font-display); color: #fff; }
.lg-prog { margin-left: auto; flex: none; text-align: right; font: 600 .8rem var(--font-body); color: #DCE6FF; }
.lg-prog b { font: 800 1.3rem var(--font-display); color: #FFD23F; }
.lg-prog i { display: block; width: 86px; height: 6px; margin-top: 4px; border-radius: 9px; background: rgba(255,255,255,.2); position: relative; overflow: hidden; }
.lg-prog i::after { content: ''; position: absolute; inset: 0 auto 0 0; width: var(--w); background: linear-gradient(90deg, #FFD23F, #22C55E); border-radius: 9px; transition: width .6s; }
.lg-grid { display: grid; grid-template-columns: minmax(220px, 290px) minmax(0, 1fr); gap: 16px; margin-top: 14px; align-items: start; }
@container (max-width: 760px) { .lg-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; } }
.lg-side, .lg-main { min-width: 0; }
.lg-h { margin: 0 0 8px; font: 800 .95rem var(--font-display); color: var(--ink-2); letter-spacing: .4px; text-transform: uppercase; }
.lg-txns { display: flex; flex-direction: column; gap: 8px; }
@container (max-width: 760px) { .lg-txns { flex-direction: row; overflow-x: auto; scroll-snap-type: x proximity; padding: 2px 2px 8px; margin: 0 -2px; } .lg-txns > * { flex: 0 0 min(78%, 250px); scroll-snap-align: start; } }
.lg-txn { position: relative; text-align: left; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 14px; padding: 9px 12px 9px 12px; min-height: 44px; cursor: pointer; display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; font: inherit; transition: transform .15s, border-color .15s, box-shadow .15s, background .2s; box-shadow: 0 1px 0 rgba(6,18,51,.06); }
.lg-txn:hover { transform: translateY(-1px); box-shadow: 0 6px 14px rgba(6,18,51,.10); }
.lg-txn[aria-pressed="true"] { border-color: #8B3DFF; box-shadow: 0 0 0 3px rgba(139,61,255,.28); }
.lg-d { grid-row: span 2; align-self: start; background: linear-gradient(180deg, #1D4ED8, #1E3A8A); color: #fff; border-radius: 10px; font: 800 .74rem/1.1 var(--font-display); padding: 6px 7px; text-align: center; min-width: 46px; }
.lg-x { font-weight: 600; font-size: .9rem; line-height: 1.3; padding-right: 18px; }
.lg-a { font: 800 1rem var(--font-display); color: var(--ink); }
.lg-sub { grid-column: 1 / -1; font-size: .78rem; color: var(--ink-2); line-height: 1.3; }
.lg-tick { position: absolute; top: 6px; right: 8px; width: 22px; height: 22px; border-radius: 50%; background: #0F766E; color: #fff; font: 800 .8rem/22px var(--font-body); text-align: center; }
.lg-txn.done { border-color: #14B8A6; background: linear-gradient(180deg, rgba(20,184,166,.10), transparent), var(--surface); }
.lg-tag { display: inline-block; border-radius: 999px; padding: 1px 8px; font-weight: 700; font-size: .74rem; color: #1E293B; background: var(--c, #E2E8F0); }
.lg-card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; }
.lg-card + .lg-card { margin-top: 10px; }
.lg-card h5 { margin: 0 0 6px; font: 800 1rem var(--font-display); }
.lg-kv { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; font-size: .9rem; }
.lg-kv b { font-family: var(--font-display); text-align: right; }
.lg-muted { color: var(--ink-2); font-size: .85rem; margin: 6px 0 0; }
.lg-paper { position: relative; background-color: #FFFDF6; color: #1E293B; border-radius: 14px; border: 1px solid #E8DFC6; box-shadow: 0 3px 12px rgba(6,18,51,.10); padding: 12px 12px 12px 18px; background-image: linear-gradient(90deg, transparent 9px, rgba(220,38,38,.35) 9px, rgba(220,38,38,.35) 10px, transparent 10px), repeating-linear-gradient(180deg, transparent 0 27px, rgba(29,78,216,.09) 27px 28px); }
.lg-paper + .lg-paper, .lg-paper + .lg-chips, .lg-chips + .lg-paper, .lg-ts + .lg-paper, .lg-paper + .lg-ts { margin-top: 12px; }
.lg-paper h5 { margin: 0 0 8px; text-align: center; font: 800 1.02rem var(--font-display); color: #1E3A8A; letter-spacing: .3px; }
.lg-paper h5 small { display: block; font: 600 .76rem var(--font-body); color: #64748B; letter-spacing: 0; }
.lg-tbw { overflow-x: auto; }
.lg-tb { width: 100%; border-collapse: collapse; font-size: .88rem; }
.lg-tb th { font: 800 .76rem var(--font-body); color: #1E3A8A; border-bottom: 2px solid #1E3A8A; padding: 4px 6px; text-align: left; white-space: nowrap; }
.lg-tb td { padding: 5px 6px; border-bottom: 1px solid rgba(29,78,216,.12); vertical-align: top; }
.lg-tb .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 700; }
.lg-tb th.n { text-align: right; }
.lg-tb .dt { white-space: nowrap; color: #475569; font-size: .8rem; }
.lg-tb .nar td { font-style: italic; color: #64748B; font-size: .8rem; padding-top: 0; }
.lg-tb .ind { padding-left: 22px; }
.lg-tb tr.tot td { border-top: 2px solid #1E293B; border-bottom: 3px double #1E293B; font-weight: 800; }
.lg-tb tr.pad td { color: transparent; }
@container (max-width: 520px) { .lg-tb .lf { display: none; } .lg-tb { font-size: .82rem; } .lg-tb td, .lg-tb th { padding: 4px 4px; } }
.lg-drw { float: right; font-weight: 800; color: #1D4ED8; }
.lg-new { animation: lg-in .9s ease-out both; }
@keyframes lg-in { 0% { background-color: rgba(255,210,63,.75); } 100% { background-color: rgba(255,210,63,0); } }
.lg-wait { visibility: hidden; }
.lg-land { animation: lg-pop .45s ease-out; }
@keyframes lg-pop { 0% { transform: scale(.92); } 60% { transform: scale(1.04); } 100% { transform: none; } }
.lg-ts { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
.lg-t { position: relative; background-color: #FFFDF6; color: #1E293B; border-radius: 14px; border: 1px solid #E8DFC6; box-shadow: 0 3px 12px rgba(6,18,51,.10); padding: 10px 12px 10px; outline: none; transition: box-shadow .15s, transform .15s; }
.lg-t[role="button"] { cursor: pointer; }
.lg-t[role="button"]:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(6,18,51,.16); }
.lg-t:focus-visible, .lg-txn:focus-visible, .lg-chip:focus-visible, .lg-btn:focus-visible, .lg-opt:focus-visible, .lg-acc:focus-visible { outline: 3px solid #8B3DFF; outline-offset: 2px; }
.lg-t.hot { box-shadow: 0 0 0 3px rgba(139,61,255,.35), 0 8px 18px rgba(6,18,51,.16); }
.lg-t-h { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; border-bottom: 2px solid #1E3A8A; padding-bottom: 4px; }
.lg-t-h b { font: 800 .98rem var(--font-display); color: #1E3A8A; text-align: center; }
.lg-t-h span { font: 800 .78rem var(--font-body); color: #1D4ED8; }
.lg-t-h span.cr { color: #0F766E; }
.lg-t-b { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.lg-t-s { min-height: 54px; padding: 2px 6px 2px 0; }
.lg-t-s.cr { border-left: 2px solid #1E3A8A; padding: 2px 0 2px 6px; }
.lg-r { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 6px; font-size: .8rem; line-height: 1.25; padding: 3px 2px; border-radius: 6px; }
.lg-r .dt { grid-column: 1 / -1; font-size: .68rem; color: #64748B; }
.lg-r .p { overflow-wrap: anywhere; }
.lg-r .a { font-variant-numeric: tabular-nums; font-weight: 800; text-align: right; }
.lg-r.sub .p { padding-left: 10px; color: #475569; }
.lg-r.bal .p, .lg-r.bal .a { color: #B45309; }
.lg-t-f { display: grid; grid-template-columns: 1fr 1fr; border-top: 1.5px solid #1E293B; border-bottom: 3px double #1E293B; font: 800 .82rem var(--font-body); }
.lg-t-f span { text-align: right; padding: 3px 6px 2px 0; font-variant-numeric: tabular-nums; }
.lg-t-f span + span { border-left: 2px solid #1E3A8A; }
.lg-t-after { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.lg-empty { font-size: .76rem; color: #94A3B8; padding: 6px 2px; font-style: italic; }
.lg-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.lg-btn { min-height: 44px; border: 0; border-radius: 12px; padding: 0 16px; font: 700 .95rem var(--font-body); cursor: pointer; display: inline-flex; align-items: center; gap: 8px; color: #fff; background: linear-gradient(180deg, #3B6EEA, #1D4ED8); box-shadow: 0 2px 0 rgba(6,18,51,.25), 0 4px 10px rgba(29,78,216,.18); transition: transform .12s, filter .12s, opacity .2s; }
.lg-btn:hover { filter: brightness(1.06); transform: translateY(-1px); }
.lg-btn:active { transform: translateY(1px); }
.lg-btn svg { width: 20px; height: 20px; flex: none; }
.lg-btn.cr { background: linear-gradient(180deg, #14917F, #0F766E); box-shadow: 0 2px 0 rgba(6,18,51,.25), 0 4px 10px rgba(15,118,110,.2); }
.lg-btn.go { background: linear-gradient(180deg, #A266FF, #8B3DFF); }
.lg-btn.bal { background: linear-gradient(180deg, #FFDF5C, #F5B90A); color: #1E293B; }
.lg-btn.ghost { background: var(--surface); color: var(--ink); border: 1.5px solid var(--line); box-shadow: none; }
.lg-btn[aria-disabled="true"] { opacity: .5; filter: saturate(.6); }
.lg-btn[aria-pressed="true"] { box-shadow: inset 0 0 0 2px #8B3DFF; }
.lg-live { margin-top: 10px; border-radius: 14px; padding: 10px 14px; background: var(--surface); border: 1.5px solid var(--line); min-height: 48px; font-size: .95rem; line-height: 1.45; }
.lg-live p { margin: 0; }
.lg-live p + p, .lg-live p + ul, .lg-live ul + p { margin-top: 6px; }
.lg-live ul { margin: 4px 0 0; padding-left: 20px; }
.lg-live.good { border-color: #14B8A6; background: linear-gradient(180deg, rgba(20,184,166,.12), rgba(20,184,166,.04)); }
.lg-live.bad { border-color: #FF6B57; background: linear-gradient(180deg, rgba(255,107,87,.12), rgba(255,107,87,.04)); }
.lg-live.info { border-color: #8EA9FF; }
.lg-hint { color: var(--ink-2); }
.lg-q { margin-top: 10px; padding: 12px 14px; border-radius: 14px; background: linear-gradient(180deg, rgba(255,210,63,.22), rgba(255,210,63,.08)); border: 1.5px solid #F5B90A; }
.lg-q[hidden] { display: none; }
.lg-qq { margin: 0 0 8px; font: 700 1rem var(--font-body); }
.lg-qq::before { content: '?'; display: inline-grid; place-items: center; width: 24px; height: 24px; margin-right: 8px; border-radius: 50%; background: #F5B90A; color: #1E293B; font: 800 .9rem var(--font-display); }
.lg-opts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.lg-opt { min-height: 44px; border-radius: 12px; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); font: 700 .92rem var(--font-body); padding: 6px 12px; cursor: pointer; text-align: center; transition: transform .12s, border-color .15s, background .2s; }
.lg-opt:hover { transform: translateY(-1px); border-color: #8B3DFF; }
.lg-opt.right { background: #0F766E; border-color: #0F766E; color: #fff; }
.lg-opt.wrong { background: rgba(255,107,87,.15); border-color: #FF6B57; text-decoration: line-through; }
.lg-fb { margin: 8px 0 0; font-size: .92rem; }
.lg-fx { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 6; }
.lg-fly { position: absolute; left: 0; top: 0; padding: 6px 12px; border-radius: 999px; background: linear-gradient(180deg, #FFE070, #FFD23F); color: #1E293B; font: 800 .9rem var(--font-display); box-shadow: 0 8px 18px rgba(6,18,51,.30); white-space: nowrap; will-change: transform; }
.lg-fly.cr { background: linear-gradient(180deg, #5EEAD4, #14B8A6); }
.lg-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.lg-chip { min-height: 44px; border-radius: 999px; padding: 0 14px 0 10px; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); font: 600 .9rem var(--font-body); display: inline-flex; align-items: center; gap: 8px; cursor: pointer; transition: transform .12s, border-color .15s, box-shadow .15s; }
.lg-chip:hover { transform: translateY(-1px); }
.lg-chip i { width: 14px; height: 14px; border-radius: 50%; background: var(--c); box-shadow: inset 0 -2px 0 rgba(0,0,0,.18); flex: none; }
.lg-chip[aria-pressed="true"] { border-color: #8B3DFF; box-shadow: 0 0 0 3px rgba(139,61,255,.28); transform: translateY(-2px); }
.lg-chip.used { opacity: .55; }
.lg-accs { display: grid; grid-template-columns: 1fr; gap: 8px; }
@container (max-width: 760px) { .lg-accs { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); } }
.lg-acc { position: relative; text-align: left; min-height: 44px; border-radius: 14px; border: 1.5px solid var(--line); border-left: 6px solid var(--c); background: var(--surface); color: var(--ink); font: inherit; padding: 8px 10px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; transition: transform .12s, box-shadow .15s; }
.lg-acc b { font: 800 .95rem var(--font-display); padding-right: 22px; }
.lg-acc small { font-size: .76rem; color: var(--ink-2); }
.lg-acc em { font-style: normal; font: 800 .92rem var(--font-display); }
.lg-acc[aria-pressed="true"] { box-shadow: 0 0 0 3px rgba(139,61,255,.28); border-color: #8B3DFF; border-left-color: var(--c); }
.lg-acc.done { opacity: .7; }
.lg-draft { display: flex; flex-direction: column; gap: 10px; }
.lg-dx { margin: 0; font-size: .95rem; display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
.lg-dx b { font-family: var(--font-display); color: #1E3A8A; }
.lg-slots { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@container (max-width: 420px) { .lg-slots { grid-template-columns: 1fr; } }
.lg-step { margin: 0; font: 700 .86rem var(--font-body); color: #6D28D9; }
.lg-slot { font: inherit; text-align: left; cursor: pointer; color: #1E293B; border: 2px dashed #94A3B8; border-radius: 12px; min-height: 56px; display: flex; flex-direction: column; justify-content: center; padding: 6px 12px; background: rgba(255,255,255,.6); }
.lg-slot small { font: 800 .72rem var(--font-body); letter-spacing: .5px; text-transform: uppercase; color: #1D4ED8; }
.lg-slot.cr small { color: #0F766E; }
.lg-slot b { font: 800 1rem var(--font-display); color: #94A3B8; }
.lg-slot.full { border-style: solid; border-color: #1D4ED8; background: #fff; }
.lg-slot.cr.full { border-color: #0F766E; }
.lg-slot.full b { color: #1E293B; }
.lg-slot.ready { border-color: #8B3DFF; background: rgba(139,61,255,.08); animation: lg-glow 1.4s ease-in-out infinite; }
.lg-slot.ready b { color: #6D28D9; }
.lg-slot:focus-visible { outline: 3px solid #8B3DFF; outline-offset: 2px; }
@keyframes lg-glow { 50% { box-shadow: 0 0 0 4px rgba(139,61,255,.18); } }
.lg-scale { display: block; width: 100%; height: auto; border-radius: 16px; background: radial-gradient(120% 90% at 50% 0%, #F3F7FF 0%, #E3EAF8 100%); }
.lg-eq { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr); gap: 8px; align-items: stretch; margin-top: 12px; }
.lg-eq > .op { align-self: center; font: 800 1.6rem var(--font-display); color: var(--ink-2); }
@container (max-width: 560px) { .lg-eq { grid-template-columns: minmax(0, 1fr); } .lg-eq > .op { justify-self: center; line-height: 1; } }
.lg-box { border-radius: 14px; padding: 10px 12px; color: #1E293B; background: var(--c); box-shadow: 0 3px 10px rgba(6,18,51,.12); min-width: 0; }
.lg-box h6 { margin: 0; font: 800 .85rem var(--font-body); letter-spacing: .4px; text-transform: uppercase; display: flex; justify-content: space-between; gap: 6px; }
.lg-box .tot { font: 800 1.35rem var(--font-display); }
.lg-box ul { list-style: none; margin: 4px 0 0; padding: 0; font-size: .82rem; }
.lg-box li { display: flex; justify-content: space-between; gap: 6px; border-top: 1px dashed rgba(30,41,59,.25); padding: 2px 0; }
.lg-box li span:last-child { font-weight: 800; font-variant-numeric: tabular-nums; }
.lg-pre { border-radius: 999px; padding: 0 8px; font: 800 .8rem var(--font-display); background: #fff; }
.lg-pre.up { color: #0F766E; } .lg-pre.dn { color: #B42318; }
.lg-cb { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0; }
.lg-cb > div + div { border-left: 2px solid #1E3A8A; padding-left: 8px; }
.lg-cb > div:first-child { padding-right: 8px; }
.lg-cbh { font: 800 .8rem var(--font-body); color: #1D4ED8; text-align: center; margin-bottom: 2px; }
.lg-cb > div + div .lg-cbh { color: #0F766E; }
@container (max-width: 620px) { .lg-cb { grid-template-columns: minmax(0, 1fr); } .lg-cb > div + div { border-left: 0; padding-left: 0; border-top: 2px solid #1E3A8A; margin-top: 10px; padding-top: 8px; } .lg-cb > div:first-child { padding-right: 0; } .lg-tb tr.pad { display: none; } }
.lg-two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; }
@container (max-width: 560px) { .lg-two { grid-template-columns: minmax(0, 1fr); } }
.lg-mini { border-radius: 12px; padding: 8px 10px; background: var(--surface); border: 1.5px solid var(--line); }
.lg-mini h6 { margin: 0 0 4px; font: 800 .86rem var(--font-display); display: flex; align-items: center; gap: 6px; }
.lg-mini h6 i { width: 12px; height: 12px; border-radius: 3px; background: var(--c); }
.lg-mi { display: flex; justify-content: space-between; gap: 6px; font-size: .8rem; padding: 3px 6px; border-radius: 8px; margin-top: 3px; background: rgba(2,207,249,.10); }
.lg-mi.ghost { background: transparent; border: 1.5px dashed var(--line); color: var(--ink-2); }
.lg-mi b { font-variant-numeric: tabular-nums; white-space: nowrap; }
.lg-chart { display: block; width: 100%; height: auto; border-radius: 16px; background: linear-gradient(180deg, #F5F8FF, #E6EDF9); }
.lg-grow { transform-box: fill-box; transform-origin: 50% 100%; animation: lg-grow .8s cubic-bezier(.2,.8,.2,1) both; }
@keyframes lg-grow { from { transform: scaleY(0); } to { transform: none; } }
.lg-fade { animation: lg-fade .7s ease-out both; }
@keyframes lg-fade { from { opacity: 0; } to { opacity: 1; } }
.lg-ring { animation: lg-ring 1s ease-out both; }
@keyframes lg-ring { from { stroke-dashoffset: var(--len); } to { stroke-dashoffset: 0; } }
.lg-st { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
.lg-st > .wide { grid-column: 1 / -1; }
@container (max-width: 680px) { .lg-st { grid-template-columns: minmax(0, 1fr); } }
.lg-frow { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; justify-content: center; font: 700 1rem var(--font-body); }
.lg-frac { display: inline-flex; flex-direction: column; align-items: stretch; text-align: center; max-width: 100%; }
.lg-frac span { padding: 3px 8px; }
.lg-frac span:first-child { border-bottom: 2.5px solid #1E293B; }
.lg-frac.v { font: 800 1.05rem var(--font-display); color: #1E3A8A; }
.lg-res { font: 800 1.5rem var(--font-display); color: #fff; background: linear-gradient(180deg, #A266FF, #8B3DFF); border-radius: 12px; padding: 4px 14px; }
.lg-res.q { background: #E2E8F0; color: #64748B; }
.lg-bk { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
@container (max-width: 620px) { .lg-bk { grid-template-columns: minmax(0, 1fr); } }
.lg-bucket { border-radius: 14px; padding: 8px 10px; background: var(--surface); border: 1.5px solid var(--line); border-top: 6px solid var(--c); min-height: 90px; }
.lg-bucket h6 { margin: 0 0 4px; font: 800 .9rem var(--font-display); }
.lg-bucket .tot { margin-top: 6px; border-top: 1.5px solid var(--line); padding-top: 4px; font: 800 .95rem var(--font-display); display: flex; justify-content: space-between; }
.lg-in { color: #0F766E; } .lg-out { color: #B42318; }
:root[data-theme="dark"] .lg-in { color: #5EE0C9; } :root[data-theme="dark"] .lg-out { color: #FF9C90; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .lg-in { color: #5EE0C9; } :root:not([data-theme="light"]) .lg-out { color: #FF9C90; } }
.lg-paper .lg-in, .lg-t .lg-in { color: #0F766E; } .lg-paper .lg-out, .lg-t .lg-out { color: #B42318; }
.lg-psh { border-radius: 16px; padding: 10px 12px; background: linear-gradient(180deg, #F5F8FF, #E6EDF9); color: #1E293B; }
.lg-psh p { margin: 0 0 8px; font: 800 .9rem var(--font-body); color: #1E3A8A; }
.lg-psr { display: flex; gap: 6px; }
.lg-psr .seg { min-width: 0; border: 2px dashed var(--c); border-radius: 12px; padding: 8px 4px; text-align: center; background: #fff; color: #1E293B; display: flex; flex-direction: column; gap: 2px; justify-content: center; }
.lg-psr .seg.on { background: var(--c); border-style: solid; color: var(--k); }
.lg-psr .seg b { font: 800 1.05rem var(--font-display); }
.lg-psr .seg span { font: 700 .74rem/1.2 var(--font-body); overflow-wrap: anywhere; }
.lg-psr .seg i { font: 600 .68rem/1.2 var(--font-body); font-style: normal; opacity: .9; }
.lg-sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; background: var(--c); margin-right: 6px; vertical-align: -1px; }
@media (prefers-reduced-motion: reduce) { .lg-new, .lg-land, .lg-grow, .lg-fade, .lg-ring, .lg-slot.ready { animation: none; } .lg-txn, .lg-btn, .lg-chip, .lg-opt, .lg-t, .lg-acc, .lg-prog i::after { transition: none; } }`;

  const BOOK = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 11c7-3 13-3 20 1v29c-7-4-13-4-20-1z" fill="#FFFDF6"/><path d="M44 11c-7-3-13-3-20 1v29c7-4 13-4 20-1z" fill="#FFF3D0"/><path d="M24 12v29" stroke="#1E3A8A" stroke-width="1.6"/><path d="M8 17h12M8 22h12M8 27h10M28 17h12M28 22h12M28 27h9" stroke="#8EA9FF" stroke-width="1.6" stroke-linecap="round"/><circle cx="36" cy="34" r="8" fill="#FFD23F" stroke="#F5B90A" stroke-width="1.5"/><text x="36" y="38.5" text-anchor="middle" font-size="12" font-weight="800" fill="#1E293B" font-family="sans-serif">₹</text></svg>`;
  const ICO = {
    post: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h12M13 6l6 6-6 6"/></svg>',
    bal: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M5 21h14M4 7h16"/><path d="M4 7l-3 7a4 3 0 0 0 6 0zM20 7l-3 7a4 3 0 0 0 6 0z"/></svg>',
    dr: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>',
    cr: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 12h14"/></svg>',
    swap: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  };
  const PCOL = ['#1D4ED8', '#FF7A1A', '#14B8A6', '#8B3DFF'];
  const lowFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

  // ---------------------------------------------------------------- the view
  function mount(root, cfg, api) {
    const lang = () => (api.lang ? api.lang() : 'en');
    const hi = () => lang() === 'hi';
    const tr = (x) => api.t(x);
    const H = (x) => esc(api.t(x));
    const m = cfg.mode;
    const accs = accountsOf(cfg);
    const tx = txOf(cfg);
    const byId = Object.fromEntries(tx.map((x) => [x.id, x]));
    const nm = (id) => (id === 'closing-stock' ? T2('Closing stock', 'अंतिम स्टॉक') : accs[id] ? accs[id].n : T2(id, id));
    const acT = (id) => (hi() ? `${tr(nm(id))} खाता` : `${tr(nm(id))} A/c`);
    const toT = (id) => (hi() ? `${tr(nm(id))} खाता` : `To ${tr(nm(id))} A/c`);
    const byT = (id) => (hi() ? `${tr(nm(id))} खाता` : `By ${tr(nm(id))} A/c`);
    const cdT = (side) => (hi() ? 'शेष आगे ले गए (c/d)' : side === 'dr' ? 'To Balance c/d' : 'By Balance c/d');
    const bdT = (side) => (hi() ? 'शेष आगे लाए (b/d)' : side === 'dr' ? 'To Balance b/d' : 'By Balance b/d');
    const DR = () => H(T2('Dr.', 'नाम')), CR = () => H(T2('Cr.', 'जमा'));
    const S = { sel: null, acc: null, dr: null, cr: null, done: {}, legs: {}, tries: {}, msg: null, q: null, rules: cfg.rules || 'modern', closed: false, step: 0, yclosed: 0, compare: false, place: {}, ratio: null, shown: {}, fresh: {}, tilt: 0 };
    const stops = [], timers = [];
    let fx = [];
    root.innerHTML = `<div class="lg"><header class="lg-top"></header><div class="lg-grid"><section class="lg-side"></section><section class="lg-main"><div class="lg-work"></div><div class="lg-bar" role="group"></div><div class="lg-live" aria-live="polite"></div><div class="lg-q" hidden></div></section></div><div class="lg-fx" aria-hidden="true"></div></div>`;
    const $ = (s) => root.querySelector(s);
    const shell = $('.lg'), top = $('.lg-top'), side = $('.lg-side'), work = $('.lg-work'), bar = $('.lg-bar'), live = $('.lg-live'), qbox = $('.lg-q'), fxl = $('.lg-fx');
    const later = (ms, f) => { timers.push(setTimeout(f, L.reducedMotion() ? Math.min(ms, 60) : ms)); };
    const say = (tone, f) => { S.msg = { tone, f }; };
    const toast = (x) => api.toast(x);
    const allDone = () => tx.every((x) => S.done[x.id]);
    const nextUndone = () => tx.find((x) => !S.done[x.id]);

    // ---- shared pieces
    const btn = (key, label, cls, off, icon, extra) => `<button type="button" class="lg-btn ${cls || ''}" data-key="${key}" ${off ? 'aria-disabled="true"' : ''} ${extra || ''}>${icon || ''}<span>${H(label)}</span></button>`;
    function txnCard(x, o) {
      o = o || {};
      return `<button type="button" class="lg-txn ${o.done ? 'done' : ''}" data-key="txn:${esc(x.id)}" aria-pressed="${S.sel === x.id}">
        <span class="lg-d">${esc(fmtD(x.date, lang(), true))}</span><span class="lg-x">${H(x.text)}</span><span class="lg-a">${inr(x.p)}</span>${o.sub ? `<span class="lg-sub">${o.sub}</span>` : ''}${o.done ? `<span class="lg-tick" aria-hidden="true">✓</span><span class="lg-sr">${H(T2('done', 'पूरा'))}</span>` : ''}</button>`;
    }
    const txnList = (o, title) => `<h4 class="lg-h">${H(title || T2('Transactions', 'लेन-देन'))}</h4><div class="lg-txns">${tx.map((x) => txnCard(x, o ? o(x) : {})).join('')}</div>`;
    const chip = (id, o) => { o = o || {}; const a = accs[id] || { type: 'asset' }; return `<button type="button" class="lg-chip ${o.cls || ''}" data-key="account:${esc(id)}" aria-pressed="${!!o.on}" style="--c:${o.col || TYPE_COL[a.type] || '#94A3B8'}"><i aria-hidden="true"></i><span>${H(nm(id))}</span>${o.extra || ''}</button>`; };
    const row = (r) => `<div class="lg-r ${r.cls || ''}">${r.date ? `<span class="dt">${esc(fmtD(r.date, lang(), true))}</span>` : ''}<span class="p">${r.text}</span><span class="a">${r.p == null ? '' : r.paren ? '(' + amt(r.p) + ')' : amt(r.p)}</span></div>`;
    // A T-shaped account: rows [{ side: 'dr'|'cr', date?, text (HTML), p }], o.tot: both totals, o.after: rows below the totals.
    function tAcc(title, rows, o) {
      o = o || {};
      const dr = rows.filter((r) => r.side === 'dr'), cr = rows.filter((r) => r.side === 'cr');
      const empty = `<div class="lg-empty">${H(T2('nothing yet', 'अभी कुछ नहीं'))}</div>`;
      const aft = o.after && o.after.length ? `<div class="lg-t-after"><div class="lg-t-s">${o.after.filter((r) => r.side === 'dr').map(row).join('')}</div><div class="lg-t-s cr">${o.after.filter((r) => r.side === 'cr').map(row).join('')}</div></div>` : '';
      const tot = o.tot ? `<div class="lg-t-f"><span>${amt(o.tot[0])}</span><span>${amt(o.tot[1])}</span></div>` : '';
      return `<div class="lg-t ${o.cls || ''}" ${o.key ? `data-key="${esc(o.key)}" role="button" tabindex="0" aria-label="${esc(o.label || title)}"` : ''}><div class="lg-t-h"><span>${o.l || DR()}</span><b>${esc(title)}</b><span class="cr">${o.r || CR()}</span></div><div class="lg-t-b"><div class="lg-t-s">${dr.length ? dr.map(row).join('') : o.noEmpty ? '' : empty}</div><div class="lg-t-s cr">${cr.length ? cr.map(row).join('') : o.noEmpty ? '' : empty}</div></div>${tot}${aft}</div>`;
    }
    // A multiple-choice question; opts [{ l: label (text or {en,hi}), right, why? }]
    function numOpts(right, wrongs, fmt) {
      fmt = fmt || inr;
      const vals = [right];
      wrongs.forEach((w) => { if (typeof w === 'number' && isFinite(w) && !vals.some((v) => fmt(v) === fmt(w))) vals.push(w); });
      let k = 1;
      while (vals.length < 3 && k < 20) { const step = Math.max(100, Math.round(Math.abs(right) / 1000) * 100); const v = right + step * (k % 2 ? k : -k); if (!vals.some((x) => fmt(x) === fmt(v))) vals.push(v); k++; }
      const opts = vals.slice(0, 4).map((v) => ({ l: fmt(v), right: v === right }));
      const r = Math.abs(Math.round(right / 100)) % opts.length;
      return opts.slice(r).concat(opts.slice(0, r));
    }
    function ask(q, opts, why, extra) { S.q = Object.assign({ q, opts, why, picked: [], done: false }, extra || {}); }
    function qHTML() {
      const q = S.q;
      const lab = (o) => (typeof o.l === 'string' ? esc(o.l) : H(o.l));
      return `<p class="lg-qq">${H(q.q)}</p><div class="lg-opts" role="group" aria-label="${H(T2('Choose an answer', 'उत्तर चुनो'))}">${q.opts.map((o, i) => `<button type="button" class="lg-opt ${q.picked.includes(i) ? (o.right ? 'right' : 'wrong') : ''}" data-key="answer" data-opt="${i}" ${q.done && !o.right ? 'aria-disabled="true"' : ''}>${lab(o)}</button>`).join('')}</div>${q.fb ? `<p class="lg-fb">${q.fb()}</p>` : ''}`;
    }
    function answer(i) {
      const q = S.q;
      if (!q || q.done || q.picked.includes(i) || !q.opts[i]) return;
      q.picked.push(i);
      const o = q.opts[i];
      if (o.right) {
        q.done = true;
        q.fb = () => `<b>${H(T2('Right!', 'सही!'))}</b> ${q.why ? q.why() : ''}`;
        api.emit('answered:right');
        api.record(tr(T2('Answered right: ', 'सही उत्तर: ')) + tr(q.q));
        if (q.onRight) q.onRight();
      } else {
        q.fb = () => `<b>${H(T2('Not quite.', 'अभी नहीं।'))}</b> ${o.why ? o.why() : H(q.hint || T2('Look again and try another answer.', 'फिर से देखो और दूसरा उत्तर चुनो।'))}`;
        api.emit('answered:wrong');
        if (q.onWrong) q.onWrong(o);
      }
      render();
    }
    const rectOf = (sel) => { const el = root.querySelector(sel); return el ? el.getBoundingClientRect() : null; };
    function fly(fromSel, toSel, text, cls, delay) { fx.push({ from: rectOf(fromSel), to: toSel, text, cls, delay: delay || 0 }); }
    function runFx() {
      const list = fx; fx = [];
      if (L.reducedMotion() || !list.length) return;
      const base = shell.getBoundingClientRect();
      list.forEach((f) => {
        const to = root.querySelector(f.to);
        if (!f.from || !to) return;
        const t = to.getBoundingClientRect();
        const x0 = f.from.left - base.left + f.from.width / 2, y0 = f.from.top - base.top + f.from.height / 2;
        const x1 = t.left - base.left + t.width / 2, y1 = t.top - base.top + t.height / 2;
        const chipEl = document.createElement('div');
        chipEl.className = 'lg-fly ' + (f.cls || '');
        chipEl.textContent = f.text;
        chipEl.style.transform = `translate(${x0}px,${y0}px) translate(-50%,-50%)`;
        chipEl.style.opacity = f.delay ? '0' : '1';
        fxl.appendChild(chipEl);
        to.classList.add('lg-wait');
        timers.push(setTimeout(() => {
          chipEl.style.opacity = '1';
          stops.push(L.tween(760, (k) => { const e = L.ease(k); chipEl.style.transform = `translate(${x0 + (x1 - x0) * e}px,${y0 + (y1 - y0) * e - Math.sin(Math.PI * e) * 46}px) translate(-50%,-50%) scale(${1 - 0.18 * e})`; },
            () => { chipEl.remove(); to.classList.remove('lg-wait'); to.classList.add('lg-land'); }));
        }, f.delay));
      });
    }
    const progress = () => (V.progress ? V.progress() : null);
    function head() {
      const biz = cfg.business ? tr(cfg.business) : tr(T2('My business', 'मेरा व्यापार'));
      const pr = progress();
      return `${BOOK}<div class="lg-ttl"><p class="lg-biz">${esc(biz)}</p><h3>${H(MODE_NAME[m])}</h3></div>${pr ? `<div class="lg-prog" role="img" aria-label="${pr[0]} / ${pr[1]}"><b>${pr[0]}</b> / ${pr[1]}<i style="--w:${pr[1] ? (pr[0] / pr[1]) * 100 : 0}%"></i></div>` : ''}`;
    }
    let V = null;
    const narrow = () => (root.clientWidth || 800) < 560;
    function render() {
      const act = document.activeElement;
      const fk = act && root.contains(act) && act.dataset && act.dataset.key ? [act.dataset.key, act.dataset.opt] : null;
      top.innerHTML = head();
      side.innerHTML = V.side();
      work.innerHTML = V.work();
      bar.innerHTML = V.bar();
      live.className = 'lg-live' + (S.msg ? ' ' + S.msg.tone : '');
      live.innerHTML = S.msg ? S.msg.f() : `<p class="lg-hint">${H(MODE_HINT[m])}</p>`;
      qbox.hidden = !S.q;
      qbox.innerHTML = S.q ? qHTML() : '';
      if (fk) {
        const all = [...root.querySelectorAll(`[data-key="${fk[0]}"]`)];
        const el = all.find((x) => x.dataset.opt === fk[1]) || all[0];
        if (el) el.focus({ preventScroll: true });
      }
      runFx();
      if (V.after) V.after();
      S.fresh = {};
    }
    const mark = (k) => { S.fresh[k] = true; };
    const nw = (k) => (S.fresh[k] ? 'lg-new' : '');
    const ruleOf = (id, sd) => (S.rules === 'traditional' ? ruleTrad(accs[id], sd) : ruleModern(accs[id], sd));
    const legsHTML = (x) => `<ul><li>${H(ruleOf(x.debit, 'dr'))}</li><li>${H(ruleOf(x.credit, 'cr'))}</li></ul>`;
    const typeTag = (id) => { const a = accs[id]; return `<span class="lg-tag" style="--c:${TYPE_COL[a.type]}">${H(T2(a.type === 'revenue' ? 'income' : a.type, { asset: 'परिसंपत्ति', liability: 'देयता', capital: 'पूँजी', drawings: 'आहरण', expense: 'व्यय', revenue: 'आय' }[a.type]))}</span>`; };

    // ================================================================ equation
    const EQ = {
      totals() {
        const T = { A: 0, L: 0, C: 0 }, per = { A: {}, L: {}, C: {} };
        tx.filter((x) => S.done[x.id]).forEach((x) => [['dr', x.debit], ['cr', x.credit]].forEach(([sd, id]) => { const [g, d] = effect(accs[id], sd, x.p); T[g] += d; per[g][id] = (per[g][id] || 0) + d; }));
        return { T, per };
      },
      pre(x) { const p = { A: 0, L: 0, C: 0 }; if (x && !S.done[x.id]) [['dr', x.debit], ['cr', x.credit]].forEach(([sd, id]) => { const [g, d] = effect(accs[id], sd, x.p); p[g] += d; }); return p; },
      progress: () => [tx.filter((x) => S.done[x.id]).length, tx.length],
      side: () => txnList((x) => {
        if (!S.done[x.id]) return {};
        const p = { A: 0, L: 0, C: 0 };
        [['dr', x.debit], ['cr', x.credit]].forEach(([sd, id]) => { const [g, d] = effect(accs[id], sd, x.p); p[g] += d; });
        const lab = { A: T2('A', 'प'), L: T2('L', 'दे'), C: T2('C', 'पूँ') };
        return { done: true, sub: ['A', 'L', 'C'].filter((g) => p[g]).map((g) => `${H(lab[g])} ${p[g] > 0 ? '+' : '−'}${inr(Math.abs(p[g]))}`).join(' · ') };
      }),
      geo: () => (narrow() ? { W: 400, CX: 200, R: 122, f: 13 } : { W: 640, CX: 320, R: 190, f: 15 }),
      scale(T) {
        const { W, CX, R, f } = EQ.geo();
        const A0 = Math.max(T.A, 0), nL = A0 ? Math.round((7 * Math.max(T.L, 0)) / A0) : 0;
        const coins = (n, col, col2) => Array.from({ length: n }, (_, k) => `<ellipse cx="0" cy="${62 - k * 7}" rx="26" ry="7" fill="${k < (col2 ? col2[0] : 0) ? col2[1] : col}" stroke="rgba(6,18,51,.35)" stroke-width="1"/>`).join('');
        const pan = (id, x, lab, val, inner) => `<g id="${id}" transform="translate(${x} 70)"><path d="M0 0L-52 66M0 0L52 66" stroke="#64748B" stroke-width="1.5"/><g>${inner}</g><path d="M-62 66h124a62 16 0 0 1-124 0z" fill="url(#lg-pan)" stroke="#8C6A1F" stroke-width="1.5"/><text x="0" y="104" text-anchor="middle" class="lg-svl">${esc(lab)}</text><text x="0" y="126" text-anchor="middle" class="lg-svv">${esc(val)}</text></g>`;
        return `<svg class="lg-scale" viewBox="0 0 ${W} 300" role="img" aria-label="${esc(tr(T2('A balance: assets on the left, liabilities plus capital on the right.', 'तराज़ू: बाईं ओर परिसंपत्तियाँ, दाईं ओर देयताएँ और पूँजी।')))}">
          <defs><linearGradient id="lg-pan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE38A"/><stop offset="1" stop-color="#E0A526"/></linearGradient><linearGradient id="lg-pole" x1="0" x2="1"><stop offset="0" stop-color="#7C5A14"/><stop offset=".5" stop-color="#C9962E"/><stop offset="1" stop-color="#7C5A14"/></linearGradient></defs>
          <style>.lg-svl{font:800 ${f}px var(--font-body);fill:#1E3A8A}.lg-svv{font:800 ${f + 4}px var(--font-display);fill:#1E293B}</style>
          <ellipse cx="${CX}" cy="284" rx="110" ry="10" fill="rgba(6,18,51,.12)"/>
          <path d="M${CX - 60} 282h120l-18-28h-84z" fill="url(#lg-pole)"/><rect x="${CX - 7}" y="70" width="14" height="190" rx="5" fill="url(#lg-pole)"/>
          <g id="lg-beam"><rect x="${CX - R - 8}" y="64" width="${2 * R + 16}" height="12" rx="6" fill="url(#lg-pole)"/><circle cx="${CX - R}" cy="70" r="6" fill="#5B4210"/><circle cx="${CX + R}" cy="70" r="6" fill="#5B4210"/></g>
          <path d="M${CX} 50l-11 22h22z" fill="#5B4210"/><circle cx="${CX}" cy="64" r="9" fill="#FFD23F" stroke="#8C6A1F" stroke-width="2"/>
          ${pan('lg-pl', CX - R, tr(T2('Assets', 'परिसंपत्तियाँ')), inr(T.A), coins(A0 ? 7 : 0, '#02CFF9', null))}
          ${pan('lg-pr', CX + R, tr(T2('Liabilities + Capital', 'देयताएँ + पूँजी')), inr(T.L + T.C), coins(A0 ? 7 : 0, '#8B3DFF', [nL, '#FF6B57']))}
          <text x="${CX}" y="30" text-anchor="middle" class="lg-svl" style="font-size:17px">${esc(tr(T2('Assets = Liabilities + Capital', 'परिसंपत्तियाँ = देयताएँ + पूँजी')))}</text>
        </svg>`;
      },
      work() {
        const { T, per } = EQ.totals();
        const x = S.sel && byId[S.sel];
        const pre = EQ.pre(x);
        const box = (g, title, col) => {
          const ids = Object.keys(per[g]).filter((id) => per[g][id] !== 0);
          const tag = pre[g] ? `<span class="lg-pre ${pre[g] > 0 ? 'up' : 'dn'}">${pre[g] > 0 ? '+' : '−'}${inr(Math.abs(pre[g]))}</span>` : '';
          return `<div class="lg-box ${nw('box' + g)}" data-box="${g}" style="--c:${col}"><h6><span>${H(title)}</span>${tag}</h6><div class="tot">${inr(T[g])}</div><ul>${ids.map((id) => `<li><span>${H(nm(id))}</span><span>${per[g][id] < 0 ? '−' : ''}${amt(Math.abs(per[g][id]))}</span></li>`).join('')}</ul></div>`;
        };
        return `${EQ.scale(T)}<div class="lg-eq">${box('A', T2('Assets', 'परिसंपत्तियाँ'), '#7FE6FF')}<span class="op" aria-hidden="true">=</span>${box('L', T2('Liabilities', 'देयताएँ'), '#FFB4A8')}<span class="op" aria-hidden="true">+</span>${box('C', T2('Capital', 'पूँजी'), '#D7C2FF')}</div>`;
      },
      bar: () => btn('post', T2('Post to the equation', 'समीकरण में दर्ज करो'), 'go', allDone(), ICO.post),
      after() {
        if (!S.tilt) return;
        const tilt = S.tilt; S.tilt = 0;
        const beam = $('#lg-beam'), pl = $('#lg-pl'), pr = $('#lg-pr');
        if (!beam) return;
        const { CX, R } = EQ.geo();
        const pose = (deg) => { const r = (deg * Math.PI) / 180; beam.setAttribute('transform', `rotate(${deg} ${CX} 70)`); pl.setAttribute('transform', `translate(${CX - R * Math.cos(r)} ${70 - R * Math.sin(r)})`); pr.setAttribute('transform', `translate(${CX + R * Math.cos(r)} ${70 + R * Math.sin(r)})`); };
        stops.push(L.tween(1500, (k) => pose(k < 0.4 ? tilt * L.ease(k / 0.4) : tilt * (1 - L.ease((k - 0.4) / 0.6)) * Math.cos((k - 0.4) * 9)), () => pose(0)));
      },
      act(key) {
        if (key.startsWith('txn:')) {
          const id = key.slice(4);
          const x = byId[id];
          if (S.done[id]) { S.sel = null; say('info', () => `<p>${H(T2('Already posted. Its two effects:', 'यह दर्ज हो चुका है। इसके दो प्रभाव:'))}</p>${EQ.why(x)}`); render(); return; }
          S.sel = id;
          say('info', () => `<p>${H(x.text)} <b>${inr(x.p)}</b></p>${EQ.why(x)}<p>${H(T2('Tap Post to put it in the equation.', 'समीकरण में डालने के लिए दर्ज करो दबाओ।'))}</p>`);
          api.emit('selected:' + id);
          render();
        } else if (key === 'post') {
          const x = (S.sel && !S.done[S.sel] && byId[S.sel]) || nextUndone();
          if (!x) { toast(T2('Every transaction is already in the equation.', 'हर लेन-देन पहले से समीकरण में है।')); return; }
          const pre = EQ.pre(x);
          ['A', 'L', 'C'].forEach((g) => { if (pre[g]) { fly(`[data-key="txn:${x.id}"]`, `[data-box="${g}"] .tot`, (pre[g] > 0 ? '+' : '−') + inr(Math.abs(pre[g])), pre[g] > 0 ? '' : 'cr', g === 'A' ? 0 : 260); mark('box' + g); } });
          S.done[x.id] = true; S.sel = null;
          S.tilt = pre.A > 0 ? -8 : pre.A < 0 ? 8 : pre.L ? 3 : 0;
          const { T } = EQ.totals();
          api.record(tr(T2('Posted: ', 'दर्ज किया: ')) + tr(x.text));
          say('good', () => `<p><b>${H(T2('Still balanced!', 'फिर भी संतुलित!'))}</b> ${H(T2('Assets', 'परिसंपत्तियाँ'))} ${inr(T.A)} = ${H(T2('Liabilities', 'देयताएँ'))} ${inr(T.L)} + ${H(T2('Capital', 'पूँजी'))} ${inr(T.C)}</p>${EQ.why(x)}${allDone() ? `<p>${H(T2('Every transaction changes two things, so the two sides always stay equal.', 'हर लेन-देन दो चीज़ें बदलता है, इसलिए दोनों पक्ष हमेशा बराबर रहते हैं।'))}</p>` : ''}`);
          ask(T2(`Assets are ${inr(T.A)} and liabilities are ${inr(T.L)}. What is the capital now?`, `परिसंपत्तियाँ ${inr(T.A)} और देयताएँ ${inr(T.L)} हैं। अब पूँजी कितनी है?`),
            numOpts(T.C, [T.A + T.L, T.A, T.L]), () => H(T2(`Capital = Assets − Liabilities = ${inr(T.A)} − ${inr(T.L)} = ${inr(T.C)}.`, `पूँजी = परिसंपत्तियाँ − देयताएँ = ${inr(T.A)} − ${inr(T.L)} = ${inr(T.C)}।`)));
          api.emit('posted:' + x.id);
          later(1550, () => { api.emit('balanced'); if (allDone()) api.celebrate(); });
          render();
        }
      },
      why(x) {
        const li = [['dr', x.debit], ['cr', x.credit]].map(([sd, id]) => {
          const [g, d] = effect(accs[id], sd, x.p);
          const gn = { A: T2('assets', 'परिसंपत्तियाँ'), L: T2('liabilities', 'देयताएँ'), C: T2('capital', 'पूँजी') }[g];
          return `<li>${H(nm(id))} ${typeTag(id)}: ${H(gn)} ${d > 0 ? `<b class="lg-in">+${inr(d)}</b>` : `<b class="lg-out">−${inr(-d)}</b>`}</li>`;
        });
        return `<ul>${li.join('')}</ul>`;
      },
    };

    // ================================================================ journal
    const chipsJ = journalChips(cfg);
    const JR = {
      progress: () => [tx.filter((x) => S.done[x.id]).length, tx.length],
      side: () => txnList((x) => (S.done[x.id] ? { done: true, sub: `${esc(acT(x.debit))} ${DR()} · ${esc(toT(x.credit))}` } : {})),
      work() {
        const x = S.sel && byId[S.sel];
        const slot = (sd) => { const id = sd === 'dr' ? S.dr : S.cr; return `<button type="button" class="lg-slot ${sd} ${id ? 'full' : ''} ${S.acc ? 'ready' : ''}" data-key="${sd === 'dr' ? 'debit' : 'credit'}" data-slot="${sd}" ${S.acc ? '' : 'aria-disabled="true"'}><small>${H(sd === 'dr' ? T2('Debit (Dr) side', 'नाम (डेबिट) पक्ष') : T2('Credit (Cr) side', 'जमा (क्रेडिट) पक्ष'))}</small><b>${id ? esc(sd === 'dr' ? acT(id) + ' ' + tr(T2('Dr.', 'नाम')) : toT(id)) : S.acc ? H(T2(`put ${tr(nm(S.acc))} here`, `${tr(nm(S.acc))} यहाँ रखो`)) : '?'}</b></button>`; };
        const chips = `<div class="lg-chips" role="group" aria-label="${H(T2('Accounts', 'खाते'))}">${chipsJ.map((id) => chip(id, { on: S.acc === id })).join('')}</div>`;
        const steps = !x ? T2('1. Tap a transaction.', '1. कोई लेन-देन चुनो।') : !S.acc && !(S.dr && S.cr) ? T2('2. Tap an account below.', '2. नीचे कोई खाता चुनो।') : S.acc ? T2('3. Tap the Debit or the Credit box.', '3. नाम या जमा वाले खाने पर टैप करो।') : T2('4. Both filled: tap Record entry.', '4. दोनों भर गए: प्रविष्टि दर्ज करो दबाओ।');
        const draft = `<div class="lg-paper lg-draft">${x ? `<p class="lg-dx"><b>${esc(fmtD(x.date, lang()))}</b><span>${H(x.text)}</span><b>${inr(x.p)}</b></p>` : ''}<p class="lg-step">${H(steps)}</p><div class="lg-slots">${slot('dr')}${slot('cr')}</div>${chips}</div>`;
        const rows = tx.filter((y) => S.done[y.id]);
        const narr = (y) => (hi() ? `(${tr(y.text)})` : `(Being ${lowFirst(tr(y.text))})`);
        const body = rows.map((y) => `<tr class="${nw('j' + y.id)}" data-row="${esc(y.id)}"><td class="dt">${esc(fmtD(y.date, lang(), true))}</td><td>${esc(acT(y.debit))} <span class="lg-drw">${DR()}</span></td><td class="lf"></td><td class="n">${amt(y.p)}</td><td class="n"></td></tr><tr class="${nw('j' + y.id)}"><td></td><td class="ind">${esc(toT(y.credit))}</td><td class="lf"></td><td class="n"></td><td class="n">${amt(y.p)}</td></tr><tr class="nar"><td></td><td colspan="4">${esc(narr(y))}</td></tr>`).join('');
        const tot = rows.length ? `<tr class="tot"><td></td><td>${H(T2('Total', 'योग'))}</td><td class="lf"></td><td class="n">${amt(sum(rows.map((y) => y.p)))}</td><td class="n">${amt(sum(rows.map((y) => y.p)))}</td></tr>` : `<tr><td colspan="5" class="lg-empty">${H(T2('No entries yet.', 'अभी कोई प्रविष्टि नहीं।'))}</td></tr>`;
        return `${draft}<div class="lg-paper" id="lg-jbook"><h5>${H(T2('Journal', 'रोज़नामचा'))}<small>${esc(cfg.business ? tr(cfg.business) : '')}</small></h5><div class="lg-tbw"><table class="lg-tb"><thead><tr><th>${H(T2('Date', 'तिथि'))}</th><th>${H(T2('Particulars', 'विवरण'))}</th><th class="lf">${H(T2('L.F.', 'खा.पृ.'))}</th><th class="n">${H(T2('Dr ₹', 'नाम ₹'))}</th><th class="n">${H(T2('Cr ₹', 'जमा ₹'))}</th></tr></thead><tbody>${body}${tot}</tbody></table></div></div>`;
      },
      bar: () => btn('post', T2('Record entry', 'प्रविष्टि दर्ज करो'), 'go', allDone(), ICO.post)
        + btn('rules', S.rules === 'modern' ? T2('Rules: modern', 'नियम: आधुनिक') : T2('Rules: traditional', 'नियम: पारंपरिक'), 'ghost', false, ICO.swap),
      record(x, demo) {
        S.done[x.id] = true; mark('j' + x.id);
        fly('.lg-draft [data-slot="dr"]', `[data-row="${x.id}"]`, inr(x.p), '', 0);
        S.sel = null; S.dr = S.cr = S.acc = null;
        api.record(tr(T2('Journalised: ', 'रोज़नामचे में लिखा: ')) + tr(x.text));
        say('good', () => `<p><b>${H(demo ? T2('Here is how it is written:', 'इसे ऐसे लिखते हैं:') : T2('Correct entry!', 'सही प्रविष्टि!'))}</b> ${esc(acT(x.debit))} ${DR()} ${inr(x.p)} · ${esc(toT(x.credit))} ${inr(x.p)}</p>${legsHTML(x)}${allDone() ? `<p><b>${H(T2('Journal complete: total debits equal total credits.', 'रोज़नामचा पूरा: कुल नाम राशि कुल जमा राशि के बराबर है।'))}</b></p>` : ''}`);
        api.emit('journalised:' + x.id);
        if (!demo) api.emit('answered:right');
        if (allDone()) later(900, () => { api.emit('tallied'); api.celebrate(); });
      },
      act(key) {
        if (key.startsWith('txn:')) {
          const id = key.slice(4);
          if (S.done[id]) { toast(T2('This one is already in the journal.', 'यह पहले से रोज़नामचे में है।')); return; }
          S.sel = id; S.dr = S.cr = S.acc = null; S.msg = null;
          api.emit('selected:' + id);
        } else if (key.startsWith('account:')) {
          if (!S.sel) { toast(T2('Tap a transaction first.', 'पहले कोई लेन-देन चुनो।')); return; }
          S.acc = key.slice(8);
          say('info', () => `<p>${H(T2(`Now tap Debit or Credit for ${tr(nm(S.acc || ''))}.`, `अब ${tr(nm(S.acc || ''))} के लिए नाम या जमा दबाओ।`))}</p>`);
          api.emit('chose:' + S.acc);
        } else if (key === 'debit' || key === 'credit') {
          if (!S.acc) { toast(T2('Tap an account first.', 'पहले कोई खाता चुनो।')); return; }
          if (key === 'debit') { S.dr = S.acc; if (S.cr === S.acc) S.cr = null; } else { S.cr = S.acc; if (S.dr === S.acc) S.dr = null; }
          S.acc = null; S.msg = null;
          api.emit('side:' + key);
        } else if (key === 'post') {
          if (!S.sel) { const x = nextUndone(); if (!x) { toast(T2('The journal is complete.', 'रोज़नामचा पूरा है।')); return; } S.sel = x.id; S.dr = x.debit; S.cr = x.credit; render(); JR.record(x, true); render(); return; }
          const x = byId[S.sel];
          if (!S.dr || !S.cr) { toast(T2('Fill both the debit and the credit first.', 'पहले नाम और जमा दोनों भरो।')); return; }
          if (S.dr === x.debit && S.cr === x.credit) { JR.record(x, false); render(); return; }
          S.tries[x.id] = (S.tries[x.id] || 0) + 1;
          api.emit('answered:wrong');
          const swapped = S.dr === x.credit && S.cr === x.debit;
          const hint = swapped ? T2('You have the two accounts, but on the wrong sides.', 'दोनों खाते सही हैं, पर पक्ष उल्टे हैं।')
            : T2(`This transaction touches ${tr(nm(x.debit))} and ${tr(nm(x.credit))}.`, `यह लेन-देन ${tr(nm(x.debit))} और ${tr(nm(x.credit))} को छूता है।`);
          if (S.tries[x.id] >= 2) { S.dr = x.debit; S.cr = x.credit; say('bad', () => `<p><b>${H(T2('Not yet. Here is the rule:', 'अभी नहीं। नियम यह है:'))}</b></p>${legsHTML(x)}<p>${H(T2('The right accounts are in place now: tap Record entry.', 'सही खाते अब रख दिए गए हैं: प्रविष्टि दर्ज करो दबाओ।'))}</p>`); }
          else { if (S.dr !== x.debit) S.dr = null; if (S.cr !== x.credit) S.cr = null; if (swapped) { S.dr = S.cr = null; } say('bad', () => `<p><b>${H(T2('Not yet.', 'अभी नहीं।'))}</b> ${H(hint)} ${H(T2('Ask: which one comes in or goes up? Which one goes out or is owed?', 'सोचो: क्या आ रहा है या बढ़ रहा है? क्या जा रहा है या किसका देना है?'))}</p>`); }
        } else if (key === 'rules') {
          S.rules = S.rules === 'modern' ? 'traditional' : 'modern';
          api.emit('rules:' + S.rules);
          if (!S.msg) say('info', () => `<p>${H(S.rules === 'modern' ? T2('Modern rules: assets, expenses and drawings go up on the debit side; liabilities, capital and incomes go up on the credit side.', 'आधुनिक नियम: परिसंपत्तियाँ, व्यय और आहरण नाम पक्ष में बढ़ते हैं; देयताएँ, पूँजी और आय जमा पक्ष में बढ़ती हैं।') : T2('Traditional rules: personal, debit the receiver, credit the giver; real, debit what comes in, credit what goes out; nominal, debit expenses and losses, credit incomes and gains.', 'पारंपरिक नियम: व्यक्तिगत, पाने वाले को नाम, देने वाले को जमा; वास्तविक, जो आए उसे नाम, जो जाए उसे जमा; नाममात्र, व्यय-हानि नाम, आय-लाभ जमा।'))}</p>`);
        }
        render();
      },
    };

    // ================================================================ ledger
    const ledAccs = usedAccounts(tx);
    const LG = {
      posted: (x) => S.legs[x.id] && S.legs[x.id].dr && S.legs[x.id].cr,
      progress: () => [tx.filter((x) => LG.posted(x)).length, tx.length],
      side: () => txnList((x) => ({ done: LG.posted(x), sub: `${esc(acT(x.debit))} ${DR()} · ${esc(toT(x.credit))}` }), T2('Journal entries', 'रोज़नामचा प्रविष्टियाँ')),
      endDate: () => monthEnd(tx[tx.length - 1].date),
      rowsOf(id) {
        const rows = [];
        tx.forEach((x) => {
          const lg = S.legs[x.id] || {};
          if (lg.dr && x.debit === id) rows.push({ side: 'dr', date: x.date, text: esc(toT(x.credit)), p: x.p, cls: nw('l' + x.id + 'dr') });
          if (lg.cr && x.credit === id) rows.push({ side: 'cr', date: x.date, text: esc(byT(x.debit)), p: x.p, cls: nw('l' + x.id + 'cr') });
        });
        return rows;
      },
      balOf(id) { const r = LG.rowsOf(id); return sum(r.filter((x) => x.side === 'dr').map((x) => x.p)) - sum(r.filter((x) => x.side === 'cr').map((x) => x.p)); },
      work() {
        const x = S.sel && byId[S.sel];
        return `<div class="lg-ts">${ledAccs.map((id) => {
          const rows = LG.rowsOf(id);
          let o = { key: 'account:' + id, label: acT(id), cls: x && (x.debit === id || x.credit === id) ? '' : '' };
          if (S.closed) {
            const d = sum(rows.filter((r) => r.side === 'dr').map((r) => r.p)), c = sum(rows.filter((r) => r.side === 'cr').map((r) => r.p));
            const e = LG.endDate(), n = nextDay(e);
            if (d > c) { rows.push({ side: 'cr', date: e, text: esc(cdT('cr')), p: d - c, cls: 'bal ' + nw('close') }); o.after = [{ side: 'dr', date: n, text: esc(bdT('dr')), p: d - c, cls: 'bal ' + nw('close') }]; }
            if (c > d) { rows.push({ side: 'dr', date: e, text: esc(cdT('dr')), p: c - d, cls: 'bal ' + nw('close') }); o.after = [{ side: 'cr', date: n, text: esc(bdT('cr')), p: c - d, cls: 'bal ' + nw('close') }]; }
            o.tot = [Math.max(d, c), Math.max(d, c)];
          }
          return tAcc(acT(id), rows, Object.assign(o, { cls: 'lg-acct' }));
        }).join('').replace(/<div class="lg-t lg-acct"/g, '<div class="lg-t lg-acct"')}</div>`;
      },
      bar: () => btn('post', T2('Post the entry', 'खतौनी करो'), 'go', tx.every(LG.posted), ICO.post) + btn('balance', T2('Balance the accounts', 'खाते संतुलित करो'), 'bal', !tx.every(LG.posted) || S.closed, ICO.bal),
      leg(x, sd) {
        S.legs[x.id] = S.legs[x.id] || {};
        S.legs[x.id][sd] = true;
        mark('l' + x.id + sd);
        const id = sd === 'dr' ? x.debit : x.credit;
        const rowsN = LG.rowsOf(id).length;
        fly(`[data-key="txn:${x.id}"]`, `[data-key="account:${id}"] .lg-t-s${sd === 'cr' ? '.cr' : ':not(.cr)'} .lg-r:nth-child(${LG.rowsOf(id).filter((r) => r.side === sd).length})`, inr(x.p), sd === 'cr' ? 'cr' : '', sd === 'cr' ? 220 : 0);
        return rowsN;
      },
      done(x) {
        S.sel = null;
        api.record(tr(T2('Posted to the ledger: ', 'खाता बही में खतौनी: ')) + tr(x.text));
        say('good', () => `<p><b>${H(T2('Posted!', 'खतौनी हो गई!'))}</b> ${H(T2(`${tr(nm(x.debit))} account, debit side: “${toT(x.credit)}”. ${tr(nm(x.credit))} account, credit side: “${byT(x.debit)}”. Each side names the other account.`, `${tr(nm(x.debit))} खाते के नाम पक्ष में ${tr(nm(x.credit))} खाता, और ${tr(nm(x.credit))} खाते के जमा पक्ष में ${tr(nm(x.debit))} खाता लिखा गया। हर पक्ष में दूसरे खाते का नाम लिखते हैं।`))}</p>${tx.every(LG.posted) ? `<p>${H(T2('All entries posted. Now balance the accounts.', 'सब प्रविष्टियों की खतौनी हो गई। अब खाते संतुलित करो।'))}</p>` : ''}`);
        api.emit('posted:' + x.id);
      },
      act(key) {
        if (key.startsWith('txn:')) {
          const id = key.slice(4);
          if (LG.posted(byId[id])) { toast(T2('This entry is already posted.', 'इस प्रविष्टि की खतौनी हो चुकी है।')); return; }
          S.sel = id; S.msg = null;
          say('info', () => `<p>${H(T2('Now tap the two accounts of this entry: first the one debited, then the one credited.', 'अब इस प्रविष्टि के दोनों खाते टैप करो: पहले नाम वाला, फिर जमा वाला।'))}</p>`);
          api.emit('selected:' + id);
        } else if (key.startsWith('account:')) {
          const id = key.slice(8);
          if (!S.sel) { toast(T2('Tap a journal entry first.', 'पहले कोई प्रविष्टि चुनो।')); return; }
          const x = byId[S.sel];
          const lg = S.legs[x.id] || {};
          if (id === x.debit && !lg.dr) LG.leg(x, 'dr');
          else if (id === x.credit && !lg.cr) LG.leg(x, 'cr');
          else if (id === x.debit || id === x.credit) { toast(T2('That side is already posted.', 'वह पक्ष पहले ही दर्ज है।')); return; }
          else { api.emit('answered:wrong'); say('bad', () => `<p>${H(T2(`${tr(nm(id))} is not in this entry. It debits ${tr(nm(x.debit))} and credits ${tr(nm(x.credit))}.`, `${tr(nm(id))} इस प्रविष्टि में नहीं है। इसमें ${tr(nm(x.debit))} नाम और ${tr(nm(x.credit))} जमा है।`))}</p>`); render(); return; }
          if (LG.posted(x)) LG.done(x); else say('info', () => `<p>${H(T2('One side done. Now the other account.', 'एक पक्ष हो गया। अब दूसरा खाता।'))}</p>`);
        } else if (key === 'post') {
          const x = (S.sel && byId[S.sel]) || tx.find((y) => !LG.posted(y));
          if (!x) { toast(T2('Everything is posted.', 'सबकी खतौनी हो चुकी है।')); return; }
          S.sel = x.id;
          const lg = S.legs[x.id] || {};
          if (!lg.dr) LG.leg(x, 'dr');
          if (!lg.cr) LG.leg(x, 'cr');
          LG.done(x);
        } else if (key === 'balance') {
          if (!tx.every(LG.posted)) { toast(T2('Post every entry first.', 'पहले हर प्रविष्टि की खतौनी करो।')); return; }
          if (S.closed) { toast(T2('The accounts are already balanced.', 'खाते पहले ही संतुलित हैं।')); return; }
          S.closed = true; mark('close');
          const big = ledAccs.slice().sort((a, b) => LG.rowsOf(b).length - LG.rowsOf(a).length)[0];
          const bal = LG.balOf(big);
          const d = sum(LG.rowsOf(big).filter((r) => r.side === 'dr').map((r) => r.p));
          const lab = (p, sd) => T2(`${inr(p)} ${sd === 'dr' ? 'debit' : 'credit'} balance`, `${inr(p)} ${sd === 'dr' ? 'नाम' : 'जमा'} शेष`);
          const right = lab(Math.abs(bal), bal >= 0 ? 'dr' : 'cr');
          const opts = [{ l: right, right: true }, { l: lab(Math.abs(bal), bal >= 0 ? 'cr' : 'dr') }];
          if (d !== Math.abs(bal)) opts.push({ l: lab(d, 'dr') });
          ask(T2(`What is the balance of the ${tr(nm(big))} account?`, `${tr(nm(big))} खाते का शेष क्या है?`), Math.abs(bal) % 2 ? opts : opts.reverse(), () => H(T2('The balance is the difference between the two sides, and it is named after the bigger side.', 'शेष दोनों पक्षों का अंतर है, और इसका नाम बड़े पक्ष के नाम पर होता है।')));
          say('good', () => `<p><b>${H(T2('Balanced!', 'संतुलित!'))}</b> ${H(T2('On the smaller side we write “Balance c/d” so both sides total the same. Next period it comes back as “Balance b/d”.', 'छोटे पक्ष में “शेष आगे ले गए” लिखते हैं ताकि दोनों पक्षों का योग बराबर हो। अगली अवधि में यह “शेष आगे लाए” बनकर लौटता है।'))}</p>`);
          api.record(tr(T2('Balanced the ledger', 'खाते संतुलित किए')));
          later(500, () => { api.emit('balanced'); api.celebrate(); });
        }
        render();
      },
    };

    // ================================================================ cash book
    const isCB = (a) => a === 'cash' || a === 'bank';
    const twoCol = tx.some((x) => x.debit === 'bank' || x.credit === 'bank');
    const CBK = {
      kind: (x) => (isCB(x.debit) && isCB(x.credit) ? 'contra' : isCB(x.debit) ? 'in' : 'out'),
      progress: () => [tx.filter((x) => S.done[x.id]).length, tx.length],
      side: () => txnList((x) => (S.done[x.id] ? { done: true, sub: H(CBK.kind(x) === 'contra' ? T2('Contra entry: both sides (C)', 'विपरीत प्रविष्टि: दोनों पक्ष (C)') : CBK.kind(x) === 'in' ? T2('Receipt (Dr side)', 'प्राप्ति (नाम पक्ष)') : T2('Payment (Cr side)', 'भुगतान (जमा पक्ष)')) } : {})),
      tot() {
        const t = { rc: 0, rb: 0, pc: 0, pb: 0 };
        tx.filter((x) => S.done[x.id]).forEach((x) => { if (x.debit === 'cash') t.rc += x.p; if (x.debit === 'bank') t.rb += x.p; if (x.credit === 'cash') t.pc += x.p; if (x.credit === 'bank') t.pb += x.p; });
        return t;
      },
      work() {
        const R = [], Pm = [];
        tx.filter((x) => S.done[x.id]).forEach((x) => {
          const c = nw('c' + x.id);
          if (isCB(x.debit)) R.push({ date: x.date, text: esc(toT(x.credit)) + (isCB(x.credit) ? ' (C)' : ''), cash: x.debit === 'cash' ? x.p : null, bank: x.debit === 'bank' ? x.p : null, cls: c, id: x.id });
          if (isCB(x.credit)) Pm.push({ date: x.date, text: esc(byT(x.debit)) + (isCB(x.debit) ? ' (C)' : ''), cash: x.credit === 'cash' ? x.p : null, bank: x.credit === 'bank' ? x.p : null, cls: c, id: x.id });
        });
        const t = CBK.tot();
        let after = { r: [], p: [] }, totals = null;
        if (S.closed) {
          const e = monthEnd(tx[tx.length - 1].date), n = nextDay(e);
          const cashB = t.rc - t.pc, bankB = t.rb - t.pb;
          if (cashB > 0) { Pm.push({ date: e, text: esc(cdT('cr')), cash: cashB, cls: 'bal ' + nw('close') }); after.r.push({ date: n, text: esc(bdT('dr')), cash: cashB, cls: 'bal' }); }
          if (twoCol && bankB > 0) { Pm.push({ date: e, text: esc(cdT('cr')), bank: bankB, cls: 'bal ' + nw('close') }); after.r.push({ date: n, text: esc(bdT('dr')), bank: bankB, cls: 'bal' }); }
          if (twoCol && bankB < 0) { R.push({ date: e, text: esc(cdT('dr')) + ' ' + H(T2('(overdraft)', '(अधिविकर्ष)')), bank: -bankB, cls: 'bal ' + nw('close') }); after.p.push({ date: n, text: esc(bdT('cr')), bank: -bankB, cls: 'bal' }); }
          totals = { cash: Math.max(t.rc, t.pc), bank: Math.max(t.rb, t.pb) };
        }
        const nRows = Math.max(R.length, Pm.length);
        const cols = twoCol ? 2 : 1;
        const tbl = (rows, aft, sd) => {
          const pad = Array.from({ length: nRows - rows.length }, () => `<tr class="pad"><td colspan="${3 + cols}">.</td></tr>`).join('');
          const tr2 = (r) => `<tr class="${r.cls || ''}" ${r.id ? `data-row="${sd}${esc(r.id)}"` : ''}><td class="dt">${esc(fmtD(r.date, lang(), true))}</td><td>${r.text}</td><td class="lf"></td><td class="n">${r.cash != null ? amt(r.cash) : ''}</td>${twoCol ? `<td class="n">${r.bank != null ? amt(r.bank) : ''}</td>` : ''}</tr>`;
          return `<table class="lg-tb"><thead><tr><th>${H(T2('Date', 'तिथि'))}</th><th>${H(T2('Particulars', 'विवरण'))}</th><th class="lf">${H(T2('L.F.', 'खा.पृ.'))}</th><th class="n">${H(T2('Cash ₹', 'रोकड़ ₹'))}</th>${twoCol ? `<th class="n">${H(T2('Bank ₹', 'बैंक ₹'))}</th>` : ''}</tr></thead><tbody>${rows.length ? rows.map(tr2).join('') : `<tr><td colspan="${3 + cols}" class="lg-empty">${H(T2('nothing yet', 'अभी कुछ नहीं'))}</td></tr>`}${pad}${totals ? `<tr class="tot"><td></td><td>${H(T2('Total', 'योग'))}</td><td class="lf"></td><td class="n">${amt(totals.cash)}</td>${twoCol ? `<td class="n">${amt(totals.bank)}</td>` : ''}</tr>${aft.map(tr2).join('')}` : ''}</tbody></table>`;
        };
        return `<div class="lg-paper"><h5>${H(twoCol ? T2('Cash book (cash and bank columns)', 'रोकड़ बही (रोकड़ और बैंक खाने)') : T2('Simple cash book', 'साधारण रोकड़ बही'))}</h5><div class="lg-cb"><div><div class="lg-cbh">${H(T2('Dr. — Receipts (money in)', 'नाम — प्राप्तियाँ (आया पैसा)'))}</div><div class="lg-tbw" data-cb="dr">${tbl(R, after.r, 'r')}</div></div><div><div class="lg-cbh">${H(T2('Cr. — Payments (money out)', 'जमा — भुगतान (गया पैसा)'))}</div><div class="lg-tbw" data-cb="cr">${tbl(Pm, after.p, 'p')}</div></div></div></div>`;
      },
      bar: () => btn('debit', T2('Receipts side (Dr)', 'प्राप्ति पक्ष (नाम)'), 'dr', !S.sel, ICO.dr) + btn('credit', T2('Payments side (Cr)', 'भुगतान पक्ष (जमा)'), 'cr', !S.sel, ICO.cr) + btn('post', T2('Show me', 'मुझे दिखाओ'), 'go', allDone(), ICO.eye) + btn('balance', T2('Balance the cash book', 'रोकड़ बही संतुलित करो'), 'bal', !allDone() || S.closed, ICO.bal),
      why(x) {
        const k = CBK.kind(x);
        if (k === 'contra') return T2(`Money moves between cash and bank: it is a contra entry. It goes on both sides, marked (C).`, `पैसा रोकड़ और बैंक के बीच चलता है: यह विपरीत (कॉन्ट्रा) प्रविष्टि है। यह दोनों पक्षों में (C) लिखकर आती है।`);
        const where = isCB(x.debit) ? x.debit : x.credit;
        const w = where === 'cash' ? T2('cash', 'रोकड़') : T2('the bank', 'बैंक');
        return k === 'in' ? T2(`Money comes into ${w.en}, so it is a receipt: the debit (left) side.`, `पैसा ${w.hi} में आता है, इसलिए यह प्राप्ति है: नाम (बायाँ) पक्ष।`) : T2(`Money goes out of ${w.en}, so it is a payment: the credit (right) side.`, `पैसा ${w.hi} से जाता है, इसलिए यह भुगतान है: जमा (दायाँ) पक्ष।`);
      },
      put(x, demo) {
        S.done[x.id] = true; mark('c' + x.id); S.sel = null;
        if (isCB(x.debit)) fly(`[data-key="txn:${x.id}"]`, `[data-row="r${x.id}"]`, '+' + inr(x.p), '', 0);
        if (isCB(x.credit)) fly(`[data-key="txn:${x.id}"]`, `[data-row="p${x.id}"]`, '−' + inr(x.p), 'cr', 200);
        api.record(tr(T2('Cash book: ', 'रोकड़ बही: ')) + tr(x.text));
        say('good', () => `<p><b>${H(demo ? T2('Like this:', 'ऐसे:') : T2('Right side!', 'सही पक्ष!'))}</b> ${H(CBK.why(x))}</p>${allDone() ? `<p>${H(T2('All recorded. Now balance the cash book.', 'सब दर्ज हो गया। अब रोकड़ बही संतुलित करो।'))}</p>` : ''}`);
        api.emit('posted:' + x.id);
      },
      act(key) {
        if (key.startsWith('txn:')) {
          const id = key.slice(4);
          if (S.done[id]) { toast(T2('Already in the cash book.', 'यह पहले से रोकड़ बही में है।')); return; }
          S.sel = id; S.msg = null; api.emit('selected:' + id);
        } else if (key === 'debit' || key === 'credit') {
          if (!S.sel) { toast(T2('Tap a transaction first.', 'पहले कोई लेन-देन चुनो।')); return; }
          const x = byId[S.sel], k = CBK.kind(x);
          api.emit('side:' + key);
          if (k === 'contra' || (k === 'in') === (key === 'debit')) { if (!S.tries[x.id]) api.emit('answered:right'); CBK.put(x, false); }
          else { S.tries[x.id] = 1; api.emit('answered:wrong'); say('bad', () => `<p><b>${H(T2('Other side.', 'दूसरा पक्ष।'))}</b> ${H(CBK.why(x))}</p>`); }
        } else if (key === 'post') {
          const x = (S.sel && byId[S.sel]) || nextUndone();
          if (!x) { toast(T2('Everything is recorded.', 'सब दर्ज हो चुका है।')); return; }
          CBK.put(x, true);
        } else if (key === 'balance') {
          if (!allDone()) { toast(T2('Record every transaction first.', 'पहले हर लेन-देन दर्ज करो।')); return; }
          if (S.closed) { toast(T2('Already balanced.', 'पहले ही संतुलित है।')); return; }
          S.closed = true; mark('close');
          const t = CBK.tot();
          ask(T2('How much cash is in hand at the end?', 'अंत में हाथ में कितनी रोकड़ है?'), numOpts(t.rc - t.pc, [t.rc, t.pc, t.rc + t.pc]), () => H(T2(`Cash received ${inr(t.rc)} − cash paid ${inr(t.pc)} = ${inr(t.rc - t.pc)}. Cash can never be negative, so the cash balance is always on the debit side.`, `मिली रोकड़ ${inr(t.rc)} − दी गई रोकड़ ${inr(t.pc)} = ${inr(t.rc - t.pc)}। रोकड़ कभी ऋणात्मक नहीं होती, इसलिए रोकड़ शेष हमेशा नाम पक्ष में होता है।`)));
          say('good', () => `<p><b>${H(T2('Balanced!', 'संतुलित!'))}</b> ${H(T2('The closing balance is written on the smaller side as “Balance c/d”, and opens the next period as “Balance b/d”.', 'अंतिम शेष छोटे पक्ष में “शेष आगे ले गए” लिखा जाता है, और अगली अवधि “शेष आगे लाए” से शुरू होती है।'))}</p>`);
          later(500, () => { api.emit('balanced'); api.celebrate(); });
        }
        render();
      },
    };

    // ================================================================ trial balance
    const tbB = balancesOf(tx);
    const tbAccs = tbB.order.filter((id) => tbB.b[id] !== 0);
    const TB = {
      progress: () => [tbAccs.filter((id) => S.place[id]).length, tbAccs.length],
      side: () => `<h4 class="lg-h">${H(T2('Ledger balances', 'खातों के शेष'))}</h4><div class="lg-accs">${tbAccs.map((id) => `<button type="button" class="lg-acc ${S.place[id] ? 'done' : ''}" data-key="account:${esc(id)}" aria-pressed="${S.acc === id}" style="--c:${TYPE_COL[accs[id].type]}"><b>${H(nm(id))}</b><small>${H(T2('Dr total', 'नाम योग'))} ${inr(tbB.dr[id])} · ${H(T2('Cr total', 'जमा योग'))} ${inr(tbB.cr[id])}</small><em>${H(T2('Balance', 'शेष'))} ${inr(Math.abs(tbB.b[id]))}</em>${S.place[id] ? '<span class="lg-tick" aria-hidden="true">✓</span>' : ''}</button>`).join('')}</div>`,
      work() {
        const rows = tbAccs.filter((id) => S.place[id]);
        const d = sum(rows.filter((id) => tbB.b[id] > 0).map((id) => tbB.b[id])), c = sum(rows.filter((id) => tbB.b[id] < 0).map((id) => -tbB.b[id]));
        const e = monthEnd(tx[tx.length - 1].date);
        return `<div class="lg-paper"><h5>${H(T2('Trial balance', 'तलपट'))}<small>${H(T2('as on', 'तिथि'))} ${esc(fmtD(e, lang()))}</small></h5><div class="lg-tbw"><table class="lg-tb" id="lg-tbt"><thead><tr><th>${H(T2('S. No.', 'क्र.सं.'))}</th><th>${H(T2('Account', 'खाते का नाम'))}</th><th class="lf">${H(T2('L.F.', 'खा.पृ.'))}</th><th class="n">${H(T2('Dr ₹', 'नाम ₹'))}</th><th class="n">${H(T2('Cr ₹', 'जमा ₹'))}</th></tr></thead><tbody>${rows.length ? rows.map((id, i) => `<tr class="${nw('t' + id)}" data-row="${esc(id)}"><td>${i + 1}</td><td>${esc(acT(id))}</td><td class="lf"></td><td class="n">${tbB.b[id] > 0 ? amt(tbB.b[id]) : ''}</td><td class="n">${tbB.b[id] < 0 ? amt(-tbB.b[id]) : ''}</td></tr>`).join('') : `<tr><td colspan="5" class="lg-empty">${H(T2('Tap an account on the list to begin.', 'शुरू करने के लिए सूची से कोई खाता चुनो।'))}</td></tr>`}${S.closed ? `<tr class="tot ${nw('close')}"><td></td><td>${H(T2('Total', 'योग'))}</td><td class="lf"></td><td class="n">${amt(d)}</td><td class="n">${amt(c)}</td></tr>` : ''}</tbody></table></div></div>`;
      },
      bar: () => btn('debit', T2('Debit column', 'नाम कॉलम'), 'dr', !S.acc, ICO.dr) + btn('credit', T2('Credit column', 'जमा कॉलम'), 'cr', !S.acc, ICO.cr) + btn('post', T2('Show me', 'मुझे दिखाओ'), 'go', tbAccs.every((id) => S.place[id]), ICO.eye) + btn('balance', T2('Add up the columns', 'कॉलम जोड़ो'), 'bal', !tbAccs.every((id) => S.place[id]) || S.closed, ICO.bal),
      why(id) {
        const b = tbB.b[id];
        return T2(`${tr(nm(id))}: debits ${inr(tbB.dr[id])}, credits ${inr(tbB.cr[id])}. The ${b > 0 ? 'debit' : 'credit'} side is bigger, so it has a ${b > 0 ? 'debit' : 'credit'} balance of ${inr(Math.abs(b))}.`, `${tr(nm(id))}: नाम ${inr(tbB.dr[id])}, जमा ${inr(tbB.cr[id])}। ${b > 0 ? 'नाम' : 'जमा'} पक्ष बड़ा है, इसलिए ${inr(Math.abs(b))} का ${b > 0 ? 'नाम' : 'जमा'} शेष है।`);
      },
      put(id, demo) {
        S.place[id] = true; mark('t' + id); S.acc = null;
        fly(`[data-key="account:${id}"]`, `[data-row="${id}"]`, inr(Math.abs(tbB.b[id])), tbB.b[id] > 0 ? '' : 'cr');
        api.record(tr(T2('Trial balance: ', 'तलपट: ')) + tr(nm(id)));
        say('good', () => `<p><b>${H(demo ? T2('Like this:', 'ऐसे:') : T2('Right column!', 'सही कॉलम!'))}</b> ${H(TB.why(id))} ${typeTag(id)}</p>`);
        api.emit('posted:' + id);
      },
      act(key) {
        if (key.startsWith('account:')) {
          const id = key.slice(8);
          if (S.place[id]) { toast(T2('Already in the trial balance.', 'पहले से तलपट में है।')); return; }
          S.acc = id; S.msg = null; api.emit('chose:' + id);
        } else if (key === 'debit' || key === 'credit') {
          if (!S.acc) { toast(T2('Tap an account first.', 'पहले कोई खाता चुनो।')); return; }
          const id = S.acc;
          api.emit('side:' + key);
          if ((tbB.b[id] > 0) === (key === 'debit')) { if (!S.tries[id]) api.emit('answered:right'); TB.put(id, false); }
          else { S.tries[id] = 1; api.emit('answered:wrong'); say('bad', () => `<p><b>${H(T2('Look at its two totals.', 'इसके दोनों योग देखो।'))}</b> ${H(T2('The bigger side gives the balance its name.', 'बड़ा पक्ष ही शेष का नाम तय करता है।'))}</p>`); }
        } else if (key === 'post') {
          const id = S.acc || tbAccs.find((a) => !S.place[a]);
          if (!id) { toast(T2('Every balance is placed.', 'हर शेष रखा जा चुका है।')); return; }
          TB.put(id, true);
        } else if (key === 'balance') {
          if (!tbAccs.every((id) => S.place[id])) { toast(T2('Place every balance first.', 'पहले हर शेष रखो।')); return; }
          if (S.closed) { toast(T2('Already added up.', 'पहले ही जोड़ा जा चुका है।')); return; }
          S.closed = true; mark('close');
          const d = sum(tbAccs.filter((id) => tbB.b[id] > 0).map((id) => tbB.b[id]));
          ask(T2('What is the total of the debit column?', 'नाम कॉलम का योग कितना है?'), numOpts(d, [sum(tbAccs.map((id) => tbB.dr[id])), sum(tbAccs.map((id) => Math.abs(tbB.b[id])))]), () => H(T2('Both columns total the same: the trial balance agrees.', 'दोनों कॉलमों का योग बराबर है: तलपट मिल गया।')));
          say('good', () => `<p><b>${H(T2('The trial balance agrees!', 'तलपट मिल गया!'))}</b> ${H(T2(`Debit total ${inr(d)} = credit total ${inr(d)}. Every debit had an equal credit. (It can still hide some errors, such as a wrong account of the same side.)`, `नाम योग ${inr(d)} = जमा योग ${inr(d)}। हर नाम के बराबर जमा था। (फिर भी कुछ त्रुटियाँ छिप सकती हैं, जैसे सही पक्ष पर ग़लत खाता।)`))}</p>`);
          later(500, () => { api.emit('tallied'); api.celebrate(); });
        }
        render();
      },
    };

    // ================================================================ bank reconciliation
    const from = cfg.from || 'cash-book';
    const start = P(cfg.balance || 0);
    const BOOKN = { 'cash-book': T2('cash book', 'रोकड़ बही'), 'pass-book': T2('pass book', 'पास बुक') };
    const other = from === 'cash-book' ? 'pass-book' : 'cash-book';
    const BR = {
      progress: () => [tx.filter((x) => S.done[x.id]).length, tx.length],
      side: () => txnList((x) => ({ done: S.done[x.id], sub: `<span class="lg-tag" style="--c:${BRS[x.kind].book === 'cb' ? '#7FE6FF' : '#FFE38A'}">${H(BRS[x.kind].n)}</span>` }), T2('Items that differ', 'अंतर वाली मदें')),
      result: () => start + sum(tx.map((x) => brsSign(x.kind, from) * x.p)),
      balTxt: (p, book) => (p >= 0 ? T2(`Balance as per ${tr(BOOKN[book])}`, `${tr(BOOKN[book])} के अनुसार शेष`) : T2(`Overdraft as per ${tr(BOOKN[book])}`, `${tr(BOOKN[book])} के अनुसार अधिविकर्ष`)),
      work() {
        const mini = (book, col, title) => `<div class="lg-mini" style="--c:${col}"><h6><i></i>${H(title)}</h6>${tx.map((x) => { const inIt = BRS[x.kind].book === book; return `<div class="lg-mi ${inIt ? '' : 'ghost'}"><span>${H(inIt ? x.text : T2('not here yet', 'अभी यहाँ नहीं'))}</span><b>${inIt ? (BRS[x.kind].eff > 0 ? '+' : '−') + amt(x.p) : '…'}</b></div>`; }).join('')}</div>`;
        const rows = tx.filter((x) => S.done[x.id]);
        const res = BR.result();
        const e = monthEnd(tx[tx.length - 1].date);
        const startRow = `<tr><td>${H(BR.balTxt(start, from))}</td><td class="n">${start >= 0 ? amt(start) : ''}</td><td class="n">${start < 0 ? amt(-start) : ''}</td></tr>`;
        return `<div class="lg-two">${mini('cb', '#02CFF9', T2('Cash book (bank column)', 'रोकड़ बही (बैंक खाना)'))}${mini('pb', '#F5B90A', T2('Pass book (from the bank)', 'पास बुक (बैंक से)'))}</div>
          <div class="lg-paper" style="margin-top:12px"><h5>${H(T2('Bank reconciliation statement', 'बैंक समाधान विवरण'))}<small>${H(T2('as on', 'तिथि'))} ${esc(fmtD(e, lang()))}</small></h5><div class="lg-tbw"><table class="lg-tb"><thead><tr><th>${H(T2('Particulars', 'विवरण'))}</th><th class="n">${H(T2('Plus ₹', 'जोड़ें ₹'))}</th><th class="n">${H(T2('Minus ₹', 'घटाएँ ₹'))}</th></tr></thead><tbody>${startRow}${rows.map((x) => `<tr class="${nw('b' + x.id)}" data-row="${esc(x.id)}"><td>${H(brsSign(x.kind, from) > 0 ? T2('Add: ', 'जोड़ें: ') : T2('Less: ', 'घटाएँ: '))}${H(x.text)}</td><td class="n">${brsSign(x.kind, from) > 0 ? amt(x.p) : ''}</td><td class="n">${brsSign(x.kind, from) < 0 ? amt(x.p) : ''}</td></tr>`).join('')}${S.closed ? `<tr class="tot ${nw('close')}"><td>${H(BR.balTxt(res, other))}</td><td class="n" colspan="2">${amt(Math.abs(res))}</td></tr>` : ''}</tbody></table></div></div>`;
      },
      bar: () => btn('debit', T2('Add (+)', 'जोड़ें (+)'), 'dr', !S.sel, ICO.plus) + btn('credit', T2('Less (−)', 'घटाएँ (−)'), 'cr', !S.sel, ICO.minus) + btn('post', T2('Show me', 'मुझे दिखाओ'), 'go', allDone(), ICO.eye) + btn('balance', T2(`Find the ${tr(BOOKN[other])} balance`, `${tr(BOOKN[other])} का शेष निकालो`), 'bal', !allDone() || S.closed, ICO.bal),
      why(x) {
        const k = BRS[x.kind], s = brsSign(x.kind, from);
        const has = k.book === 'cb' ? T2(`Only the cash book shows this so far: it ${k.eff > 0 ? 'raised' : 'lowered'} the cash book balance, and the bank has not acted on it yet.`, `अभी यह केवल रोकड़ बही में है: इसने रोकड़ बही का शेष ${k.eff > 0 ? 'बढ़ाया' : 'घटाया'}, और बैंक ने अभी इस पर कार्य नहीं किया।`)
          : T2(`Only the pass book shows this so far: the bank ${k.eff > 0 ? 'added it to' : 'took it from'} the account, and the cash book does not have it yet.`, `अभी यह केवल पास बुक में है: बैंक ने इसे खाते में ${k.eff > 0 ? 'जोड़ा' : 'से घटाया'}, और रोकड़ बही में यह अभी नहीं है।`);
        const act = T2(`Starting from the ${tr(BOOKN[from])} balance, ${s > 0 ? 'add' : 'subtract'} it.`, `${tr(BOOKN[from])} के शेष से शुरू करके इसे ${s > 0 ? 'जोड़ो' : 'घटाओ'}।`);
        return `${H(has)} ${H(act)}`;
      },
      put(x, demo) {
        S.done[x.id] = true; mark('b' + x.id); S.sel = null;
        fly(`[data-key="txn:${x.id}"]`, `[data-row="${x.id}"]`, (brsSign(x.kind, from) > 0 ? '+' : '−') + inr(x.p), brsSign(x.kind, from) > 0 ? '' : 'cr');
        api.record(tr(T2('Reconciled: ', 'समाधान: ')) + tr(x.text));
        say('good', () => `<p><b>${H(demo ? T2('Like this:', 'ऐसे:') : T2('Right!', 'सही!'))}</b> ${BR.why(x)}</p>`);
        api.emit('posted:' + x.id);
      },
      act(key) {
        if (key.startsWith('txn:')) {
          const id = key.slice(4);
          if (S.done[id]) { toast(T2('Already in the statement.', 'पहले से विवरण में है।')); return; }
          S.sel = id; S.msg = null; api.emit('selected:' + id);
        } else if (key === 'debit' || key === 'credit') {
          if (!S.sel) { toast(T2('Tap an item first.', 'पहले कोई मद चुनो।')); return; }
          const x = byId[S.sel];
          api.emit('side:' + key);
          if ((brsSign(x.kind, from) > 0) === (key === 'debit')) { if (!S.tries[x.id]) api.emit('answered:right'); BR.put(x, false); }
          else { S.tries[x.id] = 1; api.emit('answered:wrong'); say('bad', () => `<p><b>${H(T2('Think again.', 'फिर सोचो।'))}</b> ${H(T2('Which book already has it? Did it make that balance bigger or smaller?', 'यह किस पुस्तक में पहले से है? इससे वह शेष बड़ा हुआ या छोटा?'))}</p>`); }
        } else if (key === 'post') {
          const x = (S.sel && byId[S.sel]) || nextUndone();
          if (!x) { toast(T2('Every item is in.', 'हर मद आ चुकी है।')); return; }
          BR.put(x, true);
        } else if (key === 'balance') {
          if (!allDone()) { toast(T2('Decide every item first.', 'पहले हर मद तय करो।')); return; }
          if (S.closed) { toast(T2('Already found.', 'पहले ही निकाला जा चुका है।')); return; }
          S.closed = true; mark('close');
          const res = BR.result();
          const flip = start - sum(tx.map((x) => brsSign(x.kind, from) * x.p));
          ask(T2(`What is the ${tr(BOOKN[other])} balance?`, `${tr(BOOKN[other])} का शेष क्या है?`), numOpts(res, [flip, start + sum(tx.map((x) => x.p))]), () => H(T2('Start from one book, then add or subtract only the items the other book does not have yet.', 'एक पुस्तक से शुरू करो, फिर केवल वे मदें जोड़ो या घटाओ जो दूसरी पुस्तक में अभी नहीं हैं।')));
          say('good', () => `<p><b>${H(T2('Reconciled!', 'समाधान हो गया!'))}</b> ${H(BR.balTxt(res, other))}: <b>${inr(Math.abs(res))}</b>. ${H(T2('The two books now explain each other.', 'अब दोनों पुस्तकें एक-दूसरे से मेल खाती हैं।'))}</p>`);
          later(500, () => { api.emit('balanced'); api.emit('tallied'); api.celebrate(); });
        }
        render();
      },
    };

    // ================================================================ depreciation
    const DP = {
      s: null, o: null,
      init() {
        DP.s = depSchedule(cfg);
        if (!(cfg.method !== 'wdv' && cfg.life)) DP.o = depSchedule(cfg, cfg.method === 'wdv' ? 'slm' : 'wdv');
      },
      progress: () => [S.yclosed, DP.s.rows.length],
      mname: (mm) => (mm === 'wdv' ? T2('Written down value method', 'क्रमागत ह्रास (WDV) पद्धति') : T2('Straight line method', 'सीधी रेखा (SLM) पद्धति')),
      side() {
        const s = DP.s;
        const basis = s.method === 'wdv' ? T2(`${cfg.rate}% a year on the book value`, `पुस्तक मूल्य पर ${cfg.rate}% वार्षिक`) : cfg.life ? T2(`(cost − scrap ${inr(s.scrap)}) ÷ ${cfg.life} years`, `(लागत − अवशेष ${inr(s.scrap)}) ÷ ${cfg.life} वर्ष`) : T2(`${cfg.rate}% a year on the cost`, `लागत पर ${cfg.rate}% वार्षिक`);
        return `<h4 class="lg-h">${H(T2('The asset', 'परिसंपत्ति'))}</h4><div class="lg-card"><h5>${H(nm(s.asset))}</h5><div class="lg-kv">${tx.map((x) => `<span>${esc(fmtD(x.date, lang(), true))} · ${H(x.text)}</span><b>${inr(x.p)}</b>`).join('')}<span><b style="text-align:left">${H(T2('Cost', 'लागत'))}</b></span><b>${inr(s.cost)}</b></div><p class="lg-muted">${H(T2('Installation and carriage are added to the cost.', 'स्थापना और ढुलाई लागत में जोड़े जाते हैं।'))}</p></div>
          <div class="lg-card"><h5>${H(DP.mname(s.method))}</h5><p class="lg-muted" style="margin:0">${H(basis)}</p><p class="lg-muted">${H(T2('Books close on 31 March. The first year counts only the months the asset was used.', 'खाते 31 मार्च को बंद होते हैं। पहले साल में केवल उपयोग वाले महीने गिने जाते हैं।'))}</p></div>`;
      },
      chart() {
        const s = DP.s, o = DP.o, n = s.rows.length;
        const W = narrow() ? 400 : 640, H0 = 290, top0 = 62, base = 236, max = s.cost;
        const slots = n + 1, slotW = (W - 60) / slots, bw = Math.min(64, slotW * 0.62);
        const xOf = (i) => 44 + slotW * i + slotW / 2;
        const yOf = (v) => base - ((base - top0) * Math.max(0, v)) / max;
        const lbl = (v) => { const r = Math.round(v / 100); if (slotW > 96 || r < 1000) return inr(r * 100); return r >= 1e7 ? '₹' + (r / 1e7).toFixed(2) + 'Cr' : r >= 1e5 ? '₹' + (r / 1e5).toFixed(2) + 'L' : '₹' + (r / 1e3).toFixed(1) + 'k'; };
        let bars = `<g><rect x="${xOf(0) - bw / 2}" y="${yOf(s.cost)}" width="${bw}" height="${base - yOf(s.cost)}" rx="8" fill="url(#lg-bv)"/><text x="${xOf(0)}" y="${yOf(s.cost) - 8}" text-anchor="middle" class="lg-cv">${esc(lbl(s.cost))}</text><text x="${xOf(0)}" y="${base + 20}" text-anchor="middle" class="lg-cx">${esc(tr(T2('Cost', 'लागत')))}</text><text x="${xOf(0)}" y="${base + 36}" text-anchor="middle" class="lg-cx2">${esc(fmtD(s.date, lang()))}</text></g>`;
        s.rows.forEach((r, i) => {
          const x = xOf(i + 1);
          const done = i < S.step;
          if (done) {
            const fresh = S.fresh['y' + r.n] ? 'lg-grow' : '';
            bars += `<g class="${fresh}"><rect x="${x - bw / 2}" y="${yOf(r.close)}" width="${bw}" height="${base - yOf(r.close)}" rx="8" fill="url(#lg-bv)"/><rect x="${x - bw / 2}" y="${yOf(r.open)}" width="${bw}" height="${Math.max(2, yOf(r.close) - yOf(r.open))}" rx="4" fill="url(#lg-dz)" stroke="#FF6B57" stroke-width="1.5"/></g>
              <text x="${x}" y="${yOf(r.open) - 8}" text-anchor="middle" class="lg-cd">−${esc(lbl(r.dep))}</text><text x="${x}" y="${Math.min(base - 8, yOf(r.close) + 18)}" text-anchor="middle" class="lg-cv" fill="#fff" style="fill:#fff">${esc(lbl(r.close))}</text>`;
          } else bars += `<rect x="${x - bw / 2}" y="${top0 + 40}" width="${bw}" height="${base - top0 - 40}" rx="8" fill="none" stroke="#94A3B8" stroke-dasharray="6 5" stroke-width="1.5"/><text x="${x}" y="${base - 12}" text-anchor="middle" class="lg-cx2">?</text>`;
          bars += `<text x="${x}" y="${base + 20}" text-anchor="middle" class="lg-cx" ${slotW < 44 ? 'style="font-size:10px"' : ''}>${esc(slotW < 60 ? r.fy.slice(2) : r.fy)}</text>`;
        });
        let cmp = '';
        if (S.compare && o) {
          const pts = [[xOf(0), yOf(o.cost)]].concat(o.rows.map((r, i) => [xOf(i + 1), yOf(Math.max(0, r.close))]));
          cmp = `<g class="${S.fresh.cmp ? 'lg-fade' : ''}"><polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#8B3DFF" stroke-width="3" stroke-dasharray="8 6"/>${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="#8B3DFF" stroke="#fff" stroke-width="2"/>`).join('')}<rect x="${W - 218}" y="6" width="206" height="24" rx="12" fill="#fff" stroke="#8B3DFF"/><text x="${W - 115}" y="23" text-anchor="middle" class="lg-cx" style="fill:#6D28D9">${esc(tr(T2(`- - if ${o.method === 'wdv' ? 'WDV' : 'SLM'} were used`, `- - यदि ${o.method === 'wdv' ? 'WDV' : 'SLM'} होती`)))}</text></g>`;
        }
        return `<svg class="lg-chart" viewBox="0 0 ${W} ${H0}" role="img" aria-label="${esc(tr(T2('Book value of the asset at the end of each year', 'हर वर्ष के अंत में परिसंपत्ति का पुस्तक मूल्य')))}"><defs><linearGradient id="lg-bv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2563EB"/><stop offset="1" stop-color="#1E3A8A"/></linearGradient><pattern id="lg-dz" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#FFE1DC"/><rect width="3" height="8" fill="#FF9C8C"/></pattern></defs>
          <style>.lg-cv{font:800 13px var(--font-display);fill:#1E293B}.lg-cd{font:800 12px var(--font-display);fill:#B42318}.lg-cx{font:700 12px var(--font-body);fill:#334155}.lg-cx2{font:600 10.5px var(--font-body);fill:#64748B}</style>
          <text x="16" y="24" class="lg-cx" style="font-size:13px;fill:#1E3A8A">${esc(tr(T2('Book value', 'पुस्तक मूल्य')))}</text>
          ${[0.25, 0.5, 0.75, 1].map((k) => `<line x1="40" x2="${W - 16}" y1="${yOf(max * k)}" y2="${yOf(max * k)}" stroke="rgba(30,58,138,.10)"/>`).join('')}<line x1="40" x2="${W - 16}" y1="${base}" y2="${base}" stroke="#1E3A8A" stroke-width="2"/>${bars}${cmp}</svg>`;
      },
      work() {
        const s = DP.s;
        const done = s.rows.slice(0, S.step);
        const tbl = `<div class="lg-paper"><h5>${H(T2('Depreciation schedule', 'मूल्यह्रास सारणी'))}</h5><div class="lg-tbw"><table class="lg-tb"><thead><tr><th>${H(T2('Year', 'वर्ष'))}</th><th class="n">${H(T2('Opening ₹', 'प्रारंभिक ₹'))}</th><th class="n">${H(T2('Depreciation ₹', 'मूल्यह्रास ₹'))}</th><th class="n">${H(T2('Closing ₹', 'अंतिम ₹'))}</th></tr></thead><tbody>${done.length ? done.map((r) => `<tr class="${nw('y' + r.n)}"><td>${esc(r.fy)}${r.months !== 12 ? ` <small>(${r.months} ${H(T2('months', 'महीने'))})</small>` : ''}</td><td class="n">${amt(r.open)}</td><td class="n">${amt(r.dep)}</td><td class="n">${amt(r.close)}</td></tr>`).join('') : `<tr><td colspan="4" class="lg-empty">${H(T2('Tap “Charge depreciation” for the first year.', 'पहले वर्ष के लिए “मूल्यह्रास लगाओ” दबाओ।'))}</td></tr>`}</tbody></table></div></div>`;
        let acct = '';
        if (S.step) {
          const r = s.rows[S.step - 1];
          const closed = S.yclosed >= S.step;
          const rows = [];
          if (r.n === 1) { const g = {}; tx.forEach((x) => { g[x.credit] = (g[x.credit] || 0) + x.p; }); Object.keys(g).forEach((c) => rows.push({ side: 'dr', date: s.date, text: esc(toT(c)), p: g[c] })); }
          else rows.push({ side: 'dr', date: `${r.end.slice(0, 4) - 1}-04-01`, text: esc(bdT('dr')), p: r.open });
          rows.push({ side: 'cr', date: r.end, text: esc(byT('depreciation')), p: r.dep, cls: nw('y' + r.n) });
          const o = {};
          if (closed) { rows.push({ side: 'cr', date: r.end, text: esc(cdT('cr')), p: r.close, cls: 'bal ' + nw('yc') }); o.tot = [r.open, r.open]; o.after = [{ side: 'dr', date: nextDay(r.end), text: esc(bdT('dr')), p: r.close, cls: 'bal' }]; }
          const je = `<div class="lg-paper"><h5>${H(T2('Journal entries', 'रोज़नामचा प्रविष्टियाँ'))} · ${esc(fmtD(r.end, lang()))}</h5><div class="lg-tbw"><table class="lg-tb"><tbody><tr class="${nw('y' + r.n)}"><td>${esc(acT('depreciation'))} <span class="lg-drw">${DR()}</span></td><td class="n">${amt(r.dep)}</td><td class="n"></td></tr><tr><td class="ind">${esc(toT(s.asset))}</td><td class="n"></td><td class="n">${amt(r.dep)}</td></tr><tr class="nar"><td colspan="3">${H(T2(`(Being depreciation charged for ${r.months} months)`, `(${r.months} महीनों का मूल्यह्रास लगाया)`))}</td></tr><tr><td>${H(T2('Profit and Loss A/c', 'लाभ-हानि खाता'))} <span class="lg-drw">${DR()}</span></td><td class="n">${amt(r.dep)}</td><td class="n"></td></tr><tr><td class="ind">${esc(toT('depreciation'))}</td><td class="n"></td><td class="n">${amt(r.dep)}</td></tr><tr class="nar"><td colspan="3">${H(T2('(Being depreciation transferred to the profit and loss account)', '(मूल्यह्रास लाभ-हानि खाते में हस्तांतरित)'))}</td></tr></tbody></table></div></div>`;
          acct = `<div class="lg-st" style="margin-top:12px"><div>${tAcc(`${acT(s.asset)} · ${r.fy}`, rows, o)}</div><div>${je}</div></div>`;
        }
        return `${DP.chart()}<div style="margin-top:12px">${tbl}</div>${acct}`;
      },
      bar: () => btn('post', S.step < DP.s.rows.length ? T2(`Charge depreciation: ${DP.s.rows[S.step].fy}`, `मूल्यह्रास लगाओ: ${DP.s.rows[S.step].fy}`) : T2('All years charged', 'सभी वर्ष हो गए'), 'go', S.step >= DP.s.rows.length || S.yclosed < S.step, ICO.post)
        + btn('balance', T2('Balance the asset account', 'परिसंपत्ति खाता संतुलित करो'), 'bal', !S.step || S.yclosed >= S.step, ICO.bal)
        + btn('method', T2(`Compare with ${DP.o && DP.o.method === 'wdv' ? 'WDV' : 'SLM'}`, `${DP.o && DP.o.method === 'wdv' ? 'WDV' : 'SLM'} से तुलना करो`), 'ghost', !DP.o, ICO.swap, `aria-pressed="${S.compare}"`),
      act(key) {
        const s = DP.s;
        if (key === 'post') {
          if (S.step >= s.rows.length) { toast(T2('Every year is charged.', 'हर वर्ष का मूल्यह्रास लग चुका है।')); return; }
          if (S.yclosed < S.step) { toast(T2('Balance this year’s account first.', 'पहले इस वर्ष का खाता संतुलित करो।')); return; }
          const r = s.rows[S.step];
          S.step++; mark('y' + r.n);
          const how = s.method === 'wdv' ? T2(`${inr(r.open)} × ${cfg.rate}%${r.months !== 12 ? ` × ${r.months}/12` : ''} = ${inr(r.dep)}`, `${inr(r.open)} × ${cfg.rate}%${r.months !== 12 ? ` × ${r.months}/12` : ''} = ${inr(r.dep)}`)
            : cfg.life ? T2(`(${inr(s.cost)} − ${inr(s.scrap)}) ÷ ${cfg.life}${r.months !== 12 ? ` × ${r.months}/12` : ''} = ${inr(r.dep)}`, `(${inr(s.cost)} − ${inr(s.scrap)}) ÷ ${cfg.life}${r.months !== 12 ? ` × ${r.months}/12` : ''} = ${inr(r.dep)}`)
              : T2(`${inr(s.cost)} × ${cfg.rate}%${r.months !== 12 ? ` × ${r.months}/12` : ''} = ${inr(r.dep)}`, `${inr(s.cost)} × ${cfg.rate}%${r.months !== 12 ? ` × ${r.months}/12` : ''} = ${inr(r.dep)}`);
          say('good', () => `<p><b>${esc(r.fy)}:</b> ${H(how)}</p><p>${H(s.method === 'wdv' ? T2('WDV charges a fixed rate on the falling book value, so the charge gets smaller each year.', 'WDV घटते पुस्तक मूल्य पर निश्चित दर लगाती है, इसलिए हर साल मूल्यह्रास कम होता है।') : T2('SLM charges the same amount every full year, so the book value falls in a straight line.', 'SLM हर पूरे वर्ष समान राशि लगाती है, इसलिए पुस्तक मूल्य सीधी रेखा में घटता है।'))}</p>`);
          api.record(tr(T2('Charged depreciation ', 'मूल्यह्रास लगाया ')) + r.fy);
          api.emit('posted:year-' + r.n);
        } else if (key === 'balance') {
          if (!S.step || S.yclosed >= S.step) { toast(T2('Charge this year’s depreciation first.', 'पहले इस वर्ष का मूल्यह्रास लगाओ।')); return; }
          S.yclosed = S.step; mark('yc');
          const r = s.rows[S.step - 1];
          say('good', () => `<p><b>${H(T2('Balanced!', 'संतुलित!'))}</b> ${H(T2(`Book value on ${fmtD(r.end, 'en')}: ${inr(r.close)}. It is carried down to start the next year.`, `${fmtD(r.end, 'hi')} को पुस्तक मूल्य: ${inr(r.close)}। यह अगले वर्ष की शुरुआत के लिए आगे ले जाया जाता है।`))}</p>`);
          if (S.yclosed === s.rows.length) {
            const last = s.rows[s.rows.length - 1];
            const flat = s.cost - s.rows[0].dep * s.rows.length;
            ask(T2(`What is the book value on ${fmtD(last.end, 'en')}?`, `${fmtD(last.end, 'hi')} को पुस्तक मूल्य कितना है?`), numOpts(last.close, [flat, last.open, DP.o ? Math.max(0, DP.o.rows[DP.o.rows.length - 1].close) : NaN]), () => H(T2('Book value = cost − all the depreciation charged so far.', 'पुस्तक मूल्य = लागत − अब तक लगा कुल मूल्यह्रास।')));
            later(500, () => api.celebrate());
          }
          later(450, () => api.emit('balanced'));
        } else if (key === 'method') {
          if (!DP.o) { toast(T2('Comparison needs a rate (not a life in years).', 'तुलना के लिए दर चाहिए (वर्षों में आयु नहीं)।')); return; }
          S.compare = !S.compare; mark('cmp');
          if (S.compare) { say('info', () => `<p>${H(DP.o.method === 'wdv' ? T2('The dashed line shows WDV at the same rate: a big charge early, smaller later, and it never reaches zero.', 'बिंदुदार रेखा उसी दर पर WDV दिखाती है: शुरू में अधिक, बाद में कम, और यह कभी शून्य नहीं होता।') : T2('The dashed line shows SLM at the same rate: the same charge every full year, falling in a straight line.', 'बिंदुदार रेखा उसी दर पर SLM दिखाती है: हर पूरे वर्ष समान राशि, सीधी रेखा में गिरावट।'))}</p>`); api.emit('compared'); }
        }
        render();
      },
    };

    // ================================================================ final accounts
    const faIt = m === 'final-accounts' ? faItems(cfg) : [];
    const faBal = Object.fromEntries(faIt.map((x) => [x.id, x.bal]));
    const FA_OPT = [
      { k: 'trading', l: T2('Trading account', 'व्यापार खाता') }, { k: 'pl', l: T2('Profit and loss account', 'लाभ-हानि खाता') },
      { k: 'bs', l: T2('Balance sheet', 'तुलन पत्र') }, { k: 'both', l: T2('Trading account and balance sheet', 'व्यापार खाता और तुलन पत्र') },
    ];
    const FA = {
      where: (id) => faPlace(id, faBal[id], accs),
      progress: () => [faIt.filter((x) => S.place[x.id]).length, faIt.length],
      side: () => `<h4 class="lg-h">${H(T2('Balances from the trial balance', 'तलपट से शेष'))}</h4><div class="lg-accs">${faIt.map((x) => { const a = accs[x.id]; const col = x.id === 'closing-stock' ? '#14B8A6' : TYPE_COL[a.type]; return `<button type="button" class="lg-acc ${S.place[x.id] ? 'done' : ''}" data-key="account:${esc(x.id)}" aria-pressed="${S.acc === x.id}" style="--c:${col}"><b>${H(x.n)}</b><em>${inr(Math.abs(x.bal))} <small>${H(x.id === 'closing-stock' ? T2('(given at the year end)', '(वर्ष के अंत में दिया)') : x.bal > 0 ? T2('Dr', 'नाम') : T2('Cr', 'जमा'))}</small></em>${S.place[x.id] ? '<span class="lg-tick" aria-hidden="true">✓</span>' : ''}</button>`; }).join('')}</div>`,
      calc() {
        const pl = (id) => S.place[id];
        const lines = { tDr: [], tCr: [], pDr: [], pCr: [], L: [], A: [] };
        const get = (id) => faBal[id] || 0;
        faIt.forEach((x) => {
          if (!pl(x.id)) return;
          const w = FA.where(x.id), b = x.bal, id = x.id, c = nw('f' + id);
          if (id === 'closing-stock') { lines.tCr.push({ id, text: H(T2('By Closing stock', 'अंतिम स्टॉक')), p: b, cls: c }); lines.A.push({ id: id + '-bs', text: H(nm(id)), p: b, cls: c }); return; }
          if (w === 'trading') {
            if (id === 'purchase-returns') lines.tDr.push({ id, text: H(T2('Less: Purchases returns', 'घटाएँ: क्रय वापसी')), p: b, paren: true, cls: 'sub ' + c });
            else if (id === 'sales-returns') lines.tCr.push({ id, text: H(T2('Less: Sales returns', 'घटाएँ: विक्रय वापसी')), p: -b, paren: true, cls: 'sub ' + c });
            else if (b > 0) lines.tDr.push({ id, text: esc(toT(id)), p: b, cls: c }); else lines.tCr.push({ id, text: esc(byT(id)), p: -b, cls: c });
          } else if (w === 'pl') { if (b > 0) lines.pDr.push({ id, text: esc(toT(id)), p: b, cls: c }); else lines.pCr.push({ id, text: esc(byT(id)), p: -b, cls: c }); }
          else if (id === 'drawings') lines.L.push({ id, text: H(T2('Less: Drawings', 'घटाएँ: आहरण')), p: -b, paren: true, cls: 'sub ' + c });
          else if (b < 0) lines.L.push({ id, text: H(nm(id)) + (accs[id].type === 'asset' ? ' ' + H(T2('(overdraft)', '(अधिविकर्ष)')) : ''), p: -b, cls: c });
          else lines.A.push({ id, text: H(nm(id)), p: b, cls: c });
        });
        const v = (arr) => sum(arr.map((l) => (l.paren ? -Math.abs(l.p) : l.p)));
        const order = (arr, first) => arr.sort((a, b) => (a.id === first ? -1 : b.id === first ? 1 : 0));
        order(lines.tDr, 'purchases'); if (lines.tDr.some((l) => l.id === 'purchase-returns')) { const i = lines.tDr.findIndex((l) => l.id === 'purchase-returns'); const r = lines.tDr.splice(i, 1)[0]; const j = lines.tDr.findIndex((l) => l.id === 'purchases'); lines.tDr.splice(j + 1, 0, r); }
        order(lines.tCr, 'sales'); if (lines.tCr.some((l) => l.id === 'sales-returns')) { const i = lines.tCr.findIndex((l) => l.id === 'sales-returns'); const r = lines.tCr.splice(i, 1)[0]; const j = lines.tCr.findIndex((l) => l.id === 'sales'); lines.tCr.splice(j + 1, 0, r); }
        order(lines.L, 'capital'); if (lines.L.some((l) => l.id === 'drawings')) { const i = lines.L.findIndex((l) => l.id === 'drawings'); const r = lines.L.splice(i, 1)[0]; const j = lines.L.findIndex((l) => l.id === 'capital'); lines.L.splice(j + 1, 0, r); }
        const gp = v(lines.tCr) - v(lines.tDr);
        const np = gp + v(lines.pCr) - v(lines.pDr);
        return { lines, gp, np, v, get };
      },
      work() {
        const { lines, gp, np, v } = FA.calc();
        const e = monthEnd(tx[tx.length - 1].date);
        const asRows = (arr, sd) => arr.map((l) => ({ side: sd, text: l.text, p: Math.abs(l.p), paren: l.paren, cls: l.cls }));
        let t1 = asRows(lines.tDr, 'dr').concat(asRows(lines.tCr, 'cr')), o1 = { noEmpty: false };
        let t2 = asRows(lines.pDr, 'dr').concat(asRows(lines.pCr, 'cr')), o2 = {};
        let t3 = asRows(lines.L, 'dr').concat(asRows(lines.A, 'cr')), o3 = { l: H(T2('Liabilities', 'देयताएँ')), r: H(T2('Assets', 'परिसंपत्तियाँ')) };
        if (S.closed) {
          const c = 'bal ' + nw('close');
          if (gp >= 0) t1.push({ side: 'dr', text: H(T2('To Gross profit c/d', 'सकल लाभ आगे ले गए')), p: gp, cls: c }); else t1.push({ side: 'cr', text: H(T2('By Gross loss c/d', 'सकल हानि आगे ले गए')), p: -gp, cls: c });
          o1.tot = [Math.max(v(lines.tDr) + Math.max(gp, 0), v(lines.tCr) + Math.max(-gp, 0)), Math.max(v(lines.tDr) + Math.max(gp, 0), v(lines.tCr) + Math.max(-gp, 0))];
          if (gp >= 0) t2.unshift({ side: 'cr', text: H(T2('By Gross profit b/d', 'सकल लाभ आगे लाए')), p: gp, cls: c }); else t2.unshift({ side: 'dr', text: H(T2('To Gross loss b/d', 'सकल हानि आगे लाए')), p: -gp, cls: c });
          if (np >= 0) t2.push({ side: 'dr', text: H(T2('To Net profit (to capital)', 'शुद्ध लाभ (पूँजी में)')), p: np, cls: c }); else t2.push({ side: 'cr', text: H(T2('By Net loss (to capital)', 'शुद्ध हानि (पूँजी में)')), p: -np, cls: c });
          const pt = Math.max(v(lines.pDr) + Math.max(-gp, 0) + Math.max(np, 0), v(lines.pCr) + Math.max(gp, 0) + Math.max(-np, 0));
          o2.tot = [pt, pt];
          const ci = t3.findIndex((r) => r.text === H(nm('capital')));
          const npRow = { side: 'dr', text: H(np >= 0 ? T2('Add: Net profit', 'जोड़ें: शुद्ध लाभ') : T2('Less: Net loss', 'घटाएँ: शुद्ध हानि')), p: Math.abs(np), paren: np < 0, cls: 'sub ' + c };
          if (ci >= 0) t3.splice(ci + 1, 0, npRow); else t3.push(npRow);
          const lt = v(lines.L) + np, at = v(lines.A);
          o3.tot = [lt, at];
        }
        return `<div class="lg-st"><div data-st="trading">${tAcc(tr(T2(`Trading account for the year ended ${fmtD(e, 'en')}`, `${fmtD(e, 'hi')} को समाप्त वर्ष का व्यापार खाता`)), t1, o1)}</div><div data-st="pl">${tAcc(tr(T2('Profit and loss account', 'लाभ-हानि खाता')), t2, o2)}</div><div class="wide" data-st="bs">${tAcc(tr(T2(`Balance sheet as on ${fmtD(e, 'en')}`, `${fmtD(e, 'hi')} को तुलन पत्र`)), t3, o3)}</div></div>`;
      },
      bar: () => btn('post', T2('Show me', 'मुझे दिखाओ'), 'go', faIt.every((x) => S.place[x.id]), ICO.eye) + btn('balance', T2('Find the profit', 'लाभ निकालो'), 'bal', !faIt.every((x) => S.place[x.id]) || S.closed, ICO.bal),
      why(id) {
        const w = FA.where(id), N = tr(nm(id));
        if (id === 'closing-stock') return T2('Closing stock is the unsold goods. It is credited in the trading account (it lowers the cost of goods sold) and shown as an asset in the balance sheet.', 'अंतिम स्टॉक बिना बिका माल है। यह व्यापार खाते में जमा होता है (बेचे गए माल की लागत घटाता है) और तुलन पत्र में परिसंपत्ति के रूप में दिखता है।');
        if (w === 'trading') return T2(`${N} is about buying, making or selling the goods themselves, so it goes to the trading account (it decides the gross profit).`, `${N} माल को ख़रीदने, बनाने या बेचने से जुड़ा है, इसलिए यह व्यापार खाते में जाता है (इससे सकल लाभ तय होता है)।`);
        if (w === 'pl') return T2(`${N} is a cost or income of running the business, not of the goods themselves, so it goes to the profit and loss account.`, `${N} व्यापार चलाने का व्यय या आय है, सीधे माल का नहीं, इसलिए यह लाभ-हानि खाते में जाता है।`);
        return T2(`${N} is something the business owns, owes or the owner’s claim at the year end, so it goes to the balance sheet.`, `${N} वर्ष के अंत में व्यापार की संपत्ति, देनदारी या स्वामी का दावा है, इसलिए यह तुलन पत्र में जाता है।`);
      },
      put(id, demo) {
        S.place[id] = true; mark('f' + id); S.acc = null;
        const w = FA.where(id);
        fly(`[data-key="account:${id}"]`, `[data-st="${w === 'both' ? 'trading' : w}"] .lg-t-h`, inr(Math.abs(faBal[id])));
        if (w === 'both') fly(`[data-key="account:${id}"]`, '[data-st="bs"] .lg-t-h', inr(Math.abs(faBal[id])), 'cr', 260);
        api.record(tr(T2('Final accounts: placed ', 'अंतिम खाते: रखा ')) + tr(nm(id)));
        S.q = null;
        say('good', () => `<p><b>${H(demo ? T2('Here it goes:', 'यह यहाँ जाता है:') : T2('Right!', 'सही!'))}</b> ${H(FA.why(id))}</p>${faIt.every((x) => S.place[x.id]) ? `<p>${H(T2('Everything is placed. Tap “Find the profit”.', 'सब रख दिया गया। “लाभ निकालो” दबाओ।'))}</p>` : ''}`);
        api.emit('posted:' + id);
      },
      act(key) {
        if (key.startsWith('account:')) {
          const id = key.slice(8);
          if (S.place[id]) { toast(T2('Already placed.', 'पहले ही रखा जा चुका है।')); return; }
          S.acc = id; S.msg = null;
          ask(T2(`Where does ${tr(nm(id))} (${inr(Math.abs(faBal[id]))}) go?`, `${tr(nm(id))} (${inr(Math.abs(faBal[id]))}) कहाँ जाएगा?`), FA_OPT.map((o) => ({ l: o.l, right: o.k === FA.where(id) })), () => H(FA.why(id)),
            { hint: T2('Ask: is it about the goods (trading), about running the business (profit and loss), or something owned or owed at the year end (balance sheet)?', 'सोचो: क्या यह माल से जुड़ा है (व्यापार), व्यापार चलाने से (लाभ-हानि), या वर्ष के अंत में किसी संपत्ति या देनदारी से (तुलन पत्र)?'), onRight: () => { const ii = id; S.q = null; FA.put(ii, false); } });
          api.emit('chose:' + id);
        } else if (key === 'post') {
          const id = (S.acc && !S.place[S.acc] && S.acc) || (faIt.find((x) => !S.place[x.id]) || {}).id;
          if (!id) { toast(T2('Everything is placed.', 'सब रखा जा चुका है।')); return; }
          FA.put(id, true);
        } else if (key === 'balance') {
          if (!faIt.every((x) => S.place[x.id])) { toast(T2('Place every balance first.', 'पहले हर शेष रखो।')); return; }
          if (S.closed) { toast(T2('Already worked out.', 'पहले ही निकाला जा चुका है।')); return; }
          S.closed = true; mark('close');
          const { gp, np, lines, v } = FA.calc();
          const lt = v(lines.L) + np;
          ask(T2('What is the net profit?', 'शुद्ध लाभ कितना है?'), numOpts(np, [gp, gp + v(lines.pCr), np + v(lines.pDr) * 2]), () => H(T2(`Net profit = gross profit ${inr(gp)} + other incomes − expenses = ${inr(np)}. It is added to capital.`, `शुद्ध लाभ = सकल लाभ ${inr(gp)} + अन्य आय − व्यय = ${inr(np)}। यह पूँजी में जुड़ता है।`)));
          say('good', () => `<p><b>${H(gp >= 0 ? T2(`Gross profit ${inr(gp)}`, `सकल लाभ ${inr(gp)}`) : T2(`Gross loss ${inr(-gp)}`, `सकल हानि ${inr(-gp)}`))} · ${H(np >= 0 ? T2(`Net profit ${inr(np)}`, `शुद्ध लाभ ${inr(np)}`) : T2(`Net loss ${inr(-np)}`, `शुद्ध हानि ${inr(-np)}`))}</b></p><p>${H(T2(`The balance sheet agrees: liabilities ${inr(lt)} = assets ${inr(lt)}.`, `तुलन पत्र मिल गया: देयताएँ ${inr(lt)} = परिसंपत्तियाँ ${inr(lt)}।`))}</p>`);
          later(500, () => { api.emit('balanced'); later(700, () => { api.emit('tallied'); api.celebrate(); }); });
        }
        render();
      },
    };

    // ================================================================ partnership
    const PT = {
      plan: null,
      init() { PT.plan = partnerPlan(cfg); },
      nm: (i) => tr(cfg.partners[i].name),
      progress: () => [S.step, PT.plan.steps.length],
      side() {
        const ps = cfg.partners, pl = PT.plan;
        const ratio = pl.ratio.join(' : ');
        return `<h4 class="lg-h">${H(T2('The partners', 'साझेदार'))}</h4>${ps.map((p, i) => `<div class="lg-card" style="border-left:6px solid ${PCOL[i]}"><h5>${esc(tr(p.name))}</h5><div class="lg-kv"><span>${H(T2('Capital', 'पूँजी'))}</span><b>${inr(P(p.capital))}</b><span>${H(T2('Profit share', 'लाभ भाग'))}</span><b>${pl.ratio[i]} / ${sum(pl.ratio)}</b>${p.salary ? `<span>${H(T2('Salary a year', 'वार्षिक वेतन'))}</span><b>${inr(P(p.salary))}</b>` : ''}</div></div>`).join('')}
          <div class="lg-card"><h5>${H(T2('The deed says', 'विलेख में लिखा है'))}</h5><div class="lg-kv"><span>${H(pl.profit >= 0 ? T2('Net profit', 'शुद्ध लाभ') : T2('Net loss', 'शुद्ध हानि'))}</span><b>${inr(Math.abs(pl.profit))}</b><span>${H(T2('Interest on capital', 'पूँजी पर ब्याज'))}</span><b>${cfg.interest ? cfg.interest + '%' : H(T2('none', 'नहीं'))}</b><span>${H(T2('Ratio', 'अनुपात'))}</span><b>${ratio}</b></div>${cfg.partners.every((p) => p.ratio == null) ? `<p class="lg-muted">${H(T2('No ratio agreed, so the Partnership Act says: share equally.', 'कोई अनुपात तय नहीं, इसलिए साझेदारी अधिनियम कहता है: बराबर बाँटो।'))}</p>` : ''}${!cfg.interest ? `<p class="lg-muted">${H(T2('No interest on capital is allowed unless the deed agrees to it.', 'विलेख में सहमति न हो तो पूँजी पर ब्याज नहीं मिलता।'))}</p>` : ''}</div>`;
      },
      donut() {
        const pl = PT.plan, tot = Math.abs(pl.profit) || 1, R = 84, C = 2 * Math.PI * R;
        let off = 0, segs = '';
        const op = { interest: 0.55, salary: 0.78, share: 1 };
        pl.steps.slice(0, S.step).forEach((st) => st.a.forEach((v, i) => {
          if (!v) return;
          const len = (Math.abs(v) / tot) * C;
          segs += `<circle cx="130" cy="130" r="${R}" fill="none" stroke="${PCOL[i]}" stroke-opacity="${op[st.id]}" stroke-width="40" stroke-dasharray="${Math.max(0, len - 2)} ${C - len + 2}" stroke-dashoffset="${-off}" transform="rotate(-90 130 130)" ${S.fresh['p' + st.id] ? 'class="lg-fade"' : ''}/>`;
          off += len;
        }));
        const left = Math.max(0, C - off);
        const rest = left > 1 ? `<circle cx="130" cy="130" r="${R}" fill="none" stroke="#FFD23F" stroke-width="40" stroke-dasharray="${left} ${C - left}" stroke-dashoffset="${-off}" transform="rotate(-90 130 130)"/>` : '';
        const all = left <= 1;
        return `<svg viewBox="0 0 260 260" class="lg-chart" style="max-width:250px;margin:0 auto;background:none" role="img" aria-label="${esc(tr(T2('How the profit is shared', 'लाभ कैसे बँटा')))}">${rest}${segs}<circle cx="130" cy="130" r="62" fill="#fff" stroke="#E2E8F0"/><text x="130" y="122" text-anchor="middle" style="font:700 13px var(--font-body);fill:#475569">${esc(tr(all ? (pl.profit < 0 ? T2('loss shared', 'हानि बँटी') : T2('profit shared', 'लाभ बँटा')) : T2('still to share', 'अभी बाँटना है')))}</text><text x="130" y="148" text-anchor="middle" style="font:800 19px var(--font-display);fill:#1E293B">${esc(inr(all ? Math.abs(pl.profit) : Math.round((left / C) * tot)))}</text></svg>`;
      },
      work() {
        const pl = PT.plan, ps = cfg.partners, n = ps.length;
        const rows = [];
        const posted = pl.steps.slice(0, S.step);
        if (pl.profit >= 0) rows.push({ side: 'cr', text: H(T2('By Profit and Loss A/c (net profit)', 'लाभ-हानि खाता (शुद्ध लाभ)')), p: pl.profit });
        else rows.push({ side: 'dr', text: H(T2('To Profit and Loss A/c (net loss)', 'लाभ-हानि खाता (शुद्ध हानि)')), p: -pl.profit });
        posted.forEach((st) => {
          const sd = pl.profit >= 0 ? 'dr' : 'cr';
          const head = st.id === 'interest' ? T2('To Interest on capital:', 'पूँजी पर ब्याज:') : st.id === 'salary' ? T2('To Salary:', 'वेतन:') : pl.profit >= 0 ? T2('To Profit transferred to capital:', 'लाभ पूँजी खातों में:') : T2('By Loss transferred to capital:', 'हानि पूँजी खातों में:');
          rows.push({ side: sd, text: `<b>${H(head)}</b>`, p: null, cls: nw('p' + st.id) });
          st.a.forEach((v, i) => { if (v || st.id === 'share') rows.push({ side: sd, text: esc(PT.nm(i)), p: Math.abs(v), cls: 'sub ' + nw('p' + st.id) }); });
        });
        const o = {};
        if (S.step === pl.steps.length) o.tot = [Math.abs(pl.profit), Math.abs(pl.profit)];
        const head = `<tr><th>${H(T2('Particulars', 'विवरण'))}</th>${ps.map((p, i) => `<th class="n"><span class="lg-sw" style="--c:${PCOL[i]}"></span>${esc(tr(p.name))}</th>`).join('')}</tr>`;
        const line = (label, vals, cls) => `<tr class="${cls || ''}"><td>${label}</td>${vals.map((v) => `<td class="n">${v == null ? '' : (v < 0 ? '−' : '') + amt(Math.abs(v))}</td>`).join('')}</tr>`;
        const open = ps.map((p) => (cfg.fixed ? 0 : P(p.capital)));
        let body = cfg.fixed ? '' : line(H(T2('Opening capital', 'प्रारंभिक पूँजी')), open);
        const closing = open.slice();
        posted.forEach((st) => { body += line(H(st.n), st.a, nw('p' + st.id)); st.a.forEach((v, i) => { closing[i] += v; }); });
        if (S.closed) body += line(H(T2('Closing balance', 'अंतिम शेष')), closing, 'tot ' + nw('close'));
        const capT = cfg.fixed ? T2('Partners’ current accounts (summary)', 'साझेदारों के चालू खाते (सारांश)') : T2('Partners’ capital accounts (summary)', 'साझेदारों के पूँजी खाते (सारांश)');
        return `<div class="lg-st"><div>${PT.donut()}<div class="lg-chips" style="justify-content:center;margin-top:6px">${ps.map((p, i) => `<span class="lg-tag" style="--c:${PCOL[i]};color:#fff">${esc(tr(p.name))}</span>`).join('')}</div></div><div>${tAcc(tr(T2('Profit and loss appropriation account', 'लाभ-हानि विनियोजन खाता')), rows, o)}</div><div class="wide"><div class="lg-paper"><h5>${H(capT)}</h5><div class="lg-tbw"><table class="lg-tb"><thead>${head}</thead><tbody>${body || `<tr><td colspan="${n + 1}" class="lg-empty">${H(T2('Nothing credited yet.', 'अभी कुछ जमा नहीं हुआ।'))}</td></tr>`}</tbody></table></div></div></div></div>`;
      },
      bar() {
        const pl = PT.plan, st = pl.steps[S.step];
        const lab = !st ? T2('All shared', 'सब बँट गया') : st.id === 'interest' ? T2(`Allow ${cfg.interest}% interest on capital`, `पूँजी पर ${cfg.interest}% ब्याज दो`) : st.id === 'salary' ? T2('Pay the partner’s salary', 'साझेदार का वेतन दो') : T2(`Share the rest ${pl.ratio.join(':')}`, `बाक़ी ${pl.ratio.join(':')} में बाँटो`);
        return btn('post', lab, 'go', !st, ICO.post) + btn('balance', cfg.fixed ? T2('Balance the current accounts', 'चालू खाते संतुलित करो') : T2('Balance the capital accounts', 'पूँजी खाते संतुलित करो'), 'bal', S.step < pl.steps.length || S.closed, ICO.bal);
      },
      act(key) {
        const pl = PT.plan;
        if (key === 'post') {
          const st = pl.steps[S.step];
          if (!st) { toast(T2('The profit is fully shared.', 'लाभ पूरा बँट चुका है।')); return; }
          S.step++; mark('p' + st.id);
          const each = st.a.map((v, i) => `${esc(PT.nm(i))}: ${inr(v)}`).join(', ');
          let why;
          if (st.id === 'interest') why = pl.scaled ? T2('The profit is not enough for full interest and salary, so it is shared in the ratio of those amounts.', 'लाभ पूरे ब्याज और वेतन के लिए काफ़ी नहीं है, इसलिए इसे उन राशियों के अनुपात में बाँटा जाता है।') : T2(`Interest = capital × ${cfg.interest}%. It is a reward for the money each partner put in.`, `ब्याज = पूँजी × ${cfg.interest}%। यह हर साझेदार की लगाई पूँजी का पुरस्कार है।`);
          else if (st.id === 'salary') why = T2('A salary rewards a partner for working in the business, as the deed allows.', 'वेतन व्यापार में काम करने वाले साझेदार का पुरस्कार है, जैसा विलेख अनुमति देता है।');
          else why = pl.profit < 0 ? T2(`There is a loss, so no interest or salary is allowed; the loss is shared ${pl.ratio.join(':')}.`, `हानि है, इसलिए ब्याज या वेतन नहीं मिलता; हानि ${pl.ratio.join(':')} में बँटती है।`) : T2(`What is left (${inr(pl.left)}) is shared in the profit-sharing ratio ${pl.ratio.join(':')}.`, `बचा हुआ (${inr(pl.left)}) लाभ-विभाजन अनुपात ${pl.ratio.join(':')} में बँटता है।`);
          say('good', () => `<p><b>${H(st.n)}:</b> ${each}</p><p>${H(why)}</p>`);
          if (st.id === 'share') {
            const i0 = 0;
            const eq = Math.round(pl.left / cfg.partners.length);
            const full = splitP(pl.profit, pl.ratio)[i0];
            ask(T2(`How much is ${PT.nm(i0)}’s ${pl.profit < 0 ? 'share of the loss' : 'share of the remaining profit'}?`, `${PT.nm(i0)} का ${pl.profit < 0 ? 'हानि में हिस्सा' : 'बचे हुए लाभ में हिस्सा'} कितना है?`), numOpts(st.a[i0], [eq, full, st.a[1]]), () => H(T2(`${inr(pl.left)} × ${pl.ratio[0]}/${sum(pl.ratio)} = ${inr(st.a[0])}.`, `${inr(pl.left)} × ${pl.ratio[0]}/${sum(pl.ratio)} = ${inr(st.a[0])}।`)));
          }
          api.record(tr(T2('Appropriation: ', 'विनियोजन: ')) + tr(st.n));
          api.emit('posted:' + st.id);
        } else if (key === 'balance') {
          if (S.step < pl.steps.length) { toast(T2('Share all the profit first.', 'पहले पूरा लाभ बाँटो।')); return; }
          if (S.closed) { toast(T2('Already balanced.', 'पहले ही संतुलित है।')); return; }
          S.closed = true; mark('close');
          say('good', () => `<p><b>${H(T2('Balanced!', 'संतुलित!'))}</b> ${H(T2('The appropriation account is closed: everything credited to it has gone to the partners.', 'विनियोजन खाता बंद हो गया: इसमें आया सब कुछ साझेदारों को चला गया।'))}</p>`);
          later(450, () => { api.emit('balanced'); api.celebrate(); });
        }
        render();
      },
    };

    // ================================================================ shares
    const SH = {
      init() {
        const s = cfg.issue;
        SH.st = stagesOf(s.calls.length);
        SH.n = s.shares; SH.app = s.applied || s.shares; SH.pr = P(s.premium || 0); SH.face = P(s.face); SH.c = s.calls.map(P);
      },
      progress: () => [S.step, SH.st.length],
      entries(k) {
        const n = SH.n, a = SH.c[k], st = SH.st[k];
        const BANK = T2('Bank', 'बैंक'), SC = T2('Share Capital', 'अंश पूँजी'), SP = T2('Securities Premium', 'प्रतिभूति प्रीमियम');
        if (k === 0) {
          const got = SH.app * a, refund = (SH.app - n) * a;
          const e2 = { dr: [[st.acc, got]], cr: [[SC, n * a]].concat(refund ? [[BANK, refund]] : []), narr: refund ? T2(`(Being application money on ${n} shares transferred to share capital and the excess refunded)`, `(${n} अंशों की आवेदन राशि अंश पूँजी में हस्तांतरित और अधिक राशि लौटाई)`) : T2(`(Being application money on ${n} shares transferred to share capital)`, `(${n} अंशों की आवेदन राशि अंश पूँजी में हस्तांतरित)`) };
          return [{ dr: [[BANK, got]], cr: [[st.acc, got]], narr: T2(`(Being application money received on ${SH.app} shares @ ₹${amt(a)} a share)`, `(${SH.app} अंशों पर ₹${amt(a)} प्रति अंश की दर से आवेदन राशि प्राप्त)`) }, e2];
        }
        const prem = k === 1 ? SH.pr : 0;
        return [
          { dr: [[st.acc, n * a]], cr: [[SC, n * (a - prem)]].concat(prem ? [[SP, n * prem]] : []), narr: T2(`(Being ${st.n.en.toLowerCase()} money due on ${n} shares @ ₹${amt(a)} a share${prem ? `, including ₹${amt(prem)} premium` : ''})`, `(${n} अंशों पर ₹${amt(a)} प्रति अंश ${st.n.hi} राशि देय${prem ? `, ₹${amt(prem)} प्रीमियम सहित` : ''})`) },
          { dr: [[BANK, n * a]], cr: [[st.acc, n * a]], narr: T2(`(Being ${st.n.en.toLowerCase()} money received)`, `(${st.n.hi} राशि प्राप्त)`) },
        ];
      },
      totals() {
        const n = SH.n; let cap = 0, prem = 0;
        for (let k = 0; k < S.step; k++) { cap += n * (SH.c[k] - (k === 1 ? SH.pr : 0)); if (k === 1) prem += n * SH.pr; }
        return { cap, prem, bank: cap + prem };
      },
      side() {
        const s = cfg.issue;
        return `<h4 class="lg-h">${H(T2('The issue', 'निर्गमन'))}</h4><div class="lg-card"><h5>${esc(cfg.business ? tr(cfg.business) : tr(T2('The company', 'कंपनी')))}</h5><div class="lg-kv"><span>${H(T2('Shares offered', 'प्रस्तावित अंश'))}</span><b>${grp(SH.n)}</b><span>${H(T2('Face value', 'अंकित मूल्य'))}</span><b>${inr(SH.face)}</b>${SH.pr ? `<span>${H(T2('Premium', 'प्रीमियम'))}</span><b>${inr(SH.pr)}</b>` : ''}${s.applied && s.applied > s.shares ? `<span>${H(T2('Applications for', 'आवेदन आए'))}</span><b>${grp(s.applied)}</b>` : ''}</div>${s.applied && s.applied > s.shares ? `<p class="lg-muted">${H(T2('Oversubscribed: the extra application money is refunded.', 'अधि-अभिदान: अतिरिक्त आवेदन राशि लौटा दी जाती है।'))}</p>` : ''}</div>
          <div class="lg-card"><h5>${H(T2('Payable a share', 'प्रति अंश देय'))}</h5><div class="lg-kv">${SH.st.map((st, k) => `<span>${S.step > k ? '✓ ' : ''}${H(st.n)}</span><b>${inr(SH.c[k])}${k === 1 && SH.pr ? `<small> (${H(T2('incl. premium', 'प्रीमियम सहित'))})</small>` : ''}</b>`).join('')}</div><p class="lg-muted">${H(T2('All the money called is received in full.', 'माँगी गई पूरी राशि प्राप्त हुई।'))}</p></div>`;
      },
      bars() {
        const cols = ['#02CFF9', '#8B3DFF', '#FF7A1A', '#22C55E'], ink = ['#1E293B', '#fff', '#1E293B', '#1E293B'];
        return `<div class="lg-psh" role="img" aria-label="${esc(tr(T2('Money called on each share', 'हर अंश पर माँगी गई राशि')))}"><p>${H(T2('One share', 'एक अंश'))}: ${inr(SH.face)}${SH.pr ? ` + ${inr(SH.pr)} ${H(T2('premium', 'प्रीमियम'))}` : ''}</p><div class="lg-psr">${SH.c.map((a, k) => `<div class="seg ${k < S.step ? 'on' : ''} ${S.fresh['s' + k] ? 'lg-land' : ''}" style="flex:${a} 1 0;--c:${cols[k]};--k:${ink[k]}"><b>${inr(a)}</b><span>${H(SH.st[k].n)}</span>${k === 1 && SH.pr ? `<i>${H(T2(`incl. ${inr(SH.pr)} premium`, `${inr(SH.pr)} प्रीमियम सहित`))}</i>` : ''}</div>`).join('')}</div></div>`;
      },
      work() {
        const ents = [];
        for (let k = 0; k < S.step; k++) SH.entries(k).forEach((e) => ents.push(Object.assign({ k }, e)));
        const nmA = (x) => (hi() ? `${tr(x)} खाता` : `${tr(x)} A/c`), toA = (x) => (hi() ? `${tr(x)} खाता` : `To ${tr(x)} A/c`);
        const body = ents.map((e) => e.dr.map(([a, p]) => `<tr class="${nw('s' + e.k)}"><td>${esc(nmA(a))} <span class="lg-drw">${DR()}</span></td><td class="n">${amt(p)}</td><td class="n"></td></tr>`).join('') + e.cr.map(([a, p]) => `<tr class="${nw('s' + e.k)}"><td class="ind">${esc(toA(a))}</td><td class="n"></td><td class="n">${amt(p)}</td></tr>`).join('') + `<tr class="nar"><td colspan="3">${H(e.narr)}</td></tr>`).join('');
        const jr = `<div class="lg-paper" style="margin-top:12px"><h5>${H(T2('Journal', 'रोज़नामचा'))}</h5><div class="lg-tbw"><table class="lg-tb"><thead><tr><th>${H(T2('Particulars', 'विवरण'))}</th><th class="n">${H(T2('Dr ₹', 'नाम ₹'))}</th><th class="n">${H(T2('Cr ₹', 'जमा ₹'))}</th></tr></thead><tbody>${body || `<tr><td colspan="3" class="lg-empty">${H(T2('Tap the first stage to collect application money.', 'आवेदन राशि लेने के लिए पहला चरण दबाओ।'))}</td></tr>`}</tbody></table></div></div>`;
        let bs = '';
        if (S.closed) {
          const t = SH.totals();
          const full = S.step === SH.st.length;
          bs = `<div class="lg-paper ${nw('close')}" style="margin-top:12px"><h5>${H(T2('Balance sheet (extract)', 'तुलन पत्र (अंश)'))}</h5><table class="lg-tb"><tbody><tr><td colspan="2"><b>${H(T2('I. Equity and liabilities', 'I. समता एवं देयताएँ'))}</b></td></tr><tr><td class="ind">${H(T2('1. Shareholders’ funds: (a) Share capital', '1. अंशधारकों की निधियाँ: (क) अंश पूँजी'))} <small>(${H(full ? T2('subscribed and fully paid', 'अभिदत्त एवं पूर्णतः प्रदत्त') : T2('called-up and paid-up', 'याचित एवं प्रदत्त'))})</small></td><td class="n">${amt(t.cap)}</td></tr>${t.prem ? `<tr><td class="ind">${H(T2('(b) Reserves and surplus: securities premium', '(ख) संचय एवं आधिक्य: प्रतिभूति प्रीमियम'))}</td><td class="n">${amt(t.prem)}</td></tr>` : ''}<tr class="tot"><td>${H(T2('Total', 'योग'))}</td><td class="n">${amt(t.cap + t.prem)}</td></tr><tr><td colspan="2"><b>${H(T2('II. Assets', 'II. परिसंपत्तियाँ'))}</b></td></tr><tr><td class="ind">${H(T2('Current assets: cash and cash equivalents (bank)', 'चालू परिसंपत्तियाँ: रोकड़ एवं रोकड़ तुल्य (बैंक)'))}</td><td class="n">${amt(t.bank)}</td></tr><tr class="tot"><td>${H(T2('Total', 'योग'))}</td><td class="n">${amt(t.bank)}</td></tr></tbody></table></div>`;
        }
        return `${SH.bars()}${jr}${bs}`;
      },
      bar: () => btn('post', S.step < SH.st.length ? T2(`Collect: ${tr(SH.st[S.step].n)}`, `राशि लो: ${tr(SH.st[S.step].n)}`) : T2('All money collected', 'पूरी राशि मिल गई'), 'go', S.step >= SH.st.length, ICO.post) + btn('balance', T2('Show the balance sheet', 'तुलन पत्र दिखाओ'), 'bal', !S.step, ICO.bal),
      act(key) {
        if (key === 'post') {
          if (S.step >= SH.st.length) { toast(T2('All the money is collected.', 'पूरी राशि मिल चुकी है।')); return; }
          const k = S.step, st = SH.st[k];
          S.step++; mark('s' + k);
          const t = SH.totals();
          say('good', () => `<p><b>${H(st.n)}:</b> ${H(T2(`${grp(SH.n)} shares × ₹${amt(SH.c[k])} = ${inr(SH.n * SH.c[k])}.`, `${grp(SH.n)} अंश × ₹${amt(SH.c[k])} = ${inr(SH.n * SH.c[k])}।`))}${k === 1 && SH.pr ? ' ' + H(T2(`₹${amt(SH.pr)} a share is premium: it goes to securities premium, not share capital.`, `₹${amt(SH.pr)} प्रति अंश प्रीमियम है: यह प्रतिभूति प्रीमियम में जाता है, अंश पूँजी में नहीं।`)) : ''}${k === 0 && SH.app > SH.n ? ' ' + H(T2(`Money for ${grp(SH.app - SH.n)} extra shares is refunded.`, `${grp(SH.app - SH.n)} अतिरिक्त अंशों की राशि लौटाई गई।`)) : ''}</p><p>${H(T2(`Share capital so far: ${inr(t.cap)}.`, `अब तक अंश पूँजी: ${inr(t.cap)}।`))}</p>`);
          api.record(tr(T2('Shares: ', 'अंश: ')) + tr(st.n));
          api.emit('posted:' + st.id);
          if (S.closed) S.q = null;
        } else if (key === 'balance') {
          if (!S.step) { toast(T2('Collect some money first.', 'पहले कुछ राशि लो।')); return; }
          S.closed = true; mark('close');
          const t = SH.totals();
          ask(T2('How much share capital does the balance sheet show?', 'तुलन पत्र में अंश पूँजी कितनी दिखती है?'), numOpts(t.cap, [t.cap + t.prem, SH.app * SH.c[0] + (t.cap - SH.n * SH.c[0]), SH.n * SH.face]), () => H(T2('Share capital counts only the face value called so far; the premium is shown separately under reserves and surplus.', 'अंश पूँजी में केवल अब तक माँगा गया अंकित मूल्य गिना जाता है; प्रीमियम संचय एवं आधिक्य में अलग दिखता है।')));
          say('good', () => `<p><b>${H(T2('It tallies!', 'मिल गया!'))}</b> ${H(T2(`Bank ${inr(t.bank)} = share capital ${inr(t.cap)} + securities premium ${inr(t.prem)}.`, `बैंक ${inr(t.bank)} = अंश पूँजी ${inr(t.cap)} + प्रतिभूति प्रीमियम ${inr(t.prem)}।`))}</p>`);
          later(450, () => { api.emit('tallied'); if (S.step === SH.st.length) api.celebrate(); });
        }
        render();
      },
    };

    // ================================================================ ratios
    const RT = {
      list: m === 'ratios' ? ratioList(cfg) : [],
      f: cfg.figures || {},
      progress: () => [RT.list.filter((id) => S.shown[id]).length, RT.list.length],
      side() {
        const f = RT.f;
        return `<h4 class="lg-h">${H(T2('Ratios', 'अनुपात'))}</h4><div class="lg-accs">${RT.list.map((id, i) => `<button type="button" class="lg-acc ${S.shown[id] ? 'done' : ''}" data-key="ratio:${id}" aria-pressed="${S.ratio === id}" style="--c:${PCOL[i % 4]}"><b>${H(RAT[id].n)}</b><small>${S.shown[id] ? esc(fmtR(id, ratioVal(id, f))) : H(T2('tap to work it out', 'निकालने के लिए टैप करो'))}</small>${S.shown[id] ? '<span class="lg-tick" aria-hidden="true">✓</span>' : ''}</button>`).join('')}</div>
          <div class="lg-card" style="margin-top:10px"><h5>${H(T2('From the statements', 'विवरणों से'))}</h5><div class="lg-kv">${Object.keys(f).map((k) => `<span>${H(FIG[k])}</span><b>${inr(P(f[k]))}</b>`).join('')}</div></div>`;
      },
      work() {
        const id = S.ratio;
        if (!id) return `<div class="lg-paper"><h5>${H(T2('Pick a ratio from the list', 'सूची से कोई अनुपात चुनो'))}</h5><p style="text-align:center;margin:6px 0 0;color:#475569">${H(T2('A ratio compares two figures from the financial statements, so businesses of any size can be compared.', 'अनुपात वित्तीय विवरणों के दो आँकड़ों की तुलना करता है, ताकि हर आकार के व्यापार की तुलना हो सके।'))}</p></div>${narrow() ? '' : RT.fig()}`;
        const r = RAT[id], f = RT.f, num = r.num(f), den = r.den(f), v = ratioVal(id, f), shown = S.shown[id];
        const mul = r.u === '%' ? ' × 100' : '';
        const formula = `<div class="lg-paper"><h5>${H(r.n)}</h5><div class="lg-frow"><span class="lg-frac"><span>${H(r.nn)}</span><span>${H(r.dn)}</span></span>${mul ? `<span>${mul}</span>` : ''}<span>=</span><span class="lg-frac v"><span>${inr(P(num))}</span><span>${inr(P(den))}</span></span>${mul ? `<span>${mul}</span>` : ''}<span>=</span><span class="lg-res ${shown ? '' : 'q'} ${nw('r' + id)}">${shown ? esc(fmtR(id, v)) : '?'}</span></div>${shown ? `<p style="margin:10px 0 0;text-align:center;color:#334155">${H(r.say(v))}</p>` : ''}</div>`;
        const mx = Math.max(num, den) || 1;
        const W = narrow() ? 400 : 640, BW = W - 40;
        const short = (t) => { const x = tr(t); return x.length > (W > 500 ? 80 : 52) ? x.replace(/\s*\(.*\)$/, '') : x; };
        const barsv = `<svg class="lg-chart" viewBox="0 0 ${W} ${r.ideal && r.u === ':1' ? 190 : 120}" role="img" aria-label="${esc(tr(T2('The two figures compared', 'दोनों आँकड़ों की तुलना')))}"><text x="20" y="30" style="font:700 13px var(--font-body);fill:#334155">${esc(short(r.nn))} · ${esc(inr(P(num)))}</text><rect x="20" y="38" width="${Math.max(4, (BW * num) / mx)}" height="22" rx="8" fill="#8B3DFF"/><text x="20" y="84" style="font:700 13px var(--font-body);fill:#334155">${esc(short(r.dn))} · ${esc(inr(P(den)))}</text><rect x="20" y="92" width="${Math.max(4, (BW * den) / mx)}" height="22" rx="8" fill="#14B8A6"/>${r.ideal && r.u === ':1' ? RT.gauge(id, v, shown, BW) : ''}</svg>`;
        return `${formula}<div style="margin-top:12px">${barsv}</div>`;
      },
      gauge(id, v, shown, BW) {
        const r = RAT[id], max = Math.max(3, r.ideal * 1.5, v * 1.15), x = (t) => 20 + (BW * Math.min(t, max)) / max;
        return `<g transform="translate(0 128)"><rect x="20" y="10" width="${BW}" height="14" rx="7" fill="url(#lg-gz)"/><defs><linearGradient id="lg-gz" x1="0" x2="1"><stop offset="0" stop-color="${r.low ? '#22C55E' : '#FF6B57'}"/><stop offset=".5" stop-color="#FFD23F"/><stop offset="1" stop-color="${r.low ? '#FF6B57' : '#22C55E'}"/></linearGradient></defs><line x1="${x(r.ideal)}" x2="${x(r.ideal)}" y1="2" y2="32" stroke="#1E293B" stroke-width="2" stroke-dasharray="3 3"/><text x="${x(r.ideal)}" y="48" text-anchor="middle" style="font:700 12px var(--font-body);fill:#1E293B">${esc(tr(T2(`rule of thumb ${r.ideal} : 1`, `सामान्य मानक ${r.ideal} : 1`)))}</text>${shown ? `<g class="lg-fade"><path d="M${x(v)} 8l-8-12h16z" fill="#8B3DFF"/><text x="${x(v)}" y="-8" text-anchor="middle" style="font:800 13px var(--font-display);fill:#6D28D9">${esc(v.toFixed(2))}</text></g>` : ''}</g>`;
      },
      fig() {
        const f = RT.f, ks = Object.keys(f), mx = Math.max(1, ...ks.map((k) => Math.abs(f[k])));
        return `<svg class="lg-chart" style="margin-top:12px" viewBox="0 0 640 ${30 + ks.length * 30}" role="img" aria-label="${esc(tr(T2('The figures given', 'दिए गए आँकड़े')))}">${ks.map((k, i) => `<text x="20" y="${30 + i * 30}" style="font:700 12px var(--font-body);fill:#334155">${esc(tr(FIG[k]))}</text><rect x="250" y="${18 + i * 30}" width="${(340 * Math.abs(f[k])) / mx}" height="16" rx="6" fill="${PCOL[i % 4]}"/>`).join('')}</svg>`;
      },
      bar: () => btn('post', T2('Work it out', 'हल करो'), 'go', !S.ratio || S.shown[S.ratio], ICO.eye),
      reveal(id) {
        if (S.shown[id]) return;
        S.shown[id] = true; mark('r' + id);
        const v = ratioVal(id, RT.f);
        say('good', () => `<p><b>${H(RAT[id].n)} = ${esc(fmtR(id, v))}</b></p><p>${H(RAT[id].say(v))}</p>`);
        api.record(tr(T2('Worked out: ', 'हल किया: ')) + tr(RAT[id].n));
        api.emit('posted:' + id);
        if (RT.list.every((r) => S.shown[r])) later(400, () => api.celebrate());
      },
      act(key) {
        if (key.startsWith('ratio:')) {
          const id = key.slice(6);
          if (!RAT[id]) return;
          S.ratio = id; S.msg = null;
          const f = RT.f, v = ratioVal(id, f), r = RAT[id];
          const bad = r.bad(f).map((b) => (r.u === '%' && b < 2 && id === 'net-profit' ? b * 100 : b));
          const fm = (x) => fmtR(id, x);
          const vals = [v]; bad.concat([v * 1.5, v / 2]).forEach((b) => { if (isFinite(b) && b > 0 && !vals.some((y) => fm(y) === fm(b))) vals.push(b); });
          const opts = vals.slice(0, 3).map((x) => ({ l: fm(x), right: x === v }));
          const rot = Math.round(v * 7) % opts.length;
          if (!S.shown[id]) ask(T2(`Work out the ${tr(r.n).toLowerCase()}.`, `${tr(r.n)} निकालो।`), opts.slice(rot).concat(opts.slice(0, rot)), () => H(r.say(v)), { onRight: () => RT.reveal(id), hint: T2('Divide the top figure by the bottom one.', 'ऊपर वाले आँकड़े को नीचे वाले से भाग दो।') });
          else S.q = null;
          api.emit('selected:' + id);
        } else if (key === 'post') {
          if (!S.ratio) { toast(T2('Pick a ratio first.', 'पहले कोई अनुपात चुनो।')); return; }
          RT.reveal(S.ratio);
          if (S.q && !S.q.done) S.q = null;
        }
        render();
      },
    };

    // ================================================================ cash flow
    const cfOf = Object.fromEntries((m === 'cash-flow' ? tx : []).map((x) => [x.id, cfClass(x, accs)]));
    const CFC = { operating: '#FF7A1A', investing: '#02CFF9', financing: '#8B3DFF', none: '#94A3B8' };
    const CFV = {
      progress: () => [tx.filter((x) => S.place[x.id]).length, tx.length],
      side: () => txnList((x) => (S.place[x.id] ? { done: true, sub: `<span class="lg-tag" style="--c:${CFC[cfOf[x.id].c]}">${H(CF[cfOf[x.id].c])}</span>` } : {})),
      sums() { const s = { operating: 0, investing: 0, financing: 0 }; tx.forEach((x) => { const k = cfOf[x.id]; if (S.place[x.id] && k.c !== 'none') s[k.c] += k.inflow * x.p; }); return s; },
      work() {
        const s = CFV.sums(), open = P(cfg.opening || 0);
        const bucket = (c) => `<div class="lg-bucket" data-b="${c}" style="--c:${CFC[c]}"><h6>${H(CF[c])}</h6>${tx.filter((x) => S.place[x.id] && cfOf[x.id].c === c).map((x) => `<div class="lg-mi ${nw('f' + x.id)}"><span>${H(x.text)}</span><b class="${cfOf[x.id].inflow > 0 ? 'lg-in' : 'lg-out'}">${cfOf[x.id].inflow > 0 ? '+' : '−'}${amt(x.p)}</b></div>`).join('')}<div class="tot"><span>${H(T2('Net', 'शुद्ध'))}</span><span class="${s[c] >= 0 ? 'lg-in' : 'lg-out'}">${s[c] < 0 ? '−' : ''}${inr(Math.abs(s[c]))}</span></div></div>`;
        const none = tx.filter((x) => S.place[x.id] && cfOf[x.id].c === 'none');
        const nr = narrow(), W = nr ? 400 : 640, steps = [['open', open], ['operating', s.operating], ['investing', s.investing], ['financing', s.financing]];
        let run = 0, vals = [];
        steps.forEach(([k, v]) => { const a = run; run += v; vals.push([k, a, run, v]); });
        const close = run;
        const mx = Math.max(1, ...vals.map((v) => Math.max(v[1], v[2])), close), mn = Math.min(0, ...vals.map((v) => Math.min(v[1], v[2])));
        const y = (v) => 210 - (170 * (v - mn)) / (mx - mn || 1);
        const lab = { open: nr ? T2('Opening', 'प्रारंभिक') : T2('Opening cash', 'प्रारंभिक रोकड़'), operating: T2('Operating', 'प्रचालन'), investing: T2('Investing', 'निवेश'), financing: T2('Financing', 'वित्तीयन'), close: nr ? T2('Closing', 'अंतिम') : T2('Closing cash', 'अंतिम रोकड़') };
        const bw = nr ? 56 : 70, xs = (i) => (nr ? 14 + i * 76 : 40 + i * 118);
        let bars = vals.map(([k, a, b, v], i) => { const top = k === 'open' ? y(b) : y(Math.max(a, b)), h = k === 'open' ? y(mn < 0 ? 0 : mn) - y(b) : Math.abs(y(a) - y(b)); const col = k === 'open' ? '#64748B' : v >= 0 ? '#14B8A6' : '#FF6B57'; return `<rect x="${xs(i)}" y="${top}" width="${bw}" height="${Math.max(2, h)}" rx="6" fill="${col}"/><text x="${xs(i) + bw / 2}" y="${top - 6}" text-anchor="middle" style="font:800 12px var(--font-display);fill:#1E293B">${k === 'open' ? '' : v >= 0 ? '+' : '−'}${esc(amt(Math.abs(k === 'open' ? b : v)).replace(/\.\d+$/, ''))}</text><text x="${xs(i) + bw / 2}" y="236" text-anchor="middle" style="font:700 11.5px var(--font-body);fill:#334155">${esc(tr(lab[k]))}</text>`; }).join('');
        bars += `<rect x="${xs(4)}" y="${y(close)}" width="${bw}" height="${Math.max(2, y(mn < 0 ? 0 : mn) - y(close))}" rx="6" fill="#1E3A8A" class="${S.closed ? 'lg-grow' : ''}" opacity="${S.closed ? 1 : 0.25}"/><text x="${xs(4) + bw / 2}" y="${y(close) - 6}" text-anchor="middle" style="font:800 12px var(--font-display);fill:#1E293B">${S.closed ? esc(amt(close).replace(/\.\d+$/, '')) : '?'}</text><text x="${xs(4) + bw / 2}" y="236" text-anchor="middle" style="font:700 11.5px var(--font-body);fill:#334155">${esc(tr(lab.close))}</text>`;
        const stmt = S.closed ? `<div class="lg-paper ${nw('close')}" style="margin-top:12px"><h5>${H(T2('Cash flow statement (summary)', 'रोकड़ प्रवाह विवरण (सारांश)'))}</h5><table class="lg-tb"><tbody>${['operating', 'investing', 'financing'].map((c) => `<tr><td>${H(T2(`Net cash from ${c} activities`, `${tr(CF[c]).replace(' गतिविधि', '')} गतिविधियों से शुद्ध रोकड़`))}</td><td class="n">${s[c] < 0 ? '(' + amt(-s[c]) + ')' : amt(s[c])}</td></tr>`).join('')}<tr class="tot"><td>${H(T2('Net increase (decrease) in cash', 'रोकड़ में शुद्ध वृद्धि (कमी)'))}</td><td class="n">${close - open < 0 ? '(' + amt(open - close) + ')' : amt(close - open)}</td></tr><tr><td>${H(T2('Add: cash at the beginning', 'जोड़ें: आरंभ में रोकड़'))}</td><td class="n">${amt(open)}</td></tr><tr class="tot"><td>${H(T2('Cash at the end', 'अंत में रोकड़'))}</td><td class="n">${amt(close)}</td></tr></tbody></table></div>` : '';
        return `<div class="lg-bk">${bucket('operating')}${bucket('investing')}${bucket('financing')}</div>${none.length ? `<div class="lg-mini" data-b="none" style="margin-top:10px;--c:#94A3B8"><h6><i></i>${H(CF.none)}</h6>${none.map((x) => `<div class="lg-mi ghost"><span>${H(x.text)}</span><b>${amt(x.p)}</b></div>`).join('')}</div>` : '<div data-b="none"></div>'}<svg class="lg-chart" style="margin-top:12px" viewBox="0 0 ${W} 250" role="img" aria-label="${esc(tr(T2('From opening cash to closing cash', 'प्रारंभिक रोकड़ से अंतिम रोकड़ तक')))}"><line x1="30" x2="${W - 20}" y1="${y(0)}" y2="${y(0)}" stroke="#1E3A8A" stroke-width="1.5"/>${bars}</svg>${stmt}`;
      },
      bar: () => btn('post', T2('Show me', 'मुझे दिखाओ'), 'go', tx.every((x) => S.place[x.id]), ICO.eye) + btn('balance', T2('Find the closing cash', 'अंतिम रोकड़ निकालो'), 'bal', !tx.every((x) => S.place[x.id]) || S.closed, ICO.bal),
      why(x) {
        const k = cfOf[x.id];
        if (k.c === 'none') return k.why === 'swap' ? T2('Cash only moves between cash in hand and the bank; both are cash, so nothing flows in or out.', 'रोकड़ केवल हाथ और बैंक के बीच चलती है; दोनों रोकड़ ही हैं, इसलिए कुछ अंदर या बाहर नहीं जाता।') : T2('No cash moves at all here (it is on credit or only a book entry), so it is not in the cash flow statement.', 'यहाँ कोई रोकड़ नहीं चलती (उधार है या केवल लेखा प्रविष्टि), इसलिए यह रोकड़ प्रवाह विवरण में नहीं आता।');
        return T2(`Cash ${k.inflow > 0 ? 'comes in' : 'goes out'} for ${tr(nm(k.other)).toLowerCase()}: that is ${CF_WHY[k.c].en}, so it is a${k.c === 'operating' ? 'n' : ''} ${CF[k.c].en.toLowerCase()}.`, `${tr(nm(k.other))} के लिए रोकड़ ${k.inflow > 0 ? 'आती' : 'जाती'} है: यह ${CF_WHY[k.c].hi} है, इसलिए यह ${CF[k.c].hi} है।`);
      },
      put(x, demo) {
        S.place[x.id] = true; mark('f' + x.id); S.sel = null; S.q = null;
        fly(`[data-key="txn:${x.id}"]`, `[data-b="${cfOf[x.id].c}"]`, (cfOf[x.id].inflow > 0 ? '+' : cfOf[x.id].inflow < 0 ? '−' : '') + inr(x.p), cfOf[x.id].inflow < 0 ? 'cr' : '');
        api.record(tr(T2('Classified: ', 'वर्गीकृत: ')) + tr(x.text));
        say('good', () => `<p><b>${H(demo ? T2('Like this:', 'ऐसे:') : T2('Right!', 'सही!'))}</b> ${H(CFV.why(x))}</p>`);
        api.emit('posted:' + x.id);
      },
      act(key) {
        if (key.startsWith('txn:')) {
          const id = key.slice(4);
          if (S.place[id]) { toast(T2('Already classified.', 'पहले ही वर्गीकृत है।')); return; }
          S.sel = id; S.msg = null;
          const x = byId[id];
          ask(T2('Which activity is this?', 'यह कौन-सी गतिविधि है?'), ['operating', 'investing', 'financing', 'none'].map((c) => ({ l: CF[c], right: c === cfOf[id].c })), () => H(CFV.why(x)),
            { hint: T2('Ask: does cash really move? Is it daily trade, long-term assets, or owners and lenders?', 'सोचो: क्या सच में रोकड़ चलती है? क्या यह रोज़ का व्यापार है, दीर्घकालीन परिसंपत्ति, या स्वामी और ऋणदाता?'), onRight: () => { CFV.put(x, false); } });
          api.emit('selected:' + id);
        } else if (key === 'post') {
          const x = (S.sel && !S.place[S.sel] && byId[S.sel]) || tx.find((y) => !S.place[y.id]);
          if (!x) { toast(T2('Everything is classified.', 'सब वर्गीकृत हो चुका है।')); return; }
          CFV.put(x, true);
        } else if (key === 'balance') {
          if (!tx.every((x) => S.place[x.id])) { toast(T2('Classify every transaction first.', 'पहले हर लेन-देन वर्गीकृत करो।')); return; }
          if (S.closed) { toast(T2('Already found.', 'पहले ही निकाला जा चुका है।')); return; }
          S.closed = true;
          const s = CFV.sums(), open = P(cfg.opening || 0), close = open + s.operating + s.investing + s.financing;
          ask(T2('How much net cash came from operating activities?', 'प्रचालन गतिविधियों से कितनी शुद्ध रोकड़ आई?'), numOpts(s.operating, [s.operating + s.investing, close, -s.operating]), () => H(T2('Add the operating inflows and subtract the operating outflows.', 'प्रचालन के अंतर्वाह जोड़ो और बहिर्वाह घटाओ।')));
          say('good', () => `<p><b>${H(T2('It tallies!', 'मिल गया!'))}</b> ${H(T2(`Opening cash ${inr(open)} + net flow ${inr(close - open)} = closing cash ${inr(close)}, the same as the cash and bank balances.`, `प्रारंभिक रोकड़ ${inr(open)} + शुद्ध प्रवाह ${inr(close - open)} = अंतिम रोकड़ ${inr(close)}, जो रोकड़ और बैंक शेष के बराबर है।`))}</p>`);
          later(500, () => { api.emit('tallied'); api.celebrate(); });
        }
        render();
      },
    };

    V = { equation: EQ, journal: JR, ledger: LG, 'cash-book': CBK, 'trial-balance': TB, brs: BR, depreciation: DP, 'final-accounts': FA, partnership: PT, shares: SH, ratios: RT, 'cash-flow': CFV }[m];
    if (V.init) V.init();

    function onClick(e) {
      const el = e.target.closest('[data-key]');
      if (!el || !root.contains(el)) return;
      const key = el.dataset.key;
      if (!api.allowed(key)) { api.nudge(key); return; }
      if (key === 'answer') { answer(Number(el.dataset.opt)); return; }
      V.act(key);
    }
    function onKey(e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"][data-key]')) { e.preventDefault(); e.target.click(); }
    }
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    render();
    let wasNarrow = narrow(), ro = null;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => { const nn = narrow(); if (nn !== wasNarrow) { wasNarrow = nn; render(); } }); ro.observe(root); }
    return {
      destroy() {
        if (ro) ro.disconnect();
        stops.forEach((s) => s()); timers.forEach(clearTimeout);
        root.removeEventListener('click', onClick); root.removeEventListener('keydown', onKey);
      },
    };
  }

  NCA_T.register({
    id: 'ledger',
    css: CSS,
    validate,
    keys,
    demo: {
      mode: 'ledger',
      business: T2('Asha Stationery Mart', 'आशा स्टेशनरी मार्ट'),
      transactions: [
        { id: 't1', date: '2025-04-01', text: T2('Started business with cash', 'नक़द पूँजी से व्यापार शुरू किया'), amount: 80000, debit: 'cash', credit: 'capital' },
        { id: 't2', date: '2025-04-03', text: T2('Deposited cash into the bank', 'बैंक में नक़द जमा किया'), amount: 50000, debit: 'bank', credit: 'cash' },
        { id: 't3', date: '2025-04-08', text: T2('Bought goods for cash', 'नक़द माल ख़रीदा'), amount: 18000, debit: 'purchases', credit: 'cash' },
        { id: 't4', date: '2025-04-15', text: T2('Bought furniture, paid by cheque', 'फ़र्नीचर ख़रीदा, चेक से भुगतान'), amount: 12000, debit: 'furniture', credit: 'bank' },
        { id: 't5', date: '2025-04-22', text: T2('Sold goods for cash', 'नक़द माल बेचा'), amount: 26500, debit: 'cash', credit: 'sales' },
        { id: 't6', date: '2025-04-30', text: T2('Paid rent for the shop', 'दुकान का किराया दिया'), amount: 4500, debit: 'rent', credit: 'cash' },
      ],
    },
    model: { A, BRS, RAT, validate, keys, txOf, balancesOf, effect, depSchedule, partnerPlan, splitP, stagesOf, ratioVal, cfClass, brsSign, faItems, inr, amt },
    mount,
  });
})();
