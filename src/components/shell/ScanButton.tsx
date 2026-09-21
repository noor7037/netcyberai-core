'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';

type ScanOutcome = {
  result: 'resolved' | 'revoked_token' | 'unknown_token' | 'unauthorized' | 'cross_tenant_denied';
  student?: { studentId: string; name: string; admissionNo: string | null; rollNo: string | null; className: string | null; status: string; photoUrl: string | null };
};

const RESULT_LABEL: Record<ScanOutcome['result'], string> = {
  resolved: 'Resolved',
  revoked_token: 'This card has been revoked',
  unknown_token: 'Not a recognized code',
  unauthorized: "You don't have access to this student",
  cross_tenant_denied: 'Not a code from this school',
};

// Real scan action, replacing the "coming soon" stub (Prompt D). Uses
// the browser's native BarcodeDetector where available (Chrome/Android
// -- this project's own Floor Device Standard target); where it isn't,
// a manual entry field is the honest fallback -- never a camera UI
// that only pretends to decode, per this component's own predecessor's
// no-silent-failure comment.
export function ScanButton() {
  const [open, setOpen] = useState(false);
  const [supportsDetector, setSupportsDetector] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setSupportsDetector(typeof window !== 'undefined' && 'BarcodeDetector' in window);
  }, []);

  useEffect(() => {
    if (!open || !supportsDetector) return;
    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setScanning(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Detector = (window as any).BarcodeDetector;
        const detector = new Detector({ formats: ['qr_code'] });
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes[0]?.rawValue) {
              handleScan(codes[0].rawValue);
              return;
            }
          } catch {
            // transient decode failure -- keep trying, don't surface every frame miss as an error
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } catch {
        setSupportsDetector(false); // camera denied/unavailable -- fall back to manual entry
      }
    }
    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supportsDetector]);

  async function handleScan(payload: string) {
    setScanning(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const res = await fetch('/api/app/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, purpose: 'lookup', deviceHint: navigator.userAgent.slice(0, 100) }),
    });
    const body = await res.json();
    setOutcome(body);
  }

  function close() {
    setOpen(false);
    setOutcome(null);
    setManualValue('');
    setScanning(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-md px-2 text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire"
      >
        <span aria-hidden="true">📷</span>
        <span className="text-sm font-medium">Scan</span>
      </button>

      <Modal open={open} onClose={close} title="Scan student QR">
        {!outcome && (
          <div className="flex flex-col gap-4">
            {supportsDetector ? (
              <>
                <video ref={videoRef} className="w-full rounded-md bg-slate/10" muted playsInline />
                <p className="text-sm text-slate/70">{scanning ? 'Point the camera at a student ID card.' : 'Starting camera…'}</p>
              </>
            ) : (
              <>
                <p className="text-sm text-slate/70">
                  Camera scanning isn&apos;t available on this device/browser. Enter the code manually.
                </p>
                <input
                  type="text"
                  value={manualValue}
                  onChange={(e) => setManualValue(e.target.value)}
                  placeholder="nca:s:…"
                  className="min-h-[44px] rounded-md border border-slate/20 px-3 text-sm"
                />
                <button
                  type="button"
                  onClick={() => manualValue && handleScan(manualValue)}
                  className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white"
                >
                  Resolve
                </button>
              </>
            )}
          </div>
        )}

        {outcome && (
          <div className="flex flex-col gap-3">
            <Badge variant={outcome.result === 'resolved' ? 'success' : 'danger'}>{RESULT_LABEL[outcome.result]}</Badge>
            {outcome.student && (
              <div className="rounded-md border border-slate/10 p-3 text-sm">
                <p className="text-base font-semibold text-slate">{outcome.student.name}</p>
                <p className="text-slate/70">
                  {outcome.student.className ?? '—'} · Roll {outcome.student.rollNo ?? '—'} · Admission {outcome.student.admissionNo ?? '—'}
                </p>
              </div>
            )}
            <button type="button" onClick={close} className="min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate">
              Close
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}
