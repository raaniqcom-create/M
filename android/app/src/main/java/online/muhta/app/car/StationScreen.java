package online.muhta.app.car;

import android.content.Intent;
import android.net.Uri;

import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.Screen;
import androidx.car.app.model.Action;
import androidx.car.app.model.Pane;
import androidx.car.app.model.PaneTemplate;
import androidx.car.app.model.Row;
import androidx.car.app.model.Template;

import java.util.Locale;

/**
 * محطةٌ واحدة: ما فيها، وكم تبعد، ومتى قيل ذلك — وزرّان.
 *
 * <p><b>والملاحةُ تُسلَّم ولا تُحسب.</b> {@code ACTION_NAVIGATE} يمرّ بمضيف
 * السيارة فيفتح تطبيقَ الخرائط الذي اختاره صاحبُها. ولا تُستعمل روابطُ Waze
 * وGoogle التي في {@code components/RouteButton.tsx}: تلك روابطُ ويب، وضغطُها
 * على شاشة السيارة يقذف السائقَ إلى هاتفه — وهو بعينه ما ترفضه المراجعة.
 *
 * <p>و{@code ACTION_DIAL} لا {@code ACTION_CALL}: يفتح لوحةَ الاتصال بالرقم
 * مكتوباً ويترك الضغطةَ الأخيرة للإنسان. فلا إذنَ اتّصالٍ يُطلب، ولا لمسةٌ
 * خاطئةٌ تُجري مكالمة.
 *
 * <p><b>ومحطةٌ تُخفي رقمها لا زرَّ اتّصالٍ لها — لا زرٌّ معطَّل.</b> زرٌّ رماديٌّ
 * يبدو قابلاً للضغط يُضغط ثلاثاً قبل أن يرفع السائقُ عينَه عن الشاشة. فيُحذف
 * الزرُّ ويُكتب سببُه سطراً.
 */
final class StationScreen extends Screen {

    private final CarData.Station station;

    StationScreen(@NonNull CarContext carContext, @NonNull CarData.Station station) {
        super(carContext);
        this.station = station;
    }

    @NonNull
    @Override
    public Template onGetTemplate() {
        Pane.Builder pane = new Pane.Builder()
                .addRow(new Row.Builder()
                        .setTitle(station.city)
                        .addText(CarData.km(station.distanceKm) + " · " + CarData.since(station.confirmedMin))
                        .build())
                .addRow(new Row.Builder()
                        .setTitle("المتوفّر الآن")
                        .addText(Products.join(station.products))
                        .build());

        if (station.phone == null) {
            pane.addRow(new Row.Builder()
                    .setTitle("لا رقم معلن")
                    .addText("هذه المحطة لا تنشر رقمها")
                    .build());
        }

        pane.addAction(new Action.Builder()
                .setTitle("الطريق")
                .setOnClickListener(this::navigate)
                .build());

        if (station.phone != null) {
            pane.addAction(new Action.Builder()
                    .setTitle("اتصل")
                    .setOnClickListener(this::call)
                    .build());
        }

        return new PaneTemplate.Builder(pane.build())
                .setTitle(station.name)
                .setHeaderAction(Action.BACK)
                .build();
    }

    private void navigate() {
        // `geo:` بإحداثيّاتٍ واسمٍ في `q`: المضيفُ يسلّمها لتطبيق الخرائط العامل.
        String uri = String.format(Locale.US, "geo:%f,%f?q=%f,%f(%s)",
                station.lat, station.lng, station.lat, station.lng, station.name);
        getCarContext().startCarApp(new Intent(CarContext.ACTION_NAVIGATE, Uri.parse(uri)));
    }

    private void call() {
        getCarContext().startCarApp(
                new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + station.phone)));
    }
}
