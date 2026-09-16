import type { Metadata } from 'next';
import { WashGate } from '@/components/WashGate';
import { WashDirectory } from '@/components/WashDirectory';

export const metadata: Metadata = { title: 'غسيل السيارات | المحطة التقنية' };

/** ‎/wash/ — الرئيسيةُ: دليلُ المغاسل والبانراتُ وعروضُ اليوم. خلف `WashGate` حتى يُفتح القسم (`WASH.active`). */
export default function WashPage() {
  return (
    <WashGate>
      <WashDirectory />
    </WashGate>
  );
}
