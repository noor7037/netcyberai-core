import type { StatusTone } from '@/components/app-ui/tones';
import { TICKET_SCREENSHOT_MAX_BYTES, TICKET_SCREENSHOT_TYPES, type TicketSide, type TicketStatus } from '@/lib/contracts/tickets';

// Words and colours the ticket screens share.
export const TICKET_STATUS_TONE: Record<TicketStatus, StatusTone> = {
  open: 'info',
  in_progress: 'ai',
  waiting_on_school: 'warning',
  resolved: 'success',
  closed: 'neutral',
};

// What a status means to the person reading it.
export const TICKET_STATUS_HELP: Record<TicketSide, Record<TicketStatus, string>> = {
  school: {
    open: 'NetCyberAI has your ticket and will pick it up.',
    in_progress: 'NetCyberAI is working on it.',
    waiting_on_school: 'NetCyberAI asked a question. Reply below so work can continue.',
    resolved: 'NetCyberAI marked this solved. Confirm it, or reopen it if it is not.',
    closed: 'This ticket is closed. Reopen it if the problem comes back.',
  },
  platform: {
    open: 'New. Not picked up yet.',
    in_progress: 'Being worked on.',
    waiting_on_school: 'Waiting for the school’s reply; it moves back to in progress when they answer.',
    resolved: 'Marked solved. The school can confirm or reopen.',
    closed: 'Closed.',
  },
};

// The button for each move, by who is pressing it.
export function moveLabel(to: TicketStatus, side: TicketSide): string {
  if (to === 'open') return side === 'school' ? 'Not solved: reopen' : 'Reopen';
  if (to === 'closed') return side === 'school' ? 'Yes, it is solved: close' : 'Close';
  if (to === 'in_progress') return 'Start work';
  if (to === 'waiting_on_school') return 'Waiting on school';
  return 'Mark resolved';
}

export const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
export const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

// Checked before anything is sent; the server checks again by the file's bytes.
export function screenshotProblem(file: { type: string; size: number; name: string }): string | null {
  if (!(TICKET_SCREENSHOT_TYPES as readonly string[]).includes(file.type)) return `${file.name}: use a PNG, JPEG or WebP image.`;
  if (file.size > TICKET_SCREENSHOT_MAX_BYTES) return `${file.name}: larger than 4 MB.`;
  if (file.size === 0) return `${file.name}: the file is empty.`;
  return null;
}

export const FIELD = 'mt-1 min-h-[44px] w-full rounded-md border border-slate/20 bg-white px-3 text-sm font-normal text-slate';
export const AREA = 'mt-1 w-full rounded-md border border-slate/20 bg-white p-3 text-sm font-normal text-slate';
export const PRIMARY = 'inline-flex min-h-[44px] items-center justify-center rounded-md bg-sapphire px-4 text-sm font-semibold text-white disabled:opacity-60';
export const SECONDARY = 'inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-sapphire bg-white px-4 text-sm font-semibold text-sapphire disabled:opacity-60';
export const ALERT = 'rounded-md border border-coral/40 bg-coral/10 p-3 text-sm text-slate';
export const NOTE = 'rounded-md border border-tangerine/40 bg-tangerine/10 p-3 text-sm text-slate';
