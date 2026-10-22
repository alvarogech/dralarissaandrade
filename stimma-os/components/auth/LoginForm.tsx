"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

type Modo = "senha" | "codigo" | "recuperar";

/**
 * Três formas de entrar, todas só para quem já existe (sem cadastro público):
 * - senha;
 * - código de 6 dígitos por e-mail (`signInWithOtp` com `shouldCreateUser: false` + `verifyOtp`).
 *   O template "Magic Link" do Supabase precisa conter `{{ .Token }}` para o código aparecer;
 * - "esqueci minha senha": link por e-mail que abre /auth/set-password.
 * As mensagens de envio são sempre genéricas, para não revelar se um e-mail tem acesso.
 */
export function LoginForm() {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("senha");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [codigo, setCodigo] = useState("");
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function trocarModo(novo: Modo) {
    setModo(novo);
    setError(null);
    setAviso(null);
    setCodigo("");
    setCodigoEnviado(false);
  }

  function entrou() {
    router.push("/fila");
    router.refresh();
  }

  async function comCliente(fn: (supabase: NonNullable<ReturnType<typeof createSupabaseBrowserClient>>) => Promise<void>) {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase não configurado neste ambiente.");
      return;
    }
    setLoading(true);
    setError(null);
    setAviso(null);
    try {
      await fn(supabase);
    } finally {
      setLoading(false);
    }
  }

  async function entrarComSenha(event: FormEvent) {
    event.preventDefault();
    await comCliente(async (supabase) => {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("E-mail ou senha inválidos, ou seu acesso ainda não foi ativado.");
        return;
      }
      entrou();
    });
  }

  /**
   * Traduz a falha de envio. Só "e-mail sem acesso" vira resposta genérica (não revela quem tem
   * conta); qualquer outra falha aparece — nunca mostrar "enviamos" quando o envio foi recusado.
   */
  function falhaDeEnvio(mensagem: string): string | null {
    if (/signups? not allowed|user not found/i.test(mensagem)) return null;
    if (/rate|limit|seconds/i.test(mensagem)) return "Muitos envios em pouco tempo. Aguarde alguns minutos e tente de novo.";
    if (/not authorized|authorized/i.test(mensagem)) {
      return "O envio de e-mail do sistema ainda não está liberado para este endereço (o servidor de e-mail padrão do Supabase só entrega para a equipe do projeto). Avise a administração.";
    }
    return `Não foi possível enviar o e-mail: ${mensagem}`;
  }

  async function enviarCodigo(event: FormEvent) {
    event.preventDefault();
    await comCliente(async (supabase) => {
      const { error: otpError } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      const falha = otpError ? falhaDeEnvio(otpError.message) : null;
      if (falha) {
        setError(falha);
        return;
      }
      setCodigoEnviado(true);
      setAviso("Se este e-mail tiver acesso, enviamos um código de 6 dígitos. Confira também o spam.");
    });
  }

  async function confirmarCodigo(event: FormEvent) {
    event.preventDefault();
    await comCliente(async (supabase) => {
      const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: codigo.trim(), type: "email" });
      if (verifyError) {
        setError("Código inválido ou expirado. Peça um novo.");
        return;
      }
      entrou();
    });
  }

  async function enviarRecuperacao(event: FormEvent) {
    event.preventDefault();
    await comCliente(async (supabase) => {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/set-password`,
      });
      const falha = resetError ? falhaDeEnvio(resetError.message) : null;
      if (falha) {
        setError(falha);
        return;
      }
      setAviso("Se este e-mail tiver acesso, enviamos um link para criar uma senha nova. Abra o link uma vez só, neste mesmo navegador.");
    });
  }

  const campoEmail = (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-text-secondary">E-mail</span>
      <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={codigoEnviado} />
    </label>
  );

  const mensagens = (
    <>
      {error && <p role="alert" className="text-sm text-critical">{error}</p>}
      {aviso && <p className="text-sm text-text-secondary">{aviso}</p>}
    </>
  );

  return (
    <div className="flex flex-col gap-4 text-left">
      {modo !== "recuperar" && (
        <div className="grid grid-cols-2 gap-1 rounded-sm border border-border p-1 text-sm">
          {(["senha", "codigo"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => trocarModo(m)}
              className={m === modo ? "rounded-sm bg-accent-soft py-1.5 font-medium text-text-primary" : "rounded-sm py-1.5 text-text-secondary hover:bg-surface-raised"}
            >
              {m === "senha" ? "Senha" : "Código por e-mail"}
            </button>
          ))}
        </div>
      )}

      {modo === "senha" && (
        <form onSubmit={entrarComSenha} className="flex flex-col gap-4">
          {campoEmail}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Senha</span>
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {mensagens}
          <Button type="submit" loading={loading} className="w-full">Entrar</Button>
          <button type="button" onClick={() => trocarModo("recuperar")} className="text-center text-xs text-text-muted underline">
            Esqueci minha senha
          </button>
        </form>
      )}

      {modo === "codigo" && !codigoEnviado && (
        <form onSubmit={enviarCodigo} className="flex flex-col gap-4">
          {campoEmail}
          {mensagens}
          <Button type="submit" loading={loading} loadingText="Enviando…" className="w-full">Enviar código</Button>
        </form>
      )}

      {modo === "codigo" && codigoEnviado && (
        <form onSubmit={confirmarCodigo} className="flex flex-col gap-4">
          {campoEmail}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Código recebido</span>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,8}"
              maxLength={8}
              required
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              className="text-center text-lg tracking-[0.4em]"
            />
          </label>
          {mensagens}
          <Button type="submit" loading={loading} loadingText="Conferindo…" className="w-full">Entrar</Button>
          <button type="button" onClick={() => trocarModo("codigo")} className="text-center text-xs text-text-muted underline">
            Usar outro e-mail ou pedir novo código
          </button>
        </form>
      )}

      {modo === "recuperar" && (
        <form onSubmit={enviarRecuperacao} className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">Informe seu e-mail. Enviaremos um link para você criar uma senha nova.</p>
          {campoEmail}
          {mensagens}
          <Button type="submit" loading={loading} loadingText="Enviando…" className="w-full">Enviar link</Button>
          <button type="button" onClick={() => trocarModo("senha")} className="text-center text-xs text-text-muted underline">
            Voltar para o login
          </button>
        </form>
      )}
    </div>
  );
}
