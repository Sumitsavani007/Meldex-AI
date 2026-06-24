#!/usr/bin/env ts-node
/**
 * scripts/create-admin.ts
 *
 * Standalone script to create or promote an admin/owner account without
 * requiring the Next.js server to be running.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/create-admin.ts
 *
 * Environment variables (or pass as CLI args):
 *   ADMIN_EMAIL     Email address for the admin user
 *   ADMIN_PASSWORD  Password (min 8 chars)
 *   ADMIN_NAME      Display name
 *   ADMIN_ROLE      USER | ADMIN | OWNER  (default: OWNER)
 *
 * Examples:
 *   ADMIN_EMAIL=me@example.com ADMIN_PASSWORD=Secret99! npx ts-node \
 *     --compiler-options '{"module":"CommonJS"}' scripts/create-admin.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import * as readline from "readline";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL || "" }),
});

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌  DATABASE_URL is not set. Copy .env.example to .env.local and set it.");
    process.exit(1);
  }

  console.log("\n🔑  Meldex AI — Admin Bootstrap\n");

  const email =
    process.env.ADMIN_EMAIL ||
    (await prompt("Admin email: "));

  const password =
    process.env.ADMIN_PASSWORD ||
    (await prompt("Admin password (min 8 chars): "));

  const name =
    process.env.ADMIN_NAME ||
    (await prompt("Display name [Admin]: ")) ||
    "Admin";

  const roleInput =
    (process.env.ADMIN_ROLE || (await prompt("Role (USER/ADMIN/OWNER) [OWNER]: ")) || "OWNER").toUpperCase();

  const role = (["USER", "ADMIN", "OWNER"].includes(roleInput) ? roleInput : "OWNER") as
    "USER" | "ADMIN" | "OWNER";

  if (!email || !email.includes("@")) {
    console.error("❌  Invalid email address.");
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error("❌  Password must be at least 8 characters.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Upsert: create if not exists, update role + password if exists
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name,
      passwordHash,
      role,
      emailVerified: new Date(),
      authProvider: "email",
      billing: { create: { plan: "enterprise", status: "ACTIVE" } },
    },
    update: {
      name,
      passwordHash,
      role,
      emailVerified: new Date(),
    },
  });

  console.log(`\n✅  ${user.id ? "Created/updated" : "Updated"} user:`);
  console.log(`    Email : ${user.email}`);
  console.log(`    Name  : ${user.name}`);
  console.log(`    Role  : ${user.role}`);
  console.log(`    ID    : ${user.id}\n`);
}

main()
  .catch((e) => { console.error("❌  Error:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
