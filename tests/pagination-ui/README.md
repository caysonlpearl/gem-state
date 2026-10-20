# Offline mounted browse smoke test

Run `npm run test:pagination:ui` with Playwright available to Node. If it is
installed outside this checkout, set `PLAYWRIGHT_MODULE_PATH` to its absolute
`index.mjs` path. No dependency install or credentials are required when using
an existing Playwright installation and Chromium browser. Type-check the harness
and application together with
`npx tsc --noEmit -p tests/pagination-ui/tsconfig.json`.

Optional: set `BLUEBIRD_UI_EVIDENCE_DIR` to an output folder. Screenshots and
`report.json` otherwise go to the system temporary folder under
`bluebird-pagination-ui`.

The runner starts a standalone Vite server on **127.0.0.1:4178**, mounts the
**production `Browse` route** with the real TanStack Router and React Query,
and closes the server and browser afterward. It runs at 1366×768 and 390×844.
It checks:

- Initial cards, loading text and `aria-disabled` while a request is held.
- Repeated pointer clicks during loading: one request and no duplicate cards.
- Multiple appends through the final page; final counts and no Load more link.
- The production limited-results notice.
- A repeated page response: error toast, no append, and a retryable control.
- Page 51: record 1,201 exactly once, final controls, and the mounted canonical.
- No horizontal page overflow at either viewport size.

`CanonicalTags` is extracted by name from the production root module using the
TypeScript parser, then mounted with the real router. Its markup and canonical
logic are not copied into a test component. The complete production app shell
is deliberately excluded: this does **not** verify SSR, deployment, header or
footer behavior, authentication, physical devices, or live feed integration.

Only data/telemetry/server-call boundaries and unrelated save-heart controls
are stubbed. The browse route, cards, responsive filters, pagination handlers,
loading/disabled/final rendering, notice and canonical component are production
code. The initial-query loader also runs against the fixture data.

Safety layers:

1. The test config never loads the production Vite/Start server config or
   environment files. Data is generated in memory; no API handler is hosted.
2. Explicit aliases replace server functions and telemetry. Any unstubbed
   backend/server-module import fails the build.
3. The browser installs request interception before opening a page. Only the
   harness origin's static resources are allowed; backend and external requests
   are blocked and fail the run. The local Vite development socket is allowed;
   external sockets are blocked. Service workers are disabled.
4. A response Content Security Policy additionally disallows external network
   connections, images, scripts and frames.

Browser exceptions and blocked requests fail the run. Console warnings are
reported separately; existing unrelated warnings do not change product code
or invalidate the pagination assertions. This fixture changes no product code,
provider configuration, database records or published assets.
