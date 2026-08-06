'use client';

import { useEffect, useState } from 'react';
import { subscribeToStation, unsubscribeFromStation, isSubscribed } from '@/lib/push';
import { BellIcon, BellRingIcon, SpinnerIcon } from './icons';

type State = 'idle' | 'loading' | 'on' | 'denied';

export function BellButton({ stationId }: { stationId: string }) {
  const [state, setState] = useState<State>('idle');

  useEffect(() => {
    isSubscribed(stationId).then((on) => on && setState('on'));
  }, [stationId]);

  async function handleClick() {
    if (state === 'loading') return;
    setState('loading');
    if (state === 'on') {
      await unsubscribeFromStation(stationId);
      setState('idle');
      return;
    }
    const ok = await subscribeToStation(stationId);
    setState(ok ? 'on' : 'denied');
  }

  const label = state === 'on' ? 'إيقاف تنبيهات هذه المحطة' : 'تفعيل تنبيهات هذه المحطة';

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={handleClick}
        aria-label={label}
        aria-pressed={state === 'on'}
        title={label}
        className={`flex h-11 w-11 items-center justify-center rounded-xl border transition-colors duration-200 ${
          state === 'on'
            ? 'border-brand bg-brand-100 text-brand'
            : 'border-slate-200 bg-white text-slate-500 active:bg-slate-50'
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
      {state === 'denied' && (
        <span className="mt-1 text-[10px] text-slate-400">التنبيهات مرفوضة</span>
      )}
    </div>
  );
}
