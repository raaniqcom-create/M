'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { biometricAvailable, hasSavedLogin, saveLogin } from '@/lib/biometric';
import { SpinnerIcon } from './icons';

/** «فعّل الدخول بالوجه» — بطاقةٌ في أعلى لوحة المالك حتى يفعّلها.
 *
 *  «لمستخدمي إدارة المحطات أرسل لهم طلبَ التفعيل ببصمة الوجه الآن، لأنّ يوجد
 *  تسجيلُ خروجٍ للمحطات» — صاحبُ المنصّة. القفلُ القديم يحرس جلسةً قائمة ولا
 *  يعيد جلسةً ضاعت؛ أمّا هذا فيحفظ بياناتِ الدخول في خزانة الهاتف (Keychain /
 *  Keystore) خلف الوجه أو البصمة، فمن خرج دخل بوجهه لا بكلمته.
 *
 *  كلمةُ المرور تُطلب مرّةً واحدة وتُتحقَّق بالدخول الفعليّ قبل الحفظ — فلا
 *  تُحفظ كلمةٌ خطأ ثمّ يُرفض الوجه. */
export function FaceLoginSetup() {
  const [show, setShow] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!(await biometricAvailable())) return;
      if (await hasSavedLogin()) return;
      if (alive) setShow(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!show) return null;

  async function enable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    const { data } = await supabase.auth.getSession();
    const email = data.session?.user?.email;
    if (!email) {
      setBusy(false);
      return setNote('انتهت الجلسة — أعد الدخول ثمّ فعّلها.');
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      return setNote('كلمةُ المرور غير صحيحة.');
    }
    const ok = await saveLogin(email, password);
    setBusy(false);
    if (!ok) return setNote('تعذّر الحفظ على هذا الهاتف.');
    setPassword('');
    setDone(true);
  }

  if (done) {
    return (
      <section className="rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-[12.5px] font-bold text-brand-900">
        ✅ تمّ — من الآن تدخل لوحتَك بوجهك أو بصمتك، حتى لو خرجتَ من التطبيق.
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-[13px] font-extrabold text-amber-900">فعّل الدخول بالوجه — حتى لا تُخرَج من لوحتك</p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-amber-800">
        بعض المحطات خرجت من التطبيق واحتاجت كلمةَ المرور. أدخلها هنا <b>مرّةً واحدة</b> وتُحفظ في
        خزانة هاتفك خلف وجهك أو بصمتك — وبعدها تدخل بوجهك دائماً.
      </p>
      <form onSubmit={enable} className="mt-3 flex gap-2">
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="كلمة المرور"
          className="field flex-1"
        />
        <button type="submit" disabled={busy || !password} className="btn-primary shrink-0 px-4 disabled:opacity-50">
          {busy ? <SpinnerIcon className="h-4 w-4" /> : 'فعّل'}
        </button>
      </form>
      {note && <p className="mt-2 text-[11.5px] font-bold text-red-700">{note}</p>}
    </section>
  );
}
