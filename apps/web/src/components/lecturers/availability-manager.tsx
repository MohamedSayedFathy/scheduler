'use client';

import { useState } from 'react';
import { Info, Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { api } from '@/lib/trpc/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORDERED_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

type DayOfWeek = (typeof ORDERED_DAYS)[number];

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

const DAY_FULL_LABELS: Record<DayOfWeek, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format an ISO date string ("YYYY-MM-DD") into a human-readable label. */
function formatDate(isoDate: string): string {
  // Parse as UTC noon to avoid timezone-shift display issues.
  const date = new Date(`${isoDate}T12:00:00Z`);
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AvailabilityManagerProps {
  userId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AvailabilityManager({ userId }: AvailabilityManagerProps) {
  const { toast } = useToast();
  const utils = api.useUtils();

  // Form state for the "add date exception" section
  const [newDate, setNewDate] = useState('');
  const [newReason, setNewReason] = useState('');

  // Track which day toggle buttons are in-flight so we can show a spinner
  const [pendingDay, setPendingDay] = useState<DayOfWeek | null>(null);

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  const { data, isLoading } = api.lecturers.getExceptions.useQuery({ userId });

  // ---------------------------------------------------------------------------
  // Mutations — day exceptions
  // ---------------------------------------------------------------------------

  const addDayException = api.lecturers.addDayException.useMutation({
    onSuccess: (_data, variables) => {
      utils.lecturers.getExceptions.invalidate({ userId });
      setPendingDay(null);
      toast({
        title: 'Day blocked',
        description: `${DAY_FULL_LABELS[variables.dayOfWeek as DayOfWeek]} has been marked as unavailable.`,
      });
    },
    onError: (error) => {
      setPendingDay(null);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const removeDayException = api.lecturers.removeDayException.useMutation({
    onSuccess: () => {
      utils.lecturers.getExceptions.invalidate({ userId });
      setPendingDay(null);
      toast({ title: 'Day unblocked', description: 'The recurring day block has been removed.' });
    },
    onError: (error) => {
      setPendingDay(null);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  function handleDayToggle(day: DayOfWeek) {
    const existing = data?.dayExceptions.find((e) => e.dayOfWeek === day);
    setPendingDay(day);
    if (existing) {
      removeDayException.mutate({ id: existing.id });
    } else {
      addDayException.mutate({ userId, dayOfWeek: day });
    }
  }

  // ---------------------------------------------------------------------------
  // Mutations — date exceptions
  // ---------------------------------------------------------------------------

  const addDateException = api.lecturers.addDateException.useMutation({
    onSuccess: () => {
      utils.lecturers.getExceptions.invalidate({ userId });
      setNewDate('');
      setNewReason('');
      toast({ title: 'Date added', description: 'The unavailable date has been recorded.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const removeDateException = api.lecturers.removeDateException.useMutation({
    onSuccess: () => {
      utils.lecturers.getExceptions.invalidate({ userId });
      toast({ title: 'Date removed', description: 'The date exception has been removed.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  function handleAddDate(e: React.FormEvent) {
    e.preventDefault();
    if (!newDate) return;
    addDateException.mutate({ userId, date: newDate, reason: newReason || undefined });
  }

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="space-y-6 pt-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
          <div className="flex gap-2 pt-1">
            {ORDERED_DAYS.map((d) => (
              <Skeleton key={d} className="h-9 w-12 rounded-md" />
            ))}
          </div>
        </div>
        <Skeleton className="h-px w-full" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const blockedDays = new Set((data?.dayExceptions ?? []).map((e) => e.dayOfWeek as DayOfWeek));

  const sortedDateExceptions = [...(data?.dateExceptions ?? [])].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const isAddingDate = addDateException.isPending;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-8 pt-4">

      {/* Info banner */}
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Lecturers are available for all time slots by default. Add exceptions below to mark
          specific times when this lecturer cannot teach.
        </span>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 1: Recurring weekly day blocks                              */}
      {/* ------------------------------------------------------------------ */}

      <section aria-labelledby="day-exceptions-heading">
        <div className="mb-3 space-y-1">
          <h3 id="day-exceptions-heading" className="text-sm font-semibold leading-none">
            Weekly Unavailable Days
          </h3>
          <p className="text-xs text-muted-foreground">
            Days this lecturer is never available, every week.
          </p>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Toggle unavailable days">
          {ORDERED_DAYS.map((day) => {
            const isBlocked = blockedDays.has(day);
            const isPending = pendingDay === day;

            return (
              <button
                key={day}
                type="button"
                disabled={isPending || (pendingDay !== null && pendingDay !== day)}
                aria-pressed={isBlocked}
                aria-label={`${DAY_FULL_LABELS[day]} — ${isBlocked ? 'blocked, click to unblock' : 'available, click to block'}`}
                onClick={() => handleDayToggle(day)}
                className={cn(
                  'relative inline-flex h-9 min-w-[3rem] items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                  'disabled:pointer-events-none disabled:opacity-50',
                  isBlocked
                    ? 'border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : 'border-input bg-background text-foreground hover:bg-muted',
                )}
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    {DAY_LABELS[day]}
                    {isBlocked && (
                      <span className="ml-1 text-xs opacity-75" aria-hidden>
                        ✕
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <Separator />

      {/* ------------------------------------------------------------------ */}
      {/* Section 2: Specific date exceptions                                 */}
      {/* ------------------------------------------------------------------ */}

      <section aria-labelledby="date-exceptions-heading">
        <div className="mb-3 space-y-1">
          <h3 id="date-exceptions-heading" className="text-sm font-semibold leading-none">
            Specific Unavailable Dates
          </h3>
          <p className="text-xs text-muted-foreground">
            Individual dates when this lecturer cannot attend.
          </p>
        </div>

        {/* Add date form */}
        <form
          onSubmit={handleAddDate}
          className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end"
          aria-label="Add unavailable date"
        >
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              required
              aria-label="Unavailable date"
              className="w-full sm:w-40"
            />
            <Input
              type="text"
              placeholder="Reason (optional)"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              aria-label="Reason"
              className="flex-1"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={!newDate || isAddingDate}
            className="shrink-0"
          >
            {isAddingDate ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              'Add date'
            )}
          </Button>
        </form>

        {/* Existing date exception list */}
        {sortedDateExceptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No specific dates added yet.
          </p>
        ) : (
          <ul className="space-y-2" aria-label="Unavailable dates">
            {sortedDateExceptions.map((exception) => {
              const isRemoving =
                removeDateException.isPending &&
                removeDateException.variables?.id === exception.id;

              return (
                <li
                  key={exception.id}
                  className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{formatDate(exception.date)}</p>
                    {exception.reason && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {exception.reason}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isRemoving}
                    aria-label={`Remove unavailable date ${formatDate(exception.date)}`}
                    onClick={() => removeDateException.mutate({ id: exception.id })}
                    className="ml-2 h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    {isRemoving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
