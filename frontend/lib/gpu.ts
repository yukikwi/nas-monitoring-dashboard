import type { GpuInfo } from "@/types";

/**
 * Returns true when the GPU panel has something meaningful to show.
 *
 * The GpuPanel is designed for a discrete NVIDIA-style card: dedicated
 * VRAM, utilization, temperature, power, and a per-process breakdown. It
 * would be misleading on:
 *
 *   - the explicit "no-gpu-detected" signal the backend returns when
 *     neither `nvidia-smi` nor `system_profiler` could find a GPU, or
 *   - Apple Silicon, where the chip exists but reports `vramTotal: 0`
 *     (unified memory) and exposes no live stats without `sudo
 *     powermetrics`.
 *
 * `vramTotal > 0` is the strongest signal of a discrete GPU — both NVIDIA
 * and AMD discrete cards report a real VRAM size, and we want an idle
 * discrete card to keep its panel visible so the user can see it light up.
 */
export function hasGpuData(gpu: GpuInfo): boolean {
  if (gpu.brand === "unknown" || gpu.model === "no-gpu-detected") return false;
  if (gpu.vramTotal > 0) return true;
  return (
    gpu.load > 0 ||
    gpu.temperature > 0 ||
    gpu.power > 0 ||
    gpu.fanSpeed > 0 ||
    gpu.processes.length > 0
  );
}
