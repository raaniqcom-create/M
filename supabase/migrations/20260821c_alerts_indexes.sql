-- فهرسان على مفتاح الربط في كل إشعار.
--
-- alerts فيها خمسة فهارس، ولا واحد يبدأ بـaddress: الفريدان يبدآن بـchannel،
-- وalerts_match بـcity، وalerts_station_idx جزئيّ على station_id. وaddress هو
-- ما يُربط ويُحدَّث في كل نداء:
--
--   select distinct alerts.address from alerts               ← مسح كامل
--   from alerts b where b.address = m.address and b.last_sent_at >= ...  ← مسح كامل
--   update alerts a set last_sent_at = now() where a.address = e.address ← مسح كامل
--
-- الجدول ٦٢٢٣ صفّاً اليوم وينمو ~١٤٠٠ يومياً. فكل نشرِ محطة يمسح الجدول كاملاً
-- ثلاث مرات. لا يظهر أثره الآن، ويظهر حين يبلغ عشرات الآلاف — وحينها يتأخّر
-- الإشعار الذي كل قيمة المنصّة في سرعته.
--
-- ويُنشآن concurrently خارج معاملة: البناء العادي يقفل الجدول للكتابة، وقفلٌ
-- على alerts يعني توقّف كل إشعار وكل اشتراك حتى ينتهي.
create index concurrently if not exists alerts_address_idx
  on alerts (address);

-- والثاني لشرط التبريد: last_sent_at >= now() - 45 minutes. جزئيّ لأن الصفوف
-- التي لم تُرسَل قطّ لا تدخل الشرط أصلاً، وهي اليوم ثلث الجدول.
create index concurrently if not exists alerts_last_sent_idx
  on alerts (last_sent_at)
  where last_sent_at is not null;
