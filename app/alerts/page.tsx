import type { Metadata } from 'next';
import { AlertSetup } from '@/components/AlertSetup';
import { AlertTiming } from '@/components/AlertTiming';

export const metadata: Metadata = {
  title: 'نبّهني عند توفر الوقود',
  description:
    'اختر مدينتك ونوع الوقود، ويصلك إشعار فور توفره في أي محطة — بلا حساب وبلا رقم هاتف.',
};

export default function AlertsPage() {
  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-8">
      <h1 className="text-center text-xl font-extrabold">تنبيهات الوقود</h1>
      <p className="mt-1 text-center text-sm leading-relaxed text-slate-500">
        لا تفتح التطبيق كل يوم لتسأل — نحن ننبّهك.
      </p>

      <div className="mt-5">
        <AlertSetup />
        <AlertTiming />
      </div>

      <a href="/" className="btn-ghost mt-4 w-full">
        العودة للصفحة الرئيسية
      </a>
    </main>
  );
}
