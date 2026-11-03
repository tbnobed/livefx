import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Save, PlugZap, ShieldCheck, KeyRound, Network, ShieldAlert } from 'lucide-react';
import { useConfigureServer, getListServersQueryKey, getGetServerStatusQueryKey, getGetActivityQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { targetIds, errMsg, fmt, pick, useConfirm, useFx, type SlotId } from '@/lib/fx';
import { ConnPill, PageHeader, SlotBadge } from '@/components/fx-ui';

function SlotForm({ id }: { id: SlotId }) {
  const { server, status, serversLoading } = useFx();
  const s = server(id);
  const st = status(id);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { toast } = useToast();
  const m = useConfigureServer();
  const [f, setF] = useState({ name: '', role: '', baseUrl: '', allowControl: false });
  const init = useRef(false);
  useEffect(() => {
    if (s && !init.current) {
      init.current = true;
      setF({ name: s.name, role: s.role, baseUrl: s.baseUrl, allowControl: s.allowControl });
    }
  }, [s]);
  const dirty = !!s && (f.name !== s.name || f.role !== s.role || f.baseUrl !== s.baseUrl || f.allowControl !== s.allowControl);
  const save = async () => {
    if (!f.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    if (f.allowControl && !s?.allowControl) {
      const ok = await confirm({ title: 'Arm remote control', targets: [`${id === 'server-b' ? 'B' : 'A'} · ${f.name}`], action: 'Arm and save', tone: 'arm', body: 'Operators will be able to send transport, project, grade and render commands to this server.' });
      if (!ok) return;
    }
    if (!f.baseUrl.trim() && s?.baseUrl) {
      const ok = await confirm({ title: 'Disconnect slot', targets: [`${id === 'server-b' ? 'B' : 'A'} · ${s.name}`], action: 'Clear address' });
      if (!ok) return;
    }
    m.mutate(
      { id, data: { name: f.name.trim(), role: f.role.trim(), baseUrl: f.baseUrl.trim(), allowControl: f.allowControl } },
      {
        onSuccess: (srv) => {
          setF({ name: srv.name, role: srv.role, baseUrl: srv.baseUrl, allowControl: srv.allowControl });
          void qc.invalidateQueries({ queryKey: getListServersQueryKey() });
          void qc.invalidateQueries({ queryKey: getGetServerStatusQueryKey(id) });
          void qc.invalidateQueries({ queryKey: getGetActivityQueryKey() });
          toast({ title: `Slot ${id === 'server-b' ? 'B' : 'A'} saved`, description: srv.baseUrl ? 'Testing connection now.' : 'Slot disconnected.' });
        },
        onError: (e) => toast({ title: 'Save failed', description: errMsg(e), variant: 'destructive' }),
      },
    );
  };
  if (serversLoading) return <Skeleton className="h-[420px]" />;
  const sd = st.data;
  return (
    <div data-testid={`form-slot-${id}`} className="panel rise overflow-hidden" style={{ borderTop: `3px solid hsl(var(${id === 'server-b' ? '--slot-b' : '--slot-a'}))` }}>
      <div className="flex items-center gap-3 border-b p-4">
        <SlotBadge id={id} size="lg" />
        <div className="flex-1">
          <div className="kicker">Slot {id === 'server-b' ? 'B' : 'A'}</div>
          <div className="font-bold">{s?.name || 'Unnamed'}</div>
        </div>
        <ConnPill id={id} />
      </div>
      <div className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="kicker">Name</span>
            <Input data-testid={`input-name-${id}`} maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </label>
          <label>
            <span className="kicker">Role</span>
            <Input data-testid={`input-role-${id}`} maxLength={80} placeholder="e.g. Stage left wall" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} />
          </label>
        </div>
        <label className="block">
          <span className="kicker">Server address</span>
          <Input data-testid={`input-baseurl-${id}`} className="mono" maxLength={500} placeholder="https://livefx-a.studio.example:8080  or  …/APIV2" value={f.baseUrl} onChange={(e) => setF({ ...f, baseUrl: e.target.value })} />
          <span className="mt-1 block text-[11px] text-muted-foreground">HTTP(S) origin or full /APIV2 base. Leave empty to disconnect this slot.</span>
        </label>
        <div className={cn('flex items-center justify-between rounded-md border p-3', f.allowControl && 'border-[hsl(var(--armed))] bg-[hsl(var(--armed)/.08)]')}>
          <div>
            <div className="text-sm font-bold">{f.allowControl ? 'Remote control armed' : 'Read-only monitoring'}</div>
            <div className="text-xs text-muted-foreground">{f.allowControl ? 'Write commands allowed (each still needs a click).' : 'Status and reads only. All write controls disabled.'}</div>
          </div>
          <Switch data-testid={`switch-control-${id}`} checked={f.allowControl} onCheckedChange={(v) => setF({ ...f, allowControl: v })} />
        </div>
        <div className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs">
          <KeyRound className="h-3.5 w-3.5" />
          API key: <b data-testid={`text-key-${id}`}>{s?.keyConfigured ? 'configured as secret' : 'none'}</b>
          <span className="mono ml-auto text-[10px] text-muted-foreground">{id === 'server-b' ? 'LIVE_FX_SERVER_B_KEY' : 'LIVE_FX_SERVER_A_KEY'}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button data-testid={`button-save-${id}`} disabled={!dirty || m.isPending} onClick={save}>
            <Save className="mr-1.5 h-4 w-4" /> {m.isPending ? 'Saving…' : 'Save slot'}
          </Button>
          <Button data-testid={`button-test-${id}`} variant="outline" disabled={!s?.baseUrl || st.isFetching} onClick={st.refetch}>
            <PlugZap className="mr-1.5 h-4 w-4" /> {st.isFetching ? 'Testing…' : 'Test connection'}
          </Button>
          {dirty && <span className="self-center text-xs text-[hsl(30_70%_35%)]">Unsaved changes</span>}
        </div>
        {sd && sd.connection !== 'unconfigured' && (
          <div className="mono rounded-md border p-2.5 text-[11px]">
            <div>checked {new Date(sd.checkedAt).toLocaleTimeString()} · {sd.latencyMs != null ? `${sd.latencyMs} ms` : 'no response'}</div>
            {sd.connection === 'online' && <div>version {fmt(pick(sd.system, 'version'))} build {fmt(pick(sd.system, 'build'))} · REST {fmt(pick(sd.system, 'rest_version'))}</div>}
            {sd.error && <div className="text-destructive">{sd.error}</div>}
            {sd.warnings.map((w, i) => <div key={i} className="text-[hsl(30_70%_32%)]">{w}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Settings() {
  const { target, serversError, refetchServers } = useFx();
  const ids = targetIds(target);
  const notes = [
    { icon: KeyRound, t: 'API keys stay server-side', b: `Selected key settings: ${ids.map((id) => id === 'server-a' ? 'LIVE_FX_SERVER_A_KEY' : 'LIVE_FX_SERVER_B_KEY').join(' and ')}. Set these on the backend using the secure key setup. This app never collects or displays keys.` },
    { icon: Network, t: 'Private addresses need a route', b: 'Local addresses like 192.168.x.x or .local hosts are not reachable from a hosted app. Use a secure tunnel or VPN-exposed HTTPS endpoint.' },
    { icon: ShieldCheck, t: 'Version requirement', b: 'The REST API requires Live FX 9.9 build 1205 or later. The version shown is read from the server response only. Docs: github.com/Assimilate-Inc/Assimilate-REST' },
    { icon: ShieldAlert, t: 'Trusted-operator prototype', b: 'There is no sign-in. Add access controls before exposing this desk to an untrusted network.' },
  ];
  return (
    <>
      <PageHeader kicker="Settings" title="Server slots" desc="Configure the selected server slots. Changes are saved only when you click Save; the status check is the connection test." />
      {serversError && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
          Could not load slot settings.
          <Button data-testid="button-retry-servers" size="sm" variant="outline" onClick={refetchServers}>Retry</Button>
        </div>
      )}
      <div className={cn('grid gap-4', ids.length > 1 && 'lg:grid-cols-2')}>
        {ids.map((i) => <SlotForm key={i} id={i} />)}
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {notes.map((n) => (
          <div key={n.t} className="flex gap-3 rounded-md border bg-card/60 p-3">
            <n.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <div className="text-sm font-bold">{n.t}</div>
              <div className="text-xs text-muted-foreground">{n.b}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
