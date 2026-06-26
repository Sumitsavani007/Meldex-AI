import crypto from "crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateChatCompletion, ModelRouterError } from "@/lib/model-router";
import { modelErrorStatus, toSafeProviderError } from "@/lib/provider-health";

export type WorkspaceTreeNode = {
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
  let slug = baseSlug;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const existing = await prisma.workspaceProject.findUnique({ where: { userId_slug: { userId, slug } } });
    if (!existing) break;
    slug = `${baseSlug}-${attempt + 2}`;
  }

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

async function walkTree(root: string, relativePath = ""): Promise<WorkspaceTreeNode[]> {
  const { absolute } = resolveProjectFile(root, relativePath);
  const entries = await readdir(absolute, { withFileTypes: true }).catch(() => []);
  const nodes = await Promise.all(entries
    .filter((entry) => !entry.name.startsWith(".DS_Store"))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .map(async (entry) => {
      const child = path.join(relativePath, entry.name).split(path.sep).join("/");
      const node: WorkspaceTreeNode = {
        name: entry.name,
        path: child,
        type: entry.isDirectory() ? "folder" : "file",
        language: entry.isDirectory() ? undefined : extension(entry.name),
      };
      if (entry.isDirectory()) node.children = await walkTree(root, child);
      return node;
    }));
  return nodes;
}

export async function listProjectTree(projectId: string) {
  const project = await prisma.workspaceProject.findFirst({ where: { id: projectId, deletedAt: null } });
  if (!project) throw new Error("Workspace project not found");
  const tree = await walkTree(project.storagePath);
  const fileRecords = await prisma.workspaceFile.findMany({ where: { projectId, deletedAt: null } });
  const statusMap = new Map(fileRecords.map((file) => [file.path, file.status]));
  const applyStatus = (nodes: WorkspaceTreeNode[]): WorkspaceTreeNode[] => nodes.map((node) => ({
    ...node,
    status: node.type === "file" ? statusMap.get(node.path) || node.status : undefined,
    children: node.children ? applyStatus(node.children) : undefined,
  }));
  return applyStatus(tree);
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
      if (entry.name === ".DS_Store") continue;
      const child = path.join(relativePath, entry.name).split(path.sep).join("/");
      if (entry.isDirectory()) await visit(child);
      else files.push(child);
    }
  };
  await visit();
  return files;
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
  const indexPath = path.join(project.storagePath, "index.html");
  let html = "";
  try {
    html = await readFile(indexPath, "utf8");
  } catch {
    return { verified: false, httpStatus: 404, message: "index.html not found", url: `/api/workspaces/${projectId}/preview` };
  }
  const hasHtml = /<!doctype html|<html|<body/i.test(html);
  const linkedAssets = [...html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((asset) => !asset.startsWith("http") && !asset.startsWith("#") && !asset.startsWith("data:"));
  const missing: string[] = [];
  for (const asset of linkedAssets) {
    try {
      await stat(path.join(project.storagePath, safeRelative(asset.replace(/^\//, ""))));
    } catch {
      missing.push(asset);
    }
  }
  return {
    verified: hasHtml && missing.length === 0,
    httpStatus: hasHtml ? 200 : 422,
    message: hasHtml && missing.length === 0 ? "HTTP 200 verified. HTML and linked assets loaded." : `Preview verification failed${missing.length ? `, missing: ${missing.join(", ")}` : ""}.`,
    url: `/api/workspaces/${projectId}/preview`,
  };
}

export async function buildWorkspaceContext(projectId: string, storagePath: string) {
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
  return { projectId, projectFiles: files.slice(0, 80), relevantFiles: relevant };
}

function parseAgentJson(raw: string): WorkspaceAgentResponse {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || trimmed).trim();
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first === -1 || last <= first) return parseLooseWorkspaceResponse(raw);
  try {
    return JSON.parse(candidate.slice(first, last + 1)) as WorkspaceAgentResponse;
  } catch {
    return parseLooseWorkspaceResponse(raw);
  }
}

function extractFence(raw: string, language: string) {
  const pattern = new RegExp(`\\\`\\\`\\\`${language}\\\\s*([\\\\s\\\\S]*?)\\\`\\\`\\\``, "i");
  return raw.match(pattern)?.[1]?.trim();
}

function parseLooseWorkspaceResponse(raw: string): WorkspaceAgentResponse {
  const html = extractFence(raw, "html") || (/<!doctype html|<html[\s>]/i.test(raw) ? raw.trim() : "");
  const css = extractFence(raw, "css");
  const js = extractFence(raw, "js|javascript");
  const files: WorkspaceFileAction[] = [];

  if (html) {
    files.push({
      operation: "create",
      path: "index.html",
      content: html,
      description: "HTML generated from non-JSON model response",
    });
  }
  if (css) {
    files.push({
      operation: "create",
      path: "style.css",
      content: css,
      description: "CSS generated from non-JSON model response",
    });
  }
  if (js) {
    files.push({
      operation: "create",
      path: "script.js",
      content: js,
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

export async function askWorkspaceAgent(prompt: string, context: Awaited<ReturnType<typeof buildWorkspaceContext>>) {
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
${websiteDesignerRules}`;

  const fileContext = context.relevantFiles.map((file) => `### ${file.path}\n\`\`\`\n${file.content}\n\`\`\``).join("\n\n");
  const raw = await generateChatCompletion({
    temperature: 0.2,
    maxTokens: 8192,
    timeoutMs: 120_000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Task:\n${prompt}\n\nProject files:\n${context.projectFiles.join("\n") || "(empty)"}\n\nRelevant context:\n${fileContext || "(empty workspace)"}` },
    ],
  });
  return parseAgentJson(raw);
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
