'use client';

import { supabase } from './supabase';

/** عدُّ «رآها موقوفة» — مرّةٌ لكلّ جهازٍ في اليوم لكلّ محطة، ونداءٌ واحدٌ
 *  للدفعة كلِّها. الحارسُ هنا في localStorage لا في القاعدة: أربعةَ عشرَ ألفَ
 *  جهازٍ لا تُرسل أكثرَ من نداءٍ واحدٍ في اليوم مهما فُتحت الصفحة. */
const KEY = 'silence-seen';

function dayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
}

function read(): { day: string; ids: string[] } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { day: string; ids: string[] } | null;
    if (v && v.day === dayKey() && Array.isArray(v.ids)) return v;
  } catch {
    /* لا شيء */
  }
  return { day: dayKey(), ids: [] };
}

/** تُنادى حين تظهر بطاقاتُ الموقوفات فعلاً على الشاشة. */
export async function recordSuspendedSeen(ids: string[]): Promise<void> {
  const seen = read();
  const fresh = ids.filter((id) => !seen.ids.includes(id));
  if (!fresh.length) return;
  // يُحفظ قبل النداء: فشلُ الشبكة لا يُغري بإعادة العدّ في الفتحة التالية.
  try {
    localStorage.setItem(KEY, JSON.stringify({ day: seen.day, ids: [...seen.ids, ...fresh] }));
  } catch {
    /* تصفّحٌ خاصّ: يُعدّ مرّةً في هذه الجلسة */
  }
  await supabase.rpc('silence_seen', { p_ids: fresh.slice(0, 60) });
}
