import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function safeRelativePath(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export default async function AuthRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const params = await searchParams;
  const requested = safeRelativePath(params?.callbackUrl);
  const role = session?.user?.role;

  if (!session?.user) redirect("/login");
  if (role === "OWNER") redirect("/admin/master");
  if (role === "ADMIN") redirect(requested?.startsWith("/admin") ? requested : "/admin");

  redirect(requested && !requested.startsWith("/admin") ? requested : "/dashboard");
}
