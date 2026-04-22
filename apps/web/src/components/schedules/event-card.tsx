'use client';

import { CalendarClock } from 'lucide-react';

export interface ScheduleEventData {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  roomId: string | null;
  roomName: string | null;
  dayOfWeek: string;
}

interface EventCardProps {
  event: ScheduleEventData;
  onClick: (event: ScheduleEventData) => void;
}

function formatHHMM(time: string): string {
  return time.slice(0, 5);
}

export function EventCard({ event, onClick }: EventCardProps) {
  return (
    <button
      type="button"
      className="w-full h-full text-left rounded border border-amber-400 dark:border-amber-600 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-1 overflow-hidden hover:brightness-95 active:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      onClick={() => onClick(event)}
      aria-label={`Event: ${event.title}`}
    >
      <p className="text-xs font-semibold truncate leading-tight">{event.title}</p>
      <p className="text-xs text-muted-foreground flex items-center gap-0.5 mt-0.5">
        <CalendarClock className="h-3 w-3 shrink-0" />
        <span>{formatHHMM(event.startTime)} – {formatHHMM(event.endTime)}</span>
      </p>
      {event.roomName && (
        <p className="text-xs text-muted-foreground truncate">{event.roomName}</p>
      )}
    </button>
  );
}
