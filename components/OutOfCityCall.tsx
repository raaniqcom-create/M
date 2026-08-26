'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAlertChoice } from '@/lib/alerts';
import { PhoneIcon } from './icons';

/** شريطٌ أحمر أسفل بطاقة محطةٍ تُخفي رقمها — لمن يأتي من مدينةٍ أخرى.
 *
 *  مواطنٌ من الفلوجة رأى محطةً معلَناً فيها المنتج، فقطع 27.8 كم إلى الخالدية،
 *  فوجدها لا تلتزم. والمحطة تُخفي رقمها — فلم يملك أن يتحقّق قبل أن يتحرّك.
 *
 *  وصاحب المحطة أخفى رقمه لسبب: مكالماتٌ لا تنتهي من أهل مدينته، وأكثرها يسأل
 *  عمّا هو مكتوبٌ على صفحته. فالإخفاء يبقى عمّن يستطيع أن يمرّ بها، ويُفتح لمن
 *  بينه وبينها مدينةٌ كاملة.
 *
 *  والمدينة هي **الأساسية المحفوظة** لا نطاق التصفّح اللحظي: من وسّع نطاقه
 *  ليرى الأنبار كلّها لم يتغيّر مكانه، ومن سكن الخالدية يبقى من أهلها وإن
 *  تصفّح الفلوجة.
 *
 *  ولا يُجلب الرقم إلا لمن يستحقّه: نداءٌ واحد لكل بطاقةٍ مؤهَّلة، وأكثرها
 *  لا يُنادى أصلاً لأن سبع محطات من أربعٍ وعشرين تُخفي رقمها. */
export function OutOfCityCall({
  stationId,
  stationCity,
  phoneHidden,
}: {
  stationId: string;
  stationCity: string;
  phoneHidden?: boolean | null;
}) {
  const { choice } = useAlertChoice();
  const [phone, setPhone] = useState<string | null>(null);

  const mine = choice?.cities?.length ? choice.cities : null;
  const away = !!phoneHidden && !!mine && !mine.includes(stationCity);

  useEffect(() => {
    if (!away) return;
    let cancelled = false;
    supabase
      .rpc('station_phone_for', { p_station: stationId, p_city: mine![0] })
      .then(({ data }) => {
        if (!cancelled && typeof data === 'string' && data) setPhone(data);
      });
    return () => {
      cancelled = true;
    };
  }, [away, stationId, mine]);

  if (!phoneHidden) return null;

  // زائرٌ لا نعرف مدينته. لا يُفتح له الرقم — واحترامُ خصوصية المحطة يقتضي
  // ألّا يُفتح لمجهول. لكنه يُخبَر بالطريق، فيصير الاختيار مكسباً له وللمنصّة.
  if (!mine) {
    return (
      <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
        هذه المحطة تُخفي رقمها عن أهل مدينتها.{' '}
        <a href="/alerts" className="font-bold text-brand underline">
          اختر مدينتك
        </a>{' '}
        — فإن كنتَ من مدينةٍ أخرى ظهر لك الرقم لتتصل قبل أن تتحرّك.
      </p>
    );
  }

  if (!away) return null;

  return (
    <div className="mt-2 rounded-xl border-2 border-traffic-red bg-red-50 px-3 py-2.5">
      <p className="text-[11px] font-bold leading-relaxed text-red-900">
        أنت من <b>{mine[0]}</b> وهذه المحطة في <b>{stationCity}</b> — لا تقطع الطريق قبل أن
        تتصل.
      </p>
      <p className="mt-1 text-[10px] leading-relaxed text-red-900/70">
        رقمها مخفيٌّ عن أهل مدينتها احتراماً لها، وفُتح لك لأنك مسافر. تأكّد من التوفّر قبل
        أن تتحرّك.
      </p>
      {phone ? (
        <a
          href={`tel:${phone}`}
          className="mt-2 flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-lg bg-traffic-red text-xs font-extrabold text-white"
        >
          <PhoneIcon className="h-4 w-4" />
          اتصل بالمحطة قبل أن تتحرّك
        </a>
      ) : (
        <p className="mt-2 text-center text-[10px] text-red-900/60">جارٍ جلب الرقم…</p>
      )}
    </div>
  );
}
