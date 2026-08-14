import type { Metadata, Viewport } from 'next';
import { Tajawal } from 'next/font/google';
import './globals.css';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { NativePush } from '@/components/NativePush';
import { APPLE_APP_ID } from '@/lib/stores';

const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700', '800'],
  variable: '--font-tajawal',
});

const DESCRIPTION =
  'المحطة التقنية — منصة وقود الأنبار. اعرف فوراً أي محطة يتوفر فيها البانزين والكاز والغاز و LPG في الرمادي والفلوجة وهيت وحديثة وباقي مدن الأنبار، مع حالة الازدحام مباشرة وتنبيهات فور وصول الوقود. مجاناً وبدون حساب.';

export const metadata: Metadata = {
  metadataBase: new URL('https://muhta.online'),
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
  // Safari's own banner, above the page and outside our control — one tap
  // straight to the listing, and it disappears by itself once the app is
  // installed. Costs one meta tag and beats anything we could draw.
  itunes: { appId: APPLE_APP_ID },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  openGraph: {
    type: 'website',
    locale: 'ar_IQ',
    url: 'https://muhta.online',
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
  // Lets the green header run edge to edge behind the status bar instead of
  // leaving a white strip; the safe-area padding below keeps the title clear
  // of the notch. Required for env(safe-area-inset-*) to report anything.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={tajawal.variable}>
      <body className="min-h-screen bg-gray-50 font-sans text-gray-900 antialiased">
        <ServiceWorkerRegister />
        <NativePush />
        {children}
      </body>
    </html>
  );
}
