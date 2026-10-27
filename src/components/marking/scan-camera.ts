// The phone's camera for the scan screen (C230-AJ): the rear camera at the highest resolution it offers, its torch where
// it has one, a small frame of the live view for finding the page, and a full photo when a page is taken. Nothing is
// recorded or kept here: a frame is handed to the worker and let go.

export type Camera = {
  stream: MediaStream;
  track: MediaStreamTrack;
  torch: boolean; // the camera has a torch
  setTorch: (on: boolean) => Promise<boolean>;
  stop: () => void;
};

export type CameraProblem = 'no_camera' | 'denied' | 'busy';

type TorchCaps = MediaTrackCapabilities & { torch?: boolean; width?: { max?: number }; height?: { max?: number } };

export async function openCamera(): Promise<{ ok: true; camera: Camera } | { ok: false; problem: CameraProblem }> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return { ok: false, problem: 'no_camera' };
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 4096 }, height: { ideal: 4096 } } });
  } catch (err) {
    const name = (err as { name?: string }).name;
    return { ok: false, problem: name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotReadableError' ? 'busy' : 'no_camera' };
  }
  const track = stream.getVideoTracks()[0];
  if (!track) {
    stream.getTracks().forEach((t) => t.stop());
    return { ok: false, problem: 'no_camera' };
  }
  const caps = (typeof track.getCapabilities === 'function' ? track.getCapabilities() : {}) as TorchCaps;
  // The highest resolution the camera says it has, when that is more than it gave (a stream that is not a camera can
  // report sizes that mean nothing: it is left as it is).
  const now = typeof track.getSettings === 'function' ? track.getSettings() : {};
  if (caps.width?.max && caps.height?.max && caps.width.max >= 640 && caps.height.max >= 480 && caps.width.max * caps.height.max > (now.width ?? 0) * (now.height ?? 0)) {
    await track.applyConstraints({ width: caps.width.max, height: caps.height.max }).catch(() => undefined);
  }
  const torch = caps.torch === true;
  return {
    ok: true,
    camera: {
      stream,
      track,
      torch,
      setTorch: async (on) => {
        if (!torch) return false;
        try {
          await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
          return true;
        } catch {
          return false;
        }
      },
      stop: () => stream.getTracks().forEach((t) => t.stop()),
    },
  };
}

// A small frame of the live view (its long edge `edge` px), as RGBA for the worker.
export function liveFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement, edge = 256): { width: number; height: number; rgba: ArrayBuffer } | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const k = edge / Math.max(vw, vh);
  canvas.width = Math.max(1, Math.round(vw * k));
  canvas.height = Math.max(1, Math.round(vh * k));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return { width: canvas.width, height: canvas.height, rgba: data.buffer };
}

type PhotoCapture = { takePhoto: () => Promise<Blob> };
declare global {
  interface Window {
    ImageCapture?: new (track: MediaStreamTrack) => PhotoCapture;
  }
}

// The photo for a page: a still at the camera's full resolution where the browser can take one (ImageCapture), else the
// live view's own frame. A still that takes too long gives way to the frame, so a tap never hangs.
export async function takePhoto(camera: Camera, video: HTMLVideoElement): Promise<ImageBitmap> {
  const Capture = typeof window !== 'undefined' ? window.ImageCapture : undefined;
  if (Capture) {
    try {
      const blob = await Promise.race([new Capture(camera.track).takePhoto(), new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
      if (blob) return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      // The frame below.
    }
  }
  return createImageBitmap(video);
}
