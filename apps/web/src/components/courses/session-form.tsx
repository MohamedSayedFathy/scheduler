'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
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

const sessionFormSchema = z.object({
  sessionType: z.enum(['lecture', 'tutorial', 'lab']),
  durationSlots: z.coerce.number().int().min(1, 'Must be at least 1'),
  frequencyPerWeek: z.coerce.number().int().min(1, 'Must be at least 1'),
});

type SessionFormValues = z.infer<typeof sessionFormSchema>;

const sessionTypeLabels: Record<string, string> = {
  lecture: 'Lecture',
  tutorial: 'Tutorial',
  lab: 'Lab',
};

interface SessionFormProps {
  onSubmit: (values: {
    sessionType: 'lecture' | 'tutorial' | 'lab';
    durationSlots: number;
    frequencyPerWeek: number;
  }) => void;
  loading?: boolean;
}

export function SessionForm({ onSubmit, loading = false }: SessionFormProps) {
  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: {
      sessionType: 'lecture',
      durationSlots: 1,
      frequencyPerWeek: 1,
    },
  });

  function handleSubmit(values: SessionFormValues) {
    onSubmit(values);
    form.reset();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex items-end gap-3">
        <FormField
          control={form.control}
          name="sessionType"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>Type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.entries(sessionTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
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
          name="durationSlots"
          render={({ field }) => (
            <FormItem className="w-24">
              <FormLabel>Duration</FormLabel>
              <FormControl>
                <Input type="number" min={1} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="frequencyPerWeek"
          render={({ field }) => (
            <FormItem className="w-24">
              <FormLabel>Per Week</FormLabel>
              <FormControl>
                <Input type="number" min={1} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="sm" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Add
        </Button>
      </form>
    </Form>
  );
}
