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
