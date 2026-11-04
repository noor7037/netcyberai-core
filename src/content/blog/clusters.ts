// The blog's topic clusters (C471). Each post belongs to one cluster, and each cluster has a pillar: the product page
// the posts explain. A post links to its pillar and to the other posts of its cluster, so every post is a click
// from its neighbours (a search engine finds a page through the links that point at it) and the cluster reads as
// one subject covered in depth, not scattered posts. test/content/blog-clusters.test.ts holds every post to one.

export interface BlogCluster {
  id: string;
  title: string;
  // The product page the cluster explains.
  pillar: string;
  slugs: readonly string[];
}

export const blogClusters: readonly BlogCluster[] = [
  {
    id: 'fees',
    title: 'Fees and school money',
    pillar: '/products/fees-billing',
    slugs: [
      'automate-school-fee-reminders-whatsapp-upi-india',
      'fee-recovery-sequence-d3-to-d7-playbook',
      'school-fee-instalment-plan-and-collection-forecast',
      'haryana-form-6-fee-hike-compliance-guide',
      'school-cost-per-student-and-break-even-fee',
    ],
  },
  {
    id: 'parents',
    title: 'Parents and WhatsApp',
    pillar: '/products/parent-engagement',
    slugs: [
      'why-parents-dont-check-school-apps',
      'how-to-measure-what-parents-actually-open',
      'weekly-confidence-brief-dinner-table-questions',
      'school-notices-paper-diary-to-whatsapp',
      'school-attendance-alerts-without-spamming-parents',
    ],
  },
  {
    id: 'records',
    title: 'Records, certificates and student data',
    pillar: '/products/compliance-security',
    slugs: [
      'digital-tc-character-certificate-workflow',
      'school-certificate-formats-guide',
      'onboarding-500-students-without-dpdp-problem',
      'school-erp-data-ownership-pre-contract-checklist',
      'udise-plus-data-export-made-simple',
    ],
  },
  {
    id: 'teaching',
    title: 'Teaching, exams and recognition',
    pillar: '/products/academics',
    slugs: [
      'exam-result-analysis-for-teachers',
      'attendance-recovery-plan-for-exam-eligibility',
      'personal-best-vs-top-3-recognition',
      'teacher-impact-card-measuring-teaching-without-leaderboards',
    ],
  },
  {
    id: 'operations',
    title: 'Running the school',
    pillar: '/products/school-management',
    slugs: [
      'admission-season-capacity-and-revenue',
      'school-capacity-and-section-planning',
      'timetable-clashes-and-substitution',
      'fair-teacher-workload-and-substitution',
      'school-payroll-budget-planning',
      'coaching-centre-vs-school-erp-same-engine-different-data-model',
    ],
  },
];

export function clusterOf(slug: string): BlogCluster | undefined {
  return blogClusters.find((c) => c.slugs.includes(slug));
}
