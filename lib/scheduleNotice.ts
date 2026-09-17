/** اعتذارُ الجدول — جملةٌ واحدةٌ تُكتب مرّةً، ويقرأ كلُّ إنسانٍ فيها اسمَ مدينته.
 *
 *  ── لماذا لا نكتب سبعاً وعشرين رسالة ────────────────────────────────────
 *
 *  «يظهر لكل شخص حسب مدينته — نعتذر إلى متابعين المحطة التقنية في حديثة»
 *  — صاحبُ المنصّة. وجدولٌ لم يصل لم يصل أحداً، فالخبرُ واحدٌ والاسمُ وحدَه
 *  يتبدّل. فتُخزَّن الجملةُ مرّةً بعلامة `{المدينة}`، ويضعها الجهازُ عند العرض
 *  من اختيار صاحبه. ولو خُزّنت سبعاً وعشرين نسخةً لاختلفت إحداها بعد شهر.
 *
 *  ── ولا جدولَ جديدٌ في القاعدة ───────────────────────────────────────────
 *
 *  `announcements` تحمل `cities[]` و`expires_at` و`kind` نصّاً حرّاً بلا قيد
 *  (20260915b_announcement_kind.sql:12) — فالاعتذارُ صفٌّ فيها بـ`kind` جديد،
 *  و`station_name: null` كي لا يدخل اللوحةَ الحمراء (open_announcements تشترط
 *  اسمَ محطة). لا ترحيلَ ولا عمودَ ولا جدول.
 *
 *  وهذا الملفُّ خالصٌ بلا شبكة كي يُختبر: `scripts/test-schedule-notice.mjs`. */

/** قيمةُ `announcements.kind` — تُميّزه عن `tomorrow` (حلقةٌ كهرمانيّة) وعن
 *  `schedule` (سلسلةُ الصباح). والشريطُ الدائريُّ يرشّح `tomorrow` وحدَه، فلا
 *  يظهر الاعتذارُ هناك — وهو ما طُلب: صفحةُ الجدول وحدَها. */
export const NOTICE_KIND = 'apology';

/** العلامةُ التي تُستبدل باسم مدينة القارئ. عربيّةٌ لأنّ من يكتب النصّ عربيّ،
 *  ولا يُطلب منه تذكّرُ `{city}`. */
export const CITY_TOKEN = '{المدينة}';

/** الصياغةُ التي طلبها صاحبُ المنصّة حرفاً — تُعرض في اللوحة جاهزةً للتعديل. */
export const DEFAULT_NOTICE =
  `نعتذر إلى متابعي المحطة التقنية في ${CITY_TOKEN} — لم يصلنا إلى الآن جدولُ ` +
  'التوزيع للمحطات غداً. ننتظر وصوله وسنبلغكم فور وصوله.';

/** المحافظةُ حين لا مدينةَ بعينها: زائرٌ لم يختر، أو من يتابع المحافظةَ كلَّها. */
export const ALL_CITIES_WORD = 'الأنبار';

/** فوق اثنتين تصير الجملةُ عدّاً لا خبراً، فتُقال المحافظةُ باسمها. */
const NAME_LIMIT = 2;

export interface ScheduleNoticeRow {
  id: string;
  body: string;
  /** المدنُ المستهدَفة — `null` أو فارغةٌ تعني المحافظةَ كلَّها. */
  cities: string[] | null;
  expires_at: string | null;
}

/** عربيّةٌ لا فاصلةٌ إنجليزيّة: «حديثة والرمادي» — والواوُ تلتصق بما بعدها،
 *  فـ`join(' و')` تكتبها صحيحةً بلا حالةٍ خاصّة. */
const andList = (names: string[]): string => names.join(' و');

/** أيُّ مدنِ القارئ يشملها هذا الاعتذار. مستهدَفٌ فارغٌ = المحافظةُ كلُّها. */
export function matchedCities(
  targeted: string[] | null | undefined,
  mine: string[] | null | undefined
): string[] {
  const readers = mine ?? [];
  if (!targeted?.length) return readers;
  return readers.filter((c) => targeted.includes(c));
}

/** هل يُعرض هذا الاعتذارُ لهذا القارئ؟
 *
 *  ومن لم يختر مدينةً يرى كلَّ شيء — وهو الافتراضُ المفتوحُ نفسُه في
 *  `forCities` (lib/announcements.ts:51): خبرٌ لم يصل أسوأُ من خبرٍ زائد. */
export function noticeApplies(
  targeted: string[] | null | undefined,
  mine: string[] | null | undefined
): boolean {
  if (!targeted?.length) return true;
  if (!mine?.length) return true;
  return matchedCities(targeted, mine).length > 0;
}

/** الاسمُ الذي يحلّ محلَّ العلامة عند هذا القارئ. */
export function cityPhrase(
  targeted: string[] | null | undefined,
  mine: string[] | null | undefined
): string {
  const hit = matchedCities(targeted, mine);
  if (!hit.length) {
    // مستهدَفةٌ واحدةٌ وقارئٌ لم يختر: الاسمُ معروفٌ رغم ذلك، فيُقال.
    if (targeted?.length === 1) return targeted[0];
    return ALL_CITIES_WORD;
  }
  if (hit.length > NAME_LIMIT) return ALL_CITIES_WORD;
  return andList(hit);
}

/** النصُّ كما يقرؤه صاحبُ هذا الجهاز. */
export function renderNotice(
  body: string,
  targeted: string[] | null | undefined,
  mine: string[] | null | undefined
): string {
  return body.split(CITY_TOKEN).join(cityPhrase(targeted, mine));
}

/** نصُّ الإشعار الذاهبِ إلى الهواتف — يُكتب مرّةً للجمهور كلِّه لا لكلّ قارئ.
 *
 *  ولا يُرسل نداءٌ لكلّ مدينة: `alerts_for` تُطابق المشتركَ بلا مدينةٍ
 *  (`city is null`) مع **كلّ** مدينة، فسبعةٌ وعشرون نداءً = سبعةٌ وعشرون
 *  إشعاراً في جيبه. والنداءُ الواحدُ بكلّ المدن يحذف المكرّر بنفسه
 *  (announce/index.ts:184) — فيُكتب الاسمُ للجمهور لا للفرد. */
export function pushBody(body: string, targeted: string[] | null | undefined): string {
  const word = targeted?.length === 1 ? targeted[0] : ALL_CITIES_WORD;
  return body.split(CITY_TOKEN).join(word);
}

/** آخرُ اعتذارٍ يخصُّ هذا القارئ وما زال حيّاً.
 *
 *  والانتهاءُ يُفحص هنا أيضاً وإن فحصته السياسةُ في القاعدة: صفحةٌ تُركت
 *  مفتوحةً ساعاتٍ تبقى تعرض ما انقضى. (نفسُ حارس NewsTicker.tsx:65.) */
export function liveNotice(
  rows: ScheduleNoticeRow[],
  mine: string[] | null | undefined,
  now: number = Date.now()
): ScheduleNoticeRow | null {
  for (const r of rows) {
    if (r.expires_at && new Date(r.expires_at).getTime() <= now) continue;
    if (!noticeApplies(r.cities, mine)) continue;
    return r;
  }
  return null;
}
