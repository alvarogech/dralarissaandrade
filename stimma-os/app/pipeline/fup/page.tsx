import Link from "next/link";
import { Sidebar } from "@/components/shell/Sidebar";
import { FupQueueView } from "@/components/fup/FupQueueView";
import { buildFupQueue } from "@/lib/pipeline/fup-queue";
import { getClinicSnapshot } from "@/lib/data/clinic-snapshot";

export default async function FupPage() {
  const { snapshot, source } = await getClinicSnapshot();
  const queue = buildFupQueue(
    snapshot.patients,
    snapshot.journeys,
    snapshot.receivables,
    snapshot.appointments
  );

  return (
    <div className="flex min-h-screen">
      <Sidebar current="Pipeline" />
      <main className="mx-auto w-full max-w-xl flex-1 px-6 py-8">
        {source === "demo" && (
          <div className="mb-6 rounded-md border border-important bg-important-bg px-4 py-2 text-sm text-important">
            Modo demonstração — dados fictícios.
          </div>
        )}

        <header className="mb-6">
          <Link href="/pipeline" className="text-sm text-text-muted hover:underline">
            ← Voltar ao pipeline
          </Link>
          <h1 className="mt-1 font-serif text-2xl text-text-primary">Modo FUP</h1>
          <p className="text-sm text-text-secondary">
            Uma paciente por vez até zerar quem está sem próxima ação.
          </p>
        </header>

        <FupQueueView initialQueue={queue} />
      </main>
    </div>
  );
}
