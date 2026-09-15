'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { callFn } from '@/lib/fn';
import { normalizePhone } from '@/lib/phone';
import { loginOf, type ManagerRow } from '@/lib/updates';
import { SpinnerIcon } from './icons';
import { StationUpdates } from './StationUpdates';

/** «موظّفو المحطة» — للإدارة: إضافةٌ (تنشئ الحساب وتُصدر كلمته)،
 *  إيقافٌ وتشغيل، كلمةُ سرٍّ جديدة، حذف. وتحته سجلُّ التحديثات حسب الحساب. */
export function AdminStationManagers({
  stationId,
  stationName,
  ownerId,
  stationPhone,
}: {
  stationId: string;
  stationName: string;
  ownerId: string | null;
  stationPhone: string;
}) {
  const [rows, setRows] = useState<ManagerRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ login: string; phone: string | null; label: string | null; password: string; fresh: boolean } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('station_managers')
      .select('user_id, phone, username, label, active')
      .eq('station_id', stationId)
      .order('added_at');
    setRows((data ?? []) as ManagerRow[]);
  }, [stationId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    setErr(null);
    setBusy('add');
    const r = await callFn<{ login: string; phone: string | null; label: string | null; password: string }>('station-phone', {
      action: 'add_staff',
      stationId,
      login: phone,
      label,
    });
    setBusy(null);
    if (!r.ok || !r.data) return setErr(r.error ?? 'تعذّر إضافة الحساب');
    setIssued({ ...r.data, fresh: true });
    setPhone('');
    setLabel('');
    void load();
  }

  async function setActive(m: ManagerRow, active: boolean) {
    setBusy(m.user_id);
    const prev = rows;
    setRows((r) => r.map((x) => (x.user_id === m.user_id ? { ...x, active } : x)));
    const { error } = await supabase.from('station_managers').update({ active }).eq('user_id', m.user_id);
    if (error) {
      setRows(prev);
      setErr(`تعذّر التغيير: ${error.message}`);
    }
    setBusy(null);
  }

  async function allOn() {
    setBusy('all');
    const { error } = await supabase.from('station_managers').update({ active: true }).eq('station_id', stationId);
    setBusy(null);
    if (error) return setErr(`تعذّر التشغيل: ${error.message}`);
    void load();
  }

  async function password(m: ManagerRow) {
    if (!confirm(`كلمة سرّ جديدة للحساب ${loginOf(m)} (${m.label ?? 'موظّف'})؟\n\nتُبطل كلمته الحالية فوراً. لا تفعلها إلا بطلبه هو.`)) return;
    setErr(null);
    setBusy(`pw:${m.user_id}`);
    const r = await callFn<{ login: string; phone: string | null; password: string }>('station-phone', { action: 'password', stationId, login: loginOf(m) });
    setBusy(null);
    if (!r.ok || !r.data) return setErr(r.error ?? 'تعذّر إصدار كلمة السرّ');
    setIssued({ login: r.data.login, phone: r.data.phone, label: m.label, password: r.data.password, fresh: false });
  }

  async function remove(m: ManagerRow) {
    if (!confirm(`حذف الحساب ${loginOf(m)} من موظّفي «${stationName}»؟\n\nيفقد الدخول والإشعارات فوراً؛ حسابه يبقى ليُعاد لاحقاً.`)) return;
    setBusy(`rm:${m.user_id}`);
    const { error } = await supabase.from('station_managers').delete().eq('user_id', m.user_id);
    setBusy(null);
    if (error) return setErr(`تعذّر الحذف: ${error.message}`);
    void load();
  }

  const msg = issued
    ? `المحطة التقنية — ${issued.fresh ? `أُضيف حسابُك لإدارة «${stationName}»` : `بيانات دخول «${stationName}»`}\n` +
      `اسم الدخول: ${issued.login}\n` +
      `كلمة المرور: ${issued.password}\n` +
      `الدخول من: https://muhta.online/login\n` +
      `غيّرها بعد أوّل دخول من «كلمة المرور» في لوحتك.`
    : '';

  return (
    <>
      <section className="card p-5">
        <h2 className="text-sm font-bold">موظّفو المحطة</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          حساباتٌ إضافيّة تحدّث الحالة وترى الشكاوي والرسائل: باسم دخولٍ أو رقم، كلٌّ بكلمة سرّه. يضيفها صاحبُ
          المحطة من لوحته أو أنت من هنا، وتُوقَف وتُشغَّل من الجهتين. الرقم الأساسي أعلاه لا يُوقَف — انقله إن أردت تغييره.
        </p>

        <ul className="mt-3 divide-y divide-slate-100">
          {rows.map((m) => (
            <li key={m.user_id} className="py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span dir="ltr" className="text-[13px] font-bold text-slate-800">{loginOf(m)}</span>
                  <span className="ms-2 text-[11px] text-slate-500">{m.label ?? 'موظّف'}</span>
                </span>
                <button
                  type="button"
                  disabled={busy === m.user_id}
                  aria-pressed={m.active}
                  onClick={() => setActive(m, !m.active)}
                  className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${
                    m.active ? 'bg-brand text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {m.active ? 'مفعّل' : 'متوقّف'}
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" disabled={busy === `pw:${m.user_id}`} onClick={() => password(m)} className="btn-ghost px-2 text-xs">
                  {busy === `pw:${m.user_id}` ? <SpinnerIcon className="h-4 w-4" /> : 'كلمة سرّ'}
                </button>
                <button type="button" disabled={busy === `rm:${m.user_id}`} onClick={() => remove(m)} className="btn-ghost px-2 text-xs text-traffic-red">
                  حذف
                </button>
              </div>
            </li>
          ))}
        </ul>
        {rows.length === 0 && <p className="mt-2 text-center text-xs text-slate-400">لا موظّفين بعد.</p>}
        {rows.some((m) => !m.active) && (
          <button type="button" disabled={busy === 'all'} onClick={allOn} className="btn-ghost mt-2 w-full">
            تشغيل الكلّ
          </button>
        )}
        <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
          الإيقاف يوقف الدخول وتذكيرات الهاتف وتيليغرام لهذا الحساب حتى يُشغَّل.
        </p>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-xs font-bold text-slate-600">إضافة موظّف</p>
          <p className="mt-0.5 text-[10.5px] text-slate-400">اسمُ دخولٍ بالإنجليزيّة من ٤ أحرف فأكثر، أو رقمُ هاتف.</p>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="username / 07XXXXXXXXX"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            dir="ltr"
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base"
          />
          <input
            value={label}
            maxLength={20}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="الاسم أو الوصف: أحمد — المساء"
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base"
          />
          <button
            type="button"
            disabled={busy === 'add' || phone.trim().length < 4}
            onClick={add}
            className="btn-primary mt-2 w-full disabled:opacity-60"
          >
            {busy === 'add' ? <SpinnerIcon className="h-4 w-4" /> : 'إضافة الحساب'}
          </button>
          {err && (
            <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-traffic-red">{err}</p>
          )}
          {issued && (
            <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50 p-4">
              <p className="text-xs font-bold text-brand-900">
                {issued.fresh ? 'أُضيف الحساب — كلمة السرّ تُعرض مرّةً واحدة' : 'كلمة السرّ الجديدة — تُعرض مرّةً واحدة'}
              </p>
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
                <button type="button" onClick={() => void navigator.clipboard.writeText(msg)} className="btn-ghost px-2 text-xs">
                  نسخ البيانات
                </button>
                {issued.phone && (
                  <a
                    href={`https://wa.me/964${normalizePhone(issued.phone)}?text=${encodeURIComponent(msg)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary px-2 text-xs"
                  >
                    إرسال عبر واتساب
                  </a>
                )}
                <button type="button" onClick={() => setIssued(null)} className="btn-ghost px-2 text-xs">
                  إخفاء
                </button>
              </div>
              <p className="mt-2 text-[10.5px] text-slate-500">
                لا تُحفظ هنا. إن كان للاسم أو الرقم حسابٌ سابق فقد أُصدرت له كلمةٌ جديدة وأُبطلت القديمة.
              </p>
            </div>
          )}
        </div>
      </section>
      <StationUpdates stationId={stationId} ownerId={ownerId} stationPhone={stationPhone} managers={rows} />
    </>
  );
}
