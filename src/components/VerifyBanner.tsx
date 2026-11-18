import { useState } from 'react';
import { MailCheck, RefreshCw } from 'lucide-react';
import { refreshCurrentUser, resendVerificationEmail } from '../lib/firebase';

interface VerifyBannerProps {
  email: string;
  verified: boolean;
  onVerified: () => void;
}

export function VerifyBanner({ email, verified, onVerified }: VerifyBannerProps) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  if (verified) return null;

  const resend = async () => {
    setBusy(true);
    setMsg('');
    try {
      await resendVerificationEmail();
      setMsg('Verification link sent. Check your inbox and spam folder.');
    } catch (e: any) {
      setMsg(e?.message || 'Could not resend right now. Wait a moment.');
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true);
    setMsg('');
    try {
      const u = await refreshCurrentUser();
      if (u?.emailVerified) {
        onVerified();
      } else {
        setMsg('Email not confirmed yet. Click the link sent to ' + email);
      }
    } catch (e: any) {
      setMsg(e?.message || 'Could not check status.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
        <MailCheck className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
        <div>
          <span className="font-semibold">Confirm your email address</span> to claim your free Forex Signal and free AI Scan.
          <span className="block text-[11px] opacity-80 mt-0.5">{msg || `Sent to ${email}`}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          disabled={busy}
          onClick={resend}
          className="px-3 py-1.5 rounded-lg border border-amber-500/40 text-xs font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-500/15 disabled:opacity-50"
        >
          Resend
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={check}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-semibold hover:bg-amber-400 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
          I&apos;ve confirmed
        </button>
      </div>
    </div>
  );
}
