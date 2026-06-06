"use client";

import { motion } from "framer-motion";
import { colorForUsage } from "@/lib/format";

interface BarMeterProps {
  value: number; // 0-100
  className?: string;
  height?: number; // px
  showShimmer?: boolean;
}

export function BarMeter({
  value,
  className = "",
  height = 8,
  showShimmer = true,
}: BarMeterProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const gradient = colorForUsage(clamped);

  return (
    <div
      className={[
        "relative w-full overflow-hidden rounded-full bg-white/[0.08]",
        className,
      ].join(" ")}
      style={{ height }}
    >
      <motion.div
        className={`h-full rounded-full bg-gradient-to-r ${gradient}`}
        // See RingMeter — `initial={false}` stops the bar from resetting to
        // 0% on every SSE update. The bar still animates between values.
        initial={false}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{
          boxShadow: "0 0 12px rgba(96,165,250,0.35)",
        }}
      >
        {showShimmer ? (
          <motion.div
            className="h-full w-full bg-gradient-to-r from-transparent via-white/40 to-transparent"
            animate={{ x: ["-100%", "100%"], opacity: [0, 1, 0] }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: "linear",
            }}
            style={{ mixBlendMode: "overlay" }}
          />
        ) : null}
      </motion.div>
    </div>
  );
}
