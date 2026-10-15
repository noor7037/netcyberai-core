import { describe, expect, it } from 'vitest';
import { checkDate, checkEmail, checkPhone, checkText, ERROR_HINDI_REVIEWED, ERROR_RULES, errorMessage, explainError, FIELD_NAMES, isErrorRule, validationError, type ErrorRule } from '@/lib/errors/catalogue';

// The plain-language error catalogue (docs/19 rule 9, C132): one test per
// rule for its sentence in English and Hindi, then the checks that choose
// the rule, then what a screen shows.

const DEVANAGARI = /[ऀ-ॿ]/;
const en = (rule: ErrorRule, p: Record<string, string | number> = {}) => errorMessage(rule, p, 'en');
const hi = (rule: ErrorRule, p: Record<string, string | number> = {}) => errorMessage(rule, p, 'hi');

describe('each rule says what is wrong and how to fix it, in English and Hindi', () => {
  it('required', () => {
    expect(en('required', { field: 'guardian_name' })).toBe('Enter the guardian’s name.');
    expect(hi('required', { field: 'guardian_name' })).toBe('अभिभावक का नाम लिखें।');
  });
  it('choose_one', () => {
    expect(en('choose_one', { field: 'class' })).toBe('Choose the class from the list.');
    expect(hi('choose_one', { field: 'class' })).toBe('सूची से कक्षा चुनें।');
    expect(en('choose_one', { field: 'category' })).toBe('Choose the topic of the ticket from the list.');
    expect(hi('choose_one', { field: 'category' })).toBe('सूची से टिकट का विषय चुनें।');
  });
  it('too_short', () => {
    expect(en('too_short', { field: 'subject', have: 2, min: 3 })).toBe('Subject has 2 characters; it needs at least 3.');
    expect(en('too_short', { field: 'subject', have: 1, min: 3 })).toBe('Subject has 1 character; it needs at least 3.');
    expect(hi('too_short', { field: 'subject', have: 2, min: 3 })).toBe('विषय में 2 अक्षर हैं; कम से कम 3 चाहिए।');
    expect(hi('too_short', { field: 'subject', have: 1, min: 3 })).toBe('विषय में 1 अक्षर है; कम से कम 3 चाहिए।');
  });
  it('too_long', () => {
    expect(en('too_long', { field: 'description', have: 5200, max: 5000 })).toBe('Description has 5200 characters; the most allowed is 5000. Shorten it.');
    expect(hi('too_long', { field: 'description', have: 5200, max: 5000 })).toBe('विवरण में 5200 अक्षर हैं; अधिकतम 5000 हो सकते हैं। इसे छोटा करें।');
  });
  it('phone_digits', () => {
    expect(en('phone_digits', { have: 9, need: 10 })).toBe('Phone number has 9 digits; it needs 10.');
    expect(en('phone_digits', { have: 1, need: 10 })).toBe('Phone number has 1 digit; it needs 10.');
    expect(hi('phone_digits', { have: 9, need: 10 })).toBe('फ़ोन नंबर में 9 अंक हैं; 10 होने चाहिए।');
  });
  it('phone_start', () => {
    expect(en('phone_start')).toBe('An Indian mobile number starts with 6, 7, 8 or 9. Check the first digit. For a number from another country, start with + and the country code.');
    expect(hi('phone_start')).toMatch(DEVANAGARI);
  });
  it('phone_characters', () => {
    expect(en('phone_characters')).toBe('A phone number has only digits. Remove any letters or signs, and enter one number only.');
    expect(hi('phone_characters')).toMatch(DEVANAGARI);
  });
  it('ticket_limit', () => {
    expect(en('ticket_limit')).toBe('You have raised many tickets in the last hour. Add to one of your open tickets, or wait a little and try again.');
    expect(hi('ticket_limit')).toMatch(DEVANAGARI);
  });
  it('not_allowed', () => {
    expect(en('not_allowed')).toBe('Your role cannot do this. Ask your principal or school admin.');
    expect(hi('not_allowed')).toMatch(DEVANAGARI);
  });
  it('signed_out', () => {
    expect(en('signed_out')).toBe('You are signed out. Sign in again, then repeat this.');
    expect(hi('signed_out')).toMatch(DEVANAGARI);
  });
  it('email_format', () => {
    expect(en('email_format')).toBe('This email is not complete. It needs a name, an @ and a site, like name@school.in.');
    expect(hi('email_format')).toContain('name@school.in');
  });
  it('date_format', () => {
    expect(en('date_format', { field: 'dob' })).toBe('Write the date of birth as year-month-day, like 2015-08-21.');
    expect(hi('date_format', { field: 'dob' })).toBe('जन्म तिथि साल-महीना-दिन के रूप में लिखें, जैसे 2015-08-21।');
  });
  it('date_not_real', () => {
    expect(en('date_not_real', { value: '2015-02-30' })).toBe('2015-02-30 is not a date on the calendar. Check the day and the month.');
    expect(hi('date_not_real', { value: '2015-02-30' })).toContain('2015-02-30');
  });
  it('date_in_future', () => {
    expect(en('date_in_future', { field: 'dob' })).toBe('The date of birth cannot be after today. Choose today or an earlier day.');
    expect(hi('date_in_future', { field: 'dob' })).toMatch(DEVANAGARI);
  });
  it('class_not_in_school', () => {
    expect(en('class_not_in_school')).toBe('That class is not in this school. Choose a class from the list, or add it first under “Manage classes”.');
    expect(hi('class_not_in_school')).toContain('“Manage classes”'); // the button keeps its name on screen
  });
  it('already_exists', () => {
    expect(en('already_exists', { field: 'class_name', value: '8-A' })).toBe('A class name “8-A” already exists. Use a different one, or open the existing one.');
    expect(hi('already_exists', { field: 'class_name', value: '8-A' })).toContain('“8-A”');
  });
  it('nothing_to_save', () => {
    expect(en('nothing_to_save')).toBe('Nothing was changed. Change something, then save.');
    expect(hi('nothing_to_save')).toMatch(DEVANAGARI);
  });
  it('file_missing', () => {
    expect(en('file_missing')).toBe('Choose a file first, then try again.');
    expect(hi('file_missing')).toMatch(DEVANAGARI);
  });
  it('file_too_large', () => {
    expect(en('file_too_large', { field: 'screenshot', maxMb: 4 })).toBe('The screenshot is larger than 4 MB. Choose a smaller one.');
    expect(hi('file_too_large', { field: 'screenshot', maxMb: 4 })).toContain('4 MB');
  });
  it('file_type', () => {
    expect(en('file_type', { field: 'screenshot', allowed: 'PNG, JPEG, WebP' })).toBe('The screenshot must be one of these: PNG, JPEG, WebP. Save it as one of them and try again.');
    expect(hi('file_type', { field: 'screenshot', allowed: 'PNG, JPEG, WebP' })).toBe('स्क्रीनशॉट इनमें से एक होना चाहिए: PNG, JPEG, WebP। इनमें से किसी रूप में सेव करके दोबारा कोशिश करें।');
  });
  it('too_many', () => {
    expect(en('too_many', { max: 5 })).toBe('There are already 5 here, which is the most allowed.');
    expect(hi('too_many', { max: 5 })).toContain('5');
  });
  it('not_found', () => {
    expect(en('not_found', { field: 'guardian' })).toBe('We could not find this guardian. It may have been removed. Go back and open it again.');
    expect(hi('not_found', { field: 'guardian' })).toBe('यह अभिभावक नहीं मिला। हो सकता है इसे हटा दिया गया हो। वापस जाकर दोबारा खोलें।');
  });
  it('already_linked', () => {
    expect(en('already_linked')).toBe('This guardian is already linked to this student. There is nothing more to do.');
    expect(hi('already_linked')).toMatch(DEVANAGARI);
  });
  it('two_step_delete', () => {
    expect(en('two_step_delete')).toBe('A request to delete data is finished in two steps: first approve it, then carry it out. Use those two buttons.');
    expect(hi('two_step_delete')).toMatch(DEVANAGARI);
  });
  it('not_sent_properly', () => {
    expect(en('not_sent_properly')).toBe('This did not reach us as expected. Refresh the page, then try again.');
    expect(hi('not_sent_properly')).toMatch(DEVANAGARI);
  });
  it('module_off', () => {
    expect(en('module_off')).toBe('Your school does not have this part switched on. Ask your principal, or raise a ticket to NetCyberAI.');
    expect(hi('module_off')).toMatch(DEVANAGARI);
  });
  it('read_only', () => {
    expect(en('read_only')).toBe('Your school’s account can be read but not changed right now. Ask your principal, or raise a ticket to NetCyberAI.');
    expect(hi('read_only')).toMatch(DEVANAGARI);
  });
  it('guardian_not_linked', () => {
    expect(en('guardian_not_linked')).toBe('This guardian is not linked to this student. Link the guardian on the student’s page first.');
    expect(hi('guardian_not_linked')).toMatch(DEVANAGARI);
  });
  it('file_empty', () => {
    expect(en('file_empty')).toBe('This file is empty. Choose another file.');
    expect(hi('file_empty')).toMatch(DEVANAGARI);
  });
  it('step_out_of_order', () => {
    expect(en('step_out_of_order')).toBe('This step cannot be done now. Refresh the page to see where things stand, then continue from there.');
    expect(hi('step_out_of_order')).toMatch(DEVANAGARI);
  });
  it('code_expired', () => {
    expect(en('code_expired')).toBe('This code has run out. Ask for a new code, then enter it.');
    expect(hi('code_expired')).toMatch(DEVANAGARI);
  });
  it('code_wrong', () => {
    expect(en('code_wrong')).toBe('That code does not match. Check the code and enter it again.');
    expect(hi('code_wrong')).toMatch(DEVANAGARI);
  });
  it('code_too_many_tries', () => {
    expect(en('code_too_many_tries')).toBe('There were too many wrong tries. Ask for a new code, then enter it.');
    expect(hi('code_too_many_tries')).toMatch(DEVANAGARI);
  });
  it('guardian_not_verified', () => {
    expect(en('guardian_not_verified')).toBe('This guardian is not verified yet. Verify the guardian first (the “Verify” button beside their name), then record the consent.');
    expect(hi('guardian_not_verified')).toMatch(DEVANAGARI);
  });
  it('only_for_deletion', () => {
    expect(en('only_for_deletion')).toBe('This step is only for requests to delete data. This request is of another kind.');
    expect(hi('only_for_deletion')).toMatch(DEVANAGARI);
  });
  it('approve_first', () => {
    expect(en('approve_first')).toBe('This request has not been approved yet. Approve it first, then carry it out.');
    expect(hi('approve_first')).toMatch(DEVANAGARI);
  });
  it('already_done', () => {
    expect(en('already_done')).toBe('This has already been done. There is nothing more to do.');
    expect(hi('already_done')).toMatch(DEVANAGARI);
  });
  it('account_paused', () => {
    expect(en('account_paused')).toBe('Your school’s account is paused, so nothing can be changed right now. Ask your principal, or raise a ticket to NetCyberAI.');
    expect(hi('account_paused')).toMatch(DEVANAGARI);
  });
  it('not_saved', () => {
    expect(en('not_saved')).toBe('This could not be saved just now. Check your internet, then try again.');
    expect(hi('not_saved')).toMatch(DEVANAGARI);
  });
  it('too_fast', () => {
    expect(en('too_fast')).toBe('That is a lot in a short time. Wait a few minutes, then try again.');
    expect(hi('too_fast')).toMatch(DEVANAGARI);
  });
  it('upload_aadhaar_number (C232 part A)', () => {
    expect(en('upload_aadhaar_number')).toBe('This file shows a number written like an Aadhaar number, and NetCyberAI never keeps one. Cover the number, or choose a copy without it, then upload again.');
    expect(hi('upload_aadhaar_number')).toMatch(DEVANAGARI);
  });
  it('upload_aadhaar_card (C232 part A)', () => {
    expect(en('upload_aadhaar_card')).toBe('This file reads as an Aadhaar card, and NetCyberAI never keeps one. Upload a different document instead.');
    expect(hi('upload_aadhaar_card')).toMatch(DEVANAGARI);
  });
  it('upload_unreadable (C232 part A)', () => {
    expect(en('upload_unreadable')).toBe('The words in this file could not be read, so it could not be checked for an Aadhaar number. Upload a clearer photo, or a PDF without a password.');
    expect(hi('upload_unreadable')).toMatch(DEVANAGARI);
  });

  it('every rule has a test above, both languages, and no technical word', () => {
    const tested = ['required', 'choose_one', 'too_short', 'too_long', 'phone_digits', 'phone_characters', 'ticket_limit', 'not_allowed', 'signed_out', 'phone_start', 'email_format', 'date_format', 'date_not_real', 'date_in_future', 'class_not_in_school', 'already_exists', 'nothing_to_save', 'file_missing', 'file_too_large', 'file_type', 'too_many', 'too_fast', 'not_saved', 'not_found', 'already_linked', 'two_step_delete', 'not_sent_properly', 'module_off', 'read_only', 'guardian_not_linked', 'file_empty', 'step_out_of_order', 'code_expired', 'code_wrong', 'code_too_many_tries', 'guardian_not_verified', 'only_for_deletion', 'approve_first', 'already_done', 'account_paused', 'upload_aadhaar_number', 'upload_aadhaar_card', 'upload_unreadable'];
    expect(Object.keys(ERROR_RULES).sort()).toEqual([...tested].sort());
    const sample = { field: 'phone', have: 2, min: 3, max: 9, need: 10, value: 'x', maxMb: 4, allowed: 'PNG' };
    for (const rule of Object.keys(ERROR_RULES) as ErrorRule[]) {
      const english = en(rule, sample);
      expect(english, rule).not.toMatch(/\b(invalid|null|undefined|entity|payload|field|error|failed|exception)\b/i);
      expect(english, rule).toMatch(/[.]$/);
      expect(hi(rule, sample), rule).toMatch(DEVANAGARI);
      expect(hi(rule, sample), rule).not.toContain('undefined');
    }
    for (const name of Object.values(FIELD_NAMES)) expect(name.hi.length).toBeGreaterThan(1);
    expect(ERROR_HINDI_REVIEWED).toBe(false); // until the founder approves the Hindi
  });
});

describe('the checks choose the right rule', () => {
  it('phone: counts what was typed, and names a stray letter or a second number as that', () => {
    expect(checkPhone('987654321')).toMatchObject({ ok: false, error: { error: 'Phone number has 9 digits; it needs 10.', code: 'phone_digits', params: { have: 9, need: 10 } } });
    expect(checkPhone('98765432101')).toMatchObject({ ok: false, error: { params: { have: 11 } } });
    expect(checkPhone('')).toMatchObject({ ok: false, error: { params: { have: 0 } } });
    expect(checkPhone('5876543210')).toMatchObject({ ok: false, error: { code: 'phone_start' } });
    // Never "has 10 digits; it needs 10": anything that is not a digit is said to be that.
    for (const bad of ['98765 4321O', '9876543210x', '9876543210/9812345678', 'ninety-eight']) expect(checkPhone(bad), bad).toMatchObject({ ok: false, error: { code: 'phone_characters' } });
    for (const good of ['9876543210', '98765 43210', '98765-43210', '98765.43210', '(98765) 43210', '+91 98765 43210', '+91-09876543210'.replace('-0', '-'), '919876543210', '09876543210', '९८७६५४३२१०']) expect(checkPhone(good), good).toEqual({ ok: true, digits: '9876543210' });
  });

  it('phone: a number from another country is accepted with its + and country code', () => {
    expect(checkPhone('+971 50 123 4567')).toEqual({ ok: true, digits: '+971501234567' });
    expect(checkPhone('+1 (415) 555-0132')).toEqual({ ok: true, digits: '+14155550132' });
    expect(checkPhone('+44 12')).toMatchObject({ ok: false, error: { code: 'phone_digits', params: { have: 4 } } });
    expect(checkPhone('+91 12345 67890')).toMatchObject({ ok: false, error: { code: 'phone_start' } }); // +91 is still an Indian mobile number
  });

  it('email', () => {
    for (const bad of ['priya', 'priya@', 'priya@school', '@school.in', 'priya @school.in']) expect(checkEmail(bad)?.code, bad).toBe('email_format');
    expect(checkEmail(' priya@school.in ')).toBeNull();
  });

  it('date: shape, a real day, not after today', () => {
    expect(checkDate('21-08-2015', 'dob')?.code).toBe('date_format');
    expect(checkDate('2015-02-30', 'dob')).toMatchObject({ code: 'date_not_real', params: { value: '2015-02-30' } });
    expect(checkDate('2030-01-01', 'dob', { notAfter: '2026-10-08' })?.code).toBe('date_in_future');
    expect(checkDate('2026-10-08', 'dob', { notAfter: '2026-10-08' })).toBeNull();
    expect(checkDate('2016-02-29', 'dob')).toBeNull(); // a leap day
  });

  it('text: empty, too short, too long, counted as people count', () => {
    expect(checkText('   ', 'subject', 3, 150)).toMatchObject({ ok: false, error: { code: 'required', params: { field: 'subject' } } });
    expect(checkText(undefined, 'subject', 3, 150)).toMatchObject({ ok: false, error: { code: 'required' } });
    expect(checkText('ab', 'subject', 3, 150)).toMatchObject({ ok: false, error: { code: 'too_short', params: { have: 2, min: 3 } } });
    expect(checkText('👍👍', 'subject', 3, 150)).toMatchObject({ ok: false, error: { params: { have: 2 } } });
    expect(checkText('x'.repeat(151), 'subject', 3, 150)).toMatchObject({ ok: false, error: { code: 'too_long', params: { have: 151, max: 150 } } });
    expect(checkText('  Attendance  ', 'subject', 3, 150)).toEqual({ ok: true, value: 'Attendance' });
  });
});

describe('what a screen shows', () => {
  it('the catalogue sentence in the person’s language when the API named a rule', () => {
    const body = validationError('phone_digits', { have: 9, need: 10 });
    expect(body).toEqual({ error: 'Phone number has 9 digits; it needs 10.', code: 'phone_digits', params: { have: 9, need: 10 } });
    expect(explainError(body, 'fallback')).toBe('Phone number has 9 digits; it needs 10.');
    expect(explainError(body, 'fallback', 'hi')).toBe('फ़ोन नंबर में 9 अंक हैं; 10 होने चाहिए।');
  });

  it('otherwise the API’s own sentence, and never a bare code', () => {
    expect(explainError({ error: 'reopen the ticket to reply' }, 'fallback')).toBe('Reopen the ticket to reply.');
    expect(explainError({ error: 'invalid', message: 'Enter a name.' }, 'fallback')).toBe('Enter a name.');
    for (const body of [{ error: 'unavailable' }, { code: 'made_up_rule' }, {}, null, 'oops', undefined]) expect(explainError(body, 'That did not work. Try again.')).toBe('That did not work. Try again.');
  });

  it('a refusal for who you are says so, not "check the details"', () => {
    const fallback = 'The student was not added. Check the details and try again.';
    expect(explainError({ error: 'forbidden' }, fallback, 'en', 403)).toBe('Your role cannot do this. Ask your principal or school admin.');
    expect(explainError({ error: 'role_not_allowed' }, fallback)).toBe('Your role cannot do this. Ask your principal or school admin.');
    expect(explainError({ error: 'not authenticated' }, fallback, 'en', 401)).toBe('You are signed out. Sign in again, then repeat this.');
    expect(explainError(null, fallback, 'hi', 403)).toMatch(DEVANAGARI);
    // A named rule still wins over the status.
    expect(explainError(validationError('ticket_limit'), fallback, 'en', 429)).toContain('many tickets');
  });

  it('a rule that arrives without its values falls back, never a sentence with a hole in it', () => {
    expect(explainError({ code: 'required' }, 'That did not work. Try again.')).toBe('That did not work. Try again.');
    expect(explainError({ code: 'too_short', params: { field: 'subject', have: { x: 1 }, min: 3 } }, 'That did not work. Try again.')).toBe('That did not work. Try again.');
    expect(explainError({ code: 'phone_digits', params: { have: 9, need: 10 } }, 'x')).toBe('Phone number has 9 digits; it needs 10.');
    expect(isErrorRule('phone_digits')).toBe(true);
    expect(isErrorRule('constructor')).toBe(false);
  });
});
