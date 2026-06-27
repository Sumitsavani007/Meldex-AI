import { NotificationChannel, NotificationDeliveryStatus, NotificationSeverity, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const NOTIFICATION_TYPES = [
  "payment_success",
  "payment_failed",
  "subscription_created",
  "subscription_cancelled",
  "subscription_expiring",
  "plan_changed",
  "credits_low",
  "credits_exhausted",
  "five_hour_limit_reached",
  "weekly_limit_reached",
  "monthly_limit_reached",
  "admin_credit_grant",
  "workspace_created",
  "agent_task_completed",
  "agent_task_failed",
  "preview_failed",
  "download_ready",
  "new_login",
  "token_created",
  "token_revoked",
  "suspicious_usage",
  "security_change",
  "provider_unhealthy",
  "model_unavailable",
  "maintenance",
  "deploy_completed",
  "weekly_usage_summary",
] as const;

export type NotificationType = typeof NOTIFICATION_TYPES[number];

const SECURITY_TYPES = new Set(["new_login", "token_created", "token_revoked", "suspicious_usage", "security_change"]);

const DEFAULT_TEMPLATE_COPY: Record<string, { title: string; body: string; subject?: string; severity: NotificationSeverity }> = {
  payment_success: { title: "Payment received", body: "Your Meldex payment was successful.", subject: "Payment received", severity: NotificationSeverity.SUCCESS },
  payment_failed: { title: "Payment failed", body: "Your payment could not be completed. Please update billing details.", subject: "Payment failed", severity: NotificationSeverity.ERROR },
  subscription_created: { title: "Subscription active", body: "Your {{planName}} subscription is active.", subject: "Subscription active", severity: NotificationSeverity.SUCCESS },
  subscription_cancelled: { title: "Subscription cancelled", body: "Your subscription has been cancelled.", subject: "Subscription cancelled", severity: NotificationSeverity.WARNING },
  subscription_expiring: { title: "Subscription expiring soon", body: "Your subscription expires on {{expiresAt}}.", subject: "Subscription expiring soon", severity: NotificationSeverity.WARNING },
  plan_changed: { title: "Plan changed", body: "Your Meldex plan is now {{planName}}.", subject: "Plan changed", severity: NotificationSeverity.SUCCESS },
  credits_low: { title: "Credits running low", body: "You have used {{percentUsed}}% of your {{window}} credits.", subject: "Credits running low", severity: NotificationSeverity.WARNING },
  credits_exhausted: { title: "Credits exhausted", body: "You have reached your {{window}} credit limit.", subject: "Credits exhausted", severity: NotificationSeverity.ERROR },
  five_hour_limit_reached: { title: "5-hour limit reached", body: "You’ve reached your 5-hour limit.", subject: "5-hour limit reached", severity: NotificationSeverity.WARNING },
  weekly_limit_reached: { title: "Weekly limit reached", body: "You’ve reached your weekly limit.", subject: "Weekly limit reached", severity: NotificationSeverity.WARNING },
  monthly_limit_reached: { title: "Monthly limit reached", body: "You’ve reached your monthly limit.", subject: "Monthly limit reached", severity: NotificationSeverity.WARNING },
  admin_credit_grant: { title: "Credits granted", body: "{{credits}} bonus credits were added to your account.", subject: "Credits granted", severity: NotificationSeverity.SUCCESS },
  workspace_created: { title: "Workspace created", body: "{{workspaceName}} is ready.", subject: "Workspace created", severity: NotificationSeverity.SUCCESS },
  agent_task_completed: { title: "Agent task completed", body: "{{taskName}} completed successfully.", subject: "Agent task completed", severity: NotificationSeverity.SUCCESS },
  agent_task_failed: { title: "Agent task failed", body: "{{taskName}} failed. Open the task for details.", subject: "Agent task failed", severity: NotificationSeverity.ERROR },
  preview_failed: { title: "Preview failed", body: "Workspace preview failed verification.", subject: "Preview failed", severity: NotificationSeverity.WARNING },
  download_ready: { title: "Download ready", body: "Your project export is ready.", subject: "Download ready", severity: NotificationSeverity.SUCCESS },
  new_login: { title: "New login", body: "A new login was detected for your Meldex account.", subject: "New login", severity: NotificationSeverity.SECURITY },
  token_created: { title: "Token created", body: "A new access token was created.", subject: "Token created", severity: NotificationSeverity.SECURITY },
  token_revoked: { title: "Token revoked", body: "An access token was revoked.", subject: "Token revoked", severity: NotificationSeverity.SECURITY },
  suspicious_usage: { title: "Suspicious usage detected", body: "We noticed unusual usage on your account.", subject: "Suspicious usage detected", severity: NotificationSeverity.SECURITY },
  security_change: { title: "Security setting changed", body: "A security setting changed on your account.", subject: "Security setting changed", severity: NotificationSeverity.SECURITY },
  provider_unhealthy: { title: "Provider unhealthy", body: "{{provider}} is currently unhealthy.", subject: "Provider unhealthy", severity: NotificationSeverity.WARNING },
  model_unavailable: { title: "Model unavailable", body: "{{model}} is currently unavailable.", subject: "Model unavailable", severity: NotificationSeverity.WARNING },
  maintenance: { title: "Maintenance", body: "Meldex maintenance is scheduled.", subject: "Maintenance", severity: NotificationSeverity.INFO },
  deploy_completed: { title: "Deploy completed", body: "Deployment completed successfully.", subject: "Deploy completed", severity: NotificationSeverity.SUCCESS },
  weekly_usage_summary: { title: "Weekly usage summary", body: "You used {{creditsUsed}} credits and completed {{tasksCompleted}} tasks this week.", subject: "Your weekly Meldex usage", severity: NotificationSeverity.INFO },
};

function renderTemplate(input: string, variables: Record<string, unknown>) {
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const value = variables[key];
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

function categoryForType(type: string) {
  if (type.includes("payment") || type.includes("subscription") || type === "plan_changed") return "billing";
  if (type.includes("credit") || type.includes("limit")) return "usage";
  if (type.includes("token") || type.includes("login") || type.includes("security") || type === "suspicious_usage") return "security";
  if (type.includes("workspace") || type.includes("agent") || type.includes("preview") || type.includes("download")) return "workspace";
  return "system";
}

export async function seedNotificationTemplates() {
  const rows = [];
  for (const type of NOTIFICATION_TYPES) {
    const copy = DEFAULT_TEMPLATE_COPY[type];
    for (const channel of [NotificationChannel.IN_APP, NotificationChannel.EMAIL]) {
      rows.push(await prisma.notificationTemplate.upsert({
        where: { type_channel: { type, channel } },
        update: {},
        create: {
          type,
          channel,
          subject: channel === NotificationChannel.EMAIL ? copy.subject || copy.title : null,
          title: copy.title,
          body: copy.body,
          isEnabled: true,
          variablesJson: { category: categoryForType(type) } as Prisma.InputJsonValue,
        },
      }));
    }
  }
  return rows;
}

export async function getNotificationPreference(userId: string, type: string) {
  const preference = await prisma.notificationPreference.findUnique({ where: { userId_type: { userId, type } } });
  if (preference) return preference;
  return prisma.notificationPreference.create({
    data: {
      userId,
      type,
      inAppEnabled: true,
      emailEnabled: true,
    },
  });
}

export async function sendEmailNotification(input: {
  userId: string;
  type: string;
  toEmail?: string | null;
  subject: string;
  body: string;
  templateId?: string;
  metadata?: Record<string, unknown>;
}) {
  const provider = process.env.EMAIL_PROVIDER || process.env.RESEND_API_KEY && "resend" || process.env.SENDGRID_API_KEY && "sendgrid" || process.env.SMTP_HOST && "smtp" || "";
  if (!provider || !input.toEmail) {
    return prisma.emailDeliveryLog.create({
      data: {
        userId: input.userId,
        templateId: input.templateId,
        type: input.type,
        toEmail: input.toEmail || null,
        subject: input.subject,
        status: NotificationDeliveryStatus.PENDING,
        provider: provider || "not_configured",
        error: provider ? null : "Email provider is not configured.",
        metadataJson: input.metadata as Prisma.InputJsonValue,
      },
    });
  }
  return prisma.emailDeliveryLog.create({
    data: {
      userId: input.userId,
      templateId: input.templateId,
      type: input.type,
      toEmail: input.toEmail,
      subject: input.subject,
      status: NotificationDeliveryStatus.SKIPPED,
      provider,
      error: "Provider adapter is prepared but not enabled for live send in this release.",
      metadataJson: input.metadata as Prisma.InputJsonValue,
    },
  });
}

export async function createNotification(input: {
  userId: string;
  type: string;
  title?: string;
  message?: string;
  severity?: NotificationSeverity;
  actionUrl?: string | null;
  metadata?: Record<string, unknown>;
  variables?: Record<string, unknown>;
  dedupeWindowMinutes?: number;
  email?: boolean;
}) {
  await seedNotificationTemplates();
  const variables = { ...(input.variables || {}), ...(input.metadata || {}) };
  const [inAppTemplate, emailTemplate, user, preference] = await Promise.all([
    prisma.notificationTemplate.findUnique({ where: { type_channel: { type: input.type, channel: NotificationChannel.IN_APP } } }),
    prisma.notificationTemplate.findUnique({ where: { type_channel: { type: input.type, channel: NotificationChannel.EMAIL } } }),
    prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } }),
    getNotificationPreference(input.userId, input.type),
  ]);
  const securityRequired = SECURITY_TYPES.has(input.type);
  const enabledInApp = securityRequired || (preference.inAppEnabled && (inAppTemplate?.isEnabled ?? true));
  const enabledEmail = securityRequired || (preference.emailEnabled && (emailTemplate?.isEnabled ?? true));
  const since = input.dedupeWindowMinutes ? new Date(Date.now() - input.dedupeWindowMinutes * 60_000) : null;
  if (since) {
    const duplicate = await prisma.notification.findFirst({
      where: { userId: input.userId, type: input.type, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
    });
    if (duplicate) return { notification: duplicate, deduped: true };
  }
  const title = input.title || renderTemplate(inAppTemplate?.title || DEFAULT_TEMPLATE_COPY[input.type]?.title || "Meldex notification", variables);
  const message = input.message || renderTemplate(inAppTemplate?.body || DEFAULT_TEMPLATE_COPY[input.type]?.body || "", variables);
  const severity = input.severity || DEFAULT_TEMPLATE_COPY[input.type]?.severity || NotificationSeverity.INFO;
  const notification = enabledInApp ? await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title,
      message,
      severity,
      actionUrl: input.actionUrl || null,
      metadataJson: input.metadata as Prisma.InputJsonValue,
    },
  }) : null;
  if (enabledEmail && input.email !== false) {
    const subject = renderTemplate(emailTemplate?.subject || title, variables);
    const body = renderTemplate(emailTemplate?.body || message, variables);
    await sendEmailNotification({
      userId: input.userId,
      type: input.type,
      toEmail: user?.email,
      subject,
      body,
      templateId: emailTemplate?.id,
      metadata: input.metadata,
    }).catch(() => undefined);
  }
  return { notification, deduped: false };
}

export async function createWeeklyUsageSummary(userId: string) {
  const [windows, tasks, topWorkspace] = await Promise.all([
    prisma.usageWindow.findMany({ where: { userId }, orderBy: { startsAt: "desc" }, take: 3 }),
    prisma.workspaceTask.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, status: "SUCCEEDED" } }),
    prisma.workspaceProject.findFirst({ where: { userId, deletedAt: null }, orderBy: { updatedAt: "desc" }, select: { name: true } }),
  ]);
  const creditsUsed = windows.reduce((sum, row) => sum + row.creditsUsed, 0);
  return createNotification({
    userId,
    type: "weekly_usage_summary",
    variables: {
      creditsUsed,
      tasksCompleted: tasks,
      topWorkspace: topWorkspace?.name || "No workspace yet",
      resetDate: windows[0]?.resetAt?.toISOString() || "",
    },
    metadata: { creditsUsed, tasksCompleted: tasks, topWorkspace: topWorkspace?.name || null },
    dedupeWindowMinutes: 7 * 24 * 60,
  });
}
