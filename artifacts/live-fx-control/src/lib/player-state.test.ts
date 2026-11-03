import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ServerStatus } from '@workspace/api-client-react';
import { playerBlockReason } from './player-state';

const status: ServerStatus = {
  id: 'server-b', connection: 'online', checkedAt: '', latencyMs: 1,
  error: null, system: {}, application: { module: 'Construct', project: 'Test project' },
  playmode: {}, warnings: [],
};

test('an open project is not enough to enable transport', () => {
  assert.match(playerBlockReason(status)!, /Enter a timeline first/);
});
test('player module matching supports actual lowercase and documented capitalized values', () => {
  for (const module of ['player', 'Player', ' PLAYER ']) {
    assert.equal(playerBlockReason({ ...status, application: { module }, playmode: { mode: 'PAUSE' } }), null);
  }
});
test('missing playmode state disables transport even in Player', () => {
  assert.match(playerBlockReason({ ...status, application: { module: 'Player' } })!, /status is unavailable/);
});
test('stale player state never enables an offline server', () => {
  assert.match(playerBlockReason({ ...status, connection: 'offline', application: { module: 'Player' }, playmode: { mode: 'PAUSE' } })!, /Connect/);
  assert.match(playerBlockReason()!, /Connect/);
});
test('Both must have a ready player on each server', () => {
  const ready = { ...status, application: { module: 'player' }, playmode: { mode: 'PAUSE' } };
  assert.equal([ready, status].every((s) => playerBlockReason(s) === null), false);
  assert.equal([ready, ready].every((s) => playerBlockReason(s) === null), true);
});
