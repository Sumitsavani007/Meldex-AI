import {
  Bot,
  BrainCircuit,
  Bug,
  Cloud,
  Code2,
  Cpu,
  Database,
  Github,
  Globe2,
  Layers3,
  LineChart,
  LockKeyhole,
  Rocket,
  ServerCog,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  TestTube2,
  Wrench
} from "lucide-react";

export const agentPipeline = [
  { name: "Planner", role: "Translates product intent into scoped milestones", status: "complete" },
  { name: "Architect", role: "Designs stack, data models, API surfaces, and boundaries", status: "complete" },
  { name: "Coder", role: "Edits files, builds UI, wires routes, and applies patches", status: "running" },
  { name: "Tester", role: "Runs builds and targeted checks with captured output", status: "queued" },
  { name: "Reviewer", role: "Reviews diffs, risks, regressions, and security gaps", status: "queued" },
  { name: "DevOps", role: "Prepares Docker, VPS, cloud, and Kubernetes deployment", status: "queued" }
];

export const capabilities = [
  { icon: Code2, title: "Coding Agent", copy: "Plan, edit, diff, test, and iterate across an isolated workspace." },
  { icon: Globe2, title: "Website Builder", copy: "Generate premium landing pages, marketing sites, and product surfaces." },
  { icon: Layers3, title: "App Builder", copy: "Create Next.js app flows, dashboards, forms, and API integrations." },
  { icon: Bug, title: "Bug Fix Agent", copy: "Analyze terminal errors, patch files, and retry up to five times." },
  { icon: Rocket, title: "Deployment Agent", copy: "Prepare builds for Docker, VPS, cloud runners, and Kubernetes." },
  { icon: Github, title: "GitHub Agent", copy: "Import repositories, review changes, and prepare source-control workflows." }
];

export const dashboardStats = [
  { label: "Active users", value: "12.8k", delta: "+18%", icon: Bot },
  { label: "Agent tasks", value: "84.2k", delta: "+31%", icon: Cpu },
  { label: "Token usage", value: "192M", delta: "-9% cost", icon: BrainCircuit },
  { label: "Error rate", value: "0.8%", delta: "-42%", icon: ShieldCheck }
];

export const modelProviders = [
  { provider: "Ollama", model: "qwen3-coder:30b", brain: "Local", limit: "128k", baseUrl: "http://localhost:11434" },
  { provider: "OpenAI", model: "gpt-5", brain: "Cloud", limit: "400k", baseUrl: "https://api.openai.com/v1" },
  { provider: "DeepSeek", model: "deepseek-coder", brain: "Cloud", limit: "128k", baseUrl: "https://api.deepseek.com" },
  { provider: "Anthropic", model: "claude-code", brain: "Cloud", limit: "200k", baseUrl: "https://api.anthropic.com" },
  { provider: "OpenRouter", model: "auto", brain: "Cloud", limit: "provider", baseUrl: "https://openrouter.ai/api/v1" },
  { provider: "Custom API", model: "openai-compatible", brain: "Hybrid", limit: "custom", baseUrl: "https://your-host/v1" }
];

export const pricing = [
  { name: "Starter", price: "$0", copy: "Local-first workspace for solo builders.", features: ["Ollama brain", "1 workspace", "Safe terminal", "Community support"] },
  { name: "Operator", price: "$29", copy: "Cloud and local models for serious shipping.", features: ["Unlimited projects", "Multi-agent tasks", "GitHub import", "Usage analytics"] },
  { name: "Studio", price: "$99", copy: "Team-grade AI engineering cockpit.", features: ["Shared workspaces", "Billing controls", "Audit logs", "Priority queues"] }
];

export const adminMetrics = [
  { name: "Users", value: 12800, fill: "#63f2be" },
  { name: "Tasks", value: 84200, fill: "#9aa4ff" },
  { name: "Tokens", value: 192000, fill: "#ffb86b" },
  { name: "Models", value: 18, fill: "#56d9ff" },
  { name: "Errors", value: 680, fill: "#ff6b8b" }
];

export const securityControls = [
  { icon: LockKeyhole, title: "Workspace isolation", copy: "workspace/projects/{userId}/{projectId} with path sanitization." },
  { icon: TerminalSquare, title: "Command allowlist", copy: "Allows npm, pnpm, and yarn workflows while blocking dangerous commands." },
  { icon: Database, title: "Secret management", copy: "Model keys are modeled for encryption and never exposed in client UI." },
  { icon: LineChart, title: "Audit logs", copy: "Every agent, billing, terminal, and admin action can be tracked." }
];

export const enterpriseItems = [
  "SSO-ready authentication with email, Google, and GitHub providers",
  "Private model routing across local Ollama and cloud brains",
  "Audit-grade logs for commands, files, agents, billing, and usage",
  "Deployment playbooks for Docker, VPS, managed cloud, and Kubernetes"
];

export const footerLinks = ["Product", "Security", "Docs", "Pricing", "Enterprise", "Status"];

export const routeMap = [
  "POST /api/chat",
  "POST /api/agent",
  "GET /api/workspace",
  "POST /api/workspace",
  "DELETE /api/workspace",
  "POST /api/terminal"
];

export const roadmap = [
  "Wire NextAuth/Auth.js providers for email, Google, and GitHub.",
  "Connect Prisma Client to PostgreSQL migrations and seed data.",
  "Add GitHub OAuth import, ZIP extraction, and template marketplace.",
  "Add durable job queues, streaming agent events, and deployment runners."
];

export const buildHighlights = [
  { icon: Sparkles, text: "Premium AI-first black glass interface" },
  { icon: Cloud, text: "Local and cloud brain model manager" },
  { icon: ServerCog, text: "Production architecture and database schema" },
  { icon: Wrench, text: "Agent workflow, terminal guardrails, and auto-fix loop" },
  { icon: TestTube2, text: "Build verification target with iterative repair" }
];
