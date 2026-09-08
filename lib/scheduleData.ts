import { supabase } from './supabase';
import type { StationWithStatus } from '@/types/database';
import { baghdadDate } from './board';

export * from './board';

/** قراءةُ الجدول المنشور من القاعدة.
 *
 *  والحسابُ كلُّه في `lib/board.ts` — بلا شبكةٍ فيُفحص بـnode. */

/** صفوفُ اليوم والغد. وسياسةُ الجدول تحجب ما مضى، فالمرشّحُ هنا للترتيب لا
 *  للأمن. */
export async function loadSchedule() {
  const { data, error } = await supabase
    .from('fuel_schedule')
    .select('id, for_date, product, batch_id, raw_name, station_name, city, linked_station_id, note')
    .gte('for_date', baghdadDate())
    .order('for_date')
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as import('./board').ScheduleRow[];
}

/** لوحاتُ المحطات التي أعلنت وعداً لهذا اليوم — لا المحطاتُ كلُّها.
 *
 *  ── ولماذا لا `loadStations()` ─────────────────────────────────────────
 *
 *  لأنّها أربعةُ استعلاماتٍ تجلب كلَّ محطةٍ وكلَّ صفِّ منتجٍ وجدولَي الازدحام.
 *  و`TomorrowScreen` مركَّبةٌ في `app/layout.tsx` — أي أنّها تعمل في **كلّ**
 *  فتحةِ صفحة. فجعلُها تنادي `loadStations` ضاعف أثقلَ استعلامٍ في المنصّة
 *  على كلّ زيارة، بجانب نداءِ الصفحة الرئيسة نفسِها. وهو ثِقلٌ أدخلتُه ولا
 *  يحتاجه الجدول: لا يلزمه إلا الصفوفُ التي وُعد فيها بهذا اليوم.
 *
 *  فاستعلامان صغيران: صفوفُ الوعد، ثمّ محطاتُها بأسمائها ودوامِها — ودوامُها
 *  لازمٌ لأنّ `isOffered` تسأل عنه. */
export async function loadExpected(day: string): Promise<StationWithStatus[]> {
  const { data: rows, error } = await supabase
    .from('station_products')
    .select('station_id, product, is_available, expected_at, expected_period, runs_out_at, updated_at')
    .eq('expected_at', day);
  if (error) throw error;
  if (!rows?.length) return [];

  const ids = [...new Set(rows.map((r) => r.station_id as string))];
  const { data: sts, error: e2 } = await supabase
    .from('stations_public')
    .select('id, name, city, is_24h, opens_at, closes_at, temp_closed')
    .in('id', ids)
    .eq('status', 'approved')
    .eq('is_demo', false);
  if (e2) throw e2;

  return (sts ?? []).map((st) => ({
    ...(st as Record<string, unknown>),
    products: rows.filter((r) => r.station_id === st.id),
    traffic: null,
    productTraffic: [],
  })) as unknown as StationWithStatus[];
}
