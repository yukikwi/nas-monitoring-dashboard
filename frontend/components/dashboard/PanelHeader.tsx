"use client";

import { motion } from "framer-motion";
import { type ReactNode } from "react";

interface PanelHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  accent?: "blue" | "purple" | "cyan" | "amber" | "rose" | "emerald";
}

const accentMap: Record<NonNullable<PanelHeaderProps["accent"]>, string> = {
  blue: "from-blue-400/30 to-cyan-400/30 text-blue-200",
  purple: "from-purple-400/30 to-fuchsia-400/30 text-purple-200",
  cyan: "from-cyan-400/30 to-teal-400/30 text-cyan-200",
  amber: "from-amber-400/30 to-orange-400/30 text-amber-200",
  rose: "from-rose-400/30 to-pink-400/30 text-rose-200",
  emerald: "from-emerald-400/30 to-teal-400/30 text-emerald-200",
};

export function PanelHeader({
  icon,
  title,
  subtitle,
  badge,
  accent = "blue",
}: PanelHeaderProps) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${accentMap[accent]} ring-1 ring-white/20`}
        >
          {icon}
        </motion.div>
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-white">
            {title}
          </h2>
          {subtitle ? (
            <p className="text-xs text-white/50">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {badge}
    </div>
  );
}
