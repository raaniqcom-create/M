// يبني كتابَ الدخول لرئيس قسم الدراسات — فرع توزيع المنتجات النفطية بالأنبار.
//
//   node scripts/build-studies-letter.mjs
//   node scripts/print-pdf.mjs docs/anbar-oil/letter-studies.html
//
// **كتابُ وصولٍ لا كتابُ أرقام.** الأرقامُ في `data-governance` و`annex-oil`،
// وهي تشيخ؛ وهذا يقول كيف يدخل وماذا يجد — ولا يشيخ ما دام الحسابُ قائماً.
//
// والترويسةُ والرموزُ تُقرأ من الكتاب القائم لا تُنسخ يدويّاً: كتابان بترويستين
// مختلفتين من جهةٍ واحدة يُقرآن تسرّعاً.

import { readFileSync, writeFileSync } from 'node:fs';

const doc = (n) => new URL(`../docs/anbar-oil/${n}`, import.meta.url);

const old = readFileSync(doc('letter-oil.html'), 'utf8');
const HEAD = old.match(/<header class="head">[\s\S]*?<\/header>/)?.[0];
if (!HEAD || HEAD.length < 200) throw new Error('ترويسةُ الكتاب لم تُستخرج — راجِع القالب');

/** رمزُ استجابةٍ جاهزٌ للطباعة.
 *
 *  segno يكتب width/height ولا يكتب viewBox — وبها لا يتمدّد الرمزُ داخل
 *  حاويته، فخرج فارغاً في دليلٍ مطبوعٍ مرّة. فيُنزع القياسُ ويوضع viewBox
 *  محسوباً مما أخرجه segno لا مفترَضاً. (نفسُ منطق scripts/inline-qr.mjs) */
function qr(name) {
  let s = readFileSync(doc(`qr/${name}.svg`), 'utf8').replace(/<\?xml[^>]*\?>\s*/, '');
  const w = Number(/\bwidth="(\d+(?:\.\d+)?)"/.exec(s)?.[1]);
  const h = Number(/\bheight="(\d+(?:\.\d+)?)"/.exec(s)?.[1]);
  if (!w || !h) throw new Error(`${name}: لا قياسَ يُشتقّ منه viewBox`);
  if (!/viewBox=/.test(s)) s = s.replace('<svg', `<svg viewBox="0 0 ${w} ${h}"`);
  return s.replace(/\s(width|height)="[^"]*"/g, '');
}

const TIGHT = `<style>
  .body p{margin:6px 0}
  .body ol,.body ul{margin:5px 0 8px}
  .body li{margin-bottom:4px}
  h1{margin:9px 0 3px}
  h2{margin:12px 0 4px;font-size:11.5pt}
  table{margin:6px 0 9px;font-size:9.8pt}
  th,td{padding:5px 8px}
  .box{margin:7px 0;padding:8px 11px}
  .creds{display:flex;gap:6mm;margin:7px 0 9px}
  .cred{flex:1;background:var(--brand-50);border:1px solid var(--brand-200);
        border-radius:8px;padding:7px 10px;text-align:center}
  .cred .k{font-size:8.5pt;color:var(--muted)}
  .cred .v{font-size:14pt;font-weight:800;color:var(--brand-900);direction:ltr;letter-spacing:.5px}
  .qrs{display:flex;gap:5mm;justify-content:space-between;margin-top:4mm;
       background:var(--brand-50);border:1px solid var(--brand-100);border-radius:10px;padding:4mm 5mm}
  .qrs .one{text-align:center;flex:1}
  .qrs .one svg{width:22mm;height:22mm;display:block;margin:0 auto}
  .qrs .one .t{margin-top:1.5mm;font-size:8.5pt;font-weight:700;color:var(--brand-900)}
  .qrs .one .u{font-size:7pt;color:var(--muted);direction:ltr}
</style>`;

const SIGN = `<div class="sign">
    <div class="name">أحمد الرفاعي</div>
    <div class="role">مقدّم الفكرة والمشرف على المنصة</div>
    <div class="role ltr">0784 444 6633</div>
    <div class="line">التوقيع</div>
  </div>`;

const FOOT =
  '<footer class="foot"><span>المحطة التقنية — منصة وقود الأنبار</span>' +
  '<span class="ltr">muhta.online</span></footer>';

const sheet = (inner) => `<section class="sheet">${HEAD}<div class="body">${inner}</div>${FOOT}</section>`;

// **ورقتان لا ورقة.** الكتابُ في ورقةٍ واحدةٍ فاض ٤٨٩ بكسلاً — قِيست
// بـprint-pdf لا خُمّنت — وتقليصُ ذلك كان سيحذف نصفَ ما جاء الكتابُ لأجله.
// فالأولى «كيف يدخل» بالرموز، والثانية «ماذا يجد» بالتوقيع.
const page1 = `
  <div class="meta"><span>العدد: &nbsp;/ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><span>التاريخ: &nbsp;&nbsp;/ &nbsp;&nbsp;/ ٢٠٢٦</span></div>

  <h1>إلى / رئيس قسم الدراسات — فرع شركة توزيع المنتجات النفطية في الأنبار</h1>
  <p class="subject">م/ الدخول إلى لوحة متابعة «المحطة التقنية»</p>

  <p>تحية طيبة… إلحاقاً لكتابنا السابق، فُتح لقسمكم حساب اطّلاع على لوحة
  المتابعة. وهذه اللوحة تعرض حالة التوفّر في محطات المحافظة لحظة بلحظة، وأعداداً
  مجمّعة عن المشتركين والتغطية، وجدول وصول الوقود لليوم والغد. وأدناه طريقة
  الدخول وما يجدُه المستخدم فيها.</p>

  <h2>أولاً: ثلاثة أبواب للدخول</h2>
  <table>
    <tr><th>الطريق</th><th>ماذا تفعل</th></tr>
    <tr>
      <td><b>١ · من الحاسوب</b></td>
      <td>افتح المتصفّح واكتب: <b class="ltr">muhta.online/branch</b></td>
    </tr>
    <tr>
      <td><b>٢ · من الهاتف — المتصفّح</b></td>
      <td>افتح الرابط نفسه <b class="ltr">muhta.online/branch</b>، ثم من قائمة
      المتصفّح اختر «إضافة إلى الشاشة الرئيسية» ليصبح أيقونة تُفتح بلمسة.</td>
    </tr>
    <tr>
      <td><b>٣ · من التطبيق</b></td>
      <td>ثبّت تطبيق المنصّة من متجر آيفون أو أندرويد (الرموز أدناه) — وهو يعرض
      المنصّة كما يراها المواطن. ولوحةُ الفرع تُفتح من الرابط أعلاه.</td>
    </tr>
  </table>

  <h2>ثانياً: ماذا تُدخل</h2>
  <p>تظهر صفحة الدخول بحقلين: <b>«رقم الهاتف أو اسم المستخدم»</b> و<b>«كلمة
  المرور»</b>. تُدخل فيهما:</p>

  <div class="creds">
    <div class="cred"><div class="k">اسم المستخدم</div><div class="v">anbar1</div></div>
    <div class="cred"><div class="k">كلمة المرور</div><div class="v">Ahmed111</div></div>
  </div>

  <p>ثم تُفتح اللوحة مباشرة. والحساب <b>باسم الجهة لا باسم شخص</b>، فيبقى قائماً
  إذا نُقل الموظّف؛ وكلمة المرور تُبدَّل بطلبٍ منكم في دقيقة.</p>

  <div class="qrs">
    <div class="one">${qr('branch')}<div class="t">لوحة الفرع</div><div class="u">muhta.online/branch</div></div>
    <div class="one">${qr('site')}<div class="t">الموقع</div><div class="u">muhta.online</div></div>
    <div class="one">${qr('ios')}<div class="t">آيفون</div><div class="u">App&nbsp;Store</div></div>
    <div class="one">${qr('android')}<div class="t">أندرويد</div><div class="u">Google&nbsp;Play</div></div>
  </div>`;

const page2 = `
  <h1>لوحة المتابعة — ماذا تجد فيها</h1>

  <h2>ثالثاً: ثلاثة تبويبات</h2>
  <ul>
    <li><b>نظرة</b> — جدول بكل المحطات المعتمدة: المدينة، ما تعلن توفّره الآن،
    متى كان آخر تحديث لها، وأيّها صامتة لم تُحدّث. ومعه خريطة المحافظة، وزرّ
    طباعة يُخرج الجدول ورقةً جاهزة للملف.</li>
    <li><b>إحصائيّات</b> — أعداد مجمّعة: المشتركون بالتنبيهات، المحطات المعتمدة
    وما ينتظر الاعتماد، الأجهزة، وعدد الإشعارات في آخر ثلاثين يوماً. ثم توزيع
    المشتركين على مناطق المحافظة، ويُبرَز فيه <b>ما فيه منتظرون ولا محطة معتمدة
    فيه</b> — وهو ما يخصّ قسمكم في قرارات التغطية.</li>
    <li><b>جدول اليوم / غداً</b> — أين يصل الوقود ونوعه، مجموعاً بالمنطقة،
    ومصدر كل سطر مبيَّن: ما أعلنته المحطة في لوحتها، أو ما ورد في جدول التوزيع.</li>
  </ul>

  <h2>رابعاً: حدود هذه الصلاحية</h2>
  <div class="box">
    <p><b>قراءة فقط.</b> لا يوجد في اللوحة زرٌّ واحد يغيّر بياناتٍ في المنصّة.</p>
    <p><b>ولا بيانات شخصية.</b> لا أرقام هواتف أصحاب المحطات، ولا أسماءهم، ولا
    عناوين إشعار المشتركين — وهذا محجوب على مستوى قاعدة البيانات نفسها لا في
    الواجهة، فلا يظهر بأي طريق.</p>
    <p><b>والسحب فوري.</b> بطلبٍ منكم تُلغى الصلاحية في الحال.</p>
  </div>

  <p>ونحن على استعدادٍ لشرحٍ مباشر لموظّفي القسم، أو لإضافة ما ترونه من بيانات
  أو تقارير دورية، أو لتزويدكم بنسخةٍ مطبوعة من وثيقة إدارة البيانات.</p>

  <div style="margin-top:6mm">${SIGN}</div>`;

const html = `<!doctype html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8">
<title>كتاب الدخول — لوحة متابعة فرع الأنبار</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="_style.css">
${TIGHT}
</head><body>
${sheet(page1)}
${sheet(page2)}
</body></html>`;

writeFileSync(doc('letter-studies.html'), html);
console.log('بُني: docs/anbar-oil/letter-studies.html');
