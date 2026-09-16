'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { currentTarget } from '@/lib/alerts';
import { BellRingIcon, CheckIcon, SpinnerIcon } from './icons';
import { Sheet } from './Sheet';

/** يربط لوحةَ المغسلة بجهاز صاحبها كي يصله «حجزٌ جديد» — نسخةُ OwnerDeviceLink
 *  بـclaim_wash_device: الرمزُ يُكتب على صفّ المغسلة لا على device_tokens. */
const isNative = () =>
  !!(globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

export function WashDeviceLink({ linked }: { linked: boolean }) {
  const [state, setState] = useState<'checking' | 'linked' | 'ask' | 'working' | 'failed' | 'denied'>(linked ? 'linked' : 'checking');
  const [dismissed, setDismissed] = useState(false);

  const link = useCallback(async () => {
    const t = await currentTarget();
    if (t === 'denied') return 'denied' as const;
    if (t === 'unsupported' || t === 'pending') return 'failed' as const;
    const { error } = await supabase.rpc('claim_wash_device', { p_token: t.address, p_platform: t.channel, p_keys: t.keys ?? null });
    return error ? ('failed' as const) : ('linked' as const);
  }, []);

  useEffect(() => {
    if (linked) return;
    // إذنٌ ممنوحٌ أصلاً → ربطٌ صامت؛ وإلّا ورقةٌ تنتظر ضغطة.
    if (isNative()) {
      if (localStorage.getItem('device-token')) link().then(setState);
      else setState('ask');
      return;
    }
    if (typeof Notification === 'undefined') return setState('failed');
    if (Notification.permission !== 'granted') return setState('ask');
    link().then(setState);
  }, [link, linked]);

  async function enable() {
    setState('working');
    setState(await link());
  }

  const open = !dismissed && state !== 'checking' && state !== 'linked';
  return (
    <Sheet open={open} onClose={() => setDismissed(true)} title="ليصلك كلُّ حجزٍ جديد">
      <p className="flex items-center gap-2 text-sm font-extrabold text-amber-900">
        <BellRingIcon className="h-5 w-5 shrink-0" />
        جهازك غير مربوط بلوحة مغسلتك
      </p>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">
        بعد الربط يصلك إشعارٌ عند كلّ حجزٍ جديد وكلّ إلغاء، وتنبيهٌ قبل انتهاء اشتراكك. اسمح بالتنبيهات مرّةً واحدة.
      </p>
      {state === 'denied' && (
        <p className="mt-2 rounded-lg bg-red-50 p-2.5 text-xs leading-relaxed text-red-700">
          {isNative()
            ? 'الإشعاراتُ ممنوعةٌ لهذا التطبيق في إعدادات هاتفك. اسمح بها من الإعدادات ثمّ عد واضغط الزرّ.'
            : 'رفضتَ الإذن سابقاً في هذا المتصفح. اسمح بالإشعارات من إعدادات الموقع ثمّ أعد المحاولة.'}
        </p>
      )}
      {state === 'failed' && (
        <p className="mt-2 rounded-lg bg-red-50 p-2.5 text-xs leading-relaxed text-red-700">تعذّر الربط الآن — حاول من التطبيق أو أعد المحاولة لاحقاً.</p>
      )}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={enable} disabled={state === 'working'} className="btn-primary flex-[2]">
          {state === 'working' ? <SpinnerIcon className="h-4 w-4" /> : <CheckIcon className="h-4 w-4" />}
          فعّل الإشعارات
        </button>
        <button type="button" onClick={() => setDismissed(true)} className="btn-ghost flex-1">
          لاحقاً
        </button>
      </div>
    </Sheet>
  );
}
