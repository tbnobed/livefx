import type { FxServerRecord } from "@workspace/db";
import { API_CONTRACT_VERSION, upstream } from "./fx-upstream";

type Status = {
  id: string;
  connection: "unconfigured" | "online" | "offline";
  checkedAt: string;
  latencyMs: number | null;
  error: string | null;
  system: Record<string, unknown>;
  application: Record<string, unknown>;
  playmode: Record<string, unknown>;
  warnings: string[];
};
const cache = new Map<string, { expires: number; value: Status }>();
const pending = new Map<string, Promise<Status>>();
export function clearStatus(id: string) {
  for (const key of cache.keys()) if (key.startsWith(`${id}:`)) cache.delete(key);
}

async function readStatus(server: FxServerRecord): Promise<Status> {
  const initial: Status = {
    id: server.id, connection: "unconfigured", checkedAt: new Date().toISOString(),
    latencyMs: null, error: null, system: {}, application: {}, playmode: {}, warnings: [],
  };
  if (!server.baseUrl) return initial;
  const [system, application, playmode] = await Promise.all([
    upstream(server, "GET", "/system"),
    upstream(server, "GET", "/application"),
    upstream(server, "GET", "/application/player/playmode"),
  ]);
  if (!system.ok) return { ...initial, connection: "offline", error: system.error };
  // A plain HTML landing page with HTTP 200 is not a successful API connection.
  if (!system.data.version && !system.data.rest_version && !system.data.system_name) {
    return { ...initial, connection: "offline", error: "The server responded, but not with Assimilate system data. Check its /APIV2 endpoint." };
  }
  const warnings: string[] = [];
  if (!application.ok) warnings.push(`Application state unavailable: ${application.error}`);
  if (!playmode.ok && String(application.data.module).toLowerCase() === "player") warnings.push(`Player state unavailable: ${playmode.error}`);
  if (system.data.rest_version && system.data.rest_version !== API_CONTRACT_VERSION) {
    warnings.push(`Connected API ${String(system.data.rest_version)}; command catalog targets ${API_CONTRACT_VERSION}. Confirm compatibility before sending advanced commands.`);
  }
  return {
    ...initial, connection: "online", latencyMs: system.durationMs,
    checkedAt: new Date().toISOString(), system: system.data,
    application: application.ok ? application.data : {},
    playmode: playmode.ok ? playmode.data : {}, warnings,
  };
}
export async function serverStatus(server: FxServerRecord): Promise<Status> {
  // The configuration forms part of the key, so an in-flight old connection
  // cannot overwrite the status of an edited address.
  const key = `${server.id}:${server.baseUrl}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const active = pending.get(key);
  if (active) return active;
  const task = readStatus(server).then((value) => {
    cache.set(key, { expires: Date.now() + 1500, value });
    return value;
  }).finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
