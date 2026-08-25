/** ذيل الصفحة — الشعار ثم من صنعه.
 *
 *  كان سطراً نصّياً وحده. والشعار هنا ليس زينة: أكثر من ثلثي مستخدمي المنصّة
 *  وصلوا إليها من رابطٍ في مجموعة واتساب، ولا يعرفون من وراءها. وذيلٌ يقول
 *  «صنع في الأنبار» يجيب هذا السؤال بلا أن يسأله أحد. */
export function SiteFooter() {
  return (
    <footer className="mt-8 border-t border-slate-100 pt-5 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/anbar-footer.webp"
        alt="صنع في الأنبار"
        loading="lazy"
        decoding="async"
        className="mx-auto w-[88%] max-w-[268px]"
      />
      <p className="mt-2 text-[11.5px] font-bold leading-relaxed text-slate-500">
        فكرة وتنفيذ وبرمجة أحمد الرفاعي
      </p>
    </footer>
  );
}
