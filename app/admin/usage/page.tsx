import { redirect } from "next/navigation";

export default function AdminUsagePage() {
  redirect("/admin/master?section=overview");
}
