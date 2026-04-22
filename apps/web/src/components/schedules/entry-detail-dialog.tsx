'use client';

import { useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/trpc/client';
import type { Conflict } from '@/lib/schedules/conflicts';

import type { ScheduleEntryData } from './schedule-entry-card';

interface RoomOption {
  id: string;
  name: string;
  building: string | null;
  capacity: number;
}

interface TimeSlotOption {
  id: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}

interface EntryDetailDialogProps {
  entry: ScheduleEntryData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms: RoomOption[];
  timeSlots: TimeSlotOption[];
  scheduleId: string;
  conflicts?: Conflict[];
  entryLookup?: Map<string, ScheduleEntryData>;
  onJumpToEntry?: (entry: ScheduleEntryData) => void;
  onDelete?: (entry: ScheduleEntryData) => void;
}

const dayLabels: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const sessionTypeLabels: Record<string, string> = {
  lecture: 'Lecture',
  tutorial: 'Tutorial',
  lab: 'Lab',
};

function formatTime(time: string): string {
  return time.slice(0, 5);
}

export function EntryDetailDialog({
  entry,
  open,
  onOpenChange,
  rooms,
  timeSlots,
  scheduleId,
  conflicts = [],
  entryLookup,
  onJumpToEntry,
  onDelete,
}: EntryDetailDialogProps) {
  const { toast } = useToast();
  const utils = api.useUtils();

  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>(undefined);
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState<string | undefined>(undefined);

  const moveEntry = api.schedules.moveEntry.useMutation({
    onSuccess: () => {
      toast({
        title: 'Entry updated',
        description: 'The schedule entry has been reassigned.',
      });
      utils.schedules.getById.invalidate({ id: scheduleId });
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast({
        title: 'Failed to update entry',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  function resetForm() {
    setSelectedRoomId(undefined);
    setSelectedTimeSlotId(undefined);
  }

  if (!entry) return null;

  const currentEntry = entry;
  const effectiveRoomId = selectedRoomId ?? currentEntry.roomId;
  const effectiveTimeSlotId = selectedTimeSlotId ?? currentEntry.timeSlotId;

  const hasChanges =
    (selectedRoomId && selectedRoomId !== currentEntry.roomId) ||
    (selectedTimeSlotId && selectedTimeSlotId !== currentEntry.timeSlotId);

  function handleSave() {
    moveEntry.mutate({
      scheduleId,
      sessionId: currentEntry.sessionId,
      currentTimeSlotId: currentEntry.timeSlotId,
      newRoomId: selectedRoomId && selectedRoomId !== currentEntry.roomId ? selectedRoomId : undefined,
      newStartTimeSlotId: selectedTimeSlotId && selectedTimeSlotId !== currentEntry.timeSlotId ? selectedTimeSlotId : undefined,
      scope: 'all',
    });
  }

  function handleJump(partnerId: string) {
    const partner = entryLookup?.get(partnerId);
    if (partner && onJumpToEntry) {
      onJumpToEntry(partner);
    }
  }

  function handleDeleteClick() {
    if (onDelete) {
      onOpenChange(false);
      resetForm();
      onDelete(currentEntry);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {entry.courseCode} - {sessionTypeLabels[entry.sessionType]}
          </DialogTitle>
          <DialogDescription>{entry.courseName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {conflicts.length > 0 && (
            <>
              <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-destructive font-medium text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Conflicts ({conflicts.length})</span>
                </div>
                <ul className="space-y-2">
                  {conflicts.map((conflict, i) => {
                    const partners = conflict.entryIds.filter((id) => id !== entry.entryId);
                    return (
                      <li key={i} className="space-y-1">
                        <p className="text-xs text-destructive">{conflict.message}</p>
                        {partners.length > 0 && entryLookup && (
                          <ul className="pl-3 space-y-1">
                            {partners.map((partnerId) => {
                              const partner = entryLookup.get(partnerId);
                              if (!partner) return null;
                              return (
                                <li key={partnerId} className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span className="truncate">
                                    {partner.courseCode} {partner.courseName} — {dayLabels[partner.dayOfWeek] ?? partner.dayOfWeek}{' '}
                                    {formatTime(partner.startTime)}, {partner.roomName}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 shrink-0 px-1 text-xs"
                                    onClick={() => handleJump(partnerId)}
                                    aria-label={`Jump to ${partner.courseCode}`}
                                  >
                                    Jump to
                                    <ArrowRight className="ml-0.5 h-3 w-3" />
                                  </Button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <Separator />
            </>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-muted-foreground">Session Type</p>
              <p className="font-medium">{sessionTypeLabels[entry.sessionType]}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Duration</p>
              <p className="font-medium">
                {entry.durationSlots} slot{entry.durationSlots > 1 ? 's' : ''}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Room</p>
              <p className="font-medium">{entry.roomName}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Time</p>
              <p className="font-medium">
                {dayLabels[entry.dayOfWeek]} {formatTime(entry.startTime)} - {formatTime(entry.endTime)}
              </p>
            </div>
            {(entry.assignedLecturerName ?? entry.lecturerName) && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Teaching</p>
                <p className="font-medium">{entry.assignedLecturerName ?? entry.lecturerName}</p>
                {entry.assignedLecturerName && (entry.lecturerIds?.length ?? 0) > 1 && entry.lecturerName && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Session also lists: {entry.lecturerName
                      .split(', ')
                      .filter((n) => n !== entry.assignedLecturerName)
                      .join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <h4 className="font-medium">Reassign</h4>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Room</label>
              <Select
                value={effectiveRoomId}
                onValueChange={setSelectedRoomId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.name}
                      {room.building ? ` (${room.building})` : ''} - Cap: {room.capacity}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Time Slot</label>
              <Select
                value={effectiveTimeSlotId}
                onValueChange={setSelectedTimeSlotId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeSlots.map((slot) => (
                    <SelectItem key={slot.id} value={slot.id}>
                      {dayLabels[slot.dayOfWeek]} {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleSave}
              disabled={!hasChanges || moveEntry.isPending}
              className="w-full"
            >
              {moveEntry.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </div>

          {onDelete && (
            <>
              <Separator />
              <Button
                variant="destructive"
                className="w-full"
                onClick={handleDeleteClick}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete session
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
