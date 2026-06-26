"use client";

import Link from "next/link";
import { FileCode2, Folder, Search } from "lucide-react";
import { PanelCard, UserPanelShell } from "@/components/user-panel-shell";

const files = ["index.html", "style.css", "script.js", "README.md"];

export default function FilesPage() {
  return (
    <UserPanelShell title="Files" description="A clean explorer for workspace files and recent generated assets." eyebrow="Files">
      <PanelCard>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold">Recent files</h2>
          <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.04]"><Search className="size-4" /><input className="bg-transparent outline-none" placeholder="Search files" /></label>
        </div>
        <div className="grid gap-2">
          <Link href="/workspace" className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-3 text-sm font-medium hover:bg-violet-50 dark:bg-white/[0.04] dark:hover:bg-violet-500/10"><Folder className="size-4 text-violet-600" /> Workspace project files</Link>
          {files.map((file) => (
            <Link key={file} href="/workspace" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-slate-50 dark:hover:bg-white/[0.04]"><FileCode2 className="size-4 text-slate-500" /> {file}<span className="ml-auto text-xs text-slate-400">Open in workspace</span></Link>
          ))}
        </div>
      </PanelCard>
    </UserPanelShell>
  );
}
