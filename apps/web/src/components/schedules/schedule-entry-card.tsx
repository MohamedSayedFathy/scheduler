'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type SessionType = 'lecture' | 'tutorial' | 'lab';

const NEUTRAL_STYLE = {
  bg: 'bg-slate-100 dark:bg-slate-800',
  border: 'border-slate-300 dark:border-slate-600',
  text: 'text-slate-900 dark:text-slate-100',
};

const sessionTypeLabels: Record<SessionType, string> = {
  lecture: 'Lecture',
  tutorial: 'Tutorial',
  lab: 'Lab',
};

export interface ScheduleEntryData {
  entryId: string;
  /** The courseSessions.id that this entry belongs to */
  sessionId: string;
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
  assignedLecturerName?: string | null;
  lecturerIds?: string[];
  courseId: string;
  studentGroupIds?: string[];
  /** Hex color of the first attending student group, e.g. '#3B82F6'. When set,
   *  overrides the session-type palette with a group-color fill + border. */
  groupColor?: string | null;
}

interface ScheduleEntryCardProps {
  entry: ScheduleEntryData;
  onClick: (entry: ScheduleEntryData) => void;
  conflicted?: boolean;
  conflictMessages?: string[];
}

export function ScheduleEntryCard({ entry, onClick, conflicted, conflictMessages }: ScheduleEntryCardProps) {
  const { groupColor } = entry;

  const groupColorStyle =
    groupColor && !conflicted
      ? { backgroundColor: groupColor + '33', borderColor: groupColor }
      : groupColor && conflicted
        ? { backgroundColor: groupColor + '33' }
        : undefined;

  const button = (
    <button
      type="button"
      onClick={() => onClick(entry)}
      style={groupColorStyle}
      className={cn(
        'w-full rounded-md border p-2 text-left transition-shadow hover:shadow-md cursor-pointer',
        groupColor ? 'text-slate-900 dark:text-slate-100' : cn(NEUTRAL_STYLE.bg, NEUTRAL_STYLE.text),
        conflicted ? 'border-2 border-destructive' : groupColor ? '' : NEUTRAL_STYLE.border,
      )}
    >
      <p className="text-xs font-bold truncate">{entry.courseCode}</p>
      <p className="text-[10px] leading-tight truncate">
        {sessionTypeLabels[entry.sessionType]}
      </p>
      <p className="text-[10px] leading-tight truncate">{entry.roomName}</p>
      {(entry.assignedLecturerName ?? entry.lecturerName) && (
        <p className="text-[10px] leading-tight truncate">
          {entry.assignedLecturerName ?? entry.lecturerName}
        </p>
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
