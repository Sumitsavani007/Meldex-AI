/**
 * prisma/seed.ts
 *
 * Seeds the database with an initial OWNER (super-admin) account and a sample
 * USER so the app is usable right after `npx prisma migrate dev`.
 *
 * Run:  npx prisma db seed
 *
 * The admin credentials are read from environment variables so they are never
 * hard-coded in source control.  Defaults are provided for local development.
 *
 *   SEED_ADMIN_EMAIL    (default: admin@meldex.ai)
 *   SEED_ADMIN_PASSWORD (default: Admin1234!)  ← change in production
 *   SEED_ADMIN_NAME     (default: Admin)
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const defaultAllowedModels = [
  "qwen/qwen3-coder-30b-a3b-instruct",
  "qwen/qwen3-coder:free",
];

const defaultPlans = [
  { id: "plan_free", name: "Free", slug: "free", description: "Starter access for trying Meldex.", priceMonthly: 0, priceYearly: 0, currency: "USD", monthlyCredits: 1000, weeklyCredits: 300, fiveHourCredits: 50, maxContextTokens: 128000, maxWorkspaceCount: 25, maxStorageMb: 500, maxParallelTasks: 1, priorityLevel: 1, allowedModelsJson: defaultAllowedModels, featuresJson: ["Basic workspace", "AI chat", "Offline mode"], isActive: true, sortOrder: 10 },
  { id: "plan_plus", name: "Meldex Plus", slug: "meldex-plus", description: "More credits and larger workspaces for active builders.", priceMonthly: 1900, priceYearly: 19000, currency: "USD", monthlyCredits: 10000, weeklyCredits: 3000, fiveHourCredits: 500, maxContextTokens: 500000, maxWorkspaceCount: 20, maxStorageMb: 10000, maxParallelTasks: 2, priorityLevel: 2, allowedModelsJson: defaultAllowedModels, featuresJson: ["Priority workspace runs", "Extension tokens", "Memory"], isActive: true, sortOrder: 20 },
  { id: "plan_pro", name: "Meldex Pro", slug: "meldex-pro", description: "Professional limits for serious product work.", priceMonthly: 4900, priceYearly: 49000, currency: "USD", monthlyCredits: 50000, weeklyCredits: 15000, fiveHourCredits: 2500, maxContextTokens: 1000000, maxWorkspaceCount: 100, maxStorageMb: 50000, maxParallelTasks: 4, priorityLevel: 3, allowedModelsJson: defaultAllowedModels, featuresJson: ["Higher context", "More workspaces", "Priority model access"], isActive: true, sortOrder: 30 },
  { id: "plan_pro_plus", name: "Meldex Pro+", slug: "meldex-pro-plus", description: "Highest limits for power users and teams.", priceMonthly: 9900, priceYearly: 99000, currency: "USD", monthlyCredits: 200000, weeklyCredits: 50000, fiveHourCredits: 10000, maxContextTokens: 2000000, maxWorkspaceCount: 500, maxStorageMb: 200000, maxParallelTasks: 8, priorityLevel: 4, allowedModelsJson: defaultAllowedModels, featuresJson: ["Maximum credits", "Largest context", "Top priority"], isActive: true, sortOrder: 40 },
];

const defaultModelUsageConfig = {
  id: "model_usage_openrouter_qwen3_coder",
  provider: "openrouter",
  model: "qwen/qwen3-coder-30b-a3b-instruct",
  inputCreditMultiplier: 1,
  outputCreditMultiplier: 2,
  reasoningCreditMultiplier: 3,
  cachedCreditMultiplier: 0.25,
  toolCallCreditCost: 1,
  previewCreditCost: 2,
  fileReadCreditCost: 0.2,
  fileWriteCreditCost: 1,
  memoryReadCreditCost: 0.2,
  memoryWriteCreditCost: 0.5,
  fallbackEstimateCredits: 15,
  retryMultiplier: 1.25,
  autofixMultiplier: 1.5,
  isActive: true,
};

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL || "",
  }),
});

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@meldex.ai";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "Admin1234!";
  const adminName = process.env.SEED_ADMIN_NAME ?? "Admin";

  console.log("🌱  Seeding database…");

  for (const plan of defaultPlans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: {
        name: plan.name,
        description: plan.description,
      },
      create: plan,
    });
  }
  console.log("✅  Default plans ensured.");

  await prisma.modelUsageConfig.upsert({
    where: { provider_model: { provider: defaultModelUsageConfig.provider, model: defaultModelUsageConfig.model } },
    update: { isActive: true },
    create: defaultModelUsageConfig,
  });
  console.log("✅  Default model usage pricing ensured.");

  // ── Owner / super-admin account ──────────────────────────────────────────
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (existing) {
    console.log(`ℹ️   Admin user already exists: ${adminEmail} (role: ${existing.role})`);
  } else {
    const hash = await bcrypt.hash(adminPassword, 12);
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: adminName,
        passwordHash: hash,
        role: "OWNER",
        emailVerified: new Date(),
        authProvider: "email",
        billing: {
          create: {
            plan: "enterprise",
            status: "ACTIVE",
          },
        },
      },
    });
    console.log(`✅  Created OWNER account: ${admin.email}`);
    console.log(`    Name    : ${admin.name}`);
    console.log(`    Password: ${adminPassword}  ← change this immediately`);
  }

  console.log("✅  Seed complete.");
}

main()
  .catch((e) => {
    console.error("❌  Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
