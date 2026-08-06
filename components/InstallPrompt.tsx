'use client';

import { useEffect, useState } from 'react';
import { XIcon } from './icons';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED = 'install-dismissed';

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // already installed → never nag
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone || localStorage.getItem(DISMISSED)) return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIOS(ios);

    // iOS has no install event — Safari only supports the manual Share flow,
    // so show instructions there instead of a button that can't work.
    if (ios) {
      setShow(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
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

  return (
    <div className="fixed inset-x-0 bottom-10 z-50 px-4 pb-2">
      <div className="mx-auto max-w-md rounded-2xl border border-brand-100 bg-white p-4 shadow-lift">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={44} height={44} className="rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">ثبّت المحطة التقنية على هاتفك</p>
            {isIOS ? (
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                اضغط زر المشاركة{' '}
                <span aria-hidden className="mx-0.5 font-bold text-brand">
                  ⎋
                </span>{' '}
                في أسفل سفاري، ثم اختر <span className="font-semibold">«إضافة إلى الشاشة الرئيسية»</span>.
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                افتحها كتطبيق، واستقبل تنبيهات وصول الوقود فوراً.
              </p>
            )}
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

        {!isIOS && (
          <button type="button" onClick={install} className="btn-primary mt-3 w-full">
            تثبيت التطبيق
          </button>
        )}
      </div>
    </div>
  );
}
