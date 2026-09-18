-- «غسيل»: التصنيفُ يصير أحجاماً — small / mid / large / other بدل الأنواع الخمسة.
--
-- ── لماذا ────────────────────────────────────────────────────────────────
-- صاحبُ المنصّة طلب شاشةَ «اختيار حجم السيارة» بصورٍ فوتوغرافيّة: ثلاثةُ أحجامٍ يفهمها
-- كلُّ زبونٍ بالنظر، و«أخرى» مخرجاً لما لا ينطبق (حملٌ، باصٌ، دراجة). والتسمياتُ القديمة
-- (صالون/SUV/بيك أب/فان) تختلف بين الناس، والحجمُ لا يختلف.
--
-- ── ما يتغيّر ─────────────────────────────────────────────────────────────
-- · قيدُ wash_bookings.vehicle (المعرَّف بلا اسمٍ صريحٍ في 20260918b:21، فاسمُه التلقائيّ).
-- · صفوفٌ محفوظة: sedan→mid · suv|pickup|van→large · other→other.
-- · مفاتيحُ wash_services.prices jsonb بالخريطة نفسِها؛ وحين يجتمع أكثرُ من مفتاحٍ قديمٍ
--   في large يُؤخذ الأكبر — لا يُنقَص على صاحب المغسلة. وsmall بلا مقابلٍ قديمٍ فيضبطه المالك.
-- · القوائمُ البيضاء في ثلاث دوالّ: book_wash_group (الحيّة) · book_wash · add_walk_in.
--
-- ── فخُّ 20260924b ────────────────────────────────────────────────────────
-- تلك الهجرةُ لا تُعرّف book_wash_group بل تقرأ pg_get_functiondef وتستبدل نصَّي الخطأ
-- بـwash_cars_ar(...). فإعادةُ كتابة الدالّة من الصفر تمحو التصحيحَ العربيَّ صامتةً.
-- لذلك نُبدّل هنا **القائمةَ البيضاءَ وحدَها داخل التعريف الحيّ** بالأسلوب نفسِه،
-- فيبقى كلُّ ما سبقه — والتأكيدُ الختاميّ يحرس الأمرين معاً.
--
-- ── عقدُ العزل ────────────────────────────────────────────────────────────
-- جداولُ ودوالُّ المغاسل وحدَها. لا جدولَ وقودٍ يُمسّ. التراجع:
--   إعادةُ القيد إلى الخمسة، وعكسُ الخريطة (mid→sedan، large→suv)، وإعادةُ القوائم البيضاء.
begin;

-- ── ١ · القيدُ يُفتح قبل تحويل البيانات ───────────────────────────────────
alter table public.wash_bookings drop constraint if exists wash_bookings_vehicle_check;

-- ── ٢ · تحويلُ ما هو محفوظ ────────────────────────────────────────────────
update public.wash_bookings
   set vehicle = case vehicle
                   when 'sedan'  then 'mid'
                   when 'suv'    then 'large'
                   when 'pickup' then 'large'
                   when 'van'    then 'large'
                   else vehicle
                 end
 where vehicle in ('sedan', 'suv', 'pickup', 'van');

-- مفاتيحُ الأسعار: القيمةُ الرقميّةُ وحدَها تُنقل، والأكبرُ يفوز عند التصادم.
update public.wash_services s
   set prices = (
     select jsonb_object_agg(t.k, t.v)
       from (
         select case e.key
                  when 'sedan'  then 'mid'
                  when 'suv'    then 'large'
                  when 'pickup' then 'large'
                  when 'van'    then 'large'
                  else e.key
                end as k,
                max(e.value::int) as v
           from jsonb_each_text(s.prices) e
          where e.value ~ '^\d+$'
          group by 1
       ) t
   )
 where s.prices is not null
   and s.prices ?| array['sedan', 'suv', 'pickup', 'van'];

-- ── ٣ · القيدُ الجديد ─────────────────────────────────────────────────────
alter table public.wash_bookings
  add constraint wash_bookings_vehicle_check
  check (vehicle is null or vehicle in ('small', 'mid', 'large', 'other'));

-- ── ٤ · القوائمُ البيضاء داخل التعاريف الحيّة ────────────────────────────
-- book_wash_group: unnest(array[...]) with ordinality تعمل قائمةً بيضاءَ **وترتيباً** معاً.
do $$
declare src text; newsrc text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'book_wash_group';
  if src is null then raise exception 'book_wash_group غائبة — طبّق 20260924 أوّلاً'; end if;
  newsrc := replace(src,
    'unnest(array[''sedan'',''suv'',''pickup'',''van'',''other''])',
    'unnest(array[''small'',''mid'',''large'',''other''])');
  if newsrc = src then
    raise notice 'قائمةُ book_wash_group غيرُ موجودةٍ كما هي — لعلّها بُدّلت سلفاً';
  else
    execute newsrc;
  end if;
end $$;

-- book_wash: حارسٌ مبكّرٌ يُبطل النوعَ المجهول (لم يعد العميلُ يناديها، وتبقى متّسقة).
do $$
declare src text; newsrc text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'book_wash';
  if src is null then raise exception 'book_wash غائبة'; end if;
  newsrc := replace(src,
    'p_vehicle not in (''sedan'',''suv'',''pickup'',''van'',''other'')',
    'p_vehicle not in (''small'',''mid'',''large'',''other'')');
  if newsrc = src then
    raise notice 'قائمةُ book_wash غيرُ موجودةٍ كما هي';
  else
    execute newsrc;
  end if;
end $$;

-- add_walk_in: القائمةُ داخل INSERT لا في حارسٍ مبكّر.
do $$
declare src text; newsrc text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'add_walk_in';
  if src is null then raise exception 'add_walk_in غائبة'; end if;
  newsrc := replace(src,
    'p_vehicle in (''sedan'',''suv'',''pickup'',''van'',''other'')',
    'p_vehicle in (''small'',''mid'',''large'',''other'')');
  if newsrc = src then
    raise notice 'قائمةُ add_walk_in غيرُ موجودةٍ كما هي';
  else
    execute newsrc;
  end if;
end $$;

-- ── ٥ · تأكيدات ───────────────────────────────────────────────────────────
do $$
declare bad int;
begin
  -- لا صفَّ بمفتاحٍ قديم
  select count(*) into bad from wash_bookings where vehicle in ('sedan', 'suv', 'pickup', 'van');
  assert bad = 0, format('بقيت %s حجوزاتٍ بمفتاحٍ قديم', bad);
  -- ولا مفتاحَ قديمٍ في أيّ أسعار
  select count(*) into bad from wash_services where prices is not null and prices ?| array['sedan', 'suv', 'pickup', 'van'];
  assert bad = 0, format('بقيت %s خدماتٍ بمفاتيحَ قديمة', bad);
  -- القيدُ الجديد يرفض القديمَ ويقبل الجديد
  assert (select count(*) from pg_constraint where conname = 'wash_bookings_vehicle_check') = 1, 'القيدُ غائب';
  assert (select pg_get_constraintdef(oid) from pg_constraint where conname = 'wash_bookings_vehicle_check') like '%small%', 'القيدُ لم يتحدّث';
  -- الدوالُّ الثلاثُ مرّةً واحدةً كلٌّ، وبالقائمة الجديدة
  assert (select count(*) from pg_proc where proname = 'book_wash_group') = 1, 'book_wash_group مكرّرة';
  assert (select prosrc from pg_proc where proname = 'book_wash_group') like '%''small''%', 'book_wash_group بالقائمة القديمة';
  -- وفخُّ 20260924b: التصحيحُ العربيُّ ما زال في مكانه
  assert (select prosrc from pg_proc where proname = 'book_wash_group') like '%wash_cars_ar%', 'ضاع التصحيحُ العربيّ';
  assert (select prosrc from pg_proc where proname = 'book_wash') like '%''small''%', 'book_wash بالقائمة القديمة';
  assert (select prosrc from pg_proc where proname = 'add_walk_in') like '%''small''%', 'add_walk_in بالقائمة القديمة';
  -- عقدُ العزل
  assert not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and (tablename like 'wash\_%' or tablename = 'car_washes')), 'جدولُ مغاسل في realtime';
  assert not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                     where c.relname in ('stations','station_products','alerts','device_tokens','traffic_votes','profiles')
                       and t.tgname like '%wash%'), 'مُشغّلُ مغاسل على جدول وقود';
end $$;

commit;
