import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { mockSnapshot } from "@/lib/mockData";

export default function Page() {
  // The mock snapshot is used as the *initial* seed for the realtime hook,
  // so the dashboard has something to render before the first SSE event
  // arrives. The backend's real metrics progressively take over.
  return <DashboardClient initial={mockSnapshot} />;
}
