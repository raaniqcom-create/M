'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { hoursLabel, isOpenNow } from '@/lib/hours';
import { CheckIcon, SpinnerIcon } from './icons';
import { TimeSelect } from './TimeSelect';
import type { Station } from '@/types/database';

// Availability is only useful while the pumps are actually running — a driver
// sent to a closed station is worse off than one told nothing.
export function WorkingHours({
  station,
  onChange,
}: {
  station: Station;
  onChange: (patch: Partial<Station>) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(patch: Partial<Station>) {
    onChange(patch);
    setSaving(true);
    await supabase.from('stations').update(patch).eq('id', station.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const open = isOpenNow(station);

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">أوقات العمل</h3>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
            open ? 'bg-brand-100 text-brand' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {open ? 'مفتوحة الآن' : 'مغلقة الآن'}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        خارج هذه الأوقات تظهر محطتك للمستخدمين كمغلقة، ولا يُطلب منهم التوجّه إليها.
      </p>

      <label className="mt-3 flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 px-3">
        <input
          type="checkbox"
          checked={station.is_24h}
          onChange={(e) => save({ is_24h: e.target.checked })}
          className="h-4 w-4 accent-[#16a34a]"
        />
        <span className="text-sm font-medium">مفتوحة 24 ساعة</span>
      </label>

      {!station.is_24h && (
        <div className="mt-2 space-y-3">
          <TimeSelect
            id="opens"
            label="وقت الفتح"
            value={station.opens_at}
            onChange={(v) => save({ opens_at: v })}
          />
          <TimeSelect
            id="closes"
            label="وقت الإغلاق"
            value={station.closes_at}
            onChange={(v) => save({ closes_at: v })}
          />
        </div>
      )}

      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
        {saving && <SpinnerIcon className="h-3.5 w-3.5" />}
        {saved && <CheckIcon className="h-3.5 w-3.5 text-brand" />}
        {saved ? 'تم الحفظ' : hoursLabel(station)}
      </p>
    </section>
  );
}
