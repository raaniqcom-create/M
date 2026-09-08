import { supabase } from './supabase';
import type { StationWithStatus } from '@/types/database';
import type { BoardOverride, ScheduleRow } from './board';
import { baghdadDate } from './board';

export * from './board';

/** قراءةُ الجدول المنشور من القاعدة.
 *
 *  والحسابُ كلُّه في `lib/board.ts` — بلا شبكةٍ فيُفحص بـnode. */

/** ــ نداءٌ واحدٌ لكلّ يومٍ في كلّ صفحة ــــــــــــــــــــــــــــــــــــــ
 *
 *  سطحان يسألان السؤالَ نفسَه في اللحظة نفسِها: `TomorrowScreen` المركَّبةُ في
 *  `app/layout.tsx`، وصفحةُ `/schedule` نفسُها. ففتحُ الجدول كان أربعةَ
 *  استعلامات، نصفُها جوابٌ مطابقٌ حرفاً بحرف.
 *
 *  فذاكرةٌ للوعد لا للنتيجة، بمفتاح اليوم: النداءُ الثاني يلتحق بالأوّل وهو
 *  في الطريق. وتُمسح عند الفشل كي لا يُخلَّد خطأٌ عابر، وعمرُها عمرُ الصفحة —
 *  فتنقّلٌ في التطبيق يعيد بناءها، والحيّةُ تُبلغ التغيّرَ على كلٍّ. */
const inFlight = new Map<string, Promise<unknown>>();

function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  const had = inFlight.get(key) as Promise<T> | undefined;
  if (had) return had;
  const p = run().catch((e) => {
    inFlight.delete(key);
    throw e;
  });
  inFlight.set(key, p);
  return p;
}

/** صفوفُ اليوم والغد. وسياسةُ الجدول تحجب ما مضى، فالمرشّحُ هنا للترتيب لا
 *  للأمن. */
export async function loadSchedule() {
  return once(`schedule|${baghdadDate()}`, fetchSchedule);
}

async function fetchSchedule() {
  const { data, error } = await supabase
    .from('fuel_schedule')
    .select('id, for_date, product, batch_id, raw_name, station_name, city, linked_station_id, note')
    .gte('for_date', baghdadDate())
    .order('for_date')
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as import('./board').ScheduleRow[];
}

/** علاماتُ المشغّل على لوحة اليوم — إخفاءٌ أو وسمُ «نفد».
 *
 *  تُقرأ مع الجدول ومن المنفذ نفسِه، فتصل السطوحَ الثلاثة معاً: `/schedule`،
 *  وشاشةَ «محطات اليوم» (وهي في `app/layout.tsx` أي في كلّ فتحة)، ولوحةَ الفرع.
 *  ولو صُفّيت في أحدها لَاختلفت ثلاثتُها فيما تعرضه للناس. */
export async function loadOverrides(): Promise<BoardOverride[]> {
  return once(`overrides|${baghdadDate()}`, async () => {
    const { data, error } = await supabase
      .from('board_overrides')
      .select('for_date, city, station_id, station_name, product, action')
      .gte('for_date', baghdadDate());
    // العلاماتُ ترفٌ يُصحّح، لا شرطٌ للعرض: فشلُ جلبها يُبقي اللوحةَ كما هي
    // ولا يُفرغها. وإفراغُ لوحةٍ لأنّ استعلامَ تصحيحٍ سقط عطلٌ أسوأُ من عدمه.
    if (error) return [];
    return (data ?? []) as BoardOverride[];
  });
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
 *  ── ومحطاتُ الجدول، لا الواعداتُ وحدَهنّ ────────────────────────────────
 *
 *  كانت تجلب صفوفَ `expected_at = day` وحدَها، فمحطةٌ مسجَّلةٌ ورد اسمُها في
 *  الجدول ولم تُعلن وعداً لذلك التاريخ لا تصل `buildBoard` أصلاً — فلا رابطَ
 *  يُستشار ولا حالةٌ حيّةٌ تُقرأ. وقِيس أثرُه: «محطة ساسكو» مربوطةٌ بدرجة مئة
 *  ونفد منتوجُها قبل ثماني ساعات، واللوحةُ تقول «متوقّع».
 *
 *  فتُضاف محطاتُ الجدول: المربوطةُ بمعرّفها، ومحطاتُ **مدنِ الجدول** لأنّ
 *  المطابقةَ بالاسم تجري في `sameStation` ولا تُكتب استعلاماً. والمدنُ ثلاثٌ
 *  إلى سبعٍ عادةً، فالجلبُ يبقى ضيّقاً — لا `loadStations` بأربعةِ استعلاماتها
 *  الثقيلة، وهو ثِقلٌ أُخرج من هذا الطريق عمداً قبل يوم. */
export async function loadBoardStations(
  day: string,
  schedule: ScheduleRow[]
): Promise<StationWithStatus[]> {
  const cities = [...new Set(schedule.filter((r) => r.for_date === day).map((r) => r.city).filter(Boolean))] as string[];
  const linked = [...new Set(schedule.filter((r) => r.for_date === day).map((r) => r.linked_station_id).filter(Boolean))] as string[];
  return once(`board|${day}|${cities.join(',')}|${linked.join(',')}`, () =>
    fetchBoardStations(day, cities, linked)
  );
}

async function fetchBoardStations(
  day: string,
  cities: string[],
  linked: string[]
): Promise<StationWithStatus[]> {
  // ١ · محطاتُ الجدول: مدنُه ومربوطاتُه. استعلامٌ واحدٌ بشرطٍ «أو».
  const filters: string[] = [];
  if (cities.length) filters.push(`city.in.(${cities.map((c) => JSON.stringify(c)).join(',')})`);
  if (linked.length) filters.push(`id.in.(${linked.join(',')})`);

  let inSchedule: Record<string, unknown>[] = [];
  if (filters.length) {
    const { data, error } = await supabase
      .from('stations_public')
      .select('id, name, city, is_24h, opens_at, closes_at, temp_closed')
      .or(filters.join(','))
      .eq('status', 'approved')
      .eq('is_demo', false);
    if (error) throw error;
    inSchedule = (data ?? []) as Record<string, unknown>[];
  }

  // ٢ · وصفوفُ الوعد لهذا اليوم — وهي التي تُدخل محطةً لم يذكرها الجدولُ أصلاً.
  const { data: promised, error: e2 } = await supabase
    .from('station_products')
    .select('station_id, product, is_available, expected_at, expected_period, expected_time, runs_out_at, updated_at')
    .eq('expected_at', day);
  if (e2) throw e2;

  const promisedIds = [...new Set((promised ?? []).map((r) => r.station_id as string))];
  const known = new Set(inSchedule.map((s) => s.id as string));
  const missing = promisedIds.filter((id) => !known.has(id));

  if (missing.length) {
    const { data, error } = await supabase
      .from('stations_public')
      .select('id, name, city, is_24h, opens_at, closes_at, temp_closed')
      .in('id', missing)
      .eq('status', 'approved')
      .eq('is_demo', false);
    if (error) throw error;
    inSchedule = inSchedule.concat((data ?? []) as Record<string, unknown>[]);
  }
  if (!inSchedule.length) return [];

  // ٣ · ومنتجاتُ الجميع — لأنّ حالةَ محطةٍ لم تَعِد اليومَ تُقرأ من صفّها هي.
  const ids = inSchedule.map((s) => s.id as string);
  const { data: products, error: e3 } = await supabase
    .from('station_products')
    .select('station_id, product, is_available, expected_at, expected_period, expected_time, runs_out_at, updated_at')
    .in('station_id', ids);
  if (e3) throw e3;

  return inSchedule.map((st) => ({
    ...st,
    products: (products ?? []).filter((r) => r.station_id === st.id),
    traffic: null,
    productTraffic: [],
  })) as unknown as StationWithStatus[];
}

/** الاسمُ القديم — يبقى لئلّا ينكسر نداءٌ لم يُهاجَر بعد. */
export async function loadExpected(day: string): Promise<StationWithStatus[]> {
  return loadBoardStations(day, []);
}
