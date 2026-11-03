import { Router, type IRouter } from "express";
import { db, fxServers, fxActivity, type FxServerRecord } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  ConfigureServerBody, ConfigureServerParams, ConfigureServerResponse,
  ExecuteCommandBody, ExecuteCommandParams, ExecuteCommandResponse,
  GetServerStatusParams, GetServerStatusResponse,
  CaptureServerSnapshotResponse,
  ListServersResponse, GetActivityResponse, GetCommandCatalogResponse,
} from "@workspace/api-zod";
import { catalog, keyConfigured, matchOperation, normalizeBaseUrl, upstream } from "../lib/fx-upstream";
import { clearStatus, serverStatus } from "../lib/fx-status";
import { clearSnapshots, serverSnapshot } from "../lib/fx-snapshot";

const router: IRouter = Router();
const busy = new Set<string>();
const lastCommand = new Map<string, number>();
function publicServer(server: FxServerRecord) {
  return { ...server, keyConfigured: keyConfigured(server.id) };
}
async function getServer(id: string) {
  if (!["server-a", "server-b"].includes(id)) return undefined;
  return (await db.select().from(fxServers).where(eq(fxServers.id, id)))[0];
}

// These routes are a trusted-operator tool, not a public anonymous API.
// Reject cross-origin writes. User access control is required before public use.
router.use("/fx", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    const host = req.get("x-forwarded-host")?.split(",")[0].trim() || req.get("host");
    if (origin) {
      try {
        if (new URL(origin).host !== host) {
          res.status(403).json({ error: "Cross-origin control requests are not allowed." });
          return;
        }
      } catch {
        res.status(403).json({ error: "Invalid request origin." }); return;
      }
    }
  }
  next();
});

router.get("/fx/servers", async (_req, res): Promise<void> => {
  let servers = await db.select().from(fxServers).orderBy(fxServers.id);
  if (servers.length < 2) {
    // Empty connection slots are product defaults, not fictitious hardware data.
    // Initialize them in a new deployment too, without startup schema changes.
    await db.insert(fxServers).values([
      { id: "server-a", name: "Live FX — Server A", role: "Primary" },
      { id: "server-b", name: "Live FX — Server B", role: "Secondary" },
    ]).onConflictDoNothing();
    servers = await db.select().from(fxServers).orderBy(fxServers.id);
  }
  res.json(ListServersResponse.parse(servers.map(publicServer)));
});

router.put("/fx/servers/:id", async (req, res): Promise<void> => {
  const params = ConfigureServerParams.safeParse(req.params);
  const body = ConfigureServerBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Provide a server name, role, base URL, and control permission." }); return;
  }
  const server = await getServer(params.data.id);
  if (!server) { res.status(404).json({ error: "Server slot not found." }); return; }
  if (busy.has(server.id)) { res.status(409).json({ error: "A command is running. Wait before changing its connection." }); return; }
  busy.add(server.id);
  try {
    let baseUrl: string;
    try { baseUrl = normalizeBaseUrl(body.data.baseUrl); }
    catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Invalid URL" }); return; }
    const name = body.data.name.trim();
    if (!name) { res.status(400).json({ error: "A server name is required." }); return; }
    const allowControl = Boolean(baseUrl) && body.data.allowControl;
    const [updated] = await db.transaction(async (tx) => {
      const rows = await tx.update(fxServers)
        .set({ name, role: body.data.role.trim(), baseUrl, allowControl })
        .where(eq(fxServers.id, server.id)).returning();
      await tx.insert(fxActivity).values({
        serverId: server.id, serverName: name, action: "Connection settings updated", ok: true,
        detail: !baseUrl ? "Server disconnected." : allowControl ? "Remote control enabled by operator." : "Read-only monitoring enabled.",
      });
      return rows;
    });
    clearStatus(server.id);
    clearSnapshots(server.id);
    res.json(ConfigureServerResponse.parse(publicServer(updated)));
  } finally { busy.delete(server.id); }
});

router.get("/fx/servers/:id/status", async (req, res): Promise<void> => {
  const params = GetServerStatusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid server." }); return; }
  const server = await getServer(params.data.id);
  if (!server) { res.status(404).json({ error: "Server slot not found." }); return; }
  res.json(GetServerStatusResponse.parse(await serverStatus(server)));
});

router.get("/fx/catalog", (_req, res) => {
  res.json(GetCommandCatalogResponse.parse(catalog));
});

router.get("/fx/activity", async (_req, res): Promise<void> => {
  const entries = await db.select().from(fxActivity).orderBy(desc(fxActivity.id)).limit(150);
  res.json(GetActivityResponse.parse(entries.map((item) => ({ ...item, timestamp: item.timestamp.toISOString() }))));
});

router.post("/fx/servers/:id/snapshot", async (req, res): Promise<void> => {
  const params = GetServerStatusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid server." }); return; }
  const server = await getServer(params.data.id);
  if (!server) { res.status(404).json({ error: "Server slot not found." }); return; }
  if (busy.has(server.id)) { res.status(409).json({ error: "A control command is running. Retry the snapshot afterward." }); return; }
  // Explicitly requested image-only monitoring, available even when controls
  // are disarmed. Never route arbitrary POSTs through this exception.
  res.json(CaptureServerSnapshotResponse.parse(await serverSnapshot(server)));
});

router.post("/fx/servers/:id/command", async (req, res): Promise<void> => {
  const params = ExecuteCommandParams.safeParse(req.params);
  const body = ExecuteCommandBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Provide a valid HTTP method, documented API path, and optional JSON object body." }); return;
  }
  const server = await getServer(params.data.id);
  if (!server) { res.status(404).json({ error: "Server slot not found." }); return; }
  if (!server.baseUrl) { res.status(409).json({ error: "Configure this server's address first." }); return; }
  const input = body.data;
  const operation = matchOperation(input.method, input.path);
  if (!operation) { res.status(400).json({ error: "This method/path is not in the official Assimilate REST API catalog. Fill in all path parameters." }); return; }
  const write = input.method !== "GET";
  if (write && !server.allowControl) {
    res.status(403).json({ error: "This server is read-only. Enable remote control in connection settings." }); return;
  }
  // Ordinary transport remains one-click. Recording and all other mutations
  // require a separate confirmation. JSON editors cannot bypass that requirement.
  const transportKeys = new Set(["mode", "frame", "loop", "audio", "speed", "mark_in", "mark_out", "range"]);
  const safeTransport = input.method === "PUT" && input.path === "/application/player/playmode" &&
    input.body && Object.keys(input.body).every((key) => transportKeys.has(key)) &&
    (input.body.mode === undefined || ["PAUSE", "PLAY_FRW", "PLAY_REV"].includes(String(input.body.mode)));
  if (write && !safeTransport && !input.confirmed) {
    res.status(400).json({ error: "Confirm this command and its target before sending it.", confirmationRequired: true }); return;
  }
  if (operation.bodyRequired && write && !input.body) {
    res.status(400).json({ error: "This operation requires a JSON request body. Refer to its schema in the command browser." }); return;
  }
  if (write && busy.has(server.id)) { res.status(409).json({ error: "A command is already in progress for this server. Wait for its result." }); return; }
  if (write && Date.now() - (lastCommand.get(server.id) || 0) < 100) {
    res.status(429).json({ error: "Commands are arriving too quickly. Please wait briefly." }); return;
  }
  if (write) {
    busy.add(server.id);
    lastCommand.set(server.id, Date.now());
  }
  try {
    // Write the audit intent before dispatch. A DB failure must not produce
    // an unaudited command against live equipment.
    const [entry] = await db.insert(fxActivity).values({
      serverId: server.id, serverName: server.name,
      action: `${input.method} ${operation.path}`,
      ok: false, detail: "Dispatched; waiting for server confirmation.",
    }).returning();
    const result = await upstream(server, input.method, input.path, input.body);
    await db.update(fxActivity).set({
      ok: result.ok,
      detail: result.ok ? `Live FX confirmed HTTP ${result.status} · ${result.durationMs} ms`
        : (result.error || "Command failed").slice(0, 1000),
    }).where(eq(fxActivity.id, entry.id));
    clearStatus(server.id);
    res.json(ExecuteCommandResponse.parse(result));
  } finally { if (write) busy.delete(server.id); }
});

export default router;
