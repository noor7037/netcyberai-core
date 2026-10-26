// PDF.js ships its types for the readable build only. The minified build, which the browser loads when a PDF is chosen
// (src/components/marking/render-pages.ts), is the same code with shorter names, so it has the same types.
declare module 'pdfjs-dist/legacy/build/pdf.min.mjs' {
  export * from 'pdfjs-dist';
}
