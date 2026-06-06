import type { MemoryInfo } from "../types";
import { isLinux, isMac, readFile, run, tryRun } from "./platform";

const PAGE_SIZE_DEFAULT = 16_384; // ARM64 macOS page size; x86 macOS uses 4096

interface RawMemory {
  ramUsed: number; // GB
  ramTotal: number;
  ramCached: number;
  ramBuffers: number;
  swapUsed: number;
  swapTotal: number;
  /** 0-100. Real pressure where available; derived from used% otherwise. */
  pressure: number;
}

async function readMac(): Promise<RawMemory | null> {
  const memsizeRaw = await run(["sysctl", "-n", "hw.memsize"]).catch(() => "");
  const memsize = Number((memsizeRaw || "").trim());
  if (!Number.isFinite(memsize) || memsize <= 0) return null;

  const vmStat = await tryRun(["vm_stat"]);
  if (!vmStat) return null;

  // Page size is printed on the first line: "Mach Virtual Memory Statistics: (page size of 16384 bytes)"
  const pageSize = Number(vmStat.match(/page size of (\d+) bytes/)?.[1] ?? PAGE_SIZE_DEFAULT);

  const get = (label: string) => {
    const m = vmStat.match(new RegExp(`${label}:\\s+(\\d+)`));
    return m ? Number(m[1]) * pageSize : 0;
  };

  const free = get("Pages free");
  const active = get("Pages active");
  const inactive = get("Pages inactive");
  const wired = get("Pages wired down");
  const compressed = get("Pages occupied by compressor");

  // Apple's "used" is everything that's not free — same as `top`'s "PhysMem used".
  const usedBytes = active + inactive + wired + compressed;
  const cachedBytes = inactive; // file-backed pages that can be evicted
  const buffersBytes = 0; // macOS doesn't distinguish; counted in wired.

  // Swap: `sysctl vm.swapusage` returns "total = 1234.56M  used = 12.34M  free = ..."
  const swapRaw = await tryRun(["sysctl", "vm.swapusage"]);
  let swapUsed = 0;
  let swapTotal = 0;
  if (swapRaw) {
    const totalM = swapRaw.match(/total\s*=\s*([\d.]+)M/)?.[1];
    const usedM = swapRaw.match(/used\s*=\s*([\d.]+)M/)?.[1];
    if (totalM) swapTotal = Number(totalM) / 1024; // M → GB
    if (usedM) swapUsed = Number(usedM) / 1024;
  }

  // Apple Silicon `memory_pressure` requires `powermetrics` (sudo). Fall back
  // to used/total ratio.
  const usedRatio = usedBytes / memsize;
  const pressure = Math.round(Math.min(1, Math.max(0, usedRatio)) * 100);

  return {
    ramUsed: usedBytes / 2 ** 30,
    ramTotal: memsize / 2 ** 30,
    ramCached: cachedBytes / 2 ** 30,
    ramBuffers: buffersBytes / 2 ** 30,
    swapUsed,
    swapTotal,
    pressure,
  };
}

async function readLinux(): Promise<RawMemory | null> {
  const raw = await readFile("/proc/meminfo");
  if (!raw) return null;

  const kb = (label: string) => {
    const m = raw.match(new RegExp(`^${label}:\\s+(\\d+)`, "m"));
    return m ? Number(m[1]) : 0;
  };

  const total = kb("MemTotal");
  const free = kb("MemFree");
  const available = kb("MemAvailable");
  const buffers = kb("Buffers");
  const cached = kb("Cached") + kb("SReclaimable");
  const swapTotal = kb("SwapTotal");
  const swapFree = kb("SwapFree");

  // `used` = total - available, the modern definition (matches `free` and
  // the kernel's own accounting).
  const used = total - available;

  // Real memory pressure, if the kernel exposes it. The file may not exist
  // on older kernels.
  let pressure = Math.round((used / total) * 100);
  const pressureRaw = await readFile("/proc/pressure/memory");
  if (pressureRaw) {
    // avg10=1.23 full avg10=0.45 ...
    const full = pressureRaw.match(/full avg10=([\d.]+)/)?.[1];
    if (full) pressure = Math.round(Math.min(100, Number(full) * 10));
  }

  if (!Number.isFinite(total) || total <= 0) return null;

  return {
    ramUsed: used / 2 ** 20, // KB → GB
    ramTotal: total / 2 ** 20,
    ramCached: cached / 2 ** 20,
    ramBuffers: buffers / 2 ** 20,
    swapUsed: (swapTotal - swapFree) / 2 ** 20,
    swapTotal: swapTotal / 2 ** 20,
    pressure,
  };
}

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export async function collectMemory(): Promise<MemoryInfo> {
  const raw = (isMac ? await readMac() : isLinux ? await readLinux() : null) ?? null;
  if (!raw) {
    return {
      ramUsed: 0,
      ramTotal: 0,
      ramCached: 0,
      ramBuffers: 0,
      swapUsed: 0,
      swapTotal: 0,
      pressure: 0,
    };
  }
  return {
    ramUsed: round(raw.ramUsed, 1),
    ramTotal: round(raw.ramTotal, 1),
    ramCached: round(raw.ramCached, 1),
    ramBuffers: round(raw.ramBuffers, 1),
    swapUsed: round(raw.swapUsed, 1),
    swapTotal: round(raw.swapTotal, 1),
    pressure: raw.pressure,
  };
}
