import type { MessageKey } from '@/lib/i18n';

// The words the parent area's certificate card needs (W21-M7, src/components/family/SchoolCertificates.tsx), picked on the server.
const KINDS = ['transfer', 'bonafide', 'character', 'study'] as const;
const STAGES = ['requested', 'held', 'waived', 'issued', 'ready', 'collected'] as const;
const EVENTS = ['requested', 'held', 'released', 'waived', 'issued', 'ready', 'downloaded', 'collected'] as const;
export const SCHOOL_CERTIFICATE_KEYS: readonly MessageKey[] = [
  'fam.w21m7.cert.title',
  'fam.w21m7.cert.lead',
  'fam.w21m7.cert.which',
  'fam.w21m7.cert.reason',
  'fam.w21m7.cert.ask',
  'fam.w21m7.cert.sent',
  'fam.w21m7.cert.mine',
  'fam.w21m7.cert.download',
  'fam.w21m7.cert.downloadNote',
  'fam.w21m7.cert.opening',
  'fam.w21m7.cert.err.duplicate',
  'fam.w21m7.cert.err.reason',
  'fam.w21m7.cert.err.other',
  'fam.w21m7.cert.err.link',
  ...KINDS.map((k) => `fam.w21m7.cert.kind.${k}` as MessageKey),
  ...STAGES.map((s) => `fam.w21m7.cert.stage.${s}` as MessageKey),
  ...EVENTS.map((e) => `fam.w21m7.cert.event.${e}` as MessageKey),
];
