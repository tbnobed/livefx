import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { FxProvider, useFx } from '@/lib/fx';
import { Shell } from '@/components/shell';
import Overview from '@/pages/overview';
import Projects from '@/pages/projects';
import Grading from '@/pages/grading';
import Render from '@/pages/render';
import Commands from '@/pages/commands';
import ActivityPage from '@/pages/activity';
import Settings from '@/pages/settings';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function Router() {
  const { target } = useFx();
  return (
    <Shell>
      <RoutedErrorBoundary>
        {/* Never carry a previous target's command draft/results into a new scope.
            Unmounting also stops its snapshot polling. */}
        <Switch key={target}>
          <Route path="/" component={Overview} />
          <Route path="/projects" component={Projects} />
          <Route path="/grading" component={Grading} />
          <Route path="/render" component={Render} />
          <Route path="/commands" component={Commands} />
          <Route path="/activity" component={ActivityPage} />
          <Route path="/settings" component={Settings} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Shell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <FxProvider>
            <Router />
          </FxProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
