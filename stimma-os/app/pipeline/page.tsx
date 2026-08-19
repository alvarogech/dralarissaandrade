import Link from "next/link";
import { Sidebar } from "@/components/shell/Sidebar";
import { Badge } from "@/components/ui/Badge";
import { PipelineBoardView } from "@/components/pipeline/PipelineBoardView";
import { buildPipelineBoard, countMissingNextAction } from "@/lib/pipeline/board";
import { getClinicSnapshot } from "@/lib/data/clinic-snapshot";

export default async function PipelinePage() {
  const { snapshot, source } = await getClinicSnapshot();
  const board = buildPipelineBoard(snapshot.patients, snapshot.journeys, new Date(snapshot.now));
  const missing = countMissingNextAction(board);

  return (
    <div className="flex min-h-screen">
      <Sidebar current="Pipeline" />
      <main className="w-full flex-1 px-6 py-8 md:px-10">
        {source === "demo" && (
          <div className="mb-6 rounded-md border border-important bg-important-bg px-4 py-2 text-sm text-important">
            Modo demonstração — nenhum paciente real cadastrado ainda, os dados abaixo são
            fictícios (ver <code>docs/ROADMAP.md</code>, Fase 2).
          </div>
        )}

        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl text-text-primary">Pipeline</h1>
            <p className="text-sm text-text-secondary">
              Jornada da paciente — lead até recorrência (ver docs/CRM_MASTER_SPEC.md §5).
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={missing > 0 ? "critical" : "opportunity"}>
              {missing} paciente{missing === 1 ? "" : "s"} sem próxima ação
            </Badge>
            {missing > 0 && (
              <Link
                href="/pipeline/fup"
                className="rounded-sm bg-accent px-3 py-1.5 text-sm font-medium text-surface hover:opacity-90"
              >
                Modo FUP →
              </Link>
            )}
          </div>
        </header>

        <PipelineBoardView board={board} />
      </main>
    </div>
  );
}
