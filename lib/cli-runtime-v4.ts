import path from "path";

export type RuntimeV4Event = {
  type: string;
  message: string;
  payload: Record<string, unknown>;
};

export type RuntimeFile = {
  path: string;
  content: string;
  active?: boolean;
  recent?: boolean;
};

export type RuntimeFileAction = {
  operation?: "create" | "edit" | "update" | "delete";
  action?: "create" | "update" | "delete";
  path: string;
  content?: string;
  description?: string;
};

export type RuntimeScratchpad = {
  taskId: string;
  goal: string;
  currentStatus: "created" | "running" | "blocked" | "completed";
  filesInspected: string[];
  filesToEdit: string[];
  assumptions: string[];
  risks: string[];
  completedSteps: string[];
  nextStep: string;
  validationPlan: string[];
  errorsFound: string[];
  fixesAttempted: string[];
  finalResult?: string;
  updatedAt: string;
};

export type RuntimeKnowledgeGraph = {
  nodes: Array<{ id: string; type: string; label: string; path?: string }>;
  edges: Array<{ from: string; to: string; type: string }>;
  summary: {
    files: number;
    components: number;
    apiRoutes: number;
    databaseModels: number;
    configs: number;
    styles: number;
    tests: number;
    dependencies: string[];
  };
};

export type RankedRuntimeFile = RuntimeFile & {
  score: number;
  reasons: string[];
};

export type PackedRuntimeContext = {
  prompt: string;
  files: RankedRuntimeFile[];
  scratchpad: RuntimeScratchpad;
  graphSummary: RuntimeKnowledgeGraph["summary"];
  memorySnippet: string;
  styleRules: string[];
  charCount: number;
  omitted: number;
};

export type RuntimeDagNode = {
  id: string;
  title: string;
  dependencies: string[];
  status: "pending" | "running" | "completed" | "failed";
  affectedFiles: string[];
  validation: string[];
  result?: string;
};

export type RuntimeDag = {
  enabled: boolean;
  nodes: RuntimeDagNode[];
};

export type RuntimeConfidence = {
  stage: string;
  score: number;
  decision: "auto_proceed" | "read_more" | "reduce_scope" | "ask_user" | "block";
  reason: string;
};

export type RuntimeReflection = {
  ok: boolean;
  issues: string[];
  repairInstruction?: string;
};

export type RuntimeV4Input = {
  taskId: string;
  prompt: string;
  files: RuntimeFile[];
  activeFile?: string;
  recentFiles?: string[];
  memorySnippet?: string;
  previousTaskSummary?: string;
  knownErrors?: string[];
  styleRules?: string[];
  taskType?: string;
  maxContextChars?: number;
};

export type RuntimeV4Plan = {
  scratchpad: RuntimeScratchpad;
  graph: RuntimeKnowledgeGraph;
  rankedFiles: RankedRuntimeFile[];
  packedContext: PackedRuntimeContext;
  dag: RuntimeDag;
  confidence: RuntimeConfidence[];
  finalInstruction: string;
  events: RuntimeV4Event[];
};

const SECRET_PATH_RE = /(^|[\\/])\.env(\.|$)|secret|credential|private[-_]?key|id_rsa|token/i;
const GENERATED_RE = /(^|[\\/])(node_modules|\.next|dist|build|coverage|vendor|\.git)([\\/]|$)/i;

function event(type: string, message: string, payload: Record<string, unknown> = {}): RuntimeV4Event {
  return { type, message, payload };
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9_.-]+/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 2);
}

function fileKind(filePath: string) {
  const lower = filePath.toLowerCase();
  if (/\/route\.(ts|js)$|\/api\/|routes?\//.test(lower)) return "api_route";
  if (/\.(tsx|jsx)$/.test(lower) || /components?\//.test(lower)) return "component";
  if (/prisma\/schema\.prisma$|models?\//.test(lower)) return "database_model";
  if (/package\.json$|tsconfig|next\.config|vite\.config|tailwind\.config|postcss\.config/.test(lower)) return "config";
  if (/\.(css|scss|sass)$|styles?\//.test(lower)) return "style";
  if (/\.(test|spec)\.(ts|tsx|js|jsx)$|__tests__/.test(lower)) return "test";
  return "file";
}

export function createRuntimeScratchpad(input: RuntimeV4Input): RuntimeScratchpad {
  return {
    taskId: input.taskId,
    goal: input.prompt.trim(),
    currentStatus: "created",
    filesInspected: [],
    filesToEdit: [],
    assumptions: ["Use existing project conventions.", "Do not expose secrets.", "Prefer minimal scoped edits."],
    risks: input.knownErrors?.slice(0, 6) || [],
    completedSteps: [],
    nextStep: "Build project graph and rank files.",
    validationPlan: ["Run local reflection.", "Verify preview/build/test when relevant."],
    errorsFound: input.knownErrors?.slice(0, 8) || [],
    fixesAttempted: [],
    updatedAt: new Date().toISOString(),
  };
}

export function updateRuntimeScratchpad(scratchpad: RuntimeScratchpad, patch: Partial<RuntimeScratchpad>): RuntimeScratchpad {
  return {
    ...scratchpad,
    ...patch,
    completedSteps: patch.completedSteps || scratchpad.completedSteps,
    filesInspected: patch.filesInspected || scratchpad.filesInspected,
    filesToEdit: patch.filesToEdit || scratchpad.filesToEdit,
    validationPlan: patch.validationPlan || scratchpad.validationPlan,
    updatedAt: new Date().toISOString(),
  };
}

export function buildProjectKnowledgeGraph(files: RuntimeFile[]): RuntimeKnowledgeGraph {
  const visibleFiles = files.filter((file) => !SECRET_PATH_RE.test(file.path) && !GENERATED_RE.test(file.path));
  const nodes: RuntimeKnowledgeGraph["nodes"] = [];
  const edges: RuntimeKnowledgeGraph["edges"] = [];
  const dependencies = new Set<string>();

  for (const file of visibleFiles) {
    const kind = fileKind(file.path);
    nodes.push({ id: file.path, type: kind, label: path.basename(file.path), path: file.path });

    const imports = [...file.content.matchAll(/(?:import\s+[^"']*from\s+|import\s*\(|require\()["']([^"']+)["']/g)]
      .map((match) => match[1])
      .slice(0, 80);
    for (const target of imports) {
      if (target.startsWith(".") || target.startsWith("@/")) {
        edges.push({ from: file.path, to: target, type: "imports" });
      } else {
        dependencies.add(target.split("/")[0].startsWith("@") ? target.split("/").slice(0, 2).join("/") : target.split("/")[0]);
      }
    }

    const exports = [...file.content.matchAll(/\bexport\s+(?:default\s+)?(?:function|const|class|type|interface)\s+([A-Za-z0-9_]+)/g)]
      .map((match) => match[1])
      .slice(0, 40);
    for (const symbol of exports) {
      const id = `${file.path}#${symbol}`;
      nodes.push({ id, type: "symbol", label: symbol, path: file.path });
      edges.push({ from: file.path, to: id, type: "exports" });
    }

    if (file.path.endsWith("package.json")) {
      try {
        const pkg = JSON.parse(file.content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
        Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }).forEach((dep) => dependencies.add(dep));
      } catch {}
    }
  }

  const byKind = (kind: string) => visibleFiles.filter((file) => fileKind(file.path) === kind).length;
  return {
    nodes,
    edges,
    summary: {
      files: visibleFiles.length,
      components: byKind("component"),
      apiRoutes: byKind("api_route"),
      databaseModels: byKind("database_model"),
      configs: byKind("config"),
      styles: byKind("style"),
      tests: byKind("test"),
      dependencies: [...dependencies].slice(0, 40),
    },
  };
}

export function rankSemanticFiles(input: RuntimeV4Input, graph: RuntimeKnowledgeGraph): RankedRuntimeFile[] {
  const tokens = tokenize(input.prompt);
  const active = input.activeFile || "";
  const recent = new Set(input.recentFiles || []);
  const graphConnected = new Map<string, number>();
  for (const edge of graph.edges) {
    graphConnected.set(edge.from, (graphConnected.get(edge.from) || 0) + 1);
    if (!edge.to.startsWith(".") && !edge.to.startsWith("@/")) continue;
    graphConnected.set(edge.to, (graphConnected.get(edge.to) || 0) + 1);
  }

  return input.files
    .filter((file) => !SECRET_PATH_RE.test(file.path) && !GENERATED_RE.test(file.path))
    .map((file) => {
      const lowerPath = file.path.toLowerCase();
      const lowerContent = file.content.toLowerCase().slice(0, 5000);
      const reasons: string[] = [];
      let score = 0;
      for (const token of tokens) {
        if (lowerPath.includes(token)) {
          score += 18;
          reasons.push(`path:${token}`);
        }
        if (lowerContent.includes(token)) {
          score += 5;
          reasons.push(`content:${token}`);
        }
      }
      if (file.path === active || file.active) {
        score += 35;
        reasons.push("active_file");
      }
      if (recent.has(file.path) || file.recent) {
        score += 14;
        reasons.push("recent_file");
      }
      const kind = fileKind(file.path);
      if (["component", "api_route", "database_model", "config", "style"].includes(kind)) {
        score += 8;
        reasons.push(kind);
      }
      if (/package\.json$|README\.md$|index\.html$|style\.css$|script\.js$/.test(file.path)) {
        score += 10;
        reasons.push("canonical_file");
      }
      score += Math.min(10, graphConnected.get(file.path) || 0);
      return { ...file, score, reasons: [...new Set(reasons)].slice(0, 8) };
    })
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

export function packIncrementalContext(input: RuntimeV4Input, scratchpad: RuntimeScratchpad, graph: RuntimeKnowledgeGraph, rankedFiles: RankedRuntimeFile[]): PackedRuntimeContext {
  const maxChars = input.maxContextChars || 18000;
  let charCount = input.prompt.length + (input.memorySnippet?.length || 0) + JSON.stringify(graph.summary).length;
  const packed: RankedRuntimeFile[] = [];
  for (const file of rankedFiles) {
    if (file.score <= 0 && packed.length >= 4) continue;
    const remaining = maxChars - charCount - file.path.length - 80;
    if (remaining <= 600) break;
    const content = file.content.length > remaining ? `${file.content.slice(0, Math.max(0, remaining - 80))}\n/* context compressed */` : file.content;
    packed.push({ ...file, content });
    charCount += content.length + file.path.length + 80;
  }
  return {
    prompt: input.prompt,
    files: packed,
    scratchpad,
    graphSummary: graph.summary,
    memorySnippet: input.memorySnippet?.slice(0, 2600) || "",
    styleRules: input.styleRules?.slice(0, 12) || [],
    charCount,
    omitted: Math.max(0, rankedFiles.length - packed.length),
  };
}

export function createTaskDag(input: RuntimeV4Input, rankedFiles: RankedRuntimeFile[]): RuntimeDag {
  const lower = input.prompt.toLowerCase();
  const complex = /\b(app|dashboard|backend|database|auth|ecommerce|multi-file|full|complete|system)\b/.test(lower) || rankedFiles.length > 6;
  if (!complex) return { enabled: false, nodes: [] };
  const affectedFiles = rankedFiles.slice(0, 8).map((file) => file.path);
  return {
    enabled: true,
    nodes: [
      { id: "plan", title: "Plan architecture", dependencies: [], status: "pending", affectedFiles: [], validation: ["scope approved by confidence gate"] },
      { id: "edit", title: "Apply focused edits", dependencies: ["plan"], status: "pending", affectedFiles, validation: ["patch guard"] },
      { id: "verify", title: "Verify runtime", dependencies: ["edit"], status: "pending", affectedFiles, validation: ["preview/build/test"] },
      { id: "learn", title: "Update memory and learning", dependencies: ["verify"], status: "pending", affectedFiles: [], validation: ["safe summary only"] },
    ],
  };
}

export function scoreRuntimeConfidence(input: RuntimeV4Input, packed: PackedRuntimeContext, dag: RuntimeDag): RuntimeConfidence[] {
  const hasRelevantContext = packed.files.some((file) => file.score > 0) || packed.graphSummary.files <= 4;
  const risky = /\b(delete|migration|production|deploy|payment|auth|security|database)\b/i.test(input.prompt);
  const contextScore = Math.max(35, Math.min(98, 72 + packed.files.length * 4 - packed.omitted * 0.8));
  const plannerScore = dag.enabled ? 86 : 92;
  const fileRankingScore = hasRelevantContext ? 90 : 58;
  const finalScore = Math.round((contextScore + plannerScore + fileRankingScore + (risky ? 70 : 92)) / 4);
  const decision: RuntimeConfidence["decision"] = finalScore >= 82 ? "auto_proceed" : finalScore >= 68 ? "read_more" : risky ? "ask_user" : "reduce_scope";
  return [
    { stage: "planner", score: plannerScore, decision: plannerScore >= 80 ? "auto_proceed" : "read_more", reason: dag.enabled ? "Task DAG created for complex task." : "Simple task does not need heavy DAG." },
    { stage: "file_ranking", score: fileRankingScore, decision: hasRelevantContext ? "auto_proceed" : "read_more", reason: hasRelevantContext ? "Relevant context selected." : "Weak file relevance; read/search more before broad edits." },
    { stage: "context_packing", score: Math.round(contextScore), decision: contextScore >= 75 ? "auto_proceed" : "reduce_scope", reason: `Packed ${packed.files.length} files; omitted ${packed.omitted}.` },
    { stage: "final_readiness", score: finalScore, decision, reason: risky ? "Risk-sensitive task requires stricter verification." : "Low/medium-risk task can proceed with local gates." },
  ];
}

export function localReflectRuntimeOutput(files: RuntimeFileAction[], prompt = ""): RuntimeReflection {
  const issues: string[] = [];
  const normalizedPaths = new Set(files.map((file) => file.path));
  const isStatic = /\b(website|landing|pricing|page|site|html|portfolio)\b/i.test(prompt);
  for (const file of files) {
    if (!file.path || file.path.includes("..") || path.isAbsolute(file.path) || /^[a-zA-Z]:/.test(file.path)) issues.push(`Unsafe path: ${file.path}`);
    if (SECRET_PATH_RE.test(file.path)) issues.push(`Secret-like path blocked: ${file.path}`);
    const content = file.content || "";
    if ((file.operation || file.action) !== "delete" && !content.trim()) issues.push(`Empty content: ${file.path}`);
    if (/^\s*[{[]/.test(content) && /\.(html|css|js|tsx|jsx|ts)$/.test(file.path)) issues.push(`Raw JSON/model dump in ${file.path}`);
    if ((content.match(/\\n/g) || []).length > 8) issues.push(`Escaped newline dump in ${file.path}`);
    if (/\$\{[a-zA-Z0-9_.[\]\s'"`+-]+}/.test(content)) issues.push(`Unresolved placeholder in ${file.path}`);
    if (/\b(todo|fixme|your-|placeholder)\b/i.test(content) && /\.(ts|tsx|js|jsx|html)$/.test(file.path)) issues.push(`Placeholder/TODO content in ${file.path}`);
  }
  if (isStatic) {
    for (const required of ["index.html", "style.css", "script.js", "README.md"]) {
      if (!normalizedPaths.has(required)) issues.push(`Missing static file: ${required}`);
    }
    const html = files.find((file) => file.path === "index.html")?.content || "";
    if (html && !/href=["']\.\/style\.css["']/i.test(html)) issues.push("index.html must link ./style.css");
    if (html && normalizedPaths.has("script.js") && !/src=["']\.\/script\.js["']/i.test(html)) issues.push("index.html must load ./script.js");
    if ([...normalizedPaths].some((file) => /(^|\/)package\.json$|server\.js$/.test(file))) issues.push("Static site task must not add package.json/server.js unless requested.");
  }
  return {
    ok: issues.length === 0,
    issues,
    repairInstruction: issues.length ? `Repair only these issues:\n${issues.join("\n")}` : undefined,
  };
}

export function buildQwenRuntimePrompt(plan: RuntimeV4Plan) {
  const contextFiles = plan.packedContext.files
    .map((file) => `### ${file.path} (${Math.round(file.score)}%, ${file.reasons.join(", ") || "ranked"})\n\`\`\`\n${file.content}\n\`\`\``)
    .join("\n\n");
  return [
    "MELDEX CLI RUNTIME V4 / QWEN3-CODER 32B OPTIMIZED",
    "Use Qwen for focused code generation only. Deterministic runtime already handled planning, graph, ranking, and context packing.",
    "Return valid JSON only. No markdown fences.",
    'Schema: {"summary":"...","plan":["..."],"files":[{"path":"relative/path","action":"create|update|delete","operation":"create|edit|delete","content":"full final content"}],"commands":[],"validation":["..."],"notes":[]}',
    "Rules: minimal patch, no secrets, no raw JSON preview, no unresolved ${...} placeholders, no unnecessary dependencies, no unrelated rewrites.",
    `Goal: ${plan.scratchpad.goal}`,
    `Scratchpad safe summary: next=${plan.scratchpad.nextStep}; risks=${plan.scratchpad.risks.join("; ") || "none"}; validation=${plan.scratchpad.validationPlan.join("; ")}`,
    `Knowledge graph: ${JSON.stringify(plan.graph.summary)}`,
    plan.dag.enabled ? `Task DAG: ${plan.dag.nodes.map((node) => `${node.id}:${node.title}`).join(" -> ")}` : "Task DAG: simple task, DAG skipped.",
    plan.packedContext.memorySnippet ? `Relevant memory:\n${plan.packedContext.memorySnippet}` : "",
    plan.packedContext.styleRules.length ? `Style rules:\n- ${plan.packedContext.styleRules.join("\n- ")}` : "",
    `Relevant files:\n${contextFiles || "(empty workspace)"}`,
    "Before returning, self-check locally in your response: schema valid, imports/paths valid, linked assets exist, no placeholders, no unrelated files.",
  ].filter(Boolean).join("\n\n").slice(0, 52000);
}

export function buildCliRuntimeV4Plan(input: RuntimeV4Input): RuntimeV4Plan {
  const events: RuntimeV4Event[] = [];
  let scratchpad = createRuntimeScratchpad(input);
  events.push(event("scratchpad_created", "Created persistent task scratchpad", { scratchpad }));

  const graph = buildProjectKnowledgeGraph(input.files);
  events.push(event("knowledge_graph_built", "Built project knowledge graph", { summary: graph.summary, nodes: graph.nodes.length, edges: graph.edges.length }));

  const rankedFiles = rankSemanticFiles(input, graph);
  const top = rankedFiles.slice(0, 10).map((file) => ({ path: file.path, score: Math.round(file.score), reasons: file.reasons }));
  events.push(event("file_ranking_done", "Ranked relevant files", { top }));

  scratchpad = updateRuntimeScratchpad(scratchpad, {
    currentStatus: "running",
    filesInspected: rankedFiles.slice(0, 8).map((file) => file.path),
    filesToEdit: rankedFiles.filter((file) => file.score >= 18).slice(0, 8).map((file) => file.path),
    completedSteps: ["Created scratchpad", "Built knowledge graph", "Ranked files"],
    nextStep: "Pack incremental context for Qwen3-Coder.",
  });
  events.push(event("scratchpad_updated", "Updated task scratchpad after file ranking", { scratchpad }));

  const packedContext = packIncrementalContext(input, scratchpad, graph, rankedFiles);
  events.push(event("context_packed", "Packed incremental context", { files: packedContext.files.length, omitted: packedContext.omitted, charCount: packedContext.charCount }));
  if (packedContext.omitted > 0) events.push(event("context_compressed", "Compressed old/noisy context", { omitted: packedContext.omitted }));

  const dag = createTaskDag(input, rankedFiles);
  if (dag.enabled) events.push(event("task_dag_created", "Created task DAG", { nodes: dag.nodes }));

  const confidence = scoreRuntimeConfidence(input, packedContext, dag);
  events.push(event("confidence_scored", "Scored runtime confidence", { confidence }));

  const finalInstruction = buildQwenRuntimePrompt({ scratchpad, graph, rankedFiles, packedContext, dag, confidence, finalInstruction: "", events });
  return { scratchpad, graph, rankedFiles, packedContext, dag, confidence, finalInstruction, events };
}

export function coerceUnifiedRuntimeOutput(rawContent: string): {
  summary?: string;
  plan?: string[];
  files: RuntimeFileAction[];
  commands?: string[];
  validation?: string[];
  notes?: string[];
  rawParsed: boolean;
} {
  const trimmed = rawContent.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || trimmed).trim();
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first === -1 || last <= first) {
    return { summary: rawContent.slice(0, 800), files: [], rawParsed: false };
  }
  try {
    const parsed = JSON.parse(candidate.slice(first, last + 1)) as {
      summary?: unknown;
      plan?: unknown;
      files?: unknown;
      commands?: unknown;
      validation?: unknown;
      notes?: unknown;
    };
    const files = Array.isArray(parsed.files) ? parsed.files.map((item) => {
      const file = (item || {}) as Record<string, unknown>;
      const action = file.action === "delete" ? "delete" : file.action === "update" ? "update" : file.action === "create" ? "create" : undefined;
      const operation = file.operation === "delete" ? "delete" : file.operation === "edit" ? "edit" : file.operation === "create" ? "create" : action === "update" ? "edit" : action;
      return {
        operation,
        action,
        path: String(file.path || file.file || file.filename || ""),
        content: typeof file.content === "string" ? file.content : file.content == null ? "" : JSON.stringify(file.content, null, 2),
        description: typeof file.description === "string" ? file.description : undefined,
      } satisfies RuntimeFileAction;
    }).filter((file) => file.path) : [];
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
      plan: Array.isArray(parsed.plan) ? parsed.plan.map(String).slice(0, 12) : undefined,
      files,
      commands: Array.isArray(parsed.commands) ? parsed.commands.map(String).slice(0, 12) : undefined,
      validation: Array.isArray(parsed.validation) ? parsed.validation.map(String).slice(0, 12) : undefined,
      notes: Array.isArray(parsed.notes) ? parsed.notes.map(String).slice(0, 12) : undefined,
      rawParsed: true,
    };
  } catch {
    return { summary: rawContent.slice(0, 800), files: [], rawParsed: false };
  }
}
