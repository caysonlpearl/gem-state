import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { approximateSearchPosition } from "../apps/mobile/src/location-contract.ts";
test("device location is reduced to a general search center and carries no altitude, speed or accuracy data", () => {
  assert.deepEqual(
    approximateSearchPosition({
      latitude: 43.615099,
      longitude: -116.202313,
      altitude: 999,
      speed: 80,
      accuracy: 1,
    }),
    { coords: { latitude: 43.62, longitude: -116.2 } },
  );
  for (const coords of [
    { latitude: NaN, longitude: 0 },
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: 181 },
  ])
    assert.throws(() => approximateSearchPosition(coords));
});
test("native location is optional, requested on demand and never enables a background watcher", () => {
  const manifest = readFileSync(
    new URL("../apps/mobile/android/app/src/main/AndroidManifest.xml", import.meta.url),
    "utf8",
  );
  const code = readFileSync(new URL("../apps/mobile/src/location.ts", import.meta.url), "utf8");
  assert.match(manifest, /ACCESS_COARSE_LOCATION/);
  assert.doesNotMatch(manifest, /ACCESS_FINE_LOCATION|ACCESS_BACKGROUND_LOCATION/);
  assert.doesNotMatch(code, /watchPosition|setInterval/);
  assert.match(code, /permissions: \["coarseLocation"\]/);
  const picker = readFileSync(
    new URL("../src/components/classifieds/LocationRadiusPicker.tsx", import.meta.url),
    "utf8",
  );
  assert.match(picker, /onClick=\{\(\) => \{[\s\S]*?void locate\(\)/);
  assert.match(picker, /latestCenter.current !== requestedCenter/);
});
