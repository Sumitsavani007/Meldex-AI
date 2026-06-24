"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, Trash2, Ban } from "lucide-react";

interface UserData {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
}

export default function UserManagementPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<UserData[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.role || !["ADMIN", "OWNER"].includes(session.user.role)) {
      redirect("/unauthorized");
    }
    
    // Fetch users - we'll need to create this API endpoint
    fetchUsers();
  }, [session]);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(
    (user) =>
      user.email.toLowerCase().includes(search.toLowerCase()) ||
      user.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-ink via-slate-900 to-slate-800 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">User Management</h1>
          <p className="text-slate-400">View and manage all users</p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint/50"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center text-slate-400">Loading users...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 text-slate-300 font-semibold">Email</th>
                  <th className="px-4 py-3 text-slate-300 font-semibold">Name</th>
                  <th className="px-4 py-3 text-slate-300 font-semibold">Role</th>
                  <th className="px-4 py-3 text-slate-300 font-semibold">Created</th>
                  <th className="px-4 py-3 text-slate-300 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-white/5 transition">
                    <td className="px-4 py-3 text-white">{user.email}</td>
                    <td className="px-4 py-3 text-slate-300">{user.name || "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        user.role === "ADMIN" || user.role === "OWNER"
                          ? "bg-mint/20 text-mint border border-mint/30"
                          : "bg-slate-700 text-slate-300 border border-slate-600"
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button className="p-2 hover:bg-red-500/20 rounded transition text-red-400">
                          <Ban className="w-4 h-4" />
                        </button>
                        <button className="p-2 hover:bg-red-500/20 rounded transition text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredUsers.length === 0 && (
          <div className="text-center text-slate-400 py-12">No users found</div>
        )}
      </div>
    </div>
  );
}
