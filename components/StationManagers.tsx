'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ManagerRow } from '@/lib/updates';
import { StationUpdates } from './StationUpdates';

/** «أرقام إدارة المحطة» في لوحة المالك.
 *
 *  الإضافةُ من الإدارة (تحتاج إنشاءَ حساب)، والإيقافُ والتشغيلُ بيد صاحب
 *  المحطة الأساسيّ — الورديةُ ترى القائمةَ ولا تلمسها (سياسة
 *  «owner and admin toggle»). وتحتها سجلُّ التحديثات حسب الرقم. */
export function StationManagers({
  stationId,
  ownerId,
  stationPhone,
  isOwner,
  onChat,
}: {
  stationId: string;
  ownerId: string | null;
  stationPhone: string;
  isOwner: boolean;
  onChat: () => void;
}) {
  const [rows, setRows] = useState<ManagerRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('station_managers')
      .select('user_id, phone, label, active')
      .eq('station_id', stationId)
      .order('added_at');
    setRows((data ?? []) as ManagerRow[]);
  }, [stationId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function setActive(userId: string, active: boolean) {
    setBusy(userId);
    const prev = rows;
    setRows((r) => r.map((m) => (m.user_id === userId ? { ...m, active } : m)));
    const { error } = await supabase.from('station_managers').update({ active }).eq('user_id', userId);
    if (error) setRows(prev);
    setBusy(null);
  }

  async function allOn() {
    setBusy('all');
    const prev = rows;
    setRows((r) => r.map((m) => ({ ...m, active: true })));
    const { error } = await supabase.from('station_managers').update({ active: true }).eq('station_id', stationId);
    if (error) setRows(prev);
    setBusy(null);
  }

  const off = rows.filter((m) => !m.active).length;

  return (
    <>
      <section className="card p-5">
        <h3 className="text-sm font-bold">أرقام إدارة المحطة</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          {isOwner
            ? 'لأكثر من وردية: كلُّ رقمٍ حسابٌ بكلمة سرّه. توقفه وتشغّله من هنا، وتطلب إضافة رقمٍ من «الرسائل».'
            : 'تُضاف الأرقام وتُوقَف من صاحب المحطة أو الإدارة.'}
        </p>
        <ul className="mt-3 divide-y divide-slate-100">
          <li className="flex items-center justify-between gap-3 py-2.5">
            <span>
              <span dir="ltr" className="text-[13px] font-bold text-slate-800">{stationPhone}</span>
              <span className="ms-2 text-[11px] text-slate-500">الرقم الأساسي</span>
            </span>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-bold text-brand-700">فعّال دائماً</span>
          </li>
          {rows.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span dir="ltr" className="text-[13px] font-bold text-slate-800">{m.phone}</span>
                <span className="ms-2 text-[11px] text-slate-500">{m.label ?? 'رقم إضافي'}</span>
              </span>
              {isOwner ? (
                <button
                  type="button"
                  disabled={busy === m.user_id}
                  aria-pressed={m.active}
                  onClick={() => setActive(m.user_id, !m.active)}
                  className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${
                    m.active ? 'bg-brand text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {m.active ? 'مفعّل — أوقفه' : 'متوقّف — شغّله'}
                </button>
              ) : (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                    m.active ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {m.active ? 'مفعّل' : 'متوقّف'}
                </span>
              )}
            </li>
          ))}
        </ul>
        {rows.length === 0 && <p className="mt-2 text-center text-xs text-slate-400">لا أرقام إضافية بعد.</p>}
        {isOwner && off > 1 && (
          <button type="button" disabled={busy === 'all'} onClick={allOn} className="btn-ghost mt-3 w-full">
            تشغيل الكلّ
          </button>
        )}
        {isOwner && (
          <button type="button" onClick={onChat} className="btn-ghost mt-2 w-full">
            اطلب إضافة رقمٍ لوردية أخرى
          </button>
        )}
        <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
          الإيقاف يوقف الدخول وتذكيرات الهاتف وتيليغرام لهذا الرقم حتى يُشغَّل.
        </p>
      </section>
      <StationUpdates stationId={stationId} ownerId={ownerId} stationPhone={stationPhone} managers={rows} />
    </>
  );
}
