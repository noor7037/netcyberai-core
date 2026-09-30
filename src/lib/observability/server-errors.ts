import { errorReporter, noopReporter, type ErrorReporter } from './error-reporter';

// Next.js 14 logs a failed route or server component with console.error and
// has no error hook yet (onRequestError arrives in 15). So, on the Node
// runtime, errors passed to console.error and unhandled rejections are
// forwarded to the ErrorReporter as well as logged (C111). Nothing changes
// while no reporter is configured.

type Target = { error: (...args: unknown[]) => void };

// Returns a function that restores the original console.error.
export function forwardConsoleErrors(target: Target, reporter: ErrorReporter): () => void {
  const original = target.error;
  let inside = false;
  target.error = (...args: unknown[]) => {
    if (!inside) {
      inside = true;
      try {
        const err = args.find((a) => a instanceof Error);
        if (err) reporter.captureException(err, { tags: { source: 'console.error' } });
      } catch {
        // reporting must never break logging
      } finally {
        inside = false;
      }
    }
    original.apply(target, args);
  };
  return () => {
    target.error = original;
  };
}

let installed = false;

export function installServerErrorForwarding(): void {
  if (installed) return;
  installed = true;
  const reporter = errorReporter();
  if (reporter === noopReporter) return;
  forwardConsoleErrors(console, reporter);
  process.on('unhandledRejection', (reason) => reporter.captureException(reason, { tags: { source: 'unhandledRejection' } }));
}
