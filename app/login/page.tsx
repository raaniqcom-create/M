'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { phoneToEmail } from '@/lib/phone';
import { StationRegisterForm } from '@/components/StationRegisterForm';
import { FuelIcon, SpinnerIcon } from '@/components/icons';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const value = identifier.trim();
    // owners log in with a phone number, admins with a username, and either
    // may paste a full email — all three resolve to one auth address here
    const email = value.includes('@')
      ? value
      : /^[0-9+\s()-]+$/.test(value)
        ? phoneToEmail(value)
        : `${value}@muhta.app`;

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setBusy(false);
      // a rate limit or a dropped connection is not a wrong password — saying
      // so sends the user hunting for a typo that isn't there
      const raw = signInError.message.toLowerCase();
      setError(
        raw.includes('rate') || raw.includes('many')
          ? 'محاولات كثيرة خلال وقت قصير. انتظر دقيقة ثم حاول مجدداً.'
          : raw.includes('fetch') || raw.includes('network')
            ? 'تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مجدداً.'
            : 'رقم الهاتف أو كلمة المرور غير صحيحة. تأكد من البيانات وحاول مجدداً.'
      );
      return;
    }

    const { data: auth } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', auth.user!.id)
      .maybeSingle();

    setBusy(false);
    router.push(profile?.role === 'admin' ? '/admin' : '/owner');
  }

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <a href="/" className="mb-6 flex items-center justify-center gap-2 text-brand">
        <FuelIcon className="h-6 w-6" />
        <span className="text-lg font-extrabold">المحطة التقنية</span>
      </a>

      {mode === 'signup' ? (
        <StationRegisterForm />
      ) : (
        <form onSubmit={submit} className="card space-y-4 p-5">
          <h1 className="text-base font-bold">دخول أصحاب المحطات</h1>

          <div>
            <label htmlFor="identifier" className="label">
              رقم الهاتف <span className="text-traffic-red">*</span>
            </label>
            <input
              id="identifier"
              type="tel"
              inputMode="numeric"
              required
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="field"
              placeholder="07XXXXXXXXX"
              dir="ltr"
            />
          </div>

          <div>
            <label htmlFor="password" className="label">
              كلمة المرور <span className="text-traffic-red">*</span>
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field pl-16"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute left-2 top-1/2 h-9 -translate-y-1/2 px-2 text-xs font-semibold text-slate-500"
              >
                {showPassword ? 'إخفاء' : 'إظهار'}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-traffic-red">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy && <SpinnerIcon className="h-4 w-4" />}
            دخول
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'login' ? 'signup' : 'login');
          setError(null);
        }}
        className="mt-4 min-h-[44px] w-full text-sm font-semibold text-brand"
      >
        {mode === 'login' ? 'ليس لديك حساب؟ سجّل محطتك مجاناً' : 'لديك حساب؟ سجّل الدخول'}
      </button>

      <a href="/" className="block min-h-[44px] pt-3 text-center text-sm text-slate-500">
        العودة للصفحة الرئيسية
      </a>
    </main>
  );
}
