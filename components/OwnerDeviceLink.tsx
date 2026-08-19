'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getPushSubscription } from '@/lib/push';
import { BellRingIcon, CheckIcon, SpinnerIcon } from './icons';

/** يربط لوحة المحطة بجهاز صاحبها — من المتصفح، لا من التطبيق وحده.
 *
 *  محطتان من ستّ كانتا بلا جهاز مربوط، وكلتاهما تحدّث منتجاتها كل يوم. فلم يكن
 *  العطل كسلاً من صاحبها: صفحة اللوحة تربط الجهاز بقراءة `device-token` من
 *  التخزين، وهذا المفتاح لا يكتبه إلا تسجيلُ الدفع داخل التطبيق المثبَّت. ومن
 *  يدير محطته من المتصفح لا يملكه، فلا يُربط أبداً — ولا يُنبَّه أنه غير مربوط.
 *
 *  ولا يُطلب إذنٌ من تلقاء الصفحة: إن كان ممنوحاً أصلاً يقع الربط بصمت، وإلا
 *  فبطاقةٌ تشرح ما يُفتقد وتنتظر ضغطة. */
export function OwnerDeviceLink({ stationId }: { stationId: string }) {
  const [state, setState] = useState<'checking' | 'linked' | 'ask' | 'working' | 'failed'>(
    'checking'
  );

  const link = useCallback(async () => {
    const sub = await getPushSubscription();
    if (!sub) return false;
    const keys = (sub.toJSON() as { keys?: { p256dh?: string; auth?: string } }).keys;
    const { error } = await supabase.rpc('claim_owner_device', {
      p_token: sub.endpoint,
      p_station_id: stationId,
      p_platform: 'web',
      p_keys: keys ?? null,
    });
    return !error;
  }, [stationId]);

  useEffect(() => {
    // داخل التطبيق المثبَّت الربط واقعٌ في الصفحة نفسها بالرمز الأصلي.
    if (localStorage.getItem('device-token')) return setState('linked');
    if (typeof Notification === 'undefined') return setState('failed');
    if (Notification.permission !== 'granted') return setState('ask');
    link().then((ok) => setState(ok ? 'linked' : 'failed'));
  }, [link]);

  async function enable() {
    setState('working');
    const granted =
      Notification.permission === 'granted' || (await Notification.requestPermission()) === 'granted';
    if (!granted) return setState('ask');
    setState((await link()) ? 'linked' : 'failed');
  }

  // الصامت هو الصحيح: مربوطٌ فلا داعي لبطاقة، أو لمّا يُعرف بعدُ فلا يُخوَّف.
  if (state === 'checking' || state === 'linked') return null;

  return (
    <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
      <p className="flex items-center gap-2 text-sm font-extrabold text-amber-900">
        <BellRingIcon className="h-5 w-5 shrink-0" />
        لا يصلك تنبيه من المنصة
      </p>
      <p className="mt-2 text-xs leading-relaxed text-amber-900">
        جهازك غير مربوط بلوحة محطتك، فلا يصلك تذكير الصباح ولا تنبيه أن اليوم مضى
        بلا تحديث. ضغطة واحدة تكفي، ولا نطلب منك شيئاً بعدها.
      </p>
      {state === 'failed' && (
        <p className="mt-2 rounded-lg bg-white/70 p-2.5 text-xs leading-relaxed text-red-700">
          تعذّر الربط في هذا المتصفح. إن كنت في وضع التصفّح الخفي أو رفضت الإذن
          سابقاً فأعد فتح اللوحة من نافذة عادية، أو افتحها من التطبيق المثبَّت.
        </p>
      )}
      <button
        onClick={enable}
        disabled={state === 'working'}
        className="btn-primary mt-3 w-full gap-2 disabled:opacity-60"
      >
        {state === 'working' ? (
          <SpinnerIcon className="h-4 w-4" />
        ) : (
          <CheckIcon className="h-4 w-4" />
        )}
        فعّل تنبيهات محطتي
      </button>
    </section>
  );
}
