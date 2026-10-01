import test from "node:test";
import assert from "node:assert/strict";

import {
  RELEASE_GATE_JOURNEYS,
  RELEASE_GATE_ROLES,
  RELEASE_GATE_VIEWPORTS,
  classifyLatency,
  controlledRecordLabel,
  sanitizeTelemetryText,
} from "../src/lib/release-gate.ts";

test("release gate covers every role and required viewport", () => {
  assert.deepEqual(
    [...RELEASE_GATE_ROLES],
    ["anonymous", "buyer", "seller", "dealership", "admin"],
  );
  assert.deepEqual([...RELEASE_GATE_VIEWPORTS], [1440, 768, 390, 320]);
  assert.equal(RELEASE_GATE_JOURNEYS.length, 5);
});

test("latency classification is deterministic at the threshold", () => {
  assert.deepEqual(classifyLatency(1_500), { durationMs: 1_500, thresholdMs: 1_500, slow: false });
  assert.deepEqual(classifyLatency(1_501), { durationMs: 1_501, thresholdMs: 1_500, slow: true });
  assert.deepEqual(classifyLatency(-4, 0), { durationMs: 0, thresholdMs: 1, slow: false });
});

test("telemetry redacts identifiers, URLs, and email addresses", () => {
  const value = sanitizeTelemetryText(
    "Request failed for caysonlpearl@gmail.com https://example.test/listings/123 123e4567-e89b-12d3-a456-426614174000",
  );
  assert.equal(value.includes("caysonlpearl@gmail.com"), false);
  assert.equal(value.includes("https://example.test"), false);
  assert.equal(value.includes("123e4567-e89b-12d3-a456-426614174000"), false);
});

test("controlled records are unmistakable and time-sortable", () => {
  const label = controlledRecordLabel(new Date("2026-10-01T16:45:03.000Z"));
  assert.match(label, /^BLUEBIRD-QA-20261001164503$/);
});
