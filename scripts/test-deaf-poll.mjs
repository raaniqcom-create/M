// كبحُ الجلب على جهازٍ سقطت قناتُه الحيّة: أيعمل وقتَ العطل، أم وقتَ الصحّة وحدَه؟
//
// ── الحكاية ───────────────────────────────────────────────────────────────
//
// حين تسقط قناةُ Realtime تصير الصفحةُ عمياء: لا شيءَ يُحدّثها. فوُضع جلبٌ
// احتياطيٌّ في فرع `CHANNEL_ERROR`، وكُبح كي لا يصير قصفاً.
//
// وكُتب الكبحُ أوّلاً على **آخر نجاح**:
//
//     const last = okAt.current ? Date.parse(okAt.current) : 0;
//     if (Date.now() - last >= DEAF_POLL_MS) refresh();
//
// و`okAt` لا تُكتب إلا في فرع النجاح. فما دامت القاعدةُ حيّةً يعمل الكبح؛
// **ويومَ تسقط لا نجاحَ يقع**، فتبقى `okAt` على حالها، فيمرّ الشرطُ في كلّ
// حدث. وأحداثُ CHANNEL_ERROR تتوالى مع تراجعِ إعادة الاشتراك — عشرُ ثوانٍ
// سقفاً، أي ستٌّ في الدقيقة، × أربعةِ استعلامات = أربعةٌ وعشرون طلباً في
// الدقيقة من الجهاز الواحد. **وقتَ العطل بالذات.**
//
// وهي حلقةٌ موجبة، لا إهدارٌ فحسب: القاعدةُ تبطئ ← تسقط القنوات ← تقصف
// الأجهزةُ ← تبطئ أكثر. وقياسُ ٢٠٢٦-٠٩-٠٨: ٩٢٪ من نداءات Realtime تفشل.
//
// فالكبحُ بآخر **محاولة**. وهذا الملفّ يقيس الفرقَ بالأرقام لا بالوصف.
import assert from 'node:assert/strict';

const DEAF_POLL_MS = 120_000;
const BACKOFF_MS = 10_000; // سقفُ تراجعِ إعادة الاشتراك في supabase-js
const MINUTES = 10;
const QUERIES_PER_REFRESH = 4; // `refresh` أربعةُ استعلاماتٍ ثقيلة

/** يُحاكي جهازاً واحداً طوال `MINUTES` دقيقةً وقناتُه ساقطة.
 *
 *  `healthy` تعني: هل تنجح الجلبةُ؟ فإن سقطت القاعدةُ لم تنجح، ولم تُكتب
 *  ساعةُ النجاح — وهنا يفترق الكبحان. */
function simulate({ gateOn, healthy }) {
  let now = 0;
  let okAt = 0; // آخرُ نجاح
  let triedAt = 0; // آخرُ محاولة
  let fetches = 0;

  const refresh = () => {
    fetches++;
    triedAt = now; // تُختم دائماً
    if (healthy) okAt = now; // ولا تُختم هذه إلا بنجاح
  };

  // حدثُ CHANNEL_ERROR كلَّ عشر ثوانٍ — سقفُ التراجع.
  for (now = 0; now <= MINUTES * 60_000; now += BACKOFF_MS) {
    const last = gateOn === 'success' ? okAt : triedAt;
    if (now - last >= DEAF_POLL_MS) refresh();
  }
  return fetches;
}

let n = 0;
const ok = (cond, what) => { assert.ok(cond, what); n++; };

// ── ١ · والقاعدةُ حيّة: الكبحان سواء ─────────────────────────────────────
{
  const bySuccess = simulate({ gateOn: 'success', healthy: true });
  const byAttempt = simulate({ gateOn: 'attempt', healthy: true });
  ok(bySuccess === byAttempt, 'وقتَ الصحّة لا يفترق الكبحان — فالإصلاحُ لا يغيّر السلوكَ السويّ');
  ok(byAttempt <= MINUTES / 2 + 1, `جلبةٌ كلَّ دقيقتين على الأكثر (وقعت ${byAttempt} في ${MINUTES} دقائق)`);
}

// ── ٢ · والقاعدةُ ساقطة: هنا العطب ───────────────────────────────────────
{
  const bySuccess = simulate({ gateOn: 'success', healthy: false });
  const byAttempt = simulate({ gateOn: 'attempt', healthy: false });

  const events = MINUTES * (60_000 / BACKOFF_MS) + 1; // ٦١ حدثاً في عشر دقائق

  // الكبحُ بالنجاح ينهار بعد أوّل دقيقتين: `okAt` تبقى صفراً، فهي نقطةُ
  // إسنادٍ ثابتةٌ في الماضي — تصمت أوّلَ ١٢٠ ثانيةً ثمّ يمرّ كلُّ حدثٍ بعدها.
  const silent = DEAF_POLL_MS / BACKOFF_MS; // ١٢ حدثاً قبل أن يفتح الباب
  ok(bySuccess === events - silent, `الكبحُ بالنجاح ينهار وقتَ العطل: ${bySuccess} جلبة من ${events} حدثاً`);

  // والكبحُ بالمحاولة يتقدّم مع الزمن، فيبقى واحدةً لكلّ دقيقتين.
  ok(byAttempt === MINUTES / 2, `والكبحُ بالمحاولة يصمد: ${byAttempt} جلبة`);
  ok(bySuccess >= byAttempt * 9, `والفرقُ ليس هامشيّاً: ${bySuccess} مقابل ${byAttempt}`);

  // وبالطلبات، وهو ما تراه القاعدةُ فعلاً.
  const perMin = (f) => (f * QUERIES_PER_REFRESH) / MINUTES;
  ok(perMin(bySuccess) === 19.6, `الجهازُ الواحد كان يرمي ${perMin(bySuccess)} طلباً في الدقيقة`);
  ok(perMin(byAttempt) === 2, `وصار ${perMin(byAttempt)} — والقاعدةُ الساقطةُ تُترك لتقوم`);

  // **والمستقرُّ أسوأُ من المتوسّط.** الصمتُ أوّلَ دقيقتين يخفض المتوسّط، وأمّا
  // بعده فحدثٌ كلَّ عشر ثوانٍ = جلبةٌ كلَّ عشر ثوانٍ. وانقطاعُ اليوم دام
  // أطولَ من دقيقتين بكثير.
  const steady = (60_000 / BACKOFF_MS) * QUERIES_PER_REFRESH;
  ok(steady === 24, `والمستقرُّ في انقطاعٍ طويل: ${steady} طلباً في الدقيقة من الجهاز الواحد`);
}

// ── ٣ · والعودةُ إلى التبويب: الحارسُ نفسُه ──────────────────────────────
//
// وهنا الانهيارُ تامٌّ لا جزئيّ، لأنّ الحارسَ مكتوبٌ هكذا:
//
//     if (okAt.current && Date.now() - Date.parse(okAt.current) < FLOOR) return;
//
// فـ`okAt.current` **فارغةٌ** ما لم تنجح جلبةٌ قطّ — و`null &&` يُسقط الشرطَ
// كلَّه، فلا يعود، فيجلب. أي أنّ من فتح التطبيقَ أوّلَ مرّةٍ والقاعدةُ ساقطةٌ
// يجلب في **كلّ** عودةٍ إلى التبويب. ومن ينتظر عودةَ الخدمة يقلّب التطبيقاتِ
// ويعود، وهو أكثرُ ما يفعله الناسُ وقتَ العطل.
{
  const REVISIT_FLOOR_MS = 60_000;
  const visits = [0, 5_000, 12_000, 30_000, 61_000, 65_000, 130_000];

  // النصُّ القديم مُحاكًى حرفاً — والجلبةُ تفشل، فلا تُكتب `okAt` أبداً.
  let okAt = null;
  let bySuccess = 0;
  for (const now of visits) {
    if (okAt && now - okAt < REVISIT_FLOOR_MS) continue;
    bySuccess++;
    // okAt = now  ← هذا ما كان سيقع لو نجحت، ولا ينجح شيءٌ في العطل.
  }
  ok(bySuccess === visits.length, `بالنجاح: كلُّ عودةٍ تجلب — ${bySuccess} من ${visits.length}`);

  // والنصُّ الجديد: أرضيّةُ دقيقةٍ تعمل نجحت الجلبةُ أم سقطت.
  let triedAt = 0, byAttempt = 0;
  for (const now of visits) {
    if (now - triedAt < REVISIT_FLOOR_MS && byAttempt > 0) continue;
    byAttempt++;
    triedAt = now;
  }
  ok(byAttempt === 3, `وبالمحاولة: ${byAttempt} عند 0 و61 و130 ثانية`);
  ok(bySuccess > byAttempt, 'والفرقُ يقع حيث يقف الناسُ ينتظرون');
}

console.log(`✔ ${n} تحقّقاً — والكبحُ يعمل حيث كان ينهار.`);
