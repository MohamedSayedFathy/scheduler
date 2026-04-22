'use client';

import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ScheduleEventData } from './event-card';

interface EventDetailDialogProps {
  event: ScheduleEventData | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDelete: (event: ScheduleEventData) => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function formatHHMM(time: string): string {
  return time.slice(0, 5);
}

export function EventDetailDialog({ event, open, onOpenChange, onDelete }: EventDetailDialogProps) {
  if (!event) return null;

  function handleDelete() {
    if (!event) return;
    onDelete(event);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{event.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm">
          <div className="flex gap-2">
            <span className="text-muted-foreground w-20 shrink-0">Date</span>
            <span>{formatDate(event.date)}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-20 shrink-0">Time</span>
            <span>{formatHHMM(event.startTime)} – {formatHHMM(event.endTime)}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-20 shrink-0">Room</span>
            <span>{event.roomName ?? 'No room'}</span>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete event
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
