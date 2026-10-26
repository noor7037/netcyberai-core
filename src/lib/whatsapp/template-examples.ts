import type { TemplateLanguage } from './templates';

// The made-up values Meta's reviewers read with a template (C345): Meta asks for one example of each value when a
// template is submitted. They go to Meta's review only. Nothing here is ever shown in the product or sent to a
// family. One per value's name and language; a value whose meaning differs between templates is keyed
// "template.value". The tests hold that every value of every template has one.
const EXAMPLES: Record<string, Record<TemplateLanguage, string>> = {
  school: { en: 'Sunrise Public School', hi: 'सनराइज़ पब्लिक स्कूल' },
  child: { en: 'Aarav', hi: 'आरव' },
  children: { en: 'Aarav and Diya', hi: 'आरव और दीया' },
  date: { en: '14-11-2026', hi: '14-11-2026' },
  due: { en: '28-10-2026', hi: '28-10-2026' },
  due_date: { en: '10-11-2026', hi: '10-11-2026' },
  amount: { en: '4500', hi: '4500' },
  receipt_no: { en: 'R-2026-0142', hi: 'R-2026-0142' },
  utr_last4: { en: '4821', hi: '4821' },
  pay_link: { en: 'https://www.netcyberai.com/pay/AB12CD', hi: 'https://www.netcyberai.com/pay/AB12CD' },
  link: { en: 'https://www.netcyberai.com/c/XY34ZW', hi: 'https://www.netcyberai.com/c/XY34ZW' },
  certificate: { en: 'bonafide certificate', hi: 'बोनाफ़ाइड प्रमाणपत्र' },
  number: { en: 'BC-2026-031', hi: 'BC-2026-031' },
  class: { en: '5-A', hi: '5-A' },
  notice: { en: 'The school will be closed on Friday for Diwali.', hi: 'दिवाली के लिए शुक्रवार को स्कूल बंद रहेगा।' },
  update: { en: '5-A, Maths: today the class learned fractions. Homework: Exercise 4.', hi: '5-A, गणित: आज कक्षा ने भिन्न सीखे। गृहकार्य: अभ्यास 4।' },
  answer: { en: 'Ask Aarav to explain one fraction from today’s lesson.', hi: 'आरव से आज के पाठ का एक भिन्न समझाने को कहें।' },
  details: { en: 'Please bring a water bottle and a cap.', hi: 'कृपया पानी की बोतल और टोपी साथ लाएँ।' },
  'data_check_request.details': { en: 'Name: school record Aarav K, Aadhaar Aarav Kumar', hi: 'नाम: स्कूल रिकॉर्ड Aarav K, आधार Aarav Kumar' },
  note: { en: 'The bus stop has been moved to the main gate, as you asked.', hi: 'आपके कहे अनुसार बस स्टॉप मुख्य द्वार पर कर दिया गया है।' },
  owner: { en: 'The class teacher', hi: 'कक्षा अध्यापक' },
  ref: { en: 'C-0042', hi: 'C-0042' },
  teacher: { en: 'Mrs Sharma', hi: 'श्रीमती शर्मा' },
  time: { en: '10:30', hi: '10:30' },
  times: { en: '10:00, 10:15, 11:00', hi: '10:00, 10:15, 11:00' },
  from: { en: '10:00', hi: '10:00' },
  to: { en: '13:00', hi: '13:00' },
  title: { en: 'Annual Day', hi: 'वार्षिक उत्सव' },
  when: { en: '20-12-2026 at 5 pm', hi: '20-12-2026 शाम 5 बजे' },
};

// The example for one value of one template, in its language; null when there is none (the tests forbid that).
export function templateExample(template: string, variable: string, language: TemplateLanguage): string | null {
  return (EXAMPLES[`${template}.${variable}`] ?? EXAMPLES[variable])?.[language] ?? null;
}
