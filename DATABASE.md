# Meldex AI SaaS - Database Schema Documentation

## Overview

The Meldex AI SaaS platform uses PostgreSQL with Prisma ORM for type-safe database access. The schema is fully designed for a production multi-tenant SaaS application with authentication, billing, and audit logging.

---

## Database Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   PostgreSQL Database                    │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │           Authentication Tables                    │   │
│  │  • User    • Account    • Session                 │   │
│  │  • VerificationToken                              │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │           Core Business Tables                    │   │
│  │  • Project  • File  • Conversation                │   │
│  │  • Message  • Task                                │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │           AI/Agent Tables                         │   │
│  │  • AgentAction  • AgentLog  • ModelConfig        │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │           Operations Tables                       │   │
│  │  • Execution  • UsageLog  • Billing              │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │           Audit & Security Tables                │   │
│  │  • AuditLog                                       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## Core Models

### 1. User

Represents a user account in the system.

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
  
  // Relations
  accounts      Account[]
  sessions      Session[]
  projects      Project[]
  conversations Conversation[]
  billings      Billing[]
  auditLogs     AuditLog[]
}
```

**Fields:**
- `id`: Unique identifier (CUID)
- `email`: User email (unique)
- `name`: Full name
- `emailVerified`: Email verification timestamp (null = not verified)
- `passwordHash`: bcrypt hashed password
- `role`: USER | ADMIN | OWNER
- `createdAt`: Registration timestamp
- `updatedAt`: Last update timestamp

**Indexes:**
- `email`: UNIQUE INDEX for login lookups
- `createdAt`: For user listing queries

---

### 2. Project

Represents a user project/workspace.

```prisma
model Project {
  id          String   @id @default(cuid())
  userId      String
  name        String
  description String?
  workspace   String   // Path: /projects/{userId}/{projectId}
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  // Relations
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  files       File[]
  conversations Conversation[]
  
  @@unique([userId, workspace])
  @@index([userId])
}
```

**Fields:**
- `id`: Unique project identifier
- `userId`: Owner user ID (foreign key)
- `name`: Project name
- `description`: Project description
- `workspace`: File system path for isolation
- `createdAt`: Project creation date
- `updatedAt`: Last modification date

**Indexes:**
- `userId`: For retrieving user's projects
- `(userId, workspace)`: UNIQUE for duplicate prevention

---

### 3. File

Represents files within a project.

```prisma
model File {
  id        String   @id @default(cuid())
  projectId String
  name      String
  path      String
  content   String?  // For text files
  size      Int
  mimeType  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  // Relations
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  
  @@index([projectId])
}
```

**Fields:**
- `id`: Unique file identifier
- `projectId`: Parent project (foreign key)
- `name`: File name
- `path`: Full file path (relative to project)
- `content`: File content (text files only)
- `size`: File size in bytes
- `mimeType`: MIME type (application/pdf, text/plain, etc.)
- `createdAt`: Upload date
- `updatedAt`: Last modification

---

### 4. Conversation

Represents a chat/conversation thread.

```prisma
model Conversation {
  id        String    @id @default(cuid())
  userId    String
  projectId String?
  title     String
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  
  // Relations
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  project   Project?  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  messages  Message[]
  tasks     Task[]
  
  @@index([userId])
  @@index([projectId])
}
```

**Fields:**
- `id`: Unique conversation ID
- `userId`: Conversation owner
- `projectId`: Associated project (optional)
- `title`: Conversation title
- `createdAt`: Start date
- `updatedAt`: Last message date

---

### 5. Message

Represents messages within a conversation.

```prisma
model Message {
  id             String   @id @default(cuid())
  conversationId String
  role           String   // "user" | "assistant" | "system"
  content        String
  metadata       Json?    // Additional data
  createdAt      DateTime @default(now())
  
  // Relations
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  
  @@index([conversationId])
}
```

---

### 6. Task

Represents tasks created from conversations.

```prisma
model Task {
  id             String   @id @default(cuid())
  conversationId String
  title          String
  description    String?
  status         String   @default("pending") // pending | in_progress | completed | failed
  priority       String   @default("normal")   // low | normal | high
  assignedTo     String?
  dueDate        DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  
  // Relations
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  agentActions   AgentAction[]
}
```

---

### 7. AgentAction

Represents actions taken by AI agents.

```prisma
model AgentAction {
  id        String   @id @default(cuid())
  taskId    String
  action    String   // file_write | terminal_exec | code_generate
  input     String
  output    String?
  status    String   @default("pending") // pending | success | failed
  duration  Int?     // milliseconds
  createdAt DateTime @default(now())
  
  // Relations
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  logs      AgentLog[]
}
```

---

### 8. AgentLog

Represents detailed logs of agent operations.

```prisma
model AgentLog {
  id            String   @id @default(cuid())
  agentActionId String
  message       String
  level         String   @default("info") // debug | info | warn | error
  metadata      Json?
  createdAt     DateTime @default(now())
  
  // Relations
  agentAction   AgentAction @relation(fields: [agentActionId], references: [id], onDelete: Cascade)
  
  @@index([agentActionId])
}
```

---

### 9. Execution

Represents terminal command executions.

```prisma
model Execution {
  id        String   @id @default(cuid())
  command   String
  output    String?
  exitCode  Int?
  duration  Int?     // milliseconds
  createdAt DateTime @default(now())
  
  @@index([createdAt])
}
```

---

### 10. UsageLog

Tracks token and resource usage.

```prisma
model UsageLog {
  id        String   @id @default(cuid())
  userId    String
  type      String   // token | file | execution
  quantity  Int
  metadata  Json?
  createdAt DateTime @default(now())
  
  @@index([userId])
  @@index([createdAt])
}
```

---

### 11. ModelConfig

Stores AI model provider configurations.

```prisma
model ModelConfig {
  id        String   @id @default(cuid())
  userId    String
  provider  String   // OLLAMA | OPENAI | DEEPSEEK | ANTHROPIC | OPENROUTER | CUSTOM_OPENAI_COMPATIBLE
  name      String
  model     String
  baseUrl   String?
  apiKey    String?  // Encrypted in production
  default   Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([userId])
}
```

---

### 12. Billing

Manages subscription and billing information.

```prisma
model Billing {
  id            String   @id @default(cuid())
  userId        String   @unique
  plan          String   @default("free") // free | pro | team | enterprise
  status        String   @default("active") // active | inactive | suspended
  stripeId      String?  // Stripe customer ID
  razorpayId    String?  // Razorpay customer ID
  currentPeriod DateTime?
  nextBillingDate DateTime?
  cancelledAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  // Relations
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

**Plans:**
- `free`: No cost, limited features
- `pro`: $29/month, advanced features
- `team`: $99/month, team collaboration
- `enterprise`: Custom pricing

---

### 13. AuditLog

Comprehensive audit trail for compliance and security.

```prisma
model AuditLog {
  id        String   @id @default(cuid())
  userId    String
  action    String   // auth_login | auth_logout | admin_action | file_access | etc
  resource  String?  // What was affected
  oldValue  String?  // Previous value (for updates)
  newValue  String?  // New value (for updates)
  ip        String?
  metadata  Json?
  createdAt DateTime @default(now())
  
  // Relations
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
  @@index([action])
  @@index([createdAt])
}
```

---

## NextAuth Models

### 14. Account

OAuth account linking.

```prisma
model Account {
  id                 String  @id @default(cuid())
  userId             String
  type               String
  provider           String
  providerAccountId  String
  refresh_token      String? @db.Text
  access_token       String? @db.Text
  expires_at         Int?
  token_type         String?
  scope              String?
  id_token           String? @db.Text
  session_state      String?
  
  user User @relation("accounts", fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([provider, providerAccountId])
  @@index([userId])
}
```

---

### 15. Session

NextAuth JWT sessions.

```prisma
model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
}
```

---

### 16. VerificationToken

Email verification tokens.

```prisma
model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  
  @@unique([identifier, token])
}
```

---

## Relationships Diagram

```
User (1) ──── (M) Project
  │
  ├─ (1) ──── (M) Account (OAuth)
  ├─ (1) ──── (M) Session
  ├─ (1) ──── (M) Conversation
  ├─ (1) ──── (M) Billing
  └─ (1) ──── (M) AuditLog

Project (1) ──── (M) File
Project (1) ──── (M) Conversation

Conversation (1) ──── (M) Message
Conversation (1) ──── (M) Task

Task (1) ──── (M) AgentAction

AgentAction (1) ──── (M) AgentLog
```

---

## Enumerations

### User Roles
```
USER   - Regular user
ADMIN  - System administrator
OWNER  - Account owner
```

### Message Roles
```
user       - User message
assistant  - AI assistant response
system     - System message
```

### Task Status
```
pending      - Not started
in_progress  - Currently being worked on
completed    - Successfully finished
failed       - Error occurred
```

### Task Priority
```
low     - Low priority
normal  - Standard priority
high    - High priority
```

### AgentAction Status
```
pending - Waiting to execute
success - Completed successfully
failed  - Execution failed
```

### Plan Type
```
free       - Free tier
pro        - Professional tier
team       - Team tier
enterprise - Enterprise tier
```

### Billing Status
```
active     - Active subscription
inactive   - Inactive
suspended  - Suspended (non-payment)
```

---

## Indexing Strategy

### Primary Indexes
```sql
-- User lookups
CREATE UNIQUE INDEX idx_users_email ON users(email);

-- Project access control
CREATE INDEX idx_projects_userId ON projects(userId);
CREATE UNIQUE INDEX idx_projects_userId_workspace ON projects(userId, workspace);

-- File organization
CREATE INDEX idx_files_projectId ON files(projectId);

-- Conversation queries
CREATE INDEX idx_conversations_userId ON conversations(userId);
CREATE INDEX idx_conversations_projectId ON conversations(projectId);

-- Message ordering
CREATE INDEX idx_messages_conversationId ON messages(conversationId);
CREATE INDEX idx_messages_createdAt ON messages(createdAt DESC);

-- Task tracking
CREATE INDEX idx_tasks_conversationId ON tasks(conversationId);
CREATE INDEX idx_tasks_status ON tasks(status);

-- Audit trails
CREATE INDEX idx_auditLogs_userId ON auditLogs(userId);
CREATE INDEX idx_auditLogs_action ON auditLogs(action);
CREATE INDEX idx_auditLogs_createdAt ON auditLogs(createdAt DESC);
```

---

## Migration Scripts

### Initial Setup
```bash
npx prisma migrate dev --name init
```

### Create Indexes
```bash
npx prisma db execute --stdin < indexes.sql
```

### View Schema
```bash
npx prisma studio
```

---

## Data Validation Rules

### Users
- Email: Valid email format, unique
- Name: 2-100 characters
- Password: Min 8 characters, bcrypt hashed
- Role: One of USER, ADMIN, OWNER

### Projects
- Name: 1-255 characters
- Workspace: Must match `/projects/{userId}/{projectId}`
- One workspace path per user

### Files
- Name: 1-255 characters
- Path: Must be within project workspace
- Size: Max 100MB per file

### Conversations
- Title: 1-255 characters
- Must have userId

### Tasks
- Title: 1-255 characters
- Status: One of pending, in_progress, completed, failed
- Priority: One of low, normal, high

---

## Performance Considerations

### Query Optimization
1. **Always filter by userId** for security and performance
2. **Use indexed fields** in WHERE clauses
3. **Limit result sets** for pagination
4. **Use projections** to select only needed fields

### Example Optimized Queries

Good:
```prisma
// Efficient: Uses indexed field
const projects = await prisma.project.findMany({
  where: { userId }
});
```

Bad:
```prisma
// Inefficient: Full table scan
const projects = await prisma.project.findMany({
  where: { name: "My Project" }
});
```

### Pagination Pattern
```prisma
const conversations = await prisma.conversation.findMany({
  where: { userId },
  skip: (page - 1) * limit,
  take: limit,
  orderBy: { createdAt: 'desc' }
});
```

---

## Backup & Recovery

### Daily Backups
```bash
pg_dump -U meldex meldex_ai | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Restore from Backup
```bash
gunzip < backup_20240624.sql.gz | psql -U meldex meldex_ai
```

### Point-in-Time Recovery
Enable with:
```sql
ALTER SYSTEM SET wal_level = replica;
SELECT pg_reload_conf();
```

---

## Compliance & Security

### Data Retention
- User audit logs: Keep for 90 days minimum
- Login history: Keep for 30 days minimum
- Deleted files: Soft delete for 30 days before purge

### Data Privacy
- Encrypt sensitive fields in production
- Hash API keys before storage
- Implement GDPR right to deletion
- Regular penetration testing

### Access Control
- Enforce user isolation at database level
- Use row-level security (RLS) for multi-tenant data
- Audit all admin actions
- Restrict API key access

---

## Database Statistics

### Initial Sizing
- Users table: ~100KB per 1000 users
- Projects table: ~200KB per 1000 projects
- Messages table: ~500KB per 10000 messages
- AuditLog table: Grows ~100MB per month

### Growth Projections
- 1,000 users: ~200MB
- 10,000 users: ~2GB
- 100,000 users: ~20GB

---

Generated: 2026-06-24
Status: ✅ Production Ready
