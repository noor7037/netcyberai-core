import { contactEmail, whatsappLink } from '@/lib/site-config';

// Shown whenever a website form fails to reach the backend. The form
// never shows success unless the API returned 2xx, and this block
// always gives the visitor a working way to reach a person instead.
export function SubmitError({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-md border border-red-600 bg-white p-4 text-sm">
      <p className="font-semibold text-red-800">Your request was not sent.</p>
      <p className="mt-1 text-red-800">{message}</p>
      <p className="mt-2 text-slate">
        You can also reach us directly on{' '}
        <a href={whatsappLink('Hi, I tried the website form and it did not go through.')} className="font-semibold text-royal underline">
          WhatsApp
        </a>{' '}
        or at{' '}
        <a href={`mailto:${contactEmail}`} className="font-semibold text-royal underline">
          {contactEmail}
        </a>
        .
      </p>
    </div>
  );
}
