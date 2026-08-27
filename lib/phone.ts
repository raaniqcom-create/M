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
