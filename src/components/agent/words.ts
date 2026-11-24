// The school agent's screen words, English and Hindi (C546). Kept beside the screens, like the install pages' words.
export type AgentLang = 'en' | 'hi';
export const AGENT_WORDS = {
  en: {
    title: 'Ask', purpose: 'Tell the assistant what you need. It works only inside your school, and nothing changes until you press Go live.',
    placeholder: 'For example: make section C for Class 6 with Mrs Sharma as class teacher', send: 'Send', thinking: 'Working on it…',
    examples: ['Which classes have no class teacher?', 'How many students are in each class?', 'Make section C for Class 6'],
    ready: 'Ready for you to check', review: 'Check and go live', requests: 'Your changes', none: 'Nothing yet.',
    status: { ready: 'Waiting for you', live: 'Live', stale: 'School changed — ask again', failed: 'Could not be done', discarded: 'Discarded', undone: 'Undone' } as Record<string, string>,
    changes: 'What will change', changed: 'What changed', steps: 'Steps', noChanges: 'The steps ran; no change was recorded yet.',
    seeLive: 'See it in the app first', seeHint: 'Your app will show the school with these changes, marked Preview. Nobody else sees it.',
    goLive: 'Go live', discard: 'Discard', undo: 'Undo this', back: 'Back to Ask', principalOnly: 'The principal makes this live.',
    liveDone: 'Done. The changes are live.', staleDone: 'The school changed since this was made. Nothing was changed. Ask again.',
    failDone: 'This could not be made live. Nothing was changed.', previewOn: 'Preview — not live', previewExit: 'Leave preview', previewReview: 'Back to the change',
    by: 'Asked by',
  },
  hi: {
    title: 'पूछें', purpose: 'सहायक को बताइए क्या करना है। यह सिर्फ़ आपके स्कूल के अंदर काम करता है, और जब तक आप "लाइव करें" न दबाएँ, कुछ नहीं बदलता।',
    placeholder: 'जैसे: कक्षा 6 का सेक्शन C बनाइए, श्रीमती शर्मा कक्षा अध्यापिका', send: 'भेजें', thinking: 'काम हो रहा है…',
    examples: ['किन कक्षाओं में कक्षा अध्यापक नहीं है?', 'हर कक्षा में कितने छात्र हैं?', 'कक्षा 6 का सेक्शन C बनाइए'],
    ready: 'आपके देखने के लिए तैयार', review: 'देखें और लाइव करें', requests: 'आपके बदलाव', none: 'अभी कुछ नहीं।',
    status: { ready: 'आपका इंतज़ार', live: 'लाइव', stale: 'स्कूल बदल गया — फिर से पूछें', failed: 'नहीं हो सका', discarded: 'हटाया गया', undone: 'वापस लिया गया' } as Record<string, string>,
    changes: 'क्या बदलेगा', changed: 'क्या बदला', steps: 'कदम', noChanges: 'कदम चले; अभी कोई बदलाव दर्ज नहीं हुआ।',
    seeLive: 'पहले ऐप में देखें', seeHint: 'आपका ऐप इन बदलावों के साथ स्कूल दिखाएगा, "पूर्वावलोकन" लिखा रहेगा। किसी और को नहीं दिखेगा।',
    goLive: 'लाइव करें', discard: 'हटाएँ', undo: 'इसे वापस लें', back: 'पूछें पर वापस', principalOnly: 'इसे प्रधानाचार्य लाइव करते हैं।',
    liveDone: 'हो गया। बदलाव लाइव हैं।', staleDone: 'इसके बनने के बाद स्कूल बदल गया। कुछ नहीं बदला। फिर से पूछें।',
    failDone: 'यह लाइव नहीं हो सका। कुछ नहीं बदला।', previewOn: 'पूर्वावलोकन — लाइव नहीं', previewExit: 'पूर्वावलोकन बंद करें', previewReview: 'बदलाव पर वापस',
    by: 'किसने पूछा',
  },
} as const;
export const agentWords = (lang: string) => AGENT_WORDS[lang === 'hi' ? 'hi' : 'en'];
