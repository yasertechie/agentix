import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createConversation,
  createMessage,
  createPendingConfirmation,
  deleteConversation,
  deleteReminder,
  deleteTask,
  getAgentLogsByUserId,
  getCalendarEventsByUserId,
  getConversationById,
  getConversationsByUserId,
  getEmailConfig,
  getEmailLogsByUserId,
  getMemoryByUserId,
  getMessagesByConversationId,
  getPendingConfirmation,
  getPendingConfirmationsByUser,
  getRemindersByUserId,
  getTasksByUserId,
  updateCalendarEvent,
  updateConversationTitle,
  updatePendingConfirmation,
  updateReminder,
  updateTask,
  upsertEmailConfig,
  upsertMemory,
  createCalendarEvent,
  createReminder,
  createTask,
  deleteCalendarEvent,
  deleteMemoryByKey,
} from "./db";
import { runOrchestrator } from "./agents/orchestrator";
import { sendEmail } from "./tools/emailTool";

// ─── Auth Router ──────────────────────────────────────────────────────────────
const authRouter = router({
  me: publicProcedure.query((opts) => opts.ctx.user),
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),
});

// ─── Chat Router ──────────────────────────────────────────────────────────────
const chatRouter = router({
  listConversations: protectedProcedure.query(async ({ ctx }) => {
    return getConversationsByUserId(ctx.user.id);
  }),

  createConversation: protectedProcedure
    .input(z.object({ title: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const id = await createConversation({
        userId: ctx.user.id,
        title: input.title ?? "New Conversation",
      });
      return { id };
    }),

  deleteConversation: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteConversation(input.id);
      return { success: true };
    }),

  getMessages: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      return getMessagesByConversationId(input.conversationId);
    }),

  sendMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        content: z.string().min(1).max(8000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { conversationId, content } = input;

      // Save user message
      await createMessage({
        conversationId,
        userId: ctx.user.id,
        role: "user",
        content,
      });

      // Update conversation title from first message
      const conv = await getConversationById(conversationId);
      if (conv?.title === "New Conversation") {
        const shortTitle = content.slice(0, 60) + (content.length > 60 ? "…" : "");
        await updateConversationTitle(conversationId, shortTitle);
      }

      // Run agent orchestrator
      let result;
      try {
        result = await runOrchestrator({
          userId: ctx.user.id,
          conversationId,
          userMessage: content,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Agent error occurred";
        await createMessage({
          conversationId,
          userId: ctx.user.id,
          role: "assistant",
          content: `I encountered an error: ${msg}. Please try again.`,
        });
        return { assistantMessage: `I encountered an error: ${msg}`, requiresConfirmation: false };
      }

      // Handle confirmation flow
      if (result.requiresConfirmation && result.confirmationPayload) {
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
        const confirmId = await createPendingConfirmation({
          userId: ctx.user.id,
          conversationId,
          actionType: (result.confirmationPayload as any).actionType,
          payload: result.confirmationPayload as any,
          expiresAt,
        });

        const confirmMsg = result.assistantMessage;
        await createMessage({
          conversationId,
          userId: ctx.user.id,
          role: "assistant",
          content: confirmMsg,
          metadata: { requiresConfirmation: true, confirmationId: confirmId },
        });

        return {
          assistantMessage: confirmMsg,
          requiresConfirmation: true,
          confirmationId: confirmId,
          confirmationPayload: result.confirmationPayload,
          toolsUsed: result.toolsUsed,
        };
      }

      // Save assistant message
      await createMessage({
        conversationId,
        userId: ctx.user.id,
        role: "assistant",
        content: result.assistantMessage,
        metadata: { toolsUsed: result.toolsUsed },
      });

      return {
        assistantMessage: result.assistantMessage,
        requiresConfirmation: false,
        toolsUsed: result.toolsUsed,
      };
    }),

  confirmAction: protectedProcedure
    .input(z.object({ confirmationId: z.number(), confirmed: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const confirmation = await getPendingConfirmation(input.confirmationId);
      if (!confirmation) throw new TRPCError({ code: "NOT_FOUND", message: "Confirmation not found" });
      if (confirmation.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (confirmation.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Already processed" });
      if (new Date() > confirmation.expiresAt) {
        await updatePendingConfirmation(input.confirmationId, "expired");
        throw new TRPCError({ code: "BAD_REQUEST", message: "Confirmation expired" });
      }

      if (!input.confirmed) {
        await updatePendingConfirmation(input.confirmationId, "rejected");
        return { success: true, message: "Action cancelled." };
      }

      await updatePendingConfirmation(input.confirmationId, "confirmed");

      const payload = confirmation.payload as any;

      if (confirmation.actionType === "send_email") {
        const emailResult = await sendEmail({
          userId: ctx.user.id,
          to: payload.to,
          subject: payload.subject,
          body: payload.body,
        });

        if (confirmation.conversationId) {
          await createMessage({
            conversationId: confirmation.conversationId,
            userId: ctx.user.id,
            role: "assistant",
            content: emailResult.success
              ? `✅ Email sent successfully to **${payload.to}** with subject "${payload.subject}".`
              : `❌ Failed to send email: ${emailResult.error}`,
          });
        }

        return {
          success: emailResult.success,
          message: emailResult.success ? "Email sent successfully!" : `Failed: ${emailResult.error}`,
        };
      }

      return { success: true, message: "Action confirmed." };
    }),

  getPendingConfirmations: protectedProcedure.query(async ({ ctx }) => {
    return getPendingConfirmationsByUser(ctx.user.id);
  }),
});

// ─── Tasks Router ─────────────────────────────────────────────────────────────
const tasksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getTasksByUserId(ctx.user.id);
  }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(512),
        description: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
        dueDate: z.number().optional(), // Unix ms timestamp
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = await createTask({
        userId: ctx.user.id,
        title: input.title,
        description: input.description,
        priority: input.priority,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        tags: input.tags ?? [],
        status: "todo",
      });
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(["todo", "in_progress", "done", "cancelled"]).optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        dueDate: z.number().nullable().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, dueDate, ...rest } = input;
      await updateTask(id, {
        ...rest,
        ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : undefined } : {}),
      });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteTask(input.id);
      return { success: true };
    }),
});

// ─── Calendar Router ──────────────────────────────────────────────────────────
const calendarRouter = router({
  list: protectedProcedure
    .input(z.object({ from: z.number().optional(), to: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      return getCalendarEventsByUserId(
        ctx.user.id,
        input.from ? new Date(input.from) : undefined,
        input.to ? new Date(input.to) : undefined
      );
    }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(512),
        description: z.string().optional(),
        location: z.string().optional(),
        startTime: z.number(),
        endTime: z.number(),
        allDay: z.boolean().optional(),
        attendees: z.array(z.string()).optional(),
        color: z.string().optional(),
        recurrence: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = await createCalendarEvent({
        userId: ctx.user.id,
        title: input.title,
        description: input.description,
        location: input.location,
        startTime: new Date(input.startTime),
        endTime: new Date(input.endTime),
        allDay: input.allDay ?? false,
        attendees: input.attendees ?? [],
        color: input.color ?? "blue",
        recurrence: input.recurrence ?? "none",
      });
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        startTime: z.number().optional(),
        endTime: z.number().optional(),
        allDay: z.boolean().optional(),
        attendees: z.array(z.string()).optional(),
        color: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, startTime, endTime, ...rest } = input;
      await updateCalendarEvent(id, {
        ...rest,
        ...(startTime ? { startTime: new Date(startTime) } : {}),
        ...(endTime ? { endTime: new Date(endTime) } : {}),
      });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteCalendarEvent(input.id);
      return { success: true };
    }),
});

// ─── Reminders Router ─────────────────────────────────────────────────────────
const remindersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getRemindersByUserId(ctx.user.id);
  }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(512),
        message: z.string().optional(),
        triggerAt: z.number(),
        repeat: z.enum(["none", "daily", "weekly"]).default("none"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = await createReminder({
        userId: ctx.user.id,
        title: input.title,
        message: input.message,
        triggerAt: new Date(input.triggerAt),
        repeat: input.repeat,
        status: "pending",
      });
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["pending", "triggered", "dismissed", "snoozed"]).optional(),
        snoozeUntil: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await updateReminder(input.id, {
        status: input.status,
        snoozeUntil: input.snoozeUntil ? new Date(input.snoozeUntil) : undefined,
      });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteReminder(input.id);
      return { success: true };
    }),
});

// ─── Email Router ─────────────────────────────────────────────────────────────
const emailRouter = router({
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    const config = await getEmailConfig(ctx.user.id);
    if (!config) return null;
    // Never return the password
    const { smtpPass, ...safe } = config;
    return { ...safe, hasPassword: !!smtpPass };
  }),

  saveConfig: protectedProcedure
    .input(
      z.object({
        smtpHost: z.string().min(1),
        smtpPort: z.number().default(587),
        smtpUser: z.string().min(1),
        smtpPass: z.string().optional(),
        fromName: z.string().optional(),
        fromEmail: z.string().email().optional(),
        secure: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await upsertEmailConfig({ userId: ctx.user.id, ...input });
      return { success: true };
    }),

  getLogs: protectedProcedure.query(async ({ ctx }) => {
    return getEmailLogsByUserId(ctx.user.id);
  }),
});

// ─── Audit Log Router ─────────────────────────────────────────────────────────
const auditRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(500).default(100) }))
    .query(async ({ ctx, input }) => {
      return getAgentLogsByUserId(ctx.user.id, input.limit);
    }),
});

// ─── Settings Router ────────────────────────────────────────────────────────
const settingsRouter = router({
  getEmailConfig: protectedProcedure.query(async ({ ctx }) => {
    const config = await getEmailConfig(ctx.user.id);
    if (!config) return null;
    const { smtpPass, ...safe } = config;
    return {
      host: safe.smtpHost,
      port: safe.smtpPort,
      user: safe.smtpUser,
      fromName: safe.fromName,
      fromEmail: safe.fromEmail,
      secure: safe.secure,
      hasPassword: !!smtpPass,
    };
  }),

  updateEmailConfig: protectedProcedure
    .input(
      z.object({
        host: z.string().min(1),
        port: z.number().default(587),
        user: z.string().min(1),
        pass: z.string().optional(),
        fromName: z.string().optional(),
        fromEmail: z.string().optional(),
        secure: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await upsertEmailConfig({
        userId: ctx.user.id,
        smtpHost: input.host,
        smtpPort: input.port,
        smtpUser: input.user,
        smtpPass: input.pass,
        fromName: input.fromName,
        fromEmail: input.fromEmail,
        secure: input.secure,
      });
      return { success: true };
    }),

  testEmailConfig: protectedProcedure.mutation(async ({ ctx }) => {
    const config = await getEmailConfig(ctx.user.id);
    if (!config) throw new TRPCError({ code: "BAD_REQUEST", message: "No email config found. Please save settings first." });
    const { sendEmail: sendEmailFn } = await import("./tools/emailTool");
    const result = await sendEmailFn({
      userId: ctx.user.id,
      to: (config.fromEmail ?? config.smtpUser) as string,
      subject: "Agentix Test Email",
      body: "This is a test email from your Agentix AI assistant. Your email configuration is working correctly!",
    });
    if (!result.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Failed to send test email" });
    return { success: true };
  }),
});

// ─── Memory Router ────────────────────────────────────────────────────────────
const memoryRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getMemoryByUserId(ctx.user.id);
  }),

  upsert: protectedProcedure
    .input(
      z.object({
        key: z.string().min(1).max(128),
        value: z.string().min(1),
        category: z.enum(["preference", "context", "fact", "goal"]).default("preference"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await upsertMemory({ userId: ctx.user.id, ...input });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ key: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await deleteMemoryByKey(ctx.user.id, input.key);
      return { success: true };
    }),

  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const memories = await getMemoryByUserId(ctx.user.id);
    const prefs: Record<string, unknown> = {};
    for (const m of memories.filter(m => m.category === "preference")) {
      try { prefs[m.key] = JSON.parse(m.value); } catch { prefs[m.key] = m.value; }
    }
    return prefs;
  }),

  updatePreferences: protectedProcedure
    .input(z.object({ preferences: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      for (const [key, value] of Object.entries(input.preferences)) {
        await upsertMemory({
          userId: ctx.user.id,
          key,
          value: typeof value === "string" ? value : JSON.stringify(value),
          category: "preference",
        });
      }
      return { success: true };
    }),
});

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  chat: chatRouter,
  tasks: tasksRouter,
  calendar: calendarRouter,
  reminders: remindersRouter,
  email: emailRouter,
  audit: auditRouter,
  memory: memoryRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
