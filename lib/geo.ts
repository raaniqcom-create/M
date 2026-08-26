import { CORRIDORS, type Corridor } from './corridors';
import { ROAD_STATIONS, type RoadStation } from './roadStations';

export type LatLng = readonly [number, number];

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** هافرساين بين نقطتين. نظيرتها distanceKm في lib/stations.ts تأخذ
 *  {lat,lng}؛ وهذه تأخذ أزواجاً لأن هندسة الطرق مصفوفاتٌ لا كائنات. */
export function kmBetween(a: LatLng, b: LatLng): number {
  const x = rad(b[0] - a[0]);
  const y = rad(b[1] - a[1]);
  const q =
    Math.sin(x / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(q));
}

/** أقرب نقطةٍ على قطعةٍ مستقيمة، ومعها جانب النقطة منها.
 *
 *  والجانب هو ما لا تعطيه distanceKm: العراق يسير على اليمين، فالمحطة التي
 *  تخدمك تقع **يمين اتجاه سيرك**. وبدونه تظهر محطات الاتجاه المعاكس في
 *  قائمتك — والمسارَان لا يبعدان إلا عشرات الأمتار، فالمسافة وحدها لا تفصل.
 *
 *  والإشارة من الضرب الاتجاهي: سالبٌ يميناً، موجبٌ يساراً. */
function projectOnSegment(p: LatLng, a: LatLng, b: LatLng) {
  const ax = a[1], ay = a[0], bx = b[1], by = b[0], px = p[1], py = p[0];
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return { km: kmBetween(a, p), side: 0, t: 0 };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const proj: LatLng = [ay + t * dy, ax + t * dx];
  const cross = dx * (py - proj[0]) - dy * (px - proj[1]);
  return { km: kmBetween(proj, p), side: cross < 0 ? -1 : 1, t };
}

export interface Snap {
  /** البُعد العموديّ عن الطريق، بالكيلومترات */
  km: number;
  /** ‎-1 يمين اتجاه السير · ‎+1 يساره */
  side: number;
}

/** أقرب موضعٍ من نقطةٍ إلى شبكةٍ من الأجزاء. */
export function snapToWays(p: LatLng, ways: readonly (readonly LatLng[])[]): Snap {
  let best: Snap = { km: Infinity, side: 0 };
  for (const way of ways) {
    for (let i = 0; i < way.length - 1; i++) {
      const r = projectOnSegment(p, way[i], way[i + 1]);
      if (r.km < best.km) best = { km: r.km, side: r.side };
    }
  }
  return best;
}

/** طولٌ تقريبيّ لمسار. */
export function pathLength(way: readonly LatLng[]): number {
  let n = 0;
  for (let i = 0; i < way.length - 1; i++) n += kmBetween(way[i], way[i + 1]);
  return n;
}

// ── المسارات المسمّاة ──────────────────────────────────────────────

export interface RouteDef {
  id: string;
  from: string;
  to: string;
  /** مرجع الطريق في CORRIDORS */
  ref: string;
  /** أيّ اتجاهٍ من الطريق المزدوج يخدم هذه الرحلة */
  heading: 'east' | 'west';
  note?: string;
}

/** الرحلات المتاحة. والاتجاه ليس تفصيلاً: الطريق مزدوج، ومحطةُ الذهاب لا
 *  تُخدم القادم من الجهة الأخرى — قِيس على طريق بغداد فكان محطتين ذهاباً
 *  وأربعاً عودةً، وطابق ذلك ذاكرة من يقطعه. */
export const ROUTES: readonly RouteDef[] = [
  { id: 'rmd-bgd', from: 'الرمادي', to: 'بغداد', ref: 'M1', heading: 'east' },
  { id: 'bgd-rmd', from: 'بغداد', to: 'الرمادي', ref: 'M1', heading: 'west' },
  { id: 'rmd-rtb', from: 'الرمادي', to: 'الرطبة', ref: 'M1', heading: 'west' },
  { id: 'rtb-rmd', from: 'الرطبة', to: 'الرمادي', ref: 'M1', heading: 'east' },
  { id: 'rmd-trb', from: 'الرمادي', to: 'طريبيل (الأردن)', ref: 'M1', heading: 'west', note: 'المنفذ الحدودي مع الأردن' },
  { id: 'rmd-qam', from: 'الرمادي', to: 'القائم', ref: '12', heading: 'west', note: 'طريق الفرات — عبر هيت وحديثة وعانة وراوة' },
  { id: 'qam-rmd', from: 'القائم', to: 'الرمادي', ref: '12', heading: 'east', note: 'طريق الفرات' },
  { id: 'rmd-hit', from: 'الرمادي', to: 'هيت', ref: '12', heading: 'west' },
  { id: 'hit-rmd', from: 'هيت', to: 'الرمادي', ref: '12', heading: 'east' },
  { id: 'rmd-nkb', from: 'الرمادي', to: 'النخيب', ref: '22', heading: 'west', note: 'طريق الحج البري' },
  { id: 'rmd-flj', from: 'الرمادي', to: 'الفلوجة', ref: '11', heading: 'east', note: 'الطريق القديم' },
  { id: 'flj-rmd', from: 'الفلوجة', to: 'الرمادي', ref: '11', heading: 'west', note: 'الطريق القديم' },
];

/** إحداثيّات أطراف الرحلات. مدن الأنبار في lib/cities.ts، وهذه تضمّ ما
 *  خرج عنها: بغداد، والمنافذ الحدودية التي لا قضاء لها. */
export const ENDPOINTS: Readonly<Record<string, LatLng>> = {
  'الرمادي': [33.4258, 43.3012],
  'الفلوجة': [33.3556, 43.7864],
  'هيت': [33.6383, 42.8258],
  'حديثة': [34.1372, 42.3789],
  'عانة': [34.4686, 41.9375],
  'راوة': [34.4756, 41.9139],
  'القائم': [34.3689, 41.0906],
  'الرطبة': [33.0386, 40.2864],
  'الحبانية': [33.3628, 43.5586],
  'الخالدية': [33.3789, 43.4881],
  'عامرية الفلوجة': [33.2264, 43.6786],
  'الكرمة': [33.4453, 43.7972],
  'النخيب': [32.0369, 42.2506],
  'بغداد': [33.3152, 44.3661],
  'طريبيل (الأردن)': [32.92, 38.98],
};

export function corridorFor(ref: string): Corridor | undefined {
  return CORRIDORS.find((c) => c.ref === ref);
}

/** أجزاء الطريق التي تخدم هذا الاتجاه — ومعها ما ليس مزدوجاً، فهو للجهتين. */
export function waysFor(route: RouteDef): LatLng[][] {
  const c = corridorFor(route.ref);
  if (!c) return [];
  const dir = (route.heading === 'east' ? c.east : c.west) as unknown as LatLng[][];
  return [...dir, ...(c.both as unknown as LatLng[][])];
}

// ── المحطات على الطريق ─────────────────────────────────────────────

export interface RouteStop {
  name: string;
  city: string;
  lat: number;
  lng: number;
  /** المسافة على الطريق من نقطة الانطلاق */
  atKm: number;
  /** البُعد عن حافّة الطريق، بالأمتار */
  offRoadM: number;
  /** المسافة إلى المحطة التالية — null للأخيرة */
  toNextKm: number | null;
  /** محطة مسجّلة في المنصّة؟ يُملأ لاحقاً بالمطابقة */
  registeredId?: string;
}

/** شريطٌ ضيّق عن قصد.
 *
 *  جُرِّب 15 كم أولاً فعدّ 133 محطة على طريق بغداد — لأنه يبتلع مدينتَي
 *  الطرفين ويُدرج محطات الفلوجة والحبانية والخالدية وهي **داخل المدن**.
 *  ومحطةُ طريقٍ حقيقية تقف على حافّته: القياس أعطى 34 متراً إلى 385. */
export const ON_ROAD_M = 500;

/** المحطات التي تخدم هذه الرحلة، مرتّبةً من نقطة الانطلاق. */
export function stopsOnRoute(
  route: RouteDef,
  origin: LatLng,
  stations: readonly RoadStation[] = ROAD_STATIONS,
  destination?: LatLng
): RouteStop[] {
  const ways = waysFor(route);
  if (!ways.length) return [];

  // الطريق أطول من الرحلة — فيُقصّ عليها.
  //
  // M1 يمتدّ من بغداد إلى طريبيل، فرحلةُ الرمادي↔بغداد كانت تلتقط «محطة
  // طليحة» في صحراء الرطبة على بُعد أربعمئة كيلومتر. والاختبار قطعٌ ناقص:
  // مجموع بُعد المحطة عن الطرفين لا يتجاوز طول الرحلة بأكثر من الربع —
  // فما خرج عن المدى يسقط، وما انحرف قليلاً داخله يبقى.
  const dest = destination ?? ENDPOINTS[route.to];
  const span = dest ? kmBetween(origin, dest) : Infinity;
  const budget = span * 1.25;

  const stops: RouteStop[] = [];
  for (const s of stations) {
    if (dest) {
      const detour = kmBetween(origin, [s.la, s.lo]) + kmBetween([s.la, s.lo], dest);
      if (detour > budget) continue;
    }
    const snap = snapToWays([s.la, s.lo], ways);
    // يمين اتجاه السير وحده. والصفر يعني أنها على الخطّ تماماً — تُقبل.
    if (snap.km * 1000 > ON_ROAD_M || snap.side > 0) continue;
    stops.push({
      name: s.n,
      city: s.c,
      lat: s.la,
      lng: s.lo,
      atKm: kmBetween(origin, [s.la, s.lo]),
      offRoadM: Math.round(snap.km * 1000),
      toNextKm: null,
    });
  }

  stops.sort((a, b) => a.atKm - b.atKm);
  for (let i = 0; i < stops.length - 1; i++) {
    stops[i].toNextKm = stops[i + 1].atKm - stops[i].atKm;
  }
  return stops;
}

/** الفجوة التي تستحقّ تحذيراً.
 *
 *  خزّانٌ ممتلئ يقطع 400 كم، لكن أحداً لا ينطلق ممتلئاً. وستّون كيلومتراً
 *  بلا محطةٍ في صحراءٍ ليل هي المسافة التي تُغيّر قراراً — أقلّ منها يُثرثر،
 *  وأكثر منها يسكت حيث يجب أن يتكلّم. */
export const GAP_WARN_KM = 60;
