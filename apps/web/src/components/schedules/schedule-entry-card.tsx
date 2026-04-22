'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type SessionType = 'lecture' | 'tutorial' | 'lab';

const sessionTypeStyles: Record<
  SessionType,
  { bg: string; border: string; text: string }
> = {
  lecture: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    border: 'border-blue-300 dark:border-blue-700',
    text: 'text-blue-900 dark:text-blue-100',
  },
  tutorial: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    border: 'border-green-300 dark:border-green-700',
    text: 'text-green-900 dark:text-green-100',
  },
  lab: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    border: 'border-purple-300 dark:border-purple-700',
    text: 'text-purple-900 dark:text-purple-100',
  },
};

const sessionTypeLabels: Record<SessionType, string> = {
  lecture: 'Lecture',
  tutorial: 'Tutorial',
  lab: 'Lab',
};

export interface ScheduleEntryData {
  entryId: string;
  courseCode: string;
  courseName: string;
  sessionType: SessionType;
  roomName: string;
  roomId: string;
  timeSlotId: string;
  /** ISO date string (YYYY-MM-DD) from the time_slots.date column */
  date: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  durationSlots: number;
  lecturerName?: string;
  lecturerIds?: string[];
  courseId: string;
  studentGroupIds?: string[];
}

interface ScheduleEntryCardProps {
  entry: ScheduleEntryData;
  onClick: (entry: ScheduleEntryData) => void;
  conflicted?: boolean;
  conflictMessages?: string[];
}

export function ScheduleEntryCard({ entry, onClick, conflicted, conflictMessages }: ScheduleEntryCardProps) {
  const style = sessionTypeStyles[entry.sessionType];

  const button = (
    <button
      type="button"
      onClick={() => onClick(entry)}
      className={cn(
        'w-full rounded-md border p-2 text-left transition-shadow hover:shadow-md cursor-pointer',
        style.bg,
        style.text,
        conflicted ? 'border-2 border-destructive' : style.border,
      )}
    >
      <p className="text-xs font-bold truncate">{entry.courseCode}</p>
      <p className="text-[10px] leading-tight truncate">
        {sessionTypeLabels[entry.sessionType]}
      </p>
      <p className="text-[10px] leading-tight truncate">{entry.roomName}</p>
      {entry.lecturerName && (
        <p className="text-[10px] leading-tight truncate">{entry.lecturerName}</p>
      )}
    </button>
  );

  if (conflicted && conflictMessages && conflictMessages.length > 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <ul className="space-y-1 text-xs">
              {conflictMessages.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}
