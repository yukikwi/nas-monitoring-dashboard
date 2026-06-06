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
    // Walk the JSON output of `sensors -j` looking for the first adapter that
    // has a CPU-die temperature. We prefer k10temp (AMD) and coretemp
    // (Intel), in that order. Plain `temp1_input` on an arbitrary hwmon
    // would happily pick up an NVMe drive's composite sensor and report a
    // constant ~50°C — that's the bug this rewrites around.
    const json = await tryRun(["sensors", "-j"], { timeoutMs: 2_000 });
    if (json) {
      let parsed: unknown;
      try { parsed = JSON.parse(json); } catch { parsed = null; }
      if (parsed && typeof parsed === "object") {
        const adapters = parsed as Record<string, Record<string, Record<string, number>>>;
        const preference = ["k10temp", "coretemp", "zenpower"];
        for (const needle of preference) {
          for (const [name, features] of Object.entries(adapters)) {
            if (!name.toLowerCase().includes(needle)) continue;
            // k10temp labels its Tctl at temp1_input and Tdie at temp3_input.
            // coretemp's first physical package is "Package id 0" at temp1_input.
            const label = features["Tctl"] ?? features["Tdie"] ?? features["Package id 0"] ?? features["CPU"];
            const raw = label?.["temp1_input"];
            if (Number.isFinite(raw)) return Math.round(raw as number);
          }
        }
      }
    }

    // Fallback: thermal_zone0 (some distros expose it without lm-sensors).
    const tz = await readFile("/sys/class/thermal/thermal_zone0/temp");
    if (tz) {
      const milli = Number(tz.trim());
      if (Number.isFinite(milli)) return Math.round(milli / 1000);
    }
  }
  return null;
}

// Rough TDP lookup, in watts, keyed on substrings of the `model name` string.
// Linux sysfs doesn't expose CPU TDP, and RAPL needs root. The estimate is
// intentionally conservative — better to under-report than to advertise a
// number that ignores boost/PBO behavior.
const TDP_HINTS: Array<[RegExp, number]> = [
  // AMD EPYC server
  [/epyc\s*9[6-9]\d{2}/i, 360],
  [/epyc\s*7[7-9]\d{2}/i, 240],
  [/epyc\s*7[0-6]\d{2}/i, 180],
  [/epyc\s*4\d{2}/i, 120],
  [/epyc\s*3\d{2}/i, 155],
  [/epyc/i, 120],
  // AMD Ryzen desktop — newer 3D V-Cache parts run hotter
  [/ryzen\s*9.*x3d/i, 120],
  [/ryzen\s*7.*x3d/i, 120],
  [/ryzen\s*9\s*79\d{2}/i, 170],
  [/ryzen\s*9\s*7\d{3}/i, 120],
  [/ryzen\s*7\s*7\d{3}/i, 105],
  [/ryzen\s*7/i, 65],
  [/ryzen\s*5\s*7\d{3}/i, 105],
  [/ryzen\s*5/i, 65],
  [/ryzen\s*3/i, 65],
  // Intel Xeon / Core
  [/xeon.*platinum/i, 205],
  [/xeon.*gold/i, 165],
  [/xeon.*silver/i, 85],
  [/xeon/i, 120],
  [/core\s*i9-14\d{3}/i, 125],
  [/core\s*i9/i, 65],
  [/core\s*i7/i, 65],
  [/core\s*i5/i, 65],
];

function estimateTdp(model: string): number {
  for (const [re, w] of TDP_HINTS) {
    if (re.test(model)) return w;
  }
  return 65;
}

async function readPower(overallUsage: number, model: string): Promise<number | null> {
  // RAPL (`/sys/class/powercap/intel-rapl/.../energy_uj`) is the only
  // non-estimated CPU-power source on Linux, and it needs root. The user's
  // deployment can grant the service user access via a udev rule
  // (`SUBSYSTEM=="powercap", MODE="0644"`). When that's not available we
  // fall back to a TDP × usage estimate — rough, but always non-null.
  const pkg = await readFile("/sys/class/powercap/intel-rapl/intel-rapl:0/energy_uj");
  if (!pkg) {
    const tdp = estimateTdp(model);
    return Math.round((overallUsage / 100) * tdp);
  }
  // RAPL returns cumulative microjoules; convert via time delta tracked
  // in `lastEnergySample` to get a watts reading.
  const now = Date.now();
  const energy = Number(pkg.trim());
  if (!Number.isFinite(energy) || !lastEnergySample) {
    lastEnergySample = { energy, at: now };
    return null;
  }
  const dE = energy - lastEnergySample.energy; // µJ
  const dT = (now - lastEnergySample.at) / 1000; // s
  lastEnergySample = { energy, at: now };
  if (dT <= 0) return null;
  // Guard against the 32-bit µJ counter rolling over.
  if (dE < 0) return null;
  return Math.round(dE / 1e6 / dT);
}

let lastEnergySample: { energy: number; at: number } | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Last successfully-sampled `CpuInfo`. When the current sample is bad
 * (subprocess killed, malformed output, `top` preempted under heavy load)
 * we return this instead of poisoning the cache with a `0%` payload that
 * would make the UI flash to zero for several ticks.
 */
let lastGood: CpuInfo | null = null;

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

  // Build the per-core array. `temperature` may be `null` (see below).
  const cores: CpuCore[] = perCoreUsage.map((usage, i) => ({
    id: i,
    usage,
    frequency: freqs[i] ?? id.baseFrequency,
    temperature,
  }));

  // If this tick produced no usable data, serve the last good snapshot so the
  // dashboard doesn't flash to 0% for several ticks when `top` is preempted
  // (e.g. under heavy load, or when the subprocess is killed by our timeout).
  if (overallUsage === 0 && !sample && lastGood) {
    return lastGood;
  }

  // Temperature: Linux reads it via `sensors` (k10temp/coretext Tctl).
  // macOS would need `sudo powermetrics` (privileged, heavy) or a
  // third-party SMC reader — neither is a reasonable default. We propagate
  // `null` so the UI can show "—" instead of a misleading 0°C.
  //
  // Power: Linux tries RAPL first (real µJ delta → watts) and falls back
  // to a TDP × usage estimate. macOS still returns `null`. The nvidia-smi
  // path covers GPU power; CPU power on macOS is out of scope for now.
  const power = isLinux ? await readPower(overallUsage, id.model) : null;

  const next: CpuInfo = {
    brand: id.brand,
    model: id.model,
    architecture: id.architecture,
    physicalCores: id.physicalCores,
    logicalCores: id.logicalCores,
    baseFrequency: id.baseFrequency,
    overall: overallUsage,
    cores,
    temperature,
    power,
  };

  if (sample) {
    lastSample = sample;
    lastSampleAt = Date.now();
  }

  // Only overwrite `lastGood` with a non-degenerate reading. A 0% sample
  // mid-flight is almost always a sign of a failed `top` invocation, not
  // a genuinely idle machine.
  if (overallUsage > 0) lastGood = next;

  return next;
}
