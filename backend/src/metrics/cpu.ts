import type { CpuCore, CpuInfo } from "../types";
import { isLinux, isMac, readFile, sysctl, sysctlString, tryRun } from "./platform";

// ---------------------------------------------------------------------------
// Static CPU identity — collected once and cached. Used for brand/model/cores
// and as the seed for the per-core array.
// ---------------------------------------------------------------------------

interface CpuIdentity {
  brand: string;
  model: string;
  architecture: string;
  physicalCores: number;
  logicalCores: number;
  baseFrequency: number;
}

let identity: CpuIdentity | null = null;
async function loadIdentity(): Promise<CpuIdentity> {
  if (identity) return identity;

  let brand = "unknown";
  let model = "unknown";
  let architecture = process.arch;
  let physicalCores = 0;
  let logicalCores = 0;
  let baseFrequency = 0;

  if (isMac) {
    const m = sysctlString("machdep.cpu.brand_string");
    if (m) {
      brand = m.includes("Apple") ? "Apple" : m.split(" ")[0] ?? "Apple";
      model = m;
    }
    physicalCores = sysctl("hw.physicalcpu") ?? 0;
    logicalCores = sysctl("hw.logicalcpu") ?? 0;
    // Apple Silicon: no published base frequency. Use the nominal 3.2 GHz
    // for M1 as a reasonable stand-in until a real source is wired in.
    baseFrequency = /Apple M\d/i.test(model) ? 3.2 : (sysctl("hw.cpufrequency_max") ?? 0) / 1e9;
  } else if (isLinux) {
    const cpuinfo = (await readFile("/proc/cpuinfo")) ?? "";
    const first = cpuinfo.split("\n\n")[0] ?? "";
    const modelName = first.match(/model name\s*:\s*(.+)/)?.[1]?.trim();
    const vendor = first.match(/vendor_id\s*:\s*(.+)/)?.[1]?.trim();
    if (vendor) brand = vendor;
    if (modelName) {
      const parts = modelName.split(" ");
      brand = parts[0] ?? brand;
      model = modelName;
    }
    // /proc/cpuinfo is repetitive; count distinct physical/logical ids.
    const physicalIds = new Set(
      [...cpuinfo.matchAll(/physical id\s*:\s*(\d+)/g)].map((m) => m[1]),
    );
    const coreIds = new Set(
      [...cpuinfo.matchAll(/cpu cores\s*:\s*(\d+)/g)].map((m) => m[1]),
    );
    physicalCores = [...coreIds].reduce((sum, c) => sum + Number(c), 0) ||
      physicalIds.size * 1;
    logicalCores = [...cpuinfo.matchAll(/^processor\s*:/gm)].length;
    const mhz = first.match(/cpu MHz\s*:\s*([\d.]+)/)?.[1];
    if (mhz) baseFrequency = Number(mhz) / 1000;
  }

  identity = { brand, model, architecture, physicalCores, logicalCores, baseFrequency };
  return identity;
}

// ---------------------------------------------------------------------------
// Live usage — sampled at runtime.
//
// macOS: `top -l 2 -n 0 -s 1` returns two samples one second apart. We
//        subtract the second from the first to get per-CPU-time
//        (jiffies). This is the same approach `top` itself uses.
//
// Linux: `/proc/stat` exposes per-CPU jiffies. Two samples one second
//        apart give us per-core busy %.
// ---------------------------------------------------------------------------

interface CpuSample {
  /** Per-CPU jiffies (idle, total). Array index is core id. */
  perCore: { idle: number; total: number }[];
  /** Aggregate idle/total across all cores. */
  aggregate: { idle: number; total: number };
}

let lastSample: CpuSample | null = null;
let lastSampleAt = 0;

async function readSample(): Promise<CpuSample | null> {
  if (isMac) {
    const out = await tryRun(["top", "-l", "2", "-n", "0", "-s", "1"], { timeoutMs: 3_000 });
    if (!out) return null;
    // `top` reports percentages normalized per sample, NOT cumulative
    // jiffies, so we can't take deltas. The second sample (taken 1s after
    // the first) IS the 1-second window we want — just use it directly.
    const lines = [...out.matchAll(/CPU usage:\s*([\d.]+)% user,\s*([\d.]+)% sys,\s*([\d.]+)% idle/g)];
    if (lines.length < 2) return null;
    const last = lines[lines.length - 1]!;
    const user = Number(last[1]);
    const sys = Number(last[2]);
    const idle = Number(last[3]);
    // Encode the single sample as if it were a delta. `total` includes busy
    // + idle so the downstream ratio = (total - idle) / total = busy%.
    const total = user + sys + idle;
    return {
      perCore: [], // macOS doesn't expose per-core without `powermetrics` (sudo)
      aggregate: { idle, total },
    };
  }

  if (isLinux) {
    const raw = await readFile("/proc/stat");
    if (!raw) return null;
    const lines = raw.split("\n").filter((l) => l.startsWith("cpu"));
    const perCore: { idle: number; total: number }[] = [];
    let aggregateIdle = 0;
    let aggregateTotal = 0;
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      // cpu  user nice system idle iowait irq softirq steal guest guest_nice
      const user = Number(parts[1] ?? 0);
      const nice = Number(parts[2] ?? 0);
      const system = Number(parts[3] ?? 0);
      const idle = Number(parts[4] ?? 0);
      const iowait = Number(parts[5] ?? 0);
      const irq = Number(parts[6] ?? 0);
      const softirq = Number(parts[7] ?? 0);
      const steal = Number(parts[8] ?? 0);
      const total = user + nice + system + idle + iowait + irq + softirq + steal;
      const idleT = idle + iowait;
      if (parts[0] === "cpu") {
        aggregateIdle = idleT;
        aggregateTotal = total;
      } else {
        // parts[0] is "cpu0", "cpu1", …
        const idx = Number(parts[0]!.slice(3));
        perCore[idx] = { idle: idleT, total };
      }
    }
    return { perCore, aggregate: { idle: aggregateIdle, total: aggregateTotal } };
  }

  return null;
}

async function readFrequency(): Promise<number[]> {
  // Best-effort. On macOS we can sample `sysctl hw.cpufrequency` once; per-core
  // live frequency on Apple Silicon isn't exposed without `powermetrics` (sudo).
  // On Linux, /sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq gives the
  // current frequency per core.
  if (isLinux) {
    const dir = "/sys/devices/system/cpu";
    const out: number[] = [];
    for (let i = 0; i < 64; i++) {
      const raw = await readFile(`${dir}/cpu${i}/cpufreq/scaling_cur_freq`);
      if (!raw) break;
      const khz = Number(raw.trim());
      if (Number.isFinite(khz)) out[i] = khz / 1e6; // GHz
    }
    if (out.length) return out;
  }
  return [];
}

async function readTemperature(): Promise<number | null> {
  if (isLinux) {
    // Try the most common thermal zone first.
    for (const path of [
      "/sys/class/thermal/thermal_zone0/temp",
      "/sys/class/hwmon/hwmon0/temp1_input",
    ]) {
      const raw = await readFile(path);
      if (raw) {
        const milli = Number(raw.trim());
        if (Number.isFinite(milli)) return Math.round(milli / 1000);
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let cached: CpuInfo | null = null;

export async function collectCpu(): Promise<CpuInfo> {
  const id = await loadIdentity();
  const sample = await readSample();
  const freqs = await readFrequency();
  const temperature = await readTemperature();

  // Compute deltas if we have a prior sample. On macOS the sample already
  // represents the 1-second window so we don't need a delta.
  let perCoreUsage: number[] = [];
  let overallUsage = 0;
  if (sample && (lastSample || isMac)) {
    const { idle, total } = sample.aggregate;
    if (isMac) {
      overallUsage = total > 0 ? Math.round(((total - idle) / total) * 100) : 0;
    } else {
      const dIdle = sample.aggregate.idle - lastSample!.aggregate.idle;
      const dTotal = sample.aggregate.total - lastSample!.aggregate.total;
      overallUsage = dTotal > 0 ? Math.max(0, Math.min(100, Math.round(((dTotal - dIdle) / dTotal) * 100))) : 0;

      for (let i = 0; i < sample.perCore.length; i++) {
        const cur = sample.perCore[i]!;
        const prev = lastSample!.perCore[i];
        if (!prev) continue;
        const dI = cur.idle - prev.idle;
        const dT = cur.total - prev.total;
        const pct = dT > 0 ? Math.round(((dT - dI) / dT) * 100) : 0;
        perCoreUsage[i] = Math.max(0, Math.min(100, pct));
      }
    }
  } else if (sample) {
    // Linux first sample — fall back to instantaneous (will be 0-ish).
    const { idle, total } = sample.aggregate;
    overallUsage = total > 0 ? Math.round(((total - idle) / total) * 100) : 0;
  }

  // macOS doesn't expose per-core. Fan the aggregate out to N entries so the
  // UI heatmap shows a non-trivial (and correct) value for every core, while
  // making it clear via `overall` that it's a single system-wide number.
  if (perCoreUsage.length === 0 && id.physicalCores > 0) {
    perCoreUsage = new Array(id.physicalCores).fill(overallUsage);
  }

  // Build the per-core array.
  const cores: CpuCore[] = perCoreUsage.map((usage, i) => ({
    id: i,
    usage,
    frequency: freqs[i] ?? id.baseFrequency,
    temperature: temperature ?? 0,
  }));

  cached = {
    brand: id.brand,
    model: id.model,
    architecture: id.architecture,
    physicalCores: id.physicalCores,
    logicalCores: id.logicalCores,
    baseFrequency: id.baseFrequency,
    overall: overallUsage,
    cores,
    temperature: temperature ?? 0,
    power: 0, // Not exposed cross-platform without privileged tools.
  };

  if (sample) {
    lastSample = sample;
    lastSampleAt = Date.now();
  }

  return cached;
}
