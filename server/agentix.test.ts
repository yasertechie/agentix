import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getConversationsByUserId: vi.fn().mockResolvedValue([]),
  createConversation: vi.fn().mockResolvedValue(1),
  deleteConversation: vi.fn().mockResolvedValue(undefined),
  getMessagesByConversationId: vi.fn().mockResolvedValue([]),
  createMessage: vi.fn().mockResolvedValue(1),
  getConversationById: vi.fn().mockResolvedValue({ id: 1, title: "Test", userId: 1 }),
  updateConversationTitle: vi.fn().mockResolvedValue(undefined),
  createPendingConfirmation: vi.fn().mockResolvedValue(1),
  getPendingConfirmation: vi.fn().mockResolvedValue(null),
  getPendingConfirmationsByUser: vi.fn().mockResolvedValue([]),
  updatePendingConfirmation: vi.fn().mockResolvedValue(undefined),
  getTasksByUserId: vi.fn().mockResolvedValue([]),
  createTask: vi.fn().mockResolvedValue(1),
  updateTask: vi.fn().mockResolvedValue(undefined),
  deleteTask: vi.fn().mockResolvedValue(undefined),
  getCalendarEventsByUserId: vi.fn().mockResolvedValue([]),
  createCalendarEvent: vi.fn().mockResolvedValue(1),
  updateCalendarEvent: vi.fn().mockResolvedValue(undefined),
  deleteCalendarEvent: vi.fn().mockResolvedValue(undefined),
  getRemindersByUserId: vi.fn().mockResolvedValue([]),
  createReminder: vi.fn().mockResolvedValue(1),
  updateReminder: vi.fn().mockResolvedValue(undefined),
  deleteReminder: vi.fn().mockResolvedValue(undefined),
  getEmailConfig: vi.fn().mockResolvedValue(null),
  upsertEmailConfig: vi.fn().mockResolvedValue(undefined),
  getEmailLogsByUserId: vi.fn().mockResolvedValue([]),
  getAgentLogsByUserId: vi.fn().mockResolvedValue([]),
  getMemoryByUserId: vi.fn().mockResolvedValue([]),
  upsertMemory: vi.fn().mockResolvedValue(undefined),
  deleteMemoryByKey: vi.fn().mockResolvedValue(undefined),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./agents/orchestrator", () => ({
  runOrchestrator: vi.fn().mockResolvedValue({
    assistantMessage: "I can help with that!",
    requiresConfirmation: false,
    toolsUsed: [],
  }),
}));

// ─── Test context factory ─────────────────────────────────────────────────────
function createCtx(overrides?: Partial<TrpcContext>): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "test-user-42",
      name: "Test User",
      email: "test@example.com",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
    ...overrides,
  };
}

// ─── Auth Tests ───────────────────────────────────────────────────────────────
describe("auth", () => {
  it("me returns current user", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result?.id).toBe(42);
    expect(result?.email).toBe("test@example.com");
  });

  it("logout clears session cookie", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
    expect(ctx.res.clearCookie).toHaveBeenCalled();
  });
});

// ─── Chat Tests ───────────────────────────────────────────────────────────────
describe("chat", () => {
  it("listConversations returns empty array for new user", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.chat.listConversations();
    expect(Array.isArray(result)).toBe(true);
  });

  it("createConversation returns new id", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.chat.createConversation({ title: "Test Chat" });
    expect(result.id).toBe(1);
  });

  it("getMessages returns empty array for valid conversation", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.chat.getMessages({ conversationId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("sendMessage invokes orchestrator and returns response", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.chat.sendMessage({
      conversationId: 1,
      content: "Hello, can you help me?",
    });
    expect(result.assistantMessage).toBe("I can help with that!");
    expect(result.requiresConfirmation).toBe(false);
  });

  it("sendMessage rejects empty content", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.chat.sendMessage({ conversationId: 1, content: "" })
    ).rejects.toThrow();
  });
});

// ─── Tasks Tests ──────────────────────────────────────────────────────────────
describe("tasks", () => {
  it("list returns empty array for new user", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.tasks.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("create task with required fields", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.tasks.create({
      title: "Buy groceries",
      priority: "medium",
    });
    expect(result.id).toBe(1);
  });

  it("create task with all optional fields", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.tasks.create({
      title: "Complete project",
      description: "Finish the AI project",
      priority: "high",
      dueDate: Date.now() + 86400000,
      tags: ["work", "important"],
    });
    expect(result.id).toBe(1);
  });

  it("update task status", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.tasks.update({ id: 1, status: "done" });
    expect(result.success).toBe(true);
  });

  it("delete task", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.tasks.delete({ id: 1 });
    expect(result.success).toBe(true);
  });

  it("rejects task with empty title", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.tasks.create({ title: "", priority: "medium" })
    ).rejects.toThrow();
  });
});

// ─── Calendar Tests ───────────────────────────────────────────────────────────
describe("calendar", () => {
  it("list returns empty array", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.calendar.list({});
    expect(Array.isArray(result)).toBe(true);
  });

  it("create event with required fields", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const now = Date.now();
    const result = await caller.calendar.create({
      title: "Team Meeting",
      startTime: now,
      endTime: now + 3600000,
    });
    expect(result.id).toBe(1);
  });

  it("delete event", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.calendar.delete({ id: 1 });
    expect(result.success).toBe(true);
  });
});

// ─── Reminders Tests ──────────────────────────────────────────────────────────
describe("reminders", () => {
  it("list returns empty array", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.reminders.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("create reminder", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.reminders.create({
      title: "Call dentist",
      triggerAt: Date.now() + 3600000,
      repeat: "none",
    });
    expect(result.id).toBe(1);
  });

  it("update reminder status to dismissed", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.reminders.update({ id: 1, status: "dismissed" });
    expect(result.success).toBe(true);
  });
});

// ─── Memory Tests ─────────────────────────────────────────────────────────────
describe("memory", () => {
  it("list returns empty array", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.memory.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("upsert memory entry", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.memory.upsert({
      key: "timezone",
      value: "America/New_York",
      category: "preference",
    });
    expect(result.success).toBe(true);
  });

  it("getPreferences returns object", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.memory.getPreferences();
    expect(typeof result).toBe("object");
  });

  it("updatePreferences saves multiple keys", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.memory.updatePreferences({
      preferences: { timezone: "UTC", confirmEmails: true },
    });
    expect(result.success).toBe(true);
  });
});

// ─── Audit Log Tests ──────────────────────────────────────────────────────────
describe("audit", () => {
  it("list returns empty array with default limit", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.audit.list({ limit: 100 });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Settings Tests ───────────────────────────────────────────────────────────
describe("settings", () => {
  it("getEmailConfig returns null when not configured", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.settings.getEmailConfig();
    expect(result).toBeNull();
  });

  it("updateEmailConfig saves config", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.settings.updateEmailConfig({
      host: "smtp.gmail.com",
      port: 587,
      user: "test@gmail.com",
      fromName: "Test User",
      fromEmail: "test@gmail.com",
      secure: false,
    });
    expect(result.success).toBe(true);
  });
});
