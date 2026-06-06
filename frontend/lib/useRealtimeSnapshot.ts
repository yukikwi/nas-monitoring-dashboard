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
 * `DashboardSnapshot`. The provided `initial` value is used as a fallback
 * so the dashboard renders with sensible values before the first event
 * arrives (and while a stream is reconnecting).
 */
export function useRealtimeSnapshot(
  initial: DashboardSnapshot,
): UseRealtimeSnapshotResult {
  const system = useSseTopic<SystemInfo>(streamUrl("system"), {
    name: "system",
    initial: {
      hostname: initial.hostname,
      os: initial.os,
      kernel: initial.kernel,
      uptime: initial.uptime,
      timestamp: initial.timestamp,
    },
  });
  const cpu = useSseTopic<CpuInfo>(streamUrl("cpu"), {
    name: "cpu",
    initial: initial.cpu,
  });
  const gpu = useSseTopic<GpuInfo>(streamUrl("gpu"), {
    name: "gpu",
    initial: initial.gpu,
  });
  const memory = useSseTopic<MemoryInfo>(streamUrl("memory"), {
    name: "memory",
    initial: initial.memory,
  });
  const storage = useSseTopic<StorageInfo>(streamUrl("storage"), {
    name: "storage",
    initial: initial.storage,
  });
  const docker = useSseTopic<DockerInfo>(streamUrl("docker"), {
    name: "docker",
    initial: initial.docker,
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

  const snapshot = useMemo<DashboardSnapshot>(() => {
    const sys = system.data;
    return {
      ...initial,
      hostname: sys?.hostname ?? initial.hostname,
      os: sys?.os ?? initial.os,
      kernel: sys?.kernel ?? initial.kernel,
      uptime: sys?.uptime ?? initial.uptime,
      timestamp: sys?.timestamp ?? initial.timestamp,
      cpu: cpu.data ?? initial.cpu,
      gpu: gpu.data ?? initial.gpu,
      memory: memory.data ?? initial.memory,
      storage: storage.data ?? initial.storage,
      docker: docker.data ?? initial.docker,
    };
    // We deliberately depend on the `data` field of each stream and the
    // initial snapshot. `initial` is treated as a stable seed by callers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    system.data,
    cpu.data,
    gpu.data,
    memory.data,
    storage.data,
    docker.data,
  ]);

  return { snapshot, status, streams };
}
