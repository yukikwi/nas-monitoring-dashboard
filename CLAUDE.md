# CLAUDE.md — Lessons learned

Mistakes I made on this project and the rules I should follow to avoid
repeating them. Read this before touching the backend or frontend code.

---

## Backend — Bun + Elysia SSE server

### Bun `$` shell interpolation does NOT run a shell command string

`$\`${command}\`` does **not** run `command` as a shell command. The `$`
tagged template literal interpolates `${command}` as a **single
argument** to the executable named by the literal's first string. So
`$\`${"echo hello"}\`` becomes `bun: command not found: echo hello`
because Bun tries to find an executable literally named `echo hello`.

The correct way to run an arbitrary shell command with `$`:

```ts
// WRONG — treats the whole joined string as one executable name
const cmd = ["df", "-k"];
await $`${cmd.join(" ")}`;

// RIGHT — wrap in `sh -c` so the shell parses the string
await $`sh -c ${cmd.join(" ")}`;
```

Or, if the command is fully hardcoded and you control every token, you
can put each token as a separate string in the template:

```ts
await $`df -k`;          // ✅
await $`top -l 2 -s 1`;  // ✅
```

For variable argv (like `diskutil info -plist <mount>`), use
`$`sh -c ${cmd.join(" ")}`` or fall back to `Bun.spawn(cmd, …)`.

### `$` has no built-in per-call timeout

Race it against a `setTimeout` promise:

```ts
const result = await Promise.race([
  $`cmd`.nothrow().quiet(),
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`timeout: ${cmd}`)), timeoutMs),
  ),
]);
```

The subprocess may outlive the timeout; that's fine — the OS reaps it.

### `$` is the wrong tool when argv can contain spaces

When you need to pass an argument whose value contains spaces — e.g. a
mount path like `/Volumes/MiniMax Code 3.0.37-arm64` — `$` + `sh -c`
breaks. The joined command `sh -c "diskutil info -plist /Volumes/MiniMax
Code 3.0.37-arm64"` gets word-split by `sh` into six arguments, and
`diskutil` rejects the extras with a usage error.

`Bun.spawn` (or `Bun.spawnSync`) is the right tool here — it takes an
argv array natively and passes each element as a single argument. Use
`$` only for hardcoded shell pipelines where every token is shell-safe
(e.g. `$`df -k``). For variable argv, use `Bun.spawn`.

### `df` mount paths can contain spaces

macOS mounts like `/Volumes/MiniMax Code 3.0.37-arm64` (mounted DMGs,
external drives) have spaces in their names. `df` output is
whitespace-separated, so taking `parts[parts.length - 1]` chops the path
at the first space. The fix: take everything from the mount column
onwards and re-join with spaces.

```ts
// macOS df -k: 8 columns before the mount
// Linux  df:   5 columns before the mount
const MOUNT_START_COL = isMac ? 8 : 5;
const mount = parts.slice(MOUNT_START_COL).join(" ");
```

Without this, `diskutil info -plist <mount>` gets called with a
meaningless suffix (`3.0.37-arm64`) and throws a usage error every poll.

### Use `.nothrow().quiet()` to inspect exit code without throwing

```ts
const r = await $`cmd`.nothrow().quiet();
if (r.exitCode !== 0) throw new Error(`exited ${r.exitCode}`);
return r.stdout.toString();
```

`stdout` and `stderr` are `Buffer`s, not strings. Call `.toString()`.

### `tryRun` swallows errors silently unless `DEBUG_METRICS=1`

The poller depends on `tryRun` returning `null` on failure. If a metric
suddenly returns all-zeros, set `DEBUG_METRICS=1` and re-run to see the
underlying errors.

### Never poison the cache with a "no data" payload

When a collector can't read a value (subprocess killed, timeout, malformed
output), it must return the **last good value**, not a zero/fallback.
Returning zero makes the dashboard flash to 0% for several ticks.

Pattern (see `backend/src/metrics/cpu.ts`):

```ts
let lastGood: T | null = null;
export async function collectX(): Promise<T> {
  const next = await tryBuild();
  if (isBad(next) && lastGood) return lastGood;
  if (isGood(next)) lastGood = next;
  return next;
}
```

A 0% reading on a busy machine is almost always a sign of a failed
subprocess, not a genuinely idle moment. Gate the cache update on
`overall > 0` (or whatever the equivalent sanity threshold is).

---

## Backend — Elysia SSE

### Async generator timer pattern: `await` not `yield`

In an async generator, **never** `yield` a `setTimeout` Promise. Elysia's
SSE adapter stringifies the yielded Promise to `"{}"` (it's a plain
object, no `toSSE` method), which corrupts the stream after the first
event.

```ts
// WRONG — yields the Promise to Elysia, gets stringified to "{}"
while (true) {
  yield sse({ event: "cpu", data: ... });
  yield new Promise<void>((r) => setTimeout(r, 1000));
}

// RIGHT — await the timer inside the generator
while (true) {
  yield sse({ event: "cpu", data: ... });
  await new Promise<void>((r) => setTimeout(r, 1000));
}
```

`await` keeps the timer inside the generator; the next `yield` only
happens after the timer resolves, and Elysia only ever sees sse-wrapped
values.

### `await sleep(ms)` helper

Use a named `sleep` helper for clarity:

```ts
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
```

---

## Frontend — React + Framer Motion + SSE

### Framer Motion `initial` re-animation gotcha

`motion.circle` / `motion.div` with `initial={{ ... 0 }}` and
`animate={{ ... value }}` re-triggers the "from zero" animation on
**every render** when `initial` is a new object literal each render. The
ring/bar resets to 0% on every SSE update and spends the full
`transition.duration` re-animating.

**Fix:** use `initial={false}` so the component starts at the `animate`
value and only animates when `animate` actually changes. Also tighten
`transition.duration` to ≤ 0.5s for 1Hz data — 1.2s leaves the meter
always mid-animation.

```tsx
<motion.circle
  initial={false}                        // skip the "from zero" entry
  animate={{ strokeDashoffset: offset }} // animates only on value change
  transition={{ duration: 0.5 }}
/>
```

### `useSseTopic` hook contract

- `data` is `null` until the first event arrives.
- `initial` is only used on the FIRST render (`useState` ignores later
  changes to the initial value). To re-seed, remount the component or
  reset via a key.
- SSR-safe: `EventSource` is only created inside `useEffect`.
- EventSource is created with `new EventSource(url)`, not `fetch`.

### Hydration mismatches from browser extensions

Proton Pass, 1Password, and similar extensions inject attributes like
`data-protonpass-form=""` on form-like DOM. The standard fix is
`suppressHydrationWarning` on the affected element — it's specifically
designed for this case (browser extensions modifying the DOM between
SSR and hydration).

---

## Operational

### Always run from the correct working directory

`bun run src/index.ts` from the project root fails with
`Module not found "src/index.ts"`. Always `cd` into the package first:

```sh
cd backend && bun run src/index.ts   # ✅
bun run src/index.ts                  # ❌ from repo root
```

### Stop background servers before starting new ones

`pnpm dev` and `bun run src/index.ts` both bind to a port. If a previous
run is still alive, the new one fails with "port already in use" or
"Another next dev server is already running." Always `TaskStop` the
previous background task, or `pkill -f "next dev"` / `pkill -f "bun run src"`.

### Type-check before running

```sh
cd backend && bunx tsc --noEmit
cd frontend && pnpm exec tsc --noEmit
```

Bun and Next.js won't always surface type errors at runtime.

### Verify with curl after backend changes

After any backend change, confirm each SSE topic still returns real data:

```sh
curl -sN --max-time 3 http://localhost:3001/api/stream/cpu | head -c 500
```

Don't trust "the server started" — verify the payload.

---

## Workflow

1. Read this file before making changes.
2. Run `tsc --noEmit` after every meaningful edit.
3. Verify the change with curl / browser before declaring it done.
4. If a `Bun.$` call behaves unexpectedly, check whether the
   interpolation is being treated as a single argument (it always is).
5. If a metric suddenly shows zeros, suspect a cache-poisoning path
   where the collector returns a fallback instead of the last good value.
