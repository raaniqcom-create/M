// يفتح حساباً للوحة الفرع، أو يبدّل كلمته، أو يسحب صلاحيته.
//
//   node scripts/add-branch-viewer.mjs anbar1 Ahmed111 "فرع الأنبار — التوزيع"
//   node scripts/add-branch-viewer.mjs --password anbar1 كلمةٌ-جديدة
//   node scripts/add-branch-viewer.mjs --remove anbar1
//   node scripts/add-branch-viewer.mjs --list
//
// **اسمُ جهةٍ لا اسمُ شخص.** الحسابُ يبقى بعد أن يُنقل الموظّف، والكلمةُ
// تُبدَّل بأمرٍ واحد بدل أن يُفتح حسابٌ لكلِّ من يخلفه.
//
// وثمنُه معلوم: حسابٌ مشترَكٌ لا يقول مَن دخل، إنما يقول أنّ الفرعَ دخل.
// وهو مقبولٌ هنا لأن اللوحةَ قراءةٌ فقط، وكلُّ ما تعرضه مقروءٌ لغير المسجَّل
// أصلاً (stations_public وstation_products وجدولا الازدحام). ولو صار للوحة
// زرٌّ يكتب في القاعدة، وجب حسابٌ لكلِّ شخص.
//
// **سكربتٌ لا واجهةُ إدارة.** المستفيدون واحدٌ إلى خمسة، مرّةً واحدة.
// والسحبُ يحذف صفَّ `branch_viewers` ولا يحذف الحساب.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    // autoRefreshToken يترك مؤقّتاً حيّاً، فيصطدم process.exit به على ويندوز
    // بتأكيدٍ من libuv وخروجٍ بـ127 — يقرأه من يُشغّل السكربت فشلاً وليس بفشل.
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

const normalizePhone = (raw) => {
  let d = String(raw).replace(/\D/g, "").replace(/^00/, "");
  if (d.startsWith("964")) d = d.slice(3);
  return d.replace(/^0+/, "");
};

/** **مرآةُ app/login/page.tsx:25-30 — والمطابقةُ ليست تجميلاً.**
 *
 *  الحسابُ يُسكّ هنا ويُقرأ هناك؛ فلو اختلف الحرفُ الواحد فُتح حسابٌ على
 *  عنوانٍ لا يصل إليه أحدٌ من الباب، والخطأُ يظهر بعد التسليم لا قبله.
 *  ولذلك يفحص scripts/test-branch-identity.mjs النسختين معاً.
 *
 *  والقاعدةُ ثلاثةُ فروع: بريدٌ كامل يُترك، وما كان أرقاماً وعلاماتِ هاتفٍ
 *  يُقرأ رقماً، وما سواه اسمُ مستخدم. */
const toEmail = (value) =>
  value.includes("@")
    ? value
    : /^[0-9+\s()-]+$/.test(value)
      ? `p${normalizePhone(value)}@muhta.app`
      : `${value.toLowerCase()}@muhta.app`;

/** واسمُ المستخدم يُقيَّد بما يُملى في الهاتف بلا التباس: حروفٌ لاتينية
 *  صغيرة وأرقامٌ وثلاثُ علامات. والمنعُ الأهمّ أن يشبه صيغةَ الهاتف
 *  (p ثمّ أرقام) — فيصطدم حسابُ جهةٍ بحساب صاحب محطة. */
function badUsername(raw) {
  if (/^[0-9+\s()-]+$/.test(raw)) return null; // رقمُ هاتف، مسارٌ آخر
  const u = raw.toLowerCase(); // يُصغَّر كما تُصغّره صفحةُ الدخول
  if (!/^[a-z0-9._-]{3,32}$/.test(u))
    return "اسم المستخدم: حروف وأرقام لاتينية و. _ - فقط، من 3 إلى 32 حرفاً.";
  if (/^p\d+$/.test(u))
    return "اسم المستخدم على صيغة «p» متبوعةً بأرقام محجوزٌ لحسابات الهواتف.";
  return null;
}

const label = (value) =>
  value.includes("@")
    ? value
    : /^[0-9+\s()-]+$/.test(value)
      ? `0${normalizePhone(value)}`
      : value.toLowerCase(); // يُسلَّم كما يُكتب في الحقل، لا كما كُتب في الأمر

const findUser = async (value) => {
  const email = toEmail(value);
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
  return data?.users?.find((x) => x.email === email) ?? null;
};

// كلُّ المسارات داخل دالّة: process.exit وسط مقبضٍ مفتوحٍ من undici يُسقط
// libuv على ويندوز بتأكيدٍ وخروجٍ بـ127، فيقرأه أيُّ غلافٍ فشلاً وليس بفشل.
async function main(args) {
  if (args[0] === "--list") {
    const { data, error } = await db
      .from("branch_viewers")
      .select("name, user_id, added_at")
      .order("added_at");
    if (error) {
      console.error("تعذّرت القراءة:", error.message);
      return 1;
    }
    if (!data.length) {
      console.log("لا حسابات بعد.");
      return 0;
    }
    const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
    const byId = new Map((users?.users ?? []).map((u) => [u.id, u]));
    console.log(`حسابات لوحة الفرع (${data.length}):\n`);
    for (const r of data) {
      const u = byId.get(r.user_id);
      const who = (u?.email ?? "").replace(/@muhta\.app$/, "");
      const seen = u?.last_sign_in_at
        ? `آخر دخول ${u.last_sign_in_at.slice(0, 10)}`
        : "لم يدخل بعد";
      console.log(`  ${who}  —  ${r.name}`);
      console.log(`    أُضيف ${r.added_at.slice(0, 10)} · ${seen}`);
    }
    return 0;
  }

  if (args[0] === "--remove") {
    const who = args[1];
    if (!who) {
      console.error("usage: --remove <اسم المستخدم أو الرقم>");
      return 1;
    }
    const u = await findUser(who);
    if (!u) {
      console.error("لا حسابَ بهذا الاسم.");
      return 1;
    }
    const { error } = await db
      .from("branch_viewers")
      .delete()
      .eq("user_id", u.id);
    if (error) {
      console.error("تعذّر السحب:", error.message);
      return 1;
    }
    console.log(
      `سُحبت الصلاحية عن ${label(who)}. والحسابُ باقٍ — تُعاد بإضافته من جديد.`,
    );
    return 0;
  }

  // بدء كلمةٍ جديدة: الحسابُ باقٍ، والجلساتُ القائمة تنقضي بانقضاء رمزها.
  if (args[0] === "--password") {
    const [, who, pw] = args;
    if (!who || !pw) {
      console.error("usage: --password <اسم المستخدم> <الكلمة الجديدة>");
      return 1;
    }
    if (pw.length < 6) {
      console.error("كلمة المرور ستّة أحرف فأكثر — هذا حدُّ Supabase نفسِه.");
      return 1;
    }
    const u = await findUser(who);
    if (!u) {
      console.error("لا حسابَ بهذا الاسم.");
      return 1;
    }
    const { error } = await db.auth.admin.updateUserById(u.id, { password: pw });
    if (error) {
      console.error("تعذّر التبديل:", error.message);
      return 1;
    }
    console.log(`بُدّلت كلمةُ ${label(who)}.`);
    return 0;
  }

  const [who, pw, name] = args;
  if (!who || !pw) {
    console.error(
      'usage: node scripts/add-branch-viewer.mjs <اسم المستخدم> <كلمة المرور> ["الجهة"]',
    );
    console.error(
      "       node scripts/add-branch-viewer.mjs --password <اسم المستخدم> <كلمة جديدة>",
    );
    console.error("       node scripts/add-branch-viewer.mjs --remove <اسم المستخدم>");
    console.error("       node scripts/add-branch-viewer.mjs --list");
    return 1;
  }
  const bad = badUsername(who);
  if (bad) {
    console.error(bad);
    return 1;
  }
  if (pw.length < 6) {
    console.error("كلمة المرور ستّة أحرف فأكثر — هذا حدُّ Supabase نفسِه.");
    return 1;
  }

  const email = toEmail(who);
  let user = await findUser(who);
  let fresh = false;

  if (!user) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: pw,
      email_confirm: true,
    });
    if (error) {
      console.error("تعذّر إنشاء الحساب:", error.message);
      return 1;
    }
    user = data.user;
    fresh = true;
  } else {
    // الحسابُ قائم: تُثبَّت الكلمةُ المطلوبة كي يكون الأمرُ الواحد كافياً
    // سواءٌ أُنشئ الآن أو أُنشئ أمس — ولا يُترك المسلِّمُ يخمّن أيَّهما وقع.
    const { error } = await db.auth.admin.updateUserById(user.id, {
      password: pw,
    });
    if (error) {
      console.error("تعذّر ضبط الكلمة:", error.message);
      return 1;
    }
  }

  const { error } = await db.from("branch_viewers").upsert(
    { user_id: user.id, name: name?.trim() || who },
    { onConflict: "user_id" },
  );
  if (error) {
    console.error("تعذّرت الإضافة:", error.message);
    return 1;
  }

  console.log(`\n✓ ${name?.trim() || who}${fresh ? "" : "  (حسابٌ قائمٌ، حُدّث)"}`);
  console.log(`  الدخول من     muhta.online/login`);
  console.log(`  اسم المستخدم  ${label(who)}`);
  console.log(`  كلمة المرور   ${pw}`);
  console.log(`  اللوحة        muhta.online/branch`);
  console.log(
    `\n  حسابٌ مشترَك: يقول إنّ الفرعَ دخل ولا يقول مَن. وتُبدَّل كلمتُه بـ --password متى شئت.\n`,
  );
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
