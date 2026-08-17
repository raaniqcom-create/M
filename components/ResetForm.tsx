'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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

/** Three steps in one screen: the phone, the code that lands on it, then the
 *  new password. Splitting them across pages would lose the entered phone on
 *  every back tap, and an owner mid-recovery is already frustrated. */
export function ResetForm() {
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

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
      await call({ action: 'send', phone, purpose: 'reset' });
      setSent(true);
      setStep('code');
    });

  const verify = () =>
    run(async () => {
      await call({ action: 'verify', phone, code, password });
      router.push('/login?reset=1');
    });

  return (
    <section className="card space-y-4 p-5">
      {step === 'phone' ? (
        <>
          <div>
            <label htmlFor="phone" className="block text-sm font-semibold">
              رقم هاتف المحطة
            </label>
            <p className="mt-1 text-xs text-slate-500">
              نفس الرقم المسجّل في المنصة. يصلك رمز تحقّق برسالة.
            </p>
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07XXXXXXXXX"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-base"
            />
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
          {sent && (
            <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">
              أرسلنا رمزاً من 6 أرقام إلى <span dir="ltr">{phone}</span>. صالح لعشر دقائق.
            </p>
          )}

          <div>
            <label htmlFor="code" className="block text-sm font-semibold">
              رمز التحقّق
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              dir="ltr"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="------"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-center text-xl font-bold tracking-[0.4em]"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-semibold">
              كلمة المرور الجديدة
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6 أحرف على الأقل"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-base"
            />
          </div>

          <button
            type="button"
            onClick={verify}
            disabled={busy || code.length !== 6 || password.length < 6}
            className="btn-primary w-full"
          >
            {busy && <SpinnerIcon className="h-4 w-4" />}
            تعيين كلمة المرور
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
