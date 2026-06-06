"use client";

import { motion } from "framer-motion";
import {
  Container,
  Boxes,
  Cpu,
  MemoryStick,
  Gpu,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { GlassCard } from "./GlassCard";
import { PanelHeader } from "./PanelHeader";
import { BarMeter } from "./BarMeter";
import { colorForStatus, formatMb, formatUptime } from "@/lib/format";
import type { DockerContainer, DockerService } from "@/types";

interface DockerPanelProps {
  docker: {
    running: number;
    stopped: number;
    total: number;
    containers: DockerContainer[];
    services: DockerService[];
  };
}

type Filter = "all" | "running" | "stopped" | "gpu";

export function DockerPanel({ docker }: DockerPanelProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return docker.containers.filter((c) => {
      if (filter === "running" && c.status !== "running") return false;
      if (filter === "stopped" && c.status === "running") return false;
      if (filter === "gpu" && !c.gpu) return false;
      if (
        query &&
        !c.name.toLowerCase().includes(query.toLowerCase()) &&
        !c.image.toLowerCase().includes(query.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [docker.containers, filter, query]);

  return (
    <GlassCard className="h-full">
      <PanelHeader
        icon={<Container className="h-4.5 w-4.5 text-white" />}
        title="Docker"
        subtitle={`${docker.running} running · ${docker.stopped} stopped · ${docker.services.length} services`}
        accent="emerald"
        badge={
          <div className="flex items-center gap-1.5">
            <Dot tone="running" />
            <span className="font-mono text-[10px] tabular-nums text-white/70">
              {docker.running}
            </span>
            <Dot tone="stopped" />
            <span className="font-mono text-[10px] tabular-nums text-white/70">
              {docker.stopped}
            </span>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl bg-white/[0.04] p-0.5 ring-1 ring-white/5">
          {(
            [
              { key: "all", label: "All" },
              { key: "running", label: "Running" },
              { key: "stopped", label: "Stopped" },
              { key: "gpu", label: "GPU" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`relative rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filter === f.key
                  ? "text-white"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              {filter === f.key ? (
                <motion.span
                  layoutId="filter-pill"
                  className="absolute inset-0 -z-0 rounded-lg bg-gradient-to-b from-white/15 to-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              ) : null}
              <span className="relative z-10">{f.label}</span>
            </button>
          ))}
        </div>

        <div className="relative ml-auto flex-1 sm:max-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter…"
            className="w-full rounded-xl bg-white/[0.04] py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-white/30 ring-1 ring-white/5 outline-none transition focus:bg-white/[0.08] focus:ring-white/15"
          />
        </div>
      </div>

      <div className="max-h-[460px] space-y-1.5 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10">
        {filtered.length === 0 ? (
          <div className="rounded-xl bg-white/[0.03] p-6 text-center text-xs text-white/40 ring-1 ring-white/5">
            No containers match.
          </div>
        ) : null}
        {filtered.map((c, i) => (
          <motion.div
            key={c.id}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.35,
              delay: 0.02 * i,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-white/5 transition-colors hover:bg-white/[0.06]"
          >
            <div className="flex items-start gap-2">
              <div className="relative mt-1">
                <span
                  className={`block h-2 w-2 rounded-full ${colorForStatus(c.status)}`}
                />
                {c.status === "running" ? (
                  <span
                    className={`absolute inset-0 animate-ping rounded-full ${colorForStatus(c.status)} opacity-60`}
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-white">
                    {c.name}
                  </span>
                  {c.gpu ? (
                    <span
                      title="Using GPU"
                      className="flex items-center gap-0.5 rounded-md bg-fuchsia-400/10 px-1.5 py-0.5 text-[9px] font-medium text-fuchsia-300 ring-1 ring-fuchsia-400/20"
                    >
                      <Gpu className="h-2.5 w-2.5" />
                      GPU
                    </span>
                  ) : null}
                  <StatusPill status={c.status} />
                  <span className="ml-auto font-mono text-[10px] tabular-nums text-white/40">
                    {formatUptime(c.uptime)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 truncate text-[10px] text-white/40">
                  <span className="truncate font-mono">{c.image}</span>
                  <span className="text-white/20">·</span>
                  <span className="truncate font-mono">{c.ports}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <MeterLine
                    icon={<Cpu className="h-2.5 w-2.5" />}
                    label="CPU"
                    value={c.cpu}
                  />
                  <MeterLine
                    icon={<MemoryStick className="h-2.5 w-2.5" />}
                    label="MEM"
                    value={c.memory}
                    right={`${formatMb(c.memoryMb)}`}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {docker.services.length > 0 ? (
        <div className="mt-4 border-t border-white/5 pt-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50">
            <Boxes className="h-3 w-3" />
            Stacks
          </div>
          <div className="flex flex-wrap gap-1.5">
            {docker.services.map((s) => (
              <div
                key={s.name}
                className="flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 ring-1 ring-white/5"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${colorForStatus(s.status)}`}
                />
                <span className="text-[11px] font-medium text-white/90">
                  {s.name}
                </span>
                <span className="text-[10px] text-white/40">{s.replicas}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </GlassCard>
  );
}

function StatusPill({ status }: { status: DockerContainer["status"] }) {
  const map: Record<DockerContainer["status"], string> = {
    running: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20",
    stopped: "bg-rose-400/10 text-rose-300 ring-rose-400/20",
    exited: "bg-rose-400/10 text-rose-300 ring-rose-400/20",
    restarting: "bg-amber-400/10 text-amber-300 ring-amber-400/20",
  };
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ring-1 ${map[status]}`}
    >
      {status}
    </span>
  );
}

function MeterLine({
  icon,
  label,
  value,
  right,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  right?: string;
}) {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-[9px] text-white/50">
        <span className="flex items-center gap-1">
          {icon}
          {label}
        </span>
        <span className="font-mono tabular-nums">
          {value.toFixed(1)}%{right ? ` · ${right}` : ""}
        </span>
      </div>
      <BarMeter value={value} height={3} showShimmer={false} />
    </div>
  );
}

function Dot({ tone }: { tone: "running" | "stopped" }) {
  return (
    <span
      className={`h-1.5 w-1.5 rounded-full ${
        tone === "running" ? "bg-emerald-400" : "bg-rose-400"
      }`}
    />
  );
}
