import { useEffect, useState } from 'react';
import { getServerPlayerState } from '@workspace/api-client-react';
import { useQuery } from '@tanstack/react-query';
import { useFx, type SlotId } from './fx';

export function useLivePlayer(id: SlotId) {
  const { server, status } = useFx();
  const [visible, setVisible] = useState(!document.hidden);
  const [now, setNow] = useState(Date.now);
  const online = status(id).data?.connection === 'online';
  useEffect(() => {
    const update = () => { setVisible(!document.hidden); setNow(Date.now()); };
    document.addEventListener('visibilitychange', update);
    const timer = window.setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 250);
    return () => { document.removeEventListener('visibilitychange', update); window.clearInterval(timer); };
  }, []);
  const enabled = online && visible;
  const query = useQuery({
    queryKey: ['live-player', id, server(id)?.baseUrl],
    queryFn: ({ signal }) => getServerPlayerState(id, { signal }),
    enabled,
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    refetchInterval: (q) => q.state.error || q.state.data?.ok === false ? 1000 : 250,
  });
  // Use browser receipt time, not remote clock time, to detect stalled reads.
  const fresh = Boolean(enabled && query.data?.ok && !query.isError && now - query.dataUpdatedAt < 1500);
  return {
    fresh,
    playmode: fresh ? query.data?.playmode : undefined,
    error: query.error?.message || query.data?.error,
    state: !online ? 'Not connected' : !visible ? 'Updates paused' : fresh ? 'Live · 250 ms' : query.isError || query.data?.ok === false ? 'Player unavailable' : query.data ? 'Stale · reconnecting' : 'Connecting…',
  };
}
