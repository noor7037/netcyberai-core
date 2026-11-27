// The school agent's screen words, English and Hindi (C546). Kept beside the screens, like the install pages' words.
export type AgentLang = 'en' | 'hi';
export const AGENT_WORDS = {
  en: {
    title: 'Ask', purpose: 'Tell the assistant what you need. It works only inside your school, and nothing changes until you press Go live.',
    placeholder: 'For example: make section C for Class 6 with Mrs Sharma as class teacher', send: 'Send', thinking: 'Working on it…',
    examples: ['Which classes have no class teacher?', 'How many students are in each class?', 'Make section C for Class 6'],
    ready: 'Ready for you to check', review: 'Check and go live', requests: 'Your changes', none: 'Nothing yet.',
    status: { ready: 'Waiting for you', live: 'Made live', stale: 'School changed — ask again', failed: 'Could not be done', discarded: 'Discarded', undone: 'Undone', removed: 'Made live, since removed' } as Record<string, string>,
    changes: 'What will change', changed: 'What changed', steps: 'Steps', noChanges: 'The steps ran; no change was recorded yet.',
    seeLive: 'See it in the app first', seeHint: 'Your app will show the school with these changes, marked Preview. Nobody else sees it.',
    goLive: 'Go live', discard: 'Discard', undo: 'Undo this', back: 'Back to Ask', principalOnly: 'The principal makes this live.',
    liveDone: 'Done. The changes are live.', staleDone: 'The school changed since this was made. Nothing was changed. Ask again.',
    failDone: 'This could not be made live. Nothing was changed.', previewOn: 'Preview — not live', previewExit: 'Leave preview', previewReview: 'Back to the change',
    by: 'Asked by',
    scanTitle: 'Scan a document', scanSay: 'Take a photo of an admission form, a birth certificate, a TC or any paper. The assistant reads it, fills in the details and shows you everything before anything is saved. Admission and roll numbers are given by the system.', scanTake: 'Take a photo', scanAsk: 'Read this document. If it is about a new student, prepare the admission with every detail it shows (name, date of birth, gender, class, guardian name and phone). Leave the admission number and roll number blank so the system gives the next ones. Show me before saving.', scanRegister: 'A register page with many students? Scan the register instead.',
    addPhoto: 'Add photo', removePhoto: 'Remove photo', photos: 'photo(s) attached', ticket: 'Ticket',
    files: 'Files made', working: 'Working', newChat: 'New chat',
    steps2: { thinking: 'Thinking…', routes: 'Looking at', reading: 'Reading', guide: 'Finding the guide for', checking: 'Trying it on a copy', fixing: 'Fixing a problem in the plan', ticket: 'Raising a ticket with NetCyberAI', saving: 'Finishing' } as Record<string, string>,
  },
  hi: {
    title: 'पूछें', purpose: 'सहायक को बताइए क्या करना है। यह सिर्फ़ आपके स्कूल के अंदर काम करता है, और जब तक आप "लाइव करें" न दबाएँ, कुछ नहीं बदलता।',
    placeholder: 'जैसे: कक्षा 6 का सेक्शन C बनाइए, श्रीमती शर्मा कक्षा अध्यापिका', send: 'भेजें', thinking: 'काम हो रहा है…',
    examples: ['किन कक्षाओं में कक्षा अध्यापक नहीं है?', 'हर कक्षा में कितने छात्र हैं?', 'कक्षा 6 का सेक्शन C बनाइए'],
    ready: 'आपके देखने के लिए तैयार', review: 'देखें और लाइव करें', requests: 'आपके बदलाव', none: 'अभी कुछ नहीं।',
    status: { ready: 'आपका इंतज़ार', live: 'लाइव किया गया', stale: 'स्कूल बदल गया — फिर से पूछें', failed: 'नहीं हो सका', discarded: 'हटाया गया', undone: 'वापस लिया गया', removed: 'लाइव किया, बाद में हटाया गया' } as Record<string, string>,
    changes: 'क्या बदलेगा', changed: 'क्या बदला', steps: 'कदम', noChanges: 'कदम चले; अभी कोई बदलाव दर्ज नहीं हुआ।',
    seeLive: 'पहले ऐप में देखें', seeHint: 'आपका ऐप इन बदलावों के साथ स्कूल दिखाएगा, "पूर्वावलोकन" लिखा रहेगा। किसी और को नहीं दिखेगा।',
    goLive: 'लाइव करें', discard: 'हटाएँ', undo: 'इसे वापस लें', back: 'पूछें पर वापस', principalOnly: 'इसे प्रधानाचार्य लाइव करते हैं।',
    liveDone: 'हो गया। बदलाव लाइव हैं।', staleDone: 'इसके बनने के बाद स्कूल बदल गया। कुछ नहीं बदला। फिर से पूछें।',
    failDone: 'यह लाइव नहीं हो सका। कुछ नहीं बदला।', previewOn: 'पूर्वावलोकन — लाइव नहीं', previewExit: 'पूर्वावलोकन बंद करें', previewReview: 'बदलाव पर वापस',
    by: 'किसने पूछा',
    scanTitle: 'दस्तावेज़ स्कैन करें', scanSay: 'प्रवेश फ़ॉर्म, जन्म प्रमाण पत्र, टीसी या कोई भी काग़ज़ की फ़ोटो लें। सहायक उसे पढ़कर विवरण भर देगा और सहेजने से पहले सब कुछ आपको दिखाएगा। प्रवेश संख्या और रोल नंबर सिस्टम देता है।', scanTake: 'फ़ोटो लें', scanAsk: 'यह दस्तावेज़ पढ़ें। अगर यह किसी नए विद्यार्थी का है, तो इसमें दिखे हर विवरण (नाम, जन्म तिथि, लिंग, कक्षा, अभिभावक का नाम और फ़ोन) के साथ प्रवेश तैयार करें। प्रवेश संख्या और रोल नंबर खाली छोड़ें, ताकि सिस्टम अगले नंबर दे। सहेजने से पहले मुझे दिखाएँ।', scanRegister: 'कई विद्यार्थियों वाला रजिस्टर का पन्ना है? तो रजिस्टर स्कैन करें।',
    addPhoto: 'फ़ोटो जोड़ें', removePhoto: 'फ़ोटो हटाएँ', photos: 'फ़ोटो जुड़ी', ticket: 'टिकट',
    files: 'बनी फ़ाइलें', working: 'काम हो रहा है', newChat: 'नई बातचीत',
    steps2: { thinking: 'सोच रहा है…', routes: 'देख रहा है', reading: 'पढ़ रहा है', guide: 'गाइड ढूँढ रहा है', checking: 'एक कॉपी पर आज़मा रहा है', fixing: 'योजना की गड़बड़ी ठीक कर रहा है', ticket: 'NetCyberAI को टिकट भेज रहा है', saving: 'पूरा कर रहा है' } as Record<string, string>,
  },
} as const;
export const agentWords = (lang: string) => AGENT_WORDS[lang === 'hi' ? 'hi' : 'en'];
