import Link from "next/link";
import { CareGuardDashboard } from "@/components/careguard/careguard-dashboard-fixed";

export default function Home() {
  return (
    <div className="relative">
      <CareGuardDashboard />
      <Link
        href="/safety"
        className="fixed bottom-5 right-5 z-50 rounded-full border border-cyan-300/30 bg-[#0b151d]/95 px-5 py-3 text-sm font-semibold text-cyan-200 shadow-[0_12px_45px_rgba(0,0,0,.45)] backdrop-blur transition hover:border-cyan-200/60 hover:bg-[#10232d]"
      >
        Open Hazard Monitor →
      </Link>
    </div>
  );
}
