import { useMemo, useState } from 'react';
import { ScrollText, RefreshCw } from 'lucide-react';
import { useGetActivity, getGetActivityQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Empty, PageHeader, SlotBadge } from '@/components/fx-ui';
import { targetIds, useFx, type SlotId } from '@/lib/fx';

export default function ActivityPage() {
  const { target } = useFx();
  const { data, isLoading, isError, refetch, isFetching } = useGetActivity({ query: { queryKey: getGetActivityQueryKey(), refetchInterval: 5000 } });
  const [server, setServer] = useState('all');
  const [result, setResult] = useState('all');
  const [q, setQ] = useState('');
  const items = useMemo(
    () =>
      (data ?? []).filter(
        (a) =>
          targetIds(target).includes(a.serverId as SlotId) &&
          (server === 'all' || a.serverId === server) &&
          (result === 'all' || (result === 'ok') === a.ok) &&
          `${a.action} ${a.detail} ${a.serverName}`.toLowerCase().includes(q.toLowerCase()),
      ),
    [data, server, result, q, target],
  );
  const chip = (active: boolean) => cn('rounded-sm border px-2 py-1 text-xs font-semibold', active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground');
  return (
    <>
      <PageHeader
        kicker="Activity"
        title="Operator audit log"
        desc="Commands and configuration changes for the selected server scope, newest first."
        right={
          <Button data-testid="button-refresh-activity" variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isFetching && 'animate-spin')} /> Refresh
          </Button>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {(target === 'both' ? [['all', 'Both servers'], ['server-a', 'Server A'], ['server-b', 'Server B']] : [[target, target === 'server-a' ? 'Server A' : 'Server B']]).map(([v, l]) => (
          <button key={v} data-testid={`filter-server-${v}`} className={chip(target !== 'both' || server === v)} onClick={() => setServer(v)}>{l}</button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        {[['all', 'Any result'], ['ok', 'OK'], ['fail', 'Failed']].map(([v, l]) => (
          <button key={v} data-testid={`filter-result-${v}`} className={chip(result === v)} onClick={() => setResult(v)}>{l}</button>
        ))}
        <Input data-testid="input-search-activity" className="ml-auto h-8 max-w-xs" placeholder="Search actions" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {isLoading ? (
        <div className="space-y-1.5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : isError ? (
        <Empty icon={<ScrollText className="h-5 w-5" />} title="Could not load activity" body="The API server did not respond." action={<Button data-testid="button-retry-activity" size="sm" onClick={() => refetch()}>Retry</Button>} />
      ) : items.length === 0 ? (
        <Empty icon={<ScrollText className="h-5 w-5" />} title={data?.length ? 'No matching entries' : 'Log is empty'} body={data?.length ? 'Adjust the filters.' : 'Nothing has been sent yet. Actions appear here the moment an operator clicks.'} />
      ) : (
        <div className="panel overflow-hidden">
          {items.map((a, i) => (
            <div key={a.id} data-testid={`row-activity-${a.id}`} className={cn('grid grid-cols-[auto_1fr_auto] items-start gap-3 px-4 py-2.5 text-sm', i && 'border-t')}>
              <SlotBadge id={a.serverId} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold">{a.action}</span>
                  <span className="text-xs text-muted-foreground">{a.serverName}</span>
                </div>
                {a.detail && <div className="mono mt-0.5 break-all text-[11px] text-muted-foreground">{a.detail}</div>}
              </div>
              <div className="text-right">
                <div className="mono text-[11px] font-bold" style={{ color: `hsl(var(${a.ok ? '--online' : '--tally'}))` }}>{a.ok ? 'OK' : 'FAILED'}</div>
                <div className="mono text-[10px] text-muted-foreground">{new Date(a.timestamp).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
