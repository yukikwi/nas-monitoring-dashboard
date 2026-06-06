// Cross-platform helpers for the metrics layer. The dashboard target is
// Linux (Ubuntu 24.04 LTS per the original mock), but the dev box is macOS,
// so every collector needs both a Linux and a macOS implementation.

export const isMac = process.platform === "darwin";
export const isLinux = process.platform === "linux";

/** Run a command, capture stdout, and return it as a string. Throws on non-zero exit. */
export async function run(
  cmd: string[],
  options: { timeoutMs?: number } = {},
): Promise<string> {
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, LANG: "C" },
  });

  const timeoutMs = options.timeoutMs ?? 5_000;
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (exitCode !== 0) {
      throw new Error(
        `${cmd.join(" ")} exited ${exitCode}: ${stderr.slice(0, 200)}`,
      );
    }
    return stdout;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Same as run(), but returns `null` on failure (e.g., tool not installed,
 * permission denied). Used for optional collectors like `nvidia-smi` and
 * `docker`.
 */
export async function tryRun(
  cmd: string[],
  options: { timeoutMs?: number } = {},
): Promise<string | null> {
  try {
    return await run(cmd, options);
  } catch (err) {
    if (process.env.DEBUG_METRICS) {
      console.warn(`[metrics] ${cmd.join(" ")} failed:`, err);
    }
    return null;
  }
}

/** Read the contents of a file, or return null if it doesn't exist / errors. */
export async function readFile(path: string): Promise<string | null> {
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return null;
    return await file.text();
  } catch {
    return null;
  }
}

/** Read a single value from sysctl as a string. */
export function sysctlString(name: string): string | null {
  try {
    const out = require("node:child_process")
      .execFileSync("sysctl", ["-n", name], { encoding: "utf8" })
      .trim();
    return out || null;
  } catch {
    return null;
  }
}

/** Read a single number from sysctl. */
export function sysctl(name: string): number | null {
  const raw = sysctlString(name);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
