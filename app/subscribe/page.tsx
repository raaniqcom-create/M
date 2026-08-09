import type { Metadata } from 'next';
import { SubscribeForm } from '@/components/SubscribeForm';

export const metadata: Metadata = {
  title: 'اشترك بالعروض | المحطة التقنية',
  description: 'سجّل رقمك ليصلك خبر توفر الوقود والعروض في مدينتك.',
};

export default function SubscribePage() {
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <header className="mb-6 text-center">
        <h1 className="text-xl font-extrabold">اشترك بالعروض</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          للسائقين والمواطنين — يصلك خبر توفر الوقود والعروض في مدينتك.
          لا حساب ولا كلمة مرور، رقمك فقط.
        </p>
      </header>

      <SubscribeForm />

      <p className="mt-4 px-2 text-center text-xs leading-relaxed text-slate-400">
        رقمك لا يُنشر ولا يُشارك مع أي جهة، ويُستخدم لإرسال ما اشتركت به وحده.
      </p>

      <a href="/" className="btn-ghost mt-4 w-full">
        العودة للصفحة الرئيسية
      </a>
    </main>
  );
}
