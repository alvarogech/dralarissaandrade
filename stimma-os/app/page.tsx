import { redirect } from "next/navigation";

// Página principal: o trabalho do dia (gestão vê o da Gabi; a Gabi vê o dela).
export default function RootPage() {
  redirect("/trabalho");
}
