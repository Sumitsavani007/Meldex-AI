import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { Header } from "@/components/header";
import { ThemeProvider } from "@/components/theme-provider";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Meldex AI | Plan. Build. Debug. Deploy.",
  description: "A production-grade AI SaaS platform for planning, generating, editing, running, debugging, improving, and deploying software."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} min-h-screen overflow-x-hidden bg-white font-sans text-slate-950 antialiased dark:bg-[#0d0d0d] dark:text-white`}>
        <AuthProvider>
          <ThemeProvider>
            <div className="relative flex min-h-screen min-w-0 flex-col overflow-x-hidden">
              <Header />
              <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
            </div>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
