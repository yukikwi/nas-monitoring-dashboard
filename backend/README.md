# nas-monitoring-backend

Elysia (Bun) backend that streams real host metrics to the dashboard via
Server-Sent Events. One endpoint per topic — the frontend subscribes to
whichever panels it needs.

## Endpoints

| Method | Path                  | Description                                       |
| ------ | --------------------- | ------------------------------------------------- |
| GET    | `/`                   | Topic index                                       |
| GET    | `/health`             | Liveness probe                                    |
| GET    | `/api/stream/system`  | hostname, os, kernel, uptime, timestamp          |
| GET    | `/api/stream/cpu`     | per-core usage, brand/model, overall, frequency   |
| GET    | `/api/stream/gpu`     | nvidia-smi (Linux) / system_profiler (macOS)      |
| GET    | `/api/stream/memory`  | RAM, swap, pressure                               |
| GET    | `/api/stream/storage` | disk usage, read/write MB/s                       |
| GET    | `/api/stream/docker`  | `docker ps -a` + `docker service ls`              |

All `/api/stream/*` endpoints push `event: <topic>` + `data: <json>` frames
on a per-topic interval. Elysia's pull-based backpressure cancels the
generator when the client disconnects — no manual teardown required.

## Running

```sh
bun install
bun run dev      # hot reload
# or
bun start
```

The server listens on `PORT` (default `3001`). CORS is permissive in dev —
the frontend (Next.js on `:3000`) can subscribe without extra config.

## Platform support

Every collector has a macOS and a Linux implementation. The dispatch is at
the top of each file (`isMac` / `isLinux`).

| Metric     | macOS                                     | Linux                          |
| ---------- | ----------------------------------------- | ------------------------------ |
| system     | `hostname`, `sw_vers`, `uname`            | `hostname`, `/etc/os-release`, `uname` |
| cpu        | `sysctl` + `top -l 2`                     | `/proc/cpuinfo` + `/proc/stat` |
| memory     | `vm_stat` + `sysctl hw.memsize`           | `/proc/meminfo` + `/proc/pressure/memory` |
| storage    | `df -k` + `iostat -d -K` + `diskutil`    | `df -k` + `/proc/diskstats`    |
| gpu        | `system_profiler SPDisplaysDataType`       | `nvidia-smi`                   |
| docker     | `docker ps -a --format json`              | same                           |

Collectors that require elevated privileges (`nvidia-smi` queries of
fan/power, `powermetrics` for live Apple Silicon GPU stats) are not
attempted — the dashboard treats zero values as "not available".

## Architecture

```
src/
  index.ts            Elysia app + lifecycle
  routes/streams.ts   One GET /api/stream/<topic> per topic, async generator
  metrics/
    platform.ts       isMac/isLinux, run()/tryRun() wrappers
    system.ts         Hostname, OS, kernel, uptime
    cpu.ts            Brand, cores, per-core usage (delta or `top` window)
    memory.ts         RAM, swap, pressure
    storage.ts        df usage + iostat/diskstats throughput (delta)
    gpu.ts            nvidia-smi or system_profiler
    docker.ts         docker ps + service ls
    poller.ts         Background sampler with cached latest; getters for routes
  types/index.ts      Shared types (must match frontend/types/index.ts)
```

The poller runs each collector on its own interval and caches the result.
Routes call the getter and yield it — a slow collector never stalls an
SSE response. On first connect, the getter triggers an out-of-band sample
so the client doesn't wait up to a full interval for its first frame.
