import type { Metadata } from 'next';
import {
  companyName,
  contactEmail,
  ogLocale,
  serviceRegion,
  siteLanguage,
  siteTagline,
  siteUrl,
} from './site-config';
import { plans } from '@/content/pricing';

export const ogImageSize = { width: 1200, height: 630 } as const;

// One card per page type. Blog posts are excluded: each post's own
// segment renders a per-title card via blog/[slug]/opengraph-image.tsx.
export const ogCards = {
  site: {
    route: '/opengraph-image',
    eyebrow: 'Not another school ERP',
    title: siteTagline,
    alt: `${companyName}: ${siteTagline}`,
  },
  feature: {
    route: '/features/opengraph-image',
    eyebrow: 'Product feature',
    title: `How ${companyName} works for Indian schools`,
    alt: `${companyName} product feature`,
  },
} as const;

export interface PageMetaInput {
  path: string;
  title: string;
  description: string;
  // Skip the " | NetCyberAI" title template (home page, long blog headlines).
  absoluteTitle?: boolean;
}

export const pageMeta = {
  home: {
    path: '/',
    title: 'NetCyberAI — The Connected School Platform for India',
    description:
      'NetCyberAI connects every role in an Indian school on one validated record: WhatsApp learning updates for parents, a Today screen for teachers, school health.',
    absoluteTitle: true,
  },
  feeRecovery: {
    path: '/features/whatsapp-fee-recovery-upi',
    title: 'WhatsApp Fee Reminders with UPI for Schools',
    description:
      'Automate WhatsApp fee reminders and UPI payment links for your school with a D-3 to D+7 sequence. See exactly how the flow works, and what it does not do.',
  },
  dailyPulse: {
    path: '/features/daily-learning-pulse-hinglish',
    title: 'Daily Learning Pulse: Hinglish WhatsApp Updates',
    description:
      'See how the Daily Learning Pulse sends a short Hinglish WhatsApp update to parents every school day, including honest delayed, partial, or not-taught flags.',
  },
  certificates: {
    path: '/features/digital-tc-character-bonafide-pipeline',
    title: 'Digital TC & Character Certificate Pipeline',
    description:
      'Track transfer certificate, character, and bonafide requests through a clear five-stage pipeline, from application to signed WhatsApp delivery, for schools.',
  },
  teacherImpact: {
    path: '/features/teacher-impact-card-principal-only',
    title: 'Teacher Impact Card: Principal-and-Self View',
    description:
      'Why public teacher leaderboards backfire, and how a private, principal-and-self-only Teacher Impact Card measures teaching quality without public shaming.',
  },
  weeklyBrief: {
    path: '/features/parent-weekly-confidence-brief',
    title: 'Weekly Confidence Brief for Parents',
    description:
      'A weekly WhatsApp brief gives parents three dinner-table questions based on what their child actually learned that week, in plain Hinglish, not jargon.',
  },
  form6: {
    path: '/features/haryana-form-6-fee-advisory',
    // Source: https://exam.buddy4study.com/haryana-government-sets-mandatory-cap-on-school-fee-hike -- same figure cited inline on the page itself, src/app/features/haryana-form-6-fee-advisory/page.tsx.
    title: 'Haryana Form 6 Fee Advisory (CPI + 5% Cap)',
    description:
      'Haryana caps private school fee hikes near CPI plus 5% and requires an annual Form 6 filing. See the rule, the filing requirement, and an advisory-only check.',
  },
  dataOwnership: {
    path: '/security/data-ownership',
    title: 'Data Ownership & Security',
    description:
      'How NetCyberAI handles school data: consent gating, WhatsApp privacy, data residency, and export rights, explained plainly for a principal, not a lawyer.',
  },
  privacy: {
    path: '/privacy',
    title: 'Privacy Policy',
    description:
      'NetCyberAI’s privacy policy: what data this website collects today, what a future school deployment will process, and your rights under India’s DPDP Act.',
  },
  terms: {
    path: '/terms',
    title: 'Terms of Use',
    description:
      'Terms of use for the NetCyberAI website and demos, covering acceptable use, intellectual property, limitation of liability, and governing law in India.',
  },
  pricing: {
    path: '/pricing',
    title: 'Pricing',
    description:
      'NetCyberAI pricing per student: Free tools, then Starter, Growth and Compass plans, monthly or yearly with two months free, compared module by module here.',
  },
  blog: {
    path: '/blog',
    title: 'Blog',
    description:
      'Guides on WhatsApp fee automation, Haryana Form 6 compliance, certificate workflows, and non-demotivating student recognition, for Indian school principals.',
  },
  getStarted: {
    path: '/get-started',
    title: 'Get Started',
    description:
      'Tell us about your school and we will reach out to take you live on NetCyberAI — no invented pricing, a real request reaching our team, not a dead-end form.',
  },
  registerSchool: {
    path: '/register-school',
    title: 'Register Your School',
    description:
      'Register your school on NetCyberAI: tell us about it, confirm the principal’s email with a code, and our team reviews it and invites the principal to sign in.',
  },
  bookDemo: {
    path: '/book-demo',
    title: 'Book a Demo',
    description:
      'Pick a preferred date and time, tell us what to cover, and our team will confirm a real product walkthrough of NetCyberAI for your school, no automated reply.',
  },
  products: {
    path: '/products',
    title: 'Products',
    description:
      'Everything NetCyberAI covers for an Indian school: School Management, AI Insights, Parent Engagement, Fees, Attendance, Academics, Communication, Reports.',
  },
  solutions: {
    path: '/solutions',
    title: 'Solutions',
    description:
      'NetCyberAI by role and school type: Principal, School Admin, Teacher, Finance, Admissions, Multi-school groups, CBSE schools, budget-conscious private schools.',
  },
  resources: {
    path: '/resources',
    title: 'Resources',
    description:
      'Guides, FAQs, case studies, and compliance resources for Indian school leaders evaluating NetCyberAI and WhatsApp-native parent engagement for their school.',
  },
  about: {
    path: '/about',
    title: 'About',
    description: `Why ${companyName} exists, and what it is not: a focused WhatsApp-native parent-engagement and fee-communication layer for Indian schools, not an ERP replacement.`,
  },
  contact: {
    path: '/contact',
    title: 'Contact',
    description: `Reach the ${companyName} team directly for a demo, a pilot enquiry, or a question about how the WhatsApp parent-engagement platform actually works day to day.`,
  },
  features: {
    path: '/features',
    title: 'Features',
    description:
      'NetCyberAI features for Indian schools: the Daily Learning Pulse, WhatsApp fee recovery, Personal Best, Teacher Impact Card, digital certificates and more.',
  },
  freeTools: {
    path: '/free-tools',
    title: 'Free Tools for Schools',
    description:
      'Free school tools: fee and attendance planners, bulk TC and certificate maker, APAAR data check, RTE claim sheet, admission and fee trackers and remarks.',
  },
  productTour: {
    path: '/product-tour',
    title: 'Product Tour',
    description:
      'Explore NetCyberAI hands-on: every principal dashboard module, the teacher staff app and the parent WhatsApp menu, and see which modules are live today.',
  },
  startPilot: {
    path: '/start-pilot',
    title: 'Start a Pilot',
    description:
      'Start a NetCyberAI pilot at your school: outbound WhatsApp stays off until you are ready, records are imported and checked, and a real person guides setup.',
  },
  brochure: {
    path: '/brochure',
    title: 'Brochure',
    description:
      'The NetCyberAI brochure: what the connected school platform does for principals, teachers, parents and finance, in one printable page you can save as a PDF.',
  },
  support: {
    path: '/support',
    title: 'Support',
    description:
      'NetCyberAI support: reach a real person by email or WhatsApp, see how onboarding works, and find answers for schools already on a pilot or on a full rollout.',
  },
} satisfies Record<string, PageMetaInput>;

export function absoluteUrl(path: string): string {
  return path === '/' ? siteUrl : `${siteUrl}${path}`;
}

export function buildMetadata(
  input: PageMetaInput & { type?: 'website' | 'article'; publishedTime?: string }
): Metadata {
  const { path, title, description, absoluteTitle = false, type = 'website', publishedTime } = input;
  const url = absoluteUrl(path);
  const shared = { title, description, url, siteName: companyName, locale: ogLocale };
  const card = path.startsWith('/features/') ? ogCards.feature : ogCards.site;

  // Every page gets the full openGraph/twitter objects: Next.js replaces
  // (not merges) these per segment, so partial objects would silently
  // drop siteName and locale inherited from the root layout.
  //
  // Article pages (blog posts) never set `images` here at all — even
  // `images: undefined` makes Next.js treat the key as an explicit
  // override and skip its automatic per-segment opengraph-image.tsx
  // file resolution, which is how each blog post gets its own card.
  // Non-article pages have no such per-page file, so they name their
  // shared card (site or feature) explicitly.
  const openGraph =
    type === 'article'
      ? { ...shared, type: 'article' as const, publishedTime }
      : {
          ...shared,
          type: 'website' as const,
          images: [{ url: card.route, ...ogImageSize, alt: card.alt }],
        };

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: url, languages: { [siteLanguage]: url } },
    openGraph,
    twitter: { card: 'summary_large_image' },
  };
}

type JsonLd = Record<string, unknown>;

// Escapes "<" so structured data can never terminate its <script> tag.
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

const organizationRef = { '@type': 'Organization', name: companyName, url: siteUrl };

export function organizationJsonLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    ...organizationRef,
    email: contactEmail,
    address: { '@type': 'PostalAddress', ...serviceRegion },
    areaServed: serviceRegion.addressCountry,
    // Stays empty until real, owned profile URLs exist. A guessed
    // social URL here is a fabricated claim like any other.
    sameAs: [] as string[],
  };
}

export function websiteJsonLd(): JsonLd {
  // Deliberately no `potentialAction: SearchAction` — that property,
  // not the WebSite type alone, is what grants sitelinks search box
  // eligibility, and it requires a real search results endpoint to
  // point at. This site has no working site search, so adding one
  // would be a fabricated capability, not an optimisation.
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: companyName,
    url: siteUrl,
    inLanguage: siteLanguage,
  };
}

export function breadcrumbListJsonLd(page: { path: string; title: string }): JsonLd {
  const sectionLabel: Record<string, string> = {
    features: 'Features',
    blog: 'Blog',
    security: 'Security',
    products: 'Products',
    solutions: 'Solutions',
    resources: 'Resources',
    'free-tools': 'Free tools',
  };
  const segments = page.path.split('/').filter(Boolean);
  const items = [{ name: 'Home', path: '/' }];
  let acc = '';
  segments.forEach((seg, i) => {
    acc += `/${seg}`;
    const isLast = i === segments.length - 1;
    items.push({ name: isLast ? page.title : (sectionLabel[seg] ?? seg), path: acc });
  });
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

// Single source for pricing-tier copy in structured data. Prices are read
// from src/content/pricing.ts (rupees per enrolled student per month), so
// the visible cards and this data can never drift apart.
export const pricingTiers = [
  {
    name: 'Free',
    description: 'Free browser tools for any school: student import checker, attendance calculator, certificate studio, and fee reminder and parent update builders.',
  },
  {
    name: 'Starter',
    description: 'Student records, attendance, homework, fees with UPI collection to the school’s own account, receipts, notices and the Daily Learning Pulse.',
  },
  {
    name: 'Growth',
    description: 'Starter, plus the principal dashboard and reports, staff leave with automatic cover, meetings, events, complaints, exams and report cards.',
  },
  {
    name: 'Compass',
    description: 'Growth, plus Early Warning, the School Health Auditor, Parent AI, Personal Best recognition and learning insights.',
  },
] satisfies { name: string; description: string }[];

export function softwareApplicationJsonLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: companyName,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: siteUrl,
    offers: pricingTiers.map((tier) => {
      const monthly = plans.find((p) => p.name === tier.name)?.price?.monthly;
      return {
        '@type': 'Offer',
        name: tier.name,
        description: tier.description,
        ...(monthly === undefined
          ? { price: '0', priceCurrency: 'INR' }
          : {
              priceCurrency: 'INR',
              priceSpecification: { '@type': 'UnitPriceSpecification', price: String(monthly), priceCurrency: 'INR', unitText: 'per student per month' },
            }),
      };
    }),
  };
}

export interface HowToStepInput {
  name: string;
  text: string;
}

export function howToJsonLd(input: { name: string; description: string; steps: HowToStepInput[] }): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: input.name,
    description: input.description,
    step: input.steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}

export function faqPageJsonLd(items: { question: string; answer: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: siteLanguage,
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

export function articleJsonLd(article: {
  path: string;
  title: string;
  description: string;
  publishedOn: string;
}): JsonLd {
  const url = absoluteUrl(article.path);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    datePublished: article.publishedOn,
    dateModified: article.publishedOn,
    inLanguage: siteLanguage,
    mainEntityOfPage: url,
    url,
    author: organizationRef,
    publisher: organizationRef,
  };
}
