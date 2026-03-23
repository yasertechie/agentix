import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { format, isPast } from "date-fns";
import { Bell, BellOff, Clock, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

interface Reminder {
  id: number;
  title: string;
  message?: string | null;
  status: "pending" | "triggered" | "dismissed" | "snoozed";
  triggerAt: Date;
  repeat: string;
  userId: number;
  snoozeUntil?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Play a simple notification sound
function playNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800; // Hz
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (err) {
    // Fallback: use browser beep if Web Audio API fails
    console.log("Reminder triggered (audio unavailable)");
  }
}

const STATUS_STYLES = {
  pending: "bg-blue-500/20 text-blue-400",
  triggered: "bg-yellow-500/20 text-yellow-400",
  dismissed: "bg-muted text-muted-foreground",
  snoozed: "bg-purple-500/20 text-purple-400",
};

export default function Reminders() {
  const [showCreate, setShowCreate] = useState(false);
  const utils = trpc.useUtils();

  const { data: reminders = [], isLoading, refetch } = trpc.reminders.list.useQuery(undefined, {
    refetchInterval: 5000, // Poll every 5 seconds for triggered reminders
  });

  const prevRemindersRef = useRef<typeof reminders>(reminders);

  // Show toast notification when a reminder is triggered
  useEffect(() => {
    if (!reminders || !prevRemindersRef.current) {
      prevRemindersRef.current = reminders;
      return;
    }

    const newlyTriggered = reminders.filter((r) => {
      const wasTriggered = prevRemindersRef.current?.some(
        (prev) => prev.id === r.id && prev.status === "triggered"
      );
      return r.status === "triggered" && !wasTriggered;
    });

    newlyTriggered.forEach((reminder) => {
      // Show toast notification
      toast.success(
        <div className="flex flex-col gap-1">
          <p className="font-semibold">⏰ {reminder.title}</p>
          <p className="text-sm text-muted-foreground">{reminder.message || "Time to act!"}</p>
        </div>,
        { duration: 10000 }
      );

      // Play notification sound
      playNotificationSound();
    });

    prevRemindersRef.current = reminders;
  }, [reminders]);

  const updateReminder = trpc.reminders.update.useMutation({
    onSuccess: () => utils.reminders.list.invalidate(),
  });

  const deleteReminder = trpc.reminders.delete.useMutation({
    onSuccess: () => {
      utils.reminders.list.invalidate();
      toast.success("Reminder deleted");
    },
  });

  const activeReminders = reminders.filter((r) => r.status === "pending" || r.status === "snoozed");
  const pastReminders = reminders.filter((r) => r.status === "triggered" || r.status === "dismissed");

  const stats = {
    total: reminders.length,
    active: activeReminders.length,
    triggered: reminders.filter((r) => r.status === "triggered").length,
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="h-6 w-6 text-primary" />
              Reminders
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Set alarms and reminders for important events</p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Reminder
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total", value: stats.total },
            { label: "Active", value: stats.active, color: "text-blue-400" },
            { label: "Triggered", value: stats.triggered, color: "text-yellow-400" },
          ].map((s) => (
            <Card key={s.label} className="bg-card border-border/50">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-2xl font-bold mt-1 ${s.color ?? "text-foreground"}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Active Reminders */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active</h2>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-20 rounded-xl bg-card animate-pulse" />)}
            </div>
          ) : activeReminders.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No active reminders. Create one or ask the AI assistant.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeReminders.map((reminder) => (
                <ReminderCard
                  key={reminder.id}
                  reminder={reminder}
                  onDismiss={() => updateReminder.mutate({ id: reminder.id, status: "dismissed" })}
                  onSnooze={() => {
                    const snoozeUntil = new Date(Date.now() + 30 * 60 * 1000);
                    updateReminder.mutate({ id: reminder.id, status: "snoozed", snoozeUntil: snoozeUntil.getTime() });
                    toast.success("Snoozed for 30 minutes");
                  }}
                  onDelete={() => deleteReminder.mutate({ id: reminder.id })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Past Reminders */}
        {pastReminders.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">History</h2>
            <div className="space-y-2 opacity-60">
              {pastReminders.slice(0, 10).map((reminder) => (
                <ReminderCard
                  key={reminder.id}
                  reminder={reminder}
                  onDelete={() => deleteReminder.mutate({ id: reminder.id })}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <CreateReminderDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          utils.reminders.list.invalidate();
          setShowCreate(false);
          toast.success("Reminder set");
        }}
      />
    </DashboardLayout>
  );
}

function ReminderCard({
  reminder,
  onDismiss,
  onSnooze,
  onDelete,
}: {
  reminder: any;
  onDismiss?: () => void;
  onSnooze?: () => void;
  onDelete: () => void;
}) {
  const triggerDate = new Date(reminder.triggerAt);
  const isOverdue = isPast(triggerDate) && reminder.status === "pending";

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl bg-card border transition-all group ${
      isOverdue ? "border-yellow-500/30" : "border-border/50 hover:border-border"
    }`}>
      <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
        reminder.status === "triggered" ? "bg-yellow-500/20" :
        reminder.status === "dismissed" ? "bg-muted" :
        reminder.status === "snoozed" ? "bg-purple-500/20" :
        "bg-primary/20"
      }`}>
        {reminder.status === "dismissed" ? (
          <BellOff className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Bell className={`h-4 w-4 ${
            reminder.status === "triggered" ? "text-yellow-400" :
            reminder.status === "snoozed" ? "text-purple-400" :
            "text-primary"
          }`} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium">{reminder.title}</p>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[reminder.status as keyof typeof STATUS_STYLES]}`}>
              {reminder.status}
            </span>
            {onSnooze && reminder.status !== "dismissed" && (
              <button onClick={onSnooze} className="opacity-0 group-hover:opacity-100 transition-opacity">
                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
            {onDismiss && reminder.status !== "dismissed" && (
              <button onClick={onDismiss} className="opacity-0 group-hover:opacity-100 transition-opacity">
                <BellOff className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
            <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 transition-opacity">
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        </div>
        {reminder.message && (
          <p className="text-xs text-muted-foreground mt-1">{reminder.message}</p>
        )}
        <div className="flex items-center gap-3 mt-2">
          <span className={`flex items-center gap-1 text-[10px] ${isOverdue ? "text-yellow-400" : "text-muted-foreground"}`}>
            <Clock className="h-3 w-3" />
            {format(triggerDate, "MMM d, yyyy 'at' h:mm a")}
            {isOverdue && " (overdue)"}
          </span>
          {reminder.repeat && reminder.repeat !== "none" && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-1">
              <RefreshCw className="h-2.5 w-2.5" />
              {reminder.repeat}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateReminderDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState("09:00");
  const [repeat, setRepeat] = useState("none");

  const createReminder = trpc.reminders.create.useMutation({ onSuccess: onCreated });

  const handleSubmit = () => {
    if (!title.trim()) return;
    const triggerAt = new Date(`${date}T${time}`);
    createReminder.mutate({
      title: title.trim(),
      message: message.trim() || undefined,
      triggerAt: triggerAt.getTime(),
      repeat: repeat as any,
    });
    setTitle("");
    setMessage("");
    setRepeat("none");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Set a Reminder</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What to remind you about..." />
          </div>
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Additional details..." rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Repeat</Label>
            <Select value={repeat} onValueChange={setRepeat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No repeat</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || createReminder.isPending}>
            {createReminder.isPending ? "Setting..." : "Set Reminder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
