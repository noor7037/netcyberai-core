// Template: Writing frames. A child builds a letter, notice, report, diary entry, essay, speech, email,
// advertisement, invitation or article from its parts: tap a piece, then tap the place on the page where it belongs.
// Each format carries its own slots in the order CBSE writing conventions give them (sender's address, date,
// receiver, subject, greeting, body, closing, name for a formal letter, and so on). A lab only chooses the pieces of
// text; the template knows which slots a format has, so a piece can never be given a place the format does not have.
// Config:
//   { kind: 'formal-letter'|'informal-letter'|'notice'|'report'|'diary'|'essay'|'speech'|'email'|'advertisement'|
//            'invitation'|'article',
//     lang?: 'en'|'hi'   (language of the piece; default follows the page language),
//     task?: {en,hi}|string   (the writing task shown on top),
//     parts: [{ id, text: {en,hi}|string, slot }]   (a slot that takes several parts, such as the body, keeps them in
//                                                    the order written here; that is the right order) }
(function () {
  const L = window.NCA_LIB;
  const { esc } = L;
  const T2 = (en, hi) => ({ en, hi });
  const S = (id, en, hi, hen, hhi, o) => Object.assign({ id, n: T2(en, hi), h: T2(hen, hhi) }, o || {});

  // ---------------------------------------------------------------- the formats
  // al: alignment on the page (l, r, c); st: look (h heading, u subject line, b bold, sig name); multi: takes several
  // parts in order; opt: may be left out of a lab.
  const KINDS = {
    'formal-letter': {
      c: '#1D4ED8', ct: '#fff', name: T2('Formal letter', 'औपचारिक पत्र'), icon: 'envelope',
      slots: [
        S('sender', "Sender's address", 'भेजने वाले का पता', 'Your own address, at the very top.', 'सबसे ऊपर तुम्हारा अपना पता।'),
        S('date', 'Date', 'दिनांक', 'The day on which the letter is written.', 'जिस दिन पत्र लिखा जा रहा है।'),
        S('receiver', 'Receiver', 'पाने वाले का पता', 'Who the letter is for: the post and the address.', 'पत्र किसके लिए है: पद और पता।'),
        S('subject', 'Subject line', 'विषय', 'A few words that tell what the letter is about.', 'कुछ शब्दों में बताओ कि पत्र किस बारे में है।', { st: 'u' }),
        S('salutation', 'Greeting', 'संबोधन', 'How you address the reader, such as Sir or Madam.', 'पढ़ने वाले को कैसे संबोधित करते हैं, जैसे महोदय।'),
        S('body', 'Body', 'पत्र का मुख्य भाग', 'The message itself, in short paragraphs: why you write, the details, the request.', 'पूरा संदेश, छोटे अनुच्छेदों में: क्यों लिख रहे हो, ब्योरा, निवेदन।', { multi: 1 }),
        S('close', 'Closing words', 'समापन', 'The polite words just before your name.', 'नाम से ठीक पहले के शिष्ट शब्द।'),
        S('signature', 'Your name', 'तुम्हारा नाम', 'Your name comes last.', 'सबसे अंत में तुम्हारा नाम।', { st: 'sig' }),
      ],
      tips: [T2('Begin with Sir or Madam and close with Yours faithfully.', "'Sir' या 'Madam' से शुरू करो और 'Yours faithfully' से अंत करो।"), T2('Keep the subject line short.', 'विषय-पंक्ति छोटी रखो।'), T2('Use polite, simple words and no slang.', 'शिष्ट और सरल शब्द लिखो, बोलचाल के नहीं।')],
      tipsHi: [T2("Write 'सेवा में' before the receiver.", "पाने वाले से पहले 'सेवा में' लिखो।"), T2("Greet with 'महोदय' or 'महोदया' after the subject.", "विषय के बाद 'महोदय' या 'महोदया' से संबोधित करो।"), T2("Close with 'भवदीय' and your name.", "अंत में 'भवदीय' और अपना नाम लिखो।")],
    },
    'informal-letter': {
      c: '#8B3DFF', ct: '#fff', name: T2('Informal letter', 'अनौपचारिक पत्र'), icon: 'envelope',
      slots: [
        S('sender', "Sender's address", 'भेजने वाले का पता', 'Your own address, at the top.', 'ऊपर तुम्हारा अपना पता।', { al: 'r' }),
        S('date', 'Date', 'दिनांक', 'The day on which you write.', 'जिस दिन तुम लिख रहे हो।', { al: 'r' }),
        S('salutation', 'Greeting', 'संबोधन', 'Dear, and the name of the person you write to.', 'प्रिय, और जिसे लिख रहे हो उसका नाम।'),
        S('body', 'Body', 'पत्र का मुख्य भाग', 'Your news and feelings, in short paragraphs: opening, main news, ending.', 'तुम्हारी बातें और भावनाएँ, छोटे अनुच्छेदों में: शुरुआत, मुख्य बात, अंत।', { multi: 1 }),
        S('close', 'Closing words', 'समापन', 'The warm words before your name.', 'नाम से पहले के स्नेह भरे शब्द।', { al: 'r' }),
        S('signature', 'Your name', 'तुम्हारा नाम', 'Your name comes last.', 'सबसे अंत में तुम्हारा नाम।', { al: 'r', st: 'sig' }),
      ],
      tips: [T2('Start with Dear and the name of your friend or relative.', "'Dear' और अपने मित्र या रिश्तेदार का नाम लिखकर शुरू करो।"), T2('End with Yours lovingly or Your friend.', "'Yours lovingly' या 'Your friend' से अंत करो।"), T2('Write kindly, the way you speak.', 'वैसे लिखो जैसे प्यार से बोलते हो।')],
      tipsHi: [T2("Start with 'प्रिय' and the name.", "'प्रिय' और नाम लिखकर शुरू करो।"), T2("End with 'तुम्हारा मित्र' or 'तुम्हारा स्नेही'.", "'तुम्हारा मित्र' या 'तुम्हारा स्नेही' से अंत करो।"), T2('Write kindly, the way you speak.', 'वैसे लिखो जैसे प्यार से बोलते हो।')],
    },
    notice: {
      c: '#FF7A1A', ct: '#1E293B', name: T2('Notice', 'सूचना'), icon: 'notice',
      slots: [
        S('issuer', 'Issuer', 'संस्था का नाम', 'Who gives the notice: the name of the school or club.', 'सूचना कौन दे रहा है: विद्यालय या क्लब का नाम।', { al: 'c', st: 'b' }),
        S('title', 'Title', 'शीर्षक', 'The one word that names this kind of writing.', 'इस लेखन का नाम बताने वाला एक शब्द।', { al: 'c', st: 'h' }),
        S('date', 'Date', 'दिनांक', 'The day on which the notice is written.', 'जिस दिन सूचना लिखी गई।'),
        S('heading', 'Heading', 'विषय-शीर्षक', 'What the notice is about, in a few words.', 'सूचना किस बारे में है, कुछ शब्दों में।', { al: 'c', st: 'u' }),
        S('body', 'Details', 'सूचना का विवरण', 'What is happening, when, where and who may come.', 'क्या हो रहा है, कब, कहाँ और कौन आ सकता है।', { multi: 1 }),
        S('signer', 'Writer', 'लेखक का नाम और पद', 'The name and post of the person who issues the notice, at the end.', 'सूचना जारी करने वाले का नाम और पद, अंत में।', { st: 'sig' }),
      ],
      tips: [T2('Keep it short: about fifty words.', 'छोटा रखो: लगभग पचास शब्द।'), T2('Say the date, time and place clearly.', 'दिनांक, समय और स्थान साफ़ लिखो।'), T2('End with the name and post of the writer.', 'अंत में लिखने वाले का नाम और पद लिखो।')],
    },
    report: {
      c: '#02CFF9', ct: '#1E293B', name: T2('Report', 'रिपोर्ट'), icon: 'paper',
      slots: [
        S('headline', 'Headline', 'शीर्षक', 'A short title that tells the event.', 'घटना बताने वाला छोटा शीर्षक।', { al: 'c', st: 'h' }),
        S('byline', 'Byline', 'रिपोर्टर का नाम', 'By, and the name of the reporter.', 'द्वारा, और रिपोर्टर का नाम।', { al: 'c', st: 'b' }),
        S('dateline', 'Place and date', 'स्थान और दिनांक', 'Where the report comes from, and the day.', 'रिपोर्ट कहाँ से है और किस दिन की।', { al: 'c' }),
        S('body', 'Body', 'रिपोर्ट का मुख्य भाग', 'What, where, when and who first; then the details; then how it ended.', 'पहले क्या, कहाँ, कब, कौन; फिर ब्योरा; फिर अंत कैसे हुआ।', { multi: 1 }),
      ],
      tips: [T2('Write in the past tense.', 'भूतकाल में लिखो।'), T2("Use the third person: 'the students', not 'we'.", "अन्य पुरुष में लिखो: 'विद्यार्थी', 'हम' नहीं।"), T2('Say what, where, when and who in the first paragraph.', 'पहले अनुच्छेद में क्या, कहाँ, कब और कौन बताओ।')],
    },
    diary: {
      c: '#FF6B57', ct: '#1E293B', name: T2('Diary entry', 'डायरी'), icon: 'diary',
      slots: [
        S('date', 'Date and day', 'दिनांक और दिन', 'The date, the day and the time, at the top.', 'ऊपर दिनांक, दिन और समय।', { al: 'r' }),
        S('greeting', 'Greeting', 'संबोधन', 'The way you begin talking to your diary.', 'डायरी से बात शुरू करने का तरीका।'),
        S('body', 'What happened', 'आज की बात', 'What happened and how you felt, in order.', 'क्या हुआ और तुमने कैसा महसूस किया, क्रम से।', { multi: 1 }),
        S('signoff', 'Your name', 'तुम्हारा नाम', 'Your name at the end.', 'अंत में तुम्हारा नाम।', { al: 'r', st: 'sig' }),
      ],
      tips: [T2("Write 'Dear Diary' after the date.", "तारीख़ के बाद 'प्रिय डायरी' लिखो।"), T2("Use 'I' and write your feelings.", "'मैं' से लिखो और भावनाएँ बताओ।"), T2('Write about one day, in the order it happened.', 'एक ही दिन की बात, जिस क्रम में हुई उसी क्रम में लिखो।')],
    },
    essay: {
      c: '#0F766E', ct: '#fff', name: T2('Essay', 'निबंध'), icon: 'pen',
      slots: [
        S('title', 'Title', 'शीर्षक', 'The topic of the essay.', 'निबंध का विषय।', { al: 'c', st: 'h' }),
        S('introduction', 'Introduction', 'भूमिका', 'Tells what the essay is about and catches interest.', 'बताती है कि निबंध किस बारे में है और रुचि जगाती है।'),
        S('body', 'Body', 'मुख्य भाग', 'The ideas and facts, one idea in each paragraph.', 'विचार और तथ्य, हर अनुच्छेद में एक विचार।', { multi: 1 }),
        S('conclusion', 'Conclusion', 'उपसंहार', 'Ends with a thought for the reader to keep.', 'पाठक के याद रखने लायक विचार के साथ अंत।'),
      ],
      tips: [T2('One idea in each paragraph.', 'हर अनुच्छेद में एक विचार।'), T2('The introduction says what the essay is about.', 'भूमिका बताती है कि निबंध किस बारे में है।'), T2('Finish with a thought to remember.', 'याद रखने लायक विचार पर समाप्त करो।')],
    },
    speech: {
      c: '#4400F0', ct: '#fff', name: T2('Speech', 'भाषण'), icon: 'mic',
      slots: [
        S('greeting', 'Greeting', 'संबोधन', 'Greet the audience, the most respected people first.', 'श्रोताओं का अभिवादन, सबसे आदरणीय पहले।'),
        S('introduction', 'Opening', 'आरंभ', 'Say who you are and what you will speak about.', 'बताओ कि तुम कौन हो और किस विषय पर बोलोगे।'),
        S('body', 'Main points', 'मुख्य बातें', 'Your points, one after another.', 'तुम्हारी बातें, एक के बाद एक।', { multi: 1 }),
        S('conclusion', 'Ending', 'समापन', 'A last thought or a call to act.', 'अंतिम विचार या कुछ करने का आह्वान।'),
        S('thanks', 'Thanks', 'धन्यवाद', 'Thank the listeners for their time.', 'सुनने के लिए श्रोताओं का धन्यवाद।', { al: 'c', st: 'b' }),
      ],
      tips: [T2('Greet the audience first, the most respected first.', 'पहले श्रोताओं का अभिवादन करो, सबसे आदरणीय का पहले।'), T2('Say who you are and what you will talk about.', 'बताओ कि तुम कौन हो और किस बारे में बोलोगे।'), T2('Finish by thanking the listeners.', 'श्रोताओं का धन्यवाद करके समाप्त करो।')],
    },
    email: {
      c: '#2563EB', ct: '#fff', name: T2('Email', 'ईमेल'), icon: 'at',
      slots: [
        S('to', 'To', 'प्रति (To)', 'The email address of the person you write to.', 'जिसे लिख रहे हो उसका ईमेल पता।'),
        S('cc', 'Cc', 'प्रतिलिपि (Cc)', 'Another person who should also get a copy.', 'जिसे प्रतिलिपि भी भेजनी है।', { opt: 1 }),
        S('subject', 'Subject', 'विषय (Subject)', 'A few words that tell what the email is about.', 'कुछ शब्दों में बताओ कि ईमेल किस बारे में है।', { st: 'b' }),
        S('salutation', 'Greeting', 'संबोधन', 'How you address the reader.', 'पढ़ने वाले को कैसे संबोधित करते हैं।'),
        S('body', 'Message', 'संदेश', 'The message, in short paragraphs.', 'संदेश, छोटे अनुच्छेदों में।', { multi: 1 }),
        S('close', 'Closing words', 'समापन', 'The polite words before your name.', 'नाम से पहले के शिष्ट शब्द।'),
        S('signature', 'Your name', 'तुम्हारा नाम', 'Your name comes last.', 'सबसे अंत में तुम्हारा नाम।', { st: 'sig' }),
      ],
      tips: [T2('Fill the subject: readers decide to open an email by it.', 'विषय ज़रूर भरो: पाने वाला उसी से ईमेल खोलने का निर्णय लेता है।'), T2('Begin with a greeting and end with your name.', 'अभिवादन से शुरू करो और अपने नाम पर समाप्त करो।'), T2('Keep it short and polite.', 'छोटा और शिष्ट रखो।')],
    },
    advertisement: {
      c: '#FFD23F', ct: '#1E293B', name: T2('Advertisement', 'विज्ञापन'), icon: 'horn',
      slots: [
        S('headline', 'Catchy headline', 'आकर्षक शीर्षक', 'Big, short words that make people stop and look.', 'बड़े, छोटे शब्द जो लोगों को रोककर देखने पर मजबूर करें।', { al: 'c', st: 'h' }),
        S('body', 'Details', 'विवरण', 'The facts: what it is, what is good about it.', 'तथ्य: यह क्या है, इसमें क्या अच्छा है।', { al: 'c', multi: 1 }),
        S('offer', 'Offer', 'विशेष ऑफ़र', 'A price, a discount or a gift.', 'कीमत, छूट या उपहार।', { al: 'c', st: 'b', opt: 1 }),
        S('contact', 'Contact', 'संपर्क', 'The phone number or address, at the end.', 'अंत में फ़ोन नंबर या पता।', { al: 'c', st: 'sig' }),
      ],
      tips: [T2('A short, catchy headline.', 'छोटा और आकर्षक शीर्षक।'), T2('Give the facts: what, price, place.', 'तथ्य दो: क्या, कीमत, स्थान।'), T2('Put the phone number or address last.', 'फ़ोन नंबर या पता अंत में रखो।')],
    },
    invitation: {
      c: '#F5B90A', ct: '#1E293B', name: T2('Invitation', 'निमंत्रण पत्र'), icon: 'card',
      slots: [
        S('host', 'Host', 'आमंत्रित करने वाले', 'Who is inviting.', 'निमंत्रण कौन दे रहा है।', { al: 'c', st: 'b' }),
        S('request', 'Invitation line', 'निमंत्रण की पंक्ति', 'The polite words that invite the guest.', 'अतिथि को बुलाने वाले शिष्ट शब्द।', { al: 'c' }),
        S('occasion', 'Occasion', 'अवसर', 'What the celebration is.', 'कौन-सा उत्सव या कार्यक्रम है।', { al: 'c', st: 'h' }),
        S('datetime', 'Date and time', 'दिनांक और समय', 'The day and the hour.', 'कौन-सा दिन और कितने बजे।', { al: 'c' }),
        S('venue', 'Venue', 'स्थान', 'Where it will be held.', 'कार्यक्रम कहाँ होगा।', { al: 'c' }),
        S('rsvp', 'RSVP', 'उत्तर हेतु (RSVP)', 'Who to tell if you will come.', 'आओगे या नहीं, यह किसे बताना है।', { al: 'c', st: 'sig', opt: 1 }),
      ],
      tips: [T2('Name the host first.', 'सबसे पहले आमंत्रित करने वाले का नाम लिखो।'), T2('Say what, when and where.', 'क्या, कब और कहाँ बताओ।'), T2('End with RSVP so guests can reply.', 'अंत में RSVP लिखो ताकि अतिथि उत्तर दे सकें।')],
    },
    article: {
      c: '#14B8A6', ct: '#1E293B', name: T2('Article', 'लेख'), icon: 'paper',
      slots: [
        S('title', 'Title', 'शीर्षक', 'A catchy title for the topic.', 'विषय का आकर्षक शीर्षक।', { al: 'c', st: 'h' }),
        S('byline', 'Byline', 'लेखक का नाम', 'By, and the name of the writer.', 'द्वारा, और लेखक का नाम।', { al: 'c', st: 'b' }),
        S('introduction', 'Introduction', 'भूमिका', 'Opens the topic and makes the reader curious.', 'विषय खोलती है और पाठक में जिज्ञासा जगाती है।'),
        S('body', 'Body', 'मुख्य भाग', 'Facts and views, one idea in each paragraph.', 'तथ्य और विचार, हर अनुच्छेद में एक विचार।', { multi: 1 }),
        S('conclusion', 'Conclusion', 'उपसंहार', 'Closes with a suggestion or a thought.', 'सुझाव या विचार के साथ समाप्त।'),
      ],
      tips: [T2('A catchy title, then your name as the byline.', 'आकर्षक शीर्षक, फिर लेखक के रूप में अपना नाम।'), T2('Introduction, then facts and views, then a conclusion.', 'भूमिका, फिर तथ्य और विचार, फिर उपसंहार।'), T2('One idea in each paragraph.', 'हर अनुच्छेद में एक विचार।')],
    },
  };
  const KIND_IDS = Object.keys(KINDS);
  const ICON = {
    envelope: '<rect x="3" y="6" width="22" height="16" rx="3"/><path d="M3 8l11 8 11-8"/>',
    notice: '<rect x="6" y="4" width="16" height="20" rx="2"/><circle cx="14" cy="8" r="1.6" fill="currentColor"/><path d="M10 13h8M10 17h8"/>',
    paper: '<rect x="4" y="5" width="20" height="18" rx="2"/><path d="M8 10h12M8 14h5M8 18h5M16 14h4v4h-4z"/>',
    diary: '<rect x="6" y="4" width="16" height="20" rx="2"/><path d="M10 4v20M13 9h6M13 13h6"/>',
    pen: '<path d="M5 23l2-6L19 5l4 4L11 21z"/><path d="M17 7l4 4"/>',
    mic: '<rect x="11" y="4" width="6" height="12" rx="3"/><path d="M7 13a7 7 0 0 0 14 0M14 20v4M10 24h8"/>',
    at: '<circle cx="14" cy="14" r="4"/><path d="M18 14v2a3 3 0 0 0 5 0v-2a9 9 0 1 0-4 7"/>',
    horn: '<path d="M4 12v4h4l9 5V7L8 12z"/><path d="M21 11a4 4 0 0 1 0 6"/>',
    card: '<rect x="4" y="6" width="20" height="16" rx="3"/><path d="M14 9l1.5 3 3.3.5-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3-2.4-2.3 3.3-.5z"/>',
  };
  const iconSvg = (k) => `<svg viewBox="0 0 28 28" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

  // ---------------------------------------------------------------- text helpers
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const isTx = (x) => typeof x === 'string' ? x.trim().length > 0 : !!x && typeof x === 'object' && typeof x.en === 'string' && x.en.trim() && typeof x.hi === 'string' && x.hi.trim();
  const partText = (p, wl) => (typeof p.text === 'string' ? p.text : p.text[wl] || p.text.en);
  const short = (s, n) => { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  const CSS = `
.wr{--wc:#1D4ED8;--wct:#fff;position:relative;display:grid;gap:12px;font-family:var(--font-body,system-ui);color:var(--ink,#1E293B);text-align:left}
.wr *{box-sizing:border-box}
.wr,.wr>*,.wr-grid>*{min-width:0;max-width:100%}
.wr-grid{grid-template-columns:minmax(0,1fr)}
.wr button{font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
.wr-top{display:flex;align-items:center;gap:12px;background:var(--wc);color:var(--wct);border-radius:16px;padding:12px 14px;box-shadow:0 6px 18px -8px rgba(6,18,51,.45)}
.wr-badge{flex:none;width:44px;height:44px;border-radius:14px;background:rgba(255,255,255,.25);display:grid;place-items:center;border:2px solid rgba(255,255,255,.5)}
.wr-ttl{flex:1;min-width:0}
.wr-ttl h3{margin:0;font:700 1.15rem/1.2 var(--font-display,inherit)}
.wr-ttl p{margin:2px 0 0;font-size:.92rem;line-height:1.35;opacity:.95}
.wr-prog{flex:none;text-align:center;font:700 1.05rem/1 var(--font-display,inherit);min-width:48px}
.wr-prog small{display:block;font:500 .66rem/1.2 var(--font-body,inherit);opacity:.9;margin-top:3px}
.wr-bar{height:8px;border-radius:99px;background:var(--sunk,#E8EEF8);overflow:hidden;margin-top:-4px}
.wr-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--wc),#22C55E);transition:width .45s cubic-bezier(.2,.8,.2,1)}
.wr-grid{display:grid;gap:12px;align-items:start}
.wr-tray{background:var(--surface,#fff);border:1.5px solid var(--line,#D8E0EE);border-radius:16px;padding:10px;position:sticky;top:0;z-index:3;box-shadow:0 8px 16px -12px rgba(6,18,51,.5)}
.wr-tray h4{margin:0 0 6px;font:700 .82rem/1.2 var(--font-display,inherit);color:var(--ink-2,#475569);letter-spacing:.02em}
.wr-strip{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x proximity;padding:2px 2px 6px;margin:0;list-style:none}
.wr-strip li{flex:none;scroll-snap-align:start}
.wr-chip{display:block;width:210px;min-height:64px;text-align:left;border:2px solid var(--line,#D8E0EE);background:var(--sunk,#F1F5FB);border-radius:12px;padding:8px 10px;font-size:.88rem;line-height:1.35;transition:transform .15s,box-shadow .15s,border-color .15s,background .15s}
.wr-chip span{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line}
.wr-chip:hover{border-color:var(--wc)}
.wr-chip[aria-pressed=true]{border-color:var(--wc);background:#fff;color:#1E293B;box-shadow:0 0 0 3px var(--wc),0 8px 16px -8px rgba(6,18,51,.5);transform:translateY(-2px)}
.wr-chip:focus-visible,.wr-drop:focus-visible,.wr-pl:focus-visible,.wr-btn:focus-visible,.wr-mv:focus-visible{outline:3px solid var(--action,#2563EB);outline-offset:2px}
.wr-hold{margin:6px 2px 0;font-size:.88rem;line-height:1.4;color:var(--ink-2,#475569);min-height:1.2em;white-space:pre-line}
.wr-hold:empty{display:none}
.wr-tray.wr-tray-empty{position:static;padding:4px 10px}
.wr-hold b{color:var(--ink,#1E293B)}
.wr-empty{margin:0;padding:12px;text-align:center;font-weight:600;color:var(--good,#0F766E)}
.wr-sheet{position:relative;background:#FFFEF8;color:#1E293B;border-radius:14px;padding:18px 16px 16px;display:grid;gap:8px;box-shadow:0 14px 30px -14px rgba(6,18,51,.55),0 0 0 1px rgba(30,41,59,.12);overflow:hidden}
.wr-sheet::before{content:"";position:absolute;inset:0 0 auto 0;height:6px;background:var(--wc)}
.wr-k-diary .wr-sheet{background:repeating-linear-gradient(#FFFDF4 0 31px,#F1D9D3 31px 32px);padding-left:34px;border-left:14px dotted var(--wc)}
.wr-k-notice .wr-sheet{background:#FFF7E8;box-shadow:0 14px 30px -14px rgba(6,18,51,.55),inset 0 0 0 4px #fff,inset 0 0 0 6px var(--wc)}
.wr-k-report .wr-sheet,.wr-k-article .wr-sheet{background:#F7F5EE;font-family:Georgia,'Mukta',serif}
.wr-k-invitation .wr-sheet{background:#FFFBEA;box-shadow:0 14px 30px -14px rgba(6,18,51,.55),inset 0 0 0 5px #fff,inset 0 0 0 7px var(--wc),inset 0 0 0 10px #fff,inset 0 0 0 11px var(--wc);padding:26px 22px}
.wr-k-advertisement .wr-sheet{background:linear-gradient(160deg,#FFF8D6,#FFE9A8);box-shadow:0 14px 30px -14px rgba(6,18,51,.55),inset 0 0 0 4px #FF7A1A}
.wr-k-email .wr-sheet{padding-top:30px}
.wr-k-email .wr-sheet::before{height:22px;background:linear-gradient(90deg,var(--wc),#02CFF9)}
.wr-k-email .wr-sheet::after{content:"";position:absolute;left:10px;top:7px;width:8px;height:8px;border-radius:50%;background:#fff;box-shadow:14px 0 #fff,28px 0 #fff;opacity:.85}
.wr-k-speech .wr-sheet{background:#FBF8FF}
.wr-k-essay .wr-sheet{background:repeating-linear-gradient(#FFFEF8 0 27px,#DCE7F5 27px 28px)}
.wr-slot{position:relative;border-radius:10px;transition:background .2s}
.wr-slot.wr-al-r{text-align:right}.wr-slot.wr-al-c{text-align:center}
.wr-lbl{display:inline-block;font:700 .66rem/1 var(--font-display,inherit);letter-spacing:.04em;text-transform:uppercase;color:#64748B;margin:0 0 2px 2px}
.wr-drop{display:block;width:100%;min-height:52px;border:2px dashed #94A3B8;background:rgba(255,255,255,.7);border-radius:10px;padding:8px 12px;text-align:inherit;color:#334155;transition:border-color .2s,background .2s,transform .2s}
.wr-drop b{display:block;font:700 .95rem/1.25 var(--font-display,inherit);color:#1E293B}
.wr-drop small{display:block;font-size:.8rem;line-height:1.35;color:#64748B;margin-top:1px}
.wr-drop.wr-more{min-height:44px;padding:6px 12px}
.wr-drop.wr-more b{font-weight:600;font-size:.85rem;color:#64748B}
.wr-drop:hover{border-color:var(--wc)}
.wr-ready .wr-drop{border-color:var(--wc);background:#fff;animation:wr-pulse 1.3s ease-in-out infinite}
.wr-pls{display:grid;gap:4px;margin:0;padding:0;list-style:none}
.wr-plrow{display:flex;gap:4px;align-items:stretch}
.wr-pl{flex:1;min-width:0;min-height:44px;text-align:inherit;border:1.5px solid transparent;border-radius:10px;background:transparent;padding:6px 8px;line-height:1.5;font-size:1rem;white-space:pre-line;color:#1E293B;transition:background .2s,border-color .2s}
.wr-pl:hover{background:rgba(37,99,235,.07);border-color:#BFD0F5}
.wr-pl.wr-pop{animation:wr-pop .5s cubic-bezier(.2,1.4,.4,1)}
.wr-st-h .wr-pl{font:700 1.3rem/1.3 var(--font-display,inherit)}
.wr-st-u .wr-pl{font-weight:700;text-decoration:underline;text-underline-offset:3px}
.wr-st-b .wr-pl{font-weight:700}
.wr-st-sig .wr-pl{font-weight:600}
.wr-mvs{flex:none;display:flex;flex-direction:column;gap:2px;justify-content:center}
.wr-mv{width:44px;height:30px;border:1px solid var(--line,#D8E0EE);background:#fff;border-radius:8px;font-size:.9rem;line-height:1;color:#334155;padding:0}
.wr-mv[disabled]{opacity:.35;cursor:default}
.wr-mark{position:absolute;right:6px;top:-6px;font:700 .72rem/1 var(--font-display,inherit);border-radius:99px;padding:4px 8px;background:#fff;box-shadow:0 2px 6px rgba(6,18,51,.25);z-index:1;text-align:left}
.wr-mark.ok{color:#0F766E}.wr-mark.miss{color:#B91C1C}.wr-mark.ord{color:#B45309}
.wr-slot.wr-shake{animation:wr-shake .45s}
.wr-slot.wr-shake .wr-drop{border-color:#DC2626;background:#FEF2F2}
.wr-slot.wr-bad .wr-pls{outline:2px dashed #D97706;outline-offset:2px;border-radius:8px}
.wr-ctl{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.wr-btn{min-height:44px;padding:8px 18px;border-radius:99px;border:2px solid var(--line,#D8E0EE);background:var(--surface,#fff);font-weight:700}
.wr-btn.wr-go{background:var(--wc);color:var(--wct);border-color:var(--wc);box-shadow:0 6px 14px -8px rgba(6,18,51,.6)}
.wr-btn:hover{transform:translateY(-1px)}
.wr-live{margin:0;min-height:2.6em;padding:8px 12px;border-radius:12px;background:var(--sunk,#EEF3FB);font-size:.95rem;line-height:1.4;flex:1 1 100%}
.wr-live.good{background:var(--good-t,#DCFCE7);color:#14532D}
.wr-live.bad{background:var(--bad-t,#FEE2E2);color:#7F1D1D}
.wr-tips{margin:0;padding:10px 14px 10px 30px;border-radius:12px;background:var(--sun-t,#FEF3C7);color:#422006;font-size:.92rem;line-height:1.45}
.wr-tips li{margin:2px 0}
.wr-done .wr-sheet::after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,.75) 50%,transparent 60%);transform:translateX(-120%);animation:wr-shine 1.2s ease-out .1s forwards;pointer-events:none}
@keyframes wr-pulse{0%,100%{box-shadow:0 0 0 0 rgba(37,99,235,0)}50%{box-shadow:0 0 0 5px rgba(37,99,235,.22)}}
@keyframes wr-pop{0%{transform:scale(.9);background:#FEF08A}100%{transform:none;background:transparent}}
@keyframes wr-shake{0%,100%{transform:none}20%{transform:translateX(-7px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(3px)}}
@keyframes wr-shine{to{transform:translateX(120%)}}
@media (min-width:900px){
  .wr-grid{grid-template-columns:minmax(260px,340px) 1fr;gap:16px}
  .wr-tray{top:8px;padding:12px}
  .wr-strip{display:grid;gap:8px;overflow:visible}
  .wr-chip{width:100%}
  .wr-chip span{-webkit-line-clamp:unset;display:block}
  .wr-hold{display:none}
  .wr-sheet{padding:22px 24px 20px}
}
@media (prefers-reduced-motion:reduce){.wr *,.wr *::after{animation:none!important;transition:none!important}}
`;

  // ---------------------------------------------------------------- validation and keys (pure)
  const kindOf = (c) => (c && KINDS[c.kind]) || null;
  const partsOf = (c) => (c && Array.isArray(c.parts) ? c.parts.filter((p) => p && typeof p === 'object') : []);

  function validate(c) {
    const e = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
    Object.keys(c).forEach((k) => { if (!['kind', 'lang', 'task', 'parts'].includes(k)) e.push('unknown key: ' + k); });
    const K = KINDS[c.kind];
    if (!K) e.push('kind: one of ' + KIND_IDS.join(', '));
    if (c.lang != null && c.lang !== 'en' && c.lang !== 'hi') e.push("lang: 'en' or 'hi'");
    if (c.task != null && !isTx(c.task)) e.push('task: a string or { en, hi } with both languages');
    if (!Array.isArray(c.parts)) { e.push('parts: an array'); return e; }
    if (c.parts.length < 2 || c.parts.length > 16) e.push('parts: 2 to 16 parts');
    const ids = new Set(); const count = {};
    c.parts.forEach((p, i) => {
      const w = `parts[${i}]`;
      if (!p || typeof p !== 'object') { e.push(w + ': an object { id, text, slot }'); return; }
      Object.keys(p).forEach((k) => { if (!['id', 'text', 'slot'].includes(k)) e.push(`${w}: unknown key ${k}`); });
      if (typeof p.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(p.id)) e.push(`${w}: id must be letters, digits, - or _`);
      else if (ids.has(p.id)) e.push(`${w}: duplicate id ${p.id}`); else ids.add(p.id);
      if (!isTx(p.text)) e.push(`${w}: text must be a non-empty string or { en, hi } with both languages`);
      else {
        const lens = typeof p.text === 'string' ? [p.text.length] : [p.text.en.length, p.text.hi.length];
        if (lens.some((n) => n > 500)) e.push(`${w}: text is too long (500 characters at most)`);
      }
      if (K) {
        const sl = K.slots.find((s) => s.id === p.slot);
        if (!sl) e.push(`${w}: slot "${p.slot}" does not exist in ${c.kind} (use ${K.slots.map((s) => s.id).join(', ')})`);
        else count[p.slot] = (count[p.slot] || 0) + 1;
      }
    });
    if (K) {
      K.slots.forEach((s) => {
        if (!s.opt && !count[s.id]) e.push(`slot "${s.id}" has no part (a ${c.kind} needs it)`);
        if (!s.multi && count[s.id] > 1) e.push(`slot "${s.id}" takes one part only`);
      });
    }
    return e;
  }

  function keys(c) {
    const ps = partsOf(c).filter((p) => typeof p.id === 'string');
    const K = kindOf(c);
    const used = K ? K.slots.filter((s) => ps.some((p) => p.slot === s.id)).map((s) => s.id) : [];
    return {
      targets: ps.map((p) => 'part:' + p.id).concat(used.map((s) => 'slot:' + s), ['check']),
      events: ps.map((p) => 'placed:' + p.id).concat(['complete', 'wrong-slot']),
    };
  }

  const DEMO = {
    kind: 'formal-letter',
    task: T2('Your school library has no new books. Write to the Principal and ask for some.', 'तुम्हारे विद्यालय के पुस्तकालय में नई किताबें नहीं हैं। प्रधानाचार्य को पत्र लिखकर कुछ किताबें माँगो।'),
    parts: [
      { id: 'sender', slot: 'sender', text: T2('Anita Verma\nClass 8-B, Gyan Jyoti School\nLucknow – 226001', 'अनीता वर्मा\nकक्षा 8-ब, ज्ञान ज्योति विद्यालय\nलखनऊ – 226001') },
      { id: 'date', slot: 'date', text: T2('12 August 2026', '12 अगस्त 2026') },
      { id: 'receiver', slot: 'receiver', text: T2('The Principal\nGyan Jyoti School\nLucknow – 226001', 'सेवा में,\nप्रधानाचार्य महोदय\nज्ञान ज्योति विद्यालय\nलखनऊ – 226001') },
      { id: 'subject', slot: 'subject', text: T2('Request for new books in the school library', 'विद्यालय पुस्तकालय के लिए नई पुस्तकों हेतु निवेदन') },
      { id: 'hello', slot: 'salutation', text: T2('Respected Sir,', 'आदरणीय महोदय,') },
      { id: 'b1', slot: 'body', text: T2('I am a student of Class 8-B. I am writing to request some new books for our school library.', 'मैं कक्षा 8-ब की छात्रा हूँ। मैं आपसे विद्यालय पुस्तकालय के लिए कुछ नई पुस्तकें माँगने के लिए यह पत्र लिख रही हूँ।') },
      { id: 'b2', slot: 'body', text: T2('Most of our books are old and torn, and many students find nothing new to read. Story books and science books are needed most.', 'हमारी अधिकतर पुस्तकें पुरानी और फटी हुई हैं, और कई विद्यार्थियों को पढ़ने के लिए कुछ नया नहीं मिलता। कहानी और विज्ञान की पुस्तकों की सबसे अधिक आवश्यकता है।') },
      { id: 'b3', slot: 'body', text: T2('I request you to order some new books soon. We shall be grateful to you.', 'आपसे निवेदन है कि शीघ्र ही कुछ नई पुस्तकें मँगवाएँ। हम आपके आभारी रहेंगे।') },
      { id: 'close', slot: 'close', text: T2('Yours faithfully,', 'भवदीया,') },
      { id: 'name', slot: 'signature', text: T2('Anita Verma', 'अनीता वर्मा') },
    ],
  };

  // ---------------------------------------------------------------- the lab
  function writing(root, config, api) {
    const K = KINDS[config.kind];
    const parts = config.parts.slice();
    const byId = {}; parts.forEach((p, i) => { byId[p.id] = p; p.idx = i; });
    const slots = K.slots.filter((s) => parts.some((p) => p.slot === s.id));
    const slotIdx = {}; K.slots.forEach((s, i) => { slotIdx[s.id] = i; });
    const slotDef = {}; slots.forEach((s) => { slotDef[s.id] = s; });
    const wl = () => config.lang || api.lang();
    const correct = parts.slice().sort((a, b) => slotIdx[a.slot] - slotIdx[b.slot] || a.idx - b.idx).map((p) => p.id);
    let order = parts.slice().sort((a, b) => hash(a.id + 'w') - hash(b.id + 'w')).map((p) => p.id);
    if (parts.length > 1 && order.join() === correct.join()) order.push(order.shift());

    const S0 = () => ({ placed: {}, lists: {}, sel: null, checked: false, done: false, msg: null, tone: '', tips: false, pop: null, shake: null, focus: null });
    let S = S0();
    slots.forEach((s) => { S.lists[s.id] = []; });
    const total = parts.length;
    const placedN = () => Object.keys(S.placed).length;
    const full = (sid) => { const d = slotDef[sid]; return !d.multi && S.lists[sid].length >= 1 || S.lists[sid].length >= parts.filter((p) => p.slot === sid).length; };
    const orderOk = () => slots.every((s) => !s.multi || S.lists[s.id].join() === parts.filter((p) => p.slot === s.id).map((p) => p.id).join());
    const sname = (s) => api.t(s.n);
    const say = (msg, tone) => { S.msg = msg; S.tone = tone || ''; };

    function draw() {
      const lang = api.lang(); const w = wl();
      const strip = root.querySelector('.wr-strip');
      const keepX = strip ? strip.scrollLeft : 0;
      const tray = order.filter((id) => !S.placed[id]);
      const sel = S.sel && byId[S.sel];
      const tips = (w === 'hi' && K.tipsHi) || K.tips;
      const task = config.task ? api.t(config.task) : '';
      const pct = Math.round((placedN() / total) * 100);
      const chips = tray.map((id) => {
        const p = byId[id]; const txt = partText(p, w);
        return `<li><button type="button" class="wr-chip" data-key="part:${esc(id)}" data-part="${esc(id)}" aria-pressed="${S.sel === id}" aria-label="${esc(short(txt, 140))}"><span lang="${w}">${esc(txt)}</span></button></li>`;
      }).join('');
      const slotsHtml = slots.map((s) => {
        const list = S.lists[s.id]; const isFull = full(s.id);
        const ready = S.sel && !isFull && byId[S.sel] ? ' wr-ready' : '';
        const al = s.al ? ` wr-al-${s.al}` : '';
        let mark = '';
        if (S.checked) {
          const need = parts.filter((p) => p.slot === s.id).length;
          const bad = s.multi && list.length === need && list.join() !== parts.filter((p) => p.slot === s.id).map((p) => p.id).join();
          if (bad) mark = `<span class="wr-mark ord">↕ ${esc(api.t(T2('check the order', 'क्रम देखो')))}</span>`;
          else if (list.length === need) mark = `<span class="wr-mark ok">✓</span>`;
          else mark = `<span class="wr-mark miss">${esc(api.t(T2('not yet', 'अभी बाकी')))}</span>`;
        }
        const rows = list.map((id, i) => {
          const txt = partText(byId[id], w);
          const mv = s.multi && list.length > 1
            ? `<div class="wr-mvs"><button type="button" class="wr-mv" data-up="${esc(id)}" aria-label="${esc(api.t(T2('Move up', 'ऊपर ले जाओ')))}"${i === 0 ? ' disabled' : ''}>▲</button><button type="button" class="wr-mv" data-down="${esc(id)}" aria-label="${esc(api.t(T2('Move down', 'नीचे ले जाओ')))}"${i === list.length - 1 ? ' disabled' : ''}>▼</button></div>` : '';
          return `<li class="wr-plrow"><button type="button" class="wr-pl${S.pop === id ? ' wr-pop' : ''}" data-key="part:${esc(id)}" data-pl="${esc(id)}" lang="${w}" aria-label="${esc(short(txt, 140) + '. ' + api.t(T2('Placed in ', 'यहाँ लगा है: ')) + sname(s) + '. ' + api.t(T2('Press to take it back.', 'वापस लेने के लिए दबाओ।')))}">${esc(txt)}</button>${mv}</li>`;
        }).join('');
        const drop = isFull ? '' : `<button type="button" class="wr-drop${list.length ? ' wr-more' : ''}" data-slotbtn="${esc(s.id)}" aria-label="${esc(api.t(T2('Place here: ', 'यहाँ लगाओ: ')) + sname(s))}">${list.length
          ? `<b>+ ${esc(sname(s))}</b>`
          : `<b>${esc(sname(s))}</b><small>${esc(api.t(s.h))}</small>`}</button>`;
        const lbl = list.length ? `<span class="wr-lbl">${esc(sname(s))}</span>` : '';
        const bad = S.checked && s.multi && list.length === parts.filter((p) => p.slot === s.id).length && list.join() !== parts.filter((p) => p.slot === s.id).map((p) => p.id).join();
        return `<div class="wr-slot${al} wr-st-${s.st || 'n'}${ready}${S.shake === s.id ? ' wr-shake' : ''}${bad ? ' wr-bad' : ''}" data-key="slot:${esc(s.id)}" data-slot="${esc(s.id)}" role="group" aria-label="${esc(sname(s))}">${mark}${lbl}${rows ? `<ul class="wr-pls">${rows}</ul>` : ''}${drop}</div>`;
      }).join('');
      root.innerHTML = `
<div class="wr wr-k-${config.kind}${S.done ? ' wr-done' : ''}" style="--wc:${K.c};--wct:${K.ct}">
  <header class="wr-top">
    <div class="wr-badge">${iconSvg(K.icon)}</div>
    <div class="wr-ttl"><h3>${esc(api.t(K.name))}</h3>${task ? `<p>${esc(task)}</p>` : ''}</div>
    <div class="wr-prog" role="img" aria-label="${esc(placedN() + ' / ' + total)}">${placedN()}/${total}<small>${esc(api.t(T2('placed', 'लगे')))}</small></div>
  </header>
  <div class="wr-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(api.t(T2('Pieces placed', 'लगे हुए टुकड़े')))}"><i style="width:${pct}%"></i></div>
  <div class="wr-grid">
    <section class="wr-tray${tray.length ? '' : ' wr-tray-empty'}" aria-label="${esc(api.t(T2('Pieces to place', 'लगाने के टुकड़े')))}">
      ${tray.length ? `<h4>${esc(api.t(T2('Pieces: tap one', 'टुकड़े: एक छुओ')))}</h4>` : ''}
      ${tray.length ? `<ul class="wr-strip">${chips}</ul>` : `<p class="wr-empty">✓ ${esc(api.t(T2('Every piece is on the page.', 'सारे टुकड़े पन्ने पर लग गए।')))}</p>`}
      <p class="wr-hold">${sel ? `<b>${esc(api.t(T2('Holding: ', 'हाथ में: ')))}</b><span lang="${w}">${esc(short(partText(sel, w), 220))}</span>` : ''}</p>
    </section>
    <section class="wr-sheet" aria-label="${esc(api.t(T2('The page you are building', 'जो पन्ना तुम बना रहे हो')))}">${slotsHtml}</section>
  </div>
  <div class="wr-ctl">
    <button type="button" class="wr-btn wr-go" data-key="check" data-act="check">${esc(api.t(T2('Check my page', 'मेरा पन्ना जाँचो')))}</button>
    <button type="button" class="wr-btn" data-act="reset">${esc(api.t(T2('Start again', 'फिर से शुरू')))}</button>
    <button type="button" class="wr-btn" data-act="tips" aria-expanded="${S.tips}">${esc(api.t(T2('Format tips', 'प्रारूप के सुझाव')))}</button>
    <p class="wr-live ${S.tone}" aria-live="polite" role="status">${S.msg ? esc(S.msg) : ''}</p>
  </div>
  ${S.tips ? `<ul class="wr-tips">${tips.map((t) => `<li>${esc(api.t(t))}</li>`).join('')}</ul>` : ''}
</div>`;
      const ns = root.querySelector('.wr-strip');
      if (ns) ns.scrollLeft = keepX;
      const f = S.focus && root.querySelector(S.focus);
      if (f) f.focus({ preventScroll: true });
      S.focus = null; S.pop = null; S.shake = null;
    }

    function afterChange(focus) {
      S.checked = false; S.done = false; S.focus = focus || null; draw();
    }
    function evaluate() {
      if (placedN() < total || S.done) return false;
      if (!orderOk()) return false;
      S.done = true; return true;
    }

    function pick(id) {
      if (!api.allowed('part:' + id)) { api.nudge('part:' + id); return; }
      if (S.sel === id) { S.sel = null; say(''); S.checked = false; S.focus = `[data-part="${id}"]`; draw(); return; }
      S.sel = id;
      say(api.t(T2('Now tap the place on the page where it belongs.', 'अब पन्ने पर वह जगह छुओ जहाँ यह लगेगा।')));
      S.checked = false; S.focus = `[data-part="${id}"]`; draw();
      api.speak(partText(byId[id], wl()), wl());
    }
    function place(sid) {
      const id = S.sel;
      if (!id) { say(api.t(T2('First tap a piece from the top.', 'पहले ऊपर से एक टुकड़ा छुओ।'))); draw(); return; }
      if (!api.allowed('slot:' + sid)) { api.nudge('slot:' + sid); return; }
      const p = byId[id]; const s = slotDef[sid];
      if (p.slot !== sid) {
        S.shake = sid;
        say(api.t(T2('Not here. ', 'यहाँ नहीं। ')) + api.t(T2('This place is for: ', 'इस जगह के लिए है: ')) + api.t(s.h) + ' ' + api.t(T2('Does your piece do that?', 'क्या तुम्हारा टुकड़ा यह करता है?')), 'bad');
        S.checked = false; S.focus = `[data-slotbtn="${sid}"]`; draw();
        api.record(api.t(T2('Tried the wrong place: ', 'गलत जगह आज़माई: ')) + sname(s));
        api.emit('wrong-slot');
        return;
      }
      if (full(sid)) { say(api.t(T2('That place is already full.', 'यह जगह पहले से भरी है।'))); draw(); return; }
      S.placed[id] = sid; S.lists[sid].push(id); S.sel = null; S.pop = id;
      const done = evaluate();
      const n = placedN();
      if (done) say(api.t(T2('The page is complete and in the right order. Well done!', 'पन्ना पूरा है और क्रम सही है। शाबाश!')), 'good');
      else if (n === total) say(api.t(T2('Everything is placed. Now check the order of the parts in the same place.', 'सब लग गया। अब एक ही जगह के भागों का क्रम देखो।')));
      else say(api.t(T2('Good! ', 'बहुत बढ़िया! ')) + n + '/' + total);
      S.checked = false; S.focus = `[data-pl="${id}"]`;
      const wasDone = S.done; draw();
      api.record(api.t(T2('Placed “', 'लगाया “')) + short(partText(p, wl()), 40) + api.t(T2('” in ', '” यहाँ: ')) + sname(s));
      api.emit('placed:' + id);
      if (wasDone) { api.emit('complete'); api.celebrate(); }
    }
    function unplace(id) {
      const sid = S.placed[id];
      delete S.placed[id]; S.lists[sid] = S.lists[sid].filter((x) => x !== id);
      say(api.t(T2('Taken back. Choose where it goes.', 'वापस ले लिया। फिर से जगह चुनो।')));
      S.sel = id; afterChange(`[data-part="${id}"]`);
    }
    function move(id, d) {
      const sid = S.placed[id]; const l = S.lists[sid]; const i = l.indexOf(id); const j = i + d;
      if (j < 0 || j >= l.length) return;
      [l[i], l[j]] = [l[j], l[i]];
      const done = evaluate();
      say(done ? api.t(T2('The page is complete and in the right order. Well done!', 'पन्ना पूरा है और क्रम सही है। शाबाश!')) : api.t(T2('Moved.', 'खिसका दिया।')), done ? 'good' : '');
      S.checked = false; S.focus = `[data-${d < 0 ? 'up' : 'down'}="${id}"]`; const wasDone = S.done; draw();
      if (wasDone) { api.emit('complete'); api.celebrate(); }
    }
    function check() {
      if (!api.allowed('check')) { api.nudge('check'); return; }
      const missing = slots.filter((s) => S.lists[s.id].length < parts.filter((p) => p.slot === s.id).length);
      const wrongOrder = slots.filter((s) => s.multi && S.lists[s.id].length === parts.filter((p) => p.slot === s.id).length && S.lists[s.id].join() !== parts.filter((p) => p.slot === s.id).map((p) => p.id).join());
      let m; let tone = '';
      if (!missing.length && !wrongOrder.length) { m = api.t(T2('Every part is in its place and in the right order. Well done!', 'हर भाग अपनी जगह पर है और क्रम सही है। शाबाश!')); tone = 'good'; }
      else if (wrongOrder.length) { m = api.t(T2('Check the order in: ', 'इसका क्रम देखो: ')) + wrongOrder.map(sname).join(', ') + '. ' + api.t(T2('Use the arrows to move a part.', 'तीर से भाग को खिसकाओ।')); tone = 'bad'; }
      else m = api.t(T2('Still to place: ', 'अभी लगाना बाकी: ')) + missing.map(sname).join(', ') + '.';
      say(m, tone); S.checked = true; S.focus = '[data-act="check"]';
      const wasDone = !S.done && !missing.length && !wrongOrder.length;
      if (wasDone) S.done = true;
      draw();
      api.record(api.t(T2('Checked the page: ', 'पन्ना जाँचा: ')) + m);
      if (wasDone) { api.emit('complete'); api.celebrate(); }
    }
    function reset() {
      const w = S.tips; S = S0(); S.tips = w;
      slots.forEach((s) => { S.lists[s.id] = []; });
      say(api.t(T2('Cleared. Start again.', 'साफ़ कर दिया। फिर से शुरू करो।')));
      draw();
    }

    function onClick(ev) {
      const t = ev.target;
      const act = t.closest('[data-act]');
      if (act && root.contains(act)) {
        const a = act.dataset.act;
        if (a === 'check') check(); else if (a === 'reset') reset();
        else if (a === 'tips') { S.tips = !S.tips; S.focus = '[data-act="tips"]'; draw(); }
        return;
      }
      const up = t.closest('[data-up]'); const dn = t.closest('[data-down]');
      if (up) { move(up.dataset.up, -1); return; }
      if (dn) { move(dn.dataset.down, 1); return; }
      const chip = t.closest('[data-part]');
      if (chip) { pick(chip.dataset.part); return; }
      const pl = t.closest('[data-pl]');
      if (pl) {
        const sid = S.placed[pl.dataset.pl];
        if (S.sel && !full(sid)) { place(sid); return; }
        if (S.sel && full(sid) && byId[S.sel].slot !== sid) { place(sid); return; }
        if (!api.allowed('part:' + pl.dataset.pl)) { api.nudge('part:' + pl.dataset.pl); return; }
        unplace(pl.dataset.pl); return;
      }
      const slot = t.closest('[data-slot]');
      if (slot && root.contains(slot)) place(slot.dataset.slot);
    }
    root.addEventListener('click', onClick);
    say('');
    draw();
    return { destroy() { root.removeEventListener('click', onClick); root.innerHTML = ''; } };
  }

  NCA_T.register({
    id: 'writing',
    css: CSS,
    validate,
    keys,
    demo: DEMO,
    kinds: KIND_IDS,
    slotsOf: (kind) => (KINDS[kind] ? KINDS[kind].slots.map((s) => s.id) : []),
    mount(root, config, api) { return writing(root, config, api); },
  });
})();
