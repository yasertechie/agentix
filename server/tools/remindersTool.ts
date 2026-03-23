import {
  createAgentLog,
  createReminder,
  deleteReminder,
  getRemindersByUserId,
  updateAgentLog,
  updateReminder,
} from "../db";
import { InsertReminder } from "../../drizzle/schema";

export interface CreateReminderParams {
  userId: number;
  title: string;
  message?: string;
  triggerAt: Date;
  repeat?: "none" | "daily" | "weekly";
}

export async function addReminder(params: CreateReminderParams) {
  const logId = await createAgentLog({
    userId: params.userId,
    agentType: "tool",
    action: "create_reminder",
    toolName: "reminders",
    input: { title: params.title, triggerAt: params.triggerAt },
    status: "started",
  });

  try {
    const data: InsertReminder = {
      userId: params.userId,
      title: params.title,
      message: params.message,
      triggerAt: params.triggerAt,
      repeat: params.repeat ?? "none",
      status: "pending",
    };
    const id = await createReminder(data);
    await updateAgentLog(logId, { status: "success", output: { id } });
    return { success: true, id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await updateAgentLog(logId, { status: "failed", errorMessage: msg });
    return { success: false, error: msg };
  }
}

export async function listReminders(userId: number) {
  return getRemindersByUserId(userId);
}

export async function snoozeReminder(userId: number, reminderId: number, snoozeUntil: Date) {
  await updateReminder(reminderId, { status: "snoozed", snoozeUntil });
  return { success: true };
}

export async function dismissReminder(userId: number, reminderId: number) {
  await updateReminder(reminderId, { status: "dismissed" });
  return { success: true };
}

export async function removeReminder(userId: number, reminderId: number) {
  await deleteReminder(reminderId);
  return { success: true };
}
