import type { RteChild, RteSettings } from '@/lib/free-tools/rte-claim';

// Example for the RTE Claim Sheet Builder's "Try an example" button.
// Fictional children, fees, rate and claim history; no real school, child
// or state notification. The per-child rate here is made up for the
// example only: a school always takes its own from the state.

export const RTE_EXAMPLE_SETTINGS: RteSettings = {
  year: '2026-27',
  rate: '17500',
  fee: '21000',
  classFees: [
    { cls: 'Nursery', fee: '15000' },
    { cls: 'KG', fee: '16500' },
  ],
  documents: ['Admission order or lottery allotment', 'Proof of age', 'Income or category certificate', 'Proof of residence', 'Attendance record'],
  ageing: [
    { year: '2024-25', claimed: '262500', filed: '2025-08-20', received: '131250' },
    { year: '2023-24', claimed: '245000', filed: '2024-09-12', received: '196000' },
    { year: '2025-26', claimed: '280000', filed: '2026-07-15', received: '' },
  ],
};

export const RTE_EXAMPLE_CHILDREN: RteChild[] = [
  { name: 'Aditi Kumari', cls: 'Nursery', admitted: '2026-04-06', docs: [true, true, true, true, true] },
  { name: 'Bilal Ahmed', cls: 'Nursery', admitted: '2026-04-06', docs: [true, true, false, true, true] },
  { name: 'Chhavi Rathore', cls: 'KG', admitted: '2026-04-08', docs: [true, true, true, true, true] },
  { name: 'Dev Prakash', cls: '1-A', admitted: '2026-04-10', docs: [true, false, true, false, true] },
  { name: 'Esha Meena', cls: '1-B', admitted: '2026-04-10', docs: [true, true, true, true, true] },
  { name: 'Faizan Qureshi', cls: '1-A', admitted: '2026-04-15', docs: [true, true, true, true, false] },
];
