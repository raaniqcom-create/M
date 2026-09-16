import { Suspense } from 'react';
import type { Metadata } from 'next';
import { WashGate } from '@/components/WashGate';
import { WashDetail } from '@/components/WashDetail';

export const metadata: Metadata = { title: 'حجز موعد غسيل | المحطة التقنية' };

/** ‎/wash/detail/?id=… — التصديرُ ساكن، فالمعرّفُ يُقرأ في المتصفّح داخل Suspense
 *  (نمطُ app/place). */
export default function WashDetailPage() {
  return (
    <WashGate>
      <Suspense fallback={<main className="mx-auto max-w-md px-4 py-10" />}>
        <WashDetail />
      </Suspense>
    </WashGate>
  );
}
