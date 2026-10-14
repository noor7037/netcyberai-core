import type { ReportSchool } from '@/lib/free-tools/report';
import { LETTER_TITLE, type CorrectionLetter } from '@/lib/free-tools/student-data-check';

// One parent correction letter, on screen and in print. The PDF draws the
// same CorrectionLetter (src/lib/pdf/letter-canvas.ts), so the printed and
// downloaded letters say the same thing.

function Box() {
  return <span aria-hidden="true" className="mt-0.5 inline-block h-4 w-4 shrink-0 border-2 border-slate" />;
}

export function StudentDataCheckLetter({
  letter,
  school,
  dateLine,
  signOff,
  newPage = false,
}: {
  letter: CorrectionLetter;
  school?: ReportSchool;
  dateLine: string;
  signOff: string[];
  newPage?: boolean;
}) {
  const who = [`Student: ${letter.student}`, letter.className && `Class ${letter.className}`, letter.admissionNo && `Admission No. ${letter.admissionNo}`].filter(Boolean).join(' · ');
  return (
    <article className={`nca-report flex flex-col gap-4 bg-white p-5 text-slate sm:p-8 ${newPage ? 'break-before-page' : ''}`} aria-label={`${LETTER_TITLE}: ${letter.student}`}>
      {school && (
        <header className="flex items-center gap-4 border-b-2 border-sapphire pb-3">
          {school.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.logo} alt="" className="h-16 w-auto max-w-[8rem] object-contain" />
          )}
          <div className="min-w-0">
            <p className="text-xl font-extrabold text-sapphire">{school.name}</p>
            {school.lines.map((l) => (
              <p key={l} className="text-xs text-slate/70">
                {l}
              </p>
            ))}
          </div>
        </header>
      )}
      <p className="text-right text-sm">{dateLine}</p>
      <h3 className="text-xl font-extrabold text-sapphire">{LETTER_TITLE}</h3>
      <p className="font-semibold">{who}</p>
      <p>{letter.salutation}</p>
      {letter.paragraphs.map((p) => (
        <p key={p}>{p}</p>
      ))}
      <ul className="flex flex-col gap-3">
        {letter.fields.map((f) => (
          <li key={f.label} className="flex flex-col gap-3 break-inside-avoid rounded-lg border border-slate/30 p-4">
            <p className="font-bold">{f.label}</p>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
              <div>
                <dt className="text-xs text-slate/70">In the school record</dt>
                <dd className="font-bold">{f.school}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate/70">On Aadhaar</dt>
                <dd className="font-bold">{f.aadhaar}</dd>
              </div>
            </dl>
            <div className="flex flex-col gap-2 text-sm">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 print:grid-cols-2">
                {letter.choices.slice(0, 2).map((c) => (
                  <p key={c} className="flex items-start gap-2">
                    <Box /> {c}
                  </p>
                ))}
              </div>
              <p className="flex items-start gap-2">
                <Box /> <span className="shrink-0">{letter.choices[2]}</span>
                <span aria-hidden="true" className="mt-4 block min-w-[4rem] flex-1 border-b border-slate" />
              </p>
            </div>
          </li>
        ))}
      </ul>
      {letter.closing.map((p) => (
        <p key={p}>{p}</p>
      ))}
      <div>
        <p>Yours sincerely,</p>
        <div className="h-10" />
        {signOff.map((l, i) => (
          <p key={l} className={i === 0 ? 'font-semibold' : ''}>
            {l}
          </p>
        ))}
      </div>
      <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-3 print:grid-cols-3">
        {letter.signLines.map((l) => (
          <div key={l}>
            <div className="h-8 border-b border-slate" />
            <p className="mt-1 text-xs text-slate/70">{l}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
