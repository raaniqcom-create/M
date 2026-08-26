import type { Metadata } from 'next';
import { RoadPlanner } from '@/components/RoadPlanner';
import { SiteFooter } from '@/components/SiteFooter';
import { FuelIcon } from '@/components/icons';

export const metadata: Metadata = {
  title: 'مساعد الطريق | المحطة التقنية',
  description:
    'محطات الوقود على طريقك بين مدن الأنبار وبغداد والمنافذ الحدودية — وأين تمتدّ الطريق بلا محطة.',
};

/** صفحةٌ ساكنة واحدة، لا مسارٌ ديناميكي.
 *
 *  المشروع output:'export'، وأي [from]/[to] يلزمه generateStaticParams —
 *  أي صفحةً مبنيّةً لكل زوجٍ من المدن. والرحلة تُختار من الحالة لا من العنوان. */
export default function RoadPage() {
  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-8">
      <a href="/" className="mx-auto flex w-fit items-center gap-2 text-brand-700">
        <FuelIcon className="h-6 w-6" />
        <span className="text-base font-extrabold">المحطة التقنية</span>
      </a>

      <h1 className="mt-6 text-center text-xl font-extrabold text-slate-800">مساعد الطريق</h1>
      <p className="mx-auto mt-2 max-w-sm text-center text-xs leading-relaxed text-slate-500">
        اختر رحلتك، فتظهر المحطات التي تخدم اتجاه سيرك — <b>وأين تمتدّ الطريق بلا محطة</b>،
        وهو ما يستحقّ أن تعرفه قبل أن تتحرّك.
      </p>

      <div className="mt-6">
        <RoadPlanner />
      </div>

      <a href="/" className="btn-ghost mt-6 w-full">
        العودة إلى المحطات
      </a>

      <SiteFooter />
    </main>
  );
}
