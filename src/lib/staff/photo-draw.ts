import { PHOTO_EDGE_PX, PHOTO_MAX_ASPECT, PHOTO_MAX_BYTES, PHOTO_MIN_SIDE_PX } from './profile-rules';

// In the browser only (C238): a staff photo the office picks, drawn on a canvas no larger than PHOTO_EDGE_PX on its
// long side (never scaled up) and sent as a JPEG, so only its pixels are sent: no camera details, no location, and a
// small file. The staff copy of the school logo's drawing (src/components/settings/SchoolBrandingCard.tsx), which it
// does not share: a photo is a JPEG, a logo a PNG. The server checks the result again by its own bytes.

const PICKED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PICKED = /\.(jpe?g|png|webp)$/i;
export type DrawProblem = 'picker_type' | 'picker_size' | 'photo_dimensions' | 'picker_read';

export async function drawStaffPhoto(file: File): Promise<{ blob: Blob } | { problem: DrawProblem }> {
  if (!PICKED_TYPES.includes(file.type) && !PICKED.test(file.name)) return { problem: 'picker_type' };
  if (file.size > PHOTO_MAX_BYTES) return { problem: 'picker_size' };
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('unreadable'));
      image.src = source;
    });
    const scale = Math.min(1, PHOTO_EDGE_PX / Math.max(image.naturalWidth, image.naturalHeight));
    const w = Math.max(1, Math.round(image.naturalWidth * scale));
    const h = Math.max(1, Math.round(image.naturalHeight * scale));
    if (w < PHOTO_MIN_SIDE_PX || h < PHOTO_MIN_SIDE_PX || w / h > PHOTO_MAX_ASPECT || h / w > PHOTO_MAX_ASPECT) return { problem: 'photo_dimensions' };
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d');
    if (!context) return { problem: 'picker_read' };
    // A transparent picture is drawn on white, as it would be printed.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, w, h);
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    return blob ? { blob } : { problem: 'picker_read' };
  } catch {
    return { problem: 'picker_read' };
  } finally {
    URL.revokeObjectURL(source);
  }
}
