'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
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
}: EntryDetailDialogProps) {
  const { toast } = useToast();
  const utils = api.useUtils();

  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>(undefined);
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState<string | undefined>(undefined);
  const [applyToAllWeeks, setApplyToAllWeeks] = useState(true);

  const moveEntry = api.schedules.moveEntry.useMutation({
    onSuccess: () => {
      toast({
        title: 'Entry updated',
        description: applyToAllWeeks
          ? 'The session has been reassigned across all weeks.'
          : 'The schedule entry has been reassigned for this week.',
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
    setApplyToAllWeeks(true);
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
      newRoomId: selectedRoomId && selectedRoomId !== currentEntry.roomId ? selectedRoomId : undefined,
      newStartTimeSlotId: selectedTimeSlotId && selectedTimeSlotId !== currentEntry.timeSlotId ? selectedTimeSlotId : undefined,
      applyToAllWeeks,
    });
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
            {entry.lecturerName && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Lecturer</p>
                <p className="font-medium">{entry.lecturerName}</p>
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

            <div className="flex items-center gap-2">
              <Checkbox
                id="apply-all-weeks"
                checked={applyToAllWeeks}
                onCheckedChange={(checked) => setApplyToAllWeeks(checked === true)}
              />
              <Label htmlFor="apply-all-weeks" className="text-sm cursor-pointer">
                Apply to all 17 weeks
              </Label>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
