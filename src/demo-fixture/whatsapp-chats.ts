// WhatsApp conversations for the website's phone previews. EVERYTHING is
// fictional (Sunrise International, Rahul Sharma, Class 5).
//
// PARENT_CHAT is the founder's NetCyberAI_Parent_WhatsApp_iPhone reference,
// message for message, bilingual English + Hindi as designed, with four
// understanding responses. Edits, each required by the Constitution
// (Decision Log C75):
//   - Weekly Growth Brief: the ranked list of ten named classmates
//     ("#7 of 60") becomes Rahul measured against his own past
//     (Personal Best is primary, never "Rank 1/2/3", §5; other children's
//     positions are never shown to a parent).
//   - PTM invite: Class Shine wording ("one of 3 students who shone"),
//     without naming other children.
//   - Celebration: "now #3 in Class 5" becomes a Personal Best.
//   - "Open Parent App" becomes the chat's own menu (no parent app or
//     login in Phase 1, C13; WhatsApp is the primary channel, §9).
//   - "Fee recovery" becomes a fee reminder; receipts say "demo".
// The other roles' chats follow the same visual language.

import type { ModuleId } from './principal-dashboard';

export type Bi = { en: string; hi?: string };

export type ChatAction = { id: string; label: string; hi?: string; kind?: 'fb' | 'pay' | 'ghost' | 'open' | 'download' };

export type ChatBlock =
  | { t: 'subjects'; items: { title: string; q: string; hi: string; n: string }[] }
  | { t: 'understanding' }
  | { t: 'homework'; title: string; rate: string; done: number; legend: [string, string]; rows: { b: string; s: string }[] }
  | { t: 'actions'; items: ChatAction[] }
  | { t: 'teachers' }
  | { t: 'system'; text: string }
  | { t: 'callout'; text: string }
  | { t: 'photo'; src: string; alt: string }
  | { t: 'certificate'; src: string; alt: string }
  | { t: 'growth'; rows: { label: string; was: number; now: number; delta: string }[] }
  | { t: 'kpis'; items: { value: string; label: string }[] }
  | { t: 'rows'; items: { left: string; right: string; tone: 'ok' | 'warn' | 'bad' }[] };

export type ChatMsg =
  | { k: 'sep'; text: string }
  | { k: 'school'; label: string; title?: Bi; paras?: Bi[]; blocks?: ChatBlock[]; meta: string }
  | { k: 'parent'; text: Bi; meta: string };

export const FEE = { amount: '₹8,400', breakup: 'September fee breakup: Tuition ₹7,200 + Activity ₹1,200 = ₹8,400.' };

export const UNDERSTANDING: { en: string; hi: string; reply: string }[] = [
  { en: 'Understood well ✅', hi: 'अच्छी तरह समझा', reply: 'Thank you. We recorded that Rahul followed today’s learning confidently. / धन्यवाद। आज की सीख के लिए राहुल की अच्छी समझ दर्ज की गई है।' },
  { en: 'Partly understood 🟡', hi: 'कुछ समझा', reply: 'Thank you. We recorded partial understanding and highlighted today’s topics for teacher review. / धन्यवाद। आंशिक समझ दर्ज की गई और आज के विषय शिक्षक समीक्षा के लिए चिह्नित किए गए।' },
  { en: 'Understood but can’t explain 🟠', hi: 'समझा, पर समझा नहीं पा रहा', reply: 'Thank you. We recorded that Rahul understands the idea but needs more recall and explanation practice at home. / धन्यवाद। राहुल अवधारणा समझता है, लेकिन उसे याद करके समझाने के लिए थोड़ा और अभ्यास चाहिए।' },
  { en: 'Not understood ❌', hi: 'समझ नहीं आया', reply: 'Thank you. We recorded that Rahul needs support on today’s learning. The relevant teacher can follow up. / धन्यवाद। आज की सीख में राहुल को सहायता चाहिए—संबंधित शिक्षक आगे देख सकेंगे।' },
];

export const TEACHERS: { name: string; initials: string; subject: string; note: string }[] = [
  { name: 'Priya Mehta', initials: 'PM', subject: 'Mathematics + Computer', note: 'Fractions → reasoning improving' },
  { name: 'Arjun Malik', initials: 'AM', subject: 'English', note: 'strong reading participation' },
  { name: 'Neha Verma', initials: 'NV', subject: 'Hindi', note: 'oral answers strong, written detail next' },
  { name: 'Ritu Gupta', initials: 'RG', subject: 'EVS', note: 'river systems discussion stood out' },
  { name: 'Anuj Kapoor', initials: 'AK', subject: 'General Awareness', note: 'map-reading accuracy improving' },
];

export const TEACHER_FOCUS = ['Very helpful / बहुत मददगार', 'Strong subject understanding / विषय की अच्छी समझ', 'Needs more practice support / अधिक अभ्यास सहायता', 'Communication could improve / संवाद में सुधार चाहिए'];
export const TEACHER_QUESTION = ['Subject progress', 'Homework', 'Classroom participation', 'PTM discussion'];

export const PARENT_CHAT: ChatMsg[] = [
  { k: 'sep', text: 'TODAY · DAILY LEARNING PULSE' },
  {
    k: 'school',
    label: '☀️ NETCYBERAI · DAILY LEARNING PULSE',
    title: { en: 'Today’s learning at school / आज स्कूल में राहुल ने क्या सीखा? 👋' },
    paras: [
      {
        en: 'Sharma ji, Rahul learned the topics below today. A few minutes of recall at dinner or any free time can help him remember the lesson and explain it confidently.',
        hi: 'शर्मा जी, आज राहुल ने नीचे दिए गए विषय सीखे। रात के खाने या किसी खाली समय में कुछ मिनट चर्चा करने से उसे पाठ याद करने और आत्मविश्वास से समझाने में मदद मिल सकती है।',
      },
    ],
    blocks: [
      {
        t: 'subjects',
        items: [
          { n: 'Q1', title: 'English · Ch 3 — The Rainbow · Arjun Malik', q: 'What can cause a rainbow to appear?', hi: 'इंद्रधनुष बनने के लिए किन दो प्राकृतिक परिस्थितियों की ज़रूरत पड़ सकती है?' },
          { n: 'Q2', title: 'Hindi · Ch 5 — सुंदरिया · Neha Verma', q: 'What quality of care or kindness stands out in the lesson?', hi: 'इस पाठ में देखभाल या अपनापन किस रूप में दिखाई देता है?' },
          { n: 'Q3', title: 'Mathematics · Ch 2 — Fractions · Priya Mehta', q: 'Which is greater: 3/4 or 5/8? Explain briefly.', hi: 'इनमें कौन बड़ा है: 3/4 या 5/8? छोटा-सा कारण बताइए।' },
          { n: 'Q4', title: 'EVS · Ch 2 — Journey of a River · Ritu Gupta', q: 'Name one way a river supports people and nature.', hi: 'एक ऐसा तरीका बताइए जिससे नदी लोगों और प्रकृति की मदद करती है।' },
          { n: 'Q5', title: 'Computer · Safe & Smart Internet Use · Priya Mehta', q: 'Why should we never share a password or OTP?', hi: 'पासवर्ड या OTP किसी के साथ साझा क्यों नहीं करना चाहिए?' },
          { n: 'Q6', title: 'General Awareness · India & Maps · Anuj Kapoor', q: 'On a map, which direction is Delhi from Jammu & Kashmir?', hi: 'मानचित्र पर दिल्ली जम्मू-कश्मीर की किस दिशा में है?' },
        ],
      },
      { t: 'understanding' },
    ],
    meta: '10:08 AM',
  },
  { k: 'parent', text: { en: '**Sharma ji:** Partially understood Mathematics today. We’ll revise Fractions together after dinner. / आज गणित कुछ समझा है; रात में Fractions साथ दोहराएँगे।' }, meta: '10:09 AM' },
  {
    k: 'school',
    label: '✓ RESPONSE RECORDED',
    paras: [{ en: 'Thank you, Sharma ji. The Mathematics topic is marked for focused teacher follow-up. / धन्यवाद, शर्मा जी। गणित के विषय को शिक्षक फॉलो-अप के लिए चिन्हित किया गया है।' }],
    blocks: [{ t: 'system', text: 'Parent response → Class Teacher → Academic dashboard' }],
    meta: '10:10 AM',
  },
  {
    k: 'school',
    label: '📚 HOMEWORK FOLLOW-UP · YESTERDAY',
    title: { en: 'Two homework items were not completed / कल के दो होमवर्क पूरे नहीं हुए' },
    paras: [
      {
        en: 'Rahul still needs to complete **Mathematics** and **Hindi** homework from yesterday. Sharma ji, please help make a simple daily habit: ask Rahul, “Is your homework completed?”',
        hi: 'राहुल का कल का **गणित** और **हिंदी** का होमवर्क अभी पूरा नहीं हुआ है। शर्मा जी, रोज़ एक छोटी आदत बनाइए—राहुल से पूछिए, “क्या आज का होमवर्क पूरा हुआ?”',
      },
    ],
    blocks: [
      {
        t: 'homework',
        title: 'Class 5 homework completion',
        rate: '95% complete',
        done: 95,
        legend: ['✅ 95% completed', '⚠️ 5% pending'],
        rows: [
          { b: 'Mathematics · Fractions', s: 'Worksheet · 8 questions' },
          { b: 'Hindi · Chapter exercise', s: 'Written practice · 1 page' },
        ],
      },
      {
        t: 'actions',
        items: [
          { id: 'hw-ack', label: '✅ Acknowledge / स्वीकार किया' },
          { id: 'hw-complete', label: '☑️ We’ll complete it / पूरा करेंगे' },
          { id: 'hw-help', label: '💬 Need help / मदद चाहिए' },
        ],
      },
    ],
    meta: 'Yesterday · 6:10 PM',
  },
  { k: 'parent', text: { en: '✅ **We’ll complete both subjects tonight.** / आज गणित और हिंदी दोनों का होमवर्क पूरा करेंगे। We’ll check homework every day before bedtime.' }, meta: '6:18 PM' },
  { k: 'school', label: '✓ HOMEWORK FOLLOW-THROUGH RECORDED', paras: [{ en: 'Thanks, Sharma ji. The school can see that the home follow-through plan was acknowledged.' }], meta: '6:19 PM' },
  { k: 'sep', text: 'TEACHER INSIGHT' },
  {
    k: 'school',
    label: '🧑‍🏫 TEACHER PULSE · SUBJECT-WISE',
    title: { en: 'Teachers assigned to Rahul / राहुल के विषय-शिक्षक' },
    paras: [{ en: 'Tap any teacher to rate the experience, share feedback or ask a specific question.' }],
    blocks: [{ t: 'teachers' }, { t: 'callout', text: 'Parent feedback is shared with the teacher and school dashboard. / अभिभावक की प्रतिक्रिया शिक्षक और स्कूल डैशबोर्ड तक पहुँचती है।' }],
    meta: 'Friday · 4:20 PM',
  },
  { k: 'parent', text: { en: '⭐ **Sharma ji:** Priya Ma’am, thank you. Rahul is more confident in Mathematics now. / राहुल अब गणित में अधिक आत्मविश्वासी है। Please continue the same support.' }, meta: 'Friday · 4:28 PM' },
  { k: 'school', label: '✓ TEACHER FEEDBACK RECEIVED', paras: [{ en: 'Thank you, Sharma ji. Your 5/5 feedback and note were shared with Priya Mehta and logged for the school team.' }], meta: '4:29 PM' },
  { k: 'sep', text: 'WEEKLY GROWTH' },
  {
    k: 'school',
    label: '🏆 WEEKLY GROWTH BRIEF',
    paras: [
      {
        en: '**Rahul beat his own best in 4 of 5 subjects this fortnight.** His strongest movement is in Mathematics reasoning and map-based EVS work. Rahul is compared only with Rahul, never with classmates.',
        hi: '**इस पखवाड़े राहुल ने 5 में से 4 विषयों में अपना ही पिछला रिकॉर्ड बेहतर किया।** गणितीय तर्क और मानचित्र-आधारित EVS कार्य में सबसे अच्छी प्रगति हुई है।',
      },
    ],
    blocks: [
      {
        t: 'growth',
        rows: [
          { label: 'Mathematics', was: 72, now: 88, delta: '72 → 88' },
          { label: 'EVS', was: 70, now: 82, delta: '70 → 82' },
          { label: 'English', was: 78, now: 84, delta: '78 → 84' },
          { label: 'Hindi', was: 74, now: 79, delta: '74 → 79' },
          { label: 'Computer', was: 86, now: 85, delta: 'steady' },
        ],
      },
    ],
    meta: 'Weekly summary',
  },
  {
    k: 'school',
    label: '💡 KEEP ENCOURAGING RAHUL',
    paras: [{ en: '**Keep encouraging Rahul / राहुल को प्रोत्साहित करते रहें:** ask him to explain one fraction example and one river idea in his own words. A little daily conversation helps him beat his own best again.' }],
    blocks: [
      {
        t: 'actions',
        items: [
          { id: 'connect-rahul', label: '💬 Connect with Rahul', hi: 'राहुल से बात करें' },
          { id: 'view-growth', label: '📈 View growth', hi: 'प्रगति देखें' },
        ],
      },
    ],
    meta: 'Weekly summary',
  },
  { k: 'parent', text: { en: '💬 **Sharma ji:** We’re proud of Rahul. We’ll keep encouraging him to beat his own best. / हमें राहुल पर गर्व है। हम उसे अपना ही रिकॉर्ड बेहतर करने के लिए प्रोत्साहित करेंगे।' }, meta: 'Sunday · 6:17 PM' },
  { k: 'sep', text: 'PTM' },
  {
    k: 'school',
    label: '🤝 PTM SMART INVITE',
    paras: [
      { en: '**Rahul is one of the 3 students who shone in Class 5 this fortnight.** 🌟', hi: '**इस पखवाड़े कक्षा 5 में चमकने वाले 3 विद्यार्थियों में राहुल भी है।** 🌟' },
      {
        en: 'Rahul is among the students showing strong improvement. Please join us at PTM so you can feel proud of his progress and celebrate this moment with his teachers.',
        hi: 'राहुल ने इस अवधि में अच्छी प्रगति दिखाई है। कृपया PTM में शामिल होकर उसकी उपलब्धि पर गर्व करें और शिक्षकों के साथ इस खुशी के पल को मनाएँ।',
      },
    ],
    blocks: [
      {
        t: 'actions',
        items: [
          { id: 'ptm-yes', label: '✅ Book PTM', hi: 'PTM बुक करें' },
          { id: 'ptm-question', label: '💬 Ask the school', hi: 'स्कूल से पूछें' },
        ],
      },
    ],
    meta: 'Next PTM cycle · 5:40 PM',
  },
  { k: 'parent', text: { en: '✅ Please book Rahul’s PTM. We’d love to celebrate his progress with his teachers. / कृपया राहुल की PTM बुक करें। हम शिक्षकों के साथ उसकी प्रगति का जश्न मनाना चाहते हैं।' }, meta: '5:42 PM' },
  { k: 'school', label: '📅 PTM REQUEST RECORDED', paras: [{ en: 'Booked request received, Sharma ji. The school will confirm the final slot and teacher panel.' }], meta: '5:43 PM' },
  { k: 'sep', text: 'FEES' },
  {
    k: 'school',
    label: '💳 FEE REMINDER',
    paras: [
      { en: `**September fee due: ${FEE.amount}** for Rahul · Class 5. A secure online payment link is ready.`, hi: `**सितंबर शुल्क: ${FEE.amount}**। राहुल · कक्षा 5। सुरक्षित ऑनलाइन भुगतान लिंक तैयार है।` },
    ],
    blocks: [
      {
        t: 'actions',
        items: [
          { id: 'pay-fee', label: `Pay ${FEE.amount} / भुगतान करें`, kind: 'pay' },
          { id: 'fee-breakup', label: 'View breakup / विवरण', kind: 'ghost' },
        ],
      },
    ],
    meta: '5:52 PM',
  },
  { k: 'parent', text: { en: '✅ **Sharma ji:** Payment is completed. Thank you for the simple online process. / भुगतान पूरा हो गया।' }, meta: '5:57 PM' },
  {
    k: 'school',
    label: '✅ PAYMENT RECEIVED',
    paras: [{ en: `Thank you. Rahul’s September fee of **${FEE.amount}** has been received and matched to the school ledger.`, hi: `धन्यवाद। राहुल का ${FEE.amount} शुल्क सफलतापूर्वक दर्ज और लेजर में मिलान हो गया है।` }],
    blocks: [{ t: 'actions', items: [{ id: 'download-receipt', label: '⬇ Download receipt PDF', kind: 'download' }] }],
    meta: '5:58 PM',
  },
  { k: 'sep', text: 'RECOGNITION' },
  {
    k: 'school',
    label: '🎉 PROGRESS CELEBRATION',
    paras: [
      {
        en: '**🎉 Big News — Rahul reached a new Personal Best!** His Mathematics reasoning rose from 72% to 88% this month, the best he has ever done. We are celebrating this growth with his teachers and family. Sharma ji, this is a proud moment for your family.',
        hi: '**🎉 बड़ी खबर — राहुल ने अपना अब तक का सबसे अच्छा प्रदर्शन किया!** इस महीने उसका गणितीय तर्क 72% से बढ़कर 88% हो गया। शर्मा जी, यह आपके परिवार के लिए गर्व का पल है।',
      },
    ],
    blocks: [
      { t: 'photo', src: '/demo/rahul-family.webp', alt: 'Fictional family celebrating Rahul with the school principal' },
      {
        t: 'actions',
        items: [
          { id: 'celebrate', label: '🎉 Celebrate with Rahul', hi: 'राहुल के साथ जश्न मनाएँ' },
          { id: 'coach-home', label: '🏠 Home activity', hi: 'घर की गतिविधि' },
          { id: 'share-achievement', label: '↗ Share with Family', hi: 'परिवार के साथ साझा करें' },
        ],
      },
    ],
    meta: '8:10 PM',
  },
  { k: 'parent', text: { en: '🎉 **Sharma ji:** We’re very proud of Rahul. We’d like to share this achievement with our family.' }, meta: '8:11 PM' },
  {
    k: 'school',
    label: '🏅 PROGRESS CERTIFICATE',
    paras: [{ en: '**Rahul’s Progress Certificate is ready / राहुल का प्रगति प्रमाणपत्र तैयार है.** It records his improvement journey and monthly growth. Issued after the September fee was cleared.' }],
    blocks: [
      { t: 'certificate', src: '/demo/rahul-certificate.webp', alt: 'Progress Certificate awarded to Rahul Sharma (demo school)' },
      {
        t: 'actions',
        items: [
          { id: 'view-certificate', label: '👁 View certificate', kind: 'ghost' },
          { id: 'download-certificate', label: '⬇ Download certificate', kind: 'open' },
          { id: 'share-certificate', label: '↗ Share with Family', kind: 'ghost' },
        ],
      },
    ],
    meta: '8:12 PM',
  },
  { k: 'parent', text: { en: '🎉 **Sharma ji:** Thank you. We’re proud of Rahul and will share his certificate with family.' }, meta: '8:13 PM' },
  {
    k: 'school',
    label: '📋 EVERYTHING, RIGHT HERE',
    paras: [
      {
        en: 'For the full picture — attendance, homework, marks, teacher notes, fees, receipts, PTM, documents and consent — tap Menu in this chat. No app to install, no password.',
        hi: 'पूरी जानकारी के लिए—उपस्थिति, होमवर्क, अंक, शिक्षक नोट्स, शुल्क, रसीदें, PTM, दस्तावेज़ और सहमति—इसी चैट में Menu दबाइए। कोई ऐप या पासवर्ड नहीं।',
      },
    ],
    blocks: [{ t: 'actions', items: [{ id: 'open-menu', label: '☰ Open menu / मेनू खोलें', kind: 'open' }] }],
    meta: '8:14 PM',
  },
];

// Scripted replies for the action buttons (parent line, then school).
export const PARENT_ACTION_REPLIES: Record<string, { parent?: string; school?: { label: string; text: string }; toast?: string }> = {
  'hw-ack': { parent: '✅ We acknowledge the homework reminder. We’ll check Rahul’s homework every day.', toast: 'Homework reminder acknowledged.' },
  'hw-complete': { parent: '📚 We’ll complete the Mathematics and Hindi homework tonight.', school: { label: '✓ HOMEWORK PLAN RECORDED', text: 'Thank you. The school dashboard will show this as a parent follow-through response.' }, toast: 'Homework completion plan recorded.' },
  'hw-help': { parent: '💬 We need help with the Mathematics Fractions homework.', school: { label: '🧑‍🏫 HELP REQUEST ROUTED', text: 'The Mathematics teacher has received a homework-help request for Rahul.' }, toast: 'Homework help request sent.' },
  'connect-rahul': { parent: 'We’ll talk with Rahul tonight and ask him to explain one fraction example and one river idea.' },
  'view-growth': { toast: 'Rahul’s growth detail: 4 of 5 subjects above his own last fortnight.' },
  'ptm-yes': { parent: '✅ Please book Rahul’s PTM slot for us.', school: { label: '📅 PTM BOOKED', text: 'Your PTM request is recorded. The school will confirm the available slot and teacher panel.' }, toast: 'PTM request recorded.' },
  'pay-fee': { parent: `**Payment authorisation submitted** for ${FEE.amount}.`, school: { label: '✅ PAYMENT RECEIVED', text: `Thank you. ${FEE.amount} received and matched to the school ledger. Your receipt is ready below.` }, toast: 'Payment verified and receipt generated (demo).' },
  'fee-breakup': { toast: FEE.breakup },
  celebrate: { parent: '🎉 We are proud of Rahul! We’ll celebrate this progress with him.' },
  'coach-home': { toast: '12-minute home activity opened: explain 3 fraction pairs aloud.' },
};

// The chat menu (WhatsApp list message): every parent module of the
// principal dashboard, answered inside the chat.
export const PARENT_MENU: { id: string; icon: string; label: string; hint: string; reply: string }[] = [
  { id: 'attendance', icon: '✅', label: 'Attendance', hint: 'This month, day by day', reply: 'Rahul · September: present 19 of 20 school days. Absent Mon 15 Sep (fever, informed by you).' },
  { id: 'homework', icon: '📚', label: 'Homework', hint: 'Due and pending', reply: 'Maths worksheet due Friday · pending. English poem · submitted. EVS river diagram · due Monday.' },
  { id: 'marks', icon: '🏆', label: 'Marks & Personal Best', hint: 'Latest tests', reply: 'Maths Fractions check 18/20 (Personal Best, up from 14). English reading 16/20. EVS quiz 17/20.' },
  { id: 'fees', icon: '💳', label: 'Fees & payment', hint: 'Dues and UPI link', reply: 'No dues. September fee paid on 24 Sep. Next instalment due 10 Oct.' },
  { id: 'receipts', icon: '🧾', label: 'Receipts', hint: 'Past payments', reply: 'Sep, Aug and Jul receipts are available as PDFs in this chat.' },
  { id: 'ptm', icon: '🤝', label: 'Book PTM slot', hint: 'Meet the class teacher', reply: 'PTM Sat 26 Sep with Priya Mehta. Reply with a time: 10:20, 10:50 or 11:30.' },
  { id: 'notices', icon: '📢', label: 'Notices & events', hint: 'Circulars, holidays', reply: '26 Sep PTM · 28 Sep Science Exhibition · 02 Oct holiday (Gandhi Jayanti).' },
  { id: 'teacher', icon: '💬', label: 'Message a teacher', hint: 'Reaches the class teacher', reply: 'Type your message. It reaches Priya Mehta, who replies during school hours.' },
  { id: 'concern', icon: '⚠️', label: 'Raise a concern', hint: 'Tracked until resolved', reply: 'Concern CN-1043 opened. You will get updates here until it is resolved.' },
  { id: 'documents', icon: '📄', label: 'Documents', hint: 'Certificates, ID card', reply: 'ID card (QR) ready · Bonafide certificate on request · Report card after Term 1 results.' },
  { id: 'consent', icon: '🛡️', label: 'Consent & preferences', hint: 'Language, what you receive', reply: 'Language: English + Hindi · Daily Pulse on · Fee reminders on. You can change or withdraw consent any time.' },
];

export const RECEIPT_LINES = [
  'Sunrise International School (DEMO - fictional school)',
  'FEE RECEIPT - ACADEMIC SESSION 2026-27',
  'Receipt No: SI/2026/0924/00123',
  'Student: Rahul Sharma',
  'Class: 5',
  'Fee Cycle: September 2026',
  'Tuition Fee: INR 7,200',
  'Activity Fee: INR 1,200',
  'Total Paid: INR 8,400',
  'Status: PAID - Online - Verified',
  'Principal: Dr. B. Sharma',
  'Demo document from netcyberai.com. Not a valid receipt.',
];

// ---- The same phone, for the other roles ------------------------------------

export type RoleChatId = 'principal' | 'teachers' | 'students' | 'parents' | 'admin' | 'finance';

export const ROLE_CHATS: Record<Exclude<RoleChatId, 'parents'>, { title: string; sub: string; avatar: string; messages: ChatMsg[]; open: ModuleId }> = {
  principal: {
    title: 'NetCyberAI · Principal',
    sub: 'Daily digest · Sunrise International',
    avatar: 'AP',
    open: 'attendance',
    messages: [
      { k: 'sep', text: 'TODAY · MORNING DIGEST' },
      {
        k: 'school',
        label: '☀️ MORNING DIGEST · 9:15 AM',
        title: { en: 'Good morning, Principal. Your school at a glance.' },
        blocks: [
          {
            t: 'kpis',
            items: [
              { value: '1,180 / 1,240', label: 'present today (95.2%)' },
              { value: '78%', label: 'fees collected this term' },
              { value: '3', label: 'open exceptions' },
              { value: '71%', label: 'parents replied to Pulse' },
            ],
          },
        ],
        meta: '9:15 AM',
      },
      {
        k: 'school',
        label: '🚨 NEEDS AN OWNER',
        blocks: [
          {
            t: 'rows',
            items: [
              { left: 'Riya (6-A) absent 3 days, no reason', right: 'Unassigned', tone: 'bad' },
              { left: '12 fee reminders unanswered 7+ days', right: 'Accounts', tone: 'warn' },
              { left: 'Pulse not sent: 8-A Hindi', right: 'Subject teacher', tone: 'warn' },
            ],
          },
          { t: 'actions', items: [{ id: 'assign', label: '👤 Assign Riya to class teacher' }, { id: 'open-dash', label: '📊 Open dashboard' }] },
        ],
        meta: '9:16 AM',
      },
      { k: 'parent', text: { en: 'Assign Riya to the class teacher.' }, meta: '9:20 AM' },
      { k: 'school', label: '✓ ASSIGNED', paras: [{ en: 'Assigned to Priya Mehta. You will see it close on the dashboard.' }], meta: '9:20 AM' },
      {
        k: 'school',
        label: '✍️ APPROVALS WAITING',
        blocks: [
          {
            t: 'rows',
            items: [
              { left: 'Leave: Mrs Gupta, Fri · cover found', right: 'Approve', tone: 'ok' },
              { left: 'Marks publish: Class 5 Fractions check', right: 'Review', tone: 'warn' },
              { left: 'Transfer certificate: Class 8 · fees cleared', right: 'Approve', tone: 'ok' },
            ],
          },
          { t: 'actions', items: [{ id: 'approve-all', label: '✅ Approve the two ready items' }] },
        ],
        meta: '11:40 AM',
      },
      { k: 'sep', text: 'SATURDAY' },
      {
        k: 'school',
        label: '📈 WEEKLY CONFIDENCE BRIEF',
        paras: [{ en: 'Parents replied to 71% of Pulses. Maths Fractions needs the most support in Classes 5–6; 14 students set a Personal Best this week.' }],
        blocks: [{ t: 'system', text: 'Teacher Impact Cards are private to each teacher and you.' }],
        meta: 'Sat · 10:00 AM',
      },
    ],
  },
  teachers: {
    title: 'NetCyberAI · Staff',
    sub: 'Priya Mehta · Mathematics',
    avatar: 'PM',
    open: 'teacher-copilot',
    messages: [
      { k: 'sep', text: 'TODAY' },
      {
        k: 'school',
        label: '☀️ MORNING BRIEF',
        title: { en: 'Good morning, Priya. 5 periods today.' },
        blocks: [
          {
            t: 'rows',
            items: [
              { left: '08:40 · 6-A Mathematics · Fractions', right: 'Ready', tone: 'ok' },
              { left: '09:30 · 7-B Mathematics · Ratio', right: 'Ready', tone: 'ok' },
              { left: '10:20 · 9-B Science · cover for Mrs Gupta', right: 'Request', tone: 'warn' },
            ],
          },
          { t: 'actions', items: [{ id: 'accept-cover', label: '✅ Accept cover' }, { id: 'decline-cover', label: 'Decline', kind: 'ghost' }] },
        ],
        meta: '7:45 AM',
      },
      {
        k: 'school',
        label: '🧠 TEACHER COPILOT · 6-A',
        paras: [{ en: '7 students missed equivalent fractions. Suggested 40-minute flow: recover prerequisite (5) → core concept (15) → guided practice (10) → intervention group (6) → exit check (4).' }],
        blocks: [{ t: 'system', text: 'Suggestions only. You decide.' }],
        meta: '7:46 AM',
      },
      { k: 'school', label: '⏰ ATTENDANCE REMINDER', paras: [{ en: '6-A attendance is not marked yet. It takes one screen in the staff app.' }], blocks: [{ t: 'actions', items: [{ id: 'mark-att', label: '✅ Mark 6-A attendance' }] }], meta: '8:50 AM' },
      { k: 'school', label: '📚 DAILY PULSE', paras: [{ en: 'What did you teach 6-A today? Pick the topic; parents get the update at 6:30 PM in English and Hindi.' }], meta: '3:30 PM' },
      { k: 'parent', text: { en: 'Done: Comparing fractions' }, meta: '3:34 PM' },
      {
        k: 'school',
        label: '💬 WHAT PARENTS SAID · 6-C FRACTIONS',
        blocks: [
          { t: 'homework', title: '33 parents replied', rate: '9 need help', done: 64, legend: ['✅ 21 understood well', '⚠️ 9 partly · 3 not'], rows: [{ b: 'Suggested', s: '10-minute revision on Friday' }] },
          { t: 'actions', items: [{ id: 'plan-revision', label: '📅 Plan Friday revision' }] },
        ],
        meta: '9:00 PM',
      },
    ],
  },
  students: {
    title: 'Sunrise International',
    sub: 'Rahul’s learning journey · family number',
    avatar: 'SI',
    open: 'recovery',
    messages: [
      { k: 'sep', text: 'THIS WEEK · FOR RAHUL' },
      {
        k: 'school',
        label: '🌱 RAHUL’S PERSONAL BEST',
        paras: [{ en: 'Rahul, you scored 18/20 in Fractions, up from 14. That is your best ever. Keep going!', hi: 'राहुल, फ्रैक्शन में 18/20, पहले से बेहतर। शाबाश!' }],
        blocks: [{ t: 'growth', rows: [{ label: 'Fractions', was: 70, now: 90, delta: '14 → 18' }, { label: 'Map skills', was: 65, now: 80, delta: 'up' }] }],
        meta: 'Mon · 5:30 PM',
      },
      {
        k: 'school',
        label: '🔄 CATCH-UP PLAN',
        paras: [{ en: 'You missed Monday. Three small steps to catch up: 1) watch the 4-minute fractions recap, 2) try 5 practice questions, 3) tell Priya Ma’am one thing you learned.' }],
        blocks: [{ t: 'actions', items: [{ id: 'start-plan', label: '▶ Start step 1' }] }],
        meta: 'Tue · 4:00 PM',
      },
      { k: 'school', label: '📚 DUE TOMORROW', blocks: [{ t: 'rows', items: [{ left: 'EVS · River diagram', right: 'Due Mon', tone: 'warn' }, { left: 'English · Rainbow poem', right: 'Submitted', tone: 'ok' }] }], meta: 'Sun · 6:00 PM' },
      { k: 'parent', text: { en: 'I finished the river diagram! 🌊' }, meta: 'Sun · 7:10 PM' },
      { k: 'school', label: '✓ GREAT WORK', paras: [{ en: 'Ritu Ma’am will see it tomorrow. Well done, Rahul.' }], meta: 'Sun · 7:10 PM' },
    ],
  },
  admin: {
    title: 'NetCyberAI · Office',
    sub: 'School admin · Sunrise International',
    avatar: 'OF',
    open: 'admissions',
    messages: [
      { k: 'sep', text: 'TODAY · OFFICE' },
      {
        k: 'school',
        label: '🎓 ADMISSIONS TODAY',
        blocks: [
          { t: 'kpis', items: [{ value: '12', label: 'new enquiries' }, { value: '5', label: 'follow-ups due' }, { value: '3', label: 'documents to verify' }, { value: '2', label: 'sibling links found' }] },
          { t: 'actions', items: [{ id: 'open-admissions', label: '📋 Open admissions queue' }] },
        ],
        meta: '9:05 AM',
      },
      {
        k: 'school',
        label: '📄 DOCUMENTS FOR APPROVAL',
        blocks: [{ t: 'rows', items: [{ left: 'Transfer certificate · Class 8 · fees cleared', right: 'Ready', tone: 'ok' }, { left: 'Bonafide · Class 5 · Rahul Sharma', right: 'Ready', tone: 'ok' }, { left: 'TC · Class 9 · dues open', right: 'Held', tone: 'bad' }] }],
        meta: '10:30 AM',
      },
      { k: 'school', label: '⚠️ NOT DELIVERED', paras: [{ en: 'The absence alert for Kabir (6-A) could not be delivered: this family is not on WhatsApp. Added to today’s call list.' }], blocks: [{ t: 'actions', items: [{ id: 'call-list', label: '📞 Open call list' }] }], meta: '9:10 AM' },
      { k: 'parent', text: { en: 'Called. Kabir is unwell, back Monday.' }, meta: '10:02 AM' },
      { k: 'school', label: '✓ RECORDED', paras: [{ en: 'Reason saved to attendance. The class teacher can see it.' }], meta: '10:02 AM' },
      { k: 'school', label: '🛡️ CONSENT CHECK', paras: [{ en: '57 families have not yet given messaging consent. Nothing is sent to them until they do.' }], meta: '12:00 PM' },
    ],
  },
  finance: {
    title: 'NetCyberAI · Accounts',
    sub: 'Finance · Sunrise International',
    avatar: '₹',
    open: 'fees',
    messages: [
      { k: 'sep', text: 'TODAY · COLLECTIONS' },
      {
        k: 'school',
        label: '💰 DAILY COLLECTION · 5:00 PM',
        blocks: [
          { t: 'kpis', items: [{ value: '₹1.42L', label: 'collected today' }, { value: '38', label: 'receipts sent' }, { value: '₹3.6L', label: 'delayed this term' }, { value: '₹1.9L', label: 'overdue (18 students)' }] },
        ],
        meta: '5:00 PM',
      },
      {
        k: 'school',
        label: '🔁 PAYMENTS MATCHED',
        blocks: [{ t: 'rows', items: [{ left: 'Rahul Sharma · Class 5 · ₹8,400', right: 'Matched', tone: 'ok' }, { left: 'Ananya Reddy · Class 8 · ₹25,000', right: 'Matched', tone: 'ok' }, { left: 'Bank transfer · no reference', right: 'Review', tone: 'warn' }] }],
        meta: '5:02 PM',
      },
      {
        k: 'school',
        label: '📨 REMINDER 2 READY',
        paras: [{ en: '18 families are 7+ days overdue. Reminder 2 is drafted in English and Hindi and goes only to families who consented.' }],
        blocks: [{ t: 'actions', items: [{ id: 'send-reminders', label: '✅ Approve and send' }, { id: 'review-list', label: 'Review list', kind: 'ghost' }] }],
        meta: '5:05 PM',
      },
      { k: 'parent', text: { en: 'Approve and send.' }, meta: '5:07 PM' },
      { k: 'school', label: '✓ QUEUED', paras: [{ en: '18 reminders queued with a secure payment link. Replies come back to this chat.' }], meta: '5:07 PM' },
      { k: 'school', label: '🎟️ CONCESSION REQUEST', paras: [{ en: 'Sibling 10% concession for Siya Mehta (Class 4) needs your approval.' }], blocks: [{ t: 'actions', items: [{ id: 'approve-concession', label: '✅ Approve' }] }], meta: '6:10 PM' },
    ],
  },
};
