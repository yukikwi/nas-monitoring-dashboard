"use client";

import { motion } from "framer-motion";
import {
  Cpu,
  MemoryStick,
  Container,
  HardDrive,
  Activity,
  Server,
} from "lucide-react";
import { useEffect, useState } from "react";
import { formatUptime } from "@/lib/format";

interface HeaderProps {
  hostname: string;
  os: string;
  kernel: string;
  uptime: number;
  runningContainers: number;
  totalContainers: number;
  cpu: number;
  memory: number;
  storage: number;
}

export function Header({
  hostname,
  os,
  kernel,
  uptime,
  runningContainers,
  totalContainers,
  cpu,
  memory,
  storage,
}: HeaderProps) {
  // Start with a stable placeholder so server and first client render
  // match exactly. The real time is filled in by the effect on mount.
  const [now, setNow] = useState<string>("--:--:--");

  useEffect(() => {
    setNow(formatTime(new Date()));
    const id = setInterval(() => setNow(formatTime(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-3xl border border-white/15 bg-white/[0.05] px-6 py-5 shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl backdrop-saturate-150"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"
      />
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/30 to-fuchsia-500/30 ring-1 ring-white/20">
            <Server className="h-5 w-5 text-white" />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0a0f24]">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
            </span>
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">
              {hostname}
            </h1>
            <p className="text-xs text-white/50">
              {os} · {kernel}
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
          <Pill icon={<Activity className="h-3.5 w-3.5" />} label="Uptime">
            {formatUptime(uptime)}
          </Pill>
          <Pill
            icon={<Cpu className="h-3.5 w-3.5" />}
            label="CPU"
            tone={cpu > 85 ? "hot" : cpu > 60 ? "warm" : "cool"}
          >
            {cpu.toFixed(0)}%
          </Pill>
          <Pill
            icon={<MemoryStick className="h-3.5 w-3.5" />}
            label="RAM"
            tone={memory > 85 ? "hot" : memory > 60 ? "warm" : "cool"}
          >
            {memory.toFixed(0)}%
          </Pill>
          <Pill
            icon={<HardDrive className="h-3.5 w-3.5" />}
            label="Disk"
            tone={storage > 85 ? "hot" : storage > 60 ? "warm" : "cool"}
          >
            {storage.toFixed(0)}%
          </Pill>
          <Pill icon={<Container className="h-3.5 w-3.5" />} label="Containers">
            {runningContainers}/{totalContainers}
          </Pill>
          <Pill label="Local" mono>
            {now}
          </Pill>
        </div>
      </div>
    </motion.header>
  );
}

function Pill({
  icon,
  label,
  children,
  tone = "cool",
  mono = false,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
  tone?: "cool" | "warm" | "hot";
  mono?: boolean;
}) {
  const toneClasses =
    tone === "hot"
      ? "from-rose-400/20 to-red-500/20 text-rose-200 ring-rose-400/30"
      : tone === "warm"
        ? "from-amber-400/20 to-orange-500/20 text-amber-200 ring-amber-400/30"
        : "from-white/10 to-white/5 text-white/90 ring-white/15";

  return (
    <div
      className={`flex items-center gap-2 rounded-full bg-gradient-to-b ${toneClasses} px-3 py-1.5 text-xs ring-1 backdrop-blur-md`}
    >
      {icon ? <span className="text-white/70">{icon}</span> : null}
      <span className="text-white/60">{label}</span>
      <span
        className={`${mono ? "font-mono tabular-nums" : "font-medium tabular-nums"} text-white`}
      >
        {children}
      </span>
    </div>
  );
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
