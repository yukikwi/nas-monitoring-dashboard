# nas-monitoring-dashboard

A realtime monitoring dashboard for a self-hosted NAS. The Next.js 16
frontend subscribes to a Bun/Elysia backend that streams the host's real
system metrics over Server-Sent Events — one endpoint per topic, one
topic per panel.

```
┌──────────────────────┐  SSE  /api/stream/{system,cpu,gpu,memory,storage,docker}  ┌──────────────────────┐
│  frontend (Next.js)  │ ◀──────────────────────────────────────────────────────── │  backend (Bun+Elysia)│
│  localhost:3000      │  text/event-stream                                         │  localhost:3001       │
└──────────────────────┘                                                            └──────────────────────┘
                                                                                            │
                                                                                            ▼
                                                                                    real host metrics
                                                                                    (sysctl, /proc, df,
                                                                                     nvidia-smi, docker…)
```

The dashboard is built around a "liquid glass" aesthetic (frosted blur
panels over a dark gradient) with a 12-column responsive grid. Each panel
animates in on mount and updates in place as new events arrive.

---

## Quickstart

Two terminals:

```sh
# terminal 1 — backend (Bun + Elysia)
cd backend
bun install
bun run dev               # → http://localhost:3001

# terminal 2 — frontend (Next.js 16)
cd frontend
pnpm install
pnpm dev                  # → http://localhost:3000
```

Open <http://localhost:3000>. The dashboard renders immediately with the
seeded `mockSnapshot`; a "Connecting…" pill flips to "Live" (green,
pulsing) as the six SSE streams connect, and the panels start updating
with real values from the host running the backend.

---

## Repository structure

```
.
├── backend/                  Bun + Elysia SSE server
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example          PORT=3001
│   └── src/
│       ├── index.ts          Elysia app, CORS, lifecycle
│       ├── routes/streams.ts 6 SSE routes, one per topic
│       ├── metrics/          Real collectors (no mocks, no random walks)
│       │   ├── platform.ts   isMac/isLinux, run()/tryRun() helpers
│       │   ├── system.ts     hostname, os, kernel, uptime
│       │   ├── cpu.ts        brand, cores, per-core usage
│       │   ├── memory.ts     RAM, swap, pressure
│       │   ├── storage.ts    df usage, iostat/diskstats throughput
│       │   ├── gpu.ts        nvidia-smi / system_profiler
│       │   ├── docker.ts     docker ps + service ls
│       │   └── poller.ts     Background sampler with cached latest
│       └── types/index.ts    Shared types (mirrors frontend/types)
│
├── frontend/                 Next.js 16 + React 19 + Tailwind 4
│   ├── package.json
│   ├── pnpm-workspace.yaml
│   ├── .env.local            NEXT_PUBLIC_API_URL=http://localhost:3001
│   ├── app/page.tsx          Server component → renders <DashboardClient/>
│   ├── components/dashboard/ Header, panels, layout, glass primitives
│   ├── lib/
│   │   ├── api.ts            API base URL + topic list
│   │   ├── useSseTopic.ts    Generic EventSource hook
│   │   ├── useRealtimeSnapshot.ts  Orchestrates 6 streams
│   │   ├── gpu.ts            hasGpuData() — panel visibility helper
│   │   ├── format.ts         Number/byte/uptime formatters
│   │   └── mockData.ts       Seed values used as initial render
│   └── types/index.ts        DashboardSnapshot + sub-types
│
└── README.md                 You are here.
```

---

## API

All six endpoints are `GET` and stream `text/event-stream` frames in
the form `event: <topic>` + `data: <json>`. The frontend listens for the
named event; consumers can use any SSE client (curl, `EventSource`,
`SSEParser`, etc.).

| Endpoint                | Event name | Payload type |
| ----------------------- | ---------- | ------------ |
| `/api/stream/system`    | `system`   | `SystemInfo`  — hostname, os, kernel, uptime, timestamp |
| `/api/stream/cpu`       | `cpu`      | `CpuInfo`     — brand, cores[], overall, freq, temp, power |
| `/api/stream/gpu`       | `gpu`      | `GpuInfo`     — model, load, vram, temp, power, processes[] |
| `/api/stream/memory`    | `memory`   | `MemoryInfo`  — ram/swap used/total, pressure |
| `/api/stream/storage`   | `storage`  | `StorageInfo` — overall, used, total, disks[] |
| `/api/stream/docker`    | `docker`   | `DockerInfo`  — running/stopped/total, containers[], services[] |

Per-topic tick rates (background poller → SSE send):
all topics yield at **1 s** (a steady 1 Hz heartbeat for the dashboard).
The collectors underneath run at the same rate; `docker` is the only
exception — it polls every 2 s because `docker stats` is the most
expensive call, and the SSE still yields at 1 s (clients see the same
container stats for two consecutive ticks). CORS is permissive in dev;
the backend echoes the request origin so the Next.js dev server
(`:3000`) is allowed by default.

Quick sanity check:

```sh
curl -N http://localhost:3001/api/stream/cpu
# event: cpu
# data: {"brand":"Apple","model":"Apple M1","overall":42,...}
```

---

## Data flow

```
                  ┌─────────── poller (per-topic setInterval) ───────────┐
                  │                                                       │
   real host ─▶  collector (collectX)  ──▶  latest cache  ──▶  getter   │
                  │                                                       │
                  └───────────────────────────────────────────────────────┘
                                                                      │
                                                                      ▼
                                                         useSseTopic<T>
                                                                      │
                                                                      ▼  data
   initial={mockSnapshot}  ──▶  useRealtimeSnapshot  ──▶  DashboardClient
```

1. **Poller** runs each `collectX()` on its own interval and caches the
   latest value. A slow collector (e.g. `docker stats`) never blocks
   anything else.
2. **SSE route** opens an `EventSource` per topic. The route is just an
   async generator that yields the cached value, sleeps for the tick
   interval, and repeats. Elysia's pull-based backpressure cancels the
   generator when the client disconnects — no manual teardown needed.
3. **Frontend hook** subscribes to all six endpoints and merges the
   latest values into a single `DashboardSnapshot`. The `mockSnapshot`
   passed as `initial` renders during SSR and stays as a fallback while a
   stream is reconnecting.

---

## Frontend hooks

`useSseTopic<T>(url, { name, initial })` — generic, returns
`{ data, status, error, lastEventAt }`. SSR-safe (EventSource is only
created inside `useEffect`). Auto-reconnects on the browser's built-in
EventSource retry. Closes on unmount.

`useRealtimeSnapshot(initial)` — orchestrates the six streams, returns
`{ snapshot, status, streams }` where `status` rolls up to one of:
`live` (all open) · `connecting` (some still opening) · `degraded` (some
errored) · `offline` (all errored/closed). The Header renders a colored
pill with a ping animation based on this status.

`hasGpuData(gpu)` — hides the GpuPanel when the backend reports
`no-gpu-detected` or an Apple-Silicon-style payload (unified memory,
no live stats). The grid re-flows so the CpuPanel takes the full width
on its row when the GPU panel is absent.

---

## Platform support

Every collector has a macOS and a Linux implementation. The dispatch is
at the top of each file (`isMac` / `isLinux`).

| Metric     | macOS                                              | Linux                                       |
| ---------- | -------------------------------------------------- | ------------------------------------------- |
| system     | `hostname`, `sw_vers`, `kern.boottime`, `uname`    | `hostname`, `/etc/os-release`, `/proc/uptime`, `uname` |
| cpu        | `sysctl` + `top -l 2` (window-based %)             | `/proc/cpuinfo` + `/proc/stat` (jiffy delta) |
| memory     | `vm_stat` + `sysctl hw.memsize`                    | `/proc/meminfo` + `/proc/pressure/memory`   |
| storage    | `df -k` + `iostat -d -K` + `diskutil info -plist`  | `df -k` + `/proc/diskstats` (sector delta)  |
| gpu        | `system_profiler SPDisplaysDataType` (model only)  | `nvidia-smi` + `nvidia-smi pmon`            |
| docker     | `docker ps -a --format json` + `docker stats`      | same                                        |

Collectors that would require elevated privileges (Apple Silicon
`powermetrics` for live GPU stats, `smartctl` for drive health,
`nvidia-smi` power/fan fields) are not attempted; the dashboard treats
zero values as "not available" rather than failing.

---

## Configuration

| Variable                  | Where    | Default                     | Purpose |
| ------------------------- | -------- | --------------------------- | ------- |
| `PORT`                    | backend  | `3001`                      | Elysia listen port |
| `NEXT_PUBLIC_API_URL`     | frontend | `http://localhost:3001`     | Backend base URL (inlined at build time) |
| `DEBUG_METRICS`           | backend  | unset                       | Set to `1` to log per-tool failures |

---

## Development

```sh
# backend
cd backend
bunx tsc --noEmit           # type check
bun run dev                 # hot reload

# frontend
cd frontend
pnpm exec tsc --noEmit      # type check
pnpm dev                    # turbopack dev server
pnpm build && pnpm start    # production
```

The `useSseTopic` and `useRealtimeSnapshot` hooks are framework-agnostic
TypeScript — they can be lifted into any React project that consumes the
backend's SSE endpoints.

---

## Production notes

- The backend is single-process and holds metric state in memory; run it
  on the same host you want to monitor (or on a sidecar that has shell
  access to the host's filesystem and `nvidia-smi`).
- For the frontend, deploy with `pnpm build` and serve the static
  output. Point `NEXT_PUBLIC_API_URL` at the backend's public URL
  *before* building — `NEXT_PUBLIC_*` env vars are inlined at build
  time, not read at runtime.
- CORS currently echoes the request origin; tighten this in production
  by restricting `access-control-allow-origin` to the dashboard's host.
- The SSE routes are unbounded. If the dashboard is exposed publicly,
  put the backend behind an auth proxy and add an `Authorization`
  check in an `onBeforeHandle` hook.
