"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { type ReactNode } from "react";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  children: ReactNode;
  /** Remove the default padding so callers can control it. */
  flush?: boolean;
  /** A subtle inner highlight to emphasize the top edge of the glass. */
  highlight?: boolean;
}

export function GlassCard({
  children,
  className = "",
  flush = false,
  highlight = true,
  ...rest
}: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={[
        "relative overflow-hidden rounded-3xl",
        "border border-white/15",
        "bg-white/[0.06]",
        "shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)]",
        "backdrop-blur-2xl backdrop-saturate-150",
        flush ? "" : "p-5",
        className,
      ].join(" ")}
      {...rest}
    >
      {highlight ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"
        />
      ) : null}
      {children}
    </motion.div>
  );
}
