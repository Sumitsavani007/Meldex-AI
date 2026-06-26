import { WorkspaceMemory } from "./workspaceMemory";

export type AoeRole =
  | "planner"
  | "architect"
  | "frontend_engineer"
  | "backend_engineer"
  | "database_engineer"
  | "reviewer"
  | "security_reviewer"
  | "performance_reviewer"
  | "tester"
  | "debugger"
  | "documentation_writer";

export type AoeNodeStatus = "pending" | "ready" | "running" | "done" | "blocked";

export interface TaskGraphNode {
  id: string;
  title: string;
  role: AoeRole;
  dependsOn: string[];
  tools: string[];
  confidence: number;
  risk: "low" | "medium" | "high";
  status: AoeNodeStatus;
}

export interface AutonomousPlan {
  intent: string;
  complexity: "simple" | "moderate" | "complex";
  ambiguity: "low" | "medium" | "high";
  estimatedFiles: number;
  estimatedMinutes: number;
  milestones: string[];
  architecture: string;
  executionStrategy: string;
  confidence: number;
  assumptions: string[];
  taskGraph: TaskGraphNode[];
  qualityGates: string[];
  selectedRoles: AoeRole[];
  toolStrategy: string[];
}

export interface AoeInput {
  task: string;
  projectType: string;
  packageManager: string;
  relevantFiles: string[];
  packageJson?: string;
  memory: WorkspaceMemory;
  hasActiveFile?: boolean;
}

const ROLE_LABELS: Record<AoeRole, string> = {
  planner: "Planner",
  architect: "Architect",
  frontend_engineer: "Frontend Engineer",
  backend_engineer: "Backend Engineer",
  database_engineer: "Database Engineer",
  reviewer: "Reviewer",
  security_reviewer: "Security Reviewer",
  performance_reviewer: "Performance Reviewer",
  tester: "Tester",
  debugger: "Debugger",
  documentation_writer: "Documentation Writer",
};

export function buildAutonomousPlan(input: AoeInput): AutonomousPlan {
  const lower = input.task.toLowerCase();
  const isBug = /fix|bug|error|fail|debug|issue|broken/.test(lower);
  const isUi = /ui|page|component|style|css|responsive|dashboard|landing|polish/.test(lower);
  const isApi = /api|endpoint|route|server|backend|auth|webhook/.test(lower);
  const isDb = /database|db|prisma|schema|migration|sql|model/.test(lower);
  const isDocs = /readme|docs|documentation|comment/.test(lower);
  const isTests = /test|spec|coverage/.test(lower);
  const isLarge = /dashboard|system|platform|refactor|module|full|complete/.test(lower) || input.relevantFiles.length > 12;

  const complexity: AutonomousPlan["complexity"] = isLarge ? "complex" : isBug || isUi || isApi ? "moderate" : "simple";
  const ambiguity: AutonomousPlan["ambiguity"] = /\bthing|stuff|better|nice|improve\b/.test(lower) ? "medium" : "low";
  const roles = selectRoles({ isBug, isUi, isApi, isDb, isDocs, isTests });
  const milestones = [
    "Understand request",
    "Select context",
    "Design execution strategy",
    isBug ? "Debug failing path" : "Generate implementation patch",
    "Self-review patch",
    "Run quality gates",
    "Verify result",
  ];
  const commands = expectedCommands(input.task, input.projectType, input.packageManager, input.packageJson);
  const graph = buildTaskGraph(roles, commands, complexity);
  const confidence = estimateConfidence(input, ambiguity, complexity);

  return {
    intent: summarizeIntent(input.task, input.projectType),
    complexity,
    ambiguity,
    estimatedFiles: estimateFiles(input, complexity),
    estimatedMinutes: complexity === "complex" ? 18 : complexity === "moderate" ? 8 : 3,
    milestones,
    architecture: architectureSummary(input, { isUi, isApi, isDb, isDocs }),
    executionStrategy: strategyFor({ isBug, isUi, isApi, isDb, isDocs, isTests, complexity }),
    confidence,
    assumptions: assumptionsFor(input, ambiguity),
    taskGraph: graph,
    qualityGates: qualityGates(input, commands),
    selectedRoles: roles,
    toolStrategy: toolStrategyFor(input, commands),
  };
}

export function autonomousPromptSection(plan: AutonomousPlan): string {
  return `AUTONOMOUS ORCHESTRATION ENGINE
Intent: ${plan.intent}
Complexity: ${plan.complexity}
Confidence: ${plan.confidence}%
Architecture: ${plan.architecture}
Execution strategy: ${plan.executionStrategy}
Selected roles: ${plan.selectedRoles.map((role) => ROLE_LABELS[role]).join(", ")}
Milestones:
- ${plan.milestones.join("\n- ")}
Task graph:
${plan.taskGraph.map((node) => `- ${node.id}: ${node.title} [${ROLE_LABELS[node.role]}] dependsOn=${node.dependsOn.join(",") || "none"} confidence=${node.confidence}%`).join("\n")}
Quality gates:
- ${plan.qualityGates.join("\n- ")}
Assumptions:
- ${plan.assumptions.join("\n- ")}
Return only structured actions. Do not expose hidden reasoning.`;
}

export function planNeedsUserInput(plan: AutonomousPlan): boolean {
  return plan.confidence < 70 || plan.ambiguity === "high";
}

export function safeReasoningSummary(plan: AutonomousPlan): string[] {
  return [
    `Detected ${plan.complexity} task.`,
    `Selected roles: ${plan.selectedRoles.map((role) => ROLE_LABELS[role]).join(", ")}.`,
    `Strategy: ${plan.executionStrategy}.`,
    `Quality gates: ${plan.qualityGates.join(", ")}.`,
  ];
}

function selectRoles(flags: { isBug: boolean; isUi: boolean; isApi: boolean; isDb: boolean; isDocs: boolean; isTests: boolean }): AoeRole[] {
  const roles: AoeRole[] = ["planner", "architect"];
  if (flags.isBug) roles.push("debugger");
  if (flags.isUi) roles.push("frontend_engineer");
  if (flags.isApi) roles.push("backend_engineer");
  if (flags.isDb) roles.push("database_engineer");
  if (flags.isTests) roles.push("tester");
  if (flags.isDocs) roles.push("documentation_writer");
  roles.push("reviewer", "security_reviewer", "performance_reviewer", "tester");
  return [...new Set(roles)];
}

function buildTaskGraph(roles: AoeRole[], commands: string[], complexity: AutonomousPlan["complexity"]): TaskGraphNode[] {
  const risk = complexity === "complex" ? "high" : complexity === "moderate" ? "medium" : "low";
  const nodes: TaskGraphNode[] = [
    node("understand", "Understand intent and constraints", "planner", [], ["memory", "read"], 94, "low"),
    node("architect", "Preserve architecture and choose module boundaries", "architect", ["understand"], ["read"], 90, risk),
    node("context", "Build smallest high-quality context", "planner", ["understand"], ["read", "memory"], 92, "low"),
    node("implement", "Generate implementation patch", primaryEngineer(roles), ["architect", "context"], ["backend", "patch"], complexity === "complex" ? 82 : 91, risk),
    node("review", "Run self-review quality checks", "reviewer", ["implement"], ["read"], 88, "medium"),
    node("security", "Check obvious security issues", "security_reviewer", ["review"], ["read"], 86, "medium"),
    node("performance", "Check obvious performance issues", "performance_reviewer", ["review"], ["read"], 84, "medium"),
  ];
  if (commands.length) nodes.push(node("execute", `Run ${commands.join(", ")}`, "tester", ["security", "performance"], ["terminal"], 86, "medium"));
  nodes.push(node("verify", "Verify preview/build/test result", "tester", commands.length ? ["execute"] : ["security", "performance"], ["terminal", "preview"], 88, "medium"));
  nodes.push(node("deliver", "Summarize completed work", "documentation_writer", ["verify"], ["memory"], 96, "low"));
  return nodes;
}

function node(id: string, title: string, role: AoeRole, dependsOn: string[], tools: string[], confidence: number, risk: TaskGraphNode["risk"]): TaskGraphNode {
  return { id, title, role, dependsOn, tools, confidence, risk, status: dependsOn.length ? "pending" : "ready" };
}

function primaryEngineer(roles: AoeRole[]): AoeRole {
  return roles.includes("frontend_engineer") ? "frontend_engineer" :
    roles.includes("backend_engineer") ? "backend_engineer" :
      roles.includes("database_engineer") ? "database_engineer" :
        roles.includes("debugger") ? "debugger" : "architect";
}

function expectedCommands(task: string, projectType: string, pm: string, packageJson?: string): string[] {
  const lower = `${task} ${projectType}`.toLowerCase();
  const hasScript = (name: string) => !!packageJson && new RegExp(`"${name}"\\s*:`).test(packageJson);
  const commands: string[] = [];
  if (/build|verify|dashboard|next|react|vite|node/.test(lower) && hasScript("build")) commands.push(`${pm} run build`);
  if (/lint|quality|verify/.test(lower) && hasScript("lint")) commands.push(`${pm} run lint`);
  if (/test|verify/.test(lower) && hasScript("test")) commands.push(pm === "npm" ? "npm test" : `${pm} test`);
  if (/preview|local server|run|chalavi/.test(lower)) commands.push("preview");
  return commands;
}

function estimateConfidence(input: AoeInput, ambiguity: AutonomousPlan["ambiguity"], complexity: AutonomousPlan["complexity"]): number {
  let confidence = 92;
  if (!input.relevantFiles.length && !/landing|empty|new|create/.test(input.task.toLowerCase())) confidence -= 12;
  if (ambiguity !== "low") confidence -= 18;
  if (complexity === "complex") confidence -= 8;
  if (input.memory.successfulFixes.length) confidence += 3;
  return Math.max(55, Math.min(98, confidence));
}

function estimateFiles(input: AoeInput, complexity: AutonomousPlan["complexity"]): number {
  if (complexity === "simple") return Math.max(1, Math.min(3, input.relevantFiles.length || 3));
  if (complexity === "moderate") return Math.max(2, Math.min(8, input.relevantFiles.length || 5));
  return Math.max(5, Math.min(18, input.relevantFiles.length || 10));
}

function summarizeIntent(task: string, projectType: string): string {
  return `${task.replace(/\s+/g, " ").trim().slice(0, 140)} (${projectType || "unknown project"})`;
}

function architectureSummary(input: AoeInput, flags: { isUi: boolean; isApi: boolean; isDb: boolean; isDocs: boolean }): string {
  const parts = [`Preserve ${input.projectType || "existing"} conventions`];
  if (flags.isUi) parts.push("keep UI components responsive and accessible");
  if (flags.isApi) parts.push("respect route/API boundaries");
  if (flags.isDb) parts.push("avoid unsafe schema/data changes");
  if (flags.isDocs) parts.push("docs-only changes should avoid code churn");
  if (input.memory.architectureSummary) parts.push(`memory: ${input.memory.architectureSummary.slice(0, 120)}`);
  return parts.join("; ");
}

function strategyFor(flags: { isBug: boolean; isUi: boolean; isApi: boolean; isDb: boolean; isDocs: boolean; isTests: boolean; complexity: AutonomousPlan["complexity"] }): string {
  if (flags.isBug) return "Debugger-first: reproduce/parse error, patch minimally, rerun checks.";
  if (flags.complexity === "complex") return "Full orchestration: milestone graph, self-review, quality gates, verify.";
  if (flags.isUi) return "Frontend profile: implement responsive accessible UI, then verify preview/build.";
  if (flags.isApi) return "Backend profile: update route/service boundary, then run validation.";
  if (flags.isDocs) return "Documentation profile: focused edits with light validation.";
  return "Fast path with self-review and detected checks.";
}

function assumptionsFor(input: AoeInput, ambiguity: AutonomousPlan["ambiguity"]): string[] {
  const assumptions = ["Use existing project conventions", "Do not store or modify secrets"];
  if (ambiguity !== "low") assumptions.push("Proceed with conservative interpretation of ambiguous wording");
  if (!input.packageJson) assumptions.push("No package metadata found; use static/project-local validation");
  return assumptions;
}

function qualityGates(input: AoeInput, commands: string[]): string[] {
  const gates = ["Self-review", "No unsafe paths", "No secret writes", "No fake imports"];
  if (commands.some((cmd) => cmd.includes("build"))) gates.push("Build passes");
  if (commands.some((cmd) => cmd.includes("lint"))) gates.push("Lint passes");
  if (commands.some((cmd) => cmd.includes("test"))) gates.push("Tests pass");
  if (commands.includes("preview")) gates.push("Preview HTTP 200 verified");
  if (/typescript|next|react|vite|node/i.test(input.projectType)) gates.push("No broken imports");
  return gates;
}

function toolStrategyFor(input: AoeInput, commands: string[]): string[] {
  const tools = ["Read", "Memory", "Backend", "Patch"];
  if (commands.length) tools.push("Terminal");
  if (commands.includes("preview")) tools.push("Preview");
  if (/git/i.test(input.task)) tools.push("Git");
  return tools;
}
