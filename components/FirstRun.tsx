'use client';

import { useEffect, useState } from 'react';
import { AlertSetup } from './AlertSetup';
import { readChoice } from '@/lib/alerts';
import { getTone, previewTone, setTone, TONES, type Tone } from '@/lib/alertSound';
import { BellIcon, FuelIcon } from './icons';

const SEEN = 'first-run-seen';

type Permission = 'unknown' | 'granted' | 'denied' | 'unsupported';

/** Asks the OS for permission, on this screen, on a deliberate tap.
 *
 *  Both platforms only ever ask once — a prompt fired on page load, before the
 *  person knows what the app is for, is the single most expensive tap in the
 *  product: refuse it and there is no second chance without a trip into system
 *  settings. So it is asked here, after the three lines explaining why. */
async function askPermission(): Promise<Permission> {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;

  if (cap?.isNativePlatform?.()) {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      let status = await PushNotifications.checkPermissions();
      if (status.receive !== 'granted') status = await PushNotifications.requestPermissions();
      if (status.receive !== 'granted') return 'denied';
      await PushNotifications.register();
      return 'granted';
    } catch {
      return 'unsupported';
    }
  }

  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  return (await Notification.requestPermission()) === 'granted' ? 'granted' : 'denied';
}

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
  const [permission, setPermission] = useState<Permission>('unknown');
  const [asking, setAsking] = useState(false);
  const [tone, setToneState] = useState<Tone>('2');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setToneState(getTone());
  }, []);

  async function grant() {
    setAsking(true);
    setPermission(await askPermission());
    setAsking(false);
  }

  function chooseTone(t: Tone) {
    setTone(t);
    setToneState(t);
    previewTone(t); // only on a deliberate tap — never on open
  }

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN) || readChoice()) return;
    } catch {
      return; // private mode: never trap someone in a screen we cannot remember
    }
    setShow(true);
  }, []);

  // Coming back from the Settings app resumes the WebView without remounting,
  // so nothing would ever re-read the permission the user just granted.
  useEffect(() => {
    if (!show || permission !== 'denied') return;
    const recheck = () => {
      if (document.visibilityState === 'visible') void grant();
    };
    document.addEventListener('visibilitychange', recheck);
    return () => document.removeEventListener('visibilitychange', recheck);
  }, [show, permission]);

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

        <div className="card mt-4 p-5">
          <div className="flex items-center gap-2">
            <BellIcon className="h-5 w-5 text-brand" />
            <h2 className="text-base font-bold">اسمح بالإشعارات</h2>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            بدونها لن يصلك شيء. لا نرسل إلا ما اخترته، ويمكنك إيقافها متى شئت.
          </p>

          {permission === 'granted' ? (
            <p className="mt-3 rounded-xl bg-brand-50 p-3 text-xs font-bold text-brand-700">
              ✅ تم السماح بالإشعارات
            </p>
          ) : permission === 'denied' ? (
            <>
              <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                رُفض الإذن. افتح <b>إعدادات الهاتف ← المحطة التقنية ← الإشعارات</b> وفعّلها،
                ثم ارجع — سنتحقق تلقائياً.
              </p>
              <button
                type="button"
                onClick={grant}
                disabled={asking}
                className="btn-ghost mt-2 w-full disabled:opacity-60"
              >
                أعدت التفعيل — تحقّق الآن
              </button>
            </>
          ) : permission === 'unsupported' ? (
            <p className="mt-3 rounded-xl bg-slate-100 p-3 text-xs leading-relaxed text-slate-600">
              هذا المتصفح لا يدعم الإشعارات. حمّل التطبيق لتصلك التنبيهات.
            </p>
          ) : (
            <button
              type="button"
              onClick={grant}
              disabled={asking}
              className="btn-primary mt-3 w-full disabled:opacity-60"
            >
              {asking ? 'جارٍ الطلب…' : 'اسمح بالإشعارات'}
            </button>
          )}

          <p className="mt-4 text-xs font-bold text-slate-700">نغمة التنبيه</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {TONES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => chooseTone(t)}
                aria-pressed={tone === t}
                className={`min-h-[44px] rounded-xl border text-xs font-bold transition-colors ${
                  tone === t
                    ? 'border-brand bg-brand-100 text-brand'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                النغمة {t === '1' ? '١' : '٢'}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">اضغط لتسمعها، واختر ما يناسبك.</p>
        </div>

        <div className="mt-4">
          <AlertSetup onSaved={() => setDone(true)} />
        </div>

        {done ? (
          <button type="button" onClick={close} className="btn-primary mt-4 w-full">
            تم — اعرض المحطات
          </button>
        ) : (
          <button
            type="button"
            onClick={close}
            className="mt-4 min-h-[44px] w-full text-center text-sm font-semibold text-slate-500"
          >
            تخطّي الآن
          </button>
        )}
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
