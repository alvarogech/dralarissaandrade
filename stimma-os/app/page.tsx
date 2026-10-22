import { redirect } from "next/navigation";

// Página principal desta versão: a rotina da concierge (tarefas + feedback diário).
export default function RootPage() {
  redirect("/fila");
}
