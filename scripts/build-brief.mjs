// يبني الكتابَ الرسميّ وملحقَ بياناته لفرع الأنبار — بأرقامٍ مقروءةٍ لحظتَها.
//
//   node scripts/build-brief.mjs
//   node scripts/print-pdf.mjs docs/anbar-oil/letter-oil.html docs/anbar-oil/annex-oil.html
//
// **ولا رقمَ يُكتب بيد.** كتابٌ رسميّ يحمل رقماً قديماً أسوأُ من كتابٍ بلا
// أرقام: الأوّلُ يُكذّبه أوّلُ من يفتح التطبيق أمام المدير. فيُقرأ كلُّ شيءٍ
// من القاعدة عند البناء.
//
// ── وتصفيحٌ إلزاميّ ─────────────────────────────────────────────────────
//
// سقفُ PostgREST يقصّ كلَّ ردٍّ مهما بلغ. وجدولُ alerts تجاوزه فعلاً: القراءةُ
// بلا تصفيح أعطت 6,281 مشتركاً، والصحيحُ 9,619 — نقصٌ بالثلث، في رقمٍ يُعرض
// على مديرِ فرع. فكلُّ جدولٍ يُقرأ ألفاً ألفاً حتى تنقطع الصفحات.
//
// والخريطةُ تُبنى من شبكة الأنبار في docs/promo/road.html: مساراتُها حقيقية،
// وإسقاطُها استُخرج بانحدارٍ خطّيّ على عُقَدها السبعٍ والعشرين المعروفة
// إحداثياتُها في lib/cities.ts — وطابق بجذر خطأٍ صفر بكسل، فيقع كلُّ
// lat/lng في موضعه الحقيقيّ.

import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const get = async (q) => {
  const r = await fetch(`${U}/rest/v1/${encodeURI(q)}`, { headers: H });
  const d = await r.json();
  if (!Array.isArray(d)) throw new Error(q + ' → ' + JSON.stringify(d).slice(0, 200));
  return d;
};
const getRange = async (q, a, b) => {
  const r = await fetch(`${U}/rest/v1/${encodeURI(q)}`, { headers: { ...H, Range: `${a}-${b}` } });
  const d = await r.json();
  if (!Array.isArray(d)) throw new Error(q + ' → ' + JSON.stringify(d).slice(0, 200));
  return d;
};

const out = {};

// ── المحطات ──
const stations = await get(
  'stations?select=id,name,city,address,phone,contact_name,lat,lng,status,kind,is_demo,created_at,slug&order=city,name'
);
out.stationsAll = stations.length;
out.stations = stations.filter((s) => s.status === 'approved' && !s.is_demo);
out.byStatus = stations.reduce((m, s) => ((m[s.status] = (m[s.status] ?? 0) + 1), m), {});

// ── المشتركون بالمدينة: عنوانٌ مميّز لكلِّ مدينة ──
// تصفيحٌ إلزاميّ: سقفُ PostgREST يقصّ كلَّ ردّ مهما بلغ، وجدولُ alerts
// تجاوز السقفَ فعلاً — فالعدُّ بلا تصفيحٍ يُنقص المشتركين ولا يشكو.
const alerts = [];
for (let from = 0; ; from += 1000) {
  const page = await getRange('alerts?select=address,city,station_id&order=address', from, from + 999);
  alerts.push(...page);
  if (page.length < 1000) break;
}
const perCity = new Map();
const allAddr = new Set();
for (const a of alerts) {
  allAddr.add(a.address);
  if (a.station_id) continue;            // متابعةُ محطة، لا اشتراكُ مدينة
  const c = a.city ?? '(كل المدن)';
  if (!perCity.has(c)) perCity.set(c, new Set());
  perCity.get(c).add(a.address);
}
out.subscribers = [...perCity.entries()]
  .map(([city, set]) => ({ city, n: set.size }))
  .sort((a, b) => b.n - a.n);
out.subscribersTotal = allAddr.size;
out.alertRows = alerts.length;

// ── الأجهزة ونموّها ──
const devices = [];
for (let from = 0; ; from += 1000) {
  const page = await getRange('device_tokens?select=platform,created_at&order=token', from, from + 999);
  devices.push(...page);
  if (page.length < 1000) break;
}
out.devices = devices.length;
out.byPlatform = devices.reduce((m, d) => ((m[d.platform] = (m[d.platform] ?? 0) + 1), m), {});
const perDayMap = new Map();
for (const d of devices) {
  const k = String(d.created_at).slice(0, 10);
  perDayMap.set(k, (perDayMap.get(k) ?? 0) + 1);
}
out.growth = [...perDayMap.entries()].sort().map(([day, n]) => ({ day, n }));

// ── الزيارات ──
const stats = await get('site_stats?select=visits&limit=1');
out.visits = stats[0]?.visits ?? 0;

// ── المدى الزمني ──
const firstDevice = out.growth[0]?.day ?? null;
const firstStation = stations.map((s) => s.created_at).sort()[0]?.slice(0, 10) ?? null;
out.since = [firstDevice, firstStation].filter(Boolean).sort()[0];


const D = out;

const road = readFileSync(new URL('../docs/promo/road.html', import.meta.url), 'utf8');
const oldLetter = readFileSync(new URL('../docs/anbar-oil/letter.html', import.meta.url), 'utf8');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ar = (n) => Number(n).toLocaleString('en-US');

// ── الأرقام ──
const st = D.stations;
const since = new Date(D.since + 'T00:00:00Z');
const days = Math.max(1, Math.round((new Date(D.growth.at(-1).day + 'T00:00:00Z') - since) / 86400000) + 1);
const perDay = Math.round(D.visits / days);
const byCity = {};
for (const s of st) byCity[s.city] = (byCity[s.city] ?? 0) + 1;
const kinds = st.reduce((m, s) => ((m[s.kind] = (m[s.kind] ?? 0) + 1), m), {});
const nCities = Object.keys(byCity).length;

// ── الخريطة ──
const NET_D = JSON.parse(road.match(/const NET_D = (\[.*?\]);/s)[1]);
const NET_NODES = JSON.parse(road.match(/const NET_NODES = (\{.*?\});/s)[1]);
const X = (lng) => 127.2168 * lng - 4848.26;
const Y = (lat) => -151.5691 * lat + 5270.95;
const lab = Object.entries(NET_NODES).filter(([n]) => byCity[n])
  .map(([n, [x, y]]) => ({ n, x, y, ly: y - 12 })).sort((a, b) => a.ly - b.ly);
for (let k = 1; k < lab.length; k++)
  if (Math.abs(lab[k].x - lab[k - 1].x) < 120 && lab[k].ly - lab[k - 1].ly < 19) lab[k].ly = lab[k - 1].ly + 19;
const xs = Object.values(NET_NODES).map((v) => v[0]);
const ys = Object.values(NET_NODES).map((v) => v[1]);
const M = 30;
const vb = [Math.min(...xs) - M, Math.min(...ys) - M - 6,
  Math.max(...xs) - Math.min(...xs) + M * 2, Math.max(...ys) - Math.min(...ys) + M * 2 + 6].map(Math.round);
const mapSvg = `<svg viewBox="${vb.join(' ')}" class="map">
  ${NET_D.map((d) => `<path d="${d}" fill="none" stroke="#c3d6cc" stroke-width="2.3" stroke-linecap="round"/>`).join('')}
  ${Object.entries(NET_NODES).filter(([n]) => !byCity[n]).map(([, [x, y]]) => `<circle cx="${x}" cy="${y}" r="2.8" fill="#c3d6cc"/>`).join('')}
  ${st.filter((s) => s.lat).map((s) => `<circle cx="${X(s.lng).toFixed(1)}" cy="${Y(s.lat).toFixed(1)}" r="6.2" fill="#16a34a" fill-opacity=".25"/><circle cx="${X(s.lng).toFixed(1)}" cy="${Y(s.lat).toFixed(1)}" r="3" fill="#15803d"/>`).join('')}
  ${lab.map((l) => (Math.abs(l.ly - (l.y - 12)) > 2 ? `<line x1="${l.x}" y1="${l.y - 5}" x2="${l.x}" y2="${(l.ly + 3).toFixed(1)}" stroke="#86efac" stroke-width="1.1"/>` : '')
    + `<text x="${l.x}" y="${l.ly.toFixed(1)}" class="mlab">${esc(l.n)} · ${byCity[l.n]}</text>`).join('')}
</svg>`;

// ── منحنى النموّ ──
let cum = 0;
const series = D.growth.map((g) => ({ ...g, cum: (cum += g.n) }));
const W = 860, HH = 230, PX = 44, PY = 20;
const maxCum = series.at(-1).cum, maxDay = Math.max(...series.map((s) => s.n));
const gx = (i) => PX + (i / (series.length - 1)) * (W - PX * 2);
const gy = (v) => HH - PY - (v / maxCum) * (HH - PY * 2);
const bw = ((W - PX * 2) / series.length) * 0.6;
const chart = `<svg viewBox="0 0 ${W} ${HH}" class="chart">
  ${[0, 0.5, 1].map((f) => `<line x1="${PX}" x2="${W - PX}" y1="${gy(maxCum * f).toFixed(1)}" y2="${gy(maxCum * f).toFixed(1)}" stroke="#e6efe9"/><text x="${PX - 7}" y="${(gy(maxCum * f) + 3.5).toFixed(1)}" class="ax">${ar(Math.round(maxCum * f))}</text>`).join('')}
  ${series.map((s, i) => { const h = (s.n / maxDay) * (HH - PY * 2) * 0.42;
    return `<rect x="${(gx(i) - bw / 2).toFixed(1)}" y="${(HH - PY - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="#bbf7d0" rx="1.4"/>`; }).join('')}
  <path d="M ${gx(0)} ${HH - PY} ${series.map((s, i) => `L ${gx(i).toFixed(1)} ${gy(s.cum).toFixed(1)}`).join(' ')} L ${gx(series.length - 1)} ${HH - PY} Z" fill="#16a34a" fill-opacity=".10"/>
  <path d="${series.map((s, i) => `${i ? 'L' : 'M'} ${gx(i).toFixed(1)} ${gy(s.cum).toFixed(1)}`).join(' ')}" fill="none" stroke="#15803d" stroke-width="2.4"/>
  ${series.map((s, i) => (i % 4 === 0 || i === series.length - 1) ? `<text x="${gx(i).toFixed(1)}" y="${HH - 4}" class="ax mid">${s.day.slice(5).replace('-', '/')}</text>` : '').join('')}
  <circle cx="${gx(series.length - 1).toFixed(1)}" cy="${gy(maxCum).toFixed(1)}" r="3.6" fill="#15803d"/></svg>`;

// ── قِطعٌ مشتركة، مأخوذةٌ من الكتاب القائم ──
const HEAD = oldLetter.match(/<header class="head">[\s\S]*?<\/header>/)[0];
// **يُستخرَج بعدٍّ متوازن لا بمطابقةٍ كسولة.** القصُّ عند أوّل `<div class="sign">`
// يترك `close-row` و`dl` مفتوحَين، فتُبتلع بقيةُ الصفحة داخلهما — قِيس الأثر:
// الكتلةُ بلغت 2937 بكسلاً بدل مئتين، فطُرد الكتابُ إلى صفحةٍ ثانية.
function block(html, openTag) {
  const start = html.indexOf(openTag);
  if (start < 0) throw new Error('لم أجد ' + openTag);
  let depth = 0, i = start;
  const re = /<div|<\/div>/g;
  re.lastIndex = start;
  for (let m; (m = re.exec(html)); ) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) { i = m.index + m[0].length; break; }
  }
  const out = html.slice(start, i);
  // استخراجٌ فارغ يُصرَخ به: النسخةُ الأولى ابتلعته صامتاً فخرج الكتابُ بلا
  // رموز، وفاض على الصفحة الثانية بلا أن يقول أحدٌ لماذا.
  if (out.length < 200) throw new Error(`استخراج ${openTag} فارغ (${out.length} حرفاً) — راجِع القالب`);
  return out;
}
const QR = block(oldLetter, '<div class="dl">');
const SIGN = `<div class="sign">
    <div class="name">أحمد الرفاعي</div>
    <div class="role">مقدّم الفكرة والمشرف على المنصة</div>
    <div class="role ltr">0784 444 6633</div>
    <div class="line">التوقيع</div>
  </div>`;
const FOOT = `<footer class="foot"><span>المحطة التقنية — منصة وقود الأنبار</span><span class="ltr">muhta.online</span></footer>`;
const shell = (title, extra, sheets) => `<!doctype html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="_style.css">
${extra}
</head><body>
${sheets}
</body></html>`;
const sheet = (inner) => `<section class="sheet">${HEAD}<div class="body">${inner}</div>${FOOT}</section>`;

// ═══ الكتاب الرسميّ ═══
// ثلاثون بكسلاً بقيت بعد القصّ، فتُؤخذ من التباعد لا من المعنى: الكتابُ
// الرسميّ صفحةٌ واحدة، والطابعةُ تقيس الفيضَ فتكشف القصَّ الصامت.
const TIGHT = `<style>
  .body p{margin:6px 0}
  .body ol{margin:5px 0 7px}
  .body ol li{margin-bottom:3px}
  .box{margin:7px 0;padding:8px 11px}
  .close-row{margin-top:3mm}
  h1{margin:9px 0 3px}
  .subject{margin-top:7px}
</style>`;
const letter = shell('كتاب رسمي — اعتماد المحطة التقنية منصةً موحدة', TIGHT, sheet(`
  <div class="meta"><span>العدد: &nbsp;/ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><span>التاريخ: &nbsp;&nbsp;/ &nbsp;&nbsp;/ ٢٠٢٦</span></div>

  <h1>إلى / السيد مدير فرع الأنبار لشركة توزيع المنتجات النفطية المحترم</h1>
  <p style="color:#5b6b62;font-size:10.5pt;margin-top:-4px">الرمادي — محافظة الأنبار</p>

  <div class="subject">م / طلب اعتماد منصة «المحطة التقنية» منصةً موحّدة لمحطات الأنبار، ودعوة المحطات الحكومية والأهلية إلى التسجيل</div>

  <p>تحية طيبة وبعد،</p>

  <p>
    بعد أن أثبتت المنصة عملها ميدانياً على مدى <strong>${days} يوماً</strong>، أضع بين أيديكم
    نتائجها، وألتمس اعتماد <strong>«المحطة التقنية»</strong> منصةً موحّدة لعرض توفر الوقود في محطات المحافظة.
  </p>

  <div class="box">
    <table>
      <tr><th>زيارات المنصة</th><td><strong>${ar(D.visits)}</strong> زيارة — بمعدل <strong>${ar(perDay)}</strong> يومياً</td></tr>
      <tr><th>الأجهزة المثبِّتة</th><td><strong>${ar(D.devices)}</strong> جهازاً (${ar(D.byPlatform.android)} أندرويد، ${ar(D.byPlatform.ios)} آيفون)</td></tr>
      <tr><th>المشتركون بالتنبيهات</th><td><strong>${ar(D.subscribersTotal)}</strong> مواطناً يصلهم إشعار فور توفر الوقود في مدينتهم</td></tr>
      <tr><th>المحطات المسجّلة</th><td><strong>${ar(st.length)}</strong> محطة معتمدة في <strong>${nCities}</strong> مدن من أصل ٢٧ قضاءً وناحية</td></tr>
    </table>
  </div>

  <p>
    ومصدر المعلومة <strong>صاحب المحطة نفسه</strong>، يحدّث حالة التوفر بضغطة من هاتفه فيصل
    المواطنين إشعار — فيعرفون قبل أن يتحركوا، ولا يقفون في طابور قد ينتهي قبل دورهم. والخدمة
    <strong>مجانية بالكامل</strong>، والتطبيق منشور على <strong>App&nbsp;Store</strong>
    و<strong>Google&nbsp;Play</strong>.
  </p>

  <p>لذا نلتمس من حضرتكم التكرّم بما يأتي:</p>
  <ol>
    <li><strong>اعتماد المنصة</strong> قناةً إلكترونية موحّدة ومساندة لِما تنشره دائرتكم من جداول توزيع.</li>
    <li><strong>تعميم على المحطات الحكومية والأهلية</strong> في المحافظة بالتسجيل وتحديث حالة التوفر
      أولاً بأول — والتسجيل مجاني عبر <span class="ltr">muhta.online/register</span> ولا يستغرق دقائق.</li>
    <li><strong>تسمية ضابط ارتباط</strong> لتأكيد صحة بيانات المحطات المسجّلة، و<strong>لوحة متابعة
      للفرع</strong> تعرض حالة التوفر في عموم المحافظة لحظة بلحظة — تُجهَّز عند الطلب وبلا كلفة.</li>
  </ol>

  <p>
    ومرفق طيّاً <strong>ملحق بالبيانات</strong>: خريطة المحطات المسجّلة وجدولها، وأعداد
    المشتركين في كل مدينة، ومنحنى نمو المنصة. … مع وافر التقدير والاحترام.
  </p>

  <div class="close-row">${QR}${SIGN}</div>
`));

// ═══ الملحق ═══
const AX = `<style>
  .map,.chart{width:100%;height:auto;border:1px solid var(--line);border-radius:12px;background:#fbfdfc;display:block;margin:6px 0}
  .mlab{font:800 11.5px Tajawal,sans-serif;fill:#14532d;text-anchor:middle;paint-order:stroke;stroke:#fff;stroke-width:3.2;stroke-linejoin:round}
  .ax{font:600 9.5px Tajawal,sans-serif;fill:#5b6b62;text-anchor:end}.ax.mid{text-anchor:middle}
  table.dense{font-size:8.6pt}
  table.dense th,table.dense td{padding:3px 6px}
  .kpi4{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:8px 0 4px}
  .kpi4 .k{background:var(--brand-50);border:1px solid var(--brand-200);border-radius:11px;padding:8px 9px}
  .kpi4 .k b{display:block;font-size:15pt;font-weight:800;color:var(--brand-600);direction:ltr;text-align:right;line-height:1.2}
  .kpi4 .k span{font-size:8.6pt;color:var(--brand-700);font-weight:700}
  .kpi4 .k i{display:block;font-style:normal;font-size:7.8pt;color:var(--muted);margin-top:2px;line-height:1.4}
  .lg{display:flex;gap:14px;flex-wrap:wrap;font-size:8.6pt;color:var(--muted);margin-top:2px}
  .lg i{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--brand-600);margin-inline-end:4px;font-style:normal}
  .lg i.g{background:#c3d6cc}.lg i.p{background:#bbf7d0;border-radius:2px}
  .num{text-align:center;font-variant-numeric:tabular-nums;white-space:nowrap}
  .bar{display:block;height:7px;border-radius:4px;background:linear-gradient(90deg,var(--brand),#4ade80)}
  .anx{font-size:10pt;color:var(--muted);margin:0 0 2px}
</style>`;

const row = (s, i) => `<tr><td class="num" style="color:#8aa196">${i}</td><td><strong>${esc(s.name.trim())}</strong></td><td>${esc(s.city)}</td><td>${esc(s.address)}</td><td class="ltr num">${esc(s.phone)}</td><td>${esc(s.contact_name)}</td></tr>`;
const tbl = (rows) => `<table class="dense"><thead><tr><th style="width:7mm">#</th><th>اسم المحطة</th><th style="width:20mm">المدينة</th><th>العنوان</th><th style="width:24mm">الهاتف</th><th style="width:32mm">الشخص المسؤول</th></tr></thead><tbody>${rows}</tbody></table>`;
const CUT = 19;
const subs = D.subscribers.filter((s) => s.city !== '(كل المدن)');
const maxSub = subs[0].n;

const annex = shell('ملحق البيانات — المحطة التقنية', AX, [
  sheet(`<div class="subject">ملحق (١) — الرقعة الجغرافية لمواقع المحطات المسجّلة</div>
    <div class="kpi4">
      <div class="k"><b>${ar(D.visits)}</b><span>زيارة</span><i>بمعدل ${ar(perDay)} يومياً</i></div>
      <div class="k"><b>${ar(D.devices)}</b><span>جهازاً مثبِّتاً</span><i>${ar(D.byPlatform.android)} أندرويد · ${ar(D.byPlatform.ios)} آيفون</i></div>
      <div class="k"><b>${ar(D.subscribersTotal)}</b><span>مشتركاً بالتنبيهات</span><i>يصلهم إشعار فور التوفر</i></div>
      <div class="k"><b>${ar(st.length)}</b><span>محطة معتمدة</span><i>في ${nCities} مدن · ${kinds.gov ?? 0} حكومية و${kinds.private ?? 0} أهلية</i></div>
    </div>
    ${mapSvg}
    <div class="lg"><span><i></i>محطة مسجّلة ومعتمدة (${st.length})</span><span><i class="g"></i>مدينة أو ناحية بلا محطة مسجّلة بعد</span><span>الخطوط: شبكة الطرق الرئيسية والمنافذ الحدودية</span></div>
    <div class="box" style="margin-top:8px"><p style="margin:0">
      المنصة تغطّي <strong>٢٧</strong> قضاءً وناحية في الأنبار، والمسجَّل حتى اليوم في <strong>${nCities}</strong> منها.
      والفراغ على الخريطة ليس غياب محطات، بل غياب تسجيل — وهو ما يعالجه التعميم المطلوب في الكتاب.
    </p></div>`),
  sheet(`<div class="subject">ملحق (٢) — جدول المحطات المسجّلة (${st.length} محطة)</div>
    <p class="anx">١ – ${CUT} من ${st.length}</p>${tbl(st.slice(0, CUT).map((s, i) => row(s, i + 1)).join(''))}`),
  sheet(`<div class="subject">ملحق (٢) — تتمة جدول المحطات</div>
    <p class="anx">${CUT + 1} – ${st.length} من ${st.length}</p>${tbl(st.slice(CUT).map((s, i) => row(s, CUT + i + 1)).join(''))}`),
  sheet(`<div class="subject">ملحق (٣) — المشتركون في كل مدينة</div>
    <table class="dense"><thead><tr><th>المدينة</th><th class="num" style="width:22mm">المشتركون</th><th style="width:52mm">النسبة</th><th class="num" style="width:26mm">محطات مسجّلة</th></tr></thead><tbody>
    ${subs.map((s) => `<tr><td><strong>${esc(s.city)}</strong></td><td class="num">${ar(s.n)}</td><td><span class="bar" style="width:${(s.n / maxSub * 100).toFixed(1)}%"></span></td><td class="num" style="color:#5b6b62">${byCity[s.city] ?? '—'}</td></tr>`).join('')}
    <tr><th>المجموع</th><th class="num">${ar(D.subscribersTotal)}</th><th></th><th class="num">${st.length}</th></tr>
    </tbody></table>
    <p class="anx">المجموع أقل من حاصل جمع المدن لأن المشترك الواحد قد يختار أكثر من مدينة، فيُحسب في كل منها مرة وفي المجموع مرة واحدة.</p>`),
  sheet(`<div class="subject">ملحق (٤) — نمو المنصة منذ الإطلاق</div>
    <div class="kpi4" style="grid-template-columns:repeat(3,1fr)">
      <div class="k"><b>${ar(D.visits)}</b><span>مجموع الزيارات</span><i>فتحات التطبيق والموقع</i></div>
      <div class="k"><b>${ar(perDay)}</b><span>معدل الزيارات يومياً</span><i>${ar(D.visits)} ÷ ${days} يوماً</i></div>
      <div class="k"><b>${ar(D.devices)}</b><span>جهازاً مختلفاً</span><i>أقرب رقم إلى «عدد الأشخاص»</i></div>
    </div>
    ${chart}
    <div class="lg"><span><i></i>الخط: مجموع الأجهزة المسجّلة تراكمياً</span><span><i class="p"></i>الأعمدة: أجهزة جديدة في اليوم</span></div>
    <div class="box"><p style="margin:0">
      <strong>توضيح في الأرقام:</strong> «الزيارة» فتحة التطبيق أو الموقع، مع حاجز يمنع عدّ التحديث
      المتكرر خلال عشر ثوانٍ — فالشخص الواحد يزور مرات في اليوم. أما <strong>${ar(D.devices)}</strong>
      فهو عدد الأجهزة المختلفة التي ثبّتت التطبيق وسجّلت إشعاراتها، وهو أقرب ما لدينا إلى عدد الأشخاص.
    </p></div>
    ${SIGN}`),
].join('\n'));

writeFileSync(new URL('../docs/anbar-oil/letter-oil.html', import.meta.url), letter);
writeFileSync(new URL('../docs/anbar-oil/annex-oil.html', import.meta.url), annex);
console.log('كُتب:');
console.log('  docs/anbar-oil/letter-oil.html   — صفحة واحدة');
console.log('  docs/anbar-oil/annex-oil.html    — خمس صفحات');
console.log(`  ${st.length} محطة · ${ar(D.subscribersTotal)} مشترك · ${ar(D.visits)} زيارة في ${days} يوماً`);
