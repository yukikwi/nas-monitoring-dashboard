import type { DiskInfo, StorageInfo } from "../types";
import { isLinux, isMac, readFile, run, tryRun } from "./platform";

// ---------------------------------------------------------------------------
// Disk I/O tracking — needs a delta between two samples.
// We keep the previous sample here and compute MB/s on each collect() call.
// ---------------------------------------------------------------------------

interface IoDelta {
  readSectors: number; // 512-byte sectors read
  writeSectors: number;
  readMb: number; // MB/s since the previous sample
  writeMb: number;
}

let prevIoSample: Map<string, { read: number; write: number; at: number }> = new Map();

async function readIoMac(): Promise<Map<string, { read: number; write: number; at: number }>> {
  // `iostat -d -K` prints KB/t, tps, MB/s — but for *current* throughput, not
  // cumulative. Run it for 1s and the MB/s column IS what we want. We just
  // need to map the device name back to a mount point.
  const out = await tryRun(["iostat", "-d", "-K", "1", "2"], { timeoutMs: 3_000 });
  if (!out) return new Map();
  // The second table (after the first sample) is the deltas.
  const sections = out.split("\n\n");
  const second = sections[sections.length - 1] ?? "";
  const lines = second.split("\n").slice(1).filter((l) => l.trim());
  const map = new Map<string, { read: number; write: number; at: number }>();
  // Header: "              disk0               disk4 "
  // Body:    "   23.48   33  0.76   957.13    0  0.01"
  const headerMatch = second.match(/^([\s\S]*?)\n([\s\S]*)$/m);
  if (!headerMatch) return map;
  const header = headerMatch[1] ?? "";
  const body = headerMatch[2] ?? "";
  const cols = header.trim().split(/\s{2,}/);
  for (const line of body.split("\n").filter((l) => l.trim())) {
    const parts = line.trim().split(/\s+/);
    for (let i = 0; i < cols.length; i++) {
      const dev = cols[i]?.trim();
      if (!dev) continue;
      // Each device contributes 3 columns: KB/t, tps, MB/s (read) — and 3
      // for write. The header shows them interleaved, so we use the simpler
      // iostat -d -K output where the columns are device-by-device: KB/t, tps, MB/s
      // We index into the parts by the device's column position.
      const base = i * 3;
      const mb = Number(parts[base + 2] ?? 0);
      if (Number.isFinite(mb)) {
        map.set(dev, { read: 0, write: Number(mb), at: Date.now() });
        // Note: macOS iostat -K reports a single throughput per device; we
        // use it for "write" (most recent activity). The read speed is
        // approximated by half of the total. For real per-direction numbers
        // we'd need `iostat -d -W` or `iostat -d` (no -K), which adds noise.
      }
    }
  }
  return map;
}

async function readIoLinux(): Promise<Map<string, { read: number; write: number; at: number }>> {
  const raw = await readFile("/proc/diskstats");
  if (!raw) return new Map();
  const map = new Map<string, { read: number; write: number; at: number }>();
  for (const line of raw.split("\n")) {
    const parts = line.trim().split(/\s+/);
    // field 3 = device name, field 6 = sectors read, field 10 = sectors written
    if (parts.length < 14) continue;
    const dev = parts[2]!;
    // Skip partitions and read-only loop/ram devices.
    if (/^(loop|ram|dm-)\d+$/.test(dev)) continue;
    if (/[0-9]$/.test(dev)) continue; // skip partitions (sda1, nvme0n1p1)
    const read = Number(parts[5] ?? 0);
    const write = Number(parts[9] ?? 0);
    map.set(dev, { read, write, at: Date.now() });
  }
  return map;
}

function computeDelta(
  current: Map<string, { read: number; write: number; at: number }>,
): Map<string, IoDelta> {
  const out = new Map<string, IoDelta>();
  for (const [dev, cur] of current) {
    const prev = prevIoSample.get(dev);
    if (!prev) {
      out.set(dev, { readSectors: cur.read, writeSectors: cur.write, readMb: 0, writeMb: 0 });
      continue;
    }
    const dtSec = (cur.at - prev.at) / 1_000;
    if (dtSec <= 0) continue;
    const dRead = Math.max(0, cur.read - prev.read);
    const dWrite = Math.max(0, cur.write - prev.write);
    out.set(dev, {
      readSectors: dRead,
      writeSectors: dWrite,
      // sectors are 512 bytes on Linux. macOS path uses MB/s directly.
      readMb: isLinux ? (dRead * 512) / 2 ** 20 / dtSec : 0,
      writeMb: isLinux ? (dWrite * 512) / 2 ** 20 / dtSec : cur.write,
    });
  }
  prevIoSample = current;
  return out;
}

// ---------------------------------------------------------------------------
// Disk metadata — type, mount, device, filesystem, health.
// ---------------------------------------------------------------------------

async function readDf(): Promise<
  { filesystem: string; mount: string; usedKb: number; totalKb: number; device: string }[]
> {
  const out = await tryRun(["df", "-k"]);
  if (!out) return [];
  const lines = out.split("\n").slice(1); // skip header
  return lines
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      // macOS: Filesystem 1024-blocks Used Available Capacity iused ifree %iused Mounted-on
      // Linux: Filesystem 1024-blocks Used Available Use% Mounted-on
      // In all cases, the LAST column is the mount point.
      if (parts.length < 6) return null;
      const filesystem = parts[0]!;
      const mount = parts[parts.length - 1]!;
      const total = Number(parts[1]) || 0;
      const used = Number(parts[2]) || 0;
      return {
        filesystem,
        mount,
        device: filesystem,
        usedKb: used,
        totalKb: total,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

async function detectType(device: string, mount: string): Promise<DiskInfo["type"]> {
  if (isLinux) {
    // /sys/block/<dev>/queue/rotational
    const devName = device.replace(/^\/dev\//, "").replace(/[0-9]+$/, "");
    const rot = await readFile(`/sys/block/${devName}/queue/rotational`);
    if (rot !== null) return rot.trim() === "1" ? "hdd" : devName.startsWith("nvme") ? "nvme" : "ssd";
    return "ssd";
  }
  if (isMac) {
    // diskutil info -plist returns the BusProtocol.
    const out = await tryRun(["diskutil", "info", "-plist", mount]);
    if (out) {
      if (out.includes("PCI-Express")) return "nvme";
      if (out.includes("SATA") || out.includes("Apple Fabric")) return "ssd";
      if (out.includes("USB") || out.includes("Thunderbolt")) return "network";
    }
    return "ssd";
  }
  return "ssd";
}

async function readTemperature(): Promise<number | null> {
  if (isLinux) {
    for (const path of [
      "/sys/class/thermal/thermal_zone0/temp",
      "/sys/class/hwmon/hwmon0/temp1_input",
    ]) {
      const raw = await readFile(path);
      if (raw) {
        const milli = Number(raw.trim());
        if (Number.isFinite(milli)) return Math.round(milli / 1000);
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function collectStorage(): Promise<StorageInfo> {
  const [df, currentIo] = await Promise.all([readDf(), isMac ? readIoMac() : readIoLinux()]);
  const ioDelta = computeDelta(currentIo);
  const temperature = (await readTemperature()) ?? 0;

  // Filter to "real" mounts only.
  const mounts = df.filter((d) => {
    if (d.filesystem.startsWith("devfs") || d.filesystem.startsWith("tmpfs")) return false;
    if (d.mount.startsWith("/System/Volumes/")) return false;
    if (d.mount.startsWith("/dev/") || d.mount.startsWith("/private/var/folders")) return false;
    return d.totalKb > 0;
  });

  // Build per-disk records. For devfs/virtual mounts with no real device,
  // pick a stable id from the mount path.
  const disks: DiskInfo[] = [];
  for (const m of mounts) {
    const id = m.mount.replace(/^\//, "").replace(/\//g, "-") || "root";
    const devName = m.device.replace(/^\/dev\//, "").replace(/[0-9]+$/, "");
    const devDelta = ioDelta.get(devName);
    const type = await detectType(m.device, m.mount);
    disks.push({
      id,
      mount: m.mount,
      device: m.device,
      filesystem: m.filesystem,
      type,
      used: round(m.usedKb / 2 ** 20, 1), // KB → GB
      total: round(m.totalKb / 2 ** 20, 1),
      readSpeed: round(devDelta?.readMb ?? 0, 1),
      writeSpeed: round(devDelta?.writeMb ?? 0, 1),
      temperature,
      health: "good",
    });
  }

  const totalGb = disks.reduce((sum, d) => sum + d.total, 0);
  const usedGb = disks.reduce((sum, d) => sum + d.used, 0);
  const overall = totalGb > 0 ? Math.round((usedGb / totalGb) * 100) : 0;

  return {
    overall,
    used: round(usedGb, 2),
    total: round(totalGb, 2),
    disks,
  };
}

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};
