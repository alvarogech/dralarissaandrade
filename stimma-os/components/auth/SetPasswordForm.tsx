"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

type SessionState = "checking" | "ready" | "invalid";

/**
 * Tela final do fluxo de convite/recuperação de senha (ver docs/SECURITY.md
 * — nunca manuseamos a senha em texto claro em automação; aqui é a própria
 * pessoa digitando no navegador dela).
 *
 * O link de convite do Supabase (sem SMTP customizado, presos ao template
 * padrão) verifica o token no servidor deles em `/auth/v1/verify` e
 * redireciona para cá já com uma sessão válida (tokens no hash da URL) OU,
 * se o link já foi usado/expirou, com `#error=...&error_description=...`
 * no hash. O cliente Supabase (createBrowserClient, detectSessionInUrl=true
 * por padrão) processa isso sozinho — só precisamos aguardar.
 *
 * IMPORTANTE: o hash é de uso único — assim que processado com sucesso, o
 * token já foi consumido. Reabrir o MESMO link do e-mail uma segunda vez
 * (ex.: clicar de novo, ou o cliente de e-mail pré-carregando o link) vai
 * bater em `/verify` de novo e voltar com erro, mesmo que a primeira vez
 * tenha funcionado — por isso a pessoa deve clicar só uma vez e, se a
 * sessão já foi detectada aqui, seguir direto para definir a senha nesta
 * mesma aba.
 */
export function SetPasswordForm() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // O Supabase às vezes devolve o erro (link já usado/expirado) como
    // parâmetro no hash em vez de estabelecer sessão — checamos isso
    // explicitamente para dar uma mensagem precisa em vez de só "inválido"
    // depois de um timeout genérico.
    if (typeof window !== "undefined" && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const hashError = hashParams.get("error_description") || hashParams.get("error");
      if (hashError) {
        setInvalidReason(decodeURIComponent(hashError.replace(/\+/g, " ")));
        setSessionState("invalid");
        return;
      }
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setInvalidReason("Supabase não configurado neste ambiente.");
      setSessionState("invalid");
      return;
    }

    let active = true;

    function markReady() {
      if (!active) return;
      setSessionState("ready");
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady();
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        markReady();
      }
    });

    // Fallback: se por algum motivo o evento de auth não disparar (ex.:
    // corrida entre a inicialização do cliente e o parsing do hash),
    // reconferimos a sessão algumas vezes antes de desistir. Um timeout
    // único e curto arriscava marcar "inválido" um link que na verdade
    // era válido só um pouco lento para processar.
    let attempts = 0;
    const maxAttempts = 8; // ~8s no total
    const poll = setInterval(() => {
      if (!active) return;
      attempts += 1;
      supabase.auth.getSession().then(({ data }) => {
        if (!active) return;
        if (data.session) {
          markReady();
          return;
        }
        if (attempts >= maxAttempts) {
          setSessionState((current) => {
            if (current !== "checking") return current;
            setInvalidReason(
              "Não conseguimos validar este link. Se você já clicou nele antes, ele pode ter sido usado — peça um novo."
            );
            return "invalid";
          });
        }
      });
    }, 1000);

    return () => {
      active = false;
      clearInterval(poll);
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase não configurado neste ambiente.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError("Não foi possível definir a senha. Peça um novo convite à administração.");
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      router.push("/hoje");
      router.refresh();
    }, 1200);
  }

  if (sessionState === "checking") {
    return <p className="text-sm text-text-muted">Validando seu link…</p>;
  }

  if (sessionState === "invalid") {
    return (
      <p role="alert" className="text-sm text-critical">
        {invalidReason
          ? `Este link não pôde ser validado: ${invalidReason}. `
          : "Este link é inválido ou expirou. "}
        Peça para a administração enviar um novo convite — e abra o link apenas uma vez, na
        mesma aba onde vai definir a senha.
      </p>
    );
  }

  if (success) {
    return <p className="text-sm text-text-primary">Senha definida! Redirecionando…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-text-secondary">Nova senha</span>
        <Input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-text-secondary">Confirmar senha</span>
        <Input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      )}

      <Button type="submit" loading={loading} loadingText="Salvando…" className="w-full">
        Definir senha
      </Button>
    </form>
  );
}
