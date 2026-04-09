'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

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
  // Handle both "HH:MM" and "HH:MM:SS" formats
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

  const updateEntry = api.schedules.updateEntry.useMutation({
    onSuccess: () => {
      toast({ title: 'Entry updated', description: 'The schedule entry has been reassigned.' });
      utils.schedules.getById.invalidate({ id: scheduleId });
      onOpenChange(false);
      setSelectedRoomId(undefined);
      setSelectedTimeSlotId(undefined);
    },
    onError: (error) => {
      toast({
        title: 'Failed to update entry',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  if (!entry) return null;

  const hasChanges =
    (selectedRoomId && selectedRoomId !== entry.roomId) ||
    (selectedTimeSlotId && selectedTimeSlotId !== entry.timeSlotId);

  function handleSave() {
    if (!entry) return;

    const updates: { entryId: string; roomId?: string; timeSlotId?: string } = {
      entryId: entry.entryId,
    };

    if (selectedRoomId && selectedRoomId !== entry.roomId) {
      updates.roomId = selectedRoomId;
    }
    if (selectedTimeSlotId && selectedTimeSlotId !== entry.timeSlotId) {
      updates.timeSlotId = selectedTimeSlotId;
    }

    updateEntry.mutate(updates);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                value={selectedRoomId ?? entry.roomId}
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
                value={selectedTimeSlotId ?? entry.timeSlotId}
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
              disabled={!hasChanges || updateEntry.isPending}
              className="w-full"
            >
              {updateEntry.isPending && (
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
