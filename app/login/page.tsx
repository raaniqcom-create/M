'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { phoneToEmail } from '@/lib/phone';
import { EyeIcon, EyeOffIcon, FuelIcon, MessageIcon, PlusIcon, SpinnerIcon } from '@/components/icons';

export default function LoginPage() {
  const router = useRouter();
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

      <form onSubmit={submit} className="card space-y-4 p-5">
        <h1 className="text-base font-bold">الدخول إلى حسابي</h1>

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
                className="field pr-12"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                aria-pressed={showPassword}
                className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 active:bg-slate-100"
              >
                {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-traffic-red">
              <p>{error}</p>
              {/* The moment a password is refused is the moment recovery is
                  wanted; making them hunt for it in the menu is the wrong ask. */}
              <a href="/reset" className="mt-2 inline-block font-bold underline">
                نسيت كلمة المرور؟ استعدها برسالة
              </a>
            </div>
          )}

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy && <SpinnerIcon className="h-4 w-4" />}
          دخول
        </button>
      </form>

      <section className="card mt-4 p-5">
        <h2 className="text-sm font-bold">ليس لديك حساب؟</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          الحساب لأصحاب المحطات. أما من يريد معرفة توفر الوقود فلا يحتاج حساباً —
          يكفي أن يختار مدينته ونوع الوقود من التطبيق.
        </p>

        <a href="/register" className="btn-primary mt-4 w-full">
          <PlusIcon className="h-4 w-4" />
          محطة جديدة — سجّل محطتك مجاناً
        </a>
        <a href="/subscribe" className="btn-ghost mt-2 w-full">
          <MessageIcon className="h-4 w-4" />
          مستخدم — استلم التنبيهات برسالة
        </a>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
          الاشتراك بالرسائل لمن لا يستعمل التطبيق — رقمك فقط، بلا حساب ولا كلمة مرور.
        </p>
      </section>

      <a href="/" className="block min-h-[44px] pt-3 text-center text-sm text-slate-500">
        العودة للصفحة الرئيسية
      </a>
    </main>
  );
}
