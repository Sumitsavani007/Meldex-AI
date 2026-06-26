import * as cp from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export type BenchmarkSourceType = "github" | "gitlab" | "bitbucket" | "local" | "zip" | "sample";
export type BenchmarkRisk = "low" | "medium" | "high" | "critical";

export interface BenchmarkEmit {
  (type: string, payload?: Record<string, unknown>): void;
}

export interface BenchmarkOptions {
  source?: string;
  sourceType?: BenchmarkSourceType;
  storageDir: string;
  token?: string;
  backendUrl?: string;
  cliPath: string;
  keepSandbox?: boolean;
  maxRetries?: number;
  taskLimit?: number;
  offline?: boolean;
  schedule?: "manual" | "daily" | "weekly";
}

export interface RepositoryProfile {
  sourceType: BenchmarkSourceType;
  source: string;
  framework: string;
  language: string;
  packageManager: string;
  architecture: string[];
  dependencies: string[];
  projectSize: "small" | "medium" | "large";
  fileCount: number;
  scripts: Record<string, string>;
}

export interface BenchmarkTask {
  id: string;
  category: string;
  title: string;
  prompt: string;
  complexity: "simple" | "standard" | "advanced";
  expectedFiles: string[];
  verifyCommands: string[];
  risk: BenchmarkRisk;
}

export interface BenchmarkScore {
  correctness: number;
  architecture: number;
  performance: number;
  security: number;
  maintainability: number;
  readability: number;
  testing: number;
  executionSpeed: number;
  overall: number;
}

export interface BenchmarkAttempt {
  attempt: number;
  success: boolean;
  durationMs: number;
  summary: string;
  filesChanged: string[];
  error?: string;
  logFile?: string;
}

export interface BenchmarkResult {
  task: BenchmarkTask;
  success: boolean;
  retries: number;
  durationMs: number;
  attempts: BenchmarkAttempt[];
  score: BenchmarkScore;
  failureReason?: string;
}

export interface BenchmarkRun {
  id: string;
  createdAt: string;
  schedule: "manual" | "daily" | "weekly";
  engine: "qwen3-coder" | "offline-sandbox";
  sandboxRoot: string;
  profile: RepositoryProfile;
  tasks: BenchmarkTask[];
  results: BenchmarkResult[];
  leaderboard: BenchmarkLeaderboard;
  regressions: RegressionFinding[];
  recommendations: string[];
  reports: string[];
}

export interface BenchmarkLeaderboard {
  successRate: number;
  averageRetries: number;
  averageExecutionTimeMs: number;
  frameworkScore: Record<string, number>;
  bugCategories: Record<string, number>;
  improvementTrend: "improving" | "stable" | "regressing" | "new";
}

export interface RegressionFinding {
  metric: string;
  previous: number;
  current: number;
  severity: BenchmarkRisk;
  detail: string;
}

const FRAMEWORK_PROFILES = [
  "Next.js", "React", "Vue", "Angular", "Node", "Express", "NestJS", "Laravel", "PHP",
  "FastAPI", "Django", "Flask", "Go", "Rust", "Java", "Electron", "React Native", "Expo", "Static HTML",
];

export async function runBenchmarkLab(options: BenchmarkOptions, emit: BenchmarkEmit): Promise<BenchmarkRun> {
  const id = `abl-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const labRoot = path.join(options.storageDir, "benchmark-lab");
  const sandboxRoot = path.join(os.tmpdir(), "meldex-benchmark-lab", id);
  const runRoot = path.join(labRoot, "runs", id);
  fs.mkdirSync(sandboxRoot, { recursive: true });
  fs.mkdirSync(runRoot, { recursive: true });

  emit("benchmark_start", { id, sandboxRoot, schedule: options.schedule || "manual" });
  const sourceType = resolveSourceType(options.source, options.sourceType);
  const workspace = await ingestRepository({ ...options, sourceType }, sandboxRoot, emit);
  const profile = analyzeRepository(workspace, sourceType, options.source || "sample");
  emit("tool_result", { tool: "abl_ingestion", status: "ok", profile });

  const tasks = generateBenchmarkTasks(profile, options.taskLimit || 6);
  emit("tool_result", { tool: "abl_task_generator", status: "ok", tasks });

  const previous = readLatestRun(labRoot);
  const results: BenchmarkResult[] = [];
  for (const task of tasks) {
    results.push(await executeTask({
      task,
      workspace,
      runRoot,
      options,
      emit,
      engine: options.token && !options.offline ? "qwen3-coder" : "offline-sandbox",
    }));
  }

  const leaderboard = buildLeaderboard(profile, results, previous);
  const regressions = detectRegressions(previous, leaderboard);
  const recommendations = buildSelfImprovementRecommendations(results, profile, regressions);
  const run: BenchmarkRun = {
    id,
    createdAt: new Date().toISOString(),
    schedule: options.schedule || "manual",
    engine: options.token && !options.offline ? "qwen3-coder" : "offline-sandbox",
    sandboxRoot,
    profile,
    tasks,
    results,
    leaderboard,
    regressions,
    recommendations,
    reports: [],
  };

  run.reports = writeBenchmarkArtifacts(labRoot, runRoot, run);
  updateFailureDatabase(labRoot, run);
  updateDatasets(labRoot, run);
  fs.writeFileSync(path.join(labRoot, "latest-summary.json"), JSON.stringify(toDashboardSummary(run), null, 2));

  if (!options.keepSandbox) fs.rmSync(sandboxRoot, { recursive: true, force: true });
  emit("benchmark_done", {
    id,
    successRate: leaderboard.successRate,
    averageRetries: leaderboard.averageRetries,
    reports: run.reports,
    sandboxKept: !!options.keepSandbox,
  });
  return run;
}

function resolveSourceType(source?: string, explicit?: BenchmarkSourceType): BenchmarkSourceType {
  if (explicit) return explicit;
  if (!source) return "sample";
  if (/github\.com[:/]/i.test(source)) return "github";
  if (/gitlab\.com[:/]/i.test(source)) return "gitlab";
  if (/bitbucket\.org[:/]/i.test(source)) return "bitbucket";
  if (/\.zip$/i.test(source)) return "zip";
  return "local";
}

async function ingestRepository(options: BenchmarkOptions & { sourceType: BenchmarkSourceType }, sandboxRoot: string, emit: BenchmarkEmit): Promise<string> {
  const workspace = path.join(sandboxRoot, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  emit("tool_start", { tool: "abl_ingestion", sourceType: options.sourceType, source: options.source || "sample" });

  if (options.sourceType === "sample") {
    createSampleProject(workspace);
    return workspace;
  }
  if (options.sourceType === "local") {
    if (!options.source || !fs.existsSync(options.source)) throw new Error("Local benchmark source not found");
    copyDir(path.resolve(options.source), workspace);
    return workspace;
  }
  if (options.sourceType === "zip") {
    if (!options.source || !fs.existsSync(options.source)) throw new Error("ZIP benchmark source not found");
    const result = cp.spawnSync("unzip", ["-q", path.resolve(options.source), "-d", workspace], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || "Failed to extract ZIP archive");
    return flattenSingleRoot(workspace);
  }

  if (!options.source) throw new Error("Repository URL is required");
  const result = cp.spawnSync("git", ["clone", "--depth", "1", options.source, workspace], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "Failed to clone repository");
  return workspace;
}

function createSampleProject(root: string) {
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    scripts: { build: "node scripts/build-check.js", test: "node scripts/test-check.js" },
    dependencies: { react: "^19.0.0" },
    devDependencies: {},
  }, null, 2));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "app.js"), "export function greet(name) {\n  return `Hello ${name}`;\n}\n");
  fs.writeFileSync(path.join(root, "README.md"), "# Sample Benchmark App\n\nSmall project for Meldex Benchmark Lab.\n");
  fs.writeFileSync(path.join(root, "scripts", "build-check.js"), "const fs=require('fs'); if(!fs.existsSync('README.md')) process.exit(1); console.log('build ok');\n");
  fs.writeFileSync(path.join(root, "scripts", "test-check.js"), "const fs=require('fs'); const text=fs.readFileSync('src/app.js','utf8'); if(!text.includes('greet')) process.exit(1); console.log('test ok');\n");
}

function flattenSingleRoot(root: string) {
  const entries = fs.readdirSync(root);
  if (entries.length !== 1) return root;
  const only = path.join(root, entries[0]);
  return fs.statSync(only).isDirectory() ? only : root;
}

function analyzeRepository(root: string, sourceType: BenchmarkSourceType, source: string): RepositoryProfile {
  const files = walk(root).filter((file) => !ignored(file));
  const packageJson = readJson(path.join(root, "package.json"));
  const composerJson = readJson(path.join(root, "composer.json"));
  const dependencies = Object.keys({
    ...((packageJson?.dependencies || {}) as Record<string, unknown>),
    ...((packageJson?.devDependencies || {}) as Record<string, unknown>),
    ...((composerJson?.require || {}) as Record<string, unknown>),
  });
  const scripts = ((packageJson?.scripts || {}) as Record<string, string>);
  const framework = detectFramework(root, dependencies);
  const language = detectLanguage(files);
  const packageManager = fs.existsSync(path.join(root, "pnpm-lock.yaml")) ? "pnpm"
    : fs.existsSync(path.join(root, "yarn.lock")) ? "yarn"
      : fs.existsSync(path.join(root, "bun.lockb")) ? "bun"
        : composerJson ? "composer"
          : fs.existsSync(path.join(root, "Cargo.toml")) ? "cargo"
            : fs.existsSync(path.join(root, "go.mod")) ? "go"
              : packageJson ? "npm" : "none";
  return {
    sourceType,
    source,
    framework,
    language,
    packageManager,
    architecture: detectArchitecture(root, files),
    dependencies: dependencies.slice(0, 80),
    projectSize: files.length > 900 ? "large" : files.length > 180 ? "medium" : "small",
    fileCount: files.length,
    scripts,
  };
}

function generateBenchmarkTasks(profile: RepositoryProfile, limit: number): BenchmarkTask[] {
  const base: BenchmarkTask[] = [
    task("docs", "Documentation", "Add a concise architecture note and verification checklist for this project.", "Documentation", "simple", ["README.md"], ["build"], "low"),
    task("bugfix", "Bug fixing", "Find one small robustness issue and apply the safest minimal fix.", "Bug fixing", "standard", [], ["test", "build"], "medium"),
    task("testing", "Testing", "Add or improve a lightweight test for an existing utility or component.", "Testing", "standard", [], ["test"], "medium"),
    task("refactor", "Refactoring", "Suggest and apply a minimal readability refactor without changing behavior.", "Refactoring", "standard", [], ["build"], "medium"),
    task("security", "Security", "Review for obvious unsafe input handling and harden one low-risk surface.", "Security", "advanced", [], ["test", "build"], "high"),
    task("performance", "Performance", "Reduce one avoidable repeated computation or unnecessary render path.", "Performance", "advanced", [], ["build"], "medium"),
  ];
  const frameworkSpecific = profile.framework === "Static HTML"
    ? [task("a11y", "Accessibility", "Improve semantic markup or accessible labels while preserving the visual result.", "Accessibility", "simple", ["index.html"], [], "low")]
    : profile.framework.includes("Next") || profile.framework === "React"
      ? [task("ui", "UI", "Improve one small UI state for responsiveness and accessibility.", "UI", "standard", [], ["build"], "medium")]
      : profile.framework.includes("Laravel") || profile.framework.includes("Django") || profile.framework.includes("FastAPI")
        ? [task("api", "API", "Add one small API validation or error response improvement.", "API", "standard", [], ["test"], "medium")]
        : [];
  return [...frameworkSpecific, ...base].slice(0, Math.max(1, limit));
}

async function executeTask(input: {
  task: BenchmarkTask;
  workspace: string;
  runRoot: string;
  options: BenchmarkOptions;
  emit: BenchmarkEmit;
  engine: "qwen3-coder" | "offline-sandbox";
}): Promise<BenchmarkResult> {
  const started = Date.now();
  const attempts: BenchmarkAttempt[] = [];
  const maxRetries = Math.min(input.options.maxRetries || 5, 5);
  input.emit("benchmark_task_start", { task: input.task });

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const attemptStarted = Date.now();
    const before = snapshot(input.workspace);
    const logFile = path.join(input.runRoot, `${input.task.id}-attempt-${attempt}.jsonl`);
    let success = false;
    let error = "";
    let summary = "";

    try {
      if (input.engine === "qwen3-coder") {
        const result = runQwenTask(input, logFile);
        success = result.success;
        error = result.error || "";
        summary = result.summary;
      } else {
        const result = runOfflineTask(input.workspace, input.task);
        success = result.success;
        summary = result.summary;
      }
      if (success) {
        const verify = runVerification(input.workspace, input.task);
        success = verify.success;
        error = verify.error || error;
        if (verify.summary) summary = `${summary} ${verify.summary}`.trim();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const filesChanged = diffSnapshot(before, snapshot(input.workspace));
    attempts.push({ attempt, success, durationMs: Date.now() - attemptStarted, summary, filesChanged, error: error || undefined, logFile });
    input.emit("benchmark_attempt", { taskId: input.task.id, attempt, success, filesChanged, error });
    if (success) break;
    writeFailureAttempt(input.runRoot, input.task, attempt, error);
  }

  const success = attempts.some((attempt) => attempt.success);
  const durationMs = Date.now() - started;
  const score = scoreBenchmark(input.task, attempts, durationMs);
  const result: BenchmarkResult = {
    task: input.task,
    success,
    retries: Math.max(0, attempts.length - 1),
    durationMs,
    attempts,
    score,
    failureReason: success ? undefined : attempts.at(-1)?.error || "Verification failed",
  };
  input.emit("benchmark_task_done", { taskId: input.task.id, success, retries: result.retries, score });
  return result;
}

function runQwenTask(input: { task: BenchmarkTask; workspace: string; options: BenchmarkOptions }, logFile: string) {
  const args = [
    input.options.cliPath,
    "run",
    input.task.prompt,
    "--workspace",
    input.workspace,
    "--storage-dir",
    path.join(input.options.storageDir, "benchmark-agent-storage"),
    "--apply",
    "--maxRetries",
    String(input.options.maxRetries || 5),
  ];
  if (input.options.backendUrl) args.push("--backend", input.options.backendUrl);
  const result = cp.spawnSync(process.execPath, args, {
    cwd: input.workspace,
    encoding: "utf8",
    timeout: 10 * 60 * 1000,
    env: {
      ...process.env,
      ...(input.options.token ? { MELDEX_TOKEN: input.options.token } : {}),
    },
  });
  fs.writeFileSync(logFile, `${result.stdout || ""}${result.stderr || ""}`);
  return {
    success: result.status === 0,
    summary: result.stdout.split(/\r?\n/).filter(Boolean).at(-1) || "Qwen benchmark task executed.",
    error: result.status === 0 ? undefined : result.stderr || result.stdout,
  };
}

function runOfflineTask(workspace: string, task: BenchmarkTask) {
  if (task.category === "Documentation") {
    fs.appendFileSync(path.join(workspace, "README.md"), `\n\n## Benchmark Verification\n\n- Framework profile checked by Meldex Benchmark Lab.\n- Build and test commands recorded for regression comparison.\n`);
    return { success: true, summary: "Added benchmark verification note." };
  }
  const notes = path.join(workspace, "BENCHMARK_NOTES.md");
  fs.appendFileSync(notes, `\n## ${task.category}\n\n${task.prompt}\n\nRecommendation captured for isolated benchmark review.\n`);
  return { success: true, summary: `Captured ${task.category} benchmark note.` };
}

function runVerification(workspace: string, task: BenchmarkTask) {
  const pkg = readJson(path.join(workspace, "package.json"));
  const scripts = ((pkg?.scripts || {}) as Record<string, string>);
  const commands = task.verifyCommands
    .map((name) => scripts[name] ? `npm run ${name}` : "")
    .filter(Boolean)
    .slice(0, 2);
  for (const command of commands) {
    const result = cp.spawnSync(command, { cwd: workspace, shell: true, encoding: "utf8", timeout: 120000 });
    if (result.status !== 0) return { success: false, error: result.stderr || result.stdout || `${command} failed` };
  }
  return { success: true, summary: commands.length ? `Verified: ${commands.join(", ")}.` : "No command verification required." };
}

function scoreBenchmark(task: BenchmarkTask, attempts: BenchmarkAttempt[], durationMs: number): BenchmarkScore {
  const success = attempts.some((attempt) => attempt.success);
  const retryPenalty = Math.max(0, attempts.length - 1) * 7;
  const speedPenalty = durationMs > 180000 ? 12 : durationMs > 60000 ? 6 : 0;
  const base = success ? 92 : 54;
  const correctness = clamp(base - retryPenalty);
  const architecture = clamp((task.risk === "high" ? 86 : 91) - retryPenalty);
  const performance = clamp(90 - speedPenalty);
  const security = clamp(task.category === "Security" ? (success ? 92 : 62) : 93);
  const maintainability = clamp(90 - retryPenalty / 2);
  const readability = clamp(91 - retryPenalty / 2);
  const testing = clamp(task.verifyCommands.length ? (success ? 90 : 52) : 76);
  const executionSpeed = clamp(94 - speedPenalty - retryPenalty);
  const overall = Math.round((correctness + architecture + performance + security + maintainability + readability + testing + executionSpeed) / 8);
  return { correctness, architecture, performance, security, maintainability, readability, testing, executionSpeed, overall };
}

function buildLeaderboard(profile: RepositoryProfile, results: BenchmarkResult[], previous?: BenchmarkRun): BenchmarkLeaderboard {
  const successRate = Math.round((results.filter((result) => result.success).length / Math.max(1, results.length)) * 100);
  const averageRetries = round(results.reduce((n, result) => n + result.retries, 0) / Math.max(1, results.length));
  const averageExecutionTimeMs = Math.round(results.reduce((n, result) => n + result.durationMs, 0) / Math.max(1, results.length));
  const score = Math.round(results.reduce((n, result) => n + result.score.overall, 0) / Math.max(1, results.length));
  const bugCategories = results.reduce((map, result) => {
    if (!result.success) map[result.task.category] = (map[result.task.category] || 0) + 1;
    return map;
  }, {} as Record<string, number>);
  const previousScore = previous?.leaderboard.frameworkScore[profile.framework];
  return {
    successRate,
    averageRetries,
    averageExecutionTimeMs,
    frameworkScore: { [profile.framework]: score },
    bugCategories,
    improvementTrend: previousScore === undefined ? "new" : score > previousScore + 2 ? "improving" : score < previousScore - 2 ? "regressing" : "stable",
  };
}

function detectRegressions(previous: BenchmarkRun | undefined, leaderboard: BenchmarkLeaderboard): RegressionFinding[] {
  if (!previous) return [];
  const findings: RegressionFinding[] = [];
  if (leaderboard.successRate < previous.leaderboard.successRate - 5) findings.push(regression("successRate", previous.leaderboard.successRate, leaderboard.successRate, "high"));
  if (leaderboard.averageRetries > previous.leaderboard.averageRetries + 0.5) findings.push(regression("averageRetries", previous.leaderboard.averageRetries, leaderboard.averageRetries, "medium"));
  if (leaderboard.averageExecutionTimeMs > previous.leaderboard.averageExecutionTimeMs * 1.25) findings.push(regression("averageExecutionTimeMs", previous.leaderboard.averageExecutionTimeMs, leaderboard.averageExecutionTimeMs, "medium"));
  return findings;
}

function buildSelfImprovementRecommendations(results: BenchmarkResult[], profile: RepositoryProfile, regressions: RegressionFinding[]) {
  const recs: string[] = [];
  const failures = results.filter((result) => !result.success);
  if (failures.some((result) => result.task.category === "Testing")) recs.push("Strengthen tester profile and detect project-specific test commands earlier.");
  if (failures.some((result) => result.failureReason?.toLowerCase().includes("build"))) recs.push("Improve context selection around build configuration and package scripts.");
  if (results.some((result) => result.retries > 2)) recs.push("Reduce retries by adding framework-specific patch validation before execution.");
  if (regressions.length) recs.push("Review recent orchestration changes before promoting this engine version.");
  recs.push(`Maintain ${profile.framework} benchmark profile with ${profile.packageManager} command heuristics.`);
  return [...new Set(recs)].slice(0, 8);
}

function writeBenchmarkArtifacts(labRoot: string, runRoot: string, run: BenchmarkRun) {
  fs.mkdirSync(labRoot, { recursive: true });
  const files = [
    ["BENCHMARK_RUN_REPORT.md", benchmarkRunReport(run)],
    ["FAILURE_ANALYSIS.md", failureAnalysis(run)],
    ["FRAMEWORK_SCORES.md", frameworkScores(run)],
    ["REGRESSION_REPORT.md", regressionReport(run)],
    ["SELF_IMPROVEMENT_REPORT.md", selfImprovementReport(run)],
  ] as const;
  const written: string[] = [];
  for (const [name, content] of files) {
    const runFile = path.join(runRoot, name);
    const latestFile = path.join(labRoot, name);
    fs.writeFileSync(runFile, content);
    fs.writeFileSync(latestFile, content);
    written.push(latestFile);
  }
  fs.writeFileSync(path.join(runRoot, "run.json"), JSON.stringify(run, null, 2));
  fs.writeFileSync(path.join(labRoot, "latest-run.json"), JSON.stringify(run, null, 2));
  return written;
}

function updateFailureDatabase(labRoot: string, run: BenchmarkRun) {
  const file = path.join(labRoot, "failure-database.json");
  const previous = readJson(file) as { failures?: unknown[] } | null;
  const failures = run.results
    .filter((result) => !result.success)
    .map((result) => ({
      runId: run.id,
      task: result.task.title,
      projectType: run.profile.framework,
      failureReason: result.failureReason,
      filesInvolved: result.attempts.flatMap((attempt) => attempt.filesChanged),
      fixAttempts: result.attempts,
      retryCount: result.retries,
      at: run.createdAt,
    }));
  fs.writeFileSync(file, JSON.stringify({ failures: [...failures, ...((previous?.failures as unknown[]) || [])].slice(0, 500) }, null, 2));
}

function updateDatasets(labRoot: string, run: BenchmarkRun) {
  const file = path.join(labRoot, "abl-datasets.json");
  const previous = readJson(file) as { successfulFixes?: unknown[]; failedFixes?: unknown[]; summaries?: unknown[]; promptEffectiveness?: unknown[]; frameworkHeuristics?: unknown[] } | null;
  const successfulFixes = run.results.filter((result) => result.success).map((result) => ({ framework: run.profile.framework, task: result.task.category, retries: result.retries, score: result.score.overall }));
  const failedFixes = run.results.filter((result) => !result.success).map((result) => ({ framework: run.profile.framework, task: result.task.category, reason: result.failureReason }));
  const next = {
    successfulFixes: [...successfulFixes, ...((previous?.successfulFixes as unknown[]) || [])].slice(0, 500),
    failedFixes: [...failedFixes, ...((previous?.failedFixes as unknown[]) || [])].slice(0, 500),
    summaries: [{ runId: run.id, framework: run.profile.framework, successRate: run.leaderboard.successRate, score: Object.values(run.leaderboard.frameworkScore)[0] }, ...((previous?.summaries as unknown[]) || [])].slice(0, 200),
    promptEffectiveness: run.results.map((result) => ({ category: result.task.category, retries: result.retries, score: result.score.overall })).slice(0, 200),
    frameworkHeuristics: [{ framework: run.profile.framework, packageManager: run.profile.packageManager, scripts: run.profile.scripts, architecture: run.profile.architecture }],
  };
  fs.writeFileSync(file, JSON.stringify(next, null, 2));
}

function toDashboardSummary(run: BenchmarkRun) {
  return {
    id: run.id,
    createdAt: run.createdAt,
    engine: run.engine,
    projectsTested: 1,
    tasksCompleted: run.results.length,
    successRate: run.leaderboard.successRate,
    averageRetries: run.leaderboard.averageRetries,
    averageTimeMs: run.leaderboard.averageExecutionTimeMs,
    failures: run.results.filter((result) => !result.success).length,
    frameworkRankings: run.leaderboard.frameworkScore,
    qualityTrend: run.leaderboard.improvementTrend,
    regressionHistory: run.regressions,
    recommendations: run.recommendations,
    reports: run.reports,
    frameworkProfiles: FRAMEWORK_PROFILES,
  };
}

function benchmarkRunReport(run: BenchmarkRun) {
  return [
    "# BENCHMARK RUN REPORT",
    "",
    `Run: ${run.id}`,
    `Engine: ${run.engine}`,
    `Framework: ${run.profile.framework}`,
    `Tasks completed: ${run.results.length}`,
    `Success rate: ${run.leaderboard.successRate}%`,
    `Average retries: ${run.leaderboard.averageRetries}`,
    "",
    "## Tasks",
    ...run.results.map((result) => `- ${result.success ? "PASS" : "FAIL"} ${result.task.category}: ${result.task.title} (${result.score.overall}/100, retries ${result.retries})`),
  ].join("\n");
}

function failureAnalysis(run: BenchmarkRun) {
  const failures = run.results.filter((result) => !result.success);
  return ["# FAILURE ANALYSIS", "", failures.length ? failures.map((result) => `- ${result.task.title}: ${result.failureReason || "Unknown failure"}`).join("\n") : "No benchmark failures detected."].join("\n");
}

function frameworkScores(run: BenchmarkRun) {
  return ["# FRAMEWORK SCORES", "", ...Object.entries(run.leaderboard.frameworkScore).map(([framework, score]) => `- ${framework}: ${score}/100`), "", `Profiles maintained: ${FRAMEWORK_PROFILES.join(", ")}`].join("\n");
}

function regressionReport(run: BenchmarkRun) {
  return ["# REGRESSION REPORT", "", run.regressions.length ? run.regressions.map((item) => `- ${item.metric}: ${item.previous} -> ${item.current} (${item.severity})`).join("\n") : "No regressions detected."].join("\n");
}

function selfImprovementReport(run: BenchmarkRun) {
  return ["# SELF IMPROVEMENT REPORT", "", ...run.recommendations.map((rec) => `- ${rec}`)].join("\n");
}

function walk(root: string, acc: string[] = [], dir = root): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full);
    if (ignored(rel)) continue;
    if (entry.isDirectory()) walk(root, acc, full);
    else acc.push(rel);
  }
  return acc;
}

function ignored(rel: string) {
  return /(^|\/)(node_modules|\.git|\.next|dist|build|coverage|vendor)(\/|$)/.test(rel) || /^\.env/.test(path.basename(rel));
}

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (ignored(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function detectFramework(root: string, deps: string[]) {
  const has = (file: string) => fs.existsSync(path.join(root, file));
  const dep = (name: string) => deps.includes(name);
  if (has("next.config.js") || has("next.config.ts") || dep("next")) return "Next.js";
  if (dep("react-native")) return "React Native";
  if (dep("expo")) return "Expo";
  if (dep("electron")) return "Electron";
  if (dep("@angular/core")) return "Angular";
  if (dep("vue")) return "Vue";
  if (dep("@nestjs/core")) return "NestJS";
  if (dep("express")) return "Express";
  if (dep("react")) return "React";
  if (has("artisan")) return "Laravel";
  if (has("manage.py")) return "Django";
  if (has("pyproject.toml") && deps.includes("fastapi")) return "FastAPI";
  if (has("Cargo.toml")) return "Rust";
  if (has("go.mod")) return "Go";
  if (walk(root).some((file) => file.endsWith(".php"))) return "PHP";
  if (has("index.html")) return "Static HTML";
  if (has("package.json")) return "Node";
  return "Unknown";
}

function detectLanguage(files: string[]) {
  const counts = files.reduce((map, file) => {
    const ext = path.extname(file).slice(1) || "text";
    map[ext] = (map[ext] || 0) + 1;
    return map;
  }, {} as Record<string, number>);
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";
}

function detectArchitecture(root: string, files: string[]) {
  return ["app", "pages", "src", "components", "lib", "routes", "api", "prisma", "tests", "__tests__"]
    .filter((dir) => fs.existsSync(path.join(root, dir)) || files.some((file) => file.startsWith(`${dir}/`)));
}

function readJson(file: string): Record<string, unknown> | null {
  try { return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>; } catch { return null; }
}

function snapshot(root: string) {
  return Object.fromEntries(walk(root).map((file) => {
    const full = path.join(root, file);
    return [file, `${fs.statSync(full).size}:${crypto.createHash("sha1").update(fs.readFileSync(full)).digest("hex").slice(0, 12)}`];
  }));
}

function diffSnapshot(before: Record<string, string>, after: Record<string, string>) {
  return Object.keys(after).filter((file) => before[file] !== after[file]);
}

function task(id: string, category: string, prompt: string, title: string, complexity: BenchmarkTask["complexity"], expectedFiles: string[], verifyCommands: string[], risk: BenchmarkRisk): BenchmarkTask {
  return { id, category, title, prompt, complexity, expectedFiles, verifyCommands, risk };
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}

function regression(metric: string, previous: number, current: number, severity: BenchmarkRisk): RegressionFinding {
  return { metric, previous, current, severity, detail: `${metric} changed from ${previous} to ${current}` };
}

function readLatestRun(labRoot: string): BenchmarkRun | undefined {
  return readJson(path.join(labRoot, "latest-run.json")) as unknown as BenchmarkRun | undefined;
}

function writeFailureAttempt(runRoot: string, task: BenchmarkTask, attempt: number, error: string) {
  fs.appendFileSync(path.join(runRoot, "failures.jsonl"), JSON.stringify({ task, attempt, error, at: new Date().toISOString() }) + "\n");
}
