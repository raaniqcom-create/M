import type { Metadata } from 'next';
import { WashGate } from '@/components/WashGate';
import { WashRegisterForm } from '@/components/WashRegisterForm';

export const metadata: Metadata = { title: 'سجّل محطتك | المحطة التقنية' };

/** ‎/wash/register/ — تسجيلُ محطّة غسيل في سبع خطوات. الباقاتُ وأسعارُها من القاعدة (wash_config) داخل النموذج. */
export default function WashRegisterPage() {
  return (
    <WashGate>
      <main className="mx-auto max-w-md px-4 pb-24 pt-6">
        <h1 className="text-xl font-extrabold text-slate-800">سجّل محطتك في المحطة التقنية</h1>
        <p className="mt-1 text-[12px] text-slate-500">اشتراك شهري – إدارة حجوزات – عروض – صفحة خاصة لمحطتك</p>
        <div className="mt-4">
          <WashRegisterForm />
        </div>
      </main>
    </WashGate>
  );
}
