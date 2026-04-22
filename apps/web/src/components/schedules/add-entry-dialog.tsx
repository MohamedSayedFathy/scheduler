'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface AddEntrySession {
  id: string;
  courseCode: string;
  courseName: string;
  sessionType: 'lecture' | 'tutorial' | 'lab';
  durationSlots: number;
  lecturerIds: string[];
}

export interface AddEntryRoom {
  id: string;
  name: string;
  capacity: number;
  roomType: string;
  building: string | null;
}

export interface AddEntryTimeSlot {
  id: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  date: string;
}

export interface AddEntryValues {
  sessionId: string;
  startTimeSlotId: string;
  roomId: string;
  assignedLecturerId: string | null;
}

export interface AddEventValues {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  roomId: string | null;
}

interface AddEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: { dayOfWeek: string; startTime: string; date?: string } | null;
  sessions: AddEntrySession[];
  rooms: AddEntryRoom[];
  timeSlots: AddEntryTimeSlot[];
  lecturersById: Map<string, { firstName: string | null; lastName: string | null; email: string }>;
  onSubmit: (values: AddEntryValues) => void;
  onSubmitOther?: (values: AddEventValues) => void;
}

const DAY_LABELS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const SESSION_TYPE_TO_ROOM_TYPE: Record<string, string> = {
  lecture: 'lecture_hall',
  tutorial: 'tutorial_room',
  lab: 'lab',
};

const SESSION_TYPE_LABELS: Record<string, string> = {
  lecture: 'Lecture',
  tutorial: 'Tutorial',
  lab: 'Lab',
};

function formatTime(hhmm: string): string {
  return hhmm.slice(0, 5);
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + mins;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function AddEntryDialog({
  open,
  onOpenChange,
  prefill,
  sessions,
  rooms,
  timeSlots,
  lecturersById,
  onSubmit,
  onSubmitOther,
}: AddEntryDialogProps) {
  const [activeTab, setActiveTab] = useState<'session' | 'other'>('session');

  // --- Course session tab state ---
  const [sessionOpen, setSessionOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [selectedStartTime, setSelectedStartTime] = useState<string>('');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [selectedLecturerId, setSelectedLecturerId] = useState<string | null>(null);

  // --- Other event tab state ---
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventStartTime, setEventStartTime] = useState('');
  const [eventEndTime, setEventEndTime] = useState('');
  const [eventRoomId, setEventRoomId] = useState<string>('__none__');

  // Reset form whenever the dialog opens or prefill changes
  useEffect(() => {
    if (open) {
      setActiveTab('session');
      setSelectedSessionId('');
      setSelectedRoomId('');
      setSelectedLecturerId(null);
      setSelectedDay(prefill?.dayOfWeek ?? '');
      setSelectedStartTime(prefill?.startTime ?? '');

      setEventTitle('');
      setEventDate(prefill?.date ?? todayDateString());
      const startT = prefill?.startTime ?? '08:00';
      setEventStartTime(startT);
      setEventEndTime(addMinutes(startT, 60));
      setEventRoomId('__none__');
    }
  }, [open, prefill]);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );

  // Distinct day options from all time slots
  const dayOptions = useMemo(() => {
    const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const days = new Set(timeSlots.map((ts) => ts.dayOfWeek));
    return DAY_ORDER.filter((d) => days.has(d));
  }, [timeSlots]);

  // Distinct start times for selected day
  const startTimeOptions = useMemo(() => {
    if (!selectedDay) return [];
    const times = new Set(
      timeSlots.filter((ts) => ts.dayOfWeek === selectedDay).map((ts) => formatTime(ts.startTime)),
    );
    return [...times].sort();
  }, [timeSlots, selectedDay]);

  // Filtered rooms by session type
  const filteredRooms = useMemo(() => {
    if (!selectedSession) return rooms;
    const requiredType = SESSION_TYPE_TO_ROOM_TYPE[selectedSession.sessionType];
    return rooms.filter((r) => r.roomType === requiredType);
  }, [rooms, selectedSession]);

  // Lecturer options from session
  const lecturerOptions = useMemo(() => {
    if (!selectedSession) return [];
    return selectedSession.lecturerIds.map((id) => {
      const lec = lecturersById.get(id);
      const name = lec
        ? [lec.firstName, lec.lastName].filter(Boolean).join(' ') || lec.email
        : id;
      return { id, label: name };
    });
  }, [selectedSession, lecturersById]);

  // Auto-select first lecturer when session changes
  useEffect(() => {
    if (lecturerOptions.length > 0) {
      setSelectedLecturerId(lecturerOptions[0]?.id ?? null);
    } else {
      setSelectedLecturerId(null);
    }
  }, [lecturerOptions]);

  // Auto-select first room when session changes (if filtered list changed)
  useEffect(() => {
    setSelectedRoomId('');
  }, [selectedSession?.sessionType]);

  // Resolve startTimeSlotId: find earliest slot matching (day, startTime)
  const resolvedTimeSlotId = useMemo(() => {
    if (!selectedDay || !selectedStartTime) return null;
    const matching = timeSlots
      .filter((ts) => ts.dayOfWeek === selectedDay && formatTime(ts.startTime) === selectedStartTime)
      .sort((a, b) => a.date.localeCompare(b.date));
    return matching[0]?.id ?? null;
  }, [timeSlots, selectedDay, selectedStartTime]);

  const canSubmitSession =
    !!selectedSessionId && !!selectedDay && !!selectedStartTime && !!selectedRoomId && !!resolvedTimeSlotId;

  const eventEndAfterStart =
    !!eventStartTime && !!eventEndTime && eventEndTime > eventStartTime;

  const canSubmitOther =
    !!eventTitle.trim() && !!eventDate && !!eventStartTime && !!eventEndTime && eventEndAfterStart;

  function handleSubmitSession() {
    if (!canSubmitSession || !resolvedTimeSlotId) return;
    onSubmit({
      sessionId: selectedSessionId,
      startTimeSlotId: resolvedTimeSlotId,
      roomId: selectedRoomId,
      assignedLecturerId: selectedLecturerId,
    });
    onOpenChange(false);
  }

  function handleSubmitOther() {
    if (!canSubmitOther || !onSubmitOther) return;
    onSubmitOther({
      title: eventTitle.trim(),
      date: eventDate,
      startTime: eventStartTime,
      endTime: eventEndTime,
      roomId: eventRoomId === '__none__' ? null : eventRoomId,
    });
    onOpenChange(false);
  }

  const sessionLabel = selectedSession
    ? `${selectedSession.courseCode} · ${selectedSession.courseName} · ${SESSION_TYPE_LABELS[selectedSession.sessionType]} · ${selectedSession.durationSlots}×30min`
    : 'Select session...';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Schedule Entry</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'session' | 'other')}>
          <TabsList className="w-full">
            <TabsTrigger value="session" className="flex-1">Course session</TabsTrigger>
            <TabsTrigger value="other" className="flex-1">Other</TabsTrigger>
          </TabsList>

          {/* Course session tab */}
          <TabsContent value="session">
            <div className="space-y-4 py-2">
              {/* Session picker — combobox */}
              <div className="space-y-2">
                <Label>Session</Label>
                <Popover open={sessionOpen} onOpenChange={setSessionOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={sessionOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate text-left">{sessionLabel}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search sessions..." />
                      <CommandList>
                        <CommandEmpty>No sessions found.</CommandEmpty>
                        <CommandGroup>
                          {sessions.map((s) => (
                            <CommandItem
                              key={s.id}
                              value={`${s.courseCode} ${s.courseName} ${SESSION_TYPE_LABELS[s.sessionType]}`}
                              onSelect={() => {
                                setSelectedSessionId(s.id);
                                setSessionOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  selectedSessionId === s.id ? 'opacity-100' : 'opacity-0',
                                )}
                              />
                              <span className="truncate">
                                {s.courseCode} · {s.courseName} · {SESSION_TYPE_LABELS[s.sessionType]} · {s.durationSlots}×30min
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Day + Start time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Day</Label>
                  <Select value={selectedDay} onValueChange={(v) => { setSelectedDay(v); setSelectedStartTime(''); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select day..." />
                    </SelectTrigger>
                    <SelectContent>
                      {dayOptions.map((d) => (
                        <SelectItem key={d} value={d}>
                          {DAY_LABELS[d] ?? d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Start time</Label>
                  <Select value={selectedStartTime} onValueChange={setSelectedStartTime} disabled={!selectedDay}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select time..." />
                    </SelectTrigger>
                    <SelectContent>
                      {startTimeOptions.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Room */}
              <div className="space-y-2">
                <Label>Room</Label>
                <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select room..." />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredRooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} · cap {r.capacity}{r.building ? ` · ${r.building}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Assigned lecturer */}
              {lecturerOptions.length > 0 && (
                <div className="space-y-2">
                  <Label>Assigned lecturer</Label>
                  <Select
                    value={selectedLecturerId ?? ''}
                    onValueChange={(v) => setSelectedLecturerId(v || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select lecturer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {lecturerOptions.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitSession} disabled={!canSubmitSession}>
                Next: choose weeks
              </Button>
            </div>
          </TabsContent>

          {/* Other event tab */}
          <TabsContent value="other">
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="event-title">Title</Label>
                <Input
                  id="event-title"
                  placeholder="e.g. Faculty Meeting"
                  maxLength={255}
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="event-date">Date</Label>
                <Input
                  id="event-date"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="event-start">Start time</Label>
                  <Input
                    id="event-start"
                    type="time"
                    step={60}
                    value={eventStartTime}
                    onChange={(e) => setEventStartTime(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event-end">End time</Label>
                  <Input
                    id="event-end"
                    type="time"
                    step={60}
                    value={eventEndTime}
                    onChange={(e) => setEventEndTime(e.target.value)}
                  />
                  {eventStartTime && eventEndTime && !eventEndAfterStart && (
                    <p className="text-xs text-destructive">End must be after start</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Room (optional)</Label>
                <Select value={eventRoomId} onValueChange={setEventRoomId}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {rooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} · cap {r.capacity}{r.building ? ` · ${r.building}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitOther} disabled={!canSubmitOther || !onSubmitOther}>
                Add event
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
