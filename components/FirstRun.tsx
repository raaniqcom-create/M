'use client';

import { useEffect, useState } from 'react';
import { AlertChips } from './AlertChips';
import { readChoice, saveChoice } from '@/lib/alerts';
import { getTone, previewTone, setTone, TONES, type Tone } from '@/lib/alertSound';
import { detectPlatform, storeUrl } from '@/lib/stores';
import { BellIcon, CheckIcon, FuelIcon, SpinnerIcon } from './icons';
import type { FuelProduct } from '@/types/database';

const SEEN = 'first-run-seen';
const READ_SECONDS = 5;

type Permission = 'unknown' | 'granted' | 'denied' | 'unsupported';

/** Asks the OS for permission, on a deliberate tap, at the step that explains
 *  it. Both platforms ask exactly once in the lifetime of an install: refuse
 *  and there is no second chance without a trip into system settings. That
 *  makes it the single most expensive tap in the product, so it is never fired
 *  on page load. */
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

  if (typeof Notification === 'undefined' || !('PushManager' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return (await Notification.requestPermission()) === 'granted' ? 'granted' : 'denied';
}

/** Three steps, once, before the app opens.
 *
 *  Opening straight onto an empty station list teaches a new visitor the wrong
 *  lesson — that the app has nothing — and most never come back to find out
 *  otherwise. So: what this is, what you want to hear about, then permission.
 *  The order matters. Asking for the notification permission before the driver
 *  has named a city and a fuel is asking him to accept an interruption he has
 *  no reason to want yet. */
export function FirstRun() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(1);
  const [left, setLeft] = useState(READ_SECONDS);

  const [cities, setCities] = useState<string[]>([]);
  const [products, setProducts] = useState<FuelProduct[]>([]);

  const [permission, setPermission] = useState<Permission>('unknown');
  const [tone, setToneState] = useState<Tone>('2');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN) || readChoice()) return;
    } catch {
      return; // private mode: never trap someone in a screen we cannot remember
    }
    setToneState(getTone());
    setShow(true);
  }, []);

  // A five-second hold on the first step only. Long enough that the three
  // lines get read rather than tapped past; short enough not to feel like a
  // toll. No hold on the steps that ask the driver for something.
  useEffect(() => {
    if (!show || step !== 1 || left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [show, step, left]);

  useEffect(() => {
    document.body.style.overflow = show ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [show]);

  // Coming back from the Settings app resumes the WebView without remounting,
  // so nothing would otherwise re-read the permission just granted.
  useEffect(() => {
    if (!show || permission !== 'denied') return;
    const recheck = async () => {
      if (document.visibilityState === 'visible') setPermission(await askPermission());
    };
    document.addEventListener('visibilitychange', recheck);
    return () => document.removeEventListener('visibilitychange', recheck);
  }, [show, permission]);

  function close() {
    try {
      localStorage.setItem(SEEN, '1');
    } catch {
      /* nothing to remember it with; it simply shows again */
    }
    setShow(false);
  }

  function chooseTone(t: Tone) {
    setTone(t);
    setToneState(t);
    previewTone(t); // only on a deliberate tap — never on open
  }

  /** The last step does both: the permission the OS needs, then the rows the
   *  server needs. Saving before permission would store a subscription with no
   *  device to deliver it to. */
  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const p = permission === 'granted' ? 'granted' : await askPermission();
      setPermission(p);
      if (p !== 'granted') {
        setError(
          p === 'unsupported'
            ? 'هذا المتصفح لا يدعم الإشعارات — حمّل التطبيق لتصلك التنبيهات.'
            : 'لم يُمنح الإذن. فعّله من إعدادات هاتفك ثم ارجع — سنتحقق تلقائياً.'
        );
        return;
      }

      const result = await saveChoice({ cities, products });
      if (result !== 'ok') {
        setError(
          result === 'pending'
            ? 'التسجيل لم يكتمل بعد. انتظر لحظة وأعد المحاولة.'
            : 'تعذّر الحفظ. تأكد من الاتصال وأعد المحاولة.'
        );
        return;
      }
      close();
    } catch {
      setError('تعذّر الحفظ. تأكد من الاتصال وأعد المحاولة.');
    } finally {
      setBusy(false);
    }
  }

  if (!show) return null;

  const store = storeUrl(detectPlatform());

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

        <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden>
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                n === step ? 'w-6 bg-brand' : n < step ? 'w-1.5 bg-brand' : 'w-1.5 bg-slate-300'
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <>
            <div className="card mt-4 p-5">
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

            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={left > 0}
              className="btn-primary mt-4 w-full disabled:opacity-50"
            >
              {left > 0 ? `التالي (${left})` : 'التالي'}
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="card mt-4 p-5">
              <div className="flex items-center gap-2">
                <BellIcon className="h-5 w-5 text-brand" />
                <h2 className="text-base font-bold">نبّهني عند توفر الوقود</h2>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                اختر مدينتك ونوع الوقود الذي يهمك. أول ما تسجّل محطة ويتوفر المنتج، يصلك
                إشعار فوراً — بلا حساب وبلا رقم هاتف.
              </p>
              <AlertChips
                cities={cities}
                products={products}
                onCities={setCities}
                onProducts={setProducts}
              />
            </div>

            <button type="button" onClick={() => setStep(3)} className="btn-primary mt-4 w-full">
              التالي
            </button>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="mt-2 min-h-[44px] w-full text-center text-sm font-semibold text-slate-500"
            >
              رجوع
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <div className="card mt-4 p-5">
              <div className="flex items-center gap-2">
                <BellIcon className="h-5 w-5 text-brand" />
                <h2 className="text-base font-bold">فعّل الإشعارات</h2>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                {cities.length || products.length
                  ? `سنرسل لك ${products.length ? 'ما اخترته من وقود' : 'كل المنتجات'} في ${
                      cities.length ? cities.join('، ') : 'كل مدن الأنبار'
                    } — ولا شيء غير ذلك.`
                  : 'لم تختر مدينة أو منتجاً، فسيصلك كل جديد في كل مدن الأنبار. يمكنك تضييقه لاحقاً.'}
              </p>

              {permission === 'granted' && (
                <p className="mt-3 flex items-center gap-2 rounded-xl bg-brand-50 p-3 text-xs font-bold text-brand-700">
                  <CheckIcon className="h-4 w-4" />
                  تم السماح بالإشعارات
                </p>
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

              {error && (
                <div className="mt-4 rounded-xl bg-amber-50 p-3">
                  <p className="text-xs leading-relaxed text-amber-900">{error}</p>
                  {permission === 'unsupported' && store && (
                    <a
                      href={store}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-primary mt-3 w-full"
                    >
                      حمّل التطبيق
                    </a>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={finish}
              disabled={busy}
              className="btn-primary mt-4 w-full disabled:opacity-60"
            >
              {busy ? <SpinnerIcon className="mx-auto h-5 w-5" /> : 'فعّل الإشعارات وابدأ'}
            </button>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="mt-2 min-h-[44px] w-full text-center text-sm font-semibold text-slate-500"
            >
              رجوع
            </button>
          </>
        )}

        <button
          type="button"
          onClick={close}
          className="mt-4 min-h-[44px] w-full text-center text-sm font-semibold text-slate-400"
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
