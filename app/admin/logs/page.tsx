import { redirect } from "next/navigation";

export default function AdminLogsPage() {
  redirect("/admin/master?section=audit");
}
