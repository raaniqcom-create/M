'use client';

import { detectPlatform } from '@/lib/stores';
import { useNativeApp } from '@/lib/useNativeApp';

/** الطريق إلى شاشة الإذن، مكتوباً خطوةً خطوة.
 *
 *  كانت أربعة مواضع تقول «فعّلها من إعدادات هاتفك ثم أعد المحاولة» — وهي
 *  صحيحة ولا تنفع: من لا يعرف أين هي لا تدلّه الجملة، ومشتركٌ سأل «كيف أعيد
 *  تفعيل التنبيهات؟» هو الدليل. والمسار يختلف بين أندرويد وiOS، وبين التطبيق
 *  والمتصفّح — فيُعرض المسار الذي يخصّ هذا الجهاز وحده.
 *
 *  ولا يُطلب منه أن يعود ويضغط: الأب يراقب العودة ويُعيد المحاولة وحده. */
export function PermissionHelp() {
  const native = useNativeApp();
  const platform = detectPlatform();

  const steps = native
    ? platform === 'ios'
      ? ['افتح «الإعدادات»', 'انزل إلى «المحطة التقنية»', 'اضغط «الإشعارات»', 'فعّل «السماح بالإشعارات»']
      : [
          'افتح «الإعدادات»',
          'اضغط «التطبيقات» ثم «المحطة التقنية»',
          'اضغط «الإشعارات»',
          'فعّل «إظهار الإشعارات»',
        ]
    : platform === 'ios'
      ? ['افتح «الإعدادات»', 'انزل إلى «المحطة التقنية»', 'فعّل «السماح بالإشعارات»']
      : [
          'اضغط قفل العنوان 🔒 في أعلى المتصفّح',
          'اضغط «الأذونات» أو «إعدادات الموقع»',
          'اجعل «الإشعارات» = السماح',
        ];

  const shortcut = native && platform !== 'ios';

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs font-bold text-amber-900">لإعادة تفعيلها:</p>
      <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-amber-900">
        {steps.map((s, i) => (
          <li key={s} className="flex gap-2">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      {shortcut && (
        <p className="mt-2 text-[11px] text-amber-800">
          أو أسرع: اضغط مطوّلاً على أيقونة التطبيق ← «معلومات التطبيق» ← «الإشعارات».
        </p>
      )}
      <p className="mt-2 text-[11px] font-bold text-amber-800">
        ثم ارجع إلى هنا — نتحقّق تلقائياً، ولا حاجة لضغط شيء.
      </p>
    </div>
  );
}
