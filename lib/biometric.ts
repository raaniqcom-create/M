/** قفلُ لوحة المالك بالبصمة أو الوجه — في التطبيق وحده.
 *
 *  ── ما هو وما ليس ────────────────────────────────────────────────────────
 *
 *  ليس دخولاً على الخادم: Supabase لا يعرف مفاتيحَ المرور، والبصمةُ لا تُرسَل
 *  إلى أحد. هو **قفلٌ محلّيٌّ على جلسةٍ محفوظة**: التطبيقُ يحتفظ بالدخول
 *  (`lib/supabase.ts`، المخزنُ الأصليّ)، وعند الفتح يسأل الوجهَ أو البصمة قبل
 *  أن يعرض اللوحة. فشلُها → كلمةُ المرور كما كانت. وطلبُ صاحب المنصّة:
 *  «بعد تسجيل الدخول أريد الدخول بالبصمة أو الوجه لأنّه أسرع لهم».
 *
 *  والموقعُ في المتصفّح لا يملكها — كلُّ دالّةٍ هنا تردّ «لا» خارج التطبيق،
 *  فلا يظهر مفتاحٌ ولا يُسأل أحد.
 *
 *  والإضافةُ تُستورد ديناميكيّاً كما تُستورد `PushNotifications` في
 *  `lib/alerts.ts`: حزمةُ الويب لا تحمل جسراً أصليّاً لا تستعمله. */
import { Preferences } from '@capacitor/preferences';

const KEY = 'bio-lock';

function isNative(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/** أيملك هذا الجهازُ بصمةً أو وجهاً مسجَّلاً؟ */
export async function biometricAvailable(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
    return (await NativeBiometric.isAvailable()).isAvailable;
  } catch {
    return false;
  }
}

/** أمُفعَّلٌ القفل؟ — **مفعَّلٌ افتراضاً** حيث تتوفّر البصمة: هذا ما طُلب،
 *  ومن لا يريده يطفئه من «حسابي». */
export async function biometricLockEnabled(): Promise<boolean> {
  if (!(await biometricAvailable())) return false;
  try {
    const { value } = await Preferences.get({ key: KEY });
    return value !== '0';
  } catch {
    return false;
  }
}

export async function setBiometricLock(on: boolean): Promise<void> {
  try {
    await Preferences.set({ key: KEY, value: on ? '1' : '0' });
  } catch {
    /* بناءٌ قديمٌ بلا الإضافة */
  }
}

/** ── الدخولُ بالوجه: بياناتُ الدخول في خزانة الهاتف ──────────────────────
 *
 *  القفلُ أعلاه يحرس جلسةً قائمة ولا يعيد جلسةً ضاعت — وقد ضاعت لبعض
 *  المحطات («يوجد تسجيلُ خروجٍ للمحطات»). فتُحفظ بياناتُ الدخول في Keychain
 *  على آيفون وKeystore على أندرويد، ولا تُقرأ إلّا بعد الوجه أو البصمة. كلُّ
 *  نداءٍ محروس: بناءٌ قديمٌ بلا الإضافة يعود «لا» ولا يرمي. */
const LOGIN_SERVER = 'muhta.online';

export async function hasSavedLogin(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
    const { isSaved } = await NativeBiometric.isCredentialsSaved({ server: LOGIN_SERVER });
    return isSaved;
  } catch {
    return false;
  }
}

export async function saveLogin(username: string, password: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
    await NativeBiometric.setCredentials({ username, password, server: LOGIN_SERVER });
    return true;
  } catch {
    return false;
  }
}

export async function forgetLogin(): Promise<void> {
  if (!isNative()) return;
  try {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
    await NativeBiometric.deleteCredentials({ server: LOGIN_SERVER });
  } catch {
    /* بناءٌ قديم، أو لا شيءَ محفوظ */
  }
}

/** الوجهُ أو البصمة، ثمّ بياناتُ الدخول — أو null إن رُفض أو لا شيءَ محفوظ. */
export async function loginWithFace(): Promise<{ username: string; password: string } | null> {
  if (!(await verifyOwner())) return null;
  try {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
    const c = await NativeBiometric.getCredentials({ server: LOGIN_SERVER });
    return c?.username && c?.password ? { username: c.username, password: c.password } : null;
  } catch {
    return null;
  }
}

/** يسأل الوجهَ أو البصمة. `true` حين تُقبل — وكلُّ ما سواه رفض. */
export async function verifyOwner(): Promise<boolean> {
  try {
    const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
    await NativeBiometric.verifyIdentity({
      reason: 'لفتح لوحة محطتك',
      title: 'المحطة التقنية',
      subtitle: 'لوحة صاحب المحطة',
      negativeButtonText: 'إلغاء',
      // آيفون: رمزُ القفل احتياطاً حين يُرفض الوجه ثلاثاً.
      useFallback: true,
      fallbackTitle: 'استعمل رمز الهاتف',
      maxAttempts: 3,
    });
    return true;
  } catch {
    return false;
  }
}
