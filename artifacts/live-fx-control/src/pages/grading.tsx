import { useEffect, useMemo, useState } from 'react';
import { Download, Upload, Crosshair, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { useGetCommandCatalog, getGetCommandCatalogQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { asArr, fmt, num, pick, useConfirm, useFx, useRunner, type RunResult, type SlotId, type Target } from '@/lib/fx';
import { Empty, GateNote, JsonBlock, PageHeader, ResultStack, TargetSwitch } from '@/components/fx-ui';

type Rec = Record<string, unknown>;
const WHEELS = ['lift', 'gamma', 'gain', 'offset'] as const;
const CH = ['m', 'r', 'g', 'b'] as const;
const CH_COLOR: Record<string, string> = { m: '222 10% 45%', r: '356 70% 50%', g: '145 50% 38%', b: '210 70% 45%' };

export default function Grading() {
  const { target: gt, gate, label, status } = useFx();
  const params = new URLSearchParams(window.location.search);
  const qs = params.get('server');
  const [t, setT] = useState<Target>(qs === 'server-a' || qs === 'server-b' ? qs : gt === 'both' ? 'server-a' : gt);
  const id = t as SlotId;
  const g = gate(id);
  const confirm = useConfirm();
  const { run, pending } = useRunner();
  const [shot, setShot] = useState(params.get('shot') ?? '');
  const [grade, setGrade] = useState<Rec | null>(null);
  const [edit, setEdit] = useState<Rec>({});
  const [controls, setControls] = useState<Rec[] | null>(null);
  const [ctlText, setCtlText] = useState<Record<number, string>>({});
  const [results, setResults] = useState<RunResult[]>([]);
  const catalog = useGetCommandCatalog({ query: { queryKey: getGetCommandCatalogQueryKey() } });
  const ctlDef = useMemo(() => catalog.data?.find((c) => c.method === 'PUT' && /\/shot\/.*controls/.test(c.path)), [catalog.data]);
  const currentShot = pick(status(id).data?.playmode, 'shot_uuid');

  useEffect(() => {
    setGrade(null);
    setEdit({});
    setControls(null);
    setResults([]);
  }, [id, shot]);

  const base = `/shot/${encodeURIComponent(shot.trim())}`;
  const loadGrade = async () => {
    const res = await run([id], 'GET', `${base}/color`);
    setResults(res);
    const d = res[0].result;
    if (d?.ok) {
      const body = (pick(d.data, 'color') ?? (d.data.data as Rec | undefined) ?? d.data) as Rec;
      setGrade(body);
      setEdit(JSON.parse(JSON.stringify(body)));
    }
  };
  const loadControls = async () => {
    const res = await run([id], 'GET', `${base}/controls`);
    setResults(res);
    if (res[0].result?.ok) {
      const list = asArr(pick(res[0].result.data, 'controls')) as Rec[];
      setControls(list);
      setCtlText(Object.fromEntries(list.map((c, i) => [i, JSON.stringify(c, null, 2)])));
    }
  };
  const diff = useMemo(() => {
    const out: Rec = {};
    if (!grade) return out;
    for (const w of WHEELS) {
      if (JSON.stringify(grade[w]) !== JSON.stringify(edit[w]) && edit[w]) out[w] = edit[w];
    }
    return out;
  }, [grade, edit]);
  const applyGrade = async () => {
    const ok = await confirm({ title: 'Apply grade change', targets: [label(id)], action: 'Apply grade', tone: 'arm', body: <JsonBlock value={diff} testid="grade-diff" maxH="max-h-40" /> });
    if (!ok) return;
    const res = await run([id], 'PUT', `${base}/color`, diff, true);
    setResults(res);
    if (res[0].result?.ok) setGrade(JSON.parse(JSON.stringify(edit)));
  };
  const sendControl = async (i: number) => {
    let body: Rec;
    try {
      body = JSON.parse(ctlText[i]);
    } catch {
      setResults([{ id, error: 'Control JSON is invalid' }]);
      return;
    }
    const ok = await confirm({ title: 'Update shot control', targets: [label(id)], action: 'Send control', tone: 'arm' });
    if (!ok) return;
    // The upstream endpoint expects controls_data, not an individual control.
    const res = await run([id], 'PUT', `${base}/controls`, { controls: [body] }, true);
    setResults(res);
    if (res[0].result?.ok) {
      setControls((items) => items?.map((item, index) => index === i ? body : item) ?? null);
    }
  };
  const setVal = (w: string, c: string, v: string) => {
    setEdit((e) => ({ ...e, [w]: { ...((e[w] as Rec) ?? {}), [c]: v === '' ? '' : Number(v) } }));
  };

  return (
    <>
      <PageHeader kicker="Grading" title="Shot grade" desc="Read a shot's grade, edit wheel values, and send only the fields you changed. Nothing is sent until you apply." right={<TargetSwitch value={t} onChange={setT} allowBoth={false} testid="grading-target" />} />
      <div className="panel mb-4 flex flex-wrap items-end gap-2 p-3">
        <div className="min-w-[260px] flex-1">
          <div className="kicker mb-1">Shot UUID on {label(id)}</div>
          <Input data-testid="input-shot-uuid" className="mono" value={shot} onChange={(e) => setShot(e.target.value)} placeholder="paste a shot_uuid or use the current shot" />
        </div>
        <Button data-testid="button-use-current-shot" variant="outline" disabled={!currentShot} onClick={() => setShot(String(currentShot))}>
          <Crosshair className="mr-1.5 h-4 w-4" /> Current shot
        </Button>
        <Button data-testid="button-load-grade" disabled={!g.read || !shot.trim() || pending} onClick={loadGrade}>
          <Download className="mr-1.5 h-4 w-4" /> Read grade
        </Button>
        <Button data-testid="button-load-controls" variant="secondary" disabled={!g.read || !shot.trim() || pending} onClick={loadControls}>
          <SlidersHorizontal className="mr-1.5 h-4 w-4" /> Read controls
        </Button>
      </div>
      <div className="mb-4"><GateNote ids={[id]} /></div>
      {!g.read ? (
        <Empty icon={<SlidersHorizontal className="h-5 w-5" />} title={`${label(id)} is not reachable`} body={`${g.reason}. Grades are read live from the server and never cached or simulated.`} />
      ) : !grade && !controls ? (
        <Empty icon={<SlidersHorizontal className="h-5 w-5" />} title="No shot loaded" body="Enter a shot UUID (or take the one currently in the player) and read its grade or custom controls." />
      ) : null}
      {grade && (
        <div className="panel rise mb-4 p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="text-sm font-bold">Primary wheels</div>
            <span className="mono text-[10px] text-muted-foreground">{Object.keys(diff).length} changed</span>
            <Button data-testid="button-revert-grade" size="sm" variant="ghost" className="ml-auto" disabled={!Object.keys(diff).length} onClick={() => setEdit(JSON.parse(JSON.stringify(grade)))}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Revert
            </Button>
            <Button data-testid="button-apply-grade" size="sm" disabled={!g.write || !Object.keys(diff).length || pending} onClick={applyGrade}>
              <Upload className="mr-1 h-3.5 w-3.5" /> Apply to {label(id)}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {WHEELS.map((w) => {
              const cur = (edit[w] as Rec) ?? {};
              const changed = w in diff;
              return (
                <div key={w} className={cn('rounded-md border p-3', changed && 'border-[hsl(var(--armed))] bg-[hsl(var(--armed)/.06)]')}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="kicker text-foreground">{w}</span>
                    {!grade[w] && <span className="mono text-[10px] text-muted-foreground">not in response</span>}
                  </div>
                  <div className="space-y-1.5">
                    {CH.map((c) => (
                      <label key={c} className="flex items-center gap-2">
                        <span className="mono w-3 text-[11px] font-bold uppercase" style={{ color: `hsl(${CH_COLOR[c]})` }}>{c}</span>
                        <Input data-testid={`input-${w}-${c}`} type="number" step="0.001" className="mono h-7 text-xs" disabled={!grade[w]} value={cur[c] === undefined ? '' : String(cur[c])} onChange={(e) => setVal(w, c, e.target.value)} />
                        <span className="mono w-14 text-right text-[10px] text-muted-foreground">{fmt(num((grade[w] as Rec | undefined)?.[c]))}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <details className="mt-3">
            <summary className="kicker cursor-pointer">Full grade response</summary>
            <div className="mt-2"><JsonBlock value={grade} testid="grade-full" /></div>
          </details>
        </div>
      )}
      {controls && (
        <div className="panel rise mb-4 p-4">
          <div className="mb-3 text-sm font-bold">Custom controls <span className="mono text-[10px] text-muted-foreground">{controls.length}</span></div>
          {controls.length === 0 ? (
            <div className="text-xs text-muted-foreground">This shot reports no custom controls.</div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {controls.map((c, i) => (
                <div key={i} className="rounded-md border p-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{fmt(c.name ?? c.label ?? c.id ?? `Control ${i + 1}`)}</span>
                    <Button data-testid={`button-send-control-${i}`} size="sm" variant="secondary" className="ml-auto h-7" disabled={!g.write || pending} onClick={() => sendControl(i)}>Send</Button>
                  </div>
                  <Textarea data-testid={`input-control-${i}`} className="mono min-h-[120px] text-[11px]" value={ctlText[i] ?? ''} onChange={(e) => setCtlText((s) => ({ ...s, [i]: e.target.value }))} />
                </div>
              ))}
            </div>
          )}
          {ctlDef && (
            <details className="mt-3">
              <summary className="kicker cursor-pointer">Official control schema ({ctlDef.method} {ctlDef.path})</summary>
              <div className="mt-2"><JsonBlock value={ctlDef.bodySchema} testid="control-schema" maxH="max-h-60" /></div>
            </details>
          )}
        </div>
      )}
      {results.length > 0 && <ResultStack results={results} />}
    </>
  );
}
