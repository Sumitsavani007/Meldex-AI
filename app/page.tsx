"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleDollarSign,
  Command,
  LockKeyhole,
  MessagesSquare,
  Network,
  Play,
  Sparkles
} from "lucide-react";
import { ButtonLink, Panel, SectionShell } from "@/components/ui";
import { agentPipeline, capabilities, enterpriseItems, pricing, securityControls } from "@/lib/product";

const testimonials = [
  ["Meldex turns vague product ideas into running workspaces. The agent timeline makes the process feel inspectable.", "Aarav S.", "Founder"],
  ["The local and cloud brain split is exactly what our security team wanted.", "Maya R.", "Platform Lead"],
  ["It feels like Cursor, Codex, and a deployment console finally share the same room.", "Nolan K.", "Engineering Manager"]
];

const faqs = [
  ["Can Meldex AI run locally?", "Yes. Ollama with Qwen3-Coder is the default local brain, and cloud providers can be added through model configs."],
  ["Does it deploy apps?", "The app now includes deployment architecture and DevOps agent surfaces. Production runners are listed in the roadmap."],
  ["How are commands protected?", "Terminal execution is allowlisted and blocks dangerous patterns such as sudo, shutdown, reboot, mkfs, dd, and rm -rf."],
  ["What databases are supported?", "The production schema is designed for PostgreSQL through Prisma."]
];

function NeuralOrb() {
  const points = [
    [50, 16],
    [78, 30],
    [72, 68],
    [48, 84],
    [22, 66],
    [26, 30]
  ];

  return (
    <div className="relative aspect-square overflow-hidden rounded-md border border-white/10 bg-black/30">
      <div className="absolute inset-8 rounded-full border border-mint/20 shadow-glow" />
      <div className="absolute inset-0 aurora opacity-70" />
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
        {points.map(([x1, y1], index) =>
          points.map(([x2, y2], inner) =>
            inner > index ? (
              <motion.line
                key={`${index}-${inner}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(99,242,190,.22)"
                strokeWidth="0.35"
                initial={{ pathLength: 0, opacity: 0.1 }}
                animate={{ pathLength: 1, opacity: [0.1, 0.7, 0.24] }}
                transition={{ duration: 4 + index * 0.3, repeat: Infinity, repeatType: "mirror" }}
              />
            ) : null
          )
        )}
        {points.map(([cx, cy], index) => (
          <motion.circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r="2.2"
            fill={index === 2 ? "#ffb86b" : "#63f2be"}
            animate={{ r: [2.2, 3.8, 2.2], opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 2.6, delay: index * 0.2, repeat: Infinity }}
          />
        ))}
      </svg>
      <div className="absolute bottom-4 left-4 right-4 rounded-md border border-white/10 bg-black/45 p-3 backdrop-blur">
        <div className="mb-2 flex items-center gap-2 text-xs text-mint">
          <Command className="size-3.5" />
          Prompt demo
        </div>
        <p className="text-sm text-slate-200">Build a SaaS app with auth, billing, agents, Monaco, terminal, and deploy pipeline.</p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      <SectionShell className="grid min-h-[calc(100vh-72px)] items-center gap-10 pb-12 pt-14 lg:grid-cols-[1fr_0.82fr]">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-mint/20 bg-mint/10 px-3 py-1 text-xs font-medium text-mint">
            <Sparkles className="size-3.5" />
            AI software factory for production SaaS teams
          </div>
          <h1 className="max-w-5xl text-5xl font-semibold tracking-normal text-white sm:text-6xl lg:text-7xl">Meldex AI</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
            Describe any software product and Meldex AI can plan it, generate it, edit it, run it, debug it, improve it, and prepare it for deployment.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/dashboard">
              Launch Console
              <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink href="/workspace" variant="secondary">
              Open Workspace
            </ButtonLink>
          </div>
          <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
            {["Cursor-grade editing", "Codex-style agents", "Lovable-speed UI"].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-slate-300">
                <Check className="size-4 text-mint" />
                {item}
              </div>
            ))}
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.1 }}>
          <NeuralOrb />
        </motion.div>
      </SectionShell>

      <SectionShell className="pt-2">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-mint">AI Capabilities</p>
            <h2 className="mt-2 text-3xl font-semibold text-white">One platform, six specialist agents</h2>
          </div>
          <Network className="hidden size-8 text-iris sm:block" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((feature, index) => (
            <motion.div key={feature.title} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.05 }}>
              <Panel className="h-full p-5 transition hover:border-mint/30">
                <feature.icon className="mb-4 size-6 text-mint" />
                <h3 className="text-base font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{feature.copy}</p>
              </Panel>
            </motion.div>
          ))}
        </div>
      </SectionShell>

      <SectionShell>
        <Panel className="grid gap-6 p-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm text-mint">Interactive Demo</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Prompt to deployed architecture</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              The workspace already exposes file editing, terminal execution, changed files, logs, and a multi-agent timeline that mirrors the production workflow.
            </p>
            <ButtonLink href="/workspace" variant="secondary">
              Try the Agent
              <Play className="size-4" />
            </ButtonLink>
          </div>
          <div className="grid gap-3">
            {agentPipeline.map((agent, index) => (
              <div key={agent.name} className="flex items-center gap-3 rounded-md border border-white/10 bg-white/[0.035] p-3">
                <span className="grid size-8 place-items-center rounded-md bg-mint/10 text-xs font-semibold text-mint">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{agent.name} Agent</p>
                  <p className="truncate text-xs text-slate-400">{agent.role}</p>
                </div>
                <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-slate-300">{agent.status}</span>
              </div>
            ))}
          </div>
        </Panel>
      </SectionShell>

      <SectionShell>
        <div className="grid gap-4 lg:grid-cols-3">
          {pricing.map((tier, index) => (
            <Panel key={tier.name} className={`p-6 ${index === 1 ? "border-mint/35 shadow-glow" : ""}`}>
              <CircleDollarSign className="mb-4 size-6 text-ember" />
              <h3 className="text-lg font-semibold text-white">{tier.name}</h3>
              <p className="mt-3 text-4xl font-semibold text-white">
                {tier.price}
                <span className="text-sm text-slate-500"> /mo</span>
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-400">{tier.copy}</p>
              <div className="mt-5 grid gap-2">
                {tier.features.map((feature) => (
                  <p key={feature} className="flex items-center gap-2 text-sm text-slate-300">
                    <Check className="size-4 text-mint" />
                    {feature}
                  </p>
                ))}
              </div>
            </Panel>
          ))}
        </div>
      </SectionShell>

      <SectionShell>
        <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <Panel className="p-6">
            <LockKeyhole className="mb-4 size-7 text-mint" />
            <h2 className="text-2xl font-semibold text-white">Enterprise-grade control plane</h2>
            <div className="mt-5 grid gap-3">
              {enterpriseItems.map((item) => (
                <p key={item} className="flex gap-2 text-sm leading-6 text-slate-300">
                  <ChevronRight className="mt-1 size-4 shrink-0 text-iris" />
                  {item}
                </p>
              ))}
            </div>
          </Panel>
          <div className="grid gap-4 sm:grid-cols-2">
            {securityControls.map((item) => (
              <Panel key={item.title} className="p-5">
                <item.icon className="mb-4 size-6 text-iris" />
                <h3 className="font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{item.copy}</p>
              </Panel>
            ))}
          </div>
        </div>
      </SectionShell>

      <SectionShell>
        <div className="grid gap-4 lg:grid-cols-3">
          {testimonials.map(([quote, name, title]) => (
            <Panel key={name} className="p-5">
              <MessagesSquare className="mb-4 size-5 text-mint" />
              <p className="text-sm leading-6 text-slate-300">{quote}</p>
              <p className="mt-4 text-sm font-semibold text-white">{name}</p>
              <p className="text-xs text-slate-500">{title}</p>
            </Panel>
          ))}
        </div>
      </SectionShell>

      <SectionShell className="pb-20">
        <div className="grid gap-4 lg:grid-cols-2">
          {faqs.map(([question, answer]) => (
            <Panel key={question} className="p-5">
              <h3 className="text-base font-semibold text-white">{question}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{answer}</p>
            </Panel>
          ))}
        </div>
      </SectionShell>
    </>
  );
}
