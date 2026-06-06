// Cross-platform helpers for the metrics layer. The dashboard target is
// Linux (Ubuntu 24.04 LTS per the original mock), but the dev box is macOS,
// so every collector needs both a Linux and a macOS implementation.

export const isMac = process.platform === "darwin";
export const isLinux = process.platform === "linux";

/**
 * Run a command, capture stdout, and return it as a string. Throws on
 * non-zero exit or timeout.
 *
 * Uses `Bun.spawn` (not Bun's `$` shell) because we need to pass arbitrary
 * argv — including paths that contain spaces, like the mounted DMG
 * `/Volumes/MiniMax Code 3.0.37-arm64`. `$` would need `sh -c` quoting to
 * preserve those spaces, and even then the interpolation escaping makes
 * the call site fragile.
 */
export async function run(
  cmd: string[],
  options: { timeoutMs?: number } = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, LANG: "C" },
  });

  // No built-in subprocess timeout in `Bun.spawn`; race a timer that kills
  // the process if it overruns. The OS reaps the killed process on exit.
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
 * Same as run(), but returns `null` on failure. Used for optional
 * collectors like `nvidia-smi` and `docker`.
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

/**
 * Read the contents of a file, or return null if it doesn't exist / errors.
 *
 * Don't call `file.exists()` first: on `/proc` files `stat()` reports size 0,
 * which poisons Bun's lazy file handle so the subsequent `text()` call
 * returns an empty string. `text()` already throws `ENOENT` for missing
 * files, which the `try`/`catch` covers.
 */
export async function readFile(path: string): Promise<string | null> {
  try {
    return await Bun.file(path).text();
  } catch {
    return null;
  }
}

/** Read a single value from sysctl as a string. Synchronous via Bun.spawnSync. */
export function sysctlString(name: string): string | null {
  const proc = Bun.spawnSync(["sysctl", "-n", name], {
    env: { ...process.env, LANG: "C" },
  });
  if (proc.exitCode !== 0) return null;
  const out = proc.stdout.toString().trim();
  return out || null;
}

/** Read a single number from sysctl. */
export function sysctl(name: string): number | null {
  const raw = sysctlString(name);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
