// يفتح حساباً لموظّف فرع التوزيع، أو يسحب صلاحيته.
//
//   node scripts/add-branch-viewer.mjs "عبيد مخلف — مدير الفرع" 07801234567
//   node scripts/add-branch-viewer.mjs --remove 07801234567
//   node scripts/add-branch-viewer.mjs --list
//
// **سكربتٌ لا واجهةُ إدارة.** المستفيدون اثنان إلى خمسة، مرّةً واحدة —
// وشاشةٌ في اللوحة لثلاثة حسابات بناءٌ يُصان بلا أن يُستعمل.
//
// والسحبُ يحذف صفَّ `branch_viewers` ولا يحذف الحساب: من سُحبت صلاحيته قد
// تُعاد، ومحوُ الحساب يمحو معه أثرَ من دخل ومتى.
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

/** النسخةُ نفسُها التي في lib/phone.ts — الهاتفُ يصير بريداً صناعياً، فـ
 *  07901234567 و+9647901234567 حسابٌ واحد لا اثنان. */
const normalize = (raw) => {
  const d = String(raw).replace(/\D/g, "");
  if (d.startsWith("964")) return "0" + d.slice(3);
  if (d.startsWith("7")) return "0" + d;
  return d;
};
const toEmail = (raw) => `p${normalize(raw)}@muhta.app`;

/** كلمةُ مرورٍ عشوائية تُقال مرّةً واحدة.
 *
 *  ولا تُشتقّ من الرقم كما في station-phone (`muhta` + آخر أربعة): ذاك يُخمَّن
 *  من رقمٍ منشور، وهو عيبٌ قائمٌ هناك لا يُنسَخ إلى هنا. */
const password = () => {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return [...b].map((n) => a[n % a.length]).join("");
};

// كلُّ المسارات داخل دالّة: `process.exit` وسط مقبضٍ مفتوحٍ من undici يُسقط
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
      console.log("لا مُشاهدين بعد.");
      return 0;
    }
    console.log(`مُشاهدو الفرع (${data.length}):\n`);
    for (const r of data)
      console.log(
        `  ${r.name}\n    ${r.user_id} · أُضيف ${r.added_at.slice(0, 10)}`,
      );
    return 0;
  }

  if (args[0] === "--remove") {
    const phone = args[1];
    if (!phone) {
      console.error("usage: --remove <phone>");
      return 1;
    }
    const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
    const u = users?.users?.find((x) => x.email === toEmail(phone));
    if (!u) {
      console.error("لا حسابَ بهذا الرقم.");
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
      `سُحبت الصلاحية عن ${normalize(phone)}. والحسابُ باقٍ — تُعاد بإضافته من جديد.`,
    );
    return 0;
  }

  const [name, phone] = args;
  if (!name || !phone) {
    console.error(
      'usage: node scripts/add-branch-viewer.mjs "<الاسم والصفة>" <phone>',
    );
    console.error("       node scripts/add-branch-viewer.mjs --remove <phone>");
    console.error("       node scripts/add-branch-viewer.mjs --list");
    return 1;
  }

  const email = toEmail(phone);
  const pw = password();

  // الحسابُ قد يكون قائماً (صاحبَ محطةٍ مثلاً) — فيُضاف إلى المُشاهدين ولا
  // تُستبدَل كلمتُه، إذ استبدالُها يُخرجه من محطته.
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  let user = users?.users?.find((x) => x.email === email);
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
  }

  const { error } = await db
    .from("branch_viewers")
    .upsert({ user_id: user.id, name }, { onConflict: "user_id" });
  if (error) {
    console.error("تعذّرت الإضافة:", error.message);
    return 1;
  }

  console.log(`\n✓ ${name}`);
  console.log(`  الدخول من  muhta.online/login`);
  console.log(`  الرقم      ${normalize(phone)}`);
  if (fresh) {
    console.log(`  كلمة المرور ${pw}`);
    console.log(
      `\n  ⚠ تُقال مرّةً واحدة ولا تُطبع ثانيةً. سلّمها بيدك، واطلب تغييرها بعد أوّل دخول.`,
    );
  } else {
    console.log(`  كلمة المرور  (الحسابُ قائمٌ سلفاً — كلمتُه كما هي)`);
  }
  console.log(`  اللوحة     muhta.online/branch\n`);
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
