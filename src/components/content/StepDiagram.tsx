export interface Step {
  title: string;
  body: string;
}

// Base layout is a single column (grid with no column count set); sm:
// breakpoint adds columns. Never a fixed multi-column grid that could
// force horizontal scroll below the 360px floor (Floor Device Standard,
// docs/07_DESIGN_SYSTEM.md).
export function StepDiagram({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid gap-6 sm:grid-cols-3">
      {steps.map((step, i) => (
        <li key={step.title} className="rounded-lg border border-slate/10 bg-white p-6">
          <span className="text-sm font-semibold text-sapphire">Step {i + 1}</span>
          <h3 className="mt-2 text-lg font-semibold text-slate">{step.title}</h3>
          <p className="mt-2 text-sm text-slate">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}
