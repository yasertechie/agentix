# Agentix — Agentic AI Assistant Platform

Agentix is a production-ready, full-stack agentic AI web application that enables users to interact with an intelligent assistant capable of autonomously performing real-world tasks: sending emails, scheduling calendar events, managing to-do lists, setting reminders, and maintaining persistent memory across conversations.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Quick Start](#quick-start)
3. [Environment Variables](#environment-variables)
4. [Feature Guide](#feature-guide)
5. [Agent System Design](#agent-system-design)
6. [API Reference](#api-reference)
7. [Tool Wrappers](#tool-wrappers)
8. [Database Schema](#database-schema)
9. [Example Workflows](#example-workflows)
10. [Deployment](#deployment)
11. [Development Guide](#development-guide)

---

## Architecture Overview

Agentix follows a layered architecture that separates concerns cleanly across the frontend, API layer, agent orchestration, tool execution, and data persistence.

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend (Vite)                    │
│  Chat UI │ Tasks │ Calendar │ Reminders │ Audit │ Settings   │
└──────────────────────────┬──────────────────────────────────┘
                           │ tRPC (type-safe RPC)
┌──────────────────────────▼──────────────────────────────────┐
│                   Express + tRPC Server                      │
│  auth │ chat │ tasks │ calendar │ reminders │ memory │ audit │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│               Agent Orchestration Layer                      │
│  ┌─────────────────┐    ┌──────────────────────────────┐    │
│  │  Planner Agent  │───▶│      Executor Agent          │    │
│  │  (LLM + tools)  │    │  (tool selection + calling)  │    │
│  └─────────────────┘    └──────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Memory Module                          │    │
│  │  (user prefs, context, facts, conversation history) │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Tool Wrappers                             │
│  Email (SMTP) │ Calendar (DB) │ Tasks (DB) │ Reminders (DB) │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                  MySQL / TiDB Database                       │
│  11 tables: users, conversations, messages, tasks,          │
│  calendar_events, reminders, email_configs, email_logs,     │
│  agent_logs, memory, pending_confirmations                  │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS 4, shadcn/ui |
| Routing | Wouter (client-side), tRPC (API) |
| Backend | Node.js, Express 4, tRPC 11 |
| Database | MySQL / TiDB via Drizzle ORM |
| AI / LLM | OpenAI-compatible API via `invokeLLM` helper |
| Email | Nodemailer (SMTP / Gmail) |
| Auth | Manus OAuth + JWT session cookies |
| Testing | Vitest |
| Type Safety | TypeScript 5.9 end-to-end |

---

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10+
- MySQL or TiDB database
- Access to an OpenAI-compatible LLM API

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd agentix

# Install dependencies
pnpm install

# Set up environment variables (see section below)
cp .env.example .env

# Apply database migrations
pnpm drizzle-kit generate
pnpm drizzle-kit migrate

# Start development server
pnpm dev
```

The application will be available at `http://localhost:3000`.

### Running Tests

```bash
pnpm test
```

All 27 unit tests cover auth, chat, tasks, calendar, reminders, memory, audit, and settings procedures.

---

## Environment Variables

The following environment variables must be configured. When deployed on Manus, most are injected automatically.

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | MySQL connection string | Yes |
| `JWT_SECRET` | Session cookie signing secret | Yes |
| `BUILT_IN_FORGE_API_URL` | LLM API base URL | Yes |
| `BUILT_IN_FORGE_API_KEY` | LLM API bearer token (server-side) | Yes |
| `VITE_APP_ID` | OAuth application ID | Yes |
| `OAUTH_SERVER_URL` | OAuth backend base URL | Yes |
| `VITE_OAUTH_PORTAL_URL` | OAuth login portal URL | Yes |
| `OWNER_OPEN_ID` | Owner's OAuth open ID | Yes |

---

## Feature Guide

### AI Chat Interface

The chat interface provides a natural language input to the AI agent. Users can type requests in plain English, and the agent will plan and execute the appropriate actions.

**Capabilities:**
- Multi-turn conversation with persistent history
- Streaming-style responses with Markdown rendering
- Tool use badges showing which tools were invoked
- Conversation management (create, rename, delete)
- Confirmation dialogs for critical actions (email sending)

**Example prompts:**
- `"Send an email to alice@example.com about the project deadline"`
- `"Schedule a team standup every Monday at 9am"`
- `"Create a task to review the Q4 report by Friday"`
- `"Remind me to call the dentist at 3pm today"`
- `"What tasks do I have due this week?"`

### Task Management

Full CRUD task manager with priorities, statuses, due dates, and tags.

**Task properties:**
- **Title** and optional description
- **Priority**: low, medium, high, urgent
- **Status**: todo, in_progress, done, cancelled
- **Due date** with overdue detection
- **Tags** for categorization

### Calendar

Monthly calendar view with event management.

**Event properties:**
- Title, description, location
- Start and end time
- Attendees (comma-separated emails)
- Color coding (blue, green, red, yellow, purple)
- Recurrence patterns

### Reminders & Alarms

Background worker polls every 60 seconds for due reminders and triggers in-app notifications.

**Reminder properties:**
- Title and optional message
- Trigger time
- Repeat: none, daily, weekly
- Snooze functionality (30-minute increments)
- Status tracking: pending → triggered → dismissed/snoozed

### Email (SMTP)

Configure any SMTP provider (Gmail, Outlook, SendGrid, etc.) to allow the AI to send emails on your behalf.

**Gmail setup:**
1. Enable 2-Factor Authentication on your Google account
2. Generate an App Password at `myaccount.google.com/apppasswords`
3. Use `smtp.gmail.com`, port `587`, with the App Password

**Safety:** All email sends require explicit user confirmation via a dialog before execution.

### Audit Log

Complete history of every agent action with filtering and search.

**Logged information:**
- Agent type (planner, executor, tool, memory)
- Action name and status (started, success, failed, retrying)
- Tool name when applicable
- Execution duration in milliseconds
- Error messages for failed actions
- Timestamp

### Memory Module

The agent maintains persistent memory across conversations, storing user preferences, contextual facts, and goals.

**Memory categories:**
- `preference` — User settings (timezone, language, confirmation preferences)
- `context` — Temporary working context
- `fact` — Persistent facts about the user
- `goal` — Long-term goals

---

## Agent System Design

### Planner Agent

The Planner Agent receives the user's message along with conversation history and memory context. It uses the LLM with a structured system prompt to produce a plan: a list of steps, each specifying which tool to call and with what parameters.

```
User message + history + memory
         ↓
    Planner Agent (LLM)
         ↓
    Execution plan: [
      { step: 1, tool: "create_task", params: { title: "...", priority: "high" } },
      { step: 2, tool: "send_email", params: { to: "...", subject: "...", body: "..." } }
    ]
```

### Executor Agent

The Executor Agent receives the plan from the Planner and executes each step sequentially. It handles:
- Tool invocation via the tool registry
- Error handling and retry logic (up to 3 attempts)
- Confirmation gating for sensitive actions (email)
- Audit logging for every action

### Tool Registry

Tools are registered as named functions with JSON Schema parameter definitions. The LLM uses these definitions to select and parameterize tools via function calling.

| Tool Name | Description |
|---|---|
| `send_email` | Send email via SMTP (requires confirmation) |
| `create_calendar_event` | Create a calendar event |
| `update_calendar_event` | Update an existing event |
| `delete_calendar_event` | Delete a calendar event |
| `create_task` | Create a to-do task |
| `update_task` | Update task status or details |
| `delete_task` | Delete a task |
| `create_reminder` | Set a reminder/alarm |
| `update_reminder` | Snooze or dismiss a reminder |
| `get_tasks` | Query the user's task list |
| `get_calendar_events` | Query calendar events |
| `get_reminders` | Query reminders |
| `save_memory` | Store a fact or preference |
| `get_memory` | Retrieve stored memory |

### Memory Module

Before each agent run, the memory module loads all stored preferences and recent context for the user. This is injected into the system prompt, giving the agent awareness of the user's timezone, communication style, ongoing projects, and other preferences.

After each successful tool execution, the agent may call `save_memory` to persist new facts discovered during the conversation.

### Confirmation Flow

For critical actions (currently: email sending), the agent returns a `requiresConfirmation: true` response instead of executing immediately. The frontend displays a confirmation dialog showing the exact action details. Only after the user approves does the action execute.

```
Agent plans email send
       ↓
Returns confirmation request
       ↓
Frontend shows dialog with: To, Subject, Body preview
       ↓
User clicks "Confirm & Send"
       ↓
Backend executes email send via SMTP
       ↓
Result posted back to conversation
```

---

## API Reference

All API endpoints are tRPC procedures accessible under `/api/trpc`. The following table documents each procedure.

### Auth

| Procedure | Type | Description |
|---|---|---|
| `auth.me` | Query | Returns the current authenticated user |
| `auth.logout` | Mutation | Clears the session cookie |

### Chat

| Procedure | Type | Input | Description |
|---|---|---|---|
| `chat.listConversations` | Query | — | List all conversations for the user |
| `chat.createConversation` | Mutation | `{ title?: string }` | Create a new conversation |
| `chat.deleteConversation` | Mutation | `{ id: number }` | Delete a conversation |
| `chat.getMessages` | Query | `{ conversationId: number }` | Get messages for a conversation |
| `chat.sendMessage` | Mutation | `{ conversationId, content }` | Send a message and get AI response |
| `chat.confirmAction` | Mutation | `{ confirmationId, confirmed }` | Confirm or reject a pending action |
| `chat.getPendingConfirmations` | Query | — | List pending confirmations |

### Tasks

| Procedure | Type | Input | Description |
|---|---|---|---|
| `tasks.list` | Query | — | List all tasks |
| `tasks.create` | Mutation | `{ title, description?, priority, dueDate?, tags? }` | Create a task |
| `tasks.update` | Mutation | `{ id, title?, status?, priority?, dueDate?, tags? }` | Update a task |
| `tasks.delete` | Mutation | `{ id }` | Delete a task |

### Calendar

| Procedure | Type | Input | Description |
|---|---|---|---|
| `calendar.list` | Query | `{ from?: number, to?: number }` | List events in date range |
| `calendar.create` | Mutation | `{ title, startTime, endTime, ... }` | Create an event |
| `calendar.update` | Mutation | `{ id, ...fields }` | Update an event |
| `calendar.delete` | Mutation | `{ id }` | Delete an event |

### Reminders

| Procedure | Type | Input | Description |
|---|---|---|---|
| `reminders.list` | Query | — | List all reminders |
| `reminders.create` | Mutation | `{ title, triggerAt, repeat, message? }` | Create a reminder |
| `reminders.update` | Mutation | `{ id, status?, snoozeUntil? }` | Update reminder status |
| `reminders.delete` | Mutation | `{ id }` | Delete a reminder |

### Memory

| Procedure | Type | Input | Description |
|---|---|---|---|
| `memory.list` | Query | — | List all memory entries |
| `memory.upsert` | Mutation | `{ key, value, category }` | Store a memory entry |
| `memory.delete` | Mutation | `{ key }` | Delete a memory entry |
| `memory.getPreferences` | Query | — | Get all preferences as a key-value object |
| `memory.updatePreferences` | Mutation | `{ preferences: Record<string, unknown> }` | Bulk update preferences |

### Settings

| Procedure | Type | Input | Description |
|---|---|---|---|
| `settings.getEmailConfig` | Query | — | Get current SMTP configuration |
| `settings.updateEmailConfig` | Mutation | `{ host, port, user, pass?, fromName?, fromEmail?, secure }` | Save SMTP config |
| `settings.testEmailConfig` | Mutation | — | Send a test email to verify configuration |

### Audit

| Procedure | Type | Input | Description |
|---|---|---|---|
| `audit.list` | Query | `{ limit?: number }` | List agent action logs |

---

## Tool Wrappers

### Email Tool (`server/tools/emailTool.ts`)

Wraps Nodemailer to send emails via SMTP. Reads configuration from the `email_configs` table for the requesting user.

```typescript
import { sendEmail } from "./tools/emailTool";

const result = await sendEmail({
  userId: 42,
  to: "recipient@example.com",
  subject: "Hello from Agentix",
  body: "This email was sent by your AI assistant.",
});
// result: { success: boolean, messageId?: string, error?: string }
```

### Calendar Tool (`server/tools/calendarTool.ts`)

CRUD operations for calendar events backed by the database.

```typescript
import { createCalendarEventTool, getCalendarEventsTool } from "./tools/calendarTool";

const events = await getCalendarEventsTool({ userId: 42, from: new Date(), to: endDate });
const id = await createCalendarEventTool({
  userId: 42,
  title: "Team Standup",
  startTime: new Date("2026-03-25T09:00:00"),
  endTime: new Date("2026-03-25T09:30:00"),
});
```

### Tasks Tool (`server/tools/tasksTool.ts`)

CRUD operations for the task list.

```typescript
import { createTaskTool, updateTaskTool, getTasksTool } from "./tools/tasksTool";

const tasks = await getTasksTool({ userId: 42 });
const id = await createTaskTool({ userId: 42, title: "Review PR", priority: "high" });
await updateTaskTool({ id: 1, status: "done" });
```

### Reminders Tool (`server/tools/remindersTool.ts`)

Create and manage reminders with repeat scheduling.

```typescript
import { createReminderTool } from "./tools/remindersTool";

const id = await createReminderTool({
  userId: 42,
  title: "Call dentist",
  triggerAt: new Date("2026-03-25T15:00:00"),
  repeat: "none",
});
```

---

## Database Schema

The application uses 11 database tables:

| Table | Purpose |
|---|---|
| `users` | User accounts from OAuth |
| `conversations` | Chat conversation threads |
| `messages` | Individual chat messages |
| `tasks` | To-do list items |
| `calendar_events` | Scheduled events |
| `reminders` | Alarms and reminders |
| `email_configs` | Per-user SMTP configuration |
| `email_logs` | History of sent emails |
| `agent_logs` | Audit trail of all agent actions |
| `memory` | Persistent user memory (key-value) |
| `pending_confirmations` | Queued actions awaiting user approval |

---

## Example Workflows

### Workflow 1: Send an Email

**User:** "Send an email to bob@company.com with subject 'Meeting Tomorrow' saying we'll meet at 2pm in Conference Room A"

**Agent flow:**
1. Planner identifies intent: `send_email`
2. Executor prepares email payload
3. Returns confirmation request (requiresConfirmation: true)
4. User reviews and clicks "Confirm & Send"
5. SMTP sends the email
6. Result posted back to chat: "✅ Email sent to bob@company.com"

### Workflow 2: Schedule a Recurring Meeting

**User:** "Schedule a weekly team standup every Monday at 9am for 30 minutes"

**Agent flow:**
1. Planner identifies intent: `create_calendar_event` with recurrence
2. Executor calls `createCalendarEventTool` with `recurrence: "weekly"`
3. Event created and confirmed in chat
4. Event appears in Calendar view

### Workflow 3: Create a Task with Reminder

**User:** "Create a high priority task to submit the expense report by Friday, and remind me Thursday at 5pm"

**Agent flow:**
1. Planner identifies two actions: `create_task` + `create_reminder`
2. Executor calls `createTaskTool` with priority "high" and due date Friday
3. Executor calls `createReminderTool` for Thursday 5pm
4. Both confirmed in chat response

### Workflow 4: Query and Update Tasks

**User:** "What tasks do I have due this week? Mark the 'Review PR' task as done."

**Agent flow:**
1. Planner identifies: `get_tasks` + `update_task`
2. Executor retrieves tasks, filters by due date
3. Executor updates the specified task status to "done"
4. Agent responds with a summary of the week's tasks and confirms the update

---

## Deployment

### Manus Deployment (Recommended)

Click the **Publish** button in the Manus Management UI after creating a checkpoint. Manus handles hosting, SSL, and custom domains automatically.

### Docker

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```bash
docker build -t agentix .
docker run -p 3000:3000 \
  -e DATABASE_URL="mysql://..." \
  -e JWT_SECRET="..." \
  -e BUILT_IN_FORGE_API_KEY="..." \
  agentix
```

### Vercel / Railway

The application is a standard Node.js Express server. Set the build command to `pnpm build`, start command to `node dist/index.js`, and configure all required environment variables in the platform dashboard.

---

## Development Guide

### Project Structure

```
agentix/
├── client/src/
│   ├── pages/          # Chat, Tasks, Calendar, Reminders, AuditLog, Settings
│   ├── components/     # DashboardLayout, shadcn/ui components
│   ├── lib/trpc.ts     # tRPC client binding
│   └── index.css       # Global styles + dark theme tokens
├── server/
│   ├── agents/
│   │   └── orchestrator.ts   # Planner + Executor agents
│   ├── tools/
│   │   ├── emailTool.ts      # SMTP email wrapper
│   │   ├── calendarTool.ts   # Calendar CRUD wrapper
│   │   ├── tasksTool.ts      # Tasks CRUD wrapper
│   │   └── remindersTool.ts  # Reminders CRUD wrapper
│   ├── workers/
│   │   └── reminderWorker.ts # Background reminder polling
│   ├── db.ts           # Database query helpers
│   ├── routers.ts      # All tRPC procedures
│   └── agentix.test.ts # Vitest unit tests
├── drizzle/
│   └── schema.ts       # Database schema definition
└── README.md
```

### Adding a New Tool

1. Create `server/tools/myTool.ts` with the tool implementation
2. Add the tool definition to the `TOOL_DEFINITIONS` array in `server/agents/orchestrator.ts`
3. Add the tool execution case in the `executeTool` function in the orchestrator
4. Add tRPC procedures if direct UI access is needed in `server/routers.ts`
5. Write tests in `server/agentix.test.ts`

### Extending the Schema

1. Add tables to `drizzle/schema.ts`
2. Run `pnpm drizzle-kit generate` to create migration SQL
3. Apply migration via `webdev_execute_sql` or `pnpm drizzle-kit migrate`
4. Add query helpers in `server/db.ts`
5. Add tRPC procedures in `server/routers.ts`
