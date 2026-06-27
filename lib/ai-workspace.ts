import crypto from "crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateChatCompletionWithUsage, ModelRouterError, type CompletionUsage } from "@/lib/model-router";
import { modelErrorStatus, toSafeProviderError } from "@/lib/provider-health";
import { isUserVisibleWorkspaceFile } from "@/lib/workspace-file-visibility";

export type WorkspaceTreeNode = {
  id?: string;
  name: string;
  path: string;
  type: "file" | "folder";
  status?: string;
  language?: string;
  children?: WorkspaceTreeNode[];
};

export type WorkspaceFileAction = {
  operation: "create" | "edit" | "delete";
  path: string;
  content?: string;
  description?: string;
};

export type WorkspaceAgentResponse = {
  plan?: string[];
  files?: WorkspaceFileAction[];
  commands?: string[];
  summary?: string;
  warnings?: string[];
  usage?: CompletionUsage;
  provider?: string;
  model?: string;
  rawContent?: string;
};

export type WorkspaceMemorySnapshot = {
  projectSummary: string;
  architecture: string[];
  recentTasks: Array<{ prompt: string; summary: string; status: string; qualityScore: number; filesChanged: string[]; createdAt: string }>;
  recentDecisions: string[];
  knownIssues: string[];
  successfulFixes: string[];
  codingStyle: string[];
  designStyle: string[];
  lastSuccessfulCommands: string[];
  activePreviewCommand: string;
  updatedAt: string;
};

export type WorkspaceProviderFailure = {
  kind: "credits" | "timeout" | "rate_limit" | "unavailable" | "auth" | "unknown";
  code: string;
  reason: string;
  userMessage: string;
  retryAfter?: string | null;
  offlineAvailable: boolean;
};

export type WorkspaceStreamEvent = {
  sequence: number;
  type: string;
  message: string;
  payload?: Record<string, unknown>;
};

export function workspaceStorageRoot() {
  return process.env.WORKSPACE_STORAGE_DIR || process.env.MELDEX_WORKSPACE_ROOT || path.join(os.homedir(), ".meldex", "workspaces");
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "workspace";
}

function extension(filePath: string) {
  return path.extname(filePath).slice(1).toLowerCase() || "text";
}

function hash(content: string) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function countDiff(oldContent: string, newContent: string) {
  const oldLines = oldContent ? oldContent.split(/\r?\n/) : [];
  const newLines = newContent ? newContent.split(/\r?\n/) : [];
  let added = 0;
  let removed = 0;
  const max = Math.max(oldLines.length, newLines.length);
  for (let index = 0; index < max; index += 1) {
    if (oldLines[index] === newLines[index]) continue;
    if (oldLines[index] !== undefined) removed += 1;
    if (newLines[index] !== undefined) added += 1;
  }
  return { added, removed };
}

function safeRelative(filePath = "") {
  const decoded = decodeURIComponent(filePath).replace(/\0/g, "");
  const normalized = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^\/+/, "");
  if (!normalized || normalized === ".") return "";
  if (normalized.startsWith("..") || path.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error("Invalid workspace path");
  }
  if (/(^|[\\/])\.env(\.|$)|secret|credential|private[-_]?key/i.test(normalized)) {
    throw new Error("Secret-like paths are not allowed in workspace files");
  }
  return normalized.split(path.sep).join("/");
}

function redact(value: string) {
  return value
    .replace(/mdx_[A-Za-z0-9_-]+/g, "mdx_****")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-****")
    .replace(/sk-or-[A-Za-z0-9_-]+/g, "sk-or-****")
    .replace(/(password|token|api[_-]?key|secret)=([^\s&]+)/gi, "$1=****");
}

function safeMemoryText(value = "", max = 900) {
  return redact(value)
    .replace(/```[\s\S]*?```/g, "[code omitted]")
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, (match) => match.startsWith("mdx_") || match.startsWith("sk") ? "****" : match)
    .slice(0, max)
    .trim();
}

function decodeGeneratedContent(value: unknown) {
  let content = typeof value === "string" ? value : value == null ? "" : JSON.stringify(value, null, 2);
  const escapedNewlines = (content.match(/\\n/g) || []).length;
  if (escapedNewlines >= 2 && content.split(/\r?\n/).length <= 3) {
    content = content
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "  ")
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'");
  }
  return content.trim();
}

function hasUnresolvedTemplatePlaceholder(content = "") {
  return /\$\{[a-zA-Z0-9_.[\]\s'"`+-]+\}/.test(content);
}

function looksLikeRawModelDump(content = "") {
  const trimmed = content.trim();
  return (
    /^[{[]/.test(trimmed) ||
    /^```/.test(trimmed) ||
    /"plan"\s*:|"files"\s*:|"summary"\s*:/.test(trimmed.slice(0, 2000)) ||
    (trimmed.match(/\\n/g) || []).length > 8
  );
}

function staticFallbackFiles(prompt: string, reason: string): WorkspaceFileAction[] {
  const productName = /meldex/i.test(prompt) ? "Meldex" : "Meldex AI";
  const isPricing = /\bpricing|price|plan|subscription\b/i.test(prompt);
  const title = isPricing ? `${productName} Pricing` : productName;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <main class="page-shell">
    <section class="pricing-hero" aria-labelledby="pricing-title">
      <p class="eyebrow">AI SaaS Pricing</p>
      <h1 id="pricing-title">Choose the right Meldex plan</h1>
      <p class="hero-copy">Launch faster with a workspace that plans, builds, previews, and learns from every task.</p>
      <div class="billing-toggle" role="group" aria-label="Billing period">
        <button class="toggle-option active" type="button" data-billing="monthly">Monthly</button>
        <button class="toggle-option" type="button" data-billing="yearly">Yearly <span>Save 20%</span></button>
      </div>
    </section>
    <section class="pricing-grid" aria-label="Pricing plans">
      <article class="plan-card">
        <p class="plan-kicker">Starter</p>
        <h2>Builder</h2>
        <p class="plan-description">For solo makers validating landing pages and product ideas.</p>
        <div class="price"><span data-monthly="$19" data-yearly="$15">$19</span><small>/mo</small></div>
        <ul>
          <li>25 AI workspace tasks</li>
          <li>Live preview and file diffs</li>
          <li>Offline starter mode</li>
        </ul>
        <a href="#contact" class="plan-button secondary">Start building</a>
      </article>
      <article class="plan-card featured">
        <div class="badge">Most popular</div>
        <p class="plan-kicker">Pro</p>
        <h2>Launch Team</h2>
        <p class="plan-description">For teams shipping polished SaaS flows with agent QA.</p>
        <div class="price"><span data-monthly="$49" data-yearly="$39">$49</span><small>/mo</small></div>
        <ul>
          <li>150 AI workspace tasks</li>
          <li>Codex hybrid runtime</li>
          <li>Context memory and rollback</li>
        </ul>
        <a href="#contact" class="plan-button">Choose Pro</a>
      </article>
      <article class="plan-card">
        <p class="plan-kicker">Scale</p>
        <h2>Business</h2>
        <p class="plan-description">For high-volume product teams that need governance and support.</p>
        <div class="price"><span data-monthly="$149" data-yearly="$119">$149</span><small>/mo</small></div>
        <ul>
          <li>Unlimited projects</li>
          <li>Advanced model controls</li>
          <li>Priority support and audit logs</li>
        </ul>
        <a href="#contact" class="plan-button secondary">Talk to sales</a>
      </article>
    </section>
    <section id="contact" class="cta-panel">
      <h2>Ready to build with Meldex?</h2>
      <p>Start with a premium AI workspace and keep improving every release.</p>
      <button type="button">Create workspace</button>
    </section>
  </main>
  <script src="./script.js"></script>
</body>
</html>`;
  const css = `:root {
  color-scheme: dark;
  --bg: #080914;
  --panel: rgba(255,255,255,.07);
  --panel-strong: rgba(255,255,255,.12);
  --text: #f8fafc;
  --muted: #a7b0c3;
  --border: rgba(255,255,255,.14);
  --accent: #8b5cf6;
  --accent-2: #22d3ee;
  --success: #34d399;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background:
    radial-gradient(circle at top left, rgba(139,92,246,.34), transparent 36rem),
    radial-gradient(circle at bottom right, rgba(34,211,238,.18), transparent 30rem),
    var(--bg);
  color: var(--text);
}
.page-shell { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 72px 0; }
.pricing-hero { text-align: center; max-width: 780px; margin: 0 auto 36px; }
.eyebrow { color: var(--accent-2); font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
h1 { margin: 12px 0; font-size: clamp(42px, 8vw, 78px); line-height: .95; letter-spacing: -0.04em; }
.hero-copy { margin: 0 auto 28px; max-width: 640px; color: var(--muted); font-size: 18px; line-height: 1.7; }
.billing-toggle { display: inline-flex; gap: 6px; padding: 6px; border: 1px solid var(--border); border-radius: 999px; background: rgba(255,255,255,.06); }
.toggle-option { border: 0; border-radius: 999px; padding: 11px 16px; color: var(--muted); background: transparent; font-weight: 800; cursor: pointer; }
.toggle-option span { color: var(--success); }
.toggle-option.active { color: #fff; background: linear-gradient(135deg, var(--accent), #6d5dfc); box-shadow: 0 14px 34px rgba(139,92,246,.35); }
.pricing-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; align-items: stretch; }
.plan-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 520px;
  padding: 28px;
  border: 1px solid var(--border);
  border-radius: 28px;
  background: linear-gradient(180deg, var(--panel-strong), var(--panel));
  box-shadow: 0 24px 80px rgba(0,0,0,.28);
  backdrop-filter: blur(18px);
  transition: transform .2s ease, border-color .2s ease;
}
.plan-card:hover { transform: translateY(-6px); border-color: rgba(139,92,246,.65); }
.featured { border-color: rgba(139,92,246,.72); background: linear-gradient(180deg, rgba(139,92,246,.22), rgba(255,255,255,.08)); }
.badge { position: absolute; right: 22px; top: 22px; border-radius: 999px; padding: 7px 10px; color: #fff; background: rgba(139,92,246,.38); font-size: 12px; font-weight: 800; }
.plan-kicker { margin: 0 0 12px; color: var(--accent-2); font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .12em; }
h2 { margin: 0; font-size: 28px; }
.plan-description { color: var(--muted); min-height: 72px; line-height: 1.6; }
.price { display: flex; align-items: flex-end; gap: 6px; margin: 18px 0 20px; }
.price span { font-size: 54px; font-weight: 900; letter-spacing: -0.05em; }
.price small { color: var(--muted); padding-bottom: 10px; }
ul { display: grid; gap: 12px; padding: 0; margin: 0 0 28px; list-style: none; color: #dbe4f5; }
li::before { content: "✓"; color: var(--success); margin-right: 10px; }
.plan-button, .cta-panel button { margin-top: auto; display: inline-flex; justify-content: center; border: 0; border-radius: 16px; padding: 14px 18px; color: #fff; background: linear-gradient(135deg, var(--accent), #6d5dfc); font-weight: 900; text-decoration: none; cursor: pointer; }
.plan-button.secondary { background: rgba(255,255,255,.09); border: 1px solid var(--border); }
.cta-panel { margin-top: 20px; padding: 30px; border: 1px solid var(--border); border-radius: 28px; background: rgba(255,255,255,.06); text-align: center; }
.cta-panel p { color: var(--muted); }
@media (max-width: 900px) { .pricing-grid { grid-template-columns: 1fr; } .plan-card { min-height: auto; } }
@media (max-width: 540px) { .page-shell { padding: 42px 0; } h1 { font-size: 42px; } .billing-toggle { width: 100%; } .toggle-option { flex: 1; } }`;
  const js = `const buttons = document.querySelectorAll(".toggle-option");
buttons.forEach((button) => {
  button.addEventListener("click", () => {
    buttons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    const billing = button.dataset.billing;
    document.querySelectorAll(".price span").forEach((price) => {
      price.textContent = price.dataset[billing] || price.textContent;
    });
  });
});`;
  return [
    { operation: "create", path: "index.html", content: html, description: `Generated safe preview fallback: ${reason}` },
    { operation: "create", path: "style.css", content: css, description: "Premium responsive pricing styles" },
    { operation: "create", path: "script.js", content: js, description: "Monthly/yearly pricing toggle" },
    { operation: "create", path: "README.md", content: `# ${title}\n\nGenerated by Meldex Workspace.\n\n## Files\n\n- index.html\n- style.css\n- script.js\n\n## Validation\n\nPreview must render HTML, load CSS/JS, and contain no raw model JSON or unresolved placeholders.\n`, description: "Project notes" },
  ];
}

function uniqueLimit(values: string[], limit: number) {
  return [...new Set(values.map((item) => safeMemoryText(item, 240)).filter(Boolean))].slice(0, limit);
}

function emptyWorkspaceMemory(): WorkspaceMemorySnapshot {
  return {
    projectSummary: "",
    architecture: [],
    recentTasks: [],
    recentDecisions: [],
    knownIssues: [],
    successfulFixes: [],
    codingStyle: [],
    designStyle: [],
    lastSuccessfulCommands: [],
    activePreviewCommand: "static-preview-verify",
    updatedAt: new Date(0).toISOString(),
  };
}

function normalizeMemory(raw: unknown): WorkspaceMemorySnapshot {
  const value = (raw || {}) as Partial<WorkspaceMemorySnapshot>;
  return {
    ...emptyWorkspaceMemory(),
    ...value,
    projectSummary: safeMemoryText(value.projectSummary || "", 1000),
    architecture: uniqueLimit(Array.isArray(value.architecture) ? value.architecture : [], 20),
    recentTasks: Array.isArray(value.recentTasks) ? value.recentTasks.slice(0, 8).map((task) => ({
      prompt: safeMemoryText(task.prompt, 260),
      summary: safeMemoryText(task.summary, 360),
      status: safeMemoryText(task.status, 40),
      qualityScore: Number(task.qualityScore || 0),
      filesChanged: uniqueLimit(Array.isArray(task.filesChanged) ? task.filesChanged : [], 16),
      createdAt: safeMemoryText(task.createdAt, 40),
    })) : [],
    recentDecisions: uniqueLimit(Array.isArray(value.recentDecisions) ? value.recentDecisions : [], 20),
    knownIssues: uniqueLimit(Array.isArray(value.knownIssues) ? value.knownIssues : [], 20),
    successfulFixes: uniqueLimit(Array.isArray(value.successfulFixes) ? value.successfulFixes : [], 20),
    codingStyle: uniqueLimit(Array.isArray(value.codingStyle) ? value.codingStyle : [], 16),
    designStyle: uniqueLimit(Array.isArray(value.designStyle) ? value.designStyle : [], 16),
    lastSuccessfulCommands: uniqueLimit(Array.isArray(value.lastSuccessfulCommands) ? value.lastSuccessfulCommands : [], 12),
    activePreviewCommand: safeMemoryText(value.activePreviewCommand || "static-preview-verify", 120),
    updatedAt: safeMemoryText(value.updatedAt || new Date(0).toISOString(), 40),
  };
}

export function sanitizeStreamPayload(payload?: Record<string, unknown>) {
  if (!payload) return undefined;
  return JSON.parse(redact(JSON.stringify(payload))) as Record<string, unknown>;
}

export async function createWorkspaceTaskEvent(input: {
  userId: string;
  projectId: string;
  taskId: string;
  sequence: number;
  type: string;
  message: string;
  payload?: Record<string, unknown>;
}) {
  const safeMessage = redact(input.message).slice(0, 800);
  const safePayload = sanitizeStreamPayload(input.payload);
  await prisma.workspaceTaskEvent.create({
    data: {
      userId: input.userId,
      projectId: input.projectId,
      taskId: input.taskId,
      sequence: input.sequence,
      type: input.type,
      message: safeMessage,
      payloadJson: safePayload as Prisma.InputJsonValue,
    },
  });
  return { sequence: input.sequence, type: input.type, message: safeMessage, payload: safePayload } satisfies WorkspaceStreamEvent;
}

export function resolveProjectFile(storagePath: string, filePath = "") {
  const root = path.resolve(storagePath);
  const relative = safeRelative(filePath);
  const absolute = path.resolve(root, relative);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error("Path escapes workspace");
  }
  return { root, relative, absolute };
}

export async function ensureWorkspaceProject(userId: string, name?: string, description = "AI-generated workspace project") {
  const baseName = name?.trim() || "Untitled Workspace";
  const baseSlug = slugify(baseName);
  const isUniqueSlugError = (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002";

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const slug = `${baseSlug}${suffix}`;
    try {
      const project = await prisma.workspaceProject.create({
        data: {
          userId,
          name: baseName,
          slug,
          storagePath: path.join(workspaceStorageRoot(), userId, slug),
          description,
        },
      });
      await mkdir(project.storagePath, { recursive: true });
      return project;
    } catch (error) {
      if (!isUniqueSlugError(error)) throw error;
    }
  }

  const fallbackSlug = `${baseSlug}-${crypto.randomBytes(4).toString("hex")}`;
  const project = await prisma.workspaceProject.create({
    data: {
      userId,
      name: baseName,
      slug: fallbackSlug,
      storagePath: path.join(workspaceStorageRoot(), userId, fallbackSlug),
      description,
    },
  });
  await mkdir(project.storagePath, { recursive: true });
  return project;
}

export async function getOwnedWorkspaceProject(userId: string, projectId: string) {
  const project = await prisma.workspaceProject.findFirst({ where: { id: projectId, userId, deletedAt: null } });
  if (!project) throw new Error("Workspace project not found");
  await mkdir(project.storagePath, { recursive: true });
  return project;
}

export async function listOwnedWorkspaceProjects(userId: string) {
  return prisma.workspaceProject.findMany({
    where: { userId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { files: true, tasks: true } },
      previews: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

async function walkTree(root: string, relativePath = "", options: { includeHidden?: boolean } = {}): Promise<WorkspaceTreeNode[]> {
  const { absolute } = resolveProjectFile(root, relativePath);
  const entries = await readdir(absolute, { withFileTypes: true }).catch(() => []);
  const nodes = await Promise.all(entries
    .filter((entry) => {
      const child = path.join(relativePath, entry.name).split(path.sep).join("/");
      return options.includeHidden || isUserVisibleWorkspaceFile(child);
    })
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .map(async (entry) => {
      const child = path.join(relativePath, entry.name).split(path.sep).join("/");
      const node: WorkspaceTreeNode = {
        name: entry.name,
        path: child,
        type: entry.isDirectory() ? "folder" : "file",
        language: entry.isDirectory() ? undefined : extension(entry.name),
      };
      if (entry.isDirectory()) node.children = await walkTree(root, child, options);
      return node;
    }));
  return nodes;
}

export async function listProjectTree(projectId: string, options: { includeHidden?: boolean } = {}) {
  const project = await prisma.workspaceProject.findFirst({ where: { id: projectId, deletedAt: null } });
  if (!project) throw new Error("Workspace project not found");
  const tree = await walkTree(project.storagePath, "", options);
  const fileRecords = await prisma.workspaceFile.findMany({ where: { projectId, deletedAt: null } });
  const statusMap = new Map(fileRecords.map((file) => [file.path, file.status]));
  const idMap = new Map(fileRecords.map((file) => [file.path, file.id]));
  const applyStatus = (nodes: WorkspaceTreeNode[]): WorkspaceTreeNode[] => nodes.map((node) => ({
    ...node,
    id: node.type === "file" ? idMap.get(node.path) : undefined,
    status: node.type === "file" ? statusMap.get(node.path) || node.status : undefined,
    children: node.children ? applyStatus(node.children) : undefined,
  }));
  return applyStatus(tree);
}

async function memoryStoragePath(projectId: string) {
  const project = await prisma.workspaceProject.findFirst({ where: { id: projectId, deletedAt: null } });
  if (!project) throw new Error("Workspace project not found");
  const dir = path.join(project.storagePath, ".meldex");
  await mkdir(dir, { recursive: true });
  return path.join(dir, "memory.json");
}

export async function readWorkspaceMemorySnapshot(userId: string, projectId: string) {
  const project = await getOwnedWorkspaceProject(userId, projectId);
  const key = `workspace:${project.id}`;
  const context = await prisma.projectContext.findUnique({ where: { userId_projectName: { userId, projectName: key } } });
  const raw = context?.recentEdits && typeof context.recentEdits === "object" ? context.recentEdits : {};
  const memory = normalizeMemory({
    ...(raw as object),
    projectSummary: context?.summary || (raw as WorkspaceMemorySnapshot).projectSummary || "",
    updatedAt: context?.updatedAt?.toISOString() || (raw as WorkspaceMemorySnapshot).updatedAt,
  });
  return { project, key, memory };
}

export function workspaceMemoryPrompt(memory: WorkspaceMemorySnapshot, prompt: string) {
  const lower = prompt.toLowerCase();
  const wantsContinuity = /\b(continue|previous|same|again|restore|yesterday|last|better|fix it|same issue|same style)\b/i.test(prompt);
  const relatedTasks = memory.recentTasks
    .map((task) => ({ task, score: lower.split(/[^a-z0-9]+/).filter((word) => word.length > 3 && task.prompt.toLowerCase().includes(word)).length + (wantsContinuity ? 3 : 0) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.task);
  const lines = [
    memory.projectSummary ? `Project summary: ${memory.projectSummary}` : "",
    memory.architecture.length ? `Architecture: ${memory.architecture.slice(0, 6).join("; ")}` : "",
    memory.designStyle.length ? `Design style: ${memory.designStyle.slice(0, 6).join("; ")}` : "",
    memory.codingStyle.length ? `Coding style: ${memory.codingStyle.slice(0, 6).join("; ")}` : "",
    memory.recentDecisions.length ? `Recent decisions: ${memory.recentDecisions.slice(0, 6).join("; ")}` : "",
    memory.knownIssues.length ? `Known issues: ${memory.knownIssues.slice(0, 5).join("; ")}` : "",
    memory.successfulFixes.length ? `Successful fixes: ${memory.successfulFixes.slice(0, 5).join("; ")}` : "",
    relatedTasks.length ? `Relevant previous tasks: ${relatedTasks.map((task) => `${task.prompt} => ${task.summary}`).join(" | ")}` : "",
    memory.lastSuccessfulCommands.length ? `Last successful commands: ${memory.lastSuccessfulCommands.slice(0, 4).join("; ")}` : "",
  ].filter(Boolean).join("\n");
  return {
    snippet: lines ? `[Relevant Workspace Memory]\n${lines.slice(0, 2600)}` : "",
    relatedTaskCount: relatedTasks.length,
    reusedStyle: memory.designStyle.length > 0 || memory.codingStyle.length > 0,
    avoidedIssue: memory.knownIssues.length > 0,
  };
}

export async function updateWorkspaceMemorySnapshot(input: {
  userId: string;
  projectId: string;
  prompt: string;
  summary: string;
  plan: string[];
  changedFiles: Array<{ path: string; operation: string; added: number; removed: number; description?: string }>;
  qualityScore: number;
  verification?: { verified?: boolean; message?: string; url?: string };
  status: string;
  errors?: string[];
  fixes?: string[];
  commands?: string[];
}) {
  const { project, key, memory } = await readWorkspaceMemorySnapshot(input.userId, input.projectId);
  const filesChanged = uniqueLimit(input.changedFiles.map((file) => file.path), 24);
  const architecture = uniqueLimit([
    project.name ? `Workspace ${project.name}` : "",
    filesChanged.some((file) => file.endsWith(".html")) ? "Static HTML workspace" : "",
    filesChanged.some((file) => file.endsWith(".tsx") || file.endsWith(".jsx")) ? "Component-based frontend" : "",
    ...memory.architecture,
  ], 20);
  const designStyle = uniqueLimit([
    ...input.plan.filter((step) => /style|design|responsive|theme|layout|visual/i.test(step)),
    ...input.changedFiles.map((file) => file.description || "").filter((text) => /style|design|layout|responsive|animation/i.test(text)),
    ...memory.designStyle,
  ], 16);
  const codingStyle = uniqueLimit([
    ...input.plan.filter((step) => /component|helper|validation|clean|structure|reuse/i.test(step)),
    ...memory.codingStyle,
  ], 16);
  const next = normalizeMemory({
    ...memory,
    projectSummary: safeMemoryText(input.summary || memory.projectSummary || `Workspace ${project.name}`, 1000),
    architecture,
    recentTasks: [{
      prompt: input.prompt,
      summary: input.summary,
      status: input.status,
      qualityScore: input.qualityScore,
      filesChanged,
      createdAt: new Date().toISOString(),
    }, ...memory.recentTasks].slice(0, 8),
    recentDecisions: uniqueLimit([
      ...input.plan.map((step) => `Planned: ${step}`),
      ...memory.recentDecisions,
    ], 20),
    knownIssues: uniqueLimit([...(input.errors || []), ...(input.verification?.verified ? [] : [input.verification?.message || "Preview not verified"]), ...memory.knownIssues], 20),
    successfulFixes: uniqueLimit([...(input.fixes || []), ...(input.status === "SUCCEEDED" ? [`Completed: ${input.summary}`] : []), ...memory.successfulFixes], 20),
    codingStyle,
    designStyle,
    lastSuccessfulCommands: uniqueLimit([...(input.commands || []), ...(input.verification?.verified ? ["static-preview-verify"] : []), ...memory.lastSuccessfulCommands], 12),
    activePreviewCommand: "static-preview-verify",
    updatedAt: new Date().toISOString(),
  });
  await prisma.projectContext.upsert({
    where: { userId_projectName: { userId: input.userId, projectName: key } },
    create: {
      userId: input.userId,
      projectName: key,
      summary: next.projectSummary,
      recentFiles: filesChanged as Prisma.InputJsonValue,
      recentEdits: next as unknown as Prisma.InputJsonValue,
      lastActive: new Date(),
    },
    update: {
      summary: next.projectSummary,
      recentFiles: filesChanged as Prisma.InputJsonValue,
      recentEdits: next as unknown as Prisma.InputJsonValue,
      lastActive: new Date(),
    },
  });
  await writeFile(await memoryStoragePath(input.projectId), JSON.stringify(next, null, 2), "utf8").catch(() => undefined);
  return next;
}

export async function readProjectFile(userId: string, projectId: string, filePath: string) {
  const project = await getOwnedWorkspaceProject(userId, projectId);
  const { absolute } = resolveProjectFile(project.storagePath, filePath);
  const fileStat = await stat(absolute);
  if (!fileStat.isFile()) throw new Error("Requested path is not a file");
  return readFile(absolute, "utf8");
}

export async function syncWorkspaceFile(userId: string, projectId: string, filePath: string, content: string, status = "UNCHANGED") {
  await prisma.workspaceFile.upsert({
    where: { projectId_path: { projectId, path: filePath } },
    create: {
      userId,
      projectId,
      path: filePath,
      status,
      language: extension(filePath),
      sizeBytes: Buffer.byteLength(content),
      contentHash: hash(content),
      changed: status !== "UNCHANGED",
    },
    update: {
      status,
      language: extension(filePath),
      sizeBytes: Buffer.byteLength(content),
      contentHash: hash(content),
      changed: status !== "UNCHANGED",
      deletedAt: null,
    },
  });
}

export async function writeProjectFile(userId: string, projectId: string, filePath: string, content: string, status = "EDITED") {
  const project = await getOwnedWorkspaceProject(userId, projectId);
  const { absolute, relative } = resolveProjectFile(project.storagePath, filePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
  await syncWorkspaceFile(userId, projectId, relative, content, status);
  return relative;
}

export async function deleteProjectFile(userId: string, projectId: string, filePath: string) {
  const project = await getOwnedWorkspaceProject(userId, projectId);
  const { absolute, relative } = resolveProjectFile(project.storagePath, filePath);
  await rm(absolute, { recursive: true, force: true });
  await prisma.workspaceFile.updateMany({ where: { userId, projectId, path: relative }, data: { status: "DELETED", changed: true, deletedAt: new Date() } });
  return relative;
}

async function listPhysicalFiles(storagePath: string) {
  const files: string[] = [];
  const visit = async (relativePath = "") => {
    const { absolute } = resolveProjectFile(storagePath, relativePath);
    const entries = await readdir(absolute, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name === ".DS_Store" || entry.name === ".meldex") continue;
      const child = path.join(relativePath, entry.name).split(path.sep).join("/");
      if (entry.isDirectory()) await visit(child);
      else files.push(child);
    }
  };
  await visit();
  return files;
}

export async function findStaticPreviewEntry(storagePath: string) {
  const files = await listPhysicalFiles(storagePath);
  if (files.includes("index.html")) return "index.html";
  return files
    .filter((filePath) => filePath.toLowerCase().endsWith(".html"))
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))[0] || null;
}

export function normalizeWorkspaceFileActions(files: WorkspaceFileAction[], prompt = "") {
  const normalizedFiles: WorkspaceFileAction[] = files
    .map((file) => ({
      ...file,
      operation: file.operation || "create",
      path: safeRelative(file.path || ""),
      content: file.operation === "delete" ? file.content : decodeGeneratedContent(file.content),
    }))
    .filter((file) => file.path);
  const isStatic = isStaticWebsitePrompt(prompt);
  const hasIndex = normalizedFiles.some((file) => file.path.toLowerCase() === "index.html");
  if (!isStatic) return normalizedFiles;

  let normalizedEntry = false;
  let nextFiles: WorkspaceFileAction[] = normalizedFiles.map((file) => {
    const relative = file.path;
    const isHtml = relative.toLowerCase().endsWith(".html");
    const isPlaceholderPath = /^relative\/path\/[^/]+\.html$/i.test(relative);
    const isLikelyStaticEntry = !hasIndex && isHtml && !normalizedEntry && (isPlaceholderPath || normalizedFiles.filter((item) => item.path.toLowerCase().endsWith(".html")).length === 1);

    if (!isLikelyStaticEntry) return { ...file, path: relative };
    normalizedEntry = true;
    return {
      ...file,
      path: "index.html",
      description: file.description || `Normalized ${relative} to static preview entry`,
    };
  });
  const html = nextFiles.find((file) => file.path === "index.html" && file.operation !== "delete");
  const invalidHtml = !html?.content ||
    !/<!doctype html|<html[\s>]/i.test(html.content) ||
    looksLikeRawModelDump(html.content) ||
    hasUnresolvedTemplatePlaceholder(html.content);

  if (invalidHtml) return staticFallbackFiles(prompt, "invalid or missing HTML entry");

  let htmlContent = html.content || "";
  htmlContent = htmlContent
    .replace(/href=["'](?:\.\/)?style\.css["']/i, 'href="./style.css"')
    .replace(/src=["'](?:\.\/)?script\.js["']/i, 'src="./script.js"');
  if (!/href=["']\.\/style\.css["']/i.test(htmlContent)) {
    htmlContent = htmlContent.replace(/<\/head>/i, '  <link rel="stylesheet" href="./style.css">\n</head>');
  }
  if (!/src=["']\.\/script\.js["']/i.test(htmlContent)) {
    htmlContent = htmlContent.replace(/<\/body>/i, '  <script src="./script.js"></script>\n</body>');
  }
  nextFiles = nextFiles.map((file) => file.path === "index.html" ? { ...file, content: htmlContent } : file);

  const hasCss = nextFiles.some((file) => file.path === "style.css" && file.operation !== "delete" && file.content && !looksLikeRawModelDump(file.content) && !hasUnresolvedTemplatePlaceholder(file.content));
  const hasJs = nextFiles.some((file) => file.path === "script.js" && file.operation !== "delete" && file.content && !looksLikeRawModelDump(file.content) && !hasUnresolvedTemplatePlaceholder(file.content));
  const fallback = staticFallbackFiles(prompt, "missing required static asset");
  if (!hasCss) nextFiles.push(fallback.find((file) => file.path === "style.css")!);
  if (!hasJs) nextFiles.push(fallback.find((file) => file.path === "script.js")!);

  const invalidContent = nextFiles.some((file) =>
    file.operation !== "delete" &&
    /\.(html|css|js)$/i.test(file.path) &&
    (looksLikeRawModelDump(file.content || "") || hasUnresolvedTemplatePlaceholder(file.content || ""))
  );
  return invalidContent ? staticFallbackFiles(prompt, "raw model dump or unresolved placeholder detected") : nextFiles;
}

export function validateStaticPreviewContent(html: string, linkedAssets: string[], existingAssets: Set<string>) {
  const issues: string[] = [];
  const trimmed = html.trim();
  if (!/<!doctype html|<html[\s>]/i.test(trimmed)) issues.push("HTML entry must contain <!doctype html> or <html.");
  if (/^[{[]/.test(trimmed)) issues.push("HTML entry looks like raw JSON/model output.");
  if ((trimmed.match(/\\n/g) || []).length > 8) issues.push("HTML entry contains raw escaped newline spam.");
  if (hasUnresolvedTemplatePlaceholder(trimmed)) issues.push("HTML entry contains unresolved template placeholders.");
  if (/"plan"\s*:|"files"\s*:|"summary"\s*:/.test(trimmed.slice(0, 2000))) issues.push("HTML entry contains model plan JSON.");
  const cssAssets = linkedAssets.filter((asset) => /\.css(?:$|[?#])/i.test(asset));
  const jsAssets = linkedAssets.filter((asset) => /\.js(?:$|[?#])/i.test(asset));
  if (!cssAssets.length) issues.push("HTML entry must link a CSS asset.");
  if (existingAssets.has("script.js") && !jsAssets.length) issues.push("HTML entry must load script.js when it exists.");
  if (existingAssets.has("style.css") && !cssAssets.some((asset) => asset.replace(/^\.\//, "") === "style.css")) issues.push("HTML entry must link ./style.css.");
  return { valid: issues.length === 0, issues };
}

export async function createWorkspaceSnapshot(userId: string, projectId: string, taskId?: string, label = "before-task") {
  const project = await getOwnedWorkspaceProject(userId, projectId);
  const files = await listPhysicalFiles(project.storagePath);
  const snapshotFiles = await Promise.all(files.map(async (filePath) => ({
    path: filePath,
    content: await readFile(resolveProjectFile(project.storagePath, filePath).absolute, "utf8").catch(() => ""),
    contentHash: await readFile(resolveProjectFile(project.storagePath, filePath).absolute, "utf8").then(hash).catch(() => null),
  })));
  return prisma.workspaceSnapshot.create({
    data: {
      userId,
      projectId,
      taskId,
      label,
      fileCount: snapshotFiles.length,
      snapshotJson: { files: snapshotFiles } as Prisma.InputJsonValue,
    },
  });
}

export async function restoreWorkspaceSnapshot(userId: string, projectId: string, snapshotId: string) {
  const project = await getOwnedWorkspaceProject(userId, projectId);
  const snapshot = await prisma.workspaceSnapshot.findFirst({ where: { id: snapshotId, userId, projectId } });
  if (!snapshot) throw new Error("Workspace snapshot not found");
  const raw = snapshot.snapshotJson as { files?: Array<{ path: string; content?: string }> };
  const snapshotFiles = raw.files || [];
  const snapshotPathSet = new Set(snapshotFiles.map((file) => safeRelative(file.path)));
  const currentFiles = await listPhysicalFiles(project.storagePath);

  for (const current of currentFiles) {
    if (!snapshotPathSet.has(current)) await deleteProjectFile(userId, projectId, current);
  }
  for (const file of snapshotFiles) {
    await writeProjectFile(userId, projectId, file.path, file.content || "", "ROLLED_BACK");
  }
  return { snapshot, restoredFiles: snapshotFiles.length };
}

export async function verifyStaticPreview(userId: string, projectId: string) {
  const project = await getOwnedWorkspaceProject(userId, projectId);
  const entry = await findStaticPreviewEntry(project.storagePath);
  let html = "";
  if (!entry) {
    return { verified: false, httpStatus: 404, message: "No HTML preview entry found", url: `/api/workspaces/${projectId}/preview` };
  }
  try {
    html = await readFile(resolveProjectFile(project.storagePath, entry).absolute, "utf8");
  } catch {
    return { verified: false, httpStatus: 404, message: `${entry} not found`, url: `/api/workspaces/${projectId}/preview` };
  }
  const hasHtml = /<!doctype html|<html|<body/i.test(html);
  const linkedAssets = [...html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((asset) => !asset.startsWith("http") && !asset.startsWith("#") && !asset.startsWith("data:"));
  const physicalFiles = await listPhysicalFiles(project.storagePath);
  const existingAssets = new Set(physicalFiles);
  const contentValidation = validateStaticPreviewContent(html, linkedAssets, existingAssets);
  const missing: string[] = [];
  const entryDir = path.posix.dirname(entry);
  for (const asset of linkedAssets) {
    const assetPath = asset.startsWith("/")
      ? safeRelative(asset.replace(/^\//, ""))
      : safeRelative(path.posix.join(entryDir === "." ? "" : entryDir, asset));
    try {
      const assetAbsolute = resolveProjectFile(project.storagePath, assetPath).absolute;
      await stat(assetAbsolute);
      if (/\.(css|js)$/i.test(assetPath)) {
        const assetContent = await readFile(assetAbsolute, "utf8").catch(() => "");
        if (looksLikeRawModelDump(assetContent) || hasUnresolvedTemplatePlaceholder(assetContent)) {
          missing.push(`${asset} invalid`);
        }
      }
    } catch {
      missing.push(asset);
    }
  }
  const previewUrl = entry === "index.html" ? `/api/workspaces/${projectId}/preview` : `/api/workspaces/${projectId}/preview?file=${encodeURIComponent(entry)}`;
  const verified = hasHtml && missing.length === 0 && contentValidation.valid;
  const failureDetails = [...contentValidation.issues, ...(missing.length ? [`missing or invalid assets: ${missing.join(", ")}`] : [])];
  return {
    verified,
    httpStatus: hasHtml ? 200 : 422,
    message: verified ? "HTTP 200 verified. HTML and linked assets loaded." : `Preview render validation failed: ${failureDetails.join(" ") || "invalid HTML"}.`,
    url: previewUrl,
    issues: failureDetails,
  };
}

export async function buildWorkspaceContext(projectId: string, storagePath: string, userId?: string, prompt = "") {
  const tree = await walkTree(storagePath);
  const files: string[] = [];
  const flatten = (nodes: WorkspaceTreeNode[]) => {
    for (const node of nodes) {
      if (node.type === "file") files.push(node.path);
      if (node.children) flatten(node.children);
    }
  };
  flatten(tree);
  const relevant = await Promise.all(files.slice(0, 12).map(async (filePath) => {
    try {
      const content = await readFile(resolveProjectFile(storagePath, filePath).absolute, "utf8");
      return { path: filePath, content: content.slice(0, 6000) };
    } catch {
      return { path: filePath, content: "" };
    }
  }));
  const memory = userId ? (await readWorkspaceMemorySnapshot(userId, projectId).catch(() => null))?.memory : undefined;
  const memoryContext = memory ? workspaceMemoryPrompt(memory, prompt) : { snippet: "", relatedTaskCount: 0, reusedStyle: false, avoidedIssue: false };
  return { projectId, projectFiles: files.slice(0, 80), relevantFiles: relevant, memory, memoryContext };
}

function parseNestedWorkspaceResponse(value: unknown, depth = 0): WorkspaceAgentResponse | null {
  if (depth > 2 || typeof value !== "string") return null;
  const text = value.trim();
  if (!text || !/[{[]/.test(text)) return null;
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last <= first) return null;
  try {
    const parsed = coerceWorkspaceAgentResponse(JSON.parse(text.slice(first, last + 1)), depth + 1);
    return parsed.files?.length ? parsed : null;
  } catch {
    return null;
  }
}

function coerceWorkspaceAgentResponse(value: unknown, depth = 0): WorkspaceAgentResponse {
  const raw = (value || {}) as {
    plan?: unknown;
    files?: unknown;
    commands?: unknown;
    summary?: unknown;
    warnings?: unknown;
    result?: unknown;
    output?: unknown;
    content?: unknown;
    message?: unknown;
  };
  const files = Array.isArray(raw.files) ? raw.files.map((item) => {
    const file = (item || {}) as Record<string, unknown>;
    return {
      operation: file.operation === "delete" ? "delete" : file.operation === "edit" ? "edit" : "create",
      path: String(file.path || file.file || file.filename || ""),
      content: decodeGeneratedContent(file.content ?? file.body ?? file.code ?? ""),
      description: typeof file.description === "string" ? file.description : undefined,
    } satisfies WorkspaceFileAction;
  }).filter((file) => file.path) : [];
  if (!files.length && depth < 2) {
    const nested = [raw.summary, raw.result, raw.output, raw.content, raw.message]
      .map((item) => parseNestedWorkspaceResponse(item, depth))
      .find((item): item is WorkspaceAgentResponse => Boolean(item?.files?.length));
    if (nested) return nested;
  }

  return {
    plan: Array.isArray(raw.plan) ? raw.plan.map((item) => String(item)).slice(0, 10) : undefined,
    files,
    commands: Array.isArray(raw.commands) ? raw.commands.map((item) => String(item)).slice(0, 8) : undefined,
    summary: typeof raw.summary === "string" ? safeMemoryText(raw.summary, 600) : undefined,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map((item) => safeMemoryText(String(item), 240)).slice(0, 8) : undefined,
  };
}

function parseAgentJson(raw: string): WorkspaceAgentResponse {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || trimmed).trim();
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first === -1 || last <= first) return parseLooseWorkspaceResponse(raw);
  try {
    const parsed = coerceWorkspaceAgentResponse(JSON.parse(candidate.slice(first, last + 1)));
    return parsed.files?.length ? parsed : parseLooseWorkspaceResponse(raw);
  } catch {
    return parseLooseWorkspaceResponse(raw);
  }
}

function extractFence(raw: string, language: string) {
  const pattern = new RegExp(`\\\`\\\`\\\`${language}\\\\s*([\\\\s\\\\S]*?)\\\`\\\`\\\``, "i");
  return raw.match(pattern)?.[1]?.trim();
}

function parseLooseWorkspaceResponse(raw: string): WorkspaceAgentResponse {
  const html = extractFence(raw, "html") || (/<!doctype html|<html[\s>]/i.test(raw) && !looksLikeRawModelDump(raw) ? raw.trim() : "");
  const css = extractFence(raw, "css");
  const js = extractFence(raw, "js|javascript");
  const files: WorkspaceFileAction[] = [];

  if (html) {
    files.push({
      operation: "create",
      path: "index.html",
      content: decodeGeneratedContent(html),
      description: "HTML generated from non-JSON model response",
    });
  }
  if (css) {
    files.push({
      operation: "create",
      path: "style.css",
      content: decodeGeneratedContent(css),
      description: "CSS generated from non-JSON model response",
    });
  }
  if (js) {
    files.push({
      operation: "create",
      path: "script.js",
      content: decodeGeneratedContent(js),
      description: "JavaScript generated from non-JSON model response",
    });
  }

  if (files.length) {
    return {
      plan: ["Read model response", "Recovered generated files", "Verify preview"],
      files,
      commands: ["static-preview-verify"],
      summary: "Recovered usable workspace files from the model response.",
      warnings: ["Model returned loose code instead of strict JSON."],
    };
  }

  return { plan: ["Read model response"], files: [], commands: [], summary: raw };
}

export async function askWorkspaceAgent(prompt: string, context: Awaited<ReturnType<typeof buildWorkspaceContext>>, orchestrationInstruction = "", runtime?: { userId?: string; taskType?: string }) {
  const websiteDesignerRules = isStaticWebsitePrompt(prompt) ? `
Website Designer Agent V2:
- Do not generate code immediately. Internally run intent detection, website category detection, visual designer, UX planner, layout planner, section planner, animation planner, color palette planner, typography planner, component planner, responsive planner, accessibility planner, code generation, self review, visual quality review, preview readiness, and improve if needed.
- Detect category internally from Restaurant, Hotel, Cafe, Portfolio, Agency, AI Startup, SaaS, E-commerce, Landing Page, Corporate, Healthcare, Education, Finance, Travel, Event, Photography, Construction, Real Estate, Gaming, Developer Tool, Open Source, Admin Dashboard, Blog, Documentation.
- Give every website a distinct design system: palette, typography, spacing, radius, buttons, cards, shadows, icons, animation language.
- Never return only a centered heading, paragraph, button, and footer. Use complete sections for the category.
- Restaurant: hero, menu, popular items, chef, gallery, testimonials, location, contact, reservation CTA, footer.
- SaaS: hero, features, how it works, integrations, pricing, testimonials, FAQ, CTA, footer.
- Portfolio: hero, projects, skills, experience, testimonials, contact, footer.
- For animated/modern/beautiful/premium/creative prompts, include tasteful IntersectionObserver reveals, hover motion, smooth scrolling, gradient/glass effects, responsive grids, and reduced-motion support.
- Static website tasks must remain dependency-free unless explicitly asked: create index.html, style.css, script.js, README.md.
- Internal visual score must be 90+ for hierarchy, spacing, typography, responsiveness, animation, color, component quality, completeness, and accessibility before returning.` : "";
  const system = `You are Meldex AI Workspace Agent powered by Qwen3-Coder.
Return JSON only:
{
  "plan": ["step"],
  "files": [{"operation":"create|edit|delete","path":"relative/path","content":"full final content","description":"brief"}],
  "commands": ["safe validation or preview command"],
  "summary": "short final summary",
  "warnings": []
}
Rules: use relative paths, avoid secrets, do not add dependencies for static HTML, prefer minimal patches, and create complete working files.
Coding Engine V2:
- Internally run: understand request, detect project type, detect framework, plan architecture, plan files, plan reusable components, plan state/data flow, generate code, self-review, run checks, fix errors, refactor if needed, verify final output.
- Before coding decide folder structure, components, utilities, data model, API routes, validation, state management, styling approach, and testing approach.
- Static sites must remain dependency-free unless explicitly requested and should use index.html, style.css, script.js, README.md.
- React/Vite must use correct main entry, component imports, CSS import, and no Next-only APIs.
- Next.js must follow existing app/pages router conventions, server/client boundaries, metadata, imports, and route placement.
- Backend tasks should use routes/controllers/services/middleware/validators/utils when creating new structure, with validation, error handling, status codes, and safe defaults.
- Use reusable components/constants/helpers, clean names, small functions, and separation of concerns. Avoid giant files, repeated code, fake imports, unused imports, placeholder TODOs, broken paths, and duplicate logic.
- Do not add dependencies unless necessary and already present; if required, explain in warnings.
- README for generated projects must include what was built, how to run, file structure, preview command, and next steps.
- Internal coding quality score must be 85+ before returning.
${websiteDesignerRules}`;

  const fileContext = context.relevantFiles.map((file) => `### ${file.path}\n\`\`\`\n${file.content}\n\`\`\``).join("\n\n");
  const completion = await generateChatCompletionWithUsage({
    temperature: 0.2,
    maxTokens: 8192,
    timeoutMs: 120_000,
    userId: runtime?.userId,
    taskType: runtime?.taskType || "workspace_agent",
    messages: [
      { role: "system", content: [system, orchestrationInstruction].filter(Boolean).join("\n\n") },
      { role: "user", content: `Task:\n${prompt}\n\n${orchestrationInstruction ? `Runtime orchestration instruction:\n${orchestrationInstruction}\n\n` : ""}Project files:\n${context.projectFiles.join("\n") || "(empty)"}\n\n${context.memoryContext?.snippet || ""}\n\nRelevant context:\n${fileContext || "(empty workspace)"}` },
    ],
  });
  return {
    ...parseAgentJson(completion.content),
    usage: completion.usage,
    provider: completion.provider,
    model: completion.model,
    rawContent: completion.content,
  };
}

export function classifyWorkspaceProviderFailure(error: unknown, prompt = ""): WorkspaceProviderFailure {
  const safe = toSafeProviderError(error);
  const lower = `${safe.code} ${safe.reason} ${safe.userMessage}`.toLowerCase();
  const kind: WorkspaceProviderFailure["kind"] =
    lower.includes("credit") || lower.includes("balance") || lower.includes("402") ? "credits" :
    lower.includes("timeout") ? "timeout" :
    lower.includes("rate") || lower.includes("429") ? "rate_limit" :
    lower.includes("api key") || lower.includes("access") || lower.includes("401") || lower.includes("403") ? "auth" :
    lower.includes("network") || lower.includes("unavailable") || lower.includes("provider") ? "unavailable" :
    "unknown";
  return {
    kind,
    code: safe.code,
    reason: safe.reason,
    userMessage: safe.userMessage,
    retryAfter: safe.retryAfter,
    offlineAvailable: isStaticWebsitePrompt(prompt),
  };
}

export function isStaticWebsitePrompt(prompt: string) {
  return /\b(website|landing|portfolio|pricing|contact|static|html|page|site)\b/i.test(prompt);
}

export function offlineStaticWorkspace(prompt: string): WorkspaceAgentResponse {
  const title = prompt.match(/(?:create|build|make)\s+(?:a\s+|an\s+)?([^,.]+)/i)?.[1]?.trim() || "Meldex Website";
  return {
    plan: [
      "Provider unavailable, switching to Offline Workspace Mode",
      "Create a dependency-free static project",
      "Add starter HTML, CSS, and JavaScript",
      "Verify static preview so work can continue later",
    ],
    files: [
      {
        operation: "create",
        path: "index.html",
        description: "Offline starter website markup",
        content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="#">Meldex</a>
    <nav aria-label="Primary">
      <a href="#features">Features</a>
      <a href="#contact">Contact</a>
    </nav>
  </header>
  <main>
    <section class="hero">
      <p class="eyebrow">Offline Workspace Mode</p>
      <h1>${title}</h1>
      <p class="lede">The AI provider is temporarily unavailable, so Meldex created a clean static starter you can preview and improve later.</p>
      <div class="actions">
        <a class="button primary" href="#contact">Get started</a>
        <a class="button" href="#features">View features</a>
      </div>
    </section>
    <section id="features" class="features">
      <article><h2>Fast start</h2><p>Starter files are ready without external dependencies.</p></article>
      <article><h2>Live preview</h2><p>The page can be verified immediately in the workspace preview.</p></article>
      <article><h2>Continue later</h2><p>When the provider returns, ask Meldex to refine or expand this project.</p></article>
    </section>
    <section id="contact" class="contact">
      <h2>Contact</h2>
      <form>
        <label>Name <input name="name" autocomplete="name"></label>
        <label>Email <input name="email" type="email" autocomplete="email"></label>
        <label>Message <textarea name="message"></textarea></label>
        <button type="submit">Send message</button>
      </form>
    </section>
  </main>
  <footer>Created by Meldex Offline Workspace Mode.</footer>
  <script src="script.js"></script>
</body>
</html>
`,
      },
      {
        operation: "create",
        path: "style.css",
        description: "Offline starter responsive styling",
        content: `:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --text: #18181b;
  --muted: #71717a;
  --surface: #f4f4f5;
  --border: #e4e4e7;
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
  padding: 0 28px;
  border-bottom: 1px solid var(--border);
}
.brand, nav a { color: inherit; text-decoration: none; }
.brand { font-weight: 800; }
nav { display: flex; gap: 18px; color: var(--muted); font-size: 14px; }
.hero { max-width: 920px; margin: 0 auto; padding: 92px 24px 64px; text-align: center; }
.eyebrow { margin: 0; color: var(--accent); font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
h1 { margin: 14px 0; font-size: clamp(40px, 7vw, 78px); line-height: 1; }
.lede { max-width: 680px; margin: 0 auto; color: var(--muted); font-size: 18px; line-height: 1.7; }
.actions { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; margin-top: 28px; }
.button, form button {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 16px;
  color: inherit;
  text-decoration: none;
  font-weight: 700;
  background: transparent;
}
.button.primary, form button { background: var(--accent); border-color: var(--accent); color: white; }
.features {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 24px 64px;
}
article, .contact {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 8px;
  padding: 24px;
}
article p { color: var(--muted); line-height: 1.6; }
.contact { max-width: 720px; margin: 0 auto 64px; }
form { display: grid; gap: 12px; }
label { display: grid; gap: 6px; color: var(--muted); font-size: 14px; }
input, textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  padding: 11px 12px;
  font: inherit;
}
textarea { min-height: 110px; resize: vertical; }
footer { border-top: 1px solid var(--border); padding: 24px; text-align: center; color: var(--muted); }
@media (prefers-color-scheme: dark) {
  :root { --bg: #09090b; --text: #fafafa; --muted: #a1a1aa; --surface: #18181b; --border: #27272a; --accent: #60a5fa; }
}
@media (max-width: 760px) {
  nav { display: none; }
  .features { grid-template-columns: 1fr; }
}
`,
      },
      {
        operation: "create",
        path: "script.js",
        description: "Offline starter interactions",
        content: `document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = document.querySelector(link.getAttribute("href"));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

document.querySelector("form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  alert("Offline starter form ready. Connect this when AI provider is available.");
});
`,
      },
      {
        operation: "create",
        path: "README.md",
        description: "Offline mode project note",
        content: `# ${title}

Created in Meldex Offline Workspace Mode because the AI provider was unavailable.

## Files

- \`index.html\`
- \`style.css\`
- \`script.js\`

When the provider returns, ask Meldex to continue from this project.
`,
      },
    ],
    commands: ["static-preview-verify"],
    summary: "Offline Workspace Mode created a static starter project and verified the preview.",
    warnings: ["AI provider was unavailable; this starter can be improved when the provider returns."],
  };
}

export function providerErrorResponse(error: unknown) {
  if (error instanceof ModelRouterError) {
    const safe = toSafeProviderError(error);
    return { status: modelErrorStatus(safe.code, safe.statusCode), body: { error: safe.userMessage, providerError: safe } };
  }
  return { status: 500, body: { error: error instanceof Error ? error.message : "Workspace agent failed" } };
}

export { countDiff };
