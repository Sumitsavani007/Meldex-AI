# Meldex AI SaaS - Auth Routes & Components Reference

## Overview

Complete reference of all authentication-related routes, components, and configurations implemented in Meldex AI.

---

## Authentication Routes

### User-Facing Routes

#### `/login` - Login Page
**File:** `app/login/page.tsx`
**Type:** Page Route (Server Component with Suspense)
**Access:** Public (redirects to dashboard if already authenticated)
**UI Components:** LoginForm

**Features:**
- Email/password login
- Google OAuth
- GitHub OAuth
- "Sign up" link for new users
- Error message display
- Loading states

**Code:**
```typescript
"use client";
import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LoginForm />
    </Suspense>
  );
}
```

---

#### `/login/login-form.tsx` - Login Form Component
**File:** `app/login/login-form.tsx`
**Type:** Client Component
**Access:** Internal (used by login page)

**Features:**
- Email input field with icon
- Password input field with icon
- "Sign In" button with loading state
- Google OAuth button
- GitHub OAuth button
- Error handling with error display
- Callback URL support (redirect after login)

**Key Hooks:**
- `useSearchParams()` - Get callback URL from query
- `useRouter()` - Navigate after successful login
- `signIn()` - NextAuth sign in function
- `useState()` - Form state management

**States:**
- `email` - User email
- `password` - User password
- `error` - Error message
- `loading` - Loading state

**Event Handlers:**
```typescript
const handleCredentialsLogin = async (e: React.FormEvent) => {
  // Email/password login logic
}
```

---

#### `/register` - Registration Page
**File:** `app/register/page.tsx`
**Type:** Client Component
**Access:** Public (redirects to dashboard if already authenticated)

**Features:**
- Full name input
- Email input
- Password input
- Confirm password input
- Google OAuth
- GitHub OAuth
- "Sign in" link for existing users
- Password validation
- Error handling

**States:**
```typescript
const [name, setName] = useState("");
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [confirmPassword, setConfirmPassword] = useState("");
const [error, setError] = useState("");
const [loading, setLoading] = useState(false);
```

**Validation:**
- Email format validation
- Password min 8 characters
- Password confirmation match
- Name required

---

#### `/unauthorized` - Access Denied Page
**File:** `app/unauthorized/page.tsx`
**Type:** Static Page
**Access:** Public (shown when user lacks required role)

**Display:**
- AlertTriangle icon
- "Access Denied" heading
- Explanation message
- Link back to dashboard

---

## API Routes

### Authentication Endpoints

#### `POST /api/auth/register` - User Registration
**File:** `app/api/auth/register/route.ts`
**Method:** POST
**Authentication:** None (public)

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword123"
}
```

**Response (Success - 201):**
```json
{
  "id": "user_123",
  "email": "john@example.com",
  "name": "John Doe",
  "role": "USER"
}
```

**Response (Error - 400):**
```json
{
  "error": "Email already registered"
}
```

**Validation:**
- Email format
- Password min 8 chars
- Zod schema validation

**Database Operations:**
1. Check email doesn't exist
2. Hash password with bcrypt
3. Create user record
4. Return user data

**Error Cases:**
- Invalid email format
- Duplicate email
- Validation errors
- Server errors

---

#### `GET/POST /api/auth/[...nextauth]` - NextAuth Handler
**File:** `app/api/auth/[...nextauth]/route.ts`
**Type:** Catch-all API route
**Provides:**
- OAuth callback handling
- Session management
- JWT generation
- CSRF protection
- User authentication

**Handlers Exported:**
```typescript
export const { GET, POST } = handlers;
```

**Callback URLs:**
- `GET /api/auth/signin` - Sign in page
- `GET /api/auth/callback/google` - Google OAuth callback
- `GET /api/auth/callback/github` - GitHub OAuth callback
- `POST /api/auth/callback/credentials` - Credentials validation
- `GET /api/auth/session` - Get current session
- `POST /api/auth/signout` - Sign out

**Configuration:**
- JWT session strategy
- CredentialsProvider for email/password
- GoogleProvider for OAuth
- GitHubProvider for OAuth

---

## Configuration Files

### `lib/auth.ts` - NextAuth Configuration
**Purpose:** Central NextAuth configuration

**Content:**
```typescript
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import prisma from "./prisma";
import bcrypt from "bcryptjs";

const handlers = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    // Credentials Provider
    CredentialsProvider({
      credentials: { email, password },
      // Email/password validation logic
    }),
    
    // Google OAuth
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    
    // GitHub OAuth
    GitHubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
  ],
  
  pages: {
    signIn: "/login",
    error: "/auth/error",
  },
  
  callbacks: {
    jwt({ token, user }) {
      // Add user info to JWT
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    
    session({ session, token }) {
      // Add token info to session
      session.user.id = token.id;
      session.user.role = token.role;
      return session;
    },
  },
});
```

**Callbacks:**
- `jwt()` - Customize JWT token
- `session()` - Customize session object
- `signIn()` - Control sign-in behavior
- `redirect()` - Control redirects

---

### `lib/auth-utils.ts` - Auth Helper Functions
**Purpose:** Authentication utility functions

**Functions:**

#### `registerSchema` - Zod Validation Schema
```typescript
const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});
```

#### `registerUser()` - Create new user
```typescript
export async function registerUser(
  name: string,
  email: string,
  password: string
) {
  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);
  
  // Create user in database
  return prisma.user.create({
    data: { name, email, passwordHash }
  });
}
```

---

### `middleware.ts` - Protected Routes
**Purpose:** Route protection and authorization

**Protected Routes:**
- `/dashboard` - Requires authentication
- `/chat` - Requires authentication
- `/workspace` - Requires authentication
- `/settings` - Requires authentication
- `/admin` - Requires ADMIN role

**Code:**
```typescript
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const protectedRoutes = [
  "/dashboard",
  "/chat",
  "/workspace",
  "/settings",
  "/admin",
];

const adminRoutes = ["/admin"];

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  
  // Check if route is protected
  if (protectedRoutes.some(route => pathname.startsWith(route))) {
    const session = await auth();
    
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    
    // Check admin routes
    if (adminRoutes.some(route => pathname.startsWith(route))) {
      if (session.user.role !== "ADMIN") {
        return NextResponse.redirect(new URL("/unauthorized", request.url));
      }
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/:path*"],
};
```

---

## Components

### `components/auth-provider.tsx` - Session Provider
**Purpose:** Wrap application with session context

**Code:**
```typescript
"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";

export default function AuthProvider({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

**Usage in Layout:**
```typescript
import AuthProvider from "@/components/auth-provider";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
```

---

### `components/header.tsx` - Navigation Header
**Purpose:** Display user info and auth status

**Features:**
- Show logged-in user email
- Logout button
- Navigation links
- Responsive design

**Code:**
```typescript
"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";

export default function Header() {
  const { data: session } = useSession();
  
  if (!session?.user) {
    return (
      <header>
        <Link href="/login">Login</Link>
        <Link href="/register">Sign Up</Link>
      </header>
    );
  }
  
  return (
    <header>
      <span>{session.user.email}</span>
      <button onClick={() => signOut()}>Logout</button>
      {/* Navigation links */}
    </header>
  );
}
```

---

## Database Models for Auth

### User Model
```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  emailVerified DateTime?
  passwordHash  String?
  image         String?
  role          String    @default("USER")
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  accounts      Account[]
  sessions      Session[]
  projects      Project[]
}
```

**Roles:**
- `USER` - Regular user
- `ADMIN` - System administrator
- `OWNER` - Account owner

---

### Account Model (OAuth)
```prisma
model Account {
  id                 String  @id @default(cuid())
  userId             String
  type               String
  provider           String  // "google", "github"
  providerAccountId  String
  access_token       String?
  refresh_token      String?
  expires_at         Int?
  
  user User @relation("accounts", fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([provider, providerAccountId])
}
```

---

### Session Model
```prisma
model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

---

## Environment Variables Required

```env
# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here-change-in-production

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/meldex_ai

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# GitHub OAuth
GITHUB_ID=your-github-app-id
GITHUB_SECRET=your-github-app-secret
```

---

## Session Management

### Getting Current Session

**In Server Components:**
```typescript
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth();
  
  if (!session?.user) {
    redirect("/login");
  }
  
  return <div>Hello {session.user.email}</div>;
}
```

**In Client Components:**
```typescript
"use client";

import { useSession } from "next-auth/react";

export default function Component() {
  const { data: session } = useSession();
  
  if (!session?.user) {
    return <div>Not authenticated</div>;
  }
  
  return <div>Hello {session.user.name}</div>;
}
```

---

## OAuth Flow Diagram

```
1. User clicks "Sign in with Google/GitHub"
   ↓
2. Redirect to /api/auth/signin/[provider]
   ↓
3. NextAuth redirects to OAuth provider
   ↓
4. User authorizes app
   ↓
5. OAuth provider redirects to /api/auth/callback/[provider]
   ↓
6. NextAuth validates token
   ↓
7. Create or link Account
   ↓
8. Create JWT session
   ↓
9. Redirect to callbackUrl (default: /dashboard)
   ↓
10. User authenticated!
```

---

## Credentials Flow Diagram

```
1. User enters email & password on /login
   ↓
2. Form submits to signIn("credentials", {...})
   ↓
3. NextAuth calls CredentialsProvider.authorize()
   ↓
4. Query user by email from database
   ↓
5. Compare password with bcrypt
   ↓
6. Return user object if valid
   ↓
7. NextAuth creates JWT session
   ↓
8. Redirect to callbackUrl
   ↓
9. User authenticated!
```

---

## Security Features

### Password Hashing
- **Algorithm:** bcryptjs
- **Salt Rounds:** 10
- **Cost:** ~100ms per hash

```typescript
const hash = await bcrypt.hash(password, 10);
const isValid = await bcrypt.compare(password, hash);
```

### JWT Session
- **Algorithm:** HS256
- **Expiration:** 30 days (default)
- **Claims:** id, role, email, name

### CSRF Protection
- **Method:** Double-submit cookies
- **Enabled:** By default in NextAuth

### Rate Limiting
- **Protection:** Prevent brute force attacks
- **Location:** `lib/security.ts`

---

## Testing Guide

### Test Registration
1. Visit `/register`
2. Fill in all fields
3. Click "Sign Up"
4. Verify user created in database
5. Verify automatic sign in

### Test Email/Password Login
1. Visit `/login`
2. Enter email & password
3. Click "Sign In"
4. Verify session created
5. Verify redirected to `/dashboard`

### Test Google OAuth
1. Visit `/login`
2. Click "Google" button
3. Authenticate with Google
4. Verify redirected back
5. Verify account linked in database

### Test GitHub OAuth
1. Visit `/login`
2. Click "GitHub" button
3. Authenticate with GitHub
4. Verify redirected back
5. Verify account linked in database

### Test Protected Routes
1. Sign out
2. Try to visit `/dashboard`
3. Verify redirect to `/login`
4. Sign in
5. Verify can access `/dashboard`

### Test Admin Routes
1. Sign in as regular user
2. Try to visit `/admin`
3. Verify redirect to `/unauthorized`
4. Sign in as admin user
5. Verify can access `/admin`

---

## Troubleshooting

### "useSearchParams() should be wrapped in a suspense boundary"
**Solution:** Use Suspense boundary around component with useSearchParams
```typescript
<Suspense fallback={<LoadingSpinner />}>
  <LoginForm />
</Suspense>
```

### "NEXTAUTH_SECRET not configured"
**Solution:** Add to .env.local:
```env
NEXTAUTH_SECRET=$(openssl rand -base64 32)
```

### "Database connection failed"
**Solution:** Check DATABASE_URL in .env.local and ensure PostgreSQL is running

### "OAuth redirect_uri_mismatch"
**Solution:** Ensure callback URLs match in OAuth provider settings:
- `http://localhost:3000/api/auth/callback/google`
- `https://yourdomain.com/api/auth/callback/google`

### "User not found" on login
**Solution:** Ensure user exists in database or create test user:
```typescript
await prisma.user.create({
  data: {
    email: "test@example.com",
    passwordHash: await bcrypt.hash("password", 10),
    name: "Test User"
  }
});
```

---

Generated: 2026-06-24
Status: ✅ Production Ready
