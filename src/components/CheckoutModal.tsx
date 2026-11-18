import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ClipboardPaste,
  Copy,
  CreditCard,
  ExternalLink,
  Loader2,
  MessageCircle,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react';
import { formatProductPrice } from '../data/catalog';
import { apiFetch } from '../lib/api';
import type { CatalogItem, PaymentMethod, ServerConfig, UserProfile } from '../types/app';

interface CheckoutModalProps {
  open: boolean;
  item: CatalogItem | { id: string; name: string; price: number; desc?: string } | null;
  config: ServerConfig | null;
  user: UserProfile | null;
  onClose: () => void;
  onRequireAuth: () => void;
  onApproved: (botId: string) => void;
}

export function CheckoutModal({
  open,
  item,
  config,
  user,
  onClose,
  onRequireAuth,
  onApproved,
}: CheckoutModalProps) {
  const defaultMethod: PaymentMethod = config?.isKenya
    ? config.payMode === 'stk' && config.mpesaConfigured
      ? 'stk'
      : 'pochi'
    : 'paypal';

  const [method, setMethod] = useState<PaymentMethod>(defaultMethod);
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [mpesaText, setMpesaText] = useState('');
  const [proofId, setProofId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [orderRef, setOrderRef] = useState('');
  const [approved, setApproved] = useState(false);
  const [copied, setCopied] = useState('');
  const pollRef = useRef<any>(null);

  useEffect(() => {
    setMethod(defaultMethod);
    setErr('');
    setStatusMsg('');
    setOrderRef('');
    setApproved(false);
    setBusy(false);
    if (pollRef.current) clearInterval(pollRef.current);
  }, [open, item?.id, defaultMethod]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  if (!open || !item) return null;

  const priceInfo = formatProductPrice(item.price, config);

  const copyText = (val: string, label: string) => {
    navigator.clipboard.writeText(val).catch(() => {});
    setCopied(label);
    setTimeout(() => setCopied(''), 1800);
  };

  const startPoll = (ref: string, mode: 'stk' | 'order') => {
    if (pollRef.current) clearInterval(pollRef.current);
    let ticks = 0;
    pollRef.current = setInterval(async () => {
      ticks++;
      if (ticks > 90) {
        clearInterval(pollRef.current);
        return;
      }
      try {
        if (mode === 'stk') {
          const r = await apiFetch(`/status?ref=${encodeURIComponent(ref)}`);
          if (r.paid) {
            clearInterval(pollRef.current);
            setApproved(true);
            setStatusMsg('Payment confirmed! Your access is now unlocked.');
            onApproved(item.id);
          } else if (r.final) {
            clearInterval(pollRef.current);
            setBusy(false);
            setErr(r.status || 'M-Pesa prompt was not completed.');
          }
        } else {
          const r = await apiFetch(`/order/status?ref=${encodeURIComponent(ref)}`);
          if (r.approved) {
            clearInterval(pollRef.current);
            setApproved(true);
            setStatusMsg('Order approved! Unlocked on your account.');
            onApproved(item.id);
          } else if (r.status === 'rejected') {
            clearInterval(pollRef.current);
            setBusy(false);
            setErr(r.rejectReason ? `Order rejected: ${r.rejectReason}` : 'Order could not be verified.');
          }
        }
      } catch {}
    }, 3000);
  };

  const handleStkPush = async () => {
    if (!user) return onRequireAuth();
    setErr('');
    setStatusMsg('');
    setBusy(true);
    try {
      const r = await apiFetch('/charge', {
        method: 'POST',
        json: { botId: item.id, phone },
      });
      setOrderRef(r.reference);
      setStatusMsg(r.message || 'Check your phone and enter your M-Pesa PIN.');
      startPoll(r.reference, 'stk');
    } catch (e: any) {
      setErr(e.message || 'Could not start M-Pesa prompt.');
      setBusy(false);
    }
  };

  const handleManualOrder = async (kind: 'pochi' | 'paypal' | 'usdt') => {
    if (!user) return onRequireAuth();
    setErr('');
    setStatusMsg('');
    setBusy(true);
    try {
      const payload =
        kind === 'pochi'
          ? { botId: item.id, method: 'pochi', whatsapp, mpesa: mpesaText }
          : { botId: item.id, method: kind, whatsapp, proof: proofId };
      const r = await apiFetch('/order', { method: 'POST', json: payload });
      setOrderRef(r.ref);
      if (r.approved) {
        setApproved(true);
        setStatusMsg('Payment confirmed automatically! Unlocked on your account.');
        onApproved(item.id);
      } else {
        setStatusMsg('Order received! We are verifying it and will unlock your account automatically once approved.');
        startPoll(r.ref, 'order');
      }
    } catch (e: any) {
      setErr(e.message || 'Could not submit order.');
    } finally {
      setBusy(false);
    }
  };

  const handlePayPalExpress = async () => {
    if (!user) return onRequireAuth();
    setErr('');
    setStatusMsg('');
    setBusy(true);
    try {
      const r = await apiFetch('/paypal/create-order', {
        method: 'POST',
        json: {
          botId: item.id,
          returnUrl: `${window.location.origin}/?paypal=success&bot=${encodeURIComponent(item.id)}`,
          cancelUrl: `${window.location.origin}/?paypal=cancel`,
        },
      });
      if (r.approveUrl) {
        window.location.href = r.approveUrl;
        return;
      }
      setErr('PayPal did not return a checkout link.');
    } catch (e: any) {
      setErr(e.message || 'Could not start PayPal checkout.');
    } finally {
      setBusy(false);
    }
  };

  const waSupportUrl = config?.whatsapp
    ? `https://wa.me/${config.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
        `Hi TRADERSPRO254, I need help paying for ${item.name} (${orderRef || priceInfo.primary}). Account: ${user?.email || ''}`
      )}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#2962FF]">Unlock Tool</div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">{item.name}</h2>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                {priceInfo.primary}
              </span>
              {priceInfo.secondary && (
                <span className="text-xs text-slate-500 dark:text-[#787B86]">{priceInfo.secondary}</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-[#1E222D]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!user && (
          <div className="rounded-xl border border-[#2962FF]/30 bg-[#2962FF]/10 p-3 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-700 dark:text-[#D1D4DC]">Sign in first so your purchase attaches to your account.</span>
            <button
              type="button"
              onClick={onRequireAuth}
              className="px-3 py-1.5 rounded-lg bg-[#2962FF] text-white text-xs font-semibold shrink-0"
            >
              Sign In
            </button>
          </div>
        )}

        {/* Payment Method Selector */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {config?.payMode !== 'stk' && (
            <button
              type="button"
              onClick={() => setMethod('pochi')}
              className={`py-2 px-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                method === 'pochi'
                  ? 'border-[#2962FF] bg-[#2962FF]/12 text-[#2962FF]'
                  : 'border-slate-200 dark:border-[#1E222D] text-slate-600 dark:text-[#787B86]'
              }`}
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              M-Pesa Pochi
            </button>
          )}
          {(config?.mpesaConfigured || config?.paystackConfigured) && config?.payMode !== 'manual' && (
            <button
              type="button"
              onClick={() => setMethod('stk')}
              className={`py-2 px-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                method === 'stk'
                  ? 'border-[#2962FF] bg-[#2962FF]/12 text-[#2962FF]'
                  : 'border-slate-200 dark:border-[#1E222D] text-slate-600 dark:text-[#787B86]'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              STK Prompt
            </button>
          )}
          <button
            type="button"
            onClick={() => setMethod('paypal')}
            className={`py-2 px-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 ${
              method === 'paypal'
                ? 'border-[#2962FF] bg-[#2962FF]/12 text-[#2962FF]'
                : 'border-slate-200 dark:border-[#1E222D] text-slate-600 dark:text-[#787B86]'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            PayPal (${priceInfo.usd})
          </button>
          {config?.usdtAddress && (
            <button
              type="button"
              onClick={() => setMethod('usdt')}
              className={`py-2 px-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                method === 'usdt'
                  ? 'border-[#2962FF] bg-[#2962FF]/12 text-[#2962FF]'
                  : 'border-slate-200 dark:border-[#1E222D] text-slate-600 dark:text-[#787B86]'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              USDT
            </button>
          )}
        </div>

        {approved ? (
          <div className="rounded-xl border border-[#089981]/30 bg-[#089981]/10 p-4 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-[#089981] mx-auto" />
            <div className="text-sm font-bold text-slate-900 dark:text-white">{statusMsg}</div>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 px-5 py-2 rounded-xl bg-[#089981] text-white text-xs font-semibold"
            >
              Start Using Now
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {err && (
              <div className="p-3 rounded-xl bg-[#F23645]/10 border border-[#F23645]/30 text-xs text-[#F23645]">
                {err}
              </div>
            )}
            {statusMsg && (
              <div className="p-3 rounded-xl bg-[#2962FF]/10 border border-[#2962FF]/30 text-xs text-slate-800 dark:text-[#D1D4DC] flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#2962FF] shrink-0" />
                <span>{statusMsg}</span>
              </div>
            )}

            {method === 'stk' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#B2B5BE] mb-1">
                    Safaricom M-Pesa Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0712345678"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-sm text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleStkPush}
                  className="w-full py-2.5 rounded-xl bg-[#089981] hover:bg-[#06806B] disabled:opacity-60 text-white text-sm font-semibold"
                >
                  {busy ? 'Waiting for M-Pesa PIN...' : `Send ${item.price.toLocaleString()} KSh STK Prompt`}
                </button>
              </div>
            )}

            {method === 'pochi' && (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black p-3.5 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-[#787B86]">Send via M-Pesa Pochi La Biashara to:</span>
                    <button
                      type="button"
                      onClick={() => copyText(config?.pochi || '0758414027', 'pochi')}
                      className="inline-flex items-center gap-1 text-[#2962FF] font-semibold"
                    >
                      <Copy className="w-3 h-3" />
                      {copied === 'pochi' ? 'Copied' : config?.pochi || '0758414027'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-[#787B86]">Exact Amount:</span>
                    <strong className="font-mono text-slate-900 dark:text-white">{item.price.toLocaleString()} KSh</strong>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#B2B5BE] mb-1">Your WhatsApp Number</label>
                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="0712345678"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#B2B5BE] mb-1">
                    Paste Full M-Pesa Confirmation SMS
                  </label>
                  <textarea
                    rows={3}
                    value={mpesaText}
                    onChange={(e) => setMpesaText(e.target.value)}
                    placeholder="TJ12ABC345 Confirmed. Ksh5,000.00 sent to..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleManualOrder('pochi')}
                  className="w-full py-2.5 rounded-xl bg-[#2962FF] hover:bg-[#1E53E5] disabled:opacity-60 text-white text-sm font-semibold"
                >
                  {busy ? 'Submitting...' : 'Confirm M-Pesa Payment'}
                </button>
              </div>
            )}

            {method === 'paypal' && (
              <div className="space-y-3">
                {config?.paypalConfigured && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handlePayPalExpress}
                    className="w-full py-2.5 rounded-xl bg-[#0070BA] hover:bg-[#005EA6] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Pay ${priceInfo.usd} USD Instantly with PayPal
                  </button>
                )}
                <div className="rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black p-3.5 text-xs space-y-2">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {config?.paypalConfigured ? 'Or pay manually to our PayPal email:' : 'Send PayPal payment to:'}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-slate-800 dark:text-[#D1D4DC]">{config?.paypal || 'rutheystepper2024@gmail.com'}</span>
                    <button
                      type="button"
                      onClick={() => copyText(config?.paypal || 'rutheystepper2024@gmail.com', 'pp')}
                      className="text-[#2962FF] font-semibold inline-flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      {copied === 'pp' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div>
                    Amount: <strong className="font-mono text-slate-900 dark:text-white">${priceInfo.usd} USD</strong>
                  </div>
                </div>
                <input
                  type="text"
                  value={proofId}
                  onChange={(e) => setProofId(e.target.value)}
                  placeholder="Paste PayPal Transaction ID"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-xs text-slate-900 dark:text-white"
                />
                <input
                  type="tel"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="WhatsApp number (optional)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-xs text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleManualOrder('paypal')}
                  className="w-full py-2.5 rounded-xl bg-[#2962FF] hover:bg-[#1E53E5] disabled:opacity-60 text-white text-sm font-semibold"
                >
                  Submit PayPal Transaction ID
                </button>
              </div>
            )}

            {method === 'usdt' && config?.usdtAddress && (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black p-3.5 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-[#787B86]">Network: {config.usdtNetwork || 'TRC20'}</span>
                    <strong className="font-mono text-slate-900 dark:text-white">${priceInfo.usd} USDT</strong>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-[11px] break-all text-slate-800 dark:text-[#D1D4DC]">{config.usdtAddress}</code>
                    <button
                      type="button"
                      onClick={() => copyText(config.usdtAddress, 'usdt')}
                      className="text-[#2962FF] font-semibold shrink-0"
                    >
                      {copied === 'usdt' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={proofId}
                  onChange={(e) => setProofId(e.target.value)}
                  placeholder="Paste USDT Transaction Hash (TxID)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-xs text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleManualOrder('usdt')}
                  className="w-full py-2.5 rounded-xl bg-[#2962FF] hover:bg-[#1E53E5] disabled:opacity-60 text-white text-sm font-semibold"
                >
                  Submit USDT Transaction Hash
                </button>
              </div>
            )}
          </div>
        )}

        {waSupportUrl && (
          <a
            href={waSupportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-xs font-medium text-[#089981] hover:underline pt-1"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Need help with payment? Message WhatsApp Support
          </a>
        )}
      </div>
    </div>
  );
}
