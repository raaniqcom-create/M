'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CheckIcon, EyeIcon, EyeOffIcon, SpinnerIcon } from './icons';

/** تغييرُ كلمة المرور من داخل اللوحة.
 *
 *  **لم يكن في المنصّة طريقٌ إليها من داخل اللوحة.** الطريقُ الوحيد `/reset`،
 *  وهو يُخرج المالكَ ويطلب رمزاً برسالةٍ نصّية — ثلاثُ شاشاتٍ وانتظارٌ لتغييرٍ
 *  اختياريّ.
 *
 *  > **وتصحيحٌ لما ظُنّ حين كُتبت:** حُسب أن `/reset` معطّلٌ لأن حساب OTPIQ بلا
 *  > اسم مُرسِل. وهذا خطأ: `otp` يُرسل بـ`smsType:'verification'` ولا يحتاج
 *  > مُرسِلاً، ولوحةُ المزوّد تُظهر مئةً وتسعَ عشرةَ رسالةً ناجحة بلا فشل.
 *  > المعطَّلُ هو النصُّ الحرّ وحده — `smsType:'custom'` في التذكير والبثّ.
 *  > فالاستعادةُ تعمل، وهذه تُيسّرها لا تُنقذها.
 *
 *  وهي لا تحتاج رسالةً ولا رمزاً: من كان داخلاً بجلسته فقد أثبت أنه هو،
 *  و`auth.updateUser` تكفي.
 *
 *  وسبتُها المباشر: محطةٌ حُذفت بالخطأ ثمّ أُعيدت، فطُلب أن يُغيّر صاحبُها
 *  كلمتَه بعد أوّل دخول — ولم يكن له سبيل. */
export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (pw.length < 6) return setError('كلمة المرور 6 أحرف أو أرقام على الأقل.');
    if (pw !== again) return setError('الكلمتان غير متطابقتين.');
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (e) {
      // ولا يُلام الحسابُ على عطلِ شبكة: يُقال ما قالته القاعدة
      setError(
        e.message.includes('same')
          ? 'هذه هي كلمتك الحالية. اختر واحدة مختلفة.'
          : 'تعذّر الحفظ. تحقّق من اتصالك وأعد المحاولة.'
      );
      return;
    }
    setDone(true);
    setPw('');
    setAgain('');
  }

  if (done) {
    return (
      <section className="card border-brand-200 bg-brand-50 p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-brand-700">
          <CheckIcon className="h-5 w-5 shrink-0" />
          تم تغيير كلمة المرور
        </p>
        <p className="mt-1 text-xs leading-relaxed text-brand-900/80">
          استعملها في الدخول القادم. ولا يعرفها أحدٌ سواك — ولا الإدارة.
        </p>
      </section>
    );
  }

  return (
    <section className="card p-5">
      <h3 className="text-sm font-bold">كلمة المرور</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        غيّرها متى شئت. اسمُ الدخول يبقى رقمَ هاتفك.
      </p>

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost mt-3 w-full">
          تغيير كلمة المرور
        </button>
      ) : (
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor="new-pw" className="label">
              كلمة المرور الجديدة
            </label>
            <div className="relative">
              <input
                id="new-pw"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={6}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className="field pr-12"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                aria-pressed={show}
                className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 active:bg-slate-100"
              >
                {show ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="again-pw" className="label">
              أعِدها للتأكيد
            </label>
            <input
              id="again-pw"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              className="field"
              dir="ltr"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-xs font-bold text-traffic-red">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={save}
            disabled={busy || !pw || !again}
            className="btn-primary w-full disabled:opacity-60"
          >
            {busy && <SpinnerIcon className="h-4 w-4" />}
            حفظ كلمة المرور
          </button>
        </div>
      )}
    </section>
  );
}
