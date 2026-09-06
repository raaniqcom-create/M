// يقيس ما يراه المستخدم حين ينقطع الاتصال — في متصفّحٍ حقيقيّ لا بالتخمين.
//
//   npx next dev        (في نافذةٍ أخرى، أو أيّ خادمٍ على BASE)
//   node scripts/check-outage.mjs
//
// **ليس اسمُه test-* عمداً**: يحتاج خادماً يعمل، فلا يُجرّ في المسح الذي
// يُشغَّل بلا خادم.
//
// وما يُثبته ثلاثةُ أشياءَ لا يُثبتها فحصُ وحدة:
//   ١ ـ اللقطةُ تُكتب فعلاً بعد تحميلٍ ناجح.
//   ٢ ـ فتحةٌ باردةٌ وشبكةُ القاعدة مقطوعة تعرض **المحطات** تحت شريط القِدَم،
//       لا بطاقةَ خطأٍ فارغة. وهو العطلُ الذي وُضعت له كلُّ هذه الشيفرة.
//   ٣ ـ مفتاحُ الصيانة يُظهر شاشتَه ويُخفيها.
//
// والقطعُ بـCDP لا بإطفاء الشبكة كلِّها: الصفحةُ نفسُها تُخدَم من localhost،
// فيُحاكى بذلك انقطاعُ الوصول إلى Supabase وحدَه — وهو الشكلُ الأكثرُ وقوعاً
// (خادمٌ بعيدٌ في سنغافورة على شبكةٍ عراقيّة ضعيفة).
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:3210';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9466;
const STATUS = new URL('../public/status.json', import.meta.url);

let ws, id = 0, failures = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    pending.set(++id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evalJs = async (expression) => {
  const { result } = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return result.value;
};
const ok = (cond, what) => {
  console.log(`  ${cond ? '✓' : '✗'} ${what}`);
  if (!cond) failures++;
};

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}/chrome-outage`,
  'about:blank',
]);
chrome.on('error', (e) => {
  throw e;
});

let wsUrl;
for (let i = 0; i < 40 && !wsUrl; i++) {
  try {
    const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
  } catch {}
  if (!wsUrl) await sleep(250);
}
ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
};
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');

const original = readFileSync(STATUS, 'utf8');
try {
  // ── ١ ـ تحميلٌ ناجحٌ يكتب اللقطة ──────────────────────────────────────
  console.log('\n١ ـ الحالة الطبيعيّة');
  await send('Page.navigate', { url: BASE + '/' });
  await sleep(9000);
  // شاشةُ أوّل تشغيل تغطّي الصفحة في ملفٍّ جديد، فيصير النصُّ موجوداً في
  // الـDOM ومحجوباً عن العين — وفحصٌ يمرّ والشيءُ غيرُ مرئيّ لا يُثبت شيئاً.
  await evalJs(`localStorage.setItem('first-run-seen','1'); localStorage.setItem('install-dismissed','1'); '1'`);
  await send('Page.navigate', { url: BASE + '/' });
  await sleep(8000);

  const snap = await evalJs(`(() => {
    const raw = localStorage.getItem('stations-snapshot');
    if (!raw) return null;
    const s = JSON.parse(raw);
    return { v: s.v, rows: s.rows.length, kb: Math.round(raw.length / 1024) };
  })()`);
  ok(!!snap, 'اللقطةُ كُتبت بعد التحميل');
  ok(snap && snap.rows > 0, `فيها ${snap?.rows ?? 0} محطة (${snap?.kb ?? 0} كيلوبايت)`);
  ok(
    !(await evalJs(`document.body.innerText.includes('الاتصال منقطع')`)),
    'ولا شريطَ قِدَمٍ والشبكةُ سليمة'
  );

  // ── ٢ ـ فتحةٌ باردةٌ والقاعدةُ غيرُ قابلةٍ للوصول ─────────────────────
  console.log('\n٢ ـ القاعدة مقطوعة، فتحةٌ باردة');
  await send('Network.setBlockedURLs', { urls: ['*supabase.co*'] });
  await send('Page.navigate', { url: BASE + '/' });
  await sleep(20000);
  const out = await evalJs(`(() => {
    const t = document.body.innerText;
    return {
      banner: t.includes('الاتصال منقطع'),
      clock: /الساعة\\s*[\\u0660-\\u0669\\d:]+/.test(t),
      deadCard: t.includes('تعذّر تحميل المحطات'),
      cards: document.querySelectorAll('[class*="card"]').length,
      // مرئيٌّ فعلاً لا موجودٌ في الـDOM: عنصرٌ خلف غطاءٍ يمرّ في فحص النصّ
      // ولا يراه أحد.
      shown: (() => {
        const el = [...document.querySelectorAll('[role="status"]')]
          .find((n) => n.innerText.includes('الاتصال منقطع'));
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 &&
          document.elementFromPoint(r.left + r.width / 2, r.top + 8) !== null &&
          el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + 8));
      })(),
    };
  })()`);
  ok(out.banner, 'شريطُ القِدَم ظهر');
  ok(out.shown, 'وهو مرئيٌّ فعلاً لا محجوبٌ خلف غطاء');
  ok(out.clock, 'ومعه ساعةُ وصول البيانات');
  ok(!out.deadCard, 'ولا بطاقةَ «تعذّر تحميل المحطات» — البياناتُ معروضة');
  ok(out.cards > 5, `والمحطاتُ مرسومة (${out.cards} بطاقة)`);

  // ── ٣ ـ مفتاح الصيانة ────────────────────────────────────────────────
  console.log('\n٣ ـ وضع الصيانة');
  await send('Network.setBlockedURLs', { urls: [] });
  const until = new Date(Date.now() + 3600_000).toISOString();
  writeFileSync(
    STATUS,
    JSON.stringify({ maintenance: true, until, message: 'فحصٌ آليّ.' }, null, 2)
  );
  await sleep(1500);
  await send('Page.navigate', { url: BASE + '/' });
  await sleep(7000);
  ok(
    await evalJs(`document.body.innerText.includes('المنصّة في صيانة الآن')`),
    'شاشةُ الصيانة ظهرت'
  );
  ok(
    await evalJs(`document.body.innerText.includes('فحصٌ آليّ')`),
    'ومعها رسالةُ المالك'
  );

  // **تباينُ الزرّ لا نصُّه.** `text-brand-800` صنفٌ لا وجودَ لدرجته في
  // tailwind.config، فيسقط ويرث النصُّ الأبيضَ من الغطاء — زرٌّ أبيضُ فارغٌ
  // على خلفيّةٍ بيضاء. و`innerText` يقرؤه كاملاً فيمرّ الفحصُ والشيءُ غيرُ
  // مقروء. فيُقاس اللونُ المحسوب لا النصّ.
  ok(
    await evalJs(`(() => {
      const b = [...document.querySelectorAll('button')]
        .find((x) => /اعرض آخر حالة|تصفّح على أي حال/.test(x.textContent || ''));
      if (!b) return false;
      const c = getComputedStyle(b);
      // بلا تعبيرٍ نمطيّ: النصُّ يمرّ بقالبٍ نصّيّ أوّلاً فتضيع الشرطةُ
      // المائلة، وقد سقط هذا الفحصُ مرّةً لهذا السبب وحدَه.
      const num = (v) => v.slice(v.indexOf('(') + 1, v.indexOf(')')).split(',').map(Number);
      const [r1, g1, b1] = num(c.color);
      const [r2, g2, b2] = num(c.backgroundColor);
      // فرقٌ محسوسٌ في السطوع، لا تطابقٌ تامّ
      const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
      return Math.abs(lum(r1, g1, b1) - lum(r2, g2, b2)) > 60;
    })()`),
    'ونصُّ الزرّ مقروءٌ على خلفيّته'
  );

  // والوعدُ لا يُقال إلا لمن يصحّ في حقّه: هذا الجهازُ بلا اشتراك (ملفٌّ
  // نظيف)، فيجب ألّا يُوعَد بإشعارِ عودة.
  const said = await evalJs(`document.body.innerText`);
  ok(
    !said.includes('سيصلك إشعارٌ عند العودة'),
    'ولا يَعِد جهازاً غيرَ مشتركٍ بإشعار عودة'
  );
  ok(
    said.includes('فعّلها بعد العودة'),
    'بل يدلّه على تفعيلها بعد العودة'
  );

  // وتنتهي وحدَها متى مضت نهايتُها
  writeFileSync(
    STATUS,
    JSON.stringify(
      { maintenance: true, until: new Date(Date.now() - 60_000).toISOString(), message: 'منتهية' },
      null,
      2
    )
  );
  await sleep(1500);
  await send('Page.navigate', { url: BASE + '/' });
  await sleep(7000);
  ok(
    !(await evalJs(`document.body.innerText.includes('المنصّة في صيانة الآن')`)),
    'وصيانةٌ مضت نهايتُها لا تُعرض — المفتاحُ يُطفئ نفسَه'
  );
  // ── ٤ ـ الإنذارُ السابق للصيانة ──────────────────────────────────────
  console.log('');
  console.log('٤ ـ الإنذار السابق');
  const at = new Date(Date.now() + 3600_000);
  writeFileSync(
    STATUS,
    JSON.stringify(
      {
        maintenance: false,
        until: '',
        message: '',
        notice: {
          title: 'تحديثٌ قصير للمنصّة',
          body: 'نصُّ فحص.' + '\n\n' + 'سطرٌ ثانٍ.',
          until: at.toISOString(),
          seconds: 5,
        },
      },
      null,
      2
    )
  );
  await sleep(1500);
  await send('Page.navigate', { url: BASE + '/' });
  await sleep(3200);
  ok(
    await evalJs(`document.body.innerText.includes('تحديثٌ قصير للمنصّة')`),
    'الإنذار ظهر ملءَ الشاشة'
  );
  ok(
    await evalJs(
      `[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'تخطّي')`
    ),
    'ومعه زرُّ التخطّي'
  );
  ok(
    await evalJs(`!!document.querySelector('[role="dialog"] svg circle')`),
    'وعدّادٌ دائريّ بجانبه'
  );
  await sleep(4500);
  ok(
    !(await evalJs(`document.body.innerText.includes('تحديثٌ قصير للمنصّة')`)),
    'وينصرف وحدَه بعد انتهاء العدّاد'
  );

  // وإنذارٌ مضى موعدُه لا يُعرض — وإلّا صار كذباً بعد وقوع ما أنذر به
  writeFileSync(
    STATUS,
    JSON.stringify(
      {
        maintenance: false,
        until: '',
        message: '',
        notice: {
          title: 'إنذارٌ فات',
          body: '—',
          until: new Date(Date.now() - 60_000).toISOString(),
          seconds: 5,
        },
      },
      null,
      2
    )
  );
  await sleep(1500);
  await send('Page.navigate', { url: BASE + '/' });
  await sleep(3200);
  ok(
    !(await evalJs(`document.body.innerText.includes('إنذارٌ فات')`)),
    'وإنذارٌ مضى موعدُه لا يُعرض'
  );
} finally {
  writeFileSync(STATUS, original);
  ws.close();
  chrome.kill();
}

console.log(failures ? `\n✗ سقط ${failures}` : '\n✓ الكلُّ سليم');
process.exitCode = failures ? 1 : 0;
