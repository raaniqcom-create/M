'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { agoLabel } from '@/lib/freshness';
import { actorName, describeChange, type ManagerRow, type UpdateRow } from '@/lib/updates';
import { SpinnerIcon } from './icons';

/** «سجلّ التحديثات» — آخرُ ثلاثين تحديثاً: من أيّ رقمٍ ومتى.
 *
 *  يُجلب عند أوّل فتح لا عند تحميل الصفحة: ثقلٌ لا تحتاجه كلُّ فتحةِ لوحة. */
export function StationUpdates({
  stationId,
  ownerId,
  stationPhone,
  managers,
}: {
  stationId: string;
  ownerId: string | null;
  stationPhone: string;
  managers: ManagerRow[];
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<UpdateRow[] | null>(null);
  const [who, setWho] = useState<string>('');

  useEffect(() => {
    if (!open || rows) return;
    let alive = true;
    supabase
      .from('station_updates')
      .select('id, product, change, actor, created_at')
      .eq('station_id', stationId)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => alive && setRows((data ?? []) as UpdateRow[]));
    return () => {
      alive = false;
    };
  }, [open, rows, stationId]);

  const named = useMemo(
    () => (rows ?? []).map((r) => ({ ...r, by: actorName(r.actor, ownerId, stationPhone, managers) })),
    [rows, ownerId, stationPhone, managers]
  );
  const actors = useMemo(() => [...new Set(named.map((r) => r.by))], [named]);
  const shown = who ? named.filter((r) => r.by === who) : named;

  return (
    <section className="card p-5">
      <h3 className="text-sm font-bold">سجلّ التحديثات</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">آخر ٣٠ تحديثاً: من أيّ رقمٍ ومتى.</p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost mt-3 w-full">
          عرض السجلّ
        </button>
      ) : rows === null ? (
        <div className="flex justify-center py-6">
          <SpinnerIcon className="h-5 w-5 text-brand" />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-center text-xs text-slate-400">لا تحديثات بعد.</p>
      ) : (
        <>
          {actors.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {['', ...actors].map((a) => (
                <button
                  key={a || '*'}
                  type="button"
                  onClick={() => setWho(a)}
                  aria-pressed={who === a}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    who === a ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {a || 'الكلّ'}
                </button>
              ))}
            </div>
          )}
          <ul className="mt-3 divide-y divide-slate-100">
            {shown.map((r) => (
              <li key={r.id} className="py-2">
                <p className="text-[12.5px] font-bold text-slate-800">{describeChange(r.product, r.change)}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  <span className="font-bold text-brand-700">{r.by}</span> · {agoLabel(r.created_at)}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
