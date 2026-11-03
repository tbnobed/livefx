import type { FxServerRecord } from "@workspace/db";
import { upstream } from "./fx-upstream";

// This feed deliberately bypasses the 1.5-second full-status cache and never
// reads /system or /application. Concurrent browsers share one upstream GET.
export function createPlayerReader(request: typeof upstream = upstream, now = Date.now) {
  type State = {
    id: string; ok: boolean; checkedAt: string; latencyMs: number | null;
    error: string | null; playmode: Record<string, unknown>;
  };
  const cache = new Map<string, { until: number; value: State }>();
  const pending = new Map<string, Promise<State>>();
  return async (server: FxServerRecord): Promise<State> => {
    const key = `${server.id}:${server.baseUrl}`;
    const cached = cache.get(key);
    if (cached && cached.until > now()) return cached.value;
    const active = pending.get(key);
    if (active) return active;
    const task = (async (): Promise<State> => {
      const base: State = {
        id: server.id, ok: false, checkedAt: new Date(now()).toISOString(),
        latencyMs: null, error: "Server is not configured.", playmode: {},
      };
      if (!server.baseUrl) return base;
      try {
        const result = await request(server, "GET", "/application/player/playmode");
        const frame = result.data.frame;
        const validFrame = (typeof frame === "number" || (typeof frame === "string" && frame.trim() !== "")) && Number.isFinite(Number(frame));
        const valid = result.ok && typeof result.data.mode === "string" && !!result.data.mode.trim() && validFrame;
        return {
          ...base, ok: valid, checkedAt: new Date(now()).toISOString(),
          latencyMs: result.durationMs, playmode: valid ? result.data : {},
          error: valid ? null : result.error || "Player telemetry unavailable. Enter a timeline in the player.",
        };
      } catch {
        return { ...base, checkedAt: new Date(now()).toISOString(), error: "Could not read player telemetry." };
      }
    })().then((value) => {
      // Bound stale configurations as well as request rate. Failed reads are
      // briefly cached too, preventing many browsers hammering a failed server.
      for (const [other, entry] of cache) if (entry.until <= now()) cache.delete(other);
      cache.set(key, { until: now() + (value.ok ? 250 : 1000), value });
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  };
}

export const serverPlayer = createPlayerReader();
