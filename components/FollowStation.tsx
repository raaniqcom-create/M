'use client';

import { useEffect, useState } from 'react';
import {
  ALERTS_CHANGED,
  followStation,
  isFollowing,
  unfollowStation,
} from '@/lib/alerts';
import { BellIcon, BellRingIcon, CheckIcon, SpinnerIcon } from './icons';
import { detectPlatform, storeUrl } from '@/lib/stores';

/** "Tell me when THIS station has fuel" — the question people arrive at a
 *  station page holding.
 *
 *  Until now the page answered it with nothing: call, directions, report,
 *  rate the queue. So they went looking, found «سجّل محطتك مجاناً» on every
 *  screen, and registered a station they did not own — «الرحاب» four times in
 *  seventy-one minutes, every row with zero products ever switched on.
 *
 *  Sits at the top of the page, not the bottom: someone who has to scroll to
 *  find it has already left to look elsewhere, which is the whole failure. */
export function FollowStation({ stationId, city }: { stationId: string; city: string }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [store, setStore] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setOn(isFollowing(stationId));
    sync();
    setStore(storeUrl(detectPlatform()));
    // «إيقاف التنبيهات» elsewhere clears the follows too, so this must not go
    // on claiming the person still follows the station.
    window.addEventListener(ALERTS_CHANGED, sync);
    return () => window.removeEventListener(ALERTS_CHANGED, sync);
  }, [stationId]);

  async function toggle() {
    setBusy(true);
    setError(null);
    setUnsupported(false);
    try {
      if (on) {
        if (!(await unfollowStation(stationId))) {
          setError('تعذّر الإلغاء. تأكد من الاتصال وأعد المحاولة.');
          return;
        }
        setOn(false);
        return;
      }

      const result = await followStation(stationId);
      if (result === 'ok') {
        setOn(true);
        return;
      }
      setUnsupported(result === 'unsupported');
      setError(
        result === 'denied'
          ? 'الإشعارات ممنوعة لهذا التطبيق. فعّلها من إعدادات هاتفك ثم أعد المحاولة.'
          : result === 'unsupported'
            ? 'هذا المتصفح لا يدعم الإشعارات — حمّل التطبيق لتصلك التنبيهات.'
            : result === 'pending'
              ? 'التسجيل لم يكتمل بعد. انتظر لحظة وأعد المحاولة.'
              : 'تعذّر حفظ المتابعة. تأكد من الاتصال وأعد المحاولة.'
      );
    } catch {
      setError('تعذّر حفظ المتابعة. تأكد من الاتصال وأعد المحاولة.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-3">
      {on ? (
        <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
          <p className="flex items-center gap-2 text-sm font-extrabold text-brand-900">
            <CheckIcon className="h-5 w-5 shrink-0 text-brand" />
            أنت تتابع هذه المحطة
          </p>
          <p className="mt-1 text-xs leading-relaxed text-brand-900/80">
            يصلك إشعار فور إعلانها توفّر الوقود.
          </p>
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            className="mt-2 min-h-[44px] pt-2 text-xs font-bold text-slate-500 underline"
          >
            {busy && <SpinnerIcon className="ml-1 inline h-3.5 w-3.5" />}
            إلغاء المتابعة
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className="btn-primary w-full flex-col !items-start gap-0.5 py-3 text-right"
        >
          <span className="flex items-center gap-2 text-sm font-extrabold">
            {busy ? <SpinnerIcon className="h-4 w-4" /> : <BellRingIcon className="h-4 w-4" />}
            تابع هذه المحطة
          </span>
          <span className="text-[11px] font-medium text-white/80">
            يصلك إشعار فور توفّر الوقود فيها — بلا حساب ولا رقم
          </span>
        </button>
      )}

      {/* The upgrade, kept visible in both states: following one station is
          what they asked for, hearing about the whole city is usually what
          serves them. Offered, never substituted. */}
      <a
        href="/alerts"
        className="mt-2 flex min-h-[44px] items-center justify-center gap-1.5 pt-1 text-xs font-semibold text-brand"
      >
        <BellIcon className="h-4 w-4" />
        أو تابع كل محطات {city}
      </a>

      {error && (
        <div className="mt-2 rounded-xl bg-red-50 p-3">
          <p className="text-xs leading-relaxed text-red-700">{error}</p>
          {unsupported && store && (
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
    </section>
  );
}
