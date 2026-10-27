'use client';

import { reportCardsPdf } from '@/components/exams/report-card-pdf';
import { downloadBlob, safeFilename } from '@/lib/pdf/browser';
import type { Lang } from '@/lib/i18n';
import { markingSchemeBlocks, printLang, questionPaperBlocks } from '@/lib/papers/print';
import type { PrintData } from '@/lib/papers/types';

// A kept paper's question paper or marking scheme as a PDF, made in the browser on A4 canvases with src/lib/pdf, as
// report cards are (src/components/exams/report-card-pdf.ts): no server, no upload, Hindi through the device's fonts.

export async function downloadPaperPdf(data: PrintData, which: 'paper' | 'scheme', reader: Lang): Promise<void> {
  const lang = printLang(data, reader);
  const blocks = which === 'paper' ? questionPaperBlocks(data, lang) : markingSchemeBlocks(data, lang);
  const name = `${data.examName} ${data.className} ${data.subjectName} ${which === 'paper' ? 'question paper' : 'marking scheme'}`;
  const blob = await reportCardsPdf([blocks], name, `${data.schoolName} · ${data.examName} · ${data.className} · ${data.subjectName}`);
  downloadBlob(blob, safeFilename(name, 'pdf'));
}
