package online.muhta.app.car;

import android.content.pm.ApplicationInfo;

import androidx.annotation.NonNull;
import androidx.car.app.CarAppService;
import androidx.car.app.Screen;
import androidx.car.app.Session;
import androidx.car.app.SessionInfo;
import androidx.car.app.validation.HostValidator;

/**
 * مدخلُ التطبيق إلى شاشة السيارة.
 *
 * <p><b>ولا يمسّ هذا الفرعُ {@code MainActivity} ولا جسرَ Capacitor ولا WebView
 * بحال.</b> التطبيقُ على الهاتف نافذةٌ على {@code muhta.online}؛ وشاشةُ السيارة
 * لا تعرض صفحاتِ ويب — قوالبُ يرسمها المضيف. وفتحُ الهاتف من شاشة السيارة رفضٌ
 * مؤكَّدٌ في مراجعة Google، وهذا مشروعُ WebView فالخطرُ فيه حقيقيّ. فإن وجدتَ
 * يوماً إشارةً إلى نشاطٍ أو جسرٍ في حزمة {@code car}، فهي خطأ.
 *
 * <p>والتحقّقُ من المضيف: في البناء القابل للتنقيح يُقبل كلُّ مضيف كي يعمل
 * محاكي الرأس (DHU)؛ وفي الإصدار قائمةُ المكتبة الموقَّعة وحدَها — فلا يتصل
 * بالخدمة تطبيقٌ ينتحل صفةَ سيّارة.
 */
public final class MuhtaCarAppService extends CarAppService {

    @NonNull
    @Override
    public HostValidator createHostValidator() {
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            return HostValidator.ALLOW_ALL_HOSTS_VALIDATOR;
        }
        return new HostValidator.Builder(getApplicationContext())
                .addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample)
                .build();
    }

    @NonNull
    @Override
    public Session onCreateSession(@NonNull SessionInfo sessionInfo) {
        return new Session() {
            @NonNull
            @Override
            public Screen onCreateScreen(@NonNull android.content.Intent intent) {
                return new ProductScreen(getCarContext());
            }
        };
    }
}
