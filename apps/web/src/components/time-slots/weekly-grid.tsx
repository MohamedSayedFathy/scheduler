'use client';

import { useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/trpc/client';

const DAY_ORDER = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

type DayOfWeek = (typeof DAY_ORDER)[number];

/** Maps JS getDay() index (0=Sun) to our DayOfWeek string. */
const JS_DAY_TO_DOW: Record<number, DayOfWeek> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const DAY_LABELS_SHORT: Record<DayOfWeek, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

export interface TimeSlot {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  startTime: string;
  endTime: string;
}

interface WeeklyGridProps {
  /** Slots for the current visible week (used for rendering). */
  slots: TimeSlot[];
  /** All slots across all weeks (used for bulk-delete counts). */
  allSlots: TimeSlot[];
}

type BulkDeleteAction =
  | { kind: 'single'; slot: TimeSlot }
  | { kind: 'from'; slot: TimeSlot; count: number }
  | { kind: 'until'; slot: TimeSlot; count: number }
  | { kind: 'day'; dow: DayOfWeek; count: number };

function formatTime(t: string): string {
  // Postgres time columns return HH:MM:SS — trim to HH:MM
  return t.slice(0, 5);
}

/**
 * Count slots in `allSlots` with the same dayOfWeek + startTime + endTime and a date >= the given slot's date.
 * Matches what deleteFromSlot does: same day of week, same time window, this and all future dates.
 */
function countSlotsFromSlot(slot: TimeSlot, allSlots: TimeSlot[]): number {
  const dow = dowFromDate(slot.date);
  return allSlots.filter(
    (s) =>
      dowFromDate(s.date) === dow &&
      s.startTime === slot.startTime &&
      s.endTime === slot.endTime &&
      s.date >= slot.date,
  ).length;
}

/**
 * Count slots in `allSlots` with the same dayOfWeek + startTime + endTime and a date <= the given slot's date.
 * Matches what deleteUntilSlot does: same day of week, same time window, this and all past dates.
 */
function countSlotsUntilSlot(slot: TimeSlot, allSlots: TimeSlot[]): number {
  const dow = dowFromDate(slot.date);
  return allSlots.filter(
    (s) =>
      dowFromDate(s.date) === dow &&
      s.startTime === slot.startTime &&
      s.endTime === slot.endTime &&
      s.date <= slot.date,
  ).length;
}

/** Derive the day-of-week name from a YYYY-MM-DD date string. */
function dowFromDate(date: string): DayOfWeek {
  const d = new Date(date + 'T00:00:00');
  return JS_DAY_TO_DOW[d.getDay()] ?? 'monday';
}

function SlotCard({
  slot,
  allSlots,
  onAction,
}: {
  slot: TimeSlot;
  allSlots: TimeSlot[];
  onAction: (action: BulkDeleteAction) => void;
}) {
  const fromCount = countSlotsFromSlot(slot, allSlots);
  const untilCount = countSlotsUntilSlot(slot, allSlots);

  return (
    <div className="group relative flex items-center justify-between rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-sm">
      <span className="font-medium text-foreground tabular-nums">
        {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
            aria-label="Slot actions"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => onAction({ kind: 'single', slot })}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete this slot
          </DropdownMenuItem>
          {fromCount > 1 && (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onAction({ kind: 'from', slot, count: fromCount })}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete this slot on all future dates ({fromCount})
            </DropdownMenuItem>
          )}
          {untilCount > 1 && (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onAction({ kind: 'until', slot, count: untilCount })}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete this slot on all past dates ({untilCount})
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function DayColumn({
  dateStr,
  slots,
  allSlots,
  onAction,
  isToday,
}: {
  dateStr: string;
  slots: TimeSlot[];
  allSlots: TimeSlot[];
  onAction: (action: BulkDeleteAction) => void;
  isToday: boolean;
}) {
  const sorted = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const dow = dowFromDate(dateStr);

  // Header label: "Mon, Apr 7"
  const headerDate = new Date(dateStr + 'T00:00:00');
  const headerLabel = headerDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div
        className={`flex items-center justify-between rounded-t-md border-b px-3 py-2 ${
          isToday ? 'bg-primary/10' : 'bg-muted/50'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-semibold ${isToday ? 'text-primary' : ''}`}>
            {headerLabel}
          </span>
          {isToday && (
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label="Today" />
          )}
        </div>
        {sorted.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label={`${DAY_LABELS[dow]} actions`}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onAction({ kind: 'day', dow, count: sorted.length })}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete all on {DAY_LABELS[dow]}s ({sorted.length} this week)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex flex-col gap-1 px-1 py-1">
        {sorted.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">No slots</p>
        ) : (
          sorted.map((slot) => (
            <SlotCard key={slot.id} slot={slot} allSlots={allSlots} onAction={onAction} />
          ))
        )}
      </div>
    </div>
  );
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Format a Date as YYYY-MM-DD using local time to avoid UTC-offset drift. */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function WeeklyGrid({ slots, allSlots }: WeeklyGridProps) {
  const { toast } = useToast();
  const utils = api.useUtils();

  const [pendingAction, setPendingAction] = useState<BulkDeleteAction | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));

  function goToPrevWeek() {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }

  function goToNextWeek() {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }

  function goToToday() {
    setWeekStart(getMonday(new Date()));
  }

  // Build YYYY-MM-DD strings for each of the 7 days of the visible week
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return toDateStr(d);
  });

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} \u2013 ${weekEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;

  // Today as YYYY-MM-DD for column highlighting
  const todayStr = toDateStr(new Date());

  // Group the week's slots by date
  const slotsByDate = new Map<string, TimeSlot[]>();
  for (const dateStr of weekDates) {
    slotsByDate.set(dateStr, slots.filter((s) => s.date === dateStr));
  }

  // Only show dates that have slots OR are Mon–Fri
  const activeDates = weekDates.filter((dateStr) => {
    const hasSlots = (slotsByDate.get(dateStr)?.length ?? 0) > 0;
    const dow = dowFromDate(dateStr);
    const isWeekday = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(dow);
    return hasSlots || isWeekday;
  });

  // Mutations
  const deleteMutation = api.timeSlots.delete.useMutation({
    onSuccess: () => {
      utils.timeSlots.list.invalidate();
      setPendingAction(null);
      toast({ title: 'Slot deleted' });
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteFromMutation = api.timeSlots.deleteFromSlot.useMutation({
    onSuccess: (deleted) => {
      utils.timeSlots.list.invalidate();
      setPendingAction(null);
      toast({
        title: 'Slots deleted',
        description: `${deleted.length} slot${deleted.length !== 1 ? 's' : ''} removed.`,
      });
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteUntilMutation = api.timeSlots.deleteUntilSlot.useMutation({
    onSuccess: (deleted) => {
      utils.timeSlots.list.invalidate();
      setPendingAction(null);
      toast({
        title: 'Slots deleted',
        description: `${deleted.length} slot${deleted.length !== 1 ? 's' : ''} removed.`,
      });
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteAllOnDayMutation = api.timeSlots.deleteAllOnDay.useMutation({
    onSuccess: (deleted) => {
      utils.timeSlots.list.invalidate();
      setPendingAction(null);
      toast({
        title: 'Day cleared',
        description: `${deleted.length} slot${deleted.length !== 1 ? 's' : ''} removed.`,
      });
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const isMutating =
    deleteMutation.isPending ||
    deleteFromMutation.isPending ||
    deleteUntilMutation.isPending ||
    deleteAllOnDayMutation.isPending;

  function handleConfirm() {
    if (!pendingAction) return;
    switch (pendingAction.kind) {
      case 'single':
        deleteMutation.mutate({ id: pendingAction.slot.id });
        break;
      case 'from':
        deleteFromMutation.mutate({ id: pendingAction.slot.id });
        break;
      case 'until':
        deleteUntilMutation.mutate({ id: pendingAction.slot.id });
        break;
      case 'day':
        deleteAllOnDayMutation.mutate({ dayOfWeek: pendingAction.dow });
        break;
    }
  }

  function getConfirmTitle(): string {
    if (!pendingAction) return '';
    switch (pendingAction.kind) {
      case 'single':
        return 'Delete time slot';
      case 'from':
        return 'Delete slots from here';
      case 'until':
        return 'Delete slots up to here';
      case 'day':
        return `Clear all ${DAY_LABELS[pendingAction.dow]}s`;
    }
  }

  function getConfirmDescription(): string {
    if (!pendingAction) return '';
    switch (pendingAction.kind) {
      case 'single': {
        const d = new Date(pendingAction.slot.date + 'T00:00:00');
        const dateLabel = d.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });
        return `Delete the ${formatTime(pendingAction.slot.startTime)}–${formatTime(pendingAction.slot.endTime)} slot on ${dateLabel}? This cannot be undone.`;
      }
      case 'from': {
        const { count, slot } = pendingAction;
        const d = new Date(slot.date + 'T00:00:00');
        const dateLabel = d.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });
        return `Delete the ${formatTime(slot.startTime)}–${formatTime(slot.endTime)} slot on ${dateLabel} and all future dates? (${count} slot${count !== 1 ? 's' : ''} total) This cannot be undone.`;
      }
      case 'until': {
        const { count, slot } = pendingAction;
        const d = new Date(slot.date + 'T00:00:00');
        const dateLabel = d.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });
        return `Delete the ${formatTime(slot.startTime)}–${formatTime(slot.endTime)} slot on ${dateLabel} and all past dates? (${count} slot${count !== 1 ? 's' : ''} total) This cannot be undone.`;
      }
      case 'day': {
        const { count, dow } = pendingAction;
        return `Delete all slots on every ${DAY_LABELS[dow]} across all weeks (${count} this week)? This cannot be undone.`;
      }
    }
  }

  const weekNav = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={goToPrevWeek}
          aria-label="Previous week"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={goToToday}>
          Today
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={goToNextWeek}
          aria-label="Next week"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <h3 className="text-sm font-medium">{weekLabel}</h3>
    </div>
  );

  if (allSlots.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {weekNav}
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <CalendarDays className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium">No time slots configured</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use the Generate button above to create your schedule template.
          </p>
        </div>
      </div>
    );
  }

  // Short label for a date: "Mon 7"
  function mobileTabLabel(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    const dow = dowFromDate(dateStr);
    return `${DAY_LABELS_SHORT[dow]} ${d.getDate()}`;
  }

  return (
    <>
      {weekNav}

      {/* Desktop grid — hidden on mobile */}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <div
          className="grid min-w-[600px]"
          style={{ gridTemplateColumns: `repeat(${activeDates.length}, minmax(0, 1fr))` }}
        >
          {activeDates.map((dateStr) => (
            <div key={dateStr} className="border-r last:border-r-0">
              <DayColumn
                dateStr={dateStr}
                slots={slotsByDate.get(dateStr) ?? []}
                allSlots={allSlots}
                onAction={setPendingAction}
                isToday={dateStr === todayStr}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Mobile tabs — one day at a time */}
      <div className="block md:hidden">
        <Tabs defaultValue={activeDates[0]}>
          <TabsList className="flex w-full">
            {activeDates.map((dateStr) => {
              const isToday = dateStr === todayStr;
              const daySlots = slotsByDate.get(dateStr) ?? [];
              return (
                <TabsTrigger
                  key={dateStr}
                  value={dateStr}
                  className={`flex-1 text-xs ${isToday ? 'font-bold text-primary' : ''}`}
                >
                  {mobileTabLabel(dateStr)}
                  {daySlots.length > 0 && (
                    <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {daySlots.length}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {activeDates.map((dateStr) => (
            <TabsContent key={dateStr} value={dateStr} className="mt-3 rounded-lg border">
              <DayColumn
                dateStr={dateStr}
                slots={slotsByDate.get(dateStr) ?? []}
                allSlots={allSlots}
                onAction={setPendingAction}
                isToday={dateStr === todayStr}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <ConfirmDialog
        open={!!pendingAction}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        title={getConfirmTitle()}
        description={getConfirmDescription()}
        onConfirm={handleConfirm}
        loading={isMutating}
        destructive
      />
    </>
  );
}
