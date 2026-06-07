"use client";

import { motion } from "framer-motion";
import { BackgroundOrbs } from "@/components/dashboard/BackgroundOrbs";
import { Header } from "@/components/dashboard/Header";
import { CpuPanel } from "@/components/dashboard/CpuPanel";
import { GpuPanel } from "@/components/dashboard/GpuPanel";
import { LoadingOverlay } from "@/components/dashboard/LoadingOverlay";
import { MemoryPanel } from "@/components/dashboard/MemoryPanel";
import { StoragePanel } from "@/components/dashboard/StoragePanel";
import { DockerPanel } from "@/components/dashboard/DockerPanel";
import { useRealtimeSnapshot, type LiveStatus } from "@/lib/useRealtimeSnapshot";
import { hasGpuData } from "@/lib/gpu";

/**
 * Top-level dashboard container. Subscribes to the six backend SSE
 * topics via `useRealtimeSnapshot` and lays out the panels. While the
 * first batch of events is in flight, a 3D loading overlay sits on
 * top; once `ready` flips to `true` it fades out in sync with the
 * dashboard fading in, giving a smooth handoff from "loading" to
 * "live data".
 */
export function DashboardClient() {
  const { snapshot, status, ready } = useRealtimeSnapshot();
  const showGpu = hasGpuData(snapshot.gpu);
  const memoryPercent =
    snapshot.memory.ramTotal > 0
      ? (snapshot.memory.ramUsed / snapshot.memory.ramTotal) * 100
      : 0;

  return (
    <>
      <BackgroundOrbs />

      {/* Dashboard content. We always render it so the panels mount and
          Framer Motion's stagger runs once; while `!ready` we just keep
          it at opacity 0 so the loading overlay is the only thing the
          user sees. When `ready` flips, both the overlay and the
          dashboard cross-fade for 0.8s. */}
      <motion.div
        animate={{ opacity: ready ? 1 : 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8"
      >
        <div className="mb-6">
          <Header
            hostname={snapshot.hostname}
            os={snapshot.os}
            kernel={snapshot.kernel}
            uptime={snapshot.uptime}
            runningContainers={snapshot.docker.running}
            totalContainers={snapshot.docker.total}
            cpu={snapshot.cpu.overall}
            memory={memoryPercent}
            storage={snapshot.storage.overall}
            liveStatus={status}
          />
        </div>

        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.08 } },
          }}
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12 lg:gap-5"
        >
          <motion.div
            variants={panelVariants}
            className={showGpu ? "lg:col-span-7" : "lg:col-span-12"}
          >
            <CpuPanel cpu={snapshot.cpu} />
          </motion.div>

          {showGpu ? (
            <motion.div
              variants={panelVariants}
              className="lg:col-span-5"
            >
              <GpuPanel gpu={snapshot.gpu} />
            </motion.div>
          ) : null}

          <motion.div
            variants={panelVariants}
            className="lg:col-span-5"
          >
            <MemoryPanel memory={snapshot.memory} />
          </motion.div>

          <motion.div
            variants={panelVariants}
            className="lg:col-span-7"
          >
            <StoragePanel storage={snapshot.storage} />
          </motion.div>

          <motion.div
            variants={panelVariants}
            className="lg:col-span-12"
          >
            <DockerPanel docker={snapshot.docker} />
          </motion.div>
        </motion.div>

        <footer className="mt-6 text-center text-[10px] uppercase tracking-[0.2em] text-white/30">
          Liquid glass · live data · {new Date(snapshot.timestamp).getFullYear()}
        </footer>
      </motion.div>

      <LoadingOverlay visible={!ready} />
    </>
  );
}

const panelVariants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
  },
};
