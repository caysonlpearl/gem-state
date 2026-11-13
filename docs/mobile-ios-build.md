# iPhone build before enrollment

The `iPhone simulator build` GitHub Actions workflow compiles the bundled React app and its core Capacitor iOS plugins on a standard `macos-15` runner with an installed Xcode 26 toolchain. It runs on relevant pull requests, changes to main, and manual dispatch. It uses no Apple account, signing certificate, provisioning profile, or App Store Connect connection. It does not upload or submit an app.

The repository is public. [GitHub provides standard hosted-runner compute free for public repositories](https://docs.github.com/en/billing/concepts/product-billing/github-actions). This workflow uses no larger runner, dependency cache, or artifact upload; build files stay on the temporary runner. It adds no paid build service. [Capacitor 8 requires Xcode 26 or newer](https://capacitorjs.com/docs/getting-started/environment-setup); the workflow selects the newest installed Xcode 26 version and records its exact version in the log.

The app uses the existing shared website presenters and styles. The job compiles those bundled assets, runs `cap sync ios`, then builds the `App` scheme for the iPhone simulator with code signing disabled. Native advertising plugins remain disabled through `BLUEBIRD_MOBILE_NATIVE_ADS_READY=false`; the configured advertising build needs its own verification when that setup is ready.

A passing job proves compilation on that recorded toolchain. It does not prove that a physical iPhone can complete the marketplace journeys, that notification permissions or APNs delivery work, or that the app is ready for store approval. Real-device checks, signing, TestFlight, review materials, enrollment, and the agreed beta observation remain required. Record the actual job result before calling the iOS build verified.

## First verified result — November 13, 2026

[The first simulator job passed](https://github.com/caysonlpearl/gem-state/actions/runs/43498602027/job/132138141036) with Xcode 26.3 (17C529), iOS simulator SDK 26.2 and Node 22.23.4. It tested source `06599b4a9422e79109dc946d01b9ad2de656b2b4`, merged against main `59fb76146edf5a22b9ee8cef1be1fb46089183c4`, with resulting source tree `cf9792103139daf14cc85a7e6ab8cbee684205c1`. The native build reported `BUILD SUCCEEDED`; there was no signing, simulator launch, physical-device test or store distribution. The recorded log and proof are under `output/mobile-ios-build-20261113/`. Subsequent relevant source changes must pass their own workflow before release.

## Local iPhone build and owner setup — November 13, 2026

Official App Store Xcode 27.2 (27B52) is now installed on the owner's Mac. Its
first-launch agreement was cleared and the owner explicitly authorized acceptance.
The owner completed Apple Account sign-in and authorized Personal Team signing,
credential/profile creation and installation of the test app. Paid developer
enrollment and all store submission steps remain deferred.

The local build bundled the shared website screens, synced only the core
Capacitor plugins and compiled the App scheme for `generic/platform=iOS`, Debug,
ARM64, with iOS SDK 27.2 and `CODE_SIGNING_ALLOWED=NO`. It reported
`BUILD SUCCEEDED` on main `9bf1d1f3a7a5ab0bc1eaf7de0412fc2fc5c4fc35`, source tree
`39141e1ecb6ea4fcf24bf69b1708ad3309443e4a`. Native advertising plugins remained
disabled. Logs, binary hash and the exact build boundary are recorded under
`output/iphone-device-setup-20261113/`. This is a device-architecture compilation,
not a signed install or physical-device test.

The project now records the resolved native package revisions, including
Capacitor 8.6.2 and IONGeolocationLib 3.0.0, for repeatable builds. Personal Team
selection stays in the local project configuration; do not commit the owner's
team identifier, certificates, profiles or account/device discovery records.

The owner paired an iPhone 16 Pro Max running iOS 27.0.1, enabled Developer Mode
and completed the post-restart confirmation. The signed Debug build succeeded;
deep code-signature verification passed and its provisioning profile included
that phone. CoreDevice installed the app successfully. The owner then trusted
the developer on the phone, confirmed Bluebird opens, and a CoreDevice
foreground launch also succeeded. This is a verified signed installation, not
App Store distribution.

Apple's Device Hub showed the real phone loading the shared homepage and actual
listing photos. A vehicle detail page, its next gallery photo and return to the
homepage worked. These are guest browsing checks; authenticated saves, posting,
messaging, deletion and actual push delivery remain unverified on the phone.

The phone exposed two viewport defects that browser fixtures did not reveal:

- Native automatic scroll insets duplicated the shared header/tab-bar safe-area
  padding. The iOS configuration now uses `contentInset: "never"`; a signed
  reinstall visibly removed the extra header gap on the real phone.
- Focusing the homepage search field zoomed the viewport and clipped its right
  edge. Native iOS text controls now have a 16px floor that outranks the shared
  homepage's compact 13px exception. Website/Android styling remains separate.
  The actual shared-CSS browser regression failed before the cascade correction
  and passed afterward at 320, 390 and 768 pixels. Physical focus retesting must
  also pass before treating this correction as verified on iPhone.

The owner unplugged the cable to switch testing to Wi-Fi. CoreDevice initially
reported a connected local-network transport and answered a live lock-state
query. The connection subsequently became unavailable before the updated app
could install; do not treat that first observation as reliable wireless
deployment proof. The installed app runs independently of the cable. Further
live checks and Wi-Fi installation require restoring the paired device's
network connection. No router, firewall or privacy protection was disabled.

[Apple documents free Personal Team device testing](https://developer.apple.com/help/account/basics/about-your-developer-account).
Its test profiles expire after seven days, requiring a rebuild/reinstall. This
does not provide App Store/TestFlight distribution or establish APNs delivery.
The owner has an iPhone only; physical Android testing still needs another
tester/device before release.
