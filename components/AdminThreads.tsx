'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ageLabel } from '@/lib/hours';
import { SpinnerIcon } from './icons';

interface Thread {
  stationId: string;
  name: string;
  city: string;
  sender: 'admin' | 'owner' | 'system';
  body: string;
  at: string;
  unread: number;
}

/** بيتُ المحادثات في لوحة الإدارة.
 *
 *  **قِيل إن قائمة المحطات بشاراتها تكفي — والقياسُ ردّه.** الشارةُ لا تظهر
 *  إلا حين يردّ صاحبُ محطة، فقبل أوّل ردٍّ لا أثرَ للميزة في أيّ مكان: بُنيت
 *  ونُشرت وقال المالك «لم تظهر». وبابٌ لا يُرى بابٌ لا يُطرَق.
 *
 *  ولا منظورَ جديد لأجله: ثمانٍ وعشرون محطة، فمئتا صفٍّ بترتيبٍ نازل تكفي
 *  لآخر رسالةٍ في كل مجرى، والتجميعُ في المتصفّح. ومنظورٌ في القاعدة لهذا
 *  هجرةٌ تُصان مقابل حسابٍ لا يُحسّ. */
export function AdminThreads() {
  const [rows, setRows] = useState<Thread[] | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const [{ data: msgs }, { data: un }] = await Promise.all([
        supabase
          .from('station_messages')
          .select('station_id, sender, body, created_at, stations(name, city)')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase.from('station_unread').select('station_id, unread'),
      ]);
      if (!live) return;

      const unread = new Map((un ?? []).map((r) => [r.station_id as string, r.unread as number]));
      const seen = new Map<string, Thread>();
      for (const m of (msgs ?? []) as unknown as {
        station_id: string;
        sender: Thread['sender'];
        body: string;
        created_at: string;
        stations: { name: string; city: string } | null;
      }[]) {
        // النزولُ يعني أن أوّلَ ما يُصادَف لكل محطةٍ هو آخرُ رسالةٍ فيها
        if (seen.has(m.station_id) || !m.stations) continue;
        seen.set(m.station_id, {
          stationId: m.station_id,
          name: m.stations.name,
          city: m.stations.city,
          sender: m.sender,
          body: m.body,
          at: m.created_at,
          unread: unread.get(m.station_id) ?? 0,
        });
      }
      setRows([...seen.values()]);
    })();
    return () => {
      live = false;
    };
  }, []);

  if (rows === null) {
    return (
      <div className="flex justify-center py-10">
        <SpinnerIcon className="h-5 w-5 text-brand" />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="card p-5 text-center">
        <h3 className="text-sm font-bold">لا محادثات بعد</h3>
        <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-500">
          افتح محطةً من تبويب <b>المحطات</b> واكتب لها في «المحادثة مع صاحب المحطة» —
          تصل إلى هاتفه ويردّ من لوحته. وتذكيراتُ النظام اليومية تظهر هنا أيضاً.
        </p>
      </div>
    );
  }

  return (
    <ul className="card divide-y divide-slate-100 p-4">
      {rows.map((t) => (
        <li key={t.stationId} className="py-2.5 first:pt-0 last:pb-0">
          <a href={`/admin/station/?id=${t.stationId}`} className="block">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm font-bold text-brand-700 underline">{t.name}</span>
                {t.unread > 0 && (
                  <span className="shrink-0 rounded-full bg-traffic-red px-1.5 py-px text-[10px] font-extrabold text-white">
                    {t.unread}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[10px] text-slate-400">{ageLabel(t.at)}</span>
            </div>
            <p className="mt-0.5 truncate text-[11.5px] text-slate-500">
              <span className="font-bold text-slate-400">
                {t.sender === 'owner' ? 'هو: ' : t.sender === 'admin' ? 'نحن: ' : 'تلقائي: '}
              </span>
              {t.body}
            </p>
            <p className="text-[10px] text-slate-400">{t.city}</p>
          </a>
        </li>
      ))}
    </ul>
  );
}
