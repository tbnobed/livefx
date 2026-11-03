# Live FX Control

A two-server operator control center using the official Assimilate REST API.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `node scripts/src/build-fx-catalog.mjs /path/to/assimilate_rest_api.yaml` — regenerate the command browser from the upstream MIT-licensed contract
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/live-fx-control/` — operator web app, mounted at `/`
- `artifacts/api-server/src/routes/fx.ts` — configuration, status, commands, catalog, audit
- `artifacts/api-server/src/lib/fx-upstream.ts` — HTTP adapter, URL restrictions, official operation matching
- `artifacts/api-server/src/data/assimilate-catalog.json` — generated operation catalog, official REST contract 1.1.1
- `lib/api-spec/openapi.yaml` — control-center API contract; regenerate clients after editing
- `lib/db/src/schema/fx.ts` — persisted server settings and command history

## Architecture decisions

- The upstream API is `http(s)://server:port/APIV2`. Source: https://github.com/Assimilate-Inc/Assimilate-REST. The upstream README and YAML currently report different API versions; use the catalog's actual 1.1.1 target and surface the connected server's version.
- Default connection slots are deliberately blank and read-only. Never use fictitious live telemetry or simulated command success for production equipment.
- Dual-target actions are independent requests, not frame-accurate synchronization, failover, or transactional operations.
- Hosted servers cannot inherently reach a studio LAN. Provide a secure network route or run the control center in a reachable environment. Do not instruct users to expose unauthenticated hardware ports.
- This initial build is a trusted-operator prototype, without user authentication. Add operator authentication and permissions before publishing or allowing untrusted access.

## Product

Dual-server monitoring, playback/record controls, project and timeline exploration, shot grading and controls, render queue operations, a browser of all 149 documented API operations, connection settings, and persistent operator activity history.

## User preferences

The requested product controls two existing Assimilate Live FX servers using the official API, not a simulated dashboard.

## Gotchas

- The user requires self-hosting under Windows WSL2 via Docker. Keep the local deployment independent of Replit services. See `deploy/docker/README.md`; start with `bash scripts/docker-start.sh`. Its default localhost-only binding is intentional until operator authentication is implemented.

- Assimilate REST is available from Product Suite v9.9 build 1205. Enable its HTTP server in System Settings.
- If the hardware uses optional access keys, configure `LIVE_FX_SERVER_A_KEY` and `LIVE_FX_SERVER_B_KEY` using Replit Secrets. The backend sends the raw value in `Authorization`, not a Bearer token. Never put keys in URLs, forms, logs, or the browser.
- Status checks use read-only endpoints. Non-transport writes need explicit confirmation; remote control must also be armed per server.
- A timed-out mutation may have reached the hardware. Inspect server state before retrying; never automatically retry recording/render/project mutations.
- Public DNS resolving to localhost, link-local or metadata endpoints is rejected. HTTP redirects are not followed, and requests time out.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
