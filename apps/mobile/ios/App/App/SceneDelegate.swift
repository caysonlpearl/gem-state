import UIKit
import Capacitor
import AppTrackingTransparency

@objc(BluebirdPrivacyPlugin)
public class BluebirdPrivacyPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BluebirdPrivacyPlugin"
    public let jsName = "BluebirdPrivacy"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "trackingStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestTracking", returnType: CAPPluginReturnPromise)
    ]
    private func statusName(_ status: ATTrackingManager.AuthorizationStatus) -> String {
        switch status {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "not_determined"
        @unknown default: return "restricted"
        }
    }
    @objc func trackingStatus(_ call: CAPPluginCall) {
        call.resolve(["status": statusName(ATTrackingManager.trackingAuthorizationStatus)])
    }
    @objc func requestTracking(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            ATTrackingManager.requestTrackingAuthorization { status in
                call.resolve(["status": self.statusName(status)])
            }
        }
    }
}
class BluebirdViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(BluebirdPrivacyPlugin())
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = BluebirdViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
