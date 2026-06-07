import { DashboardClient } from "@/components/dashboard/DashboardClient";

export default function Page() {
  // The dashboard starts in a "loading" state with no data. The
  // `useRealtimeSnapshot` hook subscribes to the six backend SSE topics;
  // once the first event for every topic has arrived, the loading
  // overlay fades out and the dashboard reveals itself.
  return <DashboardClient />;
}
