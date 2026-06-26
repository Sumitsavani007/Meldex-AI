#!/usr/bin/env node
const cp = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const lab = path.join(root, ".real-benchmarks");
const baselines = path.join(lab, "baselines");
const runs = path.join(lab, "runs");
const logs = path.join(lab, "logs");
const cli = path.join(root, "meldex-vscode-extension", "meldex-agent-cli", "bin", "meldex-agent.js");
const token = process.env.MELDEX_TOKEN;

if (!token) {
  console.error("MELDEX_TOKEN is required");
  process.exit(1);
}

fs.rmSync(path.join(lab, "runs"), { recursive: true, force: true });
fs.rmSync(path.join(lab, "logs"), { recursive: true, force: true });
fs.mkdirSync(baselines, { recursive: true });
fs.mkdirSync(runs, { recursive: true });
fs.mkdirSync(logs, { recursive: true });

const tasks = [
  { id: "landing", title: "Create landing page", prompt: "Create a polished landing page for this project. Apply the change, run build/check, and fix errors automatically." },
  { id: "dark-mode", title: "Add dark mode", prompt: "Add dark mode support with accessible colors. Apply the change, run build/check, and fix errors automatically." },
  { id: "syntax-error", title: "Fix intentional syntax error", prompt: "Fix the intentional syntax error in this project. Apply the minimal fix, run build/check, and fix errors automatically.", broken: true },
  { id: "api-route", title: "Add API route", prompt: "Add a simple health/status API route or endpoint appropriate for this project. Apply the change, run build/check, and fix errors automatically." },
  { id: "readme", title: "Generate README", prompt: "Generate or improve the README with setup, run, build, test, and preview instructions. Apply the change and verify." },
  { id: "build-check", title: "Run build/check", prompt: "Run the project build/check workflow, inspect failures, and fix errors automatically with the smallest safe patch." },
  { id: "preview", title: "Run local preview", prompt: "Run a local preview server, verify the page responds, and fix errors automatically if preview fails." },
  { id: "autofix", title: "Fix errors automatically", prompt: "Find the current project error, fix it automatically, run validation, and keep retries minimal.", broken: true },
  { id: "accessibility", title: "Add accessibility improvement", prompt: "Add one accessibility improvement such as labels, landmarks, alt text, or focus states. Apply the change and verify." },
  { id: "test-health", title: "Add simple test/health check", prompt: "Add a simple test or health check command suitable for this project. Apply the change, run it, and fix errors automatically." },
];

const projects = [
  { id: "static-html", title: "Empty static HTML project", make: makeStaticHtml },
  { id: "next-sample", title: "Existing Next.js sample", make: makeNextSample },
  { id: "vite-react", title: "Existing React/Vite sample", make: makeViteReact },
  { id: "node-express", title: "Node/Express sample", make: makeNodeExpress },
  { id: "php-simple", title: "PHP simple project", make: makePhpSimple },
];

for (const project of projects) {
  const dir = path.join(baselines, project.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  project.make(dir);
}

const results = [];
const startedAll = Date.now();

for (const project of projects) {
  for (const task of tasks) {
    const id = `${project.id}-${task.id}`;
    const workspace = path.join(runs, id, "workspace");
    const storage = path.join(runs, id, "storage");
    copyDir(path.join(baselines, project.id), workspace);
    if (task.broken) injectSyntaxError(workspace, project.id);
    const before = snapshot(workspace);
    const started = Date.now();
    const logFile = path.join(logs, `${id}.jsonl`);
    const args = [
      cli,
      "run",
      task.prompt,
      "--workspace", workspace,
      "--storage-dir", storage,
      "--token", token,
      "--apply",
      "--maxRetries", "5",
    ];
    const run = cp.spawnSync(process.execPath, args, {
      cwd: workspace,
      encoding: "utf8",
      timeout: 10 * 60 * 1000,
      maxBuffer: 20 * 1024 * 1024,
    });
    fs.writeFileSync(logFile, `${run.stdout || ""}${run.stderr || ""}`);
    const events = parseEvents(run.stdout || "");
    const after = snapshot(workspace);
    const changed = diffSnapshot(before, after);
    const retries = events.filter((e) => e.type === "retry").length;
    const lastInsight = events.filter((e) => e.type === "mil_insight").at(-1);
    const server = events.filter((e) => e.type === "server_status").at(-1);
    const commandResults = events.filter((e) => e.type === "tool_result" && /command|build|test|lint|apply_patch|autofix/.test(String(e.tool || "")));
    const errors = events.filter((e) => e.type === "error").map((e) => String(e.message || JSON.stringify(e)));
    const done = events.find((e) => e.type === "done");
    const buildStatus = String(lastInsight?.buildStatus || inferBuildStatus(commandResults, run.status));
    const previewStatus = String(lastInsight?.previewStatus || (server?.verified ? "verified" : task.id === "preview" ? "not_verified" : "not_applicable"));
    const quality = Number(lastInsight?.quality?.overall || fallbackQuality(run.status, errors, retries, buildStatus, previewStatus));
    const passed = run.status === 0 && errors.length === 0 && (task.id !== "preview" || previewStatus === "verified");
    const result = {
      id,
      project: project.title,
      projectId: project.id,
      task: task.title,
      taskId: task.id,
      passed,
      exitCode: run.status,
      filesChanged: changed,
      buildPassed: buildStatus === "passed" || (run.status === 0 && task.id !== "preview"),
      previewVerified: previewStatus === "verified",
      retries,
      durationMs: Date.now() - started,
      errors,
      finalQualityScore: quality,
      summary: done?.summary || "",
      logFile,
      suggestedEngineImprovement: improvementFor({ errors, retries, buildStatus, previewStatus, changed, task }),
    };
    results.push(result);
    console.log(`${results.length}/50 ${passed ? "PASS" : "FAIL"} ${id} ${Math.round(result.durationMs / 1000)}s retries=${retries} quality=${quality}`);
  }
}

const report = buildReport(results, Date.now() - startedAll);
fs.writeFileSync(path.join(root, "REAL_BENCHMARK_REPORT.md"), report.main);
fs.writeFileSync(path.join(root, "BENCHMARK_FAILURES.md"), report.failures);
fs.writeFileSync(path.join(root, "AGENT_IMPROVEMENT_PLAN.md"), report.improvement);
fs.writeFileSync(path.join(lab, "results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(summary(results), null, 2));

function makeStaticHtml(dir) {
  write(dir, "index.html", "<!doctype html><html><head><title>Meldex Static</title></head><body><main><h1>Meldex Static</h1><p>Ready.</p></main><script src=\"script.js\"></script></body></html>\n");
  write(dir, "style.css", "body{font-family:system-ui;margin:2rem;color:#111;background:#fff}main{max-width:720px}\n");
  write(dir, "script.js", "function boot(){ document.body.dataset.ready = 'true'; }\nboot();\n");
}

function makeNextSample(dir) {
  write(dir, "package.json", JSON.stringify({ scripts: { build: "node scripts/build-check.js", test: "node scripts/test-check.js", dev: "node scripts/serve.js" }, dependencies: { next: "15.5.19", react: "19.0.0", "react-dom": "19.0.0" } }, null, 2));
  write(dir, "next.config.js", "module.exports = {};\n");
  write(dir, "app/page.tsx", "export default function Page(){ return <main><h1>Next Sample</h1><p>Ready</p></main>; }\n");
  write(dir, "app/api/status/route.ts", "export async function GET(){ return Response.json({ ok: true }); }\n");
  writeChecks(dir, "app/page.tsx");
}

function makeViteReact(dir) {
  write(dir, "package.json", JSON.stringify({ scripts: { build: "node scripts/build-check.js", test: "node scripts/test-check.js", dev: "node scripts/serve.js" }, dependencies: { "@vitejs/plugin-react": "latest", vite: "latest", react: "19.0.0", "react-dom": "19.0.0" } }, null, 2));
  write(dir, "vite.config.js", "export default {};\n");
  write(dir, "index.html", "<div id=\"root\"></div><script type=\"module\" src=\"/src/App.jsx\"></script>\n");
  write(dir, "src/App.jsx", "export default function App(){ return <main><h1>Vite React</h1><p>Ready</p></main>; }\n");
  writeChecks(dir, "src/App.jsx");
}

function makeNodeExpress(dir) {
  write(dir, "package.json", JSON.stringify({ scripts: { build: "node scripts/build-check.js", test: "node scripts/test-check.js", start: "node server.js", dev: "node server.js" }, dependencies: { express: "latest" } }, null, 2));
  write(dir, "server.js", "const http=require('http'); const port=Number(process.env.PORT||process.argv.at(-1)||3000); const server=http.createServer((req,res)=>{ if(req.url==='/api/status'){res.setHeader('content-type','application/json'); res.end(JSON.stringify({ok:true})); return;} res.end('<h1>Node Express Sample</h1>'); }); server.listen(port,()=>console.log('listening http://localhost:'+port));\n");
  writeChecks(dir, "server.js");
}

function makePhpSimple(dir) {
  write(dir, "index.php", "<?php $title = 'PHP Sample'; ?><!doctype html><html><body><main><h1><?= htmlspecialchars($title) ?></h1><p>Ready</p></main></body></html>\n");
  write(dir, "api.php", "<?php header('Content-Type: application/json'); echo json_encode(['ok'=>true]);\n");
  write(dir, "package.json", JSON.stringify({ scripts: { build: "node scripts/build-check.js", test: "node scripts/test-check.js", dev: "php -S localhost:${PORT:-5173}" } }, null, 2));
  writeChecks(dir, "index.php");
}

function writeChecks(dir, mainFile) {
  write(dir, "scripts/build-check.js", `const fs=require('fs'); const file=${JSON.stringify(mainFile)}; const text=fs.readFileSync(file,'utf8'); if(/SYNTAX_ERROR_BENCHMARK|<<<<<<<|undefinedFunction\\(/.test(text)){ console.error('intentional syntax marker found'); process.exit(1); } console.log('build ok');\n`);
  write(dir, "scripts/test-check.js", `const fs=require('fs'); if(!fs.existsSync(${JSON.stringify(mainFile)})){ console.error('missing main file'); process.exit(1); } console.log('test ok');\n`);
  write(dir, "scripts/serve.js", "const http=require('http'); const args=process.argv.join(' '); const match=args.match(/--port\\s+(\\d+)/); const port=Number(process.env.PORT||match?.[1]||5173); http.createServer((req,res)=>{res.setHeader('content-type', req.url.startsWith('/api')?'application/json':'text/html'); res.end(req.url.startsWith('/api')?JSON.stringify({ok:true}):'<!doctype html><html><body><h1>Preview OK</h1></body></html>')}).listen(port,()=>console.log('ready http://localhost:'+port));\n");
}

function injectSyntaxError(workspace, projectId) {
  const target = projectId === "static-html" ? "script.js" : projectId === "next-sample" ? "app/page.tsx" : projectId === "vite-react" ? "src/App.jsx" : projectId === "node-express" ? "server.js" : "index.php";
  fs.appendFileSync(path.join(workspace, target), "\nSYNTAX_ERROR_BENCHMARK(\n");
}

function write(dir, rel, content) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function snapshot(dir) {
  const out = {};
  for (const file of walk(dir)) {
    const full = path.join(dir, file);
    out[file] = crypto.createHash("sha1").update(fs.readFileSync(full)).digest("hex");
  }
  return out;
}

function walk(dir, base = dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", ".meldex"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, acc);
    else acc.push(path.relative(base, full));
  }
  return acc;
}

function diffSnapshot(before, after) {
  return Object.keys(after).filter((file) => before[file] !== after[file]);
}

function parseEvents(text) {
  return text.split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function inferBuildStatus(commandResults, status) {
  if (commandResults.some((e) => String(e.tool || "").includes("command") && e.status === "ok")) return "passed";
  return status === 0 ? "passed" : "failed";
}

function fallbackQuality(status, errors, retries, buildStatus, previewStatus) {
  let score = status === 0 ? 86 : 42;
  score -= Math.min(25, retries * 6);
  if (errors.length) score -= 18;
  if (buildStatus !== "passed") score -= 8;
  if (previewStatus === "not_verified") score -= 12;
  return Math.max(0, Math.min(100, score));
}

function improvementFor(result) {
  if (result.previewStatus === "not_verified") return "Improve preview command detection and HTTP verification for this framework.";
  if (result.buildStatus !== "passed") return "Improve validation command selection and build-error autofix context.";
  if (result.errors.some((e) => /token|auth/i.test(e))) return "Improve benchmark auth setup and token preflight.";
  if (result.retries > 2) return "Improve initial patch quality and reduce autofix retries for this task type.";
  if (!result.changed.length) return "Improve tool selection so no-op patches are rejected earlier.";
  return "No urgent engine improvement required.";
}

function summary(results) {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  const success = total ? Math.round((passed / total) * 1000) / 10 : 0;
  return { total, passed, failed, successPercent: success };
}

function buildReport(results, durationMs) {
  const s = summary(results);
  const failures = results.filter((r) => !r.passed);
  const patterns = patternSummary(failures);
  const rows = results.map((r) => `| ${r.projectId} | ${r.taskId} | ${r.passed ? "PASS" : "FAIL"} | ${r.filesChanged.length} | ${r.buildPassed ? "yes" : "no"} | ${r.previewVerified ? "yes" : "no"} | ${r.retries} | ${Math.round(r.durationMs / 1000)}s | ${r.finalQualityScore} |`).join("\n");
  return {
    main: `# REAL BENCHMARK REPORT\n\nBENCHMARK COMPLETE\n\n- Total tasks: ${s.total}\n- Passed: ${s.passed}\n- Failed: ${s.failed}\n- Success: ${s.successPercent}%\n- Duration: ${Math.round(durationMs / 1000)}s\n\n## Biggest Failure Patterns\n\n${patterns || "No failures."}\n\n## Results\n\n| Project | Task | Result | Files Changed | Build Passed | Preview Verified | Retries | Time | Quality |\n|---|---|---:|---:|---:|---:|---:|---:|---:|\n${rows}\n`,
    failures: `# BENCHMARK FAILURES\n\n${failures.length ? failures.map((r) => `## ${r.id}\n\n- Project: ${r.project}\n- Task: ${r.task}\n- Exit code: ${r.exitCode}\n- Retries: ${r.retries}\n- Files changed: ${r.filesChanged.join(", ") || "none"}\n- Errors: ${r.errors.join(" | ") || "none"}\n- Log: ${path.relative(root, r.logFile)}\n- Suggested improvement: ${r.suggestedEngineImprovement}\n`).join("\n") : "No failures recorded.\n"}`,
    improvement: `# AGENT IMPROVEMENT PLAN\n\n## Summary\n\n- Total tasks: ${s.total}\n- Failed tasks: ${s.failed}\n\n## Required Next Fixes\n\n${[...new Set(results.map((r) => r.suggestedEngineImprovement))].map((i) => `- ${i}`).join("\n")}\n`,
  };
}

function patternSummary(failures) {
  const counts = {};
  for (const f of failures) {
    const key = f.suggestedEngineImprovement;
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`).join("\n");
}
