import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "FLAME IN FREEFALL · Emberwatch SI",
  description:
    "Inteligencia de seguridad contra incendios en ambientes habitables — NASA PSI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="antialiased selection:bg-teal-500/30 selection:text-teal-200">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}