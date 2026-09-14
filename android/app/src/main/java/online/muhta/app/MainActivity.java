package online.muhta.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // مقياسُ خطّ الهاتف (إعدادات الوصول) كان يضرب كلَّ نصوص التطبيق — حتى px —
    // فيلتفّ السطرُ ويُقصّ الزرُّ ويطبع الرأسُ فوق الفيديو (صورُ عامل التوصيل،
    // ١٣ أيلول). آيفون لا يفعل ذلك؛ فيُثبَّت هنا كي يكون التخطيطُ واحداً.
    getBridge().getWebView().getSettings().setTextZoom(100);
  }
}
