import type { Metadata } from 'next';
import { StationRegisterForm } from '@/components/StationRegisterForm';

export const metadata: Metadata = {
  title: 'تسجيل محطة',
  description:
    'سجّل محطتك في المحطة التقنية مجاناً وأعلن توفر الوقود لآلاف المستخدمين في الأنبار.',
};

// A dedicated link owners can be sent directly, without landing on a login
// screen first and having to find the signup tab.
export default function RegisterPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <header className="mb-4 text-center">
        <h1 className="text-xl font-extrabold text-brand">سجّل محطتك مجاناً</h1>
        <p className="mt-1 text-sm text-slate-500">
          منصة المحطة التقنية — وقود الأنبار
        </p>
      </header>

      {/* Five people registered the same station under five phone numbers, and
          two more registered under their own names. They were not confused
          about the form — they were answering the question they arrived with:
          "how do I hear when this station has fuel?" The form never told them
          it was asking something else, so it has to say so first, and it has to
          offer the thing they actually wanted before it asks for anything. */}
      <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
        <p className="text-sm font-extrabold text-amber-900">
          هذه الصفحة لأصحاب المحطات فقط
        </p>
        <p className="mt-2 text-xs leading-relaxed text-amber-900">
          لا تسجّل هنا إن كنت تريد أن يصلك إشعار عند توفّر الوقود — التسجيل هنا يعني
          أنك <b>تملك محطة</b> وتريد أن تعلن توفّرك عليها للناس.
        </p>
      </section>

      <section className="card mt-3 border-brand-100 p-5 text-center">
        <p className="text-sm font-bold">تريد أن يصلك إشعار عند توفّر الوقود؟</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          لا تحتاج حساباً ولا تسجيلاً. اختر مدينتك ونوع الوقود، فيصلك الإشعار لحظة
          تعلن أي محطة في مدينتك.
        </p>
        <a href="/alerts" className="btn-primary mt-4 w-full">
          اختر مدينتك ونوع وقودك
        </a>
      </section>

      <p className="mt-6 text-center text-xs font-bold text-slate-500">
        أنا صاحب محطة — أكمل التسجيل
      </p>

      <div className="mt-2">
        <StationRegisterForm />
      </div>

      <a href="/login" className="mt-4 block min-h-[44px] pt-3 text-center text-sm font-semibold text-brand">
        لديك حساب؟ سجّل الدخول
      </a>
      <a href="/" className="block min-h-[44px] pt-2 text-center text-sm text-slate-500">
        عرض المحطات
      </a>
    </main>
  );
}
