/** معرّفٌ عشوائي يعمل على كل جهاز، لا على الحديث وحده.
 *
 *  crypto.randomUUID غائبة عن iOS دون 15.4، وغائبة عن كل سياقٍ غير آمن (http
 *  أو WebView قديم). ونداؤها بلا حارس يرمي TypeError — وحين يقع ذلك داخل
 *  useEffect في React 18 تُفكَّك الشجرة كلها: شاشةٌ بيضاء لا رسالة فيها.
 *
 *  وكان الحارس مكتوباً في موضع (StationAnnouncePanel) ومنسيّاً في أربعة.
 *  فواحدٌ يُستدعى، لا خمسة تتباعد.
 *
 *  والبديل ليس عشوائياً بجودة التشفير، ولا يحتاج أن يكون: هذه المعرّفات
 *  تُميّز جهازاً عن جهاز وقناةً عن قناة، ولا يُبنى عليها سرّ. */
export function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // getRandomValues أقدم بكثير من randomUUID، وتغطّي أجهزةً تسقط عنها الثانية.
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    }
  } catch {
    /* يسقط إلى الأخير */
  }
  // آخر ملاذ: لا تشفير، لكن لا خطأ. وشاشةٌ تعمل بمعرّفٍ ضعيف خيرٌ من بيضاء.
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
