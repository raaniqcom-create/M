// فحصُ بناءِ الدوالّ الطرفيّة قبل نشرها.
//
//   node scripts/check-functions.mjs
//
// **لأنّ النشرَ لا يفحص.** أُعلن تعريفان لثابتٍ واحدٍ في `telegram/index.ts`،
// فمرّت الحزمةُ ونجح النشر، ثمّ سقطت الدالّةُ عند الإقلاع — والبوتُ خارجَ
// الخدمة حتى كُشف بـcurl. وesbuild يمسك هذا في ثانية.
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';

const dir = 'supabase/functions';
const fns = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => `${dir}/${d.name}/index.ts`)
  .filter((f) => existsSync(f));

let bad = 0;
for (const f of fns) {
  try {
    execFileSync(
      'npx',
      ['--yes', 'esbuild', f, '--bundle', '--format=esm', '--platform=neutral',
       '--outfile=' + (process.platform === 'win32' ? 'NUL' : '/dev/null'),
       '--external:jsr:*', '--external:npm:*', '--external:node:*', '--external:https://*'],
      { stdio: ['ignore', 'ignore', 'pipe'], shell: process.platform === 'win32' }
    );
    console.log(`✓ ${f}`);
  } catch (e) {
    bad++;
    console.error(`✗ ${f}`);
    console.error(String(e.stderr ?? e).split('\n').slice(0, 12).join('\n'));
  }
}
if (bad) process.exit(1);
console.log(`${fns.length} دالّةً — كلُّها تُبنى.`);
