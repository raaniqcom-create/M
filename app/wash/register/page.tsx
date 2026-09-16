import type { Metadata } from 'next';
import { WashGate } from '@/components/WashGate';
import { WashRegisterForm } from '@/components/WashRegisterForm';
import { WASH, iqd } from '@/lib/wash';

export const metadata: Metadata = { title: 'سجّل مغسلتك | المحطة التقنية' };

/** ‎/wash/register/ — تسجيلُ مغسلة. */
export default function WashRegisterPage() {
  return (
    <WashGate>
      <main className="mx-auto max-w-md px-4 pb-24 pt-6">
        <h1 className="text-lg font-extrabold text-brand">سجّل مغسلتك في المحطة التقنية</h1>
        <p className="card mt-3 p-4 text-sm leading-relaxed text-slate-700">
          الاشتراك <b className="text-brand-700">{iqd(WASH.monthlyIqd)}</b> شهريّاً — يُفعَّل بعد التواصل معك،
          والحجزُ مجّانيٌّ للزبائن.
        </p>
        <div className="mt-4">
          <WashRegisterForm />
        </div>
      </main>
    </WashGate>
  );
}
