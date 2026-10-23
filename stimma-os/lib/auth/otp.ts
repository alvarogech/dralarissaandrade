/**
 * Código de acesso por e-mail (Supabase Auth, `verifyOtp` tipo "email"). O projeto envia códigos de
 * 8 dígitos (comprimento configurado no provedor e confirmado no e-mail recebido em 2026-10-23);
 * a interface acompanha o provedor — nunca o contrário. Se o comprimento mudar no Supabase, mude aqui.
 *
 * O código é texto: zeros à esquerda fazem parte dele.
 */
export const OTP_DIGITOS = 8;

export type CodigoLido = { ok: true; codigo: string } | { ok: false; erro: string };

/** Aceita colagem com espaços, hífens ou quebras acidentais ("0123 4567", "0123-4567"). */
export function lerCodigo(texto: string): CodigoLido {
  const digitos = texto.replace(/[\s\-.]/g, "");
  if (!digitos) return { ok: false, erro: `Digite o código de ${OTP_DIGITOS} dígitos enviado por e-mail.` };
  if (!/^\d+$/.test(digitos)) return { ok: false, erro: "O código tem apenas números." };
  if (digitos.length !== OTP_DIGITOS) return { ok: false, erro: `O código tem ${OTP_DIGITOS} dígitos (você informou ${digitos.length}).` };
  return { ok: true, codigo: digitos };
}

/**
 * Para o campo: mantém só dígitos, no tamanho do código. Se colarem um trecho maior (o e-mail
 * inteiro, com outras datas e números), usa o grupo isolado de 8 dígitos em vez dos primeiros 8.
 */
export function limparEntradaCodigo(texto: string): string {
  const digitos = texto.replace(/\D/g, "");
  if (digitos.length > OTP_DIGITOS) {
    const grupo = texto.match(/(?<!\d)(\d{4})[\s-]?(\d{4})(?!\d)/);
    if (grupo) return grupo[1]! + grupo[2]!;
  }
  return digitos.slice(0, OTP_DIGITOS);
}
