"use client";

import { motion } from "framer-motion";
import { colorForUsage } from "@/lib/format";

interface RingMeterProps {
  value: number; // 0-100
  size?: number; // px
  stroke?: number; // px
  trackColor?: string;
  label?: React.ReactNode;
  centerLabel?: React.ReactNode;
  centerValue?: React.ReactNode;
  showGradient?: boolean;
}

export function RingMeter({
  value,
  size = 160,
  stroke = 12,
  trackColor = "rgba(255,255,255,0.08)",
  label,
  centerLabel,
  centerValue,
  showGradient = true,
}: RingMeterProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;
  const gradientId = `ring-gradient-${Math.round(value)}-${size}`;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop
              offset="0%"
              stopColor={
                showGradient
                  ? colorForUsage(clamped).includes("emerald")
                    ? "#34d399"
                    : colorForUsage(clamped).includes("amber")
                      ? "#fbbf24"
                      : "#fb7185"
                  : "#60a5fa"
              }
            />
            <stop
              offset="100%"
              stopColor={
                showGradient
                  ? colorForUsage(clamped).includes("emerald")
                    ? "#22d3ee"
                    : colorForUsage(clamped).includes("amber")
                      ? "#fb923c"
                      : "#f43f5e"
                  : "#a78bfa"
              }
            />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="transparent"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="transparent"
          strokeDasharray={circumference}
          // `initial={false}` skips the "from zero" entry animation. Without
          // it, Framer Motion re-applies the `initial` value on every render,
          // so the ring would reset to 0% each time `value` changes and spend
          // the full transition duration re-animating. With a 1Hz SSE feed
          // and a 1.2s transition, the ring would always look near-empty.
          initial={false}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: "drop-shadow(0 0 6px rgba(96,165,250,0.35))" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {centerValue ? (
          <div className="text-3xl font-semibold tabular-nums text-white">
            {centerValue}
          </div>
        ) : null}
        {centerLabel ? (
          <div className="mt-0.5 text-xs uppercase tracking-wider text-white/50">
            {centerLabel}
          </div>
        ) : null}
        {label ? <div className="mt-1 text-sm text-white/70">{label}</div> : null}
      </div>
    </div>
  );
}
