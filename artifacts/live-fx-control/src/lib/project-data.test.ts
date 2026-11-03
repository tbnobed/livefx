import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROJECT_LISTS, readProjectList } from './project-data';
import type { executeCommand } from '@workspace/api-client-react';

test('all four automatic reads use the selected server and GET-only upstream operations', async () => {
  const calls: unknown[] = [];
  const request: typeof executeCommand = async (id, input) => {
    calls.push({ id, ...input });
    const key = PROJECT_LISTS.find((list) => list.path === input.path)!.key;
    return { ok: true, status: 200, durationMs: 1, error: null, data: { [key]: [{ name: `${id}-${key}` }] } };
  };
  const results = await Promise.all(PROJECT_LISTS.map(({ key }) => readProjectList('server-b', key, undefined, request)));
  assert.equal(results.length, 4);
  assert.deepEqual(calls, PROJECT_LISTS.map(({ path }) => ({ id: 'server-b', method: 'GET', path })));
  assert(results.every((items) => String(items[0].name).startsWith('server-b-')));
});
test('supports nested data lists and valid empty responses', async () => {
  const request: typeof executeCommand = async () => ({ ok: true, status: 200, durationMs: 1, error: null, data: { data: { groups: [] } } });
  assert.deepEqual(await readProjectList('server-a', 'groups', undefined, request), []);
});
test('does not turn upstream failure into a successful empty list', async () => {
  const request: typeof executeCommand = async () => ({ ok: false, status: 409, durationMs: 1, error: 'Open a project first', data: {} });
  await assert.rejects(readProjectList('server-a', 'constructs', undefined, request), /Open a project first/);
});
test('rejects missing or malformed list data', async () => {
  for (const data of [{}, { slots: {} }, { slots: [null] }]) {
    const request: typeof executeCommand = async () => ({ ok: true, status: 200, durationMs: 1, error: null, data });
    await assert.rejects(readProjectList('server-a', 'slots', undefined, request), /valid slots list/);
  }
});
test('passes cancellation through so old project reads can be aborted', async () => {
  const controller = new AbortController();
  const request: typeof executeCommand = async (_id, _body, options) => {
    assert.equal(options?.signal, controller.signal);
    return { ok: true, status: 200, durationMs: 1, error: null, data: { projects: [] } };
  };
  await readProjectList('server-a', 'projects', controller.signal, request);
});
