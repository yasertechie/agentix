import {
  createAgentLog,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEventsByUserId,
  updateAgentLog,
  updateCalendarEvent,
} from "../db";
import { InsertCalendarEvent } from "../../drizzle/schema";

export interface CreateEventParams {
  userId: number;
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  allDay?: boolean;
  attendees?: string[];
  color?: string;
  recurrence?: string;
}

export interface UpdateEventParams extends Partial<CreateEventParams> {
  id: number;
  userId: number;
}

export async function createEvent(params: CreateEventParams) {
  const logId = await createAgentLog({
    userId: params.userId,
    agentType: "tool",
    action: "create_calendar_event",
    toolName: "calendar",
    input: { title: params.title, startTime: params.startTime },
    status: "started",
  });

  try {
    const data: InsertCalendarEvent = {
      userId: params.userId,
      title: params.title,
      description: params.description,
      location: params.location,
      startTime: params.startTime,
      endTime: params.endTime,
      allDay: params.allDay ?? false,
      attendees: params.attendees ?? [],
      color: params.color ?? "blue",
      recurrence: params.recurrence ?? "none",
    };
    const id = await createCalendarEvent(data);
    await updateAgentLog(logId, { status: "success", output: { id } });
    return { success: true, id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await updateAgentLog(logId, { status: "failed", errorMessage: msg });
    return { success: false, error: msg };
  }
}

export async function listEvents(userId: number, from?: Date, to?: Date) {
  return getCalendarEventsByUserId(userId, from, to);
}

export async function modifyEvent(params: UpdateEventParams) {
  const logId = await createAgentLog({
    userId: params.userId,
    agentType: "tool",
    action: "update_calendar_event",
    toolName: "calendar",
    input: { id: params.id },
    status: "started",
  });

  try {
    const { id, userId, ...rest } = params;
    await updateCalendarEvent(id, rest as Partial<InsertCalendarEvent>);
    await updateAgentLog(logId, { status: "success", output: { id } });
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await updateAgentLog(logId, { status: "failed", errorMessage: msg });
    return { success: false, error: msg };
  }
}

export async function removeEvent(userId: number, eventId: number) {
  const logId = await createAgentLog({
    userId,
    agentType: "tool",
    action: "delete_calendar_event",
    toolName: "calendar",
    input: { eventId },
    status: "started",
  });

  try {
    await deleteCalendarEvent(eventId);
    await updateAgentLog(logId, { status: "success" });
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await updateAgentLog(logId, { status: "failed", errorMessage: msg });
    return { success: false, error: msg };
  }
}
