import Image from "next/image";
import { SetPasswordForm } from "@/components/auth/SetPasswordForm";

export default function SetPasswordPage() {
  return (
    <div className="tema-la min-h-screen">
      <div className="flex items-center gap-3 bg-graphite px-6 py-4">
        <Image src="/brand/monograma-la-creme.png" alt="" width={24} height={26} priority />
        <p className="font-serif text-[14px] font-medium uppercase tracking-[0.2em] text-cream">Larissa Andrade</p>
      </div>
      <main className="mx-auto w-full max-w-[400px] px-5 py-12">
        <p className="fb-eyebrow">STIMMA OS · Clínica Stimma</p>
        <h1 className="fb-titulo mt-2">Defina sua senha</h1>
        <div className="mt-8 rounded-card border border-border bg-surface p-6 shadow-raised">
          <SetPasswordForm />
        </div>
      </main>
    </div>
  );
}
