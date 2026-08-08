# Google Play — نصوص جاهزة للصق

كل ما في هذا الملف منسوخ كما هو إلى Play Console.
المسار: **Play Console ← تطبيقك ← Grow ← Store presence ← Main store listing**

---

## اسم التطبيق (App name)
الحد ٣٠ حرفاً

```
المحطة التقنية
```

بلا «الأنبار»: الاسم ثابت لا يتغيّر في ذهن المستخدم، والتوسّع لبقية العراق لاحقاً
لا يحتمل اسماً يحصر المنصة بمحافظة. الأنبار تبقى في الوصف، والوصف يُعدَّل متى شئنا.

## Package name
لا يُغيَّر بعد الإنشاء، ويجب أن يطابق ملف AAB و Firebase و assetlinks.json

```
online.muhta.app
```

## الوصف المختصر (Short description)
الحد ٨٠ حرفاً — يظهر تحت الاسم مباشرة

```
اعرف أي محطة يتوفر فيها الوقود الآن في الأنبار، وحالة الازدحام مباشرة.
```

## الوصف الكامل (Full description)
الحد ٤٠٠٠ حرف

```
المحطة التقنية — منصة وقود الأنبار

تطبيق مجاني يوفّر عليك الوقت والوقود. بدل أن تدور بين المحطات وتقف في طوابير قد تنتهي بلا فائدة، اعرف قبل أن تتحرك: أي محطة فيها وقود الآن، وأي نوع، وكم الازدحام فيها.

⛽ ما الذي يتوفر الآن
شاهد المحطات التي أعلنت توفر البانزين العادي والمحسن، والكاز، والغاز، و LPG، والنفط الأبيض — محدَّثة لحظياً من أصحاب المحطات أنفسهم.

📍 أقرب محطة إليك
رتّب المحطات حسب قربها من موقعك، أو تصفّحها على الخريطة. موقعك يُستخدم على جهازك فقط ولا يُرسل إلى أي مكان.

🚦 حالة الازدحام
السائقون الموجودون في المحطة يصوّتون بلون واحد: أخضر للطابور الخفيف، أصفر للمتوسط، أحمر للمزدحم. لا تعليقات ولا نقاشات — معلومة واحدة واضحة.

🔔 تنبيه فور وصول الوقود
اختر محطاتك المفضلة، ويصلك إشعار فوري لحظة إعلانها توفر الوقود.

🏙️ كل مدن الأنبار
الرمادي، الفلوجة، هيت، حديثة، عانة، راوة، القائم، الرطبة، الحبانية، الخالدية، عامرية الفلوجة، الكرمة، البغدادي، الحقلانية، بروانة، النخيب.

🏪 لأصحاب المحطات
سجّل محطتك مجاناً، وحدّث توفر المنتجات بضغطة واحدة. كلما كانت معلوماتك دقيقة، زاد اعتماد السائقين عليك.

✅ مجاني بالكامل
لا اشتراك، ولا حساب مطلوب للتصفح، ولا إعلانات مزعجة، ولا جمع لبياناتك الشخصية.

الموقع: muhta.online
```

---

## البيانات الأساسية

| الحقل | القيمة |
|---|---|
| App category | Maps & Navigation |
| Tags | Fuel, Navigation, Local |
| Email | (بريدك) |
| Website | https://muhta.online |
| Privacy policy | https://muhta.online/privacy |

---

## Data safety — نموذج أمان البيانات

**Play Console ← Policy ← App content ← Data safety**

| السؤال | الجواب |
|---|---|
| Does your app collect or share user data? | **Yes** |
| Is all data encrypted in transit? | **Yes** |
| Do you provide a way to delete data? | **Yes** — https://muhta.online/privacy |

### أنواع البيانات — علّم هذه فقط

**Location → Approximate location**
- Collected: **No**
- Shared: No
- سبب عدم التعليم: الموقع يُستخدم على الجهاز فقط لترتيب المحطات، ولا يُرسل للخادم

**Personal info → Name**
- Collected: **Yes** (لأصحاب المحطات فقط)
- Shared: **No**
- Processed ephemerally: No
- Required: Optional — للتصفح لا يلزم
- Purpose: **App functionality**

**Personal info → Phone number**
- Collected: **Yes** (لأصحاب المحطات فقط)
- Shared: **No**
- Required: Optional
- Purpose: **App functionality, Account management**

**App activity → Other user-generated content**
- Collected: **Yes** (تصويت الازدحام باللون)
- Shared: **No**
- Purpose: **App functionality**

**Device or other IDs**
- Collected: **Yes** (معرّف الإشعارات)
- Shared: **No**
- Purpose: **App functionality**

> لا تعلّم: Financial info, Health, Messages, Photos, Contacts, Search history, Installed apps

---

## Content rating — تصنيف المحتوى

**Play Console ← Policy ← App content ← Content ratings**

| السؤال | الجواب |
|---|---|
| Category | **Utility, Productivity, Communication or Other** |
| Violence / Sexual / Language / Controlled substances | **No** لكل الأسئلة |
| Does the app allow users to interact? | **No** — التصويت بالألوان ليس تواصلاً |
| Does it share user location with other users? | **No** |
| Does it allow purchase of digital goods? | **No** |

النتيجة المتوقعة: **Everyone / 3+**

---

## App access — وصول المراجع

المراجع يحتاج حساباً ليرى لوحة صاحب المحطة، وإلا سيرى الواجهة العامة فقط.

**Play Console ← Policy ← App content ← App access ← All functionality requires special access**

| الحقل | القيمة |
|---|---|
| Name of instructions | لوحة صاحب المحطة |
| Username | (أنشئ حساب محطة تجريبي وضع رقمه) |
| Password | (كلمة مروره) |
| Any other instructions | افتح muhta.online/login وسجّل الدخول برقم الهاتف وكلمة المرور أعلاه لرؤية لوحة تحديث توفر الوقود. باقي التطبيق مفتوح بلا حساب. |

⚠️ أنشئ هذا الحساب التجريبي **قبل** الإرسال، وإلا رُفض التطبيق.

---

## الملفات الجاهزة في مجلد store/

| الملف | الاستخدام | المقاس |
|---|---|---|
| `icon-512.png` | App icon | ٥١٢×٥١٢ ✅ |
| `feature-graphic.png` | Feature graphic | ١٠٢٤×٥٠٠ ✅ |

---

## اللقطات — جاهزة في `store/screenshots/`

ست لقطات ١٠٨٠×١٩٢٠، ارفعها **بهذا الترتيب** لأن Play يعرضها بترتيب الرفع:

| # | الملف | ما تُظهره |
|---|---|---|
| ١ | `store-1-cover.png` | غلاف: الاسم والشعار وثلاث مزايا |
| ٢ | `store-2-home.png` | الرئيسية: لوحة المنتجات وبطاقة محطة |
| ٣ | `store-3-map.png` | الخريطة ومواقع المحطات |
| ٤ | `store-4-traffic.png` | تصويت الازدحام بالألوان |
| ٥ | `store-5-alerts.png` | المفضلة وتنبيه التوفر |
| ٦ | `store-6-cta.png` | دعوة للتحميل |

**الشروط التي تحققها:** PNG · ١٠٨٠ بكسل عرضاً · نسبة ٩:١٦ ✅

⚠️ استبدل ٢ و ٣ و ٤ بلقطات هاتف حقيقية **بعد** تسجيل محطات فعلية. اللقطات الحالية
ترسم الواجهة الحقيقية بألوانها ونصوصها، لكن لقطة الهاتف تبقى أصدق وأقل عرضة للاعتراض.

---

## ترتيب العمل

1. Create app ← الاسم أعلاه ← Package name `online.muhta.app` ← العربية ← App ← Free
2. **App content** (القائمة اليسرى ← Policy): Privacy policy، App access، Ads، Content rating، Target audience، Data safety، Government apps، Financial features
3. **Store listing**: الوصفان أعلاه + `icon-512.png` + `feature-graphic.png` + اللقطات الست
4. **Store settings**: Category = Maps & Navigation، بريد التواصل
5. Test and release ← **Production** ← Create new release ← ارفع **muhta.aab**
6. أرسل للمراجعة (من يوم إلى أسبوع)

لاحقاً، بعد تسجيل محطات حقيقية: استبدل اللقطات ٢–٤ بلقطات من هاتفك.

---

## نقطة قد تعطّلك

حسابات المطوّرين الفردية المسجّلة بعد نوفمبر ٢٠٢٣ تُلزَم باختبار مغلق مع **١٢ مختبراً لمدة ١٤ يوماً** قبل النشر العام.

تحقق من: **Play Console ← Policy ← App content**. إن ظهر لك هذا الشرط فستحتاج ١٢ شخصاً يثبّتون التطبيق أسبوعين.

حسابات الشركات معفاة، وكذلك الحسابات الأقدم من ذلك التاريخ.
