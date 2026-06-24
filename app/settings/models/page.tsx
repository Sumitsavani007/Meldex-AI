"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useState, useEffect } from "react";
import { Plus, Edit, Trash2 } from "lucide-react";

interface ModelConfig {
  id: string;
  provider: string;
  name: string;
  model: string;
  baseUrl?: string;
  isDefault: boolean;
}

export default function ModelConfigPage() {
  const { data: session } = useSession();
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) {
      redirect("/login");
    }
    fetchModels();
  }, [session]);

  const fetchModels = async () => {
    try {
      const res = await fetch("/api/models");
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
      }
    } catch (error) {
      console.error("Failed to fetch models:", error);
    } finally {
      setLoading(false);
    }
  };

  const providers = [
    { id: "OLLAMA", name: "Ollama (Local)" },
    { id: "OPENAI", name: "OpenAI" },
    { id: "DEEPSEEK", name: "DeepSeek" },
    { id: "ANTHROPIC", name: "Anthropic" },
    { id: "OPENROUTER", name: "OpenRouter" },
    { id: "CUSTOM_OPENAI_COMPATIBLE", name: "Custom OpenAI Compatible" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-ink via-slate-900 to-slate-800 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Model Configuration</h1>
            <p className="text-slate-400">Manage your AI model providers and settings</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-mint/20 hover:bg-mint/30 text-mint border border-mint/50 px-4 py-2 rounded-lg transition font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Model
          </button>
        </div>

        {showForm && (
          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6 mb-8">
            <h2 className="text-lg font-semibold text-white mb-6">Add New Model</h2>
            <form className="space-y-4" onSubmit={(e) => {
              e.preventDefault();
              // Handle form submission
              setShowForm(false);
            }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Provider</label>
                  <select className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-mint/50">
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Model Name</label>
                  <input
                    type="text"
                    placeholder="e.g., gpt-4"
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Display Name</label>
                  <input
                    type="text"
                    placeholder="e.g., GPT-4 Turbo"
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Base URL (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g., http://localhost:11434"
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint/50"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-300 mb-2">API Key (stored securely)</label>
                  <input
                    type="password"
                    placeholder="Your API key"
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint/50"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-mint/20 hover:bg-mint/30 text-mint border border-mint/50 py-2 rounded-lg transition font-medium"
                >
                  Save Model
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 bg-slate-700/50 hover:bg-slate-700 text-slate-300 border border-slate-600 py-2 rounded-lg transition font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="text-center text-slate-400">Loading models...</div>
        ) : (
          <div className="space-y-4">
            {models.length === 0 ? (
              <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-12 text-center">
                <p className="text-slate-400 mb-4">No models configured yet</p>
                <p className="text-sm text-slate-500">Add your first model to get started with local or cloud providers.</p>
              </div>
            ) : (
              models.map((model) => (
                <div
                  key={model.id}
                  className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6 flex items-center justify-between hover:border-mint/30 transition"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-white">{model.name}</h3>
                      {model.isDefault && (
                        <span className="px-2 py-1 bg-mint/20 text-mint border border-mint/30 text-xs rounded font-medium">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm text-slate-400">
                      <div>
                        <span className="text-slate-500">Provider:</span> {model.provider}
                      </div>
                      <div>
                        <span className="text-slate-500">Model:</span> {model.model}
                      </div>
                      {model.baseUrl && (
                        <div className="md:col-span-1">
                          <span className="text-slate-500">Base URL:</span> {model.baseUrl}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="p-2 hover:bg-slate-700 rounded transition text-slate-400 hover:text-white">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button className="p-2 hover:bg-slate-700 rounded transition text-slate-400 hover:text-white">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
