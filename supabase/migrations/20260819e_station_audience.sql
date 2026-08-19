-- كم إنساناً ينتظر خبر هذه المحطة.
--
-- طُلبت رسالة تحثّ المحطات على التحديث، وفيها رقمٌ «وهمي يزيد وينقص». والرقم
-- الحقيقي أكبر: ٦١٤ مشتركاً في الرمادي، و٤٧٩ في الفلوجة، و٨٩ في عامرية
-- الفلوجة — والمثال المطلوب كان ٣٤٣. فلا حاجة إلى اختراع، ولا ثمن له إلا
-- الخسارة: الرسالة نفسها تنتهي بـ«ونحن نكسب الثقة»، ورقمٌ مصنوع يُقال لصاحب
-- محطة حقيقي يهدم الجملة التي يحملها. ولو انكشف مرة، سقط كل رقم آخر تقوله
-- المنصة بعده.
--
-- ولماذا دالة لا استعلام: جدول alerts لا يمنح SELECT لأحد — لا للزائر ولا
-- للمالك — لأن صفوفه عناوين دفع. فالعدّ يخرج مجمّعاً، ولا يخرج عنوان واحد.
begin;

create or replace function public.station_audience(p_station uuid)
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  st stations;
  caller_role text;
begin
  select * into st from stations where id = p_station;
  if not found then raise exception 'no station' using errcode = '42704'; end if;

  select p.role::text into caller_role from profiles p where p.id = auth.uid();
  -- صاحب المحطة أو الإدارة. وغيرهما لا شأن له بجمهور محطة ليست له.
  if st.owner_id is distinct from auth.uid() and caller_role is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return json_build_object(
    -- من اختار مدينة هذه المحطة، ومن اختار «كل المدن» فهو يشملها.
    'watchers', (
      select count(distinct a.address) from alerts a
       where a.station_id is null
         and (a.city is null or a.city = st.city)
    ),
    -- ومن ضغط «تابع هذه المحطة» بعينها.
    'followers', (
      select count(distinct a.address) from alerts a where a.station_id = st.id
    ),
    'city', st.city
  );
end
$fn$;

revoke all on function public.station_audience(uuid) from public;
grant execute on function public.station_audience(uuid) to authenticated;

commit;
