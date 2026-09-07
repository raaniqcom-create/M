import { supabase } from './supabase';
import type { FuelProduct } from '@/types/database';

/** قراءةُ جدول الغد من القاعدة.
 *
 *  منفصلٌ عن `lib/schedule.ts` عمداً: ذاك تحليلٌ ومطابقةٌ خالصان بلا شبكة،
 *  يعملان في المتصفّح وفي دالّةٍ طرفيّة على Deno سواءً. ولو استورد `supabase`
 *  لَما عمل في الثانية. */

export interface ScheduleRow {
  id: string;
  for_date: string;
  product: FuelProduct;
  batch_id: string;
  raw_name: string;
  station_name: string;
  city: string | null;
  linked_station_id: string | null;
  note: string | null;
}

/** «اليوم» و«غداً» بتقويم بغداد لا بساعة الجهاز.
 *
 *  هاتفٌ مضبوطٌ على توقيتٍ آخر كان سيقرأ جدولَ الغد جدولَ بعد غد. و`en-CA`
 *  هي الصيغةُ الوحيدة التي تُخرج YYYY-MM-DD جاهزةً للمقارنة النصّية. */
export function baghdadDate(plusDays = 0): string {
  return new Date(Date.now() + plusDays * 86_400_000).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Baghdad',
  });
}

/** صفوفُ اليوم والغد. وسياسةُ الجدول تحجب ما مضى، فالمرشّحُ هنا للترتيب لا
 *  للأمن. */
export async function loadSchedule(): Promise<ScheduleRow[]> {
  const { data, error } = await supabase
    .from('fuel_schedule')
    .select('id, for_date, product, batch_id, raw_name, station_name, city, linked_station_id, note')
    .gte('for_date', baghdadDate())
    .order('for_date')
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as ScheduleRow[];
}

/** مجموعةٌ واحدة: **ناحيةٌ في يوم**، ومنتجاتُها عمودٌ داخلها. */
export interface ScheduleGroup {
  for_date: string;
  /** `null` ناحيةٌ لم تُعرف — تُعرض آخراً ولا تُنسب إلى أحد. */
  city: string | null;
  rows: ScheduleRow[];
  products: FuelProduct[];
}

/** يُجمَع بالناحية داخل اليوم — لا بالمنتج.
 *
 *  ── ولماذا تبدّل الجمع ──────────────────────────────────────────────────
 *
 *  كان الجمعُ بالمنتج: «بانزين عادي — غداً» ثمّ قائمةُ محطاتٍ من نواحٍ شتّى.
 *  وهو يجيب سؤالاً لا يسأله أحد. والسؤالُ الذي يُفتح له التطبيقُ ناحيةٌ لا
 *  منتج: **«ما الذي يصل ناحيتي غداً؟»** — ومن يسكن الرمادي لا يقرأ سطراً عن
 *  الخالدية ولو كان المنتجُ نفسَه.
 *
 *  وقرارُ صاحب المنصّة نصَّ عليه: جدولٌ لكلّ ناحيةٍ ولو بمحطةٍ واحدة، والمنتجُ
 *  عمودٌ فيه. فليلةٌ فيها محطةٌ على المحسّن وسبعٌ على العادي تُقرأ في جدولٍ
 *  واحدٍ لا في جدولين متباعدين.
 *
 *  و`prefer` نواحي القارئ: تُرفع إلى الأعلى ولا يُحجب غيرُها — الترتيبُ
 *  خدمةٌ، والحجبُ قرارٌ آخر يُتّخذ في مكانه. */
export function groupSchedule(rows: ScheduleRow[], prefer: string[] = []): ScheduleGroup[] {
  const mine = new Set(prefer);
  const map = new Map<string, ScheduleGroup>();

  for (const r of rows) {
    const key = `${r.for_date}|${r.city ?? ''}`;
    const g = map.get(key) ?? {
      for_date: r.for_date,
      city: r.city ?? null,
      rows: [],
      products: [],
    };
    g.rows.push(r);
    map.set(key, g);
  }

  for (const g of map.values()) {
    // المسجّلةُ أوّلاً: لها صفحةٌ وحالةٌ تُقرأ الآن، وغيرُها اسمٌ وصلنا.
    g.rows.sort(
      (a, b) =>
        Number(Boolean(b.linked_station_id)) - Number(Boolean(a.linked_station_id)) ||
        a.station_name.localeCompare(b.station_name, 'ar')
    );
    g.products = [...new Set(g.rows.map((r) => r.product))];
  }

  return [...map.values()].sort(
    (a, b) =>
      a.for_date.localeCompare(b.for_date) ||
      // ناحيةٌ مجهولةٌ آخراً دائماً، ثمّ نواحي القارئ، ثمّ الباقي بالأبجدية.
      Number(a.city === null) - Number(b.city === null) ||
      Number(mine.has(b.city ?? '')) - Number(mine.has(a.city ?? '')) ||
      // ثمّ الأكبرُ خبراً: من لم يختر نواحيَه يرى أكثرَها محطاتٍ أوّلاً بدل
      // أن تتقدّمه ناحيةٌ بمحطةٍ واحدةٍ لأنّ حرفَها أسبقُ في الأبجدية.
      b.rows.length - a.rows.length ||
      (a.city ?? '').localeCompare(b.city ?? '', 'ar')
  );
}
