"use client";

import { motion } from "framer-motion";
import { MemoryStick, Database } from "lucide-react";
import { GlassCard } from "./GlassCard";
import { PanelHeader } from "./PanelHeader";
import { RingMeter } from "./RingMeter";
import { BarMeter } from "./BarMeter";
import { formatGb, formatPercent } from "@/lib/format";
import type { MemoryInfo } from "@/types";

interface MemoryPanelProps {
  memory: MemoryInfo;
}

export function MemoryPanel({ memory }: MemoryPanelProps) {
  // Guard against `0/0` from the pre-SSE empty snapshot (see GpuPanel
  // for the same pattern). Without this, the ring meter renders "NaN%"
  // and Framer Motion logs a noisy "value not animatable" warning.
  const ramPercent =
    memory.ramTotal > 0 ? (memory.ramUsed / memory.ramTotal) * 100 : 0;
  const swapPercent =
    memory.swapTotal > 0 ? (memory.swapUsed / memory.swapTotal) * 100 : 0;
  const available = Math.max(0, memory.ramTotal - memory.ramUsed);

  return (
    <GlassCard className="h-full">
      <PanelHeader
        icon={<MemoryStick className="h-4.5 w-4.5 text-white" />}
        title="Memory"
        subtitle={`${formatGb(memory.ramTotal)} DDR5 · ${formatGb(memory.swapTotal)} swap`}
        accent="cyan"
        badge={
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white/60 ring-1 ring-white/10">
            Pressure {memory.pressure}%
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-3">
          <RingMeter
            value={ramPercent}
            size={148}
            stroke={11}
            centerValue={
              <span className="bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">
                {formatPercent(ramPercent)}
              </span>
            }
            centerLabel="RAM"
            label={`${formatGb(available)} free`}
          />
          <div className="grid w-full grid-cols-2 gap-2">
            <MiniStat label="Cached" value={formatGb(memory.ramCached)} />
            <MiniStat label="Buffers" value={formatGb(memory.ramBuffers)} />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-white/60">RAM</span>
              <span className="font-mono tabular-nums text-white">
                {formatGb(memory.ramUsed)} / {formatGb(memory.ramTotal)}
              </span>
            </div>
            <div className="relative h-3 overflow-hidden rounded-full bg-white/[0.08]">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                initial={{ width: 0 }}
                animate={{ width: `${ramPercent}%` }}
                transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
                style={{ boxShadow: "0 0 14px rgba(34,211,238,0.45)" }}
              />
              {/* cached overlay */}
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-white/30 mix-blend-overlay"
                initial={{ width: 0 }}
                animate={{
                  width: `${
                    memory.ramTotal > 0
                      ? (memory.ramCached / memory.ramTotal) * 100
                      : 0
                  }%`,
                }}
                transition={{ duration: 1.0, delay: 0.2 }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-white/40">
              <span>used {formatGb(memory.ramUsed)}</span>
              <span>cached {formatGb(memory.ramCached)}</span>
              <span>free {formatGb(available)}</span>
            </div>
          </div>

          <div className="rounded-2xl bg-white/[0.03] p-3 ring-1 ring-white/5">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-white/60">
                <Database className="h-3.5 w-3.5" />
                <span>Swap</span>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-white/70">
                {formatGb(memory.swapUsed)} / {formatGb(memory.swapTotal)}
              </span>
            </div>
            <BarMeter value={swapPercent} height={8} />
            <div className="mt-1.5 text-right text-[10px] text-white/40">
              {formatPercent(swapPercent)} used
            </div>
          </div>

          <div className="rounded-2xl bg-white/[0.03] p-3 ring-1 ring-white/5">
            <div className="text-[10px] uppercase tracking-wider text-white/40">
              Memory pressure
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums text-white">
                {memory.pressure}
              </span>
              <span className="text-xs text-white/50">/ 100</span>
            </div>
            <div className="mt-2 flex gap-1">
              {Array.from({ length: 20 }).map((_, i) => {
                const filled = (i / 20) * 100 < memory.pressure;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scaleY: 0.4 }}
                    animate={{ opacity: 1, scaleY: 1 }}
                    transition={{ delay: i * 0.02, duration: 0.3 }}
                    className={`h-3 flex-1 rounded-sm ${
                      filled
                        ? "bg-gradient-to-b from-cyan-300 to-blue-500"
                        : "bg-white/5"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-2.5 py-1.5 ring-1 ring-white/5">
      <div className="text-[9px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className="text-xs font-medium tabular-nums text-white">{value}</div>
    </div>
  );
}
