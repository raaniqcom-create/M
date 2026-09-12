import type { Metadata } from 'next';
import { CansScreen } from '@/components/CansScreen';
import { SiteFooter } from '@/components/SiteFooter';
import { FuelIcon } from '@/components/icons';

const DESC =
  'مُنع تجهيز البنزين بالعبوات البلاستيكية من المحطات — أين تعبّئ العبوة للدرّاجة والتكتك والمولّدة؟ منافذ البيع المباشر في مدن الأنبار، مدينتك أوّلاً.';

export const metadata: Metadata = {
  title: 'تعبئة العبوات البلاستيكية — أين؟',
  description: DESC,
  alternates: { canonical: '/abwat' },
  openGraph: {
    type: 'website',
    locale: 'ar_IQ',
    url: 'https://muhta.online/abwat',
    siteName: 'المحطة التقنية',
    title: 'تعبئة العبوات البلاستيكية — أين؟',
    description: DESC,
  },
};

/** `/abwat` — «تعبئة العبوات البلاستيكية»: لصاحب الدرّاجة ووسائل النقل الأخرى بعد قرار
 *  منع العبوات البلاستيكية. بابُه القائمةُ الجانبية — لا يهمّ الجميع، فلا يأخذ
 *  مكاناً من الرئيسية. اعتمدها صاحبُ المنصّة للجميع ١٣ أيلول ٢٠٢٦. */
export default function AbwatPage() {
  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-8">
      <a href="/" className="mx-auto flex w-fit items-center gap-2 text-brand-700">
        <FuelIcon className="h-6 w-6" />
        <span className="text-base font-extrabold">المحطة التقنية</span>
      </a>

      <h1 className="mt-6 text-center text-xl font-extrabold text-slate-800">تعبئة العبوات البلاستيكية — أين؟</h1>
      <p className="mx-auto mt-2 max-w-sm text-center text-xs leading-relaxed text-slate-600">
        بعد قرار منع العبوات البلاستيكية في المحطات: <b className="text-slate-800">منافذُ البيع المباشر</b>{' '}
        للدرّاجات والتكتك والمولّدات — مدينتك أوّلاً.
      </p>

      <div className="mt-6">
        <CansScreen />
      </div>

      <SiteFooter />
    </main>
  );
}
