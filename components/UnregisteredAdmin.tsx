'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { agoLabel } from '@/lib/freshness';
import { PRODUCT_LABELS } from '@/lib/products';
import { CheckIcon, SpinnerIcon, XIcon } from './icons';
import type { FuelProduct } from '@/types/database';

interface Row {
  id: string;
  station_name: string;
  origin_city: string | null;
  product: FuelProduct | null;
  cities: string[] | null;
  send_at: string;
  yes_votes: number;
  no_votes: number;
  admin_verdict: 'available' | 'gone' | null;
  admin_until: string | null;
}

/** إدارة أخبار المحطات غير المسجّلة — حين تتّصل المحطة وتقول إن التصويت خاطئ.
 *
 *  المصوّتون قد يكونون مرّوا قبل وصول الصهريج، وقد يكونون منافسين. وصاحب
 *  الساحة يعرف ساحته. فقرار الإدارة — المسنود إلى مكالمة معه — يسبق التصويت.
 *
 *  ونصف ساعة لا أكثر. الإدارة لا تقف في الطابور ولا تعلم متى نفد، فبقاء قرارها
 *  إلى آخر اليوم يجعل خبراً ميتاً معلّقاً في وجه من يراه بعينه. وهي المدّة نفسها
 *  التي يسبق بها رأي المالك تصويت الازدحام — قاعدة واحدة في المنصّة لا اثنتان.
 *
 *  وتُعرض هنا الأخبار المخفيّة أيضاً: المخفيّ هو ما تتّصل بشأنه المحطة، وحجبه
 *  عن اللوحة التي تديره يجعلها بلا فائدة. */
export function UnregisteredAdmin() {
  const [rows, setRows] = useState<(Row & { hidden: boolean })[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_announcements');
    if (error) {
      setErr('تعذّر تحميل الأخبار. تأكّد أنك داخل بحساب الإدارة.');
      setRows([]);
      return;
    }
    setErr(null);
    setRows((data ?? []) as (Row & { hidden: boolean })[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, verdict: 'available' | 'gone' | null) {
    setBusy(id);
    const { error } = await supabase.rpc('set_announcement_verdict', {
      p_id: id,
      p_verdict: verdict,
    });
    setBusy(null);
    // الخطأ يُقال ولا يُبتلع: قرارٌ يبدو منفَّذاً وهو لم يقع يترك خبراً خاطئاً
    // معروضاً على آلاف، وأنت تظنّه عولج.
    if (error) return setErr(`تعذّر حفظ القرار: ${error.message}`);
    setErr(null);
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
      <h2 className="text-sm font-bold">إدارة المحطات غير المسجّلة</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        أخبار اليوم التي أرسلتَها عن محطات لم تنضمّ. إن اتّصلت المحطة وقالت إن التصويت
        خاطئ، فقرارك هنا يسبق تصويت الناس — نصف ساعة، ثم يعود الحكم إليهم.
      </p>

      {err && (
        <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-bold leading-relaxed text-traffic-red">
          {err}
        </p>
      )}

      {rows.length === 0 && (
        <p className="mt-4 text-center text-xs text-slate-400">لا خبر عن محطة غير مسجّلة اليوم.</p>
      )}

      <ul className="mt-3 space-y-2">
        {rows.map((r) => {
          const lead = r.yes_votes - r.no_votes;
          return (
            <li
              key={r.id}
              className={`rounded-xl border p-3 ${
                r.hidden ? 'border-slate-200 bg-slate-50' : 'border-brand-100 bg-white'
              }`}
            >
              <p className="text-sm font-bold leading-relaxed text-slate-800">
                {r.origin_city ?? r.cities?.[0]} — {r.product ? PRODUCT_LABELS[r.product] : 'وقود'} —{' '}
                {r.station_name}
                <span className="font-normal text-slate-400"> ({agoLabel(r.send_at)})</span>
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span
                  className={`rounded-full px-2 py-0.5 font-bold ${
                    r.hidden ? 'bg-red-50 text-traffic-red' : 'bg-brand-50 text-brand-900'
                  }`}
                >
                  {r.hidden ? 'مخفيّ عن الناس' : 'ظاهر للناس'}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">
                  آخر نصف ساعة: {r.yes_votes} ما زال · {r.no_votes} نفد
                  {lead !== 0 && ` (فارق ${Math.abs(lead)})`}
                </span>
                {r.admin_verdict && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 font-bold text-amber-800">
                    قرارك: {r.admin_verdict === 'available' ? 'متوفر' : 'نفد'} — يسقط{' '}
                    {r.admin_until
                      ? new Date(r.admin_until).toLocaleTimeString('ar-IQ', {
                          timeZone: 'Asia/Baghdad',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                  </span>
                )}
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => decide(r.id, 'available')}
                  className="flex min-h-[36px] items-center justify-center gap-1 rounded-xl bg-brand-50 text-xs font-bold text-brand-900 ring-1 ring-brand-100 disabled:opacity-60"
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                  متوفر
                </button>
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => decide(r.id, 'gone')}
                  className="flex min-h-[36px] items-center justify-center gap-1 rounded-xl bg-white text-xs font-bold text-traffic-red ring-1 ring-red-200 disabled:opacity-60"
                >
                  <XIcon className="h-3.5 w-3.5" />
                  نفد
                </button>
                <button
                  type="button"
                  disabled={busy === r.id || !r.admin_verdict}
                  onClick={() => decide(r.id, null)}
                  className="min-h-[36px] rounded-xl bg-white text-xs font-bold text-slate-500 ring-1 ring-slate-200 disabled:opacity-40"
                >
                  للناس
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        «للناس» يرفع قرارك فوراً ويعيد الحكم إلى التصويت بلا انتظار. وبلا قرار منك، يختفي
        الخبر حين يسبق «نفد» بأربعة أصوات صافية في آخر نصف ساعة.
      </p>
    </section>
  );
}
