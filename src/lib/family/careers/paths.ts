import type { Bi, CareerSpec, Pack } from './seed-build';
import type { StreamSlug } from './types';

export const Q = {
  pcm: [
    'After Class 10 the usual path is Science with Physics, Chemistry and Mathematics. A diploma in a matching branch is the vocational path. A college can add its own rule.',
    'कक्षा 10 के बाद आम रास्ता विज्ञान है, विषय भौतिकी, रसायन और गणित। मिलती-जुलती शाखा का डिप्लोमा व्यावसायिक रास्ता है। कॉलेज अपना नियम जोड़ सकता है।',
  ],
  pcb: [
    'After Class 10 the usual path is Science with Physics, Chemistry and Biology. Read the brochure before you drop Mathematics, because some later seats still ask for it.',
    'कक्षा 10 के बाद आम रास्ता विज्ञान है, विषय भौतिकी, रसायन और जीव विज्ञान। गणित छोड़ने से पहले विवरण पढ़ें, क्योंकि कुछ आगे की सीटें गणित माँगती हैं।',
  ],
  commerce: [
    'After Class 10 the usual path is Commerce. Keep Mathematics if you may want a quantitative master degree or some data roles later.',
    'कक्षा 10 के बाद आम रास्ता वाणिज्य है। अगर आगे मात्रा वाला स्नातकोत्तर या कुछ डेटा भूमिकाएँ चाहिए, तो गणित रखें।',
  ],
  any: [
    'After Class 10, Science, Commerce or Arts can all lead here. The exam notice or the employer notice decides the subjects, not this card.',
    'कक्षा 10 के बाद विज्ञान, वाणिज्य या कला, तीनों यहाँ तक जा सकते हैं। विषय परीक्षा या नियोक्ता की सूचना तय करती है, यह कार्ड नहीं।',
  ],
  iti10: [
    'After Class 10 the direct path is the ITI trade named on this card, or a diploma. Class 12 is not required for every ITI seat. Read the current CTS syllabus on the DGT site.',
    'कक्षा 10 के बाद सीधा रास्ता इस कार्ड का आईटीआई ट्रेड या डिप्लोमा है। हर आईटीआई सीट के लिए कक्षा 12 ज़रूरी नहीं। डीजीटी साइट पर ताज़ा सीटीएस पाठ्यक्रम पढ़ें।',
  ],
  iti8: [
    'A DGT extract for this trade records entry after Class 8. Some institutes ask for Class 10. Read the current syllabus before you apply.',
    'इस ट्रेड के डीजीटी अंश में प्रवेश कक्षा 8 के बाद लिखा है। कुछ संस्थान कक्षा 10 माँगते हैं। आवेदन से पहले ताज़ा पाठ्यक्रम पढ़ें।',
  ],
  gov10: [
    'The usual school mark for this post is a pass in Class 10. Age, posts and documents are only in the current notice.',
    'इस पद के लिए आम स्कूल निशान कक्षा 10 पास है। उम्र, पद और दस्तावेज़ केवल ताज़ा सूचना में हैं।',
  ],
  gov12: [
    'The usual school mark for this post is a pass in Class 12. The stream the notice wants is written in that notice.',
    'इस पद के लिए आम स्कूल निशान कक्षा 12 पास है। सूचना जिस धारा को माँगे, वह उसी सूचना में लिखी होती है।',
  ],
  grad: [
    'This exam asks for a bachelor degree from a recognised university. Age and the number of attempts depend on the category in the current notice. Do not study from a remembered number.',
    'यह परीक्षा मान्यता प्राप्त विश्वविद्यालय की स्नातक डिग्री माँगती है। उम्र और प्रयासों की संख्या वर्ग के अनुसार ताज़ा सूचना में है। याद किए हुए अंक से न पढ़ें।',
  ],
} as const satisfies Record<string, Bi>;

export const EX = {
  jee: ['JEE Main', 'जेईई मेन', 'nta.jee_main', 'JEE Main is the national test most engineering seats use. JoSAA or the state counselling allots seats. Some universities hold their own test. Read the current NTA notice.', 'अधिकतर इंजीनियरिंग सीटों के लिए जेईई मेन राष्ट्रीय परीक्षा है। जोसा या राज्य की काउंसलिंग सीट देती है। कुछ विश्वविद्यालय अपनी परीक्षा रखते हैं। एनटीए की ताज़ा सूचना पढ़ें।'] as const,
  neet: ['NEET-UG', 'नीट-यूजी', 'nta.neet', 'NEET-UG is the national test used for MBBS and BDS seats under the current counselling. Other health courses do not all use it. Read this year’s NTA bulletin.', 'मौजूदा काउंसलिंग में एमबीबीएस और बीडीएस की सीटों के लिए नीट-यूजी राष्ट्रीय परीक्षा है। हर स्वास्थ्य कोर्स इसे नहीं इस्तेमाल करता। इस साल का एनटीए बुलेटिन पढ़ें।'] as const,
  cuet: ['CUET', 'सीयूईटी', 'nta.cuet', 'CUET is the common test many central universities use. A college can still run its own process. Read the current NTA notice.', 'कई केंद्रीय विश्वविद्यालय सीयूईटी का उपयोग करते हैं। कोई कॉलेज अपनी प्रक्रिया भी रख सकता है। एनटीए की ताज़ा सूचना पढ़ें।'] as const,
  clat: ['CLAT', 'क्लैट', 'nlu.clat', 'CLAT is the test for most national law universities. Other universities publish their own test. NLU Delhi has used its own test.', 'क्लैट अधिकतर राष्ट्रीय विधि विश्वविद्यालयों की परीक्षा है। दूसरे विश्वविद्यालय अपनी परीक्षा छापते हैं। एनएलयू दिल्ली अपनी परीक्षा रखता आया है।'] as const,
  upsc: ['UPSC Civil Services', 'यूपीएससी सिविल सेवा', 'upsc.cse', 'One exam. IAS, IPS and the Indian Foreign Service are allotted afterwards by rank and preference. A degree is required. Age and attempts are in the current UPSC notice and differ by category.', 'एक परीक्षा। आईएएस, आईपीएस और भारतीय विदेश सेवा बाद में रैंक और पसंद से मिलती हैं। डिग्री ज़रूरी है। उम्र और प्रयास ताज़ा यूपीएससी सूचना में हैं और वर्ग के अनुसार बदलते हैं।'] as const,
  ese: ['UPSC Engineering Services', 'यूपीएससी इंजीनियरिंग सेवा', 'upsc.ese', 'The Engineering Services Examination is a UPSC exam for engineering graduates. The branches and the age rule are in the current notice.', 'इंजीनियरिंग सेवा परीक्षा इंजीनियरिंग स्नातकों के लिए यूपीएससी की परीक्षा है। शाखाएँ और उम्र का नियम ताज़ा सूचना में हैं।'] as const,
  nda: ['NDA', 'एनडीए', 'upsc.nda', 'UPSC conducts NDA after Class 12. Navy and Air Force wings have long asked for Physics and Mathematics. The age band is in the current notice. Confirm it there.', 'कक्षा 12 के बाद एनडीए यूपीएससी कराता है। नौसेना और वायु सेना की शाखाएँ लंबे समय से भौतिकी और गणित माँगती आई हैं। उम्र की सीमा ताज़ा सूचना में है। वहीं जाँचें।'] as const,
  cds: ['CDS', 'सीडीएस', 'upsc.cds', 'UPSC conducts CDS for graduates who want the officer academies. The academy and the degree it wants are in the current notice.', 'स्नातकों के लिए अधिकारी अकादमियों की सीडीएस परीक्षा यूपीएससी कराता है। कौन सी अकादमी कौन सी डिग्री माँगती है, वह ताज़ा सूचना में है।'] as const,
  ifos: ['UPSC Indian Forest Service', 'यूपीएससी भारतीय वन सेवा', 'upsc.ifos', 'The Indian Forest Service exam is separate from the Indian Foreign Service, which comes through the Civil Services Examination. Read the current UPSC notice.', 'भारतीय वन सेवा की परीक्षा अलग है। भारतीय विदेश सेवा सिविल सेवा परीक्षा से आती है। यूपीएससी की ताज़ा सूचना पढ़ें।'] as const,
  chsl: ['SSC CHSL', 'एसएससी सीएचएसएल', 'ssc.chsl', 'SSC CHSL recruits Class 12 posts such as junior secretariat assistant and data entry operator. The post list is in the current notice.', 'एसएससी सीएचएसएल कक्षा 12 वाले पद भरता है, जैसे कनिष्ठ सचिवालय सहायक और डेटा एंट्री ऑपरेटर। पदों की सूची ताज़ा सूचना में है।'] as const,
  cgl: ['SSC CGL', 'एसएससी सीजीएल', 'ssc.cgl', 'SSC CGL is a graduate exam. Posts span Group B and Group C. This card is only the group named in the title. Read the notice for the post list.', 'एसएससी सीजीएल स्नातक परीक्षा है। पद समूह ख और समूह ग दोनों में होते हैं। यह कार्ड केवल शीर्षक वाले समूह का है। पदों के लिए सूचना पढ़ें।'] as const,
  mts: ['SSC MTS', 'एसएससी एमटीएस', 'ssc.mts', 'SSC MTS recruits multi-tasking staff. A Class 10 pass is the usual mark. It is a Group C post in current central notices. Confirm the group in this year’s notice.', 'एसएससी एमटीएस बहु-कार्य कर्मचारियों की भर्ती करता है। आम निशान कक्षा 10 पास है। मौजूदा केंद्रीय सूचनाओं में यह समूह ग का पद है। इस साल की सूचना में समूह जाँचें।'] as const,
  ibpsPo: ['IBPS PO', 'आईबीपीएस पीओ', 'ibps.po', 'IBPS PO recruits probationary officers for participating public-sector banks. SBI runs its own exam. A degree is required. Read the current IBPS notice.', 'आईबीपीएस पीओ भाग लेने वाले सरकारी बैंकों में परिवीक्षाधीन अधिकारियों की भर्ती करता है। एसबीआई अपनी परीक्षा रखता है। डिग्री ज़रूरी है। आईबीपीएस की ताज़ा सूचना पढ़ें।'] as const,
  ibpsClerk: ['IBPS Clerk', 'आईबीपीएस क्लर्क', 'ibps.clerk', 'IBPS Clerk recruits clerical staff for participating banks. A degree is required. Read the current notice for age and language.', 'आईबीपीएस क्लर्क भाग लेने वाले बैंकों में लिपिक भर्ती करता है। डिग्री ज़रूरी है। उम्र और भाषा के लिए ताज़ा सूचना पढ़ें।'] as const,
  ca: ['CA Foundation', 'सीए फाउंडेशन', 'icai.ca', 'The chartered accountancy stages under ICAI are Foundation, Intermediate and Final, with articleship. Any Class 12 stream may register. Read the current ICAI scheme for fees and dates.', 'आईसीएआई में चार्टर्ड अकाउंटेंसी के पड़ाव फाउंडेशन, इंटरमीडिएट और फाइनल हैं, आर्टिकलशिप के साथ। कक्षा 12 की कोई भी धारा पंजीकरण कर सकती है। शुल्क और तारीख के लिए ताज़ा योजना पढ़ें।'] as const,
  cma: ['CMA Foundation', 'सीएमए फाउंडेशन', 'icmai.cma', 'ICMAI runs the cost accountancy course: Foundation, Intermediate and Final. Read the current scheme. Do not copy the CA timetable onto it.', 'आईसीएमएआई लागत लेखांकन का कोर्स चलाता है: फाउंडेशन, इंटरमीडिएट और फाइनल। ताज़ा योजना पढ़ें। सीए की समय-सारणी इस पर न चिपकाएँ।'] as const,
  cs: ['CS Executive route', 'सीएस कार्यकारी रास्ता', 'icsi.cs', 'ICSI runs the company secretary course. The current entry stage is on the ICSI site. Read that page before you pay a coaching class.', 'आईसीएसआई कंपनी सचिव कोर्स चलाता है। प्रवेश का ताज़ा पड़ाव आईसीएसआई साइट पर है। कोचिंग का शुल्क देने से पहले वह पन्ना पढ़ें।'] as const,
  ctet: ['CTET', 'सीटेट', 'ctet', 'CTET is the central teacher eligibility test. State schools often use a state TET instead. The paper and the qualifying rule are in the current notice.', 'सीटेट केंद्रीय शिक्षक पात्रता परीक्षा है। राज्य के स्कूल अक्सर राज्य टीईटी मानते हैं। पत्र और योग्यता ताज़ा सूचना में हैं।'] as const,
  icar: ['ICAR AIEEA', 'आईसीएआर एआईईईए', 'icar.aieea', 'ICAR AIEEA is one national route into agricultural universities. States and some universities hold their own test. Read which one your university uses.', 'आईसीएआर एआईईईए कृषि विश्वविद्यालयों का एक राष्ट्रीय रास्ता है। राज्य और कुछ विश्वविद्यालय अपनी परीक्षा रखते हैं। आपका विश्वविद्यालय कौन सी मानता है, वह पढ़ें।'] as const,
  nata: ['NATA', 'नाटा', 'nata', 'Architecture admission uses the test named by the Council of Architecture, commonly NATA, and some seats also use a JEE paper. Read the current Council notice.', 'आर्किटेक्चर में दाखिला काउंसिल ऑफ आर्किटेक्चर की कही परीक्षा से होता है, आम नाम नाटा है, और कुछ सीटें जेईई पत्र भी मानती हैं। काउंसिल की ताज़ा सूचना पढ़ें।'] as const,
} as const;

type Preset = { streams: StreamSlug[]; min: string; qual: Bi; exam?: CareerSpec['exam']; pack: Pack; url: string };

export const PATHS: Record<string, Preset> = {
  it: { streams: ['science-pcm', 'vocational'], min: 'class12_sci_pcm', qual: Q.pcm, exam: EX.jee, pack: 'it', url: 'https://nta.ac.in' },
  btech: { streams: ['science-pcm', 'vocational'], min: 'class12_sci_pcm', qual: Q.pcm, exam: EX.jee, pack: 'engineering', url: 'https://nta.ac.in' },
  iti10: { streams: ['vocational'], min: 'iti', qual: Q.iti10, pack: 'trade', url: 'https://dgt.gov.in' },
  iti8: { streams: ['vocational'], min: 'iti', qual: Q.iti8, pack: 'trade', url: 'https://dgt.gov.in' },
  pcb: { streams: ['science-pcb'], min: 'class12_sci_pcb', qual: Q.pcb, exam: EX.neet, pack: 'health', url: 'https://nta.ac.in' },
  commerce: { streams: ['commerce'], min: 'class12_commerce', qual: Q.commerce, exam: EX.cuet, pack: 'commerce', url: 'https://nta.ac.in' },
  gov10: { streams: ['vocational', 'arts', 'commerce', 'science-pcm', 'science-pcb'], min: 'class10', qual: Q.gov10, pack: 'gov', url: 'https://ssc.gov.in' },
  gov12: { streams: ['science-pcm', 'science-pcb', 'commerce', 'arts', 'vocational'], min: 'class12_arts', qual: Q.gov12, pack: 'gov', url: 'https://ssc.gov.in' },
  govgrad: { streams: ['science-pcm', 'science-pcb', 'commerce', 'arts', 'vocational'], min: 'ug', qual: Q.grad, pack: 'gov', url: 'https://upsc.gov.in' },
  design: { streams: ['arts', 'science-pcm', 'commerce', 'vocational'], min: 'class12_arts', qual: Q.any, pack: 'design', url: 'https://www.nift.ac.in' },
  law: { streams: ['arts', 'commerce', 'science-pcm', 'science-pcb'], min: 'class12_arts', qual: Q.any, exam: EX.clat, pack: 'law', url: 'https://consortiumofnlus.ac.in' },
  teach: { streams: ['arts', 'science-pcm', 'science-pcb', 'commerce'], min: 'class12_arts', qual: Q.any, exam: EX.ctet, pack: 'teach', url: 'https://ctet.nic.in' },
  farm: { streams: ['science-pcb', 'science-pcm', 'vocational'], min: 'class12_sci_pcb', qual: Q.pcb, exam: EX.icar, pack: 'farm', url: 'https://www.icar.org.in' },
  anyGrad: { streams: ['science-pcm', 'science-pcb', 'commerce', 'arts', 'vocational'], min: 'ug', qual: Q.grad, exam: EX.cuet, pack: 'commerce', url: 'https://www.ncs.gov.in' },
};

export function job(
  path: keyof typeof PATHS,
  over: Pick<CareerSpec, 'slug' | 'field' | 'level' | 'title' | 'summary' | 'study' | 'first' | 'roles'> & Partial<Omit<CareerSpec, 'exam'>> & { exam?: CareerSpec['exam'] | null },
): CareerSpec {
  const base = PATHS[path];
  const exam = over.exam === null ? undefined : (over.exam ?? base.exam);
  return {
    slug: over.slug,
    field: over.field,
    level: over.level,
    title: over.title,
    summary: over.summary,
    streams: over.streams ?? base.streams,
    min: over.min ?? base.min,
    qual: over.qual ?? base.qual,
    exam,
    study: over.study,
    first: over.first,
    roles: over.roles,
    pack: over.pack ?? base.pack,
    url: over.url ?? base.url,
    isco: over.isco,
    onet: over.onet,
    nco: over.nco,
    gov: over.gov,
    horizon: over.horizon,
    compete: over.compete,
  };
}

export function ladder(en: readonly [string, string, string, string], hi: readonly [string, string, string, string]): CareerSpec['roles'] {
  return [
    [en[0], hi[0]],
    [en[1], hi[1]],
    [en[2], hi[2]],
    [en[3], hi[3]],
  ];
}
