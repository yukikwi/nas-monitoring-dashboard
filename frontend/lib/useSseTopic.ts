"use client";

import { useEffect, useRef, useState } from "react";

/** Status of a single SSE stream. */
export type SseStatus = "idle" | "connecting" | "open" | "error" | "closed";

export interface SseState<T> {
  data: T | null;
  status: SseStatus;
  error: Error | null;
  /** ms since epoch of the last successfully-received event. */
  lastEventAt: number | null;
}

export interface UseSseTopicOptions<T> {
  /**
   * SSE `event:` name to listen for. The backend names each event after its
   * topic (e.g. `event: cpu`). Defaults to `"message"` for unnamed events.
   */
  name?: string;
  /** Value to return before the first event arrives. */
  initial?: T;
  /** Disable the connection (useful for conditional streaming). */
  enabled?: boolean;
}

/**
 * Subscribe to a single Server-Sent Events stream. Returns the latest
 * payload plus the connection status. The underlying `EventSource`
 * reconnects automatically; we surface the resulting state via `status`.
 *
 * The hook is SSR-safe: `EventSource` is only created inside `useEffect`,
 * which doesn't run on the server.
 */
export function useSseTopic<T>(
  url: string,
  options: UseSseTopicOptions<T> = {},
): SseState<T> {
  const { name = "message", initial, enabled = true } = options;

  const [state, setState] = useState<SseState<T>>({
    data: initial ?? null,
    status: "idle",
    error: null,
    lastEventAt: null,
  });

  // Keep a ref to the latest data so the effect doesn't need to depend on it.
  const initialRef = useRef(initial);
  initialRef.current = initial;

  useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, status: "idle" }));
      return;
    }
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }

    setState((s) => ({ ...s, status: "connecting", error: null }));

    const source = new EventSource(url, { withCredentials: false });

    const handleData = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as T;
        setState({
          data,
          status: "open",
          error: null,
          lastEventAt: Date.now(),
        });
      } catch (err) {
        setState((s) => ({
          ...s,
          status: "error",
          error: err instanceof Error ? err : new Error(String(err)),
        }));
      }
    };

    const handleOpen = () => {
      setState((s) => ({ ...s, status: "open", error: null }));
    };

    const handleError = () => {
      // EventSource will auto-reconnect after a short delay. We can't read
      // the underlying error, so we surface a synthetic one and let the
      // next `open` event clear it.
      setState((s) => ({
        ...s,
        status: "error",
        error: new Error(`SSE connection lost: ${url}`),
      }));
    };

    source.addEventListener(name, handleData as EventListener);
    source.addEventListener("open", handleOpen as EventListener);
    source.addEventListener("error", handleError as EventListener);

    return () => {
      source.removeEventListener(name, handleData as EventListener);
      source.removeEventListener("open", handleOpen as EventListener);
      source.removeEventListener("error", handleError as EventListener);
      source.close();
      setState((s) => ({ ...s, status: "closed" }));
    };
  }, [url, name, enabled]);

  return state;
}
