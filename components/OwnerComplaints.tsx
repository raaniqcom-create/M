'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SpinnerIcon } from './icons';

type Complaint = {
  id: string;
  reason: string;
  note: string | null;
  created_at: string;
  resolved_at: string | null;
};

/** شكاوى الناس على هذه المحطة — قراءةً فقط.
 *
 *  القالبُ نفسُه الذي يراه المدير في `app/admin/station` بلا زرّ «تمّت
 *  المعالجة»: المعالجةَ تُثبتها الإدارةُ بعد أن تتحقّق، لا صاحبُ المحطة عن
 *  نفسه. والصفُّ لا يحمل هويّةَ المشتكي أصلاً، فلا يُكشف أحد.
 *
 *  والقراءةُ تمرّ بسياسة `complaints_owner_read`: محطتُه وحدَها. */
export function OwnerComplaints({ stationId }: { stationId: string }) {
  const [rows, setRows] = useState<Complaint[] | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase
      .from('complaints')
      .select('id, reason, note, created_at, resolved_at')
      .eq('station_id', stationId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setErr(true);
        setRows((data as Complaint[]) ?? []);
      });
    return () => {
      alive = false;
    };
  }, [stationId]);

  return (
    <section className="card p-5">
      <h3 className="text-sm font-bold">الشكاوي</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        ما يرسله الناس عن محطتك. اقرأه وصحّح ما يلزم — والمعالجةَ تُثبتها الإدارة.
      </p>

      {rows === null ? (
        <SpinnerIcon className="mx-auto mt-4 h-5 w-5 text-slate-300" />
      ) : err ? (
        <p className="mt-3 text-xs font-bold text-traffic-red">تعذّر جلب الشكاوى — أعد المحاولة.</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">لا شكاوى على محطتك.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {rows.map((c) => (
            <li key={c.id} className="py-2.5">
              <p
                className={`text-sm font-semibold ${c.resolved_at ? 'text-slate-400 line-through' : 'text-slate-700'}`}
              >
                {c.reason}
              </p>
              {c.note && <p className="mt-0.5 text-xs text-slate-500">{c.note}</p>}
              <p className="mt-0.5 text-[11px] text-slate-400">
                {new Intl.DateTimeFormat('ar-IQ', {
                  timeZone: 'Asia/Baghdad',
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(c.created_at))}
                {c.resolved_at && ' · عالجتها الإدارة'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
