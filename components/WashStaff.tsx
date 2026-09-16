'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { callFn } from '@/lib/fn';
import { normalizePhone } from '@/lib/phone';
import { loginOf, type ManagerRow } from '@/lib/updates';
import { SpinnerIcon } from './icons';

/** «موظّفو المغسلة» — نسخةُ StationManagers بـwash_managers وadd_wash_staff.
 *  الموظّفُ يحدّث الحجوزاتِ ويسجّل السيّاراتِ؛ ولا يمسّ الاشتراكَ ولا الخدماتِ ولا العروض. */
export function WashStaff({
  washId,
  washName,
  washPhone,
  isOwner,
  staffLimit,
}: {
  washId: string;
  washName: string;
  washPhone: string;
  isOwner: boolean;
  staffLimit: number;
}) {
  const [rows, setRows] = useState<ManagerRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [login, setLogin] = useState('');
  const [label, setLabel] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ login: string; phone: string | null; password: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('wash_managers').select('user_id, phone, username, label, active').eq('wash_id', washId).order('added_at');
    setRows((data ?? []) as ManagerRow[]);
  }, [washId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    setErr(null);
    setBusy('add');
    const r = await callFn<{ login: string; phone: string | null; password: string }>('station-phone', { action: 'add_wash_staff', stationId: washId, login, label });
    setBusy(null);
    if (!r.ok || !r.data) return setErr(r.error ?? 'تعذّر إضافة الحساب');
    setIssued(r.data);
    setLogin('');
    setLabel('');
    void load();
  }

  async function setActive(userId: string, active: boolean) {
    setBusy(userId);
    const prev = rows;
    setRows((r) => r.map((m) => (m.user_id === userId ? { ...m, active } : m)));
    const { error } = await supabase.from('wash_managers').update({ active }).eq('user_id', userId);
    if (error) setRows(prev);
    setBusy(null);
  }

  const msg = issued
    ? `المحطة التقنية — حسابُك لإدارة حجوزات «${washName}»\nاسم الدخول: ${issued.login}\nكلمة المرور: ${issued.password}\nالدخول من: https://muhta.online/login\nغيّرها بعد أوّل دخول.`
    : '';
  const canAdd = isOwner && (staffLimit === 0 ? false : rows.length < staffLimit);

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-slate-100">
        <li className="flex items-center justify-between gap-3 py-2.5">
          <span>
            <span dir="ltr" className="text-[13px] font-bold text-slate-800">{washPhone}</span>
            <span className="ms-2 text-[11px] text-slate-500">الحساب الأساسي</span>
          </span>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-bold text-brand-700">فعّال دائماً</span>
        </li>
        {rows.map((m) => (
          <li key={m.user_id} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span dir="ltr" className="text-[13px] font-bold text-slate-800">{loginOf(m)}</span>
              <span className="ms-2 text-[11px] text-slate-500">{m.label ?? 'موظّف'}</span>
            </span>
            {isOwner ? (
              <button type="button" disabled={busy === m.user_id} aria-pressed={m.active} onClick={() => setActive(m.user_id, !m.active)} className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-extrabold ${m.active ? 'bg-brand text-white' : 'bg-slate-200 text-slate-600'}`}>
                {m.active ? 'مفعّل — أوقفه' : 'متوقّف — شغّله'}
              </button>
            ) : (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${m.active ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>{m.active ? 'مفعّل' : 'متوقّف'}</span>
            )}
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="text-center text-xs text-slate-400">لا موظّفين بعد.</p>}
      <p className="text-[10.5px] text-slate-400">
        الموظّفُ يؤكّد الحجوزاتِ ويُتمّها ويسجّل السيّارات — ولا يغيّر الخدماتِ ولا الأسعارَ ولا الاشتراك. باقتك: {staffLimit === 0 ? 'بلا موظّفين' : `${staffLimit} موظّفين`}.
      </p>

      {isOwner && (
        <div className="border-t border-slate-100 pt-3">
          <p className="text-xs font-bold text-slate-600">إضافة موظّف</p>
          <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="username / 07XXXXXXXXX" autoCapitalize="none" autoCorrect="off" spellCheck={false} dir="ltr" className="field mt-2" />
          <input value={label} maxLength={20} onChange={(e) => setLabel(e.target.value)} placeholder="الاسم أو الوصف: أحمد — المساء" className="field mt-2" />
          <button type="button" disabled={!canAdd || busy === 'add' || login.trim().length < 4} onClick={add} className="btn-primary mt-2 w-full disabled:opacity-60">
            {busy === 'add' ? <SpinnerIcon className="h-4 w-4" /> : 'إضافة الحساب'}
          </button>
          {!canAdd && <p className="mt-1.5 text-[10.5px] text-amber-800">{staffLimit === 0 ? 'الموظّفون ميزةُ الباقة الاحترافيّة فما فوق.' : 'بلغتَ حدَّ باقتك من الموظّفين.'}</p>}
          {err && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-traffic-red">{err}</p>}
          {issued && (
            <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50 p-4">
              <p className="text-xs font-bold text-brand-900">أُضيف الحساب — كلمة السرّ تُعرض مرّةً واحدة</p>
              <dl className="mt-2 space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[11px] text-slate-500">اسم الدخول</dt>
                  <dd dir="ltr" className="font-mono text-sm font-bold tracking-wide text-slate-800">{issued.login}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[11px] text-slate-500">كلمة المرور</dt>
                  <dd dir="ltr" className="font-mono text-sm font-bold tracking-wide text-slate-800">{issued.password}</dd>
                </div>
              </dl>
              <div className={`mt-3 grid gap-2 ${issued.phone ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <button type="button" onClick={() => void navigator.clipboard.writeText(msg)} className="btn-ghost px-2 text-xs">نسخ البيانات</button>
                {issued.phone && (
                  <a href={`https://wa.me/964${normalizePhone(issued.phone)}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer" className="btn-primary px-2 text-xs">إرسال عبر واتساب</a>
                )}
                <button type="button" onClick={() => setIssued(null)} className="btn-ghost px-2 text-xs">إخفاء</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
