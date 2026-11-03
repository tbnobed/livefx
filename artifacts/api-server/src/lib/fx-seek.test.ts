import { test } from "node:test";
import assert from "node:assert/strict";
import { seekBlockReason } from "./fx-seek";
const player = { mode: "PAUSE", length: 901 };
test("allows only valid timeline frame indices including both endpoints", () => {
  assert.equal(seekBlockReason(0, player), null);
  assert.equal(seekBlockReason(900, player), null);
  for (const frame of [-1, 901, 1.5, NaN, "25", null]) assert.match(seekBlockReason(frame, player)!, /integer from 0 to 900/);
});
test("recording is rejected even if a browser still reports paused", () => {
  assert.match(seekBlockReason(30, { ...player, mode: "RECORD" })!, /disabled while recording/);
  assert.match(seekBlockReason(30, { ...player, mode: "record" })!, /disabled while recording/);
});
test("unknown player state fails closed", () => {
  assert.match(seekBlockReason(0, {})!, /Cannot verify/);
  assert.match(seekBlockReason(0, { mode: "PAUSE" })!, /no valid timeline length/);
  assert.match(seekBlockReason(0, { mode: "PAUSE", length: 0 })!, /no valid timeline length/);
});
