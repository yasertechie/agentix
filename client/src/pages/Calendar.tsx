import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, MapPin, Plus, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const EVENT_COLORS: Record<string, string> = {
  blue: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  green: "bg-green-500/20 text-green-400 border-green-500/30",
  red: "bg-red-500/20 text-red-400 border-red-500/30",
  yellow: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  purple: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

export default function Calendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const utils = trpc.useUtils();

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const { data: events = [] } = trpc.calendar.list.useQuery(
    { from: monthStart.getTime(), to: monthEnd.getTime() },
    { refetchInterval: 10000 }
  );

  const deleteEvent = trpc.calendar.delete.useMutation({
    onSuccess: () => {
      utils.calendar.list.invalidate();
      toast.success("Event deleted");
    },
  });

  const calendarDays = useMemo(() => {
    const start = startOfWeek(monthStart, { weekStartsOn: 0 });
    const end = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const getEventsForDay = (day: Date) =>
    events.filter((e) => isSameDay(new Date(e.startTime), day));

  const selectedDayEvents = selectedDate ? getEventsForDay(selectedDate) : [];

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CalendarIcon className="h-6 w-6 text-primary" />
              Calendar
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Schedule meetings and manage events</p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Event
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar Grid */}
          <div className="lg:col-span-2">
            <Card className="bg-card border-border/50">
              <CardContent className="p-4">
                {/* Month Navigation */}
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                    className="h-8 w-8 rounded-lg hover:bg-accent flex items-center justify-center transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <h2 className="text-base font-semibold">
                    {format(currentMonth, "MMMM yyyy")}
                  </h2>
                  <button
                    onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                    className="h-8 w-8 rounded-lg hover:bg-accent flex items-center justify-center transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Day Headers */}
                <div className="grid grid-cols-7 mb-2">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d} className="text-center text-xs text-muted-foreground py-2 font-medium">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Calendar Days */}
                <div className="grid grid-cols-7 gap-px bg-border/30 rounded-lg overflow-hidden">
                  {calendarDays.map((day) => {
                    const dayEvents = getEventsForDay(day);
                    const isCurrentMonth = isSameMonth(day, currentMonth);
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    const isTodayDate = isToday(day);

                    return (
                      <div
                        key={day.toISOString()}
                        onClick={() => setSelectedDate(day)}
                        className={`min-h-[80px] p-1.5 cursor-pointer transition-colors bg-card ${
                          !isCurrentMonth ? "opacity-40" : ""
                        } ${isSelected ? "bg-primary/10" : "hover:bg-accent/50"}`}
                      >
                        <div
                          className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                            isTodayDate
                              ? "bg-primary text-primary-foreground"
                              : isSelected
                              ? "text-primary"
                              : "text-foreground"
                          }`}
                        >
                          {format(day, "d")}
                        </div>
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 2).map((event) => (
                            <div
                              key={event.id}
                              className={`text-[10px] px-1 py-0.5 rounded truncate border ${
                                EVENT_COLORS[event.color ?? "blue"]
                              }`}
                            >
                              {event.title}
                            </div>
                          ))}
                          {dayEvents.length > 2 && (
                            <div className="text-[10px] text-muted-foreground px-1">
                              +{dayEvents.length - 2} more
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Selected Day Events */}
          <div className="space-y-4">
            <Card className="bg-card border-border/50">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3">
                  {selectedDate ? format(selectedDate, "EEEE, MMMM d") : "Select a day"}
                </h3>
                {!selectedDate ? (
                  <p className="text-xs text-muted-foreground">Click on a day to see events</p>
                ) : selectedDayEvents.length === 0 ? (
                  <div className="text-center py-6">
                    <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs text-muted-foreground">No events this day</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 text-xs"
                      onClick={() => setShowCreate(true)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add event
                    </Button>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[400px]">
                    <div className="space-y-2">
                      {selectedDayEvents.map((event) => (
                        <div
                          key={event.id}
                          className={`p-3 rounded-lg border text-sm ${EVENT_COLORS[event.color ?? "blue"]}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-xs leading-tight">{event.title}</p>
                            <button
                              onClick={() => deleteEvent.mutate({ id: event.id })}
                              className="opacity-60 hover:opacity-100 transition-opacity shrink-0"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          <div className="mt-2 space-y-1">
                            <div className="flex items-center gap-1 text-[10px] opacity-80">
                              <Clock className="h-3 w-3" />
                              {format(new Date(event.startTime), "h:mm a")} –{" "}
                              {format(new Date(event.endTime), "h:mm a")}
                            </div>
                            {event.location && (
                              <div className="flex items-center gap-1 text-[10px] opacity-80">
                                <MapPin className="h-3 w-3" />
                                {event.location}
                              </div>
                            )}
                            {Array.isArray(event.attendees) && event.attendees.length > 0 && (
                              <div className="flex items-center gap-1 text-[10px] opacity-80">
                                <Users className="h-3 w-3" />
                                {(event.attendees as string[]).join(", ")}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            {/* Upcoming Events */}
            <Card className="bg-card border-border/50">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3">Upcoming Events</h3>
                {events.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No events this month</p>
                ) : (
                  <div className="space-y-2">
                    {events.slice(0, 5).map((event) => (
                      <div key={event.id} className="flex items-start gap-2">
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                          event.color === "blue" ? "bg-blue-400" :
                          event.color === "green" ? "bg-green-400" :
                          event.color === "red" ? "bg-red-400" :
                          event.color === "yellow" ? "bg-yellow-400" :
                          "bg-purple-400"
                        }`} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{event.title}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {format(new Date(event.startTime), "MMM d, h:mm a")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <CreateEventDialog
        open={showCreate}
        defaultDate={selectedDate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          utils.calendar.list.invalidate();
          setShowCreate(false);
          toast.success("Event created");
        }}
      />
    </DashboardLayout>
  );
}

function CreateEventDialog({
  open,
  defaultDate,
  onClose,
  onCreated,
}: {
  open: boolean;
  defaultDate: Date | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const today = defaultDate ?? new Date();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState(format(today, "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [color, setColor] = useState("blue");
  const [attendees, setAttendees] = useState("");

  const createEvent = trpc.calendar.create.useMutation({ onSuccess: onCreated });

  const handleSubmit = () => {
    if (!title.trim()) return;
    const startDt = new Date(`${startDate}T${startTime}`);
    const endDt = new Date(`${startDate}T${endTime}`);
    createEvent.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      startTime: startDt.getTime(),
      endTime: endDt.getTime(),
      color,
      attendees: attendees ? attendees.split(",").map((a) => a.trim()).filter(Boolean) : [],
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Calendar Event</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title..." />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional..." />
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Room, address, or video link..." />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Attendees (comma-separated emails)</Label>
            <Input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="alice@example.com, bob@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex gap-2">
              {["blue", "green", "red", "yellow", "purple"].map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full transition-all ${
                    c === "blue" ? "bg-blue-500" :
                    c === "green" ? "bg-green-500" :
                    c === "red" ? "bg-red-500" :
                    c === "yellow" ? "bg-yellow-500" :
                    "bg-purple-500"
                  } ${color === c ? "ring-2 ring-offset-2 ring-offset-background ring-white scale-110" : "opacity-60 hover:opacity-100"}`}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || createEvent.isPending}>
            {createEvent.isPending ? "Creating..." : "Create Event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
