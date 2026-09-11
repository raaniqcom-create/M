'use client';

import { useEffect, useState } from 'react';
import { biometricAvailable, biometricLockEnabled, setBiometricLock } from '@/lib/biometric';

/** مفتاحُ «افتح اللوحة بالبصمة أو الوجه» — يظهر في التطبيق وحده، وحيث
 *  للجهاز بصمةٌ مسجَّلة. في المتصفّح لا يُرسم شيء. */
export function BiometricLockToggle() {
  const [on, setOn] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    biometricAvailable().then(async (ok) => {
      if (!alive || !ok) return;
      setOn(await biometricLockEnabled());
    });
    return () => {
      alive = false;
    };
  }, []);

  if (on === null) return null;

  return (
    <section className="card p-5">
      <h3 className="text-sm font-bold">الدخول بالبصمة أو الوجه</h3>
      <label className="mt-3 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={on}
          onChange={async (e) => {
            const next = e.target.checked;
            setOn(next);
            await setBiometricLock(next);
          }}
          className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
        />
        <span className="text-xs leading-relaxed text-slate-600">
          <b>افتح اللوحة بالبصمة أو الوجه</b>
          <span className="mt-1 block text-slate-500">
            تبقى داخلاً، وعند فتح التطبيق يُطلب وجهُك أو بصمتُك بدل كلمة المرور. وإن
            لم تُقبل تدخل بكلمة المرور كما كنت.
          </span>
        </span>
      </label>
    </section>
  );
}
