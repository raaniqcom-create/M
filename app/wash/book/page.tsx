import { Suspense } from 'react';
import type { Metadata } from 'next';
import { WashGate } from '@/components/WashGate';
import { WashBookFlow } from '@/components/WashBookFlow';

export const metadata: Metadata = { title: 'حجز موعد | المحطة التقنية' };

/** ‎/wash/book/?id=…&service=&offer=&replace= — صفحةُ الحجز؛ المعرّفاتُ تُقرأ في المتصفّح داخل Suspense. */
export default function WashBookPage() {
  return (
    <WashGate>
      <Suspense fallback={<main className="mx-auto max-w-md px-4 py-10" />}>
        <WashBookFlow />
      </Suspense>
    </WashGate>
  );
}
