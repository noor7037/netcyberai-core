/** @type {import('next').NextConfig} */
const FAMILY_FRAME_HOSTS = [
  'www.youtube-nocookie.com',
  'phet.colorado.edu',
  'www.geogebra.org',
  'eyes.nasa.gov',
  'www.biointeractive.org',
  'www.labxchange.org',
  'concord.org',
  'lab.concord.org',
  'models-resources.concord.org',
  'www.desmos.com',
  '3d.si.edu',
  'artsandculture.google.com',
  'demonstrations.wolfram.com',
];

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
    // pdfkit (src/lib/pdf/unicode-pdf.ts, W17-B5) is kept external for the same reason: it reads its own files by a
    // __dirname-relative path, which a webpack bundle breaks.
    serverComponentsExternalPackages: ['tesseract.js', 'tesseract.js-core', 'pdfkit'],
    outputFileTracingIncludes: {
      '/api/**/*': [
        './node_modules/tesseract.js/src/worker-script/**',
        './node_modules/tesseract.js/src/worker/**',
        './node_modules/tesseract.js-core/**',
        './node_modules/node-fetch/**',
        // The tutor reads a PDF's text on the server (W4-1, C385) with PDF.js loaded at run time, not bundled (it is not
        // listed as an external package: AI marking's page renderer bundles it for the browser).
        './node_modules/pdfjs-dist/legacy/build/**',
        // Report cards with Hindi are drawn with these fonts, read at run time by a computed path (W17-B5).
        './public/fonts/**',
      ],
      // The chapter reader and its labs, served to signed-in families (/family/learn/..., founder 9 Nov 2026): the
      // pages, scripts, chapter data and images. W23-C: lab data for every class 1-12 (about 48 MB in all; Class 10 is
      // about 6 MB of it), not only the classes that have a book: the tutor can show a lab of the child's class
      // anywhere, and the lab page loads its definition from here (/family/learn/labs/defs/...).
      '/family/learn/**/*': [
        './reader/index.html',
        './reader/reader.js',
        './reader/reader.css',
        './reader/content/**',
        './labs/*.{html,js,css,json}',
        './labs/templates/**',
        './labs/defs/**',
        './labs/assets/**',
      ],
      // W23-C: the tutor's answer reads the chapter reader's content and the lab definitions on the server (where the
      // window was opened, and the labs it may show: src/lib/family/tutor-context.ts), by a computed path.
      '/api/family/understand': ['./reader/content/**', './labs/index.json', './labs/defs/**'],
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
      // Every response (C471): HTTPS only, for this host and its subdomains, for two years (not on the preload list:
      // that is near impossible to undo, and nothing needs it yet); no content-type guessing; a referrer that names
      // only this site to another one. Listed first, so a stricter rule below wins for its own paths.
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      // The Family app's frames (Noor, 16 Nov 2026): its own pages (labs, book readers), YouTube's privacy-enhanced player and the
      // approved simulation sites, and no other site. Only frame-src is set. The simulation hosts are the ones in
      // src/lib/family/sim-hosts.ts (test/family/sims.test.ts keeps the two lists equal).
      {
        source: '/family/:path*',
        headers: [{ key: 'Content-Security-Policy', value: `frame-src 'self' blob: data: ${FAMILY_FRAME_HOSTS.map((h) => `https://${h}`).join(' ')}` }],
      },
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
      // /security has no page of its own; its one page is the data-ownership page (C471).
      { source: '/security', destination: '/security/data-ownership', permanent: true },
      { source: '/free-tools/attendance-calculator', destination: '/free-tools/attendance-recovery-planner', permanent: true },
      { source: '/free-tools/fee-reminder-message', destination: '/free-tools/fee-leakage-calculator', permanent: true },
      { source: '/free-tools/daily-pulse-message', destination: '/features/daily-learning-pulse-hinglish', permanent: true },
      // W14-D: the AI marking screens are one address a paper's own (the review list and the scripts are that page); the old
      // paths a person types land there, or on the exams list when no paper is named.
      { source: '/app/exams/papers/:paperId/marking/review', destination: '/app/exams/papers/:paperId/marking', permanent: false },
      { source: '/app/exams/papers/:paperId/marking/scripts', destination: '/app/exams/papers/:paperId/marking', permanent: false },
      { source: '/marking/review', destination: '/app/exams', permanent: false },
      { source: '/marking/scripts', destination: '/app/exams', permanent: false },
      { source: '/app/marking/review', destination: '/app/exams', permanent: false },
      { source: '/app/marking/scripts', destination: '/app/exams', permanent: false },
    ];
  },
};

module.exports = nextConfig;
