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

// ── المسارات ──────────────────────────────────────────────────────

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
  // المنفذ لا المدينة: الطريق العراقي ينتهي هنا، وعرعر بعده بـ59 كم داخل
  // السعودية. ووعدٌ بمحطاتٍ وراء الحدود لا نملكه.
  'منفذ عرعر': [31.37148, 41.44502],
  'البغدادي': [33.8517, 42.6472],
  'الحقلانية': [34.0575, 42.3792],
};

/** ما يُعرض في مختاري «من» و«إلى» — بترتيبٍ يبدأ بالأكثر طلباً. */
export const TRIP_POINTS: readonly string[] = [
  'الرمادي', 'الفلوجة', 'بغداد', 'الخالدية', 'الحبانية', 'عامرية الفلوجة',
  'الكرمة', 'هيت', 'البغدادي', 'الحقلانية', 'حديثة', 'عانة', 'راوة',
  'القائم', 'الرطبة', 'النخيب', 'طريبيل (الأردن)', 'منفذ عرعر',
];

export interface ResolvedRoute {
  ref: string;
  label: string;
  note: string;
  heading: 'east' | 'west';
  ways: LatLng[][];
  /** مسارٌ مرتَّب من الانطلاق إلى الوجهة — للرسم على الخريطة */
  path: LatLng[];
  from: string;
  to: string;
  origin: LatLng;
  dest: LatLng;
  km: number;
}

/** أي مدينتين، لا قائمةٌ ثابتة من الأزواج.
 *
 *  يُختار الطريق الذي **يمرّ بالطرفين معاً** — لا الأقرب إلى أحدهما. فالرمادي
 *  تقع على أربعة طرق، وبغداد على ثلاثة؛ والمشترك بينهما وحده هو الرحلة.
 *
 *  والاتجاه من خطوط الطول: بغداد شرقاً والحدود غرباً، وهو ما فُرزت به أجزاء
 *  الطرق عند التوليد — فلا نقطةَ مرجعية تُخترع هنا. */
/** حين يصل الطريقان بين مدينتين، أيّهما الافتراضي؟
 *
 *  السريع قبل القديم. وقياسٌ كشف الحاجة: الرمادي↔بغداد كان يختار الطريق
 *  القديم (11) لأنه يمرّ بمركزَي المدينتين بينما M1 يلتفّ حولهما — فظهرت
 *  محطات الخالدية والحبانية «على الطريق» وهي داخل البلدات. والمسافر بين
 *  محافظتين يأخذ السريع، والقديم خيارٌ يُعرض لا يُفرض. */
const ROAD_RANK: Readonly<Record<string, number>> = { M1: 0, '12': 1, '22': 2, '21': 3, '20': 4, '11': 5 };

/** كل الطرق التي تصل بين نقطتين، الأفضل أوّلاً. */
export function resolveRoutes(from: string, to: string): ResolvedRoute[] {
  const origin = ENDPOINTS[from];
  const dest = ENDPOINTS[to];
  if (!origin || !dest || from === to) return [];

  const found: { r: ResolvedRoute; score: number }[] = [];
  for (const c of CORRIDORS) {
    const all = [...c.east, ...c.west, ...c.both] as unknown as LatLng[][];
    if (!all.length) continue;
    // الأسوأ من الطرفين هو المقياس: طريقٌ يمرّ بواحدةٍ ويبعد عن الأخرى ليس رحلة.
    const score = Math.max(snapToWays(origin, all).km, snapToWays(dest, all).km);
    if (score > 35) continue;
    const r = buildRoute(c, from, to, origin, dest);
    if (r && r.path.length > 1) found.push({ r, score });
  }
  // الأقصر فعلاً أوّلاً — لا الأسرع صنفاً.
  //
  // قال المالك: بغداد↔الرمادي سريع، والخالدية↔الرمادي عادي، والفلوجة↔هيت
  // سريع. ولا قاعدةَ صنفٍ تُنتج الثلاثة — لكن الطول يُنتجها: السريع يلتفّ
  // فيطول في الرحلة القصيرة، ويستقيم فيقصر في الطويلة.
  found.sort((a, b) => a.r.km - b.r.km || (ROAD_RANK[a.r.ref] ?? 9) - (ROAD_RANK[b.r.ref] ?? 9));
  return found.map((f) => f.r);
}

/** يخيط أجزاء الطريق في خطٍّ واحد متّصل.
 *
 *  **العطل الذي أصلحه:** كان المسار يُبنى بتسطيح كل الأجزاء إلى نقاطٍ ثم
 *  ترتيبها بالبُعد عن الانطلاق. والنتيجة خربشة: الطريق مزدوج وأجزاؤه
 *  متجاورة، فيقفز الخطّ بين المسارين ذهاباً وإياباً — ورآها المالك تلفّ
 *  داخل الرمادي بدل أن تمضي إلى بغداد.
 *
 *  والصواب أن الجزء **مسارٌ مرتَّب أصلاً** كما جاء من OSM. فيُرتَّب الأجزاء
 *  لا النقاط: لكل جزءٍ موضعٌ على محور الرحلة (إسقاطُ منتصفه)، ويُقلَب إن كان
 *  طرفه الأخير أقرب إلى الانطلاق من أوّله، ثم تُوصَل بترتيبها.
 *
 *  ويُستبعد ما ابتعد عن محور الرحلة: الطريق يتفرّع ويلتفّ داخل المدن،
 *  وفروعُه ليست رحلتك. */
const CORRIDOR_KM = 12;

function stitchPath(ways: LatLng[][], origin: LatLng, dest: LatLng): LatLng[] {
  const oy = origin[0], ox = origin[1];
  const vy = dest[0] - oy, vx = dest[1] - ox;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return [];

  /** موضع نقطةٍ على محور الرحلة: 0 عند الانطلاق و1 عند الوجهة. */
  const progress = (p: LatLng) => ((p[1] - ox) * vx + (p[0] - oy) * vy) / len2;
  /** بُعدها العموديّ عن المحور، تقريباً بالكيلومترات. */
  const offAxis = (p: LatLng) => {
    const t = Math.max(0, Math.min(1, progress(p)));
    return kmBetween(p, [oy + t * vy, ox + t * vx]);
  };

  const parts: { key: number; pts: LatLng[] }[] = [];
  for (const w of ways) {
    if (w.length < 2) continue;
    const mid = w[Math.floor(w.length / 2)];
    // خارج المحور أو خارج مدى الرحلة — فرعٌ لا رحلة.
    if (offAxis(mid) > CORRIDOR_KM) continue;
    const pm = progress(mid);
    if (pm < -0.08 || pm > 1.08) continue;
    // يُقلَب الجزء إن كان يسير عكس اتجاه الرحلة.
    const pts = progress(w[w.length - 1]) < progress(w[0]) ? [...w].reverse() : w;
    parts.push({ key: pm, pts });
  }
  parts.sort((a, b) => a.key - b.key);

  // وصلٌ بلا تكرار: طرفُ جزءٍ وبداية تاليه قد يكونان النقطة نفسها.
  const path: LatLng[] = [];
  for (const part of parts) {
    for (const p of part.pts) {
      const last = path[path.length - 1];
      if (last && Math.abs(last[0] - p[0]) < 1e-6 && Math.abs(last[1] - p[1]) < 1e-6) continue;
      path.push(p);
    }
  }
  // قصٌّ على الطرفين: ما قبل الانطلاق وما بعد الوجهة ليس من الرحلة.
  return path.filter((p) => {
    const t = progress(p);
    return t >= -0.05 && t <= 1.05;
  });
}

function buildRoute(
  c: Corridor,
  from: string,
  to: string,
  origin: LatLng,
  dest: LatLng
): ResolvedRoute | null {
  const heading: 'east' | 'west' = dest[1] > origin[1] ? 'east' : 'west';
  const dir = (heading === 'east' ? c.east : c.west) as unknown as LatLng[][];
  const ways = [...dir, ...(c.both as unknown as LatLng[][])];
  if (!ways.length) return null;
  const path = stitchPath(ways, origin, dest);
  if (path.length < 2) return null;
  return {
    ref: c.ref,
    label: c.label,
    note: c.note,
    heading,
    ways,
    path,
    from,
    to,
    origin,
    dest,
    // طول الطريق الفعليّ لا الخطّ المستقيم — وهو ما يُفاضَل به بين الطرق.
    km: pathLength(path),
  };
}

export function resolveRoute(from: string, to: string): ResolvedRoute | null {
  return resolveRoutes(from, to)[0] ?? null;
}

/** الزمن التقديري — بمتوسّط 80 كم/س على طرق الأنبار السريعة.
 *
 *  ولا يُدَّعى أكثر: لا حالة طريق ولا سيطرات ولا ازدحام. رقمٌ يُقرَّب إلى
 *  خمس دقائق كي لا يُقرأ وعداً. */
export const AVG_KMH = 80;
export function minutesFor(km: number): number {
  return Math.max(5, Math.round(((km / AVG_KMH) * 60) / 5) * 5);
}

export function corridorFor(ref: string): Corridor | undefined {
  return CORRIDORS.find((c) => c.ref === ref);
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
export function stopsFor(
  route: ResolvedRoute,
  stations: readonly RoadStation[] = ROAD_STATIONS
): RouteStop[] {
  return collectStops(route.ways, route.origin, route.dest, stations);
}

function collectStops(
  ways: LatLng[][],
  origin: LatLng,
  dest: LatLng | undefined,
  stations: readonly RoadStation[]
): RouteStop[] {

  // الطريق أطول من الرحلة — فيُقصّ عليها.
  //
  // M1 يمتدّ من بغداد إلى طريبيل، فرحلةُ الرمادي↔بغداد كانت تلتقط «محطة
  // طليحة» في صحراء الرطبة على بُعد أربعمئة كيلومتر. والاختبار قطعٌ ناقص:
  // مجموع بُعد المحطة عن الطرفين لا يتجاوز طول الرحلة بأكثر من الربع.
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
