import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampSeekFrame, createScrubQueue } from './scrub-queue';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('seeks are integer frames clamped to 0 through length minus one', () => {
  assert.equal(clampSeekFrame(-10, 901), 0);
  assert.equal(clampSeekFrame(901, 901), 900);
  assert.equal(clampSeekFrame(44.7, 901), 45);
  assert.equal(clampSeekFrame(10, 1), 0);
  assert.equal(clampSeekFrame(10, 0), null);
  assert.equal(clampSeekFrame(NaN, 901), null);
});
test('slow commands never overlap and only the latest queued drag position is sent', async () => {
  let release!: (ok: boolean) => void;
  const calls: number[] = [];
  const queue = createScrubQueue((frame) => {
    calls.push(frame);
    return frame === 10 ? new Promise((resolve) => { release = resolve; }) : Promise.resolve(true);
  }, () => {}, 0);
  queue.enqueue(10);
  queue.enqueue(20);
  queue.enqueue(30);
  assert.deepEqual(calls, [10]);
  release(true);
  await sleep(5);
  assert.deepEqual(calls, [10, 30]);
  queue.cancel();
});
test('drag requests are throttled and the final position is not lost', async () => {
  const calls: number[] = [];
  const queue = createScrubQueue(async (frame) => { calls.push(frame); return true; }, () => {}, 30);
  queue.enqueue(1);
  await sleep(1);
  queue.enqueue(2);
  queue.enqueue(900);
  assert.deepEqual(calls, [1]);
  await sleep(45);
  assert.deepEqual(calls, [1, 900]);
  queue.cancel();
});
test('cancel discards queued commands even if a previous command is still in flight', async () => {
  let release!: (ok: boolean) => void;
  const calls: number[] = [];
  const queue = createScrubQueue((frame) => {
    calls.push(frame);
    return new Promise((resolve) => { release = resolve; });
  }, () => {}, 0);
  queue.enqueue(1);
  queue.enqueue(900);
  queue.cancel();
  release(true);
  await sleep(5);
  assert.deepEqual(calls, [1]);
  queue.enqueue(100);
  assert.deepEqual(calls, [1]);
});
test('a failed seek is never retried and queued seeks stop until a new gesture', async () => {
  const calls: number[] = [];
  const queue = createScrubQueue(async (frame) => { calls.push(frame); return false; }, () => {}, 0);
  queue.enqueue(1);
  queue.enqueue(900);
  await sleep(5);
  queue.enqueue(50);
  assert.deepEqual(calls, [1]);
  queue.resume();
  queue.enqueue(55);
  await sleep(5);
  assert.deepEqual(calls, [1, 55]);
  queue.cancel();
});
test('cancelling a throttled seek clears its timer', async () => {
  const calls: number[] = [];
  const queue = createScrubQueue(async (frame) => { calls.push(frame); return true; }, () => {}, 25);
  queue.enqueue(1);
  await sleep(1);
  queue.enqueue(80);
  queue.cancel();
  await sleep(40);
  assert.deepEqual(calls, [1]);
});
