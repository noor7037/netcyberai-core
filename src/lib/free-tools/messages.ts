// Message text for the free Fee Reminder and Daily Pulse builders. The
// wording follows two product rules: messages are one-to-one (never a
// group, never naming another child) and they are respectful (no
// shaming, no threats). Plain string templates, deterministic output.

export interface FeeReminderInput {
  parentName: string;
  studentName: string;
  className: string;
  feeLabel: string; // e.g. "September fee"
  amount: string; // as typed, e.g. "8,400"
  dueDate: string; // as typed, e.g. "10 October"
  schoolName: string;
  paymentNote: string; // optional, e.g. a UPI ID or "at the school office"
  stage: 'gentle' | 'due-today' | 'overdue';
}

const clean = (s: string) => s.trim().replace(/\s+/g, ' ');

export function feeReminderMessage(i: FeeReminderInput): { english: string; hinglish: string } {
  const parent = clean(i.parentName) || 'Parent';
  const student = clean(i.studentName) || 'your child';
  const cls = clean(i.className);
  const fee = clean(i.feeLabel) || 'fee';
  const amount = clean(i.amount);
  const due = clean(i.dueDate);
  const school = clean(i.schoolName) || 'the school';
  const pay = clean(i.paymentNote);
  const who = cls ? `${student} (${cls})` : student;
  const amt = amount ? `₹${amount.replace(/^₹\s*/, '')}` : '';

  const enLead =
    i.stage === 'gentle'
      ? `This is a gentle reminder that the ${fee}${amt ? ` of ${amt}` : ''} for ${who} is due${due ? ` on ${due}` : ' soon'}.`
      : i.stage === 'due-today'
        ? `The ${fee}${amt ? ` of ${amt}` : ''} for ${who} is due today.`
        : `Our records show the ${fee}${amt ? ` of ${amt}` : ''} for ${who} is still pending${due ? ` since ${due}` : ''}. If you have already paid, please ignore this message and accept our thanks.`;
  const hiLead =
    i.stage === 'gentle'
      ? `${student} ki ${fee}${amt ? ` (${amt})` : ''}${due ? ` ${due} tak` : ''} jama karni hai.`
      : i.stage === 'due-today'
        ? `${student} ki ${fee}${amt ? ` (${amt})` : ''} aaj jama karni hai.`
        : `${student} ki ${fee}${amt ? ` (${amt})` : ''} abhi baaki hai. Agar aapne jama kar di hai to kripya is message ko ignore karein.`;

  const english = [
    `Dear ${parent},`,
    enLead,
    pay ? `You can pay ${pay}.` : '',
    'If you need more time or have a question, please reply here and we will help.',
    `Thank you, ${school}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  const hinglish = [
    `Namaste ${parent},`,
    hiLead,
    pay ? `Aap ${pay} bhugtan kar sakte hain.` : '',
    'Kisi bhi sawaal ke liye isi number par reply kijiye.',
    `Dhanyavaad, ${school}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return { english, hinglish };
}

export interface PulseSubject {
  subject: string;
  topic: string;
  question: string;
}

export interface PulseInput {
  studentName: string;
  className: string;
  schoolName: string;
  subjects: PulseSubject[];
}

export function dailyPulseMessage(i: PulseInput): string {
  const student = clean(i.studentName) || 'your child';
  const school = clean(i.schoolName) || 'School';
  const cls = clean(i.className);
  const lines = i.subjects
    .map((s) => ({ subject: clean(s.subject), topic: clean(s.topic), question: clean(s.question) }))
    .filter((s) => s.subject || s.topic)
    .map((s, n) => `${n + 1}. ${[s.subject, s.topic].filter(Boolean).join(': ')}${s.question ? `\n   Ask at home: ${s.question}` : ''}`);
  return [
    `${school}${cls ? ` · ${cls}` : ''} · Today’s learning`,
    `Here is what ${student} learned in school today. / Aaj ${student} ne school mein yeh seekha:`,
    lines.length ? lines.join('\n') : '(Add at least one subject above.)',
    `How well did ${student} understand today? Reply with 1, 2 or 3.\n1 = Achhe se samjha\n2 = Thoda samjha\n3 = Samajh nahi aaya`,
  ].join('\n\n');
}
