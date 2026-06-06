import { Elysia, sse } from "elysia";
import { metrics } from "../metrics/poller";

// Per-topic tick interval (ms). Some topics change quickly (CPU) and some
// barely move (storage). Cheap to make them independent.
const INTERVALS = {
  system: 2_000,
  cpu: 1_000,
  gpu: 1_500,
  memory: 2_000,
  storage: 4_000,
  docker: 3_000,
} as const;

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
        yield new Promise<void>((resolve) => setTimeout(resolve, INTERVALS.system));
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
        yield new Promise<void>((resolve) => setTimeout(resolve, INTERVALS.cpu));
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
        yield new Promise<void>((resolve) => setTimeout(resolve, INTERVALS.gpu));
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
        yield new Promise<void>((resolve) => setTimeout(resolve, INTERVALS.memory));
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
        yield new Promise<void>((resolve) => setTimeout(resolve, INTERVALS.storage));
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
        yield new Promise<void>((resolve) => setTimeout(resolve, INTERVALS.docker));
      }
    } finally {
      console.log("[sse] docker client disconnected");
    }
  });
