import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Bell,
  Bot,
  CheckCircle,
  KeyRound,
  Mail,
  Save,
  Settings as SettingsIcon,
  Shield,
  User,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function Settings() {
  const { user } = useAuth();

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <SettingsIcon className="h-6 w-6 text-primary" />
            Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Configure your AI assistant and integrations</p>
        </div>

        {/* Profile */}
        <Card className="bg-card border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Profile
            </CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-lg font-bold text-primary">
                  {user?.name?.charAt(0).toUpperCase() ?? "U"}
                </span>
              </div>
              <div>
                <p className="font-medium">{user?.name ?? "—"}</p>
                <p className="text-sm text-muted-foreground">{user?.email ?? "—"}</p>
              </div>
              <Badge variant="secondary" className="ml-auto">{user?.role ?? "user"}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Email Configuration */}
        <EmailSettings />

        {/* AI Agent Settings */}
        <AgentSettings />

        {/* Notification Settings */}
        <NotificationSettings />
      </div>
    </DashboardLayout>
  );
}

function EmailSettings() {
  const { data: settings } = trpc.settings.getEmailConfig.useQuery();
  const updateSettings = trpc.settings.updateEmailConfig.useMutation({
    onSuccess: () => toast.success("Email settings saved"),
    onError: (e: any) => toast.error(e.message),
  });
  const testEmail = trpc.settings.testEmailConfig.useMutation({
    onSuccess: () => toast.success("Test email sent successfully!"),
    onError: (e) => toast.error("Test failed: " + e.message),
  });

  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [secure, setSecure] = useState(false);

  useEffect(() => {
    if (settings) {
      setHost(settings.host ?? "");
      setPort(String(settings.port ?? 587));
      setUser(settings.user ?? "");
      setFromName(settings.fromName ?? "");
      setFromEmail(settings.fromEmail ?? "");
      setSecure(settings.secure ?? false);
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate({
      host, port: parseInt(port), user, pass: pass || undefined,
      fromName, fromEmail, secure,
    });
  };

  return (
    <Card className="bg-card border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          Email (SMTP)
        </CardTitle>
        <CardDescription>Configure SMTP for the AI to send emails on your behalf</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>SMTP Host</Label>
            <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.gmail.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Port</Label>
            <Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="587" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input value={user} onChange={(e) => setUser(e.target.value)} placeholder="your@email.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Password / App Password</Label>
            <Input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder={settings?.hasPassword ? "••••••••" : "Enter password"}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>From Name</Label>
            <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your Name" />
          </div>
          <div className="space-y-1.5">
            <Label>From Email</Label>
            <Input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="your@email.com" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={secure} onCheckedChange={setSecure} id="secure-smtp" />
          <Label htmlFor="secure-smtp" className="cursor-pointer">Use SSL/TLS (port 465)</Label>
        </div>
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={updateSettings.isPending} className="gap-2">
            <Save className="h-4 w-4" />
            {updateSettings.isPending ? "Saving..." : "Save Settings"}
          </Button>
          <Button
            variant="outline"
            onClick={() => testEmail.mutate()}
            disabled={testEmail.isPending || !settings?.host}
          >
            {testEmail.isPending ? "Sending..." : "Send Test Email"}
          </Button>
        </div>
        <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground">
          <p className="font-medium mb-1">Gmail Setup:</p>
          <p>Use <code className="bg-muted px-1 rounded">smtp.gmail.com</code>, port <code className="bg-muted px-1 rounded">587</code>, and an App Password (not your regular password). Enable 2FA and generate an App Password in your Google Account settings.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AgentSettings() {
  const { data: prefs } = trpc.memory.getPreferences.useQuery();
  const updatePrefs = trpc.memory.updatePreferences.useMutation({
    onSuccess: () => toast.success("Agent preferences saved"),
  });

  const [confirmEmails, setConfirmEmails] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [timezone, setTimezone] = useState("UTC");

  useEffect(() => {
    if (prefs) {
      setConfirmEmails((prefs as any).confirmEmails ?? true);
      setSystemPrompt((prefs as any).systemPrompt ?? "");
      setTimezone((prefs as any).timezone ?? "UTC");
    }
  }, [prefs]);

  const handleSave = () => {
    updatePrefs.mutate({ preferences: { confirmEmails, systemPrompt, timezone } });
  };

  return (
    <Card className="bg-card border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          AI Agent Behavior
        </CardTitle>
        <CardDescription>Control how the AI assistant operates</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Confirm before sending emails</p>
            <p className="text-xs text-muted-foreground">Show a confirmation dialog before the agent sends any email</p>
          </div>
          <Switch checked={confirmEmails} onCheckedChange={setConfirmEmails} />
        </div>
        <Separator />
        <div className="space-y-1.5">
          <Label>Custom System Prompt</Label>
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Add custom instructions for the AI (e.g., 'Always respond formally', 'My timezone is EST')..."
            rows={4}
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">This is appended to the agent's base instructions</p>
        </div>
        <div className="space-y-1.5">
          <Label>Timezone</Label>
          <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="UTC, America/New_York, Europe/London..." />
        </div>
        <Button onClick={handleSave} disabled={updatePrefs.isPending} className="gap-2">
          <Save className="h-4 w-4" />
          {updatePrefs.isPending ? "Saving..." : "Save Preferences"}
        </Button>
      </CardContent>
    </Card>
  );
}

function NotificationSettings() {
  return (
    <Card className="bg-card border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          Notifications
        </CardTitle>
        <CardDescription>How you receive alerts and reminders</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">In-app notifications</p>
            <p className="text-xs text-muted-foreground">Show toast notifications for triggered reminders</p>
          </div>
          <Switch defaultChecked />
        </div>
        <Separator />
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-start gap-3">
          <Zap className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-medium text-foreground mb-1">Reminder System</p>
            <p className="text-muted-foreground">
              The background worker checks for due reminders every minute and delivers notifications. Make sure to keep the app open or configure email notifications for reliable delivery.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
