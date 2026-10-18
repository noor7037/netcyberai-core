'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { ModulePage, PRIMARY_ACTION, QUIET_ACTION } from '@/components/app-ui/ModulePage';

type TokenState = { tokenId: string; issuedAt: string; qrSvg: string } | null;

export function IdCardView({ studentId, studentName, schoolName, className }: { studentId: string; studentName: string; schoolName: string; className: string | null }) {
  const [token, setToken] = useState<TokenState>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/app/students/${studentId}/qr-token`);
    const body = await res.json();
    setToken(body.token === null ? null : body);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleIssue() {
    const res = await fetch(`/api/app/students/${studentId}/qr-token`, { method: 'POST' });
    if (!res.ok) {
      toast.show('Could not issue a card', 'danger');
      return;
    }
    const body = await res.json();
    setToken(body);
    toast.show('New card issued — any previous card is now inert', 'success');
  }

  async function handleRevoke() {
    if (!token) return;
    const res = await fetch(`/api/app/qr-tokens/${token.tokenId}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'lost' }),
    });
    if (!res.ok) {
      toast.show('Could not revoke card', 'danger');
      return;
    }
    setToken(null);
    toast.show('Card revoked', 'success');
  }

  return (
    <ModulePage
      moduleId="students"
      help="student-id-cards"
      tour="id-card"
      title={`ID card: ${studentName}`}
      purpose="Issue, print, and revoke if lost."
      hideHeaderInPrint
      primary={
        <button type="button" onClick={handleIssue} disabled={loading} className={`${PRIMARY_ACTION} print:hidden`}>
          {token ? 'Reissue (invalidates current card)' : 'Issue ID card'}
        </button>
      }
      more={
        token && (
          <span className="flex flex-wrap gap-2 print:hidden">
            <button type="button" onClick={handleRevoke} className="min-h-[44px] rounded-md border border-red-600/40 bg-white px-4 text-sm font-semibold text-red-800">
              Report lost / revoke
            </button>
            <button type="button" onClick={() => window.print()} className={QUIET_ACTION}>
              Print
            </button>
          </span>
        )
      }
    >
      {loading ? (
        <p role="status" className="text-sm text-slate/70">
          Loading…
        </p>
      ) : !token ? (
        <p className="text-sm text-slate/70">No active ID card.</p>
      ) : (
        <div className="mx-auto flex w-72 flex-col items-center gap-2 rounded-lg border border-slate/20 p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate/70">{schoolName}</p>
          <p className="text-lg font-bold text-slate">{studentName}</p>
          {className && <p className="text-sm text-slate/70">{className}</p>}
          {/* eslint-disable-next-line react/no-danger -- server-generated SVG (qrcode lib), never user input */}
          <div dangerouslySetInnerHTML={{ __html: token.qrSvg }} />
          <p className="text-[10px] text-slate/70">Card is inert if reissued or reported lost.</p>
        </div>
      )}
    </ModulePage>
  );
}
