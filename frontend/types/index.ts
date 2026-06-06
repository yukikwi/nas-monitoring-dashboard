export type ServiceStatus = "running" | "stopped" | "restarting" | "exited";

export interface CpuCore {
  id: number;
  usage: number; // 0-100
  frequency: number; // GHz
  // `null` when the host doesn't expose a per-core reading (e.g. macOS —
  // SMC temps require `sudo powermetrics` or a third-party tool).
  temperature: number | null; // °C
}

export interface CpuInfo {
  brand: string;
  model: string;
  architecture: string;
  physicalCores: number;
  logicalCores: number;
  baseFrequency: number; // GHz
  overall: number; // 0-100
  cores: CpuCore[];
  // `null` when the host doesn't expose this reading. `0` would be
  // misleading — a 0W reading looks like an idle CPU, not "no data".
  temperature: number | null; // °C
  power: number | null; // watts
}

export interface GpuProcess {
  pid: number;
  name: string;
  vram: number; // MB
  usage: number; // 0-100
}

export interface GpuInfo {
  brand: string;
  model: string;
  driver: string;
  load: number; // 0-100
  vramUsed: number; // MB
  vramTotal: number; // MB
  temperature: number; // °C
  power: number; // watts
  powerLimit: number; // watts
  fanSpeed: number; // %
  processes: GpuProcess[];
}

export interface MemoryInfo {
  ramUsed: number; // GB
  ramTotal: number; // GB
  ramCached: number; // GB
  ramBuffers: number; // GB
  swapUsed: number; // GB
  swapTotal: number; // GB
  pressure: number; // 0-100
}

export interface DiskInfo {
  id: string;
  mount: string;
  device: string;
  filesystem: string;
  type: "ssd" | "nvme" | "hdd" | "network";
  used: number; // GB
  total: number; // GB
  readSpeed: number; // MB/s
  writeSpeed: number; // MB/s
  temperature: number; // °C
  health: "good" | "warning" | "critical";
}

export interface StorageInfo {
  overall: number; // 0-100 (used / total)
  used: number; // GB
  total: number; // GB
  disks: DiskInfo[];
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: ServiceStatus;
  uptime: number; // seconds
  cpu: number; // 0-100
  memory: number; // 0-100
  memoryMb: number;
  ports: string;
  gpu: boolean;
}

export interface DockerService {
  name: string;
  status: ServiceStatus;
  replicas: string;
  image: string;
  uptime: number; // seconds
}

export interface DockerInfo {
  running: number;
  stopped: number;
  total: number;
  containers: DockerContainer[];
  services: DockerService[];
}

export interface SystemInfo {
  hostname: string;
  os: string;
  kernel: string;
  uptime: number; // seconds
  timestamp: number;
}

export interface DashboardSnapshot extends SystemInfo {
  cpu: CpuInfo;
  gpu: GpuInfo;
  memory: MemoryInfo;
  storage: StorageInfo;
  docker: DockerInfo;
}
