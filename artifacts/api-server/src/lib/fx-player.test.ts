import { test } from "node:test";
import assert from "node:assert/strict";
import type { FxServerRecord } from "@workspace/db";
import type { upstream } from "./fx-upstream";
import { createPlayerReader } from "./fx-player";

const server = { id: "server-a", baseUrl: "http://10.20.30.40:8080/APIV2" } as FxServerRecord;
const response = (frame = 0): Awaited<ReturnType<typeof upstream>> => ({
  ok: true, status: 200, durationMs: 12, error: null,
  data: { mode: "PLAY_FRW", frame, length: 901, fps: 30, timecodec: `00:00:00:${frame}`, loop: "LOOP" },
});

test("reads actual playmode only and refreshes after 250 ms independently of full status", async () => {
  let time = 1000;
  let calls = 0;
  const request: typeof upstream = async (_server, method, path, body) => {
    assert.equal(method, "GET");
    assert.equal(path, "/application/player/playmode");
    assert.equal(body, undefined);
    return response(++calls);
  };
  const read = createPlayerReader(request, () => time);
  assert.equal((await read(server)).playmode.frame, 1);
  time += 249;
  assert.equal((await read(server)).playmode.frame, 1);
  time += 1;
  assert.equal((await read(server)).playmode.frame, 2);
  assert.equal(calls, 2);
});

test("concurrent browsers share a single in-flight hardware request", async () => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  const read = createPlayerReader(async () => { calls++; await hold; return response(44); });
  const first = read(server);
  const second = read(server);
  assert.equal(calls, 1);
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.playmode.frame, 44);
  assert.deepEqual(a, b);
});

test("A, B, and changed server addresses never share cached frames", async () => {
  let calls = 0;
  const read = createPlayerReader(async () => response(++calls));
  assert.equal((await read(server)).playmode.frame, 1);
  assert.equal((await read({ ...server, id: "server-b" })).playmode.frame, 2);
  assert.equal((await read({ ...server, baseUrl: "http://10.20.30.41:8080/APIV2" })).playmode.frame, 3);
  assert.equal((await read(server)).playmode.frame, 1);
});

test("player errors are explicit and failure-cached for a second, then recover", async () => {
  let time = 1000;
  let calls = 0;
  const read = createPlayerReader(async () => ++calls === 1
    ? { ...response(), ok: false, status: 409, data: {}, error: "First enter a player" }
    : response(55), () => time);
  const failed = await read(server);
  assert.equal(failed.ok, false);
  assert.match(failed.error!, /enter a player/);
  assert.deepEqual(failed.playmode, {});
  time += 999;
  assert.equal((await read(server)).ok, false);
  assert.equal(calls, 1);
  time += 1;
  assert.equal((await read(server)).playmode.frame, 55);
});

test("rejects malformed or non-player responses instead of inventing frame zero", async () => {
  for (const data of [{}, { mode: "PAUSE", frame: null }, { mode: "PAUSE", frame: "invalid" }, { mode: "", frame: 0 }]) {
    const read = createPlayerReader(async () => ({ ...response(), data }));
    const state = await read(server);
    assert.equal(state.ok, false);
    assert.deepEqual(state.playmode, {});
  }
});

test("unconfigured slots do not contact any upstream", async () => {
  const read = createPlayerReader(async () => { throw new Error("Must not request an unconfigured slot"); });
  const state = await read({ ...server, baseUrl: "" });
  assert.equal(state.ok, false);
  assert.match(state.error!, /not configured/);
});

test("unexpected read failures remain explicit unavailable results", async () => {
  const read = createPlayerReader(async () => { throw new Error("Transport unavailable"); });
  const state = await read(server);
  assert.equal(state.ok, false);
  assert.deepEqual(state.playmode, {});
  assert.match(state.error!, /Could not read/);
});
