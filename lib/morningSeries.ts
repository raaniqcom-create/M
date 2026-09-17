import { PRODUCT_LABELS, PRODUCT_ORDER, isOffered } from './products.ts';
import { placeHref, shortAddress } from './scheduleRoute.ts';
import type { FuelProduct } from '../types/database.ts';

/** سلسلةُ الصباح — إشعارٌ لكلّ مدينةٍ في جدول التوزيع بمحطّتها ووقودها.
 *
 *  طلبُ صاحب المنصّة (١٦ أيلول): «المدينة: اختيارُ أنشط محطةٍ ونشرُ إشعارٍ لجميع
 *  الموجودين بالمدينة عن توفّر المحسن أوّلاً أو العادي أو الكاز؛ ولكلّ مدينةٍ
 *  ونوعِ وقودٍ إشعار، والأولويّةُ للمحطة المسجّلة؛ ومدينةٌ بلا محطةٍ مسجّلة
 *  تُختار لها المحطةُ الأكثرُ منتجات؛ بفارق دقيقتين».
 *
 *  هذا الملفُّ منطقٌ صافٍ: يأخذ صفوفَ الجدول ومحطاتِ المنصّة وجمهورَ كلّ مدينة،
 *  ويعيد الإشعاراتِ مرتّبةً بنصوصها. الإدراجُ والإرسالُ في `_shared/series.ts`. */

/** لا سلسلةَ قبل هذا اليوم — «البدء من تاريخ ١٧ الساعة ٧:٠٠ صباحاً». */
export const SERIES_START = '2026-09-17';
export const SERIES_HOUR = 7;
export const SERIES_GAP_MINUTES = 2;
export const TITLE_MAX = 64;
export const BODY_MAX = 178;

/** المحسنُ ثمّ العاديُّ ثمّ الكاز — كما عدّدها صاحبُ المنصّة — ثمّ الباقي بترتيب المنصّة. */
const FIRST: FuelProduct[] = ['gasoline_premium', 'gasoline_regular', 'kerosene'];
export const SERIES_PRODUCT_ORDER: FuelProduct[] = [...FIRST, ...PRODUCT_ORDER.filter((p) => !FIRST.includes(p))];

export interface SeriesRow {
  product: FuelProduct;
  station_name: string;
  city: string | null;
  linked_station_id: string | null;
}

export interface SeriesStation {
  id: string;
  name: string;
  city: string;
  address: string | null;
  status: string;
  is_demo: boolean;
  is_24h: boolean;
  opens_at: string;
  closes_at: string;
  temp_closed: boolean;
  products: { product: FuelProduct; is_available: boolean | null; updated_at: string | null; runs_out_at: string | null }[];
  /** تحديثاتُ صاحبها خلال ٢٤ ساعة (بلا صفوف النظام) — يعدّها المنادي من station_updates. */
  updates24h: number;
}

export interface SeriesItem {
  city: string;
  /** وقودُ الإشعار؛ null = إشعارُ مدينةٍ بلا مسجّلة يذكر منتجاتٍ عدّة ويصل كلَّ من اختار المدينة. */
  product: FuelProduct | null;
  products: FuelProduct[];
  stationId: string | null;
  stationName: string;
  address: string | null;
  registered: boolean;
  offeredNow: boolean;
  /** أهذا الوقودُ في جدول اليوم لهذه المحطة — أم من لوحتها وحدَها. */
  inSchedule: boolean;
  watchers: number;
  title: string;
  body: string;
  url: string;
  /** «series:<اليوم>:<المدينة>:<الوقود|all>» — يصير client_key ثابتاً فلا يتكرّر الصفّ. */
  key: string;
}

const FRESH_MS = 24 * 3600_000;

function lastUpdate(s: SeriesStation): number {
  return s.products.reduce((a, p) => (p.updated_at ? Math.max(a, new Date(p.updated_at).getTime()) : a), 0);
}

/** مسجّلةٌ ونشطة: معتمدةٌ، ليست تجريبيّة، وحدّث صاحبُها منتجاً خلال ٢٤ ساعة. */
export function qualifies(s: SeriesStation, now = Date.now()): boolean {
  return s.status === 'approved' && !s.is_demo && now - lastUpdate(s) < FRESH_MS;
}

/** «محطة تعبئة وقود الرمادي الجديدة» → «محطة الرمادي الجديدة» — الإشعارُ قصير. */
export function displayName(name: string): string {
  return name.replace(/^محطة\s+تعبئة\s+(وقود\s+)?/u, 'محطة ').trim();
}

const labels = (ps: FuelProduct[]) => ps.map((p) => PRODUCT_LABELS[p]).join(' و');

type Candidate = {
  key: string;
  name: string;
  stationId: string | null;
  /** من جدول التوزيع اليوم. */
  sched: Set<FuelProduct>;
  /** معروضٌ على لوحتها الآن (isOffered). */
  live: Set<FuelProduct>;
  /** الاتّحاد — عليه الترتيبُ والترجيح. */
  products: Set<FuelProduct>;
  station: SeriesStation | null;
};

export function buildMorningSeries(
  input: { forDate: string; rows: SeriesRow[]; stations: SeriesStation[]; watchers: Record<string, number> },
  now = Date.now()
): SeriesItem[] {
  const byId = new Map(input.stations.map((s) => [s.id, s]));
  // المدينةُ → مرشّحوها (محطةٌ = مجموعةُ صفوفها بمنتجاتها).
  const cities = new Map<string, Map<string, Candidate>>();
  const candidate = (
    city: string,
    key: string,
    name: string,
    stationId: string | null,
    station: SeriesStation | null
  ): Candidate => {
    const cands = cities.get(city) ?? new Map<string, Candidate>();
    let c = cands.get(key);
    if (!c) {
      c = { key, name, stationId, sched: new Set(), live: new Set(), products: new Set(), station };
      cands.set(key, c);
      cities.set(city, cands);
    }
    return c;
  };

  for (const r of input.rows) {
    if (!r.city) continue;
    const key = r.linked_station_id ?? `n:${r.station_name}`;
    const c = candidate(
      r.city,
      key,
      r.station_name,
      r.linked_station_id,
      r.linked_station_id ? (byId.get(r.linked_station_id) ?? null) : null
    );
    c.sched.add(r.product);
    c.products.add(r.product);
  }

  // ── وما تعلنه المحطاتُ على لوحاتها الآن ─────────────────────────────────
  //
  // «وسّعه ليشمل المتوفّرَ الآن» — صاحبُ المنصّة، ١٨ أيلول. وكانت السلسلةُ
  // تُبنى من جدول التوزيع وحدَه، فمحطةٌ تعلن وقوداً على لوحتها وليست في جدول
  // اليوم لا يذكرها أحد — وهي أصدقُ خبراً من وعدٍ كُتب البارحة.
  //
  // والمقياسُ `isOffered` نفسُه الذي يُخضّر البطاقة، لا منظورُ القاعدة
  // `station_products_live` (نافذتُه ٤٨ ساعةً لا ٢٤): صفٌّ عمرُه ثلاثون ساعةً
  // يُرسم في التطبيق **رماديّاً**، فإشعارٌ يقول «متوفّر الآن» ويفتح بطاقةً
  // رماديّةً هو العطبُ الذي كُتبت `isOffered` لإنهائه.
  for (const s of input.stations) {
    if (!qualifies(s, now)) continue;
    const offered = s.products.filter((p) => isOffered(s, p));
    if (!offered.length) continue;
    const c = candidate(s.city, s.id, s.name, s.id, s);
    for (const p of offered) {
      c.live.add(p.product);
      c.products.add(p.product);
    }
  }

  // الأكبرُ جمهوراً أوّلاً: حاجزُ الشخص ٤٥ دقيقة يعطيه أوّلَ صفٍّ يطابقه، فالأكثرون
  // ينالون صفَّهم. (يُقلب بسطرٍ إن أُريد تقديمُ المدن الصغيرة.)
  const order = [...cities.keys()].sort(
    (a, b) => (input.watchers[b] ?? 0) - (input.watchers[a] ?? 0) || a.localeCompare(b, 'ar')
  );

  const active = (c: Candidate) => (c.station ? c.station.updates24h : 0);
  const mostActive = (a: Candidate, b: Candidate) =>
    active(b) - active(a) || lastUpdate(b.station!) - lastUpdate(a.station!) || a.name.localeCompare(b.name, 'ar');
  const mostProducts = (a: Candidate, b: Candidate) => b.products.size - a.products.size || a.name.localeCompare(b.name, 'ar');

  const out: SeriesItem[] = [];
  for (const city of order) {
    const cands = [...cities.get(city)!.values()];
    const watchers = input.watchers[city] ?? 0;
    const qualified = cands.filter((c) => c.station && qualifies(c.station, now));

    if (qualified.length) {
      // إشعارٌ لكلّ وقودٍ في جدول المدينة — المسجّلةُ النشطةُ أوّلاً، وإلّا الأكثرُ منتجاتٍ ومنها هذا الوقود.
      const present = SERIES_PRODUCT_ORDER.filter((p) => cands.some((c) => c.products.has(p)));
      for (const product of present) {
        // والمعلِنُ الآن يسبق المجدوَل: الجدولُ وعدٌ، واللوحةُ خبر. وما عدا
        // ذلك فالترجيحُ كما كان — الأنشطُ ثمّ الأحدثُ ثمّ الاسم.
        const reg = qualified
          .filter((c) => c.products.has(product))
          .sort((a, b) => Number(b.live.has(product)) - Number(a.live.has(product)) || mostActive(a, b))[0];
        const c = reg ?? cands.filter((c) => c.products.has(product)).sort(mostProducts)[0];
        out.push(item(input.forDate, city, product, [product], c, !!reg, watchers));
      }
    } else {
      // مدينةٌ بلا مسجّلةٍ نشطة: إشعارٌ واحدٌ بالمحطة الأكثر منتجات.
      const c = cands.sort(mostProducts)[0];
      const products = SERIES_PRODUCT_ORDER.filter((p) => c.products.has(p));
      out.push(item(input.forDate, city, null, products, c, false, watchers));
    }
  }
  return out;
}

function item(
  forDate: string,
  city: string,
  product: FuelProduct | null,
  products: FuelProduct[],
  c: Candidate,
  registered: boolean,
  watchers: number
): SeriesItem {
  const name = displayName(c.name);
  const address = shortAddress({ name: c.name, address: c.station?.address ?? null });
  const row = product && c.station ? c.station.products.find((p) => p.product === product) : undefined;
  // isOffered = أعلنه، وخلال نافذة الحداثة، ولم ينفد، والمحطةُ مفتوحةٌ الآن — المقياسُ الواحد في المنصّة.
  const offeredNow = registered && !!c.station && !!row && isOffered(c.station, row);
  const a = address ? ` (${address})` : '';
  const t = labels(products);

  // أهذا الوقودُ في جدول اليوم لهذه المحطة؟ — تفرّق الجملةَ ولا تفرّق الجمهور.
  const inSchedule = product ? c.sched.has(product) : c.sched.size > 0;

  let title: string;
  let body: string;
  if (product && offeredNow && !inSchedule) {
    // معلَنٌ على لوحتها وليست في جدول اليوم — ولا يُنسب إلى الجدول بحرف.
    // ولا يُقال «ليست في الجدول» أيضاً: نفيٌ لم يسأل عنه القارئُ يُقرأ اعتذاراً.
    title = `${t} متوفر الآن في ${city}`;
    body = `${name}${a} — أكّدت توفّره الآن على المنصّة. اضغط لصفحتها.`;
  } else if (product && registered && offeredNow) {
    title = `${t} متوفر الآن في ${city}`;
    body = `${name}${a} — أكّدت توفّره الآن وهي في جدول التوزيع اليوم. اضغط لصفحتها.`;
  } else if (product && registered) {
    title = `${t} اليوم في ${city}`;
    body = `${name}${a} — في جدول التوزيع اليوم، وصاحبها يحدّث حالتها على المنصّة. اضغط لصفحتها.`;
  } else if (product) {
    title = `${t} اليوم في ${city}`;
    body = `${name}${a} — في جدول التوزيع اليوم. الطريق إليها في التطبيق.`;
  } else {
    title = `${t} اليوم في ${city}`;
    if (title.length > TITLE_MAX) title = `جدول التوزيع اليوم في ${city}`;
    body = `${name}${a} — ${t} في جدول التوزيع اليوم. الطريق إليها في التطبيق.`;
  }
  // المتنُ ١٧٨ حرفاً: إن طال بالعنوان أُسقط العنوانُ قبل أن يُقصّ في منتصف كلمة.
  if (body.length > BODY_MAX && a) body = body.replace(a, '');

  return {
    city,
    product,
    products,
    stationId: c.stationId,
    stationName: name,
    address,
    registered,
    offeredNow,
    inSchedule,
    watchers,
    title: title.slice(0, TITLE_MAX),
    body: body.slice(0, BODY_MAX),
    url: placeHref({ name: c.name, city, stationId: c.stationId }),
    key: `series:${forDate}:${city}:${product ?? 'all'}`,
  };
}

/** uuid v5 من المفتاح — ثابتٌ للمدخل نفسِه، فيصير client_key ويمنع الصفَّ المكرّر.
 *  crypto.subtle موجودٌ في Node 24 وDeno معاً. */
export async function seriesKey(key: string): Promise<string> {
  const NS = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'; // نطاقُ URL المعياريّ
  const ns = Uint8Array.from(NS.replace(/-/g, '').match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const data = new Uint8Array([...ns, ...new TextEncoder().encode(key)]);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', data)).slice(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** «٠٧:٠٠» بتوقيت بغداد من طابعٍ زمنيّ. */
export function baghdadClock(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit' });
}
