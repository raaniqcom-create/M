import type { Metadata } from 'next';
import { StationRegisterForm } from '@/components/StationRegisterForm';

export const metadata: Metadata = {
  title: 'تسجيل محطة',
  description:
    'سجّل محطتك في المحطة التقنية مجاناً وأعلن توفر الوقود لآلاف السائقين في الأنبار.',
};

// A dedicated link owners can be sent directly, without landing on a login
// screen first and having to find the signup tab.
export default function RegisterPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <header className="mb-6 text-center">
        <h1 className="text-xl font-extrabold text-brand">سجّل محطتك مجاناً</h1>
        <p className="mt-1 text-sm text-slate-500">
          منصة المحطة التقنية — وقود الأنبار
        </p>
      </header>

      <StationRegisterForm />

      <a href="/login" className="mt-4 block min-h-[44px] pt-3 text-center text-sm font-semibold text-brand">
        لديك حساب؟ سجّل الدخول
      </a>
      <a href="/" className="block min-h-[44px] pt-2 text-center text-sm text-slate-500">
        عرض المحطات
      </a>
    </main>
  );
}
