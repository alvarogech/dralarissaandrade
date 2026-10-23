import { redirect } from "next/navigation";

// O antigo cockpit ("operação sob controle", prioridades sem evidência suficiente) saiu do fluxo:
// a página inicial agora é o trabalho do dia, com números conciliáveis.
export default function HojePage() {
  redirect("/trabalho");
}
