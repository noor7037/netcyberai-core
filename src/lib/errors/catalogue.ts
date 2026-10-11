// The plain-language error catalogue (docs/19 rule 9, C132): one sentence
// per validation rule, in English and Hindi, that says what is wrong AND
// how to fix it. "Phone number has 9 digits; it needs 10", never "Invalid
// input". No file that talks to a person writes its own validation
// sentence: the API answers with the rule's key and its values, and the
// screen shows this sentence in the person's language.
//
// Hindi is a first translation and has NOT been reviewed by the founder:
// ERROR_HINDI_REVIEWED stays false until Noor approves it.
// test/errors/catalogue.test.ts has one test per rule.

export type ErrorLang = 'en' | 'hi';
export const ERROR_HINDI_REVIEWED = false;

type L = Record<ErrorLang, string>;

// What a field is called in a sentence.
export const FIELD_NAMES = {
  name: { en: 'name', hi: 'नाम' },
  search: { en: 'search', hi: 'खोज' },
  language: { en: 'language', hi: 'भाषा' },
  student: { en: 'student', hi: 'विद्यार्थी' },
  guardian: { en: 'guardian', hi: 'अभिभावक' },
  document: { en: 'document', hi: 'दस्तावेज़' },
  data_request: { en: 'data request', hi: 'डेटा अनुरोध' },
  settings: { en: 'settings page', hi: 'सेटिंग पेज' },
  decision: { en: 'decision (granted or withdrawn)', hi: 'फ़ैसला (दी गई या वापस ली गई)' },
  purpose: { en: 'purpose', hi: 'उद्देश्य' },
  status: { en: 'status', hi: 'स्थिति' },
  request_type: { en: 'kind of request', hi: 'अनुरोध का प्रकार' },
  document_type: { en: 'kind of document', hi: 'दस्तावेज़ का प्रकार' },
  verification_method: { en: 'way the guardian was verified', hi: 'अभिभावक की पुष्टि का तरीका' },
  code: { en: 'code', hi: 'कोड' },
  who_asked: { en: 'note on who asked and how (for example “father, phone call”)', hi: 'किसने और कैसे कहा, इसका नोट (जैसे “पिता, फ़ोन पर”)' },
  whatsapp_details: { en: 'phone number ID, access token and webhook verify token', hi: 'फ़ोन नंबर ID, एक्सेस टोकन और वेबहुक वेरिफ़ाई टोकन' },
  student_name: { en: 'student’s name', hi: 'विद्यार्थी का नाम' },
  guardian_name: { en: 'guardian’s name', hi: 'अभिभावक का नाम' },
  class_name: { en: 'class name', hi: 'कक्षा का नाम' },
  class: { en: 'class', hi: 'कक्षा' },
  phone: { en: 'phone number', hi: 'फ़ोन नंबर' },
  email: { en: 'email', hi: 'ईमेल' },
  dob: { en: 'date of birth', hi: 'जन्म तिथि' },
  date: { en: 'date', hi: 'तारीख़' },
  role: { en: 'role', hi: 'भूमिका' },
  subject: { en: 'subject', hi: 'विषय' },
  description: { en: 'description', hi: 'विवरण' },
  reply: { en: 'reply', hi: 'जवाब' },
  category: { en: 'topic of the ticket', hi: 'टिकट का विषय' },
  reason: { en: 'reason', hi: 'कारण' },
  file: { en: 'file', hi: 'फ़ाइल' },
  screenshot: { en: 'screenshot', hi: 'स्क्रीनशॉट' },
} as const satisfies Record<string, L>;
export type FieldKey = keyof typeof FIELD_NAMES;

type P = Record<string, string | number>;
const f = (p: P, lang: ErrorLang) => FIELD_NAMES[p.field as FieldKey]?.[lang] ?? String(p.field);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// rule → sentence. `p` are the rule's values (field, have, need, min, max…).
export const ERROR_RULES = {
  required: { en: (p: P) => `Enter the ${f(p, 'en')}.`, hi: (p: P) => `${f(p, 'hi')} लिखें।` },
  choose_one: { en: (p: P) => `Choose the ${f(p, 'en')} from the list.`, hi: (p: P) => `सूची से ${f(p, 'hi')} चुनें।` },
  too_short: {
    en: (p: P) => `${cap(f(p, 'en'))} has ${p.have} ${p.have === 1 ? 'character' : 'characters'}; it needs at least ${p.min}.`,
    hi: (p: P) => `${f(p, 'hi')} में ${p.have} अक्षर ${p.have === 1 ? 'है' : 'हैं'}; कम से कम ${p.min} चाहिए।`,
  },
  too_long: {
    en: (p: P) => `${cap(f(p, 'en'))} has ${p.have} characters; the most allowed is ${p.max}. Shorten it.`,
    hi: (p: P) => `${f(p, 'hi')} में ${p.have} अक्षर हैं; अधिकतम ${p.max} हो सकते हैं। इसे छोटा करें।`,
  },
  phone_digits: {
    en: (p: P) => `Phone number has ${p.have} ${p.have === 1 ? 'digit' : 'digits'}; it needs ${p.need}.`,
    hi: (p: P) => `फ़ोन नंबर में ${p.have} ${p.have === 1 ? 'अंक है' : 'अंक हैं'}; ${p.need} होने चाहिए।`,
  },
  phone_characters: {
    en: () => 'A phone number has only digits. Remove any letters or signs, and enter one number only.',
    hi: () => 'फ़ोन नंबर में केवल अंक होते हैं। अक्षर या चिह्न हटाएँ, और केवल एक नंबर लिखें।',
  },
  phone_start: {
    en: () => 'An Indian mobile number starts with 6, 7, 8 or 9. Check the first digit. For a number from another country, start with + and the country code.',
    hi: () => 'भारतीय मोबाइल नंबर 6, 7, 8 या 9 से शुरू होता है। पहला अंक जाँचें। किसी दूसरे देश के नंबर के लिए + और देश का कोड पहले लिखें।',
  },
  email_format: {
    en: () => 'This email is not complete. It needs a name, an @ and a site, like name@school.in.',
    hi: () => 'यह ईमेल अधूरा है। इसमें नाम, @ और साइट चाहिए, जैसे name@school.in।',
  },
  date_format: {
    en: (p: P) => `Write the ${f(p, 'en')} as year-month-day, like 2015-08-21.`,
    hi: (p: P) => `${f(p, 'hi')} साल-महीना-दिन के रूप में लिखें, जैसे 2015-08-21।`,
  },
  date_not_real: {
    en: (p: P) => `${p.value} is not a date on the calendar. Check the day and the month.`,
    hi: (p: P) => `${p.value} कैलेंडर में कोई तारीख़ नहीं है। दिन और महीना जाँचें।`,
  },
  date_in_future: {
    en: (p: P) => `The ${f(p, 'en')} cannot be after today. Choose today or an earlier day.`,
    hi: (p: P) => `${f(p, 'hi')} आज के बाद की नहीं हो सकती। आज या उससे पहले का दिन चुनें।`,
  },
  class_not_in_school: {
    en: () => 'That class is not in this school. Choose a class from the list, or add it first under “Manage classes”.',
    hi: () => 'वह कक्षा इस स्कूल में नहीं है। सूची से कक्षा चुनें, या पहले “Manage classes” में उसे जोड़ें।',
  },
  already_exists: {
    en: (p: P) => `A ${f(p, 'en')} “${p.value}” already exists. Use a different one, or open the existing one.`,
    hi: (p: P) => `“${p.value}” ${f(p, 'hi')} पहले से मौजूद है। कोई दूसरा रखें, या मौजूदा को खोलें।`,
  },
  nothing_to_save: {
    en: () => 'Nothing was changed. Change something, then save.',
    hi: () => 'कुछ बदला नहीं गया। कोई जानकारी बदलें, फिर सेव करें।',
  },
  file_missing: { en: () => 'Choose a file first, then try again.', hi: () => 'पहले फ़ाइल चुनें, फिर दोबारा कोशिश करें।' },
  file_too_large: {
    en: (p: P) => `The ${f(p, 'en')} is larger than ${p.maxMb} MB. Choose a smaller one.`,
    hi: (p: P) => `${f(p, 'hi')} ${p.maxMb} MB से बड़ी है। छोटी फ़ाइल चुनें।`,
  },
  file_type: {
    en: (p: P) => `The ${f(p, 'en')} must be one of these: ${p.allowed}. Save it as one of them and try again.`,
    hi: (p: P) => `${f(p, 'hi')} इनमें से एक होना चाहिए: ${p.allowed}। इनमें से किसी रूप में सेव करके दोबारा कोशिश करें।`,
  },
  too_many: {
    en: (p: P) => `There are already ${p.max} here, which is the most allowed.`,
    hi: (p: P) => `यहाँ पहले से ${p.max} हैं, जो अधिकतम है।`,
  },
  ticket_limit: {
    en: () => 'You have raised many tickets in the last hour. Add to one of your open tickets, or wait a little and try again.',
    hi: () => 'पिछले एक घंटे में आपने कई टिकट बनाए हैं। अपने किसी खुले टिकट में जोड़ें, या थोड़ा रुककर दोबारा कोशिश करें।',
  },
  not_allowed: {
    en: () => 'Your role cannot do this. Ask your principal or school admin.',
    hi: () => 'आपकी भूमिका यह नहीं कर सकती। अपने प्रिंसिपल या स्कूल एडमिन से कहें।',
  },
  signed_out: {
    en: () => 'You are signed out. Sign in again, then repeat this.',
    hi: () => 'आप साइन आउट हो गए हैं। दोबारा साइन इन करें, फिर इसे दोहराएँ।',
  },
  not_found: {
    en: (p: P) => `We could not find this ${f(p, 'en')}. It may have been removed. Go back and open it again.`,
    hi: (p: P) => `यह ${f(p, 'hi')} नहीं मिला। हो सकता है इसे हटा दिया गया हो। वापस जाकर दोबारा खोलें।`,
  },
  already_linked: {
    en: () => 'This guardian is already linked to this student. There is nothing more to do.',
    hi: () => 'यह अभिभावक इस विद्यार्थी से पहले से जुड़ा है। और कुछ करने की ज़रूरत नहीं।',
  },
  two_step_delete: {
    en: () => 'A request to delete data is finished in two steps: first approve it, then carry it out. Use those two buttons.',
    hi: () => 'डेटा हटाने का अनुरोध दो चरणों में पूरा होता है: पहले मंज़ूरी दें, फिर उसे पूरा करें। उन्हीं दो बटनों का इस्तेमाल करें।',
  },
  not_sent_properly: {
    en: () => 'This did not reach us as expected. Refresh the page, then try again.',
    hi: () => 'यह हम तक ठीक से नहीं पहुँचा। पेज को दोबारा खोलें, फिर कोशिश करें।',
  },
  module_off: {
    en: () => 'Your school does not have this part switched on. Ask your principal, or raise a ticket to NetCyberAI.',
    hi: () => 'आपके स्कूल में यह हिस्सा चालू नहीं है। अपने प्रिंसिपल से कहें, या NetCyberAI को टिकट भेजें।',
  },
  account_paused: {
    en: () => 'Your school’s account is paused, so nothing can be changed right now. Ask your principal, or raise a ticket to NetCyberAI.',
    hi: () => 'आपके स्कूल का खाता अभी रोका गया है, इसलिए अभी कुछ बदला नहीं जा सकता। अपने प्रिंसिपल से कहें, या NetCyberAI को टिकट भेजें।',
  },
  read_only: {
    en: () => 'Your school’s account can be read but not changed right now. Ask your principal, or raise a ticket to NetCyberAI.',
    hi: () => 'आपके स्कूल का खाता अभी सिर्फ़ देखा जा सकता है, बदला नहीं जा सकता। अपने प्रिंसिपल से कहें, या NetCyberAI को टिकट भेजें।',
  },
  guardian_not_linked: {
    en: () => 'This guardian is not linked to this student. Link the guardian on the student’s page first.',
    hi: () => 'यह अभिभावक इस विद्यार्थी से जुड़ा नहीं है। पहले विद्यार्थी के पेज पर अभिभावक को जोड़ें।',
  },
  file_empty: {
    en: () => 'This file is empty. Choose another file.',
    hi: () => 'यह फ़ाइल खाली है। कोई दूसरी फ़ाइल चुनें।',
  },
  step_out_of_order: {
    en: () => 'This step cannot be done now. Refresh the page to see where things stand, then continue from there.',
    hi: () => 'यह चरण अभी नहीं हो सकता। पेज को दोबारा खोलकर देखें कि काम कहाँ तक पहुँचा है, फिर वहीं से आगे बढ़ें।',
  },
  code_expired: {
    en: () => 'This code has run out. Ask for a new code, then enter it.',
    hi: () => 'इस कोड का समय निकल गया है। नया कोड माँगें, फिर उसे डालें।',
  },
  code_wrong: {
    en: () => 'That code does not match. Check the code and enter it again.',
    hi: () => 'यह कोड मेल नहीं खाता। कोड देखकर दोबारा डालें।',
  },
  code_too_many_tries: {
    en: () => 'There were too many wrong tries. Ask for a new code, then enter it.',
    hi: () => 'बहुत बार ग़लत कोड डाला गया। नया कोड माँगें, फिर उसे डालें।',
  },
  guardian_not_verified: {
    en: () => 'This guardian is not verified yet. Verify the guardian first (the “Verify” button beside their name), then record the consent.',
    hi: () => 'इस अभिभावक की पुष्टि अभी नहीं हुई है। पहले अभिभावक की पुष्टि करें (नाम के पास “Verify” बटन), फिर सहमति दर्ज करें।',
  },
  only_for_deletion: {
    en: () => 'This step is only for requests to delete data. This request is of another kind.',
    hi: () => 'यह चरण सिर्फ़ डेटा हटाने के अनुरोधों के लिए है। यह अनुरोध किसी और प्रकार का है।',
  },
  approve_first: {
    en: () => 'This request has not been approved yet. Approve it first, then carry it out.',
    hi: () => 'इस अनुरोध को अभी मंज़ूरी नहीं मिली है। पहले मंज़ूरी दें, फिर इसे पूरा करें।',
  },
  already_done: {
    en: () => 'This has already been done. There is nothing more to do.',
    hi: () => 'यह पहले ही हो चुका है। और कुछ करने की ज़रूरत नहीं।',
  },
  not_saved: {
    en: () => 'This could not be saved just now. Check your internet, then try again.',
    hi: () => 'यह अभी सेव नहीं हो पाया। इंटरनेट देखें, फिर दोबारा कोशिश करें।',
  },
  too_fast: {
    en: () => 'That is a lot in a short time. Wait a few minutes, then try again.',
    hi: () => 'कम समय में बहुत बार हो गया। कुछ मिनट रुकें, फिर दोबारा कोशिश करें।',
  },
} as const;
export type ErrorRule = keyof typeof ERROR_RULES;

export function isErrorRule(v: unknown): v is ErrorRule {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ERROR_RULES, v);
}

export function errorMessage(rule: ErrorRule, params: P = {}, lang: ErrorLang = 'en'): string {
  return ERROR_RULES[rule][lang](params);
}

// What an API puts in a 400: `error` is the English sentence (so anything
// that only reads `error` already shows plain words), with the rule and its
// values for a screen that shows it in the person's language.
export type ValidationError = { error: string; code: ErrorRule; params: P };
export function validationError(rule: ErrorRule, params: P = {}): ValidationError {
  return { error: errorMessage(rule, params, 'en'), code: rule, params };
}

// What a screen shows for a failed request: the catalogue's sentence in the
// person's language when the API named a rule; a refusal for who they are
// (signed out, or a role that may not) said as that, never as "check the
// details"; otherwise the API's own sentence; otherwise the screen's
// fallback. Never a bare code, and never a sentence with a hole in it.
export function explainError(body: unknown, fallback: string, lang: ErrorLang = 'en', status?: number): string {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (isErrorRule(b.code)) {
    const params = (typeof b.params === 'object' && b.params !== null ? b.params : {}) as P;
    const usable = Object.values(params).every((v) => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)));
    const text = usable ? errorMessage(b.code, params, lang) : '';
    if (text && !/undefined|NaN|\[object/.test(text)) return text;
  }
  if (status === 401 || b.error === 'not authenticated' || b.error === 'session_expired') return errorMessage('signed_out', {}, lang);
  if (status === 403 || b.error === 'forbidden' || b.error === 'role_not_allowed') return errorMessage('not_allowed', {}, lang);
  if (typeof b.message === 'string' && b.message.trim()) return b.message;
  if (typeof b.error === 'string' && /\s/.test(b.error.trim())) return cap(b.error.trim()).replace(/[^.?!]$/, (last) => `${last}.`);
  return fallback;
}

// ---- checks that pick the rule ---------------------------------------------------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// A phone number for WhatsApp. An Indian mobile number may be typed with
// spaces, dashes, brackets, a leading +91, 91 or 0, and in Devanagari
// digits. A number from another country is accepted when it starts with +
// and its country code (8 to 15 digits). Anything else typed (a letter, a
// second number after a slash) is named as that, not miscounted.
export function checkPhone(raw: string): { ok: true; digits: string } | { ok: false; error: ValidationError } {
  const typed = raw.trim().replace(/[\u0966-\u096F]/g, (d) => String(d.charCodeAt(0) - 0x0966));
  const plus = typed.startsWith('+');
  let digits = typed.replace(/^\+/, '').replace(/[\s\-().]/g, '');
  if (!/^\d*$/.test(digits)) return { ok: false, error: validationError('phone_characters') };
  if (plus && !digits.startsWith('91')) {
    return digits.length >= 8 && digits.length <= 15 ? { ok: true, digits: `+${digits}` } : { ok: false, error: validationError('phone_digits', { have: digits.length, need: '8 to 15, with the country code' }) };
  }
  if (plus || (digits.length === 12 && digits.startsWith('91'))) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length !== 10) return { ok: false, error: validationError('phone_digits', { have: digits.length, need: 10 }) };
  if (!/^[6-9]/.test(digits)) return { ok: false, error: validationError('phone_start') };
  return { ok: true, digits };
}

export function checkEmail(raw: string): ValidationError | null {
  return EMAIL.test(raw.trim()) ? null : validationError('email_format');
}

// A date typed as text: its shape, that it exists, and (when asked) that it is not after `today`.
export function checkDate(raw: string, field: FieldKey, opts: { notAfter?: string } = {}): ValidationError | null {
  if (!ISO_DATE.test(raw)) return validationError('date_format', { field });
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return validationError('date_not_real', { value: raw });
  if (opts.notAfter && raw > opts.notAfter) return validationError('date_in_future', { field });
  return null;
}

// Text with a length: counted as people count (an emoji is one character).
export function checkText(raw: unknown, field: FieldKey, min: number, max: number): { ok: true; value: string } | { ok: false; error: ValidationError } {
  const value = typeof raw === 'string' ? raw.trim() : '';
  const have = [...value].length;
  if (have === 0) return { ok: false, error: validationError('required', { field }) };
  if (have < min) return { ok: false, error: validationError('too_short', { field, have, min }) };
  if (have > max) return { ok: false, error: validationError('too_long', { field, have, max }) };
  return { ok: true, value };
}
