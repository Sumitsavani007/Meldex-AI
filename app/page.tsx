import { ArrowRight, Bot, Check, Code2, LockKeyhole, ServerCog, Sparkles } from "lucide-react";
import { ButtonLink, Panel, SectionShell } from "@/components/ui";

const features = [
  { icon: Bot, title: "Local agent loop", copy: "Plan tasks, inspect files, edit workspace assets, and summarize changes from one command center." },
  { icon: ServerCog, title: "Ollama ready", copy: "Point Meldex AI at your local Ollama endpoint and switch models without touching code." },
  { icon: Code2, title: "Workspace editor", copy: "Browse, create, save, and delete local project files from a coding dashboard interface." },
  { icon: LockKeyhole, title: "Private by default", copy: "Settings stay in localStorage and source files remain in the local workspace folder." }
];

const faqs = [
  ["Does Meldex AI require a cloud model?", "No. It is wired for local Ollama by default, with qwen3-coder:30b prefilled."],
  ["Can I edit files in the app?", "Yes. The workspace page exposes a local file tree, editor, create actions, save, and confirmed delete."],
  ["Is this production ready?", "It is a clean SaaS-style starter with real routes and local integration points, ready to extend."]
];

export default function LandingPage() {
  return (
    <>
      <SectionShell className="grid min-h-[calc(100vh-72px)] items-center gap-10 pb-10 pt-16 lg:grid-cols-[1fr_0.86fr]">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-mint/20 bg-mint/10 px-3 py-1 text-xs font-medium text-mint">
            <Sparkles className="size-3.5" />
            Local-first AI coding dashboard
          </div>
          <h1 className="max-w-4xl text-5xl font-semibold tracking-normal text-white sm:text-6xl lg:text-7xl">
            Meldex AI
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
            Build. Fix. Deploy. A premium Codex-style workspace for chatting with local models,
            managing project files, and running agent tasks from one focused interface.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/dashboard">
              Open Dashboard
              <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink href="/chat" variant="secondary">
              Login
            </ButtonLink>
          </div>
        </div>
        <Panel className="overflow-hidden">
          <div className="border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-red-400" />
              <span className="size-3 rounded-full bg-ember" />
              <span className="size-3 rounded-full bg-mint" />
              <span className="ml-3 text-xs text-slate-500">agent.plan.ts</span>
            </div>
          </div>
          <div className="grid gap-4 p-5">
            {["Read project files", "Draft implementation plan", "Patch landing page", "Run build checks"].map((item, index) => (
              <div key={item} className="flex items-center gap-3 rounded-md border border-white/10 bg-white/[0.035] p-3">
                <span className="grid size-7 place-items-center rounded-md bg-mint/10 text-xs font-semibold text-mint">{index + 1}</span>
                <span className="text-sm text-slate-200">{item}</span>
                <Check className="ml-auto size-4 text-mint" />
              </div>
            ))}
            <div className="rounded-md bg-slate-950/80 p-4 font-mono text-xs leading-6 text-slate-300">
              <p><span className="text-mint">$</span> npm run dev</p>
              <p className="text-slate-500">ready - local agent dashboard online</p>
            </div>
          </div>
        </Panel>
      </SectionShell>

      <SectionShell className="pt-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <Panel key={feature.title} className="p-5">
              <feature.icon className="mb-4 size-6 text-mint" />
              <h2 className="text-base font-semibold text-white">{feature.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{feature.copy}</p>
            </Panel>
          ))}
        </div>
      </SectionShell>

      <SectionShell>
        <div className="grid gap-4 lg:grid-cols-3">
          {["Starter", "Operator", "Studio"].map((tier, index) => (
            <Panel key={tier} className="p-6">
              <h2 className="text-lg font-semibold text-white">{tier}</h2>
              <p className="mt-3 text-3xl font-semibold text-white">{index === 0 ? "$0" : index === 1 ? "$19" : "$49"}<span className="text-sm text-slate-500"> /mo</span></p>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                {index === 0 ? "Local dashboard basics." : index === 1 ? "More agent workflows and team-ready patterns." : "Advanced deployment and automation features."}
              </p>
              <ButtonLink href="/dashboard" variant={index === 1 ? "primary" : "secondary"}>
                Choose Plan
              </ButtonLink>
            </Panel>
          ))}
        </div>
      </SectionShell>

      <SectionShell className="pb-20">
        <div className="grid gap-4 lg:grid-cols-3">
          {faqs.map(([question, answer]) => (
            <Panel key={question} className="p-5">
              <h2 className="text-base font-semibold text-white">{question}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{answer}</p>
            </Panel>
          ))}
        </div>
      </SectionShell>
    </>
  );
}
