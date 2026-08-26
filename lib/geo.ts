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

export const ENDPOINTS: Readonly<Record<string, LatLng>> = {
  'الرمادي': [33.4258, 43.3012],
  'الفلوجة': [33.3556, 43.7864],
  'هيت': [33.6383, 42.8258],
  'حديثة': [34.1372, 42.3789],
  'عانة': [34.3725, 41.9859],
  'راوة': [34.4833, 41.9237],
  'القائم': [34.39577, 40.99437],
  'الرطبة': [33.0386, 40.2864],
  'الحبانية': [33.3628, 43.5586],
  'الخالدية': [33.3789, 43.4881],
  'عامرية الفلوجة': [33.16347, 43.86422],
  'الكرمة': [33.40494, 43.91423],
  'النخيب': [32.0369, 42.2506],
  'بغداد': [33.3152, 44.3661],
  // المعبر لا تقديرُه: [32.92, 38.98] كانت تبعد 21 كم شمال المعبر، فيُسقطها
  // محرّك التوجيه على أوّل طريقٍ يجده — وينتهي المسار قبل الحدود بستّة عشر
  // كيلومتراً، فتغيب تغطية آخرها. وهذه من barrier=border_control في OSM.
  'طريبيل (الأردن)': [32.7395, 39.0073],
  // المنفذ لا المدينة: الطريق العراقي ينتهي هنا، وعرعر بعده بـ59 كم داخل
  // السعودية. ووعدٌ بمحطاتٍ وراء الحدود لا نملكه.
  'منفذ عرعر': [31.37148, 41.44502],
  'البغدادي': [33.85175, 42.54918],
  'الحقلانية': [34.0575, 42.3792],
  'كبيسة': [33.5941, 42.6185],
  'المحمدي': [33.5509, 42.9011],
  'الصقلاوية': [33.3964, 43.6833],
  'حصيبة الشرقية': [33.4207, 43.4533],
  'العبيدي': [34.4281, 41.2173],
  'الكرابلة': [34.3909, 41.0464],
  'الرمانة': [34.3931, 41.078],
  'عكاشات': [33.6675, 39.967],
  'الوليد': [33.4328, 38.9321],
  'الوفاء': [33.3975, 42.8531],
  // على بُعد 36 كم من أقرب طريقٍ نعرف هندسته — أي خارج عتبة الـ35. فهي هنا
  // بياناتٍ ولا تُعرض في المختار: وجهةٌ تُختار ثم يُقال «لا نعرف طريقاً»
  // أسوأ من وجهةٍ لا تُعرض. تُرفَع حين يحلّ OSRM محلّ خياطة الممرّات.
  'الرحالية': [32.7658, 43.3911],
};

/** ما يُعرض في مختاري «من» و«إلى» — بترتيبٍ يبدأ بالأكثر طلباً. */
export const TRIP_POINTS: readonly string[] = [
  'الرمادي', 'الفلوجة', 'بغداد', 'الخالدية', 'الحبانية', 'حصيبة الشرقية',
  'عامرية الفلوجة', 'الكرمة', 'الصقلاوية',
  'هيت', 'الوفاء', 'المحمدي', 'كبيسة', 'البغدادي', 'الحقلانية', 'حديثة', 'عانة', 'راوة',
  'القائم', 'العبيدي', 'الكرابلة', 'الرمانة',
  'الرطبة', 'عكاشات', 'النخيب', 'الوليد', 'طريبيل (الأردن)', 'منفذ عرعر',
];

// ── المسارات ───────────────────────────────────────────────────────
//
// **لماذا مُحسَّبةٌ سلفاً لا محسوبةٌ هنا؟**
//
// كانت الطرق تُخاط من أجزاء OSM بمراجعها (M1, 12, 22…): يُسقَط الطرفان على
// ممرّ، وتُرتَّب أجزاؤه، ويُوصَل الخيط. وكانت تصل أكثر الرحلات وتُفسد ما
// خرج عن المراجع — والصحراء أكثرها بلا مرجع.
//
// وأوضح ما كشفها الرمادي ← كبيسة. كبيسة تبعد 15.7 كم عن أقرب طريقٍ له
// مرجع، فلا يبلغها الخيط، فيرتدّ إلى أقرب قطعةٍ يعرفها — وكانت **داخل
// الرمادي**. فبلّغ المالك: «ظهر الطريق داخل الرمادي فقط». والقياس بعده:
// 36 كم على طريق بغداد، والحقيقة 84 عبر هيت.
//
// فحلّ محلّها OSRM: محرّك توجيهٍ يعرف الشبكة كلّها — الفرعيّ والصحراويّ
// والوصلات بلا اسم. و812 مساراً حُسبت مرّةً واحدة وقت البناء وخُزّنت في
// public/road-routes.json، فلا يعتمد المسافر على خدمةٍ خارجية وهو في
// الصحراء، ولا يُحمَّل خادمٌ مجانيٌّ بطلبٍ لكل زائر.
//
// والمسافة والزمن من المحرّك لا من قسمةٍ على 80: طريق الصحراء ليس كطريق
// المدينة، ومتوسّطٌ واحدٌ لهما يكذب على أحدهما.

export interface RoadRoute {
  from: string;
  to: string;
  /** الطول الحقيقي بالكيلومترات — من محرّك التوجيه */
  km: number;
  /** المدّة الحقيقية بالدقائق — من محرّك التوجيه */
  min: number;
  path: LatLng[];
  origin: LatLng;
  dest: LatLng;
  /** المدن التي يمرّ بها الطريق فعلاً، مستخرَجةً من الهندسة لا مكتوبةً بيد */
  via: string[];
}

let ROUTES: Map<string, number[]> | null = null;
let loading: Promise<void> | null = null;

/** يفكّ [كم, دقيقة, Δعرض, Δطول, …] بأعشار الآلاف من الدرجة. */
function decode(enc: readonly number[]): { km: number; min: number; path: LatLng[] } {
  const path: LatLng[] = [];
  let la = 0, lo = 0;
  for (let i = 2; i < enc.length; i += 2) {
    la += enc[i];
    lo += enc[i + 1];
    path.push([la / 1e4, lo / 1e4]);
  }
  return { km: enc[0], min: enc[1], path };
}

/** يُحمَّل مرّةً واحدة، وعند فتح صفحة الطريق وحدها.
 *
 *  684 ك.ب خاماً و~50 بعد ضغط الخادم — أقلّ من صورة. ولا يُحمَّل على من لا
 *  يسافر: الملفّ في public/ لا في الحزمة. */
export function loadRoutes(): Promise<void> {
  if (ROUTES) return Promise.resolve();
  if (loading) return loading;
  loading = fetch('/road-routes.json')
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((d: { routes: Record<string, number[]> }) => {
      ROUTES = new Map(Object.entries(d.routes));
    })
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

export function routesReady(): boolean {
  return ROUTES !== null;
}

/** المدن التي يمرّ بها المسار فعلاً — من الهندسة، لا من جدولٍ مكتوب.
 *
 *  «عبر هيت» جوابٌ يعرفه من يعرف الطريق، ويُطمئن من لا يعرفه. وحسابُه من
 *  المسار نفسه يعني أنه لا يكذب حين يتغيّر الطريق. */
function viaOn(path: readonly LatLng[], from: string, to: string): string[] {
  const hits: { name: string; at: number }[] = [];
  for (const [name, p] of Object.entries(ENDPOINTS)) {
    if (name === from || name === to) continue;
    let best = Infinity, at = 0, acc = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const seg = kmBetween(path[i], path[i + 1]);
      const r = projectOnSegment(p, path[i], path[i + 1]);
      if (r.km < best) { best = r.km; at = acc + seg * r.t; }
      acc += seg;
    }
    // ثمانيةُ كيلومترات: المدينة على الطريق لا قريبةٌ منه. وأوسعُ منها يجعل
    // كل بلدةٍ في الوادي «على الطريق».
    if (best <= 8) hits.push({ name, at });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.name);
}

/** المسار بين مدينتين — أو null إن لم يُحسب. */
export function routeBetween(from: string, to: string): RoadRoute | null {
  const origin = ENDPOINTS[from];
  const dest = ENDPOINTS[to];
  if (!ROUTES || !origin || !dest || from === to) return null;
  const enc = ROUTES.get(`${from}|${to}`);
  if (!enc) return null;
  const { km, min, path } = decode(enc);
  if (path.length < 2) return null;
  return { from, to, km, min, path, origin, dest, via: viaOn(path, from, to) };
}

/** الزمن التقديري حين لا نملك إلا المسافة.
 *
 *  الرحلة كاملةً تأتي بمدّتها الحقيقية من محرّك التوجيه. وهذه للأجزاء —
 *  ما بين محطةٍ وأخرى — حيث المسافة وحدها معروفة. ولا يُدَّعى أكثر: لا حالة
 *  طريق ولا سيطرات ولا ازدحام. ويُقرَّب إلى خمس دقائق كي لا يُقرأ وعداً. */
export const AVG_KMH = 80;
export function minutesFor(km: number): number {
  return Math.max(5, Math.round(((km / AVG_KMH) * 60) / 5) * 5);
}

/** الدقائق مكتوبةً. `Math.round(km / 80)` كان يقول «~0 ساعة» لكل رحلةٍ دون
 *  الأربعين كيلومتراً — وهي أكثر رحلات المحافظة: الرمادي إلى حصيبة، الفلوجة
 *  إلى الصقلاوية، هيت إلى كبيسة. والصفر يُقرأ عطلاً لا تقريباً. */
export function durationText(minutes: number): string {
  const total = Math.max(5, Math.round(minutes / 5) * 5);
  const h = Math.floor(total / 60);
  const m = Math.round((total - h * 60) / 5) * 5;
  // العربية تعدّ على أربعة أوجه لا وجهين: «5 دقائق» لا «5 دقيقة»، و«ساعتان»
  // لا «2 ساعة». والتقريب إلى خمسٍ يجعل الدقائق 5..55، فلا يقع المفرد ولا
  // المثنّى فيها — لكن الساعات تقعان.
  const mins = m <= 10 ? `${m} دقائق` : `${m} دقيقة`;
  if (h === 0) return mins;
  const hours = h === 1 ? 'ساعة' : h === 2 ? 'ساعتان' : h <= 10 ? `${h} ساعات` : `${h} ساعة`;
  return m === 0 ? hours : `${hours} و${mins}`;
}

// ── المحطات على الطريق ─────────────────────────────────────────────

export interface RouteStop {
  name: string;
  city: string;
  lat: number;
  lng: number;
  /** المسافة **على الطريق** من نقطة الانطلاق — لا خطّاً مستقيماً */
  atKm: number;
  /** البُعد عن حافّة الطريق، بالأمتار */
  offRoadM: number;
  /** ‎-1 يمين اتجاه سيرك · ‎+1 يساره */
  side: number;
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

/** إسقاطُ نقطةٍ على مسارٍ كامل: بُعدها عنه، وجانبها منه، **وأين تقع عليه**.
 *
 *  والثالثة هي الجديدة. كان atKm خطّاً مستقيماً من الانطلاق — فمحطةٌ بعد
 *  منعطفٍ تُقرأ أقربَ ممّا هي، والفجوة بين محطتين تُحسب أضيقَ من الحقيقة.
 *  وفي الصحراء الفجوةُ هي المعلومة كلّها. */
function snapAlong(p: LatLng, path: readonly LatLng[]) {
  let km = Infinity, side = 0, atKm = 0, acc = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = kmBetween(path[i], path[i + 1]);
    const r = projectOnSegment(p, path[i], path[i + 1]);
    if (r.km < km) { km = r.km; side = r.side; atKm = acc + seg * r.t; }
    acc += seg;
  }
  return { km, side, atKm };
}

/** المحطات على هذه الرحلة، مرتّبةً من نقطة الانطلاق. */
export function stopsFor(
  route: RoadRoute,
  stations: readonly RoadStation[] = ROAD_STATIONS
): RouteStop[] {
  return collectStops(route.path, stations);
}

/** **الجانب يُعرض ولا يُخفي.**
 *
 *  كان الترشيح يُسقط كل محطةٍ يسار اتجاه السير — منطقُ طريقٍ مزدوج، حيث
 *  محطةُ الجانب الآخر خلف حاجزٍ لا تُدخَل. وهو صحيح على طريق بغداد السريع.
 *
 *  لكن أكثر طرق الأنبار صحراويّةٌ مفردة: الجانبان يخدمان الاتجاهين، ولا
 *  حاجز. فإسقاطُ اليسار هناك يُخفي نصف التغطية — وقال المالك إن المطلوب
 *  **التغطية**: «نريد تغطية المحطات فقط».
 *
 *  فتُعرض كلّها، ويُكتب الجانب. معلومةٌ أكثر لا أقلّ، والقرار للمسافر. */
function collectStops(
  path: readonly LatLng[],
  stations: readonly RoadStation[]
): RouteStop[] {
  const stops: RouteStop[] = [];
  for (const s of stations) {
    const snap = snapAlong([s.la, s.lo], path);
    if (snap.km * 1000 > ON_ROAD_M) continue;
    stops.push({
      name: s.n,
      city: s.c,
      lat: s.la,
      lng: s.lo,
      atKm: snap.atKm,
      offRoadM: Math.round(snap.km * 1000),
      side: snap.side,
      toNextKm: null,
    });
  }

  stops.sort((a, b) => a.atKm - b.atKm);
  for (let i = 0; i < stops.length - 1; i++) {
    stops[i].toNextKm = stops[i + 1].atKm - stops[i].atKm;
  }
  return stops;
}

/** الفجوة التي تستحقّ تحذيراً — على درجتين، لأن الصحراء درجتان.
 *
 *  قِيست 8,234 امتداداً بين محطةٍ وأخرى على كل الرحلات فوق أربعين كيلومتراً:
 *
 *      وسيط  4.2 كم · ربع أعلى 14.3 · تسعة أعشار 74.1 · أقصى 362
 *
 *  فالقفزة بين 14 و74 — ما دونها عمرانٌ متّصل، وما فوقها صحراءٌ خالصة. ورقمٌ
 *  واحدٌ لا يفصل بينهما: ستّون يسكت عن أربعين تستحقّ خزّاناً ممتلئاً، ثم
 *  يقول «املأ خزّانك» بنبرةٍ واحدة أمام مئتين وخمسٍ وسبعين — وهناك لا يكفي
 *  ملءُ خزّان بل قرارُ ألّا تدخلها ليلاً وحدك.
 *
 *  فأربعون تنبيه، ومئةٌ وعشرون خطر. */
export const GAP_WARN_KM = 40;
export const GAP_SEVERE_KM = 120;
