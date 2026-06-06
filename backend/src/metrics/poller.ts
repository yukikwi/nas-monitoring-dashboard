// Background poller: runs each metric collector on a fixed interval, caches
// the latest snapshot, and exposes getters for the SSE routes. Decoupling
// polling from streaming means a slow collector (e.g. docker stats) never
// stalls the SSE response back to the client.

import type { CpuInfo, DockerInfo, GpuInfo, MemoryInfo, StorageInfo, SystemInfo } from "../types";
import { collectCpu } from "./cpu";
import { collectDocker } from "./docker";
import { collectGpu } from "./gpu";
import { collectMemory } from "./memory";
import { collectStorage } from "./storage";
import { collectSystem } from "./system";

const POLL_INTERVALS = {
  // All run at 1s so the SSE 1Hz tick always has a fresh cached value.
  // The collectors themselves are cheap subprocesses (sysctl, df, vm_stat,
  // top, nvidia-smi) and can comfortably sustain this rate.
  system: 1_000,
  cpu: 1_000,
  gpu: 1_000,
  memory: 1_000,
  storage: 1_000,
  // `docker stats` is the only expensive call — it spawns a process and
  // walks every container. 2s keeps the cache fresh without hammering the
  // daemon. The SSE still yields at 1s; clients just see the same
  // container stats for two consecutive ticks.
  docker: 2_000,
} as const;

// `null` until the first sample lands. The routes will surface a 503-like
// payload via Elysia; clients should retry.
let latestSystem: SystemInfo | null = null;
let latestCpu: CpuInfo | null = null;
let latestGpu: GpuInfo | null = null;
let latestMemory: MemoryInfo | null = null;
let latestStorage: StorageInfo | null = null;
let latestDocker: DockerInfo | null = null;

const timers: ReturnType<typeof setInterval>[] = [];

async function poll<T>(label: string, fn: () => Promise<T>, setter: (v: T) => void) {
  try {
    setter(await fn());
  } catch (err) {
    // Don't kill the timer on a single failure — the next sample might
    // succeed (e.g. transient docker daemon restart).
    console.warn(`[poller] ${label} failed:`, err);
  }
}

function start<T>(
  label: string,
  intervalMs: number,
  fn: () => Promise<T>,
  setter: (v: T) => void,
) {
  // First sample now, then on the interval.
  void poll(label, fn, setter);
  timers.push(setInterval(() => poll(label, fn, setter), intervalMs));
}

export function startPoller() {
  if (timers.length) return; // idempotent
  start("system", POLL_INTERVALS.system, collectSystem, (v) => (latestSystem = v));
  start("cpu", POLL_INTERVALS.cpu, collectCpu, (v) => (latestCpu = v));
  start("gpu", POLL_INTERVALS.gpu, collectGpu, (v) => (latestGpu = v));
  start("memory", POLL_INTERVALS.memory, collectMemory, (v) => (latestMemory = v));
  start("storage", POLL_INTERVALS.storage, collectStorage, (v) => (latestStorage = v));
  start("docker", POLL_INTERVALS.docker, collectDocker, (v) => (latestDocker = v));
}

export function stopPoller() {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
}

// Trigger an out-of-band sample (used by routes on first connect so the
// client gets data immediately rather than waiting up to `intervalMs`).
async function ensureFresh<T>(getter: () => T | null, fn: () => Promise<T>, setter: (v: T) => void) {
  if (getter() === null) await poll("on-demand", fn, setter);
}

export const metrics = {
  getSystem: async (): Promise<SystemInfo> => {
    await ensureFresh(() => latestSystem, collectSystem, (v) => (latestSystem = v));
    return latestSystem!;
  },
  getCpu: async (): Promise<CpuInfo> => {
    await ensureFresh(() => latestCpu, collectCpu, (v) => (latestCpu = v));
    return latestCpu!;
  },
  getGpu: async (): Promise<GpuInfo> => {
    await ensureFresh(() => latestGpu, collectGpu, (v) => (latestGpu = v));
    return latestGpu!;
  },
  getMemory: async (): Promise<MemoryInfo> => {
    await ensureFresh(() => latestMemory, collectMemory, (v) => (latestMemory = v));
    return latestMemory!;
  },
  getStorage: async (): Promise<StorageInfo> => {
    await ensureFresh(() => latestStorage, collectStorage, (v) => (latestStorage = v));
    return latestStorage!;
  },
  getDocker: async (): Promise<DockerInfo> => {
    await ensureFresh(() => latestDocker, collectDocker, (v) => (latestDocker = v));
    return latestDocker!;
  },
};
