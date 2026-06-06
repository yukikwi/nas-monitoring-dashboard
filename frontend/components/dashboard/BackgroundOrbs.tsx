"use client";

import { motion } from "framer-motion";

export function BackgroundOrbs() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Deep base */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.18),transparent_60%),radial-gradient(ellipse_at_bottom,rgba(168,85,247,0.18),transparent_60%),linear-gradient(180deg,#050816_0%,#0a0f24_50%,#050816_100%)]" />

      <motion.div
        className="absolute -top-40 -left-40 h-[480px] w-[480px] rounded-full bg-blue-500/30 blur-3xl"
        animate={{
          x: [0, 80, -40, 0],
          y: [0, 40, -20, 0],
        }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/3 -right-40 h-[520px] w-[520px] rounded-full bg-fuchsia-500/25 blur-3xl"
        animate={{
          x: [0, -60, 30, 0],
          y: [0, 30, -40, 0],
        }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-40 left-1/3 h-[560px] w-[560px] rounded-full bg-cyan-500/20 blur-3xl"
        animate={{
          x: [0, 40, -80, 0],
          y: [0, -30, 20, 0],
        }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Subtle noise / grain overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />
    </div>
  );
}
