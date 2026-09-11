import { createClient } from '@supabase/supabase-js';
import { Preferences } from '@capacitor/preferences';

// A hanging request never settles, so callers' .catch() never runs and the UI
// spins forever — the normal case on a weak mobile connection. Time every
// request out here rather than at each call site.
const REQUEST_TIMEOUT_MS = 12000;

// AbortSignal.timeout only exists from iOS 16. On an older iPhone the call
// below threw before the request was ever made, so every query failed at once
// — and the one screen that has no error state for it, the station list, sat
// on a spinner. This falls back to the controller that has always existed.
export function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  if (typeof AbortController === 'undefined') return undefined;
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

/** أفي التطبيق الأصليّ نحن؟ — القراءةُ نفسُها التي في `lib/alerts.ts`. */
function isNative(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/** ــ مخزنُ الجلسة: في التطبيق مخزنٌ أصليّ، وفي المتصفّح localStorage ــــــ
 *
 *  `localStorage` داخل WKWebView يُمسح بعد أسبوعٍ من غير استعمالٍ (ITP) وعند
 *  ضيق التخزين — فيفتح صاحبُ المحطة تطبيقَه فيجد نموذجَ الدخول بلا سببٍ يراه.
 *  و`Preferences` هي UserDefaults على آيفون وSharedPreferences على أندرويد،
 *  ولا تُمسّ إلّا بحذف التطبيق.
 *
 *  ويُكتب في الاثنين معاً على المنصّة الأصليّة: الأصليُّ هو الباقي، والمتصفّحيُّ
 *  هو ما تقرؤه الرئيسةُ قراءةً متزامنةً لتحجب القائمةَ عمّن معه جلسة
 *  (`app/page.tsx`). وجلسةٌ حُفظت قبل هذا التحديث في localStorage وحدَه تُقرأ
 *  منه احتياطاً فتُنسخ إلى الأصليّ من نفسِها — فلا يُخرَج أحدٌ بالتحديث.
 *  والمتصفّحُ لا يمرّ بالجسر أصلاً: `Preferences` على الويب تلتفّ على
 *  localStorage بلا زيادة. */
const sessionStore = {
  async getItem(key: string): Promise<string | null> {
    if (typeof localStorage === 'undefined') return null;
    if (!isNative()) return localStorage.getItem(key);
    const { value } = await Preferences.get({ key });
    if (value !== null) return value;
    const legacy = localStorage.getItem(key);
    if (legacy !== null) await Preferences.set({ key, value: legacy });
    return legacy;
  },
  async setItem(key: string, value: string): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
    if (isNative()) await Preferences.set({ key, value });
  },
  async removeItem(key: string): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
    if (isNative()) await Preferences.remove({ key });
  },
};

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      // Stated rather than left to defaults: the shells are WebViews, and a
      // session that silently fails to persist means the owner signs in again
      // every single time they open the app.
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'muhta-auth',
      storage: sessionStore,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: init?.signal ?? timeoutSignal(REQUEST_TIMEOUT_MS) }),
    },
  }
);

/** ــ الجلسةُ لا تحبس القراءةَ العامّة ــــــــــــــــــــــــــــــــــــــ
 *
 *  **مهلةُ الطلب أعلاه لا تحرس هذا.** كلُّ نداء PostgREST يمرّ بـ`fetchWithAuth`
 *  في supabase-js، وأوّلُ سطرٍ فيه `await getAccessToken()` — أي أنّ العميل
 *  ينتظر جوابَ `auth.getSession()` **قبل** أن يبني الطلب. فإن علِقت الجلسة لم
 *  يُرسَل طلبٌ أصلاً، ولم تُعلَّق عليه إشارةُ المهلة، ولم يعمل `catch`: لا قبولٌ
 *  ولا رفض، إلى أن تُغلق الصفحة.
 *
 *  وقع هذا وصُوِّر في ٢٠٢٦-٠٩-٠٨: `/schedule` على مغزلٍ لا ينتهي، والرئيسةُ
 *  تعرض لقطةً عمرُها ثماني ساعات وتقول «الاتصال منقطع»، وبندُ «حسابي» في
 *  القائمة **عنوانٌ بلا محتوى** — وهذا الثالثُ هو الدليل القاطع: `useSession`
 *  لا تعبر `getSession()`، وزائرٌ بلا جلسةٍ لا شبكةَ في طريقه إطلاقاً. فالعُلقةُ
 *  في قراءة الجلسة نفسِها، والخادمُ في اللحظة نفسِها يجيب في نصف ثانية.
 *
 *  ── ولماذا «لا جلسة» لا «خطأ» ───────────────────────────────────────────
 *
 *  لأنّ ما تعرضه المنصّةُ للناس لا يحتاج جلسةً أصلاً: المحطاتُ والمنتجاتُ
 *  والجدولُ تُقرأ بمفتاح anon. فحين تتأخّر الجلسةُ فوق الحدّ يُمضى بلا توكن —
 *  فتصل البياناتُ العامّة. وصاحبُ المحطة لا يُنسى: `onAuthStateChange` يُعيد
 *  القراءةَ حين يصل الجوابُ الحقيقي، فتعود لوحتُه وحدَها.
 *
 *  والنداءُ الأصليّ لا يُلغى — يُترك يكمل ليملأ حالةَ العميل الداخليّة؛ وإنّما
 *  لا يُنتظَر إلى الأبد. */
const SESSION_TIMEOUT_MS = 5000;

{
  const real = supabase.auth.getSession.bind(supabase.auth);
  type SessionResult = Awaited<ReturnType<typeof real>>;
  const none = { data: { session: null }, error: null } as unknown as SessionResult;

  supabase.auth.getSession = () =>
    Promise.race([
      real(),
      new Promise<SessionResult>((resolve) => setTimeout(() => resolve(none), SESSION_TIMEOUT_MS)),
    ]).catch(() => none);
}
