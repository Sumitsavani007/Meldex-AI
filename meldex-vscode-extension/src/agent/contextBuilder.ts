import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { WorkspaceCtx } from "../api/client";
import { WorkspaceContext } from "../context/workspace";

export interface BuiltContext {
  context: WorkspaceCtx;
  summary: string;
  relevantFiles: Array<{ path: string; content: string; score: number }>;
  projectType: string;
  packageManager: string;
}

const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "vendor", ".turbo", "coverage", "out"]);
const SECRET_RE = /(^|[\\/])\.env(\.|$)|secret|credential|private[-_]?key/i;

export class ContextBuilder {
  private static cache = new Map<string, { mtime: number; files: string[]; summary: string }>();

  static async build(root: string, task: string, maxFiles: number): Promise<BuiltContext> {
    const base = await WorkspaceContext.gather(maxFiles);
    const projectType = WorkspaceContext.detectProjectType(root);
    const packageManager = WorkspaceContext.detectPackageManager(root);
    const packageJson = WorkspaceContext.readPackageJson(root);
    const files = await this.indexFiles(root, maxFiles * 8);
    const relevantPaths = this.selectRelevantFiles(task, files, base.activeFile, packageJson).slice(0, maxFiles);
    const relevantFiles = await Promise.all(relevantPaths.map(async (rel) => ({
      path: rel,
      content: await this.readSummarized(root, rel),
      score: this.scoreFile(task, rel, base.activeFile),
    })));
    relevantFiles.sort((a, b) => b.score - a.score);

    const summary = [
      `Project: ${path.basename(root)}`,
      `Type: ${projectType}`,
      `Package manager: ${packageManager}`,
      packageJson ? "package.json present" : "No package.json",
      `Relevant files: ${relevantFiles.map((file) => file.path).join(", ") || "none"}`,
    ].join("\n");

    return {
      context: {
        ...base,
        projectType,
        packageManager,
        packageJson,
        projectFiles: relevantFiles.map((file) => file.path),
        activeFileContent: base.activeFileContent ? this.summarizeContent(base.activeFileContent, 7000) : undefined,
      },
      summary,
      relevantFiles,
      projectType,
      packageManager,
    };
  }

  private static async indexFiles(root: string, max: number): Promise<string[]> {
    const statKey = this.workspaceFingerprint(root);
    const cached = this.cache.get(root);
    if (cached?.mtime === statKey) return cached.files.slice(0, max);

    const include = "**/*.{ts,tsx,js,jsx,py,php,go,rs,vue,astro,css,scss,json,md,html,prisma}";
    const uris = await vscode.workspace.findFiles(include, "{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/.next/**,**/vendor/**,**/.turbo/**,**/coverage/**}", max);
    const files = uris
      .map((uri) => path.relative(root, uri.fsPath))
      .filter((rel) => !this.isIgnored(rel));
    const summary = `${files.length} indexed source file(s)`;
    this.cache.set(root, { mtime: statKey, files, summary });
    return files;
  }

  private static selectRelevantFiles(task: string, files: string[], activeFile?: string, packageJson?: string): string[] {
    const scored = files.map((file) => ({ file, score: this.scoreFile(task, file, activeFile) }));
    const required = ["package.json", "tsconfig.json", "next.config.ts", "next.config.js", "vite.config.ts", "vite.config.js"]
      .filter((file) => files.includes(file));
    if (packageJson && files.includes("package.json") && !required.includes("package.json")) required.unshift("package.json");
    return [...new Set([...required, ...scored.sort((a, b) => b.score - a.score).map((item) => item.file)])];
  }

  private static scoreFile(task: string, file: string, activeFile?: string): number {
    const lowerTask = task.toLowerCase();
    const lowerFile = file.toLowerCase();
    let score = 0;
    if (activeFile && file === activeFile) score += 100;
    for (const word of lowerTask.split(/[^a-z0-9_.-]+/).filter((w) => w.length > 2)) {
      if (lowerFile.includes(word)) score += 8;
    }
    if (/package\.json|tsconfig|next\.config|vite\.config|tailwind\.config|schema\.prisma/.test(lowerFile)) score += 20;
    if (/landing|home|page|ui|style|css|component/.test(lowerTask) && /\.(tsx|jsx|css|html)$/.test(lowerFile)) score += 12;
    if (/api|route|server|endpoint/.test(lowerTask) && /(api|route|server)/.test(lowerFile)) score += 12;
    if (/test|spec/.test(lowerTask) && /(test|spec)/.test(lowerFile)) score += 12;
    if (/readme|docs|documentation/.test(lowerTask) && /readme|\.md$/.test(lowerFile)) score += 15;
    return score;
  }

  private static async readSummarized(root: string, rel: string): Promise<string> {
    try {
      const full = path.join(root, rel);
      const stat = fs.statSync(full);
      if (!stat.isFile() || stat.size > 400_000 || this.isIgnored(rel)) return "";
      return this.summarizeContent(fs.readFileSync(full, "utf8"), 9000);
    } catch {
      return "";
    }
  }

  private static summarizeContent(content: string, limit: number): string {
    if (content.length <= limit) return content;
    const head = content.slice(0, Math.floor(limit * 0.68));
    const tail = content.slice(-Math.floor(limit * 0.22));
    return `${head}\n\n/* ... middle omitted for context budget ... */\n\n${tail}`;
  }

  private static isIgnored(rel: string): boolean {
    if (SECRET_RE.test(rel)) return true;
    return rel.split(/[\\/]/).some((part) => IGNORE_DIRS.has(part));
  }

  private static workspaceFingerprint(root: string): number {
    try {
      return fs.statSync(root).mtimeMs;
    } catch {
      return Date.now();
    }
  }
}
