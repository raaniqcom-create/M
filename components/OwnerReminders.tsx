'use client';

import { useEffect, useState } from 'react';
import { isSubscribed, subscribeToStation, unsubscribeFromStation } from '@/lib/push';
import { BellIcon, BellRingIcon, SpinnerIcon } from './icons';

type State = 'idle' | 'loading' | 'on' | 'denied';

// Owners forget to flip products back; a reminder that reaches a locked phone
// is the only one that lands while they're on the forecourt.
export function OwnerReminders({ stationId }: { stationId: string }) {
  const [state, setState] = useState<State>('idle');

  useEffect(() => {
    isSubscribed(stationId, 'owner').then((on) => on && setState('on'));
  }, [stationId]);

  async function toggle() {
    if (state === 'loading') return;
    setState('loading');

    if (state === 'on') {
      await unsubscribeFromStation(stationId, 'owner');
      setState('idle');
      return;
    }
    const ok = await subscribeToStation(stationId, 'owner');
    setState(ok ? 'on' : 'denied');
  }

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold">تذكير تحديث الحالة</h3>
          <p className="mt-1 text-xs text-slate-500">
            يصلك تنبيه على هاتفك كل ٣٠ دقيقة أثناء ساعات عملك — حتى والتطبيق مغلق — لتحديث
            توفر المنتجات وحالة الازدحام.
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={state === 'on'}
          aria-label={state === 'on' ? 'إيقاف التذكير' : 'تفعيل التذكير'}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors duration-200 ${
            state === 'on'
              ? 'border-brand bg-brand-100 text-brand'
              : 'border-slate-200 bg-white text-slate-500'
          }`}
        >
          {state === 'loading' ? (
            <SpinnerIcon />
          ) : state === 'on' ? (
            <BellRingIcon />
          ) : (
            <BellIcon />
          )}
        </button>
      </div>

      {state === 'loading' && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          جارِ التفعيل… قد يستغرق بضع ثوانٍ في المرة الأولى فقط.
        </p>
      )}
      {state === 'on' && (
        <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs font-semibold text-brand">
          التذكير مفعّل على هذا الجهاز
        </p>
      )}
      {state === 'denied' && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-traffic-red">
          الإشعارات مرفوضة في المتصفح. فعّلها من إعدادات الموقع ثم أعد المحاولة.
        </p>
      )}
    </section>
  );
}
