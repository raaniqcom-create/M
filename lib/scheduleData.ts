import { supabase } from './supabase';
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
