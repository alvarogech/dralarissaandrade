import { nomeCurto } from "./fechamento";
import type { PropostaContinuidade } from "./ia";

/**
 * Revisão determinística das sugestões de continuidade (feedback anterior), depois da IA e antes
 * da gestão: nenhuma regra aqui grava nada — só reclassifica e explica o motivo de cada item.
 *  - nova tarefa igual a uma já aberta (mesma paciente e mesma ação) → "duplicada", não é proposta;
 *  - nova tarefa sem ação pendente explícita → "revisar";
 *  - "encerrar" quando o trecho só relata contato (sem resolução explícita) → vira acompanhamento.
 */
export interface TarefaAberta {
  id: string;
  ref: string;
  paciente: string;
  idsSd: string[];
  tipo: string;
  titulo: string;
}

export type PropostaRevisada = PropostaContinuidade & { tarefaId?: string; razao: string };

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const CONTATO = /\b(mensagem|msg|enviei|enviada|enviado|liguei|ligacao|contato|contatei|whatsapp|sem resposta|nao respondeu|aguardando)\b/;
const RESOLUCAO = /\b(resolvid|conclu|pagou|pago|pagamento confirmado|confirmou|agendou|agendad|compareceu|realizad|quitad|finalizad)/;

function mesmaPaciente(item: Record<string, unknown>, t: TarefaAberta): boolean {
  const p = (item.paciente ?? {}) as Record<string, unknown>;
  const ids = ["sd_codigo", "sd_numero", "sd_ficha_id"].map((k) => String(p[k] ?? "")).filter(Boolean);
  if (ids.some((id) => t.idsSd.includes(id))) return true;
  const nome = norm(String(p.nome ?? ""));
  if (!nome) return false;
  return nome === norm(t.paciente) || nome === norm(nomeCurto(t.paciente));
}

function mesmaAcao(item: Record<string, unknown>, t: TarefaAberta): boolean {
  if (String(item.tipo ?? "") === t.tipo && t.tipo !== "outro") return true;
  const a = norm(String(item.acao ?? item.contexto ?? ""));
  const b = norm(t.titulo);
  return !!a && !!b && (a.includes(b) || b.includes(a));
}

function temAcaoExplicita(item: Record<string, unknown>): boolean {
  return ["acao", "contexto", "prazo", "data_ocorrencia", "motivo"].some((k) => typeof item[k] === "string" && String(item[k]).trim());
}

export function revisarPropostas(propostas: (PropostaContinuidade & { tarefaId?: string })[], abertas: TarefaAberta[]): PropostaRevisada[] {
  return propostas.map((p): PropostaRevisada => {
    if (p.tipo === "nova_tarefa") {
      const item = p.item ?? {};
      const dup = abertas.find((t) => mesmaPaciente(item, t) && mesmaAcao(item, t));
      if (dup) return { ...p, tipo: "duplicada", razao: `Já existe tarefa aberta ${dup.ref} com a mesma paciente e ação (“${dup.titulo}”) — não será proposta de novo.` };
      if (!p.item || !temAcaoExplicita(item)) return { ...p, tipo: "revisar", razao: "Sem ação pendente explícita no trecho — continuidade só é criada quando há algo a fazer." };
      return { ...p, razao: "Pendência explícita sem tarefa aberta correspondente na fila." };
    }
    if (p.tipo === "encerrar_tarefa") {
      const ev = norm(p.evidencia);
      if (CONTATO.test(ev) && !RESOLUCAO.test(ev)) {
        return { ...p, tipo: "atualizar_tarefa", razao: "O trecho relata contato, não resolução: a tarefa segue em acompanhamento (contato feito não encerra o caso)." };
      }
      return { ...p, razao: "O trecho informa resolução explícita do objetivo." };
    }
    if (p.tipo === "atualizar_tarefa") return { ...p, razao: `Corresponde à tarefa aberta ${p.ref}: atualiza data e/ou próxima ação.` };
    if (p.tipo === "duplicada") return { ...p, razao: p.motivo ?? "Duplicada." };
    return { ...p, razao: p.motivo ?? "Ambíguo: revise manualmente." };
  });
}
