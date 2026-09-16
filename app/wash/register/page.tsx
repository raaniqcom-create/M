import type { Metadata } from 'next';
import { WashGate } from '@/components/WashGate';
import { WashRegisterForm } from '@/components/WashRegisterForm';

export const metadata: Metadata = { title: 'سجّل مغسلتك | المحطة التقنية' };

/** ‎/wash/register/ — تسجيلُ مغسلة. الباقاتُ وأسعارُها من القاعدة (wash_config) داخل النموذج. */
export default function WashRegisterPage() {
  return (
    <WashGate>
      <main className="mx-auto max-w-md px-4 pb-24 pt-6">
        <h1 className="text-lg font-extrabold text-brand">سجّل مغسلتك في المحطة التقنية</h1>
        <div className="mt-4">
          <WashRegisterForm />
        </div>
      </main>
    </WashGate>
  );
}
