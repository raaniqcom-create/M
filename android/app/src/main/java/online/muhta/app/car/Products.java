package online.muhta.app.car;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * أسماءُ الوقود وترتيبُه — مرآةُ {@code PRODUCT_ORDER} و{@code PRODUCT_LABELS}
 * في {@code lib/products.ts}.
 *
 * <p>ولا سبيلَ إلى استيراد TypeScript في جافا، فتُقال صراحةً: من أضاف منتجاً
 * هناك يضيفه هنا. وهي القائمةُ الوحيدةُ المنسوخة في هذه الشاشة — أمّا قاعدةُ
 * «متوفّرٌ الآن» فلا تُنسخ أبداً، وسببُه في {@code CarData}.
 *
 * <p><b>و«كاز» يبقى.</b> وقعت مشورةٌ بحذفه من شاشة السيارة بحجّة أنّه وقودُ
 * تدفئةٍ لا وقودُ سيّارة. والقياسُ يقول غيرَ ذلك: يومَ كُتب هذا كانت إحدى عشرةَ
 * محطةَ كازٍ مؤكَّدةً حديثاً مقابل ثلاثٍ للبانزين العاديّ. فحذفُه كان سيُفرغ
 * الشاشة. والناسُ هنا يقودون إلى المحطة ليملؤوا للبيت كما يملؤون للسيّارة.
 */
final class Products {

    private static final Map<String, String> LABELS = new LinkedHashMap<>();

    static {
        LABELS.put("gasoline_regular", "بانزين عادي");
        LABELS.put("gasoline_premium", "بانزين محسن");
        LABELS.put("gasoline_super", "بانزين سوبر");
        LABELS.put("kerosene", "كاز");
        LABELS.put("gas", "غاز");
        LABELS.put("lpg", "LPG");
        LABELS.put("white_oil", "نفط أبيض");
    }

    /** الترتيبُ المعروض — نفسُ ترتيب `PRODUCT_ORDER`، فتُقرأ الشاشتان بترتيبٍ واحد. */
    static final List<String> ORDER = Arrays.asList(
            "gasoline_regular", "gasoline_premium", "gasoline_super",
            "kerosene", "gas", "lpg", "white_oil");

    private Products() {}

    /** الاسمُ العربيّ، أو المفتاحُ نفسُه إن ورد منتجٌ لا تعرفه هذه النسخة. */
    static String label(String key) {
        String v = LABELS.get(key);
        return v != null ? v : key;
    }

    /** أسماءُ منتجاتِ محطةٍ مرتَّبةً ومفصولةً — «بانزين عادي · كاز». */
    static String join(List<String> keys) {
        StringBuilder sb = new StringBuilder();
        for (String k : ORDER) {
            if (!keys.contains(k)) continue;
            if (sb.length() > 0) sb.append(" · ");
            sb.append(label(k));
        }
        return sb.toString();
    }
}
