import type { Metadata } from 'next';
import { DoriScreen } from '@/components/DoriScreen';
import { FuelIcon } from '@/components/icons';

/** ما يراه من وصله الرابطُ في واتساب قبل أن يفتحه: اسمُ الخدمة وتعريفُها
 *  وصورتُها — لا «muhta.online/dori» عاريةً. الصورةُ في public/og-dori.png،
 *  مصدرُها docs/promo/og-dori.html. */
export const metadata: Metadata = {
  title: 'اعرف دورك في البنزين — الفرديّ والزوجيّ',
  description: 'أدخل رقم سيارتك مرّةً واحدة — يظهر دورك في الفرديّ والزوجيّ اليوم أم غداً، والمحطات التي يصلها البنزين في مدينتك، والطريق إليها. من المحطة التقنية — منصّة وقود الأنبار.',
  alternates: { canonical: '/dori' },
  openGraph: {
    type: 'website',
    locale: 'ar_IQ',
    url: 'https://muhta.online/dori',
    siteName: 'المحطة التقنية',
    title: 'اعرف دورك في البنزين — الفرديّ والزوجيّ',
    description: 'أدخل رقم سيارتك مرّةً واحدة — يظهر دورك في الفرديّ والزوجيّ اليوم أم غداً، والمحطات التي يصلها البنزين في مدينتك، والطريق إليها. من المحطة التقنية — منصّة وقود الأنبار.',
    images: [{ url: '/og-dori.png', width: 1200, height: 630, alt: 'اعرف دورك في البنزين — المحطة التقنية' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'اعرف دورك في البنزين — الفرديّ والزوجيّ',
    description: 'أدخل رقم سيارتك مرّةً واحدة — يظهر دورك في الفرديّ والزوجيّ اليوم أم غداً، والمحطات التي يصلها البنزين في مدينتك، والطريق إليها. من المحطة التقنية — منصّة وقود الأنبار.',
    images: ['/og-dori.png'],
  },
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
    </main>
  );
}
