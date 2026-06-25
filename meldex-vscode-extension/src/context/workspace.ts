import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { WorkspaceCtx } from "../api/client";

export class WorkspaceContext {
  static async gather(maxFiles: number = 20): Promise<WorkspaceCtx> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) return {};

    const root = folders[0].uri.fsPath;
    const workspaceName = folders[0].name;
    const editor = vscode.window.activeTextEditor;

    const projectType = WorkspaceContext.detectProjectType(root);
    const packageManager = WorkspaceContext.detectPackageManager(root);
    const projectFiles = await WorkspaceContext.listFiles(root, maxFiles);
    const packageJson = WorkspaceContext.readPackageJson(root);

    let activeFile: string | undefined;
    let activeFileContent: string | undefined;
    let selectedText: string | undefined;

    if (editor) {
      const absPath = editor.document.fileName;
      // Never expose .env files
      if (!WorkspaceContext.isEnvFile(absPath)) {
        activeFile = path.relative(root, absPath);
        const content = editor.document.getText();
        activeFileContent = content.length > 6000 ? content.slice(0, 6000) + "\n// ...truncated" : content;
        const sel = editor.selection;
        if (!sel.isEmpty) selectedText = editor.document.getText(sel);
      }
    }

    return {
      projectType,
      packageManager,
      workspaceName,
      activeFile,
      activeFileContent,
      selectedText,
      projectFiles,
      packageJson,
    };
  }

  static getActiveFileContext(editor: vscode.TextEditor): Partial<WorkspaceCtx> {
    const folders = vscode.workspace.workspaceFolders;
    const root = folders?.[0].uri.fsPath;
    const absPath = editor.document.fileName;
    if (WorkspaceContext.isEnvFile(absPath)) return {};
    return {
      activeFile: root ? path.relative(root, absPath) : absPath,
      activeFileContent: editor.document.getText().slice(0, 4000),
    };
  }

  static isEnvFile(filePath: string): boolean {
    const base = path.basename(filePath);
    return /^\.env(\.|$)/.test(base);
  }

  static detectProjectType(root: string): string {
    const checks: [string, string][] = [
      ["next.config.ts", "Next.js"], ["next.config.js", "Next.js"],
      ["nuxt.config.ts", "Nuxt.js"], ["nuxt.config.js", "Nuxt.js"],
      ["astro.config.mjs", "Astro"],
      ["vite.config.ts", "Vite/React"], ["vite.config.js", "Vite/React"],
      ["angular.json", "Angular"], ["vue.config.js", "Vue.js"],
      ["artisan", "Laravel"], ["manage.py", "Django/Python"],
      ["requirements.txt", "Python"], ["Cargo.toml", "Rust"],
      ["go.mod", "Go"],
    ];
    for (const [file, type] of checks) {
      if (fs.existsSync(path.join(root, file))) return type;
    }
    if (fs.existsSync(path.join(root, "package.json"))) return "Node.js";
    return "Unknown";
  }

  static detectPackageManager(root: string): string {
    if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
    if (fs.existsSync(path.join(root, "yarn.lock"))) return "yarn";
    if (fs.existsSync(path.join(root, "package-lock.json"))) return "npm";
    if (fs.existsSync(path.join(root, "bun.lockb"))) return "bun";
    return "npm";
  }

  static readPackageJson(root: string): string | undefined {
    try {
      const pkgPath = path.join(root, "package.json");
      if (fs.existsSync(pkgPath)) return fs.readFileSync(pkgPath, "utf-8").slice(0, 1500);
    } catch { }
    return undefined;
  }

  static readGitignorePatterns(root: string): string[] {
    try {
      const gitignorePath = path.join(root, ".gitignore");
      if (!fs.existsSync(gitignorePath)) return [];
      return fs
        .readFileSync(gitignorePath, "utf-8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"));
    } catch {
      return [];
    }
  }

  static async listFiles(root: string, max: number): Promise<string[]> {
    const include = "**/*.{ts,tsx,js,jsx,py,php,go,rs,vue,astro,css,scss,json,md,html}";
    // Always exclude .env files, node_modules, build dirs
    const exclude =
      "**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/.next/**," +
      "**/vendor/**,**/.env,**/.env.*,**/*.env";
    const uris = await vscode.workspace.findFiles(include, exclude, max);
    return uris.map((u) => path.relative(root, u.fsPath));
  }

  static async applyFileChanges(
    root: string,
    files: { operation: "create" | "edit" | "delete"; path: string; content: string }[]
  ): Promise<{ applied: string[]; errors: string[] }> {
    const applied: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      // Safety: never write to .env files
      if (WorkspaceContext.isEnvFile(file.path)) {
        errors.push(`Blocked write to env file: ${file.path}`);
        continue;
      }

      const fullPath = path.isAbsolute(file.path) ? file.path : path.join(root, file.path);

      // Safety: prevent path traversal outside workspace root
      const resolved = path.resolve(fullPath);
      if (!resolved.startsWith(path.resolve(root))) {
        errors.push(`Path traversal blocked: ${file.path}`);
        continue;
      }

      try {
        if (file.operation === "delete") {
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            applied.push(`Deleted: ${file.path}`);
          }
        } else {
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(fullPath, file.content, "utf-8");
          applied.push(`${file.operation === "create" ? "Created" : "Edited"}: ${file.path}`);
        }
      } catch (e) {
        errors.push(`Failed ${file.path}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { applied, errors };
  }
}
