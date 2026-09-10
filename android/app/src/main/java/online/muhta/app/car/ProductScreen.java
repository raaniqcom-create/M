package online.muhta.app.car;

import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.Screen;
import androidx.car.app.model.Action;
import androidx.car.app.model.ActionStrip;
import androidx.car.app.model.ItemList;
import androidx.car.app.model.ListTemplate;
import androidx.car.app.model.MessageTemplate;
import androidx.car.app.model.Row;
import androidx.car.app.model.Template;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * الشاشةُ الأولى: أيُّ وقودٍ تريد؟
 *
 * <p>ولا شبكةَ في هذه الدالّة: {@code onGetTemplate} تُنادى على خيط الواجهة،
 * وشبكةٌ فيها تُجمّد شاشةَ سيّارةٍ تسير. فتُجلب البياناتُ في خيطٍ خلفيّ، ثمّ
 * {@code invalidate()} تُعيد رسمَ القالب.
 *
 * <p><b>وقائمةٌ لا شبكة.</b> شبكةُ الأزرار تحتاج أيقونةً لكلّ زرّ، وسبعُ أيقوناتٍ
 * لسبعةِ أنواعِ وقودٍ لا يميّزها الناظرُ بلمحة — والاسمُ العربيُّ يُقرأ أسرع.
 * ومع كلّ اسمٍ عددُ المحطات، فيعرف قبل أن يضغط أنّ هناك ما يستحقّ الضغط.
 *
 * <p>والأنواعُ المعروضةُ من البيانات لا من قائمةٍ ثابتة: نوعٌ لا محطةَ له لا
 * يُعرض أصلاً، فلا يقود ضغطُه إلى «لا توجد محطة». أداةُ تصفيةٍ لا تعرض خياراً
 * فارغاً.
 */
public final class ProductScreen extends Screen {

    private static final ExecutorService IO = Executors.newSingleThreadExecutor();

    private CarData.Result data;
    private boolean loading = true;

    ProductScreen(@NonNull CarContext carContext) {
        super(carContext);
        refresh();
    }

    private void refresh() {
        loading = true;
        IO.execute(() -> {
            CarData.Result r = CarData.load(getCarContext());
            getCarContext().getMainExecutor().execute(() -> {
                data = r;
                loading = false;
                invalidate();
            });
        });
    }

    @NonNull
    @Override
    public Template onGetTemplate() {
        ActionStrip strip = new ActionStrip.Builder()
                .addAction(new Action.Builder()
                        .setTitle("تحديث")
                        .setOnClickListener(() -> {
                            CarData.invalidate();
                            refresh();
                        })
                        .build())
                .build();

        if (loading) {
            return new MessageTemplate.Builder("جارٍ الجلب…")
                    .setTitle("المحطة التقنية")
                    .setLoading(true)
                    .build();
        }

        if (data != null && data.error != null) {
            // الخطأُ يُسمّى ولا يُعرض فراغاً: شاشةٌ فارغةٌ تُقرأ «لا وقود»، وهي
            // أسوأُ كذبةٍ تقولها هذه المنصّة.
            return new MessageTemplate.Builder(data.error)
                    .setTitle("المحطة التقنية")
                    .setHeaderAction(Action.APP_ICON)
                    .setActionStrip(strip)
                    .build();
        }

        List<CarData.Station> stations = data == null ? new ArrayList<>() : data.stations;

        // كم محطةً لكلّ نوع، بترتيب `PRODUCT_ORDER`.
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (String key : Products.ORDER) counts.put(key, 0);
        for (CarData.Station s : stations) {
            for (String p : s.products) {
                Integer c = counts.get(p);
                if (c != null) counts.put(p, c + 1);
            }
        }

        ItemList.Builder list = new ItemList.Builder();
        int shown = 0;
        for (Map.Entry<String, Integer> e : counts.entrySet()) {
            if (e.getValue() == 0) continue;
            final String key = e.getKey();
            list.addItem(new Row.Builder()
                    .setTitle(Products.label(key))
                    .addText(e.getValue() + " محطة")
                    .setBrowsable(true)
                    .setOnClickListener(() ->
                            getScreenManager().push(new StationsScreen(getCarContext(), key)))
                    .build());
            shown++;
        }

        if (shown == 0) {
            return new MessageTemplate.Builder(
                    "لا محطةَ أكّدت توفّرَ وقودٍ الآن قربك.\nجرّب بعد قليل.")
                    .setTitle("المحطة التقنية")
                    .setHeaderAction(Action.APP_ICON)
                    .setActionStrip(strip)
                    .build();
        }

        // شريطُ العنوان يقطع ما زاد بثلاث نقاط، فلا يُحمَّل ما لا يتّسع له.
        return new ListTemplate.Builder()
                .setTitle("أيّ وقودٍ تريد؟")
                .setHeaderAction(Action.APP_ICON)
                .setActionStrip(strip)
                .setSingleList(list.build())
                .build();
    }
}
