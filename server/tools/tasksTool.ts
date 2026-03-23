import {
  createAgentLog,
  createTask,
  deleteTask,
  getTasksByUserId,
  updateAgentLog,
  updateTask,
} from "../db";
import { InsertTask } from "../../drizzle/schema";

export interface CreateTaskParams {
  userId: number;
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  dueDate?: Date;
  tags?: string[];
}

export async function addTask(params: CreateTaskParams) {
  const logId = await createAgentLog({
    userId: params.userId,
    agentType: "tool",
    action: "create_task",
    toolName: "tasks",
    input: { title: params.title },
    status: "started",
  });

  try {
    const data: InsertTask = {
      userId: params.userId,
      title: params.title,
      description: params.description,
      priority: params.priority ?? "medium",
      dueDate: params.dueDate,
      tags: params.tags ?? [],
      status: "todo",
    };
    const id = await createTask(data);
    await updateAgentLog(logId, { status: "success", output: { id } });
    return { success: true, id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await updateAgentLog(logId, { status: "failed", errorMessage: msg });
    return { success: false, error: msg };
  }
}

export async function listTasks(userId: number) {
  return getTasksByUserId(userId);
}

export async function modifyTask(
  userId: number,
  taskId: number,
  data: Partial<InsertTask>
) {
  const logId = await createAgentLog({
    userId,
    agentType: "tool",
    action: "update_task",
    toolName: "tasks",
    input: { taskId, ...data },
    status: "started",
  });

  try {
    await updateTask(taskId, data);
    await updateAgentLog(logId, { status: "success" });
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await updateAgentLog(logId, { status: "failed", errorMessage: msg });
    return { success: false, error: msg };
  }
}

export async function removeTask(userId: number, taskId: number) {
  const logId = await createAgentLog({
    userId,
    agentType: "tool",
    action: "delete_task",
    toolName: "tasks",
    input: { taskId },
    status: "started",
  });

  try {
    await deleteTask(taskId);
    await updateAgentLog(logId, { status: "success" });
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await updateAgentLog(logId, { status: "failed", errorMessage: msg });
    return { success: false, error: msg };
  }
}
