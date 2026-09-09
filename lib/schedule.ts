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
  /** وقودُ هذا السطر — قد يخالف وقودَ بقيّة المنشور. */
  product: FuelProduct;
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
  /** تُشترط عند المطابقة بالاسم حين تُعرف مدينةُ السطر — ومن لم يمرّرها فقد
   *  اكتفى بالتساوي التامّ والجغرافيا، وهو ما كان قبل هذا. */
  city?: string | null;
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
// الأطولُ أوّلاً: «بانزين محسن» تحوي «بانزين»، فلو فُحص القصيرُ أوّلاً لَغلب.
const PRODUCTS_BY_LENGTH = (Object.entries(PRODUCT_LABELS) as [FuelProduct, string][]).sort(
  (a, b) => b[1].length - a[1].length
);

export function readProduct(text: string): FuelProduct | null {
  const t = normalizeName(text);
  for (const [key, label] of PRODUCTS_BY_LENGTH) {
    if (t.includes(normalizeName(label))) return key;
  }
  return null;
}

/** بلا أداةِ تعريف: القناةُ تكتب «البنزين العادي» والوسمُ «بانزين عادي». */
function bareWord(w: string): string {
  const n = normalizeName(w);
  return n.startsWith('ال') ? n.slice(2) : n;
}

/** وقودُ سطرٍ بعينه — إن سمّاه.
 *
 *  ── ولماذا لا يكفي وقودُ العنوان ────────────────────────────────────────
 *
 *  لأنّ صاحبَ المنصّة قد يلصق المنشورين معاً في رسالةٍ واحدة، وهذا ما وقع:
 *  عنوانٌ يقول «البنزين العادي» ثمّ سبعةُ أسماء، ثمّ سطرٌ ثامنٌ آخرُه «تجهيز
 *  بنزين محسن». فقُرئ الثامنُ عاديّاً — وهو محسّن — وبقيت كلمةُ «محسن» في
 *  اسمه لأنّ المُسقَط كان كلماتِ «عادي» لا كلماتِه. خبرٌ خطأ واسمٌ مشوَّه في
 *  عطلٍ واحد.
 *
 *  ── وبمطابقةِ كلمةٍ لا باحتواءِ نصّ ─────────────────────────────────────
 *
 *  «كاز» و«غاز» ثلاثةُ أحرف، ولو فُحص الاحتواءُ لَصار كلُّ اسمٍ فيه هذه
 *  الحروفُ إعلانَ كاز. فالكلمةُ تُطابَق كلمةً، بعد إسقاط أداة التعريف. */
export function lineProduct(line: string): FuelProduct | null {
  const words = new Set(
    normalizeName(line).split(' ').filter(Boolean).map((w) => (w.startsWith('ال') ? w.slice(2) : w))
  );
  for (const [key, label] of PRODUCTS_BY_LENGTH) {
    const parts = normalizeName(label).split(' ').filter(Boolean).map(bareWord);
    if (parts.length && parts.every((x) => words.has(x))) return key;
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
export interface ParsedRow {
  name: string;
  product: FuelProduct;
}

export function parseSchedule(
  text: string
): { product: FuelProduct; rows: ParsedRow[] } | null {
  const product = readProduct(text);
  if (!product) return null;

  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!rows.length) return null;

  const label = normalizeName(PRODUCT_LABELS[product]);
  const wordsOf = (pr: FuelProduct) =>
    new Set(normalizeName(PRODUCT_LABELS[pr]).split(' ').filter(Boolean).map(bareWord));

  /** يُسقط الصدرَ واسمَ الوقود — **ويُبقي الحروفَ كما كُتبت.**
   *
   *  كان يُطبّع ثمّ يردّ المطبَّع، فيخرج «الخالديه» و«الحبانيه» بالهاء إلى
   *  الناس. والتطبيعُ مفتاحُ مطابقةٍ لا نصٌّ يُعرض: يُقارَن به ويُرمى، ويبقى
   *  المعروضُ ما كتبته القناة.
   *
   *  والفلترةُ بالكلمات لا بتعبيرٍ نمطيّ: «ال ال» متجاورتان لا يلتقطهما
   *  تعبيرٌ يشترط فراغاً قبل وبعد — يبتلع الأوّلُ الفراغَ فتنجو الثانية.
   *  و«ال» بقيّةُ «البنزين» بعد إسقاط «بنزين» من داخلها: أداةٌ يتيمة. */
  const strip = (s: string, pr: FuelProduct) => {
    const drop = wordsOf(pr);
    return s
      .replace(PREAMBLE, ' ')
      .split(/\s+/)
      .filter((w) => {
        const n = normalizeName(w);
        return n && n !== 'ال' && !drop.has(bareWord(w));
      })
      .join(' ')
      .trim();
  };

  const marker = normalizeName('المحطات التاليه');

  // منشورٌ من سطرٍ واحد: هو نفسُه المحطة، والوقودُ في آخره — إلّا أن يَعِد
  // بقائمةٍ لم تصل، فذاك عنوانٌ بلا جسم ولا يُنشر منه شيء.
  if (rows.length === 1) {
    if (normalizeName(rows[0]).includes(marker)) return null;
    const one = strip(rows[0], product);
    return one ? { product, rows: [{ name: one, product }] } : null;
  }

  // **العنوانُ يُعرَف بما فيه لا بما يبقى منه** — وبأيِّ وقودٍ ذكره لا بوقودٍ
  // بعينه. كان الفحصُ على وقودِ المنشور وحدَه، فمنشوران مُلصقان لكلٍّ عنوانُه
  // يُقرأ ثانيهما محطةً، أو تُنسب محطاتُه إلى وقود الأوّل.
  //
  // وسطرٌ لا يبقى منه — بعد إسقاط الصدر واسمِ وقودِه — إلا حرفان: عنوانٌ لا
  // محطة. وهو فحصٌ لا يخصّ وقوداً بعينه، فيصحّ لكلّ عنوان.
  const isHead = (line: string, pr: FuelProduct) =>
    normalizeName(line).includes(marker) || strip(line, pr).length < 2;

  // **والوقودُ يجري مع العناوين.** كلُّ عنوانٍ يسمّي وقوداً يضبط ما تحته حتى
  // العنوان التالي — كما تُقرأ الورقةُ بالعين. ولولا هذا لَورثت محطاتُ العنوان
  // الثاني وقودَ الأوّل، وهو خبرٌ خطأ عن وقودٍ يقطع الناسُ إليه الطريق.
  let current = product;
  const out: ParsedRow[] = [];
  for (const line of rows) {
    const named = lineProduct(line);
    if (isHead(line, named ?? current)) {
      if (named) current = named;
      continue;
    }
    // وقودُ السطر إن سمّاه، وإلّا فوقودُ عنوانه. والإسقاطُ بكلماتِ وقودِه هو.
    const pr = named ?? current;
    const name = strip(line, pr);
    if (name.length >= 2) out.push({ name, product: pr });
  }
  return out.length ? { product, rows: out } : null;
}

/** يطابق اسماً واحداً: مرشَّحٌ مسحيٌّ يعطي المدينة، ثمّ محطةٌ مسجّلةٌ إن وُجدت.
 *
 *  **الجغرافيا أوّلاً، والاسمُ احتياطاً** — وهو حكمُ `onPlatform` القائم في
 *  نموذج التسجيل، وحدُّ الخمسمئة متر مقيسٌ هناك لا مخمَّن: أبعدُ تطابقٍ صحيحٍ
 *  كان ٤٢٤ متراً وأقربُ خاطئٍ ٥٨٠. */
/** كلماتُ اللهجة في أسماء المحطات ↤ فصيحُها.
 *
 *  القناةُ تكتب كما يتكلّم الناس: «الحبانية القديمة **يم** سيطرة الخالدية».
 *  و«يم» عراقيّةٌ بمعنى «عند»، تُقرأ في الجدول المنشور فتبدو خطأً مطبعيّاً.
 *  فتُبدَّل كلمةً بكلمة — لا داخل الكلمات — ويبقى ما عداها كما وصل.
 *
 *  وهي أوّلُ ما يُصحَّح من اللهجة، ويطول الجدولُ كلَّما وقعت كلمةٌ أخرى. */
const DIALECT: Record<string, string> = {
  'يم': 'عند',
};

function fixDialect(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => DIALECT[w] ?? w)
    .join(' ');
}

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
// **و«عنة» تُستثنى — والسلوكُ لا يتغيّر بذلك.**
//
// قِيس: `normalizeName('عنة')` = «عنه»، وهي كلمةٌ عربيّةٌ يوميّة. جُرّبت ستُّ
// عيّناتٍ فانقلبت أربعٌ من `null` إلى «عنة»: «لم يُعلن عنها بعد» و«نعتذر عنه»
// و«يوزع عنه غدا» و«لم يصدر بيان عنه». وهذا عطلٌ **شُحن مرّةً من قبل** —
// مكتوبٌ في `lib/officialTable.ts:133`: «فكان كلُّ عنه مدينةً».
//
// والاسمُ الرسميُّ «عانة» يبقى في `AREA_CITY` أدناه، فيُطابَق كما كان اليومَ
// حرفاً بحرف: المطابقُ يقرأ الأربعةَ ولا يقرأ الثلاثة — وهو ما كان يفعله قبل
// التسمية تماماً. فلا قدرةَ فُقدت، وإنّما مُنعت كلمةٌ من أن تصير مدينة.
//
// ولا يُحلّ بحدود الكلمات: `` في جافاسكربت لا تقع بين حرفين عربيّين
// (`lib/nearbyFuel.ts:84`).
const CITIES_BY_LENGTH = [...CITY_NAMES]
  .filter((c) => c !== 'عنة')
  .sort((a, b) => b.length - a.length);

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
  // والاسمُ الرسميُّ للناحية — كتبُ الوزارة تكتبه هكذا. أربعةُ أحرفٍ لا ثلاثة،
  // فلا يبتلع كلمةً. وموضعُه هنا يُبقي القراءةَ كما كانت قبل التسمية.
  ['عانة', 'عنة'],
];

// الأطولُ أوّلاً في الجدولين: «عامرية الفلوجة» تحوي «الفلوجة»، ولولا الترتيبُ
// لَنُسبت محطةُ العامريّة إلى الفلوجة.
const AREAS_BY_LENGTH = [...AREA_CITY].sort((a, b) => b[0].length - a[0].length);

export function cityInText(raw: string): string | null {
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

export function matchLine(
  raw: string,
  platform: PlatformStation[],
  product: FuelProduct = 'gasoline_regular'
): ScheduleLine {
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

  /** محطةُ المنصّة التي يسمّيها هذا السطر — بالتساوي أوّلاً، ثمّ بالاحتواء.
   *
   *  ── وما كان ينقص ────────────────────────────────────────────────────
   *
   *  كانت المطابقةُ بالاسم تجري على `ROAD_STATIONS` وحدَها — وهي مولَّدةٌ من
   *  خرائطَ مفتوحة — ولا تلمس أسماءَ المنصّة إلّا **بتساوٍ حرفيٍّ تامّ**.
   *  فمحطةٌ مسجّلةٌ باسمٍ يعرفه صاحبُها لا تُربط ما لم يكتب المنشورُ اسمَها
   *  حرفاً بحرف، وهو ما لا تفعله القناةُ أبداً: تكتب «المسرة قرب كراج بغداد»
   *  و«التل الاخضر (البوذياب)- الرمادي».
   *
   *  قِيس على جدول ٢٠٢٦-٠٩-١٠: ثلاثةٌ من أحدَ عشرَ سطراً كانت «خارج المنصّة»
   *  وهي مسجّلةٌ فيها.
   *
   *  ── والقاعدةُ: كلماتُ الاسم كلُّها في السطر ──────────────────────────
   *
   *  ككلماتٍ لا كنصّ: «الراشديه» لا تُطابق «الراشد» وإن احتوت حروفَها.
   *  واسمٌ من كلمةٍ واحدةٍ قصيرة يُرفض — «الحق» ترد في كلّ كلام.
   *  والمدينةُ تُشترط حين تُعرف: «الفتح المبين الطلاسة - الكرمة» لا تُربط
   *  بمحطةٍ اسمُها كذلك في الفلوجة، وهو فخُّ «رماح الأنبار» بعينه.
   *  والالتباسُ لا يُحسم بالتخمين: مرشَّحان فأكثر يعني لا ربط.
   *
   *  قِيس على اثنين وثلاثين صفّاً منشوراً: ستّةٌ تُربط، وصفرُ التباس، وصفرُ
   *  مخالفةٍ لربطٍ قائم. */
  const lineWords = new Set(key.split(' ').filter(Boolean));
  const lineCity = cityInText(raw);
  const byName = () => {
    const exact = platform.find((s) => normalizeName(s.name) === key);
    if (exact) return exact;
    const held = platform.filter((s) => {
      const nw = normalizeName(s.name).split(' ').filter(Boolean);
      if (!nw.length) return false;
      if (nw.length === 1 && nw[0].length < 5) return false;
      if (!nw.every((w) => lineWords.has(w))) return false;
      return !(lineCity && s.city && lineCity !== s.city);
    });
    return held.length === 1 ? held[0] : null;
  };

  if (!hit) {
    const direct = byName();
    return {
      raw,
      name: direct?.name ?? fixDialect(raw),
      // ولو لم يُطابَق اسمٌ، فقد تكون المنطقةُ مكتوبةً في السطر نفسِه.
      city: cityInText(raw),
      stationId: direct?.id ?? null,
      score: direct ? 100 : (top?.score ?? 0),
      product,
    };
  }

  const { la, lo, n, c } = hit.station;

  // ── والجغرافيا تقترح، والاسمُ يؤكّد ────────────────────────────────────
  //
  // كان الالتقاطُ بالمسافة وحدَها: أقربُ محطةِ منصّةٍ ضمن خمسمئة متر. وهو
  // صحيحٌ حيث تتباعد المحطات، وخاطئٌ حيث تتجاور.
  //
  // ووقع: الكتابُ الرسميُّ ذكر «محطة رماح الأنبار المشيدة»، فطابقها المطابقُ
  // بـ«محطة تعبئة وقود رماح الأنبار» بدرجة **٨٢** — وهو الصواب. ثمّ استبدلها
  // الالتقاطُ بـ«محطة الحق»، وهما جارتان على شارع ٦٠ بجانب جسر الطاش.
  // و«رماح الأنبار» ليست مسجّلةً في المنصّة أصلاً، فالربطُ كان سيكتب
  // «متوقَّع» في لوحة صاحب محطةٍ أخرى ويُعلن عنها وقوداً لم يُقرَّر لها.
  //
  // فالمسافةُ ترشّح، والاسمُ يحكم: يُشترط أن يشترك المرشَّحُ والمطابَقُ في
  // كلمةٍ مميّزةٍ واحدةٍ على الأقلّ — بعد إسقاط الضجيج (محطة · تعبئة · وقود).
  // «ساسكو» تُطابق «محطة ساسكو»، و«رماح الأنبار» لا تُطابق «الحق».
  const distinct = (t: string) =>
    new Set(normalizeName(t).split(' ').map(bareWord).filter((w) => w.length > 1));
  const hitWords = distinct(n);
  const sharesWord = (name: string) => {
    for (const w of distinct(name)) if (hitWords.has(w)) return true;
    return false;
  };

  const near =
    platform.find(
      (s) =>
        s.lat != null &&
        s.lng != null &&
        metresBetween({ lat: la, lng: lo }, { lat: s.lat, lng: s.lng }) <= 500 &&
        sharesWord(s.name)
    ) ?? byName();

  return {
    raw,
    name: near?.name ?? fixDialect(n),
    city: c || cityInText(raw),
    stationId: near?.id ?? null,
    score: hit.score,
    product,
  };
}

/** سطرٌ يكتبه صاحبُ المنصّة بيده: «محطة وادي حجلان - حديثة - محسن».
 *
 *  ── ولماذا لا يكفي مُحلِّلُ القناة ───────────────────────────────────────
 *
 *  لأنّ القناةَ تكتب اسماً مجرَّداً في سطر، وعنوانُ الوقود فوقه. وصاحبُ المنصّة
 *  يأتيه الخبرُ بالهاتف فيكتبه كما يُملى عليه: الاسمُ والمنطقةُ والوقود في
 *  سطرٍ واحد. فلو مرّ بمُحلِّل القناة لَصار كلُّه اسمَ محطة.
 *
 *  ── والفواصلُ لا تُشترط ─────────────────────────────────────────────────
 *
 *  «-» و«،» و«|» تُقسّم إن وُجدت. وإن لم توجد فُحص السطرُ كلُّه: الوقودُ
 *  بكلمةٍ مطابِقة (`lineProduct`)، والمنطقةُ باسمٍ معروف (`cityInText`) — وهما
 *  الأداتان اللتان تقرآن منشورَ القناة نفسَه، فلا قائمتان تفترقان.
 *
 *  وما لم يُعرَف يبقى فارغاً ولا يُخمَّن: الأزرارُ في البوت تسأل عنه. */
export interface ManualLine {
  name: string;
  city: string | null;
  product: FuelProduct | null;
}

export function readManualLine(raw: string): ManualLine | null {
  const parts = raw
    .split(/[-،|]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!parts.length) return null;

  // **الجزءُ الأوّلُ اسمٌ دائماً.** هكذا يُملى الخبرُ على الهاتف: الاسمُ ثمّ
  // المنطقةُ ثمّ الوقود. ولولا هذه القاعدة لَابتُلع «محطة الخالدية» منطقةً —
  // فاسمُها بعد التطبيع هو اسمُ ناحيتها.
  if (parts.length > 1) {
    const extra: string[] = [];
    let product: FuelProduct | null = null;
    let city: string | null = null;

    for (const part of parts.slice(1)) {
      if (!product) {
        const p = lineProduct(part);
        if (p) {
          product = p;
          continue;
        }
      }
      if (!city) {
        const c = cityInText(part);
        if (c) {
          city = c;
          continue;
        }
      }
      extra.push(part);
    }

    const name = [parts[0], ...extra].join(' ').trim();
    return name ? { name, city, product } : null;
  }

  // ── وسطرٌ بلا فواصل ─────────────────────────────────────────────────────
  //
  // «محطة وادي حجلان حديثة محسن» — يُقرأ الوقودُ والمنطقةُ من السطر كلِّه، ثمّ
  // تُنزع كلماتُهما من الاسم. ولو تُركت لَصار اسمُ المحطة يحمل ناحيتَها ووقودَها.
  const product = lineProduct(raw);
  const city = cityInText(raw);
  const drop = new Set<string>();
  if (product) for (const w of normalizeName(PRODUCT_LABELS[product]).split(' ')) if (w) drop.add(w);
  if (city) for (const w of normalizeName(city).split(' ')) if (w) drop.add(w);

  const bare = (w: string) => {
    const n = normalizeName(w);
    return n.startsWith('ال') ? n.slice(2) : n;
  };
  const name = raw
    .split(/\s+/)
    .filter((w) => {
      const n = normalizeName(w);
      // «محطة» و«تعبئة» يُطبَّعان إلى فراغ — وهما من الاسم لا من الضجيج هنا،
      // فيبقيان. والمحذوفُ ما طابق وقوداً أو منطقةً وحدَه.
      return n !== 'ال' && !drop.has(n) && !drop.has(bare(w));
    })
    .join(' ')
    .trim();

  return name ? { name, city, product } : { name: raw.trim(), city, product };
}

/** المنشورُ كاملاً: قراءةٌ ثمّ مطابقةُ كلّ سطر. */
export function readSchedule(text: string, platform: PlatformStation[]): ParsedSchedule | null {
  const parsed = parseSchedule(text);
  if (!parsed) return null;
  return {
    product: parsed.product,
    lines: parsed.rows.map((r) => matchLine(r.name, platform, r.product)),
  };
}
