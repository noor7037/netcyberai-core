import type { Tone } from '@/lib/semantic';
import type { IconName } from '@/components/visual/Icons';
import type { Faq } from './catalog';

// Resource sections. `status: 'coming'` sections say so plainly: no
// fabricated case studies, webinars, videos or API. Rules enforced by
// src/content/resources.test.ts mirror the CI SEO audit.

export interface ResourceSection {
  slug: string;
  name: string;
  tone: Tone;
  icon: IconName;
  status: 'available' | 'coming';
  title: string;
  description: string;
  heroTitle: string;
  heroLead: string;
  items: { title: string; body: string; href?: string }[];
  faqs?: Faq[];
}

export const resourceSections: ResourceSection[] = [
  {
    slug: 'guides',
    name: 'Guides',
    tone: 'product',
    icon: 'academics',
    status: 'available',
    title: 'Guides',
    description:
      'Practical guides for Indian school leaders: WhatsApp fee reminders, the Daily Learning Pulse, attendance alerts, recognition, certificates and data ownership.',
    heroTitle: 'Practical guides for running a connected school',
    heroLead:
      'These guides explain how schools can handle everyday operations more calmly: fee reminders on WhatsApp, a daily learning update parents read, attendance alerts that do not spam, fair recognition, and certificates with a proper trail. Each one is written for principals and office teams, and each links to the full article on our blog.',
    items: [
      { title: 'Automating fee reminders with WhatsApp and UPI', body: 'A reminder schedule that is polite, timely and traceable.', href: '/blog/automate-school-fee-reminders-whatsapp-upi-india' },
      { title: 'Why parents don’t check school apps', body: 'And what they do read instead.', href: '/blog/why-parents-dont-check-school-apps' },
      { title: 'Attendance alerts without spamming parents', body: 'Consent, quiet hours and the right level of detail.', href: '/blog/school-attendance-alerts-without-spamming-parents' },
      { title: 'Personal Best vs top-3 recognition', body: 'Recognition every student can earn.', href: '/blog/personal-best-vs-top-3-recognition' },
      { title: 'Digital TC and character certificates', body: 'Clearance, approval and a record of who signed.', href: '/blog/digital-tc-character-certificate-workflow' },
      { title: 'School ERP data ownership checklist', body: 'Questions to ask before you sign anything.', href: '/blog/school-erp-data-ownership-pre-contract-checklist' },
    ],
  },
  {
    slug: 'help-center',
    name: 'Help Center',
    tone: 'communication',
    icon: 'support',
    status: 'available',
    title: 'Help Center',
    description:
      'NetCyberAI help center: how onboarding works, where common tasks live, and how to reach a real person for support by email or WhatsApp during a rollout.',
    heroTitle: 'Help from real people, while the articles are written',
    heroLead:
      'Detailed step-by-step help articles are still being written. Until they are published, every school on a pilot or rollout gets direct help from our team by email or WhatsApp. This page explains how onboarding works, where the most common tasks live in the portal, and how to reach us when something is unclear.',
    items: [
      { title: 'How onboarding works', body: 'Your school is set up, staff are invited, records are imported and checked, and messaging stays off until you switch it on.' },
      { title: 'Importing students', body: 'Upload a CSV; every row is validated and you see exactly which rows need fixing before anything is saved.' },
      { title: 'Marking attendance', body: 'Teachers open the Today screen on their phone and mark each class in under a minute.' },
      { title: 'Getting support', body: 'Email or WhatsApp our team; a real person replies.', href: '/support' },
    ],
  },
  {
    slug: 'faqs',
    name: 'FAQs',
    tone: 'intelligence',
    icon: 'chat',
    status: 'available',
    title: 'FAQs',
    description:
      'Frequently asked questions about NetCyberAI: parent WhatsApp updates, data ownership, pricing, pilots, teacher privacy, recognition and module availability.',
    heroTitle: 'Straight answers to common questions',
    heroLead:
      'School leaders ask us the same important questions before they decide anything: do parents need an app, who owns the data, what does it cost, how does a pilot work, and are teachers or students ranked. Here are straight answers. If your question is not here, ask us directly and a real person will reply.',
    items: [],
    faqs: [
      { question: 'Do parents need to install an app?', answer: 'No. Everything reaches parents on WhatsApp. A web portal exists but is optional.' },
      { question: 'Who owns the data?', answer: 'The school. PostgreSQL is the single source of truth, and self-serve full export is planned but not live yet.' },
      { question: 'How does a pilot work?', answer: 'Your school is set up with outbound messaging switched off until you are ready, so nothing reaches parents early.' },
      { question: 'Are teachers ranked?', answer: 'No. Each teacher has a private Impact Card, visible only to them and their principal.' },
      { question: 'What does it cost?', answer: 'Pricing is not fixed yet; request pricing and we will quote for your school.' },
      { question: 'Which modules are live today?', answer: 'Availability is confirmed with you during the demo; nothing is sold as live until it is.' },
    ],
  },
  {
    slug: 'case-studies',
    name: 'Case Studies',
    tone: 'achievement',
    icon: 'trophy',
    status: 'coming',
    title: 'Case Studies',
    description:
      'NetCyberAI case studies will be published only with a school’s written permission and verified results. None are published yet, and we will not invent any.',
    heroTitle: 'Case studies, only when they are real',
    heroLead:
      'We have not published any case studies yet. When pilot schools complete a full term, we will publish what actually happened, with the school’s written permission and results we can verify. Until then, the best way to judge NetCyberAI is to see it working in a demo using your own school’s structure and questions.',
    items: [
      { title: 'Nothing published yet', body: 'No customer stories, logos or results appear on this site until they are real and permitted.' },
      { title: 'See it instead', body: 'Book a demo and we will walk through your school’s actual workflows.', href: '/book-demo' },
    ],
  },
  {
    slug: 'webinars',
    name: 'Webinars',
    tone: 'action',
    icon: 'users',
    status: 'coming',
    title: 'Webinars',
    description:
      'NetCyberAI webinars for principals and office teams are not scheduled yet. Book a live walkthrough for your own school instead, at a time that suits your team.',
    heroTitle: 'No webinars scheduled yet',
    heroLead:
      'We are not running public webinars yet. Instead, we do live walkthroughs for individual schools, built around your own questions, your classes and your office’s daily routine. It takes about forty minutes, can include your principal and office staff, and there is no obligation to buy anything afterwards.',
    items: [{ title: 'Book a live walkthrough', body: 'A real person, your school’s questions, no recording required.', href: '/book-demo' }],
  },
  {
    slug: 'videos',
    name: 'Videos',
    tone: 'communication',
    icon: 'play',
    status: 'coming',
    title: 'Videos',
    description:
      'Recorded NetCyberAI product videos are in preparation. Meanwhile, take the interactive product tour on the homepage or try the clickable concept demo.',
    heroTitle: 'Videos are coming; the tour is here now',
    heroLead:
      'Recorded product videos are still being prepared. In the meantime there are two ways to see NetCyberAI working today: the interactive product tour on our homepage, which walks through a whole school day screen by screen, and the clickable concept demo, which uses a fictional school so you can explore each role freely.',
    items: [
      { title: 'Interactive product tour', body: 'A school day in eight moments.', href: '/#product-tour' },
      { title: 'Clickable concept demo', body: 'Principal, teacher and parent views with a fictional school.', href: '/demo' },
    ],
  },
  {
    slug: 'compliance',
    name: 'Compliance resources',
    tone: 'trust',
    icon: 'shield',
    status: 'available',
    title: 'Compliance resources',
    description:
      'How NetCyberAI handles consent, school data isolation, audit trails and data export, with links to our privacy policy, terms and the data ownership page.',
    heroTitle: 'How your school’s data is handled',
    heroLead:
      'This page gathers what schools ask about before sharing children’s data: how consent is recorded per purpose, how each school is isolated, how changes are audited, and where data export stands. We do not claim any certification; these are the rules the product enforces, so your own legal review can assess them properly.',
    items: [
      { title: 'Data ownership', body: 'Who owns the data, and the export plan.', href: '/security/data-ownership' },
      { title: 'Privacy policy', body: 'What we collect and why.', href: '/privacy' },
      { title: 'Terms of use', body: 'The terms for this website and demo.', href: '/terms' },
      { title: 'Consent ledger', body: 'Recorded per student, guardian and purpose; checked before every message.' },
    ],
  },
  {
    slug: 'api-docs',
    name: 'API documentation',
    tone: 'product',
    icon: 'link',
    status: 'coming',
    title: 'API documentation',
    description:
      'NetCyberAI does not offer a public API yet. Full data export is planned rather than live yet, and any integration needs are discussed during onboarding.',
    heroTitle: 'No public API yet, said plainly',
    heroLead:
      'There is no public API for NetCyberAI yet, and we would rather say so than publish documentation for something that does not exist. Full data export in standard formats is also planned rather than live, and we will say so here when it ships. If you need an integration, tell us during onboarding and we will discuss it.',
    items: [
      { title: 'Full data export', body: 'Planned, not live yet.', href: '/security/data-ownership' },
      { title: 'Integration requests', body: 'Tell us what you need to connect.', href: '/contact' },
    ],
  },
  {
    slug: 'release-notes',
    name: 'Release notes',
    tone: 'success',
    icon: 'sparkle',
    status: 'available',
    title: 'Release notes',
    description:
      'What has been built into the NetCyberAI platform so far: records and imports, attendance, the WhatsApp send gate, tenant isolation and onboarding tools.',
    heroTitle: 'What has shipped in the platform',
    heroLead:
      'These notes record what has actually been built into the NetCyberAI platform, newest first. They describe the foundations schools rely on, such as records, attendance, messaging safety and data isolation, rather than marketing features. Modules shown elsewhere on this site with fictional data are listed here only once they have genuinely shipped.',
    items: [
      { title: 'Public website with interactive product tour', body: 'The visual site you are reading, with role explorer, live ecosystem and product previews.' },
      { title: 'Lead capture for demos and onboarding', body: 'Get Started and Book a Demo requests reach the onboarding pipeline.' },
      { title: 'Academic sessions', body: 'Classes and exams scoped to an academic session.' },
      { title: 'WhatsApp send gate', body: 'One gate for every message: consent, quiet hours and pilot whitelist enforced.' },
      { title: 'Attendance data model', body: 'Attendance with corrections kept on the record.' },
      { title: 'Student and guardian records', body: 'CSV import with validation, document capture and QR ID cards.' },
      { title: 'Tenant isolation and audit hardening', body: 'Row-level security per school and an append-only audit trail.' },
    ],
  },
];

export function findResource(slug: string) {
  return resourceSections.find((r) => r.slug === slug);
}
