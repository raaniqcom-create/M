import CoreLocation
import Foundation

/// البياناتُ لشاشة CarPlay — بلا WebView وبلا Capacitor.
///
/// شاشةُ السيارة تعمل والتطبيقُ مغلق، فلو انتظرت جسرَ Capacitor لَما عملت.
/// فهي تنادي القاعدةَ مباشرةً بنداءٍ واحد: `car_nearby`.
///
/// **ولا قاعدةَ توفّرٍ هنا.** «متوفّرٌ الآن» أربعةُ شروط — متوفّر، وحديثٌ دون
/// أربعٍ وعشرين ساعة، ولم يمرّ موعدُ نفاده، ومحطتُه مفتوحةٌ بتوقيت بغداد —
/// وكلُّها تُحسب في SQL. ولها في المشروع ثلاثُ نسخٍ اليوم وإحداها خاطئة، فنسخةٌ
/// رابعةٌ هنا كانت ستزيد الطينَ بلّة. هذا الملفُّ يجلب ويرسم، ولا يحكم.
enum CarData {

    /// مركزُ الأنبار — وإليه تُقاس «هل أنت داخل نطاق الخدمة؟».
    static let anbar = CLLocationCoordinate2D(latitude: 33.4258, longitude: 43.3012)

    /// ثلاثُمئة كيلومترٍ: خارجها لا يُقاس من موقع الجهاز.
    ///
    /// بياناتُ المنصّة كلُّها داخل محافظةٍ واحدة. فمن يفتح التطبيق في أربيل أو
    /// عمّان — أو مراجعُ متجرٍ في كاليفورنيا — قائمتُه فارغةٌ بحقّ، و«فارغة» لا
    /// تُقرأ «بعيد» بل تُقرأ «معطّل». فيُقاس من مركز الرمادي، ويُكتب ذلك على
    /// الشاشة صراحةً. سلوكٌ صادقٌ لعراقيٍّ مغترب، لا حيلةُ مراجعة.
    static let serviceRadiusKm: Double = 300

    /// المهلةُ التي تُعدّ بعدها اللقطةُ قديمةً فتُجلب من جديد.
    static let cacheSeconds: TimeInterval = 180

    struct Station {
        let id: String
        let name: String
        let city: String
        let lat: Double
        let lng: Double
        let distanceKm: Double
        let products: [String]
        let confirmedMin: Int
        /// `nil` حين تُخفي المحطةُ رقمها ولم تُفتح بوّابةُ المسافر.
        let phone: String?
    }

    struct Result {
        let stations: [Station]
        let outOfRange: Bool
        let error: String?
    }

    private static var cached: Result?
    private static var cachedAt: Date?
    private static let manager = CLLocationManager()

    static func invalidate() {
        cached = nil
        cachedAt = nil
    }

    /// العنوانُ والمفتاحُ العامّ من `Info.plist` — يُحقنان عند البناء ولا
    /// يُكتبان في المصدر. والمستودعُ عامّ، وقد كلّف ذلك الدرسُ ثمنَه مرّةً.
    private static func setting(_ key: String) -> String {
        (Bundle.main.object(forInfoDictionaryKey: key) as? String) ?? ""
    }

    static func load(_ done: @escaping (Result) -> Void) {
        if let c = cached, let at = cachedAt, Date().timeIntervalSince(at) < cacheSeconds {
            done(c)
            return
        }

        let base = setting("MuhtaSupabaseURL")
        let key = setting("MuhtaSupabaseAnonKey")
        guard !base.isEmpty, !key.isEmpty,
              let url = URL(string: base + "/rest/v1/rpc/car_nearby") else {
            done(Result(stations: [], outOfRange: false, error: "الإعداد ناقص — أعِد تثبيت التطبيق"))
            return
        }

        // لا نافذةَ إذنٍ من شاشة السيارة: CarPlay لا يستطيع عرضَها، والإذنُ
        // يُمنح في الهاتف مرّةً. فيُقرأ ما هو ممنوحٌ الآن، ولا يُطلب شيء.
        var lat = anbar.latitude
        var lng = anbar.longitude
        var outOfRange = true
        // `manager.authorizationStatus` لا `CLLocationManager.authorizationStatus()`:
        // الثانيةُ مهجورةٌ منذ iOS 14 وقد تُرفض على SDK حديث، والهدفُ 15.
        let status = manager.authorizationStatus
        if status == .authorizedWhenInUse || status == .authorizedAlways,
           let here = manager.location {
            let away = haversineKm(here.coordinate.latitude, here.coordinate.longitude,
                                   anbar.latitude, anbar.longitude)
            if away <= serviceRadiusKm {
                lat = here.coordinate.latitude
                lng = here.coordinate.longitude
                outOfRange = false
            }
        }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 8
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(key, forHTTPHeaderField: "apikey")
        req.setValue("Bearer " + key, forHTTPHeaderField: "Authorization")
        req.httpBody = try? JSONSerialization.data(withJSONObject: [
            "p_lat": lat, "p_lng": lng, "p_limit": 40,
        ])

        URLSession.shared.dataTask(with: req) { data, response, _ in
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard code >= 200, code < 300, let data = data,
                  let raw = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                // لقطةٌ قديمةٌ خيرٌ من شاشةٍ فارغة — ما دام يُقال إنّها قديمة.
                DispatchQueue.main.async {
                    done(cached ?? Result(stations: [], outOfRange: outOfRange,
                                          error: "تعذّر الاتصال — تحقّق من الإنترنت"))
                }
                return
            }

            let stations: [Station] = raw.compactMap { o in
                // **والإحداثيّةُ لا تُستبدل بصفر.** (0,0) نقطةٌ صالحةٌ في المحيط
                // الأطلسيّ قبالة غانا — فصفٌّ ناقصٌ كان يصير محطةً على بُعد
                // خمسة آلاف كيلومتر، ويُسلَّم دليلاً إلى خرائط آبل. فيُسقَط.
                guard let id = o["id"] as? String, let name = o["name"] as? String,
                      let lat = o["lat"] as? Double, let lng = o["lng"] as? Double else { return nil }
                return Station(
                    id: id,
                    name: name,
                    city: o["city"] as? String ?? "",
                    lat: lat,
                    lng: lng,
                    distanceKm: o["distance_km"] as? Double ?? 0,
                    products: o["products"] as? [String] ?? [],
                    confirmedMin: o["confirmed_min"] as? Int ?? 0,
                    phone: o["phone"] as? String)
            }

            let result = Result(stations: stations, outOfRange: outOfRange, error: nil)
            cached = result
            cachedAt = Date()
            DispatchQueue.main.async { done(result) }
        }.resume()
    }

    static func haversineKm(_ aLat: Double, _ aLng: Double, _ bLat: Double, _ bLng: Double) -> Double {
        let r = 6371.0
        let dLat = (bLat - aLat) * .pi / 180
        let dLng = (bLng - aLng) * .pi / 180
        let h = pow(sin(dLat / 2), 2)
            + cos(aLat * .pi / 180) * cos(bLat * .pi / 180) * pow(sin(dLng / 2), 2)
        return 2 * r * asin(sqrt(h))
    }

    /// «١٢٫٣ كم» بمنزلةٍ واحدة، كما في بطاقة المحطة على الهاتف.
    static func km(_ v: Double) -> String {
        String(format: "%.1f كم", v)
    }

    /// «أُكِّد قبل …» — والصيغةُ تتبع العدد.
    ///
    /// مرآةُ `plural` في `lib/freshness.ts`: العربيّةُ تُثنّي وتجمع جمعَ قلّة،
    /// و«قبل ٣ ساعة» خطأٌ يقرؤه القارئُ إهمالاً.
    static func since(_ minutes: Int) -> String {
        if minutes < 1 { return "أُكِّد الآن" }
        if minutes < 60 { return "أُكِّد قبل " + plural(minutes, "دقيقة", "دقيقتين", "دقائق", "دقيقة") }
        let h = minutes / 60
        if h < 24 { return "أُكِّد قبل " + plural(h, "ساعة", "ساعتين", "ساعات", "ساعة") }
        return "أُكِّد قبل " + plural(h / 24, "يوم", "يومين", "أيام", "يوماً")
    }

    private static func plural(_ n: Int, _ one: String, _ two: String,
                               _ few: String, _ many: String) -> String {
        if n == 1 { return one }
        if n == 2 { return two }
        let mod = n % 100
        return "\(n) " + ((mod >= 3 && mod <= 10) ? few : many)
    }
}

/// أسماءُ الوقود وترتيبُه — مرآةُ `PRODUCT_ORDER` و`PRODUCT_LABELS` في
/// `lib/products.ts`. ولا سبيلَ إلى استيراد TypeScript في Swift، فتُقال صراحةً.
///
/// **و«كاز» يبقى.** وقعت مشورةٌ بحذفه بحجّة أنّه وقودُ تدفئةٍ لا وقودُ سيّارة،
/// والقياسُ يقول غيرَ ذلك: يومَ كُتب هذا كانت إحدى عشرةَ محطةَ كازٍ مؤكَّدةً
/// حديثاً مقابل ثلاثٍ للبانزين العاديّ. فحذفُه كان سيُفرغ الشاشة.
enum CarProducts {
    static let order = [
        "gasoline_regular", "gasoline_premium", "gasoline_super",
        "kerosene", "gas", "lpg", "white_oil",
    ]

    static let labels: [String: String] = [
        "gasoline_regular": "بانزين عادي",
        "gasoline_premium": "بانزين محسن",
        "gasoline_super": "بانزين سوبر",
        "kerosene": "كاز",
        "gas": "غاز",
        "lpg": "LPG",
        "white_oil": "نفط أبيض",
    ]

    static func label(_ key: String) -> String { labels[key] ?? key }

    static func join(_ keys: [String]) -> String {
        order.filter { keys.contains($0) }.map(label).joined(separator: " · ")
    }
}
