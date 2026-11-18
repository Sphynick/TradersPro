import { useEffect, useState } from 'react';
import { Download, WifiOff } from 'lucide-react';
import { registerSW } from 'virtual:pwa-register';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let swInitialized = false;
export function initPwaServiceWorker() {
  if (swInitialized || typeof window === 'undefined') return;
  swInitialized = true;
  try {
    registerSW({
      immediate: true,
      onRegisteredSW() {},
      onRegisterError() {},
    });
  } catch {}
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return isOnline;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    setIsInstalled(standalone);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return choice.outcome === 'accepted';
  };

  const isIos =
    typeof navigator !== 'undefined' &&
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !(window.navigator as { standalone?: boolean }).standalone;

  return { canInstall: Boolean(deferredPrompt) && !isInstalled, isInstalled, isIos, promptInstall };
}

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { canInstall, isInstalled, isIos, promptInstall } = usePWAInstall();
  const [showIosTip, setShowIosTip] = useState(false);

  if (isInstalled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#089981]">
        Installed on this device
      </span>
    );
  }

  if (canInstall) {
    return (
      <button
        type="button"
        onClick={() => void promptInstall()}
        className={`inline-flex items-center gap-1.5 rounded-lg bg-[#2962FF] hover:bg-[#1E53E5] text-white font-semibold transition-colors ${
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-xs'
        }`}
      >
        <Download className="w-3.5 h-3.5" />
        Install App
      </button>
    );
  }

  if (isIos) {
    return (
      <div className="inline-flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={() => setShowIosTip((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-[#2A2E39] px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:hover:bg-[#1E222D]"
        >
          <Download className="w-3.5 h-3.5 text-[#2962FF]" />
          Install on iPhone
        </button>
        {showIosTip && (
          <p className="text-[11px] text-slate-500 dark:text-[#787B86] max-w-xs">
            In Safari, tap the Share button at the bottom and choose <strong>Add to Home Screen</strong>.
          </p>
        )}
      </div>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-700 dark:text-amber-300 px-4 py-1.5 text-xs flex items-center justify-center gap-2">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>You are offline. Cached screens remain visible; live markets and orders require internet.</span>
    </div>
  );
}
