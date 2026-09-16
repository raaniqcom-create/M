import type { Metadata } from 'next';

/** قسمُ «غسيل» لم يُعلَن بعد: لا فهرسة حتى يُفتح (`WASH.active`). */
export const metadata: Metadata = {
  title: 'غسل السيارات | المحطة التقنية',
  robots: { index: false, follow: false },
};

export default function WashLayout({ children }: { children: React.ReactNode }) {
  return children;
}
