'use client';

import { useCallback, useEffect, useState } from 'react';
import { callFn } from '@/lib/fn';
import { isDown, readStatus, type SiteStatus } from '@/lib/status';
import { SpinnerIcon } from './icons';

/** إيقافُ الموقع وإعادتُه.
 *
 *  ── وليس فوريّاً، ويُقال ذلك ─────────────────────────────────────────────
 *
 *  المفتاحُ ملفٌّ في المستودع، وقلبُه إيداعٌ يُطلق النشر — دقيقتان إلى أربع.
 *  فهو لصيانةٍ مخطَّطة، لا لعطلٍ مفاجئ. والعطلُ المفاجئ يعالجه شريطُ القِدَم
 *  في الصفحة الرئيسة: يظهر وحدَه خلال دقيقة بلا نشرٍ ولا لمسة.
 *
 *  ── وطريقُ الإطفاء حين تتعطّل هذه اللوحة ─────────────────────────────────
 *
 *  إن كانت القاعدةُ هي المتوقّفة فهذا الزرُّ لا يعمل — إذ يحتاج جلسةً. ولذلك
 *  ثلاثةُ مخارج، مكتوبةٌ تحت الزرّ بالحرف كي تُقرأ في اللحظة التي تُحتاج فيها:
 *  الصيانةُ تنتهي وحدَها، أو تُحرَّر من github.com بالهاتف، أو من سطر الأوامر. */
export function MaintenanceSwitch() {
  const [status, setStatus] = useState<SiteStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [hours, setHours] = useState(2);
  const [message, setMessage] = useState('');

  const check = useCallback(async () => setStatus(await readStatus()), []);
  useEffect(() => {
    void check();
  }, [check]);

  const down = isDown(status);

  async function flip(next: boolean) {
    if (
      next &&
      !confirm(
        `إيقاف الموقع ${hours} ساعة؟\n\nيبدأ بعد اكتمال النشر — دقيقتان إلى أربع.\nويعود وحدَه عند انتهاء المدّة حتى لو تعذّر إطفاؤه.`
      )
    )
      return;
    setBusy(true);
    setNote(null);
    const r = await callFn<{ until?: string }>('rebuild', {
      maintenance: next,
      message: message.trim(),
      hours,
    });
    setBusy(false);
    if (!r.ok) {
      setNote(r.error ?? 'تعذّر التبديل.');
      return;
    }
    setNote(
      next
        ? 'أُودع التغيير. الصيانةُ تظهر بعد اكتمال النشر — دقيقتان إلى أربع.'
        : 'أُودع التغيير. الموقعُ يعود بعد اكتمال النشر.'
    );
    // والملفُّ لا يتبدّل قبل النشر، فلا تُسأل حالتُه الآن — تُسأل بعد دقيقتين.
    setTimeout(() => void check(), 150_000);
  }

  return (
    <section className="card mt-4 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-extrabold">وضع الصيانة</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
            down ? 'bg-red-50 text-traffic-red' : 'bg-brand-50 text-brand-700'
          }`}
        >
          {down ? 'الموقع متوقّف' : 'الموقع يعمل'}
        </span>
      </div>

      {!down && (
        <>
          <label className="label mt-3 block text-[11px]">
            رسالةٌ للناس (اختياريّة)
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="field mt-1"
              placeholder="نُجري تحديثاً قصيراً على الخدمة."
              maxLength={300}
            />
          </label>
          <label className="label mt-2 block text-[11px]">
            المدّة
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="field mt-1"
            >
              {[1, 2, 3, 6, 12, 24].map((h) => (
                <option key={h} value={h}>
                  {h} ساعة
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      <button
        type="button"
        onClick={() => void flip(!down)}
        disabled={busy}
        className={`mt-3 w-full px-4 py-2 text-[12.5px] disabled:opacity-60 ${
          down ? 'btn-primary' : 'btn-ghost'
        }`}
      >
        {busy ? (
          <SpinnerIcon className="mx-auto h-4 w-4" />
        ) : down ? (
          'أعد الموقع الآن'
        ) : (
          'أوقف الموقع مؤقّتاً'
        )}
      </button>

      {note && (
        <p className="mt-2 rounded-lg bg-slate-50 p-2 text-[11px] font-bold text-slate-700">
          {note}
        </p>
      )}

      <p className="mt-3 text-[10.5px] leading-relaxed text-slate-400">
        الصيانةُ تنتهي وحدَها عند انقضاء المدّة. وإن تعطّل هذا الزرّ — لأن قاعدة
        البيانات هي المتوقّفة — فحرِّر <b>public/status.json</b> من github.com
        بالهاتف واجعل <code dir="ltr">maintenance</code> تساوي{' '}
        <code dir="ltr">false</code>.
      </p>
    </section>
  );
}
