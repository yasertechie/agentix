import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  Bell,
  Bot,
  CheckCircle,
  Mail,
  MessageSquare,
  Plus,
  Send,
  Trash2,
  User,
  Wrench,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Streamdown } from "streamdown";
import { toast } from "sonner";

interface ConfirmationState {
  id: number;
  actionType: string;
  payload: Record<string, unknown>;
}

export default function Chat() {
  const params = useParams<{ conversationId?: string }>();
  const [, setLocation] = useLocation();
  const [activeConvId, setActiveConvId] = useState<number | null>(
    params.conversationId ? parseInt(params.conversationId) : null
  );
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const utils = trpc.useUtils();
  const { data: conversations = [] } = trpc.chat.listConversations.useQuery();
  const { data: messages = [], refetch: refetchMessages } = trpc.chat.getMessages.useQuery(
    { conversationId: activeConvId! },
    { enabled: !!activeConvId, refetchInterval: 3000 }
  );

  const createConv = trpc.chat.createConversation.useMutation({
    onSuccess: (data) => {
      utils.chat.listConversations.invalidate();
      setActiveConvId(data.id);
      setLocation(`/chat/${data.id}`);
    },
  });

  const deleteConv = trpc.chat.deleteConversation.useMutation({
    onSuccess: () => {
      utils.chat.listConversations.invalidate();
      setActiveConvId(null);
      setLocation("/chat");
    },
  });

  const sendMessage = trpc.chat.sendMessage.useMutation({
    onSuccess: (data) => {
      refetchMessages();
      utils.chat.listConversations.invalidate();
      if (data.requiresConfirmation && data.confirmationId) {
        setConfirmation({
          id: data.confirmationId,
          actionType: data.confirmationPayload ? (data.confirmationPayload as any).actionType : "action",
          payload: (data.confirmationPayload as Record<string, unknown>) ?? {},
        });
      }
    },
    onError: (err) => {
      toast.error("Failed to send message: " + err.message);
    },
  });

  const confirmAction = trpc.chat.confirmAction.useMutation({
    onSuccess: (data) => {
      setConfirmation(null);
      refetchMessages();
      toast.success(data.message);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (params.conversationId) {
      setActiveConvId(parseInt(params.conversationId));
    }
  }, [params.conversationId]);

  const handleNewConversation = async () => {
    await createConv.mutateAsync({ title: "New Conversation" });
  };

  const handleSend = async () => {
    if (!input.trim() || isSending) return;
    if (!activeConvId) {
      const conv = await createConv.mutateAsync({ title: input.slice(0, 60) });
      setActiveConvId(conv.id);
      setLocation(`/chat/${conv.id}`);
      setIsSending(true);
      await sendMessage.mutateAsync({ conversationId: conv.id, content: input.trim() });
    } else {
      setIsSending(true);
      await sendMessage.mutateAsync({ conversationId: activeConvId, content: input.trim() });
    }
    setInput("");
    setIsSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-0px)] overflow-hidden">
        {/* Sidebar: Conversation List */}
        <div className="w-64 shrink-0 border-r border-border/50 flex flex-col bg-sidebar hidden md:flex">
          <div className="p-3 border-b border-border/50 flex items-center justify-between">
            <span className="text-sm font-semibold text-sidebar-foreground">Conversations</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleNewConversation}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-0.5">
              {conversations.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-4 text-center">No conversations yet</p>
              )}
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
                    activeConvId === conv.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => {
                    setActiveConvId(conv.id);
                    setLocation(`/chat/${conv.id}`);
                  }}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-xs truncate flex-1">{conv.title}</span>
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConv.mutate({ id: conv.id });
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {!activeConvId ? (
            <WelcomeScreen onStart={handleNewConversation} />
          ) : (
            <>
              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="max-w-3xl mx-auto space-y-4 pb-4">
                  {messages.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <Bot className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Start the conversation by typing a message below.</p>
                    </div>
                  )}
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} />
                  ))}
                  {isSending && <TypingIndicator />}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Input Area */}
              <div className="border-t border-border/50 p-4 bg-background/95 backdrop-blur">
                <div className="max-w-3xl mx-auto">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 relative">
                      <Textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask me to send emails, schedule meetings, create tasks, set reminders..."
                        className="min-h-[52px] max-h-[200px] resize-none pr-12 bg-card border-border/50 text-sm"
                        disabled={isSending}
                        rows={1}
                      />
                    </div>
                    <Button
                      onClick={handleSend}
                      disabled={!input.trim() || isSending}
                      size="icon"
                      className="h-[52px] w-[52px] shrink-0"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Press Enter to send · Shift+Enter for new line
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmation && (
        <ConfirmationDialog
          confirmation={confirmation}
          onConfirm={() => confirmAction.mutate({ confirmationId: confirmation.id, confirmed: true })}
          onReject={() => {
            confirmAction.mutate({ confirmationId: confirmation.id, confirmed: false });
            setConfirmation(null);
          }}
          isLoading={confirmAction.isPending}
        />
      )}
    </DashboardLayout>
  );
}

function MessageBubble({ message }: { message: any }) {
  const isUser = message.role === "user";
  const meta = message.metadata as any;
  const toolsUsed: string[] = meta?.toolsUsed ?? [];

  return (
    <div className={`flex gap-3 animate-fade-in-up ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
          isUser ? "bg-primary/20" : "bg-secondary"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary" />
        ) : (
          <Bot className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className={`flex flex-col gap-1 max-w-[80%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-card border border-border/50 text-card-foreground rounded-tl-sm"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none">
              <Streamdown>{message.content}</Streamdown>
            </div>
          )}
        </div>
        {toolsUsed.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {toolsUsed.map((tool) => (
              <Badge key={tool} variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-1">
                <Wrench className="h-2.5 w-2.5" />
                {tool.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>
        )}
        <span className="text-[10px] text-muted-foreground">
          {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
        <Bot className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="bg-card border border-border/50 px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1">
        <span className="typing-dot h-2 w-2 rounded-full bg-muted-foreground inline-block" />
        <span className="typing-dot h-2 w-2 rounded-full bg-muted-foreground inline-block" />
        <span className="typing-dot h-2 w-2 rounded-full bg-muted-foreground inline-block" />
      </div>
    </div>
  );
}

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  const examples = [
    { icon: Mail, text: "Send an email to john@example.com about tomorrow's meeting" },
    { icon: Bot, text: "Schedule a team standup every Monday at 9am" },
    { icon: CheckCircle, text: "Create a task to review the Q4 report by Friday" },
    { icon: Bell, text: "Remind me to call the dentist at 3pm today" },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-6">
        <Bot className="h-10 w-10 text-primary" />
      </div>
      <h1 className="text-3xl font-bold mb-2">How can I help you today?</h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        I can send emails, schedule meetings, manage your tasks, set reminders, and much more. Just ask in natural language.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full mb-8">
        {examples.map((ex, i) => (
          <button
            key={i}
            onClick={onStart}
            className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border/50 text-left hover:border-primary/50 hover:bg-card/80 transition-all group"
          >
            <ex.icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{ex.text}</span>
          </button>
        ))}
      </div>
      <Button onClick={onStart} size="lg" className="gap-2">
        <Plus className="h-4 w-4" />
        Start a new conversation
      </Button>
    </div>
  );
}

function ConfirmationDialog({
  confirmation,
  onConfirm,
  onReject,
  isLoading,
}: {
  confirmation: ConfirmationState;
  onConfirm: () => void;
  onReject: () => void;
  isLoading: boolean;
}) {
  const payload = confirmation.payload;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onReject(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Confirm Action
          </DialogTitle>
          <DialogDescription>
            Please review this action before it is executed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {confirmation.actionType === "send_email" && (
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-muted-foreground w-16 shrink-0">To:</span>
                <span className="font-medium">{String(payload.to ?? "")}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-16 shrink-0">Subject:</span>
                <span className="font-medium">{String(payload.subject ?? "")}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-16 shrink-0">Body:</span>
                <p className="text-muted-foreground bg-muted/50 rounded-lg p-2 flex-1 text-xs leading-relaxed">
                  {String(payload.body ?? "").slice(0, 300)}
                  {String(payload.body ?? "").length > 300 ? "..." : ""}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onReject} disabled={isLoading}>
            <XCircle className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isLoading}>
            <CheckCircle className="h-4 w-4 mr-2" />
            {isLoading ? "Sending..." : "Confirm & Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
