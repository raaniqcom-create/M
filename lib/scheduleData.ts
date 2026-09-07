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

/** مجموعةٌ واحدة: وقودٌ ليومٍ واحد، ومحطاتُه مرتَّبةً بالمدينة. */
export interface ScheduleGroup {
  for_date: string;
  product: FuelProduct;
  rows: ScheduleRow[];
  cities: string[];
}

/** يُجمَع بالوقود داخل اليوم — لا بالمحطة.
 *
 *  لأنّ السؤالَ الذي يُفتح له التطبيقُ «أين البانزين العادي غداً؟» لا «ماذا
 *  في محطة السينما؟». والمحطةُ لها صفحتُها. */
export function groupSchedule(rows: ScheduleRow[]): ScheduleGroup[] {
  const map = new Map<string, ScheduleGroup>();
  for (const r of rows) {
    const key = `${r.for_date}|${r.product}`;
    const g =
      map.get(key) ?? { for_date: r.for_date, product: r.product, rows: [], cities: [] };
    g.rows.push(r);
    map.set(key, g);
  }
  for (const g of map.values()) {
    g.rows.sort((a, b) => (a.city ?? 'ي').localeCompare(b.city ?? 'ي', 'ar'));
    g.cities = [...new Set(g.rows.map((r) => r.city).filter(Boolean) as string[])];
  }
  return [...map.values()].sort((a, b) => a.for_date.localeCompare(b.for_date));
}
