'use client';

import { useEffect, useState } from 'react';
import { StationPoster } from './StationPoster';
import { XIcon } from './icons';

/** صورةُ الانضمام، في أوّل شاشةٍ يفتحها صاحبُ المحطة.
 *
 *  **كانت مبنيّةً ومنشورةً ولا تُرى.** موضعُها تبويب «المحطة»، وصاحبُ المحطة
 *  يدخل فيقع على «اللوحة» — فلا يبلغها أبداً. وهي أوّلُ ما يحتاجه يومَ اعتماده:
 *  صورةٌ باسمه ورابطه يضعها على صفحته فيتابعه زبائنه.
 *
 *  فتُرفع إلى مكدّس الأعلى، بجوار ما يُفعل الآن لا داخل تبويب. **وتنزوي بعد
 *  أن تؤدّي غرضها**: من حفظها أخذ ما جاء من أجله، ومن أغلقها قال إنه رآها.
 *  وبطاقةٌ لا تنصرف تصير أثاثاً يُتخطّى بالعين، فتضيع اللوحةُ تحتها.
 *
 *  والذِّكرُ في التخزين المحلّي لا في القاعدة: هذا تفضيلُ عرضٍ على جهاز، لا
 *  حقيقةٌ عن المحطة. وعمودٌ له يعني هجرةً وسياسةً وكتابةً من المتصفّح مقابل
 *  صفر مكسب — والنمطُ نفسُه في AvailabilityPopup و lib/push. */
export function JoinPoster({
  stationId,
  name,
  slug,
}: {
  stationId: string;
  name: string;
  slug: string | null;
}) {
  /** null = لم يُقرأ التخزين بعد. وبقاؤها null يمنع ومضةَ بطاقةٍ ثمّ اختفاءها. */
  const [show, setShow] = useState<boolean | null>(null);
  const key = `poster-seen:${stationId}`;

  useEffect(() => {
    try {
      setShow(!localStorage.getItem(key));
    } catch {
      // متصفّحٌ يمنع التخزين: تُعرض. وبطاقةٌ تُرى مرّتين خيرٌ من صورةٍ لا تُرى.
      setShow(true);
    }
  }, [key]);

  function dismiss() {
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* لا يمنع الإخفاء في هذه الجلسة */
    }
    setShow(false);
  }

  // الشعارُ يُرسم من الرابط، فبلا slug ليس في الصورة ما يُنشر
  if (show !== true || !slug) return null;

  return (
    <section className="card border-2 border-brand-200 bg-brand-50/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-brand-900">صورةُ انضمامك جاهزة</h3>
          <p className="mt-1 text-xs leading-relaxed text-brand-900/80">
            باسم محطتك ورابطها. احفظها وانشرها على صفحاتك — من يتابعك عليها يصله خبرُ
            توفّر الوقود عندك فور إعلانه.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="إخفاء صورة الانضمام"
          className="-me-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 active:bg-slate-100"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3">
        <StationPoster key={slug} name={name} slug={slug} onSaved={dismiss} />
      </div>

      <p className="mt-2 text-center text-[10.5px] text-slate-400">
        وتبقى في تبويب «المحطة» متى احتجتها.
      </p>
    </section>
  );
}
