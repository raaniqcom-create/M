'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { currentTarget } from '@/lib/alerts';
import { BellRingIcon, CheckIcon, SpinnerIcon } from './icons';
import { Sheet } from './Sheet';

/** يربط لوحة المحطة بجهاز صاحبها — من المتصفح، لا من التطبيق وحده.
 *
 *  محطتان من ستّ كانتا بلا جهاز مربوط، وكلتاهما تحدّث منتجاتها كل يوم. فلم يكن
 *  العطل كسلاً من صاحبها: صفحة اللوحة تربط الجهاز بقراءة `device-token` من
 *  التخزين، وهذا المفتاح لا يكتبه إلا تسجيلُ الدفع داخل التطبيق المثبَّت. ومن
 *  يدير محطته من المتصفح لا يملكه، فلا يُربط أبداً — ولا يُنبَّه أنه غير مربوط.
 *
 *  ولا يُطلب إذنٌ من تلقاء الصفحة: إن كان ممنوحاً أصلاً يقع الربط بصمت، وإلا
 *  فورقةٌ منبثقةٌ تشرح ما يُفتقد وتنتظر ضغطة — منبثقةٌ لا بطاقةٌ في آخر
 *  الصفحة، لأنّ آخرَ الصفحة لا يُقرأ (طلبُ صاحب المنصّة ١١ أيلول ٢٠٢٦).
 *  و«لاحقاً» يُغلقها لهذه الزيارة، ولا يُلحّ عليه في كلّ رسم. */
const isNative = () =>
  !!(globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

export function OwnerDeviceLink({ stationId }: { stationId: string }) {
  const [state, setState] = useState<'checking' | 'linked' | 'ask' | 'working' | 'failed' | 'denied'>(
    'checking'
  );
  const [dismissed, setDismissed] = useState(false);

  /** يطلب الإذنَ بالمسار الصحيح للمنصّة (أصليٌّ في التطبيق، متصفّحيٌّ في الويب)
   *  ثمّ ينسب الرمزَ إلى المحطة — ويُدرجه إن لم يكن مُدرَجاً بعد. */
  const link = useCallback(async () => {
    const t = await currentTarget();
    if (t === 'denied') return 'denied' as const;
    if (t === 'unsupported' || t === 'pending') return 'failed' as const;
    const { error } = await supabase.rpc('claim_owner_device', {
      p_token: t.address,
      p_station_id: stationId,
      p_platform: t.channel,
      p_keys: t.keys ?? null,
    });
    return error ? ('failed' as const) : ('linked' as const);
  }, [stationId]);

  useEffect(() => {
    // في التطبيق: رمزٌ محفوظٌ يعني أنّ الصفحةَ ربطته بنفسها. ولا رمزَ = لم يُمنح
    // الإذن — فالورقةُ تُعرض ويُطلب بالمسار الأصليّ عند الضغط.
    if (localStorage.getItem('device-token')) return setState('linked');
    if (isNative()) return setState('ask');
    if (typeof Notification === 'undefined') return setState('failed');
    if (Notification.permission !== 'granted') return setState('ask');
    link().then(setState);
  }, [link]);

  async function enable() {
    setState('working');
    setState(await link());
  }

  // الصامت هو الصحيح: مربوطٌ فلا داعي لورقة، أو لمّا يُعرف بعدُ فلا يُخوَّف.
  const open = !dismissed && state !== 'checking' && state !== 'linked';

  return (
    <Sheet open={open} onClose={() => setDismissed(true)} title="لا يصلك تنبيه من المنصة">
      <p className="flex items-center gap-2 text-sm font-extrabold text-amber-900">
        <BellRingIcon className="h-5 w-5 shrink-0" />
        جهازك غير مربوط بلوحة محطتك
      </p>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        فلا يصلك تذكير الصباح ولا تنبيه أن اليوم مضى بلا تحديث. اسمح بالتنبيهات مرّةً
        واحدة، ولا نطلب منك شيئاً بعدها.
      </p>
      {state === 'denied' && (
        <p className="mt-2 rounded-lg bg-red-50 p-2.5 text-xs leading-relaxed text-red-700">
          {isNative()
            ? 'الإشعاراتُ ممنوعةٌ لهذا التطبيق في إعدادات هاتفك. افتح الإعدادات ← التطبيقات ← المحطة التقنية ← الإشعارات، واسمح بها — ثمّ عد واضغط الزرّ.'
            : 'رفضتَ الإذن سابقاً في هذا المتصفح. اسمح بالإشعارات من إعدادات الموقع (رمز القفل بجانب العنوان) ثمّ أعد المحاولة، أو افتح اللوحة من التطبيق.'}
        </p>
      )}
      {state === 'failed' && (
        <p className="mt-2 rounded-lg bg-red-50 p-2.5 text-xs leading-relaxed text-red-700">
          {isNative()
            ? 'لم يصل رمزُ الجهاز بعد. تأكّد من الإنترنت وأعد المحاولة بعد لحظات.'
            : 'تعذّر الربط في هذا المتصفح. إن كنت في وضع التصفّح الخفي فأعد فتح اللوحة من نافذة عادية، أو افتحها من التطبيق المثبَّت.'}
        </p>
      )}
      <button
        onClick={enable}
        disabled={state === 'working'}
        className="btn-primary mt-4 w-full gap-2 disabled:opacity-60"
      >
        {state === 'working' ? (
          <SpinnerIcon className="h-4 w-4" />
        ) : (
          <CheckIcon className="h-4 w-4" />
        )}
        السماح بالتنبيهات
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="btn-ghost mt-2 w-full"
      >
        لاحقاً
      </button>
    </Sheet>
  );
}
