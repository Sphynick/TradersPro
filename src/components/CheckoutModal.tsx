import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { CheckCircle2, ExternalLink, Loader2, Smartphone, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatKsh, formatUsd, kshToUsd, type CatalogItem } from '../data/catalog.ts';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import type { GeoInfo, PaymentMethod } from '../types/app.ts';

interface CheckoutModalProps {
  item: CatalogItem | null;
  geo: GeoInfo;
  userId: string | null;
  userEmail: string | null;
  onClose: () => void;
  onRequireSignIn: () => void;
  onPaymentConfirmed: (itemId: string) => void;
}

export function CheckoutModal({
  item,
  geo,
  userId,
  userEmail,
  onClose,
  onRequireSignIn,
  onPaymentConfirmed,
}: CheckoutModalProps) {
  const [method, setMethod] = useState<PaymentMethod>(geo.isKenya ? 'mpesa_stk' : 'paypal');
  const [phone, setPhone] = useState('');
  const [reference, setReference] = useState('');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [checkoutReqId, setCheckoutReqId] = useState<string | null>(null);
  const [paypalOrderId, setPaypalOrderId] = useState<string | null>(null);
  const [paypalApproveUrl, setPaypalApproveUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    setMethod(geo.isKenya ? 'mpesa_stk' : 'paypal');
    setOrderId(null);
    setCheckoutReqId(null);
    setPaypalOrderId(null);
    setPaypalApproveUrl(null);
    setStatusMsg('');
    setErrorMsg('');
    setConfirmed(false);
  }, [item, geo.isKenya]);

  if (!item) return null;

  const usdAmount = kshToUsd(item.priceKsh, geo.usdKshRate);

  const createFirestoreOrder = async (chosenMethod: PaymentMethod, refCode: string) => {
    if (!userId || !userEmail) {
      onRequireSignIn();
      return null;
    }
    try {
      const docRef = await addDoc(collection(db, 'orders'), {
        userId,
        userEmail,
        itemId: item.id,
        itemName: item.name.slice(0, 120),
        method: chosenMethod,
        status: 'pending',
        amountKsh: item.priceKsh,
        amountUsd: usdAmount,
        phone: phone.trim().slice(0, 24),
        reference: refCode.trim().slice(0, 128),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return docRef.id;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'orders');
    }
  };

  const handleMpesaStk = async () => {
    if (!userId || !userEmail) {
      onRequireSignIn();
      return;
    }
    setErrorMsg('');
    setStatusMsg('');
    setBusy(true);
    try {
      const newOrderId = orderId || (await createFirestoreOrder('mpesa_stk', 'STK-INIT'));
      if (!newOrderId) return;
      setOrderId(newOrderId);

      const res = await fetch('/api/mpesa/stkpush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          amountKsh: item.priceKsh,
          orderId: newOrderId,
          itemName: item.name,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErrorMsg(data.error || 'Could not start M-Pesa prompt.');
        if (data.configured === false) {
          setStatusMsg('Tip: You can pay right now using M-Pesa Pochi below, or add Daraja keys in Vercel.');
        }
        return;
      }

      setCheckoutReqId(data.checkoutRequestId);
      setStatusMsg(data.customerMessage || 'Check your phone and enter your M-Pesa PIN.');

      try {
        await updateDoc(doc(db, 'orders', newOrderId), {
          phone: phone.trim().slice(0, 24),
          reference: String(data.checkoutRequestId || '').slice(0, 128),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${newOrderId}`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'M-Pesa request failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyMpesaStk = async () => {
    if (!checkoutReqId) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/mpesa/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutRequestId: checkoutReqId }),
      });
      const data = await res.json();
      if (data.status === 'paid') {
        setConfirmed(true);
        setStatusMsg('M-Pesa payment confirmed.');
        onPaymentConfirmed(item.id);
      } else if (data.status === 'failed') {
        setErrorMsg(data.desc || 'Payment was cancelled or failed.');
      } else {
        setStatusMsg(data.desc || 'Still waiting for M-Pesa confirmation. Try again in a few seconds.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to check status.');
    } finally {
      setBusy(false);
    }
  };

  const handleManualPochiSubmit = async () => {
    if (!userId || !userEmail) {
      onRequireSignIn();
      return;
    }
    if (!reference.trim() || reference.trim().length < 5) {
      setErrorMsg('Enter your M-Pesa confirmation code (e.g. UJK492ABCD).');
      return;
    }
    setBusy(true);
    setErrorMsg('');
    try {
      const id = await createFirestoreOrder('mpesa_pochi', reference.trim().toUpperCase());
      if (id) {
        setOrderId(id);
        setConfirmed(true);
        setStatusMsg('Order recorded in Firestore. Admin verification unlocks your account shortly.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePayPalCreate = async () => {
    if (!userId || !userEmail) {
      onRequireSignIn();
      return;
    }
    setErrorMsg('');
    setStatusMsg('');
    setBusy(true);
    try {
      const newOrderId = orderId || (await createFirestoreOrder('paypal', 'PAYPAL-INIT'));
      if (!newOrderId) return;
      setOrderId(newOrderId);

      const res = await fetch('/api/paypal/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountUsd: usdAmount,
          itemName: item.name,
          orderId: newOrderId,
          returnUrl: `${window.location.origin}/?paypal=success`,
          cancelUrl: `${window.location.origin}/?paypal=cancel`,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErrorMsg(data.error || 'Could not create PayPal checkout.');
        return;
      }

      setPaypalOrderId(data.paypalOrderId);
      setPaypalApproveUrl(data.approveUrl);
      setStatusMsg('PayPal order ready. Click "Approve on PayPal", then click "Verify & Capture".');

      try {
        await updateDoc(doc(db, 'orders', newOrderId), {
          reference: String(data.paypalOrderId || '').slice(0, 128),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${newOrderId}`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PayPal initialization failed.');
    } finally {
      setBusy(false);
    }
  };

  const handlePayPalCapture = async () => {
    if (!paypalOrderId) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/paypal/capture-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paypalOrderId }),
      });
      const data = await res.json();
      if (data.ok) {
        setConfirmed(true);
        setStatusMsg('PayPal payment captured successfully.');
        onPaymentConfirmed(item.id);
      } else {
        setErrorMsg(data.error || 'PayPal payment is not completed yet.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Capture failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-title"
    >
      <div className="w-full max-w-lg rounded-lg border border-[#E0E3EB] bg-white p-6 shadow-2xl dark:border-[#1E222D] dark:bg-[#0D1017]">
        <div className="flex items-start justify-between gap-4 border-b border-[#E0E3EB] pb-4 dark:border-[#1E222D]">
          <div>
            <p className="font-mono text-xs font-medium text-[#787B86]">
              {geo.isKenya ? 'Kenyan Checkout · M-Pesa & PayPal' : 'International Checkout · PayPal'}
            </p>
            <h2 id="checkout-title" className="font-display mt-1 text-lg font-bold text-[#131722] dark:text-[#F0F3FA]">
              {item.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close checkout"
            className="inline-flex h-8 w-8 items-center justify-center rounded text-[#787B86] hover:bg-[#F0F3FA] hover:text-[#131722] dark:hover:bg-[#131722] dark:hover:text-[#F0F3FA]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Price Summary */}
        <div className="mt-4 flex items-center justify-between rounded-md border border-[#E0E3EB] bg-[#F8FAFD] px-4 py-3 dark:border-[#1E222D] dark:bg-black">
          <span className="text-sm text-[#5D606B] dark:text-[#787B86]">Total due</span>
          <div className="font-mono text-base font-semibold tabular-nums text-[#131722] dark:text-[#F0F3FA]">
            {formatUsd(item.priceKsh, geo.usdKshRate)}
            {geo.isKenya && (
              <span className="ml-2 text-sm font-normal text-[#787B86]">
                ({formatKsh(item.priceKsh)})
              </span>
            )}
          </div>
        </div>

        {/* Method Tabs */}
        <div className="mt-5 grid grid-cols-3 gap-1 rounded-md border border-[#E0E3EB] bg-[#F0F3FA] p-1 dark:border-[#1E222D] dark:bg-black">
          <button
            type="button"
            onClick={() => setMethod('mpesa_stk')}
            className={`h-8 rounded px-2 text-xs font-medium transition-colors whitespace-nowrap ${
              method === 'mpesa_stk'
                ? 'bg-white text-[#131722] shadow-sm dark:bg-[#2962FF] dark:text-white'
                : 'text-[#5D606B] hover:text-[#131722] dark:text-[#787B86] dark:hover:text-[#D1D4DC]'
            }`}
          >
            M-Pesa STK
          </button>
          <button
            type="button"
            onClick={() => setMethod('mpesa_pochi')}
            className={`h-8 rounded px-2 text-xs font-medium transition-colors whitespace-nowrap ${
              method === 'mpesa_pochi'
                ? 'bg-white text-[#131722] shadow-sm dark:bg-[#2962FF] dark:text-white'
                : 'text-[#5D606B] hover:text-[#131722] dark:text-[#787B86] dark:hover:text-[#D1D4DC]'
            }`}
          >
            M-Pesa Pochi
          </button>
          <button
            type="button"
            onClick={() => setMethod('paypal')}
            className={`h-8 rounded px-2 text-xs font-medium transition-colors whitespace-nowrap ${
              method === 'paypal'
                ? 'bg-white text-[#131722] shadow-sm dark:bg-[#2962FF] dark:text-white'
                : 'text-[#5D606B] hover:text-[#131722] dark:text-[#787B86] dark:hover:text-[#D1D4DC]'
            }`}
          >
            PayPal (USD)
          </button>
        </div>

        {!userId ? (
          <div className="mt-5 rounded-md border border-[#E0E3EB] p-4 text-center dark:border-[#1E222D]">
            <p className="text-sm text-[#5D606B] dark:text-[#9598A1]">
              Sign in with Google so your unlocked bot license stays attached to your Firebase account across devices.
            </p>
            <button
              type="button"
              onClick={onRequireSignIn}
              className="mt-3 inline-flex h-9 items-center rounded-md bg-[#2962FF] px-5 text-xs font-semibold text-white hover:bg-[#1E53E5]"
            >
              Sign in to continue
            </button>
          </div>
        ) : confirmed ? (
          <div className="mt-5 rounded-md border border-[#089981]/40 bg-[#089981]/10 p-5 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-[#089981]" />
            <p className="mt-2 text-sm font-medium text-[#131722] dark:text-[#F0F3FA]">{statusMsg}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 inline-flex h-9 items-center rounded-md bg-[#089981] px-5 text-xs font-semibold text-white hover:bg-[#06806B]"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {method === 'mpesa_stk' && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="mpesa-phone" className="block text-xs font-medium text-[#5D606B] dark:text-[#9598A1]">
                    Safaricom M-Pesa Number
                  </label>
                  <div className="relative mt-1.5">
                    <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#787B86]" />
                    <input
                      id="mpesa-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0712345678 or 254712345678"
                      className="h-10 w-full rounded-md border border-[#E0E3EB] bg-white pl-9 pr-3 font-mono text-sm text-[#131722] focus:border-[#2962FF] focus:outline-none dark:border-[#2A2E39] dark:bg-black dark:text-[#D1D4DC]"
                    />
                  </div>
                </div>

                {!checkoutReqId ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleMpesaStk}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#089981] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#06806B] disabled:opacity-60"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Send M-Pesa Prompt ({formatKsh(item.priceKsh)})
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleVerifyMpesaStk}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#089981] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#06806B] disabled:opacity-60"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Confirm M-Pesa Payment
                  </button>
                )}
              </div>
            )}

            {method === 'mpesa_pochi' && (
              <div className="space-y-4">
                <div className="rounded-md border border-[#E0E3EB] bg-[#F8FAFD] p-4 text-sm dark:border-[#1E222D] dark:bg-black">
                  <p className="font-medium text-[#131722] dark:text-[#F0F3FA]">
                    Send {formatKsh(item.priceKsh)} to M-Pesa Pochi La Biashara
                  </p>
                  <p className="mt-1 font-mono text-base font-semibold text-[#089981]">
                    {geo.pochiNumber}
                  </p>
                  <p className="mt-1 text-xs text-[#787B86]">
                    Enter your M-Pesa SMS transaction code below once sent.
                  </p>
                </div>

                <div>
                  <label htmlFor="pochi-ref" className="block text-xs font-medium text-[#5D606B] dark:text-[#9598A1]">
                    M-Pesa Confirmation Code
                  </label>
                  <input
                    id="pochi-ref"
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. UJK492ABCD"
                    className="mt-1.5 h-10 w-full rounded-md border border-[#E0E3EB] bg-white px-3 font-mono text-sm uppercase text-[#131722] focus:border-[#2962FF] focus:outline-none dark:border-[#2A2E39] dark:bg-black dark:text-[#D1D4DC]"
                  />
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={handleManualPochiSubmit}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#089981] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#06806B] disabled:opacity-60"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Submit M-Pesa Reference
                </button>
              </div>
            )}

            {method === 'paypal' && (
              <div className="space-y-4">
                <p className="text-sm text-[#5D606B] dark:text-[#9598A1]">
                  Pay securely in USD via PayPal or card. Total:{' '}
                  <strong className="font-mono text-[#131722] dark:text-[#F0F3FA]">
                    {formatUsd(item.priceKsh, geo.usdKshRate)}
                  </strong>
                  .
                </p>

                {!paypalOrderId ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handlePayPalCreate}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#2962FF] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#1E53E5] disabled:opacity-60"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Continue with PayPal ({formatUsd(item.priceKsh, geo.usdKshRate)})
                  </button>
                ) : (
                  <div className="space-y-2.5">
                    {paypalApproveUrl && (
                      <a
                        href={paypalApproveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#E0E3EB] bg-white px-4 text-sm font-medium text-[#131722] hover:bg-[#F0F3FA] dark:border-[#2A2E39] dark:bg-black dark:text-[#D1D4DC] dark:hover:bg-[#131722]"
                      >
                        Approve Payment on PayPal
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handlePayPalCapture}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#089981] px-4 text-sm font-semibold text-white hover:bg-[#06806B] disabled:opacity-60"
                    >
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                      Verify & Capture PayPal Payment
                    </button>
                  </div>
                )}
              </div>
            )}

            {statusMsg && (
              <p className="rounded-md border border-[#E0E3EB] bg-[#F8FAFD] px-3 py-2 text-xs text-[#5D606B] dark:border-[#1E222D] dark:bg-black dark:text-[#9598A1]">
                {statusMsg}
              </p>
            )}
            {errorMsg && (
              <p className="rounded-md border border-[#F23645]/30 bg-[#F23645]/10 px-3 py-2 text-xs text-[#F23645]">
                {errorMsg}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
