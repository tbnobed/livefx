import { test } from "node:test";
import assert from "node:assert/strict";
import { captureSnapshot } from "./fx-snapshot";
import type { upstream, UpstreamResult } from "./fx-upstream";
import type { FxServerRecord } from "@workspace/db";

const server: FxServerRecord = { id: "server-a", name: "Test", role: "Primary", baseUrl: "http://192.168.50.10/APIV2", allowControl: false };
const uuid = "12345678-1234-1234-1234-123456789abc";
const image = `data:image/jpeg;base64,${Buffer.from([255, 216, 255, 224]).toString("base64")}`;
const ok = (data: Record<string, unknown>): UpstreamResult => ({ ok: true, status: 200, durationMs: 1, data, error: null });

test("captures exact shot-local frame, uses proxy, and never writes files or playback", async () => {
  const calls: unknown[][] = [];
  const transport: typeof upstream = async (_server, method, path, body) => {
    calls.push([method, path, body]);
    return method === "GET" ? ok({ shot_uuid: uuid, shot_frame: 25, frame: 1000 }) : ok({ image });
  };
  const result = await captureSnapshot(server, transport);
  assert.equal(result.ok, true);
  assert.equal(result.image, image);
  assert.equal(result.frame, 25);
  assert(result.capturedAt);
  assert.deepEqual(calls, [
    ["GET", "/application/player/playmode", undefined],
    ["POST", "/application/tools/image", { uuid, frame: 25, proxy: true, mime_type: "image/jpeg" }],
  ]);
});

test("unconfigured servers do not contact upstream", async () => {
  const result = await captureSnapshot({ ...server, baseUrl: "" }, async () => { throw new Error("Must not request"); });
  assert.equal(result.ok, false);
});

test("missing shot-local frame never falls back to timeline frame", async () => {
  let calls = 0;
  const result = await captureSnapshot(server, async () => { calls++; return ok({ shot_uuid: uuid, frame: 1000 }); });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
});

test("player errors do not dispatch a snapshot", async () => {
  const result = await captureSnapshot(server, async () => ({ ...ok({}), ok: false, error: "Access denied", status: 403 }));
  assert.equal(result.ok, false);
  assert.match(result.error!, /Access denied/);
});

test("unsupported older API returns actionable error and no fake image", async () => {
  const result = await captureSnapshot(server, async (_s, method) => method === "GET"
    ? ok({ shot_uuid: uuid, shot_frame: 0 })
    : { ...ok({}), ok: false, status: 404, error: "Not found" });
  assert.equal(result.image, null);
  assert.match(result.error!, /Snapshot capture failed/);
});

test("JSON success is not mistaken for an image", async () => {
  const result = await captureSnapshot(server, async (_s, method) => method === "GET"
    ? ok({ shot_uuid: uuid, shot_frame: 0 }) : ok({ success: true }));
  assert.equal(result.ok, false);
  assert.equal(result.capturedAt, null);
});

test("rejects malformed image payloads", async () => {
  const result = await captureSnapshot(server, async (_s, method) => method === "GET"
    ? ok({ shot_uuid: uuid, shot_frame: 0 }) : ok({ image: "data:image/jpeg;base64,aHRtbA==" }));
  assert.equal(result.ok, false);
});
