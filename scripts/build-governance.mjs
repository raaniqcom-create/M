// يبني وثيقةَ إدارة البيانات لفرع توزيع المنتجات النفطية — بأرقامٍ لحظتَها.
//
//   node scripts/build-governance.mjs
//   node scripts/print-pdf.mjs docs/anbar-oil/data-governance.html
//
// ── لماذا وثيقةٌ أصلاً ───────────────────────────────────────────────────
//
// طلبها الفرعُ رسميّاً مع حساب المتابعة. وهي ليست سياسةَ خصوصيّةٍ ثانية:
// `/privacy` تخاطب المستخدمَ وصاحبَ المحطة، وهذه تخاطب جهةً حكوميّةً تسأل
// «أين تذهب بياناتُ الناس، ومن يراها، ومتى تُمحى؟» — سؤالُ إشرافٍ لا سؤالُ
// استعمال.
//
// ── ولا رقمَ يُكتب بيد ───────────────────────────────────────────────────
//
// وهو الدرسُ المكتوب في `build-brief.mjs`: كتابٌ رسميّ يحمل رقماً قديماً
// أسوأُ من كتابٍ بلا أرقام. فيُقرأ كلُّ شيءٍ من القاعدة عند البناء، **ومع
// تصفيحٍ إلزاميّ**: سقفُ PostgREST يقصّ كلَّ ردٍّ عند ألف صفّ، وجدولُ alerts
// فيه اليومَ خمسةٌ وستّون ألفاً — فالعدُّ بلا تصفيحٍ يُنقص المشتركين ولا يشكو.
// وقد وقع فعلاً: قراءةٌ بلا تصفيحٍ أعطت ٦٬٢٨١ بدل ٩٬٦١٩ في مستندٍ سُلّم لمدير
// فرع.
//
// وللأعداد المجرّدة يُستعمل `Prefer: count=exact` مع `Range: 0-0`: العددُ
// يأتي في ترويسة `Content-Range` كاملاً غيرَ مقصوص، بلا جرِّ مئةٍ وستّةٍ
// وخمسين ألفَ صفٍّ عبر الشبكة لعدّها.

import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const H = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
};

/** كلُّ الصفوف — ألفاً ألفاً حتى تنقطع الصفحات. */
async function all(q) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${U}/rest/v1/${encodeURI(q)}`, {
      headers: { ...H, Range: `${from}-${from + 999}` },
    });
    const d = await r.json();
    if (!Array.isArray(d)) throw new Error(`${q} → ${JSON.stringify(d).slice(0, 200)}`);
    rows.push(...d);
    if (d.length < 1000) break;
  }
  return rows;
}

/** عددٌ مجرّدٌ من الترويسة — بلا جرِّ الصفوف. */
async function count(table, col = 'id', filter = '') {
  const r = await fetch(`${U}/rest/v1/${encodeURI(`${table}?select=${col}${filter}`)}`, {
    headers: { ...H, Range: '0-0', Prefer: 'count=exact' },
  });
  const cr = r.headers.get('content-range') ?? '';
  const n = Number(cr.split('/')[1]);
  if (!Number.isFinite(n)) throw new Error(`عدُّ ${table} فشل: «${cr}»`);
  return n;
}

const ar = (n) => Number(n).toLocaleString('en-US');
const esc = (v) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ══ القراءة ══════════════════════════════════════════════════════════════

const alerts = await all('alerts?select=address,city,station_id&order=address');
const devices = await all('device_tokens?select=platform&order=token');
const stations = await all('stations?select=status,city,is_demo&order=id');

const addr = new Set(alerts.map((a) => a.address));
const perCity = new Map();
for (const a of alerts) {
  if (a.station_id) continue; // متابعةُ محطةٍ بعينها، لا اشتراكُ ناحية
  const c = a.city ?? '(كل النواحي)';
  if (!perCity.has(c)) perCity.set(c, new Set());
  perCity.get(c).add(a.address);
}
const cities = [...perCity.entries()]
  .map(([city, s]) => ({ city, n: s.size }))
  .sort((a, b) => b.n - a.n);

const byPlatform = devices.reduce((m, d) => ((m[d.platform] = (m[d.platform] ?? 0) + 1), m), {});
const approved = stations.filter((s) => s.status === 'approved' && !s.is_demo).length;

const n = {
  subscribers: addr.size,
  alertRows: alerts.length,
  devices: devices.length,
  ios: byPlatform.ios ?? 0,
  android: byPlatform.android ?? 0,
  approved,
  pending: stations.filter((s) => s.status === 'pending').length,
  archived: await count('station_archive'),
  votes: await count('traffic_votes'),
  notifLog: await count('notification_log'),
  notifDaily: await count('notification_daily', 'day'),
  telegram: await count('telegram_users', 'telegram_id'),
  schedule: await count('fuel_schedule'),
};

const today = new Date().toLocaleDateString('ar-IQ', {
  timeZone: 'Asia/Baghdad',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

// ══ القالب — من الكتاب القائم، فلا ترويستان تفترقان ══════════════════════

const oldLetter = readFileSync(new URL('../docs/anbar-oil/letter-oil.html', import.meta.url), 'utf8');
const HEAD = oldLetter.match(/<header class="head">[\s\S]*?<\/header>/)[0];
if (HEAD.length < 200) throw new Error('ترويسةُ الكتاب لم تُستخرج — راجِع القالب');

const FOOT =
  '<footer class="foot"><span>المحطة التقنية — منصة وقود الأنبار</span><span class="ltr">muhta.online</span></footer>';
const sheet = (inner) => `<section class="sheet">${HEAD}<div class="body">${inner}</div>${FOOT}</section>`;

const TIGHT = `<style>
  .body p{margin:6px 0}
  table{margin:7px 0 10px;font-size:9.4pt}
  th,td{padding:4px 8px}
  h1{margin:9px 0 4px}
  h2{margin-top:11px}
  .box{margin:7px 0;padding:8px 11px}
  .two{column-count:2;column-gap:8mm}
  .two table{margin:0;break-inside:avoid}
  /* تسعٌ وعشرون ناحيةً في عمودين فاضت ٥٢ بكسلاً — قِيست بـprint-pdf لا
     خُمّنت. والحشوُ يُقلَّص، فالورقةُ الرابعة جدولٌ ولا نصَّ فيها يُختصر. */
  .two th,.two td{padding:2.4px 8px}
</style>`;

// ── ورقة ١: ما يُجمع ──
const collected = [
  ['عنوان الإشعار (رمز الجهاز أو عنوان دفع المتصفّح)',
   'إيصال خبر توفّر الوقود لمن طلبه',
   'مفتاح الخدمة وحده — لا يُعرض في أي واجهة',
   'حتى يُلغي صاحبه الإشعارات أو يحذف التطبيق'],
  ['النواحي والمنتجات المختارة',
   'ألّا يصل الخبر إلا لمن يعنيه',
   'مفتاح الخدمة وحده',
   'مع عنوان الإشعار نفسه'],
  ['اسم المحطة وعنوانها وهاتفها واسم المسؤول',
   'صفحة المحطة، والتواصل معها',
   'الاسم والعنوان والهاتف عامّة؛ واسم المسؤول للإدارة',
   'ما دامت المحطة قائمة'],
  ['تقييمات الازدحام',
   'اللون الذي يراه الناس على المحطة',
   'مجموعة فقط — بلا صاحب',
   'تُمسح آليّاً كل خمس دقائق'],
  ['سجلّ الإشعارات المرسلة',
   'معرفة ما وصل ومتى، ومنع التكرار',
   'الإدارة',
   'ثلاثون يوماً، ثمّ يُلخَّص عدداً ويُمحى'],
  ['معرّف محادثة تيليجرام',
   'الردّ على من راسل البوت',
   'مفتاح الخدمة وحده',
   'حتى يحظر صاحبه البوت'],
  ['جدول وصول الوقود غداً',
   'إعلان ما يصل قبل أن يصل',
   'عامّ',
   'يُعرض لليوم والغد؛ وما مضى محجوب'],
];

const p1 = `
  <h1>وثيقة إدارة البيانات</h1>
  <p class="subject">مقدَّمة إلى فرع شركة توزيع المنتجات النفطية — الأنبار · ${esc(today)}</p>

  <p>«المحطة التقنية» منصّة مجانية تعرض توفّر الوقود في محطات الأنبار. لا تبيع
  شيئاً، ولا تعرض إعلانات، ولا تطلب من المواطن حساباً ولا اسماً ولا رقم هاتف.
  وهذه الوثيقة تجيب — بالتفصيل وبالأرقام — عن أربعة أسئلة: ماذا يُجمع، وأين
  يُخزَّن، ومن يراه، ومتى يُمحى.</p>

  <div class="box"><p><b>المواطن لا يُسجَّل.</b> فتح التطبيق لا ينشئ حساباً ولا
  يُطلب فيه اسم ولا هاتف ولا بريد. وحده من يطلب <b>تنبيهاً</b> يُحفظ له عنوان
  إشعار — وهو رمز يصدره المتصفّح أو نظام الهاتف، لا يدلّ على شخص ولا يصلح
  للاتصال به.</p></div>

  <h2>ما يُجمع، ولماذا</h2>
  <table>
    <tr><th>البيان</th><th>لماذا</th><th>من يراه</th><th>كم يبقى</th></tr>
    ${collected.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}
  </table>

  <p>ولا يُجمع شيء غير ما في الجدول: لا موقع جغرافيّ يُخزَّن (يُستعمل في
  الجهاز لترتيب المحطات بالقرب ثمّ يُنسى)، ولا سجلّ تصفّح، ولا بيانات دفع —
  فلا مدفوعات في المنصّة أصلاً.</p>`;

// ── ورقة ٢: أين، ومن يرى، وكيف يُحذف ──
const p2 = `
  <h1>التخزين، والاطّلاع، والمحو</h1>

  <h2>أين تُخزَّن</h2>
  <p>قاعدة بيانات <b>PostgreSQL 17</b> على منصّة Supabase، في مركز بيانات
  <span class="ltr">ap-southeast-1</span> (سنغافورة). والاتصال بها مشفَّر
  (TLS)، والوصول إليها محكوم بسياسات على مستوى الصفّ داخل القاعدة نفسها — أي
  أنّ المنع في القاعدة لا في التطبيق، فلا يُلتَفّ عليه بتغيير واجهة.</p>
  <p>وأمّا التطبيق فصفحات ثابتة تُخدَم من <span class="ltr">GitHub Pages</span>،
  بلا خادم يعالج بيانات ولا سجلّ يحتفظ بها.</p>

  <h2>من يرى ماذا</h2>
  <table>
    <tr><th>الجهة</th><th>ما تراه</th></tr>
    <tr><td>عامّة الناس</td><td>المحطات وتوفّرها وألوان الازدحام وجدول الغد. ولا شيء عن الأشخاص.</td></tr>
    <tr><td>صاحب المحطة</td><td>محطته وحدها: منتجاتها وحالتها والشكاوى الواردة إليها.</td></tr>
    <tr><td>فرع التوزيع</td><td>لوحة متابعة وأعداد مجمَّعة — بلا هاتف ولا اسم صاحب محطة ولا عنوان إشعار.</td></tr>
    <tr><td>إدارة المنصّة</td><td>كلّ ما سبق، وبيانات التواصل مع أصحاب المحطات.</td></tr>
  </table>
  <p>والحجب على مستوى القاعدة لا الواجهة: عناوين الإشعارات وجداولها ممنوعة عن
  كلّ مفتاح عامّ، ولا تُقرأ إلا بمفتاح الخدمة داخل الخادم.</p>

  <h2>كيف يُمحى</h2>
  <ul>
    <li>المواطن يُلغي التنبيهات من داخل التطبيق فيُحذف عنوانه في حينه.</li>
    <li>صاحب المحطة يحذف محطته وحسابه بنفسه من لوحته.</li>
    <li>وتبقى نسخة من بيانات المحطة <b>ثلاثين يوماً</b> لاسترجاع ما حُذف بالخطأ،
        ثمّ تُمحى بمهمّة يوميّة مجدولة.</li>
    <li>وسجلّ الإشعارات يُلخَّص عدداً بعد ثلاثين يوماً، ويُمحى تفصيلُه.</li>
  </ul>

  <div class="box"><p><b>وما وقع فعلاً يُقال.</b> الملحق الذي سُلّم إلى الفرع
  سابقاً تضمّن أسماء أصحاب المحطات وأرقام هواتفهم، وهي بيانات تواصل لا يقتضيها
  الإشراف. وقد أُفرد لهذا الغرض منذُها حساب متابعة لا يُخرج شيئاً من ذلك:
  أعداداً مجمَّعة فحسب.</p></div>`;

// ── ورقة ٣: الأرقام ──
const p3 = `
  <h1>الأرقام — كما قُرئت في ${esc(today)}</h1>
  <p>كلّ رقم أدناه قُرئ من قاعدة البيانات لحظة إعداد هذه الورقة، لا نُقل من
  مستند سابق.</p>

  <h2>الجمهور</h2>
  <table>
    <tr><th>البيان</th><th>العدد</th><th>ما يعنيه بالضبط</th></tr>
    <tr><td>المشتركون بالتنبيهات</td><td class="ltr">${ar(n.subscribers)}</td>
        <td>عنوان إشعار <b>مميَّز</b> — لا صفوف الاشتراك، فمن اختار ثلاث نواحٍ وأربعة منتجات له اثنا عشر صفّاً وهو واحد (مجموع الصفوف ${ar(n.alertRows)}).</td></tr>
    <tr><td>الأجهزة المسجَّلة</td><td class="ltr">${ar(n.devices)}</td>
        <td>${ar(n.android)} أندرويد · ${ar(n.ios)} آيفون</td></tr>
    <tr><td>مستخدمو بوت تيليجرام</td><td class="ltr">${ar(n.telegram)}</td><td>محادثات فُتحت مع البوت</td></tr>
  </table>

  <h2>المحتوى</h2>
  <table>
    <tr><th>البيان</th><th>العدد</th><th>المدّة</th></tr>
    <tr><td>محطات معتمدة</td><td class="ltr">${ar(n.approved)}</td><td>ما دامت قائمة</td></tr>
    <tr><td>طلبات تسجيل بانتظار الاعتماد</td><td class="ltr">${ar(n.pending)}</td><td>حتى تُعتمد أو تُرفض</td></tr>
    <tr><td>محطات في أرشيف الحذف</td><td class="ltr">${ar(n.archived)}</td><td>ثلاثون يوماً ثمّ تُمحى</td></tr>
    <tr><td>تقييمات ازدحام قائمة</td><td class="ltr">${ar(n.votes)}</td><td>تُمسح آليّاً كل خمس دقائق</td></tr>
    <tr><td>سجلّ الإشعارات</td><td class="ltr">${ar(n.notifLog)}</td><td>ثلاثون يوماً ثمّ يُلخَّص</td></tr>
    <tr><td>الملخَّص اليوميّ للإشعارات</td><td class="ltr">${ar(n.notifDaily)}</td><td>يبقى — أعداد بلا عنوان واحد</td></tr>
    <tr><td>صفوف جدول وصول الوقود</td><td class="ltr">${ar(n.schedule)}</td><td>يُعرض لليوم والغد</td></tr>
  </table>

  <div class="box"><p><b>ولماذا يختلف رقم المشتركين عن رقم سابق؟</b> لأنّه ينمو
  كلّ يوم، ولأنّ لكلّ عدّ تعريفاً. والمعتمد في هذه الوثيقة تعريف واحد —
  <i>عنوان إشعار مميَّز</i> — وتاريخ قراءة واحد هو ${esc(today)}. وأيّ رقم في
  ورقة أقدم يخصّ يومها لا اليوم.</p></div>`;

// ── ورقة ٤: التوزيع على النواحي ──
const p4 = `
  <h1>المشتركون على نواحي الأنبار</h1>
  <p>ومن اختار «كلّ النواحي» يُحتسب في كلّ ناحية ينتظرها، فمجموع الجدول يفوق
  العدد الكلّيّ <span class="ltr">(${ar(n.subscribers)})</span>.</p>
  <div class="two">
    <table>
      <tr><th>الناحية</th><th>مشتركون</th></tr>
      ${cities.map((c) => `<tr><td>${esc(c.city)}</td><td class="ltr">${ar(c.n)}</td></tr>`).join('')}
    </table>
  </div>`;

const html = `<!doctype html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8">
<title>وثيقة إدارة البيانات — المحطة التقنية</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="_style.css">
${TIGHT}
</head><body>
${[p1, p2, p3, p4].map(sheet).join('\n')}
</body></html>`;

writeFileSync(new URL('../docs/anbar-oil/data-governance.html', import.meta.url), html);

console.log(`بُنيت الوثيقة — ٤ أوراق.`);
console.log(`  مشتركون ${ar(n.subscribers)} (من ${ar(n.alertRows)} صفّاً) · أجهزة ${ar(n.devices)}`);
console.log(`  محطات ${ar(n.approved)} معتمدة · ${ar(n.pending)} بانتظار · نواحٍ ${cities.length}`);
