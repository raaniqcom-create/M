'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

/** طلبُ حذف الحساب — لا زرُّ حذفٍ مباشر.
 *
 *  «حذفُ الحساب لا تجعله خياراً متاحاً وإنّما تقديمَ طلب حذف حساب، ويشرح السببَ
 *  على ألّا يقلّ عن ٩٠ حرفاً» — صاحبُ المنصّة، ١٦ أيلول. الطلبُ رسالةٌ في
 *  محادثة المحطة مع الإدارة (station_messages)، والإدارةُ تنفّذه بيدها.
 *
 *  وكان زرُّ حذفٍ فوريّ لبند آبل 5.1.1(v): الطلبُ يُنفَّذ خلال أيّام، وهو ما
 *  تقبله المراجعةُ ما دام الحذفُ يقع. */
const MIN = 90;

export function DeleteAccount({ phone, stationId }: { phone: string; stationId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const left = MIN - reason.trim().length;

  async function send() {
    setBusy(true);
    setError('');
    const { error: e } = await supabase.from('station_messages').insert({
      station_id: stationId,
      sender: 'owner',
      body: `طلب حذف الحساب (${phone}).\nالسبب: ${reason.trim()}`,
    });
    setBusy(false);
    if (e) return setError('تعذّر إرسال الطلب. أعد المحاولة.');
    setSent(true);
  }

  return (
    <section className="card border-red-100 p-5">
      <h3 className="text-sm font-bold text-red-600">طلب حذف الحساب</h3>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        يُرسل الطلب إلى إدارة المنصّة وتنفّذه بعد مراجعته، ويُحذف حسابك ({phone}) وما يخصّه. لا يمكن التراجع بعد التنفيذ.
      </p>

      {sent ? (
        <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700">
          أُرسل الطلب إلى الإدارة. ستصلك إجابتها في «الرسائل».
        </p>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 w-full rounded-xl border border-red-200 px-3 py-2.5 text-sm font-bold text-red-600 active:bg-red-50"
        >
          تقديم طلب حذف الحساب
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-bold text-slate-600">
            سبب الحذف — ٩٠ حرفاً على الأقلّ
            <textarea
              value={reason}
              rows={4}
              onChange={(e) => setReason(e.target.value)}
              placeholder="اشرح السبب بوضوح: لماذا تريد حذف الحساب، وهل أغلقت المحطة أو انتقلت إدارتها…"
              className="field mt-1 py-2"
            />
          </label>
          <p className={`text-[11px] ${left > 0 ? 'text-slate-400' : 'text-brand-700'}`}>
            {left > 0 ? `بقي ${left} حرفاً` : 'الطول كافٍ'}
          </p>
          {error && <p className="text-xs font-bold text-traffic-red">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy || left > 0} onClick={send} className="btn-primary disabled:opacity-60">
              إرسال الطلب
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
              رجوع
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
