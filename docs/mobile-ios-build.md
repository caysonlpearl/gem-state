# iPhone build before enrollment

The `iPhone simulator build` GitHub Actions workflow compiles the bundled React app and its core Capacitor iOS plugins on a standard `macos-15` runner with an installed Xcode 26 toolchain. It runs on relevant pull requests, changes to main, and manual dispatch. It uses no Apple account, signing certificate, provisioning profile, or App Store Connect connection. It does not upload or submit an app.

The repository is public. [GitHub provides standard hosted-runner compute free for public repositories](https://docs.github.com/en/billing/concepts/product-billing/github-actions). This workflow uses no larger runner, dependency cache, or artifact upload; build files stay on the temporary runner. It adds no paid build service. [Capacitor 8 requires Xcode 26 or newer](https://capacitorjs.com/docs/getting-started/environment-setup); the workflow selects the newest installed Xcode 26 version and records its exact version in the log.

The app uses the existing shared website presenters and styles. The job compiles those bundled assets, runs `cap sync ios`, then builds the `App` scheme for the iPhone simulator with code signing disabled. Native advertising plugins remain disabled through `BLUEBIRD_MOBILE_NATIVE_ADS_READY=false`; the configured advertising build needs its own verification when that setup is ready.

A passing job proves compilation on that recorded toolchain. It does not prove that a physical iPhone can complete the marketplace journeys, that notification permissions or APNs delivery work, or that the app is ready for store approval. Real-device checks, signing, TestFlight, review materials, enrollment, and the agreed beta observation remain required. Record the actual job result before calling the iOS build verified.
