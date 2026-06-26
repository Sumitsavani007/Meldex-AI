import { redirect } from "next/navigation";

export default function AdminBenchmarksPage() {
  redirect("/admin/master?section=diagnostics");
}
