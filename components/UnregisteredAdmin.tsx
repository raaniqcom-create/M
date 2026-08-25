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
  hidden: boolean;
  hidden_reason: string | null;
}

/** إدارة أخبار المحطات غير المسجّلة — حين يخالف التصويتُ ما تعرفه الإدارة.
 *
 *  المصوّتون قد يكونون مرّوا قبل وصول الصهريج، وقد يكونون منافسين. فقرار الإدارة
 *  يسبق التصويت — ويُعرض باسمها صريحاً، بلا ادّعاء مصدرٍ بعينه.
 *
 *  وكانت الجملة المعروضة «أكّدته إدارة المنصّة بعد التواصل مع المحطة». والمصدر
 *  ليس المكالمة دائماً، فالجملة تصير كذباً صغيراً كلما كان غيرها — وثمنه ثقةُ
 *  القارئ في كل جملة أخرى تقولها المنصّة. فصارت تقول ما تملكه: من يؤكّد، لا كيف
 *  عرف.
 *
 *  ونصف ساعة لا أكثر. الإدارة لا تقف في الطابور ولا تعلم متى نفد، فبقاء قرارها
 *  إلى آخر اليوم يجعل خبراً ميتاً معلّقاً في وجه من يراه بعينه. وهي المدّة نفسها
 *  التي يسبق بها رأي المالك تصويت الازدحام — قاعدة واحدة في المنصّة لا اثنتان.
 *
 *  وتُعرض هنا الأخبار المخفيّة أيضاً: المخفيّ هو ما يُراجَع غالباً، وحجبه عن
 *  اللوحة التي تديره يجعلها بلا فائدة. */
export function UnregisteredAdmin() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [closeHm, setCloseHm] = useState('');
  const [savingHm, setSavingHm] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_announcements');
    if (error) {
      setErr('تعذّر تحميل الأخبار. تأكّد أنك داخل بحساب الإدارة.');
      setRows([]);
      return;
    }
    setErr(null);
    setRows((data ?? []) as Row[]);
    const { data: hm } = await supabase.rpc('get_unregistered_close');
    if (typeof hm === 'string') setCloseHm(hm);
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

  /** إلغاءٌ نهائي — لا كتمٌ لنصف ساعة.
   *
   *  «نفد» يكتب قراراً عمرُه ثلاثون دقيقة ثم يعود الحكم للتصويت. وهذا صوابٌ
   *  لادّعاءٍ إيجابي، وخطأٌ لإلغاء: من ضغط أراد أن يذهب الخبر. */
  async function retire(id: string, name: string) {
    if (!confirm(`إلغاء خبر «${name}» نهائياً؟

لن يعود بتصويتٍ ولا بمرور وقت.`)) return;
    setBusy(id);
    const { error } = await supabase.rpc('retire_announcement', { p_id: id });
    setBusy(null);
    if (error) return setErr(`تعذّر الإلغاء: ${error.message}`);
    setErr(null);
    load();
  }

  async function saveClose(hm: string) {
    setSavingHm(true);
    const { error } = await supabase.rpc('set_unregistered_close', { p_hm: hm });
    setSavingHm(false);
    if (error) return setErr('وقت غير صالح. اكتبه بصيغة 21:00.');
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
        أخبار اليوم التي أرسلتَها عن محطات لم تنضمّ. إن علمتَ أن التصويت لا يطابق الواقع —
        بمكالمة من المحطة أو بغيرها — فقرارك هنا يسبق تصويت الناس نصف ساعة، ثم يعود الحكم
        إليهم. ولا يُنسب للناس ما تقرّره أنت: يُعرض باسم إدارة المنصّة صريحاً.
      </p>

      {/* وقتٌ واحد لكل أخبار غير المسجّلة: هي لا تقول دوامها، والمسجّلة تقوله
          بنفسها. وبعده لا يُعرض خبر مهما أكّدته — ساحةٌ مغلقة لا تبيع. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3">
        <label htmlFor="close-hm" className="text-xs font-bold text-slate-600">
          تختفي الأخبار الساعة
        </label>
        <input
          id="close-hm"
          type="time"
          value={closeHm}
          onChange={(e) => setCloseHm(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold"
          dir="ltr"
        />
        <button
          type="button"
          disabled={savingHm || !/^([01]\d|2[0-3]):[0-5]\d$/.test(closeHm)}
          onClick={() => saveClose(closeHm)}
          className="rounded-lg bg-brand px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
        >
          احفظ
        </button>
        <span className="text-[11px] text-slate-400">بتوقيت بغداد · لكل المحطات غير المسجّلة</span>
      </div>

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
                  {r.hidden ? `مخفيّ — ${r.hidden_reason ?? 'سبب غير معروف'}` : 'ظاهر للناس'}
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

              {/* والإلغاء في صفٍّ وحده: زرٌّ يُنهي الخبر لا يُصفّ مع زرَّين
                  يُبدّلان رأياً. ومن يضغط الثلاثة متجاورةً يظنّها درجات. */}
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => retire(r.id, r.station_name)}
                className="mt-2 flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-xl bg-traffic-red text-xs font-bold text-white disabled:opacity-60"
              >
                <XIcon className="h-3.5 w-3.5" />
                ألغِ الخبر نهائياً
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        <b className="text-slate-600">«متوفر» و«نفد» قراران مؤقّتان — نصف ساعة ثم يعود
        الحكم إلى التصويت.</b> فإن أردتَ أن يذهب الخبر ولا يعود، فـ«ألغِ الخبر نهائياً»
        هو الزرّ — لا «نفد».
        <br />
        <br />
        و«للناس» يرفع قرارك فوراً. وبلا قرار منك يختفي الخبر في ثلاث حالات: أن يسبق «نفد»
        بأربعة أصوات صافية في آخر نصف ساعة، أو أن يسكن ساعتين بلا تصويت، أو أن يحلّ وقت
        الإغلاق أعلاه. وتأكيدك يُعيده ويُنعش ساعته — إلا بعد وقت الإغلاق، فهو مطلق.
      </p>
    </section>
  );
}
