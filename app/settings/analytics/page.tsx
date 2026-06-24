"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useEffect, useState } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, Users, Zap, HardDrive } from "lucide-react";

interface AnalyticsData {
  dailyActiveUsers: Array<{ date: string; users: number }>;
  agentRuns: Array<{ date: string; runs: number }>;
  modelUsage: Array<{ model: string; tokens: number }>;
  storageUsage: Array<{ date: string; usage: number }>;
}

export default function AnalyticsPage() {
  const { data: session } = useSession();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) {
      redirect("/login");
    }
    fetchAnalytics();
  }, [session]);

  const fetchAnalytics = async () => {
    try {
      // Generate sample data for demonstration
      const mockData: AnalyticsData = {
        dailyActiveUsers: [
          { date: "Mon", users: 4 },
          { date: "Tue", users: 6 },
          { date: "Wed", users: 8 },
          { date: "Thu", users: 10 },
          { date: "Fri", users: 12 },
          { date: "Sat", users: 8 },
          { date: "Sun", users: 5 },
        ],
        agentRuns: [
          { date: "Mon", runs: 15 },
          { date: "Tue", runs: 22 },
          { date: "Wed", runs: 28 },
          { date: "Thu", runs: 35 },
          { date: "Fri", runs: 42 },
          { date: "Sat", runs: 30 },
          { date: "Sun", runs: 18 },
        ],
        modelUsage: [
          { model: "GPT-4", tokens: 125000 },
          { model: "Claude", tokens: 85000 },
          { model: "Ollama", tokens: 95000 },
          { model: "DeepSeek", tokens: 45000 },
        ],
        storageUsage: [
          { date: "Day 1", usage: 500 },
          { date: "Day 2", usage: 750 },
          { date: "Day 3", usage: 1200 },
          { date: "Day 4", usage: 1800 },
          { date: "Day 5", usage: 2100 },
          { date: "Day 6", usage: 2400 },
          { date: "Day 7", usage: 2800 },
        ],
      };
      setAnalytics(mockData);
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-ink via-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-slate-400">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-ink via-slate-900 to-slate-800 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Analytics</h1>
          <p className="text-slate-400">Monitor your usage and performance metrics</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Active Users (7d)</p>
                <p className="text-3xl font-bold text-white">42</p>
              </div>
              <Users className="w-8 h-8 text-mint opacity-20" />
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Agent Runs (7d)</p>
                <p className="text-3xl font-bold text-white">190</p>
              </div>
              <Zap className="w-8 h-8 text-yellow-400 opacity-20" />
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Total Tokens</p>
                <p className="text-3xl font-bold text-white">350k</p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-400 opacity-20" />
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Storage Used</p>
                <p className="text-3xl font-bold text-white">2.8 GB</p>
              </div>
              <HardDrive className="w-8 h-8 text-green-400 opacity-20" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Daily Active Users</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics?.dailyActiveUsers || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569" }} />
                <Line type="monotone" dataKey="users" stroke="#76f4c3" strokeWidth={2} dot={{ fill: "#76f4c3" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Agent Runs</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics?.agentRuns || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569" }} />
                <Bar dataKey="runs" fill="#76f4c3" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Model Usage Distribution</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics?.modelUsage || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" stroke="#94a3b8" />
                <YAxis dataKey="model" type="category" stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569" }} />
                <Bar dataKey="tokens" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Storage Usage Trend</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics?.storageUsage || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569" }} />
                <Legend wrapperStyle={{ color: "#94a3b8" }} />
                <Line
                  type="monotone"
                  dataKey="usage"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ fill: "#10b981" }}
                  name="Storage (MB)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
