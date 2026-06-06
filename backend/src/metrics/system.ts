import type { SystemInfo } from "../types";
import { isLinux, isMac, readFile, run, sysctl, sysctlString } from "./platform";

// Identity fields don't change — sample once on first call and cache.
let cached: Pick<SystemInfo, "hostname" | "os" | "kernel"> | null = null;

async function loadIdentity(): Promise<Pick<SystemInfo, "hostname" | "os" | "kernel">> {
  if (cached) return cached;

  const hostname = await run(["hostname"]).then((s) => s.trim()).catch(() => "unknown");

  let os = "unknown";
  let kernel = "unknown";

  if (isMac) {
    const product = await run(["sw_vers", "-productName"]).then((s) => s.trim()).catch(() => "");
    const version = await run(["sw_vers", "-productVersion"]).then((s) => s.trim()).catch(() => "");
    const build = await run(["sw_vers", "-buildVersion"]).then((s) => s.trim()).catch(() => "");
    if (product) os = version ? `${product} ${version} (${build})` : product;
    kernel = await run(["uname", "-v"]).then((s) => s.trim()).catch(() => kernel);
  } else if (isLinux) {
    const osRelease = (await readFile("/etc/os-release")) ?? "";
    const pretty = osRelease.match(/^PRETTY_NAME="?([^"\n]+)"?/m)?.[1];
    if (pretty) os = pretty;
    kernel = await run(["uname", "-r"]).then((s) => s.trim()).catch(() => kernel);
  }

  cached = { hostname, os, kernel };
  return cached;
}

// Uptime is sampled live from the kernel; no need to cache.
async function readUptimeSeconds(): Promise<number> {
  if (isMac) {
    const boottime = sysctlString("kern.boottime"); // "1700000000" or "{sec = 1700000000, ...}"
    if (boottime !== null) {
      const match = boottime.match(/\d+/);
      if (match) {
        const seconds = Number(match[0]);
        if (Number.isFinite(seconds)) {
          return Math.max(0, Math.floor(Date.now() / 1_000) - seconds);
        }
      }
    }
  } else if (isLinux) {
    const raw = await readFile("/proc/uptime");
    if (raw) {
      const seconds = Number(raw.split(" ")[0]);
      if (Number.isFinite(seconds)) return Math.floor(seconds);
    }
  }
  return 0;
}

export async function collectSystem(): Promise<SystemInfo> {
  const [identity, uptime] = await Promise.all([loadIdentity(), readUptimeSeconds()]);
  return {
    ...identity,
    uptime,
    timestamp: Date.now(),
  };
}
