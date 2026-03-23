import { invokeLLM } from "../_core/llm";
import {
  createAgentLog,
  createMessage,
  getMemoryByUserId,
  getMessagesByConversationId,
  updateAgentLog,
  upsertMemory,
} from "../db";
import { sendEmail } from "../tools/emailTool";
import { createEvent, listEvents } from "../tools/calendarTool";
import { addTask, listTasks, modifyTask } from "../tools/tasksTool";
import { addReminder, listReminders } from "../tools/remindersTool";

// ─── Tool Definitions (OpenAI function-calling schema) ────────────────────────
export const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "send_email",
      description: "Send an email to a recipient. ALWAYS requires user confirmation before sending.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Email body text" },
        },
        required: ["to", "subject", "body"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_calendar_event",
      description: "Create a new calendar event or schedule a meeting",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title" },
          description: { type: "string", description: "Event description" },
          location: { type: "string", description: "Event location" },
          startTime: { type: "string", description: "ISO 8601 start datetime" },
          endTime: { type: "string", description: "ISO 8601 end datetime" },
          attendees: { type: "array", items: { type: "string" }, description: "List of attendee emails" },
          color: { type: "string", description: "Event color: blue, green, red, yellow, purple" },
        },
        required: ["title", "startTime", "endTime"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_calendar_events",
      description: "List upcoming calendar events",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "ISO 8601 start date filter" },
          to: { type: "string", description: "ISO 8601 end date filter" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description: "Create a new to-do task",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title" },
          description: { type: "string", description: "Task description" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Task priority" },
          dueDate: { type: "string", description: "ISO 8601 due date" },
          tags: { type: "array", items: { type: "string" }, description: "Tags for the task" },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_tasks",
      description: "List all tasks for the user",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_task_status",
      description: "Update the status of an existing task",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "number", description: "Task ID to update" },
          status: { type: "string", enum: ["todo", "in_progress", "done", "cancelled"] },
        },
        required: ["taskId", "status"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_reminder",
      description: "Set a reminder or alarm for a specific time",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Reminder title" },
          message: { type: "string", description: "Reminder message" },
          triggerAt: { type: "string", description: "ISO 8601 datetime when to trigger" },
          repeat: { type: "string", enum: ["none", "daily", "weekly"], description: "Repeat interval" },
        },
        required: ["title", "triggerAt"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_reminders",
      description: "List all reminders for the user",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remember_fact",
      description: "Store a user preference, fact, or context in memory for future reference",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Memory key (e.g., 'preferred_email', 'timezone')" },
          value: { type: "string", description: "Value to remember" },
          category: { type: "string", enum: ["preference", "context", "fact", "goal"] },
        },
        required: ["key", "value"],
        additionalProperties: false,
      },
    },
  },
];

// ─── Tool Executor ────────────────────────────────────────────────────────────
export type ToolCallResult = {
  toolName: string;
  result: unknown;
  requiresConfirmation?: boolean;
  confirmationPayload?: unknown;
};

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  userId: number
): Promise<ToolCallResult> {
  switch (toolName) {
    case "send_email": {
      // Email always requires confirmation — return a pending confirmation signal
      return {
        toolName,
        result: null,
        requiresConfirmation: true,
        confirmationPayload: {
          actionType: "send_email",
          to: args.to,
          subject: args.subject,
          body: args.body,
        },
      };
    }

    case "create_calendar_event": {
      const result = await createEvent({
        userId,
        title: String(args.title),
        description: args.description ? String(args.description) : undefined,
        location: args.location ? String(args.location) : undefined,
        startTime: new Date(String(args.startTime)),
        endTime: new Date(String(args.endTime)),
        attendees: Array.isArray(args.attendees) ? (args.attendees as string[]) : [],
        color: args.color ? String(args.color) : "blue",
      });
      return { toolName, result };
    }

    case "list_calendar_events": {
      const events = await listEvents(
        userId,
        args.from ? new Date(String(args.from)) : undefined,
        args.to ? new Date(String(args.to)) : undefined
      );
      return { toolName, result: events };
    }

    case "create_task": {
      const result = await addTask({
        userId,
        title: String(args.title),
        description: args.description ? String(args.description) : undefined,
        priority: (args.priority as "low" | "medium" | "high" | "urgent") ?? "medium",
        dueDate: args.dueDate ? new Date(String(args.dueDate)) : undefined,
        tags: Array.isArray(args.tags) ? (args.tags as string[]) : [],
      });
      return { toolName, result };
    }

    case "list_tasks": {
      const result = await listTasks(userId);
      return { toolName, result };
    }

    case "update_task_status": {
      const result = await modifyTask(userId, Number(args.taskId), {
        status: args.status as "todo" | "in_progress" | "done" | "cancelled",
      });
      return { toolName, result };
    }

    case "create_reminder": {
      const result = await addReminder({
        userId,
        title: String(args.title),
        message: args.message ? String(args.message) : undefined,
        triggerAt: new Date(String(args.triggerAt)),
        repeat: (args.repeat as "none" | "daily" | "weekly") ?? "none",
      });
      return { toolName, result };
    }

    case "list_reminders": {
      const result = await listReminders(userId);
      return { toolName, result };
    }

    case "remember_fact": {
      await upsertMemory({
        userId,
        key: String(args.key),
        value: String(args.value),
        category: (args.category as "preference" | "context" | "fact" | "goal") ?? "context",
      });
      return { toolName, result: { stored: true } };
    }

    default:
      return { toolName, result: { error: `Unknown tool: ${toolName}` } };
  }
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────
export interface OrchestratorInput {
  userId: number;
  conversationId: number;
  userMessage: string;
}

export interface OrchestratorOutput {
  assistantMessage: string;
  toolsUsed: string[];
  requiresConfirmation?: boolean;
  confirmationPayload?: unknown;
  planSteps?: string[];
}

const SYSTEM_PROMPT = `You are Agentix, an intelligent AI assistant that can autonomously perform real-world tasks.

You have access to the following tools:
- send_email: Send emails (ALWAYS ask for confirmation before sending)
- create_calendar_event / list_calendar_events: Manage calendar and meetings
- create_task / list_tasks / update_task_status: Manage to-do tasks
- create_reminder / list_reminders: Set reminders and alarms
- remember_fact: Store user preferences and important facts in memory

IMPORTANT RULES:
1. For send_email, ALWAYS call the tool to initiate the confirmation flow — never send without it.
2. When creating events or reminders, parse natural language dates relative to today's date.
3. Be proactive: if the user mentions a preference (timezone, email, name), use remember_fact.
4. Keep responses concise and action-oriented.
5. After using a tool, summarize what was done in plain language.
6. Today's date and time: ${new Date().toISOString()}`;

export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const { userId, conversationId, userMessage } = input;
  const orchestratorLogId = await createAgentLog({
    userId,
    conversationId,
    agentType: "planner",
    action: "orchestrate",
    input: { userMessage: userMessage.slice(0, 200) },
    status: "started",
  });

  const startTime = Date.now();

  try {
    // Load conversation history (last 20 messages)
    const history = await getMessagesByConversationId(conversationId);
    const recentHistory = history.slice(-20);

    // Load user memory for context
    const memory = await getMemoryByUserId(userId);
    const memoryContext = memory.length > 0
      ? "\n\nUser Memory:\n" + memory.map((m) => `- ${m.key}: ${m.value}`).join("\n")
      : "";

    // Build messages array for LLM
    const llmMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT + memoryContext },
      ...recentHistory
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: typeof m.content === "string" ? m.content : String(m.content),
        })),
      { role: "user", content: userMessage },
    ];

    const toolsUsed: string[] = [];
    let requiresConfirmation = false;
    let confirmationPayload: unknown;
    let finalMessage = "";
    let planSteps: string[] = [];

    // ── Agentic loop: up to 5 tool calls ─────────────────────────────────────
    let iteration = 0;
    const MAX_ITERATIONS = 5;
    let currentMessages = [...llmMessages];

    while (iteration < MAX_ITERATIONS) {
      iteration++;

      const response = await invokeLLM({
        messages: currentMessages as any,
        tools: AGENT_TOOLS as any,
        tool_choice: "auto",
      });

      const choice = response.choices?.[0];
      if (!choice) break;

      const assistantMsg = choice.message;
      const toolCalls = assistantMsg.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        // No more tool calls — final text response
        const rawContent = assistantMsg.content;
        finalMessage = typeof rawContent === "string" ? rawContent : (rawContent ? JSON.stringify(rawContent) : "");
        break;
      }

      // Push assistant message with tool calls into context
      const rawContent = assistantMsg.content;
      const contentStr = typeof rawContent === "string" ? rawContent : (rawContent ? JSON.stringify(rawContent) : "");
      currentMessages.push({
        role: "assistant",
        content: contentStr,
        // @ts-ignore
        tool_calls: toolCalls,
      });

      // Execute each tool call
      const toolResultMessages: any[] = [];
      for (const tc of toolCalls) {
        const toolName = tc.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {}

        toolsUsed.push(toolName);

        const execLogId = await createAgentLog({
          userId,
          conversationId,
          agentType: "executor",
          action: `execute_tool:${toolName}`,
          toolName,
          input: args,
          status: "started",
        });

        const toolResult = await executeTool(toolName, args, userId);

        await updateAgentLog(execLogId, {
          status: "success",
          output: toolResult.result as any,
          durationMs: Date.now() - startTime,
        });

        if (toolResult.requiresConfirmation) {
          requiresConfirmation = true;
          confirmationPayload = toolResult.confirmationPayload;
          finalMessage = `I'm ready to send that email. Please review the details and confirm below.`;
          break;
        }

        toolResultMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult.result),
        });
      }

      if (requiresConfirmation) break;

      // Add tool results back to context for next iteration
      currentMessages.push(...toolResultMessages);
    }

    if (!finalMessage && !requiresConfirmation) {
      finalMessage = "I've completed the requested actions.";
    }

    await updateAgentLog(orchestratorLogId, {
      status: "success",
      output: { toolsUsed, requiresConfirmation } as any,
      durationMs: Date.now() - startTime,
    });

    return {
      assistantMessage: finalMessage,
      toolsUsed,
      requiresConfirmation,
      confirmationPayload,
      planSteps,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await updateAgentLog(orchestratorLogId, {
      status: "failed",
      errorMessage: msg,
      durationMs: Date.now() - startTime,
    });
    throw error;
  }
}
