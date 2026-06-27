import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { WorkspaceFileAction } from "@/lib/ai-workspace";

type WorkspaceContextInput = {
  projectFiles?: string[];
  relevantFiles?: Array<{ path: string; content: string }>;
  memoryContext?: {
    snippet?: string;
    relatedTaskCount?: number;
    reusedStyle?: boolean;
    avoidedIssue?: boolean;
  };
};

type RoleSummary = {
  role: string;
  summary: string;
  confidence: number;
  decisions: string[];
  risks: string[];
  nextAction: string;
};

type OrchestrationInput = {
  workspaceId: string;
  taskId: string;
  userId: string;
  prompt: string;
  workspaceContext: WorkspaceContextInput;
  currentFiles: string[];
  provider?: string;
  model?: string;
};

type OrchestrationResult = {
  intent: {
    primary: string;
    secondary: string[];
    flags: string[];
  };
  classification: {
    type: string;
    subtype: string;
    labels: string[];
  };
  plan: {
    objective: string;
    requiredFiles: string[];
    expectedSections: string[];
    validationPlan: string[];
    riskLevel: "low" | "medium" | "high";
    expectedOutputQuality: number;
  };
  roles: RoleSummary[];
  toolPlan: {
    tools: string[];
    rules: string[];
    validationCommands: string[];
    serverMode: string;
  };
  confidence: {
    score: number;
    decision: "auto_proceed" | "proceed_with_assumption" | "ask_user" | "block";
    reason: string;
  };
  securityReview: ReviewResult;
  performanceReview: ReviewResult;
  finalInstruction: string;
  validationPlan: string[];
  events: Array<{ type: string; message: string; payload: Record<string, unknown> }>;
};

type ReviewResult = {
  status: "pass" | "warn" | "block";
  findings: string[];
  summary: string;
};

function includesAny(value: string, words: string[]) {
  const lower = value.toLowerCase();
  return words.some((word) => lower.includes(word));
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function role(role: string, summary: string, confidence: number, decisions: string[], risks: string[], nextAction: string): RoleSummary {
  return { role, summary, confidence, decisions, risks, nextAction };
}

function detectIntent(prompt: string) {
  const lower = prompt.toLowerCase();
  const flags = unique([
    includesAny(lower, ["website", "site", "landing", "page", "pricing", "portfolio"]) ? "website" : "",
    includesAny(lower, ["pricing", "price", "plan", "subscription"]) ? "pricing" : "",
    includesAny(lower, ["landing", "hero"]) ? "landing" : "",
    includesAny(lower, ["dashboard", "admin"]) ? "dashboard" : "",
    includesAny(lower, ["bug", "fix", "error", "broken"]) ? "bug_fix" : "",
    includesAny(lower, ["refactor", "cleanup"]) ? "refactor" : "",
    includesAny(lower, ["api", "backend", "server"]) ? "backend" : "",
    includesAny(lower, ["database", "prisma", "schema"]) ? "database" : "",
    includesAny(lower, ["style", "responsive", "ui", "design", "premium"]) ? "style" : "",
    includesAny(lower, ["animation", "animated", "motion"]) ? "animation" : "",
    includesAny(lower, ["preview", "render"]) ? "preview" : "",
    includesAny(lower, ["run", "start"]) ? "run" : "",
    includesAny(lower, ["deploy", "aws", "production"]) ? "deploy" : "",
  ]);
  const primary = flags.includes("website") || flags.includes("pricing") ? "website_generation" :
    flags.includes("bug_fix") ? "bug_fix" :
    flags.includes("backend") ? "backend" :
    flags.includes("database") ? "database" :
    flags.includes("refactor") ? "refactor" :
    "coding_task";
  return {
    primary,
    secondary: flags.filter((flag) => flag !== "website"),
    flags,
  };
}

function classifyTask(prompt: string, intent: ReturnType<typeof detectIntent>) {
  const labels = unique([
    intent.primary,
    intent.flags.includes("pricing") ? "pricing_section" : "",
    intent.flags.includes("style") ? "responsive_ui" : "",
    intent.flags.includes("animation") ? "animated_ui" : "",
    intent.flags.includes("backend") ? "backend_change" : "",
    intent.flags.includes("database") ? "database_change" : "",
  ]);
  return {
    type: intent.primary,
    subtype: labels.includes("pricing_section") ? "pricing_section" : labels[0] || "coding_task",
    labels,
  };
}

function buildPlan(prompt: string, classification: OrchestrationResult["classification"], currentFiles: string[]) {
  const isPricing = classification.labels.includes("pricing_section");
  const isStaticWebsite = classification.type === "website_generation";
  return {
    objective: prompt,
    requiredFiles: isStaticWebsite ? ["index.html", "style.css", "script.js", "README.md"] : currentFiles.slice(0, 8),
    expectedSections: isPricing
      ? ["pricing hero", "pricing cards", "monthly/yearly toggle", "responsive layout", "call to action"]
      : isStaticWebsite
        ? ["hero", "content sections", "call to action", "footer"]
        : ["targeted implementation", "validation"],
    validationPlan: isStaticWebsite
      ? ["extract files only", "verify index.html", "verify CSS/JS links", "verify preview HTTP 200", "reject raw JSON/placeholders"]
      : ["minimal patch review", "run relevant validation"],
    riskLevel: isStaticWebsite ? "low" as const : includesAny(prompt, ["delete", "migration", "deploy", "production"]) ? "high" as const : "medium" as const,
    expectedOutputQuality: isStaticWebsite ? 92 : 85,
  };
}

function buildRoles(classification: OrchestrationResult["classification"], plan: OrchestrationResult["plan"]) {
  const isWebsite = classification.type === "website_generation";
  const roles = [
    role("Planner", `Plan ${plan.requiredFiles.join(", ")} with validation before completion.`, 94, plan.validationPlan, [], "Prepare Qwen instruction."),
    role("Architect", isWebsite ? "Use a dependency-free static file architecture." : "Respect existing project architecture.", 90, plan.requiredFiles, [], "Constrain file scope."),
  ];
  if (isWebsite) {
    roles.push(role(
      "Designer",
      "Use premium SaaS visual direction with responsive pricing cards and tasteful interaction.",
      92,
      ["dark SaaS palette", "Inter/system typography", "cards", "toggle interaction", "mobile responsive"],
      [],
      "Inject design brief into Qwen instruction."
    ));
  }
  roles.push(
    role("Reviewer", "Review extracted files for render safety and completeness.", 90, ["no JSON dumps", "no placeholders", "linked CSS/JS"], [], "Run file reviewer after extraction."),
    role("Tester", "Verify static preview through backend preview validation.", 91, ["HTTP 200", "valid HTML", "asset checks"], [], "Run preview verifier."),
    role("Security Reviewer", "Block path traversal, secrets, unsafe external URLs, and dangerous commands.", 90, ["safe paths", "secret redaction", "preview safety"], [], "Review generated files."),
    role("Performance Reviewer", "Warn on huge inline code, blocking scripts, and excessive animation.", 86, ["small static assets", "reduced motion where relevant"], [], "Review generated files."),
    role("Finalizer", "Persist task result only after verification and memory save.", 92, ["quality score", "summary", "memory update"], [], "Finalize task.")
  );
  return roles;
}

function buildToolPlan(classification: OrchestrationResult["classification"]) {
  const isStaticWebsite = classification.type === "website_generation";
  return {
    tools: isStaticWebsite ? ["workspace-file-writer", "static-preview-verifier"] : ["workspace-file-reader", "workspace-file-writer", "validator"],
    rules: isStaticWebsite
      ? [
          "Do not install dependencies.",
          "Do not create package.json unless explicitly requested.",
          "Create index.html, style.css, script.js, README.md.",
          "Use static preview verification.",
        ]
      : [
          "Read relevant files before patching.",
          "Use minimal patch scope.",
          "Run correct validation for existing project.",
        ],
    validationCommands: isStaticWebsite ? ["static-preview-verify"] : ["project-specific-validation"],
    serverMode: isStaticWebsite ? "static-preview" : "existing-project",
  };
}

function scoreConfidence(plan: OrchestrationResult["plan"], classification: OrchestrationResult["classification"]) {
  let score = classification.type === "website_generation" ? 94 : 78;
  if (plan.riskLevel === "medium") score -= 12;
  if (plan.riskLevel === "high") score -= 35;
  const decision =
    plan.riskLevel === "high" && score < 70 ? "ask_user" :
    score >= 90 ? "auto_proceed" :
    score >= 60 ? "proceed_with_assumption" :
    "block";
  return {
    score,
    decision: decision as "auto_proceed" | "proceed_with_assumption" | "ask_user" | "block",
    reason: decision === "auto_proceed" ? "Low-risk task with clear static output requirements." : decision === "ask_user" ? "Risky task needs user confirmation." : "Proceed with safe assumptions.",
  };
}

function buildFinalInstruction(input: {
  prompt: string;
  classification: OrchestrationResult["classification"];
  plan: OrchestrationResult["plan"];
  roles: RoleSummary[];
  toolPlan: OrchestrationResult["toolPlan"];
}) {
  const designer = input.roles.find((item) => item.role === "Designer");
  return [
    "[Workspace Codex Orchestration]",
    `Classification: ${input.classification.type} / ${input.classification.subtype} (${input.classification.labels.join(", ")})`,
    `Objective: ${input.plan.objective}`,
    `Required files: ${input.plan.requiredFiles.join(", ")}`,
    `Expected sections: ${input.plan.expectedSections.join(", ")}`,
    designer ? `Designer direction: ${designer.decisions.join("; ")}` : "",
    `Tool rules: ${input.toolPlan.rules.join(" ")}`,
    "Return JSON only with files[].content containing complete file content.",
    "For static website tasks, create only index.html, style.css, script.js, README.md.",
    "index.html must link ./style.css and ./script.js.",
    "Do not include raw planning JSON in any file content.",
    "Do not include unresolved placeholders like ${price}, ${plan.description}, or ${plan.period}.",
    "Do not add dependencies, package.json, server.js, or Express for static pages.",
  ].filter(Boolean).join("\n");
}

export async function runWorkspaceOrchestration(input: OrchestrationInput): Promise<OrchestrationResult> {
  const intent = detectIntent(input.prompt);
  const classification = classifyTask(input.prompt, intent);
  const plan = buildPlan(input.prompt, classification, input.currentFiles);
  const roles = buildRoles(classification, plan);
  const toolPlan = buildToolPlan(classification);
  const confidence = scoreConfidence(plan, classification);
  const securityReview: ReviewResult = { status: "pass", findings: [], summary: "No pre-generation security blocker found." };
  const performanceReview: ReviewResult = { status: "pass", findings: [], summary: "No pre-generation performance blocker found." };
  const finalInstruction = buildFinalInstruction({ prompt: input.prompt, classification, plan, roles, toolPlan });
  return {
    intent,
    classification,
    plan,
    roles,
    toolPlan,
    confidence,
    securityReview,
    performanceReview,
    finalInstruction,
    validationPlan: plan.validationPlan,
    events: [
      { type: "intent_detected", message: "Intent detected", payload: { intent } },
      { type: "task_classified", message: "Classified task", payload: { classification } },
      { type: "planner_done", message: "Planner produced execution plan", payload: { plan } },
      { type: "architect_done", message: "Architect constrained project structure", payload: { role: roles.find((item) => item.role === "Architect") } },
      ...(roles.some((item) => item.role === "Designer") ? [{ type: "designer_done", message: "Designer produced visual direction", payload: { role: roles.find((item) => item.role === "Designer") } }] : []),
      { type: "tool_plan_ready", message: "Tool intelligence plan ready", payload: { toolPlan } },
      { type: "confidence_scored", message: "Confidence scored", payload: { confidence } },
    ],
  };
}

export function reviewWorkspaceFiles(files: WorkspaceFileAction[], classification: OrchestrationResult["classification"]): ReviewResult {
  const findings: string[] = [];
  const byPath = new Map(files.map((file) => [file.path, file]));
  const html = byPath.get("index.html")?.content || "";
  const isStaticWebsite = classification.type === "website_generation";

  if (isStaticWebsite) {
    for (const required of ["index.html", "style.css", "script.js"]) {
      if (!byPath.has(required)) findings.push(`Missing required file: ${required}`);
    }
    if (!/<!doctype html|<html[\s>]/i.test(html)) findings.push("index.html does not contain valid HTML shell.");
    if (/^[\s]*[{[]/.test(html)) findings.push("index.html looks like raw JSON.");
    if ((html.match(/\\n/g) || []).length > 8) findings.push("index.html contains escaped newline spam.");
    if (/\$\{[^}]+}/.test(files.map((file) => file.content || "").join("\n"))) findings.push("Generated files contain unresolved template placeholders.");
    if (!/href=["']\.\/style\.css["']/i.test(html)) findings.push("index.html does not link ./style.css.");
    if (!/src=["']\.\/script\.js["']/i.test(html)) findings.push("index.html does not load ./script.js.");
    if (!/pricing|plan|monthly|yearly|price/i.test(html)) findings.push("Pricing task does not appear visually complete.");
  }

  return {
    status: findings.length ? "block" : "pass",
    findings,
    summary: findings.length ? `Reviewer found ${findings.length} issue(s).` : "Reviewer passed generated files.",
  };
}

export function securityReviewWorkspaceFiles(files: WorkspaceFileAction[]): ReviewResult {
  const findings: string[] = [];
  for (const file of files) {
    if (file.path.includes("..") || file.path.startsWith("/") || /^[a-zA-Z]:/.test(file.path)) findings.push(`Unsafe path: ${file.path}`);
    const content = file.content || "";
    if (/mdx_[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+|OPENROUTER_API_KEY|DATABASE_URL|password=/i.test(content)) findings.push(`Potential secret leakage in ${file.path}`);
    if (/<script[^>]+src=["']https?:\/\/(?!cdn\.jsdelivr\.net|unpkg\.com)/i.test(content)) findings.push(`Risky external script in ${file.path}`);
  }
  return {
    status: findings.length ? "block" : "pass",
    findings,
    summary: findings.length ? `Security reviewer blocked ${findings.length} issue(s).` : "Security reviewer passed.",
  };
}

export function performanceReviewWorkspaceFiles(files: WorkspaceFileAction[]): ReviewResult {
  const findings: string[] = [];
  const totalBytes = files.reduce((sum, file) => sum + Buffer.byteLength(file.content || ""), 0);
  if (totalBytes > 450_000) findings.push("Generated static files are unusually large.");
  for (const file of files) {
    const content = file.content || "";
    if ((content.match(/setInterval\(/g) || []).length > 2) findings.push(`Excessive timers in ${file.path}`);
    if ((content.match(/animation:/g) || []).length > 16 && !/prefers-reduced-motion/.test(content)) findings.push(`Animations in ${file.path} should include reduced-motion handling.`);
  }
  return {
    status: findings.length ? "warn" : "pass",
    findings,
    summary: findings.length ? `Performance reviewer warned on ${findings.length} issue(s).` : "Performance reviewer passed.",
  };
}

export async function recordWorkspaceLearning(input: {
  userId: string;
  projectId: string;
  taskId: string;
  prompt: string;
  classification: OrchestrationResult["classification"];
  qualityScore: number;
  reviewer: ReviewResult;
  security: ReviewResult;
  performance: ReviewResult;
  verification: Record<string, unknown>;
}) {
  const learning = {
    type: input.classification.type,
    subtype: input.classification.subtype,
    labels: input.classification.labels,
    qualityScore: input.qualityScore,
    failurePattern: input.reviewer.findings[0] || input.security.findings[0] || input.performance.findings[0] || null,
    successfulFix: input.qualityScore >= 85 ? "Generated files passed review and preview verification." : null,
    dependencyRule: input.classification.type === "website_generation" ? "Static website should not add dependencies unless requested." : null,
    patchScopeRule: "Patch only generated/target files unless evidence requires broader edits.",
    verification: input.verification,
  };
  await prisma.workspaceLog.create({
    data: {
      userId: input.userId,
      projectId: input.projectId,
      taskId: input.taskId,
      event: "learning_stub_recorded",
      message: "Recorded safe workspace learning summary.",
      metadata: learning as Prisma.InputJsonValue,
    },
  });
  return learning;
}
