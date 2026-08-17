import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "STIMMA OS",
  description: "Camada de inteligência e automação da operação da Dra. Larissa Andrade",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
