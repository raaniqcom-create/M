'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { SpinnerIcon } from '@/components/icons';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setBusy(false);
    if (error) {
      setError(
        mode === 'login'
          ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة. تأكد من البيانات وحاول مجدداً.'
          : 'تعذّر إنشاء الحساب. قد يكون البريد مستخدماً أو كلمة المرور أقل من ٦ أحرف.'
      );
      return;
    }
    router.push('/owner');
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <h1 className="text-center text-xl font-extrabold text-brand">المحطة التقنية</h1>
      <p className="mt-1 text-center text-sm text-slate-500">
        {mode === 'login' ? 'دخول أصحاب المحطات' : 'حساب جديد لصاحب محطة'}
      </p>

      <form onSubmit={submit} className="card mt-6 space-y-4 p-5">
        <div>
          <label htmlFor="email" className="label">
            البريد الإلكتروني
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
            placeholder="name@example.com"
            dir="ltr"
          />
        </div>

        <div>
          <label htmlFor="password" className="label">
            كلمة المرور
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field pl-16"
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute left-2 top-1/2 h-9 -translate-y-1/2 px-2 text-xs font-semibold text-slate-500"
            >
              {showPassword ? 'إخفاء' : 'إظهار'}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">٦ أحرف على الأقل</p>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-traffic-red">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy && <SpinnerIcon className="h-4 w-4" />}
          {mode === 'login' ? 'دخول' : 'إنشاء حساب'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'login' ? 'signup' : 'login');
          setError(null);
        }}
        className="mt-4 min-h-[44px] text-sm font-medium text-brand"
      >
        {mode === 'login' ? 'ليس لديك حساب؟ سجّل محطتك' : 'لديك حساب؟ سجّل الدخول'}
      </button>

      <a href="/" className="mt-2 min-h-[44px] pt-3 text-center text-sm text-slate-500">
        العودة للصفحة الرئيسية
      </a>
    </main>
  );
}
