# Bluebird mobile prototype

Bundled React assets shared by Capacitor iPhone and Android projects. The
versioned backend lives in the website repository; privileged work stays there.

See [implementation and release ledger](../../docs/mobile-apps.md) for setup,
verified checks, policy boundaries and open launch gates. This is a prototype,
not a store-ready release. Publish and verify the matching production mobile API
before attempting installed-device journeys. A successful app build does not
establish backend deployment.

From the repository root:

```sh
npm ci
npm ci --prefix apps/mobile
npm run build:mobile
npm run test:mobile
```

Use `npm run sync` inside this directory before compiling either native project.
Never add `server.url` or private credentials to a packaged release.
