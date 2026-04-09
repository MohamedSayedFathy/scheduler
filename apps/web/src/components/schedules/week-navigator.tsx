'use client';

import { Button } from '@/components/ui/button';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

export interface WeekInfo {
  /** ISO week number (1-53) */
  isoWeek: number;
  /** Full year (e.g. 2026) */
  year: number;
  /** Human-readable label, e.g. "Week 3: Apr 27 – May 1, 2026" */
  label: string;
  /** Monday of that week (YYYY-MM-DD) */
  weekStart: string;
  /** Sunday of that week (YYYY-MM-DD) */
  weekEnd: string;
}

/**
 * Returns the ISO week number (1–53) and ISO week year for a given date string.
 * Uses the standard ISO 8601 definition: weeks start on Monday.
 */
export function getIsoWeekInfo(dateStr: string): { isoWeek: number; year: number } {
  const d = new Date(dateStr + 'T00:00:00Z');
  // Shift to Thursday in the current week (ISO week is determined by Thursday)
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() === 0 ? 7 : d.getUTCDay()));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const isoWeek = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { isoWeek, year: thursday.getUTCFullYear() };
}

/** Returns Monday of the ISO week containing the given date string. */
function getMondayOfWeek(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0=Sun,1=Mon,...,6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  return monday;
}

function formatDateRange(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };
  const yearOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };

  const start = monday.toLocaleDateString('en-GB', opts);
  const end = sunday.toLocaleDateString('en-GB', yearOpts);
  return `${start} – ${end}`;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Builds sorted WeekInfo objects from a set of ISO date strings.
 * Weeks are sorted chronologically.
 */
export function buildWeekList(dates: string[]): WeekInfo[] {
  const weekMap = new Map<string, WeekInfo>();

  for (const dateStr of dates) {
    const { isoWeek, year } = getIsoWeekInfo(dateStr);
    const key = `${year}-W${String(isoWeek).padStart(2, '0')}`;
    if (!weekMap.has(key)) {
      const monday = getMondayOfWeek(dateStr);
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      const dateRange = formatDateRange(monday);
      weekMap.set(key, {
        isoWeek,
        year,
        label: `Week ${isoWeek}: ${dateRange}`,
        weekStart: toISODate(monday),
        weekEnd: toISODate(sunday),
      });
    }
  }

  return Array.from(weekMap.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.isoWeek - b.isoWeek;
  });
}

/**
 * Returns the ISO week key "YYYY-WWW" for a given date string,
 * used to match entries to the currently selected week.
 */
export function isoWeekKey(dateStr: string): string {
  const { isoWeek, year } = getIsoWeekInfo(dateStr);
  return `${year}-W${String(isoWeek).padStart(2, '0')}`;
}

interface WeekNavigatorProps {
  weeks: WeekInfo[];
  selectedWeekKey: string;
  onWeekChange: (weekKey: string) => void;
}

export function WeekNavigator({ weeks, selectedWeekKey, onWeekChange }: WeekNavigatorProps) {
  const currentIndex = weeks.findIndex(
    (w) => `${w.year}-W${String(w.isoWeek).padStart(2, '0')}` === selectedWeekKey,
  );

  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < weeks.length - 1;

  function goToPrev() {
    if (!canGoPrev) return;
    const prev = weeks[currentIndex - 1];
    if (prev) {
      onWeekChange(`${prev.year}-W${String(prev.isoWeek).padStart(2, '0')}`);
    }
  }

  function goToNext() {
    if (!canGoNext) return;
    const next = weeks[currentIndex + 1];
    if (next) {
      onWeekChange(`${next.year}-W${String(next.isoWeek).padStart(2, '0')}`);
    }
  }

  // Find if today falls in any available week, for the "Today" button
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayWeekKey = isoWeekKey(todayStr);
  const todayWeekExists = weeks.some(
    (w) => `${w.year}-W${String(w.isoWeek).padStart(2, '0')}` === todayWeekKey,
  );
  const isOnTodayWeek = selectedWeekKey === todayWeekKey;

  const currentWeek = weeks[currentIndex];
  const label = currentWeek?.label ?? 'No weeks available';

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={goToPrev}
        disabled={!canGoPrev}
        aria-label="Previous week"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium" aria-live="polite" aria-atomic="true">
          {label}
        </span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={goToNext}
        disabled={!canGoNext}
        aria-label="Next week"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {todayWeekExists && !isOnTodayWeek && (
        <Button
          variant="outline"
          size="sm"
          className="ml-1 h-7 shrink-0 text-xs"
          onClick={() => onWeekChange(todayWeekKey)}
          aria-label="Jump to current week"
        >
          Today
        </Button>
      )}

      {weeks.length > 1 && (
        <span className="ml-1 shrink-0 text-xs text-muted-foreground">
          {currentIndex + 1}/{weeks.length}
        </span>
      )}
    </div>
  );
}
