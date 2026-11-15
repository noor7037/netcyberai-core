import { contentHash } from './hash';
import type { DesiredRow } from './import-plan';
import type { ActionType, CareerLevel, Cost, Effort, StreamSlug } from './types';

// Turns a short career spec into the seed the importer loads. Every row is general knowledge.
// The review day is one year out, or three months when the step names an exam. The founder approves before a family sees it.

export const SEED_BATCH = 'careers-2026-11-a';
const ANCHOR = '2026-11-15';
const DUE_YEAR = '2027-11-15';
const DUE_EXAM = '2027-02-15';

export type Bi = readonly [string, string];
export type Pack = 'it' | 'trade' | 'gov' | 'health' | 'law' | 'teach' | 'design' | 'commerce' | 'farm' | 'engineering';

export type CareerSpec = {
  slug: string;
  field: string;
  level: CareerLevel;
  title: Bi;
  summary: Bi;
  streams: StreamSlug[];
  min: string;
  qual: Bi;
  exam?: readonly [string, string, string, string, string];
  study: Bi;
  first: Bi;
  roles: readonly [Bi, Bi, Bi, Bi];
  pack: Pack;
  url?: string;
  isco?: string;
  onet?: string;
  nco?: string;
  gov?: 'D' | 'C' | 'B' | 'A';
  horizon?: Bi;
  compete?: Bi;
};

export type FieldSpec = { id: string; en: string; hi: string; sort: number };

export type SeedBundle = {
  batch: string;
  fields: FieldSpec[];
  careers: CareerSpec[];
  crosses: CrossSpec[];
  laterals: LateralSpec[];
};

export type CrossSpec = {
  key: string;
  via: Bi;
  conditions: Bi;
  url?: string;
  streams: StreamSlug[];
  toSlugs: string[];
  anyGraduate?: boolean;
};

export type LateralSpec = {
  key: string;
  fromKind: 'portfolio' | 'skills' | 'experience' | 'certification' | 'apprenticeship';
  detail: Bi;
  example: Bi;
  toSlug: string;
  minYears?: number;
  degreeRequired?: boolean;
  url?: string;
};

type StepOut = {
  key: string;
  career: string;
  lane: 'after_10' | 'entrance' | 'bachelor' | 'first_job' | 'growth';
  sort: number;
  en: string;
  hi: string;
  examEn?: string;
  examHi?: string;
  series?: string;
  url?: string;
  due: string;
};

type ActionOut = {
  key: string;
  career: string;
  stage: 'during_10' | 'during_12' | 'during_bachelor';
  type: ActionType;
  title: Bi;
  detail: Bi;
  effort: Effort;
  cost: Cost;
  url?: string;
};

const Bands: Bi[] = [
  ['0–2 years', '0–2 साल'],
  ['2–5 years', '2–5 साल'],
  ['5–10 years', '5–10 साल'],
  ['10+ years', '10 साल से अधिक'],
];

export function expandCareer(c: CareerSpec): { steps: StepOut[]; actions: ActionOut[]; compete: Bi } {
  const steps: StepOut[] = [];
  steps.push(step(c, 'after_10', 1, c.qual[0], c.qual[1], undefined, c.url));
  if (c.exam) {
    const [nameEn, nameHi, series, detailEn, detailHi] = c.exam;
    steps.push(step(c, 'entrance', 1, `${detailEn} Exam name: ${nameEn}.`, `${detailHi} परीक्षा का नाम: ${nameHi}.`, { examEn: nameEn, examHi: nameHi, series }, c.url));
  } else {
    steps.push(step(c, 'entrance', 1,
      'There is no single national entrance for every seat on this path. Admission or hiring follows the institute notice or the employer notice.',
      'इस रास्ते की हर सीट के लिए एक ही राष्ट्रीय प्रवेश परीक्षा नहीं है। दाखिला या भर्ती संस्थान या नियोक्ता की सूचना के अनुसार होती है।',
      undefined, c.url));
  }
  steps.push(step(c, 'bachelor', 1, c.study[0], c.study[1], undefined, c.url));
  steps.push(step(c, 'first_job', 1, `${c.first[0]} This card does not quote a salary.`, `${c.first[1]} इस कार्ड पर वेतन नहीं लिखा है।`, undefined, c.url));
  c.roles.forEach((role, i) => {
    const band = Bands[i]!;
    steps.push(step(c, 'growth', i + 1,
      `${band[0]}: a typical role is ${role[0]}. This is a common stage, not a guaranteed promotion.`,
      `${band[1]}: आम भूमिका ${role[1]} होती है। यह आम पड़ाव है, पदोन्नति का वादा नहीं।`,
      undefined, c.url));
  });
  return { steps, actions: actionsFor(c), compete: c.compete ?? COMPETE[c.pack] };
}

function step(c: CareerSpec, lane: StepOut['lane'], sort: number, en: string, hi: string, exam?: { examEn: string; examHi: string; series: string }, url?: string): StepOut {
  const due = exam?.series || exam?.examEn ? DUE_EXAM : DUE_YEAR;
  return { key: `${c.slug}|${lane}|${sort}`, career: c.slug, lane, sort, en, hi, examEn: exam?.examEn, examHi: exam?.examHi, series: exam?.series, url, due: lane === 'entrance' && exam ? DUE_EXAM : due };
}

const COMPETE: Record<Pack, Bi> = {
  it: [
    'A public portfolio and open source come first, and they are free. Paid certificates from a cloud or security body are optional and do not replace the portfolio. Study abroad, if a family chooses it, usually needs that university application and an English test such as IELTS; some US bachelor programmes also ask for the SAT. Remote work for a foreign team is possible in some software roles after a portfolio and experience. ISCO and O*NET codes only help you compare the role. They are not an Indian licence.',
    'पहले सार्वजनिक पोर्टफोलियो और ओपन सोर्स, दोनों मुफ़्त। क्लाउड या सुरक्षा संस्था का भुगतान वाला प्रमाणपत्र ऐच्छिक है, वह पोर्टफोलियो की जगह नहीं लेता। विदेश में पढ़ाई चुनें तो उस विश्वविद्यालय का आवेदन और अक्सर आईईएलटीएस जैसा अंग्रेज़ी टेस्ट लगता है। कुछ अमेरिकी स्नातक कार्यक्रम सैट भी माँगते हैं। कुछ सॉफ्टवेयर भूमिकाओं में अनुभव और पोर्टफोलियो के बाद दूर से काम मिल सकता है। आईएससीओ और ओ-नेट कोड केवल भूमिका की तुलना के लिए हैं। वे भारतीय लाइसेंस नहीं हैं।',
  ],
  engineering: [
    'A licensed engineer abroad must meet that country’s own rules. An Indian B.Tech does not by itself grant that licence. A portfolio of projects, a published college project and an English test such as IELTS are the usual study-abroad pieces. Codes below are for comparison only.',
    'विदेश में इंजीनियर का लाइसेंस उस देश के अपने नियम से मिलता है। भारतीय बीटेक अकेले वह लाइसेंस नहीं देता। परियोजनाओं का पोर्टफोलियो और आईईएलटीएस जैसा अंग्रेज़ी टेस्ट विदेश पढ़ाई में आम हैं। नीचे के कोड केवल तुलना के लिए हैं।',
  ],
  trade: [
    'An Indian ITI or NAC certificate is not automatically a foreign trade licence. Another country sets its own test. Free first steps are the national apprenticeship portal and Skill India Digital. Remote work is uncommon in site trades. The codes below only help you compare the work.',
    'भारतीय आईटीआई या एनएसी प्रमाणपत्र अपने आप विदेशी ट्रेड लाइसेंस नहीं है। हर देश अपनी परीक्षा रखता है। मुफ़्त की शुरुआत राष्ट्रीय अप्रेंटिसशिप पोर्टल और स्किल इंडिया डिजिटल से होती है। साइट वाले ट्रेड में दूर से काम कम होता है। नीचे के कोड केवल काम की तुलना के लिए हैं।',
  ],
  gov: [
    'These are Indian public posts. A foreign certificate does not replace the Indian exam. Study abroad does not add marks unless that exam’s current notice says so. The codes below are only a way to describe the work, not a qualification.',
    'ये भारतीय सरकारी पद हैं। विदेशी प्रमाणपत्र भारतीय परीक्षा की जगह नहीं लेता। विदेश पढ़ाई से अंक नहीं जुड़ते, जब तक उस परीक्षा की ताज़ा सूचना ऐसा न कहे। नीचे के कोड केवल काम के वर्णन के लिए हैं, योग्यता नहीं।',
  ],
  health: [
    'A doctor, nurse or pharmacist who wants to practise in another country must pass that country’s own licence test. Examples that families ask about are the USMLE for the United States and PLAB for the United Kingdom. An Indian degree alone does not grant that licence. IELTS is often part of that path. Verify the current notice.',
    'डॉक्टर, नर्स या फार्मासिस्ट को दूसरे देश में काम के लिए उस देश की अपनी लाइसेंस परीक्षा पास करनी होती है। परिवार अक्सर अमेरिका के लिए यूएसएमएलई और ब्रिटेन के लिए पीएलएबी का नाम लेते हैं। अकेला भारतीय डिग्री वह लाइसेंस नहीं देता। इस रास्ते में अक्सर आईईएलटीएस भी होता है। ताज़ा सूचना जाँचें।',
  ],
  law: [
    'An Indian law degree does not by itself give a right to practise in another country. Each country has its own bar exam. IELTS is the usual English test if you study abroad. Verify that country’s current rule.',
    'भारतीय कानून की डिग्री अपने आप दूसरे देश में वकालत का अधिकार नहीं देती। हर देश की अपनी बार परीक्षा होती है। विदेश पढ़ाई के लिए आम अंग्रेज़ी टेस्ट आईईएलटीएस है। उस देश का ताज़ा नियम जाँचें।',
  ],
  teach: [
    'A teaching licence abroad is that country’s own. Indian CTET or B.Ed is not automatically accepted. IELTS is often asked for study or migration. This card does not cover visas.',
    'विदेश का शिक्षण लाइसेंस उस देश का अपना होता है। भारतीय सीटेट या बीएड अपने आप मान्य नहीं। पढ़ाई या प्रवास में अक्सर आईईएलटीएस माँगा जाता है। यह कार्ड वीज़ा नहीं समझाता।',
  ],
  design: [
    'A public portfolio comes first. Colleges such as NID, NIFT and the UCEED institutes publish their own tests. Study abroad usually needs that college’s portfolio plus an English test such as IELTS. Remote freelance work exists for some design roles after the portfolio is strong. Codes below are for comparison only.',
    'पहले सार्वजनिक पोर्टफोलियो। एनआईडी, निफ्ट और यूसीड वाले संस्थान अपनी परीक्षा छापते हैं। विदेश पढ़ाई में अक्सर पोर्टफोलियो और आईईएलटीएस जैसा अंग्रेज़ी टेस्ट लगता है। मज़बूत पोर्टफोलियो के बाद कुछ डिज़ाइन काम दूर से भी मिलता है। नीचे के कोड केवल तुलना के लिए हैं।',
  ],
  commerce: [
    'Indian CA, CMA and CS are institute qualifications. They are not automatically a foreign accounting licence. A global body such as ACCA is a separate route with its own fees. Free first: the institute’s own study material and a clean set of practice accounts. IELTS if you study abroad.',
    'भारतीय सीए, सीएमए और सीएस संस्थान की योग्यताएँ हैं। वे अपने आप विदेशी लेखांकन लाइसेंस नहीं हैं। एसीसीए जैसी वैश्विक संस्था अलग रास्ता है, उसका अपना शुल्क है। मुफ़्त की शुरुआत संस्थान की अपनी सामग्री और साफ़ अभ्यास लेखों से करें। विदेश पढ़ाई में आईईएलटीएस।',
  ],
  farm: [
    'Farm practice abroad follows that country’s land and licence rules. An Indian agriculture degree is not a foreign licence. ICAR and a Krishi Vigyan Kendra are the public Indian routes. IELTS only if you apply to a foreign university.',
    'विदेश में खेती उस देश के ज़मीन और लाइसेंस नियमों पर चलती है। भारतीय कृषि डिग्री विदेशी लाइसेंस नहीं है। आईसीएआर और कृषि विज्ञान केन्द्र भारतीय सार्वजनिक रास्ते हैं। आईईएलटीएस तभी, जब विदेशी विश्वविद्यालय में आवेदन करें।',
  ],
};

function act(c: CareerSpec, stage: ActionOut['stage'], type: ActionType, title: Bi, detail: Bi, effort: Effort, cost: Cost, url?: string): ActionOut {
  return { key: `${c.slug}|${stage}|${type}|${title[0]}`, career: c.slug, stage, type, title, detail, effort, cost, url };
}

function actionsFor(c: CareerSpec): ActionOut[] {
  const pack = PACKS[c.pack];
  return pack.map((p) => act(c, p.stage, p.type, p.title, p.detail, p.effort, p.cost, p.url));
}

type PackAction = { stage: ActionOut['stage']; type: ActionType; title: Bi; detail: Bi; effort: Effort; cost: Cost; url?: string };

const common10: PackAction = {
  stage: 'during_10', type: 'skill',
  title: ['Keep the school subjects of this path steady', 'इस रास्ते के स्कूल विषय मज़बूत रखें'],
  detail: ['One hour on the weak subject, most days. This is general guidance, not a board rule.', 'अधिकतर दिनों कमज़ोर विषय पर एक घंटा। यह सामान्य मार्गदर्शन है, बोर्ड का नियम नहीं।'],
  effort: 'light', cost: 'free',
};

const PACKS: Record<Pack, PackAction[]> = {
  it: [
    common10,
    { stage: 'during_10', type: 'skill', title: ['School skill subject, if offered', 'स्कूल का स्किल विषय, अगर मिले'], detail: ['CBSE and some boards offer IT, Artificial Intelligence or coding as a skill subject in Class 9 and 10. Take it only if your school actually runs it.', 'सीबीएसई और कुछ बोर्ड कक्षा 9 और 10 में आईटी, आर्टिफिशियल इंटेलिजेंस या कोडिंग स्किल विषय देते हैं। तभी लें, जब आपका स्कूल सच में पढ़ाए।'], effort: 'light', cost: 'free', url: 'https://cbseacademic.nic.in' },
    { stage: 'during_10', type: 'project', title: ['One small project you can show', 'एक छोटी परियोजना जिसे दिखा सकें'], detail: ['A one-page site, a small script, or a written explanation of how a network works. Show it to a teacher.', 'एक पन्ने की साइट, छोटा स्क्रिप्ट, या लिखकर बताएँ कि नेटवर्क कैसे चलता है। शिक्षक को दिखाएँ।'], effort: 'medium', cost: 'free' },
    { stage: 'during_12', type: 'olympiad', title: ['A maths or science olympiad, if you qualify', 'गणित या विज्ञान ओलंपियाड, अगर योग्यता हो'], detail: ['HBCSE runs the official science olympiads. Read who may enter this year. It is not required for every computing career.', 'एचबीसीएसई आधिकारिक विज्ञान ओलंपियाड चलाता है। इस साल कौन बैठ सकता है, वह पढ़ें। हर कंप्यूटिंग करियर के लिए यह ज़रूरी नहीं।'], effort: 'heavy', cost: 'free', url: 'https://olympiads.hbcse.tifr.res.in' },
    { stage: 'during_12', type: 'portfolio', title: ['Start a project folder', 'परियोजनाओं का फ़ोल्डर शुरू करें'], detail: ['Keep two projects with a short note on what you built and what failed.', 'दो परियोजनाएँ रखें, और छोटा नोट लिखें कि क्या बनाया और क्या असफल रहा।'], effort: 'medium', cost: 'free' },
    { stage: 'during_bachelor', type: 'certification', title: ['NPTEL or SWAYAM course', 'एनपीटीईएल या स्वयं कोर्स'], detail: ['Learn free. The exam certificate may have a fee. The course page states it.', 'पढ़ाई मुफ़्त। परीक्षा प्रमाणपत्र पर शुल्क हो सकता है। कोर्स का पन्ना बताता है।'], effort: 'medium', cost: 'mixed', url: 'https://nptel.ac.in' },
    { stage: 'during_bachelor', type: 'internship', title: ['An internship or a real user for a project', 'इंटर्नशिप या परियोजना के लिए असली उपयोगकर्ता'], detail: ['A short internship, or a project a teacher, shop or club actually uses. Do not invent a company name on the resume.', 'छोटी इंटर्नशिप, या ऐसी परियोजना जिसे शिक्षक, दुकान या क्लब सच में इस्तेमाल करे। रिज़्यूमे पर कंपनी का नाम न गढ़ें।'], effort: 'heavy', cost: 'mixed' },
    { stage: 'during_bachelor', type: 'hackathon', title: ['A hackathon your college can enter', 'हैकाथॉन जिसमें आपका कॉलेज शामिल हो'], detail: ['Smart India Hackathon is one public example. Only colleges that qualify can field a team. Read that year’s rules.', 'स्मार्ट इंडिया हैकाथॉन एक सार्वजनिक उदाहरण है। वही कॉलेज टीम भेज सकते हैं जो योग्य हों। उस साल के नियम पढ़ें।'], effort: 'heavy', cost: 'free', url: 'https://www.sih.gov.in' },
    { stage: 'during_bachelor', type: 'portfolio', title: ['Public code or design portfolio', 'सार्वजनिक कोड या डिज़ाइन पोर्टफोलियो'], detail: ['Put finished work where an employer can open it. A private folder does less.', 'तैयार काम वहाँ रखें जहाँ नियोक्ता खोल सके। बंद फ़ोल्डर कम काम आता है।'], effort: 'medium', cost: 'free' },
  ],
  engineering: [],
  trade: [
    { stage: 'during_10', type: 'skill', title: ['Vocational subject if the school offers it', 'व्यावसायिक विषय, अगर स्कूल दे'], detail: ['Take the school vocational subject closest to the trade. Skip it if the school does not run a real workshop.', 'ट्रेड के सबसे क़रीबी स्कूल विषय को लें। अगर स्कूल में असली वर्कशॉप नहीं, तो न लें।'], effort: 'light', cost: 'free', url: 'https://cbseacademic.nic.in' },
    { stage: 'during_10', type: 'project', title: ['Visit a workshop with a parent', 'माता-पिता के साथ वर्कशॉप देखें'], detail: ['Watch the tools and the safety rules. Do not work a machine without the owner and a parent present.', 'औज़ार और सुरक्षा नियम देखें। मालिक और माता-पिता के बिना मशीन न चलाएँ।'], effort: 'light', cost: 'free' },
    { stage: 'during_12', type: 'certification', title: ['Skill India Digital short course', 'स्किल इंडिया डिजिटल का छोटा कोर्स'], detail: ['Free short courses on the public portal. The certificate rules are on that page.', 'सार्वजनिक पोर्टल पर मुफ़्त छोटे कोर्स। प्रमाणपत्र के नियम उसी पन्ने पर हैं।'], effort: 'light', cost: 'free', url: 'https://www.skillindiadigital.gov.in' },
    { stage: 'during_bachelor', type: 'apprenticeship', title: ['Apprenticeship on the national portal', 'राष्ट्रीय पोर्टल पर अप्रेंटिसशिप'], detail: ['NAPS and the apprenticeship portal lead toward a National Apprenticeship Certificate where the scheme allows. A stipend follows the scheme. This card does not quote it.', 'नैप्स और अप्रेंटिसशिप पोर्टल, जहाँ योजना अनुमति दे, राष्ट्रीय अप्रेंटिसशिप प्रमाणपत्र की ओर ले जाते हैं। वृत्तिका योजना के अनुसार होती है। यह कार्ड उसकी रकम नहीं लिखता।'], effort: 'medium', cost: 'free', url: 'https://www.apprenticeshipindia.gov.in' },
    { stage: 'during_bachelor', type: 'skill', title: ['Weekly practice on the trade tools', 'ट्रेड के औज़ारों का साप्ताहिक अभ्यास'], detail: ['DGT progression for many trades runs technician, senior technician, supervisor, and only sometimes manager. Those are typical stages, not a promise.', 'कई ट्रेडों में डीजीटी का क्रम तकनीशियन, सीनियर तकनीशियन, सुपरवाइज़र और कभी-कभी मैनेजर है। ये आम पड़ाव हैं, वादा नहीं।'], effort: 'medium', cost: 'free', url: 'https://dgt.gov.in' },
  ],
  gov: [
    common10,
    { stage: 'during_12', type: 'skill', title: ['Read one official notice end to end', 'एक आधिकारिक सूचना शुरू से अंत तक पढ़ें'], detail: ['See how age, posts and documents are written. Do not study from a remembered number.', 'देखें कि उम्र, पद और दस्तावेज़ कैसे लिखे होते हैं। याद किए हुए अंक पर भरोसा न करें।'], effort: 'light', cost: 'free', url: 'https://upsc.gov.in' },
    { stage: 'during_12', type: 'skill', title: ['A daily current-affairs habit', 'रोज़ाना सामयिक घटनाओं की आदत'], detail: ['A newspaper or a public bulletin is enough. A paid course is optional.', 'अख़बार या सार्वजनिक बुलेटिन काफ़ी है। भुगतान वाला कोर्स ऐच्छिक है।'], effort: 'light', cost: 'free' },
    { stage: 'during_bachelor', type: 'skill', title: ['Official past papers', 'आधिकारिक पुराने प्रश्नपत्र'], detail: ['Use papers the exam body itself publishes. Ignore undated PDFs with no publisher.', 'वही प्रश्नपत्र इस्तेमाल करें जो परीक्षा संस्था खुद छापे। बिना प्रकाशक और बिना तारीख की पीडीएफ छोड़ दें।'], effort: 'medium', cost: 'free' },
    { stage: 'during_bachelor', type: 'skill', title: ['NCERT base for graduate exams', 'स्नातक परीक्षाओं के लिए एनसीईआरटी आधार'], detail: ['Polity, geography, history and economy from NCERT are the usual base for civil services and many graduate tests. The notice can add more.', 'एनसीईआरटी की राजनीति, भूगोल, इतिहास और अर्थव्यवस्था सिविल सेवा और कई स्नातक परीक्षाओं का आम आधार हैं। सूचना और जोड़ सकती है।'], effort: 'heavy', cost: 'free' },
  ],
  health: [
    { stage: 'during_10', type: 'skill', title: ['Biology and chemistry, steady', 'जीव विज्ञान और रसायन, नियमित'], detail: ['Medicine paths lean on these two. Mathematics still helps for pharmacy and some engineering crossovers.', 'मेडिसिन के रास्ते इन दोनों पर टिके हैं। फार्मेसी और कुछ इंजीनियरिंग रास्तों में गणित भी काम आता है।'], effort: 'medium', cost: 'free' },
    { stage: 'during_12', type: 'skill', title: ['Read the current entrance bulletin', 'ताज़ा प्रवेश बुलेटिन पढ़ें'], detail: ['NEET-UG is the national test for MBBS and BDS seats under the current counselling. Other courses differ. Read the NTA bulletin for this year.', 'मौजूदा काउंसलिंग में एमबीबीएस और बीडीएस की सीटों के लिए नीट-यूजी राष्ट्रीय परीक्षा है। दूसरे कोर्स अलग हो सकते हैं। इस साल का एनटीए बुलेटिन पढ़ें।'], effort: 'medium', cost: 'free', url: 'https://nta.ac.in' },
    { stage: 'during_bachelor', type: 'internship', title: ['Only the clinical work your college allows', 'वही क्लिनिकल काम जो कॉलेज अनुमति दे'], detail: ['Hospital time follows the council and the college. Do not treat patients on your own.', 'अस्पताल का समय काउंसिल और कॉलेज के अनुसार होता है। अकेले मरीज़ का इलाज न करें।'], effort: 'heavy', cost: 'free', url: 'https://www.nmc.org.in' },
  ],
  law: [
    { stage: 'during_10', type: 'skill', title: ['Reading and clear writing', 'पढ़ना और साफ़ लिखना'], detail: ['Law leans on reading long text and writing a clear answer, in English or Hindi.', 'कानून लंबे पाठ पढ़ने और साफ़ उत्तर लिखने पर टिका है, अंग्रेज़ी या हिन्दी में।'], effort: 'light', cost: 'free' },
    { stage: 'during_12', type: 'skill', title: ['Read the CLAT information if you want an NLU', 'एनएलयू चाहते हैं तो क्लैट की जानकारी पढ़ें'], detail: ['CLAT is the test for most national law universities. Other universities publish their own tests. NLU Delhi has used its own test.', 'क्लैट अधिकतर राष्ट्रीय विधि विश्वविद्यालयों की परीक्षा है। दूसरे विश्वविद्यालय अपनी परीक्षा छापते हैं। एनएलयू दिल्ली अपनी परीक्षा रखता आया है।'], effort: 'medium', cost: 'free', url: 'https://consortiumofnlus.ac.in' },
    { stage: 'during_bachelor', type: 'internship', title: ['Moot, legal aid, or a lawyer’s chamber', 'मूट, लीगल एड, या वकील का चैंबर'], detail: ['Use what your college runs. A chamber placement needs the lawyer’s consent and a parent’s knowledge.', 'जो आपका कॉलेज चलाए, उसका उपयोग करें। चैंबर के लिए वकील की सहमति और माता-पिता को पता होना चाहिए।'], effort: 'medium', cost: 'free', url: 'https://www.barcouncilofindia.org' },
  ],
  teach: [
    { stage: 'during_10', type: 'skill', title: ['Explain one chapter to a younger child', 'एक अध्याय छोटे बच्चे को समझाएँ'], detail: ['Teaching starts with a clear explanation. A younger sibling or a neighbour’s child, with the parent present, is enough.', 'पढ़ाना साफ़ समझाने से शुरू होता है। माता-पिता के सामने छोटा भाई-बहन या पड़ोस का बच्चा काफ़ी है।'], effort: 'light', cost: 'free' },
    { stage: 'during_12', type: 'skill', title: ['Watch how a class is planned', 'देखें कि कक्षा की योजना कैसे बनती है'], detail: ['Ask a teacher if you may see a lesson plan. Do not record children.', 'किसी शिक्षक से पाठ योजना देखने की अनुमति माँगें। बच्चों की रिकॉर्डिंग न करें।'], effort: 'light', cost: 'free' },
    { stage: 'during_bachelor', type: 'certification', title: ['Read the CTET notice', 'सीटेट की सूचना पढ़ें'], detail: ['Central schools use CTET. State schools often use a state TET. The paper and the qualifying rule are in the current notice.', 'केंद्रीय स्कूल सीटेट मानते हैं। राज्य के स्कूल अक्सर राज्य टीईटी मानते हैं। पत्र और योग्यता ताज़ा सूचना में हैं।'], effort: 'medium', cost: 'paid', url: 'https://ctet.nic.in' },
  ],
  design: [
    { stage: 'during_10', type: 'portfolio', title: ['Draw from observation every week', 'हर हफ़्ते देखकर चित्र बनाएँ'], detail: ['Eight to twelve pages by Class 12 is a realistic folder. Copying a logo is not a portfolio.', 'कक्षा 12 तक आठ से बारह पन्ने वास्तविक फ़ोल्डर है। लोगो की नकल पोर्टफोलियो नहीं।'], effort: 'medium', cost: 'free' },
    { stage: 'during_12', type: 'skill', title: ['Read NID, NIFT or UCEED only if you will apply', 'एनआईडी, निफ्ट या यूसीड तभी पढ़ें, जब आवेदन करना हो'], detail: ['Each college publishes its own eligibility and dates. A portfolio still matters where the college asks for one.', 'हर कॉलेज अपनी योग्यता और तारीख छापता है। जहाँ पोर्टफोलियो माँगा जाए, वह मायने रखता है।'], effort: 'medium', cost: 'free', url: 'https://www.nift.ac.in' },
    { stage: 'during_bachelor', type: 'internship', title: ['A studio or a real client piece', 'स्टूडियो या असली ग्राहक का काम'], detail: ['One piece used by a real person is stronger than ten unused posters.', 'एक काम जिसे कोई सच में इस्तेमाल करे, दस बिना इस्तेमाल के पोस्टर से बेहतर है।'], effort: 'heavy', cost: 'mixed' },
  ],
  commerce: [
    common10,
    { stage: 'during_12', type: 'skill', title: ['Open the institute page before you register', 'पंजीकरण से पहले संस्थान का पन्ना खोलें'], detail: ['ICAI, ICMAI and ICSI each publish the current scheme, fees and dates. A coaching class is optional.', 'आईसीएआई, आईसीएमएआई और आईसीएसआई अपनी ताज़ा योजना, शुल्क और तारीख छापते हैं। कोचिंग ऐच्छिक है।'], effort: 'light', cost: 'free', url: 'https://www.icai.org' },
    { stage: 'during_bachelor', type: 'internship', title: ['Articleship or office practice, as the institute requires', 'आर्टिकलशिप या कार्यालय अभ्यास, जैसा संस्थान माँगे'], detail: ['The institute’s current scheme decides when articleship starts. Do not follow an old blog for the months.', 'आर्टिकलशिप कब शुरू होती है, यह संस्थान की ताज़ा योजना तय करती है। महीनों के लिए पुराने ब्लॉग पर न चलें।'], effort: 'heavy', cost: 'mixed', url: 'https://www.icai.org' },
    { stage: 'during_bachelor', type: 'certification', title: ['SWAYAM course in accounts or economics', 'लेखांकन या अर्थशास्त्र का स्वयं कोर्स'], detail: ['Free to learn. Useful beside the institute’s own study material.', 'पढ़ाई मुफ़्त। संस्थान की अपनी सामग्री के साथ उपयोगी।'], effort: 'medium', cost: 'free', url: 'https://swayam.gov.in' },
  ],
  farm: [
    { stage: 'during_10', type: 'project', title: ['A school garden or a KVK visit', 'स्कूल का बगीचा या केवीके की यात्रा'], detail: ['A Krishi Vigyan Kendra is an ICAR public centre. Go with a parent. This card does not list subsidies.', 'कृषि विज्ञान केन्द्र आईसीएआर का सार्वजनिक केन्द्र है। माता-पिता के साथ जाएँ। यह कार्ड सब्सिडी नहीं गिनाता।'], effort: 'light', cost: 'free', url: 'https://www.icar.org.in' },
    { stage: 'during_12', type: 'skill', title: ['Biology, and mathematics if you may want engineering', 'जीव विज्ञान, और इंजीनियरिंग चाहते हैं तो गणित'], detail: ['Agriculture degrees differ on whether they want PCB or PCM. Read the university brochure.', 'कृषि डिग्री में पीसीबी या पीसीएम, विश्वविद्यालय के अनुसार बदलता है। विवरण पढ़ें।'], effort: 'medium', cost: 'free' },
    { stage: 'during_bachelor', type: 'internship', title: ['Field practicals and the ICAR or state test notice', 'खेत का अभ्यास और आईसीएआर या राज्य परीक्षा की सूचना'], detail: ['ICAR AIEEA is one national route into agricultural universities. States run their own tests too.', 'आईसीएआर एआईईईए कृषि विश्वविद्यालयों का एक राष्ट्रीय रास्ता है। राज्य अपनी परीक्षा भी रखते हैं।'], effort: 'medium', cost: 'free', url: 'https://www.icar.org.in' },
  ],
};

// Engineering reuses the IT actions with the same public programmes. Filled after PACKS exists.
PACKS.engineering = PACKS.it;

const NO_ANGLE = /[<>]/;

export function assertClean(text: string, where: string): void {
  if (!text.trim()) throw new Error(`empty text at ${where}`);
  if (NO_ANGLE.test(text)) throw new Error(`angle bracket at ${where}`);
}

export function seedRows(bundle: SeedBundle): { desired: DesiredRow[]; careers: number } {
  const desired: DesiredRow[] = [];
  const slugs = new Set<string>();
  for (const f of bundle.fields) {
    assertClean(f.en, f.id);
    assertClean(f.hi, f.id);
    const body = { id: f.id, en: f.en, hi: f.hi, sort: f.sort };
    desired.push(row('career_fields', f.id, body, DUE_YEAR, { field_id: f.id, name_en: f.en, name_hi: f.hi, sort: f.sort, official_url: null }));
  }
  for (const c of bundle.careers) {
    if (slugs.has(c.slug)) throw new Error(`duplicate career ${c.slug}`);
    slugs.add(c.slug);
    for (const pair of [c.title, c.summary, c.qual, c.study, c.first, ...(c.horizon ? [c.horizon] : []), ...(c.compete ? [c.compete] : [])]) {
      assertClean(pair[0], c.slug);
      assertClean(pair[1], c.slug);
    }
    const expanded = expandCareer(c);
    assertClean(expanded.compete[0], c.slug);
    assertClean(expanded.compete[1], c.slug);
    const body = {
      slug: c.slug, field: c.field, level: c.level, title: c.title, summary: c.summary, streams: c.streams, min: c.min,
      isco: c.isco ?? '', onet: c.onet ?? '', nco: c.nco ?? '', gov: c.gov ?? '', url: c.url ?? '', horizon: c.horizon ?? ['', ''], compete: expanded.compete,
    };
    desired.push(row('careers', c.slug, body, DUE_YEAR, {
      slug: c.slug, field_id: c.field, title_en: c.title[0], title_hi: c.title[1], summary_en: c.summary[0], summary_hi: c.summary[1],
      level: c.level, streams: c.streams, min_level: c.min, isco08_code: c.isco ?? null, onet_soc_code: c.onet ?? null, nco2015_code: c.nco ?? null,
      gov_group: c.gov ?? null, official_url: c.url ?? null, horizon_en: c.horizon?.[0] ?? null, horizon_hi: c.horizon?.[1] ?? null,
      compete_en: expanded.compete[0], compete_hi: expanded.compete[1],
    }));
    for (const s of expanded.steps) {
      assertClean(s.en, s.key);
      assertClean(s.hi, s.key);
      desired.push(row('career_steps', s.key, s, s.due, {
        step_key: s.key, career_slug: c.slug, lane: s.lane, sort: s.sort, requirement_en: s.en, requirement_hi: s.hi,
        exam_name_en: s.examEn ?? null, exam_name_hi: s.examHi ?? null, future_series_key: s.series ?? null, official_url: s.url ?? null,
      }));
    }
    for (const a of expanded.actions) {
      assertClean(a.title[0], a.key);
      assertClean(a.title[1], a.key);
      assertClean(a.detail[0], a.key);
      assertClean(a.detail[1], a.key);
      desired.push(row('career_parallel_actions', a.key, a, DUE_YEAR, {
        action_key: a.key, career_slug: c.slug, stage: a.stage, type: a.type, title_en: a.title[0], title_hi: a.title[1],
        detail_en: a.detail[0], detail_hi: a.detail[1], effort: a.effort, cost: a.cost, official_url: a.url ?? null,
      }));
    }
  }
  for (const x of bundle.crosses) {
    assertClean(x.via[0], x.key);
    assertClean(x.conditions[0], x.key);
    const due = /upsc|ssc|clat|jee/i.test(x.key) ? DUE_EXAM : DUE_YEAR;
    desired.push(row('career_cross_pathways', x.key, x, due, {
      cross_key: x.key, via_en: x.via[0], via_hi: x.via[1], conditions_en: x.conditions[0], conditions_hi: x.conditions[1],
      official_url: x.url ?? null, streams: x.streams, to_slugs: x.toSlugs, any_graduate: Boolean(x.anyGraduate),
    }));
  }
  for (const r of bundle.laterals) {
    if (!slugs.has(r.toSlug)) throw new Error(`lateral ${r.key} points at unknown ${r.toSlug}`);
    assertClean(r.detail[0], r.key);
    assertClean(r.example[0], r.key);
    desired.push(row('career_lateral_routes', r.key, r, DUE_YEAR, {
      route_key: r.key, from_kind: r.fromKind, detail_en: r.detail[0], detail_hi: r.detail[1], example_en: r.example[0], example_hi: r.example[1],
      to_slug: r.toSlug, min_experience_years: r.minYears ?? null, degree_required: r.degreeRequired ?? null, official_url: r.url ?? null,
    }));
  }
  return { desired, careers: bundle.careers.length };
}

function row(table: string, key: string, body: unknown, reviewDue: string, write: Record<string, unknown>): DesiredRow {
  return { table, key, hash: contentHash({ batch: SEED_BATCH, body }), reviewDue, write };
}

export const BASIS = 'general_knowledge';
export const ANCHOR_DAY = ANCHOR;
