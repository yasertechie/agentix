import { getPendingReminders, updateReminder } from "../db";
import { notifyOwner } from "../_core/notification";

let workerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Background worker that checks for due reminders every 60 seconds.
 * When a reminder fires, it triggers an in-app notification and updates the DB status.
 */
export function startReminderWorker() {
  if (workerInterval) return; // Already running

  console.log("[ReminderWorker] Starting background reminder worker (60s interval)");

  workerInterval = setInterval(async () => {
    try {
      const dueReminders = await getPendingReminders();
      if (dueReminders.length === 0) return;

      console.log(`[ReminderWorker] Processing ${dueReminders.length} due reminder(s)`);

      for (const reminder of dueReminders) {
        try {
          // Mark as triggered
          await updateReminder(reminder.id, { status: "triggered" });

          // Send owner notification (in-app)
          await notifyOwner({
            title: `⏰ Reminder: ${reminder.title}`,
            content: reminder.message ?? reminder.title,
          });

          // Handle repeating reminders
          if (reminder.repeat && reminder.repeat !== "none") {
            const nextTrigger = new Date(reminder.triggerAt);
            if (reminder.repeat === "daily") {
              nextTrigger.setDate(nextTrigger.getDate() + 1);
            } else if (reminder.repeat === "weekly") {
              nextTrigger.setDate(nextTrigger.getDate() + 7);
            }

            await updateReminder(reminder.id, {
              status: "pending",
              triggerAt: nextTrigger,
            });
          }

          console.log(`[ReminderWorker] Triggered reminder #${reminder.id}: ${reminder.title}`);
        } catch (err) {
          console.error(`[ReminderWorker] Failed to process reminder #${reminder.id}:`, err);
        }
      }
    } catch (err) {
      console.error("[ReminderWorker] Error in worker cycle:", err);
    }
  }, 60_000); // Every 60 seconds
}

export function stopReminderWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log("[ReminderWorker] Stopped");
  }
}
