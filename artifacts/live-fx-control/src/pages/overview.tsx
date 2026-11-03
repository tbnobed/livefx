import { useState } from 'react';
import { Link } from 'wouter';
import { Pause, Play, SkipBack, StepBack, StepForward, Circle, RefreshCw, AlertTriangle, Settings2, Repeat } from 'lucide-react';
import { useGetActivity, getGetActivityQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { fmt, num, pick, targetIds, useConfirm, useFx, useRunner, type RunResult, type SlotId } from '@/lib/fx';
import { ConnPill, GateNote, PageHeader, ResultStack, SlotBadge, Stat } from '@/components/fx-ui';
import { SnapshotPreview } from '@/components/snapshot-preview';
import { playerBlockReason } from '@/lib/player-state';

function ServerCard({ id }: { id: SlotId }) {
  const { server, status, serversLoading } = useFx();
  const s = server(id);
  const q = status(id);
  const st = q.data;
  if (serversLoading || q.isLoading)
    return (
      <div className="panel space-y-3 p-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="aspect-[16/7] w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  const online = st?.connection === 'online';
  return (
    <div data-testid={`card-server-${id}`} className="panel rise overflow-hidden" style={{ borderTop: `3px solid hsl(var(${id === 'server-b' ? '--slot-b' : '--slot-a'}))` }}>
      <div className="flex items-center gap-3 p-4 pb-3">
        <SlotBadge id={id} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-extrabold tracking-tight">{s?.name || (id === 'server-b' ? 'Server B' : 'Server A')}</div>
          <div className="mono truncate text-[11px] text-muted-foreground">{s?.role || 'no role'} · {s?.baseUrl || 'base URL not set'}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <ConnPill id={id} />
          <span className="mono text-[10px] font-semibold uppercase tracking-wider" style={{ color: `hsl(var(${s?.allowControl ? '--armed' : '--muted-foreground'}))` }}>
            {s?.allowControl ? 'Control armed' : 'Monitor only'}
          </span>
        </div>
      </div>
      <div className="px-4">
        <SnapshotPreview key={`${id}:${s?.baseUrl}`} id={id} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-4">
        <Stat k="Latency" v={st?.latencyMs != null ? `${st.latencyMs} ms` : '—'} testid={`text-latency-${id}`} />
        <Stat k="Version" v={online ? `${fmt(pick(st?.system, 'version'))}${pick(st?.system, 'build') != null ? ` b${fmt(pick(st?.system, 'build'))}` : ''}` : '—'} testid={`text-version-${id}`} />
        <Stat k="Module" v={online ? fmt(pick(st?.application, 'module')) : '—'} />
        <Stat k="Project" v={online ? fmt(pick(st?.application, 'project')) : '—'} testid={`text-project-${id}`} />
        <Stat k="System" v={online ? fmt(pick(st?.system, 'system_name')) : '—'} />
        <Stat k="REST" v={online ? fmt(pick(st?.system, 'rest_version')) : '—'} />
        <Stat k="Mode" v={online ? fmt(pick(st?.playmode, 'mode')) : '—'} />
        <Stat k="Checked" v={st ? new Date(st.checkedAt).toLocaleTimeString() : '—'} />
      </div>
      {(st?.error || (st?.warnings?.length ?? 0) > 0) && (
        <div className="space-y-1 border-t bg-[hsl(var(--tally)/.05)] px-4 py-2.5">
          {st?.error && <div className="mono text-[11px] text-destructive">{st.error}</div>}
          {st?.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-[hsl(30_70%_32%)]">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}
      {!s?.baseUrl && (
        <div className="flex items-center justify-between border-t px-4 py-2.5 text-xs">
          <span className="text-muted-foreground">This slot has no server address yet.</span>
          <Link href="/settings" data-testid={`link-configure-${id}`} className="flex items-center gap-1 font-semibold hover:underline">
            <Settings2 className="h-3.5 w-3.5" /> Configure slot
          </Link>
        </div>
      )}
    </div>
  );
}

function Timeline({ id }: { id: SlotId }) {
  const { status, label } = useFx();
  const st = status(id).data;
  const pm = st?.playmode;
  const online = st?.connection === 'online';
  const frame = num(pick(pm, 'frame'));
  const length = num(pick(pm, 'length'));
  const mi = num(pick(pm, 'mark_in'));
  const mo = num(pick(pm, 'mark_out'));
  const pct = (v: number | null) => (v != null && length ? Math.min(100, Math.max(0, (v / length) * 100)) : null);
  const mode = fmt(pick(pm, 'mode'));
  return (
    <div data-testid={`timeline-${id}`} className="rounded-md border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <SlotBadge id={id} />
        <span className="font-semibold">{label(id)}</span>
        {online ? (
          <span className={cn('mono rounded-sm px-1.5 py-0.5 text-[10px] font-bold', mode === 'RECORD' ? 'bg-destructive text-destructive-foreground' : 'bg-secondary')}>{mode}</span>
        ) : (
          <span className="mono text-[10px] uppercase text-muted-foreground">no playmode — not connected</span>
        )}
        <span className="mono ml-auto text-sm font-bold tabular-nums">{online ? fmt(pick(pm, 'timecodec') ?? pick(pm, 'timecode')) : '--:--:--:--'}</span>
      </div>
      <div className="relative h-7 overflow-hidden rounded-sm border bg-[repeating-linear-gradient(90deg,hsl(var(--muted))_0_1px,transparent_1px_24px)]">
        {online && pct(mi) != null && pct(mo) != null && (
          <div className="absolute inset-y-0 bg-[hsl(var(--armed)/.22)]" style={{ left: `${pct(mi)}%`, width: `${(pct(mo) ?? 0) - (pct(mi) ?? 0)}%` }} />
        )}
        {online && pct(frame) != null && <div className="absolute inset-y-0 w-0.5 bg-destructive transition-[left] duration-500" style={{ left: `${pct(frame)}%` }} />}
        {!online && <div className="mono absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-widest text-muted-foreground">timeline unavailable</div>}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Stat k="Frame" v={online ? fmt(frame) : '—'} testid={`text-frame-${id}`} />
        <Stat k="Length" v={online ? fmt(length) : '—'} />
        <Stat k="FPS" v={online ? fmt(pick(pm, 'fps')) : '—'} />
        <Stat k="Loop" v={online ? fmt(pick(pm, 'loop')) : '—'} />
        <Stat k="In / Out" v={online ? `${fmt(mi)} / ${fmt(mo)}` : '—'} />
        <Stat k="Audio" v={online ? fmt(pick(pm, 'audio')) : '—'} />
      </div>
    </div>
  );
}

function Transport() {
  const { target, gate, label, status } = useFx();
  const confirm = useConfirm();
  const { run, pending } = useRunner();
  const [results, setResults] = useState<RunResult[]>([]);
  const ids = targetIds(target);
  const blockedPlayers = ids.filter((i) => gate(i).read && playerBlockReason(status(i).data) !== null);
  const can = ids.every((i) => gate(i).write && playerBlockReason(status(i).data) === null);
  const send = async (desc: string, body: Record<string, unknown> | ((id: SlotId) => Record<string, unknown>), needConfirm = false) => {
    if (!can || pending) return;
    if (needConfirm) {
      const ok = await confirm({ title: desc, targets: ids.map(label), action: desc, body: ids.length > 1 ? 'Sent as separate requests to each server. Start times are not synchronized.' : undefined });
      if (!ok) return;
    }
    setResults(await run(ids, 'PUT', '/application/player/playmode', body, needConfirm || undefined));
  };
  const frameOf = (id: SlotId) => num(pick(status(id).data?.playmode, 'frame')) ?? 0;
  const btn = 'h-11 flex-1 min-w-[52px] font-semibold';
  return (
    <div className="panel rise p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="kicker">Transport</div>
          <div className="text-sm font-bold">{ids.map(label).join('  +  ')}</div>
        </div>
        {pending && <span className="mono text-[10px] uppercase text-muted-foreground">sending…</span>}
      </div>
      <GateNote ids={ids} />
      {blockedPlayers.length > 0 && (
        <div data-testid="transport-player-required" className="mt-3 space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950" role="status">
          {blockedPlayers.map((id) => <p key={id}><b>{label(id)}:</b> {playerBlockReason(status(id).data)}</p>)}
          {ids.length > 1 && <p>Both-server transport stays disabled until both players are ready.</p>}
          <Link href="/projects" className="inline-block font-semibold underline" data-testid="link-enter-player">Open Projects / timelines</Link>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button data-testid="button-goto-start" variant="outline" className={btn} disabled={!can || pending} onClick={() => send('Go to frame 0', { frame: 0 })} title="Frame 0">
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button data-testid="button-step-back" variant="outline" className={btn} disabled={!can || pending} onClick={() => send('Step back', (id) => ({ frame: Math.max(0, frameOf(id) - 1) }))} title="Step back">
          <StepBack className="h-4 w-4" />
        </Button>
        <Button data-testid="button-play-rev" variant="outline" className={btn} disabled={!can || pending} onClick={() => send('Play reverse', { mode: 'PLAY_REV' })} title="Play reverse">
          <Play className="h-4 w-4 rotate-180" />
        </Button>
        <Button data-testid="button-pause" variant="outline" className={btn} disabled={!can || pending} onClick={() => send('Pause', { mode: 'PAUSE' })} title="Pause">
          <Pause className="h-4 w-4" />
        </Button>
        <Button data-testid="button-play" className={btn} disabled={!can || pending} onClick={() => send('Play forward', { mode: 'PLAY_FRW' })} title="Play forward">
          <Play className="h-4 w-4" />
        </Button>
        <Button data-testid="button-step-fwd" variant="outline" className={btn} disabled={!can || pending} onClick={() => send('Step forward', (id) => ({ frame: frameOf(id) + 1 }))} title="Step forward">
          <StepForward className="h-4 w-4" />
        </Button>
        <Button data-testid="button-record" variant="destructive" className={cn(btn, 'gap-1.5')} disabled={!can || pending} onClick={() => send('Start record', { mode: 'RECORD' }, true)}>
          <Circle className="h-3.5 w-3.5 fill-current" /> REC
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="kicker mr-1 flex items-center gap-1">
          <Repeat className="h-3 w-3" /> Loop
        </span>
        {['ONCE', 'LOOP', 'BOUNCE'].map((l) => (
          <Button key={l} data-testid={`button-loop-${l.toLowerCase()}`} size="sm" variant="secondary" className="mono h-7 text-[11px]" disabled={!can || pending} onClick={() => send(`Loop ${l}`, { loop: l })}>
            {l}
          </Button>
        ))}
      </div>
      {results.length > 0 && (
        <div className="mt-3">
          <ResultStack results={results} />
        </div>
      )}
    </div>
  );
}

function RecentActivity() {
  const { target } = useFx();
  const ids = targetIds(target);
  const { data, isLoading } = useGetActivity({ query: { queryKey: getGetActivityQueryKey(), refetchInterval: 5000 } });
  const items = (data ?? []).filter((entry) => ids.includes(entry.serverId as SlotId)).slice(0, 7);
  return (
    <div className="panel rise p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="kicker">Recent operator activity</div>
        <Link href="/activity" data-testid="link-all-activity" className="text-xs font-semibold hover:underline">
          Full log
        </Link>
      </div>
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : items.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">No actions recorded yet. Every command sent from this desk appears here.</div>
      ) : (
        <ul className="divide-y">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-1.5 text-xs">
              <SlotBadge id={a.serverId} />
              <span className="truncate font-medium">{a.action}</span>
              <span className="mono ml-auto shrink-0 text-[10px]" style={{ color: `hsl(var(${a.ok ? '--online' : '--tally'}))` }}>
                {a.ok ? 'OK' : 'FAIL'}
              </span>
              <span className="mono shrink-0 text-[10px] text-muted-foreground">{new Date(a.timestamp).toLocaleTimeString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Overview() {
  const { target, status, servers, label } = useFx();
  const ids = targetIds(target);
  const configured = servers.filter((s) => ids.includes(s.id as SlotId) && s.baseUrl).length;
  const online = ids.filter((i) => status(i).data?.connection === 'online').length;
  return (
    <>
      <PageHeader
        kicker="Overview"
        title={target === 'both' ? 'Both servers. One desk.' : label(target)}
        desc={`${configured} of ${ids.length} selected slots configured · ${online} online. Status polls every 3 seconds; opt-in shot snapshots are still images, not live video.`}
        right={
          <Button data-testid="button-refresh-status" variant="outline" size="sm" onClick={() => ids.forEach((i) => status(i).refetch())}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> {ids.length > 1 ? 'Re-check both' : 'Re-check server'}
          </Button>
        }
      />
      <div className={cn('grid gap-4', ids.length > 1 && 'lg:grid-cols-2')}>
        {ids.map((i) => (
          <ServerCard key={i} id={i} />
        ))}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <div className="space-y-2">
            {targetIds(target).map((i) => (
              <Timeline key={i} id={i} />
            ))}
          </div>
          <Transport />
        </div>
        <RecentActivity />
      </div>
    </>
  );
}
