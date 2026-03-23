import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  AgentLog,
  CalendarEvent,
  Conversation,
  EmailConfig,
  EmailLog,
  InsertAgentLog,
  InsertCalendarEvent,
  InsertConversation,
  InsertEmailConfig,
  InsertEmailLog,
  InsertMessage,
  InsertPendingConfirmation,
  InsertReminder,
  InsertTask,
  InsertUser,
  InsertUserMemory,
  Message,
  PendingConfirmation,
  Reminder,
  Task,
  UserMemory,
  agentLogs,
  calendarEvents,
  conversations,
  emailConfigs,
  emailLogs,
  messages,
  pendingConfirmations,
  reminders,
  tasks,
  userMemory,
  users,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── User Memory ──────────────────────────────────────────────────────────────
export async function getMemoryByUserId(userId: number): Promise<UserMemory[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userMemory).where(eq(userMemory.userId, userId));
}

export async function upsertMemory(data: InsertUserMemory): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(userMemory)
    .values(data)
    .onDuplicateKeyUpdate({ set: { value: data.value, updatedAt: new Date() } });
}

export async function deleteMemoryByKey(userId: number, key: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(userMemory).where(and(eq(userMemory.userId, userId), eq(userMemory.key, key)));
}

// ─── Email Config ─────────────────────────────────────────────────────────────
export async function getEmailConfig(userId: number): Promise<EmailConfig | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(emailConfigs).where(eq(emailConfigs.userId, userId)).limit(1);
  return result[0];
}

export async function upsertEmailConfig(data: InsertEmailConfig): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(emailConfigs).values(data).onDuplicateKeyUpdate({
    set: {
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUser: data.smtpUser,
      smtpPass: data.smtpPass,
      fromName: data.fromName,
      fromEmail: data.fromEmail,
      secure: data.secure,
      updatedAt: new Date(),
    },
  });
}

// ─── Conversations ────────────────────────────────────────────────────────────
export async function getConversationsByUserId(userId: number): Promise<Conversation[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(50);
}

export async function createConversation(data: InsertConversation): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(conversations).values(data);
  return Number((result as any)[0]?.insertId ?? 0);
}

export async function updateConversationTitle(id: number, title: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(conversations).set({ title, updatedAt: new Date() }).where(eq(conversations.id, id));
}

export async function getConversationById(id: number): Promise<Conversation | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  return result[0];
}

export async function deleteConversation(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(messages).where(eq(messages.conversationId, id));
  await db.delete(conversations).where(eq(conversations.id, id));
}

// ─── Messages ─────────────────────────────────────────────────────────────────
export async function getMessagesByConversationId(conversationId: number): Promise<Message[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);
}

export async function createMessage(data: InsertMessage): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(messages).values(data);
  return Number((result as any)[0]?.insertId ?? 0);
}

// ─── Tasks ────────────────────────────────────────────────────────────────────
export async function getTasksByUserId(userId: number): Promise<Task[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks).where(eq(tasks.userId, userId)).orderBy(desc(tasks.createdAt));
}

export async function createTask(data: InsertTask): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(tasks).values(data);
  return Number((result as any)[0]?.insertId ?? 0);
}

export async function updateTask(id: number, data: Partial<InsertTask>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(tasks).set({ ...data, updatedAt: new Date() }).where(eq(tasks.id, id));
}

export async function deleteTask(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(tasks).where(eq(tasks.id, id));
}

// ─── Calendar Events ──────────────────────────────────────────────────────────
export async function getCalendarEventsByUserId(userId: number, from?: Date, to?: Date): Promise<CalendarEvent[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(calendarEvents.userId, userId)];
  if (from) conditions.push(gte(calendarEvents.startTime, from));
  if (to) conditions.push(lte(calendarEvents.startTime, to));
  return db.select().from(calendarEvents).where(and(...conditions)).orderBy(calendarEvents.startTime);
}

export async function createCalendarEvent(data: InsertCalendarEvent): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(calendarEvents).values(data);
  return Number((result as any)[0]?.insertId ?? 0);
}

export async function updateCalendarEvent(id: number, data: Partial<InsertCalendarEvent>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(calendarEvents).set({ ...data, updatedAt: new Date() }).where(eq(calendarEvents.id, id));
}

export async function deleteCalendarEvent(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
}

// ─── Reminders ────────────────────────────────────────────────────────────────
export async function getRemindersByUserId(userId: number): Promise<Reminder[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reminders).where(eq(reminders.userId, userId)).orderBy(reminders.triggerAt);
}

export async function getPendingReminders(): Promise<Reminder[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(reminders)
    .where(and(eq(reminders.status, "pending"), lte(reminders.triggerAt, new Date())));
}

export async function createReminder(data: InsertReminder): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(reminders).values(data);
  return Number((result as any)[0]?.insertId ?? 0);
}

export async function updateReminder(id: number, data: Partial<InsertReminder>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(reminders).set({ ...data, updatedAt: new Date() }).where(eq(reminders.id, id));
}

export async function deleteReminder(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(reminders).where(eq(reminders.id, id));
}

// ─── Email Logs ───────────────────────────────────────────────────────────────
export async function createEmailLog(data: InsertEmailLog): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(emailLogs).values(data);
  return Number((result as any)[0]?.insertId ?? 0);
}

export async function updateEmailLog(id: number, data: Partial<InsertEmailLog>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(emailLogs).set(data).where(eq(emailLogs.id, id));
}

export async function getEmailLogsByUserId(userId: number): Promise<EmailLog[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(emailLogs).where(eq(emailLogs.userId, userId)).orderBy(desc(emailLogs.createdAt)).limit(50);
}

// ─── Agent Logs ───────────────────────────────────────────────────────────────
export async function createAgentLog(data: InsertAgentLog): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(agentLogs).values(data);
  return Number((result as any)[0]?.insertId ?? 0);
}

export async function updateAgentLog(id: number, data: Partial<InsertAgentLog>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(agentLogs).set(data).where(eq(agentLogs.id, id));
}

export async function getAgentLogsByUserId(userId: number, limit = 100): Promise<AgentLog[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(agentLogs)
    .where(eq(agentLogs.userId, userId))
    .orderBy(desc(agentLogs.createdAt))
    .limit(limit);
}

// ─── Pending Confirmations ────────────────────────────────────────────────────
export async function createPendingConfirmation(data: InsertPendingConfirmation): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(pendingConfirmations).values(data);
  return Number((result as any)[0]?.insertId ?? 0);
}

export async function getPendingConfirmation(id: number): Promise<PendingConfirmation | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(pendingConfirmations).where(eq(pendingConfirmations.id, id)).limit(1);
  return result[0];
}

export async function updatePendingConfirmation(id: number, status: PendingConfirmation["status"]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(pendingConfirmations).set({ status }).where(eq(pendingConfirmations.id, id));
}

export async function getPendingConfirmationsByUser(userId: number): Promise<PendingConfirmation[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(pendingConfirmations)
    .where(and(eq(pendingConfirmations.userId, userId), eq(pendingConfirmations.status, "pending")))
    .orderBy(desc(pendingConfirmations.createdAt));
}
