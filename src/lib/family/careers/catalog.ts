import { CAREERS } from './careers';
import type { CrossSpec, FieldSpec, LateralSpec, SeedBundle } from './seed-build';
import { SEED_BATCH } from './seed-build';

const FIELDS: FieldSpec[] = [
  { id: 'information_technology', en: 'Information technology', hi: 'सूचना प्रौद्योगिकी', sort: 1 },
  { id: 'design', en: 'Design', hi: 'डिज़ाइन', sort: 2 },
  { id: 'robotics', en: 'Robotics', hi: 'रोबोटिक्स', sort: 3 },
  { id: 'engineering', en: 'Engineering', hi: 'इंजीनियरिंग', sort: 4 },
  { id: 'management', en: 'Management', hi: 'प्रबंधन', sort: 5 },
  { id: 'trades', en: 'Trades', hi: 'ट्रेड', sort: 6 },
  { id: 'automobile', en: 'Automobiles', hi: 'ऑटोमोबाइल', sort: 7 },
  { id: 'manufacturing', en: 'Manufacturing', hi: 'विनिर्माण', sort: 8 },
  { id: 'government', en: 'Government', hi: 'सरकारी नौकरी', sort: 9 },
  { id: 'banking', en: 'Banking', hi: 'बैंकिंग', sort: 10 },
  { id: 'medicine', en: 'Medicine and health', hi: 'चिकित्सा और स्वास्थ्य', sort: 11 },
  { id: 'law', en: 'Law', hi: 'कानून', sort: 12 },
  { id: 'teaching', en: 'Teaching', hi: 'अध्यापन', sort: 13 },
  { id: 'agriculture', en: 'Agriculture', hi: 'कृषि', sort: 14 },
];

const CROSSES: CrossSpec[] = [
  {
    key: 'arts-to-computing',
    via: ['Add mathematics, or pick a college that does not require it', 'गणित जोड़ें, या ऐसा कॉलेज चुनें जो उसे न माँगे'],
    conditions: ['Many B.Tech seats want Physics, Chemistry and Mathematics at Class 12. BCA and some B.Sc data programmes do not. NIOS can add a subject. Read that university’s brochure and the current NIOS notice.', 'कई बीटेक सीटें कक्षा 12 में भौतिकी, रसायन और गणित चाहती हैं। बीसीए और कुछ बीएससी डेटा कार्यक्रम नहीं चाहते। एनआईओएस एक विषय जोड़ सकता है। उस विश्वविद्यालय का विवरण और ताज़ा एनआईओएस सूचना पढ़ें।'],
    url: 'https://nios.ac.in',
    streams: ['arts', 'commerce'],
    toSlugs: ['junior-web-developer', 'web-developer', 'data-analyst', 'technical-writer'],
  },
  {
    key: 'pcb-add-maths',
    via: ['Add mathematics if a later engineering seat requires it', 'अगर आगे की इंजीनियरिंग सीट गणित माँगे, तो गणित जोड़ें'],
    conditions: ['PCB keeps medicine open and usually closes B.Tech seats that want mathematics. NIOS or the board’s additional-subject rule is the public way to add it. It is not automatic.', 'पीसीबी चिकित्सा खुली रखता है और आम तौर पर वे बीटेक सीटें बंद करता है जो गणित चाहती हैं। एनआईओएस या बोर्ड का अतिरिक्त-विषय नियम उसे जोड़ने का सार्वजनिक तरीका है। यह अपने आप नहीं होता।'],
    url: 'https://nios.ac.in',
    streams: ['science-pcb'],
    toSlugs: ['software-engineer', 'mechanical-engineer'],
  },
  {
    key: 'commerce-to-law',
    via: ['CLAT after Class 12, or a three-year LLB after graduation', 'कक्षा 12 के बाद क्लैट, या स्नातक के बाद तीन साल का एलएलबी'],
    conditions: ['Commerce can sit CLAT for a five-year law degree where the notice allows any stream. A three-year LLB needs a bachelor degree first. Other universities have their own tests.', 'वाणिज्य क्लैट दे सकता है, जहाँ सूचना किसी भी धारा को पाँच साल की कानून डिग्री दे। तीन साल के एलएलबी से पहले स्नातक चाहिए। दूसरे विश्वविद्यालयों की अपनी परीक्षा है।'],
    url: 'https://consortiumofnlus.ac.in',
    streams: ['commerce'],
    toSlugs: ['advocate'],
  },
  {
    key: 'science-to-law',
    via: ['CLAT or a graduate LLB', 'क्लैट या स्नातक एलएलबी'],
    conditions: ['Science students can sit CLAT. Medicine and engineering are not required before law. Read the current notice for subjects and age.', 'विज्ञान के विद्यार्थी क्लैट दे सकते हैं। कानून से पहले चिकित्सा या इंजीनियरिंग ज़रूरी नहीं। विषय और उम्र के लिए ताज़ा सूचना पढ़ें।'],
    url: 'https://consortiumofnlus.ac.in',
    streams: ['science-pcm', 'science-pcb'],
    toSlugs: ['advocate'],
  },
  {
    key: 'any-to-management',
    via: ['A bachelor degree, then work or a management test', 'स्नातक, फिर काम या प्रबंधन की परीक्षा'],
    conditions: ['A few integrated programmes test after Class 12, such as IPMAT at some IIMs. CAT is a postgraduate test after a degree. Names and dates are on those institutes’ own notices.', 'कुछ एकीकृत कार्यक्रम कक्षा 12 के बाद परीक्षा लेते हैं, जैसे कुछ आईआईएम का आईपीमैट। कैट डिग्री के बाद की स्नातकोत्तर परीक्षा है। नाम और तारीख उन संस्थानों की अपनी सूचना पर हैं।'],
    url: 'https://iimcat.ac.in',
    streams: ['science-pcm', 'science-pcb', 'commerce', 'arts'],
    toSlugs: ['management-trainee', 'product-manager', 'general-manager'],
  },
  {
    key: 'iti-to-diploma',
    via: ['Diploma lateral entry where the board notifies it', 'डिप्लोमा में लेटरल एंट्री, जहाँ बोर्ड सूचना दे'],
    conditions: ['Some DGT trade syllabi mention diploma lateral entry. It is not automatic. The state technical board’s notice decides the trade, the seat and the year.', 'कुछ डीजीटी ट्रेड पाठ्यक्रम डिप्लोमा लेटरल एंट्री लिखते हैं। यह अपने आप नहीं होता। राज्य तकनीकी बोर्ड की सूचना ट्रेड, सीट और साल तय करती है।'],
    url: 'https://dgt.gov.in',
    streams: ['vocational'],
    toSlugs: ['cnc-machinist', 'mechatronics-technician', 'robotics-technician', 'plumber'],
  },
  {
    key: 'diploma-to-btech',
    via: ['Lateral entry into the second year of B.Tech', 'बीटेक के दूसरे वर्ष में लेटरल एंट्री'],
    conditions: ['AICTE and universities notify lateral-entry seats. The branch and the diploma must match that notice. A diploma does not by itself become a degree.', 'एआईसीटीई और विश्वविद्यालय लेटरल-एंट्री सीटों की सूचना देते हैं। शाखा और डिप्लोमा उस सूचना से मेल खाने चाहिए। डिप्लोमा अपने आप डिग्री नहीं बनता।'],
    url: 'https://www.aicte-india.org',
    streams: ['vocational'],
    toSlugs: ['software-engineer', 'mechanical-engineer', 'civil-engineer', 'automobile-engineer'],
  },
  {
    key: 'any-graduate-upsc',
    via: ['UPSC Civil Services Examination', 'यूपीएससी सिविल सेवा परीक्षा'],
    conditions: ['Any recognised bachelor degree can be eligible. Age and the number of attempts depend on the category in the current notice. IAS, IPS and the Foreign Service are allotted after the exam, not chosen as separate papers.', 'कोई भी मान्यता प्राप्त स्नातक योग्य हो सकता है। उम्र और प्रयासों की संख्या वर्ग के अनुसार ताज़ा सूचना में है। आईएएस, आईपीएस और विदेश सेवा परीक्षा के बाद मिलती हैं, अलग पत्र के रूप में नहीं चुनी जातीं।'],
    url: 'https://upsc.gov.in',
    streams: ['science-pcm', 'science-pcb', 'commerce', 'arts', 'vocational'],
    toSlugs: ['ias', 'ips', 'ifs-foreign-service'],
    anyGraduate: true,
  },
  {
    key: 'any-graduate-ssc',
    via: ['SSC CGL', 'एसएससी सीजीएल'],
    conditions: ['Most SSC CGL posts ask for a bachelor degree. The notice lists which posts are Group B and which are Group C, and which degrees they want.', 'अधिकतर एसएससी सीजीएल पद स्नातक डिग्री माँगते हैं। सूचना बताती है कौन से पद समूह ख हैं, कौन से समूह ग, और कौन सी डिग्री चाहिए।'],
    url: 'https://ssc.gov.in',
    streams: ['science-pcm', 'science-pcb', 'commerce', 'arts', 'vocational'],
    toSlugs: ['ssc-cgl-group-b', 'ssc-cgl-group-c'],
    anyGraduate: true,
  },
];

const LATERALS: LateralSpec[] = [
  {
    key: 'portfolio-junior-web',
    fromKind: 'portfolio',
    detail: ['A public portfolio of working sites', 'चलती साइटों का सार्वजनिक पोर्टफोलियो'],
    example: ['Some teams hire a junior web developer on finished work when a degree is not in their notice. Many still ask for one. This is general guidance.', 'कुछ टीमें जूनियर वेब डेवलपर को तैयार काम पर रखती हैं, जब उनकी सूचना में डिग्री न हो। कई फिर भी डिग्री माँगती हैं। यह सामान्य मार्गदर्शन है।'],
    toSlug: 'junior-web-developer',
    minYears: 0,
    degreeRequired: false,
    url: 'https://www.ncs.gov.in',
  },
  {
    key: 'portfolio-graphic',
    fromKind: 'portfolio',
    detail: ['A public folder of original visual work', 'मौलिक दृश्य काम का सार्वजनिक फ़ोल्डर'],
    example: ['Studios often look at the folder before the college name. A copied logo is not a portfolio.', 'स्टूडियो अक्सर कॉलेज के नाम से पहले फ़ोल्डर देखते हैं। नक़ल किया लोगो पोर्टफोलियो नहीं है।'],
    toSlug: 'graphic-designer',
    minYears: 0,
    degreeRequired: false,
    url: 'https://www.nid.edu',
  },
  {
    key: 'experience-supervisor',
    fromKind: 'experience',
    detail: ['Years on the same shop floor', 'उसी शॉप फ़्लोर पर साल'],
    example: ['A production operator can become a supervisor when the factory promotes on skill and attendance. A degree is not always required. The factory’s own rule decides.', 'उत्पादन ऑपरेटर सुपरवाइज़र बन सकता है, जब फ़ैक्टरी हुनर और हाज़िरी पर पदोन्नति करे। डिग्री हमेशा ज़रूरी नहीं। नियम फ़ैक्टरी का अपना है।'],
    toSlug: 'production-supervisor',
    minYears: 5,
    degreeRequired: false,
    url: 'https://dgt.gov.in',
  },
];

export { SEED_BATCH };

export function buildBundle(): SeedBundle {
  return { batch: SEED_BATCH, fields: FIELDS, careers: CAREERS, crosses: CROSSES, laterals: LATERALS };
}
