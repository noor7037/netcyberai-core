import { Container } from '@/components/ui/Container';
import { PageHero } from '@/components/marketing/PageHero';
import { RegisterSchoolForm } from '@/components/onboarding/RegisterSchoolForm';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

export const metadata = buildMetadata(pageMeta.registerSchool);

// Public school registration (C98). The application waits for the
// founder's approval; approval creates the school and invites the
// principal by email.
export default function RegisterSchoolPage() {
  return (
    <>
      <PageHero
        id="register-school-title"
        eyebrow="Register your school"
        tone="product"
        title={<>Register your school</>}
        lead={
          <>
            Tell us about your school and confirm the principal’s email with a 6-digit code. Our team reviews every application; once it is
            approved, the principal gets an email invitation to set a password and sign in, then invites the staff.
          </>
        }
      />
      <section className="bg-off-white">
        <Container className="py-12">
          <div className="mx-auto max-w-2xl">
            <RegisterSchoolForm />
          </div>
        </Container>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.registerSchool)) }}
      />
    </>
  );
}
