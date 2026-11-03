import { executeCommand } from '@workspace/api-client-react';
import type { SlotId } from './fx';

export const PROJECT_LISTS = [
  { key: 'projects', path: '/projects' },
  { key: 'groups', path: '/groups' },
  { key: 'constructs', path: '/constructs' },
  { key: 'slots', path: '/constructs/current/slots' },
] as const;
export type ProjectListKey = typeof PROJECT_LISTS[number]['key'];

export async function readProjectList(
  id: SlotId,
  key: ProjectListKey,
  signal?: AbortSignal,
  request: typeof executeCommand = executeCommand,
): Promise<Record<string, unknown>[]> {
  const definition = PROJECT_LISTS.find((item) => item.key === key)!;
  const result = await request(id, { method: 'GET', path: definition.path }, { signal });
  if (!result.ok) throw new Error(result.error || `Could not load ${key}.`);
  const nested = result.data.data;
  const items = key in result.data ? result.data[key]
    : nested && typeof nested === 'object' ? (nested as Record<string, unknown>)[key] : undefined;
  if (!Array.isArray(items) || items.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new Error(`Live FX did not return a valid ${key} list.`);
  }
  return items;
}
