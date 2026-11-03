import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useFx, useRunner, type RunResult, type SlotId } from '@/lib/fx';
import { clampSeekFrame, createScrubQueue } from '@/lib/scrub-queue';
import { ResultStack } from '@/components/fx-ui';

interface Props {
  id: SlotId;
  fresh: boolean;
  frame: number | null;
  length: number | null;
  markIn: number | null;
  markOut: number | null;
  recording: boolean;
  context: string;
}

export function TimelineScrubber({ id, fresh, frame, length, markIn, markOut, recording, context }: Props) {
  const { gate, label } = useFx();
  const { run } = useRunner();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<RunResult[]>([]);
  const mounted = useRef(true);
  const gestureContext = useRef('');
  const key = `${context}:${length}`;
  const g = gate(id);
  const enabled = fresh && g.write && !recording && length !== null && length > 1 && frame !== null;
  const latest = useRef({ enabled, length, key });
  latest.current = { enabled, length, key };
  const queue = useMemo(() => createScrubQueue(async (wanted) => {
    const state = latest.current;
    if (!mounted.current || !state.enabled || state.key !== gestureContext.current || state.length === null) return false;
    const destination = clampSeekFrame(wanted, state.length);
    if (destination === null) return false;
    const response = await run([id], 'PUT', '/application/player/playmode', { mode: 'PAUSE', frame: destination });
    if (mounted.current) {
      setResults(response);
      if (response[0]?.result?.ok) void qc.invalidateQueries({ queryKey: ['live-player', id] });
    }
    return Boolean(response[0]?.result?.ok);
  }, (value) => { if (mounted.current) setBusy(value); }), [id, run, qc]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; queue.cancel(); };
  }, [queue]);
  useEffect(() => {
    queue.cancel();
    setDraft(null);
    setResults([]);
  }, [key, enabled, queue]);
  useEffect(() => {
    if (busy || draft === null) return;
    if (frame === draft) { setDraft(null); return; }
    const timer = window.setTimeout(() => setDraft(null), 750);
    return () => window.clearTimeout(timer);
  }, [busy, draft, frame]);

  const begin = () => {
    if (!latest.current.enabled) return;
    gestureContext.current = latest.current.key;
    queue.resume();
    setResults([]);
  };
  const change = (value: number) => {
    if (!enabled || length === null) return;
    const destination = clampSeekFrame(value, length);
    if (destination === null) return;
    setDraft(destination);
    queue.enqueue(destination);
  };
  const max = Math.max(0, Math.floor(length ?? 0) - 1);
  const percent = (value: number | null) => value !== null && max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0;
  const failed = results.some((result) => !result.result?.ok);
  const reason = !g.write ? g.reason : recording ? 'Scrubbing disabled while recording.' : !fresh ? 'Waiting for live player data.' : !enabled ? 'No seekable timeline.' : '';
  return (
    <div>
      <div className={cn('relative h-9 overflow-hidden rounded-sm border bg-[repeating-linear-gradient(90deg,hsl(var(--muted))_0_1px,transparent_1px_24px)] focus-within:ring-2 focus-within:ring-ring', enabled && 'cursor-ew-resize')}>
        {fresh && markIn !== null && markOut !== null && (
          <div aria-hidden="true" className="absolute inset-y-0 bg-[hsl(var(--armed)/.22)]" style={{ left: `${percent(markIn)}%`, width: `${Math.max(0, percent(markOut) - percent(markIn))}%` }} />
        )}
        {fresh && frame !== null && <div data-testid={`playhead-${id}`} aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-destructive" style={{ left: `${percent(frame)}%` }} />}
        {draft !== null && <div data-testid={`scrub-preview-${id}`} aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-primary" style={{ left: `${percent(draft)}%` }} />}
        {!fresh && <div className="mono absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-widest text-muted-foreground">timeline unavailable</div>}
        <input
          type="range" min={0} max={max} step={1}
          value={clampSeekFrame(draft ?? frame ?? 0, length ?? 0) ?? 0}
          disabled={!enabled}
          aria-label={`Scrub ${label(id)}`}
          aria-valuetext={`Frame ${draft ?? frame ?? 0} of ${max}`}
          aria-describedby={`scrub-hint-${id}`}
          data-testid={`input-scrub-${id}`}
          className="absolute inset-0 z-10 m-0 h-full w-full touch-none cursor-ew-resize opacity-0 disabled:cursor-not-allowed"
          onPointerDown={begin}
          onKeyDown={(event) => { if (!event.repeat) begin(); }}
          onChange={(event) => change(Number(event.target.value))}
          onPointerCancel={() => { queue.cancel(); setDraft(null); }}
        />
      </div>
      <p id={`scrub-hint-${id}`} className="mt-1 text-[10px] text-muted-foreground">
        {reason || (draft !== null ? `Seek requested: frame ${draft}. Playback pauses while scrubbing.` : 'Click or drag to scrub · arrows seek by frame · pauses playback')}
      </p>
      {failed && <div className="mt-2"><ResultStack results={results} /></div>}
    </div>
  );
}
