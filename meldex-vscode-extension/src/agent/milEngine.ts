import * as fs from "fs";
import * as path from "path";
import { WorkspaceMemory } from "./workspaceMemory";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface MilPrediction {
  likelyNextRequests: string[];
  likelyFiles: string[];
  buildCommand?: string;
  testCommand?: string;
  previewCommand?: string;
  deploymentImpact: RiskLevel;
}

export interface StyleProfile {
  indentation: "tabs" | "2 spaces" | "4 spaces" | "mixed";
  naming: string[];
  folders: string[];
  importStyle: string;
  componentStyle: string;
  documentationStyle: string;
}

export interface IntelligenceFinding {
  category: "technical_debt" | "performance" | "security" | "refactor";
  severity: RiskLevel;
  title: string;
  file?: string;
  recommendation: string;
}

export interface ChangeImpact {
  filesAffected: string[];
  possibleRegressions: string[];
  routesAffected: string[];
  componentsAffected: string[];
  buildImpact: RiskLevel;
}

export interface QualityScore {
  maintainability: number;
  readability: number;
  performance: number;
  security: number;
  architecture: number;
  testing: number;
  overall: number;
}

export interface MilInsight {
  prediction: MilPrediction;
  style: StyleProfile;
  findings: IntelligenceFinding[];
  risk: RiskLevel;
  impact: ChangeImpact;
  quality: QualityScore;
  recommendations: string[];
  selfImprovement: string[];
}

type ProjectMeta = {
  framework: string;
  packageManager: string;
  scripts: Record<string, string>;
  fileTree: string[];
};

export function buildMilInsight(input: {
  root: string;
  task: string;
  meta: ProjectMeta;
  relevantFiles: Array<{ path: string; content: string }>;
  changedFiles?: string[];
  commandsRun?: string[];
  memory: WorkspaceMemory;
  buildPassed?: boolean;
  previewVerified?: boolean;
  testsPassed?: boolean;
}): MilInsight {
  const prediction = predictTask(input.task, input.meta, input.relevantFiles, input.memory);
  const style = detectStyle(input.root, input.relevantFiles);
  const findings = [
    ...detectTechnicalDebt(input.relevantFiles),
    ...detectPerformance(input.relevantFiles),
    ...detectSecurity(input.relevantFiles),
    ...detectRefactorOpportunities(input.relevantFiles),
  ].slice(0, 12);
  const impact = analyzeImpact(input.task, input.meta, input.changedFiles || prediction.likelyFiles);
  const risk = analyzeRisk(input.task, findings, impact);
  const quality = scoreQuality({
    findings,
    risk,
    buildPassed: input.buildPassed,
    previewVerified: input.previewVerified,
    testsPassed: input.testsPassed,
    changedFiles: input.changedFiles || [],
  });
  const recommendations = summarizeRecommendations(findings, impact, prediction);
  const selfImprovement = selfImprove(input, prediction, findings);
  return { prediction, style, findings, risk, impact, quality, recommendations, selfImprovement };
}

export function insightSummary(insight: MilInsight): string {
  const top = insight.recommendations.slice(0, 2).join(" · ") || "No urgent recommendations.";
  return `Quality ${insight.quality.overall}/100 · Risk ${insight.risk} · ${top}`;
}

export function blockUnsafePatch(insight: MilInsight): string[] {
  return insight.findings
    .filter((finding) => finding.category === "security" && (finding.severity === "critical" || finding.severity === "high"))
    .map((finding) => `${finding.title}${finding.file ? ` in ${finding.file}` : ""}`);
}

function predictTask(task: string, meta: ProjectMeta, relevantFiles: Array<{ path: string }>, memory: WorkspaceMemory): MilPrediction {
  const lower = task.toLowerCase();
  const pm = meta.packageManager || "npm";
  const scripts = meta.scripts || {};
  const likelyFiles = relevantFiles.map((file) => file.path).slice(0, 8);
  const likelyNextRequests = [
    /ui|page|dashboard|landing/.test(lower) ? "Polish responsive UI and verify preview" : "",
    /api|route|backend/.test(lower) ? "Add tests for API behavior" : "",
    /fix|bug|error/.test(lower) ? "Run build and store successful fix pattern" : "",
    "Commit-ready summary",
  ].filter(Boolean);
  return {
    likelyNextRequests,
    likelyFiles,
    buildCommand: scripts.build ? `${pm} run build` : memory.frequentCommands.find((cmd) => cmd.includes("build")),
    testCommand: scripts.test ? (pm === "npm" ? "npm test" : `${pm} test`) : memory.frequentCommands.find((cmd) => cmd.includes("test")),
    previewCommand: /preview|run|local server|ui|dashboard|landing/.test(lower) ? "preview server" : undefined,
    deploymentImpact: /auth|payment|database|migration|deploy|security/.test(lower) ? "high" : /api|backend|route/.test(lower) ? "medium" : "low",
  };
}

function detectStyle(root: string, files: Array<{ path: string; content: string }>): StyleProfile {
  const sample = files.map((file) => file.content).join("\n").slice(0, 40000);
  const tabs = (sample.match(/^\t+/gm) || []).length;
  const two = (sample.match(/^ {2}\S/gm) || []).length;
  const four = (sample.match(/^ {4}\S/gm) || []).length;
  const folders = ["components", "app", "pages", "src", "lib", "routes"].filter((dir) => fs.existsSync(path.join(root, dir)));
  return {
    indentation: tabs > two && tabs > four ? "tabs" : four > two * 1.5 ? "4 spaces" : two ? "2 spaces" : "mixed",
    naming: [
      files.some((file) => /[A-Z][A-Za-z0-9]+\.tsx?$/.test(file.path)) ? "PascalCase components" : "",
      files.some((file) => /[a-z0-9-]+\.tsx?$/.test(file.path)) ? "kebab-case files" : "",
    ].filter(Boolean),
    folders,
    importStyle: sample.includes("@/") ? "absolute @ imports" : "relative imports",
    componentStyle: /export default function/.test(sample) ? "default function components" : /export function/.test(sample) ? "named function exports" : "mixed",
    documentationStyle: /\/\*\*[\s\S]*?\*\//.test(sample) ? "JSDoc/TSDoc" : "minimal comments",
  };
}

function detectTechnicalDebt(files: Array<{ path: string; content: string }>): IntelligenceFinding[] {
  const findings: IntelligenceFinding[] = [];
  for (const file of files) {
    if ((file.content.match(/TODO|FIXME|HACK/g) || []).length > 2) {
      findings.push(finding("technical_debt", "medium", "Multiple TODO/FIXME markers", file.path, "Review deferred work before expanding this module."));
    }
    if ((file.content.match(/console\.log/g) || []).length > 2) {
      findings.push(finding("technical_debt", "low", "Console logging in source", file.path, "Replace noisy logs with structured logging or remove before release."));
    }
    if (file.content.length > 18000) {
      findings.push(finding("refactor", "medium", "Large file", file.path, "Consider extracting focused helpers/components after this task."));
    }
    const imports = file.content.match(/^import .+$/gm) || [];
    const duplicateImports = imports.filter((line, i, arr) => arr.indexOf(line) !== i);
    if (duplicateImports.length) findings.push(finding("technical_debt", "low", "Duplicate imports", file.path, "Remove duplicate imports in a cleanup pass."));
  }
  return findings;
}

function detectPerformance(files: Array<{ path: string; content: string }>): IntelligenceFinding[] {
  const findings: IntelligenceFinding[] = [];
  for (const file of files) {
    if (/useEffect\([\s\S]*?fetch\(/.test(file.content) && !/AbortController|ignore\s*=|cancel/.test(file.content)) {
      findings.push(finding("performance", "medium", "Fetch effect without cancellation", file.path, "Use cancellation/ignore guard to avoid stale updates."));
    }
    if (/\.map\([\s\S]*?\.filter\(|\.filter\([\s\S]*?\.map\(/.test(file.content)) {
      findings.push(finding("performance", "low", "Chained collection transforms", file.path, "For large data, consider a single pass or memoized derived data."));
    }
    if (/useMemo|memo\(/.test(file.content) === false && /onClick=.*=>|map\(.*=>/s.test(file.content) && file.content.length > 9000) {
      findings.push(finding("performance", "low", "Potential rerender churn", file.path, "Consider memoization only if profiling confirms rerender cost."));
    }
  }
  return findings;
}

function detectSecurity(files: Array<{ path: string; content: string }>): IntelligenceFinding[] {
  const findings: IntelligenceFinding[] = [];
  for (const file of files) {
    if (/AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN PRIVATE KEY-----/.test(file.content)) {
      findings.push(finding("security", "critical", "Possible secret in source", file.path, "Remove secret immediately and rotate the credential."));
    }
    if (/dangerouslySetInnerHTML/.test(file.content)) {
      findings.push(finding("security", "high", "Raw HTML injection surface", file.path, "Sanitize trusted HTML or avoid dangerouslySetInnerHTML."));
    }
    if (/exec\(|spawn\(|eval\(|new Function\(/.test(file.content) && /req\.|request\.|input|query|params/.test(file.content)) {
      findings.push(finding("security", "high", "Possible command/code injection", file.path, "Validate and escape user-controlled input before execution."));
    }
    if (/\$queryRawUnsafe|SELECT .* \+|query\s*\+/.test(file.content)) {
      findings.push(finding("security", "high", "Possible SQL injection", file.path, "Use parameterized queries or safe ORM APIs."));
    }
  }
  return findings;
}

function detectRefactorOpportunities(files: Array<{ path: string; content: string }>): IntelligenceFinding[] {
  const findings: IntelligenceFinding[] = [];
  for (const file of files) {
    const repeatedClass = file.content.match(/className="([^"]{40,})"/g) || [];
    if (repeatedClass.length > 5) findings.push(finding("refactor", "low", "Repeated long class strings", file.path, "Consider extracting shared component/style constants later."));
    if ((file.content.match(/function [A-Za-z0-9_]+/g) || []).length > 12) findings.push(finding("refactor", "medium", "Many functions in one file", file.path, "Consider splitting cohesive helpers in a separate refactor."));
  }
  return findings;
}

function analyzeImpact(task: string, meta: ProjectMeta, files: string[]): ChangeImpact {
  const routesAffected = files.filter((file) => /(^app\/|^pages\/|routes|api)/.test(file));
  const componentsAffected = files.filter((file) => /component|components\/|\.tsx$|\.jsx$/.test(file));
  const possibleRegressions = [
    routesAffected.length ? "Route rendering or API behavior may change" : "",
    componentsAffected.length ? "Shared component consumers may be affected" : "",
    /auth|payment|database|migration/i.test(task) ? "Critical workflow requires extra review" : "",
  ].filter(Boolean);
  return {
    filesAffected: files,
    possibleRegressions,
    routesAffected,
    componentsAffected,
    buildImpact: /next|vite|react|node/i.test(meta.framework) || routesAffected.length ? "medium" : "low",
  };
}

function analyzeRisk(task: string, findings: IntelligenceFinding[], impact: ChangeImpact): RiskLevel {
  if (findings.some((item) => item.severity === "critical") || /payment|auth|migration|delete|secret/i.test(task)) return "critical";
  if (findings.some((item) => item.severity === "high") || impact.possibleRegressions.length > 2) return "high";
  if (impact.buildImpact === "medium" || findings.some((item) => item.severity === "medium")) return "medium";
  return "low";
}

function scoreQuality(input: { findings: IntelligenceFinding[]; risk: RiskLevel; buildPassed?: boolean; previewVerified?: boolean; testsPassed?: boolean; changedFiles: string[] }): QualityScore {
  const penalty = (category: IntelligenceFinding["category"]) => input.findings.filter((item) => item.category === category).reduce((n, item) => n + severityPenalty(item.severity), 0);
  const maintainability = clamp(92 - penalty("technical_debt") - penalty("refactor") / 2);
  const readability = clamp(90 - penalty("technical_debt"));
  const performance = clamp(92 - penalty("performance"));
  const security = clamp(96 - penalty("security") * 1.4);
  const architecture = clamp(90 - (input.risk === "critical" ? 22 : input.risk === "high" ? 14 : input.risk === "medium" ? 6 : 0));
  const testing = clamp((input.testsPassed ? 95 : input.buildPassed || input.previewVerified ? 78 : input.changedFiles.length ? 64 : 72));
  const overall = Math.round((maintainability + readability + performance + security + architecture + testing) / 6);
  return { maintainability, readability, performance, security, architecture, testing, overall };
}

function summarizeRecommendations(findings: IntelligenceFinding[], impact: ChangeImpact, prediction: MilPrediction): string[] {
  const recommendations = findings
    .filter((item) => item.severity !== "low")
    .map((item) => item.recommendation)
    .slice(0, 4);
  if (impact.possibleRegressions.length) recommendations.push(`Watch: ${impact.possibleRegressions[0]}`);
  if (prediction.testCommand) recommendations.push(`Preferred test command: ${prediction.testCommand}`);
  return [...new Set(recommendations)].slice(0, 5);
}

function selfImprove(input: { relevantFiles: Array<{ path: string }>; commandsRun?: string[]; buildPassed?: boolean; previewVerified?: boolean }, prediction: MilPrediction, findings: IntelligenceFinding[]): string[] {
  const notes = [
    input.relevantFiles.length > 12 ? "Reduce context size next time by narrowing relevant files." : "Context size was reasonable.",
    prediction.buildCommand && !input.commandsRun?.includes(prediction.buildCommand) ? `Consider using predicted build command: ${prediction.buildCommand}.` : "",
    findings.length > 8 ? "Run a separate cleanup task for accumulated findings." : "",
    input.previewVerified ? "Preview verification worked; prefer this flow for UI tasks." : "",
  ].filter(Boolean);
  return notes.slice(0, 4);
}

function finding(category: IntelligenceFinding["category"], severity: RiskLevel, title: string, file: string | undefined, recommendation: string): IntelligenceFinding {
  return { category, severity, title, file, recommendation };
}

function severityPenalty(severity: RiskLevel): number {
  return severity === "critical" ? 30 : severity === "high" ? 18 : severity === "medium" ? 9 : 3;
}

function clamp(value: number): number {
  return Math.max(35, Math.min(100, Math.round(value)));
}
