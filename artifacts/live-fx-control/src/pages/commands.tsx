import { useEffect, useMemo, useState } from 'react';
import { Search, Terminal, Send, ShieldAlert, RefreshCw } from 'lucide-react';
import { useGetCommandCatalog, getGetCommandCatalogQueryKey, type CommandDefinition } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { targetIds, useConfirm, useFx, useRunner, type Method, type RunResult } from '@/lib/fx';
import { Empty, GateNote, JsonBlock, PageHeader, ResultStack, SlotBadge } from '@/components/fx-ui';

const METHOD_COLOR: Record<string, string> = { GET: '--online', POST: '--slot-a', PUT: '--armed', PATCH: '--armed', DELETE: '--tally' };

function pretty(s: string) {
  if (!s) return '';
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

export default function Commands() {
  const { data, isLoading, isError, refetch } = useGetCommandCatalog({ query: { queryKey: getGetCommandCatalogQueryKey() } });
  const { target, gate, label } = useFx();
  const confirm = useConfirm();
  const { run, pending } = useRunner();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [sel, setSel] = useState<CommandDefinition | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [body, setBody] = useState('');
  const [results, setResults] = useState<RunResult[]>([]);
  const [bodyErr, setBodyErr] = useState('');

  const cats = useMemo(() => Array.from(new Set((data ?? []).map((c) => c.category))).sort(), [data]);
  const list = useMemo(
    () =>
      (data ?? []).filter((c) => (cat === 'all' || c.category === cat) && `${c.method} ${c.path} ${c.summary} ${c.description}`.toLowerCase().includes(q.toLowerCase())),
    [data, cat, q],
  );

  useEffect(() => {
    if (!sel) return;
    setParams(Object.fromEntries(sel.parameters.map((p) => [p, ''])));
    setQuery('');
    setBody(pretty(sel.bodyExample));
    setResults([]);
    setBodyErr('');
  }, [sel]);

  const ids = targetIds(target);
  const isGet = sel?.method === 'GET';
  const allowed = ids.every((i) => (isGet ? gate(i).read : gate(i).write));
  const missing = sel ? sel.parameters.filter((p) => !params[p]?.trim()) : [];
  const resolved = sel
    ? sel.path.replace(/\{([^}]+)\}|:([A-Za-z_]+)/g, (m, a, b) => {
        const k = a ?? b;
        return params[k] ? encodeURIComponent(params[k]) : m;
      }) + (query.trim() ? `?${query.trim().replace(/^\?/, '')}` : '')
    : '';

  const execute = async () => {
    if (!sel) return;
    let parsed: Record<string, unknown> | undefined;
    if (!isGet && body.trim()) {
      try {
        parsed = JSON.parse(body);
        setBodyErr('');
      } catch (e) {
        setBodyErr(e instanceof Error ? e.message : 'Invalid JSON');
        return;
      }
    }
    if (!isGet) {
      const ok = await confirm({
        title: `${sel.method} ${sel.summary || sel.path}`,
        targets: ids.map(label),
        action: `Send ${sel.method}`,
        tone: sel.dangerous ? 'danger' : 'arm',
        body: <span className="mono block break-all text-xs text-foreground">{sel.method} /APIV2{resolved}</span>,
      });
      if (!ok) return;
    }
    setResults(await run(ids, sel.method as Method, resolved, parsed, !isGet || undefined));
  };

  return (
    <>
      <PageHeader kicker="Commands" title="API console" desc="Every documented Live FX REST route, with its schema and example. Non-GET requests always ask for confirmation and are sent with confirmed=true." />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="panel flex max-h-[calc(100dvh-180px)] flex-col">
          <div className="space-y-2 border-b p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input data-testid="input-search-commands" className="pl-8" placeholder="Search routes" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1">
              {['all', ...cats].map((c) => (
                <button key={c} data-testid={`button-category-${c}`} onClick={() => setCat(c)} className={cn('rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold', cat === c ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-auto p-1">
            {isLoading ? (
              <div className="space-y-1 p-1">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : isError ? (
              <div className="p-4 text-center text-sm">
                Catalog failed to load.
                <Button data-testid="button-retry-catalog" size="sm" variant="outline" className="ml-2" onClick={() => refetch()}>
                  <RefreshCw className="mr-1 h-3 w-3" /> Retry
                </Button>
              </div>
            ) : list.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">No routes match.</div>
            ) : (
              list.map((c) => (
                <button key={c.id} data-testid={`button-command-${c.id}`} onClick={() => setSel(c)} className={cn('flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-secondary', sel?.id === c.id && 'bg-secondary')}>
                  <span className="mono mt-0.5 w-12 shrink-0 text-[10px] font-bold" style={{ color: `hsl(var(${METHOD_COLOR[c.method] ?? '--muted-foreground'}))` }}>{c.method}</span>
                  <span className="min-w-0">
                    <span className="mono block truncate text-[11.5px]">{c.path}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{c.summary}</span>
                  </span>
                  {c.dangerous && <ShieldAlert className="ml-auto mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />}
                </button>
              ))
            )}
          </div>
          <div className="mono border-t px-3 py-1.5 text-[10px] text-muted-foreground">{list.length} / {data?.length ?? 0} routes</div>
        </div>
        <div className="min-w-0">
          {!sel ? (
            <Empty icon={<Terminal className="h-5 w-5" />} title="Pick a route" body="Choose any documented endpoint to fill its parameters, review the schema, and send it to the selected server(s)." />
          ) : (
            <div className="panel rise space-y-4 p-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mono rounded-sm px-1.5 py-0.5 text-xs font-bold text-white" style={{ background: `hsl(var(${METHOD_COLOR[sel.method] ?? '--muted-foreground'}))` }}>{sel.method}</span>
                  <span className="mono break-all text-sm font-semibold">/APIV2{sel.path}</span>
                  <span className="kicker ml-auto">{sel.category}</span>
                </div>
                <div className="mt-2 font-bold">{sel.summary}</div>
                {sel.description && <p className="mt-1 text-sm text-muted-foreground">{sel.description}</p>}
                {sel.dangerous && <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-destructive"><ShieldAlert className="h-3.5 w-3.5" /> Marked dangerous in the catalog.</div>}
              </div>
              {sel.parameters.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {sel.parameters.map((p) => (
                    <label key={p}>
                      <span className="kicker">{p}</span>
                      <Input data-testid={`input-param-${p}`} className="mono" value={params[p] ?? ''} onChange={(e) => setParams((s) => ({ ...s, [p]: e.target.value }))} />
                    </label>
                  ))}
                </div>
              )}
              <label className="block">
                <span className="kicker">Query string</span>
                <Input data-testid="input-query-string" className="mono" placeholder="key=value&other=1" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              {!isGet && (
                <div className="grid gap-3 xl:grid-cols-2">
                  <label className="block">
                    <span className="kicker">JSON body</span>
                    <Textarea data-testid="input-body" className="mono min-h-[200px] text-[11.5px]" value={body} onChange={(e) => setBody(e.target.value)} />
                    {bodyErr && <span className="mono text-[11px] text-destructive">{bodyErr}</span>}
                  </label>
                  <div>
                    <span className="kicker">Schema</span>
                    <JsonBlock value={pretty(sel.bodySchema) || 'No body schema'} testid="schema" maxH="max-h-[200px]" />
                  </div>
                </div>
              )}
              <div className="rounded-md border bg-secondary/50 p-2">
                <div className="kicker mb-1">Will send to</div>
                <div className="flex flex-wrap items-center gap-2">
                  {ids.map((i) => (
                    <span key={i} className="flex items-center gap-1.5 text-xs font-semibold"><SlotBadge id={i} /> {label(i)}</span>
                  ))}
                  <span className="mono w-full break-all text-[11px] text-muted-foreground">{sel.method} /APIV2{resolved}</span>
                </div>
              </div>
              {!isGet && <GateNote ids={ids} />}
              <div className="flex items-center gap-2">
                <Button data-testid="button-execute" disabled={!allowed || missing.length > 0 || pending} onClick={execute}>
                  <Send className="mr-1.5 h-4 w-4" /> {isGet ? 'Send GET' : `Review and send ${sel.method}`}
                </Button>
                {missing.length > 0 && <span className="text-xs text-muted-foreground">Fill: {missing.join(', ')}</span>}
                {!allowed && <span className="text-xs text-muted-foreground">Target not {isGet ? 'online' : 'armed and online'}.</span>}
              </div>
              {results.length > 0 && (
                <div className="space-y-2">
                  <ResultStack results={results} showData={false} />
                  {results.map((r) => r.result && (
                    <div key={r.id}>
                      <div className="kicker mb-1">Response · {label(r.id)}</div>
                      <JsonBlock value={r.result.data} testid={`response-${r.id}`} maxH="max-h-[420px]" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
