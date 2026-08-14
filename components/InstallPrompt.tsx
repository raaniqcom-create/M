'use client';

import { useEffect, useState } from 'react';
import { XIcon } from './icons';
import { detectPlatform, storeUrl, type Platform } from '@/lib/stores';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED = 'install-dismissed';

/** Offers the real app in the visitor's own store, one tap, no instructions.
 *
 *  Both listings are public now, so the old flow — "add to home screen" on
 *  iPhone, sideload an APK on Android — is strictly worse than the store on
 *  every axis a visitor cares about: fewer steps, no scary unknown-source
 *  warning, and push notifications that actually work. The PWA install stays
 *  as the fallback for desktop and anything we don't recognise, where there is
 *  no store to send them to. */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<Platform>('other');
  const [show, setShow] = useState(false);

  useEffect(() => {
    // running as an installed app (PWA or a native shell) → never nag.
    // The native shell is a plain WebView, so display-mode is *not* standalone
    // there — ask Capacitor directly or the banner offers to install an app
    // the user is already looking at.
    const native = (
      window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
    ).Capacitor?.isNativePlatform?.();
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (native || standalone || localStorage.getItem(DISMISSED)) return;

    let active = true;
    let onPrompt: ((e: Event) => void) | undefined;

    // Someone who installed the app may still open the site in Chrome, where
    // standalone is false. Ask the platform before offering an app they
    // already have — and wait for the answer, since arming the listener first
    // would let the banner flash before the check returns.
    async function alreadyHasNativeApp(): Promise<boolean> {
      const query = (
        navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> }
      ).getInstalledRelatedApps;
      if (!query) return false;
      try {
        return (await query.call(navigator)).length > 0;
      } catch {
        return false;
      }
    }

    alreadyHasNativeApp().then((installed) => {
      if (!active || installed) return;

      const p = detectPlatform();
      setPlatform(p);

      // A phone has a store — show immediately, no event to wait for.
      if (storeUrl(p)) {
        setShow(true);
        return;
      }

      // Desktop: the PWA is all there is, and Chrome decides when it qualifies.
      onPrompt = (e: Event) => {
        e.preventDefault();
        setDeferred(e as BeforeInstallPromptEvent);
        setShow(true);
      };
      window.addEventListener('beforeinstallprompt', onPrompt);
    });

    return () => {
      active = false;
      if (onPrompt) window.removeEventListener('beforeinstallprompt', onPrompt);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED, '1');
    setShow(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setShow(false);
  }

  if (!show) return null;

  const store = storeUrl(platform);
  const storeName = platform === 'ios' ? 'App Store' : 'Google Play';

  return (
    <div className="fixed inset-x-0 bottom-10 z-50 px-4 pb-2">
      <div className="mx-auto max-w-md rounded-2xl border border-brand-100 bg-white p-4 shadow-lift">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={44} height={44} className="rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">المحطة التقنية</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {store
                ? 'حمّله مجاناً، ويصلك تنبيه فور وصول الوقود.'
                : 'افتحها كتطبيق، واستقبل تنبيهات وصول الوقود فوراً.'}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="إغلاق"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {store ? (
          <a
            href={store}
            target="_blank"
            rel="noopener noreferrer"
            onClick={dismiss}
            className="btn-primary mt-3 w-full"
          >
            تحميل من {storeName}
          </a>
        ) : (
          <button type="button" onClick={install} className="btn-primary mt-3 w-full">
            تثبيت التطبيق
          </button>
        )}
      </div>
    </div>
  );
}
