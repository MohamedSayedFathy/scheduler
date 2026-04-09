'use client';

import { useMemo, useState } from 'react';

import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { ScheduleEntryCard, type ScheduleEntryData } from './schedule-entry-card';

interface TimetableGridProps {
  entries: ScheduleEntryData[];
  onEntryClick: (entry: ScheduleEntryData) => void;
  filterFn?: (entry: ScheduleEntryData) => boolean;
}

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const DAY_LABELS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const DAY_SHORT_LABELS: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

function timeToMinutes(time: string): number {
  const parts = time.split(':').map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

function minutesToLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatTime(time: string): string {
  return time.slice(0, 5);
}

/**
 * Builds a row-based grid. Each row represents a 30-minute interval.
 * Entries span the correct number of rows based on their start/end times.
 */
export function TimetableGrid({ entries, onEntryClick, filterFn }: TimetableGridProps) {
  const activeDays = useMemo(() => {
    const daySet = new Set(entries.map((e) => e.dayOfWeek));
    return DAY_ORDER.filter((d) => daySet.has(d));
  }, [entries]);

  // Use 30-minute granularity for row placement
  const SLOT_MINUTES = 30;

  const { timeLabels, minTime, rowCount } = useMemo(() => {
    if (entries.length === 0) {
      return { timeLabels: [] as string[], minTime: 480, rowCount: 0 };
    }

    const starts = entries.map((e) => timeToMinutes(e.startTime));
    const ends = entries.map((e) => timeToMinutes(e.endTime));
    const min = Math.floor(Math.min(...starts) / 60) * 60;
    const max = Math.ceil(Math.max(...ends) / 60) * 60;

    const labels: string[] = [];
    for (let t = min; t < max; t += 60) {
      labels.push(minutesToLabel(t));
    }

    const rows = (max - min) / SLOT_MINUTES;
    return { timeLabels: labels, minTime: min, rowCount: rows };
  }, [entries]);

  const [mobileDay, setMobileDay] = useState(activeDays[0] ?? 'monday');

  function getRowStart(startTime: string): number {
    const startMin = timeToMinutes(startTime);
    // +2 because row 1 is the header
    return Math.round((startMin - minTime) / SLOT_MINUTES) + 2;
  }

  function getRowSpan(startTime: string, endTime: string): number {
    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    return Math.round((endMin - startMin) / SLOT_MINUTES);
  }

  function renderGrid(days: string[]) {
    return (
      <div
        className="relative grid border rounded-lg overflow-hidden"
        style={{
          gridTemplateColumns: `80px repeat(${days.length}, minmax(140px, 1fr))`,
          gridTemplateRows: `48px repeat(${rowCount}, 32px)`,
        }}
      >
        {/* Header: corner cell */}
        <div className="sticky left-0 z-30 bg-muted/50 border-b border-r flex items-center justify-center">
          <span className="text-xs font-medium text-muted-foreground">Time</span>
        </div>

        {/* Header: day labels */}
        {days.map((day, colIdx) => (
          <div
            key={`header-${day}`}
            className="bg-muted/50 border-b flex items-center justify-center font-medium text-sm"
            style={{ gridColumn: colIdx + 2 }}
          >
            {DAY_LABELS[day]}
          </div>
        ))}

        {/* Time labels on the left - one per hour (spans 2 rows of 30min each) */}
        {timeLabels.map((label, i) => {
          const row = i * 2 + 2; // 2 rows per hour, offset by header
          return (
            <div
              key={`time-${label}`}
              className="sticky left-0 z-10 flex items-start justify-end pr-3 pt-1 text-xs text-muted-foreground bg-background border-r"
              style={{
                gridRow: `${row} / span 2`,
                gridColumn: 1,
              }}
            >
              {label}
            </div>
          );
        })}

        {/* Background grid lines for each 30-min row and day column */}
        {Array.from({ length: rowCount }).flatMap((_, rowIdx) =>
          days.map((day, colIdx) => (
            <div
              key={`bg-${day}-${rowIdx}`}
              className={rowIdx % 2 === 1 ? 'border-b border-muted' : 'border-b border-dashed border-muted/50'}
              style={{
                gridRow: rowIdx + 2,
                gridColumn: colIdx + 2,
              }}
            />
          )),
        )}

        {/* Entry cards */}
        {entries.map((entry) => {
          const colIdx = days.indexOf(entry.dayOfWeek);
          if (colIdx === -1) return null;

          if (filterFn && !filterFn(entry)) return null;

          const rowStart = getRowStart(entry.startTime);
          const rowSpan = getRowSpan(entry.startTime, entry.endTime);

          return (
            <div
              key={entry.entryId}
              className="z-10 px-0.5 py-0.5"
              style={{
                gridRow: `${rowStart} / span ${rowSpan}`,
                gridColumn: colIdx + 2,
              }}
            >
              <ScheduleEntryCard
                entry={entry}
                onClick={onEntryClick}
              />
            </div>
          );
        })}
      </div>
    );
  }

  function renderDayList(day: string) {
    const dayEntries = entries
      .filter((e) => e.dayOfWeek === day)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    if (dayEntries.length === 0) {
      return (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No sessions on {DAY_LABELS[day]}
        </p>
      );
    }

    return (
      <div className="space-y-2">
        {dayEntries.map((entry) => {
          if (filterFn && !filterFn(entry)) return null;
          return (
            <div key={entry.entryId} className="flex items-start gap-3">
              <div className="w-16 shrink-0 pt-2 text-xs text-muted-foreground text-right">
                {formatTime(entry.startTime)}
                <br />
                {formatTime(entry.endTime)}
              </div>
              <div className="flex-1">
                <ScheduleEntryCard
                  entry={entry}
                  onClick={onEntryClick}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (activeDays.length === 0) {
    return (
      <p className="py-12 text-center text-muted-foreground">
        No entries in this schedule.
      </p>
    );
  }

  return (
    <>
      {/* Desktop/Tablet: scrollable grid */}
      <div className="hidden md:block">
        <ScrollArea className="w-full">
          <div className="min-w-[700px]">
            {renderGrid(activeDays)}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* Mobile: tabbed day view */}
      <div className="block md:hidden">
        <Tabs value={mobileDay} onValueChange={setMobileDay}>
          <TabsList className="w-full">
            {activeDays.map((day) => (
              <TabsTrigger key={day} value={day} className="flex-1 text-xs">
                {DAY_SHORT_LABELS[day]}
              </TabsTrigger>
            ))}
          </TabsList>
          {activeDays.map((day) => (
            <TabsContent key={day} value={day} className="mt-4">
              {renderDayList(day)}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </>
  );
}
