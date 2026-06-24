"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowRight, Check, ChevronRight, CircleDollarSign, Command,
  LockKeyhole, MessagesSquare, Network, Play, Shield, Sparkles,
  Zap, Bot, Terminal, Code2, Globe, Cpu, GitBranch, Star
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

const featureHighlights = [
  { icon: Bot, label: "Chat Mode", desc: "Conversational AI in Gujarati, Hindi & English" },
  { icon: Zap, label: "Agent Mode", desc: "Builds and edits real files from a single prompt" },
  { icon: Terminal, label: "Safe Terminal", desc: "Allowlisted commands, blocked dangerous patterns" },
  { icon: Code2, label: "Monaco Editor", desc: "Full IDE editing experience in the browser" },
  { icon: Globe, label: "OpenRouter", desc: "Cloud AI with automatic free-tier fallbacks" },
  { icon: GitBranch, label: "File Workspace", desc: "Tree view, diffs, and changed file tracking" },
];

function HeroOrb() {
  const points: [number, number][] = [[50,16],[78,30],[72,68],[48,84],[22,66],[26,30]];
  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-black/30 shadow-aurora">
      <div className="absolute inset-8 rounded-full border border-mint/20 shadow-glow" />
      <div className="absolute inset-0 aurora opacity-60" />
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
        {points.map(([x1,y1],i) =>
          points.map(([x2,y2],j) =>
            j > i ? (
              <motion.line key={`${i}-${j}`} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="rgba(99,242,190,.2)" strokeWidth="0.3"
                initial={{opacity:0.1}} animate={{opacity:[0.1,0.6,0.18]}}
                transition={{duration:4+i*0.4,repeat:Infinity,repeatType:"mirror"}}
              />
            ) : null
          )
        )}
        {points.map(([cx,cy],i) => (
          <motion.circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.4"
            fill={i===2?"#ffb86b":i===4?"#9aa4ff":"#63f2be"}
            animate={{r:[2.4,3.8,2.4],opacity:[0.5,1,0.5]}}
            transition={{duration:2.4,delay:i*0.25,repeat:Infinity}}
          />
        ))}
      </svg>
      {/* prompt demo card */}
      <div className="absolute bottom-4 left-4 right-4 rounded-xl border border-white/10 bg-black/50 p-3.5 backdrop-blur">
        <div className="mb-2 flex items-center gap-2 text-xs text-mint">
          <Command className="size-3.5" />
          <span className="font-medium">Prompt demo</span>
          <span className="ml-auto flex gap-1">
            {[0,1,2].map(i=>(
              <motion.span key={i} className="size-1.5 rounded-full bg-mint/60"
                animate={{opacity:[0.3,1,0.3]}} transition={{duration:1,delay:i*0.3,repeat:Infinity}}
              />
            ))}
          </span>
        </div>
        <p className="text-xs text-slate-300">Build a SaaS app with auth, billing, agents, Monaco editor, terminal, and deploy pipeline.</p>
      </div>
    </div>
  );
}

function GradientText({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-gradient-to-r from-mint via-iris to-ember bg-clip-text text-transparent">
      {children}
    </span>
  );
}

export default function LandingPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <SectionShell className="grid min-h-[calc(100vh-64px)] items-center gap-12 pb-12 pt-16 lg:grid-cols-[1fr_0.82fr]">
        <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{duration:0.7}}>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-mint/25 bg-mint/8 px-3.5 py-1.5 text-xs font-medium text-mint">
            <Sparkles className="size-3.5" />
            AI software factory for production teams
            <span className="ml-1 rounded-full bg-mint/20 px-1.5 py-0.5 text-[10px] font-semibold">NEW</span>
          </div>

          <h1 className="max-w-2xl text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl leading-[1.08]">
            Build software<br />with <GradientText>AI agents</GradientText>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-400">
            Describe any product — Meldex AI plans, generates, edits, runs, debugs, and deploys it.
            Chat in Gujarati, Hindi, or English. Switch to Agent Mode for real code creation.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/dashboard">
              Launch Console
              <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink href="/chat" variant="secondary">
              <Bot className="size-4" />
              Try AI Chat
            </ButtonLink>
          </div>

          <div className="mt-10 grid max-w-md gap-2.5 sm:grid-cols-3">
            {["Chat & Agent modes","Gujarati / Hindi / English","Local + Cloud brain"].map(item => (
              <div key={item} className="flex items-center gap-2 text-sm text-slate-400">
                <Check className="size-4 shrink-0 text-mint" />
                {item}
              </div>
            ))}
          </div>

          {/* Social proof */}
          <div className="mt-8 flex items-center gap-3">
            <div className="flex -space-x-2">
              {["A","M","N","R","S"].map(l=>(
                <div key={l} className="grid size-7 place-items-center rounded-full border-2 border-ink bg-gradient-to-br from-iris/40 to-mint/30 text-xs font-bold text-white">
                  {l}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Star className="size-3 fill-ember text-ember" />
              <strong className="text-white">4.9</strong>
              &nbsp;— loved by 500+ developers
            </div>
          </div>
        </motion.div>

        <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} transition={{duration:0.8,delay:0.15}}>
          <HeroOrb />
        </motion.div>
      </SectionShell>

      {/* ── Feature highlights ──────────────────────────────────── */}
      <SectionShell className="pt-4 pb-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {featureHighlights.map((f,i)=>(
            <motion.div key={f.label} initial={{opacity:0,y:10}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:i*0.06}}>
              <Panel className="flex flex-col items-center gap-2 p-4 text-center transition hover:border-mint/25">
                <f.icon className="size-5 text-mint" />
                <p className="text-xs font-semibold text-white">{f.label}</p>
                <p className="text-[10px] leading-4 text-slate-500">{f.desc}</p>
              </Panel>
            </motion.div>
          ))}
        </div>
      </SectionShell>

      {/* ── Capabilities ─────────────────────────────────────────── */}
      <SectionShell className="pt-6">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-mint">AI Capabilities</p>
            <h2 className="mt-2 text-3xl font-bold text-white">One platform, six specialist agents</h2>
          </div>
          <Network className="hidden size-8 text-iris/60 sm:block" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((feature, index) => (
            <motion.div key={feature.title} initial={{opacity:0,y:12}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:index*0.06}}>
              <Panel className="group h-full p-5 transition hover:border-mint/30 hover:bg-white/[0.055]">
                <div className="mb-4 grid size-10 place-items-center rounded-lg border border-mint/20 bg-mint/8 text-mint transition group-hover:bg-mint/15">
                  <feature.icon className="size-5" />
                </div>
                <h3 className="text-base font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{feature.copy}</p>
              </Panel>
            </motion.div>
          ))}
        </div>
      </SectionShell>

      {/* ── Agent pipeline demo ──────────────────────────────────── */}
      <SectionShell>
        <Panel className="overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="border-b border-white/8 p-6 lg:border-b-0 lg:border-r">
              <p className="text-sm font-medium text-mint">Interactive Demo</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Prompt to deployed architecture</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                The workspace exposes file editing, terminal execution, changed files, logs, and a multi-agent timeline that mirrors production workflow.
              </p>
              <div className="mt-6">
                <ButtonLink href="/workspace" variant="secondary">
                  <Play className="size-4" />
                  Try the Agent
                </ButtonLink>
              </div>
            </div>
            <div className="grid gap-2 p-6">
              {agentPipeline.map((agent, index) => (
                <motion.div key={agent.name}
                  initial={{opacity:0,x:10}} whileInView={{opacity:1,x:0}} viewport={{once:true}} transition={{delay:index*0.08}}
                  className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-mint/10 text-xs font-bold text-mint">{index+1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{agent.name} Agent</p>
                    <p className="truncate text-xs text-slate-400">{agent.role}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">{agent.status}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </Panel>
      </SectionShell>

      {/* ── Pricing ──────────────────────────────────────────────── */}
      <SectionShell>
        <div className="mb-8 text-center">
          <p className="text-sm font-medium text-mint">Pricing</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Simple, transparent pricing</h2>
          <p className="mt-2 text-slate-400">Start free, scale when you need it.</p>
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          {pricing.map((tier, index) => (
            <Panel key={tier.name} className={[
              "relative p-6 transition",
              index===1 ? "border-mint/40 shadow-glow scale-[1.02]" : "hover:border-white/15"
            ].join(" ")}>
              {index===1 && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full border border-mint/30 bg-mint px-3 py-1 text-xs font-bold text-slate-950">Most Popular</span>
                </div>
              )}
              <CircleDollarSign className="mb-4 size-6 text-ember" />
              <h3 className="text-lg font-bold text-white">{tier.name}</h3>
              <p className="mt-3 text-4xl font-bold text-white">
                {tier.price}
                <span className="text-sm font-normal text-slate-500"> /mo</span>
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-400">{tier.copy}</p>
              <div className="mt-5 grid gap-2.5">
                {tier.features.map(feature => (
                  <div key={feature} className="flex items-center gap-2 text-sm text-slate-300">
                    <Check className="size-4 shrink-0 text-mint" />
                    {feature}
                  </div>
                ))}
              </div>
              <div className="mt-6">
                <Link href="/register" className={[
                  "block w-full rounded-lg py-2.5 text-center text-sm font-semibold transition",
                  index===1 ? "bg-mint text-slate-950 hover:bg-mint/90" : "border border-white/10 text-slate-300 hover:bg-white/6"
                ].join(" ")}>
                  Get started
                </Link>
              </div>
            </Panel>
          ))}
        </div>
      </SectionShell>

      {/* ── Security + Enterprise ────────────────────────────────── */}
      <SectionShell>
        <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <Panel className="p-6">
            <div className="mb-4 grid size-12 place-items-center rounded-xl border border-mint/20 bg-mint/8 text-mint">
              <LockKeyhole className="size-6" />
            </div>
            <h2 className="text-2xl font-bold text-white">Enterprise-grade control plane</h2>
            <p className="mt-2 text-sm text-slate-400">Built for teams that need security, compliance, and control.</p>
            <div className="mt-5 grid gap-2.5">
              {enterpriseItems.map(item => (
                <div key={item} className="flex gap-2 text-sm leading-6 text-slate-300">
                  <ChevronRight className="mt-1 size-4 shrink-0 text-iris" />
                  {item}
                </div>
              ))}
            </div>
          </Panel>
          <div className="grid gap-4 sm:grid-cols-2">
            {securityControls.map(item => (
              <Panel key={item.title} className="p-5 transition hover:border-iris/30">
                <div className="mb-4 grid size-10 place-items-center rounded-lg border border-iris/20 bg-iris/8 text-iris">
                  <item.icon className="size-5" />
                </div>
                <h3 className="font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{item.copy}</p>
              </Panel>
            ))}
          </div>
        </div>
      </SectionShell>

      {/* ── Testimonials ─────────────────────────────────────────── */}
      <SectionShell>
        <div className="mb-8 text-center">
          <p className="text-sm font-medium text-mint">Testimonials</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Loved by engineering teams</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {testimonials.map(([quote, name, title]) => (
            <Panel key={name} className="flex flex-col gap-4 p-5 transition hover:border-white/15">
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map(s => <Star key={s} className="size-4 fill-ember text-ember" />)}
              </div>
              <p className="flex-1 text-sm leading-7 text-slate-300">&ldquo;{quote}&rdquo;</p>
              <div className="flex items-center gap-2.5 border-t border-white/8 pt-4">
                <div className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-iris/40 to-mint/30 text-sm font-bold text-white">
                  {name[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{name}</p>
                  <p className="text-xs text-slate-500">{title}</p>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      </SectionShell>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <SectionShell>
        <div className="mb-8 text-center">
          <p className="text-sm font-medium text-mint">FAQ</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Frequently asked questions</h2>
        </div>
        <div className="mx-auto max-w-3xl grid gap-3">
          {faqs.map(([question, answer]) => (
            <Panel key={question} className="p-5 transition hover:border-white/15">
              <h3 className="font-semibold text-white">{question}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{answer}</p>
            </Panel>
          ))}
        </div>
      </SectionShell>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <SectionShell className="pb-24">
        <Panel className="relative overflow-hidden p-10 text-center">
          <div className="pointer-events-none absolute inset-0 aurora opacity-30" />
          <div className="relative">
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl border border-mint/30 bg-mint/10 text-mint">
              <Bot className="size-7" />
            </div>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">Ready to build with AI?</h2>
            <p className="mx-auto mt-3 max-w-md text-slate-400">
              Start for free. No credit card required. Build your first project in minutes.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/register">
                Get started free
                <ArrowRight className="size-4" />
              </ButtonLink>
              <ButtonLink href="/chat" variant="secondary">
                <Bot className="size-4" />
                Try AI Chat
              </ButtonLink>
            </div>
          </div>
        </Panel>
      </SectionShell>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t border-white/8 bg-ink/80 py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 place-items-center rounded-lg border border-mint/25 bg-mint/10">
                <Bot className="size-4 text-mint" />
              </span>
              <span className="text-sm font-bold text-white">Meldex AI</span>
            </div>
            <div className="flex items-center gap-5 text-xs text-slate-500">
              <Link href="/dashboard" className="hover:text-slate-300 transition">Dashboard</Link>
              <Link href="/chat" className="hover:text-slate-300 transition">AI Chat</Link>
              <Link href="/workspace" className="hover:text-slate-300 transition">Workspace</Link>
              <Link href="/settings" className="hover:text-slate-300 transition">Settings</Link>
            </div>
            <p className="text-xs text-slate-600">© 2026 Meldex AI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </>
  );
}


