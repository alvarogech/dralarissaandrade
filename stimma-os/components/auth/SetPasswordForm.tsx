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
 * O link de convite do Supabase verifica o token no servidor deles e
 * redireciona para cá já com uma sessão válida (tokens no hash da URL). O
 * cliente Supabase (createBrowserClient, detectSessionInUrl=true por
 * padrão) processa isso sozinho — só precisamos aguardar e então chamar
 * updateUser({ password }).
 */
export function SetPasswordForm() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setSessionState("invalid");
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) setSessionState("ready");
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setSessionState("ready");
      }
    });

    // Se depois de alguns segundos nenhuma sessão foi detectada, o link
    // provavelmente é inválido/expirado — não travar a pessoa num
    // spinner infinito.
    const timeout = setTimeout(() => {
      if (!active) return;
      setSessionState((current) => (current === "checking" ? "invalid" : current));
    }, 4000);

    return () => {
      active = false;
      clearTimeout(timeout);
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
        Este link é inválido ou expirou. Peça para a administração enviar um novo convite.
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
