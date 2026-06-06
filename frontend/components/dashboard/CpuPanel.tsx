"use client";

import { motion } from "framer-motion";
import { Cpu, Thermometer, Zap } from "lucide-react";
import { GlassCard } from "./GlassCard";
import { PanelHeader } from "./PanelHeader";
import { RingMeter } from "./RingMeter";
import { BarMeter } from "./BarMeter";
import { colorForUsage, formatPercent, formatPower, formatTemp } from "@/lib/format";
import type { CpuInfo } from "@/types";

interface CpuPanelProps {
  cpu: CpuInfo;
}

export function CpuPanel({ cpu }: CpuPanelProps) {
  return (
    <GlassCard className="h-full">
      <PanelHeader
        icon={<Cpu className="h-4.5 w-4.5 text-white" />}
        title="Processor"
        subtitle={`${cpu.brand} ${cpu.model} · ${cpu.physicalCores}C/${cpu.logicalCores}T`}
        accent="blue"
        badge={
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white/60 ring-1 ring-white/10">
            {cpu.architecture}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-3">
          <RingMeter
            value={cpu.overall}
            size={168}
            stroke={12}
            centerValue={
              <span className="bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">
                {formatPercent(cpu.overall)}
              </span>
            }
            centerLabel="Overall"
            label={`${cpu.baseFrequency.toFixed(1)} GHz base`}
          />
          <div className="flex w-full justify-between gap-2">
            <StatChip
              icon={<Thermometer className="h-3.5 w-3.5" />}
              label="Temp"
              value={formatTemp(cpu.temperature)}
              tone={cpu.temperature > 80 ? "hot" : cpu.temperature > 65 ? "warm" : "cool"}
            />
            <StatChip
              icon={<Zap className="h-3.5 w-3.5" />}
              label="Power"
              value={formatPower(cpu.power)}
              tone="cool"
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-white/50">
            <span className="uppercase tracking-wider">Cores</span>
            <span className="font-mono tabular-nums">
              avg {formatPercent(cpu.overall)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4">
            {cpu.cores.map((core, i) => (
              <motion.div
                key={core.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.4,
                  delay: 0.04 * i,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="rounded-xl bg-white/[0.04] p-2.5 ring-1 ring-white/5"
              >
                <div className="mb-1.5 flex items-center justify-between text-[10px]">
                  <span className="font-medium text-white/60">
                    C{core.id.toString().padStart(2, "0")}
                  </span>
                  <span className="font-mono tabular-nums text-white/80">
                    {formatPercent(core.usage)}
                  </span>
                </div>
                <BarMeter value={core.usage} height={5} showShimmer={false} />
                <div className="mt-1 flex items-center justify-between text-[9px] text-white/40 tabular-nums">
                  <span>{core.frequency.toFixed(1)} GHz</span>
                  <span>{core.temperature}°</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function StatChip({
  icon,
  label,
  value,
  tone = "cool",
}: {
  icon: React.ReactNode;
  label: string;
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
      className={`flex flex-1 items-center gap-2 rounded-xl bg-gradient-to-b ${tones[tone]} px-3 py-2 ring-1`}
    >
      <div className="text-white/60">{icon}</div>
      <div className="leading-tight">
        <div className="text-[9px] uppercase tracking-wider text-white/40">
          {label}
        </div>
        <div className="text-sm font-medium tabular-nums text-white">
          {value}
        </div>
      </div>
    </div>
  );
}
