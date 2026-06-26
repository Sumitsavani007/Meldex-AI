export type TaskMode = "chat" | "agent";
export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type TaskBranch = "queue" | "fork";

export type QueuedTask = {
  id: string;
  prompt: string;
  mode: TaskMode;
  branch: TaskBranch;
  status: TaskStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
};

export class TaskQueue {
  currentTask: QueuedTask | null = null;
  queuedTasks: QueuedTask[] = [];

  get isRunning(): boolean {
    return this.currentTask?.status === "running";
  }

  enqueue(prompt: string, mode: TaskMode = "agent", branch: TaskBranch = "queue"): QueuedTask {
    const task: QueuedTask = {
      id: `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      prompt,
      mode,
      branch,
      status: "pending",
      createdAt: Date.now(),
    };
    this.queuedTasks.push(task);
    return task;
  }

  start(promptOrTask: string | QueuedTask, mode: TaskMode = "agent"): QueuedTask {
    const task = typeof promptOrTask === "string"
      ? { id: `task-${Date.now()}-${Math.random().toString(16).slice(2)}`, prompt: promptOrTask, mode, branch: "queue" as TaskBranch, status: "pending" as TaskStatus, createdAt: Date.now() }
      : promptOrTask;
    task.status = "running";
    task.startedAt = Date.now();
    this.currentTask = task;
    return task;
  }

  completeCurrent(): void {
    if (!this.currentTask) return;
    this.currentTask.status = "completed";
    this.currentTask.completedAt = Date.now();
    this.currentTask = null;
  }

  failCurrent(): void {
    if (!this.currentTask) return;
    this.currentTask.status = "failed";
    this.currentTask.completedAt = Date.now();
    this.currentTask = null;
  }

  cancelCurrent(): void {
    if (!this.currentTask) return;
    this.currentTask.status = "cancelled";
    this.currentTask.completedAt = Date.now();
    this.currentTask = null;
  }

  next(): QueuedTask | undefined {
    return this.queuedTasks.shift();
  }

  remove(taskId: string): void {
    this.queuedTasks = this.queuedTasks.filter((task) => task.id !== taskId);
  }

  move(taskId: string, direction: "up" | "down"): void {
    const index = this.queuedTasks.findIndex((task) => task.id === taskId);
    if (index < 0) return;
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= this.queuedTasks.length) return;
    const [task] = this.queuedTasks.splice(index, 1);
    this.queuedTasks.splice(nextIndex, 0, task);
  }
}
