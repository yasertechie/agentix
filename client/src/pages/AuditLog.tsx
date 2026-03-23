import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import {
  Activity,
  AlertCircle,
  CheckCircle,
  ClipboardList,
  Clock,
  Loader2,
  RefreshCw,
  Search,
  Wrench,
  XCircle,
} from "lucide-react";
import { useState } from "react";

const AGENT_TYPE_STYLES = {
  planner: "bg-blue-500/20 text-blue-400",
  executor: "bg-purple-500/20 text-purple-400",
  memory: "bg-green-500/20 text-green-400",
  tool: "bg-orange-500/20 text-orange-400",
};

const STATUS_ICONS = {
  started: <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />,
  success: <CheckCircle className="h-3.5 w-3.5 text-green-400" />,
  failed: <XCircle className="h-3.5 w-3.5 text-red-400" />,
  retrying: <RefreshCw className="h-3.5 w-3.5 text-yellow-400 animate-spin" />,
};

export default function AuditLog() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const { data: logs = [], isLoading, refetch } = trpc.audit.list.useQuery(
    { limit: 200 },
    { refetchInterval: 10000 }
  );

  const filtered = logs.filter((log) => {
    const matchesSearch =
      !search ||
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      (log.toolName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (log.errorMessage ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === "all" || log.agentType === filterType;
    return matchesSearch && matchesType;
  });

  const stats = {
    total: logs.length,
    success: logs.filter((l) => l.status === "success").length,
    failed: logs.filter((l) => l.status === "failed").length,
    tools: new Set(logs.filter((l) => l.toolName).map((l) => l.toolName)).size,
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-primary" />
              Audit Log
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Complete history of all agent actions and tool executions</p>
          </div>
          <button
            onClick={() => refetch()}
            className="h-9 w-9 rounded-lg hover:bg-accent flex items-center justify-center transition-colors"
          >
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total Actions", value: stats.total, icon: Activity, color: "text-foreground" },
            { label: "Successful", value: stats.success, icon: CheckCircle, color: "text-green-400" },
            { label: "Failed", value: stats.failed, icon: AlertCircle, color: "text-red-400" },
            { label: "Tools Used", value: stats.tools, icon: Wrench, color: "text-orange-400" },
          ].map((stat) => (
            <Card key={stat.label} className="bg-card border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
                <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search actions, tools..."
              className="pl-9"
            />
          </div>
          <div className="flex gap-1.5">
            {["all", "planner", "executor", "tool", "memory"].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filterType === type
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Log Table */}
        <Card className="bg-card border-border/50">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No agent actions recorded yet.</p>
                <p className="text-xs mt-1">Start a conversation to see the agent in action.</p>
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card border-b border-border/50">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Agent</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Action</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Tool</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Duration</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((log, idx) => (
                      <tr
                        key={log.id}
                        className={`border-b border-border/30 hover:bg-accent/30 transition-colors ${
                          idx % 2 === 0 ? "" : "bg-muted/10"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {STATUS_ICONS[log.status]}
                            <span className="text-xs capitalize text-muted-foreground">{log.status}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            AGENT_TYPE_STYLES[log.agentType]
                          }`}>
                            {log.agentType}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-xs font-medium font-mono">{log.action}</p>
                            {log.errorMessage && (
                              <p className="text-[10px] text-red-400 mt-0.5 truncate max-w-[200px]">
                                {log.errorMessage}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {log.toolName ? (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-1">
                              <Wrench className="h-2.5 w-2.5" />
                              {log.toolName}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {log.durationMs ? (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {log.durationMs}ms
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(log.createdAt), "MMM d, HH:mm:ss")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
