import type { BlogPost } from '../contract';

export const coachingCentreVsSchoolErpSameEngineDifferentDataModel: BlogPost = {
  slug: 'coaching-centre-vs-school-erp-same-engine-different-data-model',
  title: 'Coaching Centre vs School ERP: Same Engine, Different Data Model',
  description:
    'A coaching centre and a full-time school need different data — batches instead of classes, no attendance-linked recognition — but the same underlying engine.',
  publishedOn: '2026-09-16',
  answerFirst:
    'A coaching centre and a full-time school run on the same underlying needs — parent communication, fee collection, progress tracking — but organise their data differently: batches instead of classes, a target exam instead of a full curriculum. The right approach is one platform with a tenant type that changes the data model, not two separate products.',
  body: [
    {
      type: 'paragraph',
      text: 'It is tempting to treat a coaching centre and a full-time school as different markets needing entirely different software, because the day-to-day feels different — a coaching centre runs batches with rolling enrollment rather than a fixed academic year, and measures success against a target exam rather than a broad curriculum. Underneath that difference, though, the actual jobs are the same: tell a parent what happened today, collect a fee reliably, and give a manager a real signal on whether teaching is working.',
    },
    {
      type: 'heading',
      text: 'What actually differs',
    },
    {
      type: 'list',
      items: [
        'Structure: a coaching centre organises around batches and rolling enrollment; a school organises around classes and a fixed academic year.',
        'Goal: a coaching centre is usually preparing for one target exam; a school covers a full curriculum across subjects.',
        'Family relationship: a coaching centre parent may be paying for a specific course, not a multi-year enrollment.',
      ],
    },
    {
      type: 'heading',
      text: 'What does not differ',
    },
    {
      type: 'paragraph',
      text: 'Fee collection, parent communication, attendance tracking, and a non-demotivating way to recognise student progress are needed by both, in essentially the same shape. Building two separate products to serve what is functionally the same underlying set of needs means fixing the same bug twice and building the same feature twice — a poor use of a small team’s time when the actual difference is in the data, not the underlying logic. It also means the same data-isolation and export commitments described on [our data ownership page](/security/data-ownership) apply identically to a coaching centre account as to a school account, rather than needing to be built and verified twice.',
    },
    {
      type: 'heading',
      text: 'One engine, a tenant type field',
    },
    {
      type: 'paragraph',
      text: 'The practical answer is a single platform where a tenant type — school, coaching, or college — shapes what the data model looks like and what the interface shows, rather than three separate codebases. The underlying tables for fees, communication, and recognition stay the same; what changes is how a "class" concept maps to a "batch" concept, and how progress is measured against a target exam instead of a term’s worth of subjects. The tenant type is a field on the account, not a fork in the code — the same audit log, the same consent ledger, and the same tenant-isolation rule apply regardless of which type a given account is.',
    },
    {
      type: 'heading',
      text: 'Recognition needs the same care in both settings',
    },
    {
      type: 'paragraph',
      text: 'A coaching centre is, if anything, more prone to the ranking-obsession problem than a school — exam-prep culture already leans heavily on rank and score comparisons. The same [Personal Best design](/blog/personal-best-vs-top-3-recognition) that avoids demotivating most of a class in a school setting applies just as much in a coaching context, arguably more, since the students most likely to disengage from constant ranking are the ones a coaching centre most needs to keep motivated through a long exam-prep cycle.',
    },
    {
      type: 'heading',
      text: 'Fee collection looks different but works the same way',
    },
    {
      type: 'paragraph',
      text: 'A coaching centre’s fee structure — per-course, per-batch, sometimes per-module — looks different from a school’s per-term fee heads, but the underlying rule is identical: a fee is paid when a real payment is recorded against it, never because a reminder went out or a page was opened. [The same D-3 to D+7 reminder sequence](/blog/fee-recovery-sequence-d3-to-d7-playbook) applies whether the fee is for a school term or a coaching batch.',
    },
    {
      type: 'heading',
      text: 'What this is not',
    },
    {
      type: 'paragraph',
      text: 'This is not a claim that a coaching centre and a school are identical businesses — they are not, and a good product still needs to get the batch-versus-class distinction right in its actual data model, not paper over it. It is a claim that the underlying communication, fee, and recognition engine does not need to be rebuilt from scratch to serve both.',
    },
  ],
  faqs: [
    {
      question: 'Can a coaching centre and a school use the exact same interface?',
      answer:
        'The underlying engine is shared, but the interface should reflect the vocabulary each setting actually uses — "batch" rather than "class," for instance — rather than forcing one tenant type’s language onto the other.',
    },
    {
      question: 'Does a coaching centre need the same consent handling as a school?',
      answer:
        'Yes — most students at a coaching centre serving school-age students are still children, so the same consent-gating principles apply regardless of tenant type.',
    },
    {
      question: 'Why not just build a separate, simpler product for coaching centres?',
      answer:
        'A separate product means duplicating the parts that are genuinely the same — fee logic, communication, recognition — which is more maintenance work for a small team without a real benefit to either kind of customer.',
    },
    {
      question: 'What about a college, the third tenant type?',
      answer:
        'A college introduces its own differences again — departments and semesters rather than classes or batches — but is out of scope for this phase of the product; the tenant type exists in the data model without a built interface for it yet.',
    },
  ],
  sources: [],
  caseStudy: null,
};
