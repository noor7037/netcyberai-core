import type { BlogPost } from '../contract';
import { automateSchoolFeeRemindersWhatsappUpiIndia } from './automate-school-fee-reminders-whatsapp-upi-india';
import { digitalTcCharacterCertificateWorkflow } from './digital-tc-character-certificate-workflow';
import { haryanaForm6FeeHikeComplianceGuide } from './haryana-form-6-fee-hike-compliance-guide';
import { whyParentsDontCheckSchoolApps } from './why-parents-dont-check-school-apps';
import { personalBestVsTop3Recognition } from './personal-best-vs-top-3-recognition';
import { feeRecoverySequenceD3ToD7Playbook } from './fee-recovery-sequence-d3-to-d7-playbook';
import { onboarding500StudentsWithoutDpdpProblem } from './onboarding-500-students-without-dpdp-problem';
import { schoolErpDataOwnershipPreContractChecklist } from './school-erp-data-ownership-pre-contract-checklist';
import { teacherImpactCardMeasuringTeachingWithoutLeaderboards } from './teacher-impact-card-measuring-teaching-without-leaderboards';
import { schoolAttendanceAlertsWithoutSpammingParents } from './school-attendance-alerts-without-spamming-parents';
import { coachingCentreVsSchoolErpSameEngineDifferentDataModel } from './coaching-centre-vs-school-erp-same-engine-different-data-model';
import { udisePlusDataExportMadeSimple } from './udise-plus-data-export-made-simple';
import { weeklyConfidenceBriefDinnerTableQuestions } from './weekly-confidence-brief-dinner-table-questions';
import { howToMeasureWhatParentsActuallyOpen } from './how-to-measure-what-parents-actually-open';
import { schoolNoticesPaperDiaryToWhatsapp } from './school-notices-paper-diary-to-whatsapp';

export const blogPosts: BlogPost[] = [
  haryanaForm6FeeHikeComplianceGuide,
  automateSchoolFeeRemindersWhatsappUpiIndia,
  digitalTcCharacterCertificateWorkflow,
  whyParentsDontCheckSchoolApps,
  personalBestVsTop3Recognition,
  feeRecoverySequenceD3ToD7Playbook,
  onboarding500StudentsWithoutDpdpProblem,
  schoolErpDataOwnershipPreContractChecklist,
  teacherImpactCardMeasuringTeachingWithoutLeaderboards,
  schoolAttendanceAlertsWithoutSpammingParents,
  coachingCentreVsSchoolErpSameEngineDifferentDataModel,
  udisePlusDataExportMadeSimple,
  weeklyConfidenceBriefDinnerTableQuestions,
  howToMeasureWhatParentsActuallyOpen,
  schoolNoticesPaperDiaryToWhatsapp,
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug);
}
