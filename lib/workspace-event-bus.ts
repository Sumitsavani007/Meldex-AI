import { createWorkspaceTaskEvent, type WorkspaceStreamEvent } from "@/lib/ai-workspace";

type WorkspaceEventBusInput = {
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
  userId: string;
  projectId: string;
  getTaskId: () => string | null;
  isAborted: () => boolean;
};

function encode(event: WorkspaceStreamEvent) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function createWorkspaceEventBus(input: WorkspaceEventBusInput) {
  let sequence = 0;
  let queue: Promise<unknown> = Promise.resolve();

  const flushWorkspaceEvent = (event: WorkspaceStreamEvent) => {
    if (input.isAborted()) return event;
    try {
      input.controller.enqueue(input.encoder.encode(encode(event)));
    } catch {
      // The browser may have navigated away. Keep the task alive and persist future events.
    }
    return event;
  };

  const persistWorkspaceEvent = async (type: string, message: string, payload?: Record<string, unknown>) => {
    sequence += 1;
    const taskId = input.getTaskId();
    if (!taskId) {
      return { sequence, type, message, payload } satisfies WorkspaceStreamEvent;
    }
    return createWorkspaceTaskEvent({
      userId: input.userId,
      projectId: input.projectId,
      taskId,
      sequence,
      type,
      message,
      payload,
    });
  };

  const emitWorkspaceEvent = (type: string, message: string, payload?: Record<string, unknown>) => {
    queue = queue.then(async () => {
      const event = await persistWorkspaceEvent(type, message, payload);
      return flushWorkspaceEvent(event);
    });
    return queue;
  };

  const heartbeat = (message = "Still working… analyzing generation", intervalMs = 3000) => {
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      void emitWorkspaceEvent("heartbeat", message, { ticks, source: "workspace-event-bus" }).catch(() => undefined);
    }, intervalMs);
    return () => clearInterval(timer);
  };

  return {
    emitWorkspaceEvent,
    flushWorkspaceEvent,
    persistWorkspaceEvent,
    heartbeat,
  };
}
