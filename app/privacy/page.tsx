import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'سياسة الخصوصية',
  description: 'ما تجمعه منصة المحطة التقنية من بيانات، ولماذا، وكيف تحذفها.',
};

// Google Play rejects any app without a reachable privacy policy, and the
// policy must match what the app actually does — so this describes the real
// behaviour rather than boilerplate.
export default function PrivacyPage() {
  const updated = '٨ آب ٢٠٢٦';

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-extrabold">سياسة الخصوصية</h1>
      <p className="mt-1 text-sm text-slate-500">آخر تحديث: {updated}</p>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold">من نحن</h2>
        <p className="text-sm leading-relaxed text-slate-700">
          «المحطة التقنية» منصة مجانية تعرض توفر الوقود وحالة الازدحام في محطات محافظة
          الأنبار بالعراق. الموقع: muhta.online
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold">للسائقين: لا نطلب أي حساب</h2>
        <p className="text-sm leading-relaxed text-slate-700">
          تصفح المنصة لا يتطلب تسجيلاً ولا اسماً ولا رقم هاتف ولا بريداً إلكترونياً.
        </p>
        <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-slate-700">
          <li>
            <b>الموقع الجغرافي:</b> يُستخدم على جهازك فقط لترتيب المحطات حسب قربها منك.
            لا يُرسل إلى خوادمنا ولا يُخزَّن.
          </li>
          <li>
            <b>المحطات المفضلة:</b> تُحفظ في متصفحك أو تطبيقك، لا لدينا.
          </li>
          <li>
            <b>تصويت الازدحام:</b> نحفظ اللون والوقت والمحطة فقط. لا نربطه بك، ولا يمكن
            كتابة أي تعليق نصي.
          </li>
          <li>
            <b>عدّاد الزوار:</b> رقم إجمالي واحد. لا نحفظ من زار ولا متى.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold">لأصحاب المحطات</h2>
        <p className="text-sm leading-relaxed text-slate-700">
          عند تسجيل محطة نحفظ: اسم المحطة وعنوانها وموقعها على الخريطة، ورقم هاتف للنشر،
          واسم الشخص المسؤول، ورقم هاتف للدخول.
        </p>
        <p className="text-sm leading-relaxed text-slate-700">
          <b>ما يظهر للعامة:</b> اسم المحطة وعنوانها وموقعها ورقم النشر فقط. رقم الدخول
          وكلمة المرور لا يظهران لأحد.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold">الإشعارات</h2>
        <p className="text-sm leading-relaxed text-slate-700">
          إن فعّلت الإشعارات، نحفظ معرّفاً تقنياً لجهازك لإرسالها فقط. لا يكشف هذا
          المعرّف هويتك، ويُحذف تلقائياً عند إلغاء التثبيت أو إيقاف الإشعارات.
        </p>
        <p className="text-sm leading-relaxed text-slate-700">
          نستخدم خدمة Firebase Cloud Messaging من Google لتوصيل الإشعارات لتطبيق أندرويد.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold">ما لا نفعله</h2>
        <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-slate-700">
          <li>لا نبيع بياناتك ولا نشاركها مع أي جهة تجارية</li>
          <li>لا نتتبع تحركاتك ولا نحفظ سجل تنقلك</li>
          <li>لا نستخدم إعلانات تتبّعية</li>
          <li>لا نجمع جهات الاتصال ولا الصور ولا الملفات</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold">حذف بياناتك</h2>
        <p className="text-sm leading-relaxed text-slate-700">
          صاحب المحطة يمكنه طلب حذف محطته وحسابه بالكامل عبر رسالة إلى بوت المنصة على
          تيليجرام <b>@muhtaonlinebot</b> أو من صفحة التواصل. يُنفَّذ الحذف خلال ٤٨ ساعة
          ولا يُبقي أي أثر.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold">الأطفال</h2>
        <p className="text-sm leading-relaxed text-slate-700">
          المنصة موجهة للسائقين وأصحاب المحطات، ولا تجمع عمداً أي بيانات عن الأطفال دون
          سن ١٣.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold">التواصل</h2>
        <p className="text-sm leading-relaxed text-slate-700">
          لأي سؤال أو طلب يخص خصوصيتك: بوت تيليجرام <b>@muhtaonlinebot</b>
        </p>
      </section>

      <a href="/" className="mt-10 block text-center text-sm text-brand">
        العودة للصفحة الرئيسية
      </a>
    </main>
  );
}
