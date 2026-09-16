import { normalizeName, searchKnownFuel } from './nearbyFuel.ts';
import { CITY_WORDS, officialFor } from './officialStations.ts';
import { CITY_NAMES } from './cities.ts';

/** «الطريق لها» لصفّ الجدول — إحداثيّاتٌ من النظام لا تخمين.
 *
 *  «التعليقاتُ بالكامل على عناوين المحطات وتسبّبت لنا بمصداقيّة التطبيق»
 *  (صاحبُ المنصّة، ١٦ أيلول): صفُّ الجدول اسمٌ بلا مكان. والمنصّةُ تعرف المكان
 *  أصلاً: محطاتُ المنصّة بإحداثيّاتها، ومساعدُ الطريق (`roadStations.ts`) لكلّ
 *  محطةٍ في الأنبار. فالصفُّ يأخذ إحداثيّاتِه من الأوّل إن كان مربوطاً، وإلّا
 *  من الثاني حين يطابق اسمُه محطةً بحارس المدينة — وإلّا لا رابطَ: طريقٌ إلى
 *  المكان الخطأ أسوأُ من لا طريق. */

/** ويز وحدَه يهدي في العراق — قرارُ صاحب المنصّة. */
export const wazeUrl = (lat: number, lng: number) => `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;

/** بحثاً بالاسم حين لا إحداثيّات — للمواضع التي تبقى بالاسم عمداً. */
export const wazeSearch = (q: string) => `https://waze.com/ul?q=${encodeURIComponent(q)}`;

const CITY_SET: ReadonlySet<string> = new Set(CITY_NAMES);

/** مدينةُ مساعد الطريق مدينةُ أنبار؟ (وإلّا فهي على جانب بغداد من الطريق.) */
export const isAnbarCity = (c: string): boolean => CITY_SET.has(c);

/** إحداثيّاتُ محطةٍ من مساعد الطريق باسمها — بدرجة احتواءٍ فأعلى (≥ ٧٠)،
 *  وفي الأنبار وحدَها: جدولُ التوزيع أنباريٌّ، ومساعدُ الطريق يحمل ١٢٦ محطةً
 *  على جانب بغداد («أنوار حديثة» كانت ستُطابق «أنوار المدينة» في بغداد).
 *  ولا تُشترط مساواةُ المدينة داخل الأنبار: الكتابُ يكتب القضاء («الرمادي»)
 *  ومساعدُ الطريق الناحية («حصيبة الشرقية»). */
export function roadCoords(name: string, _city: string | null): { lat: number; lng: number } | null {
  // بالاسم كما هو، وبه بلا كلمات المدن («الحق الرمادي» في صفوفٍ نُشرت قبل المطابِق الجديد).
  const bare = normalizeName(name).split(' ').filter((w) => w && !CITY_WORDS.has(w)).join(' ');
  const top = [name, ...(bare && bare !== normalizeName(name) ? [bare] : [])]
    .flatMap((t) => searchKnownFuel(t, 1))
    .filter((h) => isAnbarCity(h.station.c))
    .sort((a, b) => b.score - a.score)[0];
  if (!top || top.score < 70) return null;
  return { lat: top.station.la, lng: top.station.lo };
}

/** العنوانُ المختصرُ بين القوسين: عنوانُ المنصّة إن كانت مسجّلة، وإلّا الرسميّ. */
export function shortAddress(row: { name: string; address?: string | null }): string | null {
  const own = (row.address ?? '').trim();
  if (own) return own;
  return officialFor(row.name)?.address ?? null;
}

/** صفحةُ التفاصيل داخل المنصّة: صفحةُ المحطة المسجّلة، أو صفحةُ «مكان» لغيرها. */
export function placeHref(row: { name: string; city: string | null; stationId: string | null }): string {
  if (row.stationId) return `/station/${row.stationId}`;
  const q = new URLSearchParams({ n: row.name });
  if (row.city) q.set('c', row.city);
  return `/place/?${q.toString()}`;
}

/** إحداثيّاتُ صفٍّ في لوحة الجدول. */
export function routeFor(row: {
  name: string;
  city: string | null;
  lat?: number | null;
  lng?: number | null;
}): { lat: number; lng: number } | null {
  if (row.lat != null && row.lng != null) return { lat: row.lat, lng: row.lng };
  return roadCoords(row.name, row.city);
}
