'use client';

import { useEffect, useState } from 'react';
import { AlertSetup } from './AlertSetup';
import { readChoice } from '@/lib/alerts';
import { FuelIcon } from './icons';

const SEEN = 'first-run-seen';

/** The first thing a new visitor sees, once.
 *
 *  Opening to an empty station list teaches the wrong lesson — that the app
 *  has nothing — and most people never come back to find out otherwise. So the
 *  first screen explains what the platform is, what it can do for them today,
 *  and asks for the two answers that make every later notification possible.
 *
 *  Shown once ever: dismissing counts, and so does having already chosen, so
 *  someone who set alerts on the website never sees it again in the app. */
export function FirstRun() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN) || readChoice()) return;
    } catch {
      return; // private mode: never trap someone in a screen we cannot remember
    }
    setShow(true);
  }, []);

  useEffect(() => {
    document.body.style.overflow = show ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [show]);

  function close() {
    try {
      localStorage.setItem(SEEN, '1');
    } catch {
      /* nothing to remember it with; it simply shows again */
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-slate-50"
      role="dialog"
      aria-modal="true"
      aria-label="مرحباً بك في المحطة التقنية"
    >
      <div className="mx-auto max-w-md px-4 pb-10 pt-[calc(env(safe-area-inset-top)+2rem)]">
        <div className="text-center">
          <FuelIcon className="mx-auto h-10 w-10 text-brand" />
          <h1 className="mt-3 text-xl font-extrabold text-slate-800">المحطة التقنية</h1>
          <p className="mt-1 text-sm font-bold text-brand">التقنية حق للجميع</p>
        </div>

        <div className="card mt-5 p-5">
          <p className="text-sm font-bold text-slate-800">كيف تعمل؟</p>
          <ol className="mt-3 space-y-3">
            <Step n={1}>
              أصحاب المحطات في الأنبار يسجّلون محطاتهم ويحدّثون توفر الوقود بأنفسهم.
            </Step>
            <Step n={2}>
              أنت تختار <b>مدينتك</b> و<b>نوع الوقود</b> الذي يهمك — مرة واحدة.
            </Step>
            <Step n={3}>
              يصلك <b>إشعار على هاتفك</b> فور توفر ما اخترته، فلا تدور ولا تسأل.
            </Step>
          </ol>

          <p className="mt-4 rounded-xl bg-brand-50 p-3 text-xs leading-relaxed text-brand-900">
            المنصة بدأت للتو والمحطات تُسجَّل تباعاً. اختر الآن، وسنخبرك أول ما تصل محطة
            في مدينتك — لا داعي لفتح التطبيق كل يوم.
          </p>
        </div>

        <div className="mt-4">
          <AlertSetup onSaved={close} />
        </div>

        <button
          type="button"
          onClick={close}
          className="mt-4 min-h-[44px] w-full text-center text-sm font-semibold text-slate-500"
        >
          تخطّي الآن
        </button>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
        {n}
      </span>
      <span className="pt-0.5 text-sm leading-relaxed text-slate-700">{children}</span>
    </li>
  );
}
