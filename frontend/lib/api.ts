// Single source of truth for the backend base URL. NEXT_PUBLIC_* env vars
// are inlined at build time by Next.js, so this is safe to import from
// client components.
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Build a stream URL for a given topic. */
export function streamUrl(topic: string): string {
  return `${API_URL}/api/stream/${topic}`;
}

export const TOPICS = [
  "system",
  "cpu",
  "gpu",
  "memory",
  "storage",
  "docker",
] as const;

export type Topic = (typeof TOPICS)[number];
