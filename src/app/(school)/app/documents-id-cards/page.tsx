import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { CertificatesView } from '@/components/documents/CertificatesView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Documents and certificates (docs/28 row 10e, C228): transfer, bonafide, character and study certificates from the
// student record, for one child or a class, behind the fee clearance or the principal's recorded waiver; the issue
// register; withdrawal; the seal and the signature; and sending each to the family. Student ID cards stay with
// Students. The principal and the school admin; the database says the same.
export default async function DocumentsIdCardsPage() {
  const off = await moduleOffReason('documents');
  if (off) return <ModuleOffPage moduleId="documents" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="documents" help="issue-certificates" tour="certificates" title={t(lang, 'crt.page.title')} purpose={t(lang, 'crt.page.purpose')} about={t(lang, 'crt.page.about')}>
      <CertificatesView />
    </ModulePage>
  );
}
