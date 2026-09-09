-- إيقافُ جدول يومٍ كلِّه — ورفعُ الإيقاف.
--
-- ── ولماذا علامةٌ ثالثةٌ لا صفٌّ فارغ ──────────────────────────────────────
--
-- `20260909d` منع العلامةَ الفارغةَ بقيدٍ وبسطرٍ في `lib/board.ts:marks`، وكتب
-- سببَه: «ولا علامةَ فارغةً تُفرغ اللوحة: «أخفِ كلَّ شيء» يُكتب صراحةً لا
-- سهواً». وهو حقٌّ يبقى — فعلامةٌ فقدت هدفَها بخطأٍ برمجيٍّ كانت ستُفرغ لوحةَ
-- يومٍ بلا أن يقصد أحد.
--
-- فالإيقافُ يُسمّى باسمه: `action = 'off'`. لا يُبلغ بالسهو، ويُقرأ في السجلّ
-- على وجهه، ويُرفع بحذف سطرٍ واحد.
--
-- ── ولماذا يُحتاج أصلاً ────────────────────────────────────────────────────
--
-- طلبُ صاحب المنصّة. والحاجةُ مقيسة: جدولُ ٢٠٢٦-٠٩-٠٩ نُشر وفيه اسمٌ خاطئ،
-- ولم يكن في يده إلا أن يُخفي مدنَه واحدةً واحدة — ولا يُصيب ذلك سطراً بلا
-- مدينة. وإيقافُ التوزيع نفسِه يقع، فيصير الجدولُ كلُّه غيرَ صحيح في لحظة.
--
-- ولا يُحذف المنشور: الإيقافُ يُرفع فيعود الجدولُ كما كان. والحذفُ بابُه
-- «استبدل» عند النشر، وهو بابٌ آخر لحاجةٍ أخرى.

begin;

alter table public.board_overrides
  drop constraint if exists board_overrides_action_check;
alter table public.board_overrides
  add constraint board_overrides_action_check
  check (action in ('hide', 'out', 'off'));

-- والقيدُ يبقى على حاله لكلّ علامةٍ إلا الموقِفة: هي وحدَها بلا هدفٍ لأنّ
-- هدفَها اليومُ نفسُه.
alter table public.board_overrides
  drop constraint if exists board_overrides_targets_something;
alter table public.board_overrides
  add constraint board_overrides_targets_something
  check (
    action = 'off'
    or city is not null
    or station_id is not null
    or station_name is not null
    or product is not null
  );

-- ولا يتكرّر الإيقافُ في اليوم: ضغطتان على الزرّ نفسِه لا تُنشئان سطرين،
-- ورفعُ الإيقاف حذفٌ واحدٌ يُصيب كلَّ شيء.
create unique index if not exists board_overrides_off_uniq
  on public.board_overrides (for_date)
  where action = 'off';

commit;

-- والدالّتان (`set_board_override` و`clear_board_override_for`) لا تُمسّان:
-- الأولى ترفض ما ليس `hide` أو `out` فتبقى الشاشةُ الويبيّةُ على بابها، والبوت
-- يكتب بمفتاح الخدمة مباشرةً. ومن أراد الزرَّ في المتصفّح لاحقاً أضاف دالّتَه
-- حينئذ — ولا تُبنى بوّابةٌ قبل أن يُطرق بابُها.
