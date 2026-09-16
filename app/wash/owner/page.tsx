import type { Metadata } from 'next';
import { WashGate } from '@/components/WashGate';
import { WashOwnerScreen } from '@/components/WashOwnerScreen';

export const metadata: Metadata = { title: 'لوحة المغسلة | المحطة التقنية' };

/** ‎/wash/owner/ — لوحةُ صاحب المغسلة. */
export default function WashOwnerPage() {
  return (
    <WashGate>
      <WashOwnerScreen />
    </WashGate>
  );
}
