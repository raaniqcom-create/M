import { PRODUCT_LABELS } from './products.ts';
import { metresBetween, normalizeName, searchKnownFuel } from './nearbyFuel.ts';
import { CITY_NAMES } from './cities.ts';
import type { FuelProduct } from '../types/database.ts';

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
  // بلا أداةِ تعريف: القناةُ تكتب «البنزين العادي» والوسمُ «بانزين عادي»،
  // فمقارنةٌ حرفيّةٌ تُبقي «العادي» في السطر فتُحسب محطةً اسمُها «العادي».
  const bare = (w: string) => {
    const n = normalizeName(w);
    return n.startsWith('ال') ? n.slice(2) : n;
  };
  const labelWords = new Set(label.split(' ').filter(Boolean).map(bare));

  /** يُسقط الصدرَ واسمَ الوقود — **ويُبقي الحروفَ كما كُتبت.**
   *
   *  كان يُطبّع ثمّ يردّ المطبَّع، فيخرج «الخالديه» و«الحبانيه» بالهاء إلى
   *  الناس. والتطبيعُ مفتاحُ مطابقةٍ لا نصٌّ يُعرض: يُقارَن به ويُرمى، ويبقى
   *  المعروضُ ما كتبته القناة.
   *
   *  والفلترةُ بالكلمات لا بتعبيرٍ نمطيّ: «ال ال» متجاورتان لا يلتقطهما
   *  تعبيرٌ يشترط فراغاً قبل وبعد — يبتلع الأوّلُ الفراغَ فتنجو الثانية.
   *  و«ال» بقيّةُ «البنزين» بعد إسقاط «بنزين» من داخلها: أداةٌ يتيمة. */
  const strip = (s: string) =>
    s
      .replace(PREAMBLE, ' ')
      .split(/\s+/)
      .filter((w) => {
        const n = normalizeName(w);
        return n && n !== 'ال' && !labelWords.has(bare(w));
      })
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
/** ما تكتبه القناةُ ↤ الاسمُ الذي نعرفه.
 *
 *  القناةُ تكتب باللهجة وبأسماءِ المعالم: «السريع البو ريشه» هي عند الناس
 *  ما هي عندنا «محطة تعبئة وقود الرمادي الحكومية الطريق السريع». والمطابقةُ
 *  بالتشابه تعطيها ٢٧٫٥ — كلمةً من كلمتين — وهي دون الحدّ بحقّ: بذلك القدر
 *  من التشابه تُطابق «البوذياب» أيضاً.
 *
 *  **فالجوابُ جدولُ مرادفاتٍ يكتبه إنسان، لا حدٌّ يُخفَّض.** خفضُ الحدّ يُدخل
 *  التخمينَ كلَّه ليصحّح اسماً واحداً؛ والمرادفُ يصحّح ما نعرفه ولا يمسّ غيره.
 *  ويطول هذا الجدولُ كلَّما صحّح صاحبُ المنصّة سطراً في البوت.
 *
 *  **والوجهةُ اسمٌ من قائمة المسح حرفيّاً**، ليكون التطابقُ تامّاً (١٠٠) لا
 *  تشابهاً. فإن أُعيدت تسميةُ محطةٍ في `roadStations.ts` وجب تعديلُ مرادفها
 *  هنا — و`test-schedule-match.mjs` يسقط إن نُسي، وهو المقصود. */
const HIGHWAY = 'محطة تعبئة وقود الرمادي السريع 5 كيلو (البوريشة)';

const ALIAS_PAIRS: [string, string][] = [
  ['السريع البو ريشه', HIGHWAY],
  ['السريع البريشة', HIGHWAY],
  ['البو ريشة', HIGHWAY],
  ['البوريشة', HIGHWAY],
  ['البو يشة', HIGHWAY],
];

// بالمفتاح المطبَّع: «البريشة» و«البريشه» و«البريشـة» مفتاحٌ واحد.
const ALIASES = new Map(ALIAS_PAIRS.map(([k, v]) => [normalizeName(k), v]));

/** الناحيةُ إن كانت مكتوبةً في السطر نفسِه.
 *
 *  **قراءةٌ لا تخمين.** القناةُ تكتب أحياناً «الخالدية قرب مركز الخالدية»
 *  و«الحبانية القديمة يم سيطرة الخالدية» — فالناحيةُ في النصّ حرفيّاً، ثمّ
 *  تُهمَل لأنّ المطابقةَ بالاسم لم تبلغ الحدَّ فلم يبقَ من يقرأ السطر.
 *
 *  والأطولُ أوّلاً: «عامرية الفلوجة» تحوي «الفلوجة»، فلو فُحص القصيرُ أوّلاً
 *  لَنُسبت محطةُ العامريّة إلى الفلوجة. */
const CITIES_BY_LENGTH = [...CITY_NAMES].sort((a, b) => b.length - a.length);

/** موضعٌ يعرفه أهلُ الأنبار ↤ ناحيتُه.
 *
 *  القناةُ تسمّي المحطاتِ بمعالمها لا بنواحيها: «ريف الجزيرة البعلي جاسم»
 *  و«غصن الزيتون جويبة» و«مها البادية البعبود العيادة». وليس في هذه الأسماء
 *  اسمُ ناحيةٍ يُقرأ، ولا تبلغ المطابقةُ بها حدَّها — فتبقى بلا ناحية.
 *
 *  **وهذا جدولُ معرفةٍ يمليه إنسانٌ يعرف الأرض، لا استنتاجٌ من نصّ.** أملاه
 *  صاحبُ المنصّة، ويطول كلَّما صحّح سطراً في البوت. وهو أصدقُ من خفض حدّ
 *  المطابقة: ذاك يُدخل التخمينَ كلَّه ليصحّح اسماً واحداً. */
const AREA_CITY: [string, string][] = [
  ['البعلي جاسم', 'الرمادي'],
  ['ريف الجزيرة', 'الرمادي'],
  ['غصن الزيتون', 'حصيبة الشرقية'],
  ['جويبة', 'حصيبة الشرقية'],
  ['مها البادية', 'الرمادي'],
  ['البعبود', 'الرمادي'],
];

// الأطولُ أوّلاً في الجدولين: «عامرية الفلوجة» تحوي «الفلوجة»، ولولا الترتيبُ
// لَنُسبت محطةُ العامريّة إلى الفلوجة.
const AREAS_BY_LENGTH = [...AREA_CITY].sort((a, b) => b[0].length - a[0].length);

function cityInText(raw: string): string | null {
  const t = normalizeName(raw);
  // الناحيةُ الرسميّةُ أوّلاً — «الخالدية قرب مركز الخالدية» تقول ناحيتَها
  // بنفسها. ثمّ المعالمُ لمن لا يقولها.
  return (
    CITIES_BY_LENGTH.find((c) => t.includes(normalizeName(c))) ??
    AREAS_BY_LENGTH.find(([a]) => t.includes(normalizeName(a)))?.[1] ??
    null
  );
}

export const MATCH_FLOOR = 55;

export function matchLine(raw: string, platform: PlatformStation[]): ScheduleLine {
  const [top] = searchKnownFuel(ALIASES.get(normalizeName(raw)) ?? raw, 1);
  // **دون الحدّ لا مرشَّح.**
  //
  // قِيس على أسماء القناة نفسِها: الصحيحُ يقع بين ٧٥ و١٠٠، و«البو يشة» تُطابق
  // «البوذياب — الكورنيش» بـ٢٧٫٥. وسُلَّمُ searchKnownFuel يفسّر الرقمين:
  // مئةٌ تطابقٌ تامّ، وسبعونَ فما فوق احتواءُ الاسم للاسم، وما دونه نسبةُ
  // الكلمات المشتركة من خمسٍ وخمسين — فخمسةٌ وخمسون تعني «كلُّ كلماتِه وردت»
  // ونصفُها يعني كلمةً من كلمتين. ودونها تخمينٌ يُلبَس ثوبَ المعرفة: اسمٌ
  // يُستبدل بغيره ومدينةٌ تُنسب بلا سند.
  //
  // فما دون الحدّ يبقى كما وصل، بلا مدينة، ويُعلَّم ❓ ليكتبها إنسان. وتُحفظ
  // الدرجةُ المرفوضة في match_score كي يُقاس لاحقاً أين يُخطئ المطابق.
  const hit = top && top.score >= MATCH_FLOOR ? top : null;
  const key = normalizeName(raw);

  const byName = () => platform.find((s) => normalizeName(s.name) === key) ?? null;

  if (!hit) {
    const direct = byName();
    return {
      raw,
      name: direct?.name ?? raw,
      // ولو لم يُطابَق اسمٌ، فقد تكون الناحيةُ مكتوبةً في السطر نفسِه.
      city: cityInText(raw),
      stationId: direct?.id ?? null,
      score: direct ? 100 : (top?.score ?? 0),
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
    city: c || cityInText(raw),
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
