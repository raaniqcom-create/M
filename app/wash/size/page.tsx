import { Suspense } from 'react';
import type { Metadata } from 'next';
import { WashGate } from '@/components/WashGate';
import { WashSizeScreen } from '@/components/WashSizeScreen';

export const metadata: Metadata = { title: 'حجم السيارة | المحطة التقنية' };

/** ‎/wash/size/?id=… — اختيارُ حجم السيارة؛ المعرّفُ يُقرأ في المتصفّح داخل Suspense. */
export default function WashSizePage() {
  return (
    <WashGate>
      <Suspense fallback={<main className="mx-auto max-w-md px-4 py-10" />}>
        <WashSizeScreen />
      </Suspense>
    </WashGate>
  );
}
