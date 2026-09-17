'use client';

import { useEffect, useState } from 'react';
import { readChoice } from '@/lib/alerts';
import { supabase } from '@/lib/supabase';
import {
  NOTICE_KIND,
  liveNotice,
  renderNotice,
  type ScheduleNoticeRow,
} from '@/lib/scheduleNotice';

/** اعتذارُ الجدول — حيث يُسأل السؤال.
 *
 *  من فتح صفحةَ الجدول فلم يجد جدولاً هو من يستحقّ الجواب. وكانت الصفحةُ
 *  تقول «لا جدولَ غداً بعد · يصل عادةً بعد التاسعة مساءً» — جملةٌ صحيحةٌ
 *  لكنّها لا تقول أيَّ شيءٍ عن هذه الليلة بعينها. فالاعتذارُ يعلوها.
 *
 *  ويُعرض فوق الحالتين معاً — لوحةٌ ممتلئةٌ ولوحةٌ فارغة: قد يصل جدولُ
 *  الرمادي ولا يصل جدولُ حديثة، فتمتلئ الصفحةُ ويبقى صاحبُ حديثة بلا خبر. */
export function ScheduleNotice({ dark = false }: { dark?: boolean } = {}) {
  const [notice, setNotice] = useState<ScheduleNoticeRow | null>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    let alive = true;
    void (async () => {
      // والسياسةُ في القاعدة ترشّح المنتهيَ وغيرَ المُرسَل، لكنّ `sent_at`
      // يُعاد فحصُه هنا: سياسةُ «admin write» هي `for all`، فالإداريُّ نفسُه
      // يرى مسوّداتِه لولا هذا — وهو حارسُ NewsTicker.tsx:52 نفسُه.
      const { data, error } = await supabase
        .from('announcements')
        .select('id, body, cities, expires_at')
        .eq('kind', NOTICE_KIND)
        .eq('active', true)
        .not('sent_at', 'is', null)
        .order('sent_at', { ascending: false })
        .limit(5);
      if (!alive || error) return;

      const mine = readChoice()?.cities ?? [];
      const hit = liveNotice((data ?? []) as ScheduleNoticeRow[], mine);
      if (!hit) return;
      setNotice(hit);
      setText(renderNotice(hit.body, hit.cities, mine));
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!notice) return null;
  return <NoticeCard text={text} dark={dark} />;
}

/** هيئةُ اللافتة — تعريفٌ واحدٌ تقرؤه الصفحةُ وشاشةُ الغد ومعاينةُ اللوحة.
 *
 *  ولولا ذلك لكانت المعاينةُ نسخةً ثانيةً من الأصناف، فتنحرف عن الأصل بعد
 *  تعديلٍ واحد — ويكتب المشغّلُ نصّاً يراه في لوحته على غير ما يراه الناس.
 *
 *  و`dark` كـ`PlateTurnBadge`: شاشةُ الغد خضراءُ غامرة، وصندوقٌ كهرمانيٌّ فاتحٌ
 *  فوقها بقعةٌ تُبهر ولا تُقرأ. «يستبدل النص بنص ابيض واضح» — صاحبُ المنصّة.
 *  فالنسخةُ الداكنةُ نصٌّ أبيضُ عريضٌ على لوحٍ شفيفٍ من عائلة بطاقات الشاشة
 *  نفسِها (bg-white/12)، فيُقرأ من بعيدٍ ولا يبدو غريباً عنها. */
export function NoticeCard({ text, dark = false }: { text: string; dark?: boolean }) {
  return (
    <div
      role="status"
      className={
        dark
          ? 'rounded-2xl bg-white/12 px-4 py-3.5 text-[13px] font-extrabold leading-relaxed text-white'
          : 'rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-[12.5px] font-bold leading-relaxed text-amber-900'
      }
    >
      {text}
    </div>
  );
}
