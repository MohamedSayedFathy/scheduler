'use client';

import { useMemo, useState } from 'react';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type Conflict } from '@/lib/schedules/conflicts';

import { EventCard, type ScheduleEventData } from './event-card';
import { ScheduleEntryCard, type ScheduleEntryData } from './schedule-entry-card';

interface TimetableGridProps {
  entries: ScheduleEntryData[];
  onEntryClick: (entry: ScheduleEntryData) => void;
  filterFn?: (entry: ScheduleEntryData) => boolean;
  conflictedEntryIds?: Set<string>;
  conflictsByEntryId?: Map<string, Conflict[]>;
  onEntryDrop?: (entry: ScheduleEntryData, targetDayOfWeek: string, targetStartTime: string) => void;
  onEmptyCellClick?: (dayOfWeek: string, startMinutes: number) => void;
  events?: ScheduleEventData[];
  onEventClick?: (event: ScheduleEventData) => void;
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

function minutesToTime(minutes: number): string {
  return minutesToLabel(minutes);
}

function formatTime(time: string): string {
  return time.slice(0, 5);
}

interface DraggableCardProps {
  entry: ScheduleEntryData;
  onClick: (entry: ScheduleEntryData) => void;
  conflicted?: boolean;
  conflictMessages?: string[];
}

function DraggableCard({ entry, onClick, conflicted, conflictMessages }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: entry.entryId,
    data: { entry },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 50 : undefined }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <ScheduleEntryCard
        entry={entry}
        onClick={onClick}
        conflicted={conflicted}
        conflictMessages={conflictMessages}
      />
    </div>
  );
}

interface DroppableCellProps {
  dayOfWeek: string;
  startMinutes: number;
  rowIdx: number;
  colIdx: number;
  rowCount: number;
  onClick?: (dayOfWeek: string, startMinutes: number) => void;
}

function DroppableCell({ dayOfWeek, startMinutes, rowIdx, colIdx, onClick }: DroppableCellProps) {
  const droppableId = `${dayOfWeek}_${startMinutes}`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  const isInteractive = !!onClick;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.(dayOfWeek, startMinutes);
    }
  }

  return (
    <div
      ref={setNodeRef}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={isInteractive ? `Add entry at ${dayOfWeek} ${minutesToLabel(startMinutes)}` : undefined}
      className={`${rowIdx % 2 === 1 ? 'border-b border-muted' : 'border-b border-dashed border-muted/50'} ${isInteractive ? 'cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring' : ''}`}
      style={{
        gridRow: rowIdx + 2,
        gridColumn: colIdx + 2,
        backgroundColor: isOver ? 'hsl(var(--primary) / 0.08)' : undefined,
        transition: 'background-color 0.1s',
      }}
      onClick={isInteractive ? () => onClick(dayOfWeek, startMinutes) : undefined}
      onKeyDown={isInteractive ? handleKeyDown : undefined}
    />
  );
}

/**
 * Builds a row-based grid. Each row represents a 30-minute interval.
 * Entries span the correct number of rows based on their start/end times.
 */
export function TimetableGrid({
  entries,
  onEntryClick,
  filterFn,
  conflictedEntryIds,
  conflictsByEntryId,
  onEntryDrop,
  onEmptyCellClick,
  events = [],
  onEventClick,
}: TimetableGridProps) {
  const activeDays = useMemo(() => {
    const daySet = new Set(entries.map((e) => e.dayOfWeek));
    return DAY_ORDER.filter((d) => daySet.has(d));
  }, [entries]);

  const SLOT_MINUTES = 30;

  const { timeLabels, minTime, rowCount, rowMinutes } = useMemo(() => {
    if (entries.length === 0) {
      return { timeLabels: [] as string[], minTime: 480, rowCount: 0, rowMinutes: [] as number[] };
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
    const minutes: number[] = [];
    for (let i = 0; i < rows; i++) {
      minutes.push(min + i * SLOT_MINUTES);
    }

    return { timeLabels: labels, minTime: min, rowCount: rows, rowMinutes: minutes };
  }, [entries]);

  const [mobileDay, setMobileDay] = useState(activeDays[0] ?? 'monday');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function getRowStart(startTime: string): number {
    const startMin = timeToMinutes(startTime);
    return Math.round((startMin - minTime) / SLOT_MINUTES) + 2;
  }

  function getRowSpan(startTime: string, endTime: string): number {
    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    return Math.round((endMin - startMin) / SLOT_MINUTES);
  }

  // Assign each entry a "lane" within its overlap cluster so overlapping
  // entries render side-by-side instead of stacking on top of each other.
  const laneMap = useMemo(() => {
    const map = new Map<string, { lane: number; totalLanes: number }>();
    const byDay = new Map<string, ScheduleEntryData[]>();
    for (const e of entries) {
      if (filterFn && !filterFn(e)) continue;
      const list = byDay.get(e.dayOfWeek) ?? [];
      list.push(e);
      byDay.set(e.dayOfWeek, list);
    }

    for (const dayEntries of byDay.values()) {
      const sorted = [...dayEntries].sort(
        (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
      );
      let cluster: ScheduleEntryData[] = [];
      let clusterEnd = -1;
      const flush = () => {
        if (cluster.length === 0) return;
        const lanes: number[] = [];
        const assignments: { id: string; lane: number }[] = [];
        for (const e of cluster) {
          const s = timeToMinutes(e.startTime);
          const en = timeToMinutes(e.endTime);
          let laneIdx = lanes.findIndex((end) => end <= s);
          if (laneIdx === -1) {
            laneIdx = lanes.length;
            lanes.push(en);
          } else {
            lanes[laneIdx] = en;
          }
          assignments.push({ id: e.entryId, lane: laneIdx });
        }
        const totalLanes = lanes.length;
        for (const a of assignments) {
          map.set(a.id, { lane: a.lane, totalLanes });
        }
      };
      for (const e of sorted) {
        const s = timeToMinutes(e.startTime);
        const en = timeToMinutes(e.endTime);
        if (cluster.length > 0 && s < clusterEnd) {
          cluster.push(e);
          clusterEnd = Math.max(clusterEnd, en);
        } else {
          flush();
          cluster = [e];
          clusterEnd = en;
        }
      }
      flush();
    }

    return map;
  }, [entries, filterFn]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ScheduleEventData[]>();
    for (const ev of events) {
      const list = map.get(ev.dayOfWeek) ?? [];
      list.push(ev);
      map.set(ev.dayOfWeek, list);
    }
    return map;
  }, [events]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !onEntryDrop) return;

    const entry = (active.data.current as { entry: ScheduleEntryData } | undefined)?.entry;
    if (!entry) return;

    const overId = String(over.id);
    const parts = overId.split('_');
    if (parts.length < 2) return;

    // The droppable id is `${dayOfWeek}_${startMinutes}` where dayOfWeek may contain underscores
    // Since dayOfWeek values are single words like 'monday', split on last '_' for startMinutes
    const lastUnderscore = overId.lastIndexOf('_');
    const dayOfWeek = overId.slice(0, lastUnderscore);
    const startMinutesStr = overId.slice(lastUnderscore + 1);
    const startMinutes = parseInt(startMinutesStr, 10);
    if (isNaN(startMinutes)) return;

    const targetStartTime = minutesToTime(startMinutes);
    onEntryDrop(entry, dayOfWeek, targetStartTime);
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
          const row = i * 2 + 2;
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

        {/* Droppable background cells for each 30-min row and day column */}
        {Array.from({ length: rowCount }).flatMap((_, rowIdx) =>
          days.map((day, colIdx) => {
            const startMins = rowMinutes[rowIdx] ?? (minTime + rowIdx * SLOT_MINUTES);
            return (
              <DroppableCell
                key={`bg-${day}-${rowIdx}`}
                dayOfWeek={day}
                startMinutes={startMins}
                rowIdx={rowIdx}
                colIdx={colIdx}
                rowCount={rowCount}
                onClick={onEmptyCellClick}
              />
            );
          }),
        )}

        {/* Entry cards */}
        {entries.map((entry) => {
          const colIdx = days.indexOf(entry.dayOfWeek);
          if (colIdx === -1) return null;

          if (filterFn && !filterFn(entry)) return null;

          const rowStart = getRowStart(entry.startTime);
          const rowSpan = getRowSpan(entry.startTime, entry.endTime);
          const isConflicted = conflictedEntryIds?.has(entry.entryId) ?? false;
          const messages = conflictsByEntryId?.get(entry.entryId)?.map((c) => c.message);

          const laneInfo = laneMap.get(entry.entryId);
          const totalLanes = laneInfo?.totalLanes ?? 1;
          const laneIdx = laneInfo?.lane ?? 0;
          const widthPct = 100 / totalLanes;
          const leftPct = laneIdx * widthPct;

          return (
            <div
              key={entry.entryId}
              className="z-10 px-0.5 py-0.5"
              style={{
                gridRow: `${rowStart} / span ${rowSpan}`,
                gridColumn: colIdx + 2,
                width: `${widthPct}%`,
                marginLeft: `${leftPct}%`,
              }}
            >
              <DraggableCard
                entry={entry}
                onClick={onEntryClick}
                conflicted={isConflicted}
                conflictMessages={messages}
              />
            </div>
          );
        })}

        {/* Per-day events overlay */}
        {days.map((day, colIdx) => {
          const dayEvents = eventsByDay.get(day) ?? [];
          if (dayEvents.length === 0) return null;
          return (
            <div
              key={`events-${day}`}
              className="pointer-events-none relative"
              style={{ gridRow: `2 / span ${rowCount}`, gridColumn: colIdx + 2, zIndex: 15 }}
            >
              {dayEvents.map((ev) => {
                const startMin = timeToMinutes(ev.startTime);
                const endMin = timeToMinutes(ev.endTime);
                const top = ((startMin - minTime) / SLOT_MINUTES) * 32;
                const height = Math.max(20, ((endMin - startMin) / SLOT_MINUTES) * 32);
                return (
                  <div
                    key={ev.id}
                    className="pointer-events-auto absolute left-0.5 right-0.5"
                    style={{ top, height }}
                  >
                    <EventCard event={ev} onClick={onEventClick ?? (() => {})} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  function renderDayList(day: string) {
    const dayEntries = entries
      .filter((e) => e.dayOfWeek === day && (!filterFn || filterFn(e)))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    const dayEvents = (eventsByDay.get(day) ?? [])
      .slice()
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    if (dayEntries.length === 0 && dayEvents.length === 0) {
      return (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No sessions on {DAY_LABELS[day]}
        </p>
      );
    }

    type EntryItem = { kind: 'entry'; data: ScheduleEntryData };
    type EventItem = { kind: 'event'; data: ScheduleEventData };
    const combined: Array<EntryItem | EventItem> = [
      ...dayEntries.map((e): EntryItem => ({ kind: 'entry', data: e })),
      ...dayEvents.map((e): EventItem => ({ kind: 'event', data: e })),
    ].sort((a, b) => timeToMinutes(a.data.startTime) - timeToMinutes(b.data.startTime));

    return (
      <div className="space-y-2">
        {combined.map((item) => {
          if (item.kind === 'entry') {
            const entry = item.data;
            const isConflicted = conflictedEntryIds?.has(entry.entryId) ?? false;
            const messages = conflictsByEntryId?.get(entry.entryId)?.map((c) => c.message);
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
                    conflicted={isConflicted}
                    conflictMessages={messages}
                  />
                </div>
              </div>
            );
          }
          const ev = item.data;
          return (
            <div key={ev.id} className="flex items-start gap-3">
              <div className="w-16 shrink-0 pt-2 text-xs text-muted-foreground text-right">
                {formatTime(ev.startTime)}
                <br />
                {formatTime(ev.endTime)}
              </div>
              <div className="flex-1">
                <EventCard event={ev} onClick={onEventClick ?? (() => {})} />
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
      {/* Desktop/Tablet: scrollable grid with DnD */}
      <div className="hidden md:block">
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <ScrollArea className="w-full">
            <div className="min-w-[700px]">
              {renderGrid(activeDays)}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </DndContext>
      </div>

      {/* Mobile: tabbed day view — no DnD, cards use onClick */}
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
