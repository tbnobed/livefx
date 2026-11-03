import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { FxServerRecord } from "@workspace/db";
import catalog from "../data/assimilate-catalog.json";

export { catalog };
export const API_CONTRACT_VERSION = "1.1.1";
const TIMEOUT_MS = 6000;
const RESPONSE_LIMIT = 4 * 1024 * 1024;
export type JsonObject = Record<string, unknown>;
export type UpstreamResult = {
  ok: boolean;
  status: number;
  durationMs: number;
  data: JsonObject;
  error: string | null;
};

export function keyConfigured(id: string): boolean {
  return Boolean(process.env[id === "server-a" ? "LIVE_FX_SERVER_A_KEY" : "LIVE_FX_SERVER_B_KEY"]);
}

export function normalizeBaseUrl(raw: string): string {
  if (!raw.trim()) return "";
  const url = new URL(raw.trim());
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Use an HTTP or HTTPS URL.");
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Do not put passwords, API keys, query strings, or fragments in the server URL.");
  }
  const pathname = url.pathname.replace(/\/+$/, "");
  if (pathname && pathname.toUpperCase() !== "/APIV2") {
    throw new Error("Enter the server origin, optionally ending in /APIV2.");
  }
  if (forbiddenHost(url.hostname)) throw new Error("Localhost, link-local, and cloud metadata addresses cannot be used. Enter your reachable Live FX server address.");
  url.pathname = "/APIV2";
  return url.toString().replace(/\/$/, "");
}

function forbiddenHost(raw: string): boolean {
  const host = raw.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "metadata.google.internal") return true;
  if (isIP(host) === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 0 || a === 127 || (a === 169 && b === 254) ||
      a >= 224 || host === "100.100.100.200";
  }
  if (isIP(host) === 6) {
    // IPv4-mapped IPv6 is rejected rather than risking alternate metadata encodings.
    return host === "::" || host === "::1" || host.startsWith("fe8") ||
      host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb") ||
      host.startsWith("ff") || host.includes("ffff:");
  }
  return false;
}

export function matchOperation(method: string, rawPath: string) {
  if (!rawPath.startsWith("/") || rawPath.startsWith("//") || /[\\\r\n#]/.test(rawPath)) return undefined;
  const pathname = rawPath.split("?")[0];
  try {
    if (decodeURIComponent(pathname).split("/").some((segment) => segment === ".." || segment === ".")) return undefined;
  } catch { return undefined; }
  return catalog.find((operation) => {
    if (operation.method !== method) return false;
    const pattern = operation.path.split("/").map((segment) =>
      /^\{[^}]+\}$/.test(segment) ? "[^/{}]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ).join("/");
    return new RegExp(`^${pattern}$`).test(pathname);
  });
}

function asObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonObject;
  return { value };
}

function describeError(data: JsonObject, status: number): string {
  if (status === 403 || status === 401) return "Access denied by Live FX. Check the server's access key and the matching backend secret.";
  const error = data.error;
  let detail = typeof error === "string" ? error
    : error && typeof error === "object" ? JSON.stringify(error)
    : typeof data.message === "string" ? data.message : `Live FX returned HTTP ${status}.`;
  return detail.slice(0, 1000);
}

export async function upstream(
  server: FxServerRecord,
  method: string,
  path: string,
  body?: JsonObject,
): Promise<UpstreamResult> {
  const started = Date.now();
  const failed = (message: string): UpstreamResult => ({
    ok: false, status: 0, durationMs: Date.now() - started, data: {}, error: message,
  });
  if (!server.baseUrl) return failed("This server is not configured.");
  const base = normalizeBaseUrl(server.baseUrl);
  const url = new URL(base + path);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  try {
    // DNS is validated and pinned per request; HTTP redirects are never followed.
    // Studio RFC1918 addresses are allowed deliberately. Loopback/metadata are not.
    const addresses = await Promise.race([
      lookup(host, { all: true }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("DNS lookup timed out.")), TIMEOUT_MS).unref()),
    ]);
    if (!addresses.length || addresses.some((item) => forbiddenHost(item.address))) {
      return failed("Server address resolves to a blocked local or metadata address.");
    }
    const selected = addresses.find((item) => item.family === 4) || addresses[0];
    const secret = process.env[server.id === "server-a" ? "LIVE_FX_SERVER_A_KEY" : "LIVE_FX_SERVER_B_KEY"];
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const result = await new Promise<{ status: number; contentType: string; bytes: Buffer }>((resolve, reject) => {
      const request = (url.protocol === "https:" ? https : http).request(url, {
        method,
        agent: false,
        lookup: ((_hostname: string, options: unknown, callback: (err: Error | null, address: unknown, family?: number) => void) => {
          if (typeof options === "object" && options !== null && "all" in options && options.all) {
            callback(null, [selected]);
          } else callback(null, selected.address, selected.family);
        }) as http.RequestOptions["lookup"],
        headers: {
          Accept: "application/json, image/jpeg",
          ...(secret ? { Authorization: secret } : {}),
          ...(payload !== undefined ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      }, (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > RESPONSE_LIMIT) {
            response.destroy(new Error("Live FX response exceeded the 4 MB limit."));
            request.destroy(new Error("Live FX response exceeded the 4 MB limit."));
          } else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => resolve({
          status: response.statusCode || 502,
          contentType: response.headers["content-type"] || "",
          bytes: Buffer.concat(chunks),
        }));
      });
      const timer = setTimeout(() => request.destroy(new Error("Live FX did not respond within 6 seconds.")), TIMEOUT_MS);
      request.on("close", () => clearTimeout(timer));
      request.on("error", reject);
      if (payload !== undefined) request.write(payload);
      request.end();
    });
    let data: JsonObject = {};
    if (result.bytes.length) {
      if (result.contentType.startsWith("image/")) {
        data = { contentType: result.contentType, image: `data:${result.contentType};base64,${result.bytes.toString("base64")}` };
      } else {
        const text = result.bytes.toString("utf8");
        try { data = asObject(JSON.parse(text)); }
        catch { data = { text: text.slice(0, 20000) }; }
      }
    }
    const httpOk = result.status >= 200 && result.status < 300;
    const applicationError = Boolean(data.error);
    const ok = httpOk && !applicationError;
    const error = ok ? null : result.status >= 300 && result.status < 400
      ? "Live FX redirected the request. Enter its direct API address; redirects are not followed."
      : describeError(data, result.status);
    return { ok, status: result.status, durationMs: Date.now() - started, data, error };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed.";
    return failed(`${message}${method !== "GET" ? " No confirmed response: the command may have been applied. Check the server before retrying." : " Verify the address and secure network route to your studio."}`);
  }
}
