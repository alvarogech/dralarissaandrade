import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-md border border-border p-8">
        <div className="mb-6 text-center">
          <h1 className="font-serif text-xl text-text-primary">STIMMA OS</h1>
          <p className="mt-1 text-sm text-text-muted">Clínica Stimma</p>
        </div>
        <LoginForm />
        <p className="mt-6 text-center text-xs text-text-muted">
          Acesso só existe se criado manualmente pela administração. Sem cadastro público.
        </p>
      </div>
    </div>
  );
}
