// Typed "check my work" (W18-Q3), the phone's side. The phone decides only whether the words open like a check and hold a
// line that looks like a sum (digits, an operator, an equals sign, no letters), with a regex and nothing else: the
// arithmetic evaluator stays on the server (check-work.ts), so the Study page's first load does not carry it. When the
// phone says "check" and the server finds nothing it can mark, the server answers the words as an ordinary question.

export const TYPED_CHECK = /^\s*(?:check\s+my\s+work|is\s+this\s+right|is\s+this\s+correct|मेरा\s+काम\s+जा[ँं]चो|मेरा\s+काम\s+जा[ँं]च\s+दो|क्या\s+(?:यह|ये)\s+सही\s+है)\s*[?।]?\s*[:\-–—]?/iu;
export const SEGMENT = /\r?\n|;|,\s+/;

// "45 x 2 = 90", "2+3×4=14", "3/4 + 1/8 = 7/8", "1,00,000 + 1 = 1,00,001": an x between digits is times; any other letter means
// a variable or a unit, which is the model's to judge, not a sum the phone can promise.
const SUM_SHAPE = /^[\d\s.,()\[\]{}+\-−–×*·÷/]+=[\d\s.,()\[\]{}+\-−–×*·÷/]+$/;
export function looksLikeSum(line: string): boolean {
  const s = line.normalize('NFKC').replace(/(?<=\d)\s*[xX]\s*(?=[\d(.])/g, '×').trim();
  return SUM_SHAPE.test(s) && /\d/.test(s.split('=')[0]) && /\d/.test(s.split('=').slice(1).join('='));
}

export function typedCheckIntentLight(text: string): boolean {
  const m = TYPED_CHECK.exec(text.normalize('NFC'));
  if (!m) return false;
  return text
    .normalize('NFC')
    .slice(m[0].length)
    .split(SEGMENT)
    .map((x) => x.replace(/[\s.;:!?,।]+$/u, '').trim())
    .some((x) => x.length > 0 && looksLikeSum(x));
}
