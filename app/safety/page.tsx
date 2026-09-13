import { HazardMonitor } from "@/components/careguard/hazard-monitor";

export default function SafetyPage() {
  return (
    <main className="min-h-screen bg-[#080d13] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <HazardMonitor />
      </div>
    </main>
  );
}
