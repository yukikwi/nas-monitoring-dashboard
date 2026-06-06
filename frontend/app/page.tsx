import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { mockSnapshot } from "@/lib/mockData";

export default function Page() {
  return <DashboardClient snapshot={mockSnapshot} />;
}
