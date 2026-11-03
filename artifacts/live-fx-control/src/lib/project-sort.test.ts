import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortProjects } from './project-sort';

const projects = [
  { name: 'Project 10', modified: '2026-11-03T11:15:47' },
  { name: 'alpha', modified: '2026-10-01T09:00:00' },
  { name: 'Project 2', modified: '2026-11-02T12:30:00' },
];
const names = (items: typeof projects) => items.map((item) => item.name);

test('sorts names naturally without case sensitivity in both directions', () => {
  assert.deepEqual(names(sortProjects(projects, 'name-asc')), ['alpha', 'Project 2', 'Project 10']);
  assert.deepEqual(names(sortProjects(projects, 'name-desc')), ['Project 10', 'Project 2', 'alpha']);
});
test('sorts actual modified dates newest and oldest first', () => {
  assert.deepEqual(names(sortProjects(projects, 'date-desc')), ['Project 10', 'Project 2', 'alpha']);
  assert.deepEqual(names(sortProjects(projects, 'date-asc')), ['alpha', 'Project 2', 'Project 10']);
});
test('missing and invalid dates remain last in both date directions', () => {
  const items = [{ name: 'Missing' }, { name: 'Invalid', modified: 'not a date' }, projects[0]];
  for (const order of ['date-asc', 'date-desc'] as const) {
    assert.deepEqual(sortProjects(items, order).map((p) => p.name), ['Project 10', 'Invalid', 'Missing']);
  }
});
test('ties in dates use the project name', () => {
  const items = projects.map((p) => ({ ...p, modified: '2026-11-03T11:15:47' }));
  assert.deepEqual(names(sortProjects(items, 'date-desc')), ['alpha', 'Project 2', 'Project 10']);
});
test('does not mutate the source list and supports empty and filtered lists', () => {
  const before = [...projects];
  sortProjects(projects, 'name-asc');
  assert.deepEqual(projects, before);
  assert.deepEqual(sortProjects([], 'name-asc'), []);
  assert.deepEqual(names(sortProjects(projects.filter((p) => p.name.startsWith('Project')), 'name-asc')), ['Project 2', 'Project 10']);
});
