import { Elysia, sse } from "elysia";
import { metrics } from "../metrics/poller";

// All topics yield fresh data on a 1-second cadence so the dashboard has
// a steady 1Hz heartbeat. The collectors underneath run at the same rate
// (or slower for the expensive ones — see `metrics/poller.ts`), so the
// client always sees the freshest cached value.
const TICK_MS = 1_000;

// Pause for `ms` inside an async generator. We `await` the timer instead
// of `yield`ing the Promise: Elysia treats a yielded Promise as data
// (stringifies it to "{}") and the stream gets corrupted. Awaiting keeps
// the timer inside the generator — the next `yield` only happens after
// the timer resolves.
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Each route mounts a single GET endpoint at /api/stream/<topic> that pushes
// fresh data every tick. The async generator is consumed by Elysia's
// pull-based backpressure (cancels automatically when the client disconnects),
// so we don't need any explicit teardown.
export const streamRoutes = new Elysia({ prefix: "/api/stream" })
  .get("/system", async function* () {
    console.log("[sse] system client connected");
    try {
      while (true) {
        yield sse({ event: "system", data: await metrics.getSystem() });
        await sleep(TICK_MS);
      }
    } finally {
      console.log("[sse] system client disconnected");
    }
  })
  .get("/cpu", async function* () {
    console.log("[sse] cpu client connected");
    try {
      while (true) {
        yield sse({ event: "cpu", data: await metrics.getCpu() });
        await sleep(TICK_MS);
      }
    } finally {
      console.log("[sse] cpu client disconnected");
    }
  })
  .get("/gpu", async function* () {
    console.log("[sse] gpu client connected");
    try {
      while (true) {
        yield sse({ event: "gpu", data: await metrics.getGpu() });
        await sleep(TICK_MS);
      }
    } finally {
      console.log("[sse] gpu client disconnected");
    }
  })
  .get("/memory", async function* () {
    console.log("[sse] memory client connected");
    try {
      while (true) {
        yield sse({ event: "memory", data: await metrics.getMemory() });
        await sleep(TICK_MS);
      }
    } finally {
      console.log("[sse] memory client disconnected");
    }
  })
  .get("/storage", async function* () {
    console.log("[sse] storage client connected");
    try {
      while (true) {
        yield sse({ event: "storage", data: await metrics.getStorage() });
        await sleep(TICK_MS);
      }
    } finally {
      console.log("[sse] storage client disconnected");
    }
  })
  .get("/docker", async function* () {
    console.log("[sse] docker client connected");
    try {
      while (true) {
        yield sse({ event: "docker", data: await metrics.getDocker() });
        await sleep(TICK_MS);
      }
    } finally {
      console.log("[sse] docker client disconnected");
    }
  });
