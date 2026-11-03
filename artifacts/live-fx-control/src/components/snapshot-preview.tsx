import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { captureServerSnapshot, type SnapshotResult } from '@workspace/api-client-react';
import { Camera, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SlotBadge } from '@/components/fx-ui';
import { errMsg, useFx, type SlotId } from '@/lib/fx';

export function SnapshotPreview({ id }: { id: SlotId }) {
  const { status, server } = useFx();
  const online = status(id).data?.connection === 'online';
  const [auto, setAuto] = useState(false);
  const [interval, setIntervalMs] = useState(10000);
  const [visible, setVisible] = useState(!document.hidden);
  const [last, setLast] = useState<SnapshotResult | null>(null);
  const [imageError, setImageError] = useState(false);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  const query = useQuery({
    queryKey: ['snapshot', id, server(id)?.baseUrl],
    queryFn: ({ signal }) => captureServerSnapshot(id, { signal }),
    enabled: auto && online && visible,
    retry: false,
    staleTime: 5000,
    gcTime: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchIntervalInBackground: false,
    refetchInterval: (q) => q.state.error || q.state.data?.ok === false ? false : interval,
  });
  useEffect(() => {
    if (query.data?.ok && query.data.image) {
      setLast(query.data);
      setImageError(false);
    }
    if (query.isError || query.data?.ok === false) setAuto(false);
  }, [query.data, query.isError]);
  const error = query.isError ? errMsg(query.error) : query.data?.error;
  const stale = Boolean(last && (error || !online || imageError));

  return (
    <section data-testid={`snapshot-${id}`} aria-label={`${id} snapshot preview`}>
      <div className="nosignal relative aspect-video overflow-hidden rounded-md border border-[hsl(222_14%_22%)]">
        {last?.image && !imageError ? (
          <img src={last.image} alt={`Captured shot preview from ${server(id)?.name || id}`} className="absolute inset-0 h-full w-full object-contain" onError={() => { setImageError(true); setAuto(false); }} />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-5 text-center text-stone-300">
            <Camera className="h-6 w-6" />
            <span className="mono text-xs font-bold tracking-widest">SNAPSHOT PREVIEW</span>
            <span className="text-xs">{online ? 'Capture a still or enable periodic refresh below.' : 'Connect this server to capture a still.'}</span>
          </div>
        )}
        <div className="absolute left-2 top-2 flex items-center gap-2 rounded bg-black/70 px-2 py-1">
          <SlotBadge id={id} />
          <span className="mono text-[10px] uppercase tracking-wider text-stone-200">Shot snapshot · not live video</span>
        </div>
        {last && <div className="mono absolute bottom-2 left-2 rounded bg-black/75 px-2 py-1 text-[10px] text-white">
          {stale ? 'STALE · ' : ''}Captured {last.capturedAt ? new Date(last.capturedAt).toLocaleTimeString() : '—'} · shot frame {last.frame}
        </div>}
        {query.isFetching && <span role="status" className="absolute bottom-2 right-2 rounded bg-black/75 px-2 py-1 text-xs text-white">Capturing…</span>}
      </div>
      <div className="flex flex-wrap items-center gap-3 py-2 text-xs">
        <Button size="sm" variant="outline" disabled={!online || !visible || query.isFetching} onClick={() => void query.refetch()} data-testid={`capture-${id}`}>
          <RefreshCw className="mr-1.5 h-3 w-3" />{query.isFetching ? 'Capturing…' : error ? 'Retry snapshot' : 'Capture now'}
        </Button>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={auto} disabled={!online} onChange={(e) => { setAuto(e.target.checked); if (e.target.checked) void query.refetch(); }} data-testid={`auto-snapshot-${id}`} />
          Auto refresh
        </label>
        <label className="flex items-center gap-1.5">
          Every
          <select value={interval} onChange={(e) => setIntervalMs(Number(e.target.value))} className="rounded border bg-background p-1" aria-label={`${id} snapshot interval`}>
            <option value={5000}>5 seconds</option>
            <option value={10000}>10 seconds</option>
            <option value={30000}>30 seconds</option>
          </select>
        </label>
      </div>
      <p className="pb-2 text-[11px] text-muted-foreground">
        {last && !auto ? 'Auto refresh off; displaying the last captured still. ' : ''}
        {auto && !visible ? 'Polling paused while this tab is hidden. ' : ''}
        Proxy stills of the current shot; may differ from program output. Capture adds server processing load.
      </p>
      {(error || imageError) && <p role="alert" className="mb-2 rounded border border-destructive/30 p-2 text-xs text-destructive">
        {imageError ? 'The returned image could not be displayed.' : error} Auto refresh stopped; retry manually.
      </p>}
    </section>
  );
}
