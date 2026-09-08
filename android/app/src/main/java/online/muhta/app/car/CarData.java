package online.muhta.app.car;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.util.Log;

import androidx.core.content.ContextCompat;

import online.muhta.app.BuildConfig;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * البياناتُ لشاشة السيارة — بلا WebView وبلا Capacitor.
 *
 * <p>شاشةُ السيارة تعمل والتطبيقُ مغلق؛ فلو انتظرت جسرَ Capacitor لَما عملت.
 * فهي تنادي القاعدةَ مباشرةً بنداءٍ واحد: {@code car_nearby}.
 *
 * <p><b>ولا قاعدةَ توفّرٍ هنا.</b> «متوفّرٌ الآن» أربعةُ شروط — متوفّر، وحديثٌ
 * دون أربعٍ وعشرين ساعة، ولم يمرّ موعدُ نفاده، ومحطتُه مفتوحةٌ بتوقيت بغداد —
 * وكلُّها تُحسب في SQL. ولها في المشروع ثلاثُ نسخٍ اليوم وإحداها خاطئة، فنسخةٌ
 * رابعةٌ هنا كانت ستزيد الطينَ بلّة. هذا الملفُّ يجلب ويرسم، ولا يحكم.
 */
final class CarData {

    private static final String TAG = "MuhtaCar";

    /** مركزُ الأنبار — وإليه تُقاس «هل أنت داخل نطاق الخدمة؟». */
    private static final double ANBAR_LAT = 33.4258;
    private static final double ANBAR_LNG = 43.3012;

    /**
     * ثلاثُمئة كيلومترٍ: خارجها لا يُقاس من موقع الجهاز.
     *
     * <p>بياناتُ المنصّة كلُّها داخل محافظةٍ واحدة. فمن يفتح التطبيق في أربيل أو
     * عمّان — أو مراجعُ متجرٍ في كاليفورنيا — قائمتُه فارغةٌ بحقّ، و«فارغة» لا
     * تُقرأ «بعيد» بل تُقرأ «معطّل». فيُقاس من مركز الرمادي، ويُكتب ذلك على
     * الشاشة صراحةً. سلوكٌ صادقٌ لعراقيٍّ مغترب، لا حيلةُ مراجعة.
     */
    private static final double SERVICE_RADIUS_KM = 300;

    /** المهلةُ التي تُعدّ بعدها اللقطةُ قديمةً فتُجلب من جديد. */
    private static final long CACHE_MS = 3 * 60 * 1000L;

    /** صفُّ محطةٍ كما تردّه القاعدة. */
    static final class Station {
        final String id;
        final String name;
        final String city;
        final double lat;
        final double lng;
        final double distanceKm;
        final List<String> products;
        final int confirmedMin;
        /** {@code null} حين تُخفي المحطةُ رقمها ولم تُفتح بوّابةُ المسافر. */
        final String phone;

        Station(String id, String name, String city, double lat, double lng,
                double distanceKm, List<String> products, int confirmedMin, String phone) {
            this.id = id;
            this.name = name;
            this.city = city;
            this.lat = lat;
            this.lng = lng;
            this.distanceKm = distanceKm;
            this.products = products;
            this.confirmedMin = confirmedMin;
            this.phone = phone;
        }
    }

    /** نتيجةُ جلبةٍ واحدة — ومعها سببُ فشلها إن فشلت، وهل قِيست من موقعٍ حقيقيّ. */
    static final class Result {
        final List<Station> stations;
        final boolean outOfRange;
        final String error;

        Result(List<Station> stations, boolean outOfRange, String error) {
            this.stations = stations;
            this.outOfRange = outOfRange;
            this.error = error;
        }
    }

    private static Result cached;
    private static long cachedAt;

    private CarData() {}

    static synchronized void invalidate() {
        cached = null;
        cachedAt = 0;
    }

    /**
     * يُنادى من خيطٍ خلفيّ لا من خيط الواجهة: فيه شبكة.
     */
    static synchronized Result load(Context context) {
        long now = System.currentTimeMillis();
        if (cached != null && now - cachedAt < CACHE_MS) return cached;

        if (BuildConfig.SUPABASE_URL.isEmpty() || BuildConfig.SUPABASE_ANON_KEY.isEmpty()) {
            // إعدادُ البناء ناقص — يُقال ولا يُترك صامتاً.
            return new Result(new ArrayList<>(), false, "الإعداد ناقص — أعِد تثبيت التطبيق");
        }

        Location fix = lastKnown(context);
        boolean outOfRange = true;
        double lat = ANBAR_LAT;
        double lng = ANBAR_LNG;
        if (fix != null) {
            double away = haversineKm(fix.getLatitude(), fix.getLongitude(), ANBAR_LAT, ANBAR_LNG);
            if (away <= SERVICE_RADIUS_KM) {
                lat = fix.getLatitude();
                lng = fix.getLongitude();
                outOfRange = false;
            }
        }

        try {
            Result r = new Result(fetch(lat, lng), outOfRange, null);
            cached = r;
            cachedAt = now;
            return r;
        } catch (Exception e) {
            Log.w(TAG, "car_nearby failed", e);
            // لقطةٌ قديمةٌ خيرٌ من شاشةٍ فارغة — ما دام يُقال إنّها قديمة.
            if (cached != null) return cached;
            return new Result(new ArrayList<>(), outOfRange, "تعذّر الاتصال — تحقّق من الإنترنت");
        }
    }

    /** آخرُ موقعٍ يعرفه النظام. ولا تُطلب أذوناتٌ من شاشة السيارة: تُمنح في الهاتف. */
    private static Location lastKnown(Context context) {
        boolean fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) return null;

        LocationManager lm = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return null;

        Location best = null;
        try {
            for (String provider : lm.getProviders(true)) {
                Location l = lm.getLastKnownLocation(provider);
                if (l == null) continue;
                if (best == null || l.getTime() > best.getTime()) best = l;
            }
        } catch (SecurityException ignored) {
            return null;
        }
        return best;
    }

    private static List<Station> fetch(double lat, double lng) throws Exception {
        URL url = new URL(BuildConfig.SUPABASE_URL + "/rest/v1/rpc/car_nearby");
        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        try {
            c.setRequestMethod("POST");
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("apikey", BuildConfig.SUPABASE_ANON_KEY);
            c.setRequestProperty("Authorization", "Bearer " + BuildConfig.SUPABASE_ANON_KEY);

            JSONObject body = new JSONObject();
            body.put("p_lat", lat);
            body.put("p_lng", lng);
            body.put("p_limit", 40);
            try (OutputStream os = c.getOutputStream()) {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }

            int code = c.getResponseCode();
            if (code < 200 || code >= 300) throw new Exception("HTTP " + code);

            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(
                    new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
            }

            JSONArray arr = new JSONArray(sb.toString());
            List<Station> out = new ArrayList<>(arr.length());
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                JSONArray p = o.optJSONArray("products");
                List<String> products = new ArrayList<>();
                if (p != null) for (int j = 0; j < p.length(); j++) products.add(p.getString(j));
                out.add(new Station(
                        o.getString("id"),
                        o.getString("name"),
                        o.optString("city", ""),
                        o.getDouble("lat"),
                        o.getDouble("lng"),
                        o.getDouble("distance_km"),
                        products,
                        o.optInt("confirmed_min", 0),
                        o.isNull("phone") ? null : o.getString("phone")));
            }
            return out;
        } finally {
            c.disconnect();
        }
    }

    static double haversineKm(double aLat, double aLng, double bLat, double bLng) {
        double r = 6371;
        double dLat = Math.toRadians(bLat - aLat);
        double dLng = Math.toRadians(bLng - aLng);
        double h = Math.pow(Math.sin(dLat / 2), 2)
                + Math.cos(Math.toRadians(aLat)) * Math.cos(Math.toRadians(bLat))
                * Math.pow(Math.sin(dLng / 2), 2);
        return 2 * r * Math.asin(Math.sqrt(h));
    }

    /** «١٢٫٣ كم» — رقمٌ عربيٌّ بمنزلةٍ واحدة، كما في بطاقة المحطة على الهاتف. */
    static String km(double v) {
        return String.format(Locale.forLanguageTag("ar"), "%.1f كم", v);
    }

    /**
     * «أُكِّد قبل …» — والصيغةُ تتبع العدد.
     *
     * <p>مرآةُ {@code plural} في {@code lib/freshness.ts}: العربيّةُ تُثنّي
     * وتجمع جمعَ قلّة، و«قبل ٣ ساعة» خطأٌ يقرؤه القارئُ إهمالاً.
     */
    static String since(int minutes) {
        if (minutes < 1) return "أُكِّد الآن";
        if (minutes < 60) return "أُكِّد قبل " + plural(minutes, "دقيقة", "دقيقتين", "دقائق", "دقيقة");
        int h = minutes / 60;
        if (h < 24) return "أُكِّد قبل " + plural(h, "ساعة", "ساعتين", "ساعات", "ساعة");
        int d = h / 24;
        return "أُكِّد قبل " + plural(d, "يوم", "يومين", "أيام", "يوماً");
    }

    private static String plural(int n, String one, String two, String few, String many) {
        if (n == 1) return one;
        if (n == 2) return two;
        int mod = n % 100;
        if (mod >= 3 && mod <= 10) return n + " " + few;
        return n + " " + many;
    }
}
