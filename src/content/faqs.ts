import type { FaqItem } from '@/components/content/FaqBlock';

// Frequently asked questions for the conversion pages (Decision Log C79).
// Every answer states only what is true today; commercial promises match
// confirmed claims in src/content/pricing.ts.

const goLive: FaqItem = {
  question: 'How fast can our school go live?',
  answer:
    'In under 24 hours once your student list is ready as an Excel or CSV file. If your records are on paper or in old software, our team prepares and uploads them for you, free, and we agree a date together.',
};

const noExcel: FaqItem = {
  question: 'Our student data is not in Excel. Can you still onboard us?',
  answer:
    'Yes. Send photos of your registers or an export from your current software. Our team prepares the data, checks every row and uploads it for you at no cost.',
};

const training: FaqItem = {
  question: 'Do you train our teachers, office staff and accountants?',
  answer: 'Yes. Setup and staff training are free. We train each role on the screens it will use, and we are on WhatsApp when questions come up later.',
};

const dataSafe: FaqItem = {
  question: 'Is our school’s data safe?',
  answer:
    'Your data is stored in India, each school is kept separate by row-level security in the database, and nothing is sent to parents until you switch WhatsApp on. You own your data.',
};

export const DEMO_FAQS: FaqItem[] = [
  {
    question: 'Is the demo really free?',
    answer: 'Yes. The demo is free, with no obligation and no payment details asked. We show NetCyberAI using your own classes and questions.',
  },
  {
    question: 'How long does a demo take, and who should join?',
    answer: 'Usually under an hour, on a video call or in person. The principal and whoever handles fees or admissions get the most from it.',
  },
  goLive,
  noExcel,
  training,
  dataSafe,
];

export const GET_STARTED_FAQS: FaqItem[] = [
  {
    question: 'What happens after I send this form?',
    answer: 'A person on our team reads it and calls or messages you on the number you shared, to understand your school before suggesting anything.',
  },
  {
    question: 'Are there setup fees or a contract lock-in?',
    answer: 'No setup fees, and you can cancel anytime with no questions asked. Your first month is free, with full capabilities.',
  },
  goLive,
  noExcel,
  training,
];

export const PILOT_FAQS: FaqItem[] = [
  {
    question: 'What is a pilot?',
    answer: 'A few classes use NetCyberAI first, so you can see results with your own staff and parents before rolling it out to the whole school.',
  },
  {
    question: 'Will parents get messages during the pilot without our approval?',
    answer: 'No. Outbound WhatsApp starts switched off for every new school. It is turned on only when you decide you are ready.',
  },
  {
    question: 'Do we have to roll out to the whole school afterwards?',
    answer: 'No. A pilot is not a contract to expand. You review the results with us and decide what comes next.',
  },
  noExcel,
  dataSafe,
];

export const FREE_TOOLS_FAQS: FaqItem[] = [
  {
    question: 'Are the free tools really free?',
    answer: 'Yes. Every tool and certificate generator is free and unlimited, with no login and no watermark, including certificates for a whole class from one CSV file.',
  },
  {
    question: 'Is anything I type sent to NetCyberAI?',
    answer: 'No. The tools run in your browser and nothing is uploaded or saved on our side. Your school’s own details can be saved in this browser so every tool fills them in; student details stay in the tab unless you save them to a file.',
  },
  {
    question: 'Can I print or share the results?',
    answer: 'Yes. Every tool prints and downloads an A4 PDF, and calculators export CSV and share by WhatsApp or email with a link that carries numbers only.',
  },
  {
    question: 'What does NetCyberAI add on top of the free tools?',
    answer: 'The full platform does these jobs automatically from your school’s own records: bulk certificates, sending them to parents on WhatsApp, fee reminders, attendance alerts and reports on a schedule.',
  },
];

export const PRODUCT_TOUR_FAQS: FaqItem[] = [
  {
    question: 'Is the data in the product tour real?',
    answer: 'No. The tour shows example data, so no real child or family appears anywhere on this website.',
  },
  {
    question: 'Which modules are live today?',
    answer: 'The module list on this page marks each one as live or in development. We never sell a module to a school as live until it is.',
  },
  {
    question: 'Can I see it with my own school’s data?',
    answer: 'Yes. Book a free demo and we walk through NetCyberAI with your own classes during onboarding.',
  },
  goLive,
];

export const HOME_GO_LIVE_FAQ = goLive;
export const PRICING_SETUP_FAQ = noExcel;
