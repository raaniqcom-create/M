import { isOffered } from './products.ts';
import { hasRunOut } from './hours.ts';
import { normalizeName } from './nearbyFuel.ts';
import type { ExpectedPeriod } from './hours.ts';
import type { FuelProduct, StationWithStatus } from '../types/database.ts';

/** بناءُ لوحة الجدول — حسابٌ خالصٌ بلا شبكة.
 *
 *  منفصلٌ عن `lib/scheduleData.ts` للسبب الذي فصل `lib/schedule.ts` عنه:
 *  ذاك يستورد `supabase` فلا يعمل إلا في المتصفّح، وهذا يُفحص بـnode بلا
 *  قاعدةٍ ولا مفاتيح — و`scripts/test-schedule-board.mjs` يفحصه فعلاً. */

export interface ScheduleRow {
  id: string;
  for_date: string;
  product: FuelProduct;
  batch_id: string;
  raw_name: string;
  station_name: string;
  city: string | null;
  linked_station_id: string | null;
  note: string | null;
}

/** «اليوم» و«غداً» بتقويم بغداد لا بساعة الجهاز.
 *
 *  هاتفٌ مضبوطٌ على توقيتٍ آخر كان سيقرأ جدولَ الغد جدولَ بعد غد. و`en-CA`
 *  هي الصيغةُ الوحيدة التي تُخرج YYYY-MM-DD جاهزةً للمقارنة النصّية. */
export function baghdadDate(plusDays = 0): string {
  return new Date(Date.now() + plusDays * 86_400_000).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Baghdad',
  });
}

function baghdadHour(): number {
  return Number(
    new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Baghdad',
      hour: '2-digit',
      hour12: false,
    })
  );
}

/** اليومُ الذي تعرضه الصفحة.
 *
 *  ── سؤالُ صاحب المنصّة: من يفتحها ظهراً كيف يقرؤها؟ ────────────────────
 *
 *  كانت الصفحةُ تقول «محطات غداً» دائماً، فمن يفتحها ظهراً يقرأ عنواناً عن
 *  يومٍ لم يأتِ بينما الوقودُ يصل الآن.
 *
 *  فقاعدةٌ واحدة: **بعد التاسعة مساءً الغد، وما دونها اليوم** — وهي ساعةُ
 *  نشر القناة تقريباً. وينقلب العنوانُ عند منتصف الليل وحدَه: التاريخُ نفسُه
 *  يصير «اليوم» بلا أن يتبدّل محتوى. قرارُ صاحب المنصّة. */
export const BOARD_FLIP_HOUR = 21;

export function boardDate(): string {
  return baghdadHour() >= BOARD_FLIP_HOUR ? baghdadDate(1) : baghdadDate();
}

/** واليومُ الذي يُعرض فعلاً — بعد أن يُنظر في المنشور لا قبله.
 *
 *  ── ليلةَ ٢٠٢٦-٠٩-٠٨ ────────────────────────────────────────────────────
 *
 *  نُشر جدولٌ من ثلاثٍ وأربعين محطةً الساعةَ ٢١:١٢ ببغداد، على تاريخ **اليوم**
 *  — وهو اختيارٌ مقصود: في البوت زرُّ 📅 يقلب التاريخ، والمنشورُ قد يكون عن
 *  نهارٍ لم ينتهِ. واللوحةُ كانت قد انقلبت إلى **الغد** الساعةَ ٢١:٠٠ تماماً.
 *  فاثنتا عشرةَ دقيقةً فرّقت بين جدولٍ منشورٍ ولوحةٍ فارغة، والناسُ يقرؤون
 *  «لا جدولَ بعد» وفي القاعدة ثلاثةٌ وأربعون صفّاً عمرُها دقائق.
 *
 *  والانقلابُ نفسُه صحيح: من يفتح الصفحةَ ليلاً يسأل عن الغد، وتلك ساعةُ نشر
 *  القناة تقريباً. **لكنّه ترجيحٌ لا يقين** — ومن رجّح إلى يومٍ لا شيءَ فيه
 *  وتركَ يوماً مملوءاً فقد رجّح ضدّ قارئه.
 *
 *  فالقاعدةُ: يُقدَّم يومُ الانقلاب ما دام فيه صفّ؛ فإن خلا ووُجد جدولُ اليوم
 *  عُرض. ولا اختراعَ ليومٍ ثالث: `fetchSchedule` تجلب اليومَ والغدَ معاً، فلا
 *  نداءَ زائد — والحكمُ يقع على ما في اليد. */
export function resolveBoardDay(schedule: { for_date: string }[]): string {
  const want = boardDate();
  if (schedule.some((r) => r.for_date === want)) return want;
  const today = baghdadDate();
  if (today !== want && schedule.some((r) => r.for_date === today)) return today;
  return want;
}

/** سطرٌ في اللوحة — أيّاً كان مصدرُه. */
export interface BoardRow {
  key: string;
  name: string;
  city: string | null;
  product: FuelProduct;
  stationId: string | null;
  /** من الجدول المنشور، أم من لوحة المحطة نفسِها. */
  source: 'channel' | 'station';
  /** `expected` وُعد به · `arrived` معروضٌ الآن · `out` نفد بعد أن وصل. */
  state: 'expected' | 'arrived' | 'out';
  /** الصباح/العصر/المساء — من لوحة المحطة وحدها. */
  period: ExpectedPeriod | null;
  /** وردت في الجدول المنشور أيضاً — تأكيدٌ مضاعفٌ لا تكرار. */
  alsoInChannel?: boolean;
}

/** أهما محطةٌ واحدة؟
 *
 *  **الاحتواءُ لا التطابق.** القناةُ تكتب «غصن الزيتون جويبة» والمنصّةُ تسجّلها
 *  «محطة تعبئة وقود غصن الزيتون» — والتطبيعُ يُسقط «محطة» و«تعبئة» و«وقود»
 *  فيبقى «غصن الزيتون» داخلَ الأولى لا مساوياً لها. فتطابقٌ حرفيٌّ كان
 *  سيُظهر محطةً واحدةً مرّتين، وهي حالةٌ حيّةٌ في القاعدة يومَ كُتب هذا.
 *
 *  **وبالكلمات لا بالحروف.** الاحتواءُ الحرفيُّ يجعل «الحق» داخلَ
 *  «الحقلانية» — محطتان مختلفتان في محافظةٍ واحدة. فكلماتُ الأقصر يجب أن
 *  ترد كلُّها كلماتٍ كاملةً في الأطول.
 *
 *  والمنطقةُ شرط، والاسمُ ذو الكلمة الواحدة لا يُدمج إلا بتطابقٍ تامّ:
 *  كلمةٌ واحدةٌ مشتركةٌ دليلٌ ضعيفٌ على أنّهما محطةٌ واحدة. */
function sameStation(
  a: { name: string; city: string | null },
  b: { name: string; city: string | null }
): boolean {
  if (normalizeName(a.city ?? '') !== normalizeName(b.city ?? '')) return false;
  const x = normalizeName(a.name);
  const y = normalizeName(b.name);
  if (!x || !y) return false;
  if (x === y) return true;

  const wx = x.split(' ').filter(Boolean);
  const wy = y.split(' ').filter(Boolean);
  const [short, long] = wx.length <= wy.length ? [wx, wy] : [wy, wx];
  if (short.length < 2) return false;
  const set = new Set(long);
  return short.every((w) => set.has(w));
}

/** يبني لوحةَ يومٍ واحدٍ من مصدرين.
 *
 *  ── ولماذا مصدران ───────────────────────────────────────────────────────
 *
 *  الجدولُ كان يقرأ ما يُنشر من تلغرام وحدَه. وبعضُ المحطات تعلن في لوحتها
 *  أنّ منتجاً متوقَّعٌ غداً — وهو وعدٌ مكتوبٌ في القاعدة منذ زمن
 *  (`station_products.expected_at`) لا يقرؤه الجدول. فصار يقرؤه.
 *
 *  ── ومحطاتُ المنصّة أوّلاً ───────────────────────────────────────────────
 *
 *  لأنّ لها صفحةً وصاحباً يُحدّثها ورقماً يُتّصل به — والوعدُ فيها يتحوّل خبراً
 *  حيّاً بضغطة: إن فعّل صاحبُها المنتجَ صار السطرُ «وصل»، وإن نفد بقي مكتوباً
 *  عليه «نفد» ولم يُمحَ. فمن قرأ الجدولَ صباحاً يعرف لماذا اختفت، ولا يظنّ
 *  المنصّةَ كذبت.
 *
 *  ── والتكرارُ يُدمج، ولوحةُ المحطة تغلب ─────────────────────────────────
 *
 *  «غصن الزيتون» وردت في جدول القناة غيرَ مربوطة، وهي نفسُها أعلنت توقّعاً من
 *  لوحتها. فالسطرُ واحدٌ باسمها الرسميّ وحالتِها الحيّة — لأنّها أدقّ، قرارُ
 *  صاحب المنصّة — ويُقال إنّ الخبرَ ورد في الجدول المنشور أيضاً.
 *
 *  والوعدُ يُقيَّد بيوم اللوحة وحدَه: في القاعدة وعودٌ من آب لم تُنظَّف،
 *  و`isListed` تُبقيها إلى الأبد. */
export function buildBoard(
  schedule: ScheduleRow[],
  stations: StationWithStatus[],
  day: string
): BoardRow[] {
  const rows: BoardRow[] = [];

  // ــ المصدرُ الأوّل: لوحاتُ المحطات ــــــــــــــــــــــــــــــــــــــ
  for (const st of stations) {
    for (const p of st.products) {
      if (p.expected_at !== day) continue;
      const arrived = isOffered(st, p);
      // **«نفد» تُقال بدليلٍ واحدٍ صريح: موعدُ نفادٍ أعلنه صاحبُها ومضى.**
      //
      // ولا تُستنتج من الإطفاء: صفٌّ مطفأٌ بلا موعدِ نفادٍ لا يُميَّز عن وعدٍ
      // لم يصل بعد — كلاهما `is_available = false` و`runs_out_at = null`.
      // و`updated_at` لا يُميّزهما أيضاً: «تأكيد ونشر التوفّر» يكتبه على صفوف
      // المحطة كلِّها، فمحطةٌ أكّدت منتجاً آخرَ صباحاً كانت ستُقرأ «نفد» وهي لم
      // تستلم شيئاً. فالوعدُ الذي لم يصل يبقى «متوقّع» — وهو الصدق.
      const out = p.is_available === true && hasRunOut(p.runs_out_at);
      rows.push({
        key: `s:${st.id}:${p.product}`,
        name: st.name,
        city: st.city,
        product: p.product,
        stationId: st.id,
        source: 'station',
        state: arrived ? 'arrived' : out ? 'out' : 'expected',
        period: p.expected_period,
      });
    }
  }

  // ــ المصدرُ الثاني: الجدولُ المنشور ــــــــــــــــــــــــــــــــــــ
  for (const r of schedule) {
    if (r.for_date !== day) continue;

    const me = { name: r.station_name, city: r.city };
    const hit = rows.find(
      (x) =>
        x.product === r.product &&
        ((r.linked_station_id && x.stationId === r.linked_station_id) || sameStation(x, me))
    );

    if (hit) {
      // لوحةُ المحطة تغلب — «لأنّها أدقّ»، قرارُ صاحب المنصّة. ويُقال إنّ
      // الخبرَ ورد في الجدول المنشور أيضاً: تأكيدٌ مضاعفٌ لا تكرار.
      if (hit.source === 'station') hit.alsoInChannel = true;
      continue;
    }

    // ── والمحطةُ تُقرأ لأنّها في الجدول، لا لأنّها وعدت ──────────────────
    //
    // **هنا كان العطل.** البحثُ أعلاه يجري في `rows`، وهي مبنيّةٌ خلف بوّابة
    // `expected_at !== day`. فمحطةٌ مسجَّلةٌ ورد اسمُها في الجدول ولم تُعلن
    // وعداً لذلك التاريخ **لا توجد في `rows` أصلاً** — فلا `linked_station_id`
    // يُستشار ولا اسمٌ يُطابَق، ويُدفع سطرُها «متوقّع» أبداً.
    //
    // ووقع مقيساً: «محطة ساسكو» مربوطةٌ بدرجة مئة، والمنصّةُ تعرف أنّ منتوجَها
    // نفد قبل ثماني ساعات (`runs_out_at` مضى) — واللوحةُ تقول «متوقّع». رابطٌ
    // تامٌّ يُرمى لأنّ صاحبَها لم يَعِد بذلك اليوم بعينه.
    //
    // فيُبحث في المحطات نفسِها لا في الصفوف المبنيّة. وحالتُها الحيّةُ أصدقُ
    // من الوعد المنشور على كلّ حال — وهو المبدأ المكتوب أعلاه.
    const st = stations.find(
      (s) =>
        (r.linked_station_id && s.id === r.linked_station_id) ||
        sameStation({ name: s.name, city: s.city }, me)
    );
    const live = st?.products.find((p) => p.product === r.product);

    if (st && live) {
      rows.push({
        key: `s:${st.id}:${live.product}`,
        name: st.name,
        city: st.city,
        product: live.product,
        stationId: st.id,
        source: 'station',
        state: isOffered(st, live)
          ? 'arrived'
          : live.is_available === true && hasRunOut(live.runs_out_at)
            ? 'out'
            : 'expected',
        // ولا فترةَ يومٍ آخر: `expected_period` تخصّ `expected_at`، وهذه محطةٌ
        // دخلت اللوحةَ بالجدول لا بوعدها — فقولُ «الصباح» عن يومٍ غيرِه كذب.
        period: live.expected_at === day ? live.expected_period : null,
        alsoInChannel: true,
      });
      continue;
    }

    rows.push({
      key: `c:${r.id}`,
      name: r.station_name,
      city: r.city,
      product: r.product,
      stationId: r.linked_station_id,
      source: 'channel',
      state: 'expected',
      period: null,
    });
  }

  return rows;
}

/** علامةُ مشغّلٍ على لوحة يومٍ بعينه.
 *
 *  ── ولماذا جدولٌ مستقلٌّ لا عمودٌ في `fuel_schedule` ─────────────────────
 *
 *  لأنّ السطرَ الظاهرَ للناس ليس دائماً سطرَ الجدول. `linkBack` في بوت تلغرام
 *  يكتب `expected_at` في `station_products` عند كلّ نشر، فتدخل المحطةُ اللوحةَ
 *  من المصدر الأوّل ويُبتلع سطرُ القناة فيها. فإخفاءُ صفّ `fuel_schedule` كان
 *  سيترك السطرَ معروضاً — وهو بعينه حالُ «غصن الزيتون».
 *
 *  فالعلامةُ تصف **ما يُعرض** لا ما نُشر، وتُطبَّق بعد الدمج.
 *
 *  والفارغُ يعني «أيّ»: مدينةٌ بلا محطةٍ تعني المدينةَ كلَّها، ومحطةٌ بلا منتجٍ
 *  تعني منتجاتِها كلَّها. فسطرٌ واحدٌ يعبّر عن الثلاثة بلا ثلاثِ آليّات. */
export interface BoardOverride {
  for_date: string;
  city: string | null;
  station_id: string | null;
  station_name: string | null;
  product: FuelProduct | null;
  /** `hide` يُسقط السطر · `out` يشطبه بعلامة «نفد». */
  action: 'hide' | 'out';
}

function marks(o: BoardOverride, r: BoardRow): boolean {
  if (o.product && o.product !== r.product) return false;
  if (o.station_id && o.station_id !== r.stationId) return false;
  if (o.station_name && !sameStation({ name: o.station_name, city: o.city }, r)) return false;
  // والمدينةُ تُفحص وحدَها فقط حين لا محطةَ في العلامة: `sameStation` تفحصها
  // أصلاً، وفحصُها مرّتين يُسقط علامةً صحيحةً كُتبت بمدينةٍ فارغة.
  if (!o.station_id && !o.station_name && o.city && o.city !== r.city) return false;
  // وعلامةٌ بلا شيءٍ إطلاقاً لا تُطبَّق: «أخفِ كلَّ شيء» يُكتب صراحةً لا سهواً.
  if (!o.product && !o.station_id && !o.station_name && !o.city) return false;
  return true;
}

/** يطبّق علاماتِ المشغّل على لوحةٍ مبنيّة — دالّةٌ خالصةٌ تُفحص بـnode.
 *
 *  و«نفد» اليدويّةُ تغلب المحسوبة: ما يقوله المشغّلُ عن سطرٍ نشره أدقُّ ما
 *  عنده. ولا تُرقّى «وصل» إلى «نفد» صدفةً — الغلبةُ صريحةٌ في الاتّجاهين. */
export function applyOverrides(rows: BoardRow[], overrides: BoardOverride[], day: string): BoardRow[] {
  const mine = overrides.filter((o) => o.for_date === day);
  if (!mine.length) return rows;

  const out: BoardRow[] = [];
  for (const r of rows) {
    const hit = mine.filter((o) => marks(o, r));
    if (hit.some((o) => o.action === 'hide')) continue;
    out.push(hit.some((o) => o.action === 'out') ? { ...r, state: 'out' } : r);
  }
  return out;
}

/** مجموعةٌ واحدة: **منطقةٌ في يوم**. */
export interface BoardGroup {
  city: string | null;
  rows: BoardRow[];
  products: FuelProduct[];
}

const STATE_RANK = { arrived: 0, expected: 1, out: 2 } as const;

/** يُجمَع بالمنطقة — لا بالمنتج.
 *
 *  السؤالُ الذي يُفتح له التطبيقُ منطقةٌ لا منتج: «ما الذي يصل منطقتي؟»
 *  والمنتجُ عمودٌ فيه. وقرارُ صاحب المنصّة: جدولٌ لكلّ منطقةٍ ولو بمحطةٍ واحدة.
 *
 *  و`prefer` مناطقُ القارئ: تُرفع ولا يُحجب غيرُها. */
export function groupBoard(rows: BoardRow[], prefer: string[] = []): BoardGroup[] {
  const mine = new Set(prefer);
  const map = new Map<string, BoardGroup>();

  for (const r of rows) {
    const key = r.city ?? '';
    const g = map.get(key) ?? { city: r.city ?? null, rows: [], products: [] };
    g.rows.push(r);
    map.set(key, g);
  }

  for (const g of map.values()) {
    // محطاتُ المنصّة أوّلاً — طلبُ صاحب المنصّة — ثمّ ما وصل قبل ما يُنتظر
    // قبل ما نفد، ثمّ بالاسم.
    g.rows.sort(
      (a, b) =>
        Number(b.source === 'station') - Number(a.source === 'station') ||
        STATE_RANK[a.state] - STATE_RANK[b.state] ||
        a.name.localeCompare(b.name, 'ar')
    );
    g.products = [...new Set(g.rows.map((r) => r.product))];
  }

  return [...map.values()].sort(
    (a, b) =>
      // منطقةٌ مجهولةٌ آخراً دائماً، ثمّ مناطقُ القارئ، ثمّ الأكبرُ خبراً.
      Number(a.city === null) - Number(b.city === null) ||
      Number(mine.has(b.city ?? '')) - Number(mine.has(a.city ?? '')) ||
      b.rows.length - a.rows.length ||
      (a.city ?? '').localeCompare(b.city ?? '', 'ar')
  );
}
