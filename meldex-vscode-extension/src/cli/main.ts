#!/usr/bin/env node
import * as cp from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as net from "net";
import * as os from "os";
import * as path from "path";
import { autonomousPromptSection, buildAutonomousPlan, planNeedsUserInput, safeReasoningSummary } from "../agent/autonomousOrchestrator";
import { buildFixTask } from "../agent/fixGenerator";
import { errorFingerprint, parseAgentError, type ParsedError } from "../agent/errorParser";
import { blockUnsafePatch, buildMilInsight, insightSummary } from "../agent/milEngine";
import { learnFromTask, readWorkspaceMemory, retrieveRelevantMemory } from "../agent/workspaceMemory";
import { runBenchmarkLab } from "../agent/benchmarkLab";
import { buildCodexIntelligencePlan } from "../agent/codexIntelligenceEngine";
import { buildToolIntelligencePlan, learnToolSequence, TOOL_REGISTRY, validatePatchPlan } from "../agent/toolIntelligenceEngine";
import { CodexStyleRuntimeAdapter } from "./runtime/codexStyleRuntime";

type Json = Record<string, unknown>;
type FileAction = { operation: "create" | "edit" | "update" | "delete"; path: string; content?: string; description?: string };
type AgentResponse = {
  plan?: string[];
  files?: FileAction[];
  commands?: string[];
  summary?: string;
  warnings?: string[];
  validation?: string[];
  error?: string;
};
type CliConfig = {
  backendUrl: string;
  maxRetries: number;
  safeMode: boolean;
  autoApply: boolean;
  projectLocalMemory: boolean;
  packageManager?: string;
  ignoredPaths: string[];
  testCommand?: string;
  buildCommand?: string;
  modelProfile?: string;
};

type CliToken = {
  token: string;
  source: "--token" | "MELDEX_TOKEN" | "extension";
  masked: string;
  expiresAt?: string | null;
  backendUrl?: string;
};

const DEFAULT_BACKEND = "https://meldex.newsyfly.com";
const SECRET_PATTERNS = [/^\.env(\.|$)/, /secret/i, /credential/i, /private[-_]?key/i];
const BLOCKED_COMMANDS = [
  /\brm\s+-[rRfF]{2,}\b/i,
  /\bsudo\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bmkfs\b/i,
  /\bdd\b.*\bof=/i,
  /\bchmod\s+-R\s+777\b/i,
  /curl.*\|\s*(ba)?sh/i,
  /wget.*\|\s*(ba)?sh/i,
  /\bgit\s+clean\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bdocker\s+.*\bprune\b/i,
  /\b(drop|truncate)\s+database\b/i,
];
const CONFIRM_COMMANDS = [
  /\bnpm\s+(i|install|add)\b/i,
  /\bpnpm\s+(i|install|add)\b/i,
  /\byarn\s+(add|install)\b/i,
  /\bbun\s+add\b/i,
  /\bgit\s+reset\b/i,
  /\bprisma\s+migrate\b/i,
];
const ALLOWED_PREFIXES = [
  "npm ", "npx ", "pnpm ", "yarn ", "bun ", "node ", "next ", "vite ", "turbo ",
  "git ", "python ", "python3 ", "pip ", "pip3 ", "php ", "composer ", "artisan ",
  "go ", "cargo ", "java ", "docker ",
];

function emit(type: string, payload: Json = {}) {
  process.stdout.write(`${JSON.stringify({ type, ...payload })}\n`);
}

function parseArgs(argv: string[]) {
  const [command = "help", ...rest] = argv;
  const opts: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = rest[i + 1];
      if (next && !next.startsWith("--")) {
        opts[key] = next;
        i += 1;
      } else {
        opts[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { command, positional, opts };
}

function workspaceFrom(opts: Record<string, string | boolean>) {
  return path.resolve(String(opts.workspace || process.cwd()));
}

function mkdirp(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

let activeStorageDir: string | null = null;

function defaultStorageDir() {
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Meldex Agent");
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Meldex Agent");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "meldex-agent");
}

function resolveStorageDir(root: string, opts: Record<string, string | boolean>) {
  if (opts["project-local-memory"] === true || opts["project-local-memory"] === "true") {
    return path.join(root, ".meldex");
  }
  return path.resolve(String(opts["storage-dir"] || process.env.MELDEX_STORAGE_DIR || defaultStorageDir()));
}

function meldexDir(_root: string) {
  const dir = activeStorageDir || defaultStorageDir();
  mkdirp(dir);
  mkdirp(path.join(dir, "logs"));
  mkdirp(path.join(dir, "rollback"));
  mkdirp(path.join(dir, "diffs"));
  return dir;
}

function readConfig(root: string, opts: Record<string, string | boolean>): CliConfig {
  activeStorageDir = resolveStorageDir(root, opts);
  const dir = meldexDir(root);
  const configPath = path.join(dir, "config.json");
  const defaults: CliConfig = {
    backendUrl: String(opts.backend || process.env.MELDEX_BACKEND_URL || DEFAULT_BACKEND).replace(/\/+$/, ""),
    maxRetries: Number(opts.maxRetries || process.env.MELDEX_MAX_RETRIES || 5),
    safeMode: opts.safeMode !== "false",
    autoApply: opts.autoApply === true || opts.autoApply === "true",
    projectLocalMemory: opts["project-local-memory"] === true || opts["project-local-memory"] === "true",
    ignoredPaths: ["node_modules", ".git", "dist", "build", ".next", "vendor", ".turbo", "coverage"],
    modelProfile: "coding",
  };
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(configPath, "utf8")) };
  } catch {
    fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2));
    return defaults;
  }
}

function maskToken(token: string) {
  const last4 = token.slice(-4);
  if (token.startsWith("sk-")) return `sk-****${last4}`;
  if (token.startsWith("mdx_")) return `mdx_****${last4}`;
  return `${token.slice(0, 3)}-****${last4}`;
}

function authInstruction() {
  return "Open VS Code → Meldex → Login → Command Palette → Meldex: Copy Benchmark Token → run benchmark with MELDEX_TOKEN=...";
}

function controlledExtensionTokenPaths() {
  const home = os.homedir();
  if (!home) return [];
  const candidates = process.platform === "darwin"
    ? [
        path.join(home, "Library", "Application Support", "Code", "User", "globalStorage", "meldex-ai.meldex-ai", "benchmark-token.json"),
        path.join(home, "Library", "Application Support", "Cursor", "User", "globalStorage", "meldex-ai.meldex-ai", "benchmark-token.json"),
      ]
    : process.platform === "win32"
      ? [
          path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Code", "User", "globalStorage", "meldex-ai.meldex-ai", "benchmark-token.json"),
          path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Cursor", "User", "globalStorage", "meldex-ai.meldex-ai", "benchmark-token.json"),
        ]
      : [
          path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "Code", "User", "globalStorage", "meldex-ai.meldex-ai", "benchmark-token.json"),
          path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "Cursor", "User", "globalStorage", "meldex-ai.meldex-ai", "benchmark-token.json"),
        ];
  return candidates;
}

function readExtensionProvidedToken(): CliToken | null {
  for (const filePath of controlledExtensionTokenPaths()) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as { token?: string; expiresAt?: string | null; backendUrl?: string };
      const token = String(parsed.token || "");
      if (!token) continue;
      if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= Date.now()) continue;
      return {
        token,
        source: "extension",
        masked: maskToken(token),
        expiresAt: parsed.expiresAt ?? null,
        backendUrl: parsed.backendUrl,
      };
    } catch {
      // Missing or unreadable extension token files are expected across editors.
    }
  }
  return null;
}

function resolveCliToken(opts: Record<string, string | boolean>): CliToken | null {
  const argToken = typeof opts.token === "string" ? opts.token.trim() : "";
  if (argToken) return { token: argToken, source: "--token", masked: maskToken(argToken) };
  const envToken = (process.env.MELDEX_TOKEN || "").trim();
  if (envToken) return { token: envToken, source: "MELDEX_TOKEN", masked: maskToken(envToken) };
  return readExtensionProvidedToken();
}

function isSecret(filePath: string) {
  const base = path.basename(filePath);
  return SECRET_PATTERNS.some((pattern) => pattern.test(base) || pattern.test(filePath));
}

function readGitignore(root: string) {
  try {
    return fs.readFileSync(path.join(root, ".gitignore"), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && !line.startsWith("!"));
  } catch {
    return [];
  }
}

function shouldIgnore(rel: string, ignored: string[]) {
  if (isSecret(rel)) return true;
  const normalized = rel.split(path.sep).join("/");
  return ignored.some((item) => {
    const clean = item.replace(/\/$/, "");
    return normalized === clean || normalized.startsWith(`${clean}/`) || normalized.includes(`/${clean}/`);
  });
}

function hash(content: string) {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function walk(root: string, ignored: string[], acc: string[] = [], dir = root) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full);
    if (shouldIgnore(rel, ignored)) continue;
    if (entry.isDirectory()) walk(root, ignored, acc, full);
    else acc.push(rel);
  }
  return acc;
}

function detectProject(root: string) {
  const exists = (file: string) => fs.existsSync(path.join(root, file));
  const packageJson = readJson(path.join(root, "package.json"));
  const scripts = (packageJson?.scripts || {}) as Record<string, string>;
  const dependencies = { ...((packageJson?.dependencies || {}) as Json), ...((packageJson?.devDependencies || {}) as Json) };
  const framework = exists("next.config.ts") || exists("next.config.js") ? "Next.js"
    : exists("vite.config.ts") || exists("vite.config.js") ? "Vite"
    : exists("artisan") ? "Laravel"
    : exists("manage.py") ? "Django"
    : exists("Cargo.toml") ? "Rust"
    : exists("go.mod") ? "Go"
    : packageJson ? "Node.js"
    : "Unknown";
  const packageManager = exists("pnpm-lock.yaml") ? "pnpm" : exists("yarn.lock") ? "yarn" : exists("bun.lockb") ? "bun" : "npm";
  return { framework, packageManager, scripts, dependencies };
}

function readJson(filePath: string): Json | null {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")) as Json; } catch { return null; }
}

function packageVersion() {
  const pkg = readJson(path.join(__dirname, "..", "..", "package.json"));
  return String(pkg?.version || "unknown");
}

function gitInfo(root: string) {
  const run = (args: string[]) => cp.spawnSync("git", args, { cwd: root, encoding: "utf8" });
  const branch = run(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
  const status = run(["status", "--short"]).stdout.trim().split(/\r?\n/).filter(Boolean).slice(0, 80);
  return { branch: branch || "unknown", status };
}

function languageOf(file: string) {
  const ext = path.extname(file).slice(1).toLowerCase();
  return ext || "text";
}

function buildIndex(root: string, config: CliConfig) {
  emit("thinking", { message: "Indexing workspace" });
  const dir = meldexDir(root);
  const previous = readJson(path.join(dir, "index.json"));
  const ignored = [...config.ignoredPaths, ...readGitignore(root)];
  const files = walk(root, ignored).slice(0, 2500);
  const project = detectProject(root);
  const fileEntries = files.map((rel) => {
    const full = path.join(root, rel);
    const content = fs.readFileSync(full, "utf8");
    return { path: rel, hash: hash(content), language: languageOf(rel), size: Buffer.byteLength(content) };
  });
  const changed = fileEntries.filter((entry) => {
    const old = (previous?.files as Json[] | undefined)?.find((item) => item.path === entry.path) as Json | undefined;
    return !old || old.hash !== entry.hash;
  });
  const routes = files.filter((file) => /(^app\/|^pages\/|routes|api)/.test(file)).slice(0, 200);
  const components = files.filter((file) => /component|components\/|\.tsx$|\.jsx$/.test(file)).slice(0, 200);
  const index = {
    lastScanTime: new Date().toISOString(),
    fileTree: files,
    fileHashes: Object.fromEntries(fileEntries.map((entry) => [entry.path, entry.hash])),
    languageMap: fileEntries.reduce((map, entry) => ({ ...map, [entry.language]: [...((map as Record<string, string[]>)[entry.language] || []), entry.path].slice(0, 200) }), {} as Record<string, string[]>),
    routes,
    components,
    scripts: project.scripts,
    dependencies: Object.keys(project.dependencies).slice(0, 120),
    project,
    git: gitInfo(root),
    changedFiles: changed.map((entry) => entry.path),
  };
  fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify(index, null, 2));
  emit("tool_result", { tool: "index", status: "ok", files: files.length, changed: changed.length });
  return index;
}

function selectRelevantFiles(root: string, task: string, index: Json) {
  const words = task.toLowerCase().split(/[^a-z0-9_.-]+/).filter((word) => word.length > 2);
  const files = (index.fileTree as string[] || []).filter((file) => {
    const lower = file.toLowerCase();
    return words.some((word) => lower.includes(word)) || /package\.json|tsconfig|next\.config|vite\.config|readme|prisma\/schema\.prisma/i.test(file);
  }).slice(0, 18);
  return files.map((rel) => {
    try {
      const content = fs.readFileSync(path.join(root, rel), "utf8").slice(0, 5000);
      return { path: rel, content };
    } catch {
      return { path: rel, content: "" };
    }
  });
}

function buildPlan(task: string, index: Json) {
  const scripts = ((index.project as Json)?.scripts || {}) as Record<string, string>;
  const filesToChange = inferFiles(task, index);
  const project = (index.project || {}) as Json;
  return {
    objective: task,
    projectType: project.framework || "Unknown",
    framework: project.framework || "Unknown",
    architectureFirst: [
      "Understand request",
      "Detect project type and framework",
      "Plan architecture, files, reusable components, state/data flow, and validation",
      "Generate minimal production-ready code",
      "Self-review, run checks, autofix, and verify",
    ],
    assumptions: ["Use the existing project conventions", "Do not read or write secrets", "Preview patches before applying"],
    filesToRead: ((index.fileTree as string[]) || []).slice(0, 12),
    filesToChange,
    commandsToRun: [scripts.build ? "npm run build" : "", scripts.test ? "npm test" : "", scripts.lint ? "npm run lint" : ""].filter(Boolean),
    risks: ["Generated code may require dependency-specific adjustment"],
    validationPlan: ["Review diff", "Apply patch", "Run detected checks or lightweight validation"],
  };
}

function optimizeCliTaskForQwen(task: string, index: Json, relevantFiles: Array<{ path: string; content: string }>, orchestrationSection?: string, terminalError?: string) {
  const project = (index.project || {}) as Json;
  const framework = String(project.framework || "Unknown");
  const packageManager = String(project.packageManager || "npm");
  const profile = selectCliQwenProfile(task, framework, terminalError);
  const commands = ((project.scripts || {}) as Record<string, string>);
  const relevantBlocks = relevantFiles
    .slice(0, 10)
    .map((file) => `### ${file.path}\n\`\`\`\n${file.content.slice(0, 7000)}\n\`\`\``)
    .join("\n\n")
    .slice(0, 18000);
  const reasoning = [
    `Detected ${framework}.`,
    `Package manager: ${packageManager}.`,
    `Selected files: ${relevantFiles.map((file) => file.path).join(", ") || "none"}.`,
    commands.build ? `Build check available: ${packageManager} run build.` : "Build check not detected.",
  ];
  const optimizedTask = `QWEN3-CODER MAX REQUEST

Profile: ${profile}
User goal:
${task}

Reasoning summary:
- ${reasoning.join("\n- ")}

Senior plan shape required:
{
  "goal": "...",
  "projectType": "${framework}",
  "filesToRead": [],
  "filesToChange": [],
  "commandsToRun": [],
  "validationPlan": [],
  "riskLevel": "low|medium|high"
}

Relevant context:
${relevantBlocks || "(Empty or new workspace)"}

${orchestrationSection ? `${orchestrationSection}\n` : ""}

${terminalError ? `Existing error:\n\`\`\`\n${terminalError.slice(-5000)}\n\`\`\`` : ""}

Return valid JSON only in Meldex Agent compatible shape:
{
  "thoughtSummary": "safe reasoning summary only",
  "plan": ["step"],
  "files": [{ "operation": "create|edit|delete", "path": "relative/path", "content": "full final file content", "description": "brief" }],
  "commands": ["safe validation command"],
  "validation": ["check"],
  "summary": "brief result"
}

Rules: minimal production-ready patch, no fake imports, no unnecessary dependencies, preserve framework conventions, do not expose hidden chain-of-thought.
Architecture-first coding rules:
- Internally run: understand request, detect project type, detect framework, plan architecture, plan files, plan reusable components, plan state/data flow, generate code, self-review, run checks, fix errors, refactor if needed, verify final output.
- Static sites must stay dependency-free and use exactly index.html, style.css, script.js, README.md unless the user explicitly asks for a framework.
- React/Vite tasks must use correct main entry, component imports, CSS imports, and no Next-only APIs.
- Next.js tasks must respect existing app/pages router conventions, server/client boundaries, metadata, and route placement.
- Backend tasks must use routes/controllers/services/middleware/validators/utils when creating a new structure, with validation and clean status codes.
- Prefer reusable components/constants/helpers over giant files, repeated markup, dead code, unused imports, or placeholder TODOs.
- Never add dependencies unless already installed or explicitly required. If a dependency is required, explain it in warnings instead of silently installing it.
- For edits, touch the smallest relevant files and preserve existing style. Do not rewrite unrelated CSS/HTML/JSON for a focused bug.
- Include README updates for newly generated projects with run instructions, file structure, preview command, and next steps.
- Internal quality target: code quality, architecture, maintainability, security, performance, and testing >= 85 before returning.`;
  return { task: optimizedTask.slice(0, 3900), profile, reasoning };
}

function selectCliQwenProfile(task: string, framework: string, terminalError?: string) {
  const lower = `${task} ${framework} ${terminalError || ""}`.toLowerCase();
  if (terminalError || /fix|bug|error|failed|debug/.test(lower)) return "qwen_debug";
  if (/test|spec|coverage/.test(lower)) return "qwen_tests";
  if (/refactor|cleanup/.test(lower)) return "qwen_refactor";
  if (/landing|static|html/.test(lower)) return "qwen_static_site";
  if (/next/.test(lower)) return "qwen_nextjs";
  if (/react|vite/.test(lower)) return "qwen_react";
  if (/php|laravel/.test(lower)) return "qwen_php";
  if (/python|django|flask/.test(lower)) return "qwen_python";
  if (/ui|polish|css|responsive/.test(lower)) return "qwen_ui_polish";
  return "qwen_node_api";
}

function weakAgentResponse(value: AgentResponse) {
  return !Array.isArray(value.plan) || value.plan.length === 0 || (!Array.isArray(value.files) && !!value.summary);
}

function looksLikeGeneratedProject(files: FileAction[]) {
  const paths = new Set(files.map((file) => file.path));
  return paths.has("index.html") || paths.has("package.json") || [...paths].some((file) => /^(src|app|pages|routes|controllers|services|components)\//.test(file));
}

function isDependencyManifest(file: FileAction) {
  return /(^|\/)package(-lock)?\.json$|(^|\/)pnpm-lock\.yaml$|(^|\/)yarn\.lock$|(^|\/)bun\.lockb$/i.test(file.path);
}

function reviewCliActions(files: FileAction[], root = process.cwd(), task = "") {
  const findings: string[] = [];
  const paths = new Set(files.map((file) => file.path));
  for (const file of files) {
    if (!file.path || file.path.includes("..") || path.isAbsolute(file.path)) findings.push(`Unsafe path: ${file.path}`);
    if (isSecret(file.path)) findings.push(`Secret path blocked: ${file.path}`);
    if (file.operation !== "delete" && !file.content?.trim()) findings.push(`Empty content for ${file.path}`);
    if (/\.(ts|tsx|js|jsx)$/.test(file.path) && /from ["'](?:your-|some-|fake-|placeholder)/i.test(file.content || "")) findings.push(`Placeholder import in ${file.path}`);
    if (/\.(ts|tsx|js|jsx)$/.test(file.path) && /\bTODO\b|\bFIXME\b|console\.log\(["']todo/i.test(file.content || "")) findings.push(`Placeholder TODO/debug code in ${file.path}`);
    if (/\.(html|tsx|jsx)$/.test(file.path) && /<img\b(?![^>]*\balt=)/i.test(file.content || "")) findings.push(`Image without alt text in ${file.path}`);
    if (isDependencyManifest(file) && isStaticOnlyProject(root) && !/react|next|vite|express|node app|backend|api/i.test(task)) findings.push(`Unnecessary dependency manifest for static task: ${file.path}`);
    if (file.path === "package.json" && file.operation !== "delete") {
      try {
        const pkg = JSON.parse(file.content || "{}") as { dependencies?: Json; devDependencies?: Json };
        const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
        if (deps.some((dep) => /^your-|^some-|placeholder/i.test(dep))) findings.push(`Placeholder dependency in package.json`);
      } catch {
        findings.push("Invalid package.json JSON");
      }
    }
  }
  if (looksLikeGeneratedProject(files) && !paths.has("README.md") && !fs.existsSync(path.join(root, "README.md"))) {
    findings.push("Generated project is missing README.md");
  }
  return findings;
}

function reviewCliCommands(commands: string[] = [], root = process.cwd(), task = "") {
  const findings: string[] = [];
  const staticTask = isStaticOnlyProject(root) && !/react|next|vite|express|node app|backend|api/i.test(task);
  for (const command of commands) {
    if (staticTask && /\b(npm|pnpm|yarn|bun)\s+(?:i|install|add)\b/i.test(command)) {
      findings.push(`Static task cannot install dependencies: ${command}`);
    }
    if (staticTask && /\b(express|vite|next|react)\b/i.test(command) && /\b(npm|pnpm|yarn|bun|npx)\b/i.test(command)) {
      findings.push(`Static task cannot require framework/server dependency: ${command}`);
    }
    if (/\b(npm|pnpm|yarn|bun)\s+(?:i|install|add)\b/i.test(command) && !/install|dependency|package/i.test(task)) {
      findings.push(`Dependency install command needs explicit user intent: ${command}`);
    }
  }
  return findings;
}

function codingQualityScore(files: FileAction[], commands: string[] = [], findings: string[] = []) {
  const paths = files.map((file) => file.path);
  const hasReadme = paths.includes("README.md");
  const hasComponents = paths.some((file) => /(^|\/)(components|routes|controllers|services|middleware|validators|utils|lib|data|types)\//.test(file));
  const hasValidation = commands.some((command) => /build|test|lint|tsc|node -e/i.test(command));
  const hasTests = paths.some((file) => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file)) || commands.some((command) => /\btest\b/i.test(command));
  const touchesSecrets = paths.some((file) => isSecret(file));
  const totalLines = files.reduce((sum, file) => sum + (file.content?.split(/\r?\n/).length || 0), 0);
  const fileCount = Math.max(1, files.length);
  const avgLines = totalLines / fileCount;
  const codeQuality = Math.max(55, 94 - findings.length * 8 - (avgLines > 360 ? 8 : 0));
  const architecture = Math.max(55, 88 + (hasComponents ? 6 : 0) + (fileCount > 1 ? 3 : 0) - (avgLines > 420 ? 12 : 0));
  const maintainability = Math.max(55, 90 + (hasReadme ? 4 : -5) + (hasComponents ? 4 : 0) - findings.length * 5);
  const security = touchesSecrets ? 40 : Math.max(70, 96 - findings.filter((item) => /secret|unsafe|dependency/i.test(item)).length * 10);
  const performance = Math.max(70, 91 - (avgLines > 500 ? 8 : 0));
  const testing = hasValidation ? (hasTests ? 88 : 78) : 70;
  const overall = Math.round((codeQuality + architecture + maintainability + security + performance + testing) / 6);
  return { codeQuality, architecture, maintainability, security, performance, testing, overall };
}

function inferFiles(task: string, index: Json) {
  const lower = task.toLowerCase();
  if (lower.includes("landing page") || lower.includes("index.html")) return ["index.html", "style.css", "script.js", "README.md"];
  if (lower.includes("readme")) return ["README.md"];
  return ((index.fileTree as string[]) || []).filter((file) => /\.(ts|tsx|js|jsx|py|php|md|html|css)$/.test(file)).slice(0, 6);
}

function apiRequest<T>(backendUrl: string, token: string, endpoint: string, method = "GET", body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, backendUrl);
    const data = body ? JSON.stringify(body) : "";
    const transport = url.protocol === "https:" ? https : http;
    const req = transport.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Meldex-Agent-CLI/1.0",
        ...(data ? { "Content-Length": Buffer.byteLength(data).toString() } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      let out = "";
      res.on("data", (chunk) => { out += chunk; });
      res.on("end", () => {
        try {
          const json = JSON.parse(out) as T & { error?: string };
          if ((res.statusCode || 0) >= 400) reject(new Error(json.error || `HTTP ${res.statusCode}`));
          else resolve(json);
        } catch {
          reject(new Error(`Invalid response: ${out.slice(0, 160)}`));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(120000, () => req.destroy(new Error("Request timed out")));
    if (data) req.write(data);
    req.end();
  });
}

function validateAgentResponse(value: AgentResponse) {
  if (!value || typeof value !== "object") throw new Error("Agent returned empty response");
  if (value.error) throw new Error(value.error);
  const files = Array.isArray(value.files) ? value.files : [];
  for (const file of files) {
    if (!["create", "edit", "update", "delete"].includes(file.operation)) throw new Error(`Invalid file operation: ${file.operation}`);
    if (!file.path || path.isAbsolute(file.path) || file.path.includes("..") || isSecret(file.path)) throw new Error(`Unsafe file path: ${file.path}`);
  }
  return { ...value, files };
}

type WebsiteCategory =
  | "Restaurant" | "Hotel" | "Cafe" | "Portfolio" | "Agency" | "AI Startup" | "SaaS"
  | "E-commerce" | "Landing Page" | "Corporate" | "Healthcare" | "Education" | "Finance"
  | "Travel" | "Event" | "Photography" | "Construction" | "Real Estate" | "Gaming"
  | "Developer Tool" | "Open Source" | "Admin Dashboard" | "Blog" | "Documentation";

type WebsiteDesignSpec = {
  category: WebsiteCategory;
  title: string;
  eyebrow: string;
  subtitle: string;
  cta: string;
  secondaryCta: string;
  palette: { bg: string; text: string; muted: string; surface: string; accent: string; accent2: string; glow: string };
  sections: string[];
  tone: string;
};

function detectWebsiteCategory(task: string): WebsiteCategory {
  const lower = task.toLowerCase();
  const checks: Array<[WebsiteCategory, RegExp]> = [
    ["Restaurant", /restaurant|dining|chef|menu|reservation/],
    ["Hotel", /hotel|resort|stay|rooms|booking/],
    ["Cafe", /cafe|coffee|bakery|brunch/],
    ["Portfolio", /portfolio|personal|resume|designer|developer profile/],
    ["Agency", /agency|studio|creative|marketing/],
    ["AI Startup", /ai startup|artificial intelligence|machine learning|automation/],
    ["SaaS", /saas|software|platform|startup|product/],
    ["E-commerce", /e-?commerce|store|shop|products/],
    ["Healthcare", /health|clinic|medical|doctor/],
    ["Travel", /travel|tour|trip|destination/],
    ["Event", /event|conference|festival|summit/],
    ["Photography", /photo|photography|gallery/],
    ["Real Estate", /real estate|property|homes|apartments/],
    ["Gaming", /gaming|game|esports/],
    ["Developer Tool", /developer tool|api|sdk|devtool|cli/],
    ["Documentation", /docs|documentation/],
    ["Blog", /blog|publication|magazine/],
  ];
  return checks.find(([, pattern]) => pattern.test(lower))?.[0] || "Landing Page";
}

function titleFromTask(task: string, category: WebsiteCategory) {
  const cleaned = task
    .replace(/\b(create|build|make|design|generate|animated|beautiful|modern|premium|website|landing page|site)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length > 3) return cleaned.split(" ").slice(0, 4).map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
  if (category === "Restaurant") return "Aurora Table";
  if (category === "SaaS") return "Meldex Cloud";
  if (category === "Portfolio") return "Studio Portfolio";
  if (category === "Travel") return "Vista Trails";
  return "Meldex Studio";
}

function websiteDesignSpec(task: string): WebsiteDesignSpec {
  const category = detectWebsiteCategory(task);
  const animated = /animated|interactive|beautiful|premium|modern|creative/i.test(task);
  const title = titleFromTask(task, category);
  const defaults = {
    category,
    title,
    cta: category === "Restaurant" ? "Reserve a table" : category === "Portfolio" ? "View projects" : "Start now",
    secondaryCta: category === "Restaurant" ? "Explore menu" : category === "Portfolio" ? "Contact me" : "See how it works",
    sections: ["Hero", "Features", "Showcase", "Testimonials", "CTA", "Footer"],
    tone: animated ? "premium animated" : "premium",
  };
  if (category === "Restaurant") {
    return {
      ...defaults,
      eyebrow: "Seasonal dining experience",
      subtitle: "A warm, cinematic restaurant website with crafted menus, chef-led storytelling, reservations, gallery, testimonials, and location.",
      palette: { bg: "#120c08", text: "#fff7ed", muted: "#d6bfa8", surface: "#21150f", accent: "#f59e0b", accent2: "#fb7185", glow: "rgba(245,158,11,.28)" },
      sections: ["Hero", "Menu", "Popular Items", "Chef", "Gallery", "Testimonials", "Location", "Reservation CTA", "Footer"],
    };
  }
  if (category === "Portfolio") {
    return {
      ...defaults,
      eyebrow: "Selected work and craft",
      subtitle: "A polished portfolio with confident typography, project cards, skills, experience, testimonials, and a conversion-focused contact area.",
      palette: { bg: "#0b1020", text: "#eef2ff", muted: "#aab3d6", surface: "#121a31", accent: "#8b5cf6", accent2: "#06b6d4", glow: "rgba(139,92,246,.3)" },
      sections: ["Hero", "Projects", "Skills", "Experience", "Testimonials", "Contact", "Footer"],
    };
  }
  if (category === "SaaS" || category === "AI Startup" || category === "Developer Tool") {
    return {
      ...defaults,
      eyebrow: "Launch faster with intelligent systems",
      subtitle: "A modern SaaS marketing page with a sharp hero, feature architecture, workflow, integrations, pricing, testimonials, FAQ, and CTA.",
      palette: { bg: "#f8fbff", text: "#111827", muted: "#64748b", surface: "#ffffff", accent: "#6d5dfc", accent2: "#0ea5e9", glow: "rgba(109,93,252,.22)" },
      sections: ["Hero", "Features", "How it works", "Integrations", "Pricing", "Testimonials", "FAQ", "CTA", "Footer"],
    };
  }
  return {
    ...defaults,
    eyebrow: "Premium digital experience",
    subtitle: "A complete conversion-ready website with distinctive sections, responsive cards, polished motion, and a professional visual system.",
    palette: { bg: "#f8fafc", text: "#111827", muted: "#64748b", surface: "#ffffff", accent: "#7c3aed", accent2: "#14b8a6", glow: "rgba(124,58,237,.22)" },
  };
}

function sectionCards(spec: WebsiteDesignSpec) {
  return spec.sections.slice(1, -1).map((section, index) => `
      <article id="${sectionAnchor(section)}" class="section-card reveal" style="--delay:${index * 80}ms">
        <span class="card-index">${String(index + 1).padStart(2, "0")}</span>
        <h3>${section}</h3>
        <p>${sectionCopy(spec.category, section)}</p>
      </article>`).join("");
}

function sectionAnchor(section: string) {
  return `section-${section.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function sectionCopy(category: WebsiteCategory, section: string) {
  const copy: Record<string, string> = {
    "Menu": "Curated seasonal dishes with rich descriptions, price hints, and a refined editorial rhythm.",
    "Popular Items": "Signature highlights presented like premium product cards with hover depth and visual balance.",
    "Chef": "A human story area that builds trust and makes the brand feel warm, considered, and memorable.",
    "Gallery": "Responsive image placeholders with elegant aspect ratios and subtle motion instead of empty boxes.",
    "Location": "Clear hours, address, and contact details designed for quick decisions.",
    "Features": "Benefit-led cards with concise copy, icons, and strong visual hierarchy.",
    "How it works": "A simple process timeline that explains value without clutter.",
    "Integrations": "Logo-style integration chips and system cards arranged in a clean grid.",
    "Pricing": "Modern pricing cards with CTA hierarchy and generous spacing.",
    "FAQ": "Accessible answers that reduce friction before conversion.",
    "Projects": "Case-study cards with metrics, tags, and polished preview blocks.",
    "Skills": "Capability badges grouped for scanning and credibility.",
    "Experience": "A compact timeline with roles, outcomes, and proof points.",
    "Testimonials": "Social proof cards with quotes, names, and soft shadows.",
    "Contact": "A focused form section with clear labels and usable controls.",
  };
  return copy[section] || `A premium ${category.toLowerCase()} section with thoughtful hierarchy, spacing, and responsive behavior.`;
}

function premiumStaticWebsiteResponse(task: string): AgentResponse {
  const spec = websiteDesignSpec(task);
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${spec.title} | ${spec.category}</title>
  <meta name="description" content="${spec.subtitle}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="ambient ambient-one"></div>
  <div class="ambient ambient-two"></div>
  <header class="nav">
    <a class="brand" href="#"><span></span>${spec.title}</a>
    <nav aria-label="Primary">
      ${spec.sections.slice(1, 5).map((section) => `<a href="#${sectionAnchor(section)}">${section}</a>`).join("")}
    </nav>
    <a class="nav-cta" href="#contact">${spec.cta}</a>
  </header>
  <main>
    <section class="hero">
      <div class="hero-copy reveal">
        <p class="eyebrow">${spec.eyebrow}</p>
        <h1>${heroHeadline(spec)}</h1>
        <p class="lede">${spec.subtitle}</p>
        <div class="actions">
          <a class="button primary" href="#contact">${spec.cta}</a>
          <a class="button ghost" href="#showcase">${spec.secondaryCta}</a>
        </div>
      </div>
      <div class="hero-visual reveal" aria-label="${spec.category} website preview">
        <div class="visual-bar"><span></span><span></span><span></span></div>
        <div class="visual-card main-card">
          <p>${spec.category}</p>
          <strong>${visualMetric(spec.category)}</strong>
        </div>
        <div class="mini-grid">
          <div></div><div></div><div></div><div></div>
        </div>
      </div>
    </section>
    <section class="proof reveal">
      <span>Designed system</span><span>Responsive grids</span><span>Accessible motion</span><span>Client-ready polish</span>
    </section>
    <section id="showcase" class="section intro reveal">
      <p class="section-kicker">Design system</p>
      <h2>Distinct visual language before code.</h2>
      <p>The page uses a dedicated palette, typography scale, spacing rhythm, card system, motion language, and responsive behavior for ${spec.category.toLowerCase()} use cases.</p>
    </section>
    <section class="section cards">
      ${sectionCards(spec)}
    </section>
    <section id="contact" class="cta reveal">
      <div>
        <p class="section-kicker">Ready</p>
        <h2>${ctaHeadline(spec.category)}</h2>
        <p>Built with a full page structure, premium spacing, hover states, animation hooks, and mobile-first responsiveness.</p>
      </div>
      <form>
        <label>Name <input name="name" autocomplete="name" placeholder="Your name"></label>
        <label>Email <input name="email" type="email" autocomplete="email" placeholder="you@example.com"></label>
        <button type="submit">${spec.cta}</button>
      </form>
    </section>
  </main>
  <footer>
    <span>${spec.title}</span>
    <span>${spec.category} website generated by Meldex Website Designer Agent.</span>
  </footer>
  <script src="script.js"></script>
</body>
</html>
`;
  const css = `:root {
  --bg: ${spec.palette.bg};
  --text: ${spec.palette.text};
  --muted: ${spec.palette.muted};
  --surface: ${spec.palette.surface};
  --accent: ${spec.palette.accent};
  --accent-2: ${spec.palette.accent2};
  --glow: ${spec.palette.glow};
  --border: color-mix(in srgb, var(--text) 12%, transparent);
  --shadow: 0 24px 80px rgba(15, 23, 42, .14);
  --radius: 28px;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background:
    radial-gradient(circle at 15% 10%, var(--glow), transparent 34rem),
    radial-gradient(circle at 90% 0%, color-mix(in srgb, var(--accent-2) 20%, transparent), transparent 30rem),
    var(--bg);
  color: var(--text);
  overflow-x: hidden;
}
a { color: inherit; text-decoration: none; }
.ambient { position: fixed; z-index: -1; width: 22rem; height: 22rem; border-radius: 999px; filter: blur(40px); opacity: .35; animation: float 10s ease-in-out infinite alternate; }
.ambient-one { left: -7rem; top: 10rem; background: var(--accent); }
.ambient-two { right: -8rem; top: 30rem; background: var(--accent-2); animation-delay: -3s; }
.nav {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; justify-content: space-between; gap: 24px;
  min-height: 76px; padding: 0 clamp(20px, 5vw, 72px);
  backdrop-filter: blur(22px);
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  border-bottom: 1px solid var(--border);
}
.brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 900; letter-spacing: -.03em; }
.brand span { width: 32px; height: 32px; border-radius: 12px; background: linear-gradient(135deg, var(--accent), var(--accent-2)); box-shadow: 0 12px 30px var(--glow); }
.nav nav { display: flex; gap: 20px; color: var(--muted); font-size: 14px; font-weight: 700; }
.nav nav a:hover { color: var(--text); }
.nav-cta, .button, form button {
  border: 1px solid var(--border); border-radius: 999px; padding: 12px 18px;
  font-weight: 800; transition: transform .25s ease, box-shadow .25s ease, background .25s ease;
}
.nav-cta, .button.primary, form button { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: white; box-shadow: 0 18px 42px var(--glow); border: 0; }
.button:hover, .nav-cta:hover, form button:hover { transform: translateY(-2px); }
.button.ghost { background: color-mix(in srgb, var(--surface) 70%, transparent); }
.hero {
  min-height: calc(100vh - 76px);
  display: grid; grid-template-columns: minmax(0, 1.02fr) minmax(360px, .78fr); align-items: center; gap: clamp(32px, 6vw, 88px);
  padding: clamp(56px, 7vw, 108px) clamp(20px, 5vw, 72px);
}
.eyebrow, .section-kicker { color: var(--accent); font-weight: 900; letter-spacing: .14em; text-transform: uppercase; font-size: 12px; margin: 0 0 16px; }
h1, h2, h3 { margin: 0; letter-spacing: -.055em; }
h1 { max-width: 980px; font-size: clamp(52px, 8vw, 112px); line-height: .88; }
h2 { font-size: clamp(34px, 5vw, 64px); line-height: .96; }
h3 { font-size: 22px; }
.lede { max-width: 760px; color: var(--muted); font-size: clamp(18px, 2vw, 23px); line-height: 1.7; margin: 26px 0 0; }
.actions { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 34px; }
.hero-visual {
  min-height: 520px; border: 1px solid var(--border); border-radius: var(--radius);
  background: linear-gradient(145deg, color-mix(in srgb, var(--surface) 82%, transparent), color-mix(in srgb, var(--accent) 10%, transparent));
  box-shadow: var(--shadow); padding: 22px; position: relative; overflow: hidden;
}
.hero-visual::before { content: ""; position: absolute; inset: 14%; border-radius: 999px; background: var(--glow); filter: blur(48px); }
.visual-bar, .visual-card, .mini-grid { position: relative; z-index: 1; }
.visual-bar { display: flex; gap: 8px; }
.visual-bar span { width: 12px; height: 12px; border-radius: 999px; background: color-mix(in srgb, var(--text) 20%, transparent); }
.main-card { margin-top: 56px; padding: 30px; border-radius: 24px; background: color-mix(in srgb, var(--bg) 72%, white 8%); border: 1px solid var(--border); box-shadow: var(--shadow); }
.main-card p { color: var(--muted); margin: 0 0 10px; }
.main-card strong { display: block; font-size: clamp(38px, 6vw, 72px); line-height: .95; }
.mini-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-top: 18px; }
.mini-grid div { min-height: 96px; border-radius: 20px; background: color-mix(in srgb, var(--surface) 80%, var(--accent) 8%); border: 1px solid var(--border); }
.proof { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 0 clamp(20px, 5vw, 72px) 64px; }
.proof span { border: 1px solid var(--border); border-radius: 999px; padding: 12px 16px; color: var(--muted); background: color-mix(in srgb, var(--surface) 72%, transparent); text-align: center; font-size: 13px; font-weight: 800; }
.section { padding: 84px clamp(20px, 5vw, 72px); }
.intro { max-width: 980px; }
.intro p:last-child { max-width: 720px; color: var(--muted); line-height: 1.8; font-size: 18px; }
.cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; padding-top: 24px; }
.section-card {
  min-height: 260px; border: 1px solid var(--border); border-radius: 24px; padding: 26px;
  background: color-mix(in srgb, var(--surface) 82%, transparent); box-shadow: 0 16px 48px rgba(15,23,42,.08);
  transition: transform .28s ease, box-shadow .28s ease, border-color .28s ease;
}
.section-card:hover { transform: translateY(-6px); box-shadow: var(--shadow); border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
.card-index { display: inline-grid; place-items: center; width: 42px; height: 42px; border-radius: 14px; color: white; background: linear-gradient(135deg, var(--accent), var(--accent-2)); font-weight: 900; margin-bottom: 24px; }
.section-card p { color: var(--muted); line-height: 1.7; }
.cta {
  margin: 64px clamp(20px, 5vw, 72px); border-radius: var(--radius); padding: clamp(28px, 5vw, 58px);
  display: grid; grid-template-columns: 1fr 360px; gap: 28px; align-items: end;
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, var(--surface)), color-mix(in srgb, var(--accent-2) 14%, var(--surface)));
  border: 1px solid var(--border); box-shadow: var(--shadow);
}
.cta p { color: var(--muted); line-height: 1.7; }
form { display: grid; gap: 12px; }
label { display: grid; gap: 7px; color: var(--muted); font-size: 13px; font-weight: 800; }
input { width: 100%; border: 1px solid var(--border); border-radius: 16px; padding: 13px 14px; font: inherit; color: var(--text); background: color-mix(in srgb, var(--bg) 78%, white 8%); }
footer { display: flex; justify-content: space-between; gap: 18px; padding: 28px clamp(20px, 5vw, 72px); color: var(--muted); border-top: 1px solid var(--border); }
.reveal { opacity: 0; transform: translateY(20px); transition: opacity .7s ease, transform .7s ease; transition-delay: var(--delay, 0ms); }
.reveal.visible { opacity: 1; transform: translateY(0); }
@keyframes float { from { transform: translate3d(0, 0, 0) scale(1); } to { transform: translate3d(20px, -28px, 0) scale(1.08); } }
@media (max-width: 980px) {
  .hero, .cta { grid-template-columns: 1fr; }
  .hero { min-height: auto; }
  .hero-visual { min-height: 420px; }
  .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .proof { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 680px) {
  .nav nav, .nav-cta { display: none; }
  .hero { padding-top: 42px; }
  .cards, .proof { grid-template-columns: 1fr; }
  footer { flex-direction: column; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
  .reveal { opacity: 1; transform: none; }
}
`;
  const js = `const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.16 });

document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = document.querySelector(link.getAttribute("href"));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

document.querySelector("form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  if (!button) return;
  const original = button.textContent;
  button.textContent = "Request received";
  setTimeout(() => { button.textContent = original; }, 1800);
});
`;
  return {
    plan: [
      "Detect website intent and category",
      "Plan visual system, layout, sections, animation, responsive behavior, and accessibility",
      "Generate premium static HTML, CSS, and JavaScript",
      "Self-review visual completeness before returning",
    ],
    files: [
      { operation: "create", path: "index.html", description: `${spec.category} website markup`, content: html },
      { operation: "create", path: "style.css", description: "Premium responsive design system and animations", content: css },
      { operation: "create", path: "script.js", description: "Intersection animations and interactions", content: js },
      { operation: "create", path: "README.md", description: "Website generation notes", content: `# ${spec.title}\n\nGenerated by Meldex Website Designer Agent V2.\n\n## Category\n\n${spec.category}\n\n## Visual System\n\n- Tone: ${spec.tone}\n- Sections: ${spec.sections.join(", ")}\n- Includes responsive layout, sticky navigation, animated reveal states, cards, CTA hierarchy, and accessible reduced-motion handling.\n\nOpen \`index.html\` to preview.\n` },
    ],
    commands: [],
    validation: ["Open index.html", "Check responsive layout", "Verify no horizontal overflow", "Review animation and spacing quality"],
    summary: `Created a premium ${spec.category.toLowerCase()} website with a complete section plan, visual design system, responsive layout, and animation layer.`,
    warnings: [],
  };
}

function heroHeadline(spec: WebsiteDesignSpec) {
  if (spec.category === "Restaurant") return `A cinematic table for ${spec.title}.`;
  if (spec.category === "Portfolio") return `Selected work with sharp craft and measurable impact.`;
  if (spec.category === "SaaS" || spec.category === "AI Startup") return `Build better workflows with ${spec.title}.`;
  return `${spec.title} that feels premium from the first scroll.`;
}

function visualMetric(category: WebsiteCategory) {
  if (category === "Restaurant") return "Reservations up 38%";
  if (category === "Portfolio") return "12 featured launches";
  if (category === "SaaS" || category === "AI Startup") return "2.4x faster teams";
  return "Client-ready experience";
}

function ctaHeadline(category: WebsiteCategory) {
  if (category === "Restaurant") return "Make the next reservation feel effortless.";
  if (category === "Portfolio") return "Turn attention into a real conversation.";
  if (category === "SaaS" || category === "AI Startup") return "Give visitors a reason to start today.";
  return "Launch a page that looks ready for real customers.";
}

function staticLandingPageResponse(task = "Create a modern landing page"): AgentResponse {
  return premiumStaticWebsiteResponse(task);
  // Legacy fallback kept below only as dead-code documentation for previous output quality.
  return {
    plan: [
      "Create a static HTML entry point",
      "Add responsive CSS",
      "Add small JavaScript interactions",
      "Document the project",
    ],
    files: [
      {
        operation: "create",
        path: "index.html",
        description: "Landing page markup",
        content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Meldex Landing Page</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="#">Meldex</a>
    <nav aria-label="Primary">
      <a href="#features">Features</a>
      <a href="#workflow">Workflow</a>
      <a href="#contact">Contact</a>
    </nav>
  </header>
  <main>
    <section class="hero">
      <p class="eyebrow">AI coding workspace</p>
      <h1>Build, review, and ship with a focused AI agent.</h1>
      <p class="lede">Meldex helps teams turn ideas into polished software with local execution, safe diffs, and production-aware checks.</p>
      <div class="actions">
        <a class="button primary" href="#contact">Start building</a>
        <a class="button" href="#features">See features</a>
      </div>
    </section>
    <section class="features" id="features">
      <article><h2>Plan</h2><p>Understand project structure before making changes.</p></article>
      <article><h2>Edit</h2><p>Preview every file change with clean red and green diffs.</p></article>
      <article><h2>Verify</h2><p>Run checks, capture errors, and retry fixes safely.</p></article>
    </section>
    <section class="workflow" id="workflow">
      <h2>A calm coding loop</h2>
      <ol>
        <li>Describe the task.</li>
        <li>Review the plan and patch.</li>
        <li>Apply changes and run checks.</li>
      </ol>
    </section>
  </main>
  <footer id="contact">Ready to build with Meldex?</footer>
  <script src="script.js"></script>
</body>
</html>
`,
      },
      {
        operation: "create",
        path: "style.css",
        description: "Responsive visual style",
        content: `:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --text: #111827;
  --muted: #6b7280;
  --surface: #f5f7fb;
  --border: #e5e7eb;
  --accent: #2563eb;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--text);
}
.site-header {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  border-bottom: 1px solid var(--border);
}
.brand { font-weight: 800; color: var(--text); text-decoration: none; }
nav { display: flex; gap: 18px; }
nav a { color: var(--muted); text-decoration: none; font-size: 14px; }
.hero {
  max-width: 900px;
  margin: 0 auto;
  padding: 96px 24px 72px;
  text-align: center;
}
.eyebrow { color: var(--accent); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; font-size: 12px; }
h1 { font-size: clamp(40px, 7vw, 76px); line-height: .96; letter-spacing: -.04em; margin: 16px 0; }
.lede { max-width: 680px; margin: 0 auto; color: var(--muted); font-size: 18px; line-height: 1.7; }
.actions { display: flex; justify-content: center; gap: 12px; margin-top: 32px; flex-wrap: wrap; }
.button {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 12px 18px;
  color: var(--text);
  text-decoration: none;
  font-weight: 700;
}
.button.primary { background: var(--accent); border-color: var(--accent); color: white; }
.features {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 24px 64px;
}
article { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 24px; }
article p, .workflow li { color: var(--muted); line-height: 1.6; }
.workflow { max-width: 760px; margin: 0 auto; padding: 48px 24px; }
footer { text-align: center; padding: 32px 24px; color: var(--muted); border-top: 1px solid var(--border); }
@media (prefers-color-scheme: dark) {
  :root { --bg: #0b0b0f; --text: #f9fafb; --muted: #a1a1aa; --surface: #15151d; --border: #27272a; --accent: #60a5fa; }
}
@media (max-width: 720px) {
  .site-header { padding: 0 18px; }
  nav { display: none; }
  .features { grid-template-columns: 1fr; }
}
`,
      },
      {
        operation: "create",
        path: "script.js",
        description: "Small interactive behavior",
        content: `document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = document.querySelector(link.getAttribute("href"));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});
`,
      },
      {
        operation: "create",
        path: "README.md",
        description: "Project documentation",
        content: `# Meldex Landing Page

A simple responsive landing page generated by Meldex Agent CLI.

## Files

- \`index.html\` - page structure
- \`style.css\` - responsive styling with light/dark support
- \`script.js\` - smooth anchor scrolling

Open \`index.html\` in a browser to preview the page.
`,
      },
    ],
    commands: [],
    summary: "Created a polished static landing page with HTML, CSS, JavaScript, and README documentation.",
    warnings: [],
  };
}

function isStaticLandingTask(task: string) {
  const lower = task.toLowerCase();
  return /\b(landing page|website|restaurant|hotel|cafe|portfolio|agency|saas|e-?commerce|travel|event|photography|real estate|developer tool)\b/i.test(lower)
    || (lower.includes("index.html") && lower.includes("style.css") && lower.includes("script.js"));
}

function isStaticOnlyProject(root: string) {
  if (fs.existsSync(path.join(root, "package.json"))) return false;
  const files = fs.readdirSync(root).filter((file) => !file.startsWith("."));
  return files.length === 0 || files.every((file) => ["index.html", "style.css", "styles.css", "script.js", "README.md"].includes(file));
}

function canUseStaticLandingFastPath(task: string, root: string) {
  if (!isStaticLandingTask(task) || !isStaticOnlyProject(root)) return false;
  const indexPath = path.join(root, "index.html");
  if (!fs.existsSync(indexPath)) return true;
  const current = fs.readFileSync(indexPath, "utf8");
  const hasSubstantialBody = /<h1|<section|<main[^>]*>[\s\S]{160,}<\/main>/i.test(current);
  return !hasSubstantialBody;
}

function calculateDiff(oldContent: string, newContent: string) {
  const oldLines = oldContent ? oldContent.split(/\r?\n/) : [];
  const newLines = newContent ? newContent.split(/\r?\n/) : [];
  let added = 0;
  let removed = 0;
  const max = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < max; i += 1) {
    if (oldLines[i] === newLines[i]) continue;
    if (oldLines[i] !== undefined) removed += 1;
    if (newLines[i] !== undefined) added += 1;
  }
  return { added, removed };
}

function preparePatches(root: string, files: FileAction[]) {
  return files.map((file) => {
    const full = path.resolve(root, file.path);
    if (!full.startsWith(path.resolve(root) + path.sep) && full !== path.resolve(root)) throw new Error(`Path escapes workspace: ${file.path}`);
    const oldContent = fs.existsSync(full) && file.operation !== "create" ? fs.readFileSync(full, "utf8") : "";
    const newContent = file.operation === "delete" ? "" : file.content || "";
    const diff = calculateDiff(oldContent, newContent);
    return { ...file, operation: file.operation === "update" ? "edit" : file.operation, oldContent, newContent, ...diff };
  });
}

function writeRollback(root: string, taskId: string, patches: ReturnType<typeof preparePatches>) {
  const file = path.join(meldexDir(root), "rollback", `${taskId}.json`);
  fs.writeFileSync(file, JSON.stringify({ taskId, createdAt: new Date().toISOString(), patches }, null, 2));
  return file;
}

function applyPatches(root: string, patches: ReturnType<typeof preparePatches>) {
  const changed: string[] = [];
  for (const patch of patches) {
    const full = path.resolve(root, patch.path);
    if (patch.operation === "delete") {
      if (fs.existsSync(full)) fs.unlinkSync(full);
    } else {
      mkdirp(path.dirname(full));
      fs.writeFileSync(full, patch.newContent, "utf8");
    }
    changed.push(patch.path);
  }
  return changed;
}

function rollback(root: string) {
  const dir = path.join(meldexDir(root), "rollback");
  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".json")).sort();
  const latest = files.at(-1);
  if (!latest) {
    emit("summary", { summary: "No rollback snapshot found." });
    return;
  }
  const snapshot = readJson(path.join(dir, latest)) as { patches?: Array<{ path: string; oldContent: string; operation: string }> } | null;
  for (const patch of [...(snapshot?.patches || [])].reverse()) {
    const full = path.resolve(root, patch.path);
    if (!patch.oldContent && patch.operation === "create") {
      if (fs.existsSync(full)) fs.unlinkSync(full);
    } else {
      mkdirp(path.dirname(full));
      fs.writeFileSync(full, patch.oldContent || "", "utf8");
    }
  }
  emit("done", { summary: `Rolled back ${latest}` });
}

function commandPolicy(command: string, safeMode: boolean) {
  if (BLOCKED_COMMANDS.some((pattern) => pattern.test(command))) return { allowed: false, reason: "Blocked dangerous command" };
  if (safeMode && CONFIRM_COMMANDS.some((pattern) => pattern.test(command))) return { allowed: false, reason: "Command requires manual confirmation" };
  if (!ALLOWED_PREFIXES.some((prefix) => command.trim().toLowerCase().startsWith(prefix))) return { allowed: false, reason: "Command is not in allowed tool list" };
  return { allowed: true };
}

function isPolicyBlockedResult(result: { exitCode: number; stderr: string }) {
  return result.exitCode === 126 && /Command is not in allowed tool list|Command requires manual confirmation|Blocked dangerous command/i.test(result.stderr);
}

function runCommand(command: string, cwd: string, safeMode: boolean) {
  const policy = commandPolicy(command, safeMode);
  if (!policy.allowed) {
    emit("error", { message: policy.reason, command });
    return { stdout: "", stderr: policy.reason || "blocked", exitCode: 126, durationMs: 0 };
  }
  const started = Date.now();
  emit("tool_start", { tool: "terminal", command });
  const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  const [bin, ...args] = parts;
  if (!bin) return { stdout: "", stderr: "Empty command", exitCode: 1, durationMs: Date.now() - started };
  const child = cp.spawnSync(bin, args, { cwd, encoding: "utf8", shell: process.platform === "win32" });
  const durationMs = Date.now() - started;
  if (child.stdout) emit("terminal", { stdout: child.stdout.slice(0, 8000), command, durationMs });
  if (child.stderr) emit("terminal", { stderr: child.stderr.slice(0, 8000), command, durationMs });
  emit("tool_result", { tool: "terminal", command, exitCode: child.status ?? 1, signal: child.signal, durationMs, cwd });
  return { stdout: child.stdout || "", stderr: child.stderr || "", exitCode: child.status ?? 1, durationMs };
}

function isPackageManagerCommand(command: string) {
  return /^(npm|pnpm|yarn|bun)\s+/i.test(command.trim());
}

function requestNeedsExecution(task: string) {
  return /\b(run|local server|start|preview|test|check|build|verify|open in browser)\b|chalavi ne bata|run kari ne check kar/i.test(task);
}

function requestNeedsServer(task: string) {
  return /\b(local server|start|preview|open in browser)\b|chalavi ne bata|run kari ne check kar/i.test(task);
}

function detectValidationCommands(root: string) {
  const packageJson = readJson(path.join(root, "package.json")) as { scripts?: Record<string, string> } | null;
  const scripts = packageJson?.scripts || {};
  const pm = detectProject(root).packageManager;
  const commands: string[] = [];
  if (scripts.build) commands.push(`${pm} run build`);
  if (scripts.lint) commands.push(`${pm} run lint`);
  if (scripts.test) commands.push(pm === "npm" ? "npm test" : `${pm} test`);
  if (!packageJson && fs.existsSync(path.join(root, "index.html"))) commands.push("node -e \"require('fs').accessSync('index.html')\"");
  return commands;
}

function detectServerCommand(root: string, port = 5173) {
  const packageJson = readJson(path.join(root, "package.json")) as { scripts?: Record<string, string>; dependencies?: Json; devDependencies?: Json } | null;
  const scripts = packageJson?.scripts || {};
  const deps = { ...((packageJson?.dependencies || {}) as Json), ...((packageJson?.devDependencies || {}) as Json) };
  const project = detectProject(root);
  const exists = (file: string) => fs.existsSync(path.join(root, file));
  const url = `http://localhost:${port}`;
  if (exists("index.html") && !packageJson) return { kind: "static", command: `python3 -m http.server ${port}`, port, url };
  if (exists("next.config.ts") || exists("next.config.js") || deps.next) return { kind: "next", command: scripts.dev ? `${project.packageManager} run dev -- --port ${port}` : `npx next dev -p ${port}`, port, url };
  if (exists("vite.config.ts") || exists("vite.config.js") || deps.vite) return { kind: "vite", command: scripts.dev ? `${project.packageManager} run dev -- --host localhost --port ${port}` : `npx vite --host localhost --port ${port}`, port, url };
  if (deps.react && scripts.dev) return { kind: "react", command: `${project.packageManager} run dev -- --host localhost --port ${port}`, port, url };
  if (packageJson && scripts.start) return { kind: "node", command: `${project.packageManager} start`, port, url };
  if (exists("index.php")) return { kind: "php", command: `php -S localhost:${port}`, port, url };
  if (exists("app.py")) return { kind: "python", command: "python3 app.py", port, url };
  if (exists("index.html")) return { kind: "static", command: `python3 -m http.server ${port}`, port, url };
  return { kind: "unknown", command: "", port, url: "" };
}

async function startServer(root: string, safeMode: boolean) {
  const freePort = await findFreePort(5173);
  const detected = detectServerCommand(root, freePort);
  if (!detected.command) {
    emit("server_status", { status: "error", projectKind: detected.kind, error: "No runnable local server command detected.", logs: [] });
    return { status: "error", logs: [], error: "No runnable local server command detected." };
  }
  const policy = commandPolicy(detected.command, safeMode);
  if (!policy.allowed) {
    emit("server_status", { status: "error", projectKind: detected.kind, command: detected.command, error: policy.reason, logs: [] });
    return { status: "error", logs: [], error: policy.reason };
  }

  emit("tool_start", { tool: "server", command: detected.command });
  emit("server_status", { status: "starting", projectKind: detected.kind, command: detected.command, port: detected.port, url: detected.url, logs: [] });
  const parts = detected.command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  const [bin, ...args] = parts;
  if (!bin) {
    emit("server_status", { status: "error", projectKind: detected.kind, command: detected.command, error: "Empty server command.", logs: [] });
    return { status: "error", logs: [], error: "Empty server command." };
  }
  const child: cp.ChildProcess = cp.spawn(bin, args, {
    cwd: root,
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
    env: { ...process.env, PORT: String(detected.port) },
  });
  const logs: string[] = [];
  let readyUrl = detected.url;
  const readyPattern = /(https?:\/\/(?:localhost|127\.0\.0\.1):\d+|localhost:\d+|\bready\b|\bstarted\b|\bcompiled\b|\blistening\b|\bserver running\b)/i;
  const capture = (text: string, stream: "stdout" | "stderr") => {
    logs.push(...text.split(/\r?\n/).filter(Boolean));
    if (stream === "stdout") emit("terminal", { stdout: text.slice(0, 4000), command: detected.command });
    else emit("terminal", { stderr: text.slice(0, 4000), command: detected.command });
    const match = text.match(/(https?:\/\/(?:localhost|127\.0\.0\.1):\d+|localhost:\d+)/i);
    if (match) readyUrl = match[1].startsWith("http") ? match[1] : `http://${match[1]}`;
  };
  child.stdout?.on("data", (chunk: Buffer) => capture(chunk.toString(), "stdout"));
  child.stderr?.on("data", (chunk: Buffer) => capture(chunk.toString(), "stderr"));

  const started = Date.now();
  while (Date.now() - started < 30000) {
    const verified = await verifyPreview(root, readyUrl);
    if (logs.some((line) => readyPattern.test(line)) || verified.ok) {
      emit("server_status", { status: "running", projectKind: detected.kind, command: detected.command, port: detected.port, url: readyUrl, pid: child.pid, logs: logs.slice(-80), verified: verified.ok, verification: verified.message });
      emit("tool_result", { tool: "server", status: "ok", command: detected.command, url: readyUrl, pid: child.pid });
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.unref();
      return { status: "running", url: readyUrl, port: detected.port, command: detected.command, pid: child.pid, logs, verified: verified.ok, verification: verified.message };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  child.kill("SIGTERM");
  emit("server_status", { status: "error", projectKind: detected.kind, command: detected.command, error: "Timed out waiting for preview URL.", logs: logs.slice(-80) });
  return { status: "error", error: "Timed out waiting for preview URL.", logs };
}

function verifyPreview(root: string, url: string) {
  return new Promise<{ ok: boolean; message: string }>((resolve) => {
    if (!url) { resolve({ ok: false, message: "No preview URL detected." }); return; }
    const req = http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => { body += chunk; });
      res.on("end", () => {
        const statusOk = (res.statusCode || 500) >= 200 && (res.statusCode || 500) < 400;
        const looksHtml = String(res.headers["content-type"] || "").includes("text/html") || /<!doctype html|<html|<body/i.test(body);
        const expected = titleFromIndex(root);
        const containsExpected = !expected || body.toLowerCase().includes(expected.toLowerCase());
        resolve({
          ok: statusOk && looksHtml && containsExpected,
          message: statusOk && looksHtml && containsExpected ? `HTTP ${res.statusCode} verified HTML preview.` : `Preview verification failed: HTTP ${res.statusCode}, html=${looksHtml}, content=${containsExpected}.`,
        });
      });
    });
    req.on("error", (error) => resolve({ ok: false, message: error.message }));
    req.setTimeout(2500, () => {
      req.destroy();
      resolve({ ok: false, message: "Preview verification timed out." });
    });
  });
}

function findFreePort(start: number) {
  return new Promise<number>((resolve) => {
    const tryPort = (port: number) => {
      const server = net.createServer();
      server.unref();
      server.on("error", () => tryPort(port + 1));
      server.listen(port, () => server.close(() => resolve(port)));
    };
    tryPort(start);
  });
}

function titleFromIndex(root: string) {
  try {
    return fs.readFileSync(path.join(root, "index.html"), "utf8").match(/<title>(.*?)<\/title>/i)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

function relativeToRoot(root: string, file?: string) {
  if (!file) return undefined;
  const normalized = file.replace(/^file:\/\//, "");
  const absolute = path.isAbsolute(normalized) ? normalized : path.resolve(root, normalized);
  const relative = path.relative(root, absolute).replace(/\\/g, "/");
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return path.basename(normalized);
  return relative;
}

function allowedAutofixFiles(root: string, parsed: ParsedError, recentFiles: string[]) {
  const file = relativeToRoot(root, parsed.file);
  if (file && ["syntax", "typescript", "eslint", "vite", "next", "node"].includes(parsed.kind)) return new Set([file]);
  if (parsed.kind === "dependency") return new Set(recentFiles.filter((item) => /\.(ts|tsx|js|jsx|mjs|cjs|json)$/.test(item)));
  return null;
}

function unrelatedAutofixFiles(root: string, parsed: ParsedError, patches: ReturnType<typeof preparePatches>, recentFiles: string[]) {
  const allowed = allowedAutofixFiles(root, parsed, recentFiles);
  if (!allowed || allowed.size === 0) return [];
  return patches.map((patch) => patch.path).filter((file) => !allowed.has(file));
}

function staticAutofixRuleViolations(root: string, patches: ReturnType<typeof preparePatches>) {
  if (!isStaticOnlyProject(root)) return [];
  return patches
    .map((patch) => patch.path)
    .filter((file) => file === "package.json" || file === "package-lock.json" || file === "server.js");
}

async function autofixFailure(
  root: string,
  task: string,
  rawError: string,
  recentFiles: string[],
  token: string,
  config: CliConfig,
  taskId: string,
  attempt: number
) {
  const parsed = parseAgentError(rawError);
  emit("retry", { attempt, maxRetries: config.maxRetries, message: parsed.title, parsed });
  if (/Command is not in allowed tool list|Command requires manual confirmation|Blocked dangerous command/i.test(rawError)) {
    emit("tool_result", {
      tool: "autofix_scope",
      status: "skipped",
      reason: "Command was blocked by CLI safety policy; not treating it as a source-code defect.",
    });
    return { applied: [] as string[], fingerprint: errorFingerprint(parsed), summary: "Skipped autofix for safety-policy-blocked command." };
  }
  const fix = buildFixTask({ root, taskGoal: task, error: parsed, rawOutput: rawError, recentFiles });
  const runtime = new CodexStyleRuntimeAdapter({
    root,
    taskId: `${taskId}-fix-${attempt}`,
    emit,
    safeMode: config.safeMode,
    contextCharBudget: 18000,
  });
  let response = validateAgentResponse(await apiRequest<AgentResponse>(config.backendUrl, token, "/api/extensions/agent", "POST", { task: fix.task, context: fix.context }));
  let patches = preparePatches(root, response.files || []);
  const allowed = allowedAutofixFiles(root, parsed, recentFiles);
  let guard = runtime.guardPatch({
    patches,
    mode: "autofix",
    allowedFiles: allowed ? [...allowed] : undefined,
    staticProject: isStaticOnlyProject(root),
  });
  if (!guard.ok) {
    emit("tool_result", {
      tool: "autofix_scope",
      status: "rejected",
      reason: "Autofix patch failed Codex-style runtime guard.",
      rejectedFiles: guard.rejectedFiles,
      reasons: guard.reasons,
    });
    response = validateAgentResponse(await apiRequest<AgentResponse>(config.backendUrl, token, "/api/extensions/agent", "POST", {
      task: `${fix.task}\n\nSTRICT PATCH SCOPE: Return the smallest possible patch. ${allowed ? `Only edit: ${[...allowed].join(", ")}.` : "Do not edit unrelated files."} Static HTML projects must not add package.json, package-lock.json, Express, or server.js.`,
      context: fix.context,
    }));
    patches = preparePatches(root, response.files || []);
    guard = runtime.guardPatch({
      patches,
      mode: "autofix",
      allowedFiles: allowed ? [...allowed] : undefined,
      staticProject: isStaticOnlyProject(root),
    });
    if (!guard.ok) {
      return { applied: [] as string[], fingerprint: errorFingerprint(parsed), summary: `Autofix guard blocked: ${guard.rejectedFiles.join(", ")}` };
    }
  }
  const staticViolations = staticAutofixRuleViolations(root, patches);
  if (staticViolations.length) {
    emit("tool_result", {
      tool: "autofix_scope",
      status: "blocked",
      reason: "Static project autofix cannot add package/server dependency files.",
      rejectedFiles: staticViolations,
    });
    return { applied: [] as string[], fingerprint: errorFingerprint(parsed), summary: `Autofix blocked static dependency files: ${staticViolations.join(", ")}` };
  }
  let unrelated = unrelatedAutofixFiles(root, parsed, patches, recentFiles);
  if (unrelated.length) {
    emit("tool_result", {
      tool: "autofix_scope",
      status: "rejected",
      reason: "Autofix patch touched files unrelated to the parsed error.",
      allowedFiles: [...(allowedAutofixFiles(root, parsed, recentFiles) || [])],
      rejectedFiles: unrelated,
    });
    response = validateAgentResponse(await apiRequest<AgentResponse>(config.backendUrl, token, "/api/extensions/agent", "POST", {
      task: `${fix.task}\n\nSTRICT PATCH SCOPE: The detected error is in ${relativeToRoot(root, parsed.file) || "the reported file"}. Return a minimal patch for only that file. Do not rewrite unrelated files, HTML links, CSS, package.json, or server files unless the error log explicitly names them.`,
      context: fix.context,
    }));
    patches = preparePatches(root, response.files || []);
    unrelated = unrelatedAutofixFiles(root, parsed, patches, recentFiles);
    if (unrelated.length) {
      emit("tool_result", {
        tool: "autofix_scope",
        status: "blocked",
        reason: "Regenerated autofix still touched unrelated files.",
        rejectedFiles: unrelated,
      });
      return { applied: [] as string[], fingerprint: errorFingerprint(parsed), summary: `Autofix scope blocked: ${unrelated.join(", ")}` };
    }
  }
  if (!patches.length) return { applied: [] as string[], fingerprint: errorFingerprint(parsed), summary: "No fix patch returned." };
  writeRollback(root, `${taskId}-fix-${attempt}`, patches);
  emit("diff", { files: patches.map(({ path: filePath, operation, added, removed }) => ({ path: filePath, operation, added, removed })), totalAdded: patches.reduce((n, p) => n + p.added, 0), totalRemoved: patches.reduce((n, p) => n + p.removed, 0) });
  emit("patch", { files: patches.map(({ path: filePath, operation, newContent, description }) => ({ path: filePath, operation, content: newContent, description })) });
  const applied = applyPatches(root, patches);
  emit("tool_result", { tool: "autofix", status: "ok", attempt, applied });
  return { applied, fingerprint: errorFingerprint(parsed), summary: response.summary || parsed.fixStrategy };
}

function updateMemory(root: string, task: string, summary: string, files: string[]) {
  const file = path.join(meldexDir(root), "memory.json");
  const memory = readJson(file) || { recentTasks: [], recentFiles: [], recentErrors: [], successfulFixes: [] };
  const next = {
    ...memory,
    recentTasks: [{ task, summary, at: new Date().toISOString() }, ...((memory.recentTasks as unknown[]) || [])].slice(0, 30),
    recentFiles: [...new Set([...files, ...((memory.recentFiles as string[]) || [])])].slice(0, 80),
  };
  fs.writeFileSync(file, JSON.stringify(next, null, 2));
}

async function runTask(root: string, task: string, config: CliConfig, opts: Record<string, string | boolean>) {
  const resolvedToken = resolveCliToken(opts);
  if (!resolvedToken) throw new Error(`MELDEX_TOKEN, --token, or extension-provided token is required. ${authInstruction()}`);
  const token = resolvedToken.token;
  const taskId = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const logFile = path.join(meldexDir(root), "logs", `${taskId}.jsonl`);
  const runtime = new CodexStyleRuntimeAdapter({
    root,
    taskId,
    emit,
    safeMode: config.safeMode,
    contextCharBudget: Number(process.env.MELDEX_CONTEXT_CHAR_BUDGET || 24000),
  });
  const originalEmit = emit;
  runtime.event("task_started", {
    goal: task,
    backendUrl: config.backendUrl,
    modelProfile: config.modelProfile || "coding",
    tokenSource: resolvedToken.source,
    token: resolvedToken.masked,
  });
  emit("thinking", { message: "Understanding request", taskId });
  runtime.assertNotInterrupted();
  const index = buildIndex(root, config);
  emit("thinking", { message: "Analyzing project" });
  const relevantFiles = selectRelevantFiles(root, task, index);
  const packedContext = runtime.packContext(relevantFiles);
  const tiePlan = buildToolIntelligencePlan({
    root,
    goal: task,
    framework: String(((index.project || {}) as Json).framework || "Unknown"),
    packageManager: String(((index.project || {}) as Json).packageManager || "npm"),
    files: relevantFiles,
    commands: [],
    storageDir: meldexDir(root),
  });
  emit("tool_result", {
    tool: "tie_tool_selection",
    status: "ok",
    confidence: tiePlan.confidence,
    selectedTools: tiePlan.selectedTools.map((item) => ({
      name: item.tool.name,
      capability: item.tool.capability,
      risk: item.tool.riskLevel,
      confidence: item.confidence,
      order: item.order,
      parallel: item.canRunInParallel,
      validation: item.validation,
    })),
    parallelGroups: tiePlan.parallelGroups,
    symbolCount: tiePlan.symbolGraph.length,
    diagnostics: tiePlan.diagnostics.slice(0, 8),
    estimatedLatencyMs: tiePlan.executionOptimizer.estimatedLatencyMs,
  });
  const plan = buildPlan(task, index);
  const memory = readWorkspaceMemory(meldexDir(root));
  const relevantMemory = retrieveRelevantMemory(memory, task);
  runtime.event("project_instructions_loaded", {
    source: "context_memory",
    relatedTasks: relevantMemory.relatedTasks,
    relatedErrors: relevantMemory.relatedErrors,
    reusedStyle: relevantMemory.reusedStyle,
  });
  emit("tool_result", {
    tool: "context_memory",
    status: "ok",
    loaded: Boolean(relevantMemory.snippet),
    relatedTasks: relevantMemory.relatedTasks,
    relatedErrors: relevantMemory.relatedErrors,
    reusedStyle: relevantMemory.reusedStyle,
  });
  const projectMeta = (index.project || {}) as Json;
  const codexPlan = buildCodexIntelligencePlan({
    task,
    framework: String(projectMeta.framework || "Unknown"),
    files: (index.fileTree as string[]) || [],
    packageJson: relevantFiles.find((file) => file.path === "package.json")?.content,
    memory,
  });
  emit("tool_result", {
    tool: "task_classifier",
    status: "ok",
    classification: codexPlan.classification,
  });
  emit("tool_result", {
    tool: "confidence_engine",
    status: codexPlan.confidence.decision === "block" ? "blocked" : codexPlan.confidence.decision === "ask_user" ? "needs_input" : "ok",
    confidence: codexPlan.confidence,
  });
  emit("tool_result", {
    tool: "role_pipeline",
    status: "ok",
    roles: codexPlan.roles.filter((role) => role.selected),
    summaries: codexPlan.safeSummary,
  });
  for (const role of codexPlan.roles.filter((item) => item.selected)) {
    runtime.event("task_started", {
      stage: "role_pipeline",
      role: role.role,
      summary: role.summary,
      confidence: role.confidence,
      nextAction: role.nextAction,
    });
  }
  if (codexPlan.confidence.decision === "block" || codexPlan.confidence.decision === "ask_user") {
    emit("error", {
      message: codexPlan.confidence.reason,
      classification: codexPlan.classification,
      missingInfo: codexPlan.planner.missingInfo,
    });
    return;
  }
  const milBefore = buildMilInsight({
    root,
    task,
    meta: {
      framework: String(projectMeta.framework || "Unknown"),
      packageManager: String(projectMeta.packageManager || "npm"),
      scripts: ((projectMeta.scripts || {}) as Record<string, string>),
      fileTree: (index.fileTree as string[]) || [],
    },
    relevantFiles,
    memory,
  });
  emit("tool_result", {
    tool: "mil_intelligence",
    status: "ok",
    prediction: milBefore.prediction,
    risk: milBefore.risk,
    quality: milBefore.quality,
    impact: milBefore.impact,
    recommendations: milBefore.recommendations,
    summary: insightSummary(milBefore),
  });
  const aoePlan = buildAutonomousPlan({
    task,
    projectType: String(projectMeta.framework || "Unknown"),
    packageManager: String(projectMeta.packageManager || "npm"),
    relevantFiles: relevantFiles.map((file) => file.path),
    packageJson: relevantFiles.find((file) => file.path === "package.json")?.content,
    memory,
    hasActiveFile: false,
  });
  emit("tool_result", {
    tool: "aoe_orchestrator",
    status: "ok",
    confidence: aoePlan.confidence,
    complexity: aoePlan.complexity,
    roles: aoePlan.selectedRoles,
    taskGraph: aoePlan.taskGraph.map(({ id, title, role, dependsOn, confidence, risk }) => ({ id, title, role, dependsOn, confidence, risk })),
    summary: safeReasoningSummary(aoePlan),
  });
  if (planNeedsUserInput(aoePlan)) {
    emit("error", { message: `Need clarification before continuing. Confidence ${aoePlan.confidence}%.`, assumptions: aoePlan.assumptions });
    return;
  }
  runtime.assertNotInterrupted();
  const optimized = optimizeCliTaskForQwen(
    task,
    index,
    packedContext.files,
    [codexPlan.promptSection, autonomousPromptSection(aoePlan), relevantMemory.snippet, packedContext.instructions ? `Project instructions:\n${packedContext.instructions}` : ""].filter(Boolean).join("\n\n")
  );
  emit("tool_result", { tool: "qwen_optimizer", status: "ok", profile: optimized.profile, reasoning: optimized.reasoning });
  emit("plan", plan);
  const context = {
    workspaceName: path.basename(root),
    projectType: (index.project as Json)?.framework,
    packageManager: (index.project as Json)?.packageManager,
    projectFiles: (index.fileTree as string[]).slice(0, 80),
    relevantFiles: packedContext.files,
    projectInstructions: packedContext.instructions,
    contextPacking: { omitted: packedContext.omitted, charCount: packedContext.charCount },
    packageJson: relevantFiles.find((file) => file.path === "package.json")?.content,
  };
  let response: AgentResponse;
  if (canUseStaticLandingFastPath(task, root)) {
    emit("tool_start", { tool: "fast_path", task: "static_landing_page" });
    response = validateAgentResponse(staticLandingPageResponse(task));
    emit("tool_result", { tool: "fast_path", status: "ok", files: response.files?.length || 0 });
  } else {
    emit("tool_start", { tool: "backend", endpoint: "/api/extensions/agent" });
    response = validateAgentResponse(await apiRequest<AgentResponse>(config.backendUrl, token, "/api/extensions/agent", "POST", { task: optimized.task, context }));
    if (weakAgentResponse(response)) {
      emit("retry", { attempt: 1, maxRetries: 2, message: "Repairing weak action JSON" });
      response = validateAgentResponse(await apiRequest<AgentResponse>(config.backendUrl, token, "/api/extensions/agent", "POST", {
        task: `${optimized.task}\n\nPrevious response was weak. Return valid JSON actions only with plan, files, commands, validation, and summary.`,
        context,
      }));
    }
    emit("tool_result", { tool: "backend", status: "ok", files: response.files?.length || 0 });
  }
  const reviewFindings = [
    ...reviewCliActions(response.files || [], root, task),
    ...reviewCliCommands(response.commands || [], root, task),
  ];
  const tiePatchFindings = validatePatchPlan(response.files || [], root);
  const codingScore = codingQualityScore(response.files || [], response.commands || [], [...reviewFindings, ...tiePatchFindings]);
  emit("tool_result", { tool: "coding_quality_score", status: codingScore.overall >= 85 ? "ok" : "needs_improvement", score: codingScore });
  emit("tool_result", { tool: "self_review", status: reviewFindings.length || tiePatchFindings.length ? "failed" : "ok", findings: [...reviewFindings, ...tiePatchFindings] });
  if (reviewFindings.length || tiePatchFindings.length) throw new Error(`Self-review blocked patch: ${[...reviewFindings, ...tiePatchFindings].join("; ")}`);
  if (codingScore.overall < 85) throw new Error(`Coding quality score below 85: ${codingScore.overall}`);
  const changedPaths = (response.files || []).map((file) => file.path);
  const milPatch = buildMilInsight({
    root,
    task,
    meta: {
      framework: String(projectMeta.framework || "Unknown"),
      packageManager: String(projectMeta.packageManager || "npm"),
      scripts: ((projectMeta.scripts || {}) as Record<string, string>),
      fileTree: (index.fileTree as string[]) || [],
    },
    relevantFiles,
    changedFiles: changedPaths,
    memory,
  });
  const unsafe = blockUnsafePatch(milPatch);
  emit("tool_result", {
    tool: "mil_risk",
    status: unsafe.length ? "blocked" : "ok",
    risk: milPatch.risk,
    impact: milPatch.impact,
    blockers: unsafe,
  });
  if (unsafe.length) throw new Error(`MIL security blocked patch: ${unsafe.join("; ")}`);
  const patches = preparePatches(root, response.files || []);
  const patchGuard = runtime.guardPatch({ patches, mode: "task", staticProject: isStaticOnlyProject(root) });
  if (!patchGuard.ok) throw new Error(`Runtime patch guard blocked patch: ${patchGuard.reasons.join("; ")}`);
  writeRollback(root, taskId, patches);
  runtime.event("rollback_recorded", { files: patches.map((patch) => patch.path) });
  let totalAdded = 0;
  let totalRemoved = 0;
  for (const patch of patches) {
    totalAdded += patch.added;
    totalRemoved += patch.removed;
    emit("file_change", { path: patch.path, operation: patch.operation, added: patch.added, removed: patch.removed });
  }
  emit("diff", { files: patches.map(({ path: filePath, operation, added, removed }) => ({ path: filePath, operation, added, removed })), totalAdded, totalRemoved });
  emit("patch", {
    files: patches.map(({ path: filePath, operation, newContent, description }) => ({
      path: filePath,
      operation,
      content: newContent,
      description,
    })),
  });
  const shouldApply = config.autoApply || opts.apply === true;
  let applied: string[] = [];
  if (shouldApply) {
    runtime.assertNotInterrupted();
    emit("tool_start", { tool: "apply_patch" });
    applied = applyPatches(root, patches);
    emit("tool_result", { tool: "apply_patch", status: "ok", applied });
  } else {
    emit("summary", { summary: "Patch preview prepared. Re-run with --apply or use extension Apply." });
  }
  if (applied.length) {
    const shouldExecute = requestNeedsExecution(task);
    const requestedCommands = response.commands?.length ? response.commands : shouldExecute ? detectValidationCommands(root) : plan.commandsToRun;
    const classifiedCommands = runtime.splitCommands(requestedCommands);
    const serverCommands = classifiedCommands.server;
    const commands = classifiedCommands.validation;
    if (serverCommands.length) {
      emit("tool_result", { tool: "server_command_classifier", status: "ok", serverCommands, validationCommands: commands });
    }
    const commandResults: string[] = [];
    let buildPassed = false;
    let testsPassed = false;
    let previewVerified = false;
    const skippedCommands: string[] = [];
    const seenErrors = new Map<string, number>();
    for (const command of commands) {
      runtime.assertNotInterrupted();
      let commandPassed = false;
      for (let attempt = 1; attempt <= config.maxRetries; attempt += 1) {
        if (!fs.existsSync(path.join(root, "package.json")) && isPackageManagerCommand(command)) {
          emit("tool_result", {
            tool: "terminal",
            command,
            status: "skipped",
            reason: "Static project has no package.json; package-manager validation command is not applicable.",
          });
          skippedCommands.push(command);
          commandPassed = true;
          break;
        }
        const result = runCommand(command, root, config.safeMode);
        if (result.exitCode === 0) {
          commandPassed = true;
          commandResults.push(command);
          if (command.includes("build")) buildPassed = true;
          if (command.includes("test")) testsPassed = true;
          break;
        }
        if (isPolicyBlockedResult(result)) {
          emit("tool_result", {
            tool: "terminal",
            command,
            status: "skipped",
            reason: result.stderr,
          });
          skippedCommands.push(command);
          commandPassed = true;
          break;
        }
        const raw = result.stderr || result.stdout || `Command failed: ${command}`;
        const parsed = parseAgentError(raw);
        const fingerprint = errorFingerprint(parsed);
        const seen = (seenErrors.get(fingerprint) || 0) + 1;
        seenErrors.set(fingerprint, seen);
        if (seen >= 2) {
          emit("error", { message: `Same error repeated twice: ${parsed.title}`, parsed });
          break;
        }
        const fix = await autofixFailure(root, task, raw, applied, token, config, taskId, attempt);
        if (!fix.applied.length) {
          emit("error", { message: fix.summary, parsed });
          break;
        }
        applied.push(...fix.applied);
      }
      if (!commandPassed) break;
    }
    if (requestNeedsServer(task) || serverCommands.length) {
      let server = await startServer(root, config.safeMode);
      previewVerified = !!server.verified;
      if (server.status !== "running" && config.maxRetries > 0) {
        const raw = [...(server.logs || []), server.error || "Server failed"].join("\n");
        const fix = await autofixFailure(root, task, raw, applied, token, config, taskId, 1);
        if (fix.applied.length) server = await startServer(root, config.safeMode);
        previewVerified = !!server.verified;
      }
    }
    const milAfter = buildMilInsight({
      root,
      task,
      meta: {
        framework: String(projectMeta.framework || "Unknown"),
        packageManager: String(projectMeta.packageManager || "npm"),
        scripts: ((projectMeta.scripts || {}) as Record<string, string>),
        fileTree: (index.fileTree as string[]) || [],
      },
      relevantFiles,
      changedFiles: patches.map((patch) => patch.path),
      commandsRun: commandResults,
      memory,
      buildPassed,
      previewVerified,
      testsPassed,
    });
    emit("mil_insight", {
      quality: milAfter.quality,
      risk: milAfter.risk,
      filesChanged: patches.map((patch) => patch.path),
      buildStatus: buildPassed ? "passed" : commands.some((cmd) => cmd.includes("build") && !skippedCommands.includes(cmd)) ? "not_run_or_failed" : "not_applicable",
      previewStatus: previewVerified ? "verified" : requestNeedsServer(task) ? "not_verified" : "not_applicable",
      recommendations: milAfter.recommendations,
      summary: insightSummary(milAfter),
    });
    learnFromTask(meldexDir(root), {
      prompt: task,
      summary: response.summary || "Task completed",
      files: applied,
      validation: commandResults.join(", "),
      qualityScore: milAfter.quality.overall,
      activePreviewCommand: requestNeedsServer(task) ? detectServerCommand(root).command : undefined,
      predictions: milAfter.prediction.likelyNextRequests,
      selfImprovement: milAfter.selfImprovement,
      style: [
        milAfter.style.indentation,
        milAfter.style.importStyle,
        milAfter.style.componentStyle,
        ...milAfter.style.naming,
      ],
    });
  }
  const summary = response.summary || `Prepared ${patches.length} file change(s).`;
  updateMemory(root, task, summary, patches.map((patch) => patch.path));
  learnFromTask(meldexDir(root), {
    prompt: task,
    summary,
    files: patches.map((patch) => patch.path),
    validation: applied.length ? "applied" : "preview only",
    qualityScore: 0,
    projectSummary: String((index.project as Json)?.framework || "Unknown"),
    architectureSummary: aoePlan.architecture,
    edits: patches.map((patch) => patch.path),
    commands: response.commands || plan.commandsToRun,
    fixes: applied.length ? [`Completed: ${summary}`] : [],
    style: ["Use existing project conventions", "Prefer minimal patches", "Verify before delivery"],
    decisions: Array.isArray(response.plan) ? response.plan : [],
    predictions: milBefore.prediction.likelyNextRequests,
    selfImprovement: milBefore.selfImprovement,
  });
  fs.appendFileSync(logFile, JSON.stringify({ taskId, task, summary, files: patches.map((patch) => patch.path), at: new Date().toISOString() }) + "\n");
  learnToolSequence(meldexDir(root), String((index.project as Json)?.framework || "Unknown"), tiePlan.selectedTools.map((item) => item.tool.name), Date.now() - Number(taskId.split("-")[0] || Date.now()));
  runtime.complete(summary, { applied, files: patches.map((patch) => patch.path) });
  originalEmit("done", { taskId, summary, applied, files: patches.map((patch) => patch.path) });
}

async function doctor(root: string, config: CliConfig, opts: Record<string, string | boolean>) {
  emit("thinking", { message: "Running doctor checks" });
  const authMode = opts.auth === true || opts.auth === "true";
  const resolvedToken = resolveCliToken(opts);
  const token = resolvedToken?.token || "";
  const effectiveBackendUrl = resolvedToken?.backendUrl || config.backendUrl;
  const checks: Json = {
    node: process.version,
    npm: cp.spawnSync("npm", ["--version"], { encoding: "utf8" }).stdout.trim(),
    git: cp.spawnSync("git", ["--version"], { encoding: "utf8" }).stdout.trim(),
    os: `${os.platform()} ${os.arch()}`,
    shell: process.env.SHELL || process.env.ComSpec || "unknown",
    workspace: root,
    writePermissions: true,
    backendUrl: effectiveBackendUrl,
    authToken: token ? "present" : "missing",
    authTokenSource: resolvedToken?.source || "missing",
    authTokenMasked: resolvedToken?.masked || null,
    authInstruction: token ? undefined : authInstruction(),
  };
  try {
    fs.accessSync(root, fs.constants.W_OK);
  } catch {
    checks.writePermissions = false;
  }
  if (authMode && !token) {
    checks.auth = "failed";
    checks.me = "not_run";
    checks.modelHealth = "not_run";
    emit("done", { summary: "Doctor auth failed: token missing", checks });
    throw new Error(authInstruction());
  }
  if (token) {
    try {
      const me = await apiRequest<Json>(effectiveBackendUrl, token, "/api/extensions/me");
      checks.me = { status: "ok", email: me.email, role: me.role, expiresAt: me.expiresAt ?? null };
      const modelHealth = await apiRequest<Json>(effectiveBackendUrl, token, "/api/extensions/model-health");
      checks.modelHealth = {
        status: "ok",
        healthy: modelHealth.healthy === true,
        provider: modelHealth.provider,
        model: modelHealth.model,
        providerStatus: modelHealth.status,
        message: modelHealth.message,
        retryAfter: modelHealth.retryAfter ?? null,
      };
      if (authMode && modelHealth.healthy !== true) throw new Error(String(modelHealth.message || "Model health failed"));
      const health = await apiRequest<Json>(effectiveBackendUrl, token, "/api/extensions/health");
      checks.backend = "ok";
      checks.model = health.model;
      checks.auth = "ok";
    } catch (error) {
      checks.auth = "failed";
      checks.backend = error instanceof Error ? error.message : String(error);
      if (authMode) {
        emit("done", { summary: "Doctor auth failed", checks });
        throw error;
      }
    }
  }
  emit("done", { summary: "Doctor complete", checks });
}

async function benchmark(root: string, config: CliConfig, opts: Record<string, string | boolean>) {
  const resolvedToken = resolveCliToken(opts);
  if (!resolvedToken) {
    const instruction = authInstruction();
    emit("error", { message: instruction, authToken: "missing" });
    throw new Error(instruction);
  }
  const token = resolvedToken.token;
  const effectiveBackendUrl = resolvedToken.backendUrl || config.backendUrl;
  try {
    await apiRequest<Json>(effectiveBackendUrl, token, "/api/extensions/me");
    const modelHealth = await apiRequest<Json>(effectiveBackendUrl, token, "/api/extensions/model-health");
    emit("tool_result", {
      tool: "auth_preflight",
      status: modelHealth.healthy === true ? "ok" : "failed",
      tokenSource: resolvedToken.source,
      token: resolvedToken.masked,
      provider: modelHealth.provider,
      model: modelHealth.model,
      providerStatus: modelHealth.status,
      message: modelHealth.message,
    });
    if (modelHealth.healthy !== true) throw new Error(String(modelHealth.message || "Model health failed"));
  } catch (error) {
    emit("error", { message: error instanceof Error ? error.message : String(error), authInstruction: authInstruction() });
    throw error;
  }
  const source = opts.source ? String(opts.source) : undefined;
  const sourceTypeValue = String(opts["source-type"] || "");
  const sourceType = ["github", "gitlab", "bitbucket", "local", "zip", "sample"].includes(sourceTypeValue)
    ? sourceTypeValue as "github" | "gitlab" | "bitbucket" | "local" | "zip" | "sample"
    : undefined;
  const scheduleValue = String(opts.schedule || "manual");
  const schedule = ["manual", "daily", "weekly"].includes(scheduleValue)
    ? scheduleValue as "manual" | "daily" | "weekly"
    : "manual";
  const run = await runBenchmarkLab({
    source,
    sourceType,
    storageDir: meldexDir(root),
    token,
    backendUrl: effectiveBackendUrl,
    cliPath: path.resolve(process.argv[1]),
    keepSandbox: opts["keep-sandbox"] === true,
    maxRetries: Number(opts.maxRetries || 5),
    taskLimit: Number(opts.tasks || 6),
    offline: opts.offline === true,
    schedule,
  }, emit);
  emit("done", {
    summary: "Benchmark Lab complete",
    runId: run.id,
    engine: run.engine,
    successRate: run.leaderboard.successRate,
    averageRetries: run.leaderboard.averageRetries,
    reports: run.reports,
  });
}

async function tools(root: string, config: CliConfig, opts: Record<string, string | boolean>) {
  const index = buildIndex(root, config);
  const relevantFiles = selectRelevantFiles(root, positionalGoal(opts), index);
  const plan = buildToolIntelligencePlan({
    root,
    goal: positionalGoal(opts),
    framework: String(((index.project || {}) as Json).framework || "Unknown"),
    packageManager: String(((index.project || {}) as Json).packageManager || "npm"),
    files: relevantFiles,
    storageDir: meldexDir(root),
  });
  emit("done", {
    summary: "Tool Intelligence Engine",
    registry: TOOL_REGISTRY.map(({ name, capability, riskLevel, permissions, supportedFrameworks, estimatedLatencyMs, confidence }) => ({ name, capability, riskLevel, permissions, supportedFrameworks, estimatedLatencyMs, confidence })),
    selectedTools: plan.selectedTools.map((item) => item.tool.name),
    parallelGroups: plan.parallelGroups,
    symbolGraph: plan.symbolGraph.slice(0, 80),
    projectHealth: plan.projectHealth,
    git: plan.git,
  });
}

function positionalGoal(opts: Record<string, string | boolean>) {
  return String(opts.goal || "inspect project health and choose tools");
}

async function main() {
  const { command, positional, opts } = parseArgs(process.argv.slice(2));
  if (command === "--version" || command === "-v" || command === "version") {
    process.stdout.write(`meldex-agent ${packageVersion()}\n`);
    return;
  }
  const root = workspaceFrom(opts);
  const config = readConfig(root, opts);
  try {
    if (command === "run") await runTask(root, positional.join(" "), config, opts);
    else if (command === "doctor") await doctor(root, config, opts);
    else if (command === "benchmark") await benchmark(root, config, opts);
    else if (command === "tools") await tools(root, config, opts);
    else if (command === "index") emit("done", { summary: "Index complete", index: buildIndex(root, config) });
    else if (command === "plan") emit("plan", buildPlan(positional.join(" "), buildIndex(root, config)));
    else if (command === "rollback") rollback(root);
    else if (command === "status") emit("done", { summary: "Status", git: gitInfo(root), index: readJson(path.join(meldexDir(root), "index.json")) });
    else if (command === "config") emit("done", { summary: "Config", config });
    else if (command === "apply") emit("error", { message: "Use meldex-agent run --apply for the latest generated patch." });
    else emit("done", { summary: "Usage: meldex-agent run \"task\" | tools | benchmark | doctor | index | plan \"task\" | rollback | status | config" });
  } catch (error) {
    emit("error", { message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  }
}

void main();
