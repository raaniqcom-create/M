'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PRODUCT_LABELS } from '@/lib/products';
import { SpinnerIcon, XIcon } from './icons';
import type { FuelProduct } from '@/types/database';

interface Pending {
  id: string;
  title: string;
  body: string;
  cities: string[] | null;
  product: FuelProduct | null;
  send_at: string;
  station_name: string | null;
}

/** أخبارٌ جُدولت ولم تُرسل بعد — وبابُ التراجع عنها.
 *
 *  الإدارة تجدول إعلاناً ثم يتغيّر الحال: ينفد الوقود، أو يُخطئ الاسم، أو تعتذر
 *  المحطة. وبلا هذه الشاشة لا سبيل إلى إيقافه — يُكتب في الجدول وينتظر، ثم
 *  تُرسله المِكنسة إلى ألف جهاز. وإشعارٌ أُرسل لا يُستردّ.
 *
 *  والسباق حقيقي: المِكنسة تعمل كل دقيقتين وتحجز الخبر بضربة تضع sent_at. فقد
 *  يضغط المدير «ألغِ» بعد الحجز بثانية. ولذلك تردّ الدالة هل أدركته أم فات —
 *  والشاشة تقول أيّهما وقع، لا «تم» في الحالتين. */
export function PendingAnnouncements() {
  const [rows, setRows] = useState<Pending[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('pending_announcements');
    if (error) {
      setFailed(true);
      setRows([]);
      return;
    }
    setFailed(false);
    setRows((data ?? []) as Pending[]);
  }, []);

  useEffect(() => {
    load();
    // كل نصف دقيقة: خبرٌ اقترب موعده يجب أن يختفي من هنا قبل أن يضغط أحدٌ زرّاً
    // لن يفعل شيئاً.
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function cancel(r: Pending) {
    setBusy(r.id);
    const { data, error } = await supabase.rpc('cancel_announcement', { p_id: r.id });
    setBusy(null);
    if (error) {
      setNote(`تعذّر الإلغاء: ${error.message}`);
      return;
    }
    setNote(
      data === true
        ? `أُلغي قبل الإرسال — لن يصل أحداً.`
        : `فات الأوان: الخبر خرج إلى الأجهزة قبل ضغطتك بلحظات، ولا يُستردّ.`
    );
    load();
  }

  if (!rows) {
    return (
      <section className="card flex justify-center p-8">
        <SpinnerIcon className="h-5 w-5 text-brand" />
      </section>
    );
  }

  return (
    <section className="card p-5">
      <h2 className="text-sm font-bold">أخبار مجدولة لم تُرسل بعد</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        ما زال بالإمكان إيقافها. وبعد خروجها إلى الأجهزة لا تُستردّ — فراجعها هنا إن تغيّر
        شيء قبل موعدها.
      </p>

      {failed && (
        <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-bold text-traffic-red">
          تعذّر التحميل. تأكّد أنك داخل بحساب الإدارة.
        </p>
      )}

      {note && (
        <p
          className={`mt-3 rounded-xl p-3 text-xs font-bold leading-relaxed ${
            note.startsWith('أُلغي') ? 'bg-brand-50 text-brand-900' : 'bg-red-50 text-traffic-red'
          }`}
        >
          {note}
        </p>
      )}

      {rows.length === 0 && !failed && (
        <p className="mt-4 text-center text-xs text-slate-400">لا خبر ينتظر الإرسال.</p>
      )}

      <ul className="mt-3 space-y-2">
        {rows.map((r) => {
          const when = new Date(r.send_at);
          const mins = Math.round((when.getTime() - Date.now()) / 60_000);
          return (
            <li key={r.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-bold leading-relaxed text-slate-800">
                {r.station_name ?? r.title}
                {r.product && (
                  <span className="font-normal text-slate-500"> · {PRODUCT_LABELS[r.product]}</span>
                )}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                {(r.cities ?? []).join('، ') || 'كل المدن'}
              </p>
              <p className="mt-1 text-[11px] font-bold text-amber-800">
                يُرسل{' '}
                {when.toLocaleString('ar-IQ', {
                  timeZone: 'Asia/Baghdad',
                  hour: '2-digit',
                  minute: '2-digit',
                  day: '2-digit',
                  month: '2-digit',
                })}
                {mins > 0 && mins < 600 && ` — بعد ${mins} دقيقة`}
                {mins <= 0 && ' — الآن، قد يكون خرج'}
              </p>

              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => cancel(r)}
                className="mt-2 flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-xl bg-white text-xs font-bold text-traffic-red ring-1 ring-red-200 disabled:opacity-60"
              >
                <XIcon className="h-3.5 w-3.5" />
                ألغِ قبل الإرسال
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
