'use client';

import { useEffect, useState } from 'react';
import {
  ALERTS_CHANGED,
  NO_PREFS,
  pausedFor,
  readPrefs,
  savePrefs,
  type AlertPrefs,
} from '@/lib/alerts';
import { BellIcon, CheckIcon, SpinnerIcon } from './icons';

/** When this phone may ring.
 *
 *  A user wrote: "I already filled my tank — there should be hours for
 *  receiving notifications, not one every day." Both halves of that are here,
 *  because they are different problems. Hours answer "never at 2am". The pause
 *  answers "not this week, I am full" — which no daily window can express.
 *
 *  Nothing here is on by default. 655 people subscribed under the old rules and
 *  did not ask for a curfew; imposing one on them would be a decision made for
 *  them, and the one thing this whole change is about is giving it back. */
export function AlertTiming() {
  const [prefs, setPrefs] = useState<AlertPrefs>(NO_PREFS);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const sync = () => setPrefs(readPrefs());
    sync();
    window.addEventListener(ALERTS_CHANGED, sync);
    return () => window.removeEventListener(ALERTS_CHANGED, sync);
  }, []);

  async function apply(next: AlertPrefs) {
    setBusy(true);
    setFailed(false);
    const ok = await savePrefs(next);
    if (ok) setPrefs(next);
    else setFailed(true);
    setBusy(false);
  }

  const pausedUntil = prefs.pausedUntil ? new Date(prefs.pausedUntil) : null;
  const paused = pausedUntil !== null && pausedUntil.getTime() > Date.now();
  const limited = prefs.from !== null && prefs.to !== null;

  const when = (d: Date) =>
    new Intl.DateTimeFormat('ar', {
      timeZone: 'Asia/Baghdad',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);

  const hourLabel = (m: number) =>
    new Intl.DateTimeFormat('ar', { hour: '2-digit', hour12: true, timeZone: 'UTC' }).format(
      new Date(Date.UTC(2000, 0, 1, Math.floor(m / 60)))
    );

  return (
    <section className="card mt-4 p-5">
      <div className="flex items-center gap-2">
        <BellIcon className="h-5 w-5 text-brand" />
        <h2 className="text-base font-bold">متى يصلك الإشعار</h2>
      </div>

      {/* ---- the pause ---- */}
      {paused ? (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-extrabold text-amber-900">الإشعارات موقوفة مؤقتاً</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900">
            تعود تلقائياً {when(pausedUntil!)}. لا حاجة لتذكّر شيء.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => apply({ ...prefs, pausedUntil: null })}
            className="btn-ghost mt-3 w-full text-xs"
          >
            {busy && <SpinnerIcon className="h-4 w-4" />}
            استأنفها الآن
          </button>
        </div>
      ) : (
        <>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            عبّأت خزانك ولا تحتاجها الآن؟ أوقفها، وتعود وحدها.
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              { d: 1, label: 'يوم' },
              { d: 3, label: '٣ أيام' },
              { d: 7, label: 'أسبوع' },
            ].map(({ d, label }) => (
              <button
                key={d}
                type="button"
                disabled={busy}
                onClick={() => apply({ ...prefs, pausedUntil: pausedFor(d) })}
                className="min-h-[44px] rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 disabled:opacity-60"
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ---- the daily window ---- */}
      <p className="mt-5 text-xs font-bold text-slate-700">ساعات الاستقبال</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy}
          aria-pressed={!limited}
          onClick={() => apply({ ...prefs, from: null, to: null })}
          className={`min-h-[44px] rounded-xl border text-xs font-bold transition-colors ${
            !limited
              ? 'border-brand bg-brand-100 text-brand'
              : 'border-slate-200 bg-white text-slate-600'
          }`}
        >
          طوال اليوم
        </button>
        <button
          type="button"
          disabled={busy}
          aria-pressed={limited}
          onClick={() => apply({ ...prefs, from: prefs.from ?? 7 * 60, to: prefs.to ?? 22 * 60 })}
          className={`min-h-[44px] rounded-xl border text-xs font-bold transition-colors ${
            limited
              ? 'border-brand bg-brand-100 text-brand'
              : 'border-slate-200 bg-white text-slate-600'
          }`}
        >
          ساعات محدّدة
        </button>
      </div>

      {limited && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] text-slate-500">من</span>
              <select
                className="field mt-1"
                value={prefs.from ?? 420}
                onChange={(e) => apply({ ...prefs, from: Number(e.target.value) })}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h * 60}>
                    {hourLabel(h * 60)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-500">إلى</span>
              <select
                className="field mt-1"
                value={prefs.to ?? 1320}
                onChange={(e) => apply({ ...prefs, to: Number(e.target.value) })}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h * 60}>
                    {hourLabel(h * 60)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {/* A window that ends before it starts crosses midnight — that is a
              real choice (10pm→6am), not a mistake, so it is spelled out
              rather than rejected. */}
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            {prefs.to! > prefs.from!
              ? 'خارج هذه الساعات لا يرنّ هاتفك، ويصلك الخبر حين تفتح التطبيق.'
              : 'نافذة تعبر منتصف الليل — يصلك الإشعار من المساء حتى الصباح.'}
          </p>
        </>
      )}

      {failed && (
        <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs leading-relaxed text-red-700">
          تعذّر الحفظ. تأكد من الاتصال وأعد المحاولة.
        </p>
      )}

      {!failed && !busy && (paused || limited) && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-brand">
          <CheckIcon className="h-4 w-4" />
          محفوظ
        </p>
      )}
    </section>
  );
}
