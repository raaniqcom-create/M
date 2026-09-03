import type { FuelProduct, TrafficLevel } from '@/types/database';
import { hasRunOut, isFresh, isOpenNow, isWithdrawn } from './hours';

// single source of truth for the 6 fixed products — mirrors the fuel_product
// enum in supabase/schema.sql
export const PRODUCT_LABELS: Record<FuelProduct, string> = {
  gasoline_regular: 'بانزين عادي',
  gasoline_premium: 'بانزين محسن',
  gasoline_super: 'بانزين سوبر',
  kerosene: 'كاز',
  gas: 'غاز',
  lpg: 'LPG',
  white_oil: 'نفط أبيض',
};

export const PRODUCT_ORDER: FuelProduct[] = [
  'gasoline_regular',
  'gasoline_premium',
  'gasoline_super',
  'kerosene',
  'gas',
  'lpg',
  'white_oil',
];

export const TRAFFIC_LABELS: Record<TrafficLevel, string> = {
  green: 'خفيف',
  yellow: 'متوسط',
  red: 'مزدحم',
};

// full class strings — Tailwind can't see dynamically-built names
export const TRAFFIC_COLORS: Record<
  TrafficLevel,
  { dot: string; bg: string; text: string; border: string }
> = {
  green: {
    dot: 'bg-traffic-green',
    bg: 'bg-green-50',
    text: 'text-traffic-green',
    border: 'border-traffic-green',
  },
  yellow: {
    dot: 'bg-traffic-yellow',
    bg: 'bg-yellow-50',
    text: 'text-traffic-yellow',
    border: 'border-traffic-yellow',
  },
  red: {
    dot: 'bg-traffic-red',
    bg: 'bg-red-50',
    text: 'text-traffic-red',
    border: 'border-traffic-red',
  },
};

export function stationShareText(
  name: string,
  available: FuelProduct[],
  traffic: TrafficLevel | null
): string {
  const products = available.length
    ? available.map((p) => PRODUCT_LABELS[p]).join(' · ')
    : 'لا يوجد وقود متوفر حالياً';
  const trafficLine = traffic ? `\nالازدحام: ${TRAFFIC_LABELS[traffic]}` : '';
  return `⛽ ${name}\nالمتوفر: ${products}${trafficLine}`;
}

// Relative wording beats a bare date on a phone: "غداً" is instantly readable,
// "2026-08-07" needs a mental calculation.
export function expectedLabel(isoDate: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${isoDate}T00:00:00`);
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (days < 0) return 'متوقع';
  if (days === 0) return 'متوقع اليوم';
  if (days === 1) return 'متوقع غداً';
  if (days === 2) return 'متوقع بعد غد';
  return `متوقع خلال ${days} أيام`;
}

// Built from local date parts, not toISOString(): that converts to UTC first,
// so "tomorrow" silently becomes "today" for any timezone ahead of UTC once the
// local clock passes the offset — exactly Iraq's case.
export function isoDateIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** كم تبقى حالة الازدحام التي يحدّدها صاحب المحطة صالحة. */
export const MANUAL_TRAFFIC_MINUTES = 30;

/** الحالة التي تُعرض فعلاً، أو لا شيء.
 *
 *  تحديد صاحب المحطة يتقدّم على تصويت الناس ما دام طازجاً — فهو واقف في
 *  الساحة ويراها. لكنه ينتهي: حالةٌ حُدِّدت صباحاً ولم تُمسّ بعدها تصف صباحاً
 *  انتهى، وكانت تحجب التصويت الحيّ لتقول ذلك. تصويت المستخدمين يسقط بعد ٣٠
 *  دقيقة، فتحديد المالك يسقط بعدها أيضاً — العدل نفسه للطرفين.
 *
 *  manual_traffic_set_at كان يُكتب ولا يُقرأ في أي موضع. هذه أول قراءة له. */
export interface TrafficStation {
  manual_traffic_level?: TrafficLevel | null;
  manual_traffic_set_at?: string | null;
  // Required, not optional: an optional hours field is silently absent when a
  // caller passes a partial object, and the guard below then reads a closed
  // station as open — which is the exact bug this is here to prevent.
  is_24h: boolean;
  opens_at: string;
  closes_at: string;
  temp_closed?: boolean;
}

export function activeTrafficLevel(
  station: TrafficStation,
  votes?: { majority_level?: TrafficLevel | null; last_vote_at?: string | null } | null
): TrafficLevel | null {
  // Nobody queues at a shut forecourt. The owner tapped «خفيف» at 04:10 on a
  // station that opens at 06:00, and the reading rode the 30-minute freshness
  // window onto a card that also said «مغلقة» — a stale badge inviting a
  // wasted trip. This function had no idea the station was closed: the hours
  // were not even in its parameter type.
  if (!isOpenNow(station)) return null;

  const setAt = station.manual_traffic_set_at
    ? new Date(station.manual_traffic_set_at).getTime()
    : 0;
  const stillFresh = setAt > 0 && Date.now() - setAt < MANUAL_TRAFFIC_MINUTES * 60_000;
  const voteAt = votes?.last_vote_at ? new Date(votes.last_vote_at).getTime() : 0;

  // The most recent observation wins.
  //
  // The owner used to outrank the crowd outright while their reading was
  // fresh. That is wrong when the crowd is both newer and larger: four people
  // standing in the queue voted «مزدحم» after the owner had marked «متوسط»,
  // and the page kept showing متوسط. The owner is one observer who was right
  // twenty minutes ago; the people in the forecourt are many and are there now.
  //
  // Not a vote count contest — recency alone. An owner who taps a level after
  // the last vote is making the newest observation and should win, exactly as
  // the crowd wins when it speaks last.
  if (stillFresh && station.manual_traffic_level) {
    if (voteAt > setAt && votes?.majority_level) return votes.majority_level;
    return station.manual_traffic_level;
  }
  return votes?.majority_level ?? null;
}

/** Which source the shown level came from, so the label can say so honestly. */
export function trafficSource(
  station: TrafficStation,
  votes?: { majority_level?: TrafficLevel | null; last_vote_at?: string | null } | null
): 'station' | 'people' | null {
  const level = activeTrafficLevel(station, votes);
  if (!level) return null;
  const setAt = station.manual_traffic_set_at
    ? new Date(station.manual_traffic_set_at).getTime()
    : 0;
  const stillFresh = setAt > 0 && Date.now() - setAt < MANUAL_TRAFFIC_MINUTES * 60_000;
  const voteAt = votes?.last_vote_at ? new Date(votes.last_vote_at).getTime() : 0;
  return stillFresh && station.manual_traffic_level && voteAt <= setAt ? 'station' : 'people';
}

/** هل هذا المنتج متوفّرٌ الآن فعلاً — المقياس الوحيد في المنصّة كلها.
 *
 *  ثلاثة شروط لا واحد: أعلنته المحطة، وأعلنته خلال نافذة الحداثة، وهي مفتوحة
 *  الآن. وكان يُكتب بيد في ستّة مواضع، فدرجت النسخ:
 *
 *  · StationLive نسي الحداثة، فعرض «متوفر» أخضرَ على خبر عمره ٧٠ ساعة.
 *  · ProductsDashboard نسيها أيضاً، فعدّ «بانزين محسن: ١» بينما القائمة تفحصها
 *    فلا تجد شيئاً — والمستخدم يضغط الرقم فيُقال له «لا توجد محطة». عطلٌ يبدو
 *    عبثاً بالمنصّة، وهو اختلاف سطرٍ بين ملفّين.
 *
 *  فمن أراد تغيير المعنى — نافذةً أطول، أو عرضاً للمغلقة — يغيّره هنا مرة،
 *  ويتحرّك كل سطح معه. */
export function isOffered(
  station: { is_24h: boolean; opens_at: string; closes_at: string; temp_closed?: boolean },
  row: { is_available?: boolean | null; updated_at?: string | null; runs_out_at?: string | null } | undefined | null
): boolean {
  return (
    !!row?.is_available &&
    isFresh(row.updated_at) &&
    // ما أعلن صاحبُه نفادَه لا يُعرض أخضرَ ولو كان الخبر طازجاً
    !hasRunOut(row.runs_out_at) &&
    isOpenNow(station)
  );
}

/** هل لهذه المحطة ما تقوله؟
 *
 *  متوفرٌ الآن، أو متوقّعٌ لاحقاً. ومن لا هذا ولا ذاك لا يظهر في القائمة —
 *  طلب المالك: البطاقات تُفتح للبحث عن وقود، وبطاقةٌ لا وقود فيها ولا وعدَ
 *  به ضجيجٌ بين الأجوبة.
 *
 *  والمقياس is_available و expected_at وحدهما — **لا حداثةٌ ولا دوام**. لأن
 *  حارس الحداثة يُخفي خبراً شاخ وصاحبه لم يُصحّحه، وحارس الدوام يُخفي المحطة
 *  ليلاً: قِيس الساعة 03:47 فوُجد صفرٌ من ثماني عشرة محطة مفتوحة. فقاعدةٌ
 *  تتبعهما تُفرغ التطبيق كل ليلة.
 *
 *  ولا تُحذف المحطة: البحث بالاسم يجدها، والخريطة تحملها، وسطرٌ أسفل القائمة
 *  يفتحها. ومن يعرف أن محطةً موجودة ويقول له التطبيق إنها ليست موجودة يفقد
 *  الثقة بكل ما عداها.
 *
 *  ونظيرتها في الخادم: noStock داخل supabase/functions/owner-daily — تُبقي
 *  الرسالة التي تصل المالك على المقياس نفسه الذي يُخفيه. */
/** هل يُعرض هذا المنتج على البطاقة أصلاً؟
 *
 *  ثلاثةُ مواضع كانت تكتب الشرط بيدها — البطاقة وسؤال الرحلة ولوحة المالك —
 *  فأضافت `WITHDRAW_HOURS` قاعدةً رابعة تُنسى في اثنين منها. والمنسيُّ هنا
 *  ليس تفصيلاً: منتجٌ سُحب ولم يخرج من `shown` يسقط إلى فرع «متوقَّع» في
 *  التنسيق، فيُعرض بلون الترقّب خبرٌ عمره خمسة أيام.
 *
 *  فصارت جملةً واحدة: متوفّرٌ لم يُسحب، أو له موعدُ وصولٍ معلَن. */
export function isListed(
  row:
    | { is_available?: boolean | null; updated_at?: string | null; expected_at?: string | null; runs_out_at?: string | null }
    | undefined
    | null
): boolean {
  // الحارسُ على شطر التوفّر وحدَه: موعدُ الوصول لا يُبطله النفاد بل يُكمله —
  // «نفد الآن، ويصل غداً» جملةٌ صحيحة، وإخفاؤها يمحو النصف النافع منها.
  //
  // **ولا يجوز حراسةُ isOffered وحدها.** منتجٌ نفد وخبرُه حديث يسقط من
  // isOffered ومن isStaleOffer معاً، فيبقى في `shown` ويهبط إلى فرع
  // «متوقَّع» الكهرمانيّ في StationCard — شريحةُ ترقّبٍ على وقودٍ نفد.
  return (
    (!!row?.is_available && !isWithdrawn(row.updated_at) && !hasRunOut(row.runs_out_at)) ||
    !!row?.expected_at
  );
}

export function hasSomethingToShow(station: {
  products: {
    is_available?: boolean | null;
    expected_at?: string | null;
    updated_at?: string | null;
    runs_out_at?: string | null;
  }[];
}): boolean {
  // ادّعاءٌ سُحب لا يُبقي محطةً في القائمة: البقاءُ عليه يعني أن يقصدها
  // مسافرٌ على خبرٍ لم نعد نعرضه نحن أنفسنا.
  return station.products.some(isListed);
}

/** أُعلن متوفّراً، وفات عمر إعلانه. يُعرض بالرمادي مع عمره: لا يُخفى فتضيع
 *  المعلومة، ولا يُعرض أخضرَ فيُرسل الناس إلى وقود نفد.
 *
 *  **وله حدٌّ ينتهي عنده.** بعد `WITHDRAW_HOURS` لا يُعرض أصلاً: «بانزين ·
 *  قبل ١٠ أيام» ليست معلومةً ناقصة بل جملةٌ لا يُبنى عليها قرار، وعرضُها
 *  يُبقي في الجدول محطةً لا نعرف عنها شيئاً. والسحبُ عرضٌ لا حذف — انظر
 *  `isWithdrawn` في lib/hours.ts. */
export function isStaleOffer(
  row: { is_available?: boolean | null; updated_at?: string | null; runs_out_at?: string | null } | undefined | null
): boolean {
  // والرماديُّ يعني «أُعلن ولم يُصحَّح، وقد يكون قائماً». والنافدُ صُحِّح
  // بإعلان صاحبه — فعرضُه رماديّاً يُبقي احتمالاً أغلقه المالكُ بيده.
  return (
    !!row?.is_available &&
    !isFresh(row.updated_at) &&
    !isWithdrawn(row.updated_at) &&
    !hasRunOut(row.runs_out_at)
  );
}
