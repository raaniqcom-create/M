'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { setBiometricLock, verifyOwner } from '@/lib/biometric';
import { LockIcon, SpinnerIcon } from './icons';

/** شاشةُ القفل — والبابُ الثاني لا يُخرج أحداً.
 *
 *  ── ما وقع ──────────────────────────────────────────────────────────────
 *
 *  كان زرُّ «أدخل بكلمة المرور» يُسجّل الخروجَ ويذهب إلى /login. فمن رُفض
 *  وجهُه (كمّامة، شمس، نظّارة) ضغطه، فدخل بكلمته، فعاد إلى اللوحة، فسُئل
 *  الوجهَ ثانيةً، فرُفض، فضغط — حلقةٌ لا تنتهي. واشتكى صاحبُ محطةٍ في يوم
 *  الإصدار نفسِه: «المحطة خرجت ولا يمكن الدخول».
 *
 *  فصارت كلمةُ المرور تُكتب **هنا**، بلا خروج: تُتحقَّق على الخادم بالبريد
 *  نفسِه، فتُفتح اللوحةُ **ويُطفأ القفلُ على هذا الجهاز** — من كتب كلمتَه
 *  قال إنّه لا يريد الوجه. ومن أراده ثانيةً يشعله من «حسابي». */
export function BiometricLockScreen({
  title,
  onUnlocked,
}: {
  title: string;
  onUnlocked: () => void;
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [askPassword, setAskPassword] = useState(false);

  async function retry() {
    setErr(null);
    if (await verifyOwner()) onUnlocked();
    else setErr('لم تُقبل — حاول ثانيةً أو ادخل بكلمة المرور.');
  }

  async function withPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { data } = await supabase.auth.getSession();
    const email = data.session?.user.email;
    if (!email) {
      // لا جلسةَ أصلاً — فالبابُ الطبيعيّ نموذجُ الدخول.
      router.replace('/login');
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      setErr('كلمة المرور غير صحيحة.');
      return;
    }
    await setBiometricLock(false);
    onUnlocked();
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <LockIcon className="h-8 w-8 text-brand" />
      <h1 className="mt-3 text-base font-bold">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">افتحها بوجهك أو بصمتك، أو بكلمة المرور.</p>

      {err && (
        <p className="mt-3 w-full max-w-xs rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{err}</p>
      )}

      {!askPassword ? (
        <>
          <button type="button" onClick={retry} className="btn-primary mt-5 w-full max-w-xs">
            افتح بالبصمة أو الوجه
          </button>
          <button
            type="button"
            onClick={() => setAskPassword(true)}
            className="btn-ghost mt-2 w-full max-w-xs"
          >
            أدخل بكلمة المرور
          </button>
        </>
      ) : (
        <form onSubmit={withPassword} className="mt-5 w-full max-w-xs">
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="كلمة المرور"
            className="field text-center"
          />
          <button type="submit" disabled={busy || !password} className="btn-primary mt-2 w-full disabled:opacity-50">
            {busy && <SpinnerIcon className="h-4 w-4" />}
            دخول
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            بعدها يُفتح التطبيق بلا وجهٍ ولا بصمة على هذا الهاتف — وتُعيد تشغيلها من «حسابي» متى شئت.
          </p>
        </form>
      )}

      <button
        type="button"
        onClick={async () => {
          await supabase.auth.signOut();
          router.replace('/login');
        }}
        className="mt-6 text-[11px] font-bold text-slate-400"
      >
        تسجيل الخروج
      </button>
    </main>
  );
}
