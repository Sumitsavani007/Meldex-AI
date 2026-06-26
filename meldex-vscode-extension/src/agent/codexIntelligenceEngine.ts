import { WorkspaceMemory } from "./workspaceMemory";

export type CodexTaskType =
  | "simple_edit"
  | "website_generation"
  | "bug_fix"
  | "refactor"
  | "backend_api"
  | "database"
  | "ui_polish"
  | "debugging"
  | "tests"
  | "deployment"
  | "documentation";

export type CodexComplexity = "simple" | "moderate" | "complex";
export type CodexRisk = "low" | "medium" | "high" | "critical";
export type ConfidenceDecision = "auto_proceed" | "proceed_with_assumption" | "ask_user" | "block";

export type TaskClassification = {
  type: CodexTaskType;
  complexity: CodexComplexity;
  risk: CodexRisk;
  confidence: number;
  reason: string;
  fastPath: boolean;
  validationHint: string;
};

export type RoleName =
  | "Planner"
  | "Architect"
  | "Designer"
  | "Coder"
  | "Reviewer"
  | "Tester"
  | "Debugger"
  | "Security Reviewer"
  | "Performance Reviewer"
  | "Finalizer";

export type RoleStage = {
  role: RoleName;
  selected: boolean;
  summary: string;
  confidence: number;
  nextAction: string;
};

export type PlannerOutput = {
  objective: string;
  assumptions: string[];
  missingInfo: string[];
  affectedFiles: string[];
  taskComplexity: CodexComplexity;
  riskLevel: CodexRisk;
  validationPlan: string[];
};

export type CodexIntelligencePlan = {
  classification: TaskClassification;
  confidence: {
    score: number;
    decision: ConfidenceDecision;
    reason: string;
  };
  planner: PlannerOutput;
  roles: RoleStage[];
  safeSummary: string[];
  promptSection: string;
};

export function classifyCodexTask(input: {
  task: string;
  framework: string;
  files: string[];
  hasPackageJson: boolean;
}): TaskClassification {
  const lower = input.task.toLowerCase();
  const patterns: Array<[CodexTaskType, RegExp, string]> = [
    ["deployment", /\b(deploy|aws|pm2|nginx|production|github push|server)\b/, "Deployment or production operation"],
    ["database", /\b(database|db|prisma|migration|schema|sql|model)\b/, "Database/schema work"],
    ["backend_api", /\b(api|endpoint|route|controller|service|middleware|auth|webhook|crud)\b/, "Backend API work"],
    ["bug_fix", /\b(fix|bug|broken|issue|error|failing|not working)\b/, "Bug fix request"],
    ["debugging", /\b(debug|trace|diagnose|root cause|stack)\b/, "Debugging request"],
    ["tests", /\b(test|spec|coverage|unit|e2e)\b/, "Testing request"],
    ["refactor", /\b(refactor|cleanup|dedupe|duplicate|restructure|optimize code)\b/, "Refactor request"],
    ["website_generation", /\b(website|landing page|restaurant|portfolio|saas|cafe|hotel|e-?commerce|static site)\b/, "Website generation request"],
    ["ui_polish", /\b(ui|polish|responsive|css|style|layout|button|visual|design)\b/, "UI/design request"],
    ["documentation", /\b(readme|docs|documentation|report|comment)\b/, "Documentation request"],
  ];
  const [type, , reason] = patterns.find(([, pattern]) => pattern.test(lower)) || ["simple_edit", /./, "Simple focused edit"];
  const fileCountSignal = input.files.length;
  const complexity: CodexComplexity =
    type === "deployment" || type === "database" || /\b(full|complete|entire|system|all pages|platform)\b/.test(lower) || fileCountSignal > 20 ? "complex" :
      type === "simple_edit" || type === "documentation" ? "simple" :
        "moderate";
  const risk: CodexRisk =
    /\b(delete data|reset|force push|production database|drop table|secret|credential)\b/.test(lower) ? "critical" :
      type === "deployment" || type === "database" ? "high" :
        type === "backend_api" || type === "debugging" || complexity === "moderate" ? "medium" :
          "low";
  const fastPath = ["simple_edit", "documentation", "website_generation"].includes(type) && risk === "low";
  const confidence = estimateClassificationConfidence({ type, complexity, risk, lower, hasPackageJson: input.hasPackageJson });
  return {
    type,
    complexity,
    risk,
    confidence,
    reason,
    fastPath,
    validationHint: validationHint(type, input.framework, input.hasPackageJson),
  };
}

export function buildCodexIntelligencePlan(input: {
  task: string;
  framework: string;
  files: string[];
  packageJson?: string;
  memory: WorkspaceMemory;
}): CodexIntelligencePlan {
  const classification = classifyCodexTask({
    task: input.task,
    framework: input.framework,
    files: input.files,
    hasPackageJson: Boolean(input.packageJson),
  });
  const planner = buildPlannerOutput(input.task, classification, input.files, input.packageJson);
  const roles = buildRolePipeline(input.task, classification, input.framework, input.memory);
  const confidence = evaluateConfidence(classification, roles, planner);
  const safeSummary = [
    `Classified task as ${classification.type} (${classification.complexity}, ${classification.risk} risk).`,
    `Confidence ${confidence.score}%: ${confidence.reason}.`,
    `Selected roles: ${roles.filter((role) => role.selected).map((role) => role.role).join(", ")}.`,
    `Validation: ${planner.validationPlan.join(", ")}.`,
  ];
  return {
    classification,
    confidence,
    planner,
    roles,
    safeSummary,
    promptSection: buildPromptSection(classification, planner, roles, confidence),
  };
}

export function evaluateConfidence(classification: TaskClassification, roles: RoleStage[], planner: PlannerOutput) {
  const roleAverage = Math.round(roles.filter((role) => role.selected).reduce((sum, role) => sum + role.confidence, 0) / Math.max(1, roles.filter((role) => role.selected).length));
  let score = Math.round((classification.confidence + roleAverage) / 2);
  if (planner.missingInfo.length) score -= classification.risk === "low" ? 4 : 12;
  if (classification.risk === "critical") return { score: Math.min(score, 55), decision: "block" as const, reason: "Critical risk requires explicit user approval." };
  if (classification.risk === "high" && score < 90) return { score, decision: "ask_user" as const, reason: "High-risk task needs confirmation before changing files." };
  if (score >= 90) return { score, decision: "auto_proceed" as const, reason: "High confidence and acceptable risk." };
  if (score >= 70) return { score, decision: "proceed_with_assumption" as const, reason: "Proceeding with noted assumptions." };
  if (classification.risk === "low" && classification.fastPath) return { score, decision: "proceed_with_assumption" as const, reason: "Low-risk deterministic fast path." };
  return { score, decision: "ask_user" as const, reason: "Confidence below threshold." };
}

function buildPlannerOutput(task: string, classification: TaskClassification, files: string[], packageJson?: string): PlannerOutput {
  return {
    objective: task.trim().slice(0, 220),
    assumptions: [
      "Preserve existing project style",
      "Use minimal patches",
      "Do not store or expose secrets",
      classification.fastPath ? "Use fast path when deterministic" : "Use full intelligence pipeline",
    ],
    missingInfo: classification.confidence < 70 ? ["Task intent is ambiguous"] : [],
    affectedFiles: inferAffectedFiles(task, classification, files),
    taskComplexity: classification.complexity,
    riskLevel: classification.risk,
    validationPlan: validationPlan(classification, Boolean(packageJson)),
  };
}

function buildRolePipeline(task: string, classification: TaskClassification, framework: string, memory: WorkspaceMemory): RoleStage[] {
  const uiTask = ["website_generation", "ui_polish"].includes(classification.type);
  const bugTask = ["bug_fix", "debugging"].includes(classification.type);
  const selected = new Set<RoleName>([
    "Planner",
    "Architect",
    uiTask ? "Designer" : "Coder",
    "Coder",
    "Reviewer",
    "Tester",
    bugTask ? "Debugger" : "Reviewer",
    "Security Reviewer",
    "Performance Reviewer",
    "Finalizer",
  ]);
  const base = classification.confidence;
  const hasMemory = memory.taskMemory.length > 0 || memory.recentEdits.length > 0 || memory.styleProfile.length > 0;
  const role = (name: RoleName, summary: string, nextAction: string, delta = 0): RoleStage => ({
    role: name,
    selected: selected.has(name),
    summary,
    confidence: Math.max(60, Math.min(98, base + delta + (hasMemory ? 2 : 0))),
    nextAction,
  });
  return [
    role("Planner", "Define objective, assumptions, risk, files, and validation.", "Build execution plan", 3),
    role("Architect", `Preserve ${framework || "project"} conventions and boundaries.`, "Choose file structure and data flow", 0),
    role("Designer", uiTask ? "Plan premium hierarchy, layout, spacing, typography, responsive behavior, and motion." : "No UI design needed for this task.", uiTask ? "Produce visual direction" : "Skip visual planning", uiTask ? 1 : -8),
    role("Coder", "Create minimal clean patch without fake imports, broad rewrites, dead code, or unnecessary dependencies.", "Generate patch", 0),
    role("Reviewer", "Check syntax, imports, architecture, maintainability, paths, duplication, and completeness.", "Review patch", -2),
    role("Tester", `Select validation: ${classification.validationHint}.`, "Run or plan checks", -1),
    role("Debugger", bugTask ? "Parse error, isolate root cause, patch minimally, retry with repeated-error guard." : "Debugger standby unless validation fails.", bugTask ? "Fix root cause" : "Skip until failure", bugTask ? 1 : -6),
    role("Security Reviewer", "Check secret leaks, unsafe commands, XSS, SSRF, command injection, path traversal, auth, and iframe safety.", "Block critical risk", -3),
    role("Performance Reviewer", "Check bundle/rerender/loop/asset/script risks and only change when safe.", "Flag safe optimizations", -4),
    role("Finalizer", "Summarize files changed, checks, result, and next useful step.", "Deliver final summary", 4),
  ];
}

function estimateClassificationConfidence(input: { type: CodexTaskType; complexity: CodexComplexity; risk: CodexRisk; lower: string; hasPackageJson: boolean }) {
  let score = 92;
  if (input.type === "simple_edit") score -= 3;
  if (input.complexity === "complex") score -= 10;
  if (input.risk === "high") score -= 8;
  if (input.risk === "critical") score -= 30;
  if (/\b(better|nice|stuff|thing|same)\b/.test(input.lower)) score -= 12;
  if (!input.hasPackageJson && /react|next|vite|build|test/.test(input.lower)) score -= 8;
  if (/landing page|website|readme|docs|fix syntax/.test(input.lower)) score += 4;
  return Math.max(55, Math.min(98, score));
}

function validationHint(type: CodexTaskType, framework: string, hasPackageJson: boolean) {
  if (type === "website_generation" && !hasPackageJson) return "HTML/CSS/JS link check and preview HTTP 200";
  if (/Next|Vite|React/i.test(framework) || hasPackageJson) return "build, lint if available, and managed dev preview when requested";
  if (type === "backend_api") return "route smoke checks and validation checks";
  if (type === "tests") return "test command";
  return "self-review and lightweight validation";
}

function validationPlan(classification: TaskClassification, hasPackageJson: boolean) {
  if (classification.type === "website_generation" && !hasPackageJson) return ["HTML/CSS/JS link check", "Preview HTTP 200"];
  if (classification.type === "backend_api") return ["Route smoke check", "Validation/error response check"];
  if (classification.type === "tests") return ["Run tests", "Fix failures if needed"];
  if (hasPackageJson) return ["Run detected build", "Run lint/test if available"];
  return ["Self-review", "No broken paths"];
}

function inferAffectedFiles(task: string, classification: TaskClassification, files: string[]) {
  if (classification.type === "website_generation") return ["index.html", "style.css", "script.js", "README.md"];
  if (classification.type === "documentation") return files.filter((file) => /readme|docs|\.md$/i.test(file)).slice(0, 8);
  if (classification.type === "database") return files.filter((file) => /prisma|schema|migration|model/i.test(file)).slice(0, 10);
  if (classification.type === "backend_api") return files.filter((file) => /api|route|controller|service|middleware|validator/i.test(file)).slice(0, 10);
  const terms = task.toLowerCase().split(/[^a-z0-9_.-]+/).filter((word) => word.length > 3);
  return files.filter((file) => terms.some((term) => file.toLowerCase().includes(term))).slice(0, 10);
}

function buildPromptSection(classification: TaskClassification, planner: PlannerOutput, roles: RoleStage[], confidence: { score: number; decision: ConfidenceDecision; reason: string }) {
  const selected = roles.filter((role) => role.selected);
  return `CODEX INTELLIGENCE ENGINE
Task type: ${classification.type}
Complexity: ${classification.complexity}
Risk: ${classification.risk}
Confidence: ${confidence.score}% (${confidence.decision}: ${confidence.reason})
Planner:
- Objective: ${planner.objective}
- Assumptions: ${planner.assumptions.join("; ")}
- Missing info: ${planner.missingInfo.join("; ") || "none"}
- Affected files: ${planner.affectedFiles.join(", ") || "to be inferred from context"}
- Validation plan: ${planner.validationPlan.join("; ")}
Role pipeline:
${selected.map((role) => `- ${role.role}: ${role.summary} confidence=${role.confidence}% next=${role.nextAction}`).join("\n")}
Rules:
- Use Qwen3-Coder as the coding model.
- Do not expose hidden chain-of-thought.
- Return structured Meldex JSON only.
- If validation fails, Debugger should create the smallest fix and retry up to five times.
- Security Reviewer blocks critical leaks, unsafe commands, path traversal, SSRF, command injection, insecure auth, and unsafe iframe changes.
- Finalizer must report files changed and checks.`;
}
