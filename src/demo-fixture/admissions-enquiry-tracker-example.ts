import { addDays, formatDate, type Enquiry } from '@/lib/free-tools/admissions-tracker';

// Example enquiries for the Admissions Enquiry Tracker's "Try an example"
// button. Fictional families at a fictional school; no real people. Dates
// are set around today so the follow-up list always has something in it.
// Kept in the demo fixture because it is demonstration data.

export function admissionsExample(today: string): Enquiry[] {
  const d = (n: number) => addDays(today, n);
  const note = (n: number, text: string) => `${formatDate(d(n))}: ${text}`;
  const base = { notes: '', notJoiningReason: '', nextStep: '', followUp: '' };
  return [
    { ...base, id: 'ex-1', parentName: 'Meena Joshi', phone: '98765 43201', childName: 'Ira Joshi', classWanted: 'Nursery', source: 'Walk-in', stage: 'Visit booked', nextStep: 'Show the play area and the bus route', followUp: d(0), notes: note(-6, 'Walked in, asked about transport'), added: d(-6), updated: d(-2) },
    { ...base, id: 'ex-2', parentName: 'Rajesh Kumar', phone: '98765 43202', childName: 'Aryan Kumar', classWanted: 'Class 1', source: 'Phone call', stage: 'Enquiry', nextStep: 'Call back with the fee structure', followUp: d(-3), added: d(-5), updated: d(-5) },
    { ...base, id: 'ex-3', parentName: 'Fatima Shaikh', phone: '98765 43203', childName: 'Zoya Shaikh', classWanted: 'LKG', source: 'WhatsApp', stage: 'Visited', nextStep: 'Ask if they would like the admission form', followUp: d(-1), notes: note(-4, 'Visited with grandmother, liked the library'), added: d(-9), updated: d(-4) },
    { ...base, id: 'ex-4', parentName: 'Suresh Iyer', phone: '98765 43204', childName: 'Nila Iyer', classWanted: 'Class 6', source: 'Website', stage: 'Form taken', nextStep: 'Remind them to submit the form', followUp: d(3), added: d(-24), updated: d(-20) },
    { ...base, id: 'ex-5', parentName: 'Anita Desai', phone: '98765 43205', childName: 'Rohan Desai', classWanted: 'Class 3', source: 'Referral', stage: 'Form submitted', nextStep: 'Confirm the interaction date', followUp: d(2), added: d(-12), updated: d(-1) },
    { ...base, id: 'ex-6', parentName: 'Gurpreet Singh', phone: '98765 43206', childName: 'Simran Kaur', classWanted: 'UKG', source: 'Referral', stage: 'Admitted', added: d(-30), updated: d(-3) },
    { ...base, id: 'ex-7', parentName: 'Lakshmi Rao', phone: '98765 43207', childName: 'Dev Rao', classWanted: 'Class 2', source: 'Newspaper or hoarding', stage: 'Not joining', notJoiningReason: 'Chose a school nearer home', added: d(-21), updated: d(-8) },
    { ...base, id: 'ex-8', parentName: 'Imran Khan', phone: '98765 43208', childName: 'Ayaan Khan', classWanted: 'Nursery', source: 'WhatsApp', stage: 'Enquiry', added: d(-16), updated: d(-16) },
    { ...base, id: 'ex-9', parentName: 'Pooja Mehta', phone: '98765 43209', childName: 'Kiara Mehta', classWanted: 'Class 1', source: 'Walk-in', stage: 'Admitted', added: d(-28), updated: d(-10) },
    { ...base, id: 'ex-10', parentName: 'Vikram Patel', phone: '98765 43210', childName: 'Arjun Patel', classWanted: 'Class 9', source: 'Website', stage: 'Not joining', notJoiningReason: 'Fees', added: d(-25), updated: d(-12) },
    { ...base, id: 'ex-11', parentName: 'Sunita Bose', phone: '0141 2345678', childName: 'Tara Bose', classWanted: 'LKG', source: 'Phone call', stage: 'Visit booked', nextStep: 'Confirm Saturday visit', followUp: d(5), added: d(-3), updated: d(-2) },
  ];
}
