// The size a tutor photograph is drawn at (C526). Nothing here fetches anything: it only reads and rewrites the address
// the server already checked, so the phone pays for a small picture and only a wide screen asks for a larger one.
//
// Commons serves a scaled copy of any file at a fixed address ending "<width>px-<name>". Its edge cache keeps a set of
// standard widths; 500 px is the standard step nearest 480 px (about 25 to 60 KB for a JPEG photograph), and 960 px
// is the next one used for a wide screen. Openverse's thumbnail is already one small size; it has no wider variant.

export const PHOTO_WIDTH = 500;
export const PHOTO_WIDE_WIDTH = 960;
// The photo's box is 4:3 (ImageView), so its explicit size is 500 by 375 and the page never jumps when it arrives.
export const PHOTO_HEIGHT = 375;
// The screen width from which the wider copy is asked for (a tablet or a computer, never a phone).
export const WIDE_MEDIA = '(min-width: 768px)';

const COMMONS_THUMB = /^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/[^?#]+\/)\d{2,4}px-([^/?#]+)$/;

export type PhotoSizes = { src: string; wide: string | null };

// The small copy every screen starts with, and the wider copy for a wide screen (null: there is none to ask for).
// An address that is not a Commons thumbnail (an original smaller than the step, or an Openverse thumbnail) is used as
// it is.
export function photoSizes(url: string): PhotoSizes {
  const m = COMMONS_THUMB.exec(url);
  if (!m) return { src: url, wide: null };
  return { src: `${m[1]}${PHOTO_WIDTH}px-${m[2]}`, wide: `${m[1]}${PHOTO_WIDE_WIDTH}px-${m[2]}` };
}
