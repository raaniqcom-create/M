import type { Metadata } from 'next';
import { WashGate } from '@/components/WashGate';
import { WashSubscriptionScreen } from '@/components/WashSubscriptionScreen';

export const metadata: Metadata = { title: 'إدارة الاشتراك | المغسلة التقنية' };

/** ‎/wash/owner/subscription/ — الدفعُ ورفعُ الإيصال؛ يفتحه المالكُ من اللوحة ومن شاشة «تمّ التسجيل». */
export default function WashSubscriptionPage() {
  return (
    <WashGate>
      <WashSubscriptionScreen />
    </WashGate>
  );
}
