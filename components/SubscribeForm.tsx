'use client';

import { useState } from 'react';
import { CITY_NAMES } from '@/lib/cities';
import { SpinnerIcon } from './icons';

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

/** Signing up a citizen for offers. The code is not bureaucracy: without it
 *  anyone could subscribe a stranger's number to messages they never asked
 *  for, and the first thing that number would do is report us as spam. */
export function SubscribeForm() {
  const [step, setStep] = useState<'form' | 'code' | 'done'>('form');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState<string>('');
  const [code, setCode] = useState('');
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

  const send = () =>
    run(async () => {
      await call({ action: 'send', phone, purpose: 'subscribe' });
      setStep('code');
    });

  const verify = () =>
    run(async () => {
      await call({ action: 'verify', phone, code, city: city || null });
      setStep('done');
    });

  if (step === 'done') {
    return (
      <section className="card p-5 text-center">
        <p className="text-2xl">✅</p>
        <p className="mt-2 text-sm font-bold">تم تسجيلك</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          سيصلك خبر توفر الوقود والعروض{city ? ` في ${city}` : ''} على رقمك.
          لن يُشارك رقمك مع أي جهة.
        </p>
        <a href="/" className="btn-primary mt-4 w-full">
          تصفّح المحطات
        </a>
      </section>
    );
  }

  return (
    <section className="card space-y-4 p-5">
      {step === 'form' ? (
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

          <div>
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
            onClick={send}
            disabled={busy || phone.replace(/\D/g, '').length < 10}
            className="btn-primary w-full"
          >
            {busy && <SpinnerIcon className="h-4 w-4" />}
            أرسل رمز التحقّق
          </button>
        </>
      ) : (
        <>
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">
            أرسلنا رمزاً من ٦ أرقام إلى <span dir="ltr">{phone}</span>. صالح لعشر دقائق.
          </p>
          <input
            type="text"
            inputMode="numeric"
            dir="ltr"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="------"
            aria-label="رمز التحقّق"
            className="w-full rounded-xl border border-slate-200 px-3 py-3 text-center text-xl font-bold tracking-[0.4em]"
          />
          <button
            type="button"
            onClick={verify}
            disabled={busy || code.length !== 6}
            className="btn-primary w-full"
          >
            {busy && <SpinnerIcon className="h-4 w-4" />}
            تأكيد الاشتراك
          </button>
          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="w-full py-2 text-xs font-semibold text-brand-700"
          >
            لم يصلك الرمز؟ أعد الإرسال
          </button>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
