import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListServers,
  useGetServerStatus,
  getGetServerStatusQueryKey,
  useExecuteCommand,
  getGetActivityQueryKey,
  type FxServer,
  type ServerStatus,
  type CommandResult,
} from '@workspace/api-client-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export type SlotId = 'server-a' | 'server-b';
export type Target = SlotId | 'both';
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export const SLOTS: SlotId[] = ['server-a', 'server-b'];
export const slotLetter = (id: string) => (id === 'server-b' ? 'B' : 'A');
export const slotVar = (id: string) => (id === 'server-b' ? '--slot-b' : '--slot-a');
export const targetIds = (t: Target): SlotId[] => (t === 'both' ? SLOTS : [t]);

export function pick(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  const o = obj as Record<string, unknown>;
  if (key in o) return o[key];
  const d = o.data;
  if (d && typeof d === 'object' && key in (d as object)) return (d as Record<string, unknown>)[key];
  return undefined;
}
export const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const fmt = (v: unknown): string =>
  v === undefined || v === null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
export const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
export const errMsg = (e: unknown): string => {
  if (e && typeof e === 'object') {
    const d = (e as { data?: unknown }).data;
    const m = pick(d, 'error') ?? pick(d, 'message');
    if (typeof m === 'string') return m;
  }
  return e instanceof Error ? e.message : String(e);
};
export const hasData = (o: unknown) => !!o && typeof o === 'object' && Object.keys(o as object).length > 0;

export interface Gate {
  read: boolean;
  write: boolean;
  reason: string;
}
export function gateFor(srv?: FxServer, st?: ServerStatus): Gate {
  if (!srv || !srv.baseUrl) return { read: false, write: false, reason: 'Slot not configured' };
  if (!st) return { read: false, write: false, reason: 'Checking connection' };
  if (st.connection !== 'online') return { read: false, write: false, reason: st.connection === 'offline' ? 'Server offline' : 'Slot not configured' };
  if (!srv.allowControl) return { read: true, write: false, reason: 'Monitoring only — control not armed' };
  return { read: true, write: true, reason: '' };
}

interface StatusInfo {
  data?: ServerStatus;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
}
interface FxCtx {
  servers: FxServer[];
  serversLoading: boolean;
  serversError: boolean;
  refetchServers: () => void;
  server: (id: string) => FxServer | undefined;
  status: (id: string) => StatusInfo;
  gate: (id: string) => Gate;
  label: (id: string) => string;
  target: Target;
  setTarget: (t: Target) => void;
}
const Ctx = createContext<FxCtx | null>(null);

interface ConfirmOpts {
  title: string;
  targets: string[];
  body?: ReactNode;
  action: string;
  tone?: 'danger' | 'arm';
}
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(() => Promise.resolve(false));

export function FxProvider({ children }: { children: ReactNode }) {
  const list = useListServers();
  const a = useGetServerStatus('server-a', { query: { queryKey: getGetServerStatusQueryKey('server-a'), refetchInterval: 3000 } });
  const b = useGetServerStatus('server-b', { query: { queryKey: getGetServerStatusQueryKey('server-b'), refetchInterval: 3000 } });
  const [target, setTargetState] = useState<Target>(() => {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem('lfx-target') : null;
    return v === 'server-b' || v === 'both' ? v : 'server-a';
  });
  const setTarget = (t: Target) => {
    setTargetState(t);
    localStorage.setItem('lfx-target', t);
  };
  const servers = list.data ?? [];
  const server = (id: string) => servers.find((s) => s.id === id);
  const status = (id: string): StatusInfo => {
    const q = id === 'server-b' ? b : a;
    return { data: q.data, isLoading: q.isLoading, isFetching: q.isFetching, isError: q.isError, refetch: () => void q.refetch() };
  };
  const gate = (id: string) => gateFor(server(id), status(id).data);
  const label = (id: string) => `${slotLetter(id)} · ${server(id)?.name || (id === 'server-b' ? 'Server B' : 'Server A')}`;

  const [confirmState, setConfirmState] = useState<(ConfirmOpts & { open: boolean }) | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const confirm = useCallback((o: ConfirmOpts) => {
    setConfirmState({ ...o, open: true });
    return new Promise<boolean>((res) => {
      resolver.current = res;
    });
  }, []);
  const close = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setConfirmState((s) => (s ? { ...s, open: false } : s));
  };

  return (
    <Ctx.Provider
      value={{ servers, serversLoading: list.isLoading, serversError: list.isError, refetchServers: () => void list.refetch(), server, status, gate, label, target, setTarget }}
    >
      <ConfirmCtx.Provider value={confirm}>
        {children}
        <AlertDialog open={!!confirmState?.open} onOpenChange={(o) => !o && close(false)}>
          <AlertDialogContent className="max-w-md border-t-4" style={{ borderTopColor: `hsl(var(${confirmState?.tone === 'arm' ? '--armed' : '--tally'}))` }}>
            <AlertDialogHeader>
              <div className="kicker">Confirm action</div>
              <AlertDialogTitle className="text-xl font-bold tracking-tight">{confirmState?.title}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div>
                    <div className="kicker mb-1.5">Affects</div>
                    <div className="flex flex-wrap gap-1.5">
                      {confirmState?.targets.map((t) => (
                        <span key={t} data-testid="text-confirm-target" className="mono rounded border px-2 py-1 text-xs font-semibold text-foreground bg-secondary">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  {confirmState?.body}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-confirm-cancel" onClick={() => close(false)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                data-testid="button-confirm-ok"
                onClick={() => close(true)}
                className={confirmState?.tone === 'arm' ? 'bg-[hsl(var(--armed))] text-[hsl(222_20%_10%)] hover:bg-[hsl(var(--armed))]/90' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}
              >
                {confirmState?.action}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ConfirmCtx.Provider>
    </Ctx.Provider>
  );
}

export function useFx() {
  const c = useContext(Ctx);
  if (!c) throw new Error('FxProvider missing');
  return c;
}
export const useConfirm = () => useContext(ConfirmCtx);

export interface RunResult {
  id: SlotId;
  result?: CommandResult;
  error?: string;
}
type BodyArg = Record<string, unknown> | undefined | ((id: SlotId) => Record<string, unknown> | undefined);

export function useRunner() {
  const qc = useQueryClient();
  const m = useExecuteCommand();
  const mref = useRef(m.mutateAsync);
  mref.current = m.mutateAsync;
  const [pending, setPending] = useState(false);
  const run = useCallback(
    async (ids: SlotId[], method: Method, path: string, body?: BodyArg, confirmed?: boolean): Promise<RunResult[]> => {
      setPending(true);
      try {
        return await Promise.all(
          ids.map(async (id): Promise<RunResult> => {
            try {
              const b = typeof body === 'function' ? body(id) : body;
              const r = await mref.current({ id, data: { method, path, ...(b ? { body: b } : {}), ...(confirmed ? { confirmed: true } : {}) } });
              return { id, result: r };
            } catch (e) {
              return { id, error: errMsg(e) };
            }
          }),
        );
      } finally {
        setPending(false);
        void qc.invalidateQueries({ queryKey: getGetActivityQueryKey() });
        if (method !== 'GET') ids.forEach((id) => void qc.invalidateQueries({ queryKey: getGetServerStatusQueryKey(id) }));
      }
    },
    [qc],
  );
  return { run, pending };
}

export function useQueryParam(name: string) {
  const [v, setV] = useState<string | null>(null);
  useEffect(() => {
    setV(new URLSearchParams(window.location.search).get(name));
  }, [name]);
  return v;
}
