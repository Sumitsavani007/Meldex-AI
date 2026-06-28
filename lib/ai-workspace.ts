import crypto from "crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateChatCompletionWithUsage, ModelRouterError, type CompletionUsage } from "@/lib/model-router";
import { modelErrorStatus, toSafeProviderError } from "@/lib/provider-health";
import { isUserVisibleWorkspaceFile } from "@/lib/workspace-file-visibility";
import {
  buildCliRuntimeV4Plan,
  buildProjectKnowledgeGraph,
  buildQwenRuntimePrompt,
  localReflectRuntimeOutput,
  rankSemanticFiles,
  type RuntimeV4Event,
} from "@/lib/cli-runtime-v4";

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
  runtimeV4?: {
    events: RuntimeV4Event[];
    scratchpad: unknown;
    graphSummary: unknown;
    rankedFiles: Array<{ path: string; score: number; reasons: string[] }>;
    packedContext: { files: number; omitted: number; charCount: number };
    dag: unknown;
    confidence: unknown;
    reflection: unknown;
    outputBudget?: {
      maxTokens: number;
      category: string;
      targetRange: string;
      reason: string;
    };
  };
};

export type WorkspacePatchAction = {
  path: string;
  find: string;
  replace: string;
  description?: string;
};

export type WorkspacePatchResponse = {
  patches: WorkspacePatchAction[];
  summary?: string;
  warnings?: string[];
  usage?: CompletionUsage;
  provider?: string;
  model?: string;
  rawContent?: string;
  outputBudget?: {
    maxTokens: number;
    category: string;
    targetRange: string;
    reason: string;
  };
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

function onlyStaticCoreFilesRequested(prompt = "") {
  return /only\s+(?:use\s+)?(?:the\s+)?(?:files?\s*)?(?:index\.html|html)[\s,]*(?:style\.css|css)[\s,]*(?:and\s+)?(?:script\.js|js)/i.test(prompt) ||
    /use\s+only\s+index\.html,\s*style\.css,\s*script\.js/i.test(prompt);
}

function isGujaratiFoodPrompt(prompt = "") {
  return /gujarati|tasty\s+gujarat|food\s+delivery|dhokla|fafda|khandvi|thepla|undhiyu|khaman/i.test(prompt);
}

function wantsWorkspaceContinuity(prompt = "") {
  return /\b(continue|previous|same|again|restore|yesterday|last|better|fix it|fix the same|same issue|same style|modify|update|edit|improve existing|change existing)\b/i.test(prompt);
}

function isStandaloneWebsiteGeneration(prompt = "") {
  return isStaticWebsitePrompt(prompt) && !wantsWorkspaceContinuity(prompt);
}

function promptRequiresPricing(prompt = "") {
  return /\b(pricing|price|plans?|subscription|billing|monthly|yearly)\b/i.test(prompt);
}

const GENERIC_PROMPT_SUBJECTS = new Set([
  "a", "an", "the", "and", "or", "for", "with", "without", "called", "named",
  "create", "make", "build", "generate", "design", "redesign", "fix", "add",
  "premium", "modern", "responsive", "beautiful", "animated", "simple", "clean",
  "requirements", "requirement", "important", "expected", "output", "final",
  "page", "pages", "website", "site", "section", "sections", "landing", "platform",
  "app", "application", "product", "saas", "ai", "dashboard", "hero", "footer",
  "cards", "card", "buttons", "button", "faq", "accordion", "pricing", "price",
  "plans", "plan", "mobile", "desktop", "style", "dark", "light", "theme",
  "html", "css", "javascript", "script", "index", "file", "files",
]);

function cleanSubjectTerm(value = "") {
  return value
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericSubject(value = "") {
  const cleaned = cleanSubjectTerm(value).toLowerCase();
  if (!cleaned || cleaned.length < 3) return true;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  return words.every((word) => GENERIC_PROMPT_SUBJECTS.has(word) || word.length < 3);
}

function promptSubjectTerms(prompt = "") {
  const explicitNames = [
    ...[...prompt.matchAll(/"([^"]{2,80})"/g)].map((match) => match[1]),
    ...[...prompt.matchAll(/\b(?:called|named|for)\s+["']?([A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,4})["']?/g)].map((match) => match[1]),
  ];
  const knownDomainNames = [
    /fitflow\s+ai/i.test(prompt) ? "FitFlow AI" : "",
    /tasty\s+gujarat/i.test(prompt) ? "Tasty Gujarat" : "",
    /booknest\s+ai/i.test(prompt) ? "BookNest AI" : "",
    /\bmeldex\b/i.test(prompt) ? "Meldex" : "",
  ];
  return [...new Set([...explicitNames, ...knownDomainNames].map(cleanSubjectTerm).filter((item) => !isGenericSubject(item)))].slice(0, 5);
}

function promptRequiredEntities(prompt = "") {
  const entities = promptSubjectTerms(prompt);
  const domain = promptDomain(prompt);
  if (domain === "fitness_saas") {
    return [...new Set([...entities, /fitflow/i.test(prompt) ? "FitFlow AI" : "fitness"])].filter((item) => !isGenericSubject(item));
  }
  if (domain === "gujarati_food_delivery") {
    return [...new Set([...entities, /tasty\s+gujarat/i.test(prompt) ? "Tasty Gujarat" : "Gujarati food"])].filter((item) => !isGenericSubject(item));
  }
  if (domain === "book_summary_app") {
    return [...new Set([...entities, /booknest/i.test(prompt) ? "BookNest AI" : "book summary"])].filter((item) => !isGenericSubject(item));
  }
  if (domain === "pricing") {
    return [...new Set(entities.length ? entities : /\bmeldex\b/i.test(prompt) ? ["Meldex"] : [])].filter((item) => !isGenericSubject(item));
  }
  return entities;
}

function promptOptionalRequirements(prompt = "") {
  const optional: string[] = [];
  if (promptRequiresPricing(prompt)) optional.push("pricing or plan cards");
  if (/\bfaq\b/i.test(prompt)) optional.push("FAQ");
  if (/\bhero\b/i.test(prompt)) optional.push("hero section");
  if (/\bmobile|responsive\b/i.test(prompt)) optional.push("responsive layout");
  if (/\banimation|animated|smooth\b/i.test(prompt)) optional.push("animations");
  if (/\bpopular dishes|menu|food\b/i.test(prompt)) optional.push("food/menu sections");
  if (/\bbook\s+summary|summaries|reading|reader|books?\b/i.test(prompt)) optional.push("book summary app context");
  return [...new Set(optional)];
}

function promptDomain(prompt = "") {
  if (isGujaratiFoodPrompt(prompt)) return "gujarati_food_delivery";
  if (/fitflow|fitness|workout|gym|wellness|health\s+coach|meal\s+plan/i.test(prompt)) return "fitness_saas";
  if (/booknest|book\s+summary|book\s+summar(?:y|ies)|reading|reader|bookshelf|library/i.test(prompt)) return "book_summary_app";
  if (promptRequiresPricing(prompt)) return "pricing";
  if (/portfolio|resume|designer|developer/i.test(prompt)) return "portfolio";
  return "general";
}

export function staticFallbackFiles(prompt: string, reason: string): WorkspaceFileAction[] {
  if (/booknest|book\s+summary|book\s+summar(?:y|ies)|reading|reader|bookshelf|library/i.test(prompt)) {
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BookNest AI - Premium AI Book Summary App</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="#top" aria-label="BookNest AI home"><span>BN</span>BookNest AI</a>
    <button class="menu-toggle" type="button" aria-label="Open menu" aria-expanded="false"><span></span><span></span><span></span></button>
    <nav class="nav-links" aria-label="Primary navigation">
      <a href="#features">Features</a>
      <a href="#library">Library</a>
      <a href="#plans">Plans</a>
      <a href="#faq">FAQ</a>
    </nav>
    <button class="header-cta" type="button" data-scroll="#plans">Start reading smarter</button>
  </header>
  <main id="top">
    <section class="hero reveal">
      <div class="hero-copy">
        <p class="eyebrow">AI-powered book summaries</p>
        <h1>Understand the best books in minutes, then go deeper when it matters.</h1>
        <p class="lede">BookNest AI turns nonfiction, business, wellness, and product books into polished summaries, chapter insights, memorable quotes, and action plans for busy readers.</p>
        <div class="hero-actions">
          <button class="primary-btn" type="button" data-scroll="#library">Explore summaries</button>
          <button class="secondary-btn" type="button" data-scroll="#features">See how it works</button>
        </div>
        <div class="trust-row" aria-label="BookNest AI metrics">
          <span><strong>12k+</strong> summaries</span>
          <span><strong>4.9/5</strong> reader rating</span>
          <span><strong>7 min</strong> average read</span>
        </div>
      </div>
      <div class="hero-visual" aria-label="BookNest AI app preview">
        <div class="glow"></div>
        <article class="app-card main-card">
          <div class="card-top"><span>Reading brief</span><strong>Atomic Habits</strong></div>
          <h2>Build better systems, not bigger goals.</h2>
          <p>AI summary, chapter map, key ideas, quotes, and next actions in one elegant reading flow.</p>
          <div class="progress"><span></span></div>
        </article>
        <article class="floating-card card-one"><strong>AI insight</strong><span>3 actions saved to your weekly plan</span></article>
        <article class="floating-card card-two"><strong>Smart shelf</strong><span>Productivity · Psychology · Finance</span></article>
      </div>
    </section>
    <section id="features" class="section reveal">
      <p class="eyebrow">Why BookNest AI</p>
      <h2>A premium reading companion for people who want knowledge to compound.</h2>
      <div class="feature-grid">
        <article><span>01</span><h3>Layered summaries</h3><p>Choose a 2-minute brief, a 7-minute summary, or a deeper chapter-by-chapter breakdown.</p></article>
        <article><span>02</span><h3>Action extraction</h3><p>Turn ideas into tasks, habits, experiments, and reusable personal notes.</p></article>
        <article><span>03</span><h3>Smart recommendations</h3><p>Discover the next book based on your goals, saved insights, and reading history.</p></article>
      </div>
    </section>
    <section id="library" class="section reveal">
      <p class="eyebrow">Popular summaries</p>
      <h2>Explore sharp, beautifully organized book intelligence.</h2>
      <div class="book-grid">
        <article><small>Business</small><h3>The Lean Startup</h3><p>Validated learning, MVPs, and product feedback loops.</p></article>
        <article><small>Mindset</small><h3>Deep Work</h3><p>Focus rituals, attention design, and distraction resistance.</p></article>
        <article><small>Habits</small><h3>Atomic Habits</h3><p>Identity-based systems, cues, cravings, and compounding routines.</p></article>
        <article><small>Finance</small><h3>Psychology of Money</h3><p>Behavior, risk, patience, and better wealth decisions.</p></article>
      </div>
    </section>
    <section id="plans" class="section reveal">
      <p class="eyebrow">Plans</p>
      <h2>Start free. Upgrade when your reading habit becomes a system.</h2>
      <div class="plans">
        <article><h3>Reader</h3><strong>$9/mo</strong><p>50 summaries, highlights, and personal notes.</p><button type="button">Choose Reader</button></article>
        <article class="featured"><h3>Scholar</h3><strong>$19/mo</strong><p>Unlimited summaries, action plans, and smart recommendations.</p><button type="button">Choose Scholar</button></article>
        <article><h3>Team</h3><strong>$59/mo</strong><p>Shared shelves, team learning paths, and exportable briefs.</p><button type="button">Contact sales</button></article>
      </div>
    </section>
    <section id="faq" class="section faq reveal">
      <p class="eyebrow">FAQ</p>
      <h2>Questions before you build your reading nest?</h2>
      <button class="faq-item" type="button"><span>Does BookNest AI replace reading full books?</span><strong>+</strong></button>
      <div class="faq-panel">No. It helps you decide what to read deeply and captures the most useful ideas before or after a full read.</div>
      <button class="faq-item" type="button"><span>Can I save insights?</span><strong>+</strong></button>
      <div class="faq-panel">Yes. Save quotes, actions, chapter notes, and personalized takeaways to your smart shelf.</div>
      <button class="faq-item" type="button"><span>Is it useful for teams?</span><strong>+</strong></button>
      <div class="faq-panel">Teams can create shared learning paths and turn books into concise internal briefs.</div>
    </section>
  </main>
  <footer>© 2026 BookNest AI. Read less randomly. Learn more deliberately.</footer>
  <script src="./script.js"></script>
</body>
</html>`;
    const css = `:root{color-scheme:dark;--bg:#080914;--panel:rgba(255,255,255,.08);--panel-strong:rgba(255,255,255,.14);--text:#f8fafc;--muted:#a8b0c2;--border:rgba(255,255,255,.14);--accent:#8b5cf6;--gold:#f8c75c;--cyan:#38d5ff}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at 18% 4%,rgba(139,92,246,.34),transparent 34rem),radial-gradient(circle at 86% 10%,rgba(248,199,92,.18),transparent 28rem),linear-gradient(180deg,#111326 0%,var(--bg) 58%,#060711 100%);color:var(--text);overflow-x:hidden}.site-header{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:24px;padding:18px clamp(18px,4vw,64px);border-bottom:1px solid var(--border);background:rgba(8,9,20,.74);backdrop-filter:blur(18px)}.brand,.nav-links a{color:inherit;text-decoration:none}.brand{display:flex;align-items:center;gap:10px;margin-right:auto;font-weight:900;letter-spacing:-.04em}.brand span{display:grid;place-items:center;width:34px;height:34px;border-radius:12px;background:linear-gradient(135deg,var(--accent),var(--gold));color:#080914}.nav-links{display:flex;gap:22px;color:var(--muted);font-size:14px}.nav-links a:hover{color:#fff}.menu-toggle{display:none;width:42px;height:42px;border:1px solid var(--border);border-radius:14px;background:rgba(255,255,255,.06)}.menu-toggle span{display:block;width:18px;height:2px;margin:4px auto;border-radius:99px;background:#fff}.header-cta,.primary-btn,.secondary-btn,.plans button{border:1px solid var(--border);border-radius:999px;padding:12px 18px;color:#fff;background:rgba(255,255,255,.07);font:inherit;font-weight:850;cursor:pointer;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}.header-cta,.primary-btn,.plans .featured button{border-color:transparent;background:linear-gradient(135deg,var(--accent),#6d5dfc);box-shadow:0 16px 40px rgba(139,92,246,.26)}button:hover{transform:translateY(-2px)}button:focus-visible,a:focus-visible{outline:3px solid rgba(139,92,246,.38);outline-offset:4px}.hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(360px,.95fr);gap:clamp(32px,5vw,76px);align-items:center;min-height:86vh;padding:clamp(56px,8vw,108px) clamp(18px,5vw,86px)}.eyebrow{margin:0 0 14px;color:var(--gold);font-size:12px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}h1,h2,h3,p{margin-top:0}h1{max-width:880px;margin-bottom:24px;font-size:clamp(48px,7.6vw,98px);line-height:.9;letter-spacing:-.075em}.lede{max-width:720px;color:var(--muted);font-size:clamp(17px,2vw,22px);line-height:1.72}.hero-actions,.trust-row{display:flex;gap:14px;flex-wrap:wrap;margin-top:28px}.trust-row span{border:1px solid var(--border);border-radius:18px;padding:12px 14px;color:var(--muted);background:rgba(255,255,255,.045)}.trust-row strong{display:block;color:#fff;font-size:22px}.hero-visual{position:relative;min-height:520px;display:grid;place-items:center}.glow{position:absolute;width:76%;aspect-ratio:1;border-radius:50%;background:conic-gradient(from 120deg,var(--accent),var(--cyan),var(--gold),var(--accent));filter:blur(48px);opacity:.28;animation:spin 14s linear infinite}.app-card{position:relative;z-index:2;width:min(460px,100%);border:1px solid var(--border);border-radius:34px;padding:28px;background:linear-gradient(145deg,var(--panel-strong),rgba(255,255,255,.055));box-shadow:0 34px 120px rgba(0,0,0,.42);backdrop-filter:blur(18px)}.card-top{display:flex;justify-content:space-between;gap:12px;color:var(--muted);font-size:13px}.main-card h2{margin:38px 0 14px;font-size:clamp(30px,4vw,48px);line-height:1}.main-card p{color:var(--muted);line-height:1.7}.progress{height:10px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden}.progress span{display:block;width:72%;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--gold),var(--cyan))}.floating-card{position:absolute;z-index:3;display:grid;gap:4px;min-width:210px;border:1px solid var(--border);border-radius:20px;padding:15px 16px;background:rgba(12,14,29,.66);box-shadow:0 24px 70px rgba(0,0,0,.34);backdrop-filter:blur(18px);animation:floatY 4.8s ease-in-out infinite}.floating-card span{color:var(--muted);font-size:12px}.card-one{top:42px;right:0}.card-two{left:0;bottom:62px;animation-delay:-1.6s}.section{padding:78px clamp(18px,5vw,86px)}.section h2{max-width:890px;font-size:clamp(34px,4.8vw,62px);line-height:.98;letter-spacing:-.06em}.feature-grid,.book-grid,.plans{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.book-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.feature-grid article,.book-grid article,.plans article{min-height:220px;border:1px solid var(--border);border-radius:28px;padding:24px;background:linear-gradient(145deg,rgba(255,255,255,.095),rgba(255,255,255,.045));box-shadow:0 18px 60px rgba(0,0,0,.18);transition:transform .22s ease,border-color .22s ease}.feature-grid article:hover,.book-grid article:hover,.plans article:hover{transform:translateY(-6px);border-color:rgba(248,199,92,.42)}.feature-grid span,.book-grid small{color:var(--gold);font-weight:900}.feature-grid p,.book-grid p,.plans p,.faq-panel{color:var(--muted);line-height:1.65}.plans strong{display:block;margin:8px 0 12px;font-size:38px}.plans .featured{border-color:rgba(139,92,246,.64);background:linear-gradient(145deg,rgba(139,92,246,.18),rgba(255,255,255,.055))}.faq{max-width:980px}.faq-item{width:100%;display:flex;align-items:center;justify-content:space-between;border:0;border-bottom:1px solid var(--border);border-radius:0;padding:18px 0;color:#fff;background:transparent;text-align:left;font:inherit;font-weight:850}.faq-panel{display:none;padding:0 0 18px}.faq-panel.open{display:block}footer{border-top:1px solid var(--border);padding:32px clamp(18px,5vw,86px);color:var(--muted)}.reveal{opacity:0;transform:translateY(18px);transition:opacity .65s ease,transform .65s ease}.reveal.visible{opacity:1;transform:none}@keyframes spin{to{transform:rotate(360deg)}}@keyframes floatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}@media(max-width:980px){.menu-toggle{display:block}.nav-links{position:absolute;left:16px;right:16px;top:calc(100% + 10px);display:none;flex-direction:column;border:1px solid var(--border);border-radius:20px;padding:12px;background:rgba(8,9,20,.96)}.nav-links.open{display:flex}.header-cta{display:none}.hero{grid-template-columns:1fr;min-height:auto}.feature-grid,.book-grid,.plans{grid-template-columns:1fr 1fr}}@media(max-width:620px){.hero{padding-top:42px}.hero-visual{min-height:380px}.floating-card{position:relative;inset:auto;width:100%;animation:none;margin-bottom:10px}.feature-grid,.book-grid,.plans{grid-template-columns:1fr}.hero-actions button{width:100%}h1{font-size:44px}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}`;
    const js = `const menuToggle=document.querySelector(".menu-toggle");const navLinks=document.querySelector(".nav-links");menuToggle?.addEventListener("click",()=>{const open=navLinks?.classList.toggle("open");menuToggle.setAttribute("aria-expanded",String(Boolean(open)))});document.querySelectorAll(".nav-links a").forEach(link=>link.addEventListener("click",()=>{navLinks?.classList.remove("open");menuToggle?.setAttribute("aria-expanded","false")}));document.querySelectorAll("[data-scroll]").forEach(button=>button.addEventListener("click",()=>{document.querySelector(button.dataset.scroll||"")?.scrollIntoView({behavior:"smooth",block:"start"})}));const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("visible");observer.unobserve(entry.target)}})},{threshold:.16});document.querySelectorAll(".reveal").forEach(item=>observer.observe(item));document.querySelectorAll(".faq-item").forEach(button=>button.addEventListener("click",()=>{const panel=button.nextElementSibling;const open=panel?.classList.toggle("open");const icon=button.querySelector("strong");if(icon)icon.textContent=open?"−":"+";}));`;
    return [
      { operation: "create", path: "index.html", content: html, description: `Generated BookNest AI fallback: ${reason}` },
      { operation: "create", path: "style.css", content: css, description: "Premium responsive BookNest AI styling" },
      { operation: "create", path: "script.js", content: js, description: "Menu, scroll, reveal, and FAQ interactions" },
    ];
  }
  if (isGujaratiFoodPrompt(prompt)) {
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tasty Gujarat - Premium Gujarati Food Delivery</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="#top" aria-label="Tasty Gujarat home"><span>TG</span>Tasty Gujarat</a>
    <button class="menu-toggle" type="button" aria-label="Open menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
    <nav class="nav-links" aria-label="Primary navigation">
      <a href="#dishes">Dishes</a>
      <a href="#how">How it works</a>
      <a href="#plans">Plans</a>
      <a href="#faq">FAQ</a>
    </nav>
    <button class="header-cta" type="button" data-scroll="#plans">Order now</button>
  </header>

  <main id="top">
    <section class="hero reveal">
      <div class="hero-copy">
        <p class="eyebrow">Ahmedabad to your doorstep</p>
        <h1>Premium Gujarati meals delivered hot, fast, and full of ghar jaisi taste.</h1>
        <p class="lede">Tasty Gujarat brings curated thalis, farsan, sweets, and festive family packs from trusted local kitchens in a dark, premium delivery experience.</p>
        <div class="hero-badges" aria-label="Food quality badges">
          <span>Pure veg</span>
          <span>Jain options</span>
          <span>Festival specials</span>
        </div>
        <div class="hero-actions">
          <button class="primary-btn" type="button" data-scroll="#dishes">Explore dishes</button>
          <button class="secondary-btn" type="button" data-scroll="#how">How it works</button>
        </div>
        <div class="hero-stats" aria-label="Service highlights">
          <span><strong>35 min</strong> average delivery</span>
          <span><strong>4.9/5</strong> taste rating</span>
          <span><strong>120+</strong> Gujarati dishes</span>
        </div>
      </div>
      <div class="hero-visual" aria-label="Gujarati thali preview">
        <div class="glow"></div>
        <div class="floating-card card-one"><strong>Live order</strong><span>Kathiyawadi Thali · 18 min</span></div>
        <div class="floating-card card-two"><strong>Chef picked</strong><span>Fresh fafda jalebi combo</span></div>
        <div class="thali-card">
          <div class="dish large">થેપલા</div>
          <div class="dish">ઢોકળા</div>
          <div class="dish">ખમણ</div>
          <div class="dish">જલેબી</div>
          <div class="dish">છાસ</div>
        </div>
      </div>
    </section>

    <section id="dishes" class="section reveal">
      <div class="section-heading">
        <p class="eyebrow">Popular dishes</p>
        <h2>Gujarati favorites, plated for modern cravings.</h2>
      </div>
      <div class="dish-grid">
        <article class="food-card"><span>🥟</span><h3>Surti Locho Bowl</h3><p>Soft, spicy, buttery locho with sev, chutney, and onion crunch.</p><strong>₹129</strong></article>
        <article class="food-card"><span>🍱</span><h3>Kathiyawadi Thali</h3><p>Ringan no olo, bajra rotla, khichdi, kadhi, pickle, and jaggery.</p><strong>₹249</strong></article>
        <article class="food-card"><span>🥨</span><h3>Fafda Jalebi Box</h3><p>Crisp fafda, hot jalebi, papaya sambharo, and kadhi chutney.</p><strong>₹179</strong></article>
        <article class="food-card"><span>🥘</span><h3>Undhiyu Feast</h3><p>Seasonal vegetables, methi muthia, puri, shrikhand, and chaas.</p><strong>₹299</strong></article>
      </div>
    </section>

    <section id="how" class="section reveal">
      <div class="section-heading">
        <p class="eyebrow">How it works</p>
        <h2>From kitchen to khushi in three simple steps.</h2>
      </div>
      <div class="steps">
        <article><span>01</span><h3>Pick your craving</h3><p>Choose thalis, snacks, sweets, or weekly meal plans from curated local kitchens.</p></article>
        <article><span>02</span><h3>Track fresh prep</h3><p>Live updates show when your food is being cooked, packed, and dispatched.</p></article>
        <article><span>03</span><h3>Enjoy it hot</h3><p>Smart routing keeps delivery fast so every bite arrives fresh and flavorful.</p></article>
      </div>
    </section>

    <section id="plans" class="section reveal">
      <div class="section-heading">
        <p class="eyebrow">Plans</p>
        <h2>Simple food plans for every Gujarati appetite.</h2>
      </div>
      <div class="plans">
        <article class="plan"><p>Snack Pass</p><h3>₹499<span>/mo</span></h3><ul><li>4 farsan boxes</li><li>Free chutney upgrades</li><li>Weekend delivery slots</li></ul><button type="button">Choose Snack</button></article>
        <article class="plan featured"><p>Family Thali</p><h3>₹1,999<span>/mo</span></h3><ul><li>8 premium thalis</li><li>Priority delivery</li><li>Festival sweet add-ons</li></ul><button type="button">Choose Family</button></article>
        <article class="plan"><p>Office Meals</p><h3>₹3,999<span>/mo</span></h3><ul><li>Team lunch packs</li><li>Bulk order support</li><li>Dedicated manager</li></ul><button type="button">Contact us</button></article>
      </div>
    </section>

    <section id="faq" class="section faq reveal">
      <div class="section-heading">
        <p class="eyebrow">FAQ</p>
        <h2>Questions before your first bite?</h2>
      </div>
      <div class="accordion">
        <button class="faq-item" type="button"><span>Which cities do you serve?</span><strong>+</strong></button>
        <div class="faq-panel">We currently serve Ahmedabad, Surat, Vadodara, and Gandhinagar, with more Gujarati cities coming soon.</div>
        <button class="faq-item" type="button"><span>Can I schedule orders?</span><strong>+</strong></button>
        <div class="faq-panel">Yes. Schedule meals up to 7 days in advance for family events, offices, and festivals.</div>
        <button class="faq-item" type="button"><span>Are meals vegetarian?</span><strong>+</strong></button>
        <div class="faq-panel">Yes, Tasty Gujarat focuses on pure vegetarian Gujarati food with Jain options where available.</div>
      </div>
    </section>

    <section class="final-cta reveal" aria-labelledby="final-title">
      <p class="eyebrow">Tonight's dinner is sorted</p>
      <h2 id="final-title">Bring Gujarat's favorite kitchens to your table in one tap.</h2>
      <p>Order snacks, thalis, sweets, and family packs with premium delivery, real-time tracking, and trusted vegetarian kitchens.</p>
      <button class="primary-btn" type="button" data-scroll="#plans">Start with a plan</button>
    </section>
  </main>

  <footer>© 2026 Tasty Gujarat. Premium Gujarati food, delivered with love.</footer>
  <script src="./script.js"></script>
</body>
</html>`;
    const css = `:root {
  color-scheme: dark;
  --bg: #08070b;
  --panel: rgba(255, 255, 255, 0.07);
  --panel-strong: rgba(255, 255, 255, 0.12);
  --text: #fffaf2;
  --muted: #b8ad9c;
  --border: rgba(255, 255, 255, 0.14);
  --saffron: #ffb347;
  --rose: #ff5c7a;
  --green: #4ade80;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background:
    radial-gradient(circle at 15% 8%, rgba(255, 179, 71, 0.22), transparent 28rem),
    radial-gradient(circle at 86% 18%, rgba(255, 92, 122, 0.18), transparent 24rem),
    linear-gradient(180deg, #100b13 0%, var(--bg) 44%, #0d0b08 100%);
  background-size: 120% 120%, 120% 120%, 100% 100%;
  color: var(--text);
  overflow-x: hidden;
  animation: backgroundDrift 16s ease-in-out infinite alternate;
}
.site-header {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; justify-content: space-between; gap: 24px;
  padding: 18px clamp(18px, 4vw, 64px);
  border-bottom: 1px solid var(--border);
  background: rgba(8, 7, 11, 0.72);
  backdrop-filter: blur(18px);
}
.brand, nav a { color: inherit; text-decoration: none; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 850; letter-spacing: -0.03em; }
.brand span { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 12px; background: linear-gradient(135deg, var(--saffron), var(--rose)); color: #180b05; }
nav { display: flex; gap: 22px; color: var(--muted); font-size: 14px; }
nav a { position: relative; padding: 8px 0; }
nav a::after { content: ""; position: absolute; left: 0; right: 0; bottom: 2px; height: 1px; transform: scaleX(0); transform-origin: left; background: linear-gradient(90deg, var(--saffron), var(--rose)); transition: transform .22s ease; }
nav a:hover { color: var(--text); }
nav a:hover::after { transform: scaleX(1); }
button { font: inherit; }
.menu-toggle {
  display: none; width: 42px; height: 42px; border: 1px solid var(--border); border-radius: 14px; background: rgba(255,255,255,.06); cursor: pointer;
}
.menu-toggle span { display: block; width: 18px; height: 2px; margin: 4px auto; border-radius: 99px; background: var(--text); transition: transform .2s ease, opacity .2s ease; }
.menu-toggle.open span:nth-child(1) { transform: translateY(6px) rotate(45deg); }
.menu-toggle.open span:nth-child(2) { opacity: 0; }
.menu-toggle.open span:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }
.header-cta, .primary-btn, .secondary-btn, .plan button {
  border: 1px solid var(--border); border-radius: 999px; padding: 12px 18px; cursor: pointer;
  color: var(--text); background: rgba(255,255,255,.06); transition: transform .2s ease, border-color .2s ease, background .2s ease, box-shadow .2s ease;
}
.header-cta, .primary-btn, .plan.featured button { background: linear-gradient(135deg, var(--saffron), var(--rose)); color: #1b0d07; border-color: transparent; font-weight: 800; }
button:hover { transform: translateY(-2px); }
button:focus-visible, a:focus-visible { outline: 3px solid rgba(255,179,71,.35); outline-offset: 4px; }
.primary-btn:hover, .header-cta:hover, .plan.featured button:hover { box-shadow: 0 18px 50px rgba(255, 114, 94, .24); }
.hero { min-height: 86vh; display: grid; grid-template-columns: 1.08fr .92fr; gap: clamp(32px, 5vw, 76px); align-items: center; padding: clamp(56px, 8vw, 108px) clamp(18px, 5vw, 86px); }
.eyebrow { margin: 0 0 14px; color: var(--saffron); font-size: 12px; font-weight: 850; letter-spacing: .16em; text-transform: uppercase; }
h1, h2, h3, p { margin-top: 0; }
h1 { max-width: 860px; font-size: clamp(46px, 7.8vw, 104px); line-height: .9; letter-spacing: -0.075em; margin-bottom: 24px; }
.lede { max-width: 720px; color: var(--muted); font-size: clamp(17px, 2vw, 22px); line-height: 1.7; }
.hero-badges { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 22px; }
.hero-badges span { border: 1px solid rgba(255,179,71,.2); border-radius: 999px; padding: 8px 12px; background: rgba(255,179,71,.07); color: #ffd79a; font-size: 13px; font-weight: 750; }
.hero-actions, .hero-stats { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 30px; }
.hero-stats span { border: 1px solid var(--border); border-radius: 16px; padding: 12px 14px; color: var(--muted); background: rgba(255,255,255,.045); }
.hero-stats strong { display: block; color: var(--text); font-size: 20px; }
.hero-visual { position: relative; min-height: 520px; display: grid; place-items: center; }
.glow { position: absolute; width: 72%; aspect-ratio: 1; border-radius: 50%; background: conic-gradient(from 90deg, var(--saffron), var(--rose), var(--green), var(--saffron)); filter: blur(46px); opacity: .34; animation: spin 14s linear infinite; }
.floating-card { position: absolute; z-index: 2; display: grid; gap: 3px; min-width: 190px; border: 1px solid rgba(255,255,255,.18); border-radius: 18px; padding: 14px 16px; background: rgba(13,11,8,.58); box-shadow: 0 20px 70px rgba(0,0,0,.32); backdrop-filter: blur(18px); animation: floatY 4.8s ease-in-out infinite; }
.floating-card strong { font-size: 13px; }
.floating-card span { color: var(--muted); font-size: 12px; }
.card-one { top: 42px; right: 4%; }
.card-two { left: 0; bottom: 70px; animation-delay: -1.7s; }
.thali-card { position: relative; display: grid; grid-template-columns: repeat(2, minmax(120px, 1fr)); gap: 16px; width: min(460px, 100%); padding: 24px; border: 1px solid var(--border); border-radius: 34px; background: linear-gradient(145deg, rgba(255,255,255,.16), rgba(255,255,255,.045)); box-shadow: 0 30px 110px rgba(0,0,0,.42); backdrop-filter: blur(18px); }
.dish { min-height: 120px; display: grid; place-items: center; border-radius: 26px; color: #211006; background: linear-gradient(135deg, #ffd79a, #ff9b73); font-size: 22px; font-weight: 850; box-shadow: inset 0 1px rgba(255,255,255,.5); transition: transform .24s ease, box-shadow .24s ease; }
.dish:hover { transform: translateY(-4px) rotate(-1deg); box-shadow: inset 0 1px rgba(255,255,255,.55), 0 18px 40px rgba(255, 140, 90, .18); }
.dish.large { grid-row: span 2; min-height: 256px; font-size: 32px; background: linear-gradient(135deg, #fff1b8, #ffb347); }
.section { padding: 78px clamp(18px, 5vw, 86px); }
.section-heading { max-width: 760px; margin-bottom: 30px; }
.section h2 { font-size: clamp(32px, 4vw, 56px); line-height: 1; letter-spacing: -0.055em; }
.dish-grid, .steps, .plans { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; }
.steps, .plans { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.food-card, .steps article, .plan, .faq-panel {
  min-height: 100%;
  border: 1px solid var(--border); border-radius: 26px; background: linear-gradient(145deg, rgba(255,255,255,.09), rgba(255,255,255,.045)); padding: 24px; box-shadow: 0 18px 60px rgba(0,0,0,.18); transition: transform .24s ease, border-color .24s ease, box-shadow .24s ease;
}
.food-card:hover, .steps article:hover, .plan:hover { transform: translateY(-6px); border-color: rgba(255,179,71,.34); box-shadow: 0 26px 90px rgba(0,0,0,.3); }
.food-card span { font-size: 34px; }
.food-card p, .steps p, .plan li, .faq-panel { color: var(--muted); line-height: 1.65; }
.food-card strong { color: var(--saffron); font-size: 20px; }
.steps article span { color: var(--saffron); font-weight: 900; }
.plan { position: relative; overflow: hidden; }
.plan.featured { border-color: rgba(255,179,71,.48); background: linear-gradient(145deg, rgba(255,179,71,.16), rgba(255,255,255,.06)); transform: translateY(-8px); }
.plan h3 { font-size: 40px; letter-spacing: -0.05em; }
.plan h3 span { color: var(--muted); font-size: 15px; letter-spacing: 0; }
.plan ul { padding-left: 18px; }
.accordion { max-width: 900px; }
.faq-item { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 18px 0; color: var(--text); background: transparent; border: 0; border-bottom: 1px solid var(--border); cursor: pointer; text-align: left; }
.faq-panel { display: grid; grid-template-rows: 0fr; margin: 0; padding-block: 0; opacity: 0; overflow: hidden; transition: grid-template-rows .28s ease, opacity .28s ease, margin .28s ease, padding .28s ease; }
.faq-panel.open { grid-template-rows: 1fr; margin: 14px 0; padding-block: 24px; opacity: 1; }
.final-cta { margin: 42px clamp(18px, 5vw, 86px) 86px; padding: clamp(34px, 6vw, 72px); border: 1px solid rgba(255,179,71,.24); border-radius: 34px; background: radial-gradient(circle at 18% 20%, rgba(255,179,71,.18), transparent 26rem), linear-gradient(145deg, rgba(255,255,255,.12), rgba(255,255,255,.05)); box-shadow: 0 30px 120px rgba(0,0,0,.32); }
.final-cta h2 { max-width: 920px; margin-bottom: 16px; font-size: clamp(34px, 5vw, 70px); line-height: .98; letter-spacing: -0.06em; }
.final-cta p { max-width: 720px; color: var(--muted); font-size: 18px; line-height: 1.7; }
footer { padding: 32px clamp(18px, 5vw, 86px); color: var(--muted); border-top: 1px solid var(--border); }
.reveal { opacity: 0; transform: translateY(18px); transition: opacity .65s ease, transform .65s ease; }
.reveal.visible { opacity: 1; transform: translateY(0); }
@keyframes backgroundDrift { from { background-position: 0% 0%, 100% 0%, 0 0; } to { background-position: 6% 4%, 92% 8%, 0 0; } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes floatY { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }
@keyframes fadeUp { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 980px) {
  .menu-toggle { display: block; }
  .nav-links { position: absolute; left: 16px; right: 16px; top: calc(100% + 10px); display: none; flex-direction: column; gap: 4px; border: 1px solid var(--border); border-radius: 20px; padding: 12px; background: rgba(12,9,12,.94); box-shadow: 0 24px 80px rgba(0,0,0,.35); backdrop-filter: blur(18px); }
  .nav-links.open { display: flex; animation: fadeUp .2s ease both; }
  .nav-links a { padding: 12px; border-radius: 12px; }
  .nav-links a:hover { background: rgba(255,255,255,.06); }
  .hero { grid-template-columns: 1fr; min-height: auto; }
  .dish-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .steps, .plans { grid-template-columns: 1fr; }
  .plan.featured { transform: none; }
}
@media (max-width: 620px) {
  .site-header { padding-inline: 16px; }
  .header-cta { display: none; }
  .hero { padding-top: 42px; }
  .hero-visual { min-height: 360px; }
  .floating-card { position: relative; inset: auto; width: 100%; min-width: 0; margin-bottom: 10px; animation: none; }
  .thali-card { grid-template-columns: 1fr; border-radius: 24px; }
  .dish, .dish.large { min-height: 88px; font-size: 21px; }
  .dish-grid { grid-template-columns: 1fr; }
  .hero-actions .primary-btn, .hero-actions .secondary-btn { width: 100%; }
  .hero-stats span { flex: 1 1 100%; }
  .final-cta { margin-inline: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}`;
    const js = `const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelector(".nav-links");

menuToggle?.addEventListener("click", () => {
  const open = navLinks?.classList.toggle("open");
  menuToggle.classList.toggle("open", Boolean(open));
  menuToggle.setAttribute("aria-expanded", String(Boolean(open)));
});

document.querySelectorAll(".nav-links a").forEach((link) => {
  link.addEventListener("click", () => {
    navLinks?.classList.remove("open");
    menuToggle?.classList.remove("open");
    menuToggle?.setAttribute("aria-expanded", "false");
  });
});

const scrollButtons = document.querySelectorAll("[data-scroll]");
scrollButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.querySelector(button.dataset.scroll || "");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.16 });

document.querySelectorAll(".reveal").forEach((item) => observer.observe(item));

document.querySelectorAll(".faq-item").forEach((button) => {
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", () => {
    const panel = button.nextElementSibling;
    const icon = button.querySelector("strong");
    const open = panel?.classList.toggle("open");
    button.setAttribute("aria-expanded", String(Boolean(open)));
    if (icon) icon.textContent = open ? "−" : "+";
  });
});`;
    return [
      { operation: "create", path: "index.html", content: html, description: "Premium Gujarati food delivery landing page" },
      { operation: "create", path: "style.css", content: css, description: "Dark premium responsive styling and animations" },
      { operation: "create", path: "script.js", content: js, description: "Smooth scroll, reveal animations, and FAQ accordion" },
    ];
  }
  if (/fitflow|fitness|workout|gym|wellness|health\s+coach|meal\s+plan/i.test(prompt)) {
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>FitFlow AI - Intelligent Fitness SaaS</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <header class="nav">
    <a class="brand" href="#top">FitFlow <span>AI</span></a>
    <button class="menu" type="button" aria-label="Toggle menu" aria-expanded="false"><span></span><span></span></button>
    <nav class="links" aria-label="Primary navigation">
      <a href="#features">Features</a>
      <a href="#plans">Plans</a>
      <a href="#faq">FAQ</a>
    </nav>
    <button class="nav-cta" type="button" data-scroll="#plans">Start training</button>
  </header>
  <main id="top">
    <section class="hero reveal">
      <div>
        <p class="eyebrow">AI fitness operating system</p>
        <h1>Turn every workout into an adaptive coaching loop.</h1>
        <p class="lede">FitFlow AI plans training, nutrition, recovery, and progress insights for busy teams and ambitious individuals.</p>
        <div class="actions">
          <button class="primary" type="button" data-scroll="#plans">Build my plan</button>
          <button class="secondary" type="button" data-scroll="#features">See features</button>
        </div>
        <div class="metrics"><span><strong>92%</strong> adherence</span><span><strong>24/7</strong> coach</span><span><strong>4.9</strong> rating</span></div>
      </div>
      <aside class="dashboard" aria-label="FitFlow AI dashboard preview">
        <div class="orb"></div>
        <div class="dash-head"><span>Today</span><strong>Strength + Mobility</strong></div>
        <div class="rings"><span>82%</span><span>36m</span><span>7.8k</span></div>
        <div class="timeline"><p>Warmup complete</p><p>Deadlift progression ready</p><p>Recovery score improving</p></div>
      </aside>
    </section>
    <section id="features" class="section reveal">
      <p class="eyebrow">Built for momentum</p>
      <h2>Personalized plans, measurable progress, and premium coaching workflows.</h2>
      <div class="grid">
        <article><span>01</span><h3>Adaptive programs</h3><p>Plans shift around soreness, schedule changes, and performance signals.</p></article>
        <article><span>02</span><h3>Nutrition guidance</h3><p>Smart meals and macros that align with training blocks.</p></article>
        <article><span>03</span><h3>Team analytics</h3><p>Track adherence, recovery, and progress across clients or employees.</p></article>
      </div>
    </section>
    <section id="plans" class="section reveal">
      <p class="eyebrow">Plans</p>
      <h2>Choose your training engine.</h2>
      <div class="plans">
        <article><h3>Starter</h3><strong>$19/mo</strong><p>AI plans, workout tracking, weekly insights.</p><button type="button">Start</button></article>
        <article class="featured"><h3>Coach</h3><strong>$49/mo</strong><p>Adaptive cycles, nutrition, recovery optimization.</p><button type="button">Choose Coach</button></article>
        <article><h3>Studio</h3><strong>$149/mo</strong><p>Client dashboards, team analytics, priority support.</p><button type="button">Contact sales</button></article>
      </div>
    </section>
    <section id="faq" class="faq reveal">
      <button type="button">Does FitFlow replace a trainer?<strong>+</strong></button><div>It supports trainers and users with adaptive plans and measurable insights.</div>
      <button type="button">Can teams use it?<strong>+</strong></button><div>Yes, Studio includes team dashboards and client management workflows.</div>
    </section>
  </main>
  <script src="./script.js"></script>
</body>
</html>`;
    const css = `:root{color-scheme:dark;--bg:#05070f;--panel:rgba(255,255,255,.08);--border:rgba(255,255,255,.14);--text:#f8fafc;--muted:#9aa6bd;--lime:#a3ff12;--violet:#7c5cff}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:Inter,ui-sans-serif,system-ui;background:radial-gradient(circle at 25% 0,rgba(124,92,255,.3),transparent 34rem),radial-gradient(circle at 80% 20%,rgba(163,255,18,.16),transparent 24rem),var(--bg);color:var(--text)}.nav{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:24px;padding:18px clamp(18px,4vw,64px);background:rgba(5,7,15,.72);backdrop-filter:blur(18px);border-bottom:1px solid var(--border)}.brand{margin-right:auto;color:#fff;text-decoration:none;font-weight:900;font-size:20px}.brand span{color:var(--lime)}.links{display:flex;gap:20px}.links a{color:var(--muted);text-decoration:none}.nav-cta,.primary,.secondary,.plans button{border:0;border-radius:999px;padding:12px 18px;font-weight:900;cursor:pointer}.nav-cta,.primary,.plans button{background:linear-gradient(135deg,var(--lime),#48ffbd);color:#07110b}.secondary{background:rgba(255,255,255,.08);color:#fff;border:1px solid var(--border)}.menu{display:none}.hero{display:grid;grid-template-columns:minmax(0,1fr) 440px;gap:48px;align-items:center;min-height:calc(100vh - 78px);padding:clamp(42px,8vw,96px) clamp(18px,5vw,72px)}.eyebrow{color:var(--lime);text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:900}h1{font-size:clamp(48px,8vw,92px);line-height:.9;letter-spacing:-.06em;margin:12px 0}.lede{max-width:650px;color:var(--muted);font-size:19px;line-height:1.75}.actions,.metrics{display:flex;gap:12px;flex-wrap:wrap;margin-top:26px}.metrics span{border:1px solid var(--border);background:var(--panel);border-radius:18px;padding:13px 16px;color:var(--muted)}.metrics strong{display:block;color:#fff;font-size:24px}.dashboard{position:relative;border:1px solid var(--border);border-radius:32px;background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.05));padding:24px;box-shadow:0 34px 110px rgba(0,0,0,.45);overflow:hidden}.orb{position:absolute;inset:auto -80px -80px auto;width:220px;height:220px;background:var(--lime);filter:blur(80px);opacity:.25}.dash-head,.timeline p,.rings span{position:relative;border:1px solid var(--border);background:rgba(0,0,0,.22);border-radius:20px;padding:16px}.dash-head{display:grid;gap:6px}.dash-head span,.timeline p{color:var(--muted)}.rings{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.rings span{text-align:center;font-size:24px;font-weight:900}.timeline{display:grid;gap:10px}.section{padding:70px clamp(18px,5vw,72px)}.section h2{max-width:820px;font-size:clamp(34px,5vw,58px);line-height:1}.grid,.plans{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.grid article,.plans article{border:1px solid var(--border);border-radius:28px;background:var(--panel);padding:24px;min-height:230px}.grid span{color:var(--lime);font-weight:900}.grid p,.plans p{color:var(--muted);line-height:1.65}.plans strong{font-size:36px}.featured{outline:2px solid rgba(163,255,18,.45)}.faq{display:grid;gap:10px;padding:70px clamp(18px,5vw,72px)}.faq button{display:flex;justify-content:space-between;border:1px solid var(--border);border-radius:18px;background:var(--panel);color:#fff;padding:18px;font:inherit;font-weight:800}.faq div{display:none;color:var(--muted);padding:0 18px 12px}.faq div.open{display:block}.reveal{opacity:0;transform:translateY(18px);transition:.7s ease}.reveal.visible{opacity:1;transform:none}@media(max-width:920px){.hero{grid-template-columns:1fr}.dashboard{max-width:520px}.grid,.plans{grid-template-columns:1fr}.links,.nav-cta{display:none}.menu{display:grid;margin-left:auto;background:transparent;border:1px solid var(--border);border-radius:12px;width:42px;height:42px}.menu span{display:block;width:18px;height:2px;background:#fff;margin:auto}.links.open{display:flex;position:absolute;left:16px;right:16px;top:70px;flex-direction:column;border:1px solid var(--border);border-radius:20px;padding:14px;background:#080b15}}@media(max-width:520px){.rings{grid-template-columns:1fr}h1{font-size:44px}.actions button{width:100%}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}`;
    const js = `const menu=document.querySelector(".menu"),links=document.querySelector(".links");menu?.addEventListener("click",()=>{const open=links?.classList.toggle("open");menu.setAttribute("aria-expanded",String(Boolean(open)))});document.querySelectorAll("[data-scroll]").forEach(btn=>btn.addEventListener("click",()=>document.querySelector(btn.dataset.scroll||"")?.scrollIntoView({behavior:"smooth"})));const obs=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("visible");obs.unobserve(entry.target)}}),{threshold:.16});document.querySelectorAll(".reveal").forEach(el=>obs.observe(el));document.querySelectorAll(".faq button").forEach(btn=>btn.addEventListener("click",()=>{const panel=btn.nextElementSibling;const open=panel?.classList.toggle("open");const icon=btn.querySelector("strong");if(icon)icon.textContent=open?"−":"+";}));`;
    const files = [
      { operation: "create" as const, path: "index.html", content: html, description: "Premium FitFlow AI fitness SaaS landing page" },
      { operation: "create" as const, path: "style.css", content: css, description: "Dark premium responsive fitness SaaS styling" },
      { operation: "create" as const, path: "script.js", content: js, description: "Menu, reveal, scroll, and FAQ interactions" },
    ];
    return onlyStaticCoreFilesRequested(prompt) ? files : [...files, { operation: "create", path: "README.md", content: "# FitFlow AI\n\nPremium responsive fitness SaaS landing page generated by Meldex Workspace.\n", description: "Project notes" }];
  }
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
  const files: WorkspaceFileAction[] = [
    { operation: "create", path: "index.html", content: html, description: `Generated safe preview fallback: ${reason}` },
    { operation: "create", path: "style.css", content: css, description: "Premium responsive pricing styles" },
    { operation: "create", path: "script.js", content: js, description: "Monthly/yearly pricing toggle" },
    { operation: "create", path: "README.md", content: `# ${title}\n\nGenerated by Meldex Workspace.\n\n## Files\n\n- index.html\n- style.css\n- script.js\n\n## Validation\n\nPreview must render HTML, load CSS/JS, and contain no raw model JSON or unresolved placeholders.\n`, description: "Project notes" },
  ];
  return onlyStaticCoreFilesRequested(prompt) ? files.filter((file) => ["index.html", "style.css", "script.js"].includes(file.path)) : files;
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
  const wantsContinuity = wantsWorkspaceContinuity(prompt);
  const relatedTasks = memory.recentTasks
    .map((task) => ({ task, score: lower.split(/[^a-z0-9]+/).filter((word) => word.length > 3 && task.prompt.toLowerCase().includes(word)).length + (wantsContinuity ? 3 : 0) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.task);
  const styleOnlyLines = [
    "Memory mode: style hints only. Do not reuse previous product names, sections, copy, generated content, or page type unless the user explicitly asks to continue or modify previous work.",
    memory.designStyle.length ? `Reusable design preferences: ${memory.designStyle.slice(0, 4).join("; ")}` : "",
    memory.codingStyle.length ? `Reusable coding preferences: ${memory.codingStyle.slice(0, 4).join("; ")}` : "",
    memory.knownIssues.length ? `Avoid known issues: ${memory.knownIssues.slice(0, 3).join("; ")}` : "",
  ].filter(Boolean).join("\n");
  const continuityLines = [
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
  const lines = wantsContinuity ? continuityLines : styleOnlyLines;
  return {
    snippet: lines ? `[Relevant Workspace Memory]\n${lines.slice(0, 2600)}` : "",
    relatedTaskCount: wantsContinuity ? relatedTasks.length : 0,
    reusedStyle: (memory.designStyle.length > 0 || memory.codingStyle.length > 0) && !wantsContinuity,
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
  const allowedCoreFiles = new Set(["index.html", "style.css", "script.js"]);
  const normalizedFiles: WorkspaceFileAction[] = files
    .map((file) => ({
      ...file,
      operation: file.operation || "create",
      path: safeRelative(file.path || ""),
      content: file.operation === "delete" ? file.content : decodeGeneratedContent(file.content),
    }))
    .filter((file) => file.path)
    .filter((file) => !onlyStaticCoreFilesRequested(prompt) || allowedCoreFiles.has(file.path));
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

  const interactionsRequired = staticInteractionsRequired(prompt, htmlContent);
  const hasCss = nextFiles.some((file) => file.path === "style.css" && file.operation !== "delete" && (file.content || "").trim().length >= 500 && !looksLikeRawModelDump(file.content) && !hasUnresolvedTemplatePlaceholder(file.content));
  const hasJs = nextFiles.some((file) => file.path === "script.js" && file.operation !== "delete" && (file.content || "").trim().length >= (interactionsRequired ? 200 : 40) && !looksLikeRawModelDump(file.content) && !hasUnresolvedTemplatePlaceholder(file.content));
  const fallback = staticFallbackFiles(prompt, "missing required static asset");
  if (!hasCss) nextFiles.push(fallback.find((file) => file.path === "style.css")!);
  if (!hasJs) nextFiles.push(fallback.find((file) => file.path === "script.js")!);
  nextFiles = [...new Map(nextFiles.map((file) => [file.path, file])).values()];

  const invalidContent = nextFiles.some((file) =>
    file.operation !== "delete" &&
    /\.(html|css|js)$/i.test(file.path) &&
    (looksLikeRawModelDump(file.content || "") || hasUnresolvedTemplatePlaceholder(file.content || ""))
  );
  const completenessIssues = staticFileCompletenessIssues(nextFiles, prompt);
  const finalFiles = invalidContent || completenessIssues.length ? staticFallbackFiles(prompt, invalidContent ? "raw model dump or unresolved placeholder detected" : completenessIssues.join("; ")) : nextFiles;
  return onlyStaticCoreFilesRequested(prompt) ? finalFiles.filter((file) => allowedCoreFiles.has(file.path)) : finalFiles;
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

export function detectWorkspaceContextLeak(files: WorkspaceFileAction[], prompt = "") {
  const content = files.map((file) => `${file.path}\n${file.content || ""}`).join("\n").toLowerCase();
  const domain = promptDomain(prompt);
  const requiredEntities = promptRequiredEntities(prompt);
  const optionalRequirements = promptOptionalRequirements(prompt);
  const missingRequiredEntities: string[] = [];
  const repairHints: string[] = [];
  const hardFindings: string[] = [];

  for (const subject of requiredEntities) {
    const words = cleanSubjectTerm(subject).toLowerCase().split(/\s+/).filter((word) => word.length > 2 && !GENERIC_PROMPT_SUBJECTS.has(word));
    if (words.length && !words.some((word) => content.includes(word))) {
      missingRequiredEntities.push(subject);
    }
  }

  if (domain === "gujarati_food_delivery") {
    if (!/(tasty gujarat|gujarati|food|dhokla|fafda|khaman|thali|delivery)/i.test(content)) missingRequiredEntities.push("Gujarati food delivery context");
    if (/\bmeldex pricing|choose the right meldex plan|ai saas pricing|monthly|yearly\s+save/i.test(content)) hardFindings.push("Old Meldex pricing content leaked into Gujarati food task.");
  }
  if (domain === "fitness_saas") {
    if (!/(fitflow|fitness|workout|training|coach|recovery|wellness)/i.test(content)) missingRequiredEntities.push("FitFlow AI fitness context");
    if (/\bmeldex pricing|tasty gujarat|gujarati|dhokla|fafda|khaman/i.test(content)) hardFindings.push("Previous pricing or food content leaked into FitFlow task.");
  }
  if (domain === "book_summary_app") {
    if (!/(booknest|book summary|summaries|reading|reader|bookshelf|library|chapter|author|ai-powered book)/i.test(content)) missingRequiredEntities.push("BookNest AI book summary context");
    if (/\bfitflow|tasty gujarat|meldex pricing|choose the right meldex plan|ai saas pricing|dhokla|fafda|khaman/i.test(content)) hardFindings.push("Previous workspace content leaked into BookNest task.");
  }
  if (domain === "pricing") {
    if (promptRequiresPricing(prompt) && !/(pricing|price|plan|monthly|yearly|subscription)/i.test(content)) missingRequiredEntities.push("pricing context");
  }

  for (const requirement of optionalRequirements) {
    if (requirement === "FAQ" && !/\bfaq|question|answer\b/i.test(content)) repairHints.push("FAQ section may be missing.");
    if (requirement === "hero section" && !/\bhero|headline|section\b/i.test(content)) repairHints.push("Hero section may be missing.");
    if (requirement === "animations" && !/\banimation|transition|intersectionobserver|reveal|hover\b/i.test(content)) repairHints.push("Animation behavior may be missing.");
    if (requirement === "responsive layout" && !/@media|viewport|responsive/i.test(content)) repairHints.push("Responsive layout may be incomplete.");
    if (requirement === "pricing or plan cards" && !/\bpricing|price|plan|monthly|yearly|subscription\b/i.test(content)) repairHints.push("Pricing or plan cards may be missing.");
    if (requirement === "food/menu sections" && !/\bmenu|dish|food|delivery|thali|gujarati\b/i.test(content)) repairHints.push("Food/menu sections may be missing.");
    if (requirement === "book summary app context" && !/\bbook|summary|reading|reader|chapter|author|library\b/i.test(content)) repairHints.push("Book summary app context may be incomplete.");
  }

  const findings = [...new Set([...missingRequiredEntities.map((item) => `Missing required entity: ${item}`), ...hardFindings])];
  return {
    ok: findings.length === 0,
    repairRecommended: repairHints.length > 0,
    findings,
    repairHints: [...new Set(repairHints)],
    missingRequiredEntities: [...new Set(missingRequiredEntities)],
    requiredEntities,
    optionalRequirements,
    memoryContextOnly: [],
    designRequirements: optionalRequirements.filter((item) => ["responsive layout", "animations"].includes(item)),
    validationHints: optionalRequirements,
    domain,
    subjects: requiredEntities.map((item) => item.toLowerCase()),
  };
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
  const standaloneGeneration = isStandaloneWebsiteGeneration(prompt);
  const readableFiles = standaloneGeneration
    ? files.filter((filePath) => /(^|\/)(package\.json|README\.md|tsconfig\.json|next\.config\.(js|ts)|vite\.config\.(js|ts))$/i.test(filePath)).slice(0, 40)
    : files.slice(0, 240);
  const allReadable = await Promise.all(readableFiles.map(async (filePath) => {
    try {
      const content = await readFile(resolveProjectFile(storagePath, filePath).absolute, "utf8");
      return { path: filePath, content: content.slice(0, 9000) };
    } catch {
      return { path: filePath, content: "" };
    }
  }));
  const graph = buildProjectKnowledgeGraph(allReadable);
  const ranked = rankSemanticFiles({ taskId: projectId, prompt, files: allReadable }, graph);
  const relevantSource = standaloneGeneration
    ? ranked.filter((file) => /package\.json|README\.md|config/i.test(file.path)).slice(0, 4)
    : (ranked.length ? ranked : allReadable).slice(0, 12);
  const relevant = relevantSource.map((file) => ({
    path: file.path,
    content: standaloneGeneration ? "" : file.content.slice(0, 7000),
    score: "score" in file ? file.score : 0,
    reasons: standaloneGeneration ? ["standalone_generation_no_old_content"] : "reasons" in file ? file.reasons : [],
  }));
  const memory = userId ? (await readWorkspaceMemorySnapshot(userId, projectId).catch(() => null))?.memory : undefined;
  const memoryContext = memory ? workspaceMemoryPrompt(memory, prompt) : { snippet: "", relatedTaskCount: 0, reusedStyle: false, avoidedIssue: false };
  return { projectId, projectFiles: files.slice(0, 120), relevantFiles: relevant, memory, memoryContext, knowledgeGraph: graph, rankedFiles: ranked.slice(0, 16), taskIsolation: { standaloneGeneration, domain: promptDomain(prompt), subjectTerms: promptSubjectTerms(prompt), continuity: wantsWorkspaceContinuity(prompt) } };
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

function extractNamedFileSection(raw: string, fileName: string) {
  const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:#{1,6}\\s*)?(?:file\\s*:?\\s*)?${escaped}\\s*(?:\\n|:)\\s*(?:\\\`\\\`\\\`[a-zA-Z0-9_-]*\\s*)?([\\s\\S]*?)(?=\\n\\s*(?:#{1,6}\\s*)?(?:file\\s*:?\\s*)?(?:index\\.html|style\\.css|script\\.js)\\s*(?:\\n|:)|\\n\\s*\\\`\\\`\\\`\\s*$|$)`, "i");
  return raw.match(pattern)?.[1]?.replace(/```$/g, "").trim();
}

function splitInlineStaticAssets(html = "") {
  let css = "";
  let js = "";
  let nextHtml = html;
  nextHtml = nextHtml.replace(/<style[^>]*>([\s\S]*?)<\/style>/i, (_match, body) => {
    css = String(body || "").trim();
    return '<link rel="stylesheet" href="./style.css">';
  });
  nextHtml = nextHtml.replace(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/i, (_match, body) => {
    js = String(body || "").trim();
    return '<script src="./script.js"></script>';
  });
  return { html: nextHtml, css, js };
}

function staticInteractionsRequired(prompt = "", html = "") {
  return /\b(faq|accordion|menu|mobile menu|smooth|animation|animated|toggle|filter|modal|tabs|carousel|form|interactive|working buttons?)\b/i.test(`${prompt}\n${html}`);
}

export function staticFileCompletenessIssues(files: WorkspaceFileAction[], prompt = "") {
  const byPath = new Map(files.filter((file) => file.operation !== "delete").map((file) => [file.path, (file.content || "").trim()]));
  const html = byPath.get("index.html") || "";
  const css = byPath.get("style.css") || "";
  const js = byPath.get("script.js") || "";
  const interactionsRequired = staticInteractionsRequired(prompt, html);
  const issues: string[] = [];
  if (html.length < 1500) issues.push("index.html is incomplete or too short.");
  if (!/<!doctype html|<html[\s>]/i.test(html)) issues.push("index.html must contain a valid HTML shell.");
  if (!/href=["']\.\/style\.css["']/i.test(html)) issues.push("index.html must link ./style.css.");
  if (!/src=["']\.\/script\.js["']/i.test(html)) issues.push("index.html must load ./script.js.");
  if (css.length < 500) issues.push("style.css is empty or too short for a premium page.");
  if (interactionsRequired && js.length < 200) issues.push("script.js is empty or too short for requested interactions.");
  if (/^[\s]*[{[]/.test(html)) issues.push("preview HTML looks like raw JSON/text.");
  if (files.some((file) => hasUnresolvedTemplatePlaceholder(file.content || ""))) issues.push("generated files contain unresolved template placeholders.");
  if (files.some((file) => looksLikeRawModelDump(file.content || ""))) issues.push("generated files contain raw model output.");
  return issues;
}

function parseLooseWorkspaceResponse(raw: string): WorkspaceAgentResponse {
  const sectionHtml = extractNamedFileSection(raw, "index.html");
  const sectionCss = extractNamedFileSection(raw, "style.css");
  const sectionJs = extractNamedFileSection(raw, "script.js");
  const htmlCandidate = extractFence(raw, "html") || sectionHtml || (/<!doctype html|<html[\s>]/i.test(raw) && !looksLikeRawModelDump(raw) ? raw.trim() : "");
  const split = splitInlineStaticAssets(htmlCandidate);
  const html = split.html;
  const css = extractFence(raw, "css") || sectionCss || split.css;
  const js = extractFence(raw, "js|javascript") || sectionJs || split.js;
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

  if (isStaticWebsitePrompt(raw)) {
    return {
      plan: ["Recover static website output", "Create required static files", "Verify preview"],
      files: staticFallbackFiles(raw, "model response could not be parsed"),
      commands: ["static-preview-verify"],
      summary: "Recovered a static website from an unparseable model response.",
      warnings: ["Model response was not parseable as strict JSON; generated safe static files instead."],
    };
  }

  return {
    plan: ["Read model response"],
    files: [],
    commands: [],
    summary: looksLikeRawModelDump(raw) ? "The model returned an unparseable response with no safe file actions." : safeMemoryText(raw, 600),
  };
}

function parsePatchJson(raw: string): WorkspacePatchResponse {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(trimmed) as WorkspacePatchResponse;
    return {
      patches: Array.isArray(parsed.patches)
        ? parsed.patches
            .filter((patch) => patch && typeof patch.path === "string" && typeof patch.find === "string" && typeof patch.replace === "string")
            .map((patch) => ({
              path: safeRelative(patch.path),
              find: decodeGeneratedContent(patch.find),
              replace: decodeGeneratedContent(patch.replace),
              description: patch.description,
            }))
        : [],
      summary: parsed.summary,
      warnings: parsed.warnings || [],
    };
  } catch {
    return { patches: [], summary: "Model returned an unparseable patch response.", warnings: ["Patch response was not valid JSON."] };
  }
}

export async function askWorkspacePatch(
  prompt: string,
  targetFiles: Array<{ path: string; content: string }>,
  runtime?: { userId?: string; taskType?: string }
): Promise<WorkspacePatchResponse> {
  const cssOnly = targetFiles.length === 1 && targetFiles[0]?.path === "style.css";
  const outputBudget = cssOnly
    ? { maxTokens: 650, category: "style_patch", targetRange: "400-800", reason: "Style-only patch should return a small find/replace patch." }
    : { maxTokens: 900, category: "small_patch", targetRange: "600-1200", reason: "Small edit patch should avoid full file regeneration." };
  const fileContext = targetFiles.map((file) => {
    const content = file.content.length > 6000 ? `${file.content.slice(0, 3000)}\n\n/* ...middle omitted for patch brevity... */\n\n${file.content.slice(-2500)}` : file.content;
    return `### ${file.path}\n\`\`\`\n${content}\n\`\`\``;
  }).join("\n\n");
  const completion = await generateChatCompletionWithUsage({
    temperature: 0.1,
    maxTokens: outputBudget.maxTokens,
    timeoutMs: 60_000,
    userId: runtime?.userId,
    taskType: runtime?.taskType || "workspace_patch",
    messages: [
      {
        role: "system",
        content: `You are Meldex AI patch mode powered by Qwen3-Coder.
Return JSON only:
{
  "patches": [{"path":"relative/file","find":"exact existing snippet","replace":"new snippet","description":"brief"}],
  "summary":"short summary",
  "warnings":[]
}
Rules:
- Return patches only, never full files.
- Each find snippet must be copied exactly from the provided file context.
- Use the smallest stable snippet that uniquely identifies the change.
- Do not modify unrelated files.
- Do not include markdown or explanations.`,
      },
      {
        role: "user",
        content: `Task:\n${prompt}\n\nTarget files:\n${targetFiles.map((file) => file.path).join(", ")}\n\nExisting content:\n${fileContext}`,
      },
    ],
  });
  const parsed = parsePatchJson(completion.content);
  return {
    ...parsed,
    usage: completion.usage,
    provider: completion.provider,
    model: completion.model,
    rawContent: completion.content,
    outputBudget,
  };
}

export async function askWorkspaceAgent(prompt: string, context: Awaited<ReturnType<typeof buildWorkspaceContext>>, orchestrationInstruction = "", runtime?: { userId?: string; taskType?: string }) {
  const taskIsolation = context.taskIsolation || {
    standaloneGeneration: false,
    domain: promptDomain(prompt),
    subjectTerms: promptSubjectTerms(prompt),
    continuity: wantsWorkspaceContinuity(prompt),
  };
  const runtimeV4 = buildCliRuntimeV4Plan({
    taskId: `${context.projectId}:${runtime?.taskType || "workspace_agent"}`,
    prompt,
    files: context.relevantFiles.map((file) => ({ path: file.path, content: file.content })),
    memorySnippet: context.memoryContext?.snippet || "",
    styleRules: taskIsolation.standaloneGeneration ? [] : context.memory?.designStyle || [],
    taskType: runtime?.taskType || "workspace_agent",
  });
  const staticEditPrompt = /\b(change|update|edit|modify|add|regenerate|style\.css|script\.js|index\.html|hero|headline|button|faq|accordion|color|glassmorphism)\b/i.test(prompt)
    && !/\b(next|react|vite|api|backend|database|prisma|auth|typescript|tsx|server|route)\b/i.test(prompt);
  const staticFastPrompt = (isStaticWebsitePrompt(prompt) || staticEditPrompt) && runtime?.taskType === "workspace_agent_stream";
  const websiteDesignerRules = (isStaticWebsitePrompt(prompt) || staticEditPrompt) ? `
Static Website Quality Contract:
- Return complete dependency-free files only. Use index.html, style.css, and script.js for static landing pages unless the user explicitly requests more.
- For edit prompts, return only the requested changed static files.
- Keep output complete but concise. Do not include markdown, explanations, README, package files, raw JSON dumps, placeholders, or internal files.
- Build a premium visual system with strong hero, polished sections, responsive cards, clear CTA hierarchy, accessible focus states, mobile navigation, FAQ/interactions when relevant, and reduced-motion support.
- Include or preserve valid links from index.html to ./style.css and ./script.js.
- Self-check before returning: non-empty HTML/CSS/JS, no overflow at mobile widths, no console-breaking JS, and visible copy must match the current prompt subject.` : "";
  const system = staticFastPrompt ? `You are Meldex AI Workspace Agent powered by Qwen3-Coder.
Return JSON only:
{
  "plan": ["step"],
  "files": [{"operation":"create|edit|delete","path":"relative/path","content":"full final content","description":"brief"}],
  "commands": [],
  "summary": "short final summary",
  "warnings": []
}
Rules: one model only, current prompt wins, static files must be complete, concise, dependency-free, and production-quality.
${websiteDesignerRules}` : `You are Meldex AI Workspace Agent powered by Qwen3-Coder.
Return JSON only:
{
  "plan": ["step"],
  "files": [{"operation":"create|edit|delete","path":"relative/path","content":"full final content","description":"brief"}],
  "commands": ["safe validation or preview command"],
  "summary": "short final summary",
  "warnings": []
}
Rules: use relative paths, avoid secrets, do not add dependencies for static HTML, prefer minimal patches, and create complete working files.
Current Prompt Dominance:
- The current user prompt is the source of truth and has higher priority than workspace memory, previous tasks, existing files, and project summaries.
- Do not reuse previous generated page content, product names, copy, page type, or sections unless the prompt explicitly says continue, update, modify, same, previous, or existing.
- If the current prompt names a product, brand, domain, or audience, visible copy and sections must match that current prompt.
- Memory is allowed only for reusable style/coding preferences when this is a new standalone task.
- If standaloneGeneration=true, overwrite/create the requested files for the new task instead of adapting old page content.
Coding Engine V2:
- Internally run: understand request, detect project type, detect framework, plan architecture, plan files, plan reusable components, plan state/data flow, generate code, self-review, run checks, fix errors, refactor if needed, verify final output.
- Before coding decide folder structure, components, utilities, data model, API routes, validation, state management, styling approach, and testing approach.
- Static sites must remain dependency-free unless explicitly requested. Honor explicit file-count constraints exactly.
- React/Vite must use correct main entry, component imports, CSS import, and no Next-only APIs.
- Next.js must follow existing app/pages router conventions, server/client boundaries, metadata, imports, and route placement.
- Backend tasks should use routes/controllers/services/middleware/validators/utils when creating new structure, with validation, error handling, status codes, and safe defaults.
- Use reusable components/constants/helpers, clean names, small functions, and separation of concerns. Avoid giant files, repeated code, fake imports, unused imports, placeholder TODOs, broken paths, and duplicate logic.
- Do not add dependencies unless necessary and already present; if required, explain in warnings.
- README for generated projects must include what was built, how to run, file structure, preview command, and next steps.
- Internal coding quality score must be 85+ before returning.
${websiteDesignerRules}`;

  const fileContext = context.relevantFiles.map((file) => `### ${file.path}\n\`\`\`\n${file.content}\n\`\`\``).join("\n\n");
  const runtimePrompt = buildQwenRuntimePrompt(runtimeV4);
  const outputBudget = estimateWorkspaceOutputBudget(prompt);
  const dominanceBlock = [
    "[CURRENT PROMPT - HIGHEST PRIORITY]",
    prompt,
    "",
    `[Task isolation] standaloneGeneration=${taskIsolation.standaloneGeneration}; continuity=${taskIsolation.continuity}; domain=${taskIsolation.domain}; subjects=${taskIsolation.subjectTerms.join(", ") || "none"}`,
    "Do not let old workspace content override this prompt. If old context conflicts, ignore the old context.",
    taskIsolation.standaloneGeneration ? "This is a fresh standalone generation. Generate files for this prompt only. Do not copy previous index.html/style.css/script.js concepts." : "",
  ].filter(Boolean).join("\n");
  const staticEditOnly = staticEditPrompt && !isStaticWebsitePrompt(prompt);
  const userContent = staticFastPrompt
    ? `${dominanceBlock}

Task:
${prompt}

Output contract:
- ${staticEditOnly ? "Return only the requested changed static file(s), with complete final content for each returned file." : "Create complete index.html, style.css, and script.js."}
- ${staticEditOnly ? "Do not return unrelated files." : "index.html links ./style.css and ./script.js."}
- No dependencies, no README, no package files, no old workspace content.
- Keep output complete but concise.`
    : `${dominanceBlock}\n\n${runtimePrompt}\n\nTask:\n${prompt}\n\n${orchestrationInstruction ? `Runtime orchestration instruction:\n${orchestrationInstruction}\n\n` : ""}Project files list only:\n${context.projectFiles.join("\n") || "(empty)"}\n\n${context.memoryContext?.snippet || ""}\n\nRelevant context fallback:\n${fileContext || (taskIsolation.standaloneGeneration ? "(old generated file content intentionally isolated for this new task)" : "(empty workspace)")}`;
  const completion = await generateChatCompletionWithUsage({
    temperature: 0.2,
    maxTokens: outputBudget.maxTokens,
    timeoutMs: 120_000,
    userId: runtime?.userId,
    taskType: runtime?.taskType || "workspace_agent",
    messages: [
      { role: "system", content: [system, orchestrationInstruction, staticFastPrompt ? "Qwen3-Coder 32B is the only coding model." : "Use the Meldex CLI Runtime V4 contract below. Qwen3-Coder 32B is the only coding model."].filter(Boolean).join("\n\n") },
      { role: "user", content: userContent },
    ],
  });
  const parsed = parseAgentJson(completion.content);
  const reflection = localReflectRuntimeOutput(parsed.files || [], prompt);
  return {
    ...parsed,
    warnings: [...(parsed.warnings || []), ...(reflection.ok ? [] : reflection.issues)],
    usage: completion.usage,
    provider: completion.provider,
    model: completion.model,
    rawContent: completion.content,
    runtimeV4: {
      events: runtimeV4.events as RuntimeV4Event[],
      scratchpad: runtimeV4.scratchpad,
      graphSummary: runtimeV4.graph.summary,
      rankedFiles: runtimeV4.rankedFiles.slice(0, 10).map((file) => ({ path: file.path, score: file.score, reasons: file.reasons })),
      packedContext: { files: runtimeV4.packedContext.files.length, omitted: runtimeV4.packedContext.omitted, charCount: runtimeV4.packedContext.charCount },
      dag: runtimeV4.dag,
      confidence: runtimeV4.confidence,
      reflection,
      outputBudget,
      promptCompression: {
        enabled: staticFastPrompt,
        inputChars: userContent.length,
        omitted: staticFastPrompt ? ["runtime_v4_prompt", "full_memory_snippet", "relevant_file_contents", "workspace_docs"] : [],
      },
    },
  };
}

export function estimateWorkspaceOutputBudget(prompt: string) {
  const lower = prompt.toLowerCase();
  const explicitLargeApp = /\b(full[- ]stack|large app|multi[- ]page|dashboard|admin|backend|api|database|auth|next\.?js|react|vite|typescript|tsx|e[- ]commerce app|saas app)\b/i.test(prompt);
  const landingPage = isStaticWebsitePrompt(prompt) && /\b(landing|website|site|homepage|hero)\b/i.test(prompt);
  const premiumStatic = isStaticWebsitePrompt(prompt) && /\b(premium|award|beautiful|animated|modern|luxury|saas|responsive|polished|pixel[- ]perfect)\b/i.test(prompt);
  const smallStaticEdit = /\b(change|update|fix|edit|modify|color|headline|copy|button|faq|accordion|style\.css|script\.js|index\.html|regenerate)\b/i.test(prompt)
    && !/\b(next|react|vite|api|backend|database|prisma|auth|typescript|tsx|server|route)\b/i.test(prompt);
  if (explicitLargeApp) {
    return {
      maxTokens: /\b(scaffold|full[- ]stack|multi[- ]page|large app)\b/i.test(prompt) ? 8600 : 7000,
      category: "large_app",
      targetRange: "7000-9000",
      reason: "Prompt asks for an app or framework-level project.",
    };
  }
  if (smallStaticEdit) {
    if (/\bstyle\.css\b/i.test(prompt) && (/\bonly\b|do not change|don'?t change|regenerate style\.css/i.test(prompt))) {
      return {
        maxTokens: 1200,
        category: "style_only_edit",
        targetRange: "900-1400",
        reason: "Style-only edit should not request a full-page budget.",
      };
    }
    return {
      maxTokens: /\bfaq|accordion\b/i.test(prompt) ? 1400 : 900,
      category: "small_edit",
      targetRange: "700-1500",
      reason: "Small static edit should avoid large output budgets.",
    };
  }
  if (premiumStatic) {
    return {
      maxTokens: 3800,
      category: "premium_static_page",
      targetRange: "3500-4200",
      reason: "Premium static website uses a compact turbo budget to avoid provider timeouts.",
    };
  }
  if (landingPage) {
    return {
      maxTokens: 4400,
      category: "landing_page",
      targetRange: "4000-6000",
      reason: "Landing page needs complete sections while staying below large-project budgets.",
    };
  }
  if (isStaticWebsitePrompt(prompt)) {
    return {
      maxTokens: lower.includes("simple") ? 3000 : 3800,
      category: "static_landing_page",
      targetRange: "3000-4000",
      reason: "Static landing page fast path keeps output compact and quick.",
    };
  }
  return {
    maxTokens: 4200,
    category: "standard_workspace_task",
    targetRange: "3500-5000",
    reason: "Default workspace task budget.",
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
  return /\b(website|landing|portfolio|pricing|contact|static|html|page|site)\b/i.test(prompt) ||
    /(વેબસાઇટ|લેન્ડિંગ|પેજ|સાઇટ|હોટેલ|ફૂડ|ડિલિવરી|બનાવ|बनाव|बनाओ|पेज|वेबसाइट|साइट)/i.test(prompt);
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
