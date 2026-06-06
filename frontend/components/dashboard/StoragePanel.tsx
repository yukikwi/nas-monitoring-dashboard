"use client";

import { motion } from "framer-motion";
import { HardDrive, Thermometer, Activity, ChevronRight } from "lucide-react";
import { GlassCard } from "./GlassCard";
import { PanelHeader } from "./PanelHeader";
import { RingMeter } from "./RingMeter";
import { BarMeter } from "./BarMeter";
import {
  colorForHealth,
  colorForUsage,
  formatGb,
  formatPercent,
  formatSpeed,
  formatTemp,
} from "@/lib/format";
import type { StorageInfo } from "@/types";

interface StoragePanelProps {
  storage: StorageInfo;
}

const typeLabel: Record<StorageInfo["disks"][number]["type"], string> = {
  nvme: "NVMe",
  ssd: "SSD",
  hdd: "HDD",
  network: "Network",
};

export function StoragePanel({ storage }: StoragePanelProps) {
  return (
    <GlassCard className="h-full">
      <PanelHeader
        icon={<HardDrive className="h-4.5 w-4.5 text-white" />}
        title="Storage"
        subtitle={`${storage.disks.length} volumes · ${formatGb(storage.total)} total`}
        accent="amber"
        badge={
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white/60 ring-1 ring-white/10">
            {formatGb(storage.used)} used
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-2">
          <RingMeter
            value={storage.overall}
            size={150}
            stroke={11}
            centerValue={
              <span className="bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">
                {formatPercent(storage.overall)}
              </span>
            }
            centerLabel="Used"
            label={`${formatGb(storage.total - storage.used)} free`}
          />
        </div>

        <div className="flex flex-col gap-2">
          {storage.disks.map((disk, i) => {
            const usedPercent = (disk.used / disk.total) * 100;
            return (
              <motion.div
                key={disk.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.45,
                  delay: 0.05 * i,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="group rounded-2xl bg-white/[0.03] p-3 ring-1 ring-white/5 transition-colors hover:bg-white/[0.06]"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${colorForUsage(usedPercent)} bg-opacity-20 ring-1 ring-white/10`}
                    >
                      <HardDrive className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-white">
                          {disk.mount}
                        </span>
                        <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white/60 ring-1 ring-white/10">
                          {typeLabel[disk.type]}
                        </span>
                      </div>
                      <div className="truncate text-[10px] text-white/40">
                        {disk.device} · {disk.filesystem}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/30 transition-transform group-hover:translate-x-0.5" />
                </div>
                <div className="mb-1.5 flex items-center justify-between text-[11px]">
                  <span className="font-mono tabular-nums text-white/80">
                    {formatGb(disk.used)}{" "}
                    <span className="text-white/40">
                      / {formatGb(disk.total)}
                    </span>
                  </span>
                  <span className="font-mono tabular-nums text-white/70">
                    {formatPercent(usedPercent, 1)}
                  </span>
                </div>
                <BarMeter value={usedPercent} height={6} showShimmer={false} />
                <div className="mt-2 flex items-center gap-3 text-[10px] text-white/50">
                  <span className="flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    <span className="font-mono tabular-nums text-emerald-300">
                      R {formatSpeed(disk.readSpeed)}
                    </span>
                    <span className="font-mono tabular-nums text-blue-300">
                      W {formatSpeed(disk.writeSpeed)}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Thermometer className="h-3 w-3" />
                    <span
                      className={`font-mono tabular-nums ${colorForHealth(disk.health)}`}
                    >
                      {formatTemp(disk.temperature)}
                    </span>
                  </span>
                  <span
                    className={`ml-auto flex items-center gap-1 ${colorForHealth(disk.health)}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        disk.health === "good"
                          ? "bg-emerald-400"
                          : disk.health === "warning"
                            ? "bg-amber-400"
                            : "bg-rose-400"
                      }`}
                    />
                    {disk.health}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </GlassCard>
  );
}
