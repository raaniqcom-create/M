import type { Metadata } from 'next';
import { DoriScreen } from '@/components/DoriScreen';
import { SiteFooter } from '@/components/SiteFooter';
import { FuelIcon } from '@/components/icons';

export const metadata: Metadata = {
  title: 'دوري — الفرديّ والزوجيّ',
  description:
    'أدخل رقم لوحة سيّارتك واعرف دورك في توزيع البنزين بالفرديّ والزوجيّ في الأنبار، والمحطات التي فيها بنزينٌ الآن.',
};

/** `/dori` — «دوري»: بابٌ مباشرٌ لبطاقة الفرديّ والزوجيّ، يُشارَك رابطاً.
 *
 *  الاسمُ قصيرٌ يُقال ويُكتب: muhta.online/dori. والبطاقةُ هي نفسُها التي في
 *  الرئيسية تحت الحالات — لا نسخةَ ثانية. */
export default function DoriPage() {
  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-8">
      <a href="/" className="mx-auto flex w-fit items-center gap-2 text-brand-700">
        <FuelIcon className="h-6 w-6" />
        <span className="text-base font-extrabold">المحطة التقنية</span>
      </a>

      <h1 className="mt-6 text-center text-xl font-extrabold text-slate-800">دوري</h1>
      <p className="mx-auto mt-2 max-w-sm text-center text-xs leading-relaxed text-slate-600">
        أدخل رقم لوحتك مرّةً واحدة — تعرف <b className="text-slate-800">دورك اليوم أم غداً</b>،
        وأيّامَك في الأسبوع، <b className="text-slate-800">والمحطاتِ التي فيها بنزينٌ الآن</b>.
      </p>

      {/* اعتمدها صاحبُ المنصّة ١٢ أيلول ٢٠٢٦ بعد معاينةٍ للإدارة وحدَها. */}
      <div className="mt-6">
        <DoriScreen />
      </div>

      <SiteFooter />
    </main>
  );
}
