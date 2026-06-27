"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: "INFO" | "SUCCESS" | "WARNING" | "ERROR" | "SECURITY";
  actionUrl?: string | null;
  readAt?: string | null;
  createdAt: string;
};

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    }).catch(() => undefined);
    await load();
  }

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_read", ids: [id] }),
    }).catch(() => undefined);
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
    setUnreadCount((value) => Math.max(0, value - 1));
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="mx-focus relative grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08]"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="size-4" />
        {unreadCount > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{Math.min(unreadCount, 99)}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/15 dark:border-white/10 dark:bg-[#111113] dark:shadow-black/40">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-white/10">
            <div>
              <p className="text-sm font-semibold">Notifications</p>
              <p className="text-xs text-slate-500">{unreadCount} unread</p>
            </div>
            <button onClick={markAllRead} disabled={!unreadCount} className="mx-focus inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-violet-200 dark:hover:bg-violet-500/10">
              <CheckCheck className="size-3.5" /> Mark all
            </button>
          </div>
          <div className="max-h-[420px] overflow-y-auto p-2">
            {loading && !items.length && <div className="p-6 text-center text-sm text-slate-500">Loading alerts...</div>}
            {!loading && !items.length && (
              <div className="p-8 text-center">
                <CircleAlert className="mx-auto size-6 text-slate-300" />
                <p className="mt-2 text-sm font-medium">No notifications</p>
                <p className="mt-1 text-xs text-slate-500">Billing, usage, workspace, and security alerts appear here.</p>
              </div>
            )}
            {items.map((item) => {
              const content = (
                <div className={cn(
                  "rounded-xl px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-white/[0.05]",
                  !item.readAt && "bg-violet-50/70 dark:bg-violet-500/10",
                )}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold">{item.title}</p>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      item.severity === "ERROR" && "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-200",
                      item.severity === "WARNING" && "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200",
                      item.severity === "SECURITY" && "bg-slate-900 text-white dark:bg-white dark:text-slate-950",
                      item.severity === "SUCCESS" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200",
                      item.severity === "INFO" && "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
                    )}>{item.severity.toLowerCase()}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.message}</p>
                  <p className="mt-2 text-[11px] text-slate-400">{timeAgo(item.createdAt)} ago</p>
                </div>
              );
              return item.actionUrl ? (
                <Link key={item.id} href={item.actionUrl} onClick={() => void markRead(item.id)} className="block">
                  {content}
                </Link>
              ) : (
                <button key={item.id} onClick={() => void markRead(item.id)} className="block w-full text-left">
                  {content}
                </button>
              );
            })}
          </div>
          <div className="border-t border-slate-200 p-2 dark:border-white/10">
            <Link href="/settings/notifications" onClick={() => setOpen(false)} className="mx-focus block rounded-xl px-3 py-2 text-center text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/[0.05]">
              Manage notification preferences
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
