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
import { cityInText, matchLine, type PlatformStation, type ScheduleLine } from './schedule.ts';
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

const TABLE_HINTS = ['موقف طلبيات', 'الطلبية', 'القضاء'];
const COL_WORDS = ['عادي', 'محسن', 'نفط ابيض', 'زيت الغاز', 'المحافظة', 'اسم المحطة'];

/** أهذا كتابٌ رسميٌّ أم كلامٌ آخر؟
 *
 *  قرينتان معاً، كما تشترط `looksLikeSchedule` صياغةً واسمَ وقود. وواحدةٌ
 *  وحدَها تُخطئ: «المحافظة» تَرِد في كلامٍ كثير، و«عادي» كلمةٌ دارجة. */
export function looksLikeOfficialTable(text: string): boolean {
  const t = normalizeName(text);
  const hinted = TABLE_HINTS.some((h) => t.includes(normalizeName(h)));
  const cols = COL_WORDS.filter((c) => t.includes(normalizeName(c))).length;
  return hinted && cols >= 2;
}

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
  ['عنة', 'عانة'],
  ['العنة', 'عانة'],
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

export interface OfficialTable {
  /** "2026-09-09" — من العنوان. و`null` تعني «لم يُقرأ»، ولا يُخمَّن. */
  forDate: string | null;
  /** «مصفى الصمود (اهلي)» — يُحفظ في `note` ولا يُعرض. */
  source: string | null;
  lines: ScheduleLine[];
  /** صفوفٌ لم تُفهم — تُقال للمشغّل ولا تُبتلع. */
  skipped: string[];
}

/** يقرأ الكتابَ ويُخرج سطراً لكلّ خانةٍ فيها طلبيّة.
 *
 *  صفٌّ واحدٌ في الوثيقة قد يُخرج أربعةَ أسطر — والمصبُّ يعرف سطراً لمنتجٍ
 *  واحد، فهذه هي الترجمة. */
export function readOfficialTable(text: string, platform: PlatformStation[]): OfficialTable {
  const forDate = tableDate(text);
  const source = tableSource(text);
  const lines: ScheduleLine[] = [];
  const skipped: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const n = normalizeName(line);

    // الترويسةُ والعنوانُ والمجموعُ والملاحظة — كلُّها ليست صفوفَ بيانات.
    if (
      n.includes(normalizeName('اسم المحطة')) ||
      n.includes(normalizeName('المجموع')) ||
      n.includes(normalizeName('ملاحظة')) ||
      n.includes(normalizeName('موقف طلبيات')) ||
      n.includes(normalizeName('يجهز من'))
    ) {
      continue;
    }

    const cells = splitCells(line);
    // أربعةُ أعمدةِ طلبيّةٍ في الذيل، وقبلها المحطةُ والقضاء على الأقلّ.
    if (cells.length < 4 + 2) {
      skipped.push(line);
      continue;
    }

    const orders = cells.slice(-TABLE_COLUMNS.length);
    const head = cells.slice(0, -TABLE_COLUMNS.length);
    // اسمُ المحطة آخرُ ما قبل الأعمدة، والقضاءُ قبله.
    const name = head[head.length - 1] ?? '';
    const district = head[head.length - 2] ?? '';
    if (!name || normalizeName(name).length < 2) {
      skipped.push(line);
      continue;
    }

    const city = cityFromDistrict(district);
    let any = false;
    orders.forEach((cell, i) => {
      if (!hasOrder(cell)) return;
      any = true;
      const product = TABLE_COLUMNS[i].product;
      const m = matchLine(name, platform, product);
      lines.push({ ...m, city: city ?? m.city });
    });
    // صفٌّ بلا طلبيّةٍ واحدة ليس خطأً — الكتابُ يذكر محطاتٍ لم يُقرَّر لها شيء.
    if (!any) continue;
  }

  return { forDate, source, lines, skipped };
}
