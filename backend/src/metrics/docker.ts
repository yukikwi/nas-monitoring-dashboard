import type { DockerContainer, DockerInfo, ServiceStatus } from "../types";
import { tryRun } from "./platform";

// ---------------------------------------------------------------------------
// Docker — non-swarm focus for now.
//
// Sources:
//   `docker ps -a --format json`     — list all containers (works without swarm)
//   `docker stats --no-stream ...`   — per-container CPU/mem enrichment
//
// Swarm-mode services (`docker service ls`) are intentionally not queried —
// they require `docker swarm init` and would spam the log with
// "This node is not a swarm manager" on every poll. The `services` field
// stays in the payload (always empty for now) so the frontend type doesn't
// need to change when swarm support is added later.
//
// If the daemon isn't running or docker isn't installed, returns an empty
// payload — the dashboard renders "no containers" rather than crashing.
// ---------------------------------------------------------------------------

interface DockerPsLine {
  ID?: string;
  Names?: string;
  Image?: string;
  State?: string;
  Status?: string;
  Ports?: string;
  Labels?: string;
}

function parseStatusToUptime(status: string): number {
  // docker emits "Up 3 days", "Up 14 hours", "Exited (0) 2 hours ago", etc.
  // We translate to seconds. Anything we can't parse → 0.
  const up = status.match(/Up (.*)/)?.[1] ?? "";
  if (!up) return 0;
  const num = (s: string) => Number(s);
  if (/^\d+ \w+ \(.*\)$/.test(up)) return 0; // "Up 12 minutes (unhealthy)" — base part before paren
  const days = up.match(/(\d+) days?/);
  const hours = up.match(/(\d+) hours?/);
  const minutes = up.match(/(\d+) minutes?/);
  const seconds = up.match(/(\d+) seconds?/);
  return (
    (days ? num(days[1]!) * 86_400 : 0) +
    (hours ? num(hours[1]!) * 3_600 : 0) +
    (minutes ? num(minutes[1]!) * 60 : 0) +
    (seconds ? num(seconds[1]!) : 0)
  );
}

function statusFromState(state: string): ServiceStatus {
  switch (state.toLowerCase()) {
    case "running":
      return "running";
    case "exited":
    case "dead":
    case "created":
      return "stopped";
    case "restarting":
      return "restarting";
    case "paused":
    case "removing":
    default:
      return "exited";
  }
}

function parseContainers(json: string): DockerContainer[] {
  // docker --format json emits one JSON object per line.
  const lines = json.split("\n").filter((l) => l.trim());
  const items: DockerPsLine[] = [];
  for (const line of lines) {
    try {
      items.push(JSON.parse(line));
    } catch {
      // Older docker wraps the array in `[ ... ]` — strip the brackets and
      // split on `},{` boundaries.
      const inner = line.replace(/^\[|\]$/g, "").replace(/}\s*,\s*{/g, "}\n{");
      for (const chunk of inner.split("\n")) {
        try {
          items.push(JSON.parse(chunk));
        } catch {
          /* ignore malformed line */
        }
      }
    }
  }
  return items.map((c) => ({
    id: c.ID ?? "",
    name: c.Names ?? "",
    image: c.Image ?? "",
    status: statusFromState(c.State ?? ""),
    uptime: parseStatusToUptime(c.Status ?? ""),
    // Real per-container CPU/mem comes from `docker stats` below.
    cpu: 0,
    memory: 0,
    memoryMb: 0,
    ports: c.Ports ?? "",
    gpu: (c.Labels ?? "").includes("gpu"),
  }));
}

// Enrich with `docker stats --no-stream --format json`. Skipped if it fails
// or returns no data — the dashboard tolerates zeros.
async function enrichWithStats(containers: DockerContainer[]): Promise<DockerContainer[]> {
  const out = await tryRun(["docker", "stats", "--no-stream", "--format", "json"], {
    timeoutMs: 5_000,
  });
  if (!out) return containers;
  const byName = new Map<string, { cpu: number; memPct: number; memMb: number }>();
  for (const line of out.split("\n").filter((l) => l.trim())) {
    try {
      const s = JSON.parse(line) as {
        Name?: string;
        CPUPerc?: string;
        MemPerc?: string;
        MemUsage?: string;
      };
      if (!s.Name) continue;
      const cpu = Number((s.CPUPerc ?? "0").replace("%", "")) || 0;
      const memPct = Number((s.MemPerc ?? "0").replace("%", "")) || 0;
      // MemUsage looks like "184.2MiB / 7.62GiB" — pull the first number+unit.
      const m = (s.MemUsage ?? "").match(/([\d.]+)\s*([KMG]?i?B)/i);
      let memMb = 0;
      if (m) {
        const n = Number(m[1]);
        const unit = m[2]!.toUpperCase();
        if (unit.startsWith("K")) memMb = n / 1024;
        else if (unit.startsWith("M")) memMb = n;
        else if (unit.startsWith("G")) memMb = n * 1024;
        else if (unit.startsWith("B")) memMb = n / (1024 * 1024);
      }
      byName.set(s.Name, { cpu, memPct, memMb });
    } catch {
      /* skip malformed */
    }
  }
  return containers.map((c) => {
    const s = byName.get(c.name);
    return s
      ? { ...c, cpu: round(s.cpu, 1), memory: round(s.memPct, 1), memoryMb: Math.round(s.memMb) }
      : c;
  });
}

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export async function collectDocker(): Promise<DockerInfo> {
  const psOut = await tryRun([
    "docker",
    "ps",
    "-a",
    "--format",
    "json",
    "--no-trunc",
  ]);
  if (psOut === null) {
    // Daemon not running or docker not installed — return an empty payload
    // rather than failing the whole stream.
    return { running: 0, stopped: 0, total: 0, containers: [], services: [] };
  }

  const containers = await enrichWithStats(parseContainers(psOut));

  const running = containers.filter((c) => c.status === "running").length;
  const stopped = containers.filter(
    (c) => c.status === "stopped" || c.status === "exited",
  ).length;

  return {
    running,
    stopped,
    total: containers.length,
    containers,
    // Non-swarm mode: no services to report. Kept in the payload so the
    // frontend type stays stable when swarm support is added.
    services: [],
  };
}
