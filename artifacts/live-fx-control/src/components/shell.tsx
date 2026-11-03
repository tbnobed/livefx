import { type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Activity, Clapperboard, FolderTree, Palette, Settings2, Terminal, Film } from 'lucide-react';
import { cn } from '@/lib/utils';
import { targetIds, useFx } from '@/lib/fx';
import { ConnPill, SlotBadge, TargetSwitch } from '@/components/fx-ui';

const NAV = [
  { href: '/', label: 'Overview', icon: Clapperboard },
  { href: '/projects', label: 'Projects', icon: FolderTree },
  { href: '/grading', label: 'Grading', icon: Palette },
  { href: '/render', label: 'Render', icon: Film },
  { href: '/commands', label: 'Commands', icon: Terminal },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/settings', label: 'Settings', icon: Settings2 },
];

export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const { server, status, target, setTarget } = useFx();
  return (
    <div className="flex min-h-[100dvh] flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-[100dvh] md:w-60">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <img src={`${import.meta.env.BASE_URL}branding/assimilate-logo.png`} alt="Assimilate" width={44} height={44} className="h-11 w-11 shrink-0 object-contain" data-testid="img-assimilate-logo" />
          <div>
            <div className="text-sm font-extrabold tracking-tight text-sidebar-accent-foreground">Live FX Control</div>
            <div className="mono text-[10px] uppercase tracking-widest text-sidebar-foreground/50">2 slot operator desk</div>
          </div>
        </div>
        <nav className="flex gap-0.5 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
          {NAV.map((n) => {
            const active = n.href === '/' ? loc === '/' : loc.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                data-testid={`link-nav-${n.label.toLowerCase()}`}
                className={cn(
                  'relative flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                )}
              >
                {active && <span className="absolute left-0 top-2 bottom-2 hidden w-0.5 rounded bg-sidebar-primary md:block" />}
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto hidden space-y-2 border-t border-sidebar-border p-3 md:block">
          <div className="mono text-[10px] uppercase tracking-widest text-sidebar-foreground/45">Slots</div>
          {targetIds(target).map((id) => {
            const s = server(id);
            const st = status(id).data;
            return (
              <Link key={id} href="/settings" data-testid={`link-slot-${id}`} className="flex items-center gap-2 rounded-md bg-sidebar-accent/50 px-2 py-1.5 hover:bg-sidebar-accent">
                <SlotBadge id={id} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-sidebar-accent-foreground">{s?.name || `Server ${id === 'server-b' ? 'B' : 'A'}`}</div>
                  <div className="mono truncate text-[10px] text-sidebar-foreground/50">
                    {st?.connection === 'online' && st.latencyMs != null ? `${st.latencyMs} ms` : s?.baseUrl || 'no base URL'}
                  </div>
                </div>
                <ConnPill id={id} />
              </Link>
            );
          })}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b bg-background/90 px-4 py-2.5 backdrop-blur md:px-8">
          <span className="kicker">Operating on</span>
          <TargetSwitch value={target} onChange={setTarget} testid="global-target" />
          <span className="ml-auto hidden text-xs text-muted-foreground lg:block">Both = two independent requests. Never frame-synced.</span>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
