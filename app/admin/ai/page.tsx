import { redirect } from "next/navigation";

export default function AdminAIPage() {
  redirect("/admin/master?section=ai");
}
