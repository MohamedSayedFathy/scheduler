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
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/trpc/client';
import { type LecturerRow } from '@/components/lecturers/columns';

const lecturerFormSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(255),
  lastName: z.string().min(1, 'Last name is required').max(255),
  email: z.string().min(1, 'Email is required').email('Must be a valid email address'),
});

type LecturerFormValues = z.infer<typeof lecturerFormSchema>;

interface LecturerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: LecturerRow;
}

export function LecturerForm({ open, onOpenChange, defaultValues }: LecturerFormProps) {
  const { toast } = useToast();
  const utils = api.useUtils();
  const isEditing = !!defaultValues;

  const form = useForm<LecturerFormValues>({
    resolver: zodResolver(lecturerFormSchema),
    defaultValues: {
      firstName: defaultValues?.firstName ?? '',
      lastName: defaultValues?.lastName ?? '',
      email: defaultValues?.email ?? '',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        firstName: defaultValues?.firstName ?? '',
        lastName: defaultValues?.lastName ?? '',
        email: defaultValues?.email ?? '',
      });
    }
  }, [open, defaultValues, form]);

  const createMutation = api.lecturers.create.useMutation({
    onSuccess: () => {
      utils.lecturers.list.invalidate();
      onOpenChange(false);
      toast({
        title: 'Lecturer created',
        description: 'The lecturer has been added successfully.',
      });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = api.lecturers.update.useMutation({
    onSuccess: () => {
      utils.lecturers.list.invalidate();
      onOpenChange(false);
      toast({
        title: 'Lecturer updated',
        description: 'The lecturer has been updated successfully.',
      });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(values: LecturerFormValues) {
    if (isEditing && defaultValues) {
      updateMutation.mutate({
        id: defaultValues.id,
        data: {
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
        },
      });
    } else {
      createMutation.mutate({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Lecturer' : 'Add Lecturer'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the lecturer details below.'
              : 'Fill in the details to add a new lecturer.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Jane" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Smith" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="jane.smith@university.edu" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Save Changes' : 'Add Lecturer'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
