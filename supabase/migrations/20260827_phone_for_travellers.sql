-- رقمٌ يُفتح لمن يقطع الطريق، ويبقى مخفيّاً عن الجار.
--
-- مواطنٌ من الفلوجة رأى محطةً معلَناً فيها المنتج، فقطع 27.8 كم إلى الخالدية،
-- فوجدها لا تلتزم. والمحطة تُخفي رقمها — فلم يملك أن يتحقّق قبل أن يتحرّك.
-- العطل ليس في البيانات بل في أن من يسافر لا يجد باباً يسأل منه.
--
-- وصاحب المحطة أخفى رقمه لسبب: مكالماتٌ لا تنتهي من أهل مدينته، وأكثرها
-- يسأل عمّا هو مكتوبٌ على صفحته. فالإخفاء يبقى — عمّن يستطيع أن يمرّ بها.
-- ويُفتح لمن بينه وبينها مدينةٌ كاملة.
--
-- والرقم مخفيٌّ في القاعدة لا في الواجهة: stations_public يُخرج phone = null
-- حين phone_hidden (20260819d)، و anon لا يملك صلاحية العمود على الجدول
-- إطلاقاً. فلا مسار في المتصفّح يبلغه، ولا بدّ من بوّابة.
--
-- **وحدٌّ يُقال صراحةً:** المدينة تأتي من المتصفّح، والخادم لا يملك التحقّق
-- منها. فالحارس إرشاديٌّ لا مانع: من أراد الرقم يبلغه بادّعاء مدينةٍ أخرى.
-- وهو كافٍ للغرض — يمنع المكالمة العابرة من الجار، ولا يمنع المُصرّ. والبديل
-- الحقيقي (طلبُ اتصالٍ يصل المحطة بدل كشف الرقم) عملٌ أكبر يُؤجَّل.
begin;

create or replace function public.station_phone_for(p_station uuid, p_city text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  -- المخفيّ وحده يمرّ من هنا: الظاهر يصل المتصفّح من stations_public أصلاً،
  -- وإرجاعه ثانيةً يفتح باباً لا حاجة له.
  select case
           when s.phone_hidden
            and p_city is not null
            and btrim(p_city) <> ''
            and s.city is distinct from btrim(p_city)
           then s.phone
         end
    from stations s
   where s.id = p_station
     and s.status = 'approved';
$$;

revoke all on function public.station_phone_for(uuid, text) from public;
grant execute on function public.station_phone_for(uuid, text) to anon, authenticated;

comment on function public.station_phone_for(uuid, text) is
  'رقم محطةٍ تُخفي رقمها، لمن مدينته غير مدينتها. حارسٌ إرشاديّ: المدينة من العميل.';

commit;
