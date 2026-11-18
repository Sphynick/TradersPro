import { useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, Mail, User, X } from 'lucide-react';
import {
  friendlyAuthError,
  registerWithEmail,
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
} from '../lib/firebase';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const [tab, setTab] = useState<'login' | 'register' | 'forgot'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  if (!open) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setInfo('');
    setLoading(true);
    try {
      if (tab === 'login') {
        await signInWithEmail(email, password);
        onSuccess();
        onClose();
      } else if (tab === 'register') {
        if (password.length < 6) {
          throw new Error('Choose a password with at least 6 characters.');
        }
        await registerWithEmail(name, email, password);
        onSuccess();
        onClose();
      } else {
        await resetPassword(email);
        setInfo('Password reset email sent. Check your inbox and spam folder.');
      }
    } catch (error) {
      setErr(friendlyAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setErr('');
    setInfo('');
    setLoading(true);
    try {
      await signInWithGoogle();
      onSuccess();
      onClose();
    } catch (error) {
      setErr(friendlyAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-5 sm:p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              {tab === 'login' ? 'Sign in to TRADERSPRO254' : tab === 'register' ? 'Create your account' : 'Reset password'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#787B86] mt-0.5">
              One account keeps your bots, signals, orders, and MT5 keys together.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-[#1E222D]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {tab !== 'forgot' && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-black border border-slate-200 dark:border-[#1E222D] mb-4">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setErr('');
                setInfo('');
              }}
              className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'login' ? 'bg-white dark:bg-[#1E222D] text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 dark:text-[#787B86]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register');
                setErr('');
                setInfo('');
              }}
              className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'register' ? 'bg-white dark:bg-[#1E222D] text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 dark:text-[#787B86]'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {err && (
          <div className="mb-3 p-3 rounded-xl bg-[#F23645]/10 border border-[#F23645]/30 text-xs text-[#F23645] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{err}</span>
          </div>
        )}

        {info && (
          <div className="mb-3 p-3 rounded-xl bg-[#089981]/10 border border-[#089981]/30 text-xs text-[#089981] flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{info}</span>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          {tab === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#B2B5BE] mb-1">Full Name</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Samuel Mwangi"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-sm text-slate-900 dark:text-white focus:outline-hidden focus:border-[#2962FF]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-[#B2B5BE] mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-sm text-slate-900 dark:text-white focus:outline-hidden focus:border-[#2962FF]"
              />
            </div>
          </div>

          {tab !== 'forgot' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-600 dark:text-[#B2B5BE]">Password</label>
                {tab === 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setTab('forgot');
                      setErr('');
                      setInfo('');
                    }}
                    className="text-[11px] font-medium text-[#2962FF] hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-sm text-slate-900 dark:text-white focus:outline-hidden focus:border-[#2962FF]"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-[#2962FF] hover:bg-[#1E53E5] disabled:opacity-60 text-white text-sm font-semibold transition-colors"
          >
            {loading
              ? 'Please wait...'
              : tab === 'login'
              ? 'Sign In'
              : tab === 'register'
              ? 'Create Account'
              : 'Send Reset Link'}
          </button>
        </form>

        {tab === 'forgot' ? (
          <button
            type="button"
            onClick={() => setTab('login')}
            className="mt-3 w-full text-center text-xs font-medium text-[#2962FF] hover:underline"
          >
            Back to Sign In
          </button>
        ) : (
          <>
            <div className="my-4 flex items-center gap-3 text-[11px] text-slate-400 dark:text-[#787B86]">
              <div className="h-px flex-1 bg-slate-200 dark:bg-[#1E222D]" />
              <span>OR</span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-[#1E222D]" />
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleGoogle}
              className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-[#131722] hover:bg-slate-100 dark:hover:bg-[#1E222D] text-slate-800 dark:text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z" />
              </svg>
              Continue with Google
            </button>
          </>
        )}
      </div>
    </div>
  );
}
