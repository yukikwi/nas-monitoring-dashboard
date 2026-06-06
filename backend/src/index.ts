import { Elysia } from "elysia";
import { startPoller, stopPoller } from "./metrics/poller";
import { streamRoutes } from "./routes/streams";

const PORT = Number(process.env.PORT ?? 3_001);

const app = new Elysia()
  // Permissive CORS for local dev — the frontend is served by Next.js on a
  // different port and EventSource will preflight the same-origin policy.
  .onAfterHandle(({ set, request }) => {
    const origin = request.headers.get("origin");
    if (origin) {
      set.headers["access-control-allow-origin"] = origin;
      set.headers["vary"] = "Origin";
    }
    set.headers["access-control-allow-methods"] = "GET, OPTIONS";
    set.headers["access-control-allow-headers"] = "Content-Type";
  })
  // Preflight for the EventSource endpoints.
  .options("/*", ({ set }) => {
    set.status = 204;
    return "";
  })
  .get("/", () => ({
    name: "nas-monitoring-backend",
    topics: ["system", "cpu", "gpu", "memory", "storage", "docker"],
    streams: [
      "/api/stream/system",
      "/api/stream/cpu",
      "/api/stream/gpu",
      "/api/stream/memory",
      "/api/stream/storage",
      "/api/stream/docker",
    ],
  }))
  .get("/health", () => ({ status: "ok" }))
  .use(streamRoutes)
  .onError(({ code, error }) => {
    console.error(`[${code}]`, error);
    return { error: code };
  })
  .listen(PORT);

// Start the background poller. Collectors sample the host's real metrics
// and cache the latest values; the SSE routes just read the cache.
startPoller();

console.log(
  `🛰  nas-monitoring-backend listening on http://localhost:${app.server!.port}`,
);
console.log(`   SSE topics: ${["system", "cpu", "gpu", "memory", "storage", "docker"].join(", ")}`);

// Graceful shutdown so the poller doesn't keep timers running if the process
// is killed (e.g. `kill -TERM` from a process manager).
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => {
    stopPoller();
    app.stop();
    process.exit(0);
  });
}
