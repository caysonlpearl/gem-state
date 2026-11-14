import { mobileRuntimeSupported } from "./runtime-support";
// Keep the shared app (including module-level activity state) out of unsupported
// engines. The update page needs neither React, Tailwind nor Capacitor plugins.
if (mobileRuntimeSupported()) void import("./main");
else location.replace(new URL("webview-update.html", location.href).href);
