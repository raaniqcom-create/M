import { Suspense } from 'react';
import type { Metadata } from 'next';
import { PlaceScreen } from '@/components/PlaceScreen';

export const metadata: Metadata = {
  title: 'محطة من جدول التوزيع | المحطة التقنية',
  description: 'العنوان والطريق والمنتجات المعلنة لمحطةٍ في جدول التوزيع.',
};

/** ‎/place/?n=الاسم&c=المدينة — صفحةُ مكانٍ لمحطةٍ ليست مسجّلة. التصديرُ ساكن،
 *  فالمعاملاتُ تُقرأ في المتصفّح داخل Suspense (نمطُ app/admin/station). */
export default function PlacePage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-md px-4 py-10" />}>
      <PlaceScreen />
    </Suspense>
  );
}
