'use client';

import { useWatch } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

type DayValue = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

const ALL_DAYS: { value: DayValue; label: string }[] = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

const SLOT_DURATIONS = [
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '1 hr' },
  { value: '90', label: '1.5 hr' },
  { value: '120', label: '2 hr' },
] as const;

const BREAK_DURATIONS = [
  { value: '0', label: 'No break' },
  { value: '5', label: '5 min' },
  { value: '10', label: '10 min' },
  { value: '15', label: '15 min' },
  { value: '20', label: '20 min' },
  { value: '30', label: '30 min' },
] as const;

/** Returns YYYY-MM-DD string for the next Monday on or after today. */
function getNextMonday(): string {
  const d = new Date();
  const day = d.getDay(); // 0 = Sun, 1 = Mon, …
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  return d.toISOString().split('T')[0]!;
}

/** Returns YYYY-MM-DD string that is approximately 3 months after the given date. */
function threeMonthsLater(startDate: string): string {
  const d = new Date(startDate + 'T00:00:00');
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().split('T')[0]!;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const bulkCreateSchema = z
  .object({
    startDate: z.string().regex(DATE_PATTERN, 'Required (YYYY-MM-DD)'),
    endDate: z.string().regex(DATE_PATTERN, 'Required (YYYY-MM-DD)'),
    days: z
      .array(
        z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
      )
      .min(1, 'Select at least one day'),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM format'),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM format'),
    intervalMinutes: z.coerce.number().int().min(15).max(240),
    breakMinutes: z.coerce.number().int().min(0).max(60),
  })
  .refine(
    (data) => {
      if (!DATE_PATTERN.test(data.startDate) || !DATE_PATTERN.test(data.endDate)) return true;
      return data.endDate >= data.startDate;
    },
    { message: 'End date must be on or after start date', path: ['endDate'] },
  )
  .refine(
    (data) => {
      const [sh, sm] = data.startTime.split(':').map(Number);
      const [eh, em] = data.endTime.split(':').map(Number);
      const start = (sh ?? 0) * 60 + (sm ?? 0);
      const end = (eh ?? 0) * 60 + (em ?? 0);
      return end > start;
    },
    { message: 'End time must be after start time', path: ['endTime'] },
  );

type BulkCreateFormValues = z.infer<typeof bulkCreateSchema>;

interface BulkCreateFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: {
    startDate: string;
    endDate: string;
    days: DayValue[];
    startTime: string;
    endTime: string;
    intervalMinutes: number;
    breakMinutes: number;
  }) => void;
  loading?: boolean;
}

const DAY_INDEX_MAP: Record<number, string> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

function countMatchingDates(startDate: string, endDate: string, days: string[]): number {
  if (!DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate)) return 0;
  if (endDate < startDate) return 0;
  let count = 0;
  const current = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (current <= end) {
    const dayName = DAY_INDEX_MAP[current.getDay()];
    if (dayName !== undefined && days.includes(dayName)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

function computeSlotsPerDay(
  startTime: string,
  endTime: string,
  intervalMinutes: number,
  breakMinutes: number,
): number {
  const startParts = startTime.split(':').map(Number);
  const endParts = endTime.split(':').map(Number);
  const startMin = (startParts[0] ?? 0) * 60 + (startParts[1] ?? 0);
  const endMin = (endParts[0] ?? 0) * 60 + (endParts[1] ?? 0);

  if (endMin <= startMin || intervalMinutes <= 0) return 0;

  let count = 0;
  let cursor = startMin;
  while (cursor + intervalMinutes <= endMin) {
    count++;
    cursor += intervalMinutes + breakMinutes;
  }
  return count;
}

const DEFAULT_START = getNextMonday();

export function BulkCreateForm({
  open,
  onOpenChange,
  onSubmit,
  loading = false,
}: BulkCreateFormProps) {
  const form = useForm<BulkCreateFormValues>({
    resolver: zodResolver(bulkCreateSchema),
    defaultValues: {
      startDate: DEFAULT_START,
      endDate: threeMonthsLater(DEFAULT_START),
      days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      startTime: '08:00',
      endTime: '18:00',
      intervalMinutes: 60,
      breakMinutes: 0,
    },
  });

  const watchedValues = useWatch({ control: form.control });

  const { matchingDays, slotsPerDay, totalSlots } = (() => {
    const { startDate, endDate, startTime, endTime, intervalMinutes, breakMinutes, days } =
      watchedValues;
    if (
      !startDate ||
      !endDate ||
      !startTime ||
      !endTime ||
      intervalMinutes === undefined ||
      breakMinutes === undefined ||
      !days
    ) {
      return { matchingDays: 0, slotsPerDay: 0, totalSlots: 0 };
    }
    const perDay = computeSlotsPerDay(
      startTime,
      endTime,
      Number(intervalMinutes),
      Number(breakMinutes),
    );
    const matched = countMatchingDates(startDate, endDate, days);
    return { matchingDays: matched, slotsPerDay: perDay, totalSlots: matched * perDay };
  })();

  function handleSubmit(values: BulkCreateFormValues) {
    onSubmit({
      startDate: values.startDate,
      endDate: values.endDate,
      days: values.days as DayValue[],
      startTime: values.startTime,
      endTime: values.endTime,
      intervalMinutes: values.intervalMinutes,
      breakMinutes: values.breakMinutes,
    });
  }

  function handleOpenChange(next: boolean) {
    if (!next) form.reset();
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate Time Slots</DialogTitle>
          <DialogDescription>
            Choose a date range and schedule template. Slots will be generated for every matching
            day within the range.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
            {/* Date range */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Time range */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Duration + break */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="intervalMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slot duration</FormLabel>
                    <Select
                      onValueChange={(val) => field.onChange(Number(val))}
                      value={String(field.value)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SLOT_DURATIONS.map((d) => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="breakMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Break between slots</FormLabel>
                    <Select
                      onValueChange={(val) => field.onChange(Number(val))}
                      value={String(field.value)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BREAK_DURATIONS.map((d) => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Active days */}
            <FormField
              control={form.control}
              name="days"
              render={() => (
                <FormItem>
                  <FormLabel>Active days</FormLabel>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {ALL_DAYS.map((day) => (
                      <FormField
                        key={day.value}
                        control={form.control}
                        name="days"
                        render={({ field }) => {
                          const checked = field.value.includes(day.value);
                          return (
                            <FormItem
                              key={day.value}
                              className="flex flex-row items-center gap-2 space-y-0"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(val) => {
                                    if (val) {
                                      field.onChange([...field.value, day.value]);
                                    } else {
                                      field.onChange(
                                        field.value.filter((v: string) => v !== day.value),
                                      );
                                    }
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="cursor-pointer font-normal">
                                {day.label}
                              </FormLabel>
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            {/* Preview */}
            <div className="rounded-md bg-muted/50 px-4 py-3 text-sm">
              {totalSlots > 0 ? (
                <span>
                  This will generate{' '}
                  <span className="font-semibold text-foreground">{totalSlots} slot</span>
                  {totalSlots !== 1 ? 's' : ''} across{' '}
                  <span className="font-semibold text-foreground">{matchingDays} day</span>
                  {matchingDays !== 1 ? 's' : ''} ({slotsPerDay} slot
                  {slotsPerDay !== 1 ? 's' : ''} per day).
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Adjust the settings above to see a preview.
                </span>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading || totalSlots === 0}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate {totalSlots > 0 ? `${totalSlots} slots` : 'slots'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
