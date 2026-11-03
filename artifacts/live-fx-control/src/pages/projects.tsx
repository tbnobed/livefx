import { useState } from 'react';
import { Link } from 'wouter';
import { FolderOpen, FolderX, Layers, Boxes, Film, RefreshCw, Palette, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { asArr, fmt, pick, targetIds, useConfirm, useFx, useRunner, type RunResult, type SlotId } from '@/lib/fx';
import { Empty, GateNote, JsonBlock, PageHeader, ResultStack } from '@/components/fx-ui';
import { playerBlockReason } from '@/lib/player-state';

type Rec = Record<string, unknown>;
const nameOf = (o: Rec) => fmt(o.name ?? o.title ?? o.uuid ?? o.id);
const uuidOf = (o: Rec) => (o.uuid ?? o.construct_uuid ?? o.shot_uuid ?? o.id) as string | undefined;

function Column({ title, icon, items, loading, onFetch, canRead, render, emptyText, testid }: {
  title: string; icon: React.ReactNode; items: Rec[] | null; loading: boolean; onFetch: () => void; canRead: boolean; render: (o: Rec, i: number) => React.ReactNode; emptyText: string; testid: string;
}) {
  return (
    <div className="panel flex min-h-[220px] flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        {icon}
        <span className="text-sm font-bold">{title}</span>
        {items && <span className="mono text-[10px] text-muted-foreground">{items.length}</span>}
        <Button data-testid={`button-fetch-${testid}`} size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs" disabled={!canRead || loading} onClick={onFetch}>
          <RefreshCw className="mr-1 h-3 w-3" /> {items ? 'Reload' : 'Fetch'}
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-1.5">
        {loading ? (
          <div className="space-y-1.5 p-1.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : items === null ? (
          <div className="p-4 text-center text-xs text-muted-foreground">{canRead ? 'Not fetched yet.' : 'Server must be online to read.'}</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">{emptyText}</div>
        ) : (
          <ul className="space-y-0.5">{items.map(render)}</ul>
        )}
      </div>
    </div>
  );
}

export default function Projects() {
  const { target } = useFx();
  return <div className="space-y-8">{targetIds(target).map((id) => (
    <section key={id} data-testid={`projects-server-${id}`}><ServerProjects id={id} /></section>
  ))}</div>;
}

function ServerProjects({ id }: { id: SlotId }) {
  const { gate, label, status, setTarget } = useFx();
  const g = gate(id);
  const confirm = useConfirm();
  const { run } = useRunner();
  const [lists, setLists] = useState<Record<string, Rec[] | null>>({ projects: null, groups: null, constructs: null, slots: null });
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<RunResult[]>([]);
  const [filter, setFilter] = useState('');

  const fetchList = async (key: string, path: string) => {
    setBusy(key);
    const [r] = await run([id], 'GET', path);
    setBusy(null);
    if (r.result?.ok) setLists((l) => ({ ...l, [key]: asArr(pick(r.result?.data, key)) as Rec[] }));
    else setLast([r]);
  };
  const write = async (title: string, path: string, after?: () => void) => {
    const ok = await confirm({ title, targets: [label(id)], action: title });
    if (!ok) return;
    const res = await run([id], 'POST', path, undefined, true);
    setLast(res);
    if (res[0].result?.ok) after?.();
  };
  const current = fmt(pick(status(id).data?.application, 'project'));
  const projects = lists.projects?.filter((p) => nameOf(p).toLowerCase().includes(filter.toLowerCase())) ?? null;

  return (
    <>
      <PageHeader
        kicker="Projects"
        title={`Project explorer · ${label(id)}`}
        desc="Projects, groups, constructs and slots belong only to this server. Opening a project or entering a timeline changes what this server is playing."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm">
        <span className="kicker">Open project on {label(id)}</span>
        <span data-testid="text-current-project" className="mono font-semibold">{g.read ? current : '—'}</span>
        <Button data-testid="button-exit-project" size="sm" variant="outline" className="ml-auto" disabled={!g.write} onClick={() => write('Close current project', '/application/project/exit')}>
          <FolderX className="mr-1.5 h-3.5 w-3.5" /> Close project
        </Button>
      </div>
      <div className="mb-4"><GateNote ids={[id]} /></div>
      {g.read && playerBlockReason(status(id).data) && (
        <p data-testid={`projects-enter-player-${id}`} className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
          Opening a project does not start the player. Fetch <b>Constructs</b>, then choose <b>Enter</b> beside the timeline you want to play. If no project is open, open one first.
        </p>
      )}
      {!g.read ? (
        <Empty icon={<FolderOpen className="h-5 w-5" />} title={`${label(id)} is not reachable`} body={`${g.reason}. Project data is only shown from a real server response.`} action={<Link href="/settings" className="text-sm font-semibold underline">Open settings</Link>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Column title="Projects" testid="projects" icon={<FolderOpen className="h-4 w-4" />} items={projects} loading={busy === 'projects'} canRead={g.read} onFetch={() => fetchList('projects', '/projects')} emptyText="No projects returned."
            render={(p, i) => (
              <li key={i} className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-secondary">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{nameOf(p)}</div>
                  <div className="mono text-[10px] text-muted-foreground">{fmt(p.modified)}</div>
                </div>
                <Button data-testid={`button-open-project-${i}`} size="sm" variant="secondary" className="h-6 px-2 text-[11px]" disabled={!g.write} onClick={() => write(`Open project "${nameOf(p)}"`, `/application/project/enter/${encodeURIComponent(String(p.name ?? ''))}`)}>
                  Open
                </Button>
              </li>
            )}
          />
          <Column title="Groups" testid="groups" icon={<Layers className="h-4 w-4" />} items={lists.groups} loading={busy === 'groups'} canRead={g.read} onFetch={() => fetchList('groups', '/groups')} emptyText="No groups in the open project."
            render={(o, i) => (
              <li key={i} className="rounded px-2 py-1.5 text-sm hover:bg-secondary">
                <div className="truncate font-medium">{nameOf(o)}</div>
                {uuidOf(o) && <div className="mono truncate text-[10px] text-muted-foreground">{uuidOf(o)}</div>}
              </li>
            )}
          />
          <Column title="Constructs" testid="constructs" icon={<Boxes className="h-4 w-4" />} items={lists.constructs} loading={busy === 'constructs'} canRead={g.read} onFetch={() => fetchList('constructs', '/constructs')} emptyText="No constructs in the open project."
            render={(o, i) => (
              <li key={i} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-secondary">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{nameOf(o)}</div>
                  <div className="mono truncate text-[10px] text-muted-foreground">{fmt(uuidOf(o))}</div>
                </div>
                <Button data-testid={`button-enter-timeline-${i}`} size="sm" variant="secondary" className="h-6 px-2 text-[11px]" disabled={!g.write || !uuidOf(o)} onClick={() => write(`Enter timeline "${nameOf(o)}"`, `/application/player/entertimeline/${encodeURIComponent(String(uuidOf(o)))}`)}>
                  <LogIn className="mr-1 h-3 w-3" /> Enter
                </Button>
              </li>
            )}
          />
          <Column title="Current slots" testid="slots" icon={<Film className="h-4 w-4" />} items={lists.slots} loading={busy === 'slots'} canRead={g.read} onFetch={() => fetchList('slots', '/constructs/current/slots')} emptyText="No slots in the current construct."
            render={(o, i) => {
              const shots = asArr(o.shots) as Rec[];
              const shot = shots[0] ? uuidOf(shots[0]) : undefined;
              return (
                <li key={i} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-secondary">
                  <span className="mono w-6 text-[10px] text-muted-foreground">{fmt(o.index ?? i + 1)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{nameOf(o)}</div>
                    <div className="mono truncate text-[10px] text-muted-foreground">{fmt(shot)}</div>
                  </div>
                  {shot && (
                    <Link href={`/grading?server=${id}&shot=${encodeURIComponent(shot)}`} onClick={() => setTarget(id)} data-testid={`link-grade-slot-${i}`} className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold hover:bg-card">
                      <Palette className="h-3 w-3" /> Grade
                    </Link>
                  )}
                </li>
              );
            }}
          />
        </div>
      )}
      {lists.projects && lists.projects.length > 6 && (
        <Input data-testid="input-filter-projects" className="mt-3 max-w-xs" placeholder="Filter projects" value={filter} onChange={(e) => setFilter(e.target.value)} />
      )}
      {last.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="kicker">Last response</div>
          <ResultStack results={last} />
          {last[0].result && !last[0].result.ok && <JsonBlock value={last[0].result.data} testid="projects-error" maxH="max-h-40" />}
        </div>
      )}
    </>
  );
}
