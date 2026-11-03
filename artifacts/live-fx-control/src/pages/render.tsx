import { useState } from 'react';
import { Film, Play, Square, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { targetIds, useConfirm, useFx, useRunner, type RunResult, type SlotId } from '@/lib/fx';
import { Empty, GateNote, JsonBlock, PageHeader, ResultStack, SlotBadge } from '@/components/fx-ui';

export default function Render() {
  const { target, gate, label } = useFx();
  const ids = targetIds(target);
  const confirm = useConfirm();
  const { run, pending } = useRunner();
  const [queues, setQueues] = useState<Partial<Record<SlotId, RunResult>>>({});
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<RunResult[]>([]);
  const readable = ids.filter((i) => gate(i).read);
  const canWrite = ids.every((i) => gate(i).write);

  const load = async () => {
    setLoading(true);
    const res = await run(readable, 'GET', '/application/render');
    setLoading(false);
    setQueues((q) => ({ ...q, ...Object.fromEntries(res.map((r) => [r.id, r])) }));
  };
  const act = async (kind: 'start' | 'stop') => {
    const ok = await confirm({
      title: kind === 'start' ? 'Start render' : 'Stop render',
      targets: ids.map(label),
      action: kind === 'start' ? 'Start render' : 'Stop render',
      body: ids.length > 1 ? 'Two independent requests. Each server renders its own queue.' : undefined,
    });
    if (!ok) return;
    setResults(await run(ids, 'POST', `/application/render/${kind}`, undefined, true));
  };

  return (
    <>
      <PageHeader
        kicker="Render"
        title="Render queue"
        desc="Inspect each server's queue and explicitly start or stop rendering. Target follows the global selector."
        right={
          <div className="flex gap-2">
            <Button data-testid="button-load-queue" variant="outline" disabled={!readable.length || loading} onClick={load}>
              <RefreshCw className="mr-1.5 h-4 w-4" /> Read queue
            </Button>
            <Button data-testid="button-render-start" disabled={!canWrite || pending} onClick={() => act('start')}>
              <Play className="mr-1.5 h-4 w-4" /> Start
            </Button>
            <Button data-testid="button-render-stop" variant="destructive" disabled={!canWrite || pending} onClick={() => act('stop')}>
              <Square className="mr-1.5 h-4 w-4" /> Stop
            </Button>
          </div>
        }
      />
      <div className="mb-4"><GateNote ids={ids} /></div>
      {results.length > 0 && <div className="mb-4"><ResultStack results={results} /></div>}
      <div className={ids.length > 1 ? 'grid gap-4 lg:grid-cols-2' : ''}>
        {ids.map((id) => {
          const q = queues[id];
          return (
            <div key={id} className="panel rise p-4">
              <div className="mb-3 flex items-center gap-2">
                <SlotBadge id={id} />
                <span className="text-sm font-bold">{label(id)}</span>
              </div>
              {!gate(id).read ? (
                <Empty icon={<Film className="h-5 w-5" />} title="Queue unavailable" body={`${gate(id).reason}.`} />
              ) : loading ? (
                <Skeleton className="h-40 w-full" />
              ) : !q ? (
                <Empty icon={<Film className="h-5 w-5" />} title="Queue not read" body="Read the queue to see exactly what the server reports." />
              ) : q.result?.ok ? (
                <JsonBlock value={q.result.data} testid={`queue-${id}`} maxH="max-h-[480px]" />
              ) : (
                <ResultStack results={[q]} />
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
