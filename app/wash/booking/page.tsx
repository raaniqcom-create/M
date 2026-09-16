import { Suspense } from 'react';
import type { Metadata } from 'next';
import { WashGate } from '@/components/WashGate';
import { WashBookingScreen } from '@/components/WashBookingScreen';

export const metadata: Metadata = { title: 'حجزُ الغسيل | المحطة التقنية' };

/** ‎/wash/booking/?code=…&p=… — بطاقةُ الحجز؛ الرمزُ والهاتفُ يُقرآن في المتصفّح. */
export default function WashBookingPage() {
  return (
    <WashGate>
      <Suspense fallback={<main className="mx-auto max-w-md px-4 py-10" />}>
        <WashBookingScreen />
      </Suspense>
    </WashGate>
  );
}
