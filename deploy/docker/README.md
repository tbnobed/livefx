# Run Live FX Control on Windows with WSL2 and Docker

This runs the control center locally; the Assimilate Live FX software stays on
your existing servers. No Replit runtime or cloud database is needed.

## Requirements

- Windows with WSL2 and an Ubuntu distribution.
- Docker Desktop using **Linux containers**, the **WSL2 engine**, and WSL
  integration enabled for your distribution.
- An x86-64 Windows machine. The current workspace lockfile excludes other
  platforms' native build packages; these images intentionally target amd64.
- Docker Compose v2 with `--wait` support, Git, and the `openssl` command in WSL.
- Network access from Docker to both Assimilate HTTP API ports.

## Start

Download or clone this project's source into your WSL Linux filesystem
(for example, `~/live-fx-control`, rather than `/mnt/c/...`), open a WSL terminal
in the project directory, and run:

```bash
bash scripts/docker-start.sh
```

The first run downloads images, builds the production frontend/API, generates a
random database password in a private `.env` file, initializes the schema, and
starts everything. Later runs retain the password and all database data.

Open **http://localhost:8088** in your Windows browser.

The services are:

| Service | Purpose | Published port |
| --- | --- | --- |
| `web` | Nginx production static server and same-origin API proxy | localhost:8088 |
| `api` | Live FX HTTP bridge, safety gates, settings, audit history | None |
| `db` | PostgreSQL 17 with a persistent named volume | None |
| `migrate` | One-shot additive database bootstrap | None |

The API runs as a non-root user. Keys are only supplied to the API at runtime,
not built into the browser bundle or images. `.env` is excluded from Git and the
Docker build context. Do not commit it, share it, or run `docker compose config`
into a public log: resolved configuration can contain credentials.

## Connect both Live FX servers

In Assimilate, enable the HTTP server in System Settings. REST requires a
supported Product Suite version (v9.9 build 1205 or later). Then open the control
center's **Settings** page and enter each server's URL:

| Where Live FX runs | Example URL entered in Settings |
| --- | --- |
| Separate studio PC | `http://192.168.1.101:8080/APIV2` |
| Second studio PC | `http://192.168.1.102:8080/APIV2` |
| This Windows host, Docker Desktop | `http://host.docker.internal:8080/APIV2` |

Examples are not preconfigured. Use the actual configured API ports.
`localhost` inside the API container is the container itself, **not Windows**;
loopback URLs are intentionally blocked. Two Live FX instances on the same host
need distinct API ports.

Use the connection test first. Both slots start disarmed; arm remote control
only when it is safe to control that machine. There is no frame-synchronous
two-server guarantee.

### Optional API access keys

If Assimilate requires access keys, run this **in your local WSL terminal**:

```bash
bash scripts/docker-keys.sh
```

It prompts with hidden input for both keys, saves them locally, and restarts only
the API service. Empty input removes that server's key. Do not paste keys into
chat, URLs, or the browser. The bridge sends the raw key as `Authorization`,
as required by Assimilate.

## Networking and firewall

- On each server, allow its configured Assimilate HTTP port through Windows
  Firewall for the trusted studio network. The HTTP listener must accept
  connections from outside its own loopback interface.
- Docker Desktop normally provides `host.docker.internal`. The Compose file also
  adds a host-gateway mapping for Linux Docker environments. With a Docker Engine
  installed directly inside WSL rather than Docker Desktop, this gateway may be
  WSL instead of Windows: use the reachable Windows/studio LAN address instead.
- VPNs, endpoint security, VLANs, and WSL NAT can block these connections. A
  working browser connection on Windows does not prove the container can connect.
- Inspect the network path **from the API container** without sending control
  commands:

```bash
docker compose exec api node -e \
  "fetch('http://host.docker.internal:8080/APIV2/system',{signal:AbortSignal.timeout(6000)}).then(async r=>console.log(r.status,await r.text())).catch(e=>{console.error(e.message);process.exit(1)})"
```

Replace only the example address with the server's actual address. A 401/403
means the API is reachable but needs an access key. Do not add keys to this
command; use the hidden-input script and the app's connection test instead.
Never forward these unauthenticated control ports to the public internet.

## Normal operation

### Server tabs

The top Server A / Server B / Both tabs scope every page, not just commands.
Single-server tabs show only that server's preview, timeline, projects, grading,
render queue, command results, settings, and activity. Both shows both servers,
with separate project and grading editors. Switching scope clears page-local
unsaved drafts/results and stops previews from the previous scope, preventing
an old shot UUID or command draft from carrying into another server.

### Snapshot previews

On Overview, each connected server has **Capture now** and opt-in **Auto
refresh** with 5-, 10-, or 30-second intervals (default 10). These are current
shot proxy stills, not a live stream or guaranteed program-output capture.
An open player timeline with a valid current shot and shot-local frame is
required. Capture does not change playback and does not require armed controls.

Images remain transient: they are not saved in the database, activity history,
or on the Live FX server by this request. Requests from multiple browsers are
coalesced/cached for five seconds per server to limit processing load.
Automatic refresh pauses when the tab is hidden, stops after an error, and is
off after a page reload. The timestamp always refers to the captured still;
an older retained image is labeled stale when the next capture fails.

The documented `/application/tools/image` endpoint must support a direct
JPEG/PNG response. Older REST versions, including 1.0.5, are not verified here.
An unsupported endpoint or non-image response displays an error rather than
pretending video is available. Try one manual capture first and check server
load before enabling frequent refresh.

From the project directory:

```bash
# Status and recent logs (avoid sharing sensitive server responses)
docker compose ps
docker compose logs --tail=100 api web

# Stop; settings/history remain in the named volume
docker compose down

# Start again, or rebuild after downloading updated source
bash scripts/docker-start.sh
```

Do **not** use `docker compose down --volumes` unless you intend to delete the
database, including saved connections and activity history. Keep `.env` with the
deployment: replacing its password does not change an existing database's password.

### Backup and restore

Store backups privately; they contain server addresses and activity history.
Create a backup before updating:

```bash
mkdir -p backups
docker compose exec -T db pg_dump -U live_fx -d live_fx -Fc \
  > "backups/live-fx-$(date +%Y%m%d-%H%M%S).dump"
```

To verify restoration without touching the active database, create a **separate,
empty database** inside the database service and restore the complete backup:

```bash
docker compose exec -T db createdb -U live_fx live_fx_restore
docker compose exec -T db pg_restore -U live_fx -d live_fx \
  --list < backups/YOUR_BACKUP.dump
docker compose exec -T db pg_restore -U live_fx -d live_fx_restore \
  --no-owner --no-privileges --exit-on-error < backups/YOUR_BACKUP.dump
```

The active application still uses `live_fx`; this procedure only tests a restore
into `live_fx_restore`. It deliberately fails if that database already exists.
An actual recovery/switchover needs a planned maintenance window and the API
stopped to prevent concurrent writes. Never restore into a populated database or
delete the existing volume as a shortcut. Test backups before relying on them.

The current SQL bootstrap only creates absent tables. Future schema changes need
reviewed migrations; rebuilding does not silently alter/drop existing columns.

## Security scope

This is currently a **trusted local operator tool, without user authentication**.
The published port binds only to `127.0.0.1` on the Docker host. Leave that default
in place unless intentionally enabling the trusted-LAN mode below. Local
processes and users can still access it. Add authentication, authorization, and
TLS before providing access to untrusted users. Never expose it publicly.

## LAN access from other computers (Docker Engine inside WSL2)

Anyone who can access this app can operate its controls. Use this only on a
trusted studio LAN. No router port forwarding or public access is needed.

These steps target WSL2's default **NAT** networking. Mirrored networking has
different routing and Hyper-V firewall requirements; do not change networking
modes or disable firewalls as a workaround.

1. In Ubuntu, from this project's root, start with the explicit LAN option:

   ```bash
   bash scripts/docker-start.sh --lan
   ```

   This binds only the web service to all Ubuntu IPv4 interfaces. Database and
   API services still have no published ports. Use `--lan` on subsequent starts;
   starting without it restores the default loopback binding. Keep `.env` and
   the named database volume; no data reset is necessary.

2. From the same Ubuntu project directory, run:

   ```bash
   explorer.exe .
   ```

   Copy that folder's Windows/UNC path from File Explorer's address bar.

3. Open **Windows PowerShell as Administrator**, change to that folder, and
   run the included forwarding helper (replace the example folder path):

   ```powershell
   Set-Location "\\wsl.localhost\Ubuntu\home\YOUR_LINUX_USER\live-fx-control"
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows-lan.ps1 -Distribution Ubuntu
   ```

   `Bypass` applies only to this invocation, not the machine's execution policy.
   The script verifies Windows can reach the WSL service, forwards Windows TCP
   8088 to Ubuntu, and allows incoming TCP 8088 **only on Private network
   profiles, from the local subnet**. It will not replace an unrelated forwarding
   rule. Use the distribution name from `wsl --list --verbose` if not `Ubuntu`.
   To use a custom app port, supply `-Port` with the same port.

4. Make sure your trusted studio Ethernet/Wi-Fi connection is marked **Private**
   in Windows Settings. Do not mark a public/untrusted network Private.

5. Run `ipconfig` in Windows. Find the **Windows Ethernet/Wi-Fi LAN IPv4 address**,
   not the WSL/Docker virtual-adapter address. From another LAN machine, open:

   ```text
   http://192.168.1.50:8088
   ```

   Replace the example address with that Windows LAN address. Do not use
   `localhost` on the remote machine.

WSL's address can change after a restart or `wsl --shutdown`; rerun the Windows
helper to refresh forwarding. Docker/WSL must remain running. Guest Wi-Fi client
isolation and other VLANs may block access; the default rule allows only the
local subnet, not every routed studio subnet.

To disable LAN access, run the same Windows helper with `-Disable` from an
administrator PowerShell, then start without `--lan` in Ubuntu:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows-lan.ps1 -Distribution Ubuntu -Disable
```

```bash
bash scripts/docker-start.sh
```

## Verification scope

The production builds and deployment configuration can be checked in the
development workspace. Docker Desktop/WSL networking and actual Live FX commands
must be verified on the target Windows machine; this workspace cannot run Docker
containers.
