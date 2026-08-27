import type { Metadata } from 'next';
import { AdminOnly } from '@/components/AdminOnly';
import { RoadPlanner } from '@/components/RoadPlanner';
import { SiteFooter } from '@/components/SiteFooter';
import { FuelIcon } from '@/components/icons';

export const metadata: Metadata = {
  title: 'مساعد الطريق',
  description:
    'تغطية محطات الوقود على طرق الأنبار — بين مدنها وبغداد والمنافذ الحدودية.',
  // لم تُعلَن بعد: لا تُفهرَس ولا تظهر في نتائج البحث.
  robots: { index: false, follow: false },
};

/** صفحةٌ ساكنة واحدة، لا مسارٌ ديناميكي.
 *
 *  المشروع output:'export'، وأي [from]/[to] يلزمه generateStaticParams —
 *  أي صفحةً مبنيّةً لكل زوجٍ من المدن. والرحلة تُختار من الحالة لا من العنوان.
 *
 *  **ومحجوبةٌ عن غير الإدارة.** جاهزةٌ ولم تُعلَن، فحارسُها هو الدورُ نفسُه
 *  الذي يحرس لوحة الإدارة — لا مفتاحاً في التخزين المحلّي يعرفه كلُّ من فتح
 *  أدوات المتصفّح.
 *
 *  **وهويّتها هويّة المنصّة.** جُرِّب لها لوحٌ رمليّ يحاكي الصحراء، فقرّر
 *  المالك أن الهويّة أبقى: أخضرُ على أبيض في كل صفحة. والصحراء تُقال بما
 *  يُعرض — امتدادٌ أحمر بلا محطة — لا بلون الورق. */
export default function RoadPage() {
  return (
    <AdminOnly>
    <main className="mx-auto max-w-md px-4 pb-16 pt-8">
      <a href="/" className="mx-auto flex w-fit items-center gap-2 text-brand-700">
        <FuelIcon className="h-6 w-6" />
        <span className="text-base font-extrabold">المحطة التقنية</span>
      </a>

      <h1 className="mt-6 text-center text-xl font-extrabold text-slate-800">مساعد الطريق</h1>
      <p className="mx-auto mt-2 max-w-sm text-center text-xs leading-relaxed text-slate-600">
        أغلبُ الطرق الرئيسية في الأنبار تمرّ بمناطقَ صحراوية لا عمران فيها. فاختر رحلتك، تعرف
        <b className="text-slate-800"> أين تقف المحطات على طريقك </b>
        — <b className="text-traffic-red">وأين لا تقف واحدة</b>، وهو ما يستحقّ أن تعرفه قبل
        أن تتحرّك.
      </p>

      {/* حدُّ ما يُعرض يُقال في الأعلى لا في حاشيةٍ أسفل: من يفتح الصفحة
          يظنّ كلَّ ما فيها مضموناً، فيُقال له الفرقُ قبل أن يسأل. */}
      <p className="mx-auto mt-3 max-w-sm rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2 text-center text-[11px] leading-relaxed text-slate-700">
        <b className="text-brand-700">المحطات المعتمدة</b> تظهر ببطاقتها كاملةً — منتجاتها
        ودوامها ورقمها.
        <br />
        <span className="text-slate-600">
          وغيرُها <b>موقعٌ فقط</b> من خرائطَ مفتوحة، عليها شريطٌ أحمر يقول ذلك.
        </span>
      </p>

      <div className="mt-5">
        <RoadPlanner />
      </div>

      <a href="/" className="btn-ghost mt-6 w-full">
        العودة إلى المحطات
      </a>

      <SiteFooter />
    </main>
    </AdminOnly>
  );
}
