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
    // Keep tesseract.js as a plain node_modules require() at runtime
    // instead of webpack-bundling it into the route's compiled chunk --
    // bundling is what broke createWorker's __dirname-relative path to
    // its own worker script in the first place. outputFileTracingIncludes
    // alone (below) controls which files get COPIED into the deployed
    // function; this controls whether the module is bundled at all.
    serverComponentsExternalPackages: ['tesseract.js', 'tesseract.js-core'],
    outputFileTracingIncludes: {
      '/api/**/*': [
        './node_modules/tesseract.js/src/worker-script/**',
        './node_modules/tesseract.js/src/worker/**',
        './node_modules/tesseract.js-core/**',
        './node_modules/node-fetch/**',
      ],
    },
  },
};

module.exports = nextConfig;
