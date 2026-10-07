export const WORKFLOW_STATUSES = [
  "pending",
  "running",
  "waiting_captcha",
  "waiting_email",
  "manual_required",
  "success",
  "failed",
  "retrying",
  "banned",
  "needs_review"
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export interface WorkflowTask {
  id: string;
  name: string;
  status: WorkflowStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
}

export function createWorkflowTask(name: string, status: WorkflowStatus = "pending"): WorkflowTask {
  const now = new Date().toISOString();

  return {
    id: cryptoSafeId(),
    name,
    status,
    attempts: 0,
    maxAttempts: 3,
    createdAt: now,
    updatedAt: now
  };
}

export function transitionTask(task: WorkflowTask, nextStatus: WorkflowStatus): WorkflowTask {
  if (!WORKFLOW_STATUSES.includes(nextStatus)) {
    throw new Error(`Unsupported workflow status: ${nextStatus}`);
  }

  return {
    ...task,
    status: nextStatus,
    attempts: nextStatus === "retrying" ? task.attempts + 1 : task.attempts,
    updatedAt: new Date().toISOString()
  };
}

function cryptoSafeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `task_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
