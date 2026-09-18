import './wash.css';
import type { Metadata } from 'next';

/** قسمُ «غسيل» لم يُعلَن بعد: لا فهرسة حتى يُفتح (`WASH.active`). */
export const metadata: Metadata = {
  title: 'المغسلة التقنية | المحطة التقنية',
  icons: { icon: '/wash/mark.png' },
  robots: { index: false, follow: false },
};

export default function WashLayout({ children }: { children: React.ReactNode }) {
  return children;
}
