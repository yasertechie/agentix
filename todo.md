# Agentix - Project TODO

## Phase 1: Schema & Design System
- [x] Design system tokens (colors, fonts, CSS variables) - dark theme
- [x] Database schema: conversations, messages, tasks, calendar_events, reminders, agent_logs, user_memory, email_configs, pending_confirmations (11 tables total)
- [x] Apply database migrations

## Phase 2: Backend - Agents & Routers
- [x] LLM invocation helper with tool-use support
- [x] Task Planner Agent (breaks user requests into steps)
- [x] Execution Agent (performs actions via tool wrappers)
- [x] Memory module (user preferences, conversation history, context)
- [x] Tool wrappers: email, calendar, tasks, reminders
- [x] Agent orchestrator (routes requests, manages tool selection)
- [x] tRPC router: chat (send message, list conversations, confirmation flow)
- [x] tRPC router: tasks (CRUD for to-do items)
- [x] tRPC router: calendar (CRUD for events)
- [x] tRPC router: reminders (CRUD + background worker)
- [x] tRPC router: email (send with confirmation flow)
- [x] tRPC router: audit (list agent action logs)
- [x] tRPC router: memory (user preferences + getPreferences/updatePreferences)
- [x] tRPC router: settings (email config CRUD + test email)
- [x] SMTP email sending integration (nodemailer)
- [x] Background reminder worker (60s polling interval)
- [x] Audit trail logging for all agent actions
- [x] Error handling and retry logic (up to 3 retries)

## Phase 3: Frontend
- [x] Global CSS design tokens (dark theme, Inter font, accent colors)
- [x] DashboardLayout with sidebar navigation (AI Chat, Tasks, Calendar, Reminders, Audit Log, Settings)
- [x] Chat page with streaming LLM responses and markdown rendering
- [x] Confirmation dialog component for critical actions (email)
- [x] Task manager page (CRUD list with priorities and status)
- [x] Calendar page (monthly view with event management)
- [x] Reminders page (list + create reminders with datetime + snooze)
- [x] Audit log page (paginated agent action history with search/filter)
- [x] Settings page (email SMTP config, agent preferences, notifications)
- [x] Real-time polling for chat messages (3s) and audit logs (10s)

## Phase 4: Polish & Tests
- [x] Vitest unit tests for all tRPC routers (27 tests, 2 test files)
- [x] Error boundary and loading states
- [x] Mobile responsive layout

## Phase 5: Documentation
- [x] README with setup instructions
- [x] API documentation (all procedures documented)
- [x] Example workflows (4 complete workflows)
- [x] Architecture overview with diagram
- [x] Tool wrapper documentation
- [x] Database schema documentation
- [x] Deployment guide (Manus, Docker, Vercel/Railway)
