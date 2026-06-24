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
