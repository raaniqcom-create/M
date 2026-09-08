// يُطبّق الهجراتِ التي لم تُطبَّق بعد — من GitHub Actions، بلا حاسبة.
//
// ── لماذا لا `supabase db push` ──────────────────────────────────────────
//
// تلك تطلب **كلمةَ مرور القاعدة** فوق رمز الوصول، أي سرّين لا سرّاً. وواجهةُ
// الإدارة تُنفّذ SQL برمز الوصول وحدَه:
//
//     POST https://api.supabase.com/v1/projects/{ref}/database/query
//
// فسرٌّ واحدٌ يُضبط من الهاتف مرّةً، ولا يُلمس حاسوبٌ بعدها.
//
// ── والأمانُ بالبناء لا بالحذر ───────────────────────────────────────────
//
// السجلُّ `supabase_migrations.schema_migrations` هو المرجع. وإن كان فارغاً —
// وهو حالُ قاعدةٍ طُبّقت هجراتُها بالأيدي — فلا يُخمَّن شيء: تُسجَّل الملفّاتُ
// القائمةُ **تسجيلاً بلا تنفيذ** (بذرة)، ويُقال ذلك في السجلّ. فلا تُعاد
// خمسٌ وخمسون هجرةً على قاعدةٍ حيّة.
//
// وكلُّ هجرةٍ تُنفَّذ في نداءٍ واحد، ثمّ يُكتب رقمُها. فإن سقطت واحدةٌ وقف
// كلُّ شيءٍ عندها ولم تُسجَّل — والتاليةُ لا تُجرَّب على قاعدةٍ نصفِ مهاجَرة.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
const DRY = process.argv.includes('--dry-run');

if (!TOKEN || !REF) {
  console.error('يلزم SUPABASE_ACCESS_TOKEN و SUPABASE_PROJECT_REF');
  process.exit(1);
}

const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

/** ينفّذ SQL ويردّ الصفوف. ويرمي بنصِّ الخطأ كما قالته القاعدة — لا بـ«فشل». */
async function sql(query) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 600)}`);
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
// ── والرقمُ هو اسمُ الملفّ كلُّه، لا بادئتُه ────────────────────────────
//
// كُتب هذا أوّلاً يقصّ عند أوّل شرطةٍ سفليّة على عادة الأداة. ففُحص المجلّدُ
// فإذا **ثلاثةُ أرقامٍ مكرَّرة**: 20260816_a_add و20260816_b_revoke،
// و20260821c_alerts_indexes و20260821c_unregistered_board، و20260903_runs_out_at
// و20260903_traffic_votes_revoke. والمفتاحُ عليها كان سيبتلع الثانيةَ من كلّ
// زوجٍ صامتاً — تُقرأ «مطبَّقة» وهي لم تُفتح.
//
// واسمُ الملفّ فريدٌ بحكم المجلّد، فلا يحتاج انضباطاً في التسمية.
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((name) => ({ name, version: name.replace(/\.sql$/, '') }));

console.log(`ملفّاتُ الهجرة: ${files.length}`);

// السجلُّ قد لا يكون موجوداً أصلاً في مشروعٍ لم يُهاجَر بالأداة قطّ.
await sql(`
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key,
    statements text[],
    name text
  );
`);

const rows = await sql('select version from supabase_migrations.schema_migrations order by version');
const applied = new Set(rows.map((r) => r.version));
console.log(`مسجَّلٌ في القاعدة: ${applied.size}`);

const pending = files.filter((f) => !applied.has(f.version));

// ── البذرة: سجلٌّ فارغٌ وملفّاتٌ كثيرة ⇒ تُسجَّل ولا تُنفَّذ ───────────────
if (applied.size === 0 && files.length > 1) {
  console.log(
    `\n⚠️  السجلُّ فارغٌ و${files.length} ملفّاً على القرص.\n` +
      `    القاعدةُ حيّةٌ وهجراتُها طُبّقت بالأيدي، فتُسجَّل تسجيلاً بلا تنفيذ.\n` +
      `    وما يُدفع بعد اليوم يُطبَّق وحدَه.`
  );
  if (DRY) {
    console.log('(تجربةٌ جافّة — لم يُكتب شيء)');
    process.exit(0);
  }
  const values = files.map((f) => `('${f.version}', '${f.name.replace(/'/g, "''")}')`).join(',');
  await sql(
    `insert into supabase_migrations.schema_migrations (version, name) values ${values}
     on conflict (version) do nothing`
  );
  console.log(`✔ سُجّلت ${files.length} هجرةً بذرةً.`);
  process.exit(0);
}

if (!pending.length) {
  console.log('✔ لا هجرةَ معلّقة.');
  process.exit(0);
}

console.log(`\nمعلَّقٌ (${pending.length}):`);
for (const f of pending) console.log(`   ${f.name}`);

if (DRY) {
  console.log('\n(تجربةٌ جافّة — لم يُنفَّذ شيء)');
  process.exit(0);
}

for (const f of pending) {
  const body = readFileSync(join(dir, f.name), 'utf8');
  process.stdout.write(`→ ${f.name} … `);
  try {
    await sql(body);
  } catch (e) {
    console.log('سقطت');
    console.error(`\n${e.message}\n`);
    console.error('وُقف عندها، ولم تُسجَّل — فالتاليةُ لا تُجرَّب على قاعدةٍ نصفِ مهاجَرة.');
    process.exit(1);
  }
  await sql(
    `insert into supabase_migrations.schema_migrations (version, name)
     values ('${f.version}', '${f.name.replace(/'/g, "''")}')
     on conflict (version) do nothing`
  );
  console.log('تمّت');
}

console.log(`\n✔ طُبّقت ${pending.length} هجرة.`);
