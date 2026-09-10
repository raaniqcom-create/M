import CarPlay
import MapKit
import UIKit

/// شاشةُ CarPlay — فئةُ **الوقود** (`carplay-fueling`).
///
/// ولا Capacitor في هذا الملفّ ولا في `CarData`: شاشةُ السيارة قوالبُ يرسمها
/// النظام، وWebView لا يظهر عليها بحال. وهذا الفصلُ ليس أناقةً — `SceneDelegate`
/// يبني `CAPBridgeViewController`، ولو وصل إليه مشهدُ السيارة لَسقط التطبيقُ عند
/// الوصل. والتفريقُ في `AppDelegate.configurationForConnecting`.
///
/// ── وشاشتان لا ثلاث ─────────────────────────────────────────────────────────
///
/// الجذرُ شبكةٌ بأنواع الوقود، ثمّ `CPPointOfInterestTemplate` بالمحطات —
/// والخريطةُ يرسمها النظامُ من الإحداثيّات، فلا خريطةَ تُرسم هنا ولا طريقٌ
/// يُحسب. وذلك بعينه شرطُ فئة الوقود: لا يظهر على الخريطة غيرُ محطات الوقود —
/// وليس في بيانات هذه المنصّة نوعُ مكانٍ آخر أصلاً.
///
/// والعمقُ اثنان من خمسةٍ مسموحة.
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {

    private var interface: CPInterfaceController?

    /// مشهدُ السيّارة — وهو **الذي يفتح التطبيقات**، لا `UIApplication`.
    /// `weak` لأنّ النظامَ يملكه ويهدمه عند الفصل.
    private weak var carScene: CPTemplateApplicationScene?

    func templateApplicationScene(_ scene: CPTemplateApplicationScene,
                                  didConnect interfaceController: CPInterfaceController) {
        interface = interfaceController
        carScene = scene
        interfaceController.setRootTemplate(loadingTemplate(), animated: false, completion: nil)
        refresh()
    }

    func templateApplicationScene(_ scene: CPTemplateApplicationScene,
                                  didDisconnectInterfaceController interfaceController: CPInterfaceController) {
        interface = nil
        carScene = nil
    }

    // MARK: - الجذر

    private func loadingTemplate() -> CPTemplate {
        CPInformationTemplate(title: "المحطة التقنية",
                              layout: .leading,
                              items: [CPInformationItem(title: "جارٍ الجلب…", detail: nil)],
                              actions: [])
    }

    private func refresh() {
        CarData.load { [weak self] result in
            guard let self, let interface = self.interface else { return }
            interface.setRootTemplate(self.rootTemplate(result), animated: false, completion: nil)
        }
    }

    private func rootTemplate(_ result: CarData.Result) -> CPTemplate {
        if let error = result.error {
            // الخطأُ يُسمّى ولا يُعرض فراغاً: شاشةٌ فارغةٌ تُقرأ «لا وقود»، وهي
            // أسوأُ كذبةٍ تقولها هذه المنصّة.
            return CPInformationTemplate(title: "المحطة التقنية",
                                         layout: .leading,
                                         items: [CPInformationItem(title: error, detail: nil)],
                                         actions: [reloadAction()])
        }

        // الأنواعُ من البيانات لا من قائمةٍ ثابتة: نوعٌ لا محطةَ له لا يُعرض،
        // فلا يقود ضغطُه إلى «لا توجد محطة». أداةُ تصفيةٍ لا تعرض خياراً فارغاً.
        var counts: [String: Int] = [:]
        for station in result.stations {
            for product in station.products { counts[product, default: 0] += 1 }
        }

        let available = CarProducts.order.filter { (counts[$0] ?? 0) > 0 }
        guard !available.isEmpty else {
            return CPInformationTemplate(
                title: "المحطة التقنية",
                layout: .leading,
                items: [CPInformationItem(title: "لا محطةَ أكّدت توفّرَ وقودٍ الآن قربك.",
                                          detail: "جرّب بعد قليل.")],
                actions: [reloadAction()])
        }

        // سقفُ الشبكة ثمانية، وأنواعُ الوقود سبعة — فتسع كلُّها.
        let buttons: [CPGridButton] = available.prefix(8).map { key in
            CPGridButton(titleVariants: ["\(CarProducts.label(key)) · \(counts[key] ?? 0)",
                                         CarProducts.label(key)],
                         image: Self.pump) { [weak self] _ in
                self?.showStations(product: key, from: result)
            }
        }

        // شريطُ العنوان يقطع ما زاد بثلاث نقاط، فلا يُحمَّل ما لا يتّسع له.
        let grid = CPGridTemplate(title: "أيّ وقودٍ تريد؟", gridButtons: buttons)
        grid.trailingNavigationBarButtons = [reloadBarButton()]
        return grid
    }

    // MARK: - المحطات

    private func showStations(product: String, from result: CarData.Result) {
        let mine = result.stations.filter { $0.products.contains(product) }
        guard !mine.isEmpty else { return }

        // سقفُ القالب اثنتا عشرة نقطة.
        let points: [CPPointOfInterest] = mine.prefix(12).map { station in
            let placemark = MKPlacemark(coordinate: CLLocationCoordinate2D(
                latitude: station.lat, longitude: station.lng))
            let item = MKMapItem(placemark: placemark)
            item.name = station.name

            let poi = CPPointOfInterest(
                location: item,
                title: station.name,
                subtitle: "\(CarData.km(station.distanceKm)) · \(station.city)",
                summary: CarData.since(station.confirmedMin),
                detailTitle: station.name,
                detailSubtitle: CarProducts.join(station.products),
                detailSummary: station.phone == nil
                    ? "هذه المحطة لا تنشر رقمها"
                    : CarData.since(station.confirmedMin),
                pinImage: nil)

            // والطريقُ يفتح ويز على شاشة السيّارة. انظر `navigate`.
            poi.primaryButton = CPTextButton(title: "الطريق", textStyle: .confirm) { [weak self] _ in
                self?.navigate(lat: station.lat, lng: station.lng)
            }

            // ومحطةٌ تُخفي رقمها لا زرَّ اتّصالٍ لها — لا زرٌّ معطَّل. زرٌّ يبدو
            // قابلاً للضغط يُضغط ثلاثاً قبل أن يرفع السائقُ عينَه عن الطريق.
            //
            // **وشاشةُ تأكيد الاتّصال تبقى على الهاتف، وذلك صحيح.** يعرضها
            // النظامُ لا التطبيق، وتطبيقُ فئة الوقود لا يملك وضعَها على شاشة
            // السيارة. وبعد اتّصال المكالمة تنتقل إلى واجهة السيّارة وصوتها.
            //
            // و`+` يبقى: رقمٌ بصيغة +964 يُدخله المشرفُ خاماً بلا تطبيع
            // (`components/AdminStationForm.tsx`)، وحذفُ علامته يجعله محلّيّاً.
            if let phone = station.phone,
               let tel = URL(string: "tel:" + phone.filter({ $0.isNumber || $0 == "+" })) {
                poi.secondaryButton = CPTextButton(title: "اتصل", textStyle: .normal) { [weak self] _ in
                    UIApplication.shared.open(tel, options: [:]) { ok in
                        if !ok { DispatchQueue.main.async { self?.carAlert("تعذّر الاتصال") } }
                    }
                }
            }
            return poi
        }

        let template = CPPointOfInterestTemplate(
            title: CarProducts.label(product),
            pointsOfInterest: points,
            selectedIndex: NSNotFound)
        interface?.pushTemplate(template, animated: true, completion: nil)
    }

    // MARK: - أدوات

    /// يفتح ويز — ولا ثانيَ له.
    ///
    /// ── ولمَ المشهدُ لا `UIApplication` ──────────────────────────────────
    ///
    /// **كنتُ مخطئاً.** ظننتُ أنّ تطبيقَ فئة الوقود لا يملك أن يضع تطبيقاً
    /// آخرَ على شاشة السيّارة، فكتبتُ `UIApplication.shared.open` — وهي تفتح
    /// على **الهاتف** لا على السيّارة، وتردّ `false` والهاتفُ مقفل. وذلك ما
    /// رآه صاحبُ المنصّة ٢٠٢٦-٠٩-١٠ الساعةَ ١٩:٥٥: ويز في رصيف السيّارة أمام
    /// عينه، ورسالةُ «أيقظ الشاشة» على الشاشة.
    ///
    /// وجوابُ آبل في منتداها (thread/128945) صريح: يُفتح من **مشهد السيّارة**
    /// — `CPTemplateApplicationScene.open` — لا من `UIApplication`، «وإلّا
    /// فُتح التطبيقُ الهدفُ على شاشة الجهاز بدل شاشة السيّارة». ومثالُها
    /// الرسميُّ «CarPlay Quick Ordering» تطبيقُ **طلبات** لا ملاحة، ويفتح به
    /// الخرائطَ على شاشة السيّارة. فالقيدُ الذي ظننتُه ليس هنا.
    ///
    /// ── وويز وحده ────────────────────────────────────────────────────────
    ///
    /// قرارُ صاحب المنصّة، ومن أرضِ الواقع: في العراق ويز وحده يعطي الطريق،
    /// وخرائطُ جوجل لا تعطي شيئاً، وخرائطُ آبل لا تعرف البلدَ أصلاً. فلا
    /// احتياطَ يُعرض — بديلٌ لا يوصل أسوأُ من لا شيء.
    ///
    /// و`canOpenURL` تكذب بلا `LSApplicationQueriesSchemes` في `Info.plist`.
    private func navigate(lat: Double, lng: Double) {
        guard let url = URL(string: "waze://?ll=\(lat),\(lng)&navigate=yes") else { return }

        guard UIApplication.shared.canOpenURL(url) else {
            carAlert("ويز غيرُ مثبَّتٍ على هاتفك — وهو وحده يعطي الطريق في العراق. ثبّته من App Store.",
                     "ثبّت ويز من App Store")
            return
        }

        guard let scene = carScene else {
            carAlert("انقطع وصلُ السيّارة — افصل الكابل وأعِده.", "أعِد وصلَ الهاتف")
            return
        }

        scene.open(url, options: nil) { [weak self] ok in
            guard !ok else { return }
            DispatchQueue.main.async {
                self?.carAlert(
                    "لم يفتح ويز. افتح قفل هاتفك، شغّل ويز مرّةً، ثمّ عُد واضغط «الطريق».",
                    "افتح قفل الهاتف وشغّل ويز، ثمّ أعد المحاولة",
                    "افتح ويز على هاتفك")
            }
        }
    }

    /// خطأٌ يُقال على شاشة السيارة.
    ///
    /// ولا Mac في هذا المشروع يقرأ سجلّاً، ولا Xcode يُوصَل بهاتف — فالبناءُ
    /// كلُّه على خادمٍ سحابيّ والتجربةُ في سيّارة. فبلا هذا التنبيه لا يُفرَّق
    /// بين «الزرُّ لم يُنادَ» و«نُودي فرُفض الفتح»، وهما بابان مختلفان.
    private func carAlert(_ variants: String...) {
        interface?.presentTemplate(
            CPAlertTemplate(titleVariants: variants, actions: [
                CPAlertAction(title: "حسناً", style: .cancel) { [weak self] _ in
                    self?.interface?.dismissTemplate(animated: true, completion: nil)
                },
            ]), animated: true, completion: nil)
    }

    private func reloadAction() -> CPTextButton {
        CPTextButton(title: "تحديث", textStyle: .normal) { [weak self] _ in
            CarData.invalidate()
            self?.refresh()
        }
    }

    private func reloadBarButton() -> CPBarButton {
        CPBarButton(title: "تحديث") { [weak self] _ in
            CarData.invalidate()
            self?.refresh()
        }
    }

    /// أيقونةُ الشبكة — رمزُ نظامٍ لا صورةٌ في الحزمة، فتتبع سِمةَ الشاشة
    /// (ليلاً ونهاراً) بلا ملفّين.
    private static let pump: UIImage = {
        UIImage(systemName: "fuelpump.fill") ?? UIImage()
    }()
}
