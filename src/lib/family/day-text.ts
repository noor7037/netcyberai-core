// A date written by Intl in Hindi reads the same on the server (Node's ICU) and in the phone's browser (Chromium's ICU)
// except for October: Node writes "अक्टू॰", the browser "अक्तू॰". Rendered in a client component that is a hydration
// mismatch (React throws the server HTML away). One spelling for both, the browser's, so the two sides agree.
export const sameInkOnBothSides = (text: string): string => text.replace(/अक्टू/g, 'अक्तू');
