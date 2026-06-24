import { prisma } from "./prisma";

export interface AuditLogInput {
  userId?: string | null;
  action: string;
  resource?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  success: boolean;
  errorMessage?: string;
}

export async function logAuditEvent(input: AuditLogInput) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        resource: input.resource,
        metadata: {
          resourceId: input.resourceId,
          success: input.success,
          errorMessage: input.errorMessage,
          ...input.metadata,
        },
        ipAddress: input.ipAddress,
      },
    });
  } catch (error) {
    console.error("Failed to log audit event:", error);
    // Don't throw - audit logging should not break the main operation
  }
}

export async function getUserAuditLogs(userId: string, limit = 100) {
  return prisma.auditLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getSystemAuditLogs(limit = 100) {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });
}

// Specific action loggers
export async function logAuthAttempt(
  email: string,
  success: boolean,
  ipAddress?: string,
  errorMessage?: string
) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  await logAuditEvent({
    userId: user?.id,
    action: "AUTH_ATTEMPT",
    resource: "USER",
    resourceId: user?.id,
    success,
    errorMessage,
    ipAddress,
    metadata: { email },
  });
}

export async function logProjectAccess(
  userId: string,
  projectId: string,
  ipAddress?: string
) {
  await logAuditEvent({
    userId,
    action: "PROJECT_ACCESS",
    resource: "PROJECT",
    resourceId: projectId,
    success: true,
    ipAddress,
  });
}

export async function logDataExport(
  userId: string,
  resourceType: string,
  ipAddress?: string
) {
  await logAuditEvent({
    userId,
    action: "DATA_EXPORT",
    resource: resourceType,
    success: true,
    ipAddress,
    metadata: { exportedAt: new Date().toISOString() },
  });
}

export async function logAdminAction(
  adminId: string,
  action: string,
  targetUserId?: string,
  metadata?: Record<string, unknown>,
  ipAddress?: string
) {
  await logAuditEvent({
    userId: adminId,
    action: `ADMIN_${action}`,
    resource: "ADMIN",
    resourceId: targetUserId,
    success: true,
    ipAddress,
    metadata,
  });
}

export async function logSecurityEvent(
  userId: string | null,
  event: string,
  severity: "info" | "warning" | "critical",
  metadata?: Record<string, unknown>,
  ipAddress?: string
) {
  await logAuditEvent({
    userId,
    action: `SECURITY_${event}`,
    resource: "SECURITY",
    success: severity === "info",
    ipAddress,
    errorMessage: severity !== "info" ? event : undefined,
    metadata: { severity, ...metadata },
  });
}
