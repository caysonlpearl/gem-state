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
@objc(BluebirdAppIconPlugin)
public class BluebirdAppIconPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BluebirdAppIconPlugin"
    public let jsName = "BluebirdAppIcon"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setIcon", returnType: CAPPluginReturnPromise)
    ]
    private let icons = [
        "yellow": "BluebirdYellow", "blue-gloss": "BluebirdBlueGloss",
        "sky-shadow": "BluebirdSkyShadow", "midnight": "BluebirdMidnight",
        "sky": "BluebirdSky", "black": "BluebirdBlack",
        "yellow-gloss": "BluebirdYellowGloss", "blue": "BluebirdBlue"
    ]
    private var changing = false
    private func state() -> [String: Any] {
        let current = icons.first { $0.value == UIApplication.shared.alternateIconName }?.key ?? "original"
        return ["supported": UIApplication.shared.supportsAlternateIcons, "current": current]
    }
    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(self.state()) }
    }
    @objc func setIcon(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), id == "original" || icons[id] != nil else {
            call.reject("Choose one of Bluebird’s bundled icons.", "invalid_icon")
            return
        }
        DispatchQueue.main.async {
            guard UIApplication.shared.supportsAlternateIcons else {
                call.reject("App icon changes are unavailable.", "unavailable"); return
            }
            guard UIApplication.shared.applicationState == .active, !self.changing else {
                call.reject("Keep Bluebird open and try again.", "busy"); return
            }
            let icon = id == "original" ? nil : self.icons[id]
            if UIApplication.shared.alternateIconName == icon { call.resolve(self.state()); return }
            self.changing = true
            UIApplication.shared.setAlternateIconName(icon) { error in
                DispatchQueue.main.async {
                    self.changing = false
                    if let error { call.reject("The app icon could not change.", "icon_change_failed", error) }
                    else { call.resolve(self.state()) }
                }
            }
        }
    }
}

class BluebirdViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(BluebirdPrivacyPlugin())
        bridge?.registerPluginInstance(BluebirdAppIconPlugin())
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
