import { Suspense } from 'react';
import type { Metadata } from 'next';
import { WashGate } from '@/components/WashGate';
import { WashOwnerScreen } from '@/components/WashOwnerScreen';

export const metadata: Metadata = { title: 'لوحة المغسلة | المحطة التقنية' };

/** ‎/wash/owner/ — لوحةُ صاحب المغسلة؛ و`?id=` تفتحها للإدارة على أيّ مغسلة (نمطُ app/place). */
export default function WashOwnerPage() {
  return (
    <WashGate>
      <Suspense fallback={<main className="mx-auto max-w-md px-4 py-10" />}>
        <WashOwnerScreen />
      </Suspense>
    </WashGate>
  );
}
