// Station owners sign in with their phone number. Supabase auth keys on an
// email address, so the phone is normalised to a stable synthetic address.
// Normalising matters: 07901234567, 7901234567 and +9647901234567 are the same
// person, and an owner who signs up one way must be able to log in the other.
export function normalizePhone(input: string): string {
  // strip the international prefix before the country code, so 00964… and
  // +964… reduce the same way
  let digits = input.replace(/\D/g, '').replace(/^00/, '');
  if (digits.startsWith('964')) digits = digits.slice(3);
  return digits.replace(/^0+/, '');
}

export function phoneToEmail(input: string): string {
  return `p${normalizePhone(input)}@muhta.app`;
}

// Iraqi mobile numbers are 10 digits after the leading zero is dropped (7XXXXXXXXX)
export function isValidIraqiMobile(input: string): boolean {
  const n = normalizePhone(input);
  return /^7\d{9}$/.test(n);
}

export function displayPhone(input: string): string {
  const n = normalizePhone(input);
  return n ? `0${n}` : '';
}

// A WhatsApp chat with the greeting already typed, so reaching a station owner
// is one tap from wherever their name is shown instead of copy, switch app,
// paste, and write the same opening line again.
//
// wa.me wants the full international form: country code, no plus, no leading
// zero — which is exactly what normalizePhone leaves behind.
export function whatsappLink(phone: string, name?: string | null): string {
  const n = normalizePhone(phone);
  if (!n) return '';
  const who = (name ?? '').trim();
  const text = `السلام عليكم ${who}\nأنا من إدارة المحطة التقنية: `;
  return `https://wa.me/964${n}?text=${encodeURIComponent(text)}`;
}

/** رسالةُ التحقّق من صفة مقدّم الطلب — قبل الاعتماد.
 *
 *  **لأن الحسابين مختلفان والطالب لا يعرف الفرق.**
 *
 *  من يريد إشعاراً لا يحتاج حساباً أصلاً: يفتح الصفحة ويختار مدينته ونوع
 *  وقوده، فيصله الخبر مجّاناً. ومن يسجّل محطةً يتحمّل التزاماً: أن يُحدّث
 *  التوفّر أوّلاً بأوّل، لأن الناس يقطعون الطريق بناءً على ما يُعلنه — فإن
 *  لم يُحدَّث صار الإعلانُ ضرراً لا نفعاً.
 *
 *  فالسؤالُ يُطرح مرّةً واحدة بخيارين لا بشرحٍ طويل: من يقرأ رسالةً على
 *  هاتفه يجيب على سؤالٍ ولا يقرأ لائحة. */
/** رقمُ إدارة المنصّة على واتساب — كما في صفحة «من نحن». */
export const ADMIN_WA = '9647844446633';

/** «استلمنا طلبكم» — تُطلب التفاصيلُ التي ضاعت، ويُعتذر عن العطب.
 *
 *  نصُّ صاحب المنصّة كما أملاه (١٩ أيلول)، مصحَّحاً في ثلاثة مواضعَ إملائيّة
 *  وحدَها: «أسم»←«اسم»، «نرجوا»←«نرجو»، «نتعذر»←«نعتذر».
 *
 *  ── وثلاثةُ حقولٍ لا أكثر ───────────────────────────────────────────────
 *
 *  الاسمُ والعنوانُ والمسؤول. أمّا الموقعُ ونوعُ الوقود ودوامُ المحطة فتأتي
 *  حين يُكمل هو تسجيلَه — وسؤالُه عنها الآن في رسالةٍ يُطيلها فلا تُقرأ.
 *
 *  والحقولُ تُترك فارغةً بنقطتين: من يردّ يكتب بعدها في السطر نفسِه، فيعود
 *  الجوابُ مرتَّباً يُنسخ إلى الطلب كما هو. */
export function whatsappRequestDetails(phone: string): string {
  const n = normalizePhone(phone);
  if (!n) return '';
  const text =
    `استلمنا طلبكم للانضمام إلى المحطة التقنية\n\n` +
    `كان هنالك خلل بالتسجيل، نرجو إعطاءنا التالي:\n\n` +
    `اسم المحطة : \n` +
    `عنوانها : \n` +
    `اسم الشخص المسؤول : \n\n` +
    `وسوف نرسل لكم حسابكم ويتم التفعيل، ونعتذر عن الخلل.`;
  return `https://wa.me/964${n}?text=${encodeURIComponent(text)}`;
}

/** الإدارةُ تُلاحق تسجيلاً لم يكتمل بسبب عطبٍ عندنا.
 *
 *  **ولا يُطلب منه رقمٌ جديدٌ ولا كلمةُ مرورٍ جديدة.** حسابُه أُنشئ فعلاً
 *  ونجح دخولُه؛ الذي سقط إدراجُ المحطة وحدَه — والاستمارةُ فيها مسلكٌ يلتقط
 *  الحسابَ اليتيمَ ويُكمل ما انقطع. فيكفي أن يُعيد التسجيل بما أدخله أوّلَ مرّة.
 *
 *  والاعتذارُ يُقال صراحةً: العطبُ عندنا لا عنده، ومن ردّته شاشةُ خطأٍ مرّةً
 *  لا يعود إلّا أن يُطمأن. */
export function whatsappResumeRegistration(phone: string): string {
  const n = normalizePhone(phone);
  if (!n) return '';
  const text =
    `السلام عليكم ورحمة الله\n\n` +
    `أنا من إدارة «المحطة التقنية». وصلَنا طلبُ تسجيل محطتكم، وكان عندنا خللٌ تقنيٌّ منع اكتماله — وقد أُصلح، ونعتذر عن التأخير.\n\n` +
    `تفضّل أكمِل التسجيل من:\nhttps://muhta.online/register\n\n` +
    `واستعمل الرقمَ وكلمةَ المرور نفسَها التي أدخلتَها سابقاً — سيُكمل ما انقطع مباشرةً، ولا حاجةَ إلى حسابٍ جديد.`;
  return `https://wa.me/964${n}?text=${encodeURIComponent(text)}`;
}

/** الزائرُ يدّعي محطةً مسجّلة: يفتح محادثةً مع الإدارة والرسالةُ جاهزة. */
export function whatsappClaimStation(station: string, city: string): string {
  const text =
    `السلام عليكم ورحمة الله\n\n` +
    `أنا صاحب محطة «${station}» — ${city}، وهي مسجّلة في «المحطة التقنية» بحسابٍ ليس لي. ` +
    `أريد استلامها ليكون تحديثُ توفّر الوقود من رقمي هذا.\n\n(أرسلتُ هذه الرسالة من رقم المحطة.)`;
  return `https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(text)}`;
}

/** الإدارةُ تردّ على طلبٍ لمحطةٍ موجودة: «تابعها من هنا» — ورابطُ صفحتها. */
export function whatsappFollowInstead(
  phone: string,
  name: string | null | undefined,
  station: string,
  link: string
): string {
  const n = normalizePhone(phone);
  if (!n) return '';
  const who = (name ?? '').trim();
  const text =
    `السلام عليكم ورحمة الله${who ? '، ' + who : ''}\n\n` +
    `نحن إدارة «المحطة التقنية». وصلَنا طلبُك لتسجيل «${station}»، وهذه المحطة مسجّلةٌ عندنا بالفعل، ` +
    `وصاحبُها هو من يُحدّث توفّر الوقود فيها.\n\n` +
    `*فلا تحتاج حساباً لتصلك أخبارها.* افتح صفحتها واضغط «تابع هذه المحطة»، يصلك إشعارٌ فور توفّر الوقود — مجّاناً وبلا تسجيل:\n${link}\n\n` +
    `وإن كنت أنت صاحبَ المحطة فعلاً فأجبنا هنا بكلمة «صاحبها» لننقلها إلى رقمك.\n\nشكراً لك.`;
  return `https://wa.me/964${n}?text=${encodeURIComponent(text)}`;
}

export function whatsappVerifyRole(
  phone: string,
  name?: string | null,
  station?: string | null,
  city?: string | null
): string {
  const n = normalizePhone(phone);
  if (!n) return '';
  const who = (name ?? '').trim();
  const what = [station?.trim(), city?.trim()].filter(Boolean).join(' — ');
  const text =
    `السلام عليكم ورحمة الله${who ? '، ' + who : ''}

` +
    `نحن إدارة «المحطة التقنية». وصلَنا طلبُ تسجيل` +
    (what ? ` «${what}»` : ' محطتكم') +
    `، ونريد التأكّد من أمرٍ واحد قبل الاعتماد:

` +
    `*هل أنت من إدارة المحطة نفسها؟*

` +
    `لأن حساب المحطة ليس حسابَ متابعة. صاحبُه يُحدّث توفّر الوقود أوّلاً بأوّل، ` +
    `والناس يقطعون الطريق بناءً على ما يُعلنه — فإن لم يُحدَّث صار الإعلانُ ضرراً لا نفعاً.

` +
    `أجبنا بواحدة:
` +
    `1 — نعم، أنا من إدارة المحطة وألتزم بتحديث التوفّر.
` +
    `2 — لا، أريد استلام الإشعارات فقط.

` +
    `وإن كان جوابك الثاني فلا تحتاج حساباً أصلاً: افتح التطبيق واختر مدينتك ونوع وقودك، ` +
    `فيصلك الإشعار مجّاناً وبلا تسجيل.

` +
    `وبانتظار ردّك لنُكمل طلبك. شكراً لك.`;
  return `https://wa.me/964${n}?text=${encodeURIComponent(text)}`;
}

/** رسالةُ التحقّق من موضع الدبّوس — حين يبعد عن كل محطةٍ معروفة.
 *
 *  لا تُتّهم: أكثرُ من وقع في هذا وضع موقعَه هو بحسن نيّة، وبعضُهم محطتُه
 *  حقّاً في مكانٍ لا تعرفه الخرائط. فيُسأل ويُعرض الإصلاحُ في الرسالة نفسها. */
export function whatsappVerifyLocation(
  phone: string,
  name?: string | null,
  station?: string | null
): string {
  const n = normalizePhone(phone);
  if (!n) return '';
  const who = (name ?? '').trim();
  const text =
    `السلام عليكم ورحمة الله${who ? '، ' + who : ''}

` +
    `نحن إدارة «المحطة التقنية». طلبُ تسجيل` +
    (station ? ` «${station.trim()}»` : ' محطتكم') +
    ` وصلَنا، لكنّ الموقع المحدَّد على الخريطة لا تقع قربه محطةُ وقودٍ نعرفها.

` +
    `*هل الموقع الذي حدّدتَه هو موقع المحطة؟*

` +
    `أحياناً يُضغط زرُّ الموقع والشخصُ في بيته، فيُسجَّل البيتُ بدل المحطة — والناس ` +
    `يقصدون هذا الموقع، فلو كان خطأً وصلوا إلى غير محطتك.

` +
    `ولتصحيحه — وأنت داخل المحطة — افتح التطبيق، ادخل بحسابك، واضغط *تحديث العنوان* ` +
    `في صفحة محطتك. أو أرسل لنا موقعك عبر واتساب وأنت فيها.

` +
    `وإن كان صحيحاً فأخبرنا ونُكمل الاعتماد. شكراً لك.`;
  return `https://wa.me/964${n}?text=${encodeURIComponent(text)}`;
}
