/**
 * CBSE 2026-27 Mathematics & Science Catalog (Classes 6 to 10)
 * Dual-language names (English + Hindi) and verified NCERT chapter structures.
 */

import type { CatalogSubject, CatalogTopic } from '@/lib/contracts/family-types';

export const CATALOG_SUBJECTS: CatalogSubject[] = [
  {
    id: 'science',
    nameEn: 'Science',
    nameHi: 'विज्ञान',
    colorHue: 'emerald',
  },
  {
    id: 'maths',
    nameEn: 'Mathematics',
    nameHi: 'गणित',
    colorHue: 'sapphire',
  },
];

export const CATALOG_TOPICS: CatalogTopic[] = [
  // Class 9 Science
  {
    id: 'cbse-9-sci-motion-accel',
    subjectId: 'science',
    grade: 9,
    board: 'CBSE',
    chapterNumber: 7,
    chapterTitleEn: 'Motion',
    chapterTitleHi: 'गति',
    topicTitleEn: 'Acceleration and Equations of Motion',
    topicTitleHi: 'त्वरण एवं गति के समीकरण',
    ncertSlug: 'ncert-cl9-sci-ch7',
  },
  {
    id: 'cbse-9-sci-force-laws',
    subjectId: 'science',
    grade: 9,
    board: 'CBSE',
    chapterNumber: 8,
    chapterTitleEn: 'Force and Laws of Motion',
    chapterTitleHi: 'बल तथा गति के नियम',
    topicTitleEn: "Newton's Second Law of Motion",
    topicTitleHi: 'न्यूटन का द्वितीय गति नियम',
    ncertSlug: 'ncert-cl9-sci-ch8',
  },
  {
    id: 'cbse-9-sci-cell-unit',
    subjectId: 'science',
    grade: 9,
    board: 'CBSE',
    chapterNumber: 5,
    chapterTitleEn: 'The Fundamental Unit of Life',
    chapterTitleHi: 'जीवन की मौलिक इकाई',
    topicTitleEn: 'Cell Structure and Organelles',
    topicTitleHi: 'कोशिका संरचना एवं कोशिकांग',
    ncertSlug: 'ncert-cl9-sci-ch5',
  },

  // Class 9 Maths
  {
    id: 'cbse-9-math-number-systems',
    subjectId: 'maths',
    grade: 9,
    board: 'CBSE',
    chapterNumber: 1,
    chapterTitleEn: 'Number Systems',
    chapterTitleHi: 'संख्या पद्धति',
    topicTitleEn: 'Irrational Numbers and Real Line',
    topicTitleHi: 'अपरिमेय संख्याएं एवं वास्तविक रेखा',
    ncertSlug: 'ncert-cl9-math-ch1',
  },
  {
    id: 'cbse-9-math-polynomials',
    subjectId: 'maths',
    grade: 9,
    board: 'CBSE',
    chapterNumber: 2,
    chapterTitleEn: 'Polynomials',
    chapterTitleHi: 'बहुपद',
    topicTitleEn: 'Factor Theorem and Algebraic Identities',
    topicTitleHi: 'गुणनखंड प्रमेय एवं सर्वसमिकाएं',
    ncertSlug: 'ncert-cl9-math-ch2',
  },

  // Class 10 Science
  {
    id: 'cbse-10-sci-chemical-reactions',
    subjectId: 'science',
    grade: 10,
    board: 'CBSE',
    chapterNumber: 1,
    chapterTitleEn: 'Chemical Reactions and Equations',
    chapterTitleHi: 'रासायनिक अभिक्रियाएँ एवं समीकरण',
    topicTitleEn: 'Balancing Chemical Equations',
    topicTitleHi: 'रासायनिक समीकरणों को संतुलित करना',
    ncertSlug: 'ncert-cl10-sci-ch1',
  },
  {
    id: 'cbse-10-sci-electricity',
    subjectId: 'science',
    grade: 10,
    board: 'CBSE',
    chapterNumber: 11,
    chapterTitleEn: 'Electricity',
    chapterTitleHi: 'विद्युत',
    topicTitleEn: "Ohm's Law and Resistance",
    topicTitleHi: 'ओम का नियम एवं प्रतिरोध',
    ncertSlug: 'ncert-cl10-sci-ch11',
  },

  // Class 10 Maths
  {
    id: 'cbse-10-math-real-numbers',
    subjectId: 'maths',
    grade: 10,
    board: 'CBSE',
    chapterNumber: 1,
    chapterTitleEn: 'Real Numbers',
    chapterTitleHi: 'वास्तविक संख्याएँ',
    topicTitleEn: 'Fundamental Theorem of Arithmetic',
    topicTitleHi: 'अंकगणित की आधारभूत प्रमेय',
    ncertSlug: 'ncert-cl10-math-ch1',
  },
  {
    id: 'cbse-10-math-quadratic-equations',
    subjectId: 'maths',
    grade: 10,
    board: 'CBSE',
    chapterNumber: 4,
    chapterTitleEn: 'Quadratic Equations',
    chapterTitleHi: 'द्विघात समीकरण',
    topicTitleEn: 'Quadratic Formula and Nature of Roots',
    topicTitleHi: 'द्विघाती सूत्र एवं मूलों की प्रकृति',
    ncertSlug: 'ncert-cl10-math-ch4',
  },

  // Class 6 Science & Maths
  {
    id: 'cbse-6-sci-plants',
    subjectId: 'science',
    grade: 6,
    board: 'CBSE',
    chapterNumber: 4,
    chapterTitleEn: 'Getting to Know Plants',
    chapterTitleHi: 'पौधों को जानिए',
    topicTitleEn: 'Parts of Plants and Photosynthesis',
    topicTitleHi: 'पौधों के भाग एवं प्रकाश-संश्लेषण',
    ncertSlug: 'ncert-cl6-sci-ch4',
  },
  {
    id: 'cbse-6-math-numbers',
    subjectId: 'maths',
    grade: 6,
    board: 'CBSE',
    chapterNumber: 1,
    chapterTitleEn: 'Knowing Our Numbers',
    chapterTitleHi: 'अपनी संख्याओं की जानकारी',
    topicTitleEn: 'Place Value and Large Numbers',
    topicTitleHi: 'स्थानीय मान एवं बड़ी संख्याएँ',
    ncertSlug: 'ncert-cl6-math-ch1',
  },
];

export function getTopicsForGrade(grade: number, subjectId?: string): CatalogTopic[] {
  return CATALOG_TOPICS.filter((t) => t.grade === grade && (!subjectId || t.subjectId === subjectId));
}

export function getTopicById(topicId: string): CatalogTopic | undefined {
  return CATALOG_TOPICS.find((t) => t.id === topicId);
}
