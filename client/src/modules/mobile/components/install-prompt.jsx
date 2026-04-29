'use client';

import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

export function InstallPrompt() {
  const { t } = useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (isInstalled || dismissed || !deferredPrompt) return null;

  const handleInstall = async () => {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <div
      className={cn(
        'fixed bottom-20 inset-x-4 z-50 rounded-xl p-4',
        'bg-primary text-primary-foreground shadow-lg',
        'flex items-center gap-3'
      )}
    >
      <Download className="h-6 w-6 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">
          {t('mobile.install.title', 'App installieren')}
        </p>
        <p className="text-xs opacity-80">
          {t('mobile.install.desc', 'Für Offline-Zugriff und Push-Benachrichtigungen')}
        </p>
      </div>
      <button
        onClick={handleInstall}
        className="shrink-0 px-3 py-1.5 rounded-lg bg-white/20 text-sm font-medium hover:bg-white/30 transition-colors"
      >
        {t('mobile.install.button', 'Installieren')}
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 p-1 rounded hover:bg-white/20"
        aria-label="Schliessen"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
