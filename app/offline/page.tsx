export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="text-lg font-extrabold text-brand">لا يوجد اتصال بالإنترنت</h1>
      <p className="mt-2 text-sm text-slate-500">
        تحتاج المنصة للاتصال لعرض آخر تحديثات المحطات. تحقق من الشبكة ثم أعد المحاولة.
      </p>
    </main>
  );
}
