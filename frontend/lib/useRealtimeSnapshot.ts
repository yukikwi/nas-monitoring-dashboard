"use client";

import { useMemo } from "react";
import type {
  CpuInfo,
  DashboardSnapshot,
  DockerInfo,
  GpuInfo,
  MemoryInfo,
  StorageInfo,
  SystemInfo,
} from "@/types";
import { streamUrl } from "./api";
import { useSseTopic, type SseStatus } from "./useSseTopic";

/** Overall connection health, derived from the six underlying streams. */
export type LiveStatus = "live" | "connecting" | "degraded" | "offline";

export interface UseRealtimeSnapshotResult {
  snapshot: DashboardSnapshot;
  status: LiveStatus;
  /**
   * True once every underlying stream has received its first event.
   * Until then, the snapshot is the typed `EMPTY_SNAPSHOT` and the
   * dashboard should render a loading overlay rather than zeros.
   */
  ready: boolean;
  /** Per-stream status, useful for a "show details" debug view. */
  streams: {
    system: SseStatus;
    cpu: SseStatus;
    gpu: SseStatus;
    memory: SseStatus;
    storage: SseStatus;
    docker: SseStatus;
  };
}

/**
 * Stable, fully-typed zero snapshot used as the placeholder before the
 * first SSE event arrives. Field shapes match the backend payloads so
 * the dashboard can render against this without type errors.
 */
export const EMPTY_SNAPSHOT: DashboardSnapshot = {
  hostname: "",
  os: "",
  kernel: "",
  // Use the current time so footers that read `timestamp.getFullYear()`
  // don't briefly flash "1970" before the real value arrives.
  uptime: 0,
  timestamp: Date.now(),
  cpu: {
    brand: "",
    model: "",
    architecture: "",
    physicalCores: 0,
    logicalCores: 0,
    baseFrequency: 0,
    overall: 0,
    cores: [],
    temperature: null,
    power: null,
  },
  gpu: {
    brand: "",
    model: "",
    driver: "",
    load: 0,
    vramUsed: 0,
    vramTotal: 0,
    temperature: 0,
    power: 0,
    powerLimit: 0,
    fanSpeed: 0,
    processes: [],
  },
  memory: {
    ramUsed: 0,
    ramTotal: 0,
    ramCached: 0,
    ramBuffers: 0,
    swapUsed: 0,
    swapTotal: 0,
    pressure: 0,
  },
  storage: { overall: 0, used: 0, total: 0, disks: [] },
  docker: { running: 0, stopped: 0, total: 0, containers: [], services: [] },
};

function rollupStatus(streams: SseStatus[]): LiveStatus {
  const open = streams.filter((s) => s === "open").length;
  const error = streams.filter((s) => s === "error" || s === "closed").length;
  if (open === streams.length) return "live";
  if (open === 0) return error > 0 ? "offline" : "connecting";
  if (error > 0) return "degraded";
  return "connecting";
}

/**
 * Subscribes to all six backend SSE topics and merges them into a
 * `DashboardSnapshot`. The provided `initial` value (or `EMPTY_SNAPSHOT`
 * if omitted) is used as the placeholder while the streams are still
 * connecting. Once every stream has produced at least one event,
 * `ready` flips to `true` and the dashboard can stop showing its
 * loading state.
 */
export function useRealtimeSnapshot(
  initial?: DashboardSnapshot | null,
): UseRealtimeSnapshotResult {
  const seed = initial ?? EMPTY_SNAPSHOT;
  const system = useSseTopic<SystemInfo>(streamUrl("system"), {
    name: "system",
    initial: {
      hostname: seed.hostname,
      os: seed.os,
      kernel: seed.kernel,
      uptime: seed.uptime,
      timestamp: seed.timestamp,
    },
  });
  const cpu = useSseTopic<CpuInfo>(streamUrl("cpu"), {
    name: "cpu",
    initial: seed.cpu,
  });
  const gpu = useSseTopic<GpuInfo>(streamUrl("gpu"), {
    name: "gpu",
    initial: seed.gpu,
  });
  const memory = useSseTopic<MemoryInfo>(streamUrl("memory"), {
    name: "memory",
    initial: seed.memory,
  });
  const storage = useSseTopic<StorageInfo>(streamUrl("storage"), {
    name: "storage",
    initial: seed.storage,
  });
  const docker = useSseTopic<DockerInfo>(streamUrl("docker"), {
    name: "docker",
    initial: seed.docker,
  });

  const streams = useMemo(
    () => ({
      system: system.status,
      cpu: cpu.status,
      gpu: gpu.status,
      memory: memory.status,
      storage: storage.status,
      docker: docker.status,
    }),
    [system.status, cpu.status, gpu.status, memory.status, storage.status, docker.status],
  );

  const status: LiveStatus = useMemo(
    () =>
      rollupStatus([
        system.status,
        cpu.status,
        gpu.status,
        memory.status,
        storage.status,
        docker.status,
      ]),
    [streams],
  );

  // Ready once every stream has delivered its first event. We gate on
  // `lastEventAt` rather than `data` because we also pass the zero
  // snapshot as `initial` to `useSseTopic` so that disconnected streams
  // keep showing their last values — that means `data` is non-null on
  // the very first render (with the zero placeholder), and would
  // otherwise flip `ready` to true before the backend has even
  // connected. `lastEventAt` is only set by `handleData` after the
  // first event lands, which is exactly the signal we want.
  const ready = useMemo(
    () =>
      Boolean(
        system.lastEventAt &&
          cpu.lastEventAt &&
          gpu.lastEventAt &&
          memory.lastEventAt &&
          storage.lastEventAt &&
          docker.lastEventAt,
      ),
    [
      system.lastEventAt,
      cpu.lastEventAt,
      gpu.lastEventAt,
      memory.lastEventAt,
      storage.lastEventAt,
      docker.lastEventAt,
    ],
  );

  const snapshot = useMemo<DashboardSnapshot>(() => {
    const sys = system.data;
    return {
      ...seed,
      hostname: sys?.hostname ?? seed.hostname,
      os: sys?.os ?? seed.os,
      kernel: sys?.kernel ?? seed.kernel,
      uptime: sys?.uptime ?? seed.uptime,
      timestamp: sys?.timestamp ?? seed.timestamp,
      cpu: cpu.data ?? seed.cpu,
      gpu: gpu.data ?? seed.gpu,
      memory: memory.data ?? seed.memory,
      storage: storage.data ?? seed.storage,
      docker: docker.data ?? seed.docker,
    };
    // We deliberately depend on the `data` field of each stream and the
    // seed snapshot. `seed` is treated as a stable placeholder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    system.data,
    cpu.data,
    gpu.data,
    memory.data,
    storage.data,
    docker.data,
  ]);

  return { snapshot, status, ready, streams };
}
