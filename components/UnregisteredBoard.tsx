'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { deviceId } from '@/lib/vote';
import { agoLabel } from '@/lib/freshness';
import { useAlertChoice } from '@/lib/alerts';
import { forCities, type OpenAnnouncement } from '@/lib/announcements';
import { PRODUCT_LABELS } from '@/lib/products';
import { CheckIcon, XIcon } from './icons';
import type { FuelProduct } from '@/types/database';

const VOTED = 'ann-vote:';

/** وقودٌ في محطة لم تنضمّ بعد — ويعرفه الناس لا نحن.
 *
 *  الإدارة تُعلن عن هذه المحطات إشعاراً، فيصل الخبر ثم يختفي: من فتح هاتفه بعد
 *  ساعة لا يجد له أثراً. فيبقى هنا طوال اليوم.
 *
 *  وأحمرُ لا أخضر، عن قصد. المحطة المسجّلة تقول متى تفتح وماذا لديها ومتى نفد،
 *  وصاحبها مسؤول عن كلمته. وهذه لا نعرف عنها إلا لحظةً واحدة مضت — فلا يُعرض
 *  خبرها بلون الثقة، ويُكتب عمره بجانبه دائماً.
 *
 *  ومن يُغلقه هم من وقفوا في الطابور — بشرطين:
 *
 *  · آخر ثلاثين دقيقة وحدها. صوتٌ قيل الصباح لا يصف طابور الظهر، والوقود يتغيّر
 *    في ساعة. وهي النافذة نفسها التي يعمل بها تقييم الازدحام، فلا يتعلّم
 *    المستخدم قاعدتين.
 *  · وبفارق أربعةٍ صافية لا بعدد مطلق. أربعةٌ مقابل ثلاثة ليست حكماً — فارقُ
 *    صوتٍ واحد يقلب الحال، ويكفي منافسٌ ومعه ثلاثة ليُخفي خبر جاره.
 *
 *  والمعروض هو الحاكم نفسه: عرضُ رقمٍ لا يقرّر شيئاً يُربك أكثر مما يُفيد. */
export function UnregisteredBoard({
  rows,
  onVoted,
}: {
  rows: OpenAnnouncement[];
  onVoted: () => void;
}) {
  const [mine, setMine] = useState<Record<string, 'yes' | 'no'>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { choice } = useAlertChoice();

  useEffect(() => {
    // ما صوّته هذا الجهاز — ليُعرض مختاراً بدل أن يبدو الزرّ بلا أثر.
    try {
      const found: Record<string, 'yes' | 'no'> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(VOTED)) {
          const v = localStorage.getItem(k);
          if (v === 'yes' || v === 'no') found[k.slice(VOTED.length)] = v;
        }
      }
      setMine(found);
    } catch {
      /* وضع خاص: الأزرار تعمل، ولا يُتذكّر ما اختير */
    }
  }, []);

  async function vote(id: string, verdict: 'yes' | 'no') {
    setBusy(id);
    const { error } = await supabase.rpc('vote_announcement', {
      p_id: id,
      p_device: deviceId(),
      p_verdict: verdict,
    });
    setBusy(null);
    if (error) return;
    setMine((m) => ({ ...m, [id]: verdict }));
    try {
      localStorage.setItem(VOTED + id, verdict);
    } catch {
      /* لا يُتذكّر، والصوت محفوظ في الخادم على أي حال */
    }
    // يُعاد التحميل: صوتُه قد يكون الرابع الذي يُخفي الصفّ.
    onVoted();
  }

  // من اختار مدينته لا يعنيه خبرُ مدينة أخرى — ونعتمد جمهور الإشعار نفسه
  // (cities) لا موقع المحطة، لأنه هو من قرّرت الإدارة أن الخبر يعنيه.
  // المسجّلة أولاً.
  //
  // خبرها أقوى سنداً: لوحتها تؤكّده، وصفحتها تحمل دوامها وبقية منتجاتها
  // وتقييم طابورها — والقارئ يستطيع التحقّق بضغطة. أمّا خبر غير المسجّلة فلا
  // نملك خلفه إلا لحظةً مضت. فالأوثق في الأعلى، والترتيب داخل كل قسم بالأحدث.
  const visible = [...forCities(rows, choice?.cities)].sort(
    (a, b) =>
      Number(!!b.station_id) - Number(!!a.station_id) ||
      new Date(b.send_at).getTime() - new Date(a.send_at).getTime()
  );

  if (!visible.length) return null;

  return (
    <section className="mt-4 rounded-2xl border-2 border-traffic-red bg-red-50 p-4">
      <h2 className="text-sm font-extrabold text-traffic-red">وصل الوقود — ساعد بتأكيده</h2>
      <p className="mt-1 text-[11px] leading-relaxed text-red-900/80">
        أخبارُ اليوم. ما كان من محطة مسجّلة فبيدها تصحيحه، وما كان من غيرها فلا نعرف عنه
        إلا لحظةً مضت — لا متى نفد ولا الازدحام. أنت من يعرف، ويُحتسب تصويت آخر نصف ساعة.
      </p>

      <ul className="mt-3 space-y-2">
        {visible.map((r, i) => (
          <li
            key={r.id}
            className={`rounded-xl bg-white p-3 ${
              r.station_id ? 'ring-1 ring-brand-100' : ''
            } ${
              // فاصلٌ صامت عند أول غير مسجّلة: القارئ يرى انتقال اللون فيفهم
              // أن ما تحته صنفٌ آخر، بلا عنوانٍ يُطيل اللوحة.
              !r.station_id && i > 0 && visible[i - 1].station_id
                ? 'mt-3 border-t-2 border-dashed border-red-200 pt-4'
                : ''
            }`}
          >
            <p className="text-sm font-bold leading-relaxed text-slate-800">
              <span className={r.station_id ? 'text-brand' : 'text-traffic-red'}>
                {r.origin_city ?? r.cities?.[0]}
              </span>
              {' — '}
              {r.product ? PRODUCT_LABELS[r.product] : 'وقود'}
              {' — '}
              {r.station_name}
              <span className="font-normal text-slate-400"> ({agoLabel(r.send_at)})</span>
            </p>

            {/* المسجّلة تُفتح صفحتها: هناك دوامها وبقية منتجاتها وتقييم طابورها —
                وكلّها أوثق ممّا يقوله خبرٌ عابر. */}
            {r.station_id && (
              <a
                href={`/station/${r.station_id}`}
                className="mt-0.5 inline-block text-[11px] font-bold text-brand underline"
              >
                محطة مسجّلة — افتح صفحتها
              </a>
            )}

            {/* الأصوات الحاكمة، ومدّتها مكتوبة — وإلا قرأ الناس «٧» بعد أن
                رأوا «٢٠» وظنّوا أن أصواتاً ضاعت. */}
            <p className="mt-1 text-[11px] text-slate-400">
              {r.station_id
                ? 'المحطة نفسها تؤكّده على لوحتها'
                : r.admin_verdict === 'available'
                ? 'إدارة المحطة التقنية تؤكّد التوفّر'
                : r.yes_votes + r.no_votes === 0
                  ? 'لا تصويت في آخر نصف ساعة — كن أوّل من يخبر'
                  : r.yes_votes - r.no_votes >= 4
                    ? `أكّده ${r.yes_votes} في آخر نصف ساعة`
                    : 'تصويت آخر نصف ساعة'}
            </p>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => vote(r.id, 'yes')}
                className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-60 ${
                  mine[r.id] === 'yes'
                    ? 'bg-brand text-white'
                    : 'bg-brand-50 text-brand-900 ring-1 ring-brand-100'
                }`}
              >
                <CheckIcon className="h-3.5 w-3.5" />
                ما زال متوفراً
                {r.yes_votes > 0 && <span className="font-normal">({r.yes_votes})</span>}
              </button>
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => vote(r.id, 'no')}
                className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-60 ${
                  mine[r.id] === 'no'
                    ? 'bg-traffic-red text-white'
                    : 'bg-white text-traffic-red ring-1 ring-red-200'
                }`}
              >
                <XIcon className="h-3.5 w-3.5" />
                نفد
                {r.no_votes > 0 && <span className="font-normal">({r.no_votes})</span>}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-red-900/70">
        الأخضر لمحطة مسجّلة — لوحتها تؤكّد الخبر، ويسقط متى رفعتْه. والأحمر لمحطة لم
        تنضمّ بعد، فلا تملك تصحيح بياناتها ولا نعلم عنها إلا ما وصلنا.
      </p>
    </section>
  );
}
