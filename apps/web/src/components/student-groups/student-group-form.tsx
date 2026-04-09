'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
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

const studentGroupFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  year: z.coerce.number().int().min(1).optional().or(z.literal('')),
  size: z.coerce.number().int().min(1, 'Size must be at least 1'),
});

type StudentGroupFormValues = z.infer<typeof studentGroupFormSchema>;

interface StudentGroupFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { name: string; year?: number; size: number }) => void;
  defaultValues?: {
    name: string;
    year?: number | null;
    size: number;
  };
  loading?: boolean;
}

export function StudentGroupForm({
  open,
  onOpenChange,
  onSubmit,
  defaultValues,
  loading = false,
}: StudentGroupFormProps) {
  const isEditing = !!defaultValues;

  const form = useForm<StudentGroupFormValues>({
    resolver: zodResolver(studentGroupFormSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      year: defaultValues?.year ?? '',
      size: defaultValues?.size ?? 30,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: defaultValues?.name ?? '',
        year: defaultValues?.year ?? '',
        size: defaultValues?.size ?? 30,
      });
    }
  }, [open, defaultValues, form]);

  function handleSubmit(values: StudentGroupFormValues) {
    onSubmit({
      name: values.name,
      year: typeof values.year === 'number' ? values.year : undefined,
      size: values.size,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Student Group' : 'Add Student Group'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the student group details below.'
              : 'Fill in the details to create a new student group.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. CS Year 1 Group A" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="year"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Year</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      placeholder="e.g. 1"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="size"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Size</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Save Changes' : 'Create Group'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
