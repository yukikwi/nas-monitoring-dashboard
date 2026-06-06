"use client";

import { motion } from "framer-motion";
import { BackgroundOrbs } from "@/components/dashboard/BackgroundOrbs";
import { Header } from "@/components/dashboard/Header";
import { CpuPanel } from "@/components/dashboard/CpuPanel";
import { GpuPanel } from "@/components/dashboard/GpuPanel";
import { MemoryPanel } from "@/components/dashboard/MemoryPanel";
import { StoragePanel } from "@/components/dashboard/StoragePanel";
import { DockerPanel } from "@/components/dashboard/DockerPanel";
import type { DashboardSnapshot } from "@/types";

interface DashboardClientProps {
  snapshot: DashboardSnapshot;
}

export function DashboardClient({ snapshot }: DashboardClientProps) {
  const memoryPercent = (snapshot.memory.ramUsed / snapshot.memory.ramTotal) * 100;

  return (
    <>
      <BackgroundOrbs />
      <div className="relative mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
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
            className="lg:col-span-7"
          >
            <CpuPanel cpu={snapshot.cpu} />
          </motion.div>

          <motion.div
            variants={panelVariants}
            className="lg:col-span-5"
          >
            <GpuPanel gpu={snapshot.gpu} />
          </motion.div>

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
          Liquid glass · mock data · {new Date(snapshot.timestamp).getFullYear()}
        </footer>
      </div>
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
