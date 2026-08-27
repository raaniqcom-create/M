import { ROAD_STATIONS, type RoadStation } from './roadStations';

/** محطاتُ الوقود المعروفة في الخرائط المفتوحة — 237 نقطة تُشحن مع التطبيق.
 *
 *  **وهي مصححٌ لموضع التسجيل، لا مجرّد بياناتٍ لمساعد الطريق.**
 *
 *  المشكلة المقيسة: صاحبُ المحطة يضغط زرّ الموقع وهو في بيته، فيُسجَّل بيتُه
 *  محطةً. والقياس على الأربعٍ وعشرين المعتمدة اليوم يعطي المِصفاة:
 *
 *      بُعدُ المحطة المسجَّلة صحيحاً عن أقرب محطةٍ معروفة في الخرائط:
 *      وسيط 76 متراً · ثُلثاها ضمن 200 · عشرون من أربعٍ وعشرين ضمن كيلومتر.
 *
 *  فما وقع على كيلومترٍ من كل محطةٍ معروفة يستحقّ سؤالاً. **وسؤالاً لا
 *  منعاً**: أربعٌ من الأربعٍ وعشرين تجاوزت الكيلومتر وهي صحيحة — ومنها
 *  محطتا القائم، والخرائطُ المفتوحة لا تعرف في القائم شيئاً. فالمنعُ يطرد
 *  صادقاً، والسؤالُ يُنبّه غافلاً.
 */

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function metresBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const x = rad(b.lat - a.lat);
  const y = rad(b.lng - a.lng);
  const q =
    Math.sin(x / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(q));
}

export interface NearbyFuel {
  station: RoadStation;
  metres: number;
}

/** أقربُ المحطات المعروفة إلى نقطة، مرتَّبةً. */
export function knownFuelNear(
  lat: number,
  lng: number,
  radiusM = 1200,
  limit = 4
): NearbyFuel[] {
  const here = { lat, lng };
  const out: NearbyFuel[] = [];
  for (const s of ROAD_STATIONS) {
    const metres = metresBetween(here, { lat: s.la, lng: s.lo });
    if (metres <= radiusM) out.push({ station: s, metres });
  }
  return out.sort((a, b) => a.metres - b.metres).slice(0, limit);
}

/** بُعدُ نقطةٍ عن أقربِ محطةٍ معروفة — للتحذير الإرشاديّ. */
export function metresToKnownFuel(lat: number, lng: number): number {
  const here = { lat, lng };
  let best = Infinity;
  for (const s of ROAD_STATIONS) {
    const d = metresBetween(here, { lat: s.la, lng: s.lo });
    if (d < best) best = d;
  }
  return best;
}

/** العتبةُ التي تستحقّ سؤالاً — قِيست، لا خُمّنت. */
export const SUSPICIOUS_M = 1000;

/** توحيدُ الاسم قبل المقارنة.
 *
 *  «محطة» تتصدّر ثلثَي الأسماء في الملفّين، فمقارنةٌ تحسبها تُطابق كلَّ شيء
 *  بكلِّ شيء. وكذلك «تعبئة» و«وقود» و«المشيدة» و«النموذجية»: صفاتٌ إدارية
 *  لا تُميّز محطةً عن أخرى. فتُسقَط، ويبقى الاسمُ الذي يقوله الناس.
 *
 *  والألفُ والهاءُ تُوحَّدان: «الاوائل» و«الأوائل»، و«جوهره» و«جوهرة» —
 *  والناسُ يكتبون الوجهين. */
const NOISE = /(محطة|محطه|محطات|تعبئة|تعبئه|وقود|بانزين|بنزين|للوقود|المشيدة|المشيده|النموذجية|النموذجيه|الاهلية|الاهليه|للمنتوجات|النفطية|النفطيه)/g;
export function normalizeName(s: string): string {
  return (s || '')
    .replace(/[ً-ْٰ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^؀-ۿ0-9a-zA-Z ]/g, ' ')
    .replace(NOISE, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export interface NameHit {
  station: RoadStation;
  score: number;
}

/** محطاتٌ نعرفها يشبه اسمُها ما كتبه المسجِّل.
 *
 *  **وهذا أقوى من تحديد الموقع بالإصبع.** من يكتب «النخيب» نعرض له المحطة
 *  باسمها الكامل ومدينتها وإحداثياتها المسحيّة — فيؤكّد بضغطة، فيُملأ
 *  الاسمُ والمدينة والموقع دفعةً واحدة وبدقّةٍ لا يبلغها إبهامٌ على خريطة. */
export function searchKnownFuel(query: string, limit = 6): NameHit[] {
  const q = normalizeName(query);
  if (q.length < 2) return [];
  const qt = q.split(' ').filter((w) => w.length > 1);
  if (!qt.length) return [];
  const out: NameHit[] = [];
  for (const s of ROAD_STATIONS) {
    const n = normalizeName(s.n);
    if (!n) continue;
    let score = 0;
    if (n === q) score = 100;
    else if (n.includes(q)) score = 70 + Math.min(20, q.length);
    else {
      const nt = new Set(n.split(' '));
      const hit = qt.filter((w) => nt.has(w) || n.includes(w)).length;
      if (!hit) continue;
      score = (hit / qt.length) * 55;
    }
    if (score > 20) out.push({ station: s, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
