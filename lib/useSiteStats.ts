'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { randomId } from './uid';

// Every entry counts — the number is there to show station owners that the
// platform has real traffic. The only guard is against a stuck refresh loop
// or a double-mount inflating it within seconds of itself.
const LAST_COUNTED = 'visit-counted-at';
const MIN_GAP_MS = 10_000;

export function useSiteStats() {
  const [visits, setVisits] = useState<number | null>(null);
  const [online, setOnline] = useState(1);

  useEffect(() => {
    const last = Number(localStorage.getItem(LAST_COUNTED) ?? 0);
    const countThis = Date.now() - last > MIN_GAP_MS;

    if (countThis) localStorage.setItem(LAST_COUNTED, String(Date.now()));

    const read = () =>
      supabase
        .from('site_stats')
        .select('visits')
        .eq('id', 1)
        .maybeSingle()
        .then(({ data }) => data && setVisits(data.visits));

    if (countThis) {
      supabase.rpc('increment_visits').then(({ data, error }) => {
        // never leave the counter blank if the write is refused
        if (!error && typeof data === 'number') setVisits(data);
        else read();
      });
    } else {
      read();
    }

    // ── ولا قناةَ ثالثةً لعدّاد الزيارات ───────────────────────────────────
    //
    // كانت هنا قناةٌ تشترك في كلّ تعديلٍ على `site_stats` كي يتحرّك الرقمُ حيّاً
    // أمام الناظر. وهي أغلى ما في المنصّة بلا منازع، لأنّ الصفَّ الذي تراقبه
    // هو الصفُّ الذي **تكتبه كلُّ فتحةِ صفحة**: كلُّ زيارةٍ تُبثّ إلى كلّ جهازٍ
    // مفتوح. أي أنّ الرسائل = الزياراتُ × المتصلين، وهو حاصلُ ضربٍ يتضاعف
    // بمربّع النموّ. بالقياس: ٤٬٤٠٠ فتحةٍ في الساعة × ٤٩ متصلاً ≈ ٢١٥ ألف
    // رسالةٍ في الساعة، والحصّةُ المجّانيّة مليونان في الشهر.
    //
    // ولا يُخسر شيء: `increment_visits` تردّ العددَ الجديد (السطر أعلاه)،
    // و`read()` تقرؤه لمن لم يُحتسب. فالرقمُ صحيحٌ عند كلّ فتحة — وإنّما لا
    // يتسلّق أمام العين. وقناةُ الحضور تحته باقية: «المتصلون الآن» عددٌ حيٌّ
    // يراه صاحبُ المحطة فيعرف أنّ للمنصّة ناساً، وهو نصفُ الكلفة لا ضِعفُها.

    // Realtime Presence gives a genuine concurrent-viewer count — no polling,
    // and members drop off automatically when their socket closes.
    const presence = supabase.channel('online-visitors', {
      config: { presence: { key: randomId() } },
    });

    presence
      .on('presence', { event: 'sync' }, () => {
        setOnline(Object.keys(presence.presenceState()).length || 1);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') presence.track({ at: Date.now() });
      });

    return () => {
      supabase.removeChannel(presence);
    };
  }, []);

  return { visits, online };
}
