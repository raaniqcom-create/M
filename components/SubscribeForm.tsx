'use client';

import { useState } from 'react';
import { CITY_NAMES } from '@/lib/cities';
import { CheckIcon, SpinnerIcon } from './icons';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function call(body: Record<string, unknown>) {
  const res = await fetch(`${URL}/functions/v1/otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'تعذّر إتمام الطلب');
  return data;
}

/** اشتراكُ مواطنٍ بالإشعارات — بضغطةٍ واحدة.
 *
 *  ── ورُفع الرمز ─────────────────────────────────────────────────────────
 *
 *  «وارفع التسجيل عن otp الان» — صاحبُ المنصّة، ١٩ أيلول.
 *
 *  وكان الرمزُ يُثبت أنّ الرقمَ لصاحبه، وبلا ذلك يستطيع أحدٌ أن يُشرك رقمَ
 *  غيره أو يوقفه عنه. والحاجزُ صار يُسقط مشتركين أكثرَ ممّا يحمي: رسالةٌ
 *  تتأخّر أو لا تصل، فينصرف من جاء ليشترك.
 *
 *  والحسابُ ليس هنا: `subscribers` قائمةُ أرقامٍ لا حسابات، والاشتراكُ
 *  والإيقافُ كلاهما يُراجَع من هذه الشاشة نفسِها. أمّا استعادةُ كلمة المرور
 *  فيبقى رمزُها — هناك حسابٌ يُملَك، ودالّةُ otp تردّها صراحةً من هذا الباب. */
export function SubscribeForm() {
  const [step, setStep] = useState<'form' | 'done'>('form');
  // Whether this run enrols the number or stops the messages — same code,
  // same proof of ownership, opposite outcome.
  const [mode, setMode] = useState<'subscribe' | 'unsubscribe'>('subscribe');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setBusy(false);
    }
  }

  const submit = () =>
    run(async () => {
      await call({ action: 'direct', phone, purpose: mode, city: city || null });
      setStep('done');
    });

  if (step === 'done') {
    return (
      <section className="card p-5 text-center">
        <CheckIcon className="mx-auto h-8 w-8 text-brand" />
        <p className="mt-2 text-sm font-bold">
          {mode === 'unsubscribe' ? 'تم إيقاف الرسائل' : 'تم تسجيلك'}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          {mode === 'unsubscribe'
            ? 'لن تصلك رسائل بعد الآن. يمكنك الاشتراك مجدداً في أي وقت.'
            : `سيصلك خبر توفر الوقود والعروض${city ? ` في ${city}` : ''} على رقمك. لا نبيع رقمك ولا نشاركه لأغراض تسويقية خارجية.`}
        </p>
        <a href="/" className="btn-primary mt-4 w-full">
          تصفّح المحطات
        </a>
      </section>
    );
  }

  return (
    <section className="card space-y-4 p-5">
      <>
          <div>
            <label htmlFor="p" className="block text-sm font-semibold">
              رقم هاتفك
            </label>
            <input
              id="p"
              type="tel"
              inputMode="numeric"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07XXXXXXXXX"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-base"
            />
          </div>

          <div className={mode === 'unsubscribe' ? 'hidden' : undefined}>
            <label htmlFor="c" className="block text-sm font-semibold">
              مدينتك <span className="font-normal text-slate-400">(اختياري)</span>
            </label>
            <select
              id="c"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-base"
            >
              <option value="">كل مدن الأنبار</option>
              {CITY_NAMES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">
              نرسل لك ما يخصّ مدينتك فقط بدل كل المحافظة.
            </p>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={busy || phone.replace(/\D/g, '').length < 10}
            className="btn-primary w-full"
          >
            {busy && <SpinnerIcon className="h-4 w-4" />}
            {mode === 'unsubscribe' ? 'أوقف الرسائل عن رقمي' : 'اشترك الآن'}
          </button>

          {/* Leaving has to be as easy as joining, and reachable without an
              account — the number itself is the only thing we hold. */}
          <button
            type="button"
            onClick={() => setMode((m) => (m === 'subscribe' ? 'unsubscribe' : 'subscribe'))}
            className="w-full py-1 text-xs font-semibold text-slate-500 underline"
          >
            {mode === 'subscribe' ? 'إيقاف الرسائل عن رقمي' : 'أريد الاشتراك بدل الإيقاف'}
          </button>
      </>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
