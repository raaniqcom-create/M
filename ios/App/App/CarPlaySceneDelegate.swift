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

    func templateApplicationScene(_ scene: CPTemplateApplicationScene,
                                  didConnect interfaceController: CPInterfaceController) {
        interface = interfaceController
        interfaceController.setRootTemplate(loadingTemplate(), animated: false, completion: nil)
        refresh()
    }

    func templateApplicationScene(_ scene: CPTemplateApplicationScene,
                                  didDisconnectInterfaceController interfaceController: CPInterfaceController) {
        interface = nil
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

        let title = result.outOfRange
            ? "أيّ وقودٍ تريد؟ · تُقاس من مركز الرمادي"
            : "أيّ وقودٍ تريد؟"
        let grid = CPGridTemplate(title: title, gridButtons: buttons)
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

            poi.primaryButton = CPTextButton(title: "الطريق", textStyle: .confirm) { _ in
                item.openInMaps(launchOptions: [
                    MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving,
                ])
            }

            // ومحطةٌ تُخفي رقمها لا زرَّ اتّصالٍ لها — لا زرٌّ معطَّل. زرٌّ يبدو
            // قابلاً للضغط يُضغط ثلاثاً قبل أن يرفع السائقُ عينَه عن الطريق.
            if let phone = station.phone,
               let tel = URL(string: "tel://" + phone.filter({ $0.isNumber })) {
                poi.secondaryButton = CPTextButton(title: "اتصل", textStyle: .normal) { _ in
                    UIApplication.shared.open(tel)
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
