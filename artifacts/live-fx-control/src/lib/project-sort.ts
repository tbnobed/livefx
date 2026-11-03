export const PROJECT_SORT_OPTIONS = [
  { value: 'name-asc', label: 'Name · A–Z' },
  { value: 'name-desc', label: 'Name · Z–A' },
  { value: 'date-desc', label: 'Date modified · newest first' },
  { value: 'date-asc', label: 'Date modified · oldest first' },
] as const;

export type ProjectSort = typeof PROJECT_SORT_OPTIONS[number]['value'];
const names = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const projectName = (project: Record<string, unknown>) =>
  String(project.name ?? project.title ?? project.uuid ?? project.id ?? '');
const modifiedTime = (project: Record<string, unknown>) =>
  typeof project.modified === 'string' && project.modified.trim() ? Date.parse(project.modified) : NaN;

export function sortProjects<T extends Record<string, unknown>>(projects: readonly T[], order: ProjectSort): T[] {
  return [...projects].sort((a, b) => {
    const byName = names.compare(projectName(a), projectName(b));
    if (order === 'name-asc') return byName;
    if (order === 'name-desc') return -byName;
    const left = modifiedTime(a);
    const right = modifiedTime(b);
    // Unknown dates go last in either direction, rather than looking newest.
    if (!Number.isFinite(left)) return Number.isFinite(right) ? 1 : byName;
    if (!Number.isFinite(right)) return -1;
    return (order === 'date-desc' ? right - left : left - right) || byName;
  });
}
