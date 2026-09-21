'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';

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

  if (loading) return <p className="p-6 text-sm text-slate/70">Loading…</p>;

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex gap-2 print:hidden">
        <button type="button" onClick={handleIssue} className="min-h-[44px] rounded-md bg-sapphire px-4 text-sm font-semibold text-white">
          {token ? 'Reissue (invalidates current card)' : 'Issue ID card'}
        </button>
        {token && (
          <button type="button" onClick={handleRevoke} className="min-h-[44px] rounded-md border border-red-600/40 px-4 text-sm font-semibold text-red-800">
            Report lost / revoke
          </button>
        )}
        {token && (
          <button type="button" onClick={() => window.print()} className="min-h-[44px] rounded-md border border-slate/20 px-4 text-sm font-semibold text-slate">
            Print
          </button>
        )}
      </div>

      {!token ? (
        <p className="text-sm text-slate/70">No active ID card. Issue one to generate a QR code.</p>
      ) : (
        <div className="mx-auto flex w-72 flex-col items-center gap-2 rounded-lg border border-slate/20 p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate/70">{schoolName}</p>
          <p className="text-lg font-bold text-slate">{studentName}</p>
          {className && <p className="text-sm text-slate/70">{className}</p>}
          {/* eslint-disable-next-line react/no-danger -- server-generated SVG (qrcode lib), never user input */}
          <div dangerouslySetInnerHTML={{ __html: token.qrSvg }} />
          <p className="text-[10px] text-slate/50">Card is inert if reissued or reported lost.</p>
        </div>
      )}
    </div>
  );
}
