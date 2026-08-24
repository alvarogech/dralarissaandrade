import { SetPasswordForm } from "@/components/auth/SetPasswordForm";

export default function SetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-md border border-border p-8">
        <div className="mb-6 text-center">
          <h1 className="font-serif text-xl text-text-primary">STIMMA OS</h1>
          <p className="mt-1 text-sm text-text-muted">Defina sua senha de acesso</p>
        </div>
        <SetPasswordForm />
      </div>
    </div>
  );
}
