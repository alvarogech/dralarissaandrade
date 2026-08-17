export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-md border border-border p-8 text-center">
        <h1 className="font-serif text-xl text-text-primary">STIMMA OS</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Login da equipe será conectado ao Supabase Auth assim que o projeto estiver
          provisionado (ver <code>docs/DECISIONS.md</code>).
        </p>
      </div>
    </div>
  );
}
