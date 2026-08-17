import { Sidebar } from "@/components/shell/Sidebar";
import { NeedsYou } from "@/components/cockpit/NeedsYou";
import { PriorityList } from "@/components/cockpit/PriorityList";
import { TodayInClinic } from "@/components/cockpit/TodayInClinic";
import { OpportunitiesPreview } from "@/components/cockpit/OpportunitiesPreview";
import { runRuleEngine, topPriorities } from "@/lib/rules/engine";
import { buildDemoSnapshot } from "@/lib/seed/seed-data";
import { isSupabaseConfigured } from "@/lib/supabase/service";

export default function HojePage() {
  const supabaseConfigured = isSupabaseConfigured();

  // Fase 2 do roadmap: cockpit operando sobre dados seed enquanto o Sync
  // Engine (Fase 4) ainda nao le o Simples Dental de verdade. Isso vale
  // mesmo com o Supabase ja conectado (supabaseConfigured=true) — a leitura
  // real de pacientes/agenda/financeiro entra na Fase 3/4, nao aqui.
  const snapshot = buildDemoSnapshot();
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
        <div className="mb-6 rounded-md border border-important bg-important-bg px-4 py-2 text-sm text-important">
          Modo demonstração — os dados abaixo são fictícios (ver <code>docs/ROADMAP.md</code>,
          Fase 2). {supabaseConfigured
            ? "O banco Supabase já está conectado; falta ligar a leitura real de pacientes/agenda/financeiro (Fase 3/4)."
            : "Configure NEXT_PUBLIC_SUPABASE_URL para conectar um banco."}
        </div>

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
