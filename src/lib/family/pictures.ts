// The Family app's bundled pictures (D1, C290): every emoji the app shows is drawn from public/family/pictures/ (Fluent
// Emoji flat, MIT, plus a few of our own in the same style), so every phone shows the same pictures instead of its own
// emoji font. A file is named by the emoji's code points in hex, without the variation selector FE0F, joined by '-'.

export const PICTURES_PATH = '/family/pictures';

export function pictureFile(emoji: string): string {
  return [...emoji]
    .map((c) => c.codePointAt(0)!)
    .filter((cp) => cp !== 0xfe0f)
    .map((cp) => cp.toString(16))
    .join('-');
}

export const pictureSrc = (emoji: string) => `${PICTURES_PATH}/${pictureFile(emoji)}.svg`;
