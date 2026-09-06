import { supabase } from './supabase';
import { WITHDRAW_HOURS } from './hours';
import type {
  ProductTraffic,
  Station,
  StationProduct,
  StationTrafficAvg,
  StationWithStatus,
} from '@/types/database';

// haversine — Ramadi-scale distances, a projection library would be overkill
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** The public station list.
 *
 *  Reads `stations_public`, the view that returns null for a phone its owner
 *  chose to hide and that filters to approved stations itself. There is no
 *  fallback to the table: anon no longer holds SELECT on it, so a fallback
 *  would only turn one error into two.
 *
 *  ── وثلاثُ محاولاتٍ لا واحدة ───────────────────────────────────────────
 *
 *  طلبٌ ساقطٌ واحد كان يكفي ليرى المستعمل «تعذّر تحميل المحطات» — وهو أوّلُ
 *  شاشةٍ يراها. وقع فعلاً يوم ٢٠٢٦-٠٩-٠٧ الساعة ٠٠:٤٤: قُيست سجلّاتُ
 *  الخادم في تلك الدقيقة بعينها فإذا هي ١٨٦ طلباً كلُّها ناجحة، فالمنصّة لم
 *  تكن معطّلة — سقط طلبُ جهازٍ واحد على شبكة 4G.
 *
 *  والمنطقُ نفسُه مكتوبٌ في public/sw.js لملفّات `_next/static`: «One dropped
 *  request is enough, and there are two ways to get one». وهو أصدقُ على
 *  البيانات منه على الحزم: بلا الحزمة لا يُرسم شيء، وبلا البيانات يُرسم
 *  خطأٌ يقرؤه المستعمل عطلاً في المنصّة.
 *
 *  ولا مهلةَ لكلّ محاولةٍ هنا: النداءُ في app/page.tsx محدودٌ بخمسَ عشرةَ
 *  ثانية أصلاً، فالتعليقُ الوقتيُّ يقع هناك مرّةً واحدة. وهذه تعالج الطلبَ
 *  الذي يسقط سريعاً — وهو الشكلُ الغالب. */
export async function loadStations(): Promise<StationWithStatus[]> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const rows = await fetchStations();
      cacheStations(rows);
      return rows;
    } catch (e) {
      last = e;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw last;
}

/** ــ آخرُ حالةٍ وصلت الجهاز ــــــــــــــــــــــــــــــــــــــــــــــــــ
 *
 *  **لأن المنصّة تُستعمل حيث ينقطع الإنترنت.** قبل هذا لم يكن في الجهاز صفُّ
 *  محطةٍ واحد — `localStorage` كلُّه تفضيلاتٌ ومعرّفات، والعاملُ يمتنع عن
 *  تخزين نداءات Supabase قصداً (public/sw.js:25). فحين تسقط الشبكة لم يكن
 *  ثمّة ما يُعرض إطلاقاً.
 *
 *  وموضعُها هنا لا في نداءاتها: `loadStations` لها أربعةُ قرّاء — الصفحة
 *  الرئيسة ولوحةُ الفرع ولوحةُ التوفّر ومساعدُ الطريق — وكتابةُ اللقطة في
 *  أحدهم تترك الباقين بلا شيء.
 *
 *  والحجمُ مقيس: أربعون محطةً وأربعُمئة صفِّ منتجٍ تقع دون ثلاثمئة كيلوبايت،
 *  فلا حاجةَ إلى IndexedDB لِما يسعه مفتاحٌ واحد.
 *
 *  والفشلُ في الكتابة يُبتلع عمداً: اللقطةُ ترفٌ يُحسّن الانقطاع، وليست شرطاً
 *  لعرض البيانات التي وصلت للتوّ. */
const SNAP_KEY = 'stations-snapshot';

/** يُرفع عند أيّ تغييرٍ في شكل الصفّ.
 *
 *  بدونه تُقرأ لقطةٌ كُتبت بشكلٍ قديم فتُرسم بأعمدةٍ لم تعد موجودة — وهو عطلٌ
 *  يظهر بعد أسابيع في جهازٍ واحد ولا يُعاد إنتاجه. */
const SNAP_VERSION = 2;

export function cacheStations(rows: StationWithStatus[]): void {
  try {
    localStorage.setItem(
      SNAP_KEY,
      JSON.stringify({ v: SNAP_VERSION, at: new Date().toISOString(), rows })
    );
  } catch {
    /* حصّةٌ ممتلئة، أو تخزينٌ محجوب في تصفّحٍ خاصّ */
  }
}

/** اللقطةُ وساعتُها — والساعةُ لازمة: بياناتٌ بلا وقتٍ تُقرأ حاضرةً. */
export function loadCachedStations(): { rows: StationWithStatus[]; at: string } | null {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as { v?: number; at?: string; rows?: unknown };
    if (snap.v !== SNAP_VERSION || !snap.at || !Array.isArray(snap.rows)) return null;

    // والشكلُ يُفحص لا يُفترض: الرسمُ ينادي `s.products.some(...)` بلا حارس،
    // فلقطةٌ من بناءٍ سابقٍ فقدت العمود تُسقط الصفحةَ إلى app/error.tsx —
    // وهو بعينه ما وُضعت اللقطةُ لتمنعه.
    const first = snap.rows[0] as { products?: unknown } | undefined;
    if (first && !Array.isArray(first.products)) return null;

    // وفوق حدّ السحب لا تُعرض أصلاً: الحدُّ القائم في المنصّة (lib/hours.ts)،
    // وهو نفسُه الذي يُسقط ادّعاءَ المحطة عن الجدول. وساعةٌ في المستقبل تعني
    // ساعةَ جهازٍ مضبوطةً خطأً، فتُرفض كما تُرفض في `isFresh`.
    const age = (Date.now() - new Date(snap.at).getTime()) / 3600_000;
    if (!(age >= 0) || age >= WITHDRAW_HOURS) return null;

    return { rows: snap.rows as StationWithStatus[], at: snap.at };
  } catch {
    return null;
  }
}

async function fetchStations(): Promise<StationWithStatus[]> {
  const [stationsRes, productsRes, trafficRes, laneRes] = await Promise.all([
    // Belt and braces on the status filter. Dropping it here because "the view
    // filters it" put every rejected and suspended station on the public list
    // the moment the view shipped without that WHERE — a live, visible fault.
    // Two cheap filters beat one clever assumption.
    supabase
      .from('stations_public')
      .select('*')
      .eq('status', 'approved')
      .eq('is_demo', false)
      .order('name'),
    // سبعة صفوف لكل محطة، فالسقف يقع عند ١٤٣ محطة — وعندها تظهر محطاتٌ
    // للجمهور بلا وقود إطلاقاً، بلا خطأ في أي مكان، وأيّها يفرغ غير محدَّد
    // لأن الترتيب غير مضمون. هذه أخطر نسخة من العطل: تصيب الصفحة الرئيسة.
    supabase.from('station_products').select('*').range(0, 99_999),
    supabase.from('station_traffic_avg').select('*').range(0, 99_999),
    supabase.from('station_product_traffic').select('*').range(0, 99_999),
  ]);

  // supabase-js resolves with an error object instead of rejecting — without
  // this, a dropped connection is indistinguishable from an empty database
  const failure = stationsRes.error ?? productsRes.error ?? trafficRes.error ?? laneRes.error;
  if (failure) throw failure;

  const { data: stations } = stationsRes;
  const { data: products } = productsRes;
  const { data: traffic } = trafficRes;

  const productsByStation = new Map<string, StationProduct[]>();
  for (const p of (products ?? []) as StationProduct[]) {
    productsByStation.set(p.station_id, [...(productsByStation.get(p.station_id) ?? []), p]);
  }
  const trafficByStation = new Map(
    ((traffic ?? []) as StationTrafficAvg[]).map((t) => [t.station_id, t])
  );

  return ((stations ?? []) as Station[]).map((s) => ({
    ...s,
    products: productsByStation.get(s.id) ?? [],
    traffic: trafficByStation.get(s.id) ?? null,
    productTraffic: ((laneRes.data ?? []) as ProductTraffic[]).filter((t) => t.station_id === s.id),
  }));
}
