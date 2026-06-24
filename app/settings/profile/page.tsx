"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useState } from "react";
import { User, Mail, Calendar } from "lucide-react";

export default function ProfileSettingsPage() {
  const { data: session } = useSession();
  const [isEditing, setIsEditing] = useState(false);

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-ink via-slate-900 to-slate-800 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Profile Settings</h1>
          <p className="text-slate-400">Manage your account information</p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-8">
          <div className="flex items-center gap-4 mb-8 pb-8 border-b border-white/10">
            <div className="w-16 h-16 rounded-full bg-mint/10 border border-mint/30 flex items-center justify-center">
              <User className="w-8 h-8 text-mint" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">{session.user?.name || "User"}</h2>
              <p className="text-slate-400">{session.user?.email}</p>
            </div>
          </div>

          {!isEditing ? (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                <div className="flex items-center gap-2 p-3 bg-slate-700/30 border border-slate-600 rounded-lg">
                  <Mail className="w-4 h-4 text-slate-500" />
                  <span className="text-white">{session.user?.email}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Member Since</label>
                <div className="flex items-center gap-2 p-3 bg-slate-700/30 border border-slate-600 rounded-lg">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <span className="text-white">{new Date().toLocaleDateString()}</span>
                </div>
              </div>

              <button
                onClick={() => setIsEditing(true)}
                className="w-full bg-mint/20 hover:bg-mint/30 text-mint border border-mint/50 py-2 rounded-lg transition font-medium"
              >
                Edit Profile
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
                  Full Name
                </label>
                <input
                  id="name"
                  type="text"
                  defaultValue={session.user?.name || ""}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint/50"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex-1 bg-mint/20 hover:bg-mint/30 text-mint border border-mint/50 py-2 rounded-lg transition font-medium"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex-1 bg-slate-700/50 hover:bg-slate-700 text-slate-300 border border-slate-600 py-2 rounded-lg transition font-medium"
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
