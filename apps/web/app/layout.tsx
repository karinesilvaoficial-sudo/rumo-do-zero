import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";

const manrope = localFont({
  src: [
    { path: "./fonts/manrope-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/manrope-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/manrope-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./fonts/manrope-latin-ext-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/manrope-latin-ext-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-manrope",
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "sans-serif"],
});

export const metadata: Metadata = {
  title: { default: "RUMO — finanças e novas rendas com clareza", template: "%s · RUMO" },
  description: "Organize suas finanças pessoais ou do seu negócio, planeje pagamentos e metas e transforme novas fontes de renda em um plano de execução.",
  icons: { icon: "/rumo-symbol.svg" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Lê o nonce da CSP (definido no proxy): força renderização dinâmica para o Next aplicar o nonce aos scripts.
  await headers();
  return (
    <html lang="pt-BR" className={manrope.variable} style={{ ["--rumo-font" as string]: "var(--font-manrope), system-ui, sans-serif" }}>
      <body>{children}</body>
    </html>
  );
}
