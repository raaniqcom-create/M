'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isFresh, isOpenNow } from '@/lib/hours';
import { SpinnerIcon } from './icons';
import type { Station } from '@/types/database';

interface Row extends Station {
  station_products: { updated_at: string | null }[];
}

/** What the admin needs to know before deciding anything: who is out there,
 *  and which stations are actually doing the one job they signed up for.
 *
 *  "Committed" is deliberately measured, not declared. A station that set
 *  opening hours and never touches the app is worse than one that never set
 *  them — the driver reads its hours, drives over, and finds a claim nobody
 *  has stood behind since last week. So the number that matters is: is it open
 *  right now by its own hours, and has anyone updated it inside the freshness
 *  window the app itself uses to decide what to show. */
export function AdminStats() {
  const [devices, setDevices] = useState<Record<string, number> | null>(null);
  const [listeners, setListeners] = useState<Record<string, number> | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    // device_tokens and alerts grant SELECT to nobody — reading them from the
    // browser returned [] and the whole panel showed zeros. The counts come
    // from a security-definer function that hands back numbers only: the admin
    // never needs a device token or a push endpoint, so nobody gets one.
    const [stats, s] = await Promise.all([
      supabase.rpc('admin_stats'),
      supabase
        .from('stations')
        .select('*, station_products(updated_at)')
        .in('status', ['approved', 'suspended']),
    ]);

    if (stats.error) {
      setFailed(true);
      setDevices({});
      setListeners({});
    } else {
      const v = stats.data as { devices: Record<string, number>; listeners: Record<string, number> };
      setDevices(v?.devices ?? {});
      setListeners(v?.listeners ?? {});
    }
    setRows((s.data as Row[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!rows || !devices || !listeners) {
    return (
      <div className="card flex justify-center p-8">
        <SpinnerIcon className="h-5 w-5 text-brand" />
      </div>
    );
  }

  const ios = devices.ios ?? 0;
  const android = devices.android ?? 0;
  const web = listeners.web ?? 0;
  const subscribed = (listeners.ios ?? 0) + (listeners.android ?? 0) + web;

  const open = rows.filter((s) => isOpenNow(s));
  const updatedToday = rows.filter((s) =>
    (s.station_products ?? []).some((p) => isFresh(p.updated_at))
  );
  // open by its own declared hours AND standing behind what it published
  const committed = rows.filter(
    (s) => isOpenNow(s) && (s.station_products ?? []).some((p) => isFresh(p.updated_at))
  );
  const silent = rows.filter(
    (s) => !(s.station_products ?? []).some((p) => isFresh(p.updated_at))
  );
  const tempClosed = rows.filter((s) => s.temp_closed);

  const pct = (n: number) => (rows.length ? Math.round((n / rows.length) * 100) : 0);

  return (
    <div className="space-y-4">
      {failed && (
        <p className="card p-4 text-xs leading-relaxed text-traffic-red">
          تعذّر قراءة أرقام المستخدمين. تأكد أنك داخل بحساب الإدارة، ثم أعد تحميل الصفحة.
        </p>
      )}

      <section className="card p-5">
        <h2 className="text-sm font-bold">المستخدمون</h2>
        <p className="mt-1 text-xs text-slate-400">أجهزة سجّلت نفسها في النظام</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="آيفون" value={ios} />
          <Stat label="أندرويد" value={android} />
          <Stat label="متصفح" value={web} />
        </div>
        <p className="mt-3 rounded-xl bg-brand-50 p-3 text-xs leading-relaxed text-brand-900">
          <strong>{subscribed}</strong> منهم فعّلوا التنبيهات واختاروا مدينتهم ونوع الوقود —
          وهؤلاء وحدهم من يصلهم الإشعار.
          {ios + android > 0 && subscribed < ios + android && (
            <>
              {' '}
              <strong>{ios + android + web - subscribed}</strong> نزّلوا ولم يختاروا بعد.
            </>
          )}
        </p>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-bold">المحطات</h2>
        <p className="mt-1 text-xs text-slate-400">
          من أصل {rows.length} محطة معتمدة
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="مفتوحة الآن" value={open.length} />
          <Stat label="حدّثت اليوم" value={updatedToday.length} />
          <Stat label="ملتزمة" value={committed.length} tone="brand" />
        </div>

        <div className="mt-4 space-y-2">
          <Bar label="ملتزمة — مفتوحة ومحدَّثة" n={committed.length} pct={pct(committed.length)} tone="brand" />
          <Bar label="لم تحدّث منذ أكثر من يوم" n={silent.length} pct={pct(silent.length)} tone="red" />
          <Bar label="مغلقة مؤقتاً بإعلانها" n={tempClosed.length} pct={pct(tempClosed.length)} tone="slate" />
        </div>

        {silent.length > 0 && (
          <>
            <p className="mt-4 text-xs font-bold text-slate-700">تحتاج اتصالاً:</p>
            <ul className="mt-2 space-y-1.5">
              {silent.slice(0, 8).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                  <a href={`/admin/station/?id=${s.id}`} className="font-semibold text-brand-700 underline">
                    {s.name}
                  </a>
                  <span className="shrink-0 text-slate-400" dir="ltr">
                    {s.phone}
                  </span>
                </li>
              ))}
            </ul>
            {silent.length > 8 && (
              <p className="mt-2 text-[11px] text-slate-400">و{silent.length - 8} غيرها</p>
            )}
          </>
        )}

        {rows.length === 0 && (
          <p className="mt-3 text-sm text-slate-400">لا توجد محطات معتمدة بعد</p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'brand' }) {
  return (
    <div className={`rounded-xl py-2.5 text-center ${tone === 'brand' ? 'bg-brand-50' : 'bg-slate-50'}`}>
      <p className={`text-lg font-extrabold leading-none ${tone === 'brand' ? 'text-brand-700' : 'text-slate-700'}`}>
        {value}
      </p>
      <p className="mt-1 text-[11px] font-semibold text-slate-500">{label}</p>
    </div>
  );
}

function Bar({ label, n, pct, tone }: { label: string; n: number; pct: number; tone: 'brand' | 'red' | 'slate' }) {
  const fill = tone === 'brand' ? 'bg-brand' : tone === 'red' ? 'bg-traffic-red' : 'bg-slate-300';
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-semibold">
        <span className="text-slate-600">{label}</span>
        <span className="text-slate-400">
          {n} · {pct}%
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
