import type { Metadata, Viewport } from 'next';
import { Tajawal } from 'next/font/google';
import './globals.css';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';

const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700', '800'],
  variable: '--font-tajawal',
});

const DESCRIPTION =
  'المحطة التقنية — منصة وقود الأنبار. اعرف فوراً أي محطة يتوفر فيها البانزين والكاز والغاز و LPG في الرمادي والفلوجة وهيت وحديثة وباقي مدن الأنبار، مع حالة الازدحام مباشرة وتنبيهات فور وصول الوقود. مجاناً وبدون حساب.';

export const metadata: Metadata = {
  metadataBase: new URL('https://muhta.netlify.app'),
  title: {
    default: 'المحطة التقنية | منصة وقود الأنبار',
    template: '%s | المحطة التقنية',
  },
  description: DESCRIPTION,
  applicationName: 'المحطة التقنية',
  keywords: [
    'وقود الأنبار',
    'محطات وقود الرمادي',
    'بانزين الفلوجة',
    'غاز الأنبار',
    'المحطة التقنية',
    'توفر الوقود العراق',
  ],
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'المحطة التقنية', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  openGraph: {
    type: 'website',
    locale: 'ar_IQ',
    url: 'https://muhta.netlify.app',
    siteName: 'المحطة التقنية',
    title: 'المحطة التقنية | منصة وقود الأنبار',
    description: DESCRIPTION,
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'المحطة التقنية' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'المحطة التقنية | منصة وقود الأنبار',
    description: DESCRIPTION,
    images: ['/og-image.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#16a34a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={tajawal.variable}>
      <body className="min-h-screen bg-gray-50 font-sans text-gray-900 antialiased">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
