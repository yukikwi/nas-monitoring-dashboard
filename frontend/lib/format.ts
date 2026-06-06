export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1,
  );
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function formatGb(gb: number, decimals = 1): string {
  if (gb >= 1024) return `${(gb / 1024).toFixed(decimals)} TB`;
  return `${gb.toFixed(decimals)} GB`;
}

export function formatMb(mb: number, decimals = 0): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(decimals)} MB`;
}

export function formatUptime(seconds: number): string {
  if (seconds <= 0) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatPercent(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatTemp(celsius: number): string {
  return `${celsius.toFixed(0)}°C`;
}

export function formatPower(watts: number): string {
  return `${watts.toFixed(0)} W`;
}

export function formatSpeed(mbPerSec: number): string {
  if (mbPerSec >= 1024) return `${(mbPerSec / 1024).toFixed(2)} GB/s`;
  return `${mbPerSec.toFixed(1)} MB/s`;
}

export function colorForUsage(usage: number): string {
  // 0-60 cool, 60-85 warm, 85+ hot
  if (usage < 60) return "from-emerald-400 to-cyan-400";
  if (usage < 85) return "from-amber-400 to-orange-400";
  return "from-rose-500 to-red-500";
}

export function colorForHealth(
  health: "good" | "warning" | "critical",
): string {
  if (health === "good") return "text-emerald-400";
  if (health === "warning") return "text-amber-400";
  return "text-rose-400";
}

export function colorForStatus(
  status: "running" | "stopped" | "restarting" | "exited",
): string {
  if (status === "running") return "bg-emerald-400";
  if (status === "restarting") return "bg-amber-400";
  return "bg-rose-400";
}
