// اعتذارُ الجدول: جملةٌ واحدةٌ يقرأ فيها كلُّ إنسانٍ اسمَ مدينته.
//
// والمصيدةُ التي يحرسها آخرُ قسم: نصُّ الإشعار غيرُ نصِّ الشاشة عمداً.
// `alerts_for` تُطابق المشتركَ بلا مدينةٍ مع كلّ مدينة، فلو خُصِّص نصُّ الإشعار
// لكلّ مدينةٍ لوجب سبعةٌ وعشرون نداءً — وسبعةٌ وعشرون إشعاراً في جيبٍ واحد.
import assert from 'node:assert/strict';
import {
  CITY_TOKEN,
  ALL_CITIES_WORD,
  DEFAULT_NOTICE,
  cityPhrase,
  liveNotice,
  matchedCities,
  noticeApplies,
  pushBody,
  renderNotice,
} from '../lib/scheduleNotice.ts';

const ALL = null; // المحافظةُ كلُّها

// ── ١ · الاسمُ يتبدّل بمدينة القارئ ────────────────────────────────────────
assert.equal(cityPhrase(ALL, ['حديثة']), 'حديثة');
assert.equal(cityPhrase(ALL, ['الرمادي']), 'الرمادي');
assert.equal(cityPhrase(['حديثة', 'هيت'], ['حديثة']), 'حديثة', 'ما يخصّه من المستهدَف');

// واوُ العطف تلتصق بما بعدها: «حديثة والرمادي» لا «حديثة و الرمادي»
assert.equal(cityPhrase(ALL, ['حديثة', 'الرمادي']), 'حديثة والرمادي');

// ── ٢ · وفوق اثنتين تصير الجملةُ عدّاً، فتُقال المحافظة ───────────────────
assert.equal(cityPhrase(ALL, ['حديثة', 'الرمادي', 'هيت']), ALL_CITIES_WORD);
assert.equal(cityPhrase(ALL, []), ALL_CITIES_WORD, 'زائرٌ لم يختر');
assert.equal(cityPhrase(ALL, null), ALL_CITIES_WORD);

// ومستهدَفةٌ واحدةٌ وقارئٌ لم يختر: الاسمُ معروفٌ فيُقال، ولا يُطمس
assert.equal(cityPhrase(['عنة'], null), 'عنة');
assert.equal(cityPhrase(['عنة', 'راوة'], null), ALL_CITIES_WORD);

// ── ٣ · من يراه ────────────────────────────────────────────────────────────
assert.ok(noticeApplies(ALL, ['حديثة']), 'اعتذارُ المحافظة يصل الجميع');
assert.ok(noticeApplies(['حديثة'], ['حديثة']));
assert.ok(!noticeApplies(['حديثة'], ['الرمادي']), 'مدينةٌ أخرى لا تراه');
assert.ok(noticeApplies(['حديثة'], []), 'ومن لم يختر يرى كلَّ شيء — الافتراضُ المفتوح');
assert.deepEqual(matchedCities(['حديثة', 'هيت'], ['هيت', 'الرمادي']), ['هيت']);

// ── ٤ · النصُّ كاملاً كما طلبه صاحبُ المنصّة ──────────────────────────────
const shown = renderNotice(DEFAULT_NOTICE, ALL, ['حديثة']);
assert.ok(shown.includes('في حديثة'), shown);
assert.ok(!shown.includes(CITY_TOKEN), 'لا تبقى علامةٌ غيرُ مستبدَلة');
assert.ok(shown.startsWith('نعتذر إلى متابعي المحطة التقنية في حديثة'), shown);

// وعلامتان في نصٍّ واحدٍ تُستبدلان معاً — `split/join` لا `replace`
assert.equal(
  renderNotice(`${CITY_TOKEN} ثمّ ${CITY_TOKEN}`, ALL, ['هيت']),
  'هيت ثمّ هيت'
);
// ونصٌّ بلا علامةٍ يمرّ كما هو
assert.equal(renderNotice('نصٌّ حرٌّ بلا علامة', ALL, ['هيت']), 'نصٌّ حرٌّ بلا علامة');

// ── ٥ · الانتهاءُ يُفحص على الجهاز أيضاً ──────────────────────────────────
const at = (h) => new Date(Date.now() + h * 3600_000).toISOString();
const row = (id, cities, expires) => ({ id, body: DEFAULT_NOTICE, cities, expires_at: expires });

assert.equal(liveNotice([row('a', ALL, at(2))], ['حديثة'])?.id, 'a');
assert.equal(liveNotice([row('a', ALL, at(-1))], ['حديثة']), null, 'منتهٍ لا يُعرض');
assert.equal(liveNotice([row('a', ALL, null)], ['حديثة'])?.id, 'a', 'بلا موعدِ انتهاء');
assert.equal(liveNotice([row('a', ['هيت'], at(2))], ['حديثة']), null, 'مدينةٌ أخرى');
// الأحدثُ أوّلاً: الترتيبُ من الاستعلام، وهذه تأخذ أوّلَ صالحٍ لا أيَّ صالح
assert.equal(
  liveNotice([row('a', ['هيت'], at(2)), row('b', ALL, at(2))], ['حديثة'])?.id,
  'b'
);

// ── ٦ · نصُّ الإشعار للجمهور لا للفرد ─────────────────────────────────────
// سبعٌ وعشرون مدينةً مستهدَفةً ⇒ اسمٌ واحدٌ جامع، فالنداءُ واحدٌ ويحذف المكرّر
assert.ok(pushBody(DEFAULT_NOTICE, ALL).includes(`في ${ALL_CITIES_WORD}`));
assert.ok(pushBody(DEFAULT_NOTICE, ['حديثة', 'هيت']).includes(`في ${ALL_CITIES_WORD}`));
// ومدينةٌ واحدةٌ مستهدَفةٌ تُسمّى في الإشعار نفسِه
assert.ok(pushBody(DEFAULT_NOTICE, ['حديثة']).includes('في حديثة'));
assert.ok(!pushBody(DEFAULT_NOTICE, ALL).includes(CITY_TOKEN));

// ── ٧ · الأرقامُ لاتينيّةٌ في كلّ ما يُعرض (قاعدةُ المنصّة) ───────────────
assert.ok(!/[٠-٩]/.test(DEFAULT_NOTICE), 'أرقامٌ هنديّة في النصّ الافتراضيّ');

console.log('schedule notice: all assertions passed');
