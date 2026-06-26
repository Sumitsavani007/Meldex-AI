import { redirect } from "next/navigation";

export default function AdminAuditPage() {
  redirect("/admin/master?section=audit");
}
