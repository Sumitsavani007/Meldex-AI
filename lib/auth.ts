import NextAuth from "next-auth";
import type { DefaultSession, Session } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      role: "USER" | "ADMIN" | "OWNER";
    } & DefaultSession["user"];
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  // Required when running behind a reverse proxy (Nginx)
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/auth/error",
  },
  events: {
    async linkAccount({ user }) {
      await prisma.user.update({
        where: { id: user.id! },
        data: { emailVerified: new Date() },
      });
    },
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "credentials") return true;
      
      const existingUser = await prisma.user.findUnique({
        where: { email: user.email! },
      });
      
      return !!existingUser;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as unknown as { role: string }).role || "USER";
      }
      // On every token refresh, re-read role from DB to pick up role changes.
      if (!user && token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true },
        });
        if (dbUser) {
          token.role = dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }): Promise<Session> {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "USER" | "ADMIN" | "OWNER";
      }
      return session;
    },
  },
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Invalid credentials");
        }

        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          throw new Error("Invalid credentials");
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });

        if (!user || !user.passwordHash) {
          throw new Error("Invalid email or password");
        }

        const passwordMatch = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash
        );

        if (!passwordMatch) {
          throw new Error("Invalid email or password");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          // Pass role so the jwt callback can embed it in the token.
          role: user.role,
        };
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      allowDangerousEmailAccountLinking: true,
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_ID || "",
      clientSecret: process.env.GITHUB_SECRET || "",
      allowDangerousEmailAccountLinking: true,
    }),
  ],
});
