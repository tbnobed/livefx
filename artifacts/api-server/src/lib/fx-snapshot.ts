import type { FxServerRecord } from "@workspace/db";
import { upstream } from "./fx-upstream";

export type SnapshotResult = {
  ok: boolean;
  image: string | null;
  capturedAt: string | null;
  shotUuid: string | null;
  frame: number | null;
  error: string | null;
};

const empty = (error: string): SnapshotResult => ({
  ok: false, image: null, capturedAt: null, shotUuid: null, frame: null, error,
});
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Injectable transport permits contract tests without touching studio equipment.
export async function captureSnapshot(
  server: FxServerRecord,
  request: typeof upstream = upstream,
): Promise<SnapshotResult> {
  if (!server.baseUrl) return empty("Configure this server first.");
  const player = await request(server, "GET", "/application/player/playmode");
  if (!player.ok) return empty(`Player state unavailable: ${player.error}`);
  const uuid = player.data.shot_uuid;
  const frame = player.data.shot_frame;
  if (typeof uuid !== "string" || !uuidPattern.test(uuid) ||
      typeof frame !== "number" || !Number.isInteger(frame) || frame < 0) {
    return empty("No current shot/frame is available. Open a timeline in the Live FX player, then retry.");
  }
  // Fixed, narrow request: no file path, no caller-supplied commands, no state
  // changes. Do not use timeline frame as a substitute for shot-local frame.
  const result = await request(server, "POST", "/application/tools/image", {
    uuid, frame, proxy: true, mime_type: "image/jpeg",
  });
  if (!result.ok) {
    return empty(`Snapshot capture failed: ${result.error} Your server must support /application/tools/image with an image response (catalog targets REST 1.1.1).`);
  }
  const image = result.data.image;
  if (typeof image !== "string" || !/^data:image\/(jpeg|png);base64,/.test(image)) {
    return empty("Live FX did not return JPEG/PNG image data. This server version may not support direct snapshot responses. No file was requested; playback was not changed.");
  }
  const bytes = Buffer.from(image.slice(image.indexOf(",") + 1), "base64");
  const jpeg = image.startsWith("data:image/jpeg;") && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = image.startsWith("data:image/png;") && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!jpeg && !png) return empty("The server returned invalid image data. Retry manually after checking Live FX.");
  return { ok: true, image, capturedAt: new Date().toISOString(), shotUuid: uuid, frame, error: null };
}

const cache = new Map<string, { until: number; result: SnapshotResult }>();
const pending = new Map<string, Promise<SnapshotResult>>();

export function clearSnapshots(id: string) {
  for (const key of cache.keys()) if (key.startsWith(`${id}:`)) cache.delete(key);
}

export async function serverSnapshot(server: FxServerRecord): Promise<SnapshotResult> {
  const key = `${server.id}:${server.baseUrl}`;
  const cached = cache.get(key);
  if (cached && cached.until > Date.now()) return cached.result;
  const active = pending.get(key);
  if (active) return active;
  const task = captureSnapshot(server).then((result) => {
    // Bound work across multiple operator browsers; failures also back off.
    cache.set(key, { until: Date.now() + 5000, result });
    return result;
  }).finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
