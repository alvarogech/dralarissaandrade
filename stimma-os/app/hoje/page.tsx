import { Sidebar } from "@/components/shell/Sidebar";
import { NeedsYou } from "@/components/cockpit/NeedsYou";
import { PriorityList } from "@/components/cockpit/PriorityList";
import { TodayInClinic } from "@/components/cockpit/TodayInClinic";
import { OpportunitiesPreview } from "@/components/cockpit/OpportunitiesPreview";
import { runRuleEngine, topPriorities } from "@/lib/rules/engine";
import { getClinicSnapshot } from "@/lib/data/clinic-snapshot";

export default async function HojePage() {
  const { snapshot, source } = await getClinicSnapshot();

  const result = runRuleEngine(snapshot);
  const priorities = topPriorities(result, 3);
  const patientNameById = new Map(snapshot.patients.map((p) => [p.id, p.fullName]));

  const firstName = "Álvaro";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="mx-auto w-full max-w-cockpit flex-1 px-6 py-8 md:px-10">
        {source === "demo" && (
          <div className="mb-6 rounded-md border border-important bg-important-bg px-4 py-2 text-sm text-important">
            Modo demonstração — nenhum paciente real cadastrado ainda, os dados abaixo são
            fictícios (ver <code>docs/ROADMAP.md</code>, Fase 2).
          </div>
        )}

        <header className="mb-8">
          <h1 className="font-serif text-2xl text-text-primary">
            {greeting}, {firstName}.
          </h1>
        </header>

        <div className="flex flex-col gap-10">
          <NeedsYou alerts={result.alerts} />
          <PriorityList priorities={priorities} />
          <TodayInClinic
            appointments={snapshot.appointments}
            patientNameById={patientNameById}
          />
          <OpportunitiesPreview opportunities={result.opportunities} />
        </div>
      </main>
    </div>
  );
}
