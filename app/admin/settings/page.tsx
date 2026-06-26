import { redirect } from "next/navigation";

export default function AdminSettingsPage() {
  redirect("/admin/master?section=runtime");
}
