'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { useT } from '@/components/app-shell/LangContext';
import { explainError } from '@/lib/errors/catalogue';

const DOC_TYPES = [
  { value: 'birth_certificate', label: 'Birth certificate' },
  { value: 'previous_school_tc', label: 'Previous school TC' },
  { value: 'previous_report_card', label: 'Previous report card' },
  { value: 'address_proof', label: 'Address proof' },
  { value: 'guardian_id', label: "Guardian ID (Aadhaar) — image never stored" },
  { value: 'student_photograph', label: 'Student photograph' },
  { value: 'caste_category_certificate', label: 'Caste/category certificate' },
  { value: 'medical_record', label: 'Medical record' },
] as const;

const LOW_CONFIDENCE_THRESHOLD = 70; // tesseract confidence is 0-100

type Extraction = { extraction_id: string; field_name: string; extracted_value: string | null; confidence: number | null };
type CaptureOutcome = { document: { document_id: string; doc_type: string; ocr_status: string }; extractions: Extraction[]; signedUrl: string | null };

// Client-side compression, per PRD Sec6.1: "target <=500KB, floor-device
// friendly." A canvas re-encode at a fixed max dimension + JPEG quality
// gets most phone-camera photos under that without a new dependency.
async function compressImage(file: File, maxDimension = 1600, quality = 0.75): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/webp') return file; // pass PDFs / already-small formats through unchanged
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  return blob ?? file;
}

export function DocumentCapture({ studentId, guardians }: { studentId: string; guardians: { parent_id: string; name: string }[] }) {
  const [docType, setDocType] = useState<(typeof DOC_TYPES)[number]['value']>('birth_certificate');
  const [parentId, setParentId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [outcome, setOutcome] = useState<CaptureOutcome | null>(null);
  const [decisions, setDecisions] = useState<Record<string, { accepted: boolean; correctedValue: string }>>({});
  const toast = useToast();
  const { lang } = useT();

  async function handleUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = (e.currentTarget.elements.namedItem('file') as HTMLInputElement) ?? null;
    const rawFile = input?.files?.[0];
    if (!rawFile) {
      toast.show('Choose a photo or file first', 'danger');
      return;
    }
    setUploading(true);
    setOutcome(null);
    try {
      const compressed = await compressImage(rawFile);
      const form = new FormData();
      form.append('file', compressed, rawFile.name);
      form.append('docType', docType);
      if (docType === 'guardian_id' && parentId) form.append('parentId', parentId);

      const res = await fetch(`/api/app/students/${studentId}/documents`, { method: 'POST', body: form });
      const body = await res.json();
      if (!res.ok) {
        // In the person's language when the route named a rule of the error catalogue (an Aadhaar card or number in
        // the file, C232 part A, among them).
        toast.show(explainError(body, body.error ?? 'upload failed', lang, res.status), 'danger');
        return;
      }
      setOutcome(body);
      const initial: Record<string, { accepted: boolean; correctedValue: string }> = {};
      body.extractions.forEach((ex: Extraction) => {
        initial[ex.extraction_id] = { accepted: true, correctedValue: ex.extracted_value ?? '' };
      });
      setDecisions(initial);
      toast.show(
        body.extractions.length > 0 ? `${body.extractions.length} field(s) pre-filled — review before confirming` : 'Uploaded — no fields could be pre-filled, enter manually',
        'success'
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirm() {
    if (!outcome) return;
    const payload = {
      decisions: outcome.extractions.map((ex) => ({
        extractionId: ex.extraction_id,
        accepted: decisions[ex.extraction_id]?.accepted ?? true,
        correctedValue: decisions[ex.extraction_id]?.accepted ? null : decisions[ex.extraction_id]?.correctedValue,
      })),
    };
    const res = await fetch(`/api/app/documents/${outcome.document.document_id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'could not save review' }));
      toast.show(body.error, 'danger');
      return;
    }
    toast.show('Confirmed and committed', 'success');
    setOutcome(null);
  }

  return (
    <section className="rounded-lg border border-slate/10 p-4">
      <h2 className="mb-3 text-base font-semibold text-slate">Document capture</h2>
      <form onSubmit={handleUpload} className="flex flex-col gap-4">
        <Select id="docType" label="Document type" value={docType} onChange={(e: ChangeEvent<HTMLSelectElement>) => setDocType(e.target.value as typeof docType)}>
          {DOC_TYPES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </Select>
        {docType === 'guardian_id' && (
          <Select id="parentId" label="Whose ID is this?" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— Compare against any linked guardian —</option>
            {guardians.map((g) => (
              <option key={g.parent_id} value={g.parent_id}>
                {g.name}
              </option>
            ))}
          </Select>
        )}
        <label htmlFor="file" className="text-sm font-medium text-slate">
          Photo or file
        </label>
        <input id="file" name="file" type="file" accept="image/*,application/pdf" capture="environment" className="min-h-[44px] text-sm text-slate" />
        <button type="submit" disabled={uploading} className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white disabled:opacity-60">
          {uploading ? 'Uploading…' : 'Upload & scan'}
        </button>
      </form>

      {outcome && (
        <div className="mt-4 border-t border-slate/10 pt-4">
          <p className="mb-2 text-sm font-semibold text-slate">Review before confirming</p>
          {outcome.extractions.length === 0 ? (
            <p className="text-sm text-slate/70">No fields could be pre-filled from this document.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {outcome.extractions.map((ex) => {
                const low = (ex.confidence ?? 0) < LOW_CONFIDENCE_THRESHOLD;
                const decision = decisions[ex.extraction_id];
                return (
                  <li key={ex.extraction_id} className="rounded-md border border-slate/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate">{ex.field_name.replace('_', ' ')}</span>
                      {low && <Badge variant="warning">Low confidence — check this</Badge>}
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate">
                      <input
                        type="checkbox"
                        checked={decision?.accepted ?? true}
                        onChange={(e) =>
                          setDecisions((prev) => ({ ...prev, [ex.extraction_id]: { ...prev[ex.extraction_id], accepted: e.target.checked } }))
                        }
                      />
                      Accept &quot;{ex.extracted_value}&quot;
                    </label>
                    {!decision?.accepted && (
                      <input
                        type="text"
                        value={decision?.correctedValue ?? ''}
                        onChange={(e) =>
                          setDecisions((prev) => ({ ...prev, [ex.extraction_id]: { ...prev[ex.extraction_id], correctedValue: e.target.value } }))
                        }
                        placeholder="Correct value"
                        className="mt-2 min-h-[44px] w-full rounded-md border border-slate/20 px-3 text-sm"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <button type="button" onClick={handleConfirm} className="mt-3 min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white">
            Confirm & commit
          </button>
        </div>
      )}
    </section>
  );
}
