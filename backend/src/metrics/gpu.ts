import type { GpuInfo, GpuProcess } from "../types";
import { isLinux, isMac, tryRun } from "./platform";

// ---------------------------------------------------------------------------
// Linux + NVIDIA: `nvidia-smi --query-gpu=... --format=csv,noheader`.
// Falls through to system_profiler on macOS (Apple Silicon has no live
// utilization tools available without sudo). On other platforms we return
// a "not available" payload — the dashboard treats zeros as absent.
// ---------------------------------------------------------------------------

interface ParsedNvidia {
  name: string;
  driver: string;
  load: number;
  vramUsed: number;
  vramTotal: number;
  temperature: number;
  power: number;
  powerLimit: number;
  fanSpeed: number;
}

async function readNvidiaSmi(): Promise<ParsedNvidia | null> {
  const out = await tryRun([
    "nvidia-smi",
    "--query-gpu=name,driver_version,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit,fan.speed",
    "--format=csv,noheader,nounits",
  ]);
  if (!out) return null;
  const line = out.split("\n").find((l) => l.trim());
  if (!line) return null;
  const parts = line.split(",").map((s) => s.trim());
  if (parts.length < 9) return null;
  const num = (s: string) => {
    const v = Number(s);
    return Number.isFinite(v) ? v : 0;
  };
  return {
    name: parts[0]!,
    driver: parts[1]!,
    load: num(parts[2]!),
    vramUsed: Math.round(num(parts[3]!)), // MiB
    vramTotal: Math.round(num(parts[4]!)),
    temperature: Math.round(num(parts[5]!)),
    power: num(parts[6]!),
    powerLimit: num(parts[7]!),
    fanSpeed: num(parts[8]!),
  };
}

// `nvidia-smi pmon -c 1 -s u` lists per-process GPU usage. Cheap and clean.
async function readNvidiaProcesses(): Promise<GpuProcess[]> {
  const out = await tryRun(["nvidia-smi", "pmon", "-c", "1", "-s", "u"]);
  if (!out) return [];
  const lines = out.split("\n").slice(2); // skip the 2 header lines
  const processes: GpuProcess[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    // "# gpu   pid   type   sm   mem   enc   dec   command"
    const parts = line.trim().split(/\s+/);
    if (parts.length < 7) continue;
    const pid = Number(parts[1]);
    const sm = Number(parts[3]);
    const mem = Number(parts[4]);
    if (!Number.isFinite(pid)) continue;
    processes.push({
      pid,
      name: parts.slice(6).join(" "),
      vram: Math.round(mem),
      usage: Math.round(sm),
    });
  }
  return processes;
}

interface ParsedMacGpu {
  name: string;
  vendor: string;
  cores: number;
}

async function readMacGpu(): Promise<ParsedMacGpu | null> {
  const out = await tryRun(["system_profiler", "SPDisplaysDataType"]);
  if (!out) return null;
  // We pick the first GPU listed. Apple Silicon shows e.g.
  //   "Chipset Model: Apple M1"
  //   "Vendor: Apple (0x106b)"
  //   "Total Number of Cores: 8"
  // Discrete GPUs show "Chipset Model: <name>" + VRAM lines.
  const chipset = out.match(/Chipset Model:\s*(.+)/)?.[1]?.trim();
  const vendor = out.match(/Vendor:\s*([^(\n]+)/)?.[1]?.trim();
  const cores = Number(out.match(/Total Number of Cores:\s*(\d+)/)?.[1] ?? 0);
  if (!chipset) return null;
  return { name: chipset, vendor: vendor ?? "Apple", cores };
}

export async function collectGpu(): Promise<GpuInfo> {
  if (isLinux) {
    const data = await readNvidiaSmi();
    if (data) {
      const processes = await readNvidiaProcesses();
      return {
        brand: "NVIDIA",
        model: data.name,
        driver: data.driver,
        load: data.load,
        vramUsed: data.vramUsed,
        vramTotal: data.vramTotal,
        temperature: data.temperature,
        power: data.power,
        powerLimit: data.powerLimit,
        fanSpeed: data.fanSpeed,
        processes,
      };
    }
  }

  if (isMac) {
    const data = await readMacGpu();
    if (data) {
      return {
        brand: data.vendor,
        model: data.name,
        driver: "n/a",
        load: 0,
        vramUsed: 0,
        vramTotal: 0,
        temperature: 0,
        power: 0,
        powerLimit: 0,
        fanSpeed: 0,
        processes: [],
      };
    }
  }

  return {
    brand: "unknown",
    model: "no-gpu-detected",
    driver: "",
    load: 0,
    vramUsed: 0,
    vramTotal: 0,
    temperature: 0,
    power: 0,
    powerLimit: 0,
    fanSpeed: 0,
    processes: [],
  };
}
