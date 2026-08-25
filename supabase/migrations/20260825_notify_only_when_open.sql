-- إشعارُ وصولٍ لا يخرج من محطة مغلقة.
--
-- notify تقرأ عن المحطة ثلاثة حقول — name و status و city — ولا تسأل عن
-- دوامها إطلاقاً. فمحطةٌ أطفأت منتجاً وبقي لديها آخر مؤشَّر «متوفر» تُرسل
-- بشارةً وهي مغلقة: الفعل إطفاء، والنتيجة إعلانُ وصول.
--
-- و notify-favorites أخطر منها، لأن مسارها لا يمرّ بـ notify أصلاً: المالك
-- يبدّل منتجه من بوت تيليجرام أو واتساب، فلا يُنادى شيء — ثم يلتقط كنسُ
-- الدقيقتين updated_at الجديد فيُرسل «متوفر الآن» إلى كل مفضّليه. مالكٌ
-- يبدّل الثانية فجراً ومحطته تفتح السادسة يُوقظ الناس بوقودٍ لا يُباع.
--
-- والقاعدة مكتوبة عندنا منذ ١٩ آب: station_open_now تفحص temp_closed
-- و is_24h ونافذة الدوام بتوقيت بغداد. والناقص أن تُنادى — لا أن تُكتب
-- رابعةً. وفي المستودع اليوم ثلاث نسخ من منطق الدوام: هذه، و lib/hours.ts
-- للمتصفّح، ونسخةٌ ثالثة داخل بوت تيليجرام تتجاهل temp_closed كلياً.
-- فكل حارسٍ جديد يُكتب بيدٍ هو نسخةٌ رابعة تنحرف عن الثلاث بعد شهر.
begin;

-- توقيع station_open_now يأخذ صفّ stations كاملاً، وPostgREST لا يُمرّر
-- صفّاً مركّباً من دالّة طرفية. فغلافٌ بمعرّفٍ وحده ليُنادى من Deno.
--
-- و coalesce(..., false) مقصود: محطةٌ حُذفت بين الضغط والإرسال تُقرأ
-- «مغلقة» لا null — والصمت هو الافتراض الآمن، لأن إشعاراً لم يُرسل يُعاد
-- إرساله وإشعاراً أُرسل لا يُستعاد.
create or replace function public.station_open_now_id(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select station_open_now(st.*) from stations st where st.id = p_id),
    false
  );
$$;

revoke all on function public.station_open_now_id(uuid) from public;
grant execute on function public.station_open_now_id(uuid) to authenticated, service_role;

-- ولكنسِ الدقيقتين صفوفٌ كثيرة لا محطةٌ واحدة، فنداءٌ لكل صفّ لا يصلح.
-- منظورٌ يحمل الحارسين معاً — متوفر، ومحطته معتمدة ومفتوحة — فلا يبقى في
-- الدالّة الطرفية منطقُ دوامٍ أصلاً، ويصير التعديل هناك اسمَ جدولٍ لا أكثر.
--
-- وأعمدة المحطة مسطّحة هنا عن قصد: PostgREST لا يعرف مفاتيح المنظور
-- الأجنبية، فـ stations!inner(...) لا تعمل فوقه. والتسطيح يُغني عنها.
create or replace view public.station_products_live as
select sp.station_id,
       sp.product,
       sp.updated_at,
       sp.is_available,
       st.name as station_name,
       st.city as station_city,
       st.slug as station_slug
  from station_products sp
  join stations st on st.id = sp.station_id
 where sp.is_available
   and st.status = 'approved'
   and station_open_now(st.*);

comment on view public.station_products_live is
  'المنتجات التي يصحّ الإعلان عنها الآن: متوفرة، ومحطتها معتمدة ومفتوحة.';

-- للخادم وحده: هذا منظورُ إرسالٍ لا منظورُ عرض. والعرض له stations_public.
revoke all on public.station_products_live from anon, authenticated;
grant select on public.station_products_live to service_role;

commit;
