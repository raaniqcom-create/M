package online.muhta.app.car;

import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.Screen;
import androidx.car.app.constraints.ConstraintManager;
import androidx.car.app.model.Action;
import androidx.car.app.model.CarLocation;
import androidx.car.app.model.ItemList;
import androidx.car.app.model.MessageTemplate;
import androidx.car.app.model.Metadata;
import androidx.car.app.model.Place;
import androidx.car.app.model.PlaceListMapTemplate;
import androidx.car.app.model.PlaceMarker;
import androidx.car.app.model.Row;
import androidx.car.app.model.Template;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * المحطاتُ التي فيها هذا الوقودُ الآن، مرتَّبةً بالقرب — وخريطةُ النظام تحتها.
 *
 * <p>{@code PlaceListMapTemplate} هو قالبُ «نقاط الاهتمام»: يرسم النظامُ الخريطةَ
 * من الإحداثيّات التي تُسلَّم إليه، فلا تُرسم خريطةٌ هنا ولا يُحسب طريق. وهذا
 * بالضبط ما تشترطه فئةُ POI: ما يظهر على الخريطة محطاتُ وقودٍ لا غير — وليس في
 * بيانات هذه المنصّة نوعُ مكانٍ آخر أصلاً.
 *
 * <p>والطولُ من {@code ConstraintManager} لا رقماً مكتوباً: كلُّ شاشةِ سيّارةٍ
 * تعلن حدَّها، ورقمٌ ثابتٌ يُقصّ عند بعضها ويُرفض في المراجعة.
 */
final class StationsScreen extends Screen {

    private static final ExecutorService IO = Executors.newSingleThreadExecutor();

    private final String product;
    private CarData.Result data;
    private boolean loading = true;

    StationsScreen(@NonNull CarContext carContext, @NonNull String product) {
        super(carContext);
        this.product = product;
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
        String title = Products.label(product);

        if (loading) {
            return new PlaceListMapTemplate.Builder()
                    .setTitle(title)
                    .setHeaderAction(Action.BACK)
                    .setLoading(true)
                    .build();
        }

        List<CarData.Station> all = data == null ? new ArrayList<>() : data.stations;
        List<CarData.Station> mine = new ArrayList<>();
        for (CarData.Station s : all) if (s.products.contains(product)) mine.add(s);

        if (mine.isEmpty()) {
            return new MessageTemplate.Builder("لا محطةَ أكّدت توفّرَ " + title + " الآن.")
                    .setTitle(title)
                    .setHeaderAction(Action.BACK)
                    .build();
        }

        int cap = getCarContext()
                .getCarService(ConstraintManager.class)
                .getContentLimit(ConstraintManager.CONTENT_LIMIT_TYPE_PLACE_LIST);

        ItemList.Builder list = new ItemList.Builder();
        int n = Math.min(cap, mine.size());
        for (int i = 0; i < n; i++) {
            final CarData.Station s = mine.get(i);
            list.addItem(new Row.Builder()
                    .setTitle(s.name)
                    // سطران لا أكثر، وكلاهما يُقرأ بلمحة: كم بعيدة، ومتى قيلت.
                    .addText(CarData.km(s.distanceKm) + " · " + s.city)
                    .addText(CarData.since(s.confirmedMin))
                    .setBrowsable(true)
                    .setMetadata(new Metadata.Builder()
                            .setPlace(new Place.Builder(CarLocation.create(s.lat, s.lng))
                                    .setMarker(new PlaceMarker.Builder().build())
                                    .build())
                            .build())
                    .setOnClickListener(() ->
                            getScreenManager().push(new StationScreen(getCarContext(), s)))
                    .build());
        }

        return new PlaceListMapTemplate.Builder()
                .setTitle(title)
                .setHeaderAction(Action.BACK)
                .setItemList(list.build())
                .build();
    }
}
