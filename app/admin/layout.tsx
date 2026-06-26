import { MasterShell } from "@/components/master-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <MasterShell>{children}</MasterShell>;
}
