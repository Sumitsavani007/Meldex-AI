import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";

export type ToolRisk = "low" | "medium" | "high" | "critical";
export type ToolPermission = "read" | "write" | "execute" | "network" | "database" | "browser";

export interface ToolSchema {
  type: "object";
  required?: string[];
  properties: Record<string, string>;
}

export interface ToolDefinition {
  name: string;
  capability: string;
  inputSchema: ToolSchema;
  outputSchema: ToolSchema;
  permissions: ToolPermission[];
  riskLevel: ToolRisk;
  supportedFrameworks: string[];
  estimatedLatencyMs: number;
  confidence: number;
  tags: string[];
}

export interface ToolSelection {
  tool: ToolDefinition;
  reason: string;
  confidence: number;
  order: number;
  canRunInParallel: boolean;
  validation: string[];
  retryStrategy: string;
}

export interface SymbolNode {
  name: string;
  kind: "class" | "interface" | "function" | "export" | "import" | "route" | "component" | "hook" | "api";
  file: string;
  line: number;
  references: string[];
}

export interface ProjectHealth {
  brokenImports: string[];
  deadFiles: string[];
  missingExports: string[];
  dependencyIssues: string[];
  circularDependencies: string[];
  buildWarnings: string[];
}

export interface ToolIntelligencePlan {
  goal: string;
  selectedTools: ToolSelection[];
  parallelGroups: string[][];
  symbolGraph: SymbolNode[];
  diagnostics: string[];
  projectHealth: ProjectHealth;
  git: GitIntelligence;
  terminal: TerminalIntelligence[];
  astStrategy: AstEditStrategy[];
  executionOptimizer: {
    skippedTools: string[];
    estimatedLatencyMs: number;
    minimizedLlMCalls: number;
    reusedContext: boolean;
  };
  confidence: number;
}

export interface GitIntelligence {
  branch: string;
  status: string[];
  diffSummary: string;
  suggestedCommitMessage: string;
  impact: string[];
}

export interface TerminalIntelligence {
  command: string;
  type: "build" | "test" | "lint" | "package" | "preview" | "git" | "database" | "unknown";
  risk: ToolRisk;
  expectedOutput: string;
  timeoutMs: number;
  retry: string;
  streaming: boolean;
}

export interface AstEditStrategy {
  file: string;
  language: string;
  mode: "ast" | "structured-json" | "markdown-structure" | "text-fallback";
  preserveFormatting: boolean;
  validation: string[];
}

export interface ToolMemory {
  successfulSequences: string[][];
  fastestPaths: Array<{ framework: string; tools: string[]; durationMs: number }>;
  frameworkOptimizations: Record<string, string[]>;
  previousFailures: Array<{ tool: string; reason: string; at: string }>;
  updatedAt: string;
}

export const TOOL_REGISTRY: ToolDefinition[] = [
  tool("workspace", "Discover workspace metadata and project shape", ["root"], ["projectType", "packageManager"], ["read"], "low", ["*"], 120, ["discover", "context"]),
  tool("file_search", "Find files and text patterns quickly", ["query"], ["matches"], ["read"], "low", ["*"], 180, ["search", "context"]),
  tool("symbol", "Build symbol graph for code navigation", ["files"], ["symbols"], ["read"], "low", ["TypeScript", "JavaScript", "React", "Python", "PHP"], 260, ["symbols", "context"]),
  tool("ast", "Plan syntax-aware edits while preserving formatting", ["file", "operation"], ["editPlan"], ["read", "write"], "medium", ["TypeScript", "JavaScript", "React", "PHP", "Python", "JSON", "Markdown"], 320, ["patch", "ast"]),
  tool("patch", "Preview, validate, apply, and rollback patches", ["files"], ["patches"], ["write"], "medium", ["*"], 240, ["patch", "apply"]),
  tool("terminal", "Classify and execute safe commands with recovery", ["command"], ["exitCode", "stdout", "stderr"], ["execute"], "high", ["*"], 1500, ["execute", "verify"]),
  tool("git", "Inspect status, diff, blame, branch, and history", ["root"], ["status", "diff"], ["read"], "low", ["*"], 220, ["git", "impact"]),
  tool("preview", "Start and verify local preview server", ["root"], ["url", "verified"], ["execute", "browser"], "medium", ["Next.js", "React", "Vue", "Angular", "Static HTML"], 6000, ["preview", "verify"]),
  tool("build", "Run project build validation", ["root"], ["success", "warnings"], ["execute"], "medium", ["*"], 12000, ["build", "verify"]),
  tool("test", "Run project tests", ["root"], ["success", "failures"], ["execute"], "medium", ["*"], 15000, ["test", "verify"]),
  tool("lint", "Run lint/static quality checks", ["root"], ["success", "warnings"], ["execute"], "medium", ["*"], 9000, ["lint", "quality"]),
  tool("package", "Inspect package scripts and dependency health", ["root"], ["scripts", "dependencies"], ["read", "execute"], "medium", ["Node", "React", "Next.js", "Vue", "Angular"], 900, ["dependency", "package"]),
  tool("environment", "Validate runtime, env presence, permissions", ["root"], ["node", "os", "permissions"], ["read"], "low", ["*"], 160, ["env", "health"]),
  tool("database", "Inspect schema and migration risk", ["root"], ["schema", "risk"], ["read", "database"], "high", ["Laravel", "Django", "FastAPI", "Next.js", "Node"], 1100, ["database", "schema"]),
  tool("browser", "Verify UI behavior in browser-capable preview", ["url"], ["screenshot", "status"], ["browser", "network"], "medium", ["Next.js", "React", "Vue", "Angular", "Static HTML"], 5000, ["browser", "preview"]),
  tool("documentation", "Read and update docs or generated reports", ["root"], ["docs"], ["read", "write"], "low", ["*"], 250, ["docs", "report"]),
];

const SECRET_RE = /(^|[\\/])\.env(\.|$)|secret|credential|private[-_]?key/i;

export function buildToolIntelligencePlan(input: {
  root: string;
  goal: string;
  framework: string;
  packageManager: string;
  files: Array<{ path: string; content?: string }>;
  commands?: string[];
  storageDir?: string;
}): ToolIntelligencePlan {
  const memory = readToolMemory(input.storageDir);
  const symbolGraph = buildSymbolGraph(input.files);
  const projectHealth = analyzeProjectHealth(input.root, input.files, symbolGraph);
  const git = buildGitIntelligence(input.root, input.goal);
  const terminal = (input.commands || inferCommands(input.root, input.goal, input.packageManager)).map(classifyCommand);
  const astStrategy = input.files.slice(0, 12).map((file) => astEditStrategy(file.path));
  const selectedTools = selectTools({
    goal: input.goal,
    framework: input.framework,
    files: input.files.map((file) => file.path),
    commands: terminal.map((cmd) => cmd.command),
    health: projectHealth,
    memory,
  });
  const parallelGroups = buildParallelGroups(selectedTools);
  const estimatedLatencyMs = parallelGroups.reduce((sum, group) => {
    const latency = Math.max(...group.map((name) => TOOL_REGISTRY.find((toolDef) => toolDef.name === name)?.estimatedLatencyMs || 0));
    return sum + latency;
  }, 0);
  const confidence = Math.round(selectedTools.reduce((sum, item) => sum + item.confidence, 0) / Math.max(1, selectedTools.length));
  return {
    goal: input.goal,
    selectedTools,
    parallelGroups,
    symbolGraph,
    diagnostics: collectDiagnostics(projectHealth),
    projectHealth,
    git,
    terminal,
    astStrategy,
    executionOptimizer: {
      skippedTools: TOOL_REGISTRY.map((item) => item.name).filter((name) => !selectedTools.some((selected) => selected.tool.name === name)),
      estimatedLatencyMs,
      minimizedLlMCalls: selectedTools.some((item) => item.tool.name === "symbol") ? 1 : 0,
      reusedContext: memory.successfulSequences.length > 0,
    },
    confidence,
  };
}

export function validateToolOutput(toolName: string, output: unknown): string[] {
  const errors: string[] = [];
  const def = TOOL_REGISTRY.find((item) => item.name === toolName);
  if (!def) return [`Unknown tool: ${toolName}`];
  if (!output || typeof output !== "object") errors.push(`${toolName} returned malformed output`);
  for (const required of def.outputSchema.required || []) {
    if (!(required in (output as Record<string, unknown>))) errors.push(`${toolName} missing output field: ${required}`);
  }
  return errors;
}

export function validatePatchPlan(files: Array<{ path: string; content?: string; operation?: string }>, root: string): string[] {
  const issues: string[] = [];
  for (const file of files) {
    const full = path.resolve(root, file.path || "");
    if (!file.path || file.path.includes("..") || (full !== path.resolve(root) && !full.startsWith(`${path.resolve(root)}${path.sep}`))) issues.push(`Invalid patch path: ${file.path}`);
    if (SECRET_RE.test(file.path)) issues.push(`Secret file blocked: ${file.path}`);
    if (file.operation !== "delete" && typeof file.content !== "string") issues.push(`Missing patch content: ${file.path}`);
  }
  return issues;
}

export function learnToolSequence(storageDir: string | undefined, framework: string, tools: string[], durationMs: number, failure?: string): ToolMemory {
  const memory = readToolMemory(storageDir);
  const next: ToolMemory = {
    successfulSequences: failure ? memory.successfulSequences : [tools, ...memory.successfulSequences].slice(0, 40),
    fastestPaths: failure ? memory.fastestPaths : [{ framework, tools, durationMs }, ...memory.fastestPaths].sort((a, b) => a.durationMs - b.durationMs).slice(0, 40),
    frameworkOptimizations: {
      ...memory.frameworkOptimizations,
      [framework]: [...new Set([...(memory.frameworkOptimizations[framework] || []), ...tools])].slice(0, 20),
    },
    previousFailures: failure ? [{ tool: tools.at(-1) || "unknown", reason: failure, at: new Date().toISOString() }, ...memory.previousFailures].slice(0, 80) : memory.previousFailures,
    updatedAt: new Date().toISOString(),
  };
  writeToolMemory(storageDir, next);
  return next;
}

function selectTools(input: { goal: string; framework: string; files: string[]; commands: string[]; health: ProjectHealth; memory: ToolMemory }): ToolSelection[] {
  const lower = input.goal.toLowerCase();
  const context = new Set<string>([
    "discover",
    "context",
    input.files.length ? "symbols" : "",
    /edit|change|fix|build|add|create|refactor|update/.test(lower) ? "patch" : "",
    /run|build|test|lint|preview|server/.test(lower) || input.commands.length ? "verify" : "",
    /ui|page|browser|preview|responsive|accessibility/.test(lower) ? "preview" : "",
    /test|spec/.test(lower) ? "test" : "",
    /lint|quality|style/.test(lower) ? "lint" : "",
    /package|dependency|install/.test(lower) ? "package" : "",
    /database|prisma|migration|sql|schema/.test(lower) ? "database" : "",
    /docs|readme|documentation|report/.test(lower) ? "docs" : "",
    input.health.brokenImports.length ? "dependency" : "",
    input.health.circularDependencies.length ? "impact" : "",
  ].filter(Boolean));
  const remembered = input.memory.frameworkOptimizations[input.framework] || [];
  const scored = TOOL_REGISTRY.map((toolDef) => {
    const tagScore = toolDef.tags.filter((tag) => context.has(tag)).length * 18;
    const frameworkScore = toolDef.supportedFrameworks.includes("*") || toolDef.supportedFrameworks.includes(input.framework) ? 10 : 0;
    const memoryScore = remembered.includes(toolDef.name) ? 8 : 0;
    const riskPenalty = toolDef.riskLevel === "critical" ? 20 : toolDef.riskLevel === "high" ? 9 : 0;
    const score = toolDef.confidence + tagScore + frameworkScore + memoryScore - riskPenalty;
    return { toolDef, score };
  }).filter((item) => item.score >= 74);
  const always = ["workspace", "file_search", "symbol", "git", "environment"];
  const selected = [...new Set([...always, ...scored.sort((a, b) => b.score - a.score).map((item) => item.toolDef.name)])]
    .map((name, order) => {
      const toolDef = TOOL_REGISTRY.find((item) => item.name === name)!;
      return {
        tool: toolDef,
        reason: reasonFor(toolDef, context),
        confidence: Math.min(99, Math.max(60, toolDef.confidence + (remembered.includes(name) ? 5 : 0))),
        order,
        canRunInParallel: !toolDef.permissions.includes("write") && !toolDef.permissions.includes("execute"),
        validation: validationFor(toolDef),
        retryStrategy: retryFor(toolDef),
      };
    });
  return selected;
}

function buildSymbolGraph(files: Array<{ path: string; content?: string }>): SymbolNode[] {
  const nodes: SymbolNode[] = [];
  for (const file of files) {
    if (!file.content || SECRET_RE.test(file.path)) continue;
    const lines = file.content.split(/\r?\n/);
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const patterns: Array<[RegExp, SymbolNode["kind"]]> = [
        [/^(?:export\s+)?class\s+([A-Za-z0-9_]+)/, "class"],
        [/^(?:export\s+)?interface\s+([A-Za-z0-9_]+)/, "interface"],
        [/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/, "function"],
        [/^export\s+(?:const|let|var)\s+([A-Za-z0-9_]+)/, "export"],
        [/^import\s+.*?from\s+["']([^"']+)["']/, "import"],
        [/^export\s+default\s+function\s+([A-Za-z0-9_]*)/, "component"],
        [/^(?:export\s+)?const\s+(use[A-Z][A-Za-z0-9_]*)\s*=/, "hook"],
      ];
      for (const [pattern, kind] of patterns) {
        const match = trimmed.match(pattern);
        if (match) {
          nodes.push({ name: match[1] || "default", kind, file: file.path, line: index + 1, references: [] });
          break;
        }
      }
      if (/^(GET|POST|PUT|PATCH|DELETE)\s*\(/.test(trimmed) || /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/.test(trimmed)) {
        nodes.push({ name: trimmed.match(/(GET|POST|PUT|PATCH|DELETE)/)?.[1] || "api", kind: "api", file: file.path, line: index + 1, references: [] });
      }
    });
    if (/^(app|pages)\/.+(page|route)\.(tsx?|jsx?)$/.test(file.path)) {
      nodes.push({ name: file.path.replace(/\.(tsx?|jsx?)$/, ""), kind: "route", file: file.path, line: 1, references: [] });
    }
  }
  for (const node of nodes) {
    if (node.kind === "import") continue;
    node.references = nodes.filter((candidate) => candidate.kind === "import" && candidate.name.includes(path.basename(node.file).replace(/\.[^.]+$/, ""))).map((candidate) => candidate.file);
  }
  return nodes.slice(0, 500);
}

function analyzeProjectHealth(root: string, files: Array<{ path: string; content?: string }>, symbols: SymbolNode[]): ProjectHealth {
  const allPaths = new Set(files.map((file) => file.path));
  const imports = symbols.filter((symbol) => symbol.kind === "import");
  const brokenImports = imports
    .filter((imp) => imp.name.startsWith("."))
    .filter((imp) => !resolveImport(root, imp.file, imp.name))
    .map((imp) => `${imp.file}:${imp.line} -> ${imp.name}`)
    .slice(0, 40);
  const exportedFiles = new Set(symbols.filter((symbol) => symbol.kind !== "import").map((symbol) => symbol.file));
  const deadFiles = files
    .map((file) => file.path)
    .filter((file) => /\.(ts|tsx|js|jsx)$/.test(file) && !exportedFiles.has(file) && !/(page|route|layout|test|spec|config)\./.test(file))
    .slice(0, 40);
  const missingExports = files.filter((file) => /\.(ts|tsx|js|jsx)$/.test(file.path) && file.content && !/export\s+/.test(file.content) && /components|lib|src/.test(file.path)).map((file) => file.path).slice(0, 30);
  const dependencyIssues = fs.existsSync(path.join(root, "package.json")) && !fs.existsSync(path.join(root, "node_modules")) ? ["node_modules not installed"] : [];
  const circularDependencies = imports
    .filter((imp) => imp.name.startsWith("."))
    .map((imp) => [imp.file, resolveImport(root, imp.file, imp.name)] as const)
    .filter(([, resolved]) => resolved && allPaths.has(resolved))
    .filter(([from, to]) => imports.some((imp) => imp.file === to && resolveImport(root, imp.file, imp.name) === from))
    .map(([from, to]) => `${from} <-> ${to}`)
    .slice(0, 20);
  return { brokenImports, deadFiles, missingExports, dependencyIssues, circularDependencies, buildWarnings: [] };
}

function buildGitIntelligence(root: string, goal: string): GitIntelligence {
  const run = (args: string[]) => cp.spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 8000 });
  const branch = run(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim() || "unknown";
  const status = run(["status", "--short"]).stdout.trim().split(/\r?\n/).filter(Boolean).slice(0, 80);
  const diff = run(["diff", "--stat"]).stdout.trim();
  const impact = status.map((line) => line.replace(/^..?\s+/, "")).filter(Boolean).slice(0, 20);
  return {
    branch,
    status,
    diffSummary: diff || "No diff",
    suggestedCommitMessage: suggestCommitMessage(goal, status),
    impact,
  };
}

function classifyCommand(command: string): TerminalIntelligence {
  const lower = command.toLowerCase();
  const type: TerminalIntelligence["type"] = lower.includes("build") ? "build"
    : lower.includes("test") || lower.includes("vitest") || lower.includes("jest") ? "test"
      : lower.includes("lint") || lower.includes("eslint") ? "lint"
        : lower.includes("install") || lower.includes("add ") ? "package"
          : lower.includes("dev") || lower.includes("start") || lower.includes("preview") ? "preview"
            : lower.startsWith("git ") ? "git"
              : /prisma|migrate|sql|db/.test(lower) ? "database" : "unknown";
  const risk: ToolRisk = /sudo|rm\s+-rf|reset\s+--hard|drop|truncate|migrate/.test(lower) ? "high" : type === "package" || type === "database" ? "medium" : "low";
  return {
    command,
    type,
    risk,
    expectedOutput: type === "build" ? "Compiled successfully or actionable build errors" : type === "test" ? "Passing tests or focused failures" : "Structured stdout/stderr",
    timeoutMs: type === "test" || type === "build" ? 180000 : type === "preview" ? 30000 : 60000,
    retry: risk === "high" ? "Require confirmation before retry" : "Parse error, apply minimal fix, retry once",
    streaming: type === "preview" || type === "test",
  };
}

function astEditStrategy(file: string): AstEditStrategy {
  const ext = path.extname(file).toLowerCase();
  const language = ext.slice(1) || "text";
  const mode: AstEditStrategy["mode"] = [".ts", ".tsx", ".js", ".jsx", ".php", ".py"].includes(ext)
    ? "ast"
    : ext === ".json" ? "structured-json"
      : ext === ".md" ? "markdown-structure" : "text-fallback";
  return {
    file,
    language,
    mode,
    preserveFormatting: true,
    validation: mode === "ast" ? ["parse syntax", "preserve imports/exports", "run diagnostics"] : mode === "structured-json" ? ["JSON.parse"] : ["diff review"],
  };
}

function collectDiagnostics(health: ProjectHealth) {
  return [
    ...health.brokenImports.map((item) => `Broken import: ${item}`),
    ...health.dependencyIssues.map((item) => `Dependency issue: ${item}`),
    ...health.circularDependencies.map((item) => `Circular dependency: ${item}`),
  ].slice(0, 80);
}

function inferCommands(root: string, goal: string, pm: string) {
  const pkg = readJson(path.join(root, "package.json"));
  const scripts = (pkg?.scripts || {}) as Record<string, string>;
  const commands: string[] = [];
  if (scripts.build && /build|verify|run|preview|ui|api|fix|refactor|test/.test(goal.toLowerCase())) commands.push(`${pm} run build`);
  if (scripts.lint && /lint|quality|verify|fix|refactor/.test(goal.toLowerCase())) commands.push(`${pm} run lint`);
  if (scripts.test && /test|verify|fix|bug/.test(goal.toLowerCase())) commands.push(pm === "npm" ? "npm test" : `${pm} test`);
  return commands;
}

function readToolMemory(storageDir?: string): ToolMemory {
  const file = toolMemoryPath(storageDir);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<ToolMemory>;
    return {
      successfulSequences: Array.isArray(parsed.successfulSequences) ? parsed.successfulSequences.filter(Array.isArray).slice(0, 80) as string[][] : [],
      fastestPaths: Array.isArray(parsed.fastestPaths) ? parsed.fastestPaths as ToolMemory["fastestPaths"] : [],
      frameworkOptimizations: parsed.frameworkOptimizations || {},
      previousFailures: Array.isArray(parsed.previousFailures) ? parsed.previousFailures as ToolMemory["previousFailures"] : [],
      updatedAt: parsed.updatedAt || new Date(0).toISOString(),
    };
  } catch {
    return { successfulSequences: [], fastestPaths: [], frameworkOptimizations: {}, previousFailures: [], updatedAt: new Date(0).toISOString() };
  }
}

function writeToolMemory(storageDir: string | undefined, memory: ToolMemory) {
  const file = toolMemoryPath(storageDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(memory, null, 2));
}

function toolMemoryPath(storageDir?: string) {
  return path.join(storageDir || path.join(process.cwd(), ".meldex"), "tool-memory.json");
}

function tool(name: string, capability: string, requiredInput: string[], requiredOutput: string[], permissions: ToolPermission[], riskLevel: ToolRisk, supportedFrameworks: string[], estimatedLatencyMs: number, tags: string[]): ToolDefinition {
  return {
    name,
    capability,
    inputSchema: { type: "object", required: requiredInput, properties: Object.fromEntries(requiredInput.map((key) => [key, "required"])) },
    outputSchema: { type: "object", required: requiredOutput, properties: Object.fromEntries(requiredOutput.map((key) => [key, "required"])) },
    permissions,
    riskLevel,
    supportedFrameworks,
    estimatedLatencyMs,
    confidence: riskLevel === "low" ? 88 : riskLevel === "medium" ? 82 : 74,
    tags,
  };
}

function buildParallelGroups(tools: ToolSelection[]): string[][] {
  const reads = tools.filter((item) => item.canRunInParallel).map((item) => item.tool.name);
  const writes = tools.filter((item) => !item.canRunInParallel).map((item) => item.tool.name);
  return [reads, ...writes.map((name) => [name])].filter((group) => group.length);
}

function reasonFor(toolDef: ToolDefinition, context: Set<string>) {
  const matched = toolDef.tags.filter((tag) => context.has(tag));
  return matched.length ? `Matched ${matched.join(", ")} requirement` : "Baseline engineering context";
}

function validationFor(toolDef: ToolDefinition) {
  const checks = ["schema validation"];
  if (toolDef.permissions.includes("write")) checks.push("safe path validation", "diff preview");
  if (toolDef.permissions.includes("execute")) checks.push("command risk validation", "timeout validation");
  if (toolDef.name === "ast") checks.push("syntax parse validation");
  return checks;
}

function retryFor(toolDef: ToolDefinition) {
  if (toolDef.riskLevel === "high" || toolDef.riskLevel === "critical") return "Stop and require confirmation on failure";
  if (toolDef.permissions.includes("execute")) return "Parse logs, generate minimal fix, retry once";
  return "Refresh input and retry with cached context";
}

function resolveImport(root: string, fromFile: string, spec: string): string | undefined {
  const base = path.resolve(root, path.dirname(fromFile), spec);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, path.join(base, "index.ts"), path.join(base, "index.tsx"), path.join(base, "index.js")];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return found ? path.relative(root, found) : undefined;
}

function readJson(file: string): Record<string, unknown> | null {
  try { return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>; } catch { return null; }
}

function suggestCommitMessage(goal: string, status: string[]) {
  const scope = status.map((line) => line.replace(/^..?\s+/, "").split(/[\\/]/)[0]).filter(Boolean)[0] || "agent";
  const verb = /fix|bug|error/i.test(goal) ? "fix" : /test/i.test(goal) ? "test" : /docs|report/i.test(goal) ? "docs" : "feat";
  return `${verb}: update ${scope} workflow`;
}
