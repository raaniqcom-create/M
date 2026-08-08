import type { Metadata } from 'next';
import { ResetForm } from '@/components/ResetForm';

export const metadata: Metadata = {
  title: 'استعادة كلمة المرور | المحطة التقنية',
  description: 'استعد الدخول إلى لوحة محطتك على المحطة التقنية عبر رمز يصلك برسالة.',
};

export default function ResetPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <header className="mb-6 text-center">
        <h1 className="text-xl font-extrabold">نسيت كلمة المرور</h1>
        {/* Accounts are keyed by phone, not email — there is no inbox to send a
            link to, so the SMS is the whole recovery path. */}
        <p className="mt-1 text-sm text-slate-500">
          حسابك مرتبط برقم هاتف المحطة، لذا نتحقّق منه برسالة قصيرة.
        </p>
      </header>

      <ResetForm />

      <a href="/login" className="btn-ghost mt-4 w-full">
        العودة لتسجيل الدخول
      </a>
    </main>
  );
}
