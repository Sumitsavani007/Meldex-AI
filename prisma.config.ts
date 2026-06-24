import { defineConfig } from "prisma/config";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://sumitsavani@localhost:5432/meldex";

export default defineConfig({
  datasource: {
    url: DATABASE_URL,
  },
  schema: "./prisma/schema.prisma",
});
