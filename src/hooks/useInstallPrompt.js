import { useEffect, useState } from 'react';

export default function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed,      setInstalled]      = useState(false);
  const [dismissed,      setDismissed]      = useState(
    () => sessionStorage.getItem('install_dismissed') === '1'
  );

  /* iOS: não tem beforeinstallprompt — detecta manualmente */
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;

  useEffect(() => {
    if (isStandalone) { setInstalled(true); return; }

    const handler = e => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const installed = () => setInstalled(true);

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
    };
  }, [isStandalone]);

  async function triggerInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
  }

  function dismiss() {
    sessionStorage.setItem('install_dismissed', '1');
    setDismissed(true);
  }

  const canInstall = !installed && !dismissed && (!!deferredPrompt || (isIos && !isStandalone));

  return { canInstall, isIos, triggerInstall, dismiss };
}
