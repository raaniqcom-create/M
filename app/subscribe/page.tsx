import type { Metadata } from 'next';
import { SubscribeForm } from '@/components/SubscribeForm';

export const metadata: Metadata = {
  title: 'اشترك بالعروض',
  description: 'سجّل رقمك ليصلك خبر توفر الوقود والعروض في مدينتك.',
};

export default function SubscribePage() {
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <header className="mb-6 text-center">
        <h1 className="text-xl font-extrabold">اشترك بالعروض</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          للمستخدمين والمواطنين — يصلك خبر توفر الوقود والعروض في مدينتك.
          لا حساب ولا كلمة مرور، رقمك فقط.
        </p>
      </header>

      <SubscribeForm />

      <p className="mt-4 px-2 text-center text-xs leading-relaxed text-slate-400">
        رقمك لا يُنشر ولا يُباع، ويُستخدم لإرسال ما اشتركت به وحده — عبر مزوّد الرسائل
        فقط. يمكنك إيقاف الرسائل متى شئت.
      </p>

      <a href="/" className="btn-ghost mt-4 w-full">
        العودة للصفحة الرئيسية
      </a>
    </main>
  );
}
