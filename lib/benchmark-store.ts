import fs from "fs";
import path from "path";

export interface BenchmarkDashboardSummary {
  id: string;
  createdAt: string;
  engine: string;
  projectsTested: number;
  tasksCompleted: number;
  successRate: number;
  averageRetries: number;
  averageTimeMs: number;
  failures: number;
  frameworkRankings: Record<string, number>;
  qualityTrend: "improving" | "stable" | "regressing" | "new";
  regressionHistory: Array<{ metric: string; previous: number; current: number; severity: string; detail: string }>;
  recommendations: string[];
  reports: string[];
  frameworkProfiles: string[];
}

const DEFAULT_PROFILES = [
  "Next.js", "React", "Vue", "Angular", "Node", "Express", "NestJS", "Laravel", "PHP",
  "FastAPI", "Django", "Flask", "Go", "Rust", "Java", "Electron", "React Native", "Expo", "Static HTML",
];

export function benchmarkLabDir() {
  return path.resolve(process.env.MELDEX_BENCHMARK_DIR || path.join(process.cwd(), ".meldex-benchmarks", "benchmark-lab"));
}

export function readBenchmarkSummary(): BenchmarkDashboardSummary {
  const file = path.join(benchmarkLabDir(), "latest-summary.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<BenchmarkDashboardSummary>;
    return {
      id: parsed.id || "no-runs-yet",
      createdAt: parsed.createdAt || new Date(0).toISOString(),
      engine: parsed.engine || "not-started",
      projectsTested: parsed.projectsTested || 0,
      tasksCompleted: parsed.tasksCompleted || 0,
      successRate: parsed.successRate || 0,
      averageRetries: parsed.averageRetries || 0,
      averageTimeMs: parsed.averageTimeMs || 0,
      failures: parsed.failures || 0,
      frameworkRankings: parsed.frameworkRankings || {},
      qualityTrend: parsed.qualityTrend || "new",
      regressionHistory: Array.isArray(parsed.regressionHistory) ? parsed.regressionHistory : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
      frameworkProfiles: Array.isArray(parsed.frameworkProfiles) ? parsed.frameworkProfiles : DEFAULT_PROFILES,
    };
  } catch {
    return {
      id: "no-runs-yet",
      createdAt: new Date(0).toISOString(),
      engine: "not-started",
      projectsTested: 0,
      tasksCompleted: 0,
      successRate: 0,
      averageRetries: 0,
      averageTimeMs: 0,
      failures: 0,
      frameworkRankings: {},
      qualityTrend: "new",
      regressionHistory: [],
      recommendations: ["Run `meldex-agent benchmark --offline --tasks 3` to create the first lab report."],
      reports: [],
      frameworkProfiles: DEFAULT_PROFILES,
    };
  }
}

export function readBenchmarkFailureCount() {
  try {
    const file = path.join(benchmarkLabDir(), "failure-database.json");
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { failures?: unknown[] };
    return Array.isArray(parsed.failures) ? parsed.failures.length : 0;
  } catch {
    return 0;
  }
}
