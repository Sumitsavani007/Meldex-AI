import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MasterRedirectPage() {
  const session = await auth();
  const role = session?.user?.role;

  if (!session?.user) redirect("/master/login");
  if (role === "OWNER" || role === "ADMIN") redirect("/admin/master");

  redirect("/master/login?error=not_master");
}
