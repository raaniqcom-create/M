// الكتابُ الرسميّ: «موقف طلبيات المحطات الحكومية والأهلية في محافظة … ليوم …».
//
// ── لماذا وحدةٌ ثانيةٌ بجوار lib/schedule.ts ──────────────────────────────
//
// تلك تقرأ منشورَ قناة: كلامٌ حرٌّ، سطرٌ لكلّ محطة، ومنتجٌ واحدٌ للمنشور كلِّه.
// وهذا **جدولٌ**: أعمدةٌ ثابتة، ومحطةٌ واحدةٌ قد يصلها أربعةُ منتجات، وتاريخٌ
// **منصوصٌ في العنوان** لا يُرجَّح بساعة الوصول.
//
// وخلطُهما في محلّلٍ واحدٍ كان سيُفسد الاثنين: `parseSchedule` تقصّ الأسطرَ
// وتُسقط الكلماتِ الزائدة، وهذا الجدولُ كلُّه كلماتٌ في مواضعَ لها معنى.
//
// ── وتُخرج ScheduleLine، وهي الصيغةُ القائمة ─────────────────────────────
//
// فكلُّ ما بعدها لا يتغيّر حرفاً: المعاينةُ، ومحرّرُ الأسطر بشاشاته الثلاث،
// و`publishSchedule`، و`linkBack`، و`buildBoard`، و`ScheduleBoard`. وهذا هو
// الاقتصادُ كلُّه: بابٌ ثانٍ يصبّ في المجرى نفسِه.
//
// ── والتاريخُ من الوثيقة ─────────────────────────────────────────────────
//
// ليلةَ ٢٠٢٦-٠٩-٠٨ اختلط جدولان في تاريخٍ واحد لأنّ التاريخَ كان يُرجَّح بساعة
// اللصق. والكتابُ يقول يومَه بنصّه — فيُقرأ ولا يُخمَّن. وإن لم يُقرأ **لم
// يُخترع**: تُعرض المعاينةُ بلا تاريخٍ وزرُّ 📅 يضبطه.
import { CITY_NAMES } from './cities.ts';
import {
  cityInText,
  lineProduct,
  matchLine,
  readProduct,
  type PlatformStation,
  type ScheduleLine,
} from './schedule.ts';
import { normalizeName } from './nearbyFuel.ts';
import type { FuelProduct } from '../types/database.ts';

/** أرقامٌ عربيّةٌ مشرقيّة ← لاتينيّة. ولا محوّلَ في المستودع: `lib/num.ts`
 *  منسّقٌ لاتينيٌّ لعدّادات الزوّار، صريحٌ في ذلك. */
export function toLatinDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => {
    const c = d.charCodeAt(0);
    return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
  });
}

const pad = (n: string) => n.padStart(2, '0');

/** «ليوم (٢٠٢٦/٩/٩)» ← "2026-09-09"، وتقبل الصيغتين.
 *
 *  والوثائقُ الرسميّةُ تكتبها سنةً أوّلاً، لكنّ من ينسخها بيده قد يقلبها.
 *  فالسنةُ تُعرف بأربع خاناتها لا بموضعها — ولا تخمينَ بين اليوم والشهر:
 *  ما زاد على اثني عشر يوم. */
export function tableDate(text: string): string | null {
  const t = toLatinDigits(text);
  const m = t.match(/(\d{1,4})\s*[/\-]\s*(\d{1,2})\s*[/\-]\s*(\d{1,4})/);
  if (!m) return null;
  const [, a, b, c] = m;
  if (a.length === 4) return `${a}-${pad(b)}-${pad(c)}`;
  if (c.length === 4) return `${c}-${pad(b)}-${pad(a)}`;
  return null;
}

/** «يجهز من مصفى الصمود ( اهلي )» ← "مصفى الصمود (اهلي)". */
export function tableSource(text: string): string | null {
  const m = text.match(/يجهز\s+من\s+([^\n\r]{2,80})/);
  if (!m) return null;
  return m[1].replace(/\s*\(\s*/g, ' (').replace(/\s*\)\s*/g, ') ').replace(/\s+/g, ' ').trim();
}

// ── أعمدةُ الطلبيّة، بترتيبها في الوثيقة ────────────────────────────────
//
// **و«زيت الغاز» يُحسب كازاً — بقرار صاحب المنصّة.**
//
// وهما ليسا شيئاً واحداً: «زيت الغاز» وقودُ محرّكاتٍ (الديزل)، و«الكاز» وقودُ
// تدفئة. وعُرض البديلُ — عمودٌ ثامنٌ في التعداد — فاختار الجمع. وسببُه أنّ
// `fuel_product` في القاعدة الحيّة لا تحمل ديزلاً (قِيس: `diesel` و`gas_oil`
// كلاهما 22P02)، وإضافتُه هجرةٌ تمسّ كلَّ سطح.
//
// فيُفصلان يومَ يُضاف. ومن قرأ هذا بعد سنةٍ فليعلم أنّه اختيارٌ لا سهو.
export const TABLE_COLUMNS: { header: string[]; product: FuelProduct }[] = [
  { header: ['عادي'], product: 'gasoline_regular' },
  { header: ['محسن'], product: 'gasoline_premium' },
  { header: ['نفط ابيض', 'نفط أبيض'], product: 'white_oil' },
  { header: ['زيت الغاز'], product: 'kerosene' },
];

/** خانةٌ فارغة: شرطةٌ بأيّ شكلٍ رُسمت، أو فراغ.
 *
 *  والكمّيّاتُ لا تُقرأ أصلاً — «واحدة» و«اثنان» و«اثنان/واحدة اعادة» كلُّها
 *  «فيها طلبيّة». قرارُ صاحب المنصّة ألّا تُحفظ الكمّيّات. */
const EMPTY_CELL = /^[\s\-–—_ـ.·،]*$/;
export const hasOrder = (cell: string): boolean => !!cell && !EMPTY_CELL.test(cell);

/** يُقسَم الصفُّ إلى خانات — والفاصلُ يُكتشف ولا يُفترض.
 *
 *  لُصق الكتابُ من Word أو Excel جاء مجدولاً؛ ومن رسالةٍ نصّيّةٍ قد يأتي
 *  بمسافاتٍ أو بـ`|`. فتُجرَّب الثلاثةُ بهذا الترتيب: الجدولةُ أقطعُها دلالةً،
 *  ثمّ العارضة، ثمّ مسافتان فأكثر (والواحدةُ لا تصلح: أسماءُ المحطات فيها
 *  مسافات).
 *
 *  ponytail: ثلاثُ محاولات؛ تُثبَّت على واحدةٍ يومَ تُعرف صيغةُ اللصق يقيناً. */
export function splitCells(line: string): string[] {
  const trim = (a: string[]) => a.map((s) => s.trim());
  if (line.includes('\t')) return trim(line.split('\t'));
  if (line.includes('|')) {
    const parts = trim(line.split('|'));
    while (parts.length && parts[0] === '') parts.shift();
    while (parts.length && parts[parts.length - 1] === '') parts.pop();
    return parts;
  }
  return trim(line.split(/ {2,}/)).filter((s, i, a) => s !== '' || (i > 0 && i < a.length - 1));
}

/** المدينةُ من «القضاء – الناحية – القاطع».
 *
 *  والأخصُّ يُقدَّم: «الفلوجة/الصقلاوية» تُقرأ **الصقلاوية**، و«الخالدية/حصيبة
 *  الشرقية» تُقرأ **حصيبة الشرقية** — وكلتاهما مدينةٌ في القائمة، ومن اختارها
 *  يريد خبرَها هي.
 *
 *  فإن لم يُعرف الأخصُّ فالقضاء: «الفلوجة/الحولي الشمالي» ← الفلوجة،
 *  و«الرمادي/شارع ٦٠» ← الرمادي. */
const OFFICIAL_CITY: [string, string][] = [
  // الاسمُ الرسميُّ للقضاء، والمنصّةُ تعرفه بغيره.
  ['عامرية الصمود', 'عامرية الفلوجة'],
  // والاتّجاهُ انعكس يومَ صارت «عنة» اسمَ المنصّة: الكتبُ الرسميّةُ تكتب
  // «عانة»، وهي التي تحتاج ترجمة الآن.
  ['عانة', 'عنة'],
  ['العنة', 'عنة'],
];
const OFFICIAL_MAP = new Map(OFFICIAL_CITY.map(([k, v]) => [normalizeName(k), v]));

export function cityFromDistrict(cell: string): string | null {
  const parts = cell
    .split(/[/–—\-–—]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  // **ومطابقةٌ تامّةٌ لا احتواء.** وُضعت هذه الأزواجُ أوّلاً في `AREA_CITY`
  // بـ`lib/schedule.ts` — وتلك تُطابق بالاحتواء على نصٍّ حرّ، و«عنة» تُطبَّع
  // إلى «عنه»، وهي كلمةٌ عربيّةٌ تَرِد في كلّ منشور. فكان كلُّ «عنه» مدينةً.
  // فبقيت هنا، حيث الخانةُ خانةُ قضاءٍ لا كلامٌ حرّ.
  const known = (s: string) => {
    const k = normalizeName(s);
    return CITY_NAMES.find((c) => normalizeName(c) === k) ?? OFFICIAL_MAP.get(k) ?? null;
  };

  for (let i = parts.length - 1; i >= 0; i--) {
    const hit = known(parts[i]);
    if (hit) return hit;
  }
  // ولا مطابقةَ حرفيّة: تُجرَّب الأسماءُ الرسميّةُ المخالفة عبر cityInText،
  // وهي التي تحمل أزواجَ AREA_CITY (عامرية الصمود ← عامرية الفلوجة).
  for (const p of parts) {
    const hit = cityInText(p);
    if (hit) return hit;
  }
  return cityInText(cell);
}

/** دورُ العمود، كما تقوله ترويسةُ الجدول نفسُها.
 *
 *  ── ولماذا تُقرأ الترويسةُ ولا تُفترض المواضع ────────────────────────────
 *
 *  وصل الكتابُ أوّلاً بثمانية أعمدة: ت · المحافظة · القضاء · الاسم · ثمّ عمودٌ
 *  لكلّ منتجٍ فيه عددُ الحمولات. ثمّ وصل بثلاثة: الاسم · المدينة والعنوان ·
 *  نوعُ الوقود — وفيه المنتجُ **اسمٌ في خانة** لا عمودٌ قائم.
 *
 *  وشكلان في يومين يعنيان ثالثاً في الشهر القادم. فلا تُعدّ المواضعُ: تُقرأ
 *  أسماءُ الأعمدة، وهي مكتوبةٌ في الوثيقة لهذا الغرض بعينه. */
type Role =
  | { kind: 'name' }
  | { kind: 'city' }
  | { kind: 'productName' }
  | { kind: 'productCol'; product: FuelProduct }
  | { kind: 'skip' };

/** تطبيعُ الترويسة — خفيفٌ لا يحذف كلمة.
 *
 *  **ولا تصلح `normalizeName` هنا.** تلك مصنوعةٌ لأسماء المحطات، فتُسقط
 *  «محطة» و«تعبئة» و«وقود» ضجيجاً — وهي بعينها كلماتُ الترويسة. فتصير
 *  «اسم المحطة» ← «اسم ال»، و«الوقود» ← «ال»، و«ال» تُطابق كلَّ عمودٍ فيه
 *  ألفٌ ولام. مقيسٌ: كلُّ عمودٍ صار عمودَ منتج، ولم تُعرف ترويسةٌ قطّ.
 *
 *  فهذه توحّد الحروفَ وتُسقط الحركاتِ والتطويلَ، ولا تحذف كلمة. */
function headKey(t: string): string {
  return t
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^؀-ۿ\w ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NAME_WORDS = ['اسم المحطه', 'المحطه'].map(headKey);
const CITY_WORDS = ['المدينه', 'العنوان', 'القضاء', 'الناحيه', 'القاطع', 'المنطقه'].map(headKey);
const PRODUCT_NAME_WORDS = ['نوع الوقود', 'الوقود', 'المنتج'].map(headKey);

function roleOf(header: string): Role {
  const h = headKey(header);
  if (!h) return { kind: 'skip' };
  // المنتجُ المسمّى قبل المدينة: «نوع الوقود» فيه «الوقود» ولا يخصّ العنوان.
  if (PRODUCT_NAME_WORDS.some((w) => h.includes(w))) return { kind: 'productName' };
  for (const col of TABLE_COLUMNS) {
    if (col.header.some((w) => h === headKey(w))) {
      return { kind: 'productCol', product: col.product };
    }
  }
  if (NAME_WORDS.some((w) => h.includes(w))) return { kind: 'name' };
  if (CITY_WORDS.some((w) => h.includes(w))) return { kind: 'city' };
  return { kind: 'skip' };
}

/** صفُّ الفصل في جداول ماركداون: `|---|---|---|`. */
const isRule = (cells: string[]) => cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.trim()));

interface Header {
  roles: Role[];
  /** موضعُ الصفّ في النصّ، فما بعده بياناتٌ وما قبله عنوان. */
  at: number;
}

/** يبحث عن صفّ الترويسة: فيه عمودُ اسمٍ، ومعه مدينةٌ أو منتجٌ على الأقلّ. */
function findHeader(lines: string[]): Header | null {
  for (let i = 0; i < lines.length; i++) {
    const cells = splitCells(lines[i]);
    if (cells.length < 2 || isRule(cells)) continue;
    const roles = cells.map(roleOf);
    const hasName = roles.some((r) => r.kind === 'name');
    const hasRest = roles.some(
      (r) => r.kind === 'city' || r.kind === 'productName' || r.kind === 'productCol'
    );
    if (hasName && hasRest) return { roles, at: i };
  }
  return null;
}

/** أهذا جدولٌ يُقرأ؟
 *
 *  والمحكُّ هو القراءةُ نفسُها لا كلماتٌ في العنوان: ترويسةٌ تُفهم، وصفّا
 *  بياناتٍ بعدها على الأقلّ. فلا يُدّعى ما لا يُقرأ، ولا يُردّ ما يُقرأ لأنّ
 *  عنوانَه صيغ بغير ما نتوقّع. */
export function looksLikeOfficialTable(text: string): boolean {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const h = findHeader(lines);
  if (!h) return false;
  let data = 0;
  for (let i = h.at + 1; i < lines.length; i++) {
    const cells = splitCells(lines[i]);
    if (isRule(cells) || cells.length < 2) continue;
    data++;
  }
  return data >= 2;
}

export interface OfficialTable {
  /** "2026-09-09" — من العنوان. و`null` تعني «لم يُقرأ»، ولا يُخمَّن. */
  forDate: string | null;
  /** «مصفى الصمود (اهلي)» — يُحفظ في `note` ولا يُعرض. */
  source: string | null;
  lines: ScheduleLine[];
  /** صفوفٌ لم تُفهم — تُقال للمشغّل ولا تُبتلع. */
  skipped: string[];
}

/** يقرأ الجدولَ ويُخرج سطراً لكلّ منتجٍ مطلوبٍ في كلّ محطة.
 *
 *  عمودُ «نوع الوقود» يُخرج سطراً واحداً؛ وأعمدةُ المنتجات تُخرج سطراً لكلّ
 *  خانةٍ ليست شرطة. والمصبُّ يعرف سطراً لمنتجٍ واحد، فهذه هي الترجمة. */
export function readOfficialTable(text: string, platform: PlatformStation[]): OfficialTable {
  const forDate = tableDate(text);
  const source = tableSource(text);
  const lines: ScheduleLine[] = [];
  const skipped: string[] = [];

  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const header = findHeader(rows);
  if (!header) return { forDate, source, lines, skipped };

  for (let i = header.at + 1; i < rows.length; i++) {
    const line = rows[i];
    const cells = splitCells(line);
    if (isRule(cells)) continue;
    // ذيلُ الوثيقة: مجموعٌ وملاحظةٌ وتوقيع — ليست صفوفَ بيانات.
    if (cells.length < 2) continue;

    let name = '';
    let city: string | null = null;
    const wanted: FuelProduct[] = [];

    header.roles.forEach((role, c) => {
      const cell = (cells[c] ?? '').trim();
      if (!cell) return;
      if (role.kind === 'name') name = cell;
      else if (role.kind === 'city') city = cityFromDistrict(cell);
      else if (role.kind === 'productName') {
        const p = lineProduct(cell) ?? readProduct(cell);
        if (p) wanted.push(p);
      } else if (role.kind === 'productCol' && hasOrder(cell)) {
        wanted.push(role.product);
      }
    });

    if (!name || normalizeName(name).length < 2) {
      // صفُّ مجموعٍ أو ملاحظةٍ يُترك بلا ضجيج؛ وما عداه يُقال.
      const n = normalizeName(line);
      const noise = ['المجموع', 'ملاحظة', 'يجهز من', 'موقف طلبيات'].some((w) =>
        n.includes(normalizeName(w))
      );
      if (!noise) skipped.push(line);
      continue;
    }
    // محطةٌ بلا منتجٍ مطلوبٍ ليست خطأً: الوثيقةُ تذكر محطاتٍ لم يُقرَّر لها شيء.
    if (!wanted.length) continue;

    for (const product of wanted) {
      const m = matchLine(name, platform, product);
      lines.push({ ...m, city: city ?? m.city });
    }
  }

  return { forDate, source, lines, skipped };
}
