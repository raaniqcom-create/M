import type { Metadata } from 'next';
import { WashGate } from '@/components/WashGate';
import { WashMyBookings } from '@/components/WashMyBookings';

export const metadata: Metadata = { title: 'حجوزاتي | المحطة التقنية' };

/** ‎/wash/mine/ — حجوزاتُ هذا الجهاز (localStorage) وحالتُها من القاعدة. */
export default function WashMinePage() {
  return (
    <WashGate>
      <WashMyBookings />
    </WashGate>
  );
}
