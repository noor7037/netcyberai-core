import type { Teacher } from '@/lib/free-tools/teacher-register';

// Example for the Teacher Qualification Register's "Try an example"
// button. Fictional teachers; no real people. Valid-until dates are set
// relative to today, so the example always shows something ending soon
// and something already passed.

function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const t = (p: Partial<Teacher>): Teacher => ({
  name: '',
  stage: '',
  subjects: '',
  degree: '',
  pg: '',
  professional: '',
  tetType: '',
  tetPaper: '',
  tetDate: '',
  tetValidUntil: '',
  other: '',
  otherValidUntil: '',
  ...p,
});

export function teacherRegisterExample(): Teacher[] {
  return [
    t({ name: 'Anjali Mehta', stage: 'pre', subjects: 'All subjects', degree: 'B.A.', professional: 'Nursery teacher training' }),
    t({ name: 'Bharat Singh', stage: 'primary', subjects: 'Maths, EVS', degree: 'B.Sc.', professional: 'D.El.Ed', tetType: 'CTET', tetPaper: 'I', tetDate: '2019-08-16' }),
    t({ name: 'Carol D’Souza', stage: 'primary', subjects: 'English', degree: 'B.A.', professional: 'B.Ed', tetType: 'CTET', tetPaper: 'II', tetDate: '2020-02-21' }),
    t({ name: 'Deepak Rawat', stage: 'primary', subjects: 'Hindi', degree: 'B.A.', professional: 'D.El.Ed' }),
    t({ name: 'Farah Siddiqui', stage: 'upper', subjects: 'Science', degree: 'B.Sc.', professional: 'B.Ed', tetType: 'State TET', tetPaper: 'II', tetDate: '2018-11-05' }),
    t({ name: 'Gopal Iyer', stage: 'upper', subjects: 'Social science', degree: 'B.A.', professional: 'B.Ed', tetType: 'CTET', tetPaper: 'both', tetDate: '2017-09-18', other: 'Subject approval letter', otherValidUntil: inDays(40) }),
    t({ name: 'Harpreet Kaur', stage: 'secondary', subjects: 'Maths', degree: 'B.Sc.', pg: 'M.Sc. Maths', professional: 'B.Ed', other: 'Board approval for Class X', otherValidUntil: inDays(-12) }),
    t({ name: 'Imran Sheikh', stage: 'senior', subjects: 'Physics', degree: 'B.Sc.', pg: 'M.Sc. Physics', professional: 'B.Ed', other: 'Contract renewal', otherValidUntil: inDays(75) }),
    t({ name: 'Jaya Menon', stage: 'senior', subjects: 'English', degree: 'B.A.', pg: '', professional: 'B.Ed' }),
  ];
}
