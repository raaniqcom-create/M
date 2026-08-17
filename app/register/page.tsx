import type { Metadata } from 'next';
import { RegisterGate } from '@/components/RegisterGate';

export const metadata: Metadata = {
  title: 'التسجيل في المحطة التقنية',
  description:
    'صاحب محطة؟ سجّل محطتك مجاناً. وإن كنت تريد إشعاراً عند توفّر الوقود فلا تحتاج حساباً — اختر مدينتك ونوع وقودك.',
};

// A dedicated link owners can be sent directly, without landing on a login
// screen first and having to find the signup tab. It forks first: see
// components/RegisterGate.tsx for why the form is not rendered until asked for.
export default function RegisterPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <header className="mb-2 text-center">
        <h1 className="text-xl font-extrabold text-brand">التسجيل في المحطة التقنية</h1>
        <p className="mt-1 text-sm text-slate-500">
          منصة المحطة التقنية — وقود الأنبار
        </p>
      </header>

      <RegisterGate />

      <a href="/login" className="mt-4 block min-h-[44px] pt-3 text-center text-sm font-semibold text-brand">
        لديك حساب؟ سجّل الدخول
      </a>
      <a href="/" className="block min-h-[44px] pt-2 text-center text-sm text-slate-500">
        عرض المحطات
      </a>
    </main>
  );
}
