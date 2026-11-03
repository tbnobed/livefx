import { useState, type ReactNode } from 'react';
import { Check, Copy, ChevronDown, AlertTriangle, CircleSlash } from 'lucide-react';
import type { ServerStatus } from '@workspace/api-client-react';
import { cn } from '@/lib/utils';
import { slotLetter, slotVar, useFx, type RunResult, type SlotId, type Target } from '@/lib/fx';

export function SlotBadge({ id, size = 'sm' }: { id: string; size?: 'sm' | 'lg' }) {
  return (
    <span
      className={cn('mono inline-flex shrink-0 items-center justify-center rounded-sm font-bold text-white', size === 'lg' ? 'h-9 w-9 text-lg' : 'h-5 w-5 text-[11px]')}
      style={{ background: `hsl(var(${slotVar(id)}))` }}
    >
      {slotLetter(id)}
    </span>
  );
}

export function connMeta(st?: ServerStatus, loading?: boolean) {
  if (loading || !st) return { label: 'Checking', color: '--muted-foreground', live: false };
  if (st.connection === 'online') return { label: 'Online', color: '--online', live: true };
  if (st.connection === 'offline') return { label: 'Offline', color: '--tally', live: false };
  return { label: 'Not configured', color: '--muted-foreground', live: false };
}

export function ConnPill({ id }: { id: string }) {
  const { status } = useFx();
  const s = status(id);
  const m = connMeta(s.data, s.isLoading);
  return (
    <span data-testid={`status-connection-${id}`} className="mono inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: `hsl(var(${m.color}))`, borderColor: `hsl(var(${m.color}) / .35)` }}>
      <span className={cn('h-1.5 w-1.5 rounded-full', m.live && 'pulse-dot')} style={{ background: `hsl(var(${m.color}))` }} />
      {m.label}
    </span>
  );
}

export function TargetSwitch({ value, onChange, allowBoth = true, testid = 'target' }: { value: Target; onChange: (t: Target) => void; allowBoth?: boolean; testid?: string }) {
  const { server } = useFx();
  const opts: Target[] = allowBoth ? ['server-a', 'server-b', 'both'] : ['server-a', 'server-b'];
  return (
    <div className="inline-flex rounded-md border bg-secondary p-0.5" role="radiogroup">
      {opts.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            data-testid={`${testid}-${o}`}
            onClick={() => onChange(o)}
            className={cn('flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 text-xs font-semibold transition-colors', active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {o === 'both' ? (
              <span className="flex -space-x-1">
                <SlotBadge id="server-a" />
                <SlotBadge id="server-b" />
              </span>
            ) : (
              <SlotBadge id={o} />
            )}
            <span className="max-w-[110px] truncate">{o === 'both' ? 'Both (independent)' : server(o)?.name || `Server ${slotLetter(o)}`}</span>
          </button>
        );
      })}
    </div>
  );
}

export function JsonBlock({ value, maxH = 'max-h-80', testid = 'json' }: { value: unknown; maxH?: string; testid?: string }) {
  const [copied, setCopied] = useState(false);
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <div className="group relative">
      <button
        data-testid={`button-copy-${testid}`}
        onClick={() => {
          void navigator.clipboard.writeText(text ?? '');
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className="absolute right-2 top-2 flex items-center gap-1 rounded bg-card/90 px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground opacity-70 hover:opacity-100"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy'}
      </button>
      <pre data-testid={`text-${testid}`} className={cn('mono overflow-auto rounded-md border bg-[hsl(222_18%_12%)] p-3 text-[11.5px] leading-relaxed text-[hsl(40_20%_86%)]', maxH)}>
        {text || '—'}
      </pre>
    </div>
  );
}

export function ResultStack({ results, showData = true }: { results: RunResult[]; showData?: boolean }) {
  const { label } = useFx();
  if (!results.length) return null;
  return (
    <div className="space-y-2">
      {results.map((r) => {
        const ok = !!r.result?.ok;
        return (
          <ResultRow key={r.id} id={r.id} ok={ok} label={label(r.id)} r={r} showData={showData} />
        );
      })}
    </div>
  );
}

function ResultRow({ id, ok, label, r, showData }: { id: SlotId; ok: boolean; label: string; r: RunResult; showData: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid={`result-${id}`} className="rise rounded-md border bg-card">
      <div className="flex items-center gap-2 px-3 py-2 text-xs">
        <SlotBadge id={id} />
        <span className="font-semibold">{label}</span>
        <span className="mono ml-auto font-semibold" style={{ color: `hsl(var(${ok ? '--online' : '--tally'}))` }}>
          {r.result ? `${ok ? 'OK' : 'FAILED'} · HTTP ${r.result.status} · ${r.result.durationMs}ms` : 'REQUEST FAILED'}
        </span>
        {showData && r.result && (
          <button data-testid={`button-toggle-result-${id}`} onClick={() => setOpen(!open)} className="text-muted-foreground hover:text-foreground">
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
          </button>
        )}
      </div>
      {(r.error || r.result?.error) && <div className="mono border-t px-3 py-1.5 text-[11px] text-destructive">{r.error || r.result?.error}</div>}
      {open && r.result && (
        <div className="border-t p-2">
          <JsonBlock value={r.result.data} testid={`result-data-${id}`} maxH="max-h-64" />
        </div>
      )}
    </div>
  );
}

export function NoSignal({ id, compact }: { id: string; compact?: boolean }) {
  const { status } = useFx();
  const st = status(id).data;
  const reason = !st ? 'awaiting status' : st.connection === 'online' ? 'status link only' : st.connection === 'offline' ? 'server unreachable' : 'slot not configured';
  return (
    <div data-testid={`monitor-${id}`} className={cn('nosignal relative overflow-hidden rounded-md border border-[hsl(222_14%_22%)]', compact ? 'aspect-[16/7]' : 'aspect-video')}>
      <div className="bars absolute inset-x-0 top-0 h-[62%]" />
      <div className="sweep absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-transparent via-white/[0.03] to-transparent" />
      <div className="absolute left-2 top-2 flex items-center gap-1.5">
        <SlotBadge id={id} />
        <span className="mono text-[10px] uppercase tracking-widest text-[hsl(40_15%_70%)]">Program out</span>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
        <CircleSlash className="h-5 w-5 text-[hsl(40_15%_62%)]" />
        <div className="mono text-sm font-semibold tracking-[0.3em] text-[hsl(40_20%_88%)]">NO FEED</div>
        <div className="mono text-[10px] uppercase tracking-widest text-[hsl(40_10%_58%)]">No video in this app · {reason}</div>
      </div>
    </div>
  );
}

export function PageHeader({ kicker, title, desc, right }: { kicker: string; title: string; desc?: ReactNode; right?: ReactNode }) {
  return (
    <div className="rise mb-5 flex flex-col gap-3 border-b pb-4 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="kicker">{kicker}</div>
        <h1 className="text-2xl font-extrabold tracking-tight md:text-[28px]">{title}</h1>
        {desc && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div data-testid="empty-state" className="rise flex flex-col items-center justify-center rounded-md border border-dashed px-6 py-10 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border bg-secondary text-muted-foreground">{icon}</div>
      <div className="font-bold">{title}</div>
      <div className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function GateNote({ ids }: { ids: SlotId[] }) {
  const { gate, label } = useFx();
  const blocked = ids.filter((i) => !gate(i).write);
  if (!blocked.length) return null;
  return (
    <div data-testid="text-gate" className="flex items-start gap-2 rounded-md border border-[hsl(var(--armed)/.45)] bg-[hsl(var(--armed)/.1)] px-3 py-2 text-xs">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(30_80%_35%)]" />
      <div>
        Write controls disabled.{' '}
        {blocked.map((i) => (
          <span key={i} className="mr-2">
            <b>{label(i)}</b>: {gate(i).reason}.
          </span>
        ))}
      </div>
    </div>
  );
}

export function Stat({ k, v, testid, mono = true }: { k: string; v: ReactNode; testid?: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="kicker">{k}</div>
      <div data-testid={testid} className={cn('truncate text-sm font-semibold', mono && 'mono')}>
        {v}
      </div>
    </div>
  );
}
