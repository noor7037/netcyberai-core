// Runs once per server instance (Next.js instrumentation hook; enabled in
// next.config.js). Node runtime only: forwards server errors to the
// ErrorReporter (C111).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installServerErrorForwarding } = await import('./lib/observability/server-errors');
    installServerErrorForwarding();
  }
}
