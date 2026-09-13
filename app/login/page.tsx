'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { phoneToEmail } from '@/lib/phone';
import { isAborted } from '@/lib/fn';
import { biometryLabel, hasSavedLogin, loginWithFace, saveLogin } from '@/lib/biometric';
import { BiometricIcon, useBiometryKind } from '@/components/BiometricIcon';
import { EyeIcon, EyeOffIcon, FuelIcon, MessageIcon, PlusIcon, SpinnerIcon } from '@/components/icons';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** بياناتُ دخولٍ محفوظةٌ خلف الوجه على هذا الهاتف؟ — فالزرُّ الأخضر الأوّل. */
  const [faceReady, setFaceReady] = useState(false);
  const bioKind = useBiometryKind();

  useEffect(() => {
    let alive = true;
    hasSavedLogin().then((ok) => alive && setFaceReady(ok));
    return () => {
      alive = false;
    };
  }, []);

  /** بعد الجلسة: الدورُ يقرّر الوجهة — وتُحفظ بياناتُ الدخول خلف الوجه في التطبيق. */
  async function finish(uid: string, email: string, pw: string) {
    // لا انتظارَ على الحفظ: فشلُه (بناءٌ قديم، لا بصمة) لا يؤخّر الدخول.
    void saveLogin(email, pw);
    // ودورُ موظّف الفرع في القاعدة `owner`، فلولا هذا السؤال لاستُقبل بلوحة
    // محطةٍ لا يملكها ودُعي إلى «إكمال تسجيل محطتك».
    const [{ data: profile }, { data: branch }] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', uid).maybeSingle(),
      supabase.rpc('is_branch_viewer'),
    ]);
    setBusy(false);
    // replace, not push: the back button should not return to a login form the
    // person has already passed
    router.replace(
      profile?.role === 'admin' ? '/admin' : branch === true ? '/branch' : '/owner',
    );
  }

  async function withFace() {
    setBusy(true);
    setError(null);
    const c = await loginWithFace();
    if (!c) {
      setBusy(false);
      return setError('لم يُقبل الوجه — أدخل بكلمة المرور.');
    }
    const { data, error: e } = await supabase.auth.signInWithPassword({ email: c.username, password: c.password });
    const uid = data.session?.user?.id;
    if (e || !uid) {
      setBusy(false);
      return setError('بياناتُ الدخول المحفوظة لم تعد صالحة — أدخل بكلمة المرور مرّةً واحدة.');
    }
    await finish(uid, c.username, c.password);
  }

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
        : // اسمُ المستخدم يُصغَّر: من يُملى عليه «anbar1» قد يكتبها بحرفٍ كبير،
          // ولا يوجد اليوم عنوانٌ واحدٌ فيه حرفٌ كبير (فُحصت السبعون).
          `${value.toLowerCase()}@muhta.app`;

    const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setBusy(false);
      // a rate limit or a dropped connection is not a wrong password — saying
      // so sends the user hunting for a typo that isn't there
      //
      // ── والحالةُ تُقرأ قبل النصّ ────────────────────────────────────────
      //
      // كان الفرزُ بالبحث في نصّ الرسالة وحدَه، وكلُّ ما لا يطابق «rate» أو
      // «fetch» يسقط إلى «البيانات غير صحيحة». فيومَ ٢٠٢٦-٠٩-٠٨ سقطت القاعدة
      // — لا خدمةَ حسابات ولا شيء — وقرأ صاحبُ المنصّة أنّ كلمةَ مروره خاطئة،
      // فذهب يبحث عن خطأٍ ليس فيه بينما العطلُ في مكانٍ آخر تماماً. وكادت
      // تُبدَّل كلمةُ مرورٍ صحيحة.
      //
      // و`status` تحسم ما لا يحسمه النصّ: الأربعُمئة وحدَها تعني «بياناتٌ لا
      // تُطابق»، وما فوق الخمسمئة عطلٌ في الخدمة، والانقطاعُ لا حالةَ له.
      const status = signInError.status ?? 0;
      const raw = signInError.message.toLowerCase();
      setError(
        status === 429 || raw.includes('rate') || raw.includes('many')
          ? 'محاولات كثيرة خلال وقت قصير. انتظر دقيقة ثم حاول مجدداً.'
          : status >= 500
            ? 'خدمة الحسابات لا تستجيب حالياً — العطل ليس في بياناتك. حاول بعد دقائق.'
            : isAborted(signInError) || raw.includes('fetch') || raw.includes('network')
              ? 'تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مجدداً.'
              : 'البيانات غير صحيحة. تأكد من الرقم أو اسم المستخدم ومن كلمة المرور.'
      );
      return;
    }

    // The session just came back in `signIn` — asking the server again for the
    // same user is a second round trip that can fail on a weak connection, and
    // when it did the guard on the next page saw no user and bounced back here.
    // That is the "I have to sign in twice" everyone hit.
    const uid = signIn.session?.user?.id;
    if (!uid) {
      setBusy(false);
      setError('تعذّر إنشاء الجلسة. حاول مجدداً.');
      return;
    }
    await finish(uid, email, password);
  }

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <a href="/" className="mb-6 flex items-center justify-center gap-2 text-brand">
        <FuelIcon className="h-6 w-6" />
        <span className="text-lg font-extrabold">المحطة التقنية</span>
      </a>

      <form onSubmit={submit} className="card space-y-4 p-5">
        <h1 className="text-base font-bold">الدخول إلى حسابي</h1>
        {/* بياناتُ الدخول محفوظةٌ خلف الوجه على هذا الهاتف: زرٌّ واحدٌ قبل الحقلين. */}
        {faceReady && (
          <>
            <button type="button" onClick={withFace} disabled={busy} className="btn-primary mt-3 w-full disabled:opacity-60">
              {busy ? (
                <SpinnerIcon className="h-4 w-4" />
              ) : (
                <>
                  <BiometricIcon kind={bioKind} className="h-6 w-6" />
                  الدخول بـ{biometryLabel(bioKind)}
                </>
              )}
            </button>
            <p className="my-2 text-center text-[11px] text-slate-400">أو بكلمة المرور</p>
          </>
        )}

          <div>
            <label htmlFor="identifier" className="label">
              رقم الهاتف أو اسم المستخدم <span className="text-traffic-red">*</span>
            </label>
            {/* **حقلُ نصٍّ لا هاتف.** الشيفرةُ أدناه تقبل اسمَ مستخدمٍ منذ
                البداية، لكنّ `type="tel"` كان يفتح لوحةَ الأرقام على الهاتف —
                فحسابُ الفرع «anbar1» لا يمكن كتابتُه أصلاً. وصاحبُ المحطة
                يكتب رقمه على لوحةٍ كاملةٍ بلا ضرر؛ والعكسُ مستحيل. */}
            <input
              id="identifier"
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
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
