import { auth } from "@/lib/auth";
import DeviceConnectClient from "./device-connect-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DeviceConnectPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const params = await searchParams;
  const session = await auth();
  const code = params.code || "";
  if (!session?.user) {
    const callbackUrl = `/connect/device?code=${encodeURIComponent(code)}`;
    return (
      <main className="min-h-screen bg-ink text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-lg border border-white/10 bg-white/[0.04] p-6">
          <h1 className="text-xl font-semibold">Connect Meldex AI</h1>
          <p className="mt-2 text-sm text-slate-400">Sign in with Google, then approve the VS Code extension connection.</p>
          <a className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-black" href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}>
            Continue with Google
          </a>
        </div>
      </main>
    );
  }
  return <DeviceConnectClient code={code} email={session.user.email || ""} />;
}
