import { redirect } from "next/navigation";

export default function AdminNotificationsPage() {
  redirect("/admin/master?section=notifications");
}
