/**
 * lib/billing.ts
 *
 * Billing plan definitions for Meldex AI SaaS.
 * Plans are stored as strings in the DB so they can be extended without schema changes.
 *
 * Plans:
 *   free        — local-only, 1 project, limited usage
 *   pro         — cloud + local, unlimited projects, higher limits
 *   team        — shared workspaces, audit logs, priority queue
 *   enterprise  — unlimited everything, SSO, dedicated support
 */

export const PLANS = ["free", "pro", "team", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

export interface PlanConfig {
  id: Plan;
  name: string;
  price: number; // USD/month, 0 = free
  description: string;
  features: string[];
  limits: {
    projects: number;          // -1 = unlimited
    tokensPerDay: number;      // -1 = unlimited
    agentTasksPerDay: number;  // -1 = unlimited
    storageGB: number;         // -1 = unlimited
    teamMembers: number;       // 1 = solo
    auditLogRetentionDays: number;
  };
}

export const PLAN_CONFIGS: Record<Plan, PlanConfig> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    description: "Local-first workspace for solo builders.",
    features: [
      "1 workspace project",
      "Ollama / local brain only",
      "Safe terminal sandbox",
      "Community support",
    ],
    limits: {
      projects: 1,
      tokensPerDay: 50_000,
      agentTasksPerDay: 5,
      storageGB: 1,
      teamMembers: 1,
      auditLogRetentionDays: 7,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 29,
    description: "Cloud and local models for serious builders.",
    features: [
      "Unlimited projects",
      "Cloud brain (OpenRouter / OpenAI)",
      "Multi-agent tasks",
      "GitHub import",
      "Usage analytics",
      "Priority support",
    ],
    limits: {
      projects: -1,
      tokensPerDay: 2_000_000,
      agentTasksPerDay: 100,
      storageGB: 20,
      teamMembers: 1,
      auditLogRetentionDays: 30,
    },
  },
  team: {
    id: "team",
    name: "Team",
    price: 99,
    description: "Team-grade AI engineering cockpit.",
    features: [
      "Unlimited projects",
      "Shared workspaces",
      "Billing controls",
      "Audit logs (90 days)",
      "Priority task queue",
      "Up to 10 team members",
    ],
    limits: {
      projects: -1,
      tokensPerDay: 10_000_000,
      agentTasksPerDay: 500,
      storageGB: 100,
      teamMembers: 10,
      auditLogRetentionDays: 90,
    },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    price: 0, // Custom pricing
    description: "Unlimited everything. SSO, dedicated support.",
    features: [
      "Unlimited projects",
      "Unlimited tokens",
      "SSO / SAML",
      "Audit logs (1 year)",
      "Dedicated support",
      "Custom model deployment",
      "SLA guarantees",
    ],
    limits: {
      projects: -1,
      tokensPerDay: -1,
      agentTasksPerDay: -1,
      storageGB: -1,
      teamMembers: -1,
      auditLogRetentionDays: 365,
    },
  },
};

/**
 * Get the plan config for a given plan string.
 * Falls back to `free` if unknown.
 */
export function getPlanConfig(plan: string): PlanConfig {
  if (PLANS.includes(plan as Plan)) {
    return PLAN_CONFIGS[plan as Plan];
  }
  return PLAN_CONFIGS.free;
}

/**
 * Check if a feature is within the plan limit.
 * Returns true if the plan allows the operation.
 */
export function isWithinLimit(
  plan: string,
  limit: keyof PlanConfig["limits"],
  current: number
): boolean {
  const config = getPlanConfig(plan);
  const max = config.limits[limit];
  if (max === -1) return true; // unlimited
  return current < max;
}
