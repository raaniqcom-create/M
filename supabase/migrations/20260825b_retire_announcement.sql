-- إخفاءٌ يبقى مُخفياً.
--
-- في اللوحة زرّان: «متوفر» و«نفد». وكلاهما يكتب admin_verdict، وعمرُه ثلاثون
-- دقيقة بالتصميم — بعدها يعود الحكم إلى تصويت الناس.
--
-- وكان ذلك صواباً لنصفه وخطأً لنصفه الآخر. «متوفر» ادّعاءٌ إيجابي من إدارةٍ لا
-- تقف في الطابور ولا تعلم متى نفد، فانحلاله بعد نصف ساعة يحميه من أن يصير
-- خبراً ميتاً معلّقاً. أمّا «نفد» فليس ادّعاءً بل **إلغاء** — ومن ضغطه أراد أن
-- يذهب الخبر، لا أن يغيب نصف ساعةً ثم يعود.
--
-- والمالك ضغطه مرّتين على خبرين وعادا. وقِيس السبب على القاعدة الحيّة: خبرٌ
-- قرارُه «نفد» منذ ١٦٧٦ دقيقة — ثمانٍ وعشرين ساعة — ومعروضٌ للناس، لأن مفعول
-- القرار انتهى بعد ثلاثين دقيقة فتولّى التصويت، و«ما زال متوفراً» كان يسبق
-- «نفد» (٤١ مقابل ٤٠، و٩٤ مقابل ٥٤) فلم يبلغ فارق الأربعة الذي يُخفي.
--
-- ولا شيء في المنصّة كلها كان يضبط active = false. فالإلغاء لم يكن موجوداً
-- أصلاً — كان كتماً يُسمّى إلغاءً.
begin;

create or replace function public.retire_announcement(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select p.role::text from profiles p where p.id = auth.uid()) is distinct from 'admin' then
    raise exception 'ليس لديك صلاحية' using errcode = '42501';
  end if;

  update announcements
     set active = false,
         -- ويُمسح القرار المؤقّت معه: تركُه يجعل اللوحة تقول «قرارك: نفد —
         -- يسقط ٦:٤٠» عن خبرٍ لن يعود أصلاً.
         admin_verdict = null,
         admin_verdict_at = null
   where id = p_id;
end;
$$;

revoke all on function public.retire_announcement(uuid) from public;
grant execute on function public.retire_announcement(uuid) to authenticated;

comment on function public.retire_announcement(uuid) is
  'إلغاءٌ نهائي لخبر: يُطفئ active فلا يعود بتصويتٍ ولا بمرور وقت. للإدارة وحدها.';

commit;
