"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useState } from "react";
import { User, Mail, Calendar } from "lucide-react";

export default function ProfileSettingsPage() {
  const { data: session, status } = useSession();
  const [isEditing, setIsEditing] = useState(false);

  if (status === "loading") {
    return <div className="min-h-screen bg-white p-8 text-sm text-slate-500 dark:bg-black dark:text-slate-400">Loading profile...</div>;
  }

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-white p-8 text-slate-950 dark:bg-black dark:text-white">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">Profile Settings</h1>
          <p className="text-slate-500 dark:text-slate-400">Manage your account information</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
          <div className="mb-8 flex items-center gap-4 border-b border-slate-200 pb-8 dark:border-white/10">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5">
              <User className="h-8 w-8 text-slate-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-950 dark:text-white">{session.user?.name || "User"}</h2>
              <p className="text-slate-500 dark:text-slate-400">{session.user?.email}</p>
            </div>
          </div>

          {!isEditing ? (
            <div className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
                  <Mail className="h-4 w-4 text-slate-500" />
                  <span className="text-slate-950 dark:text-white">{session.user?.email}</span>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Member Since</label>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
                  <Calendar className="h-4 w-4 text-slate-500" />
                  <span className="text-slate-950 dark:text-white">{new Date().toLocaleDateString()}</span>
                </div>
              </div>

              <button
                onClick={() => setIsEditing(true)}
                className="mx-focus w-full rounded-lg bg-slate-950 py-2 font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                Edit Profile
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Full Name
                </label>
                <input
                  id="name"
                  type="text"
                  defaultValue={session.user?.name || ""}
                  className="mx-focus w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-950 placeholder:text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setIsEditing(false)}
                  className="mx-focus flex-1 rounded-lg bg-slate-950 py-2 font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="mx-focus flex-1 rounded-lg border border-slate-200 bg-white py-2 font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.06]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
