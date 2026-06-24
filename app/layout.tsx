import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { Header } from "@/components/header";

export const metadata: Metadata = {
  title: "Meldex AI | Plan. Build. Debug. Deploy.",
  description: "A production-grade AI SaaS platform for planning, generating, editing, running, debugging, improving, and deploying software."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink font-sans antialiased">
        <AuthProvider>
          <div className="pointer-events-none fixed inset-0 grid-sheen opacity-35" />
          <div className="relative flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
