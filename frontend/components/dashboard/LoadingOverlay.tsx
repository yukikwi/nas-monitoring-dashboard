"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface LoadingOverlayProps {
  /**
   * When `true`, the overlay is shown. When it flips to `false`, the
   * overlay fades + scales + blurs out over `EXIT_MS`, after which it
   * unmounts its inner 3D content so it stops intercepting events and
   * the dashboard is fully interactive.
   */
  visible: boolean;
}

/** How long the exit animation runs. */
const EXIT_MS = 800;

/**
 * Minimum time the overlay stays visible, even if the underlying data
 * arrives sooner. Prevents the loader from flashing on a fast network
 * where SSE delivers the first event in well under a second — the user
 * gets a deliberate, branded "loading" beat before the dashboard
 * reveals itself.
 */
const MIN_VISIBLE_MS = 3000;

/**
 * Full-screen 3D loading overlay shown while the dashboard waits for the
 * first batch of SSE events.
 *
 * Implementation notes:
 *   - The outer shell is *always* mounted so we can animate the exit
 *     transition (Framer Motion's `AnimatePresence` doesn't reliably
 *     render its children during Next.js SSR, which would leave a
 *     blank first paint). The expensive 3D content inside is unmounted
 *     once the fade completes.
 *   - Lifecycle has two independent gates:
 *       1. `minTimeElapsed` — at least `MIN_VISIBLE_MS` since mount.
 *          Held in state so React re-renders the overlay when it flips.
 *       2. `fullyHidden` — at least `EXIT_MS` after the exit transition
 *          started. Controls whether the 3D subtree is mounted.
 *     The overlay can only begin exiting when `visible === false` AND
 *     `minTimeElapsed` is true. Whichever is later wins.
 *   - The 3D visual is a solar system rendered in pure CSS 3D
 *     (perspective + transform-style: preserve-3d + rotateX/rotateZ).
 *     No WebGL / Three.js dependency, no extra bundle weight.
 *   - Starfield + nebula glow are deterministic so SSR and the first
 *     client render produce identical markup (no hydration mismatch).
 */
export function LoadingOverlay({ visible }: LoadingOverlayProps) {
  // 1) Minimum-time gate. Starts a timer on mount; once it fires, the
  //    overlay is allowed to start exiting (subject to `visible`).
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinTimeElapsed(true), MIN_VISIBLE_MS);
    return () => clearTimeout(t);
  }, []);

  // 2) Exit-time gate. The overlay is exiting only when the parent
  //    says data is ready AND the minimum time has passed.
  const exiting = !visible && minTimeElapsed;

  // 3) After the exit animation completes, drop the 3D subtree from
  //    the DOM so the (now-invisible) overlay stops doing any work.
  const [fullyHidden, setFullyHidden] = useState(false);
  useEffect(() => {
    if (!exiting) {
      setFullyHidden(false);
      return;
    }
    const t = setTimeout(() => setFullyHidden(true), EXIT_MS);
    return () => clearTimeout(t);
  }, [exiting]);

  return (
    <motion.div
      initial={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      animate={
        exiting
          ? { opacity: 0, scale: 1.04, filter: "blur(10px)" }
          : { opacity: 1, scale: 1, filter: "blur(0px)" }
      }
      transition={{ duration: EXIT_MS / 1000, ease: [0.22, 1, 0.36, 1] }}
      aria-hidden={exiting}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        pointerEvents: exiting ? "none" : "auto",
        background:
          "radial-gradient(ellipse at center, rgba(10,15,36,0.78) 0%, rgba(5,8,22,0.96) 100%)",
        backdropFilter: "blur(24px) saturate(140%)",
        WebkitBackdropFilter: "blur(24px) saturate(140%)",
      }}
    >
      {fullyHidden ? null : (
        <div className="flex flex-col items-center gap-10">
          <SolarSystem3D />
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: exiting ? 0 : 1, y: exiting ? -6 : 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center gap-3 text-center"
          >
            <h2 className="text-[11px] font-medium uppercase tracking-[0.4em] text-white/70">
              Initializing live telemetry
            </h2>
            <p className="text-xs text-white/40">Connecting to the server…</p>
            {/* Thin progress bar that fills over MIN_VISIBLE_MS — gives
                the user a visible signal that the wait is intentional
                and progressing, not stuck. */}
            <ProgressBar />
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

/**
 * A 0 → 100% progress bar synced to `MIN_VISIBLE_MS`. It's purely
 * cosmetic — the gate is enforced by `minTimeElapsed` regardless of
 * what this bar visually shows — but it makes the minimum wait feel
 * intentional rather than frozen.
 */
function ProgressBar() {
  return (
    <div
      className="mt-2 h-px w-40 overflow-hidden rounded-full bg-white/10"
      role="progressbar"
    >
      <motion.div
        className="h-full bg-gradient-to-r from-blue-400/80 via-fuchsia-400/80 to-cyan-400/80"
        initial={{ width: "0%" }}
        animate={{ width: "100%" }}
        transition={{ duration: MIN_VISIBLE_MS / 1000, ease: "linear" }}
        style={{
          boxShadow: "0 0 8px rgba(168,85,247,0.6)",
        }}
      />
    </div>
  );
}

/**
 * CSS 3D solar system loader.
 *
 *  - A central pulsing sun (yellow-orange gradient + breathing corona)
 *  - Five planets on tilted orbital rings, each rotating at its own
 *    speed, sized to fit inside the 320px container
 *  - The outermost planet is a ringed "Saturn" (fuchsia, matches the
 *    dashboard's accent)
 *  - A starfield of 40 deterministic positions with a few twinkling
 *    stars for ambient motion
 *
 * Geometry:
 *   - Each orbit is a 2D circle inside a parent that has
 *     `transform: rotateX(tilt)`. The CSS perspective on the outer
 *     container makes the tilted circle project as an ellipse.
 *   - A child `motion.div` then applies a continuous `rotateZ` to
 *     rotate the planet around the orbit's center. Because the parent
 *     is tilted in 3D, the planet traces the elliptical projection
 *     we see on screen.
 */
function SolarSystem3D() {
  return (
    <div
      className="relative h-72 w-72 sm:h-80 sm:w-80"
      style={{ perspective: 1400 }}
    >
      <StarField />
      <NebulaGlow />
      <Sun />

      <Orbit radius={48} speed={6} tilt={0} planetSize={4} color="#94a3b8" />
      <Orbit radius={72} speed={10} tilt={12} planetSize={6} color="#fbbf24" />
      <Orbit radius={96} speed={14} tilt={-10} planetSize={7} color="#60a5fa" />
      <Orbit
        radius={120}
        speed={20}
        tilt={18}
        planetSize={5}
        color="#fb7185"
      />
      <Orbit
        radius={144}
        speed={32}
        tilt={-15}
        planetSize={9}
        color="#c084fc"
        hasRing
      />
    </div>
  );
}

/**
 * 40 stars with deterministic positions so SSR and the first client
 * render produce the same markup. ~10% of them twinkle independently.
 */
function StarField() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {STARS.map((s, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            opacity: 0.55,
            boxShadow: s.bright ? "0 0 4px rgba(255,255,255,0.6)" : "none",
          }}
        >
          {s.twinkle ? (
            <motion.div
              className="h-full w-full rounded-full bg-white"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{
                duration: s.twinkleDuration,
                repeat: Infinity,
                delay: s.twinkleDelay,
                ease: "easeInOut",
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Soft warm halo behind the sun. Gives the system a sense of being
 * inside a glowing nebula rather than against a flat backdrop.
 */
function NebulaGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "radial-gradient(circle at 50% 50%, rgba(251,191,36,0.18) 0%, rgba(168,85,247,0.08) 35%, transparent 60%)",
      }}
    />
  );
}

/**
 * The sun: a small white-hot core inside a yellow/orange disc, with
 * a soft corona that breathes every 4 seconds. Sized smaller than
 * any planet's orbit radius so the planets clearly orbit *around* it.
 */
function Sun() {
  return (
    <div
      className="absolute left-1/2 top-1/2"
      style={{
        width: 36,
        height: 36,
        marginLeft: -18,
        marginTop: -18,
        transformStyle: "preserve-3d",
      }}
    >
      {/* Soft outer corona — large and slow */}
      <motion.div
        className="absolute inset-0 -m-10 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(251,191,36,0.45) 0%, rgba(251,191,36,0.15) 35%, transparent 70%)",
          filter: "blur(6px)",
        }}
        animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Sun body — brighter, slightly faster breathing */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle, #fffbeb 0%, #fde68a 35%, #f59e0b 80%, #d97706 100%)",
          boxShadow:
            "0 0 24px rgba(251,191,36,0.85), 0 0 60px rgba(251,191,36,0.4)",
        }}
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

interface OrbitProps {
  /** Distance from the sun, in px. */
  radius: number;
  /** Seconds for one full revolution. Slower = farther (Kepler-ish). */
  speed: number;
  /** Tilt of the orbital plane in degrees, around the X axis. */
  tilt: number;
  /** Planet diameter in px. */
  planetSize: number;
  /** Planet color (used for the orbit ring, planet body, and ring). */
  color: string;
  /** Whether to render a Saturn-style ring around the planet. */
  hasRing?: boolean;
}

/**
 * One orbital plane. The geometry:
 *   - The container is full size and has `transform: rotateX(tilt)`,
 *     so its 2D children appear in a tilted 3D plane.
 *   - The orbit ring is a 2D circle (border-radius: 50%) sized to
 *     `2 * radius`, centered. In 3D it projects as an ellipse — the
 *     visual guide for the planet's path.
 *   - The planet lives in a child `motion.div` that continuously
 *     rotates `rotateZ`. The planet itself is at `translateX(radius)`
 *     so it sits exactly on the ring. Because both share the parent's
 *     tilt, the planet's circular orbit projects as the same ellipse
 *     as the ring.
 */
function Orbit({
  radius,
  speed,
  tilt,
  planetSize,
  color,
  hasRing,
}: OrbitProps) {
  return (
    <div
      className="absolute inset-0"
      style={{
        transformStyle: "preserve-3d",
        transform: `rotateX(${tilt}deg)`,
      }}
    >
      {/* Orbit ring — a faint guide that hints at the path. The radial
          gradient on the border fades the "back" half of the ring so
          the ring feels like a 3D loop rather than a flat oval. */}
      <div
        className="absolute left-1/2 top-1/2 rounded-full"
        style={{
          width: radius * 2,
          height: radius * 2,
          marginLeft: -radius,
          marginTop: -radius,
          transformStyle: "preserve-3d",
          // A double-layer background: a faint full ring, plus a
          // soft inner halo to suggest depth.
          background: `radial-gradient(circle, transparent 0%, transparent 96%, ${color}26 100%)`,
          boxShadow: `0 0 0 1px ${color}33 inset`,
        }}
      />

      {/* Planet carrier — rotates the planet around the orbit's center */}
      <motion.div
        className="absolute inset-0"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateZ: 360 }}
        transition={{ duration: speed, repeat: Infinity, ease: "linear" }}
      >
        <div
          className="absolute"
          style={{
            left: "50%",
            top: "50%",
            width: planetSize,
            height: planetSize,
            marginLeft: -planetSize / 2,
            marginTop: -planetSize / 2,
            transform: `translateX(${radius}px)`,
            transformStyle: "preserve-3d",
          }}
        >
          <Planet
            size={planetSize}
            color={color}
            speed={speed}
            hasRing={hasRing}
          />
        </div>
      </motion.div>
    </div>
  );
}

interface PlanetProps {
  size: number;
  color: string;
  /** Orbit speed — used to scale the planet's own self-rotation. */
  speed: number;
  hasRing?: boolean;
}

/**
 * A planet: a small sphere with a 3D-shaded surface (radial gradient +
 * inset shadow for the dark side) that spins on its own Y axis.
 * If `hasRing` is true, a tilted flat ring sits around the planet
 * to evoke Saturn.
 */
function Planet({ size, color, speed, hasRing }: PlanetProps) {
  return (
    <div
      className="relative"
      style={{
        width: size,
        height: size,
        transformStyle: "preserve-3d",
      }}
    >
      {/* Saturn-style ring sits behind the planet on the Z axis. Drawn
          as a flat 2D circle rotated 75° around X — the perspective
          on the solar system container turns it into a tilted ring. */}
      {hasRing ? (
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width: size * 2.6,
            height: size * 2.6,
            marginLeft: -size * 1.3,
            marginTop: -size * 1.3,
            transform: "rotateX(75deg)",
            transformStyle: "preserve-3d",
          }}
        >
          <div
            className="h-full w-full rounded-full"
            style={{
              border: `1px solid ${color}cc`,
              background: `linear-gradient(180deg, transparent 47%, ${color}88 50%, transparent 53%)`,
              boxShadow: `0 0 ${size}px ${color}55, inset 0 0 ${size / 2}px ${color}33`,
            }}
          />
        </div>
      ) : null}

      {/* The planet body. The radial gradient + inset shadow make it
          read as a 3D sphere; the Y-rotation makes the lit/dark
          hemisphere sweep around to suggest self-rotation. */}
      <motion.div
        className="h-full w-full rounded-full"
        style={{
          background: `radial-gradient(circle at 30% 30%, #fff 0%, ${color} 60%, ${shade(
            color,
            -0.4,
          )} 100%)`,
          boxShadow: `0 0 ${size}px ${color}88, inset -${size / 3}px -${size / 3}px ${size / 2}px rgba(0,0,0,0.5)`,
          transformStyle: "preserve-3d",
        }}
        animate={{ rotateY: 360 }}
        transition={{
          duration: Math.max(1.5, speed / 3),
          repeat: Infinity,
          ease: "linear",
        }}
      />
    </div>
  );
}

/**
 * Deterministic 40-star starfield. Positions are derived from a
 * simple LCG so they don't shift between SSR and the first client
 * render (which `Math.random()` would cause).
 */
const STARS: ReadonlyArray<{
  x: number;
  y: number;
  size: number;
  bright: boolean;
  twinkle: boolean;
  twinkleDuration: number;
  twinkleDelay: number;
}> = (() => {
  // Linear congruential generator — keeps stars stable across renders.
  let s = 0x1a2b3c4d;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  return Array.from({ length: 40 }, () => {
    const size = 0.5 + rand() * 1.8;
    const twinkle = rand() < 0.25;
    return {
      x: rand() * 100,
      y: rand() * 100,
      size,
      bright: size > 1.6,
      twinkle,
      twinkleDuration: 1.8 + rand() * 2.4,
      twinkleDelay: rand() * 3,
    };
  });
})();

/**
 * Darken or lighten a hex color by `amount` (range -1..1). Used to
 * give each planet a darker "terminator" color for the 3D sphere
 * shading without having to hand-tune every planet.
 */
function shade(hex: string, amount: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const f = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c + 255 * amount)));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}
