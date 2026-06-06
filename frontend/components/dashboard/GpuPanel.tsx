"use client";

import { motion } from "framer-motion";
import { Gpu, Thermometer, Zap, Fan } from "lucide-react";
import { GlassCard } from "./GlassCard";
import { PanelHeader } from "./PanelHeader";
import { RingMeter } from "./RingMeter";
import { BarMeter } from "./BarMeter";
import {
  colorForUsage,
  formatMb,
  formatPercent,
  formatPower,
  formatTemp,
} from "@/lib/format";
import type { GpuInfo } from "@/types";

interface GpuPanelProps {
  gpu: GpuInfo;
}

export function GpuPanel({ gpu }: GpuPanelProps) {
  const vramPercent = (gpu.vramUsed / gpu.vramTotal) * 100;
  const powerPercent = (gpu.power / gpu.powerLimit) * 100;

  return (
    <GlassCard className="h-full">
      <PanelHeader
        icon={<Gpu className="h-4.5 w-4.5 text-white" />}
        title="Graphics"
        subtitle={`${gpu.brand} ${gpu.model}`}
        accent="purple"
        badge={
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white/60 ring-1 ring-white/10">
            Driver {gpu.driver}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-3">
          <RingMeter
            value={gpu.load}
            size={140}
            stroke={10}
            centerValue={
              <span className="bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">
                {formatPercent(gpu.load)}
              </span>
            }
            centerLabel="Load"
          />
          <div className="grid w-full grid-cols-3 gap-2">
            <Stat
              icon={<Thermometer className="h-3 w-3" />}
              value={formatTemp(gpu.temperature)}
              tone={gpu.temperature > 80 ? "hot" : gpu.temperature > 70 ? "warm" : "cool"}
            />
            <Stat
              icon={<Zap className="h-3 w-3" />}
              value={formatPower(gpu.power)}
              tone={powerPercent > 85 ? "hot" : powerPercent > 65 ? "warm" : "cool"}
            />
            <Stat
              icon={<Fan className="h-3 w-3" />}
              value={`${gpu.fanSpeed}%`}
              tone="cool"
            />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-white/60">VRAM</span>
              <span className="font-mono tabular-nums text-white">
                {formatMb(gpu.vramUsed)} / {formatMb(gpu.vramTotal)}
              </span>
            </div>
            <BarMeter value={vramPercent} height={10} />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-white/60">Power</span>
              <span className="font-mono tabular-nums text-white">
                {formatPower(gpu.power)} / {formatPower(gpu.powerLimit)}
              </span>
            </div>
            <BarMeter value={powerPercent} height={10} />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-white/50">
                Using GPU
              </span>
              <span className="text-[10px] text-white/40">
                {gpu.processes.length} processes
              </span>
            </div>
            <ul className="space-y-1.5">
              {gpu.processes.map((p, i) => (
                <motion.li
                  key={p.pid}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: 0.4,
                    delay: 0.05 * i,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 ring-1 ring-white/5"
                >
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.6)]" />
                  <span className="flex-1 truncate text-xs text-white/90">
                    {p.name}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-white/50">
                    PID {p.pid}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-white/70">
                    {formatMb(p.vram)}
                  </span>
                  <span
                    className={`min-w-[34px] text-right font-mono text-[10px] tabular-nums ${
                      p.usage > 70
                        ? "text-rose-300"
                        : p.usage > 40
                          ? "text-amber-300"
                          : "text-emerald-300"
                    }`}
                  >
                    {p.usage}%
                  </span>
                </motion.li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function Stat({
  icon,
  value,
  tone = "cool",
}: {
  icon: React.ReactNode;
  value: string;
  tone?: "cool" | "warm" | "hot";
}) {
  const tones = {
    cool: "from-white/5 to-white/[0.02] text-white/80 ring-white/10",
    warm: "from-amber-400/15 to-orange-500/10 text-amber-200 ring-amber-400/20",
    hot: "from-rose-500/20 to-red-500/10 text-rose-200 ring-rose-400/30",
  } as const;
  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg bg-gradient-to-b ${tones[tone]} px-2 py-1.5 ring-1`}
    >
      <span className="text-white/60">{icon}</span>
      <span className="text-xs font-medium tabular-nums text-white">
        {value}
      </span>
    </div>
  );
}
