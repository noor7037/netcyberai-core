/** @type {import('next').NextConfig} */
const nextConfig = {
  // tesseract.js (src/lib/capture/ocr.ts, Prompt F Task 3) spawns its
  // Node worker via `new Worker(workerPath)` with a path computed at
  // RUNTIME, not a static import -- Next.js's output file tracing (what
  // decides which node_modules files actually ship in the deployed
  // serverless function) can't see that and drops the worker script
  // entirely. Confirmed live: every OCR call in the deployed Preview
  // failed with `Cannot find module '.../worker-script/node/index.js'`
  // until this was added. Force-included for every /api/** route
  // rather than just the two OCR-calling ones -- simpler than keeping
  // this list in sync with which routes import ocr.ts, and the actual
  // size cost is a few hundred KB, not something worth the upkeep.
  experimental: {
    // src/instrumentation.ts: forwards server errors to the ErrorReporter (C111).
    instrumentationHook: true,
    // Keep tesseract.js as a plain node_modules require() at runtime
    // instead of webpack-bundling it into the route's compiled chunk --
    // bundling is what broke createWorker's __dirname-relative path to
    // its own worker script in the first place. outputFileTracingIncludes
    // alone (below) controls which files get COPIED into the deployed
    // function; this controls whether the module is bundled at all.
    // pdfjs-dist too: the tutor reads a PDF's text on the server (W4-1, C385), and PDF.js loads its own worker module
    // beside itself at run time, which bundling would break the same way.
    serverComponentsExternalPackages: ['tesseract.js', 'tesseract.js-core', 'pdfjs-dist'],
    outputFileTracingIncludes: {
      '/api/**/*': [
        './node_modules/tesseract.js/src/worker-script/**',
        './node_modules/tesseract.js/src/worker/**',
        './node_modules/tesseract.js-core/**',
        './node_modules/node-fetch/**',
        './node_modules/pdfjs-dist/legacy/build/**',
      ],
    },
  },
  // PDF.js's worker (AI marking's upload screen, C350) is a file the build copies into /_next/static/media. It is
  // already minified, and as a stand-alone .mjs the build's own minifier cannot read it as a module (it stops with
  // "'import.meta' cannot be used outside of module code"). It is told the file needs no more minifying, as the build
  // does for its own polyfills; nothing else is changed.
  webpack(config) {
    config.plugins.push({
      apply(compiler) {
        const { Compilation } = compiler.webpack;
        compiler.hooks.thisCompilation.tap('PdfWorkerAlreadyMinified', (compilation) => {
          compilation.hooks.processAssets.tap({ name: 'PdfWorkerAlreadyMinified', stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONS }, (assets) => {
            for (const name of Object.keys(assets)) {
              if (/(^|\/)pdf\.worker\.min\.[^/]*\.mjs$/.test(name)) compilation.updateAsset(name, (source) => source, { minimized: true });
            }
          });
        });
      },
    });
    return config;
  },
  // The old /demo concept demo was folded into the one demo system on the
  // homepage and /product-tour (Decision Log C74); keep inbound links alive.
  // Free tools retired in the Decision Log C78 audit point to the tool
  // that replaced them (kept in step with REMOVED_TOOL_REDIRECTS in
  // src/content/free-tools.ts).
  // A family's private result link (C351): one child's marks and checked pages. Never kept by a shared cache, never
  // indexed, and its address (which holds the key) never sent on to another site. The page pictures' route says the
  // same in its own responses.
  async headers() {
    return [
      {
        source: '/results/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: '/demo', destination: '/product-tour', permanent: true },
      { source: '/free-tools/attendance-calculator', destination: '/free-tools/attendance-recovery-planner', permanent: true },
      { source: '/free-tools/fee-reminder-message', destination: '/free-tools/fee-leakage-calculator', permanent: true },
      { source: '/free-tools/daily-pulse-message', destination: '/features/daily-learning-pulse-hinglish', permanent: true },
    ];
  },
};

module.exports = nextConfig;
