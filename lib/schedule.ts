import { PRODUCT_LABELS } from './products.ts';
import { metresBetween, normalizeName, searchKnownFuel } from './nearbyFuel.ts';
import type { FuelProduct } from '@/types/database';

/** جدولُ الغد — قراءةُ منشورٍ يصل كما هو، ومطابقةُ أسمائه.
 *
 *  ── ما يُقرأ فعلاً ───────────────────────────────────────────────────────
 *
 *  الجدولُ يصل من قناةٍ تنشر نحوَ الثامنة والنصف مساءً، بشكلين قِيسا من
 *  منشوراتها لا من التخمين:
 *
 *    غدا ان شاء الله البنزين العادي في المحطات التالية    ← الوقودُ في العنوان
 *    السريع البريشة
 *    الامن
 *
 *    غدا ان شاء الله محطة مها البادية … تجهيز بنزين محسن  ← الوقودُ في آخره
 *
 *  والأسماءُ بلا مدن، وبعضُها معالمُ لا أسماءُ محطات («السينما»، «الامن»).
 *
 *  ── ولا يُقرَّر شيء ──────────────────────────────────────────────────────
 *
 *  المطابقةُ بالاسم جُرّبت في هذه المنصّة ورُفضت — `20260823c` يسجّل أنها
 *  تُخطئ في الجهتين. فهذه الوحدةُ **تقترح**: تعطي مرشَّحاً ودرجةَ ثقة، ويبقى
 *  القرارُ لإنسانٍ يضغط. ولذلك لا تكتب في القاعدة ولا تعرف عنها شيئاً. */

/** سطرٌ واحدٌ من الجدول، بعد القراءة والمطابقة. */
export interface ScheduleLine {
  /** كما ورد في المنشور، بلا تجميل. */
  raw: string;
  /** الاسمُ المقترَح من قائمة المسح، أو `raw` إن لم يُطابَق. */
  name: string;
  /** من مدينة المرشَّح المسحيّ. `null` تعني «لم أعرف» ولا تُخمَّن. */
  city: string | null;
  /** معرّفُ المحطة المسجّلة إن وُجدت. */
  stationId: string | null;
  /** ثقةُ المطابقة بالاسم. صفرٌ يعني لم يُطابَق شيء. */
  score: number;
}

export interface ParsedSchedule {
  product: FuelProduct;
  lines: ScheduleLine[];
}

/** محطةٌ مسجّلةٌ كما تصل من `stations_public` — أقلُّ ما تحتاجه المطابقة. */
export interface PlatformStation {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
}

/** الكلماتُ التي تُميّز منشورَ جدولٍ عن سؤالِ بحث.
 *
 *  والفصلُ بينهما لازم: نصُّ الرسالة في البوت اليوم **بحثٌ عن محطة**، ولو صار
 *  كلُّ نصٍّ جدولاً لصار كلُّ من كتب اسمَ محطةٍ ناشراً. */
const SCHEDULE_HINTS = ['المحطات التاليه', 'المحطات التالي', 'تجهيز', 'غدا', 'غداً'];

/** يُحلّ اسمُ الوقود من نصٍّ حرّ.
 *
 *  بالتطبيع نفسِه الذي تستعمله المطابقة، فـ«البنزين العادي» و«بانزين عادي»
 *  و«البنزين العادى» شيءٌ واحد. */
export function readProduct(text: string): FuelProduct | null {
  const t = normalizeName(text);
  // الأطولُ أوّلاً: «بانزين محسن» تحوي «بانزين»، فلو فُحص القصيرُ أوّلاً لَغلب.
  const byLength = (Object.entries(PRODUCT_LABELS) as [FuelProduct, string][]).sort(
    (a, b) => b[1].length - a[1].length
  );
  for (const [key, label] of byLength) {
    if (t.includes(normalizeName(label))) return key;
  }
  return null;
}

/** أهذا منشورُ جدولٍ أم رسالةٌ عادية؟
 *
 *  الشرطان معاً: قرينةُ صياغةٍ **و**اسمُ وقود. وواحدةٌ منهما وحدَها تُخطئ —
 *  «غدا» تَرِد في كلام الناس، و«كاز» تَرِد في اسم محطة. */
export function looksLikeSchedule(text: string): boolean {
  const t = normalizeName(text);
  return SCHEDULE_HINTS.some((h) => t.includes(normalizeName(h))) && readProduct(text) !== null;
}

/** ضجيجُ الصدر: يُسقط قبل قراءة الأسماء. */
const PREAMBLE =
  /(غدا|غداً)\s*(ان\s*شاء\s*الله|إن\s*شاء\s*الله)?|في\s*المحطات\s*التاليه?|المحطات\s*التاليه?|تجهيز/g;

/** يقرأ المنشورَ ويُخرج الوقودَ وأسماءَ المحطات — بلا مطابقة. */
export function parseSchedule(text: string): { product: FuelProduct; names: string[] } | null {
  const product = readProduct(text);
  if (!product) return null;

  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!rows.length) return null;

  const label = normalizeName(PRODUCT_LABELS[product]);
  const strip = (s: string) =>
    normalizeName(s.replace(PREAMBLE, ' '))
      .replace(label, ' ')
      // بالكلمات لا بتعبيرٍ نمطيّ: «ال ال» متجاورتان لا يلتقطهما تعبيرٌ
      // يشترط فراغاً قبل وبعد — يبتلع الأوّلُ الفراغَ فتنجو الثانية.
      // و«ال» بقيّةُ «البنزين» بعد إسقاط «بنزين» من داخلها: أداةٌ يتيمة.
      .split(' ')
      .filter((w) => w && w !== 'ال')
      .join(' ')
      .trim();

  const marker = normalizeName('المحطات التاليه');

  // منشورٌ من سطرٍ واحد: هو نفسُه المحطة، والوقودُ في آخره — إلّا أن يَعِد
  // بقائمةٍ لم تصل، فذاك عنوانٌ بلا جسم ولا يُنشر منه شيء.
  if (rows.length === 1) {
    if (normalizeName(rows[0]).includes(marker)) return null;
    const one = strip(rows[0]);
    return one ? { product, names: [one] } : null;
  }

  // **العنوانُ يُعرَف بما فيه لا بما يبقى منه.** كان يُحكم عليه بالبقيّة، فسطرُ
  // «البنزين العادي في المحطات التالية» يترك «ال» فيُحسب محطةً تاسعة. والفحصُ
  // الموجَب أدقّ: سطرٌ يذكر الوقودَ أو «المحطات التالية» عنوانٌ لا محطة.
  const isHead = (line: string) => {
    const n = normalizeName(line);
    return n.includes(label) || n.includes(marker);
  };
  const names = rows.filter((l) => !isHead(l)).map(strip).filter((s) => s.length >= 2);
  return names.length ? { product, names } : null;
}

/** يطابق اسماً واحداً: مرشَّحٌ مسحيٌّ يعطي المدينة، ثمّ محطةٌ مسجّلةٌ إن وُجدت.
 *
 *  **الجغرافيا أوّلاً، والاسمُ احتياطاً** — وهو حكمُ `onPlatform` القائم في
 *  نموذج التسجيل، وحدُّ الخمسمئة متر مقيسٌ هناك لا مخمَّن: أبعدُ تطابقٍ صحيحٍ
 *  كان ٤٢٤ متراً وأقربُ خاطئٍ ٥٨٠. */
export function matchLine(raw: string, platform: PlatformStation[]): ScheduleLine {
  const [hit] = searchKnownFuel(raw, 1);
  const key = normalizeName(raw);

  const byName = () => platform.find((s) => normalizeName(s.name) === key) ?? null;

  if (!hit) {
    const direct = byName();
    return {
      raw,
      name: direct?.name ?? raw,
      city: null,
      stationId: direct?.id ?? null,
      score: direct ? 100 : 0,
    };
  }

  const { la, lo, n, c } = hit.station;
  const near =
    platform.find(
      (s) =>
        s.lat != null &&
        s.lng != null &&
        metresBetween({ lat: la, lng: lo }, { lat: s.lat, lng: s.lng }) <= 500
    ) ?? byName();

  return {
    raw,
    name: near?.name ?? n,
    city: c || null,
    stationId: near?.id ?? null,
    score: hit.score,
  };
}

/** المنشورُ كاملاً: قراءةٌ ثمّ مطابقةُ كلّ سطر. */
export function readSchedule(text: string, platform: PlatformStation[]): ParsedSchedule | null {
  const parsed = parseSchedule(text);
  if (!parsed) return null;
  return {
    product: parsed.product,
    lines: parsed.names.map((n) => matchLine(n, platform)),
  };
}
